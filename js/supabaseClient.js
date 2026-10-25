import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Link de convite/redefinição de senha do Supabase chega como #access_token=...&type=invite|recovery
// (ou #error=...&error_description=... quando o link venceu). Lido antes de criar o cliente,
// que consome e limpa esse trecho da URL.
const authHashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
export const authLinkType = authHashParams.has('access_token') ? authHashParams.get('type') : null;
export const authLinkError = authHashParams.get('error_description');

// Usar o cliente Supabase do CDN injetado no window
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
