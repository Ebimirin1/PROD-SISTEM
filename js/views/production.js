import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDateTime } from '../utils.js';

// Módulo de Controle de Produção (Chão de Fábrica: Embutimento e Vácuo por Porção)
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Terminal de Execução de Produção</h1>
          <p class="font-body-md text-body-md text-text-muted">Acompanhamento em tempo real por porção de 30 kg nas etapas de Embutimento e Vácuo (a etapa de Rotulagem é gerada automaticamente na tela "Contagem de Rótulos").</p>
        </div>

        <a href="#labeling" id="go-to-labeling-btn" class="px-4 py-2 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-bold flex items-center gap-2 text-xs shadow-sm transition-colors">
          <span class="material-symbols-outlined text-[18px]">label</span>
          <span>Ir para Contagem de Rótulos</span>
        </a>
      </div>

      <div id="production-list-container"></div>
    </div>
  `;

  loadProductionProcessRuns();
}

async function loadProductionProcessRuns() {
  const container = document.getElementById('production-list-container');
  if (!container) return;

  const { data: portions, error } = await supabase
    .from('production_portions')
    .select(`
      *,
      flavors (name),
      production_orders (order_code, id),
      process_runs (
        id, stage, status, started_at, completed_at, actual_kg, correction_reason,
        process_run_collaborators (
          collaborators (full_name)
        )
      )
    `)
    .order('portion_no', { ascending: true });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar porções da fábrica: ${error.message}</div>`;
    return;
  }

  if (!portions || portions.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'precision_manufacturing',
      title: 'Nenhuma Porção em Linha de Produção',
      description: 'Abra e gere ordens em uma OP no Planejamento para disparar as porções na linha.',
      actionText: null
    }));
    return;
  }

  const { data: collaborators } = await supabase.from('collaborators').select('id, full_name').eq('active', true);

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${portions.map(p => {
        const runs = p.process_runs || [];
        const embutimento = runs.find(r => r.stage === 'embutimento');
        const vacuo = runs.find(r => r.stage === 'vacuo');
        const rotulagem = runs.find(r => r.stage === 'rotulagem');

        return `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                <div>
                  <span class="text-xs font-bold text-text-muted uppercase">${p.production_orders?.order_code}</span>
                  <h3 class="font-headline-sm text-ink-text">${p.flavors?.name} — Porção #${p.portion_no} (${formatWeight(p.planned_kg)})</h3>
                </div>
              </div>

              <!-- Etapas Sequenciais de Chão de Fábrica -->
              <div class="flex flex-col gap-2 mt-2">
                <!-- 1. Embutimento -->
                ${renderStageBox('Embutimento', embutimento, true, collaborators)}

                <!-- 2. Vácuo (Liberado apenas se Embutimento concluído) -->
                ${renderStageBox('Vácuo', vacuo, embutimento?.status === 'completed', collaborators)}

                <!-- Banner Informativo para a Rotulagem -->
                <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-bordeaux-primary text-[18px]">label</span>
                    <span class="font-bold text-ink-text">Contagem de Rótulos (2,5x/kg • ~420g por unidade)</span>
                  </div>
                  <span class="text-text-muted italic">Gerido na aba Contagem de Rótulos</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  setupProductionEventListeners(container, collaborators);
}

function renderStageBox(stageName, run, isUnlocked, collaborators) {
  if (!isUnlocked) {
    return `
      <div class="p-3 bg-surface-canvas rounded-lg opacity-50 border border-border-subtle flex items-center justify-between text-xs">
        <span class="font-bold text-text-muted">${stageName}</span>
        <span class="text-text-muted">Aguardando Etapa Anterior</span>
      </div>
    `;
  }

  if (!run) return '';

  const isPending = run.status === 'pending';
  const isInProgress = run.status === 'in_progress';
  const isCompleted = run.status === 'completed';

  return `
    <div class="p-3 bg-surface-canvas rounded-lg border border-border-subtle flex flex-col gap-2 text-xs">
      <div class="flex items-center justify-between font-bold text-ink-text">
        <span class="flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">
            ${stageName === 'Embutimento' ? 'motion_photos_on' : stageName === 'Vácuo' ? 'compress' : 'label'}
          </span>
          ${stageName}
        </span>

        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
          isCompleted ? 'bg-surface-container-low text-status-success' :
          isInProgress ? 'bg-badge-warning-bg text-badge-warning-text animate-pulse' :
          'bg-surface-card text-text-muted'
        }">
          ${isCompleted ? 'Concluído ✓' : isInProgress ? 'Em Execução...' : 'Pendente'}
        </span>
      </div>

      ${isPending ? `
        <div class="flex items-center justify-between pt-1">
          <select class="collaborator-select px-2 py-1 rounded border border-border-subtle bg-surface-card text-xs" id="collab-${run.id}">
            <option value="">Selecione Colaborador</option>
            ${(collaborators || []).map(c => `<option value="${c.id}">${c.full_name}</option>`).join('')}
          </select>
          <button class="start-stage-btn px-3 py-1.5 rounded bg-bordeaux-primary text-on-primary font-bold hover:bg-wine-deep" data-runid="${run.id}">
            Iniciar Etapa
          </button>
        </div>
      ` : isInProgress ? `
        <div class="flex flex-col gap-2 pt-1">
          <span class="text-text-muted">Iniciado em: ${formatDateTime(run.started_at)}</span>
          <div class="flex items-center gap-2">
            <input type="number" step="0.001" class="actual-kg-input px-2 py-1 rounded border border-border-subtle bg-surface-card font-bold" placeholder="Qtd Real Produzida (kg)" id="qty-${run.id}">
            <button class="complete-stage-btn px-3 py-1.5 rounded bg-status-success text-white font-bold hover:bg-green-700" data-runid="${run.id}">
              Concluir Etapa
            </button>
          </div>
        </div>
      ` : `
        <div class="flex items-center justify-between text-text-muted pt-1">
          <span>Qtd Real: <strong>${formatWeight(run.actual_kg)}</strong></span>
          <span>Concluído em: ${formatDateTime(run.completed_at)}</span>
        </div>
      `}
    </div>
  `;
}

function setupProductionEventListeners(container, collaborators) {
  // Iniciar etapa
  container.querySelectorAll('.start-stage-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const runId = e.currentTarget.dataset.runid;
      const collabId = document.getElementById(`collab-${runId}`)?.value;

      try {
        const { error } = await supabase
          .from('process_runs')
          .update({
            status: 'in_progress',
            started_at: new Date().toISOString()
          })
          .eq('id', runId);

        if (error) throw error;

        if (collabId) {
          await supabase.from('process_run_collaborators').insert({
            process_run_id: runId,
            collaborator_id: collabId
          });
        }

        showNotification('Etapa iniciada na fábrica!', 'success');
        loadProductionProcessRuns();
      } catch (err) {
        showNotification(`Erro ao iniciar etapa: ${err.message}`, 'error');
      }
    });
  });

  // Concluir etapa
  container.querySelectorAll('.complete-stage-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const runId = e.currentTarget.dataset.runid;
      const actualKg = parseFloat(document.getElementById(`qty-${runId}`)?.value);

      if (isNaN(actualKg) || actualKg <= 0) {
        showNotification('Informe a quantidade real produzida em kg.', 'error');
        return;
      }

      try {
        const { error } = await supabase
          .from('process_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            actual_kg: actualKg
          })
          .eq('id', runId);

        if (error) throw error;

        showNotification('Etapa concluída com sucesso!', 'success');
        loadProductionProcessRuns();
      } catch (err) {
        showNotification(`Erro ao concluir etapa: ${err.message}`, 'error');
      }
    });
  });
}
