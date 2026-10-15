import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatDate, weekdayName, parseLocalDate, todayLocal } from '../utils.js';

// Lista final da produção real (por OP e sabor) para a pessoa dar entrada no PDV.
// O sistema não controla estoque: o fluxo termina no vácuo e esta tabela é a "saída" do sistema.

function defaultWeekRange() {
  const now = parseLocalDate(todayLocal());
  const diffToMonday = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(monday), end: iso(sunday) };
}

const initialRange = defaultWeekRange();
let filterMode = 'op'; // 'op' (por ordem de produção), 'all', 'day', 'range' — mesmos filtros das outras telas + por OP
let selectedOrderId = null;
let selectedDay = todayLocal();
let startDate = initialRange.start;
let endDate = initialRange.end;
let onlyFinished = true;
let groupByFlavor = false;
let cache = { orders: [], portions: [], demands: [] };

const PRODUCT_LABELS = { manta: 'Manta', massa: 'Massa', linguica: 'Linguiça', granel: 'Granel', hamburguer: 'Hambúrguer' };
const CONSERVATION_LABELS = { resfriado: 'Resfriado', congelado: 'Congelado' };

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtKg = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtDate = d => (d ? d.toLocaleDateString('pt-BR') : '—');

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  return d;
}

// +N meses de calendário, mantendo o fim de mês quando o dia não existe (igual ao Postgres)
function addMonths(date, n) {
  const first = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

/**
 * Agrega as porções de uma OP em uma linha por sabor.
 * Sabor finalizado = todas as porções com embutimento e vácuo concluídos.
 * Quantidade real = soma do vácuo concluído (última etapa do fluxo).
 */
export function buildPdvRows(order, portions, demands = []) {
  // Uma linha por sabor + tipo de produto + conservação (o tipo vem gravado na porção).
  // Porções antigas, sem tipo, ficam numa linha só do sabor e usam as demandas como referência.
  const byFlavor = {};
  (portions || []).filter(p => p.production_order_id === order.id).forEach(p => {
    const key = `${p.flavor_id}|${p.product_type || ''}|${p.conservation || ''}`;
    const row = byFlavor[key] || (byFlavor[key] = {
      flavorId: p.flavor_id, name: p.flavors?.name || 'Sabor', productType: p.product_type || null, conservation: p.conservation || null,
      portions: 0, finished: 0, plannedKg: 0, realKg: 0, lastDone: null
    });
    row.portions += 1;
    row.plannedKg += Number(p.planned_kg || 0);
    const runs = p.process_runs || [];
    const emb = runs.find(r => r.stage === 'embutimento');
    const vac = runs.find(r => r.stage === 'vacuo');
    if (vac?.status === 'completed') {
      row.realKg += Number(vac.actual_kg || 0);
      if (vac.completed_at && (!row.lastDone || vac.completed_at > row.lastDone)) row.lastDone = vac.completed_at;
    }
    if (emb?.status === 'completed' && vac?.status === 'completed') row.finished += 1;
  });

  const base = order.mass_ready_date || order.production_date;
  const baseDate = base ? parseLocalDate(base) : null;

  // Produto(s) do sabor na OP, vindos das demandas do planejamento (tipo + conservação)
  const productsFor = flavorId => {
    const map = new Map();
    (demands || [])
      .filter(d => d.production_order_id === order.id && d.flavor_id === flavorId)
      .forEach(d => {
        const key = `${d.requested_product_type || ''}|${d.requested_conservation || ''}`;
        const entry = map.get(key) || { type: d.requested_product_type || null, conservation: d.requested_conservation || null, plannedKg: 0 };
        entry.plannedKg += Number(d.planned_kg || 0);
        map.set(key, entry);
      });
    return [...map.values()].sort((a, b) => String(a.type).localeCompare(String(b.type)));
  };

  return Object.values(byFlavor)
    .map(r => ({
      ...r,
      // tipo definido na porção = produto exato; sem tipo = referência vinda das demandas
      products: r.productType
        ? [{ type: r.productType, conservation: r.conservation, plannedKg: r.plannedKg }]
        : productsFor(r.flavorId),
      isFinished: r.portions > 0 && r.finished === r.portions,
      massReady: baseDate,
      expiryChilled: baseDate ? addDays(baseDate, 45) : null,
      expiryFrozen: baseDate ? addMonths(baseDate, 6) : null
    }))
    .map(r => {
      // Só mostra a validade que vale para a conservação do produto (se houver apenas uma)
      const cons = new Set(r.products.map(e => e.conservation).filter(Boolean));
      const onlyOne = cons.size === 1;
      return {
        ...r,
        expiryChilled: !onlyOne || cons.has('resfriado') ? r.expiryChilled : null,
        expiryFrozen: !onlyOne || cons.has('congelado') ? r.expiryFrozen : null
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR') ||
      String(a.productType).localeCompare(String(b.productType)) ||
      String(a.conservation).localeCompare(String(b.conservation)));
}

function productEntryText(e, withKg) {
  const name = e.type ? PRODUCT_LABELS[e.type] : 'Não definido';
  const cons = e.conservation ? ` · ${CONSERVATION_LABELS[e.conservation]}` : '';
  const kg = withKg ? ` (${fmtKg(e.plannedKg)} kg)` : '';
  return `${name}${cons}${kg}`;
}

// Texto do(s) produto(s); com mais de um, mostra o planejado de cada um
function productLines(r) {
  const list = r.products || [];
  if (list.length === 0) return ['Não definido'];
  return list.map(e => productEntryText(e, list.length > 1));
}

// Linhas do período: uma por OP x sabor, ou somadas por sabor
function buildPeriodRows() {
  const orders = cache.orders
    .filter(o => {
      if (filterMode === 'op') return o.id === selectedOrderId;
      if (filterMode === 'day') return o.production_date === selectedDay;
      if (filterMode === 'range') return o.production_date >= startDate && o.production_date <= endDate;
      return true; // 'all'
    })
    .sort((a, b) => a.production_date.localeCompare(b.production_date) || a.order_code.localeCompare(b.order_code));

  let rows = [];
  orders.forEach(o => buildPdvRows(o, cache.portions, cache.demands).forEach(r => rows.push({ ...r, order: o })));
  const finishedCount = rows.filter(r => r.isFinished).length;
  const totalCount = rows.length;
  if (onlyFinished) rows = rows.filter(r => r.isFinished);

  if (groupByFlavor) {
    const map = {};
    rows.forEach(r => {
      const gKey = `${r.flavorId}|${r.productType || ''}|${r.conservation || ''}`;
      const g = map[gKey] || (map[gKey] = { name: r.name, realKg: 0, plannedKg: 0, ops: new Set(), isFinished: true, productMap: new Map() });
      g.realKg += r.realKg;
      g.plannedKg += r.plannedKg;
      g.ops.add(r.order.order_code);
      (r.products || []).forEach(e => {
        const key = `${e.type || ''}|${e.conservation || ''}`;
        const cur = g.productMap.get(key) || { type: e.type, conservation: e.conservation, plannedKg: 0 };
        cur.plannedKg += e.plannedKg;
        g.productMap.set(key, cur);
      });
      if (!r.isFinished) g.isFinished = false;
    });
    rows = Object.values(map)
      .map(g => ({ ...g, products: [...g.productMap.values()] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || productLines(a).join().localeCompare(productLines(b).join()));
  }
  return { rows, finishedCount, totalCount, orderCount: orders.length };
}

function scopeTitle() {
  if (filterMode === 'op') {
    const o = cache.orders.find(x => x.id === selectedOrderId);
    return o ? `${o.order_code} — ${weekdayName(o.production_date)}, ${formatDate(o.production_date)}` : 'Ordem de produção';
  }
  if (filterMode === 'day') return `${weekdayName(selectedDay)}, ${formatDate(selectedDay)}`;
  if (filterMode === 'range') return `${formatDate(startDate)} a ${formatDate(endDate)}`;
  return 'Todas as ordens de produção';
}

function scopeFileName() {
  if (filterMode === 'op') return cache.orders.find(x => x.id === selectedOrderId)?.order_code || 'op';
  if (filterMode === 'day') return selectedDay;
  if (filterMode === 'range') return `${startDate}_a_${endDate}`;
  return 'geral';
}

// Produto: tipo (linguiça, massa, granel...) e conservação definidos no planejamento
const PRODUCT_COLUMN = {
  label: 'Produto',
  get: r => productLines(r).join(' + '),
  cell: r => productLines(r).map(t => `<span class="block font-bold text-ink-text">${esc(t)}</span>`).join('')
};

function columns() {
  if (groupByFlavor) {
    return [
      { label: 'Sabor', get: r => r.name, bold: true },
      PRODUCT_COLUMN,
      { label: 'Quantidade real (kg)', get: r => fmtKg(r.realKg), num: true, ok: true },
      { label: 'Planejado (kg)', get: r => fmtKg(r.plannedKg), num: true, muted: true },
      { label: 'OPs no período', get: r => [...r.ops].join(', ') }
    ];
  }
  return [
    { label: 'OP', get: r => r.order.order_code, bold: true },
    { label: 'Dia', get: r => `${weekdayName(r.order.production_date)}, ${formatDate(r.order.production_date)}` },
    { label: 'Sabor', get: r => r.name, bold: true },
    PRODUCT_COLUMN,
    { label: 'Quantidade real (kg)', get: r => fmtKg(r.realKg), num: true, ok: true },
    { label: 'Planejado (kg)', get: r => fmtKg(r.plannedKg), num: true, muted: true },
    { label: 'Massa pronta', get: r => fmtDate(r.massReady) },
    { label: 'Validade resfriado (+45 d)', get: r => fmtDate(r.expiryChilled) },
    { label: 'Validade congelado (+6 m)', get: r => fmtDate(r.expiryFrozen) }
  ];
}

function rowsToMatrix(rows) {
  const cols = columns();
  return [cols.map(c => c.label), ...rows.map(r => cols.map(c => c.get(r)))];
}

async function copyTable(rows) {
  const text = rowsToMatrix(rows).map(l => l.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Tabela copiada. Cole na planilha ou no PDV.', 'success');
  } catch {
    showNotification('Não foi possível copiar automaticamente. Use "Baixar CSV".', 'error');
  }
}

function downloadCsv(rows) {
  const csv = rowsToMatrix(rows)
    .map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `producao-${scopeFileName()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderTable(container) {
  const tableBox = container.querySelector('#pdv-table-box');
  if (!tableBox) return;

  const { rows, finishedCount, totalCount, orderCount } = buildPeriodRows();
  const cols = columns();
  const totalReal = rows.reduce((s, r) => s + r.realKg, 0);
  const totalPlanned = rows.reduce((s, r) => s + r.plannedKg, 0);

  if (orderCount === 0) {
    tableBox.innerHTML = '';
    tableBox.appendChild(renderEmptyState({
      icon: 'receipt_long',
      title: 'Nenhuma OP neste filtro',
      description: 'Não há ordens de produção para o filtro selecionado. Ajuste o filtro.'
    }));
    return;
  }

  const statusBadge = totalCount > 0 && finishedCount === totalCount
    ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-surface-container-low text-status-success">Todos os sabores finalizados ✓</span>'
    : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-badge-warning-bg text-badge-warning-text">${finishedCount} de ${totalCount} sabores finalizados</span>`;

  // índice das colunas numéricas para o rodapé de total
  const firstNum = cols.findIndex(c => c.num);

  tableBox.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-space-sm">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 class="font-headline-sm text-ink-text">${esc(scopeTitle())}</h3>
        <span class="text-xs font-bold text-text-muted">${orderCount} ${orderCount === 1 ? 'OP' : 'OPs'}</span>
        ${statusBadge}
      </div>
      <div class="flex items-center gap-2">
        <button id="pdv-copy-btn" ${rows.length ? '' : 'disabled'} class="min-h-[40px] px-3.5 rounded-lg bg-surface-canvas hover:bg-surface-variant disabled:opacity-50 text-ink-text font-label-md border border-border-subtle flex items-center gap-1">
          <span class="material-symbols-outlined text-[18px]">content_copy</span><span>Copiar tabela</span>
        </button>
        <button id="pdv-csv-btn" ${rows.length ? '' : 'disabled'} class="min-h-[40px] px-3.5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep disabled:opacity-50 text-on-primary font-label-md flex items-center gap-1">
          <span class="material-symbols-outlined text-[18px]">download</span><span>Baixar CSV</span>
        </button>
      </div>
    </div>

    ${rows.length === 0 ? `
      <div class="p-6 text-center text-xs italic text-text-muted bg-surface-canvas rounded-xl border border-border-subtle">
        Nenhum sabor finalizado neste filtro. Desmarque "Somente finalizados" para ver o andamento.
      </div>` : `
      <div class="overflow-x-auto rounded-xl border border-border-subtle">
        <table class="w-full text-sm">
          <thead class="bg-surface-canvas text-left text-xs uppercase text-text-muted">
            <tr>
              ${cols.map(c => `<th class="px-3 py-2 ${c.num ? 'text-right' : ''}">${esc(c.label)}</th>`).join('')}
              <th class="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="border-t border-border-subtle">
                ${cols.map(c => `<td class="px-3 py-2 ${c.num ? 'text-right tabular-nums' : ''} ${c.bold ? 'font-bold text-ink-text' : ''} ${c.ok ? 'font-bold text-status-success' : ''} ${c.muted ? 'text-text-muted' : ''}">${c.cell ? c.cell(r) : esc(c.get(r))}</td>`).join('')}
                <td class="px-3 py-2 text-xs font-bold ${r.isFinished ? 'text-status-success' : 'text-amber-warning'}">
                  ${r.isFinished ? 'Finalizado' : (r.portions ? `Em produção (${r.finished}/${r.portions} porções)` : 'Em produção')}
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot class="bg-surface-canvas font-bold">
            <tr class="border-t border-border-subtle">
              ${cols.map((c, i) => {
                if (i === 0) return '<td class="px-3 py-2">Total</td>';
                if (c.label.startsWith('Quantidade real')) return `<td class="px-3 py-2 text-right text-status-success tabular-nums">${fmtKg(totalReal)}</td>`;
                if (c.label.startsWith('Planejado')) return `<td class="px-3 py-2 text-right text-text-muted tabular-nums">${fmtKg(totalPlanned)}</td>`;
                return '<td></td>';
              }).join('')}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`}
  `;

  if (rows.some(r => (r.products || []).length > 1)) {
    tableBox.insertAdjacentHTML('beforeend', `
      <p class="text-xs text-text-muted bg-surface-canvas border border-border-subtle rounded-lg px-3 py-2">
        <b>Atenção:</b> nas linhas com mais de um produto, a quantidade real é a soma do vácuo do sabor.
        Estas são porções antigas, geradas antes de o tipo ser gravado por porção; confira a divisão (valores entre parênteses = planejado) antes de lançar no PDV.
      </p>`);
  }

  tableBox.querySelector('#pdv-copy-btn')?.addEventListener('click', () => copyTable(rows));
  tableBox.querySelector('#pdv-csv-btn')?.addEventListener('click', () => downloadCsv(rows));
}

export async function renderPdvList(container) {
  container.innerHTML = '<div class="p-6 text-center text-text-muted text-sm">Carregando produção real...</div>';

  const [{ data: orders, error: oErr }, { data: portions, error: pErr }, { data: demands, error: dErr }] = await Promise.all([
    supabase.from('production_orders').select('id, order_code, production_date, mass_ready_date, canceled_at').order('production_date', { ascending: false }),
    supabase.from('production_portions').select(`
      *,
      flavors (name),
      process_runs (stage, status, actual_kg, completed_at)
    `),
    supabase.from('production_demands').select('production_order_id, flavor_id, planned_kg, requested_product_type, requested_conservation')
  ]);

  if (oErr || pErr || dErr) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar a produção: ${esc((oErr || pErr || dErr).message)}</div>`;
    return;
  }

  cache = { orders: (orders || []).filter(o => !o.canceled_at), portions: portions || [], demands: demands || [] };

  if (cache.orders.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'receipt_long',
      title: 'Nenhuma ordem de produção',
      description: 'Crie uma OP no Planejamento. Quando os sabores forem finalizados no vácuo, a lista para entrada no PDV aparece aqui.'
    }));
    return;
  }

  if (!cache.orders.some(o => o.id === selectedOrderId)) selectedOrderId = cache.orders[0].id;

  const modeBtn = (mode, label) =>
    `<button data-mode="${mode}" class="pdv-mode-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterMode === mode ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">${label}</button>`;

  const inputCls = 'min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary';

  const controlsHtml = () => {
    if (filterMode === 'op') {
      return `
        <div class="flex items-center gap-2">
          <label for="pdv-order-select" class="text-xs font-bold text-ink-text">Ordem de Produção:</label>
          <select id="pdv-order-select" class="${inputCls}">
            ${cache.orders.map(o => `<option value="${esc(o.id)}" ${o.id === selectedOrderId ? 'selected' : ''}>${esc(o.order_code)} — ${esc(weekdayName(o.production_date))}, ${esc(formatDate(o.production_date))}</option>`).join('')}
          </select>
        </div>`;
    }
    if (filterMode === 'day') {
      return `
        <div class="flex items-center gap-2">
          <label for="pdv-day" class="text-xs font-bold text-ink-text">Data de Produção:</label>
          <input type="date" id="pdv-day" value="${esc(selectedDay)}" class="${inputCls}">
        </div>`;
    }
    if (filterMode === 'range') {
      return `
        <div class="flex items-center gap-2 flex-wrap">
          <label for="pdv-start-date" class="text-xs font-bold text-ink-text">De:</label>
          <input type="date" id="pdv-start-date" value="${esc(startDate)}" class="${inputCls}">
          <label for="pdv-end-date" class="text-xs font-bold text-ink-text">Até:</label>
          <input type="date" id="pdv-end-date" value="${esc(endDate)}" class="${inputCls}">
        </div>`;
    }
    return '<span class="text-xs font-bold text-text-muted bg-surface-canvas px-3 py-1.5 rounded-lg">Exibindo todas as ordens de produção</span>';
  };

  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-sm">
        <div>
          <h2 class="font-headline-sm text-ink-text">Lista final para entrada no PDV</h2>
          <p class="text-xs text-text-muted">Produção real de cada sabor (vácuo concluído). Use esta tabela para dar entrada no sistema final.</p>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-label-md text-text-muted flex items-center gap-1 mr-1">
              <span class="material-symbols-outlined text-[18px]">filter_list</span>
              <span>Filtrar:</span>
            </span>
            <div id="pdv-mode-buttons" class="flex items-center gap-2 flex-wrap">
              ${modeBtn('op', 'Por Ordem de Produção')}
              ${modeBtn('all', 'Visão Geral')}
              ${modeBtn('day', 'Por Dia')}
              ${modeBtn('range', 'Por Período / Semana')}
            </div>
          </div>
          <div id="pdv-date-controls" class="flex items-center gap-3 flex-wrap"></div>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          <label class="flex items-center gap-2 text-xs font-bold text-ink-text cursor-pointer">
            <input type="checkbox" id="pdv-only-finished" ${onlyFinished ? 'checked' : ''}> Somente finalizados
          </label>
          <label class="flex items-center gap-2 text-xs font-bold text-ink-text cursor-pointer">
            <input type="checkbox" id="pdv-group-flavor" ${groupByFlavor ? 'checked' : ''}> Somar por sabor
          </label>
        </div>
      </div>
      <div id="pdv-table-box" class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md"></div>
    </div>
  `;

  const controlsBox = container.querySelector('#pdv-date-controls');

  const bindControls = () => {
    controlsBox.innerHTML = controlsHtml();

    controlsBox.querySelector('#pdv-order-select')?.addEventListener('change', e => {
      selectedOrderId = e.target.value;
      renderTable(container);
    });
    controlsBox.querySelector('#pdv-day')?.addEventListener('change', e => {
      if (!e.target.value) return;
      selectedDay = e.target.value;
      renderTable(container);
    });
    const startInput = controlsBox.querySelector('#pdv-start-date');
    const endInput = controlsBox.querySelector('#pdv-end-date');
    startInput?.addEventListener('change', e => {
      if (!e.target.value) return;
      startDate = e.target.value;
      if (endDate < startDate) { endDate = startDate; endInput.value = endDate; }
      renderTable(container);
    });
    endInput?.addEventListener('change', e => {
      if (!e.target.value) return;
      endDate = e.target.value;
      if (startDate > endDate) { startDate = endDate; startInput.value = startDate; }
      renderTable(container);
    });
  };

  container.querySelectorAll('.pdv-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterMode = btn.dataset.mode;
      container.querySelectorAll('.pdv-mode-btn').forEach(b => {
        const on = b.dataset.mode === filterMode;
        b.className = `pdv-mode-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${on ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
      });
      bindControls();
      renderTable(container);
    });
  });

  container.querySelector('#pdv-only-finished')?.addEventListener('change', e => {
    onlyFinished = e.target.checked;
    renderTable(container);
  });
  container.querySelector('#pdv-group-flavor')?.addEventListener('change', e => {
    groupByFlavor = e.target.checked;
    renderTable(container);
  });

  bindControls();
  renderTable(container);
}
