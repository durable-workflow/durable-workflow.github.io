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

Para una ejecución fallida terminal, conserva el historial y concilia los efectos externos antes de decidir si la aplicación debe iniciar otro workflow. Usa idempotencia en la aplicación para operaciones de negocio repetidas. No hay reintento automático del workflow completo ni reapertura de ejecuciones terminales; consulta [Reintentos a nivel de workflow](#workflow-level-retry). Si un fallo de actividad no capturado terminó la ejecución, comprueba después de desplegar la corrección si puedes hacer un [redrive](#redrive). El redrive continúa en una ejecución nueva que reutiliza los resultados de las actividades completadas.

## Redrive de una ejecución fallida {#redrive}

El redrive continúa una ejecución fallida en una ejecución nueva de la misma instancia de workflow. La ejecución nueva reutiliza los resultados registrados de las actividades que se completaron antes del fallo y vuelve a programar la actividad fallida. Úsalo después de corregir la causa de un fallo de actividad, para que el trabajo ya completado, como un pago o un correo electrónico, no se repita.

La ejecución fallida sigue cerrada y sin cambios. La ejecución nueva, llamada sucesora, recibe el siguiente número de ejecución y pasa a ser la ejecución actual de la instancia. Su `continued_from_run_id` indica la ejecución fallida. Su evento `WorkflowStarted` registra `recovery_kind: redrive` y `resume_step_sequence`, el paso en el que se reanuda la ejecución.

La sucesora vuelve a reproducir el código del workflow desde el principio:

- Cada llamada de actividad que se completó en la ejecución fallida devuelve su resultado registrado. La actividad no se vuelve a ejecutar.
- La llamada de actividad fallida se programa como una ejecución de actividad nueva, con la política de reintentos del código del workflow. Sus intentos empiezan de nuevo.
- Todo lo que sigue al paso fallido se ejecuta como en una ejecución nueva.
- La sucesora conserva el plazo de ejecución de la ejecución fallida. Su tiempo límite de ejecución vuelve a empezar en el redrive.
- En modo embedded, `Workflow::now()` en la sucesora empieza en la hora de inicio de la ejecución fallida. Un resultado de actividad reutilizado conserva la hora en que se registró por primera vez. Así, el tiempo del workflow durante la reproducción coincide con la ejecución fallida.

### Solicitar un redrive {#request-a-redrive}

En modo embedded, resuelve el contrato `Workflow\V2\Contracts\WorkflowControlPlane` desde el contenedor de Laravel y llama a `redrive()` con el id de la instancia de workflow y el id de la ejecución fallida:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

En modo servicio, envía `POST /api/workflows/{workflowId}/runs/{runId}/redrive` con un `request_id` opcional en el cuerpo. Los clientes envuelven la misma ruta:

| Superficie | Llamada |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` o `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` o `handle.redrive(request_id)` |

Un redrive aceptado devuelve el id de ejecución de la sucesora y `resume_step_sequence`. Un redrive rechazado devuelve un `reason` y no cambia nada. Hacer redrive de una ejecución que ya lo tuvo devuelve la sucesora existente en lugar de crear otra. Pasa un `request_id` para que reintentar la solicitud sea seguro. Un `request_id` ya usado para otro redrive de la misma instancia se rechaza con `request_id_already_used`.

Los workers de servicio informan una huella de la definición del workflow. El redrive la compara con la huella registrada al iniciar la ejecución. En el SDK de Rust, llama a `Worker::set_workflow_definition_sources()` para cada workflow que quieras poder recuperar con redrive. Un workflow registrado sin identidad de código fuente sigue ejecutándose, pero el redrive lo rechaza.

### Cuándo se puede hacer redrive de una ejecución fallida {#redrive-eligibility}

El redrive acepta una ejecución fallida cuando se cumple todo lo siguiente:

- La ejecución es la ejecución actual de la instancia.
- La ejecución falló porque un fallo de actividad llegó al código del workflow y no se capturó. Se rechaza una ejecución que falló en el código del workflow, por un límite estructural o por un tiempo límite del workflow.
- Cada paso anterior a la actividad fallida es una actividad completada cuyo resultado está almacenado en línea. Se rechaza un resultado guardado en el almacenamiento externo de payloads.
- La definición del workflow coincide con la huella registrada al iniciar la ejecución. Si la corrección cambia el código del workflow, el redrive rechaza la ejecución.
- El plazo de ejecución no ha vencido.
- La ejecución no tiene memos ni atributos de búsqueda, ni workflow padre, ni workflows hijos, ni actividades locales, y su entrada está almacenada en línea.

Un rechazo indica la primera regla que no se cumplió:

| Motivo | Significado |
| --- | --- |
| `run_not_failed` | La ejecución no está en el estado `failed`. |
| `source_run_not_current` | Existe una ejecución más reciente de la instancia. |
| `unrecorded_failure_boundary` | La ejecución no falló por un fallo de actividad que el código del workflow dejó sin capturar. |
| `unsupported_history` | El historial anterior al fallo contiene algo distinto de pasos de actividad, como una señal, una actualización, un temporizador, un efecto secundario, un marcador de versión o un workflow hijo. |
| `unsupported_local_activity` | El historial contiene una actividad local. |
| `external_activity_result_not_supported` | Un resultado de actividad completada está en el almacenamiento externo de payloads. |
| `missing_activity_result`, `unavailable_activity_result` | Falta un resultado de actividad completada o no se puede decodificar. |
| `unsupported_visibility_metadata` | La ejecución tiene memos o atributos de búsqueda. |
| `unsupported_source_metadata` | La ejecución se inició como hija de otro workflow. |
| `unsupported_source_link_or_payload` | La ejecución está vinculada como hija de otro workflow, o su entrada está en el almacenamiento externo de payloads. |
| `execution_deadline_elapsed` | El plazo de ejecución ha vencido. |
| `workflow_definition_unavailable_or_changed` | Falta la huella de la definición o difiere de la registrada al inicio. |
| `request_id_already_used` | El `request_id` ya se usó para otro redrive de la instancia. |
| `invalid_request_id` | El `request_id` tiene más de 191 caracteres. |
| `run_not_found`, `instance_not_found` | La ejecución o la instancia no existe en el espacio de nombres. |

Los demás motivos indican un historial que no tiene la forma esperada: `invalid_history`, `events_after_failure`, `duplicate_start`, `missing_start`, `unexpected_start`, `missing_terminal_history`, `invalid_activity_sequence`, `activity_sequence_gap`, `missing_activity_type`, `activity_type_mismatch`, `duplicate_activity_completion`, `incomplete_activity_prefix` e `invalid_failed_step`. Exporta el historial de la ejecución e inspecciónalo antes de decidir cómo recuperarla.

Cuando el redrive rechaza una ejecución, conserva su historial, concilia los efectos externos y decide si la aplicación debe iniciar un workflow nuevo.

### Cambios en la próxima versión de Workflow {#redrive-next-release}

**Aún no publicado.** Los cambios siguientes están integrados en el paquete Workflow y llegan en su próxima versión. La versión actual, y el redrive en el Server nativo, aplican las reglas anteriores. La compatibilidad del Server nativo se sigue en [server#980](https://github.com/durable-workflow/server/issues/980).

- **Elegibilidad en el detalle de la ejecución y en describe.** El detalle de la ejecución, que lee el detalle de ejecución seleccionada de Waterline, informa `can_redrive` y `redrive_blocked_reason`. `WorkflowControlPlane::describe()` informa los mismos campos dentro de `actions`. Salen de la misma comprobación que aplica `redrive()`, así que puedes ver si una ejecución admite redrive, y por qué no, antes de solicitarlo. Una ejecución que no ha fallado informa `run_not_failed`. Una ejecución que ya tuvo redrive informa `already_redriven`. Para una ejecución en modo servicio, el informe solo comprueba que se registró una huella. `redrive()` sigue comparándola con la huella del worker.
- **Memos y atributos de búsqueda.** Los memos y atributos de búsqueda definidos al iniciar la ejecución pasan a la sucesora, como en continue-as-new. Un valor definido por el código del workflow con un upsert se sigue rechazando con `unsupported_visibility_metadata`.
- **Efectos secundarios y marcadores de versión.** Un efecto secundario o marcador de versión anterior al paso fallido se reutiliza en la sucesora en orden de pasos. El efecto secundario no se vuelve a ejecutar, y una comprobación de versión devuelve la versión registrada. Un resultado de efecto secundario guardado en el almacenamiento externo de payloads se rechaza con `external_side_effect_result_not_supported`.
- **Temporizadores disparados.** Un `timer()` que se disparó antes del paso fallido se registra en la sucesora como ya disparado. La sucesora no vuelve a esperarlo.
- **Tiempo del workflow.** Cada efecto secundario, marcador de versión y temporizador disparado que se reutiliza lleva `reused_from_run_id` y `reused_recorded_at`. La reproducción embedded usa `reused_recorded_at`, así que `Workflow::now()` después de un paso reutilizado coincide con la hora de la ejecución fallida. Un paso reutilizado por un segundo redrive conserva la hora en que se ejecutó por primera vez.

Estos historiales se siguen rechazando:

- Las señales, actualizaciones, workflows hijos, actividades locales y temporizadores cancelados devuelven `unsupported_history` o `unsupported_local_activity`.
- Los tiempos límite de condición y de señal, los temporizadores de limpieza tras cancelación y los temporizadores dentro de un ámbito de cancelación o de un grupo paralelo devuelven `unsupported_timer`.
- Un paso de temporizador al que le falta el evento de programación o el de disparo devuelve `incomplete_timer_step`.
- Un efecto secundario, marcador de versión o temporizador sin un número de paso válido devuelve `invalid_step_sequence`. Dos de ellos en el mismo paso devuelven `duplicate_step_sequence`.
- Una ejecución que falló en el código del workflow sigue devolviendo `unrecorded_failure_boundary`.

## Rechazo de entrada y recuperación en modo servicio {#service-entry-recovery}

**Soporte publicado.** Server 2.9.9 y los SDK PHP 2.5.4, Python 2.6.2 y Rust 3.5.6 incorporaron las protecciones de entrada y el comportamiento de enrutamiento y recuperación descritos a continuación. Son las versiones mínimas para estas funciones; instale las versiones estables actuales para recibir correcciones de seguridad.

Una entrada incompatible provoca un rechazo de despliegue/replay antes de ejecutar código del workflow, no un reintento de actividad ni un fallo terminal de negocio. El worker comunica `failure_reason = workflow_entry_arguments_mismatch` y Server conserva la tarea fallida con `replay_blocked = true`, en lugar de crear otro intento automáticamente. Su `replay_blocked_reason` genérico es `worker_reported_replay_failure`. La ejecución permanece no terminal, con la entrada, el historial y los plazos registrados intactos. Una excepción lanzada por el cuerpo del workflow después de entrar correctamente sí puede hacer fallar la ejecución.

Recupere solo después de comprobar el estado durable real:

1. Inspeccione la ejecución seleccionada con `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Confirme que `latest_workflow_task_failure.reason` es `workflow_entry_arguments_mismatch` y que el original sigue abierto. Este procedimiento no reabre una ejecución terminal.
2. Despliegue código que acepte los argumentos posicionales o la entrada tipada registrados. Conserve los identificadores originales de workflow y ejecución, namespace, cola, compatibilidad de build, historial y plazos. Nunca edite la entrada almacenada ni la sustituya por nuevos valores predeterminados de DTO.
3. Confirme mediante el [enrutamiento de definiciones](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution) que hay un worker elegible. Repair no crea un worker ni demuestra compatibilidad de replay.
4. Use `POST /api/workflows/{workflowId}/runs/{runId}/repair` con las credenciales habituales de operador autorizado y el namespace. La ruta de ejecución seleccionada rechaza un destino histórico en vez de reparar silenciosamente una ejecución más reciente. PHP también ofrece `Client::repairWorkflow($workflowId, $runId)`; `repair_workflow(workflow_id)` de Python apunta a la instancia actual y Rust no tiene un método auxiliar de reparación equivalente.
5. Verifique que el mismo original continúa con su entrada y prefijo de historial registrados y confirma una sola vez el resultado esperado. Un plazo original ya vencido sigue siendo aplicable. Si la sustitución continúa siendo incompatible, inspeccione el nuevo rechazo en vez de repetir repair continuamente.

Las versiones anteriores de Server pueden almacenar el motivo específico del SDK sin clasificarlo como bloqueo de replay; informar del fallo no basta para garantizar que no habrá reintentos automáticos. Use la combinación de runtime y SDK validada. Consulte los límites por lenguaje en [Versionado](./features/versioning.md#service-sdk-entry-safeguard) y las rutas autenticadas de ejecución seleccionada en [Comandos de workflow](./polyglot/server-api-reference.md#workflow-commands).

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

Para un presupuesto compartido de intentos entre workflows y colas, combine los límites de reintento con [admission del Server y un breaker de aplicación](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Cuentan los primeros intentos y reintentos; la ejecución local/integrada tiene otros límites.

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

### Resolución del retraso entre reintentos {#retry-delay-resolution}

Los valores de `backoff()` de una actividad son segundos enteros. Los intervalos
de reintento duraderos tienen una resolución de un segundo. No use una fracción
como `0.1` para pedir un reintento en 100 ms. Las API de los SDK que generan
intervalos a partir de valores fraccionarios los redondean hacia arriba al
siguiente segundo entero. Las referencias de los SDK de Python y Rust explican
los tipos de parámetros admitidos y sus conversiones.

El siguiente intento puede comenzar al cumplirse el retraso, pero la latencia
de la cola y la carga de los workers pueden demorarlo más. Para pruebas rápidas,
use [tiempo controlado o casos acotados con retraso cero](./testing.md#keeping-delay-tests-fast).

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
- **El redrive es una acción explícita del operador.** El [redrive](#redrive) continúa una ejecución fallida en una ejecución nueva solo cuando lo solicitas, y reutiliza los resultados de las actividades completadas.

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

## Límites de los informes de error de PHP en modo servicio {#php-failure-report-limits}

El SDK de PHP **3.5.0 o posterior** limita los informes de error salientes en modo servicio a mensajes UTF-8 de 62 KiB, pilas de 128 KiB, 64 KiB de metadatos opcionales combinados y un cuerpo completo codificado de 1 MiB, incluidos los marcadores. Se aplican los límites de transporte conocidos que sean menores. La [guía de informes de PHP](./polyglot/php.md#bounded-failure-reports) explica la configuración, los diagnósticos de omisión, la semántica de reintentos conservada y la igualdad entre la primera ejecución local y la reproducción en frío. Estos límites corresponden a los informes del SDK. El registro integrado y el almacenamiento de resúmenes del Core mantienen sus propios contratos.

## Límites de los informes de error de Python en modo servicio {#python-failure-report-limits}

El SDK de Python **2.11.0 o posterior** limita los informes de error salientes en modo servicio a mensajes UTF-8 de 62 KiB, pilas de 128 KiB, 64 KiB de metadatos opcionales combinados y un cuerpo completo codificado de 1 MiB, incluidos los marcadores. Se aplican los límites de transporte conocidos que sean menores. La [guía de informes de Python](./polyglot/python.md#bounded-failure-reports) explica la configuración, los diagnósticos de omisión, la semántica de reintentos conservada y la igualdad entre la primera ejecución local y la reproducción en frío. Estos límites corresponden a los informes del SDK. El registro integrado y el almacenamiento de resúmenes del Core mantienen sus propios contratos.

## Límites de informes de fallo Rust en modo servicio {#rust-failure-report-limits}

En workers de servicio que realmente ejecutan Rust SDK **4.10.1 o posterior**, el mensaje saliente admite hasta 62 KiB UTF-8 con marcador, stack 128 KiB si existe, metadata opcional serializada combinada 64 KiB y cuerpo completo codificado 1 MiB o un límite de transporte conocido menor. Se conservan tipo, retry e identidad; un envelope obligatorio imposible se rechaza. La [guía Rust](./polyglot/rust.md#bounded-failure-reports) explica marcadores, details Avro íntegros y resultados locales. No cualifica SDK antiguos, modo embedded ni la corrección separada del almacenamiento de resúmenes Core.

## Guías relacionadas {#related-guides}

- [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md):
  contrato de reproducción, reintentos, leases y reentrega.
- [Monitorización](./monitoring.md): observación de fallos en Waterline,
  exportaciones, registros de workers y telemetría del entorno.
