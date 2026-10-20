---
sidebar_position: 3
title: Server-API-Referenz
description: HTTP-Referenz der Control-Plane-, Worker-Plane-, Namespace-, Speicher-, Zeitplan- und Systemendpunkte von Durable Workflow Server.
tags:
  - server
  - API
  - reference
  - control-plane
keywords:
  - Durable Workflow Server-API
  - Control-Plane-Versions-Header
  - Worker-Protokollendpunkte
  - API für externen Nutzlastspeicher
---

# Server-API-Referenz {#server-api-reference}

Der eigenständige Server bietet eine versionierte HTTP+JSON-API. Nutzen Sie
diese Seite beim Erstellen von SDKs, Skripten, Brückenadaptern oder
Betriebsanleitungen mit direktem Server-Zugriff. Bereitstellung und Konfiguration
beschreibt der [Server-Leitfaden](/docs/polyglot/server). Für Aufrufe von `dw`
verwenden Sie die [CLI-Befehlsreferenz](/docs/polyglot/cli-reference).

## Header und Versionierung {#headers-and-versioning}

Alle authentifizierten Anfragen verwenden Bearer-Tokens, sofern kein anderer
Authentifizierungstreiber konfiguriert ist:

```http
Authorization: Bearer <token>
X-Namespace: default
Content-Type: application/json
Accept: application/json
```

Control-Plane-Routen benötigen:

```http
X-Durable-Workflow-Control-Plane-Version: 2
```

Worker-Plane-Routen benötigen:

```http
X-Durable-Workflow-Protocol-Version: 1.0
```

Der Server veröffentlicht unterstützte Versionen und maschinenlesbare Verträge
über `GET /api/cluster/info`. Clients sollten dort vor dem Start langlebiger
Automatisierung Versionen ermitteln. Fehlende oder nicht unterstützte
Control-Plane-Versionen werden strikt mit einem benannten Grund wie
`missing_control_plane_version` oder `unsupported_control_plane_version` abgelehnt.

Verwenden Sie für Validierung, Codeerzeugung und Abweichungsprüfungen den
normativen Katalog [Plattform-Protokollspezifikationen](/docs/platform-protocol-specs)
statt dieser Prosareferenz. Er verlinkt das Control-Plane-OpenAPI-Dokument,
Worker-Protokoll-OpenAPI- und -AsyncAPI-Dokumente, das JSON Schema `cluster_info`
und die zugehörigen MCP-, Historien-, Waterline- und Reparatur-/Handlungsschemas.

## Erkennung und Zustand {#discovery-and-health}

Diese Routen dienen Load Balancern, SDK-Bootstraps und Kompatibilitätsprüfungen.

| Methode | Pfad | Authentifizierung | Zweck |
| --- | --- | --- | --- |
| `GET` | `/api/health` | nein | Lebendigkeitsprüfung mit maschinenlesbarer Topologiezusammenfassung des antwortenden Knotens. |
| `GET` | `/api/ready` | nein | Bereitschaftsprüfung mit derselben Topologiezusammenfassung und Bootstrap-Prüfungen der Rollout-Sicherheit. |
| `GET` | `/api/cluster/info` | ja | Server-Identität, unterstützte SDK-Bereiche, Rollentopologie, Koordinationszustand, Control-Plane-Vertrag, Worker-Protokollvertrag, Nutzlast-Codecs und Fähigkeiten. |

Beispiel:

<!-- docs-example id="server.cluster-info.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" | jq '.control_plane.version, .worker_protocol.version'
```

`/api/cluster/info` benötigt bewusst keinen Control-Plane-Versions-Header, da
es die unterstützten Versionen erst meldet. Die Antwort enthält auch
`coordination_health`, die Namespace-übergreifende Rollout- und
Bereitschaftszusammenfassung derselben Prüfungen, die den Server-Bereitschaftszustand bestimmen.

### Öffentliche Topologiezusammenfassung {#public-topology-summary}

`GET /api/health` und `GET /api/ready` liefern beide ein oberstes Objekt
`topology` aus dem implementierten Zustandszusammenfassungsvertrag. Ermitteln
Sie damit den antwortenden Knoten, bevor Control-Plane-Authentifizierung,
Namespace-Auflösung oder umfassendere Erkennung über `/api/cluster/info` gelingen.

Die öffentliche Zusammenfassung enthält stets:

- `topology.schema`
- `topology.version`
- `topology.current_shape`
- `topology.current_process_class`
- `topology.current_roles`
- `topology.execution_mode`
- `topology.matching_role.queue_wake_enabled`
- `topology.matching_role.shape`
- `topology.matching_role.wake_owner`
- `topology.matching_role.task_dispatch_mode`
- `topology.matching_role.partition_primitives`
- `topology.matching_role.backpressure_model`
- `topology.matching_role.discovery_limits.poll_batch_cap`
- `topology.matching_role.discovery_limits.availability_ceiling_seconds`
- `topology.matching_role.discovery_limits.wake_signal_ttl_seconds`
- `topology.matching_role.discovery_limits.workflow_task_lease_seconds`
- `topology.matching_role.discovery_limits.activity_task_lease_seconds`

`topology.matching_role.discovery_limits` ist der festgelegte numerische
Matching-Vertrag: `poll_batch_cap` ist die maximale Menge bereiter Task-Zeilen
je Abfrage, `availability_ceiling_seconds` die backendübergreifende Toleranz
für `available_at`, damit gerade verfügbare Tasks Zeitstempelabweichungen unter
einer Sekunde überstehen, `wake_signal_ttl_seconds` die Standard-Signal-TTL
von `CacheLongPollWakeStore` und `workflow_task_lease_seconds` /
`activity_task_lease_seconds` die Standard-Lease-Dauern für Workflow- und
Aktivitäts-Tasks. Jede Verschärfung dieser Werte ist eine Protokolländerung,
da Worker und nachgelagerte Werkzeuge sie als maßgeblichen Matching-Vertrag
lesen. Auch das Umbenennen eines Feldes bricht das Protokoll.

`/api/ready` liefert denselben Block `topology`, auch wenn der oberste
Bereitschafts-`status` `not_ready` ist. Prüfungen können so trotz aktiver
Bootstrap-Blocker Antworten von `server_http_node`, `scheduler_node`,
`matching_node` und `execution_node` unterscheiden.

Beispiel:

<!-- docs-example id="server.health.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/health" | jq '{
  status,
  topology: {
    schema: .topology.schema,
    version: .topology.version,
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role
  }
}'
```

