import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Pedidos & Expedição (Separação por cliente, vínculo de lotes e transições de status)
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Pedidos & Expedição</h1>
          <p class="font-body-md text-body-md text-text-muted">Gestão de pedidos de saída, separação por lote, fila para faturamento e expedição/entrega aos clientes.</p>
        </div>
        <button id="add-shipment-order-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm">
          <span class="material-symbols-outlined text-[20px]">add_circle</span>
          <span>Criar Pedido de Saída</span>
        </button>
      </div>

      <!-- Form para Criar Pedido de Saída -->
      <div id="shipment-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Criar Novo Pedido de Saída / Expedição</h3>
        <form id="shipment-form" class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text" for="shipment-code">Código do Pedido</label>
            <input type="text" id="shipment-code" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: PED-2026-001">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text" for="shipment-customer-id">Cliente / Parceiro</label>
            <select id="shipment-customer-id" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text"></select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text" for="shipment-date">Data do Pedido</label>
            <input type="date" id="shipment-date" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
          </div>

          <div class="flex items-center gap-2 md:col-span-3 justify-end">
            <button type="button" id="shipment-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar Pedido</button>
          </div>
        </form>
      </div>

      <!-- Form/Modal para Adicionar Item/Linha ao Pedido de Saída -->
      <div id="shipment-line-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Adicionar Item ao Pedido de Saída</h3>
        <form id="shipment-line-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="line-shipment-order-id">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <!-- Selección de Sabor Obrigatória -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold" for="line-flavor-select">Sabor <span class="text-alert-critical">*</span></label>
              <select id="line-flavor-select" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold focus:outline-none focus:border-bordeaux-primary">
                <option value="" disabled selected>Selecione o sabor</option>
              </select>
            </div>

            <!-- Quantidade Solicitada em kg -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold" for="line-requested-kg">Quantidade Solicitada (kg) <span class="text-alert-critical">*</span></label>
              <input type="number" step="0.001" min="0.001" id="line-requested-kg" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: 20.000">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <!-- Tipo de Produto -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="line-product-type">Tipo de Produto</label>
              <select id="line-product-type" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
                <option value="linguica" selected>Linguiça</option>
                <option value="manta">Manta</option>
                <option value="massa">Massa</option>
                <option value="granel">Granel</option>
                <option value="hamburguer">Hambúrguer</option>
              </select>
            </div>

            <!-- Conservação -->
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text" for="line-conservation">Conservação</label>
              <select id="line-conservation" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
                <option value="resfriado" selected>Resfriado</option>
                <option value="congelado">Congelado</option>
              </select>
            </div>
          </div>

          <div id="shipment-line-error" class="hidden p-3 rounded-lg bg-badge-error-bg text-badge-error-text text-xs font-bold"></div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="line-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Adicionar Item</button>
          </div>
        </form>
      </div>

      <!-- Modal para Separar Item p/ NF (Confirmar Qtd Real Separada) -->
      <div id="separate-line-modal-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Separar Item para NF (Faturamento)</h3>
        <p class="font-body-md text-body-md text-text-muted">Informe a quantidade real pesada/separada para este item do pedido antes de enviar à fila de faturamento.</p>

        <form id="separate-line-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="separate-line-id">
          <input type="hidden" id="separate-requested-kg">

          <div class="bg-surface-canvas p-space-md rounded-lg flex flex-col gap-1 border border-border-subtle">
            <span class="font-body-md text-body-md text-text-muted">Item Solicitado: <strong id="separate-flavor-title" class="text-ink-text font-bold">Sabor</strong></span>
            <span class="font-body-md text-body-md text-text-muted">Quantidade Solicitada no Pedido: <strong id="separate-requested-label" class="text-bordeaux-primary font-bold">0,000 kg</strong></span>
          </div>

          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text font-bold" for="separate-actual-kg">Quantidade Real Separada (kg) <span class="text-alert-critical">*</span></label>
            <input type="number" step="0.001" min="0.001" id="separate-actual-kg" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold text-lg focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: 19.850">
            <span class="text-xs text-text-muted">Pese os pacotes/caixas reais e digite o valor exato separado para a nota fiscal.</span>
          </div>

          <div id="separate-line-error" class="hidden p-3 rounded-lg bg-badge-error-bg text-badge-error-text text-xs font-bold"></div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="separate-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px]">check_circle</span>
              <span>Confirmar Separação p/ NF</span>
            </button>
          </div>
        </form>
      </div>

      <div id="shipments-list-container"></div>
    </div>
  `;

  document.getElementById('add-shipment-order-btn')?.addEventListener('click', async () => {
    await populateShipmentCustomers();
    document.getElementById('shipment-code').value = `PED-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    document.getElementById('shipment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('shipment-line-form-container')?.classList.add('hidden');
    document.getElementById('separate-line-modal-container')?.classList.add('hidden');
    document.getElementById('shipment-form-container')?.classList.remove('hidden');
  });

  document.getElementById('shipment-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('shipment-form-container')?.classList.add('hidden');
  });

  document.getElementById('shipment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const order_code = document.getElementById('shipment-code').value.trim();
    const customer_id = document.getElementById('shipment-customer-id').value;
    const requested_at = document.getElementById('shipment-date').value;

    try {
      const { error } = await supabase.from('shipment_orders').insert({
        order_code,
        customer_id,
        requested_at
      });
      if (error) throw error;
      showNotification('Pedido de saída criado com sucesso!', 'success');
      document.getElementById('shipment-form-container')?.classList.add('hidden');
      loadShipmentOrders();
    } catch (err) {
      showNotification(`Erro ao criar pedido de saída: ${err.message}`, 'error');
    }
  });

  setupShipmentLineForm();
  setupSeparationModalForm();
  loadShipmentOrders();
}

