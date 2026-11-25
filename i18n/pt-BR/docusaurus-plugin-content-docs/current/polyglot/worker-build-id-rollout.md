---
sidebar_position: 7
title: Implantação de identificadores de build dos workers
description: Inspecione coortes, selecione o build de novas inicializações e preserve capacidade para execuções fixadas.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [build dos workers, drenagem, reversão, canário, workers sem versão]
---

# Implantação de identificadores de build dos workers

## Replay antes de trocar builds {#replay-before-changing-builds}

Antes de promover um candidato, reproduza históricos representativos abertos e encerrados recentemente usando seu código exato. Antes de reverter, reproduza os históricos escritos pelo build novo com o artefato antigo. Siga a [verificação de replay](../testing.md#replay-before-deployment); uma coorte de roteamento compatível ou uma verificação de integridade aprovada não comprova, por si só, compatibilidade de replay.

Use este guia para inspecionar coortes, escolher o build de novos workflows e manter workers compatíveis com execuções existentes. A promoção muda a seleção de novas inicializações; a drenagem impede novas reivindicações pela coorte. Nenhuma das ações migra execuções ou comprova que um build pode ser excluído; essa decisão cabe à [retirada protegida](#retire-a-build-or-queue).

[Compatibilidade e roteamento dos workers](/docs/polyglot/worker-compatibility-routing) descreve a identidade de tarefas, atividades, novas tentativas, filhos e continue-as-new. Uma coorte tem escopo `(namespace, task_queue, build_id)`. Registros sem `build_id` pertencem à coorte não versionada, `null`.

## Estado de implantação registrado pelo servidor {#rollout-state-the-server-records}

| Campo | Significado |
| --- | --- |
| `build_id` | Identidade registrada; `null` indica a coorte não versionada. |
| `rollout_status` | `active`, `active_with_draining`, `draining`, `stale_only` ou `no_workers`. |
| `drain_intent`, `drained_at` | Intenção persistente e primeiro horário de drenagem; repeti-la não altera o horário. |
| `promoted_at`, `rolled_back_at` | Horários persistidos de promoção e reversão. |
| `new_start_selected` | Coorte selecionada por promoção explícita. `false` não exclui a alternativa de coorte única descrita abaixo. |
| `active_worker_count` | Registros recentes que não estão drenando; não representa vagas livres nem garante cobertura de todos os tipos. |
| `draining_worker_count` | Registros recentes em drenagem, impedidos de reivindicar novas tarefas; não precisam ter uma concessão ativa. |
| `stale_worker_count` | Registros com heartbeat mais antigo que `stale_after_seconds`. |
| `total_worker_count` | Soma dos registros ativos, em drenagem e desatualizados. |
| `runtimes`, `sdk_versions` | Strings de runtime e SDK observadas nos registros. |
| `last_heartbeat_at`, `first_seen_at` | Atualidade e idade do registro, não prova de ausência de execuções restantes. |
| `pending_workflow_tasks` | Contadores e diagnóstico das tarefas de workflow detalhados abaixo. |

A intenção de drenagem persiste após reinícios, ausência de workers e heartbeats desatualizados. Apenas uma retomada explícita a remove; a ausência não retoma o worker automaticamente.

## Inspecionar a implantação {#inspect-the-rollout}

Confira o namespace e a fila exatos antes de mudar a capacidade:

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --namespace orders-prod --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token,
                  namespace="orders-prod") as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

O snapshot HTTP é a referência para campos adicionais que o modelo de resposta de um SDK antigo talvez não exponha.

## Tarefas de workflow pendentes por coorte {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks` conta somente tarefas de workflow desse namespace e fila, agrupadas pela compatibilidade efetiva da tarefa, usando a da execução como alternativa. Não é backlog de atividades, número de execuções abertas, vazão nem carga dos processos.

| Subcampo | Interpretação |
| --- | --- |
| `ready_count` | Linhas de tarefas de workflow no estado `ready`. |
| `leased_count` | Linhas no estado `leased`. |
| `total_count` | `ready_count + leased_count`. |
| `status` | `idle` sem tarefas; caso contrário, `pending`, ou `no_compatible_worker` para build não nulo sem worker ativo. |
| `operator_visible_signal`, `message` | Diagnóstico de falta de workers compatíveis; nos demais casos podem ser nulos. |

A coorte não versionada não recebe esse diagnóstico específico de build. Campo ausente, requisição com falha ou observação antiga não significa zero. Leia novamente o snapshot e confira heartbeats e declarações de tipos.

Um build antigo pode ter duas tarefas prontas e uma concedida, enquanto o novo não tem pendências. Um total de três na fila não identifica qual frota precisa de capacidade. Se não há workers ativos do build antigo, restaure sua capacidade compatível ou retome-o se a drenagem foi acidental. Acrescentar workers novos não consome trabalho fixado ao antigo. Se restam apenas registros desatualizados, investigue processos ou heartbeats perdidos antes de contá-los como capacidade disponível.

Reduza cada coorte com cautela, conferindo suas tarefas, workers recentes, tipos declarados, vagas e intenção de drenagem. Mantenha capacidade para concessões e trabalho futuro de execuções existentes. Uma execução esperando sinal, timer, atividade ou filho pode não ter tarefa de workflow agora e precisar do build antigo depois. Atividades podem usar outras filas registradas. Este endpoint não determina retirada segura nem autoriza reduzir a zero a última coorte necessária; para isso, use a [retirada protegida](#retire-a-build-or-queue).

[Server #534](https://github.com/durable-workflow/server/issues/534) acompanha a capacidade separada de coleta e redução a zero. Nenhum gatilho KEDA/HPA integrado é documentado aqui.

## Primeira transição do não versionado ao versionado {#first-cutover-unversioned-to-versioned}

1. Inicie novos workers com identidade estável e verifique namespace, fila, tipos e heartbeats recentes.
2. Inspecione as duas coortes e as execuções originais. Nome mais novo ou quantidade de workers não prova compatibilidade.
3. Promova explicitamente o build quando novas inicializações devem selecioná-lo:

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. Preserve workers compatíveis com os históricos existentes. Promoção não muda fixações antigas; drenagem não é migração.
5. Retire o build antigo com a [retirada protegida](#retire-a-build-or-queue) quando seu inventário estiver vazio. Contadores vazios e zero registros não comprovam isso. Preserve o artefato enquanto uma execução puder precisar dele.

## Testar um build novo com canário {#canary-a-new-build}

O servidor não divide tráfego por porcentagens entre coortes. Para novas inicializações, seleciona a última coorte promovida que não esteja drenando nem revertida. Sem promoção, escolhe a única coorte ativa que declara o tipo solicitado e, depois, a única ativa da fila. Se houver ambiguidade, a execução fica sem fixação. Várias coortes ativas do mesmo tipo sem promoção não implicam divisão ponderada.

Adicionar workers muda capacidade, não a política promovida de seleção. Para um canário isolado, use outra fila e direcione explicitamente algumas inicializações da aplicação a ela. Ao promover na fila original, mantenha workers antigos para execuções já fixadas.

## Mover uma cadeia na próxima continuação {#move-a-chain-at-its-next-continuation}

Quando o Server e o SDK negociam `continue_as_new_target_build` com o protocolo de worker 1.21, você pode optar pelo build promovido ao continuar como novo. A execução sucessora começa um histórico novo com os argumentos que você passar. Use essa opção quando o build promovido puder decodificar e aceitar esses argumentos. O continue-as-new comum mantém a fixação da execução anterior.

Ao fechar a execução anterior, o Server seleciona a promoção persistida para o namespace, a fila e o tipo de workflow exatos da sucessora. O build de destino pode estar com zero workers se o Server já tiver evidência persistida de que ele atende ao tipo. Sem uma promoção elegível, o Server recusa a transição e mantém a execução atual aberta. O worker informa `promoted_build_unavailable` pelo fluxo normal de novas tentativas da tarefa de workflow. O Waterline mostra a recusa e o horário da próxima tentativa, quando programada. Uma transição bem-sucedida registra as duas fixações nos históricos das execuções vinculadas.

Mantenha os workers do build anterior disponíveis enquanto as execuções abertas precisarem deles. Cada cadeia muda de build quando sua própria continuação com essa opção é confirmada. As execuções filhas abertas mantêm suas fixações.

## Drenar um build antigo {#drain-an-older-build}

A drenagem impede que polls de workflow, atividade e query dessa coorte reivindiquem novas tarefas; não transfere tarefas. O poll de um worker em drenagem recebe HTTP409 com `poll_status: "draining"` e `reason: "worker_draining"`. As concessões existentes mantêm sua autoridade original.

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

Não drene apenas porque o novo build consegue reivindicar o próprio trabalho: execuções antigas podem ficar esperando. Para corrigir uma drenagem antecipada, retome a coorte e restaure workers com o build original:

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

Drenar ou parar todos os workers não comprova que o artefato pode ser excluído. A drenagem continua sendo a parada de emergência: ela recusa imediatamente os polls do build, haja ou não trabalho ainda fixado nele. Use a [retirada protegida](#retire-a-build-or-queue) para decidir a remoção.

## Retirar um build ou uma fila {#retire-a-build-or-queue}

O Native Server 3.14.0 e posteriores informam se um build ou uma fila pode ser removido com segurança e recusam a retirada enquanto restar alguma dependência viva. Exija que `capabilities.worker_build_retirement` seja exatamente `true` em `GET /api/cluster/info`; o Server PHP publicado não atende essas rotas. Use um token de operador ou administrador e o namespace, como nas demais rotas de build-id.

| Intenção | Endpoint HTTP |
| --- | --- |
| Inspecionar um build | `GET /api/deployments/{namespace}/{taskQueue}@{buildId}/retirement` (`@unversioned` para a coorte não versionada) |
| Retirar um build | `POST /api/deployments/{namespace}/{taskQueue}@{buildId}/retire` |
| Inspecionar todas as coortes de uma fila | `GET /api/task-queues/{taskQueue}/retirement` |
| Retirar uma fila | `POST /api/task-queues/{taskQueue}/retire` |

1. Promova o build substituto e mantenha os workers do build antigo em execução. Eles concluem as execuções ainda fixadas nele, as novas tentativas adiadas, os timers e as cadeias continuadas.
2. Inspecione o build antigo até que `retirable` seja `true`:

   ```bash
   dw task-queue:retirement orders-critical --namespace orders-prod --build-id orders-v1 --json
   ```

   Cada bloqueio informa seu `count` exato, até 20 identidades de amostra e uma ação `recovery`: deixar o trabalho terminar ou cancelar ou encerrar as execuções que você decidir abandonar.
3. Retire-o, opcionalmente vinculado à `observation.inventory_revision` inspecionada:

   ```bash
   dw task-queue:retire orders-critical --namespace orders-prod --build-id orders-v1 \
     --expected-revision "$INVENTORY_REVISION"
   ```

4. Pare os processos do build antigo somente depois que a retirada for bem-sucedida.

Sem `--build-id` nem `--unversioned`, os dois comandos atuam sobre todas as coortes da fila. Esses comandos exigem a CLI 2.12.0 ou posterior; com uma CLI anterior, chame as rotas HTTP diretamente.

O inventário conta as execuções abertas fixadas no build (incluindo as em espera, continuadas e filhas), as tarefas prontas, concedidas e adiadas (novas tentativas de atividade e timers ainda não vencidos), as atividades abertas, as validações de atualização pendentes e, para uma fila, os agendamentos que iniciam execuções nela. Uma execução aberta sem fila de tarefas registrada deixa o inventário `incomplete`, e a retirada fica indisponível.

A inspeção é uma prévia. A retirada conta novamente dentro da mesma transição serializada usada por inícios, novas tentativas e criação de tarefas, e só grava quando nada resta. Uma retirada recusada responde HTTP409 e não altera nada; siga `expected_resolution` e inspecione novamente.

| `reason` | Significado |
| --- | --- |
| `unknown_deployment`, `unknown_task_queue` | Nenhum worker registrado e nenhuma implantação registrada para o alvo. |
| `selected_for_new_starts` | Novas inicializações na fila ainda selecionam este build. Promova o substituto primeiro. |
| `inventory_incomplete` | Existem execuções abertas não atribuídas. Inventário ausente nunca autoriza a retirada. |
| `live_dependencies` | Pelo menos um bloqueio tem contador diferente de zero. |
| `inventory_changed` | A `expected_inventory_revision` não corresponde mais. |

Uma retirada bem-sucedida retorna HTTP200 com `outcome: "retired"`, `retired_at` e `retired_by`. A intenção de implantação do build passa ao estado terminal `drained`: ele nunca mais é selecionado para novas inicializações, não pode ser promovido nem retomado pelo ciclo de vida da implantação, e seus workers permanecem drenando. Quando todas as coortes de uma fila estão retiradas e não resta nenhum worker ativo, novas inicializações nela são recusadas com `task_queue_draining` e `routing_status: "retired"` até que uma nova coorte ativa se registre. Fixações de execução, filas de atividade, histórico e prazos não mudam.

Para recuperar, `dw task-queue:resume` (`POST /api/task-queues/{taskQueue}/build-ids/resume`) devolve um build retirado ao estado `active`; a retirada garantiu que ele não tinha trabalho naquele momento.

## Reverter um build defeituoso {#roll-back-a-bad-build}

Restaure workers conhecidos como corretos, retome sua coorte se necessário e promova esse build para futuras inicializações. Depois reverta a implantação defeituosa. A reversão não reescreve fixações nem entrega o trabalho restante a outro build. Preserve workers compatíveis ou tome uma decisão explícita de recuperação na aplicação.

Novas tentativas, execuções filhas e o continue-as-new comum herdam a fixação original. Use uma identidade de build estável para implantações compatíveis com replay. Cadeias de longa duração podem [optar pelo build promovido](#move-a-chain-at-its-next-continuation) ao continuar. Preserve os campos de compatibilidade armazenados durante a recuperação.

## Referência de endpoints e comandos {#endpoints-and-commands-reference}

| Intenção | Endpoint HTTP | CLI | Método do SDK Python |
| --- | --- | --- | --- |
| Inspecionar coortes | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Selecionar novas inicializações | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drenar | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Retomar | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |
| Inspecionar a retirada | `GET /api/task-queues/{taskQueue}/retirement`, `GET /api/deployments/{name}/retirement` | `dw task-queue:retirement` | — |
| Retirar | `POST /api/task-queues/{taskQueue}/retire`, `POST /api/deployments/{name}/retire` | `dw task-queue:retire` | — |

As rotas de promoção, drenagem e retomada aceitam `{"build_id":"orders-v2"}` ou `{"build_id":null}` para a coorte não versionada. As rotas de retirada aceitam um corpo opcional `{"expected_inventory_revision":"..."}`. Comandos CLI usam `--build-id` ou `--unversioned`, nunca ambos.

Para o ciclo completo, use `GET /api/deployments` e `POST /api/deployments/{name}/{promote,drain,resume,rollback}`. Use o nome retornado, como `orders-prod/orders-critical@orders-v2`, no namespace original. No caminho Apache publicado, preserve a barra separadora: codificar todo o nome composto pode gerar uma HTML404 do Apache antes de chegar à API. Ações recusadas retornam HTTP409 com `reason` tipado e array `blockages`. Examine `expected_resolution`; recusa não é promoção bem-sucedida. [Server #521](https://github.com/durable-workflow/server/issues/521) acompanha o espelho OpenAPI atual incompleto, não uma implementação nova nem mudança de esquemas congelados.

## Referências relacionadas {#related-references}

- [Compatibilidade e roteamento dos workers](/docs/polyglot/worker-compatibility-routing)
- [Namespace, autenticação e registro de workers](/docs/polyglot/namespace-auth-workers)
- [Admissão da fila de tarefas](/docs/polyglot/task-queue-admission)
- [Atualizações graduais](/docs/rolling-upgrades)
- [Referência da API Server](/docs/polyglot/server-api-reference)
- [Referência de comandos CLI](/docs/polyglot/cli-reference)
