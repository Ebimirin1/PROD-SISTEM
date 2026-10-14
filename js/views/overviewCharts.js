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

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

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

const sum = (arr, fn) => arr.reduce((acc, item) => acc + Number(fn(item) || 0), 0);

/**
 * Agrega os dados já carregados pela Visão Geral nos formatos usados pelos gráficos.
 * O fluxo termina no vácuo; a rotulagem acontece antes ou em paralelo.
 * Função pura (sem DOM) para facilitar testes.
 */
export function buildChartData({ filteredOps, filteredPortions, demands, totalsMap }) {
  const opIds = new Set((filteredOps || []).map(o => o.id));
  const portions = filteredPortions || [];
  const demandsInScope = (demands || []).filter(d => opIds.has(d.production_order_id));

  // 1) Funil: quanto cada etapa já entregou (kg). A produção real final é o vácuo.
  const plannedKg = sum(filteredOps || [], o => totalsMap?.[o.id]?.planned_total_kg);
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

  const funnel = [
    { label: 'Planejado', value: plannedKg, color: COLORS.muted },
    { label: 'Embutido', value: stageKg.embutimento, color: COLORS.bordeaux },
    { label: 'Envacado — produção real', value: stageKg.vacuo, color: COLORS.success },
    { label: 'Rotulagem (paralela)', value: stageKg.rotulagem, color: COLORS.info }
  ];

  // 2) Planejado x real por sabor (real = vácuo concluído, mesma regra do modal)
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

  // 4) Tempo médio por etapa (minutos por porção concluída)
  const durations = STAGES.map(s => {
    const mins = [];
    portions.forEach(p => {
      const run = (p.process_runs || []).find(r => r.stage === s.key);
      if (run?.status === 'completed' && run.started_at && run.completed_at) {
        const m = (new Date(run.completed_at) - new Date(run.started_at)) / 60000;
        if (m >= 0) mins.push(m);
      }
    });
    return { label: s.label, color: s.color, value: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0, count: mins.length };
  });

  // 5) Produção real (vácuo concluído) por dia da semana
  const weekdayKg = [0, 0, 0, 0, 0, 0, 0];
  portions.forEach(p => {
    (p.process_runs || []).forEach(r => {
      if (r.stage !== 'vacuo' || r.status !== 'completed' || !r.completed_at) return;
      const jsDay = new Date(r.completed_at).getDay(); // 0 = domingo
      weekdayKg[(jsDay + 6) % 7] += Number(r.actual_kg || 0);
    });
  });

  return {
    funnel,
    stageCounts,
    flavors,
    daily: {
      labels: days,
      series: STAGES.map(s => ({ label: s.label, color: s.color, data: days.map(d => dailyMap[d][s.key]) }))
    },
    durations,
    weekday: WEEKDAYS.map((label, i) => ({ label, value: weekdayKg[i] }))
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
    cardShell('chart-funnel', 'Funil do fluxo (kg)', 'Do planejado até o vácuo (produção real). A rotulagem é paralela e aparece à parte.', 'filter_alt', true),
    cardShell('chart-stages', 'Porções por etapa', 'Pendentes, em andamento e concluídas — mostra o gargalo.', 'stacked_bar_chart'),
    cardShell('chart-flavors', 'Planejado x real por sabor', 'Top 10 sabores por quantidade solicitada (real = vácuo concluído).', 'restaurant_menu'),
    cardShell('chart-daily', 'Produção concluída por dia (kg)', 'Quantidade real concluída em cada etapa, por dia.', 'show_chart', true),
    cardShell('chart-duration', 'Tempo médio por etapa (min)', 'Média por porção concluída, do início ao fim da etapa.', 'schedule'),
    cardShell('chart-weekday', 'Produção real por dia da semana (kg)', 'Vácuo concluído, somado por dia da semana.', 'calendar_view_week')
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

  // 5) Tempo médio por etapa
  if (data.durations.every(d => d.count === 0)) {
    showEmpty('chart-duration', 'Nenhuma etapa concluída com início e fim registrados.');
  } else {
    drawChart('chart-duration', {
      type: 'bar',
      data: {
        labels: data.durations.map(d => d.label),
        datasets: [{ data: data.durations.map(d => d.value), backgroundColor: data.durations.map(d => d.color), borderRadius: 4 }]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${Math.round(ctx.parsed.y)} min (${data.durations[ctx.dataIndex].count} porções)` } }
        },
        scales: { x: { ticks: axisTicks, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...axisTicks, callback: v => `${v} min` }, grid: { color: COLORS.border } } }
      }
    });
  }

  // 6) Produção real por dia da semana
  if (data.weekday.every(d => d.value === 0)) {
    showEmpty('chart-weekday', 'Nenhum vácuo concluído para o filtro selecionado.');
  } else {
    drawChart('chart-weekday', {
      type: 'bar',
      data: {
        labels: data.weekday.map(d => d.label),
        datasets: [{ data: data.weekday.map(d => d.value), backgroundColor: COLORS.success, borderRadius: 4 }]
      },
      options: {
        ...baseOptions,
        plugins: { ...baseOptions.plugins, legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtKg(ctx.parsed.y) } } },
        scales: { x: { ticks: axisTicks, grid: { display: false } }, y: { beginAtZero: true, ticks: { ...axisTicks, callback: v => fmtKg(v) }, grid: { color: COLORS.border } } }
      }
    });
  }
}
