import { supabase } from '../supabaseClient.js';
import { opButtonClass, buildOpOptions, resolveSelectedOp, opSelectHtml, refreshOpSelect } from './opFilter.js';
import { showNotification, renderEmptyState, formatWeight, formatDateTime, formatDate, weekdayName } from '../utils.js';
import { renderPdvList } from './pdvList.js';

let currentFilterMode = 'op'; // 'op' (Por Ordem de Produção, padrão: OP mais recente), 'all', 'day' ou 'range'
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
          collaborator_id,
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
  // Sem nenhuma OP, o filtro padrão por OP não tem o que mostrar: volta para Visão Geral
  if (currentFilterMode === 'op' && !opOptions.length) {
    document.getElementById('prod-filter-all')?.click();
    return;
  }
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

  const { data: collaborators } = await supabase.from('collaborators').select('id, full_name').eq('active', true).order('full_name');
  // Duplas cadastradas (Cadastros > Colaboradores). Se a tabela ainda não existir no banco, segue só com pessoas.
  const { data: teamRows } = await supabase
    .from('collaborator_teams')
    .select('id, name, active, collaborator_team_members (collaborator_id)')
    .eq('active', true)
    .order('name');
  const activeIds = new Set((collaborators || []).map(c => c.id));
  const teams = (teamRows || [])
    .map(t => ({ id: t.id, name: t.name, memberIds: (t.collaborator_team_members || []).map(m => m.collaborator_id).filter(id => activeIds.has(id)) }))
    .filter(t => t.memberIds.length >= 2);

  // Tempo médio de vácuo por pessoa e por dupla: usa o filtro de OP/data, não o de etapa
  const vacuumStatsHtml = renderVacuumStats(filteredPortions, teams, collaborators);

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
    container.innerHTML = vacuumStatsHtml;
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

  container.innerHTML = vacuumStatsHtml + `
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
                ${renderStageBox('Embutimento', embutimento, true, collaborators, [], p)}

                <!-- 2. Vácuo (Liberado apenas se Embutimento concluído) -->
                ${renderStageBox('Vácuo', vacuo, embutimento?.status === 'completed', collaborators, teams, p)}

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

  setupProductionEventListeners(container, teams);
}

function runPeopleNames(run) {
  return (run?.process_run_collaborators || []).map(rc => rc.collaborators?.full_name).filter(Boolean);
}

function runMinutes(run) {
  if (!run?.started_at || !run?.completed_at) return null;
  const m = (new Date(run.completed_at) - new Date(run.started_at)) / 60000;
  return m > 0 ? m : null;
}

function formatMinutes(min) {
  if (min === null || min === undefined || isNaN(min)) return '—';
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`;
}

function renderStageBox(stageName, run, isUnlocked, collaborators, teams, portion) {
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
  const isVacuo = run.stage === 'vacuo';
  const people = runPeopleNames(run);
  const peopleLine = people.length
    ? `<span class="text-text-muted">${people.length > 1 ? 'Equipe' : 'Responsável'}: <strong class="text-ink-text">${people.join(' / ')}</strong></span>`
    : '';

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
            <option value="">${isVacuo ? 'Quem está no vácuo?' : 'Selecione Colaborador'}</option>
            ${isVacuo && (teams || []).length ? `
              <optgroup label="Duplas">
                ${teams.map(t => `<option value="team:${t.id}">${t.name}</option>`).join('')}
              </optgroup>
              <optgroup label="Uma pessoa">
                ${(collaborators || []).map(c => `<option value="c:${c.id}">${c.full_name}</option>`).join('')}
              </optgroup>
            ` : (collaborators || []).map(c => `<option value="c:${c.id}">${c.full_name}</option>`).join('')}
          </select>
          <button class="start-stage-btn px-3 py-1.5 rounded bg-bordeaux-primary text-on-primary font-bold hover:bg-wine-deep" data-runid="${run.id}" data-stage="${run.stage}">
            Iniciar Etapa
          </button>
        </div>
      ` : isInProgress ? `
        <div class="flex flex-col gap-2 pt-1">
          ${peopleLine}
          <span class="text-text-muted">Iniciado em: ${formatDateTime(run.started_at)}</span>
          <div class="flex items-center gap-2 flex-wrap">
            ${isVacuo ? `<input type="number" step="0.001" min="0" class="actual-kg-input px-2 py-1 rounded border border-border-subtle bg-surface-card font-bold" placeholder="Peso final do vácuo (kg)" id="qty-${run.id}">` : ''}
            <button class="complete-stage-btn px-3 py-1.5 rounded bg-status-success text-white font-bold hover:bg-green-700" data-runid="${run.id}" data-stage="${run.stage}" data-plannedkg="${portion?.planned_kg ?? ''}">
              Concluir Etapa
            </button>
          </div>
          ${isVacuo ? '' : '<span class="text-text-muted italic">O peso é informado só no fim do vácuo.</span>'}
        </div>
      ` : `
        <div class="flex flex-col gap-1 text-text-muted pt-1">
          ${peopleLine}
          <div class="flex items-center justify-between gap-2 flex-wrap">
            ${isVacuo ? `<span>Peso final: <strong>${formatWeight(run.actual_kg)}</strong></span>` : `<span>Tempo: <strong>${formatMinutes(runMinutes(run))}</strong></span>`}
            ${isVacuo ? `<span>Tempo: <strong>${formatMinutes(runMinutes(run))}</strong></span>` : ''}
            <span>Concluído em: ${formatDateTime(run.completed_at)}</span>
          </div>
        </div>
      `}
    </div>
  `;
}

