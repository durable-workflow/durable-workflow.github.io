---
title: Signal-with-start und Workflow-Signale
description: Einen Workflow in einer Operation starten oder wiederverwenden und signalisieren sowie aus Workflow-Code dauerhaft einen anderen Workflow signalisieren, mit dem PHP-, Python- und Rust-SDK.
---

# Signal-with-start und Workflow-Signale {#signal-with-start-and-workflow-signals}

Der native Server 3.15.0 ergänzt zwei Signaloperationen:

- **Signal-with-start** ist ein Client-Aufruf. Eine Anfrage startet den Workflow
  oder verwendet seinen offenen Lauf wieder und zeichnet ein Signal in diesem
  Lauf auf, in einer Server-Transaktion.
- **Einen anderen Workflow signalisieren** ist ein Workflow-Befehl.
  Workflow-Code signalisiert einen anderen Workflow in seinem Namespace. Die
  Anfrage und ihr Ergebnis werden einmal in der Historie des Absenders
  aufgezeichnet, und Replay sendet das Signal nie erneut.

## Voraussetzungen {#requirements}

| Laufzeit | Signal-with-start | Einen anderen Workflow signalisieren |
| --- | --- | --- |
| Nativer Server | 3.15.0 oder neuer, angekündigt als `capabilities.signal_with_start` | 3.15.0 oder neuer, angekündigt als Worker-Befehl `signal_external_workflow` |
| PHP SDK | 3.22.0 oder neuer: `Client::signalWithStart()` | 3.22.0 oder neuer: `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 oder neuer: `Client.signal_with_start()` | 2.20.0 oder neuer: `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 oder neuer: `Client::signal_with_start()` | 4.21.0 oder neuer: `ctx.signal_external_workflow()` |
| Eingebettetes PHP (Laravel) | `WorkflowStub::signalWithStart()`, siehe [Leitfaden zu Signalen](../features/signals.md#signal-with-start) | Workflow 2.35.0 oder neuer (experimentell): `signalExternalWorkflow()`, siehe [Leitfaden zu Signalen](../features/signals.md#signal-another-workflow) |

Der veröffentlichte PHP-Server 2.x unterstützt keine der beiden Operationen.
Die SDKs prüfen den verbundenen Server vor dem Senden. Gegenüber einem älteren
Server löst ein Client-Aufruf `ServerCapabilityUnavailable` (PHP),
`RuntimeCapabilityUnsupported` (Python) oder `Error::SignalWithStartUnavailable`
(Rust) aus, und es wird nichts gesendet. Ein Worker lehnt einen neuen
Signalbefehl mit `signal_external_workflow_unavailable` ab, bevor er etwas
übermittelt. Die Workflow-Aufgabe wird daher nicht abgeschlossen, und der Lauf
schlägt nicht fehl.

## Signal-with-start {#signal-with-start}

Verwenden Sie Signal-with-start, wenn ein Aufrufer eine Entität adressiert und
das Ereignis zwischen einem separaten Start und Signal nicht verlieren darf. Ein
separates `start(use-existing)` mit folgendem `signal` sind zwei Operationen:
Dazwischen kann der Lauf schließen, und das Signal wird dann abgelehnt.
Signal-with-start hat keine solche Lücke.

- **Kein Lauf.** Ein neuer Lauf startet mit der Eingabe und den Fristen dieses
  Aufrufs. Das `start_outcome` des Belegs ist `started_new`.
- **Ein offener Lauf**, einschließlich des neuesten Laufs nach Continue-as-new.
  Das Signal schließt sich ihm an, und `start_outcome` ist
  `returned_existing_active`. Der Lauf behält seine Eingabe, Fristen und
  Historie. Eine Duplikatrichtlinie `fail` lehnt ihn stattdessen mit
  `instance_already_started` ab.
- **Ein geschlossener Lauf.** Abgelehnt mit `run_not_active`, es sei denn, die
  Richtlinie für geschlossene Läufe ist `start_new_run`. Dann startet nach dem
  geschlossenen Lauf ein neuer, und der Beleg nennt den geschlossenen Lauf in
  `closed_run_id`. Der geschlossene Lauf behält sein Ergebnis.

Der Workflow-Typ muss der Typ der Instanz sein, und die Task-Queue muss die
Queue des offenen Laufs sein. Andernfalls lehnt der Server mit
`workflow_type_conflict` oder `task_queue_conflict` ab. Bei einer Ablehnung
wird nie etwas geschrieben.

Die Anfrage-ID ist der [Befehlsschlüssel](./server-api-reference.md#command-keys)
des Signals. Jedes SDK erzeugt pro Aufruf einen, wenn Sie ihn weglassen.
Speichern Sie einen eigenen Schlüssel, wenn eine Wiederholung einen
Prozessneustart überstehen muss. Eine Wiederholung mit demselben Schlüssel,
Signalnamen, denselben Argumenten und demselben Workflow-Typ gibt den
ursprünglichen Beleg mit `retained: true` zurück, auch nachdem der Lauf
geschlossen oder fortgesetzt wurde, und startet nichts.

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

Übergeben Sie `closedRunPolicy: 'start_new_run'` (PHP),
`closed_run_policy="start_new_run"` (Python) oder `ClosedRunPolicy::StartNewRun`
(Rust), um nach einem geschlossenen Lauf einen neuen zu starten.
Signal-with-start nimmt das Signal einmal an. Die vom Signal ausgelöste Arbeit
benötigt weiterhin ihre eigene Idempotenz.

## Einen anderen Workflow signalisieren {#signal-another-workflow}

Workflow-Code signalisiert einen anderen Workflow in seinem Namespace über die
Workflow-ID. Ohne Lauf-ID geht das Signal an den aktuellen Lauf des Ziels, mit
Lauf-ID nur an diesen Lauf. Das Signal ist ein Workflow-Befehl, keine
Aktivität:

- Der Abschluss, der es überträgt, zeichnet `ExternalSignalRequested` in der
  Historie des Absenders auf, nimmt das Signal beim Ziel an und zeichnet genau
  ein Ergebnis, `ExternalSignalDelivered` oder `ExternalSignalFailed`, an
  derselben Sequenz auf, alles in einer Server-Transaktion.
- Beim Ziel ist es ein gewöhnliches Signal: dasselbe Ereignis `SignalReceived`
  und derselbe Signaldatensatz wie bei jedem anderen Signal, dem sendenden Lauf
  zugeordnet. Sein Befehlsschlüssel beim Ziel ist
  `workflow-signal:<sender run ID>:<sequence>`. Aufrufer können dieses Präfix
  nicht verwenden: Ein Signal oder Signal-with-start, dessen Anfrage-ID mit
  `workflow-signal:` beginnt, wird mit 422 und
  `reason: "request_id_reserved"` abgelehnt.
- Replay liest das aufgezeichnete Ergebnis und sendet nie erneut. Ein anderes
  Ziel, ein anderer Lauf, Signalname oder andere Argumente an dieser Stelle im
  Workflow lassen das Replay als nichtdeterministisch fehlschlagen.

Ein nicht zugestelltes Signal ist ein Rückgabewert, keine Ausnahme. Der
Workflow-Code entscheidet, was damit geschieht.

| Ergebnis | Grund | Wann |
| --- | --- | --- |
| `delivered` | keiner | Der Ziellauf hat das Signal angenommen. |
| `target_not_found` | `instance_not_found` | In diesem Namespace existiert kein Workflow mit dieser ID. |
| `target_not_found` | `run_not_found` | Die Lauf-ID benennt keinen Lauf dieses Workflows. |
| `target_closed` | `run_not_active` | Der Ziellauf ist geschlossen. |
| `target_closed` | `historical_run` | Die Lauf-ID benennt einen Lauf, den Continue-as-new ersetzt hat. |
| `rejected` | `unknown_signal`, `invalid_signal_arguments`, `structural_limit_exceeded` | Das Ziel hat das Signal abgelehnt, wie es ein HTTP-Signal ablehnen würde. |
| `rejected` | `runtime_reserved_signal` | Der Name ist für den Nachrichtenstrom der Laufzeit reserviert. |
| `rejected` | `self_target` | Das Ziel ist der eigene Workflow des Absenders. |
| `rejected` | `request_id_conflict` | Der Befehlsschlüssel wurde bereits für ein anderes Signal verwendet. |

Die SDKs prüfen den Signalnamen im Workflow-Code, bevor etwas aufgezeichnet
wird. Er darf nicht leer sein, kein Steuerzeichen enthalten (ein Byte unter
`0x20` oder `0x7f`) und höchstens 191 Zeichen und 255 Bytes lang sein. Die
Ziel-Workflow-ID hat 1 bis 191 Zeichen. Ein abgelehnter Name löst
`InvalidSignalName` aus (PHP und Python) oder gibt `Error::InvalidExternalSignal`
zurück (Rust), und es wird kein Befehl gesendet.

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

Das Handle eines gestarteten Kind-Workflows hat denselben Befehl: `$child->signal('approve', ['Ada'])`.

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

Fügen Sie in Rust `.run_id(run_id)`, in Python `run_id=` oder in PHP `runId:`
hinzu, um nur einen Lauf des Ziels zu signalisieren.

Führen Sie den Befehl für sich allein aus. Er kann kein Mitglied einer
parallelen Gruppe oder einer dauerhaften Auswahl sein. Ein Worker, der eine
Workflow-Aufgabe hält, kann jeden Workflow im Namespace dieser Aufgabe
signalisieren, ohne die Operator-Rolle, die ein HTTP-Signal benötigt. Legen Sie
einen Workflow, den der Code anderer Workflows nicht signalisieren darf, in
einen separaten Namespace.

## Reihenfolge bei Bedingungen mit Zeitlimit {#timed-condition-order}

Mit Native Server ab 3.27.0, einem kompatiblen Worker und aktivierter Erzeugung geordneter Warteoperationen kann eine Bedingung mit Zeitlimit Signale und erfolgreich angewendete Updates berücksichtigen, die vor ihrem ursprünglichen `TimerFired`-Ereignis eingingen. Das gilt auch, wenn der Worker die Bedingung erst nach Auslösen des Timers prüft. Die Eingangsreihenfolge bestimmt, welcher zulässige Zustand die Bedingung zuerst erfüllt. Für ein benanntes Signal gilt dieselbe Zeitgrenze.

In einem unterstützten `select()` gewinnt die Bedingung gegen einen Kind-Workflow, wenn dieser erste passende Zustand in der Historie vor dessen Abschluss oder Fehlschlag liegt. Nach Abschluss der Warteoperation verwendet Replay das gespeicherte Ergebnis.

Das Erzeugen geordneter Warteoperationen ist standardmäßig deaktiviert. Folgen Sie bei einem selbst betriebenen Server vor der Aktivierung der [Anleitung für Rollout und Rollback](https://github.com/durable-workflow/server/blob/3.27.0/rust/README.md#rolling-out-durable-input-ordering-for-timed-waits).

## Wann weiterhin eine Aktivität nötig ist {#when-an-activity-is-still-needed}

Verwenden Sie eine Aktivität, die den Client aufruft, wenn der Workflow-Befehl
nicht passt:

- **Signal-with-start aus Workflow-Code.** Für Signal-with-start gibt es keinen
  Workflow-Befehl. Rufen Sie das Signal-with-start des Clients aus einer
  Aktivität auf und leiten Sie seine Anfrage-ID aus stabilen Workflow-Daten ab,
  etwa der Workflow-ID und einem fachlichen Schlüssel, sodass jede
  Wiederholung der Aktivität denselben Schlüssel sendet und der Server das
  Signal einmal annimmt.
- **Ein anderer Namespace.** Signale bleiben innerhalb des Namespace. Verwenden
  Sie stattdessen einen [Namespace-übergreifenden Service-Aufruf](./service-operations.md).
- **Ein älterer Server.** Vor dem nativen Server 3.15.0 kann Workflow-Code nur
  über eine Aktivität signalisieren. Geben Sie auch diesem Signal eine stabile
  Anfrage-ID, damit eine Wiederholung der Aktivität kein zweites Signal
  aufzeichnet.

Eine Aktivität wird mindestens einmal ausgeführt. Die stabile Anfrage-ID
verhindert deshalb, dass eine Wiederholung ein zweites Signal sendet. Der
Signalbefehl zeichnet sein Ergebnis ohne Aktivitätsaufgabe in der Historie auf.
