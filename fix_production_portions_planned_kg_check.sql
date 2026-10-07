-- Migration SQL: Remover limite de 30kg da tabela public.production_portions
-- Execute este script no SQL Editor do Supabase para permitir lotes totais por sabor maiores que 30kg.

ALTER TABLE public.production_portions DROP CONSTRAINT IF EXISTS production_portions_planned_kg_check;

ALTER TABLE public.production_portions ADD CONSTRAINT production_portions_planned_kg_check CHECK (planned_kg > 0);
