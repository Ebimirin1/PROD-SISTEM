// Total de Insumos: soma os insumos de sabor de todas as porções filtradas (todas as OPs e sabores)
// numa linha por insumo. Ex.: alho da linguiça de alho + alho da cuiabana = um total só.
// A massa-base das bateladas não entra aqui: ela tem a aba própria "Bateladas de Massa-Base".
// Tem layout próprio para impressão (A4 retrato).

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// g soma com kg e ml soma com l; tudo em milésimos inteiros para as somas fecharem sem erro de ponto flutuante
const UNIT_BASE = {
  kg: { base: 'kg', factor: 1000 },
  g: { base: 'kg', factor: 1 },
  l: { base: 'l', factor: 1000 },
  ml: { base: 'l', factor: 1 },
  un: { base: 'un', factor: 1000 }
};

const qtyText = (milli, unit) => {
  const digits = unit === 'un' ? 0 : 3;
  return `${(milli / 1000).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: 3 })} ${unit}`;
};

/**
 * Agrupa as linhas de insumo das porções por insumo (+ unidade base).
 * @param {Array} portions porções com flavors e portion_ingredient_lines (ingredients)
 */
export function buildIngredientTotals(portions) {
  const rows = new Map();
  const orders = new Set();
  let portionCount = 0;

  (portions || []).forEach(p => {
    const lines = p.portion_ingredient_lines || [];
    if (lines.length === 0) return;
    portionCount++;
    if (p.production_orders?.id) orders.add(p.production_orders.id);

    lines.forEach(l => {
      const unitInfo = UNIT_BASE[l.unit] || { base: l.unit || 'kg', factor: 1000 };
      const name = l.ingredients?.name || 'Insumo não identificado';
      const key = `${l.ingredient_id || name}|${unitInfo.base}`;
      if (!rows.has(key)) rows.set(key, { name, unit: unitInfo.base, totalMilli: 0, flavors: new Set() });
      const row = rows.get(key);
      row.totalMilli += Math.round(Number(l.requested_quantity || 0) * unitInfo.factor);
      if (p.flavors?.name) row.flavors.add(p.flavors.name);
    });
  });

  const cmp = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  const sorted = [...rows.values()]
    .map(r => ({ ...r, flavors: [...r.flavors].sort(cmp) }))
    .sort((a, b) => cmp(a.name, b.name) || cmp(a.unit, b.unit));

  return { rows: sorted, portionCount, orderCount: orders.size };
}

