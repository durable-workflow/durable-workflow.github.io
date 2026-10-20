---
sidebar_position: 23
title: Lokale Aktivitäten
description: Führen Sie kurze Aktivitätsarbeit im aktuellen Workflow-Worker-Prozess aus und erhalten Sie dauerhafte Aktivitätshistorie, Wiederholungen, Timeouts und Sichtbarkeit.
tags:
  - activities
  - workers
  - execution
keywords:
  - lokale Aktivitäten
  - localActivity
  - executeLocalActivity
  - Aktivität im selben Prozess
  - Workflow-Aufgaben-Heartbeat
---

# Lokale Aktivitäten {#local-activities}

Lokale Aktivitäten sind das v2-Primitiv für kurze Aktivitätsarbeit im
Workflow-Worker-Prozess, der gerade die Workflow-Aufgabe ausführt. Sie erhalten
die Semantik für Aktivitätswiederholungen, Timeouts, Heartbeats, Abbruch,
Historie und Betreibersichtbarkeit, umgehen aber die gewöhnliche Einreihung von
Aktivitätsaufgaben in Queues.

Verwenden Sie lokale Aktivitäten für latenzarme, idempotente Arbeit, die sich
für den Workflow-Worker selbst eignet. Verwenden Sie gewöhnliche
Queue-Aktivitäten für unabhängige Worker-Skalierung, Queue-Routing, lange
Ausführung oder eine separate Aktivitätsaufgaben-Lease.

## Vertragsübersicht {#contract-summary}

- `localActivity(...)` und `Workflow::localActivity(...)` führen die Aktivitätsklasse im selben Prozess wie die aktuelle Workflow-Aufgabe aus.
- Die Laufzeit erstellt eine `activity_executions`-Zeile und normale Aktivitätshistorienereignisse mit `execution_mode=local` und `local_activity=true`.
- Es wird keine gewöhnliche Aufgabe vom Typ `TaskType::Activity` erstellt. Deshalb werden die Routing-Optionen `connection`, `queue`, Worker-Sitzung und Schedule-to-start abgelehnt.
- Der lokale Versuch besitzt die Workflow-Aufgaben-Lease. Aktivitäts-`heartbeat()` verlängert diese Lease und zeichnet `ActivityHeartbeatRecorded` auf.
- Wiederholungen sind dauerhafte Workflow-Aufgaben mit Wartezeit, keine versteckten Schleifenwiederholungen.
- Kaltes Replay liest festgeschriebene Aktivitätshistorie. Hat ein gestarteter lokaler Versuch nach Worker-Verlust kein Abschlussereignis, zeichnet der nächste Versuch `retry_reason=cold_replay` auf.
- Laufdetails, Historienexport, Zeitleisten und Betriebsmetriken zeigen lokale Versuche getrennt von gewöhnlichen Queue-Versuchen.

## Autoren-API {#authoring-api}

Verwenden Sie den Helfer im Namespace:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(
        maxAttempts: 3,
        startToCloseTimeout: 10,
        scheduleToCloseTimeout: 30,
        heartbeatTimeout: 5,
    ),
    $orderId,
);
```

Oder die statische Workflow-Fassade:

```php
use Workflow\V2\Workflow;

$receipt = Workflow::localActivity(SendReceiptActivity::class, $orderId);
$receipt = Workflow::executeLocalActivity(SendReceiptActivity::class, $orderId);
```

`LocalActivityOptions` akzeptiert Wiederholungs- und Timeout-Felder:

- `maxAttempts`
- `backoff`
- `startToCloseTimeout`
- `scheduleToCloseTimeout`
- `heartbeatTimeout`
- `nonRetryableErrorTypes`

Es lehnt `connection`, `queue`, Worker-Sitzungs-Routing und
`scheduleToStartTimeout` ab, da lokale Aktivitäten nicht an der normalen
Aufgabenzuordnung teilnehmen.

## Ausführung und Historie {#execution-and-history}

Erreicht das Workflow-Replay eine lokale Aktivität, führt die aktuelle
Workflow-Aufgabe folgende Schritte aus:

1. Sie erstellt die Aktivitätsausführung mit `activity_options.execution_mode=local`.
2. Sie zeichnet `ActivityScheduled` und `ActivityStarted` mit lokalem Marker auf.
3. Sie instanziiert die Aktivitätsklasse und führt sie im Workflow-Worker-Prozess aus.
4. Sie zeichnet `ActivityCompleted`, `ActivityFailed`, `ActivityTimedOut` oder `ActivityCancelled` auf.
5. Sie setzt den Workflow-Code anhand des aufgezeichneten Aktivitätsereignisses fort.

Replay führt eine abgeschlossene lokale Aktivität nicht erneut aus.
Abfrage-Replay und kaltes Replay lesen dieselben Aktivitätshistorienereignisse
wie gewöhnliche Aktivitäten.

## Heartbeats {#heartbeats}

Eine lokale Aktivität besitzt keine Aktivitätsaufgaben-Lease. Sie besitzt die
Lease der Workflow-Aufgabe, die gerade den Workflow ausführt. Beim
Versuchsstart verlängert die Laufzeit diese Lease. Ruft Aktivitätscode
`$this->heartbeat()` auf, zeichnet die Laufzeit Fortschritt auf, aktualisiert
den Aktivitätsversuch und verlängert die Workflow-Aufgaben-Lease.

Langlebige lokale Aktivitäten müssen häufig genug Heartbeats senden, um sowohl
den lokalen Aktivitäts-Heartbeat-Timeout als auch die Workflow-Aufgaben-Lease
einzuhalten:

```php
use Workflow\V2\Activity;

