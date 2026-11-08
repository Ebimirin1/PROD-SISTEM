import { supabase } from '../supabaseClient.js';
import { formatDate, todayLocal } from '../utils.js';

// Aba "Histórico de vendas" da Análise de Pedidos: vendas gravadas no banco, por produto,
// agrupadas por dia, semana (segunda a domingo) ou mês.

const st = { from: '', to: '', grain: 'week', metric: 'qty', saleType: null, search: '', sort: 'total' };
let data = [];
let el = null;

const nf = (n, d = 1) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return addDays(iso, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}
function periodLabel(iso) {
  const [y, m, d] = iso.split('-');
  if (st.grain === 'month') return `${m}/${y}`;
  if (st.grain === 'day') return `${d}/${m}`;
  const end = addDays(iso, 6).split('-');
  return `${d}/${m}–${end[2]}/${end[1]}`;
}

export async function renderHistory(container, { lastDate, saleType, types }) {
  el = container;
  if (!st.to) {
    st.to = lastDate || todayLocal();
    st.from = addDays(mondayOf(st.to), -7 * 7); // 8 semanas
  }
  if (st.saleType === null) st.saleType = saleType || '';

  el.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="bg-surface-card p-3 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-end gap-3 text-xs">
        ${f('De', `<input id="sh-from" type="date" class="oa-in w-[140px]" value="${st.from}">`)}
        ${f('Até', `<input id="sh-to" type="date" class="oa-in w-[140px]" value="${st.to}">`)}
        ${f('Agrupar por', `<select id="sh-grain" class="oa-in"><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option></select>`)}
        ${f('Mostrar', `<select id="sh-metric" class="oa-in"><option value="qty">Quantidade (kg)</option><option value="total">Valor (R$)</option><option value="sales">Nº de vendas</option></select>`)}
        ${f('Tipo de venda', `<select id="sh-type" class="oa-in"><option value="">Todos</option>${types.filter(Boolean).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>`)}
        ${f('Produto', `<input id="sh-search" type="search" placeholder="Buscar…" class="oa-in w-[180px]" value="${esc(st.search)}">`)}
        <div class="flex gap-1 pb-1">
          <button data-w="4" class="sh-q oa-tab px-2 py-1 rounded text-[11px] font-bold">4 sem</button>
          <button data-w="8" class="sh-q oa-tab px-2 py-1 rounded text-[11px] font-bold">8 sem</button>
          <button data-w="13" class="sh-q oa-tab px-2 py-1 rounded text-[11px] font-bold">3 meses</button>
          <button data-w="52" class="sh-q oa-tab px-2 py-1 rounded text-[11px] font-bold">12 meses</button>
        </div>
        <div id="sh-totals" class="ml-auto pb-1 text-ink-text"></div>
      </div>
      <div class="bg-surface-card rounded-xl border border-border-subtle shadow-sm overflow-auto max-h-[calc(100vh-300px)]">
        <table class="w-full text-xs oa-table">
          <thead id="sh-head" class="sticky top-0 bg-surface-canvas z-10"></thead>
          <tbody id="sh-body"><tr><td class="p-6 text-center text-text-muted">Carregando…</td></tr></tbody>
          <tfoot id="sh-foot" class="sticky bottom-0 bg-surface-canvas font-bold"></tfoot>
        </table>
      </div>
      <p class="text-[11px] text-text-muted">As vendas ficam guardadas no sistema. Para atualizar, importe só o relatório do período novo (ex.: a última semana) em "Importar planilha de vendas"; vendas já importadas não duplicam. Só aparecem os produtos da lista oficial (mapa de produtos do Inflow). Semana = segunda a domingo.</p>
    </div>`;

  const $ = id => el.querySelector('#' + id);
  $('sh-grain').value = st.grain;
  $('sh-metric').value = st.metric;
  $('sh-type').value = st.saleType;
  const reload = () => {
    st.from = $('sh-from').value; st.to = $('sh-to').value;
    st.grain = $('sh-grain').value; st.saleType = $('sh-type').value;
    load();
  };
  ['sh-from', 'sh-to', 'sh-grain', 'sh-type'].forEach(id => $(id).addEventListener('change', reload));
  $('sh-metric').addEventListener('change', () => { st.metric = $('sh-metric').value; draw(); });
  $('sh-search').addEventListener('input', () => { st.search = $('sh-search').value; draw(); });
  el.querySelectorAll('.sh-q').forEach(b => b.addEventListener('click', () => {
    const to = $('sh-to').value || st.to;
    $('sh-from').value = addDays(mondayOf(to), -7 * (Number(b.dataset.w) - 1));
    if (Number(b.dataset.w) >= 13 && $('sh-grain').value === 'day') $('sh-grain').value = 'week';
    reload();
  }));
  await load();
}

function f(label, input) {
  return `<label class="flex flex-col gap-1 font-bold text-text-muted">${label}${input}</label>`;
}

async function load() {
  const body = el.querySelector('#sh-body');
  body.innerHTML = `<tr><td class="p-6 text-center text-text-muted">Carregando…</td></tr>`;
  const { data: rows, error } = await supabase.rpc('sales_history', {
    p_from: st.from, p_to: st.to, p_grain: st.grain, p_sale_type: st.saleType || null
  });
  if (error) {
    body.innerHTML = `<tr><td class="p-6 text-center text-badge-error-text">Erro: ${esc(error.message)}</td></tr>`;
    return;
  }
  data = rows || [];
  draw();
}

function draw() {
  const head = el.querySelector('#sh-head');
  const body = el.querySelector('#sh-body');
  const foot = el.querySelector('#sh-foot');
  const periods = [...new Set(data.map(r => r.period))].sort().reverse(); // mais recente primeiro
  const byProd = new Map();
  data.forEach(r => {
    const p = byProd.get(r.product_code) || { code: r.product_code, name: r.product_name, vals: {}, total: 0 };
    const v = Number(r[st.metric] || 0);
    p.vals[r.period] = v;
    p.total += v;
    byProd.set(r.product_code, p);
  });
  const q = st.search.trim().toUpperCase();
  let list = [...byProd.values()];
  if (q) list = list.filter(p => p.name.toUpperCase().includes(q) || p.code.includes(q));
  list.sort(st.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'pt-BR') : (a, b) => b.total - a.total);

  const dec = st.metric === 'sales' ? 0 : (st.metric === 'total' ? 2 : 1);
  const fmt = v => (v ? nf(v, dec) : '–');
  head.innerHTML = `<tr>
    <th class="l">Cód.</th><th class="l" data-s="name">Produto${st.sort === 'name' ? ' ▾' : ''}</th>
    <th data-s="total">Total${st.sort === 'total' ? ' ▾' : ''}</th><th>Média/${st.grain === 'day' ? 'dia' : st.grain === 'month' ? 'mês' : 'sem'}</th>
    ${periods.map(p => `<th class="oa-wk">${periodLabel(p)}</th>`).join('')}
  </tr>`;
  head.querySelectorAll('th[data-s]').forEach(th => th.addEventListener('click', () => { st.sort = th.dataset.s; draw(); }));

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="${4 + periods.length}" class="p-6 text-center text-text-muted">Nenhuma venda nesse período. Importe o relatório de vendas ou mude as datas.</td></tr>`;
    foot.innerHTML = '';
    el.querySelector('#sh-totals').innerHTML = '';
    return;
  }
  const n = periods.length || 1;
  body.innerHTML = list.map(p => `<tr>
      <td class="l text-text-muted">${esc(p.code)}</td>
      <td class="l font-bold text-ink-text">${esc(p.name)}</td>
      <td class="font-bold">${fmt(p.total)}</td>
      <td>${fmt(p.total / n)}</td>
      ${periods.map(per => `<td class="oa-wk">${fmt(p.vals[per])}</td>`).join('')}
    </tr>`).join('');
  const colTot = periods.map(per => list.reduce((a, p) => a + (p.vals[per] || 0), 0));
  const grand = list.reduce((a, p) => a + p.total, 0);
  foot.innerHTML = `<tr><td class="l" colspan="2">${list.length} produto(s)</td><td>${fmt(grand)}</td><td>${fmt(grand / n)}</td>${colTot.map(v => `<td>${fmt(v)}</td>`).join('')}</tr>`;
  el.querySelector('#sh-totals').innerHTML = `${formatDate(st.from)} a ${formatDate(st.to)} · total <b>${fmt(grand)}</b>`;
}
