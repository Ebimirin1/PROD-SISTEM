import { supabase } from '../supabaseClient.js';
import * as U from '../utils.js';

const { formatDate, showNotification } = U;

// Importar Pedido — lê a planilha semanal de produção (CSV com ";" ou .xlsx/.xls) com as colunas
// semana_inicio, semana_fim, tipo, codigo, produto, kg_total, kg_congelado, kg_resfriado,
// kg_sem_conservacao. Acha o sabor de cada linha pelo código de venda (o "Código" do Inflow,
// o mesmo da Análise de Pedidos) e lança na OP aberta da semana; se não houver, cria uma.
// Códigos que o sistema não conhece aparecem na lista para escolher o sabor (fica lembrado)
// ou ficam de fora; nada trava a importação.
// Banco: order_import_preview / order_import_apply / order_import_history
// (migration_importar_pedido.sql).

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n, d = 1) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });

const TYPES = [['linguica', 'Linguiça'], ['granel', 'Granel'], ['hamburguer', 'Hambúrguer'], ['massa', 'Massa'], ['manta', 'Manta']];
const TYPE_LABEL = Object.fromEntries(TYPES);
const CONS_LABEL = { congelado: 'Congelado', resfriado: 'Resfriado', '': 'Sem conservação' };
const FOUND_LABEL = {
  manual: 'escolhido aqui antes',
  analise: 'vínculo da Análise de Pedidos',
  cadastro: 'código no cadastro do sabor',
  irmao: 'mesmo produto sem "granel/massa"'
};

function opName(o) {
  if (!o) return '';
  try {
    if (typeof U.opLabel === 'function') {
      const r = U.opLabel(o.order_code);
      if (typeof r === 'string' && r.trim() && !/undefined|null|NaN|\[object/.test(r)) return r;
    }
  } catch { /* usa o código */ }
  return o.order_code || '';
}

const st = {
  fileName: '', weekStart: '', weekEnd: '', destination: 'emporio',
  rows: [],          // linhas da planilha + resolução: {codigo, produto, tipo, kgCong, kgResf, kgSem, kgTotal, flavorId, type, foundBy, catalogName, remember}
  opChoice: '',      // id da OP ou 'new'
  newOpDate: '',
  replace: true,
  history: [],
  result: null
};
let orders = [];
let flavors = [];
let recipeFlavors = new Set();
let root = null;
const btn = 'px-3 py-2 rounded-lg text-xs font-bold bg-bordeaux-primary text-on-primary shadow-sm flex items-center gap-1 cursor-pointer';
const btnGhost = 'px-3 py-2 rounded-lg text-xs font-bold bg-surface-canvas text-ink-text hover:bg-surface-container flex items-center gap-1 cursor-pointer';

export async function render(container) {
  root = container;
  container.innerHTML = `
    <div class="flex flex-col gap-space-md max-w-[1400px] mx-auto w-full">
      <div class="flex flex-wrap items-center justify-between gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[28px]">upload_file</span>
            <h1 class="font-display-lg text-display-lg text-ink-text">Importar Pedido</h1>
          </div>
          <p class="font-body-md text-body-md text-text-muted mt-1">Lê a planilha do pedido da semana, acha cada produto pelo código e lança na Ordem de Produção da semana (cria uma se não houver OP aberta).</p>
        </div>
        <label class="${btn}">
          <span class="material-symbols-outlined text-[18px]">upload</span>
          <span id="oi-file-label">Importar pedido (.csv / .xlsx)</span>
          <input id="oi-file" type="file" accept=".csv,.txt,.xlsx,.xls" class="hidden" />
        </label>
      </div>
      <div id="oi-body"></div>
    </div>`;
  container.querySelector('#oi-file').addEventListener('change', e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) readFile(f);
  });
  await loadLists();
  renderBody();
}

async function loadLists() {
  const [o, f, fv] = await Promise.all([
    supabase.from('production_orders').select('id, order_code, production_date, generated_at, canceled_at')
      .is('canceled_at', null).order('production_date', { ascending: false }).limit(300),
    supabase.from('flavors').select('id, name, active').eq('active', true).order('name'),
    supabase.from('formula_versions').select('flavor_id').eq('status', 'active')
  ]);
  if (o.error) showNotification('Não foi possível carregar as ordens de produção.', 'error');
  orders = o.data || [];
  flavors = (f.data || []).sort((a, b) => cmp(a.name, b.name));
  recipeFlavors = new Set((fv.data || []).map(x => x.flavor_id));
}

