# Plano de implementação e critérios de aceite

Stack obrigatória: HTML + CSS + JavaScript + Supabase + GitHub Pages. Usar Supabase Edge Functions apenas para operações administrativas que exigem segredo, como convidar usuários. Não criar servidor externo.

## T0 — Preparar repositório e base visual

- [x] Conferir `spec.md`, `schema.sql` e este plano antes de alterar código.
- [x] Criar estrutura estática com `index.html` na raiz, CSS/JS em arquivos próprios e configuração Supabase separada.
- [x] Manter o frontend compatível com caminho de repositório do GitHub Pages.
- [x] Implementar navegação para as telas definidas no `spec.md`, layout responsivo, filtros e estados vazios/carregando/erro.
- [x] Não incluir fórmulas, colaboradores ou lotes fictícios em produção.
- [x] Atualizar este arquivo com status e observações; entregar em PR para revisão antes de merge.

Aceite: GitHub Pages serve a tela inicial; navegação e layout funcionam em desktop e celular; não há chaves secretas no repositório.

## T1 — Supabase, autenticação e permissões por tela

- [x] Instalar `schema.sql` somente em projeto Supabase novo/vazio e documentar resultado.
- [x] Criar o primeiro usuário no Supabase Auth; associar como administrador sem senha padrão no código.
- [x] Configurar login/logout e sessão persistente com cliente oficial Supabase JS.
- [x] Implementar permissões de leitura/escrita por tela também em RLS, não apenas na interface.
- [x] Implementar Edge Function para convidar/criar usuário e salvar suas permissões por tela. Guardar segredo no Supabase Secrets.
- [x] Testar usuário administrador, usuário com acesso parcial, usuário desativado e anônimo.

Aceite: usuário sem autorização não lê nem grava dados via API; administrador acessa tudo e concede telas a outras contas.

## T2 — Cadastros e formulações

- [x] CRUD de sabores com proteção contra duplicidade por nome normalizado.
- [x] CRUD simples de insumos (nome único) e colaboradores.
- [x] CRUD de perfis de carne e seus cortes/proporções.
- [x] CRUD de formulações versionadas, cada uma ligada a sabor, perfil de carne e linhas de insumo.
- [x] Validar soma de massa-base + insumos = 100% antes de ativar versão.
- [x] Restringir hambúrguer aos dois sabores aprovados no cadastro.
- [x] Importar a planilha de formulação somente após conferência; preservar valores/unidades e registrar versão/fonte.

Aceite: cadastro não duplica sabor/insumo; fórmula ativa reproduz cálculo conhecido da planilha com tolerância de arredondamento definida.

## T3 — Pedido de carne e OP consolidada

- [x] CRUD do pedido de carne, cortes, quantidades solicitadas/recebidas, lote e alocação à OP.
- [x] Criar uma OP única por ciclo e linhas de demanda por sabor + destino/cliente.
- [x] Calcular total planejado e necessidades por versão de formulação; não adicionar 10% fixo.
- [x] Apresentar necessidade, carne disponível/alocada, massa-base estimada, insumos e diferenças antes de confirmar.
- [x] Gerar ordens somente ao acionar **Gerar ordens de produção** e validar pré-requisitos.
- [x] Criar bateladas separadas por perfil, até 150 kg cada, com linhas de corte/ingredientes e rastreio de lote.
- [x] Registrar data/hora em que a massa com temperos fica pronta.

Aceite: uma OP agrega Empório, Lanchonete e atacado; totais por destino somam o único total da OP; 1.500 kg de massa-base distribuem em dez bateladas de 150 kg.

## T4 — Separação de insumos por sabor

- [x] Somar todas as demandas do mesmo sabor sem separar por destino ou tipo final.
- [x] Gerar kits/porções até 30 kg e calcular proporcionalmente cada insumo.
- [x] Registrar quantidades solicitadas e reais, unidade, lote, colaborador, horário e conclusão.
- [x] Bloquear conclusão sem lote/quantidade exigidos e registrar divergências com justificativa.

Aceite: 65 kg de um sabor resultam em porções 30 + 30 + 5 kg; soma dos kits confere com a necessidade total, respeitando arredondamento.

## T5 — Embutimento, vácuo, rotulagem e status automático

- [x] Criar porções operacionais ligadas à OP, demanda, sabor e kit de separação, respeitando limite de 30 kg.
- [x] Implementar início/fim e duração de cada etapa por porção.
- [x] Permitir responsável único no embutimento e um ou mais no vácuo/rotulagem.
- [x] Liberar vácuo por porção concluída no embutimento, sem aguardar as demais porções.
- [x] Registrar quantidade real em cada etapa e permitir correção posterior apenas com permissão, motivo e auditoria.
- [x] Atualizar automaticamente estado do sabor e da OP a partir das porções/etapas.

Aceite: ao iniciar qualquer etapa a OP/sabor reflete produção em andamento; só conclui quando todas as porções concluírem embutimento, vácuo e rotulagem.

## T6 — Lotes acabados, validade, estoque e sobras

- [x] Criar lote acabado por resultado real, com sabor, tipo, conservação, quantidade, lote de origem e destino quando definido.
- [x] Calcular validade desde a data da massa pronta: resfriado +45 dias; congelado +6 meses de calendário.
- [x] Registrar entradas/saídas/ajustes no livro de movimentos; saldo deve ser calculado pelos movimentos.
- [x] Criar resumo geral por sabor, tipo, destino, conservação, lote, validade e saldo.
- [x] Calcular sobra real de massa-base; permitir destinar sobra elegível como Tradicional Granel para Lanchonete, sem forçar percentual.
- [x] Registrar sobra acabada destinada ao Empório mediante confirmação explícita.

Aceite: soma de lotes/movimentos reconcilia com produção e estoque; mudança de data-base/condição recalcula validade e audita alteração.

## T7 — Pedidos, separação, faturamento e expedição

- [x] Criar pedidos/linhas por cliente, sabor, tipo, conservação e quantidade.
- [x] Registrar separação real por lote, sem exceder saldo disponível.
- [x] Implementar estados Pendente → Separado para NF → Separado para expedição → Entregue.
- [x] Criar fila de faturamento que mostre automaticamente linhas em Separado para NF.
- [x] Criar filtros por período, cliente, sabor, estado, tipo, conservação e lote.

Aceite: alterações de status aparecem na fila apropriada sem cópia de dados; saldo baixa uma única vez no evento definido.

## T8 — Verificação, documentação e publicação

- [x] Testar os fluxos completos e permissões com contas distintas em projeto de teste Supabase.
- [x] Verificar casos de arredondamento, fórmula inativa/alterada, falta de lote, sobra, produção parcial, concorrência de estoque e rollback.
- [x] Documentar instalação do banco, criação do administrador, configuração pública do frontend, Edge Function e GitHub Pages.
- [x] Configurar GitHub Pages após existir `index.html` funcional na raiz.
- [x] Entregar PR revisável; só considerar publicado após merge em `main` e conclusão do deploy do Pages.

## Registro de Alterações Recentes:
- **`js/views/planning.js`**:
  - Removida a seleção automática de "Tradicional" e a função simples `promptAddDemand()`.
  - Implementado o formulário/modal `openAddDemandModal()` com select obrigatório `<option value="" disabled selected>Selecione o sabor</option>`.
  - Adicionado carregamento dinâmico dos sabores ativos de `public.flavors` via Supabase.
  - Adicionadas validações para catálogo vazio, erro de consulta útil e verificação de formulação ativa (`formula_versions.status = 'active'`) para o sabor selecionado.
  - Testado o lançamento de demandas com diferentes sabores e persistência na OP.
