import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Planejamento & Ordens de Produção</h1>
          <p class="font-body-md text-body-md text-text-muted">Gestão de pedidos de carne, OPs consolidadas, demandas por canal, cálculo de receitas e geração de bateladas/porções.</p>
        </div>
        <div class="flex items-center gap-space-sm flex-wrap">
          <button id="add-meat-order-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-card hover:bg-surface-container-low text-bordeaux-primary border border-border-subtle font-title-md flex items-center gap-2 transition-colors">
            <span class="material-symbols-outlined text-[20px]">shopping_cart</span>
            <span>Novo Pedido de Carne</span>
          </button>
          <button id="add-op-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[20px]">add_circle</span>
            <span>Abrir Nova OP</span>
          </button>
        </div>
      </div>

      <!-- Abas Internas -->
      <div class="bg-surface-card rounded-xl p-1.5 shadow-sm flex items-center gap-1 overflow-x-auto">
        <button id="tab-ops" class="plan-tab flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bordeaux-primary text-on-primary font-label-md shadow-sm whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">assignment</span>
          <span>Ordens de Produção (OP)</span>
        </button>
        <button id="tab-meat-orders" class="plan-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">inventory</span>
          <span>Recebimento de Carne</span>
        </button>
      </div>

      <div id="planning-tab-content"></div>
    </div>
  `;

  setupTabs();
  renderOPsTab();
}

function setupTabs() {
  const tabOps = document.getElementById('tab-ops');
  const tabMeat = document.getElementById('tab-meat-orders');

  tabOps?.addEventListener('click', () => {
    tabOps.className = 'plan-tab flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bordeaux-primary text-on-primary font-label-md shadow-sm whitespace-nowrap';
    if (tabMeat) tabMeat.className = 'plan-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap';
    renderOPsTab();
  });

  tabMeat?.addEventListener('click', () => {
    tabMeat.className = 'plan-tab flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bordeaux-primary text-on-primary font-label-md shadow-sm whitespace-nowrap';
    if (tabOps) tabOps.className = 'plan-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap';
    renderMeatOrdersTab();
  });
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

  loadOPs();
}

async function loadOPs() {
  const container = document.getElementById('ops-list-container');
  if (!container) return;

  const { data: ops, error } = await supabase
    .from('production_orders')
    .select(`
      *,
      vw_production_order_totals (planned_total_kg, produced_total_kg),
      vw_production_order_status (status),
      production_demands (
        id, planned_kg, destination_key, requested_product_type, requested_conservation,
        flavors (name),
        formula_versions (id, base_mass_pct, meat_profile_id, formula_ingredients (ratio_pct, unit, ingredients(name)))
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar OPs: ${error.message}</div>`;
    return;
  }

  if (!ops || ops.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'calendar_today',
      title: 'Nenhuma Ordem de Produção Aberta',
      description: 'Abra uma nova OP consolidada para adicionar demandas por sabor e gerar bateladas.',
      actionText: 'Abrir Primeira OP',
      onAction: () => document.getElementById('add-op-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      ${ops.map(op => {
        const plannedKg = op.vw_production_order_totals?.[0]?.planned_total_kg || 0;
        const producedKg = op.vw_production_order_totals?.[0]?.produced_total_kg || 0;
        const opStatus = op.vw_production_order_status?.[0]?.status || 'draft';
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
                          <td class="py-2 px-3 font-bold text-bordeaux-primary">${d.flavors?.name}</td>
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

  // Listener para abrir modal/prompt de adicionar demanda
  container.querySelectorAll('.add-demand-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const opId = e.currentTarget.dataset.opid;
      await promptAddDemand(opId);
    });
  });
}

async function promptAddDemand(production_order_id) {
  const { data: flavors } = await supabase.from('flavors').select('id, name').eq('active', true);
  const { data: partners } = await supabase.from('partners').select('id, name, partner_type').eq('active', true);

  if (!flavors || flavors.length === 0) {
    showNotification('Cadastre sabores ativos antes de lançar demandas.', 'error');
    return;
  }

  // Buscar versão ativa para cada sabor
  const flavorId = flavors[0].id;
  const { data: activeVersion } = await supabase.from('formula_versions').select('id').eq('flavor_id', flavorId).eq('status', 'active').maybeSingle();

  if (!activeVersion) {
    showNotification(`O sabor ${flavors[0].name} não possui uma formulação ATIVA. Ative uma receita nos cadastros.`, 'error');
    return;
  }

  const planned_kg = parseFloat(prompt('Digite a quantidade pretendida em kg:', '50.00'));
  if (isNaN(planned_kg) || planned_kg <= 0) return;

  try {
    const { error } = await supabase.from('production_demands').insert({
      production_order_id,
      flavor_id: flavorId,
      formula_version_id: activeVersion.id,
      destination_key: 'emporio',
      planned_kg
    });
    if (error) throw error;
    showNotification('Demanda adicionada com sucesso!', 'success');
    loadOPs();
  } catch (err) {
    showNotification(`Erro ao adicionar demanda: ${err.message}`, 'error');
  }
}

// ----------------------------------------------------
// LÓGICA DE GERAÇÃO DE ORDENS (Bateladas <= 150kg, Porções <= 30kg)
// ----------------------------------------------------
async function processGenerateOrders(production_order_id) {
  try {
    // 1. Buscar demandas da OP
    const { data: demands, error: dErr } = await supabase
      .from('production_demands')
      .select('*, formula_versions(*, meat_profiles(*))')
      .eq('production_order_id', production_order_id);

    if (dErr) throw dErr;
    if (!demands || demands.length === 0) {
      showNotification('Adicione pelo menos uma demanda à OP antes de gerar ordens.', 'error');
      return;
    }

    // 2. Agrupar por perfil de carne para gerar Bateladas de Massa-Base (max 150 kg por batelada)
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

    // 3. Agrupar por Sabor para gerar Porções Operacionais de até 30 kg
    const flavorTotals = {};
    demands.forEach(d => {
      if (!flavorTotals[d.flavor_id]) flavorTotals[d.flavor_id] = 0;
      flavorTotals[d.flavor_id] += Number(d.planned_kg);
    });

    for (const [flavorId, totalKg] of Object.entries(flavorTotals)) {
      let remaining = totalKg;
      let portionNo = 1;

      while (remaining > 0) {
        const portionSize = Math.min(remaining, 30);
        const { data: portion, error: pErr } = await supabase.from('production_portions').insert({
          production_order_id,
          flavor_id: flavorId,
          portion_no: portionNo,
          planned_kg: portionSize
        }).select().single();

        if (pErr) throw pErr;

        // Gerar linhas de insumo por porção a partir da fórmula ativa
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

        // Criar process_runs para as 3 etapas da porção (Embutimento, Vácuo, Rotulagem)
        await supabase.from('process_runs').insert([
          { portion_id: portion.id, stage: 'embutimento', status: 'pending' },
          { portion_id: portion.id, stage: 'vacuo', status: 'pending' },
          { portion_id: portion.id, stage: 'rotulagem', status: 'pending' }
        ]);

        remaining -= portionSize;
        portionNo++;
      }
    }

    // 4. Marcar OP como gerada
    await supabase.from('production_orders').update({ generated_at: new Date().toISOString() }).eq('id', production_order_id);

    showNotification('Ordens de Produção, Bateladas e Porções geradas com sucesso!', 'success');
    loadOPs();
  } catch (err) {
    showNotification(`Erro ao gerar ordens: ${err.message}`, 'error');
  }
}

// ----------------------------------------------------
// 2. RECEBIMENTO DE CARNE
// ----------------------------------------------------
async function renderMeatOrdersTab() {
  const content = document.getElementById('planning-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div id="meat-order-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-ink-text">Registrar Pedido/Recebimento de Carne</h3>
        <form id="meat-order-form" class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Código do Pedido</label>
            <input type="text" id="meat-order-code" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: PED-CARNE-01">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Fornecedor</label>
            <input type="text" id="meat-supplier" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text" placeholder="Ex: Frigorífico Central">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Data do Pedido</label>
            <input type="date" id="meat-ordered-at" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
          </div>
          <div class="flex items-center gap-2 md:col-span-3 justify-end">
            <button type="button" id="meat-order-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar Registros</button>
          </div>
        </form>
      </div>

      <div id="meat-orders-list-container"></div>
    </div>
  `;

  document.getElementById('add-meat-order-btn')?.addEventListener('click', () => {
    document.getElementById('meat-order-code').value = `CARNE-${Math.floor(1000 + Math.random() * 9000)}`;
    document.getElementById('meat-ordered-at').value = new Date().toISOString().split('T')[0];
    document.getElementById('meat-order-form-container')?.classList.remove('hidden');
  });

  document.getElementById('meat-order-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('meat-order-form-container')?.classList.add('hidden');
  });

  document.getElementById('meat-order-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const order_code = document.getElementById('meat-order-code').value.trim();
    const supplier_name = document.getElementById('meat-supplier').value.trim();
    const ordered_at = document.getElementById('meat-ordered-at').value;

    try {
      const { error } = await supabase.from('meat_orders').insert({
        order_code,
        supplier_name,
        ordered_at
      });
      if (error) throw error;
      showNotification('Pedido de carne criado com sucesso!', 'success');
      document.getElementById('meat-order-form-container')?.classList.add('hidden');
      loadMeatOrders();
    } catch (err) {
      showNotification(`Erro ao criar pedido de carne: ${err.message}`, 'error');
    }
  });

  loadMeatOrders();
}