### Bereitschaftsblocker {#readiness-blockers}

`GET /api/ready` liefert einen obersten `status` und maschinenlesbare `checks`.
Zwei Prüfungen bestimmen, ob der Server Rollout-Sicherheit sicher bewerten kann:

- `checks.migrations` ist die Bootstrap- und Migrationsschranke. Sie
  veröffentlicht `repository_exists`, `pending_migrations`,
  `adoptable_migrations`, `blocking_migrations`, `missing_tables`,
  `operator_surface` und `readiness_contract`.
- `adoptable_migrations` bedeutet, dass bestehende Workflow-Tabellen nur eine
  Übernahme der Migrationshistorie benötigen. Server bleibt bereit und meldet
  `status: "warning"`, damit der Betrieb die Übernahme vor dem nächsten
  Migrationsdurchlauf planen kann.
- `blocking_migrations` bedeutet, dass noch Migrationsdatensätze für
  Rollout-Sicherheit erforderlich sind. Server lehnt strikt mit
  `status: "pending"` und einer `remediation` ab, statt eine aktuelle Flotte vorzutäuschen.
- `operator_surface.available` und `operator_surface.required_tables` zeigen,
  ob die v2-Betriebsoberfläche die zum Erklären der Rollout-Sicherheit nötigen
  dauerhaften Tabellen besitzt.
- `readiness_contract.version` bindet die Revision des Installations- und
  Übernahmevertrags, die Skripte beim Auswerten dieser Felder erwarten sollen.
- `checks.workflow_v2` spiegelt das Namespace-übergreifende
  Rollout-Sicherheitsurteil. Fehlen Bereitschaftsvoraussetzungen, meldet es
  `status: "blocked"` mit `blocked_by`, `message` und `remediation`, statt
  eine gesunde Flotte vorzutäuschen.

Beispiel:

<!-- docs-example id="server.ready.blockers.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/ready" | jq '{
  status,
  migrations: {
    status: .checks.migrations.status,
    adoptable_migrations: .checks.migrations.adoptable_migrations,
    blocking_migrations: (.checks.migrations.blocking_migrations | map(.migration)),
    missing_tables: .checks.migrations.missing_tables,
    operator_surface: .checks.migrations.operator_surface,
    readiness_contract: .checks.migrations.readiness_contract
  },
  workflow_v2: {
    status: .checks.workflow_v2.status,
    blocked_by: .checks.workflow_v2.blocked_by,
    remediation: .checks.workflow_v2.remediation
  }
}'
```

### Cluster-Topologiemanifest {#cluster-topology-manifest}

`/api/cluster/info` liefert auch das `topology`-Manifest des Knotens mit dem
Schema `durable-workflow.v2.role-topology`. Es ist der unterstützte Weg, um
`standalone_server`, `embedded` oder `split_control_execution`, zugehörige
Rollen und die Server-Erwartungen an `matching_role`, `shape_assignments`,
`authority_boundaries`, `failure_domains`, `scaling_boundaries` und
`migration_path` zu erkennen. Dieselbe Antwort veröffentlicht den aktuellen
Rollout-Sicherheitszustand dieses Knotens.

Lesen Sie das Manifest so:

- `topology.current_shape`, `topology.current_process_class`,
  `topology.current_roles` und `topology.execution_mode` nennen die tatsächlich
  bediente Rollenform des antwortenden Knotens, nicht der gesamten Flotte.
- `topology.role_vocabulary` ist die feste Liste zulässiger v2-Rollennamen.
- `topology.matching_role.queue_wake_enabled`, `topology.matching_role.shape`,
  `topology.matching_role.wake_owner`, `topology.matching_role.task_dispatch_mode`,
  `topology.matching_role.partition_primitives` und
  `topology.matching_role.backpressure_model` zeigen, ob die breite Suche nach
  bereiten Tasks im Worker oder durch einen dedizierten Matching-Suchlauf
  erfolgt, welcher Prozess ihn verantwortet, welche Routing-Achsen stabil
  bleiben und welche dauerhafte Zulassungsgrenze v2 heute erzwingt.
- `topology.matching_role.discovery_limits` veröffentlicht die festen numerischen
  Vertragswerte `poll_batch_cap`, `availability_ceiling_seconds`,
  `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` und
  `activity_task_lease_seconds`. Prüfen Sie damit den dokumentierten Vertrag
  der Bereitstellung. Das Paket gibt dieselben Kennungen in `dw server:info`,
  dem Betriebsmetrik-Snapshot und der Namespace-bezogenen Zustandsoberfläche aus.
- `topology.role_catalog` und `topology.authority_surfaces` ordnen Rollennamen
  den Schnittstellen, dauerhaften Schreiboberflächen und Lesepfaden zu, die
  Automatisierung auf dem antwortenden Knoten erwarten sollte.
- `topology.shape_assignments` ist das maschinenlesbare Prozessklasseninventar
  je unterstützter Form. Vergleichen Sie das aktuelle Rollenbündel damit, um
  den antwortenden Knoten einer dokumentierten Prozessklasse zuzuordnen.
- `topology.supported_topologies` fasst unterstützte Bereitstellungsfamilien
  und deren erwartete Knotenklassen zusammen.
- `coordination_health` fasst flottenweites Rollout- und Kompatibilitätsrisiko
  maschinenlesbar zusammen. Neben `status` und `http_status` kann es
  `blocked_by`, `message` und `remediation` melden, wenn vorgelagerte
  Bereitschaftsprobleme wie fehlende Migrationen oder Datenbankerreichbarkeit
  die Rollout-Sicherheitsbewertung blockieren.
- `coordination_health.checks[]` enthält stets die feste Prüfung `activity_path`
  neben `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths` und den Projektions-/Scheduler-Prüfungen.
  `activity_path` ist das Aktivitätsgegenstück zu `task_transport`: Es zeigt
  Aktivitätsausführungen mit überschrittener, aber nicht durchgesetzter
  Schedule-to-start-, Start-to-close-, Schedule-to-close- oder Heartbeat-Frist
  (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`)
  sowie anhaltenden Aktivitätswiederholungsrückstau (`retrying`,
  `oldest_retrying_started_at`, `max_retrying_age_ms`). Eine Umbenennung ist
  eine Protokolländerung.
