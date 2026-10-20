---
sidebar_position: 9.2
title: MCP-Workflow-Schnittstelle
description: Der MCP-Server der Beispielanwendung als Referenz für KI-Clients zum Ermitteln, Starten, Diagnostizieren, Reparieren sowie Abrufen von Ergebnissen und Verlauf.
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - Durable Workflow MCP
  - MCP Workflow-Werkzeuge
  - Beispielanwendung MCP-Server
  - KI-Client Workflow-Ermittlung
---

# MCP-Workflow-Schnittstelle {#mcp-workflow-surface}

Die Beispielanwendung stellt den Referenz-MCP-Server von Durable Workflow v2 hier bereit:

```text
/mcp/workflows
```

Verwenden Sie ihn, wenn ein KI-Client eine lokale Workflow-Anwendung prüfen oder bedienen muss, ohne Waterline auszulesen oder Laravel-Interna zu erraten. Der Endpunkt ist eine strukturierte Entwicklungsschnittstelle: Er benennt die von der Anwendung freigegebenen Workflows, beschreibt Anforderungen an Zugangsdaten, startet Ausführungen, fragt Ergebnisse ab und liefert begrenzte Verlaufsinformationen.

## Serververtrag {#server-contract}

Die Beispielanwendung registriert den Server in `routes/ai.php` und konfiguriert freigegebene Workflow-Schlüssel in `config/workflow_mcp.php`. Behandeln Sie diese Konfiguration als öffentliche Zulassungsliste für KI-Clients. Ein Workflow ist nur dann über MCP bedienbar, wenn er dort mit genügend Metadaten aufgeführt ist, damit ein Client seine sichere Ausführbarkeit beurteilen kann.

Jeder konfigurierte Workflow sollte Folgendes beschreiben:

- einen stabilen Workflow-Schlüssel
- die Workflow-Klasse hinter diesem Schlüssel
- erforderliche und optionale Argumente
- Anforderungen an Zugangsdaten
- ob er für lokale Funktionstests ohne Zugangsdaten sicher ist
- Erwartungen an Ausgabe und Verlauf, die ein Agent anführen kann

Halten Sie Geheimnisse aus Werkzeugbeschreibungen heraus. Geben Sie an, dass ein Workflow Zugangsdaten benötigt, ohne den geheimen Wert oder kontospezifische Details aufzunehmen.

## Werkzeuge {#tools}

Der Referenzserver stellt sechs Workflow-Werkzeuge bereit:

| Werkzeug | Verwendung |
| --- | --- |
| `list_workflows` | Konfigurierte Workflow-Schlüssel, Beschreibungen, Anforderungen an Zugangsdaten, v2-Statuswerte und jüngste Ausführungen ermitteln. |
| `start_workflow` | Einen konfigurierten Workflow starten und `workflow_id`, `run_id`, Status, Geschäftsschlüssel und Befehlsergebnis zurückgeben. |
| `get_workflow_result` | Die aktuelle oder ausgewählte Ausführung nach Status, Ausgabe, Sichtbarkeitsmetadaten und letzter Fehlerzusammenfassung abfragen. |
| `get_workflow_history` | Einen begrenzten Ausschnitt der jüngsten typisierten v2-Verlaufsereignisse und dauerhaften Fehler abrufen. |
| `diagnose_workflow` | Eine ausgewählte Ausführung mit strukturierten Fakten, Ursache, Abhilfe und nächsten Aktionen klassifizieren. |
| `repair_workflow` | Den integrierten v2-Reparaturbefehl anfordern und ein strukturiertes Mutationsergebnis für Annahme, Ablehnung oder fehlenden Bedarf zurückgeben. |

Rufen Sie vor jedem Start `list_workflows` auf. Dies ist die Kompatibilitätsprüfung des Agenten: Die Antwort zeigt dem Client, welche Workflow-Schlüssel vorhanden sind und ob ein Workflow in der aktuellen Umgebung laufen kann.

