// Gráficos da Visão Geral — mostram o fluxo da produção de ponta a ponta.
// Chart.js é carregado sob demanda (cdnjs, versão fixa), sem build e compatível com GitHub Pages.

const CHART_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

// Cores alinhadas ao tema do sistema (tailwind-config do index.html)
const COLORS = {
  bordeaux: '#8C0303',
  success: '#176B45',
  amber: '#D99311',
  info: '#205A85',
  muted: '#5C5150',
  border: '#E8E1DF',
  ink: '#260101'
};

const STAGES = [
  { key: 'embutimento', label: 'Embutimento', color: COLORS.bordeaux },
  { key: 'vacuo', label: 'Vácuo', color: COLORS.amber },
  { key: 'rotulagem', label: 'Rotulagem', color: COLORS.success }
];

const SHIPMENT_STATUS = [
  { key: 'pending', label: 'Pendente', color: COLORS.muted },
  { key: 'separated_for_invoice', label: 'Separado p/ NF', color: COLORS.info },
  { key: 'separated_for_dispatch', label: 'Separado p/ expedição', color: COLORS.amber },
  { key: 'delivered', label: 'Entregue', color: COLORS.success }
];

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

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(str) {
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

const sum = (arr, fn) => arr.reduce((acc, item) => acc + Number(fn(item) || 0), 0);

/**
 * Agrega os dados já carregados pela Visão Geral nos formatos usados pelos gráficos.
 * Função pura (sem DOM) para facilitar testes.
 */
export function buildChartData({ filteredOps, filteredPortions, demands, totalsMap, lots, shipmentLines, today = new Date() }) {
  const opIds = new Set((filteredOps || []).map(o => o.id));
  const portions = filteredPortions || [];
  const demandsInScope = (demands || []).filter(d => opIds.has(d.production_order_id));

  // 1) Funil: quanto cada etapa já entregou (kg)
  const plannedKg = sum(filteredOps || [], o => totalsMap?.[o.id]?.planned_total_kg);
  const finishedKg = sum(filteredOps || [], o => totalsMap?.[o.id]?.produced_total_kg);
  const stageKg = {};
  const stageCounts = {};
  STAGES.forEach(s => {
    stageKg[s.key] = 0;
    stageCounts[s.key] = { pending: 0, in_progress: 0, completed: 0 };
  });

  portions.forEach(p => {
    const runsByStage = {};
    (p.process_runs || []).forEach(r => { runsByStage[r.stage] = r; });
    STAGES.forEach(s => {
      const run = runsByStage[s.key];
      const status = run?.status === 'completed' ? 'completed' : run?.status === 'in_progress' ? 'in_progress' : 'pending';
      stageCounts[s.key][status] += 1;
      if (status === 'completed') stageKg[s.key] += Number(run.actual_kg || 0);
    });
  });

  const deliveredKg = sum(
    (shipmentLines || []).filter(l => l.status === 'delivered'),
    l => l.separated_kg
  );

  const funnel = [
    { label: 'Planejado', value: plannedKg, color: COLORS.muted },
    { label: 'Embutido', value: stageKg.embutimento, color: COLORS.bordeaux },
    { label: 'Envacado (vácuo)', value: stageKg.vacuo, color: COLORS.amber },
    { label: 'Rotulado', value: stageKg.rotulagem, color: COLORS.success },
    { label: 'Lote acabado', value: finishedKg, color: COLORS.info },
    { label: 'Entregue', value: deliveredKg, color: COLORS.ink }
  ];

  // 2) Planejado x real por sabor (mesma regra do modal "Produção Total por Sabor")
  const flavorMap = {};
  const ensureFlavor = (id, name) => {
    if (!flavorMap[id]) flavorMap[id] = { name: name || 'Sabor', requested: 0, actual: 0, portionPlanned: 0 };
    return flavorMap[id];
  };
  demandsInScope.forEach(d => { ensureFlavor(d.flavor_id, d.flavors?.name).requested += Number(d.planned_kg || 0); });
  portions.forEach(p => {
    const row = ensureFlavor(p.flavor_id, p.flavors?.name);
    row.portionPlanned += Number(p.planned_kg || 0);
    (p.process_runs || []).forEach(r => {
      if (r.stage === 'vacuo' && r.status === 'completed') row.actual += Number(r.actual_kg || 0);
    });
  });
  const flavors = Object.values(flavorMap)
    .map(f => ({ name: f.name, requested: f.requested > 0 ? f.requested : f.portionPlanned, actual: f.actual }))
    .filter(f => f.requested > 0 || f.actual > 0)
    .sort((a, b) => b.requested - a.requested)
    .slice(0, 10);

  // 3) Evolução diária por etapa (kg concluídos por dia)
  const dailyMap = {};
  portions.forEach(p => {
    (p.process_runs || []).forEach(r => {
      if (r.status !== 'completed' || !r.completed_at) return;
      const day = localDateString(new Date(r.completed_at));
      if (!dailyMap[day]) dailyMap[day] = { embutimento: 0, vacuo: 0, rotulagem: 0 };
      if (dailyMap[day][r.stage] !== undefined) dailyMap[day][r.stage] += Number(r.actual_kg || 0);
    });
  });
  const days = Object.keys(dailyMap).sort();

  // 4) Pedidos de saída por status
  const lines = (shipmentLines || []).filter(l => l.status !== 'canceled');
  const shipment = SHIPMENT_STATUS.map(s => ({
    label: s.label,
    color: s.color,
    value: lines.filter(l => l.status === s.key).length
  }));

  // 5) Estoque por faixa de validade (só lotes com saldo)
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const buckets = [
    { label: 'Vencido', color: COLORS.bordeaux, value: 0 },
    { label: 'Vence em até 7 dias', color: COLORS.amber, value: 0 },
    { label: 'Vence em 8–30 dias', color: COLORS.info, value: 0 },
    { label: 'Acima de 30 dias', color: COLORS.success, value: 0 }
  ];
  (lots || []).forEach(l => {
    const balance = Number(l.balance_kg || 0);
    if (balance <= 0 || !l.expiry_date) return;
    const daysLeft = Math.round((parseLocalDate(l.expiry_date) - todayMid) / 86400000);
    const idx = daysLeft < 0 ? 0 : daysLeft <= 7 ? 1 : daysLeft <= 30 ? 2 : 3;
    buckets[idx].value += balance;
  });

  return {
    funnel,
    stageCounts,
    flavors,
    daily: {
      labels: days,
      series: STAGES.map(s => ({ label: s.label, color: s.color, data: days.map(d => dailyMap[d][s.key]) }))
    },
    shipment,
    expiry: buckets
  };
}

const fmtKg = v => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`;
const fmtDay = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}`; };

