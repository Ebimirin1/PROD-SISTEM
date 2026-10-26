import { supabase } from '../supabaseClient.js';
import { opButtonClass, buildOpOptions, resolveSelectedOp, opSelectHtml, refreshOpSelect } from './opFilter.js';
import { showSeasoningForOrder } from './separation.js';
import { openFlavorDestinationMap } from './flavorDestinationMap.js';
import { openDemandGrid, closeDemandGrid } from './demandGrid.js';
import { navigateTo } from '../app.js';
import { showNotification, renderEmptyState, formatWeight, formatDate, todayLocal, weekdayName, buildOrderCode } from '../utils.js';

// Sugere o código da OP pela data (DDMMAAAA). Se já existir, acrescenta -2, -3...
async function suggestOrderCode(dateStr) {
  const base = buildOrderCode(dateStr);
  const { data } = await supabase.from('production_orders').select('order_code').like('order_code', `${base}%`);
  const used = new Set((data || []).map(o => o.order_code));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

let opCodeEdited = false;
let lastLoadedOps = []; // OPs exibidas no filtro atual (usadas no mapa Sabor × Destino)

let currentFilterMode = 'op'; // 'op' (Por Ordem de Produção, padrão: OP mais recente), 'all', 'day' ou 'range'
let selectedOrderId = null;
let opOptions = [];
let selectedFilterDate = new Date().toISOString().split('T')[0];
let selectedStartDate = new Date().toISOString().split('T')[0];
let selectedEndDate = new Date().toISOString().split('T')[0];

export async function render(container) {
  const today = new Date().toISOString().split('T')[0];
  if (!selectedFilterDate) selectedFilterDate = today;
  if (!selectedStartDate) selectedStartDate = today;
  if (!selectedEndDate) selectedEndDate = today;

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Planejamento & Ordens de Produção</h1>
          <p class="font-body-md text-body-md text-text-muted">Gestão de OPs consolidadas, demandas por canal, cálculo de receitas e geração de bateladas/porções.</p>
        </div>
        <div class="flex items-center gap-space-sm flex-wrap">
          <button id="flavor-map-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-card hover:bg-surface-container text-bordeaux-primary border border-border-subtle font-title-md flex items-center gap-2 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[20px]">table_view</span>
            <span>Mapa Sabor × Destino</span>
          </button>
          <button id="add-op-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[20px]">add_circle</span>
            <span>Abrir Nova OP</span>
          </button>
        </div>
      </div>

      <!-- Barra de Filtros de Período / Dia (Igual à Visão Geral) -->
      <div class="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-label-md text-text-muted flex items-center gap-1 mr-1">
            <span class="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Filtrar OPs:</span>
          </span>
          <button id="plan-filter-all" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Visão Geral
          </button>
          <button id="plan-filter-day" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Dia
          </button>
          <button id="plan-filter-range" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Período / Semana
          </button>
          <button id="plan-filter-op" class="${opButtonClass(currentFilterMode === 'op')}">
            Por Ordem de Produção
          </button>
        </div>

        <div id="plan-date-controls" class="flex items-center gap-3 flex-wrap">
          <!-- Renderizado dinamicamente conforme currentFilterMode -->
        </div>
      </div>

      <div id="planning-tab-content"></div>
    </div>
  `;

  setupFilterControls();
  renderOPsTab();

  document.getElementById('flavor-map-btn')?.addEventListener('click', () => {
    const scope = currentFilterMode === 'op' ? `OP ${lastLoadedOps[0]?.order_code || ''}` :
                  currentFilterMode === 'day' ? `Produção do dia ${formatDate(selectedFilterDate)}` :
                  currentFilterMode === 'range' ? `Produção de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` :
                  'Todas as OPs';
    openFlavorDestinationMap(lastLoadedOps, `${scope} (${lastLoadedOps.length} OP${lastLoadedOps.length === 1 ? '' : 's'})`);
  });
}

function setupFilterControls() {
  const btnAll = document.getElementById('plan-filter-all');
  const btnDay = document.getElementById('plan-filter-day');
  const btnRange = document.getElementById('plan-filter-range');
  const btnOp = document.getElementById('plan-filter-op');
  const dateControls = document.getElementById('plan-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnOp) btnOp.className = opButtonClass(currentFilterMode === 'op');

    if (currentFilterMode === 'all') {
      dateControls.innerHTML = `<span class="text-xs font-bold text-text-muted bg-surface-canvas px-3 py-1.5 rounded-lg">Exibindo todas as Ordens de Produção</span>`;
    } else if (currentFilterMode === 'day') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2">
          <label for="plan-single-date" class="text-xs font-bold text-ink-text">Data de Produção:</label>
          <input type="date" id="plan-single-date" value="${selectedFilterDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
      `;
      document.getElementById('plan-single-date')?.addEventListener('change', (e) => {
        selectedFilterDate = e.target.value;
        loadOPs();
      });
    } else if (currentFilterMode === 'op') {
      dateControls.innerHTML = opSelectHtml('plan-op-select', opOptions, selectedOrderId);
      document.getElementById('plan-op-select')?.addEventListener('change', (e) => {
        selectedOrderId = e.target.value;
        loadOPs();
      });
    } else if (currentFilterMode === 'range') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1">
            <label for="plan-start-date" class="text-xs font-bold text-ink-text">De:</label>
            <input type="date" id="plan-start-date" value="${selectedStartDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
          <div class="flex items-center gap-1">
            <label for="plan-end-date" class="text-xs font-bold text-ink-text">Até:</label>
            <input type="date" id="plan-end-date" value="${selectedEndDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
        </div>
      `;
      document.getElementById('plan-start-date')?.addEventListener('change', (e) => {
        selectedStartDate = e.target.value;
        loadOPs();
      });
      document.getElementById('plan-end-date')?.addEventListener('change', (e) => {
        selectedEndDate = e.target.value;
        loadOPs();
      });
    }
  };

  btnAll?.addEventListener('click', () => {
    currentFilterMode = 'all';
    updateModeUI();
    loadOPs();
  });

  btnDay?.addEventListener('click', () => {
    currentFilterMode = 'day';
    updateModeUI();
    loadOPs();
  });

  btnRange?.addEventListener('click', () => {
    currentFilterMode = 'range';
    updateModeUI();
    loadOPs();
  });

  btnOp?.addEventListener('click', () => {
    currentFilterMode = 'op';
    updateModeUI();
    loadOPs();
  });

  updateModeUI();
}

// ----------------------------------------------------
// 1. ORDENS DE PRODUÇÃO
// ----------------------------------------------------
async function renderOPsTab() {
  const content = document.getElementById('planning-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <!-- Form para Criar OP -->
      <div id="op-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 id="op-form-title" class="font-title-lg text-title-lg text-ink-text">Abrir Nova Ordem de Produção Consolidada</h3>
        <form id="op-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="op-edit-id">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Código da OP</label>
              <input type="text" id="op-code" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: 13102026">
              <span id="op-code-hint" class="text-xs text-text-muted"></span>
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Data Programada</label>
              <input type="date" id="op-date" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Data Base de Massa Pronta</label>
              <input type="date" id="op-mass-ready-date" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
            </div>
          </div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="op-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" id="op-submit-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Criar OP (Rascunho)</button>
          </div>
        </form>
      </div>

      <!-- Form/Modal para Adicionar Linha de Demanda -->
      <div id="demand-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 id="demand-form-title" class="font-title-lg text-title-lg text-ink-text">Adicionar Linha de Demanda à OP</h3>
        <form id="demand-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="demand-op-id">
          <input type="hidden" id="demand-edit-id">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <!-- Campo Obrigatório: Selecione o Sabor -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold" for="demand-flavor-select">Sabor <span class="text-alert-critical">*</span></label>
              <select id="demand-flavor-select" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold focus:outline-none focus:border-bordeaux-primary">
                <option value="" disabled selected>Selecione o sabor</option>
              </select>
            </div>

            <!-- Campo Obrigatório: Peso Pretendido -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold" for="demand-planned-kg">Quantidade Pretendida (kg) <span class="text-alert-critical">*</span></label>
              <input type="number" step="0.001" min="0.001" id="demand-planned-kg" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: 50.000">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <!-- Destino -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="demand-destination-select">Destino / Canal</label>
              <select id="demand-destination-select" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
                <option value="emporio" selected>Empório</option>
                <option value="lanchonete">Lanchonete</option>
                <option value="atacado">Atacado</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <!-- Parceiro/Cliente Especifico -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="demand-partner-select">Cliente / Parceiro (Obrigatório para Atacado)</label>
              <select id="demand-partner-select" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
                <option value="">Geral / Nenhum Parceiro Específico</option>
              </select>
            </div>

            <!-- Tipo Solicitado -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="demand-product-type-select">Tipo de Produto Solicitado</label>
              <select id="demand-product-type-select" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
                <option value="linguica" selected>Linguiça</option>
                <option value="manta">Manta</option>
                <option value="massa">Massa</option>
                <option value="granel">Granel</option>
                <option value="hamburguer">Hambúrguer</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <!-- Conservação -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="demand-conservation-select">Conservação</label>
              <select id="demand-conservation-select" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
                <option value="resfriado" selected>Resfriado</option>
                <option value="congelado">Congelado</option>
              </select>
            </div>

            <!-- Observações -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="demand-notes">Observações da Linha</label>
              <input type="text" id="demand-notes" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text" placeholder="Ex: Pedido especial do cliente">
            </div>
          </div>

          <div id="demand-form-error" class="hidden p-3 rounded-lg bg-badge-error-bg text-badge-error-text text-xs font-bold"></div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="demand-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" id="demand-submit-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar Demanda</button>
          </div>
        </form>
      </div>

      <!-- Lançamento de pedido em grade (destino uma vez + kg por sabor × tipo/conservação) -->
      <div id="demand-grid-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm"></div>

      <div id="ops-list-container"></div>
    </div>
  `;

  const refreshOpCode = async () => {
    const dateStr = document.getElementById('op-date')?.value;
    const hint = document.getElementById('op-code-hint');
    if (!dateStr) return;
    if (hint) hint.textContent = `${weekdayName(dateStr)} • código gerado pela data (DDMMAAAA)`;
    if (!opCodeEdited) document.getElementById('op-code').value = await suggestOrderCode(dateStr);
  };

  document.getElementById('add-op-btn')?.addEventListener('click', async () => {
    const today = todayLocal();
    opCodeEdited = false;
    document.getElementById('op-edit-id').value = '';
    document.getElementById('op-form-title').textContent = 'Abrir Nova Ordem de Produção Consolidada';
    document.getElementById('op-submit-btn').textContent = 'Criar OP (Rascunho)';
    document.getElementById('op-date').value = today;
    document.getElementById('op-mass-ready-date').value = today;
    document.getElementById('op-form-container')?.classList.remove('hidden');
    document.getElementById('demand-form-container')?.classList.add('hidden');
    closeDemandGrid();
    await refreshOpCode();
  });

  document.getElementById('op-date')?.addEventListener('change', refreshOpCode);
  document.getElementById('op-code')?.addEventListener('input', () => { opCodeEdited = true; });

  document.getElementById('op-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('op-form-container')?.classList.add('hidden');
  });

  document.getElementById('op-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const order_code = document.getElementById('op-code').value.trim();
    const production_date = document.getElementById('op-date').value;
    const mass_ready_date = document.getElementById('op-mass-ready-date').value || production_date;
    const editId = document.getElementById('op-edit-id').value;

    try {
      if (editId) {
        // Só altera enquanto as ordens não foram geradas (o filtro em generated_at evita corrida com a geração)
        const { data: updated, error } = await supabase.from('production_orders')
          .update({ order_code, production_date, mass_ready_date })
          .eq('id', editId)
          .is('generated_at', null)
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) throw new Error(LOCKED_MSG);
        showNotification('Ordem de Produção atualizada!', 'success');
      } else {
        const { data: created, error } = await supabase.from('production_orders').insert({
          order_code,
          production_date,
          mass_ready_date
        }).select('id').single();
        if (error) throw error;
        // No filtro por OP, já mostra a OP recém-criada
        if (created?.id) selectedOrderId = created.id;
        showNotification('Ordem de Produção criada com sucesso!', 'success');
      }
      document.getElementById('op-form-container')?.classList.add('hidden');
      loadOPs();
    } catch (err) {
      showNotification(`Erro ao ${editId ? 'salvar' : 'criar'} OP: ${err.message}`, 'error');
    }
  });

  setupDemandForm();
  loadOPs();
}

