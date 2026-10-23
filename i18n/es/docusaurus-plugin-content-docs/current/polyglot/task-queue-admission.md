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
- el servidor puede limitar las leases activas de workflows y actividades por espacio de nombres y cola
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

Los límites de leases activas y tasa de despacho del servidor son opcionales. Cuando están configurados, el servidor comprueba un bloqueo de caché de corta duración antes de asignar mediante una lease la siguiente tarea de workflow o actividad. Si se ha alcanzado el límite de leases activas, ese sondeo no devuelve una tarea en lugar de superar el presupuesto de trabajo en curso. Si se ha alcanzado el límite de despachos por minuto, el sondeo no devuelve tareas hasta que el siguiente intervalo de un minuto tenga capacidad. Los grupos de presupuesto de dependencias posteriores aplican el mismo comportamiento por minuto a todas las colas del espacio de nombres que compartan un nombre `dispatch_budget_group`.

Las tareas de consulta son diferentes: el plano de control encola una tarea de consulta efímera y espera la respuesta de un worker. `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` limita las tareas de consulta pendientes por espacio de nombres y cola. Si la cola está llena, las nuevas consultas devuelven `query_task_queue_full` con HTTP `429`. Si el almacenamiento de caché no proporciona el bloqueo necesario para modificar la cola de consultas, devuelven `query_task_queue_unavailable` con HTTP `503`.

## Carga de reintentos y presupuestos del servicio dependiente {#retry-load-and-downstream-budgets}

**Tanto los primeros intentos como los reintentos cuentan** en los límites de despacho por cola, namespace y grupo. El límite cubre intentos de tareas de actividad obtenidos correctamente entre workflows, no solo reintentos. Al llenarse, el trabajo espera; eso no hace fallar por sí solo la actividad. Los relojes schedule-to-start, schedule-to-close y los plazos del workflow siguen corriendo, por lo que la espera puede agotar un timeout.

El límite mide intentos por minuto, no proporción de éxitos ni salud del servicio. No abre un circuit breaker. Un intento puede realizar varias llamadas HTTP por reintentos internos de la actividad o cliente; limítelas aparte. Incluso un rechazo rápido consume un claim sin contactar al servicio.

Por ejemplo, en el namespace `production`, las colas de actividad normales `payments` y `refunds` comparten un presupuesto `payment-api` de 20 claims por minuto. Configure el mismo límite de grupo en todas las colas participantes; las demás no se incluyen. Es un techo por bloque de minuto, no una tasa uniforme ni una cuota reservada:

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

Combine el límite del Server con intentos y backoff acotados. Este ejemplo de Python SDK 2.9.0 supone que su aplicación proporciona un breaker compartido asíncrono y cliente de pagos mediante `myapp.payments`; configure I/O acotado e idempotencia estable en ese cliente. Registre `charge` en el worker de `payments` de `production`, y `PaymentWorkflow` en su worker de workflows:

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

Un breaker de aplicación abierto lanza `NonRetryableError` antes del pago; fallos de pago reintentables pueden usar como máximo tres intentos con el backoff definido. Los timeouts originales pueden vencer antes. El workflow puede capturar el fallo final según la lógica de negocio; un fallo final sin capturar puede cerrar el workflow. Elija aparte su plazo global.

Mantenga las llamadas protegidas en **actividades normales encoladas**. Las actividades locales inline no crean una tarea de actividad normal y los límites de despacho por cola/namespace/grupo no las miden. Un claim local preparado valida autoridad de ejecución, no este presupuesto. Laravel integrado no tiene admission del Server independiente; use sus controles de despliegue. Véanse [actividades locales](../features/local-activities.md).

## Admisión de peticiones por namespace {#namespace-request-admission}

