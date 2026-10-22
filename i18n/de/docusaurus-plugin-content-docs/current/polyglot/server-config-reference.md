---
sidebar_position: 3
title: Konfigurationsreferenz für Server
description: Umgebungsvariablen, Standardwerte, alte Aliasse und Infrastruktureinstellungen von Durable Workflow Server.
tags:
  - server
  - config
  - reference
  - operations
keywords:
  - Durable Workflow Server-Konfiguration
  - DW-Umgebungsvariablen
  - Server-Umgebungsprüfung
  - Workflow-Server-Umgebung
---

# Konfigurationsreferenz für Server {#server-config-reference}

Diese Seite beschreibt den Vertrag der Umgebungsvariablen `DW_*` für Betreiber des Durable Workflow Server-Images. Nutzen Sie sie für Bereitstellungsvorlagen, die Prüfung der Produktionskonfiguration und die Umstellung älterer Namen `WORKFLOW_*` / `ACTIVITY_*` auf den Server-v2-Vertrag.

Server verwendet außerdem gewöhnliche Laravel-Einstellungen wie `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` und `CACHE_STORE`. Diese Infrastrukturvariablen sind gesondert aufgeführt, weil sie die Bereitstellung konfigurieren und keine Durable Workflow API-Einstellungen darstellen.

## Wann Änderungen wirksam werden {#how-changes-take-effect}

Das veröffentlichte PHP Server-Image führt in seinem Einstiegsskript `php artisan config:cache` aus. Die Umgebungswerte werden beim Start aufgelöst und in den Laravel-Konfigurationscache geschrieben. Änderungen an einer Umgebungsdatei, an der Umgebungsdeklaration des Orchestrators oder an einer eingebundenen Konfigurationsdatei laden eine laufende Bereitstellung nicht neu.

Starten oder ersetzen Sie jeden betroffenen Prozess mit der neuen Konfiguration: HTTP-API-Replikate, lokale Laravel-Queue-Worker und Scheduler-Prozesse. Starten Sie langlebige SDK-Worker gesondert neu, wenn sich deren eigene Client- oder Worker-Konfiguration ändert. Ein erfolgreicher API-Neustart aktualisiert keinen weiterlaufenden Queue-Worker oder Scheduler. Rollen mit gemeinsamer Datenbank und gemeinsamem Cache benötigen eine einheitliche Konfiguration.

Bei einer schrittweisen Änderung setzt jeder Knoten seine eigenen geladenen Grenzen durch. Gemeinsame Zulassungszähler gleichen unterschiedlich konfigurierte Grenzen nicht an. Daher kann ein API-Replikat eine Anfrage annehmen, die ein anderes ablehnt. Wenn eine neue Grenze einheitlich gelten muss:

