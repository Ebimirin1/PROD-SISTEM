-- Análise de Pedidos, parte 2 (08/11/2026): vínculo produto → sabor, pedidos salvos e envio
-- para a Ordem de Produção. Rodar DEPOIS de migration_analise_pedidos.sql. Só cria coisas
-- novas; pode rodar de novo sem problema.

begin;

-- 1. Vínculo do produto de venda (código do relatório/Inflow) com o sabor e o tipo da OP
create table if not exists public.sales_product_map (
  product_code text primary key,
  flavor_id uuid references public.flavors(id) on delete set null,
  product_type text check (product_type in ('manta', 'massa', 'linguica', 'granel', 'hamburguer')),
  conservation text check (conservation in ('resfriado', 'congelado')),
  ignore boolean not null default false,       -- produto que não vai para OP (ex.: bolsa térmica)
  updated_at timestamptz not null default now()
);

-- 2. Pedidos salvos (histórico)
create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  ref_date date not null,
  weeks int not null,
  giros numeric(6,2) not null,
  sale_type text,
  destination_key text not null check (destination_key in ('emporio', 'lanchonete', 'outro')),
  production_order_id uuid references public.production_orders(id) on delete set null,
  total_qty numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.order_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.order_requests(id) on delete cascade,
  product_code text not null,
  product_name text not null,
  weekly_avg numeric(14,3) not null default 0,
  stock_qty numeric(14,3) not null default 0,
  suggestion numeric(14,3) not null default 0,
  order_qty numeric(14,3) not null check (order_qty > 0),
  flavor_id uuid references public.flavors(id) on delete set null,
  product_type text,
  demand_id uuid references public.production_demands(id) on delete set null
);
create index if not exists order_request_lines_request_idx on public.order_request_lines (request_id);

