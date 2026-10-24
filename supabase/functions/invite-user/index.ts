import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Telas aceitas pelo CHECK de public.user_screen_permissions (schema.sql)
const VALID_SCREENS = [
  'overview', 'planning', 'catalogs', 'separation', 'production',
  'inventory', 'shipping', 'billing', 'users',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Configuração do servidor ausente (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY).');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Autorização: somente administrador ativo pode cadastrar usuários.
    //    O token é o access_token da sessão do usuário logado (não a chave pública).
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return json({ error: 'Não autenticado.' }, 401);
    }

    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !callerData?.user) {
      return json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401);
    }

    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('app_users')
      .select('is_admin, active')
      .eq('user_id', callerData.user.id)
      .maybeSingle();

    if (profileErr) {
      return json({ error: `Erro ao verificar permissões: ${profileErr.message}` }, 500);
    }
    if (!callerProfile || !callerProfile.active || !callerProfile.is_admin) {
      return json({ error: 'Apenas administradores ativos podem cadastrar usuários.' }, 403);
    }

    // 2. Validação da entrada
    const { email, displayName, screenPermissions, isAdmin, password } = await req.json();

    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
    if (!cleanEmail || !cleanName) {
      return json({ error: 'E-mail e nome são obrigatórios.' }, 400);
    }

    const cleanPassword = typeof password === 'string' ? password.trim() : '';
    if (cleanPassword && cleanPassword.length < 6) {
      return json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);
    }

    const requested: string[] = Array.isArray(screenPermissions) ? screenPermissions.map(String) : [];
    const screens = [...new Set(requested.filter((s) => VALID_SCREENS.includes(s)))];
    const ignored = requested.filter((s) => !VALID_SCREENS.includes(s));

    // 3. Criação no Auth
    let userId: string;
    if (cleanPassword) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: { name: cleanName },
      });
      if (authError) return json({ error: authError.message }, 400);
      userId = authData.user.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail);
      if (authError) return json({ error: authError.message }, 400);
      userId = authData.user.id;
    }

    // 4. Perfil e permissões
    const { error: userTableErr } = await supabaseAdmin
      .from('app_users')
      .upsert({
        user_id: userId,
        display_name: cleanName,
        is_admin: Boolean(isAdmin),
        active: true,
        updated_at: new Date().toISOString(),
      });

    if (userTableErr) {
      return json({ error: `Usuário criado no Auth, mas erro ao salvar perfil: ${userTableErr.message}` }, 500);
    }

    let permWarning = '';
    if (!isAdmin && screens.length > 0) {
      const rows = screens.map((screen_key) => ({
        user_id: userId,
        screen_key,
        granted_by: callerData.user.id,
      }));
      const { error: permErr } = await supabaseAdmin
        .from('user_screen_permissions')
        .upsert(rows, { onConflict: 'user_id,screen_key' });
      if (permErr) {
        permWarning = ` Atenção: as permissões de tela não foram salvas (${permErr.message}). Edite o usuário para concedê-las.`;
      }
    }
    if (ignored.length > 0) {
      permWarning += ` Telas não reconhecidas pelo banco e ignoradas: ${ignored.join(', ')}.`;
    }

    const message = (cleanPassword
      ? 'Usuário cadastrado com sucesso com senha direta.'
      : 'Convite enviado e permissões atribuídas com sucesso.') + permWarning;

    return json({ message, userId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return json({ error: msg }, 500);
  }
});
