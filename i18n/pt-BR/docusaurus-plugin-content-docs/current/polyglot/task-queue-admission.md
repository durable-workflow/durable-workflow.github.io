---
sidebar_position: 6
title: Admissão de filas de tarefas
description: Ajuste slots de workers, orçamentos de filas no servidor e controle de pressão de tarefas de consulta no servidor independente.
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - admissão de filas de tarefas
  - orçamento de despacho
  - limites de filas
  - filas limitadas de workers
---

# Admissão de filas de tarefas {#task-queue-admission}

A admissão de filas de tarefas impede que uma fila, tenant ou dependência downstream consuma toda a frota de workers. O Durable Workflow expõe a admissão em três camadas:

- os registros de workers anunciam slots locais de workflow e atividade
- o servidor pode limitar leases ativos de workflow e atividade por namespace e fila
- o servidor pode limitar despachos de workflow e atividade por minuto por namespace e fila
- o servidor pode limitar despachos por minuto para grupos nomeados de orçamento downstream compartilhados por várias filas
- tarefas de consulta têm uma fila de pendências limitada para que leituras síncronas falhem rapidamente em vez de crescer sem limite

Use controles de admissão quando uma fila estiver vinculada a uma dependência com limite de taxa, tenants compartilharem o mesmo servidor ou operadores precisarem comprovar por que um workflow está esperando.

A admissão se aplica sobre o contrato de matching. Leia
[Matching e despacho de tarefas](/docs/polyglot/task-matching-dispatch) para
entender como trabalho pronto é descoberto e recebe leases antes que esses
orçamentos decidam se a próxima tarefa pode passar.

## Como o orçamento é aplicado {#how-the-budget-is-applied}

O polling de workflow e atividade começa pelos workers atualmente registrados em um namespace e fila de tarefas. Cada worker anuncia `max_concurrent_workflow_tasks` e `max_concurrent_activity_tasks`; o servidor soma os workers ativos e não desatualizados para calcular a capacidade de slots registrados da fila.

Os limites de leases ativos e taxa de despacho no servidor são opcionais. Quando configurados, o servidor verifica um lock de cache de curta duração antes de conceder o lease da próxima tarefa de workflow ou atividade. Se o limite de leases ativos estiver esgotado, o polling não retorna tarefa naquele poll em vez de exceder o orçamento em andamento. Se o limite de despachos por minuto estiver esgotado, o polling não retorna tarefa até que o próximo intervalo de um minuto tenha capacidade. Grupos de orçamento downstream aplicam o mesmo comportamento de despacho por minuto a todas as filas do namespace que compartilham um nome `dispatch_budget_group`.

Tarefas de consulta são diferentes: o plano de controle enfileira uma tarefa de consulta efêmera e aguarda a resposta de um worker. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` limita quantas tarefas de consulta pendentes podem existir para cada namespace e fila. Quando a fila está cheia, novas consultas retornam `query_task_queue_full` com HTTP `429`. Se o armazenamento de cache não puder fornecer o lock necessário para alterar a fila de consultas, elas retornam `query_task_queue_unavailable` com HTTP `503`.

## Carga de tentativas e orçamentos do serviço dependente {#retry-load-and-downstream-budgets}

**Primeiras tentativas e repetições contam igualmente** nos limites de despacho por fila, namespace e grupo. O limite abrange tentativas de tarefas de atividade obtidas com sucesso entre workflows, não apenas repetições. Ao atingir o limite, o trabalho espera; isso não falha a atividade por si só. Os relógios schedule-to-start, schedule-to-close e prazos do workflow continuam correndo, podendo esgotar um timeout.

O limite mede tentativas por minuto, não taxa de sucesso ou saúde do serviço. Não abre um circuit breaker. Uma tentativa pode fazer várias chamadas HTTP por repetições internas da atividade ou cliente; limite-as separadamente. Uma recusa rápida também consome um claim mesmo sem acessar o serviço.

Por exemplo, no namespace `production`, filas de atividade comuns `payments` e `refunds` compartilham o orçamento `payment-api` de 20 claims por minuto. Configure o mesmo limite em todas as filas participantes; outras filas não entram no grupo. É um teto por bloco de minuto, não uma taxa uniforme ou parcela reservada:

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  },
  "production:refunds": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  }
}'
```