function setupProductionEventListeners(container, teams) {
  container.querySelectorAll('.start-stage-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const runId = e.currentTarget.dataset.runid;
      const choice = document.getElementById(`collab-${runId}`)?.value || '';
      const isVacuo = e.currentTarget.dataset.stage === 'vacuo';

      // "team:<id>" = dupla cadastrada (uma linha por pessoa); "c:<id>" = uma pessoa
      let collabIds = [];
      if (choice.startsWith('team:')) {
        collabIds = (teams || []).find(t => t.id === choice.slice(5))?.memberIds || [];
      } else if (choice.startsWith('c:')) {
        collabIds = [choice.slice(2)];
      }

      if (isVacuo && !collabIds.length) {
        showNotification('Escolha a pessoa ou a dupla que está no vácuo.', 'error');
        return;
      }

      try {
        const { error } = await supabase
          .from('process_runs')
          .update({
            status: 'in_progress',
            started_at: new Date().toISOString()
          })
          .eq('id', runId);

        if (error) throw error;

        if (collabIds.length) {
          const { error: collabError } = await supabase.from('process_run_collaborators').insert(
            collabIds.map(id => ({ process_run_id: runId, collaborator_id: id }))
          );
          if (collabError) throw collabError;
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
      const isVacuo = e.currentTarget.dataset.stage === 'vacuo';
      // Só o vácuo pede peso (peso final). O embutimento grava o peso planejado da porção,
      // só para não deixar a etapa sem valor (o banco exige) nem zerar os gráficos.
      const actualKg = isVacuo
        ? parseFloat(document.getElementById(`qty-${runId}`)?.value)
        : Number(e.currentTarget.dataset.plannedkg || 0);

      if (isVacuo && (isNaN(actualKg) || actualKg <= 0)) {
        showNotification('Informe o peso final do vácuo em kg.', 'error');
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

// Tempo médio de vácuo por dupla/equipe e por pessoa, com base nos vácuos concluídos
// das porções do filtro atual (OP, dia ou período). Uma dupla é o conjunto de pessoas
// gravadas no vácuo, então o histórico vale mesmo que a dupla saia do cadastro.
function renderVacuumStats(portions, teams, collaborators) {
  // Mostra o nome cadastrado da dupla quando as pessoas batem com uma dupla do cadastro
  const nameById = Object.fromEntries((collaborators || []).map(c => [c.id, c.full_name]));
  const teamNameByKey = {};
  (teams || []).forEach(t => {
    const key = t.memberIds.map(id => nameById[id]).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' / ');
    if (key) teamNameByKey[key] = t.name;
  });

  const vacuums = [];
  (portions || []).forEach(p => {
    const run = (p.process_runs || []).find(r => r.stage === 'vacuo' && r.status === 'completed');
    const minutes = runMinutes(run);
    const names = runPeopleNames(run).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (minutes === null || !names.length) return;
    vacuums.push({ minutes, kg: Number(run.actual_kg || 0), names });
  });

  const header = `
    <summary class="cursor-pointer flex items-center gap-2 font-title-md text-ink-text">
      <span class="material-symbols-outlined text-bordeaux-primary text-[20px]">timer</span>
      Tempo médio de vácuo por pessoa e por dupla
      <span class="text-xs font-bold text-text-muted">(${vacuums.length} ${vacuums.length === 1 ? 'vácuo' : 'vácuos'} no filtro)</span>
    </summary>`;

  if (!vacuums.length) {
    return `
      <details class="mb-space-md bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle">
        ${header}
        <p class="mt-2 text-xs text-text-muted">Ainda não há vácuos concluídos com pessoa ou dupla registrada neste filtro.</p>
      </details>`;
  }

  const agg = () => ({ n: 0, min: 0, kg: 0 });
  const add = (a, v) => { a.n += 1; a.min += v.minutes; a.kg += v.kg; };
  const avg = a => (a.n ? a.min / a.n : null);
  const kgPerHour = a => (a.min > 0 ? a.kg / (a.min / 60) : null);
  const fmtKgH = v => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg/h`);

  const teamAgg = {};
  const people = {};
  vacuums.forEach(v => {
    if (v.names.length > 1) {
      const key = v.names.join(' / ');
      add(teamAgg[key] ||= agg(), v);
    }
    v.names.forEach(name => {
      const p = people[name] ||= { all: agg(), solo: agg(), team: agg() };
      add(p.all, v);
      add(v.names.length > 1 ? p.team : p.solo, v);
    });
  });

  const th = 'py-2 px-3 font-semibold';
  const td = 'py-2 px-3';
  const teamRows = Object.entries(teamAgg).sort((a, b) => avg(a[1]) - avg(b[1]));
  const peopleRows = Object.entries(people).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

  return `
    <details class="mb-space-md bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle" open>
      ${header}
      <p class="mt-1 text-xs text-text-muted">Tempo de cada vácuo = do "Iniciar Etapa" ao "Concluir Etapa". Como as porções têm pesos diferentes, compare também os kg por hora.</p>
      <div class="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-space-md text-xs">
        <div class="overflow-x-auto">
          <h4 class="font-bold text-ink-text mb-1">Por dupla / equipe</h4>
          ${teamRows.length ? `
          <table class="w-full text-left">
            <thead class="bg-surface-canvas text-ink-text border-b border-border-subtle">
              <tr><th class="${th}">Dupla</th><th class="${th} text-right">Vácuos</th><th class="${th} text-right">Tempo médio</th><th class="${th} text-right">Peso médio</th><th class="${th} text-right">Ritmo</th></tr>
            </thead>
            <tbody class="divide-y divide-border-subtle text-ink-text">
              ${teamRows.map(([name, a]) => `
                <tr><td class="${td} font-bold">${teamNameByKey[name] || name}</td><td class="${td} text-right">${a.n}</td><td class="${td} text-right">${formatMinutes(avg(a))}</td><td class="${td} text-right">${formatWeight(a.kg / a.n)}</td><td class="${td} text-right">${fmtKgH(kgPerHour(a))}</td></tr>
              `).join('')}
            </tbody>
          </table>` : '<p class="text-text-muted">Nenhum vácuo feito em dupla neste filtro.</p>'}
        </div>
        <div class="overflow-x-auto">
          <h4 class="font-bold text-ink-text mb-1">Por pessoa</h4>
          <table class="w-full text-left">
            <thead class="bg-surface-canvas text-ink-text border-b border-border-subtle">
              <tr><th class="${th}">Pessoa</th><th class="${th} text-right">Vácuos</th><th class="${th} text-right">Média geral</th><th class="${th} text-right">Sozinho(a)</th><th class="${th} text-right">Em dupla</th><th class="${th} text-right">Ritmo</th></tr>
            </thead>
            <tbody class="divide-y divide-border-subtle text-ink-text">
              ${peopleRows.map(([name, p]) => `
                <tr>
                  <td class="${td} font-bold">${name}</td>
                  <td class="${td} text-right">${p.all.n}</td>
                  <td class="${td} text-right">${formatMinutes(avg(p.all))}</td>
                  <td class="${td} text-right">${p.solo.n ? `${formatMinutes(avg(p.solo))} <span class="text-text-muted">(${p.solo.n})</span>` : '—'}</td>
                  <td class="${td} text-right">${p.team.n ? `${formatMinutes(avg(p.team))} <span class="text-text-muted">(${p.team.n})</span>` : '—'}</td>
                  <td class="${td} text-right">${fmtKgH(kgPerHour(p.all))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </details>`;
}
