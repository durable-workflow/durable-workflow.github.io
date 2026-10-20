---
sidebar_position: 2
title: Server
description: Eigenständigen Durable Workflow Server mit Workern, Aufbewahrung und Gesundheitsprüfungen bereitstellen und konfigurieren.
tags:
  - server
  - control-plane
  - operations
  - polyglot
keywords:
  - Durable Workflow Server
  - eigenständiger Server
  - Steuerungs-API
  - mehrsprachige Workflows
---

# Server {#server}

Der veröffentlichte Durable Workflow Server ist ein eigenständiger, in PHP implementierter Orchestrierungsdienst. Er stellt dieselbe dauerhafte Engine wie das eingebettete PHP-Paket über eine sprachunabhängige HTTP+JSON-Steuerung und ein Worker-Protokoll bereit. PHP ist an dieser Grenze eine Implementierungsentscheidung, keine Anforderung an die Anwendungssprache.

## Ist dies nur für PHP-Teams? {#is-this-only-for-php-teams}

Nein. PHP, Python und Rust haben offizielle SDKs. Ein reines Python- oder Rust-Team kann Server als Infrastruktur betreiben, Workflows und Aktivitäten mit seinem nativen SDK schreiben und über das öffentliche Protokoll kommunizieren. Seine Anwendung bettet Laravel nicht ein und wird keine Laravel-Anwendung.

Die Einführungswege sind getrennt:

- **Eigenständiger Server**: Betreiber stellen das veröffentlichte Image mit Datenbank, Queue/Cache, Scheduler und API-Rollen bereit. Anwendungsteams verbinden PHP-, Python- oder Rust-Worker. Server verantwortet Orchestrierungszustand und öffentliche Steuerungs-/Worker-Grenzen.
- **Eingebetteter Modus**: Eine Laravel-Anwendung installiert das PHP-Workflow-Paket und betreibt die Engine über eigene Queue, Datenbank, Konfiguration und Bereitstellung. Dieser Laravel-Vorteil ist keine Voraussetzung für den eigenständigen Weg.
- **Managed Cloud**: Durable Workflow Cloud betreibt Orchestrierung, Persistenz, Platzierung und Wiederherstellung. Teams führen SDK-Clients und Worker gegen einen bereitgestellten Cloud-Namespace aus. Sie stellen diese Server-Distribution nicht für Cloud bereit und schließen keinen selbst betriebenen Server daran an. Siehe [Verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane/).

Alle drei Wege verwenden dieselben dauerhaften Ausführungskonzepte. Externe Worker für Server und Cloud verwenden stabile Zeichenfolgen für Workflow-/Aktivitätstypen und eine gemeinsame Codec-Hülle. Sprachübergreifende Kinder und Aktivitäten erhalten damit die Payload-Struktur, statt PHP-Serialisierung offenzulegen.

Für die Entscheidung zwischen eigenständigem Server und eingebettetem Paket beginnen Sie bei [Bereitstellungsmodi](/docs/polyglot/deployment-modes). Diese Seite behandelt die Distribution im Dienstmodus.

Verwenden Sie den eigenständigen Server für:
- **Mehrsprachige Workflows**: PHP-, Python- und Rust-Worker mit gemeinsamer dauerhafter Laufzeit
- **Microservice-Orchestrierung**: Koordination von Diensten unterschiedlicher Sprachen
- **Zentrale Workflow-Laufzeit**: mehrere Anwendungen mit gemeinsamer Engine
- **Umgebungen ohne Laravel**: Durable Workflow außerhalb von Laravel

Wenn Sie v2 bereits in Laravel einbetten, verwenden Sie den [Migrationsleitfaden zu Server](/docs/polyglot/embedded-to-server), um Typkennungen vorzubereiten, Server neben dem eingebetteten Betrieb bereitzustellen, Worker anzuschließen und nur neue Starts umzuleiten. Beachten Sie dabei [Bereitstellungsmodi](/docs/polyglot/deployment-modes), damit Kennungen, Befehlsergebnisse, Aufgabensemantik und Laufzeitverantwortung eindeutig bleiben.

Siehe [Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing) für Build-Kohorten-Rollouts, Drain alter Kohorten und die Bindung langer Läufe an kompatible Worker bei Rücknahmen.

Siehe [Server-Rollentopologie](/docs/polyglot/server-role-topology) für Rollenbegriffe, Prozessklassen, Zuständigkeitsgrenzen, Fehlerdomänen und Migrationswege aus `GET /api/cluster/info`.

## Schnellstart {#quick-start}

### Veröffentlichtes Image und SQLite {#published-image--sqlite}

Der schnellste Start ohne Quellcode verwendet das veröffentlichte Docker-Image. Dieses Beispiel nutzt SQLite, Datenbank-Queues und Dateicache im Container. Binden Sie `/app/database` ein, damit Initialisierung und API dieselbe SQLite-Datei verwenden:

```bash
server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-server-quickstart

docker run --rm \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" server-bootstrap

docker rm -f durable-workflow-server durable-workflow-server-queue-worker >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 127.0.0.1:8080:8080 \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image"

docker run -d --name durable-workflow-server-queue-worker \
  --health-cmd="server-process-healthcheck worker" \
  -v durable-workflow-server-quickstart:/app/database \
  -e DW_SERVER_PROCESS_CLASS=worker_node \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$server_image" php artisan queue:work database --queue=default --sleep=1 --tries=3

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl http://localhost:8080/api/health
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

Dies erstellt den Standard-Namespace und startet API sowie Infrastruktur-Queue-Worker. Die Laravel-Queue heißt `default` und ist von benannten SDK-Queues getrennt. Der Queue-Worker treibt dauerhafte Timer auch bei gestoppten SDK-Workern voran. Schedule-Auswertung und Produktionswartung benötigen die zusätzlichen Rollen des unten veröffentlichten Compose-Stacks.

Die API ist an Loopback gebunden; `dev-token` dient nur dieser lokalen Übung. Verwenden Sie für Fernzugriff die Compose-Bereitstellung mit eigenen Zugangsdaten, TLS und Netzwerkschutz. Nutzen Sie den Stack mit MySQL und gemeinsamem Redis für eine Produktionsprobe.

Entfernen Sie nach der Übung diese Container und Datenbank:

```bash
docker rm -f durable-workflow-server durable-workflow-server-queue-worker
docker volume rm durable-workflow-server-quickstart
```

### Veröffentlichtes Image und Compose {#published-image--compose}

Verwenden Sie das veröffentlichte Compose-Artefakt für einen quellcodefreien Mehrcontainer-Stack mit MySQL und Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

server_image=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

env DW_SERVER_IMAGE="$server_image" docker compose \
  -f docker-compose.published.yml up -d --wait
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info \
  | jq '.topology | {current_shape, current_roles, execution_mode}'
```

### Ports {#ports}

