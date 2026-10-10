import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

let currentFilterMode = 'all'; // 'all', 'day', 'range'
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
}

function setupFilterControls() {
  const btnAll = document.getElementById('plan-filter-all');
  const btnDay = document.getElementById('plan-filter-day');
  const btnRange = document.getElementById('plan-filter-range');
  const dateControls = document.getElementById('plan-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;

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
        <h3 class="font-title-lg text-title-lg text-ink-text">Abrir Nova Ordem de Produção Consolidada</h3>
        <form id="op-form" class="flex flex-col gap-space-md">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Código da OP</label>
              <input type="text" id="op-code" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: OP-2026-001">
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
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Criar OP (Rascunho)</button>
          </div>
        </form>
      </div>

      <!-- Form/Modal para Adicionar Linha de Demanda -->
      <div id="demand-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Adicionar Linha de Demanda à OP</h3>
        <form id="demand-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="demand-op-id">

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

      <div id="ops-list-container"></div>
    </div>
  `;

  document.getElementById('add-op-btn')?.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const code = `OP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    document.getElementById('op-code').value = code;
    document.getElementById('op-date').value = today;
    document.getElementById('op-mass-ready-date').value = today;
    document.getElementById('op-form-container')?.classList.remove('hidden');
    document.getElementById('demand-form-container')?.classList.add('hidden');
  });

  document.getElementById('op-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('op-form-container')?.classList.add('hidden');
  });

  document.getElementById('op-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const order_code = document.getElementById('op-code').value.trim();
    const production_date = document.getElementById('op-date').value;
    const mass_ready_date = document.getElementById('op-mass-ready-date').value || production_date;

    try {
      const { error } = await supabase.from('production_orders').insert({
        order_code,
        production_date,
        mass_ready_date
      });
      if (error) throw error;
      showNotification('Ordem de Produção criada com sucesso!', 'success');
      document.getElementById('op-form-container')?.classList.add('hidden');
      loadOPs();
    } catch (err) {
      showNotification(`Erro ao criar OP: ${err.message}`, 'error');
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

      const { error: insertErr } = await supabase.from('production_demands').insert({
        production_order_id: opId,
        flavor_id: flavorId,
        formula_version_id: activeVersion.id,
        destination_key: destinationKey,
        destination_partner_id: partnerId,
        requested_product_type: productType,
        requested_conservation: conservation,
        planned_kg: plannedKg,
        notes: notes || null
      });

      if (insertErr) throw insertErr;

      showNotification('Demanda adicionada com sucesso à OP!', 'success');
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
        id, planned_kg, destination_key, requested_product_type, requested_conservation,
        flavors (name),
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
    { data: ops, error },
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

  if (!ops || ops.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
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
                  <span class="text-xs font-bold text-text-muted">Data Produção: ${formatDate(op.production_date)} | Massa Pronta: ${formatDate(op.mass_ready_date)}</span>
                </div>
              </div>

              <div class="flex items-center gap-space-sm flex-wrap">
                <span class="px-3 py-1 rounded-full text-xs font-bold ${
                  opStatus === 'completed' ? 'bg-surface-container-low text-status-success' :
                  opStatus === 'in_production' ? 'bg-badge-warning-bg text-badge-warning-text' :
                  'bg-surface-canvas text-ink-text'
                }">Status: ${opStatus.toUpperCase()}</span>

                ${!generated ? `
                  <button class="generate-orders-btn px-4 py-2 rounded-lg bg-bordeaux-primary text-on-primary font-title-md hover:bg-wine-deep transition-colors shadow-sm" data-id="${op.id}">
                    Gerar Ordens de Produção
                  </button>
                ` : `<span class="px-3 py-1 rounded text-xs font-bold bg-surface-container-low text-status-success">Ordens Geradas ✓</span>`}
              </div>
            </div>

            <!-- Resumo de Demandas -->
            <div class="flex flex-col gap-space-sm">
              <div class="flex items-center justify-between">
                <h4 class="font-title-md text-ink-text">Demandas da OP Consolidada</h4>
                <button class="add-demand-btn text-xs font-bold text-bordeaux-primary flex items-center gap-1 hover:underline" data-opid="${op.id}">
                  <span class="material-symbols-outlined text-[16px]">add</span> Adicionar Linha de Demanda
                </button>
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
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border-subtle text-xs">
                    ${(op.production_demands || []).length === 0
                      ? `<tr><td colspan="5" class="py-3 px-3 text-center text-text-muted">Nenhuma demanda lançada nesta OP.</td></tr>`
                      : (op.production_demands || []).map(d => `
                        <tr>
                          <td class="py-2 px-3 font-bold text-bordeaux-primary">${d.flavors?.name || 'Sabor Não Identificado'}</td>
                          <td class="py-2 px-3 uppercase">${d.destination_key}</td>
                          <td class="py-2 px-3 capitalize">${d.requested_product_type || '—'}</td>
                          <td class="py-2 px-3 capitalize">${d.requested_conservation || '—'}</td>
                          <td class="py-2 px-3 text-right font-bold">${formatWeight(d.planned_kg)}</td>
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
      const opId = e.currentTarget.dataset.id;
      await processGenerateOrders(opId);
    });
  });

  // Listener para abrir modal de adicionar demanda
  container.querySelectorAll('.add-demand-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const opId = e.currentTarget.dataset.opid;
      await openAddDemandModal(opId);
    });
  });
}

async function openAddDemandModal(production_order_id) {
  const formContainer = document.getElementById('demand-form-container');
  const errorDiv = document.getElementById('demand-form-error');
  const flavorSelect = document.getElementById('demand-flavor-select');
  const partnerSelect = document.getElementById('demand-partner-select');

  if (errorDiv) errorDiv.classList.add('hidden');
  document.getElementById('demand-op-id').value = production_order_id;
  document.getElementById('demand-planned-kg').value = '';
  document.getElementById('demand-notes').value = '';

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

  document.getElementById('op-form-container')?.classList.add('hidden');
  formContainer?.classList.remove('hidden');
  formContainer?.scrollIntoView({ behavior: 'smooth' });
}

// ----------------------------------------------------
// LÓGICA DE GERAÇÃO DE ORDENS
// ----------------------------------------------------
async function processGenerateOrders(production_order_id) {
  try {
    const { data: demands, error: dErr } = await supabase
      .from('production_demands')
      .select('*, formula_versions(*, meat_profiles(*))')
      .eq('production_order_id', production_order_id);

    if (dErr) throw dErr;
    if (!demands || demands.length === 0) {
      showNotification('Adicione pelo menos uma demanda à OP antes de gerar ordens.', 'error');
      return;
    }

    const profileTotals = {};
    demands.forEach(d => {
      const profileId = d.formula_versions.meat_profile_id;
      const basePct = Number(d.formula_versions.base_mass_pct) / 100;
      const baseMassKg = Number(d.planned_kg) * basePct;

      if (!profileTotals[profileId]) profileTotals[profileId] = 0;
      profileTotals[profileId] += baseMassKg;
    });

    for (const [profileId, totalMassKg] of Object.entries(profileTotals)) {
      let remaining = totalMassKg;
      let batchNo = 1;

      while (remaining > 0) {
        const batchSize = Math.min(remaining, 150);
        await supabase.from('mass_base_batches').insert({
          production_order_id,
          meat_profile_id: profileId,
          batch_no: batchNo,
          planned_total_kg: batchSize,
          status: 'planned'
        });
        remaining -= batchSize;
        batchNo++;
      }
    }

    const flavorTotals = {};
    demands.forEach(d => {
      if (!flavorTotals[d.flavor_id]) flavorTotals[d.flavor_id] = 0;
      flavorTotals[d.flavor_id] += Number(d.planned_kg);
    });

    for (const [flavorId, totalKg] of Object.entries(flavorTotals)) {
      let remaining = totalKg;
      let portionNo = 1;

      while (remaining > 0) {
        const portionSize = remaining;
        const { data: portion, error: pErr } = await supabase.from('production_portions').insert({
          production_order_id,
          flavor_id: flavorId,
          portion_no: portionNo,
          planned_kg: portionSize
        }).select().single();

        if (pErr) throw pErr;

        const activeDemand = demands.find(d => d.flavor_id === flavorId);
        if (activeDemand) {
          const { data: formulaIngredients } = await supabase
            .from('formula_ingredients')
            .select('*')
            .eq('formula_version_id', activeDemand.formula_version_id);

          if (formulaIngredients) {
            const portionIngredientRows = formulaIngredients.map(fi => ({
              portion_id: portion.id,
              ingredient_id: fi.ingredient_id,
              requested_quantity: (portionSize * Number(fi.ratio_pct)) / 100,
              unit: fi.unit,
              status: 'pending'
            }));
            await supabase.from('portion_ingredient_lines').insert(portionIngredientRows);
          }
        }

        await supabase.from('process_runs').insert([
          { portion_id: portion.id, stage: 'embutimento', status: 'pending' },
          { portion_id: portion.id, stage: 'vacuo', status: 'pending' },
          { portion_id: portion.id, stage: 'rotulagem', status: 'pending' }
        ]);

        remaining -= portionSize;
        portionNo++;
      }
    }

    await supabase.from('production_orders').update({ generated_at: new Date().toISOString() }).eq('id', production_order_id);

    showNotification('Ordens de Produção, Bateladas e Porções geradas com sucesso!', 'success');
    loadOPs();
  } catch (err) {
    showNotification(`Erro ao gerar ordens: ${err.message}`, 'error');
  }
}
