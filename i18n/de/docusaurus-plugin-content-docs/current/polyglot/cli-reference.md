---
sidebar_position: 4
title: CLI-Befehlsreferenz
description: Referenz der Durable-Workflow-CLI-Befehle, stabilen Ausgabemodi, gemeinsamen Optionen und des Fehlerverhaltens.
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - dw-Befehlsreferenz
  - CLI-Ausgabe
  - Brücken-Webhook
  - Workflow-Befehl
---

# CLI-Befehlsreferenz {#cli-command-reference}

Diese Seite dokumentiert die v2-`dw`-Befehlsoberfläche als Vertrag für Betrieb
und Automatisierung. Installation und Profileinrichtung beschreibt der
[CLI-Leitfaden](/docs/polyglot/cli). Nutzen Sie diese Seite, um Skripte,
CI-Jobs, Betriebsanleitungen oder KI-Agenten an genaue Befehlsformen anzubinden.

Alle servergestützten Befehle verwenden die Control-Plane-Protokollversion `2`
des eigenständigen Servers. Die CLI prüft die vom Server veröffentlichten
Protokollmanifeste, bevor sie kanonischen Anfrage- und Antwortfeldern vertraut.

## Globale Optionen {#global-options}

Servergestützte Befehle akzeptieren diese Optionen, sofern nicht anders angegeben.

| Option | Bedeutung |
| --- | --- |
| `--server`, `-s` | Server-Basis-URL. Überschreibt Profile und Umgebungsvariablen für diesen Aufruf. |
| `--namespace` | Ziel-Namespace. Überschreibt den Profil-Namespace. |
| `--token` | Bearer-Token für diesen Aufruf. Für gespeicherte Automatisierung Profile mit `--token-env` bevorzugen. |
| `--env` | Benanntes CLI-Umgebungsprofil. Unbekannte Profilnamen führen zum Fehler statt zum Rückfall. |
| `--output=table\|json\|jsonl` | Ausgabevertrag. `table` ist menschenlesbar, `json` ein JSON-Dokument und `jsonl` ein JSON-Objekt je Zeile für Listenbefehle. |
| `--json` | Lokaler Alias für JSON-Ausgabe bei Befehlen, die ihn anbieten. |

Befehle mit Aufrufernutzlasten verwenden einen gemeinsamen Eingabevertrag:

| Option | Bedeutung |
| --- | --- |
| `--input`, `-i` | Inline-Eingabedokument. |
| `--input-file` | Eingabe aus einer Datei oder `-` für stdin lesen. Schließt `--input` aus. |
| `--input-encoding=json\|raw\|base64` | Eingabe als JSON decodieren, Rohtext als ein Argument übergeben oder Base64 als ein Argument decodieren. Standard `json`. |

JSON-Eingaben für Workflow-Starts, Signale, Abfragen, Updates, Zeitpläne und
Aktivitätsabschlüsse repräsentieren das v2-Array der Positionsargumente.
Raw- und Base64-Eingaben werden zu einem Positionsargument, sodass der Server
weiterhin das kanonische Array `input` erhält.

