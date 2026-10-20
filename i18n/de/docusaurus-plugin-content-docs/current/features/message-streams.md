---
sidebar_position: 18
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - Nachrichtenströme
  - Workflow-Posteingang
  - Workflow-Postausgang
  - MessageStream
  - wiederholte Workflow-Nachrichten
---

# Nachrichtenströme {#message-streams}

Nachrichtenströme sind die v2-Autorenoberfläche für wiederholte
Workflow-Nachrichten: Schleifen mit menschlichen Eingaben, Assistentenantworten,
Workflow-zu-Workflow-Benachrichtigungen und andere geordnete Nachrichten, die
Replay und Continue-as-new überstehen müssen.

Diese Seite beschreibt die eingebettete Laravel-Inbox-/Outbox-API.
Serververwaltete [Workflow Streams](/docs/polyglot/workflow-streams/)
verwenden Begriffe wie Strom, Offset, ausstehende Anzahl, Lebenszyklus und
Fehler bei übereinstimmender Semantik ebenfalls, dienen aber nur der Ausgabe.
Sie ergänzen im Service-Modus weder eingehende Workflow-Nachrichten noch die
Cursor-Übertragung bei Continue-as-new.

Workflow-Autoren sollten die vollwertige Fassade verwenden:

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

Schreiben Sie aus Workflow-Code der Anwendung keine `workflow_messages`- oder
Cursor-Zeilen direkt. Die Fassade ist der stabile Vertrag. Niedrigere
Nachrichtendienste existieren für die Paket-/Laufzeitintegration.

## Nachrichten empfangen {#receiving-messages}

Verwenden Sie `peek()`, wenn ein Workflow ausstehende eingehende Nachrichten
untersuchen muss, ohne seinen dauerhaften Cursor vorzurücken. Verwenden Sie
`receive()` oder `receiveOne()`, wenn der Workflow Nachrichten verbrauchen und
den Cursor-Fortschritt in der Historie aufzeichnen möchte.

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

`peek()` liest nur. `receive()` und `receiveOne()` markieren Nachrichten als
verbraucht und rücken den dauerhaften Nachrichten-Cursor für den aktuellen
Lauf vor. Cursor-Fortschritt ist eine Historientatsache. Replay,
Waterline-Exporte und Continue-as-new-Übergaben können dadurch nachvollziehen,
welche eingehenden Nachrichten bereits verbraucht wurden.

## Referenzen senden {#sending-references}

Verwenden Sie `outbox(...)->sendReference(...)`, wenn ein Workflow eine
geordnete ausgehende Nachricht veröffentlichen muss. Die Nachrichtentabelle
speichert Routing-Metadaten und eine Payload-Referenz. Große oder
anwendungseigene Inhalte bleiben im Payload-Speicher der Anwendung.

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

So bleibt die Workflow-Historie klein und Verbraucher können den
Payload-Speicher getrennt von der dauerhaften Nachrichtenreihenfolge prüfen.

## Continue-as-new {#continue-as-new}

Nachrichtenströme orientieren sich an Instanzen. Bei Continue-as-new werden
ausstehende eingehende Nachrichten und Cursor-Position auf den fortgesetzten
Lauf übertragen. Verbrauchte Nachrichten bleiben als historische Nachweise am
ursprünglichen Lauf.

Ein langlebiger Workflow kann dadurch Historie abwerfen und dieselbe
öffentliche Nachrichtenroute behalten:

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

Der Aufrufer adressiert weiter die Workflow-Instanz-ID. Er muss nicht wissen,
welcher Lauf gerade den Strom-Cursor besitzt.

## Regeln für Workflow-Autoren {#authoring-rules}

- Verwenden Sie semantische Stromschlüssel wie `ai.assistant`, `human.replies` oder `approval.requests` und behandeln Sie diese als Teil des öffentlichen Workflow-Vertrags.
- Verwenden Sie `peek()` zur Untersuchung und `receive()` / `receiveOne()` für dauerhaften Verbrauch.
- Verwenden Sie `sendReference()` für ausgehende Nachrichten. Speichern Sie große Payloads im Payload-Speicher der Anwendung und übergeben Sie eine Referenz.
- Halten Sie Anwendungscode auf `Workflow::inbox()`, `Workflow::outbox()` und `MessageStream`. Verwenden Sie `MessageService`, `WorkflowMessage` oder Cursor-Zeilenschreibzugriffe nicht als Autorenmuster.
- Verwenden Sie [Signale](./signals.md) für einmalige externe Ereignisse und [Updates](./updates.md) für Zustandsänderungen mit Anfrage und Rückgabe. Verwenden Sie Nachrichtenströme, wenn wiederholte geordnete Nachrichten Cursor-Semantik benötigen.

## Dieses Muster ausführen {#run-this-pattern}

Der Reiseassistenten-Workflow in der [Beispielanwendung](/docs/sample-app)
ist die ausführbare Referenz für die hier beschriebene Inbox-/Outbox-Struktur:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` speichert große Assistenten-Payloads in der
anwendungseigenen Tabelle `ai_workflow_messages` und veröffentlicht nur eine
dauerhafte Referenz auf der Outbox `ai.assistant`. Antworten treffen über das
Update `receive` im passenden Inbox-Strom ein. Lesen Sie die Workflow-Klasse
neben dieser Seite, um dieselben Aufrufe `inbox()`, `outbox()` und
`sendReference()` aus den obigen Beispielen durchgängig zu sehen.
