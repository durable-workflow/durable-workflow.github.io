---
sidebar_position: 24
title: Worker-Sitzungen
description: Binden Sie eine Folge dauerhafter Aktivitätsversuche an eine Worker-Sitzungs-Lease für Affinität zu GPU, Dateisystem oder prozesslokalem Zustand.
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - Worker-Sitzungen
  - Aktivitätsaffinität
  - GPU-Worker
  - Worker mit lokalem Dateisystem
  - Worker-Protokoll-Sitzungen
---

# Worker-Sitzungen {#worker-sessions}

Worker-Sitzungen sind das v2-Primitiv für Aktivitätsaffinität. Verwenden Sie
sie, wenn mehrere dauerhafte Aktivitätsschritte prozesslokalen Zustand,
GPU-Speicher, ein eingebundenes Dateisystem oder eine andere Worker-lokale
Ressource wiederverwenden müssen.

## Vertragsübersicht {#contract-summary}

- Eine Sitzung hat jeweils einen Lease-Besitzer.
- Die erste zugelassene Aktivität in der Sitzung erstellt oder übernimmt die Lease erneut.
- Aktivitäts-Heartbeats verlängern sowohl die Aktivitätsversuchs-Lease als auch die Sitzungs-Lease.
- `POST /api/worker/sessions`, `POST /api/worker/sessions/{sessionId}/heartbeat` und `DELETE /api/worker/sessions/{sessionId}` bieten externen Workern explizite Lebenszyklusoperationen.
- Queue-Routing erfolgt weiterhin zuerst. Die Worker-Sitzungs-Zulassung erfolgt nach der Registrierung des Workers für die Aufgabenqueue.
- Die `capabilities` der Worker-Registrierung müssen jede Sitzungsanforderung erfüllen.
- Abgelaufene und verwaiste Sitzungen sind für Betreiber sichtbar und können erneut übernommen werden, wenn die Sitzung Fehlerwiederherstellung erlaubt.

## Autoren-API {#authoring-api}

PHP-Workflow-Autoren erstellen eine Sitzungsreferenz mit
`Workflow::workerSession()` oder `Workflow\V2\workerSession()` und planen
Aktivitäten darüber ein:

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

