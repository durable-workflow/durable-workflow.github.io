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

:::warning Nachrichtenströme vor Workflow 2.20.3

Workflow-Code wird bei jeder späteren Workflow-Aufgabe und bei jeder Abfrage
erneut abgespielt (Replay). In Workflow-Releases bis einschließlich 2.20.0
schreibt `outbox()->sendReference()` bei jedem Replay eine neue ausgehende und
eingehende Nachricht, und `inbox()->receive()` und `receiveOne()` können beim
Replay eine andere Nachricht oder gar keine zurückgeben
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).
Workflow 2.20.1 zeichnet Sendevorgänge und Empfangsvorgänge für das Replay auf
und verhindert, dass Abfragen Nachrichten schreiben oder verbrauchen. Leere
Empfangsaufrufe und über Schritte hinweg aufbewahrte Ströme benötigen die
weiteren Replay-Korrekturen aus 2.20.3, die unten beschrieben werden.

- Zeilen, die frühere Releases dupliziert haben, werden nicht entfernt. Geben
  Sie jedem logischen Sendevorgang einen stabilen `idempotencyKey`, etwa
  `reply:{turn}`, und entfernen Sie Duplikate anhand von `idempotency_key`,
  wenn Sie einen Strom verarbeiten, den ein früheres Release geschrieben hat.
  Nachrichten, die ein früheres Release unter dem falschen Schritt verbraucht
  hat, bleiben verbraucht.
- Signale, Updates und alle Ströme teilen sich einen Nachrichten-Cursor.
  Bis einschließlich 2.20.2 können ein Signal, ein Update oder ein Empfang
  in einem anderen Strom ihn über ausstehende Nachrichten hinaus verschieben
  und sie verbergen
  ([workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)).
  Senden Sie für diesen Fall der Signalreihenfolge in diesen Versionen das
  Signal vor der Nachricht und empfangen Sie erst, nachdem ein Signal oder
  eine Bedingung anzeigt, dass eine Nachricht vorhanden ist.

:::

## Upgrades und Rollbacks von Nachrichtenströmen {#stream-upgrades}

In Workflow 2.20.3 verbirgt der gemeinsame Cursor keine ausstehenden Nachrichten
mehr vor `receive()`, `receiveOne()`, `peek()`, `pendingCount()` oder
`hasPending()`. Empfangsvorgänge behalten Sequenzreihenfolge und Stapelgrenze
bei. Nach dem Upgrade kann eine Empfangsschleife zuerst ältere ausstehende
Nachrichten zurückgeben, die der gemeinsame Cursor bisher verborgen hat, und
danach neuere Nachrichten.

Ein Empfang beim Replay gibt zurück, was sein ursprünglicher Schritt
verbraucht hat. Hat der ursprüngliche Aufruf nichts gefunden, gibt auch das
Replay nichts zurück. Ein erstmals ausgeführter Update-Handler kann weiterhin
empfangen. Ein in einer Eigenschaft aufbewahrter Strom zeichnet Empfang nun
beim aktuellen Workflow-Schritt auf, statt beim Schritt, in dem er geöffnet
wurde. Empfangsvorgänge, die frühere Releases beim Öffnungsschritt aufgezeichnet
haben, lassen sich weiterhin per Replay ausführen.

Bevor Sie eine eingebettete Anwendung auf eine Version vor 2.20.3 zurücksetzen,
wenden Sie die [Replay-Prüfung](../testing.md#replay-before-deployment) auf
Verläufe an, die das neuere Paket geschrieben hat. Frühere Versionen suchen
den Empfang aufbewahrter Ströme beim Öffnungsschritt und können solche Läufe
anders wiedergeben. Ein Rollback stellt außerdem die Fehler beim gemeinsamen
Cursor, beim Replay leerer Empfangsaufrufe und bei der Genauigkeit der
Fake-Aufgabenverarbeitung wieder her. Siehe die
[Kompatibilitätshinweise zum Tag](https://github.com/durable-workflow/workflow/blob/2.20.3/CHANGELOG.md#2203---2026-11-04).

Die Abfrageeinschränkung in
[workflow#1024](https://github.com/durable-workflow/workflow/issues/1024)
bleibt bestehen: Eine Abfrage kann für eine von einem Update-Handler empfangene
Nachricht nichts zurückgeben, weil sie den Handler beim falschen Schritt
wiedergibt. Die Abfrage ändert keine Nachrichtenzeilen. Beim eigenen Replay
des Workflows und in seiner abgeschlossenen Ausgabe wird weiterhin
zurückgegeben, was der Handler empfangen hat.

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

Nachrichtenströme orientieren sich an Instanzen. Bei Continue-as-new gehen
ausstehende eingehende Nachrichten auf den fortgesetzten Lauf über, die
Cursor-Position wird übernommen, und verbrauchte Nachrichten bleiben als
historische Nachweise am ursprünglichen Lauf. Workflow 2.20.1 und früher
übertrugen nur den Cursor: Nachrichten, die beim Continue-as-new noch
ausstanden, blieben am geschlossenen Lauf, und der fortgesetzte Lauf erhielt sie
nie
([workflow#1018](https://github.com/durable-workflow/workflow/issues/1018),
behoben in 2.20.2). Empfangen Sie in diesen Releases ausstehende Nachrichten,
bevor Sie `continueAsNew()` aufrufen, oder senden Sie Eingaben, die die Übergabe
überstehen müssen, als [Signal](./signals.md): Angenommene Signale, die der Lauf
noch nicht angewendet hat, gehen auf den fortgesetzten Lauf über.

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
