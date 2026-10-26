---
sidebar_position: 12
---

# Ereignisse {#events}

Lebenszyklusereignisse werden an wichtigen Punkten der Workflow- und
Aktivitätsausführung ausgelöst, um Ihre Anwendung über Fortschritt, Abschluss
oder Fehler zu informieren. Es sind normale Laravel-Ereignisse. Registrieren
Sie Listener im `EventServiceProvider` oder mit `Event::listen()`.

`WorkflowCancelled` und `WorkflowTerminated` warten auf den Commit der Transaktion auf der Speicherverbindung des Laufs. Abgelehnte Befehle und zurückgerollte Schreibvorgänge lösen keines dieser Ereignisse aus. Weitere Lücken bei Engine-Transaktionen und der Reihenfolge von Lebenszyklusereignissen werden in [workflow#893](https://github.com/durable-workflow/workflow/issues/893) verfolgt. Eine Transaktion auf einer separaten Anwendungsdatenbank macht Schreibvorgänge im Workflow-Speicher nicht atomar.

## Ereignisidentität {#event-identity}

Jedes V2-Ereignis enthält dauerhafte Identitätsfelder:

| Feld | Beschreibung |
|---|---|
| `instanceId` | Die Workflow-Instanz-ID, über Continue-as-new hinweg stabil. |
| `runId` | Die ID des konkreten Laufs. |
| `workflowType` | Der über `#[Type('...')]` registrierte dauerhafte Typschlüssel. |
| `workflowClass` | Der PHP-Klassenname des Workflows. |
| `committedAt` | ISO-8601-Zeitstempel der realen Uhrzeit, erfasst beim Vorbereiten der Lebenszyklusbenachrichtigung. |

Aktivitätsereignisse enthalten zusätzlich:

| Feld | Beschreibung |
|---|---|
| `activityExecutionId` | Die dauerhafte ID der Aktivitätsausführung. |
| `activityType` | Der dauerhafte Typschlüssel der Aktivität. |
| `activityClass` | Der PHP-Klassenname der Aktivität. |
| `sequence` | Die Position der Aktivität innerhalb der Workflow-Ausführung. |
| `attemptNumber` | Die Versuchsnummer, beginnend bei 1. |

## Workflow-Ereignisse {#workflow-events}

### WorkflowStarted {#workflowstarted}

Wird ausgelöst, wenn ein Workflow-Start dauerhaft festgeschrieben ist: Der erste
Lauf wurde erstellt und das Historienereignis `WorkflowStarted` aufgezeichnet.

```php
use Workflow\V2\Events\WorkflowStarted;

Event::listen(WorkflowStarted::class, function (WorkflowStarted $event) {
    Log::info('Workflow started', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'type' => $event->workflowType,
    ]);
});
```

Dieses Ereignis wird auch beim Beginn eines neuen Laufs durch Continue-as-new
ausgelöst.

### WorkflowCompleted {#workflowcompleted}

Wird ausgelöst, wenn ein Workflow-Lauf erfolgreich abgeschlossen wird.

```php
use Workflow\V2\Events\WorkflowCompleted;

Event::listen(WorkflowCompleted::class, function (WorkflowCompleted $event) {
    Log::info('Workflow completed', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
    ]);
});
```

### WorkflowFailed {#workflowfailed}

Wird ausgelöst, wenn ein Workflow-Lauf endgültig fehlschlägt.

Bei Überschreitung des Zeitlimits eines Laufs wird ebenfalls `WorkflowFailed` ausgelöst. Läuft dagegen die Bereinigungsfrist einer kooperativen Stornierung ab, wird `WorkflowCancelled` ausgelöst.

Zusätzliche Felder:
- `exceptionClass`: Der PHP-Klassenname der Ausnahme.
- `message`: Die Ausnahmemeldung.

```php
use Workflow\V2\Events\WorkflowFailed;

Event::listen(WorkflowFailed::class, function (WorkflowFailed $event) {
    Log::error('Workflow failed', [
        'instance_id' => $event->instanceId,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

### WorkflowCancelled {#workflowcancelled}

Wird ausgelöst, wenn eine sofortige Stornierung einen Lauf schließt oder eine kooperative Stornierung ihn nach abgeschlossener Bereinigung beziehungsweise Ablauf der Bereinigungsfrist schließt. Die Stornierungsanfrage allein löst dieses Ereignis nicht aus.

Zusätzlich zu den gemeinsamen Identitätsfeldern:

| Feld | Beschreibung |
|---|---|
| `reason` | Der ursprüngliche Grund des Stornierungsbefehls oder `null`. Meldungen zum Abschluss oder Fristablauf der Bereinigung ersetzen ihn nicht. |
| `closedAt` | Der gespeicherte Abschlusszeitpunkt des Laufs als UTC-ISO-8601-Zeichenkette. |

```php
use Workflow\V2\Events\WorkflowCancelled;

Event::listen(WorkflowCancelled::class, function (WorkflowCancelled $event) {
    Log::info('Workflow cancelled', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

### WorkflowTerminated {#workflowterminated}

Wird ausgelöst, wenn eine erzwungene Beendigung einen Lauf schließt. Es enthält dieselben Identitätsfelder sowie `reason` und `closedAt`, wobei der Grund aus dem Beendigungsbefehl stammt. Bei der erzwungenen Beendigung wird kein Bereinigungscode des Workflows ausgeführt.

```php
use Workflow\V2\Events\WorkflowTerminated;

Event::listen(WorkflowTerminated::class, function (WorkflowTerminated $event) {
    Log::info('Workflow terminated', [
        'instance_id' => $event->instanceId,
        'run_id' => $event->runId,
        'reason' => $event->reason,
        'closed_at' => $event->closedAt,
    ]);
});
```

Dies sind prozessinterne Laravel-Benachrichtigungen. Ein Listener-Fehler kann einen festgeschriebenen Abschluss nicht rückgängig machen. Die Ereignisse berechtigen nicht zur Fortsetzung eines geschlossenen Laufs und garantieren keine dauerhafte Zustellung an ein externes System.

## Aktivitätsereignisse {#activity-events}

### ActivityStarted {#activitystarted}

Wird ausgelöst, wenn eine Aktivitätsaufgabe übernommen wird und ihre Ausführung
beginnt.

```php
use Workflow\V2\Events\ActivityStarted;

Event::listen(ActivityStarted::class, function (ActivityStarted $event) {
    Log::info('Activity started', [
        'activity' => $event->activityType,
        'sequence' => $event->sequence,
        'attempt' => $event->attemptNumber,
    ]);
});
```

### ActivityCompleted {#activitycompleted}

Wird ausgelöst, wenn eine Aktivität erfolgreich abgeschlossen wird.

```php
use Workflow\V2\Events\ActivityCompleted;

Event::listen(ActivityCompleted::class, function (ActivityCompleted $event) {
    Log::info('Activity completed', [
        'activity' => $event->activityType,
        'execution_id' => $event->activityExecutionId,
    ]);
});
```

### ActivityFailed {#activityfailed}

Wird ausgelöst, wenn eine Aktivität endgültig fehlschlägt, weil alle
Wiederholungen ausgeschöpft sind oder eine nicht wiederholbare Ausnahme
vorliegt. Wiederholbare Fehler, die erneut versucht werden, lösen dieses
Ereignis **nicht** aus.

Zusätzliche Felder:
- `exceptionClass`: Der PHP-Klassenname der Ausnahme.
- `message`: Die Ausnahmemeldung.

```php
use Workflow\V2\Events\ActivityFailed;

Event::listen(ActivityFailed::class, function (ActivityFailed $event) {
    Log::error('Activity failed', [
        'activity' => $event->activityType,
        'exception' => $event->exceptionClass,
        'message' => $event->message,
    ]);
});
```

## Fehlerereignisse {#failure-events}

### FailureRecorded {#failurerecorded}

Wird bei jedem Festschreiben eines dauerhaften Fehlerdatensatzes ausgelöst,
sowohl bei endgültigen Workflow- als auch Aktivitätsfehlern. Dies ist der
gemeinsame Integrationspunkt für Fehlermeldedienste wie Sentry oder Bugsnag.

| Feld | Beschreibung |
|---|---|
| `failureId` | Die ID des dauerhaften Fehlerdatensatzes. |
| `sourceKind` | `"workflow_run"` oder `"activity_execution"`. |
| `sourceId` | Die ID der Quelle, also Lauf-ID oder Aktivitätsausführungs-ID. |
| `exceptionClass` | Der PHP-Klassenname der Ausnahme. |
| `message` | Die Ausnahmemeldung. |

```php
use Workflow\V2\Events\FailureRecorded;

Event::listen(FailureRecorded::class, function (FailureRecorded $event) {
    // Report to Sentry, Bugsnag, etc.
    report(new \RuntimeException(
        "[{$event->sourceKind}] {$event->exceptionClass}: {$event->message}"
    ));
});
```

## Zeitstempelsemantik {#timestamp-semantics}

Die Engine erfasst `committedAt` beim Vorbereiten einer Lebenszyklusbenachrichtigung. Dieser Zeitstempel der realen Uhrzeit unterscheidet sich von:

- **Virtueller Workflow-Zeit**: der logischen Zeit innerhalb der Workflow-Ausführung, die von Timern verwendet wird.
- **Versuchszeit**: dem Start- oder Abschlusszeitpunkt eines bestimmten Aktivitätsversuchs.
- **Fortsetzungslatenz**: der Zeit zwischen Fälligkeit eines Timers und tatsächlicher Fortsetzung des Workflows.

Bei Stornierung und erzwungener Beendigung ist `closedAt` der gespeicherte Abschlusszeitpunkt in UTC. Eine umschließende Speichertransaktion kann erst nach dem Erfassen der Ereignisfelder festgeschrieben werden. Erfassen Sie den Empfangszeitpunkt im Listener separat, wenn Sie die Zustelllatenz messen.

## Lebenszyklus {#lifecycle}

Ein typischer erfolgreicher Workflow-Lebenszyklus:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityCompleted
Workflow\V2\Events\WorkflowCompleted
```

Ein Workflow-Lebenszyklus mit endgültigem Aktivitätsfehler:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\ActivityStarted
Workflow\V2\Events\ActivityFailed
Workflow\V2\Events\FailureRecorded    (source: activity_execution)
Workflow\V2\Events\WorkflowFailed
Workflow\V2\Events\FailureRecorded    (source: workflow_run)
```

Ein stornierter Lauf endet mit:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowCancelled
```

Bei kooperativer Bereinigung können zwischen diesen beiden Benachrichtigungen Aktivitätsereignisse auftreten.

Ein erzwungen beendeter Lauf endet mit:

```
Workflow\V2\Events\WorkflowStarted
Workflow\V2\Events\WorkflowTerminated
```

## Ereignis-Namespace {#event-namespace}

V2-Ereignisse liegen im Namespace `Workflow\V2\Events`. Bei einem Upgrade
einer bestehenden Anwendung finden Sie die Zuordnung der
V1-Kompatibilitätsereignisse unter [Migration](../migration.md).
