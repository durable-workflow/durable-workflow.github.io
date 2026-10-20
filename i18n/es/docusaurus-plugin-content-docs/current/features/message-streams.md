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

Los flujos se centran en la instancia. Al continuar como nueva ejecución, los mensajes entrantes pendientes y el cursor se transfieren a la sucesora. Los consumidos siguen vinculados a la original como evidencia.

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
