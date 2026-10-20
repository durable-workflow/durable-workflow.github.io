---
title: Server-Rollentopologie
description: Das Topologiemanifest unter /api/cluster/info für Server-Rollen, Skalierungsgrenzen, Ausfallbereiche und Migrationsschritte von Durable Workflow auswerten.
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - Durable Workflow Rollentopologie
  - Cluster-Info-Topologie
  - Server-Skalierungsgrenzen
  - getrennte Steuerung und Ausführung
---

# Server-Rollentopologie {#server-role-topology}

## Zweck dieses Manifests {#why-this-manifest-exists}

`GET /api/cluster/info` veröffentlicht das `topology`-Manifest des Servers mit
dem Schema `durable-workflow.v2.role-topology`. Behandeln Sie es als öffentlichen
Vertrag für Rollennamen, unterstützte Bereitstellungsformen, dauerhafte
Schreibberechtigungen, erwartete Ausfallbereiche, Skalierungsgrenzen und den
geordneten Migrationspfad von der heutigen eigenständigen Distribution zu einer
Topologie mit getrennter Steuerung und Ausführung.

Verwenden Sie diese Seite, um die Server-Form aus Skripten, Dashboards,
Betriebsanleitungen oder Rollout-Automatisierung zu beurteilen. Die rohe
HTTP-Oberfläche beschreibt die [Server-API-Referenz](/docs/polyglot/server-api-reference),
die Einrichtung der [Server-Leitfaden](/docs/polyglot/server).

## Das Topologiemanifest lesen {#reading-the-topology-manifest}

Das Objekt `topology` beantwortet diese Vertragsfragen:

| Feldfamilie | Beantwortete Frage |
| --- | --- |
| `schema`, `version` | Welche Revision des Topologievertrags lesen Sie? |
| `supported_shapes` | Welche Produkt-Bereitstellungsformen sind zulässig? |
| `role_vocabulary` | Welche Rollennamen sind in diesem Vertrag gültig? |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | Was tut der antwortende Knoten gerade? |
| `matching_role.*` | Wer verantwortet das breite Aufwecken bereiter Tasks, welche Routing-Achsen sind festgelegt und welche Zuweisungs-/Rückstaukontrolle ist aktiv? |
| `role_catalog`, `authority_surfaces` | Welche Schnittstellen und dauerhaften Änderungsoberflächen gehören jeder Rolle? |
| `shape_assignments` | Welche Prozessklassen sind je unterstützter Form erlaubt? |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | Welche Rolle darf was schreiben, wie fällt sie aus und nach welcher Lastachse skaliert sie? |
| `supported_topologies`, `migration_path` | Welche Bereitstellungsfamilien unterstützt das Produkt, und welcher geordnete Pfad führt von der eigenständigen Form zu stärker isolierten Rollen? |
| `kernel_invariants` | Welche Garantien des dauerhaften Kerns muss die Rollentrennung unabhängig von der laufenden Form erhalten? |

`current_shape`, `current_process_class` und `current_roles` beschreiben den
Knoten, der die HTTP-Anfrage beantwortet hat, nicht die gesamte Flotte.
Verwenden Sie `current_process_class` als deklarierte Knotenidentität und
vergleichen Sie zur Prüfung `current_roles` mit den Prozessklassenbündeln in
`shape_assignments`.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## Rollenvokabular {#role-vocabulary}

Die öffentlichen Rollennamen legt `topology.role_vocabulary` fest:

| Rolle | Verantwortung |
| --- | --- |
| `api_ingress` | Externen HTTP-Verkehr einschließlich Erkennungs- und Control-Plane-Einstiegspunkten annehmen. |
| `control_plane` | Workflows starten, signalisieren, aktualisieren, reparieren, abbrechen, terminieren, archivieren und sonstigen Lebenszykluszustand ändern. |
| `matching` | Bereite Arbeit finden, Task-Leases besitzen und Zuweisungsdruck koordinieren. |
| `history_projection` | Dauerhafte Historie speichern und abgeleitete Laufzusammenfassungen und Exporte pflegen. |
| `scheduler` | Zeitpläne auslösen und Zustand geplanter Läufe speichern. |
| `execution_plane` | Workflow- und Aktivitäts-Tasks ausführen. |

