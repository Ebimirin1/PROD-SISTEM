import { supabase } from '../supabaseClient.js';
import { showNotification, formatWeight } from '../utils.js';

// Lançamento de pedido em grade (modelo: aba PEDIDO ATAC da planilha).
// Escolhe destino/cliente uma vez e digita os kg numa tabela Sabor × (Tipo + Conservação).
// Cada célula preenchida vira uma linha em production_demands, igual ao formulário de uma linha.

const PRODUCT_TYPES = [
  { key: 'linguica', label: 'Linguiça' },
  { key: 'manta', label: 'Manta' },
  { key: 'massa', label: 'Massa' },
  { key: 'granel', label: 'Granel' },
  { key: 'hamburguer', label: 'Hambúrguer' }
];
const CONSERVATIONS = [
  { key: 'resfriado', label: 'Resfriado' },
  { key: 'congelado', label: 'Congelado' }
];
const ALL_COLUMNS = PRODUCT_TYPES.flatMap(t => CONSERVATIONS.map(c => ({
  key: `${t.key}|${c.key}`,
  type: t.key,
  conservation: c.key,
  label: `${t.label} · ${c.label}`
})));
const DEFAULT_COLUMNS = ['linguica|resfriado', 'linguica|congelado'];
const COLUMNS_STORAGE_KEY = 'sgp.demandGrid.columns';

const DESTINATIONS = [
  { key: 'emporio', label: 'Empório' },
  { key: 'lanchonete', label: 'Lanchonete' },
  { key: 'atacado', label: 'Atacado' },
  { key: 'outro', label: 'Outro' }
];

let state = null;

function loadSavedColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) return saved.filter(k => ALL_COLUMNS.some(c => c.key === k));
  } catch (_) { /* sem armazenamento local: usa o padrão */ }
  return [...DEFAULT_COLUMNS];
}

function saveColumns(keys) {
  try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(keys)); } catch (_) { /* ignora */ }
}

