---
sidebar_position: 8
---

# Heartbeats {#heartbeats}

Heartbeats ermöglichen einer langlebigen Aktivität zu melden, dass ihr
aktueller Versuch noch aktiv ist.

`heartbeat()` aktualisiert die aktuell übernommene Zeile in `activity_attempts` mit der Heartbeat-Zeit und dem neuesten Fortschritt, spiegelt den neuesten Heartbeat in die aktive Aktivitätsausführung und verlängert die Lease dieser Aktivitätsaufgabe. Ein `ActivityHeartbeatRecorded`-Ereignis schreibt er nur, wenn sich der Fortschritt geändert hat, und höchstens einmal pro Aufzeichnungsintervall (siehe unten). Die Detailansicht des ausgewählten Laufs in Waterline und Verlaufsexporte lesen den neuesten Heartbeat und Fortschritt aus der Versuchszeile und rekonstruieren Versuchsstatus, Aufgaben-ID, Worker, Lease, Abbruch und Abschlusszeiten aus dem typisierten Verlauf `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` und `ActivityCancelled`, mit Versuchszeilen als Rückfall für ältere Daten.

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

Innerhalb der Aktivität stellen `activityId()`, `attemptId()` und
`attemptCount()` die dauerhafte Ausführungs- und aktuelle Versuchsidentität
bereit, wenn Sie Korrelationsschlüssel für externe Arbeit benötigen.
Verwenden Sie `activityId()` als Standard-Idempotenzschlüssel für entfernte
Systeme. Verwenden Sie `attemptId()` nur für Systeme, die getrennte Versuche
derselben dauerhaften Aktivitätsausführung unterscheiden müssen.

Polyglotte Worker können Heartbeats über die HTTP-Worker-Brücke senden, ohne
die PHP-Aktivitätsklasse zu erzeugen. Die Endpunkte beschreibt das
[Worker-Protokoll](/docs/polyglot/worker-protocol).

