# Sistema de Controle de Produção (SGP Industrial)

Aplicação web para planejamento de produção, cálculo de insumos, acompanhamento de embutimento/vácuo/rotulagem, gestão de estoque acabado e expedição de pedidos.

## Stack Utilizada
- **Frontend:** HTML5, CSS (Tailwind CDN, Material Symbols), JavaScript ES6+ (Módulos nativos).
- **Backend & Banco de Dados:** Supabase (PostgreSQL, Supabase Auth, RLS, Edge Functions).
- **Hospedagem:** GitHub Pages.

## Configuração e Autorização do Administrador Principal

### 1. Estrutura e Banco de Dados (Supabase)
1. Execute o script `schema.sql` no SQL Editor do Supabase para criar a estrutura de tabelas, funções, gatilhos, visões e políticas de RLS.
2. Crie o usuário administrador no painel **Authentication > Users** do Supabase.
3. Para autorizar todas as permissões para o ID `e904e5d8-ef54-408a-92a7-8c54994dbcef`, execute o script `bootstrap_admin.sql` no SQL Editor do Supabase:
   ```sql
   -- Associa o UID como Administrador Principal e concede acesso a todas as telas
   -- Arquivo: bootstrap_admin.sql
   ```

### 2. Cadastro de Usuários (login e senha, sem e-mail)
Rode `migration_internal_users.sql` no SQL Editor do Supabase. Ele cria as funções `admin_create_user` e
`admin_set_user_password`, que só funcionam para administrador ativo. Em **Usuários & Acessos** o administrador
cadastra usuário (login) e senha; a pessoa entra digitando só o login. Por dentro, cada login vira o e-mail
técnico `<login>@sgp-industrial.local` no Supabase Auth, e nenhum e-mail é enviado. Não há Edge Function.

### 3. Execução Local & GitHub Pages
O frontend é composto inteiramente por arquivos estáticos (`index.html`, CSS, JS) e pode ser servido localmente via qualquer servidor estático ou publicado via GitHub Pages:
- Vá para **Settings > Pages** no repositório GitHub.
- Selecione a branch `main` e a pasta `/ (root)`.
