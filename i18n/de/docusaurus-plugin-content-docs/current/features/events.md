---
sidebar_position: 12
---

# Ereignisse {#events}

Lebenszyklusereignisse werden an wichtigen Punkten der Workflow- und
Aktivitätsausführung ausgelöst, um Ihre Anwendung über Fortschritt, Abschluss
oder Fehler zu informieren. Es sind normale Laravel-Ereignisse. Registrieren
Sie Listener im `EventServiceProvider` oder mit `Event::listen()`.

Alle V2-Lebenszyklusereignisse werden **nach dem Festschreiben des dauerhaften
Zustands** in der Datenbank ausgelöst. Listener sehen dadurch nur Ereignisse,
die durch festgeschriebene Fakten belegt sind. Wird eine Transaktion
zurückgerollt, wird kein Ereignis ausgelöst.

## Ereignisidentität {#event-identity}

Jedes V2-Ereignis enthält dauerhafte Identitätsfelder:

| Feld | Beschreibung |
|---|---|
| `instanceId` | Die Workflow-Instanz-ID, über Continue-as-new hinweg stabil. |
| `runId` | Die ID des konkreten Laufs. |
| `workflowType` | Der über `#[Type('...')]` registrierte dauerhafte Typschlüssel. |
| `workflowClass` | Der PHP-Klassenname des Workflows. |
| `committedAt` | ISO-8601-Zeitstempel des Festschreibens des dauerhaften Datensatzes, als reale Commit-Zeit. |

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

Das Feld `committedAt` aller Ereignisse bezeichnet die **Commit-Zeit**:
die reale Uhrzeit, zu der der dauerhafte Datensatz (Historienereignis oder
Fehlerdatensatz) in die Datenbank geschrieben wurde. Dies unterscheidet sich
von:

- **Virtueller Workflow-Zeit**: der logischen Zeit innerhalb der Workflow-Ausführung, die von Timern verwendet wird.
- **Versuchszeit**: dem Start- oder Abschlusszeitpunkt eines bestimmten Aktivitätsversuchs.
- **Fortsetzungslatenz**: der Zeit zwischen Fälligkeit eines Timers und tatsächlicher Fortsetzung des Workflows.

Für externe Integrationen ist die Commit-Zeit der nützlichste Zeitstempel,
weil sie angibt, wann der Zustand dauerhaft und beobachtbar wurde.

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

## Ereignis-Namespace {#event-namespace}

V2-Ereignisse liegen im Namespace `Workflow\V2\Events`. Bei einem Upgrade
einer bestehenden Anwendung finden Sie die Zuordnung der
V1-Kompatibilitätsereignisse unter [Migration](../migration.md).
