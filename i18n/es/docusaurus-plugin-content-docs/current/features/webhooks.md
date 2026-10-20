---
sidebar_position: 13
---

# Webhooks {#webhooks}

El framework ofrece webhooks para que sistemas externos inicien workflows y envíen señales dinámicamente. Permiten integrarlos con servicios externos, API y herramientas de automatización.

## Habilitar webhooks {#enabling-webhooks}

Registra las rutas en el archivo de rutas de tu aplicación (`routes/web.php` o `routes/api.php`):

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Pasa el mapa explícito de clases de workflow que quieres exponer. Cada alias se convierte en un segmento público de ruta y cada clase debe tener una clave de tipo duradera estable mediante `#[Type(...)]` o una entrada en `workflows.v2.types.workflows`. Consulta la matriz completa en [Webhooks explícitos de comandos y consultas](#explicit-command-and-query-webhooks).

## Metadatos de visibilidad {#visibility-metadata}

Al registrar rutas mediante `Workflow\V2\Webhooks::routes(...)`, la ruta de inicio también acepta un objeto reservado `visibility`. Sus campos se guardan como metadatos de visibilidad y no se pasan a `handle()`.

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` y `visibility.labels` se copian a la instancia, ejecución, resumen, historial tipado de inicio, detalle seleccionado y exportación. Waterline filtra las listas por esos campos mediante parámetros de consulta de coincidencia exacta.

`visibility.memo` se copia a la instancia, ejecución, historial tipado de inicio, detalle seleccionado y exportación; las ejecuciones posteriores de `continueAsNew()` lo heredan por defecto. Debe ser un objeto JSON en el nivel superior, con escalares, `null`, arrays u objetos anidados. `memo` solo se devuelve como metadatos; no es un filtro de listas ni un campo de búsqueda del resumen.

## Autenticación de webhooks {#webhook-authentication}

Por defecto no requieren autenticación, pero puedes configurar varias estrategias en `config/workflows.php`.

**Importante:** si compartes las URL con terceros o las expones públicamente, activa autenticación por token o firma HMAC para impedir accesos no autorizados.

### Métodos de autenticación {#authentication-methods}

Se admiten:
1. Sin autenticación (`none`).
2. Autenticación por token (`token`).
3. Verificación de firma HMAC (`signature`).
4. Autenticación personalizada (`custom`).

### Autenticación por token {#token-authentication}

Se exige un token API válido en los encabezados. El predeterminado es `Authorization`, pero puedes cambiarlo en la configuración.

#### Ejemplo de solicitud {#example-request}

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### Autenticación por firma HMAC {#hmac-signature-authentication}

Verifica las solicitudes con una clave secreta. El encabezado predeterminado es `X-Signature`, también configurable.

#### Ejemplo de solicitud {#example-request-1}

```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Autenticación personalizada {#custom-authentication}

Crea una clase que implemente `WebhookAuthenticator`:

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Después configúrala en `config/workflows.php`:

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

`validate()` debe devolver el `Request` válido o llamar a `abort(401)` si no está autorizado.

## Configurar rutas de webhooks {#configuring-webhook-routes}

Por defecto están bajo `/webhooks`. Personaliza la ruta en `config/workflows.php`:

```php
'webhooks_route' => 'workflows',
```

Después estarán disponibles bajo:

```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## Webhooks explícitos de comandos y consultas {#explicit-command-and-query-webhooks}

Los comandos duraderos de inicio, señal, actualización, reparación, cancelación y terminación se exponen por HTTP, junto a consultas seguras para la reproducción de ejecuciones actuales o seleccionadas.

Registra un mapa explícito de alias y enruta únicamente los workflows que quieras exponer.

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Una clase registrada directamente debe definir una clave estable con `#[Type(...)]` o estar registrada en `workflows.v2.types.workflows`:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

Registro equivalente en configuración:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

La ruta de inicio resultante es:

```
POST /webhooks/start/order-workflow
```

Ejemplo de solicitud:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

`workflow_id` es el id público opaco de instancia. No es un id de ejecución y debe tratarse como cadena opaca.

Los valores proporcionados por quien llama deben ser cadenas no vacías y seguras para URL de hasta 191 caracteres, solo con letras, números, `.`, `_`, `-` y `:`. Los valores vacíos, demasiado largos o con caracteres no admitidos se rechazan en la validación del webhook con HTTP `422`.

El mismo mapa de tipos duraderos es la alternativa actual del worker si el nombre de clase guardado cambia tras refactorizar. Si mantienes `order-workflow` y apuntas el registro a la nueva clase, el trabajo v2 en cola puede resolver la clave de tipo aunque ya no pueda cargarse la clase PHP original.

También puedes solicitar un comportamiento explícito para inicios duplicados:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

Valores admitidos de `on_duplicate`:

- `reject_duplicate`
- `return_existing_active`

Todos los webhooks de comandos devuelven el mismo sobre JSON:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Respuesta aceptada al crear una ejecución:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Respuesta aceptada al solicitar reutilizar la ejecución activa existente:

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Respuesta de rechazo de inicio duplicado:

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

Campos de respuesta:

- `workflow_id`: id público de instancia.
- `run_id`: primera ejecución activa creada por el comando de inicio aceptado.
- `requested_run_id`: solo se establece al dirigirse explícitamente a una ejecución seleccionada.
- `resolved_run_id`: ejecución realmente resuelta; en inicios dirigidos a instancia coincide con `run_id`.
- `command_id`: id duradero del comando de inicio.
- `command_source`: `webhook` en estas rutas.
- Las rutas de señal, actualización, reparación, cancelación y terminación por instancia resuelven la ejecución duradera más reciente en lugar de confiar solo en el puntero mutable. Así, la cadena de continuaciones sigue accesible por el mismo id aunque cambie esa columna.
- Las rutas dirigidas a ejecución fijan una selección bajo el mismo id de instancia. Si ya no es actual, rechazan con `target_scope = run`, `outcome = rejected_not_current` y `rejection_reason = selected_run_not_current`. `run_id` y `requested_run_id` conservan la selección histórica; `resolved_run_id` apunta a la actual que debe usarse después.
- Las claves de carga se corresponden con los parámetros de `handle()` en orden de declaración.
- Los workflows definen sus argumentos de inicio en `handle()`.
- Las clases sin `handle()` se rechazan con errores HTTP `422` antes de crear una ejecución.
- Las claves obligatorias ausentes producen HTTP `422` en lugar de descartarse silenciosamente.
- Los `workflow_id` vacíos, demasiado largos o inseguros para rutas producen HTTP `422` antes del manejo de duplicados.
- Los valores no válidos de `on_duplicate` producen HTTP `422`.
- `on_duplicate = return_existing_active` devuelve HTTP `200` al reutilizar una ejecución activa.
- Los duplicados no reutilizados devuelven HTTP `409` con `outcome = rejected_duplicate`, `command_status = rejected` y `rejection_reason = instance_already_started`.
- La fila duradera `workflow_commands` guarda por separado de los argumentos el contexto de entrada del webhook: etiqueta de quien llama, método o resultado de autenticación, nombre y ruta de solicitud y huella derivada de la carga normalizada y encabezados seleccionados como `X-Request-Id` y `X-Correlation-Id`.

Matriz HTTP actual del webhook de inicio:

- `202` con `outcome = started_new` al crear una ejecución.
- `200` con `outcome = returned_existing_active` al reutilizar la activa.
- `409` con `outcome = rejected_duplicate` al rechazar un duplicado.
- `401` si falla la autenticación.
- `404` para un alias desconocido.
- `422` si falla la validación de la carga.

### Webhooks de comandos de señal {#signal-command-webhooks}

Hay comandos dirigidos a instancia y a ejecución:

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` es el id público de instancia. La ruta por instancia resuelve la ejecución activa al aplicar el comando. La ruta por ejecución también recibe `runId` y rechaza selecciones históricas. El nombre de señal procede de la ruta. El cuerpo acepta actualmente un campo superior opcional:

```json
{
  "arguments": ["Taylor"]
}
```

`arguments` debe ser un array. Si se omite, un workflow en `await('signal-name')` se reanuda con `true`. La clase destino también debe declarar la señal con `#[Workflow\V2\Attributes\Signal('...')]`; los nombres no declarados se rechazan duraderamente sin almacenarse a ciegas.

Ejemplo de señal:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

Respuesta aceptada:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Los comandos aceptados y rechazados también tienen una fila duradera propia de ciclo de vida `workflow_signal_records` vinculada al comando original. La respuesta sigue usando el id de comando como correlación HTTP. El detalle seleccionado y las exportaciones de Waterline exponen la fila como `signals[*].id`, junto a nombre, `signal_wait_id`, secuencia de comando, secuencia de workflow una vez aplicada, estado, resultado, errores de validación y argumentos guardados.

Rechazo si la instancia existe pero aún no ha iniciado una ejecución:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Rechazo si la ejecución actual ya está cerrada:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Rechazo para un nombre de señal no declarado:

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

Rechazo de una ruta dirigida a una ejecución histórica:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Matriz HTTP actual del webhook de señal:

- `202` con `outcome = signal_received` al aceptar el comando.
- `401` si falla la autenticación.
- `404` para un id de instancia desconocido.
- `404` con `outcome = rejected_unknown_signal` si no está declarada. Si la ejecución ya contiene una instantánea tipada de contrato `WorkflowStarted`, o puede completarse un evento antiguo al primer ingreso compatible, el rechazo ya no depende de inspeccionar primero la clase activa.
- `409` con `outcome = rejected_not_started` si aún no hay ejecución actual.
- `409` con `outcome = rejected_not_active` si la actual destino está cerrada.
- `409` con `outcome = rejected_not_current` si se selecciona una histórica.
- `422` si `arguments` está presente y no es un array.

### Webhooks de señal con inicio {#signal-with-start-webhooks}

Una ruta de admisión vinculada por instancia inicia una ejecución o reutiliza la activa antes de registrar una señal:

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` es el alias registrado en `Workflow\V2\Webhooks::routes([...])`. `signal` es el nombre duradero declarado mediante `#[Signal(...)]`.

El cuerpo combina los campos de inicio normales con el reservado `signal_arguments` para la señal adjunta:

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` debe ser un array. La ruta usa por defecto `on_duplicate = return_existing_active` y rechaza cualquier otra política de duplicados en esta admisión vinculada.

Respuesta aceptada al iniciar una ejecución:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

Si la instancia ya tiene una activa, devuelve `start_outcome = returned_existing_active` y mantiene el comando de señal como objeto superior `command_*`. Ambos comandos comparten `intake_group_id`, metadatos de ruta y encabezados de correlación. Se registran en una sola transacción antes de que el worker ejecute el primer paso de usuario.

El detalle seleccionado y la exportación fijan esa admisión compuesta en `linked_intakes[*]`. La autoridad duradera es `workflow_commands.context.intake.group_id` compartido y `mode` de cada fila aceptada. Para `signal_with_start`, la fila agrupada expone `start_command_*`, `primary_command_*` no inicial, `complete`, `missing_expected_command_types` e instantáneas anidadas ordenadas `commands[*]`.

Si el nombre es desconocido o los argumentos incumplen el contrato duradero, el motor rechaza la señal antes de crear una ejecución. `run_id`, `start_command_id` y `start_outcome` quedan en `null`.

Matriz HTTP actual de señal con inicio:

- `202` con `outcome = signal_received` y `start_outcome = started_new` si crea una ejecución y registra la señal.
- `202` con `outcome = signal_received` y `start_outcome = returned_existing_active` si reutiliza la activa y registra la señal.
- `401` si falla la autenticación.
- `404` para un alias de workflow desconocido.
- `404` con `outcome = rejected_unknown_signal` si no declara la señal.
- `422` con `outcome = rejected_invalid_arguments` si `signal_arguments` es un array que incumple el contrato.
- `422` si `signal_arguments` está presente sin ser array, o `on_duplicate` difiere de `return_existing_active`.

### Webhooks de consultas {#query-webhooks}

Hay rutas por instancia y por ejecución:

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` es el id público de instancia. Su ruta resuelve la ejecución duradera más reciente tras actualizar. La ruta por ejecución fija un `runId`, incluso histórico o cerrado, porque las consultas son reproducciones de solo lectura.

`query` es el destino público declarado con `#[QueryMethod]`. Si la definición sigue cargable, también se acepta el nombre del método PHP, pero las respuestas satisfactorias normalizan `query_name` al destino público duradero.

El cuerpo acepta una lista posicional `arguments` o un mapa con claves de parámetros declarados:

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

A diferencia de las rutas que modifican estado, no añaden filas de comando duradero. Reproducen la ejecución seleccionada y devuelven inmediatamente un resultado serializado.

Ejemplo de consulta:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

Respuesta aceptada:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

Rechazo si los argumentos no coinciden con el contrato:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

Rechazo si ya no puede reproducirse la definición de la ejecución seleccionada:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

Matriz HTTP actual del webhook de consulta:

- `200` con `result` serializado si la reproducción tiene éxito.
- `401` si falla la autenticación.
- `404` para instancia o ejecución seleccionada desconocida.
- `409` si la instancia aún no empezó, la consulta no está declarada en la ejecución seleccionada o se bloquea con `blocked_reason = workflow_definition_unavailable`.
- `422` si el contrato rechaza los `arguments`.

### Webhooks de comandos de actualización {#update-command-webhooks}

Hay rutas POST por instancia y por ejecución y rutas de consulta del ciclo duradero:

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` es el id público de instancia. `update` es el nombre duradero declarado con `#[UpdateMethod]`. `updateId` es el id de ciclo devuelto en las respuestas. El POST por instancia resuelve la ejecución activa al aplicar; el dirigido a ejecución recibe `runId` y rechaza si es histórica. El GET por instancia lee su ciclo almacenado; el dirigido a ejecución restringe la búsqueda a la seleccionada.

Con `#[UpdateMethod('mark-approved')]`, el destino público es `mark-approved` aunque el método PHP tenga otro nombre.

El cuerpo acepta una lista posicional `arguments` o un mapa con claves de parámetros declarados:

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

Fija `wait_for = accepted` si solo necesitas aceptación duradera y quieres que el worker aplique la actualización después:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

Si se omite `wait_for` o es `completed`, el webhook registra primero la aceptación y espera hasta el presupuesto configurado a que el worker la aplique. Sustituye el presupuesto por solicitud con `wait_timeout_seconds`:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

Si termina dentro del presupuesto, devuelve la respuesta normal completada o fallida. Si vence primero la espera, devuelve HTTP `202` con el ciclo aceptado aún abierto, sin bloquear indefinidamente. Con `wait_for = accepted`, registra comando, fila propia del ciclo e historial tipado `UpdateAccepted`, programa o vuelve a despachar una tarea de workflow y devuelve HTTP `202` sin esperar a la aplicación.

Cada respuesta POST y GET incluye los campos normales y `update_id`, `update_name`, `update_status`, `workflow_sequence`, `accepted_at`, `applied_at`, `rejected_at` y `closed_at`. Un ciclo aceptado abierto devuelve `workflow_sequence = null`, `result = null`, `applied_at = null`, `rejected_at = null` y `closed_at = null` hasta que el worker lo cierre.

Al aceptar un mapa con nombre, el motor lo normaliza al orden declarado antes de añadir `UpdateAccepted` o `UpdateApplied`. En esa normalización también rellena los parámetros opcionales con sus valores predeterminados PHP.

Cada actualización aceptada o rechazada tiene una fila duradera `workflow_updates` con clave `update_id`, para poder enviar un POST una vez y consultar después el ciclo con GET sin inferirlo de filas genéricas de comandos.

Ejemplo de actualización:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

Respuesta completada:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Respuesta de solo aceptación:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Ejemplo de consulta de ciclo:

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

Respuesta mientras sigue abierto:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Respuesta después del cierre:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Las rutas de consulta no esperan a la ejecución; solo leen el ciclo duradero. Siempre devuelven `wait_for = status`, `wait_timed_out = false` y `wait_timeout_seconds = null`.

Si una señal anterior aceptada aún espera aplicarse, un POST posterior se rechaza con `rejected_pending_signal` en lugar de ejecutar la tarea de workflow dentro de la llamada. Las cargas posicionales o con nombre no válidas se rechazan con `rejected_invalid_arguments` y `validation_errors`. Los POST a ejecuciones históricas se rechazan con `rejected_not_current`.

Matriz HTTP actual de POST de actualización:

- `200` con `outcome = update_completed` al aceptar y completar.
- `202` con `update_status = accepted` si `wait_for = accepted` acepta duraderamente y deja la aplicación al worker.
- `202` con `update_status = accepted`, `wait_for = completed` y `wait_timed_out = true` si se agotó `wait_timeout_seconds` o el valor predeterminado sin cierre del ciclo.
- `401` si falla la autenticación.
- `404` para un id de instancia desconocido.
- `404` con `outcome = rejected_unknown_update` para un nombre duradero desconocido. Con instantánea tipada de contrato `WorkflowStarted`, o si un evento antiguo puede completarse en el primer ingreso compatible, el rechazo puede proceder de metadatos duraderos antes de recurrir a la definición activa.
- `409` con `outcome = rejected_not_started` si aún no hay ejecución actual.
- `409` con `outcome = rejected_not_active` si ya está cerrada.
- `409` con `outcome = rejected_not_current` si la selección es histórica.
- `409` con `outcome = rejected_pending_signal` si debe aplicarse antes una señal aceptada.
- `422` con `outcome = rejected_invalid_arguments` si la carga es un array que incumple el contrato: argumentos ausentes o desconocidos, tipos incorrectos o nulabilidad incumplida.
- `422` con `outcome = update_failed` si el manejador lanza una excepción.
- `422` si `arguments` está presente sin ser array. Ese error de forma se rechaza antes de crear una fila duradera de comando.

Matriz HTTP actual de GET del ciclo de actualización:

- `200` cuando está cerrado y `update_status` es `completed`, `failed` o `rejected`.
- `202` mientras `update_status = accepted`.
- `401` si falla la autenticación.
- `404` para una instancia, ejecución seleccionada o `update_id` desconocidos en el ámbito solicitado.

### Webhooks de reparación y comandos terminales {#repair-and-terminal-command-webhooks}

Hay rutas por instancia y por ejecución:

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

`workflowId` es el id público de instancia. Las rutas por instancia siempre resuelven la ejecución activa actual. Las dirigidas a ejecución reciben `runId` y rechazan selecciones históricas con el resultado duradero `rejected_not_current`. Se aplica la misma configuración `workflows.webhook_auth` que en el inicio.

Ejemplo de reparación:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

Ejemplo de cancelación:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

Ejemplo de terminación:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

Reparación aceptada al restaurar el progreso duradero de la ejecución actual:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Reparación aceptada si ya existe una ruta duradera sana de reanudación:

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Cancelación aceptada:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Terminación aceptada:

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Rechazo si la instancia existe pero aún no inició una ejecución:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Rechazo si la actual ya está cerrada:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Rechazo si la reparación, cancelación o terminación apunta a una histórica:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Matriz HTTP actual de reparación, cancelación y terminación:

- `200` con `outcome = repair_dispatched` si vuelve a despachar una tarea lista atrasada, recupera una lease caducada o recrea una tarea duradera ausente que aún no comenzó, incluidas tareas de aplicación de actualizaciones o señales aceptadas cuyas filas se perdieron antes de aplicarlas.
- `200` con `outcome = repair_not_needed` si ya hay una ruta duradera sana de reanudación o la seleccionada está dentro de una actividad en curso sin fila de tarea.
- `200` con `outcome = cancelled` o `outcome = terminated` al cerrar satisfactoriamente la actual.
- `401` si falla la autenticación.
- `404` para un id de instancia desconocido.
- `409` con `outcome = rejected_not_started` si aún no tiene ejecución actual.
- `409` con `outcome = rejected_not_active` si ya está cerrada.
- `409` con `outcome = rejected_not_current` si la ruta apunta a una histórica.

### Webhooks de descripción {#describe-webhooks}

Hay rutas por instancia y por ejecución para inspeccionar el estado por HTTP:

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` es el id público de instancia. Su ruta devuelve el estado de la ejecución actual. La dirigida a ejecución describe un id concreto, incluso histórico o cerrado.

La descripción es una inspección de solo lectura. No crea comandos duraderos ni reproduce el workflow. Devuelve metadatos de instancia, estado actual o seleccionado, campos del resumen y disponibilidad de acciones desde proyecciones confirmadas.

Ejemplo de descripción:

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

Respuesta para un workflow activo:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

Respuesta para uno terminado:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

La disponibilidad indica si la operación puede tener éxito ahora: las ejecuciones cerradas no aceptan comandos, los workflows exclusivamente remotos no sirven consultas o actualizaciones locales y las ejecuciones no actuales no reciben señales, actualizaciones, cancelaciones ni terminaciones.

Ejemplo dirigido a una ejecución:

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

La carga es la misma, pero `is_current_run` es `false` para una histórica y todas las acciones que modifican estado muestran `false`.

Respuesta si no existe la instancia:

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

Respuesta si existe la instancia pero no la ejecución seleccionada:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

Matriz HTTP actual de descripción:

- `200` si existe la instancia, con ejecución activa, cerrada o histórica.
- `200` si existe la instancia pero no la seleccionada (`reason = run_not_found`).
- `401` si falla la autenticación.
- `404` si no existe el id de instancia (`reason = instance_not_found`).

### Webhook de inicio del plano de control {#control-plane-start-webhook}

Una ruta de inicio acepta directamente una clave de tipo duradera, sin exigir una clase resoluble localmente. Es la vía preferida para un consumidor externo que usa claves de tipo en lugar de alias de clase PHP.

```text
POST /webhooks/control-plane/start
```

El cuerpo acepta:

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `workflow_type` | string | sí | Clave de tipo duradera del workflow |
| `instance_id` | string | no | Id público de instancia proporcionado por quien llama |
| `arguments` | string | no | Argumentos serializados con etiqueta de códec |
| `connection` | string | no | Sustitución de conexión de cola |
| `queue` | string | no | Sustitución de nombre de cola |
| `business_key` | string | no | Clave de negocio proporcionada por quien llama |
| `labels` | object | no | Etiquetas de visibilidad |
| `memo` | object | no | Metadatos no indexados |
| `duplicate_start_policy` | string | no | `reject_duplicate` o `return_existing_active` |

Ejemplo de solicitud:

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

Respuesta para un nuevo workflow:

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

Si se omite `instance_id`, el motor genera automáticamente un id basado en ULID.

Si la clave resuelve una clase local mediante `workflows.v2.types.workflows` o `#[Type(...)]`, se aplican al iniciar la instantánea completa del contrato de comandos y el enrutamiento. Sin clase local, se crea la instancia con la clave y el enrutamiento explícito de opciones; el contrato y la huella se difieren al worker que reclame la primera tarea. Así, un consumidor externo puede iniciar tipos que solo resuelve la flota de workers.

Matriz HTTP actual del inicio por plano de control:

- `202` con `outcome = started_new` al crear una ejecución.
- `200` con `outcome = returned_existing_active` al reutilizar la activa.
- `409` con `outcome = rejected_duplicate` al rechazar el duplicado.
- `401` si falla la autenticación.
- `422` si falta `workflow_type` o `instance_id` no es válido.

`WorkflowControlPlane` también está disponible como singleton resoluble desde el contenedor. Resuelve `Workflow\V2\Contracts\WorkflowControlPlane` en Laravel para llamar directamente a `start()`, `signal()`, `query()`, `update()`, `cancel()`, `terminate()` y `describe()` desde código PHP, pruebas o comandos Artisan.

El sistema cubre inicio explícito por alias; webhooks por instancia y ejecución para señales, actualizaciones, consultas, descripción, reparación, cancelación y terminación; rutas de consulta de tareas de workflow y actividad; e inicio por plano de control para crear workflows mediante claves de tipo.