| Dienst | Port | Zweck |
|---------|------|---------|
| Server-API | 8080 | Steuerungs- und Worker-Protokollendpunkte |
| MySQL | 3306 | Für Entwicklung freigegebene Datenbank |
| Redis | 6379 | Für Entwicklung freigegebener Cache und Queue |

## Konfiguration {#configuration}

Server wird über Umgebungsvariablen konfiguriert. Die wichtigsten Einstellungen folgen hier; der vollständige betriebliche `DW_*`-Vertrag steht in der [Konfigurationsreferenz](/docs/polyglot/server-config-reference).

### Datenbank {#database}

```bash
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=workflow
DB_USERNAME=workflow
DB_PASSWORD=secret
```

Unterstützt: MySQL 8.0+, PostgreSQL 13+, SQLite 3.35+.

### Cache und Queue {#cache-and-queue}

```bash
CACHE_STORE=redis
QUEUE_CONNECTION=redis

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_DB=0
```

Der Cache muss [atomare Sperren](https://laravel.com/docs/12.x/cache#atomic-locks) unterstützen. Queue-Treiber: Redis, Amazon SQS, Beanstalkd, Datenbank.

Atomare Cache-Sperren sind für serverseitige [Queue-Zulassungsgrenzen](/docs/polyglot/task-queue-admission) und Abfrage-Gegendruck erforderlich. Verwenden Sie Redis bei mehreren Knoten, damit Zulassung für Workflows, Aktivitäten und Abfragen über alle Server-Prozesse gilt.

### Authentifizierung {#authentication}

Server unterstützt drei Authentifizierungsmodi:

**Tokenbasiert** (Standard):

```bash
DW_AUTH_DRIVER=token
DW_AUTH_TOKEN=your-secret-token-here
```

Jede Anfrage muss `Authorization: Bearer your-secret-token-here` senden.

Für minimale Berechtigungen konfigurieren Sie rollenbezogene Tokens statt eines gemeinsamen Tokens:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Worker-Tokens erlauben Registrierung, Polling, Heartbeats und Aufgabenabschluss. Operator-Tokens können Workflows starten, auflisten, signalisieren, abfragen, aktualisieren, reparieren, abbrechen, terminieren, archivieren und beobachten. Admin-Tokens erlauben administrative Endpunkte wie Namespace- und Aufbewahrungsverwaltung.

**HMAC-Signatur**:

```bash
DW_AUTH_DRIVER=signature
DW_SIGNATURE_KEY=your-signature-secret
```

Anfragen müssen `X-Signature` enthalten, berechnet als `hash_hmac('sha256', request_body, DW_SIGNATURE_KEY)`. Server akzeptiert auch rollenbezogene Signaturschlüssel:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

**Ohne Authentifizierung** (nur Entwicklung):

```bash
DW_AUTH_DRIVER=none
```

**Verwenden Sie `none` nicht in Produktion.** Alle Endpunkte werden öffentlich zugänglich.

### Workflow-Paket {#workflow-package}

Das Docker-Image installiert `durable-workflow/workflow`. So bestimmen Sie die Version:

```bash
# Build-time arg (set in docker-compose.yml or pass to docker build)
WORKFLOW_PACKAGE_REF=v2        # branch, tag, or commit
WORKFLOW_PACKAGE_SOURCE=       # custom Git remote (optional)
```

### Aufbewahrung {#retention}

PHP Server wählt Historie geschlossener Läufe anhand der Namespace-Aufbewahrung zur Bereinigung aus. Die begrenzte Standarddauer wird so konfiguriert:

```bash
DW_HISTORY_RETENTION_DAYS=30
```

Jeder Suchlauf verwendet die **aktuelle** Namespace-Regel. Eine geänderte Dauer gilt auch für bereits zuvor geschlossene Historie. Sie beginnt nicht für jeden Lauf eine neue Aufbewahrungsfrist am Änderungstag.

| Regeländerung | Auswirkung auf erhaltene geschlossene Läufe |
| --- | --- |
| Begrenzte Aufbewahrung verkürzen | Ältere Läufe können beim nächsten Suchlauf geeignet werden. |
| Begrenzte Aufbewahrung verlängern | Erhaltene Läufe können ungeeignet werden. Bereits entfernte Historie wird nicht wiederhergestellt. |
| Zu `forever` wechseln | Suchläufe wählen keine Läufe aus; auch explizite Durchläufe überspringen sie. |
| Von `forever` zu `bounded` wechseln | `retention_days` angeben; bestehende geschlossene Historie wird nach dieser Dauer bewertet. |

Am **19. Oktober um 12:00 UTC** ist ein am **1. Oktober um 12:00 UTC** geschlossener Lauf 18 Tage alt. Er liegt außerhalb einer 7-Tage- und innerhalb einer 90-Tage-Frist. Eine Verkürzung von 90 auf 7 Tage macht ihn sofort geeignet; ein späterer Durchlauf kann ihn bereinigen. Ein genau an der Grenze geschlossener Lauf wird in diesem Suchlauf nicht ausgewählt, da der Vergleich strikt früher verlangt.

#### Änderung der Aufbewahrung prüfen {#review-a-retention-change}

Prüfen Sie vor einer Verkürzung Abschlusszeiten und erhalten Sie benötigte Historie. Exportieren Sie wichtige Läufe über die [Historienexport-API](./server-api-reference.md#workflow-control-plane) und halten Sie wiederherstellbare Datenbank- und Payload-Sicherungen vor. Ein Replay-Export benötigt seine referenzierten Objekte und ersetzt keine Datenbank- und Speichersicherung.

Aktualisieren Sie den Namespace mit Admin-Zugangsdaten:

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/orders-prod" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"retention_mode":"bounded","retention_days":7}'
```

Senden Sie für `forever` den Wert `{"retention_mode":"forever","retention_days":null}`. Die Rückkehr zu begrenzter Aufbewahrung verlangt eine ausdrückliche Dauer von 1 bis 365 Tagen.

Prüfen Sie die aktuelle Namespace-Regel und begrenzte Liste geeigneter Läufe:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/system/retention?limit=100" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

`cutoff` beschreibt den aktuellen Suchlauf. `expired_run_count` zählt zurückgegebene Kennungen bis `scan_limit`, nicht den gesamten Rückstand. `scan_pressure: true` bedeutet, dass die Grenze erreicht wurde. Dieser Lesezugriff löscht keine Historie.

Die Änderung ist weder Bereinigungsvorschau noch Schonfrist: Gewöhnliche Worker-Heartbeats können danach bereits eine kleine gedrosselte Bereinigung auslösen. Geplantes `history:prune` und ausdrückliche Systemdurchläufe können ebenfalls geeignete Läufe bearbeiten. Sichern und prüfen Sie **vor** Verkürzung der Regel.

#### Bereinigung und Schutz {#cleanup-and-protections}

`POST /api/system/retention/pass` ohne `run_ids` wählt abgelaufene Läufe nach aktueller Regel bis zur Grenze aus. Prüfen Sie `pruned`, `skipped`, `failed` und laufbezogene Gründe, um Auswahl und abgeschlossene Löschung zu unterscheiden.

:::warning Explizite Laufkennungen umgehen die altersbasierte Auswahl

Bei PHP Server zielt `run_ids` unmittelbar auf die angegebenen geschlossenen Läufe, auch auf jüngere als die aktuelle begrenzte Aufbewahrung. Es ist keine Schnittmenge mit abgelaufenen Läufen. Prüfen Sie jedes Ziel als destruktiven Vorgang; lassen Sie `run_ids` für gewöhnliche altersbasierte Bereinigung weg.

:::

Aufbewahrungsdurchläufe überspringen archivierte Läufe und `forever`-Namespaces. Archivierung erhält Historie in derselben Datenbank und ist keine unabhängige Sicherung. Weitere Sperren, etwa unvollendete abgekoppelte Aktivitäten, können Löschung ebenfalls verhindern. Prüfen Sie den gemeldeten Grund, statt einen ausgewählten Lauf als entfernt anzusehen.

Für längere Nachweise als 1 bis 365 Tage wählen Sie Datenbankerhalt oder unabhängige geprüfte Exporte. Das [Verfahren für langfristige Historie](../configuration/pruning-workflows.md#keeping-history-beyond-database-retention) beschreibt `CloseTime`, Paginierung, externe Bytes und Abgleich vor Bereinigung. Die veröffentlichte API kann Archivierung nicht aufheben. Archivierte Läufe können somit später nicht durch Server-Aufbewahrungsdurchläufe gelöscht werden.

Bereinigung entfernt Historie, zugehörige Details und geeignete externe Payloads. Eine spätere Verlängerung stellt sie nicht wieder her. Der [eingebettete Bereinigungsleitfaden](../configuration/pruning-workflows.md) beschreibt einen eigenen anwendungsgesteuerten Vorgang; seine API verwendet nicht Servers Namespace-Regel. Prüfen Sie für andere Laufzeiten deren Verhalten, bevor Sie dieses PHP-Verfahren anwenden.

### Namespaces {#namespaces}

`server-bootstrap` führt Migrationen aus und legt den Namespace `default` an. Mit `DW_DEFAULT_NAMESPACE` ändern Sie den bei fehlendem Namespace-Header verwendeten Namespace:

```bash
DW_DEFAULT_NAMESPACE=default
```

Erstellen Sie Namespaces über die API:

```bash
curl -X POST http://localhost:8080/api/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "description": "Production workflows",
    "retention_days": 90
  }'
```

## Gesundheitsprüfungen {#health-checks}

### API-Gesundheit {#api-health}

```bash
curl http://localhost:8080/api/health
```

Gibt `200 OK` mit folgendem Inhalt zurück:

```json
{
  "status": "serving",
  "timestamp": "2026-04-15T12:00:00Z",
  "checks": {
    "database": "ok"
  },
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 4,
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": ["api_ingress", "control_plane", "matching", "history_projection"],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": ["connection", "queue", "compatibility", "namespace"],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    }
  }
}
```

### Öffentliche Topologieübersicht {#public-topology-summary}

Die nicht authentifizierten Routen `GET /api/health` und `GET /api/ready` veröffentlichen beide die `topology`-Übersicht des antwortenden Knotens. Dieser öffentliche Block ist bewusst kleiner als `/api/cluster/info`, enthält aber die Felder zur Rollenidentifikation vor Authentifizierung und Namespace-Auflösung:

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

`topology.matching_role.discovery_limits` ist der festgeschriebene numerische Zuordnungsvertrag des Workflow-Pakets: `poll_batch_cap` ist die maximale Zahl bereiter Aufgaben je Poll; `availability_ceiling_seconds` die backendübergreifende Toleranz für `available_at` bei Zeitstempeldrift unter einer Sekunde; `wake_signal_ttl_seconds` die Standard-Signal-TTL von `CacheLongPollWakeStore`; `workflow_task_lease_seconds` und `activity_task_lease_seconds` die Standard-Lease-Dauern. Verschärfungen ändern das Protokoll, weil Worker und nachgelagerte Werkzeuge diese Werte als maßgeblich lesen.

Dieselbe Übersicht erscheint auch bei fehlender Bereitschaft auf `/api/ready`. Probes können so bei Initialisierungssperren weiterhin `server_http_node`, `scheduler_node`, `matching_node` und `execution_node` unterscheiden.

### Bereitschaft {#readiness}

```bash
curl http://localhost:8080/api/ready
```

`/api/ready` ist die Bereitstellungsschranke. Sie liefert `200 OK` nur, wenn Initialisierungsvoraussetzungen und Rollout-Sicherheit bereit sind oder lediglich warnen.

Lesen Sie die maschinenlesbaren Felder wie folgt:

- `checks.migrations.repository_exists` und `checks.migrations.pending_migrations` zeigen vorhandenes Migrationsregister und ausstehende Migrationen.
- `checks.migrations.adoptable_migrations` listet Tabellenerstellungsmigrationen, die nur in die Migrationshistorie übernommen werden müssen. Dies ist `warning`, keine sperrende Störung; Server kann während der Planung bereit bleiben.
- `checks.migrations.blocking_migrations` nennt vor Verkehrszulassung erforderliche Rollout-Sicherheitsmigrationen. Bei nichtleerem Array sperrt Bereitschaft mit `checks.migrations.status = "pending"`.
- `checks.migrations.missing_tables` meldet fehlende dauerhafte Tabellen; `checks.migrations.operator_surface` zeigt, ob die v2-Betriebsoberfläche Rollout-Sicherheit beim Start hinreichend erklären kann.
- `checks.migrations.readiness_contract.version` legt die von Skripten auszuwertende Revision für Start und Migrationsübernahme fest.
- `checks.workflow_v2` spiegelt die Namespace-übergreifende Rollout-Sicherheit. Ist deren Prüfung noch nicht möglich, nennen `status: "blocked"`, `blocked_by`, `message` und `remediation` die nötige Behebung der vorgeschalteten Schranke statt Queue-Symptomen.

### Workflow-Initialisierungsschranke {#workflow-bootstrap-gate}

`checks.workflow_v2.status: "blocked"` ist auch eine Routensperre. Bei blockierter v2-Initialisierung verweigert Server Workflow-Start/-Änderung, Schedule-Änderung, Bridge-Adapter und Worker-Routen mit HTTP `503` und `reason: "workflow_v2_blocked"`. Die Prüfung folgt auf Rollen- und Versionsvalidierung, erfolgt aber vor Namespace-Auflösung. Blockierte Anfragen können dessen Existenz nicht feststellen.

Die Initialisierungssperrantwort enthält immer:

- `reason: "workflow_v2_blocked"`, damit Aufrufer nach maschinenlesbarem Namen statt Nachricht verzweigen
- `blocked_by`: geordnete Liste vorgeschalteter Bereitschaftssperren, etwa `migrations`
- `remediation`: Betriebsanweisung zur Behebung, entsprechend `/api/ready` `checks.workflow_v2.remediation`

Von der Initialisierungssperre betroffene Routenfamilien:

- **Workflow-Start und -Änderung**: Start-, Befehls- und laufbezogene Befehlsrouten unter `/api/workflows`.
- **Schedule-Änderung**: `POST /api/schedules`, `PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`, `POST /api/schedules/{scheduleId}/pause`, `POST /api/schedules/{scheduleId}/resume`, `POST /api/schedules/{scheduleId}/trigger` und `POST /api/schedules/{scheduleId}/backfill`.
- **Bridge-Adapter**: `POST /api/bridge-adapters/webhook/{adapter}`.
- **Worker-Protokoll**: alle Routen `/api/worker` und `/api/worker/*`, einschließlich Registrierung, Heartbeat und Workflow-, Abfrage- und Aktivitätsaufgaben. Sie behalten Protokollhülle und `X-Durable-Workflow-Protocol-Version`, damit SDKs dasselbe `reason: "workflow_v2_blocked"` wie die Steuerung auswerten.

Schedule-**Lesezugriffe** bleiben zur Untersuchung während Wiederherstellung ausdrücklich verfügbar: `GET /api/schedules`, `GET /api/schedules/{scheduleId}` und `GET /api/schedules/{scheduleId}/history` funktionieren auch bei gesperrter Initialisierung.

### Server-Fähigkeiten {#server-capabilities}

```bash
curl http://localhost:8080/api/cluster/info \
  -H "Authorization: Bearer $TOKEN"
```

Liefert Server-Buildversion, unterstützte SDK-Versionen, Engine-Fähigkeiten, Client-Kompatibilitätsregel sowie unabhängig versionierte Steuerungs- und Worker-Manifeste:

```json
{
  "server_id": "server-1",
  "version": "2.0.0",
  "default_namespace": "default",
  "supported_sdk_versions": {
    "php": ">=1.0",
    "python": ">=0.2,<1.0",
    "cli": ">=0.1,<1.0"
  },
  "client_compatibility": {
    "schema": "durable-workflow.v2.client-compatibility",
    "version": 1,
    "authority": "protocol_manifests",
    "top_level_version_role": "informational",
    "fail_closed": true
  },
  "capabilities": {
    "workflow_tasks": true,
    "activity_tasks": true,
    "signals": true,
    "queries": true,
    "updates": true,
    "schedules": true,
    "child_workflow_retry_policy": true,
    "child_workflow_timeouts": true,
    "payload_codecs": ["avro"],
    "response_compression": ["gzip", "deflate"]
  },
  "control_plane": {
    "version": "2",
    "header": "X-Durable-Workflow-Control-Plane-Version",
    "request_contract": { "schema": "durable-workflow.v2.control-plane-request.contract", "version": 1, "...": "..." },
    "response_contract": { "schema": "durable-workflow.v2.control-plane-response.contract", "version": 1, "...": "..." }
  },
  "worker_protocol": {
    "version": "1.0",
    "server_capabilities": {
      "long_poll_timeout": 30,
      "supported_workflow_task_commands": [
        "complete_workflow",
        "fail_workflow",
        "continue_as_new",
        "schedule_activity",
        "start_timer",
        "start_child_workflow"
      ],
      "workflow_task_poll_request_idempotency": true,
      "poll_status": true,
      "history_page_size_default": 500,
      "history_page_size_max": 1000,
      "activity_retry_policy": true,
      "activity_timeouts": true,
      "child_workflow_retry_policy": true,
      "child_workflow_timeouts": true,
      "parent_close_policy": true,
      "non_retryable_failures": true,
      "response_compression": ["gzip", "deflate"],
      "history_compression": {
        "supported_encodings": ["gzip"],
        "compression_threshold": 8192
      }
    }
  }
}
```

Für Client-Prüfungen gilt `client_compatibility.authority: "protocol_manifests"`. Das oberste `version` ist die Build-Identität. CLI und SDK müssen bei fehlendem oder nicht unterstütztem `control_plane.version`, `control_plane.request_contract` oder `worker_protocol.version` ablehnen.

### Rollentopologie und Bereitstellungsform {#role-topology-and-deployment-shape}

Die feldgenaue Referenz dieses Manifests steht unter [Server-Rollentopologie](/docs/polyglot/server-role-topology). Dieser Abschnitt enthält das eingebettete `cluster/info`-Beispiel; verwenden Sie die eigene Seite für unterstützte Formen, Zuständigkeiten, Fehlerdomänen, Skalierungsgrenzen und Migration.

`GET /api/cluster/info` veröffentlicht auch das Manifest `topology`, die maschinenlesbare Rollenkarte des antwortenden Knotens. Betreiber und Werkzeuge erhalten einen Vertrag, statt Aufgaben aus Containernamen oder Rollout-Handbüchern abzuleiten.

```json
{
  "topology": {
    "schema": "durable-workflow.v2.role-topology",
    "version": 2,
    "supported_shapes": [
      "embedded",
      "standalone_server",
      "split_control_execution"
    ],
    "role_vocabulary": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection",
      "scheduler",
      "execution_plane"
    ],
    "current_shape": "standalone_server",
    "current_process_class": "server_http_node",
    "current_roles": [
      "api_ingress",
      "control_plane",
      "matching",
      "history_projection"
    ],
    "execution_mode": "remote_worker_protocol",
    "matching_role": {
      "queue_wake_enabled": true,
      "shape": "in_worker",
      "wake_owner": "worker_loop",
      "task_dispatch_mode": "poll",
      "partition_primitives": [
        "connection",
        "queue",
        "compatibility",
        "namespace"
      ],
      "backpressure_model": "lease_ownership",
      "discovery_limits": {
        "poll_batch_cap": 100,
        "availability_ceiling_seconds": 1,
        "wake_signal_ttl_seconds": 60,
        "workflow_task_lease_seconds": 300,
        "activity_task_lease_seconds": 300
      }
    },
    "shape_assignments": {
      "embedded": {
        "process_classes": [
          {
            "name": "application_process",
            "roles": [
              "control_plane",
              "matching",
              "history_projection",
              "scheduler",
              "execution_plane"
            ]
          }
        ]
      },
      "standalone_server": {
        "process_classes": [
          {
            "name": "server_http_node",
            "roles": [
              "api_ingress",
              "control_plane",
              "matching",
              "history_projection"
            ]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "worker_node",
            "roles": ["execution_plane"]
          }
        ]
      },
      "split_control_execution": {
        "process_classes": [
          {
            "name": "ingress_node",
            "roles": ["api_ingress"]
          },
          {
            "name": "control_plane_node",
            "roles": ["control_plane", "history_projection"]
          },
          {
            "name": "scheduler_node",
            "roles": ["scheduler"]
          },
          {
            "name": "matching_node",
            "roles": ["matching"]
          },
          {
            "name": "execution_node",
            "roles": ["execution_plane"]
          }
        ]
      }
    },
    "authority_boundaries": {
      "control_plane": {
        "writes": [
          "workflow_instances",
          "workflow_runs.status",
          "workflow_tasks.lifecycle"
        ]
      },
      "execution_plane": {
        "writes": [
          "workflow_tasks.outcomes",
          "activity_attempts",
          "worker_compatibility_heartbeats"
        ]
      },
      "matching": {
        "writes": [
          "workflow_tasks.leases",
          "activity_tasks.leases"
        ]
      },
      "history_projection": {
        "writes": [
          "history_events",
          "workflow_run_summaries",
          "workflow_history_exports"
        ]
      },
      "scheduler": {
        "writes": [
          "workflow_schedules.fire_state",
          "workflow_starts.scheduled"
        ]
      },
      "api_ingress": {
        "writes": ["worker_registrations"]
      }
    },
   "failure_domains": {
      "control_plane_down": {
        "effect": "workers_continue_claimed_tasks_only_until_lease_expiry",
        "operator_signal": "operator_commands_fail_fast"
      },
      "execution_plane_down": {
        "effect": "ready_tasks_accumulate_without_loss",
        "operator_signal": "operators_see_ready_depth_growth"
      },
      "matching_down": {
        "effect": "claim_falls_back_to_direct_ready_task_discovery",
        "operator_signal": "ready_depth_rises_while_claim_rate_falls"
      },
      "history_projection_down": {
        "effect": "projection_reads_may_stale_while_durable_writes_continue",
        "operator_signal": "projection_lag_seconds_may_increase"
      },
      "scheduler_down": {
        "effect": "scheduled_workflows_stop_firing_and_record_missed_runs",
        "operator_signal": "operators_see_missed_schedule_state"
      },
      "api_ingress_down": {
        "effect": "external_http_traffic_stops_at_the_edge",
        "operator_signal": "embedded_in_process_calls_may_continue"
      }
    },
    "scaling_boundaries": {
      "api_ingress": "incoming_http_request_rate",
      "control_plane": "operator_commands_and_run_lifecycle_transitions",
      "matching": "ready_task_rate_and_poller_count",
      "history_projection": "durable_event_rate",
      "scheduler": "active_schedule_count",
      "execution_plane": "workflow_and_activity_task_rate"
    },
    "migration_path": [
      {
        "step": "audit_role_boundaries",
        "result": "tooling flags cross-role writes before runtime shape changes",
        "reversible": true
      },
      {
        "step": "expose_role_bindings",
        "result": "container seams allow out-of-process adapters without patching the package",
        "reversible": true
      },
      {
        "step": "introduce_dedicated_matching_shape",
        "result": "matching can run as its own process class without changing the claim contract",
        "reversible": true
      },
      {
        "step": "split_history_projection",
        "result": "history and projections can move out of process without introducing a second writer",
        "reversible": true
      },
      {
        "step": "split_scheduler",
        "result": "schedule firing can move behind leader election while single-replica deployments stay legal",
        "reversible": true
      },
      {
        "step": "optional_execution_partitioning",
        "result": "workers can partition by namespace, connection, queue, and compatibility",
        "reversible": true
      }
    ],
    "kernel_invariants": [
      {
        "id": "single_persistence_engine",
        "summary": "one workflow database backs every topology shape; role split does not introduce a second persistence engine",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_worker_protocol",
        "summary": "one HTTP worker protocol carries claim, complete, fail, and heartbeat traffic across every topology; role split does not fork the worker contract",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_history_writer",
        "summary": "history_events has exactly one durable writer per logical event regardless of where the history/projection role runs",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "single_control_authority_per_run",
        "summary": "every mutation of a given workflow run routes through one control-plane authority; per-run row locks serialise transitions across replicas",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "embedded_topology_remains_supported",
        "summary": "the embedded shape where one process fills every role MUST stay legal; existing embedded hosts are never forced to migrate",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      },
      {
        "id": "role_split_is_topology_only",
        "summary": "splitting roles is a topology change, not a product fork; collapsing the roles back onto a single process is always a legal topology",
        "applies_to": ["embedded", "standalone_server", "split_control_execution"]
      }
    ]
  },
  "coordination_health": {
    "schema": "durable-workflow.v2.coordination-health.contract",
    "version": 2,
    "namespace_scope": "all_namespaces",
    "status": "ok",
    "http_status": 200,
    "warning_checks": [],
    "error_checks": [],
    "categories": {
      "correctness": "ok"
    },
    "checks": [
      {
        "name": "worker_compatibility",
        "status": "ok",
        "category": "correctness",
        "message": null
      },
      {
        "name": "activity_path",
        "status": "ok",
        "category": "correctness",
        "message": null
      }
    ],
    "routing_drains": {
      "queues_with_drains": 0,
      "draining_build_id_count": 0,
      "active_worker_count": 0,
      "draining_worker_count": 0,
      "stale_worker_count": 0,
      "queues": []
    }
  }
}
```

`topology.version` ist die Schemaversion des Rollenmanifests, nicht die Server-Buildversion. Prüfen Sie sie, bevor Sie neuere Felder voraussetzen. Der aktuelle Vertrag umfasst `supported_shapes`, `role_vocabulary`, `current_shape`, `current_process_class`, `current_roles`, `execution_mode`, `matching_role`, `role_catalog`, `shape_assignments`, `authority_boundaries`, `authority_surfaces`, `failure_domains`, `supported_topologies`, `scaling_boundaries`, `migration_path` und `kernel_invariants`.

Lesen Sie die Felder wie folgt:

- `supported_shapes` nennt zulässige Produkttopologien.
- `role_vocabulary` ist die feste v2-Rollenliste und der maßgebliche Wortschatz für Werkzeuge und Diagnosen.
- `current_shape`, `current_process_class` und `current_roles` beschreiben den abgefragten Knoten. Verwenden Sie die Prozessklasse als erklärte Identität und vergleichen Sie das Rollenbündel mit `shape_assignments`, um sie zu validieren.
- `execution_mode` unterscheidet eingebettete Queue-Ausführung (`local_queue_worker`) vom Server-Worker-Protokoll (`remote_worker_protocol`).
- `matching_role.queue_wake_enabled`, `matching_role.shape`, `matching_role.wake_owner`, `matching_role.task_dispatch_mode`, `matching_role.partition_primitives` und `matching_role.backpressure_model` zeigen internen Worker-Weckpfad oder eigene Reparatur-/Zuordnungsschleife, stabile Routing-Achsen und aktuelle dauerhafte Zulassungsgrenze.
- `matching_role.discovery_limits` schreibt die kompilierten Zahlen fest: `poll_batch_cap` für maximale bereite Zeilen je Poll; `availability_ceiling_seconds` als backendübergreifende Toleranz für `available_at` bei Drift unter einer Sekunde; `wake_signal_ttl_seconds` für Wecksignal-TTL; `workflow_task_lease_seconds` und `activity_task_lease_seconds` für Standard-Leases. Damit prüfen Betreiber den Vertrag ohne Quellcode-Suche. Verschärfungen ändern das Protokoll.
- `role_catalog` und `authority_surfaces` nennen Schnittstellen und dauerhafte Änderungspfade je Rolle dieser Manifestrevision.
- `shape_assignments` ordnet jeder unterstützten Form zulässige Prozessklassen und Rollenbündel zu.
- `supported_topologies` fasst Bereitstellungsfamilien und erwartete Knotenklassen zusammen.
- `authority_boundaries` nennt erwartete dauerhafte Schreibflächen je Rolle, um Abweichungen vor einer Aufteilung zu erkennen.
- `failure_domains` beschreibt das erste sichtbare Degradationssignal bei Rollenausfall.
- `scaling_boundaries` nennt die wesentliche Lastdimension jeder getrennten Rolle.
- Authentifizierte gehostete Routen verweigern Zugriff, wenn der Knoten keine HTTP-Steuerungsoberfläche hat. `503`, `reason: "topology_role_unavailable"`, `current_shape`, `current_process_class`, `current_roles`, `required_roles` und `missing_roles` ermöglichen Umleitung zu einem geeigneten Knoten.
- `coordination_health` ist die Flottenübersicht der Rollout-Sicherheit über `all_namespaces`, mit Status, HTTP-Verhalten und normalisierten Bereitschaftswarnungen/-fehlern. Vorgeschaltete Sperren ergänzen `blocked_by`, `message` und `remediation`.
- `coordination_health.checks[]` enthält stets die festgeschriebene Prüfung `activity_path` neben `worker_compatibility`, `task_transport`, `routing_health`, `durable_resume_paths` und Projektions-/Scheduler-Prüfungen. Als Aktivitätsgegenstück zu `task_transport` meldet sie nicht durchgesetzte Schedule-to-start-, Start-to-close-, Schedule-to-close- oder Heartbeat-Fristen (`timeout_overdue`, `oldest_timeout_overdue_at`, `max_timeout_overdue_age_ms`) sowie dauerhaften Wiederholungsrückstand (`retrying`, `oldest_retrying_started_at`, `max_retrying_age_ms`). Umbenennung ist eine Protokolländerung.
- `coordination_health.routing_drains` fasst abgezogene Build-Kohorten über Queues und Namespaces zusammen. `queues_with_drains` größer null bedeutet absichtlich von mindestens einer Drain-Kohorte ferngehaltenen Verkehr.
- `migration_path` beschreibt geordnete Schritte zu stärkerer Rollentrennung ohne zweite Engine. `reversible: true` erlaubt die Rückkehr zu einer weniger getrennten Topologie.
- `kernel_invariants` nennt dauerhaft einzuhaltende Garantien: `single_persistence_engine`, `single_worker_protocol`, `single_history_writer`, `single_control_authority_per_run`, `embedded_topology_remains_supported` und `role_split_is_topology_only`. `applies_to` nennt betroffene Formen. Rollout-Werkzeuge DÜRFEN damit vor einer Formänderung den Kernvertrag prüfen.

Rollentrennung bleibt eine Topologieänderung ohne zweite Engine oder gesonderte Steuerungs-API. Beim Übergang von `standalone_server` zu `split_control_execution` lesen Betreiber dieselbe Erkennungsoberfläche. `current_shape`, `current_roles`, `execution_mode`, `matching_role`, `shape_assignments`, `authority_boundaries`, `failure_domains`, `scaling_boundaries` und `migration_path` sind gemeinsam versioniert, damit Werkzeuge die tatsächlich gelieferte Topologie beurteilen.

Dieselbe Vorgabe ist über `topology.kernel_invariants` maschinenlesbar. So können Werkzeuge vor Änderungen prüfen, dass keine zweite Persistenz-Engine, kein abweichendes Worker-Protokoll, kein zweiter Historienschreiber und keine unumkehrbare Migration eingeführt werden.

Die Rollenschranke betrifft nur authentifizierte API- und Worker-Endpunkte. `GET /api/health`, `GET /api/ready` und authentifiziertes `GET /api/cluster/info` bleiben für Erkennung, Liveness und Topologieprüfung verfügbar, auch auf `scheduler_node`, `matching_node` oder `execution_node` ohne HTTP-Steuerungsoberfläche.

Für transportunabhängige externe Handler veröffentlicht derselbe Endpunkt `worker_protocol.external_execution_surface_contract`. Das Manifest benennt die [externe Ausführungsschnittstelle auf Aktivitätsniveau](/docs/polyglot/external-execution), verknüpft Eingabe-/Ergebnishüllen und belässt Workflow-Replay, `ContinueAsNew`, Signal-/Update-/Abfragereihenfolge und Historieninterpretation in echten Laufzeiten.

Wichtige Feldhinweise für Client-Code:

- Die Anwendungsversion heißt `version`, nicht `server_version`.
- Aufgabenbefehle stehen unter `worker_protocol.server_capabilities.supported_workflow_task_commands`, nicht direkt unter `worker_protocol`. Dasselbe Objekt erscheint in jeder Worker-Antwort als `server_capabilities`.
- `worker_protocol.server_capabilities.poll_status` garantiert das maschinenlesbare `poll_status` auch ohne Lease. So sind `empty`, `throttled`, `unavailable` und `draining` ohne Nachrichtenauswertung unterscheidbar.
- Befehlsoptionen wie Wiederholungen, Zeitlimits, Elternabschlussregel und nicht wiederholbare Fehler erscheinen ebenfalls in `server_capabilities`; zusätzliche Cluster-Abfrage ist nicht nötig.
- Der einzige v2-Codec steht unter `capabilities.payload_codecs`: genau `['avro']`. PHP-v1-Import-/Drain-Serialisierer sind interne Migrationstechnik und erscheinen nie als Laufzeitfähigkeit.

## Worker verbinden {#connecting-workers}

Worker pollen Server nach Aufgaben und führen Workflow-Code oder Aktivitäten aus. Siehe [Worker-Protokoll](/docs/polyglot/worker-protocol) für den vollständigen Vertrag. Rollenmatrix, Namespace-Auflösung und genauen Registrierungs-Payload beschreibt [Namespace, Authentifizierung und Registrierung](/docs/polyglot/namespace-auth-workers).

### PHP-Worker {#php-workers}

Frameworkunabhängige PHP-Anwendungen und entfernte Worker verwenden das Server-SDK. Sie installieren weder Laravel noch das eingebettete Workflow-Paket:

<!-- docs-example id="server.php-sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

Erstellen Sie einen Client und registrieren Sie Workflow- oder Aktivitätsfunktionen beim Worker:

```php
use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://localhost:8080',
    token: getenv('DURABLE_WORKFLOW_AUTH_TOKEN') ?: null,
    namespace: 'default',
);

$worker = new Worker($client, taskQueue: 'polyglot-php');
$worker->registerWorkflow(
    'invoice',
    static function (WorkflowContext $context, string $invoiceId): array {
        $context->activity('charge-card', [$invoiceId]);

        return ['invoice_id' => $invoiceId, 'status' => 'paid'];
    },
);
$worker->run();
```

Der [PHP-SDK-Leitfaden](/docs/polyglot/php/) behandelt Client, Authentifizierung, Payloads und Worker-Lebenszyklus. Das gesonderte Paket `durable-workflow/workflow` ist die eingebettete Laravel-Laufzeit und Engine im veröffentlichten Server-Image. Eingebettete Workflows führen paketlokale Aufgaben über den Anwendungs-Queue-Worker aus und benötigen keinen eigenständigen Server.

### Python-Worker {#python-workers}

Python-Worker verwenden das SDK `durable-workflow`:

```bash
pip install %%artifact.pythonPackagePin%%
```

Siehe [Python-SDK-Leitfaden](/docs/polyglot/python) zur Worker-Einrichtung.

### Worker in anderen Sprachen {#custom-language-workers}

Jede Sprache kann einen Worker implementieren:
1. Mit `POST /api/worker/register` registrieren
2. Aufgaben über `POST /api/worker/workflow-tasks/poll`, `POST /api/worker/activity-tasks/poll` oder `POST /api/worker/query-tasks/poll` per Long Poll abfragen
3. Aufgaben über `POST /api/worker/workflow-tasks/{id}/complete`, `POST /api/worker/activity-tasks/{id}/complete` oder `POST /api/worker/query-tasks/{id}/complete` abschließen

Alle Anfragen benötigen:
- `Authorization: Bearer $TOKEN`
- `X-Namespace: your-namespace`
- `X-Durable-Workflow-Protocol-Version: 1.0`

Server prüft die Existenz des Namespace. Legen Sie ihn vor Worker-/Client-Zugriff über `POST /api/namespaces` an, sonst antwortet Server `404` mit `reason: "namespace_not_found"`.

Eine curl-Anleitung steht im [Server-README](https://github.com/durable-workflow/server#getting-started-end-to-end-workflow).

Siehe [Queue-Zulassung](/docs/polyglot/task-queue-admission) für Worker-Plätze, serverseitige Lease-Grenzen, Minutenzustellbudgets und Abfrage-Gegendruck.

## CLI {#cli}

Die [Durable Workflow CLI](/docs/polyglot/cli) bietet eine Shell-Oberfläche für Server:

```bash
# Install — Linux and macOS
curl -fsSL https://durable-workflow.com/install.sh | sh

# Install — macOS (Homebrew alternative)
brew install durable-workflow/tap/dw

# Install — Windows (PowerShell)
# irm https://durable-workflow.com/install.ps1 | iex

# Configure
export DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080
export DURABLE_WORKFLOW_AUTH_TOKEN=your-token
export DURABLE_WORKFLOW_NAMESPACE=default

# Use
dw server:health
dw workflow:list
dw workflow:start --type=my-workflow --input='["value"]'
dw workflow:start --type=my-workflow --input-file=input.json
```

Die [CLI-Installationsseite](/docs/polyglot/cli#install) bietet einen plattformerkennenden Installer und direkte Binärdownloads.

Queue-Befehle enthalten die Zulassungslage für Workflow-, Aktivitäts- und Abfrageaufgaben. Unterscheiden Sie damit fehlende Worker, belegte Plätze, serverseitige Lease-/Ratenbegrenzung und Abfrageüberlauf.

## Bereitstellung {#deployment}

Wählen Sie vor Produktionsverkehr eine unterstützte Topologie im [Leitfaden zum Selbstbetrieb](/docs/deployment). Er unterscheidet lokale Entwicklung, Einzelknotenproduktion, kleine Cluster, rohe Kubernetes-Manifeste und betreute Topologien.

Der selbstbediente Kleincluster-Vertrag ist eng: 2–3 zustandslose API-Knoten hinter einem Load Balancer, eine gemeinsame externe MySQL- oder PostgreSQL-Datenbank, gemeinsames Redis, unabhängig skalierte Worker und genau ein Scheduler-/Wartungsprozess. Wählen Sie je Release Komplettstopp oder [rollende Upgrades](/docs/rolling-upgrades); deren Vertrag benennt Versionsabweichung, Schema, Drain, Bereitschaft und Rücknahme. SQLite-Cluster, Mehrknoten ohne Redis, doppelte Scheduler, aktives Multi-Region und anbieterspezifisches Failover bleiben bis gesonderter Prüfung ausgeschlossen. Helm ist separat versioniert im [Bereitstellungsleitfaden](/docs/deployment#helm-chart-for-kubernetes) beschrieben. [Aktiv/passiv über Regionen](/docs/deployment#activepassive-multi-region) ist betreute Evaluierung, kein bewiesener selbstbedienter 2.0-Vertrag; jede Region muss auf der dokumentierten Einzelregion-/Kleinclusterform aufbauen.

Beginnen Sie im Selbstbetrieb mit veröffentlichten Images statt Quellcode-Builds:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Compose für veröffentlichte Images: [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
- Rohe Kubernetes-Manifeste: [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)

Fixieren Sie in Produktion Versionstag oder Image-Digest, verwenden Sie rollenbezogene Zugangsdaten, führen Sie Initialisierung/Migrationen vor Verkehrszulassung aus und prüfen Sie `/api/ready`, `/api/cluster/info` und Worker-Registrierung. Verlagerung allein aufgrund von `/api/health` ist nicht ausreichend.

## API-Referenz {#api-reference}

Die [Server-API-Referenz](/docs/polyglot/server-api-reference) beschreibt jeden Endpunkt einschließlich Headern, Rollen, Worker-Routen, externem Payload-Speicher und benannten Fehlergründen.

Server bietet drei API-Oberflächen:

### Steuerungsebene {#control-plane}

Starten, beschreiben, signalisieren, abfragen, aktualisieren, abbrechen und terminieren Sie Workflows; verwalten Sie Namespaces, Queues, Schedules, Suchattribute und Worker. Jede Steuerungsanfrage benötigt `X-Durable-Workflow-Control-Plane-Version: 2`; andernfalls folgt `missing_control_plane_version`.

Wichtige Endpunkte:
- `POST /api/workflows`: Workflow starten
- `GET /api/workflows/{id}`: Workflow beschreiben
- `POST /api/workflows/{id}/signal/{name}`: Signal senden
- `POST /api/workflows/{id}/query/{name}`: Abfrage ausführen
- `POST /api/workflows/{id}/update/{name}`: Update ausführen
- `POST /api/workflows/{id}/cancel`: Lauf sofort abgebrochen schließen
- `POST /api/workflows/{id}/terminate`: sofort terminieren
- `GET /api/workflows/{id}/runs/{runId}/history`: Historie auflisten
- `GET /api/workflows/{id}/runs/{runId}/history/export`: Replay-Paket exportieren
- `GET /api/namespaces`, `POST /api/namespaces`, `GET|PUT /api/namespaces/{namespace}`: Namespaces verwalten
- `GET /api/workers`, `GET|DELETE /api/workers/{id}`: Worker-Flotte verwalten
- `GET /api/task-queues`, `GET /api/task-queues/{taskQueue}`: Rückstand, Poller, Leases und Zulassung prüfen
- `GET|POST /api/schedules`, `GET|PUT|DELETE /api/schedules/{id}`, `POST /api/schedules/{id}/{pause|resume|trigger|backfill}`: Schedules verwalten
- `GET|POST|DELETE /api/search-attributes`: Suchattribute verwalten
- `GET|POST|PUT|DELETE /api/service-endpoints...`: rein administrativer Service-Katalog, verschachtelte Dienste, Vorgangsbindungen und dauerhafte Aufruf-Snapshots
- `POST /api/system/repair/pass`, `POST /api/system/activity-timeouts/pass`, `POST /api/system/retention/pass`: Betriebsdurchläufe

Steuerungsantworten einschließlich Historienlisten enthalten verschachtelte `control_plane`-Metadaten für Vorgang und Antwortvertragsversion. Historienexport wird bewusst nicht umhüllt: Das Replay-Paket bleibt unverändert, damit Prüfsumme und optionale Signatur genau das empfangene Artefakt abdecken.

Validierungsfehler liefern HTTP 422 mit `reason: validation_failed`, `errors` und `validation_errors`. Workflow-Routen projizieren dies auch nach `control_plane.reason` und `control_plane.validation_errors`. Laufbezogene Befehlsrouten geben die URL-`run_id` in Antwort und `control_plane.run_id` zurück, um Instanzbefehle von ausdrücklich gewählten Läufen zu unterscheiden.

Queue-Sichtbarkeit unterscheidet wachsenden dauerhaften Rückstand, fehlende Worker-Plätze und Server-Zulassungsgrenzen. `GET /api/task-queues` liefert je Queue eine Übersicht; `GET /api/task-queues/{taskQueue}` ergänzt `pollers` und `current_leases`. Beide bieten `stats.approximate_backlog_count`, `stats.approximate_backlog_age_seconds`, `stats.workflow_tasks.*` und `stats.activity_tasks.*`. Das Detailobjekt `admission` trennt Worker-Kapazität von serverseitiger Queue-/Abfragedrosselung. Flottenweiter Zufluss und Versand stehen unter `operator_metrics.backlog.tasks_added_last_minute` und `operator_metrics.backlog.tasks_dispatched_last_minute`; die Queue-Routen bieten denselben Vergleich als `stats.tasks_added_last_minute` und `stats.tasks_dispatched_last_minute`.

### Worker-Protokoll {#worker-protocol}

Worker registrieren sich, pollen Aufgaben, senden Heartbeats und schließen Aufgaben ab. Erforderlich ist `X-Durable-Workflow-Protocol-Version: 1.0`.

Wichtige Endpunkte:
- `POST /api/worker/register`: Worker registrieren
- `POST /api/worker/workflow-tasks/poll`: Workflow-Aufgaben per Long Poll abrufen
- `POST /api/worker/workflow-tasks/{id}/complete`: Workflow-Aufgabe abschließen
- `POST /api/worker/query-tasks/poll`: von Server geroutete Workflow-Abfragen per Long Poll abrufen
- `POST /api/worker/query-tasks/{id}/complete`: Abfrage abschließen
- `POST /api/worker/query-tasks/{id}/fail`: Abfrage fehlschlagen lassen oder ablehnen
- `POST /api/worker/activity-tasks/poll`: Aktivitätsaufgaben per Long Poll abrufen
- `POST /api/worker/activity-tasks/{id}/complete`: Aktivitätsaufgabe abschließen

Einzelheiten stehen im [Worker-Protokoll](/docs/polyglot/worker-protocol).

### Erkennung ohne Versionierung {#discovery-unversioned}

Nur Erkennungs- und Gesundheitsendpunkte benötigen **kein** `X-Durable-Workflow-Control-Plane-Version`:

- `GET /api/health`: Liveness und öffentliche `topology`-Übersicht ohne Authentifizierung
- `GET /api/ready`: Bereitschaft und dieselbe `topology`-Übersicht ohne Authentifizierung
- `GET /api/cluster/info`: Fähigkeiten, Protokollversionen und einziger Avro-Codec. Clients fragen dies zuerst ab, um unterstützte Steuerungs- und Worker-Versionen zu erkennen.

## Fehlersuche {#troubleshooting}

### Worker erhalten keine Aufgaben {#workers-not-receiving-tasks}

**Prüfen:**
1. Sind Worker registriert? `curl http://localhost:8080/api/workers -H "Authorization: Bearer $TOKEN" -H "X-Durable-Workflow-Control-Plane-Version: 2" -H "X-Namespace: default"`
2. Pollen sie die richtige Queue?
3. Startete der Workflow mit passender Queue?
4. Teilen Server-Instanzen dasselbe Cache-Backend?

### Long-Poll-Verbindungen laufen sofort ab {#long-poll-connections-timing-out-immediately}

**Prüfen:**
1. Unterstützt der Cache atomare Sperren? Testen Sie mit `php artisan workflow:v2:doctor --strict`.
2. Ist Redis von Server erreichbar?
3. Liegt das Load-Balancer-Zeitlimit über dem Long-Poll-Zeitlimit, standardmäßig 60 s?

### Datenbankverbindungsfehler {#database-connection-errors}

**Prüfen:**
1. Datenbankhost und Port richtig?
2. Zugangsdaten gültig?
3. Datenbank vorhanden?
4. Migrationen ausgeführt? `php artisan migrate:status`

### Authentifizierungsfehler {#auth-failures}

**Prüfen:**
1. Entspricht `DW_AUTH_DRIVER` dem Client-Verfahren?
2. Stimmen Token/HMAC-Geheimnis zwischen Server und Client überein?
3. Sind `Authorization: Bearer $TOKEN` oder HMAC-Signaturheader vorhanden?

## Weitere Informationen {#learn-more}

- [Worker-Protokollreferenz](/docs/polyglot/worker-protocol): vollständiger Worker-API-Vertrag
- [Migration von eingebettet zu Server](/docs/polyglot/embedded-to-server): Server aus Laravel-v2-Anwendung einführen
- [Python-SDK](/docs/polyglot/python): Python-Worker entwickeln
- [CLI](/docs/polyglot/cli): Befehlszeilenschnittstelle
- [Server-Repository](https://github.com/durable-workflow/server): Quellcode, Issues und Releases
