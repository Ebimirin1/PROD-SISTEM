import { supabase } from '../supabaseClient.js';
import * as U from '../utils.js';

const { formatDate, formatDateTime, showNotification, weekdayName } = U;

// Mesmo rótulo de OP do resto do app ("Lote …", opLabel em utils.js); sem ele, o código puro
function opName(o) {
  if (!o) return '';
  try {
    if (typeof U.opLabel === 'function') {
      const r = U.opLabel(o);
      if (typeof r === 'string' && r.trim() && !/undefined|null|NaN/.test(r)) return r;
    }
  } catch { /* usa o código */ }
  return o.order_code || '';
}

// Consultar Origem — rastreabilidade por lote.
// Lote do produto = data de produção da OP. Escolhe a OP (ou digita a data do lote), escolhe o
// produto (sabor) e a tela mostra o que foi nele e o lote de cada insumo:
//   * Massa-base: todas as bateladas da OP (massada única, vale para todos os sabores da OP);
//   * Insumos do sabor: kits por porção daquele sabor.
// Também faz o caminho inverso: digita o lote de um insumo e vê em quais produtos ele entrou.
// Dados vêm das funções rastreabilidade_origem / rastreabilidade_por_lote_insumo
// (migration_rastreabilidade.sql).

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n, d = 3) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });

const TYPE_LABEL = { linguica: 'Linguiça', manta: 'Manta', massa: 'Massa', granel: 'Granel', hamburguer: 'Hambúrguer' };
const CONS_LABEL = { resfriado: 'Resfriado', congelado: 'Congelado' };
const DEST_LABEL = { emporio: 'Empório', lanchonete: 'Lanchonete', atacado: 'Atacado', outro: 'Outro' };
const KIND_LABEL = { carne: 'Carne', tempero: 'Tempero', insumo: 'Insumo' };

const st = { mode: 'product', orderId: null, flavorId: null, lotSearch: '' };
let orders = [];     // { id, order_code, production_date }
let products = [];   // por sabor na OP: { flavor_id, name, kg, items: [{type, cons, dest, kg}] }
let origin = [];     // linhas de rastreabilidade_origem da OP escolhida
let root = null;

