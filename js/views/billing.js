import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDateTime } from '../utils.js';

// Módulo de Faturamento (Fila de faturamento lendo da view `vw_invoice_queue` do PostgreSQL)
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Fila de Faturamento & NF-e</h1>
          <p class="font-body-md text-body-md text-text-muted">Visualização em tempo real das linhas marcadas como "Separado para NF" para emissão fiscal.</p>
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

  const { data: queue, error } = await supabase.from('vw_invoice_queue').select('*');

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar fila de faturamento: ${error.message}</div>`;
    return;
  }

  if (!queue || queue.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'receipt_long',
      title: 'Fila de Faturamento Vazia',
      description: 'Quando os pedidos forem marcados como "Separado para NF" na Expedição, eles aparecerão automaticamente aqui.',
      actionText: null
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-hidden">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Código Pedido</th>
            <th class="py-3 px-4 font-semibold">Sabor / Produto</th>
            <th class="py-3 px-4 font-semibold">Tipo</th>
            <th class="py-3 px-4 font-semibold text-right">Peso Separado (kg)</th>
            <th class="py-3 px-4 font-semibold">Referência NF-e</th>
            <th class="py-3 px-4 font-semibold text-right">Ação</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${queue.map(item => `
            <tr class="hover:bg-surface-canvas/60 transition-colors">
              <td class="py-3 px-4 font-bold text-bordeaux-primary">${item.order_code}</td>
              <td class="py-3 px-4 font-bold">${item.flavor}</td>
              <td class="py-3 px-4 capitalize">${item.product_type} (${item.conservation})</td>
              <td class="py-3 px-4 text-right font-bold text-status-info">${formatWeight(item.separated_kg)}</td>
              <td class="py-3 px-4">
                <input type="text" class="invoice-ref-input px-2 py-1 rounded border border-border-subtle bg-surface-card text-xs" value="${item.invoice_reference || ''}" placeholder="Ex: NF-10492" id="ref-${item.shipment_line_id}">
              </td>
              <td class="py-3 px-4 text-right">
                <button class="save-invoice-btn px-3 py-1.5 rounded bg-bordeaux-primary text-on-primary font-bold text-xs hover:bg-wine-deep transition-colors" data-lineid="${item.shipment_line_id}">
                  Salvar NF
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.save-invoice-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const lineId = e.currentTarget.dataset.lineid;
      const ref = document.getElementById(`ref-${lineId}`)?.value.trim();

      try {
        const { error } = await supabase.from('shipment_lines').update({ invoice_reference: ref }).eq('id', lineId);
        if (error) throw error;
        showNotification('Referência da NF-e atualizada com sucesso!', 'success');
        loadInvoiceQueue();
      } catch (err) {
        showNotification(`Erro ao salvar NF-e: ${err.message}`, 'error');
      }
    });
  });
}
