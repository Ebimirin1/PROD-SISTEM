// Sessão de login do servidor local (sem Supabase Auth): o token devolvido por
// public.login fica guardado no navegador até expirar ou o usuário sair.
const STORAGE_KEY = 'sgp-local-session';

export function getLocalSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (session && session.access_token && session.expires_at * 1000 > Date.now()) {
      return session;
    }
  } catch (e) {
    // sessão corrompida: trata como deslogado
  }
  clearLocalSession();
  return null;
}

export function saveLocalSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearLocalSession() {
  localStorage.removeItem(STORAGE_KEY);
}
