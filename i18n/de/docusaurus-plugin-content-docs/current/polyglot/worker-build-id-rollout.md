---
sidebar_position: 7
title: Rollout von Worker-Build-IDs
description: Worker-Kohorten prüfen, den Build für neue Starts auswählen und Kapazität für ältere gepinnte Läufe erhalten.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [Worker-Build-ID, Worker entleeren, Worker-Rollback, Canary, unversionierte Worker]
---

# Rollout von Worker-Build-IDs

Prüfen Sie mit diesem Leitfaden Worker-Kohorten und wählen Sie den Build für neue Workflow-Starts. Halten Sie kompatible Worker für bestehende Läufe bereit. Eine Promotion ändert die Auswahl für neue Starts; Drain verhindert neue Claims der Kohorte. Keine dieser Aktionen migriert vorhandene Läufe oder beweist, dass ein Build gelöscht werden kann.

[Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing) erklärt die Identität von Workflow-Tasks, Aktivitäten, Wiederholungen, Kindern und Continue-as-new. Eine Kohorte ist durch `(namespace, task_queue, build_id)` abgegrenzt. Registrierungen ohne `build_id` gehören zur unversionierten `null`-Kohorte.

## Vom Server gespeicherter Rollout-Zustand {#rollout-state-the-server-records}

| Feld | Bedeutung |
| --- | --- |
| `build_id` | Registrierte Build-Identität; `null` bezeichnet die unversionierte Kohorte. |
| `rollout_status` | `active`, `active_with_draining`, `draining`, `stale_only` oder `no_workers`. |
| `drain_intent`, `drained_at` | Dauerhafte Drain-Absicht und erster Zeitstempel; erneutes Drain verschiebt ihn nicht. |
| `promoted_at`, `rolled_back_at` | Gespeicherte Zeitstempel für Promotion und Rollback. |
| `new_start_selected` | Diese Kohorte ist die ausgewählte explizite Promotion. `false` schließt den unten beschriebenen Rückfall auf eine einzige Kohorte nicht aus. |
| `active_worker_count` | Frische, nicht drainende Registrierungen; weder freie Task-Slots noch ein Nachweis aller Workflow-Typen. |
| `draining_worker_count` | Frische, als drainend markierte Registrierungen ohne neue Claims. Sie müssen keine Lease halten. |
| `stale_worker_count` | Registrierungen mit einem Heartbeat älter als `stale_after_seconds`. |
| `total_worker_count` | Summe aktiver, drainender und veralteter Registrierungen. |
| `runtimes`, `sdk_versions` | In Registrierungen beobachtete Runtime- und SDK-Zeichenfolgen. |
| `last_heartbeat_at`, `first_seen_at` | Aktualität und Alter der Registrierung; kein Nachweis, dass der Build keine Läufe mehr hat. |
| `pending_workflow_tasks` | Workflow-Task-Zahlen und die unten erläuterte Diagnose. |

Die Drain-Absicht überlebt Worker-Neustarts, fehlende Worker und veraltete Heartbeats. Nur explizites Resume hebt sie auf; ein fehlender Worker wird nicht automatisch fortgesetzt.

## Rollout prüfen {#inspect-the-rollout}

Prüfen Sie vor Kapazitätsänderungen den genauen Namespace und die Queue:

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --namespace orders-prod --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token,
                  namespace="orders-prod") as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

Für zusätzliche Felder, die das Antwortmodell eines älteren SDKs möglicherweise nicht zeigt, ist der HTTP-Snapshot maßgeblich.

## Ausstehende Workflow-Tasks je Kohorte {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks` zählt ausschließlich Workflow-Tasks dieses Namespace und dieser Queue, gruppiert nach effektiver Task-Kompatibilität mit der Kompatibilität des Laufs als Rückfall. Es ist weder Aktivitätsrückstand noch Anzahl offener Läufe, Durchsatz oder Prozesslast.