function setupDemandForm() {
  const cancelBtn = document.getElementById('demand-cancel-btn');
  const formContainer = document.getElementById('demand-form-container');
  const form = document.getElementById('demand-form');
  const errorDiv = document.getElementById('demand-form-error');

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  const destSelect = document.getElementById('demand-destination-select');
  const partnerSelect = document.getElementById('demand-partner-select');

  destSelect?.addEventListener('change', () => {
    if (destSelect.value === 'atacado') {
      partnerSelect?.setAttribute('required', 'true');
    } else {
      partnerSelect?.removeAttribute('required');
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv?.classList.add('hidden');

    const opId = document.getElementById('demand-op-id').value;
    const editId = document.getElementById('demand-edit-id').value;
    const flavorId = document.getElementById('demand-flavor-select').value;
    const plannedKg = parseFloat(document.getElementById('demand-planned-kg').value);
    const destinationKey = document.getElementById('demand-destination-select').value;
    const partnerId = document.getElementById('demand-partner-select').value || null;
    const productType = document.getElementById('demand-product-type-select').value;
    const conservation = document.getElementById('demand-conservation-select').value;
    const notes = document.getElementById('demand-notes').value.trim();

    if (!flavorId) {
      if (errorDiv) {
        errorDiv.innerText = 'Selecione obrigatoriamente um sabor da lista.';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    if (isNaN(plannedKg) || plannedKg <= 0) {
      if (errorDiv) {
        errorDiv.innerText = 'Informe uma quantidade pretendida válida maior que zero.';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    if (destinationKey === 'atacado' && !partnerId) {
      if (errorDiv) {
        errorDiv.innerText = 'Para o destino Atacado, selecione obrigatoriamente um Cliente / Parceiro.';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    try {
      const { data: activeVersion, error: vErr } = await supabase
        .from('formula_versions')
        .select('id')
        .eq('flavor_id', flavorId)
        .eq('status', 'active')
        .maybeSingle();

      if (vErr) {
        throw new Error(`Erro ao verificar formulação do sabor: ${vErr.message}`);
      }

      if (!activeVersion) {
        const selectedOption = document.querySelector(`#demand-flavor-select option[value="${flavorId}"]`);
        const flavorName = selectedOption ? selectedOption.textContent : 'selecionado';
        throw new Error(`O sabor "${flavorName}" não possui uma receita/formulação ATIVA. Por favor, acesse a tela "Cadastros & Fórmulas" e ative uma receita para este sabor.`);
      }

      await assertOpEditable(opId);

      const row = {
        flavor_id: flavorId,
        formula_version_id: activeVersion.id,
        destination_key: destinationKey,
        destination_partner_id: partnerId,
        requested_product_type: productType,
        requested_conservation: conservation,
        planned_kg: plannedKg,
        notes: notes || null
      };

      if (editId) {
        const { error: updateErr } = await supabase.from('production_demands').update(row).eq('id', editId);
        if (updateErr) throw updateErr;
        showNotification('Linha de demanda atualizada!', 'success');
      } else {
        const { error: insertErr } = await supabase.from('production_demands').insert({ production_order_id: opId, ...row });
        if (insertErr) throw insertErr;
        showNotification('Demanda adicionada com sucesso à OP!', 'success');
      }
      formContainer?.classList.add('hidden');
      loadOPs();
    } catch (err) {
      if (errorDiv) {
        errorDiv.innerText = err.message;
        errorDiv.classList.remove('hidden');
      } else {
        showNotification(err.message, 'error');
      }
    }
  });
}

async function loadOPs() {
  const container = document.getElementById('ops-list-container');
  if (!container) return;

  let query = supabase
    .from('production_orders')
    .select(`
      *,
      production_demands (
        id, flavor_id, planned_kg, destination_key, destination_partner_id, requested_product_type, requested_conservation, notes,
        flavors (name),
        partners (name),
        formula_versions (id, base_mass_pct, meat_profile_id, formula_ingredients (ratio_pct, unit, ingredients(name)))
      )
    `)
    .order('created_at', { ascending: false });

  // Aplicar filtro de data de produção conforme currentFilterMode
  if (currentFilterMode === 'day' && selectedFilterDate) {
    query = query.eq('production_date', selectedFilterDate);
  } else if (currentFilterMode === 'range' && selectedStartDate && selectedEndDate) {
    query = query.gte('production_date', selectedStartDate).lte('production_date', selectedEndDate);
  }

  const [
    { data: allOps, error },
    { data: totalsData },
    { data: statusData }
  ] = await Promise.all([
    query,
    supabase.from('vw_production_order_totals').select('*'),
    supabase.from('vw_production_order_status').select('*')
  ]);

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg font-bold">Erro ao carregar OPs: ${error.message}</div>`;
    return;
  }

  // Filtro por OP: opções vindas da lista carregada; no modo "op" não há filtro de data na consulta
  opOptions = buildOpOptions(allOps);
  // Sem nenhuma OP, o filtro padrão por OP não tem o que mostrar: volta para Visão Geral
  if (currentFilterMode === 'op' && !opOptions.length) {
    document.getElementById('plan-filter-all')?.click();
    return;
  }
  selectedOrderId = resolveSelectedOp(opOptions, selectedOrderId);
  refreshOpSelect('plan-op-select', opOptions, selectedOrderId);
  const ops = currentFilterMode === 'op' ? (allOps || []).filter(o => o.id === selectedOrderId) : allOps;
  lastLoadedOps = ops || [];

  if (!ops || ops.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'op' ? ' para a ordem de produção selecionada' :
                       currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
                       currentFilterMode === 'range' ? ` para o período de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` : '';
    container.appendChild(renderEmptyState({
      icon: 'calendar_today',
      title: 'Nenhuma Ordem de Produção Encontrada',
      description: `Não há OPs cadastradas${filterText}. Abra uma nova OP consolidada ou selecione outro filtro.`,
      actionText: 'Abrir Primeira OP',
      onAction: () => document.getElementById('add-op-btn')?.click()
    }));
    return;
  }

  const totalsMap = (totalsData || []).reduce((acc, t) => {
    acc[t.production_order_id] = t;
    return acc;
  }, {});

  const statusMap = (statusData || []).reduce((acc, s) => {
    acc[s.production_order_id] = s;
    return acc;
  }, {});

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      ${ops.map(op => {
        const totals = totalsMap[op.id] || {};
        const statusObj = statusMap[op.id] || {};
        const plannedKg = totals.planned_total_kg || 0;
        const producedKg = totals.produced_total_kg || 0;
        const opStatus = statusObj.status || 'draft';
        const generated = op.generated_at != null;

        return `
          <div class="bg-surface-card rounded-xl p-space-lg shadow-sm border border-border-subtle flex flex-col gap-space-md">
            <!-- Header OP -->
            <div class="flex flex-wrap items-center justify-between gap-space-md border-b border-border-subtle pb-space-md">
              <div class="flex items-center gap-space-md">
                <div class="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-bordeaux-primary font-bold">
                  <span class="material-symbols-outlined text-[24px]">precision_manufacturing</span>
                </div>
                <div>
                  <h3 class="font-headline-sm text-ink-text">${op.order_code}</h3>
                  <span class="text-xs font-bold text-text-muted">Data Produção: ${weekdayName(op.production_date)}, ${formatDate(op.production_date)} | Massa Pronta: ${formatDate(op.mass_ready_date)}</span>
                </div>
              </div>

              <div class="flex items-center gap-space-sm flex-wrap">
                <span class="px-3 py-1 rounded-full text-xs font-bold ${
                  opStatus === 'completed' ? 'bg-surface-container-low text-status-success' :
                  opStatus === 'in_production' ? 'bg-badge-warning-bg text-badge-warning-text' :
                  'bg-surface-canvas text-ink-text'
                }">Status: ${opStatus.toUpperCase()}</span>

                ${!generated ? `
                  <button class="edit-op-btn px-3 py-2 rounded-lg bg-surface-canvas text-bordeaux-primary text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-1" data-id="${op.id}">
                    <span class="material-symbols-outlined text-[18px]">edit</span> Editar OP
                  </button>
                  <button class="generate-orders-btn px-4 py-2 rounded-lg bg-bordeaux-primary text-on-primary font-title-md hover:bg-wine-deep transition-colors shadow-sm" data-id="${op.id}">
                    Gerar Ordens de Produção
                  </button>
                ` : `
                  <span class="px-3 py-1 rounded text-xs font-bold bg-surface-container-low text-status-success">Ordens Geradas ✓</span>
                  <button class="seasoning-batches-btn px-3 py-2 rounded-lg bg-surface-canvas text-bordeaux-primary text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-1" data-id="${op.id}">
                    <span class="material-symbols-outlined text-[18px]">blender</span> Bateladas de Massa-Base
                  </button>
                `}
              </div>
            </div>

            <!-- Resumo de Demandas -->
            <div class="flex flex-col gap-space-sm">
              <div class="flex items-center justify-between">
                <h4 class="font-title-md text-ink-text">Demandas da OP Consolidada</h4>
                <div class="flex items-center gap-3 flex-wrap justify-end">
                <button class="op-flavor-map-btn text-xs font-bold text-bordeaux-primary flex items-center gap-1 hover:underline" data-opid="${op.id}">
                  <span class="material-symbols-outlined text-[16px]">print</span> Mapa Sabor × Destino
                </button>
                ${!generated ? `
                <button class="demand-grid-btn text-xs font-bold text-bordeaux-primary flex items-center gap-1 hover:underline" data-opid="${op.id}">
                  <span class="material-symbols-outlined text-[16px]">grid_on</span> Lançar Pedido (Grade)
                </button>
                <button class="add-demand-btn text-xs font-bold text-bordeaux-primary flex items-center gap-1 hover:underline" data-opid="${op.id}">
                  <span class="material-symbols-outlined text-[16px]">add</span> Adicionar Linha de Demanda
                </button>
                ` : `
                <span class="text-xs font-bold text-text-muted flex items-center gap-1" title="Depois de geradas as ordens, a OP não pode mais ser alterada">
                  <span class="material-symbols-outlined text-[16px]">lock</span> OP travada
                </span>
                `}
                </div>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-left font-body-md">
                  <thead class="bg-surface-canvas text-ink-text font-title-md text-xs">
                    <tr>
                      <th class="py-2 px-3">Sabor</th>
                      <th class="py-2 px-3">Destino</th>
                      <th class="py-2 px-3">Tipo Solicitado</th>
                      <th class="py-2 px-3">Conservação</th>
                      <th class="py-2 px-3 text-right">Qtd Pretendida (kg)</th>
                      ${!generated ? '<th class="py-2 px-3 text-right">Ações</th>' : ''}
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle text-xs">
                    ${(op.production_demands || []).length === 0
                      ? `<tr><td colspan="${generated ? 5 : 6}" class="py-3 px-3 text-center text-text-muted">Nenhuma demanda lançada nesta OP.</td></tr>`
                      : (op.production_demands || []).map(d => `
                        <tr>
                          <td class="py-2 px-3 font-bold text-bordeaux-primary">${d.flavors?.name || 'Sabor Não Identificado'}</td>
                          <td class="py-2 px-3 uppercase">${d.destination_key}</td>
                          <td class="py-2 px-3 capitalize">${d.requested_product_type || '—'}</td>
                          <td class="py-2 px-3 capitalize">${d.requested_conservation || '—'}</td>
                          <td class="py-2 px-3 text-right font-bold">${formatWeight(d.planned_kg)}</td>
                          ${!generated ? `
                          <td class="py-2 px-3 text-right whitespace-nowrap">
                            <button class="edit-demand-btn p-1 rounded text-bordeaux-primary hover:bg-surface-container" title="Editar linha" data-opid="${op.id}" data-id="${d.id}">
                              <span class="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button class="delete-demand-btn p-1 rounded text-alert-critical hover:bg-surface-container" title="Excluir linha" data-opid="${op.id}" data-id="${d.id}">
                              <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                          ` : ''}
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="flex items-center justify-between bg-surface-canvas p-3 rounded-lg text-xs font-bold">
              <span>Total Planejado OP: ${formatWeight(plannedKg)}</span>
              <span>Total Produção Real: ${formatWeight(producedKg)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Listener para gerar ordens de produção
  container.querySelectorAll('.generate-orders-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      const opId = button.dataset.id;
      if (button.disabled) return;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.classList.add('opacity-60', 'cursor-wait');
      button.textContent = 'Gerando ordens...';
      try {
        await processGenerateOrders(opId);
      } finally {
        // Se a tela for recarregada pelo loadOPs(), este botão já terá sido substituído
        if (button.isConnected) {
          button.disabled = false;
          button.classList.remove('opacity-60', 'cursor-wait');
          button.textContent = originalLabel;
        }
      }
    });
  });

  // Atalho para as bateladas de massa-base da mexedeira desta OP (tela de Separação)
  container.querySelectorAll('.seasoning-batches-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      showSeasoningForOrder(e.currentTarget.dataset.id);
      navigateTo('separation');
    });
  });

  // Mapa Sabor × Destino de uma OP só
  container.querySelectorAll('.op-flavor-map-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const op = ops.find(o => o.id === e.currentTarget.dataset.opid);
      if (op) openFlavorDestinationMap([op], `OP ${op.order_code} · Produção ${weekdayName(op.production_date)}, ${formatDate(op.production_date)}`);
    });
  });

  // Listener para abrir modal de adicionar demanda
  container.querySelectorAll('.add-demand-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const opId = e.currentTarget.dataset.opid;
      await openAddDemandModal(opId);
    });
  });

  // Lançamento em grade: destino uma vez e kg por sabor × tipo/conservação
  container.querySelectorAll('.demand-grid-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const op = ops.find(o => o.id === e.currentTarget.dataset.opid);
      if (!op) return;
      await openDemandGrid({
        production_order_id: op.id,
        order_code: op.order_code,
        demands: op.production_demands || [],
        assertOpEditable,
        onSaved: async () => {
          loadOPs();
          const { data, error } = await supabase
            .from('production_demands')
            .select('id, flavor_id, planned_kg, destination_key, destination_partner_id, requested_product_type, requested_conservation, notes')
            .eq('production_order_id', op.id);
          if (error) {
            showNotification(`Erro ao recarregar demandas: ${error.message}`, 'error');
            return null;
          }
          return data;
        }
      });
    });
  });

  // Edição da OP (só aparece enquanto as ordens não foram geradas)
  container.querySelectorAll('.edit-op-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const op = ops.find(o => o.id === e.currentTarget.dataset.id);
      if (op) openEditOpForm(op);
    });
  });

  container.querySelectorAll('.edit-demand-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const { opid, id } = e.currentTarget.dataset;
      const demand = ops.find(o => o.id === opid)?.production_demands?.find(d => d.id === id);
      if (demand) await openAddDemandModal(opid, demand);
    });
  });

  container.querySelectorAll('.delete-demand-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const { opid, id } = e.currentTarget.dataset;
      const demand = ops.find(o => o.id === opid)?.production_demands?.find(d => d.id === id);
      if (!confirm(`Excluir a linha de ${demand?.flavors?.name || 'demanda'} (${formatWeight(demand?.planned_kg)})?`)) return;
      try {
        await assertOpEditable(opid);
        const { error } = await supabase.from('production_demands').delete().eq('id', id);
        if (error) throw error;
        showNotification('Linha de demanda excluída.', 'success');
      } catch (err) {
        showNotification(`Erro ao excluir linha: ${err.message}`, 'error');
      }
      loadOPs();
    });
  });
}

