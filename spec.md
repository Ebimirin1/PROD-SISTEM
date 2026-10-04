# Sistema de Controle de Produção — Especificação do Produto

## 1. Objetivo

Construir um sistema web para planejar a produção, calcular e rastrear a massa-base e os insumos, acompanhar embutimento/vácuo/rotulagem, registrar estoque acabado e separar pedidos para expedição. O sistema terá uma única Ordem de Produção (OP) consolidada por ciclo de produção; Empório, Lanchonete e atacados serão destinos/linhas dentro dessa OP, não OPs independentes.

## 2. Stack e princípios

- Frontend: HTML, CSS e JavaScript.
- Dados, API, autenticação e políticas: Supabase/PostgreSQL.
- Hospedagem do frontend: GitHub Pages.
- Funções administrativas que exigem segredo (por exemplo, convidar usuários) devem rodar em Supabase Edge Functions. Chaves secret/service-role nunca vão ao navegador nem ao Git.
- Interface em português, responsiva para computador, tablet e celular, com filtros em todas as telas operacionais.
- Não duplicar a mesma informação em cadastros diferentes: sabor é cadastro único; tipo de produto e destino são atributos separados.
- Não importar para o sistema fórmulas legadas quebradas ou referências `#REF!`. Importar somente valores conferidos e manter versão da formulação usada por cada OP.

## 3. Conceitos e relações principais

| Conceito | Relação e finalidade |
|---|---|
| Pedido de carne | Cabeçalho com linhas por corte, quantidade solicitada/recebida, lote e data. Pode abastecer uma ou mais OPs por meio de alocações. |
| OP | Um ciclo consolidado, ligado a um ou mais pedidos/recebimentos de carne. Seu total é a soma de todas as demandas, sem separar OP por canal. |
| Demanda da OP | Uma linha por sabor + destino/cliente, com quantidade pretendida. Destinos incluem Empório, Lanchonete e atacado. |
| Sabor | Cadastro único e reutilizável, sem criar “MANTA X” ou “GRANEL X” como sabores separados. |
| Tipo de produto | Manta, massa, linguiça, granel ou hambúrguer. O tipo final pode ser escolhido/confirmado no embutimento e registrado no lote acabado. |
| Conservação | Resfriado ou congelado, informado para o lote acabado. A validade é calculada a partir da data em que a massa fica pronta. |
| Perfil de carne | Blend padrão, blend com panceta ou blend bovino; cada perfil declara os cortes e proporções. |
| Formulação | Versão de uma receita por sabor: perfil de carne, percentual de massa-base e percentual de cada insumo. Uma OP conserva a versão usada para que alterações futuras não mudem produção antiga. |
| Porção de produção | Divisão operacional de um sabor em porções de até 30 kg para separação de insumos e processamento no canhão. |
| Lote acabado | Resultado real de uma porção, com sabor, tipo, conservação, quantidade, lote, destino e validade. Alimenta o estoque por lançamentos rastreáveis. |

## 4. Cadastros

### 4.1 Sabores e produtos

- Cadastrar previamente os sabores existentes (mais de 36) e permitir cadastro de novos sabores por pessoa autorizada.
- Impedir duplicidade ignorando diferenças de maiúsculas/minúsculas e espaços nas pontas.
- Hambúrguer fica disponível somente para os sabores **Tradicional** e **Sabores de Bragança**, após confirmar os nomes exatos no cadastro/importação.
- O sabor não depende do tipo de produto. Um mesmo sabor pode resultar em manta, massa, linguiça ou granel; hambúrguer respeita a regra acima.

### 4.2 Insumos

- Cadastro simples com nome único.
- Unidade e proporção pertencem à linha da formulação/separação, não ao cadastro básico do insumo.
- Ao cadastrar formulação, selecionar insumos existentes e informar proporção percentual sobre o peso final pretendido.

### 4.3 Perfis de carne

Perfis iniciais, derivados da regra informada:

| Perfil | Cortes e participação inicial | Aplicação informada |
|---|---|---|
| Blend padrão | Pernil 50% + copa-lombo 50% | Base Blend+ |
| Blend de panceta | Pernil 50% + panceta 50% | Panceta e Panceta com Shimeji |
| Blend bovino | Pernil 50% + carne bovina 50% | Caipira Mista |

Os perfis especiais substituem copa-lombo pelo corte indicado e preservam a proporção do perfil padrão. A proporção de 50/50 é a regra inicial observada para a base padrão; deve ser conferida contra a ficha técnica vigente antes de ativar produção comercial. O arquivo de formulação contém as receitas que deverão ser cadastradas/importadas como versões, sem estimar ingredientes ausentes.

