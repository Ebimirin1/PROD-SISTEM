-- Análise de Pedidos, parte 4 (09/11/2026): resfriado/congelado por linha do pedido e
-- datas da última venda e do último mapa de estoque. Rodar DEPOIS das partes 1, 2 e 3.
-- Só acrescenta coluna e recria funções; pode rodar de novo sem problema.

begin;

alter table public.order_request_lines add column if not exists conservation text
  check (conservation in ('resfriado', 'congelado'));

-- Pedido: a conservação vem de cada linha (resfriado/congelado) e separa as linhas da OP
create or replace function public.save_order_request(
  p_ref date,
  p_weeks int,
  p_giros numeric,
  p_sale_type text,
  p_destination text,
  p_op_id uuid,          -- OP existente (ou null para criar)
  p_new_op_date date,    -- data de produção da OP nova (quando p_op_id é null)
  p_lines jsonb          -- [{product_code, product_name, weekly_avg, stock_qty, suggestion, order_qty, conservation}]
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

  insert into public.order_request_lines (request_id, product_code, product_name, weekly_avg, stock_qty, suggestion, order_qty, flavor_id, product_type, conservation)
  select v_req, l->>'product_code', coalesce(l->>'product_name', l->>'product_code'),
         coalesce((l->>'weekly_avg')::numeric, 0), coalesce((l->>'stock_qty')::numeric, 0),
         coalesce((l->>'suggestion')::numeric, 0), (l->>'order_qty')::numeric,
         -- "sabor:<id>" = linha de um sabor sem produto vinculado (vai como linguiça)
         case when l->>'product_code' like 'sabor:%' then substr(l->>'product_code', 7)::uuid
              when m.ignore then null else m.flavor_id end,
         case when l->>'product_code' like 'sabor:%' then 'linguica' else m.product_type end,
         coalesce(nullif(l->>'conservation', ''), m.conservation)
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
    select x.flavor_id, coalesce(x.product_type, 'linguica') as product_type, x.conservation,
           sum(x.order_qty) as kg, string_agg(x.product_name, ', ' order by x.product_name) as names
    from public.order_request_lines x
    where x.request_id = v_req and x.flavor_id is not null
    group by 1, 2, 3
  loop
    insert into public.production_demands
      (production_order_id, flavor_id, formula_version_id, destination_key, requested_product_type, requested_conservation, planned_kg, notes)
    values (v_op.id, r.flavor_id,
            (select id from public.formula_versions where flavor_id = r.flavor_id and status = 'active' order by version_no desc limit 1),
            p_destination, r.product_type, r.conservation, r.kg, 'Pedido do empório (Análise de Pedidos)')
    returning id into v_demand;

    update public.order_request_lines x set demand_id = v_demand
    where x.request_id = v_req and x.flavor_id = r.flavor_id
      and coalesce(x.product_type, 'linguica') = r.product_type
      and x.conservation is not distinct from r.conservation;
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

-- Resumo para o topo da tela: última venda na base e último mapa de estoque importado
create or replace function public.sales_summary()
returns json
language sql stable
set search_path = public
as $$
  select json_build_object(
    'rows', (select count(*) from public.sales_records),
    'first_date', (select min(sale_date) from public.sales_records),
    'last_date', (select max(sale_date) from public.sales_records),
    'last_import', (select max(imported_at) from public.sales_records),
    'last_stock', (select max(updated_at) from public.order_stock where product_code not like 'sabor:%'),
    'types', coalesce((select json_agg(distinct sale_type) from public.sales_records), '[]'::json)
  );
$$;

revoke execute on function public.save_order_request(date, int, numeric, text, text, uuid, date, jsonb), public.sales_summary() from public, anon;
grant execute on function public.save_order_request(date, int, numeric, text, text, uuid, date, jsonb), public.sales_summary() to authenticated;

commit;

notify pgrst, 'reload schema';
