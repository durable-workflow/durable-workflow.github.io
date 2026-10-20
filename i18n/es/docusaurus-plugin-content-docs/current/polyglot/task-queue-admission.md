---
sidebar_position: 6
title: Admisión en colas de tareas
description: Ajusta los slots de workers, los presupuestos de cola del servidor y la contrapresión de tareas de consulta en el servidor independiente.
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - admisión en colas de tareas
  - presupuesto de despacho
  - límites de cola
  - colas de workers acotadas
---

# Admisión en colas de tareas {#task-queue-admission}

La admisión en colas de tareas impide que una cola, un inquilino o una dependencia posterior consuma toda la flota de workers. Durable Workflow ofrece controles de admisión en tres capas:

- los registros de workers anuncian slots locales para workflows y actividades
- el servidor puede limitar los arrendamientos activos de workflows y actividades por espacio de nombres y cola
- el servidor puede limitar los despachos de workflows y actividades por minuto, espacio de nombres y cola
- el servidor puede limitar los despachos por minuto de grupos de presupuesto con nombre para dependencias posteriores compartidas por varias colas
- las tareas de consulta tienen una cola de pendientes acotada para que las lecturas síncronas fallen rápidamente en lugar de crecer sin límite

Utiliza controles de admisión cuando una cola dependa de un servicio con límite de tasa, varios inquilinos compartan servidor o los operadores necesiten demostrar por qué espera un workflow.

La admisión se aplica sobre el contrato de asignación. Consulta
[Asignación y despacho de tareas](/docs/polyglot/task-matching-dispatch) para
entender cómo se descubre y arrienda el trabajo listo antes de que estos
presupuestos decidan si puede pasar la siguiente tarea.

## Cómo se aplica el presupuesto {#how-the-budget-is-applied}

El sondeo de workflows y actividades parte de los workers registrados actualmente para un espacio de nombres y una cola de tareas. Cada worker anuncia `max_concurrent_workflow_tasks` y `max_concurrent_activity_tasks`; el servidor suma los workers activos y no obsoletos para calcular la capacidad de slots registrada de la cola.

Los límites de arrendamientos activos y tasa de despacho del servidor son opcionales. Cuando están configurados, el servidor comprueba un bloqueo de caché de corta duración antes de arrendar la siguiente tarea de workflow o actividad. Si se ha alcanzado el límite de arrendamientos activos, ese sondeo no devuelve una tarea en lugar de superar el presupuesto de trabajo en curso. Si se ha alcanzado el límite de despachos por minuto, el sondeo no devuelve tareas hasta que el siguiente intervalo de un minuto tenga capacidad. Los grupos de presupuesto de dependencias posteriores aplican el mismo comportamiento por minuto a todas las colas del espacio de nombres que compartan un nombre `dispatch_budget_group`.

