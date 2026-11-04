---
sidebar_position: 18
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - flujos de mensajes
  - bandeja de entrada de workflow
  - bandeja de salida de workflow
  - MessageStream
  - mensajes repetidos de workflow
---

# Flujos de mensajes {#message-streams}

Los flujos de mensajes son la API de autoría v2 para mensajes repetidos: bucles de entrada humana, respuestas de asistentes, notificaciones entre workflows y otros mensajes ordenados que deban sobrevivir a la reproducción y a la continuación como nueva ejecución.

Esta página describe la API embebida Laravel de entrada/salida. Los [Workflow Streams](/docs/polyglot/workflow-streams/) de Server reutilizan términos como flujo, desplazamiento, cantidad pendiente, ciclo de vida y error cuando coinciden sus semánticas, pero solo son de salida. No añaden mensajería entrante ni transferencia de cursor entre ejecuciones al modo servicio.

Usa la fachada de primera clase al escribir workflows:

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

No escribas directamente filas `workflow_messages` ni de cursor desde el workflow de la aplicación. La fachada es el contrato estable; los servicios de nivel inferior existen para integrar paquete y runtime.

:::warning Flujos de mensajes anteriores a Workflow 2.20.3

El código del workflow se reproduce en cada tarea de workflow posterior y en cada consulta. En
las versiones de Workflow hasta la 2.20.0 inclusive, `outbox()->sendReference()` escribe un nuevo
mensaje saliente y entrante en cada reproducción, e `inbox()->receive()` y
`receiveOne()` pueden devolver un mensaje distinto, o ninguno, en la reproducción
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).
Workflow 2.20.1 registra los envíos y las recepciones para la reproducción e
impide que las consultas escriban o consuman mensajes. Las recepciones vacías
y los flujos conservados entre pasos necesitan las correcciones adicionales
de reproducción de 2.20.3 que se describen a continuación.

- Las filas que las versiones anteriores duplicaron no se eliminan. Da a cada envío
  lógico un `idempotencyKey` estable, como `reply:{turn}`, y deduplica por
  `idempotency_key` al consumir un flujo que escribió una versión anterior.
  Los mensajes que una versión anterior consumió en el paso equivocado siguen
  consumidos.
- Las señales, las actualizaciones y todos los flujos comparten un cursor de
  mensajes. Hasta 2.20.2 inclusive, una señal, una actualización o una recepción
  en otro flujo puede moverlo más allá de los mensajes pendientes y ocultarlos
  ([workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)).
  Para ese caso de orden de señales en esas versiones, envía la señal antes
  del mensaje y recibe solo después de que una señal o condición indique que
  hay un mensaje.

:::

## Actualizaciones de flujos y reversión {#stream-upgrades}

En Workflow 2.20.3, el cursor compartido ya no oculta mensajes pendientes a
`receive()`, `receiveOne()`, `peek()`, `pendingCount()` ni `hasPending()`. Las
recepciones mantienen el orden de secuencia y su límite de lote. Tras
actualizar, un bucle de recepción puede devolver primero mensajes pendientes
antiguos que el cursor compartido ocultaba y después los más recientes.

Una recepción reproducida devuelve lo que consumió su paso original. Si la
llamada original no encontró nada, la reproducción tampoco devuelve nada.
Un manejador de actualización que se ejecuta por primera vez sigue pudiendo
recibir. Un flujo conservado en una propiedad ahora registra las recepciones
en el paso actual del workflow, en lugar del paso en que se abrió el flujo.
Las recepciones que versiones anteriores registraron en el paso de apertura
siguen reproduciéndose.

