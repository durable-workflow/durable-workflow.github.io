---
sidebar_position: 23
title: Actividades locales
description: Ejecuta trabajo breve de actividad dentro del proceso actual del worker de workflow conservando historial duradero, reintentos, tiempos de espera y visibilidad.
tags:
  - activities
  - workers
  - execution
keywords:
  - actividades locales
  - localActivity
  - executeLocalActivity
  - actividad en el mismo proceso
  - latido de tarea de workflow
---

# Actividades locales {#local-activities}

Las actividades locales son la primitiva v2 para trabajo breve que debe ejecutarse dentro del proceso del worker que atiende la tarea de workflow. Conservan la semántica de reintentos, tiempos de espera, latidos, cancelación, historial y visibilidad para el operador, pero evitan el encolado ordinario de tareas de actividad.

Úsalas cuando el trabajo sea de baja latencia, idempotente y adecuado para el propio worker de workflow. Usa actividades ordinarias en cola si necesitas escalado independiente de workers, enrutamiento por colas, ejecución prolongada o una lease separada de tarea de actividad.

## Resumen del contrato {#contract-summary}

- `localActivity(...)` y `Workflow::localActivity(...)` ejecutan la clase de actividad en el mismo proceso que la tarea actual de workflow.
- El runtime crea una fila `activity_executions` y eventos normales de historial marcados con `execution_mode=local` y `local_activity=true`.
- No se crea una tarea ordinaria `TaskType::Activity`, por lo que se rechazan `connection`, `queue`, sesión de worker y opciones de enrutamiento entre programación e inicio.
- El intento local es propietario de la lease de la tarea de workflow. `heartbeat()` de actividad renueva ese lease y registra `ActivityHeartbeatRecorded`.
- Los reintentos son tareas duraderas de workflow con espera, no reintentos ocultos en un bucle.
- La reproducción en frío lee historial confirmado. Si un intento local iniciado no tiene evento terminal tras perder el worker, el siguiente intento registra `retry_reason=cold_replay`.
- Los detalles de ejecución, exportaciones, cronologías y métricas distinguen los intentos locales de los ordinarios en cola.

## API de autoría {#authoring-api}

Usa la función auxiliar con espacio de nombres:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

O la fachada estática de workflow:

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` acepta campos de reintentos y tiempos de espera:

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

Rechaza `connection`, `queue`, enrutamiento por sesión de worker y `scheduleToStartTimeout` porque una actividad local no entra en la asignación normal de tareas.

## Ejecución e historial {#execution-and-history}

Cuando la reproducción alcanza una actividad local, la tarea actual de workflow:

1. crea la ejecución de actividad con `activity_options.execution_mode=local`;
2. registra `ActivityScheduled` y `ActivityStarted` con el marcador local;
3. instancia y ejecuta la clase de actividad en el proceso del worker de workflow;
4. registra `ActivityCompleted`, `ActivityFailed`, `ActivityTimedOut` o `ActivityCancelled`;
5. reanuda el código desde el evento registrado.

La reproducción no vuelve a ejecutar una actividad local completada. La reproducción de consultas y en frío leen los mismos eventos que las actividades ordinarias.

## Latidos {#heartbeats}

Una actividad local no es propietaria de una lease de tarea de actividad. Posee la lease de la tarea de workflow que se está ejecutando. Al comenzar el intento, el runtime renueva ese lease. Cuando la actividad llama a `$this->heartbeat()`, registra el progreso, actualiza el intento y renueva la lease de workflow.

Las actividades locales prolongadas deben emitir latidos con frecuencia suficiente para mantener tanto su plazo de latidos como la lease de tarea de workflow:

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## Tiempos de espera y reintentos {#timeouts-and-retries}

`startToCloseTimeout` limita un intento. `scheduleToCloseTimeout` limita toda la ejecución local, incluidos reintentos. `heartbeatTimeout` limita el intervalo entre latidos locales registrados.

Ante un fallo reintentable o vencimiento del plazo, el runtime registra `ActivityRetryScheduled` y crea una tarea de workflow disponible tras la espera del reintento. Esa tarea reproduce el historial, alcanza la misma secuencia de actividad local e inicia el siguiente intento.

Cada intento local tiene una nueva fila `activity_attempts`. El reintento registra `retry_reason` como `failure`, `timeout` o `cold_replay`.

## Cancelación y pérdida del worker {#cancellation-and-worker-loss}

La cancelación es cooperativa. Una actividad local la observa al emitir latidos, aplicar tiempos de espera y completar intentos. Un intento cancelado registra `ActivityCancelled` con el marcador local.

Si un worker sale antes de confirmar un evento terminal local, caduca la lease de workflow y la reparación normal recupera su tarea. La reproducción en frío lee el historial confirmado. Si contiene un intento local iniciado sin evento terminal, el runtime programa un reintento con `retry_reason=cold_replay`.

## Visibilidad {#visibility}

El operador puede distinguir las actividades locales en todas las vistas de estado:

- las cargas de historial incluyen `execution_mode=local` y `local_activity=true`;
- `activity_executions.activity_options.execution_mode` es `local`;
- el detalle y la exportación incluyen `execution_mode` y `local_activity`;
- las métricas exponen `activities.local`, `activities.local_open`, `activities.local_attempts` y contadores separados de actividades locales y en cola.

El manifiesto del runtime se publica en `worker_protocol.server_capabilities.local_activities` en `GET /api/cluster/info`. El contrato legible por máquinas es [`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json) y aparece en el catálogo de [Especificaciones del protocolo de la plataforma](/docs/platform-protocol-specs#local-activity-runtime-notes).

Los nombres de evento siguen siendo los normales de actividad para que las cronologías y herramientas de reproducción conserven el orden sin una familia paralela de eventos.

## Elegir la primitiva adecuada {#choosing-the-right-primitive}

Usa una actividad local para efectos secundarios breves, reintentables e idempotentes que convenga ejecutar en el proceso del worker de workflow sin enrutamiento por colas.

Usa una [actividad](/docs/defining-workflows/activities) ordinaria para llamadas remotas, E/S lenta, trabajo intensivo de CPU, flotas dedicadas, contrapresión o trabajo que deba seguir avanzando mediante una tarea de actividad con lease independiente tras perder el worker de workflow.

Usa [sesiones de worker](/docs/features/worker-sessions) cuando varios pasos ordinarios deban reutilizar recursos locales, como memoria GPU o un sistema de archivos montado.

Usa [`sideEffect(...)`](/docs/features/side-effects) solo para instantáneas seguras para la reproducción que no necesiten reintentos, tiempos de espera, latidos ni cancelación de actividad.