## 5. Regras de cálculo e produção

### 5.1 Planejamento consolidado

1. Registrar o pedido de carne antes da OP, com cortes, quantidades e lotes recebidos.
2. Abrir uma OP consolidada e lançar as demandas por sabor e destino/cliente.
3. O total planejado da OP é calculado pela soma das demandas. O total real é a soma dos lotes acabados e ajustes rastreados. Os totais por canal são detalhamentos do mesmo total.
4. O planejamento calcula a necessidade de massa-base e insumos pela versão da formulação de cada sabor. Os percentuais são aplicados ao peso final pretendido, para que massa-base + insumos completem o peso formulado. O sistema deve validar que a soma dos percentuais da receita ativa seja 100%.
5. Permitir revisão das quantidades calculadas antes de gerar ordens; geração não deve ocorrer silenciosamente ao salvar a OP.

### 5.2 Bateladas de massa-base

- A OP oferece a ação **Gerar ordens de produção** após validar demandas, disponibilidade/alocação da carne e receitas ativas.
- Gerar bateladas por perfil de carne. Não misturar cortes de perfis diferentes na mesma batelada.
- Cada batelada tem no máximo **150 kg no total**, incluindo carne e temperos da massa-base, conforme a capacidade informada. Exemplo: 1.500 kg de massa-base geram 10 bateladas de 150 kg.
- A distribuição de cortes dentro de cada batelada segue a formulação do perfil. Arredondamento precisa preservar o total, com precisão de gramas e ajuste rastreável na última linha.
- Registrar lote de cada corte/insumo consumido e responsável/data da preparação.
- A data em que a massa com temperos fica pronta é a data-base da validade dos produtos acabados.

### 5.3 Separação de insumos por sabor

- Gerar uma ordem de separação por sabor, somando todas as demandas desse sabor, independentemente de destino ou tipo final (manta/massa/linguiça/granel/hambúrguer).
- Cada linha informa insumo, quantidade calculada, unidade, lote separado, quantidade realmente separada, responsável e estado.
- Dividir a separação em porções de até **30 kg de massa formulada** para atender à capacidade do canhão. Ex.: 65 kg do mesmo sabor geram porções de 30 + 30 + 5 kg. O cálculo de cada insumo respeita a proporção da formulação.
- A separação registra divergência entre quantidade calculada e separada sem alterar a fórmula. Ajuste exige justificativa e trilha de auditoria.

### 5.4 Sobra e rendimento

- O sistema não acrescenta automaticamente 10% a cada demanda. Calcula a sobra real comparando carne/massa-base disponível e consumida pelas formulações.
- A expectativa operacional informada é de cerca de 10% de sobra de massa-base; o valor real deve ser medido e exibido, sem forçar o resultado.
- A sobra de massa-base Blend+ que for destinada ao aproveitamento vira lote de **Tradicional Granel**, destino **Lanchonete**, como buffer para a semana seguinte. Registrar quantidade, lote e movimento de estoque; o lote precisa passar pelas etapas de acabamento aplicáveis e manter vínculo com a OP e a data em que a massa ficou pronta.
- Sobra de produto acabado que não tenha outro destino confirmado pode ser alocada ao Empório, com registro explícito de sabor, tipo, quantidade e lote; não fazer essa alocação sem confirmação/ação registrada pelo operador.
- Nunca converter automaticamente sobra de perfil panceta ou bovino em Tradicional Granel sem regra/fórmula aprovada para esse reaproveitamento.

## 6. Etapas e estados

### 6.1 Produção por porção

As etapas são **Embutimento → Vácuo → Rotulagem**. O acompanhamento deve ocorrer por porção/lote parcial, não somente por sabor inteiro, para que o vácuo comece quando uma parte estiver pronta, mesmo que o restante ainda esteja sendo embutido.

- Cada etapa tem estado pendente, em produção ou concluída; início e fim gravam data/hora e duração calculada.
- Embutimento registra um colaborador responsável. Vácuo permite um ou mais colaboradores. Rotulagem também registra responsável(is).
- Ao encerrar uma etapa, registrar quantidade real correspondente. A conclusão do embutimento libera aquela porção para iniciar vácuo; não exige que todo o sabor esteja embutido.
- Após concluir uma etapa, somente usuário autorizado pode corrigir a quantidade final, com motivo, autor, horário, valor anterior e novo valor no histórico.
- O status do sabor torna-se **Em produção** quando qualquer porção iniciar uma etapa. Torna-se **Concluído** quando todas as porções planejadas daquele sabor concluírem as três etapas.
- O status da OP é calculado automaticamente: **Rascunho** antes do início; **Em produção** após iniciar qualquer sabor; **Concluída** quando todos os sabores/porções da OP estiverem concluídos. Cancelamentos e reaberturas precisam de permissão e histórico.

