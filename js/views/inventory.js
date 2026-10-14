import { supabase } from '../supabaseClient.js';
import { opButtonClass, buildOpOptions, resolveSelectedOp, opSelectHtml, refreshOpSelect } from './opFilter.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

let currentSelectedWeek = 'all'; // 'all' ou 'Semana XX / YYYY'
let currentFilterMode = 'all'; // 'all', 'day', 'range' ou 'op' (Por Ordem de Produção)
let selectedOrderId = null;
let opOptions = [];
let selectedFilterDate = new Date().toISOString().split('T')[0];
let selectedStartDate = new Date().toISOString().split('T')[0];
let selectedEndDate = new Date().toISOString().split('T')[0];

export function getISOWeekDetails(dateStr) {
  if (!dateStr) return { weekNum: 0, year: 0, label: 'Sem Data' };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { weekNum: 0, year: 0, label: 'Sem Data' };

  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
  const year = target.getFullYear();
  return { weekNum, year, label: `Semana ${String(weekNum).padStart(2, '0')} / ${year}` };
}

export async function render(container) {
  const today = new Date().toISOString().split('T')[0];
  if (!selectedFilterDate) selectedFilterDate = today;
  if (!selectedStartDate) selectedStartDate = today;
  if (!selectedEndDate) selectedEndDate = today;

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Estoque & Acompanhamento por Semana</h1>
          <p class="font-body-md text-body-md text-text-muted">Gestão de estoque real separado por semana de produção, acompanhamento de validade e saldos em câmara.</p>
        </div>

        <div class="flex items-center gap-space-sm flex-wrap">
          <!-- Filtro Seletor de Semana de Produção -->
          <div class="flex items-center gap-2 bg-surface-canvas px-3 py-1.5 rounded-lg border border-border-subtle">
            <span class="material-symbols-outlined text-bordeaux-primary text-[20px]">calendar_view_week</span>
            <label for="inventory-week-select" class="font-label-sm text-label-sm text-text-muted uppercase font-bold">Semana:</label>
            <select id="inventory-week-select" class="bg-transparent font-title-md text-title-md text-bordeaux-primary font-bold focus:outline-none cursor-pointer">
              <option value="all">Todas as Semanas</option>
            </select>
          </div>

          <button id="add-finished-lot-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[20px]">add_circle</span>
            <span>Entrada Manual de Lote</span>
          </button>
        </div>
      </div>

      <!-- Barra de Filtros de Período / Dia (Igual à Visão Geral) -->
      <div class="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-label-md text-text-muted flex items-center gap-1 mr-1">
            <span class="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Filtrar Estoque:</span>
          </span>
          <button id="inv-filter-all" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Visão Geral
          </button>
          <button id="inv-filter-day" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Dia
          </button>
          <button id="inv-filter-range" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Período / Semana
          </button>
          <button id="inv-filter-op" class="${opButtonClass(currentFilterMode === 'op')}">
            Por Ordem de Produção
          </button>
        </div>

        <div id="inv-date-controls" class="flex items-center gap-3 flex-wrap">
          <!-- Renderizado dinamicamente -->
        </div>
      </div>

      <!-- Form para Registrar Lote Acabado -->
      <div id="finished-lot-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Registrar Novo Lote de Produto Acabado</h3>
        <form id="finished-lot-form" class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Sabor</label>
            <select id="lot-flavor-id" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text"></select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Código do Lote</label>
            <input type="text" id="lot-code" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: LOT-2026-TRAD-01">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Tipo de Produto</label>
            <select id="lot-product-type" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
              <option value="manta">Manta</option>
              <option value="massa">Massa</option>
              <option value="linguica">Linguiça</option>
              <option value="granel">Granel</option>
              <option value="hamburguer">Hambúrguer</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Conservação</label>
            <select id="lot-conservation" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
              <option value="resfriado">Resfriado (+45 dias)</option>
              <option value="congelado">Congelado (+6 meses de calendário)</option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Data de Massa Pronta (Data-Base)</label>
            <input type="date" id="lot-mass-ready-date" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Quantidade Produzida (kg)</label>
            <input type="number" step="0.001" id="lot-produced-kg" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="0.000">
          </div>

          <div class="flex items-center gap-2 md:col-span-3 justify-end">
            <button type="button" id="lot-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Gravar Entrada de Estoque</button>
          </div>
        </form>
      </div>

      <div id="inventory-list-container"></div>
    </div>
  `;

  document.getElementById('add-finished-lot-btn')?.addEventListener('click', async () => {
    await populateLotFlavors();
    document.getElementById('lot-code').value = `LOT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    document.getElementById('lot-mass-ready-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('finished-lot-form-container')?.classList.remove('hidden');
  });

  document.getElementById('lot-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('finished-lot-form-container')?.classList.add('hidden');
  });

  document.getElementById('finished-lot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const flavor_id = document.getElementById('lot-flavor-id').value;
    const lot_code = document.getElementById('lot-code').value.trim();
    const product_type = document.getElementById('lot-product-type').value;
    const conservation = document.getElementById('lot-conservation').value;
    const mass_ready_date = document.getElementById('lot-mass-ready-date').value;
    const produced_kg = parseFloat(document.getElementById('lot-produced-kg').value);

    const { data: op } = await supabase.from('production_orders').select('id').limit(1).single();
    if (!op) {
      showNotification('É necessário ter ao menos uma OP criada para registrar um lote acabado.', 'error');
      return;
    }

    try {
      const { data: lot, error: lErr } = await supabase.from('finished_lots').insert({
        production_order_id: op.id,
        flavor_id,
        lot_code,
        product_type,
        conservation,
        mass_ready_date,
        produced_kg
      }).select().single();

      if (lErr) throw lErr;

      await supabase.from('inventory_movements').insert({
        finished_lot_id: lot.id,
        movement_type: 'production_entry',
        quantity_delta_kg: produced_kg,
        reference_text: 'Entrada de Produção'
      });

      showNotification('Lote acabado registrado e saldo alimentado no estoque!', 'success');
      document.getElementById('finished-lot-form-container')?.classList.add('hidden');
      loadInventory();
    } catch (err) {
      showNotification(`Erro ao criar lote acabado: ${err.message}`, 'error');
    }
  });

  setupFilterControls();
  setupInventoryWeekFilter(container);
  loadInventory();
}