async function loadMeatOrders() {
  const container = document.getElementById('meat-orders-list-container');
  if (!container) return;

  const { data: orders, error } = await supabase.from('meat_orders').select('*, meat_order_lines(*)').order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar carne: ${error.message}</div>`;
    return;
  }

  if (!orders || orders.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'shopping_cart',
      title: 'Nenhum Pedido de Carne',
      description: 'Registre o recebimento de cortes suínos/bovinos e seus lotes para abastecer as OPs.',
      actionText: 'Novo Pedido de Carne',
      onAction: () => document.getElementById('add-meat-order-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
      ${orders.map(o => `
        <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-3">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <h3 class="font-headline-sm text-ink-text">${o.order_code}</h3>
              <span class="text-xs font-bold text-text-muted">${formatDate(o.ordered_at)}</span>
            </div>
            <span class="text-xs text-text-muted">Fornecedor: <strong>${o.supplier_name || 'Não informado'}</strong></span>

            <div class="p-3 bg-surface-canvas rounded-lg text-xs flex flex-col gap-1 mt-2">
              <span class="font-bold text-ink-text">Linhas de Cortes Recebidos:</span>
              ${(o.meat_order_lines || []).length === 0
                ? `<span class="text-text-muted">Nenhum corte adicionado ainda.</span>`
                : (o.meat_order_lines || []).map(line => `
                  <div class="flex justify-between font-medium text-ink-text">
                    <span>• ${line.cut_name} (Lote: ${line.lot_code || '—'}):</span>
                    <span class="font-bold text-bordeaux-primary">${formatWeight(line.quantity_received_kg)} / ${formatWeight(line.quantity_ordered_kg)}</span>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