final class PollShortJobActivity extends Activity
{
    public function handle(string $jobId): array
    {
        $state = $this->fetch($jobId);

        $this->heartbeat([
            'message' => 'Polling remote job',
            'job_id' => $jobId,
            'state' => $state['status'],
        ]);

        return $state;
    }
}
```

## Timeouts und Wiederholungen {#timeouts-and-retries}

`startToCloseTimeout` begrenzt einen Versuch. `scheduleToCloseTimeout` begrenzt
die gesamte lokale Ausführung über Wiederholungen hinweg. `heartbeatTimeout`
begrenzt den Abstand zwischen aufgezeichneten lokalen Aktivitäts-Heartbeats.

Bei einem wiederholbaren Fehler oder Timeout zeichnet die Laufzeit
`ActivityRetryScheduled` auf und erstellt eine Workflow-Aufgabe, die nach der
Wartezeit für die Wiederholung verfügbar wird. Diese Aufgabe spielt die
Workflow-Historie erneut ab, erreicht dieselbe lokale Aktivitätssequenz und
startet den nächsten lokalen Versuch.

Jeder lokale Versuch ist eine neue `activity_attempts`-Zeile. Eine Wiederholung
zeichnet als `retry_reason` den Wert `failure`, `timeout` oder `cold_replay` auf.

## Abbruch und Worker-Verlust {#cancellation-and-worker-loss}

Abbruch erfolgt kooperativ. Eine lokale Aktivität erkennt ihn bei Heartbeats,
Timeout-Durchsetzung und Versuchsabschlussgrenzen. Ein abgebrochener lokaler
Versuch zeichnet `ActivityCancelled` mit lokalem Marker auf.

Beendet sich ein Worker, bevor er ein Abschlussereignis der lokalen Aktivität
festschreibt, läuft die Workflow-Aufgaben-Lease ab. Die normale Aufgabenreparatur
holt die Workflow-Aufgabe zurück. Kaltes Replay liest dann die festgeschriebene
Historie. Enthält sie einen gestarteten lokalen Versuch ohne Abschlussereignis,
plant die Laufzeit eine Wiederholung mit `retry_reason=cold_replay` ein.

## Sichtbarkeit {#visibility}

Betreiber können lokale Aktivitäten überall unterscheiden, wo Aktivitätszustand
gemeldet wird:

- Historien-Payloads enthalten `execution_mode=local` und `local_activity=true`.
- `activity_executions.activity_options.execution_mode` ist `local`.
- Laufdetails und Historienexport enthalten `execution_mode` und `local_activity`.
- Betriebsmetriken zeigen `activities.local`, `activities.local_open`, `activities.local_attempts` und Zähler für Queue- gegenüber lokalen Aktivitäten.

Das Laufzeitmanifest wird unter
`worker_protocol.server_capabilities.local_activities` in
`GET /api/cluster/info` veröffentlicht. Der maschinenlesbare Vertrag ist
[`local-activity-runtime.schema.json`](/platform-protocol-specs/local-activity-runtime.schema.json)
und wird im Katalog
[Plattform-Protokollspezifikationen](/docs/platform-protocol-specs#local-activity-runtime-notes)
aufgeführt.

Die Ereignisnamen bleiben normale Aktivitätsereignisnamen. Zeitleisten und
Replay-Werkzeuge erhalten dadurch die Reihenfolge ohne eine parallele
Ereignisfamilie.

## Das richtige Primitiv wählen {#choosing-the-right-primitive}

Verwenden Sie eine lokale Aktivität für kurze, wiederholbare, idempotente
Seiteneffekte, die sich am besten im Workflow-Worker-Prozess ausführen lassen
und kein Queue-Routing benötigen.

Verwenden Sie eine gewöhnliche [Aktivität](/docs/defining-workflows/activities)
für entfernte Aufrufe, langsame Ein-/Ausgabe, rechenintensive Arbeit,
dedizierte Worker-Flotten, Rückstau oder Arbeit, die nach Verlust des
Workflow-Workers über eine separat geleaste Aktivitätsaufgabe weiterlaufen soll.

Verwenden Sie [Worker-Sitzungen](/docs/features/worker-sessions), wenn mehrere
gewöhnliche Aktivitätsschritte Worker-lokale Ressourcen wie GPU-Speicher oder
ein eingebundenes Dateisystem wiederverwenden müssen.

Verwenden Sie [`sideEffect(...)`](/docs/features/side-effects) nur für
Replay-sichere Snapshots ohne Bedarf an Aktivitätswiederholungen, Timeouts,
Heartbeats oder Abbruchsemantik.
