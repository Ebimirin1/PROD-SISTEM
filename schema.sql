-- Sistema de Controle de Produção
-- Instalar UMA VEZ em um projeto Supabase novo/vazio, pelo SQL Editor.
-- Este script cria estrutura, políticas e perfis de carne iniciais; não carrega
-- fórmulas, colaboradores, pedidos ou dados fictícios.
-- Não executar sobre o banco antigo de 14 tabelas.

begin;

-- Usuários do aplicativo. A conta inicial é criada em Supabase Auth e depois
-- associada aqui como administrador, conforme README/instruções de instalação.
create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  active boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_display_name_nonblank check (length(trim(display_name)) > 0)
);

create table public.user_screen_permissions (
  user_id uuid not null references public.app_users(user_id) on delete cascade,
  screen_key text not null check (screen_key in (
    'overview', 'planning', 'catalogs', 'separation', 'production',
    'inventory', 'shipping', 'billing', 'users'
  )),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, screen_key)
);

-- SECURITY DEFINER evita recursão de RLS ao consultar a tabela de permissões.
create or replace function public.app_is_admin()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.app_users u
    where u.user_id = auth.uid() and u.active and u.is_admin
  );
$$;

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
        where p.user_id = u.user_id and p.screen_key = p_screen_key
      ))
  );
$$;

revoke all on function public.app_is_admin() from public, anon;
revoke all on function public.app_has_screen_access(text) from public, anon;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_has_screen_access(text) to authenticated;

create table public.collaborators (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint collaborators_name_nonblank check (length(trim(full_name)) > 0)
);
create unique index collaborators_name_unique on public.collaborators (lower(trim(full_name)));

create table public.flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  hamburger_allowed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint flavors_name_nonblank check (length(trim(name)) > 0)
);
create unique index flavors_name_unique on public.flavors (lower(trim(name)));

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint ingredients_name_nonblank check (length(trim(name)) > 0)
);
create unique index ingredients_name_unique on public.ingredients (lower(trim(name)));

create table public.meat_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique check (profile_key in ('blend_padrao', 'blend_panceta', 'blend_bovino')),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.meat_profile_cuts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.meat_profiles(id) on delete cascade,
  cut_name text not null,
  ratio_pct numeric(7,4) not null check (ratio_pct > 0 and ratio_pct <= 100),
  unique (profile_id, cut_name)
);

insert into public.meat_profiles (profile_key, name) values
  ('blend_padrao', 'Blend padrão — pernil e copa-lombo'),
  ('blend_panceta', 'Blend de panceta — pernil e panceta'),
  ('blend_bovino', 'Blend bovino — pernil e carne bovina');

insert into public.meat_profile_cuts (profile_id, cut_name, ratio_pct)
select p.id, x.cut_name, 50.0000
from (values
  ('blend_padrao', 'Pernil'), ('blend_padrao', 'Copa-lombo'),
  ('blend_panceta', 'Pernil'), ('blend_panceta', 'Panceta'),
  ('blend_bovino', 'Pernil'), ('blend_bovino', 'Carne bovina')
) as x(profile_key, cut_name)
join public.meat_profiles p on p.profile_key = x.profile_key;

