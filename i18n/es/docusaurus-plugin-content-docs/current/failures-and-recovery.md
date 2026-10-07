---
sidebar_position: 11
title: Fallos y recuperación
description: Diagnostica fallos de actividades, excepciones permanentes, vencimiento de plazos y acciones de recuperación.
tags:
  - failures
  - recovery
  - operations
keywords:
  - workflow failures
  - non retryable exception
  - workflow recovery
---

# Fallos y recuperación {#failures-and-recovery}

Antes de investigar un fallo, ten presente el contrato de ejecución:

- Las tareas de workflow se recuperan reproduciendo el historial confirmado.
- Las actividades se ejecutan al menos una vez y pueden repetirse.
- El vencimiento de una lease y la reentrega son vías normales de recuperación.
  No demuestran que el worker anterior no realizara el efecto externo.

Consulta [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md)
para conocer la semántica exacta de reintentos, reentregas y resultados duraderos.

## Manejo de excepciones {#handling-exceptions}

Cuando una actividad lanza una excepción, el sistema aplica su política de
reintentos hasta agotar `$tries`. Después entrega la excepción al workflow.
Configura `$tries = 1` para que el workflow la reciba en el primer fallo.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Excepciones que no admiten reintentos {#non-retryable-exceptions}

Algunas excepciones representan fallos permanentes. Si una actividad lanza una
excepción que no admite reintentos, el motor marca la actividad como fallida y
deja de reintentar inmediatamente.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Proceso de recuperación {#recovery-process}

Para corregir una actividad que está fallando:

1. Consulta sus registros y localiza los errores o excepciones.
2. Identifica la causa y corrige el código.
3. Despliega la corrección donde se ejecutan los workers de la cola.
4. Reinicia o sustituye gradualmente los workers para que carguen el código
   nuevo y puedan reclamar trabajo de forma segura.
5. Espera al reintento o a que la reparación o reentrega asigne la tarea
   duradera a un worker sano.
6. Verifica el resultado duradero en Waterline, una exportación del historial
   o la API. Una línea del registro del worker no basta para confirmar el estado.
7. Si la actividad sigue fallando, continúa el diagnóstico.

Mientras queden reintentos, el workflow puede seguir en ejecución aunque la
actividad falle. Si corriges la causa antes de agotar los intentos, puede
continuar hasta completarse. Agotar `$tries` con una excepción sin manejar
cierra el workflow como fallido.

## Aplicación de los plazos del workflow {#workflow-timeout-enforcement}

Al configurar `StartOptions::withExecutionTimeout()` o
`StartOptions::withRunTimeout()`, el motor guarda un plazo en la ejecución.
El plazo de ejecución abarca todo el workflow lógico, incluidas las ejecuciones
continue-as-new. El plazo de run se reinicia con cada nueva ejecución.

Si el plazo ha vencido al iniciar una tarea de workflow, el motor cierra la
ejecución inmediatamente:

- Cancela las actividades abiertas, los temporizadores y las tareas pendientes,
  y registra eventos tipados como `ActivityCancelled` y `TimerCancelled`.
- Registra un `WorkflowFailure` con `failure_category = timeout` y
  `propagation_kind = timeout`.
- Registra `WorkflowTimedOut` con `timeout_kind` igual a `execution_timeout`
  o `run_timeout`.
- Cambia el estado a `failed` con `closed_reason = timed_out`.
- Notifica a los workflows padres que esperan al hijo.

El supervisor de tareas busca también ejecuciones no terminales con plazos
vencidos y sin tarea de workflow abierta. Esto incluye las que esperan una
actividad o un temporizador. Crea una tarea para que el ejecutor aplique el
vencimiento en la siguiente pasada.

Waterline muestra `failure_category` en la columna de categoría de excepciones
y en los detalles de fallos de la cronología. Las exportaciones del historial
lo incluyen en `failures[*]`. V2 guarda la clasificación al registrar el fallo.
Las filas importadas de v1 que no puedan clasificarse siguen visibles como
diagnósticos sin clasificar.

## Reintentos de actividades {#activity-retries}

`Workflow\V2\Activity` usa `$tries = 1` de forma predeterminada. El fallo se
entrega inmediatamente al workflow, salvo que la actividad configure reintentos.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Cuando falla un intento y aún quedan reintentos, el motor cierra su fila en
`activity_attempts`, devuelve `activity_executions` a `pending`, registra
`ActivityRetryScheduled` y crea una tarea duradera cuyo `available_at` deriva
de `backoff()`. El workflow sigue esperando la misma actividad lógica y recibe
la excepción si falla el último intento.

La tarea guarda `retry_of_task_id`, `retry_after_attempt_id`,
`retry_after_attempt` y `retry_backoff_seconds` para explicar su programación.
El detalle de la ejecución reconstruye el intento fallido en
`activities[*].attempts` a partir del historial tipado, muestra
`ActivityRetryScheduled` en la cronología y expone los contadores
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` y
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` interrumpe la política:
una excepción permanente falla la actividad y reanuda el workflow con la
excepción inmediatamente.

### Identidad de la actividad e idempotencia {#activity-execution-identity-and-idempotency}

El vencimiento de una lease, la pérdida del worker, un informe de finalización
retrasado y la reentrega también pueden producir otro intento o un informe
obsoleto de la misma actividad lógica.

- `activity_execution_id` identifica la actividad lógica a través de reintentos
  y reentregas. Úsalo como clave idempotente predeterminada para efectos remotos.
- `activity_attempt_id` identifica un intento. Úsalo cuando el sistema externo
  necesite distinguir intentos.
- Un informe tardío de un intento sustituido no demuestra que el motor haya
  confirmado el mismo intento dos veces.

Al investigar una finalización tardía después de vencer una lease:

- Consulta Waterline, la exportación del historial o la API para saber qué
  intento confirmó su resultado.
- Un informe tardío rechazado no demuestra que el efecto externo no ocurriera.
- Comprueba el sistema externo por su clave idempotente antes de forzar un
  reintento o una reparación manual.

Haz el efecto remoto idempotente bajo `activity_execution_id` y consulta el
resultado duradero para saber si el motor aceptó el informe del intento.

### Marcas de fallos permanentes {#non-retryable-failure-markers}

Si la excepción implementa `Workflow\Exceptions\NonRetryableExceptionContract`,
el motor guarda `non_retryable = true` en `WorkflowFailure` y en el evento
tipado (`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`). Esta marca
duradera comunica un fallo permanente a operadores, workers y herramientas.

La marca aparece en todas las superficies de observación:

- **Filas de fallos:** columna booleana `workflow_failures.non_retryable`.
- **Eventos del historial:** campo `non_retryable` del evento tipado.
- **Instantáneas de fallos:** `non_retryable` en `FailureSnapshots::forRun()`.
- **Detalle de ejecución:** `non_retryable` en el array de excepciones.
- **Cronología:** `non_retryable` en los metadatos del fallo.
- **Exportaciones:** `non_retryable` en `failures[*]`.
- **Waterline:** una etiqueta de fallo sin reintentos junto a la categoría.
- **Puente de workers externos:** `complete()` acepta `non_retryable` para
  informar del fallo sin que el proceso anfitrión resuelva la clase de excepción.

Sin ese contrato, `non_retryable` vale `false` por defecto. Decláralo antes de
registrar el fallo para que operadores y SDK puedan distinguir los fallos
permanentes de los que admiten reintentos.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Reintentos a nivel de workflow {#workflow-level-retry}

Durable Workflow v2 no reintenta automáticamente un workflow completo. Un fallo
por excepción sin manejar, límite estructural o vencimiento cierra la
ejecución. El motor no inicia otra ejecución de esa instancia automáticamente.

El diseño usa estas herramientas:

- **Reintentos de actividades:** `$tries`, `backoff()` y excepciones permanentes
  gestionan fallos transitorios de cada operación.
- **Reproducción del workflow:** ante un error transitorio de infraestructura,
  como un fallo de base de datos o del worker, el sistema vuelve a entregar la
  tarea y reanuda desde el historial confirmado dentro de la misma ejecución.
- **Continue-as-new:** `continueAsNew()` inicia explícitamente una ejecución
  nueva para renovar el estado o limitar el historial de workflows largos.
- **Reparación:** `repair()` y la reparación automática del bucle del worker
  recuperan ejecuciones cuyo transporte de tareas duraderas se perdió.

Si necesitas reintentos a nivel de workflow, modélalos explícitamente:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Guías relacionadas {#related-guides}

- [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md):
  contrato de reproducción, reintentos, leases y reentrega.
- [Monitorización](./monitoring.md): observación de fallos en Waterline,
  exportaciones, registros de workers y telemetría del entorno.
