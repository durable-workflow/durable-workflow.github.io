---
sidebar_position: 19
title: Zeitlimits
description: Workflow- und Aktivitätszeitlimits konfigurieren sowie Fristen, Wiederholungen und Aufräumgrenzen verstehen.
---

# Zeitlimits {#timeouts}

Zeitlimits auf Workflow-Ebene begrenzen die zulässige Laufzeit. Es gibt zwei Geltungsbereiche:

- **Gesamtausführungszeitlimit**: begrenzt die verstrichene Gesamtzeit über alle Läufe einer Workflow-Instanz einschließlich Continue-as-new. Die Frist wird beim ersten Start einmal berechnet und unverändert weitergegeben.
- **Laufzeitlimit**: begrenzt einen einzelnen Lauf. Die Frist wird bei jedem neuen Lauf, auch nach Continue-as-new, neu berechnet.

Beide sind optional und können kombiniert werden.

## Konfiguration {#configuration}

Zeitlimits werden beim Workflow-Start über `StartOptions` konfiguriert:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

### Gesamtausführungszeitlimit {#execution-timeout}

Das Gesamtausführungszeitlimit umfasst die gesamte Workflow-Instanz. Bei Continue-as-new bleibt die Frist über alle Läufe der Kette unverändert.

```php
StartOptions::rejectDuplicate()->withExecutionTimeout(86400); // 24 hours
```

Der Zeitlimitwert wird im Modell `WorkflowInstance` gespeichert, die berechnete Frist auf jedem `WorkflowRun` festgehalten.

### Zeitlimit eines Laufs {#run-timeout}

Das Laufzeitlimit gilt für einen einzelnen Lauf. Nach Continue-as-new erhält der neue Lauf eine Frist aus aktueller Zeit plus konfiguriertem Laufzeitlimit.

```php
StartOptions::rejectDuplicate()->withRunTimeout(1800); // 30 minutes per run
```

### Validierung {#validation}

Zeitlimitwerte müssen mindestens eine Sekunde betragen. Null oder negative Werte lösen eine `LogicException` aus:

```php
// Throws LogicException: "Workflow v2 execution timeout must be at least 1 second."
StartOptions::rejectDuplicate()->withExecutionTimeout(0);
```

### Steuerungsebene {#control-plane}

Zeitlimits können auch beim Start über die Steuerungsebene gesetzt werden:

```php
$controlPlane->start('my-app.order-workflow', 'order-123', [
    'execution_timeout_seconds' => 7200,
    'run_timeout_seconds' => 3600,
]);
```

Die Antwort von `describe` enthält Zeitlimits und Fristen:

```php
$description = $controlPlane->describe('order-123');

$description['execution_timeout_seconds']; // 7200
$description['run']['run_timeout_seconds']; // 3600
$description['run']['execution_deadline_at']; // ISO 8601 timestamp
$description['run']['run_deadline_at'];       // ISO 8601 timestamp
```

### Waterline {#waterline}

Wenn Zeitlimits konfiguriert sind, zeigt die Laufdetailansicht in Waterline die Dauer und die berechneten Fristen.

### Historie {#history}

Der Payload des Historienereignisses `WorkflowStarted` enthält konfigurierte Zeitlimits und Fristen:

```json
{
    "execution_timeout_seconds": 7200,
    "run_timeout_seconds": 3600,
    "execution_deadline_at": "2026-04-12T14:00:00+00:00",
    "run_deadline_at": "2026-04-12T13:00:00+00:00"
}
```

### Continue-as-new {#continue-as-new}

Wenn ein Workflow Continue-as-new verwendet:

- Die **Gesamtausführungsfrist** wird unverändert vom vorherigen Lauf übernommen.
- Der Wert des **Laufzeitlimits** bleibt erhalten; die **Lauffrist** wird ausgehend von der aktuellen Zeit neu berechnet.

Das Gesamtausführungszeitlimit wird somit immer vom ursprünglichen Start an gemessen, während jeder neue Lauf ein eigenes neues Zeitfenster erhält.

## Durchsetzung {#enforcement}

Workflow-Zeitlimits werden an zwei Stellen durchgesetzt:

1. **Beim Start einer Workflow-Aufgabe**: Jede Aufgabe prüft `deadlineExpired()`, bevor sie Workflow-Code ausführt. Ist die Frist verstrichen, wird der Lauf sofort wegen Zeitüberschreitung geschlossen.
2. **Durch den TaskWatchdog**: Der Watchdog sucht nichtterminale Läufe mit verstrichener Gesamt- oder Lauffrist und ohne offene Workflow-Aufgabe. Er erstellt und stellt eine Aufgabe für die abgelaufene Frist zu. Bei deren nächster Ausführung wird das Zeitlimit durchgesetzt.

