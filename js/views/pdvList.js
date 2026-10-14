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
let startDate = initialRange.start;
let endDate = initialRange.end;
let onlyFinished = true;
let groupByFlavor = false;
let cache = { orders: [], portions: [] };

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
export function buildPdvRows(order, portions) {
  const byFlavor = {};
  (portions || []).filter(p => p.production_order_id === order.id).forEach(p => {
    const row = byFlavor[p.flavor_id] || (byFlavor[p.flavor_id] = {
      flavorId: p.flavor_id, name: p.flavors?.name || 'Sabor', portions: 0, finished: 0, plannedKg: 0, realKg: 0, lastDone: null
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

  return Object.values(byFlavor)
    .map(r => ({
      ...r,
      isFinished: r.portions > 0 && r.finished === r.portions,
      massReady: baseDate,
      expiryChilled: baseDate ? addDays(baseDate, 45) : null,
      expiryFrozen: baseDate ? addMonths(baseDate, 6) : null
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// Linhas do período: uma por OP x sabor, ou somadas por sabor
function buildPeriodRows() {
  const orders = cache.orders
    .filter(o => o.production_date >= startDate && o.production_date <= endDate)
    .sort((a, b) => a.production_date.localeCompare(b.production_date) || a.order_code.localeCompare(b.order_code));

  let rows = [];
  orders.forEach(o => buildPdvRows(o, cache.portions).forEach(r => rows.push({ ...r, order: o })));
  const finishedCount = rows.filter(r => r.isFinished).length;
  const totalCount = rows.length;
  if (onlyFinished) rows = rows.filter(r => r.isFinished);

  if (groupByFlavor) {
    const map = {};
    rows.forEach(r => {
      const g = map[r.flavorId] || (map[r.flavorId] = { name: r.name, realKg: 0, plannedKg: 0, ops: new Set(), isFinished: true });
      g.realKg += r.realKg;
      g.plannedKg += r.plannedKg;
      g.ops.add(r.order.order_code);
      if (!r.isFinished) g.isFinished = false;
    });
    rows = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  return { rows, finishedCount, totalCount, orderCount: orders.length };
}

function columns() {
  if (groupByFlavor) {
    return [
      { label: 'Sabor', get: r => r.name, bold: true },
      { label: 'Quantidade real (kg)', get: r => fmtKg(r.realKg), num: true, ok: true },
      { label: 'Planejado (kg)', get: r => fmtKg(r.plannedKg), num: true, muted: true },
      { label: 'OPs no período', get: r => [...r.ops].join(', ') }
    ];
  }
  return [
    { label: 'OP', get: r => r.order.order_code, bold: true },
    { label: 'Dia', get: r => `${weekdayName(r.order.production_date)}, ${formatDate(r.order.production_date)}` },
    { label: 'Sabor', get: r => r.name, bold: true },
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
  a.download = `producao-${startDate}_a_${endDate}.csv`;
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
      title: 'Nenhuma OP no período',
      description: 'Não há ordens de produção entre as datas selecionadas. Ajuste o período.'
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
        <h3 class="font-headline-sm text-ink-text">${esc(formatDate(startDate))} a ${esc(formatDate(endDate))}</h3>
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
        Nenhum sabor finalizado neste período. Desmarque "Somente finalizados" para ver o andamento.
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
                ${cols.map(c => `<td class="px-3 py-2 ${c.num ? 'text-right tabular-nums' : ''} ${c.bold ? 'font-bold text-ink-text' : ''} ${c.ok ? 'font-bold text-status-success' : ''} ${c.muted ? 'text-text-muted' : ''}">${esc(c.get(r))}</td>`).join('')}
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

  tableBox.querySelector('#pdv-copy-btn')?.addEventListener('click', () => copyTable(rows));
  tableBox.querySelector('#pdv-csv-btn')?.addEventListener('click', () => downloadCsv(rows));
}

export async function renderPdvList(container) {
  container.innerHTML = '<div class="p-6 text-center text-text-muted text-sm">Carregando produção real...</div>';

  const [{ data: orders, error: oErr }, { data: portions, error: pErr }] = await Promise.all([
    supabase.from('production_orders').select('id, order_code, production_date, mass_ready_date, canceled_at').order('production_date', { ascending: false }),
    supabase.from('production_portions').select(`
      id, production_order_id, flavor_id, portion_no, planned_kg,
      flavors (name),
      process_runs (stage, status, actual_kg, completed_at)
    `)
  ]);

  if (oErr || pErr) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar a produção: ${esc((oErr || pErr).message)}</div>`;
    return;
  }

  cache = { orders: (orders || []).filter(o => !o.canceled_at), portions: portions || [] };

  if (cache.orders.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'receipt_long',
      title: 'Nenhuma ordem de produção',
      description: 'Crie uma OP no Planejamento. Quando os sabores forem finalizados no vácuo, a lista para entrada no PDV aparece aqui.'
    }));
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h2 class="font-headline-sm text-ink-text">Lista final para entrada no PDV</h2>
          <p class="text-xs text-text-muted">Produção real de cada sabor (vácuo concluído) no período. Use esta tabela para dar entrada no sistema final.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex items-center gap-2 bg-surface-canvas px-3 py-1.5 rounded-lg border border-border-subtle flex-wrap">
            <label for="pdv-start-date" class="text-xs font-bold text-text-muted uppercase">De:</label>
            <input type="date" id="pdv-start-date" value="${esc(startDate)}" class="bg-transparent text-sm font-bold text-bordeaux-primary focus:outline-none cursor-pointer">
            <label for="pdv-end-date" class="text-xs font-bold text-text-muted uppercase">Até:</label>
            <input type="date" id="pdv-end-date" value="${esc(endDate)}" class="bg-transparent text-sm font-bold text-bordeaux-primary focus:outline-none cursor-pointer">
          </div>
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

  const startInput = container.querySelector('#pdv-start-date');
  const endInput = container.querySelector('#pdv-end-date');

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
  container.querySelector('#pdv-only-finished')?.addEventListener('change', e => {
    onlyFinished = e.target.checked;
    renderTable(container);
  });
  container.querySelector('#pdv-group-flavor')?.addEventListener('change', e => {
    groupByFlavor = e.target.checked;
    renderTable(container);
  });

  renderTable(container);
}
