---
sidebar_position: 2
title: Actividades
description: Define clases de actividad para efectos secundarios no deterministas, reintentos, enrutamiento y opciones por llamada.
tags:
  - authoring
  - activities
  - retries
keywords:
  - clase de actividad de Durable Workflow
  - opciones de actividad
  - efectos secundarios no deterministas
---

# Actividades {#activities}

Una actividad es una unidad de trabajo que realiza una tarea u operación concreta (por ejemplo, una solicitud API, procesar datos o enviar un correo) y que puede ejecutar un workflow.

:::note Contrato de ejecución duradera
Las actividades ordinarias v2 se ejecutan como tareas duraderas en cola. Las
actividades locales son una primitiva explícita dentro del mismo proceso para
trabajos breves que también registran historial duradero. Las sesiones de worker
permiten que varios pasos de actividad duraderos compartan una lease de worker.
La ejecución sticky es una optimización de reproducción compatible, no un
contrato de corrección. Consulta los contratos exactos en [Modelo de ejecución de actividades](/docs/features/activity-execution-model),
[Actividades locales](/docs/features/local-activities), [Sesiones de worker](/docs/features/worker-sessions)
y [Ejecución sticky](/docs/features/sticky-execution).
:::

Puedes crear una actividad con el comando Artisan `make:activity`:

```php
php artisan make:activity MyActivity --v2
```

Se define extendiendo la clase `Activity` e implementando el método `handle()`.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## Contrato de ejecución {#execution-contract}

Cada llamada `activity(...)` registra un comando de actividad en el historial y
crea una tarea duradera en cola que un worker puede reclamar. Cualquier worker
compatible puede reclamar actividades ordinarias. Las [sesiones de worker](/docs/features/worker-sessions)
pueden fijar una secuencia de intentos a una lease de sesión cuando el
workflow elige explícitamente ese contrato.

Si necesitas un valor seguro para la reproducción sin programar trabajo en cola,
usa [`sideEffect(...)`](/docs/features/side-effects). Para una actividad breve y
reintentable en el mismo proceso, con tiempo de espera, latidos e historial,
usa [Actividades locales](/docs/features/local-activities).
Consulta el modelo completo de ubicación en [Modelo de ejecución de actividades](/docs/features/activity-execution-model)
y el comportamiento de la caché de reproducción sticky en
[Ejecución sticky](/docs/features/sticky-execution).

## Idempotencia e identidad duradera {#idempotency-and-durable-identity}

La ejecución de actividades es al menos una vez. Los reintentos, la caducidad de
leases y las entregas repetidas pueden hacer que se observe varias veces la
misma actividad lógica. Su efecto secundario o destino remoto debe tolerar repeticiones.

Dentro de la actividad, usa los identificadores duraderos del runtime para
correlacionar o deduplicar en el destino remoto:

- `activityId()` identifica una ejecución lógica de actividad a través de los
  reintentos y es la clave predeterminada de idempotencia remota.
- `attemptId()` identifica un intento concreto de esa ejecución.
- `attemptCount()` indica qué intento se está ejecutando.

Prefiere `activityId()` cuando el sistema remoto deba tratar los reintentos como
la misma solicitud lógica. Usa `attemptId()` solo si necesita distinguir intentos.
Si un worker termina el trabajo remoto, pierde su lease y comunica el
resultado tarde, el motor puede rechazarlo porque otro worker ya ganó la carrera
duradera, aunque el efecto remoto sí se haya producido.

Consulta el modelo operativo de estos identificadores en [Garantías de ejecución e idempotencia](/docs/constraints/execution-guarantees),
[Latidos](/docs/features/heartbeats) y
[Fallos y recuperación](/docs/failures-and-recovery).

## Sustituciones por llamada {#per-call-overrides}

El enrutamiento y los reintentos usan por defecto `$connection`, `$queue`, `$tries` y `backoff()` de la clase de actividad. Cuando una llamada deba cambiarlos, por ejemplo para usar una cola prioritaria o más intentos, pasa una instancia de `ActivityOptions`:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

Consulta la lista completa de campos, incluidos tiempos de espera y latidos, en [Opciones de actividad](/docs/configuration/options#activityoptions).

## Llamadas a actividades locales {#local-activity-calls}

Usa `localActivity(...)` cuando un efecto secundario breve e idempotente deba
ejecutarse dentro del proceso actual del worker de workflow, conservando la
semántica de reintentos, tiempos de espera, latidos, cancelación e historial de actividad:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

Las actividades locales rechazan `connection`, `queue`, el enrutamiento por sesión
de worker y las opciones de espera entre programación e inicio, porque no crean
tareas ordinarias de actividad. Consulta el contrato completo en
[Actividades locales](/docs/features/local-activities).