const LOCKED_MSG = 'As ordens desta OP já foram geradas (ou a OP está cancelada); ela não pode mais ser alterada.';

// Confere no banco, antes de gravar, se a OP ainda está em rascunho (ordens não geradas)
async function assertOpEditable(production_order_id) {
  const { data, error } = await supabase
    .from('production_orders')
    .select('generated_at, canceled_at')
    .eq('id', production_order_id)
    .single();
  if (error) throw error;
  if (data.generated_at || data.canceled_at) {
    loadOPs();
    throw new Error(LOCKED_MSG);
  }
}

function openEditOpForm(op) {
  opCodeEdited = true; // mantém o código atual mesmo se a data mudar
  document.getElementById('op-edit-id').value = op.id;
  document.getElementById('op-form-title').textContent = `Editar Ordem de Produção ${op.order_code}`;
  document.getElementById('op-submit-btn').textContent = 'Salvar Alterações';
  document.getElementById('op-code').value = op.order_code;
  document.getElementById('op-date').value = op.production_date;
  document.getElementById('op-mass-ready-date').value = op.mass_ready_date || '';
  document.getElementById('op-code-hint').textContent = `${weekdayName(op.production_date)}`;
  document.getElementById('demand-form-container')?.classList.add('hidden');
  const formContainer = document.getElementById('op-form-container');
  formContainer?.classList.remove('hidden');
  formContainer?.scrollIntoView({ behavior: 'smooth' });
}

