import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatDate } from '../utils.js';

export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <!-- Top Title & Navigation Tabs -->
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Cadastros & Formulações</h1>
          <p class="font-body-md text-body-md text-text-muted">Gerencie sabores, insumos, perfis de carne, colaboradores, parceiros e fichas técnicas versionadas.</p>
        </div>
      </div>

      <!-- Tabs Bar -->
      <div class="bg-surface-card rounded-xl p-1.5 shadow-sm flex items-center gap-1 overflow-x-auto">
        <button id="tab-flavors" class="catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bordeaux-primary text-on-primary font-label-md shadow-sm whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">restaurant_menu</span>
          <span>Sabores</span>
        </button>
        <button id="tab-ingredients" class="catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">grain</span>
          <span>Insumos</span>
        </button>
        <button id="tab-formulas" class="catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">science</span>
          <span>Formulações</span>
        </button>
        <button id="tab-meat-profiles" class="catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">set_meal</span>
          <span>Perfis de Carne</span>
        </button>
        <button id="tab-collaborators" class="catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">badge</span>
          <span>Colaboradores</span>
        </button>
        <button id="tab-partners" class="catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap">
          <span class="material-symbols-outlined text-[18px]">store</span>
          <span>Parceiros / Clientes</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="catalog-tab-content"></div>
    </div>
  `;

  setupTabs();
  renderFlavorsTab();
}

function setupTabs() {
  const tabs = [
    { id: 'tab-flavors', fn: renderFlavorsTab },
    { id: 'tab-ingredients', fn: renderIngredientsTab },
    { id: 'tab-formulas', fn: renderFormulasTab },
    { id: 'tab-meat-profiles', fn: renderMeatProfilesTab },
    { id: 'tab-collaborators', fn: renderCollaboratorsTab },
    { id: 'tab-partners', fn: renderPartnersTab }
  ];

  tabs.forEach(tab => {
    document.getElementById(tab.id)?.addEventListener('click', () => {
      tabs.forEach(t => {
        const btn = document.getElementById(t.id);
        if (btn) {
          btn.className = 'catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-muted hover:bg-surface-container hover:text-ink-text font-label-md whitespace-nowrap';
        }
      });
      const activeBtn = document.getElementById(tab.id);
      if (activeBtn) {
        activeBtn.className = 'catalog-tab flex items-center gap-2 px-4 py-2.5 rounded-lg bg-bordeaux-primary text-on-primary font-label-md shadow-sm whitespace-nowrap';
      }
      tab.fn();
    });
  });
}

// ----------------------------------------------------
// 1. SABORES
// ----------------------------------------------------
async function renderFlavorsTab() {
  const content = document.getElementById('catalog-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-center justify-between">
        <h2 class="font-headline-sm text-headline-sm text-ink-text">Cadastro de Sabores</h2>
        <button id="add-flavor-btn" class="min-h-[44px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors">
          <span class="material-symbols-outlined text-[20px]">add</span>
          <span>Novo Sabor</span>
        </button>
      </div>

      <div id="flavor-form-container" class="hidden bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-4">
        <h3 id="flavor-form-title" class="font-title-lg text-title-lg text-ink-text">Cadastrar Novo Sabor</h3>
        <form id="flavor-form" class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <input type="hidden" id="flavor-id">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Nome do Sabor</label>
            <input type="text" id="flavor-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: Linguiça Tradicional">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Observações</label>
            <input type="text" id="flavor-notes" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: Calibre 28mm, tripa natural">
          </div>
          <div class="flex items-center gap-2 md:col-span-2">
            <input type="checkbox" id="flavor-hamburger" class="w-5 h-5 accent-bordeaux-primary">
            <label for="flavor-hamburger" class="font-body-md text-ink-text">Permitir Formato Hambúrguer (Apenas Tradicional e Sabores de Bragança)</label>
          </div>
          <div class="flex items-center gap-2 md:col-span-2 justify-end">
            <button type="button" id="flavor-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar</button>
          </div>
        </form>
      </div>

      <div id="flavors-list-container"></div>
    </div>
  `;

  const addBtn = document.getElementById('add-flavor-btn');
  const formContainer = document.getElementById('flavor-form-container');
  const cancelBtn = document.getElementById('flavor-cancel-btn');
  const form = document.getElementById('flavor-form');

  addBtn?.addEventListener('click', () => {
    document.getElementById('flavor-id').value = '';
    document.getElementById('flavor-name').value = '';
    document.getElementById('flavor-notes').value = '';
    document.getElementById('flavor-hamburger').checked = false;
    document.getElementById('flavor-form-title').innerText = 'Cadastrar Novo Sabor';
    formContainer?.classList.remove('hidden');
  });

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('flavor-id').value;
    const name = document.getElementById('flavor-name').value.trim();
    const notes = document.getElementById('flavor-notes').value.trim();
    const hamburger_allowed = document.getElementById('flavor-hamburger').checked;

    // Regra de validação: Hambúrguer liberado somente para Tradicional e Sabores de Bragança
    const normalized = name.toLowerCase();
    const isAllowedHamburger = normalized.includes('tradicional') || normalized.includes('bragança') || normalized.includes('braganca');

    if (hamburger_allowed && !isAllowedHamburger) {
      showNotification('Hambúrguer é permitido estritamente para os sabores "Tradicional" e "Sabores de Bragança".', 'error');
      return;
    }

    try {
      if (id) {
        const { error } = await supabase.from('flavors').update({ name, notes, hamburger_allowed }).eq('id', id);
        if (error) throw error;
        showNotification('Sabor atualizado com sucesso!', 'success');
      } else {
        const { error } = await supabase.from('flavors').insert({ name, notes, hamburger_allowed });
        if (error) throw error;
        showNotification('Sabor cadastrado com sucesso!', 'success');
      }
      formContainer?.classList.add('hidden');
      loadFlavors();
    } catch (err) {
      showNotification(`Erro ao salvar sabor: ${err.message}`, 'error');
    }
  });

  loadFlavors();
}