Der Aktivitätsoptions-Snapshot speichert denselben Vertrag unter
`activity_options.worker_session`. Externe Laufzeiten verwenden dieselbe
JSON-Form unter `worker_session` eines Workflow-Aufgabenbefehls
`schedule_activity`.

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Python-Service-Worker {#python-service-workers}

Das [Python-Beispiel für Worker-Sessions](../polyglot/python.md#worker-sessions) erstellt `WorkerSessionOptions`, plant zwei aufeinanderfolgende Remote-Activities, deklariert die Capability des Inhabers und behandelt einen endgültigen Activity-Fehler. Es zeigt außerdem den Neuaufbau verwerfbaren lokalen Zustands nach dem Verlust des Inhabers und erklärt, warum explizites Schließen oder TTL-Ablauf eine neue Session-ID erfordert. Das Rezept wurde mit den veröffentlichten Versionen Python SDK 2.9.0 und Server 2.11.0 einschließlich der Scheduler-/Wartungsrolle des Servers geprüft.

## Lebenszyklus {#lifecycle}

Sitzungen werden bei Bedarf erstellt. Die Zuordnungsschicht erstellt oder
übernimmt eine Sitzung erneut, wenn die erste Sitzungs-Aktivitätsaufgabe einem
fähigen Worker zugewiesen wird. Ein Worker kann die Sitzung vor dem Abfragen
auch explizit mit `POST /api/worker/sessions` erstellen.

Eine aktive Sitzung endet, wenn der Besitzer sie schließt, die Sitzungs-Lease
abläuft, die absolute TTL abläuft oder der besitzende Worker als ausgefallen
erkannt wird. TTL-Ablauf und explizites Schließen sind für diese Sitzungs-ID
endgültig. Nach Lease-Ablauf oder Erkennung einer verwaisten Sitzung ist
erneute Übernahme möglich, wenn `allow_reacquire_after_failure` gleich `true`
ist.

## Lease und Besitz {#lease-and-ownership}

Höchstens ein Worker besitzt gleichzeitig eine Sitzungs-Lease. Der Server lässt
Sitzungs-Aktivitätsaufgaben nur unter einer dieser Bedingungen zu:

- Es existiert keine Sitzung und `create_if_missing` ist `true`.
- Die aktive Sitzung gehört bereits dem abfragenden Worker.
- Die Sitzung ist abgelaufen, fehlgeschlagen oder verwaist und erneute Übernahme ist erlaubt.

Sitzungsbesitz ersetzt nicht die Aktivitäts-Lease pro Versuch. Jeder
Aktivitätsversuch hat weiterhin eine eigene `activity_attempt_id`, einen
Lease-Besitzer, Heartbeat sowie Abschluss-, Fehler-, Timeout- und Abbruchpfad.

## Zulassung und Routing {#admission-and-routing}

Worker-Sitzungen nehmen am normalen Queue-Routing teil.
`WorkerSessionOptions` kann `connection` und `queue` setzen.
`ActivityOptions` pro Aufruf kann diese weiterhin überschreiben. Der Server
setzt nach der normalen Aufgabenqueue-Zulassung die sitzungsspezifische
Zulassung durch:

- Die `capabilities` der Worker-Registrierung müssen jede Sitzungsanforderung abdecken.
- `max_concurrent_activities` begrenzt geleaste Aktivitätsversuche innerhalb der Sitzung.
- `max_concurrent_worker_sessions` begrenzt aktive Sitzungs-Leases einer Worker-Registrierung.

Flottenspezifisches Routing verwendet einfache Fähigkeitszeichenfolgen wie
`gpu:nvidia-l4`, `gpu:a100`, `fs:/mnt/models` oder `zone:us-east-1a`.

## Fehler, Abbruch und Herunterfahren {#failure-cancellation-and-shutdown}

Aktivitäts-Heartbeats verlängern Aktivitätsversuchs-Lease und Sitzungs-Lease.
Worker können die Sitzung auch direkt über das Worker-Protokoll verlängern.
Läuft die Sitzungs-Lease ab, wird die Sitzung `expired`. Ist der Heartbeat der
besitzenden Worker-Registrierung veraltet oder fehlt, wird sie `orphaned`.

Fällt der besitzende Worker mitten in einer Folge aus, behalten laufende
Aktivitäten gewöhnliches Mindestens-einmal-Verhalten: Ihre Versuchs-Leases
laufen ab, Reparatur macht sie erneut übernehmbar und veraltete
Abschlussmeldungen können abgelehnt werden. Ein fähiger Worker kann die Sitzung
erneut übernehmen, wenn der Vertrag dies erlaubt. Workflow-Autoren müssen
damit rechnen, prozesslokalen Zustand danach wiederaufzubauen.

Workflow-Abbruch wird weiterhin über Aktivitäts-Heartbeat-Antworten
weitergegeben. Eine Sitzungs-Lease erlaubt einer Aktivität niemals,
`cancel_requested` zu ignorieren. Beim geplanten Herunterfahren sollte der
Worker gehaltene Sitzungen vor dem Prozessende über
`DELETE /api/worker/sessions/{sessionId}` schließen. Laufende Aktivitäten
schließen weiter unter ihren eigenen Versuchs-Leases ab, schlagen fehl, werden
abgebrochen oder laufen ab.

## Sichtbarkeit {#visibility}

Worker-Protokoll-Fähigkeiten geben `worker_session_verbs` und den
Laufzeitvertrag `worker_sessions` über `GET /api/cluster/info` und jede
Worker-Ebenen-Antwort bekannt. Der maschinenlesbare Vertrag ist in
[`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)
veröffentlicht und im Katalog
[Plattform-Protokollspezifikationen](/docs/platform-protocol-specs#worker-session-runtime-notes)
aufgeführt.

Betreiber können aktive, geschlossene, abgelaufene, fehlgeschlagene und
verwaiste Sitzungen unter `GET /api/worker-sessions` auflisten. Die
Detailoberfläche enthält Sitzungs-ID, Besitzer, Queue, Anforderungen,
Lease-Ablauf, TTL-Ablauf, aktive Aktivitätsanzahl und Fehlergrund. Die
System-Betriebsmetriken enthalten Zähler für jeden Sitzungsstatus.

## Worker-Sitzungen auswählen {#choosing-worker-sessions}

Bevorzugen Sie gewöhnliche Queue-Aktivitäten, wenn jeder Schritt unabhängig
ist. Bevorzugen Sie eine größere Aktivität, wenn die gesamte Operation ein
atomarer Seiteneffekt ist. Verwenden Sie eine Worker-Sitzung nur, wenn mehrere
dauerhafte Aktivitätsschritte eine Worker-lokale Ressource wiederverwenden
müssen und der Workflow deren Wiederaufbau nach Worker-Ausfall verträgt.

Das Verhältnis von Worker-Sitzungen zu gewöhnlichen Queue-Aktivitäten,
lokalen Aktivitäten und Sticky Execution beschreibt
[Ausführungsmodell für Aktivitäten](/docs/features/activity-execution-model).
