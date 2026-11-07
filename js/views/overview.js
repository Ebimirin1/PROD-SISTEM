import { supabase } from '../supabaseClient.js';
import { renderEmptyState, formatWeight, formatDate, weekdayName } from '../utils.js';
import { renderOverviewCharts, fmtKg, monthRange } from './overviewCharts.js';

// Visão Geral — painel da produção: filtros no topo, indicadores, produção mensal e gráficos.
// Os dados são carregados uma vez; trocar o filtro só recalcula na tela (o botão Atualizar busca de novo).

function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Atalhos de período (o filtro usa a data em que o vácuo/etapa foi concluído)
const PRESETS = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'year', label: 'Este ano' },
  { key: 'all', label: 'Tudo' }
];

function presetRange(key) {
  const now = new Date();
  const today = getLocalDateString(now);
  if (key === 'today') return { start: today, end: today };
  if (key === 'week') {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: getLocalDateString(monday), end: getLocalDateString(sunday) };
  }
  if (key === 'month') return monthRange(today.slice(0, 7));
  if (key === '30d') {
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    return { start: getLocalDateString(from), end: today };
  }
  if (key === 'year') return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
  return { start: null, end: null }; // 'all'
}

// Estado do filtro (fica guardado ao trocar de tela)
const filter = {
  mode: 'op',          // 'op' (Por Ordem de Produção, abre na OP mais recente) ou 'period'
  opId: null,
  preset: 'month',     // atalho ativo no modo período; 'custom' quando as datas são digitadas
  start: presetRange('month').start,
  end: presetRange('month').end,
  flavorId: ''         // '' = todos os sabores
};

// Dados carregados do banco (reaproveitados a cada troca de filtro)
let cache = null;

// Estado do Modal de Produção por Sabor (Quantidade Solicitada x Real & Status)
let modalAllFlavors = [];
let modalProductionDemands = [];
let modalProductionPortions = [];
let modalProdActiveTab = 'all'; // 'all', 'completed', 'in_progress', 'pending'
let modalProdSearchQuery = '';

const segBtn = active => `px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${active ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'text-text-muted hover:text-ink-text'}`;
const chipBtn = active => `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${active ? 'bg-brand-gold border-brand-gold text-brand-black' : 'bg-surface-card border-border-subtle text-ink-text hover:border-brand-gold'}`;
const fieldBox = 'flex items-center gap-2 bg-surface-canvas px-3 min-h-[36px] rounded-lg border border-border-subtle';