Este contrato corresponde al **PHP Server 2.11.0** publicado. Comprueba tu imagen y la [referencia de configuración versionada](./server-config-reference.md#additional-published-php-controls). Los presupuestos HTTP son independientes de los slots de worker, el despacho, los polls retenidos y las cuotas duraderas. El presupuesto pertenece al namespace resuelto mediante `Durable-Workflow-Namespace` o `DW_DEFAULT_NAMESPACE`, incluso si una ruta administrativa nombra otro namespace.

Las peticiones autenticadas que alcanzan la admisión se contabilizan en estas familias de rutas de control y gestión, incluidos sus descendientes: `/api/namespaces`, `/api/storage`, `/api/workflows`, `/api/activities`, `/api/bridge-adapters`, `/api/workers`, `/api/worker-sessions`, `/api/task-queues`, `/api/deployments`, `/api/schedules`, `/api/search-attributes`, `/api/service-endpoints`, `/api/service-catalog`. Las rutas de gestión en plural `/api/workers` cuentan.

Las rutas en singular `/api/worker/*` de registro, polling y resultados no usan este presupuesto HTTP. Health/readiness, `/api/cluster/info`, las rutas admin `/api/system/*`, las credenciales runtime y el transporte de payload externo también quedan fuera; siguen aplicando sus propias comprobaciones de acceso, capacidad y almacenamiento. Los rechazos anteriores de autenticación, protocolo o resolución de namespace no llegan al contador.

La frecuencia usa buckets de minutos fijos según el reloj del Server, no un ritmo uniforme ni una ventana móvil. Un presupuesto N puede admitir N peticiones justo antes del límite y otras N después. Los fallos posteriores siguen contando; la frecuencia se admite antes de comprobar la concurrencia, por lo que un rechazo de concurrencia puede consumir presupuesto del minuto. El slot simultáneo se mantiene hasta finalizar la petición y liberar sus recursos; no cuenta workflows en ejecución.

Entre réplicas API, usa el mismo Redis compartido y prefijo de claves, relojes sincronizados y configuración cargada coherente. Añadir réplicas no multiplica el presupuesto compartido. Una caché local de archivos solo coordina procesos con acceso de escritura compatible; no es la configuración base multinodo. Los límites de polls worker/query retenidos por nodo son independientes. [Reinicia los roles afectados al cambiar el entorno](./server-config-reference.md#how-changes-take-effect).

```dotenv
DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE=100
DW_NAMESPACE_MAX_CONCURRENT_REQUESTS=8
DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE=150
DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS=10
DW_NAMESPACE_ADMISSION_OVERRIDES='{"payments":{"max_requests_per_minute":200,"max_concurrent_requests":12},"reports":{"max_requests_per_minute":40,"max_concurrent_requests":3}}'
```

Para namespaces existentes, el ejemplo resuelve `payments` a 150 peticiones/minuto y 10 simultáneas, `reports` a 40/3 y los demás a 100/8. Las excepciones pueden subir o bajar los valores predeterminados, pero siguen aplicándose los techos 150/10. Esta configuración no crea namespaces ni reserva rendimiento.

Para estos controles HTTP, un valor ausente no configura ese límite; un techo obligatorio por sí solo puede imponerlo. Una excepción null vuelve al valor predeterminado. Los valores deben ser enteros positivos: cero es inválido. Los techos de implementación PHP son 10000000 peticiones/minuto y 1024 simultáneas, independientemente de la capacidad real del pool HTTP. PHP 2.11.0 publicado interpreta silenciosamente JSON malformado en `DW_NAMESPACE_ADMISSION_OVERRIDES` como excepciones vacías y vuelve a los valores globales. Valida el JSON antes del despliegue; sin valores globales ni techos obligatorios se pierde el límite previsto. Esta [deficiencia confirmada del producto](https://github.com/durable-workflow/durable-workflow.github.io/issues/335#issuecomment-6369150521) sigue separada de la actualización documental.

| Motivo | HTTP | Espera sugerida en segundos |
| --- | --- | --- |
| `namespace_request_rate_exhausted` | `429` | Hasta el próximo minuto, 1–60 |
| `namespace_request_concurrency_exhausted` | `429` | 1 |
| `namespace_request_admission_unavailable` | `503` | 1 |

El JSON `retry_after_seconds` coincide con la cabecera `Retry-After`. Una coordinación configurada no disponible o límites numéricos inválidos rechaza con 503. Consulta las métricas admin del namespace aunque el presupuesto ordinario esté agotado; `dw_namespace_request_admission_rejections` expone los motivos acotados. Aplica una política limitada de retry/backoff del llamador e idempotencia; un resultado de transporte incierto no autoriza a repetir una escritura automáticamente. Consulta los [presupuestos de timeout](../deployment.md#worker-long-poll-timeout-budgets).

## Cuotas de estado duradero por namespace {#namespace-durable-state}

`DW_NAMESPACE_DURABLE_LIMITS` fija límites predeterminados de filas conservadas, `DW_NAMESPACE_DURABLE_OVERRIDES` los cambia por namespace y `DW_NAMESPACE_DURABLE_HARD_LIMITS` añade techos obligatorios. Los objetos vacíos no añaden límites. Las excepciones pueden subir o bajar valores; null vuelve al predeterminado. A diferencia de la admisión HTTP, una cuota duradera cero es válida e impide nuevas asignaciones. Aquí `payments` existente puede mantener 250 runs abiertos y los demás namespaces 100, bajo un techo de 500.

```dotenv
DW_NAMESPACE_DURABLE_LIMITS='{"max_open_workflow_runs":100,"max_open_workflow_run_waits":200,"max_pending_workflow_timers":200}'
DW_NAMESPACE_DURABLE_HARD_LIMITS='{"max_open_workflow_runs":500}'
DW_NAMESPACE_DURABLE_OVERRIDES='{"payments":{"max_open_workflow_runs":250}}'
```

Usa campos `max_<resource>` para los recursos siguientes. Cada fila cuenta en su namespace propietario o en el de su workflow/run asociado. Los totales conservados y los subconjuntos abiertos/pendientes tienen límites independientes. Se usan recuentos autoritativos de la base de datos, serializando las mutaciones mediante la fila del namespace.

| Recurso | Qué cuenta |
| --- | --- |
| `workflow_instances`, `workflow_runs` | Todas las filas conservadas de instancias/runs de workflow, incluidos runs terminales. |
| `open_workflow_runs` | Runs con estado `pending`, `running` o `waiting`. |
| `workflow_history_events`, `workflow_commands`, `workflow_tasks` | Filas conservadas de historial, comandos y tareas de workflow. |
| `pending_workflow_tasks` | Filas de tareas de workflow en cola con estado `ready`; los leases activos tienen controles separados. |
| `workflow_timers`, `pending_workflow_timers` | Todos los temporizadores conservados y el subconjunto `pending`, respectivamente. |
| `workflow_run_waits`, `open_workflow_run_waits` | Todas las esperas de run conservadas y el subconjunto `open`, respectivamente. |
| `schedules`, `schedule_history_events`, `worker_registrations` | Schedules, historial y registros de workers conservados; los registros obsoletos cuentan hasta borrarse. |
| `workflow_streams`, `workflow_stream_items` | Filas de streams duraderos y entrantes, y filas de sus elementos. |

Un padre que espera un hijo o una llamada de servicio sigue consumiendo un run abierto en su namespace. El hijo añade su run; si comparten namespace, planifica ambos runs abiertos y sus esperas/temporizadores. Una operación de servicio que crea un workflow consume filas en el namespace de ese workflow; signal/update sobre un run existente no crea automáticamente otro run. Los límites de llamadas de servicio y payload externo son independientes.

El agotamiento devuelve 429 `namespace_<resource>_exhausted`. Lee `retryable`: algunas cuotas no admiten reintento ni sugieren espera; los rechazos duraderos reintentables anuncian 60 segundos, sin prometer capacidad entonces. Si no puede evaluarse una cuota configurada, devuelve 503 `namespace_durable_state_quota_unavailable` con un segundo de espera. La presión de filas conservadas puede exigir retención o un cambio de capacidad/configuración, no un bucle de retries.

Selecciona el namespace mediante la cabecera al consultar métricas admin. `dw_namespace_durable_state_usage` y los campos JSON `limits`, `usage`, `remaining`, `configuration_status` y `measurement_status` muestran ese ámbito; el namespace pertenece a la petición, no es una etiqueta de métricas ilimitada. Una medición no disponible no significa uso cero ni capacidad ilimitada. Consulta la [referencia completa](./server-config-reference.md#namespace-durable-controls).

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

La caché debe admitir bloqueos atómicos para los límites de leases activas, la tasa de despacho y la admisión de consultas del servidor. Los contadores de despacho son intervalos de un minuto de corta duración creados solo para colas limitadas que realmente asignan tareas mediante leases. Redis es el almacenamiento de caché recomendado para despliegues de varios nodos.

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
| Workflow/actividad | `throttled` | Se ha alcanzado el límite opcional del servidor de leases activas o despachos por minuto. |
| Workflow/actividad | `saturated` | Todos los slots registrados están ocupados por leases, incluso si no hay límites del servidor. |
| Workflow/actividad | `no_slots` | Los workers activos registraron cero slots para ese tipo de tarea. |
| Workflow/actividad | `no_active_workers` | Ningún worker activo y no obsoleto está sondeando esa cola. |
| Workflow/actividad | `unavailable` | Un límite configurado del servidor necesita un bloqueo de caché que no está disponible. |
| Consulta | `accepting` | La cola de tareas de consulta pendientes tiene capacidad restante. |
| Consulta | `full` | Las tareas de consulta pendientes alcanzaron `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`; las nuevas consultas devuelven HTTP `429`. |
| Consulta | `unavailable` | La cola de consultas no puede adquirir su bloqueo de caché; las nuevas consultas devuelven HTTP `503`. |

## Patrón de ajuste {#tuning-pattern}

1. Dimensiona los slots del worker según el proceso: las tareas de workflow limitadas por CPU suelen requerir menos que las actividades con mucha E/S.
2. Añade límites de leases activas a las colas que necesiten un techo de trabajo en curso entre todos sus workers.
3. Añade límites de leases activas por espacio de nombres si un inquilino puede crear muchas colas pero necesita un techo total.
4. Añade límites de despachos por minuto a las colas que protejan una API externa con límite de tasa, un pool de base de datos, un inquilino o un servicio heredado frente a ráfagas, incluso si quedan slots libres.
5. Añade límites de despacho por grupo de presupuesto si varias colas comparten una dependencia posterior pero las colas no relacionadas deben seguir funcionando.
6. Añade límites de despacho por espacio de nombres si la cuota posterior corresponde a todo el inquilino y no a una cola concreta.
7. Inspecciona `dw task-queue:describe <queue>` bajo carga. `saturated` indica que debes añadir capacidad de workers o reducir el paralelismo del workflow. `throttled` indica que funciona un límite de leases activas o de tasa de despacho. `no_active_workers` indica que la cola no tiene ningún sondeador sano.
8. Mantén capacidad suficiente de consultas para las lecturas normales del operador, pero lo bastante baja para fallar rápidamente durante incidentes. El desbordamiento de consultas es contrapresión, no pérdida de datos.

## Guías relacionadas {#related-guides}

- [Servidor](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [SDK de Python](/docs/polyglot/python)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
