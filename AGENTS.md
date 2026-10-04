# AGENTS.md — Diretrizes para Agentes de Desenvolvimento

## Visão Geral do Projeto
Este projeto é o Sistema de Controle de Produção (SGP Industrial) para charcutaria/indústria de carnes.
Ele utiliza HTML5, CSS (Tailwind via CDN / Material Symbols) e JavaScript ES6+ no frontend, com backend no Supabase (PostgreSQL + RLS + Auth + Edge Functions).

## Regras Importantes
1. **Segurança de Chaves e Credenciais:**
   - Use no frontend apenas a Project URL e a Publishable Key (`sb_publishable_...`).
   - Nunca expor `service_role`, chaves secretas ou senhas no Git ou no navegador.
   - Operações administrativas com privilégios elevados devem ser realizadas via Supabase Edge Function (`supabase/functions/invite-user`).

2. **Convenções de Código:**
   - Trabalhe na branch `main`.
   - Modifique e crie apenas arquivos necessários.
   - Manter compatibilidade do frontend com GitHub Pages (caminhos relativos e `index.html` na raiz do repositório).

3. **Validações de Negócio Regradas na Aplicação/Banco:**
   - Formulações: soma de massa-base + insumos deve ser estritamente 100.00%.
   - Hambúrguer é restrito apenas aos sabores "Tradicional" e "Sabores de Bragança".
   - Bateladas de massa-base: máximo de 150 kg por batelada.
   - Porções de produção: máximo de 30 kg por porção.
   - Validade: Resfriado = +45 dias a partir da data da massa pronta; Congelado = +6 meses de calendário.

4. **Tratamento de Estados Vazios:**
   - Como o banco recém-criado estará vazio, todas as telas devem exibir *empty states* claros com orientações para o usuário cadastrar os primeiros registros.
