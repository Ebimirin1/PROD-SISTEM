-- Cadastro interno de usuários: o administrador cria login e senha pelo sistema,
-- sem e-mail e sem Edge Function. Rodar uma vez no Supabase:
-- SQL Editor > New query > colar tudo > Run.
--
-- Cada login vira, por dentro, o e-mail técnico <login>@sgp-industrial.local no Supabase Auth.
-- Nenhum e-mail é enviado para esse endereço.

begin;

create extension if not exists pgcrypto with schema extensions;

-- 1. Nome de usuário (login) visível na tela de usuários
alter table public.app_users add column if not exists login text;
create unique index if not exists app_users_login_key on public.app_users (login);

-- 2. Tela "Contagem de Rótulos" aceita nas permissões (mesmo conteúdo de migration_screen_permissions.sql;
--    pode rodar de novo sem problema)
alter table public.user_screen_permissions
  drop constraint if exists user_screen_permissions_screen_key_check;
alter table public.user_screen_permissions
  add constraint user_screen_permissions_screen_key_check check (screen_key in (
    'overview', 'planning', 'catalogs', 'separation', 'production',
    'labeling', 'inventory', 'shipping', 'billing', 'users'
  ));

create or replace function public.app_has_screen_access(p_screen_key text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.app_users u
    where u.user_id = auth.uid()
      and u.active
      and (u.is_admin or exists (
        select 1 from public.user_screen_permissions p
        where p.user_id = u.user_id
          and (p.screen_key = p_screen_key
               or (p_screen_key = 'production' and p.screen_key = 'labeling'))
      ))
  );
$$;

-- 3. Criar usuário (somente administrador ativo)
create or replace function public.admin_create_user(
  p_login text,
  p_password text,
  p_display_name text,
  p_is_admin boolean default false,
  p_screens text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_login text := lower(trim(coalesce(p_login, '')));
  v_name text := trim(coalesce(p_display_name, ''));
  v_email text;
  v_user_id uuid := gen_random_uuid();
begin
  if not public.app_is_admin() then
    raise exception 'Apenas administradores ativos podem cadastrar usuários.';
  end if;
  if v_login !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaços nem acentos.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'A senha deve ter pelo menos 6 caracteres.';
  end if;
  if v_name = '' then
    raise exception 'Informe o nome de exibição.';
  end if;

  v_email := v_login || '@sgp-industrial.local';
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from public.app_users where login = v_login) then
    raise exception 'O usuário "%" já existe.', v_login;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', v_name, 'login', v_login),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text, 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  );

  insert into public.app_users (user_id, display_name, login, is_admin, active)
  values (v_user_id, v_name, v_login, coalesce(p_is_admin, false), true);

  if not coalesce(p_is_admin, false) and coalesce(array_length(p_screens, 1), 0) > 0 then
    insert into public.user_screen_permissions (user_id, screen_key, granted_by)
    select v_user_id, s, auth.uid() from unnest(p_screens) as s
    on conflict (user_id, screen_key) do nothing;
  end if;

  return v_user_id;
end;
$$;

-- 4. Trocar a senha de um usuário (somente administrador ativo)
create or replace function public.admin_set_user_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.app_is_admin() then
    raise exception 'Apenas administradores ativos podem trocar senhas.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'A senha deve ter pelo menos 6 caracteres.';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$$;

revoke all on function public.admin_create_user(text, text, text, boolean, text[]) from public, anon;
revoke all on function public.admin_set_user_password(uuid, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, boolean, text[]) to authenticated;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;

commit;

-- Faz a API do Supabase enxergar as funções novas na hora
notify pgrst, 'reload schema';
