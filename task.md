# Plano de implementação e critérios de aceite

Stack obrigatória: HTML + CSS + JavaScript + Supabase + GitHub Pages. Usar Supabase Edge Functions apenas para operações administrativas que exigem segredo, como convidar usuários. Não criar servidor externo.

## T0 — Preparar repositório e base visual

- [ ] Conferir `spec.md`, `schema.sql` e este plano antes de alterar código.
- [ ] Criar estrutura estática com `index.html` na raiz, CSS/JS em arquivos próprios e configuração Supabase separada.
- [ ] Manter o frontend compatível com caminho de repositório do GitHub Pages.
- [ ] Implementar navegação para as telas definidas no `spec.md`, layout responsivo, filtros e estados vazios/carregando/erro.
- [ ] Não incluir fórmulas, colaboradores ou lotes fictícios em produção.
- [ ] Atualizar este arquivo com status e observações; entregar em PR para revisão antes de merge.

Aceite: GitHub Pages serve a tela inicial; navegação e layout funcionam em desktop e celular; não há chaves secretas no repositório.

## T1 — Supabase, autenticação e permissões por tela

- [ ] Instalar `schema.sql` somente em projeto Supabase novo/vazio e documentar resultado.
- [ ] Criar o primeiro usuário no Supabase Auth; associar como administrador sem senha padrão no código.
- [ ] Configurar login/logout e sessão persistente com cliente oficial Supabase JS.
- [ ] Implementar permissões de leitura/escrita por tela também em RLS, não apenas na interface.
- [ ] Implementar Edge Function para convidar/criar usuário e salvar suas permissões por tela. Guardar segredo no Supabase Secrets.
- [ ] Testar usuário administrador, usuário com acesso parcial, usuário desativado e anônimo.

Aceite: usuário sem autorização não lê nem grava dados via API; administrador acessa tudo e concede telas a outras contas.

## T2 — Cadastros e formulações

- [ ] CRUD de sabores com proteção contra duplicidade por nome normalizado.
- [ ] CRUD simples de insumos (nome único) e colaboradores.
- [ ] CRUD de perfis de carne e seus cortes/proporções.
- [ ] CRUD de formulações versionadas, cada uma ligada a sabor, perfil de carne e linhas de insumo.
- [ ] Validar soma de massa-base + insumos = 100% antes de ativar versão.
- [ ] Restringir hambúrguer aos dois sabores aprovados no cadastro.
- [ ] Importar a planilha de formulação somente após conferência; preservar valores/unidades e registrar versão/fonte.

Aceite: cadastro não duplica sabor/insumo; fórmula ativa reproduz cálculo conhecido da planilha com tolerância de arredondamento definida.

## T3 — Pedido de carne e OP consolidada

- [ ] CRUD do pedido de carne, cortes, quantidades solicitadas/recebidas, lote e alocação à OP.
- [ ] Criar uma OP única por ciclo e linhas de demanda por sabor + destino/cliente.
- [ ] Calcular total planejado e necessidades por versão de formulação; não adicionar 10% fixo.
- [ ] Apresentar necessidade, carne disponível/alocada, massa-base estimada, insumos e diferenças antes de confirmar.
- [ ] Gerar ordens somente ao acionar **Gerar ordens de produção** e validar pré-requisitos.
- [ ] Criar bateladas separadas por perfil, até 150 kg cada, com linhas de corte/ingredientes e rastreio de lote.
- [ ] Registrar data/hora em que a massa com temperos fica pronta.

Aceite: uma OP agrega Empório, Lanchonete e atacado; totais por destino somam o único total da OP; 1.500 kg de massa-base distribuem em dez bateladas de 150 kg.

## T4 — Separação de insumos por sabor

- [ ] Somar todas as demandas do mesmo sabor sem separar por destino ou tipo final.
- [ ] Gerar kits/porções até 30 kg e calcular proporcionalmente cada insumo.
- [ ] Registrar quantidades solicitadas e reais, unidade, lote, colaborador, horário e conclusão.
- [ ] Bloquear conclusão sem lote/quantidade exigidos e registrar divergências com justificativa.

