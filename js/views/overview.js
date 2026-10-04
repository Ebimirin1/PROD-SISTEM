import { supabase } from '../supabaseClient.js';
import { renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Visão Geral (Monitor Operacional Diário / Bento Grid)
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <!-- Top Action Filter & Context Bar -->
      <section class="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-wrap items-center justify-between gap-space-md">
        <div class="flex items-center flex-wrap gap-space-md">
          <div class="flex items-center gap-space-xs">
            <span class="material-symbols-outlined text-bordeaux-primary text-[24px]">factory</span>
            <span class="font-title-lg text-title-lg text-ink-text tracking-tight">Monitor Operacional Diário</span>
          </div>
          <div class="h-6 w-px bg-surface-canvas hidden md:block"></div>
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-low text-status-success font-label-md text-label-md">
            <span class="w-2.5 h-2.5 rounded-full bg-status-success animate-pulse"></span>
            <span>Regime Nominal • Linhas Ativas</span>
          </div>
        </div>
      </section>

      <!-- Grid Bento com Indicadores -->
      <div id="overview-metrics-container"></div>
    </div>
  `;

  loadOverviewMetrics();
}

async function loadOverviewMetrics() {
  const container = document.getElementById('overview-metrics-container');
  if (!container) return;

  const { data: ops } = await supabase.from('production_orders').select('*, vw_production_order_totals(*), vw_production_order_status(*)');
  const { data: lots } = await supabase.from('vw_inventory_by_flavor').select('*');
  const { data: invoiceQueue } = await supabase.from('vw_invoice_queue').select('*');

  if (!ops || ops.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'grid_view',
      title: 'Nenhum Dado Operacional Registrado',
      description: 'Crie ordens de produção e registros de lotes para visualizar os indicadores do chão de fábrica.',
      actionText: null
    }));
    return;
  }

  const activeOp = ops.find(o => o.vw_production_order_status?.[0]?.status === 'in_production') || ops[0];
  const plannedKg = activeOp?.vw_production_order_totals?.[0]?.planned_total_kg || 0;
  const producedKg = activeOp?.vw_production_order_totals?.[0]?.produced_total_kg || 0;
  const progressPct = plannedKg > 0 ? Math.min(100, Math.round((producedKg / plannedKg) * 100)) : 0;

  const totalStockKg = (lots || []).reduce((acc, item) => acc + Number(item.balance_kg), 0);
  const pendingInvoiceKg = (invoiceQueue || []).reduce((acc, item) => acc + Number(item.separated_kg), 0);

  container.innerHTML = `
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
      <!-- Card 1: OP Ativa -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-bordeaux-primary"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Ciclo Ativo</span>
          <h2 class="font-headline-sm text-ink-text">${activeOp.order_code}</h2>
          <div class="flex justify-between items-baseline mt-2">
            <span class="text-xs text-text-muted">Carga Planejada:</span>
            <span class="font-bold text-bordeaux-primary text-lg">${formatWeight(plannedKg)}</span>
          </div>
          <div class="w-full bg-surface-canvas rounded-full h-2 overflow-hidden mt-2">
            <div class="bg-bordeaux-primary h-full rounded-full" style="width: ${progressPct}%"></div>
          </div>
        </div>
      </article>

      <!-- Card 2: Produção Realizada -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-status-success"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Volume Produzido Real</span>
          <h2 class="font-headline-sm text-status-success">${formatWeight(producedKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Conclusão do ciclo: <strong>${progressPct}%</strong></span>
        </div>
      </article>

      <!-- Card 3: Estoque Acabado Total -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-amber-warning"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Saldo de Estoque</span>
          <h2 class="font-headline-sm text-ink-text">${formatWeight(totalStockKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Lotes disponíveis em câmara</span>
        </div>
      </article>

      <!-- Card 4: Aguardando NF-e -->
      <article class="bg-surface-card rounded-xl p-space-md shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-status-info"></div>
        <div class="flex flex-col gap-1">
          <span class="font-label-sm text-text-muted uppercase">Pronto para Faturamento</span>
          <h2 class="font-headline-sm text-status-info">${formatWeight(pendingInvoiceKg)}</h2>
          <span class="text-xs text-text-muted mt-2">Linhas na doca / fila fiscal</span>
        </div>
      </article>
    </section>
  `;
}
