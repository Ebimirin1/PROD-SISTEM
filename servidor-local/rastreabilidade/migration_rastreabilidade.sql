-- Rastreabilidade por lote — tela "Consultar Origem" (chave da tela: traceability)
-- Rodar UMA VEZ no banco sgp (PostgreSQL 17, porta 5433), por exemplo no HeidiSQL.
-- Não apaga nem altera dados: só cria uma visão, duas funções de consulta e libera a tela nova.
--
-- Regras:
--   * Lote do produto = data de produção da OP (sempre o mesmo para tudo que saiu daquela OP).
--   * Massa-base: as bateladas são a massada única da OP, então TODA batelada da OP entra na
--     origem de TODOS os produtos daquela OP (lotes vêm da Separação > Bateladas de Massa-Base).
--   * Insumos do sabor: lote digitado na Separação > Kits por Porção (portion_ingredient_lines).
--
-- A visão public.vw_rastreabilidade_insumos tem uma linha por insumo/lote usado, com
-- ingredient_id (quando o nome bate com o cadastro de insumos), insumo_nome e insumo_lote.
-- É por (insumo, lote) que o app de recebimento/nota fiscal vai se ligar a ela.

begin;

-- 1. Visão única: uma linha por insumo usado em cada OP, com o lote
create or replace view public.vw_rastreabilidade_insumos as
select
  po.id                                   as production_order_id,
  po.order_code,
  po.production_date,
  to_char(po.production_date, 'DD/MM/YYYY') as lote_produto,
  null::uuid                              as flavor_id,          -- vale para todos os sabores da OP
  null::text                              as flavor_name,
  'massa_base'::text                      as origem,
  s.batch_no,
  null::integer                           as portion_no,
  s.item_kind,                                                   -- carne | tempero
  i.id                                    as ingredient_id,
  s.item_name                             as insumo_nome,
  nullif(trim(s.lot_code), '')            as insumo_lote,
  s.separated_kg                          as quantidade,
  'kg'::text                              as unidade,
  s.separated_at                          as registrado_em
from public.base_batch_item_separations s
join public.production_orders po on po.id = s.production_order_id
left join public.ingredients i on lower(trim(i.name)) = lower(trim(s.item_name))
where po.canceled_at is null

union all

select
  po.id,
  po.order_code,
  po.production_date,
  to_char(po.production_date, 'DD/MM/YYYY'),
  pp.flavor_id,
  f.name,
  'sabor'::text,
  null::integer,
  pp.portion_no,
  'insumo'::text,
  l.ingredient_id,
  ing.name,
  nullif(trim(l.ingredient_lot), ''),
  coalesce(l.separated_quantity, l.requested_quantity),
  l.unit,
  l.separated_at
from public.portion_ingredient_lines l
join public.production_portions pp on pp.id = l.portion_id
join public.production_orders po on po.id = pp.production_order_id
join public.flavors f on f.id = pp.flavor_id
join public.ingredients ing on ing.id = l.ingredient_id
where po.canceled_at is null;

comment on view public.vw_rastreabilidade_insumos is
  'Rastreabilidade: um registro por insumo/lote usado em cada OP. flavor_id nulo = massa-base (vale para todos os sabores da OP). Ligar ao recebimento por (insumo_nome ou ingredient_id, insumo_lote).';

-- A visão em si não fica aberta para o app; a tela usa as funções abaixo, que conferem a permissão.
revoke all on public.vw_rastreabilidade_insumos from public, anon, authenticated;

-- 2. Origem de uma OP (todos os sabores; a tela filtra pelo produto escolhido)
create or replace function public.rastreabilidade_origem(p_order_id uuid)
returns setof public.vw_rastreabilidade_insumos
language sql stable security definer
set search_path = public, auth
as $$
  select v.*
  from public.vw_rastreabilidade_insumos v
  where v.production_order_id = p_order_id
    and public.app_has_screen_access('traceability')
  order by v.origem, v.batch_no nulls last, v.flavor_name nulls first, v.portion_no nulls last, v.insumo_nome;
$$;

-- 3. Caminho inverso: em quais OPs/produtos um lote de insumo foi usado (recolhimento)
create or replace function public.rastreabilidade_por_lote_insumo(p_lote text)
returns setof public.vw_rastreabilidade_insumos
language sql stable security definer
set search_path = public, auth
as $$
  select v.*
  from public.vw_rastreabilidade_insumos v
  where public.app_has_screen_access('traceability')
    and length(trim(coalesce(p_lote, ''))) > 0
    and v.insumo_lote ilike '%' || trim(p_lote) || '%'
  order by v.production_date desc, v.order_code, v.insumo_nome
  limit 500;
$$;

revoke all on function public.rastreabilidade_origem(uuid) from public, anon;
revoke all on function public.rastreabilidade_por_lote_insumo(text) from public, anon;
grant execute on function public.rastreabilidade_origem(uuid) to authenticated;
grant execute on function public.rastreabilidade_por_lote_insumo(text) to authenticated;

-- 4. Tela nova na lista de permissões (mantém todas as chaves que já existem)
do $$
declare
  v_keys text[];
  v_con name;
begin
  select array_agg(distinct k order by k) into v_keys
  from (
    select unnest(array['overview', 'planning', 'catalogs', 'separation', 'production',
                        'labeling', 'inventory', 'shipping', 'billing', 'users',
                        'orderAnalysis', 'traceability']) as k
    union
    select distinct screen_key from public.user_screen_permissions
    union
    -- chaves que já estão no CHECK atual (ex.: embutimento, vacuo, pdv no servidor)
    -- aceita as duas formas: ARRAY['a'::text, ...] e '{a,b}'::text[]
    select trim(both '"' from k2)
    from pg_constraint c,
         lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') as m,
         lateral regexp_split_to_table(trim(both '{}' from m[1]), ',') as k2
    where c.conrelid = 'public.user_screen_permissions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%screen_key%'
  ) t;

  -- remove todo CHECK de screen_key (qualquer nome) antes de recriar
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

-- 5. Para a tela listar as OPs, quem tem só "Consultar Origem" precisa ler OPs, sabores e pedidos
drop policy if exists traceability_read_orders on public.production_orders;
create policy traceability_read_orders on public.production_orders for select to authenticated
using (public.app_has_screen_access('traceability'));

drop policy if exists traceability_read_demands on public.production_demands;
create policy traceability_read_demands on public.production_demands for select to authenticated
using (public.app_has_screen_access('traceability'));

drop policy if exists traceability_read_flavors on public.flavors;
create policy traceability_read_flavors on public.flavors for select to authenticated
using (public.app_has_screen_access('traceability'));

commit;

-- Conferência (opcional): deve listar os insumos e lotes da OP mais recente
-- select * from public.vw_rastreabilidade_insumos
-- where production_order_id = (select id from public.production_orders order by production_date desc limit 1);