## Verbindung und Diagnose {#connection-and-diagnostics}

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw --version` | CLI-Build-Identität ausgeben. Wenn `DW_ENV` oder `DURABLE_WORKFLOW_SERVER_URL` ein Ziel auswählt, zusätzlich eine kurze Kompatibilitätsprüfung durchführen. | `-V`, `--version` |
| `dw server:health` | Server-Zustand und Erreichbarkeit der Authentifizierung prüfen. | globale Optionen, `--json` |
| `dw server:info` | Server-Version, Rollentopologiemanifest, Protokollmanifeste, Anfragevertrag, Worker-Protokoll, Worker-Flottenangaben und Kompatibilitätsmetadaten anzeigen. | globale Optionen, `--json` |
| `dw doctor` | Aufgelösten Profil-/Server-/Token-/TLS-Zustand, entfernte Kompatibilitätswarnungen und nächste Schritte erklären. | globale Optionen, `--json` |
| `dw debug workflow <workflow-id>` | Diagnose eines festhängenden Workflow-Laufs erfassen: Zustand, ausstehende Tasks, Warteschlangenangaben, Fehler und Kompatibilitätsmetadaten. | `--run-id`, globale Optionen, `--json` |
| `dw server:start-dev` | HTTP-Anwendung eines bestehenden konfigurierten Laravel-Projekts bereitstellen. Benötigt externes PHP. | `--port`, `--host` (Standard `127.0.0.1`), `--db=sqlite\|mysql\|pgsql` |
| `dw watch workflow <workflow-id>` | Workflow bis zum terminalen Zustand oder bis zur konfigurierten Abfragegrenze beobachten. | `--run-id`, `--interval`, `--max-polls`, globale Optionen |
| `dw upgrade` | Laufende eigenständige `dw`-Binärdatei durch ein neueres oder festgelegtes Release ersetzen. Verweigert das Überschreiben von Composer-vendor-, Homebrew-cellar- und PHAR-Installationen. | `--tag`, `--dry-run`, `--force`, `--output=table\|json` |

Verwenden Sie `server:info` zur Vertragsprüfung, `doctor` zur Erklärung von
CLI-Verbindungsproblemen und `debug workflow`, wenn Support eine maschinenlesbare
Lauferfassung benötigt.

### HTTP-Server für ein lokales Projekt {#local-project-http-server}

Führen Sie `dw server:start-dev` im Verzeichnis eines installierten
Laravel-Projekts mit `artisan` aus. Die native CLI benötigt dafür ein separates
PHP-Programm auf `PATH`. Konfigurieren Sie zuerst die Datenbank und führen Sie
Migrationen aus. Der gewählte `--db`-Wert wird als `DB_CONNECTION` übergeben.
Leeren Sie beim Treiberwechsel Laravels Konfigurationscache. Führen Sie bei
Bedarf Warteschlangen-Worker und Scheduler separat aus. Starten Sie den Befehl
nach Änderungen an `.env` neu. Der gewählte Treiber bleibt durch Artisans
`--no-reload`-Modus für HTTP-Anfragen angewendet.

Der Befehl bindet standardmäßig an Loopback. Verwenden Sie explizit
`--host=0.0.0.0` für alle Schnittstellen. MySQL- und PostgreSQL-Modi benötigen
Compose-Dienste des Projekts namens `mysql` beziehungsweise `pgsql` sowie
`redis`. Fehler von Abhängigkeits- oder HTTP-Prozessen liefern einen Exit-Code
ungleich null. Compose-Dienste laufen nach Ende des HTTP-Prozesses weiter.

Native POSIX-Binärdateien leiten SIGINT und SIGTERM an das aktive Kind weiter
und warten bis zu fünf Sekunden auf das Ende seiner Prozessgruppe.
Quellcode- und PHAR-Installationen benötigen dafür PHPs Erweiterungen `pcntl`
und `posix`. Windows verwendet sein Konsolen-Unterbrechungsverhalten.

Für einen eigenständigen Durable Workflow Server mit veröffentlichten Images
folgen Sie dem [Service-Schnellstart](/docs/quickstart).

### Server-Info und Rollentopologie {#server-info-and-role-topology}

`dw server:info` ist die CLI-Oberfläche für `GET /api/cluster/info`. Im
Tabellenmodus enthält es einen Abschnitt `Topology:`, der den vom antwortenden
Knoten veröffentlichten Rollentopologievertrag zusammenfasst:

- `Supported Shapes` und `Current Shape` zeigen zulässige Bereitstellungsformen
  und die aktuell von diesem Knoten bediente Form.
- `Current Process Class` und `Current Roles` benennen Prozessklasse und
  Rollenbündel des antwortenden Knotens.
- `Matching Role`, `Matching Partitions` und `Matching Backpressure` zeigen
  Matching-Form, Aufweckzuständigkeit, Task-Zuweisungsmodus und
  Aufteilungsmerkmale für die Übernahme bereiter Arbeit.
- `Matching Discovery Limits` fasst den festgelegten numerischen Matching-Vertrag
  zusammen: `poll_batch_cap`, `availability_ceiling_seconds`,
  `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` und
  `activity_task_lease_seconds`. Der Betrieb kann damit den dokumentierten
  Vertrag prüfen, ohne den Paketquellcode zu durchsuchen.
- `Current Write Boundaries` nennt dauerhafte Schreiboberflächen, die aktuell
  den Rollen dieses Knotens gehören.
- `Scaling Boundaries` und `Failure Domains` zeigen je Rolle erwartete Lasttreiber
  oder erste Ausfallsignale.

Verwenden Sie `--output=json`, wenn Skripte das rohe Manifest benötigen.
`topology.schema` und `topology.version` binden die Vertragsrevision, damit
Skripte Strukturabweichungen erkennen. `topology.execution_mode` meldet den
Zuweisungsmodus des antwortenden Knotens. Stabile Maschinenfelder liegen unter
`topology`, darunter `supported_shapes`, `current_shape`,
`current_process_class`, `current_roles`, `matching_role`, `role_catalog`,
`authority_boundaries`, `authority_surfaces`, `supported_topologies`,
`scaling_boundaries` und `failure_domains`. `topology.matching_role`
veröffentlicht außerdem `partition_primitives` und `backpressure_model`, damit
Skripte Routing-Achsen der Suche nach bereiten Tasks ohne Prosaauswertung prüfen
können. `topology.matching_role.discovery_limits` zeigt den festgelegten
numerischen Vertrag mit `poll_batch_cap`, `availability_ceiling_seconds`,
`wake_signal_ttl_seconds`, `workflow_task_lease_seconds` und
`activity_task_lease_seconds`. Skripte können damit die Matching-Werte des
Workflow-Pakets binden, ohne menschenlesbare Abschnitte auszuwerten.

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

Die Bedeutung dieser Felder erklärt
[Server-Rollentopologie](/docs/polyglot/server-role-topology).

### Server-Info und Koordinationszustand {#server-info-and-coordination-health}

`dw server:info` veröffentlicht auch das Namespace-übergreifende Urteil zur
Rollout-Sicherheit des Servers. Der Betrieb kann den Koordinationszustand ohne
separate Zustandsoberfläche lesen. Im Tabellenmodus zeigt die CLI unter
`Topology:` einen Abschnitt `Coordination Health:`. Mit `--output=json` liegen
dieselben Daten unter `coordination_health` mit stabilen Maschinenfeldern:

- `coordination_health.schema` und `coordination_health.version` binden die Vertragsrevision.
- `coordination_health.namespace_scope` meldet, ob das Urteil einen Namespace oder die gesamte Flotte abdeckt.
- `coordination_health.status` und `coordination_health.http_status` melden das Gesamturteil und die HTTP-Bereitschaftsschranke des Servers.
- `coordination_health.generated_at` hält den Snapshot-Zeitpunkt fest.
- `coordination_health.categories` fasst Anzahlen je Kategorie zusammen, etwa `correctness`, `safety`, `routing`.
- `coordination_health.warning_checks` und `coordination_health.error_checks`
  nennen die Prüfungen, die Warnung oder Fehler ausgelöst haben, damit Skripte
  nach den fehlerhaften Oberflächen verzweigen können.
- `coordination_health.checks[]` enthält Details je Prüfung mit `name`,
  `status`, `category` und `message`, anhand derer Automatisierung ein
  beeinträchtigtes Urteil erklären kann. Das feste Inventar enthält stets
  `worker_compatibility`, `task_transport`, `routing_health`,
  `durable_resume_paths`, die Projektions-/Scheduler-Prüfungen und `activity_path`.
  `activity_path` ist das Aktivitätsgegenstück zu `task_transport`: Es zeigt
  Aktivitätsausführungen mit überschrittener, aber nicht durchgesetzter
  Schedule-to-start-, Start-to-close-, Schedule-to-close- oder Heartbeat-Frist
  sowie anhaltenden Aktivitätswiederholungsrückstau. Das Umbenennen von
  `activity_path` ist eine Protokolländerung.

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

Den zugrunde liegenden Bereitschaftsvertrag beschreibt die
[Server-API-Referenz](/docs/polyglot/server-api-reference).

### Selbstaktualisierung {#self-upgrade}

`dw upgrade` lädt das passende Plattformartefakt aus dem GitHub-Release von
`durable-workflow/cli`, prüft es gegen dessen `SHA256SUMS` und ersetzt die
laufende Binärdatei nur bei passender Prüfsumme. `--tag` bindet ein bestimmtes
Release-Tag, `--dry-run` löst das Zielrelease auf und zeigt Artefakt-URLs ohne
Download, `--force` lädt und ersetzt erneut, auch bei gleicher aktueller und
Zielversion.

Der Befehl verweigert das Überschreiben fremdverwalteter Installationen.
JSON-Ausgabe verwendet ein stabiles `status`-Feld für Verzweigungen ohne
Prosaauswertung:

| `status` | Bedeutung |
| --- | --- |
| `upgraded` | Binärdatei durch `target_version` ersetzt. |
| `noop` | `current_version` entspricht bereits `target_version`; `--force` umgeht dies. |
| `dry-run` | `--dry-run` hat `target_version`, `asset_url` und `checksum_url` ohne Download aufgelöst. |
| `refused` | Installation ist keine eigenständige Release-Binärdatei (Composer vendor, Homebrew cellar oder PHAR), oder für die Plattform ist kein Artefakt veröffentlicht. |
| `permission-denied` | Installationsverzeichnis nicht beschreibbar; die Nutzlast enthält einen `hint` mit empfohlenem nächsten Schritt. |
| `error` | Fehler beim Abruf des Release-Katalogs, abweichende Prüfsumme oder Dateisystemfehler. |

Bei Ablehnungen benennt `installation.kind` das verwaltende Werkzeug
(`composer-vendor`, `homebrew`, `phar` oder `binary`) und `reason` den richtigen
zuständigen Weg. Für öffentliche Automatisierung ohne Quellcode installieren
Sie ein festgelegtes Release über `https://durable-workflow.com/install.sh`
erneut. Für Tap-verwaltete Homebrew-Installationen verwenden Sie
`brew upgrade durable-workflow/tap/dw`.

