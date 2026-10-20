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
