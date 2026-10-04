-- Script de associação do Administrador Principal
-- Executar no Supabase SQL Editor após o usuário ter sido criado no Supabase Auth.
-- User UID do Administrador Principal: e904e5d8-ef54-408a-92a7-8c54994dbcef

insert into public.app_users (user_id, display_name, active, is_admin)
values (
  'e904e5d8-ef54-408a-92a7-8c54994dbcef',
  'Administrador Principal',
  true,
  true
)
on conflict (user_id) do update
set is_admin = true, active = true, updated_at = now();

-- Garantir todas as permissões de tela atreladas
insert into public.user_screen_permissions (user_id, screen_key)
select 'e904e5d8-ef54-408a-92a7-8c54994dbcef', unnest(array[
  'overview', 'planning', 'catalogs', 'separation', 'production',
  'inventory', 'shipping', 'billing', 'users'
])
on conflict (user_id, screen_key) do nothing;
