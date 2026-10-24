// Temperos por batelada da mexedeira: a massa de cada sabor (carne + tempero) é batida
// em bateladas de no máximo 150 kg (podem ser menores). Cada batelada recebe os temperos na mesma proporção
// das linhas de insumo geradas para as porções daquele sabor na OP.

export const MIXER_MAX_KG = 150;

// Trabalha em gramas (milésimos) inteiras para as somas fecharem sem erro de ponto flutuante
const toMilli = v => Math.round(Number(v) * 1000);
const fromMilli = m => m / 1000;

// Divide o total no menor número de bateladas de até 150 kg, com pesos iguais
// (320 kg viram 106,667 + 106,667 + 106,666 em vez de 150 + 150 + 20).
export function splitBatches(totalKg, maxKg = MIXER_MAX_KG) {
  const totalG = toMilli(totalKg);
  if (totalG <= 0) return [];
  const count = Math.ceil(totalG / toMilli(maxKg));
  const base = Math.floor(totalG / count);
  const extra = totalG - base * count;
  return Array.from({ length: count }, (_, i) => fromMilli(base + (i < extra ? 1 : 0)));
}

// portions: production_portions com flavors, production_orders e portion_ingredient_lines (com ingredients)
// Retorna um grupo por OP + sabor, cada um com suas bateladas e os temperos de cada batelada.
export function buildSeasoningBatches(portions, maxKg = MIXER_MAX_KG) {
  const groups = new Map();

  (portions || []).forEach(p => {
    const key = `${p.production_order_id}|${p.flavor_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        order: p.production_orders || null,
        flavorId: p.flavor_id,
        flavorName: p.flavors?.name || 'Sabor não identificado',
        portions: [],
        totalG: 0,
        ingredients: new Map()
      });
    }
    const g = groups.get(key);
    g.portions.push(p);
    g.totalG += toMilli(p.planned_kg);
    (p.portion_ingredient_lines || []).forEach(l => {
      const name = l.ingredients?.name || 'Insumo não identificado';
      const ingKey = `${l.ingredient_id || name}|${l.unit}`;
      if (!g.ingredients.has(ingKey)) g.ingredients.set(ingKey, { name, unit: l.unit, totalM: 0 });
      g.ingredients.get(ingKey).totalM += toMilli(l.requested_quantity);
    });
  });

  return [...groups.values()].map(g => {
    const ingredients = [...g.ingredients.values()].sort((a, b) => b.totalM - a.totalM || a.name.localeCompare(b.name));
    const sizes = splitBatches(fromMilli(g.totalG), maxKg).map(toMilli);

    // Rateio proporcional; a última batelada fecha a conta para a soma bater com o total
    const allocated = ingredients.map(() => 0);
    const batches = sizes.map((sizeG, idx) => {
      const isLast = idx === sizes.length - 1;
      const items = ingredients.map((ing, i) => {
        const m = isLast ? ing.totalM - allocated[i] : Math.round(ing.totalM * sizeG / g.totalG);
        allocated[i] += m;
        return { name: ing.name, unit: ing.unit, quantity: fromMilli(m) };
      });
      const seasoningKgM = items.filter(it => it.unit === 'kg').reduce((s, it) => s + toMilli(it.quantity), 0);
      return {
        batchNo: idx + 1,
        totalKg: fromMilli(sizeG),
        seasoningKg: fromMilli(seasoningKgM),
        meatKg: fromMilli(Math.max(0, sizeG - seasoningKgM)),
        items
      };
    });

    return {
      key: g.key,
      order: g.order,
      flavorId: g.flavorId,
      flavorName: g.flavorName,
      portions: g.portions,
      totalKg: fromMilli(g.totalG),
      ingredients: ingredients.map(i => ({ name: i.name, unit: i.unit, quantity: fromMilli(i.totalM) })),
      batches
    };
  }).sort((a, b) =>
    String(b.order?.production_date || '').localeCompare(String(a.order?.production_date || '')) ||
    String(a.order?.order_code || '').localeCompare(String(b.order?.order_code || '')) ||
    a.flavorName.localeCompare(b.flavorName));
}
