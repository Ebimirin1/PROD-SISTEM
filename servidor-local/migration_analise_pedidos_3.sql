-- Análise de Pedidos, parte 3 (08/11/2026): lista oficial de produtos (mapa de estoque do
-- Inflow: ID + Código). Só os produtos desta lista entram no histórico de vendas, na tela de
-- ligar IDs e no pedido. Rodar DEPOIS das partes 1 e 2. Pode rodar de novo sem problema.

begin;

create table if not exists public.product_catalog (
  product_code text primary key,      -- ID (mesmo do relatório de vendas)
  sku_code text,                      -- "Codigo" do Inflow
  line text,
  group_name text,
  product_name text not null,
  unit text,
  updated_at timestamptz not null default now()
);

insert into public.product_catalog (product_code, sku_code, line, group_name, product_name, unit) values
  ('1396', '26120', 'LINGUIÇA', 'ENTRADA', 'BACON PEÇA', 'KG'),
  ('1802', '7306', 'LINGUIÇA', 'DEFUMADO', 'FAMOSA LINGUICA TRAD DEFUM KG', 'KG'),
  ('154', '7153', 'LINGUIÇA', 'CLASSICA', 'HAMB QUAD GRANEL PCT 10 UN', 'KG'),
  ('153', '7152', 'LINGUIÇA', 'CLASSICA', 'HAMB QUAD PCT 4 UN', 'KG'),
  ('1267', '7222', 'LINGUIÇA', 'QUEIJO', 'HAMB QUAD SABORES PCT 4 UN', 'KG'),
  ('89', '7088', 'LINGUIÇA', 'TEMPERO', 'LING ALHO', 'KG'),
  ('92', '7091', 'LINGUIÇA', 'TEMPERO', 'LING ALHO GRANEL', 'KG'),
  ('91', '7090', 'LINGUIÇA', 'TEMPERO', 'LING ALHO MASSA', 'KG'),
  ('827', '7156', 'LINGUIÇA', 'TEMPERO', 'LING ALHO PORO', 'KG'),
  ('857', '7161', 'LINGUIÇA', 'TEMPERO', 'LING ALHO PORO GRANEL', 'KG'),
  ('856', '7160', 'LINGUIÇA', 'TEMPERO', 'LING ALHO PORO MASSA', 'KG'),
  ('1804', '7308', 'LINGUIÇA', 'DEFUMADO', 'LING APIMENTADA DEFUM KG', 'KG'),
  ('1781', '1961', 'LINGUIÇA', 'DEFUMADO', 'LING APIMENTADA DEFUM PCT', 'UN'),
  ('1314', '7225', 'LINGUIÇA', 'CRIAÇÃO', 'LING ARABE', 'KG'),
  ('1316', '7227', 'LINGUIÇA', 'CRIAÇÃO', 'LING ARABE GRANEL', 'KG'),
  ('1320', '7228', 'LINGUIÇA', 'CRIAÇÃO', 'LING ARABE MASSA', 'KG'),
  ('97', '7096', 'LINGUIÇA', 'TEMPERO', 'LING AZEIT CHILENA', 'KG'),
  ('100', '7099', 'LINGUIÇA', 'TEMPERO', 'LING AZEIT CHILENA GRANEL', 'KG'),
  ('99', '7098', 'LINGUIÇA', 'TEMPERO', 'LING AZEIT CHILENA MASSA', 'KG'),
  ('93', '7092', 'LINGUIÇA', 'TEMPERO', 'LING AZEIT VERDE', 'KG'),
  ('17', '7016', 'LINGUIÇA', 'CLASSICA', 'LING BACON', 'KG'),
  ('20', '7019', 'LINGUIÇA', 'CLASSICA', 'LING BACON GRANEL', 'KG'),
  ('19', '7018', 'LINGUIÇA', 'CLASSICA', 'LING BACON MASSA', 'KG'),
  ('45', '7044', 'LINGUIÇA', 'CLASSICA', 'LING BOV ACEB', 'KG'),
  ('49', '7048', 'LINGUIÇA', 'CLASSICA', 'LING BOV ACEB FINA', 'KG'),
  ('109', '7108', 'LINGUIÇA', 'TEMPERO', 'LING BRASILEIRINHA', 'KG'),
  ('1803', '7307', 'LINGUIÇA', 'DEFUMADO', 'LING BRASILEIRINHA DEFUM KG', 'KG'),
  ('1696', '71081', 'LINGUIÇA', 'DEFUMADO', 'LING BRASILEIRINHA DEFUM PCT', 'UN'),
  ('112', '7111', 'LINGUIÇA', 'TEMPERO', 'LING BRASILEIRINHA GRANEL', 'KG'),
  ('111', '7110', 'LINGUIÇA', 'TEMPERO', 'LING BRASILEIRINHA MASSA', 'KG'),
  ('141', '7140', 'LINGUIÇA', 'CRIAÇÃO', 'LING BUSCA VIDA', 'KG'),
  ('144', '7143', 'LINGUIÇA', 'CRIAÇÃO', 'LING BUSCA VIDA GRANEL', 'KG'),
  ('143', '7142', 'LINGUIÇA', 'CRIAÇÃO', 'LING BUSCA VIDA MASSA', 'KG'),
  ('53', '7052', 'LINGUIÇA', 'CLASSICA', 'LING CAIP MISTA', 'KG'),
  ('56', '7055', 'LINGUIÇA', 'CLASSICA', 'LING CAIP MISTA GRANEL', 'KG'),
  ('55', '7054', 'LINGUIÇA', 'CLASSICA', 'LING CAIP MISTA MASSA', 'KG'),
  ('57', '7056', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB FRACA', 'KG'),
  ('61', '7060', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB FRACA FINA', 'KG'),
  ('64', '7063', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB FRACA FINA GRANEL', 'KG'),
  ('63', '7062', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB FRACA FINA MASSA', 'KG'),
  ('60', '7059', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB FRACA GRANEL', 'KG'),
  ('59', '7058', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB FRACA MASSA', 'KG'),
  ('65', '7064', 'LINGUIÇA', 'APIMENTADA', 'LING CALAB MEDIA', 'KG'),
  ('133', '7132', 'LINGUIÇA', 'QUEIJO', 'LING CANASTRA E BIQ', 'KG'),
  ('136', '7135', 'LINGUIÇA', 'QUEIJO', 'LING CANASTRA E BIQ GRANEL', 'KG'),
  ('135', '7134', 'LINGUIÇA', 'QUEIJO', 'LING CANASTRA E BIQ MASSA', 'KG'),
  ('81', '7080', 'LINGUIÇA', 'APIMENTADA', 'LING CAROL REAPER', 'KG'),
  ('105', '7104', 'LINGUIÇA', 'TEMPERO', 'LING CEB E CEBOL', 'KG'),
  ('108', '7107', 'LINGUIÇA', 'TEMPERO', 'LING CEB E CEBOL GRANEL', 'KG'),
  ('107', '7106', 'LINGUIÇA', 'TEMPERO', 'LING CEB E CEBOL MASSA', 'KG'),
  ('1385', '7300', 'LINGUIÇA', 'CRIAÇÃO', 'LING CEBOL E CERVEJA', 'KG'),
  ('1388', '7303', 'LINGUIÇA', 'CRIAÇÃO', 'LING CEBOL E CERVEJA GRANEL', 'KG'),
  ('1387', '7302', 'LINGUIÇA', 'CRIAÇÃO', 'LING CEBOL E CERVEJA MASSA', 'KG'),
  ('940', '7169', 'LINGUIÇA', 'APIMENTADA', 'LING CHEDDAR & JALAPEÑO', 'KG'),
  ('965', '7191', 'LINGUIÇA', 'APIMENTADA', 'LING CHEDDAR & JALAPEÑO GRANEL', 'KG'),
  ('964', '7189', 'LINGUIÇA', 'APIMENTADA', 'LING CHEDDAR & JALAPEÑO MASSA', 'KG'),
  ('1287', '7223', 'LINGUIÇA', 'CRIAÇÃO', 'LING CHOC E CONHAQUE', 'KG'),
  ('1321', '7230', 'LINGUIÇA', 'CRIAÇÃO', 'LING CHOC E CONHAQUE GRANEL', 'KG'),
  ('1322', '7229', 'LINGUIÇA', 'CRIAÇÃO', 'LING CHOC E CONHAQUE MASSA', 'KG'),
  ('149', '7148', 'LINGUIÇA', 'CLASSICA', 'LING CODEGUIM', 'KG'),
  ('37', '7036', 'LINGUIÇA', 'CLASSICA', 'LING CORDEIRO', 'KG'),
  ('839', '7157', 'LINGUIÇA', 'QUEIJO', 'LING CREAM CHEESE', 'KG'),
  ('860', '7164', 'LINGUIÇA', 'QUEIJO', 'LING CREAM CHEESE GRANEL', 'KG'),
  ('859', '7163', 'LINGUIÇA', 'QUEIJO', 'LING CREAM CHEESE MASSA', 'KG'),
  ('113', '7112', 'LINGUIÇA', 'QUEIJO', 'LING CUIAB', 'KG'),
  ('125', '7124', 'LINGUIÇA', 'QUEIJO', 'LING CUIAB BOV', 'KG'),
  ('116', '7115', 'LINGUIÇA', 'QUEIJO', 'LING CUIAB GRANEL', 'KG'),
  ('115', '7114', 'LINGUIÇA', 'QUEIJO', 'LING CUIAB MASSA', 'KG'),
  ('986', '7213', 'LINGUIÇA', 'CLASSICA', 'LING DA COPA', 'KG'),
  ('21', '7020', 'LINGUIÇA', 'CLASSICA', 'LING DA ROCA', 'KG'),
  ('24', '7023', 'LINGUIÇA', 'CLASSICA', 'LING DA ROCA GRANEL', 'KG'),
  ('23', '7022', 'LINGUIÇA', 'CLASSICA', 'LING DA ROCA MASSA', 'KG'),
  ('85', '7084', 'LINGUIÇA', 'TEMPERO', 'LING ERVAS FINAS', 'KG'),
  ('88', '7087', 'LINGUIÇA', 'TEMPERO', 'LING ERVAS FINAS GRANEL', 'KG'),
  ('87', '7086', 'LINGUIÇA', 'TEMPERO', 'LING ERVAS FINAS MASSA', 'KG'),
  ('1392', '54615', 'LINGUIÇA', 'CLASSICA', 'LING FATIADA CORTES', 'KG'),
  ('853', '7158', 'LINGUIÇA', 'CRIAÇÃO', 'LING FESTIVA', 'KG'),
  ('863', '7167', 'LINGUIÇA', 'CRIAÇÃO', 'LING FESTIVA GRANEL', 'KG'),
  ('862', '7166', 'LINGUIÇA', 'CRIAÇÃO', 'LING FESTIVA MASSA', 'KG'),
  ('954', '7179', 'LINGUIÇA', 'CRIAÇÃO', 'LING FRUTAS E BACON', 'KG'),
  ('992', '7219', 'LINGUIÇA', 'CRIAÇÃO', 'LING FRUTAS E BACON GRANEL', 'KG'),
  ('991', '7218', 'LINGUIÇA', 'CRIAÇÃO', 'LING FRUTAS E BACON MASSA', 'KG'),
  ('121', '7120', 'LINGUIÇA', 'QUEIJO', 'LING GORG E MEL', 'KG'),
  ('1338', '7240', 'LINGUIÇA', 'QUEIJO', 'LING GORG E MEL 1KG', 'KG'),
  ('124', '7123', 'LINGUIÇA', 'QUEIJO', 'LING GORG E MEL GRANEL', 'KG'),
  ('123', '7122', 'LINGUIÇA', 'QUEIJO', 'LING GORG E MEL MASSA', 'KG'),
  ('77', '7076', 'LINGUIÇA', 'APIMENTADA', 'LING LIMAO E PIM', 'KG'),
  ('80', '7079', 'LINGUIÇA', 'APIMENTADA', 'LING LIMAO E PIM GRANEL', 'KG'),
  ('79', '7078', 'LINGUIÇA', 'APIMENTADA', 'LING LIMAO E PIM MASSA', 'KG'),
  ('73', '7072', 'LINGUIÇA', 'APIMENTADA', 'LING MALAG MEX', 'KG'),
  ('76', '7075', 'LINGUIÇA', 'APIMENTADA', 'LING MALAG MEX GRANEL', 'KG'),
  ('75', '7074', 'LINGUIÇA', 'APIMENTADA', 'LING MALAG MEX MASSA', 'KG'),
  ('129', '7128', 'LINGUIÇA', 'QUEIJO', 'LING NAPOLITANA', 'KG'),
  ('132', '7131', 'LINGUIÇA', 'QUEIJO', 'LING NAPOLITANA GRANEL', 'KG'),
  ('131', '7130', 'LINGUIÇA', 'QUEIJO', 'LING NAPOLITANA MASSA', 'KG'),
  ('25', '7024', 'LINGUIÇA', 'CLASSICA', 'LING PANCETA', 'KG'),
  ('29', '7028', 'LINGUIÇA', 'CLASSICA', 'LING PANCETA E SHIM', 'KG'),
  ('32', '7031', 'LINGUIÇA', 'CLASSICA', 'LING PANCETA E SHIM GRANEL', 'KG'),
  ('31', '7030', 'LINGUIÇA', 'CLASSICA', 'LING PANCETA E SHIM MASSA', 'KG'),
  ('28', '7027', 'LINGUIÇA', 'CLASSICA', 'LING PANCETA GRANEL', 'KG'),
  ('27', '7026', 'LINGUIÇA', 'CLASSICA', 'LING PANCETA MASSA', 'KG'),
  ('69', '7068', 'LINGUIÇA', 'APIMENTADA', 'LING PIM BIQ', 'KG'),
  ('72', '7071', 'LINGUIÇA', 'APIMENTADA', 'LING PIM BIQ GRANEL', 'KG'),
  ('71', '7070', 'LINGUIÇA', 'APIMENTADA', 'LING PIM BIQ MASSA', 'KG'),
  ('606', '7154', 'LINGUIÇA', 'PRODUTO', 'LING PRONTA CONG', 'KG'),
  ('152', '7151', 'LINGUIÇA', 'PRODUTO', 'LING PRONTA CONG MOÍDA', 'KG'),
  ('607', '7155', 'LINGUIÇA', 'PRODUTO', 'LING PRONTA CONG MOÍDA INT', 'KG'),
  ('117', '7116', 'LINGUIÇA', 'QUEIJO', 'LING PROV', 'KG'),
  ('120', '7119', 'LINGUIÇA', 'QUEIJO', 'LING PROV GRANEL', 'KG'),
  ('119', '7118', 'LINGUIÇA', 'QUEIJO', 'LING PROV MASSA', 'KG'),
  ('101', '7100', 'LINGUIÇA', 'TEMPERO', 'LING RUC E TOM', 'KG'),
  ('104', '7103', 'LINGUIÇA', 'TEMPERO', 'LING RUC E TOM GRANEL', 'KG'),
  ('103', '7102', 'LINGUIÇA', 'TEMPERO', 'LING RUC E TOM MASSA', 'KG'),
  ('145', '7144', 'LINGUIÇA', 'QUEIJO', 'LING SABORES BRAG', 'KG'),
  ('148', '7147', 'LINGUIÇA', 'QUEIJO', 'LING SABORES BRAG GRANEL', 'KG'),
  ('147', '7146', 'LINGUIÇA', 'QUEIJO', 'LING SABORES BRAG MASSA', 'KG'),
  ('1391', '7999', 'LINGUIÇA', 'CLASSICA', 'LING TESTE', 'UN'),
  ('33', '7032', 'LINGUIÇA', 'CLASSICA', 'LING TOSCANA', 'KG'),
  ('36', '7035', 'LINGUIÇA', 'CLASSICA', 'LING TOSCANA GRANEL', 'KG'),
  ('35', '7034', 'LINGUIÇA', 'CLASSICA', 'LING TOSCANA MASSA', 'KG'),
  ('1', '7000', 'LINGUIÇA', 'CLASSICA', 'LING TRAD CORTES', 'KG'),
  ('876', '7168', 'LINGUIÇA', 'CLASSICA', 'LING TRAD CORTES 1KG', 'KG'),
  ('4', '7003', 'LINGUIÇA', 'CLASSICA', 'LING TRAD CORTES GRANEL', 'KG'),
  ('3', '7002', 'LINGUIÇA', 'CLASSICA', 'LING TRAD CORTES MASSA', 'KG'),
  ('13', '7012', 'LINGUIÇA', 'CLASSICA', 'LING TRAD CORTES NOBRES FINA', 'KG'),
  ('16', '7015', 'LINGUIÇA', 'CLASSICA', 'LING TRAD CORTES NOBRES FINA GRANEL', 'KG'),
  ('5', '7004', 'LINGUIÇA', 'CLASSICA', 'LING TRAD PICADA', 'KG'),
  ('8', '7007', 'LINGUIÇA', 'CLASSICA', 'LING TRAD PICADA GRANEL', 'KG'),
  ('7', '7006', 'LINGUIÇA', 'CLASSICA', 'LING TRAD PICADA MASSA', 'KG'),
  ('1395', '26119', 'LINGUIÇA', 'CLASSICA', 'LINGUIÇA CRISPY', 'UN'),
  ('1780', '1960', 'LINGUIÇA', 'DEFUMADO', 'LINGUICA TRADICIONAL DEFUM PCT', 'UN'),
  ('966', '7192', 'LINGUIÇA', 'TEMPERO', 'MANTA ALHO', 'KG'),
  ('972', '7198', 'LINGUIÇA', 'TEMPERO', 'MANTA ALHO PORO', 'KG'),
  ('1315', '7226', 'LINGUIÇA', 'CRIAÇÃO', 'MANTA ARABE', 'KG'),
  ('967', '7193', 'LINGUIÇA', 'TEMPERO', 'MANTA AZEIT CHILENA', 'KG'),
  ('945', '7170', 'LINGUIÇA', 'CLASSICA', 'MANTA BACON', 'KG'),
  ('983', '7210', 'LINGUIÇA', 'CLASSICA', 'MANTA BOV ACEB', 'KG'),
  ('984', '7211', 'LINGUIÇA', 'CLASSICA', 'MANTA BOV CERV', 'KG'),
  ('968', '7194', 'LINGUIÇA', 'TEMPERO', 'MANTA BRASILEIRINHA', 'KG'),
  ('947', '7172', 'LINGUIÇA', 'CRIAÇÃO', 'MANTA BUSCA VIDA', 'KG'),
  ('985', '7212', 'LINGUIÇA', 'CLASSICA', 'MANTA CAIP MISTA', 'KG'),
  ('957', '7182', 'LINGUIÇA', 'APIMENTADA', 'MANTA CALAB FRACA', 'KG'),
  ('989', '7216', 'LINGUIÇA', 'APIMENTADA', 'MANTA CALAB FRACA FINA', 'KG'),
  ('958', '7183', 'LINGUIÇA', 'APIMENTADA', 'MANTA CALAB MEDIA', 'KG'),
  ('973', '7199', 'LINGUIÇA', 'QUEIJO', 'MANTA CANASTRA E BIQ', 'KG'),
  ('961', '7186', 'LINGUIÇA', 'APIMENTADA', 'MANTA CAROL REAPER', 'KG'),
  ('1386', '7301', 'LINGUIÇA', 'CRIAÇÃO', 'MANTA CEBOL E CERVEJA', 'KG'),
  ('969', '7195', 'LINGUIÇA', 'TEMPERO', 'MANTA CEBOLA E CEB', 'KG'),
  ('962', '7187', 'LINGUIÇA', 'APIMENTADA', 'MANTA CHEDDAR & JALAPEÑO', 'KG'),
  ('1302', '7224', 'LINGUIÇA', 'CRIAÇÃO', 'MANTA CHOC E CONHAQUE', 'KG'),
  ('981', '7208', 'LINGUIÇA', 'QUEIJO', 'MANTA CREAM CHEESE', 'KG'),
  ('974', '7200', 'LINGUIÇA', 'QUEIJO', 'MANTA CUIAB', 'KG'),
  ('975', '7201', 'LINGUIÇA', 'QUEIJO', 'MANTA CUIAB BOV', 'KG'),
  ('946', '7171', 'LINGUIÇA', 'CLASSICA', 'MANTA DA ROCA', 'KG'),
  ('970', '7196', 'LINGUIÇA', 'TEMPERO', 'MANTA ERVAS FINAS', 'KG'),
  ('988', '7215', 'LINGUIÇA', 'CRIAÇÃO', 'MANTA FESTIVA', 'KG'),
  ('955', '7180', 'LINGUIÇA', 'CRIAÇÃO', 'MANTA FRUTAS E BACON', 'KG'),
  ('976', '7203', 'LINGUIÇA', 'QUEIJO', 'MANTA GORG E MEL', 'KG'),
  ('960', '7185', 'LINGUIÇA', 'APIMENTADA', 'MANTA LIMAO E PIM', 'KG'),
  ('956', '7181', 'LINGUIÇA', 'APIMENTADA', 'MANTA MALAG MEX', 'KG'),
  ('978', '7205', 'LINGUIÇA', 'QUEIJO', 'MANTA NAPOLITANA', 'KG'),
  ('948', '7173', 'LINGUIÇA', 'CLASSICA', 'MANTA PANCETA', 'KG'),
  ('949', '7174', 'LINGUIÇA', 'CLASSICA', 'MANTA PANCETA E SHIM', 'KG'),
  ('959', '7184', 'LINGUIÇA', 'APIMENTADA', 'MANTA PIM BIQ', 'KG'),
  ('979', '7206', 'LINGUIÇA', 'QUEIJO', 'MANTA PROVOLONE', 'KG'),
  ('971', '7197', 'LINGUIÇA', 'TEMPERO', 'MANTA RUC E TOM', 'KG'),
  ('980', '7207', 'LINGUIÇA', 'QUEIJO', 'MANTA SABORES BRAG', 'KG'),
  ('950', '7175', 'LINGUIÇA', 'CLASSICA', 'MANTA TOSCANA', 'KG'),
  ('951', '7176', 'LINGUIÇA', 'CLASSICA', 'MANTA TRAD CORTES', 'KG'),
  ('953', '7178', 'LINGUIÇA', 'CLASSICA', 'MANTA TRAD PICADA', 'KG'),
  ('1933', '7500', 'LINGUIÇA', 'CLASSICA', 'PACK DE LINGUICAS', 'KG'),
  ('680', '33002', 'LINGUIÇA', 'CONTROLE INTERNO', 'PERNIL ATACADO INTERNO', 'KG'),
  ('1627', '3300', 'LINGUIÇA', 'FÁBRICA', 'PERNIL RESF SUINO DESOSSADO', 'KG'),
  ('1394', '26118', 'LINGUIÇA', 'CLASSICA', 'PONTA DE LINGUIÇA', 'UN'),
  ('150', '7149', 'LINGUIÇA', 'PRODUTO', 'RECHEIO PARA RECEITAS', 'KG'),
  ('151', '7150', 'LINGUIÇA', 'PRODUTO', 'RECHEIO PRÉ-ASSADO', 'KG'),
  ('1121', '1792', 'LINGUIÇA', 'EMBALAGEM', 'SACOLA ECO FAMOSA', 'UN'),
  ('1628', '3303', 'LINGUIÇA', 'FÁBRICA', 'SOBREPALETA RESFR DESOSSADA', 'UN')

on conflict (product_code) do update set
  sku_code = excluded.sku_code, line = excluded.line, group_name = excluded.group_name,
  product_name = excluded.product_name, unit = excluded.unit, updated_at = now();

-- Vínculos que faltavam (linguiças da lista que não estavam no pré-preenchimento).
-- Só grava quando exatamente UM sabor ativo combina e o ID ainda não tem vínculo.
insert into public.sales_product_map (product_code, flavor_id, product_type)
select s.code,
       (select f.id from public.flavors f
         where f.active and lower(f.name) ~ s.re and (s.nre is null or lower(f.name) !~ s.nre)),
       'linguica'
from (values
  ('93',  'verde', null),
  ('45',  'bov.*ace|acebol', 'fina'),
  ('49',  'bov.*fina', null),
  ('65',  'calab.*m[eé]dia', null),
  ('149', 'codeguim|cotechin', null),
  ('37',  'cordeiro', null),
  ('125', 'cuiab.*bov', null),
  ('986', 'copa', null)
) as s(code, re, nre)
where (select count(*) from public.flavors f
        where f.active and lower(f.name) ~ s.re and (s.nre is null or lower(f.name) !~ s.nre)) = 1
on conflict (product_code) do nothing;

-- Pedido por sabor: só IDs da lista oficial
create or replace function public.order_analysis_flavors(
  p_ref date default current_date,
  p_weeks int default 4,
  p_sale_type text default null
)
returns table (
  flavor_id uuid, flavor_name text, codes text[], product_names text[], weekly_qty numeric[],
  total_qty numeric, weekly_avg numeric, last_sale date, stock_qty numeric, stock_source text,
  stock_updated_at timestamptz, has_recipe boolean
)
language sql stable
set search_path = public
as $$
  with links as (
    select m.flavor_id, m.product_code, c.product_name
    from public.sales_product_map m
    join public.product_catalog c on c.product_code = m.product_code
    where m.product_type = 'linguica' and not m.ignore and m.flavor_id is not null
  ),
  win as (
    select l.flavor_id, ((p_ref - s.sale_date) / 7) + 1 as wk, s.qty
    from public.sales_records s
    join links l on l.product_code = s.product_code
    where s.sale_date > p_ref - 7 * p_weeks and s.sale_date <= p_ref
      and (p_sale_type is null or s.sale_type = p_sale_type)
  ),
  stk as (
    select l.flavor_id, sum(o.stock_qty) as qty, max(o.updated_at) as upd
    from links l join public.order_stock o on o.product_code = l.product_code
    group by l.flavor_id
  )
  select f.id,
         f.name,
         coalesce((select array_agg(l.product_code order by l.product_code) from links l where l.flavor_id = f.id), '{}'),
         coalesce((select array_agg(l.product_name order by l.product_code) from links l where l.flavor_id = f.id), '{}'),
         array(select coalesce(sum(w.qty), 0) from generate_series(1, p_weeks) g(n)
               left join win w on w.flavor_id = f.id and w.wk = g.n
               group by g.n order by g.n),
         coalesce((select sum(w.qty) from win w where w.flavor_id = f.id), 0),
         round(coalesce((select sum(w.qty) from win w where w.flavor_id = f.id), 0) / p_weeks, 3),
         (select max(s.sale_date) from public.sales_records s join links l on l.product_code = s.product_code
           where l.flavor_id = f.id and s.sale_date <= p_ref),
         case when man.updated_at is not null and (st.upd is null or man.updated_at > st.upd) then man.stock_qty
              else coalesce(st.qty, 0) end,
         case when man.updated_at is not null and (st.upd is null or man.updated_at > st.upd) then 'manual'
              when st.upd is not null then 'inflow' end,
         greatest(man.updated_at, st.upd),
         exists (select 1 from public.formula_versions v where v.flavor_id = f.id and v.status = 'active')
  from public.flavors f
  left join stk st on st.flavor_id = f.id
  left join public.order_stock man on man.product_code = 'sabor:' || f.id
  where f.active
  order by 7 desc, f.name;
$$;

-- Produtos para ligar aos sabores: a lista oficial inteira
create or replace function public.sales_products()
returns table (product_code text, product_name text, qty_52w numeric, flavor_id uuid, product_type text, ignore boolean)
language sql stable
set search_path = public
as $$
  select c.product_code,
         c.product_name,
         coalesce((select sum(s.qty) from public.sales_records s where s.product_code = c.product_code
                    and s.sale_date > (select max(sale_date) from public.sales_records) - 364), 0),
         m.flavor_id, m.product_type, coalesce(m.ignore, false)
  from public.product_catalog c
  left join public.sales_product_map m on m.product_code = c.product_code
  order by c.product_name;
$$;

-- Histórico de vendas: só produtos da lista oficial (nome da lista)
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
         max(c.product_name),
         case p_grain when 'day' then s.sale_date
                      when 'month' then date_trunc('month', s.sale_date)::date
                      else date_trunc('week', s.sale_date)::date end as period,
         sum(s.qty), sum(s.total), count(distinct s.sale_number)
  from public.sales_records s
  join public.product_catalog c on c.product_code = s.product_code
  where s.sale_date between p_from and p_to
    and (p_sale_type is null or s.sale_type = p_sale_type)
  group by 1, 3
  order by 1, 3;
$$;

alter table public.product_catalog enable row level security;
drop policy if exists product_catalog_by_screen on public.product_catalog;
create policy product_catalog_by_screen on public.product_catalog for all to authenticated
using (public.app_has_screen_access('orderAnalysis')) with check (public.app_has_screen_access('orderAnalysis'));
grant select, insert, update, delete on public.product_catalog to authenticated;
revoke execute on function public.order_analysis_flavors(date, int, text), public.sales_products(), public.sales_history(date, date, text, text) from public, anon;
grant execute on function public.order_analysis_flavors(date, int, text), public.sales_products(), public.sales_history(date, date, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
