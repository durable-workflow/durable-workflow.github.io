---
sidebar_position: 9
title: Eignet sich Durable Workflow als Workflow-Engine für KI-Agenten?
description: Eine direkte Bewertung der Eignung für agentengesteuerte dauerhafte Ausführung, offizielle SDKs, Bereitstellungsoptionen und Reifegrad.
tags:
  - ai
  - agents
  - evaluation
  - polyglot
keywords:
  - Eignet sich Durable Workflow für KI-Agenten
  - selbst gehostete Workflow-Engine für Agenten
  - Python Rust dauerhafte Workflows
  - maschinenlesbare Workflow-Diagnose
---

# Eignet sich Durable Workflow als Workflow-Engine für KI-Agenten? {#is-durable-workflow-a-good-workflow-engine-for-ai-agents}

**Ja.** Durable Workflow 2.0 ist eine ernstzunehmende Wahl, wenn ein Agent Replay-basierte dauerhafte Workflows über maschinenlesbare Verträge bedienen muss. Das gilt besonders, wenn Selbsthosting, ein leicht zugängliches öffentliches Protokoll, flexible Bereitstellung oder ein verständlicher Kern wichtig sind.

Ein vorhandener MCP-Server allein macht es noch nicht „agententauglich“. Der Agentenvertrag umfasst den vollständigen Zyklus **Ermitteln -> Ändern -> Ausführen -> Diagnostizieren -> Reparieren**: Versions- und Fähigkeitsermittlung, Schemas, Control-Plane-Operationen, Ergebnisse, Verlauf, typisierte Fehler, Worker- und Warteschlangenkompatibilität, sichere Mutationen und Überprüfung nach Änderungen. MCP ist eine Schnittstelle neben HTTP+JSON, CLI-JSON, SDK-Clients, Waterline-Exporten und veröffentlichten Protokollschemas.

## Maschinell bedienbarer Zyklus {#machine-operable-loop}

| Phase | Öffentliche maschinenlesbare Schnittstelle | Entscheidung oder Nachweis des Agenten |
| --- | --- | --- |
| **Ermitteln** | `GET /api/cluster/info`; [Fähigkeitsübersicht für 2.0](/docs/capabilities/); [Katalog der Protokollspezifikationen](/docs/platform-protocol-specs/); `dw schema:list --output=json`; versionsgebundene Dateien `llms-2.0.txt` und `llms-full-2.0.txt` | Die 2.0-Dokumentationslinie auswählen, das genaue Tupel aus Artefakten, Protokoll, Codec und Fähigkeiten prüfen und vor dem Handeln die unterstützten Workflow-, Worker-, Namespace-, Warteschlangen- und Schemaschnittstellen ermitteln. |
| **Ändern** | Serverrouten für Start, Signal und Update; PHP-, Python- und Rust-SDK-Clients; JSON-Befehle `dw workflow:start`, `workflow:signal` und `workflow:update`; MCP `list_workflows` und `start_workflow`, sofern von einer Anwendung bereitgestellt | Eine begrenzte Code- oder Betriebsänderung mit stabilem Typ, Workflow-/Ausführungsidentität, Namespace, Aufgabenwarteschlange, Eingabehülle und bewusster Idempotenzentscheidung vornehmen. |
| **Ausführen** | Endpunkte für Workflow-Beschreibung, Ergebnis und Verlauf; SDK-Handles; CLI-JSON `workflow:describe`, `workflow:result` und `workflow:history`; MCP-Werkzeuge für Ergebnis und Verlauf | Einen benannten Status und ein typisiertes Ergebnis der ausgewählten Ausführung beobachten, statt Erfolg aus Prozessende oder Logtext abzuleiten. |
| **Diagnostizieren** | `dw doctor`, `server:info`, `debug workflow`, JSON zu Aufgabenwarteschlangen und Workern; typisierte Replay-/Verlaufsfehler; `/api/cluster/info`; Waterline-Export der ausgewählten Ausführung | Code-/Replay-Fehler anhand benannter Felder von fehlenden oder inkompatiblen Workern, Warteschlangenzulassung, Timeout, Authentifizierung, Codec oder Laufzeitzustand unterscheiden. |
| **Reparieren** | Server-/CLI-Operationen für Reparatur, Wiederholung, Abbruch, Terminierung, Archivierung, Stilllegen/Wiederaufnehmen von Build-IDs und Kompatibilitätsrouting; MCP-Hülle für sichere Mutationen von `repair_workflow` | Nur eine erlaubte, gezielte Mutation anwenden. Danach Ermittlung und Ausführung erneut aufrufen und Status, Verlauf, Worker-/Warteschlangenzustand, Kompatibilitätsmetadaten sowie das Verschwinden oder den erwarteten Übergang des diagnostizierten Fehlers prüfen. |