const btnClass = active => `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${active ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;

export async function render(container) {
  root = container;
  container.innerHTML = `
    <style>
      #tr-print-root { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 12mm; }
        body.tr-printing > *:not(#tr-print-root) { display: none !important; }
        body.tr-printing { background: #fff !important; min-height: 0 !important; }
        body.tr-printing #tr-print-root { display: block; font-family: 'Ubuntu', Arial, sans-serif; color: #000; }
        #tr-print-root h1 { font-size: 16px; margin: 0 0 4px; }
        #tr-print-root h2 { font-size: 13px; margin: 14px 0 4px; }
        #tr-print-root p { font-size: 11px; margin: 0 0 4px; }
        #tr-print-root table { width: 100%; border-collapse: collapse; font-size: 11px; }
        #tr-print-root th, #tr-print-root td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
        #tr-print-root thead { display: table-header-group; }
        #tr-print-root .tr-missing { font-weight: bold; }
      }
    </style>
    <div class="flex flex-col gap-space-md max-w-[1400px] mx-auto w-full">
      <div class="flex flex-wrap items-center justify-between gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[28px]">manage_search</span>
            <h1 class="font-display-lg text-display-lg text-ink-text">Consultar Origem</h1>
          </div>
          <p class="font-body-md text-body-md text-text-muted mt-1">Rastreabilidade: o lote do produto (data de produção), os insumos que foram nele e o lote de cada insumo.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="tr-mode-product" class="${btnClass(st.mode === 'product')}">Por produto</button>
          <button id="tr-mode-lot" class="${btnClass(st.mode === 'lot')}">Por lote de insumo</button>
        </div>
      </div>
      <div id="tr-body"></div>
    </div>`;

  container.querySelector('#tr-mode-product').addEventListener('click', () => switchMode('product'));
  container.querySelector('#tr-mode-lot').addEventListener('click', () => switchMode('lot'));
  ensurePrintRoot();

  await loadOrders();
  renderBody();
}

function switchMode(mode) {
  st.mode = mode;
  root.querySelector('#tr-mode-product').className = btnClass(mode === 'product');
  root.querySelector('#tr-mode-lot').className = btnClass(mode === 'lot');
  renderBody();
}

function ensurePrintRoot() {
  if (!document.getElementById('tr-print-root')) {
    const el = document.createElement('div');
    el.id = 'tr-print-root';
    document.body.appendChild(el);
  }
}

async function loadOrders() {
  const { data, error } = await supabase
    .from('production_orders')
    .select('id, order_code, production_date, canceled_at')
    .is('canceled_at', null)
    .order('production_date', { ascending: false })
    .order('order_code', { ascending: false })
    .limit(500);
  if (error) {
    console.error(error);
    showNotification('Não foi possível carregar as ordens de produção.', 'error');
    orders = [];
    return;
  }
  orders = data || [];
  if (!orders.some(o => o.id === st.orderId)) st.orderId = orders[0]?.id || null;
}

function renderBody() {
  const body = root.querySelector('#tr-body');
  if (st.mode === 'lot') return renderLotSearch(body);

  if (!orders.length) {
    body.innerHTML = emptyBox('inventory', 'Nenhuma ordem de produção ainda', 'Assim que houver uma OP no Planejamento, os produtos dela aparecem aqui para consulta.');
    return;
  }

  const options = orders.map(o => `<option value="${esc(o.id)}" ${o.id === st.orderId ? 'selected' : ''}>${esc(opName(o))} — ${esc(weekdayName(o.production_date))}, ${esc(formatDate(o.production_date))}</option>`).join('');
  body.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex flex-wrap items-end gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div class="flex flex-col gap-1 min-w-0 max-w-full">
          <label for="tr-op" class="text-xs font-bold text-ink-text">Ordem de Produção</label>
          <select id="tr-op" class="min-w-0 max-w-full min-h-[40px] px-3 rounded-lg border border-border-subtle bg-surface-card text-sm font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">${options}</select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="tr-date" class="text-xs font-bold text-ink-text">ou lote do produto (data de produção)</label>
          <input id="tr-date" type="date" class="min-h-[40px] px-3 rounded-lg border border-border-subtle bg-surface-card text-sm text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
      </div>
      <div id="tr-products"></div>
      <div id="tr-detail"></div>
    </div>`;

  body.querySelector('#tr-op').addEventListener('change', e => { st.orderId = e.target.value; st.flavorId = null; loadOrder(); });
  body.querySelector('#tr-date').addEventListener('change', e => {
    const date = e.target.value;
    if (!date) return;
    const match = orders.find(o => o.production_date === date);
    if (!match) {
      showNotification(`Nenhuma OP com data de produção ${formatDate(date)}.`, 'warning');
      return;
    }
    st.orderId = match.id;
    st.flavorId = null;
    body.querySelector('#tr-op').value = match.id;
    loadOrder();
  });

  loadOrder();
}

