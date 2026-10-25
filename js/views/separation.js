import { supabase } from '../supabaseClient.js';
import { opButtonClass, buildOpOptions, resolveSelectedOp, opSelectHtml, refreshOpSelect } from './opFilter.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';
import { buildBaseBatches, MIXER_MAX_KG } from './seasoningBatches.js';

let currentView = 'kits'; // 'kits' (Kits por Porção) ou 'temperos' (Bateladas de Massa-Base)
let currentSeparationTab = 'all'; // 'all', 'in_separation', 'completed'
let currentFilterMode = 'all'; // 'all', 'day', 'range' ou 'op' (Por Ordem de Produção)
let selectedOrderId = null;
let opOptions = [];
let selectedFilterDate = new Date().toISOString().split('T')[0];
let selectedStartDate = new Date().toISOString().split('T')[0];
let selectedEndDate = new Date().toISOString().split('T')[0];

// Abre a tela já em "Bateladas de Massa-Base" filtrada pela OP (usado pelo Planejamento)
export function showSeasoningForOrder(orderId) {
  currentView = 'temperos';
  currentFilterMode = 'op';
  selectedOrderId = orderId;
}

const viewBtnClass = active => `px-4 py-2 rounded-lg font-label-md text-label-md transition-colors flex items-center gap-1.5 ${active ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}`;