function cellKey(flavorId, colKey) {
  return `${flavorId}|${colKey}`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Abre a grade para uma OP. `demands` são as linhas já lançadas (para pré-preencher e editar).
export async function openDemandGrid({ production_order_id, order_code, demands, assertOpEditable, onSaved }) {
  const container = document.getElementById('demand-grid-container');
  if (!container) return;

  const [{ data: flavors, error: fErr }, { data: partners }, { data: versions, error: vErr }] = await Promise.all([
    supabase.from('flavors').select('id, name, hamburger_allowed').eq('active', true).order('name'),
    supabase.from('partners').select('id, name, partner_type').eq('active', true).order('name'),
    supabase.from('formula_versions').select('id, flavor_id').eq('status', 'active')
  ]);

  if (fErr || vErr) {
    showNotification(`Erro ao consultar sabores: ${(fErr || vErr).message}`, 'error');
    return;
  }
  if (!flavors || flavors.length === 0) {
    showNotification('Ainda não há sabores cadastrados. Por favor, cadastre os sabores na tela "Cadastros & Fórmulas" antes de adicionar demandas.', 'warning');
    return;
  }

  state = {
    production_order_id,
    order_code,
    demands: demands || [],
    flavors,
    partners: partners || [],
    activeVersionByFlavor: new Map((versions || []).map(v => [v.flavor_id, v.id])),
    columns: loadSavedColumns(),
    destination: 'emporio',
    partnerId: '',
    dirty: false,
    assertOpEditable,
    onSaved
  };

  document.getElementById('op-form-container')?.classList.add('hidden');
  document.getElementById('demand-form-container')?.classList.add('hidden');
  renderShell(container);
  renderGrid();
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth' });
}

export function closeDemandGrid() {
  document.getElementById('demand-grid-container')?.classList.add('hidden');
  state = null;
}

function renderShell(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 class="font-title-lg text-title-lg text-ink-text">Lançar Pedido em Grade · OP ${escapeHtml(state.order_code)}</h3>
          <p class="text-xs text-text-muted">Escolha o destino, depois digite os kg de cada sabor. Células vazias não geram linha. Enter desce para o próximo sabor.</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        <div class="flex flex-col gap-1">
          <label class="font-label-md text-ink-text font-bold" for="grid-destination">Destino / Canal <span class="text-alert-critical">*</span></label>
          <select id="grid-destination" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold">
            ${DESTINATIONS.map(d => `<option value="${d.key}">${d.label}</option>`).join('')}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-label-md text-ink-text" for="grid-partner">Cliente / Parceiro (Obrigatório para Atacado)</label>
          <select id="grid-partner" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
            <option value="">Geral / Nenhum Parceiro Específico</option>
            ${state.partners.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.partner_type.toUpperCase())})</option>`).join('')}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-label-md text-ink-text" for="grid-notes">Observação (vai para as linhas novas)</label>
          <input type="text" id="grid-notes" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text" placeholder="Ex: Pedido especial do cliente">
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="font-label-md text-ink-text">Colunas (tipo + conservação)</span>
        <div id="grid-column-toggles" class="flex flex-wrap gap-2"></div>
      </div>

      <div class="flex items-center gap-2">
        <input type="search" id="grid-flavor-search" class="min-h-[40px] px-3 rounded-lg border border-border-subtle bg-surface-card text-ink-text text-sm w-full md:w-64" placeholder="Buscar sabor...">
      </div>

      <div id="grid-table-wrap" class="overflow-x-auto"></div>

      <div id="grid-error" class="hidden p-3 rounded-lg bg-badge-error-bg text-badge-error-text text-xs font-bold"></div>

      <div class="flex items-center gap-2 justify-end flex-wrap">
        <span id="grid-total" class="text-xs font-bold text-ink-text mr-auto"></span>
        <button type="button" id="grid-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Fechar</button>
        <button type="button" id="grid-save-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar Pedido</button>
      </div>
    </div>
  `;

  const destSelect = document.getElementById('grid-destination');
  const partnerSelect = document.getElementById('grid-partner');

  const switchTarget = (apply) => {
    if (state.dirty && !confirm('Há quantidades não salvas neste destino. Trocar mesmo assim e descartar?')) return false;
    apply();
    renderGrid();
    return true;
  };

  destSelect.addEventListener('change', () => {
    const previous = state.destination;
    // Trocar o destino começa sem cliente (cada destino/cliente é um pedido separado)
    if (switchTarget(() => { state.destination = destSelect.value; state.partnerId = ''; partnerSelect.value = ''; })) return;
    destSelect.value = previous;
  });
  partnerSelect.addEventListener('change', () => {
    const previous = state.partnerId;
    if (!switchTarget(() => { state.partnerId = partnerSelect.value; })) partnerSelect.value = previous;
  });

  document.getElementById('grid-flavor-search').addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#grid-table-wrap tbody tr[data-flavor-name]').forEach(tr => {
      tr.classList.toggle('hidden', term !== '' && !tr.dataset.flavorName.includes(term));
    });
  });

  document.getElementById('grid-cancel-btn').addEventListener('click', () => {
    if (state?.dirty && !confirm('Há quantidades não salvas. Fechar mesmo assim?')) return;
    closeDemandGrid();
  });
  document.getElementById('grid-save-btn').addEventListener('click', saveGrid);
}

// Linhas já lançadas nesta OP para o destino/cliente atual, agrupadas por célula
function existingByCell() {
  const map = new Map();
  for (const d of state.demands) {
    if (d.destination_key !== state.destination) continue;
    if ((d.destination_partner_id || '') !== state.partnerId) continue;
    if (!d.requested_product_type || !d.requested_conservation) continue;
    const key = cellKey(d.flavor_id, `${d.requested_product_type}|${d.requested_conservation}`);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  }
  return map;
}