Automatisierung sollte genau diese Kennungen als stabiles Vokabular behandeln.

## Unterstützte Bereitstellungsformen {#supported-deployment-shapes}

`topology.supported_shapes` benennt zulässige Produkt-Bereitstellungsformen:

| Form | In `shape_assignments` veröffentlichte Prozessklassen | Vertragsbedeutung |
| --- | --- | --- |
| `embedded` | `application_process` | Ein Anwendungsprozess verantwortet Control Plane, Matching, Historienprojektion, Scheduler und Ausführung. |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | Die aktuelle eigenständige Server-Distribution: HTTP-Eingang/Control Plane auf dem Server-Knoten, Scheduler als eigene Prozessklasse und Ausführung auf Worker-Knoten. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | Derselbe Produktvertrag, aufgeteilt in engere rollenspezifische Prozessklassen, sodass Skalierungs- und Ausfallgrenzen je Teilsystem verschoben werden können. |

`split_control_execution` ist eine unterstützte Topologie, keine zweite Engine
oder andere API. Dieselbe Erkennungsoberfläche beschreibt eigenständige und
rollengetrennte Formen.

## Identität des aktuellen Knotens {#current-node-identity}

Verwenden Sie `current_shape`, `current_process_class`, `current_roles` und
`execution_mode` gemeinsam:

- `current_shape` identifiziert den Formvertrag des antwortenden Knotens.
- `current_process_class` identifiziert dessen deklarierte Prozessklasse.
- `current_roles` identifiziert dessen aktives Rollenbündel.
- `execution_mode` unterscheidet `remote_worker_protocol` von `local_queue_worker`.

Bei der eigenständigen Server-Distribution bleibt `current_shape` auch dann
`standalone_server`, wenn `DW_MODE=embedded` die Ausführung auf lokale
Warteschlangen-Worker umstellt. Dann wechselt `execution_mode` zu
`local_queue_worker`, während der HTTP-Knoten den eigenständigen Rollenvertrag behält.

### Zugriffsschranke für gehostete Routen {#hosted-route-gating}

Derselbe Topologievertrag sagt Aufrufern, wann ein Knoten gehosteten Verkehr
ganz ablehnen soll. Authentifizierte gehostete Routen werden strikt abgelehnt,
sofern der antwortende Knoten nicht das heute dafür erforderliche
HTTP-Steuerungsbündel `api_ingress` plus `control_plane` meldet.

Antworten falscher Knoten liefern `503` mit `reason: "topology_role_unavailable"`
und den für eine Umleitung nötigen Topologieangaben:

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

Diese Schranke läuft auf gehosteten Routen vor der Namespace-Auflösung. Eine
an `scheduler_node`, `matching_node` oder `execution_node` gesendete Anfrage
erfährt daher vor der Umleitung zur korrekten Knotenklasse nicht, ob der benannte
Namespace existiert. `GET /api/health`, `GET /api/ready` und authentifiziertes
`GET /api/cluster/info` bleiben verfügbar, damit Automatisierung die Knotenform
vor einem erneuten Versuch an anderer Stelle erkennen kann.

### Workflow-Bootstrap-Schranke {#workflow-bootstrap-gate}

Eine zweite Routenschranke lehnt Anfragen strikt ab, wenn der antwortende Knoten
ungelöste Workflow-v2-Bootstrap-Blocker hat. Solange `checks.workflow_v2.status`
`blocked` ist, liefern authentifizierte Workflow-Start-/Änderungs-,
Zeitplanänderungs-, Brückenadapter- und Worker-Protokollrouten `503` mit
`reason: "workflow_v2_blocked"` sowie:

