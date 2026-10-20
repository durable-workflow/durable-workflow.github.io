---
sidebar_position: 24
title: Sesiones de worker
description: Fija una secuencia de intentos de actividad duraderos a una lease de sesión de worker para afinidad con GPU, sistema de archivos o estado local al proceso.
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - sesiones de worker
  - afinidad de actividad
  - workers con GPU
  - workers con archivos locales
  - sesiones del protocolo de workers
---

# Sesiones de worker {#worker-sessions}

Las sesiones de worker son la primitiva v2 de afinidad de actividades. Úsalas cuando varios pasos duraderos deban reutilizar estado local al proceso, memoria GPU, un sistema de archivos montado u otro recurso local al worker.

## Resumen del contrato {#contract-summary}

- Una sesión tiene un único propietario de la lease a la vez.
- La primera actividad admitida en la sesión crea o readquiere la lease.
- Los latidos de actividad renuevan las leases del intento y de la sesión.
- `POST /api/worker/sessions`, `POST /api/worker/sessions/{sessionId}/heartbeat` y `DELETE /api/worker/sessions/{sessionId}` exponen operaciones explícitas del ciclo de vida para workers externos.
- Primero se aplica el enrutamiento por colas; la admisión de sesión ocurre después de registrar el worker para la cola de tareas.
- Las `capabilities` del registro deben cumplir todos los requisitos de la sesión.
- Las sesiones caducadas y huérfanas son visibles para operadores y pueden readquirirse si permiten recuperación tras fallos.

## API de autoría {#authoring-api}

En PHP, crea una referencia de sesión con `Workflow::workerSession()` o `Workflow\V2\workerSession()` y programa actividades mediante ella:

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

La instantánea de opciones guarda el mismo contrato en `activity_options.worker_session`. Los runtimes externos usan la misma estructura JSON bajo `worker_session` en un comando `schedule_activity` de tarea de workflow.

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Ciclo de vida {#lifecycle}

La creación es diferida. La capa de asignación crea o readquiere la sesión cuando la primera tarea de actividad de la sesión se admite en un worker capaz. Un worker también puede crearla explícitamente antes de consultar tareas mediante `POST /api/worker/sessions`.

Una sesión activa termina cuando su titular la cierra, caduca la lease o el TTL absoluto, o se detecta un fallo del worker titular. La caducidad del TTL y el cierre explícito son terminales para ese id de sesión. Tras caducar la lease o detectar una sesión huérfana se puede readquirir si `allow_reacquire_after_failure` es `true`.

## Lease y propiedad {#lease-and-ownership}

Como máximo, un worker posee la lease a la vez. El servidor solo admite tareas de actividad de la sesión si se cumple una de estas condiciones:

- no existe la sesión y `create_if_missing` es `true`;
- la sesión activa ya pertenece al worker que consulta;
- la sesión ha caducado, fallado o quedado huérfana y se permite readquirirla.

La propiedad de sesión no sustituye la lease de cada intento de actividad. Cada uno conserva su `activity_attempt_id`, propietario, latidos y rutas de finalización, fallo, vencimiento y cancelación.

## Admisión y enrutamiento {#admission-and-routing}

Las sesiones participan en el enrutamiento normal por colas. `WorkerSessionOptions` puede establecer `connection` y `queue`; `ActivityOptions` por llamada aún puede sustituirlos. El servidor aplica la admisión específica de sesión después de la admisión normal en la cola:

- las `capabilities` registradas deben cubrir todos los requisitos de la sesión;
- `max_concurrent_activities` limita los intentos de actividad con lease dentro de la sesión;
- `max_concurrent_worker_sessions` limita las leases de sesión activas de un registro de worker.

El enrutamiento específico de flota usa cadenas de capacidades simples como `gpu:nvidia-l4`, `gpu:a100`, `fs:/mnt/models` o `zone:us-east-1a`.

## Fallos, cancelación y apagado {#failure-cancellation-and-shutdown}

Los latidos renuevan las leases del intento y de la sesión. Los workers también pueden renovar la sesión directamente mediante el protocolo. Si caduca su lease, pasa a `expired`; si el latido del registro del worker titular está obsoleto o ausente, pasa a `orphaned`.

Si el worker muere a mitad de la secuencia, las actividades en curso conservan el comportamiento de al menos una vez: sus leases caducan, la reparación vuelve a permitir reclamarlas y se puede rechazar una finalización obsoleta. Un worker capaz puede readquirir la sesión si el contrato lo permite. El workflow debe prever reconstruir el estado local tras la readquisición.

La cancelación del workflow sigue propagándose mediante las respuestas a latidos. Una lease de sesión nunca autoriza a una actividad a ignorar `cancel_requested`. Un apagado planificado debe cerrar las sesiones mediante `DELETE /api/worker/sessions/{sessionId}` antes de detener el proceso; las actividades en curso siguen completándose, fallando, cancelándose o caducando bajo sus propias leases de intento.

## Visibilidad {#visibility}

Las capacidades del protocolo anuncian `worker_session_verbs` y el contrato de runtime `worker_sessions` mediante `GET /api/cluster/info` y cada respuesta del plano de workers. El contrato legible por máquinas se publica en [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json) y aparece en el catálogo de [Especificaciones del protocolo de la plataforma](/docs/platform-protocol-specs#worker-session-runtime-notes).

Los operadores pueden listar sesiones activas, cerradas, caducadas, fallidas y huérfanas en `GET /api/worker-sessions`. El detalle incluye id, titular, cola, requisitos, caducidades de lease y TTL, cantidad de actividades activas y motivo del fallo. Las métricas del sistema incluyen contadores por estado de sesión.

## Elegir sesiones de worker {#choosing-worker-sessions}

Prefiere actividades ordinarias en cola si cada paso es independiente. Prefiere una actividad más grande si toda la operación es un solo efecto secundario atómico. Usa sesiones solo cuando varios pasos duraderos deban reutilizar un recurso local al worker y el workflow tolere reconstruirlo tras un fallo.

Consulta cómo se relacionan con las actividades ordinarias, locales y la ejecución sticky en [Modelo de ejecución de actividades](/docs/features/activity-execution-model).