## Umgebungsprofile {#environment-profiles}

Profile liegen unter `~/.config/dw/config.json` oder bei gesetztem
`XDG_CONFIG_HOME` unter `$XDG_CONFIG_HOME/dw/config.json`. Setzen Sie
`DW_CONFIG_HOME`, um ein Test- oder CI-Profilverzeichnis zu isolieren.

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw env:set <name>` | Benanntes Profil erstellen oder aktualisieren. | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true\|false`, `--profile-output=table\|json\|jsonl`, `--make-default`, `--json` |
| `dw env:list` | Profile auflisten, wörtliche Tokens standardmäßig geschwärzt. | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | Ein Profil anzeigen, standardmäßig das aktuelle. | `--show-token`, `--json` |
| `dw env:use <name>` | Standardprofil setzen. Unbekannte Namen scheitern. | `--json` |
| `dw env:delete <name>` | Profil löschen. | `--json` |

Bevorzugen Sie `--token-env=NAME` für Produktionsprofile, damit Geheimnisse in
der Laufzeitumgebung statt in der Profildatei bleiben.

## Workflow-Befehle {#workflow-commands}

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw workflow:start` | Workflow über die Control Plane starten. | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, Eingabeoptionen, `--json` |
| `dw workflow:list` | Workflow-Instanzen auflisten. | `--type`, `--status`, `--query`, `--limit`, globale Ausgabeoptionen |
| `dw workflow:describe <workflow-id>` | Aktuellen oder ausgewählten Lauf beschreiben. | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | Läufe einer Workflow-Instanz auflisten. | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | Einen Lauf anzeigen. | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | Historienereignisse eines Laufs lesen. | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | Archivnutzlast der Laufhistorie exportieren. | `--output-file`, globale Optionen |
| `dw workflow:signal <workflow-id> <signal-name>` | Signal senden. | `--run-id`, Eingabeoptionen, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | Schreibgeschützte Workflow-Abfrage ausführen. | `--run-id`, Eingabeoptionen, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | Workflow-Update übermitteln oder ausführen. | `--wait=accepted\|completed`, `--run-id`, Eingabeoptionen, `--json` |
| `dw workflow:cancel [workflow-id]` | Einen Workflow oder ausgewählten Batch als abgebrochen schließen; keine Bereinigung durch Workflow-Code. | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | Workflow zwangsweise terminieren. | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | Server um Reparatur eines festhängenden oder wiederholbaren Laufs bitten. | `--json` |
| `dw workflow:archive <workflow-id>` | Geschlossenen Lauf archivieren. | `--reason`, `--json` |

Beispiele:

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`, `workflow:signal`, `workflow:query` und `workflow:update`
prüfen kanonische Anfragefelder gegen den vom Server veröffentlichten
Anfragevertrag. Nichtkanonische alte Aliase werden vor dem Senden abgelehnt.