// ---------- leitura da planilha ----------

function loadScript(src) {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Não foi possível carregar o leitor de planilhas (sem internet?). Salve como .csv e importe de novo.'));
    document.head.appendChild(s);
  });
}

const normKey = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^﻿/, '')
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(v) {
  if (!v && v !== 0) return '';
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) { // número de série do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function weekFromFileName(name) {
  // "Semana 09.11 a 15.11.2026 - PRODUCAO"
  const m = String(name).match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\s*a\s*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/i);
  if (!m) return null;
  const y2 = m[6].length === 2 ? '20' + m[6] : m[6];
  const y1 = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : y2;
  return { start: `${y1}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, end: `${y2}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}` };
}

function splitCsv(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function fileToRows(file) {
  if (/\.(csv|txt)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    return splitCsv(text.replace(/^﻿/, ''));
  }
  await loadScript(XLSX_URL);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // usa a primeira aba que tiver a coluna "codigo"
  for (const n of wb.SheetNames) {
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
    if (rows.some(r => r.some(c => normKey(c) === 'codigo'))) return rows;
  }
  return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}

function parseRows(raw) {
  const h = raw.findIndex(r => r.some(c => normKey(c) === 'codigo'));
  if (h < 0) throw new Error('Não achei a coluna "codigo" na planilha.');
  const keys = raw[h].map(normKey);
  const col = (...names) => { for (const n of names) { const i = keys.indexOf(n); if (i >= 0) return i; } return -1; };
  const ix = {
    ini: col('semana_inicio', 'inicio'), fim: col('semana_fim', 'fim'), tipo: col('tipo'),
    cod: col('codigo'), prod: col('produto', 'descricao'), tot: col('kg_total', 'kg', 'total_kg'),
    cong: col('kg_congelado', 'congelado'), resf: col('kg_resfriado', 'resfriado'),
    sem: col('kg_sem_conservacao', 'sem_conservacao')
  };
  const get = (r, i) => (i >= 0 ? r[i] : '');
  const out = [];
  let weekStart = '', weekEnd = '';
  for (const r of raw.slice(h + 1)) {
    const codigo = String(get(r, ix.cod) ?? '').trim().replace(/\.0+$/, '');
    if (!codigo) continue;
    const kgCong = num(get(r, ix.cong)), kgResf = num(get(r, ix.resf)), kgSem = num(get(r, ix.sem));
    let kgTotal = num(get(r, ix.tot));
    if (!kgTotal) kgTotal = kgCong + kgResf + kgSem;
    if (kgTotal <= 0 && kgCong + kgResf + kgSem <= 0) continue;
    weekStart = weekStart || isoDate(get(r, ix.ini));
    weekEnd = weekEnd || isoDate(get(r, ix.fim));
    out.push({
      codigo, produto: String(get(r, ix.prod) ?? '').trim(), tipo: String(get(r, ix.tipo) ?? '').trim(),
      kgCong, kgResf, kgSem, kgTotal
    });
  }
  return { rows: out, weekStart, weekEnd };
}

// Linhas que vão para a OP: uma por conservação com kg (sem divisão: tudo "sem conservação")
function lineSplits(r) {
  const parts = [];
  if (r.kgCong > 0) parts.push(['congelado', r.kgCong]);
  if (r.kgResf > 0) parts.push(['resfriado', r.kgResf]);
  if (r.kgSem > 0) parts.push(['', r.kgSem]);
  if (!parts.length && r.kgTotal > 0) parts.push(['', r.kgTotal]);
  return parts;
}

async function readFile(file) {
  const label = root.querySelector('#oi-file-label');
  label.textContent = 'Lendo planilha…';
  try {
    const parsed = parseRows(await fileToRows(file));
    if (!parsed.rows.length) throw new Error('A planilha não tem nenhuma linha com código e kg.');
    const fromName = weekFromFileName(file.name);
    st.fileName = file.name;
    st.weekStart = parsed.weekStart || fromName?.start || '';
    st.weekEnd = parsed.weekEnd || fromName?.end || '';
    st.result = null;

    const { data, error } = await supabase.rpc('order_import_preview', {
      p_rows: parsed.rows.map(r => ({ codigo: r.codigo, tipo: r.tipo, produto: r.produto }))
    });
    if (error) throw new Error(error.message.includes('order_import_preview') ? 'Falta rodar o SQL da importação (migration_importar_pedido.sql) no banco.' : error.message);
    const byIdx = new Map((data || []).map(d => [d.idx, d]));
    st.rows = parsed.rows.map((r, i) => {
      const d = byIdx.get(i) || {};
      return { ...r, flavorId: d.flavor_id || '', type: d.product_type || 'linguica', foundBy: d.found_by || '', catalogName: d.catalog_name || '', ignored: !!d.ignored, remember: false, manual: false };
    });
    await loadLists();
    await loadHistory();
    pickDefaultOp();
    renderBody();
  } catch (e) {
    console.error(e);
    showNotification(e.message || String(e), 'error');
  } finally {
    label.textContent = 'Importar pedido (.csv / .xlsx)';
  }
}

async function loadHistory() {
  st.history = [];
  if (!st.weekStart) return;
  const { data } = await supabase.rpc('order_import_history', { p_week_start: st.weekStart });
  st.history = data || [];
}

const openOrders = () => orders.filter(o => !o.generated_at && !o.canceled_at);
const inWeek = o => st.weekStart && st.weekEnd && o.production_date >= st.weekStart && o.production_date <= st.weekEnd;

function pickDefaultOp() {
  const week = openOrders().filter(inWeek).sort((a, b) => cmp(b.production_date, a.production_date));
  st.opChoice = week[0]?.id || 'new';
  st.newOpDate = st.weekStart || U.todayLocal?.() || new Date().toISOString().slice(0, 10);
  st.replace = st.history.some(h => h.production_order_id === st.opChoice);
}

// ---------- tela ----------

function renderBody() {
  const body = root.querySelector('#oi-body');
  if (st.result) { body.innerHTML = resultHtml(); bindResult(body); return; }
  if (!st.rows.length) {
    body.innerHTML = `
      <div class="bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm text-sm text-text-muted flex flex-col gap-2">
        <p>Clique em <b>Importar pedido</b> e escolha a planilha da semana (ex.: "Semana 09.11 a 15.11.2026 - PRODUCAO.csv").</p>
        <p>Colunas usadas: <code>semana_inicio</code>, <code>semana_fim</code>, <code>tipo</code>, <code>codigo</code>, <code>produto</code>, <code>kg_total</code>, <code>kg_congelado</code>, <code>kg_resfriado</code>, <code>kg_sem_conservacao</code>. As outras colunas são ignoradas.</p>
        <p>Antes de lançar, a tela mostra cada produto, o sabor que achou e o que vai ficar de fora.</p>
      </div>`;
    return;
  }

  const open = openOrders();
  const weekOps = open.filter(inWeek);
  const otherOps = open.filter(o => !inWeek(o)).slice(0, 40);
  const generatedWeek = orders.filter(o => o.generated_at && inWeek(o));
  const opOpt = o => `<option value="${o.id}" ${st.opChoice === o.id ? 'selected' : ''}>${esc(opName(o))} · ${formatDate(o.production_date)}</option>`;
  const flavorOpts = sel => `<option value="">— fica de fora —</option>` + flavors.map(f => `<option value="${f.id}" ${sel === f.id ? 'selected' : ''}>${esc(f.name)}${recipeFlavors.has(f.id) ? '' : ' (sem receita ativa)'}</option>`).join('');
  const typeOpts = sel => TYPES.map(([k, l]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${l}</option>`).join('');
  const hist = st.history.filter(h => st.opChoice !== 'new' && h.production_order_id === st.opChoice);

  const sum = summary();
  const rowsHtml = st.rows.map((r, i) => {
    const status = rowStatus(r);
    const badge = {
      ok: '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-bold">vai para a OP</span>',
      sem_receita: '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">sabor sem receita ativa</span>',
      sem_vinculo: '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold">código não encontrado</span>'
    }[status];
    const how = r.manual ? 'escolhido agora' : (FOUND_LABEL[r.foundBy] || '');
    return `
      <tr class="border-t border-border-subtle ${status === 'ok' ? '' : 'bg-red-50/40'}">
        <td class="px-2 py-1.5 font-mono">${esc(r.codigo)}</td>
        <td class="px-2 py-1.5">${esc(r.produto)}${r.catalogName && cmp(r.catalogName, r.produto) ? `<div class="text-[10px] text-text-muted">${esc(r.catalogName)}</div>` : ''}</td>
        <td class="px-2 py-1.5 text-text-muted">${esc(r.tipo)}</td>
        <td class="px-2 py-1.5 text-right">${r.kgCong ? nf(r.kgCong) : ''}</td>
        <td class="px-2 py-1.5 text-right">${r.kgResf ? nf(r.kgResf) : ''}</td>
        <td class="px-2 py-1.5 text-right">${r.kgSem ? nf(r.kgSem) : ''}</td>
        <td class="px-2 py-1.5 text-right font-bold">${nf(r.kgTotal)}</td>
        <td class="px-2 py-1.5">
          <select data-flavor="${i}" class="border border-border-subtle rounded px-1 py-1 text-xs max-w-[220px] bg-surface-card">${flavorOpts(r.flavorId)}</select>
          ${how ? `<div class="text-[10px] text-text-muted mt-0.5">${esc(how)}</div>` : ''}
          ${r.manual && r.flavorId ? `<label class="text-[10px] flex items-center gap-1 mt-0.5"><input type="checkbox" data-remember="${i}" ${r.remember ? 'checked' : ''}/> lembrar para este código</label>` : ''}
        </td>
        <td class="px-2 py-1.5"><select data-type="${i}" class="border border-border-subtle rounded px-1 py-1 text-xs bg-surface-card">${typeOpts(r.type)}</select></td>
        <td class="px-2 py-1.5 text-[11px] whitespace-nowrap">${badge}</td>
      </tr>`;
  }).join('');

  root.querySelector('#oi-body').innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="bg-surface-card p-3 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-end gap-3 text-xs">
        <div><div class="text-text-muted">Arquivo</div><div class="font-bold">${esc(st.fileName)}</div></div>
        <label class="flex flex-col gap-1">Semana de
          <input id="oi-ws" type="date" value="${st.weekStart}" class="border border-border-subtle rounded px-2 py-1 bg-surface-card" /></label>
        <label class="flex flex-col gap-1">até
          <input id="oi-we" type="date" value="${st.weekEnd}" class="border border-border-subtle rounded px-2 py-1 bg-surface-card" /></label>
        <label class="flex flex-col gap-1">Destino
          <select id="oi-dest" class="border border-border-subtle rounded px-2 py-1 bg-surface-card">
            <option value="emporio" ${st.destination === 'emporio' ? 'selected' : ''}>Empório</option>
            <option value="lanchonete" ${st.destination === 'lanchonete' ? 'selected' : ''}>Lanchonete</option>
            <option value="outro" ${st.destination === 'outro' ? 'selected' : ''}>Outro</option>
          </select></label>
        <label class="flex flex-col gap-1">Ordem de Produção
          <select id="oi-op" class="border border-border-subtle rounded px-2 py-1 bg-surface-card min-w-[240px]">
            ${weekOps.length ? `<optgroup label="Abertas nesta semana">${weekOps.map(opOpt).join('')}</optgroup>` : ''}
            <option value="new" ${st.opChoice === 'new' ? 'selected' : ''}>Criar OP nova…</option>
            ${otherOps.length ? `<optgroup label="Outras OPs abertas">${otherOps.map(opOpt).join('')}</optgroup>` : ''}
          </select></label>
        ${st.opChoice === 'new' ? `<label class="flex flex-col gap-1">Data de produção da OP nova
          <input id="oi-newdate" type="date" value="${st.newOpDate}" class="border border-border-subtle rounded px-2 py-1 bg-surface-card" /></label>` : ''}
      </div>
      ${!weekOps.length ? `<div class="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs">Não há OP aberta nesta semana${generatedWeek.length ? ` (a OP ${generatedWeek.map(o => esc(opName(o))).join(', ')} já foi gerada e não aceita linhas novas)` : ''}. Ao lançar, o sistema cria uma OP nova na data escolhida acima.</div>` : ''}
      ${hist.length ? `<div class="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex flex-col gap-1">
          <div>Já foi importado pedido desta semana nesta OP: ${hist.map(h => `${esc(h.file_name || 'sem nome')} (${nf(h.total_kg)} kg, ${new Date(h.created_at).toLocaleString('pt-BR')})`).join('; ')}.</div>
          <label class="flex items-center gap-1 font-bold"><input id="oi-replace" type="checkbox" ${st.replace ? 'checked' : ''}/> Substituir: tirar da OP as linhas da importação anterior e lançar esta (desmarcado = soma por cima)</label>
        </div>` : ''}
      <div class="bg-surface-card rounded-xl border border-border-subtle shadow-sm overflow-auto max-h-[calc(100vh-330px)]">
        <table class="w-full text-xs">
          <thead class="bg-surface-canvas sticky top-0 text-left">
            <tr>
              <th class="px-2 py-2">Código</th><th class="px-2 py-2">Produto (planilha)</th><th class="px-2 py-2">Tipo</th>
              <th class="px-2 py-2 text-right">Congelado</th><th class="px-2 py-2 text-right">Resfriado</th><th class="px-2 py-2 text-right">Sem cons.</th>
              <th class="px-2 py-2 text-right">Total kg</th><th class="px-2 py-2">Sabor no sistema</th><th class="px-2 py-2">Tipo na OP</th><th class="px-2 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="bg-surface-card p-3 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <b>${sum.okRows}</b> produto(s), <b>${nf(sum.okKg)} kg</b> vão para a OP.
          ${sum.outRows ? `<span class="text-red-700 font-bold ml-2">${sum.outRows} fora (${nf(sum.outKg)} kg): ${sum.outList.map(esc).join(', ')}</span>` : ''}
        </div>
        <div class="flex gap-2">
          <button id="oi-cancel" class="${btnGhost}">Cancelar</button>
          <button id="oi-apply" class="${btn}" ${sum.okRows ? '' : 'disabled style="opacity:.5"'}><span class="material-symbols-outlined text-[18px]">playlist_add</span>Lançar na OP</button>
        </div>
      </div>
    </div>`;

  const body2 = root.querySelector('#oi-body');
  body2.querySelector('#oi-ws').addEventListener('change', async e => { st.weekStart = e.target.value; await loadHistory(); pickDefaultOp(); renderBody(); });
  body2.querySelector('#oi-we').addEventListener('change', e => { st.weekEnd = e.target.value; pickDefaultOp(); renderBody(); });
  body2.querySelector('#oi-dest').addEventListener('change', e => { st.destination = e.target.value; });
  body2.querySelector('#oi-op').addEventListener('change', e => {
    st.opChoice = e.target.value;
    st.replace = st.history.some(h => h.production_order_id === st.opChoice);
    renderBody();
  });
  body2.querySelector('#oi-newdate')?.addEventListener('change', e => { st.newOpDate = e.target.value; });
  body2.querySelector('#oi-replace')?.addEventListener('change', e => { st.replace = e.target.checked; });
  body2.querySelectorAll('[data-flavor]').forEach(s => s.addEventListener('change', e => {
    const r = st.rows[+e.target.dataset.flavor];
    r.flavorId = e.target.value; r.manual = true; r.remember = !!r.flavorId;
    renderBody();
  }));
  body2.querySelectorAll('[data-type]').forEach(s => s.addEventListener('change', e => {
    const r = st.rows[+e.target.dataset.type];
    r.type = e.target.value;
    if (r.flavorId) { r.manual = true; r.remember = true; }
    renderBody();
  }));
  body2.querySelectorAll('[data-remember]').forEach(c => c.addEventListener('change', e => { st.rows[+e.target.dataset.remember].remember = e.target.checked; }));
  body2.querySelector('#oi-cancel').addEventListener('click', () => { st.rows = []; renderBody(); });
  body2.querySelector('#oi-apply').addEventListener('click', apply);
}

function rowStatus(r) {
  if (!r.flavorId) return 'sem_vinculo';
  if (!recipeFlavors.has(r.flavorId)) return 'sem_receita';
  return 'ok';
}

function summary() {
  const s = { okRows: 0, okKg: 0, outRows: 0, outKg: 0, outList: [] };
  st.rows.forEach(r => {
    const kg = lineSplits(r).reduce((a, [, k]) => a + k, 0);
    if (rowStatus(r) === 'ok') { s.okRows++; s.okKg += kg; } else { s.outRows++; s.outKg += kg; s.outList.push(`${r.codigo} ${r.produto}`); }
  });
  return s;
}

async function apply() {
  const b = root.querySelector('#oi-apply');
  if (!st.weekStart) { showNotification('Informe a semana do pedido.', 'error'); return; }
  if (st.opChoice === 'new' && !st.newOpDate) { showNotification('Informe a data de produção da OP nova.', 'error'); return; }
  const sum = summary();
  const opTxt = st.opChoice === 'new' ? `uma OP NOVA em ${formatDate(st.newOpDate)}` : `a OP ${opName(orders.find(o => o.id === st.opChoice))}`;
  if (!window.confirm(`Lançar ${sum.okRows} produto(s), ${nf(sum.okKg)} kg, em ${opTxt}?` + (sum.outRows ? `\n\n${sum.outRows} linha(s) ficam de fora: ${sum.outList.join(', ')}` : ''))) return;

  const lines = [];
  st.rows.forEach(r => lineSplits(r).forEach(([cons, kg]) => lines.push({
    codigo: r.codigo, produto: r.produto, tipo: r.tipo, conservation: cons, kg,
    flavor_id: r.flavorId || null, product_type: r.type, remember: !!(r.manual && r.remember && r.flavorId)
  })));

  b.disabled = true; b.style.opacity = '.5';
  const { data, error } = await supabase.rpc('order_import_apply', {
    p_file_name: st.fileName,
    p_week_start: st.weekStart,
    p_week_end: st.weekEnd || null,
    p_destination: st.destination,
    p_op_id: st.opChoice === 'new' ? null : st.opChoice,
    p_new_op_date: st.opChoice === 'new' ? st.newOpDate : null,
    p_replace: !!st.replace && st.history.some(h => h.production_order_id === st.opChoice),
    p_lines: lines
  });
  b.disabled = false; b.style.opacity = '';
  if (error) { showNotification(`Erro ao lançar: ${error.message}`, 'error'); return; }
  st.result = data;
  st.rows = [];
  await loadLists();
  showNotification(`Pedido lançado na OP ${data.order_code}: ${data.demands} linha(s), ${nf(data.kg)} kg.`, 'success');
  renderBody();
}

function resultHtml() {
  const r = st.result;
  const skipped = r.skipped || [];
  const why = { sem_vinculo: 'código não encontrado', sem_receita: 'sabor sem receita ativa' };
  return `
    <div class="bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm text-sm flex flex-col gap-3">
      <div class="flex items-center gap-2 text-green-800 font-bold">
        <span class="material-symbols-outlined">check_circle</span>
        Pedido lançado na OP ${esc(opName(r))} (${formatDate(r.production_date)})${r.created_op ? ', criada agora' : ''}.
      </div>
      <div>${r.demands} linha(s) de pedido, ${nf(r.kg)} kg.${r.removed ? ` ${r.removed} linha(s) da importação anterior foram substituídas.` : ''}</div>
      ${skipped.length ? `<div class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs">
          <div class="font-bold mb-1">Ficaram de fora (lance à mão no Pedido de Produção ou ligue o código e importe de novo):</div>
          <ul class="list-disc pl-5">${skipped.map(s => `<li>${esc(s.codigo)} ${esc(s.produto)}: ${nf(s.kg)} kg (${why[s.status] || s.status})</li>`).join('')}</ul>
        </div>` : ''}
      <div class="flex gap-2">
        <a href="#planning" class="${btn}"><span class="material-symbols-outlined text-[18px]">calendar_today</span>Abrir o Pedido de Produção</a>
        <button id="oi-again" class="${btnGhost}">Importar outro</button>
      </div>
    </div>`;
}

function bindResult(body) {
  body.querySelector('#oi-again')?.addEventListener('click', () => { st.result = null; renderBody(); });
}
