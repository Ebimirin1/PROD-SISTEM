-- Importar Pedido (15/11/2026): lê a planilha semanal de produção (CSV ";" ou .xlsx com
-- semana_inicio, semana_fim, tipo, codigo, produto, kg_total, kg_congelado, kg_resfriado,
-- kg_sem_conservacao ...), acha o sabor pelo código de venda (o mesmo "Código" do Inflow usado
-- na Análise de Pedidos) e lança as linhas na OP aberta da semana (cria uma se não houver).
-- Pode rodar de novo sem problema.

begin;

-- 1. Registro das importações (para avisar e, se quiser, substituir uma importação repetida)
create table if not exists public.order_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  week_start date,
  week_end date,
  destination_key text,
  production_order_id uuid references public.production_orders(id) on delete cascade,
  total_kg numeric(12,3) not null default 0,
  replaced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.order_import_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.order_imports(id) on delete cascade,
  codigo text,
  produto text,
  tipo text,
  conservation text,
  kg numeric(12,3) not null default 0,
  flavor_id uuid references public.flavors(id) on delete set null,
  product_type text,
  status text not null,               -- ok | sem_vinculo | sem_receita | ignorado
  demand_id uuid references public.production_demands(id) on delete set null
);
create index if not exists order_import_lines_import_idx on public.order_import_lines (import_id);

