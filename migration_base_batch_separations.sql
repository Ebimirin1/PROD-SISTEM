-- Migration SQL: confirmação de separação e lote dos itens das bateladas de massa-base
-- Execute este script no SQL Editor do Supabase (pode rodar mais de uma vez sem erro).
--
-- As bateladas da mexedeira são calculadas pela tela a partir da massada total da OP
-- (bateladas cheias de 150 kg, a última com o restante). Cada linha desta tabela registra
-- a pesagem confirmada de um item (carne ou tempero) de uma batelada, com o lote usado.

create table if not exists public.base_batch_item_separations (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  batch_no integer not null check (batch_no > 0),
  item_name text not null check (length(trim(item_name)) > 0),
  item_kind text not null check (item_kind in ('carne', 'tempero')),
  requested_kg numeric(12,3) not null check (requested_kg > 0),
  separated_kg numeric(12,3) not null check (separated_kg > 0),
  lot_code text not null check (length(trim(lot_code)) > 0),
  separated_at timestamptz not null default now(),
  separated_by uuid default auth.uid() references auth.users(id) on delete set null,
  unique (production_order_id, batch_no, item_name)
);

create index if not exists base_batch_item_separations_order_idx
  on public.base_batch_item_separations (production_order_id);

alter table public.base_batch_item_separations enable row level security;

drop policy if exists base_batch_item_separations_by_screen on public.base_batch_item_separations;
create policy base_batch_item_separations_by_screen on public.base_batch_item_separations
for all to authenticated
using (public.app_has_screen_access('separation') or public.app_has_screen_access('production'))
with check (public.app_has_screen_access('separation') or public.app_has_screen_access('production'));

grant select, insert, update, delete on public.base_batch_item_separations to authenticated;
