---
sidebar_position: 9
title: KI-gestützte Entwicklung
description: Die v2-Dokumentation, MCP-Schnittstelle, CLI-Ausgabe und Verlaufsexporte von Durable Workflow als stabile Zugriffspunkte für Programmieragenten nutzen.
tags:
  - ai
  - agents
  - llms
keywords:
  - Durable Workflow KI-Dokumentation
  - llms.txt
  - KI-Programmierassistenten
---

# KI-gestützte Entwicklung {#ai-assisted-development}

Durable Workflow v2 ist so gestaltet, dass Menschen das dauerhafte Ausführungsmodell lernen und Werkzeuge die wiederholte Inspektion und Bedienung übernehmen können. Die entscheidende Produktschnittstelle besteht aus stabilen Zugriffspunkten, die ein Agent ohne Raten lesen, aufrufen und anführen kann.

## Abrufschnittstellen {#retrieval-surfaces}

Verwenden Sie diese LLM-Artefakte, um einen KI-Assistenten auf die maschinenlesbare Dokumentation von Durable Workflow zu stützen:

| Schnittstelle | URL | Verwendung |
| --- | --- | --- |
| Kanonisches Manifest | `https://durable-workflow.com/llms.txt` | Index der stabilen 2.0-Dokumentation. Folgt dem unversionierten Standardpfad der Dokumentation. |
| Kanonisches vollständiges Bündel | `https://durable-workflow.com/llms-full.txt` | Dokumentationsbündel in einer Datei, passend zum kanonischen Manifest. |
| v1-Manifest | `https://durable-workflow.com/llms-1.x.txt` | Versionsgebundenes 1.x-Archiv. |
| Vollständiges v1-Bündel | `https://durable-workflow.com/llms-full-1.x.txt` | Versionsgebundenes stabiles 1.x-Bündel. |
| v2-Manifest | `https://durable-workflow.com/llms-2.0.txt` | Versionsgebundener 2.0-Index, gleichwertig mit dem kanonischen Manifest. |
| Vollständiges v2-Bündel | `https://durable-workflow.com/llms-full-2.0.txt` | Versionsgebundenes 2.0-Bündel. |

Standardprompts für Agenten sollten für Arbeiten an der stabilen Version 2.0 `/llms.txt` oder `/llms-full.txt` abrufen. Legen Sie bei der Wartung einer 1.x-Anwendung die URLs mit `-1.x.txt` fest.

## Lokale MCP-Schnittstelle {#local-mcp-surface}

Die [Beispielanwendung](/docs/sample-app) stellt unter `/mcp/workflows` einen Laravel-MCP-Server bereit. Er ist die Referenzintegration für KI-Clients bei der lokalen v2-Workflow-Entwicklung. Die eigene Seite [MCP-Workflow-Schnittstelle](/docs/mcp-workflows) definiert Endpunkt, Werkzeuge, sichere Funktionstest-Workflows und Berichtsstruktur.

Der MCP-Server bietet einem Agenten strukturierte Workflow-Operationen:

| Werkzeug | Stabiler Zugriffspunkt |
| --- | --- |
| `list_workflows` | Konfigurierte Workflow-Schlüssel, Anforderungen an Zugangsdaten, Statuswerte und jüngste Ausführungen ermitteln. |
| `start_workflow` | Einen konfigurierten v2-Workflow starten und `workflow_id`, `run_id`, Status, Geschäftsschlüssel und Befehlsergebnis erhalten. |
| `get_workflow_result` | Die aktuelle oder ausgewählte Ausführung nach Status, Ausgabe, Sichtbarkeitsmetadaten und letzter Fehlerzusammenfassung abfragen. |
| `get_workflow_history` | Einen begrenzten Ausschnitt der jüngsten typisierten v2-Verlaufsereignisse und dauerhaften Fehler abrufen. |

Verwenden Sie `simple` oder `elapsed` als Funktionstests ohne Zugangsdaten. Verwenden Sie Workflows mit externen Zugangsdaten erst, wenn die lokale Umgebung die erforderlichen Schlüssel enthält.

