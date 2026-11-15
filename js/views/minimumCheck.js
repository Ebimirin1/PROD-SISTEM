// Verificação do pedido mínimo ao gerar as ordens de uma OP.
// O mínimo vale por produto (sabor + tipo), somando todos os clientes e conservações da OP.
// Produto abaixo do mínimo não é produzido: sai do estoque da loja (lote anterior).
// Ao gerar: a tela mostra a lista por cliente (com Imprimir) e pergunta se gera o resto.
// Depois: o botão "Tirar da loja" da OP reabre a lista (openStoreList), sem precisar gravar nada:
// numa OP gerada, são as demandas cujo produto não virou porção.
import { supabase } from '../supabaseClient.js';
import { formatWeight } from '../utils.js';

export const MIN_PORTION_KG = 15;

const TYPE_LABELS = { linguica: 'Linguiça', massa: 'Massa', manta: 'Manta', granel: 'Granel', hamburguer: 'Hambúrguer' };
const CONS_LABELS = { congelado: 'Congelado', resfriado: 'Resfriado', sem: 'Sem conservação' };
const DEST_LABELS = { emporio: 'Empório', lanchonete: 'Lanchonete', atacado: 'Atacado' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toG = kg => Math.round(Number(kg || 0) * 1000);

const productKey = d => `${d.flavor_id}|${d.requested_product_type || ''}`;

function productTotals(demands) {
  const totals = {};
  demands.forEach(d => { totals[productKey(d)] = (totals[productKey(d)] || 0) + toG(d.planned_kg); });
  return totals;
}

// Tabela (uma linha por cliente + sabor + tipo + conservação) das demandas que saem da loja
async function buildStoreTable(lines, totals) {
  const flavorIds = [...new Set(lines.map(d => d.flavor_id))];
  const partnerIds = [...new Set(lines.map(d => d.destination_partner_id).filter(Boolean))];
  const [{ data: flavors }, { data: partners }] = await Promise.all([
    supabase.from('flavors').select('id, name').in('id', flavorIds),
    partnerIds.length ? supabase.from('partners').select('id, name').in('id', partnerIds) : Promise.resolve({ data: [] })
  ]);
  const flavorName = Object.fromEntries((flavors || []).map(f => [f.id, f.name]));
  const partnerName = Object.fromEntries((partners || []).map(p => [p.id, p.name]));
  const clientLabel = l => {
    if (l.destination_partner_id && partnerName[l.destination_partner_id]) return partnerName[l.destination_partner_id];
    const base = DEST_LABELS[l.destination_key] || String(l.destination_key || '').toUpperCase() || '—';
    if (l.destination_partner_id) return `${base} (cliente não encontrado)`;
    return l.destination_key === 'atacado' ? 'Atacado (sem cliente informado)' : base;
  };

  const byRow = {};
  lines.forEach(l => {
    const cliente = clientLabel(l);
    const k = `${cliente}|${productKey(l)}|${l.requested_conservation || ''}`;
    (byRow[k] ||= {
      cliente,
      sabor: flavorName[l.flavor_id] || 'Sabor sem nome',
      tipo: TYPE_LABELS[l.requested_product_type] || l.requested_product_type || '—',
      cons: CONS_LABELS[l.requested_conservation] || l.requested_conservation || '—',
      g: 0,
      totalProdutoKg: (totals[productKey(l)] || 0) / 1000
    }).g += toG(l.planned_kg);
  });
  const rows = Object.values(byRow).map(r => ({ ...r, kg: r.g / 1000 }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR') || a.sabor.localeCompare(b.sabor, 'pt-BR') || a.tipo.localeCompare(b.tipo, 'pt-BR'));
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  const nClientes = new Set(rows.map(r => r.cliente)).size;

  return `
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b-2 border-black/20 text-left">
          <th class="py-2 px-2">Cliente</th><th class="py-2 px-2">Sabor</th><th class="py-2 px-2">Tipo</th>
          <th class="py-2 px-2">Conservação</th><th class="py-2 px-2 text-right">Pedido do cliente</th>
          <th class="py-2 px-2 text-right">Total do produto na OP</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="border-b border-black/10">
            <td class="py-2 px-2 font-bold">${esc(r.cliente)}</td><td class="py-2 px-2">${esc(r.sabor)}</td>
            <td class="py-2 px-2">${esc(r.tipo)}</td><td class="py-2 px-2">${esc(r.cons)}</td>
            <td class="py-2 px-2 text-right font-bold">${formatWeight(r.kg)}</td>
            <td class="py-2 px-2 text-right">${formatWeight(r.totalProdutoKg)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="4" class="py-2 px-2 font-bold">Total para tirar da loja (${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}, ${nClientes} ${nClientes === 1 ? 'cliente' : 'clientes'})</td>
        <td class="py-2 px-2 text-right font-bold">${formatWeight(totalKg)}</td><td></td></tr></tfoot>
    </table>`;
}

function printTable(tableHtml, opLabel) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tirar da loja</title>
    <style>body{font-family:Ubuntu,Arial,sans-serif;margin:16mm}h1{font-size:18px;color:#380000}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:6px;text-align:left}
    tbody td:nth-child(n+5),th:nth-child(n+5),tfoot td:nth-child(2){text-align:right}tfoot td{font-weight:bold}</style></head><body>
    <h1>Itens para tirar da loja (abaixo de ${MIN_PORTION_KG} kg)${opLabel ? ' — OP ' + esc(opLabel) : ''}</h1>
    <p>Não serão produzidos nesta OP. Avisar cada cliente que o item será retirado da loja, com o lote anterior.</p>
    <p>${new Date().toLocaleString('pt-BR')}</p>${tableHtml}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// Janela com a lista. buttons: [{ acao, label, primary }]; devolve a ação clicada.
function showStoreModal({ intro, tableHtml, opLabel, buttons }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 flex items-center justify-center p-4';
    overlay.style.cssText = 'z-index:9999;background:rgba(0,0,0,.5)';
    overlay.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b">
          <h2 class="text-lg font-bold" style="color:#380000">Tirar da loja — itens abaixo de ${MIN_PORTION_KG} kg${opLabel ? ' · OP ' + esc(opLabel) : ''}</h2>
          <p class="text-sm mt-1">${intro}</p>
        </div>
        <div class="p-4 overflow-auto">${tableHtml}</div>
        <div class="p-4 border-t flex flex-wrap gap-2 justify-end">
          ${tableHtml ? '<button data-acao="imprimir" class="px-4 py-2 rounded border font-bold">Imprimir lista</button>' : ''}
          ${buttons.map(b => `<button data-acao="${b.acao}" class="px-4 py-2 rounded font-bold ${b.primary ? 'text-white' : 'border'}" ${b.primary ? 'style="background:#380000"' : ''}>${b.label}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      const acao = e.target.closest('button')?.dataset.acao;
      if (!acao) { if (e.target === overlay) { overlay.remove(); resolve('fechar'); } return; }
      if (acao === 'imprimir') { printTable(tableHtml, opLabel); return; }
      overlay.remove();
      resolve(acao);
    });
  });
}

/**
 * Ao gerar ordens. Recebe as demandas da OP e devolve as que seguem para produção,
 * ou null se o usuário cancelar. Sem itens abaixo do mínimo, devolve tudo sem perguntar.
 */
export async function checkMinimumKg(demands, opLabel = '') {
  const totals = productTotals(demands);
  const smallKeys = new Set(Object.keys(totals).filter(k => totals[k] < MIN_PORTION_KG * 1000));
  if (smallKeys.size === 0) return demands;
  const smallLines = demands.filter(d => smallKeys.has(productKey(d)));
  const keep = demands.filter(d => !smallKeys.has(productKey(d)));

  const tableHtml = await buildStoreTable(smallLines, totals);
  const acao = await showStoreModal({
    intro: `Estes produtos não chegaram a ${MIN_PORTION_KG} kg na OP e não serão produzidos. Avise cada cliente que o item será retirado da loja, com o lote anterior. A lista fica guardada: depois é só clicar em "Tirar da loja" na OP.`
      + (keep.length === 0 ? '<br><b>Todos os itens da OP estão abaixo do mínimo: não há nada para gerar.</b>' : ''),
    tableHtml, opLabel,
    buttons: [{ acao: 'cancelar', label: 'Cancelar' }].concat(keep.length > 0 ? [{ acao: 'gerar', label: 'Gerar sem esses itens', primary: true }] : [])
  });
  return acao === 'gerar' ? keep : null;
}

/**
 * Botão "Tirar da loja" da OP, a qualquer momento.
 * OP gerada: demandas cujo produto (sabor + tipo) não virou porção.
 * OP não gerada: prévia pela regra do mínimo.
 */
export async function openStoreList(opId, opLabel = '') {
  const [{ data: op, error: oErr }, { data: demands, error: dErr }] = await Promise.all([
    supabase.from('production_orders').select('generated_at').eq('id', opId).single(),
    supabase.from('production_demands')
      .select('flavor_id, planned_kg, destination_key, destination_partner_id, requested_product_type, requested_conservation')
      .eq('production_order_id', opId)
  ]);
  if (oErr || dErr) { alertError((oErr || dErr).message); return; }
  const totals = productTotals(demands || []);

  let lines, intro;
  if (op?.generated_at) {
    const { data: portions, error: pErr } = await supabase
      .from('production_portions').select('flavor_id, product_type').eq('production_order_id', opId);
    if (pErr) { alertError(pErr.message); return; }
    const produced = new Set((portions || []).map(p => `${p.flavor_id}|${p.product_type || ''}`));
    lines = (demands || []).filter(d => !produced.has(productKey(d)));
    intro = 'Ordens já geradas. Estes itens ficaram fora da produção: avise cada cliente que o item será retirado da loja, com o lote anterior.';
  } else {
    lines = (demands || []).filter(d => totals[productKey(d)] < MIN_PORTION_KG * 1000);
    intro = `Prévia: a OP ainda não foi gerada. Se nada mudar, estes produtos ficam abaixo de ${MIN_PORTION_KG} kg e sairão da loja.`;
  }

  if (lines.length === 0) {
    await showStoreModal({ intro: op?.generated_at ? 'Nenhum item desta OP ficou fora da produção.' : `Nenhum produto desta OP está abaixo de ${MIN_PORTION_KG} kg.`, tableHtml: '', opLabel, buttons: [{ acao: 'fechar', label: 'Fechar', primary: true }] });
    return;
  }
  const tableHtml = await buildStoreTable(lines, totals);
  await showStoreModal({ intro, tableHtml, opLabel, buttons: [{ acao: 'fechar', label: 'Fechar', primary: true }] });
}

function alertError(msg) {
  showStoreModal({ intro: `Erro ao carregar a lista: ${esc(msg)}`, tableHtml: '', opLabel: '', buttons: [{ acao: 'fechar', label: 'Fechar', primary: true }] });
}