-- 3. Salva o pedido e lança as linhas na OP (uma existente ainda não gerada, ou uma nova).
-- Produtos do mesmo sabor + tipo + conservação viram UMA linha de demanda (kg somados).
-- Tudo ou nada: se faltar receita ativa em algum sabor, nada é gravado.
create or replace function public.save_order_request(
  p_ref date,
  p_weeks int,
  p_giros numeric,
  p_sale_type text,
  p_destination text,
  p_op_id uuid,          -- OP existente (ou null para criar)
  p_new_op_date date,    -- data de produção da OP nova (quando p_op_id é null)
  p_lines jsonb          -- [{product_code, product_name, weekly_avg, stock_qty, suggestion, order_qty}]
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_op public.production_orders;
  v_req uuid;
  v_code text;
  v_n int := 2;
  v_missing text;
  v_demands int := 0;
  r record;
  v_demand uuid;
begin
  if p_destination not in ('emporio', 'lanchonete', 'outro') then
    raise exception 'Destino inválido: %', p_destination;
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Nenhum produto com pedido.';
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
    values (v_code, p_new_op_date, p_new_op_date, 'Criada pela Análise de Pedidos')
    returning * into v_op;
  end if;

  insert into public.order_requests (ref_date, weeks, giros, sale_type, destination_key, production_order_id, total_qty)
  values (p_ref, p_weeks, p_giros, nullif(p_sale_type, ''), p_destination, v_op.id,
          (select coalesce(sum((l->>'order_qty')::numeric), 0) from jsonb_array_elements(p_lines) l))
  returning id into v_req;

  insert into public.order_request_lines (request_id, product_code, product_name, weekly_avg, stock_qty, suggestion, order_qty, flavor_id, product_type)
  select v_req, l->>'product_code', coalesce(l->>'product_name', l->>'product_code'),
         coalesce((l->>'weekly_avg')::numeric, 0), coalesce((l->>'stock_qty')::numeric, 0),
         coalesce((l->>'suggestion')::numeric, 0), (l->>'order_qty')::numeric,
         -- "sabor:<id>" = linha de um sabor sem produto vinculado (vai como linguiça)
         case when l->>'product_code' like 'sabor:%' then substr(l->>'product_code', 7)::uuid
              when m.ignore then null else m.flavor_id end,
         case when l->>'product_code' like 'sabor:%' then 'linguica' else m.product_type end
  from jsonb_array_elements(p_lines) l
  left join public.sales_product_map m on m.product_code = l->>'product_code'
  where (l->>'order_qty')::numeric > 0;

  -- Sabores sem receita ativa: para tudo
  select string_agg(distinct f.name, ', ') into v_missing
  from public.order_request_lines x
  join public.flavors f on f.id = x.flavor_id
  where x.request_id = v_req
    and not exists (select 1 from public.formula_versions fv where fv.flavor_id = x.flavor_id and fv.status = 'active');
  if v_missing is not null then
    raise exception 'Sem receita ativa (Cadastros & Fórmulas): %', v_missing;
  end if;

  for r in
    select x.flavor_id, coalesce(x.product_type, 'linguica') as product_type, m.conservation,
           sum(x.order_qty) as kg, string_agg(x.product_name, ', ' order by x.product_name) as names
    from public.order_request_lines x
    left join public.sales_product_map m on m.product_code = x.product_code
    where x.request_id = v_req and x.flavor_id is not null
    group by 1, 2, 3
  loop
    insert into public.production_demands
      (production_order_id, flavor_id, formula_version_id, destination_key, requested_product_type, requested_conservation, planned_kg, notes)
    values (v_op.id, r.flavor_id,
            (select id from public.formula_versions where flavor_id = r.flavor_id and status = 'active' order by version_no desc limit 1),
            p_destination, r.product_type, r.conservation, r.kg, 'Análise de Pedidos: ' || r.names)
    returning id into v_demand;

    update public.order_request_lines x set demand_id = v_demand
    where x.request_id = v_req and x.flavor_id = r.flavor_id
      and coalesce(x.product_type, 'linguica') = r.product_type
      and (select m.conservation from public.sales_product_map m where m.product_code = x.product_code)
          is not distinct from r.conservation;
    v_demands := v_demands + 1;
  end loop;

  return json_build_object(
    'request_id', v_req,
    'production_order_id', v_op.id,
    'order_code', v_op.order_code,
    'production_date', v_op.production_date,
    'demands', v_demands,
    'unmapped', coalesce((select json_agg(product_name order by product_name)
                          from public.order_request_lines
                          where request_id = v_req and flavor_id is null), '[]'::json)
  );
end;
$$;

-- 4. Acesso: quem tem a tela Análise de Pedidos (admin sempre tem)
alter table public.sales_product_map enable row level security;
alter table public.order_requests enable row level security;
alter table public.order_request_lines enable row level security;

drop policy if exists sales_product_map_by_screen on public.sales_product_map;
create policy sales_product_map_by_screen on public.sales_product_map for all to authenticated
using (public.app_has_screen_access('orderAnalysis')) with check (public.app_has_screen_access('orderAnalysis'));
drop policy if exists order_requests_by_screen on public.order_requests;
create policy order_requests_by_screen on public.order_requests for all to authenticated
using (public.app_has_screen_access('orderAnalysis')) with check (public.app_has_screen_access('orderAnalysis'));
drop policy if exists order_request_lines_by_screen on public.order_request_lines;
create policy order_request_lines_by_screen on public.order_request_lines for all to authenticated
using (public.app_has_screen_access('orderAnalysis')) with check (public.app_has_screen_access('orderAnalysis'));

grant select, insert, update, delete on public.sales_product_map, public.order_requests, public.order_request_lines to authenticated;
revoke execute on function public.save_order_request(date, int, numeric, text, text, uuid, date, jsonb) from public, anon;
grant execute on function public.save_order_request(date, int, numeric, text, text, uuid, date, jsonb) to authenticated;

-- 5. Vínculos iniciais produto (ID do relatório/Inflow) → sabor, pelo nome do sabor.
-- Só grava quando exatamente UM sabor ativo combina e o produto ainda não tem vínculo;
-- o resto (e qualquer correção) se faz na tela, em "Vincular sabores".
insert into public.sales_product_map (product_code, flavor_id, product_type)
select s.code,
       (select f.id from public.flavors f
         where f.active and lower(f.name) ~ s.re and (s.nre is null or lower(f.name) !~ s.nre)),
       s.ptype
from (values
  ('1',   'linguica', 'trad', 'picad|nobre|mo[ií]d|defum'),
  ('876', 'linguica', 'trad', 'picad|nobre|mo[ií]d|defum'),
  ('951', 'manta',    'trad', 'picad|nobre|mo[ií]d|defum'),
  ('13',  'linguica', 'nobre|mo[ií]da', null),
  ('5',   'linguica', 'picad', null),
  ('953', 'manta',    'picad', null),
  ('121', 'linguica', 'gorg', null),
  ('976', 'manta',    'gorg', null),
  ('21',  'linguica', 'ro[cç]a', null),
  ('946', 'manta',    'ro[cç]a', null),
  ('827', 'linguica', 'alho.*por', null),
  ('972', 'manta',    'alho.*por', null),
  ('89',  'linguica', 'alho', 'por'),
  ('966', 'manta',    'alho', 'por'),
  ('113', 'linguica', 'cuiab', 'bov'),
  ('974', 'manta',    'cuiab', 'bov'),
  ('145', 'linguica', 'brag', null),
  ('980', 'manta',    'brag', null),
  ('101', 'linguica', 'r[uú]c', null),
  ('971', 'manta',    'r[uú]c', null),
  ('1385','linguica', 'cerveja', null),
  ('1386','manta',    'cerveja', null),
  ('133', 'linguica', 'canastra', null),
  ('973', 'manta',    'canastra', null),
  ('77',  'linguica', 'lim[aã]o', null),
  ('960', 'manta',    'lim[aã]o', null),
  ('117', 'linguica', 'prov', null),
  ('979', 'manta',    'prov', null),
  ('25',  'linguica', 'panceta', 'shim'),
  ('948', 'manta',    'panceta', 'shim'),
  ('29',  'linguica', 'shim', null),
  ('949', 'manta',    'shim', null),
  ('1314','linguica', '[aá]rabe', null),
  ('1315','manta',    '[aá]rabe', null),
  ('17',  'linguica', 'bacon', 'fruta'),
  ('945', 'manta',    'bacon', 'fruta'),
  ('97',  'linguica', 'chilen', null),
  ('967', 'manta',    'chilen', null),
  ('940', 'linguica', 'cheddar|jalape', null),
  ('962', 'manta',    'cheddar|jalape', null),
  ('61',  'linguica', 'calab.*fina', null),
  ('57',  'linguica', 'calab', 'fina|m[eé]dia'),
  ('957', 'manta',    'calab', 'fina|m[eé]dia'),
  ('69',  'linguica', 'biq', 'canastra'),
  ('959', 'manta',    'biq', 'canastra'),
  ('129', 'linguica', 'napolit', null),
  ('978', 'manta',    'napolit', null),
  ('109', 'linguica', 'brasileir', null),
  ('968', 'manta',    'brasileir', null),
  ('839', 'linguica', 'cream', null),
  ('981', 'manta',    'cream', null),
  ('105', 'linguica', 'cebolinha|ceb.* e cebol', 'cerveja'),
  ('969', 'manta',    'cebolinha|ceb.* e cebol', 'cerveja'),
  ('33',  'linguica', 'toscan', null),
  ('950', 'manta',    'toscan', null),
  ('53',  'linguica', 'caip', null),
  ('985', 'manta',    'caip', null),
  ('141', 'linguica', 'busca', null),
  ('947', 'manta',    'busca', null),
  ('954', 'linguica', 'fruta', null),
  ('955', 'manta',    'fruta', null),
  ('73',  'linguica', 'malag|mexic', null),
  ('956', 'manta',    'malag|mexic', null),
  ('81',  'linguica', 'carol|reaper', null),
  ('961', 'manta',    'carol|reaper', null),
  ('85',  'linguica', 'ervas', null),
  ('970', 'manta',    'ervas', null),
  ('1287','linguica', 'choc|conhaque', null),
  ('1302','manta',    'choc|conhaque', null),
  ('853', 'linguica', 'festiva', null),
  ('988', 'manta',    'festiva', null)
) as s(code, ptype, re, nre)
where (select count(*) from public.flavors f
        where f.active and lower(f.name) ~ s.re and (s.nre is null or lower(f.name) !~ s.nre)) = 1
on conflict (product_code) do nothing;

-- 6. Nome do produto no estoque (vem do mapa do Inflow)
alter table public.order_stock add column if not exists product_name text;

-- 7. Lista do pedido: produtos com venda nas semanas + TODOS os produtos vinculados a sabor
-- + sabores ativos que ainda não têm produto vinculado (linha "sabor:<id>").
create or replace function public.order_analysis(
  p_ref date default current_date,
  p_weeks int default 4,
  p_sale_type text default null
)
returns table (
  product_code text,
  product_name text,
  weekly_qty numeric[],
  total_qty numeric,
  weekly_avg numeric,
  last_sale date,
  stock_qty numeric,
  stock_updated_at timestamptz
)
language sql stable
set search_path = public
as $$
  with win as (
    select s.product_code, ((p_ref - s.sale_date) / 7) + 1 as wk, s.qty
    from public.sales_records s
    where s.sale_date > p_ref - 7 * p_weeks
      and s.sale_date <= p_ref
      and (p_sale_type is null or s.sale_type = p_sale_type)
  ),
  agg as (
    select w.product_code,
           array(select coalesce(sum(w2.qty), 0)
                 from generate_series(1, p_weeks) g(n)
                 left join win w2 on w2.product_code = w.product_code and w2.wk = g.n
                 group by g.n order by g.n) as weekly_qty,
           sum(w.qty) as total_qty
    from win w
    group by w.product_code
  ),
  mapped as (
    select m.product_code from public.sales_product_map m
    join public.flavors f on f.id = m.flavor_id and f.active
    where not m.ignore
  ),
  lonely as (
    select 'sabor:' || f.id as product_code, f.name
    from public.flavors f
    where f.active
      and not exists (select 1 from public.sales_product_map m where m.flavor_id = f.id and not m.ignore)
  ),
  prods as (
    select product_code from agg
    union select product_code from mapped
    union select product_code from lonely
  ),
  names as (
    select distinct on (s.product_code) s.product_code, s.product_name, s.sale_date
    from public.sales_records s
    join prods p using (product_code)
    where s.sale_date <= p_ref
    order by s.product_code, s.sale_date desc
  )
  select p.product_code,
         coalesce(n.product_name, o.product_name, l.name,
                  (select upper(f.name) || ' (' || coalesce(m.product_type, 'linguica') || ')'
                   from public.sales_product_map m join public.flavors f on f.id = m.flavor_id
                   where m.product_code = p.product_code),
                  p.product_code),
         coalesce(a.weekly_qty, array_fill(0::numeric, array[p_weeks])),
         coalesce(a.total_qty, 0),
         round(coalesce(a.total_qty, 0) / p_weeks, 3),
         n.sale_date,
         coalesce(o.stock_qty, 0),
         o.updated_at
  from prods p
  left join agg a using (product_code)
  left join names n using (product_code)
  left join lonely l using (product_code)
  left join public.order_stock o using (product_code)
  order by coalesce(a.total_qty, 0) desc, 2;
$$;

-- 8. Histórico de vendas agrupado por dia, semana (começa na segunda) ou mês
create or replace function public.sales_history(
  p_from date,
  p_to date,
  p_grain text default 'week',
  p_sale_type text default null
)
returns table (product_code text, product_name text, period date, qty numeric, total numeric, sales bigint)
language sql stable
set search_path = public
as $$
  select s.product_code,
         max(s.product_name),
         case p_grain when 'day' then s.sale_date
                      when 'month' then date_trunc('month', s.sale_date)::date
                      else date_trunc('week', s.sale_date)::date end as period,
         sum(s.qty), sum(s.total), count(distinct s.sale_number)
  from public.sales_records s
  where s.sale_date between p_from and p_to
    and (p_sale_type is null or s.sale_type = p_sale_type)
  group by 1, 3
  order by 1, 3;
$$;

revoke execute on function public.order_analysis(date, int, text), public.sales_history(date, date, text, text) from public, anon;
grant execute on function public.order_analysis(date, int, text), public.sales_history(date, date, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