function setupFilterControls() {
  const btnAll = document.getElementById('inv-filter-all');
  const btnDay = document.getElementById('inv-filter-day');
  const btnRange = document.getElementById('inv-filter-range');
  const btnOp = document.getElementById('inv-filter-op');
  const dateControls = document.getElementById('inv-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnOp) btnOp.className = opButtonClass(currentFilterMode === 'op');

    if (currentFilterMode === 'all') {
      dateControls.innerHTML = `<span class="text-xs font-bold text-text-muted bg-surface-canvas px-3 py-1.5 rounded-lg">Exibindo todo o estoque</span>`;
    } else if (currentFilterMode === 'day') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2">
          <label for="inv-single-date" class="text-xs font-bold text-ink-text">Data de Produção:</label>
          <input type="date" id="inv-single-date" value="${selectedFilterDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
      `;
      document.getElementById('inv-single-date')?.addEventListener('change', (e) => {
        selectedFilterDate = e.target.value;
        loadInventory();
      });
    } else if (currentFilterMode === 'op') {
      dateControls.innerHTML = opSelectHtml('inv-op-select', opOptions, selectedOrderId);
      document.getElementById('inv-op-select')?.addEventListener('change', (e) => {
        selectedOrderId = e.target.value;
        loadInventory();
      });
    } else if (currentFilterMode === 'range') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1">
            <label for="inv-start-date" class="text-xs font-bold text-ink-text">De:</label>
            <input type="date" id="inv-start-date" value="${selectedStartDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
          <div class="flex items-center gap-1">
            <label for="inv-end-date" class="text-xs font-bold text-ink-text">Até:</label>
            <input type="date" id="inv-end-date" value="${selectedEndDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
        </div>
      `;
      document.getElementById('inv-start-date')?.addEventListener('change', (e) => {
        selectedStartDate = e.target.value;
        loadInventory();
      });
      document.getElementById('inv-end-date')?.addEventListener('change', (e) => {
        selectedEndDate = e.target.value;
        loadInventory();
      });
    }
  };

  btnAll?.addEventListener('click', () => {
    currentFilterMode = 'all';
    updateModeUI();
    loadInventory();
  });

  btnDay?.addEventListener('click', () => {
    currentFilterMode = 'day';
    updateModeUI();
    loadInventory();
  });

  btnRange?.addEventListener('click', () => {
    currentFilterMode = 'range';
    updateModeUI();
    loadInventory();
  });

  btnOp?.addEventListener('click', () => {
    currentFilterMode = 'op';
    updateModeUI();
    loadInventory();
  });

  updateModeUI();
}