-- Receita é versionada e expressa como percentuais do peso final formulado.
create table public.formula_versions (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid not null references public.flavors(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  meat_profile_id uuid not null references public.meat_profiles(id) on delete restrict,
  base_mass_pct numeric(7,4) not null check (base_mass_pct >= 0 and base_mass_pct <= 100),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  source_note text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (flavor_id, version_no)
);

create table public.formula_ingredients (
  id uuid primary key default gen_random_uuid(),
  formula_version_id uuid not null references public.formula_versions(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  ratio_pct numeric(7,4) not null check (ratio_pct > 0 and ratio_pct <= 100),
  unit text not null default 'kg' check (unit in ('kg', 'g', 'ml', 'l', 'un')),
  unique (formula_version_id, ingredient_id)
);

create or replace function public.validate_formula_activation()
returns trigger language plpgsql set search_path = public
as $$
declare v_total numeric;
        v_activate boolean := false;
begin
  if new.status = 'active' then
    if tg_op = 'INSERT' then
      v_activate := true;
    elsif old.status is distinct from 'active' then
      v_activate := true;
    end if;
  end if;
  if v_activate then
    select new.base_mass_pct + coalesce(sum(fi.ratio_pct), 0)
      into v_total
      from public.formula_ingredients fi
      where fi.formula_version_id = new.id;
    if abs(v_total - 100) > 0.01 then
      raise exception 'A formulação só pode ser ativada quando massa-base + insumos somarem 100%%. Soma atual: %', v_total;
    end if;
    if exists (
      select 1 from public.formula_versions f
      where f.flavor_id = new.flavor_id and f.status = 'active' and f.id <> new.id
    ) then
      raise exception 'Já existe uma versão ativa para este sabor.';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;
create trigger formula_versions_validate_activation
before insert or update of status on public.formula_versions
for each row execute function public.validate_formula_activation();

create or replace function public.prevent_active_formula_line_edits()
returns trigger language plpgsql set search_path = public
as $$
declare v_formula_id uuid;
begin
  if tg_op = 'DELETE' then
    v_formula_id := old.formula_version_id;
  else
    v_formula_id := new.formula_version_id;
  end if;
  if exists (select 1 from public.formula_versions f where f.id = v_formula_id and f.status = 'active') then
    raise exception 'Versão ativa é imutável. Crie uma nova versão da formulação.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger formula_ingredients_immutable_active
before insert or update or delete on public.formula_ingredients
for each row execute function public.prevent_active_formula_line_edits();

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_type text not null check (partner_type in ('emporio', 'lanchonete', 'atacado', 'outro')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint partners_name_nonblank check (length(trim(name)) > 0)
);
create unique index partners_name_type_unique on public.partners (lower(trim(name)), partner_type);

create table public.meat_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  supplier_name text,
  ordered_at date not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.meat_order_lines (
  id uuid primary key default gen_random_uuid(),
  meat_order_id uuid not null references public.meat_orders(id) on delete cascade,
  cut_name text not null,
  quantity_ordered_kg numeric(12,3) not null check (quantity_ordered_kg > 0),
  quantity_received_kg numeric(12,3) not null default 0 check (quantity_received_kg >= 0),
  lot_code text,
  received_at timestamptz,
  notes text,
  check (quantity_received_kg <= quantity_ordered_kg)
);

create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  production_date date not null,
  mass_ready_date date,
  generated_at timestamptz,
  canceled_at timestamptz,
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (mass_ready_date is null or mass_ready_date >= production_date),
  check ((canceled_at is null and cancellation_reason is null) or
         (canceled_at is not null and length(trim(coalesce(cancellation_reason, ''))) > 0))
);

create table public.production_order_meat_allocations (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  meat_order_line_id uuid not null references public.meat_order_lines(id) on delete restrict,
  allocated_kg numeric(12,3) not null check (allocated_kg > 0),
  created_at timestamptz not null default now(),
  unique (production_order_id, meat_order_line_id)
);

create table public.production_demands (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  flavor_id uuid not null references public.flavors(id) on delete restrict,
  formula_version_id uuid not null references public.formula_versions(id) on delete restrict,
  destination_partner_id uuid references public.partners(id) on delete restrict,
  destination_key text not null check (destination_key in ('emporio', 'lanchonete', 'atacado', 'outro')),
  requested_product_type text check (requested_product_type in ('manta', 'massa', 'linguica', 'granel', 'hamburguer')),
  requested_conservation text check (requested_conservation in ('resfriado', 'congelado')),
  planned_kg numeric(12,3) not null check (planned_kg > 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check ((destination_key = 'atacado' and destination_partner_id is not null) or destination_key <> 'atacado')
);
create index production_demands_order_flavor_idx on public.production_demands (production_order_id, flavor_id);

create table public.mass_base_batches (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  meat_profile_id uuid not null references public.meat_profiles(id) on delete restrict,
  batch_no integer not null check (batch_no > 0),
  planned_total_kg numeric(12,3) not null check (planned_total_kg > 0 and planned_total_kg <= 150),
  actual_total_kg numeric(12,3) check (actual_total_kg is null or actual_total_kg >= 0),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'canceled')),
  started_at timestamptz,
  completed_at timestamptz,
  responsible_id uuid references public.collaborators(id) on delete set null,
  notes text,
  unique (production_order_id, meat_profile_id, batch_no),
  check ((status = 'in_progress' and started_at is not null) or status <> 'in_progress'),
  check ((status = 'completed' and completed_at is not null and actual_total_kg is not null) or status <> 'completed')
);

