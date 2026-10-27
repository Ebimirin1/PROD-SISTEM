import { supabase } from './supabaseClient.js';
import { showNotification } from './utils.js';
import { SCREEN_KEYS } from './screens.js';
import { IS_LOCAL_SERVER } from './config.js';
import { getLocalSession, saveLocalSession, clearLocalSession } from './localSession.js';

export const state = {
  user: null,
  appUser: null,
  permissions: []
};

export async function getCurrentUser() {
  const session = IS_LOCAL_SERVER
    ? getLocalSession()
    : (await supabase.auth.getSession()).data.session;
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
    state.permissions = [...SCREEN_KEYS];
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

// Usuários cadastrados pelo administrador entram só com o login; no Supabase Auth eles
// existem como <login>@sgp-industrial.local (ver migration_internal_users.sql).
// Quem digitar um e-mail completo (ex.: administrador antigo) entra com ele.
export const INTERNAL_EMAIL_DOMAIN = 'sgp-industrial.local';

export function loginToEmail(loginOrEmail) {
  const value = loginOrEmail.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${INTERNAL_EMAIL_DOMAIN}`;
}

export async function login(loginOrEmail, password) {
  if (IS_LOCAL_SERVER) {
    // Servidor local: public.login (servidor-local/02_depois_da_importacao.sql) devolve o token
    const { data, error } = await supabase.rpc('login', { p_email: loginToEmail(loginOrEmail), p_password: password });
    if (error) {
      throw new Error(error.message || 'Não foi possível entrar.');
    }
    saveLocalSession(data);
    await getCurrentUser();
    return data;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: loginToEmail(loginOrEmail), password });
  if (error && /invalid login credentials/i.test(error.message)) {
    throw new Error('Usuário ou senha incorretos.');
  }
  if (error) {
    throw error;
  }
  await getCurrentUser();
  return data;
}

export async function logout() {
  if (IS_LOCAL_SERVER) {
    clearLocalSession();
  } else {
    await supabase.auth.signOut();
  }
  state.user = null;
  state.appUser = null;
  state.permissions = [];
  window.location.reload();
}