async function openAddDemandModal(production_order_id, demand = null) {
  const formContainer = document.getElementById('demand-form-container');
  const errorDiv = document.getElementById('demand-form-error');
  const flavorSelect = document.getElementById('demand-flavor-select');
  const partnerSelect = document.getElementById('demand-partner-select');

  if (errorDiv) errorDiv.classList.add('hidden');
  document.getElementById('demand-op-id').value = production_order_id;
  document.getElementById('demand-edit-id').value = demand?.id || '';
  document.getElementById('demand-form-title').textContent = demand ? 'Editar Linha de Demanda da OP' : 'Adicionar Linha de Demanda à OP';
  document.getElementById('demand-submit-btn').textContent = demand ? 'Salvar Alterações' : 'Salvar Demanda';
  document.getElementById('demand-planned-kg').value = demand ? demand.planned_kg : '';
  document.getElementById('demand-notes').value = demand?.notes || '';

  const { data: flavors, error: fErr } = await supabase
    .from('flavors')
    .select('id, name')
    .eq('active', true)
    .order('name');

  if (fErr) {
    showNotification(`Erro ao consultar sabores: ${fErr.message}`, 'error');
    return;
  }

  if (!flavors || flavors.length === 0) {
    showNotification('Ainda não há sabores cadastrados. Por favor, cadastre os sabores na tela "Cadastros & Fórmulas" antes de adicionar demandas.', 'warning');
    return;
  }

  flavorSelect.innerHTML = `
    <option value="" disabled selected>Selecione o sabor</option>
    ${flavors.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
  `;

  const { data: partners } = await supabase
    .from('partners')
    .select('id, name, partner_type')
    .eq('active', true)
    .order('name');

  partnerSelect.innerHTML = `
    <option value="">Geral / Nenhum Parceiro Específico</option>
    ${(partners || []).map(p => `<option value="${p.id}">${p.name} (${p.partner_type.toUpperCase()})</option>`).join('')}
  `;

  const destSelect = document.getElementById('demand-destination-select');
  destSelect.value = demand?.destination_key || 'emporio';
  destSelect.dispatchEvent(new Event('change')); // ajusta a obrigatoriedade do parceiro
  document.getElementById('demand-product-type-select').value = demand?.requested_product_type || 'linguica';
  document.getElementById('demand-conservation-select').value = demand?.requested_conservation || 'resfriado';
  if (demand) {
    flavorSelect.value = demand.flavor_id;
    partnerSelect.value = demand.destination_partner_id || '';
  }

  document.getElementById('op-form-container')?.classList.add('hidden');
  closeDemandGrid();
  formContainer?.classList.remove('hidden');
  formContainer?.scrollIntoView({ behavior: 'smooth' });
}