## Dienstaufrufe untersuchen {#service-call-inspection}

Mit `dw service-call:describe <endpoint> <service> <operation> <call-id>`
untersuchen Sie einen dauerhaften Nexus-Aufruf im Namespace des Endpunkts.
Beispielsweise liefert
`dw service-call:describe billing invoices create call-42 --namespace=shared --json`
die vollständige Server-Antwort.

Die Antwort erhält ursprünglichen Aufrufer und verknüpftes Ziel, Aufruffrist,
Status, Ergebnis, Versuchseinträge, typisierten Fehler und aufbewahrte
Nutzlastreferenzen. Erfolgreiche Ergebnisse bleiben verlustfreie Avro-Werte in
`result_envelope`. Ein angenommener oder gestarteter Aufruf ist noch ausstehend,
kein erfolgreich abgeschlossenes Ergebnis.

Der Befehl führt ein einzelnes GET aus. Er fordert weder Wiederholung noch
Abbruch oder Download externer Objekte an. Der Server kann einen Aufruf beim
Lesen mit dem terminalen Ergebnis seines verknüpften Workflows abgleichen.
Namespace-Autorisierung und die Auswahl von Endpunkt, Dienst, Operation und
Aufruf gelten vollständig.

## Brückenadapter-Befehle {#bridge-adapter-commands}

