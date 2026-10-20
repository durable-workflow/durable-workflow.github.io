---
sidebar_position: 5
title: Worker-Protokoll
description: Das versionierte Worker-Plane-Protokoll für Abfragen, Leases, Historien-Replay, Heartbeats, Abschluss und externe Task-Ergebnisse implementieren.
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - Worker-Protokoll
  - Abfragen externer Worker
  - Workflow-Task-Brücke
---

# Worker-Protokoll {#worker-protocol}

Durable Workflow stellt ein versioniertes Worker-Protokoll über zwei Brückenverträge bereit. Sie definieren die vollständigen Operationen, mit denen externe Worker, einschließlich des eigenständigen Durable Workflow Servers, Workflow- und Aktivitäts-Tasks abfragen, übernehmen, ausführen und abschließen.

## Protokollversion {#protocol-version}

Die aktuell vom Server gemeldete Protokollversion ist **1.20**. Die Nummerierung
folgt dem Muster semantischer Versionierung:

- **Hauptversion** steigt bei rückwärtsinkompatiblen Änderungen (neue Pflichtfelder, entfernte Operationen, geänderte Seitennavigationssemantik).
- **Nebenversion** steigt bei additiven Änderungen (neue optionale Felder, neue nicht terminale Befehlstypen).

Worker dürfen eine ältere Nebenversion derselben Hauptversion verwenden.
Ein Server mit `1.N` akzeptiert `X-Durable-Workflow-Protocol-Version: 1.M`
bei `M <= N` und liefert sein gemeldetes `1.N` in der Antwort. Der
Standardserver mit `1.20` akzeptiert daher Anfrageversionen von `1.0` bis `1.20`.
Ermitteln Sie vor der Bereitstellung die erforderliche Nebenversion und das
optionale Fähigkeitsprofil jedes SDKs. Fehlende oder ungültige Header, andere
Hauptversionen und neuere Worker-Nebenversionen werden strikt abgelehnt.

PHP SDK 2.3.2, Python SDK 2.5.7 und Rust SDK 3.5.0 verwenden standardmäßig `1.20`.
Diese Releases unterstützen auch explizite Auswahl von `1.19` für einen älteren
kompatiblen Server. Optionale Worker-Fähigkeiten, einschließlich kooperativem
Abbruch, müssen weiterhin explizit aktiviert werden. Die Auswahl einer
Protokollversion aktiviert sie nicht. Konfiguration und veröffentlichte
Kompatibilitätsmetadaten finden Sie in der [Dokumentation der SDKs](/docs/polyglot/deployment-modes/).

Die vollständige Protokollbeschreibung lässt sich programmatisch abrufen:

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## Fähigkeiten erkennen {#capability-discovery}

Der eigenständige Server veröffentlicht Worker-Protokollfähigkeiten unter
`worker_protocol.server_capabilities` in `GET /api/cluster/info`. Dasselbe Objekt
wird als `server_capabilities` in Worker-Plane-Antworten für Abfragen,
Heartbeats, Abschluss und Fehler zurückgegeben.

Lesen Sie vor dem Senden optionaler Befehlsfelder diese Angaben:

- `supported_workflow_task_commands`: beim Workflow-Task-Abschluss akzeptierte Befehlstypen.
- `poll_status`: Abfrageantworten enthalten auch ohne geleasten Task einen
  maschinenlesbaren Status. Er unterscheidet `leased`, `empty`, `throttled`
  und `unavailable`, ohne Warteschlangenzustand aus `task: null` ableiten zu müssen.
- `activity_retry_policy` und `activity_timeouts`: Wiederholungs- und Timeout-Optionen von Aktivitätsbefehlen.
- `worker_session_verbs` und `worker_sessions`: Worker-Sitzungslebenszyklus,
  Aktivitätsbefehlsfelder, Erneuerung, Fehlererkennung und terminale Zustände.
  Die Laufzeitstruktur der Worker-Sitzungen definiert
  [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json).
