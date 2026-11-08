-- Duplas / equipes do vácuo
-- Cria o cadastro de duplas (ex.: Ariane / Alex) usado ao iniciar o vácuo na tela
-- Controle de Produção. Cada vácuo continua gravando as pessoas em
-- process_run_collaborators (uma linha por pessoa), então o tempo médio por pessoa
-- e por dupla sai do histórico mesmo que a dupla seja apagada depois.
--
-- Servidor Windows: rodar no banco sgp (porta 5433) pelo HeidiSQL, com o usuário postgres.
-- Supabase: SQL Editor > New query > colar tudo > Run.
-- Pode rodar de novo sem problema.

begin;

create table if not exists public.collaborator_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint collaborator_teams_name_nonblank check (length(trim(name)) > 0)
);
create unique index if not exists collaborator_teams_name_unique
  on public.collaborator_teams (lower(trim(name)));

create table if not exists public.collaborator_team_members (
  team_id uuid not null references public.collaborator_teams(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  primary key (team_id, collaborator_id)
);

alter table public.collaborator_teams enable row level security;
alter table public.collaborator_team_members enable row level security;

drop policy if exists collaborator_teams_by_screen on public.collaborator_teams;
create policy collaborator_teams_by_screen on public.collaborator_teams for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('production'));

drop policy if exists collaborator_team_members_by_screen on public.collaborator_team_members;
create policy collaborator_team_members_by_screen on public.collaborator_team_members for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('production'));

grant select, insert, update, delete on public.collaborator_teams, public.collaborator_team_members to authenticated;

-- Duplas iniciais pedidas: Ariane/Alex, Alex/Rodrigo, Ariane/Rodrigo.
-- Procura cada pessoa pelo primeiro nome no cadastro de colaboradores ativos.
-- Se alguém não estiver cadastrado, a dupla é pulada (aparece um aviso) e pode
-- ser criada depois em Cadastros > Colaboradores.
do $$
declare
  v_pairs text[] := array['ariane:alex', 'alex:rodrigo', 'ariane:rodrigo'];
  v_pair text;
  v_a public.collaborators;
  v_b public.collaborators;
  v_name text;
  v_team_id uuid;
begin
  foreach v_pair in array v_pairs loop
    select * into v_a from public.collaborators
     where active and lower(split_part(trim(full_name), ' ', 1)) = split_part(v_pair, ':', 1)
     order by full_name limit 1;
    select * into v_b from public.collaborators
     where active and lower(split_part(trim(full_name), ' ', 1)) = split_part(v_pair, ':', 2)
     order by full_name limit 1;

    if v_a.id is null or v_b.id is null then
      raise notice 'Dupla % não criada: colaborador não encontrado no cadastro.', v_pair;
      continue;
    end if;

    v_name := split_part(trim(v_a.full_name), ' ', 1) || ' / ' || split_part(trim(v_b.full_name), ' ', 1);
    if exists (select 1 from public.collaborator_teams where lower(trim(name)) = lower(v_name)) then
      continue;
    end if;

    insert into public.collaborator_teams (name) values (v_name) returning id into v_team_id;
    insert into public.collaborator_team_members (team_id, collaborator_id)
    values (v_team_id, v_a.id), (v_team_id, v_b.id);
  end loop;
end $$;

commit;

-- Faz o PostgREST enxergar as tabelas novas na hora
notify pgrst, 'reload schema';