async function loadOrder() {
  const prodEl = root.querySelector('#tr-products');
  const detEl = root.querySelector('#tr-detail');
  if (!prodEl || !st.orderId) return;
  prodEl.innerHTML = loadingBox('Carregando produtos da OP…');
  detEl.innerHTML = '';

  const [demRes, oriRes] = await Promise.all([
    supabase.from('production_demands')
      .select('flavor_id, requested_product_type, requested_conservation, destination_key, planned_kg, flavors(name)')
      .eq('production_order_id', st.orderId),
    supabase.rpc('rastreabilidade_origem', { p_order_id: st.orderId })
  ]);

  if (oriRes.error) {
    console.error(oriRes.error);
    prodEl.innerHTML = errorBox(/function|does not exist|schema cache/i.test(oriRes.error.message || '')
      ? 'A consulta de origem ainda não está ativa no banco: rode o arquivo migration_rastreabilidade.sql.'
      : `Erro ao carregar a origem: ${oriRes.error.message}`);
    return;
  }
  if (demRes.error) console.error(demRes.error);
  origin = oriRes.data || [];

  // Produtos = sabores da OP (pedidos), mais algum sabor que só tenha kit separado
  const byFlavor = new Map();
  (demRes.data || []).forEach(d => {
    if (!byFlavor.has(d.flavor_id)) byFlavor.set(d.flavor_id, { flavor_id: d.flavor_id, name: d.flavors?.name || 'Sabor', kg: 0, items: [] });
    const p = byFlavor.get(d.flavor_id);
    p.kg += Number(d.planned_kg || 0);
    p.items.push({ type: d.requested_product_type, cons: d.requested_conservation, dest: d.destination_key, kg: Number(d.planned_kg || 0) });
  });
  origin.filter(r => r.flavor_id && !byFlavor.has(r.flavor_id)).forEach(r => {
    byFlavor.set(r.flavor_id, { flavor_id: r.flavor_id, name: r.flavor_name || 'Sabor', kg: 0, items: [] });
  });
  products = [...byFlavor.values()].sort((a, b) => cmp(a.name, b.name));

  if (!products.length) {
    prodEl.innerHTML = emptyBox('inventory_2', 'Esta OP não tem produtos', 'Lance os pedidos da OP no Planejamento para poder consultar a origem.');
    return;
  }
  if (!products.some(p => p.flavor_id === st.flavorId)) st.flavorId = products.length === 1 ? products[0].flavor_id : null;

  prodEl.innerHTML = `
    <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
      <p class="text-xs font-bold text-ink-text mb-2">Escolha o produto (${products.length})</p>
      <div class="flex flex-wrap gap-2">
        ${products.map(p => {
          const missing = missingCount(p.flavor_id);
          return `<button data-flavor="${esc(p.flavor_id)}" class="tr-prod ${btnClass(p.flavor_id === st.flavorId)} flex items-center gap-1">
            ${esc(p.name)}${p.kg ? ` <span class="font-normal opacity-80">· ${nf(p.kg, 1)} kg</span>` : ''}
            ${missing ? `<span class="material-symbols-outlined text-[16px] text-amber-warning" title="${missing} item(ns) sem lote">warning</span>` : ''}
          </button>`;
        }).join('')}
      </div>
    </div>`;
  prodEl.querySelectorAll('.tr-prod').forEach(b => b.addEventListener('click', () => {
    st.flavorId = b.dataset.flavor;
    prodEl.querySelectorAll('.tr-prod').forEach(x => { x.className = `tr-prod ${btnClass(x.dataset.flavor === st.flavorId)} flex items-center gap-1`; });
    renderDetail();
  }));
  renderDetail();
}

function rowsFor(flavorId) {
  const base = origin.filter(r => r.origem === 'massa_base');
  const flavor = origin.filter(r => r.origem === 'sabor' && r.flavor_id === flavorId);
  return { base, flavor };
}

function missingCount(flavorId) {
  const { base, flavor } = rowsFor(flavorId);
  return [...base, ...flavor].filter(r => !r.insumo_lote).length;
}

function renderDetail() {
  const detEl = root.querySelector('#tr-detail');
  if (!detEl) return;
  const p = products.find(x => x.flavor_id === st.flavorId);
  if (!p) {
    detEl.innerHTML = '';
    return;
  }
  const order = orders.find(o => o.id === st.orderId);
  const { base, flavor } = rowsFor(p.flavor_id);
  const missing = [...base, ...flavor].filter(r => !r.insumo_lote).length;

  detEl.innerHTML = `
    <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
      <div class="flex flex-wrap items-start justify-between gap-space-md">
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase text-text-muted">Lote do produto</p>
          <p class="font-display-lg text-display-lg text-bordeaux-primary leading-tight">${esc(formatDate(order?.production_date))}</p>
          <p class="font-title-md text-ink-text">${esc(p.name)} · ${esc(opName(order))}</p>
          ${productLines(p)}
        </div>
        <button id="tr-print" class="px-3 py-2 rounded-lg text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm flex items-center gap-1">
          <span class="material-symbols-outlined text-[18px]">print</span> Imprimir para o fiscal
        </button>
      </div>
      ${missing ? `<div class="px-3 py-2 rounded-lg bg-badge-error-bg text-badge-error-text text-sm flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px]">warning</span>
        ${missing} item(ns) sem lote registrado. Registre o lote na Separação para a rastreabilidade ficar completa.
      </div>` : ''}
      ${sectionHtml('Massa-base', 'Bateladas da OP (massada única: vale para todos os produtos desta OP).', base, true,
        'Nenhuma pesagem de batelada registrada nesta OP. Confirme pesagem e lote em Separação > Bateladas de Massa-Base.')}
      ${sectionHtml(`Insumos do sabor ${p.name}`, 'Kits por porção deste sabor.', flavor, false,
        'Nenhum insumo de sabor registrado para este produto.')}
    </div>`;

  detEl.querySelector('#tr-print').addEventListener('click', () => printDetail(p, order, base, flavor));
}

function productLines(p) {
  if (!p.items.length) return '';
  const parts = p.items.map(i => [TYPE_LABEL[i.type] || i.type, CONS_LABEL[i.cons], DEST_LABEL[i.dest], `${nf(i.kg, 1)} kg`].filter(Boolean).join(' · '));
  return `<p class="text-xs text-text-muted mt-1">${parts.map(esc).join('<br>')}</p>`;
}