Ermittlungshüllen verwenden die normative Schema-ID `durable-workflow.v2.mcp-discovery`. Agenten können damit vor einem Werkzeugaufruf die veröffentlichte Struktur der Werkzeugliste, Parameterschemas, Ermittlungshinweise und die Semantik von `payload_preview_limit_bytes` erkennen.

## Eingabevertrag der Werkzeuge {#tool-input-contract}

Die MCP-Werkzeugschemas verwenden bewusst Begriffe von Durable Workflow. Halten Sie diese Felder bei Erweiterungen des Servers der Beispielanwendung stabil:

| Werkzeug | Stabile Eingaben |
| --- | --- |
| `list_workflows` | `show_recent`, `limit` und optional `status` zum Ermitteln jüngster Ausführungen. |
| `start_workflow` | `workflow`, geordnete `arguments`, optional `instance_id`, `business_key`, `visibility_labels`, `memo`, `search_attributes` und `duplicate_start_policy`. |
| `get_workflow_result` | `workflow_id`, optional `run_id`, `include_recent_history` und `history_limit`. |
| `get_workflow_history` | `workflow_id` oder `run_id`, `limit` und `include_payloads`. |
| `diagnose_workflow` | `workflow_id` oder `run_id` sowie optional `history_limit`. |
| `repair_workflow` | `workflow_id` oder `run_id`. |

Bevorzugen Sie bei neuen Agenten `arguments` gegenüber der älteren Eingabe `args`. `arguments` entspricht direkt der Argumentreihenfolge von `handle()` des Workflows. `args` existiert nur für ältere Aufrufer mit Objektstruktur.

Verwenden Sie ein vom Aufrufer vorgegebenes `instance_id` nur, wenn ein Agent Idempotenz benötigt. Kombinieren Sie es mit `duplicate_start_policy=return_existing_active`, wenn ein wiederholter Funktionstest an den aktiven Workflow anknüpfen soll, statt als Duplikat fehlzuschlagen.

## Ergebnisvertrag der Werkzeuge {#tool-result-contract}

Werkzeugergebnishüllen verwenden die normative Schema-ID `durable-workflow.v2.mcp-tool-results`. Agenten können damit Ergebnisstatus, gekürzte Nutzdatenvorschauen, Fehlerfelder, Ursachen- und Abhilfeobjekte, Hüllen für sichere Mutationen sowie Schema-/Versionsmarker auswerten.

Agenten sollten die folgenden Ergebnisfelder als dauerhafte Bezugspunkte für die werkzeugübergreifende Zuordnung behandeln:

| Werkzeug | Stabile Ergebnisfelder |
| --- | --- |
| `list_workflows` | `available_workflows`, `allow_fqcn`, `workflow_id_kind`, `run_id_kind`, `status_values` und optional `recent_workflows`. |
| `start_workflow` | `workflow_id`, `run_id`, `workflow`, `workflow_class`, `workflow_type`, `status`, `running`, `business_key`, `duplicate_start_policy` und `command`. |
| `get_workflow_result` | `found`, `workflow_id`, `run_id`, `current_run_id`, `current_run_is_selected`, `status`, `running`, `output`, `error`, Sichtbarkeitsmetadaten und Zeitstempel. |
| `get_workflow_history` | `found`, `workflow_id`, `run_id`, `current_run_id`, `status`, `history_event_count`, `returned_event_count`, `events_are_most_recent`, `payloads_included`, `events` und `failures`. |
| `diagnose_workflow` | `found`, `workflow_id`, `run_id`, `diagnosis`, `facts`, `latest_failure`, `recent_history`, `root_cause`, `remediation` und `next_actions`. |
| `repair_workflow` | `found`, `workflow_id`, `run_id`, `accepted`, `status`, `mutation`, `command`, `remediation` und `next_actions`. |

