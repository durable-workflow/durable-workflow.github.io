---
sidebar_position: 6
title: Workflow-API
sidebar_label: Workflow-API
description: Referenz der Workflow-API.
tags:
  - reference
  - workflows
  - api
keywords:
  - Workflow-API
---

# Workflow-API {#workflow-api}

Diese Seite ist die vollständige Referenz. Eine leichter lesbare Darstellung
finden Sie auf den einzelnen Funktionsseiten.

- [Workflows](./workflows.md) beschreibt die Form der Workflow-Klasse und das deterministische Orchestrierungsmodell.
- [Aktivitäten](./activities.md) beschreibt Seiteneffekte, Wiederholungen und Routing.
- [Lokale Aktivitäten](../features/local-activities.md) beschreibt kurze Aktivitätsarbeit im selben Prozess mit Aktivitätshistorie und Wiederholungssemantik.
- [Signale](../features/signals.md), [Updates](../features/updates.md) und [Abfragen](../features/queries.md) beschreiben die öffentlichen Workflow-Verträge.
- [Timer](../features/timers.md), [Bedingungswarten](../features/condition-waits.md) und [Als neuer Lauf fortsetzen](../features/continue-as-new.md) beschreiben langlebigen Kontrollfluss.
- [Nachrichtenströme](../features/message-streams.md) beschreibt wiederholte geordnete Nachrichten mit Cursor-Semantik.

## Weitere Informationen für KI {#more-info-for-ai}

Die meisten Leser können den folgenden aufklappbaren Abschnitt überspringen.
Öffnen Sie ihn, wenn Sie genaue Signaturen, Rückgabeverträge,
maschinenverarbeitbare Hinweise oder die vollständige API an einem Ort
benötigen.

<details id="workflow-api-details">
<summary><b>Weitere Informationen für KI</b></summary>

**Workflow-Basisobjekt**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| Mitglied | Verwenden, wenn | Rückgabevertrag |
| --- | --- | --- |
| `workflowId()` | Der Workflow seine stabile öffentliche Instanz-ID benötigt. | Instanz-ID als Zeichenfolge, über Continue-as-new hinweg unverändert. |
| `runId()` | Der Workflow die ID des gerade ausgeführten Laufs benötigt. | Lauf-ID als Zeichenfolge für die ausgewählte Ausführung. |
| `lastChild()` | Der Workflow dem zuletzt gestarteten untergeordneten Workflow ein Signal senden muss. | `ChildWorkflowHandle` oder `null`. |
| `children()` | Der Workflow Referenzen auf die in der aktuellen Replay-Sequenz sichtbaren untergeordneten Workflows benötigt. | Liste von `ChildWorkflowHandle`. |
| `historyLength()` | Der Workflow einen anzahlbasierten Hinweis auf sein Historienbudget benötigt. | Aktuelle Anzahl der Historienereignisse. |
| `historySize()` | Der Workflow einen bytebasierten Hinweis auf sein Historienbudget benötigt. | Ungefähre Größe der gespeicherten Historie in Bytes. |
| `shouldContinueAsNew()` | Der Workflow vor zu hohen Historienkosten einen neuen Lauf beginnen sollte. | `true`, wenn die konfigurierten Historienbudgets einen Wechsel empfehlen. |

## Dauerhafte Befehle {#durable-commands}

