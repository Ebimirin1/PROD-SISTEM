// Gráficos da Visão Geral — produção mensal, andamento das etapas e o recorte do filtro.
// Chart.js é carregado sob demanda (cdnjs, versão fixa), sem build e compatível com GitHub Pages.
// A produção real é sempre o vácuo concluído (o fluxo termina no vácuo; rotulagem é paralela).

const CHART_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

// Cores dos gráficos, tiradas da identidade (vinho e dourado) e clareadas o suficiente
// para leitura em barras finas (paleta conferida para daltonismo).
const COLORS = {
  wine: '#9b2b2b',      // série principal: produzido / embutimento
  gold: '#c98a0b',      // segunda série: vácuo / pedidos
  planned: '#d8cfc2',   // referência: planejado
  success: '#176B45',   // status: concluídas
  amber: '#D99311',     // status: em andamento
  pending: '#e4ddd2',   // status: pendentes
  muted: '#5E5650',
  grid: '#efe9df',
  ink: '#1F1712'
};

const STAGES = [
  { key: 'embutimento', label: 'Embutimento' },
  { key: 'vacuo', label: 'Vácuo' },
  { key: 'rotulagem', label: 'Rotulagem (paralela)' }
];

const PRODUCT_TYPES = { manta: 'Manta', massa: 'Massa', linguica: 'Linguiça', granel: 'Granel', hamburguer: 'Hambúrguer' };
const DESTINATIONS = { emporio: 'Empório', lanchonete: 'Lanchonete', atacado: 'Atacado', outro: 'Outro' };
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

let chartJsPromise = null;
const activeCharts = {};

function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (chartJsPromise) return chartJsPromise;

  chartJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHART_JS_URL;
    script.async = true;
    script.onload = () => (window.Chart ? resolve(window.Chart) : reject(new Error('Chart.js não inicializou.')));
    script.onerror = () => {
      chartJsPromise = null; // permite tentar de novo
      reject(new Error('Não foi possível carregar a biblioteca de gráficos.'));
    };
    document.head.appendChild(script);
  });
  return chartJsPromise;
}

