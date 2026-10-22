---
sidebar_position: 5
---

# Límites estructurales {#structural-limits}

Los límites estructurales acotan los recursos que consume una sola ejecución de workflow. Cuando una operación superaría un límite configurado, el motor registra un fallo con un tipo definido, la categoría de fallo legible por máquina `structural_limit` y el tipo de límite concreto, y después hace fallar la ejecución. Esto protege al sistema frente a la expansión paralela ilimitada, las cargas útiles demasiado grandes y el crecimiento excesivo de metadatos.

## Tipos de límite {#limit-kinds}

| Tipo de límite | Valor predeterminado | Qué limita |
|---|---|---|
| `pending_activity_count` | 2,000 | Ejecuciones de actividad no terminales abiertas simultáneamente |
| `pending_child_count` | 1,000 | Workflows hijos no terminales abiertos simultáneamente |
| `pending_timer_count` | 2,000 | Temporizadores pendientes abiertos simultáneamente |
| `pending_signal_count` | 5,000 | Señales sin procesar pendientes simultáneamente |
| `pending_update_count` | 500 | Actualizaciones sin resolver pendientes simultáneamente |
| `command_batch_size` | 1,000 | Elementos de una sola expansión paralela (`all()`) |
| `payload_size_bytes` | 2 MiB | Tamaño serializado de una sola carga útil de argumentos |
| `memo_size_bytes` | 256 KiB | Tamaño serializado de los metadatos memo no indexados |
| `search_attribute_size_bytes` | 40 KiB | Tamaño serializado de los metadatos de atributos de búsqueda indexados |
| `history_transaction_size` | 5,000 | Eventos de historial producidos por una sola ejecución de tarea de workflow |

Todos los límites se aplican al programar, registrar o admitir comandos. Un valor de `0` desactiva la comprobación para ese tipo de límite.

## Advertencias al acercarse al límite {#soft-limit-warnings}

Antes de que un límite estricto termine una ejecución o rechace un comando, el motor puede advertir de que un recurso se está acercando al máximo. Cuando un recurso basado en recuentos (actividades, hijos, temporizadores, señales o actualizaciones pendientes, tamaño del lote de comandos o eventos de una transacción de historial) cruza un porcentaje configurable del límite estricto, el motor registra una advertencia estructurada.

El umbral predeterminado es **80%**. Por ejemplo, con el límite predeterminado de `pending_activity_count` de 2,000, se registra una advertencia cuando una ejecución alcanza 1,600 actividades pendientes. La ejecución continúa normalmente. La advertencia da tiempo a los operadores para reaccionar (escalar workers, iniciar continue-as-new o aumentar el límite) antes de que el límite estricto haga fallar la ejecución.

Configura el umbral mediante `workflows.v2.structural_limits.warning_threshold_percent`:

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

Establécelo en `0` para desactivar por completo estas advertencias.

Las entradas de advertencia incluyen contexto estructurado:

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

El contexto estructurado del registro incluye `workflow_run_id`, `workflow_type`, `limit_kind`, `current`, `limit` y `utilization_percent` para integrarlo con herramientas de agregación de registros y alertas.

## Configuración {#configuration}

Sobrescribe cualquier límite mediante `workflows.v2.structural_limits` en la configuración o mediante variables de entorno:

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 262144),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## Puntos de aplicación {#enforcement-points}

### Límites de elementos pendientes en el ejecutor {#pending-count-limits-executor-side}

Antes de programar una actividad, un workflow hijo o un temporizador, el ejecutor cuenta los elementos no terminales de ese tipo en la ejecución. Si el recuento ya es igual o superior al límite configurado, la ejecución falla inmediatamente con una `StructuralLimitExceededException`.

Esto protege frente a patrones como bucles de expansión paralela ilimitada que acumulan miles de operaciones pendientes:

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