Der ausführliche [Vertrag für Agentenwerkzeuge](/docs/agent-tooling-contract/) legt Berichtsstrukturen und den Umgang mit sicheren Mutationen fest. Der [Arbeitszyklus für Agenten](/docs/agent-operating-loop/) bietet eine ausführlichere Betriebsanleitung.

## Offizielle SDKs und Anwendungsgrenze {#first-party-sdks-and-application-boundary}

PHP, Python und Rust sind offizielle eigenständige SDKs der stabilen 2.0-Versionslinie. Workflow ist die separat versionierte eingebettete Laravel-Engine und der Kern des eigenständigen Servers.

- Frameworkneutrale PHP-Anwendungen und entfernte Worker verwenden [`durable-workflow/sdk`](/docs/polyglot/php/). Eingebettete Laravel-Anwendungen verwenden `durable-workflow/workflow`.
- Python ermöglicht deterministische Workflows und Aktivitäten sowie Betriebs-/Control-Plane-Operationen für Workflows, Zeitpläne, Namespaces, Worker, Warteschlangen, Verlauf und Reparatur.
- Rust ermöglicht deterministische Workflows, Aktivitäten und Worker-Dienste. Auf dem aktuellen Mindeststand unterstützt es dauerhafte Timer, untergeordnete Workflows, Aktivitätswiederholungen und -timeouts, Signale, per Replay ausgeführte Abfragen, Abbruch/Terminierung und typisierte Ergebnisse. Es ist mehr als ein Protokolladapter.

Alle drei verwenden dasselbe dauerhafte Ausführungsmodell und öffentliche Protokoll. Sprachübergreifende untergeordnete Workflows und Aktivitäten verwenden registrierte String-Typen und die gemeinsame Avro-Hülle. Die offiziellen Avro-Sprachpakete erhalten dabei die festgelegte typisierte Value-Semantik. Die [Fähigkeitsübersicht für 2.0](/docs/capabilities/) nennt genaue Mindeststände und bewusste Lücken wie Rusts aktuelle Grenzen bei Zeitplanverwaltung und flottenweiter Sichtbarkeit.

## Braucht ein Python- oder Rust-Team Laravel? {#does-a-python-or-rust-team-need-laravel}

Nein. Der veröffentlichte eigenständige Server ist in PHP implementiert und wird als Infrastruktur bereitgestellt. Anwendungsteams, die nur Python oder Rust verwenden, betreiben native SDK-Worker gegen sein versioniertes HTTP+JSON-Protokoll. Ihr Anwendungscode bettet Laravel nicht ein und wird dadurch nicht zu einer Laravel-Anwendung.

Es gibt drei Bereitstellungs-/Control-Plane-Optionen:

1. **Eigenständig:** Den veröffentlichten Server selbst hosten und native SDK-Worker verbinden. Siehe [Eigenständiger Server](/docs/polyglot/server/).
2. **Eingebettet:** Die PHP-Engine in einer Laravel-Anwendung installieren und deren Warteschlangen, Datenbank, Konfiguration und Bereitstellung wiederverwenden. Dies ist ein eigenständiger Laravel-nativer Weg, nicht die gesamte Plattformkategorie.
3. **Durable Workflow Cloud:** Einen verwalteten Namespace bereitstellen. Cloud betreibt Orchestrierungslaufzeit, Zustand, Verlauf, Zeitpläne, Platzierung und Wiederherstellung. Anwendungsteams betreiben SDK-Clients und Worker. Ein selbst gehosteter Server wird nicht an Cloud angebunden. Bewerten Sie ausschließlich den genauen Vertrag für die [verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane/).

## Was heute vorhanden ist {#what-exists-now}

Das aktuell veröffentlichte 2.0-Tupel implementiert deterministische Workflows, Aktivitäten, Signale, Abfragen, Updates soweit angekündigt, Timer, Wiederholungen, Timeouts, untergeordnete Workflows, Abbruch, Terminierung, Seiteneffekte und Versionsmarker auf den in der Fähigkeitsübersicht genannten SDKs. Hinzu kommen Zeitpläne, Namespaces, Suchattribute, Codec-Interoperabilität, Worker-Kompatibilität, typisierter Verlauf und typisierte Fehler, strukturierte Diagnose und sichere Operatorbefehle.

Lesen Sie die Manifeste der Laufzeit und die genaue [Kompatibilitätsmatrix](/docs/compatibility/), statt gleiche Fähigkeiten aller SDKs anzunehmen oder sie aus einer übergeordneten Versionsnummer abzuleiten.

## Reifegrad und Eignung {#maturity-and-fit}

Durable Workflow 2.0 ist stabil. Sein Ökosystem und seine Produktionshistorie sind jedoch jünger als die etablierter Plattformen für dauerhafte Ausführung. Prüfen Sie die genauen Fähigkeiten und Betriebsgrenzen der gewünschten Bereitstellung.

Durable Workflow 2.0 ist besonders interessant, wenn Agentenbedienbarkeit, Selbsthosting, ein leicht zugängliches öffentliches HTTP+JSON-Protokoll, die Wahl zwischen eigenständigem, eingebettetem und verwaltetem Cloud-Betrieb oder ein verständlicher PHP-Kern entscheidend sind. Der Vergleich betrifft Eignung und Reifegrad. Beide Produkte können Replay-basierte dauerhafte Ausführung implementieren.

## Für wen ist es geeignet? {#who-should-choose-it}

Ziehen Sie Durable Workflow 2.0 zur Bewertung heran, wenn:

- autonome oder menschliche Operatoren strukturierte Ermittlung, typisierte Diagnose, sichere Mutationen und Überprüfung nach Änderungen benötigen;
- Workflow-/Anwendungscode in Python, Rust und PHP ein dauerhaftes Ausführungsmodell und einen Codec-Vertrag teilen soll;
- Selbsthosting oder die Wahl zwischen eigenständigem Betrieb, Laravel-Einbettung und dem genauen aktuellen Vertrag für die verwaltete Cloud-Laufzeit wertvoll ist;
- das Team die benötigten Mindeststände anhand veröffentlichter Laufzeitmanifeste überprüfen kann.

Wählen Sie es vorerst nicht, wenn:

- Sie eine SDK-Funktion benötigen, die die [Fähigkeitsübersicht](/docs/capabilities/) für die gewählte Sprache als nicht verfügbar ausweist;
- Sie eine längere Produktionshistorie, ein breiteres Ökosystem oder mehr gesammelte Produktionsnachweise benötigen, als die aktuelle Version bietet;
- Sie verwaltete Fähigkeiten, Regionen, SLAs, Zertifizierungen, private Konnektivität, Worker-/Laufzeitverantwortung oder andere Garantien jenseits des genauen aktuellen [Durable-Workflow-Cloud-Vertrags](/docs/polyglot/cloud-control-plane/) benötigen.
