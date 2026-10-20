---
sidebar_position: 15
title: Rollierende Upgrades
description: Ein selbstständig ausführbares rollierendes Upgrade von Durable-Workflow-Server-API-Knoten, Workern und Scheduler ohne Unterbrechung des laufenden Verkehrs durchführen.
tags:
  - operations
  - upgrades
  - rollouts
  - rollback
keywords:
  - rollierendes Upgrade
  - Rolloutsicherheit
  - Worker leerlaufen lassen
  - Schema-Fencing
  - Bereitschaftsvertrag
  - Rollback-Workflow
---

# Rollierende Upgrades {#rolling-upgrades}

Führen Sie ein rollierendes Upgrade aus, wenn Sie API-Knoten, Worker oder Scheduler ersetzen möchten, ohne die Bereitstellung offline zu nehmen. Dieser Vertrag deckt die kleine Clusterform des Leitfadens [Selbsthosting-Bereitstellungen](/docs/deployment) ab: zwei oder drei API-Knoten hinter einem Load Balancer, gemeinsames externes MySQL oder PostgreSQL, gemeinsames Redis, unabhängig skalierte Worker und genau ein Scheduler oder Wartungsprozess.

Ein rollierendes Upgrade wird unterstützt, wenn alle Garantien dieser Seite gelten. Verwenden Sie außerhalb dieser Grenzen stattdessen den dokumentierten Ablauf mit vollständiger Unterbrechung im Bereitstellungsleitfaden.

Rollenvokabular und Strukturmanifest dieses Vertrags stehen unter [Server-Rollentopologie](/docs/polyglot/server-role-topology). Dieser Leitfaden behandelt den Austausch der aktuellen Prozessklassen von `standalone_server` im laufenden Betrieb.

## Bedeutung eines rollierenden Upgrades {#what-rolling-upgrade-means-here}

Ein **rollierendes Upgrade** ersetzt Prozesse einzeln und lässt jeden vor dem Stoppen auslaufen, während die übrige Flotte weiter Verkehr bedient. Dadurch entsteht für die Gesamtbereitstellung keine Ausfallzeit, bei einem begrenzten Überlappungsfenster mit alten und neuen Prozessen.

Der Vertrag unterscheidet vier Prozessklassen der aktuellen Form `standalone_server`, jeweils mit eigenem Rolloutverhalten:

- **HTTP-/API-Knoten**: zustandslose HTTP-Serverprozesse, die derzeit die Rollen `api_ingress`, `control_plane`, `matching` und `history_projection` enthalten.
- **Worker**: SDK-Prozesse, die die Worker Plane abfragen und Aktivitäts- und Workflow-Aufgaben als `execution_plane` ausführen.
- **Scheduler / Wartungsprozess**: der einzelne Prozess, der Zeitpläne auslöst sowie Aktivitätstimeouts und Historienaufbewahrung als Rolle `scheduler` betreibt.
- **Bootstrap**: der einmalige Prozess für Datenbankmigrationen und das Anlegen des Standard-Namespace.

API-Knoten und Worker werden unabhängig ausgetauscht. Der Scheduler ist ein Singleton: Sie stoppen den alten vor dem Start des neuen. Die übrige Bereitstellung bedient während dieser Lücke weiter Verkehr.

## Regeln für kompatiblen Versionsversatz {#compatible-version-skew-rules}

Das Überlappungsfenster ist die Zeit, in der mehr als ein Serverimage, mehr als eine Workflow-Paketversion oder Worker-SDK-Version aktiv ist. Es muss jede Regel dieses Abschnitts erfüllen.

### Serverimage und Workflow-Paket {#server-image-and-workflow-package}