function totalsTableHtml({ rows }, { forPrint = false } = {}) {
  return `
    <table class="itt-table">
      <thead>
        <tr>
          <th class="itt-name">Insumo</th>
          <th class="itt-num">Quantidade Total</th>
          <th class="itt-flavors">Usado em</th>
          ${forPrint ? '<th class="itt-check">Separado</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="itt-name">${escapeHtml(r.name)}</td>
            <td class="itt-num">${qtyText(r.totalMilli, r.unit)}</td>
            <td class="itt-flavors">${escapeHtml(r.flavors.join(', '))}</td>
            ${forPrint ? '<td class="itt-check"></td>' : ''}
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// Estilos da tabela (tela e impressão). Ficam aqui para a tela não depender do Tailwind.
const TOTALS_STYLES = `
  .itt-table { border-collapse: collapse; width: 100%; font-size: 13px; color: #1f1a1a; }
  .itt-table th, .itt-table td { border: 1px solid #d9cfcd; padding: 6px 8px; }
  .itt-table thead th { background: #f3ecea; font-weight: 700; text-transform: uppercase; font-size: 11px; text-align: left; }
  .itt-table tbody tr:nth-child(even) td { background: #fbf8f7; }
  .itt-name { font-weight: 600; text-transform: uppercase; white-space: nowrap; }
  .itt-table th.itt-num, .itt-num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
  td.itt-flavors { font-size: 11px; color: #5b5150; }
  .itt-check { width: 22mm; }

  #itt-print-root { display: none; }
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body.itt-printing > *:not(#itt-print-root) { display: none !important; }
    body.itt-printing { background: #fff !important; min-height: 0 !important; }
    body.itt-printing #itt-print-root { display: block; font-family: 'Work Sans', Arial, sans-serif; }
    #itt-print-root h1 { font-size: 16px; margin: 0 0 2px; }
    #itt-print-root .itt-sub { font-size: 11px; margin: 0 0 10px; color: #444; }
    #itt-print-root .itt-table { font-size: 12px; }
    #itt-print-root .itt-table th, #itt-print-root .itt-table td { padding: 5px 6px; border-color: #999; }
    #itt-print-root .itt-table thead { display: table-header-group; }
    #itt-print-root .itt-table tr { break-inside: avoid; }
    #itt-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function ensureStyles() {
  if (document.getElementById('itt-styles')) return;
  const style = document.createElement('style');
  style.id = 'itt-styles';
  style.textContent = TOTALS_STYLES;
  document.head.appendChild(style);
}

const summaryText = t =>
  `${t.orderCount} OP${t.orderCount === 1 ? '' : 's'} · ${t.portionCount} porç${t.portionCount === 1 ? 'ão' : 'ões'} · ${t.rows.length} insumo${t.rows.length === 1 ? '' : 's'}`;

function printTotals(title, subtitle, totals) {
  document.getElementById('itt-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'itt-print-root';
  root.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p class="itt-sub">${escapeHtml(subtitle)} · ${escapeHtml(summaryText(totals))} · Impresso em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
    ${totalsTableHtml(totals, { forPrint: true })}
  `;
  document.body.appendChild(root);
  document.body.classList.add('itt-printing');

  const cleanup = () => {
    document.body.classList.remove('itt-printing');
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/**
 * Abre o total de insumos das porções informadas.
 * @param {Array} portions porções já filtradas (OP, dia ou período)
 * @param {string} subtitle De onde vêm os dados, aparece também na impressão
 */
export function openIngredientTotals(portions, subtitle) {
  ensureStyles();
  document.getElementById('itt-modal')?.remove();

  const title = 'Total de Insumos por Sabor (somado)';
  const totals = buildIngredientTotals(portions);
  const empty = totals.rows.length === 0;

  const modal = document.createElement('div');
  modal.id = 'itt-modal';
  modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-space-md';
  modal.innerHTML = `
    <div class="bg-surface-card rounded-2xl shadow-xl border border-border-subtle max-w-3xl w-full max-h-[90vh] flex flex-col p-4 sm:p-space-lg gap-space-md overflow-hidden">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-bordeaux-primary text-[26px]">summarize</span>
          <div class="flex flex-col min-w-0">
            <h2 class="font-headline-sm text-headline-sm text-ink-text font-bold">${title}</h2>
            <p class="text-xs text-text-muted">${escapeHtml(subtitle)} · ${escapeHtml(summaryText(totals))}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="itt-print-btn" ${empty ? 'disabled' : ''} class="min-h-[40px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="material-symbols-outlined text-[20px]">print</span> Imprimir
          </button>
          <button id="itt-close-btn" aria-label="Fechar" class="p-1 rounded-lg hover:bg-surface-canvas text-text-muted hover:text-ink-text transition-colors">
            <span class="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
      </div>
      <p class="text-xs text-text-muted">Soma dos insumos de sabor de todos os kits por porção do filtro. A massa-base (carne + tempero base) fica na aba Bateladas de Massa-Base.</p>
      <div class="overflow-auto flex-1">
        ${empty
          ? '<div class="p-6 text-center text-text-muted text-sm">Nenhum insumo de sabor nas porções do filtro. Os kits aparecem depois de gerar as Ordens de Produção no Planejamento.</div>'
          : totalsTableHtml(totals)}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#itt-close-btn').addEventListener('click', close);
  modal.querySelector('#itt-print-btn').addEventListener('click', () => printTotals(title, subtitle, totals));
}
