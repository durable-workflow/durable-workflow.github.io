---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - Workflow-Überwachung
  - dauerhafte Historie
  - Laufzeittelemetrie
  - Waterline Handlungsmöglichkeiten
  - rein diagnostische Nachweise
  - Reparaturzustand
---

# Überwachung {#monitoring}

[Waterline](https://github.com/durable-workflow/waterline) ist die Operatoroberfläche und API für den Workflow-Zustand. Seine Bereitstellung folgt der gewählten Laufzeitgrenze: Cloud enthält Managed Waterline. Beim Selbsthosting stellt der Operator Waterline bei Bedarf separat bereit.

Waterline ist ein Operatorprodukt mit drei Nutzungsformen:

- **Eingebetteter Modus** installiert das Composer-Paket in der Laravel-Anwendung, die die Workflows verwaltet, und liest deren dauerhaften Zustand im Prozess.
- **Selbst gehosteter Dienstmodus** betreibt das veröffentlichte Image `durableworkflow/waterline` und liest den vom [eigenständigen Server](./polyglot/server.md) verwalteten Zustand über PHP-SDK und öffentliche Server-API. Die Serverdistribution enthält und betreibt Waterline nicht.
- **Cloud Managed Waterline** ist die Namespace-bezogene Operatoroberfläche in [Durable Workflow Cloud](./polyglot/cloud-control-plane.md). Cloud betreibt Managed Waterline und die dahinterliegende Namespace-Laufzeit.

Eingebetteter Modus und selbst gehosteter Dienstmodus stellen dieselbe Waterline-Kernoberfläche und dieselben Operatorroutenfamilien `/waterline/api/...` bereit. Cloud bietet diese Operatorfähigkeiten über seine verwaltete Oberfläche statt über einen vom Kunden bereitgestellten Waterline-Routenhost. Keine der Schnittstellen führt Laufzeitzustände zusammen: Jede Ansicht ist auf Läufe ihrer Laufzeit und ihres Namespace begrenzt. Beim selbst gehosteten Server bleiben native API-, CLI- und SDK-Operatorschnittstellen verfügbar, unabhängig von Waterline. Die [Server-API-Referenz](./polyglot/server-api-reference.md) beschreibt diese nativen Routen, die [Waterline-Operator-API-Referenz](./waterline-operator-api.md) Waterline-Routen und Antwortverträge.

Durable Workflow hat zwei Beobachtbarkeitsebenen:

| Ebene | Maßgebliche Quelle | Typische Fragen |
| --- | --- | --- |
| Dauerhafter Zustand | Workflow-Datenbank und API der verantwortlichen Laufzeit, Waterline-Projektionen und Historienexport | Wurde der Workflow gestartet? Welcher Lauf ist aktuell? Welches Signal, Update, welcher Timer, welche Aktivität, Wiederholung oder welcher Fehler wurde gespeichert? Welche Operatoraktion ist jetzt sicher? |
| Worker-/Laufzeittelemetrie | Logs der Warteschlangen-Worker, SDK-Metrikrekorder, Prometheus-/OpenMetrics-Endpunkte und Anwendungstraces | Pollen die Worker? Wie lange dauern Aufgaben? Ist ein Exporter konfiguriert? Haben eigene Anwendungsmetriken den Worker-Prozess verlassen? |

Waterline ersetzt bewusst keine Worker-Metriken. Wurde eine eigene Metrik im Aktivitäts- oder Worker-Code aufgezeichnet, fragen Sie den Telemetrieendpunkt des Workers ab. Verwenden Sie Waterline, um dieses Laufzeitsignal mit dauerhafter Workflow-Historie und aktuellem Laufzustand zu korrelieren.

Die Einrichtung von Workern und Clients bleibt ebenfalls von der Operatoroberfläche getrennt. Verwenden Sie beim Verbinden von Anwendungsclients und Workern mit der Namespace-verantwortlichen Laufzeit neben den Sprachleitfäden die generierte [PHP-SDK-API-Referenz](https://php.durable-workflow.com/api/), [Python-SDK-API-Referenz](https://python.durable-workflow.com/) oder [Rust-SDK-API-Referenz](https://rust.durable-workflow.com/).

Zeigt Worker-Telemetrie wiederholte Übernahmen, Rennen um verspätete Abschlüsse oder feststeckende Leases, lesen Sie zusätzlich [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md). Dieser Vertrag trennt Unsicherheit des At-least-once-Transports von doppelten dauerhaften Ergebnissen, damit scheinbar doppelte Nachweise nicht zu falschen Betriebsentscheidungen führen.

## OpenTelemetry-Tracing {#opentelemetry-tracing}

Verbinden Sie Anwendungsanfragen, Workflow-Tasks und Aktivitätsversuche über Prozessgrenzen hinweg mit optionalem OpenTelemetry-Tracing. Wählen Sie die Einrichtung für die Runtime, die Ihre Runs verwaltet.

### Eingebettetes Laravel {#embedded-tracing}

Um Anwendungslogs einem Workflow-Lauf und Aktivitätsversuch zuzuordnen, konfigurieren
Sie die optionale [Tracing-Integration im eingebetteten Modus (Englisch)](https://github.com/durable-workflow/workflow/blob/main/docs/embedded-tracing.md).
Sie bewahrt den W3C-Kontext über Warteschlangen-Worker, Wiederholungen und
Wiederherstellung hinweg und nutzt den OpenTelemetry-Provider sowie die
Laravel-Logkanäle Ihrer Anwendung. Der Leitfaden erklärt, wie Sie Tracing
aktivieren, den Log-Tap hinzufügen, die Schema-Migrationen ausführen und Exporte
begrenzen. Prüfen Sie vor dem Rollout das Span-Diagramm und die
Fähigkeitsmatrix für Laufzeiten und SDKs.

Ordnen Sie in der `config/workflows.php` Ihrer Anwendung eine anwendungseigene Umgebungsvariable der vorhandenen Tracing-Konfiguration zu:

```php
'tracing' => [
    'enabled' => (bool) env('DW_TRACING_ENABLED', false),
    'baggage_allowlist' => [],
],
```

Dieses Beispiel überträgt zunächst kein Baggage. Installieren Sie die optionale API und konfigurieren Sie Provider, Log-Tap, Migrationen und begrenzten Exporter wie im verlinkten Leitfaden beschrieben. Starten Sie danach die Worker neu.

### Tracing im Service-Modus {#service-mode-tracing}

Konfigurieren Sie Provider, Sampling, Propagatoren und begrenzten Export, bevor Sie SDK-Telemetrie aktivieren. Nutzen Sie den [PHP-Leitfaden](https://php.durable-workflow.com/operate/tracing/), den [Python-Leitfaden](https://python.durable-workflow.com/telemetry/) oder die [Rust-API](https://rust.durable-workflow.com/durable_workflow/telemetry/) auf Englisch.

| Runtime | Propagationsgrenze |
| --- | --- |
| Eingebettetes Laravel | Die optionale Core-Integration der Anwendung speichert Kontext über ihre Queue-Worker hinweg. |
| PHP Server | Der [Server-Leitfaden](https://github.com/durable-workflow/server/blob/2.10.0/docs/observability-context.md) erfordert ein Anwendungsimage mit optionaler API, aktiviertem Schalter und tatsächlichem nullable Schema. |
| PHP-, Python- und Rust-SDKs | Optionale Task-/Versuchs-Spans und begrenzter Log-Kontext. Dauerhafte Aufruferpropagation erfordert die exakt angekündigte Server-Fähigkeit. Fehlt sie oder ist sie fehlerhaft, entstehen unabhängige Task-Traces. |
| Nativer Rust Server | Diese PHP-Tracing-Version qualifiziert weder native Carrier noch Katalogkonvertierung. |
| Cloud | Diese Version enthält kein Cloud-Deployment. Prüfen Sie die Unterstützung der verwalteten Runtime. |

Trace-, Run-, Activity-, Versuchs- und Anfrage-IDs bleiben getrennt. Baggage ist auf eine standardmäßig leere Positivliste beschränkt; Links enthalten kein Baggage. Provider und Exporter gehören der Anwendung. Abrupte Beendigung kann Telemetrie verlieren; Replay garantiert keinen genau einmaligen Export. Für Geschäftsergebnisse gilt die dauerhafte History.

## Waterline-Ansichten {#waterline-views}

### Dashboard-Ansicht {#dashboard-view}

![Waterline-Dashboard](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

Das Dashboard zeigt Gesamtzahlen, Zähler jüngster Läufe und flottenweite Metriken. So erkennen Sie auf einen Blick, ob Arbeit fließt, stockt oder fehlschlägt.

Verwenden Sie die [Betriebsgrenzen für Operatoren](./operator-operating-envelope.md), wenn Sie den Rollout- und Betriebsvertrag zu diesen Fakten benötigen: welche Diagnosen Verkehr blockieren, welche nur Hinweise geben, wie Warteschlangenzustände zwischen Waterline und Worker-Telemetrie aufgeteilt sind und wie Neuaufbau, Export und Archivierung zu prüfen sind.

### Workflow-Ansicht {#workflow-view}

![Waterline-Workflow-Details](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

Die Workflow-Detailansicht zeigt die dauerhafte Zeitleiste eines Laufes: Aktivitäten, Signale, Timer und untergeordnete Workflows in ihrer Reihenfolge, jeweils mit Eingaben, Ausgaben und Zeitangaben.

## Waterline-Bereitstellung und Zugriff {#waterline-deployment-and-access}

### Eingebettetes Laravel {#embedded-laravel}

Installieren Sie Waterline neben dem Workflow-Paket in Ihrer Laravel-Anwendung und führen Sie seine Migrationen aus. Die vollständige Installations- und Konfigurationsanleitung steht unter [durable-workflow/waterline](https://github.com/durable-workflow/waterline).

Der eingebettete Modus verwendet Datenbankverbindung, Routen-Middleware, Authentifizierungs-Gate und Workflow-Paket der Hostanwendung. Betreiben Sie Laravel-Anwendung, Warteschlangen-Worker, Scheduler, Migrationen und Waterline-Assets weiterhin als gemeinsame Bereitstellungsgrenze. Die [Waterline-Operator-API-Referenz](./waterline-operator-api.md#installation) enthält den aktuellen Composer-Befehl und den Schritt zur Veröffentlichung der Assets.

### Waterline-Dienst {#waterline-service}

Das veröffentlichte Image enthält eine eigene PHP- und Laravel-Laufzeit. Es benötigt weder PHP noch Composer oder das Workflow-Paket auf dem Containerhost und verbindet sich nie mit der Datenbank des eigenständigen Servers.

Dieses Beispiel bindet Waterline an Loopback auf Hostport `8080`, speichert seinen eigenen UI-Zustand in einem benannten Volume und verbindet es mit einem Server-Namespace:

```bash
export WATERLINE_SERVER_ENDPOINT=https://workflow.example.com
export WATERLINE_SERVER_TOKEN=replace-with-a-server-token

docker run --detach \
  --name waterline \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:8080 \
  --volume waterline-data:/data \
  --env WATERLINE_SERVER_ENDPOINT \
  --env WATERLINE_SERVER_TOKEN \
  --env WATERLINE_NAMESPACE=orders \
  --env WATERLINE_ACCESS_MODE=read_only \
  --env WATERLINE_ALLOW_UNAUTHENTICATED=true \
  --env APP_URL=https://waterline.example.com \
  durableworkflow/waterline:%%artifact.waterlineVersion%%
```

Öffnen Sie `/waterline` über die durch `APP_URL` dargestellte URL. Das Image lauscht auf Containerport `8080`. Setzen Sie `PORT` nur, wenn Sie diesen internen Port bewusst ändern. `WATERLINE_PATH` ändert das Standard-URL-Präfix `waterline`. Das Repository veröffentlicht außerdem eine [Docker-Compose-Dienstdefinition](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml) mit derselben Verbindungsgrenze.

Der Dienstmodus hat zwei unabhängige Authentifizierungsebenen:

1. `WATERLINE_SERVER_TOKEN` ist das Bearer-Zugangsmerkmal, das Waterline für PHP-SDK-Aufrufe an `WATERLINE_SERVER_ENDPOINT` verwendet. Beobachtung von Workflows, Workern, Warteschlangen und Zeitplänen benötigt eine Server-Operatorrolle. Serverzustand und Operatormetriken können eine Adminrolle benötigen.
2. Browser- und Waterline-API-Zugriff bilden die äußere Zugriffsgrenze der Bereitstellung. Das eigenständige Image hat kein Laravel-Benutzerverzeichnis der Hostanwendung. `WATERLINE_ALLOW_UNAUTHENTICATED=true` gehört deshalb ausschließlich hinter einen authentifizierenden Reverse Proxy oder an eine private Schnittstelle wie die obige Loopback-Bindung. Behalten Sie `false` bei, sofern diese umgebende Authentifizierungsgrenze nicht vorhanden ist.

Setzen Sie `WATERLINE_NAMESPACE` auf den Namespace, den Operatoren prüfen möchten. Waterline sendet ihn bei jeder SDK-Anfrage. `WATERLINE_ACCESS_MODE=read_only` ist der Standard und blockiert verändernde Waterline-Aktionen. Verwenden Sie `operator` nur mit einem Servertoken, der die erforderlichen Befehle autorisiert.

Das Volume `/data` enthält Waterline-eigene gespeicherte Ansichten, Anzeigeeinstellungen und Laravel-Laufzeitzustand. Standardmäßig enthält es eine dateibasierte SQLite-Datenbank unter `/data/waterline.sqlite`. Es enthält niemals die Workflow-Historie des Servers. Verwenden Sie `DATABASE_URL` oder die üblichen Einstellungen `DB_*`, wenn Waterlines eigener Zustand in MySQL oder PostgreSQL liegen muss.

#### Zustand und Metriken {#health-and-metrics}

Verwenden Sie diese Prüfungen für unterschiedliche Fragen:

| Schnittstelle | Was sie nachweist |
| --- | --- |
| `GET /up` | Der Waterline-HTTP-Prozess ist gestartet und kann Anfragen beantworten. Die Docker-Zustandsprüfung des Images verwendet diese Route. |
| `GET /waterline/api/v2/health` | Waterline kann Namespace-bezogene Nachweise zu Serverzustand, Worker-Registrierung und Aufgabenwarteschlangen über das PHP-SDK zusammenstellen. |
| `GET /waterline/api/stats` | Dashboard-Gesamtzahlen und die von Waterline verwendete servergestützte Operatorzusammenfassung. |
| `GET /api/system/health` und `GET /api/system/operator-metrics` auf dem Server | Die nativen Serverzustands- und Operatorverträge, unabhängig von Waterline. |

Behandeln Sie `/waterline/api/stats` als Operator-JSON, nicht als Prometheus-Abfrageendpunkt. Worker-SDK-Metriken, Logs, Traces und eigene Anwendungstelemetrie stammen weiterhin aus Worker-Prozessen. Ein gesundes `/up` bei nicht verfügbarer Waterline-Zustands- oder Statistikantwort weist auf Serververbindung, Autorisierung, Namespace oder SDK-Fähigkeitsgrenze hin, nicht auf einen fehlgeschlagenen Waterline-Prozess.

#### Workflow-Sichtbarkeit und Operatoraktionen {#workflow-visibility-and-operator-actions}

Im Dienstmodus werden Listenansichten, Details ausgewählter Läufe, Historienexport, Zeitpläne, Worker-Status, Aufgabenwarteschlangennachweise, Signale, Updates, Abfragen, Reparatur, Abbruch, Terminierung und Archivierung über das PHP-SDK aus dem konfigurierten eigenständigen Server projiziert. Die Waterline-Routenstrukturen entsprechen weiterhin der [Waterline-Operator-API-Referenz](./waterline-operator-api.md). Die zugrunde liegenden Serververträge stehen weiterhin in der [Server-API-Referenz](./polyglot/server-api-reference.md).

Waterline zeigt nur den konfigurierten Namespace und die vom verbundenen Server verwalteten Läufe. Eingebettete Läufe bleiben über ihre eingebettete Waterline-Bereitstellung sichtbar, serververwaltete Läufe über die Dienstbereitstellung oder native Serverschnittstellen. Ein Wechsel des Waterline-Backends migriert oder vereinigt keine Läufe.

#### Grenzen der Fehlersuche {#troubleshooting-boundaries}

| Symptom | Zu prüfende Grenze |
| --- | --- |
| Der Container beendet sich, bevor er `/up` bereitstellt | Erforderliches `WATERLINE_SERVER_ENDPOINT`, beschreibbares `/data`, gültiges `PORT`, Datenbankeinstellungen und begrenzte Logs der Startmigration prüfen. |
| Waterline erhält `401` oder `403` aus einer servergestützten Ansicht | `WATERLINE_SERVER_TOKEN` und seine Serverrolle prüfen. Eine Ablehnung am äußeren Waterline-Zugang ist ein separates Proxy- oder `WATERLINE_ALLOW_UNAUTHENTICATED`-Problem. |
| Eine verändernde Route liefert `waterline_read_only` | Die Bereitstellung schreibgeschützt lassen oder ausdrücklich `WATERLINE_ACCESS_MODE=operator` setzen. Der Servertoken muss den Befehl weiterhin autorisieren. |
| Erwartete Workflows fehlen | `WATERLINE_NAMESPACE`, Serverendpunkt und die Laufzeit prüfen, die den Workflow-Start angenommen hat. Waterline durchsucht keine anderen Namespaces oder eingebetteten Laufzeiten. |
| `/up` besteht, aber Zustand, Statistik oder eine Ansicht meldet eine nicht verfügbare Fähigkeit | Serverendpunkt direkt über API oder CLI prüfen, dann Tokenrollen und die Verfügbarkeit der benötigten Methode im veröffentlichten Waterline-/PHP-SDK-Tupel prüfen. |
| Eine Dienstkatalogroute meldet `backend_capability_unavailable` | Der Dienstmodus spiegelt Waterlines eingebetteten Namespace-übergreifenden Dienstkatalog nicht. Verwenden Sie dafür native Dienstendpunkte und API des verbundenen Servers. |
| Eine eigene Metrik fehlt in Waterline | Den Metrikexporter des Workers prüfen. Waterline meldet dauerhafte Operatorfakten, keine beliebigen Prozessmetriken. |

### Cloud Managed Waterline {#cloud-managed-waterline}

Cloud-Kunden öffnen Cloud Managed Waterline über die Namespace-bezogene verwaltete Operatoroberfläche. Sie stellen Waterline, Server, PHP oder interne Endpunkte weder bereit noch konfigurieren sie diese und pflegen keine zweite Waterline-Anmeldung. Die obigen Anweisungen zu selbst gehostetem Image, `WATERLINE_*`, Servertoken, Datenbank und äußerer Authentifizierung gelten für diesen Weg nicht.

Die Cloud-Authentifizierung des Kunden legt die Operatoridentität fest. Die Autorisierung über Cloud-Organisation, Projekt, Umgebung und Namespace bestimmt, welchen verwalteten Waterline-Bereich diese Identität öffnen kann. Innerhalb dieser Grenze können Operatoren Workflow-Listen und Suche, Laufdetails und dauerhafte Historie, Namespace-Zustand und die für ihre Rolle unterstützten Aktionen verwenden. Die verwaltete Oberfläche bleibt auf den ausgewählten Namespace beschränkt und vereinigt keine Daten anderer Umgebungen oder Namespaces.

Mutationen sind rollenbeschränkt. Cloud ordnet jede unterstützte Operatormutation in seinen Auditdaten dem authentifizierten Cloud-Akteur zu. Der resultierende dauerhafte Workflow-Übergang bleibt in der Historie sichtbar. Beispielsweise wird eine erfolgreiche Archivierung in Cloud-Auditdaten zugeordnet und zeichnet das dauerhafte Historienereignis `WorkflowArchived` auf. Operatoren benötigen dafür weder private Laufzeitzugangsdaten noch Kenntnisse der internen Bereitstellung der verwalteten Laufzeit.

## Listen- und Detail-API {#list-and-detail-api}

Waterlines Listenansichten (`/waterline/api/flows/{bucket}`) und der Detailendpunkt für ausgewählte Läufe (`/waterline/api/flows/{id}`) liefern typisierte JSON-Verträge, die Sie direkt aus eigenen Dashboards oder Skripten nutzen können. Die [Waterline-Operator-API-Referenz](./waterline-operator-api.md) dokumentiert Endpunktliste, Feldfamilien ausgewählter Läufe, Historienexport, Handlungsmöglichkeiten, Zeitpläne, gespeicherte Ansichten, Einstellungen und den Operatoraktionsvertrag.

### Vertrag über Handlungsmöglichkeiten {#actionability-contract}

Waterline versieht Listenzeilen, Detailantworten ausgewählter Läufe und Historienexporte mit einem versionierten Vertrag über Handlungsmöglichkeiten. Verbraucher sollten `actionability_contract.schema = waterline.actionability` und `actionability_contract.version = 1` als Vertragskennung für die folgenden Felder behandeln.

`actionability` auf Laufebene beantwortet, ob der ausgewählte Lauf repariert werden kann:

| Feld | Bedeutung |
| --- | --- |
| `repair_state` | Einer der Werte `repairable`, `blocked`, `not_needed` oder `unknown`. |
| `repairable` | Boolesche Kurzform für `repair_state = repairable`. |
| `blocked_reason` | Stabiler Ursachencode bei `repair_state = blocked`. |
| `status_bucket` | Die Waterline-Kategorie, die die Entscheidung auf Laufebene bestimmt hat. |
| `closed_reason` | Dauerhafter Abschlussgrund bei geschlossenem Lauf. |
| `task_problem` | Ob Waterline ein Problem auf Aufgabenebene im Lauf erkannt hat. |
| `diagnostic_only_evidence` | Wahr, wenn mindestens eine untergeordnete Nachweiszeile informativ, aber keine Quelle für eine Wiederaufnahme ist. |

Nachweiszeilen unter `activities`, `waits`, `timers`, `exceptions`, `logs` und Zeitleisten-/Exporteinträgen können ebenfalls einen eigenen Block `actionability` enthalten:

| Feld | Bedeutung |
| --- | --- |
| `state` | `actionable`, wenn die Zeile eine gültige Reparaturquelle ist, sonst `diagnostic_only`. |
| `repair_source` | Nur bei Zeilen wahr, die auf einer maßgeblichen reparierbaren Quelle beruhen. |
| `diagnostic_only` | Wahr, wenn die Zeile nicht als Wiederaufnahmequelle verwendet werden darf. |
| `history_authority` | Maßgebliche Quelle, etwa `typed_history`, `mutable_open_fallback`, `failure_row_fallback` oder `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Stabiler Ursachencode für nicht unterstützte Fallback-Historie. |

Automatisierung sollte Reparatur-, Wiederaufnahme- und Replay-Aktionen anhand von `actionability.repair_state`, `actionability.repairable` und zeilenbezogenem `actionability.repair_source` freigeben. Eine Zeile mit `diagnostic_only = true` ist niemals eine dauerhafte Wiederaufnahmequelle, selbst wenn sie nützliche Fehler- oder Fallback-Metadaten enthält. Zeilen mit `history_authority = unsupported_terminal_without_history` sind ausschließlich diagnostische Nachweise: Sie erklären die Blockierung eines Laufes, belegen aber nicht genügend typisierte Historie für den sicheren Neuaufbau des Fortschritts.

## Control-Plane-Aktionen aus Waterline {#control-plane-actions-from-waterline}

Operatoren können Workflows direkt aus der Detailansicht abbrechen, terminieren, reparieren und archivieren. Jede Aktion entspricht einem `POST` auf dieselbe Lauf-ID und liefert entweder `200` mit dem resultierenden Zustand oder `409`, wenn sie für den aktuellen Laufzustand ungültig ist.

Im Dienstmodus leitet Waterline unterstützte Befehle über das PHP-SDK weiter. Mutationen erfordern sowohl `WATERLINE_ACCESS_MODE=operator` als auch Serverzugangsdaten mit Berechtigung für den Befehl. Ist Waterline nicht bereitgestellt, können Operatoren immer direkt Server-API oder CLI verwenden.

In Cloud Managed Waterline begrenzen Cloud-Rolle und Namespace-Autorisierung jede unterstützte Mutation. Die authentifizierte Cloud-Identität liefert die Auditzuordnung. Kunden konfigurieren für die verwaltete Oberfläche keine Waterline-zu-Server-Zugangsdaten.

## Verwandte Leitfäden {#related-guides}

- [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md) erklärt den Vertrag für Replay, Wiederholung, Lease-Ablauf und dauerhafte Ergebnisse, der Operatornachweise prägt.
- [Betriebsgrenzen für Operatoren](./operator-operating-envelope.md) verbindet Erwartungen an Zustand, Warteschlangen, Neuaufbau, Export, Archivierung und Topologie in einem Operatorvertrag.
- [Fehler und Wiederherstellung](./failures-and-recovery.md) erklärt erschöpfte Wiederholungen, nicht wiederholbare Fehler, Timeouts und Reparaturverhalten hinter den Dashboard-Fakten.
- [KI-gestützte Entwicklung](./ai-assisted-development.md) benennt die Waterline-, CLI-, MCP- und LLM-lesbaren Verträge, die Agenten zur Diagnose des Workflow-Zustands verwenden sollten.