function setupShipmentLineForm() {
  const cancelBtn = document.getElementById('line-cancel-btn');
  const formContainer = document.getElementById('shipment-line-form-container');
  const form = document.getElementById('shipment-line-form');
  const errorDiv = document.getElementById('shipment-line-error');

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv?.classList.add('hidden');

    const orderId = document.getElementById('line-shipment-order-id').value;
    const flavorId = document.getElementById('line-flavor-select').value;
    const requestedKg = parseFloat(document.getElementById('line-requested-kg').value);
    const productType = document.getElementById('line-product-type').value;
    const conservation = document.getElementById('line-conservation').value;

    if (!flavorId) {
      if (errorDiv) {
        errorDiv.innerText = 'Selecione obrigatoriamente um sabor da lista.';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    if (isNaN(requestedKg) || requestedKg <= 0) {
      if (errorDiv) {
        errorDiv.innerText = 'Informe uma quantidade solicitada válida maior que zero.';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    try {
      const { error } = await supabase.from('shipment_lines').insert({
        shipment_order_id: orderId,
        flavor_id: flavorId,
        product_type: productType,
        conservation: conservation,
        requested_kg: requestedKg,
        separated_kg: 0,
        status: 'pending'
      });

      if (error) throw error;

      showNotification('Item adicionado ao pedido com sucesso!', 'success');
      formContainer?.classList.add('hidden');
      loadShipmentOrders();
    } catch (err) {
      if (errorDiv) {
        errorDiv.innerText = err.message;
        errorDiv.classList.remove('hidden');
      } else {
        showNotification(`Erro ao adicionar item: ${err.message}`, 'error');
      }
    }
  });
}

function setupSeparationModalForm() {
  const cancelBtn = document.getElementById('separate-cancel-btn');
  const formContainer = document.getElementById('separate-line-modal-container');
  const form = document.getElementById('separate-line-form');
  const errorDiv = document.getElementById('separate-line-error');

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv?.classList.add('hidden');

    const lineId = document.getElementById('separate-line-id').value;
    const requestedKg = parseFloat(document.getElementById('separate-requested-kg').value);
    const actualSeparatedKg = parseFloat(document.getElementById('separate-actual-kg').value);

    if (isNaN(actualSeparatedKg) || actualSeparatedKg <= 0) {
      if (errorDiv) {
        errorDiv.innerText = 'Informe a quantidade real separada em kg maior que zero.';
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    if (actualSeparatedKg > requestedKg) {
      if (errorDiv) {
        errorDiv.innerText = `A quantidade separada (${formatWeight(actualSeparatedKg)}) não pode exceder a quantidade solicitada no pedido (${formatWeight(requestedKg)}).`;
        errorDiv.classList.remove('hidden');
      }
      return;
    }

    try {
      const { error } = await supabase.from('shipment_lines').update({
        separated_kg: actualSeparatedKg,
        status: 'separated_for_invoice'
      }).eq('id', lineId);

      if (error) throw error;

      showNotification(`Item separado com sucesso (${formatWeight(actualSeparatedKg)}) e enviado para faturamento!`, 'success');
      formContainer?.classList.add('hidden');
      loadShipmentOrders();
    } catch (err) {
      if (errorDiv) {
        errorDiv.innerText = err.message;
        errorDiv.classList.remove('hidden');
      } else {
        showNotification(`Erro ao registrar separação: ${err.message}`, 'error');
      }
    }
  });
}

async function openSeparateLineModal(line) {
  const formContainer = document.getElementById('separate-line-modal-container');
  const errorDiv = document.getElementById('separate-line-error');

  if (errorDiv) errorDiv.classList.add('hidden');

  document.getElementById('separate-line-id').value = line.id;
  document.getElementById('separate-requested-kg').value = line.requested_kg;
  document.getElementById('separate-flavor-title').innerText = line.flavors?.name || 'Sabor';
  document.getElementById('separate-requested-label').innerText = formatWeight(line.requested_kg);

  // Preencher campo com o valor já separado ou pré-preencher com solicitado
  const defaultVal = line.separated_kg > 0 ? line.separated_kg : line.requested_kg;
  document.getElementById('separate-actual-kg').value = defaultVal;

  document.getElementById('shipment-form-container')?.classList.add('hidden');
  document.getElementById('shipment-line-form-container')?.classList.add('hidden');

  formContainer?.classList.remove('hidden');
  formContainer?.scrollIntoView({ behavior: 'smooth' });
}

async function openAddShipmentLineModal(shipment_order_id) {
  const formContainer = document.getElementById('shipment-line-form-container');
  const errorDiv = document.getElementById('shipment-line-error');
  const flavorSelect = document.getElementById('line-flavor-select');

  if (errorDiv) errorDiv.classList.add('hidden');
  document.getElementById('line-shipment-order-id').value = shipment_order_id;
  document.getElementById('line-requested-kg').value = '';

  const { data: flavors, error: fErr } = await supabase
    .from('flavors')
    .select('id, name')
    .eq('active', true)
    .order('name');

  if (fErr) {
    showNotification(`Erro ao carregar sabores: ${fErr.message}`, 'error');
    return;
  }

  if (!flavors || flavors.length === 0) {
    showNotification('Ainda não há sabores cadastrados. Por favor, cadastre sabores na tela "Cadastros & Fórmulas" antes de adicionar itens.', 'warning');
    return;
  }

  flavorSelect.innerHTML = `
    <option value="" disabled selected>Selecione o sabor</option>
    ${flavors.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
  `;

  document.getElementById('shipment-form-container')?.classList.add('hidden');
  document.getElementById('separate-line-modal-container')?.classList.add('hidden');

  formContainer?.classList.remove('hidden');
  formContainer?.scrollIntoView({ behavior: 'smooth' });
}

async function populateShipmentCustomers() {
  const select = document.getElementById('shipment-customer-id');
  if (!select) return;

  const { data: partners } = await supabase.from('partners').select('id, name, partner_type').eq('active', true).order('name');
  select.innerHTML = (partners || []).map(p => `<option value="${p.id}">${p.name} (${p.partner_type.toUpperCase()})</option>`).join('');
}

async function loadShipmentOrders() {
  const container = document.getElementById('shipments-list-container');
  if (!container) return;

  const { data: orders, error } = await supabase
    .from('shipment_orders')
    .select(`
      *,
      partners (name, partner_type),
      shipment_lines (
        id, product_type, conservation, requested_kg, separated_kg, status, invoice_reference,
        flavors (name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar pedidos: ${error.message}</div>`;
    return;
  }

  if (!orders || orders.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'local_shipping',
      title: 'Nenhum Pedido de Saída',
      description: 'Crie pedidos de clientes (empórios, lanchonetes e atacados) para vincular lotes acabados e expedir.',
      actionText: 'Criar Primeiro Pedido',
      onAction: () => document.getElementById('add-shipment-order-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-space-md">
      ${orders.map(o => `
        <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between border-b border-border-subtle pb-2">
              <div>
                <h3 class="font-headline-sm text-ink-text">${o.order_code} — ${o.partners?.name}</h3>
                <span class="text-xs text-text-muted">Data: ${formatDate(o.requested_at)} | Canal: <strong class="uppercase">${o.partners?.partner_type}</strong></span>
              </div>
              <button class="add-shipment-line-btn px-3 py-1.5 rounded bg-surface-canvas hover:bg-wine-deep hover:text-on-primary text-bordeaux-primary text-xs font-bold transition-colors" data-orderid="${o.id}">
                + Adicionar Item ao Pedido
              </button>
            </div>

            <div class="flex flex-col gap-2 mt-2">
              ${(o.shipment_lines || []).length === 0
                ? `<div class="text-xs text-text-muted">Nenhum item adicionado ao pedido.</div>`
                : (o.shipment_lines || []).map(line => `
                  <div class="p-3 bg-surface-canvas rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border border-border-subtle">
                    <div class="flex flex-col">
                      <span class="font-bold text-ink-text">${line.flavors?.name}</span>
                      <span class="text-text-muted capitalize">${line.product_type} • ${line.conservation}</span>
                    </div>

                    <div class="flex items-center gap-4">
                      <div class="flex flex-col text-right">
                        <span class="text-text-muted text-[11px]">Solicitado: <strong>${formatWeight(line.requested_kg)}</strong></span>
                        <span class="font-bold text-bordeaux-primary text-xs">Separado Real: <strong>${formatWeight(line.separated_kg)}</strong></span>
                      </div>

                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                        line.status === 'delivered' ? 'bg-surface-container-low text-status-success' :
                        line.status === 'separated_for_invoice' ? 'bg-status-info text-white' :
                        'bg-badge-warning-bg text-badge-warning-text'
                      }">
                        ${line.status.toUpperCase()}
                      </span>

                      ${line.status === 'pending' ? `
                        <button class="separate-for-invoice-btn px-3 py-1.5 rounded bg-bordeaux-primary text-on-primary font-bold hover:bg-wine-deep transition-colors" data-lineid="${line.id}">
                          Separar p/ NF
                        </button>
                      ` : line.status === 'separated_for_invoice' ? `
                        <button class="advance-line-btn px-2.5 py-1 rounded bg-status-info text-white font-bold" data-lineid="${line.id}" data-status="separated_for_dispatch">
                          Liberar Doca
                        </button>
                      ` : line.status === 'separated_for_dispatch' ? `
                        <button class="advance-line-btn px-2.5 py-1 rounded bg-status-success text-white font-bold" data-lineid="${line.id}" data-status="delivered">
                          Confirmar Entrega
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Listener para adicionar linha de pedido
  container.querySelectorAll('.add-shipment-line-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const orderId = e.currentTarget.dataset.orderid;
      await openAddShipmentLineModal(orderId);
    });
  });

  // Listener para abrir modal de separação p/ NF
  container.querySelectorAll('.separate-for-invoice-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const lineId = e.currentTarget.dataset.lineid;
      for (const order of orders) {
        const foundLine = (order.shipment_lines || []).find(l => l.id === lineId);
        if (foundLine) {
          openSeparateLineModal(foundLine);
          break;
        }
      }
    });
  });

  // Listener para avançar status subsequente do pedido (doca -> entrega)
  container.querySelectorAll('.advance-line-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const lineId = e.currentTarget.dataset.lineid;
      const nextStatus = e.currentTarget.dataset.status;

      try {
        const { error } = await supabase.from('shipment_lines').update({ status: nextStatus }).eq('id', lineId);
        if (error) throw error;
        showNotification('Status do pedido atualizado com sucesso!', 'success');
        loadShipmentOrders();
      } catch (err) {
        showNotification(`Erro ao atualizar status: ${err.message}`, 'error');
      }
    });
  });
}
