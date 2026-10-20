---
sidebar_position: 7
title: Rollout por build id de workers
description: Faça rollout, canário, drenagem e rollback de builds de workers sem deixar execuções presas, usando o estado de rollout por build id no servidor independente.
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - rollout por build id de workers
  - drenar build de worker
  - rollback de build de worker
  - workers canário
  - transição de sem versão para versionado
---

# Rollout por build id de workers {#worker-build-id-rollout}

Use esta referência ao migrar de workers sem versão para workers com build
identificado, testar um build canário em uma fila de tarefas, drenar um build
antigo antes de desativá-lo ou reverter um build defeituoso. O servidor registra
a intenção do operador junto às linhas de workers ativos, para que o próximo
poll, describe da CLI ou chamada `list_task_queue_build_ids` reflita o estado
real do rollout mesmo se os workers antigos desaparecerem antes de drenar o backlog.

Este guia trata do controle de coortes, não de todo o contrato de roteamento.
Leia [Compatibilidade e roteamento de workers](/docs/polyglot/worker-compatibility-routing)
para a regra de que trabalho em andamento deve permanecer vinculado a
executores compatíveis e de que "nenhum worker compatível disponível" é um
estado explícito para o operador.

O servidor Durable Workflow expressa um rollout em uma fila de tarefas como um
conjunto de **coortes de build id**. Uma coorte agrupa todos os registros de
worker que informaram o mesmo `build_id` ao chamar `POST /api/worker/register`.
Workers que omitem `build_id` formam a **coorte sem versão**, que é o padrão
antes do rollout e da qual você migra na primeira transição.

## Estado de rollout registrado pelo servidor {#rollout-state-the-server-records}

Cada coorte `(namespace, task_queue, build_id)` contém o estado agregado dos
workers (contagens de ativos, drenando, desatualizados e total) e a intenção do operador:

| Campo | Finalidade |
| --- | --- |
| `build_id` | A identidade de build registrada. `null` identifica a coorte sem versão. |
| `rollout_status` | Visão agregada do que a coorte fará com novas tarefas: `active`, `active_with_draining`, `draining`, `stale_only` ou `no_workers`. |
| `drain_intent` | Intenção do operador para a coorte: `active` ou `draining`. |
| `drained_at` | Quando a coorte foi marcada como drenando pela primeira vez. Ausente enquanto a coorte está ativa. Chamadas repetidas de drenagem não alteram esse timestamp. |
| `active_worker_count` | Workers vivos que atualmente aceitam novas tarefas. |
| `draining_worker_count` | Workers vivos que ainda detêm tarefas em andamento, mas não reservam trabalho novo. |
| `stale_worker_count` | Workers cujo último heartbeat é anterior ao limite de desatualização. |
| `total_worker_count` | Soma das três populações da coorte. |
| `runtimes`, `sdk_versions` | Strings distintas de runtime e versão de SDK observadas na coorte. |
| `last_heartbeat_at`, `first_seen_at` | Janela de heartbeat da coorte inteira, útil para confirmar coortes sem atividade antes de excluí-las. |

`drain_intent` é persistente: reiniciar um worker, parar todos os workers ou
deixar a coorte ficar desatualizada não a devolve silenciosamente a `active`.
Somente um `POST .../build-ids/resume` explícito limpa `drain_intent` e
`drained_at`. Isso mantém `rollout_status` fiel mesmo depois de a coorte ficar
sem workers vivos.

## Inspecionar o rollout {#inspect-the-rollout}

Antes de drenar ou excluir um build, confirme quais coortes ainda estão
alcançáveis na fila:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

O mesmo snapshot está disponível na CLI de operação e no SDK Python:

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## Primeira transição: de sem versão para versionado {#first-cutover-unversioned-to-versioned}

Uma fila que sempre foi atendida por workers sem versão informa uma única
coorte `build_id: null` com `rollout_status: "active"`. A primeira transição
introduz uma nova coorte com build identificado ao lado dela.

1. Implante a nova frota de workers com um `build_id` estável (por exemplo,
   `orders-worker-2026-04-22`) registrado por `POST /api/worker/register`.
2. Confirme que ambas as coortes estão ativas:
   ```bash
   dw task-queue:build-ids orders-critical --json
   ```
   Você deve ver `null` e o novo `build_id`, cada um informando
   `rollout_status: "active"` e `active_worker_count` diferente de zero.
