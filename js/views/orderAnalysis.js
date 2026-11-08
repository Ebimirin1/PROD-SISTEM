import { supabase } from '../supabaseClient.js';
import { showNotification, formatDate, formatDateTime, todayLocal } from '../utils.js';
import { parseSalesRows, parseStockRows } from './salesImport.js';

// Análise de Pedidos: média de vendas das últimas N semanas por produto (só varejo por
// padrão), estoque (digitado ou importado do mapa de estoque do Inflow) e sugestão de
// pedido para cobrir X giros (1 giro = 1 semana).
//   necessidade = média semanal × giros
//   sugestão    = necessidade − estoque, arredondada para cima; se faltar, no mínimo o
//                 pedido mínimo (15 kg); se não faltar, zero.
// "Salvar pedido na OP" grava o pedido e lança as linhas na Ordem de Produção pelos
// vínculos produto → sabor/tipo (coluna "Sabor na OP").

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const PREFS_KEY = 'sgp.orderAnalysis.prefs';

const prefs = loadPrefs();
let summary = null;
let rows = [];
let orderOverrides = new Map(); // produto -> pedido digitado à mão
let sortKey = 'avg';
let rootEl = null;
let productMap = new Map(); // código -> { flavor_id, product_type, conservation, ignore }
let flavors = [];
let showMap = false;
let showHidden = false;
// Sem vínculo salvo, granel/massa/matéria-prima ficam fora do pedido (empório não estoca)
const AUTO_HIDE = /GRANEL|MASSA|PERNIL|SOBREPALETA|BACON PE[CÇ]A|SACOLA|BOLSA/i;
function isHidden(r) {
  const m = productMap.get(r.product_code);
  return m ? !!m.ignore : AUTO_HIDE.test(r.product_name);
}
const PRODUCT_TYPES = [['linguica', 'Linguiça'], ['manta', 'Manta'], ['granel', 'Granel'], ['massa', 'Massa'], ['hamburguer', 'Hambúrguer']];
const DESTINATIONS = [['emporio', 'Empório'], ['lanchonete', 'Lanchonete'], ['outro', 'Outro']];

