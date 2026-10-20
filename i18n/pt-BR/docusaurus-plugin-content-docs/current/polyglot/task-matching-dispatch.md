---
sidebar_position: 6
title: Matching e despacho de tarefas
description: Entenda como o Durable Workflow transforma tarefas duráveis prontas em atribuições a workers, de notificações de long poll a implantações com papel dedicado de matching.
tags:
  - worker-protocol
  - task-queues
  - operations
  - dispatch
keywords:
  - matching de tarefas
  - despacho de tarefas
  - papel de matching
  - descoberta de tarefas prontas
  - despertar de fila
---

# Matching e despacho de tarefas {#task-matching-and-dispatch}

Use este guia para entender como o Durable Workflow encontra trabalho pronto,
o atribui a workers compatíveis e escala esse caminho de atribuição além de
"cada nó consulta tudo". Este é o contrato por trás dos polls de tarefas de
workflow e atividade, do despertar de filas e de implantações com papel
dedicado de matching.

A ideia central é que o Durable Workflow separa duas responsabilidades:

- o histórico durável e o estado das tarefas permanecem no banco de dados
- o matching de tarefas decide qual worker ativo recebe a próxima tarefa elegível

Essa separação importa antes mesmo de introduzir um serviço de matching
separado. Ela permite aos operadores tratar a descoberta de tarefas prontas, a
propriedade de filas, a rotatividade de leases e o controle de pressão como um
papel explícito em vez de efeitos colaterais incidentais de cada processo worker.

## O que o papel de matching faz {#what-the-matching-role-does}

O papel de matching é responsável por:

- descobrir tarefas de workflow e atividade prontas
- restringir o conjunto elegível por namespace, conexão, fila e família de compatibilidade
- oferecer tarefas a um worker por vez
- converter uma reserva bem-sucedida em um lease com expiração
- preservar a mesma tarefa quando uma reserva falha, um lease expira ou um worker desaparece
- tornar o estado de despertar e backlog visível aos operadores

O matching não substitui o histórico durável, o replay de workflows nem a
execução de tarefas. Ele decide quem tem a oportunidade de executar em seguida.

## Formatos de implantação {#deployment-shapes}

O Durable Workflow suporta três formatos práticos atualmente:

### Matching no worker {#in-worker-matching}

Este é o formato padrão. Processos worker fazem long poll por trabalho pronto
e usam fencing na reserva para garantir que apenas um worker detenha o lease
de uma tarefa por vez.

Use quando:

- você executa um único nó ou uma frota pequena
- a pressão na fila é moderada
- ainda não precisa de um daemon dedicado de matching

### Matching HTTP no servidor {#in-server-http-matching}

Em implantações do servidor independente, workers externos acessam o mesmo
contrato de matching pelo protocolo de workers:

- `POST /api/worker/workflow-tasks/poll`
- `POST /api/worker/activity-tasks/poll`

O servidor se torna a entrada de rede para o mesmo fluxo de descoberta de
tarefas prontas, reserva, heartbeat e conclusão.

### Implantação com papel dedicado de matching {#dedicated-matching-role-deployment}

Frotas maiores podem concentrar a descoberta ampla de tarefas prontas em um
processo com papel dedicado de matching. O formato operacional documentado hoje é:

```bash
php artisan workflow:v2:repair-pass --loop
```

