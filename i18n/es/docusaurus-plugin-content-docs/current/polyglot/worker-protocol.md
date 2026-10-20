---
sidebar_position: 5
title: Protocolo de workers
description: Implementa el protocolo versionado del plano de workers para sondeo, leases, reproducción de historial, latidos, finalización y resultados de tareas externas.
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - protocolo de workers
  - sondeo de workers externos
  - puente de tareas de workflow
---

# Protocolo de workers {#worker-protocol}

Durable Workflow ofrece un protocolo versionado de workers mediante dos contratos puente. Definen el conjunto completo de operaciones que los workers externos, incluido el servidor independiente de Durable Workflow, utilizan para sondear, reclamar, ejecutar y completar tareas de workflow y actividad.

## Versión del protocolo {#protocol-version}

La versión actual anunciada por el servidor es **1.20**. El protocolo utiliza una numeración de estilo semver:

- La versión **principal** aumenta ante cambios incompatibles (nuevos campos obligatorios, operaciones eliminadas o semántica de paginación modificada).
- La versión **menor** aumenta con cambios aditivos (nuevos campos opcionales o tipos de comando no terminales).

Los workers pueden utilizar una versión menor anterior dentro de la misma principal. Un servidor que anuncia `1.N` acepta `X-Durable-Workflow-Protocol-Version: 1.M` si `M <= N` y devuelve su `1.N` anunciado en la respuesta. Por tanto, el servidor predeterminado `1.20` acepta solicitudes de `1.0` a `1.20`. Descubre la versión menor necesaria de cada SDK y su perfil opcional de capacidades antes de desplegar. Se rechazan cabeceras ausentes o malformadas, versiones principales distintas y versiones menores del worker superiores a la del servidor.

PHP SDK 2.3.2, Python SDK 2.5.7 y Rust SDK 3.5.0 utilizan `1.20` por defecto. También permiten seleccionar explícitamente `1.19` para un Server anterior compatible. Las capacidades opcionales, incluida la cancelación cooperativa, requieren habilitación explícita. Elegir una versión de protocolo no las habilita. Consulta la [documentación de cada SDK](/docs/polyglot/deployment-modes/) para configuración y metadatos de compatibilidad publicados.

Puedes recuperar la descripción completa mediante programación:

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## Descubrimiento de capacidades {#capability-discovery}

El servidor independiente publica capacidades en `worker_protocol.server_capabilities` de `GET /api/cluster/info`. El mismo objeto se devuelve como `server_capabilities` en respuestas del plano de workers, incluidos sondeos, latidos, finalizaciones y fallos.

Lee estos campos antes de enviar campos opcionales de comandos:

- `supported_workflow_task_commands`: tipos de comando aceptados al completar tareas de workflow.
- `poll_status`: estado legible por máquinas incluso sin tarea asignada, que distingue `leased`, `empty`, `throttled` y `unavailable` sin inferir el estado de `task: null`.
- `activity_retry_policy` y `activity_timeouts`: opciones de reintento y tiempos de espera de comandos de actividad.
- `worker_session_verbs` y `worker_sessions`: operaciones de sesión, campos de comando de actividad, renovación, detección de fallos y estados terminales. La estructura del runtime de sesiones está especificada en [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json).
- `child_workflow_retry_policy` y `child_workflow_timeouts`: opciones de reintento y tiempos de espera de workflows hijos.
- `parent_close_policy`: políticas de cierre del padre para hijos.
- `query_tasks`: consultas de workflow enrutadas por el servidor a runtimes externos.
- `non_retryable_failures`: metadatos de fallos de workflow y actividad.

Antes de sondear, cada worker debe registrar espacio de nombres, cola, runtime, claves de tipos y capacidad local con `POST /api/worker/register`. La referencia de [Espacios de nombres, autenticación y registro de workers](/docs/polyglot/namespace-auth-workers) fija esa carga y el contrato de autenticación por rol. Para el descubrimiento de tareas listas y asignación de leases subyacente, consulta [Asignación y despacho de tareas](/docs/polyglot/task-matching-dispatch). Para afinidad de actividades entre pasos duraderos, consulta [Sesiones de worker](/docs/features/worker-sessions).

## Semántica de ejecución {#execution-semantics}

El transporte de workers es coordinación distribuida al menos una vez, no entrega exactamente una vez:

- la reproducción de tareas reconstruye el estado desde historial confirmado; no es un reintento del workflow completo
- vencer la lease de una actividad puede provocar nueva entrega a otro worker
- los informes tardíos de finalización o fallo pueden rechazarse como obsoletos porque otro intento ya ganó la carrera duradera

