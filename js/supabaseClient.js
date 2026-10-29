import { SUPABASE_URL, SUPABASE_ANON_KEY, IS_LOCAL_SERVER } from './config.js';
import { getLocalSession } from './localSession.js';

// Servidor local: as chamadas vão para /rest/v1 no mesmo endereço do app (o Caddy repassa
// ao PostgREST) levando o token do login local; sem login, vão sem token (papel anon).
function localFetch(input, init = {}) {
  const headers = new Headers(init.headers);
  const session = getLocalSession();
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  } else {
    headers.delete('Authorization');
  }
  headers.delete('apikey');
  return fetch(input, { ...init, headers });
}

// Usar o cliente Supabase do CDN injetado no window
export const supabase = IS_LOCAL_SERVER
  ? window.supabase.createClient(window.location.origin, 'servidor-local', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: localFetch }
    })
  : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