Combine o limite do Server com tentativas e backoff limitados. Este exemplo do Python SDK 2.9.0 pressupõe que o aplicativo fornece breaker compartilhado assíncrono e cliente de pagamentos por `myapp.payments`; configure I/O limitado e idempotência estável nesse cliente. Registre `charge` no worker de `payments` em `production`, e `PaymentWorkflow` em seu worker de workflows:

```python
from durable_workflow import NonRetryableError, activity, workflow
from myapp.payments import breaker, payment_api

@activity.defn(name="payments.charge")
async def charge(order):
    if await breaker.is_open("payment-api"):
        raise NonRetryableError("payment-api breaker is open")
    return await payment_api.charge(order, idempotency_key=order["id"])

@workflow.defn(name="payments.order")
class PaymentWorkflow:
    def run(self, ctx, order):
        return (yield ctx.schedule_activity(
            "payments.charge", [order], queue="payments",
            retry_policy={"max_attempts": 3, "backoff_seconds": [2, 5]},
            start_to_close_timeout=10,
            schedule_to_start_timeout=30,
            schedule_to_close_timeout=90,
        ))
```

Um breaker aberto gera `NonRetryableError` antes do pagamento; falhas repetíveis podem usar no máximo três tentativas com o backoff definido. Os timeouts originais podem vencer antes. O workflow pode tratar a falha final conforme a regra de negócio; uma falha final não tratada pode encerrá-lo. Escolha o prazo global separadamente.

Mantenha chamadas protegidas em **atividades comuns enfileiradas**. Atividades locais inline não criam tarefa de atividade comum e os limites de despacho por fila/namespace/grupo não as medem. Um claim local preparado valida autoridade, não este orçamento. Laravel integrado não tem admission do Server independente; use seus controles de implantação. Veja [atividades locais](../features/local-activities.md).

## Admissão de requisições por namespace {#namespace-request-admission}

