// Lista única das telas do sistema: menu (app.js), permissões do administrador (auth.js)
// e cadastro de acessos (users.js) leem daqui. Tela nova = uma linha aqui
// + a chave no CHECK de user_screen_permissions (schema.sql e uma migration).
export const SCREENS = [
  { key: 'overview', title: 'Visão Geral', icon: 'grid_view', includes: '' },
  { key: 'planning', title: 'Planejamento', icon: 'calendar_today', includes: 'Ordens de Produção, Mapa Sabor × Destino' },
  { key: 'catalogs', title: 'Cadastros & Fórmulas', icon: 'menu_book', includes: 'Sabores, Insumos, Formulações, Perfis de Carne, Colaboradores, Parceiros' },
  { key: 'separation', title: 'Separação Insumos', icon: 'scale', includes: 'Kits por Porção, Bateladas de Massa-Base, Total de Insumos' },
  { key: 'production', title: 'Produção', icon: 'precision_manufacturing', includes: 'Embutimento, Vácuo' },
  { key: 'labeling', title: 'Contagem de Rótulos', icon: 'label', includes: '' },
  { key: 'inventory', title: 'Estoque & Cura', icon: 'inventory_2', includes: '' },
  { key: 'shipping', title: 'Pedidos & Expedição', icon: 'local_shipping', includes: '' },
  { key: 'billing', title: 'Faturamento', icon: 'receipt_long', includes: '' },
  { key: 'users', title: 'Usuários & Acessos', icon: 'manage_accounts', includes: '' }
];

export const SCREEN_KEYS = SCREENS.map(s => s.key);
