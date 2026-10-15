import { supabase } from '../supabaseClient.js';
import { opButtonClass, buildOpOptions, resolveSelectedOp, opSelectHtml, refreshOpSelect } from './opFilter.js';
import { showNotification, renderEmptyState, formatWeight, formatDateTime, formatDate, weekdayName } from '../utils.js';
import { renderPdvList } from './pdvList.js';

let currentFilterMode = 'all'; // 'all', 'day', 'range' ou 'op' (Por Ordem de Produção)
let selectedOrderId = null;
let opOptions = [];
// Categorias de produto final (ordem de exibição no embutimento)
const PRODUCT_CATEGORIES = [
  { key: 'linguica', label: 'Linguiça', icon: 'restaurant' },
  { key: 'massa', label: 'Massa', icon: 'bakery_dining' },
  { key: 'manta', label: 'Manta', icon: 'layers' },
  { key: 'granel', label: 'Granel', icon: 'inventory_2' },
  { key: 'hamburguer', label: 'Hambúrguer', icon: 'lunch_dining' }
];
const CONSERVATION_LABELS = { resfriado: 'Resfriado', congelado: 'Congelado' };
const categoryOf = key => PRODUCT_CATEGORIES.find(c => c.key === key) || { key: 'none', label: 'Tipo não definido', icon: 'help' };
const productFinalText = p => `${categoryOf(p.product_type).label}${p.conservation ? ` · ${CONSERVATION_LABELS[p.conservation]}` : ''}`;

let currentView = 'line'; // 'line' (linha de produção) ou 'pdv' (lista final para o PDV)
let currentStageFilter = 'all'; // 'all', 'embutimento', 'vacuo', 'completed'
let selectedFilterDate = new Date().toISOString().split('T')[0];
let selectedStartDate = new Date().toISOString().split('T')[0];
let selectedEndDate = new Date().toISOString().split('T')[0];