- `child_workflow_retry_policy` und `child_workflow_timeouts`: Wiederholungs- und Timeout-Optionen für Kind-Workflows.
- `parent_close_policy`: Unterstützung für Richtlinien beim Schließen des Eltern-Workflows.
- `query_tasks`: servergeroutete Workflow-Abfrage-Tasks für externe Laufzeitumgebungen.
- `non_retryable_failures`: Unterstützung von Fehlermetadaten für Workflows und Aktivitäten.

Vor dem Abfragen muss jeder Worker seinen Namespace, die Task-Warteschlange,
Laufzeitumgebung, unterstützte Typschlüssel und lokale Kapazität über
`POST /api/worker/register` registrieren.
[Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
legt diese Nutzlast und den rollenspezifischen Authentifizierungsvertrag fest.
Den umfassenderen Vertrag für Erkennung bereiter Tasks und Lease-Zuweisung
beschreibt [Task-Zuordnung und -Zuweisung](/docs/polyglot/task-matching-dispatch).
Für Aktivitätsaffinität über mehrere dauerhafte Schritte siehe
[Worker-Sitzungen](/docs/features/worker-sessions).

## Ausführungssemantik {#execution-semantics}

Worker-Transport ist verteilte Koordination mit Mindestens-einmal-Zustellung,
keine Genau-einmal-Zustellung:

- Workflow-Task-Replay baut Zustand aus festgeschriebener Historie auf. Er ist
  keine Wiederholung auf Workflow-Ebene.
- Der Ablauf einer Aktivitäts-Task-Lease kann erneute Zustellung an einen
  anderen Worker auslösen.
- Späte Abschluss- oder Fehlermeldungen können als veraltet abgelehnt werden,
  weil bereits ein anderer Versuch das dauerhafte Rennen gewonnen hat.

Verwenden Sie `activity_execution_id` als Standard-Idempotenzschlüssel für
entfernte Systeme, wenn ein Worker oder Transportadapter ein anderes System
anspricht. Verwenden Sie `activity_attempt_id` nur, wenn das nachgelagerte System
einzelne Versuche derselben logischen Aktivitätsausführung unterscheiden muss.

[Ausführungsgarantien und Idempotenz](/docs/constraints/execution-guarantees)
beschreibt den maßgeblichen Vertrag hinter diesen Operationen für Replay,
Wiederholung, Lease-Ablauf, erneute Zustellung und genau einmal geschriebene
dauerhafte Historie.

## Workflow-Task-Brücke {#workflow-task-bridge}

Der Vertrag `WorkflowTaskBridge` definiert die Interaktion externer Worker mit dauerhaften Workflow-Tasks:

| Operation | Beschreibung |
|------|-------------|
| `poll` | Bereite Workflow-Tasks passend zu Warteschlange und Kompatibilität finden |
| `claim` / `claimStatus` | Bestimmten Task übernehmen und eine fünfminütige Lease erhalten |
| `historyPayload` | Vollständige Replay-Historie eines übernommenen Tasks abrufen |
| `historyPayloadPaginated` | Historie großer Workflows seitenweise abrufen |
| `execute` | Task im Prozess mit dem Paket-Executor übernehmen und ausführen |
| `complete` | Befehle eines externen Workers zum Task-Abschluss übermitteln |
| `fail` | Task-Fehler eines externen Workers aufzeichnen |
| `heartbeat` | Lease eines übernommenen Tasks verlängern |

### Seitenweise Historie {#paginated-history}

Rufen Sie für große Workflow-Historien Ereignisse mit `historyPayloadPaginated` seitenweise ab:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

Die Standardseitengröße ist 500 Ereignisse, entsprechend `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` und dem vom Server in seinen Worker-Protokollfähigkeiten veröffentlichten `default_history_page_size`. Das Maximum ist 1000. Server können im Worker-Protokollmanifest einen anderen wirksamen Standard melden. Lesen Sie daher bevorzugt die veröffentlichte Fähigkeit, statt eine der Zahlen fest zu codieren. Die Antwort enthält `has_more` und `next_after_sequence` für Cursor-basierte Seitennavigation.

### Historienkomprimierung {#history-compression}

Bei sehr großen Historien kann die Brücke oder der Server die Historienereignisnutzlast zur Verringerung der Übertragungsgröße komprimieren. Komprimierung muss explizit über einen Parameter nach Art von `Accept-Encoding` angefordert werden.

Übersteigt die Ereignisanzahl einer Antwort die Komprimierungsschwelle von 50, kann die Brücke liefern:

- `history_events`: `[]` (leeres Array als Hinweis, dass Ereignisse im komprimierten Schlüssel liegen)
- `history_events_compressed`: Base64-codierte komprimierte Nutzlast
- `history_events_encoding`: verwendeter Algorithmus (`gzip` oder `deflate`)

Der Aufrufer decodiert Base64, dekomprimiert mit dem genannten Algorithmus und decodiert das Ergebnis als JSON, um das ursprüngliche Array `history_events` wiederherzustellen.

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

Fordert der Aufrufer keine Komprimierung an oder liegt die Ereignisanzahl unter der Schwelle, enthält die Antwort das normale unkomprimierte Array `history_events`.

### Long-Poll-Semantik {#long-poll-semantics}

Beide `poll`-Operationen unterstützen optional Long Polling. Enthält die Anfrage `timeout_seconds`, hält die Brücke oder der Server die Verbindung bis zu dieser Dauer offen und wartet auf einen passenden bereiten Task, statt sofort ein leeres Ergebnis zu liefern.

| Parameter | Standard | Min. | Max. |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

Verhalten:

- Wird während des Wartens ein Task bereit, wird er sofort zurückgegeben.
- Läuft die Frist ohne Task ab, behält die Antwort die normale Abfrage-Envelope
  und liefert `task: null` mit `poll_status: "empty"`.
- Der Client sollte nach einer leeren Long-Poll-Antwort sofort erneut abfragen, sofern er nicht herunterfährt.
- HTTP-Transport-Timeouts sollten über 60 Sekunden liegen, um vorzeitige Trennungen zu vermeiden.

Jede Worker-Abfrageantwort enthält `poll_status`:

| Wert | Bedeutung |
|------|---------|
| `leased` | Server hat diesem Worker einen Task geleast. |
| `empty` | Vor Ende der kurzen Abfrage oder des Long-Poll-Timeouts war kein passender Task bereit. |
| `throttled` | Zulassungsgrenzen verhinderten das Verleasen von Arbeit, obwohl bereite Tasks vorhanden sein können. |
| `unavailable` | Warteschlange oder Matching-Pfad war vorübergehend nicht verfügbar. Worker sollten dies als vorübergehenden Infrastrukturfehler behandeln. |

Prüfen Sie `poll_status`, bevor Sie eine leere Abfrage als freie Kapazität
werten. `task: null` mit `poll_status: "throttled"` ist Rückstaukontrolle,
nicht fehlende Arbeit.

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### Status von Abfrageantworten {#poll-response-status}

Server verwendet denselben Abfrageantwortvertrag für Workflow-, Aktivitäts-
und Abfrage-Tasks:

- `task`: die Nutzlast des geleasten Tasks oder `null`, wenn keine Arbeit geleast wurde.
- `poll_status`: maschinenlesbares Ergebnis des Abfrageversuchs.
- `protocol_version` und `server_capabilities`: zurückgegebene Felder des Worker-Protokollmanifests.

Worker sollten zuerst `poll_status` prüfen, bevor sie routenspezifische
Annahmen über `task` treffen:

| `poll_status` | Typischer HTTP-Status | Bedeutung |
| --- | --- | --- |
| `leased` | `200` | Arbeit wurde geleast und `task` enthält die Nutzlast. |
| `empty` | `200` | Vor Rückkehr der Abfrage war kein passender Task bereit. |
| `throttled` | `200` | Warteschlangenzulassungsgrenzen hielten für diesen Versuch eine neue Lease zurück. |
| `unavailable` | `503` oder `200` | Server konnte die Warteschlange nicht sicher koordinieren und lieferte ein typisiertes Nichtverfügbarkeitsergebnis. |
| `draining` | `409` | Die Build-ID-Kohorte des Workers läuft aus. Server verweigert neue Leases mit `reason: "worker_draining"`. |

### Abschluss-, Heartbeat- und Fehleranfragen {#completion-heartbeat-and-fail-requests}

Die Workflow-Task-Endpunkte `complete`, `heartbeat` und `fail` verlangen, dass
der Worker zwei Lease-Identitätsfelder aus der Abfrage- oder Claim-Antwort zurücksendet:

| Feld | Typ | Beschreibung |
|------|------|-------------|
| `lease_owner` | Zeichenfolge | Worker-Identität mit Task-Lease. Muss dem aus `poll` oder `claim` gelieferten `lease_owner` entsprechen. |
| `workflow_task_attempt` | Ganzzahl ≥ 1 | Versuchszahl des geleasten Tasks. Muss `workflow_task_attempt` aus `poll` oder `claim` entsprechen. |

Veraltete Versuche oder falsche Lease-Inhaber werden vor Anwendung eines Befehls
abgelehnt. Ein abgelaufener Worker kann daher keine Replay-Befehle für einen
neu übernommenen Task festschreiben.

Anfrageendpunkte und -inhalte:

- `POST /api/worker/workflow-tasks/{task_id}/complete`: benötigt `lease_owner`,
  `workflow_task_attempt` und ein nicht leeres `commands`-Array. Die Strukturen
  stehen unter [Befehlstypen](#command-types).
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat`: benötigt `lease_owner`
  und `workflow_task_attempt`. Liefert erneuerte Lease-Ablaufzeit und aktuellen Laufstatus.
- `POST /api/worker/workflow-tasks/{task_id}/fail`: benötigt `lease_owner`,
  `workflow_task_attempt` und ein `failure`-Objekt mit `message` (Pflicht)
  sowie optional `type` und `stack_trace`.

Beispiel einer Abschlussanfrage:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

Beispiel einer Heartbeat-Anfrage:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

Beispiel einer Fehleranfrage:

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### Befehlstypen {#command-types}

Beim Workflow-Task-Abschluss übermittelt der externe Worker eine Liste typisierter Befehle. Je Abschluss ist höchstens ein terminaler Befehl erlaubt.

**Nicht terminale Befehle** (null oder mehr, in Reihenfolge verarbeitet):

| Typ | Pflichtfelder | Beschreibung |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | Aktivitäts-Task zur Ausführung planen |
| `start_timer` | `delay_seconds` | Dauerhaften Timer planen |
| `start_child_workflow` | `workflow_type` | Kind-Workflow-Instanz starten |
| `complete_update` | `update_id` | Angenommenes Update als angewendet und abgeschlossen markieren |
| `fail_update` | `update_id`, `message` | Angenommenes Update als fehlgeschlagen markieren |
| `record_side_effect` | `result` | Deterministisches Seiteneffektergebnis aufzeichnen |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Versionierungsentscheidung aufzeichnen |
| `upsert_search_attributes` | `attributes` | Indizierte Metadaten am Workflow-Lauf einfügen oder aktualisieren |

`schedule_activity` akzeptiert optional `retry_policy`, `start_to_close_timeout`,
`schedule_to_start_timeout`, `schedule_to_close_timeout` und `heartbeat_timeout`.
`retry_policy` verwendet `max_attempts`, `backoff_seconds` und `non_retryable_error_types`.

`start_child_workflow` akzeptiert optional `parent_close_policy`, `retry_policy`,
`execution_timeout_seconds` und `run_timeout_seconds`. `parent_close_policy`
ist `abandon`, `request_cancel`, `request_cancellation` oder `terminate`.
`request_cancel` schließt das Kind sofort. `request_cancellation` fordert
kooperative Bereinigung mit ursprünglicher Abbruchidentität und Frist an.
Siehe [Kooperativer Abbruch](/docs/polyglot/cancellation). Die
Kind-Wiederholungsrichtlinie nutzt dieselbe Objektstruktur aus `max_attempts`,
`backoff_seconds` und `non_retryable_error_types` wie Aktivitäten. Wartezeiten
für Wiederholungen gelten nach einem fehlgeschlagenen Kindlauf. Ungültige
Kindstartbefehle sind Protokollfehler und verbrauchen keine Kind-Wiederholungsversuche.

`complete_update` schließt das durch `update_id` benannte angenommene Update,
nachdem der Worker dessen Handler angewendet hat. Es akzeptiert eine optionale
`result`-Nutzlast in derselben `{codec, blob}`-Envelope wie
Workflow-Abschlussergebnisse. `fail_update` schließt das angenommene Update als
fehlgeschlagen und akzeptiert neben `message` optional `exception_class`,
`exception_type` und `non_retryable`.

**Terminale Befehle** (höchstens einer):

| Typ | Pflichtfelder | Beschreibung |
|------|----------------|-------------|
| `complete_workflow` | — | Lauf als abgeschlossen markieren (optional `result`) |
| `fail_workflow` | `message` | Lauf als fehlgeschlagen markieren |
| `continue_as_new` | — | Lauf schließen und neuen starten (optional `arguments`, `workflow_type`) |

Schließt Abbruch oder Terminierung einen Lauf bei geleastem Workflow-Task,
behalten `history`, `heartbeat`, `complete` und `fail` die Worker-Protokoll-Envelope,
lehnen aber mit `reason: "run_closed"` ab. Die Antwort enthält außerdem
`can_continue: false`, `cancel_requested: true` und einen konkreten
`stop_reason` wie `run_cancelled` oder `run_terminated`. So können Worker
beobachteten Abbruch von einem allgemeinen Lease-Fehler unterscheiden. Dieselbe
Antwort enthält `run_closed_reason` und `run_closed_at` aus dem dauerhaften
Laufdatensatz für die genaue Protokollierung des Schließungszustands.

Workflow-Task-Abfrageantworten enthalten stabilen Fortsetzungskontext aus der
dauerhaften Task-Nutzlast:

| Feld | Bedeutung |
|------|---------|
| `workflow_wait_kind` | Durch diesen Task angewendete Warteart: `update`, `signal`, `child`, `condition`, `timer` oder `null` für gewöhnliche Replay-/Start-Tasks |
| `open_wait_id` | Stabile Warteidentität wie `update:{id}` oder `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | Dauerhafte Quelle, die den Task weckte, etwa `workflow_update`, `workflow_signal`, `timer` oder `child_workflow_run` |
| `workflow_update_id` | Angenommene Update-ID bei Anwendung eines Updates |
| `workflow_signal_id` | Angenommene Signal-ID bei Anwendung eines Signals |
| `signal_name` / `signal_wait_id` | Signalziel und stabile Warteidentität bei Signal oder timerbasierter Signalwarteoperation |
| `workflow_command_id` | Control-Plane-Befehls-ID, die den Task erzeugte, sofern verfügbar |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | Aktivitätskennungen bei Fortsetzung nach erfolgreicher oder fehlgeschlagener Aktivität |
| `child_call_id` / `child_workflow_run_id` | Kind-Wartekennungen beim Auflösen eines Kind-Workflows |
| `timer_id` / `condition_wait_id` | Reine Timer- und timerbasierte Bedingungskennungen bei Fortsetzung nach einem Timer |
| `condition_key` / `condition_definition_fingerprint` | Stabile Bedingungsbezeichnung und Prädikatfingerabdruck, sofern durch timerbasierte Bedingungswarteoperation aufgezeichnet |
| `workflow_sequence` / `workflow_event_type` | Historiensequenz und Ereignistyp für ereignisbasierte Aktivitäts-, Kind- und Timer-Auflösungs-Tasks |

Nicht anwendbare Felder sind `null`. SDK-Worker sollten diese Felder dem
Durchsuchen der Historie vorziehen, um einen geleasten Task mit angenommenem
Update, Signal, Aktivitätsergebnis, Kindauflösung oder timerbasierter
Warteoperation zu verknüpfen. Reine Timer-Fortsetzungen setzen
`workflow_wait_kind: "timer"`, `open_wait_id: "timer:{timer_id}"`,
`resume_source_kind: "timer"` und `timer_id`. Signalbasierte Fortsetzungen
setzen `workflow_wait_kind: "signal"` plus `signal_name`. Tasks zur Anwendung
angenommener Signale setzen zusätzlich `workflow_signal_id`. Timerbasierte
Signalwarteoperationen setzen `signal_wait_id` und die auslösende `timer_id`.
Bedingungs-Timeout-Fortsetzungen setzen `workflow_wait_kind: "condition"`,
`condition_wait_id` und bei schlüsselbasierten Warteoperationen `condition_key`
plus `condition_definition_fingerprint`.

## Abfrage-Tasks {#query-tasks}

Zielt eine Control-Plane-Abfrage auf einen Workflow mit Code in einer externen
Laufzeitumgebung, kann der eigenständige Server diesen nicht im PHP-Prozess
wiedergeben. Stattdessen erstellt er einen kurzlebigen Abfrage-Task und wartet
auf Ausführung durch einen aktiven abfragefähigen Worker auf der
Workflow-Task-Warteschlange. Dies gilt auch für entfernte PHP-SDK-Worker mit
Workflow-Code außerhalb des Server-Prozesses.

Abfrage-Tasks sind schreibgeschützt. Worker geben die gelieferte Historie wieder,
rufen den registrierten Abfrage-Handler auf und schließen den Abfrage-Task ab
oder melden Fehler. Sie schreiben keine dauerhaften Historienereignisse und
werden nach Timeout der Control-Plane-Abfrage des Aufrufers nicht wiederholt.

| Endpunkt | Beschreibung |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Abfrage-Task auf der registrierten Task-Warteschlange eines Workers per Long Polling abfragen |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | Abfrageergebnis übermitteln |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | Abfrage ablehnen oder als fehlgeschlagen melden |

Abfrageanfrage:

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

Abfrageantwort:

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

`task` ist `null`, wenn die Abfrage keine Lease liefert. Unterscheiden Sie mit
`poll_status` gewöhnliches leeres Warten von Drosselung oder vorübergehender
Nichtverfügbarkeit. Der Worker muss bei Abschluss oder Fehler `lease_owner`
und `query_task_attempt` zurücksenden. Veraltete Versuche und falsche
Lease-Inhaber werden abgelehnt.

Abschlussanfrage:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

Fehleranfrage:

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

Verwenden Sie `reason: "rejected_unknown_query"`, wenn der Workflow-Typ keinen
passenden Abfrage-Handler hat. Der Control-Plane-Aufrufer erhält `404`.
Andere Worker-Abfragefehler sollten `reason: "query_rejected"` verwenden und
`409` liefern. Kann kein aktiver Worker die Abfrage annehmen, liefert die
Control Plane `query_worker_unavailable`. Kommt vor dem konfigurierten Timeout
kein Ergebnis, liefert sie `query_worker_timeout`.

## Aktivitäts-Task-Brücke {#activity-task-bridge}

Der Vertrag `ActivityTaskBridge` definiert die Interaktion externer Worker mit Aktivitäts-Tasks:

| Operation | Beschreibung |
|------|-------------|
| `poll` | Bereite Aktivitäts-Tasks passend zu Warteschlange und Kompatibilität finden |
| `claim` / `claimStatus` | Bestimmten Aktivitäts-Task mit Lease übernehmen |
| `complete` | Aktivitätsabschluss mit Ergebnis aufzeichnen |
| `fail` | Aktivitätsfehler mit optionalem Codec-getaggtem `failure.details` aufzeichnen |
| `status` | Lebendigkeit und Abbruchzustand ohne Lease-Erneuerung prüfen |
| `heartbeat` | Lease verlängern und optional Fortschritt melden |

Aktivitäts-Heartbeat-Antworten enthalten `can_continue` und `cancel_requested`,
damit lang laufende Aktivitäten auf Abbruchanfragen reagieren können.
Stoppt ein Abbruch- oder Terminierungsbefehl des Laufs eine geleaste Aktivität,
enthalten Heartbeat-, Abschluss- und Fehlerantworten zusätzlich
`run_closed_reason` und `run_closed_at`.

## Nutzlast-Codecs {#payload-codecs}

Jede Nutzlast-Bytefolge über die Worker-Protokollgrenze ist mit einem **`payload_codec`** versehen, der das Format des zugehörigen Blobs benennt. v2 nutzt einen sprachneutralen Codec: **`avro`**. So kann jedes SDK (PHP, Python, Go, TypeScript, Rust) Nutzlasten ohne gemeinsame Laufzeitumgebung oder Anwendungsschlüssel codieren und decodieren. Der laufende Server meldet seine Codecs unter **`capabilities.payload_codecs`** in `GET /api/cluster/info`.

### Der Codec `avro` {#the-avro-codec}

`avro` ist der typisierte v2-Wert-Codec. Jede Nutzlast nutzt das feste rekursive
Schema `durable_workflow.protocol.Value` und den Standard-Avro-Einzelobjektrahmen.
Seine benannten Zweige erhalten boolesche Werte, vorzeichenbehaftete
64-Bit-Ganzzahlen, endliche Double-Werte, Bytes, UTF-8-Zeichenfolgen, Listen und
Maps mit Zeichenfolgeschlüsseln ohne workflowspezifische Schemas oder Registry.
Siehe [Avro-Value-Protokoll](/docs/polyglot/avro-value-protocol/).

### Übertragungsformat: Nutzlast-Envelope {#wire-format-payload-envelope}

Bei Feldern mit Nutzlastbytes (`arguments`, `result`, `payload` usw.) stellt das Worker-Protokoll den Codec neben der opaken Zeichenfolge bereit. Abfrageantworten sehen so aus:

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

Der Worker liest `payload_codec` und bestätigt vor dem Decodieren `avro`. Ein unbekannter Codec-Wert ist ein Fehler. Der Worker sollte weder erkennen wollen noch raten.

Aktivitätsabschlüsse senden `result` in derselben `{codec, blob}`-Envelope.
Aktivitätsfehler dürfen strukturierte Diagnosenutzlasten unter `failure.details`
senden. Falls vorhanden, ist auch `failure.details` eine `{codec, blob}`-Envelope.
Der Server speichert den Detail-Blob unverändert und zeichnet
`details_payload_codec` mit der dauerhaften Fehlernutzlast auf. Nicht-PHP-Worker
können Diagnosedaten damit ohne PHP-Serialisierung verlustfrei austauschen.

Die stabile sprachübergreifende Fehleroberfläche besteht aus `activity_type`,
`failure_category`, `exception_type`, `message`, `code`, `non_retryable` und
Codec-getaggten `details`. Laufzeitfelder wie Ausnahmeklassennamen,
Quelldateipfade, Zeilennummern und Stacktraces dienen nur der Diagnose. SDKs
sollten sie nicht in ihrem Standard-`exception_payload` offenlegen. Sie dürfen
sie nur zeigen, wenn Worker oder Server explizit eine `diagnostics`- oder
`runtime_diagnostics`-Envelope aufzeichnen.

### Einen Workflow starten {#starting-a-workflow}

`POST /api/workflows` akzeptiert `input` in zwei Formen:

1. **Einfaches JSON-Array**: Der Server überführt jeden JSON-Wert in das feste
   Avro-Value-Schema. JSON kann den Bytes-Zweig nicht ausdrücken. Clients mit
   Bytes senden eine explizite Avro-Envelope.

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **Explizite Envelope**: für Clients mit bereits codierten Bytes:

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

Der Server speichert den Blob unverändert und kennzeichnet den Lauf mit `avro`.

Der Codec wird auf `WorkflowRun` gespeichert und **gilt für die gesamte Laufdauer**: Aktivitätsargumente und -ergebnisse, Signal-/Update-Argumente und Kind-Workflow-Eingaben sind alle Avro-codiert.

Eingebettete/Paket-Starts (über `WorkflowStub::make(...)->start(...)` aus PHP statt über HTTP gestartete Workflows) lösen den Standard neuer Läufe ebenfalls nach dem ausschließlich Avro unterstützenden Vertrag des finalen v2 auf.

## Die Brücken auflösen {#resolving-the-bridges}

Beide Brücken sind im Laravel-Container registriert und direkt auflösbar:

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## Verwandte Leitfäden {#related-guides}

- [Server](./server.md) beschreibt die Control-Plane-Endpunkte und die Bereitstellungsform dieses Protokolls.
- [Oberfläche für externe Ausführung](./external-execution.md) erklärt die auf
  dem Worker-Protokoll aufbauenden Verträge für Worker, Brücken und Handler auf Aktivitätsniveau.