Utiliza `activity_execution_id` como clave remota predeterminada de idempotencia al comunicar con otro sistema desde un worker o transportador. Utiliza `activity_attempt_id` solo si el sistema posterior debe distinguir intentos separados de la misma ejecución lógica de actividad.

Consulta [Garantías de ejecución e idempotencia](/docs/constraints/execution-guarantees) para el contrato autoritativo de reproducción, reintentos, vencimiento de leases, nueva entrega e historial duradero exactamente una vez.

## Puente de tareas de workflow {#workflow-task-bridge}

`WorkflowTaskBridge` define cómo interactúa un worker externo con tareas duraderas:

| Operación | Descripción |
|------|-------------|
| `poll` | Encontrar tareas listas coincidentes con cola y compatibilidad |
| `claim` / `claimStatus` | Reclamar una tarea concreta con una lease de 5 minutos |
| `historyPayload` | Recuperar el historial completo de reproducción de una tarea reclamada |
| `historyPayloadPaginated` | Recuperar historial paginado para workflows grandes |
| `execute` | Reclamar y ejecutar en el proceso mediante el ejecutor del paquete |
| `complete` | Enviar comandos de un worker externo para completar una tarea |
| `fail` | Registrar un fallo de tarea desde un worker externo |
| `heartbeat` | Ampliar la lease de una tarea reclamada |

### Historial paginado {#paginated-history}

Para historiales grandes, utiliza `historyPayloadPaginated` para recuperar páginas:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

El tamaño predeterminado es 500 eventos (coincide con `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` y `default_history_page_size` publicado por el servidor); el máximo es 1000. El servidor puede anunciar otro valor predeterminado efectivo en el manifiesto, así que prefiere la capacidad publicada a fijar cualquiera de esos números. La respuesta incluye `has_more` y `next_after_sequence` para paginar por cursor.

### Compresión del historial {#history-compression}

Para historiales muy grandes, el puente o servidor puede comprimir eventos y reducir la transferencia. Es opcional: quien llama debe solicitarla con un parámetro de estilo `Accept-Encoding`.

Cuando el número de eventos supera el umbral de compresión (50 eventos), el puente puede devolver:

- `history_events`: `[]` (array vacío que indica que los eventos están en la clave comprimida)
- `history_events_compressed`: carga comprimida codificada en base64
- `history_events_encoding`: algoritmo utilizado (`gzip` o `deflate`)

Quien llama decodifica base64, descomprime con el algoritmo indicado y decodifica JSON para recuperar el array original `history_events`.

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

Si no se solicita compresión o el número de eventos queda bajo el umbral, se devuelve el array normal `history_events` sin comprimir.

### Semántica de sondeo largo {#long-poll-semantics}

Ambas operaciones `poll` admiten sondeo largo opcional. Con `timeout_seconds`, el puente o servidor mantiene la conexión hasta esa duración esperando una tarea coincidente lista, en lugar de devolver un resultado vacío inmediatamente.

| Parámetro | Predeterminado | Mínimo | Máximo |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

Comportamiento:

- Si una tarea queda lista durante la espera, se devuelve inmediatamente.
- Si vence sin tarea, se conserva el sobre normal con `task: null` y `poll_status: "empty"`.
- El cliente debe reintentar inmediatamente tras un sondeo largo vacío salvo que se esté apagando.
- Los tiempos de espera HTTP del transporte deben superar 60 segundos para evitar desconexiones prematuras.

Todas las respuestas de sondeo incluyen `poll_status`:

| Valor | Significado |
|------|---------|
| `leased` | El servidor concedió una lease de tarea a este worker. |
| `empty` | No hubo tarea coincidente lista antes de terminar el sondeo corto o la espera larga. |
| `throttled` | Los límites de admisión impidieron conceder trabajo aunque pueda haber tareas listas. |
| `unavailable` | La cola o ruta de asignación no estaba disponible temporalmente; el worker debe tratarlo como fallo transitorio de infraestructura. |

Decide según `poll_status` antes de suponer que un sondeo vacío significa capacidad ociosa. `task: null` con `poll_status: "throttled"` es contrapresión, no ausencia de trabajo.

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### Estado de respuesta al sondeo {#poll-response-status}

El servidor conserva un contrato común para sondeo de workflow, actividad y consulta:

- `task`: carga de la tarea con lease, o `null` si no se asignó trabajo.
- `poll_status`: resultado legible por máquinas del intento de sondeo.
- `protocol_version` y `server_capabilities`: campos devueltos del manifiesto de workers.

