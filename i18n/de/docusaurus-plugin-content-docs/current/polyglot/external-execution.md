---
sidebar_position: 3
title: Oberfläche für externe Ausführung
description: Den transportneutralen Vertrag für externe Ausführung auf Aktivitätsniveau für begrenzte Tasks, Brücken und durch KI bedienbare Handler verwenden.
tags:
  - external-execution
  - bridge-adapters
  - worker-protocol
  - AI
keywords:
  - externe Ausführung
  - Brückenadapter
  - Aktivitäts-Worker-Protokoll
  - Task-Ergebnis-Envelope
---

# Oberfläche für externe Ausführung {#external-execution-surface}

Durable Workflow v2 behandelt externe Ausführung als Produktoberfläche mit
explizitem Vertrag. Sie ist weder eine Shell-Konvention noch ein einzelner
Worker-Transport. Der eigenständige Server veröffentlicht den maschinenlesbaren
übergreifenden Vertrag unter `GET /api/cluster/info` in
`worker_protocol.external_execution_surface_contract`.

Dieser Vertrag heißt `activity_grade_external_execution`. Er dient dauerhafter,
begrenzter Arbeit, die außerhalb einer vollständigen Workflow-Runtime laufen kann:

- Wartungsaktivitäten des Betriebs
- Plattformautomatisierung
- Integrationsübergaben
- Brückenadapter, die Arbeit starten, signalisieren, aktualisieren oder übergeben
- Handler als Skript, Daemon, HTTP-Dienst, mit Warteschlangen, serverlos oder agentengesteuert

Der primäre Anwendungsbereich ist Automatisierung für Betrieb, Plattformen und
Integrationen. KI-Agenten und Skripte sind wichtige Verbraucher, da sie stabile
Handles benötigen. Sie definieren die Runtime-Grenze jedoch nicht neu.

## Grenze {#boundary}

Externe Handler dürfen:

- einen geleasten Workflow- oder Aktivitäts-Task ausführen
- den Fortschritt der Lease über Worker-Protokoll-Heartbeats melden
- eine strukturierte Erfolgs- oder Fehler-Envelope zurückgeben
- mit einem Brückenadapter begrenzte Arbeit starten, signalisieren, aktualisieren oder übergeben

Externe Handler dürfen nicht:

- die Replay-Semantik von Workflows interpretieren
- das Verhalten von `ContinueAsNew` verantworten
- Reihenfolgeregeln für Signale, Updates oder Abfragen außerhalb des Runtime-Vertrags anwenden
- den Ereignisverlauf direkt ändern
- als unbegrenzte Workflow-Runtime agieren

Diese Regeln bleiben im Server und in echten SDK-Runtimes. Ein Transportadapter
sollte lediglich deklarierte Eingabe- und Ergebnis-Envelopes über eine
Transportgrenze bewegen.

## Veröffentlichte Vertragsschnittstellen {#published-contract-seams}

Lesen Sie vor dem Anschließen eines Transportadapters `GET /api/cluster/info`.
Die relevanten v2-Pfade sind:

| Pfad | Zweck |
| --- | --- |
| `worker_protocol.external_execution_surface_contract` | Produktgrenze, Runtime-Grenze, gültige Transportklassen und Status der Schnittstellen. |
| `worker_protocol.external_task_input_contract` | Transportneutrale Eingabe-Envelope für einen geleasten Workflow- oder Aktivitäts-Task. |
| `worker_protocol.external_task_result_contract` | Transportneutrale Envelope für Erfolg, Fehler und ungültige Ausgabe. |
| `worker_protocol.server_capabilities.external_execution_surface` | Kompakter Fähigkeitsverweis für die Aushandlung in der Worker-Plane. |

Die Oberfläche für externe Ausführung benennt außerdem geplante Schnittstellen
für die deterministische Kombination von Authentifizierung/Profil/TLS,
konfigurationsbasierte Handler-Zuordnungen, begrenzte Brückenadapter, externen
Nutzlastspeicher und Sicherheit bei Zulassung und Rollout. Behandeln Sie diese
als Vertragsschnittstellen, nicht als private Implementierungsdetails.

## Anforderungen an Transportadapter {#carrier-requirements}

