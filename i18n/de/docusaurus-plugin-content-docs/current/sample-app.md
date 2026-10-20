---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - Beispielanwendung
  - Laravel-Verbraucher
  - KI-Workflow-Beispiel
  - Waterline-Dashboard
---

# Beispielanwendung {#sample-app}

https://github.com/durable-workflow/sample-app

Dies ist die eingebettete Laravel-Galerie: eine Laravel-13-Beispielanwendung auf Basis der stabilen Durable-Workflow-2.0-Versionslinie, mit Workflows, die Sie in einem GitHub Codespace ausführen können. Sie ist der passende Ausgangspunkt für **eingebettetes Laravel**, wenn Sie Laravel-Warteschlangenausführung und Waterline gemeinsam untersuchen möchten.

Wählen Sie die zu Ihrer Laufzeit passenden Beispiele:

| Bereitstellungsmodell | Beispielweg |
| --- | --- |
| Durable Workflow Cloud | Beginnen Sie mit [Verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane/) und wählen Sie dann den PHP-, Python- oder Rust-SDK-Leitfaden mit den bereitgestellten Namespace-Zugangsdaten. Cloud-Nutzer betreiben keinen Server. |
| Selbst gehosteter Dienstmodus | Verwenden Sie den [Durable-Workflow-2.0-Schnellstart](/docs/quickstart/) mit vollständigen PHP-, Python- und Rust-Beispielen aus veröffentlichten Artefakten gegen einen lokalen Server. |
| Eingebettetes Laravel | Fahren Sie mit dieser Galerie und der [eingebetteten Installation](/docs/installation/) fort. |

Die Galerie ist ein durchgängiger Nachweis für die in Laravel betriebene Engine und keine universelle Startanwendung für Dienstmodus oder mehrsprachige Bereitstellungen. Hier erhalten eingebettete Funktionen zuerst realistische Laravel-Testabdeckung. Diese Quelle spiegelt die Website, wenn sie ein Laravel-natives Muster zeigt. Der Leitfaden [Ein Beispiel beitragen](/docs/contribute-a-sample) beschreibt den Einreichungsablauf für eigene Durable-Workflow-Muster.