function renderGrid() {
  state.dirty = false;
  state.existing = existingByCell();

  // Liga automaticamente as colunas que já têm quantidade lançada
  for (const key of state.existing.keys()) {
    const colKey = key.split('|').slice(1).join('|');
    if (!state.columns.includes(colKey)) state.columns.push(colKey);
  }
  const columns = ALL_COLUMNS.filter(c => state.columns.includes(c.key));

  document.getElementById('grid-column-toggles').innerHTML = ALL_COLUMNS.map(c => {
    const on = state.columns.includes(c.key);
    return `<button type="button" data-col="${c.key}" class="grid-col-toggle px-3 py-1.5 rounded-full text-xs font-bold border ${on
      ? 'bg-bordeaux-primary text-on-primary border-bordeaux-primary'
      : 'bg-surface-card text-ink-text border-border-subtle hover:bg-surface-container'}">${c.label}</button>`;
  }).join('');

  document.querySelectorAll('.grid-col-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.col;
      if (state.columns.includes(key)) {
        if (hasValuesInColumn(key)) {
          showNotification('Esta coluna tem quantidades. Apague os valores antes de esconder a coluna.', 'warning');
          return;
        }
        state.columns = state.columns.filter(k => k !== key);
      } else {
        state.columns.push(key);
      }
      saveColumns(state.columns);
      const pending = collectInputs();
      const wasDirty = state.dirty;
      renderGrid();
      restoreInputs(pending);
      state.dirty = wasDirty;
      updateTotals();
    });
  });

  const wrap = document.getElementById('grid-table-wrap');
  if (columns.length === 0) {
    wrap.innerHTML = '<p class="text-xs text-text-muted p-3">Ligue ao menos uma coluna acima.</p>';
    updateTotals();
    return;
  }

  wrap.innerHTML = `
    <table class="w-full text-left font-body-md border-collapse">
      <thead class="bg-surface-canvas text-ink-text font-title-md text-xs">
        <tr>
          <th class="py-2 px-3 sticky left-0 bg-surface-canvas">Sabor</th>
          ${columns.map(c => `<th class="py-2 px-2 text-right whitespace-nowrap">${c.label}</th>`).join('')}
          <th class="py-2 px-3 text-right">Total</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border-subtle text-xs">
        ${state.flavors.map(f => {
          const hasFormula = state.activeVersionByFlavor.has(f.id);
          return `
          <tr data-flavor-name="${escapeHtml(f.name.toLowerCase())}">
            <td class="py-1.5 px-3 font-bold text-bordeaux-primary sticky left-0 bg-surface-card whitespace-nowrap">
              ${escapeHtml(f.name)}
              ${hasFormula ? '' : '<span class="block text-[10px] font-normal text-alert-critical">sem receita ativa</span>'}
            </td>
            ${columns.map(c => {
              const lines = state.existing.get(cellKey(f.id, c.key)) || [];
              const sum = lines.reduce((s, d) => s + Number(d.planned_kg), 0);
              const blockedHamburger = c.type === 'hamburguer' && !f.hamburger_allowed;
              const disabled = blockedHamburger || lines.length > 1 || (!hasFormula && lines.length === 0);
              const title = blockedHamburger ? 'Sabor sem hambúrguer liberado'
                : lines.length > 1 ? 'Várias linhas nesta célula: edite pela lista de demandas'
                : !hasFormula ? 'Ative uma receita para este sabor em Cadastros & Fórmulas' : '';
              return `<td class="py-1 px-1 text-right">
                <input type="number" step="0.001" min="0" inputmode="decimal"
                  class="grid-cell w-24 min-h-[36px] px-2 rounded border border-border-subtle bg-surface-card text-ink-text text-right font-bold disabled:opacity-40 disabled:bg-surface-canvas"
                  data-flavor="${f.id}" data-col="${c.key}"
                  value="${lines.length ? Number(sum.toFixed(3)) : ''}"
                  ${disabled ? 'disabled' : ''} ${title ? `title="${title}"` : ''}>
              </td>`;
            }).join('')}
            <td class="py-1.5 px-3 text-right font-bold grid-row-total" data-flavor="${f.id}"></td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot class="bg-surface-canvas text-xs font-bold">
        <tr>
          <td class="py-2 px-3 sticky left-0 bg-surface-canvas">Total</td>
          ${columns.map(c => `<td class="py-2 px-2 text-right grid-col-total" data-col="${c.key}"></td>`).join('')}
          <td class="py-2 px-3 text-right" id="grid-grand-total"></td>
        </tr>
      </tfoot>
    </table>
  `;

  const inputs = [...wrap.querySelectorAll('.grid-cell')];
  inputs.forEach(input => {
    input.addEventListener('input', () => { state.dirty = true; updateTotals(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // Desce para o próximo sabor visível na mesma coluna
      const sameCol = inputs.filter(i => i.dataset.col === input.dataset.col && !i.disabled && !i.closest('tr').classList.contains('hidden'));
      const next = sameCol[sameCol.indexOf(input) + 1];
      if (next) { next.focus(); next.select(); }
    });
  });

  const partnerSelect = document.getElementById('grid-partner');
  if (state.destination === 'atacado') partnerSelect.setAttribute('required', 'true');
  else partnerSelect.removeAttribute('required');

  document.getElementById('grid-error')?.classList.add('hidden');
  document.getElementById('grid-flavor-search')?.dispatchEvent(new Event('input'));
  updateTotals();
}

function collectInputs() {
  const values = new Map();
  document.querySelectorAll('#grid-table-wrap .grid-cell').forEach(i => {
    values.set(cellKey(i.dataset.flavor, i.dataset.col), i.value);
  });
  return values;
}

function restoreInputs(values) {
  document.querySelectorAll('#grid-table-wrap .grid-cell').forEach(i => {
    const key = cellKey(i.dataset.flavor, i.dataset.col);
    if (values.has(key) && !i.disabled) i.value = values.get(key);
  });
}

function hasValuesInColumn(colKey) {
  return [...document.querySelectorAll(`#grid-table-wrap .grid-cell[data-col="${colKey}"]`)]
    .some(i => parseFloat(i.value) > 0);
}

