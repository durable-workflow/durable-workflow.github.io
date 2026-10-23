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

`Workflow\V2\Activity` verwendet standardmäßig `$tries = 1`: einen Versuch, ohne automatische Wiederholung nach einer Exception. Der erste Aktivitätsfehler wird an den Workflow zurückgegeben. Der Workflow-Code kann ihn wie unten abfangen; bleibt die Exception unbehandelt, schlägt der Lauf fehl und wird terminal.

Wiederholungen müssen ausdrücklich konfiguriert werden. Setzen Sie `$tries` für weitere Versuche auf einen Wert über `1` oder für unbegrenzt viele Versuche auf `0`, und wählen Sie eine `backoff()`-Richtlinie. Ein wiederholbarer Fehler wird erst nach Ausschöpfung des konfigurierten Versuchs- oder Zeitbudgets an den Workflow-Code weitergegeben. Ein nicht wiederholbarer Fehler überspringt die verbleibenden Versuche.

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

Prüfen Sie zuerst den dauerhaften Status des ausgewählten Laufs und die Wiederholungsrichtlinie der Aktivität. Mit dem standardmäßigen Einzelversuch hat ein unbehandelter Aktivitätsfehler den Lauf bereits terminal gemacht. Eine Fehlerkorrektur bereitzustellen oder `repair()` aufzurufen öffnet diesen fehlgeschlagenen Lauf nicht erneut.