async function loadFlavors() {
  const container = document.getElementById('flavors-list-container');
  if (!container) return;

  const { data: flavors, error } = await supabase.from('flavors').select('*').order('name');
  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar sabores: ${error.message}</div>`;
    return;
  }

  if (!flavors || flavors.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'restaurant_menu',
      title: 'Nenhum Sabor Cadastrado',
      description: 'Cadastre os sabores da produção para utilizá-los no planejamento e formulações.',
      actionText: 'Cadastrar Primeiro Sabor',
      onAction: () => document.getElementById('add-flavor-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-hidden">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Nome do Sabor</th>
            <th class="py-3 px-4 font-semibold">Hambúrguer Autorizado</th>
            <th class="py-3 px-4 font-semibold">Observações</th>
            <th class="py-3 px-4 font-semibold">Status</th>
            <th class="py-3 px-4 font-semibold text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${flavors.map(f => `
            <tr class="hover:bg-surface-canvas/60 transition-colors">
              <td class="py-3 px-4 font-bold text-bordeaux-primary">${f.name}</td>
              <td class="py-3 px-4">
                ${f.hamburger_allowed
                  ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success"><span class="material-symbols-outlined text-[14px]">check_circle</span>Sim</span>`
                  : `<span class="text-text-muted text-xs">Não</span>`}
              </td>
              <td class="py-3 px-4 text-text-muted">${f.notes || '—'}</td>
              <td class="py-3 px-4">
                ${f.active
                  ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativo</span>`
                  : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Inativo</span>`}
              </td>
              <td class="py-3 px-4 text-right">
                <button class="edit-flavor-btn px-3 py-1.5 rounded bg-surface-canvas hover:bg-wine-deep hover:text-on-primary text-bordeaux-primary font-label-md transition-colors" data-id="${f.id}" data-name="${f.name}" data-notes="${f.notes || ''}" data-hamburger="${f.hamburger_allowed}">Editar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.edit-flavor-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      document.getElementById('flavor-id').value = target.dataset.id;
      document.getElementById('flavor-name').value = target.dataset.name;
      document.getElementById('flavor-notes').value = target.dataset.notes;
      document.getElementById('flavor-hamburger').checked = target.dataset.hamburger === 'true';
      document.getElementById('flavor-form-title').innerText = 'Editar Sabor';
      document.getElementById('flavor-form-container')?.classList.remove('hidden');
    });
  });
}

