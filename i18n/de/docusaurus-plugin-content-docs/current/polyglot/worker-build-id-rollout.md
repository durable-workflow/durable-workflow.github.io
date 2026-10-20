---
sidebar_position: 7
title: Worker-Build-ID-Rollout
description: Worker-Builds auf dem eigenständigen Server mit Build-ID-Rollout-Zustand ausrollen, als Canary testen, leeren und zurücknehmen, ohne Ausführungen stranden zu lassen.
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - Worker-Build-ID-Rollout
  - Worker-Build leeren
  - Worker-Build zurücknehmen
  - Canary-Worker
  - Umstellung von unversioniert auf versioniert
---

# Worker-Build-ID-Rollout {#worker-build-id-rollout}

Nutzen Sie diese Referenz, wenn Sie von unversionierten auf mit Build-IDs
markierte Worker umstellen, einen neuen Build als Canary auf einer
Task-Warteschlange testen, einen älteren Build vor der Stilllegung leeren oder
einen fehlerhaften Build zurücknehmen. Der Server zeichnet die Betriebsabsicht
neben den aktuellen Worker-Zeilen auf. So spiegeln die nächste Abfrage, die
CLI-Beschreibung oder `list_task_queue_build_ids` den Rollout-Zustand ehrlich
wider, selbst wenn alte Worker vor dem Abbau ihres Rückstaus verschwinden.

Dieser Leitfaden beschreibt die Kohortensteuerung, nicht den vollständigen
Routing-Vertrag. [Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing)
erklärt, warum laufende Arbeit an kompatible Executors gebunden bleiben muss
und „kein kompatibler Worker verfügbar“ ein expliziter Betriebszustand ist.

Durable Workflow Server beschreibt einen Rollout auf einer Task-Warteschlange
als Menge von **Build-ID-Kohorten**. Eine Kohorte gruppiert alle
Worker-Registrierungen mit derselben `build_id` bei `POST /api/worker/register`.
Worker ohne `build_id` bilden die **unversionierte Kohorte**, den Standard vor
dem Rollout, von dem Sie bei der ersten Umstellung wegmigrieren.

## Vom Server aufgezeichneter Rollout-Zustand {#rollout-state-the-server-records}

Jede `(namespace, task_queue, build_id)`-Kohorte enthält aggregierten
Worker-Zustand (Anzahlen aktiver, auslaufender, veralteter und aller Worker)
sowie die Betriebsabsicht:

| Feld | Zweck |
| --- | --- |
| `build_id` | Registrierte Build-Identität. `null` kennzeichnet die unversionierte Kohorte. |
| `rollout_status` | Aggregierte Sicht darauf, wie die Kohorte mit neuen Tasks umgeht: `active`, `active_with_draining`, `draining`, `stale_only` oder `no_workers`. |
| `drain_intent` | Betriebsabsicht für die Kohorte: `active` oder `draining`. |
| `drained_at` | Zeitpunkt der ersten Markierung als auslaufend. Fehlt bei aktiver Kohorte. Wiederholte Leerungsaufrufe verschieben diesen Zeitstempel nicht. |
| `active_worker_count` | Lebende Worker, die aktuell neue Tasks annehmen. |
| `draining_worker_count` | Lebende Worker, die noch laufende Tasks halten, aber keine neue Arbeit übernehmen. |
| `stale_worker_count` | Worker, deren letzter Heartbeat älter als die Veraltungsgrenze ist. |
| `total_worker_count` | Summe der drei Worker-Gruppen der Kohorte. |
| `runtimes`, `sdk_versions` | Unterschiedliche in der Kohorte beobachtete Laufzeit- und SDK-Versionszeichenfolgen. |
| `last_heartbeat_at`, `first_seen_at` | Kohortenweites Heartbeat-Fenster, nützlich zum Bestätigen ruhiger Kohorten vor dem Löschen. |

