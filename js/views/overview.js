import { supabase } from '../supabaseClient.js';
import { renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Visão Geral (Monitor Operacional Diário / Bento Grid)
let currentFilterMode = 'all'; // 'all' (Visão Geral) ou 'day' (Por Dia)
let currentSelectedDate = '';  // YYYY-MM-DD

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

          <!-- Filtro Modo: Visão Geral vs Por Dia -->
          <div class="flex items-center gap-2 bg-surface-canvas p-1 rounded-lg border border-border-subtle">
            <button id="filter-btn-all" class="px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
              Visão Geral
            </button>
            <button id="filter-btn-day" class="px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
              Por Dia
            </button>
          </div>

          <!-- Seletor de Data (Exibido quando no modo Por Dia) -->
          <div id="date-picker-wrapper" class="${currentFilterMode === 'day' ? 'flex' : 'hidden'} items-center gap-2 bg-surface-canvas px-3 py-1.5 rounded-lg border border-border-subtle">
            <label for="overview-date-select" class="font-label-sm text-label-sm text-text-muted uppercase">Data:</label>
            <select id="overview-date-select" class="bg-transparent font-title-md text-title-md text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
              <!-- Preenchido dinamicamente com datas de produção -->
            </select>
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
    </div>
  `;

  setupFilterEventListeners(container);
  await loadOverviewData();
}

function setupFilterEventListeners(container) {
  const btnAll = container.querySelector('#filter-btn-all');
  const btnDay = container.querySelector('#filter-btn-day');
  const dateWrapper = container.querySelector('#date-picker-wrapper');
  const dateSelect = container.querySelector('#overview-date-select');
  const refreshBtn = container.querySelector('#refresh-overview-btn');
  const refreshIcon = container.querySelector('#refresh-overview-icon');

  if (btnAll) {
    btnAll.addEventListener('click', () => {
      if (currentFilterMode !== 'all') {
        currentFilterMode = 'all';
        btnAll.className = 'px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors bg-bordeaux-primary text-on-primary font-bold shadow-sm';
        btnDay.className = 'px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors text-text-muted hover:text-ink-text';
        if (dateWrapper) dateWrapper.classList.add('hidden');
        loadOverviewData();
      }
    });
  }

  if (btnDay) {
    btnDay.addEventListener('click', () => {
      if (currentFilterMode !== 'day') {
        currentFilterMode = 'day';
        btnDay.className = 'px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors bg-bordeaux-primary text-on-primary font-bold shadow-sm';
        btnAll.className = 'px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors text-text-muted hover:text-ink-text';
        if (dateWrapper) dateWrapper.classList.remove('hidden');
        loadOverviewData();
      }
    });
  }

  if (dateSelect) {
    dateSelect.addEventListener('change', (e) => {
      currentSelectedDate = e.target.value;
      loadOverviewData();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (refreshIcon) refreshIcon.classList.add('animate-spin');
      loadOverviewData().finally(() => {
        if (refreshIcon) refreshIcon.classList.remove('animate-spin');
      });
    });
  }
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
    { data: portions, error: portionsErr }
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
    `)
  ]);

  if (opsErr || portionsErr) {
    metricsContainer.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar dados operacionais: ${(opsErr || portionsErr).message}</div>`;
    dailyOrdersSection.innerHTML = '';
    return;
  }

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

  // Atualizar dropdown de datas de produção
  const uniqueDates = [...new Set(ops.map(o => o.production_date).filter(Boolean))].sort().reverse();
  const dateSelect = document.getElementById('overview-date-select');
  if (dateSelect) {
    const prevVal = currentSelectedDate || uniqueDates[0] || '';
    dateSelect.innerHTML = uniqueDates.map(d => `<option value="${d}" ${d === prevVal ? 'selected' : ''}>${formatDate(d)}</option>`).join('');
    currentSelectedDate = dateSelect.value;
  }

  // Filtrar OPs de acordo com o modo escolhido
  let filteredOps = ops;
  if (currentFilterMode === 'day' && currentSelectedDate) {
    filteredOps = ops.filter(o => o.production_date === currentSelectedDate);
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
  const pendingInvoiceKg = (invoiceQueue || []).reduce((acc, item) => acc + Number(item.separated_kg), 0);

  const activeOp = filteredOps.find(o => statusMap[o.id]?.status === 'in_production') || filteredOps[0];

  container.innerHTML = `
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
      <!-- Card 1: Contexto de Produção / OP -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-bordeaux-primary"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">${currentFilterMode === 'day' ? 'Monitoramento Diário' : 'Visão Geral Global'}</span>
          <h2 class="font-headline-sm text-ink-text">${currentFilterMode === 'day' ? `Dia ${formatDate(currentSelectedDate)}` : `${filteredOps.length} OPs Mapeadas`}</h2>
          <div class="flex justify-between items-baseline mt-2">
            <span class="text-xs text-text-muted">Carga Planejada:</span>
            <span class="font-bold text-bordeaux-primary text-lg">${formatWeight(totalPlannedKg)}</span>
          </div>
          <div class="w-full bg-surface-canvas rounded-full h-2 overflow-hidden mt-2">
            <div class="bg-bordeaux-primary h-full rounded-full" style="width: ${overallProgressPct}%"></div>
          </div>
        </div>
      </article>

      <!-- Card 2: Produção Realizada -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-status-success"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Volume Produzido Real</span>
          <h2 class="font-headline-sm text-status-success">${formatWeight(totalProducedKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Conclusão do ciclo: <strong>${overallProgressPct}%</strong></span>
        </div>
      </article>

      <!-- Card 3: Saldo de Estoque em Câmara -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-amber-warning"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Saldo de Estoque</span>
          <h2 class="font-headline-sm text-ink-text">${formatWeight(totalStockKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Lotes disponíveis em câmara</span>
        </div>
      </article>

      <!-- Card 4: Fila de Faturamento -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-status-info"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Pronto para Faturamento</span>
          <h2 class="font-headline-sm text-status-info">${formatWeight(pendingInvoiceKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Linhas na doca / fila fiscal</span>
        </div>
      </article>
    </section>
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

                          <!-- 3. Rotulados -->
                          <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex flex-col justify-between gap-1">
                            <div class="flex items-center justify-between">
                              <span class="font-label-sm text-label-sm text-text-muted uppercase font-bold flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px] text-status-success">label</span>
                                Rotulados
                              </span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                                rotulagemStats.status === 'completed' ? 'bg-surface-container-low text-status-success' :
                                rotulagemStats.status === 'in_progress' ? 'bg-badge-warning-bg text-badge-warning-text' :
                                'bg-surface-card text-text-muted'
                              }">
                                ${rotulagemStats.status === 'completed' ? 'Concluído' : rotulagemStats.status === 'in_progress' ? 'Executando' : 'Pendente'}
                              </span>
                            </div>
                            <div class="mt-1">
                              <span class="font-tabular-data-lg text-tabular-data-lg text-ink-text font-bold">${formatWeight(rotulagemStats.totalKg)}</span>
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