function updateTotals() {
  const cells = [...document.querySelectorAll('#grid-table-wrap .grid-cell')];
  const val = i => { const n = parseFloat(i.value); return isNaN(n) || n < 0 ? 0 : n; };

  document.querySelectorAll('#grid-table-wrap .grid-row-total').forEach(td => {
    const sum = cells.filter(i => i.dataset.flavor === td.dataset.flavor).reduce((s, i) => s + val(i), 0);
    td.textContent = sum > 0 ? formatWeight(sum) : '';
  });
  document.querySelectorAll('#grid-table-wrap .grid-col-total').forEach(td => {
    const sum = cells.filter(i => i.dataset.col === td.dataset.col).reduce((s, i) => s + val(i), 0);
    td.textContent = sum > 0 ? formatWeight(sum) : '';
  });
  const grand = cells.reduce((s, i) => s + val(i), 0);
  const grandCell = document.getElementById('grid-grand-total');
  if (grandCell) grandCell.textContent = formatWeight(grand);
  const destLabel = DESTINATIONS.find(d => d.key === state.destination)?.label || state.destination;
  const totalSpan = document.getElementById('grid-total');
  if (totalSpan) totalSpan.textContent = `Total ${destLabel}: ${formatWeight(grand)}`;
}

async function saveGrid() {
  const errorDiv = document.getElementById('grid-error');
  const saveBtn = document.getElementById('grid-save-btn');
  const showError = (msg) => {
    errorDiv.innerText = msg;
    errorDiv.classList.remove('hidden');
  };
  errorDiv.classList.add('hidden');

  if (state.destination === 'atacado' && !state.partnerId) {
    showError('Para o destino Atacado, selecione obrigatoriamente um Cliente / Parceiro.');
    return;
  }

  const notes = document.getElementById('grid-notes').value.trim() || null;
  const inserts = [];
  const updates = [];
  const deletes = [];

  for (const input of document.querySelectorAll('#grid-table-wrap .grid-cell')) {
    if (input.disabled) continue;
    const raw = input.value.trim();
    const kg = raw === '' ? 0 : parseFloat(raw);
    const flavor = state.flavors.find(f => f.id === input.dataset.flavor);
    if (isNaN(kg) || kg < 0) {
      showError(`Quantidade inválida em ${flavor?.name}.`);
      input.focus();
      return;
    }
    const [type, conservation] = input.dataset.col.split('|');
    const existing = (state.existing.get(cellKey(input.dataset.flavor, input.dataset.col)) || [])[0];
    const versionId = state.activeVersionByFlavor.get(input.dataset.flavor);

    if (existing) {
      if (kg === 0) { deletes.push(existing.id); continue; }
      if (Math.abs(kg - Number(existing.planned_kg)) < 0.0005) continue;
      if (!versionId) {
        showError(`O sabor "${flavor?.name}" não possui uma receita/formulação ATIVA. Ative uma receita em "Cadastros & Fórmulas".`);
        return;
      }
      updates.push({ id: existing.id, planned_kg: kg, formula_version_id: versionId });
    } else if (kg > 0) {
      if (!versionId) {
        showError(`O sabor "${flavor?.name}" não possui uma receita/formulação ATIVA. Ative uma receita em "Cadastros & Fórmulas".`);
        return;
      }
      inserts.push({
        production_order_id: state.production_order_id,
        flavor_id: input.dataset.flavor,
        formula_version_id: versionId,
        destination_key: state.destination,
        destination_partner_id: state.partnerId || null,
        requested_product_type: type,
        requested_conservation: conservation,
        planned_kg: kg,
        notes
      });
    }
  }

  if (inserts.length + updates.length + deletes.length === 0) {
    showNotification('Nenhuma alteração para salvar.', 'info');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.classList.add('opacity-60', 'cursor-wait');
  try {
    await state.assertOpEditable(state.production_order_id);
    if (inserts.length) {
      const { error } = await supabase.from('production_demands').insert(inserts);
      if (error) throw error;
    }
    for (const u of updates) {
      const { error } = await supabase.from('production_demands')
        .update({ planned_kg: u.planned_kg, formula_version_id: u.formula_version_id })
        .eq('id', u.id);
      if (error) throw error;
    }
    if (deletes.length) {
      const { error } = await supabase.from('production_demands').delete().in('id', deletes);
      if (error) throw error;
    }
    const parts = [];
    if (inserts.length) parts.push(`${inserts.length} nova${inserts.length === 1 ? '' : 's'}`);
    if (updates.length) parts.push(`${updates.length} alterada${updates.length === 1 ? '' : 's'}`);
    if (deletes.length) parts.push(`${deletes.length} removida${deletes.length === 1 ? '' : 's'}`);
    showNotification(`Pedido salvo: ${parts.join(', ')}.`, 'success');

    // Atualiza as linhas em memória e continua na grade (para lançar o próximo destino)
    const onSaved = state.onSaved;
    const refreshed = onSaved ? await onSaved() : null;
    if (state && refreshed) {
      state.demands = refreshed;
      renderGrid();
    }
  } catch (err) {
    showError(`Erro ao salvar o pedido: ${err.message}. Confira a lista de demandas; parte das linhas pode ter sido gravada.`);
    if (state?.onSaved) {
      const refreshed = await state.onSaved();
      if (state && refreshed) {
        // Mostra o que ficou gravado de fato, para não duplicar linhas ao salvar de novo
        state.demands = refreshed;
        renderGrid();
        showError(`Erro ao salvar o pedido: ${err.message}. A grade foi recarregada com o que ficou gravado; confira e salve de novo.`);
      }
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.classList.remove('opacity-60', 'cursor-wait');
  }
}