-- Vínculos feitos à mão na tela de importação (código que não estava ligado a sabor)
create table if not exists public.order_import_code_map (
  codigo text primary key,
  flavor_id uuid references public.flavors(id) on delete cascade,
  product_type text check (product_type in ('manta', 'massa', 'linguica', 'granel', 'hamburguer')),
  ignore boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.order_imports enable row level security;
alter table public.order_import_lines enable row level security;
alter table public.order_import_code_map enable row level security;
drop policy if exists order_imports_by_screen on public.order_imports;
create policy order_imports_by_screen on public.order_imports for all to authenticated
using (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'))
with check (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'));
drop policy if exists order_import_lines_by_screen on public.order_import_lines;
create policy order_import_lines_by_screen on public.order_import_lines for all to authenticated
using (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'))
with check (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'));
drop policy if exists order_import_code_map_by_screen on public.order_import_code_map;
create policy order_import_code_map_by_screen on public.order_import_code_map for all to authenticated
using (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'))
with check (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'));
grant select, insert, update, delete on public.order_imports, public.order_import_lines, public.order_import_code_map to authenticated;

-- 2. Tipo de produto a partir da coluna "tipo" da planilha
create or replace function public.order_import_type(p_tipo text)
returns text language sql immutable as $$
  select case
    when p_tipo is null or trim(p_tipo) = '' then null
    when upper(p_tipo) like '%GRANEL%' then 'granel'
    when upper(p_tipo) like '%HAMB%' then 'hamburguer'
    when upper(p_tipo) like '%MASSA%' then 'massa'
    when upper(p_tipo) like '%MANTA%' then 'manta'
    when upper(p_tipo) like 'LINGU%' then 'linguica'
    else null end;
$$;

-- 3. Prévia: para cada código da planilha diz qual sabor/tipo vai para a OP.
--    Ordem de procura: vínculo feito nesta tela > Análise de Pedidos (Código Inflow -> ID ->
--    sabor) > código do produto no cadastro do sabor > mesmo produto sem "GRANEL"/"MASSA".
create or replace function public.order_import_preview(p_rows jsonb)
returns table (
  idx int, codigo text, catalog_name text, flavor_id uuid, flavor_name text,
  product_type text, has_recipe boolean, found_by text, ignored boolean
)
language sql stable security definer
set search_path = public
as $$
  with r as (
    select (e.ord - 1)::int as idx,
           trim(e.val->>'codigo') as codigo,
           e.val->>'tipo' as tipo,
           e.val->>'produto' as produto
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as e(val, ord)
  ),
  c as (
    select r.*,
           (select pc.product_code from public.product_catalog pc
             where pc.sku_code = r.codigo or pc.product_code = r.codigo
             order by (pc.sku_code = r.codigo) desc limit 1) as pid
    from r
  ),
  c2 as (
    select c.*, pc.product_name as cname,
           -- produto "irmão" sem GRANEL/MASSA no fim do nome (ex.: LING TRAD CORTES GRANEL -> LING TRAD CORTES)
           (select s.product_code from public.product_catalog s
             where pc.product_name ~* '\s(GRANEL|MASSA)$'
               and s.product_name = regexp_replace(pc.product_name, '\s+(GRANEL|MASSA)$', '', 'i')
             limit 1) as sibling
    from c left join public.product_catalog pc on pc.product_code = c.pid
  ),
  m as (
    select c2.*,
           im.flavor_id as f_manual, im.product_type as t_manual, coalesce(im.ignore, false) as ign_manual,
           sm.flavor_id as f_map, sm.product_type as t_map, coalesce(sm.ignore, false) as ign_map,
           (select f.id from public.flavors f
             where f.active and nullif(trim(to_jsonb(f)->>'product_code'), '') = c2.codigo limit 1) as f_code,
           ss.flavor_id as f_sib
    from c2
    left join public.order_import_code_map im on im.codigo = c2.codigo
    left join public.sales_product_map sm on sm.product_code = c2.pid
    left join public.sales_product_map ss on ss.product_code = c2.sibling
  ),
  z as (
    select m.*,
      case when m.f_manual is not null or m.ign_manual then 'manual'
           when m.f_map is not null then 'analise'
           when m.f_code is not null then 'cadastro'
           when m.f_sib is not null then 'irmao'
      end as how,
      coalesce(m.f_manual, m.f_map, m.f_code, m.f_sib) as fid
    from m
  )
  select z.idx, z.codigo, z.cname,
         case when z.ign_manual then null else z.fid end,
         f.name,
         coalesce(
           z.t_manual,
           case when public.order_import_type(z.tipo) in ('granel', 'massa', 'manta', 'hamburguer')
                then public.order_import_type(z.tipo) end,
           case when z.how = 'analise' and z.t_map is not null and z.t_map <> 'linguica' then z.t_map end,
           case when upper(coalesce(z.produto, '') || ' ' || coalesce(z.cname, '')) like '%HAMB%' then 'hamburguer' end,
           case when upper(coalesce(z.cname, '')) ~ '\sGRANEL$' then 'granel' end,
           public.order_import_type(z.tipo),
           'linguica'),
         exists (select 1 from public.formula_versions fv where fv.flavor_id = z.fid and fv.status = 'active'),
         z.how,
         z.ign_manual
  from z left join public.flavors f on f.id = z.fid and not z.ign_manual
  where public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning')
  order by z.idx;
$$;

-- 4. Gravar: lança na OP escolhida (ou cria), linhas sem sabor/receita ficam só no registro.
--    p_lines: [{codigo, produto, tipo, conservation, kg, flavor_id, product_type, remember}]
create or replace function public.order_import_apply(
  p_file_name text,
  p_week_start date,
  p_week_end date,
  p_destination text,
  p_op_id uuid,
  p_new_op_date date,
  p_replace boolean,
  p_lines jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op public.production_orders;
  v_code text;
  v_n int := 2;
  v_imp uuid;
  v_demands int := 0;
  v_kg numeric := 0;
  v_removed int := 0;
  r record;
  v_demand uuid;
begin
  if not (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning')) then
    raise exception 'Sem acesso à importação de pedido.';
  end if;
  if p_destination not in ('emporio', 'lanchonete', 'outro') then
    raise exception 'Destino inválido: %', p_destination;
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'A planilha não tem linhas com kg.';
  end if;

  if p_op_id is not null then
    select * into v_op from public.production_orders where id = p_op_id for update;
    if not found then raise exception 'Ordem de Produção não encontrada.'; end if;
    if v_op.generated_at is not null or v_op.canceled_at is not null then
      raise exception 'A OP % já foi gerada ou cancelada; escolha outra ou crie uma nova.', v_op.order_code;
    end if;
  else
    if p_new_op_date is null then raise exception 'Informe a data de produção da OP nova.'; end if;
    v_code := to_char(p_new_op_date, 'DDMMYYYY');
    while exists (select 1 from public.production_orders where order_code = v_code) loop
      v_code := to_char(p_new_op_date, 'DDMMYYYY') || '-' || v_n;
      v_n := v_n + 1;
    end loop;
    insert into public.production_orders (order_code, production_date, mass_ready_date, notes)
    values (v_code, p_new_op_date, p_new_op_date,
            'Criada pela importação do pedido ' || coalesce(p_file_name, ''))
    returning * into v_op;
  end if;

  -- Substituir: tira da OP as linhas lançadas por importações anteriores desta semana
  if coalesce(p_replace, false) then
    with old as (
      select l.demand_id from public.order_import_lines l
      join public.order_imports i on i.id = l.import_id
      where i.production_order_id = v_op.id and i.replaced_at is null
        and i.week_start is not distinct from p_week_start and l.demand_id is not null
    )
    delete from public.production_demands d using old where d.id = old.demand_id;
    get diagnostics v_removed = row_count;
    update public.order_imports set replaced_at = now()
    where production_order_id = v_op.id and replaced_at is null
      and week_start is not distinct from p_week_start;
  end if;

  -- Lembrar vínculos escolhidos à mão
  insert into public.order_import_code_map (codigo, flavor_id, product_type, updated_at)
  select distinct on (trim(l->>'codigo')) trim(l->>'codigo'), (l->>'flavor_id')::uuid, nullif(l->>'product_type', ''), now()
  from jsonb_array_elements(p_lines) l
  where coalesce((l->>'remember')::boolean, false) and nullif(l->>'flavor_id', '') is not null
    and nullif(trim(l->>'codigo'), '') is not null
  on conflict (codigo) do update set flavor_id = excluded.flavor_id, product_type = excluded.product_type,
    ignore = false, updated_at = now();

  insert into public.order_imports (file_name, week_start, week_end, destination_key, production_order_id)
  values (p_file_name, p_week_start, p_week_end, p_destination, v_op.id)
  returning id into v_imp;

  insert into public.order_import_lines (import_id, codigo, produto, tipo, conservation, kg, flavor_id, product_type, status)
  select v_imp, trim(l->>'codigo'), l->>'produto', l->>'tipo', nullif(l->>'conservation', ''),
         (l->>'kg')::numeric, nullif(l->>'flavor_id', '')::uuid,
         coalesce(nullif(l->>'product_type', ''), 'linguica'),
         case when nullif(l->>'flavor_id', '') is null then 'sem_vinculo'
              when not exists (select 1 from public.formula_versions fv
                               where fv.flavor_id = (l->>'flavor_id')::uuid and fv.status = 'active') then 'sem_receita'
              else 'ok' end
  from jsonb_array_elements(p_lines) l
  where coalesce((l->>'kg')::numeric, 0) > 0;

  for r in
    select x.flavor_id, x.product_type, x.conservation, sum(x.kg) as kg,
           string_agg(distinct coalesce(x.codigo, '?'), ', ') as codes
    from public.order_import_lines x
    where x.import_id = v_imp and x.status = 'ok'
    group by 1, 2, 3
  loop
    insert into public.production_demands
      (production_order_id, flavor_id, formula_version_id, destination_key, requested_product_type, requested_conservation, planned_kg, notes)
    values (v_op.id, r.flavor_id,
            (select id from public.formula_versions where flavor_id = r.flavor_id and status = 'active' order by version_no desc limit 1),
            p_destination, r.product_type, r.conservation, r.kg,
            'Importado do pedido ' || coalesce(p_file_name, '') || ' (cód. ' || r.codes || ')')
    returning id into v_demand;

    update public.order_import_lines x set demand_id = v_demand
    where x.import_id = v_imp and x.status = 'ok' and x.flavor_id = r.flavor_id
      and x.product_type = r.product_type and x.conservation is not distinct from r.conservation;
    v_demands := v_demands + 1;
    v_kg := v_kg + r.kg;
  end loop;

  update public.order_imports set total_kg = v_kg where id = v_imp;

  return json_build_object(
    'import_id', v_imp,
    'production_order_id', v_op.id,
    'order_code', v_op.order_code,
    'production_date', v_op.production_date,
    'created_op', p_op_id is null,
    'demands', v_demands,
    'kg', v_kg,
    'removed', v_removed,
    'skipped', coalesce((select json_agg(json_build_object('codigo', codigo, 'produto', produto, 'kg', kg, 'status', status) order by produto)
                         from public.order_import_lines where import_id = v_imp and status <> 'ok'), '[]'::json)
  );
end;
$$;

-- 5. Importações já feitas para a semana (para avisar antes de lançar de novo)
create or replace function public.order_import_history(p_week_start date)
returns table (id uuid, file_name text, created_at timestamptz, production_order_id uuid, order_code text, total_kg numeric)
language sql stable security definer
set search_path = public
as $$
  select i.id, i.file_name, i.created_at, i.production_order_id, o.order_code, i.total_kg
  from public.order_imports i join public.production_orders o on o.id = i.production_order_id
  where i.week_start = p_week_start and i.replaced_at is null
    and (public.app_has_screen_access('orderImport') or public.app_has_screen_access('planning'))
  order by i.created_at desc;
$$;

revoke all on function public.order_import_preview(jsonb) from public, anon;
revoke all on function public.order_import_apply(text, date, date, text, uuid, date, boolean, jsonb) from public, anon;
revoke all on function public.order_import_history(date) from public, anon;
grant execute on function public.order_import_preview(jsonb) to authenticated;
grant execute on function public.order_import_apply(text, date, date, text, uuid, date, boolean, jsonb) to authenticated;
grant execute on function public.order_import_history(date) to authenticated;
grant execute on function public.order_import_type(text) to authenticated;

-- 6. Tela nova na lista de permissões (mantém todas as chaves que já existem)
do $$
declare
  v_keys text[];
  v_con name;
begin
  select array_agg(distinct k order by k) into v_keys
  from (
    select unnest(array['overview', 'planning', 'catalogs', 'separation', 'production',
                        'labeling', 'inventory', 'shipping', 'billing', 'users',
                        'orderAnalysis', 'embutimento', 'vacuo', 'pdv', 'traceability', 'orderImport']) as k
    union
    select distinct screen_key from public.user_screen_permissions
    union
    select trim(both '"' from k2)
    from pg_constraint c,
         lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') as m,
         lateral regexp_split_to_table(trim(both '{}' from m[1]), ',') as k2
    where c.conrelid = 'public.user_screen_permissions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%screen_key%'
  ) t
  where k is not null and k <> '' and k !~ '[^A-Za-z_]';

  for v_con in
    select conname from pg_constraint
    where conrelid = 'public.user_screen_permissions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%screen_key%'
  loop
    execute format('alter table public.user_screen_permissions drop constraint %I', v_con);
  end loop;
  execute format(
    'alter table public.user_screen_permissions add constraint user_screen_permissions_screen_key_check check (screen_key = any (%L::text[]))',
    v_keys);
end $$;

-- 7. Quem tem só "Importar Pedido" precisa ver OPs e sabores na tela
drop policy if exists order_import_read_orders on public.production_orders;
create policy order_import_read_orders on public.production_orders for select to authenticated
using (public.app_has_screen_access('orderImport'));
drop policy if exists order_import_read_flavors on public.flavors;
create policy order_import_read_flavors on public.flavors for select to authenticated
using (public.app_has_screen_access('orderImport'));

commit;

notify pgrst, 'reload schema';
