import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

let currentSeparationTab = 'all'; // 'all', 'in_separation', 'completed'
let currentFilterMode = 'all'; // 'all', 'day', 'range'
let selectedFilterDate = new Date().toISOString().split('T')[0];
let selectedStartDate = new Date().toISOString().split('T')[0];
let selectedEndDate = new Date().toISOString().split('T')[0];

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
        <div class="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-border-subtle shadow-sm">
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
        </div>

        <div id="sep-date-controls" class="flex items-center gap-3 flex-wrap">
          <!-- Renderizado dinamicamente -->
        </div>
      </div>

      <div id="separation-list-container"></div>
    </div>
  `;

  setupTabListeners(container);
  setupFilterControls();
  loadSeparationPortions();
}

function setupFilterControls() {
  const btnAll = document.getElementById('sep-filter-all');
  const btnDay = document.getElementById('sep-filter-day');
  const btnRange = document.getElementById('sep-filter-range');
  const dateControls = document.getElementById('sep-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;

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

  updateModeUI();
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
      production_orders (order_code, production_date),
      portion_ingredient_lines (
        id, requested_quantity, separated_quantity, unit, ingredient_lot, status, variance_reason,
        ingredients (name),
        collaborators (full_name)
      )
    `)
    .order('portion_no', { ascending: true });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar porções para separação: ${error.message}</div>`;
    return;
  }

  // Filtrar porções por data da OP conforme currentFilterMode
  let dateFilteredPortions = portions || [];
  if (currentFilterMode === 'day' && selectedFilterDate) {
    dateFilteredPortions = dateFilteredPortions.filter(p => p.production_orders?.production_date === selectedFilterDate);
  } else if (currentFilterMode === 'range' && selectedStartDate && selectedEndDate) {
    dateFilteredPortions = dateFilteredPortions.filter(p => {
      const pDate = p.production_orders?.production_date;
      return pDate && pDate >= selectedStartDate && pDate <= selectedEndDate;
    });
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
    const filterText = currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
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
