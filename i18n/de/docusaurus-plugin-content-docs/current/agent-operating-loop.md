---
sidebar_position: 9.1
title: Arbeitszyklus für Agenten
description: Ein stabiler v2-Ablauf für KI-Agenten zum Ermitteln, Ändern, Ausführen, Diagnostizieren und Reparieren von Durable-Workflow-Anwendungen.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - Durable Workflow Agentenzyklus
  - KI Workflow-Fehlersuche
  - MCP Workflows
  - Waterline Verlaufsexport
  - dw JSON-Ausgabe
---

# Arbeitszyklus für Agenten {#agent-operating-loop}

Agenten können Durable Workflow v2 am einfachsten nutzen, wenn jeder Schritt einen stabilen Zugriffspunkt hat. Der folgende Zyklus beginnt mit derselben Invariante, die auch ein Mensch lernt, und verwendet dann maschinenlesbare Verträge für Ermittlung, Ausführung, Diagnose und Reparatur.

## 1. Die richtige Dokumentationslinie verwenden {#1-use-the-right-docs-line}

Verwenden Sie für Arbeiten an der stabilen Version 2.0 das kanonische Bündel. Es folgt demselben unversionierten Standardpfad der Dokumentation, den Leser von der öffentlichen Website aus erreichen:

```text
https://durable-workflow.com/llms-full.txt
```

Verwenden Sie das versionsspezifische 2.0-Bündel, wenn die URL selbst die aktuelle Hauptversionslinie benennen muss:

```text
https://durable-workflow.com/llms-full-2.0.txt
```