Aceite: 65 kg de um sabor resultam em porções 30 + 30 + 5 kg; soma dos kits confere com a necessidade total, respeitando arredondamento.

## T5 — Embutimento, vácuo, rotulagem e status automático

- [ ] Criar porções operacionais ligadas à OP, demanda, sabor e kit de separação, respeitando limite de 30 kg.
- [ ] Implementar início/fim e duração de cada etapa por porção.
- [ ] Permitir responsável único no embutimento e um ou mais no vácuo/rotulagem.
- [ ] Liberar vácuo por porção concluída no embutimento, sem aguardar as demais porções.
- [ ] Registrar quantidade real em cada etapa e permitir correção posterior apenas com permissão, motivo e auditoria.
- [ ] Atualizar automaticamente estado do sabor e da OP a partir das porções/etapas.

Aceite: ao iniciar qualquer etapa a OP/sabor reflete produção em andamento; só conclui quando todas as porções concluírem embutimento, vácuo e rotulagem.

## T6 — Lotes acabados, validade, estoque e sobras

- [ ] Criar lote acabado por resultado real, com sabor, tipo, conservação, quantidade, lote de origem e destino quando definido.
- [ ] Calcular validade desde a data da massa pronta: resfriado +45 dias; congelado +6 meses de calendário.
- [ ] Registrar entradas/saídas/ajustes no livro de movimentos; saldo deve ser calculado pelos movimentos.
- [ ] Criar resumo geral por sabor, tipo, destino, conservação, lote, validade e saldo.
- [ ] Calcular sobra real de massa-base; permitir destinar sobra elegível como Tradicional Granel para Lanchonete, sem forçar percentual.
- [ ] Registrar sobra acabada destinada ao Empório mediante confirmação explícita.

Aceite: soma de lotes/movimentos reconcilia com produção e estoque; mudança de data-base/condição recalcula validade e audita alteração.

## T7 — Pedidos, separação, faturamento e expedição

- [ ] Criar pedidos/linhas por cliente, sabor, tipo, conservação e quantidade.
- [ ] Registrar separação real por lote, sem exceder saldo disponível.
- [ ] Implementar estados Pendente → Separado para NF → Separado para expedição → Entregue.
- [ ] Criar fila de faturamento que mostre automaticamente linhas em Separado para NF.
- [ ] Criar filtros por período, cliente, sabor, estado, tipo, conservação e lote.

Aceite: alterações de status aparecem na fila apropriada sem cópia de dados; saldo baixa uma única vez no evento definido.

## T8 — Verificação, documentação e publicação

- [ ] Testar os fluxos completos e permissões com contas distintas em projeto de teste Supabase.
- [ ] Verificar casos de arredondamento, fórmula inativa/alterada, falta de lote, sobra, produção parcial, concorrência de estoque e rollback.
- [ ] Documentar instalação do banco, criação do administrador, configuração pública do frontend, Edge Function e GitHub Pages.
- [ ] Configurar GitHub Pages após existir `index.html` funcional na raiz.
- [ ] Entregar PR revisável; só considerar publicado após merge em `main` e conclusão do deploy do Pages.

## Regras de trabalho para o agente

- Ler `spec.md`, `schema.sql`, `task.md` e as instruções permanentes do repositório, se existirem. Se não houver `AGENTS.md`, criar um arquivo curto com as regras deste escopo antes de iniciar as próximas etapas.
- Implementar uma etapa por vez, atualizar checkboxes com evidências e não marcar como concluído apenas por inspeção do código.
- Não executar SQL em banco remoto, publicar, fazer merge ou expor credenciais sem autorização explícita.
- Não sobrescrever fórmulas/estoque existentes; este projeto começa em um Supabase novo.
- Fazer alterações pequenas, explicar arquivos afetados e testes, e preparar PR para revisão.
