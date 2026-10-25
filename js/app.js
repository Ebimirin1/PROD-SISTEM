import { getCurrentUser, login, logout, state, hasPermission } from './auth.js';
import { showNotification } from './utils.js';
import { supabase, authLinkType, authLinkError } from './supabaseClient.js';
import { SCREENS } from './screens.js';

let currentScreenKey = null;

async function init() {
  setupLoginForm();
  setupForgotPassword();
  setupSetPasswordForm();
  setupLogoutButton();
  setupMobileSidebar();

  const user = await getCurrentUser();
  if (authLinkError && !user) {
    showLoginModal();
    showLoginError(`Link de acesso inválido ou vencido (${authLinkError}). Peça um novo convite ou use "Esqueci minha senha".`);
    return;
  }

  // Veio do link do convite ou de "Esqueci minha senha": pede a senha antes de abrir o sistema
  if (user && (authLinkType === 'invite' || authLinkType === 'recovery')) {
    showSetPasswordModal();
    return;
  }

  enterApp(user);
}

function enterApp(user) {
  if (!user) {
    showLoginModal();
  } else {
    hideLoginModal();
    renderAppShell();
    // Navegar para a primeira tela com permissão ou hash da URL
    const hashKey = window.location.hash.replace('#', '');
    const defaultScreen = SCREENS.find(s => s.key === hashKey && hasPermission(s.key)) ||
                          SCREENS.find(s => hasPermission(s.key));

    if (defaultScreen) {
      navigateTo(defaultScreen.key);
    } else {
      showNotification('Você não possui permissão para acessar nenhuma tela.', 'error');
    }
  }
}

function showLoginError(message) {
  const errorDiv = document.getElementById('login-error');
  if (!errorDiv) return;
  errorDiv.innerText = message;
  errorDiv.classList.remove('hidden');
}

function showSetPasswordModal() {
  document.getElementById('login-modal')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
  document.getElementById('set-password-modal')?.classList.remove('hidden');
}

function setupSetPasswordForm() {
  const form = document.getElementById('set-password-form');
  const errorDiv = document.getElementById('set-password-error');
  const submitBtn = document.getElementById('set-password-submit-btn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('new-password-confirm').value;
    if (password !== confirm) {
      errorDiv.innerText = 'As senhas não conferem.';
      errorDiv.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      document.getElementById('set-password-modal')?.classList.add('hidden');
      showNotification('Senha definida! Use este e-mail e senha nos próximos acessos.', 'success');
      enterApp(await getCurrentUser());
    } catch (err) {
      errorDiv.innerText = err.message || 'Não foi possível salvar a senha.';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function setupForgotPassword() {
  document.getElementById('forgot-password-btn')?.addEventListener('click', async () => {
    const infoDiv = document.getElementById('login-info');
    document.getElementById('login-error')?.classList.add('hidden');
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      showLoginError('Digite seu e-mail no campo acima e clique de novo em "Esqueci minha senha".');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) {
      showLoginError(`Não foi possível enviar o e-mail: ${error.message}`);
      return;
    }
    infoDiv.innerText = `Se ${email} estiver cadastrado, um link para definir a senha foi enviado. Confira também a caixa de spam.`;
    infoDiv.classList.remove('hidden');
  });
}

function showLoginModal() {
  document.getElementById('login-modal')?.classList.remove('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
}

function hideLoginModal() {
  document.getElementById('login-modal')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.remove('hidden');
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  const errorDiv = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');
    submitBtn.disabled = true;

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      await login(email, password);
      hideLoginModal();
      renderAppShell();
      const firstAvailable = SCREENS.find(s => hasPermission(s.key));
      if (firstAvailable) navigateTo(firstAvailable.key);
    } catch (err) {
      errorDiv.innerText = err.message || 'Erro ao efetuar login. Verifique suas credenciais.';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function setupLogoutButton() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
  });
}

// Menu lateral recolhível em telas pequenas (no desktop ele fica sempre visível)
function setupMobileSidebar() {
  document.getElementById('sidebar-open-btn')?.addEventListener('click', () => toggleMobileSidebar(true));
  document.getElementById('sidebar-close-btn')?.addEventListener('click', () => toggleMobileSidebar(false));
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => toggleMobileSidebar(false));
}

function toggleMobileSidebar(open) {
  document.getElementById('app-sidebar')?.classList.toggle('-translate-x-full', !open);
  document.getElementById('sidebar-overlay')?.classList.toggle('hidden', !open);
  document.body.classList.toggle('sidebar-open', open);
}

function renderAppShell() {
  const user = state.appUser;
  if (user) {
    document.getElementById('user-display-name').innerText = user.display_name || 'Usuário';
    document.getElementById('user-role-label').innerText = user.is_admin ? 'Administrador' : 'Operador';
  }

  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  nav.innerHTML = '';

  SCREENS.forEach(screen => {
    if (!hasPermission(screen.key)) return;

    const navLink = document.createElement('a');
    navLink.href = `#${screen.key}`;
    navLink.dataset.screen = screen.key;
    navLink.className = `flex items-center justify-between min-h-[44px] px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-on-primary transition-colors ${currentScreenKey === screen.key ? 'bg-bordeaux-primary text-on-primary font-bold shadow-sm' : ''}`;
    navLink.innerHTML = `
      <div class="flex items-center gap-space-sm">
        <span class="material-symbols-outlined text-[20px]">${screen.icon}</span>
        <span class="font-label-md text-label-md">${screen.title}</span>
      </div>
    `;

    navLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(screen.key);
    });

    nav.appendChild(navLink);
  });
}

export async function navigateTo(screenKey) {
  if (!hasPermission(screenKey)) {
    showNotification('Acesso negado para esta tela.', 'error');
    return;
  }

  currentScreenKey = screenKey;
  window.location.hash = screenKey;
  toggleMobileSidebar(false);

  const screenConfig = SCREENS.find(s => s.key === screenKey);
  if (!screenConfig) return;

  // Atualizar título no header e destaque na sidebar
  const titleEl = document.getElementById('current-screen-title');
  if (titleEl) titleEl.innerText = screenConfig.title;

  document.querySelectorAll('#sidebar-nav a').forEach(a => {
    if (a.dataset.screen === screenKey) {
      a.className = 'flex items-center justify-between min-h-[44px] px-3 py-2 rounded-lg bg-bordeaux-primary text-on-primary font-bold shadow-sm transition-colors';
    } else {
      a.className = 'flex items-center justify-between min-h-[44px] px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-on-primary transition-colors';
    }
  });

  const main = document.getElementById('main-content');
  if (!main) return;

  main.innerHTML = `
    <div class="flex items-center justify-center p-12 text-text-muted">
      <span class="material-symbols-outlined text-[32px] animate-spin mr-2">sync</span>
      <span>Carregando módulo...</span>
    </div>
  `;

  try {
    const module = await import(`./views/${screenKey}.js`);
    if (module && module.render) {
      main.innerHTML = '';
      module.render(main);
    }
  } catch (err) {
    console.error(`Erro ao carregar visualização ${screenKey}:`, err);
    main.innerHTML = `
      <div class="p-6 bg-badge-error-bg text-badge-error-text rounded-xl">
        <h3 class="font-headline-sm">Erro ao carregar a tela</h3>
        <p class="font-body-md mt-1">${err.message}</p>
      </div>
    `;
  }
}

window.addEventListener('DOMContentLoaded', init);
