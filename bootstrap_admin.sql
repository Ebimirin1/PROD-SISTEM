-- Script de Associação e Concessão de Permissões Totais para o Administrador Principal
-- Executar no Supabase SQL Editor (SQL Editor > New Query > Run) após a criação do usuário em Authentication > Users.
-- User UID do Administrador Principal: e904e5d8-ef54-408a-92a7-8c54994dbcef

begin;

-- 1. Inserir ou atualizar o perfil do administrador principal
insert into public.app_users (user_id, display_name, active, is_admin)
values (
  'e904e5d8-ef54-408a-92a7-8c54994dbcef',
  'Administrador Principal',
  true,
  true
)
on conflict (user_id) do update
set is_admin = true, active = true, updated_at = now();

-- 2. Garantir todas as 9 permissões de tela no banco de dados
insert into public.user_screen_permissions (user_id, screen_key)
select 'e904e5d8-ef54-408a-92a7-8c54994dbcef', unnest(array[
  'overview', 'planning', 'catalogs', 'separation', 'production',
  'inventory', 'shipping', 'billing', 'users'
])
on conflict (user_id, screen_key) do nothing;

commit;