3. Inicie a drenagem da coorte sem versão quando os novos workers estiverem
   processando trabalho:
   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```
   `drain_intent` muda para `draining` na coorte sem versão. Workers ainda em
   execução processam suas tarefas em andamento, mas param de reservar novas.
   Registros ou heartbeats futuros que cheguem sem `build_id` também entram
   como drenando.
4. Aguarde até que `active_worker_count` e `draining_worker_count` sejam ambos
   zero para a coorte sem versão. Ela continua listada com
   `drain_intent: "draining"` para que você confirme que a transição é permanente.

## Testar um novo build canário {#canary-a-new-build}

Um canário é um segundo build que recebe uma pequena fração do tráfego enquanto
o build principal continua atendendo. Use um `build_id` separado para o canário
para que o estado de cada coorte seja inspecionável individualmente.

1. Implante os workers canário com `build_id: orders-worker-2026-04-22-canary`.
2. Inspecione `list_task_queue_build_ids` para confirmar que ambas as coortes
   informam `rollout_status: "active"` com as contagens esperadas de workers.
3. Promova iniciando mais workers no novo `build_id` e reduzindo a contagem de
   workers do principal, ou retire o canário drenando-o:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

O servidor não controla a divisão de tarefas entre coortes. Os operadores
dimensionam suas populações e contam com a distribuição do polling para
ponderar o tráfego. O estado de rollout por build id existe para que os
operadores confirmem quais coortes ainda podem reservar trabalho e iniciem uma
transferência limpa quando uma coorte estiver pronta para parar.

## Drenar um build antigo {#drain-an-older-build}

A drenagem mantém as tarefas já sob lease no build antigo enquanto novas
tarefas vão para outras coortes ativas na fila:

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

O servidor grava `drain_intent: "draining"` na coorte e marca cada worker
registrado nesse `build_id` como drenando no próximo heartbeat. A chamada é
idempotente: repeti-la não redefine `drained_at`, para que automações possam
tentar novamente com segurança.

Assim que uma linha de worker é marcada como `draining`, as rotas de poll de
tarefas de workflow, atividade e consulta param de conceder novos leases a esse
worker. Polls falham com HTTP `409`, `poll_status: "draining"` e
`reason: "worker_draining"` até a coorte ser retomada.

`draining` faz parte do contrato geral de resposta de poll, não é um campo
especial exclusivo de drenagem. A mesma interface `poll_status` permite aos
workers observar polls normais `leased` e `empty`, resultados de admissão
`throttled` e falhas de coordenação tipadas `unavailable` em outros caminhos de poll.

Monitore a drenagem consultando `list_task_queue_build_ids` e observando
`active_worker_count` e `draining_worker_count` caírem para zero. Nesse ponto,
a coorte mostra `rollout_status: "draining"` com contagens zero, indicando que
não restam workers vivos e que a intenção do operador ainda registra
"drenada". Esse é o momento seguro para parar os processos worker e excluir o
artefato de build.

## Reverter um build defeituoso {#roll-back-a-bad-build}

O rollback é o fluxo inverso: retome uma coorte previamente drenada, roteie
tráfego novo de volta a ela e drene o build defeituoso.

1. Retome a coorte comprovadamente boa:
   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```
   O servidor limpa `drain_intent`, apaga `drained_at` e muda imediatamente
   para `active` quaisquer linhas de workers que ainda enviem heartbeats nesse
   `build_id`, para que o endpoint de leitura pare de informar estado de drenagem.
2. Drene a coorte defeituosa:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```
3. Aumente novamente a escala do build bom ou reimplante-o se os workers já
   tiverem sido parados. Workers que se registram em seu `build_id` recebem a
   intenção de drenagem limpa e entram como `active`.

A retomada também é idempotente. Repeti-la em uma coorte já ativa não faz nada,
portanto fluxos automatizados de rollback podem emiti-la com segurança.

## Referência de endpoints e comandos {#endpoints-and-commands-reference}

| Intenção | Endpoint HTTP | CLI | Método do SDK Python |
| --- | --- | --- | --- |
| Inspecionar o estado da coorte | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Marcar uma coorte como drenando | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Retomar uma coorte previamente drenada | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Drenagem e retomada aceitam um corpo JSON `{"build_id": "..."}` ou
`{"build_id": null}` para a coorte sem versão. A CLI expressa a coorte sem
versão com `--unversioned` e qualquer outro build com `--build-id <value>`;
combinar os dois falha imediatamente.

## Referências relacionadas {#related-references}

- [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers)
  para a chamada `POST /api/worker/register` que grava `build_id` em cada worker.
- [Admissão de filas de tarefas](/docs/polyglot/task-queue-admission) para os
  orçamentos de slots de workers e despacho aplicados junto ao estado de rollout.
- [Referência da API do Server](/docs/polyglot/server-api-reference) para a
  lista completa de rotas do plano de controle, papéis e cabeçalhos de protocolo exigidos.
- [Referência de comandos da CLI](/docs/polyglot/cli-reference) para o formato
  de argumentos e flags de cada subcomando `dw task-queue:*`.
