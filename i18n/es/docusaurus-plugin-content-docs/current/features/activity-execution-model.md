---
sidebar_position: 22
title: Modelo de ejecución de actividades
description: Cómo encajan las actividades ordinarias en cola, las actividades locales, las sesiones de worker y la ejecución sticky en Durable Workflow v2.
tags:
  - activities
  - workers
  - execution
keywords:
  - modelo de ejecución de actividades
  - actividades locales
  - sesiones de worker
  - ejecución sticky
  - despacho de tareas duraderas
  - actividades en cola
---

# Modelo de ejecución de actividades {#activity-execution-model}

Para conocer la compatibilidad de los workers de servicio y la negociación de capacidades con rechazo seguro entre PHP, Python y Rust, consulta la matriz de [Afinidad portable de workers](/docs/polyglot/portable-worker-affinity) del modo servicio.

Durable Workflow v2 ofrece primitivas explícitas para las opciones habituales de ubicación de actividades:

- actividades ordinarias en cola para trabajo duradero con leases independientes;
- [actividades locales](/docs/features/local-activities) para trabajo breve en el mismo proceso que también registra historial de actividad;
- [sesiones de worker](/docs/features/worker-sessions) para afinidad duradera entre varios pasos de actividad en cola;
- [ejecución sticky](/docs/features/sticky-execution) para afinidad de la caché de reproducción del workflow, con reproducción ordinaria como alternativa que garantiza la corrección.

## Actividades ordinarias en cola {#ordinary-queued-activities}

`activity(...)` y `Workflow::activity(...)` son actividades ordinarias en cola. Siguen siendo la primitiva de actividad predeterminada.

1. El código del workflow llama a `activity(MyActivity::class, ...)`.
2. La tarea de workflow registra `ActivityScheduled` y crea una tarea de actividad duradera en la conexión y cola configuradas.
3. Un worker compatible reclama esa tarea mediante una lease.
4. El worker ejecuta la clase de actividad y comunica finalización, fallo, cancelación, latido o vencimiento del plazo.
5. El motor registra el resultado en el historial y reanuda el workflow desde el estado duradero.

Los intentos ordinarios pueden ejecutarse en cualquier worker compatible. Un reintento puede llegar a otro proceso, host o compilación. La actividad debe ser idempotente ante entregas duplicadas, reintentos tras caducar la lease y carreras de finalización tardía. Usa `activity_execution_id` como clave predeterminada de idempotencia remota y `activity_attempt_id` solo si un sistema posterior necesita correlacionar cada intento.

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## Actividades locales {#local-activities}

`localActivity(...)`, `Workflow::localActivity(...)` y `Workflow::executeLocalActivity(...)` ejecutan una clase de actividad dentro del proceso del worker que está ejecutando la tarea de workflow. No crean una tarea ordinaria de actividad.

Las actividades locales siguen registrando el historial normal:

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

Cada evento local contiene `execution_mode=local` y `local_activity=true`, y la instantánea de ejecución guarda `activity_options.execution_mode=local`. Los latidos de actividad renuevan la lease de la tarea de workflow propietaria mientras se ejecuta el intento local.

Usa actividades locales para efectos secundarios breves e idempotentes que necesiten reintentos, tiempos de espera, latidos, cancelación y visibilidad de actividad, pero no enrutamiento por colas ni una flota independiente de workers de actividad. Consulta el contrato de API, tiempos de espera, reintentos, apagado, reproducción en frío, enrutamiento y métricas en [Actividades locales](/docs/features/local-activities).

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Sesiones de worker {#worker-sessions}

Las sesiones fijan una secuencia de intentos ordinarios en cola a una lease de sesión de worker. Úsalas cuando varios pasos duraderos deban reutilizar recursos locales, como memoria GPU, un sistema de archivos montado o un modelo cargado.

Una sesión no convierte una actividad en local. Cada actividad de la sesión sigue siendo una tarea duradera con su propia lease, latidos, tiempos de espera, reintentos e historial terminal. La sesión añade reglas explícitas de afinidad y admisión al enrutamiento normal por colas.

Consulta la API de sesión, el ciclo de vida de la lease, enrutamiento, fallos, apagado y diagnósticos en [Sesiones de worker](/docs/features/worker-sessions).

## Ejecución sticky {#sticky-execution}

La ejecución sticky optimiza la reproducción de tareas de workflow. Un worker puede mantener una caché de reproducción caliente local al proceso tras completar una tarea, y la asignación puede preferirlo para la siguiente tarea de la misma ejecución.

El progreso del workflow no pasa a ser local al proceso. La corrección siempre puede recurrir a la reproducción ordinaria en frío desde el historial duradero si falta la caché, se reinicia o retira el worker, se despliega otra versión o se expulsa la entrada. El código no debe depender de estado en memoria ajeno al historial.

Consulta el ciclo de vida de la caché, identidad de enrutamiento, reglas de alternativa, controles de despliegue y métricas en [Ejecución sticky](/docs/features/sticky-execution).

## Elegir la primitiva adecuada {#choosing-the-right-primitive}

Usa directamente el código del workflow para bifurcaciones y cálculos deterministas.

Usa [`sideEffect(...)`](/docs/features/side-effects) para capturar un valor no determinista de forma segura para la reproducción, sin necesitar reintentos, tiempos de espera, latidos ni cancelación de actividad.

Usa [actividades locales](/docs/features/local-activities) para efectos secundarios breves, reintentables y en el mismo proceso que deban aparecer como intentos de actividad sin entrar en la asignación normal de tareas.

Usa [actividades](/docs/defining-workflows/activities) ordinarias para llamadas remotas, E/S lenta, trabajo intensivo de CPU, contrapresión de colas, flotas dedicadas o trabajo que deba continuar mediante una tarea de actividad con lease independiente.

Usa [sesiones de worker](/docs/features/worker-sessions) cuando varios pasos ordinarios necesiten afinidad explícita con recursos locales al worker.
