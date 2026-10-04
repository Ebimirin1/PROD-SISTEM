import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Pedidos & Expedição (Separação por cliente, vinculo de lotes e transições de status)
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
            <label class="font-label-md text-ink-text">Código do Pedido</label>
            <input type="text" id="shipment-code" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: PED-2026-001">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Cliente / Parceiro</label>
            <select id="shipment-customer-id" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text"></select>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Data do Pedido</label>
            <input type="date" id="shipment-date" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text">
          </div>

          <div class="flex items-center gap-2 md:col-span-3 justify-end">
            <button type="button" id="shipment-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar Pedido</button>
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

  loadShipmentOrders();
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
                      <span class="font-bold text-bordeaux-primary">${formatWeight(line.separated_kg)} / ${formatWeight(line.requested_kg)}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                        line.status === 'delivered' ? 'bg-surface-container-low text-status-success' :
                        line.status === 'separated_for_invoice' ? 'bg-status-info text-white' :
                        'bg-badge-warning-bg text-badge-warning-text'
                      }">
                        ${line.status.toUpperCase()}
                      </span>

                      ${line.status === 'pending' ? `
                        <button class="advance-line-btn px-2.5 py-1 rounded bg-bordeaux-primary text-on-primary font-bold" data-lineid="${line.id}" data-status="separated_for_invoice">
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
      await promptAddShipmentLine(orderId);
    });
  });

  // Listener para avançar status do pedido
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

async function promptAddShipmentLine(shipment_order_id) {
  const { data: flavors } = await supabase.from('flavors').select('id, name').eq('active', true);
  if (!flavors || flavors.length === 0) {
    showNotification('Cadastre sabores ativos primeiro.', 'error');
    return;
  }

  const requested_kg = parseFloat(prompt('Digite a quantidade solicitada em kg:', '20.00'));
  if (isNaN(requested_kg) || requested_kg <= 0) return;

  try {
    const { error } = await supabase.from('shipment_lines').insert({
      shipment_order_id,
      flavor_id: flavors[0].id,
      product_type: 'linguica',
      conservation: 'resfriado',
      requested_kg,
      separated_kg: requested_kg,
      status: 'pending'
    });
    if (error) throw error;
    showNotification('Item adicionado ao pedido!', 'success');
    loadShipmentOrders();
  } catch (err) {
    showNotification(`Erro ao adicionar item: ${err.message}`, 'error');
  }
}