function setupInventoryWeekFilter(container) {
  const weekSelect = container.querySelector('#inventory-week-select');
  if (weekSelect) {
    weekSelect.addEventListener('change', (e) => {
      currentSelectedWeek = e.target.value;
      loadInventory();
    });
  }
}

async function populateLotFlavors() {
  const select = document.getElementById('lot-flavor-id');
  if (!select) return;

  const { data: flavors } = await supabase.from('flavors').select('id, name').eq('active', true).order('name');
  select.innerHTML = (flavors || []).map(f => `<option value="${f.id}">${f.name}</option>`).join('');
}

async function loadInventory() {
  const container = document.getElementById('inventory-list-container');
  if (!container) return;

  const [
    { data: inventory, error: invErr },
    { data: lots, error: lotsErr }
  ] = await Promise.all([
    supabase.from('vw_inventory_by_flavor').select('*'),
    supabase.from('finished_lots').select(`
      id, lot_code, created_at, mass_ready_date, product_type, conservation, produced_kg,
      flavors (id, name),
      production_orders (id, production_date, order_code)
    `).order('created_at', { ascending: false })
  ]);

  if (invErr || lotsErr) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar estoque por semana: ${(invErr || lotsErr)?.message}</div>`;
    return;
  }

  // Filtro por OP: opções vindas dos lotes que têm OP de origem
  opOptions = buildOpOptions((lots || []).map(l => l.production_orders));
  selectedOrderId = resolveSelectedOp(opOptions, selectedOrderId);
  refreshOpSelect('inv-op-select', opOptions, selectedOrderId);

  if (!inventory || inventory.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'inventory_2',
      title: 'Estoque Acabado Vazio',
      description: 'Conclua a etapa de Vácuo na produção ou dê entrada nos lotes acabados para alimentar o estoque por semana.',
      actionText: 'Dar Entrada no Primeiro Lote',
      onAction: () => document.getElementById('add-finished-lot-btn')?.click()
    }));
    return;
  }

  const lotsByLotCode = (lots || []).reduce((acc, l) => {
    acc[l.lot_code] = l;
    return acc;
  }, {});

  const weeksMap = {};

  inventory.forEach(item => {
    const lotObj = lotsByLotCode[item.lot_code] || {};
    const rawProdDate = lotObj.production_orders?.production_date || lotObj.mass_ready_date || item.expiry_date;
    const prodDate = rawProdDate ? rawProdDate.split('T')[0] : new Date().toISOString().split('T')[0];

    // Aplicar filtro por OP / data
    if (currentFilterMode === 'op' && lotObj.production_orders?.id !== selectedOrderId) {
      return;
    }
    if (currentFilterMode === 'day' && selectedFilterDate && prodDate !== selectedFilterDate) {
      return;
    }
    if (currentFilterMode === 'range' && selectedStartDate && selectedEndDate) {
      if (prodDate < selectedStartDate || prodDate > selectedEndDate) {
        return;
      }
    }

    const weekInfo = getISOWeekDetails(prodDate);
    const weekKey = weekInfo.label;

    if (!weeksMap[weekKey]) {
      weeksMap[weekKey] = {
        weekLabel: weekKey,
        totalBalanceKg: 0,
        items: []
      };
    }

    weeksMap[weekKey].totalBalanceKg += Number(item.balance_kg || 0);
    weeksMap[weekKey].items.push({
      ...item,
      prodDate
    });
  });

  const uniqueWeeks = Object.keys(weeksMap).sort().reverse();

  const weekSelect = document.getElementById('inventory-week-select');
  if (weekSelect) {
    const prevVal = currentSelectedWeek || 'all';
    weekSelect.innerHTML = `
      <option value="all" ${prevVal === 'all' ? 'selected' : ''}>Todas as Semanas</option>
      ${uniqueWeeks.map(w => `<option value="${w}" ${w === prevVal ? 'selected' : ''}>${w}</option>`).join('')}
    `;
    currentSelectedWeek = weekSelect.value;
  }

  let displayWeeks = uniqueWeeks;
  if (currentSelectedWeek && currentSelectedWeek !== 'all') {
    displayWeeks = displayWeeks.filter(w => w === currentSelectedWeek);
  }

  if (displayWeeks.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'op' ? ' para a ordem de produção selecionada' :
                       currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
                       currentFilterMode === 'range' ? ` para o período de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` : '';
    container.appendChild(renderEmptyState({
      icon: 'inventory_2',
      title: 'Nenhum Item de Estoque Encontrado',
      description: `Não há lotes em estoque correspondentes ao filtro selecionado${filterText}.`,
      actionText: null
    }));
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      ${displayWeeks.map(weekKey => {
        const weekGroup = weeksMap[weekKey];

        return `
          <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle flex flex-col gap-space-md p-space-md">
            <!-- Cabeçalho da Semana -->
            <div class="flex flex-wrap items-center justify-between border-b border-border-subtle pb-space-xs gap-2">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">calendar_view_week</span>
                <h3 class="font-title-lg text-title-lg text-ink-text font-bold">${weekGroup.weekLabel}</h3>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-text-muted font-bold">${weekGroup.items.length} ${weekGroup.items.length === 1 ? 'lote' : 'lotes'}</span>
                <span class="px-3 py-1 rounded-full text-xs font-bold bg-surface-container-low text-status-success border border-border-subtle">
                  Saldo da Semana: ${formatWeight(weekGroup.totalBalanceKg)}
                </span>
              </div>
            </div>

            <!-- Tabela de Lotes da Semana -->
            <div class="overflow-x-auto">
              <table class="w-full text-left font-body-md text-xs">
                <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
                  <tr>
                    <th class="py-2 px-3 font-semibold">Lote</th>
                    <th class="py-2 px-3 font-semibold">Sabor</th>
                    <th class="py-2 px-3 font-semibold">Tipo</th>
                    <th class="py-2 px-3 font-semibold">Conservação</th>
                    <th class="py-2 px-3 font-semibold">Data de Produção</th>
                    <th class="py-2 px-3 font-semibold">Validade Calculada</th>
                    <th class="py-2 px-3 font-semibold text-right">Saldo Atual (kg)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-ink-text">
                  ${weekGroup.items.map(item => `
                    <tr class="hover:bg-surface-canvas/60 transition-colors">
                      <td class="py-2.5 px-3 font-bold text-bordeaux-primary">${item.lot_code}</td>
                      <td class="py-2.5 px-3 font-bold">${item.flavor}</td>
                      <td class="py-2.5 px-3 capitalize">${item.product_type}</td>
                      <td class="py-2.5 px-3 capitalize">${item.conservation}</td>
                      <td class="py-2.5 px-3 font-bold text-ink-text">${formatDate(item.prodDate)}</td>
                      <td class="py-2.5 px-3 font-bold text-text-muted">${formatDate(item.expiry_date)}</td>
                      <td class="py-2.5 px-3 text-right font-bold text-status-success">${formatWeight(item.balance_kg)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