create table public.mass_base_batch_meat_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.mass_base_batches(id) on delete cascade,
  meat_order_line_id uuid not null references public.meat_order_lines(id) on delete restrict,
  planned_kg numeric(12,3) not null check (planned_kg > 0),
  actual_kg numeric(12,3) check (actual_kg is null or actual_kg >= 0),
  lot_code text,
  unique (batch_id, meat_order_line_id, lot_code)
);

create table public.mass_base_batch_ingredient_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.mass_base_batches(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  planned_quantity numeric(12,3) not null check (planned_quantity > 0),
  actual_quantity numeric(12,3) check (actual_quantity is null or actual_quantity >= 0),
  unit text not null default 'kg' check (unit in ('kg', 'g', 'ml', 'l', 'un')),
  lot_code text,
  notes text
);

-- Uma porção operacional de até 30 kg alimenta separação e execução parcial.
-- Uma porção operacional por sabor alimenta separação e execução.
create table public.production_portions (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  flavor_id uuid not null references public.flavors(id) on delete restrict,
  portion_no integer not null check (portion_no > 0),
  planned_kg numeric(12,3) not null check (planned_kg > 0),
  created_at timestamptz not null default now(),
  unique (production_order_id, flavor_id, portion_no)
);
create index production_portions_order_flavor_idx on public.production_portions (production_order_id, flavor_id);

