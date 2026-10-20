---
sidebar_position: 1
title: Migration von eingebettetem Betrieb zu Server
description: Eine eingebettete Laravel-v2-Bereitstellung zum eigenständigen Durable Workflow Server verlagern.
---

# Migration von eingebettetem Betrieb zu Server {#embedded-to-server-migration}

Dieser Leitfaden richtet sich an Teams, die Durable Workflow v2 bereits in
einer Laravel-Anwendung betreiben und neuen Workflow-Verkehr zum eigenständigen
Server verlagern. Läuft die Anwendung noch auf v1, beginnen Sie mit
[Migration zu 2.0](/docs/migration) und lassen Sie bestehende v1-Läufe bis zum
Abschluss auf der v1-Engine.

Lesen Sie zuerst [Laravel-Einstieg und Laufzeitwechsel](/docs/laravel-adoption/),
wenn das Ziel noch offen ist oder die Laravel-Framework-Integration Teil der
Entscheidung ist. Diese Seite ist die Betriebsanleitung für selbst gehosteten
Server nach dieser Wahl, nicht der Cloud-Migrationsweg.

Die Migration ist ein Einführungsweg, keine Datenbankverschiebung am selben Ort.
Der eigenständige Server verantwortet neue Control-Plane-Starts, dauerhafte
Historie, Zeitpläne, Worker-Registrierungen und HTTP-Task-Zustellung. Ihre
Anwendungs-Worker behalten die Verantwortung für Workflow- und Aktivitätscode.

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  Durable Workflow 2.0 hat einen öffentlichen Nutzlast-Codec: <code data-payload-codec-field="codec">avro</code>.
  JSON ist der HTTP-Dokumenttransport, kein dauerhafter Nutzlast-Codec. Reine
  PHP-v1-Reader bleiben intern im Import-/Auslaufpfad und können für neue
  v2-Läufe nicht ausgewählt werden. Siehe das <a href="/docs/polyglot/avro-value-protocol/">Avro-Value-Protokoll</a>.
</div>

Dies ist ein Leitfaden für selbst gehostete Migration. Er verwandelt die
eingebettete Bereitstellung nicht in einen Cloud-Namespace. Der resultierende
Server ist nicht mit Durable Workflow Cloud verbunden. Die separate verwaltete
Dienstoption beschreibt [Verwaltete Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane).

## Aktuelle Grenze {#current-boundary}

Heute unterstützt:

- Neue Workflows über die Server-Control-Plane-API oder CLI starten.
- PHP-, Python-, Rust- oder eigene HTTP-Worker am Server registrieren.
- Workflow- und Aktivitäts-Tasks über das Worker-Protokoll abfragen und abschließen.
- Geeignete Historienexportpakete aus eingebettetem v2 als serververwalteten Workflow-Zustand importieren.
- Historienpakete geschlossener Läufe aus eingebettetem v2 oder Server v2 für Audit, Debugging und Archivübergabe exportieren.
- Serververwaltete Workflows über Server-API, CLI und SDK-Oberflächen mit Zugriff
  auf Server-Zustand beobachten oder den [Waterline-Service-Modus](/docs/monitoring#waterline-service)
  als separaten, über das PHP SDK verbundenen Beobachter bereitstellen. Das
  Waterline-Paket in der ursprünglichen Laravel-Anwendung liest weiterhin nur
  den Zustand dieser eingebetteten Laufzeitumgebung.

Heute nicht automatisch unterstützt:

- v1-Läufe in Server verschieben.
- v1-Historie mit Nicht-PHP-Workern wiedergeben.

Planen Sie die Umstellung so, dass v1-Läufe an ihrem Startort auslaufen.
Eingebettete v2-Läufe können entweder dort auslaufen oder über den unten
beschriebenen Import verschoben werden.

## Vertrag der Bereitstellungsmodi {#deployment-mode-contract}

Den festgelegten Vergleich eingebettet/Service finden Sie unter
[Bereitstellungsmodi](/docs/polyglot/deployment-modes). Dieser Leitfaden ergänzt
vier umstellungsspezifische Regeln:

- Bestehende eingebettete Läufe werden weiter an ihrem Startort ausgeführt.
- Neue serververwaltete Läufe verwenden ab der ersten Umstellung stabile
  Typschlüssel, Namespace-Namen, Task-Warteschlangen und den Avro-Nutzlastvertrag.
- Signale, Abfragen, Updates, Reparatur, Abbruch, Terminierung und Archivierung
  müssen weiter an die zuständige Laufzeitumgebung des Ziellaufs geroutet werden.
- Jede Waterline-Bereitstellung muss weiter die vorgesehene Laufzeitumgebung
  und den Namespace beobachten. Sie führt eingebettete und serververwaltete Läufe nicht zusammen.

## Invarianten der Umstellung {#cutover-invariants}

Halten Sie diese Regeln während der gesamten Migration ein:

- Konfigurieren Sie Server als explizite entfernte Abhängigkeit: Setzen Sie
  Basis-URL, Namespace, Task-Warteschlange und Authentifizierungsmaterial direkt,
  statt sie aus Laravel-lokalen Einstellungen abzuleiten.
- Halten Sie Workflow-IDs, Regeln zur Laufauswahl, Workflow-/Aktivitätstypschlüssel,
  Nutzlast-Codec-Tag (`avro`) und Kompatibilitätsmarker in beiden Laufzeitumgebungen stabil.
- Routen Sie Signale, Abfragen, Updates, Reparatur, Abbruch, Terminierung und
  Archivierung an dieselbe Laufzeitumgebung, der der Ziellauf gehört.
- Pausieren Sie vor dem Import eines eingebetteten Laufs die eingebetteten Worker
  lange genug für einen ruhenden Export ohne geleasten Workflow-/Aktivitäts-Task
  und ohne laufenden Aktivitätsversuch.
- Behandeln Sie Sprachneutralität als Teil des Migrationsvertrags:
  Serververwaltete Workflows verwenden stabile Aliasse und das feste
  Avro-Value-Schema statt reiner PHP-Klassennamen oder Nutzlastformate.

## Phase A: Eingebettetes v2 vorbereiten {#phase-a-prepare-embedded-v2}

Stellen Sie die eingebettete Anwendung vor der Server-Bereitstellung auf
sprachneutrale Verträge um. So ändert sich während der Umstellung weniger Code.

1. Definieren Sie stabile Workflow- und Aktivitätstypschlüssel.

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. Verwenden Sie diese Schlüssel an jeder externen Grenze.

   Server-Clients senden `workflow_type: "orders.process"`. Worker registrieren
   `supported_workflow_types` / `supported_activity_types` mit denselben
   Zeichenfolgen. Verwenden Sie PHP-FQCNs nicht als dauerhaften öffentlichen Vertrag.

3. Verwenden Sie den v2-Avro-Nutzlastvertrag.

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   Avro ist für neue eingebettete und serververwaltete v2-Workflows zwingend.
   Ein alter PHP-Reader darf nur intern im v1-Import-/Auslaufpfad verbleiben,
   während alte v1-Läufe enden.

4. Wählen Sie Namespace- und Task-Warteschlangennamen.

   Wählen Sie Namen, die während der gesamten Umstellung auf Server stabil bleiben:

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. Entscheiden Sie, ob Kompatibilitätsmarker nötig sind.

   Bei einer einzigen Flotte kann Kompatibilität ungesetzt bleiben. Die
   Standard-v2-Rollout-Mechanik (Canary, Leeren, Rollback, Replay-Debugging)
   arbeitet innerhalb eines stabilen v2-Vertrags. Es gibt keinen Einführungsweg
   „v2 mit gemischter Flotte“. Entsteht bei der Umstellung ein Fenster mit
   unterschiedlichen Builds, setzen Sie vorab `DW_V2_CURRENT_COMPATIBILITY`
   und `DW_V2_SUPPORTED_COMPATIBILITIES`, damit ein neuer Build währenddessen
   keine Läufe eines inkompatiblen Builds übernimmt.

## Phase B: Server neben dem eingebetteten Betrieb bereitstellen {#phase-b-deploy-the-server-beside-embedded}

Betreiben Sie den eigenständigen Server neben der Laravel-Anwendung, während
sie bestehende eingebettete Läufe weiterverarbeitet.

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

Für lokale Entwicklung dürfen Sie `DW_AUTH_DRIVER=none` setzen. Verwenden Sie
in gemeinsamen Umgebungen rollenspezifische Zugangsdaten:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Prüfen Sie die Erkennung und erstellen Sie den Namespace:

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

Server lehnt Control-Plane-Anfragen ohne
`X-Durable-Workflow-Control-Plane-Version: 2` ab. Worker verwenden den separaten
Header `X-Durable-Workflow-Protocol-Version: 1.0`.

## Phase C: Worker verbinden {#phase-c-connect-workers}

Worker müssen sich vor dem Abfragen registrieren. Die Registrierung meldet
Laufzeitumgebung, Task-Warteschlange und die ausführbaren Typschlüssel.

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

Führen Sie Worker dann im Server-Modus für denselben Namespace und dieselbe
Task-Warteschlange aus. Python-Worker folgen demselben Registrierungs- und
Abfragevertrag über das Python SDK. Eigene Worker können das
[Worker-Protokoll](/docs/polyglot/worker-protocol) direkt verwenden.

Prüfen Sie die Einsicht vor der Umstellung:

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## Phase D: Neue Starts an Server routen {#phase-d-route-new-starts-to-the-server}

Stellen Sie jeweils eine Workflow-Familie um. Lassen Sie die eingebettete
Anwendung und ihre Warteschlangen-Worker für alte Läufe weiterlaufen, bis sie enden.

Starten Sie zuerst einen Schatten-Workflow:

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

Beobachten Sie den Lauf:

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Funktioniert der Schattenpfad, stellen Sie den Produktionsaufrufer von
`WorkflowStub::start()` auf Server-Client, CLI oder direkte HTTP-API um.
Signale, Abfragen, Updates, Abbruch und Terminierung bleiben an dieselbe
Laufzeitumgebung geroutet, die den Workflow gestartet hat. Eingebettet gestartete
Workflows erhalten eingebettete Befehle; auf Server gestartete Workflows
Server-Control-Plane-Befehle.

## Phase E: Geeignete eingebettete v2-Läufe importieren {#phase-e-import-eligible-embedded-v2-runs}

Verwenden Sie Historienexport als Importformat. Die eingebettete Laufzeitumgebung
bleibt maßgebliche Quelle des Pakets. Server prüft es, schreibt dauerhafte Zeilen
in einer Transaktion und baut daraus Server-Projektionen neu auf.

Voraussetzungen:

- Das Paketschema muss `durable-workflow.v2.history-export` mit `schema_version: 1` sein.
- Der Quelllauf muss eingebettetes v2 sein und der Export
  `workflow.source_runtime: "embedded"` enthalten. v1-Historie bleibt ausgeschlossen.
- Ein nicht terminaler Lauf muss der aktuelle eingebettete Lauf sein.
- Ein terminaler Lauf muss `history_complete: true` haben.
- Geschwärzte Pakete werden abgelehnt.
- Geleaste Workflow-Tasks, geleaste Aktivitäts-Tasks und laufende
  Aktivitätsversuche werden abgelehnt. Pausieren Sie Worker oder lassen Sie
  Leases ablaufen und exportieren Sie erneut.

Regeln zur maßgeblichen Importquelle:

- `history_events` werden als maßgebliches Replay- und Audit-Protokoll kopiert.
- Workflow-Identität, Nutzlasten, Befehle, Signale, Updates, Tasks,
  Aktivitätsausführungen, Timer, Fehler und Abstammungsverknüpfungen werden aus dem Paket rekonstruiert.
- Server-Projektionen für Zusammenfassung, Warten, Timer, Zeitachse und
  Abstammung werden nach dem Import neu aufgebaut. Projektionszeilen sind nicht die Importautorität.
- Ausstehende Workflow-Tasks bleiben für kompatible Server-Worker übernehmbar.
- Ausstehende Aktivitätsausführungen und bereite Aktivitäts-Tasks bleiben für
  kompatible Server-Aktivitäts-Worker übernehmbar.
- Ausstehende Timer behalten `fire_at` und sind für die Server-Timer-Reparatur/-Wiederherstellung sichtbar.

Fehler und Rollback:

- Import erfolgt vollständig oder gar nicht in einer Datenbanktransaktion.
- Endet der Prozess oder scheitert die Prüfung vor dem Commit, bleibt kein
  partieller Laufzustand auf Server.
- Erneuter Import desselben Pakets ist anhand von `run_id` und `dedupe_key` idempotent.
- Gehört dieselbe `run_id` bereits einem anderen Server-Lauf, wird der Import abgelehnt.

Einsicht und Audit:

- Importierte Läufe zeigen `engine_source: embedded_v2_import` in Server-Listen/-Details.
- Die dauerhafte Laufzeile hält `import_source=embedded_v2`, `import_id`,
  `import_dedupe_key`, `import_contract_version` und `imported_at` fest.

Betriebsablauf:

Für eingebettete v2-Läufe:

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

Probelauf des Imports auf Server:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

Paket importieren:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

Oder den HTTP-Betriebsendpunkt aufrufen:

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

Dabei enthält `order-123-import-request.json`:

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

Das obige Objekt `bundle` ist verkürzt. Übergeben Sie das vollständige
JSON-Dokument von `workflow:v2:history-export`.

Für serververwaltete Läufe, die Sie nur aufbewahren oder auditieren müssen:

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

Archivieren Sie terminale Server-Läufe nach dem Export, um sie von der
Aufbewahrungsbereinigung auszunehmen:

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## Phase F: Polyglotte Worker hinzufügen {#phase-f-add-polyglot-workers}

Sobald eine Workflow-Familie über Server läuft, ergänzen Sie Python-, Rust-
oder eigene Worker mit demselben Namespace, derselben Task-Warteschlange und
denselben Typschlüsseln. Jede öffentliche v2-Nutzlast verwendet `avro`.
Halten Sie Aktivitätseingaben und -ausgaben sprachneutral: Arrays, Objekte,
Zeichenfolgen, Zahlen, boolesche Werte und null.

Verwenden Sie den [Python-SDK-Leitfaden](/docs/polyglot/python) oder den
[Rust-SDK-Leitfaden](/docs/polyglot/rust). Für direkte HTTP-Implementierungen
nutzen Sie die [Worker-Protokollreferenz](/docs/polyglot/worker-protocol).

## Checkliste für die Umstellung {#cutover-checklist}

- [ ] v1-Läufe sind ausgelaufen oder bewusst auf der v1-Engine belassen.
- [ ] Eingebettetes v2 verwendet an externen Grenzen stabile Typschlüssel statt PHP-FQCNs.
- [ ] Jeder neue v2-Workflow verwendet den einzigen öffentlichen Codec `avro`.
- [ ] Server-`/api/health` und `/api/cluster/info` funktionieren aus dem Bereitstellungsnetz.
- [ ] Der Ziel-Namespace existiert auf Server.
- [ ] Worker registrieren erwartete Task-Warteschlange und unterstützte Typschlüssel.
- [ ] Ein Schatten-Workflow startet, wird übernommen und erreicht den erwarteten Zustand.
- [ ] Der Betrieb kann Workflows auflisten, Task-Warteschlangen untersuchen und Worker-Registrierungen ansehen.
- [ ] Alte eingebettete Starter sind pausiert oder verlagert, damit doppelte Geschäftsschlüssel nicht in beiden Laufzeitumgebungen starten.
- [ ] Zum Import gewählte eingebettete v2-Läufe sind aus einer ruhenden Laufzeitumgebung exportiert und bestehen `workflow:v2:history-import --dry-run`.
- [ ] Importierte Läufe zeigen `engine_source: embedded_v2_import` und die erwartete `import_id` in Server-Details/-Listen.
- [ ] Geschlossene alte Läufe, die nur Aufbewahrung benötigen, sind in dauerhaften Speicher exportiert.

## Fehlerbehebung {#troubleshooting}

| Symptom | Wahrscheinliche Ursache | Lösung |
| --- | --- | --- |
| `missing_control_plane_version` | Client rief Control-Plane-Route ohne v2-Header auf | `X-Durable-Workflow-Control-Plane-Version: 2` senden |
| `missing_protocol_version` | Worker rief Worker-Route ohne Worker-Protokoll-Header auf | `X-Durable-Workflow-Protocol-Version: 1.0` senden |
| `namespace_not_found` | Namespace ist auf Server nicht erstellt | Mit `POST /api/namespaces` erstellen |
| Worker-Abfragen liefern keinen Task | Task-Warteschlange, Typschlüssel, Namespace oder Kompatibilitätsmarker passen nicht | Workflow-Startnutzlast, Worker-Registrierung und Task-Warteschlangenansicht vergleichen |
| Nicht-PHP-Worker kann v1-Nutzlast nicht decodieren | Lauf enthält PHP-native v1-Historie | Lauf auf internem PHP-v1-Import-/Auslaufpfad belassen, nicht zu v2-Worker routen |
| Alter Workflow reagiert nicht auf Server-Signal/-Abfrage/-Update | Lauf wurde eingebettet gestartet | Bis zum Laufende Befehle durch die eingebettete Anwendung senden |
| Import lehnt `tasks.leased_task_present` ab | Export erfasste einen geleasten Task | Eingebettete Worker pausieren, Freigabe oder Abschluss der Leases abwarten und erneut exportieren |
| Import liefert `already_imported` | Dieselbe `run_id` und `dedupe_key` sind bereits auf Server vorhanden | Wiederholung als erfolgreich behandeln und Server-Lauf untersuchen |
| Importierter Lauf ist sichtbar, wird aber nicht übernommen | Worker-Typschlüssel, Task-Warteschlange, Namespace oder Kompatibilitätsmarker passen nicht zur importierten Zeile | Importbericht, Laufdetails und Worker-Registrierung vergleichen |

## Verwandte Leitfäden {#related-guides}

- [Server-Einrichtung](/docs/polyglot/server)
- [Worker-Protokoll](/docs/polyglot/worker-protocol)
- [Python SDK](/docs/polyglot/python)
- [Migration zu 2.0](/docs/migration)
