---
sidebar_position: 7
title: Despliegue de workers por build id
description: Despliega, prueba con canary, drena y revierte versiones de workers sin bloquear ejecuciones mediante el estado de despliegue por build id del servidor independiente.
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - despliegue de workers por build id
  - drenaje de versión de worker
  - reversión de versión de worker
  - workers canary
  - transición de workers sin versión a versionados
---

# Despliegue de workers por build id {#worker-build-id-rollout}

Utiliza esta referencia para pasar de workers sin versión a workers etiquetados,
probar una nueva versión con canary en una cola, drenar una versión antigua
antes de retirarla o revertir una defectuosa. El servidor registra la intención
del operador junto a las filas de workers activos para que el siguiente sondeo,
describe de la CLI o llamada `list_task_queue_build_ids` refleje fielmente el
estado del despliegue, incluso si desaparecen los workers antiguos antes de
drenar su trabajo acumulado.

Esta guía trata del control de cohortes, no del contrato completo de enrutamiento.
Consulta [Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing)
para la regla que vincula el trabajo en curso a ejecutores compatibles y hace
de su ausencia un estado explícito para el operador.

El servidor expresa el despliegue de una cola como un conjunto de **cohortes por
build id**. Una cohorte agrupa los registros de workers que declararon el mismo
`build_id` en `POST /api/worker/register`. Los workers que omiten `build_id`
forman la **cohorte sin versión**, predeterminada antes del despliegue y desde
la que se realiza la primera transición.

## Estado de despliegue registrado por el servidor {#rollout-state-the-server-records}

Cada cohorte `(namespace, task_queue, build_id)` contiene el estado agregado de
workers (activos, drenando, obsoletos y total) y la intención del operador:

| Campo | Finalidad |
| --- | --- |
| `build_id` | Identidad de versión registrada. `null` identifica la cohorte sin versión. |
| `rollout_status` | Vista agregada de lo que hará la cohorte con tareas nuevas: `active`, `active_with_draining`, `draining`, `stale_only` o `no_workers`. |
| `drain_intent` | Intención del operador para la cohorte: `active` o `draining`. |
| `drained_at` | Momento en que se marcó por primera vez el drenaje. Ausente mientras está activa. Repetir el drenaje no cambia esta marca de tiempo. |
| `active_worker_count` | Workers activos que aceptan nuevas tareas. |
| `draining_worker_count` | Workers activos con tareas en curso que ya no reclaman trabajo nuevo. |
| `stale_worker_count` | Workers cuyo último latido es anterior al umbral de obsolescencia. |
| `total_worker_count` | Suma de las tres poblaciones de la cohorte. |
| `runtimes`, `sdk_versions` | Cadenas distintas de runtime y versión de SDK observadas en la cohorte. |
| `last_heartbeat_at`, `first_seen_at` | Ventana de latidos de toda la cohorte, útil para confirmar su inactividad antes de eliminarla. |

`drain_intent` es persistente: reiniciar un worker, detenerlos todos o dejar que
la cohorte quede obsoleta no la devuelve silenciosamente a `active`. Solo un
`POST .../build-ids/resume` explícito borra `drain_intent` y `drained_at`.
Así `rollout_status` sigue siendo fiel incluso cuando no quedan workers activos.

## Inspeccionar el despliegue {#inspect-the-rollout}

Antes de drenar o eliminar una versión, confirma qué cohortes siguen accesibles
en la cola:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

La misma instantánea está disponible en la CLI de operador y el SDK de Python:

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

## Primera transición: de sin versión a versionado {#first-cutover-unversioned-to-versioned}

Una cola atendida siempre por workers sin versión muestra una única cohorte
`build_id: null` con `rollout_status: "active"`. La primera transición incorpora
una cohorte etiquetada junto a ella.

1. Despliega la nueva flota con un `build_id` estable (por ejemplo,
   `orders-worker-2026-04-22`) registrado mediante
   `POST /api/worker/register`.
2. Confirma que ambas cohortes están activas:
   ```bash
   dw task-queue:build-ids orders-critical --json
   ```
   Debes ver `null` y el nuevo `build_id`, ambos con
   `rollout_status: "active"` y `active_worker_count` distinto de cero.
