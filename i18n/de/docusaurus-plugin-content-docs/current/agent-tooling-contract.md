---
sidebar_position: 9.3
title: Vertrag für Agentenwerkzeuge
description: MCP-Werkzeuge, CLI-JSON, Serverdiagnosen, Waterline-Exporte und SDK-Fixtures bilden einen gemeinsamen, maschinell bedienbaren Vertrag für Durable Workflow v2.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - Durable Workflow Agentenwerkzeuge
  - KI-Werkzeugvertrag
  - MCP Workflow-Diagnose
  - maschinenlesbare Workflow-Operationen
---

# Vertrag für Agentenwerkzeuge {#agent-tooling-contract}

Durable Workflow v2 macht die KI-gestützte Entwicklung überschaubar, indem es Produktinformationen über stabile Verträge bereitstellt. Ein Werkzeug sollte den Workflow-Zustand weder aus HTML ableiten noch Logs als maßgebliche Quelle auswerten oder erraten, welches SDK-Verhalten einem CLI-Befehl entspricht. Es sollte die Dokumentationsversion lesen, die lokale Schnittstelle ermitteln, dokumentierte Operationen aufrufen und benannte Fakten melden.

Diese Seite definiert die Vertragsstruktur, die künftige MCP-Werkzeuge, lokale Agenten, Skripte und SDKs beibehalten sollten.

## Vertragsebenen {#contract-layers}

| Ebene | Stabiler Zugriffspunkt | Erwartung an den Vertrag |
| --- | --- | --- |
| Dokumentationsabruf | Die kanonischen Dateien `llms.txt` und `llms-full.txt` folgen der stabilen 2.0-Dokumentation. `llms-2.0.txt` und `llms-full-2.0.txt` sind fest benannte Aliasse für dieselbe Versionslinie. | Verwenden Sie kanonische URLs für Produktarbeit an 2.0. Verwenden Sie `-1.x.txt`, wenn eine URL die archivierte 1.x-Linie benennen muss, oder `-2.0.txt`, wenn ein Verbraucher eine explizite URL mit Hauptversion benötigt. |
| Lokale Ermittlung | `/mcp/workflows` `list_workflows` | Die von der Anwendung verwaltete MCP-Zulassungsliste nennt freigegebene Workflow-Schlüssel, erforderliche Zugangsdaten, erwartete Argumente und die Eignung für Funktionstests. |
| Workflow-Operationen | MCP `start_workflow`, `get_workflow_result`, `get_workflow_history`, `diagnose_workflow`, `repair_workflow`; `dw`-JSON-Befehle; SDK-Clients | Jeder Client meldet Workflow-ID, Ausführungs-ID, Namespace, Aufgabenwarteschlange, Befehlsstatus, Ursachenklassifizierung, Abhilfe und benannte Fehlerfelder, ohne eine Benutzeroberfläche auszulesen. |
| Serverdiagnose | `/api/cluster/info`, `dw server:info --output=json`, `dw doctor --output=json`, `dw debug workflow --output=json` | Informationen zu Kompatibilität, Protokoll, Aufgabenwarteschlangen, Workern und feststeckenden Ausführungen sind maschinenlesbar und in ihrem Umfang begrenzt. |
| Dauerhafte Nachweise | Details zur ausgewählten Ausführung und Verlaufsexport in Waterline | Replay, Wartezustände, Timer, Abstammung, Projektionsquelle, Integritätsprüfungen, dauerhafte Fehler und mögliche Operatoraktionen stammen aus typisiertem Zustand. |
| Sprachübergreifende Gleichwertigkeit | CLI-/Python-Anfrage-Fixtures und SDK-Tests | Gemeinsame Control-Plane-Operationen halten ihre Anfragestruktur über Sprachgrenzen hinweg einheitlich. |

Jede Ebene sollte für sich nutzbar sein. Gemeinsam geben sie einem Agenten genügend Kontext, um eine kleine Änderung vorzunehmen, sie nachzuweisen und das Ergebnis zu erklären.