Las tareas de consulta son diferentes: el plano de control encola una tarea de consulta efímera y espera la respuesta de un worker. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` limita las tareas de consulta pendientes por espacio de nombres y cola. Si la cola está llena, las nuevas consultas devuelven `query_task_queue_full` con HTTP `429`. Si el almacenamiento de caché no proporciona el bloqueo necesario para modificar la cola de consultas, devuelven `query_task_queue_unavailable` con HTTP `503`.

## Configuración del servidor {#server-configuration}

Configura límites globales cuando todas las colas deban tener el mismo techo:

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

Los límites de cola protegen una cola de tareas. Los límites de espacio de nombres protegen el total del inquilino en todas sus colas, algo útil si puede distribuir trabajo entre muchas colas pero comparte una cuota de una dependencia posterior. Los límites de grupos de presupuesto protegen una dependencia posterior con nombre entre colas seleccionadas sin limitar todas las colas del espacio de nombres.

Utiliza `DW_TASK_QUEUE_ADMISSION_OVERRIDES` cuando ciertas colas o espacios de nombres necesiten presupuestos distintos. Las claves se comprueban en este orden: `namespace:task_queue`, `namespace:*`, `task_queue` y, por último, `*`.

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

El valor de personalización también acepta `max_active_leases` como alias de `max_active_leases_per_queue` y `budget_group` como alias de `dispatch_budget_group`.

La caché debe admitir bloqueos atómicos para los límites de arrendamientos activos, la tasa de despacho y la admisión de consultas del servidor. Los contadores de despacho son intervalos de un minuto de corta duración creados solo para colas limitadas que realmente arriendan tareas. Redis es el almacenamiento de caché recomendado para despliegues de varios nodos.

## Registro de slots de workers {#worker-slot-registration}

Para dar a los manejadores Python de workflows y actividades recursos de proceso
independientes, utiliza el [ejemplo de procesos de worker separados](https://python.durable-workflow.com/guides/separate-workers/).
Separa las funciones mediante las listas de manejadores registrados. Mantén
positivos ambos valores de concurrencia y aplica límites de servidor cuando
debas acotar el total entre procesos.

Los workers de Python ofrecen semáforos locales mediante `Worker(...)` y envían esos mismos valores al registrarse:

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

Para workers HTTP propios, envía los campos de slots a `POST /api/worker/register`:

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

Por sí solos, los slots de workers no son un presupuesto estricto del inquilino. Describen lo que los workers activos pueden procesar actualmente. Añade límites de servidor si necesitas un techo para toda la cola que se mantenga aunque se desplieguen más workers.

## Inspeccionar la admisión {#inspect-admission}

Utiliza la CLI para diagnosticar problemas:

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

El servidor ofrece los mismos datos mediante:

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

La carga útil de admisión tiene tres secciones:

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

## Referencia de estados {#status-reference}

| Sección | Estado | Significado |
|---------|--------|---------|
| Workflow/actividad | `accepting` | Los workers activos tienen slots disponibles y no se ha alcanzado ningún límite del servidor. |
| Workflow/actividad | `throttled` | Se ha alcanzado el límite opcional del servidor de arrendamientos activos o despachos por minuto. |
| Workflow/actividad | `saturated` | Todos los slots registrados están arrendados, incluso si no hay límites del servidor. |
| Workflow/actividad | `no_slots` | Los workers activos registraron cero slots para ese tipo de tarea. |
| Workflow/actividad | `no_active_workers` | Ningún worker activo y no obsoleto está sondeando esa cola. |
| Workflow/actividad | `unavailable` | Un límite configurado del servidor necesita un bloqueo de caché que no está disponible. |
| Consulta | `accepting` | La cola de tareas de consulta pendientes tiene capacidad restante. |
| Consulta | `full` | Las tareas de consulta pendientes alcanzaron `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`; las nuevas consultas devuelven HTTP `429`. |
| Consulta | `unavailable` | La cola de consultas no puede adquirir su bloqueo de caché; las nuevas consultas devuelven HTTP `503`. |

## Patrón de ajuste {#tuning-pattern}

1. Dimensiona los slots del worker según el proceso: las tareas de workflow limitadas por CPU suelen requerir menos que las actividades con mucha E/S.
2. Añade límites de arrendamientos activos a las colas que necesiten un techo de trabajo en curso entre todos sus workers.
3. Añade límites de arrendamientos activos por espacio de nombres si un inquilino puede crear muchas colas pero necesita un techo total.
4. Añade límites de despachos por minuto a las colas que protejan una API externa con límite de tasa, un pool de base de datos, un inquilino o un servicio heredado frente a ráfagas, incluso si quedan slots libres.
5. Añade límites de despacho por grupo de presupuesto si varias colas comparten una dependencia posterior pero las colas no relacionadas deben seguir funcionando.
6. Añade límites de despacho por espacio de nombres si la cuota posterior corresponde a todo el inquilino y no a una cola concreta.
7. Inspecciona `dw task-queue:describe <queue>` bajo carga. `saturated` indica que debes añadir capacidad de workers o reducir el paralelismo del workflow. `throttled` indica que funciona un límite de arrendamientos activos o de tasa de despacho. `no_active_workers` indica que la cola no tiene ningún sondeador sano.
8. Mantén capacidad suficiente de consultas para las lecturas normales del operador, pero lo bastante baja para fallar rápidamente durante incidentes. El desbordamiento de consultas es contrapresión, no pérdida de datos.

## Guías relacionadas {#related-guides}

- [Servidor](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [SDK de Python](/docs/polyglot/python)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