// Módulo de Controle de Produção (Chão de Fábrica: Embutimento e Vácuo por Porção)
export async function render(container) {
  const today = new Date().toISOString().split('T')[0];
  if (!selectedFilterDate) selectedFilterDate = today;
  if (!selectedStartDate) selectedStartDate = today;
  if (!selectedEndDate) selectedEndDate = today;

  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-border-subtle shadow-sm w-fit">
        <button id="prod-view-line" class="px-4 py-2 rounded-lg font-label-md text-label-md transition-colors">Linha de produção</button>
        <button id="prod-view-pdv" class="px-4 py-2 rounded-lg font-label-md text-label-md transition-colors">Lista final (PDV)</button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Terminal de Execução de Produção</h1>
          <p class="font-body-md text-body-md text-text-muted">Acompanhamento por porção nas etapas de Embutimento e Vácuo. O fluxo termina no vácuo; a Rotulagem acontece antes ou em paralelo e é controlada na tela "Contagem de Rótulos".</p>
        </div>

        <!-- Filtros de Estágio / Status da Produção -->
        <div id="prod-stage-filter-box" class="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-border-subtle shadow-sm flex-wrap">
          <button id="prod-stage-all" class="stage-tab-btn px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentStageFilter === 'all' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Todos
          </button>
          <button id="prod-stage-embutimento" class="stage-tab-btn px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentStageFilter === 'embutimento' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Embutimento
          </button>
          <button id="prod-stage-vacuo" class="stage-tab-btn px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentStageFilter === 'vacuo' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Vácuo
          </button>
          <button id="prod-stage-completed" class="stage-tab-btn px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentStageFilter === 'completed' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Finalizado
          </button>
        </div>
      </div>

      <div id="production-line-view" class="flex flex-col gap-space-lg">
      <!-- Barra de Filtros de Período / Dia (Igual à Visão Geral) -->
      <div class="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-label-md text-text-muted flex items-center gap-1 mr-1">
            <span class="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Filtrar Produção:</span>
          </span>
          <button id="prod-filter-all" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Visão Geral
          </button>
          <button id="prod-filter-day" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Dia
          </button>
          <button id="prod-filter-range" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}">
            Por Período / Semana
          </button>
          <button id="prod-filter-op" class="${opButtonClass(currentFilterMode === 'op')}">
            Por Ordem de Produção
          </button>
        </div>

        <div id="prod-date-controls" class="flex items-center gap-3 flex-wrap">
          <!-- Renderizado dinamicamente -->
        </div>
      </div>

      <div id="production-list-container"></div>
      </div>

      <div id="production-pdv-view" class="hidden"></div>
    </div>
  `;

  setupFilterControls();
  setupStageFilterControls(container);
  setupViewToggle(container);
  loadProductionProcessRuns();
}

function setupViewToggle(container) {
  const btnLine = container.querySelector('#prod-view-line');
  const btnPdv = container.querySelector('#prod-view-pdv');
  const lineView = container.querySelector('#production-line-view');
  const pdvView = container.querySelector('#production-pdv-view');
  const stageBox = container.querySelector('#prod-stage-filter-box');

  const active = 'bg-bordeaux-primary text-on-primary font-bold shadow-sm';
  const idle = 'text-text-muted hover:text-ink-text';

  const apply = () => {
    const isLine = currentView === 'line';
    btnLine.className = `px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${isLine ? active : idle}`;
    btnPdv.className = `px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${isLine ? idle : active}`;
    lineView.classList.toggle('hidden', !isLine);
    stageBox.classList.toggle('hidden', !isLine);
    pdvView.classList.toggle('hidden', isLine);
    if (!isLine) renderPdvList(pdvView);
  };

  btnLine.addEventListener('click', () => { currentView = 'line'; apply(); });
  btnPdv.addEventListener('click', () => { currentView = 'pdv'; apply(); });
  apply();
}

function setupStageFilterControls(container) {
  const btnAll = container.querySelector('#prod-stage-all');
  const btnEmb = container.querySelector('#prod-stage-embutimento');
  const btnVac = container.querySelector('#prod-stage-vacuo');
  const btnComp = container.querySelector('#prod-stage-completed');

  const updateStageStyles = (activeBtn) => {
    [btnAll, btnEmb, btnVac, btnComp].forEach(btn => {
      if (btn === activeBtn) {
        btn.className = 'stage-tab-btn px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors bg-bordeaux-primary text-on-primary font-bold shadow-sm';
      } else if (btn) {
        btn.className = 'stage-tab-btn px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors text-text-muted hover:text-ink-text';
      }
    });
  };

  btnAll?.addEventListener('click', () => {
    currentStageFilter = 'all';
    updateStageStyles(btnAll);
    loadProductionProcessRuns();
  });

  btnEmb?.addEventListener('click', () => {
    currentStageFilter = 'embutimento';
    updateStageStyles(btnEmb);
    loadProductionProcessRuns();
  });

  btnVac?.addEventListener('click', () => {
    currentStageFilter = 'vacuo';
    updateStageStyles(btnVac);
    loadProductionProcessRuns();
  });

  btnComp?.addEventListener('click', () => {
    currentStageFilter = 'completed';
    updateStageStyles(btnComp);
    loadProductionProcessRuns();
  });
}

function setupFilterControls() {
  const btnAll = document.getElementById('prod-filter-all');
  const btnDay = document.getElementById('prod-filter-day');
  const btnRange = document.getElementById('prod-filter-range');
  const btnOp = document.getElementById('prod-filter-op');
  const dateControls = document.getElementById('prod-date-controls');

  if (!dateControls) return;

  const updateModeUI = () => {
    if (btnAll) btnAll.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'all' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnDay) btnDay.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'day' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnRange) btnRange.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentFilterMode === 'range' ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
    if (btnOp) btnOp.className = opButtonClass(currentFilterMode === 'op');

    if (currentFilterMode === 'all') {
      dateControls.innerHTML = `<span class="text-xs font-bold text-text-muted bg-surface-canvas px-3 py-1.5 rounded-lg">Exibindo todas as porções de produção</span>`;
    } else if (currentFilterMode === 'day') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2">
          <label for="prod-single-date" class="text-xs font-bold text-ink-text">Data de Produção:</label>
          <input type="date" id="prod-single-date" value="${selectedFilterDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
        </div>
      `;
      document.getElementById('prod-single-date')?.addEventListener('change', (e) => {
        selectedFilterDate = e.target.value;
        loadProductionProcessRuns();
      });
    } else if (currentFilterMode === 'op') {
      dateControls.innerHTML = opSelectHtml('prod-op-select', opOptions, selectedOrderId);
      document.getElementById('prod-op-select')?.addEventListener('change', (e) => {
        selectedOrderId = e.target.value;
        loadProductionProcessRuns();
      });
    } else if (currentFilterMode === 'range') {
      dateControls.innerHTML = `
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-1">
            <label for="prod-start-date" class="text-xs font-bold text-ink-text">De:</label>
            <input type="date" id="prod-start-date" value="${selectedStartDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
          <div class="flex items-center gap-1">
            <label for="prod-end-date" class="text-xs font-bold text-ink-text">Até:</label>
            <input type="date" id="prod-end-date" value="${selectedEndDate}" class="min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">
          </div>
        </div>
      `;
      document.getElementById('prod-start-date')?.addEventListener('change', (e) => {
        selectedStartDate = e.target.value;
        loadProductionProcessRuns();
      });
      document.getElementById('prod-end-date')?.addEventListener('change', (e) => {
        selectedEndDate = e.target.value;
        loadProductionProcessRuns();
      });
    }
  };

  btnAll?.addEventListener('click', () => {
    currentFilterMode = 'all';
    updateModeUI();
    loadProductionProcessRuns();
  });

  btnDay?.addEventListener('click', () => {
    currentFilterMode = 'day';
    updateModeUI();
    loadProductionProcessRuns();
  });

  btnRange?.addEventListener('click', () => {
    currentFilterMode = 'range';
    updateModeUI();
    loadProductionProcessRuns();
  });

  btnOp?.addEventListener('click', () => {
    currentFilterMode = 'op';
    updateModeUI();
    loadProductionProcessRuns();
  });

  updateModeUI();
}