function cardShell(id, title, subtitle, icon, wide = false) {
  return `
    <article class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col gap-space-sm ${wide ? 'lg:col-span-2' : ''}">
      <div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">${icon}</span>
        <div class="flex flex-col">
          <h3 class="font-title-md text-title-md text-ink-text font-bold">${title}</h3>
          <p class="text-xs text-text-muted">${subtitle}</p>
        </div>
      </div>
      <div class="relative h-[260px]" id="${id}-wrap">
        <canvas id="${id}" role="img" aria-label="${title}"></canvas>
      </div>
    </article>
  `;
}

function showEmpty(id, message) {
  const wrap = document.getElementById(`${id}-wrap`);
  if (wrap) {
    wrap.innerHTML = `<div class="h-full flex items-center justify-center text-center text-xs italic text-text-muted bg-surface-canvas rounded-lg border border-border-subtle px-4">${message}</div>`;
  }
}

function drawChart(id, config) {
  if (activeCharts[id]) { activeCharts[id].destroy(); delete activeCharts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  activeCharts[id] = new window.Chart(canvas, config);
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: { family: 'Work Sans', size: 11 }, color: COLORS.ink } } }
};
const axisTicks = { color: COLORS.muted, font: { family: 'Work Sans', size: 11 } };

export async function renderOverviewCharts(container, input) {
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">monitoring</span>
        <h2 class="font-headline-sm text-headline-sm text-ink-text">Fluxo da Produção</h2>
      </div>
      <div id="overview-charts-grid" class="grid grid-cols-1 lg:grid-cols-2 gap-space-md"></div>
    </div>
  `;
  const grid = container.querySelector('#overview-charts-grid');

  grid.innerHTML = [
    cardShell('chart-funnel', 'Funil do fluxo (kg)', 'Do planejado até a entrega: onde o volume deixa de avançar.', 'filter_alt', true),
    cardShell('chart-stages', 'Porções por etapa', 'Pendentes, em andamento e concluídas — mostra o gargalo.', 'stacked_bar_chart'),
    cardShell('chart-flavors', 'Planejado x real por sabor', 'Top 10 sabores por quantidade solicitada (real = vácuo concluído).', 'restaurant_menu'),
    cardShell('chart-daily', 'Produção concluída por dia (kg)', 'Quantidade real concluída em cada etapa, por dia.', 'show_chart', true),
    cardShell('chart-shipment', 'Linhas de pedido por status', 'Separação, NF, expedição e entrega (todos os pedidos).', 'local_shipping'),
    cardShell('chart-expiry', 'Estoque por validade (kg)', 'Saldo em câmara por faixa de dias até o vencimento (todo o estoque).', 'event_busy')
  ].join('');

  let Chart;
  try {
    Chart = await loadChartJs();
  } catch (err) {
    grid.innerHTML = `<div class="lg:col-span-2 p-4 bg-badge-error-bg text-badge-error-text rounded-lg text-sm">${err.message} Verifique a conexão e use "Atualizar".</div>`;
    return;
  }
  Chart.defaults.font.family = 'Work Sans';

  const data = buildChartData(input);

  // 1) Funil
  if (data.funnel.every(f => f.value === 0)) {
    showEmpty('chart-funnel', 'Sem volumes registrados para o filtro selecionado.');
  } else {
    drawChart('chart-funnel', {
      type: 'bar',
      data: {
        labels: data.funnel.map(f => f.label),
        datasets: [{ data: data.funnel.map(f => f.value), backgroundColor: data.funnel.map(f => f.color), borderRadius: 4 }]
      },
      options: {
        ...baseOptions,
        indexAxis: 'y',
        plugins: { ...baseOptions.plugins, legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtKg(ctx.parsed.x) } } },
        scales: { x: { beginAtZero: true, ticks: { ...axisTicks, callback: v => fmtKg(v) }, grid: { color: COLORS.border } }, y: { ticks: axisTicks, grid: { display: false } } }
      }
    });
  }

  // 2) Porções por etapa
  const totalPortions = Object.values(data.stageCounts.embutimento).reduce((a, b) => a + b, 0);
  if (totalPortions === 0) {
    showEmpty('chart-stages', 'Nenhuma porção de produção gerada para o filtro selecionado.');
  } else {
    const statusSets = [
      { key: 'completed', label: 'Concluídas', color: COLORS.success },
      { key: 'in_progress', label: 'Em andamento', color: COLORS.amber },
      { key: 'pending', label: 'Pendentes', color: '#C9BFBC' }
    ];
    drawChart('chart-stages', {
      type: 'bar',
      data: {
        labels: STAGES.map(s => s.label),
        datasets: statusSets.map(st => ({
          label: st.label,
          backgroundColor: st.color,
          data: STAGES.map(s => data.stageCounts[s.key][st.key])
        }))
      },
      options: {
        ...baseOptions,
        scales: {
          x: { stacked: true, ticks: axisTicks, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { ...axisTicks, precision: 0 }, grid: { color: COLORS.border }, title: { display: true, text: 'Porções', color: COLORS.muted } }
        }
      }
    });
  }

  // 3) Planejado x real por sabor
  if (data.flavors.length === 0) {
    showEmpty('chart-flavors', 'Nenhuma demanda por sabor para o filtro selecionado.');
  } else {
    drawChart('chart-flavors', {
      type: 'bar',
      data: {
        labels: data.flavors.map(f => f.name),
        datasets: [
          { label: 'Solicitado', data: data.flavors.map(f => f.requested), backgroundColor: COLORS.muted, borderRadius: 3 },
          { label: 'Real (vácuo)', data: data.flavors.map(f => f.actual), backgroundColor: COLORS.success, borderRadius: 3 }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: 'y',
        plugins: { ...baseOptions.plugins, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtKg(ctx.parsed.x)}` } } },
        scales: { x: { beginAtZero: true, ticks: { ...axisTicks, callback: v => fmtKg(v) }, grid: { color: COLORS.border } }, y: { ticks: axisTicks, grid: { display: false } } }
      }
    });
  }

  // 4) Evolução diária
  if (data.daily.labels.length === 0) {
    showEmpty('chart-daily', 'Nenhuma etapa concluída no período selecionado.');
  } else {
    drawChart('chart-daily', {
      type: 'line',
      data: {
        labels: data.daily.labels.map(fmtDay),
        datasets: data.daily.series.map(s => ({
          label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, tension: 0.25, pointRadius: 3
        }))
      },
      options: {
        ...baseOptions,
        interaction: { mode: 'index', intersect: false },
        plugins: { ...baseOptions.plugins, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtKg(ctx.parsed.y)}` } } },
        scales: { x: { ticks: axisTicks, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...axisTicks, callback: v => fmtKg(v) }, grid: { color: COLORS.border } } }
      }
    });
  }

  // 5) Pedidos por status
  if (data.shipment.every(s => s.value === 0)) {
    showEmpty('chart-shipment', 'Nenhuma linha de pedido de saída registrada.');
  } else {
    drawChart('chart-shipment', {
      type: 'doughnut',
      data: {
        labels: data.shipment.map(s => s.label),
        datasets: [{ data: data.shipment.map(s => s.value), backgroundColor: data.shipment.map(s => s.color), borderWidth: 2, borderColor: '#FFFFFF' }]
      },
      options: { ...baseOptions, cutout: '60%', plugins: { ...baseOptions.plugins, legend: { position: 'right', labels: baseOptions.plugins.legend.labels } } }
    });
  }

  // 6) Estoque por validade
  if (data.expiry.every(b => b.value === 0)) {
    showEmpty('chart-expiry', 'Nenhum lote com saldo em estoque.');
  } else {
    drawChart('chart-expiry', {
      type: 'bar',
      data: {
        labels: data.expiry.map(b => b.label),
        datasets: [{ data: data.expiry.map(b => b.value), backgroundColor: data.expiry.map(b => b.color), borderRadius: 4 }]
      },
      options: {
        ...baseOptions,
        plugins: { ...baseOptions.plugins, legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtKg(ctx.parsed.y) } } },
        scales: { x: { ticks: axisTicks, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...axisTicks, callback: v => fmtKg(v) }, grid: { color: COLORS.border } } }
      }
    });
  }
}