Para procesar lotes grandes dentro de los límites, divide los elementos en grupos de tamaño acotado:

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Límites de elementos pendientes en la admisión {#pending-count-limits-intake-side}

Cuando llega un comando de señal o actualización a través del plano de control, un webhook o `WorkflowStub`, el motor comprueba el recuento de señales sin procesar (estado `received`) o actualizaciones sin resolver (estado `accepted`) de la ejecución de destino antes de aceptar el comando.

Si el recuento es igual o superior al límite configurado, el comando se **rechaza** con el motivo `structural_limit_exceeded`. La respuesta de rechazo incluye metadatos legibles por máquina (`structural_limit_kind`, `structural_limit_value`, `structural_limit_configured`) para que quien realiza la llamada pueda identificar la causa.

A diferencia de los límites del ejecutor, que hacen fallar la ejecución, los límites de admisión rechazan el comando individual sin terminar el workflow. La ejecución sigue activa y quien realiza la llamada puede reintentar una vez procesados los elementos pendientes.

En una actualización del Server con `request_id`, el rechazo queda conservado bajo esa clave. Reutilizarla devuelve el rechazo original incluso si cambian la capacidad o la configuración. Tras confirmar el rechazo y recuperar capacidad, usa una clave nueva para una nueva admisión. Una respuesta incierta es distinta: recupera primero el recibo original antes de decidir si otra admisión es segura.

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### Tamaño del lote de comandos {#command-batch-size}

La función `all()` compara el número total de operaciones hoja de un solo grupo de expansión paralela con `command_batch_size`. Lo hace antes de programar actividades o hijos individuales, por lo que la ejecución falla de forma limpia en lugar de programar el lote parcialmente.

### Tamaño de la carga útil {#payload-size}

Cuando el ejecutor programa una actividad o un workflow hijo, serializa la carga útil de argumentos y compara su longitud en bytes con `payload_size_bytes`. Si la carga útil serializada supera el límite, la ejecución falla antes de crear filas de base de datos para la operación.

Esto se aplica a:

- **Argumentos de actividades**: se comprueban cuando `scheduleActivity` serializa los argumentos de `ActivityCall`.
- **Argumentos de workflows hijos**: se comprueban cuando `scheduleChildWorkflow` serializa los argumentos de inicio del hijo, antes de crear las filas de instancia o ejecución del hijo.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

Para respetar el límite, activa el
[almacenamiento externo de cargas útiles](../features/external-payload-storage.md)
en el namespace para que el runtime traslade de forma transparente las cargas
que superen el umbral en un almacén de objetos configurado, o guarda los bytes
por tu cuenta y pasa una referencia gestionada por la aplicación:

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

El almacenamiento externo de cargas útiles mantiene la integridad de la
reproducción registrando en el historial un sobre
`durable-workflow.v2.external-payload-reference.v1` con un hash. Por tanto, el
límite se aplica al sobre de referencia y no a los bytes almacenados externamente.

### Tamaño de memo {#memo-size}

Cuando un workflow inserta o actualiza entradas de memo mediante `upsertMemo()`, el ejecutor combina las nuevas entradas con el mapa de memo existente, codifica el resultado combinado en JSON y compara su longitud en bytes con `memo_size_bytes`. Si el memo combinado supera el límite, la ejecución falla antes de persistirlo.

### Tamaño de la transacción de historial {#history-transaction-size}

Cada ejecución de una tarea de workflow (un solo «turno» de reproducción y avance) puede producir nuevos eventos de historial: programación de actividades, creación de temporizadores, registro de side effects, inserciones o actualizaciones de atributos de búsqueda, etc. El límite `history_transaction_size` acota el número total de eventos nuevos que puede producir una sola tarea.

Esto detecta bucles descontrolados que crean eventos sin límite dentro de una sola tarea sin ceder el control:

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

La comprobación se ejecuta al principio de cada iteración del bucle principal del ejecutor. Los eventos de la reproducción (lectura del historial existente) no cuentan para el límite. Solo contribuyen los eventos nuevos escritos durante la tarea actual.

### Tamaño de los atributos de búsqueda {#search-attribute-size}

Cuando un workflow inserta o actualiza atributos de búsqueda mediante `upsertSearchAttributes()`, el ejecutor combina los nuevos atributos con los existentes, codifica el resultado combinado en JSON y compara su longitud en bytes con `search_attribute_size_bytes`. Si los atributos combinados superan el límite, la ejecución falla antes de persistirlos.

## Clasificación de fallos {#failure-taxonomy}

Cuando se supera un límite estructural, el motor registra:

- Una fila `WorkflowFailure` con `failure_category = structural_limit`.
- Un evento de historial `WorkflowFailed` con:
  - `failure_category = structural_limit`
  - `structural_limit_kind`: el límite concreto que se ha superado (por ejemplo, `pending_activity_count` o `command_batch_size`).
  - `structural_limit_value`: el recuento o tamaño actual que ha activado el límite.
  - `structural_limit_configured`: el máximo configurado.

Estos metadatos son legibles por máquina, por lo que los operadores, Waterline y las herramientas externas pueden identificar la causa sin analizar mensajes de texto libre.

## Comprobación de salud {#health-check}

La configuración actual de límites estructurales se incluye en la instantánea de salud de v2 bajo `structural_limits`, de modo que los operadores pueden ver los máximos activos:

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 262144,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## Límites que dependen del backend {#backend-dependent-limits}

La instantánea de capacidades del backend publica el contrato completo de límites estructurales ajustado a la infraestructura actual. La mayoría de los límites son valores de configuración independientes del backend, pero algunos backends imponen restricciones adicionales:

- **Cola SQS**: los [retardos de mensajes de SQS estándar](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html) tienen un máximo de 900 segundos. La capa de transporte divide en tramos las esperas más largas de temporizadores, reintentos de actividad y tareas de workflow. La instantánea de capacidades conserva `max_single_timer_delay_seconds: 900` por compatibilidad.
- **Base de datos SQLite**: SQLite serializa las escrituras, por lo que la instantánea indica `concurrent_write_safety: limited`. Los límites altos de elementos pendientes pueden provocar contención de bloqueos con carga de workers concurrentes.

Una entrega anticipada de SQS programa otro mensaje con retardo acotado sin
adquirir la lease de la tarea duradera, consumir un intento de ejecución,
escribir historial de ejecución ni ejecutar código del usuario. El
`available_at` original no cambia. Cuando llega el momento, la tarea sigue la
ejecución normal y las protecciones frente a entregas duplicadas. Los plazos
globales del workflow y de la actividad siguen transcurriendo durante la
espera, por lo que debes elegir una espera entre reintentos que quepa dentro
de esos presupuestos. Los controladores de cola sin un máximo de retardo
conservan exactamente el retardo solicitado.

El contrato completo está disponible en la sección `structural_limits` de la respuesta de capacidades del backend:

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline {#waterline}

Waterline muestra los fallos por límites estructurales en la tabla de excepciones con la categoría de fallo `structural_limit`. Los detalles del fallo en la línea de tiempo incluyen el tipo de límite, el valor actual y el máximo configurado.

## Límites de Server en la recepción de solicitudes {#server-request-boundary-limits}

Al utilizar el servidor independiente, se aplica otro conjunto de máximos en el límite de entrada de solicitudes HTTP, antes de que una tarea de workflow, señal, actualización o consulta llegue al plano de control. Estos límites rechazan de inmediato con una respuesta `422 validation_failed` (o `413 payload_too_large` para comprobaciones de todo el cuerpo), de modo que los clientes conocen el motivo sin que el servidor escriba ninguna fila en la base de datos.

| Límite | Valor predeterminado | Clave de configuración | Qué limita |
|---|---|---|---|
| Tamaño del cuerpo | 2 MiB | `server.limits.max_payload_bytes` | Total de bytes del cuerpo de la solicitud HTTP |
| Tamaño de memo | 256 KiB | `server.limits.max_memo_bytes` | Memo serializado en `POST /workflows` y `POST /schedules` |
| Número de atributos de búsqueda | 100 | `server.limits.max_search_attributes` | Atributos de búsqueda personalizados registrados por namespace |
| Longitud de clave de atributo de búsqueda | 128 bytes | `server.limits.max_search_attribute_key_length` | Longitud de una clave de atributo de búsqueda al iniciar |
| Tamaño de valor de atributo de búsqueda | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Cada valor de cadena (y cada elemento de un valor de matriz) al iniciar |
| Nombre de señal, actualización o consulta | 256 bytes | `server.limits.max_operation_name_length` | Segmento de ruta URL para los nombres de señales, actualizaciones y consultas |
| Longitud de `workflow_id` | 128 caracteres | Validador del controlador | ID del workflow en `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 caracteres | Validador del controlador | Campos de cadena en `POST /workflows` |
| `request_id` | 255 caracteres | Validador del controlador | Token de deduplicación en señales, actualizaciones, cancelación y terminación |
| `reason` | 1,000 caracteres | Validador del controlador | Texto del motivo en cancelación, terminación y archivado |

Cada límite se puede configurar por separado mediante variables de entorno `DW_*` (consulta el contrato completo en `config/dw-contract.php`). Establecer un valor de `0` desactiva la comprobación de ese límite concreto, pero mantiene las demás.

Los valores configurados actualmente se publican bajo `limits` en la respuesta de `GET /api/cluster/info`, de modo que los clientes pueden descubrirlos durante la ejecución:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Los errores de validación se devuelven en el sobre de error estándar del plano de control con `reason: "validation_failed"` y un mapa `validation_errors` cuyas claves corresponden al campo que causa el error (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo`, etc.). Los rechazos por tamaño de carga útil utilizan `reason: "payload_too_large"` y el código de estado `413`.
