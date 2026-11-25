---
sidebar_position: 7
title: Rollout von Worker-Build-IDs
description: Worker-Kohorten prüfen, den Build für neue Starts auswählen und Kapazität für ältere gepinnte Läufe erhalten.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [Worker-Build-ID, Worker entleeren, Worker-Rollback, Canary, unversionierte Worker]
---

# Rollout von Worker-Build-IDs

## Replay vor einem Build-Wechsel {#replay-before-changing-builds}

Prüfen Sie vor der Promotion eines Kandidaten repräsentative offene und kürzlich geschlossene Historien gegen dessen genauen Anwendungscode. Prüfen Sie vor einem Rollback die Historien des neueren Builds gegen das ältere Artefakt. Nutzen Sie die [Replay-Prüfung](../testing.md#replay-before-deployment); eine kompatible Routing-Kohorte oder erfolgreiche Integritätsprüfung allein beweist keine Replay-Kompatibilität.

Prüfen Sie mit diesem Leitfaden Worker-Kohorten und wählen Sie den Build für neue Workflow-Starts. Halten Sie kompatible Worker für bestehende Läufe bereit. Eine Promotion ändert die Auswahl für neue Starts; Drain verhindert neue Claims der Kohorte. Keine dieser Aktionen migriert vorhandene Läufe oder beweist, dass ein Build gelöscht werden kann; diese Entscheidung trifft die [abgesicherte Stilllegung](#retire-a-build-or-queue).

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

Reduzieren Sie Kohorten vorsichtig und prüfen Sie ihre eigenen Task-Zahlen, frischen Worker, Workflow-Typen, freien Slots und Drain-Absichten. Erhalten Sie Kapazität für geleaste sowie spätere Arbeit bestehender Läufe. Ein auf Signal, Timer, Aktivität oder Kind wartender Lauf kann derzeit keinen Workflow-Task haben und später den alten Build benötigen. Aktivitäten können andere gespeicherte Queues verwenden. Dieser Endpunkt erteilt weder eine sichere Stilllegungsentscheidung noch die Berechtigung, die letzte benötigte Kohorte auf null zu skalieren; nutzen Sie dafür die [abgesicherte Stilllegung](#retire-a-build-or-queue).

[Server #534](https://github.com/durable-workflow/server/issues/534) verfolgt die separate Scrape-/Scale-to-zero-Funktion. Hier ist kein eingebauter KEDA-/HPA-Trigger dokumentiert.

## Erster Wechsel von unversioniert zu versioniert {#first-cutover-unversioned-to-versioned}

1. Starten Sie neue Worker mit stabiler Build-ID und prüfen Sie Namespace, Queue, Workflow-Typen und frische Heartbeats.
2. Prüfen Sie beide Kohorten und die ursprünglichen Läufe. Neuere Namen oder Worker-Zahlen beweisen keine Kompatibilität.
3. Promoten Sie den neuen Build ausdrücklich, wenn neue Starts ihn auswählen sollen:

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. Erhalten Sie kompatible Worker für bestehende Historien. Promotion ändert alte Pins nicht; Drain ist keine Migration.
5. Legen Sie den alten Build mit der [abgesicherten Stilllegung](#retire-a-build-or-queue) still, sobald sein Inventar leer ist. Leere Task-Zähler oder null Registrierungen sind dafür kein Nachweis. Erhalten Sie das Build-Artefakt, solange ein Lauf es benötigen kann.

## Canary für einen neuen Build {#canary-a-new-build}

Der Server verteilt keinen prozentualen Traffic zwischen Build-Kohorten. Für neue Starts wählt er die zuletzt promotete Kohorte, sofern sie weder drainend noch zurückgerollt ist. Ohne Promotion folgt die einzige aktive Kohorte mit dem gewünschten Workflow-Typ, dann die einzige aktive Kohorte der Queue. Andernfalls bleibt der Lauf ungepinnt. Mehrere aktive Kohorten desselben Typs ohne Promotion bedeuten also keine gewichtete Verteilung.

Mehr Worker ändern Kapazität, nicht die promotete Startauswahl. Verwenden Sie für einen isolierten Canary eine separate Queue und leiten Sie ausgewählte Anwendungsstarts ausdrücklich dorthin. Bei einer Promotion auf der ursprünglichen Queue bleiben alte Worker für alte gepinnte Läufe notwendig.

## Eine Kette bei der nächsten Fortsetzung umstellen {#move-a-chain-at-its-next-continuation}

Wenn Server und SDK `continue_as_new_target_build` über das Worker-Protokoll 1.21 aushandeln, kann der Workflow beim Continue-as-new den promoteten Build wählen. Der Nachfolgelauf beginnt eine neue Historie mit den übergebenen Argumenten. Verwenden Sie diese Option, wenn der promotete Build die Argumente dekodieren und entgegennehmen kann. Ein gewöhnliches Continue-as-new übernimmt die Build-Bindung des vorherigen Laufs.

Beim Schließen des vorherigen Laufs wählt der Server die dauerhaft gespeicherte Promotion für den genauen Namespace, die Queue und den Workflow-Typ des Nachfolgers. Der Ziel-Build kann auf null Worker skaliert sein, sofern dem Server ein dauerhafter Nachweis vorliegt, dass der Build diesen Typ bedient. Ohne geeignete Promotion lehnt der Server den Übergang ab und lässt den aktuellen Lauf offen. Der Worker meldet `promoted_build_unavailable` über die normale Wiederholungsverarbeitung der Workflow-Aufgabe. Waterline zeigt die Ablehnung und den Zeitpunkt eines geplanten Wiederholungsversuchs an. Bei erfolgreichem Übergang werden beide Build-Bindungen in den Historien der verknüpften Läufe erfasst.

Halten Sie Worker des alten Builds vor, solange offene Läufe sie benötigen. Jede Kette wechselt, sobald ihre eigene Fortsetzung mit dieser Option gespeichert ist. Offene untergeordnete Läufe behalten ihre eigenen Build-Bindungen.

## Älteren Build drainen {#drain-an-older-build}

Drain verhindert neue Claims durch Workflow-, Aktivitäts- und Query-Polls dieser Kohorte; es verschiebt keine Tasks. Ein Poll eines drainenden Workers erhält HTTP409 mit `poll_status: "draining"` und `reason: "worker_draining"`. Bestehende Leases behalten ihre ursprüngliche Autorität.

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

Drainen Sie nicht allein deshalb, weil der neue Build eigene Arbeit übernehmen kann. Alte Läufe können danach warten. Bei verfrühtem Drain setzen Sie die Kohorte fort und stellen Worker mit dem ursprünglichen Build wieder her:

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

Drain oder das Stoppen aller Worker beweist nicht, dass das Build-Artefakt gelöscht werden darf. Drain bleibt der Notstopp: Er lehnt die Polls des Builds sofort ab, unabhängig davon, ob noch Arbeit an ihn gepinnt ist. Über das Entfernen entscheidet die [abgesicherte Stilllegung](#retire-a-build-or-queue).

## Build oder Queue stilllegen {#retire-a-build-or-queue}

Native Server 3.14.0 und neuer beantworten, ob ein Build oder eine Queue sicher entfernt werden kann, und verweigern die Stilllegung, solange eine aktive Abhängigkeit besteht. Setzen Sie voraus, dass `capabilities.worker_build_retirement` in `GET /api/cluster/info` exakt `true` ist; der veröffentlichte PHP-Server bedient diese Routen nicht. Verwenden Sie wie bei den anderen Build-ID-Routen ein Operator- oder Admin-Token und den Namespace.

| Absicht | HTTP-Endpunkt |
| --- | --- |
| Einen Build prüfen | `GET /api/deployments/{namespace}/{taskQueue}@{buildId}/retirement` (`@unversioned` für die unversionierte Kohorte) |
| Einen Build stilllegen | `POST /api/deployments/{namespace}/{taskQueue}@{buildId}/retire` |
| Alle Kohorten einer Queue prüfen | `GET /api/task-queues/{taskQueue}/retirement` |
| Eine Queue stilllegen | `POST /api/task-queues/{taskQueue}/retire` |

1. Promoten Sie den Ersatz-Build und lassen Sie die Worker des alten Builds weiterlaufen. Sie beenden die noch an ihn gepinnten Läufe, verzögerten Retries, Timer und fortgesetzten Ketten.
2. Prüfen Sie den alten Build, bis `retirable` den Wert `true` hat:

   ```bash
   dw task-queue:retirement orders-critical --namespace orders-prod --build-id orders-v1 --json
   ```

   Jeder Blocker nennt seinen exakten `count`, bis zu 20 Beispielidentitäten und eine `recovery`-Aktion: die Arbeit abschließen lassen oder Läufe, die Sie aufgeben, abbrechen oder beenden.
3. Legen Sie ihn still, optional gebunden an die geprüfte `observation.inventory_revision`:

   ```bash
   dw task-queue:retire orders-critical --namespace orders-prod --build-id orders-v1 \
     --expected-revision "$INVENTORY_REVISION"
   ```

4. Stoppen Sie die Prozesse des alten Builds erst, nachdem die Stilllegung erfolgreich war.

Ohne `--build-id` oder `--unversioned` wirken beide Befehle auf alle Kohorten der Queue. Die Befehle benötigen CLI 2.12.0 oder neuer; mit einer älteren CLI rufen Sie die HTTP-Routen direkt auf.

Das Inventar zählt offene, an den Build gepinnte Läufe (einschließlich wartender, fortgesetzter und Kind-Läufe), bereite, geleaste und verzögerte Tasks (noch nicht fällige Aktivitäts-Retries und Timer), offene Aktivitäten, ausstehende Update-Validierungen und bei einer Queue die Schedules, die Läufe auf ihr starten. Ein offener Lauf ohne gespeicherte Task-Queue macht das Inventar `incomplete`; dann ist keine Stilllegung möglich.

Die Prüfung ist eine Vorschau. Die Stilllegung zählt in derselben serialisierten Transition erneut, die auch Starts, Retries und die Task-Erzeugung verwenden, und schreibt nur, wenn nichts übrig ist. Eine abgelehnte Stilllegung liefert HTTP409 und ändert nichts; folgen Sie `expected_resolution` und prüfen Sie erneut.

| `reason` | Bedeutung |
| --- | --- |
| `unknown_deployment`, `unknown_task_queue` | Für das Ziel ist kein Worker registriert und kein Rollout gespeichert. |
| `selected_for_new_starts` | Neue Starts auf der Queue wählen noch diesen Build. Promoten Sie zuerst den Ersatz. |
| `inventory_incomplete` | Es gibt nicht zugeordnete offene Läufe. Fehlendes Inventar ist nie eine Erlaubnis zur Stilllegung. |
| `live_dependencies` | Mindestens ein Blocker hat einen Zähler ungleich null. |
| `inventory_changed` | Die `expected_inventory_revision` stimmt nicht mehr überein. |

Eine erfolgreiche Stilllegung liefert HTTP200 mit `outcome: "retired"`, `retired_at` und `retired_by`. Die Rollout-Absicht des Builds wird zum endgültigen Zustand `drained`: Er wird nie mehr für neue Starts gewählt, kann über den Deployment-Lebenszyklus weder promotet noch fortgesetzt werden, und seine Worker bleiben im Drain. Sind alle Kohorten einer Queue stillgelegt und ist kein aktiver Worker übrig, werden neue Starts dort mit `task_queue_draining` und `routing_status: "retired"` abgelehnt, bis sich eine neue aktive Kohorte registriert. Lauf-Pins, Aktivitäts-Queues, Historie und Fristen bleiben unverändert.

Zur Wiederherstellung setzt `dw task-queue:resume` (`POST /api/task-queues/{taskQueue}/build-ids/resume`) einen stillgelegten Build wieder auf `active`; die Stilllegung hat garantiert, dass er zu diesem Zeitpunkt keine Arbeit hatte.

## Fehlerhaften Build zurückrollen {#roll-back-a-bad-build}

Stellen Sie bekannte funktionierende Worker wieder her, setzen Sie deren Kohorte bei Bedarf fort und promoten Sie diesen Build für zukünftige Starts. Rollen Sie danach das fehlerhafte Deployment zurück. Rollback schreibt keine Pins um und liefert verbleibende Arbeit nicht an einen anderen Build. Erhalten Sie kompatible Worker für diese Läufe oder treffen Sie eine ausdrückliche Wiederherstellungsentscheidung auf Anwendungsebene.

Wiederholungsversuche, untergeordnete Läufe und gewöhnliches Continue-as-new übernehmen die ursprüngliche Build-Bindung. Verwenden Sie für Replay-kompatible Deployments eine stabile Build-Identität. Langlebige Ketten können bei der Fortsetzung [den promoteten Build wählen](#move-a-chain-at-its-next-continuation). Lassen Sie gespeicherte Kompatibilitätsfelder bei der Wiederherstellung unverändert.

## Endpunkte und Befehle {#endpoints-and-commands-reference}

| Absicht | HTTP-Endpunkt | CLI | Python-SDK-Methode |
| --- | --- | --- | --- |
| Kohorten prüfen | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Neue Starts auswählen | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drainen | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Fortsetzen | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |
| Stilllegung prüfen | `GET /api/task-queues/{taskQueue}/retirement`, `GET /api/deployments/{name}/retirement` | `dw task-queue:retirement` | — |
| Stilllegen | `POST /api/task-queues/{taskQueue}/retire`, `POST /api/deployments/{name}/retire` | `dw task-queue:retire` | — |

Promote-, Drain- und Resume-Routen akzeptieren `{"build_id":"orders-v2"}` oder für die unversionierte Kohorte `{"build_id":null}`. Die Retire-Routen nehmen einen optionalen Body `{"expected_inventory_revision":"..."}`. CLI-Mutationen verwenden entweder `--build-id` oder `--unversioned`, niemals beides.

Den vollständigen Lebenszyklus bieten `GET /api/deployments` und `POST /api/deployments/{name}/{promote,drain,resume,rollback}`. Verwenden Sie den zurückgegebenen Namen, etwa `orders-prod/orders-critical@orders-v2`, im ursprünglichen Namespace. Auf dem veröffentlichten Apache-Pfad muss der Schrägstrich des Namens erhalten bleiben: vollständiges Kodieren des zusammengesetzten Namens kann vor Erreichen der API eine Apache-HTML404 auslösen. Abgelehnte Aktionen liefern HTTP409 mit typisiertem `reason` und `blockages`-Array. Prüfen Sie `expected_resolution`; eine Ablehnung ist keine erfolgreiche Promotion. [Server #521](https://github.com/durable-workflow/server/issues/521) betrifft den unvollständigen aktuellen OpenAPI-Spiegel, keine neue Runtime oder Änderung eingefrorener Schemas.

## Weitere Referenzen {#related-references}

- [Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing)
- [Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
- [Task-Queue-Zulassung](/docs/polyglot/task-queue-admission)
- [Rollierende Upgrades](/docs/rolling-upgrades)
- [Server-API-Referenz](/docs/polyglot/server-api-reference)
- [CLI-Befehlsreferenz](/docs/polyglot/cli-reference)
