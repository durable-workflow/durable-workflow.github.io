---
sidebar_position: 11
title: Fallos y recuperación
description: Diagnostica fallos de actividades, excepciones sin reintentos, vencimiento de plazos de ejecución, limpieza de cancelaciones y acciones de recuperación.
tags:
  - failures
  - recovery
  - operations
keywords:
  - fallos de workflows
  - excepción sin reintentos
  - recuperación de workflows
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

`Workflow\V2\Activity` usa `$tries = 1` de forma predeterminada: un intento, sin reintento automático tras una excepción. El primer fallo de la actividad se devuelve al workflow. El código puede capturarlo, como en el ejemplo; si no lo maneja, la ejecución falla y queda en un estado terminal.

Los reintentos deben configurarse explícitamente. Establece `$tries` por encima de `1` para permitir más intentos, o en `0` para intentos ilimitados, y elige una política de `backoff()`. Un fallo reintentable se entrega al código del workflow solo cuando se agota el presupuesto de intentos o de tiempo configurado. Un fallo no reintentable omite los reintentos restantes.

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

Primero consulta el estado duradero de la ejecución seleccionada y la política de reintentos de la actividad. Con el intento único predeterminado, un fallo de actividad sin manejar ya ha dejado la ejecución en un estado terminal. Desplegar una corrección o llamar a `repair()` no reabre esa ejecución fallida.

Solo es posible corregir el código mientras la ejecución original espera si la actividad aún dispone de un reintento válido. Antes de programarla, configura `$tries` por encima de `1`, o en `0` para intentos ilimitados, junto con `backoff()`. Opcionalmente, define `ActivityOptions::$scheduleToCloseTimeout` para limitar la duración total de la actividad entre todos los intentos; los plazos del workflow siguen aplicándose. Consulta [Reintentos](./configuration/options.md#retries), [Espera entre intentos](./configuration/options.md#backoff) y [ActivityOptions](./configuration/options.md#activityoptions). La política se guarda al programar la actividad, por lo que un despliegue posterior no amplía su presupuesto de intentos ni de tiempo.

Para una ejecución que aún espera una actividad reintentable:

1. Consulta sus registros y localiza los errores o excepciones.
2. Identifica la causa y corrige el código.
3. Despliega la corrección donde se ejecutan los workers de la cola.
4. Reinicia o sustituye gradualmente los workers pertinentes para que carguen el código nuevo y puedan reclamar trabajo de forma segura.
5. Deja que un worker sano ejecute el siguiente intento válido. La reparación o reentrega puede recuperar el transporte de tareas perdido; no concede otro reintento de negocio después de cerrarse la actividad o la ejecución.
6. Verifica el resultado duradero en Waterline, una exportación del historial o la API de Server. Una línea del registro del worker no basta para confirmar el estado.
7. Si la actividad sigue fallando, comprueba los presupuestos restantes de intentos y de tiempo antes de repetir el proceso.

Una ejecución con un reintento de actividad válido permanece en espera y puede continuar cuando el código corregido tenga éxito, siempre que no hayan vencido sus presupuestos originales. Esto no garantiza que todo workflow fallido pueda corregirse en el mismo lugar: el fallo final de una actividad sin manejar, un fallo del código del workflow, un límite estructural o un plazo vencido pueden dejar la ejecución en un estado terminal.

Para una ejecución fallida terminal, conserva el historial y concilia los efectos externos antes de decidir si la aplicación debe iniciar otro workflow. Usa idempotencia en la aplicación para operaciones de negocio repetidas. No hay reintento automático del workflow completo ni reapertura de ejecuciones terminales; consulta [Reintentos a nivel de workflow](#workflow-level-retry).

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

Desde el código del workflow, limita el tiempo total de la actividad, incluidas las esperas en cola y entre intentos:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

En conjunto, estos ajustes permiten como máximo tres intentos, con pausas de 5 y 30 segundos, dentro del plazo original de 120 segundos de schedule-to-close. Si el plazo del workflow vence antes, también se aplica. Habilita reintentos solo para operaciones que puedan repetirse de forma segura y protege los efectos externos con controles de idempotencia.

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
duradera comunica un fallo permanente a operadores, workers externos y
herramientas: reintentar la misma operación no tendrá éxito. Se registra tanto
si la excepción procede de una actividad como de un workflow.

La marca aparece en todas las superficies de observación:

- **Filas de fallos:** columna booleana `workflow_failures.non_retryable`.
- **Eventos del historial:** campo `non_retryable` del evento tipado.
- **Instantáneas de fallos:** `non_retryable` en `FailureSnapshots::forRun()`.
- **Detalle de ejecución:** `non_retryable` en el array de excepciones.
- **Cronología:** `non_retryable` en los metadatos del fallo.
- **Exportaciones:** `non_retryable` en `failures[*]`.
- **Waterline:** una etiqueta «non-retryable» junto a la categoría del fallo en
  la tabla de excepciones y en la cronología.
- **Puente de workers externos:** `complete()` acepta `non_retryable` para
  informar del fallo sin que el proceso anfitrión resuelva la clase de excepción.

Sin ese contrato, `non_retryable` vale `false` por defecto. La versión final de
v2 registra la marca duradera en el momento del fallo. Declara el contrato antes de
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
