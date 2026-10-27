-- Servidor local (Windows): rodar DEPOIS de importar usuários e dados
-- (ver servidor-local/GUIA-WINDOWS.md, passo 4). Pode rodar de novo sem problema.
--
-- Cria a função de login (substitui o login do Supabase) e devolve as permissões
-- que a importação não traz (a exportação é feita sem permissões do Supabase).

begin;

-- 1. Login: confere usuário e senha e devolve um token válido por 12 horas.
-- As senhas vindas do Supabase continuam valendo (mesmo formato bcrypt).
create or replace function public.login(p_email text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user auth.users;
  v_secret text;
  v_now bigint := extract(epoch from now())::bigint;
  v_exp bigint := extract(epoch from now() + interval '12 hours')::bigint;
  v_header text;
  v_payload text;
  v_data text;
begin
  select * into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if not found
     or v_user.encrypted_password is null
     or v_user.encrypted_password <> crypt(coalesce(p_password, ''), v_user.encrypted_password) then
    perform pg_sleep(0.5); -- atrasa tentativas de adivinhar senha
    raise exception 'Usuário ou senha incorretos.' using errcode = '28P01';
  end if;

  select secret into v_secret from auth.jwt_secret;

  v_header := auth.base64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'utf8'));
  v_payload := auth.base64url(convert_to(json_build_object(
    'sub', v_user.id,
    'email', v_user.email,
    'role', 'authenticated',
    'aud', 'authenticated',
    'iat', v_now,
    'exp', v_exp
  )::text, 'utf8'));
  v_data := v_header || '.' || v_payload;

  update auth.users set last_sign_in_at = now() where id = v_user.id;

  return json_build_object(
    'access_token', v_data || '.' || auth.base64url(hmac(convert_to(v_data, 'utf8'), convert_to(v_secret, 'utf8'), 'sha256')),
    'expires_at', v_exp,
    'user', json_build_object('id', v_user.id, 'email', v_user.email)
  );
end;
$$;

-- 2. Permissões. As regras de cada tela continuam nas políticas RLS importadas;
-- aqui só se libera o acesso básico, como o Supabase faz.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.login(text, text) to anon, authenticated;

-- Tabelas e funções criadas no futuro (migrations) já nascem com as mesmas permissões
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated;

commit;

-- Faz o PostgREST enxergar a função nova na hora
notify pgrst, 'reload schema';
