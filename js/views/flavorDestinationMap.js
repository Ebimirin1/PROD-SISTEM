// Mapa Sabor × Destino: visão geral de todos os sabores das OPs e para onde cada um vai,
// no mesmo formato da aba "PEDIDO ATAC" da planilha (sabores nas linhas, destinos nas colunas,
// kg em cada célula, total por sabor e por destino). Tem layout próprio para impressão.

const FIXED_DESTINATIONS = [
  { key: 'emporio', label: 'Empório' },
  { key: 'lanchonete', label: 'Lanchonete' },
  { key: 'outro', label: 'Outro' }
];

const PRODUCT_TYPE_LABELS = {
  manta: 'Manta',
  massa: 'Massa',
  granel: 'Granel',
  hamburguer: 'Hambúrguer'
};

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Trabalha em gramas inteiras para as somas fecharem sem erro de ponto flutuante
const toG = v => Math.round(Number(v || 0) * 1000);
const kgText = g => g ? (g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '';

/**
 * Monta a matriz a partir das demandas das OPs.
 * Linha = sabor + tipo de produto (linguiça fica só com o nome do sabor).
 * Coluna = destino (Empório, Lanchonete, Outro ou o cliente do Atacado) + conservação
 * (o congelado vira coluna própria, como a marcação "CONGELADO" da planilha).
 */
export function buildFlavorDestinationMatrix(ops) {
  const columns = new Map();
  const rows = new Map();

  (ops || []).forEach(op => {
    (op.production_demands || []).forEach(d => {
      const frozen = d.requested_conservation === 'congelado';
      const fixed = FIXED_DESTINATIONS.find(f => f.key === d.destination_key);
      const destLabel = d.destination_key === 'atacado'
        ? (d.partners?.name || 'Atacado')
        : (fixed?.label || d.destination_key);
      const colKey = `${d.destination_key}|${d.destination_partner_id || ''}|${frozen ? 'c' : 'r'}`;
      if (!columns.has(colKey)) {
        columns.set(colKey, {
          key: colKey,
          label: destLabel,
          frozen,
          order: d.destination_key === 'atacado' ? FIXED_DESTINATIONS.length : FIXED_DESTINATIONS.indexOf(fixed),
          totalG: 0
        });
      }

      const flavorName = d.flavors?.name || 'Sabor não identificado';
      const typeLabel = PRODUCT_TYPE_LABELS[d.requested_product_type];
      const rowLabel = typeLabel ? `${flavorName} (${typeLabel})` : flavorName;
      if (!rows.has(rowLabel)) rows.set(rowLabel, { label: rowLabel, cells: {}, totalG: 0 });

      const g = toG(d.planned_kg);
      const row = rows.get(rowLabel);
      row.cells[colKey] = (row.cells[colKey] || 0) + g;
      row.totalG += g;
      columns.get(colKey).totalG += g;
    });
  });

  const cmp = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  const sortedColumns = [...columns.values()].sort((a, b) =>
    a.order - b.order || cmp(a.label, b.label) || Number(a.frozen) - Number(b.frozen));
  const sortedRows = [...rows.values()].sort((a, b) => cmp(a.label, b.label));
  const totalG = sortedRows.reduce((s, r) => s + r.totalG, 0);

  return { columns: sortedColumns, rows: sortedRows, totalG };
}

function matrixTableHtml({ columns, rows, totalG }) {
  return `
    <table class="fdm-table">
      <thead>
        <tr>
          <th class="fdm-flavor">Sabor</th>
          <th class="fdm-num fdm-total">Total (kg)</th>
          ${columns.map(c => `
            <th class="fdm-num">
              ${c.frozen ? '<span class="fdm-frozen">Congelado</span>' : ''}
              ${escapeHtml(c.label)}
            </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="fdm-flavor">${escapeHtml(r.label)}</td>
            <td class="fdm-num fdm-total">${kgText(r.totalG)}</td>
            ${columns.map(c => `<td class="fdm-num">${kgText(r.cells[c.key])}</td>`).join('')}
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td class="fdm-flavor">Total</td>
          <td class="fdm-num fdm-total">${kgText(totalG)}</td>
          ${columns.map(c => `<td class="fdm-num">${kgText(c.totalG)}</td>`).join('')}
        </tr>
      </tfoot>
    </table>
  `;
}

// Estilos da tabela (tela e impressão). Ficam aqui para a tela não depender do Tailwind.
const MATRIX_STYLES = `
  .fdm-table { border-collapse: collapse; width: 100%; font-size: 12px; color: #1f1a1a; }
  .fdm-table th, .fdm-table td { border: 1px solid #d9cfcd; padding: 4px 6px; white-space: nowrap; }
  .fdm-table thead th { background: #f3ecea; font-weight: 700; text-transform: uppercase; font-size: 11px; vertical-align: bottom; }
  .fdm-table tbody tr:nth-child(even) td { background: #fbf8f7; }
  .fdm-table tfoot td { font-weight: 700; background: #f3ecea; }
  .fdm-flavor { text-align: left; font-weight: 600; text-transform: uppercase; }
  .fdm-num { text-align: right; font-variant-numeric: tabular-nums; }
  .fdm-total { font-weight: 700; background: #fff0ee; }
  .fdm-frozen { display: block; font-size: 9px; color: #1d4e89; letter-spacing: 0.04em; }

  #fdm-print-root { display: none; }
  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    body.fdm-printing > *:not(#fdm-print-root) { display: none !important; }
    body.fdm-printing { background: #fff !important; min-height: 0 !important; }
    body.fdm-printing #fdm-print-root { display: block; font-family: 'Work Sans', Arial, sans-serif; }
    #fdm-print-root h1 { font-size: 16px; margin: 0 0 2px; }
    #fdm-print-root .fdm-sub { font-size: 11px; margin: 0 0 8px; color: #444; }
    #fdm-print-root .fdm-table { font-size: 10px; }
    #fdm-print-root .fdm-table th, #fdm-print-root .fdm-table td { padding: 2px 4px; border-color: #999; }
    #fdm-print-root .fdm-table thead { display: table-header-group; }
    #fdm-print-root .fdm-table tr { break-inside: avoid; }
    #fdm-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function ensureStyles() {
  if (document.getElementById('fdm-styles')) return;
  const style = document.createElement('style');
  style.id = 'fdm-styles';
  style.textContent = MATRIX_STYLES;
  document.head.appendChild(style);
}

function printMatrix(title, subtitle, matrix) {
  document.getElementById('fdm-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'fdm-print-root';
  root.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p class="fdm-sub">${escapeHtml(subtitle)} · Impresso em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
    ${matrixTableHtml(matrix)}
  `;
  document.body.appendChild(root);
  document.body.classList.add('fdm-printing');

  const cleanup = () => {
    document.body.classList.remove('fdm-printing');
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/**
 * Abre o mapa Sabor × Destino das OPs informadas.
 * @param {Array} ops OPs com production_demands (flavors, partners)
 * @param {string} subtitle De onde vêm os dados (OP, dia ou período), aparece também na impressão
 */
export function openFlavorDestinationMap(ops, subtitle) {
  ensureStyles();
  document.getElementById('fdm-modal')?.remove();

  const title = 'Pedido por Sabor × Destino';
  const matrix = buildFlavorDestinationMatrix(ops);
  const empty = matrix.rows.length === 0;

  const modal = document.createElement('div');
  modal.id = 'fdm-modal';
  modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-space-md';
  modal.innerHTML = `
    <div class="bg-surface-card rounded-2xl shadow-xl border border-border-subtle max-w-6xl w-full max-h-[90vh] flex flex-col p-4 sm:p-space-lg gap-space-md overflow-hidden">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-bordeaux-primary text-[26px]">table_view</span>
          <div class="flex flex-col min-w-0">
            <h2 class="font-headline-sm text-headline-sm text-ink-text font-bold">${title}</h2>
            <p class="text-xs text-text-muted">${escapeHtml(subtitle)} · Total ${kgText(matrix.totalG) || '0'} kg</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="fdm-print-btn" ${empty ? 'disabled' : ''} class="min-h-[40px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="material-symbols-outlined text-[20px]">print</span> Imprimir
          </button>
          <button id="fdm-close-btn" aria-label="Fechar" class="p-1 rounded-lg hover:bg-surface-canvas text-text-muted hover:text-ink-text transition-colors">
            <span class="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
      </div>
      <div class="overflow-auto flex-1">
        ${empty
          ? '<div class="p-6 text-center text-text-muted text-sm">Nenhuma demanda lançada nas OPs selecionadas. Adicione linhas de demanda nas OPs para ver o mapa.</div>'
          : matrixTableHtml(matrix)}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#fdm-close-btn').addEventListener('click', close);
  modal.querySelector('#fdm-print-btn').addEventListener('click', () => printMatrix(title, subtitle, matrix));
}