> Suchen Sie die Version für Laravel 12 / Durable Workflow 1.x? Sie bleibt im [Branch `Laravel-12`](https://github.com/durable-workflow/sample-app/tree/Laravel-12) erhalten. Ältere Blogbeiträge und Anleitungen mit v1-Mustern wie `Workflow\Workflow`, `yield activity(...)` oder `Workflow\Activity` beziehen sich auf diesen Branch.

## Beispielgalerie {#sample-gallery}

Jeder Galerieeintrag nennt das vermittelte Muster, die ausführende Workflow-Klasse, den zugehörigen Artisan-Befehl und die Waterline-Ansicht als Nachweis der gespeicherten Ausführung. Die Galerie spiegelt den „Sample Index“ der README im Sample-App-Repository. Wird ein Beispiel aufgenommen oder verschoben, ändern sich README und Galerie gemeinsam.

| Muster | Workflow-Klasse | Befehl | Waterline-Ansicht |
|---------|----------------|---------|------------------|
| Kleinster deterministischer v2-Workflow | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | Laufliste → Laufdetails mit zwei Aktivitätsereignissen und einem Ereignis `WorkflowCompleted` |
| Dauerhafte Messung verstrichener Zeit ohne Replay-Abweichung | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | Laufdetails mit zwei Ereignissen `SideEffectRecorded` für `sideEffect`-Uhrzeitabfragen vor und nach einem Ereignis `TimerFired` |
| Koordination über Laravel-Anwendungsgrenzen | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | Laufdetails mit Aktivitätsereignissen und Aufgabenwarteschlangenrouting zwischen Anwendungs- und Microservice-Workern |
| Browserautomatisierung mit aufgezeichneten Artefakten | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | Laufdetails mit Playwright-Aktivität, FFmpeg-Aktivität und Bereinigungsaktivität in dieser Reihenfolge |
| Durch Webhook gestarteter Workflow mit Warten auf ein Signal | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | Laufdetails mit `WorkflowStarted` vom Webhook-Eingang und einem Ereignis `SignalReceived` für `ready` |
| KI-Aktivitätsschleife mit dauerhafter Wiederholung/Validierung | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | Laufdetails mit wiederholten Aktivitätsversuchen und dem Ereignis `ActivityCompleted`, das den Validator erfüllt |
| Signalgesteuerter KI-Agent mit Saga-Kompensation | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | Laufdetails mit Nachrichtenstromreferenz, Update-Historie und nach einem Saga-Fehler aufgezeichneten Kompensationsaktivitäten |

Die Spalte zur Waterline-Ansicht nennt die Ereignisse einer gesunden Ausführung. Fehlt eines in Ihrer lokalen Ausführung, lässt sich damit ein Worker- oder Umgebungsproblem am schnellsten eingrenzen.

## Querverweise von Musterseiten {#pattern-page-cross-links}

Die Musterseiten dieser Website verlinken direkt den Beispiel-Workflow für den jeweiligen Bereich. Diese Tabelle führt von einer Musterseite zum passenden ausführbaren Workflow.

| Musterseite | Beispiel-Workflow |
|--------------|-----------------|
| [Sagas](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Signale](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Nachrichtenströme](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Untergeordnete Workflows](/docs/features/child-workflows) | Noch kein eigener Galerieeintrag. Verwenden Sie den Leitfaden zu untergeordneten Workflows. |
| [Seiteneffekte](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow` (`php artisan app:elapsed`) |
| [Webhooks](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [MCP-Workflows](/docs/mcp-workflows) | Jeder Galerieeintrag, bereitgestellt über `config/workflow_mcp.php` |

**Schritt 1**

Erstellen Sie einen Codespace aus dem Hauptbranch dieses Repositorys.

![Codespace erstellen](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**Schritt 2**

Warten Sie nach dem Erstellen, bis der Codespace aufgebaut ist. Das sollte zwischen 5 und 10 Minuten dauern.

**Schritt 3**

Danach sehen Sie den Editor und unten das Terminal.

![Editor und Terminal](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**Schritt 4**

Führen Sie composer install aus.

```bash
composer install
```

**Schritt 5**

Führen Sie den Initialisierungsbefehl aus, um die Anwendung einzurichten, zusätzliche Abhängigkeiten zu installieren und Migrationen auszuführen.

```bash
php artisan app:init
```

Der Pfad `php artisan migrate` der Beispielanwendung übernimmt die Migrationen der Workflow- und Waterline-Pakete direkt. Nach der normalen Installation sind daher alle Tabellen und gespeicherten Waterline-Ansichten bereit.

**Schritt 6**

Starten Sie den Warteschlangen-Worker. Damit werden Workflows und Aktivitäten verarbeitet.

```bash
php artisan queue:work
```

Wenn Sie die Reparaturschleife selbst nachweisen möchten, ohne auf einen weiteren `Looping`-Zyklus eines beschäftigten Warteschlangen-Workers zu warten, starten Sie in einem zweiten Terminal einen expliziten Wiederherstellungsdurchlauf:

```bash
php artisan workflow:v2:repair-pass
```

Dieser Befehl verwendet dieselbe Scan- und Backoff-Richtlinie wie die Worker-Schleife. Er hilft nach der Behebung eines lokalen Warteschlangen-/Backend-Problems, beim Prüfen eines Szenarios mit verlorener Aufgabe in der Beispielanwendung oder wenn ein wenig genutzter Codespace sonst lange auf einen weiteren Schleifendurchlauf warten würde. Ergänzen Sie `--run-id=...`, um den Durchlauf in einem Experiment auf eine oder mehrere ausgewählte Ausführungen zu begrenzen, oder `--instance-id=...`, wenn die gesamte Instanz einbezogen bleiben soll.

**Schritt 7**

Öffnen Sie ein neues Terminalfenster.

![Neues Terminalfenster](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**Schritt 8**

Starten Sie im neuen Terminalfenster den Beispiel-Workflow.

```bash
php artisan app:workflow
```

**Schritt 9**

Das Waterline-Dashboard erreichen Sie unter https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard.

![Waterline-Dashboard](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline zeigt den dauerhaften Zustand: ob ein Workflow gestartet ist, welche Ausführung aktuell ist, welche typisierten Historienereignisse gespeichert wurden, welche Wartezustände offen sind und welche Operatoraktionen verfügbar sind. Worker-Telemetrie ist separat: Polling-Latenz, Aufgabendauer, Exporterkonfiguration, eigene Anwendungsmetriken und Worker-Prozessfehler stammen aus PHP-Worker-Logs oder vom SDK-Metrikendpunkt eines externen Workers.

| Schnittstelle | Beantwortet | Beispielprüfung |
| --- | --- | --- |
| Waterline und Historienexport | Dauerhafter Workflow-Status, Historie, Wiederholungen, Wartezustände, Signale, Updates, Fehler und Operatoraktionen | `/waterline/dashboard` öffnen, dann die Historie des ausgewählten Laufes exportieren |
| Worker-Logs | Prozessfehler des PHP-Warteschlangen-Workers und Anwendungslogzeilen | `storage/logs/laravel.log` verfolgen, während `php artisan queue:work` läuft |
| SDK-Metriken | Anfragezahlen externer Worker/Clients, Polling-Latenz und Aufgabendauer | Den Prometheus-/OpenMetrics-Endpunkt des SDK-Workers abfragen |

Installieren Sie für einen Python-Worker das Prometheus-Extra und stellen Sie die Worker-Metriken aus diesem Worker-Prozess bereit:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

Ersetzen Sie `GreeterWorkflow` und `greet` durch die von diesem Worker registrierten Workflow- und Aktivitätshandler.

Fragen Sie `:9102/metrics` nach den Reihen `durable_workflow_worker_*` und `durable_workflow_client_*` ab. Diese Metriken erklären die Laufzeitleistung des Workers. Waterline bleibt die maßgebliche Quelle für die gespeicherte Workflow-Historie.

Die Waterline-Detailansicht enthält eine Aktion „Historie exportieren“ für die ausgewählte Ausführung. Zeigt die Detailansicht den aktuellen Lauf der Instanz, verwendet die Schaltfläche die instanzbezogene Exportroute der aktuellen Ausführung. Historische Laufdetails verwenden weiterhin den expliziten Pfad `/runs/{runId}/history-export`. Sie können dasselbe Replay-/Debug-Bündel auch aus dem Terminal der Beispielanwendung exportieren:

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

Der Export enthält eine SHA-256-Integritätsprüfsumme. Setzen Sie `DW_V2_HISTORY_EXPORT_SIGNING_KEY` und `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` in der Anwendungsumgebung, wenn ein anderes System das exportierte Bündel mit einer HMAC-Signatur prüfen muss.

Der exportierte Block `selected_run` enthält `waits_projection_source`, `timeline_projection_source`, `timers_projection_source` und `lineage_projection_source`. Der Block `links` enthält außerdem `projection_source`. Die Abschnitte `links.parents` / `links.children` stammen vorrangig aus dem typisierten Abstammungsverlauf des ausgewählten Laufes. Beziehungen zu untergeordneten Workflows und Continue-As-New bleiben damit sichtbar, auch wenn veränderliche Verknüpfungszeilen während eines lokalen Experiments abgewichen sind. Existiert eine Abstammungszeile nur noch durch ältere veränderliche Kompatibilitätsdaten, kennzeichnet das Bündel den Eintrag nun mit `history_authority = mutable_open_fallback` und `diagnostic_only = true`, statt beim Export stillschweigend zusätzliche Verknüpfungsmetadaten wiederherzustellen.

## KI-Workflow-Nachrichtenströme {#ai-workflow-message-streams}

Workflows mit wiederholten KI- oder Benutzereingaben sollten die vorrangige v2-Nachrichtenstromfassade als Programmiermuster verwenden:

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

Behalten Sie anwendungseigenen Nutzdatenspeicher für große Anfrage-/Antwortinhalte bei und übergeben Sie die gespeicherte Referenz über den Stream. Neue Beispiel-Workflows sollten nicht direkt in `workflow_messages` oder `MessageStreamCursor` schreiben oder `MessageService` aufrufen. Siehe [Nachrichtenströme](/docs/features/message-streams) für den stabilen v2-Inbox-/Outbox-Vertrag.

**Schritt 10**

Führen Sie die Workflow- und Aktivitätstests aus.

```bash
vendor/bin/phpunit
```

Nun können Sie Workflows erstellen und testen.

## MCP-Server für KI-Clients {#ai-client-mcp-server}

Die Beispielanwendung stellt unter `/mcp/workflows` außerdem einen Laravel-MCP-Server bereit. Dies ist die Referenzschnittstelle für KI-Clients in Durable Workflow v2: Agenten erhalten strukturierte Workflow-Ermittlung, Start, Status, Ausgabe, jüngste typisierte Historie und Fehlerfakten, ohne Waterline auslesen zu müssen.

Den ausführlichen Endpunkt- und Werkzeugvertrag finden Sie unter [MCP-Workflow-Schnittstelle](/docs/mcp-workflows). Der umfassendere Vertrag für KI-gestützte Entwicklung mit v2-LLM-Manifesten, CLI-Exit-Codes, Waterline-Exporten und SDK-Referenzen steht unter [KI-gestützte Entwicklung](/docs/ai-assisted-development).

Der MCP-Server wird durch das Laravel-MCP-Paket in `routes/ai.php` registriert. Die freigegebenen Workflow-Schlüssel stehen in `config/workflow_mcp.php`. Jeder Eintrag kann neben der Workflow-Klasse Ermittlungsmetadaten wie Beschreibung, Anforderungen an Zugangsdaten und erwartete Argumente enthalten.

Standardwerkzeuge:

| Werkzeug | Zweck |
| --- | --- |
| `list_workflows` | Listet konfigurierte Workflow-Schlüssel, Anforderungen an Zugangsdaten, v2-Statuswerte und optional jüngste Läufe auf. |
| `start_workflow` | Startet einen konfigurierten v2-Workflow und liefert `workflow_id`, `run_id`, Status, Geschäftsschlüssel und Befehlsergebnis. |
| `get_workflow_result` | Fragt die aktuelle oder ausgewählte Ausführung ab und liefert Status, Ausgabe, Sichtbarkeitsmetadaten und letzte Fehlerzusammenfassung. |
| `get_workflow_history` | Liefert einen begrenzten Ausschnitt der jüngsten typisierten v2-Historienereignisse und letzten dauerhaften Fehler zur Fehlersuche. |
| `diagnose_workflow` | Klassifiziert eine ausgewählte Ausführung mit strukturierten Fakten, Ursache, Abhilfe und nächsten Aktionen. |
| `repair_workflow` | Fordert den integrierten v2-Reparaturbefehl an und liefert ein strukturiertes Mutationsergebnis für Annahme, Ablehnung oder fehlenden Bedarf. |

Ein typischer Agentenzyklus ist:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Verwenden Sie `simple` oder `elapsed` für Funktionstests ohne Zugangsdaten. Der Workflow `prism` wird bewusst als KI-Beispiel bereitgestellt, benötigt aber `OPENAI_API_KEY`, bevor ein Worker ihn abschließen kann.