### 6.2 Produto acabado e validade

- Registrar, por lote, sabor, tipo de produto, quantidade produzida, destino quando conhecido, condição (resfriado/congelado), data de massa pronta e lote de origem.
- Validade: resfriado = 45 dias; congelado = 6 meses de calendário. A contagem começa na data em que a massa fica pronta, não na embalagem.
- Exibir a data calculada e manter a regra explícita no histórico. Alterar condição ou data-base recalcula validade e grava auditoria.
- Essas durações são regras operacionais fornecidas pelo negócio; a liberação comercial depende da validação técnica e regulatória aplicável ao produto/processo.

## 7. Pedidos, separação e expedição

- Pedido de saída pode ser de Empório, Lanchonete ou cliente de atacado, ligado a produtos acabados por sabor, tipo e conservação.
- O colaborador informa quantidade real separada e lote(s) usados.
- Estados por linha: **Pendente → Separado para NF → Separado para expedição → Entregue**.
- Toda linha em **Separado para NF** aparece automaticamente na tela/fila de faturamento. A fila é uma visão dos mesmos dados, não uma cópia editável.
- Permitir múltiplos lotes por linha e não permitir separar quantidade acima do saldo disponível sem ajuste autorizado e auditado.

## 8. Telas e permissões

1. **Visão geral:** indicadores e filtros; não substitui telas operacionais.
2. **Planejamento:** pedidos de carne, OP, demandas consolidadas, cálculos e geração de ordens.
3. **Cadastros e formulações:** sabores, insumos, perfis, receitas e colaboradores.
4. **Separação:** ordens de insumos por sabor/porção, lotes, quantidades e responsáveis.
5. **Produção:** bateladas e acompanhamento por porção de embutimento, vácuo e rotulagem.
6. **Estoque/acompanhamento:** lotes acabados, resumo geral por sabor, destino, conservação, saldo e validade.
7. **Pedidos e expedição:** separação, NF, expedição e entrega.
8. **Usuários:** usuário principal administrador; cadastro/convite de pessoas e concessão de acesso por tela, sem granularidade de ações no MVP.

Toda tela operacional tem busca/filtros adequados (período, sabor, status, destino/cliente, tipo, conservação e lote). As permissões limitam telas e os dados/API correspondentes; esconder botão no frontend não é controle de segurança.

## 9. Autenticação e segurança

- O sistema exige login. O usuário principal terá acesso a todas as telas e poderá convidar usuários e marcar quais telas cada um acessa.
- Não incluir usuário/senha padrão no código. Criar o primeiro administrador no Supabase Auth e autorizá-lo conforme instrução de instalação.
- A criação de novos usuários pelo app usa Supabase Edge Function com segredo guardado nos Supabase Secrets; a chave secreta/service-role nunca é exposta ao navegador.
- Ativar RLS em todas as tabelas expostas. Sem sessão/autorização, nenhum dado operacional é acessível. Publicar apenas `index.html`, CSS/JS e a chave pública Supabase.
- Manter trilha de auditoria para correções de quantidade, mudanças de status, fórmulas, lotes, validade e movimentos de estoque.

## 10. Fora do MVP

- Integração direta com ERP/NF-e, balanças, impressoras ou etiquetas.
- Custeio contábil, compras/pagamentos, folha, planejamento automático de demanda e previsão de vendas.
- Fórmulas, sabores e dados fictícios. As receitas reais serão carregadas de planilhas conferidas pelo responsável.
- Alterar automaticamente uma formulação já usada por uma OP ou lote.

## 11. Critérios de aceite de negócio

- Uma OP consolida demandas de vários sabores e destinos e apresenta um único total planejado e real.
- A mesma formulação calcula a separação do sabor somando seus destinos/tipos, e respeita porções de no máximo 30 kg.
- Massa-base é dividida em bateladas de no máximo 150 kg por perfil, com soma exata de carne e temperos e rastreio de lotes.
- Uma porção pode passar por vácuo enquanto outras porções do sabor continuam em embutimento.
- Status de sabor e OP refletem automaticamente as etapas; validade parte da data de massa pronta.
- Estoque, NF e expedição usam os mesmos lotes/movimentos e não duplicam saldos.
- Usuário sem permissão de tela não acessa seus dados pela API do Supabase.