export async function render(container) {
  const today = new Date().toISOString().split('T')[0];
  if (!selectedFilterDate) selectedFilterDate = today;
  if (!selectedStartDate) selectedStartDate = today;
  if (!selectedEndDate) selectedEndDate = today;

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Separação de Insumos e Especiarias</h1>
          <p class="font-body-md text-body-md text-text-muted">Kits de insumos fracionados por lote total por sabor, conferência de pesagem na balança e registro de lotes/divergências.</p>
        </div>

        <!-- Filtros de Status de Separação -->
        <div id="sep-status-tabs" class="${currentView === 'kits' ? '' : 'hidden '}flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-border-subtle shadow-sm">
          <button id="sep-tab-all" class="sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentSeparationTab === 'all' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Todos
          </button>
          <button id="sep-tab-in_separation" class="sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentSeparationTab === 'in_separation' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Em Separação
          </button>
          <button id="sep-tab-completed" class="sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentSeparationTab === 'completed' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Concluído
          </button>
        </div>
      </div>

      <!-- Visão: Kits por Porção ou Bateladas de Massa-Base da mexedeira -->
      <div class="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-border-subtle shadow-sm self-start">
        <button id="sep-view-kits" class="${viewBtnClass(currentView === 'kits')}">
          <span class="material-symbols-outlined text-[18px]">scale</span>
          <span>Kits por Porção</span>
        </button>
        <button id="sep-view-temperos" class="${viewBtnClass(currentView === 'temperos')}">
          <span class="material-symbols-outlined text-[18px]">blender</span>
          <span>Bateladas de Massa-Base (mexedeira ${MIXER_MAX_KG} kg)</span>
        </button>
      </div>

      <!-- Barra de Filtros de Período / Dia (Igual à Visão Geral) -->
      <div class="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-label-md text-text-muted flex items-center gap-1 mr-1">
            <span class="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Filtrar Separações:</span>
          </span>
          <button id="sep-filter-all" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Visão Geral
          </button>
          <button id="sep-filter-day" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Dia
          </button>
          <button id="sep-filter-range" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Período / Semana
          </button>
          <button id="sep-filter-op" class="${opButtonClass(currentFilterMode === 'op')}">
            Por Ordem de Produção
          </button>
        </div>

        <div id="sep-date-controls" class="flex items-center gap-3 flex-wrap">
          <!-- Renderizado dinamicamente -->
        </div>
      </div>

      <div id="separation-list-container"></div>
    </div>
  `;

  setupViewToggle(container);
  setupTabListeners(container);
  setupFilterControls();
  loadSeparationPortions();
}

function setupFilterControls() {
  const btnAll = document.getElementById('sep-filter-all');
  const btnDay = document.getElementById('sep-filter-day');
  const btnRange = document.getElementById('sep-filter-range');
  const btnOp = document.getElementById('sep-filter-op');
  const dateControls = document.getElementById('sep-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnOp) btnOp.className = opButtonClass(currentFilterMode === 'op');

    if (currentFilterMode === 'all') {
      dateControls.innerHTML = `<span class="text-xs font-bold text-text-muted bg-surface-canvas px-3 py-1.5 rounded-lg">Exibindo todos os kits de separação</span>`;
    } else if (currentFilterMode === 'day') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2">
          <label for="sep-single-date" class="text-xs font-bold text-ink-text">Data de Produção:</label>
          <input type="date" id="sep-single-date" value="${selectedFilterDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
      `;
      document.getElementById('sep-single-date')?.addEventListener('change', (e) => {
        selectedFilterDate = e.target.value;
        loadSeparationPortions();
      });
    } else if (currentFilterMode === 'op') {
      dateControls.innerHTML = opSelectHtml('sep-op-select', opOptions, selectedOrderId);
      document.getElementById('sep-op-select')?.addEventListener('change', (e) => {
        selectedOrderId = e.target.value;
        loadSeparationPortions();
      });
    } else if (currentFilterMode === 'range') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1">
            <label for="sep-start-date" class="text-xs font-bold text-ink-text">De:</label>
            <input type="date" id="sep-start-date" value="${selectedStartDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
          <div class="flex items-center gap-1">
            <label for="sep-end-date" class="text-xs font-bold text-ink-text">Até:</label>
            <input type="date" id="sep-end-date" value="${selectedEndDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
        </div>
      `;
      document.getElementById('sep-start-date')?.addEventListener('change', (e) => {
        selectedStartDate = e.target.value;
        loadSeparationPortions();
      });
      document.getElementById('sep-end-date')?.addEventListener('change', (e) => {
        selectedEndDate = e.target.value;
        loadSeparationPortions();
      });
    }
  };

  btnAll?.addEventListener('click', () => {
    currentFilterMode = 'all';
    updateModeUI();
    loadSeparationPortions();
  });

  btnDay?.addEventListener('click', () => {
    currentFilterMode = 'day';
    updateModeUI();
    loadSeparationPortions();
  });

  btnRange?.addEventListener('click', () => {
    currentFilterMode = 'range';
    updateModeUI();
    loadSeparationPortions();
  });

  btnOp?.addEventListener('click', () => {
    currentFilterMode = 'op';
    updateModeUI();
    loadSeparationPortions();
  });

  updateModeUI();
}

function setupViewToggle(container) {
  const btnKits = container.querySelector('#sep-view-kits');
  const btnTemperos = container.querySelector('#sep-view-temperos');
  const statusTabs = container.querySelector('#sep-status-tabs');

  const setView = (view) => {
    currentView = view;
    if (btnKits) btnKits.className = viewBtnClass(view === 'kits');
    if (btnTemperos) btnTemperos.className = viewBtnClass(view === 'temperos');
    statusTabs?.classList.toggle('hidden', view !== 'kits');
    loadSeparationPortions();
  };

  btnKits?.addEventListener('click', () => setView('kits'));
  btnTemperos?.addEventListener('click', () => setView('temperos'));
}

function setupTabListeners(container) {
  const tabAll = container.querySelector('#sep-tab-all');
  const tabInSeparation = container.querySelector('#sep-tab-in_separation');
  const tabCompleted = container.querySelector('#sep-tab-completed');

  const updateTabStyles = (activeBtn) => {
    [tabAll, tabInSeparation, tabCompleted].forEach(btn => {
      if (btn === activeBtn) {
        btn.className = 'sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors bg-bordeaux-primary text-on-primary font-bold shadow-sm';
      } else {
        btn.className = 'sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors text-text-muted hover:text-ink-text';
      }
    });
  };

  tabAll?.addEventListener('click', () => {
    currentSeparationTab = 'all';
    updateTabStyles(tabAll);
    loadSeparationPortions();
  });

  tabInSeparation?.addEventListener('click', () => {
    currentSeparationTab = 'in_separation';
    updateTabStyles(tabInSeparation);
    loadSeparationPortions();
  });

  tabCompleted?.addEventListener('click', () => {
    currentSeparationTab = 'completed';
    updateTabStyles(tabCompleted);
    loadSeparationPortions();
  });
}

async function loadSeparationPortions() {
  const container = document.getElementById('separation-list-container');
  if (!container) return;

  const { data: portions, error } = await supabase
    .from('production_portions')
    .select(`
      *,
      flavors (name),
      production_orders (id, order_code, production_date),
      portion_ingredient_lines (
        id, ingredient_id, requested_quantity, separated_quantity, unit, ingredient_lot, status, variance_reason,
        ingredients (name),
        collaborators (full_name)
      )
    `)
    .order('portion_no', { ascending: true });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar porções para separação: ${error.message}</div>`;
    return;
  }

  // Opções do filtro por OP: todas as OPs que têm porções (antes de qualquer filtro)
  opOptions = buildOpOptions((portions || []).map(p => p.production_orders));
  selectedOrderId = resolveSelectedOp(opOptions, selectedOrderId);
  refreshOpSelect('sep-op-select', opOptions, selectedOrderId);

  // Filtrar porções por data da OP conforme currentFilterMode
  let dateFilteredPortions = portions || [];
  if (currentFilterMode === 'op') {
    dateFilteredPortions = dateFilteredPortions.filter(p => p.production_orders?.id === selectedOrderId);
  } else if (currentFilterMode === 'day' && selectedFilterDate) {
    dateFilteredPortions = dateFilteredPortions.filter(p => p.production_orders?.production_date === selectedFilterDate);
  } else if (currentFilterMode === 'range' && selectedStartDate && selectedEndDate) {
    dateFilteredPortions = dateFilteredPortions.filter(p => {
      const pDate = p.production_orders?.production_date;
      return pDate && pDate >= selectedStartDate && pDate <= selectedEndDate;
    });
  }

  if (currentView === 'temperos') {
    await renderSeasoningBatches(container, dateFilteredPortions);
    return;
  }

  // Mapear e calcular estado de cada porção
  let filteredPortions = dateFilteredPortions.map(p => {
    const lines = p.portion_ingredient_lines || [];
    const isAllSeparated = lines.length > 0 && lines.every(l => l.status === 'separated' || l.status === 'adjusted');
    return {
      ...p,
      isAllSeparated
    };
  });

  // Filtrar de acordo com a aba selecionada
  if (currentSeparationTab === 'in_separation') {
    filteredPortions = filteredPortions.filter(p => !p.isAllSeparated);
  } else if (currentSeparationTab === 'completed') {
    filteredPortions = filteredPortions.filter(p => p.isAllSeparated);
  }

  if (filteredPortions.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'op' ? ' para a ordem de produção selecionada' :
                       currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
                       currentFilterMode === 'range' ? ` para o período de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` : '';
    container.appendChild(renderEmptyState({
      icon: 'scale',
      title: 'Nenhuma Ordem de Separação Encontrada',
      description: `Não há kits de separação correspondentes ao filtro selecionado${filterText}.`,
      actionText: null
    }));
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${filteredPortions.map(p => {
        const lines = p.portion_ingredient_lines || [];
        const isAllSeparated = p.isAllSeparated;

        return `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                <div>
                  <span class="text-xs font-bold text-text-muted uppercase">${p.production_orders?.order_code} • ${formatDate(p.production_orders?.production_date)}</span>
                  <h3 class="font-headline-sm text-ink-text">${p.flavors?.name} — Porção #${p.portion_no}</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                  isAllSeparated ? 'bg-surface-container-low text-status-success' : 'bg-badge-warning-bg text-badge-warning-text'
                }">
                  ${isAllSeparated ? 'Kit Separado ✓' : 'Separação Pendente'}
                </span>
              </div>

              <div class="flex items-center justify-between text-xs font-bold text-text-muted">
                <span>Peso Pretendido da Porção: ${formatWeight(p.planned_kg)}</span>
                <span>Itens: ${lines.length}</span>
              </div>

              <div class="flex flex-col gap-2 mt-2">
                ${lines.map(l => `
                  <div class="p-3 bg-surface-canvas rounded-lg flex flex-col gap-2 text-xs border border-border-subtle">
                    <div class="flex items-center justify-between font-bold text-ink-text">
                      <span>${l.ingredients?.name}</span>
                      <span class="text-bordeaux-primary">${l.requested_quantity} ${l.unit}</span>
                    </div>

                    ${l.status === 'pending' ? `
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center pt-1 border-t border-border-subtle/50">
                        <input type="text" class="line-lot-input px-2 py-1 rounded border border-border-subtle bg-surface-card" placeholder="Lote do Insumo" id="lot-${l.id}">
                        <input type="number" step="0.001" class="line-qty-input px-2 py-1 rounded border border-border-subtle bg-surface-card font-bold" value="${l.requested_quantity}" id="qty-${l.id}">
                        <button class="confirm-separate-btn min-h-[36px] px-3 rounded bg-bordeaux-primary text-on-primary font-bold hover:bg-wine-deep transition-colors" data-id="${l.id}">
                          Confirmar Pesagem
                        </button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-between text-text-muted pt-1 border-t border-border-subtle/50">
                        <span>Separado: <strong>${l.separated_quantity} ${l.unit}</strong> (Lote: ${l.ingredient_lot || '—'})</span>
                        <span class="text-status-success font-bold">Concluído ✓</span>
                      </div>
                    `}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelectorAll('.confirm-separate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const lineId = e.currentTarget.dataset.id;
      const lot = document.getElementById(`lot-${lineId}`)?.value.trim();
      const qty = parseFloat(document.getElementById(`qty-${lineId}`)?.value);

      if (!lot) {
        showNotification('Informe o código do lote do insumo.', 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        showNotification('Informe uma quantidade válida.', 'error');
        return;
      }

      try {
        const { error } = await supabase
          .from('portion_ingredient_lines')
          .update({
            ingredient_lot: lot,
            separated_quantity: qty,
            status: 'separated',
            separated_at: new Date().toISOString()
          })
          .eq('id', lineId);

        if (error) throw error;
        showNotification('Insumo separado e verificado na balança!', 'success');
        loadSeparationPortions();
      } catch (err) {
        showNotification(`Erro ao salvar separação: ${err.message}`, 'error');
      }
    });
  });
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Pesagens confirmadas dos itens das bateladas, por "opId|batelada|item".
// Se a tabela ainda não existir no banco, devolve missingTable para a tela avisar.
async function loadBaseBatchSeparations(orderIds) {
  if (orderIds.length === 0) return { map: new Map(), missingTable: false };
  const { data, error } = await supabase
    .from('base_batch_item_separations')
    .select('id, production_order_id, batch_no, item_name, separated_kg, lot_code, separated_at')
    .in('production_order_id', orderIds);
  if (error) {
    const missingTable = error.code === '42P01' || error.code === 'PGRST205' || /base_batch_item_separations/.test(error.message || '');
    if (!missingTable) showNotification(`Erro ao carregar pesagens das bateladas: ${error.message}`, 'error');
    return { map: new Map(), missingTable };
  }
  return { map: new Map((data || []).map(r => [`${r.production_order_id}|${r.batch_no}|${r.item_name}`, r])), missingTable: false };
}

function batchItemRow(g, b, item, kind, sep, canConfirm) {
  const key = `${g.key}|${b.batchNo}|${item.name}`;
  const nameClass = kind === 'carne' ? 'font-bold text-bordeaux-primary' : 'text-ink-text';
  if (sep) {
    return `
      <div class="py-1.5 flex flex-col gap-0.5">
        <div class="flex items-center justify-between">
          <span class="${nameClass}">${esc(item.name)}</span>
          <span class="font-bold text-ink-text">${formatWeight(item.kg)}</span>
        </div>
        <div class="flex items-center justify-between text-text-muted">
          <span>Separado: <strong class="text-ink-text">${formatWeight(sep.separated_kg)}</strong> • Lote: <strong class="text-ink-text">${esc(sep.lot_code)}</strong></span>
          <span class="flex items-center gap-2">
            <span class="text-status-success font-bold">✓</span>
            <button class="undo-batch-item-btn text-[11px] font-bold text-text-muted hover:text-alert-critical hover:underline" data-sep-id="${esc(sep.id)}">Desfazer</button>
          </span>
        </div>
      </div>`;
  }
  return `
    <div class="py-1.5 flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <span class="${nameClass}">${esc(item.name)}</span>
        <span class="font-bold text-ink-text">${formatWeight(item.kg)}</span>
      </div>
      ${canConfirm ? `
        <div class="grid grid-cols-3 gap-1.5 items-center">
          <input type="text" class="batch-lot-input px-2 py-1 rounded border border-border-subtle bg-surface-card" placeholder="Lote">
          <input type="number" step="0.001" min="0.001" class="batch-qty-input px-2 py-1 rounded border border-border-subtle bg-surface-card font-bold" value="${item.kg}">
          <button class="confirm-batch-item-btn min-h-[32px] px-2 rounded bg-bordeaux-primary text-on-primary font-bold hover:bg-wine-deep transition-colors"
            data-order-id="${esc(g.key)}" data-batch-no="${b.batchNo}" data-item-name="${esc(item.name)}" data-item-kind="${kind}" data-requested="${item.kg}" data-key="${esc(key)}">
            Confirmar
          </button>
        </div>
      ` : ''}
    </div>`;
}

async function renderSeasoningBatches(container, portions) {
  const groups = buildBaseBatches(portions);

  if (groups.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'op' ? ' para a ordem de produção selecionada' :
                       currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
                       currentFilterMode === 'range' ? ` para o período de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` : '';
    container.appendChild(renderEmptyState({
      icon: 'blender',
      title: 'Nenhuma Batelada de Massa-Base Encontrada',
      description: `Não há porções geradas${filterText}. As bateladas aparecem aqui depois de clicar em "Gerar Ordens de Produção" na tela de Planejamento.`,
      actionText: null
    }));
    return;
  }

  const { map: separations, missingTable } = await loadBaseBatchSeparations(groups.map(g => g.key));
  const canConfirm = !missingTable;

  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="p-3 rounded-lg bg-surface-canvas border border-border-subtle text-xs text-text-muted">
        Todos os produtos da OP formam uma massada total com a mesma massa-base (carne + tempero base), sem depender de cadastro.
        A massada é batida em bateladas cheias de <strong class="text-ink-text">${MIXER_MAX_KG} kg</strong>, a capacidade da mexedeira, e a última fica com o restante.
        Confirme a pesagem e o lote de cada item; os insumos de cada sabor entram depois, nos kits por porção.
      </div>
      ${missingTable ? `
        <div class="p-3 rounded-lg bg-badge-warning-bg text-badge-warning-text text-xs font-bold">
          A confirmação de pesagem e lote ainda não está ativa: rode o arquivo migration_base_batch_separations.sql no SQL Editor do Supabase.
        </div>
      ` : ''}
      ${groups.map(g => `
        <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col gap-space-md">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
            <div>
              <span class="text-xs font-bold text-text-muted uppercase">${formatDate(g.order?.production_date)}</span>
              <h3 class="font-headline-sm text-ink-text">${esc(g.order?.order_code || 'OP')} — Massada Total</h3>
              <span class="text-xs text-text-muted">${g.flavors.map(f => `${esc(f.name)} (${formatWeight(f.kg)})`).join(' • ')}</span>
            </div>
            <div class="flex items-center gap-2 text-xs font-bold">
              <span class="px-2.5 py-1 rounded-full bg-surface-canvas text-ink-text">Massa-base total: ${formatWeight(g.totalKg)}</span>
              <span class="px-2.5 py-1 rounded-full bg-badge-warning-bg text-badge-warning-text">${g.batches.length} batelada${g.batches.length > 1 ? 's' : ''}</span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-sm">
            ${g.batches.map(b => {
              const items = [...b.meat.map(m => ({ item: m, kind: 'carne' })), ...b.seasonings.map(t => ({ item: t, kind: 'tempero' }))];
              const sepOf = it => separations.get(`${g.key}|${b.batchNo}|${it.name}`);
              const doneCount = items.filter(({ item }) => sepOf(item)).length;
              const allDone = doneCount === items.length;
              return `
              <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex flex-col gap-2 text-xs">
                <div class="flex items-center justify-between font-bold text-ink-text">
                  <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[18px] text-bordeaux-primary">blender</span> Batelada ${b.batchNo} de ${g.batches.length}</span>
                  <span class="text-bordeaux-primary">${formatWeight(b.totalKg)}</span>
                </div>
                <span class="self-start px-2 py-0.5 rounded-full font-bold ${allDone ? 'bg-surface-container-low text-status-success' : 'bg-badge-warning-bg text-badge-warning-text'}">
                  ${allDone ? 'Batelada separada ✓' : `Separados: ${doneCount} de ${items.length}`}
                </span>
                <div class="flex flex-col divide-y divide-border-subtle/50">
                  ${items.map(({ item, kind }) => batchItemRow(g, b, item, kind, sepOf(item), canConfirm)).join('')}
                </div>
                <div class="flex items-center justify-between text-text-muted border-t border-border-subtle pt-1">
                  <span>Carne: <strong class="text-ink-text">${formatWeight(b.meatKg)}</strong></span>
                  <span>Tempero: <strong class="text-ink-text">${formatWeight(b.seasoningKg)}</strong></span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.confirm-batch-item-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      const row = button.parentElement;
      const lot = row.querySelector('.batch-lot-input')?.value.trim();
      const qty = parseFloat(row.querySelector('.batch-qty-input')?.value);

      if (!lot) {
        showNotification('Informe o lote do item.', 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        showNotification('Informe uma quantidade pesada válida.', 'error');
        return;
      }

      button.disabled = true;
      try {
        const { error } = await supabase.from('base_batch_item_separations').insert({
          production_order_id: button.dataset.orderId,
          batch_no: Number(button.dataset.batchNo),
          item_name: button.dataset.itemName,
          item_kind: button.dataset.itemKind,
          requested_kg: Number(button.dataset.requested),
          separated_kg: qty,
          lot_code: lot
        });
        if (error) throw error;
        showNotification('Pesagem e lote confirmados!', 'success');
        loadSeparationPortions();
      } catch (err) {
        button.disabled = false;
        showNotification(`Erro ao confirmar pesagem: ${err.message}`, 'error');
      }
    });
  });

  container.querySelectorAll('.undo-batch-item-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      const { error } = await supabase.from('base_batch_item_separations').delete().eq('id', button.dataset.sepId);
      if (error) {
        button.disabled = false;
        showNotification(`Erro ao desfazer pesagem: ${error.message}`, 'error');
        return;
      }
      showNotification('Pesagem desfeita. Pese o item novamente.', 'success');
      loadSeparationPortions();
    });
  });
}
