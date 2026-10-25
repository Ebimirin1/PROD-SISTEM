import { supabase } from '../supabaseClient.js';
import { opButtonClass, buildOpOptions, resolveSelectedOp, opSelectHtml, refreshOpSelect } from './opFilter.js';
import { showNotification, renderEmptyState, formatWeight, formatDateTime, formatDate } from '../utils.js';

let currentFilterMode = 'op'; // 'op' (Por Ordem de Produção, padrão: OP mais recente), 'all', 'day' ou 'range'
let selectedOrderId = null;
let opOptions = [];
let selectedFilterDate = new Date().toISOString().split('T')[0];
let selectedStartDate = new Date().toISOString().split('T')[0];
let selectedEndDate = new Date().toISOString().split('T')[0];

// Módulo de Contagem e Controle de Rótulos (2.5 rótulos por kg / ~420g por unidade)
export async function render(container) {
  const today = new Date().toISOString().split('T')[0];
  if (!selectedFilterDate) selectedFilterDate = today;
  if (!selectedStartDate) selectedStartDate = today;
  if (!selectedEndDate) selectedEndDate = today;

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <div class="flex flex-wrap items-center justify-between gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[28px]">label</span>
            <h1 class="font-display-lg text-display-lg text-ink-text">Contagem e Aplicação de Rótulos</h1>
          </div>
          <p class="font-body-md text-body-md text-text-muted mt-1">Cálculo automático de rótulos por porção e sabor baseado no peso estipulado (proporção nominal de 2,5 rótulos/kg • ~420g por pacote).</p>
        </div>

        <div class="flex items-center gap-2 bg-surface-canvas p-2 rounded-lg border border-border-subtle">
          <span class="material-symbols-outlined text-status-info text-[20px]">info</span>
          <span class="text-xs font-bold text-ink-text">Regra de Rótulos: Granel = 1 rótulo a cada 10 kg • Demais Produtos = 2,5 rótulos / kg (~420g por pacote)</span>
        </div>
      </div>

      <!-- Barra de Filtros de Período / Dia (Igual à Visão Geral) -->
      <div class="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-label-md text-text-muted flex items-center gap-1 mr-1">
            <span class="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Filtrar Rótulos:</span>
          </span>
          <button id="lbl-filter-all" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Visão Geral
          </button>
          <button id="lbl-filter-day" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Dia
          </button>
          <button id="lbl-filter-range" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Período / Semana
          </button>
          <button id="lbl-filter-op" class="${opButtonClass(currentFilterMode === 'op')}">
            Por Ordem de Produção
          </button>
        </div>

        <div id="lbl-date-controls" class="flex items-center gap-3 flex-wrap">
          <!-- Renderizado dinamicamente -->
        </div>
      </div>

      <div id="labeling-list-container"></div>
    </div>
  `;

  setupFilterControls();
  loadLabelingRuns();
}

function setupFilterControls() {
  const btnAll = document.getElementById('lbl-filter-all');
  const btnDay = document.getElementById('lbl-filter-day');
  const btnRange = document.getElementById('lbl-filter-range');
  const btnOp = document.getElementById('lbl-filter-op');
  const dateControls = document.getElementById('lbl-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnOp) btnOp.className = opButtonClass(currentFilterMode === 'op');

    if (currentFilterMode === 'all') {
      dateControls.innerHTML = `<span class="text-xs font-bold text-text-muted bg-surface-canvas px-3 py-1.5 rounded-lg">Exibindo todas as porções de rótulos</span>`;
    } else if (currentFilterMode === 'day') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2">
          <label for="lbl-single-date" class="text-xs font-bold text-ink-text">Data de Produção:</label>
          <input type="date" id="lbl-single-date" value="${selectedFilterDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
      `;
      document.getElementById('lbl-single-date')?.addEventListener('change', (e) => {
        selectedFilterDate = e.target.value;
        loadLabelingRuns();
      });
    } else if (currentFilterMode === 'op') {
      dateControls.innerHTML = opSelectHtml('lbl-op-select', opOptions, selectedOrderId);
      document.getElementById('lbl-op-select')?.addEventListener('change', (e) => {
        selectedOrderId = e.target.value;
        loadLabelingRuns();
      });
    } else if (currentFilterMode === 'range') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1">
            <label for="lbl-start-date" class="text-xs font-bold text-ink-text">De:</label>
            <input type="date" id="lbl-start-date" value="${selectedStartDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
          <div class="flex items-center gap-1">
            <label for="lbl-end-date" class="text-xs font-bold text-ink-text">Até:</label>
            <input type="date" id="lbl-end-date" value="${selectedEndDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
        </div>
      `;
      document.getElementById('lbl-start-date')?.addEventListener('change', (e) => {
        selectedStartDate = e.target.value;
        loadLabelingRuns();
      });
      document.getElementById('lbl-end-date')?.addEventListener('change', (e) => {
        selectedEndDate = e.target.value;
        loadLabelingRuns();
      });
    }
  };

  btnAll?.addEventListener('click', () => {
    currentFilterMode = 'all';
    updateModeUI();
    loadLabelingRuns();
  });

  btnDay?.addEventListener('click', () => {
    currentFilterMode = 'day';
    updateModeUI();
    loadLabelingRuns();
  });

  btnRange?.addEventListener('click', () => {
    currentFilterMode = 'range';
    updateModeUI();
    loadLabelingRuns();
  });

  btnOp?.addEventListener('click', () => {
    currentFilterMode = 'op';
    updateModeUI();
    loadLabelingRuns();
  });

  updateModeUI();
}

async function loadLabelingRuns() {
  const container = document.getElementById('labeling-list-container');
  if (!container) return;

  const { data: portions, error } = await supabase
    .from('production_portions')
    .select(`
      id,
      flavor_id,
      portion_no,
      planned_kg,
      product_type,
      conservation,
      flavors (id, name),
      production_orders (
        id, order_code, production_date,
        production_demands (flavor_id, requested_product_type, requested_conservation)
      ),
      process_runs (
        id, stage, status, started_at, completed_at, actual_kg
      )
    `)
    .order('portion_no', { ascending: true });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar dados de rotulagem: ${error.message}</div>`;
    return;
  }

  // Opções do filtro por OP: todas as OPs que têm porções (antes de qualquer filtro)
  opOptions = buildOpOptions((portions || []).map(p => p.production_orders));
  // Sem nenhuma OP, o filtro padrão por OP não tem o que mostrar: volta para Visão Geral
  if (currentFilterMode === 'op' && !opOptions.length) {
    document.getElementById('lbl-filter-all')?.click();
    return;
  }
  selectedOrderId = resolveSelectedOp(opOptions, selectedOrderId);
  refreshOpSelect('lbl-op-select', opOptions, selectedOrderId);

  // Filtrar porções por data da OP conforme currentFilterMode
  let filteredPortions = portions || [];
  if (currentFilterMode === 'op') {
    filteredPortions = filteredPortions.filter(p => p.production_orders?.id === selectedOrderId);
  } else if (currentFilterMode === 'day' && selectedFilterDate) {
    filteredPortions = filteredPortions.filter(p => p.production_orders?.production_date === selectedFilterDate);
  } else if (currentFilterMode === 'range' && selectedStartDate && selectedEndDate) {
    filteredPortions = filteredPortions.filter(p => {
      const pDate = p.production_orders?.production_date;
      return pDate && pDate >= selectedStartDate && pDate <= selectedEndDate;
    });
  }

  if (filteredPortions.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'op' ? ' para a ordem de produção selecionada' :
                       currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
                       currentFilterMode === 'range' ? ` para o período de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` : '';
    container.appendChild(renderEmptyState({
      icon: 'label',
      title: 'Nenhuma Porção com Rótulos Mapeada',
      description: `Não há porções de rótulos encontradas${filterText}. Selecione outro filtro ou crie OPs no Planejamento.`,
      actionText: null
    }));
    return;
  }

  const { data: collaborators } = await supabase.from('collaborators').select('id, full_name').eq('active', true);

  // Calcular estatísticas agregadas de rótulos (Resfriados, Congelados e por Produto)
  let totalLabels = 0;
  let totalResfriadosLabels = 0;
  let totalCongeladosLabels = 0;
  const productTypeTotals = {};

  filteredPortions.forEach(p => {
    const runs = p.process_runs || [];
    const vacuoRun = runs.find(r => r.stage === 'vacuo');
    const baseKg = (vacuoRun && vacuoRun.actual_kg) ? Number(vacuoRun.actual_kg) : Number(p.planned_kg || 0);

    const demands = p.production_orders?.production_demands || [];
    const matchingDemand = demands.find(d => d.flavor_id === p.flavor_id) || demands[0] || {};
    // O tipo gravado na porção vale mais que a demanda (o sabor pode ter vários tipos na OP)
    const productType = p.product_type || matchingDemand.requested_product_type || 'linguica';
    const conservation = p.conservation || matchingDemand.requested_conservation || 'resfriado';

    const calculatedLabels = productType === 'granel' ? Math.ceil(baseKg / 10) : Math.round(baseKg * 2.5);

    totalLabels += calculatedLabels;
    if (conservation === 'congelado') {
      totalCongeladosLabels += calculatedLabels;
    } else {
      totalResfriadosLabels += calculatedLabels;
    }

    productTypeTotals[productType] = (productTypeTotals[productType] || 0) + calculatedLabels;
  });

  container.innerHTML = `
    <!-- Cards de Resumo e Identificação de Rótulos -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-4">
      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col justify-between">
        <span class="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
          <span class="material-symbols-outlined text-bordeaux-primary text-[18px]">label</span>
          Total de Rótulos
        </span>
        <span class="font-tabular-data-lg text-headline-md font-bold text-ink-text mt-1">${totalLabels} <span class="text-xs font-normal text-text-muted">unidades</span></span>
      </div>

      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col justify-between">
        <span class="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
          <span class="material-symbols-outlined text-emerald-600 text-[18px]">ac_unit</span>
          Rótulos Resfriados
        </span>
        <span class="font-tabular-data-lg text-headline-md font-bold text-emerald-700 mt-1">${totalResfriadosLabels} <span class="text-xs font-normal text-text-muted">unidades</span></span>
      </div>

      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col justify-between">
        <span class="text-xs font-bold text-blue-800 uppercase flex items-center gap-1">
          <span class="material-symbols-outlined text-blue-600 text-[18px]">severe_cold</span>
          Rótulos Congelados
        </span>
        <span class="font-tabular-data-lg text-headline-md font-bold text-blue-700 mt-1">${totalCongeladosLabels} <span class="text-xs font-normal text-text-muted">unidades</span></span>
      </div>

      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col justify-between">
        <span class="text-xs font-bold text-text-muted uppercase flex items-center gap-1">
          <span class="material-symbols-outlined text-bordeaux-primary text-[18px]">category</span>
          Por Tipo de Produto
        </span>
        <div class="flex flex-wrap gap-1 mt-1 text-xs font-bold text-ink-text">
          ${Object.entries(productTypeTotals).map(([type, qty]) => `
            <span class="px-2 py-0.5 rounded bg-surface-canvas border border-border-subtle capitalize">${type}: ${qty}un</span>
          `).join('') || '<span class="text-text-muted font-normal">Nenhum</span>'}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${filteredPortions.map(p => {
        const runs = p.process_runs || [];
        const vacuoRun = runs.find(r => r.stage === 'vacuo');
        const rotulagemRun = runs.find(r => r.stage === 'rotulagem');

        const baseKg = (vacuoRun && vacuoRun.actual_kg) ? Number(vacuoRun.actual_kg) : Number(p.planned_kg || 0);

        const demands = p.production_orders?.production_demands || [];
        const matchingDemand = demands.find(d => d.flavor_id === p.flavor_id) || demands[0] || {};
        const productType = p.product_type || matchingDemand.requested_product_type || 'linguica';
        const conservation = p.conservation || matchingDemand.requested_conservation || 'resfriado';
        const isCongelado = conservation === 'congelado';

        const isGranel = productType === 'granel';
        const calculatedLabels = isGranel ? Math.ceil(baseKg / 10) : Math.round(baseKg * 2.5);
        const packageInfoLabel = isGranel ? 'Embalagem (10 kg)' : 'Qtd Pacotes (~420g)';
        const packageQtyDisplay = isGranel ? `${calculatedLabels} caixas (10kg)` : `${calculatedLabels} un`;

        const isRotulagemCompleted = rotulagemRun?.status === 'completed';
        const isRotulagemInProgress = rotulagemRun?.status === 'in_progress';

        return `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-text-muted uppercase">${p.production_orders?.order_code || 'OP'} • ${formatDate(p.production_orders?.production_date)}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-canvas border border-border-subtle text-ink-text">${productType}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isCongelado ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }">${conservation}</span>
                  </div>
                  <h3 class="font-headline-sm text-ink-text mt-1">${p.flavors?.name} — Porção #${p.portion_no}</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                  isRotulagemCompleted ? 'bg-surface-container-low text-status-success' :
                  isRotulagemInProgress ? 'bg-badge-warning-bg text-badge-warning-text animate-pulse' :
                  'bg-surface-canvas text-text-muted'
                }">
                  ${isRotulagemCompleted ? 'Rotulagem Concluída ✓' : isRotulagemInProgress ? 'Em Rotulagem' : 'Pendente'}
                </span>
              </div>

              <!-- Indicadores de Rótulos -->
              <div class="grid grid-cols-3 gap-2 bg-surface-canvas p-3 rounded-lg border border-border-subtle text-xs my-1">
                <div class="flex flex-col">
                  <span class="text-text-muted font-bold">Carga Estipulada</span>
                  <span class="font-tabular-data-lg text-title-md font-bold text-ink-text">${formatWeight(baseKg)}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-text-muted font-bold">${packageInfoLabel}</span>
                  <span class="font-tabular-data-lg text-title-md font-bold text-bordeaux-primary">${packageQtyDisplay}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-text-muted font-bold">Rótulos Calculados</span>
                  <span class="font-tabular-data-lg text-title-md font-bold text-status-success">${calculatedLabels} rótulos</span>
                </div>
              </div>

              <!-- Controles de Ação de Rotulagem -->
              ${isRotulagemCompleted ? `
                <div class="p-3 rounded-lg bg-surface-container-low text-status-success text-xs font-bold border border-border-subtle flex items-center justify-between">
                  <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-[18px]">check_circle</span>
                    Lote de ${calculatedLabels} rótulos conferido e preparado.
                  </span>
                  <span class="text-[11px] font-normal text-text-muted">${formatDateTime(rotulagemRun?.completed_at)}</span>
                </div>
              ` : `
                <div class="flex flex-col gap-2 p-3 bg-surface-canvas rounded-lg border border-border-subtle text-xs">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-ink-text">Conferir e Preparar Embalagem / Rótulos:</span>
                    <span class="text-status-success font-bold">${calculatedLabels} Rótulos</span>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 mt-1">
                    <select id="collab-rot-${rotulagemRun?.id || p.id}" class="flex-1 min-w-[180px] px-2.5 py-1.5 rounded border border-border-subtle bg-surface-card text-xs font-bold">
                      <option value="">Selecione o Operador de Embalagem</option>
                      ${(collaborators || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('')}
                    </select>

                    <button class="confirm-rotulagem-btn shrink-0 px-4 py-1.5 rounded bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-bold transition-colors" data-runid="${rotulagemRun?.id}" data-basekg="${baseKg}">
                      Confirmar Rótulos
                    </button>
                  </div>
                </div>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelectorAll('.confirm-rotulagem-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const runId = e.currentTarget.dataset.runid;
      const baseKg = parseFloat(e.currentTarget.dataset.basekg);

      if (!runId || runId === 'undefined') {
        showNotification('Execução do processo de rotulagem não encontrada.', 'error');
        return;
      }

      try {
        const nowIso = new Date().toISOString();
        const collabId = document.getElementById(`collab-rot-${runId}`)?.value;

        const { data: currentRun } = await supabase
          .from('process_runs')
          .select('started_at')
          .eq('id', runId)
          .maybeSingle();

        const startedAt = currentRun?.started_at || nowIso;

        const { error } = await supabase
          .from('process_runs')
          .update({
            status: 'completed',
            started_at: startedAt,
            completed_at: nowIso,
            actual_kg: baseKg
          })
          .eq('id', runId);

        if (error) throw error;

        if (collabId) {
          await supabase.from('process_run_collaborators').upsert({
            process_run_id: runId,
            collaborator_id: collabId
          });
        }

        showNotification('Contagem e aplicação de rótulos confirmadas com sucesso!', 'success');
        loadLabelingRuns();
      } catch (err) {
        showNotification(`Erro ao confirmar rotulagem: ${err.message}`, 'error');
      }
    });
  });
}
