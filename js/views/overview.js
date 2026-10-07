import { supabase } from '../supabaseClient.js';
import { renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Visão Geral (Monitor Operacional Diário / Bento Grid)
function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: getLocalDateString(monday),
    end: getLocalDateString(sunday)
  };
}

let currentFilterMode = 'all'; // 'all' (Visão Geral), 'day' (Por Dia) ou 'range' (Por Período / Semana)
let currentSelectedDate = getLocalDateString();  // YYYY-MM-DD (Padrão: Data Local Hoje)
const defaultWeekRange = getDefaultWeekRange();
let currentStartDate = defaultWeekRange.start;
let currentEndDate = defaultWeekRange.end;

// Estado do Modal de Estoque por Sabor
let modalAllFlavors = [];
let modalInventoryLots = [];
let modalActiveTab = 'all'; // 'all', 'produced', 'unproduced'
let modalSearchQuery = '';

// Estado do Modal de Produção por Sabor (Quantidade Solicitada x Real & Status)
let modalProductionDemands = [];
let modalProductionPortions = [];
let modalProdActiveTab = 'all'; // 'all', 'completed', 'in_progress', 'pending'
let modalProdSearchQuery = '';

export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <!-- Top Action Filter & Context Bar -->
      <section class="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-wrap items-center justify-between gap-space-md border border-border-subtle">
        <div class="flex items-center flex-wrap gap-space-md">
          <div class="flex items-center gap-space-xs">
            <span class="material-symbols-outlined text-bordeaux-primary text-[24px]">factory</span>
            <span class="font-title-lg text-title-lg text-ink-text tracking-tight">Monitor Operacional</span>
          </div>

          <div class="h-6 w-px bg-border-subtle hidden md:block"></div>

          <!-- Filtro Modo: Visão Geral, Por Dia vs Por Período / Semana -->
          <div class="flex items-center gap-1 bg-surface-canvas p-1 rounded-lg border border-border-subtle">
            <button id="filter-btn-all" class="px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
              Visão Geral
            </button>
            <button id="filter-btn-day" class="px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
              Por Dia
            </button>
            <button id="filter-btn-range" class="px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
              Por Período / Semana
            </button>
          </div>

          <!-- Seletor de Data Única (Exibido quando no modo Por Dia) -->
          <div id="date-picker-wrapper" class="${currentFilterMode === 'day' ? 'flex' : 'hidden'} items-center gap-2 bg-surface-canvas px-3 py-1.5 rounded-lg border border-border-subtle">
            <label for="overview-date-select" class="font-label-sm text-label-sm text-text-muted uppercase">Data:</label>
            <input type="date" id="overview-date-select" value="${currentSelectedDate}" class="bg-transparent font-title-md text-title-md text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
          </div>

          <!-- Seletor de Período / Semana (Exibido quando no modo Por Período) -->
          <div id="range-picker-wrapper" class="${currentFilterMode === 'range' ? 'flex' : 'hidden'} items-center gap-2 bg-surface-canvas px-3 py-1.5 rounded-lg border border-border-subtle flex-wrap">
            <label for="overview-start-date" class="font-label-sm text-label-sm text-text-muted uppercase">De:</label>
            <input type="date" id="overview-start-date" value="${currentStartDate}" class="bg-transparent font-title-md text-title-md text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
            <label for="overview-end-date" class="font-label-sm text-label-sm text-text-muted uppercase">Até:</label>
            <input type="date" id="overview-end-date" value="${currentEndDate}" class="bg-transparent font-title-md text-title-md text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
          </div>

          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low text-status-success font-label-md text-label-md">
            <span class="w-2.5 h-2.5 rounded-full bg-status-success animate-pulse"></span>
            <span>Regime Nominal • Linhas Ativas</span>
          </div>
        </div>

        <div class="flex items-center gap-space-sm ml-auto">
          <button id="refresh-overview-btn" aria-label="Sincronizar dados" class="min-h-[40px] px-3.5 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md text-title-md flex items-center gap-2 transition-all active:scale-95 shadow-sm border border-border-subtle">
            <span class="material-symbols-outlined text-[18px] text-text-muted" id="refresh-overview-icon">sync</span>
            <span>Atualizar</span>
          </button>
        </div>
      </section>

      <!-- Grid Bento com Indicadores -->
      <div id="overview-metrics-container"></div>

      <!-- Seção de Ordens e Produtos Produzidos Por Dia -->
      <section id="daily-orders-section" class="flex flex-col gap-space-md"></section>

      <!-- Modal: Detalhamento da Produção Total por Sabor (Solicitada x Real & Status) -->
      <div id="production-details-modal" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-space-md">
        <div class="bg-surface-card rounded-2xl shadow-xl border border-border-subtle max-w-4xl w-full max-h-[90vh] flex flex-col p-space-lg gap-space-md overflow-hidden">
          <!-- Header do Modal -->
          <div class="flex items-center justify-between border-b border-border-subtle pb-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-status-success text-[26px]">precision_manufacturing</span>
              <div class="flex flex-col">
                <h2 class="font-headline-sm text-headline-sm text-ink-text font-bold">Produção Total por Sabor</h2>
                <p class="text-xs text-text-muted">Acompanhamento detalhado por sabor: quantidade solicitada vs quantidade real produzida e status da produção.</p>
              </div>
            </div>
            <button id="close-production-modal-btn" class="p-1 rounded-lg hover:bg-surface-canvas text-text-muted hover:text-ink-text transition-colors">
              <span class="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>

          <!-- Controles do Modal: Busca e Filtros de Status -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm bg-surface-canvas p-space-sm rounded-xl border border-border-subtle">
            <div class="relative flex-1">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
              <input type="text" id="production-modal-search" class="w-full pl-9 pr-3 py-2 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Buscar sabor por nome...">
            </div>

            <div class="flex items-center gap-1 bg-surface-card p-1 rounded-lg border border-border-subtle overflow-x-auto">
              <button id="prod-tab-all" class="prod-tab-btn px-3 py-1.5 rounded-md text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm transition-colors">Todos</button>
              <button id="prod-tab-completed" class="prod-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors">Concluídos</button>
              <button id="prod-tab-in_progress" class="prod-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors">Em Produção</button>
              <button id="prod-tab-pending" class="prod-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors">Pendentes</button>
            </div>
          </div>

          <!-- Conteúdo da Lista de Produção por Sabor -->
          <div id="production-modal-list-container" class="overflow-y-auto flex-1 flex flex-col gap-space-sm pr-1"></div>
        </div>
      </div>

      <!-- Modal: Detalhamento do Saldo de Estoque por Sabor (Produzidos vs Não Produzidos) -->
      <div id="stock-details-modal" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-space-md">
        <div class="bg-surface-card rounded-2xl shadow-xl border border-border-subtle max-w-4xl w-full max-h-[90vh] flex flex-col p-space-lg gap-space-md overflow-hidden">
          <!-- Header do Modal -->
          <div class="flex items-center justify-between border-b border-border-subtle pb-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-bordeaux-primary text-[26px]">inventory_2</span>
              <div class="flex flex-col">
                <h2 class="font-headline-sm text-headline-sm text-ink-text font-bold">Relação de Estoque por Sabor</h2>
                <p class="text-xs text-text-muted">Visualização de todos os sabores cadastrados, identificando os produzidos (com saldo em câmara) e não produzidos.</p>
              </div>
            </div>
            <button id="close-stock-modal-btn" class="p-1 rounded-lg hover:bg-surface-canvas text-text-muted hover:text-ink-text transition-colors">
              <span class="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>

          <!-- Controles do Modal: Busca e Filtros -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm bg-surface-canvas p-space-sm rounded-xl border border-border-subtle">
            <div class="relative flex-1">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
              <input type="text" id="stock-modal-search" class="w-full pl-9 pr-3 py-2 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Buscar sabor por nome...">
            </div>

            <div class="flex items-center gap-1 bg-surface-card p-1 rounded-lg border border-border-subtle">
              <button id="stock-tab-all" class="stock-tab-btn px-3 py-1.5 rounded-md text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm transition-colors">Todos</button>
              <button id="stock-tab-produced" class="stock-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors">Produzidos</button>
              <button id="stock-tab-unproduced" class="stock-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors">Não Produzidos</button>
            </div>
          </div>

          <!-- Conteúdo da Lista de Sabores -->
          <div id="stock-modal-list-container" class="overflow-y-auto flex-1 flex flex-col gap-space-sm pr-1"></div>
        </div>
      </div>
    </div>
  `;

  setupFilterEventListeners(container);
  setupStockModalEventListeners(container);
  setupProductionModalEventListeners(container);
  await loadOverviewData();
}

function setupFilterEventListeners(container) {
  const btnAll = container.querySelector('#filter-btn-all');
  const btnDay = container.querySelector('#filter-btn-day');
  const btnRange = container.querySelector('#filter-btn-range');
  const dateWrapper = container.querySelector('#date-picker-wrapper');
  const rangeWrapper = container.querySelector('#range-picker-wrapper');
  const dateSelect = container.querySelector('#overview-date-select');
  const startDateInput = container.querySelector('#overview-start-date');
  const endDateInput = container.querySelector('#overview-end-date');
  const refreshBtn = container.querySelector('#refresh-overview-btn');
  const refreshIcon = container.querySelector('#refresh-overview-icon');

  const updateButtonsStyle = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}`;

    if (dateWrapper) dateWrapper.classList.toggle('hidden', currentFilterMode !== 'day');
    if (rangeWrapper) rangeWrapper.classList.toggle('hidden', currentFilterMode !== 'range');
  };

  btnAll?.addEventListener('click', () => {
    if (currentFilterMode !== 'all') {
      currentFilterMode = 'all';
      updateButtonsStyle();
      loadOverviewData();
    }
  });

  btnDay?.addEventListener('click', () => {
    if (currentFilterMode !== 'day') {
      currentFilterMode = 'day';
      updateButtonsStyle();
      loadOverviewData();
    }
  });

  btnRange?.addEventListener('click', () => {
    if (currentFilterMode !== 'range') {
      currentFilterMode = 'range';
      updateButtonsStyle();
      loadOverviewData();
    }
  });

  dateSelect?.addEventListener('change', (e) => {
    currentSelectedDate = e.target.value;
    loadOverviewData();
  });

  startDateInput?.addEventListener('change', (e) => {
    currentStartDate = e.target.value;
    if (currentEndDate && currentStartDate > currentEndDate) {
      currentEndDate = currentStartDate;
      if (endDateInput) endDateInput.value = currentEndDate;
    }
    loadOverviewData();
  });

  endDateInput?.addEventListener('change', (e) => {
    currentEndDate = e.target.value;
    if (currentStartDate && currentEndDate < currentStartDate) {
      currentStartDate = currentEndDate;
      if (startDateInput) startDateInput.value = currentStartDate;
    }
    loadOverviewData();
  });

  refreshBtn?.addEventListener('click', () => {
    if (refreshIcon) refreshIcon.classList.add('animate-spin');
    loadOverviewData().finally(() => {
      if (refreshIcon) refreshIcon.classList.remove('animate-spin');
    });
  });
}