// ----------------------------------------------------
// LÓGICA DE GERAÇÃO DE ORDENS
// ----------------------------------------------------
// Trava local contra cliques repetidos enquanto a geração está em andamento
const generatingOrders = new Set();

// Trabalha em gramas inteiras para não criar bateladas/porções de "0,000 kg" por erro de ponto flutuante
const toGrams = kg => Math.round(Number(kg) * 1000);
const fromGrams = g => g / 1000;

async function processGenerateOrders(production_order_id) {
  if (generatingOrders.has(production_order_id)) return;
  generatingOrders.add(production_order_id);

  // Tudo o que for criado fica registrado para ser desfeito se algo falhar no meio
  const created = { batchIds: [], portionIds: [], claimed: false };

  try {
    // 1. Pré-requisitos (antes de qualquer gravação)
    const { data: demands, error: dErr } = await supabase
      .from('production_demands')
      .select('*, formula_versions(id, status, base_mass_pct, meat_profile_id)')
      .eq('production_order_id', production_order_id);

    if (dErr) throw dErr;
    if (!demands || demands.length === 0) {
      showNotification('Adicione pelo menos uma demanda à OP antes de gerar ordens.', 'error');
      return;
    }
    const semFormula = demands.filter(d => !d.formula_versions);
    if (semFormula.length > 0) {
      throw new Error('Há demandas sem formulação vinculada (ou sem permissão de leitura da formulação). Revise as demandas antes de gerar.');
    }

    const { count: existingBatches, error: bcErr } = await supabase
      .from('mass_base_batches')
      .select('id', { count: 'exact', head: true })
      .eq('production_order_id', production_order_id);
    if (bcErr) throw bcErr;
    if (existingBatches > 0) {
      showNotification('Esta OP já possui bateladas geradas. Nada foi alterado.', 'error');
      loadOPs();
      return;
    }

    // Insumos de cada versão de formulação usada (uma consulta só)
    const formulaIds = [...new Set(demands.map(d => d.formula_version_id))];
    const { data: allFormulaIngredients, error: fiErr } = await supabase
      .from('formula_ingredients')
      .select('formula_version_id, ingredient_id, ratio_pct, unit')
      .in('formula_version_id', formulaIds);
    if (fiErr) throw fiErr;
    const ingredientsByFormula = {};
    (allFormulaIngredients || []).forEach(fi => {
      (ingredientsByFormula[fi.formula_version_id] ||= []).push(fi);
    });

    // 2. Trava no banco: só uma geração por OP. Se outro clique/usuário já marcou, nenhuma linha volta.
    const { data: claimedRows, error: claimErr } = await supabase
      .from('production_orders')
      .update({ generated_at: new Date().toISOString() })
      .eq('id', production_order_id)
      .is('generated_at', null)
      .is('canceled_at', null)
      .select('id');
    if (claimErr) throw claimErr;
    if (!claimedRows || claimedRows.length === 0) {
      showNotification('As ordens desta OP já foram geradas (ou a OP está cancelada). Nada foi duplicado.', 'error');
      loadOPs();
      return;
    }
    created.claimed = true;

    // 3. Bateladas de massa-base por perfil de carne, até 150 kg cada
    const profileGrams = {};
    demands.forEach(d => {
      const profileId = d.formula_versions.meat_profile_id;
      const baseG = toGrams(Number(d.planned_kg) * Number(d.formula_versions.base_mass_pct) / 100);
      profileGrams[profileId] = (profileGrams[profileId] || 0) + baseG;
    });

    const MAX_BATCH_G = 150000;
    const batchRows = [];
    for (const [profileId, totalG] of Object.entries(profileGrams)) {
      let remaining = totalG;
      let batchNo = 1;
      while (remaining > 0) {
        const sizeG = Math.min(remaining, MAX_BATCH_G);
        batchRows.push({
          production_order_id,
          meat_profile_id: profileId,
          batch_no: batchNo,
          planned_total_kg: fromGrams(sizeG),
          status: 'planned'
        });
        remaining -= sizeG;
        batchNo++;
      }
    }

    if (batchRows.length > 0) {
      const { data: insertedBatches, error: bErr } = await supabase
        .from('mass_base_batches')
        .insert(batchRows)
        .select('id');
      if (bErr) throw new Error(`Erro ao criar bateladas: ${bErr.message}`);
      created.batchIds = (insertedBatches || []).map(b => b.id);
    }

    // 4. Uma porção por sabor + tipo de produto + conservação (+ versão de formulação):
    //    o mesmo sabor com tipos diferentes não é misturado no embutimento.
    const TYPE_ORDER = ['linguica', 'massa', 'manta', 'granel', 'hamburguer'];
    const groups = {};
    demands.forEach(d => {
      const key = `${d.flavor_id}|${d.requested_product_type || ''}|${d.requested_conservation || ''}|${d.formula_version_id}`;
      if (!groups[key]) {
        groups[key] = {
          flavorId: d.flavor_id,
          formulaVersionId: d.formula_version_id,
          type: d.requested_product_type || null,
          conservation: d.requested_conservation || null,
          totalG: 0
        };
      }
      groups[key].totalG += toGrams(d.planned_kg);
    });

    const sortedGroups = Object.values(groups).sort((x, y) =>
      String(x.flavorId).localeCompare(String(y.flavorId)) ||
      (TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type)) ||
      String(x.conservation).localeCompare(String(y.conservation)));

    const portionCountByFlavor = {};
    for (const g of sortedGroups) {
      const portionNo = (portionCountByFlavor[g.flavorId] || 0) + 1;
      portionCountByFlavor[g.flavorId] = portionNo;
      const portionKg = fromGrams(g.totalG);

      const { data: portion, error: pErr } = await supabase.from('production_portions').insert({
        production_order_id,
        flavor_id: g.flavorId,
        portion_no: portionNo,
        planned_kg: portionKg,
        product_type: g.type,
        conservation: g.conservation
      }).select('id').single();
      if (pErr) throw new Error(`Erro ao criar porção: ${pErr.message}`);
      created.portionIds.push(portion.id);

      const formulaIngredients = ingredientsByFormula[g.formulaVersionId] || [];
      if (formulaIngredients.length > 0) {
        const portionIngredientRows = formulaIngredients.map(fi => ({
          portion_id: portion.id,
          ingredient_id: fi.ingredient_id,
          // 3 casas (g quando a unidade é kg); nunca 0, pois o banco exige quantidade > 0
          requested_quantity: Math.max(0.001, Math.round(portionKg * Number(fi.ratio_pct) * 10) / 1000),
          unit: fi.unit,
          status: 'pending'
        }));
        const { error: liErr } = await supabase.from('portion_ingredient_lines').insert(portionIngredientRows);
        if (liErr) throw new Error(`Erro ao criar linhas de insumo: ${liErr.message}`);
      }

      const { error: rErr } = await supabase.from('process_runs').insert([
        { portion_id: portion.id, stage: 'embutimento', status: 'pending' },
        { portion_id: portion.id, stage: 'vacuo', status: 'pending' },
        { portion_id: portion.id, stage: 'rotulagem', status: 'pending' }
      ]);
      if (rErr) throw new Error(`Erro ao criar etapas da porção: ${rErr.message}`);
    }

    showNotification('Ordens de Produção, Bateladas e Porções geradas com sucesso! Veja as bateladas da mexedeira em "Bateladas de Massa-Base".', 'success');
    loadOPs();
  } catch (err) {
    // Desfaz o que foi criado nesta tentativa (linhas de insumo e etapas saem em cascata com a porção)
    const rollbackErrors = [];
    if (created.portionIds.length > 0) {
      const { error } = await supabase.from('production_portions').delete().in('id', created.portionIds);
      if (error) rollbackErrors.push(`porções: ${error.message}`);
    }
    if (created.batchIds.length > 0) {
      const { error } = await supabase.from('mass_base_batches').delete().in('id', created.batchIds);
      if (error) rollbackErrors.push(`bateladas: ${error.message}`);
    }
    if (created.claimed) {
      const { error } = await supabase.from('production_orders').update({ generated_at: null }).eq('id', production_order_id);
      if (error) rollbackErrors.push(`OP: ${error.message}`);
    }

    const rollbackMsg = rollbackErrors.length > 0
      ? ` ATENÇÃO: não foi possível desfazer tudo (${rollbackErrors.join('; ')}). Avise o administrador antes de tentar de novo.`
      : (created.claimed ? ' Nada foi gravado; você pode tentar novamente.' : '');
    showNotification(`Erro ao gerar ordens: ${err.message}.${rollbackMsg}`, 'error');
    loadOPs();
  } finally {
    generatingOrders.delete(production_order_id);
  }
}
