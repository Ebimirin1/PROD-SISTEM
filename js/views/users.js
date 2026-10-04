import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState, formatDate } from '../utils.js';

// Módulo de Gestão de Usuários & Permissões por Tela
export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Usuários & Acessos</h1>
          <p class="font-body-md text-body-md text-text-muted">Gerencie os acessos por tela dos operadores e convide novos usuários via Edge Function.</p>
        </div>
        <button id="invite-user-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm">
          <span class="material-symbols-outlined text-[20px]">person_add</span>
          <span>Convidar Novo Usuário</span>
        </button>
      </div>

      <!-- Form para Convidar Usuário -->
      <div id="invite-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Convidar Novo Usuário do Sistema</h3>
        <form id="invite-form" class="flex flex-col gap-space-md">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">Nome de Exibição / Operador</label>
              <input type="text" id="invite-display-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text" placeholder="Ex: João da Silva">
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text">E-mail do Usuário</label>
              <input type="email" id="invite-email" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text" placeholder="joao@exemplo.com">
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" id="invite-is-admin" class="w-5 h-5 accent-bordeaux-primary">
            <label for="invite-is-admin" class="font-body-md text-ink-text font-bold">Conceder Acesso de Administrador Geral (Todas as Telas)</label>
          </div>

          <div class="border-t border-border-subtle pt-space-md flex flex-col gap-2">
            <label class="font-title-md text-ink-text">Permissões de Acesso às Telas</label>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-space-sm text-xs">
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="overview" class="screen-perm-check accent-bordeaux-primary"> Visão Geral
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="planning" class="screen-perm-check accent-bordeaux-primary"> Planejamento
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="catalogs" class="screen-perm-check accent-bordeaux-primary"> Cadastros & Fórmulas
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="separation" class="screen-perm-check accent-bordeaux-primary"> Separação Insumos
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="production" class="screen-perm-check accent-bordeaux-primary"> Produção
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="inventory" class="screen-perm-check accent-bordeaux-primary"> Estoque & Cura
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="shipping" class="screen-perm-check accent-bordeaux-primary"> Pedidos & Expedição
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="billing" class="screen-perm-check accent-bordeaux-primary"> Faturamento
              </label>
              <label class="flex items-center gap-2 p-2 bg-surface-canvas rounded">
                <input type="checkbox" value="users" class="screen-perm-check accent-bordeaux-primary"> Usuários & Acessos
              </label>
            </div>
          </div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="invite-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" id="invite-submit-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2">
              <span>Enviar Convite</span>
              <span class="material-symbols-outlined text-[18px]">send</span>
            </button>
          </div>
        </form>
      </div>

      <div id="users-list-container"></div>
    </div>
  `;

  document.getElementById('invite-user-btn')?.addEventListener('click', () => {
    document.getElementById('invite-display-name').value = '';
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-is-admin').checked = false;
    document.querySelectorAll('.screen-perm-check').forEach(cb => cb.checked = false);
    document.getElementById('invite-form-container')?.classList.remove('hidden');
  });

  document.getElementById('invite-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('invite-form-container')?.classList.add('hidden');
  });

  document.getElementById('invite-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('invite-submit-btn');
    submitBtn.disabled = true;

    const displayName = document.getElementById('invite-display-name').value.trim();
    const email = document.getElementById('invite-email').value.trim();
    const isAdmin = document.getElementById('invite-is-admin').checked;

    const screenPermissions = [];
    document.querySelectorAll('.screen-perm-check:checked').forEach(cb => {
      screenPermissions.push(cb.value);
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('https://ywnsowvomewoyedqozuh.supabase.co/functions/v1/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          email,
          displayName,
          isAdmin,
          screenPermissions
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Erro ao invocar Edge Function de convite.');
      }

      showNotification('Convite enviado e permissões atribuídas!', 'success');
      document.getElementById('invite-form-container')?.classList.add('hidden');
      loadUsers();
    } catch (err) {
      showNotification(`Erro ao convidar usuário: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadUsers();
}

async function loadUsers() {
  const container = document.getElementById('users-list-container');
  if (!container) return;

  const { data: users, error } = await supabase
    .from('app_users')
    .select(`
      *,
      user_screen_permissions (screen_key)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="p-4 bg-badge-error-bg text-badge-error-text rounded-lg">Erro ao carregar usuários: ${error.message}</div>`;
    return;
  }

  if (!users || users.length === 0) {
    container.innerHTML = '';
    container.appendChild(renderEmptyState({
      icon: 'manage_accounts',
      title: 'Nenhum Usuário Encontrado',
      description: 'Convide o primeiro usuário para acessar o SGP Industrial.',
      actionText: 'Convidar Usuário',
      onAction: () => document.getElementById('invite-user-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-hidden">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Nome de Exibição</th>
            <th class="py-3 px-4 font-semibold">Papel</th>
            <th class="py-3 px-4 font-semibold">Telas Acessíveis</th>
            <th class="py-3 px-4 font-semibold">Status</th>
            <th class="py-3 px-4 font-semibold text-right">Ação</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${users.map(u => {
            const perms = (u.user_screen_permissions || []).map(p => p.screen_key);

            return `
              <tr class="hover:bg-surface-canvas/60 transition-colors">
                <td class="py-3 px-4 font-bold text-ink-text">${u.display_name}</td>
                <td class="py-3 px-4">
                  ${u.is_admin
                    ? `<span class="px-2.5 py-0.5 rounded text-xs font-bold bg-bordeaux-primary text-on-primary">Administrador</span>`
                    : `<span class="px-2.5 py-0.5 rounded text-xs font-bold bg-surface-canvas text-text-muted">Operador</span>`}
                </td>
                <td class="py-3 px-4 text-xs">
                  ${u.is_admin ? '<span class="font-bold text-status-success">Todas as telas (Geral)</span>' : perms.join(', ') || 'Nenhuma'}
                </td>
                <td class="py-3 px-4">
                  ${u.active
                    ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativo</span>`
                    : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Inativo</span>`}
                </td>
                <td class="py-3 px-4 text-right">
                  <button class="toggle-user-active-btn px-3 py-1 rounded border border-border-subtle text-xs font-bold hover:bg-surface-canvas" data-userid="${u.user_id}" data-active="${u.active}">
                    ${u.active ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.toggle-user-active-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.currentTarget.dataset.userid;
      const currentActive = e.currentTarget.dataset.active === 'true';

      try {
        const { error } = await supabase.from('app_users').update({ active: !currentActive }).eq('user_id', userId);
        if (error) throw error;
        showNotification(`Status do usuário atualizado!`, 'success');
        loadUsers();
      } catch (err) {
        showNotification(`Erro ao alterar status: ${err.message}`, 'error');
      }
    });
  });
}