Die statische Fassade delegiert an Helfer im Namespace `Workflow\V2`. Beide
Formen sind gleichwertig:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| Fassade | Helfer | Signatur | Dauerhafter Effekt |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | Plant eine Aktivität ein und wartet auf ihr Ergebnis. |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | Alias für `activity()`. |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | Führt eine kurze Aktivität im aktuellen Workflow-Worker-Prozess aus und zeichnet Aktivitätshistorie mit `execution_mode=local` auf. |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | Alias für `localActivity()`. |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Startet einen untergeordneten Workflow und wartet auf sein Ergebnis. Übergeben Sie `ChildWorkflowOptions` als erstes Argument, um die Richtlinie beim Schließen des Elternlaufs festzulegen (Standard `ParentClosePolicy::Abandon`) oder das Routing des untergeordneten Workflows zu überschreiben. |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Alias für `child()`. |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | Führt eine aufrufbare Funktion als automatisch erzeugten untergeordneten Workflow aus. |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | Wartet auf nebenläufige Aufrufe und liefert die Ergebnisse in Iterationsreihenfolge zurück. |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | Alias für `all()`. |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | Startet unabhängige dauerhafte Aufrufe und liefert den ersten festgeschriebenen Gewinner sowie stabile Referenzen für jedes Mitglied zurück. |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | Wartet auf ein benanntes Signal oder eine Replay-sichere Bedingung. |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | Wartet mit explizitem Timeout auf ein Signal oder eine Bedingung. |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | Wartet auf ein benanntes Signal. |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | Unterbricht die Ausführung, bis die dauerhafte Zeit fortgeschritten ist. |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | Zeichnet ein nichtdeterministisches Ergebnis in der Historie auf und gibt es beim Replay wieder. |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | Erzeugt eine Replay-stabile UUIDv4. |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | Erzeugt eine Replay-stabile UUIDv7. |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | Beendet den aktuellen Lauf und startet für dieselbe Instanz einen neuen Lauf. |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | Handelt eine Replay-sichere Workflow-Codeversion aus. |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | Gibt an, ob der Lauf einen benannten Patch-Marker durchlaufen hat. |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | Hält einen Patch-Marker nach Entfernen des alten Codes aufrecht. |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | Aktualisiert nicht indexierte Laufmetadaten. |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | Aktualisiert indexierte, für Betreiber sichtbare Metadaten. |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | Liest die deterministische Workflow-Zeit. |

`activity()` und `executeActivity()` planen dauerhafte Aktivitätsaufgaben in
einer Queue ein. `localActivity()` und `executeLocalActivity()` laufen im
aktuellen Workflow-Worker-Prozess und zeichnen normale Aktivitätshistorie mit
lokalem Marker auf. Verwenden Sie `sideEffect()` für Replay-sichere Snapshots,
die keine Aktivitätswiederholungs-, Timeout-, Heartbeat- oder Abbruchsemantik
benötigen. Verwenden Sie `Workflow::workerSession()` oder
`Workflow\V2\workerSession()`, wenn mehrere gewöhnliche Aktivitätsschritte den
unterstützten Affinitätsvertrag für Worker-Sitzungen benötigen. Den vollständigen
Ausführungsvertrag beschreiben
[Ausführungsmodell für Aktivitäten](/docs/features/activity-execution-model),
[Lokale Aktivitäten](/docs/features/local-activities) und
[Worker-Sitzungen](/docs/features/worker-sessions).

**Timer-Helfer**

Timer-Helfer sind Kurzformen für `timer()` und `Workflow::timer()`:

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| Helfer | Entsprechung |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

Verwenden Sie explizite `timer()`-Aufrufe, wenn die Dauer aus Konfiguration oder
Workflow-Eingabe stammt. Verwenden Sie Timer-Helfer, wenn der Quellcode eine
feste geschäftliche Wartezeit ausdrücken soll.

**Nachrichtenströme**

Öffnen Sie dauerhafte Nachrichtenströme über die Workflow-Instanz:

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| Methode | Signatur | Vertrag |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Öffnet den Strom zum Lesen oder Senden. |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias für Code zum Empfangen. |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias für Code zum Senden. |
| `MessageStream::key()` | `key(): string` | Gibt den Stromschlüssel zurück. |
| `MessageStream::cursor()` | `cursor(): int` | Gibt die dauerhafte Cursor-Position für diesen Lauf zurück. |
| `MessageStream::hasPending()` | `hasPending(): bool` | Gibt an, ob im Strom unverbrauchte Nachrichten vorhanden sind. |
| `MessageStream::pendingCount()` | `pendingCount(): int` | Gibt die Anzahl unverbrauchter Nachrichten im Strom zurück. |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | Liest ausstehende Nachrichten, ohne sie zu verbrauchen. |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | Liest und verbraucht Nachrichten und zeichnet den Cursor-Fortschritt auf. |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | Liest und verbraucht eine Nachricht. |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | Sendet eine geordnete Payload-Referenznachricht an eine andere Workflow-Instanz. |

Verwenden Sie Nachrichtenströme für wiederholte geordnete Nachrichten mit
Cursor-Semantik. Verwenden Sie [Signale](../features/signals.md) für einmalige
externe Ereignisse und [Updates](../features/updates.md) für Änderungen mit
Anfrage und Rückgabe.

