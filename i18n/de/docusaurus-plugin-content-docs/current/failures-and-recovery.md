---
sidebar_position: 11
title: Fehler und Wiederherstellung
description: Diagnostizieren Sie Aktivitätsfehler, nicht wiederholbare Exceptions, Laufzeitlimits, Bereinigung beim Abbruch und sichere Wiederherstellungsmaßnahmen.
tags:
  - failures
  - recovery
  - operations
keywords:
  - Workflow-Fehler
  - nicht wiederholbare Exception
  - Workflow-Wiederherstellung
---

# Fehler und Wiederherstellung {#failures-and-recovery}

Beachten Sie bei der Fehlerdiagnose den grundlegenden Ausführungsvertrag:

- Workflow-Aufgaben werden durch Replay der festgeschriebenen Historie wiederhergestellt.
- Aktivitäten werden mindestens einmal ausgeführt und können mehrfach auftreten.
- Abgelaufene Leases und erneute Zustellung sind normale Wiederherstellungspfade. Sie beweisen nicht, dass der vorige Worker die Nebenwirkung nie ausgeführt hat.

Die [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md) erklären die genaue Bedeutung von Wiederholungsversuchen, erneuter Zustellung und dauerhaften Ergebnissen.

## Exceptions behandeln {#handling-exceptions}

