-- Análise de Pedidos (5): aviso de semanas sem vendas na base.
-- Conta as vendas de cada semana (7 dias que terminam na data de referência, depois os 7 anteriores...)
-- para a tela avisar quando a média está baixa porque faltam vendas importadas.
-- Só leitura; pode rodar mais de uma vez.
begin;

create or replace function public.sales_coverage(
  p_ref date default current_date,
  p_weeks int default 30,
  p_sale_type text default null
)
returns table (wk int, week_start date, week_end date, sales bigint, qty numeric)
language sql stable
set search_path = public
as $$
  select g.n,
         p_ref - 7 * g.n + 1,
         p_ref - 7 * (g.n - 1),
         count(distinct s.sale_number),
         coalesce(sum(s.qty), 0)
  from generate_series(1, greatest(p_weeks, 1)) g(n)
  left join public.sales_records s
    on s.sale_date > p_ref - 7 * g.n and s.sale_date <= p_ref - 7 * (g.n - 1)
   and (p_sale_type is null or s.sale_type = p_sale_type)
  group by g.n
  order by g.n;
$$;

revoke execute on function public.sales_coverage(date, int, text) from public, anon;
grant execute on function public.sales_coverage(date, int, text) to authenticated;

commit;

notify pgrst, 'reload schema';