Los workers deben decidir según `poll_status` antes de hacer suposiciones de ruta sobre `task`:

| `poll_status` | Estado HTTP habitual | Significado |
| --- | --- | --- |
| `leased` | `200` | Se asignó trabajo mediante lease y `task` contiene la carga. |
| `empty` | `200` | No hubo tarea coincidente lista antes de devolver el sondeo. |
| `throttled` | `200` | La admisión de cola impidió una nueva lease en este intento. |
| `unavailable` | `503` o `200` | No se pudo coordinar la cola con seguridad y se devuelve indisponibilidad tipada. |
| `draining` | `409` | La cohorte por build id está drenando; se rechaza trabajo nuevo con `reason: "worker_draining"`. |

### Solicitudes de finalización, latido y fallo {#completion-heartbeat-and-fail-requests}

Los endpoints `complete`, `heartbeat` y `fail` exigen que el worker repita dos campos de identidad de lease del sondeo o reclamación:

| Campo | Tipo | Descripción |
|------|------|-------------|
| `lease_owner` | string | Identidad del worker titular de la lease. Debe coincidir con `lease_owner` de `poll` o `claim`. |
| `workflow_task_attempt` | integer ≥ 1 | Número de intento de la tarea con lease. Debe coincidir con `workflow_task_attempt` de `poll` o `claim`. |

Se rechazan intentos obsoletos o titulares incorrectos antes de aplicar comandos, para impedir que un worker cuya lease venció confirme comandos de reproducción sobre una tarea reclamada de nuevo.

Endpoints y cuerpos:

- `POST /api/worker/workflow-tasks/{task_id}/complete`: requiere `lease_owner`, `workflow_task_attempt` y un array no vacío `commands`. Consulta [Tipos de comando](#command-types) para sus estructuras.
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat`: requiere `lease_owner` y `workflow_task_attempt`. Devuelve el vencimiento renovado y el estado actual de ejecución.
- `POST /api/worker/workflow-tasks/{task_id}/fail`: requiere `lease_owner`, `workflow_task_attempt` y `failure` con `message` obligatorio y `type` y `stack_trace` opcionales.

Ejemplo de finalización:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

Ejemplo de latido:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

Ejemplo de fallo:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### Tipos de comando {#command-types}

Al completar una tarea, el worker externo envía una lista de comandos tipados. Se permite como máximo un comando terminal por finalización.

**Comandos no terminales** (cero o más, procesados en orden):

| Tipo | Campos obligatorios | Descripción |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | Programar la ejecución de una actividad |
| `start_timer` | `delay_seconds` | Programar un temporizador duradero |
| `start_child_workflow` | `workflow_type` | Iniciar una instancia hija |
| `complete_update` | `update_id` | Marcar una actualización aceptada como aplicada y completada |
| `fail_update` | `update_id`, `message` | Marcar una actualización aceptada como fallida |
| `record_side_effect` | `result` | Registrar un resultado de efecto secundario determinista |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Registrar una decisión de versionado |
| `upsert_search_attributes` | `attributes` | Insertar o actualizar metadatos indexados de la ejecución |

`schedule_activity` acepta campos opcionales `retry_policy`, `start_to_close_timeout`, `schedule_to_start_timeout`, `schedule_to_close_timeout` y `heartbeat_timeout`. `retry_policy` utiliza `max_attempts`, `backoff_seconds` y `non_retryable_error_types`.

`start_child_workflow` acepta `parent_close_policy`, `retry_policy`, `execution_timeout_seconds` y `run_timeout_seconds` opcionales. `parent_close_policy` es `abandon`, `request_cancel`, `request_cancellation` o `terminate`. `request_cancel` cierra al hijo inmediatamente; `request_cancellation` solicita limpieza cooperativa con identidad y plazo de cancelación originales. Consulta [cancelación cooperativa](/docs/polyglot/cancellation). Los reintentos del hijo utilizan la misma estructura `max_attempts`, `backoff_seconds` y `non_retryable_error_types` que las actividades. La espera se aplica tras fallar una ejecución hija; comandos de inicio no válidos son errores de protocolo y no consumen intentos de reintento del hijo.

`complete_update` cierra la actualización aceptada identificada por `update_id` tras aplicar el manejador. Acepta `result` opcional con el mismo sobre `{codec, blob}` que los resultados de workflow. `fail_update` la cierra como fallida y acepta `exception_class`, `exception_type` y `non_retryable` opcionales además del `message` obligatorio.

**Comandos terminales** (como máximo uno):

| Tipo | Campos obligatorios | Descripción |
|------|----------------|-------------|
| `complete_workflow` | — | Marcar la ejecución como completada (`result` opcional) |
| `fail_workflow` | `message` | Marcar la ejecución como fallida |
| `continue_as_new` | — | Cerrar la ejecución e iniciar otra (`arguments` y `workflow_type` opcionales) |

Si cancelar o terminar cierra la ejecución mientras una tarea tiene lease, sus llamadas `history`, `heartbeat`, `complete` y `fail` conservan el sobre pero rechazan con `reason: "run_closed"`. Incluyen `can_continue: false`, `cancel_requested: true` y un `stop_reason` concreto como `run_cancelled` o `run_terminated`, para distinguir cancelación de un error genérico de lease. También incluyen `run_closed_reason` y `run_closed_at` del registro duradero para registrar el estado exacto de cierre que detuvo la tarea.

Las respuestas de sondeo incluyen contexto estable de reanudación copiado de la carga duradera:

| Campo | Significado |
|------|---------|
| `workflow_wait_kind` | Espera aplicada: `update`, `signal`, `child`, `condition`, `timer` o `null` para reproducción/inicio ordinarios |
| `open_wait_id` | Identidad estable de espera como `update:{id}` o `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | Origen duradero que despertó la tarea, como `workflow_update`, `workflow_signal`, `timer` o `child_workflow_run` |
| `workflow_update_id` | ID de actualización aceptada que aplica la tarea |
| `workflow_signal_id` | ID de señal aceptada que aplica la tarea |
| `signal_name` / `signal_wait_id` | Destino de señal e identidad estable al aplicar una señal o espera de señal con temporizador |
| `workflow_command_id` | ID de comando del plano de control que produjo la tarea, si existe |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | Identificadores de actividad al reanudar tras actividad completada o fallida |
| `child_call_id` / `child_workflow_run_id` | Identificadores de espera hija al resolver un workflow hijo |
| `timer_id` / `condition_wait_id` | Identificadores de temporizador puro y condición con temporizador al reanudar tras un temporizador |
| `condition_key` / `condition_definition_fingerprint` | Etiqueta estable y huella del predicado si la espera de condición con temporizador las registró |
| `workflow_sequence` / `workflow_event_type` | Secuencia y tipo de evento de historial para tareas de resolución de actividad, hijo o temporizador basadas en eventos |

Los campos no aplicables son `null`. Los workers SDK deben preferirlos a recorrer el historial para correlacionar una tarea con una actualización o señal aceptada, resultado de actividad, resolución de hijo o espera con temporizador. Las reanudaciones de temporizador puro fijan `workflow_wait_kind: "timer"`, `open_wait_id: "timer:{timer_id}"`, `resume_source_kind: "timer"` y `timer_id`. Las de señal fijan `workflow_wait_kind: "signal"` y `signal_name`; las de aplicación de señal aceptada añaden `workflow_signal_id`, y las esperas de señal con temporizador fijan `signal_wait_id` con el `timer_id` disparado. Los vencimientos de condición fijan `workflow_wait_kind: "condition"`, `condition_wait_id` y, para esperas con clave, `condition_key` y `condition_definition_fingerprint`.

## Tareas de consulta {#query-tasks}

Si una consulta del plano de control apunta a un workflow cuyo código pertenece a un runtime externo, el servidor no puede reproducirlo en su proceso PHP. Crea una tarea de consulta efímera y espera a un worker activo con capacidad de consulta en la cola del workflow. Esto incluye workers remotos del SDK de PHP cuyo código está fuera del proceso Server.

Las consultas son de solo lectura. Los workers reproducen el historial suministrado, invocan el manejador registrado y completan o fallan la tarea. No escriben eventos duraderos y no se reintentan después de vencer la consulta del llamante.

| Endpoint | Descripción |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Sondear con espera larga una consulta en la cola registrada del worker |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | Enviar el resultado |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | Rechazar o fallar la consulta |

Solicitud de sondeo:

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

Respuesta de sondeo:

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

`task` es `null` si no se concede una lease. Utiliza `poll_status` para distinguir espera vacía normal, limitación e indisponibilidad temporal. El worker debe repetir `lease_owner` y `query_task_attempt` al completar o fallar; se rechazan intentos obsoletos y titulares incorrectos.

Solicitud de finalización:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

Solicitud de fallo:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

Utiliza `reason: "rejected_unknown_query"` si no hay manejador coincidente; quien llama recibe `404`. Otros fallos de consulta del worker deben usar `reason: "query_rejected"` y devuelven `409`. Sin worker activo capaz, el plano de control devuelve `query_worker_unavailable`; si no llega un resultado antes del tiempo configurado, devuelve `query_worker_timeout`.

## Puente de tareas de actividad {#activity-task-bridge}

`ActivityTaskBridge` define la interacción del worker externo con actividades:

| Operación | Descripción |
|------|-------------|
| `poll` | Encontrar actividades listas coincidentes con cola y compatibilidad |
| `claim` / `claimStatus` | Reclamar una actividad concreta con lease |
| `complete` | Registrar finalización con resultado |
| `fail` | Registrar fallo, con `failure.details` opcional etiquetado con códec |
| `status` | Comprobar actividad y cancelación sin renovar la lease |
| `heartbeat` | Ampliar la lease e informar opcionalmente del progreso |

Los latidos de actividad incluyen `can_continue` y `cancel_requested` para responder a cancelaciones en actividades largas. Si cancelar o terminar una ejecución detiene una actividad con lease, las respuestas de latido, finalización y fallo también incluyen `run_closed_reason` y `run_closed_at`.

## Códecs de cargas útiles {#payload-codecs}

Toda cadena de bytes que cruza el protocolo lleva **`payload_codec`**, que identifica el formato del blob. V2 utiliza un único códec independiente del lenguaje, **`avro`**, para que cualquier SDK (PHP, Python, Go, TypeScript, Rust) pueda codificar y decodificar sin compartir runtime ni clave de aplicación. El servidor anuncia sus códecs en **`capabilities.payload_codecs`** de `GET /api/cluster/info`.

### El códec `avro` {#the-avro-codec}

`avro` es el códec de valores tipados v2. Toda carga utiliza el esquema recursivo fijo `durable_workflow.protocol.Value` y tramas estándar de objeto único Avro. Sus ramas con nombre conservan booleanos, enteros de 64 bits con signo, doubles finitos, bytes, cadenas UTF-8, listas y mapas con claves de cadena sin esquemas por workflow ni registro. Consulta el [protocolo Avro Value](/docs/polyglot/avro-value-protocol/).

### Formato de transmisión: sobre de cargas útiles {#wire-format-payload-envelope}

En campos con bytes (`arguments`, `result`, `payload`, etc.), el protocolo expone el códec junto a la cadena opaca. Las respuestas de sondeo tienen este aspecto:

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

El worker lee `payload_codec` y confirma que sea `avro` antes de decodificar. Un valor desconocido es un error; no debe intentar detectar ni adivinar el formato.

Las finalizaciones de actividad envían `result` con el mismo sobre `{codec, blob}`. Los fallos pueden enviar diagnósticos estructurados en `failure.details`, también como `{codec, blob}`. El servidor guarda el blob literalmente y registra `details_payload_codec` con el fallo duradero para intercambiar diagnósticos con workers no PHP sin serialización PHP.

La interfaz estable de fallos entre lenguajes es `activity_type`, `failure_category`, `exception_type`, `message`, `code`, `non_retryable` y `details` etiquetado con códec. Los nombres de clase de excepción, rutas de archivos, líneas y trazas son solo diagnósticos. Los SDK no deben exponerlos en su `exception_payload` predeterminado; solo pueden mostrarlos si un worker o servidor registra explícitamente un sobre `diagnostics` o `runtime_diagnostics`.

### Iniciar un workflow {#starting-a-workflow}

`POST /api/workflows` acepta dos formas de `input`:

1. **Array JSON simple**: el servidor adapta cada valor al esquema fijo Avro Value. JSON no expresa la rama de bytes; los clientes que necesiten bytes envían un sobre Avro explícito.

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **Sobre explícito**: para clientes que ya tengan bytes codificados:

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

El servidor guarda el blob literalmente y etiqueta la ejecución con `avro`.

El códec se guarda en `WorkflowRun` y **se propaga durante toda la vida de la ejecución**: argumentos y resultados de actividad, argumentos de señal/actualización y entradas de hijos se codifican en Avro.

Los inicios integrados/del paquete (desde PHP mediante `WorkflowStub::make(...)->start(...)` en lugar de HTTP) también resuelven el códec predeterminado de nuevas ejecuciones mediante el contrato final v2 exclusivamente Avro.

## Resolver los puentes {#resolving-the-bridges}

Ambos puentes están registrados en el contenedor Laravel y pueden resolverse directamente:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## Guías relacionadas {#related-guides}

- [Servidor](./server.md) documenta los endpoints del plano de control y la forma de despliegue que aloja este protocolo.
- [Interfaz de ejecución externa](./external-execution.md) explica los contratos de workers, puentes y manejadores con garantías de actividad construidos sobre el protocolo.
