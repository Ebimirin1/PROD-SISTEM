-- Análise de Pedidos (08/11/2026): histórico de vendas + estoque informado + cálculo da média.
-- Só CRIA coisas novas; não altera nenhuma tabela existente além de liberar a tela nova
-- ('orderAnalysis') na lista de permissões. Pode rodar de novo sem problema.

begin;

-- 1. Histórico de vendas importado do relatório "Mapa de Vendas por Cliente".
-- A chave (tipo, venda, item) torna a importação repetível: importar o mesmo período
-- de novo só atualiza as linhas, não duplica.
create table if not exists public.sales_records (
  id bigserial primary key,
  sale_type text not null default '',          -- VAREJO, ATACADO...
  customer text not null default '',           -- "1 - CONSUMIDOR"
  sale_number text not null,                   -- nº da venda
  item_seq int not null,                       -- posição do item dentro da venda
  sale_date date not null,
  sale_time time,
  product_code text not null,
  product_name text not null,
  qty numeric(14,3) not null default 0,
  total numeric(14,2) not null default 0,
  imported_at timestamptz not null default now(),
  constraint sales_records_key unique (sale_type, sale_number, item_seq)
);
create index if not exists sales_records_date_idx on public.sales_records (sale_date);
create index if not exists sales_records_product_idx on public.sales_records (product_code, sale_date);

-- 2. Estoque atual informado na tela (um valor por produto).
create table if not exists public.order_stock (
  product_code text primary key,
  stock_qty numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- 3. Média por produto nas últimas N semanas até a data de referência.
-- Semana 1 = os 7 dias que terminam na data de referência; semana 2 = os 7 anteriores...
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
    select s.product_code,
           ((p_ref - s.sale_date) / 7) + 1 as wk,
           s.qty
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
  -- Só produtos com venda nas semanas (o mapa de estoque traz matéria-prima, embalagem etc.)
  prods as (
    select product_code from agg
  ),
  names as (
    select distinct on (s.product_code) s.product_code, s.product_name, s.sale_date
    from public.sales_records s
    join prods p using (product_code)
    where s.sale_date <= p_ref
    order by s.product_code, s.sale_date desc
  )
  select p.product_code,
         coalesce(n.product_name, p.product_code),
         coalesce(a.weekly_qty, array_fill(0::numeric, array[p_weeks])),
         coalesce(a.total_qty, 0),
         round(coalesce(a.total_qty, 0) / p_weeks, 3),
         n.sale_date,
         coalesce(o.stock_qty, 0),
         o.updated_at
  from prods p
  left join agg a using (product_code)
  left join names n using (product_code)
  left join public.order_stock o using (product_code)
  order by coalesce(a.total_qty, 0) desc, 2;
$$;

-- 4. Resumo da base (quantas linhas, de quando até quando, tipos de venda).
create or replace function public.sales_summary()
returns json
language sql stable
set search_path = public
as $$
  select json_build_object(
    'rows', count(*),
    'first_date', min(sale_date),
    'last_date', max(sale_date),
    'last_import', max(imported_at),
    'types', coalesce((select json_agg(distinct sale_type) from public.sales_records), '[]'::json)
  )
  from public.sales_records;
$$;

-- 5. Tela nova na lista de permissões
alter table public.user_screen_permissions drop constraint if exists user_screen_permissions_screen_key_check;
alter table public.user_screen_permissions add constraint user_screen_permissions_screen_key_check
  check (screen_key in (
    'overview', 'planning', 'catalogs', 'separation', 'production',
    'labeling', 'inventory', 'shipping', 'billing', 'users', 'orderAnalysis'
  ));

-- 6. Regras de acesso: só quem tem a tela Análise de Pedidos (admin sempre tem)
alter table public.sales_records enable row level security;
alter table public.order_stock enable row level security;

drop policy if exists sales_records_by_screen on public.sales_records;
create policy sales_records_by_screen on public.sales_records for all to authenticated
using (public.app_has_screen_access('orderAnalysis'))
with check (public.app_has_screen_access('orderAnalysis'));

drop policy if exists order_stock_by_screen on public.order_stock;
create policy order_stock_by_screen on public.order_stock for all to authenticated
using (public.app_has_screen_access('orderAnalysis'))
with check (public.app_has_screen_access('orderAnalysis'));

grant select, insert, update, delete on public.sales_records, public.order_stock to authenticated;
grant usage, select on sequence public.sales_records_id_seq to authenticated;
revoke execute on function public.order_analysis(date, int, text), public.sales_summary() from public, anon;
grant execute on function public.order_analysis(date, int, text), public.sales_summary() to authenticated;

commit;

notify pgrst, 'reload schema';
