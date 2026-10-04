import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Usar o cliente Supabase do CDN injetado no window
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