// ---------- Datas ----------

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const monthKey = iso => String(iso).slice(0, 7); // 'YYYY-MM'
const monthLabel = key => { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`; };
const monthLongLabel = key => {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
};
export function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return { start: `${key}-01`, end: localDateString(new Date(y, m, 0)) };
}
function lastMonths(n, ref = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}
function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDateString(date);
}
const fmtDay = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

// ---------- Formatação ----------

const sum = (arr, fn) => arr.reduce((acc, item) => acc + Number(fn(item) || 0), 0);
export const fmtKg = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`;
const fmtKgPrecise = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
const fmtPct = v => `${Math.round(v)}%`;
const fmtDuration = min => {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const completedRun = (p, stage) => (p.process_runs || []).find(r => r.stage === stage && r.status === 'completed');

/**
 * Agrega os dados da Visão Geral nos formatos dos gráficos. Função pura (sem DOM).
 * - portions/demands/ops: o recorte do filtro (período ou OP, e sabor)
 * - allPortions/allDemands: só o filtro de sabor, para a produção mensal (12 meses)
 */
export function buildChartData({ portions, demands, ops, allPortions, allDemands, opMap, today = new Date() }) {
  portions = portions || [];
  demands = demands || [];
  ops = ops || [];

  // 1) Produção mensal — últimos 12 meses (produzido = vácuo concluído no mês; planejado = OPs do mês)
  const months = lastMonths(12, today);
  const producedByMonth = Object.fromEntries(months.map(m => [m, 0]));
  const plannedByMonth = Object.fromEntries(months.map(m => [m, 0]));
  const currentYear = String(today.getFullYear());
  let yearToDate = 0;
  (allPortions || []).forEach(p => {
    const run = completedRun(p, 'vacuo');
    if (!run?.completed_at) return;
    const day = localDateString(new Date(run.completed_at));
    const key = monthKey(day);
    if (key in producedByMonth) producedByMonth[key] += Number(run.actual_kg || 0);
    if (day.slice(0, 4) === currentYear) yearToDate += Number(run.actual_kg || 0);
  });
  (allDemands || []).forEach(d => {
    const op = opMap?.[d.production_order_id];
    if (!op || op.canceled_at) return;
    const key = monthKey(op.production_date);
    if (key in plannedByMonth) plannedByMonth[key] += Number(d.planned_kg || 0);
  });
  const producedMonths = months.filter(m => producedByMonth[m] > 0);
  const best = producedMonths.reduce((acc, m) => (!acc || producedByMonth[m] > producedByMonth[acc] ? m : acc), null);
  const currentMonth = months[months.length - 1];
  const monthly = {
    months,
    labels: months.map(monthLabel),
    produced: months.map(m => producedByMonth[m]),
    planned: months.map(m => plannedByMonth[m]),
    stats: {
      currentMonth,
      currentMonthLabel: monthLongLabel(currentMonth),
      currentKg: producedByMonth[currentMonth],
      averageKg: producedMonths.length ? sum(producedMonths, m => producedByMonth[m]) / producedMonths.length : 0,
      averageMonths: producedMonths.length,
      bestMonthLabel: best ? monthLongLabel(best) : '—',
      bestKg: best ? producedByMonth[best] : 0,
      yearToDate,
      currentYear
    },
    rows: [...months].reverse().map(m => ({
      key: m,
      label: monthLongLabel(m),
      planned: plannedByMonth[m],
      produced: producedByMonth[m],
      pct: plannedByMonth[m] > 0 ? (producedByMonth[m] / plannedByMonth[m]) * 100 : null
    }))
  };

  // 2) Andamento das etapas (porções concluídas / em andamento / pendentes)
  const stageCounts = {};
  STAGES.forEach(s => { stageCounts[s.key] = { completed: 0, in_progress: 0, pending: 0 }; });
  portions.forEach(p => {
    STAGES.forEach(s => {
      const run = (p.process_runs || []).find(r => r.stage === s.key);
      const status = run?.status === 'completed' ? 'completed' : run?.status === 'in_progress' ? 'in_progress' : 'pending';
      stageCounts[s.key][status] += 1;
    });
  });

  // 3) Produção diária (vácuo concluído). Períodos longos agrupam por semana.
  const dailyMap = {};
  portions.forEach(p => {
    const run = completedRun(p, 'vacuo');
    if (!run?.completed_at) return;
    const day = localDateString(new Date(run.completed_at));
    dailyMap[day] = (dailyMap[day] || 0) + Number(run.actual_kg || 0);
  });
  let days = Object.keys(dailyMap).sort();
  const spanDays = days.length ? (new Date(days[days.length - 1]) - new Date(days[0])) / 86400000 : 0;
  let daily;
  if (spanDays > 62) {
    const weekMap = {};
    days.forEach(d => { const w = mondayOf(d); weekMap[w] = (weekMap[w] || 0) + dailyMap[d]; });
    const weeks = Object.keys(weekMap).sort();
    daily = {
      grouping: 'week',
      keys: weeks,
      labels: weeks.map(w => `sem. ${fmtDay(w)}`),
      values: weeks.map(w => weekMap[w])
    };
  } else {
    daily = { grouping: 'day', keys: days, labels: days.map(fmtDay), values: days.map(d => dailyMap[d]) };
  }
  const productiveDays = days.length;

  // 4) Planejado x produzido por sabor (todos os sabores do recorte)
  const flavorMap = {};
  const ensureFlavor = (id, name) => {
    if (!flavorMap[id]) flavorMap[id] = { id, name: name || 'Sabor', requested: 0, actual: 0, portionPlanned: 0 };
    return flavorMap[id];
  };
  demands.forEach(d => { ensureFlavor(d.flavor_id, d.flavors?.name).requested += Number(d.planned_kg || 0); });
  portions.forEach(p => {
    const row = ensureFlavor(p.flavor_id, p.flavors?.name);
    row.portionPlanned += Number(p.planned_kg || 0);
    const run = completedRun(p, 'vacuo');
    if (run) row.actual += Number(run.actual_kg || 0);
  });
  const flavors = Object.values(flavorMap)
    .map(f => ({ id: f.id, name: f.name, requested: f.requested > 0 ? f.requested : f.portionPlanned, actual: f.actual }))
    .filter(f => f.requested > 0 || f.actual > 0)
    .sort((a, b) => b.requested - a.requested || b.actual - a.actual);

  // 5) Pedidos por tipo de produto e por destino (kg planejados)
  const byType = {};
  const byDestination = {};
  demands.forEach(d => {
    const t = PRODUCT_TYPES[d.requested_product_type] || 'Não informado';
    const dest = DESTINATIONS[d.destination_key] || 'Não informado';
    byType[t] = (byType[t] || 0) + Number(d.planned_kg || 0);
    byDestination[dest] = (byDestination[dest] || 0) + Number(d.planned_kg || 0);
  });
  const ranked = obj => Object.entries(obj).map(([label, value]) => ({ label, value })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);

  // 6) Rendimento por OP (kg por hora de cada etapa), últimas 15 OPs do recorte
  const orderedOps = [...ops]
    .sort((a, b) => String(a.production_date).localeCompare(String(b.production_date)) || String(a.order_code).localeCompare(String(b.order_code)))
    .slice(-15);
  const timed = ['embutimento', 'vacuo'];
  const opRates = {
    labels: orderedOps.map(o => o.order_code),
    series: timed.map(stage => ({ stage, label: stage === 'vacuo' ? 'Vácuo' : 'Embutimento', kgPerHour: [], minPerPortion: [], count: [] }))
  };
  orderedOps.forEach(op => {
    const opPortions = portions.filter(p => p.production_order_id === op.id);
    opRates.series.forEach(serie => {
      let totalMin = 0, totalKg = 0, n = 0;
      opPortions.forEach(p => {
        const run = completedRun(p, serie.stage);
        if (run?.started_at && run.completed_at) {
          const m = (new Date(run.completed_at) - new Date(run.started_at)) / 60000;
          if (m >= 0) { totalMin += m; totalKg += Number(run.actual_kg || 0); n += 1; }
        }
      });
      serie.kgPerHour.push(totalMin > 0 ? totalKg / (totalMin / 60) : 0);
      serie.minPerPortion.push(n ? totalMin / n : 0);
      serie.count.push(n);
    });
  });

  return {
    monthly,
    stageCounts,
    daily,
    productiveDays,
    flavors,
    byType: ranked(byType),
    byDestination: ranked(byDestination),
    opRates
  };
}

// ---------- Desenho ----------

function card({ id, title, subtitle, icon, span = '', height = 260, extra = '' }) {
  return `
    <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col gap-space-sm min-w-0 ${span}">
      <div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">${icon}</span>
        <div class="flex flex-col min-w-0">
          <h3 class="font-title-md text-title-md text-ink-text">${title}</h3>
          <p class="text-xs text-text-muted">${subtitle}</p>
        </div>
      </div>
      <div class="relative" style="height:${height}px" id="${id}-wrap">
        <canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas>
      </div>
      ${extra}
    </article>
  `;
}

function showEmpty(id, message) {
  const wrap = document.getElementById(`${id}-wrap`);
  if (wrap) {
    wrap.innerHTML = `<div class="h-full flex items-center justify-center text-center text-xs italic text-text-muted bg-surface-canvas rounded-lg border border-border-subtle px-4">${message}</div>`;
  }
}

function destroyAll() {
  Object.keys(activeCharts).forEach(id => { activeCharts[id].destroy(); delete activeCharts[id]; });
}

function drawChart(id, config) {
  if (activeCharts[id]) { activeCharts[id].destroy(); delete activeCharts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  activeCharts[id] = new window.Chart(canvas, config);
}

const axisTicks = { color: COLORS.muted, font: { family: 'Ubuntu', size: 11 } };
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  plugins: {
    legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12, font: { family: 'Ubuntu', size: 11 }, color: COLORS.ink } },
    tooltip: { backgroundColor: '#1F1712', titleFont: { family: 'Ubuntu', weight: '500' }, bodyFont: { family: 'Ubuntu' }, padding: 10 }
  }
};
const kgAxis = { beginAtZero: true, ticks: { ...axisTicks, callback: v => fmtKg(v) }, grid: { color: COLORS.grid }, border: { display: false } };
const catAxis = { ticks: axisTicks, grid: { display: false }, border: { color: COLORS.grid } };

