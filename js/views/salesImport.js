// Leitura do relatório "REL MAPA DE VENDAS POR CLIENTE" (xls/xlsx/csv) já convertido em
// linhas (array de arrays). Sem dependência do navegador, para poder ser testado à parte.
//
// Formato do relatório:
//   TIPO VENDAS:  VAREJO
//   293 -  ESPACO CORONEL          <- cliente
//   Venda | Data | Hora | ID | Produto | | Qtde | Total   <- cabeçalho
//   455024 | 24/04/2025 | 14:34:33 | 21 | LING DA ROCA | | 3.67 | 150.49
//   | | | | | | 21.5 | 899.19      <- subtotal do cliente (ignorado)

function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  // "1.234,56" (pt-BR) ou "1234.56"
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return isNaN(n) ? 0 : n;
}

function pad(n) { return String(n).padStart(2, '0'); }

function toIsoDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // número de série do Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
}

function toTime(v) {
  if (v instanceof Date && !isNaN(v)) return `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const secs = Math.round(v * 86400);
    return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${pad(m[1])}:${m[2]}:${m[3] || '00'}` : null;
}

function cleanCode(v) {
  const s = String(v ?? '').trim();
  return /^\d+(\.0+)?$/.test(s) ? String(parseInt(s, 10)) : s;
}

export function parseSalesRows(rows) {
  const records = [];
  const seq = new Map(); // venda -> próximo item
  let saleType = '';
  let customer = '';
  let period = '';

  for (const raw of rows) {
    const v = (raw || []).map(c => (c instanceof Date ? c : (c ?? '')));
    const a = String(v[0] ?? '').trim();
    if (!period && /^Per[ií]odo/i.test(a)) { period = a; continue; }
    if (/^TIPO VENDAS/i.test(a)) { saleType = a.split(':').slice(1).join(':').trim(); continue; }
    if (/^Venda$/i.test(a)) continue;

    const date = toIsoDate(v[1]);
    if (/^\d+(\.0+)?$/.test(a) && date) {
      const saleNumber = cleanCode(a);
      const key = `${saleType}|${saleNumber}`;
      const itemSeq = (seq.get(key) || 0) + 1;
      seq.set(key, itemSeq);
      const productCode = cleanCode(v[3]);
      const productName = String(v[4] ?? '').trim().replace(/^-\s*/, '');
      if (!productCode && !productName) continue;
      records.push({
        sale_type: saleType,
        customer,
        sale_number: saleNumber,
        item_seq: itemSeq,
        sale_date: date,
        sale_time: toTime(v[2]),
        product_code: productCode || productName,
        product_name: productName || productCode,
        qty: Math.round(toNumber(v[6]) * 1000) / 1000,
        total: Math.round(toNumber(v[7]) * 100) / 100
      });
      continue;
    }
    // "123 - NOME DO CLIENTE" (linha só com o cliente)
    if (/^\d+\s*-/.test(a) && v.slice(1).every(c => String(c ?? '').trim() === '')) {
      customer = a.replace(/\s+/g, ' ');
    }
  }

  const dates = records.map(r => r.sale_date).sort();
  return {
    records,
    period,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    types: [...new Set(records.map(r => r.sale_type))]
  };
}

// Mapa de estoque (Inflow ou outro): procura a linha de cabeçalho com uma coluna de código,
// uma de nome e uma de quantidade, e devolve [{ code, name, qty }].
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function parseStockRows(rows) {
  for (let h = 0; h < Math.min(rows.length, 40); h++) {
    const head = (rows[h] || []).map(norm);
    const find = re => head.findIndex(c => re.test(c));
    // No Inflow, "ID" é o mesmo código do relatório de vendas ("Codigo" é outro número)
    let codeCol = head.indexOf('id');
    if (codeCol < 0) codeCol = find(/^(cod|codigo|sku|referencia|ref)\b|codigo/);
    const nameCol = find(/produto|descri|nome|item/);
    let qtyCol = find(/estoque|saldo|disponivel|quant|qtd|qtde/);
    if (qtyCol === codeCol || qtyCol === nameCol) qtyCol = -1;
    if (codeCol < 0 || qtyCol < 0) continue;
    const items = [];
    for (const r of rows.slice(h + 1)) {
      const code = String(r?.[codeCol] ?? '').trim().replace(/\.0+$/, '');
      if (!code) continue;
      const rawQty = r[qtyCol];
      if (String(rawQty ?? '').trim() === '') continue;
      const qty = toNumber(rawQty);
      items.push({ code, name: nameCol >= 0 ? String(r[nameCol] ?? '').trim() : '', qty: Math.max(0, Math.round(qty * 1000) / 1000) });
    }
    return { items, header: rows[h], codeCol, nameCol, qtyCol };
  }
  return { items: [], header: null };
}