function sectionHtml(title, subtitle, rows, isBase, emptyText) {
  const sorted = [...rows].sort((a, b) => (a.batch_no || 0) - (b.batch_no || 0) || (a.portion_no || 0) - (b.portion_no || 0) || cmp(a.insumo_nome, b.insumo_nome));
  return `
    <div>
      <h3 class="font-headline-sm text-headline-sm text-ink-text">${esc(title)}</h3>
      <p class="text-xs text-text-muted mb-2">${esc(subtitle)}</p>
      ${sorted.length ? `
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr class="text-left text-xs uppercase text-text-muted border-b border-border-subtle">
              <th class="py-2 px-2">${isBase ? 'Batelada' : 'Porção'}</th>
              <th class="py-2 px-2">Insumo</th>
              <th class="py-2 px-2">Tipo</th>
              <th class="py-2 px-2 text-right">Quantidade</th>
              <th class="py-2 px-2">Lote do insumo</th>
              <th class="py-2 px-2">Registrado em</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(r => `
              <tr class="border-b border-border-subtle">
                <td class="py-2 px-2">${isBase ? r.batch_no : r.portion_no}</td>
                <td class="py-2 px-2 font-bold text-ink-text">${esc(r.insumo_nome)}</td>
                <td class="py-2 px-2">${esc(KIND_LABEL[r.item_kind] || r.item_kind)}</td>
                <td class="py-2 px-2 text-right whitespace-nowrap">${nf(r.quantidade)} ${esc(r.unidade)}</td>
                <td class="py-2 px-2 font-bold ${r.insumo_lote ? 'text-bordeaux-primary' : 'text-alert-critical'}">${r.insumo_lote ? esc(r.insumo_lote) : 'sem lote'}</td>
                <td class="py-2 px-2 whitespace-nowrap text-text-muted">${r.registrado_em ? esc(formatDateTime(r.registrado_em)) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<p class="text-sm text-text-muted italic">${esc(emptyText)}</p>`}
    </div>`;
}

function printDetail(p, order, base, flavor) {
  const table = (rows, isBase) => rows.length ? `
    <table>
      <thead><tr><th>${isBase ? 'Batelada' : 'Porção'}</th><th>Insumo</th><th>Tipo</th><th>Quantidade</th><th>Lote do insumo</th></tr></thead>
      <tbody>${[...rows].sort((a, b) => (a.batch_no || 0) - (b.batch_no || 0) || (a.portion_no || 0) - (b.portion_no || 0) || cmp(a.insumo_nome, b.insumo_nome)).map(r => `
        <tr><td>${isBase ? r.batch_no : r.portion_no}</td><td>${esc(r.insumo_nome)}</td><td>${esc(KIND_LABEL[r.item_kind] || r.item_kind)}</td>
        <td>${nf(r.quantidade)} ${esc(r.unidade)}</td><td class="${r.insumo_lote ? '' : 'tr-missing'}">${r.insumo_lote ? esc(r.insumo_lote) : 'SEM LOTE'}</td></tr>`).join('')}
      </tbody>
    </table>` : '<p>Nenhum registro.</p>';

  const el = document.getElementById('tr-print-root');
  el.innerHTML = `
    <h1>Rastreabilidade — ${esc(p.name)} · Lote ${esc(formatDate(order?.production_date))}</h1>
    <p>${esc(opName(order))} · Data de produção ${esc(formatDate(order?.production_date))} · Emitido em ${esc(formatDateTime(new Date().toISOString()))}</p>
    ${p.items.map(i => `<p>${esc([TYPE_LABEL[i.type] || i.type, CONS_LABEL[i.cons], DEST_LABEL[i.dest], `${nf(i.kg, 1)} kg`].filter(Boolean).join(' · '))}</p>`).join('')}
    <h2>Massa-base (bateladas da OP)</h2>
    ${table(base, true)}
    <h2>Insumos do sabor</h2>
    ${table(flavor, false)}`;
  document.body.classList.add('tr-printing');
  const done = () => { document.body.classList.remove('tr-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1000);
}

// ---------- Por lote de insumo (caminho inverso) ----------

function renderLotSearch(body) {
  body.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <form id="tr-lot-form" class="flex flex-wrap items-end gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div class="flex flex-col gap-1 min-w-0 flex-1 max-w-md">
          <label for="tr-lot" class="text-xs font-bold text-ink-text">Lote do insumo</label>
          <input id="tr-lot" type="text" value="${esc(st.lotSearch)}" placeholder="Ex.: o lote que está na embalagem do insumo" class="min-h-[40px] px-3 rounded-lg border border-border-subtle bg-surface-card text-sm text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
        <button type="submit" class="min-h-[40px] px-4 rounded-lg text-sm font-bold bg-bordeaux-primary text-on-primary shadow-sm flex items-center gap-1">
          <span class="material-symbols-outlined text-[18px]">search</span> Buscar
        </button>
      </form>
      <div id="tr-lot-result"></div>
    </div>`;
  body.querySelector('#tr-lot-form').addEventListener('submit', e => {
    e.preventDefault();
    st.lotSearch = body.querySelector('#tr-lot').value.trim();
    searchLot();
  });
  if (st.lotSearch) searchLot();
}

