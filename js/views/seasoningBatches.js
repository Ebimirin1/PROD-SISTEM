// Bateladas da mexedeira: todas as linguiças usam a mesma massa-base (carne + tempero base),
// batida em bateladas de no máximo 150 kg (podem ser menores). Os insumos de cada sabor
// entram depois, na separação por porção — não fazem parte da batelada.

export const MIXER_MAX_KG = 150;

// Massa-base única das linguiças, por batelada de 150 kg (planilha da produção).
// Não depende de cadastro: vale para todo sabor, exceto hambúrguer.
export const BASE_RECIPE_KG = 150;
export const BASE_MEAT_CUTS = ['Copa Lombo', 'Pernil']; // partes iguais
export const BASE_SEASONINGS = [
  { name: 'Água', kg: 1.500 },
  { name: 'Condimento Linguiça Toscana (0538)', kg: 1.135 },
  { name: 'Curamax (F) (199)', kg: 0.158 },
  { name: 'Fixamax (0695)', kg: 0.907 },
  { name: 'Fosmax (204)', kg: 0.295 },
  { name: 'Alho em Pasta (3175)', kg: 0.681 },
  { name: 'Shelfmax (4425)', kg: 2.838 },
  { name: 'Sal', kg: 0.386 },
  { name: 'Noz Moscada', kg: 0.182 },
  { name: 'Orégano', kg: 0.068 },
  { name: 'Corante Carmim', kg: 0.017 }
];

// Tipos de produto que saem da massa-base de linguiça
export const usesLinguicaBase = productType => productType !== 'hamburguer';

// Trabalha em gramas inteiras para as somas fecharem sem erro de ponto flutuante
const toG = v => Math.round(Number(v) * 1000);
const fromG = g => g / 1000;

// Divide o total no menor número de bateladas de até 150 kg, com pesos iguais
// (320 kg viram 106,667 + 106,667 + 106,666 em vez de 150 + 150 + 20).
export function splitBatches(totalKg, maxKg = MIXER_MAX_KG) {
  const totalG = toG(totalKg);
  if (totalG <= 0) return [];
  const count = Math.ceil(totalG / toG(maxKg));
  const base = Math.floor(totalG / count);
  const extra = totalG - base * count;
  return Array.from({ length: count }, (_, i) => fromG(base + (i < extra ? 1 : 0)));
}

// Composição de uma batelada: temperos na proporção da planilha; a carne completa o peso
export function batchComposition(batchKg) {
  const sizeG = toG(batchKg);
  const seasonings = BASE_SEASONINGS.map(s => ({
    name: s.name,
    kg: fromG(Math.round(toG(s.kg) * sizeG / toG(BASE_RECIPE_KG)))
  }));
  const seasoningG = seasonings.reduce((sum, s) => sum + toG(s.kg), 0);
  const meatG = Math.max(0, sizeG - seasoningG);
  const perCut = Math.floor(meatG / BASE_MEAT_CUTS.length);
  const meat = BASE_MEAT_CUTS.map((name, i) => ({
    name,
    kg: fromG(perCut + (i === 0 ? meatG - perCut * BASE_MEAT_CUTS.length : 0))
  }));
  return { totalKg: fromG(sizeG), meatKg: fromG(meatG), seasoningKg: fromG(seasoningG), meat, seasonings };
}

// portions: production_portions com flavors e production_orders.
// Retorna uma entrada por OP com o total de massa-base (todas as linguiças juntas) e as bateladas.
export function buildBaseBatches(portions, maxKg = MIXER_MAX_KG) {
  const orders = new Map();

  (portions || []).forEach(p => {
    if (!usesLinguicaBase(p.product_type)) return;
    const key = p.production_order_id;
    if (!orders.has(key)) orders.set(key, { key, order: p.production_orders || null, totalG: 0, flavors: new Map() });
    const o = orders.get(key);
    const g = toG(p.planned_kg);
    o.totalG += g;
    const name = p.flavors?.name || 'Sabor não identificado';
    o.flavors.set(name, (o.flavors.get(name) || 0) + g);
  });

  return [...orders.values()].map(o => ({
    key: o.key,
    order: o.order,
    totalKg: fromG(o.totalG),
    flavors: [...o.flavors.entries()].map(([name, g]) => ({ name, kg: fromG(g) })).sort((a, b) => b.kg - a.kg || a.name.localeCompare(b.name)),
    batches: splitBatches(fromG(o.totalG), maxKg).map((kg, i) => ({ batchNo: i + 1, ...batchComposition(kg) }))
  })).sort((a, b) =>
    String(b.order?.production_date || '').localeCompare(String(a.order?.production_date || '')) ||
    String(a.order?.order_code || '').localeCompare(String(b.order?.order_code || '')));
}
