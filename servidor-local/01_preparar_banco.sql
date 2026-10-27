-- Servidor local (Windows): prepara um PostgreSQL vazio para receber o banco do SGP.
-- Rodar UMA VEZ, no banco "sgp" recém-criado, ANTES de importar os dados
-- (ver servidor-local/GUIA-WINDOWS.md, passo 4).
--
-- O app foi feito para o Supabase. Este script recria só o pedaço do Supabase
-- que o sistema usa: os papéis anon/authenticated, a tabela auth.users (logins
-- e senhas) e a função auth.uid(), usada pelas regras de permissão (RLS).
--
-- ANTES DE RODAR, troque as duas senhas marcadas com TROQUE.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- 1. Papéis usados pela API (PostgREST)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

-- Senha que o PostgREST usa para entrar no banco (a mesma vai no postgrest.conf)
alter role authenticator password 'TROQUE_SENHA_DA_API';
grant anon, authenticated to authenticator;

-- 2. Esquema auth mínimo (mesmas colunas que as funções do sistema usam)
create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmation_token varchar(255) default '',
  recovery_token varchar(255) default '',
  email_change_token_new varchar(255) default '',
  email_change varchar(255) default ''
);
create unique index if not exists users_email_key on auth.users (lower(email));

create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  provider text not null,
  identity_data jsonb not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chave que assina os tokens de login. A MESMA frase vai em jwt-secret no postgrest.conf.
-- Use pelo menos 32 caracteres, só letras e números.
create table if not exists auth.jwt_secret (
  id boolean primary key default true check (id),
  secret text not null check (length(secret) >= 32)
);
insert into auth.jwt_secret (secret) values ('TROQUE_POR_UMA_FRASE_SECRETA_DE_32_OU_MAIS_LETRAS')
on conflict (id) do update set secret = excluded.secret;

-- 3. Quem está logado (igual ao Supabase): o PostgREST guarda o token em request.jwt.claims
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

-- Base64 sem "+", "/" e "=" (formato usado nos tokens)
create or replace function auth.base64url(p_data bytea)
returns text
language sql immutable
as $$
  select translate(encode(p_data, 'base64'), E'+/=\n', '-_');
$$;

revoke all on all tables in schema auth from public, anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant usage on schema extensions to anon, authenticated;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated;
revoke all on function auth.base64url(bytea) from public;

commit;