| Unterfeld | Auslegung |
| --- | --- |
| `ready_count` | Workflow-Task-Zeilen mit Zustand `ready`. |
| `leased_count` | Workflow-Task-Zeilen mit Zustand `leased`. |
| `total_count` | `ready_count + leased_count`. |
| `status` | Bei null Tasks `idle`, sonst `pending` oder bei einem Nicht-null-Build ohne aktiven Worker `no_compatible_worker`. |
| `operator_visible_signal`, `message` | Diagnose fehlender kompatibler Worker; andernfalls können diese Werte null sein. |

Die unversionierte Kohorte erhält diese buildbezogene Diagnose nicht. Ein fehlendes Feld, eine fehlgeschlagene Anfrage oder eine veraltete Beobachtung bedeutet nicht null Tasks. Lesen Sie den Snapshot erneut und prüfen Sie Heartbeats und Typdeklarationen.

Beispielsweise kann der alte Build zwei bereite und einen geleasten Task haben, der neue dagegen keinen. Eine Queue-Gesamtsumme von drei zeigt nicht, welche Flotte Kapazität benötigt. Hat der alte Build keine aktiven Worker, stellen Sie dessen kompatible Kapazität wieder her oder setzen Sie ihn bei versehentlichem Drain gezielt fort. Neue Worker eines anderen Builds übernehmen alte Pins nicht. Prüfen Sie bei ausschließlich veralteten Registrierungen verlorene Prozesse oder Heartbeats, bevor Sie diese als Kapazität zählen.

Reduzieren Sie Kohorten vorsichtig und prüfen Sie ihre eigenen Task-Zahlen, frischen Worker, Workflow-Typen, freien Slots und Drain-Absichten. Erhalten Sie Kapazität für geleaste sowie spätere Arbeit bestehender Läufe. Ein auf Signal, Timer, Aktivität oder Kind wartender Lauf kann derzeit keinen Workflow-Task haben und später den alten Build benötigen. Aktivitäten können andere gespeicherte Queues verwenden. Dieser Endpunkt erteilt weder eine sichere Stilllegungsentscheidung noch die Berechtigung, die letzte benötigte Kohorte auf null zu skalieren.