create table public.portion_ingredient_lines (
  id uuid primary key default gen_random_uuid(),
  portion_id uuid not null references public.production_portions(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  requested_quantity numeric(12,3) not null check (requested_quantity > 0),
  separated_quantity numeric(12,3) check (separated_quantity is null or separated_quantity >= 0),
  unit text not null default 'kg' check (unit in ('kg', 'g', 'ml', 'l', 'un')),
  ingredient_lot text,
  status text not null default 'pending' check (status in ('pending', 'separated', 'adjusted')),
  separated_by uuid references public.collaborators(id) on delete set null,
  separated_at timestamptz,
  variance_reason text,
  check ((status = 'pending' and separated_at is null) or status <> 'pending'),
  check (status <> 'adjusted' or length(trim(coalesce(variance_reason, ''))) > 0),
  unique (portion_id, ingredient_id)
);

create table public.process_runs (
  id uuid primary key default gen_random_uuid(),
  portion_id uuid not null references public.production_portions(id) on delete cascade,
  stage text not null check (stage in ('embutimento', 'vacuo', 'rotulagem')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  actual_kg numeric(12,3) check (actual_kg is null or actual_kg >= 0),
  correction_reason text,
  updated_at timestamptz not null default now(),
  unique (portion_id, stage),
  check ((status = 'pending' and started_at is null and completed_at is null) or status <> 'pending'),
  check ((status = 'in_progress' and started_at is not null and completed_at is null) or status <> 'in_progress'),
  check ((status = 'completed' and started_at is not null and completed_at is not null and actual_kg is not null) or status <> 'completed'),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table public.process_run_collaborators (
  process_run_id uuid not null references public.process_runs(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete restrict,
  role_note text,
  primary key (process_run_id, collaborator_id)
);

create table public.finished_lots (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  portion_id uuid references public.production_portions(id) on delete restrict,
  flavor_id uuid not null references public.flavors(id) on delete restrict,
  lot_code text not null unique,
  product_type text not null check (product_type in ('manta', 'massa', 'linguica', 'granel', 'hamburguer')),
  conservation text not null check (conservation in ('resfriado', 'congelado')),
  mass_ready_date date not null,
  produced_kg numeric(12,3) not null check (produced_kg > 0),
  expiry_date date not null,
  destination_partner_id uuid references public.partners(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index finished_lots_flavor_expiry_idx on public.finished_lots (flavor_id, expiry_date);

create or replace function public.set_finished_lot_expiry()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.expiry_date := case new.conservation
    when 'resfriado' then new.mass_ready_date + 45
    when 'congelado' then (new.mass_ready_date + interval '6 months')::date
  end;
  return new;
end;
$$;
create trigger finished_lots_set_expiry
before insert or update of conservation, mass_ready_date on public.finished_lots
for each row execute function public.set_finished_lot_expiry();

create table public.finished_lot_demand_allocations (
  id uuid primary key default gen_random_uuid(),
  finished_lot_id uuid not null references public.finished_lots(id) on delete restrict,
  production_demand_id uuid not null references public.production_demands(id) on delete restrict,
  allocated_kg numeric(12,3) not null check (allocated_kg > 0),
  created_at timestamptz not null default now(),
  unique (finished_lot_id, production_demand_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  finished_lot_id uuid not null references public.finished_lots(id) on delete restrict,
  movement_type text not null check (movement_type in ('production_entry', 'shipment_exit', 'transfer', 'adjustment', 'waste')),
  quantity_delta_kg numeric(12,3) not null check (quantity_delta_kg <> 0),
  from_partner_id uuid references public.partners(id) on delete restrict,
  to_partner_id uuid references public.partners(id) on delete restrict,
  reference_text text,
  reason text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (movement_type <> 'adjustment' or length(trim(coalesce(reason, ''))) > 0)
);
create index inventory_movements_lot_idx on public.inventory_movements (finished_lot_id, occurred_at);

create table public.shipment_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_id uuid not null references public.partners(id) on delete restrict,
  requested_at date not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_order_id uuid not null references public.shipment_orders(id) on delete cascade,
  flavor_id uuid not null references public.flavors(id) on delete restrict,
  product_type text not null check (product_type in ('manta', 'massa', 'linguica', 'granel', 'hamburguer')),
  conservation text not null check (conservation in ('resfriado', 'congelado')),
  requested_kg numeric(12,3) not null check (requested_kg > 0),
  separated_kg numeric(12,3) not null default 0 check (separated_kg >= 0),
  status text not null default 'pending' check (status in ('pending', 'separated_for_invoice', 'separated_for_dispatch', 'delivered', 'canceled')),
  invoice_reference text,
  updated_at timestamptz not null default now(),
  check (separated_kg <= requested_kg)
);

create table public.shipment_line_lots (
  shipment_line_id uuid not null references public.shipment_lines(id) on delete cascade,
  finished_lot_id uuid not null references public.finished_lots(id) on delete restrict,
  quantity_kg numeric(12,3) not null check (quantity_kg > 0),
  primary key (shipment_line_id, finished_lot_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete', 'status_change', 'quantity_correction', 'formula_activation')),
  old_data jsonb,
  new_data jsonb,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

-- Atualiza o resumo automaticamente sem duplicar o total da OP em uma coluna.
create view public.vw_production_order_totals
with (security_invoker = true) as
with demand_totals as (
  select production_order_id, sum(planned_kg) as planned_kg
  from public.production_demands group by production_order_id
), output_totals as (
  select production_order_id, sum(produced_kg) as produced_kg
  from public.finished_lots group by production_order_id
)
select po.id as production_order_id, po.order_code, po.production_date, po.mass_ready_date,
       coalesce(d.planned_kg, 0)::numeric(12,3) as planned_total_kg,
       coalesce(o.produced_kg, 0)::numeric(12,3) as produced_total_kg
from public.production_orders po
left join demand_totals d on d.production_order_id = po.id
left join output_totals o on o.production_order_id = po.id;

create view public.vw_production_order_status
with (security_invoker = true) as
with portion_status as (
  select pp.id as portion_id, pp.production_order_id, pp.flavor_id,
         count(pr.id) as stage_count,
         count(pr.id) filter (where pr.status = 'completed') as completed_stage_count,
         bool_or(pr.status in ('in_progress', 'completed')) as has_started
  from public.production_portions pp
  left join public.process_runs pr on pr.portion_id = pp.id
  group by pp.id, pp.production_order_id, pp.flavor_id
), order_rollup as (
  select production_order_id, count(*) as portion_count,
         bool_and(stage_count = 3 and completed_stage_count = 3) as all_complete,
         bool_or(coalesce(has_started, false)) as any_started
  from portion_status group by production_order_id
)
select po.id as production_order_id, po.order_code,
  case
    when po.canceled_at is not null then 'canceled'
    when po.generated_at is null then 'draft'
    when coalesce(r.portion_count, 0) = 0 then 'planned'
    when r.all_complete then 'completed'
    when r.any_started then 'in_production'
    else 'planned'
  end as status
from public.production_orders po
left join order_rollup r on r.production_order_id = po.id;

create view public.vw_flavor_progress
with (security_invoker = true) as
with portion_status as (
  select pp.production_order_id, pp.flavor_id, pp.id as portion_id,
         count(pr.id) as stage_count,
         count(pr.id) filter (where pr.status = 'completed') as completed_stage_count,
         bool_or(pr.status in ('in_progress', 'completed')) as has_started
  from public.production_portions pp
  left join public.process_runs pr on pr.portion_id = pp.id
  group by pp.production_order_id, pp.flavor_id, pp.id
)
select production_order_id, flavor_id, count(*) as portion_count,
  case
    when bool_and(stage_count = 3 and completed_stage_count = 3) then 'completed'
    when bool_or(coalesce(has_started, false)) then 'in_production'
    else 'planned'
  end as status
from portion_status group by production_order_id, flavor_id;

create view public.vw_invoice_queue
with (security_invoker = true) as
select sl.id as shipment_line_id, so.order_code, so.customer_id,
       f.name as flavor, sl.product_type, sl.conservation,
       sl.requested_kg, sl.separated_kg, sl.invoice_reference, sl.updated_at
from public.shipment_lines sl
join public.shipment_orders so on so.id = sl.shipment_order_id
join public.flavors f on f.id = sl.flavor_id
where sl.status = 'separated_for_invoice';

create view public.vw_inventory_by_flavor
with (security_invoker = true) as
select fl.flavor_id, f.name as flavor, fl.product_type, fl.conservation,
       fl.destination_partner_id, fl.id as finished_lot_id, fl.lot_code,
       fl.expiry_date,
       coalesce(sum(im.quantity_delta_kg), 0)::numeric(12,3) as balance_kg
from public.finished_lots fl
join public.flavors f on f.id = fl.flavor_id
left join public.inventory_movements im on im.finished_lot_id = fl.id
group by fl.flavor_id, f.name, fl.product_type, fl.conservation,
         fl.destination_partner_id, fl.id, fl.lot_code, fl.expiry_date;

-- RLS: nenhuma tabela exposta concede acesso a anon. Permissão de tela é
-- aplicada no banco, além de ser refletida na interface.
alter table public.app_users enable row level security;
alter table public.user_screen_permissions enable row level security;
alter table public.collaborators enable row level security;
alter table public.flavors enable row level security;
alter table public.ingredients enable row level security;
alter table public.meat_profiles enable row level security;
alter table public.meat_profile_cuts enable row level security;
alter table public.formula_versions enable row level security;
alter table public.formula_ingredients enable row level security;
alter table public.partners enable row level security;
alter table public.meat_orders enable row level security;
alter table public.meat_order_lines enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_order_meat_allocations enable row level security;
alter table public.production_demands enable row level security;
alter table public.mass_base_batches enable row level security;
alter table public.mass_base_batch_meat_inputs enable row level security;
alter table public.mass_base_batch_ingredient_inputs enable row level security;
alter table public.production_portions enable row level security;
alter table public.portion_ingredient_lines enable row level security;
alter table public.process_runs enable row level security;
alter table public.process_run_collaborators enable row level security;
alter table public.finished_lots enable row level security;
alter table public.finished_lot_demand_allocations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.shipment_orders enable row level security;
alter table public.shipment_lines enable row level security;
alter table public.shipment_line_lots enable row level security;
alter table public.audit_log enable row level security;

create policy app_users_read_self_or_admin on public.app_users
for select to authenticated using (user_id = auth.uid() or public.app_is_admin());
create policy app_users_manage_admin on public.app_users
for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());
create policy permissions_read_self_or_admin on public.user_screen_permissions
for select to authenticated using (user_id = auth.uid() or public.app_is_admin());
create policy permissions_manage_admin on public.user_screen_permissions
for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());

create policy collaborators_by_screen on public.collaborators for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('production'));
create policy flavors_by_screen on public.flavors for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('production'));
create policy ingredients_by_screen on public.ingredients for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('separation'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('separation'));
create policy meat_profiles_by_screen on public.meat_profiles for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning'));
create policy meat_profile_cuts_by_screen on public.meat_profile_cuts for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning'));
create policy formulas_by_screen on public.formula_versions for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('separation'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning'));
create policy formula_ingredients_by_screen on public.formula_ingredients for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('separation'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning'));
create policy partners_by_screen on public.partners for all to authenticated
using (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('shipping'))
with check (public.app_has_screen_access('catalogs') or public.app_has_screen_access('planning') or public.app_has_screen_access('shipping'));
create policy meat_orders_by_planning on public.meat_orders for all to authenticated
using (public.app_has_screen_access('planning')) with check (public.app_has_screen_access('planning'));
create policy meat_order_lines_by_planning on public.meat_order_lines for all to authenticated
using (public.app_has_screen_access('planning')) with check (public.app_has_screen_access('planning'));
create policy production_orders_by_screen on public.production_orders for all to authenticated
using (public.app_has_screen_access('planning') or public.app_has_screen_access('production') or public.app_has_screen_access('inventory'))
with check (public.app_has_screen_access('planning') or public.app_has_screen_access('production'));
create policy order_meat_allocations_by_planning on public.production_order_meat_allocations for all to authenticated
using (public.app_has_screen_access('planning')) with check (public.app_has_screen_access('planning'));
create policy production_demands_by_screen on public.production_demands for all to authenticated
using (public.app_has_screen_access('planning') or public.app_has_screen_access('separation') or public.app_has_screen_access('production') or public.app_has_screen_access('inventory'))
with check (public.app_has_screen_access('planning'));
create policy base_batches_by_screen on public.mass_base_batches for all to authenticated
using (public.app_has_screen_access('planning') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('planning') or public.app_has_screen_access('production'));
create policy base_batch_meat_inputs_by_screen on public.mass_base_batch_meat_inputs for all to authenticated
using (public.app_has_screen_access('planning') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('planning') or public.app_has_screen_access('production'));
create policy base_batch_ingredient_inputs_by_screen on public.mass_base_batch_ingredient_inputs for all to authenticated
using (public.app_has_screen_access('planning') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('planning') or public.app_has_screen_access('production'));
create policy portions_by_screen on public.production_portions for all to authenticated
using (public.app_has_screen_access('separation') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('planning') or public.app_has_screen_access('separation') or public.app_has_screen_access('production'));
create policy portion_ingredients_by_screen on public.portion_ingredient_lines for all to authenticated
using (public.app_has_screen_access('separation') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('separation') or public.app_has_screen_access('production'));
create policy process_runs_by_production on public.process_runs for all to authenticated
using (public.app_has_screen_access('production')) with check (public.app_has_screen_access('production'));
create policy process_collaborators_by_production on public.process_run_collaborators for all to authenticated
using (public.app_has_screen_access('production')) with check (public.app_has_screen_access('production'));
create policy finished_lots_by_screen on public.finished_lots for all to authenticated
using (public.app_has_screen_access('production') or public.app_has_screen_access('inventory') or public.app_has_screen_access('shipping') or public.app_has_screen_access('billing'))
with check (public.app_has_screen_access('production') or public.app_has_screen_access('inventory'));
create policy finished_lot_allocations_by_screen on public.finished_lot_demand_allocations for all to authenticated
using (public.app_has_screen_access('inventory') or public.app_has_screen_access('shipping'))
with check (public.app_has_screen_access('inventory') or public.app_has_screen_access('shipping'));
create policy inventory_movements_by_screen on public.inventory_movements for all to authenticated
using (public.app_has_screen_access('inventory') or public.app_has_screen_access('shipping'))
with check (public.app_has_screen_access('inventory') or public.app_has_screen_access('shipping'));
create policy shipment_orders_by_screen on public.shipment_orders for all to authenticated
using (public.app_has_screen_access('shipping') or public.app_has_screen_access('billing'))
with check (public.app_has_screen_access('shipping'));
create policy shipment_lines_by_screen on public.shipment_lines for all to authenticated
using (public.app_has_screen_access('shipping') or public.app_has_screen_access('billing'))
with check (public.app_has_screen_access('shipping') or public.app_has_screen_access('billing'));
create policy shipment_line_lots_by_screen on public.shipment_line_lots for all to authenticated
using (public.app_has_screen_access('shipping') or public.app_has_screen_access('billing'))
with check (public.app_has_screen_access('shipping'));
create policy audit_log_read_admin on public.audit_log for select to authenticated
using (public.app_is_admin());

-- Visão geral é somente leitura; a permissão não concede edição operacional.
create policy overview_read_orders on public.production_orders for select to authenticated
using (public.app_has_screen_access('overview'));
create policy overview_read_demands on public.production_demands for select to authenticated
using (public.app_has_screen_access('overview'));
create policy overview_read_finished_lots on public.finished_lots for select to authenticated
using (public.app_has_screen_access('overview'));
create policy overview_read_movements on public.inventory_movements for select to authenticated
using (public.app_has_screen_access('overview'));

-- Nenhuma permissão é dada a anon. DML autenticado depende exclusivamente de RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