async function searchLot() {
  const out = root.querySelector('#tr-lot-result');
  if (!st.lotSearch) {
    out.innerHTML = '';
    return;
  }
  out.innerHTML = loadingBox('Buscando…');
  const { data, error } = await supabase.rpc('rastreabilidade_por_lote_insumo', { p_lote: st.lotSearch });
  if (error) {
    console.error(error);
    out.innerHTML = errorBox(`Erro na busca: ${error.message}`);
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    out.innerHTML = emptyBox('search_off', 'Nenhum uso encontrado', `Nenhum insumo com lote parecido com "${st.lotSearch}" foi registrado na Separação.`);
    return;
  }
  out.innerHTML = `
    <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
      <p class="text-xs text-text-muted mb-2">${rows.length} uso(s). Massa-base vale para todos os produtos da OP.</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr class="text-left text-xs uppercase text-text-muted border-b border-border-subtle">
              <th class="py-2 px-2">Lote do produto</th><th class="py-2 px-2">OP</th><th class="py-2 px-2">Produto</th>
              <th class="py-2 px-2">Insumo</th><th class="py-2 px-2">Lote do insumo</th><th class="py-2 px-2 text-right">Quantidade</th><th class="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="border-b border-border-subtle">
                <td class="py-2 px-2 font-bold text-bordeaux-primary whitespace-nowrap">${esc(formatDate(r.production_date))}</td>
                <td class="py-2 px-2">${esc(opName({ id: r.production_order_id, order_code: r.order_code, production_date: r.production_date }))}</td>
                <td class="py-2 px-2">${r.origem === 'massa_base' ? `Massa-base (batelada ${r.batch_no})` : esc(r.flavor_name)}</td>
                <td class="py-2 px-2 font-bold text-ink-text">${esc(r.insumo_nome)}</td>
                <td class="py-2 px-2">${esc(r.insumo_lote)}</td>
                <td class="py-2 px-2 text-right whitespace-nowrap">${nf(r.quantidade)} ${esc(r.unidade)}</td>
                <td class="py-2 px-2"><button class="tr-open text-xs font-bold text-bordeaux-primary underline" data-order="${esc(r.production_order_id)}" data-flavor="${esc(r.flavor_id || '')}">Ver origem</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  out.querySelectorAll('.tr-open').forEach(b => b.addEventListener('click', () => {
    st.orderId = b.dataset.order;
    st.flavorId = b.dataset.flavor || null;
    if (!orders.some(o => o.id === st.orderId)) {
      showNotification('Esta OP não está mais na lista (pode ter sido cancelada).', 'warning');
      return;
    }
    switchMode('product');
  }));
}

// ---------- caixas de estado ----------

function emptyBox(icon, title, text) {
  return `<div class="flex flex-col items-center justify-center p-10 text-center bg-surface-card rounded-xl border border-border-subtle shadow-sm">
    <span class="material-symbols-outlined text-[44px] text-text-muted mb-2">${icon}</span>
    <h3 class="font-headline-sm text-headline-sm text-ink-text mb-1">${esc(title)}</h3>
    <p class="font-body-md text-body-md text-text-muted max-w-md">${esc(text)}</p>
  </div>`;
}
function loadingBox(text) {
  return `<div class="flex items-center justify-center p-8 text-text-muted"><span class="material-symbols-outlined text-[28px] animate-spin mr-2">sync</span>${esc(text)}</div>`;
}
function errorBox(text) {
  return `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-xl font-body-md">${esc(text)}</div>`;
}
