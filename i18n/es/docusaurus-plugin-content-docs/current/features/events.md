---
sidebar_position: 12
---

# Eventos {#events}

Los eventos de ciclo de vida se despachan en etapas clave de workflows y actividades para notificar progreso, finalización o fallos a la aplicación. Son eventos estándar de Laravel: registra listeners en `EventServiceProvider` o con `Event::listen()`.

Todos los eventos de ciclo de vida V2 se despachan **después de confirmar el estado duradero** en la base de datos. Los listeners solo observan eventos respaldados por hechos confirmados: si se revierte una transacción, no se despacha ninguno.

## Identidad del evento {#event-identity}

Cada evento V2 contiene campos de identidad duradera:

| Campo | Descripción |
|---|---|
| `instanceId` | ID de instancia del workflow, estable al continuar como nueva ejecución. |
| `runId` | ID de la ejecución concreta. |
| `workflowType` | Clave de tipo duradera registrada mediante `#[Type('...')]`. |
| `workflowClass` | Nombre de clase PHP del workflow. |
| `committedAt` | Fecha ISO 8601 de confirmación del registro duradero según el reloj real. |

Los eventos de actividad también incluyen:

| Campo | Descripción |
|---|---|
| `activityExecutionId` | ID duradero de ejecución de actividad. |
| `activityType` | Clave de tipo duradera de actividad. |
| `activityClass` | Nombre de clase PHP de la actividad. |
| `sequence` | Posición de la actividad dentro de la ejecución del workflow. |
| `attemptNumber` | Número de intento, empezando por 1. |

## Eventos de workflow {#workflow-events}

### WorkflowStarted {#workflowstarted}

Se despacha al confirmar duraderamente el inicio: se ha creado la primera ejecución y registrado el evento de historial `WorkflowStarted`.

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

También se emite al iniciar otra ejecución mediante continuación como nueva.

### WorkflowCompleted {#workflowcompleted}

Se despacha cuando una ejecución se completa satisfactoriamente.

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

Se despacha cuando una ejecución falla de forma terminal.

Campos adicionales:
- `exceptionClass`: nombre de clase PHP de la excepción.
- `message`: mensaje de la excepción.

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Eventos de actividad {#activity-events}

### ActivityStarted {#activitystarted}

Se despacha al reclamar una tarea de actividad y comenzar su ejecución.

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

Se despacha cuando una actividad termina satisfactoriamente.

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

Se despacha cuando una actividad falla de forma terminal (reintentos agotados o excepción no reintentable). Los fallos que se reintentarán **no** lo activan.

Campos adicionales:
- `exceptionClass`: nombre de clase PHP de la excepción.
- `message`: mensaje de la excepción.

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Eventos de fallo {#failure-events}

### FailureRecorded {#failurerecorded}

Se despacha al confirmar un registro duradero de fallo terminal de workflow o actividad. Es el único punto de integración necesario para informar errores a Sentry, Bugsnag o servicios similares.

| Campo | Descripción |
|---|---|
| `failureId` | ID del registro duradero de fallo. |
| `sourceKind` | `"workflow_run"` o `"activity_execution"`. |
| `sourceId` | ID del origen (ejecución de workflow o actividad). |
| `exceptionClass` | Nombre de clase PHP de la excepción. |
| `message` | Mensaje de la excepción. |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## Semántica de las marcas de tiempo {#timestamp-semantics}

`committedAt` representa la **hora de confirmación**: el instante del reloj real en que se escribió en la base de datos el registro duradero (evento de historial o fallo). Es distinto de:

- **Tiempo virtual del workflow**: tiempo lógico interno, usado por los temporizadores.
- **Tiempo del intento**: cuándo empezó o terminó un intento concreto de actividad.
- **Latencia de reanudación**: cuánto tardó en reanudarse el workflow después de vencer un temporizador.

La hora de confirmación es la más útil para integraciones externas porque refleja cuándo el estado se volvió duradero y observable.

## Ciclo de vida {#lifecycle}

Ciclo típico de un workflow satisfactorio:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

Ciclo con un fallo terminal de actividad:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

## Espacio de nombres de eventos {#event-namespace}

Los eventos V2 están en `Workflow\V2\Events`. Si actualizas una aplicación existente, consulta la correspondencia de eventos compatibles V1 en [Migración](../migration.md).