Eine Korrektur während des Wartens ist nur möglich, solange die Aktivität noch einen zulässigen Wiederholungsversuch hat. Konfigurieren Sie `$tries` vor dem Einplanen der Aktivität auf einen Wert über `1` oder für unbegrenzt viele Versuche auf `0`, zusammen mit `backoff()`. Optional begrenzt `ActivityOptions::$scheduleToCloseTimeout` die Gesamtdauer über alle Aktivitätsversuche; Workflow-Fristen gelten weiterhin. Siehe [Wiederholungen](./configuration/options.md#retries), [Wartezeiten](./configuration/options.md#backoff) und [ActivityOptions](./configuration/options.md#activityoptions). Die Richtlinie wird beim Einplanen gespeichert. Eine spätere Bereitstellung erweitert weder das Versuchs- noch das Zeitbudget einer bestehenden Aktivität.

Für einen Lauf, der noch auf eine wiederholbare Aktivität wartet:

1. Prüfen Sie die Aktivitätsprotokolle auf Fehler und Exceptions.
2. Ermitteln und beheben Sie die Ursache im Code.
3. Stellen Sie die Korrektur dort bereit, wo die Queue-Worker laufen.
4. Starten oder ersetzen Sie die betroffenen Worker, damit sie den neuen Code laden und Arbeit sicher übernehmen können.
5. Lassen Sie einen gesunden Worker den nächsten zulässigen Versuch ausführen. Reparatur und erneute Zustellung können verlorenen Aufgabentransport wiederherstellen; sie gewähren nach Abschluss der Aktivität oder des Laufs keinen weiteren fachlichen Wiederholungsversuch.
6. Prüfen Sie das dauerhafte Ergebnis in Waterline, im Historienexport oder über die Server-API. Eine einzelne Worker-Protokollzeile ist nicht maßgeblich.
7. Schlägt die Aktivität weiterhin fehl, prüfen Sie die verbleibenden Versuchs- und Zeitbudgets, bevor Sie das Verfahren wiederholen.

Ein Lauf mit einem zulässigen Aktivitätsversuch bleibt wartend und kann nach erfolgreicher Ausführung des korrigierten Codes fortfahren, sofern seine ursprünglichen Budgets nicht abgelaufen sind. Das garantiert keine Korrektur jedes Workflows im bestehenden Lauf: Ein unbehandelter letzter Aktivitätsfehler, ein Fehler im Workflow-Code, eine strukturelle Grenze oder ein Workflow-Timeout können ihn terminal machen.

Bewahren Sie bei einem terminal fehlgeschlagenen Lauf die Historie auf und gleichen Sie externe Seiteneffekte ab, bevor die Anwendung über einen neuen Workflow entscheidet. Sichern Sie wiederholte fachliche Operationen durch anwendungsseitige Idempotenz ab. Es gibt weder automatische Workflow-Wiederholungen noch eine Wiederöffnung terminaler Läufe; siehe [Wiederholungen auf Workflow-Ebene](#workflow-level-retry).

## Ablehnung am Einstieg im Servicemodus und Wiederherstellung {#service-entry-recovery}

**Veröffentlichte Unterstützung.** Server 2.9.9 sowie PHP SDK 2.5.4, Python SDK 2.6.2 und Rust SDK 3.5.6 haben den Einstiegsschutz und das nachfolgend beschriebene Routing-/Wiederherstellungsverhalten eingeführt. Dies sind die Mindestversionen für diese Funktionen. Installieren Sie aktuelle stabile Versionen, um Sicherheitskorrekturen zu erhalten.

Eine Unvereinbarkeit am Einstieg ist eine Bereitstellungs- oder Replay-Ablehnung, bevor Anwendungscode des Workflows ausgeführt wird. Sie ist weder eine Aktivitätswiederholung noch ein terminaler fachlicher Fehler. Der Worker meldet `failure_reason = workflow_entry_arguments_mismatch`, und der Server behält die fehlgeschlagene Workflow-Aufgabe mit `replay_blocked = true`, statt automatisch einen weiteren Versuch anzulegen. Der allgemeine `replay_blocked_reason` lautet `worker_reported_replay_failure`. Der Lauf bleibt nichtterminal; aufgezeichnete Eingabe, Historie und Fristen bleiben erhalten. Das unterscheidet sich von einer Ausnahme im erfolgreich betretenen Workflow-Rumpf, die den Lauf weiterhin fehlschlagen lassen kann.

Stellen Sie den Lauf erst nach Prüfung des tatsächlichen dauerhaften Zustands wieder her:

1. Prüfen Sie den ausgewählten Lauf mit `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Bestätigen Sie, dass `latest_workflow_task_failure.reason` den Wert `workflow_entry_arguments_mismatch` hat und der ursprüngliche Lauf noch offen ist. Dieses Verfahren öffnet keinen terminalen Lauf erneut.
2. Stellen Sie Code bereit, der die aufgezeichneten positionellen Argumente oder die typisierte Eingabe akzeptiert. Bewahren Sie ursprüngliche Workflow-/Lauf-ID, Namespace, Warteschlange, Build-Kompatibilität, Historie und Fristen. Bearbeiten Sie niemals gespeicherte Eingaben und ersetzen Sie diese nicht durch DTO-Standardwerte.
3. Prüfen Sie über das [Routing nach Definition](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution), dass ein geeigneter Worker verfügbar ist. Eine Reparatur erzeugt keinen Worker und beweist keine Replay-Kompatibilität.
4. Verwenden Sie `POST /api/workflows/{workflowId}/runs/{runId}/repair` mit den üblichen autorisierten Operator-Zugangsdaten und dem Namespace. Die Route für den ausgewählten Lauf lehnt ein historisches Ziel ab, statt stillschweigend einen neueren Lauf zu reparieren. PHP bietet außerdem `Client::repairWorkflow($workflowId, $runId)`; Pythons `repair_workflow(workflow_id)` zielt auf die aktuelle Instanz, und Rust hat keine entsprechende komfortable Reparaturmethode.
5. Prüfen Sie, dass derselbe ursprüngliche Lauf mit seiner aufgezeichneten Eingabe und seinem Historienpräfix fortgesetzt wird und sein erwartetes Ergebnis einmal aufzeichnet. Eine bereits abgelaufene ursprüngliche Frist gilt weiterhin. Bleibt der Ersatz inkompatibel, untersuchen Sie die neue Ablehnung, statt die Reparatur wiederholt auszulösen.

Ältere Serverversionen können den spezifischen SDK-Grund speichern, ohne ihn als Replay-Blockade einzustufen. Die Fehlermeldung allein belegt daher noch nicht den Vertrag ohne automatische Wiederholung. Verwenden Sie die qualifizierte Kombination aus Laufzeit und SDK. [Versionierung](./features/versioning.md#service-sdk-entry-safeguard) erläutert die Sprachgrenzen; [Workflow-Befehle](./polyglot/server-api-reference.md#workflow-commands) beschreibt die authentifizierten Routen für ausgewählte Läufe.

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

Für ein gemeinsames Versuchslimit über Workflows und Queues kombinieren Sie festgelegte Wiederholungen mit [Server-Admission und Anwendungs-Breaker](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Erstversuche und Wiederholungen zählen; lokale/eingebettete Ausführung hat andere Grenzen.

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

Begrenzen Sie im Workflow-Code die Gesamtdauer der Aktivität einschließlich der Wartezeiten in der Queue und zwischen den Versuchen:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

Diese Einstellungen erlauben zusammen höchstens drei Versuche mit Pausen von 5 und 30 Sekunden innerhalb der ursprünglichen Schedule-to-close-Frist von 120 Sekunden. Eine frühere Workflow-Frist gilt weiterhin. Aktivieren Sie Wiederholungen nur für Vorgänge, die sicher wiederholt werden können, und schützen Sie externe Nebenwirkungen durch Idempotenzprüfungen.

Wirft eine wiederholbare Aktivität eine Exception, bevor `$tries` ausgeschöpft ist, schließt die Engine den aktuellen `activity_attempts`-Eintrag. Sie setzt `activity_executions` auf `pending`, speichert ein typisiertes `ActivityRetryScheduled`-Ereignis und erzeugt eine neue dauerhafte Aufgabe. Deren `available_at` folgt der `backoff()`-Richtlinie. Der Workflow wartet weiter auf dieselbe logische Aktivitätsausführung. Er erhält die Exception erst, wenn auch der letzte wiederholbare Versuch fehlschlägt.

Der Payload der Wiederholungsaufgabe enthält `retry_of_task_id`, `retry_after_attempt_id`, `retry_after_attempt` und `retry_backoff_seconds`. Damit kann Waterline erklären, warum die Aufgabe geplant wurde. Die Laufdetails rekonstruieren den fehlgeschlagenen Versuch in `activities[*].attempts` zuerst aus der typisierten Historie und zeigen `ActivityRetryScheduled` in der Zeitleiste. Wiederholungszahlen erscheinen unter `operator_metrics.activities.retrying`, `operator_metrics.activities.failed_attempts` und `operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` beendet die Wiederholungsrichtlinie sofort. Eine solche Exception lässt die Aktivitätsausführung unmittelbar fehlschlagen und setzt den Workflow mit der Exception fort.

### Auflösung der Wiederholungsverzögerung {#retry-delay-resolution}

Die Werte von `backoff()` einer Aktivität sind ganze Sekunden. Dauerhafte
Wiederholungsintervalle haben eine Auflösung von einer Sekunde. Verwenden Sie keinen
Bruchteil wie `0.1`, um eine Wiederholung nach 100 ms anzufordern. SDK-APIs, die
Intervalle aus Sekundenbruchteilen erzeugen, runden auf die nächste volle Sekunde
auf. Die Python- und Rust-SDK-Referenzen beschreiben die zulässigen Parametertypen
und Umrechnungen.

Nach Ablauf der Verzögerung darf der nächste Versuch starten. Queue-Latenz und
Worker-Auslastung können ihn weiter verzögern. Für schnelle Tests eignen sich
[kontrollierte Zeit oder begrenzte Testfälle ohne Verzögerung](./testing.md#keeping-delay-tests-fast).

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

## Limits für Python-Fehlerberichte im Service-Modus {#python-failure-report-limits}

Das Python SDK **ab 2.11.0** begrenzt ausgehende Fehlerberichte im Service-Modus auf 62 KiB UTF-8 für Meldungen, 128 KiB für Stacks, 64 KiB für optionale Metadaten zusammen und 1 MiB für den vollständigen codierten Body einschließlich Markierungen. Niedrigere bekannte Transportlimits gelten weiterhin. Der [Python-Leitfaden für Fehlerberichte](./polyglot/python.md#bounded-failure-reports) erläutert Konfiguration, Auslassungsdiagnosen, unveränderte Retry-Semantik und identische Beobachtungen bei erster Ausführung und kaltem Replay. Diese Grenzen gelten für SDK-Berichte. Eingebettete Fehleraufzeichnung und Core-Summary-Speicherung haben eigene Verträge.

## Grenzen für Rust-Fehlerberichte im Service-Modus {#rust-failure-report-limits}

Bei Service-Workern mit tatsächlich laufendem Rust SDK **4.10.1 oder neuer** hat die ausgehende UTF-8-Nachricht höchstens 62 KiB einschließlich Markierung, ein unterstützter Stack 128 KiB, gemeinsam serialisierte optionale Metadaten 64 KiB und der vollständige kodierte Body 1 MiB oder eine bekannte niedrigere Transportgrenze. Typ, Retry-Entscheidung und Identität bleiben erhalten; unmögliche Pflichthüllen werden ausdrücklich abgelehnt. Der [Rust-Leitfaden](./polyglot/rust.md#bounded-failure-reports) erklärt Markierungen, vollständige Avro-Details und lokale Ergebnisse. Ältere SDKs, Embedded-Modus und die separate Core-Speicherkorrektur sind damit nicht qualifiziert.

## Weitere Leitfäden {#related-guides}

- [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md) erklärt Replay, Wiederholungsversuche, Lease-Ablauf und erneute Zustellung.
- [Monitoring](./monitoring.md) zeigt die Fehlerdaten in Waterline, Historienexporten, Worker-Protokollen und Laufzeittelemetrie.
