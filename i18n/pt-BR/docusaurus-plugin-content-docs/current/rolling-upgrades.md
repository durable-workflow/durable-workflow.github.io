---
sidebar_position: 15
title: Atualizações graduais
description: Faça uma atualização gradual por conta própria nos nós de API, workers e agendador do Durable Workflow Server sem interromper o tráfego ativo.
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - atualização gradual
  - segurança de atualização gradual
  - drenagem de workers
  - proteção de esquema
  - contrato de prontidão
  - workflow de reversão
---

# Atualizações graduais {#rolling-upgrades}

## Replay antes de trocar builds {#replay-before-changing-builds}

Antes de promover um candidato, reproduza históricos representativos abertos e encerrados recentemente usando seu código exato. Antes de reverter, reproduza os históricos escritos pelo build novo com o artefato antigo. Siga a [verificação de replay](./testing.md#replay-before-deployment); uma coorte de roteamento compatível ou uma verificação de integridade aprovada não comprova, por si só, compatibilidade de replay.

Faça uma atualização gradual quando quiser substituir nós de API, workers ou o
agendador sem tirar a implantação do ar. Este contrato abrange a topologia de
cluster pequeno do guia de [implantações sob sua administração](/docs/deployment):
dois ou três nós de API atrás de um balanceador de carga, MySQL ou PostgreSQL
externo compartilhado, Redis compartilhado, workers escalados de forma
independente e exatamente um agendador ou executor de manutenção.

Uma atualização gradual é suportada quando todas as garantias desta página são
atendidas. Fora desses limites, use o fluxo com parada total documentado no
guia de implantação.

O vocabulário de papéis e o manifesto de topologias por trás deste contrato estão
documentados em [Topologia de papéis do Server](/docs/polyglot/server-role-topology).
Este guia se concentra em como as classes de processo atuais de
`standalone_server` são substituídas gradualmente no lugar.

## O que significa atualização gradual aqui {#what-rolling-upgrade-means-here}

Uma **atualização gradual** substitui os processos um por vez, drenando cada um
antes de pará-lo, enquanto o restante da frota continua atendendo ao tráfego.
O resultado é ausência de indisponibilidade para a implantação como um todo e
uma janela limitada de sobreposição na qual processos antigos e novos coexistem.

O contrato distingue quatro classes de processo na topologia atual
`standalone_server`, cada uma com sua própria estratégia de implantação:

- **Nós HTTP/API**: processos de servidor sem estado que atendem ao tráfego HTTP
  e atualmente hospedam os papéis `api_ingress`, `control_plane`, `matching`
  e `history_projection`.
- **Workers**: processos de SDK que consultam o plano de workers e executam
  tarefas de atividade e workflow como `execution_plane`.
- **Agendador / executor de manutenção**: o processo único que dispara
  agendamentos e conduz limites de tempo de atividades e retenção de histórico
  no papel `scheduler`.
- **Bootstrap**: o processo de execução única que roda migrações do banco de
  dados e o preenchimento inicial do namespace padrão.

Nós de API e workers são atualizados de forma independente. O agendador é um
processo único. Você para o antigo antes de iniciar o novo, mas o restante da
implantação continua atendendo ao tráfego durante esse intervalo.

## Regras para diferenças compatíveis de versão {#compatible-version-skew-rules}

A janela de sobreposição da atualização gradual é o período em que mais de uma
imagem de servidor, versão do pacote Workflow ou versão de SDK de worker está
ativa. Essa janela deve atender a todas as regras desta seção.

### Imagem do Server e pacote Workflow {#server-image-and-workflow-package}

- **Somente versões adjacentes.** Durante uma atualização gradual, cada nó de
  API e outro processo do Server deve executar uma imagem de servidor cuja
  versão do pacote Workflow tenha a mesma versão major do pacote anterior do
  cluster e esteja a no máximo uma versão minor de todos os outros processos
  ativos. Pular uma versão major exige uma atualização com parada total.
- **Migrações aditivas para a frente.** Toda alteração de esquema do Durable
  Workflow v2 é aditiva dentro de uma versão major. Novos nós não devem exigir
  uma coluna ou tabela cuja migração ainda não tenha sido aplicada. Nós antigos
  não devem quebrar quando houver uma coluna nova que eles não leem. As
  [regras de ordem das migrações](#schemabootstrap-ordering) abaixo garantem isso.
- **Versões adjacentes do plano de controle e do protocolo de workers.** Cada nó
  publica os intervalos suportados de `control_plane.version` e
  `worker_protocol.version` em `GET /api/cluster/info`. Durante uma atualização
  gradual, o intervalo suportado da nova imagem deve se sobrepor ao intervalo
  de todos os nós antigos ativos. Descubra o intervalo antes da implantação
  e aborte se não houver sobreposição.

### SDK de worker e identidade do build {#worker-sdk-and-build-identity}

- **Workers identificam cada build.** Todo worker que possa participar de uma
  atualização gradual deve se registrar por `POST /api/worker/register` com um
  `build_id` estável. O grupo sem versão (`build_id: null`) é o padrão anterior
  à implantação. O [guia de implantação por build ID de worker](/docs/polyglot/worker-build-id-rollout)
  explica a primeira transição.
- **Impressões digitais da definição do workflow permanecem fixas.** Imagens do
  Server com `DW_V2_PIN_TO_RECORDED_FINGERPRINT=true` (o padrão) mantêm execuções
  em andamento fixadas à impressão digital da definição do workflow registrada
  em `WorkflowStarted`. Um novo worker que traga uma impressão digital diferente
  para o mesmo workflow se recusa a assumir essas execuções até que terminem.
- **Estratégia de admissão de builds sobrepostos.** Escolha a estratégia de
  [`DW_V2_FLEET_VALIDATION_MODE`](/docs/polyglot/server-config-reference) antes
  de começar. `warn` permite continuar a implantação mesmo quando não há worker
  ativo com o marcador de compatibilidade necessário. `fail` bloqueia o despacho
  e faz o contrato de prontidão negar a admissão durante essa janela.
  Implantações de produção que exijam uma transição limpa devem usar `fail`.

## Ordem do esquema e bootstrap {#schemabootstrap-ordering}

As alterações de esquema são aplicadas em uma única passagem de bootstrap. A ordem importa.

1. **Execute o bootstrap primeiro, exatamente uma vez.** Execute `php artisan
   server:bootstrap --force` (ou o equivalente da imagem publicada) em um
   contêiner antes de iniciar qualquer novo nó de API, worker ou agendador.
   O bootstrap executa `migrate` e o preenchimento inicial do namespace padrão.
   Ele adota as migrações do pacote Workflow cujas tabelas já existam na conexão.
2. **O novo esquema deve ser compatível com o código antigo.** Toda migração
   da v2 neste caminho de release é aditiva (novas tabelas, colunas e índices).
   Nós de API e workers antigos continuam executando com o novo esquema.
3. **Não inicie código novo antes de concluir o bootstrap.** Implante a nova
   imagem do servidor somente depois que o bootstrap terminar com sucesso.
   Novos nós de API e workers podem depender das tabelas recém-migradas, e
   iniciá-los antes de concluir o bootstrap é a causa mais comum de um aumento
   de erros 5xx durante a transição.
4. **O bootstrap é idempotente.** É seguro executá-lo novamente. Se falhar no
   meio, corrija o erro subjacente e repita. O registro de migrações retoma de
   onde parou, e o preenchimento do namespace não altera nada se o registro já existe.

Uma migração aplicada em um servidor antes de outro NÃO DEVE corromper a
interface de prontidão. Se descobrir uma alteração não aditiva no planejamento,
reserve uma janela de atualização com parada total para essa release e retorne
às atualizações graduais na próxima.

## Drenagem e admissão durante a janela de sobreposição {#drain-and-admission-during-the-overlap-window}

Três interfaces de admissão garantem automaticamente a segurança da janela de sobreposição:

- **Admissão na inicialização.** Todo processo de servidor carrega
  `BackendCapabilities`, `LongPollCacheValidator`, `WorkflowModeGuard` e o
  contrato de prontidão ao iniciar. Um processo cujo backend ou cache não
  consiga atender ao contrato da v2 se recusa a marcar-se como pronto.
- **Compatibilidade de workers.** Quando `DW_V2_FLEET_VALIDATION_MODE=fail` e
  nenhum worker ativo anuncia o marcador de compatibilidade necessário para
  o escopo de conexão e fila de uma tarefa, o papel de matching bloqueia o
  despacho e a verificação de integridade `worker_compatibility` passa de
  `warning` para `error`. As tarefas permanecem prontas e visíveis, nunca são
  descartadas, e o contrato de prontidão retorna 503 nesse nó para que o
  balanceador o retire da rotação.
- **Segurança de roteamento.** Uma tarefa pronta cuja compatibilidade exigida
  não tenha worker ativo é preservada e contabilizada na métrica de backlog
  `compatibility_blocked_runs`. A segurança de roteamento nunca resulta
  silenciosamente em perda de tarefas. A garantia de execução pelo menos uma
  vez continua válida após uma drenagem de roteamento.

Para manter curta a janela de sobreposição de workers, drene os grupos antigos
à medida que novos workers entrarem em operação. Use o fluxo de
[implantação por build ID de worker](/docs/polyglot/worker-build-id-rollout):

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

O `drain_intent` do grupo passa a `draining`. Os workers desse build continuam
concluindo o trabalho em andamento, mas deixam de assumir novas tarefas. Aguarde
`active_worker_count` e `draining_worker_count` do grupo chegarem a zero antes
de parar os processos antigos de workers.

O agendador não executa uma fila de tarefas de longa duração, então não precisa
de drenagem de worker. Pare o contêiner do agendador antigo, execute o bootstrap
se ainda não tiver sido executado e inicie o novo. A janela entre os dois é
limitada ao tempo de inicialização do novo contêiner. O disparo de agendamentos
retoma a partir do estado persistido no próximo ciclo.

Se a implantação também introduzir um papel de matching dedicado, explicite essa
mudança de topologia em vez de presumir que cada nó de execução continuará
fazendo varreduras amplas de tarefas prontas. Consulte
[Matching e despacho de tarefas](/docs/polyglot/task-matching-dispatch) para a
topologia documentada de `workflow:v2:repair-pass --loop` com
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0`. Verifique o contrato do nó ativo em
`GET /api/cluster/info`: `topology.current_shape` deve continuar correspondendo
à implantação em transição, `topology.current_roles` deve corresponder ao
conjunto documentado de papéis desse nó, e
`topology.matching_role.queue_wake_enabled`,
`topology.matching_role.shape` e `topology.matching_role.wake_owner` devem
mostrar o responsável esperado pela varredura ampla de tarefas prontas. A
topologia padrão informa `queue_wake_enabled: true`, `shape: "in_worker"` e
`wake_owner: "worker_loop"`. Implantações com matching dedicado mudam os nós de
execução para `queue_wake_enabled: false`, `shape: "dedicated"` e
`wake_owner: "dedicated_repair_pass"`.

## Prontidão e transição {#readiness-and-cutover}

Use o contrato de prontidão, além da verificação de atividade, para decidir
quando direcionar tráfego a um nó.

- `GET /api/health` comprova que o processo está atendendo HTTP.
- `GET /api/ready` comprova que o processo consegue usar suas dependências
  configuradas de runtime, incluindo migrações, namespace padrão e, com
  `DW_V2_FLEET_VALIDATION_MODE=fail`, a verificação de admissão por
  compatibilidade de workers.
- `GET /api/cluster/info` comprova que um cliente autenticado consegue descobrir
  a identidade do build, os protocolos do plano de controle e de workers, os
  codecs de payload e as capacidades do servidor.
- `POST /api/worker/register` comprova que workers conseguem se autenticar no
  namespace e na fila de tarefas esperados.

Sequência de transição para um nó de API:

1. Retire o nó da rotação do balanceador de carga. O caminho mais simples é
   fazer a verificação de prontidão do balanceador falhar parando o hook de
   pré-inicialização da nova imagem antes de iniciar o novo contêiner.
2. Drene as requisições HTTP em andamento. A maioria dos clientes tenta novamente
   quando a conexão é reiniciada. Conexões de longa duração (long-polls de
   workers) se reconectam ao restante da frota.
3. Pare o contêiner antigo e inicie o novo.
4. Aguarde `GET /api/ready` retornar 200 e `GET /api/cluster/info` anunciar a
   identidade do novo build. Quando a implantação alterar a topologia de
   matching, confirme também que
   `topology.matching_role.task_dispatch_mode`,
   `topology.matching_role.queue_wake_enabled`,
   `topology.matching_role.shape`, `topology.matching_role.wake_owner`,
   `topology.matching_role.partition_primitives` e
   `topology.matching_role.backpressure_model` correspondem à implantação
   pretendida antes de devolver tráfego ao nó. Use `/api/system/operator-metrics`
   quando quiser o mesmo contrato do papel de matching local ao nó junto com
   contadores ativos de backlog, reparo e workers do processo que responde.
5. Devolva o nó à rotação.

Repita um nó por vez. Não atualize o próximo até que o anterior esteja de volta
à rotação e atendendo ao tráfego sem problemas.

Para workers, a transição ocorre por grupo:

1. Coloque o novo grupo de workers em operação com um novo `build_id`.
2. Confirme que os dois grupos informam `rollout_status: "active"` e
   `active_worker_count` maior que zero em `dw task-queue:build-ids <queue> --json`.
3. Drene o grupo antigo com `dw task-queue:drain`.
4. Aguarde `active_worker_count` e `draining_worker_count` do grupo antigo
   chegarem a zero.
5. Pare os processos antigos de workers.

## Reversão {#rollback}

Todas as etapas são reversíveis. Planeje a reversão antes de começar.

- **Reversão do bootstrap.** Migrações da v2 são reversíveis pelo caminho padrão
  `down()` do Laravel. Uma reversão que desfaça uma migração da qual a nova imagem
  dependa exige parar todos os novos nós primeiro. Caso contrário, o novo código
  encontra uma coluna ausente e o contrato de prontidão retorna 503 nesses nós.
  A maioria das reversões não precisa desfazer migrações porque as alterações
  de esquema são aditivas.
- **Reversão de nó de API.** Pare o novo contêiner e reinicie o antigo no mesmo
  nó. Retire o nó da rotação durante a inicialização e devolva-o quando
  `GET /api/ready` indicar sucesso. Repita nos demais nós de API atualizados.
  O código antigo continua lendo o novo esquema sem problemas porque a
  alteração de esquema foi aditiva.
- **Reversão de workers.** Retome o grupo drenado anteriormente, drene o grupo
  com problema e volte a escalar o build comprovadamente funcional:

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  A retomada limpa `drain_intent` e `drained_at`, e qualquer worker que envie
  heartbeats com o `build_id` retomado volta a `active` na próxima consulta.
  As duas chamadas são idempotentes.

Se a implantação expuser um problema de esquema não aditivo, reserve uma janela
de atualização com parada total para reverter, execute as migrações corretivas
e refaça o planejamento.

## Verificação pelo operador {#operator-verification}

Verifique cada fase da implantação pelas interfaces do operador, não pelos logs.

| Pergunta | Interface |
| --- | --- |
| O bootstrap terminou? | `php artisan server:bootstrap --force` termina com código 0. `migrate:status` mostra que todas as migrações foram executadas. |
| O novo nó está pronto? | `GET /api/ready` retorna 200. `GET /api/cluster/info` informa o novo build. |
| A admissão por compatibilidade está saudável? | Em `GET /api/system/operator-metrics`, `workers.fleet`, `workers.active_workers` e `workers.active_workers_supporting_required` concordam em uma contagem maior que zero de workers compatíveis para cada marcador exigido. |
| A drenagem dos workers está avançando? | `dw task-queue:build-ids <queue> --json` mostra `active_worker_count` e `draining_worker_count` diminuindo no grupo em drenagem. |
| O roteamento está seguro? | Em `GET /api/system/operator-metrics`, `backlog.compatibility_blocked_runs` e `backlog.max_compatibility_blocked_age_ms` permanecem próximos de zero. A verificação de integridade `worker_compatibility` não está em `error`. |
| O agendador está em dia? | Em `GET /api/system/operator-metrics`, `schedules.missed` é zero e `schedules.oldest_overdue_at` é null. |
| Execuções presas estão se acumulando? | Em `GET /api/system/operator-metrics`, `runs.repair_needed` e `runs.max_repair_needed_age_ms` permanecem próximos dos valores de referência anteriores à implantação. |

`dw system:operator-metrics --json` expõe no console o mesmo snapshot de métricas
do operador para a frota de servidores independentes, para que operadores possam
escolher a interface que se encaixa no seu fluxo de trabalho. Um serviço
Waterline implantado separadamente pode ler o mesmo estado de implantação
mantido pelo servidor por meio do SDK PHP em `/waterline/api/v2/health` e
`/waterline/api/stats`. Mantenha seu endpoint, namespace e token de servidor
alinhados à frota em atualização. Implantações Laravel integradas expõem essas
rotas do Waterline pelo pacote no mesmo processo. A API do servidor e a CLI
continuam disponíveis em ambos os casos, conforme documentado nos
[Limites operacionais do operador](/docs/operator-operating-envelope).

## Modos de falha e ações recomendadas {#failure-modes-and-what-to-do}

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Novo nó de API falha em `GET /api/ready` após iniciar | O bootstrap não terminou, ou `DW_V2_FLEET_VALIDATION_MODE=fail` e ainda não há worker compatível ativo | Execute o bootstrap novamente. Coloque um grupo de workers compatíveis em operação antes de devolver o nó de API à rotação. |
| A verificação de integridade `worker_compatibility` passa a `error` no meio da implantação | O marcador de compatibilidade exigido não tem worker ativo que o suporte | Coloque mais workers em operação com um `build_id` compatível. Retome um grupo drenado anteriormente se a reversão for a decisão correta. |
| `backlog.compatibility_blocked_runs` aumenta e `max_compatibility_blocked_age_ms` cresce | Há tarefas enfileiradas para um marcador que nenhum worker ativo suporta | Faça o mesmo acima. As tarefas são preservadas e serão redespachadas automaticamente assim que um worker compatível enviar heartbeat. |
| `dw task-queue:drain` retorna sucesso, mas workers continuam assumindo tarefas | O processo de worker não enviou heartbeat após a drenagem | Aguarde um ciclo de heartbeat. Se o grupo continuar ativo, reinicie o processo de worker para que ele reconheça a intenção de drenagem. |
| Os disparos de agendamentos param após reiniciar o agendador | Os agendadores antigo e novo estão ambos parados | Inicie o contêiner do novo agendador. Verifique se `schedules.missed` volta a zero na próxima coleta de métricas do operador. |

Se um sintoma não estiver nesta lista, considere que a implantação falhou: pare
de adicionar processos, drene os novos grupos que iniciou e restaure o build
anterior antes de continuar a depuração.

## Referências relacionadas {#related-references}

- [Implantações sob sua administração](/docs/deployment) para as topologias
  de implantação pressupostas por este contrato.
- [Implantação por build ID de worker](/docs/polyglot/worker-build-id-rollout)
  para as chamadas de drenagem e retomada por grupo.
- [Limites operacionais do operador](/docs/operator-operating-envelope)
  para o contrato de diagnóstico, filas e reconstrução que operadores consultam
  junto com os sinais da implantação.
- [Referência de configuração do Server](/docs/polyglot/server-config-reference)
  para as variáveis de ambiente de segurança de implantação (`DW_V2_FLEET_VALIDATION_MODE`,
  `DW_V2_PIN_TO_RECORDED_FINGERPRINT`, `DW_V2_GUARDRAILS_BOOT`,
  `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_MULTI_NODE`,
  `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_V2_TASK_REPAIR_*`).
- [Referência da API do Server](/docs/polyglot/server-api-reference) para os
  endpoints de prontidão, informações do cluster e métricas do operador usados
  para verificar cada fase da implantação.