Wenn ein Agent wiederholte KI- oder Benutzereingaben verarbeitet, verweisen Sie ihn auf den v2-Vertrag für [Nachrichtenströme](/docs/features/message-streams). Das stabile Programmiermuster ist `Workflow::inbox()` / `Workflow::outbox()` / `MessageStream`. Direkte Schreibzugriffe auf `MessageService`, `WorkflowMessage` oder Cursorzeilen sind Laufzeitinterna und keine Muster für Beispielcode.

## Befehls- und Diagnoseverträge {#command-and-diagnostic-contracts}

Agenten sollten maschinenlesbare Schnittstellen bevorzugen:

- Der [Arbeitszyklus für Agenten](/docs/agent-operating-loop) verbindet v2-Dokumentation, MCP-Endpunkt, `dw`-JSON-Ausgabe, Waterline-Verlaufsexport und SDK-Referenzen zu einem wiederholbaren Ablauf aus Ermitteln, Ändern, Ausführen und Diagnostizieren.
- Der [Vertrag für Agentenwerkzeuge](/docs/agent-tooling-contract) definiert, wie MCP-Werkzeuge, CLI-JSON, Serverdiagnosen, Waterline-Exporte und SDK-Fixtures eine gemeinsame maschinell bedienbare Schnittstelle bilden.
- `dw`-Befehle liefern stabile Exit-Codes für Automatisierung. Siehe [CLI-Referenz](/docs/polyglot/cli#exit-codes).
- [Client- und Worker-Fähigkeiten](/docs/polyglot/cli-python-parity/) vergleicht Lebenszyklus, Nachrichten, Zeitpläne, Sichtbarkeit und Worker-Ausführung zwischen `dw` und allen drei offiziellen SDKs, einschließlich gemeinsamer Anfragenachweise, soweit vorhanden.
- Die [Schnittstelle für externe Ausführung](/docs/polyglot/external-execution) veröffentlicht über `/api/cluster/info` die Aufgabengrenze auf Aktivitätsniveau, Anforderungen an den Träger, Bridge-Ergebnisse und Pfade der Eingabe-/Ergebnishüllen.
- Befehle für Serverzustand, Serverinformationen, Namespaces, Workflows, Zeitpläne, Worker und Aufgabenwarteschlangen sind die richtigen Zugriffspunkte für Shell-Prüfungen.
- Der Waterline-Verlaufsexport ist die Quelle für Replay- und Fehlerdiagnose. Er umfasst typisierte Verlaufsereignisse, Metadaten zur Projektionsquelle, Integritätsprüfungen, den Kontext der ausgewählten Ausführung, Wartezustände, Timer, Abstammung und letzte dauerhafte Fehler.
- Typen und Methodensignaturen des Python-SDKs stehen in der generierten [Python-API-Referenz](https://python.durable-workflow.com/).

Wenn ein Agent einen feststeckenden Workflow erklären muss, sammeln Sie zuerst:

1. `workflow_id` und `run_id`
2. aktuellen Ausführungsstatus und letzte Fehlerzusammenfassung
3. jüngste typisierte Verlaufsereignisse
4. offene Wartezustände, Timer und ausstehende Aufgaben
5. Zustand von Workern und Aufgabenwarteschlangen
6. die relevante Dokumentationsversion: `2.0` für aktuelle Produktarbeit, `1.x` nur für die Wartung älterer Versionen

Damit lässt sich ein dauerhafter Workflow-Fehler von einem Worker-Laufzeitfehler, fehlenden externen Zugangsdaten, einem Warteschlangenausfall oder einer auf Genehmigung wartenden Operatoraktion unterscheiden.

## Prompt-Struktur {#prompt-shape}

Geben Sie Programmieragenten explizite Einschränkungen und Zugriffspunkte:

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Use Durable Workflow
2.0 APIs unless I explicitly ask for legacy 1.x maintenance.
```

Das Ziel ist einfach: Menschen lernen die Invariante aus Workflow, Aktivität und Replay. Werkzeuge arbeiten über dokumentierte Verträge.
