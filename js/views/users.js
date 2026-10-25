import { supabase } from '../supabaseClient.js';
import { showNotification, renderEmptyState } from '../utils.js';
import { SCREENS, SCREEN_KEYS } from '../screens.js';

// Função ainda não criada no banco → orienta a rodar o SQL
function rpcErrorMessage(error) {
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) {
    return 'O banco ainda não tem o cadastro interno. Rode o arquivo migration_internal_users.sql no Supabase (SQL Editor) e tente de novo.';
  }
  return error.message;
}

// Caixas de seleção de telas, com atalho para marcar/desmarcar todas
function renderScreenChecks(checkClass) {
  return `
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" data-check-all="${checkClass}" class="px-3 py-1 rounded border border-border-subtle text-xs font-bold hover:bg-surface-canvas">Marcar todas</button>
      <button type="button" data-uncheck-all="${checkClass}" class="px-3 py-1 rounded border border-border-subtle text-xs font-bold hover:bg-surface-canvas">Desmarcar todas</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-space-sm text-xs">
      ${SCREENS.map(s => `
        <label class="flex items-start gap-2 p-2 bg-surface-canvas rounded">
          <input type="checkbox" value="${s.key}" class="${checkClass} accent-bordeaux-primary mt-0.5">
          <span><span class="font-bold">${s.title}</span>${s.includes ? `<span class="block text-[11px] text-text-muted">${s.includes}</span>` : ''}</span>
        </label>
      `).join('')}
    </div>
  `;
}

// Administrador já vê todas as telas: as caixas ficam travadas enquanto a opção estiver marcada
function syncAdminLock(adminCheckboxId, checkClass) {
  const isAdmin = document.getElementById(adminCheckboxId)?.checked;
  document.querySelectorAll(`.${checkClass}`).forEach(cb => {
    cb.disabled = isAdmin;
    cb.closest('label')?.classList.toggle('opacity-50', isAdmin);
  });
  document.querySelectorAll(`[data-check-all="${checkClass}"], [data-uncheck-all="${checkClass}"]`).forEach(btn => {
    btn.disabled = isAdmin;
    btn.classList.toggle('opacity-50', isAdmin);
  });
}

function setupScreenCheckShortcuts() {
  document.querySelectorAll('[data-check-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`.${btn.dataset.checkAll}`).forEach(cb => { cb.checked = true; });
    });
  });
  document.querySelectorAll('[data-uncheck-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`.${btn.dataset.uncheckAll}`).forEach(cb => { cb.checked = false; });
    });
  });
  document.getElementById('invite-is-admin')?.addEventListener('change', () => syncAdminLock('invite-is-admin', 'screen-perm-check'));
  document.getElementById('edit-is-admin')?.addEventListener('change', () => syncAdminLock('edit-is-admin', 'edit-perm-check'));
}