`drain_intent` ist dauerhaft: Worker-Neustarts, das Stoppen aller Worker oder
Veralten der Kohorte setzen ihn nicht still auf `active` zurück. Nur ein
explizites `POST .../build-ids/resume` löscht `drain_intent` und `drained_at`.
So bleibt `rollout_status` auch ohne lebende Worker wahrheitsgetreu.

## Den Rollout untersuchen {#inspect-the-rollout}

Bestätigen Sie vor dem Leeren oder Löschen eines Builds, welche Kohorten auf
der Warteschlange noch erreichbar sind:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Derselbe Snapshot ist über die Betriebs-CLI und das Python SDK verfügbar:

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## Erste Umstellung: von unversioniert auf versioniert {#first-cutover-unversioned-to-versioned}

Eine bisher nur von unversionierten Workern bediente Warteschlange meldet eine
Kohorte mit `build_id: null` und `rollout_status: "active"`. Die erste Umstellung
führt daneben eine neue Kohorte mit Build-ID ein.

1. Stellen Sie die neue Worker-Flotte mit einer stabilen `build_id` (etwa
   `orders-worker-2026-04-22`) bereit, registriert über `POST /api/worker/register`.
2. Bestätigen Sie, dass beide Kohorten aktiv sind:
   ```bash
   dw task-queue:build-ids orders-critical --json
   ```
   Sowohl `null` als auch die neue `build_id` sollten `rollout_status: "active"`
   und eine `active_worker_count` größer als null melden.
3. Beginnen Sie das Leeren der unversionierten Kohorte, sobald die neuen Worker
   Arbeit verarbeiten:
   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```
   `drain_intent` wechselt für die unversionierte Kohorte zu `draining`.
   Noch laufende Worker verarbeiten ihre laufenden Tasks, übernehmen aber keine
   neuen. Künftige Registrierungen oder Heartbeats ohne `build_id` werden
   ebenfalls als auslaufend eingestuft.
4. Warten Sie, bis `active_worker_count` und `draining_worker_count` der
   unversionierten Kohorte beide null sind. Die Kohorte bleibt mit
   `drain_intent: "draining"` aufgelistet, damit Sie die dauerhafte Umstellung
   bestätigen können.

## Einen neuen Build als Canary testen {#canary-a-new-build}

Ein Canary ist ein zweiter Build, der einen kleinen Anteil des Verkehrs annimmt,
während der Haupt-Build weiterarbeitet. Verwenden Sie eine eigene `build_id`
für den Canary, damit der Zustand jeder Kohorte einzeln untersuchbar bleibt.

1. Stellen Sie Canary-Worker mit `build_id: orders-worker-2026-04-22-canary` bereit.
2. Prüfen Sie mit `list_task_queue_build_ids`, dass beide Kohorten
   `rollout_status: "active"` und die erwarteten Worker-Anzahlen melden.
3. Stufen Sie den neuen Build hoch, indem Sie mehr Worker mit der neuen
   `build_id` starten und die Anzahl im Haupt-Build verringern. Oder stufen Sie
   den Canary zurück, indem Sie ihn leeren:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

Der Server steuert die Task-Verteilung zwischen Kohorten nicht. Der Betrieb
bemisst die Kohortengrößen und nutzt die Abfrageverteilung zur Gewichtung des
Verkehrs. Der Build-ID-Rollout-Zustand erlaubt, noch übernahmefähige Kohorten zu
bestätigen und eine saubere Übergabe auszulösen, wenn eine Kohorte stoppen soll.

## Einen älteren Build leeren {#drain-an-older-build}

Leeren belässt bereits geleaste Tasks auf dem älteren Build, während neue Tasks
an andere aktive Kohorten der Warteschlange gehen:

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

Der Server setzt `drain_intent: "draining"` auf der Kohorte und markiert jeden
unter dieser `build_id` registrierten Worker bei seinem nächsten Heartbeat als
auslaufend. Der Aufruf ist idempotent: Wiederholen setzt `drained_at` nicht
zurück und ist daher für Automatisierung sicher.

Sobald eine Worker-Zeile als `draining` markiert ist, verleasen die
Workflow-, Aktivitäts- und Abfrage-Task-Routen keine neue Arbeit an diesen Worker.
Abfragen scheitern mit HTTP `409`, `poll_status: "draining"` und
`reason: "worker_draining"`, bis die Kohorte fortgesetzt wird.

`draining` gehört zum allgemeinen Abfrageantwortvertrag und ist kein Sonderfeld
nur fürs Leeren. Über dieselbe `poll_status`-Oberfläche sehen Worker normale
`leased`- und `empty`-Abfragen, Zulassungsergebnisse mit `throttled` und
typisierte `unavailable`-Koordinationsfehler anderer Abfragepfade.

Beobachten Sie das Leeren mit `list_task_queue_build_ids`, bis
`active_worker_count` und `draining_worker_count` auf null fallen. Dann zeigt
die Kohorte `rollout_status: "draining"` mit null Workern. Das bedeutet: Keine
lebenden Worker sind übrig, und die Betriebsabsicht hält weiterhin „geleert“
fest. Jetzt können Sie die Worker-Prozesse sicher stoppen und das Build-Artefakt löschen.

## Einen fehlerhaften Build zurücknehmen {#roll-back-a-bad-build}

Rollback kehrt den Ablauf um: Eine zuvor geleerte Kohorte fortsetzen, neuen
Verkehr zu ihr zurückleiten und den fehlerhaften Build leeren.

1. Setzen Sie die bekannte funktionierende Kohorte fort:
   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```
   Der Server löscht `drain_intent` und `drained_at` und setzt Worker-Zeilen,
   die unter dieser `build_id` noch Heartbeats senden, sofort auf `active`.
   So meldet der Leseendpunkt keinen auslaufenden Zustand mehr.
