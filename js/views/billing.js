import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Faturamento & NF-e (Fila de faturamento agrupada por Pedido do Cliente)
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Fila de Faturamento & NF-e por Cliente</h1>
          <p class="font-body-md text-body-md text-text-muted">Visualização agrupada do pedido total por cliente com todos os sabores reunidos para separação fiscal e emissão de NF-e.</p>
        </div>
      </div>

      <div id="billing-queue-container"></div>
    </div>
  `;

  loadInvoiceQueue();
}

async function loadInvoiceQueue() {
  const container = document.getElementById('billing-queue-container');
  if (!container) return;

  const { data: orders, error } = await supabase
    .from('shipment_orders')
    .select(`
      id,
      order_code,
      requested_at,
      notes,
      partners (id, name, partner_type),
      shipment_lines (
        id,
        product_type,
        conservation,
        requested_kg,
        separated_kg,
        invoice_reference,
        status,
        flavors (id, name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg font-bold">Erro ao carregar fila de faturamento: ${error.message}</div>`;
    return;
  }

  // Filtrar ordens que possuam itens marcados como 'separated_for_invoice'
  const activeInvoiceOrders = (orders || []).map(o => {
    const invoiceLines = (o.shipment_lines || []).filter(l => l.status === 'separated_for_invoice');
    return {
      ...o,
      invoiceLines
    };
  }).filter(o => o.invoiceLines.length > 0);

  if (activeInvoiceOrders.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'receipt_long',
      title: 'Fila de Faturamento Vazia',
      description: 'Quando os pedidos forem marcados como "Separado para NF" na Expedição, os itens aparecerão aqui agrupados por cliente.',
      actionText: null
    }));
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      ${activeInvoiceOrders.map(order => {
        const customerName = order.partners?.name || 'Cliente Não Identificado';
        const partnerType = order.partners?.partner_type || 'outro';
        const totalRequestedKg = order.invoiceLines.reduce((acc, l) => acc + Number(l.requested_kg || 0), 0);
        const totalSeparatedKg = order.invoiceLines.reduce((acc, l) => acc + Number(l.separated_kg || 0), 0);

        return `
          <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle p-space-lg flex flex-col gap-space-md">
            <!-- Cabeçalho do Pedido e Dados do Cliente -->
            <div class="flex flex-wrap items-center justify-between gap-space-md border-b border-border-subtle pb-space-md">
              <div class="flex items-center gap-space-md">
                <div class="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-bordeaux-primary font-bold">
                  <span class="material-symbols-outlined text-[24px]">person</span>
                </div>
                <div class="flex flex-col">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="font-headline-sm text-headline-sm text-ink-text font-bold">${customerName}</h2>
                    <span class="px-2.5 py-0.5 rounded text-xs font-bold bg-surface-canvas text-ink-text border border-border-subtle uppercase">
                      Canal: ${partnerType}
                    </span>
                  </div>
                  <span class="text-xs text-text-muted font-bold mt-0.5">
                    Pedido: <strong class="text-bordeaux-primary">${order.order_code}</strong> | Data do Pedido: ${formatDate(order.requested_at)}
                  </span>
                </div>
              </div>

              <!-- Indicador de Peso Total do Pedido -->
              <div class="flex items-center gap-4 bg-surface-canvas p-3 rounded-xl border border-border-subtle">
                <div class="flex flex-col text-right">
                  <span class="text-xs text-text-muted font-bold uppercase">Total Solicitado</span>
                  <span class="font-tabular-data-md text-tabular-data-md text-text-muted font-bold">${formatWeight(totalRequestedKg)}</span>
                </div>
                <div class="h-8 w-px bg-border-subtle"></div>
                <div class="flex flex-col text-right">
                  <span class="text-xs text-bordeaux-primary font-bold uppercase">Total Separado Real</span>
                  <span class="font-tabular-data-lg text-tabular-data-lg text-bordeaux-primary font-bold">${formatWeight(totalSeparatedKg)}</span>
                </div>
              </div>
            </div>

            <!-- Tabela de Itens e Sabores do Cliente -->
            <div class="overflow-x-auto">
              <table class="w-full text-left font-body-md">
                <thead class="bg-surface-canvas text-ink-text font-title-md text-xs border-b border-border-subtle">
                  <tr>
                    <th class="py-3 px-4 font-semibold">Sabor / Produto</th>
                    <th class="py-3 px-4 font-semibold">Tipo & Conservação</th>
                    <th class="py-3 px-4 font-semibold text-right">Qtd Solicitada (kg)</th>
                    <th class="py-3 px-4 font-semibold text-right">Qtd Separada Real (kg)</th>
                    <th class="py-3 px-4 font-semibold">Número da NF-e</th>
                    <th class="py-3 px-4 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-ink-text text-xs">
                  ${order.invoiceLines.map(line => `
                    <tr class="hover:bg-surface-canvas/60 transition-colors">
                      <td class="py-3 px-4 font-bold text-bordeaux-primary text-sm flex items-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">restaurant_menu</span>
                        ${line.flavors?.name || 'Sabor Não Identificado'}
                      </td>
                      <td class="py-3 px-4 capitalize text-text-muted font-bold">
                        ${line.product_type} • ${line.conservation}
                      </td>
                      <td class="py-3 px-4 text-right font-medium text-text-muted">
                        ${formatWeight(line.requested_kg)}
                      </td>
                      <td class="py-3 px-4 text-right font-bold text-status-info text-sm">
                        ${formatWeight(line.separated_kg)}
                      </td>
                      <td class="py-3 px-4">
                        <input type="text" class="invoice-ref-input px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary" value="${line.invoice_reference || ''}" placeholder="Ex: NF-10492" id="ref-${line.id}">
                      </td>
                      <td class="py-3 px-4 text-right">
                        <button class="save-line-invoice-btn px-3 py-1.5 rounded-lg bg-bordeaux-primary text-on-primary font-bold text-xs hover:bg-wine-deep transition-colors shadow-sm" data-lineid="${line.id}">
                          Salvar NF
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Rodapé da Fatura do Cliente: Ações do Pedido Completo -->
            <div class="flex items-center justify-between bg-surface-canvas p-space-md rounded-xl border border-border-subtle flex-wrap gap-2">
              <span class="text-xs text-text-muted font-bold">
                Todos os ${order.invoiceLines.length} ${order.invoiceLines.length === 1 ? 'sabor' : 'sabores'} reunidos para o cliente <strong>${customerName}</strong>.
              </span>
              <button class="dispatch-all-btn px-4 py-2 rounded-lg bg-status-info text-white font-title-md hover:bg-blue-800 transition-colors flex items-center gap-2 shadow-sm" data-orderid="${order.id}">
                <span class="material-symbols-outlined text-[18px]">local_shipping</span>
                <span>Liberar Pedido Completo para Doca</span>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Listener para salvar NF individual
  container.querySelectorAll('.save-line-invoice-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const lineId = e.currentTarget.dataset.lineid;
      const ref = document.getElementById(`ref-${lineId}`)?.value.trim();

      try {
        const { error } = await supabase.from('shipment_lines').update({ invoice_reference: ref }).eq('id', lineId);
        if (error) throw error;
        showNotification('Referência da NF-e salva com sucesso!', 'success');
        loadInvoiceQueue();
      } catch (err) {
        showNotification(`Erro ao salvar NF-e: ${err.message}`, 'error');
      }
    });
  });

  // Listener para liberar pedido completo para a doca de expedição
  container.querySelectorAll('.dispatch-all-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const orderId = e.currentTarget.dataset.orderid;
      const targetOrder = activeInvoiceOrders.find(o => o.id === orderId);
      if (!targetOrder) return;

      try {
        // Salvar referências de NF que foram digitadas e avançar para separated_for_dispatch
        for (const line of targetOrder.invoiceLines) {
          const ref = document.getElementById(`ref-${line.id}`)?.value.trim() || line.invoice_reference;
          await supabase.from('shipment_lines').update({
            invoice_reference: ref,
            status: 'separated_for_dispatch'
          }).eq('id', line.id);
        }

        showNotification(`Pedido de ${targetOrder.partners?.name || 'Cliente'} liberado para a doca de expedição!`, 'success');
        loadInvoiceQueue();
      } catch (err) {
        showNotification(`Erro ao liberar pedido para doca: ${err.message}`, 'error');
      }
    });
  });
}