async function loadProductionProcessRuns() {
  const container = document.getElementById('production-list-container');
  if (!container) return;

  const { data: portions, error } = await supabase
    .from('production_portions')
    .select(`
      *,
      flavors (name),
      production_orders (order_code, id, production_date),
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

  // Opções do filtro por OP: todas as OPs que têm porções (antes de qualquer filtro)
  opOptions = buildOpOptions((portions || []).map(p => p.production_orders));
  selectedOrderId = resolveSelectedOp(opOptions, selectedOrderId);
  refreshOpSelect('prod-op-select', opOptions, selectedOrderId);

  // Filtrar porções por data da OP conforme currentFilterMode
  let filteredPortions = portions || [];
  if (currentFilterMode === 'op') {
    filteredPortions = filteredPortions.filter(p => p.production_orders?.id === selectedOrderId);
  } else if (currentFilterMode === 'day' && selectedFilterDate) {
    filteredPortions = filteredPortions.filter(p => p.production_orders?.production_date === selectedFilterDate);
  } else if (currentFilterMode === 'range' && selectedStartDate && selectedEndDate) {
    filteredPortions = filteredPortions.filter(p => {
      const pDate = p.production_orders?.production_date;
      return pDate && pDate >= selectedStartDate && pDate <= selectedEndDate;
    });
  }

  // Filtrar por estágio/status da produção conforme currentStageFilter
  if (currentStageFilter !== 'all') {
    filteredPortions = filteredPortions.filter(p => {
      const runs = p.process_runs || [];
      const embutimento = runs.find(r => r.stage === 'embutimento');
      const vacuo = runs.find(r => r.stage === 'vacuo');

      const isEmbutimentoDone = embutimento?.status === 'completed';
      const isVacuoDone = vacuo?.status === 'completed';

      if (currentStageFilter === 'embutimento') {
        return !isEmbutimentoDone;
      } else if (currentStageFilter === 'vacuo') {
        return isEmbutimentoDone && !isVacuoDone;
      } else if (currentStageFilter === 'completed') {
        return isVacuoDone;
      }
      return true;
    });
  }

  if (filteredPortions.length === 0) {
    container.innerHTML = '';
    const filterText = currentFilterMode === 'op' ? ' para a ordem de produção selecionada' :
                       currentFilterMode === 'day' ? ` para o dia ${formatDate(selectedFilterDate)}` :
                       currentFilterMode === 'range' ? ` para o período de ${formatDate(selectedStartDate)} a ${formatDate(selectedEndDate)}` : '';
    container.appendChild(renderEmptyState({
      icon: 'precision_manufacturing',
      title: 'Nenhuma Porção Encontrada',
      description: `Não há porções na linha de produção${filterText}. Selecione outro filtro ou crie ordens no Planejamento.`,
      actionText: null
    }));
    return;
  }

  const { data: collaborators } = await supabase.from('collaborators').select('id, full_name').eq('active', true);

  // Separa por categoria de produto final e ordena por sabor / porção
  const categoryRank = key => { const i = PRODUCT_CATEGORIES.findIndex(c => c.key === key); return i === -1 ? PRODUCT_CATEGORIES.length : i; };
  filteredPortions = [...filteredPortions].sort((a, b) =>
    categoryRank(a.product_type) - categoryRank(b.product_type) ||
    String(a.flavors?.name).localeCompare(String(b.flavors?.name), 'pt-BR') ||
    String(a.conservation).localeCompare(String(b.conservation)) ||
    a.portion_no - b.portion_no);

  const categoryCounts = {};
  filteredPortions.forEach(p => { const k = categoryOf(p.product_type).key; categoryCounts[k] = (categoryCounts[k] || 0) + 1; });
  let lastCategory = null;

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${filteredPortions.map(p => {
        const cat = categoryOf(p.product_type);
        const heading = cat.key !== lastCategory
          ? `<div class="lg:col-span-2 flex items-center gap-2 pt-2 border-b-2 border-bordeaux-primary pb-1">
               <span class="material-symbols-outlined text-bordeaux-primary text-[22px]">${cat.icon}</span>
               <h2 class="font-headline-sm text-ink-text">${cat.label}</h2>
               <span class="text-xs font-bold text-text-muted">${categoryCounts[cat.key]} ${categoryCounts[cat.key] === 1 ? 'porção' : 'porções'}</span>
             </div>`
          : '';
        lastCategory = cat.key;
        const runs = p.process_runs || [];
        const embutimento = runs.find(r => r.stage === 'embutimento');
        const vacuo = runs.find(r => r.stage === 'vacuo');

        return heading + `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                <div>
                  <span class="text-xs font-bold text-text-muted uppercase">${p.production_orders?.order_code} • ${weekdayName(p.production_orders?.production_date)}, ${formatDate(p.production_orders?.production_date)}</span>
                  <h3 class="font-headline-sm text-ink-text">${p.flavors?.name} — Porção #${p.portion_no} (${formatWeight(p.planned_kg)})</h3>
                  <span class="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${p.product_type ? 'bg-bordeaux-primary text-on-primary' : 'bg-surface-canvas text-text-muted border border-border-subtle'}">Produto final: ${productFinalText(p)}</span>
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

  container.querySelectorAll('.complete-stage-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const runId = e.currentTarget.dataset.runid;
      const actualKg = parseFloat(document.getElementById(`qty-${runId}`)?.value);

      if (isNaN(actualKg) || actualKg <= 0) {
        showNotification('Informe a quantidade real produzida em kg.', 'error');
        return;
      }

      try {
        const { data: run, error } = await supabase
          .from('process_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            actual_kg: actualKg
          })
          .eq('id', runId)
          .select('id, stage')
          .single();

        if (error) throw error;

        // O sistema não controla estoque: o fluxo termina no vácuo e a quantidade real
        // alimenta a "Lista final (PDV)". Nenhum lote ou movimento de estoque é criado aqui.
        if (run && run.stage === 'vacuo') {
          showNotification(`Vácuo concluído! ${actualKg} kg registrados na lista final para o PDV.`, 'success');
        } else {
          showNotification('Etapa concluída com sucesso!', 'success');
        }

        loadProductionProcessRuns();
      } catch (err) {
        showNotification(`Erro ao concluir etapa: ${err.message}`, 'error');
      }
    });
  });
}