Nutzdatenvorschauen im Verlauf sind bewusst begrenzt. Wenn `include_payloads` wahr ist, enthält jede Ereignisvorschau `payload_preview_limit_bytes`, `size_bytes`, `preview_bytes` und `truncated`. So kann ein Agent angeben, ob er die vollständigen Nutzdaten oder nur eine Vorschau gesehen hat.

## Klassifizierung von Fehlern und Abhilfe {#failure-and-remediation-taxonomy}

`diagnose_workflow` ist die maschinenlesbare Schnittstelle für Ursachen. Ihr Objekt `root_cause` verwendet die Schema-ID `durable-workflow.v2.agent-root-cause` und umfasst:

- `category`, etwa `activity_failure`, `workflow_failure`, `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`, `in_progress` oder `none`
- `source.kind` und `source.id` für die Workflow-, Aktivitäts-, Warte-, Aufgabenwarteschlangen- oder Verlaufsfamilie, die zur Klassifizierung geführt hat
- `retryable`, `severity` und `actionable`
- Fehlerdetails wie `failure_category`, `exception_class` und `handled`, wenn ein dauerhafter Fehlereintrag vorhanden ist

Das zugehörige Objekt `remediation` verwendet die Schema-ID `durable-workflow.v2.agent-remediation`. Es umfasst `classification`, eine kurze `summary`, `automatic_repair.tool` und `automatic_repair.allowed` sowie `next_actions`-Einträge für unterstützte Folgebefehle. Agenten sollten `repair_workflow` nur aufrufen, wenn `automatic_repair.allowed` wahr ist. Andere Klassifizierungen weisen den Agenten an, zu warten, erwartete Eingaben über die dokumentierte Workflow-Befehlsschnittstelle zu senden, den Verlauf zu prüfen, Workflow- oder Aktivitätscode zu ändern oder Continue-As-New zu planen.

`repair_workflow` gibt eine `durable-workflow.v2.safe-mutation`-Hülle zurück. Das Feld `mutation.applied` gibt an, ob ein Reparaturbefehl angenommen wurde. `command.outcome` unterscheidet `repair_dispatched`, `repair_not_needed` und strukturierte Ablehnungen, etwa bei einer terminalen oder nicht aktuellen Ausführung.

## Sicherer Agentenzyklus {#safe-agent-loop}

Beginnen Sie mit Workflows ohne Zugangsdaten:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Die Workflow-Schlüssel `simple` und `elapsed` sind die bevorzugten Funktionstestschnittstellen. Verwenden Sie Beispiele mit Zugangsdaten erst, wenn `list_workflows` die Anforderung meldet und die lokale Umgebung die nötigen Schlüssel enthält.

## Berichtsstruktur {#report-shape}

Ein KI-Client sollte MCP-Ergebnisse mit stabilen Fakten berichten:

- verwendete Dokumentationsversion, normalerweise `2.0`
- MCP-Endpunkt und Werkzeugname
- Workflow-Schlüssel, `workflow_id` und `run_id`
- Status und letzte Fehlerzusammenfassung
- `root_cause.category` und `remediation.classification`
- ob `remediation.automatic_repair.allowed` vor dem Versuch einer Reparaturmutation wahr war
- begrenzte Angaben zu Verlaufsereignisnamen und Zeitstempeln
- ob die Ausführung einen Funktionstest-Workflow ohne Zugangsdaten oder ein Beispiel mit Zugangsdaten verwendet hat

Diese Fakten stimmen mit den Schnittstellen von CLI, Python-SDK und Waterline-Verlaufsexport überein. Ein Mensch kann dadurch dieselbe Ausführung mit einem anderen Client nachvollziehen.

## Verwandte Seiten {#related-pages}

- [KI-gestützte Entwicklung](./ai-assisted-development.md)
- [Arbeitszyklus für Agenten](./agent-operating-loop.md)
- [Vertrag für Agentenwerkzeuge](./agent-tooling-contract.md)
- [Beispielanwendung](./sample-app.md)
- [Client- und Worker-Fähigkeiten](./polyglot/cli-python-parity.md)
- [Nachrichtenströme](./features/message-streams.md)