- **Nur benachbarte Versionen.** Während des Upgrades muss jeder API-Knoten und andere Serverprozess ein Image verwenden, dessen Workflow-Paket dieselbe Hauptversion wie das bisherige Clusterpaket hat und höchstens eine Nebenversion von jedem anderen aktiven Prozess entfernt liegt. Das Überspringen einer Hauptversion erfordert ein Upgrade mit vollständiger Unterbrechung.
- **Vorwärtsadditive Migrationen.** Jede Schemaänderung von Durable Workflow v2 ist innerhalb einer Hauptversion additiv. Neue Knoten dürfen keine noch nicht migrierte Spalte oder Tabelle benötigen. Alte Knoten dürfen durch eine neue, von ihnen nicht gelesene Spalte nicht ausfallen. Die folgenden [Regeln zur Migrationsreihenfolge](#schemabootstrap-ordering) setzen dies durch.
- **Benachbarte Control-Plane- und Worker-Protokollversionen.** Jeder Knoten veröffentlicht seine unterstützten Bereiche von `control_plane.version` und `worker_protocol.version` über `GET /api/cluster/info`. Beim Upgrade muss der unterstützte Bereich des neuen Images mit dem jedes aktiven alten Knotens überlappen. Ermitteln Sie den Bereich vor dem Rollout und brechen Sie bei fehlender Überlappung ab.

### Worker-SDK und Build-Identität {#worker-sdk-and-build-identity}

- **Worker kennzeichnen jeden Build.** Jeder Worker, der an einem rollierenden Upgrade teilnehmen kann, muss sich über `POST /api/worker/register` mit stabiler `build_id` registrieren. Die unversionierte Kohorte (`build_id: null`) ist der Standard vor dem Rollout. Der [Leitfaden zum Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout) erklärt die erste Umstellung.
- **Fingerabdrücke der Workflow-Definition bleiben festgelegt.** Serverimages mit `DW_V2_PIN_TO_RECORDED_FINGERPRINT=true` (Standard) binden laufende Läufe weiter an den bei `WorkflowStarted` aufgezeichneten Fingerabdruck der Workflow-Definition. Ein neuer Worker mit anderem Fingerabdruck für denselben Workflow lehnt die Übernahme dieser Läufe ab, bis sie abgeschlossen sind.
- **Zulassungsverhalten überlappender Builds.** Wählen Sie vor Beginn die Einstellung [`DW_V2_FLEET_VALIDATION_MODE`](/docs/polyglot/server-config-reference). `warn` lässt den Rollout weiterlaufen, selbst wenn kein aktiver Worker den erforderlichen Kompatibilitätsmarker unterstützt. `fail` blockiert die Zuteilung und lässt den Bereitschaftsvertrag in diesem Fenster sicher ablehnen. Produktionsrollouts mit erforderlicher sauberer Umstellung sollten `fail` verwenden.

## Schema-/Bootstrap-Reihenfolge {#schemabootstrap-ordering}

Schemaänderungen erfolgen in einem einzigen Bootstrap-Durchlauf. Die Reihenfolge ist entscheidend.

1. **Bootstrap zuerst und genau einmal ausführen.** Führen Sie `php artisan server:bootstrap --force` oder die Entsprechung im veröffentlichten Image aus einem Container aus, bevor Sie einen neuen API-Knoten, Worker oder Scheduler starten. Bootstrap führt `migrate` und das Anlegen des Standard-Namespace aus. Es übernimmt Workflow-Paketmigrationen, deren Tabellen auf der Verbindung bereits vorhanden sind.
2. **Neues Schema muss mit altem Code rückwärtskompatibel sein.** Jede v2-Migration dieses Veröffentlichungspfads ist additiv: neue Tabellen, Spalten oder Indizes. Alte API-Knoten und Worker laufen gegen das neue Schema weiter.
3. **Neuen Code erst nach abgeschlossenem Bootstrap starten.** Rollen Sie das neue Serverimage erst aus, wenn Bootstrap erfolgreich beendet wurde. Neue API-Knoten und Worker dürfen die frisch migrierten Tabellen voraussetzen. Ihr Start vor Bootstrap-Abschluss ist die häufigste Ursache eines 5xx-Anstiegs während der Umstellung.
4. **Bootstrap ist idempotent.** Wiederholen ist sicher. Schlägt Bootstrap teilweise fehl, beheben Sie den zugrunde liegenden Fehler und führen Sie es erneut aus. Das Migrationsprotokoll setzt am bisherigen Stand fort, und das Namespace-Anlegen bleibt wirkungslos, wenn die Zeile existiert.

Eine Migration, die einen Server früher als einen anderen erreicht, DARF die Bereitschaftsschnittstelle NICHT beschädigen. Entdecken Sie bei der Planung eine nichtadditive Änderung, verwenden Sie für diese Veröffentlichung ein Upgradefenster mit vollständiger Unterbrechung und kehren Sie bei der nächsten zu rollierenden Upgrades zurück.

## Auslaufen und Zulassung im Überlappungsfenster {#drain-and-admission-during-the-overlap-window}

Drei Zulassungsschnittstellen setzen die Sicherheit des Überlappungsfensters automatisch durch:

- **Zulassung beim Start.** Jeder Serverprozess lädt beim Start `BackendCapabilities`, `LongPollCacheValidator`, `WorkflowModeGuard` und den Bereitschaftsvertrag. Ein Prozess, dessen Backend oder Cache den v2-Vertrag nicht erfüllen kann, meldet sich nicht als bereit.
- **Worker-Kompatibilität.** Bei `DW_V2_FLEET_VALIDATION_MODE=fail` und ohne aktiven Worker mit dem erforderlichen Kompatibilitätsmarker im Verbindungs- und Warteschlangenumfang der Aufgabe blockiert die Matching-Rolle die Zuteilung. Die Zustandsprüfung `worker_compatibility` wechselt von `warning` zu `error`. Aufgaben bleiben bereit und sichtbar und werden niemals verworfen. Der Bereitschaftsvertrag liefert auf diesem Knoten 503, sodass der Load Balancer ihn aus der Rotation nimmt.
- **Routingsicherheit.** Eine bereite Aufgabe ohne aktiven Worker für ihre erforderliche Kompatibilität bleibt erhalten und wird unter der Rückstaumetrik `compatibility_blocked_runs` gezählt. Routingsicherheit führt niemals stillschweigend zu Aufgabenverlust. Die At-least-once-Ausführungsgarantie gilt auch nach dem Auslaufen des Routings.

Lassen Sie alte Worker-Kohorten auslaufen, sobald neue Worker verfügbar werden, um das Überlappungsfenster kurz zu halten. Verwenden Sie den Ablauf [Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout):

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

`drain_intent` der Kohorte wechselt auf `draining`. Worker dieses Builds schließen laufende Arbeit weiter ab, übernehmen aber keine neuen Aufgaben. Warten Sie, bis `active_worker_count` und `draining_worker_count` der Kohorte null erreichen, bevor Sie die alten Worker-Prozesse stoppen.

Der Scheduler betreibt keine langlebige Aufgabenwarteschlange und benötigt daher kein Worker-Auslaufen. Stoppen Sie den alten Schedulercontainer, führen Sie Bootstrap aus, falls noch nicht geschehen, und starten Sie den neuen. Das Fenster dazwischen ist durch die Startdauer des neuen Containers begrenzt. Zeitplanauslösung setzt beim nächsten Tick aus dem gespeicherten Zustand fort.

Führt der Rollout außerdem eine dedizierte Matching-Rollenbereitstellung ein, machen Sie diese Topologieänderung explizit. Nehmen Sie nicht an, dass jeder Ausführungsknoten weiterhin umfassende Durchläufe über bereite Aufgaben erledigt. [Aufgabenabgleich und -zuteilung](/docs/polyglot/task-matching-dispatch) beschreibt die Form mit `workflow:v2:repair-pass --loop` und `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0`. Prüfen Sie den aktiven Knotenvertrag über `GET /api/cluster/info`: `topology.current_shape` sollte weiterhin zur umgestellten Bereitstellung passen, `topology.current_roles` zum dokumentierten Rollenbündel dieses Knotens. `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape` und `topology.matching_role.wake_owner` sollten den erwarteten Verantwortlichen für das breite Wecken bereiter Aufgaben zeigen. Der Standard meldet `queue_wake_enabled: true`, `shape: "in_worker"` und `wake_owner: "worker_loop"`. Dedizierte Matching-Rollouts setzen Ausführungsknoten auf `queue_wake_enabled: false`, `shape: "dedicated"` und `wake_owner: "dedicated_repair_pass"`.

## Bereitschaft und Umstellung {#readiness-and-cutover}

Entscheiden Sie anhand des Bereitschaftsvertrags, wann ein Knoten Verkehr erhält.

- `GET /api/health` belegt, dass der Prozess HTTP bedient.
- `GET /api/ready` belegt, dass der Prozess seine konfigurierten Laufzeitabhängigkeiten verwenden kann, einschließlich Migrationen, Standard-Namespace und bei `DW_V2_FLEET_VALIDATION_MODE=fail` der Worker-Kompatibilitätszulassungsprüfung.
- `GET /api/cluster/info` belegt, dass ein authentifizierter Client Build-Identität, Control-Plane-Protokoll, Worker-Protokoll, Nutzdaten-Codecs und Serverfähigkeiten ermitteln kann.
- `POST /api/worker/register` belegt, dass Worker sich im erwarteten Namespace und in der erwarteten Aufgabenwarteschlange authentifizieren können.

Umstellungsreihenfolge für einen API-Knoten:

1. Nehmen Sie den Knoten aus der Load-Balancer-Rotation. Der einfachste Weg ist, die Bereitschaftsprüfung des Load Balancers fehlschlagen zu lassen, indem Sie den Vorstarthook des neuen Images vor dem Start des neuen Containers stoppen.
2. Lassen Sie laufende HTTP-Anfragen auslaufen. Die meisten Clients wiederholen bei einem Verbindungsabbruch. Langlebige Verbindungen wie Worker-Long-Polls verbinden sich mit der übrigen Flotte neu.
3. Stoppen Sie den alten Container und starten Sie den neuen.
4. Warten Sie auf 200 von `GET /api/ready` und darauf, dass `GET /api/cluster/info` die neue Build-Identität ausweist. Ändert der Rollout die Matching-Topologie, bestätigen Sie vor der Verkehrsrückgabe außerdem, dass `topology.matching_role.task_dispatch_mode`, `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`, `topology.matching_role.wake_owner`, `topology.matching_role.partition_primitives` und `topology.matching_role.backpressure_model` zur geplanten Bereitstellung passen. Verwenden Sie `/api/system/operator-metrics` für denselben knotenlokalen Matching-Rollenvertrag zusammen mit aktuellen Rückstau-, Reparatur- und Worker-Zählern des antwortenden Prozesses.
5. Nehmen Sie den Knoten wieder in die Rotation auf.

Wiederholen Sie dies Knoten für Knoten. Tauschen Sie den nächsten erst aus, wenn der vorherige wieder in Rotation ist und Verkehr fehlerfrei bedient.

Für Worker erfolgt die Umstellung pro Kohorte:

1. Starten Sie die neue Worker-Kohorte mit einer neuen `build_id`.
2. Bestätigen Sie, dass beide Kohorten aus `dw task-queue:build-ids <queue> --json` den Wert `rollout_status: "active"` und eine `active_worker_count` größer null melden.
3. Lassen Sie die alte Kohorte mit `dw task-queue:drain` auslaufen.
4. Warten Sie, bis `active_worker_count` und `draining_worker_count` der alten Kohorte null erreichen.
5. Stoppen Sie die alten Worker-Prozesse.

## Rollback {#rollback}

Jeder Schritt ist umkehrbar. Planen Sie das Rollback vor dem Beginn.

- **Bootstrap-Rollback.** v2-Migrationen sind über den normalen Laravel-Pfad `down()` umkehrbar. Wird eine Migration zurückgenommen, die das neue Image benötigt, müssen zuerst alle neuen Knoten gestoppt werden. Sonst sieht der neue Code eine fehlende Spalte, und der Bereitschaftsvertrag liefert dort 503. Die meisten Rollbacks müssen wegen additiver Schemaänderungen keine Migration zurücknehmen.
- **API-Knoten-Rollback.** Stoppen Sie den neuen Container und starten Sie den alten auf demselben Knoten neu. Nehmen Sie ihn beim Start aus der Rotation und nach erfolgreichem `GET /api/ready` wieder auf. Wiederholen Sie dies für weitere aktualisierte API-Knoten. Alter Code liest das neue Schema weiterhin fehlerfrei, weil die Schemaänderung additiv war.
- **Worker-Rollback.** Nehmen Sie die zuvor auslaufende Kohorte wieder auf, lassen Sie die fehlerhafte Kohorte auslaufen und skalieren Sie den bekannt funktionierenden Build wieder hoch:

  ```bash
  dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
  dw task-queue:drain  orders-critical --build-id orders-worker-2026-04-22
  ```

  Wiederaufnahme löscht `drain_intent` und `drained_at`. Jeder Worker, der unter der wiederaufgenommenen `build_id` Heartbeats sendet, wechselt beim nächsten Poll zurück zu `active`. Beide Aufrufe sind idempotent.

Zeigt der Rollout ein nichtadditives Schemaproblem, verwenden Sie ein Fenster mit vollständiger Unterbrechung für das Rollback, führen Korrekturmigrationen aus und planen neu.

## Überprüfung durch Operatoren {#operator-verification}

Prüfen Sie jede Rolloutphase über Operatorschnittstellen.

| Frage | Schnittstelle |
| --- | --- |
| Ist Bootstrap abgeschlossen? | Exit-Code 0 von `php artisan server:bootstrap --force`; `migrate:status` zeigt alle Migrationen als ausgeführt. |
| Ist der neue Knoten bereit? | `GET /api/ready` liefert 200; `GET /api/cluster/info` meldet den neuen Build. |
| Ist die Kompatibilitätszulassung gesund? | `GET /api/system/operator-metrics` zeigt in `workers.fleet`, `workers.active_workers` und `workers.active_workers_supporting_required` übereinstimmend mindestens einen unterstützenden Worker für jeden erforderlichen Kompatibilitätsmarker. |
| Schreitet das Worker-Auslaufen voran? | `dw task-queue:build-ids <queue> --json` zeigt sinkende `active_worker_count` und `draining_worker_count` der auslaufenden Kohorte. |
| Ist das Routing sicher? | `GET /api/system/operator-metrics` hält `backlog.compatibility_blocked_runs` und `backlog.max_compatibility_blocked_age_ms` nahe null; die Zustandsprüfung `worker_compatibility` ist nicht in `error`. |
| Ist der Scheduler aufgeholt? | `GET /api/system/operator-metrics` zeigt `schedules.missed` mit dem Wert 0 und `schedules.oldest_overdue_at` als null-Wert. |
| Häufen sich feststeckende Läufe? | `GET /api/system/operator-metrics` hält `runs.repair_needed` und `runs.max_repair_needed_age_ms` nahe dem Ausgangsniveau vor dem Rollout. |

`dw system:operator-metrics --json` stellt dieselbe Momentaufnahme der Operatormetriken für die eigenständige Serverflotte auf der Konsole bereit. Operatoren können die zu ihrem Ablauf passende Schnittstelle wählen. Ein separat bereitgestellter Waterline-Dienst liest denselben serververwalteten Rolloutzustand über das PHP-SDK unter `/waterline/api/v2/health` und `/waterline/api/stats`. Halten Sie Endpunkt, Namespace und Servertoken auf die aktualisierte Flotte ausgerichtet. Eingebettete Laravel-Bereitstellungen stellen diese Waterline-Routen stattdessen über ihr prozessinternes Paket bereit. Server-API und CLI bleiben in beiden Fällen verfügbar, wie in den [Betriebsgrenzen für Operatoren](/docs/operator-operating-envelope) dokumentiert.

## Fehlermodi und Maßnahmen {#failure-modes-and-what-to-do}

| Symptom | Wahrscheinliche Ursache | Maßnahme |
| --- | --- | --- |
| Neuer API-Knoten besteht `GET /api/ready` nach dem Start nicht | Bootstrap ist nicht abgeschlossen oder `DW_V2_FLEET_VALIDATION_MODE=fail` ohne bereits aktiven kompatiblen Worker | Bootstrap wiederholen; eine kompatible Worker-Kohorte starten, bevor der API-Knoten wieder in Rotation kommt. |
| Zustandsprüfung `worker_compatibility` wechselt während des Rollouts zu `error` | Kein aktiver Worker unterstützt den erforderlichen Kompatibilitätsmarker | Weitere Worker unter einer unterstützenden `build_id` starten; eine zuvor auslaufende Kohorte wieder aufnehmen, wenn Rollback angemessen ist. |
| `backlog.compatibility_blocked_runs` und `max_compatibility_blocked_age_ms` steigen | Aufgaben warten auf einen Marker, den kein aktiver Worker unterstützt | Wie oben. Aufgaben bleiben erhalten und werden automatisch neu zugeteilt, sobald ein kompatibler Worker einen Heartbeat sendet. |
| `dw task-queue:drain` meldet Erfolg, aber Worker übernehmen weiter Aufgaben | Der Worker-Prozess hat nach der Drain-Anforderung keinen Heartbeat gesendet | Einen Heartbeatzyklus warten. Bleibt die Kohorte aktiv, Worker-Prozess neu starten, damit er die Auslaufabsicht übernimmt. |
| Zeitpläne lösen nach Schedulerneustart nicht mehr aus | Alter und neuer Scheduler sind beide gestoppt | Neuen Schedulercontainer starten; beim nächsten Abruf der Operatormetriken prüfen, dass `schedules.missed` wieder 0 erreicht. |

Ist ein Symptom hier nicht aufgeführt, behandeln Sie den Rollout als fehlgeschlagen: keine neuen Prozesse hinzufügen, gestartete neue Kohorten auslaufen lassen und vor weiterer Fehlersuche den vorherigen Build wiederherstellen.

## Verwandte Referenzen {#related-references}

- [Selbsthosting-Bereitstellungen](/docs/deployment) für die vorausgesetzten Bereitstellungsformen.
- [Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout) für kohortenbezogene Aufrufe zum Auslaufen und Wiederaufnehmen.
- [Betriebsgrenzen für Operatoren](/docs/operator-operating-envelope) für Diagnose-, Warteschlangen- und Neuaufbauvertrag, den Operatoren neben Rolloutsignalen lesen.
- [Serverkonfigurationsreferenz](/docs/polyglot/server-config-reference) für Umgebungsvariablen zur Rolloutsicherheit (`DW_V2_FLEET_VALIDATION_MODE`, `DW_V2_PIN_TO_RECORDED_FINGERPRINT`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_MULTI_NODE`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_V2_TASK_REPAIR_*`).
- [Server-API-Referenz](/docs/polyglot/server-api-reference) für Bereitschafts-, Clusterinfo- und Operatormetrikendpunkte zur Prüfung jeder Rolloutphase.
