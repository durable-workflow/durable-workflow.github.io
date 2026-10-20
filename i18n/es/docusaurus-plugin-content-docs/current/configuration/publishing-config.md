---
sidebar_position: 1
---

# Publicar la configuración {#publishing-config}

Este comando crea el archivo de configuración `workflows.php` en la carpeta `config`.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

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

Estas claves `stored_workflow_*` configuran las clases v1 `Workflow\Models\StoredWorkflow*`. Workflow v2 usa las sustituciones de modelos durables indicadas abajo: `instance_model`, `run_model`, `task_model`, etc. Conserva las claves v1 solo si sigues ejecutando workflows v1 durante la migración.

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

El runtime también permite sustituir modelos de las tablas durables de instancias, ejecuciones, tareas, historial y proyecciones:

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

`completion_timeout_seconds` controla cuánto intentan obtener `attemptUpdate*` y las esperas HTTP un resultado aplicado por un worker antes de devolver un ciclo de vida aceptado, evitando bloquear indefinidamente. `poll_interval_milliseconds` solo ajusta la frecuencia de lectura de la fila durable durante la espera; no cambia el orden de ejecución ni la reproducción. Las métricas de operador de Waterline exponen los valores activos de `update_wait` junto a la política de reparación para mostrar los valores efectivos sin abrir archivos de configuración.

## Ocultación de datos en exportaciones de historial {#history-export-redaction}

Las exportaciones de historial incluyen deliberadamente datos almacenados de workflows, comandos, actividades, actualizaciones, tareas y fallos, porque la depuración por reproducción y el traspaso a archivos necesitan hechos durables. Si los artefactos pueden salir de un entorno protegido, configura un ocultador de datos antes de exponer ampliamente el endpoint de exportación o la salida de la CLI.

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