Wirft eine Aktivität eine Exception, erhält der Workflow sie erst, wenn alle `$tries` ausgeschöpft sind. Bis dahin wiederholt das System die Aktivität gemäß ihrer Wiederholungsrichtlinie. Für eine sofortige Weitergabe der Exception setzen Sie `$tries` auf 1.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Nicht wiederholbare Exceptions {#non-retryable-exceptions}

Manche Fehler sollen keinen weiteren Versuch auslösen. Wirft eine Aktivität eine nicht wiederholbare Exception, wird sie sofort als fehlgeschlagen markiert. Weitere Versuche entfallen.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Wiederherstellungsverfahren {#recovery-process}

So beheben Sie eine fehlschlagende Aktivität:

1. Prüfen Sie die Aktivitätsprotokolle auf Fehler und Exceptions.
2. Ermitteln und beheben Sie die Ursache im Code.
3. Stellen Sie die Korrektur dort bereit, wo die Queue ausgeführt wird.
4. Starten oder ersetzen Sie die betroffenen Worker, damit sie den neuen Code laden und Arbeit sicher übernehmen können.
5. Warten Sie auf den nächsten Aktivitätsversuch oder darauf, dass Reparatur beziehungsweise erneute Zustellung die dauerhafte Aufgabe einem gesunden Worker übergibt.
6. Prüfen Sie das dauerhafte Ergebnis in Waterline, im Historienexport oder über die Server-API. Eine einzelne Worker-Protokollzeile ist nicht maßgeblich.
7. Schlägt die Aktivität weiterhin fehl, wiederholen Sie die Diagnose.

Während der Aktivitätsversuche kann der Workflow im laufenden Zustand bleiben. Nach der Fehlerbehebung kann er erfolgreich abschließen. Sind alle Aktivitätsversuche ausgeschöpft und bleibt die Exception unbehandelt, schlägt der Workflow fehl.

## Workflow-Zeitlimits durchsetzen {#workflow-timeout-enforcement}

Mit `StartOptions::withExecutionTimeout()` oder `StartOptions::withRunTimeout()` speichert die Engine eine Frist im Workflow-Lauf. Die Ausführungsfrist gilt für den gesamten logischen Workflow einschließlich Continue-as-new-Läufen. Die Lauffrist beginnt mit jedem neuen Lauf erneut.

Ist die Frist beim Start einer Workflow-Aufgabe abgelaufen, wird der Lauf sofort geschlossen:

- Offene Aktivitätsausführungen, Timer und Aufgaben werden mit typisierten Ereignissen wie `ActivityCancelled` und `TimerCancelled` abgebrochen.
- Ein `WorkflowFailure`-Eintrag erhält `failure_category = timeout` und `propagation_kind = timeout`.
- Ein `WorkflowTimedOut`-Ereignis erhält `timeout_kind = execution_timeout` oder `run_timeout`.
- Der Laufstatus wird `failed` mit `closed_reason = timed_out`.
- Übergeordnete Workflows, die auf den untergeordneten Lauf warten, werden benachrichtigt.

Der Aufgaben-Watchdog sucht außerdem nach noch offenen Läufen mit abgelaufener Frist und ohne offene Workflow-Aufgabe. Das betrifft etwa Läufe, die beim Fristablauf auf eine Aktivität oder einen Timer warten. Er erzeugt eine Workflow-Aufgabe, damit der Executor das Zeitlimit beim nächsten Durchlauf erkennt und durchsetzt.

Waterline zeigt `failure_category` in einer eigenen Kategoriespalte der Exception-Tabelle und in den Fehlerdetails der Zeitleiste. Historienexporte enthalten das Feld im Array `failures[*]`. Die finale v2-Version speichert die Klassifizierung beim Auftreten des Fehlers. Nicht klassifizierbare importierte v1-Einträge bleiben als unklassifizierte Diagnosen sichtbar.

## Aktivitäts-Wiederholungsversuche {#activity-retries}

`Workflow\V2\Activity` verwendet standardmäßig `$tries = 1`. Ein Fehler wird deshalb sofort an den Workflow weitergegeben, sofern die Aktivität keine weiteren Versuche konfiguriert.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Wirft eine wiederholbare Aktivität eine Exception, bevor `$tries` ausgeschöpft ist, schließt die Engine den aktuellen `activity_attempts`-Eintrag. Sie setzt `activity_executions` auf `pending`, speichert ein typisiertes `ActivityRetryScheduled`-Ereignis und erzeugt eine neue dauerhafte Aufgabe. Deren `available_at` folgt der `backoff()`-Richtlinie. Der Workflow wartet weiter auf dieselbe logische Aktivitätsausführung. Er erhält die Exception erst, wenn auch der letzte wiederholbare Versuch fehlschlägt.

Der Payload der Wiederholungsaufgabe enthält `retry_of_task_id`, `retry_after_attempt_id`, `retry_after_attempt` und `retry_backoff_seconds`. Damit kann Waterline erklären, warum die Aufgabe geplant wurde. Die Laufdetails rekonstruieren den fehlgeschlagenen Versuch in `activities[*].attempts` zuerst aus der typisierten Historie und zeigen `ActivityRetryScheduled` in der Zeitleiste. Wiederholungszahlen erscheinen unter `operator_metrics.activities.retrying`, `operator_metrics.activities.failed_attempts` und `operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` beendet die Wiederholungsrichtlinie sofort. Eine solche Exception lässt die Aktivitätsausführung unmittelbar fehlschlagen und setzt den Workflow mit der Exception fort.

### Aktivitätskennung und Idempotenz {#activity-execution-identity-and-idempotency}

Wiederholungsversuche sind nicht die einzige Ursache mehrfacher Aktivitätsausführung. Abgelaufene Leases, Worker-Verlust, verspätete Berichte und erneute Zustellung können einen weiteren Versuch oder einen veralteten Abschlussbericht erzeugen.

- `activity_execution_id` kennzeichnet die logische Aktivität über Versuche und Zustellungen hinweg. Nutzen Sie sie als Standard-Idempotenzschlüssel für externe Nebenwirkungen.
- `activity_attempt_id` kennzeichnet einen einzelnen Versuch. Nutzen Sie sie nur, wenn das Zielsystem einzelne Versuche unterscheiden muss.
- Ein verspäteter Abschluss- oder Fehlerbericht eines abgelösten Versuchs ist normales Verhalten veralteter Versuche. Er beweist keinen doppelt festgeschriebenen Versuch.

Bei einem verspäteten Abschluss nach Lease-Ablauf:

- Prüfen Sie in Waterline, im Historienexport oder in der Server-API, welcher Versuch das dauerhafte Ergebnis festgeschrieben hat.
- Nehmen Sie bei einem abgelehnten Bericht nicht an, dass die externe Nebenwirkung ausgeblieben ist.
- Prüfen Sie das externe System anhand seines Idempotenzschlüssels, bevor Sie eine manuelle Wiederholung oder Reparatur erzwingen.

Die sichere Voreinstellung ist eine unter `activity_execution_id` idempotente externe Operation. Das dauerhafte Ergebnis zeigt dann, ob die Engine den Bericht dieses Versuchs angenommen hat.

### Kennzeichnung nicht wiederholbarer Fehler {#non-retryable-failure-markers}

Wirft eine Aktivität oder ein Workflow eine Exception mit `Workflow\Exceptions\NonRetryableExceptionContract`, speichert die Engine `non_retryable = true` im `WorkflowFailure`-Eintrag und im Payload des typisierten Ereignisses (`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`). Dieses dauerhafte Merkmal kennzeichnet einen permanenten Fehler, für den dieselbe Operation nicht wiederholt werden soll.

Das Merkmal wird durch die gesamte Sichtbarkeitsschicht weitergegeben:

- **Fehlereinträge:** boolesche Spalte `workflow_failures.non_retryable`.
- **Historienereignisse:** Feld `non_retryable` im typisierten Payload.
- **Fehler-Snapshots:** `non_retryable` in `FailureSnapshots::forRun()`.
- **Laufdetails:** `non_retryable` im Exception-Array.
- **Zeitleiste:** `non_retryable` in den Fehlerdetails.
- **Historienexport:** `non_retryable` im Array `failures[*]`.
- **Waterline:** eine Kennzeichnung „non-retryable“ neben der Fehlerkategorie in Exception-Tabelle und Zeitleiste.
- **Externe Worker-Brücke:** der `complete()`-Payload akzeptiert `non_retryable`. Externe Worker können permanente Fehler melden, ohne dass der Host-Prozess die Exception-Klasse auflösen muss.

Ohne diesen Vertrag ist `non_retryable` standardmäßig `false`. Die finale v2-Version speichert das Merkmal beim Auftreten des Fehlers. Deklarieren Sie den Vertrag vorher, wenn Betreiber oder SDKs permanente und wiederholbare Fehler unterscheiden müssen.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Wiederholung auf Workflow-Ebene {#workflow-level-retry}

Durable Workflow v2 unterstützt keine automatische Wiederholung eines fehlgeschlagenen Workflow-Laufs. Unbehandelte Exceptions, strukturelle Grenzen und Zeitlimits können einen Lauf endgültig beenden. Die Engine startet dann nicht automatisch einen neuen Lauf derselben Instanz.

Diese Entscheidung folgt dem Ausführungsmodell:

- **Aktivitäten besitzen Wiederholungsrichtlinien.** `$tries`, `backoff()` und nicht wiederholbare Exceptions behandeln vorübergehende Fehler auf der passenden Ebene.
- **Workflow-Replay stellt Arbeit wieder her.** Bei vorübergehenden Infrastrukturfehlern wie Datenbankfehlern oder Worker-Abstürzen wird die dauerhafte Aufgabe erneut zugestellt. Replay setzt anhand der festgeschriebenen Historie fort, ohne einen neuen Lauf zu starten.
- **Continue-as-new unterstützt lang laufende Workflows.** `continueAsNew()` beginnt explizit mit frischem Zustand oder einer frischen Historie.
- **Reparatur stellt festhängende Arbeit wieder her.** `repair()` und automatische Worker-Loop-Reparatur beheben verlorenen Transport dauerhafter Aufgaben.

Benötigt Ihre Anwendung Wiederholungen auf Workflow-Ebene, modellieren Sie sie explizit:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Weitere Leitfäden {#related-guides}

- [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md) erklärt Replay, Wiederholungsversuche, Lease-Ablauf und erneute Zustellung.
- [Monitoring](./monitoring.md) zeigt die Fehlerdaten in Waterline, Historienexporten, Worker-Protokollen und Laufzeittelemetrie.