Wenn ein Zeitlimit abläuft, führt die Engine Folgendes aus:

- Bricht alle offenen Aufgaben für Aktivitäten, Timer und Workflows außer der aktuellen Aufgabe ab
- Bricht alle offenen Aktivitätsausführungen mit `ActivityCancelled`-Ereignissen ab
- Bricht alle wartenden Timer mit `TimerCancelled`-Ereignissen ab
- Speichert einen `WorkflowFailure` mit `failure_category = timeout` und einer `WorkflowTimeoutException`
- Speichert ein terminales `WorkflowTimedOut`-Ereignis mit `timeout_kind` gleich `execution_timeout` oder `run_timeout`
- Wendet die Elternabschlussregel auf offene Kind-Workflows an
- Benachrichtigt übergeordnete Workflows, falls dies ein Kindlauf war

Die Fehlerzeile speichert `Workflow\V2\Exceptions\WorkflowTimeoutException` als Ausnahmeklasse einschließlich `timeout_kind` und Fristzeitpunkt zur programmatischen Prüfung.

### Ergebnis und Aufräumen bei Zeitüberschreitung {#timeout-outcome-and-cleanup}

Eine Workflow-Frist schließt den Lauf mit Status `failed` und `closed_reason = timed_out`. Das terminale Historienereignis ist `WorkflowTimedOut`. Die Laufzeit speichert `WorkflowTimeoutException` als Fehlerdaten. Sie wirft diese Ausnahme **nicht** im Workflow-Code und setzt den Workflow nicht zum Aufräumen fort. `catch`- und `finally`-Blöcke sowie registrierte Saga-Kompensationen werden bei der Durchsetzung dieser Frist nicht ausgeführt.

Der Abbruch einer dauerhaften Aktivitätsausführung macht externe Nebenwirkungen nicht rückgängig und beweist nicht, dass ihr Callback beendet wurde. Verwenden Sie idempotente Vorgänge und anwendungseigene Abgleichverfahren für möglicherweise bereits übernommene Effekte.

