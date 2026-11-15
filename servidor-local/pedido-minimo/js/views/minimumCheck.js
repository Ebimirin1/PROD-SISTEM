// Verificação do pedido mínimo ao gerar as ordens de uma OP.
// Cada porção é sabor + tipo + conservação (+ versão da receita), somando todos os destinos.
// Porção abaixo do mínimo não é produzida: o item sai do estoque da loja.
// A tela mostra a lista (com Imprimir) e pergunta se gera o resto.
import { supabase } from '../supabaseClient.js';
import { formatWeight } from '../utils.js';

export const MIN_PORTION_KG = 15;

const TYPE_LABELS = { linguica: 'Linguiça', massa: 'Massa', manta: 'Manta', granel: 'Granel', hamburguer: 'Hambúrguer' };
const CONS_LABELS = { congelado: 'Congelado', resfriado: 'Resfriado', sem: 'Sem conservação' };
const DEST_LABELS = { emporio: 'Empório', lanchonete: 'Lanchonete', atacado: 'Atacado' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toG = kg => Math.round(Number(kg || 0) * 1000);

/**
 * Recebe as demandas da OP. Devolve as demandas que seguem para produção,
 * ou null se o usuário cancelar. Sem itens abaixo do mínimo, devolve tudo sem perguntar.
 */
export async function checkMinimumKg(demands, opLabel = '') {
  const minG = MIN_PORTION_KG * 1000;
  const groups = {};
  demands.forEach(d => {
    const key = `${d.flavor_id}|${d.requested_product_type || ''}|${d.requested_conservation || ''}|${d.formula_version_id}`;
    (groups[key] ||= { key, flavorId: d.flavor_id, type: d.requested_product_type, cons: d.requested_conservation, totalG: 0, lines: [] });
    groups[key].totalG += toG(d.planned_kg);
    groups[key].lines.push(d);
  });
  const small = Object.values(groups).filter(g => g.totalG < minG);
  if (small.length === 0) return demands;

  // Nomes de sabor e parceiro para a lista
  const flavorIds = [...new Set(small.map(g => g.flavorId))];
  const partnerIds = [...new Set(small.flatMap(g => g.lines.map(l => l.destination_partner_id)).filter(Boolean))];
  const [{ data: flavors }, { data: partners }] = await Promise.all([
    supabase.from('flavors').select('id, name').in('id', flavorIds),
    partnerIds.length ? supabase.from('partners').select('id, name').in('id', partnerIds) : Promise.resolve({ data: [] })
  ]);
  const flavorName = Object.fromEntries((flavors || []).map(f => [f.id, f.name]));
  const partnerName = Object.fromEntries((partners || []).map(p => [p.id, p.name]));
  const destLabel = l => {
    const base = DEST_LABELS[l.destination_key] || String(l.destination_key || '').toUpperCase() || '—';
    return l.destination_partner_id && partnerName[l.destination_partner_id] ? `${base} (${partnerName[l.destination_partner_id]})` : base;
  };

  const rows = small.map(g => {
    const destKg = {};
    g.lines.forEach(l => { const k = destLabel(l); destKg[k] = (destKg[k] || 0) + toG(l.planned_kg); });
    const destinos = Object.entries(destKg).map(([k, gr]) => Object.keys(destKg).length > 1 ? `${k}: ${formatWeight(gr / 1000)}` : k).join('<br>');
    return {
      sabor: flavorName[g.flavorId] || 'Sabor sem nome',
      tipo: TYPE_LABELS[g.type] || g.type || '—',
      cons: CONS_LABELS[g.cons] || g.cons || '—',
      destinos,
      kg: g.totalG / 1000
    };
  }).sort((a, b) => a.sabor.localeCompare(b.sabor, 'pt-BR') || a.tipo.localeCompare(b.tipo, 'pt-BR'));

  const smallKeys = new Set(small.map(g => g.key));
  const keep = demands.filter(d => !smallKeys.has(`${d.flavor_id}|${d.requested_product_type || ''}|${d.requested_conservation || ''}|${d.formula_version_id}`));
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);

  const tableHtml = `
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b-2 border-black/20 text-left">
          <th class="py-2 px-2">Sabor</th><th class="py-2 px-2">Tipo</th><th class="py-2 px-2">Conservação</th>
          <th class="py-2 px-2">Destino</th><th class="py-2 px-2 text-right">Pedido</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="border-b border-black/10">
            <td class="py-2 px-2 font-bold">${esc(r.sabor)}</td><td class="py-2 px-2">${esc(r.tipo)}</td>
            <td class="py-2 px-2">${esc(r.cons)}</td><td class="py-2 px-2">${r.destinos}</td>
            <td class="py-2 px-2 text-right font-bold">${formatWeight(r.kg)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="4" class="py-2 px-2 font-bold">Total para tirar da loja (${rows.length} ${rows.length === 1 ? 'item' : 'itens'})</td>
        <td class="py-2 px-2 text-right font-bold">${formatWeight(totalKg)}</td></tr></tfoot>
    </table>`;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 flex items-center justify-center p-4';
    overlay.style.cssText = 'z-index:9999;background:rgba(0,0,0,.5)';
    overlay.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b">
          <h2 class="text-lg font-bold" style="color:#380000">Itens abaixo do mínimo de ${MIN_PORTION_KG} kg — tirar da loja</h2>
          <p class="text-sm mt-1">Estes itens não serão produzidos nesta OP${opLabel ? ' (' + esc(opLabel) + ')' : ''}. Separe-os do estoque da loja.
          ${keep.length === 0 ? '<br><b>Todos os itens da OP estão abaixo do mínimo: não há nada para gerar.</b>' : ''}</p>
        </div>
        <div class="p-4 overflow-auto">${tableHtml}</div>
        <div class="p-4 border-t flex flex-wrap gap-2 justify-end">
          <button data-acao="imprimir" class="px-4 py-2 rounded border font-bold">Imprimir lista</button>
          <button data-acao="cancelar" class="px-4 py-2 rounded border font-bold">Cancelar</button>
          ${keep.length > 0 ? `<button data-acao="gerar" class="px-4 py-2 rounded font-bold text-white" style="background:#380000">Gerar sem esses itens</button>` : ''}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      const acao = e.target.closest('button')?.dataset.acao;
      if (acao === 'imprimir') {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tirar da loja</title>
          <style>body{font-family:Ubuntu,Arial,sans-serif;margin:16mm}h1{font-size:18px;color:#380000}
          table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:6px;text-align:left}
          td:last-child,th:last-child{text-align:right}tfoot td{font-weight:bold}</style></head><body>
          <h1>Itens para tirar da loja (abaixo de ${MIN_PORTION_KG} kg)${opLabel ? ' — OP ' + esc(opLabel) : ''}</h1>
          <p>${new Date().toLocaleString('pt-BR')}</p>${tableHtml}</body></html>`);
        w.document.close();
        w.focus();
        w.print();
        return;
      }
      if (acao === 'cancelar') { overlay.remove(); resolve(null); }
      if (acao === 'gerar') { overlay.remove(); resolve(keep); }
    });
  });
}