// ----------------------------------------------------
// 2. INSUMOS
// ----------------------------------------------------
async function renderIngredientsTab() {
  const content = document.getElementById('catalog-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-center justify-between">
        <h2 class="font-headline-sm text-headline-sm text-ink-text">Cadastro de Insumos</h2>
        <button id="add-ingredient-btn" class="min-h-[44px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors">
          <span class="material-symbols-outlined text-[20px]">add</span>
          <span>Novo Insumo</span>
        </button>
      </div>

      <div id="ingredient-form-container" class="hidden bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-4">
        <h3 id="ingredient-form-title" class="font-title-lg text-title-lg text-ink-text">Cadastrar Novo Insumo</h3>
        <form id="ingredient-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="ingredient-id">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Nome do Insumo</label>
            <input type="text" id="ingredient-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: Sal com Nitrito, Alho Moído, Pimenta Biquinho">
          </div>
          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="ingredient-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar</button>
          </div>
        </form>
      </div>

      <div id="ingredients-list-container"></div>
    </div>
  `;

  const addBtn = document.getElementById('add-ingredient-btn');
  const formContainer = document.getElementById('ingredient-form-container');
  const cancelBtn = document.getElementById('ingredient-cancel-btn');
  const form = document.getElementById('ingredient-form');

  addBtn?.addEventListener('click', () => {
    document.getElementById('ingredient-id').value = '';
    document.getElementById('ingredient-name').value = '';
    document.getElementById('ingredient-form-title').innerText = 'Cadastrar Novo Insumo';
    formContainer?.classList.remove('hidden');
  });

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ingredient-id').value;
    const name = document.getElementById('ingredient-name').value.trim();

    try {
      if (id) {
        const { error } = await supabase.from('ingredients').update({ name }).eq('id', id);
        if (error) throw error;
        showNotification('Insumo atualizado com sucesso!', 'success');
      } else {
        const { error } = await supabase.from('ingredients').insert({ name });
        if (error) throw error;
        showNotification('Insumo cadastrado com sucesso!', 'success');
      }
      formContainer?.classList.add('hidden');
      loadIngredients();
    } catch (err) {
      showNotification(`Erro ao salvar insumo: ${err.message}`, 'error');
    }
  });

  loadIngredients();
}

async function loadIngredients() {
  const container = document.getElementById('ingredients-list-container');
  if (!container) return;

  const { data: ingredients, error } = await supabase.from('ingredients').select('*').order('name');
  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar insumos: ${error.message}</div>`;
    return;
  }

  if (!ingredients || ingredients.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'grain',
      title: 'Nenhum Insumo Cadastrado',
      description: 'Cadastre os insumos/temperos básicos para compor as fichas técnicas.',
      actionText: 'Cadastrar Primeiro Insumo',
      onAction: () => document.getElementById('add-ingredient-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-hidden">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Nome do Insumo</th>
            <th class="py-3 px-4 font-semibold">Status</th>
            <th class="py-3 px-4 font-semibold text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${ingredients.map(ing => `
            <tr class="hover:bg-surface-canvas/60 transition-colors">
              <td class="py-3 px-4 font-bold text-ink-text">${ing.name}</td>
              <td class="py-3 px-4">
                ${ing.active
                  ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativo</span>`
                  : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Inativo</span>`}
              </td>
              <td class="py-3 px-4 text-right">
                <button class="edit-ingredient-btn px-3 py-1.5 rounded bg-surface-canvas hover:bg-wine-deep hover:text-on-primary text-bordeaux-primary font-label-md transition-colors" data-id="${ing.id}" data-name="${ing.name}">Editar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.edit-ingredient-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      document.getElementById('ingredient-id').value = target.dataset.id;
      document.getElementById('ingredient-name').value = target.dataset.name;
      document.getElementById('ingredient-form-title').innerText = 'Editar Insumo';
      document.getElementById('ingredient-form-container')?.classList.remove('hidden');
    });
  });
}

