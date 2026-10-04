import { getCurrentUser, login, logout, state, hasPermission } from './auth.js';
import { showNotification } from './utils.js';

// Definição das rotas/telas do sistema
const SCREENS = [
  { key: 'overview', title: 'Visão Geral', icon: 'grid_view', path: 'js/views/overview.js' },
  { key: 'planning', title: 'Planejamento', icon: 'calendar_today', path: 'js/views/planning.js' },
  { key: 'catalogs', title: 'Cadastros & Fórmulas', icon: 'menu_book', path: 'js/views/catalogs.js' },
  { key: 'separation', title: 'Separação Insumos', icon: 'scale', path: 'js/views/separation.js' },
  { key: 'production', title: 'Produção', icon: 'precision_manufacturing', path: 'js/views/production.js' },
  { key: 'inventory', title: 'Estoque & Cura', icon: 'inventory_2', path: 'js/views/inventory.js' },
  { key: 'shipping', title: 'Pedidos & Expedição', icon: 'local_shipping', path: 'js/views/shipping.js' },
  { key: 'billing', title: 'Faturamento', icon: 'receipt_long', path: 'js/views/billing.js' },
  { key: 'users', title: 'Usuários & Acessos', icon: 'manage_accounts', path: 'js/views/users.js' }
];

let currentScreenKey = null;

async function init() {
  setupLoginForm();
  setupLogoutButton();

  const user = await getCurrentUser();
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