Verwenden Sie die explizite 1.x-Festlegung, wenn die URL selbst die stabile Hauptversionslinie benennen muss:

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. Die lokale Workflow-Schnittstelle ermitteln {#2-discover-the-local-workflow-surface}

Beginnen Sie am MCP-Endpunkt der Beispielanwendung, sofern er verfügbar ist:

```text
/mcp/workflows
```

Unter [MCP-Workflow-Schnittstelle](./mcp-workflows.md) finden Sie den Referenzvertrag für Werkzeuge, sichere Workflow-Schlüssel für Funktionstests und die Struktur eines Agentenberichts.

Rufen Sie zuerst `list_workflows` auf. Die Antwort zeigt dem Agenten, welche Workflows freigegeben sind, welche Zugangsdaten sie benötigen, welche Argumente sie akzeptieren und welche jüngsten Ausführungen bereits vorhanden sind. Verwenden Sie `simple` oder `elapsed` für Funktionstests ohne Zugangsdaten, bevor Sie Beispiele mit externen API-Schlüsseln ansprechen.

Wenn MCP nicht verfügbar ist, verwenden Sie stattdessen die CLI- und Serververträge:

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

Diese Befehle liefern Protokollversionen, Namespace-Kontext, Workflow-Sichtbarkeit und den Zustand der Aufgabenwarteschlangen, ohne eine Benutzeroberfläche auslesen zu müssen.

## 3. Die kleinste Änderung vornehmen {#3-make-the-smallest-change}

Bewahren Sie beim Bearbeiten von Workflow-Code die Grenze der dauerhaften Ausführung:

- Halten Sie Orchestrierungsentscheidungen in Workflow-Methoden.
- Platzieren Sie I/O, Zufall, Netzwerkaufrufe und externe Zugangsdaten in Aktivitäten.
- Verwenden Sie Signale, Updates, Abfragen, Timer und Nachrichtenströme statt improvisierter Tabellen oder Warteschlangenjobs.
- Halten Sie wiederholte Eingaben von Menschen oder KI am Vertrag für [Nachrichtenströme](./features/message-streams.md).

Diese Grenze ist wichtiger als die Sprachschnittstelle. PHP-Workflow-Klassen, `dw`, das Python-SDK und externe Worker sollten dieselben Control-Plane-Operationen beschreiben.

Wenn keine Quellcodeänderung erforderlich ist, kann der Schritt „Ändern“ eine ausdrückliche Betriebsentscheidung sein: den freigegebenen Workflow-Schlüssel auswählen, einen stabilen `business_key` angeben, `duplicate_start_policy=return_existing_active` für idempotente Funktionstests wählen oder die dokumentierte Signal-/Update-Eingabe senden, die `diagnose_workflow` empfiehlt.

## 4. Über strukturierte Zugriffspunkte ausführen {#4-run-through-structured-handles}

Verwenden Sie den spezifischsten verfügbaren Zugriffspunkt für die Aufgabe:

| Aufgabe | Bevorzugter Zugriffspunkt |
| --- | --- |
| Einen lokalen Beispiel-Workflow starten | `start_workflow` über `/mcp/workflows` |
| Einen lokalen Beispiel-Workflow reparieren | `diagnose_workflow`, dann `repair_workflow` nur, wenn die Abhilfe dies erlaubt |
| Einen Server-Workflow starten oder steuern | `dw workflow:start`, `dw workflow:signal`, `dw workflow:update` oder entsprechende SDK-Aufrufe |
| Kompatibilität prüfen | `dw server:info --output=json` und `/api/cluster/info` |
| Warteschlangenzustand prüfen | `dw task-queue:describe <queue> --output=json` |
| Client- und Worker-Schnittstellen vergleichen | [Client- und Worker-Fähigkeiten](./polyglot/cli-python-parity.md) |
| Einen Nicht-PHP-Worker implementieren | [Worker-Protokoll](./polyglot/worker-protocol.md) |
| Einen externen Handler implementieren | [Schnittstelle für externe Ausführung](./polyglot/external-execution.md) |

Bevorzugen Sie JSON- oder JSONL-Ausgaben für Agentenzyklen. Terminaltabellen sind für Menschen gedacht.

## 5. Vor der Reparatur diagnostizieren {#5-diagnose-before-repairing}

Sammeln Sie Fakten, bevor Sie Code ändern oder Befehle erneut ausführen:

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

Rufen Sie für die MCP-Schnittstelle der Beispielanwendung Folgendes auf:

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Lesen Sie `root_cause.category`, `remediation.classification` und `remediation.automatic_repair.allowed`. Rufen Sie `repair_workflow` nur auf, wenn das letzte Feld wahr ist:

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Wenn Waterline verfügbar ist, exportieren Sie den Verlauf der ausgewählten Ausführung. Der Export umfasst typisierte Verlaufsereignisse, den Kontext der ausgewählten Ausführung, Wartezustände, Timer, Abstammung, Metadaten zur Projektionsquelle, Integritätsprüfungen und dauerhafte Fehler. Damit kann ein Agent einen Workflow-Fehler von einem nicht verfügbaren Worker, fehlenden Zugangsdaten, einem Ausfall der Aufgabenwarteschlange, einem inkompatiblen Client oder einer ausstehenden Operatoraktion unterscheiden.

## 6. Mit Verträgen berichten {#6-report-with-contracts}

Agentenberichte sollten stabile Fakten anführen:

- verwendete Dokumentationsversion und verwendetes LLM-Bündel
- Workflow-ID, Ausführungs-ID, Namespace und Aufgabenwarteschlange
- aufgerufenen Befehl oder aufgerufenes MCP-Werkzeug
- JSON-Status, Exit-Code oder benannten Fehlergrund
- `root_cause.category`, `remediation.classification` und ob eine Reparatur erlaubt oder abgelehnt wurde
- jüngste typisierte Verlaufsereignisse und letzten dauerhaften Fehler
- Kompatibilitäts- oder Protokollversion aus `server:info` oder `/api/cluster/info`

Diese Berichtsstruktur ist zwischen lokalen Beispielanwendungen, eigenständigen Serverbereitstellungen, Python-Workern und künftigen Client-SDKs übertragbar.

## 7. Nachweis mit veröffentlichten Artefakten {#7-published-proof}

Die Konformitäts-Testumgebung der Beispielanwendung weist den Agentenzyklus mit veröffentlichten Artefakten nach. Ihr MCP-Teil führt Folgendes aus:

1. Ermitteln: JSON-RPC `tools/list` und `list_workflows`
2. Ändern: den Workflow `simple` ohne Zugangsdaten mit einem expliziten `business_key` auswählen
3. Ausführen: `start_workflow`
4. Diagnostizieren: `diagnose_workflow` mit Ursachen- und Abhilfeobjekten
5. Reparieren: `repair_workflow` als sichere strukturierte Mutation oder Ablehnung
6. Verifizieren: `get_workflow_result`, `diagnose_workflow` und `get_workflow_history`

Der Nachweis erfasst Werkzeugstatuscodes, Workflow-ID, Abschlussstatus, Schema-ID der Ursache, Schema-ID der Abhilfe, Schema-ID der sicheren Mutation und begrenzte Verlaufsnachweise in den Konformitätsmetadaten.

## Verwandte Seiten {#related-pages}

- [KI-gestützte Entwicklung](./ai-assisted-development.md)
- [Vertrag für Agentenwerkzeuge](./agent-tooling-contract.md)
- [MCP-Workflow-Schnittstelle](./mcp-workflows.md)
- [Beispielanwendung](./sample-app.md)
- [CLI-Befehlsreferenz](./polyglot/cli-reference.md)
- [Worker-Protokoll](./polyglot/worker-protocol.md)
- [Schnittstelle für externe Ausführung](./polyglot/external-execution.md)