// ----------------------------------------------------
// 3. FORMULAÇÕES VERSIONADAS
// ----------------------------------------------------
async function renderFormulasTab() {
  const content = document.getElementById('catalog-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-center justify-between">
        <h2 class="font-headline-sm text-headline-sm text-ink-text">Formulações Versionadas</h2>
        <button id="add-formula-btn" class="min-h-[44px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors">
          <span class="material-symbols-outlined text-[20px]">add</span>
          <span>Nova Formulação</span>
        </button>
      </div>

      <!-- Form para criar nova formulação -->
      <div id="formula-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Cadastrar Nova Versão de Receita</h3>
        <form id="formula-form" class="flex flex-col gap-space-md">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Sabor</label>
              <select id="formula-flavor-id" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary"></select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Perfil de Carne</label>
              <select id="formula-profile-id" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary"></select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Massa-Base (%) sobre Peso Final</label>
              <input type="number" step="0.01" id="formula-base-mass-pct" required value="90.00" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold focus:outline-none focus:border-bordeaux-primary">
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Nota/Fonte da Fórmula</label>
            <input type="text" id="formula-source-note" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: Ficha Técnica Revisitada 2026">
          </div>

          <div class="border-t border-border-subtle pt-space-md flex flex-col gap-space-sm">
            <div class="flex items-center justify-between">
              <h4 class="font-title-md text-ink-text">Insumos e Especiarias da Receita</h4>
              <button type="button" id="add-formula-line-btn" class="px-3 py-1.5 rounded bg-surface-canvas hover:bg-surface-variant text-bordeaux-primary font-label-md flex items-center gap-1">
                <span class="material-symbols-outlined text-[18px]">add</span>
                <span>Adicionar Insumo</span>
              </button>
            </div>

            <div id="formula-lines-container" class="flex flex-col gap-2"></div>

            <div class="p-3 bg-surface-container-low rounded-lg flex items-center justify-between">
              <span class="font-label-md text-ink-text">Validador de Soma: <strong id="formula-total-sum">90.00%</strong></span>
              <span id="formula-sum-badge" class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Incompleto (Precisa somar 100.00%)</span>
            </div>
          </div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="formula-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar Rascunho</button>
          </div>
        </form>
      </div>

      <div id="formulas-list-container"></div>
    </div>
  `;

  const addBtn = document.getElementById('add-formula-btn');
  const formContainer = document.getElementById('formula-form-container');
  const cancelBtn = document.getElementById('formula-cancel-btn');
  const form = document.getElementById('formula-form');
  const addLineBtn = document.getElementById('add-formula-line-btn');

  addBtn?.addEventListener('click', async () => {
    await populateFormulaDropdowns();
    document.getElementById('formula-lines-container').innerHTML = '';
    formContainer?.classList.remove('hidden');
    updateFormulaSum();
  });

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  addLineBtn?.addEventListener('click', async () => {
    await addFormulaIngredientRow();
  });

  document.getElementById('formula-base-mass-pct')?.addEventListener('input', updateFormulaSum);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const flavor_id = document.getElementById('formula-flavor-id').value;
    const meat_profile_id = document.getElementById('formula-profile-id').value;
    const base_mass_pct = parseFloat(document.getElementById('formula-base-mass-pct').value) || 0;
    const source_note = document.getElementById('formula-source-note').value.trim();

    // Calcular versão de número
    const { data: existingVersions } = await supabase.from('formula_versions').select('version_no').eq('flavor_id', flavor_id);
    const maxVer = (existingVersions || []).reduce((max, v) => Math.max(max, v.version_no), 0);
    const version_no = maxVer + 1;

    // Coletar linhas
    const lineRows = document.querySelectorAll('.formula-line-row');
    const ingredients = [];
    let linesSum = 0;

    lineRows.forEach(row => {
      const ingredient_id = row.querySelector('.line-ingredient-select').value;
      const ratio_pct = parseFloat(row.querySelector('.line-ratio-input').value) || 0;
      const unit = row.querySelector('.line-unit-select').value;
      if (ingredient_id && ratio_pct > 0) {
        ingredients.push({ ingredient_id, ratio_pct, unit });
        linesSum += ratio_pct;
      }
    });

    try {
      // 1. Criar versão como draft
      const { data: version, error: vErr } = await supabase.from('formula_versions').insert({
        flavor_id,
        meat_profile_id,
        version_no,
        base_mass_pct,
        source_note,
        status: 'draft'
      }).select().single();

      if (vErr) throw vErr;

      // 2. Inserir linhas de insumos
      if (ingredients.length > 0) {
        const rows = ingredients.map(i => ({ ...i, formula_version_id: version.id }));
        const { error: iErr } = await supabase.from('formula_ingredients').insert(rows);
        if (iErr) throw iErr;
      }

      showNotification(`Formulação Rascunho (v${version_no}) salva com sucesso!`, 'success');
      formContainer?.classList.add('hidden');
      loadFormulas();
    } catch (err) {
      showNotification(`Erro ao salvar formulação: ${err.message}`, 'error');
    }
  });

  loadFormulas();
}

async function populateFormulaDropdowns() {
  const flavorSelect = document.getElementById('formula-flavor-id');
  const profileSelect = document.getElementById('formula-profile-id');

  const { data: flavors } = await supabase.from('flavors').select('id, name').eq('active', true).order('name');
  const { data: profiles } = await supabase.from('meat_profiles').select('id, name').eq('active', true).order('name');

  if (flavorSelect) {
    flavorSelect.innerHTML = (flavors || []).map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  }
  if (profileSelect) {
    profileSelect.innerHTML = (profiles || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }
}

async function addFormulaIngredientRow() {
  const container = document.getElementById('formula-lines-container');
  if (!container) return;

  const { data: ingredients } = await supabase.from('ingredients').select('id, name').eq('active', true).order('name');

  const row = document.createElement('div');
  row.className = 'formula-line-row grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-surface-canvas p-2 rounded-lg';
  row.innerHTML = `
    <div class="md:col-span-5">
      <select class="line-ingredient-select w-full min-h-[40px] px-3 rounded border border-border-subtle bg-surface-card text-ink-text">
        ${(ingredients || []).map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
      </select>
    </div>
    <div class="md:col-span-3 flex items-center gap-1">
      <input type="number" step="0.0001" class="line-ratio-input w-full min-h-[40px] px-3 rounded border border-border-subtle bg-surface-card font-bold text-ink-text" placeholder="Proporção (%)" value="1.00">
      <span class="text-xs font-bold text-text-muted">%</span>
    </div>
    <div class="md:col-span-3">
      <select class="line-unit-select w-full min-h-[40px] px-3 rounded border border-border-subtle bg-surface-card text-ink-text">
        <option value="kg">kg</option>
        <option value="g">g</option>
        <option value="ml">ml</option>
        <option value="l">l</option>
        <option value="un">un</option>
      </select>
    </div>
    <div class="md:col-span-1 text-right">
      <button type="button" class="remove-line-btn p-2 rounded hover:bg-badge-error-bg text-alert-critical"><span class="material-symbols-outlined text-[20px]">delete</span></button>
    </div>
  `;

  row.querySelector('.line-ratio-input')?.addEventListener('input', updateFormulaSum);
  row.querySelector('.remove-line-btn')?.addEventListener('click', () => {
    row.remove();
    updateFormulaSum();
  });

  container.appendChild(row);
  updateFormulaSum();
}

function updateFormulaSum() {
  const baseMass = parseFloat(document.getElementById('formula-base-mass-pct')?.value) || 0;
  let linesSum = 0;

  document.querySelectorAll('.line-ratio-input').forEach(input => {
    linesSum += parseFloat(input.value) || 0;
  });

  const total = baseMass + linesSum;
  const sumEl = document.getElementById('formula-total-sum');
  const badgeEl = document.getElementById('formula-sum-badge');

  if (sumEl) sumEl.innerText = `${total.toFixed(2)}%`;

  if (badgeEl) {
    if (Math.abs(total - 100) < 0.01) {
      badgeEl.className = 'px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success';
      badgeEl.innerText = 'Válido ✓ (Pronto para Ativar)';
    } else {
      badgeEl.className = 'px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text';
      badgeEl.innerText = `Incompleto (${total.toFixed(2)}% — precisa somar 100.00%)`;
    }
  }
}

async function loadFormulas() {
  const container = document.getElementById('formulas-list-container');
  if (!container) return;

  const { data: versions, error } = await supabase
    .from('formula_versions')
    .select(`
      *,
      flavors (name),
      meat_profiles (name),
      formula_ingredients (
        ratio_pct, unit,
        ingredients (name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar formulações: ${error.message}</div>`;
    return;
  }

  if (!versions || versions.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'science',
      title: 'Nenhuma Formulação Cadastrada',
      description: 'Cadastre a ficha técnica com massa-base e insumos somando 100% para ativá-la.',
      actionText: 'Cadastrar Primeira Formulação',
      onAction: () => document.getElementById('add-formula-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${versions.map(v => {
        const ingredientsSum = (v.formula_ingredients || []).reduce((sum, fi) => sum + Number(fi.ratio_pct), 0);
        const total = Number(v.base_mass_pct) + ingredientsSum;
        const isValid = Math.abs(total - 100) < 0.01;

        return `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-3">
            <div class="flex flex-col gap-2">
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="font-headline-sm text-ink-text">${v.flavors?.name || 'Sabor Indefinido'}</h3>
                  <span class="text-xs font-bold text-text-muted">Versão v${v.version_no} • ${v.meat_profiles?.name}</span>
                </div>
                ${v.status === 'active'
                  ? `<span class="px-2.5 py-1 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativa</span>`
                  : v.status === 'draft'
                  ? `<span class="px-2.5 py-1 rounded text-xs font-bold bg-badge-warning-bg text-badge-warning-text">Rascunho</span>`
                  : `<span class="px-2.5 py-1 rounded text-xs font-bold bg-surface-canvas text-text-muted">Arquivada</span>`}
              </div>

              <div class="p-3 bg-surface-canvas rounded-lg text-xs flex flex-col gap-1">
                <div class="flex justify-between font-bold text-ink-text">
                  <span>Massa-Base Cárnea:</span>
                  <span>${v.base_mass_pct}%</span>
                </div>
                ${(v.formula_ingredients || []).map(fi => `
                  <div class="flex justify-between text-text-muted">
                    <span>• ${fi.ingredients?.name}:</span>
                    <span class="font-bold text-ink-text">${fi.ratio_pct}% (${fi.unit})</span>
                  </div>
                `).join('')}
                <div class="border-t border-border-subtle pt-1 mt-1 flex justify-between font-bold text-ink-text">
                  <span>Soma Total:</span>
                  <span class="${isValid ? 'text-status-success' : 'text-alert-critical'}">${total.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between border-t border-border-subtle pt-2">
              <span class="text-[11px] text-text-muted">${v.source_note || 'Sem observações'}</span>
              ${v.status === 'draft'
                ? `<button class="activate-formula-btn px-3 py-1.5 rounded bg-bordeaux-primary text-on-primary font-label-md hover:bg-wine-deep transition-colors" data-id="${v.id}">Ativar Receita</button>`
                : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelectorAll('.activate-formula-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      try {
        const { error } = await supabase.from('formula_versions').update({ status: 'active' }).eq('id', id);
        if (error) throw error;
        showNotification('Formulação ativada com sucesso!', 'success');
        loadFormulas();
      } catch (err) {
        showNotification(`Erro ao ativar formulação: ${err.message}`, 'error');
      }
    });
  });
}

// ----------------------------------------------------
// 4. PERFIS DE CARNE
// ----------------------------------------------------
async function renderMeatProfilesTab() {
  const content = document.getElementById('catalog-tab-content');
  if (!content) return;

  const { data: profiles, error } = await supabase.from('meat_profiles').select('*, meat_profile_cuts(*)').order('name');

  if (error) {
    content.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar perfis de carne: ${error.message}</div>`;
    return;
  }

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <h2 class="font-headline-sm text-headline-sm text-ink-text">Perfis Cárneos Homologados</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        ${(profiles || []).map(p => `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <h3 class="font-title-md text-ink-text font-bold">${p.name}</h3>
                <span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Homologado</span>
              </div>
              <div class="p-3 bg-surface-canvas rounded-lg text-xs flex flex-col gap-1 mt-2">
                <span class="font-label-md text-text-muted uppercase">Cortes e Proporções:</span>
                ${(p.meat_profile_cuts || []).map(cut => `
                  <div class="flex justify-between font-bold text-ink-text">
                    <span>• ${cut.cut_name}:</span>
                    <span class="text-bordeaux-primary">${cut.ratio_pct}%</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// 5. COLABORADORES
// ----------------------------------------------------
async function renderCollaboratorsTab() {
  const content = document.getElementById('catalog-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-center justify-between">
        <h2 class="font-headline-sm text-headline-sm text-ink-text">Equipe de Produção & Colaboradores</h2>
        <button id="add-collaborator-btn" class="min-h-[44px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors">
          <span class="material-symbols-outlined text-[20px]">add</span>
          <span>Novo Colaborador</span>
        </button>
      </div>

      <div id="collaborator-form-container" class="hidden bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-4">
        <h3 id="collaborator-form-title" class="font-title-lg text-title-lg text-ink-text">Cadastrar Novo Colaborador</h3>
        <form id="collaborator-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="collaborator-id">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Nome Completo</label>
            <input type="text" id="collaborator-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: Carlos Mateus">
          </div>
          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="collaborator-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar</button>
          </div>
        </form>
      </div>

      <div id="collaborators-list-container"></div>
    </div>
  `;

  const addBtn = document.getElementById('add-collaborator-btn');
  const formContainer = document.getElementById('collaborator-form-container');
  const cancelBtn = document.getElementById('collaborator-cancel-btn');
  const form = document.getElementById('collaborator-form');

  addBtn?.addEventListener('click', () => {
    document.getElementById('collaborator-id').value = '';
    document.getElementById('collaborator-name').value = '';
    document.getElementById('collaborator-form-title').innerText = 'Cadastrar Novo Colaborador';
    formContainer?.classList.remove('hidden');
  });

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('collaborator-id').value;
    const full_name = document.getElementById('collaborator-name').value.trim();

    try {
      if (id) {
        const { error } = await supabase.from('collaborators').update({ full_name }).eq('id', id);
        if (error) throw error;
        showNotification('Colaborador atualizado com sucesso!', 'success');
      } else {
        const { error } = await supabase.from('collaborators').insert({ full_name });
        if (error) throw error;
        showNotification('Colaborador cadastrado com sucesso!', 'success');
      }
      formContainer?.classList.add('hidden');
      loadCollaborators();
    } catch (err) {
      showNotification(`Erro ao salvar colaborador: ${err.message}`, 'error');
    }
  });

  loadCollaborators();
}

async function loadCollaborators() {
  const container = document.getElementById('collaborators-list-container');
  if (!container) return;

  const { data: collaborators, error } = await supabase.from('collaborators').select('*').order('full_name');
  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar colaboradores: ${error.message}</div>`;
    return;
  }

  if (!collaborators || collaborators.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'badge',
      title: 'Nenhum Colaborador Cadastrado',
      description: 'Cadastre os operadores da fábrica para registrá-los no embutimento, vácuo e rotulagem.',
      actionText: 'Cadastrar Primeiro Colaborador',
      onAction: () => document.getElementById('add-collaborator-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-hidden">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Nome Completo</th>
            <th class="py-3 px-4 font-semibold">Data de Cadastro</th>
            <th class="py-3 px-4 font-semibold">Status</th>
            <th class="py-3 px-4 font-semibold text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${collaborators.map(c => `
            <tr class="hover:bg-surface-canvas/60 transition-colors">
              <td class="py-3 px-4 font-bold text-ink-text">${c.full_name}</td>
              <td class="py-3 px-4 text-text-muted">${formatDate(c.created_at)}</td>
              <td class="py-3 px-4">
                ${c.active
                  ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativo</span>`
                  : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Inativo</span>`}
              </td>
              <td class="py-3 px-4 text-right">
                <button class="edit-collaborator-btn px-3 py-1.5 rounded bg-surface-canvas hover:bg-wine-deep hover:text-on-primary text-bordeaux-primary font-label-md transition-colors" data-id="${c.id}" data-name="${c.full_name}">Editar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.edit-collaborator-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      document.getElementById('collaborator-id').value = target.dataset.id;
      document.getElementById('collaborator-name').value = target.dataset.name;
      document.getElementById('collaborator-form-title').innerText = 'Editar Colaborador';
      document.getElementById('collaborator-form-container')?.classList.remove('hidden');
    });
  });
}