3. Inicia el drenaje de la cohorte sin versión cuando los nuevos workers
   estén procesando trabajo:
   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```
   `drain_intent` pasa a `draining` para la cohorte sin versión. Los workers
   que siguen ejecutándose procesan sus tareas en curso pero dejan de reclamar
   tareas nuevas. Los futuros registros o latidos sin `build_id` también
   quedan en drenaje.
4. Espera a que `active_worker_count` y `draining_worker_count` sean cero en
   la cohorte sin versión. Seguirá apareciendo con `drain_intent: "draining"`
   para que puedas confirmar que la transición es permanente.

## Probar una nueva versión con canary {#canary-a-new-build}

Un canary es una segunda versión que recibe una pequeña fracción del tráfico
mientras la principal sigue atendiendo. Utiliza un `build_id` distinto para
inspeccionar el estado de cada cohorte de forma independiente.

1. Despliega los workers canary con `build_id: orders-worker-2026-04-22-canary`.
2. Inspecciona `list_task_queue_build_ids` para confirmar que ambas cohortes
   muestran `rollout_status: "active"` y los recuentos de workers esperados.
3. Promueve la versión iniciando más workers con el nuevo `build_id` y
   reduciendo los de la principal, o retira el canary drenándolo:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

El servidor no controla el reparto de tareas entre cohortes. Los operadores
dimensionan sus poblaciones y utilizan la distribución del sondeo para ponderar
el tráfico. El estado de despliegue permite confirmar qué cohortes aún pueden
reclamar trabajo y efectuar un traspaso limpio cuando una esté lista para detenerse.

## Drenar una versión antigua {#drain-an-older-build}

El drenaje mantiene las tareas ya arrendadas en la versión antigua mientras las
nuevas pasan a otras cohortes activas de la cola:

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

El servidor fija `drain_intent: "draining"` en la cohorte y marca cada worker de
ese `build_id` como drenando en su siguiente latido. La llamada es idempotente:
repetirla no restablece `drained_at`, por lo que es seguro reintentar desde una automatización.

Cuando una fila de worker queda en `draining`, las rutas de sondeo de tareas de
workflow, actividad y consulta dejan de arrendarle trabajo nuevo. Los sondeos
fallan con HTTP `409`, `poll_status: "draining"` y `reason: "worker_draining"`
hasta que se reanuda la cohorte.

`draining` forma parte del contrato general de respuesta al sondeo, no es un
campo exclusivo del drenaje. Mediante el mismo `poll_status`, los workers
observan los sondeos normales `leased` y `empty`, los resultados de admisión
`throttled` y los fallos tipados de coordinación `unavailable` en otras rutas.

Supervisa el drenaje sondeando `list_task_queue_build_ids` y observando cómo
`active_worker_count` y `draining_worker_count` bajan a cero. Entonces la cohorte
muestra `rollout_status: "draining"` sin workers: no quedan workers activos y la
intención del operador sigue registrando el drenaje. Ese es el momento seguro
para detener los procesos de worker y eliminar el artefacto de la versión.

## Revertir una versión defectuosa {#roll-back-a-bad-build}

La reversión sigue el flujo inverso: reanuda una cohorte drenada, vuelve a
dirigirle tráfico nuevo y drena la versión defectuosa.

1. Reanuda la cohorte conocida como válida:
   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```
   El servidor borra `drain_intent` y `drained_at`, y devuelve inmediatamente
   a `active` las filas de workers que siguen enviando latidos con ese
   `build_id`, para que el endpoint de lectura deje de mostrar drenaje.
2. Drena la cohorte defectuosa:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```
3. Vuelve a aumentar los workers de la versión válida o redespliégala si ya
   se detuvieron. Los workers que se registren con su `build_id` recogen la
   intención de drenaje borrada y quedan como `active`.

La reanudación también es idempotente. Repetirla sobre una cohorte ya activa no
cambia nada, por lo que los flujos automáticos de reversión pueden utilizarla con seguridad.

## Referencia de endpoints y comandos {#endpoints-and-commands-reference}

| Intención | Endpoint HTTP | CLI | Método del SDK de Python |
| --- | --- | --- | --- |
| Inspeccionar el estado de la cohorte | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Marcar el drenaje de una cohorte | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Reanudar una cohorte drenada | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

El drenaje y la reanudación reciben un cuerpo JSON `{"build_id": "..."}`, o
`{"build_id": null}` para la cohorte sin versión. La CLI utiliza `--unversioned`
para esta cohorte y `--build-id <value>` para las demás; combinar ambos produce
un error inmediato.

## Referencias relacionadas {#related-references}

- [Espacios de nombres, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers)
  para la llamada `POST /api/worker/register` que fija `build_id` en cada worker.
- [Admisión en colas de tareas](/docs/polyglot/task-queue-admission) para los
  presupuestos de slots y despacho aplicables junto al estado del despliegue.
- [Referencia de la API del servidor](/docs/polyglot/server-api-reference) para
  todas las rutas del plano de control, sus roles y sus cabeceras de protocolo.
- [Referencia de comandos de la CLI](/docs/polyglot/cli-reference) para los
  argumentos y opciones de cada subcomando `dw task-queue:*`.