export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full pt-space-md">
      <!-- Barra de filtros: vale para tudo o que está abaixo -->
      <section class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col gap-space-sm">
        <div class="flex flex-wrap items-center gap-space-sm">
          <div class="flex items-center gap-1 bg-surface-canvas p-1 rounded-lg border border-border-subtle">
            <button id="filter-mode-op" class="${segBtn(filter.mode === 'op')}">Por Ordem de Produção</button>
            <button id="filter-mode-period" class="${segBtn(filter.mode === 'period')}">Por Período</button>
          </div>

          <div id="op-picker-wrapper" class="${filter.mode === 'op' ? 'flex' : 'hidden'} ${fieldBox} max-w-full min-w-0">
            <label for="overview-op-select" class="text-[11px] font-bold text-text-muted uppercase">OP</label>
            <select id="overview-op-select" class="min-w-0 max-w-full bg-transparent text-sm text-bordeaux-primary font-bold focus:outline-none cursor-pointer"></select>
          </div>

          <div id="period-wrapper" class="${filter.mode === 'period' ? 'flex' : 'hidden'} flex-wrap items-center gap-space-sm">
            <div id="preset-chips" class="flex flex-wrap items-center gap-1.5">
              ${PRESETS.map(p => `<button data-preset="${p.key}" class="preset-chip ${chipBtn(filter.preset === p.key)}">${p.label}</button>`).join('')}
            </div>
            <div class="${fieldBox} flex-wrap">
              <label for="overview-start-date" class="text-[11px] font-bold text-text-muted uppercase">De</label>
              <input type="date" id="overview-start-date" value="${filter.start || ''}" class="bg-transparent text-sm text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
              <label for="overview-end-date" class="text-[11px] font-bold text-text-muted uppercase">Até</label>
              <input type="date" id="overview-end-date" value="${filter.end || ''}" class="bg-transparent text-sm text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
            </div>
          </div>

          <div class="${fieldBox} min-w-0">
            <span class="material-symbols-outlined text-[18px] text-text-muted">restaurant_menu</span>
            <label for="overview-flavor-select" class="sr-only">Sabor</label>
            <select id="overview-flavor-select" class="min-w-0 max-w-[220px] bg-transparent text-sm text-ink-text font-bold focus:outline-none cursor-pointer">
              <option value="">Todos os sabores</option>
            </select>
          </div>

          <button id="refresh-overview-btn" aria-label="Buscar dados novamente" class="ml-auto min-h-[36px] px-3 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text text-sm font-bold flex items-center gap-2 transition-all active:scale-95 border border-border-subtle">
            <span class="material-symbols-outlined text-[18px] text-text-muted" id="refresh-overview-icon">sync</span>
            <span>Atualizar</span>
          </button>
        </div>

        <!-- Resumo do que está sendo mostrado + filtros ativos removíveis -->
        <div id="filter-summary" class="flex flex-wrap items-center gap-2 text-xs text-text-muted"></div>
      </section>

      <!-- Indicadores -->
      <div id="overview-metrics-container"></div>

      <!-- Produção mensal e gráficos do filtro -->
      <section id="overview-charts-section" class="transition-opacity"></section>

      <!-- Detalhe por dia de finalização (recolhido) -->
      <section id="daily-orders-section" class="flex flex-col gap-space-md"></section>

      <!-- Modal: Detalhamento da Produção Total por Sabor (Solicitada x Real & Status) -->
      <div id="production-details-modal" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-space-md">
        <div class="bg-surface-card rounded-2xl shadow-xl border border-border-subtle max-w-4xl w-full max-h-[90vh] flex flex-col p-4 sm:p-space-lg gap-space-md overflow-hidden">
          <div class="flex items-center justify-between border-b border-border-subtle pb-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-status-success text-[26px]">precision_manufacturing</span>
              <div class="flex flex-col">
                <h2 class="font-headline-sm text-headline-sm text-ink-text font-bold">Produção por Sabor</h2>
                <p class="text-xs text-text-muted">Quantidade planejada x produzida (vácuo) e status de cada sabor no filtro atual.</p>
              </div>
            </div>
            <button id="close-production-modal-btn" class="p-1 rounded-lg hover:bg-surface-canvas text-text-muted hover:text-ink-text transition-colors" aria-label="Fechar">
              <span class="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>

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

          <div id="production-modal-list-container" class="overflow-y-auto flex-1 flex flex-col gap-space-sm pr-1"></div>
        </div>
      </div>
    </div>
  `;

  setupFilterEventListeners(container);
  setupProductionModalEventListeners(container);
  await loadOverviewData();
}

function syncFilterControls() {
  const q = id => document.getElementById(id);
  if (q('filter-mode-op')) q('filter-mode-op').className = segBtn(filter.mode === 'op');
  if (q('filter-mode-period')) q('filter-mode-period').className = segBtn(filter.mode === 'period');
  q('op-picker-wrapper')?.classList.toggle('hidden', filter.mode !== 'op');
  q('op-picker-wrapper')?.classList.toggle('flex', filter.mode === 'op');
  q('period-wrapper')?.classList.toggle('hidden', filter.mode !== 'period');
  q('period-wrapper')?.classList.toggle('flex', filter.mode === 'period');
  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.className = `preset-chip ${chipBtn(filter.preset === btn.dataset.preset)}`;
  });
  if (q('overview-start-date')) q('overview-start-date').value = filter.start || '';
  if (q('overview-end-date')) q('overview-end-date').value = filter.end || '';
  if (q('overview-op-select') && filter.opId) q('overview-op-select').value = filter.opId;
  if (q('overview-flavor-select')) q('overview-flavor-select').value = filter.flavorId;
}

// Muda o filtro e redesenha (sem buscar de novo no banco)
function applyFilter(changes) {
  Object.assign(filter, changes);
  syncFilterControls();
  renderFromCache();
}

function setupFilterEventListeners(container) {
  container.querySelector('#filter-mode-op')?.addEventListener('click', () => applyFilter({ mode: 'op' }));
  container.querySelector('#filter-mode-period')?.addEventListener('click', () => applyFilter({ mode: 'period' }));

  container.querySelector('#overview-op-select')?.addEventListener('change', e => applyFilter({ opId: e.target.value }));
  container.querySelector('#overview-flavor-select')?.addEventListener('change', e => applyFilter({ flavorId: e.target.value }));

  container.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = presetRange(btn.dataset.preset);
      applyFilter({ mode: 'period', preset: btn.dataset.preset, start: r.start, end: r.end });
    });
  });

  const startInput = container.querySelector('#overview-start-date');
  const endInput = container.querySelector('#overview-end-date');
  startInput?.addEventListener('change', e => {
    const start = e.target.value || null;
    let end = filter.end;
    if (start && (!end || end < start)) end = start;
    applyFilter({ mode: 'period', preset: 'custom', start, end });
  });
  endInput?.addEventListener('change', e => {
    const end = e.target.value || null;
    let start = filter.start;
    if (end && (!start || start > end)) start = end;
    applyFilter({ mode: 'period', preset: 'custom', start, end });
  });

  // Remover um filtro direto no resumo
  container.querySelector('#filter-summary')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-clear]');
    if (!btn) return;
    if (btn.dataset.clear === 'flavor') applyFilter({ flavorId: '' });
  });

  const refreshIcon = container.querySelector('#refresh-overview-icon');
  container.querySelector('#refresh-overview-btn')?.addEventListener('click', () => {
    refreshIcon?.classList.add('animate-spin');
    loadOverviewData().finally(() => refreshIcon?.classList.remove('animate-spin'));
  });
}

async function loadOverviewData() {
  const metricsContainer = document.getElementById('overview-metrics-container');
  const chartsSection = document.getElementById('overview-charts-section');
  const dailyOrdersSection = document.getElementById('daily-orders-section');
  if (!metricsContainer || !dailyOrdersSection) return;

  // Mantém a tela anterior esmaecida enquanto busca, sem piscar
  if (cache && chartsSection) chartsSection.style.opacity = '0.5';

  const [
    { data: ops, error: opsErr },
    { data: portions, error: portionsErr },
    { data: allFlavors },
    { data: demands, error: demandsErr }
  ] = await Promise.all([
    supabase.from('production_orders').select('*').order('production_date', { ascending: false }),
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
      destination_key,
      requested_product_type,
      requested_conservation,
      flavors (id, name)
    `)
  ]);

  if (chartsSection) chartsSection.style.opacity = '';

  if (opsErr || portionsErr || demandsErr) {
    metricsContainer.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar dados operacionais: ${esc((opsErr || portionsErr || demandsErr)?.message)}</div>`;
    dailyOrdersSection.innerHTML = '';
    if (chartsSection) chartsSection.innerHTML = '';
    return;
  }

  if (!ops || ops.length === 0) {
    cache = null;
    metricsContainer.innerHTML = '';
    dailyOrdersSection.innerHTML = '';
    if (chartsSection) chartsSection.innerHTML = '';
    metricsContainer.appendChild(renderEmptyState({
      icon: 'grid_view',
      title: 'Nenhum Dado Operacional Registrado',
      description: 'Crie ordens de produção no módulo Planejamento para visualizar os indicadores do chão de fábrica.',
      actionText: null
    }));
    return;
  }

  const opMap = Object.fromEntries(ops.map(o => [o.id, o]));
  // OPs canceladas não entram em nenhum número do painel
  const activeOps = ops.filter(o => !o.canceled_at);
  const activeIds = new Set(activeOps.map(o => o.id));

  cache = {
    ops: activeOps,
    opMap,
    flavors: allFlavors || [],
    demands: (demands || []).filter(d => activeIds.has(d.production_order_id)),
    portions: (portions || [])
      .filter(p => activeIds.has(p.production_order_id))
      .map(p => ({ ...p, completionDate: getPortionCompletionDate(p, opMap) }))
  };

  // Seletores de OP (mais recente primeiro) e de sabor
  if (!activeOps.some(o => o.id === filter.opId)) filter.opId = activeOps[0]?.id || null;
  const opSelectEl = document.getElementById('overview-op-select');
  if (opSelectEl) {
    opSelectEl.innerHTML = activeOps.map(o =>
      `<option value="${esc(o.id)}" ${o.id === filter.opId ? 'selected' : ''}>${esc(o.order_code)} — ${esc(weekdayName(o.production_date))}, ${esc(formatDate(o.production_date))}</option>`
    ).join('');
  }
  const flavorSelectEl = document.getElementById('overview-flavor-select');
  if (flavorSelectEl) {
    flavorSelectEl.innerHTML = `<option value="">Todos os sabores</option>` +
      cache.flavors.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    if (filter.flavorId && !cache.flavors.some(f => f.id === filter.flavorId)) filter.flavorId = '';
    flavorSelectEl.value = filter.flavorId;
  }

  renderFromCache();
}

// Aplica o filtro atual sobre os dados em memória e redesenha tudo
function renderFromCache() {
  const metricsContainer = document.getElementById('overview-metrics-container');
  const chartsSection = document.getElementById('overview-charts-section');
  const dailyOrdersSection = document.getElementById('daily-orders-section');
  if (!cache || !metricsContainer || !dailyOrdersSection) return;

  const byFlavor = x => !filter.flavorId || x.flavor_id === filter.flavorId;
  const flavorPortions = cache.portions.filter(byFlavor);
  const flavorDemands = cache.demands.filter(byFlavor);

  let ops, portions;
  if (filter.mode === 'op') {
    ops = cache.ops.filter(o => o.id === filter.opId);
    portions = flavorPortions.filter(p => p.production_order_id === filter.opId);
  } else if (filter.start && filter.end) {
    // Por Período: porções finalizadas no período + OPs com data de produção no período
    portions = flavorPortions.filter(p => p.completionDate >= filter.start && p.completionDate <= filter.end);
    const touched = new Set(portions.map(p => p.production_order_id));
    ops = cache.ops.filter(o => touched.has(o.id) || (o.production_date >= filter.start && o.production_date <= filter.end));
  } else {
    ops = cache.ops;
    portions = flavorPortions;
  }
  const opIds = new Set(ops.map(o => o.id));
  const demands = flavorDemands.filter(d => opIds.has(d.production_order_id));

  // Modal "Ver por sabor" segue o mesmo filtro
  modalAllFlavors = filter.flavorId ? cache.flavors.filter(f => f.id === filter.flavorId) : cache.flavors;
  modalProductionDemands = demands;
  modalProductionPortions = portions;

  const flavorName = filter.flavorId ? (cache.flavors.find(f => f.id === filter.flavorId)?.name || 'Sabor') : '';
  const scopeLabel = describeScope(ops);
  renderFilterSummary(scopeLabel, flavorName);

  renderMetricsCards(metricsContainer, { ops, portions, demands });

  if (chartsSection) {
    // Meses destacados no gráfico mensal = meses cobertos pelo filtro
    const highlightMonths = new Set();
    if (filter.mode === 'op') {
      ops.forEach(o => highlightMonths.add(String(o.production_date).slice(0, 7)));
    } else if (filter.start && filter.end) {
      let [y, m] = filter.start.slice(0, 7).split('-').map(Number);
      const endKey = filter.end.slice(0, 7);
      for (let i = 0; i < 400; i++) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        highlightMonths.add(key);
        if (key >= endKey) break;
        m += 1; if (m > 12) { m = 1; y += 1; }
      }
    }

    renderOverviewCharts(chartsSection, {
      ops,
      portions,
      demands,
      allPortions: flavorPortions,
      allDemands: flavorDemands,
      opMap: cache.opMap,
      scopeLabel,
      flavorLabel: flavorName,
      highlightMonths,
      onPickFlavor: id => applyFilter({ flavorId: filter.flavorId === id ? '' : id }),
      onPickRange: (start, end) => applyFilter({ mode: 'period', preset: 'custom', start, end })
    }).catch(err => console.error('Erro ao renderizar gráficos:', err));
  }

  renderDailyProductionOrders(dailyOrdersSection, portions, cache.opMap);
}

function describeScope(ops) {
  if (filter.mode === 'op') {
    const op = ops[0];
    return op ? `OP ${op.order_code} • ${weekdayName(op.production_date)}, ${formatDate(op.production_date)}` : 'Nenhuma OP selecionada';
  }
  if (!filter.start || !filter.end) return 'Todo o histórico';
  if (filter.start === filter.end) return `${weekdayName(filter.start)}, ${formatDate(filter.start)}`;
  const preset = PRESETS.find(p => p.key === filter.preset);
  const range = `${formatDate(filter.start)} a ${formatDate(filter.end)}`;
  return preset ? `${preset.label} (${range})` : range;
}

function renderFilterSummary(scopeLabel, flavorName) {
  const el = document.getElementById('filter-summary');
  if (!el) return;
  el.innerHTML = `
    <span class="material-symbols-outlined text-[16px]">filter_alt</span>
    <span>Mostrando: <strong class="text-ink-text">${esc(scopeLabel)}</strong></span>
    ${flavorName ? `
      <button data-clear="flavor" class="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full bg-bordeaux-primary text-on-primary font-bold" title="Remover filtro de sabor">
        ${esc(flavorName)}
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>` : '<span>• Todos os sabores</span>'}
    <span class="hidden md:inline text-text-muted/80">• Dica: clique nas barras dos gráficos para filtrar por mês, dia ou sabor.</span>
  `;
}

function renderMetricsCards(container, { ops, portions, demands }) {
  if (ops.length === 0 && portions.length === 0) {
    container.innerHTML = `
      <div class="p-6 bg-surface-card rounded-xl border border-border-subtle text-center text-text-muted font-body-md">
        Nenhuma ordem de produção ou produção encontrada para o filtro selecionado.
      </div>
    `;
    return;
  }

  const stageRun = (p, stage) => (p.process_runs || []).find(r => r.stage === stage && r.status === 'completed');
  const plannedKg = demands.reduce((acc, d) => acc + Number(d.planned_kg || 0), 0);
  const producedKg = portions.reduce((acc, p) => acc + Number(stageRun(p, 'vacuo')?.actual_kg || 0), 0);
  const remainingKg = Math.max(0, plannedKg - producedKg);
  const progressPct = plannedKg > 0 ? Math.round((producedKg / plannedKg) * 100) : 0;

  const totalPortions = portions.length;
  const finishedPortions = portions.filter(p => stageRun(p, 'embutimento') && stageRun(p, 'vacuo')).length;
  const labeledPortions = portions.filter(p => stageRun(p, 'rotulagem')).length;
  const finishedPct = totalPortions ? Math.round((finishedPortions / totalPortions) * 100) : 0;

  const productiveDays = new Set(portions
    .map(p => stageRun(p, 'vacuo')?.completed_at)
    .filter(Boolean)
    .map(d => getLocalDateString(new Date(d)))).size;
  const perDay = productiveDays ? producedKg / productiveDays : 0;
  const flavorCount = new Set(demands.map(d => d.flavor_id)).size;

  const tile = (accent, label, value, hint, extra = '') => `
    <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col gap-1 relative overflow-hidden min-w-0">
      <div class="absolute top-0 left-0 right-0 h-1 ${accent}"></div>
      <span class="text-[11px] font-bold uppercase tracking-wide text-text-muted">${label}</span>
      <span class="text-2xl font-bold text-ink-text leading-tight">${value}</span>
      <span class="text-xs text-text-muted">${hint}</span>
      ${extra}
    </article>`;
  const bar = (pct, color) => `
    <div class="w-full bg-surface-canvas rounded-full h-1.5 overflow-hidden mt-1">
      <div class="${color} h-full rounded-full" style="width: ${Math.min(100, pct)}%"></div>
    </div>`;

  container.innerHTML = `
    <section class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-md">
      ${tile('bg-text-muted', 'Planejado', fmtKg(plannedKg), `${ops.length} ${ops.length === 1 ? 'OP' : 'OPs'} • ${flavorCount} ${flavorCount === 1 ? 'sabor' : 'sabores'}`)}
      ${tile('bg-bordeaux-primary', 'Produzido (vácuo)', fmtKg(producedKg), `${progressPct}% do planejado`,
        `${bar(progressPct, 'bg-bordeaux-primary')}
         <button id="view-more-production-btn" class="self-start mt-1 text-xs font-bold text-bordeaux-primary hover:underline flex items-center gap-0.5">Ver por sabor <span class="material-symbols-outlined text-[14px]">arrow_forward</span></button>`)}
      ${tile('bg-brand-gold', 'Falta produzir', fmtKg(remainingKg), plannedKg > 0 ? `${Math.max(0, 100 - progressPct)}% do planejado` : 'Sem pedidos no filtro')}
      ${tile('bg-status-success', 'Porções finalizadas', `${finishedPortions} de ${totalPortions}`, `Embutimento e vácuo • rotuladas: ${labeledPortions}`, bar(finishedPct, 'bg-status-success'))}
      ${tile('bg-status-info', 'Média por dia de produção', fmtKg(perDay), productiveDays ? `${productiveDays} ${productiveDays === 1 ? 'dia' : 'dias'} com vácuo concluído` : 'Nenhum vácuo concluído')}
    </section>
  `;

  container.querySelector('#view-more-production-btn')?.addEventListener('click', () => openProductionModal());
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

function getPortionCompletionDate(p, opMap) {
  const runs = p.process_runs || [];
  const completedRuns = runs.filter(r => r.status === 'completed' && r.completed_at);
  if (completedRuns.length > 0) {
    // O fluxo termina no vácuo; a rotulagem acontece antes ou em paralelo, então só é usada como último recurso
    const endRun = completedRuns.find(r => r.stage === 'vacuo') ||
                   completedRuns.find(r => r.stage === 'embutimento') ||
                   completedRuns.find(r => r.stage === 'rotulagem') ||
                   completedRuns[0];
    return getLocalDateString(new Date(endRun.completed_at));
  }
  const op = opMap[p.production_order_id];
  return op ? op.production_date : getLocalDateString();
}

function renderDailyProductionOrders(container, portions, opMap) {
  if (!portions || portions.length === 0) {
    container.innerHTML = `
      <div class="bg-surface-card rounded-xl p-space-lg shadow-sm border border-border-subtle text-center text-text-muted font-body-md">
        Nenhum produto finalizado encontrado para a data/período selecionado.
      </div>
    `;
    return;
  }

  // Agrupar porções por data de finalização (completionDate)
  const portionsByDateMap = portions.reduce((acc, p) => {
    const dateKey = p.completionDate || 'Sem Data';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(p);
    return acc;
  }, {});

  // Ordenar datas em ordem decrescente
  const sortedDates = Object.keys(portionsByDateMap).sort((a, b) => b.localeCompare(a));

  container.innerHTML = `
    <details class="group bg-surface-card rounded-xl p-space-md sm:p-space-lg shadow-sm border border-border-subtle flex flex-col gap-space-md">
      <summary class="list-none cursor-pointer select-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[22px] transition-transform group-open:rotate-90">chevron_right</span>
            <h2 class="font-headline-sm text-headline-sm text-ink-text">Detalhe por dia de finalização</h2>
          </div>
          <p class="text-xs text-text-muted mt-0.5 ml-8">Cada sabor no dia em que terminou as etapas, com peso embutido, envacado, rótulos e tempo gasto. Clique para abrir.</p>
        </div>
        <span class="font-label-sm text-label-sm px-2.5 py-1 rounded bg-surface-canvas text-ink-text font-bold border border-border-subtle">
          ${sortedDates.length} ${sortedDates.length === 1 ? 'Dia com Registro' : 'Dias com Registros'}
        </span>
      </summary>

      <div class="flex flex-col gap-space-lg mt-space-md">
        ${sortedDates.map(dateKey => {
          const datePortions = portionsByDateMap[dateKey];

          // Agrupar porções deste dia por sabor
          const flavorsMap = datePortions.reduce((acc, p) => {
            const flavorId = p.flavor_id;
            const flavorName = p.flavors?.name || 'Sabor não identificado';
            const op = opMap[p.production_order_id];
            const opCode = op ? op.order_code : 'OP N/A';

            if (!acc[flavorId]) {
              acc[flavorId] = {
                id: flavorId,
                name: flavorName,
                opCodes: new Set([opCode]),
                portions: []
              };
            } else {
              acc[flavorId].opCodes.add(opCode);
            }
            acc[flavorId].portions.push(p);
            return acc;
          }, {});

          const flavorList = Object.values(flavorsMap);

          return `
            <div class="bg-surface-canvas rounded-xl p-space-md border border-border-subtle flex flex-col gap-space-md">
              <!-- Cabeçalho do Dia de Finalização -->
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">event_available</span>
                  <span class="font-title-lg text-title-lg text-ink-text font-bold">Produção Finalizada em: ${formatDate(dateKey)}</span>
                </div>
                <span class="px-2.5 py-1 rounded text-xs font-bold bg-surface-container-low text-status-success border border-border-subtle">
                  ${flavorList.length} ${flavorList.length === 1 ? 'Sabor Finalizado' : 'Sabores Finalizados'}
                </span>
              </div>

              <!-- Lista de Produtos / Sabores Finalizados neste Dia -->
              <div class="grid grid-cols-1 gap-space-md">
                ${flavorList.map(flavor => {
                  const allRuns = flavor.portions.flatMap(p => p.process_runs || []);

                  const embutimentoStats = calculateStageStats(allRuns, 'embutimento');
                  const vacuoStats = calculateStageStats(allRuns, 'vacuo');
                  const rotulagemStats = calculateStageStats(allRuns, 'rotulagem');
                  const opCodesStr = Array.from(flavor.opCodes).join(', ');

                  return `
                    <div class="bg-surface-card rounded-lg p-space-md border border-border-subtle flex flex-col gap-space-sm shadow-sm">
                      <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                          <span class="material-symbols-outlined text-[20px] text-bordeaux-primary">restaurant_menu</span>
                          <h3 class="font-title-md text-title-md text-ink-text font-bold">${flavor.name}</h3>
                          <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-surface-canvas text-bordeaux-primary border border-border-subtle">${opCodesStr}</span>
                        </div>
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

                        <!-- 3. Rotulados (Contagem Automática) -->
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
            </div>
          `;
        }).join('')}
      </div>
    </details>
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