function setupProductionModalEventListeners(container) {
  const modal = container.querySelector('#production-details-modal');
  const closeBtn = container.querySelector('#close-production-modal-btn');
  const searchInput = container.querySelector('#production-modal-search');
  const tabAll = container.querySelector('#prod-tab-all');
  const tabCompleted = container.querySelector('#prod-tab-completed');
  const tabInProgress = container.querySelector('#prod-tab-in_progress');
  const tabPending = container.querySelector('#prod-tab-pending');

  closeBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  searchInput?.addEventListener('input', (e) => {
    modalProdSearchQuery = e.target.value.toLowerCase().trim();
    renderProductionModalContent();
  });

  const updateTabStyles = (activeTabBtn) => {
    [tabAll, tabCompleted, tabInProgress, tabPending].forEach(btn => {
      if (btn === activeTabBtn) {
        btn.className = 'prod-tab-btn px-3 py-1.5 rounded-md text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm transition-colors';
      } else {
        btn.className = 'prod-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors';
      }
    });
  };

  tabAll?.addEventListener('click', () => {
    modalProdActiveTab = 'all';
    updateTabStyles(tabAll);
    renderProductionModalContent();
  });

  tabCompleted?.addEventListener('click', () => {
    modalProdActiveTab = 'completed';
    updateTabStyles(tabCompleted);
    renderProductionModalContent();
  });

  tabInProgress?.addEventListener('click', () => {
    modalProdActiveTab = 'in_progress';
    updateTabStyles(tabInProgress);
    renderProductionModalContent();
  });

  tabPending?.addEventListener('click', () => {
    modalProdActiveTab = 'pending';
    updateTabStyles(tabPending);
    renderProductionModalContent();
  });
}

