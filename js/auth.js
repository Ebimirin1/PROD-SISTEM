import { supabase } from './supabaseClient.js';
import { showNotification } from './utils.js';

export const state = {
  user: null,
  appUser: null,
  permissions: []
};

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    state.user = null;
    state.appUser = null;
    state.permissions = [];
    return null;
  }

  state.user = session.user;

  // Buscar registro correspondente em app_users
  const { data: appUser, error: appUserErr } = await supabase
    .from('app_users')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (appUserErr || !appUser || !appUser.active) {
    if (appUser && !appUser.active) {
      showNotification('Sua conta está desativada. Entre em contato com o administrador.', 'error');
      await logout();
    }
    state.appUser = null;
    state.permissions = [];
    return null;
  }

  state.appUser = appUser;

  // Se for admin, concede todas as permissões
  if (appUser.is_admin) {
    state.permissions = ['overview', 'planning', 'catalogs', 'separation', 'production', 'inventory', 'shipping', 'billing', 'users'];
  } else {
    const { data: perms } = await supabase
      .from('user_screen_permissions')
      .select('screen_key')
      .eq('user_id', session.user.id);

    state.permissions = (perms || []).map(p => p.screen_key);
  }

  return state.user;
}

export function hasPermission(screenKey) {
  if (!state.appUser) return false;
  if (state.appUser.is_admin) return true;
  return state.permissions.includes(screenKey);
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  await getCurrentUser();
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  state.user = null;
  state.appUser = null;
  state.permissions = [];
  window.location.reload();
}
