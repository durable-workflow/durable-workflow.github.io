---
sidebar_position: 7
title: Despliegue de identificadores de compilación de workers
description: Inspecciona cohortes, selecciona la compilación de los nuevos inicios y conserva capacidad para ejecuciones fijadas.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [compilación de workers, drenaje, reversión, canary, workers sin versión]
---

# Despliegue de identificadores de compilación de workers

Usa esta guía para inspeccionar cohortes, elegir la compilación de los nuevos workflows y mantener workers compatibles con las ejecuciones existentes. La promoción cambia la selección de nuevos inicios; el drenaje impide nuevas reclamaciones por esa cohorte. Ninguna operación migra ejecuciones ni demuestra que se pueda eliminar una compilación.

[Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing) explica la identidad de tareas, actividades, reintentos, hijos y continue-as-new. Una cohorte tiene el ámbito `(namespace, task_queue, build_id)`. Los registros sin `build_id` pertenecen a la cohorte sin versión, `null`.

## Estado de despliegue registrado por el servidor {#rollout-state-the-server-records}

| Campo | Significado |
| --- | --- |
| `build_id` | Identidad registrada; `null` es la cohorte sin versión. |
| `rollout_status` | `active`, `active_with_draining`, `draining`, `stale_only` o `no_workers`. |
| `drain_intent`, `drained_at` | Intención persistente y primera marca temporal del drenaje; repetirlo no cambia la marca. |
| `promoted_at`, `rolled_back_at` | Marcas persistentes de promoción y reversión. |
| `new_start_selected` | Cohorte seleccionada mediante promoción explícita. `false` no descarta la selección alternativa de una única cohorte descrita abajo. |
| `active_worker_count` | Registros recientes no drenados; no son plazas libres ni garantizan todos los tipos de workflow. |
| `draining_worker_count` | Registros recientes marcados para drenaje, sin nuevas reclamaciones; no necesariamente conservan una concesión. |
| `stale_worker_count` | Registros con heartbeat anterior a `stale_after_seconds`. |
| `total_worker_count` | Suma de registros activos, drenados y obsoletos. |
| `runtimes`, `sdk_versions` | Cadenas de runtime y SDK observadas en los registros. |
| `last_heartbeat_at`, `first_seen_at` | Actualidad y antigüedad del registro, no prueba de que no queden ejecuciones. |
| `pending_workflow_tasks` | Recuentos y diagnóstico de tareas de workflow, explicados abajo. |

La intención de drenaje persiste tras reinicios, ausencia de workers y heartbeats obsoletos. Solo la reanudación explícita la elimina; la ausencia no reactiva al worker.

## Inspeccionar el despliegue {#inspect-the-rollout}

Comprueba el namespace y la cola exactos antes de modificar capacidad:

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

La instantánea HTTP es la referencia para campos adicionales que el modelo de respuesta de un SDK antiguo podría omitir.

## Tareas de workflow pendientes por cohorte {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks` cuenta únicamente tareas de workflow de este namespace y cola, agrupadas por compatibilidad efectiva de la tarea, recurriendo a la de su ejecución. No es la cola de actividades, el número de ejecuciones abiertas, el rendimiento ni la carga de procesos.

| Subcampo | Interpretación |
| --- | --- |
| `ready_count` | Filas de tareas de workflow en estado `ready`. |
| `leased_count` | Filas en estado `leased`. |
| `total_count` | `ready_count + leased_count`. |
| `status` | `idle` sin tareas; en otro caso `pending`, o `no_compatible_worker` para una compilación no nula sin worker activo. |
| `operator_visible_signal`, `message` | Diagnóstico cuando faltan workers compatibles; en otro caso pueden ser nulos. |

La cohorte sin versión no recibe ese diagnóstico específico de compilación. Un campo ausente, una petición fallida o una observación antigua no equivale a cero. Vuelve a leer la instantánea y comprueba heartbeats y declaraciones de tipos.

La compilación antigua puede tener dos tareas listas y una arrendada mientras la nueva no tiene pendientes. Un total de tres en la cola no identifica qué flota necesita capacidad. Si la antigua no tiene workers activos, restaura su capacidad compatible o reanúdala si se drenó por error. Añadir workers nuevos no consume trabajo fijado a la antigua. Si solo hay registros obsoletos, investiga procesos o heartbeats perdidos antes de contarlos como capacidad disponible.

Reduce cada cohorte con cautela tras revisar sus tareas, workers recientes, tipos declarados, plazas disponibles e intención de drenaje. Conserva capacidad para concesiones y futuras tareas de ejecuciones existentes. Una ejecución que espera señal, temporizador, actividad o hijo puede no tener tareas de workflow ahora y necesitar la compilación antigua después. Las actividades pueden utilizar otras colas registradas. Este endpoint no determina la retirada segura ni autoriza reducir a cero la última cohorte necesaria.

