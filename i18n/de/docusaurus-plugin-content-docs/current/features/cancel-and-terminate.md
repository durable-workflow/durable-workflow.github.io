---
sidebar_position: 16
---

# Abbrechen und Beenden {#cancel-and-terminate}

Diese Anleitung behandelt die eingebettete Laravel-API
`Workflow\V2\WorkflowStub`. Für Clients und Worker im Service-Modus verwenden
Sie die [PHP-SDK-Anleitung](https://php.durable-workflow.com/), die
[Python-Abbruchreferenz](https://python.durable-workflow.com/reference/errors/#durable_workflow.errors.ActivityCancelled)
oder die [Rust-Lebenszyklus-API](https://rust.durable-workflow.com/durable_workflow/struct.Client.html#method.cancel_workflow).

Abbrechen und Beenden sind vollwertige dauerhafte Befehle, die einen laufenden
Workflow schließen. Beide werden in der Befehlshistorie aufgezeichnet,
erscheinen in typisierten Historienereignissen und sind in Waterline sichtbar.

In der aktuellen eingebetteten API schließen beide Befehle den Lauf sofort.
**Abbrechen** zeichnet das Ergebnis `cancelled` auf, **Beenden** das Ergebnis
`terminated`. Keiner der Befehle plant Aufräumarbeiten innerhalb des
geschlossenen Workflows ein. Eingebettetes Laravel stellt außerdem
`requestCancellation()` für begrenztes kooperatives Aufräumen bereit.
Server und die PHP-, Python- und Rust-SDKs unterstützen diese separate
kooperative Anforderung mit Workern, die sie explizit aktivieren. Den Vertrag
für Fähigkeiten, Fristen, Aufräumen und Wiederherstellung beschreibt
[Kooperativer Abbruch](/docs/polyglot/cancellation).

## Abbrechen {#cancel}

Abbrechen versetzt den Lauf sofort in `cancelled` und zeichnet dauerhafte
Historie auf.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->cancel();

$result->accepted();   // true
$result->outcome();    // "cancelled"
$result->commandId();  // Durable command id
$result->reason();     // null (no reason provided)
```

### Abbrechen mit Begründung {#cancel-with-reason}

Sie können eine strukturierte Begründung angeben, um benutzer-, richtlinien-
und betreibergesteuerte Abbrüche in Auditspuren, Befehlshistorie und Waterline
zu unterscheiden.

```php
$result = $workflow->cancel('Customer requested cancellation');

$result->reason(); // "Customer requested cancellation"
```

Die Begründung wird im dauerhaften Befehlsdatensatz und in beiden typisierten
Historienereignissen `CancelRequested` und `WorkflowCancelled` gespeichert.
Sie bleibt daher bei Replay, Export und Offline-Analyse erhalten.

### Was Abbrechen bewirkt {#what-cancel-does}

Wird ein Abbruchbefehl angenommen, schließt die Engine offene
Aktivitätsausführungen und ausstehende Timer, setzt den Lauf auf `cancelled`
und setzt einen auf dieses abgebrochene Kind wartenden Elternworkflow fort,
damit er das Ergebnis beobachten kann.

### Wann Abbrechen abgelehnt wird {#cancel-is-rejected-when}

- Die Instanz wurde noch nicht gestartet: `rejection_reason = instance_not_started`.
- Der aktuelle Lauf ist bereits geschlossen: `rejection_reason = run_not_active`.
- Ein laufbezogener Abbruch adressiert einen historischen, nicht aktuellen Lauf: `rejection_reason = selected_run_not_current`.

## Beenden {#terminate}

Beenden schließt einen laufenden Workflow sofort, ohne weiteren Workflow-Code
einzuplanen. Wie Abbrechen bietet es kein Aufräumfenster. Verwenden Sie es,
wenn das gesonderte Ergebnis `terminated` angemessen ist.

```php
$result = $workflow->terminate();

$result->accepted();   // true
$result->outcome();    // "terminated"
```

### Beenden mit Begründung {#terminate-with-reason}

```php
$result = $workflow->terminate('Operator emergency shutdown');

$result->reason(); // "Operator emergency shutdown"
```

### Was Beenden bewirkt {#what-terminate-does}

Beenden folgt denselben Transaktionsschritten wie Abbrechen, aber:

- Es zeichnet stattdessen `TerminateRequested` und `WorkflowTerminated` auf.
- Es erstellt die `WorkflowFailure`-Zeile mit `failure_category = terminated` und `propagation_kind = terminated`.
- Es setzt `closed_reason = terminated` am Lauf.
- Es plant keine weitere Ausführung von Workflow-Code ein.

### Wann Beenden abgelehnt wird {#terminate-is-rejected-when}

Es gelten dieselben Ablehnungsbedingungen wie beim Abbrechen.

## Laufbezogene Befehle {#run-targeted-commands}

Abbrechen und Beenden können statt des aktuellen Laufs einer Instanz einen
bestimmten Lauf adressieren.

```php
$selectedRun = WorkflowStub::loadRun($runId);
$result = $selectedRun->attemptCancel('Draining old run');

$result->targetScope(); // "run"
```

Laufbezogene Befehle werden mit `selected_run_not_current` abgelehnt, wenn der
adressierte Lauf nicht mehr der aktuelle Lauf der Instanz ist. Die Antwort
enthält `requested_run_id` (den vom Aufrufer adressierten Lauf) und
`resolved_run_id` (den aktuellen Lauf für den nächsten Aufruf).

## API ohne Ausnahmen {#non-throwing-api}

Verwenden Sie `attemptCancel()` und `attemptTerminate()`, um Ablehnungen ohne
Ausnahmen zu behandeln:

```php
$result = $workflow->attemptCancel('Duplicate order');

if ($result->rejected()) {
    $result->rejectionReason(); // e.g. "run_not_active"
}
```

`cancel()` und `terminate()` werfen bei Ablehnung `LogicException`.

## Webhooks {#webhooks}

Abbrechen und Beenden stehen über Webhook-Routen bereit:

```text
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Übergeben Sie die Begründung im Anfragetext:

```json
{
  "reason": "Operator: duplicate order"
}
```

Die Antwort enthält das Befehlsergebnis, die öffentliche Instanz-ID und die
Begründung:

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

## Abbruch ist kein versehentlich abgefangener Fehler {#cancellation-is-not-an-error-you-catch-by-accident}

Abbruch ist ein explizites Lebenszyklusergebnis, kein unerwarteter
Anwendungsfehler. `Workflow\V2\Exceptions\WorkflowCancelledException` des
eingebetteten Pakets erweitert `\Error`, nicht `\Exception`.
Ein `catch (\Exception $e)`-Block fängt sie nicht ab, ein
`catch (\Throwable $t)`-Block dagegen schon.

Fangen Sie beim Lesen des Ergebnisses eines abgebrochenen Workflows die Ausnahme
gezielt anhand ihres Namens ab, wenn Sie Abbruch von anderen Fehlern
unterscheiden müssen. Das Abfangen einer ergebnisseitigen Ausnahme öffnet den
abgebrochenen Lauf nicht erneut und plant darin keine Aufräumarbeiten ein.

## Waterline {#waterline}

Waterline stellt Abbrechen und Beenden als Betreiberaktionen in der
Detailansicht des ausgewählten Laufs bereit. Der Detail-Payload enthält die
aus dauerhaftem Zustand abgeleiteten Kennzeichen `can_cancel` und
`can_terminate`.

Die Befehlshistorienansicht zeigt jeden Abbruch- oder Beendigungsbefehl mit
Begründung, Aufruferidentität und Ergebnis. Das Feld `commands[*].reason`
enthält die vom Betreiber oder Aufrufer vorgegebene Begründung, sofern eine
angegeben wurde.

## Statuszuordnung {#status-mapping}

Läufe mit `cancelled` und `terminated` landen für die Listenführung in der
Statusgruppe `failed`. Die Rohfelder `status` und `closed_reason`
unterscheiden sie:

| Status | Statusgruppe | Abschlussgrund |
| --- | --- | --- |
| `cancelled` | `failed` | `cancelled` |
| `terminated` | `failed` | `terminated` |

## Typisierte Historie {#typed-history}

Ein abgebrochener Lauf erzeugt diese Historienfolge:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
CancelRequested       <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowCancelled     <- failure_id, failure_category, reason when supplied
```

Ein beendeter Lauf erzeugt:

```
StartAccepted
WorkflowStarted
... (workflow progress) ...
TerminateRequested    <- reason field present when supplied
TimerCancelled        <- for each open timer
ActivityCancelled     <- for each open activity
WorkflowTerminated    <- failure_id, failure_category, reason when supplied
```

## Abbrechen und Beenden im Vergleich {#cancel-vs-terminate}

| | Abbrechen | Beenden |
| --- | --- | --- |
| Weiterer Workflow-Code wird eingeplant | Nein | Nein |
| Offene Aktivitäten werden abgebrochen | Ja | Ja |
| Offene Timer werden abgebrochen | Ja | Ja |
| Begründungsmetadaten | Ja | Ja |
| Dauerhafte Befehlshistorie | Ja | Ja |
| Elternworkflow erhält Kindergebnis | Ja | Ja |
| Fehlerzeile wird aufgezeichnet | Ja (`cancelled`) | Ja (`terminated`) |
| Statusgruppe | `failed` | `failed` |
| Abschlussgrund | `cancelled` | `terminated` |
