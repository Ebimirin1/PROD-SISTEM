// Configurações do Supabase
export const SUPABASE_URL = 'https://ywnsowvomewoyedqozuh.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_8enKbyftaVznSsKUUf2J3g_ALg9vCcD';

// Servidor local (Windows, ver servidor-local/GUIA-WINDOWS.md): quando o app é aberto
// por qualquer endereço que não seja o GitHub Pages, ele usa o PostgREST do próprio
// servidor (mesmo endereço do app, caminho /rest/v1) e o login pela função public.login.
export const IS_LOCAL_SERVER = !window.location.hostname.endsWith('github.io');
