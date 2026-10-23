---
sidebar_position: 8
---

# Heartbeats {#heartbeats}

Heartbeats ermöglichen einer langlebigen Aktivität zu melden, dass ihr
aktueller Versuch noch aktiv ist.

`heartbeat()` aktualisiert die aktuell übernommene Zeile in
`activity_attempts`, spiegelt den neuesten Heartbeat in die aktive
Aktivitätsausführung, verlängert die Lease dieser Aktivitätsaufgabe und fügt
für den aktuellen Versuch ein typisiertes Historienereignis
`ActivityHeartbeatRecorded` hinzu. Waterlines Detailansicht des ausgewählten
Laufs und Historienexporte rekonstruieren Versuchsstatus, Aufgaben-ID, Worker,
Heartbeat, Lease, Abbruch- und Abschlusszeitstempel zuerst aus typisierter
Historie: `ActivityStarted`, `ActivityHeartbeatRecorded`,
`ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` und
`ActivityCancelled`. Veränderliche Versuchszeilen bleiben Fallback oder
Ergänzung für ältere Daten.

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

Es gibt keinen automatischen Fortschritts-Heartbeat-Takt und keine Zusage einer SDK-Bündelung. Worker-Registrierungs-Heartbeats und Besitzstatusabfragen veröffentlichen keinen Aktivitätsfortschritt. Jeder angenommene Fortschritts-Heartbeat erweitert die dauerhafte Historie. Melden Sie deshalb nicht jeden winzigen Arbeitsschritt.

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

Die Laufzeit zeichnet für jeden Aktivitätsversuch eine eigene dauerhafte Zeile
mit Versuchsnummer, Status, Startzeit, neuestem Heartbeat, Lease-Ablauf und
Abschlusszeit auf. Sie zeichnet außerdem typisierte Versuchshistorie für Start,
Heartbeat, Wiederholung, Abschluss, Fehler und Abbruch auf. Historische
Versuchsdetails bleiben so erhalten, wenn veränderliche Versuchs- oder
Aufgabenzeilen später abweichen. Jeder erfolgreiche Heartbeat des aktuell
übernommenen Versuchs zeichnet einen kompakten Zeitleistenpunkt
`ActivityHeartbeatRecorded` mit Aktivitätsausführungs-ID, Aktivitätsversuchs-ID,
Heartbeat-Zeitstempel, Lease-Ablauf und Aktivitätssnapshot zum Ereigniszeitpunkt
auf. Schließt ein Abbruch- oder Beendigungsbefehl den Lauf, zeichnet die Brücke
`ActivityCancelled` auf, sobald der Worker den Stopp bemerkt. Spätere Abschluss-
oder Fehlermeldungen werden als veraltet abgelehnt, statt den Abbruch in ein
Ergebnis umzuwandeln.

Heartbeats sind betriebliche Lebenszeichen. Da jeder angenommene Heartbeat
dauerhafte Historie ist, wählen Sie das Intervall passend zu Timeout- und
Wiederherstellungsanforderungen. Verwenden Sie es nicht als hochfrequentes
Fortschrittsprotokoll. Halten Sie den optionalen Fortschritts-Snapshot kompakt
für Betreiberdiagnosen, statt ihn als kontinuierlichen Ereignisstrom zu
behandeln.
