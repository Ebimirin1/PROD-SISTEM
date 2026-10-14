import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatDate, weekdayName, parseLocalDate } from '../utils.js';

// Lista final da produção real (por OP e sabor) para a pessoa dar entrada no PDV.
// O sistema não controla estoque: o fluxo termina no vácuo e esta tabela é a "saída" do sistema.

let selectedOrderId = null;
let onlyFinished = true;
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

function rowsToMatrix(order, rows) {
  const header = ['OP', 'Dia', 'Sabor', 'Quantidade real (kg)', 'Planejado (kg)', 'Massa pronta', 'Validade resfriado', 'Validade congelado'];
  const body = rows.map(r => [
    order.order_code,
    weekdayName(order.production_date),
    r.name,
    fmtKg(r.realKg),
    fmtKg(r.plannedKg),
    fmtDate(r.massReady),
    fmtDate(r.expiryChilled),
    fmtDate(r.expiryFrozen)
  ]);
  return [header, ...body];
}

async function copyTable(order, rows) {
  const text = rowsToMatrix(order, rows).map(l => l.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Tabela copiada. Cole na planilha ou no PDV.', 'success');
  } catch {
    showNotification('Não foi possível copiar automaticamente. Use "Baixar CSV".', 'error');
  }
}

function downloadCsv(order, rows) {
  const csv = rowsToMatrix(order, rows)
    .map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `producao-${order.order_code}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderTable(container) {
  const order = cache.orders.find(o => o.id === selectedOrderId);
  const tableBox = container.querySelector('#pdv-table-box');
  if (!order || !tableBox) return;

  const allRows = buildPdvRows(order, cache.portions);
  const rows = onlyFinished ? allRows.filter(r => r.isFinished) : allRows;
  const finishedCount = allRows.filter(r => r.isFinished).length;
  const opDone = allRows.length > 0 && finishedCount === allRows.length;
  const totalReal = rows.reduce((s, r) => s + r.realKg, 0);
  const totalPlanned = rows.reduce((s, r) => s + r.plannedKg, 0);

  const statusBadge = opDone
    ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-surface-container-low text-status-success">Produção finalizada ✓</span>'
    : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-badge-warning-bg text-badge-warning-text">${finishedCount} de ${allRows.length} sabores finalizados</span>`;

  if (allRows.length === 0) {
    tableBox.innerHTML = '';
    tableBox.appendChild(renderEmptyState({
      icon: 'receipt_long',
      title: 'Esta OP ainda não tem porções',
      description: 'Gere as ordens de produção no Planejamento para acompanhar a produção aqui.'
    }));
    return;
  }

  tableBox.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-space-sm">
      <div class="flex items-center gap-2 flex-wrap">
        <h3 class="font-headline-sm text-ink-text">${esc(order.order_code)}</h3>
        <span class="text-xs font-bold text-text-muted">${esc(weekdayName(order.production_date))}, ${esc(formatDate(order.production_date))}</span>
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
        Nenhum sabor finalizado nesta OP ainda. Desmarque "Somente finalizados" para ver o andamento.
      </div>` : `
      <div class="overflow-x-auto rounded-xl border border-border-subtle">
        <table class="w-full text-sm">
          <thead class="bg-surface-canvas text-left text-xs uppercase text-text-muted">
            <tr>
              <th class="px-3 py-2">Sabor</th>
              <th class="px-3 py-2 text-right">Quantidade real (kg)</th>
              <th class="px-3 py-2 text-right">Planejado (kg)</th>
              <th class="px-3 py-2">Massa pronta</th>
              <th class="px-3 py-2">Validade resfriado (+45 d)</th>
              <th class="px-3 py-2">Validade congelado (+6 m)</th>
              <th class="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="border-t border-border-subtle">
                <td class="px-3 py-2 font-bold text-ink-text">${esc(r.name)}</td>
                <td class="px-3 py-2 text-right font-bold text-status-success tabular-nums">${fmtKg(r.realKg)}</td>
                <td class="px-3 py-2 text-right text-text-muted tabular-nums">${fmtKg(r.plannedKg)}</td>
                <td class="px-3 py-2">${fmtDate(r.massReady)}</td>
                <td class="px-3 py-2">${fmtDate(r.expiryChilled)}</td>
                <td class="px-3 py-2">${fmtDate(r.expiryFrozen)}</td>
                <td class="px-3 py-2 text-xs font-bold ${r.isFinished ? 'text-status-success' : 'text-amber-warning'}">
                  ${r.isFinished ? 'Finalizado' : `Em produção (${r.finished}/${r.portions} porções)`}
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot class="bg-surface-canvas font-bold">
            <tr class="border-t border-border-subtle">
              <td class="px-3 py-2">Total</td>
              <td class="px-3 py-2 text-right text-status-success tabular-nums">${fmtKg(totalReal)}</td>
              <td class="px-3 py-2 text-right text-text-muted tabular-nums">${fmtKg(totalPlanned)}</td>
              <td colspan="4"></td>
            </tr>
          </tfoot>
        </table>
      </div>`}
  `;

  tableBox.querySelector('#pdv-copy-btn')?.addEventListener('click', () => copyTable(order, rows));
  tableBox.querySelector('#pdv-csv-btn')?.addEventListener('click', () => downloadCsv(order, rows));
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

  if (!cache.orders.some(o => o.id === selectedOrderId)) selectedOrderId = cache.orders[0].id;

  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h2 class="font-headline-sm text-ink-text">Lista final para entrada no PDV</h2>
          <p class="text-xs text-text-muted">Produção real de cada sabor (vácuo concluído). Use esta tabela para dar entrada no sistema final.</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <label class="flex items-center gap-2 text-xs font-bold text-ink-text cursor-pointer">
            <input type="checkbox" id="pdv-only-finished" ${onlyFinished ? 'checked' : ''}> Somente finalizados
          </label>
          <select id="pdv-order-select" class="min-h-[40px] px-3 rounded-lg border border-border-subtle bg-surface-card text-sm font-bold text-ink-text">
            ${cache.orders.map(o => `<option value="${esc(o.id)}" ${o.id === selectedOrderId ? 'selected' : ''}>${esc(o.order_code)} — ${esc(weekdayName(o.production_date))}, ${esc(formatDate(o.production_date))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="pdv-table-box" class="bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md"></div>
    </div>
  `;

  container.querySelector('#pdv-order-select')?.addEventListener('change', e => {
    selectedOrderId = e.target.value;
    renderTable(container);
  });
  container.querySelector('#pdv-only-finished')?.addEventListener('change', e => {
    onlyFinished = e.target.checked;
    renderTable(container);
  });

  renderTable(container);
}
