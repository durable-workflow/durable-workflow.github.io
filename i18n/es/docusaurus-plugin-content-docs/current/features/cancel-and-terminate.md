---
sidebar_position: 16
---

# Cancelar y terminar {#cancel-and-terminate}

Esta guía cubre la API embebida Laravel `Workflow\V2\WorkflowStub`. Para clientes y workers en modo servicio, usa la [guía del SDK PHP](https://php.durable-workflow.com/), la [referencia de cancelación de Python](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled) o la [API de ciclo de vida de Rust](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow).

Cancelar y terminar son comandos duraderos de primera clase que cierran un workflow activo. Ambos quedan en el historial de comandos, producen eventos tipados y aparecen en Waterline.

En la API embebida actual, ambos cierran inmediatamente la ejecución. **Cancelar** registra `cancelled`; **terminar** registra `terminated`. Ninguno programa limpieza dentro del workflow cerrado. Laravel embebido también ofrece `requestCancellation()` para limpieza cooperativa con plazo. Server y los SDK PHP, Python y Rust admiten esa solicitud separada con workers que la habiliten explícitamente. Consulta el contrato de capacidad, plazo, limpieza y recuperación en [Cancelación cooperativa](/docs/polyglot/cancellation).

## Cancelar {#cancel}

La cancelación cambia inmediatamente la ejecución a `cancelled` y registra historial duradero.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### Cancelar con motivo {#cancel-with-reason}

Puedes proporcionar un motivo estructurado para distinguir cancelaciones de usuarios, políticas u operadores en auditoría, historial de comandos y Waterline.

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

El motivo se guarda en el comando duradero y en los eventos tipados `CancelRequested` y `WorkflowCancelled`, por lo que sobrevive a reproducción, exportación y análisis sin conexión.

### Qué hace la cancelación {#what-cancel-does}

Al aceptar el comando, el motor cierra las ejecuciones de actividad abiertas y temporizadores pendientes, cambia la ejecución a `cancelled` y reanuda al padre que esperaba ese hijo para que observe el resultado.

### Cuándo se rechaza la cancelación {#cancel-is-rejected-when}

- La instancia aún no se ha iniciado: `rejection_reason = instance_not_started`.
- La ejecución actual ya está cerrada: `rejection_reason = run_not_active`.
- Un comando dirigido a una ejecución apunta a una histórica, no actual: `rejection_reason = selected_run_not_current`.

## Terminar {#terminate}

La terminación cierra inmediatamente un workflow activo sin programar más código. Al igual que cancelar, no ofrece un período de limpieza. Úsala cuando corresponda el resultado diferenciado `terminated`.

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### Terminar con motivo {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### Qué hace la terminación {#what-terminate-does}

Sigue los mismos pasos transaccionales que cancelar, pero:

- Registra `TerminateRequested` y `WorkflowTerminated`.
- Crea la fila `WorkflowFailure` con `failure_category = terminated` y `propagation_kind = terminated`.
- Establece `closed_reason = terminated`.
- No programa más ejecución de código del workflow.

### Cuándo se rechaza la terminación {#terminate-is-rejected-when}

En las mismas condiciones que la cancelación.

## Comandos dirigidos a una ejecución {#run-targeted-commands}

Ambos comandos pueden apuntar a una ejecución concreta en lugar de la actual de la instancia.

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

Se rechazan con `selected_run_not_current` si la ejecución indicada ya no es la actual. La respuesta incluye `requested_run_id` (la solicitada) y `resolved_run_id` (la actual que debe usarse después).

## API sin excepciones {#non-throwing-api}

Usa `attemptCancel()` y `attemptTerminate()` para manejar rechazos sin excepciones:

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` y `terminate()` lanzan `LogicException` al rechazarse.

## Webhooks {#webhooks}

Cancelar y terminar están disponibles mediante rutas webhook:

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Pasa el motivo en el cuerpo:

```json
{
  "reason": "Operator: duplicate order"
}
```

La respuesta incluye el resultado del comando, id público de instancia y motivo:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J10000000000000000000021",
  "reason": "Operator: duplicate order",
  "command_id": "01J40000000000000000000021",
  "command_status": "accepted"
}
```

## La cancelación no es un error que se capture por accidente {#cancellation-is-not-an-error-you-catch-by-accident}

La cancelación es un resultado explícito del ciclo de vida, no un error inesperado de la aplicación. `Workflow\V2\Exceptions\WorkflowCancelledException` extiende `\Error`, no `\Exception`. Un bloque `catch (\Exception $e)` no la captura; `catch (\Throwable $t)` sí.

Al leer el resultado de un workflow cancelado, captura la excepción por su nombre si necesitas distinguirla de otros fallos. Capturar esa excepción al leer el resultado no reabre la ejecución ni programa limpieza dentro de ella.

## Waterline {#waterline}

Waterline expone cancelar y terminar como acciones del operador en el detalle de la ejecución seleccionada. La carga incluye `can_cancel` y `can_terminate`, derivados del estado duradero.

El historial muestra cada comando con motivo, identidad de quien llama y resultado. `commands[*].reason` contiene el motivo del operador o de quien llama cuando se proporcionó.

## Correspondencia de estados {#status-mapping}

Las ejecuciones `cancelled` y `terminated` se agrupan en `failed` para enrutar listas. Los campos originales `status` y `closed_reason` las distinguen:

| Estado | Grupo de estado | Motivo de cierre |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## Historial tipado {#typed-history}

Una ejecución cancelada produce esta secuencia:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

Una terminada produce:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## Cancelar frente a terminar {#cancel-vs-terminate}

| | Cancelar | Terminar |
| --- | --- | --- |
| Se programa más código de workflow | No | No |
| Se cancelan actividades abiertas | Sí | Sí |
| Se cancelan temporizadores abiertos | Sí | Sí |
| Metadatos de motivo | Sí | Sí |
| Historial duradero de comandos | Sí | Sí |
| El padre recibe el resultado del hijo | Sí | Sí |
| Se registra fila de fallo | Sí (`cancelled`) | Sí (`terminated`) |
| Grupo de estado | `failed` | `failed` |
| Motivo de cierre | `cancelled` | `terminated` |