[Server #519](https://github.com/durable-workflow/server/issues/519) sigue la decisión protegida de retirada; [Server #534](https://github.com/durable-workflow/server/issues/534), la capacidad separada de recolección y reducción a cero. Esta lista no entrega esas funciones ni documenta un activador KEDA/HPA integrado.

## Primer cambio de sin versión a versionado {#first-cutover-unversioned-to-versioned}

1. Inicia los nuevos workers con una identidad estable y verifica namespace, cola, tipos y heartbeats recientes.
2. Inspecciona ambas cohortes y las ejecuciones originales. Un nombre más nuevo o un número de workers no demuestra compatibilidad.
3. Promueve explícitamente la compilación cuando deban seleccionarla los nuevos inicios:

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. Mantén workers compatibles con los historiales existentes. La promoción no modifica fijaciones antiguas; drenar no es migrar.
5. Retira capacidad antigua solo cuando se hayan resuelto independientemente sus dependencias restantes. Los contadores vacíos o cero registros no bastan. Conserva el artefacto y la recuperación mientras alguna ejecución pueda necesitarlo.

## Canary de una compilación nueva {#canary-a-new-build}

El servidor no ofrece reparto porcentual entre cohortes. Los nuevos inicios seleccionan la cohorte promovida más recientemente que no esté drenada ni revertida. Si no existe, seleccionan la única cohorte activa que declara el tipo solicitado y, después, la única activa de la cola. Si sigue habiendo ambigüedad, la ejecución queda sin fijar. Varias cohortes activas del mismo tipo sin promoción no implican un reparto ponderado.

Añadir workers cambia la capacidad, no la política de selección promovida. Para aislar un canary, usa una cola separada y dirige explícitamente a ella algunos inicios de la aplicación. Al promover en la cola original, conserva workers antiguos para las ejecuciones ya fijadas.

## Drenar una compilación antigua {#drain-an-older-build}

El drenaje impide que los polls de workflow, actividad y query de la cohorte reclamen trabajo nuevo; no traslada tareas. Un poll de un worker drenado recibe HTTP409 con `poll_status: "draining"` y `reason: "worker_draining"`. Las concesiones existentes conservan su autoridad original.

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

No lo hagas solo porque la nueva compilación pueda reclamar su propio trabajo: las ejecuciones antiguas pueden quedarse esperando. Para recuperar un drenaje prematuro, reanuda la cohorte y restaura workers con la compilación original:

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

Drenar o detener todos los workers no demuestra que se pueda eliminar el artefacto. Esta instantánea no incluye una decisión protegida de retirada.

## Revertir una compilación defectuosa {#roll-back-a-bad-build}

Restaura workers conocidos como correctos, reanuda su cohorte si hace falta y promueve esa compilación para futuros inicios. Después revierte el despliegue defectuoso. La reversión no reescribe fijaciones ni entrega su trabajo restante a otra compilación. Conserva workers compatibles o toma una decisión explícita de recuperación en la aplicación.

Los reintentos, hijos y continue-as-new heredan la fijación original. Una cadena continuada indefinidamente no migra a la compilación recién promovida. Usa una identidad estable para despliegues compatibles con replay, o termina la cadena antigua y crea una instancia realmente nueva bajo la nueva selección. No edites campos persistidos de compatibilidad para forzar la migración.

## Referencia de endpoints y comandos {#endpoints-and-commands-reference}

| Intención | Endpoint HTTP | CLI | Método del SDK Python |
| --- | --- | --- | --- |
| Inspeccionar cohortes | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Seleccionar nuevos inicios | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drenar | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Reanudar | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Estas mutaciones aceptan `{"build_id":"orders-v2"}` o `{"build_id":null}` para la cohorte sin versión. Los comandos CLI usan `--build-id` o `--unversioned`, nunca ambos.

Para el ciclo completo usa `GET /api/deployments` y `POST /api/deployments/{name}/{promote,drain,resume,rollback}`. Usa el nombre devuelto, por ejemplo `orders-prod/orders-critical@orders-v2`, con su namespace original. En la ruta Apache publicada, conserva la barra separadora: codificar el nombre compuesto completo puede producir una HTML404 de Apache antes de llegar a la API. Las acciones rechazadas devuelven HTTP409 con `reason` tipado y un array `blockages`. Revisa `expected_resolution`; un rechazo no es una promoción correcta. [Server #521](https://github.com/durable-workflow/server/issues/521) sigue el espejo OpenAPI actual incompleto, no una implementación nueva ni un cambio de esquemas congelados.

## Referencias relacionadas {#related-references}

- [Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing)
- [Namespace, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers)
- [Admisión de colas de tareas](/docs/polyglot/task-queue-admission)
- [Actualizaciones graduales](/docs/rolling-upgrades)
- [Referencia de la API Server](/docs/polyglot/server-api-reference)
- [Referencia de comandos CLI](/docs/polyglot/cli-reference)