## Gestaltung von MCP-Werkzeugen {#mcp-tool-design}

Neue MCP-Werkzeuge sollten die Konzepte von Durable Workflow direkt abbilden:

- Verwenden Sie Produktbegriffe wie Workflow, Ausführung, Aufgabenwarteschlange, Zeitplan, Verlauf, Fehler, Worker, Namespace und Kompatibilität.
- Geben Sie stabile Kennungen und benannte Statusfelder statt ausschließlich beschreibender Zusammenfassungen zurück.
- Geben Sie bei Diagnosewerkzeugen die Objekte `root_cause`, `remediation` und `next_actions` zurück, damit Agenten den nächsten Befehl auswählen können, ohne natürliche Sprache auszuwerten.
- Begrenzen Sie Arrays und Vorschauen für Verlauf, Fehler und Nutzdaten, damit ein Client sie ohne den Download einer unbegrenzten Ablaufaufzeichnung prüfen kann.
- Trennen Sie Ermittlung und Mutation. Ein Client sollte abfragen können, was vorhanden ist und welche Zugangsdaten nötig sind, bevor er einen Workflow startet oder steuert.
- Halten Sie Mutationen explizit und strukturiert. Für lokale Beispiel-Workflows ist `repair_workflow` die vorgesehene Reparaturmutation. Sie gibt auch bei abgelehnter oder unnötiger Reparatur eine `durable-workflow.v2.safe-mutation`-Hülle zurück.
- Kennzeichnen Sie Funktionstest-Workflows ohne Zugangsdaten ausdrücklich, damit Agenten die lokale Anbindung testen können, ohne externe Dienste anzusprechen.
- Nehmen Sie niemals geheime Werte, kundenspezifische Hostnamen oder kontospezifische Zugangsdaten in Werkzeugbeschreibungen oder Ergebnismetadaten auf.

Der Endpunkt `/mcp/workflows` der Beispielanwendung dient als Referenz für die lokale Workflow-Schnittstelle. Künftige projektspezifische MCP-Server sollten denselben Ansatz beibehalten: Die Konfiguration verwaltet die Zulassungsliste, Werkzeuge arbeiten nur mit den aufgeführten Workflows, und Ergebnisse verweisen auf dauerhafte Workflow-Fakten, die ein Mensch über `dw`, Waterline oder ein SDK nachvollziehen kann.

## Gleichwertigkeit von Befehlen und SDKs {#command-and-sdk-parity}

Automatisierung sollte ohne Bedeutungsverschiebung zwischen Clients wechseln können:

| Operationsfamilie | Erforderlicher Nachweis der Gleichwertigkeit |
| --- | --- |
| start, signal, update, query, repair, cancel, terminate, archive | Die Anfrageinhalte von CLI und SDK stimmen mit der dokumentierten Control-Plane-Struktur überein. |
| history, describe, list, result | Antworten erhalten stabile Kennungen, Statusnamen, Zeitstempel und Fehlerfelder. |
| Aufgabenwarteschlangen und Worker | Kapazität, Leases, Slots, Kompatibilität und Worker-IDs bleiben strukturierte Fakten. |
| Externe Ausführung | Eingabe- und Ergebnishüllen bleiben sprachneutral und enthalten benannte Bridge-Ergebnisse. |

Wenn Sie einen CLI-Befehl, eine SDK-Methode oder ein MCP-Werkzeug für eine Control-Plane-Aktion ergänzen, bevorzugen Sie ein gemeinsames Fixture oder ein dokumentiertes JSON-Beispiel, gegen das ein anderer Client prüfen kann. Menschenfreundliche Tabellen können zusätzlich vorhanden sein. Der Automatisierungsvertrag besteht jedoch aus JSON oder JSONL.

## Struktur eines Diagnoseberichts {#diagnosis-report-shape}

Wenn ein Werkzeug eine fehlgeschlagene oder feststeckende Ausführung erklärt, sollte der Bericht Folgendes enthalten:

- verwendete Dokumentationsversion und Quellseite
- aufgerufenen Befehl, aufgerufene SDK-Methode oder aufgerufenes MCP-Werkzeug
- Workflow-ID, Ausführungs-ID, Namespace und Aufgabenwarteschlange
- aktuellen Status und Zusammenfassung des letzten dauerhaften Fehlers
- Namen der jüngsten typisierten Verlaufsereignisse
- ausstehende Wartezustände, Timer, Aufgaben oder Leases externer Aktivitäten
- Informationen zur Worker- und Aufgabenwarteschlangenkompatibilität, soweit verfügbar
- benannten Exit-Code, HTTP-Status, Validierungsfehler oder Blockierungsgrund
- maschinenlesbare Felder `root_cause.category` und `remediation.classification`
- ob eine sichere Reparaturmutation erlaubt, angewendet, abgelehnt oder nicht benötigt wurde

Diese Struktur macht Berichte zwischen lokalen Laravel-Anwendungen, eigenständigen Serverbereitstellungen, Python-Workern und künftigen SDKs übertragbar.

## Ursache und Abhilfe {#root-cause-and-remediation}

Die unterstützte Schema-ID für Ursachen ist `durable-workflow.v2.agent-root-cause`. Diagnosewerkzeuge sollten Folgendes enthalten:

- `category`, etwa `activity_failure`, `workflow_failure`, `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`, `in_progress` oder `none`
- `source.kind` und `source.id`
- `retryable`, `severity` und `actionable`

Die unterstützte Schema-ID für Abhilfe ist `durable-workflow.v2.agent-remediation`. Sie umfasst `classification`, `summary`, `automatic_repair.tool`, `automatic_repair.allowed` und `next_actions`. `repair_workflow` ist die unterstützte lokale MCP-Reparaturschnittstelle. Wenn MCP nicht verfügbar ist, treten der dokumentierte `dw`-CLI-JSON-Vertrag und die HTTP-Control-Plane-Routen des Servers an seine Stelle:

```bash
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
dw workflow:repair <workflow-id> --output=json
dw system:repair-status --output=json
dw system:repair-pass --output=json
```

Diese Befehle bilden den unterstützten Vertrag ohne MCP für Inspektion, sichere Mutationen, Diagnose und Reparaturautomatisierung.

## Leitplanken für Agenten {#guardrails-for-agents}

Erlauben Sie Agenten, Routineabläufe zu automatisieren, ohne das dauerhafte Modell zu umgehen:

- Halten Sie die Workflow-Orchestrierung deterministisch.
- Platzieren Sie I/O, Zufall, externe API-Aufrufe und Zugangsdaten in Aktivitäten oder externen Handlern.
- Verwenden Sie Signale, Updates, Abfragen, Zeitpläne, Timer und Nachrichtenströme statt improvisierter Zustandstabellen zur Workflow-Steuerung.
- Behandeln Sie den Waterline-Verlaufsexport als Nachweis und nicht als Mutations-API.
- Behandeln Sie Routenlisten, Datenbankinterna und frameworkspezifische Modellzeilen als Implementierungsdetails, sofern die öffentliche Dokumentation sie nicht ausdrücklich benennt.

Die Invariante bleibt verständlich: Workflows zeichnen dauerhafte Entscheidungen auf, Aktivitäten führen fehlbare Arbeit aus, und ein Replay muss erklären können, was geschehen ist. Der Werkzeugvertrag gibt Agenten stabile Zugriffspunkte für den Rest.

## Verwandte Seiten {#related-pages}

- [KI-gestützte Entwicklung](./ai-assisted-development.md)
- [Arbeitszyklus für Agenten](./agent-operating-loop.md)
- [MCP-Workflow-Schnittstelle](./mcp-workflows.md)
- [Client- und Worker-Fähigkeiten](./polyglot/cli-python-parity.md)
- [HTTP-API-Referenz des Servers](./polyglot/server-api-reference.md)
- [Überwachung](./monitoring.md)