1. Pausieren Sie neue Anfragen der Aufrufer und nehmen Sie betroffene API-Replikate aus dem Ingress. Lassen Sie laufende Anfragen abschließen. Beenden Sie betroffene Queue- und Scheduler-Rollen innerhalb ihrer Abschaltbudgets geordnet.
2. Wenden Sie dieselbe Konfiguration auf alle betroffenen Rollen an und starten oder ersetzen Sie sie. Das Einstiegsskript jedes Containers baut dessen Konfigurationscache neu auf.
3. Prüfen Sie Startprotokolle auf Konfigurationsfehler, prüfen Sie die Bereitschaft und testen Sie die geänderte Grenze, bevor Sie Ingress und neue Aufruferanfragen wieder freigeben. Siehe den [Leitfaden zu Bereitstellung und Bereitschaft](/docs/deployment#readiness-contract).

In der Datenbank gespeicherte Betriebseinstellungen haben einen anderen Lebenszyklus. Erfolgreiche Änderungen in der folgenden Tabelle stehen nachfolgenden Vorgängen ohne Server-Neustart zur Verfügung:

| Einstellung | Änderung ohne Neustart | Geltung und Grenzen |
| --- | --- | --- |
| Namespace-Beschreibung und Aufbewahrung | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage) oder [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | Die Regel steuert spätere Aufbewahrungsdurchläufe. Ihre Änderung stellt bereits entfernte Daten nicht wieder her. Siehe [Server-Aufbewahrung](/docs/polyglot/server#retention). |
| Externe Payload-Speicherregel des Namespace | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | Ändert die gespeicherte Namespace-Regel. Anbieterzugangsdaten, konfigurierte Dateisystemlaufwerke und andere Prozesseinstellungen erfordern weiterhin den oben beschriebenen Neustart. Erhalten Sie den Zugriff auf Objekte, auf die bestehende Läufe verweisen. |
| Suchattributdefinitionen des Namespace | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | Aktualisiert die Registrierung für nachfolgende Anfragen. Ändert weder die Workflow-Historie noch umgebungsbasierte Größen- und Anzahlgrenzen. |

Die `DW_*`-Standardwerte und Obergrenzen dieser Referenz bleiben Prozesskonfiguration, sofern ein dokumentierter Steuerungsvorgang nicht ausdrücklich gespeicherten Zustand ändert. Server fragt Konfigurationsdateien nicht regelmäßig auf Änderungen ab.

## Prüfung des Vertrags {#how-the-contract-is-enforced}

Im Server-Repository liegt der maßgebliche Vertrag in `config/dw-contract.php`. Beim Containerstart warnt `php artisan env:audit` vor unbekannten `DW_*`-Variablen und alten Namen. Mit `DW_ENV_AUDIT_STRICT=1` schlägt das Einstiegsskript fehl, anstatt mit Warnungen zu starten.

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

Alte Namen dienen nur als Rückfalloption. Verwenden Sie bei neuen Bereitstellungen den Namen `DW_*`. Eine Warnung über einen alten Namen bedeutet eine noch nicht abgeschlossene Migration, auch wenn Server den Wert weiterhin berücksichtigt.

## Server-Identität und Betriebsmodus {#server-identity-and-mode}

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Server-Modus: `service` lässt externe Worker pollen; `embedded` stellt lokal über die Laravel-Queue zu. | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | Eindeutige Server-Instanzkennung für Lease-Inhaberschaft und Worker-Registrierung. | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | Für die Cluster-Erkennung gemeldete Topologie, etwa `embedded`, `standalone_server` oder `split_control_execution`. | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | Für diesen Knoten in der gewählten Topologie gemeldete Prozessklasse, etwa `server_http_node`, `worker_node` oder `scheduler_node`. | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | beim Containerstart erzeugt | Optionaler interner Laufzeitschlüssel von Server. Docker-Images erzeugen bei fehlendem Wert automatisch einen Schlüssel. | - |
| `DW_DEFAULT_NAMESPACE` | `default` | Verwendeter Namespace, wenn eine Anfrage den Namespace-Header auslässt. | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | nicht gesetzt | Überschreibt `workflows.v2.task_dispatch_mode`; im Dienstmodus verwendet Server standardmäßig `poll`, sofern nichts anderes gesetzt ist. | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | nicht gesetzt | Einmaliger MySQL-Wiederherstellungsnachweis für eine nicht aufgezeichnete Memo-Umschreibung: `raw-json` oder `envelope-prefix:<last-converted-id>`. | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | nicht gesetzt | Pfad einer JSON-Datei `durable-workflow.external-executor.config` mit Handler-Zuordnungen des externen Executors. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | nicht gesetzt | Name der vor Server-Validierung und Erkennung angewendeten Überlagerung aus der Konfigurationsdatei des externen Executors. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Authentifizierung {#authentication}

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | nicht gesetzt | Durch Laravel auflösbare Klasse, die `App\Contracts\AuthProvider` implementiert. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Authentifizierungstreiber: `none`, `token` oder `signature`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | nicht gesetzt | Gemeinsames Bearer-Token, wenn kein rollenbezogenes Token konfiguriert ist. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | nicht gesetzt | Gemeinsamer HMAC-Signaturschlüssel, wenn kein rollenbezogener Schlüssel konfiguriert ist. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | nicht gesetzt | Bearer-Token für Worker-Registrierung, Polling, Heartbeats und Abschlüsse. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | nicht gesetzt | Bearer-Token für Lesezugriffe und Betriebsaktionen der Steuerungsebene. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | nicht gesetzt | Bearer-Token für Namespace-, Aufbewahrungs- und andere administrative Änderungen. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | nicht gesetzt | JSON-Tokenzuordnung für benannte Principals. Jeder Eintrag enthält `token`, `subject`, `roles` sowie optional `tenant`, `label` und nicht geheime `claims`. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | nicht gesetzt | HMAC-Schlüssel für Worker-Anfragen mit Signaturauthentifizierung. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | nicht gesetzt | HMAC-Schlüssel für Operator-Anfragen mit Signaturauthentifizierung. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | nicht gesetzt | HMAC-Schlüssel für Admin-Anfragen mit Signaturauthentifizierung. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | Berücksichtigt gemeinsame `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` als Rückfalloption, wenn rollenbezogene Zugangsdaten fehlen. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Verwenden Sie in Produktion rollenbezogene Zugangsdaten. `DW_AUTH_DRIVER=none` ist nur für lokale Funktionstests vorgesehen, weil dann alle Endpunkte ohne Bearer-Token oder Signatur erreichbar sind.

Verwenden Sie `DW_PRINCIPAL_TOKENS`, wenn Prüfprotokolle stabile Akteurskennungen statt bloßer Rollenbezeichnungen benötigen. Server leitet den gespeicherten Principal aus dem passenden Tokeneintrag ab. Clients können ihn nicht mit Anfrage-Payloads oder Headern überschreiben.

## Zuordnung von Befehlen {#command-attribution}

Mit diesen Einstellungen kann ein vertrauenswürdiges Gateway Aufrufermetadaten in der dauerhaften Befehlshistorie erhalten. Belassen Sie `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false`, sofern Server nicht hinter einem Gateway liegt, das nicht vertrauenswürdige, vom Client gesetzte Header entfernt.

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | Speichert weitergeleitete Aufrufer- und Authentifizierungsheader in der Befehlshistorie. | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | Header für den weitergeleiteten Aufrufertyp. | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | Header für die weitergeleitete Aufruferbezeichnung. | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | Header für den weitergeleiteten Authentifizierungsstatus. | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | Header für das weitergeleitete Authentifizierungsverfahren. | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Worker-Polling und Zulassung {#worker-polling-and-admission}

Diese Werte steuern Long-Poll-Zeitbudgets, die Koordination von Wecksignalen, serverseitige Zulassungsgrenzen und begrenzte Budgets für die Aufgabenzustellung.

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Sekunden, die Server einen Poll beim Warten auf eine Aufgabe offen hält. | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Millisekunden zwischen internen Suchläufen während eines offenen Polls. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Millisekunden zwischen Prüfungen auf Wecksignale während eines offenen Polls. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Verzeichnis für die Worker-Poll-Koordination bei dateibasiertem Polling-Cache. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | Lebensdauer warteschlangenbezogener Wecksignale, die einen wartenden Poll vorzeitig beenden. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | nicht gesetzt; für `PHP_CLI_SERVER_WORKERS` abgeleitet | Optionale Grenze gleichzeitig wartender Workflow-/Aktivitäts-Long-Polls auf diesem Server-Knoten. Abfrage-Polls haben ein eigenes Wartebudget. | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | Für Gesundheit und Steuerung reservierte PHP-CLI-Server-Worker bei der Ableitung der Workflow-/Aktivitäts-Long-Poll-Grenze. | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Höchstzahl zurückgegebener Aufgaben je Worker-Poll. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Sekunden bis zum Ablauf des Cache-gestützten Claim-Gates für Worker-Polls im SQLite-Schnellstart-Backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Sekunden Wartezeit auf das Cache-gestützte SQLite-Claim-Gate, bevor Backend-Sperrdruck gemeldet wird. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | nicht gesetzt | Grenze aktiver Workflow-Aufgaben-Leases je Namespace/Warteschlange. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | nicht gesetzt | Grenze aktiver Workflow-Aufgaben-Leases über alle Warteschlangen eines Namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | nicht gesetzt | Zustellungsgrenze je Minute für Workflow-Aufgaben pro Namespace/Warteschlange. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | nicht gesetzt | Zustellungsgrenze je Minute für Workflow-Aufgaben in einem Namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | nicht gesetzt | Grenze aktiver Aktivitätsaufgaben-Leases je Namespace/Warteschlange. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | nicht gesetzt | Grenze aktiver Aktivitätsaufgaben-Leases über alle Warteschlangen eines Namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | nicht gesetzt | Zustellungsgrenze je Minute für Aktivitätsaufgaben pro Namespace/Warteschlange. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | nicht gesetzt | Zustellungsgrenze je Minute für Aktivitätsaufgaben in einem Namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | JSON-Abweichungen nach `namespace:task_queue`, `namespace:*`, `task_queue` oder `*` für aktive Leases, Zustellungsraten, Namespace-Grenzen und nachgelagerte Budgetgruppen. | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Höchstzahl fälliger Timer-Aufgaben, die je Worker-Poll-Durchlauf im Dienstmodus wieder aufgenommen werden. | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Höchstzahl abgelaufener Workflow-Aufgaben, die je Durchlauf wieder aufgenommen werden. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Mindestabstand in Sekunden zwischen Wiederaufnahmedurchläufen abgelaufener Aufgaben je Warteschlange. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

Sticky Execution hat keine eigenen Umgebungsvariablen im Server-Image. Siehe [Sticky Execution](/docs/features/sticky-execution) zu Cache-Lebenszyklus, Worker-Protokollfeldern, Replay-Modi und Diagnosen.

Beispiel einer abweichenden Zulassungsregel:

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Worker-Protokoll und Abfragetransport {#worker-protocol-and-query-transport}

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | In Antworten der Worker-Ebene gemeldete Worker-Protokollversion. | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Standardseitengröße für Historienlesezugriffe der Worker. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Maximal berücksichtigte Seitengröße für Historienlesezugriffe der Worker. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | Sekunden, die die Steuerung auf das Ergebnis einer synchronen Update-Validierung vor der Annahme wartet. | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Sekunden, die eine Update-Validierungsaufgabe geleast bleibt, bevor ein anderer validierungsfähiger Worker sie erneut versuchen darf. | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Sekunden, die die Steuerung auf die Antwort des Workers auf eine Abfrage wartet. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Lease-Zeitlimit für kurzlebige Abfrageaufgaben an Worker. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | Aufbewahrungsdauer der Ergebniszeilen von Abfrageaufgaben vor der Bereinigung. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Höchstzahl wartender Cache-gestützter Abfrageaufgaben je Namespace/Warteschlange vor Ablehnung neuer Abfragen. | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Maximale Wartezeit eines untätigen Abfrage-Worker-Polls in Sekunden, bevor Workflow-Aufgabendruck und Verfügbarkeit der Steuerung erneut geprüft werden. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | nicht gesetzt; für `PHP_CLI_SERVER_WORKERS` abgeleitet | Optionale Grenze gleichzeitig wartender untätiger Abfrage-Long-Polls auf diesem Knoten. Wartende Aufgaben können vor Beginn der Leerlaufwartezeit weiterhin sofort beansprucht werden. | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Standard-Lease-Zeitlimit einer Workflow-Aufgabe in Sekunden. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Standard-Lease-Zeitlimit einer Aktivitätsaufgabe in Sekunden. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Sekunden nach einem Worker-Heartbeat, nach denen die Registrierung als veraltet gilt. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Den SDKs bei Registrierung und Heartbeat bestätigtes Intervall in Sekunden. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## Grenzen, Aufbewahrung und Metriken {#limits-retention-and-metrics}

Diese Einstellungen begrenzen Anfragen und Zustandswachstum. Wenn eine Anwendung die Werte regelmäßig erreicht, bevorzugen Sie kleinere Payloads, externen Payload-Speicher oder Continue-as-new, anstatt standardmäßig Grenzen anzuheben.

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | Höchstzahl der `workflow_type`-Zeitreihen in `dw_workflow_task_consecutive_failures`; weitere Typen werden zusammengefasst. | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | Höchstzahl der Workflow-Zeitreihen in `/api/system/prometheus-metrics` vor Zusammenfassung weiterer Reihen. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | Höchstzahl der Aktivitätszeitreihen in `/api/system/prometheus-metrics` vor Zusammenfassung weiterer Reihen. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | Höchstzahl der Laufzeitzeitreihen je Aufgabenwarteschlange in `/api/system/prometheus-metrics` vor Zusammenfassung weiterer Reihen. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | Höchstzahl von Historienereignissen je Workflow-Lauf, bevor Continue-as-new durchgesetzt wird. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Standard-Aufbewahrungsdauer der Historie abgeschlossener Läufe in Tagen, sofern der Namespace nichts anderes vorgibt. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Höchstzahl serialisierter Bytes eines Payloads. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | Maximale kodierte Größe in Bytes (64 MiB) für authentifiziertes Hochladen und Abrufen externer Payloads. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Von Server gemeldetes Zeitbudget für clientseitiges Hochladen und Abrufen in Sekunden. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | Sekunden, die ein hochgeladener externer Payload unbeansprucht bleiben darf, bevor seine undurchsichtige Referenz abläuft. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | Höchstzahl serialisierter Bytes eines Workflow-Memos. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Höchstzahl von Suchattributen eines Workflows. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Maximale Bytelänge eines Suchattributschlüssels. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Maximale Bytegröße eines Suchattributwertes vom Typ Zeichenfolge. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Maximale Bytelänge eines Signal-, Update- oder Abfragenamens. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Höchstzahl wartender Aktivitäten je Workflow-Lauf vor Ablehnung eines Befehlsstapels. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Höchstzahl wartender Kind-Workflows je Lauf vor Ablehnung eines Befehlsstapels. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Höchstzahl von Nexus-Vorgängen je Aufrufer in der Vorgangshistorie vor erforderlicher Paginierung. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Aktiviert die Komprimierung von JSON-Antworten oberhalb der Mindestgröße. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Docker-Initialisierung und Herkunft {#docker-bootstrap-and-provenance}

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | Nimmt `package_provenance` bei Admin-Anfragen in `/api/cluster/info` auf. | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Absoluter Pfad der Docker-Build-Herkunftsdatei. | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | Standardaktion für Service-Aufrufe über Namespace-Grenzen, wenn keine spezifischere Regel passt. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | nicht gesetzt | Optionale Minutengrenze für Aufrufe an der Service-Grenze. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | nicht gesetzt | Optionale Gleichzeitigkeitsgrenze für Aufrufe an der Service-Grenze. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Docker-Initialisierung {#docker-bootstrap}

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | Lässt den Containerstart fehlschlagen, wenn `env:audit` unbekannte oder alte `DW_*`-Variablen findet. | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | Initialisierungsversuche, bevor Migrationen und Anlage des Standard-Namespace aufgegeben werden. | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | Sekunden zwischen Initialisierungsversuchen. | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Einstellungen des Workflow-Pakets {#workflow-package-controls}

Das Server-Image enthält `durable-workflow/workflow` und stellt deshalb auch die `DW_V2_*`-Einstellungen des Pakets bereit. Sie sollten zu den Worker-Bereitstellungen passen, die dieselben Workflows ausführen.

| Variable | Standardwert | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | nicht gesetzt | Beschränkt Workflow-Instanzen auf einen Namespace. | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | nicht gesetzt | Optionales Organisationssegment der Mandantenhierarchie des Pakets für Bereitschaft, Erkennung und Betriebsoberflächen. | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | nicht gesetzt | Optionales Projektsegment der Mandantenhierarchie des Pakets für Bereitschaft, Erkennung und Betriebsoberflächen. | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | nicht gesetzt | Optionales Umgebungssegment der Mandantenhierarchie des Pakets für Bereitschaft, Erkennung und Betriebsoberflächen. | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | nicht gesetzt | Von diesem Worker gemeldeter Kompatibilitätsmarker. | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | nicht gesetzt | Kommagetrennte, von diesem Worker akzeptierte Kompatibilitätsmarker oder `*`. | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | nicht gesetzt | Kompatibilitäts-Namespace für gemeinsam genutzte Workflow-Datenbanken mit unabhängigen Worker-Flotten. | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Gültigkeitsdauer eines Worker-Kompatibilitäts-Heartbeats in Sekunden. | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Bevorzugt die aufgezeichnete Workflow-Definition; die laufzeitspezifische Grenze für Ersatzdefinitionen steht weiter unten. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | Historienereigniszahl, bei der das Paket dem Workflow-Autor Continue-as-new empfiehlt. | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | Bytegröße der serialisierten Historie, bei der das Paket Continue-as-new empfiehlt. | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | nicht gesetzt | Optionaler HMAC-Schlüssel zur Authentifizierung exportierter Historienarchive. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | nicht gesetzt | Zusammen mit signierten Historienexporten gespeicherte Schlüsselkennung. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Sekunden Wartezeit auf einen terminalen Update-Zustand. | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Millisekunden zwischen Abfragen des Update-Stadiums. | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | Modus struktureller Startprüfungen: `warn`, `fail` oder `silent`. | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | Paketgrenze wartender Aktivitäten. | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | Paketgrenze wartender Kind-Workflows. | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | Paketgrenze wartender Timer. | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | Paketgrenze wartender Signale. | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | Paketgrenze wartender Updates. | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | Höchstzahl akzeptierter Befehle in einem Workflow-Aufgabenabschluss. | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | Paketgrenze eines einzelnen Payloads in Bytes. | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | Paketgrenze eines Workflow-Memos in Bytes. | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | Paketgrenze der Suchattribute in Bytes. | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | Paketgrenze der Ereigniszahl einer Historientransaktion. | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | Prozent einer strukturellen Grenze, bei dem das Paket eine Warnung ausgibt. | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | Aufgabenzustellungsmodus des Pakets, im Server-Modus üblicherweise durch `DW_TASK_DISPATCH_MODE` überschrieben. | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | Legt fest, ob Queue-Worker bei jedem Looping-Ereignis die interne Zuordnungsrolle wecken. Mit `false` nehmen reine Ausführungsknoten nicht an dieser allgemeinen Poll-Weckprüfung teil, wenn ein eigener `php artisan workflow:v2:repair-pass --loop`-Daemon die Suche übernimmt. | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | Sekunden, bis eine verwaiste Workflow-Aufgabe durch Reparatur erneut zugestellt wird. | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | Mindestabstand zwischen Aufgabenreparaturen je Warteschlange in Sekunden. | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | Höchstzahl geprüfter Aufgaben je Reparaturdurchlauf. | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | Maximale Wartezeit nach fehlgeschlagener Aufgabenreparatur in Sekunden. | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | Kennzeichnet eine Mehrknotenbereitstellung, um Cache-Backends auf knotenübergreifende Koordination zu prüfen. | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | Prüft das Long-Poll-Cache-Backend beim Start. | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | Verhalten bei fehlgeschlagener Cache-Backend-Prüfung: `fail`, `warn` oder `silent`. | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Kompatibilitätsprüfmodus der Flotte: `warn` protokolliert; `fail` blockiert die Zustellung und verweigert sie, wenn kein kompatibler Worker verfügbar ist. | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | Diagnostische Eingabe des Payload-Codecs; die finale v2 verwendet Avro für Payloads neuer Läufe. | `WORKFLOW_SERIALIZER` |

**Veröffentlichte Fingerabdruckpräferenz.** Server 2.9.9 macht die Bevorzugung des Fingerabdrucks für Service-Worker wirksam. Bei aktivierter Bindung darf nur dann auf eine geänderte Definition ausgewichen werden, wenn kein geeigneter Worker mit der aufgezeichneten Definition mehr vorhanden ist und der Ersatz `workflow_entry_arguments_validation` ankündigt. Bei deaktivierter Bindung entfällt die Quellcodepräferenz; Build-Bindungen, Namespace-/Warteschlangen-/Typisolation, Registrierungsidentität und striktes Replay bleiben bestehen. Der zugehörige Einstiegsschutz ist ab PHP SDK 2.5.4, Python SDK 2.6.2 und Rust SDK 3.5.6 verfügbar. Dies sind Mindestversionen für diese Funktionen; installieren Sie aktuelle stabile Versionen mit Sicherheitskorrekturen. Nehmen Sie dieses Verhalten auf älteren Laufzeiten nicht allein deshalb an, weil deren Konfiguration denselben Schlüssel enthält. Siehe [Routing nach Definition](./worker-compatibility-routing.md#definition-fingerprint-evolution).

Verwenden Sie `DW_V2_GUARDRAILS_BOOT` in CI und Bereitstellungsmanifesten. Der alte Name `WORKFLOW_V2_GUARDRAILS_BOOT` bleibt nur erhalten, damit `env:audit` Betreiber von Alpha-Versionen auf die Umbenennung hinweisen kann. Das Workflow-Paket liest ihn nicht mehr als Rückfallwert zur Laufzeit.

Lesen Sie [Aufgabenzuordnung und Zustellung](/docs/polyglot/task-matching-dispatch), wenn Sie `DW_V2_MATCHING_ROLE_QUEUE_WAKE` oder einen eigenen `workflow:v2:repair-pass --loop`-Daemon konfigurieren. Diese Einstellungen ändern den Ort der Erkennung bereiter Aufgaben, nicht den Worker-Protokollvertrag.

## Infrastrukturvariablen der Laufzeitumgebung {#runtime-infrastructure-variables}

Infrastrukturvariablen konfigurieren Framework und Abhängigkeiten. Die Server-Prüfung erkennt sie und warnt deshalb nicht, sie sind aber keine stabilen Durable Workflow API-Einstellungen.

| Gruppe | Variablen | Verwendung |
| --- | --- | --- |
| Anwendung | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, Sprach-, Zeitzonen-, Wartungs- und Verschlüsselungseinstellungen | Identität und Startverhalten der Laravel-Anwendung. |
| Protokollierung | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, Einstellungen für stack, daily, Slack und Papertrail | Ziele, Formatierung und Aufbewahrung der Laravel-Protokolle. |
| Datenbank | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, Zeichensatz-, Sortier- und Fremdschlüsseleinstellungen | SQL-Zustandsspeicher für Workflow-, Namespace-, Worker- und Projektionstabellen. |
| Redis/Cache/Queue | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Queue-Worker, Cache-Sperren, Long-Poll-Signale und Web-/Sitzungsunterstützung. |
| Dateisysteme/E-Mail/Broadcasting | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Framework-Integrationen für bereitstellungsspezifische Funktionen. |
| Build/Laufzeit | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Docker-Compose-Images und Laufzeitverhalten des Frameworks. |

## Container-Protokolle {#container-logs}

Setzen Sie `LOG_CHANNEL=stderr` für API-, Worker- und Scheduler-Container, damit
`docker logs` oder `kubectl logs` die Anwendungsprotokolle erfassen kann. Setzen
Sie die Variable bei bestehenden Versionen ausdrücklich. Mit `LOG_LEVEL` wählen
Sie den Mindestschweregrad. Für JSON mit einem Datensatz pro Zeile setzen Sie zusätzlich:

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

Starten Sie dauerhafte Prozesse nach Änderungen neu, da die Konfiguration beim
Start zwischengespeichert wird. Ein ausdrücklich gewählter Dateikanal benötigt
eigene Speicherung und Erfassung; Kubernetes erfasst
`storage/logs/laravel.log` nicht automatisch. `DW_LOG_FORMAT` wird nicht unterstützt.

## Hinweise zur Migration {#migration-notes}

Stellen Sie bei der Migration einer älteren Bereitstellung auf den öffentlichen Namen um und lassen Sie den alten Namen ungesetzt. Falls beide vorhanden sind, ist der `DW_*`-Wert für die Betriebsplanung maßgeblich; entfernen Sie den alten Namen.

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

Führen Sie das Server-Image nach der Migration mit `DW_ENV_AUDIT_STRICT=1` aus, um Tippfehler, veraltete Aliasse und aus alten Betriebshandbüchern übernommene Einstellungen zu erkennen.