Brückenbefehle sind begrenzte Eingangs- und Übergabewerkzeuge für
Integrationsereignisse. Sie rufen die Brückenadapter-Oberfläche des Servers auf
und liefern im JSON-Modus die Struktur
`durable-workflow.v2.bridge-adapter-outcome.contract`. Sie führen keinen
Workflow-Code aus und verantworten keine Workflow-Zustandsübergänge.

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | Ein Webhook-Brückenereignis senden, das über die Control Plane einen Workflow startet, signalisiert oder aktualisiert. | `--action=start_workflow\|signal_workflow\|update_workflow`, `--idempotency-key`, `--target`, Eingabeoptionen, `--correlation`, `--json` |

Beispiele:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

Verwenden Sie Brückenergebnisfelder, statt Verhalten allein aus dem HTTP-Status
abzuleiten. `outcome`, `reason`, `control_plane_outcome`, `idempotency_key` und
die geschwärzte `target`-Zusammenfassung bilden den Automatisierungsvertrag für
Duplikate, fehlende Routing-Ziele, ungültige Nutzlasten und angenommene Übergaben.

## Zeitplanbefehle {#schedule-commands}

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw schedule:create` | Zeitplan erstellen. | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, Eingabeoptionen, `--json` |
| `dw schedule:list` | Zeitpläne auflisten. | `--status`, `--type`, `--query`, `--limit`, `--next-page-token`, `--json` |
| `dw schedule:describe <schedule-id>` | Einen Zeitplan beschreiben. | `--json` |
| `dw schedule:update <schedule-id>` | Zeitplanspezifikation oder Workflow-Eingabe aktualisieren. | Optionen zum Erstellen, Eingabeoptionen, `--json` |
| `dw schedule:pause <schedule-id>` | Zeitplan pausieren. | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | Zeitplan fortsetzen. | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | Zeitplan sofort auslösen. | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | Zeitfenster nachholen. | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | Zeitplan löschen. | `--json` |

Verwenden Sie beim Erstellen intervallbasierter Zeitpläne entweder `--cron`
oder `--interval`. Verwenden Sie `--paused` für Registrierungen bei der
Bereitstellung, die noch keine Arbeit starten sollen.

### Zeitpläne filtern und seitenweise abrufen {#schedule-list-filters}

`dw schedule:list` liefert eine gefilterte Seite im aufgelösten Namespace. Ohne `--namespace` wird nur der aufgelöste Standard-Namespace ausgewählt, nicht jeder Namespace. Status, Workflow-Typ und Sichtbarkeitsprädikate werden mit `AND` verknüpft. Die [Prüfung der regulär veröffentlichten CLI- und PHP-Server-Artefakte](https://github.com/durable-workflow/durable-workflow.github.io/issues/402#issuecomment-6370122227) bestätigt diese Optionen.

| CLI-Option | Server-Abfrageparameter | Bedeutung |
| --- | --- | --- |
| `--status` | `status` | `active` oder `paused`. |
| `--type` | `workflow_type` | Exakter Workflow-Typ. |
| `--query` | `query` | Ausdruck für die Sichtbarkeit von Zeitplänen. |
| `--limit` | `page_size` | Seitengröße von 1 bis 200, Standard 50. |
| `--next-page-token` | `next_page_token` | Opakes Fortsetzungstoken aus der vorherigen Antwort. |

Listen Sie im vorhandenen Namespace `production` mit dem registrierten Keyword-Attribut `Region` die pausierten Zeitpläne von `orders.rollup` für Region `eu` und Task Queue `orders` auf:

```bash
dw schedule:list --namespace=production --status=paused --type=orders.rollup \
  --query='Region = "eu" AND TaskQueue = "orders"' --limit=25 --json