function openProductionModal() {
  const modal = document.getElementById('production-details-modal');
  if (!modal) return;

  modalProdSearchQuery = '';
  modalProdActiveTab = 'all';

  const searchInput = document.getElementById('production-modal-search');
  if (searchInput) searchInput.value = '';

  modal.classList.remove('hidden');
  renderProductionModalContent();
}

function renderProductionModalContent() {
  const container = document.getElementById('production-modal-list-container');
  if (!container) return;

  // Map 1: Demandas solicitadas por sabor (planned_kg)
  const demandByFlavor = (modalProductionDemands || []).reduce((acc, d) => {
    const fId = d.flavor_id;
    if (!acc[fId]) acc[fId] = 0;
    acc[fId] += Number(d.planned_kg || 0);
    return acc;
  }, {});

  // Map 2: Porções por sabor, quantidade real produzida (rotulagem concluída) e status das etapas
  const portionByFlavor = (modalProductionPortions || []).reduce((acc, p) => {
    const fId = p.flavor_id;
    if (!acc[fId]) {
      acc[fId] = {
        plannedKgPortions: 0,
        actualKgProduced: 0,
        hasCompletedRuns: false,
        hasInProgressRuns: false,
        totalPortionsCount: 0
      };
    }
    acc[fId].plannedKgPortions += Number(p.planned_kg || 0);
    acc[fId].totalPortionsCount += 1;

    const runs = p.process_runs || [];
    for (const run of runs) {
      if (run.stage === 'vacuo' && run.status === 'completed' && run.actual_kg) {
        acc[fId].actualKgProduced += Number(run.actual_kg);
      }
      if (run.status === 'completed') acc[fId].hasCompletedRuns = true;
      if (run.status === 'in_progress') acc[fId].hasInProgressRuns = true;
    }

    return acc;
  }, {});

  // Cruzar com todos os sabores cadastrados
  const flavorRows = modalAllFlavors.map(f => {
    const requestedFromDemand = demandByFlavor[f.id] || 0;
    const pData = portionByFlavor[f.id] || { plannedKgPortions: 0, actualKgProduced: 0, hasCompletedRuns: false, hasInProgressRuns: false, totalPortionsCount: 0 };

    const requestedKg = requestedFromDemand > 0 ? requestedFromDemand : pData.plannedKgPortions;
    const actualKg = pData.actualKgProduced;

    let statusCode = 'pending'; // 'completed', 'in_progress', 'pending'
    let statusLabel = 'Pendente';

    if (requestedKg > 0 && actualKg >= requestedKg) {
      statusCode = 'completed';
      statusLabel = 'Concluído ✓';
    } else if (actualKg > 0 || pData.hasInProgressRuns) {
      statusCode = 'in_progress';
      statusLabel = 'Em Produção';
    } else if (pData.hasCompletedRuns && actualKg > 0) {
      statusCode = 'completed';
      statusLabel = 'Concluído ✓';
    } else {
      statusCode = 'pending';
      statusLabel = requestedKg > 0 ? 'Pendente' : 'Sem Demanda';
    }

    const progressPct = requestedKg > 0 ? Math.min(100, Math.round((actualKg / requestedKg) * 100)) : (actualKg > 0 ? 100 : 0);

    return {
      id: f.id,
      name: f.name,
      requestedKg,
      actualKg,
      statusCode,
      statusLabel,
      progressPct,
      totalPortionsCount: pData.totalPortionsCount
    };
  });

  // Aplicar filtro de busca
  let filteredRows = flavorRows;
  if (modalProdSearchQuery) {
    filteredRows = filteredRows.filter(r => r.name.toLowerCase().includes(modalProdSearchQuery));
  }

  // Aplicar filtro de abas de status
  if (modalProdActiveTab !== 'all') {
    filteredRows = filteredRows.filter(r => r.statusCode === modalProdActiveTab);
  }

  if (filteredRows.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-text-muted text-xs italic bg-surface-canvas rounded-xl border border-border-subtle">
        Nenhum sabor encontrado para os critérios de busca e filtro selecionados.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 gap-space-sm">
      ${filteredRows.map(row => `
        <div class="bg-surface-canvas rounded-xl p-space-md border border-border-subtle flex flex-col gap-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] ${
                row.statusCode === 'completed' ? 'text-status-success' :
                row.statusCode === 'in_progress' ? 'text-amber-warning' :
                'text-text-muted'
              }">restaurant_menu</span>
              <h3 class="font-title-md text-title-md text-ink-text font-bold">${row.name}</h3>
            </div>

            <div class="flex items-center gap-3">
              <span class="px-2.5 py-0.5 rounded text-xs font-bold ${
                row.statusCode === 'completed' ? 'bg-surface-container-low text-status-success' :
                row.statusCode === 'in_progress' ? 'bg-badge-warning-bg text-badge-warning-text' :
                'bg-surface-card text-text-muted border border-border-subtle'
              }">
                ${row.statusLabel}
              </span>

              <div class="flex items-center gap-2 text-xs">
                <span class="text-text-muted">Solicitado: <strong class="text-ink-text">${formatWeight(row.requestedKg)}</strong></span>
                <span class="text-border-subtle">•</span>
                <span class="text-text-muted">Real: <strong class="text-status-success">${formatWeight(row.actualKg)}</strong></span>
              </div>
            </div>
          </div>

          <!-- Barra de Progresso e Percentual -->
          <div class="flex items-center gap-3 mt-1">
            <div class="flex-1 bg-surface-card rounded-full h-2 overflow-hidden border border-border-subtle">
              <div class="h-full rounded-full transition-all duration-300 ${
                row.statusCode === 'completed' ? 'bg-status-success' :
                row.statusCode === 'in_progress' ? 'bg-amber-warning' :
                'bg-text-muted'
              }" style="width: ${row.progressPct}%"></div>
            </div>
            <span class="text-xs font-bold text-ink-text min-w-[40px] text-right">${row.progressPct}%</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function setupStockModalEventListeners(container) {
  const modal = container.querySelector('#stock-details-modal');
  const closeBtn = container.querySelector('#close-stock-modal-btn');
  const searchInput = container.querySelector('#stock-modal-search');
  const tabAll = container.querySelector('#stock-tab-all');
  const tabProduced = container.querySelector('#stock-tab-produced');
  const tabUnproduced = container.querySelector('#stock-tab-unproduced');

  closeBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  searchInput?.addEventListener('input', (e) => {
    modalSearchQuery = e.target.value.toLowerCase().trim();
    renderStockModalContent();
  });

  const updateTabStyles = (activeTabBtn) => {
    [tabAll, tabProduced, tabUnproduced].forEach(btn => {
      if (btn === activeTabBtn) {
        btn.className = 'stock-tab-btn px-3 py-1.5 rounded-md text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm transition-colors';
      } else {
        btn.className = 'stock-tab-btn px-3 py-1.5 rounded-md text-xs font-bold text-text-muted hover:text-ink-text transition-colors';
      }
    });
  };

  tabAll?.addEventListener('click', () => {
    modalActiveTab = 'all';
    updateTabStyles(tabAll);
    renderStockModalContent();
  });

  tabProduced?.addEventListener('click', () => {
    modalActiveTab = 'produced';
    updateTabStyles(tabProduced);
    renderStockModalContent();
  });

  tabUnproduced?.addEventListener('click', () => {
    modalActiveTab = 'unproduced';
    updateTabStyles(tabUnproduced);
    renderStockModalContent();
  });
}

async function loadOverviewData() {
  const metricsContainer = document.getElementById('overview-metrics-container');
  const dailyOrdersSection = document.getElementById('daily-orders-section');
  if (!metricsContainer || !dailyOrdersSection) return;

  const [
    { data: ops, error: opsErr },
    { data: totalsData },
    { data: statusData },
    { data: lots },
    { data: invoiceQueue },
    { data: portions, error: portionsErr },
    { data: allFlavors, error: flavorsErr },
    { data: demands, error: demandsErr }
  ] = await Promise.all([
    supabase.from('production_orders').select('*').order('production_date', { ascending: false }),
    supabase.from('vw_production_order_totals').select('*'),
    supabase.from('vw_production_order_status').select('*'),
    supabase.from('vw_inventory_by_flavor').select('*'),
    supabase.from('vw_invoice_queue').select('*'),
    supabase.from('production_portions').select(`
      id,
      production_order_id,
      flavor_id,
      portion_no,
      planned_kg,
      flavors (id, name),
      process_runs (
        id, stage, status, started_at, completed_at, actual_kg
      )
    `),
    supabase.from('flavors').select('id, name, active').eq('active', true).order('name'),
    supabase.from('production_demands').select(`
      id,
      production_order_id,
      flavor_id,
      planned_kg,
      flavors (id, name)
    `)
  ]);

  if (opsErr || portionsErr || demandsErr) {
    metricsContainer.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar dados operacionais: ${(opsErr || portionsErr || demandsErr)?.message}</div>`;
    dailyOrdersSection.innerHTML = '';
    return;
  }

  // Guardar estado global dos modais
  modalAllFlavors = allFlavors || [];
  modalInventoryLots = lots || [];
  modalProductionDemands = demands || [];
  modalProductionPortions = portions || [];

  if (!ops || ops.length === 0) {
    metricsContainer.innerHTML = '';
    dailyOrdersSection.innerHTML = '';
    metricsContainer.appendChild(renderEmptyState({
      icon: 'grid_view',
      title: 'Nenhum Dado Operacional Registrado',
      description: 'Crie ordens de produção no módulo Planejamento para visualizar os indicadores do chão de fábrica.',
      actionText: null
    }));
    return;
  }

  // Atualizar campo de data de produção
  const dateSelect = document.getElementById('overview-date-select');
  if (dateSelect && !dateSelect.value) {
    dateSelect.value = currentSelectedDate;
  }

  // Filtrar OPs de acordo com o modo escolhido
  let filteredOps = ops;
  if (currentFilterMode === 'day' && currentSelectedDate) {
    filteredOps = ops.filter(o => o.production_date === currentSelectedDate);
  } else if (currentFilterMode === 'range' && currentStartDate && currentEndDate) {
    filteredOps = ops.filter(o => o.production_date >= currentStartDate && o.production_date <= currentEndDate);
  }

  // Mapeamentos
  const statusMap = (statusData || []).reduce((acc, s) => {
    acc[s.production_order_id] = s;
    return acc;
  }, {});

  const totalsMap = (totalsData || []).reduce((acc, t) => {
    acc[t.production_order_id] = t;
    return acc;
  }, {});

  // Renderizar Indicadores KPI
  renderMetricsCards(metricsContainer, filteredOps, totalsMap, statusMap, lots, invoiceQueue);

  // Renderizar Ordens Produzidas Por Dia / Detalhes de Processos
  renderDailyProductionOrders(dailyOrdersSection, filteredOps, portions, statusMap);
}

function renderMetricsCards(container, filteredOps, totalsMap, statusMap, lots, invoiceQueue) {
  if (filteredOps.length === 0) {
    container.innerHTML = `
      <div class="p-6 bg-surface-card rounded-xl border border-border-subtle text-center text-text-muted font-body-md">
        Nenhuma ordem de produção encontrada para os filtros selecionados.
      </div>
    `;
    return;
  }

  const totalPlannedKg = filteredOps.reduce((acc, o) => acc + Number(totalsMap[o.id]?.planned_total_kg || 0), 0);
  const totalProducedKg = filteredOps.reduce((acc, o) => acc + Number(totalsMap[o.id]?.produced_total_kg || 0), 0);
  const overallProgressPct = totalPlannedKg > 0 ? Math.min(100, Math.round((totalProducedKg / totalPlannedKg) * 100)) : 0;

  const totalStockKg = (lots || []).reduce((acc, item) => acc + Number(item.balance_kg), 0);
  const pendingInvoiceOrdersCount = new Set((invoiceQueue || []).map(item => item.order_code)).size;

  container.innerHTML = `
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
      <!-- Card 1: Contexto de Produção / OP -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-bordeaux-primary"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">${
            currentFilterMode === 'day' ? 'Monitoramento Diário' :
            currentFilterMode === 'range' ? 'Monitoramento por Período / Semana' :
            'Visão Geral Global'
          }</span>
          <h2 class="font-headline-sm text-ink-text">${
            currentFilterMode === 'day' ? `Dia ${formatDate(currentSelectedDate)}` :
            currentFilterMode === 'range' ? `${formatDate(currentStartDate)} a ${formatDate(currentEndDate)}` :
            `${filteredOps.length} OPs Mapeadas`
          }</h2>
          <div class="flex justify-between items-baseline mt-2">
            <span class="text-xs text-text-muted">Carga Planejada:</span>
            <span class="font-bold text-bordeaux-primary text-lg">${formatWeight(totalPlannedKg)}</span>
          </div>
          <div class="w-full bg-surface-canvas rounded-full h-2 overflow-hidden mt-2">
            <div class="bg-bordeaux-primary h-full rounded-full" style="width: ${overallProgressPct}%"></div>
          </div>
        </div>
      </article>

      <!-- Card 2: Produção Realizada com Link Ver + -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-status-success"></div>
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="font-label-sm text-text-muted uppercase">Volume Produzido Real</span>
            <button id="view-more-production-btn" class="text-xs font-bold text-status-success hover:underline flex items-center gap-0.5 cursor-pointer bg-surface-canvas px-2 py-0.5 rounded border border-border-subtle">
              <span>Ver +</span>
              <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
          <h2 class="font-headline-sm text-status-success">${formatWeight(totalProducedKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Conclusão do ciclo: <strong>${overallProgressPct}%</strong></span>
        </div>
      </article>

      <!-- Card 3: Saldo de Estoque em Câmara com Link Ver + -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-amber-warning"></div>
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="font-label-sm text-text-muted uppercase">Saldo de Estoque</span>
            <button id="view-more-stock-btn" class="text-xs font-bold text-bordeaux-primary hover:underline flex items-center gap-0.5 cursor-pointer bg-surface-canvas px-2 py-0.5 rounded border border-border-subtle">
              <span>Ver +</span>
              <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
          <h2 class="font-headline-sm text-ink-text">${formatWeight(totalStockKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Lotes disponíveis em câmara</span>
        </div>
      </article>

      <!-- Card 4: Fila de Faturamento (Quantidade de Pedidos) -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-status-info"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Pronto para Faturamento</span>
          <h2 class="font-headline-sm text-status-info">${pendingInvoiceOrdersCount} ${pendingInvoiceOrdersCount === 1 ? 'pedido' : 'pedidos'}</h2>
          <span class="text-xs text-text-muted mt-2">${pendingInvoiceOrdersCount === 1 ? '1 pedido separado' : `${pendingInvoiceOrdersCount} pedidos separados`} na doca</span>
        </div>
      </article>
    </section>
  `;

  // Listeners dos botões Ver +
  container.querySelector('#view-more-production-btn')?.addEventListener('click', () => {
    openProductionModal();
  });

  container.querySelector('#view-more-stock-btn')?.addEventListener('click', () => {
    openStockModal();
  });
}

function openStockModal() {
  const modal = document.getElementById('stock-details-modal');
  if (!modal) return;

  modalSearchQuery = '';
  modalActiveTab = 'all';

  const searchInput = document.getElementById('stock-modal-search');
  if (searchInput) searchInput.value = '';

  modal.classList.remove('hidden');
  renderStockModalContent();
}

function renderStockModalContent() {
  const container = document.getElementById('stock-modal-list-container');
  if (!container) return;

  // Mapear cada sabor para o seu saldo de estoque acumulado e detalhes dos lotes
  const stockByFlavorMap = (modalInventoryLots || []).reduce((acc, item) => {
    const fId = item.flavor_id;
    if (!acc[fId]) {
      acc[fId] = {
        flavor_id: fId,
        flavor_name: item.flavor,
        totalBalanceKg: 0,
        lots: []
      };
    }
    acc[fId].totalBalanceKg += Number(item.balance_kg || 0);
    acc[fId].lots.push(item);
    return acc;
  }, {});

  // Cruzar com todos os sabores ativos cadastrados
  const flavorRows = modalAllFlavors.map(f => {
    const stockData = stockByFlavorMap[f.id];
    const totalBalanceKg = stockData ? stockData.totalBalanceKg : 0;
    const isProduced = totalBalanceKg > 0;
    const lots = stockData ? stockData.lots : [];

    return {
      id: f.id,
      name: f.name,
      totalBalanceKg,
      isProduced,
      lots
    };
  });

  // Aplicar filtro de busca
  let filteredRows = flavorRows;
  if (modalSearchQuery) {
    filteredRows = filteredRows.filter(r => r.name.toLowerCase().includes(modalSearchQuery));
  }

  // Aplicar filtro de abas (Todos, Produzidos, Não Produzidos)
  if (modalActiveTab === 'produced') {
    filteredRows = filteredRows.filter(r => r.isProduced);
  } else if (modalActiveTab === 'unproduced') {
    filteredRows = filteredRows.filter(r => !r.isProduced);
  }

  if (filteredRows.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-text-muted text-xs italic bg-surface-canvas rounded-xl border border-border-subtle">
        Nenhum sabor encontrado para os critérios de busca e filtro.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 gap-space-sm">
      ${filteredRows.map(row => `
        <div class="bg-surface-canvas rounded-xl p-space-md border border-border-subtle flex flex-col gap-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] ${row.isProduced ? 'text-status-success' : 'text-text-muted'}">restaurant_menu</span>
              <h3 class="font-title-md text-title-md text-ink-text font-bold">${row.name}</h3>
            </div>

            <div class="flex items-center gap-3">
              <span class="px-2.5 py-0.5 rounded text-xs font-bold ${
                row.isProduced ? 'bg-surface-container-low text-status-success' : 'bg-surface-card text-text-muted border border-border-subtle'
              }">
                ${row.isProduced ? 'Produzido (Em Estoque)' : 'Não Produzido (Sem Estoque)'}
              </span>

              <span class="font-tabular-data-lg text-tabular-data-lg font-bold ${row.isProduced ? 'text-status-success' : 'text-text-muted'}">
                ${formatWeight(row.totalBalanceKg)}
              </span>
            </div>
          </div>

          <!-- Detalhes dos Lotes se Produzido -->
          ${row.isProduced && row.lots.length > 0 ? `
            <div class="mt-1 pt-2 border-t border-border-subtle flex flex-col gap-1">
              <span class="text-[11px] font-bold text-text-muted uppercase">Lotes em Câmara:</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                ${row.lots.map(lot => `
                  <div class="p-2 rounded bg-surface-card border border-border-subtle flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="font-bold text-ink-text">Lote ${lot.lot_code || '—'}</span>
                      <span class="text-text-muted capitalize">${lot.product_type} • ${lot.conservation}</span>
                    </div>
                    <div class="flex flex-col text-right">
                      <span class="font-bold text-status-success">${formatWeight(lot.balance_kg)}</span>
                      <span class="text-[10px] text-text-muted">Validade: ${formatDate(lot.expiry_date)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderDailyProductionOrders(container, ops, portions, statusMap) {
  if (!ops || ops.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Agrupar porções por production_order_id
  const portionsByOp = (portions || []).reduce((acc, p) => {
    if (!acc[p.production_order_id]) acc[p.production_order_id] = [];
    acc[p.production_order_id].push(p);
    return acc;
  }, {});

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl p-space-lg shadow-sm border border-border-subtle flex flex-col gap-space-md">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm pb-space-xs border-b border-border-subtle">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">format_list_bulleted</span>
            <h2 class="font-headline-sm text-headline-sm text-ink-text">Ordens Produzidas por Dia & Acompanhamento de Processos</h2>
          </div>
          <p class="font-body-md text-body-md text-text-muted mt-0.5">Detalhamento dos volumes embutidos, envacados (vácuo) e rotulados com tempo gasto em cada etapa.</p>
        </div>
        <span class="font-label-sm text-label-sm px-2.5 py-1 rounded bg-surface-canvas text-ink-text font-bold border border-border-subtle">
          ${ops.length} ${ops.length === 1 ? 'Ordem Mapeada' : 'Ordens Mapeadas'}
        </span>
      </div>

      <div class="flex flex-col gap-space-md">
        ${ops.map(op => {
          const opPortions = portionsByOp[op.id] || [];
          const status = statusMap[op.id]?.status || 'planned';

          // Agrupar porções por sabor
          const flavorsMap = opPortions.reduce((acc, p) => {
            const flavorId = p.flavor_id;
            const flavorName = p.flavors?.name || 'Sabor não identificado';
            if (!acc[flavorId]) {
              acc[flavorId] = {
                id: flavorId,
                name: flavorName,
                portions: []
              };
            }
            acc[flavorId].portions.push(p);
            return acc;
          }, {});

          const flavorList = Object.values(flavorsMap);

          return `
            <div class="bg-surface-canvas rounded-xl p-space-md border border-border-subtle flex flex-col gap-space-md">
              <!-- Cabeçalho da OP -->
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
                <div class="flex items-center gap-3">
                  <span class="font-title-lg text-title-lg text-bordeaux-primary font-bold">${op.order_code}</span>
                  <span class="text-xs font-bold text-text-muted uppercase">Data da Produção: ${formatDate(op.production_date)}</span>
                </div>
                <div>
                  <span class="px-2.5 py-1 rounded text-xs font-bold ${
                    status === 'completed' ? 'bg-surface-container-low text-status-success' :
                    status === 'in_production' ? 'bg-badge-warning-bg text-badge-warning-text' :
                    'bg-surface-card text-text-muted'
                  }">
                    ${status === 'completed' ? 'Concluída ✓' : status === 'in_production' ? 'Em Produção' : 'Planejada'}
                  </span>
                </div>
              </div>

              <!-- Lista de Produtos / Sabores da OP -->
              ${flavorList.length === 0 ? `
                <div class="p-4 text-center text-text-muted text-xs italic bg-surface-card rounded-lg">
                  Nenhuma porção gerada ainda para esta ordem de produção.
                </div>
              ` : `
                <div class="grid grid-cols-1 gap-space-md">
                  ${flavorList.map(flavor => {
                    const allRuns = flavor.portions.flatMap(p => p.process_runs || []);

                    const embutimentoStats = calculateStageStats(allRuns, 'embutimento');
                    const vacuoStats = calculateStageStats(allRuns, 'vacuo');
                    const rotulagemStats = calculateStageStats(allRuns, 'rotulagem');

                    return `
                      <div class="bg-surface-card rounded-lg p-space-md border border-border-subtle flex flex-col gap-space-sm">
                        <div class="flex items-center justify-between flex-wrap gap-2">
                          <h3 class="font-title-md text-title-md text-ink-text font-bold flex items-center gap-2">
                            <span class="material-symbols-outlined text-[20px] text-bordeaux-primary">restaurant_menu</span>
                            ${flavor.name}
                          </h3>
                          <span class="text-xs text-text-muted font-bold">${flavor.portions.length} ${flavor.portions.length === 1 ? 'porção' : 'porções'} (${formatWeight(flavor.portions.reduce((s, p) => s + Number(p.planned_kg), 0))})</span>
                        </div>

                        <!-- Grid dos Três Processos: Embutimento, Envacado (Vácuo), Rotulagem -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-space-sm mt-1">
                          <!-- 1. Embutimento -->
                          <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex flex-col justify-between gap-1">
                            <div class="flex items-center justify-between">
                              <span class="font-label-sm text-label-sm text-text-muted uppercase font-bold flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px] text-bordeaux-primary">motion_photos_on</span>
                                Embutidos
                              </span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                embutimentoStats.status === 'completed' ? 'bg-surface-container-low text-status-success' :
                                embutimentoStats.status === 'in_progress' ? 'bg-badge-warning-bg text-badge-warning-text' :
                                'bg-surface-card text-text-muted'
                              }">
                                ${embutimentoStats.status === 'completed' ? 'Concluído' : embutimentoStats.status === 'in_progress' ? 'Executando' : 'Pendente'}
                              </span>
                            </div>
                            <div class="mt-1">
                              <span class="font-tabular-data-lg text-tabular-data-lg text-ink-text font-bold">${formatWeight(embutimentoStats.totalKg)}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-text-muted mt-1 border-t border-border-subtle pt-1">
                              <span class="material-symbols-outlined text-[14px]">schedule</span>
                              <span>Tempo: <strong>${embutimentoStats.durationStr}</strong></span>
                            </div>
                          </div>

                          <!-- 2. Envacados / Vácuo -->
                          <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex flex-col justify-between gap-1">
                            <div class="flex items-center justify-between">
                              <span class="font-label-sm text-label-sm text-text-muted uppercase font-bold flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px] text-amber-warning">compress</span>
                                Envacados (Vácuo)
                              </span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                vacuoStats.status === 'completed' ? 'bg-surface-container-low text-status-success' :
                                vacuoStats.status === 'in_progress' ? 'bg-badge-warning-bg text-badge-warning-text' :
                                'bg-surface-card text-text-muted'
                              }">
                                ${vacuoStats.status === 'completed' ? 'Concluído' : vacuoStats.status === 'in_progress' ? 'Executando' : 'Pendente'}
                              </span>
                            </div>
                            <div class="mt-1">
                              <span class="font-tabular-data-lg text-tabular-data-lg text-ink-text font-bold">${formatWeight(vacuoStats.totalKg)}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-text-muted mt-1 border-t border-border-subtle pt-1">
                              <span class="material-symbols-outlined text-[14px]">schedule</span>
                              <span>Tempo: <strong>${vacuoStats.durationStr}</strong></span>
                            </div>
                          </div>

                          <!-- 3. Rotulados (Contagem Automática: 2,5x por kg) -->
                          <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex flex-col justify-between gap-1">
                            <div class="flex items-center justify-between">
                              <span class="font-label-sm text-label-sm text-text-muted uppercase font-bold flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px] text-status-success">label</span>
                                Rotulados (2,5x/kg)
                              </span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                rotulagemStats.status === 'completed' ? 'bg-surface-container-low text-status-success' :
                                rotulagemStats.status === 'in_progress' ? 'bg-badge-warning-bg text-badge-warning-text' :
                                'bg-surface-card text-text-muted'
                              }">
                                ${rotulagemStats.status === 'completed' ? 'Concluído' : rotulagemStats.status === 'in_progress' ? 'Executando' : 'Pendente'}
                              </span>
                            </div>
                            <div class="mt-1 flex items-baseline justify-between">
                              <span class="font-tabular-data-lg text-tabular-data-lg text-ink-text font-bold">${formatWeight(rotulagemStats.totalKg)}</span>
                              <span class="text-xs font-bold text-status-success">${Math.round(rotulagemStats.totalKg * 2.5)} rótulos</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-text-muted mt-1 border-t border-border-subtle pt-1">
                              <span class="material-symbols-outlined text-[14px]">schedule</span>
                              <span>Tempo: <strong>${rotulagemStats.durationStr}</strong></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function calculateStageStats(processRuns, stageName) {
  const stageRuns = (processRuns || []).filter(r => r.stage === stageName);
  if (stageRuns.length === 0) {
    return { status: 'none', totalKg: 0, durationStr: 'Não iniciado' };
  }

  let totalKg = 0;
  let totalMs = 0;
  let hasInProgress = false;
  let hasCompleted = false;

  for (const run of stageRuns) {
    if (run.status === 'completed') {
      hasCompleted = true;
      if (run.actual_kg) totalKg += Number(run.actual_kg);
      if (run.started_at && run.completed_at) {
        const start = new Date(run.started_at).getTime();
        const end = new Date(run.completed_at).getTime();
        if (end >= start) totalMs += (end - start);
      }
    } else if (run.status === 'in_progress') {
      hasInProgress = true;
      if (run.started_at) {
        const start = new Date(run.started_at).getTime();
        const now = Date.now();
        if (now >= start) totalMs += (now - start);
      }
    }
  }

  let status = 'pending';
  if (hasCompleted) status = 'completed';
  else if (hasInProgress) status = 'in_progress';

  let durationStr = '—';
  if (totalMs > 0) {
    durationStr = formatDurationMs(totalMs) + (status === 'in_progress' ? ' (em andamento)' : '');
  } else if (status === 'in_progress') {
    durationStr = 'Em andamento';
  } else if (status === 'pending') {
    durationStr = 'Pendente';
  }

  return { status, totalKg, durationStr };
}

function formatDurationMs(durationMs) {
  if (!durationMs || durationMs <= 0) return '—';
  const totalMinutes = Math.floor(durationMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
}