Execute esse daemon em um processo dedicado e defina
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` nos nós somente de execução para que parem de
fazer o despertar amplo dos workers de fila a cada ciclo do loop.

Use este formato quando:

- os nós de execução devem se concentrar em replay e execução de atividades
- o polling amplo e independente cria contenção desnecessária
- os operadores querem um responsável explícito pela descoberta de tarefas
  prontas e pela cadência de varredura

O papel dedicado muda onde o matching acontece, não o contrato do protocolo de
workers. A semântica de poll, reserva, lease e reentrega permanece igual.

## Descoberta de tarefas prontas {#ready-task-discovery}

O papel de matching procura tarefas duráveis realmente prontas para executar agora:

- o tipo da tarefa corresponde ao poller (`workflow` ou `activity`)
- a tarefa está no estado `ready`
- o `available_at` da tarefa já chegou
- os filtros de namespace, fila, conexão e compatibilidade ainda correspondem
- polls de atividades também exigem um tipo de atividade anunciado correspondente

Notificações de long poll são um caminho de aceleração, não o caminho de
correção. Se o sinal de despertar atrasar ou faltar, a tarefa ainda fica
visível pelo polling durável. Uma falha no despertar deve aumentar a latência,
não deixar trabalho preso.

## Reserva, lease e controle de pressão {#claim-lease-and-backpressure}

O matching apenas oferece uma oportunidade. A propriedade começa quando um
worker reserva a tarefa com sucesso e recebe um lease.

Esse lease dá ao Durable Workflow seu comportamento de controle de pressão:

- um worker detém a tarefa até o lease ser renovado, concluído, liberado ou expirar
- um worker com falha ou desatualizado não prende a tarefa permanentemente
- reentrega é normal e deve ser tratada como parte da execução pelo menos uma vez
- workers incompatíveis não roubam o lease; recebem uma rejeição explícita

Como o trabalho usa leases, a pressão na fila aparece como backlog, leases
desatualizados ou reentregas repetidas em vez de perda oculta na memória.

## Particionamento de filas {#queue-partitioning}

As principais primitivas de particionamento são:

- **namespace** para limites entre tenants ou ambientes
- **conexão** e **fila** para limites de roteamento de trabalho
- **família de compatibilidade** para segurança do roteamento por marcador de compatibilidade
- **filtros de tipo de atividade** para workers que executam apenas atividades selecionadas

Use filas separadas para ter isolamento maior, pools de workers independentes
ou orçamentos downstream diferentes. Use famílias de compatibilidade quando a
mesma fila precisar permanecer ativa durante um rollout ou rollback sem deixar
o trabalho em andamento migrar para executores incompatíveis.

## Filas de atividade registradas {#recorded-activity-queues}

A conexão e a fila resolvidas de uma atividade são armazenadas ao agendá-la. Uma mudança na classe da atividade, em `ActivityOptions`, nas opções de atividade do SDK PHP ou no Python `schedule_activity(..., queue=...)` afeta atividades agendadas depois. Execuções existentes mantêm sua fila registrada nas novas tentativas e reparos. Um worker registrado em uma fila nova não move o trabalho antigo. Execuções de workflow existentes também mantêm sua própria fila de workflow.

### Alterar o roteamento com um período de sobreposição {#change-recorded-routing}

1. Inicie workers para a nova fila no namespace correto. Verifique seus tipos de atividade, slots de atividade positivos e compatibilidade de build. Mantenha os pools antigos de workflows e atividades disponíveis.
2. Implante o novo roteamento para o trabalho novo. Preserve código compatível com as execuções existentes e respeite seus builds fixados. Uma fila nova não migra as execuções registradas.
3. Inspecione as execuções afetadas e ambas as filas. Considere atividades pendentes e sob lease, novas tentativas disponíveis no futuro, execuções abertas passivas, filhas e cadeias de continuação que ainda precisam de workers antigos. Um contador de tarefas prontas igual a zero não cobre essas dependências.
4. Desative os workers antigos somente após considerar essas dependências e impedir que o trabalho novo as crie. Os snapshots atuais não são uma proteção atômica para a desativação. Se não puder determinar isso, mantenha o pool antigo disponível. [Server #519](https://github.com/durable-workflow/server/issues/519) cobre o inventário e a desativação protegidos.

### Inspecionar e recuperar trabalho parado {#recorded-queue-diagnostics}

Use uma credencial de operador e o mesmo namespace da execução afetada. Defina explicitamente a origem, o namespace, a fila antiga e os IDs do workflow e da execução selecionados:

```bash
curl -fsS "$DW_SERVER_URL/api/task-queues/$OLD_QUEUE" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "X-Namespace: $DW_NAMESPACE"
curl -fsS "$DW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/debug" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "X-Namespace: $DW_NAMESPACE"
```

Se a admissão do servidor estiver disponível e não estiver limitada, a visibilidade de filas informa `admission.activity_tasks.status: no_active_workers` quando nenhum worker ativo e não obsoleto está registrado nessa fila. A resposta de depuração da execução inclui `pending_activities[].queue`, `activity_task_queues` e achados como `pending_activity_queue_without_active_pollers`. Se houver workers, mas eles não anunciarem o tipo de atividade necessário, procure `pending_activity_type_unsupported`. O registro sozinho não comprova progresso.

A resposta de depuração é um snapshot limitado de uma execução, não um inventário completo da fila. Ela inclui no máximo 25 atividades pendentes. Contadores de fila e snapshots vazios não comprovam que trabalho concorrente ou futuro deixou de depender do pool antigo.

Restaure um worker compatível na fila **registrada**, com o tipo de atividade necessário e slots disponíveis, antes do vencimento dos prazos. Reparar ou reiniciar um worker não altera essa fila nem estende o prazo total original. Se o trabalho não for mais desejado, cancele deliberadamente a execução afetada e reconcilie os efeitos externos. Não edite campos de fila armazenados como procedimento de migração.

Um timeout finito de schedule-to-start pode expirar enquanto uma atividade espera por um worker. Schedule-to-close limita toda a execução da atividade, incluindo atrasos entre tentativas. Esses limites só se aplicam quando configurados. A aplicação do prazo não move a atividade para uma fila ativa, e restaurar workers não revive um timeout já terminal. Consulte [timeouts de atividades e workflows](../features/timeouts.md).

## Sinais de despertar e varreduras dedicadas {#wake-signals-and-dedicated-sweeps}

Sinais de despertar reduzem o tempo entre "a tarefa ficou pronta" e "um poller
a percebeu". Eles não são a fonte durável de verdade.

No formato padrão, workers de fila podem emitir sinais de despertar como
parte de seu loop normal. Em uma implantação com papel dedicado de matching,
nós somente de execução desabilitam esse caminho amplo, e o daemon de matching
assume a cadência de varredura.

Trate estas opções como ajustes:

- `DW_V2_MATCHING_ROLE_QUEUE_WAKE` controla se os nós de execução fazem o despertar no worker
- `DW_WAKE_SIGNAL_TTL_SECONDS` controla por quanto tempo os marcadores de despertar ficam visíveis
- as configurações de timeout de long poll controlam por quanto tempo os pollers aguardam trabalho

## O que os operadores devem observar {#what-operators-should-watch}

Use estas interfaces em conjunto:

- `GET /api/cluster/info` para a topologia de papéis por nó:
  `current_shape`, `current_process_class`, papéis atuais e o contrato completo
  `matching_role`: `queue_wake_enabled`, `shape` da implantação, `wake_owner`,
  `task_dispatch_mode`, `partition_primitives` congeladas e o `backpressure_model` atual
- visibilidade da fila de tarefas para profundidade de tarefas prontas, slots ativos e limitação
- visibilidade da frota de workers para pollers ativos e desatualizados em cada fila
- `dw system:operator-metrics --json` ou `/api/system/operator-metrics` para o
  mesmo contrato `matching_role` local do nó, junto aos contadores de backlog,
  reparo, workers e saúde do processo que respondeu
- diagnósticos de saúde e Waterline para tarefas com problemas, leases
  desatualizados e lacunas de workers compatíveis
- verificações de atualização gradual quando há uma janela de sobreposição
  ativa e o matching deve bloquear reservas inseguras

Se a idade da tarefa pronta mais antiga cresce enquanto há workers
compatíveis disponíveis, o caminho de matching não está avançando rápido o
suficiente. Se as tarefas prontas são preservadas, mas nenhum worker compatível
pode reservá-las, trata-se de um problema de compatibilidade, não de perda no matching.

## Quando introduzir um papel dedicado de matching {#when-to-introduce-a-dedicated-matching-role}

Passe do matching padrão no worker para um papel dedicado quando:

- o polling amplo cria contenção visível no banco ou cache
- os nós de execução devem deixar de arcar com o custo das varreduras de tarefas prontas
- a justiça entre filas e a responsabilidade pelo despacho precisam ser tratadas como um subsistema explícito
- os operadores querem um processo distinto para escalar, supervisionar e depurar a descoberta de tarefas prontas

Mantenha o formato padrão quando a frota atual for pequena e a principal
necessidade for um comportamento claro de rollout e compatibilidade, em vez de
uma nova topologia.

## Referências relacionadas {#related-references}

- [Protocolo de workers](/docs/polyglot/worker-protocol) para as operações de
  poll, heartbeat, conclusão e falha
- [Admissão de filas de tarefas](/docs/polyglot/task-queue-admission) para
  orçamentos de slots, leases e despacho aplicados sobre o matching
- [Atualizações graduais](/docs/rolling-upgrades) para o procedimento de
  rollout quando matching e compatibilidade estão envolvidos
- [Referência de configuração do Server](/docs/polyglot/server-config-reference)
  para `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, tempos de poll e configurações dos sinais de despertar