// ----------------------------------------------------
// 6. PARCEIROS / CLIENTES
// ----------------------------------------------------
async function renderPartnersTab() {
  const content = document.getElementById('catalog-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-col gap-space-md">
      <div class="flex items-center justify-between">
        <h2 class="font-headline-sm text-headline-sm text-ink-text">Parceiros e Destinos Comercializados</h2>
        <button id="add-partner-btn" class="min-h-[44px] px-4 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors">
          <span class="material-symbols-outlined text-[20px]">add</span>
          <span>Novo Parceiro</span>
        </button>
      </div>

      <div id="partner-form-container" class="hidden bg-surface-card p-space-md rounded-xl border border-border-subtle shadow-sm flex flex-col gap-4">
        <h3 id="partner-form-title" class="font-title-lg text-title-lg text-ink-text">Cadastrar Novo Parceiro</h3>
        <form id="partner-form" class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <input type="hidden" id="partner-id">
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Nome do Parceiro/Cliente</label>
            <input type="text" id="partner-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary" placeholder="Ex: Empório Central, Atacado Sul">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-md text-ink-text">Tipo de Canal/Destino</label>
            <select id="partner-type" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text focus:outline-none focus:border-bordeaux-primary">
              <option value="emporio">Empório</option>
              <option value="lanchonete">Lanchonete</option>
              <option value="atacado">Atacado</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="flex items-center gap-2 md:col-span-2 justify-end">
            <button type="button" id="partner-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Salvar</button>
          </div>
        </form>
      </div>

      <div id="partners-list-container"></div>
    </div>
  `;

  const addBtn = document.getElementById('add-partner-btn');
  const formContainer = document.getElementById('partner-form-container');
  const cancelBtn = document.getElementById('partner-cancel-btn');
  const form = document.getElementById('partner-form');

  addBtn?.addEventListener('click', () => {
    document.getElementById('partner-id').value = '';
    document.getElementById('partner-name').value = '';
    document.getElementById('partner-form-title').innerText = 'Cadastrar Novo Parceiro';
    formContainer?.classList.remove('hidden');
  });

  cancelBtn?.addEventListener('click', () => {
    formContainer?.classList.add('hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('partner-id').value;
    const name = document.getElementById('partner-name').value.trim();
    const partner_type = document.getElementById('partner-type').value;

    try {
      if (id) {
        const { error } = await supabase.from('partners').update({ name, partner_type }).eq('id', id);
        if (error) throw error;
        showNotification('Parceiro atualizado com sucesso!', 'success');
      } else {
        const { error } = await supabase.from('partners').insert({ name, partner_type });
        if (error) throw error;
        showNotification('Parceiro cadastrado com sucesso!', 'success');
      }
      formContainer?.classList.add('hidden');
      loadPartners();
    } catch (err) {
      showNotification(`Erro ao salvar parceiro: ${err.message}`, 'error');
    }
  });

  loadPartners();
}

async function loadPartners() {
  const container = document.getElementById('partners-list-container');
  if (!container) return;

  const { data: partners, error } = await supabase.from('partners').select('*').order('name');
  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar parceiros: ${error.message}</div>`;
    return;
  }

  if (!partners || partners.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'store',
      title: 'Nenhum Parceiro Cadastrado',
      description: 'Cadastre clientes de atacado, empórios e lanchonetes para direcionamento de demanda.',
      actionText: 'Cadastrar Primeiro Parceiro',
      onAction: () => document.getElementById('add-partner-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-hidden">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Nome do Parceiro</th>
            <th class="py-3 px-4 font-semibold">Tipo / Canal</th>
            <th class="py-3 px-4 font-semibold">Status</th>
            <th class="py-3 px-4 font-semibold text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${partners.map(p => `
            <tr class="hover:bg-surface-canvas/60 transition-colors">
              <td class="py-3 px-4 font-bold text-ink-text">${p.name}</td>
              <td class="py-3 px-4 uppercase font-label-sm text-text-muted">${p.partner_type}</td>
              <td class="py-3 px-4">
                ${p.active
                  ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativo</span>`
                  : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Inativo</span>`}
              </td>
              <td class="py-3 px-4 text-right">
                <button class="edit-partner-btn px-3 py-1.5 rounded bg-surface-canvas hover:bg-wine-deep hover:text-on-primary text-bordeaux-primary font-label-md transition-colors" data-id="${p.id}" data-name="${p.name}" data-type="${p.partner_type}">Editar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.edit-partner-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      document.getElementById('partner-id').value = target.dataset.id;
      document.getElementById('partner-name').value = target.dataset.name;
      document.getElementById('partner-type').value = target.dataset.type;
      document.getElementById('partner-form-title').innerText = 'Editar Parceiro';
      document.getElementById('partner-form-container')?.classList.remove('hidden');
    });
  });
}
