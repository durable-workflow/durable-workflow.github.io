---
sidebar_position: 4
title: Aufrufbarer HTTP-Transportadapter
description: Den auf Aktivitäten begrenzten invocable_http-Transportadapter konfigurieren, damit Server einen geleasten Aktivitäts-Task per POST an einen HTTPS-Handler sendet und das strukturierte Ergebnis abgleicht.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - aufrufbarer Transportadapter
  - invocable_http
  - externe Executor-Konfiguration
  - HTTP-Aktivitäts-Handler
  - externe Task-Eingabe-Envelope
  - externe Task-Ergebnis-Envelope
---

# Aufrufbarer HTTP-Transportadapter {#invocable-http-carrier}

Der aufrufbare HTTP-Transportadapter ist der erste konkrete Transportadapter der
[Oberfläche für externe Ausführung](./external-execution.md). Er wird durch
`GET /api/cluster/info` unter `worker_protocol.invocable_carrier_contract` mit
`schema: durable-workflow.v2.invocable-carrier.contract`, `version: 1` und
`carrier_type: invocable_http` veröffentlicht.

Wird eine konfigurierte Handler-Zuordnung zu einem `invocable_http`-Transportadapter
aufgelöst, ruft der Server den konfigurierten Endpunkt mit der transportneutralen
[externen Task-Eingabe-Envelope](./external-execution.md#published-contract-seams)
auf und gleicht die Antwort mit der
[externen Task-Ergebnis-Envelope](./external-execution.md#published-contract-seams)
ab. Workflow-Tasks, Signal-/Update-Reihenfolge, Replay und Änderungen an der
Historie bleiben im Server. Der Transportadapter bewegt nur deklarierte
Eingabe- und Ergebnis-Envelopes über eine HTTPS-Grenze.

## Zweck {#what-it-is}

Der aufrufbare HTTP-Transportadapter dient Arbeit auf Aktivitätsniveau, die ein
Betriebsteam lieber als HTTPS-Handler statt als Long-Poll-Worker hostet:

- Wartungsaktivitäten und Plattformautomatisierung in einem internen HTTP-Dienst
- begrenzte Integrationsübergaben, die bereits an einem HTTPS-Endpunkt enden
- serverlose oder containerbasierte Aktivitäts-Handler mit einer POST-Route je Aktivitätstyp

Die Aktivitätsausführung wird an den konfigurierten Endpunkt delegiert.
Dauerhafter Workflow-Zustand, Historie und Aktivitätsabschlussvertrag bleiben
unter der Verantwortung des Servers.

## Auf Aktivitäten begrenzter Umfang {#activity-only-scope}

Das veröffentlichte Manifest legt `task_kinds: [activity_task]` fest und nennt
explizite Nichtziele, damit sich die Grenze nicht durch Konfiguration verschiebt:

- `workflow_task_execution`: Workflow-Tasks bleiben auf echten Workflow-Laufzeitumgebungen.
- `workflow_replay`: Der Transportadapter gibt niemals Workflow-Historie wieder.
- `history_mutation`: Handler dürfen den Ereignisverlauf nicht direkt bearbeiten.
- `generic_webhook_ingress`: Allgemeine Eingänge nutzen einen Brückenadapter, nicht diesen Transportadapter.

Eine Handler-Zuordnung mit einer anderen `kind` als Aktivität oder eine
Transportzuordnung mit einer anderen Fähigkeit als `activity_task` scheitert
bei der Konfigurationsprüfung mit `invalid_invocable_carrier_scope`, bevor sie
in einer Aktivitätsabfrageantwort erscheinen kann.

## HTTPS-Ziel und Methode {#https-target-and-method}

Der Server prüft die `target_fields` des Transportadapters, bevor eine Zuordnung
bereitgestellt wird:

| Feld | Erforderlich | Erlaubt | Hinweise |
| --- | --- | --- | --- |
| `url` | ja | absolute HTTPS-URL oder HTTP für lokale Loopback-Entwicklung (`localhost`, `127.0.0.0/8`, `::1`) | Zugangsdaten in URLs (`scheme://user:pass@host`) sind verboten. |
| `method` | nein | `POST` | Standard `POST`. Andere HTTP-Methoden werden nicht angenommen. |
| `timeout_seconds` | nein | Ganzzahl 1–900 | Transportfrist für einen Handler-Versuch. Die Task-Frist wird separat durch Server/Laufzeitumgebung erzwungen. |
| `retry_policy` | nein | Objekt (siehe unten) | Vom Transportadapter verantwortetes Wiederholungsbudget. |

Ungültige Ziele werden mit `invalid_carrier_target` strikt abgelehnt und
erscheinen niemals in der Erkennungsausgabe.

## Authentifizierungsmodell {#auth-model}

`invocable_http`-Zuordnungen außerhalb von Loopback müssen eine `auth_ref` aus
der externen Executor-Konfiguration auflösen. Nicht authentifiziertes
aufrufbares HTTP ist nur für Loopback-HTTP-Ziele zur lokalen Entwicklung erlaubt.

- `auth_refs` werden einmal oben in der Konfiguration deklariert und von
  Standardwerten oder einzelnen Zuordnungen referenziert. Unterstützte Typen
  sind unter anderem `profile`, `env`, `token_file`, `mtls` und `signed_headers`.
- Eine Zuordnung zu einem Nicht-Loopback-Ziel ohne wirksame `auth_ref` scheitert
  bei der Konfigurationsprüfung mit `missing_invocable_auth_ref`.
- Tokens, Geheimnisse, Signaturen und Autorisierungs-Header werden niemals in
  Cluster-Diagnosen, der Ausgabe von `dw server:info` oder der
  Aktivitätsabfrageantwort wiedergegeben. Zuordnungsdiagnosen melden die
  aufgelöste `auth_ref` und eine geschwärzte Zusammenfassung, niemals den geheimen Wert.

So kann der Betrieb die geschwärzte Laufzeitdiagnose lesen und bestätigen,
welches Authentifizierungsgeheimnis verwendet wird, ohne dass der Server das
Geheimnis selbst offenlegt.

## Transportwiederholung und dauerhafte Aktivitätswiederholung {#transport-retry-versus-durable-activity-retry}

Die optionale `retry_policy` eines aufrufbaren Transportadapters gilt
**ausschließlich für den Transport**. Sie steuert die HTTP-Zustellung, bevor
der Handler ein Ergebnis meldet:

| `retry_policy`-Feld | Erlaubt | Standard | Bedeutung |
| --- | --- | --- | --- |
| `max_attempts` | Ganzzahl 1–5 | `1` | Maximale HTTP-Zustellversuche für eine Task-Lease. |
| `backoff_seconds` | Array mit Ganzzahlen, je 0–300, bis zu 5 Einträge | `[]` | Wartezeit je Versuch vor dem nächsten HTTP-Versuch. |
| `retryable_status_codes` | Teilmenge von `[408, 425, 429, "5xx"]` | `[408, 429, "5xx"]` | Antwortcodes, die eine Transportwiederholung erlauben. |

Transportwiederholungen werden niemals zu Historienereignissen. Der Server
erfährt nur vom letzten Versuch: der strukturierten Erfolgs-/Fehler-Envelope
des Handlers, einem als `failure.kind=timeout, classification=deadline_exceeded`
abgebildeten Transport-Timeout oder einem der Pfade für ungültige Ausgabe.

Sobald der Handler ein Ergebnis meldet, **bleibt die dauerhafte
Aktivitäts-Wiederholungsrichtlinie unter der Kontrolle von Server/Laufzeitumgebung**.
Task-Wiederholung, Planung und Wartezeiten folgen weiterhin der auf
Workflow-Seite deklarierten Aktivitäts-Wiederholungsrichtlinie. Die `retry_policy`
des Transportadapters verlängert, überschreibt oder ersetzt diese nicht.

## Anfrage- und Antwort-Envelope {#request-and-response-envelope}

Der Server sendet die transportneutrale Eingabe-Envelope und erwartet die
transportneutrale Ergebnis-Envelope zurück:

| Richtung | Inhaltstyp | Schema |
| --- | --- | --- |
| Anfrage | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| Antwort | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

Der Handler muss `task.id`, `task.attempt` und `task.idempotency_key` aus der
Eingabe-Envelope erhalten und mit der deklarierten Erfolgs- oder Fehler-Envelope
antworten (oder durch eine Zuordnung zu ungültiger Ausgabe strikt scheitern).

Der Transportadapter bildet Transportfakten deterministisch auf Ergebnisfakten ab:

- Transport-Timeout → `failure.kind=timeout`, `classification=deadline_exceeded`
- Nicht-2xx-Antwort ohne gültige Ergebnis-Envelope → `malformed_output`
- ungültiges JSON oder falsches Schema in der Antwort → `malformed_output`
- Ergebnis-Envelope mit Verweis auf eine nicht unterstützte Nutzlastreferenz → `unsupported_payload`

Handler müssen idempotent sein. Dieselbe `task.id` und `task.idempotency_key`
können mehrfach eintreffen, wenn der Transportadapter die Zustellung wiederholt
oder die Laufzeitumgebung eine unvollständige Lease erneut zustellt.

## Konfigurationsbeispiel {#configuration-example}

Der Server liest Handler-Zuordnungen aus `DW_EXTERNAL_EXECUTOR_CONFIG_PATH`
und wählt optional mit `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` eine Überlagerung.
Die vollständige Liste der Umgebungsvariablen steht in der
[Server-Konfigurationsreferenz](./server-config-reference.md).

Dieses minimale `durable-workflow.external-executor.config`-Dokument registriert
einen `invocable_http`-Transportadapter und eine Aktivitätszuordnung:

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

Eine Loopback-Entwicklungsvariante verwendet
`"url": "http://127.0.0.1:8080/durable/activity"` und darf `auth_ref` auslassen,
da Loopback-HTTP der einzige erlaubte Pfad ohne Authentifizierung ist.

## Inspektion und Diagnose {#inspection-and-diagnostics}

Zwei CLI-Befehle zeigen den veröffentlichten Vertrag eines laufenden Servers:

- `dw server:info` zeigt Schemanamen, Vertragsversion, Transporttyp, Task-Arten,
  erlaubte Anfrage-/Antwort-Inhaltstypen und die geschwärzten Diagnosen der
  externen Executor-Zuordnungen. Bestätigen Sie damit, dass der Server die
  erwarteten Zuordnungen geladen hat.
- `dw doctor` führt die Cluster-Info-Diagnose aus, gibt den Block
  `invocable_carrier_contract` aus und zeigt Fehler wie `invalid_carrier_target`,
  `missing_invocable_auth_ref`, `invalid_invocable_carrier_scope`,
  `unknown_carrier`, `unknown_auth_ref` oder `unknown_handler`, die die Meldung
  einer Zuordnung verhindert haben.

Die Aktivitätsabfrageantwort selbst meldet die aufgelöste Zuordnung, das
Transportziel mit geschwärzter Authentifizierung und die wirksame `retry_policy`.
Worker und Betriebswerkzeuge verwenden diese Felder als maßgebliche Quelle,
statt eine eigene Kopie der Konfigurationsdatei zwischenzuspeichern.

## Koexistenz und Rollout {#coexistence-and-rollout}

Die Rollout-Grenze wird im selben Manifest veröffentlicht:

- Ein abfragebasierter und ein `invocable_http`-Transportadapter dürfen eine
  Warteschlange nur bei aktivitätstypspezifischen Zuordnungen teilen. Zwei
  Zuordnungen dürfen nicht dasselbe Paar `(task_queue, activity_type)` beanspruchen.
- Der Betrieb muss aufrufbare Zuordnungen entfernen oder durch Überlagerung
  deaktivieren, bevor er ihre Zugangsdaten löscht. Werden Zugangsdaten vor dem
  Leeren der Zuordnung entzogen, endet jeder neue Versuch mit
  `failure.kind=auth`, statt still erfolgreich zu sein.
- `retry_policy` gilt rein für den Transport. Die dauerhafte
  Aktivitäts-Wiederholungsrichtlinie bleibt allein maßgeblich für die Anzahl
  der Task-Versuche, die der Workflow beobachtet.

## Verwandte Oberflächen {#related-surfaces}

- [Oberfläche für externe Ausführung](./external-execution.md): die
  transportneutrale Produktgrenze, die dieser Transportadapter implementiert.
- [Aufrufbarer PHP-Aktivitäts-Handler](./invocable-php-handler.md): die PHP-Hilfe,
  mit der ein externer Prozess Eingabe-Envelopes liest, Aktivitäts-Callables
  aufruft und die erwarteten strukturierten Ergebnis-Envelopes ausgibt.
- [Server-Konfigurationsreferenz](./server-config-reference.md): Umgebungsvariablen
  für `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` und `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
- [Externer Nutzlastspeicher](../features/external-payload-storage.md): wie zu
  große Anfrage- oder Ergebnisnutzlasten an einen konfigurierten Treiber
  ausgelagert und als prüfbare Referenz-Envelope in denselben Eingabe- und
  Ergebnisschemas dargestellt werden.
- [Worker-Protokoll](./worker-protocol.md): der umfassendere Worker-Plane-Vertrag,
  der diesen Transportadapter neben abfragebasierten Handler-Formen veröffentlicht.
