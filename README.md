# Sistema de Controle de Produção (SGP Industrial)

Aplicação web para planejamento de produção, cálculo de insumos, acompanhamento de embutimento/vácuo/rotulagem, gestão de estoque acabado e expedição de pedidos.

## Stack Utilizada
- **Frontend:** HTML5, CSS (Tailwind CDN, Material Symbols), JavaScript ES6+ (Módulos nativos).
- **Backend & Banco de Dados:** Supabase (PostgreSQL, Supabase Auth, RLS, Edge Functions).
- **Hospedagem:** GitHub Pages.

## Configuração e Instalação

### 1. Banco de Dados (Supabase)
1. Execute o script `schema.sql` no SQL Editor do Supabase para criar a estrutura de tabelas, funções, gatilhos, visões e políticas de RLS.
2. Após criar o usuário administrador em **Authentication > Users**, execute o script `bootstrap_admin.sql` para associá-lo como administrador no sistema.

### 2. Edge Function para Convite de Usuários
A função de convite/criação de novos usuários roda em Supabase Edge Functions usando a chave `service_role` (armazenada em Supabase Secrets).
Para publicar a Edge Function:
```bash
supabase functions deploy invite-user --project-ref ywnsowvomewoyedqozuh
```

### 3. Execução Local & GitHub Pages
O frontend é composto inteiramente por arquivos estáticos (`index.html`, CSS, JS) e pode ser servido localmente via qualquer servidor estático ou publicado via GitHub Pages:
- Vá para **Settings > Pages** no repositório GitHub.
- Selecione a branch `main` e a pasta `/ (root)`.