```

Lesen Sie `next_page_token` aus der JSON-Antwort und setzen Sie `NEXT_PAGE_TOKEN` auf diesen Wert. Verwenden Sie für die nächste Seite denselben Namespace und dieselben Filter:

```bash
dw schedule:list --namespace=production --status=paused --type=orders.rollup \
  --query='Region = "eu" AND TaskQueue = "orders"' --limit=25 --json \
  --next-page-token="$NEXT_PAGE_TOKEN"
```

Tokens gehören zum Namespace und zur Filterauswahl. Beginnen Sie nach einer Filteränderung oder einer Ablehnung wegen eines veralteten Cursors erneut ohne Token. Jeder Aufruf liest eine aktuelle Seite, keinen unveränderlichen Snapshot. Die unterstützte Abfragesyntax und die Antwortfelder stehen unter [API-Grenzen und Ablehnungsgründen für Zeitplanlisten](/docs/polyglot/server-api-reference#schedule-list-filters).

## Worker- und Task-Warteschlangenbefehle {#worker-and-task-queue-commands}

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw worker:register [worker-id]` | Worker mit Kapazitäts- und Kompatibilitätsmetadaten registrieren. | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | Worker auflisten. | `--task-queue`, `--status`, globale Ausgabeoptionen |
| `dw worker:describe <worker-id>` | Einen Worker beschreiben. | `--json` |
| `dw worker:deregister <worker-id>` | Einen Worker abmelden. | `--json` |
| `dw task-queue:list` | Aktive Task-Warteschlangen und Zulassungsstatus auflisten. | globale Ausgabeoptionen |
| `dw task-queue:describe <queue>` | Worker-Kapazität, Leases, Zuweisungsbudgets und Kapazität ausstehender Abfrage-Tasks beschreiben. | `--json` |
| `dw task-queue:build-ids <queue>` | Kohortenzustand je Build-ID und Rollout-Status einer Warteschlange untersuchen. | `--json` |
| `dw task-queue:drain <queue>` | Build-ID-Kohorte als auslaufend markieren, damit sie keine neuen Tasks übernimmt. | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | Frühere Leerung aufheben, sodass die Kohorte wieder neue Tasks übernimmt. | `--build-id <value>`, `--unversioned`, `--json` |

Die Task-Warteschlangenbefehle sind die bevorzugte Betriebsansicht für
Drosselung, Kapazität und Diagnose fehlender Worker.
[Task-Warteschlangenzulassung](/docs/polyglot/task-queue-admission) erklärt die
serverseitige Richtlinie dieser Felder und
[Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout) den vollständigen
Lebenszyklus von Umstellung auf Versionierung, Canary, Leeren und Rollback.

`dw task-queue:drain` und `dw task-queue:resume` verlangen entweder
`--build-id <value>` für eine bestimmte Build-Kohorte oder `--unversioned`
für ohne `build_id` registrierte Worker. Beides zusammen scheitert sofort mit
einem Fehler für ungültige Optionen. Beide Befehle sind idempotent: Wiederholtes
Leeren verschiebt `drained_at` nicht. Das Fortsetzen einer bereits aktiven
Kohorte ändert nichts.

## Worker-Protokollbefehle {#worker-protocol-commands}

Diese Befehle sind Protokollwerkzeuge auf niedriger Ebene für Diagnose,
Smoke-Tests und Worker-Experimente ohne SDK. Normale PHP- und Python-Worker
sollten ihre SDK-Worker-Schleifen verwenden.

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | Einen Workflow-Task abfragen. | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | Nächste Historienseite eines geleasten Workflow-Tasks abrufen. | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | Einen Workflow-Task mit Befehlsnutzlasten abschließen. | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | Workflow-Task-Ausführungsfehler zur Wiederholung oder Diagnose melden. Anders als Task-Abschluss mit `fail_workflow`. | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | Einen gerouteten Workflow-Abfrage-Task abfragen und leasen. | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | Geleasten Abfrage-Task mit JSON-Ergebnis und passender Envelope abschließen. | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | Fehler eines geleasten Abfrage-Tasks mit maschinenlesbarem Grund melden. | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | Einen geleasten Aktivitätsversuch abschließen. | `--lease-owner`, Eingabeoptionen, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | Einen geleasten Aktivitätsversuch als fehlgeschlagen melden. | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