// Barras clicáveis: cursor de mão e callback com o índice da barra
function clickable(onPick) {
  if (!onPick) return {};
  return {
    onClick: (_evt, els) => { if (els.length) onPick(els[0].index); },
    onHover: (evt, els) => { if (evt.native?.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
  };
}

function statTile(label, value, hint) {
  return `
    <div class="flex flex-col gap-0.5 p-3 rounded-lg bg-surface-canvas border border-border-subtle min-w-0">
      <span class="text-[11px] font-bold uppercase tracking-wide text-text-muted">${label}</span>
      <span class="text-xl font-bold text-ink-text leading-tight">${value}</span>
      <span class="text-[11px] text-text-muted truncate">${hint}</span>
    </div>`;
}

function monthlyTable(rows) {
  return `
    <details class="group border-t border-border-subtle pt-2">
      <summary class="cursor-pointer select-none text-xs font-bold text-bordeaux-primary flex items-center gap-1 list-none">
        <span class="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">chevron_right</span>
        Ver tabela mês a mês
      </summary>
      <div class="overflow-x-auto mt-2">
        <table class="w-full text-xs">
          <thead><tr class="text-left text-text-muted border-b border-border-subtle">
            <th class="py-1.5 pr-3 font-semibold">Mês</th>
            <th class="py-1.5 pr-3 font-semibold text-right">Planejado</th>
            <th class="py-1.5 pr-3 font-semibold text-right">Produzido</th>
            <th class="py-1.5 font-semibold text-right">Atendido</th>
          </tr></thead>
          <tbody class="divide-y divide-border-subtle" style="font-variant-numeric: tabular-nums">
            ${rows.map(r => `
              <tr>
                <td class="py-1.5 pr-3 text-ink-text">${r.label}</td>
                <td class="py-1.5 pr-3 text-right text-text-muted">${fmtKgPrecise(r.planned)}</td>
                <td class="py-1.5 pr-3 text-right font-bold text-ink-text">${fmtKgPrecise(r.produced)}</td>
                <td class="py-1.5 text-right text-text-muted">${r.pct === null ? '—' : fmtPct(r.pct)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;
}

function sectionTitle(icon, title, subtitle) {
  return `
    <div class="flex items-end justify-between flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">${icon}</span>
        <h2 class="font-headline-sm text-headline-sm text-ink-text">${title}</h2>
      </div>
      ${subtitle ? `<span class="text-xs text-text-muted">${subtitle}</span>` : ''}
    </div>`;
}

/**
 * Desenha a produção mensal e os gráficos do recorte.
 * input: dados de buildChartData + { scopeLabel, flavorLabel, highlightMonths, onPickFlavor, onPickRange, selectedFlavorId }
 */
export async function renderOverviewCharts(container, input) {
  if (!container) return;
  const data = buildChartData(input);
  const { onPickFlavor, onPickRange, highlightMonths, scopeLabel, flavorLabel } = input;

  destroyAll();

  const s = data.monthly.stats;
  const flavorRows = Math.max(data.flavors.length, 1);
  const flavorHeight = Math.min(Math.max(140, flavorRows * 34 + 40), 720);

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <!-- Produção mensal -->
      <section class="flex flex-col gap-space-sm">
        ${sectionTitle('calendar_month', 'Produção mensal', `Últimos 12 meses${flavorLabel ? ` • ${esc(flavorLabel)}` : ''} • clique num mês para filtrar`)}
        <div class="grid grid-cols-1 xl:grid-cols-4 gap-space-md">
          ${card({
            id: 'chart-monthly',
            title: 'Quilos produzidos por mês',
            subtitle: 'Produzido = vácuo concluído no mês. Planejado = pedidos das OPs com data de produção no mês.',
            icon: 'bar_chart',
            span: 'xl:col-span-3',
            height: 280,
            extra: monthlyTable(data.monthly.rows)
          })}
          <div class="grid grid-cols-2 xl:grid-cols-1 gap-space-sm content-start">
            ${statTile(`Mês atual`, fmtKg(s.currentKg), s.currentMonthLabel)}
            ${statTile('Média mensal', fmtKg(s.averageKg), s.averageMonths ? `${s.averageMonths} ${s.averageMonths === 1 ? 'mês' : 'meses'} com produção` : 'Sem produção nos últimos 12 meses')}
            ${statTile('Melhor mês', fmtKg(s.bestKg), s.bestMonthLabel)}
            ${statTile(`Acumulado ${s.currentYear}`, fmtKg(s.yearToDate), 'Desde 1º de janeiro')}
          </div>
        </div>
      </section>

      <!-- Recorte do filtro -->
      <section class="flex flex-col gap-space-sm">
        ${sectionTitle('monitoring', 'Produção no filtro', esc(scopeLabel || ''))}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
          ${card({ id: 'chart-stages', title: 'Andamento das etapas', subtitle: 'Porções concluídas, em andamento e pendentes em cada etapa. Mostra onde está o gargalo.', icon: 'stacked_bar_chart', height: 200 })}
          ${card({ id: 'chart-daily', title: data.daily.grouping === 'week' ? 'Produção por semana (kg)' : 'Produção por dia (kg)', subtitle: 'Vácuo concluído. Clique numa barra para ver só aquele dia.', icon: 'show_chart', height: 200 })}
          ${card({ id: 'chart-flavors', title: 'Planejado x produzido por sabor', subtitle: 'Todos os sabores do filtro. Clique num sabor para filtrar o painel por ele.', icon: 'restaurant_menu', span: 'lg:col-span-2', height: flavorHeight })}
          ${card({ id: 'chart-types', title: 'Pedidos por tipo de produto', subtitle: 'Quilos planejados nas ordens do filtro.', icon: 'category', height: 200 })}
          ${card({ id: 'chart-destinations', title: 'Pedidos por destino', subtitle: 'Quilos planejados nas ordens do filtro.', icon: 'local_shipping', height: 200 })}
          ${card({ id: 'chart-rates', title: 'Rendimento por ordem de produção (kg/h)', subtitle: 'Quilos por hora de trabalho em cada etapa (últimas 15 OPs do filtro). O balão mostra o tempo médio por porção.', icon: 'speed', span: 'lg:col-span-2', height: 240 })}
        </div>
      </section>
    </div>
  `;

  let Chart;
  try {
    Chart = await loadChartJs();
  } catch (err) {
    container.insertAdjacentHTML('afterbegin', `<div class="p-4 mb-space-md bg-badge-error-bg text-badge-error-text rounded-lg text-sm">${err.message} Verifique a conexão e use "Atualizar".</div>`);
    return;
  }
  Chart.defaults.font.family = 'Ubuntu';

  // 1) Produção mensal (planejado em cinza de referência, produzido em vinho)
  if (data.monthly.produced.every(v => v === 0) && data.monthly.planned.every(v => v === 0)) {
    showEmpty('chart-monthly', 'Nenhuma produção registrada nos últimos 12 meses.');
  } else {
    const hl = highlightMonths && highlightMonths.size ? highlightMonths : null;
    const fade = (color, i) => (!hl || hl.has(data.monthly.months[i]) ? color : `${color}80`);
    drawChart('chart-monthly', {
      type: 'bar',
      data: {
        labels: data.monthly.labels,
        datasets: [
          { label: 'Planejado', data: data.monthly.planned, backgroundColor: data.monthly.planned.map((_, i) => fade(COLORS.planned, i)), borderRadius: 4, borderSkipped: 'start', categoryPercentage: 0.7, barPercentage: 0.9 },
          { label: 'Produzido (vácuo)', data: data.monthly.produced, backgroundColor: data.monthly.produced.map((_, i) => fade(COLORS.wine, i)), borderRadius: 4, borderSkipped: 'start', categoryPercentage: 0.7, barPercentage: 0.9 }
        ]
      },
      options: {
        ...baseOptions,
        ...clickable(onPickRange ? i => { const r = monthRange(data.monthly.months[i]); onPickRange(r.start, r.end); } : null),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              title: items => monthLongLabel(data.monthly.months[items[0].dataIndex]),
              label: ctx => `${ctx.dataset.label}: ${fmtKgPrecise(ctx.parsed.y)}`,
              afterBody: items => {
                const i = items[0].dataIndex;
                const p = data.monthly.planned[i];
                return p > 0 ? `Atendido: ${fmtPct((data.monthly.produced[i] / p) * 100)}` : '';
              }
            }
          }
        },
        scales: { x: catAxis, y: kgAxis }
      }
    });
  }

  // 2) Andamento das etapas (barras horizontais empilhadas por status)
  const totalPortions = Object.values(data.stageCounts.embutimento).reduce((a, b) => a + b, 0);
  if (totalPortions === 0) {
    showEmpty('chart-stages', 'Nenhuma porção de produção gerada para o filtro selecionado.');
  } else {
    const statusSets = [
      { key: 'completed', label: 'Concluídas', color: COLORS.success },
      { key: 'in_progress', label: 'Em andamento', color: COLORS.amber },
      { key: 'pending', label: 'Pendentes', color: COLORS.pending }
    ];
    drawChart('chart-stages', {
      type: 'bar',
      data: {
        labels: STAGES.map(st => st.label),
        datasets: statusSets.map(st => ({
          label: st.label,
          backgroundColor: st.color,
          borderColor: '#ffffff',
          borderWidth: { right: 2 },
          borderSkipped: false,
          barPercentage: 0.7,
          data: STAGES.map(stage => data.stageCounts[stage.key][st.key])
        }))
      },
      options: {
        ...baseOptions,
        indexAxis: 'y',
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x} de ${totalPortions} porções (${fmtPct((ctx.parsed.x / totalPortions) * 100)})` }
          }
        },
        scales: {
          x: { stacked: true, beginAtZero: true, max: totalPortions, ticks: { ...axisTicks, precision: 0 }, grid: { color: COLORS.grid }, border: { display: false }, title: { display: true, text: 'Porções', color: COLORS.muted } },
          y: { ...catAxis, stacked: true }
        }
      }
    });
  }

  // 3) Produção por dia / semana
  if (data.daily.keys.length === 0) {
    showEmpty('chart-daily', 'Nenhum vácuo concluído no filtro selecionado.');
  } else {
    drawChart('chart-daily', {
      type: 'bar',
      data: {
        labels: data.daily.labels,
        datasets: [{ label: 'Produzido (vácuo)', data: data.daily.values, backgroundColor: COLORS.wine, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 36 }]
      },
      options: {
        ...baseOptions,
        ...clickable(onPickRange ? i => {
          const key = data.daily.keys[i];
          if (data.daily.grouping === 'week') {
            const [y, m, d] = key.split('-').map(Number);
            onPickRange(key, localDateString(new Date(y, m - 1, d + 6)));
          } else {
            onPickRange(key, key);
          }
        } : null),
        plugins: { ...baseOptions.plugins, legend: { display: false }, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: ctx => `Produzido: ${fmtKgPrecise(ctx.parsed.y)}` } } },
        scales: { x: catAxis, y: kgAxis }
      }
    });
  }

  // 4) Planejado x produzido por sabor
  if (data.flavors.length === 0) {
    showEmpty('chart-flavors', 'Nenhuma demanda por sabor para o filtro selecionado.');
  } else {
    drawChart('chart-flavors', {
      type: 'bar',
      data: {
        labels: data.flavors.map(f => f.name),
        datasets: [
          { label: 'Planejado', data: data.flavors.map(f => f.requested), backgroundColor: COLORS.planned, borderRadius: 4, borderSkipped: 'start', categoryPercentage: 0.75, barPercentage: 0.9 },
          { label: 'Produzido (vácuo)', data: data.flavors.map(f => f.actual), backgroundColor: COLORS.wine, borderRadius: 4, borderSkipped: 'start', categoryPercentage: 0.75, barPercentage: 0.9 }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: 'y',
        ...clickable(onPickFlavor ? i => onPickFlavor(data.flavors[i].id) : null),
        interaction: { mode: 'index', axis: 'y', intersect: false },
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmtKgPrecise(ctx.parsed.x)}`,
              afterBody: items => {
                const f = data.flavors[items[0].dataIndex];
                return f.requested > 0 ? `Atendido: ${fmtPct((f.actual / f.requested) * 100)}` : '';
              }
            }
          }
        },
        scales: { x: kgAxis, y: catAxis }
      }
    });
  }

  // 5) Pedidos por tipo e por destino (barras ordenadas, uma cor)
  [['chart-types', data.byType], ['chart-destinations', data.byDestination]].forEach(([id, rows]) => {
    if (rows.length === 0) {
      showEmpty(id, 'Nenhum pedido no filtro selecionado.');
      return;
    }
    const total = sum(rows, r => r.value);
    drawChart(id, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.label),
        datasets: [{ label: 'Planejado', data: rows.map(r => r.value), backgroundColor: COLORS.gold, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 }]
      },
      options: {
        ...baseOptions,
        indexAxis: 'y',
        plugins: {
          ...baseOptions.plugins,
          legend: { display: false },
          tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: ctx => `${fmtKgPrecise(ctx.parsed.x)} (${fmtPct((ctx.parsed.x / total) * 100)} do total)` } }
        },
        scales: { x: kgAxis, y: catAxis }
      }
    });
  });

  // 6) Rendimento por OP
  const hasRates = data.opRates.series.some(se => se.count.some(c => c > 0));
  if (!hasRates) {
    showEmpty('chart-rates', 'Nenhuma etapa concluída com início e fim registrados no filtro selecionado.');
  } else {
    drawChart('chart-rates', {
      type: 'bar',
      data: {
        labels: data.opRates.labels,
        datasets: data.opRates.series.map(se => ({
          label: se.label,
          data: se.kgPerHour,
          backgroundColor: se.stage === 'vacuo' ? COLORS.gold : COLORS.wine,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 32
        }))
      },
      options: {
        ...baseOptions,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label: ctx => {
                const se = data.opRates.series[ctx.datasetIndex];
                const n = se.count[ctx.dataIndex];
                if (!n) return `${se.label}: sem etapas concluídas`;
                return `${se.label}: ${ctx.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg/h • ${fmtDuration(se.minPerPortion[ctx.dataIndex])} por porção (${n})`;
              }
            }
          }
        },
        scales: {
          x: catAxis,
          y: { beginAtZero: true, ticks: { ...axisTicks, callback: v => `${v} kg/h` }, grid: { color: COLORS.grid }, border: { display: false } }
        }
      }
    });
  }
}