Wenn nach einer Anwendungsfrist aufgeräumt werden muss, verwenden Sie einen früheren dauerhaften Timer oder eine zeitbegrenzte Warteoperation, die [Kompensation vor dem Abschluss](./sagas.md#deadline-driven-compensation) im Workflow-Code ermöglicht. Lassen Sie vor Lauf- und Gesamtausführungsfrist Zeit für Aktivitätswiederholungen, Worker-Zustellung und Aufräumen. Das Engine-Zeitlimit bleibt die letzte Grenze. Ein verspäteter Worker kann sie vor Abschluss der Kompensation erreichen.

Auch die unmittelbaren Befehle `cancel()` und `terminate()` schließen den Lauf ohne Aufräumfenster. Der gesonderte kooperative Vorgang `requestCancellation()` kann einem kompatiblen Worker begrenztes Aufräumen ermöglichen, solange der Lauf aktiv ist. Eine Workflow-Zeitüberschreitung wird nicht automatisch zu einer kooperativen Abbruchanfrage; ein Abbruchschutz verlängert weder Gesamt- noch Lauffrist. Siehe [Abbrechen und terminieren](./cancel-and-terminate.md) und [Kooperativer Abbruch](../polyglot/cancellation.md).

## Lease eines Workflow-Tasks {#workflow-task-lease}

Ein Workflow-Task ist ein Verarbeitungsschritt eines Workers, der gespeicherte Historie wiedergibt und dauerhafte Befehle erzeugt. Er ist nicht der gesamte Workflow. Das Warten auf einen dauerhaften Timer, eine über die Queue ausgeführte Aktivität oder ein Signal hält keinen Workflow-Task während der ganzen Wartezeit; ein späterer Task setzt den Lauf fort.

| Bereitstellung | Standard in Sekunden | Einstellung |
| --- | --- | --- |
| Eingebettetes Laravel | `300` | `DW_V2_WORKFLOW_TASK_LEASE_SECONDS` |
| Server | `60` | `DW_WORKFLOW_TASK_TIMEOUT` |

Die eingebettete Einstellung wird auf `workflows.v2.workflow_task_lease_seconds` abgebildet. Server überträgt beim Start seine eigene Einstellung auf diesen Paketschlüssel. Verwenden Sie auf Server deshalb die Server-Einstellung. Dies ist Laufzeitkonfiguration, keine `StartOptions`-Option und kein Aktivitäts-Timeout pro Start. Siehe [Konfiguration veröffentlichen](../configuration/publishing-config.md#workflow-task-lease-v2) und die [Server-Konfigurationsreferenz](../polyglot/server-config-reference.md#worker-protocol-and-query-transport).

### Heartbeats und Ausführung {#workflow-task-heartbeats}

Worker im Service-Modus erneuern einen laufenden Workflow-Task-Anspruch mit Task-Heartbeats. Server prüft Task, Versuch und Lease-Eigentümer. Eine bestätigte Erneuerung verwendet die wirksame Lease-Dauer, begrenzt durch gegebenenfalls geltende Abbruch-Cleanup-Fristen. Sie ändert weder die ursprünglichen Lauf- und Ausführungsfristen noch Aktivitäts-Timeouts. Ein Worker-Registrierungs-Heartbeat meldet nur die Erreichbarkeit der Flotte; ein Aktivitäts-Heartbeat meldet den Fortschritt einer Aktivität. Keiner ersetzt die Erneuerung eines Workflow-Tasks.

Synchroner eingebetteter Workflow-Code kann während einer Blockierung nicht regelmäßig erneuern. Halten Sie Workflow-Code deterministisch und kurz. Lange E/A- oder CPU-Arbeit gehört in Aktivitäten. Die Lease ist keine harte Prozess- oder CPU-Ausführungsgrenze.

### Ablauf einer Lease {#workflow-task-lease-expiry}

Ein abgelaufener, unerledigter Anspruch kann wiederhergestellt werden. Matching/Watchdog oder Reparatur löscht den abgelaufenen Anspruch und stellt die Arbeit erneut zu, damit ein kompatibler Worker die gespeicherte Historie wiedergeben kann. Dafür müssen Wiederherstellungsprozesse laufen sowie Datenbank und geeignete Worker verfügbar sein. Der Ablauf beendet den alten Prozess nicht und garantiert keine sofortige erneute Zustellung. Auf Server darf ein abgelaufener oder ersetzter Anspruch keine neuen Befehle einreichen. Eine abgelehnte Erneuerung bedeutet den Verlust der Ausführungsbefugnis.

Reparatur öffnet keinen geschlossenen Lauf erneut, gewährt keine zusätzlichen fachlichen Wiederholungen und setzt ursprüngliche Fristen nicht zurück. `startToCloseTimeout` einer Aktivität begrenzt dagegen einen Aktivitätsversuch gemäß dessen gespeicherter Wiederholungsrichtlinie. Lauf- und Ausführungs-Timeouts begrenzen die Lebensdauer des Workflows. Erneuerung oder Replay eines Workflow-Tasks verlängert sie nicht.

## Aktivitätszeitlimits {#activity-timeouts}

Aktivitätszeitlimits begrenzen die zulässige Dauer einzelner Aktivitätsausführungen. Es gibt vier Geltungsbereiche:

- **Schedule-to-start**: begrenzt die Zeit zwischen Planung und erster Beanspruchung durch einen Worker. Gilt im Status `Pending`.
- **Start-to-close**: begrenzt die Zeit zwischen Beanspruchung und erforderlichem Abschluss. Beginnt bei jedem Wiederholungsversuch neu.
- **Schedule-to-close**: begrenzt die gesamte Zeit von Planung bis Abschluss über alle Versuche. Der Ablauf ist immer terminal, da ein weiterer Versuch die verstrichene Gesamtfrist nicht aufheben kann.
- **Heartbeat**: begrenzt den Abstand zwischen Heartbeats. Bei langen Aktivitäten mit `$this->heartbeat()` muss innerhalb des konfigurierten Intervalls ein Heartbeat erfolgen, sonst gilt die Aktivität als nicht reagierend.

Alle sind optional und kombinierbar. Konfigurieren Sie sie beim Aktivitätsaufruf über `ActivityOptions`:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    LongRunningActivity::class,
    new ActivityOptions(
        scheduleToStartTimeout: 30,     // must be claimed within 30s
        startToCloseTimeout: 300,       // each attempt has 5 minutes
        scheduleToCloseTimeout: 600,    // total 10 minutes across all retries
        heartbeatTimeout: 15,           // must heartbeat every 15 seconds
        maxAttempts: 3,
    ),
    $input,
);
```

### Zeitlimit von Planung bis Start {#schedule-to-start-timeout}

Die Frist wird bei der Planung der Aktivität berechnet. Beansprucht kein Worker sie rechtzeitig, setzt `TaskWatchdog` das Zeitlimit durch. Sind weitere Versuche möglich, wird eine neue Aufgabe mit der gespeicherten Wartezeit geplant und die Schedule-to-start-Frist relativ zur Verfügbarkeit dieses Versuchs neu berechnet. Jeder Versuch erhält ein neues Fenster. Ohne konfiguriertes `scheduleToStartTimeout` wird die Frist beim Wiederholungsversuch gelöscht. Nach Ausschöpfen aller Versuche wird ein terminales `ActivityTimedOut`-Ereignis gespeichert und der Workflow geweckt.

### Zeitlimit von Start bis Abschluss {#start-to-close-timeout}

Die Frist wird berechnet, wenn ein Worker die Aktivitätsaufgabe beansprucht. Jeder Versuch erhält eine neue Start-to-close-Frist. Schließt die Aktivität nicht rechtzeitig ab, wird der aktuelle Versuch beendet. Sind weitere Versuche möglich, kehrt die Ausführung mit erneuerter Schedule-to-start-Frist, sofern konfiguriert, zu `Pending` zurück, damit die Wiederholung nicht sofort erneut abläuft. Sind alle Versuche erschöpft, wird eine terminale Zeitüberschreitung gespeichert.

### Zeitlimit von Planung bis Abschluss {#schedule-to-close-timeout}

Die Frist wird bei der Planung einmal berechnet und nie zurückgesetzt. Bei ihrem Ablauf schlägt die Aktivität sofort terminal fehl, auch wenn weitere Versuche übrig sind, da die erlaubte Gesamtzeit verstrichen ist. Dies begrenzt die Gesamtkosten einer instabilen Aktivität, die andernfalls innerhalb ihrer Versuchslimits unbegrenzt wiederholen könnte.

### Heartbeat-Zeitlimit {#heartbeat-timeout}

Die erste Frist wird bei Beanspruchung der Aktivitätsaufgabe berechnet. Jeder erfolgreiche Aufruf von `$this->heartbeat()` verlängert sie um das konfigurierte Intervall. Ohne `heartbeat()` vor Fristablauf nimmt die Engine an, dass der Worker nicht reagiert. Sind weitere Versuche möglich, wird ein neuer Versuch mit erneuerter Schedule-to-start-Frist, sofern konfiguriert, geplant; andernfalls wird eine terminale Zeitüberschreitung gespeichert.

```php
use Workflow\V2\Activity;

class LongRunningActivity extends Activity
{
    public function handle($input)
    {
        foreach ($items as $item) {
            $this->heartbeat(['processed' => $count]);
            // ... process item ...
        }
    }
}
```

### Durchsetzung {#enforcement-1}

Der `TaskWatchdog` setzt Aktivitätszeitlimits bei jedem Worker-Schleifendurchlauf durch. Er sucht Ausführungen mit verstrichenen Fristspalten und delegiert an `ActivityTimeoutEnforcer`. Jede Durchsetzung speichert:

- Ein terminales `ActivityTimedOut`-Historienereignis mit `timeout_kind` gleich `schedule_to_start`, `start_to_close`, `schedule_to_close` oder `heartbeat`
- Eine `WorkflowFailure`-Zeile mit `failure_category = timeout` und `propagation_kind = timeout`
- Eine Workflow-Fortsetzungsaufgabe, die den übergeordneten Workflow zur Beobachtung des Fehlers weckt

Waterline zeigt in der Aktivitätsdetailansicht die Wiederholungsregel einschließlich aller konfigurierten Zeitlimits. Die Zeitleiste nennt die Zeitlimitart in der Nachricht zum Ablaufereignis.

### Noch nicht abgedeckt {#what-is-not-yet-covered}

Folgendes ist geplant, aber noch nicht implementiert:

- Wiederholungsregeln auf Workflow-Ebene

### Strukturelle Grenzen {#structural-limits}

Die Engine setzt typisierte Fehler für strukturelle Grenzen von Payload-Größe, wartender Auffächerung und Metadatengröße durch. Siehe [Strukturelle Grenzen](../constraints/structural-limits.md) für den vollständigen Vertrag, die Konfiguration und die Fehlerklassen.
