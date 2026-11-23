---
title: Signal-with-start y señales entre workflows
description: Inicia o reutiliza un workflow y envíale una señal en una sola operación, y envía de forma duradera una señal a otro workflow desde el código de un workflow, con los SDK de PHP, Python y Rust.
---

# Signal-with-start y señales entre workflows {#signal-with-start-and-workflow-signals}

El Server nativo 3.15.0 añade dos operaciones de señal:

- **Signal-with-start** es una llamada de cliente. Una sola solicitud inicia el
  workflow o reutiliza su ejecución abierta, y registra una señal en esa
  ejecución, en una sola transacción del Server.
- **Enviar una señal a otro workflow** es un comando de workflow. El código de
  un workflow envía una señal a otro workflow de su espacio de nombres. La
  solicitud y su resultado se registran una sola vez en el historial del
  remitente, y la reproducción nunca vuelve a enviar la señal.

## Requisitos {#requirements}

| Runtime | Signal-with-start | Enviar una señal a otro workflow |
| --- | --- | --- |
| Server nativo | 3.15.0 o posterior, anunciado como `capabilities.signal_with_start` | 3.15.0 o posterior, anunciado como el comando de worker `signal_external_workflow` |
| PHP SDK | 3.22.0 o posterior: `Client::signalWithStart()` | 3.22.0 o posterior: `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 o posterior: `Client.signal_with_start()` | 2.20.0 o posterior: `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 o posterior: `Client::signal_with_start()` | 4.21.0 o posterior: `ctx.signal_external_workflow()` |
| PHP integrado (Laravel) | `WorkflowStub::signalWithStart()`, consulta la [guía de señales](../features/signals.md#signal-with-start) | Workflow 2.35.0 o posterior (experimental): `signalExternalWorkflow()`, consulta la [guía de señales](../features/signals.md#signal-another-workflow) |

El PHP Server 2.x publicado no admite ninguna de las dos operaciones. Los SDK
comprueban el Server conectado antes de enviar. Frente a un Server más antiguo,
una llamada de cliente lanza `ServerCapabilityUnavailable` (PHP),
`RuntimeCapabilityUnsupported` (Python) o `Error::SignalWithStartUnavailable`
(Rust), y no se envía nada. Un worker rechaza un nuevo comando de señal con
`signal_external_workflow_unavailable` antes de enviar nada, de modo que la
tarea de workflow no se completa y la ejecución no falla.

## Signal-with-start {#signal-with-start}

Usa signal-with-start cuando un llamante se dirige a una entidad y no debe
perder el evento entre un inicio y una señal separados. Un
`start(use-existing)` seguido de `signal` son dos operaciones: la ejecución
puede cerrarse entre ambas, y entonces la señal se rechaza. Signal-with-start
no deja ese hueco.

- **Sin ejecución.** Una nueva ejecución se inicia con la entrada y los plazos
  de esta llamada. El `start_outcome` del recibo es `started_new`.
- **Una ejecución abierta**, incluida la más reciente tras continuar como nueva
  ejecución. La señal se une a ella, y `start_outcome` es
  `returned_existing_active`. La ejecución conserva su entrada, sus plazos y su
  historial. Una política de duplicados `fail` la rechaza en su lugar con
  `instance_already_started`.
- **Una ejecución cerrada.** Se rechaza con `run_not_active`, salvo que la
  política de ejecución cerrada sea `start_new_run`. Esta inicia una ejecución
  nueva después de la cerrada, y el recibo indica la ejecución cerrada en
  `closed_run_id`. La ejecución cerrada conserva su resultado.

El tipo de workflow debe ser el tipo de la instancia, y la cola de tareas debe
ser la cola de la ejecución abierta. De lo contrario, el Server rechaza con
`workflow_type_conflict` o `task_queue_conflict`. Ningún rechazo escribe nada.

El id de solicitud es la [clave de comando](./server-api-reference.md#command-keys)
de la señal. Cada SDK genera una por llamada si la omites. Guarda tu propia
clave cuando un reintento deba sobrevivir a un reinicio del proceso. Un
reintento con la misma clave, nombre de señal, argumentos y tipo de workflow
devuelve el recibo original con `retained: true`, incluso después de que la
ejecución se haya cerrado o continuado, y no inicia nada.

```php
use DurableWorkflow\Exception\SignalWithStartFailed;

try {
    $receipt = $client->signalWithStart(
        'orders.entity',      // workflow type
        'order-42',           // workflow ID
        'orders',             // task queue
        'changed',            // signal name
        [2],                  // signal arguments
        input: ['order-42'],  // input for a run this call starts
        requestId: 'order-42-revision-2',
    );
    $receipt['start_outcome']; // "started_new" or "returned_existing_active"
} catch (SignalWithStartFailed $failed) {
    $failed->reason(); // For example "run_not_active". Nothing was written.
}
```

```python
from durable_workflow.errors import SignalWithStartFailed

try:
    receipt = await client.signal_with_start(
        "order-42",
        "changed",
        workflow_type="orders.entity",
        task_queue="orders",
        input=["order-42"],
        signal_args=[2],
        request_id="order-42-revision-2",
    )
    receipt["start_outcome"]  # "started_new" or "returned_existing_active"
except SignalWithStartFailed as failed:
    failed.reason  # For example "run_not_active". Nothing was written.
```

```rust
use durable_workflow::{json, SignalWithStartOptions};

match client
    .signal_with_start(
        "orders.entity",
        "orders",
        "order-42",
        "changed",
        json!(["order-42"]),
        json!([2]),
        SignalWithStartOptions::new().request_id("order-42-revision-2"),
    )
    .await
{
    Ok(receipt) => println!("{}", receipt["start_outcome"]),
    // For example Some("run_not_active"). Nothing was written.
    Err(error) => println!("{:?}", error.signal_with_start_refusal()),
}
```

Pasa `closedRunPolicy: 'start_new_run'` (PHP),
`closed_run_policy="start_new_run"` (Python) o `ClosedRunPolicy::StartNewRun`
(Rust) para iniciar una ejecución nueva después de una cerrada.
Signal-with-start admite la señal una sola vez. El trabajo que desencadena la
señal sigue necesitando su propia idempotencia.

## Enviar una señal a otro workflow {#signal-another-workflow}

El código de un workflow envía una señal a otro workflow de su espacio de
nombres por id de workflow. Sin id de ejecución, la señal va a la ejecución
actual del destino; con uno, solo a esa ejecución. La señal es un comando de
workflow, no una actividad:

- La finalización que la transporta registra `ExternalSignalRequested` en el
  historial del remitente, admite la señal en el destino y registra exactamente
  un resultado, `ExternalSignalDelivered` o `ExternalSignalFailed`, en la misma
  secuencia, todo en una sola transacción del Server.
- En el destino es una señal ordinaria: el mismo evento `SignalReceived` y el
  mismo registro de señal que cualquier otra señal, atribuidos a la ejecución
  remitente. Su clave de comando en el destino es
  `workflow-signal:<sender run ID>:<sequence>`. Los llamantes no pueden usar ese
  prefijo: una señal o un signal-with-start cuyo id de solicitud empiece por
  `workflow-signal:` se rechaza con 422 y `reason: "request_id_reserved"`.
- La reproducción lee el resultado registrado y nunca vuelve a enviar. Un
  destino, ejecución, nombre de señal o argumentos distintos en ese punto del
  workflow hacen fallar la reproducción como no determinista.

Una señal no entregada es un valor devuelto, no una excepción. El código del
workflow decide qué hacer con ella.

| Resultado | Motivo | Cuándo |
| --- | --- | --- |
| `delivered` | ninguno | La ejecución de destino admitió la señal. |
| `target_not_found` | `instance_not_found` | No existe ningún workflow con ese id en este espacio de nombres. |
| `target_not_found` | `run_not_found` | El id de ejecución no corresponde a ninguna ejecución de ese workflow. |
| `target_closed` | `run_not_active` | La ejecución de destino se ha cerrado. |
| `target_closed` | `historical_run` | El id de ejecución corresponde a una ejecución reemplazada al continuar como nueva ejecución. |
| `rejected` | `unknown_signal`, `invalid_signal_arguments`, `structural_limit_exceeded` | El destino rechazó la señal, como rechazaría una señal HTTP. |
| `rejected` | `runtime_reserved_signal` | El nombre está reservado para el flujo de mensajes del runtime. |
| `rejected` | `self_target` | El destino es el propio workflow del remitente. |
| `rejected` | `request_id_conflict` | La clave de comando ya se usó para otra señal. |

Los SDK comprueban el nombre de la señal en el código del workflow antes de
registrar nada. No puede estar vacío, no puede contener un carácter de control
(un byte inferior a `0x20`, o `0x7f`) y tiene como máximo 191 caracteres y
255 bytes. El id del workflow de destino tiene de 1 a 191 caracteres. Un nombre
rechazado lanza `InvalidSignalName` (PHP y Python) o devuelve
`Error::InvalidExternalSignal` (Rust), y no se envía ningún comando.

```php
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\WorkflowContext;

final class ApproverWorkflow
{
    #[Workflow('orders.approver')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $result = $context->signalExternalWorkflow($orderId, 'approve', ['Ada']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

El handle de un hijo iniciado tiene el mismo comando: `$child->signal('approve', ['Ada'])`.

```python
from durable_workflow import workflow


@workflow.defn(name="orders.approver")
class Approver:
    def run(self, ctx: workflow.WorkflowContext, order_id: str):
        result = yield ctx.signal_external_workflow(order_id, "approve", ["Ada"])
        if not result.delivered:
            # target_not_found, target_closed or rejected, with a reason
            return {"skipped": result.outcome, "reason": result.reason}
        return {"delivered_to": result.target_run_id}
```

```rust
use durable_workflow::{json, ExternalSignalOutcome};

worker.register_workflow("orders.approver", |ctx, input| async move {
    let order_id = input[0].as_str().unwrap_or_default().to_owned();
    let result = ctx
        .signal_external_workflow(order_id, "approve", json!(["Ada"]))
        .await?;
    match result.outcome {
        ExternalSignalOutcome::Delivered => Ok(json!({"delivered_to": result.target_run_id})),
        // target_not_found, target_closed or rejected, with a reason
        _ => Ok(json!({"skipped": result.outcome.as_str(), "reason": result.reason})),
    }
});
```

Añade `.run_id(run_id)` en Rust, `run_id=` en Python o `runId:` en PHP para
enviar la señal solo a una ejecución del destino.

Ejecuta el comando por sí solo. No puede formar parte de un grupo paralelo ni
de una selección duradera. Un worker que tiene una tarea de workflow puede
enviar señales a cualquier workflow del espacio de nombres de esa tarea, sin el
rol de operador que necesita una señal HTTP. Coloca en un espacio de nombres
separado cualquier workflow al que el código de otros workflows no deba enviar
señales.

## Orden de las condiciones con plazo {#timed-condition-order}

Con Native Server 3.27.0 o posterior, un worker compatible y la creación de esperas ordenadas habilitada, una condición con plazo puede usar las señales y las actualizaciones aplicadas correctamente que se recibieron antes de su evento `TimerFired` original. Esto se cumple incluso si el worker evalúa la condición después de que se dispare el temporizador. El orden de recepción determina qué estado permitido satisface primero el predicado. Una señal con nombre usa el mismo límite.

En un `select()` compatible, la condición gana frente a un workflow hijo si ese primer estado que cumple el predicado precede en el historial a la finalización o al fallo del hijo. Una vez resuelta la espera, la reproducción usa el resultado registrado.

La creación de esperas ordenadas está deshabilitada de forma predeterminada. Si administras tu propio Server, consulta la [guía de despliegue y reversión](https://github.com/durable-workflow/server/blob/3.27.0/rust/README.md#rolling-out-durable-input-ordering-for-timed-waits) antes de habilitarla.

## Cuándo sigue haciendo falta una actividad {#when-an-activity-is-still-needed}

Usa una actividad que llame al cliente cuando el comando de workflow no encaje:

- **Signal-with-start desde el código de un workflow.** No hay comando de
  workflow para signal-with-start. Llama al signal-with-start del cliente desde
  una actividad y deriva su id de solicitud de datos estables del workflow,
  como el id del workflow y una clave de negocio, para que cada reintento de la
  actividad envíe la misma clave y el Server admita la señal una sola vez.
- **Otro espacio de nombres.** Las señales permanecen dentro del espacio de
  nombres. Usa en su lugar una [llamada de servicio entre espacios de nombres](./service-operations.md).
- **Un Server más antiguo.** Antes del Server nativo 3.15.0, el código de un
  workflow solo puede enviar señales mediante una actividad. Da también a esa
  señal un id de solicitud estable, para que un reintento de la actividad no
  registre una segunda señal.

Una actividad se ejecuta al menos una vez, así que el id de solicitud estable
es lo que impide que un reintento envíe una segunda señal. El comando de señal
registra su resultado en el historial sin tarea de actividad.