- `blocked_by`: die geordnete Liste vorgelagerter Bereitschaftsblocker, etwa `migrations`.
- `remediation`: die Betriebsanweisung zur Behebung der genannten Blocker,
  gespiegelt aus `/api/ready` `checks.workflow_v2.remediation`.

Die Bootstrap-Schranke sitzt an derselben Stelle wie die Topologieschranke:
nach Rollen- und Protokollversionsprüfung, vor Namespace-Auflösung. Eine
blockierte Anfrage erfährt daher niemals die Namespace-Existenz.

Geschützt sind Workflow-Routen wie `/api/workflows`, Zeitplanänderungen wie
`POST /api/schedules`, `PUT /api/schedules/{scheduleId}`,
`DELETE /api/schedules/{scheduleId}`, `/pause`, `/resume`, `/trigger` und
`/backfill`, Brückenadapter-Routen wie `/api/bridge-adapters/webhook/{adapter}`
und Worker-Protokollrouten unter `/api/worker`.

Zeitplan-**Lesezugriffe** (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`,
`GET /api/schedules/{scheduleId}/history`) sind bewusst ausgenommen, damit der
Betrieb während der Wiederherstellung den Zeitplanzustand untersuchen kann.
Worker-Protokollrouten liefern dieselbe Bootstrap-Schranken-Nutzlast in der
Worker-Protokoll-Envelope. Worker-SDKs können damit anhand desselben
maschinenlesbaren `reason: "workflow_v2_blocked"` wie die Control Plane verzweigen.

## Vertrag der Matching-Rolle {#matching-role-contract}

`topology.matching_role` legt den aktuellen Matching- und Aufweckzustand des
antwortenden Knotens fest:

| Feld | Bedeutung |
| --- | --- |
| `queue_wake_enabled` | Ob kurzlebige Warteschlangen-Aufwecksignale aktuell aktiviert sind. |
| `shape` | Welche Matching-Bereitstellungsform der Knoten meldet: `in_worker` oder `dedicated`. |
| `wake_owner` | Welche Implementierung die breite Aufwecksuche aktuell verantwortet: `worker_loop` oder `dedicated_repair_pass`. |
| `task_dispatch_mode` | Ob die Zuweisung über `poll`-gesteuerte entfernte Worker oder `queue`-gesteuerte lokale Ausführung läuft. |
| `partition_primitives` | Festgelegte Routing-Achsen der Matching-Rolle in Reihenfolge: `connection`, `queue`, `compatibility`, `namespace`. |
| `backpressure_model` | Die von der Matching-Rolle erzwungene dauerhafte Zulassungsgrenze. v2 meldet aktuell `lease_ownership`. |
| `discovery_limits` | Der festgelegte, im Workflow-Paket einkompilierte numerische Matching-Vertrag: `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` und `activity_task_lease_seconds`. |

So unterscheiden Betrieb und Automatisierung „Matching existiert, aber
Aufwecken ist beeinträchtigt“ von „dieser Knoten nutzt bewusst einen anderen
Zuweisungsmodus“. Sie erhalten dasselbe Routing- und Rückstaukontrollvokabular,
das der Server selbst in Betriebsmetriken veröffentlicht.

`discovery_limits` ist der numerische Matching-Vertrag: `poll_batch_cap`
legt die maximale Anzahl bereiter Task-Zeilen je Abfrage fest,
`availability_ceiling_seconds` die backendübergreifende Toleranz für
`available_at`, damit gerade verfügbare Tasks Zeitstempelabweichungen unter
einer Sekunde überstehen, `wake_signal_ttl_seconds` die Standard-Signal-TTL
von `CacheLongPollWakeStore` und `workflow_task_lease_seconds` /
`activity_task_lease_seconds` die Standard-Lease-Dauern für Workflow- und
Aktivitäts-Tasks. Der Betrieb liest diese Werte zur Prüfung des dokumentierten
Matching-Vertrags, ohne den Paketquellcode durchsuchen zu müssen. Eine
Verschärfung ist eine Protokolländerung, da andere Zuweisungs-, Worker- und
Beschleunigungszeiten davon abhängen. Auch das Umbenennen eines Feldes bricht
das Protokoll.

## Berechtigungsgrenzen {#authority-boundaries}

`topology.authority_boundaries` benennt die dauerhaften Schreiboberflächen,
die jede Rolle ändern soll:

| Rolle | Veröffentlichte Schreibzugriffe |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

Erkennen Sie mit diesem Vertrag rollenübergreifende Abweichungen, bevor Sie
Prozesse trennen oder neue topologiespezifische Automatisierung hinzufügen.

## Ausfall- und Skalierungsgrenzen {#failure-and-scaling-boundaries}

### Ausfallbereiche {#failure-domains}

`topology.failure_domains` nennt das erste beeinträchtigte Verhalten und das
erste für den Betrieb sichtbare Signal bei Ausfall jeder Rolle:

| Ausfallbereich | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

Dies sind produktbezogene Erwartungen, keine nebensächlichen
Implementierungsdetails. Beschreiben Sie damit vor dem Lesen von Logs, was bei
einer beeinträchtigten Rolle geschehen sollte.

### Skalierungsgrenzen {#scaling-boundaries}

`topology.scaling_boundaries` zeigt die primäre Lastachse jeder Rolle im
rollengetrennten Modell:

| Rolle | Skalierungsgrenze |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

Das beantwortet für die rollengetrennte Topologie explizit die Frage:
„Was skalieren wir unabhängig?“

## Migrationspfad {#migration-path}

`topology.migration_path` ist geordnet. Jeder Schritt erhält einen dauerhaften
Kern und trennt Zuständigkeiten klarer:

1. `audit_role_boundaries`
   Ergebnis: Werkzeuge melden rollenübergreifende Schreibzugriffe vor Änderungen der Laufzeitform.
2. `expose_role_bindings`
   Ergebnis: Container-Schnittstellen ermöglichen Adapter außerhalb des Prozesses ohne Paket-Patches.
3. `introduce_dedicated_matching_shape`
   Ergebnis: Matching kann als eigene Prozessklasse ohne Änderung des Claim-Vertrags laufen.
4. `split_history_projection`
   Ergebnis: Historie und Projektionen können ohne zweiten Schreiber aus dem Prozess ausgelagert werden.
5. `split_scheduler`
   Ergebnis: Zeitplanauslösung kann hinter eine Leader-Wahl verschoben werden, während Ein-Replikat-Bereitstellungen zulässig bleiben.
6. `optional_execution_partitioning`
   Ergebnis: Worker können nach Namespace, Verbindung, Warteschlange und Kompatibilität aufgeteilt werden.

Lesen Sie dies als unterstützte Reihenfolge des Topologiewechsels, nicht als
separate Produkt-Roadmap unabhängig von der aktuellen Engine.

Jeder Eintrag `topology.migration_path[]` trägt explizit `reversible: true`.
Der Migrationspfad ist bidirektional: Eine Bereitstellung auf
`split_history_projection` DARF die Historienrolle wieder in den
Control-Plane-Prozess zurückführen und bleibt eine zulässige Topologieform.
Rollback ist Teil des Vertrags, kein unmodellierter Sonderfall.

## Invarianten des dauerhaften Kerns {#durable-kernel-invariants}

`topology.kernel_invariants` zählt die Garantien auf, die die Rollentrennung
unabhängig von der unterstützten Form erhält. Prüfen Sie damit, ob eine
vorgesehene Topologieänderung vom Produkt unterstützt wird oder die Engine abspaltet:

| Invariante | Garantie |
| --- | --- |
| `single_persistence_engine` | Eine Workflow-Datenbank trägt jede Topologieform. Rollentrennung führt keine zweite Persistenz-Engine ein. |
| `single_worker_protocol` | Ein HTTP-Worker-Protokoll trägt Claim-, Abschluss-, Fehler- und Heartbeat-Verkehr in jeder Topologie. Rollentrennung spaltet den Worker-Vertrag nicht auf. |
| `single_history_writer` | `history_events` hat genau einen dauerhaften Schreiber je logischem Ereignis, unabhängig vom Ort der Historien-/Projektionsrolle. |
| `single_control_authority_per_run` | Jede Änderung eines Workflow-Laufs läuft durch eine Control-Plane-Autorität. Zeilensperren je Lauf serialisieren Übergänge über Replikate hinweg. |
| `embedded_topology_remains_supported` | Die eingebettete Form, in der ein Prozess alle Rollen übernimmt, MUSS zulässig bleiben. Bestehende eingebettete Hosts werden niemals zur Migration gezwungen. |
| `role_split_is_topology_only` | Rollentrennung ändert die Topologie, nicht das Produkt. Rollen wieder in einem Prozess zusammenzuführen bleibt stets zulässig. |

Das Feld `applies_to` jedes Eintrags nennt die abgedeckten Formen. Für die
unterstützte Topologiefamilie gilt derzeit jede Invariante für `embedded`,
`standalone_server` und `split_control_execution`. Fügt ein Upgrade eine neue
Form hinzu, MÜSSEN Invarianten ohne diese Form in `applies_to` geprüft werden,
bevor sie als vom Produkt unterstützt gilt.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## Koordinationszustand {#coordination-health}

`/api/cluster/info` veröffentlicht neben `topology` auch `coordination_health`.
Beachten Sie den Unterschied:

- `topology` sagt, was der Knoten tun darf und wie sich die Produktform verhalten soll.
- `coordination_health` sagt, ob Rollout-Sicherheits- und Koordinationsprüfungen über Namespaces hinweg aktuell gesund sind.
- `coordination_health.blocked_by`, `coordination_health.message` und
  `coordination_health.remediation` erscheinen, wenn der Server die
  Rollout-Sicherheit mangels Bereitschaftsvoraussetzungen wie Migrationen oder
  Datenbankverbindung nicht beurteilen kann.
- `coordination_health.routing_drains` fasst auslaufende Build-ID-Kohorten über
  Warteschlangen und Namespaces hinweg zusammen. `queues_with_drains` zeigt,
  ob Rollout-Automatisierung Verkehr gerade bewusst von Kohorten fernhält.
- `coordination_health.warning_checks`, `coordination_health.error_checks` und
  `coordination_health.checks` bleiben das normalisierte Prüfinventar, sobald
  die Rollout-Sicherheitsbewertung läuft.
- `coordination_health.checks[]` enthält stets die festgelegte Prüfung
  `activity_path` neben `worker_compatibility`, `task_transport`,
  `routing_health`, `durable_resume_paths` und den Projektions-/Scheduler-Prüfungen.
  `activity_path` ist das Aktivitätsgegenstück zu `task_transport`: Es zeigt
  Aktivitätsausführungen mit überschrittener, aber nicht durchgesetzter
  Schedule-to-start-, Start-to-close-, Schedule-to-close- oder Heartbeat-Frist
  sowie anhaltenden Aktivitätswiederholungsrückstau. Eine Umbenennung dieser
  Prüfung ist eine Protokolländerung.

Nutzen Sie beide Oberflächen gemeinsam, um zu entscheiden, ob eine
Topologieänderung sowohl unterstützt als auch aktuell sicher ist.

## Verwandte Referenzen {#related-references}

- [Server-API-Referenz](/docs/polyglot/server-api-reference) für den
  authentifizierten HTTP-Vertrag von `/api/cluster/info`.
- [Server-Leitfaden](/docs/polyglot/server) für Einrichtung und das umfassendere
  Betriebsmodell des eigenständigen Servers.
- [Bereitstellungsmodi](/docs/polyglot/deployment-modes) für die Wahl zwischen
  eingebetteter Form, eigenständigem Server und umfassenderen supportbegleiteten Topologien.