**Attribute und öffentliche Verträge**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| Attribut | Ziel | Stabiler Vertrag |
| --- | --- | --- |
| `#[Type('type-key')]` | Workflow- oder Aktivitätsklasse | Deklariert den sprachneutralen dauerhaften Typschlüssel. |
| `#[Signal('signal-name', [...])]` | Workflow-Klasse, wiederholbar | Deklariert akzeptierte Signalnamen und optionale geordnete Parameterverträge. |
| `#[QueryMethod('query-name')]` | Workflow-Methode | Deklariert einen Replay-sicheren Abfragenamen. Ohne Namen wird der PHP-Methodenname verwendet. |
| `#[UpdateMethod('update-name')]` | Workflow-Methode | Deklariert einen Replay-sicheren Updatenamen. Ohne Namen wird der PHP-Methodenname verwendet. |

Signale, Abfragen und Updates sind öffentliche Workflow-Verträge. Bevorzugen
Sie explizite Namen, damit das Umbenennen von PHP-Methoden keine API-Brüche
verursacht.

**Fehleroberfläche**

Fehler der Autoren-API sind dauerhafte Workflow-Fehler, sofern der Befehl nicht
vor der Ausführung abgelehnt wird:

| Bereich | Typischer Fehler | Bedeutung für Betreiber |
| --- | --- | --- |
| `activity()` | Aktivität wirft eine Ausnahme, überschreitet einen Timeout oder schöpft die Wiederholungsrichtlinie aus. | Der Lauf zeichnet den Aktivitätsfehler in der Historie auf und folgt der Workflow-Fehlerbehandlung. |
| `child()` | Untergeordneter Workflow schlägt fehl, wird abgebrochen, beendet oder überschreitet einen Timeout. | Der Elternlauf erhält am wartenden Befehl ein Fehlerergebnis des untergeordneten Workflows. |
| `await()` | Timeout läuft ab, bevor Bedingung oder Signal erfüllt ist. | Das Warten kehrt entsprechend der ausgewählten Await-Form zurück oder schlägt fehl. |
| `timer()` | Ungültige Dauereingabe nach Normalisierung. | Der Code sollte positive Dauern oder explizite Wartezeiten von null übergeben. |
| `continueAsNew()` | Neuer Lauf kann nicht erstellt werden. | Der aktuelle Lauf bleibt der Nachweispunkt für den fehlgeschlagenen Übergang. |
| `upsertSearchAttributes()` | Attributschlüssel, Anzahl oder Gesamtgröße überschreitet Grenzen. | Der Lauf schlägt fehl, bevor ungültige indexierte Metadaten gespeichert werden. |
| `MessageStream::receive()` | Keine positive Workflow-Historiensequenz verfügbar. | Der Empfang muss aus der Workflow-Ausführung erfolgen, nicht aus direktem Dienstcode. |
| `MessageStream::sendReference()` | Payload-Referenz, Route oder Speichervertrag ist nachgelagert ungültig. | Die Nachrichtenreihenfolge bleibt von der Integrität des Payload-Speichers getrennt. |

Payload- und Historiengrenzen beschreibt
[Strukturelle Grenzen](../constraints/structural-limits.md).
Antworten auf Befehlsablehnungen außerhalb von PHP-Workflow-Code beschreibt die
[Server-API-Referenz](../polyglot/server-api-reference.md).

**Determinismusregeln**

Workflow-Code muss Replay-sicher sein. Platzieren Sie unumkehrbare oder
nichtdeterministische Arbeit hinter dauerhaften Befehlen:

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- Verwenden Sie `Workflow::now()` statt der Echtzeituhr in Workflow-Verzweigungen.
- Verwenden Sie `Workflow::uuid4()` oder `Workflow::uuid7()` statt direktem Zufall.
- Platzieren Sie Netzwerkaufrufe, Dateisystem-Schreibzugriffe, E-Mail-Versand und externe Seiteneffekte in Aktivitäten.
- Verwenden Sie `Workflow::sideEffect()` nur, wenn der Wert in der Historie erfasst werden muss und der Seiteneffekt selbst nicht die geschäftliche Aktion ist.
- Verwenden Sie `Workflow::getVersion()`, `Workflow::patched()` und `Workflow::deprecatePatch()`, um Workflow-Code ohne Replay-Brüche weiterzuentwickeln.

</details>