Antes de revertir una aplicación integrada a una versión anterior a 2.20.3,
aplica el [control de reproducción](../testing.md#replay-before-deployment)
con historiales escritos por el paquete más reciente. Las versiones
anteriores buscan las recepciones de un flujo conservado en el paso de
apertura y pueden reproducir esas ejecuciones de otra manera. La reversión
también restaura los errores del cursor compartido, la reproducción de
recepciones vacías y la precisión del procesamiento de tareas fake. Consulta las
[notas de compatibilidad de la etiqueta](https://github.com/durable-workflow/workflow/blob/2.20.3/CHANGELOG.md#2203---2026-11-04).

La limitación de consultas en
[workflow#1024](https://github.com/durable-workflow/workflow/issues/1024)
permanece: una consulta puede no devolver un mensaje que recibió un manejador
de actualización porque reproduce el manejador en el paso equivocado. La
consulta no cambia filas de mensajes. La reproducción del propio workflow y
su salida completada siguen devolviendo lo que recibió el manejador.

## Recibir mensajes {#receiving-messages}

Usa `peek()` para inspeccionar mensajes pendientes sin avanzar el cursor duradero. Usa `receive()` o `receiveOne()` cuando estés listo para consumirlos y registrar el avance en el historial.

```php
use Workflow\V2\Workflow;

final class ApprovalInboxWorkflow extends Workflow
{
    public function handle(): array
    {
        $pending = $this->inbox('approval.requests')->peek(limit: 10);

        if ($pending->isEmpty()) {
            return ['status' => 'waiting'];
        }

        $message = $this->inbox('approval.requests')->receiveOne();

        return [
            'status' => 'received',
            'payload_reference' => $message?->payload_reference,
            'correlation_id' => $message?->correlation_id,
        ];
    }
}
```

`peek()` es de solo lectura. `receive()` y `receiveOne()` marcan mensajes consumidos y avanzan el cursor de la ejecución actual. Ese avance es un hecho histórico que permite a la reproducción, las exportaciones de Waterline y el traspaso a una nueva ejecución determinar qué mensajes ya se consumieron.

## Enviar referencias {#sending-references}

Usa `outbox(...)->sendReference(...)` para publicar un mensaje saliente ordenado. La tabla guarda metadatos de enrutamiento y una referencia a la carga útil; el contenido grande o propiedad de la aplicación permanece en su almacén de cargas.

```php
use Workflow\V2\Workflow;

final class AssistantReplyWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId, string $replyReference): array
    {
        $message = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: $replyReference,
            correlationId: $this->workflowId(),
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $message->stream_key,
            'sequence' => $message->sequence,
        ];
    }
}
```

Esto mantiene pequeño el historial y permite validar el almacén por separado del orden duradero de mensajes.

## Continuar como nueva ejecución {#continue-as-new}

Los flujos se centran en la instancia. Al continuar como nueva ejecución, los mensajes entrantes pendientes pasan a la sucesora, el cursor avanza con ella y los mensajes consumidos siguen vinculados a la original como evidencia histórica. Workflow 2.20.1 y versiones anteriores solo trasladaban el cursor: los mensajes aún pendientes cuando la ejecución continuaba como nueva permanecían en la ejecución cerrada y la sucesora nunca los recibía ([workflow#1018](https://github.com/durable-workflow/workflow/issues/1018), corregido en 2.20.2). En esas versiones, recibe los mensajes pendientes antes de llamar a `continueAsNew()`, o envía como [señal](./signals.md) la entrada que deba sobrevivir al traspaso: las señales aceptadas que la ejecución aún no haya aplicado pasan a la sucesora.

Un workflow prolongado puede desprenderse del historial conservando la misma ruta pública de mensajes:

```php
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

final class HumanInputLoopWorkflow extends Workflow
{
    public function handle(int $iteration = 0): array
    {
        $message = $this->inbox('human.replies')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting', 'iteration' => $iteration];
        }

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return [
            'status' => 'processed',
            'iteration' => $iteration,
            'payload_reference' => $message->payload_reference,
        ];
    }
}
```

Quien llama sigue usando el id de instancia sin conocer qué ejecución posee el cursor actual.

## Reglas de autoría {#authoring-rules}

- Usa claves semánticas como `ai.assistant`, `human.replies` o `approval.requests`; forman parte del contrato público.
- Usa `peek()` para inspección y `receive()` / `receiveOne()` para consumo duradero.
- Usa `sendReference()` para mensajes salientes; guarda las cargas grandes en el almacén de la aplicación y pasa referencias.
- Mantén el código de aplicación en `Workflow::inbox()`, `Workflow::outbox()` y `MessageStream`; no dependas de `MessageService`, `WorkflowMessage` ni escrituras de cursor como patrón de autoría.
- Usa [Señales](./signals.md) para eventos externos puntuales y [Actualizaciones](./updates.md) para cambios de estado con solicitud/respuesta. Usa flujos de mensajes para mensajes repetidos y ordenados que necesiten semántica de cursor.

## Ejecutar este patrón {#run-this-pattern}

El workflow de agente de viajes de la [Aplicación de ejemplo](/docs/sample-app) es la referencia ejecutable de esta estructura de entrada/salida:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` guarda cargas grandes del asistente en la tabla de aplicación `ai_workflow_messages` y solo publica una referencia duradera en la salida `ai.assistant`. Las respuestas llegan por el flujo de entrada correspondiente mediante la actualización `receive`. Lee la clase junto a esta página para ver de principio a fin las mismas llamadas `inbox()` / `outbox()` / `sendReference()` de los ejemplos.