Este contrato corresponde ao **PHP Server 2.11.0** publicado. Confira a imagem executada e a [referência versionada de configuração](./server-config-reference.md#additional-published-php-controls). Os orçamentos HTTP são separados de slots de worker, despacho, polls retidos e cotas duráveis. O orçamento pertence ao namespace resolvido por `Durable-Workflow-Namespace` ou `DW_DEFAULT_NAMESPACE`, inclusive quando uma rota administrativa nomeia outro namespace.

Requisições autenticadas que chegam à admissão contam nestas famílias de rotas de controle e gestão, incluindo seus descendentes: `/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`. As rotas de gestão no plural `/api/workers` contam.

As rotas no singular `/api/worker/*` de registro, polling e resultados não usam este orçamento HTTP. Health/readiness, `/api/cluster/info`, rotas admin `/api/system/*`, credenciais runtime e transporte de payload externo também ficam fora; suas próprias verificações de acesso, capacidade e armazenamento continuam valendo. Recusas anteriores de autenticação, protocolo ou resolução de namespace não chegam ao contador.

A frequência usa buckets de minutos fixos pelo relógio do Server, não uma taxa uniforme ou janela móvel. Um orçamento N pode admitir N requisições antes da virada e mais N depois. Falhas posteriores continuam contando; a frequência é admitida antes da concorrência, então uma recusa de concorrência pode consumir o orçamento do minuto. O slot simultâneo fica ocupado até o fim da requisição e sua limpeza; ele não conta workflows em execução.

Entre réplicas API, use o mesmo Redis compartilhado e prefixo de chaves, relógios sincronizados e configuração carregada consistente. Adicionar réplicas não multiplica o orçamento compartilhado. Cache local em arquivos coordena apenas processos com acesso de escrita compatível; não é a configuração base multinó. Os limites de polls worker/query retidos por nó são separados. [Reinicie os papéis afetados após mudar o ambiente](./server-config-reference.md#how-changes-take-effect).

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

Para namespaces existentes, o exemplo resulta em `payments` com 150 requisições/minuto e 10 simultâneas, `reports` com 40/3 e os demais com 100/8. Overrides podem elevar ou reduzir os padrões, mas os tetos 150/10 continuam valendo. A configuração não cria namespaces nem reserva desempenho.

Para estes controles HTTP, valor ausente não configura aquele limite; um teto obrigatório sozinho ainda pode limitá-lo. Override null volta ao padrão. Os valores devem ser inteiros positivos: zero é inválido. Os tetos da implementação PHP são 10000000 requisições/minuto e 1024 simultâneas, independentemente da capacidade real do pool HTTP. PHP 2.11.0 publicado trata silenciosamente JSON malformado em `DW_NAMESPACE_ADMISSION_OVERRIDES` como overrides vazios e volta aos padrões globais. Valide o JSON antes do deploy; sem padrões ou tetos obrigatórios, perde-se o limite pretendido. Esta [falha confirmada do produto](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521) continua separada da atualização documental.

| Motivo | HTTP | Espera sugerida em segundos |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | Até o próximo minuto, 1–60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

O JSON `retry_after_seconds` coincide com o cabeçalho `Retry-After`. Coordenação configurada indisponível ou limites numéricos inválidos recusa com 503. Consulte métricas admin do namespace mesmo após esgotar o orçamento comum; `dw_namespace_request_admission_rejections` mostra os motivos limitados. Aplique retry/backoff limitado do chamador e idempotência; resultado de transporte incerto não permite repetir uma escrita automaticamente. Veja os [orçamentos de timeout](../deployment.md#worker-long-poll-timeout-budgets).

## Cotas de estado durável por namespace {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` define limites padrão de linhas retidas, `DW_NAMESPACE_DURABLE_OVERRIDES` os altera por namespace e `DW_NAMESPACE_DURABLE_HARD_LIMITS` adiciona tetos obrigatórios. Objetos vazios não acrescentam limites. Overrides podem elevar ou reduzir os padrões; null volta ao padrão. Ao contrário da admissão HTTP, cota durável zero é válida e impede novas alocações. Aqui `payments` existente pode manter 250 runs abertos e os demais namespaces 100, sob um teto de 500.

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

Use campos `max_<resource>` para os recursos abaixo. Cada linha conta no namespace proprietário ou no do workflow/run associado. Totais retidos e subconjuntos abertos/pendentes têm limites independentes. A aplicação usa contagens autoritativas do banco, serializando mutações pela linha do namespace.

| Recurso | O que conta |
| --- | --- |
| `workflow_instances`, `workflow_runs` | Todas as linhas retidas de instâncias/runs de workflow, incluindo runs terminais. |
| `open_workflow_runs` | Runs com status `pending`, `running` ou `waiting`. |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | Linhas retidas de histórico, comandos e tarefas de workflow. |
| `pending_workflow_tasks` | Linhas de tarefas de workflow na fila com status `ready`; leases ativos têm controles separados. |
| `workflow_timers`, `pending_workflow_timers` | Todos os timers retidos e o subconjunto `pending`, respectivamente. |
| `workflow_run_waits`, `open_workflow_run_waits` | Todas as esperas de run retidas e o subconjunto `open`, respectivamente. |
| `schedules`, `schedule_history_events`, `worker_registrations` | Schedules, histórico e registros de workers retidos; registros obsoletos contam até serem removidos. |
| `workflow_streams`, `workflow_stream_items` | Linhas de streams duráveis e de entrada, e linhas de seus itens. |

Um pai esperando um filho ou chamada de serviço ainda ocupa um run aberto no próprio namespace. O filho adiciona seu run; no mesmo namespace, planeje ambos os runs abertos e suas esperas/timers. Uma operação de serviço que cria workflow consome linhas no namespace desse workflow; signal/update em run existente não cria outro run automaticamente. Limites de chamadas de serviço e payload externo são separados.

O esgotamento retorna 429 `namespace_<resource>_exhausted`. Leia `retryable`: algumas cotas não admitem retry nem sugerem espera; recusas duráveis retentáveis indicam 60 segundos, sem prometer capacidade depois. Falha ao avaliar cota configurada retorna 503 `namespace_durable_state_quota_unavailable` com um segundo de espera. Pressão de linhas retidas pode exigir retenção ou mudança de capacidade/configuração, não um loop de retries.

Selecione o namespace pelo cabeçalho ao consultar métricas admin. `dw_namespace_durable_state_usage` e os campos JSON `limits`, `usage`, `remaining`, `configuration_status` e `measurement_status` mostram esse escopo; namespace pertence à requisição, não é um label ilimitado. Medições indisponíveis não significam uso zero nem capacidade ilimitada. Veja a [referência completa](./server-config-reference.md#namespace-durable-controls).

## Configuração do servidor {#server-configuration}

Defina limites globais quando todas as filas devam compartilhar o mesmo teto:

```bash
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=25
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=100
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=500
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=2000
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE=600
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE=1200
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=12000
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=24000
DW_QUERY_TASK_MAX_PENDING_PER_QUEUE=1024
```

Limites de fila protegem uma fila de tarefas. Limites de namespace protegem o total do tenant em todas as filas do namespace, o que é útil quando um tenant pode distribuir trabalho entre várias filas, mas ainda compartilha uma única cota downstream. Limites de grupo de orçamento protegem uma dependência downstream nomeada entre filas selecionadas sem limitar todas as filas do namespace.

Use `DW_TASK_QUEUE_ADMISSION_OVERRIDES` quando filas ou namespaces específicos precisarem de orçamentos diferentes. As chaves são verificadas nesta ordem: `namespace:task_queue`, `namespace:*`, `task_queue` e depois `*`.

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "workflow_tasks": {
      "max_active_leases_per_queue": 8,
      "max_dispatches_per_minute": 120,
      "dispatch_budget_group": "downstream-openai",
      "max_dispatches_per_minute_per_budget_group": 600
    },
    "activity_tasks": {
      "max_active_leases_per_queue": 12,
      "max_dispatches_per_minute": 240
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 300,
      "max_dispatches_per_minute_per_namespace": 6000
    },
    "activity_tasks": {
      "max_active_leases_per_namespace": 1200,
      "max_dispatches_per_minute_per_namespace": 12000
    }
  },
  "email": {
    "activity_tasks": {
      "max_active_leases_per_queue": 4,
      "max_dispatches_per_minute": 60,
      "dispatch_budget_group": "downstream-sendgrid",
      "max_dispatches_per_minute_per_budget_group": 300
    }
  },
  "*": {
    "workflow_tasks": { "max_active_leases_per_queue": 50 }
  }
}'
```

O valor de substituição também aceita `max_active_leases` como alias de `max_active_leases_per_queue` e `budget_group` como alias de `dispatch_budget_group`.

O cache deve suportar locks atômicos para limites de leases ativos no servidor, limites de taxa de despacho e admissão de tarefas de consulta. Contadores de taxa de despacho são intervalos de um minuto de curta duração criados somente para filas limitadas que realmente concedem leases de tarefas. Redis é o armazenamento de cache recomendado para implantações com vários nós.

## Registro de slots de worker {#worker-slot-registration}

Para dar aos handlers Python de workflow e atividade recursos de processo
independentes, use o [exemplo de processos de worker separados](https://python.durable-workflow.com/guides/separate-workers/).
Escolha as listas de handlers registrados para separar papéis. Mantenha ambos
os valores de concorrência positivos e aplique limites no servidor quando o
total entre processos precisar ser limitado.

Workers Python expõem semáforos locais por `Worker(...)` e enviam os mesmos valores durante o registro:

```python
worker = Worker(
    client,
    task_queue="payments",
    workflows=[PaymentWorkflow],
    activities=[charge_card, send_receipt],
    max_concurrent_workflow_tasks=8,
    max_concurrent_activity_tasks=12,
)
```

Para workers HTTP personalizados, envie os campos de slots a `POST /api/worker/register`:

```json
{
  "worker_id": "payments-python-1",
  "task_queue": "payments",
  "runtime": "python",
  "supported_workflow_types": ["payments.PaymentWorkflow"],
  "supported_activity_types": ["payments.charge_card", "payments.send_receipt"],
  "max_concurrent_workflow_tasks": 8,
  "max_concurrent_activity_tasks": 12
}
```

Slots de worker sozinhos não são um orçamento rígido de tenant. Eles descrevem o que os workers ativos podem processar atualmente. Adicione limites no servidor quando precisar de um teto para toda a fila que continue válido se mais workers forem implantados.

## Inspecionar a admissão {#inspect-admission}

Use a CLI ao depurar:

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

O servidor expõe os mesmos dados por:

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

Um payload de admissão tem três seções:

```json
{
  "workflow_tasks": {
    "status": "throttled",
    "active_worker_count": 3,
    "configured_slot_count": 24,
    "leased_count": 8,
    "ready_count": 5,
    "available_slot_count": 16,
    "server_max_active_leases_per_queue": 8,
    "server_active_lease_count": 8,
    "server_remaining_active_lease_capacity": 0,
    "server_max_active_leases_per_namespace": 300,
    "server_namespace_active_lease_count": 149,
    "server_remaining_namespace_active_lease_capacity": 151,
    "server_max_dispatches_per_minute": 120,
    "server_dispatch_count_this_minute": 120,
    "server_remaining_dispatch_capacity": 0,
    "server_max_dispatches_per_minute_per_namespace": 6000,
    "server_namespace_dispatch_count_this_minute": 3520,
    "server_remaining_namespace_dispatch_capacity": 2480,
    "server_dispatch_budget_group": "downstream-openai",
    "server_max_dispatches_per_minute_per_budget_group": 600,
    "server_budget_group_dispatch_count_this_minute": 600,
    "server_remaining_budget_group_dispatch_capacity": 0,
    "server_lock_required": true,
    "server_lock_supported": true,
    "budget_source": "worker_registration.max_concurrent_workflow_tasks",
    "server_budget_source": "server.admission.queue_overrides"
  },
  "activity_tasks": {
    "status": "accepting",
    "configured_slot_count": 36,
    "server_max_active_leases_per_queue": 12,
    "server_remaining_active_lease_capacity": 4,
    "server_max_dispatches_per_minute": 240,
    "server_remaining_dispatch_capacity": 197
  },
  "query_tasks": {
    "status": "accepting",
    "max_pending_per_queue": 1024,
    "approximate_pending_count": 7,
    "remaining_pending_capacity": 1017,
    "lock_supported": true,
    "budget_source": "server.query_tasks.max_pending_per_queue"
  }
}
```

## Referência de estados {#status-reference}

| Seção | Estado | Significado |
|---------|--------|---------|
| Workflow/atividade | `accepting` | Workers ativos têm slots disponíveis e nenhum limite do servidor está esgotado. |
| Workflow/atividade | `throttled` | O limite opcional de leases ativos ou de despachos por minuto no servidor está esgotado. |
| Workflow/atividade | `saturated` | Todos os slots registrados dos workers estão sob lease, mesmo sem limite configurado no servidor. |
| Workflow/atividade | `no_slots` | Workers ativos registraram zero slots para esse tipo de tarefa. |
| Workflow/atividade | `no_active_workers` | Nenhum worker ativo e não desatualizado está fazendo poll nessa fila. |
| Workflow/atividade | `unavailable` | Um limite configurado no servidor precisa de um lock de cache, mas o lock está indisponível. |
| Consulta | `accepting` | A fila de tarefas de consulta pendentes tem capacidade restante. |
| Consulta | `full` | As tarefas de consulta pendentes atingiram `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`; novas consultas retornam HTTP `429`. |
| Consulta | `unavailable` | A fila de tarefas de consulta não consegue adquirir seu lock de cache; novas consultas retornam HTTP `503`. |

## Padrão de ajuste {#tuning-pattern}

1. Comece com slots de worker dimensionados para o processo: tarefas de workflow intensivas em CPU normalmente têm menos slots que tarefas de atividade intensivas em E/S.
2. Adicione limites de leases ativos para filas que precisam de um teto de trabalho em andamento entre todos os workers.
3. Adicione limites de leases ativos para todo o namespace quando um tenant puder criar muitas filas, mas ainda precisar de um teto total de trabalho em andamento.
4. Adicione limites de despachos por minuto para filas que protegem uma API externa com limite de taxa, pool de banco, tenant ou serviço legado contra picos, mesmo quando workers têm slots livres.
5. Adicione limites de despacho por grupo de orçamento quando várias filas compartilharem uma dependência downstream, mas filas não relacionadas no namespace devam continuar fluindo.
6. Adicione limites de despacho para todo o namespace quando a cota downstream for do tenant, e não específica de uma fila.
7. Inspecione `dw task-queue:describe <queue>` durante a carga. `saturated` significa adicionar capacidade de workers ou reduzir o fan-out do workflow. `throttled` significa que um limite de leases ativos ou taxa de despacho está cumprindo sua função. `no_active_workers` significa que a fila não tem poller saudável.
8. Mantenha a capacidade de tarefas de consulta grande o suficiente para leituras normais de operadores, mas baixa o suficiente para falhar rapidamente durante incidentes. O transbordamento de tarefas de consulta é controle de pressão, não perda de dados.

## Guias relacionados {#related-guides}

- [Server](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [SDK Python](/docs/polyglot/python)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