Verwenden Sie `workflow-task:fail` für workerseitige Ausführungsfehler wie
Replay-Abweichungen oder Deserialisierungsfehler. Es zielt auf
`POST /worker/workflow-tasks/{taskId}/fail`. Den Workflow durch einen
Workflow-Befehl scheitern zu lassen, ist eine getrennte Aufgabe und erfolgt
über `workflow-task:complete` mit passender Befehlsnutzlast.

`query-task:poll`, `query-task:complete` und `query-task:fail` bedienen die
geroutete Abfrage-Worker-Oberfläche unter `/worker/query-tasks/…`. Normale
Worker beziehen Abfrage-Tasks über ihren SDK-Abfrage-Handler. Die CLI dient
Diagnose, CLI-/SDK-Paritätsprüfungen und Worker-Experimenten ohne SDK.
Abfrage-Task-Fehler verwenden standardmäßig `--reason=query_rejected`.
Verwenden Sie einen stabilen Grund wie `unknown_query`, `decode_failure` oder
eine laufzeitspezifische Kennung, damit Aufrufer erwartete Ablehnungen von
Laufzeitfehlern unterscheiden können.

### Historienseiten von Workflow-Tasks {#workflow-task-history-pages}

`workflow-task:history` ist der CLI-Diagnosewrapper für den
Worker-Plane-Historienseitenendpunkt. Verwenden Sie ihn erst, nachdem
`workflow-task:poll` einen geleasten Workflow-Task mit `next_history_page_token`
liefert. Normale Worker sollten zusätzliche Historienseiten durch ihr SDK abrufen lassen.

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

Die JSON-Ausgabe ist die Server-Antwort ohne Feldumbenennung:

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

Automatisierung sollte `history_events`, `total_history_events` und
`next_history_page_token` lesen. Der Worker-Historienendpunkt verwendet nicht
die Control-Plane-Laufhistorienfelder `events` oder `next_page_token`.

## Namespace- und Suchattributbefehle {#namespace-and-search-attribute-commands}

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw namespace:list` | Namespaces auflisten. | globale Ausgabeoptionen |
| `dw namespace:create <name>` | Namespace erstellen. | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | Einen Namespace beschreiben. | `--json` |
| `dw namespace:update <name>` | Namespace-Metadaten aktualisieren. | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | Externe Nutzlastspeicherrichtlinie des Namespace für codierte Nutzlasten oberhalb der Auslagerungsschwelle konfigurieren. | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | Eine kleine Inline- und eine große ausgelagerte Nutzlast über die gewählte Namespace-Speicherrichtlinie oder einen Treiber-Override schreiben und zurücklesen. | `--driver=local\|s3\|gcs\|azure`, `--small-bytes`, `--large-bytes`, globale Optionen, `--json` |
| `dw search-attribute:list` | Suchattribute auflisten. | globale Ausgabeoptionen |
| `dw search-attribute:create <name> <type>` | Suchattribut registrieren. | `--json` |
| `dw search-attribute:delete <name>` | Suchattribut löschen. | `--json` |

Suchattributtypen sind serverkompatible Werte wie `keyword`, `text`, `int`,
`double`, `bool`, `datetime` und `keyword_list`.

Befehle für externen Nutzlastspeicher rufen die Namespace-Speicher-API des
Servers auf. Das Treiberargument ist `local`, `s3`, `gcs` oder `azure`.
Objektspeichertreiber verwenden serverseitige Dateisystemkonfiguration. Die
CLI-Optionen beschreiben daher die Namespace-Richtlinie statt Anbieterzugangsdaten
zu transportieren. Binden Sie mit `--disk` den Treiber `s3`, `gcs` oder `azure`
an einen benannten serverseitigen Dateisystem-Datenträger mit den tatsächlichen
Anbieterzugangsdaten. `--disable` erhält den Richtliniendatensatz und
verhindert neue Auslagerungen.

Beispiele:

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

Im JSON-Modus liefert `namespace:set-storage-driver` die Namespace-Nutzlast mit
ihrer `external_payload_storage`-Richtlinie. `storage:test` liefert den
Diagnosestatus und die Ergebnisobjekte `small_payload` und `large_payload`.
Automatisierung sollte nach diesen Feldern verzweigen, statt die Tabelle auszuwerten.

Die Diagnose ist auch die schnellste Betriebsprüfung des Referenz-Envelope-Vertrags.
Ein bestandener Test der großen Nutzlast belegt, dass die Richtlinie codierte
Bytes schreiben, eine Referenz
`durable-workflow.v2.external-payload-reference.v1` zurückgeben, das Objekt
zurücklesen und `size_bytes` plus `sha256` prüfen kann. Behandeln Sie eine
fehlgeschlagene Diagnose als Speicherrichtlinienproblem, bevor Workflows über
diesen Namespace Nutzlasten auslagern dürfen.

## Systembefehle {#system-commands}

Systembefehle bieten Server-Wartungsdurchläufe als explizite skriptfähige Operationen.

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw system:repair-status` | Workflow-Reparaturrückstau/-status zeigen. | `--json` |
| `dw system:repair-pass` | Einen Reparaturdurchlauf ausführen. | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | Rückstau/Status von Aktivitäts-Timeouts zeigen. | `--json` |
| `dw system:activity-timeout-pass` | Einen Aktivitäts-Timeout-Durchlauf ausführen. | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | Aufbewahrungsrückstau/-status zeigen. | `--json` |
| `dw system:retention-pass` | Einen Aufbewahrungsbereinigungsdurchlauf ausführen. | `--run-id`, `--limit`, `--json` |