function loadPrefs() {
  const d = { refDate: '', weeks: 4, giros: 2, minOrder: 15, saleType: 'VAREJO', search: '', onlyNeeded: false, destination: 'emporio' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'), refDate: '', search: '' }; }
  catch { return d; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* sem armazenamento */ }
}

const nf = (n, d = 1) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const shortDate = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

function guessType(name) {
  const n = String(name || '').toUpperCase();
  if (/^MANTA/.test(n)) return 'manta';
  if (/^HAMB/.test(n)) return 'hamburguer';
  if (/GRANEL/.test(n)) return 'granel';
  if (/MASSA/.test(n)) return 'massa';
  return 'linguica';
}

export async function render(container) {
  rootEl = container;
  container.innerHTML = `
    <div class="flex flex-col gap-space-md max-w-[1720px] mx-auto w-full">
      <div class="flex flex-wrap items-center justify-between gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[28px]">query_stats</span>
            <h1 class="font-display-lg text-display-lg text-ink-text">Análise de Pedidos</h1>
          </div>
          <p id="oa-summary" class="font-body-md text-body-md text-text-muted mt-1">Carregando base de vendas…</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="px-3 py-2 rounded-lg text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm cursor-pointer flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">upload_file</span>
            <span id="oa-import-label">Importar planilha de vendas</span>
            <input id="oa-import" type="file" accept=".xls,.xlsx,.csv" class="hidden">
          </label>
          <label class="px-3 py-2 rounded-lg text-xs font-bold bg-surface-canvas text-ink-text border border-border-subtle hover:bg-surface-container cursor-pointer flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">inventory</span>
            <span id="oa-stock-label">Importar estoque (Inflow)</span>
            <input id="oa-stock-file" type="file" accept=".xls,.xlsx,.csv" class="hidden">
          </label>
          <button id="oa-save" class="px-3 py-2 rounded-lg text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">playlist_add_check</span>Salvar pedido na OP
          </button>
          <button id="oa-print" class="px-3 py-2 rounded-lg text-xs font-bold bg-surface-canvas text-ink-text border border-border-subtle hover:bg-surface-container flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">print</span>Imprimir pedido
          </button>
          <button id="oa-csv" class="px-3 py-2 rounded-lg text-xs font-bold bg-surface-canvas text-ink-text border border-border-subtle hover:bg-surface-container flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">download</span>CSV
          </button>
        </div>
      </div>

      <div class="bg-surface-card p-3 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-end gap-3 text-xs">
        ${field('Data de referência', `<input id="oa-ref" type="date" class="oa-in w-[140px]">`)}
        ${field('Semanas na média', `<input id="oa-weeks" type="number" min="1" max="26" class="oa-in w-[70px]">`)}
        ${field('Giros de cobertura', `<input id="oa-giros" type="number" min="0.5" step="0.5" class="oa-in w-[70px]">`)}
        ${field('Pedido mínimo', `<input id="oa-min" type="number" min="0" step="1" class="oa-in w-[70px]">`)}
        ${field('Tipo de venda', `<select id="oa-type" class="oa-in w-[120px]"><option value="">Todos</option></select>`)}
        ${field('Produto', `<input id="oa-search" type="search" placeholder="Buscar…" class="oa-in w-[180px]">`)}
        <label class="flex items-center gap-1 font-bold text-ink-text pb-2"><input id="oa-only" type="checkbox"> Só com pedido</label>
        <label class="flex items-center gap-1 font-bold text-ink-text pb-2"><input id="oa-showmap" type="checkbox"> Vincular sabores</label>
        <label class="flex items-center gap-1 font-bold text-ink-text pb-2"><input id="oa-hidden" type="checkbox"> Mostrar fora do pedido</label>
        <div id="oa-totals" class="ml-auto flex gap-4 pb-1 text-ink-text"></div>
      </div>

      <div class="bg-surface-card rounded-xl border border-border-subtle shadow-sm overflow-auto max-h-[calc(100vh-260px)]">
        <table class="w-full text-xs oa-table">
          <thead id="oa-head" class="sticky top-0 bg-surface-canvas z-10"></thead>
          <tbody id="oa-body"><tr><td class="p-6 text-center text-text-muted">Carregando…</td></tr></tbody>
          <tfoot id="oa-foot" class="sticky bottom-0 bg-surface-canvas font-bold"></tfoot>
        </table>
      </div>
      <p class="text-[11px] text-text-muted">Semana 1 = os 7 dias que terminam na data de referência. Média = total das semanas ÷ nº de semanas. 1 giro = 1 semana; necessidade = média × giros. Sugestão = necessidade − estoque, arredondada para cima e nunca abaixo do pedido mínimo. O estoque é salvo ao sair do campo; o pedido pode ser ajustado à mão. Para ir para a OP, o produto precisa estar vinculado a um sabor (marque "Vincular sabores"). Granel, massa e matéria-prima ficam fora do pedido até você vincular.</p>
      <div id="oa-dialog" class="hidden fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"></div>
    </div>
    <style>
      .oa-in { border: 1px solid var(--tw-border, #d6d0cc); border-radius: 6px; padding: 5px 7px; background: #fff; color: #1f1a17; }
      .oa-table th, .oa-table td { padding: 4px 6px; border-bottom: 1px solid rgba(0,0,0,.07); white-space: nowrap; }
      .oa-table th { text-align: right; font-weight: 700; cursor: pointer; user-select: none; }
      .oa-table th.l, .oa-table td.l { text-align: left; }
      .oa-table td { text-align: right; font-variant-numeric: tabular-nums; }
      .oa-table tbody tr:hover { background: rgba(230,159,15,.08); }
      .oa-table input { width: 80px; text-align: right; border: 1px solid #d6d0cc; border-radius: 4px; padding: 2px 4px; background: #fff; }
      .oa-table input.oa-ord { font-weight: 700; }
      .oa-table .oa-wk { color: #6b625c; }
      .oa-table .oa-sug { font-weight: 700; color: #380000; }
      .oa-low { background: rgba(186,26,26,.10); }
      #oa-print-root { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        body.oa-printing > *:not(#oa-print-root) { display: none !important; }
        body.oa-printing { background: #fff !important; }
        body.oa-printing #oa-print-root { display: block; font-family: Ubuntu, Arial, sans-serif; }
        #oa-print-root table { width: 100%; border-collapse: collapse; font-size: 11px; }
        #oa-print-root th, #oa-print-root td { border: 1px solid #999; padding: 4px 6px; text-align: right; }
        #oa-print-root .l { text-align: left; }
        #oa-print-root h1 { font-size: 16px; margin: 0 0 2px; }
        #oa-print-root p { font-size: 11px; margin: 0 0 8px; color: #444; }
        #oa-print-root thead { display: table-header-group; }
        #oa-print-root tr { break-inside: avoid; }
      }
    </style>
  `;

  const $ = id => container.querySelector('#' + id);
  $('oa-weeks').value = prefs.weeks;
  $('oa-giros').value = prefs.giros;
  $('oa-min').value = prefs.minOrder;
  $('oa-showmap').checked = showMap;
  $('oa-hidden').checked = showHidden;
  $('oa-only').checked = prefs.onlyNeeded;

  const onParam = async () => {
    prefs.refDate = $('oa-ref').value;
    prefs.weeks = Math.max(1, Math.min(26, parseInt($('oa-weeks').value, 10) || 4));
    prefs.saleType = $('oa-type').value;
    savePrefs();
    await loadAnalysis();
  };
  $('oa-ref').addEventListener('change', onParam);
  $('oa-weeks').addEventListener('change', onParam);
  $('oa-type').addEventListener('change', onParam);
  const onCalc = () => {
    prefs.giros = Math.max(0, num($('oa-giros').value) || 0);
    prefs.minOrder = Math.max(0, num($('oa-min').value));
    showMap = $('oa-showmap').checked;
    showHidden = $('oa-hidden').checked;
    prefs.onlyNeeded = $('oa-only').checked;
    prefs.search = $('oa-search').value;
    savePrefs();
    renderTable();
  };
  ['oa-giros', 'oa-min', 'oa-only', 'oa-showmap', 'oa-hidden'].forEach(id => $(id).addEventListener('change', onCalc));
  $('oa-search').addEventListener('input', onCalc);
  $('oa-import').addEventListener('change', e => importFile(e.target.files?.[0], e.target));
  $('oa-stock-file').addEventListener('change', e => importStock(e.target.files?.[0], e.target));
  $('oa-save').addEventListener('click', openSaveDialog);
  $('oa-print').addEventListener('click', printOrder);
  $('oa-csv').addEventListener('click', exportCsv);

  await Promise.all([loadSummary(), loadMapAndFlavors()]);
  await loadAnalysis();
}

async function loadMapAndFlavors() {
  const [m, f] = await Promise.all([
    supabase.from('sales_product_map').select('*'),
    supabase.from('flavors').select('id, name, active').order('name')
  ]);
  if (m.error) showNotification('Erro ao ler vínculos de produtos: ' + m.error.message, 'error');
  productMap = new Map((m.data || []).map(x => [x.product_code, x]));
  flavors = (f.data || []).filter(x => x.active !== false);
}

function field(label, input) {
  return `<label class="flex flex-col gap-1 font-bold text-text-muted">${label}${input}</label>`;
}

async function loadSummary() {
  const { data, error } = await supabase.rpc('sales_summary');
  const el = rootEl.querySelector('#oa-summary');
  if (error) {
    el.textContent = 'Não foi possível ler a base de vendas: ' + error.message;
    return;
  }
  summary = data || {};
  const refInput = rootEl.querySelector('#oa-ref');
  if (!prefs.refDate) {
    // Padrão: último dia com venda na base (ou hoje, se a base estiver vazia)
    const today = todayLocal();
    prefs.refDate = summary.last_date && summary.last_date < today ? summary.last_date : today;
  }
  refInput.value = prefs.refDate;

  const typeSel = rootEl.querySelector('#oa-type');
  typeSel.innerHTML = '<option value="">Todos</option>' +
    (summary.types || []).filter(Boolean).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  typeSel.value = prefs.saleType && (summary.types || []).includes(prefs.saleType) ? prefs.saleType : '';
  prefs.saleType = typeSel.value;

  el.textContent = summary.rows
    ? `Base: ${Number(summary.rows).toLocaleString('pt-BR')} itens vendidos, de ${formatDate(summary.first_date)} a ${formatDate(summary.last_date)} · última importação ${formatDateTime(summary.last_import)}`
    : 'Base de vendas vazia. Importe a planilha "Mapa de Vendas por Cliente" (.xls, .xlsx ou .csv).';
}

async function loadAnalysis() {
  const body = rootEl.querySelector('#oa-body');
  body.innerHTML = `<tr><td colspan="14" class="p-6 text-center text-text-muted">Calculando…</td></tr>`;
  const { data, error } = await supabase.rpc('order_analysis', {
    p_ref: prefs.refDate || todayLocal(),
    p_weeks: prefs.weeks,
    p_sale_type: prefs.saleType || null
  });
  if (error) {
    body.innerHTML = `<tr><td colspan="14" class="p-6 text-center text-badge-error-text">Erro: ${esc(error.message)}</td></tr>`;
    return;
  }
  rows = (data || []).map(r => ({
    ...r,
    weekly_qty: (r.weekly_qty || []).map(Number),
    total_qty: Number(r.total_qty),
    weekly_avg: Number(r.weekly_avg),
    stock_qty: Number(r.stock_qty)
  }));
  orderOverrides = new Map();
  renderTable();
}

function calc(r) {
  const need = r.weekly_avg * prefs.giros;
  const deficit = need - r.stock_qty;
  const suggestion = deficit > 0.0005 ? Math.max(prefs.minOrder || 0, Math.ceil(deficit)) : 0;
  const coverage = r.weekly_avg > 0 ? r.stock_qty / r.weekly_avg : null;
  const hidden = isHidden(r);
  const order = hidden ? 0 : (orderOverrides.has(r.product_code) ? orderOverrides.get(r.product_code) : suggestion);
  return { need, suggestion: hidden ? 0 : suggestion, coverage, order, hidden };
}

function visibleRows() {
  const q = (prefs.search || '').trim().toUpperCase();
  let list = rows.map(r => ({ r, c: calc(r) }));
  if (q) list = list.filter(({ r }) => r.product_name.toUpperCase().includes(q) || r.product_code.includes(q));
  if (!showHidden) list = list.filter(({ c }) => !c.hidden);
  if (prefs.onlyNeeded) list = list.filter(({ c }) => c.order > 0);
  const sorters = {
    code: (a, b) => a.r.product_code.localeCompare(b.r.product_code, 'pt-BR', { numeric: true }),
    name: (a, b) => a.r.product_name.localeCompare(b.r.product_name, 'pt-BR'),
    avg: (a, b) => b.r.weekly_avg - a.r.weekly_avg,
    stock: (a, b) => b.r.stock_qty - a.r.stock_qty,
    cov: (a, b) => (a.c.coverage ?? 1e9) - (b.c.coverage ?? 1e9),
    order: (a, b) => b.c.order - a.c.order
  };
  return list.sort(sorters[sortKey] || sorters.avg);
}

function renderTable() {
  const head = rootEl.querySelector('#oa-head');
  const body = rootEl.querySelector('#oa-body');
  const foot = rootEl.querySelector('#oa-foot');
  const ref = prefs.refDate || todayLocal();
  const weeks = Array.from({ length: prefs.weeks }, (_, i) => {
    const end = addDays(ref, -7 * i);
    return `S${i + 1}<div class="font-normal text-[10px] text-text-muted">${shortDate(addDays(end, -6))}–${shortDate(end)}</div>`;
  });

  const th = (key, label, cls = '') => `<th data-sort="${key}" class="${cls}">${label}${sortKey === key ? ' ▾' : ''}</th>`;
  head.innerHTML = `<tr>
    ${th('code', 'Cód.', 'l')}${th('name', 'Produto', 'l')}
    ${weeks.map(w => `<th class="oa-wk">${w}</th>`).join('')}
    ${th('avg', 'Média/sem')}<th>Última venda</th>${th('stock', 'Estoque')}${th('cov', 'Cobertura<div class="font-normal text-[10px] text-text-muted">giros</div>')}
    <th>Necessidade<div class="font-normal text-[10px] text-text-muted">${nf(prefs.giros, 1)} giro(s)</div></th>
    <th>Sugestão</th>${th('order', 'Pedido')}
    ${showMap ? '<th class="l">Sabor na OP</th><th class="l">Tipo</th>' : ''}
  </tr>`;
  head.querySelectorAll('th[data-sort]').forEach(el => el.addEventListener('click', () => { sortKey = el.dataset.sort; renderTable(); }));

  const list = visibleRows();
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="${10 + prefs.weeks}" class="p-6 text-center text-text-muted">${rows.length ? 'Nenhum produto com esse filtro.' : 'Sem vendas nas semanas escolhidas. Confira a data de referência ou importe a planilha.'}</td></tr>`;
  } else {
    body.innerHTML = list.map(({ r, c }) => `
      <tr class="${c.hidden ? 'opacity-50' : (c.coverage !== null && c.coverage < 1 ? 'oa-low' : '')}">
        <td class="l text-text-muted">${esc(r.product_code)}</td>
        <td class="l font-bold text-ink-text">${esc(r.product_name)}</td>
        ${r.weekly_qty.map(q => `<td class="oa-wk">${q ? nf(q) : '–'}</td>`).join('')}
        <td class="font-bold">${nf(r.weekly_avg)}</td>
        <td class="text-text-muted">${r.last_sale ? formatDate(r.last_sale) : '–'}</td>
        <td><input class="oa-stock" data-code="${esc(r.product_code)}" inputmode="decimal" value="${r.stock_qty ? nf(r.stock_qty, 1) : ''}" placeholder="0"></td>
        <td>${c.coverage === null ? '–' : nf(c.coverage, 1)}</td>
        <td>${nf(c.need)}</td>
        <td class="oa-sug">${c.suggestion ? nf(c.suggestion, 0) : '–'}</td>
        <td><input class="oa-ord" data-code="${esc(r.product_code)}" inputmode="decimal" value="${c.order ? nf(c.order, 0) : ''}" placeholder="0"></td>
        ${showMap ? mapCells(r) : ''}
      </tr>`).join('');
  }

  const tot = list.reduce((a, { r, c }) => {
    a.weeks = a.weeks.map((v, i) => v + (r.weekly_qty[i] || 0));
    a.avg += r.weekly_avg; a.stock += r.stock_qty; a.need += c.need; a.sug += c.suggestion; a.order += c.order;
    return a;
  }, { weeks: Array(prefs.weeks).fill(0), avg: 0, stock: 0, need: 0, sug: 0, order: 0 });
  foot.innerHTML = `<tr>
    <td class="l" colspan="2">${list.length} produto(s)</td>
    ${tot.weeks.map(v => `<td>${nf(v)}</td>`).join('')}
    <td>${nf(tot.avg)}</td><td></td><td>${nf(tot.stock)}</td><td></td><td>${nf(tot.need)}</td><td>${nf(tot.sug, 0)}</td><td>${nf(tot.order, 0)}</td>
    ${showMap ? `<td class="l" colspan="2">${rows.filter(r => !isHidden(r) && !productMap.get(r.product_code)?.flavor_id).length} sem vínculo</td>` : ''}
  </tr>`;
  rootEl.querySelector('#oa-totals').innerHTML = `
    <span>Média/sem: <b>${nf(tot.avg)}</b></span>
    <span>Estoque: <b>${nf(tot.stock)}</b></span>
    <span>Pedido: <b class="text-bordeaux-primary">${nf(tot.order, 0)}</b></span>`;

  body.querySelectorAll('.oa-map').forEach(sel => sel.addEventListener('change', () => saveMap(sel.dataset.code, sel.closest('tr'))));
  body.querySelectorAll('.oa-stock').forEach(inp => inp.addEventListener('change', () => saveStock(inp)));
  body.querySelectorAll('.oa-ord').forEach(inp => inp.addEventListener('change', () => {
    orderOverrides.set(inp.dataset.code, Math.max(0, num(inp.value)));
    renderTable();
  }));
  body.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const cls = inp.classList.contains('oa-stock') ? '.oa-stock' : '.oa-ord';
    const all = [...body.querySelectorAll(cls)];
    const next = all[all.indexOf(inp) + (e.key === 'ArrowUp' ? -1 : 1)];
    inp.dispatchEvent(new Event('change'));
    setTimeout(() => {
      const again = [...rootEl.querySelectorAll('#oa-body ' + cls)].find(x => x.dataset.code === next?.dataset.code);
      again?.focus(); again?.select();
    }, 0);
  }));
}

function mapCells(r) {
  const m = productMap.get(r.product_code) || {};
  const flavorVal = (m.product_code ? m.ignore : AUTO_HIDE.test(r.product_name)) ? '__ignore' : (m.flavor_id || '');
  const type = m.product_type || guessType(r.product_name);
  return `<td class="l"><select class="oa-map oa-flavor" data-code="${esc(r.product_code)}" style="max-width:190px;${flavorVal ? '' : 'border-color:#ba1a1a'}">
      <option value="">— vincular —</option>
      <option value="__ignore" ${flavorVal === '__ignore' ? 'selected' : ''}>Fora do pedido</option>
      ${flavors.map(f => `<option value="${f.id}" ${f.id === flavorVal ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
    </select></td>
    <td class="l"><select class="oa-map oa-type" data-code="${esc(r.product_code)}">
      ${PRODUCT_TYPES.map(([k, l]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${l}</option>`).join('')}
    </select></td>`;
}

async function saveMap(code, tr) {
  const flavorVal = tr.querySelector('.oa-flavor').value;
  const row = {
    product_code: code,
    flavor_id: flavorVal && flavorVal !== '__ignore' ? flavorVal : null,
    ignore: flavorVal === '__ignore',
    product_type: tr.querySelector('.oa-type').value,
    conservation: productMap.get(code)?.conservation || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('sales_product_map').upsert(row, { onConflict: 'product_code' });
  if (error) { showNotification('Erro ao salvar vínculo: ' + error.message, 'error'); return; }
  productMap.set(code, row);
  renderTable();
}

async function saveStock(inp) {
  const code = inp.dataset.code;
  const qty = Math.max(0, num(inp.value));
  const row = rows.find(r => r.product_code === code);
  if (!row || row.stock_qty === qty) return;
  const { error } = await supabase.from('order_stock')
    .upsert({ product_code: code, stock_qty: qty, updated_at: new Date().toISOString() }, { onConflict: 'product_code' });
  if (error) {
    showNotification('Erro ao salvar estoque: ' + error.message, 'error');
    return;
  }
  row.stock_qty = qty;
  orderOverrides.delete(code);
  renderTable();
}

async function importStock(file, input) {
  if (!file) return;
  const label = rootEl.querySelector('#oa-stock-label');
  try {
    label.textContent = 'Lendo estoque…';
    await loadScript(XLSX_URL);
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheetRows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    const { items, header, codeCol, nameCol, qtyCol } = parseStockRows(sheetRows);
    if (!items.length) throw new Error('Não achei as colunas de código e quantidade/estoque na planilha.');

    // Mesmo código repetido (vários lotes/locais): soma
    const byCode = new Map();
    items.forEach(i => {
      const cur = byCode.get(i.code) || { ...i, qty: 0 };
      cur.qty = Math.round((cur.qty + i.qty) * 1000) / 1000;
      byCode.set(i.code, cur);
    });
    const known = new Set(rows.map(r => r.product_code));
    const matched = [...byCode.values()].filter(i => known.has(i.code));
    const unknown = [...byCode.values()].filter(i => !known.has(i.code));
    const zeroed = rows.filter(r => !byCode.has(r.product_code) && r.stock_qty !== 0);

    const col = i => (i >= 0 && header ? `"${header[i]}"` : '—');
    const msg = `Colunas usadas: código ${col(codeCol)}, produto ${col(nameCol)}, estoque ${col(qtyCol)}.\n\n` +
      `${byCode.size} produtos na planilha; ${matched.length} batem com os produtos da análise.` +
      (unknown.length ? `\n${unknown.length} códigos não aparecem nas vendas das semanas escolhidas (o estoque deles é gravado mesmo assim). Ex.: ${unknown.slice(0, 5).map(i => i.code + ' ' + i.name).join('; ')}` : '') +
      (zeroed.length ? `\n${zeroed.length} produtos da análise não estão na planilha e ficarão com estoque 0.` : '') +
      '\n\nAtualizar os estoques?';
    if (!window.confirm(msg)) return;

    const now = new Date().toISOString();
    const upserts = [...byCode.values()].map(i => ({ product_code: i.code, stock_qty: i.qty, updated_at: now }))
      .concat(zeroed.map(r => ({ product_code: r.product_code, stock_qty: 0, updated_at: now })));
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await supabase.from('order_stock').upsert(upserts.slice(i, i + 500), { onConflict: 'product_code' });
      if (error) throw new Error('Erro ao gravar estoque: ' + error.message);
    }
    showNotification(`Estoque atualizado: ${byCode.size} produtos.`, 'success');
    await loadAnalysis();
  } catch (err) {
    console.error(err);
    showNotification(err.message || String(err), 'error');
  } finally {
    label.textContent = 'Importar estoque (Inflow)';
    input.value = '';
  }
}

async function openSaveDialog() {
  const lines = orderLines();
  if (!lines.length) { showNotification('Nenhum produto com pedido maior que zero.', 'info'); return; }
  const { data: ops, error } = await supabase.from('production_orders')
    .select('id, order_code, production_date')
    .is('generated_at', null).is('canceled_at', null)
    .order('production_date', { ascending: false }).limit(20);
  if (error) { showNotification('Erro ao ler as OPs: ' + error.message, 'error'); return; }

  const unmapped = lines.filter(({ r }) => !productMap.get(r.product_code)?.flavor_id);
  const total = lines.reduce((a, { c }) => a + c.order, 0);
  const tomorrow = addDays(todayLocal(), 1);

  const dlg = rootEl.querySelector('#oa-dialog');
  dlg.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-lg p-5 w-full max-w-lg text-sm flex flex-col gap-3">
      <h2 class="font-headline-sm text-ink-text">Salvar pedido na Ordem de Produção</h2>
      <p class="text-text-muted">${lines.length} produto(s), <b>${nf(total, 0)} kg</b>. Produtos do mesmo sabor e tipo viram uma linha só na OP.</p>
      ${unmapped.length ? `<div class="p-2 rounded bg-badge-error-bg text-badge-error-text text-xs"><b>${unmapped.length} sem sabor vinculado</b> (ficam salvos no pedido, mas não entram na OP): ${unmapped.map(({ r }) => esc(r.product_name)).join(', ')}. Marque "Vincular sabores" para resolver.</div>` : ''}
      <label class="flex flex-col gap-1 font-bold text-text-muted text-xs">Destino na OP
        <select id="oa-dlg-dest" class="oa-in">${DESTINATIONS.map(([k, l]) => `<option value="${k}" ${k === prefs.destination ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      <label class="flex flex-col gap-1 font-bold text-text-muted text-xs">Ordem de Produção
        <select id="oa-dlg-op" class="oa-in">
          <option value="">Criar OP nova</option>
          ${(ops || []).map(o => `<option value="${o.id}">${esc(o.order_code)} · produção ${formatDate(o.production_date)}</option>`).join('')}
        </select>
      </label>
      <label id="oa-dlg-date-wrap" class="flex flex-col gap-1 font-bold text-text-muted text-xs">Data de produção da OP nova
        <input id="oa-dlg-date" type="date" class="oa-in" value="${tomorrow}">
      </label>
      <div class="flex justify-end gap-2 mt-2">
        <button id="oa-dlg-cancel" class="px-3 py-2 rounded-lg text-xs font-bold bg-surface-canvas border border-border-subtle">Cancelar</button>
        <button id="oa-dlg-ok" class="px-3 py-2 rounded-lg text-xs font-bold bg-bordeaux-primary text-on-primary">Salvar pedido</button>
      </div>
    </div>`;
  dlg.classList.remove('hidden');
  const opSel = dlg.querySelector('#oa-dlg-op');
  const syncDate = () => dlg.querySelector('#oa-dlg-date-wrap').classList.toggle('hidden', !!opSel.value);
  opSel.addEventListener('change', syncDate);
  syncDate();
  const close = () => { dlg.classList.add('hidden'); dlg.innerHTML = ''; };
  dlg.querySelector('#oa-dlg-cancel').addEventListener('click', close);
  dlg.querySelector('#oa-dlg-ok').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Salvando…';
    prefs.destination = dlg.querySelector('#oa-dlg-dest').value;
    savePrefs();
    const { data, error: err } = await supabase.rpc('save_order_request', {
      p_ref: prefs.refDate || todayLocal(),
      p_weeks: prefs.weeks,
      p_giros: prefs.giros,
      p_sale_type: prefs.saleType || null,
      p_destination: prefs.destination,
      p_op_id: opSel.value || null,
      p_new_op_date: opSel.value ? null : dlg.querySelector('#oa-dlg-date').value,
      p_lines: lines.map(({ r, c }) => ({
        product_code: r.product_code, product_name: r.product_name, weekly_avg: r.weekly_avg,
        stock_qty: r.stock_qty, suggestion: c.suggestion, order_qty: c.order
      }))
    });
    if (err) {
      showNotification('Erro ao salvar pedido: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Salvar pedido';
      return;
    }
    close();
    const miss = (data?.unmapped || []).length;
    showNotification(`Pedido salvo na OP ${data.order_code} (${data.demands} linha(s) de demanda)${miss ? `; ${miss} produto(s) sem sabor ficaram fora da OP` : ''}.`, 'success');
  });
}

function loadScript(src) {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Não foi possível carregar o leitor de planilhas (sem internet?).'));
    document.head.appendChild(s);
  });
}

async function importFile(file, input) {
  if (!file) return;
  const label = rootEl.querySelector('#oa-import-label');
  const setLabel = t => { label.textContent = t; };
  try {
    setLabel('Lendo planilha…');
    await loadScript(XLSX_URL);
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const allRows = [];
    wb.SheetNames.forEach(n => allRows.push(...window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })));
    const parsed = parseSalesRows(allRows);
    if (!parsed.records.length) throw new Error('Nenhuma venda encontrada. A planilha precisa ser o relatório "Mapa de Vendas por Cliente".');

    const cut = /\.xls$/i.test(file.name) && allRows.length >= 65536;
    const msg = `${parsed.records.length.toLocaleString('pt-BR')} itens de ${formatDate(parsed.firstDate)} a ${formatDate(parsed.lastDate)} (${parsed.types.join(', ') || 'sem tipo'}).` +
      (cut ? '\n\nATENÇÃO: o arquivo .xls tem 65.536 linhas, o limite do formato. Provavelmente veio cortado; exporte em .xlsx/.csv ou em períodos menores.' : '') +
      '\n\nLinhas já importadas são atualizadas, não duplicadas. Importar?';
    if (!window.confirm(msg)) { setLabel('Importar planilha de vendas'); return; }

    const chunk = 1000;
    for (let i = 0; i < parsed.records.length; i += chunk) {
      setLabel(`Gravando ${Math.min(i + chunk, parsed.records.length).toLocaleString('pt-BR')} / ${parsed.records.length.toLocaleString('pt-BR')}…`);
      const part = parsed.records.slice(i, i + chunk).map(r => ({ ...r, imported_at: new Date().toISOString() }));
      const { error } = await supabase.from('sales_records').upsert(part, { onConflict: 'sale_type,sale_number,item_seq' });
      if (error) throw new Error(`Erro ao gravar (linha ${i + 1}): ${error.message}`);
    }
    showNotification(`Importação concluída: ${parsed.records.length.toLocaleString('pt-BR')} itens.`, 'success');
    prefs.refDate = '';
    await loadSummary();
    await loadAnalysis();
  } catch (err) {
    console.error(err);
    showNotification(err.message || String(err), 'error');
  } finally {
    setLabel('Importar planilha de vendas');
    input.value = '';
  }
}

function orderLines() {
  return visibleRows().filter(({ c }) => c.order > 0);
}

function printOrder() {
  const list = orderLines();
  if (!list.length) { showNotification('Nenhum produto com pedido maior que zero.', 'info'); return; }
  document.getElementById('oa-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'oa-print-root';
  const total = list.reduce((a, { c }) => a + c.order, 0);
  root.innerHTML = `
    <h1>Pedido de Produção — Análise de Vendas</h1>
    <p>Referência ${formatDate(prefs.refDate)} · média de ${prefs.weeks} semana(s) · cobertura de ${nf(prefs.giros, 1)} giro(s) de 1 semana${prefs.saleType ? ' · ' + esc(prefs.saleType) : ''} · emitido ${formatDateTime(new Date().toISOString())}</p>
    <table>
      <thead><tr><th class="l">Cód.</th><th class="l">Produto</th><th>Média/sem</th><th>Estoque</th><th>Pedido</th></tr></thead>
      <tbody>${list.map(({ r, c }) => `<tr><td class="l">${esc(r.product_code)}</td><td class="l">${esc(r.product_name)}</td><td>${nf(r.weekly_avg)}</td><td>${nf(r.stock_qty)}</td><td><b>${nf(c.order, 0)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="l" colspan="4"><b>Total (${list.length} produtos)</b></td><td><b>${nf(total, 0)}</b></td></tr></tfoot>
    </table>`;
  document.body.appendChild(root);
  document.body.classList.add('oa-printing');
  const cleanup = () => {
    document.body.classList.remove('oa-printing');
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

function exportCsv() {
  const list = visibleRows();
  const header = ['Codigo', 'Produto', ...Array.from({ length: prefs.weeks }, (_, i) => `S${i + 1}`), 'Media_semana', 'Estoque', 'Cobertura_giros', 'Necessidade', 'Sugestao', 'Pedido'];
  const f = n => String(Math.round(Number(n || 0) * 1000) / 1000).replace('.', ',');
  const lines = list.map(({ r, c }) => [r.product_code, `"${r.product_name.replace(/"/g, '""')}"`, ...r.weekly_qty.map(f), f(r.weekly_avg), f(r.stock_qty), c.coverage === null ? '' : f(c.coverage), f(c.need), f(c.suggestion), f(c.order)].join(';'));
  const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `analise-pedidos-${prefs.refDate || todayLocal()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