export async function render(container) {
  container.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <h1 class="font-display-lg text-display-lg text-ink-text">Usuários & Permissões por Tela</h1>
          <p class="font-body-md text-body-md text-text-muted">Cadastre usuários com login e senha (sem e-mail) e escolha quais telas cada operário pode acessar.</p>
        </div>
        <button id="invite-user-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 transition-colors shadow-sm">
          <span class="material-symbols-outlined text-[20px]">person_add</span>
          <span>Cadastrar Novo Usuário</span>
        </button>
      </div>

      <!-- Modal/Form para Convidar/Cadastrar Usuário -->
      <div id="invite-form-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Cadastrar Novo Usuário do Sistema</h3>
        <form id="invite-form" class="flex flex-col gap-space-md">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold">Nome de Exibição / Operador <span class="text-alert-critical">*</span></label>
              <input type="text" id="invite-display-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: João da Silva">
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold">Usuário (login) <span class="text-alert-critical">*</span></label>
              <input type="text" id="invite-login" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9._\-]{3,30}" autocomplete="off" autocapitalize="none" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Ex: joao.silva">
              <span class="text-[11px] text-text-muted">Sem espaços nem acentos. É o que a pessoa digita para entrar.</span>
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold">Senha <span class="text-alert-critical">*</span></label>
              <input type="password" id="invite-password" required minlength="6" autocomplete="new-password" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Mínimo 6 caracteres">
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" id="invite-is-admin" class="w-5 h-5 accent-bordeaux-primary">
            <label for="invite-is-admin" class="font-body-md text-ink-text font-bold">Conceder Acesso de Administrador Geral (Acesso Total)</label>
          </div>

          <div class="border-t border-border-subtle pt-space-md flex flex-col gap-2">
            <label class="font-title-md text-ink-text">Permissões de Acesso por Tela (Operário)</label>
            ${renderScreenChecks('screen-perm-check')}
          </div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="invite-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" id="invite-submit-btn" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md flex items-center gap-2 shadow-sm">
              <span>Cadastrar Usuário</span>
              <span class="material-symbols-outlined text-[18px]">check_circle</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Modal/Form para Editar Permissões de Usuário Existente -->
      <div id="edit-user-container" class="hidden bg-surface-card p-space-lg rounded-xl border border-border-subtle shadow-sm flex flex-col gap-space-md">
        <h3 class="font-title-lg text-title-lg text-ink-text">Editar Permissões do Usuário</h3>
        <form id="edit-user-form" class="flex flex-col gap-space-md">
          <input type="hidden" id="edit-user-id">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold">Nome de Exibição</label>
              <input type="text" id="edit-display-name" required class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold">
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-label-md text-ink-text font-bold">Nova Senha</label>
              <input type="password" id="edit-password" minlength="6" autocomplete="new-password" class="min-h-[44px] px-3.5 rounded-lg border border-border-subtle bg-surface-card text-ink-text font-bold" placeholder="Deixe em branco para manter a atual">
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="edit-is-admin" class="w-5 h-5 accent-bordeaux-primary">
              <label for="edit-is-admin" class="font-body-md text-ink-text font-bold">Administrador Geral</label>
            </div>
          </div>

          <div class="border-t border-border-subtle pt-space-md flex flex-col gap-2">
            <label class="font-title-md text-ink-text">Permissões Específicas por Tela</label>
            ${renderScreenChecks('edit-perm-check')}
          </div>

          <div class="flex items-center gap-2 justify-end">
            <button type="button" id="edit-cancel-btn" class="min-h-[44px] px-4 rounded-lg bg-surface-canvas hover:bg-surface-variant text-ink-text font-title-md">Cancelar</button>
            <button type="submit" class="min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md">Atualizar Permissões</button>
          </div>
        </form>
      </div>

      <div id="users-list-container"></div>
    </div>
  `;

  setupInviteForm();
  setupEditForm();
  setupScreenCheckShortcuts();
  loadUsers();
}

function setupInviteForm() {
  document.getElementById('invite-user-btn')?.addEventListener('click', () => {
    document.getElementById('invite-display-name').value = '';
    document.getElementById('invite-login').value = '';
    document.getElementById('invite-password').value = '';
    document.getElementById('invite-is-admin').checked = false;
    document.querySelectorAll('.screen-perm-check').forEach(cb => cb.checked = false);
    syncAdminLock('invite-is-admin', 'screen-perm-check');
    document.getElementById('invite-form-container')?.classList.remove('hidden');
    document.getElementById('edit-user-container')?.classList.add('hidden');
  });

  document.getElementById('invite-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('invite-form-container')?.classList.add('hidden');
  });

  document.getElementById('invite-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('invite-submit-btn');
    submitBtn.disabled = true;

    const displayName = document.getElementById('invite-display-name').value.trim();
    const login = document.getElementById('invite-login').value.trim().toLowerCase();
    const password = document.getElementById('invite-password').value;
    const isAdmin = document.getElementById('invite-is-admin').checked;
    const screenPermissions = isAdmin ? [] : [...document.querySelectorAll('.screen-perm-check:checked')].map(cb => cb.value);

    try {
      // Função no banco (migration_internal_users.sql): confere se quem chama é administrador
      // e cria o login direto no Supabase Auth, sem e-mail.
      const { error } = await supabase.rpc('admin_create_user', {
        p_login: login,
        p_password: password,
        p_display_name: displayName,
        p_is_admin: isAdmin,
        p_screens: screenPermissions
      });
      if (error) throw new Error(rpcErrorMessage(error));
      const successMessage = `Usuário "${login}" cadastrado. Ele já pode entrar com esse usuário e a senha definida.`;

      showNotification(successMessage, 'success');
      document.getElementById('invite-form-container')?.classList.add('hidden');
      loadUsers();
    } catch (err) {
      showNotification(`Erro ao cadastrar usuário: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function setupEditForm() {
  document.getElementById('edit-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('edit-user-container')?.classList.add('hidden');
  });

  document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('edit-user-id').value;
    const displayName = document.getElementById('edit-display-name').value.trim();
    const isAdmin = document.getElementById('edit-is-admin').checked;
    const newPassword = document.getElementById('edit-password').value;

    try {
      if (newPassword) {
        const { error: pwErr } = await supabase.rpc('admin_set_user_password', { p_user_id: userId, p_password: newPassword });
        if (pwErr) throw new Error(rpcErrorMessage(pwErr));
      }

      const { error: uErr } = await supabase
        .from('app_users')
        .update({ display_name: displayName, is_admin: isAdmin, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (uErr) throw uErr;

      // Grava primeiro as telas marcadas e só depois remove as desmarcadas:
      // se a gravação falhar, o usuário não perde as permissões que já tinha.
      const selectedKeys = isAdmin ? [] : [...document.querySelectorAll('.edit-perm-check:checked')].map(cb => cb.value);

      if (selectedKeys.length > 0) {
        const { error: pErr } = await supabase
          .from('user_screen_permissions')
          .upsert(selectedKeys.map(screen_key => ({ user_id: userId, screen_key })), { onConflict: 'user_id,screen_key' });
        if (pErr) {
          if (pErr.code === '23514') {
            throw new Error('O banco ainda não aceita alguma das telas marcadas. Rode o arquivo migration_screen_permissions.sql no Supabase (SQL Editor) e tente de novo.');
          }
          throw pErr;
        }
      }

      const removedKeys = SCREEN_KEYS.filter(k => !selectedKeys.includes(k));
      const { error: dErr } = await supabase
        .from('user_screen_permissions')
        .delete()
        .eq('user_id', userId)
        .in('screen_key', removedKeys);
      if (dErr) throw dErr;

      showNotification(newPassword ? 'Usuário e senha atualizados com sucesso!' : 'Permissões do usuário atualizadas com sucesso!', 'success');
      document.getElementById('edit-user-container')?.classList.add('hidden');
      loadUsers();
    } catch (err) {
      showNotification(`Erro ao atualizar permissões: ${err.message}`, 'error');
    }
  });
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
      description: 'Cadastre o primeiro usuário para acessar o SGP Industrial.',
      actionText: 'Cadastrar Usuário',
      onAction: () => document.getElementById('invite-user-btn')?.click()
    }));
    return;
  }

  container.innerHTML = `
    <div class="bg-surface-card rounded-xl shadow-sm border border-border-subtle overflow-x-auto">
      <table class="w-full text-left font-body-md">
        <thead class="bg-surface-canvas text-ink-text font-title-md border-b border-border-subtle">
          <tr>
            <th class="py-3 px-4 font-semibold">Nome de Exibição</th>
            <th class="py-3 px-4 font-semibold">Usuário</th>
            <th class="py-3 px-4 font-semibold">Papel</th>
            <th class="py-3 px-4 font-semibold">Telas Permitidas (Operário)</th>
            <th class="py-3 px-4 font-semibold">Status</th>
            <th class="py-3 px-4 font-semibold text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle text-ink-text">
          ${users.map(u => {
            const perms = (u.user_screen_permissions || []).map(p => {
              const found = SCREENS.find(s => s.key === p.screen_key);
              return found ? found.title : p.screen_key;
            });

            return `
              <tr class="hover:bg-surface-canvas/60 transition-colors">
                <td class="py-3 px-4 font-bold text-ink-text">${u.display_name}</td>
                <td class="py-3 px-4 font-mono text-xs">${u.login || '<span class="text-text-muted">e-mail</span>'}</td>
                <td class="py-3 px-4">
                  ${u.is_admin
                    ? `<span class="px-2.5 py-0.5 rounded text-xs font-bold bg-bordeaux-primary text-on-primary">Administrador Geral</span>`
                    : `<span class="px-2.5 py-0.5 rounded text-xs font-bold bg-surface-canvas text-text-muted">Operário</span>`}
                </td>
                <td class="py-3 px-4 text-xs">
                  ${u.is_admin ? '<span class="font-bold text-status-success">Acesso a Todas as Telas</span>' : perms.join(', ') || '<span class="text-alert-critical font-bold">Nenhuma Tela</span>'}
                </td>
                <td class="py-3 px-4">
                  ${u.active
                    ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-surface-container-low text-status-success">Ativo</span>`
                    : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-badge-error-bg text-badge-error-text">Inativo</span>`}
                </td>
                <td class="py-3 px-4 text-right flex items-center justify-end gap-2">
                  <button class="edit-user-perms-btn px-3 py-1 rounded bg-surface-canvas hover:bg-wine-deep hover:text-on-primary text-bordeaux-primary text-xs font-bold transition-colors"
                          data-userid="${u.user_id}" data-name="${u.display_name}" data-admin="${u.is_admin}" data-perms="${(u.user_screen_permissions || []).map(p => p.screen_key).join(',')}">
                    Editar / Senha
                  </button>
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

  container.querySelectorAll('.edit-user-perms-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const userId = target.dataset.userid;
      const name = target.dataset.name;
      const isAdmin = target.dataset.admin === 'true';
      const perms = (target.dataset.perms || '').split(',').filter(Boolean);

      document.getElementById('edit-user-id').value = userId;
      document.getElementById('edit-display-name').value = name;
      document.getElementById('edit-password').value = '';
      document.getElementById('edit-is-admin').checked = isAdmin;

      document.querySelectorAll('.edit-perm-check').forEach(cb => {
        cb.checked = perms.includes(cb.value);
      });
      syncAdminLock('edit-is-admin', 'edit-perm-check');

      document.getElementById('invite-form-container')?.classList.add('hidden');
      document.getElementById('edit-user-container')?.classList.remove('hidden');
    });
  });

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