Verwenden Sie in Betriebsanleitungen Statusbefehle vor Durchlaufbefehlen,
damit der Betrieb den ausstehenden Umfang vor Änderungen am Server-Zustand sieht.

## Schemabefehle {#schema-commands}

| Befehl | Zweck | Wichtige Optionen |
| --- | --- | --- |
| `dw schema:list` | Veröffentlichte maschinenlesbare Schemas auflisten. | keine Server-Verbindung nötig |
| `dw schema:show <command-name>` | Mitgeliefertes JSON Schema einer Befehlsausgabe zeigen. | `--output=json\|jsonl`; keine Server-Verbindung nötig |
| `dw schema:manifest` | Schemamanifest zeigen. | keine Server-Verbindung nötig |

Schemabefehle helfen, wenn ein KI-Client oder CI-Job den aktuellen
Control-Plane-, Antwort- oder Ausgabevertrag ohne Auswertung von Prosadokumentation
benötigt. Das [aktuelle v4-Manifest](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json)
bindet jede JSON-Envelope und jedes JSONL-Schema auf Datensatzebene über
öffentlichen Resolver und Hash. Seine Workflow-Start-/Lauf- und
Abfrage-/Update-Nutzlastfelder akzeptieren nur `avro`. Das aufbewahrte
[v3-Manifest](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json)
und [v2-Manifest](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json)
bleiben für an Revisionen gebundene Verbraucher mit ursprünglichen Bytes verfügbar.

## Ausgabe- und Exit-Vertrag {#output-and-exit-contract}

Verwenden Sie `--output=json` für ein Objekt und `--output=jsonl`, wenn ein
Listenbefehl einen Stream-Prozessor speist. Menschliche Tabellen dürfen sich
verbessern. JSON-Feldnamen bilden den Automatisierungsvertrag.

Alle Befehle verwenden die im [CLI-Leitfaden](/docs/polyglot/cli#exit-codes)
dokumentierten stabilen Exit-Codes:

| Code | Bedeutung |
| --- | --- |
| `0` | Erfolg. |
| `1` | Befehl lief, scheiterte aber allgemein. |
| `2` | Ungültige lokale Verwendung oder Validierungsfehler. |
| `3` | Netzwerk- oder Transportfehler. |
| `4` | Authentifizierungs- oder Autorisierungsfehler. |
| `5` | Ressource nicht gefunden. |
| `6` | Serverseitiger `5xx`-Fehler. |
| `7` | Timeout. |

Sammeln Sie für Support-Pakete `dw doctor --output=json`,
`dw server:info --output=json` und `dw debug workflow <workflow-id> --output=json`.

## Verwandte Leitfäden {#related-guides}

- [CLI](./cli.mdx) erklärt Installation, Profileinrichtung und Exit-Codes.
- [Server](./server.md) dokumentiert die von servergestützten Befehlen aufgerufene HTTP-Control-Plane.
- [Client- und Worker-Fähigkeiten](./cli-python-parity.md) vergleicht die Client-
  und Worker-Oberflächen von CLI, PHP, Python und Rust.
