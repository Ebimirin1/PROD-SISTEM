import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatWeight, formatDate } from '../utils.js';

// Módulo de Separação de Insumos e Especiarias por Kit / Porção de até 30kg
let currentSeparationTab = 'all'; // 'all', 'in_separation', 'completed'

export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Separação de Insumos e Especiarias</h1>
          <p class="font-body-md text-body-md text-text-muted">Kits de insumos fracionados por lote total por sabor, conferência de pesagem na balança e registro de lotes/divergências.</p>
        </div>

        <!-- Filtros de Status de Separação -->
        <div class="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-border-subtle shadow-sm">
          <button id="sep-tab-all" class="sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentSeparationTab === 'all' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Todos
          </button>
          <button id="sep-tab-in_separation" class="sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentSeparationTab === 'in_separation' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Em Separação
          </button>
          <button id="sep-tab-completed" class="sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors ${currentSeparationTab === 'completed' ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : 'text-text-muted hover:text-ink-text'}">
            Concluído
          </button>
        </div>
      </div>

      <div id="separation-list-container"></div>
    </div>
  `;

  setupTabListeners(container);
  loadSeparationPortions();
}

function setupTabListeners(container) {
  const tabAll = container.querySelector('#sep-tab-all');
  const tabInSeparation = container.querySelector('#sep-tab-in_separation');
  const tabCompleted = container.querySelector('#sep-tab-completed');

  const updateTabStyles = (activeBtn) => {
    [tabAll, tabInSeparation, tabCompleted].forEach(btn => {
      if (btn === activeBtn) {
        btn.className = 'sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors bg-bordeaux-primary text-on-primary font-bold shadow-sm';
      } else {
        btn.className = 'sep-tab-btn px-4 py-2 rounded-lg font-label-md text-label-md transition-colors text-text-muted hover:text-ink-text';
      }
    });
  };

  tabAll?.addEventListener('click', () => {
    currentSeparationTab = 'all';
    updateTabStyles(tabAll);
    loadSeparationPortions();
  });

  tabInSeparation?.addEventListener('click', () => {
    currentSeparationTab = 'in_separation';
    updateTabStyles(tabInSeparation);
    loadSeparationPortions();
  });

  tabCompleted?.addEventListener('click', () => {
    currentSeparationTab = 'completed';
    updateTabStyles(tabCompleted);
    loadSeparationPortions();
  });
}

async function loadSeparationPortions() {
  const container = document.getElementById('separation-list-container');
  if (!container) return;

  const { data: portions, error } = await supabase
    .from('production_portions')
    .select(`
      *,
      flavors (name),
      production_orders (order_code),
      portion_ingredient_lines (
        id, requested_quantity, separated_quantity, unit, ingredient_lot, status, variance_reason,
        ingredients (name),
        collaborators (full_name)
      )
    `)
    .order('portion_no', { ascending: true });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar porções para separação: ${error.message}</div>`;
    return;
  }

  // Mapear e calcular estado de cada porção
  let filteredPortions = (portions || []).map(p => {
    const lines = p.portion_ingredient_lines || [];
    const isAllSeparated = lines.length > 0 && lines.every(l => l.status === 'separated' || l.status === 'adjusted');
    return {
      ...p,
      isAllSeparated
    };
  });

  // Filtrar de acordo com a aba selecionada
  if (currentSeparationTab === 'in_separation') {
    filteredPortions = filteredPortions.filter(p => !p.isAllSeparated);
  } else if (currentSeparationTab === 'completed') {
    filteredPortions = filteredPortions.filter(p => p.isAllSeparated);
  }

  if (filteredPortions.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'scale',
      title: 'Nenhuma Ordem de Separação Encontrada',
      description: 'Não há kits de separação correspondentes ao filtro selecionado.',
      actionText: null
    }));
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      ${filteredPortions.map(p => {
        const lines = p.portion_ingredient_lines || [];
        const isAllSeparated = p.isAllSeparated;

        return `
          <div class="bg-surface-card rounded-xl p-space-md shadow-sm border border-border-subtle flex flex-col justify-between gap-space-md">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between border-b border-border-subtle pb-2">
                <div>
                  <span class="text-xs font-bold text-text-muted uppercase">${p.production_orders?.order_code}</span>
                  <h3 class="font-headline-sm text-ink-text">${p.flavors?.name} — Porção #${p.portion_no}</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                  isAllSeparated ? 'bg-surface-container-low text-status-success' : 'bg-badge-warning-bg text-badge-warning-text'
                }">
                  ${isAllSeparated ? 'Kit Separado ✓' : 'Separação Pendente'}
                </span>
              </div>

              <div class="flex items-center justify-between text-xs font-bold text-text-muted">
                <span>Peso Pretendido da Porção: ${formatWeight(p.planned_kg)}</span>
                <span>Itens: ${lines.length}</span>
              </div>

              <div class="flex flex-col gap-2 mt-2">
                ${lines.map(l => `
                  <div class="p-3 bg-surface-canvas rounded-lg flex flex-col gap-2 text-xs border border-border-subtle">
                    <div class="flex items-center justify-between font-bold text-ink-text">
                      <span>${l.ingredients?.name}</span>
                      <span class="text-bordeaux-primary">${l.requested_quantity} ${l.unit}</span>
                    </div>

                    ${l.status === 'pending' ? `
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center pt-1 border-t border-border-subtle/50">
                        <input type="text" class="line-lot-input px-2 py-1 rounded border border-border-subtle bg-surface-card" placeholder="Lote do Insumo" id="lot-${l.id}">
                        <input type="number" step="0.001" class="line-qty-input px-2 py-1 rounded border border-border-subtle bg-surface-card font-bold" value="${l.requested_quantity}" id="qty-${l.id}">
                        <button class="confirm-separate-btn min-h-[36px] px-3 rounded bg-bordeaux-primary text-on-primary font-bold hover:bg-wine-deep transition-colors" data-id="${l.id}">
                          Confirmar Pesagem
                        </button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-between text-text-muted pt-1 border-t border-border-subtle/50">
                        <span>Separado: <strong>${l.separated_quantity} ${l.unit}</strong> (Lote: ${l.ingredient_lot || '—'})</span>
                        <span class="text-status-success font-bold">Concluído ✓</span>
                      </div>
                    `}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Listener para confirmar pesagem individual
  container.querySelectorAll('.confirm-separate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const lineId = e.currentTarget.dataset.id;
      const lot = document.getElementById(`lot-${lineId}`)?.value.trim();
      const qty = parseFloat(document.getElementById(`qty-${lineId}`)?.value);

      if (!lot) {
        showNotification('Informe o código do lote do insumo.', 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        showNotification('Informe uma quantidade válida.', 'error');
        return;
      }

      try {
        const { error } = await supabase
          .from('portion_ingredient_lines')
          .update({
            ingredient_lot: lot,
            separated_quantity: qty,
            status: 'separated',
            separated_at: new Date().toISOString()
          })
          .eq('id', lineId);

        if (error) throw error;
        showNotification('Insumo separado e verificado na balança!', 'success');
        loadSeparationPortions();
      } catch (err) {
        showNotification(`Erro ao salvar separação: ${err.message}`, 'error');
      }
    });
  });
}
