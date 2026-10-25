-- Libera a tela "Contagem de Rótulos" (labeling) para operários.
-- Antes, o banco só aceitava 9 telas: marcar "Contagem de Rótulos" ao editar um usuário
-- dava erro de CHECK e o usuário ficava sem nenhuma tela.
-- Rodar uma vez no Supabase: SQL Editor > New query > colar tudo > Run.

begin;

-- 1. Aceitar a chave 'labeling' na tabela de permissões
alter table public.user_screen_permissions
  drop constraint if exists user_screen_permissions_screen_key_check;

alter table public.user_screen_permissions
  add constraint user_screen_permissions_screen_key_check check (screen_key in (
    'overview', 'planning', 'catalogs', 'separation', 'production',
    'labeling', 'inventory', 'shipping', 'billing', 'users'
  ));

-- 2. A Contagem de Rótulos lê e grava nas tabelas da Produção (porções, etapas de processo,
--    colaboradores). Quem tem 'labeling' passa nas regras de acesso dessas tabelas.
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

commit;
