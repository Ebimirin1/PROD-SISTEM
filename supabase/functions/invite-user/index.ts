import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Configuração do servidor ausente (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY).');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { email, displayName, screenPermissions, isAdmin, password } = await req.json();

    if (!email || !displayName) {
      return new Response(JSON.stringify({ error: 'E-mail e nome são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let userId: string;

    // Se senha foi fornecida, criar usuário direto sem necessidade de confirmação por e-mail
    if (password && typeof password === 'string' && password.trim().length > 0) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: password.trim(),
        email_confirm: true,
        user_metadata: { name: displayName }
      });

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = authData.user.id;
    } else {
      // Caso contrário, convidar via e-mail
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = authData.user.id;
    }

    // Criar ou atualizar registro em app_users
    const { error: userTableErr } = await supabaseAdmin
      .from('app_users')
      .upsert({
        user_id: userId,
        display_name: displayName,
        is_admin: Boolean(isAdmin),
        active: true
      });

    if (userTableErr) {
      return new Response(JSON.stringify({ error: `Usuário criado no Auth, mas erro ao salvar perfil: ${userTableErr.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Se houver permissões de tela
    if (Array.isArray(screenPermissions) && screenPermissions.length > 0) {
      const rows = screenPermissions.map((screen_key: string) => ({
        user_id: userId,
        screen_key
      }));

      const { error: permErr } = await supabaseAdmin
        .from('user_screen_permissions')
        .insert(rows);

      if (permErr) {
        console.error('Erro ao salvar permissões:', permErr);
      }
    }

    const message = password
      ? 'Usuário cadastrado com sucesso com senha direta! Não é necessário e-mail de confirmação.'
      : 'Convite enviado e permissões atribuídas com sucesso!';

    return new Response(
      JSON.stringify({ message, userId }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