Ein einzelner blockierender Aufruf kann einen eigenen Heartbeat-Hilfsthread
benötigen. Dieser meldet Lebenszeichen, keinen Fortschritt. Setzen Sie dem
Aufruf eine eigene endliche Frist und beenden Sie den Hilfsthread bei Abschluss
oder Autoritätsverlust. Python-Worker sollten die [Anleitung für erfassten Kontext und Abbruch](../polyglot/python.md#heartbeat-helper-thread) befolgen.

## Takt und Bestätigungen {#heartbeat-cadence-and-receipts}

Bei einer Aktivität in der Warteschlange beginnt die erste Heartbeat-Frist, wenn die Laufzeit sie beansprucht, also vor der Aufgabenauslieferung und dem Anwendungscode. Ein aufgezeichneter Heartbeat setzt die nächste Frist auf seinen Laufzeitzeitpunkt plus `heartbeatTimeout`. Weder das Senden der Anfrage noch der Empfang ihrer Antwort eröffnet ein weiteres vollständiges Zeitfenster. Siehe [Heartbeat-Zeitlimit](./timeouts.md#heartbeat-timeout).

Wählen Sie einen Takt deutlich innerhalb dieses Zeitfensters und begrenzen Sie die Arbeit zwischen Aufrufen. Bei einem Zeitlimit von 15 Sekunden können etwa fünf Sekunden ein Ausgangspunkt sein, aber nur wenn Auslieferung, jeder Stapel oder E/A-Aufruf, Ausführungspausen, Netzwerklatenz und Transportwiederholungen in das verbleibende Budget passen. Messen Sie diese Verzögerungen und lassen Sie Spielraum. Das ist Planungshilfe, kein garantiert sicheres Intervall. Ein abgelaufener oder ersetzter Versuch erhält seine Lease nicht durch einen späten Heartbeat zurück.

Es gibt keinen automatischen Fortschritts-Heartbeat-Takt und keine Zusage einer SDK-Bündelung. Worker-Registrierungs-Heartbeats und Besitzstatusabfragen veröffentlichen keinen Aktivitätsfortschritt. Jeder angenommene Heartbeat verlängert die Lease und verschiebt die Heartbeat-Frist. Ein Verlaufsereignis wird nur geschrieben, wenn sich der Fortschritt vom zuletzt aufgezeichneten unterscheidet und seit diesem Ereignis mindestens der größere Wert aus Heartbeat-Timeout und 60 Sekunden vergangen ist. Ein Heartbeat ohne Fortschritt belegt nur die Lebendigkeit und schreibt keinen Verlauf. Durch das Intervall zurückgehaltener Fortschritt wird einmal beim Abschluss des Versuchs aufgezeichnet. Ein Heartbeat pro Sekunde über eine Stunde mit unverändertem Fortschritt schreibt ein Ereignis. Ältere Verläufe behalten die bereits aufgezeichneten Ereignisse pro Heartbeat.

Eingebettetes `Activity::heartbeat()` gibt `void` zurück. Ungültiger Fortschritt und Speicherfehler können Ausnahmen auslösen. Eine normale Rückkehr ist kein Bestätigungsobjekt: Ein geschlossener, abgelaufener oder ersetzter Versuch kann zurückkehren, ohne einen weiteren Heartbeat aufzuzeichnen. Im Service-Modus unterscheiden sich direkte Client-Aufrufe und überwachte Worker. Siehe die Anleitungen für [PHP](../polyglot/php.md#activity-heartbeats), [Python](../polyglot/python.md#activity-heartbeat-requests) und [Rust](../polyglot/rust.md#activity-heartbeats).

Heartbeat-Fortschritt schreibt einen externen Stapel nicht atomar fest und grenzt externe Effekte nicht ab. Ein wiederholungssicherer Anwendungsprüfpunkt braucht einen eigenen dauerhaften Commit, einen stabilen logischen Auftragsschlüssel und Idempotenz oder externes Fencing. Ein Zugriff auf bestätigte Prüfpunkte durch einen Ersatzversuch wird separat in [der Prüfpunkt-Funktion](https://github.com/durable-workflow/.github/issues/218) verfolgt.

## Fortschritts-Snapshots {#progress-snapshots}

Sowohl `Activity::heartbeat()` als auch `ActivityTaskBridge::heartbeat()`
akzeptieren einen optionalen begrenzten Fortschritts-Snapshot:

- `message`
  - nicht leere Zeichenfolge mit bis zu 280 Zeichen
- `current`
  - nicht negative Ganz- oder Gleitkommazahl
- `total`
  - nicht negative Ganz- oder Gleitkommazahl
- `unit`
  - nicht leere Zeichenfolge mit bis zu 64 Zeichen
- `details`
  - flache Zuordnung mit bis zu 20 Einträgen `key => scalar|null`, deren Schlüssel `[A-Za-z0-9_.:-]{1,64}` entsprechen

Verwenden Sie diesen Payload für betreiberseitigen Fortschritt wie „Abschnitt
wird heruntergeladen“ oder `2 / 5 Abschnitte`, nicht für große Protokolle oder
beliebigen verschachtelten Zustand. Waterlines Laufdetails, der
Heartbeat-Zeitleisteneintrag und Historienexport zeigen ihn als
`last_heartbeat_progress` an der Aktivität und am aktuellen Versuch. Das rohe
typisierte Historienereignis `ActivityHeartbeatRecorded` behält denselben
normalisierten Payload unter `progress`.

## Dauerhafte Versuchsnachverfolgung {#durable-attempt-tracking}

Die Laufzeit zeichnet für jeden Aktivitätsversuch eine eigene dauerhafte Zeile mit Versuchsnummer, Status, Startzeit, neuestem Heartbeat und Fortschritt, Lease-Ablauf und Abschlusszeit auf. Sie zeichnet außerdem typisierten Versuchsverlauf auf, wenn Aktivitäten starten, Heartbeats senden, wiederholt werden, abschließen, fehlschlagen oder abgebrochen werden, sodass historische Versuchsdetails erhalten bleiben, auch wenn veränderliche Versuchs- oder Aufgabenzeilen später abweichen. Ein aufgezeichneter Heartbeat fügt einen kompakten `ActivityHeartbeatRecorded`-Zeitleistenpunkt mit Aktivitätsausführungs-ID, Versuchs-ID, Heartbeat-Zeit, Lease-Ablauf, Fortschritt und dem Aktivitätsschnappschuss zum Zeitpunkt des Ereignisses hinzu. Schließt ein cancel- oder terminate-Befehl den Lauf, zeichnet die Brücke `ActivityCancelled` auf, sobald der Worker den Stopp bemerkt, und weist spätere Abschlüsse oder Fehler als veraltet zurück, statt den Abbruch in ein Ergebnis zu verwandeln.

Heartbeats sind betriebliche Lebenszeichen. Senden Sie Heartbeats so oft, wie Ihre Timeouts und Ihre Wiederherstellung es erfordern. Heartbeats, die nur die Lebendigkeit belegen, erzeugen keinen Verlauf, und Fortschrittsänderungen werden höchstens einmal pro Intervall aufgezeichnet. Halten Sie den optionalen Fortschrittsschnappschuss kompakt genug für die Diagnose durch Betreiber, statt ihn wie einen Ereignisstrom zu behandeln.