Ein gültiger Transportadapter kann eine abfragende CLI oder ein Daemon, ein
HTTP-Handler-Aufruf, ein Worker mit Warteschlange oder ein serverloser Aufruf
sein. Der Transport kann variieren, diese Anforderungen jedoch nicht:

- das deklarierte Eingabeschema ausgeben
- das deklarierte Ergebnisschema akzeptieren
- `task.id`, `task.attempt` und `task.idempotency_key` erhalten
- Transportfehler auf einen strukturierten Fehler oder das Ergebnis ungültiger Ausgabe abbilden
- Eingaben für Authentifizierung, TLS, Profil und Umgebung deterministisch auflösen

Exit-Codes, stderr, Prozessabstürze, HTTP-Fehler, Sichtbarkeits-Timeouts von
Warteschlangen und Fehler serverloser Plattformen sind Transportfakten. Sie
werden erst zu Workflow-Fakten, wenn der Transportadapter sie auf die deklarierte
Ergebnis-Envelope oder auf `malformed_output` abbildet.

Der erste konkrete Transportadapter dieses Vertrags ist der
[aufrufbare HTTP-Transportadapter](./invocable-carrier.md), veröffentlicht unter
`worker_protocol.invocable_carrier_contract`. Er unterstützt ausschließlich
Aktivitäts-Tasks, verlangt HTTPS (Loopback-HTTP ist nur zur Entwicklung erlaubt)
und löst die Authentifizierung über die Konfiguration des externen Executors auf.
Seine `retry_policy` auf Transportebene unterscheidet sich von der dauerhaften
Aktivitäts-Wiederholungsrichtlinie. Letztere bleibt nach der Ergebnismeldung unter
der Kontrolle von Server/Runtime.

## Brückenadapter {#bridge-adapters}

Brückenadapter sind begrenzte Eingangs- oder Übergabeoberflächen. Sie können
Arbeit starten, signalisieren, aktualisieren oder übergeben. Sie sind jedoch
keine Workflow-Runtimes und sollten Replay- oder Ereignisverlaufsverhalten nicht verbergen.

Jeder Brückenadapter benötigt explizite maschinenlesbare Ergebnisse für:

- unbekanntes Ziel
- Authentifizierungsfehler
- ungültige Nutzlast
- doppelten Start
- nicht unterstütztes Routing
- angenommene Übergabe
- abgelehnte Übergabe

Verwenden Sie dieselbe Klarheit für den Betrieb wie im Rest der Control Plane:
stabile Statuscodes, benannte `reason`-Werte und genügend Kontext, damit `dw`,
Waterline, SDKs und Agenten erklären können, was passiert ist, ohne Prosa auswerten
zu müssen.

Die CLI bietet die Webhook-Brücke direkt an:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json
```

Die JSON-Antwort entspricht dem unter `/api/cluster/info` veröffentlichten
Ergebnisvertrag des Brückenadapters, einschließlich `outcome`, `reason`,
`control_plane_outcome`, `idempotency_key` und der geschwärzten `target`-Zusammenfassung.

## Durch Agenten bedienbare Form {#agent-operable-shape}

Die Oberfläche für externe Ausführung gehört zur Ausrichtung von v2 auf
KI-gestützte Entwicklung. Menschen lernen die Workflow-/Aktivitäts-/Replay-Invariante,
Werkzeuge arbeiten über stabile Verträge:

1. Die Oberfläche für externe Ausführung über `/api/cluster/info` erkennen.
2. Einen Transportadapter wählen, der die veröffentlichten Anforderungen erfüllt.
3. Eine Eingabe-Envelope für einen externen Task ausgeben.
4. Task-Identität und Idempotenz erhalten.
5. Eine Erfolgs-, Fehler- oder Ungültige-Ausgabe-Envelope zurückgeben.
6. Brücken- und Transportfehler mit benannten Ergebnissen melden.

So bleiben KI-gestützte Gerüsterzeugung und Betriebsautomatisierung berechenbar:
Das Werkzeug kann sich auf Protokollmanifest, Task-Envelope, Ergebnis-Envelope
und Brückenergebnis beziehen, statt Verhalten aus einem einzelnen Demoskript abzuleiten.
