---
sidebar_position: 1
---

# Publicar la configuración {#publishing-config}

Este comando crea el archivo de configuración `workflows.php` en la carpeta `config`.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Lease de una tarea de workflow (v2) {#workflow-task-lease-v2}

Configura la lease de tareas de workflow embebidas con un número entero positivo de segundos:

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

Corresponde a `workflows.v2.workflow_task_lease_seconds` en `config/workflows.php` y su valor predeterminado es `300`. Las reservas y renovaciones de tareas leen la configuración efectiva. Cero no desactiva la lease. Tras cambiar la configuración del despliegue, actualiza la configuración en caché y reinicia los workers de larga duración.

Server usa `DW_WORKFLOW_TASK_TIMEOUT` en su lugar y asigna ese valor al ajuste del paquete. Esta lease de recuperación es independiente de los plazos de actividades y workflows. Consulta [Lease de una tarea de workflow](../features/timeouts.md#workflow-task-lease).

## Cambiar la carpeta de workflows {#changing-workflows-folder}

De forma predeterminada, los comandos `make` escriben en la carpeta `app/Workflows`.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

Puedes cambiarla mediante el ajuste `workflows_folder`.

```php
'workflows_folder' => 'Workflows',
```

## Usar modelos personalizados (v1 heredada) {#using-custom-models-legacy-v1}

:::note Versión heredada

Estas claves `stored_workflow_*` configuran las clases v1 `Workflow\Models\StoredWorkflow*`. Workflow v2 usa las sustituciones de modelos duraderos indicadas abajo: `instance_model`, `run_model`, `task_model`, etc. Conserva las claves v1 solo si sigues ejecutando workflows v1 durante la migración.

:::

En el archivo publicado `workflows.php` puedes cambiar las clases de modelo v1 por tus propias subclases.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Usar sustituciones de modelos (v2) {#using-model-overrides-v2}

El runtime también permite sustituir modelos de las tablas duraderas de instancias, ejecuciones, tareas, historial y proyecciones:

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

Estas sustituciones no se limitan a las lecturas o reconstrucciones de proyecciones. `WorkflowStub::make()`, `load()`, `loadSelection()`, la reserva de instancias, la selección de ejecuciones y las tareas de workflow usan `instance_model`, `run_model` y `task_model` configurados. Los detalles de Waterline y la exportación del historial leen mediante las mismas clases. Por tanto, una sustitución en la aplicación gobierna tanto la ruta central del runtime como las lecturas para operadores.

Mantén las subclases personalizadas compatibles con el esquema de los modelos integrados. Si una subclase cambia nombres de tabla u otras convenciones que los modelos del paquete suelen inferir en Eloquent, sustituye también las relaciones afectadas para que `currentRun()`, `runs()` y búsquedas similares coincidan con tu esquema.

Consulta la [Matriz de personalización](./customization-matrix.md) para el contrato
de soporte v2 fijado: qué sustituciones son seguras como subclases heredadas,
cuáles necesitan relaciones explícitas y cómo se integran serializador,
repositorio, salud, importación, migración y escritura.

## Códec de cargas útiles {#payload-codec}

v2 usa `avro` para las cargas útiles de nuevos workflows:

```php
'serializer' => 'avro',
```

- **`avro`** (predeterminado y obligatorio para nuevos workflows v2): codificación binaria Apache Avro. Es compacta en red y almacenamiento, y codifica/decodifica cargas grandes más rápido que el serializador PHP heredado.

Si una configuración v1 publicada sigue estableciendo `serializer`, la versión final de v2 lee el valor para los diagnósticos de `workflow:v2:doctor`, pero las nuevas cargas v2 siguen usando Avro.

### Códecs heredados (solo para migrar desde v1) {#legacy-codecs-v1-migration-only}

Siguen disponibles dos códecs exclusivos de PHP para leer historiales v1 durante la migración:

- `workflow-serializer-y`: `SerializableClosure` de PHP con codificación de escape de bytes (predeterminada en v1).
- `workflow-serializer-base64`: `SerializableClosure` de PHP con codificación base64.

`php artisan workflow:v2:doctor` señala la configuración de `serializer` con un códec heredado. Los nuevos workflows v2 siguen usando Avro; conserva ese ajuste solo mientras terminas o importas ejecuciones v1 que necesiten decodificación nativa PHP.

El lector interno de importación/vaciado v1 reconoce nombres completos de clases heredadas (por ejemplo, `Workflow\Serializers\Y::class`). No son alias públicos de códecs v2 y no pueden seleccionarse desde una nueva ejecución v2 ni un SDK.

## Marcadores de compatibilidad {#compatibility-markers}

El runtime puede asignar un marcador de compatibilidad a cada nueva ejecución y permitir que los workers anuncien cuáles pueden ejecutar con seguridad. Esta barrera mantiene las ejecuciones de larga duración en compilaciones compatibles durante despliegues deliberados de nuevas compilaciones de workers.

Establece el marcador de nuevas ejecuciones en la compilación actual:

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

Opcionalmente, permite que un worker acepte varios marcadores durante el despliegue:

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Ajusta cuánto tiempo permanece visible la instantánea de latido de un worker en la vista de flota respaldada por la base de datos:

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

Opcionalmente, limita esa vista de flota a un espacio de nombres de aplicación o despliegue cuando varias aplicaciones compartan la base de datos de workflow:

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

La configuración publicada `workflows.php` asigna esos valores aquí:

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

Si se omite `supported`, los workers solo aceptan el marcador `current`. Las filas antiguas de tareas y resúmenes creadas antes de existir marcadores por tarea se rellenan con el marcador de su ejecución durante la migración y, si hace falta, al reclamar o recuperar en el runtime. Las tareas y ejecuciones que realmente carecen de marcador siguen pudiendo ser reclamadas por cualquier worker.

El mecanismo alternativo de `getVersion()` prefiere `workflow_definition_fingerprint`, capturado al iniciar la ejecución, cuando una reproducción alcanza una bifurcación nueva que aún no tiene un evento tipado `VersionMarkerRecorded`. Así, una ejecución de la misma compatibilidad puede conservar la rama `DEFAULT_VERSION` si comenzó claramente con una definición anterior. Las ejecuciones cuyo historial `WorkflowStarted` es anterior a esa instantánea recurren al marcador de compatibilidad inicial y a las comprobaciones de secuencias ocupadas. Por eso, sigue rotando `DW_V2_CURRENT_COMPATIBILITY` en despliegues que introduzcan código de workflow versionado y enumera temporalmente los marcadores antiguo y nuevo en `DW_V2_SUPPORTED_COMPATIBILITIES` mientras termina el grupo anterior de workers.

Cada worker de cola también registra en la base de datos una instantánea de latido de compatibilidad durante `Looping` y al atender tareas. Waterline y los helpers de detalle exponen la vista de la compilación local (`compatibility_supported`, `compatibility_reason`) y la de flota (`compatibility_namespace`, `compatibility_supported_in_fleet`, `compatibility_fleet_reason`, `compatibility_fleet`). Si se establece `DW_V2_COMPATIBILITY_NAMESPACE`, las filas de latido de la base de datos deben coincidir con ese espacio. Cada instantánea informa de su `namespace`, `worker_id`, ámbito de cola, marcadores admitidos y `source = database`. Durante una actualización gradual, la vista de flota también lee el formato antiguo de latidos en caché de workers que aún no se han reiniciado con la nueva tabla. Esas filas siguen visibles como alternativa durante el despliegue incluso con un espacio configurado, pero muestran `namespace = null` hasta reiniciarse en la ruta de instantáneas con espacio de nombres. El aislamiento estricto solo se completa cuando todos los workers usan los latidos en base de datos. La recuperación del transporte, como volver a despachar una tarea atrasada o recrear una ausente, ya no depende de que el worker que inspecciona pueda ejecutarla; solo la reclamación final mantiene la barrera de compatibilidad.

Si ya existe una tarea abierta pero ni la compilación actual ni ningún latido activo anuncia su marcador, la ejecución aparece esperando un worker compatible en lugar de mostrar un falso estado `repair_needed` en esa compilación.

## Presupuestos de historial {#history-budgets}

Waterline usa la proyección del resumen de ejecución para informar del tamaño del historial tipado seleccionado. Estos umbrales controlan cuándo la proyección activa `continue_as_new_recommended`:

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

La configuración publicada `workflows.php` asigna esos valores aquí:

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Establece cualquiera de los umbrales en `0` para desactivar esa parte de la recomendación. El indicador es orientativo: úsalo para planificar límites de `continueAsNew()` antes de que crezca el coste de reproducción. No cambia el comportamiento de la ejecución seleccionada.

## Política de espera de actualizaciones {#update-wait-policy}

Las API que esperan a que termine una actualización, como `attemptUpdate()`, las rutas webhook de actualización y los controles de Waterline, esperan un plazo limitado antes de devolver el ciclo de vida de la actualización, que sigue aceptada. Configura el presupuesto predeterminado aquí:

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

La configuración publicada `workflows.php` asigna esos valores aquí:

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` controla cuánto intentan obtener `attemptUpdate*` y las esperas HTTP un resultado aplicado por un worker antes de devolver un ciclo de vida aceptado, evitando bloquear indefinidamente. `poll_interval_milliseconds` solo ajusta la frecuencia de lectura de la fila duradera durante la espera; no cambia el orden de ejecución ni la reproducción. Las métricas de operador de Waterline exponen los valores activos de `update_wait` junto a la política de reparación para mostrar los valores efectivos sin abrir archivos de configuración.

## Ocultación de datos en exportaciones de historial {#history-export-redaction}

Las exportaciones de historial incluyen deliberadamente datos almacenados de workflows, comandos, actividades, actualizaciones, tareas y fallos, porque la depuración por reproducción y el traspaso a archivos necesitan hechos duraderos. Si los artefactos pueden salir de un entorno protegido, configura un ocultador de datos antes de exponer ampliamente el endpoint de exportación o la salida de la CLI.

Crea un ocultador que implemente `Workflow\V2\Contracts\HistoryExportRedactor`:

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

Después regístralo en `config/workflows.php`:

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

El ocultador recibe el valor actual y contexto como `path`, `category`, `workflow_instance_id`, `workflow_run_id` y `workflow_type`. La exportación lo invoca para las cargas de argumentos/resultados del workflow, eventos de historial, carga/contexto de comandos, actualizaciones, tareas, actividades y diagnósticos de mensaje/archivo/traza de fallos. El paquete resultante incluye `redaction.applied`, `redaction.policy` y `redaction.paths` para que las herramientas posteriores identifiquen la política aplicada.

Cada exportación incluye también un bloque `integrity` calculado después de la ocultación. La suma de comprobación usa `canonicalization = json-recursive-ksort-v1` y `checksum_algorithm = sha256`. Si se configura `signing_key`, la misma carga canónica se firma con `signature_algorithm = hmac-sha256` y el `signing_key_id` opcional se informa como `key_id`. Mantén la clave de firma fuera del artefacto y rota su identificador cuando los verificadores posteriores necesiten distinguir claves.

## Interceptores de worker {#worker-interceptors}

Los interceptores de worker están disponibles a partir de la próxima versión del
paquete Workflow. Durable Workflow integrado ejecuta interceptores de worker
ordenados alrededor de las tareas de workflow, actividades, consultas y
validaciones de actualizaciones que ejecuta en los procesos de tu aplicación.
Úsalos para registros de auditoría, etiquetas de métricas, contexto de tenant o
trazas que quieras escribir una sola vez en lugar de en cada workflow y
actividad. La forma de los hooks coincide con la de los interceptores de los SDK
de [Python](../polyglot/python.md#worker-interceptors),
[PHP](../polyglot/php.md#worker-interceptors) y
[Rust](../polyglot/rust.md#worker-interceptors).

Enumera las clases de interceptores en `workflows.v2.interceptors` dentro de
`config/workflows.php`. Se resuelven desde el contenedor de Laravel, de modo que
la inyección por constructor funciona, y se ejecutan en el orden indicado; el
primero es el envoltorio más externo.

```php
'v2' => [
    // ...
    'interceptors' => [
        App\Workflows\AuditInterceptor::class,
    ],
],
```

Cada interceptor implementa `Workflow\V2\Interceptors\WorkerInterceptor`.
Extiende `Workflow\V2\Interceptors\PassthroughWorkerInterceptor` para
implementar solo los hooks que necesites, y llama a `$next($context)` para
continuar la cadena. Este interceptor de auditoría registra cada tarea de
workflow confirmada y cada intento de actividad:

```php
namespace App\Workflows;

use Illuminate\Support\Facades\DB;
use Psr\Log\LoggerInterface;
use Workflow\V2\Interceptors\ActivityInterceptorContext;
use Workflow\V2\Interceptors\PassthroughWorkerInterceptor;
use Workflow\V2\Interceptors\WorkflowTaskInterceptorContext;
use Workflow\V2\Interceptors\WorkflowTaskOutcome;

final class AuditInterceptor extends PassthroughWorkerInterceptor
{
    public function __construct(private readonly LoggerInterface $audit)
    {
    }

    public function executeWorkflowTask(WorkflowTaskInterceptorContext $context, callable $next): WorkflowTaskOutcome
    {
        $outcome = $next($context);
        // The task commits after the chain returns; log only once it has.
        DB::afterCommit(fn () => $this->audit->info('workflow task', [
            'workflow_id' => $context->workflowId,
            'run_id' => $context->runId,
            'attempt' => $context->workflowTaskAttempt,
            'recorded' => $outcome->historyEventTypes,
        ]));

        return $outcome;
    }

    public function executeActivity(ActivityInterceptorContext $context, callable $next): mixed
    {
        $this->audit->info('activity started', [
            'activity_type' => $context->activityType,
            'attempt' => $context->attemptNumber,
            'workflow_id' => $context->workflowId,
        ]);
        try {
            return $next($context);
        } finally {
            $this->audit->info('activity finished', ['activity_type' => $context->activityType]);
        }
    }
}
```

El contenedor construye los interceptores configurados para cada tarea. Registra
uno como singleton cuando deba conservar estado entre tareas.

| Hook | Contexto | Devuelve `$next` |
| --- | --- | --- |
| `executeWorkflowTask($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `taskId`, `workflowType`, `workflowId`, `runId`, `workflowTaskAttempt`, `historyLength`, `replaying` (también `replayState()`) | `WorkflowTaskOutcome` con `historyEventTypes`, `runStatus`, `nextTaskId` |
| `executeActivity($context, $next)` | `workerId`, `connection`, `taskQueue`, `namespace`, `task`, `activityType`, `activityClass`, `arguments`, `attemptNumber`, `taskId`, `activityExecutionId`, `activityAttemptId`, `workflowId`, `runId`, `local`, `activity` | el resultado de la actividad |
| `executeQueryTask($context, $next)` | `workerId` (siempre null), `connection`, `taskQueue`, `namespace`, `task`, `queryName`, `workflowType`, `workflowId`, `runId`, `arguments`, `replayState()` (siempre `Replaying`) | el resultado de la consulta |
| `executeUpdateValidation($context, $next)` | `workerId` (siempre null), `connection`, `taskQueue`, `namespace`, `updateName`, `workflowType`, `workflowId`, `runId`, `arguments`, `replayState()` (siempre `Replaying`) | `UpdateValidationOutcome` con `approved`, `rejectionMessage`, `exceptionType`, `validationErrors` |

`task` es una instantánea en forma de array de la fila de la tarea reclamada,
nunca el propio modelo. `workerId` identifica el proceso del worker de colas por
host e ID de proceso. Las consultas y las validaciones de actualizaciones se
ejecutan en el proceso que las invoca, por lo que su `workerId` es null.

Los interceptores de tareas de workflow no pueden cambiar lo que registra un
workflow:

- `executeWorkflowTask` envuelve la tarea de workflow dentro de su transacción
  de base de datos, una vez por intento de tarea. `replaying` es `true` cuando
  tareas de workflow anteriores ya registraron comandos para la ejecución. No es
  una clave de deduplicación: `historyEventTypes` enumera solo los eventos que
  añadió esta tarea.
- `replayState()` da la misma respuesta como un
  `Workflow\V2\Enums\WorkflowReplayState`, el enum que usa
  `Workflow::replayState()`; el valor del interceptor queda fijo para la tarea.
- Los efectos secundarios de los hooks se ejecutan antes de que la tarea se
  confirme y pueden repetirse cuando se reintenta un intento, así que difiérelos
  con `DB::afterCommit()` o identifícalos con `taskId` y `workflowTaskAttempt`.
- El motor confirma el historial que produjo el código del workflow. El
  resultado es una vista de solo lectura; devolver un resultado distinto, o
  pasar un contexto distinto a `$next`, no cambia nada.
- Un fallo del código del workflow llega al motor sin cambios, aunque un
  interceptor lo capture y devuelva normalmente.
- Si un interceptor lanza una excepción fuera de la cadena, omite `$next` o lo
  llama más de una vez, la transacción de la tarea se revierte, por lo que no se
  registra nada. La tarea se libera con `WorkflowTaskInterceptorFailed` como
  último error y se reintenta tras el backoff de reparación habitual. Un
  interceptor externo aún puede capturar una excepción que un interceptor
  interno lanzó después de `$next` y dejar que la tarea se confirme; un `$next`
  omitido o repetido siempre hace fallar la tarea.
- Los hooks se ejecutan mientras las filas de la ejecución y de la tarea están
  bloqueadas, así que mantenlos breves. No deben confirmar ni revertir la
  transacción que los rodea, ni enviar comandos, como señales, a la ejecución
  que envuelven; un cambio en el estado registrado de la ejecución hace fallar
  la tarea en cada intento.
- Las actividades locales se ejecutan dentro de la tarea de workflow, por lo que
  un hook que sigue fallando después de `$next` hace que cada reintento vuelva a
  ejecutar esas actividades locales.

Los interceptores de validación de actualizaciones envuelven la reproducción y
la llamada al validador que se ejecutan antes de aceptar una actualización con
un `#[UpdateValidator]`. Las actualizaciones sin validador no ejecutan el hook.
Los hooks observan la decisión; no pueden cambiarla:

- El motor actúa según el resultado del propio validador. Devolver otro
  `UpdateValidationOutcome`, o pasar otros argumentos a `$next`, no cambia nada;
  el validador siempre recibe los argumentos de la actualización.
- Si un hook lanza una excepción, omite `$next` o lo llama más de una vez, la
  actualización se rechaza con `UpdateValidationFailedException` y no se
  registra nada, así que un hook nunca puede dejar pasar una actualización sin
  validar.
- El hook se ejecuta dentro de la transacción de admisión de la actualización,
  mientras las filas de la ejecución están bloqueadas, así que mantenlo breve.
  Aplaza los efectos secundarios con `DB::afterCommit()`; las escrituras que
  haga un hook se confirman o se revierten junto con la admisión. El código del
  hook se ejecuta fuera de la fiber del workflow, así que no puede programar
  trabajo duradero para la ejecución.

Los interceptores de actividades y consultas pueden cambiar los argumentos con
`$context->withArguments(...)` y pueden cambiar el valor devuelto, porque el
resultado de una actividad se registra una sola vez y una consulta no registra
nada. Los argumentos de consulta reescritos se vuelven a validar contra el
contrato de la consulta. Las excepciones de actividad atraviesan todos los
interceptores salvo que alguno las maneje, y después pasan por la política de
reintentos normal de la actividad. Los interceptores de actividades envuelven
actividades encoladas y locales; `local` permite distinguirlas. Las actividades
simuladas en `WorkflowStub::fake()` no ejecutan interceptores.

Cuando las [trazas integradas](../monitoring.md#embedded-tracing) están
habilitadas, los spans integrados de workflow y de actividad siguen siendo los
más externos, de modo que los interceptores se ejecutan dentro del span activo y
pueden añadir atributos o spans hijos.

Los interceptores envuelven los jobs de cola, las actividades locales y las
consultas que ejecuta este paquete. Las tareas entregadas a workers de SDK
externos mediante los puentes de tareas de worker se ejecutan con los
interceptores propios de ese SDK. La ruta `execute` del puente de workers, que
ejecuta en el mismo proceso una tarea de workflow reclamada para quien llama al
puente, no ejecuta interceptores de tareas de workflow. Una entrada de
`workflows.v2.interceptors` que no se puede resolver hace fallar cada ruta a su
manera: una tarea de workflow encolada se libera y se reintenta, un intento de
actividad falla según su política de reintentos y una consulta lanza una
excepción a quien la invoca. Revisa la lista al desplegar. La
[guía de interceptores integrados](https://github.com/durable-workflow/workflow/blob/main/docs/worker-interceptors.md)
contiene el contrato completo.
