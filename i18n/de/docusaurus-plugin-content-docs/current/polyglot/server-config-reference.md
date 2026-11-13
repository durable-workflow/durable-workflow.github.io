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

Diese Seite beschreibt den Vertrag der Umgebungsvariablen `DW_*` für Betreiber des Durable Workflow Server-Images. Nutzen Sie sie für Bereitstellungsvorlagen, die Prüfung der Produktionskonfiguration und die Umstellung älterer Namen `WORKFLOW_*` / `ACTIVITY_*` auf den Server-v2-Vertrag. Der aktuelle Server ist der native 3.x-Server; [Nativer Server 3.x](#native-server-3x) führt auf, welche Einstellungen er berücksichtigt, ignoriert oder ablehnt. PHP Server 2.x ist bei 2.11.8 eingefroren.

Der PHP-2.x-Server verwendet außerdem gewöhnliche Laravel-Einstellungen wie `DB_*`, `REDIS_*`, `QUEUE_CONNECTION` und `CACHE_STORE`. Diese Infrastrukturvariablen sind gesondert aufgeführt, weil sie die Bereitstellung konfigurieren und keine Durable Workflow API-Einstellungen darstellen.

## Nativer Server 3.x {#native-server-3x}

Die Variablentabellen auf dieser Seite dokumentieren den von PHP Server 2.11.0 veröffentlichten `DW_*`-Vertrag; ihre Zweckangaben beschreiben PHP 2.x. Der native 3.x-Server liest dieselben Namen mit denselben alten Aliasen über eine Startprüfung, die jeder Vertragseinstellung genau eine Behandlung zuweist:

- **Berücksichtigt:** Der native Server liest die Einstellung und wendet die PHP-Bedeutung an. Nicht unten aufgeführte Einstellungen werden berücksichtigt.
- **Ignoriert:** Der native Server akzeptiert die Einstellung, sie ändert aber nichts, was Clients oder Betreiber beobachten.
- **Abgelehnt, sofern nicht Standard:** Der native Server verweigert den Start, es sei denn, die Einstellung ist nicht gesetzt oder behält den PHP-Standardwert. Die Startfehlermeldung nennt die Einstellung, den akzeptierten Wert und den Grund.

Der native Server liest seine Umgebung einmal beim Prozessstart und hält keinen Konfigurationscache. Um eine Einstellung zu ändern, starten oder ersetzen Sie den Server-Prozess. Wie `env:audit` unter PHP warnt die native Prüfung vor unbekannten `DW_*`-Namen und alten Namen; `DW_ENV_AUDIT_STRICT=1` macht aus diesen Warnungen eine Startverweigerung.

Der native Server lehnt diese Einstellungen ab, sofern sie nicht den aufgeführten Wert behalten:

| Grund | Einstellungen und akzeptierte Werte |
| --- | --- |
| Der native Server bindet Läufe stets an ihre gespeicherte Workflow-Definition | `DW_V2_PIN_TO_RECORDED_FINGERPRINT`: nicht gesetzt oder `true` |
| Der native Server kann ein geändertes Nexus-Operationslimit nicht anwenden | `DW_MAX_NEXUS_OPERATIONS_PER_CALLER`: nicht gesetzt oder `200`<br />`DW_MAX_OPERATION_NAME_LENGTH`: nicht gesetzt oder `256` |
| Der native Server kann ein geändertes Limit für Metrikreihen nicht anwenden | `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT`: nicht gesetzt oder `100`<br />`DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT`: nicht gesetzt oder `100`<br />`DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT`: nicht gesetzt oder `100`<br />`DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT`: nicht gesetzt oder `20` |
| Der native Server kann eine geänderte Obergrenze für ausstehende Abfrageaufgaben nicht anwenden | `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`: nicht gesetzt oder `1024` |
| Der native Server kann ein geändertes Strukturlimit nicht anwenden | `DW_V2_LIMIT_COMMAND_BATCH_SIZE`: nicht gesetzt oder `1000` |
| Der native Server kann geänderte Zeitvorgaben für die Aufgabenreparatur nicht anwenden | `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS`: nicht gesetzt oder `60`<br />`DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS`: nicht gesetzt oder `3`<br />`DW_V2_TASK_REPAIR_SCAN_LIMIT`: nicht gesetzt oder `25` |
| Der native Server veröffentlicht keine Paketherkunft | `DW_EXPOSE_PACKAGE_PROVENANCE`: nicht gesetzt oder `false` |
| Der native Server meldet keine Mehrknoten-Deklaration | `DW_V2_MULTI_NODE`: nicht gesetzt oder `false` |
| Der native Server führt keine Workflow-1-Workflows aus | `DW_V1_ENABLED`: nicht gesetzt oder `false` |
| Der native Server prüft keine Kompatibilität der Worker-Flotte | `DW_V2_FLEET_VALIDATION_MODE`: nicht gesetzt oder nicht `fail` |
| Der native Server übergibt Aufgaben nur an pollende Worker | `DW_TASK_DISPATCH_MODE`: nicht gesetzt oder `poll` |
| Der native Server hat keine Konfiguration für externe Executor | `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`: nicht gesetzt oder leer<br />`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`: nicht gesetzt oder leer |
| Der native Server hat keinen Wiederherstellungsmodus für die Memo-Migration | `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY`: nicht gesetzt oder leer |
| Der native Server hat keine Limits für dauerhaften Namespace-Zustand | `DW_NAMESPACE_DURABLE_HARD_LIMITS`: nicht gesetzt oder `{}`<br />`DW_NAMESPACE_DURABLE_LIMITS`: nicht gesetzt oder `{}`<br />`DW_NAMESPACE_DURABLE_OVERRIDES`: nicht gesetzt oder `{}` |
| Der native Server hat keine Limits für die Anfragezulassung pro Namespace | `DW_NAMESPACE_ADMISSION_OVERRIDES`: nicht gesetzt oder `{}`<br />`DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS`: nicht gesetzt oder leer<br />`DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE`: nicht gesetzt oder leer<br />`DW_NAMESPACE_MAX_CONCURRENT_REQUESTS`: nicht gesetzt oder leer<br />`DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE`: nicht gesetzt oder leer |
| Der native Server hat keine Service-Grenzrichtlinie | `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT`: nicht gesetzt oder `allow`<br />`DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT`: nicht gesetzt oder leer<br />`DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE`: nicht gesetzt oder leer<br />`DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT`: nicht gesetzt oder leer<br />`DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT`: nicht gesetzt oder leer<br />`DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES`: nicht gesetzt oder `{}`<br />`DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE`: nicht gesetzt oder leer<br />`DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE`: nicht gesetzt oder leer |
| Der native Server hat keine Speicherzulassungsdatei | `DW_STORAGE_ADMISSION_FILE`: nicht gesetzt oder leer<br />`DW_STORAGE_ADMISSION_SOURCE`: nicht gesetzt oder leer |
| Der native Server hat keine Limits für die Aufgabenzulassung | `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_TASK_QUEUE_ADMISSION_OVERRIDES`: nicht gesetzt oder `{}`<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE`: nicht gesetzt, leer oder keine positive Zahl<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: nicht gesetzt, leer oder keine positive Zahl |
| Der native Server implementiert eine einzige Worker-Protokollversion | `DW_WORKER_PROTOCOL_VERSION`: nicht gesetzt oder `1.20` |
| Der native Server vertraut weitergeleiteten Zuordnungsheadern nie | `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS`: nicht gesetzt oder `false` |
| Der native Server bindet Läufe nur an registrierte Worker-Build-IDs; serverweite Kompatibilitätsmarker gibt es nicht | `DW_V2_COMPATIBILITY_HEARTBEAT_TTL`: nicht gesetzt oder `30`<br />`DW_V2_COMPATIBILITY_NAMESPACE`: nicht gesetzt oder leer<br />`DW_V2_CURRENT_COMPATIBILITY`: nicht gesetzt oder leer<br />`DW_V2_NAMESPACE`: nicht gesetzt oder leer<br />`DW_V2_SUPPORTED_COMPATIBILITIES`: nicht gesetzt oder leer |
| Der native Server meldet keine Payload-Codec-Probleme | `DW_SERIALIZER`: nicht gesetzt, leer oder `avro` |
| Der native Server läuft nur als eigenständiger HTTP-Server-Prozess | `DW_MODE`: nicht gesetzt oder `service`<br />`DW_SERVER_PROCESS_CLASS`: nicht gesetzt oder keiner der Werte `scheduler_node`, `worker_node`<br />`DW_SERVER_TOPOLOGY_SHAPE`: nicht gesetzt oder keiner der Werte `embedded`, `split_control_execution` |
| Der native Server bedient Anfragen ohne Namespace-Angabe mit `default` | `DW_DEFAULT_NAMESPACE`: nicht gesetzt oder `default` |
| Der native Server speichert externe Payloads nur auf seinem lokalen Datenträger | `DW_EXTERNAL_PAYLOAD_S3_BUCKET`: nicht gesetzt oder leer |
| Der native Server unterstützt nur seine eigene Token-Authentifizierung | `DW_AUTH_BACKWARD_COMPATIBLE`: nicht gesetzt oder `true`<br />`DW_AUTH_PROVIDER`: nicht gesetzt oder leer<br />`DW_PRINCIPAL_TOKENS`: nicht gesetzt oder leer |

Der native Server akzeptiert, ignoriert aber: `DW_ADMIN_SIGNATURE_KEY`, `DW_AUTH_METHOD_HEADER`, `DW_AUTH_STATUS_HEADER`, `DW_BOOTSTRAP_DELAY_SECONDS`, `DW_BOOTSTRAP_RETRIES`, `DW_CALLER_LABEL_HEADER`, `DW_CALLER_TYPE_HEADER`, `DW_COMPRESSION_ENABLED`, `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT`, `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS`, `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID`, `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT`, `DW_EXTERNAL_PAYLOAD_S3_REGION`, `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY`, `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN`, `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT`, `DW_MAX_HISTORY_EVENTS`, `DW_MAX_TASKS_PER_POLL`, `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST`, `DW_OBSERVABILITY_CONTEXT_ENABLED`, `DW_OPERATOR_SIGNATURE_KEY`, `DW_PACKAGE_PROVENANCE_PATH`, `DW_POLLING_CACHE_PATH`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_SIGNATURE_KEY`, `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS`, `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS`, `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES`, `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT`, `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, `DW_V2_TASK_DISPATCH_MODE`, `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `DW_V2_TENANCY_ENVIRONMENT`, `DW_V2_TENANCY_ORGANIZATION`, `DW_V2_TENANCY_PROJECT`, `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_WAKE_SIGNAL_TTL_SECONDS`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS`, `DW_WORKER_POLL_INTERVAL_MS`, `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS`, `DW_WORKER_SIGNATURE_KEY`.

Der native Server hat keine serverseitigen Lease- oder Zustellungsgrenzen für Task-Warteschlangen, keine Budgetgruppen, keine Anfragezulassung pro Namespace, keine Kontingente für dauerhaften Namespace-Zustand und keine Grenzen für gehaltene Polls; ein natives Gegenstück gibt es dafür noch nicht. Jeder native Server-Prozess öffnet höchstens vier Datenbankverbindungen. Abfrageaufgaben haben eine feste Grenze von 16 ausstehenden oder geleasten Aufgaben pro Namespace; darüber hinaus werden neue Abfragen wie bei PHP mit HTTP `429` und `query_task_queue_full` abgelehnt. Diese Grenze ist nicht konfigurierbar. Um die Task-Nebenläufigkeit auf dem nativen Server zu begrenzen, dimensionieren Sie die Slots jedes SDK-Workers und die Anzahl der Worker. [Task-Warteschlangenzulassung](/docs/polyglot/task-queue-admission) beschreibt die Steuerungen von PHP 2.x.

Die native Authentifizierung unterscheidet sich von PHP 2.x wie folgt:

- `DW_AUTH_TOKEN` ist erforderlich. Ohne dieses Token verweigert der native Server den Start, und er akzeptiert das gemeinsame Token für jede Rolle zusätzlich zu allen rollenbezogenen Tokens.
- `DW_AUTH_DRIVER` akzeptiert nur `token`. Der native Server lehnt `signature` ab, ein Release-Image lehnt außerdem `none` ab. Die Einstellungen für Signaturschlüssel werden ignoriert.

Der native Server liest außerdem Einstellungen außerhalb des PHP-Vertrags:

- `DW_BIND_ADDRESS`: die Lauschadresse. Das Binary verwendet standardmäßig `127.0.0.1:8080`; das veröffentlichte Image setzt `0.0.0.0:8080`.
- `DW_RUST_MAINTENANCE_LOOP`: `1` oder `true` ergänzt die prozessinterne Timer- und Schedule-Schleife um den Reparaturdurchlauf (Aufgabenreparatur und Aktivitäts-Timeouts). Das veröffentlichte Image setzt `1`, weil es keinen separaten Scheduler hat.
- `DW_RUST_EXPERIMENTAL`: nur von Entwicklungs-Builds ohne Release-Version als `1` verlangt. Release-Images benötigen die Einstellung nicht.
- `DW_UPGRADE_BACKUP_FINGERPRINT` und `DW_RUST_UPGRADE_QUEUE_*`: Eingaben für die einseitige [native Übernahme](%%artifact.serverTakeoverRunbookUrl%%) einer PHP-Datenbank; die Übernahme ist auf dem veröffentlichten 3.0.4-Image innerhalb des im Runbook angegebenen Umfangs qualifiziert.
- `DW_V2_LIMIT_HISTORY_TRANSACTION_ROWS` (alter Name `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_ROWS`): wird berücksichtigt, bevor die Einstellung in den PHP-Vertrag aufgenommen ist.

## Wann Änderungen wirksam werden {#how-changes-take-effect}

Der native 3.x-Server liest seine Umgebung nur beim Prozessstart; starten oder ersetzen Sie den Server-Prozess, um eine Änderung anzuwenden. Der Rest dieses Abschnitts beschreibt PHP 2.x.

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

Im Server-Repository liegt der maßgebliche Vertrag in `config/dw-contract.php`. Der native 3.x-Server führt die entsprechende Prüfung beim Start aus, wie unter [Nativer Server 3.x](#native-server-3x) beschrieben. Unter PHP 2.x warnt beim Containerstart `php artisan env:audit` vor unbekannten `DW_*`-Variablen und alten Namen. Mit `DW_ENV_AUDIT_STRICT=1` schlägt das Einstiegsskript fehl, anstatt mit Warnungen zu starten.

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
| `DW_AUTH_PROVIDER` | nicht gesetzt | PHP 2.x: durch Laravel auflösbare Klasse, die `App\Contracts\AuthProvider` implementiert. Native 3.x verweigert den Start, wenn sie gesetzt ist. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Authentifizierungstreiber unter PHP 2.x: `none`, `token` oder `signature`. Native 3.x akzeptiert nur `token`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | nicht gesetzt | PHP 2.x: gemeinsames Bearer-Token, wenn kein rollenbezogenes Token konfiguriert ist. Native 3.x: erforderlich und für jede Rolle akzeptiert. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | nicht gesetzt | PHP 2.x: gemeinsamer HMAC-Signaturschlüssel, wenn kein rollenbezogener Schlüssel konfiguriert ist. Von native 3.x ignoriert, da es keine Signaturauthentifizierung hat. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | nicht gesetzt | Bearer-Token für Worker-Registrierung, Polling, Heartbeats und Abschlüsse. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | nicht gesetzt | Bearer-Token für Lesezugriffe und Betriebsaktionen der Steuerungsebene. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | nicht gesetzt | Bearer-Token für Namespace-, Aufbewahrungs- und andere administrative Änderungen. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | nicht gesetzt | PHP 2.x: JSON-Tokenzuordnung für benannte Principals. Jeder Eintrag enthält `token`, `subject`, `roles` sowie optional `tenant`, `label` und nicht geheime `claims`. Native 3.x verweigert den Start, wenn sie gesetzt ist. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | nicht gesetzt | HMAC-Schlüssel für Worker-Anfragen mit Signaturauthentifizierung. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | nicht gesetzt | HMAC-Schlüssel für Operator-Anfragen mit Signaturauthentifizierung. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | nicht gesetzt | HMAC-Schlüssel für Admin-Anfragen mit Signaturauthentifizierung. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | PHP 2.x: berücksichtigt gemeinsame `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` als Rückfalloption, wenn rollenbezogene Zugangsdaten fehlen. Native 3.x akzeptiert das gemeinsame Token immer und verweigert den Start, wenn der Wert `false` ist. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Verwenden Sie in Produktion rollenbezogene Zugangsdaten. Unter PHP 2.x ist `DW_AUTH_DRIVER=none` nur für lokale Funktionstests vorgesehen, weil dann alle Endpunkte ohne Bearer-Token oder Signatur erreichbar sind; native Release-Images lehnen diesen Wert ab.

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
| `DW_WORKER_POLL_TIMEOUT` | `30` | Standardwartezeit ohne `timeout_seconds` in der Poll-Anfrage. SDK-Werte überschreiben sie; sie ist nicht deren Maximum. Siehe [Timeout-Budgets des gesamten Wegs](../deployment.md#worker-long-poll-timeout-budgets). | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Millisekunden zwischen internen Suchläufen während eines offenen Polls. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Millisekunden zwischen Prüfungen auf Wecksignale während eines offenen Polls. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Verzeichnis für die Worker-Poll-Koordination bei dateibasiertem Polling-Cache. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | Lebensdauer warteschlangenbezogener Wecksignale, die einen wartenden Poll vorzeitig beenden. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | nicht gesetzt; für `PHP_CLI_SERVER_WORKERS` abgeleitet | Optionale Grenze gleichzeitig wartender Workflow-/Aktivitäts-Long-Polls auf diesem Server-Knoten. Abfrage-Polls haben ein eigenes Wartebudget. Der native 3.x-Server ignoriert die Einstellung; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | Für Gesundheit und Steuerung reservierte PHP-CLI-Server-Worker bei der Ableitung der Workflow-/Aktivitäts-Long-Poll-Grenze. Der native 3.x-Server ignoriert die Einstellung; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Höchstzahl zurückgegebener Aufgaben je Worker-Poll. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Sekunden bis zum Ablauf des Cache-gestützten Claim-Gates für Worker-Polls im SQLite-Schnellstart-Backend. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Sekunden Wartezeit auf das Cache-gestützte SQLite-Claim-Gate, bevor Backend-Sperrdruck gemeldet wird. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | nicht gesetzt | Grenze aktiver Workflow-Aufgaben-Leases je Namespace/Warteschlange. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | nicht gesetzt | Grenze aktiver Workflow-Aufgaben-Leases über alle Warteschlangen eines Namespace. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | nicht gesetzt | Zustellungsgrenze je Minute für Workflow-Aufgaben pro Namespace/Warteschlange. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | nicht gesetzt | Zustellungsgrenze je Minute für Workflow-Aufgaben in einem Namespace. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | nicht gesetzt | Grenze aktiver Aktivitätsaufgaben-Leases je Namespace/Warteschlange. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | nicht gesetzt | Grenze aktiver Aktivitätsaufgaben-Leases über alle Warteschlangen eines Namespace. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | nicht gesetzt | Zustellungsgrenze je Minute für Aktivitätsaufgaben pro Namespace/Warteschlange. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | nicht gesetzt | Zustellungsgrenze je Minute für Aktivitätsaufgaben in einem Namespace. Der native 3.x-Server verweigert den Start, wenn der Wert eine positive Zahl ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | JSON-Abweichungen nach `namespace:task_queue`, `namespace:*`, `task_queue` oder `*` für aktive Leases, Zustellungsraten, Namespace-Grenzen und nachgelagerte Budgetgruppen. Der native 3.x-Server verweigert den Start, es sei denn, die Einstellung ist nicht gesetzt oder `{}`; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
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
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Höchstzahl wartender Cache-gestützter Abfrageaufgaben je Namespace/Warteschlange vor Ablehnung neuer Abfragen. Der native 3.x-Server lehnt jeden anderen Wert als `1024` ab und wendet stattdessen seine eigene feste Grenze für Abfrageaufgaben an; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Maximale Wartezeit eines untätigen Abfrage-Worker-Polls in Sekunden, bevor Workflow-Aufgabendruck und Verfügbarkeit der Steuerung erneut geprüft werden. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | nicht gesetzt; für `PHP_CLI_SERVER_WORKERS` abgeleitet | Optionale Grenze gleichzeitig wartender untätiger Abfrage-Long-Polls auf diesem Knoten. Wartende Aufgaben können vor Beginn der Leerlaufwartezeit weiterhin sofort beansprucht werden. Der native 3.x-Server ignoriert die Einstellung; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
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
| `DW_MAX_HISTORY_EVENTS` | `50000` | Hat keine Wirkung. Keine Server-Version liest sie, und die Historie je Lauf ist nicht begrenzt. Begrenzen Sie lange Historien mit continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
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

## Grenzen an der Server-Anfragegrenze {#server-request-boundary-limits}

Beim eigenständigen Server werden separate Grenzen an der
HTTP-Anfragegrenze durchgesetzt, bevor Workflow-Aufgabe, Signal, Update oder
Abfrage die Steuerungsebene erreichen. Diese Grenzen liefern sofort
`422 validation_failed` (oder `413 payload_too_large` bei Prüfung des gesamten
Anfragetexts). Clients erfahren so den Ablehnungsgrund, ohne dass der Server
eine Datenbankzeile schreibt.

| Grenze | Standard | Konfigurationsschlüssel | Was sie begrenzt |
|---|---|---|---|
| Anfragetextgröße | 2 MiB | `server.limits.max_payload_bytes` | Gesamtzahl der Bytes im HTTP-Anfragetext, außer bei einem Workflow-Task-Abschluss auf nativem Server 3.6.0 oder neuer (nächste Zeile) |
| Größe eines Workflow-Task-Abschlusses | 32 MiB (16 × Anfragetextgröße) | abgeleitet von `server.limits.max_payload_bytes` | Nativer Server 3.6.0 oder neuer: eine Anfrage, die einen Workflow-Task mit Befehlen abschließt. Die Argumente jedes Befehls müssen weiterhin die Grenze pro Payload einhalten |
| Memo-Größe | 256 KiB | `server.limits.max_memo_bytes` | Serialisiertes Memo auf `POST /workflows` und `POST /schedules` |
| Anzahl der Suchattribute | 100 | `server.limits.max_search_attributes` | Registrierte eigene Suchattribute pro Namespace |
| Suchattribut-Schlüssellänge | 128 Bytes | `server.limits.max_search_attribute_key_length` | Länge eines einzelnen SA-Schlüssels beim Start |
| Suchattribut-Wertgröße | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Jeder Zeichenfolgenwert und jedes Element eines Array-Werts beim Start |
| Signal-/Update-/Abfragename | 256 Bytes | `server.limits.max_operation_name_length` | URL-Pfadsegment für Signal-/Update-/Abfragenamen |
| Länge von `workflow_id` | 128 Zeichen | Controller-Validator | Workflow-ID auf `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 Zeichen | Controller-Validator | Zeichenfolgenfelder auf `POST /workflows` |
| `request_id` | 255 Zeichen | Controller-Validator | Deduplizierungstoken für Signale/Updates/Abbrechen/Beenden |
| `reason` | 1.000 Zeichen | Controller-Validator | Begründungstext für Abbrechen/Beenden/Archivieren |

Verwenden Sie die dokumentierten `DW_*`-Einstellungen für konfigurierbare
Grenzen von PHP Server 2.x. Grenzen der Controller-Validierung sind fest.
Native Server 3.x unterstützt die in seinen [Implementierungshinweisen](#native-server-3x)
genannten Einstellungen. Bei native 3.8.0 setzt `DW_MAX_PAYLOAD_BYTES=0` die
Grenze für gewöhnliche Anfragen und Workflow-Task-Completions auf null Bytes,
sodass nichtleere Bodys abgelehnt werden. Die Grenze für Operationsnamen ist
fest auf 256 Bytes gesetzt.

Native 3.9.1 prüft Signal-`request_id` weiterhin gegen 255 UTF-8-Bytes. Ein mehrbyteiger Schlüssel mit 255 Zeichen kann daher `422 invalid_request_id` auslösen. Die [Qualifikation der installierten CLI](https://github.com/durable-workflow/server/issues/934#issuecomment-6853943056) verfolgt diese veröffentlichte Einschränkung; sie belegt keine vollständige Request-Key-Akzeptanz unter dem gemeinsamen #216.

Die aktuell konfigurierten Werte werden unter `limits` in der Antwort von
`GET /api/cluster/info` veröffentlicht. Clients können sie dadurch zur Laufzeit
ermitteln:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Validierungsfehler werden im Standard-Fehlerumschlag der Steuerungsebene mit
`reason: "validation_failed"` und einer Zuordnung `validation_errors`
zurückgegeben. Deren Schlüssel sind die betroffenen Felder (`signal_name`,
`update_name`, `query_name`, `search_attributes`, `memo` usw.). Ablehnungen wegen
der Payload-Größe verwenden `reason: "payload_too_large"` und Statuscode `413`.

### Namen und IDs nativer Worker-Befehle {#native-worker-command-name-limits}

Die Tabelle zeigt Speichergrenzen in Zeichen. Zusätzlich gelten die unten
beschriebenen Byte-Prüfungen der Laufzeit. Die Workflow-ID-Zeile betrifft die
separate Start-API; Felder von Child-Aufrufen haben engere Grenzen als andere Befehle.

| Feld | Maximale Zeichenanzahl | Geltungsbereich |
|---|---|---|
| `workflow_id` | 128 | `POST /api/workflows` |
| `activity_type` | 191 | Activity-Befehle |
| `signal_name` | 191 | `open_signal_wait` |
| `condition_key` / `condition_definition_fingerprint` | 191 | `open_condition_wait` |
| `connection` | 255 | Worker-Befehle |
| `queue` | 255 | Worker-Befehle außer `start_child_workflow` |
| `workflow_type` | 255 | `continue_as_new` |
| `workflow_type` / `queue` | 191 | `start_child_workflow` |

Native 3.8.0 und 3.9.1 behalten außerdem UTF-8-Byte-Prüfungen bei. Für `activity_type`, `open_signal_wait.signal_name`, eine explizite
`schedule_activity.queue` und `continue_as_new.workflow_type` / `queue`
gilt eine Parsergrenze von 255 Bytes (`422 invalid_request`). Für Child-
`workflow_type` und `queue` gilt zusätzlich eine 191-Byte-Prüfung, die
`422 unsupported_child_options` zurückgeben kann. Ein Activity-Typ aus
128 Wiederholungen von `é` hat beispielsweise 256 Bytes und wird trotz nur
128 Zeichen abgelehnt. Die neuen Zeichenprüfungen heben diese Byte-Prüfungen nicht auf.

Native Server 3.9.1 enthält die [veröffentlichte Korrektur](https://github.com/durable-workflow/server/releases/tag/3.9.1#other-changes): feldspezifische `422 validation_failed`-Ablehnungen, etwa für `commands.0.activity_type`, vor Schreibvorgängen. Native 3.8.0 prüfte diese Zeichengrenzen nicht konsistent; SQLite konnte überlange Namen stillschweigend speichern, während andere Backends Datenbankfehler zurückgaben. Prüfen Sie vor dem Upgrade vorhandene Activity-Typen und Signal-Waits mit Namen über 191 Zeichen: Neue Befehle mit diesen Namen werden nun abgelehnt. Die übrige Kennungsprüfung wird in [Server #607](https://github.com/durable-workflow/server/issues/607) verfolgt. Die obige HTTP-Grenze von 256 Bytes für Operationsnamen ist separat.

### Größe eines Workflow-Task-Abschlusses {#workflow-task-completion-size}

Auf nativem Server 3.6.0 und neuer darf eine Anfrage, die einen Workflow-Task mit Befehlen abschließt (`POST /api/worker/workflow-tasks/{id}/complete` und `POST /api/worker/activity-tasks/{id}/continuation/complete`), bis zum 16-Fachen von `max_payload_bytes` groß sein: 32 MiB beim Standardwert von 2 MiB. Sie folgt `DW_MAX_PAYLOAD_BYTES` und hat keine eigene Einstellung. Die Argumente jedes Befehls müssen innerhalb des Abschlusses weiterhin die Grenze pro Payload einhalten. PHP-Server 2.x und frühere native Versionen begrenzen einen Abschluss wie jede andere Anfrage auf eine Payload-Grenze.

Native 3.9.1 veröffentlicht das tatsächliche Budget als `limits.max_workflow_task_completion_bytes` in Cluster-Info. Es misst für beide Completion-Routen den vollständig kodierten JSON-Anfragekörper einschließlich Envelopes, Metadaten und Befehlen. Verwenden Sie diesen Wert, statt einen Multiplikator aus der Server-Version abzuleiten oder dekodierte Argumentgrößen zu addieren. Die Grenzen pro Wert und für gewöhnliche Routen bleiben unverändert. Das Feld erteilt keine zusätzliche Berechtigung zum Hochladen externer Payloads oder Platzieren von Referenzen.

SDK-Planer müssen eine positive veröffentlichte Grenze auch unterhalb der gewöhnlichen Grenze beachten. Fehlt das Feld, bleibt der konservative Fallback erhalten. Ein explizit fehlerhafter Wert, ein Nullwert (null), die Zahl Null, ein negativer oder nicht ganzzahliger Wert verweigert die Completion-Planung vor dem Upload. Gewöhnliche Routen ignorieren dieses ungenutzte Completion-Feld.

Ein größerer Abschluss wird mit `413 payload_too_large` und `limit_kind: workflow_task_completion_bytes` abgelehnt, bevor etwas aufgezeichnet wird. Eine erneute Ausführung des Tasks erzeugt dieselben Befehle, daher führt erneutes Senden zur selben Ablehnung. Erhält PHP SDK 3.17.0 oder neuer diese typisierte Ablehnung, sendet es die Completion nicht erneut: Der Worker lässt den Lauf einmal mit einem `fail_workflow`-Befehl fehlschlagen, dessen Nachricht mit `Structural limit exceeded: workflow_task_completion_bytes:` beginnt und beide Größen nennt, und der Server zeichnet den Fehler mit `failure_category = structural_limit` auf.

Python SDK 2.17 und Rust SDK 4.15 behandeln die typisierte Ablehnung. Auf Server 3.8.0 traf ein veröffentlichter Python-Kontrolllauf vor HTTP 413 auf `httpx.ReadError` und ließ den Workflow offen. Native 3.9.1 korrigiert diesen Antwortpfad durch begrenztes Verwerfen der Anfrage: höchstens 64 MiB verbleibende Upload-Daten und höchstens zwei Sekunden, bevor die ursprüngliche Ablehnung zurückgegeben und die Verbindung geschlossen wird. Außerhalb dieser Grenzen können weiterhin Transportfehler auftreten.

Das veröffentlichte Python SDK 2.17.1 mit qualifiziertem nativem Server 3.9.1 (linux/amd64, SQLite) besteht nun die [Kontrollen mit tatsächlich installiertem Worker](https://github.com/durable-workflow/.github/issues/228#issuecomment-6853834512): Fan-out von 300 × 10 KB innerhalb der Grenze, genau ein typisiertes 413 und ein struktureller Fehler ohne teilweise gestartete Aktivitäten bei übergroßer Completion, danach eine erfolgreiche Aufgabe auf demselben Worker. Dies qualifiziert genau dieses Python/Server-Paar. PHP und Rust benötigen eigene installierte Akzeptanznachweise; das gemeinsame #228 bleibt offen. Die Request-Key-Akzeptanz unter dem gemeinsamen #216 ist separat.

So bleibt ein Abschluss innerhalb der Grenze:

- Teilen Sie ein großes Fan-out in kleinere Stapel über mehrere Workflow-Tasks auf.
- Verlagern Sie Arbeit in Child-Workflows, oder verwenden Sie Continue-as-New.
- Verwenden Sie externen Payload-Speicher nur für unterstützte Payload-Positionen. Befehlsargumente einer Activity-Continuation bleiben inline; eine Upload-Berechtigung für Activity oder Ergebnis erlaubt dort keine Referenzen.

#### Rust-Befehlsplanung {#rust-completion-planning}

Rust SDK 4.15.0 verwendet die gewöhnliche Grenze je Payload weiterhin als
Gesamtgrenze für die Befehlsplanung (standardmäßig 2 MiB), bevor die höhere
Completion-Grenze des Servers greift. Ohne externen Payload-Speicher im
Namespace wird der veröffentlichte Fan-out mit 300 × 10 KB mit
`external_payload_unavailable` abgelehnt. Der Worker beendet sich und der Lauf
bleibt ausstehend. Verwenden Sie kleinere Befehlsbatches, solange die
[Korrektur des SDK-Gesamtplaners](https://github.com/durable-workflow/sdk-rust/issues/254)
aussteht. Dieser SDK-Pfad unterstützt die höhere Server-Grenze noch nicht.

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

## Weitere Einstellungen des veröffentlichten PHP Servers {#additional-published-php-controls}

Diese Referenz beschreibt den veröffentlichten Vertrag von **PHP Server 2.11.0** einschließlich der folgenden Einstellungen. Prüfen Sie das tatsächlich verwendete Image: Die unabhängig gewählte Installationsversion kann älter sein. `unset` bedeutet, dass kein Umgebungswert gesetzt ist; die Wirkung hängt von der Einstellung ab. Vorgaben und Aliasse stammen aus dem [veröffentlichten Vertrag](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php). Der Build prüft dessen versionierten Snapshot in jeder Sprache. Die ausgewählten Installationsversionen ändern sich dadurch nicht.

### HTTP-Zulassung pro Namespace {#namespace-request-controls}

| Variable | Vorgabe | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | Optionale Zahl von Control-Plane-Anfragen pro Minute und Namespace; ohne Wert unbegrenzt. Der native 3.x-Server verweigert den Start, wenn die Einstellung nicht leer ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | Optionale Zahl gleichzeitiger Control-Plane-Anfragen pro Namespace; ohne Wert unbegrenzt. Der native 3.x-Server verweigert den Start, wenn die Einstellung nicht leer ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | Unübergehbare Obergrenze der Anfragen pro Minute, auch bei Namespace-Overrides. Der native 3.x-Server verweigert den Start, wenn die Einstellung nicht leer ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | Unübergehbare Obergrenze gleichzeitiger Anfragen, auch bei Namespace-Overrides. Der native 3.x-Server verweigert den Start, wenn die Einstellung nicht leer ist; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | JSON-Objekt nach Namespace mit Overrides für Anfragerate und Gleichzeitigkeit. Der native 3.x-Server verweigert den Start, es sei denn, die Einstellung ist nicht gesetzt oder `{}`; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[Anfragezulassung pro Namespace](./task-queue-admission.md#namespace-request-admission).

### Kontingente für dauerhaften Namespace-Zustand {#namespace-durable-controls}

| Variable | Vorgabe | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | JSON mit Standardkontingenten dauerhafter Zeilen pro Namespace. Gesamt- und Pending/Open-Grenzen gelten unabhängig; ausstehende Tasks sind Ready-Zeilen in der Queue, aktive Leases werden separat begrenzt. Ein leeres Objekt begrenzt nicht. Der native 3.x-Server verweigert den Start, es sei denn, die Einstellung ist nicht gesetzt oder `{}`; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | JSON mit unübergehbaren Obergrenzen dauerhafter Zeilen einschließlich Overrides; ein leeres Objekt fügt keine Betreiberobergrenzen hinzu. Der native 3.x-Server verweigert den Start, es sei denn, die Einstellung ist nicht gesetzt oder `{}`; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | JSON mit Overrides dauerhafter Zeilenkontingente pro Namespace; harte Obergrenzen gelten weiterhin. Der native 3.x-Server verweigert den Start, es sei denn, die Einstellung ist nicht gesetzt oder `{}`; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[Kontingente für dauerhaften Namespace-Zustand](./task-queue-admission.md#namespace-durable-state).

### Externe Payload-Kontingente und S3-Transport {#external-payload-quotas-and-s3}

| Variable | Vorgabe | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | Unterschiedliche Bytes in unveränderlichen Upload-Slots eines geleasten Completions; ohne Wert gilt `DW_EXTERNAL_PAYLOAD_MAX_BYTES`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | Kumulierte Bytes externer Payloads pro Namespace. Fertige und laufende Objekte zählen; ohne Wert unbegrenzt. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Anzahl externer Payload-Objekte pro Namespace. Fertige und laufende Objekte zählen; ohne Wert unbegrenzt. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | Unübergehbare Obergrenze kumulierter externer Payload-Bytes pro Namespace einschließlich Overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Unübergehbare Obergrenze externer Payload-Objekte pro Namespace einschließlich Overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | JSON-Objekt nach Namespace mit Kontingent-Overrides für `max_bytes` und `max_objects`. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | Optionale Access-Key-ID des laufzeitverwalteten S3-kompatiblen Datenträgers; bei Workload Identity entbehrlich. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | Optionaler geheimer Schlüssel des verwalteten S3-kompatiblen Datenträgers; zusammen mit der Access-Key-ID setzen. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | Optionales Session-Token temporärer Zugangsdaten des verwalteten S3-kompatiblen Datenträgers. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | Region des laufzeitverwalteten S3-kompatiblen Datenträgers. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | Bucket des laufzeitverwalteten S3-kompatiblen Datenträgers. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | Optionaler HTTPS-Endpunkt des S3-kompatiblen Dienstes für externe Payloads. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | Path-Style-Bucket-Adressierung für den verwalteten S3-kompatiblen Dienst verwenden. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### Service-Grenzen pro aufrufendem Namespace {#service-caller-namespace-controls}

| Variable | Vorgabe | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | Optionale gemeinsame Zahl von Service-Aufrufen pro Minute, über den aufrufenden Namespace aggregiert. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | Optionale gemeinsame Zahl laufender Service-Aufrufe, über den aufrufenden Namespace aggregiert. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | Unübergehbare Minutenobergrenze für Service-Grenz- und Aufrufer-Namespace-Richtlinien. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | Unübergehbare Obergrenze laufender Aufrufe für Service-Grenz- und Aufrufer-Namespace-Richtlinien. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | JSON mit Raten- und Gleichzeitigkeit-Overrides nach aufrufendem Namespace; harte Obergrenzen gelten weiter. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### Koordination, Speicher und Laufzeit {#coordination-storage-and-runtime-controls}

| Variable | Vorgabe | Zweck | Alter Alias |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | Begrenzte Speicherung und Übertragung von Trace-Kontext sowie Discovery aktivieren, wenn optionale API und Schema installiert sind. | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | JSON-Liste erlaubter Baggage-Schlüssel an Run-Ursprüngen; standardmäßig leer. Links tragen niemals Baggage. | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | Optionale lokale, schreibgeschützte Datei zur Beobachtung von Speicherdruck; ungültige oder veraltete Beobachtungen sperren Schreibvorgänge. | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | Erwartete Identität der Speicherressource in der Zulassungsbeobachtung. | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | Maximales Alter einer Speicherbeobachtung in Sekunden, von 1 bis 300. | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | Dauerhafte, datenbankgestützte und Namespace-gebundene Runtime-Bearer-Zugangsdaten über die Admin-API aktivieren. | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Obergrenze pro Knoten für gehaltene Workflow-/Activity-Long-Polls eines Namespace; höchstens das globale Worker-Limit. Ohne gemeinsame Cache-Autorität wird abgelehnt. Der native 3.x-Server ignoriert die Einstellung; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Obergrenze pro Knoten für gehaltene Query-Task-Long-Polls eines Namespace; höchstens das globale Query-Limit. Ohne gemeinsame Cache-Autorität wird abgelehnt. Der native 3.x-Server ignoriert die Einstellung; siehe [Nativer Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | Embedded-v1-Migration und Queue-Leerung nur zum bewussten Erhalt von v1-Zustand aktivieren; eigenständiger Server nutzt standardmäßig nur v2. | `WORKFLOW_V1_ENABLED` |

## Infrastrukturvariablen der Laufzeitumgebung {#runtime-infrastructure-variables}

Infrastrukturvariablen konfigurieren Framework und Abhängigkeiten. Die Server-Prüfung erkennt sie und warnt deshalb nicht, sie sind aber keine stabilen Durable Workflow API-Einstellungen. Der native 3.x-Server liest die Gruppe Datenbank einschließlich der unten beschriebenen TLS-Einstellungen. Er hat weder Redis noch Cache oder Laravel-Queue, schreibt seine Protokolle nach Standardfehler und liest weder `LOG_CHANNEL` noch `LOG_LEVEL`.

| Gruppe | Variablen | Verwendung |
| --- | --- | --- |
| Anwendung | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, Sprach-, Zeitzonen-, Wartungs- und Verschlüsselungseinstellungen | Identität und Startverhalten der Laravel-Anwendung. |
| Protokollierung | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, Einstellungen für stack, daily, Slack und Papertrail | Ziele, Formatierung und Aufbewahrung der Laravel-Protokolle. |
| Datenbank | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, `DB_SSLMODE` (`DB_SSL_MODE`), `DB_SSLROOTCERT` (`DB_SSL_ROOT_CERT`), `MYSQL_ATTR_SSL_CA`, Zeichensatz-, Sortier- und Fremdschlüsseleinstellungen | SQL-Zustandsspeicher für Workflow-, Namespace-, Worker- und Projektionstabellen. Siehe [Datenbank-TLS](#database-tls). |
| Redis/Cache/Queue | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Queue-Worker, Cache-Sperren, Long-Poll-Signale und Web-/Sitzungsunterstützung. |
| Dateisysteme/E-Mail/Broadcasting | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Framework-Integrationen für bereitstellungsspezifische Funktionen. |
| Build/Laufzeit | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Docker-Compose-Images und Laufzeitverhalten des Frameworks. |

## Datenbank-TLS {#database-tls}

Der native 3.x-Server löst diese Einstellungen wie PHP 2.x auf: mit denselben
Eingaben, Aliasen, Modusnamen und Ablehnungen. Zu konfigurieren sind ein
Server-Prozess sowie jeder Befehl `schema-upgrade` oder jede Übernahme, die gegen
dieselbe Datenbank läuft. Unter PHP 2.x setzen Sie dieselben TLS-Einstellungen
für API-Server, Queue-Worker, Bootstrap-/Migrationsjob und Scheduler. PostgreSQL verwendet standardmäßig
`prefer`; MySQL/MariaDB behalten ohne Modus ihre Verbindungsstandards. Keiner
dieser Standards garantiert eine authentifizierte, verschlüsselte Verbindung.

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | Kein TLS. | Kein TLS; widersprüchliche TLS-Optionen werden abgelehnt. |
| `allow`, `prefer` | Opportunistisches TLS ohne Verschlüsselungs- oder Identitätsgarantie. | Abgelehnt. |
| `require` | Verschlüsselung erforderlich. | Verschlüsselung mit mysqlnd und OpenSSL erforderlich. |
| `verify-ca` | Verschlüsselung und vertrauenswürdige Zertifikatskette erforderlich. | Abgelehnt: PDO mysqlnd kann die Kette nicht unabhängig vom Hostnamen prüfen. |
| `verify-full` | Verschlüsselung, vertrauenswürdige Kette und passender Hostname erforderlich. | Verschlüsselung, vertrauenswürdige Kette und passender Hostname erforderlich. |

`DB_SSL_MODE` ist ein Alias für `DB_SSLMODE`, `DB_SSL_ROOT_CERT` für
`DB_SSLROOTCERT`. Mounten Sie zur Zertifikatsprüfung ein lesbares CA-Bundle am
konfigurierten Pfad in **jeder Rolle**, auch für Migrationen. `MYSQL_ATTR_SSL_CA`
kann die CA für explizites MySQL-/MariaDB-`verify-full` liefern. Widersprüche
zwischen kanonischen Einstellungen, Aliasen oder URL verhindern den Start.
Erforderliches TLS braucht einen expliziten TCP-Hostnamen; Unix-Sockets werden
abgelehnt. Explizite MySQL-/MariaDB-TLS-Modi benötigen PDO MySQL mit mysqlnd und
OpenSSL.

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

Verwenden Sie den DNS-Hostnamen des Zertifikats. Konfigurieren Sie in Helm
`externalDatabase.sslMode` und `externalDatabase.tls.existingSecret` / `caKey`.
Erstellen Sie das Secret vor Installation oder Upgrade; das Chart mountet die
CA in allen vier Rollen einschließlich Bootstrap-Hook. Starten Sie dauerhafte
Rollen nach Umgebungsänderungen neu, da die Konfiguration beim Start gecacht wird.

## Container-Protokolle {#container-logs}

Der native 3.x-Server schreibt seine Protokolle immer nach Standardfehler. Unter
PHP 2.x setzen Sie `LOG_CHANNEL=stderr` für API-, Worker- und Scheduler-Container, damit
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