2. Leeren Sie die fehlerhafte Kohorte:
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```
3. Skalieren Sie den funktionierenden Build wieder hoch oder stellen Sie ihn
   erneut bereit, wenn seine Worker bereits gestoppt wurden. Unter seiner
   `build_id` registrierte Worker übernehmen die gelöschte Leerungsabsicht
   und werden als `active` eingestuft.

Fortsetzen ist ebenfalls idempotent. Ein erneuter Aufruf für eine bereits
aktive Kohorte ändert nichts und ist für automatisierte Rollbacks sicher.

## Referenz der Endpunkte und Befehle {#endpoints-and-commands-reference}

| Absicht | HTTP-Endpunkt | CLI | Python-SDK-Methode |
| --- | --- | --- | --- |
| Kohortenzustand untersuchen | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Kohorte als auslaufend markieren | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Zuvor geleerte Kohorte fortsetzen | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Leeren und Fortsetzen erwarten einen JSON-Inhalt mit `{"build_id": "..."}`
oder für die unversionierte Kohorte `{"build_id": null}`. Die CLI bezeichnet
die unversionierte Kohorte mit `--unversioned` und jeden anderen Build mit
`--build-id <value>`. Die Kombination beider Optionen scheitert sofort.

## Verwandte Referenzen {#related-references}

- [Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
  für `POST /api/worker/register`, das jedem Worker eine `build_id` zuordnet.
- [Task-Warteschlangenzulassung](/docs/polyglot/task-queue-admission) für
  Worker-Slot- und Zuweisungsbudgets neben dem Rollout-Zustand.
- [Server-API-Referenz](/docs/polyglot/server-api-reference) für alle
  Control-Plane-Routen samt erforderlichen Rollen und Protokoll-Headern.
- [CLI-Befehlsreferenz](/docs/polyglot/cli-reference) für Argumente und Optionen
  aller `dw task-queue:*`-Unterbefehle.
