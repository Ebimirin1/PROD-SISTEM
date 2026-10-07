import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDateTime } from '../utils.js';

// Módulo de Contagem e Controle de Rótulos (2.5 rótulos por kg / ~420g por unidade)
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg max-w-[1720px] mx-auto w-full">
      <div class="flex flex-wrap items-center justify-between gap-space-md bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm">
        <div>
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-bordeaux-primary text-[28px]">label</span>
            <h1 class="font-display-lg text-display-lg text-ink-text">Contagem e Aplicação de Rótulos</h1>
          </div>
          <p class="font-body-md text-body-md text-text-muted mt-1">Cálculo automático de rótulos por porção e sabor baseado no peso estipulado (proporção nominal de 2,5 rótulos/kg • ~420g por pacote).</p>
        </div>

        <div class="flex items-center gap-2 bg-surface-canvas p-2 rounded-lg border border-border-subtle">
          <span class="material-symbols-outlined text-status-info text-[20px]">info</span>
          <span class="text-xs font-bold text-ink-text">Regra do Setor: 1 kg de linguiça = 2,5 rótulos (Ex: 100 kg = 250 rótulos)</span>
        </div>
      </div>

      <div id="labeling-list-container"></div>
    </div>
  `;

  loadLabelingRuns();
}

async function loadLabelingRuns() {
  const container = document.getElementById('labeling-list-container');
  if (!container) return;

  const { data: portions, error } = await supabase
    .from('production_portions')
    .select(`
      id,
      portion_no,
      planned_kg,
      flavors (id, name),
      production_orders (id, order_code, production_date),
      process_runs (
        id, stage, status, started_at, completed_at, actual_kg
      )
    `)
    .order('portion_no', { ascending: true });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar dados de rotulagem: ${error.message}</div>`;
    return;
  }

  if (!portions || portions.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'label',
      title: 'Nenhuma Porção com Rótulos Mapeada',
      description: 'As demandas de rótulos são geradas automaticamente a partir das OPs criadas no Planejamento.',
      actionText: null
    }));
    return;
  }

  const { data: collaborators } = await supabase.from('collaborators').select('id, full_name').eq('active', true);

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${portions.map(p => {
        const runs = p.process_runs || [];
        const vacuoRun = runs.find(r => r.stage === 'vacuo');
        const rotulagemRun = runs.find(r => r.stage === 'rotulagem');

        // Peso estipulado / base: utilizar peso do vácuo se disponível, caso contrário o planejado
        const baseKg = (vacuoRun && vacuoRun.actual_kg) ? Number(vacuoRun.actual_kg) : Number(p.planned_kg || 0);
        // Regra do cliente: 2.5 rótulos por kg
        const calculatedLabels = Math.round(baseKg * 2.5);

        const isVacuoCompleted = vacuoRun?.status === 'completed';
        const isRotulagemCompleted = rotulagemRun?.status === 'completed';
        const isRotulagemInProgress = rotulagemRun?.status === 'in_progress';

        return `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                <div>
                  <span class="text-xs font-bold text-text-muted uppercase">${p.production_orders?.order_code || 'OP'}</span>
                  <h3 class="font-headline-sm text-ink-text">${p.flavors?.name} — Porção #${p.portion_no}</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                  isRotulagemCompleted ? 'bg-surface-container-low text-status-success' :
                  isRotulagemInProgress ? 'bg-badge-warning-bg text-badge-warning-text animate-pulse' :
                  'bg-surface-canvas text-text-muted'
                }">
                  ${isRotulagemCompleted ? 'Rotulagem Concluída ✓' : isRotulagemInProgress ? 'Em Rotulagem' : 'Pendente'}
                </span>
              </div>

              <!-- Indicadores de Rótulos -->
              <div class="grid grid-cols-3 gap-2 bg-surface-canvas p-3 rounded-lg border border-border-subtle text-xs my-1">
                <div class="flex flex-col">
                  <span class="text-text-muted font-bold">Carga Estipulada</span>
                  <span class="font-tabular-data-lg text-title-md font-bold text-ink-text">${formatWeight(baseKg)}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-text-muted font-bold">Qtd Pacotes (~420g)</span>
                  <span class="font-tabular-data-lg text-title-md font-bold text-bordeaux-primary">${calculatedLabels} un</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-text-muted font-bold">Rótulos Calculados</span>
                  <span class="font-tabular-data-lg text-title-md font-bold text-status-success">${calculatedLabels} rótulos</span>
                </div>
              </div>

              <!-- Controles de Ação de Rotulagem -->
              ${!isVacuoCompleted ? `
                <div class="p-3 rounded-lg bg-surface-canvas text-text-muted text-xs italic border border-border-subtle flex items-center gap-2">
                  <span class="material-symbols-outlined text-[18px]">lock</span>
                  <span>Aguardando conclusão da etapa de Vácuo para liberar aplicação de rótulos.</span>
                </div>
              ` : isRotulagemCompleted ? `
                <div class="p-3 rounded-lg bg-surface-container-low text-status-success text-xs font-bold border border-border-subtle flex items-center justify-between">
                  <span class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-[18px]">check_circle</span>
                    Lote de ${calculatedLabels} rótulos impresso e aplicado com sucesso.
                  </span>
                  <span class="text-[11px] font-normal text-text-muted">${formatDateTime(rotulagemRun?.completed_at)}</span>
                </div>
              ` : `
                <div class="flex flex-col gap-2 p-3 bg-surface-canvas rounded-lg border border-border-subtle text-xs">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-ink-text">Confirmar Liberação e Rotulagem:</span>
                    <span class="text-status-success font-bold">${calculatedLabels} Unidades</span>
                  </div>

                  <div class="flex items-center gap-2 mt-1">
                    <select id="collab-rot-${rotulagemRun?.id || p.id}" class="flex-1 px-2.5 py-1.5 rounded border border-border-subtle bg-surface-card text-xs font-bold">
                      <option value="">Selecione o Operador de Rotulagem</option>
                      ${(collaborators || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('')}
                    </select>

                    <button class="confirm-rotulagem-btn px-4 py-1.5 rounded bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-bold transition-colors" data-runid="${rotulagemRun?.id}" data-basekg="${baseKg}">
                      Confirmar Rótulos
                    </button>
                  </div>
                </div>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Listener para confirmar aplicação de rótulos
  container.querySelectorAll('.confirm-rotulagem-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const runId = e.currentTarget.dataset.runid;
      const baseKg = parseFloat(e.currentTarget.dataset.basekg);

      if (!runId || runId === 'undefined') {
        showNotification('Execução do processo de rotulagem não encontrada.', 'error');
        return;
      }

      try {
        const { error } = await supabase
          .from('process_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            actual_kg: baseKg
          })
          .eq('id', runId);

        if (error) throw error;

        showNotification('Contagem e aplicação de rótulos confirmadas com sucesso!', 'success');
        loadLabelingRuns();
      } catch (err) {
        showNotification(`Erro ao confirmar rotulagem: ${err.message}`, 'error');
      }
    });
  });
}