[Server #519](https://github.com/durable-workflow/server/issues/519) verfolgt eine abgesicherte Stilllegungsentscheidung, [Server #534](https://github.com/durable-workflow/server/issues/534) die separate Scrape-/Scale-to-zero-Funktion. Diese Checkliste liefert beides nicht; hier ist kein eingebauter KEDA-/HPA-Trigger dokumentiert.

## Erster Wechsel von unversioniert zu versioniert {#first-cutover-unversioned-to-versioned}

1. Starten Sie neue Worker mit stabiler Build-ID und prüfen Sie Namespace, Queue, Workflow-Typen und frische Heartbeats.
2. Prüfen Sie beide Kohorten und die ursprünglichen Läufe. Neuere Namen oder Worker-Zahlen beweisen keine Kompatibilität.
3. Promoten Sie den neuen Build ausdrücklich, wenn neue Starts ihn auswählen sollen:

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. Erhalten Sie kompatible Worker für bestehende Historien. Promotion ändert alte Pins nicht; Drain ist keine Migration.
5. Entfernen Sie alte Kapazität erst, wenn ihre übrigen Abhängigkeiten unabhängig geklärt sind. Leere Task-Zähler oder null Registrierungen reichen nicht. Erhalten Sie Artefakt und Wiederherstellungsweg, solange ein Lauf den Build benötigen kann.

## Canary für einen neuen Build {#canary-a-new-build}

Der Server verteilt keinen prozentualen Traffic zwischen Build-Kohorten. Für neue Starts wählt er die zuletzt promotete Kohorte, sofern sie weder drainend noch zurückgerollt ist. Ohne Promotion folgt die einzige aktive Kohorte mit dem gewünschten Workflow-Typ, dann die einzige aktive Kohorte der Queue. Andernfalls bleibt der Lauf ungepinnt. Mehrere aktive Kohorten desselben Typs ohne Promotion bedeuten also keine gewichtete Verteilung.

Mehr Worker ändern Kapazität, nicht die promotete Startauswahl. Verwenden Sie für einen isolierten Canary eine separate Queue und leiten Sie ausgewählte Anwendungsstarts ausdrücklich dorthin. Bei einer Promotion auf der ursprünglichen Queue bleiben alte Worker für alte gepinnte Läufe notwendig.

## Älteren Build drainen {#drain-an-older-build}

Drain verhindert neue Claims durch Workflow-, Aktivitäts- und Query-Polls dieser Kohorte; es verschiebt keine Tasks. Ein Poll eines drainenden Workers erhält HTTP409 mit `poll_status: "draining"` und `reason: "worker_draining"`. Bestehende Leases behalten ihre ursprüngliche Autorität.

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

Drainen Sie nicht allein deshalb, weil der neue Build eigene Arbeit übernehmen kann. Alte Läufe können danach warten. Bei verfrühtem Drain setzen Sie die Kohorte fort und stellen Worker mit dem ursprünglichen Build wieder her:

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

Drain oder das Stoppen aller Worker beweist nicht, dass das Build-Artefakt gelöscht werden darf. Dieser Snapshot enthält keine abgesicherte Stilllegungsentscheidung.

## Fehlerhaften Build zurückrollen {#roll-back-a-bad-build}

Stellen Sie bekannte funktionierende Worker wieder her, setzen Sie deren Kohorte bei Bedarf fort und promoten Sie diesen Build für zukünftige Starts. Rollen Sie danach das fehlerhafte Deployment zurück. Rollback schreibt keine Pins um und liefert verbleibende Arbeit nicht an einen anderen Build. Erhalten Sie kompatible Worker für diese Läufe oder treffen Sie eine ausdrückliche Wiederherstellungsentscheidung auf Anwendungsebene.

Wiederholungen, Kinder und Continue-as-new erben den ursprünglichen Pin. Eine unbegrenzt fortgesetzte Kette wechselt nicht zum neu promoteten Build. Nutzen Sie für replaykompatible Deployments eine stabile Build-Identität oder beenden Sie die alte Kette und starten Sie unter der neuen Auswahl eine wirklich neue Instanz. Erzwingen Sie keine Migration durch Änderungen gespeicherter Kompatibilitätsfelder.

## Endpunkte und Befehle {#endpoints-and-commands-reference}

| Absicht | HTTP-Endpunkt | CLI | Python-SDK-Methode |
| --- | --- | --- | --- |
| Kohorten prüfen | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Neue Starts auswählen | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drainen | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Fortsetzen | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Diese Mutationen akzeptieren `{"build_id":"orders-v2"}` oder für die unversionierte Kohorte `{"build_id":null}`. CLI-Mutationen verwenden entweder `--build-id` oder `--unversioned`, niemals beides.

Den vollständigen Lebenszyklus bieten `GET /api/deployments` und `POST /api/deployments/{name}/{promote,drain,resume,rollback}`. Verwenden Sie den zurückgegebenen Namen, etwa `orders-prod/orders-critical@orders-v2`, im ursprünglichen Namespace. Auf dem veröffentlichten Apache-Pfad muss der Schrägstrich des Namens erhalten bleiben: vollständiges Kodieren des zusammengesetzten Namens kann vor Erreichen der API eine Apache-HTML404 auslösen. Abgelehnte Aktionen liefern HTTP409 mit typisiertem `reason` und `blockages`-Array. Prüfen Sie `expected_resolution`; eine Ablehnung ist keine erfolgreiche Promotion. [Server #521](https://github.com/durable-workflow/server/issues/521) betrifft den unvollständigen aktuellen OpenAPI-Spiegel, keine neue Runtime oder Änderung eingefrorener Schemas.

## Weitere Referenzen {#related-references}

- [Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing)
- [Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
- [Task-Queue-Zulassung](/docs/polyglot/task-queue-admission)
- [Rollierende Upgrades](/docs/rolling-upgrades)
- [Server-API-Referenz](/docs/polyglot/server-api-reference)
- [CLI-Befehlsreferenz](/docs/polyglot/cli-reference)