- `coordination_health.routing_drains` fasst auslaufende Build-ID-Kohorten über
  Namespaces und Warteschlangen zusammen. `queues_with_drains` und die
  warteschlangenbezogenen `build_ids` zeigen, wo Verkehr bewusst von
  auslaufenden Workern ferngehalten wird.
- `execution_mode` unterscheidet eingebettete `local_queue_worker`-Ausführung
  von `remote_worker_protocol`-Ausführung.
- `split_control_execution` ist eine unterstützte Produkttopologie, kein
  zweites Server-Produkt und keine andere API.

Beispiel:

<!-- docs-example id="server.cluster-info.topology.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    coordination_health: {
      status: .coordination_health.status,
      http_status: .coordination_health.http_status,
      blocked_by: .coordination_health.blocked_by,
      queues_with_drains: .coordination_health.routing_drains.queues_with_drains
    }
  }'
```

Den konzeptionellen Vertrag hinter diesen Feldern, einschließlich
Rollenvokabular und Migrationspfad, erklärt
[Server-Rollentopologie](/docs/polyglot/server-role-topology).

### Topologieablehnung bei falschem Knoten {#wrong-node-topology-rejections}

Authentifizierte gehostete Routen lehnen strikt ab, wenn der antwortende
Knoten nicht die für den Endpunkt erforderliche HTTP-Steuerungsoberfläche
hostet. Die Schranke läuft nach Rollen- und Protokollversionsprüfung, aber vor
Namespace-Auflösung. Anfragen an falsche Knoten verraten daher keine Namespace-Existenz.

Blockiert die Schranke, liefert Server `503` mit
`reason: "topology_role_unavailable"` sowie:

- `current_shape`: gemeldete Topologieform des antwortenden Knotens.
- `current_process_class`: deklarierte Prozessklasse, etwa `scheduler_node` oder `execution_node`.
- `current_roles`: tatsächlich auf diesem Knoten gehostete Rollen.
- `required_roles`: benötigte Rollen der gehosteten Route.
- `missing_roles`: die auf dem antwortenden Knoten fehlende Teilmenge von `required_roles`.

Control-Plane-Routen liefern diese Nutzlast in ihrer Envelope.
Worker-Protokollrouten liefern dieselben Felder in ihrer Envelope und behalten
den normalen Worker-Protokollversions-Header.

Beispiel einer falschen Knotenantwort auf `GET /api/workflows`, wenn die Anfrage
auf einem reinen Scheduler-Knoten landet:

```json
{
  "reason": "topology_role_unavailable",
  "message": "This node does not host the topology roles required for this endpoint.",
  "current_shape": "standalone_server",
  "current_process_class": "scheduler_node",
  "current_roles": ["scheduler"],
  "required_roles": ["api_ingress", "control_plane"],
  "missing_roles": ["api_ingress", "control_plane"]
}
```

`GET /api/health`, `GET /api/ready` und authentifiziertes `GET /api/cluster/info`
bleiben auch ohne aktuelle HTTP-Steuerungsoberfläche für Lebendigkeit und
Erkennung verfügbar.

### Workflow-Bootstrap-Schranke {#workflow-bootstrap-gate}

Authentifizierte Routen, die Workflow-v2-Verkehr ändern oder bedienen, lehnen
ebenfalls strikt ab, wenn `checks.workflow_v2.status` des antwortenden Knotens
`blocked` ist. Die Schranke läuft nach Rollen- und Protokollversionsprüfung,
aber vor Namespace-Auflösung. Eine Anfrage während eines blockierten Rollouts
erfährt niemals die Namespace-Existenz.

Die Schranke liefert `503` mit `reason: "workflow_v2_blocked"` sowie:

- `blocked_by`: geordnete Liste vorgelagerter Bereitschaftsblocker (etwa
  `migrations`), die sicheren Workflow-v2-Betrieb verhindern.
- `remediation`: kurze Betriebsanweisung zur Behebung, gespiegelt aus
  `/api/ready` `checks.workflow_v2.remediation`.

Die Bootstrap-geschützten Routenfamilien sind:

- **Workflow-Start und -Änderung**: jede `/api/workflows`-Route der Start-,
  Beschreibungs-, Befehls- und laufbezogenen Befehlsgruppen (etwa
  `POST /api/workflows`, `POST /api/workflows/{workflowId}/signal/{signalName}`,
  `POST /api/workflows/{workflowId}/runs/{runId}/cancel`).
- **Zeitplanänderung**: `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`,
  `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`,
  `POST /api/schedules/{scheduleId}/resume`,
  `POST /api/schedules/{scheduleId}/trigger` und
  `POST /api/schedules/{scheduleId}/backfill`.
- **Brückenadapter**: `POST /api/bridge-adapters/webhook/{adapter}`.
- **Worker-Protokoll**: jede Route `/api/worker` und `/api/worker/*`,
  einschließlich Registrierung, Heartbeat und Abfrage-/Abschluss-/Fehler-/Heartbeat-Operationen
  für Workflow-, Abfrage- und Aktivitäts-Tasks.

Zeitplan-**Lesezugriffe** sind bewusst ausgenommen, damit der Betrieb während
Wiederherstellung Zeitplanzustand prüfen kann: `GET /api/schedules`,
`GET /api/schedules/{scheduleId}` und `GET /api/schedules/{scheduleId}/history`
bleiben verfügbar, während die Bootstrap-Schranke andere Routen blockiert.

Control-Plane-Routen liefern die Schranken-Nutzlast in der Control-Plane-Envelope
mit `X-Durable-Workflow-Control-Plane-Version`. Worker-Protokollrouten liefern
dieselben Felder `reason`, `blocked_by` und `remediation` in ihrer Envelope und
behalten `X-Durable-Workflow-Protocol-Version`. Worker können so anhand des
maschinenlesbaren Grunds verzweigen, statt aus einem bloßen `503` auf
Warteschlangenzustand zu schließen.

Beispiel einer Bootstrap-Schranken-Antwort auf `POST /api/workflows` bei
fehlender Rollout-Sicherheitsmigration:

```json
{
  "reason": "workflow_v2_blocked",
  "message": "This node is not ready to serve workflow v2 traffic until bootstrap blockers are cleared.",
  "blocked_by": ["migrations"],
  "remediation": "Restore database connectivity and migrate the workflow tables before relying on workflow v2 rollout-safety health."
}
```

Dieselbe Nutzlast wird für `/api/worker/*` in der Worker-Protokoll-Envelope
geliefert. Worker-SDKs können weiter nach `reason` verzweigen und nach Behebung
des vorgelagerten Blockers erneut versuchen.

### Namespace-bezogener Systemzustand {#namespace-scoped-system-health}

`GET /api/system/health` ist die authentifizierte Rollout-Sicherheits- und
Koordinationszustandsoberfläche eines Namespace. Sie benötigt Admin-Authentifizierung
und `X-Durable-Workflow-Control-Plane-Version: 2`, löst den Namespace nach den
normalen Control-Plane-Regeln auf und liefert den tatsächlich bewerteten
Namespace mit aktuellem `health`-Snapshot:

<!-- docs-example id="server.system-health.curl" -->
```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/health" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  | jq '{namespace, status: .health.status, healthy: .health.healthy}'
```

Interpretieren Sie die Nutzlast so:

- `namespace`: Namespace, dessen Rollout-/Koordinationszustand bewertet wurde.
- `health.status` und `health.healthy`: oberstes maschinenlesbares Zustandsurteil dieses Namespace.
- `health.checks` und `health.categories`: Bereitschafts-, Kompatibilitäts-, Projektions- und Koordinationsangaben je Oberfläche.
- `health.operator_metrics`: aktueller Namespace-bezogener Warteschlangen-, Worker- und Reparaturmetrik-Snapshot.
- `health.structural_limits`: wirksame strukturelle Grenzen und zugehörige Diagnosen, die Server für diesen Namespace erzwingt.

## Workflow-Control-Plane {#workflow-control-plane}

Workflow-Routen sind Betriebs-/Control-Plane-Routen. Sie benötigen die Rolle
Operator oder Admin und `X-Durable-Workflow-Control-Plane-Version: 2`.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/workflows` | Workflow-Instanzen auflisten. Unterstützt Filter wie Status, Typ, Abfragetext und Grenze. |
| `POST` | `/api/workflows` | Workflow-Instanz starten. |
| `GET` | `/api/workflows/{workflowId}` | Aktuellen Lauf einer Workflow-ID beschreiben. |
| `GET` | `/api/workflows/{workflowId}/debug` | Begrenzte Diagnoseangaben für festhängende Läufe liefern. |
| `GET` | `/api/workflows/{workflowId}/runs` | Läufe einer Workflow-ID auflisten. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}` | Bestimmten Lauf beschreiben. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/debug` | Begrenzte Diagnoseangaben für ausgewählten Lauf liefern. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history` | Laufhistorienereignisse seitenweise lesen. |
| `GET` | `/api/workflows/{workflowId}/runs/{runId}/history/export` | Replay-Archivpaket eines Laufs exportieren. |

Startanfragen verwenden die sprachneutrale Control-Plane-Struktur:

<!-- docs-example id="server.workflow-start.curl" -->
```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"],
    "memo": {"source": "api-reference"},
    "search_attributes": {"CustomerId": "cust-42"},
    "duplicate_policy": "reject"
  }'
```

### Workflow-Befehle {#workflow-commands}

Server bietet auch kooperative `request-cancellation`-Routen.
[Kooperativer Abbruch](/docs/polyglot/cancellation/) beschreibt den Vertrag
begrenzter Bereinigung und die Worker-Anforderungen.

Instanzbezogene Befehlsrouten arbeiten auf dem aktuellen Lauf einer Workflow-ID:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/signal/{signalName}` | Signal senden. |
| `POST` | `/api/workflows/{workflowId}/query/{queryName}` | Schreibgeschützte Abfrage ausführen. |
| `POST` | `/api/workflows/{workflowId}/update/{updateName}` | Update übermitteln oder ausführen. |
| `POST` | `/api/workflows/{workflowId}/cancel` | Lauf sofort als abgebrochen schließen; setzt Workflow-Bereinigung nicht fort. |
| `POST` | `/api/workflows/{workflowId}/terminate` | Terminierung erzwingen. |
| `POST` | `/api/workflows/{workflowId}/repair` | Server um Reparatur wiederholbaren festhängenden Zustands bitten. |
| `POST` | `/api/workflows/{workflowId}/archive` | Geschlossenen Workflow-Lauf archivieren. |

Laufbezogene Befehlsrouten lehnen historische oder falsche Laufziele explizit ab:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/signal/{signalName}` | Signal nur senden, wenn der gewählte Lauf aktuell ist. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/query/{queryName}` | Abfrage für den gewählten Lauf ausführen. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/update/{updateName}` | Update nur übermitteln oder ausführen, wenn der gewählte Lauf aktuell ist. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/cancel` | Nur abbrechen, wenn der gewählte Lauf aktuell ist. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/terminate` | Nur terminieren, wenn der gewählte Lauf aktuell ist. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/repair` | Nur reparieren, wenn der gewählte Lauf aktuell ist. |
| `POST` | `/api/workflows/{workflowId}/runs/{runId}/archive` | Nur archivieren, wenn der gewählte Lauf aktuell und geschlossen ist. |

Befehle mit Aufrufernutzlasten verwenden ein `input`-Array. Python- und PHP-SDKs
codieren sprachneutrale Nutzlast-Envelopes für Sie. Direkte HTTP-Aufrufer müssen
JSON-Werte senden, die der Ziel-Workflow oder die Aktivität decodieren kann.

## Namespace und Speicher {#namespace-and-storage}

Namespace-Routen benötigen Operator- oder Admin-Rollen. Ändernde Namespace-
und externe Speicherrouten benötigen die Admin-Rolle.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/namespaces` | Namespaces auflisten. |
| `POST` | `/api/namespaces` | Namespace erstellen. |
| `GET` | `/api/namespaces/{namespace}` | Aufbewahrung, Metadaten und Speicherrichtlinie eines Namespace beschreiben. |
| `PUT` | `/api/namespaces/{namespace}` | Namespace-Metadaten oder Aufbewahrung aktualisieren. |
| `PUT` | `/api/namespaces/{namespace}/external-storage` | Externe Nutzlastspeicherrichtlinie des Namespace konfigurieren. |
| `POST` | `/api/storage/test` | Kleine und große Nutzlast über konfigurierten externen Speichertreiber schreiben und zurücklesen. |

Externe Nutzlastspeicherrichtlinien ersetzen rohe Bytes großer Envelopes durch
stabile Referenzen. Lokale Richtlinien lösen über den konfigurierten
Dateisystempfad auf. Objektspeicherrichtlinien wie `s3`, `gcs` und `azure`
verwenden einen explizit konfigurierten Dateisystem-Datenträger sowie
Bucket-/Präfixeinstellungen auf dem Server.

### Externe Nutzlastreferenz-Envelope {#external-payload-reference-envelope}

Die externe Nutzlastreferenz ist eine stabile Übertragungs-Envelope. SDKs können
sie in native Hilfstypen decodieren. HTTP-Clients sollten diese Feldnamen als
Vertrag behandeln:

| Feld | Erforderlich | Bedeutung |
| --- | --- | --- |
| `schema` | ja | Muss `durable-workflow.v2.external-payload-reference.v1` sein. Unbekannte Schemas werden strikt abgelehnt. |
| `uri` | ja | Vom Treiber verwalteter Objektort wie `file:///...`, `s3://bucket/prefix/object`, `gs://bucket/prefix/object` oder `azure://container/prefix/object`. |
| `sha256` | ja | SHA-256 der gespeicherten codierten Bytes in kleingeschriebenem Hex. SDKs und Server prüfen ihn vor dem Decodieren. |
| `size_bytes` | ja | Byte-Länge der gespeicherten codierten Nutzlast. Abweichung ist ein Integritätsfehler. |
| `codec` | ja | Immer `avro`: festes typisiertes Value-Schema mit Avro-Einzelobjektrahmen. Das umgebende HTTP-Dokument bleibt JSON. |
| `expires_at` | nein | ISO-8601-Ablaufhinweis für Aufbewahrung/GC. Ohne Angabe verantwortet die Namespace-Aufbewahrungsrichtlinie die Bereinigung. |

Auslagerung wird durch die Schwelle der Namespace-Speicherrichtlinie gesteuert.
Inline-Nutzlasten verwenden die normale Envelope, bis codierte Bytes
`threshold_bytes` überschreiten. Dann schreibt der Treiber die Bytes und die
Historie speichert die Referenz-Envelope. Replay und Historienexport müssen
klar fehlschlagen, wenn ein referenzierter Blob fehlt, geändert ist, außerhalb
des konfigurierten Präfixes liegt oder einem nicht verfügbaren Anbieter gehört.
Sie dürfen fehlende Objekte niemals still durch `null`, `{}` oder eine leere
Bytefolge ersetzen.

Den vollständigen Anfrageautoritätsvertrag mit Namespace-Auflösung,
rollenspezifischen Zugangsdaten und Worker-Registrierungsfeldern beschreibt
[Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers).

## Verwaltungs-APIs des Dienstkatalogs {#service-catalog-admin-apis}

Dienstkatalogrouten sind authentifizierte Admin-Control-Plane-Routen. Sie nutzen
dieselbe Namespace-Auflösung, Topologierollenschranke und Anforderung
`X-Durable-Workflow-Control-Plane-Version: 2` wie die übrige gehostete Control Plane.

Registrieren Sie über diese Routenfamilie Namespace-bezogene Endpunkt-, Dienst-
und Operationsmetadaten für den Namespace-übergreifenden Dienstkatalog. Namen
sind bei Eingabe unabhängig von Groß-/Kleinschreibung und werden in Antworten
und Suchvorgängen in Kleinbuchstaben normalisiert.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/service-endpoints` | Dienstendpunkte des aktuellen Namespace auflisten. |
| `POST` | `/api/service-endpoints` | Dienstendpunkt erstellen. |
| `GET` | `/api/service-endpoints/{endpointName}` | Endpunkt beschreiben. |
| `PUT` | `/api/service-endpoints/{endpointName}` | Endpunktbeschreibung oder -metadaten aktualisieren. |
| `DELETE` | `/api/service-endpoints/{endpointName}` | Ungenutzten Endpunkt löschen. |
| `GET` | `/api/service-endpoints/{endpointName}/services` | Unter einem Endpunkt registrierte Dienste auflisten. |
| `POST` | `/api/service-endpoints/{endpointName}/services` | Dienst unter einem Endpunkt erstellen. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Dienst beschreiben. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Dienstbeschreibung oder -metadaten aktualisieren. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}` | Ungenutzten Dienst löschen. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Unter einem Dienst registrierte Operationen auflisten. |
| `POST` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations` | Operationsbindung erstellen. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Operation beschreiben. |
| `GET` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}/service-calls/{serviceCallId}` | Dauerhaften Dienstaufruf-Snapshot beschreiben. |
| `PUT` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Operationsbindung aktualisieren. |
| `DELETE` | `/api/service-endpoints/{endpointName}/services/{serviceName}/operations/{operationName}` | Ungenutzte Operation löschen. |

Antwortsammlungen verwenden Arrays `service_endpoints`, `services` oder
`operations`. Einzelressourcen enthalten stabile kleingeschriebene Namen,
Metadaten und Zeitstempel:

- Endpunkte liefern `id`, `namespace`, `endpoint_name`, `description`,
  `metadata`, `created_at` und `updated_at`.
- Dienste ergänzen `endpoint_id` und `service_name`.
- Operationen ergänzen `service_id`, `operation_name`, `operation_mode`,
  `handler_binding_kind`, `handler_target_reference`, `handler_binding`,
  `deadline_policy`, `idempotency_policy`, `cancellation_policy`, `retry_policy`,
  `boundary_policy` und `metadata`.
- Dienstaufruf-Snapshots ergänzen `caller_namespace`, Aufrufer- und verknüpfte
  Workflow-IDs, `status`, `resolved_binding_kind`, `resolved_target_reference`,
  Nutzlastreferenzen, Richtlinien-Snapshots und Lebenszykluszeitstempel wie
  `accepted_at`, `started_at`, `completed_at`, `failed_at` und `cancelled_at`.

Anfragen zum Erstellen/Aktualisieren von Operationen verwenden dieselben
JSON-Feldnamen wie die Antwort. `operation_mode` ist `sync` oder `async`.
`handler_binding_kind` ist `start_workflow`, `signal_workflow`, `update_workflow`,
`query_workflow`, `activity_execution` oder `invocable_http`. Neue Operationen
müssen entweder `handler_target_reference` oder eine nicht leere
`handler_binding`-Nutzlast angeben.

Das verschachtelte Dienstaufrufdetail enthält außerdem `service_call_attempts`,
`retry_attempt_count`, die ursprüngliche `call_deadline_at`, typisierte
Fehlermetadaten und die aufbewahrte Avro-`result_envelope`. Angenommene oder
gestartete Aufrufe sind nicht terminal. Ein auf Abschluss wartender
Workflow-Aufrufer erhält das tatsächliche Ergebnis oder den terminalen
Fehler/Abbruch des verknüpften Workflows unter Erhalt ursprünglicher
Aufrufidentität und Frist.

Untersuchen Sie den ursprünglichen Aufruf mit der
[CLI-Dienstaufrufinspektion](./cli-reference.md#service-call-inspection) oder
Waterlines Dienstkatalog. Inspektion fordert keine weitere Dienstausführung an.

Löschrouten lehnen bei vorhandenen Abhängigkeiten strikt mit HTTP `409` und
einem benannten Grund wie `endpoint_has_services`, `service_has_operations`
oder `operation_has_service_calls` ab.

## Brückenadapter {#bridge-adapters}

Brückenadapter sind begrenzte Eingangsendpunkte. Sie führen keinen Workflow-Code
aus, sondern übergeben Ereignisse an die Control Plane und liefern ein benanntes Ergebnis.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/api/bridge-adapters/webhook/{adapter}` | Workflow aus einem Webhook-artigen Ereignis starten, signalisieren oder aktualisieren. |

Beispiel:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/bridge-adapters/webhook/stripe" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_workflow",
    "idempotency_key": "evt_1001",
    "target": {
      "workflow_type": "orders.fulfillment",
      "task_queue": "orders",
      "business_key": "order-1001"
    },
    "input": {"order_id": "order-1001"}
  }'
```

Verwenden Sie Antwortfelder wie `outcome`, `reason`, `idempotency_key` und
`control_plane_outcome`, statt Verhalten allein aus dem HTTP-Status abzuleiten.

## Worker-Protokoll {#worker-protocol}

Worker-Routen benötigen eine Worker-Rolle und
`X-Durable-Workflow-Protocol-Version: 1.0`. SDK-Worker nutzen diese Endpunkte
intern. Eigene sprachspezifische Worker können dasselbe Protokoll implementieren.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/api/worker/register` | Worker-Identität, Task-Warteschlangen, unterstützte Workflow-/Aktivitätstypen, Kapazität, Laufzeitumgebung und Build-Metadaten registrieren. |
| `POST` | `/api/worker/heartbeat` | Einsicht in Worker-Flotte und Kompatibilitätsangaben aktualisieren. |
| `POST` | `/api/worker/workflow-tasks/poll` | Workflow-Tasks per Long Polling abfragen. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/history` | Seitenweise Task-Historie für geleasten Workflow-Task abrufen. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/heartbeat` | Heartbeat für geleasten Workflow-Task senden. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/complete` | Workflow-Task mit Befehlen abschließen. |
| `POST` | `/api/worker/workflow-tasks/{taskId}/fail` | Workflow-Task als fehlgeschlagen melden. |
| `POST` | `/api/worker/query-tasks/poll` | Servergeroutete Abfrage-Tasks per Long Polling abfragen. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/complete` | Abfrage-Task abschließen. |
| `POST` | `/api/worker/query-tasks/{queryTaskId}/fail` | Abfrage-Task ablehnen oder als fehlgeschlagen melden. |
| `POST` | `/api/worker/activity-tasks/poll` | Aktivitäts-Tasks per Long Polling abfragen. |
| `POST` | `/api/worker/activity-tasks/{taskId}/heartbeat` | Heartbeat für geleasten Aktivitäts-Task senden. |
| `POST` | `/api/worker/activity-tasks/{taskId}/complete` | Aktivitäts-Task abschließen. |
| `POST` | `/api/worker/activity-tasks/{taskId}/fail` | Aktivitäts-Task als fehlgeschlagen melden. |

Worker sollten Lease-IDs, Versuche, Task-IDs und Heartbeat-Endpunkte als opake
serverseitig ausgegebene Werte behandeln. Eine veraltete Lease oder falsche
Task-ID liefert einen benannten Worker-Protokollfehler, statt Arbeit still abzuschließen.

Ist `worker_protocol.server_capabilities.poll_status` `true`, enthält jede
Workflow-, Aktivitäts- und Abfrage-Task-Abfrageantwort ein maschinenlesbares
`poll_status`. Verwenden Sie es als erste Verzweigung vor routenspezifischen Feldern:

| `poll_status` | Typischer HTTP-Status | Bedeutung |
| --- | --- | --- |
| `leased` | `200` | Task wurde geleast und `task` enthält seine Nutzlast. |
| `empty` | `200` | Vor Rückkehr der Abfrage war kein passender Task bereit. |
| `throttled` | `200` | Warteschlange ist sichtbar, aber Lease- oder Zuweisungszulassungsgrenzen hielten einen neuen Task zurück. |
| `unavailable` | `503` oder `200` | Server konnte den Abfragepfad der Warteschlange nicht sicher koordinieren und lieferte ein typisiertes Nichtverfügbarkeitsergebnis, statt still Leere vorzutäuschen. |
| `draining` | `409` | Registrierte Worker-Kohorte läuft aus. Server verweigert neue Leases mit `reason: "worker_draining"`. |

## Einsicht in Flotte und Task-Warteschlangen {#fleet-and-task-queue-visibility}

Diese Control-Plane-Routen bieten Betriebsdiagnosen für Worker-Flotten und
Warteschlangenzulassung.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/workers` | Registrierte Worker auflisten. |
| `GET` | `/api/workers/{workerId}` | Worker beschreiben. |
| `DELETE` | `/api/workers/{workerId}` | Worker deregistrieren. |
| `GET` | `/api/task-queues` | Task-Warteschlangen und Zulassungsstatus auflisten. |
| `GET` | `/api/task-queues/{taskQueue}` | Workflow-/Aktivitäts-/Abfragekapazität einer Warteschlange beschreiben. |
| `GET` | `/api/task-queues/{taskQueue}/build-ids` | Beobachtete Build-IDs einer Warteschlange auflisten. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/drain` | Build-ID-Kohorte als auslaufend markieren, damit sie keine neuen Tasks übernimmt. |
| `POST` | `/api/task-queues/{taskQueue}/build-ids/resume` | Frühere Leerung aufheben, damit die Kohorte wieder neue Tasks übernimmt. |

Unterscheiden Sie mit diesen Antworten fehlende Worker von ausgelasteten Slots,
Grenzen aktiver Leases, Zuweisungsbudgets und Rückstaukontrolle für Abfrage-Tasks.
Leeren und Fortsetzen erwarten JSON `{"build_id": "..."}` oder
`{"build_id": null}` für die unversionierte Kohorte. Sie sind idempotent und
speichern die Betriebsabsicht dauerhaft, damit der Rollout-Zustand auch nach
Entfernung der Worker ehrlich bleibt. Sobald ein Worker-Heartbeat
`drain_intent: "draining"` beobachtet, liefern Worker-Abfragerouten HTTP `409`
mit `poll_status: "draining"` und `reason: "worker_draining"` statt neuer Leases.
Den vollständigen Lebenszyklus von Umstellung auf Versionierung, Canary,
Leeren und Rollback erklärt [Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout).

## Zeitpläne und Suchattribute {#schedules-and-search-attributes}

Zeitplanrouten sind Control-Plane-Routen.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/schedules` | Zeitpläne auflisten. |
| `POST` | `/api/schedules` | Zeitplan erstellen. |
| `GET` | `/api/schedules/{scheduleId}` | Zeitplan beschreiben. |
| `PUT` | `/api/schedules/{scheduleId}` | Spezifikation, Aktion, Notiz, Memo oder Suchattribute aktualisieren. |
| `DELETE` | `/api/schedules/{scheduleId}` | Zeitplan löschen. |
| `POST` | `/api/schedules/{scheduleId}/pause` | Künftige Auslösungen pausieren. |
| `POST` | `/api/schedules/{scheduleId}/resume` | Pausierten Zeitplan fortsetzen. |
| `POST` | `/api/schedules/{scheduleId}/trigger` | Zeitplan sofort auslösen. |
| `POST` | `/api/schedules/{scheduleId}/backfill` | Zeitfenster nachholen. |
| `GET` | `/api/search-attributes` | Registrierte Suchattribute auflisten. |
| `POST` | `/api/search-attributes` | Suchattribut registrieren. |
| `DELETE` | `/api/search-attributes/{name}` | Suchattribut löschen. |

Suchattributnamen und -typen gehören zum Namespace-Suchvertrag. Vermeiden Sie
Attribute mit hoher Kardinalität für Betriebsdashboards oder Metrikbezeichnungen.

## Systemoperationen {#system-operations}

Systemrouten benötigen die Admin-Rolle. Sie sind explizite Betriebsdurchläufe.
Verwenden Sie in Automatisierung bevorzugt Statusrouten vor Durchlaufrouten.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/system/health` | Namespace-bezogenen Snapshot von Rollout-Sicherheit und Koordinationszustand unter `health` liefern. |
| `GET` | `/api/system/metrics` | Begrenzte JSON-Metriken liefern. |
| `GET` | `/api/system/operator-metrics` | Namespace-bezogenen Betriebsmetrik-Snapshot für Läufe, Tasks, Rückstau, Reparatur, Worker und strukturelle Grenzen liefern. |
| `GET` | `/api/system/repair` | Workflow-Reparaturrückstau untersuchen. |
| `POST` | `/api/system/repair/pass` | Einen Workflow-Reparaturdurchlauf ausführen. |
| `GET` | `/api/system/activity-timeouts` | Aktivitäts-Timeout-Rückstau untersuchen. |
| `POST` | `/api/system/activity-timeouts/pass` | Einen Durchlauf zur Aktivitäts-Timeout-Durchsetzung ausführen. |
| `GET` | `/api/system/retention` | Rückstau der Aufbewahrungsbereinigung untersuchen. |
| `POST` | `/api/system/retention/pass` | Einen Aufbewahrungsbereinigungsdurchlauf ausführen. |

Für die Aufbewahrung im PHP Server liest die Statusroute die aktuelle
Namespace-Richtlinie und liefert eine begrenzte Liste geeigneter Läufe.
Richtlinienänderungen betreffen auch bestehende geschlossene Historie.
Ein ungefilterter Durchlauf wählt abgelaufene Läufe. Explizite `run_ids`
zielen direkt auf geschlossene Läufe ohne begrenzten Altersfilter. Schutz
für unbegrenzte Aufbewahrung und archivierte Läufe gilt weiter. Prüfen Sie vor
Richtlinienänderung oder Bereinigung das [Aufbewahrungsverfahren und die Sicherungsschritte](./server.md#retention).

`/api/system/health` beantwortet am schnellsten, ob ein Namespace gesund genug
für weiteren Verkehr ist. Es liefert `{namespace, health}`. `health` enthält
kategorisierte Rollout-Sicherheitsprüfungen, den verschachtelten Snapshot
`health.operator_metrics` und die Zusammenfassung struktureller Grenzen der
Zustandsoberfläche.

`/api/system/operator-metrics` ist die Namespace-bezogene Ergänzung zu
`/api/cluster/info` für rohe Rückstauanzahlen, Alter kompatibilitätsblockierter
Arbeit, Worker-Flottendetails und weitere Metriken hinter der zusammengefassten
Zustandsoberfläche.

`/api/system/metrics` ist eine JSON-Betriebsoberfläche, kein
Prometheus-Scrape-Endpunkt. Metriknamen und Dimensionen sind durch die
Richtlinie des Servers für begrenztes Wachstum eingeschränkt.

## Fehlervertrag {#error-contract}

Fehlerantworten verwenden HTTP-Statuscodes und benannte maschinenlesbare Gründe.
Clients sollten nach `reason` oder verschachtelten Control-Plane-/Worker-Protokoll-Gründen
verzweigen, nicht nach Prosameldungen.

Häufige Statuscodes:

| Status | Bedeutung |
| --- | --- |
| `400` | Fehlender oder nicht unterstützter Protokoll-/Versions-Header, ungültige Abfrage oder nicht unterstützte Routenmethode. |
| `401` | Fehlende oder ungültige Authentifizierung. |
| `403` | Authentifiziertes Token besitzt die erforderliche Rolle nicht. |
| `404` | Namespace, Workflow, Lauf, Zeitplan, Worker oder Suchattribut nicht gefunden. |
| `409` | Duplikat oder Konflikt, etwa bereits gestarteter Workflow oder ungültiges Laufziel. |
| `422` | Validierung fehlgeschlagen; Antwort enthält Details je Feld. |
| `429` | Zulassungs- oder Task-Warteschlangenkapazität ist voll. |
| `503` | Anfrage erreichte einen Knoten ohne die erforderlichen Topologierollen. Gehostete Routen liefern `reason: "topology_role_unavailable"` mit `current_shape`, `current_process_class`, `current_roles`, `required_roles` und `missing_roles`. Derselbe Status mit `reason: "workflow_v2_blocked"`, `blocked_by` und `remediation` gilt für Workflow-Start/-Änderung, Zeitplanänderung, Brückenadapter und Worker-Protokoll, während Workflow-v2-Bootstrap blockiert ist. Zeitplan-Leserouten (`GET /api/schedules`, `GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`) bleiben zur Inspektion während Wiederherstellung verfügbar. |
| `500` | Serverfehler. Nur als wiederholbar behandeln, wenn die Operation idempotent ist oder einen Idempotenzschlüssel hat. |

Validierungsantworten enthalten `reason: "validation_failed"` plus `errors`
oder `validation_errors`. Workflow-Befehlsantworten projizieren Validierungs-
und Operationsdetails zusätzlich in das verschachtelte Objekt `control_plane`.

## Siehe auch {#see-also}

- [Server-Leitfaden](/docs/polyglot/server)
- [Namespace, Authentifizierung und Worker-Registrierung](/docs/polyglot/namespace-auth-workers)
- [Worker-Protokoll](/docs/polyglot/worker-protocol)
- [Task-Warteschlangenzulassung](/docs/polyglot/task-queue-admission)
- [Externe Ausführung](/docs/polyglot/external-execution)
- [CLI-Befehlsreferenz](/docs/polyglot/cli-reference)
