---
sidebar_position: 4
title: Namespace, Authentifizierung und Worker-Registrierung
description: Referenz für Namespace-Auflösung im Server, rollenspezifische Authentifizierung und Worker-Registrierungsverträge.
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - Durable Workflow Namespace Authentifizierung
  - rollenspezifische Server-Tokens
  - Worker-Registrierungsvertrag
  - X-Namespace
---

# Namespace, Authentifizierung und Worker-Registrierung {#namespace-auth-and-worker-registration}

Verwenden Sie diese Referenz beim Bereitstellen eines eigenständigen Servers,
Ausstellen von Automatisierungszugangsdaten oder Implementieren einer
Worker-Laufzeitumgebung. Der Server hat drei getrennte Verträge, die
zusammenpassen müssen, bevor Arbeit fließen kann:

- Die Anfrage nennt einen Namespace über `X-Namespace`, `?namespace=` oder den Server-Standard-Namespace.
- Die Zugangsdaten besitzen die für die Routenfamilie erforderliche Rolle.
- Worker registrieren denselben Namespace, dieselbe Task-Warteschlange,
  Laufzeitumgebung, Typschlüssel und Kapazität wie Workflow-Starts und Task-Abfragen.

## Maßgebliche Angaben einer Anfrage {#request-authority}

Durable Workflow behandelt Namespace, Authentifizierungsrolle und
Protokollversion als maßgebliche Anfrageangaben. Leiten Sie sie nicht aus
Workflow-IDs, Task-IDs oder Anzeigebezeichnungen ab.

| Anfragefamilie | Erforderliche Zugangsdatenrolle | Erforderlicher Versions-Header | Namespace-Quelle |
| --- | --- | --- | --- |
| Erkennung `GET /api/cluster/info` | `worker`, `operator` oder `admin` | keiner | optionales `X-Namespace` als Kontext |
| Namespaces auflisten/beschreiben | `operator` oder `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | Routenziel oder Anfragekontext |
| Namespace erstellen/aktualisieren/Speicherrichtlinie | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | Routenziel oder Anfrageinhalt |
| Einsicht in Workflows, Zeitpläne, Task-Warteschlangen, Brückenadapter und Worker | `operator` oder `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, dann Standard |
| Systemzustand, Metriken, Durchläufe und Speichertests | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=`, dann Standard |
| Worker-Registrierung, Abfragen, Heartbeats und Abschluss | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`, `?namespace=`, dann Standard |

Bei rollengeschützten Endpunkten prüft der Server die Routenrolle vor der
Existenz des Namespace. Ein Token mit falscher Rolle erhält einen
Authentifizierungsfehler statt einer Information über die Namespace-Existenz.
Nach bestandenen Rollen- und Versionsprüfungen lehnen Namespace-bezogene Routen
unbekannte Namespaces mit `reason: "namespace_not_found"` ab.

## Authentifizierungsrollen {#auth-roles}

Token-Authentifizierung ist der Standard für die Produktion:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Verwendet eine Bereitstellung ein gemeinsames `DW_AUTH_TOKEN`, besitzt dieses
effektiv alle Routenberechtigungen. Bevorzugen Sie rollenspezifische Tokens in
der Produktion, damit ein Worker-Prozess weder Namespaces ändern noch
Systemwartungsdurchläufe ausführen kann.

Dieselbe Rollentrennung existiert für Signaturauthentifizierung:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` ist nur für lokale Entwicklung gedacht. Es entfernt die
Authentifizierungsgrenze jeder Route und darf niemals außerhalb eines
vertrauenswürdigen lokalen Netzwerks erreichbar sein.

## Signalautorisierung und Zuordnung {#signal-authorization-and-attribution}

Vor der Annahme eines Signals authentifiziert Server die Anfrage und erzwingt
die konfigurierte Rollen- und Namespace-Richtlinie. Die Workflow-Signalrouten
verlangen `operator`- oder `admin`-Zugangsdaten. Diese Routenberechtigungen
implementieren nicht die Bestellfreigaberichtlinie Ihrer Anwendung. Erzwingen
Sie diese Geschäftsentscheidung in einem vertrauenswürdigen Anwendungsgateway,
bevor Sie das Signal weiterleiten, oder in Ihrem unterstützten eigenen
Authentifizierungsanbieter. Halten Sie privilegierte Server-Zugangsdaten
innerhalb dieser vertrauenswürdigen Grenze, wenn Endnutzer Signale nicht direkt
senden dürfen.

Server leitet den `principal` eines Befehls aus den authentifizierten
Zugangsdaten ab. Ein Signalargument wie `approvedBy` bleibt Anwendungsdatum,
auch wenn seine Schreibweise einem Akteur-Subjekt entspricht. Ein Gateway mit
einem Dienst-Token zeichnet den Principal dieses Dienstes auf, nicht zwingend
den Menschen hinter der Anfrage. Leiten Sie ein menschliches Freigabefeld aus
dem authentifizierten Gateway-Nutzer und der Autorisierungsentscheidung ab,
statt es vom Client zu übernehmen.

Für Audits zeigen Befehlsantworten und verknüpfte Befehls-/Historienmetadaten
den aufgezeichneten Principal. Der gespeicherte Befehl enthält ihn unter
`context.principal`, getrennt von Signalargumenten und dem Rückgabewert eines
benannten Signal-Warteaufrufs im Workflow. Fehlende Principal-Metadaten belegen
keinen bestimmten Absender. Das [eingebettete Signalbeispiel](/docs/features/signals#sender-identity-and-authorization)
zeigt eine Laravel-Richtlinienprüfung und hostseitigen Befehlskontext.

Verwenden Sie [benannte Principal-Tokens](/docs/polyglot/server-config-reference#authentication),
wenn Audit-Spuren stabile Akteur-Subjekte benötigen. Ein gemeinsames Rollen-Token
identifiziert keinen einzelnen Anwendungsnutzer. Der Entwicklungsmodus ohne
Authentifizierung liefert keine authentifizierte menschliche Identität.
Weitergeleitete Aufrufer-/Authentifizierungszuordnungs-Header können
konfigurierte Audit-Bezeichnungen ergänzen, liefern aber nicht den von Server
authentifizierten Principal. Lassen Sie weitergeleitete Zuordnung deaktiviert,
sofern die [Anforderungen an vertrauenswürdige Gateways](/docs/polyglot/server-config-reference#command-attribution)
nicht erfüllt sind.

## Namespace-Vertrag {#namespace-contract}

Bootstrap legt den Standard-Namespace an. Setzen Sie `DW_DEFAULT_NAMESPACE`,
wenn Anfragen ohne Namespace-Header anders als nach `default` aufgelöst werden sollen:

```bash
DW_DEFAULT_NAMESPACE=default
```

Erstellen Sie jeden Mandanten- oder Umgebungs-Namespace, bevor Sie Clients oder
Worker darauf richten:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

Namespace-Namen werden in Kleinbuchstaben normalisiert und dürfen Buchstaben,
Zahlen, Punkt, Unterstrich und Bindestrich enthalten. Nach Normalisierung sind
sie eindeutig. Beispielsweise ergibt das Erstellen von `Production` und danach
`production` einen Konflikt mit `reason: "namespace_already_exists"`.

Ein normaler Workflow-Start nennt den Namespace über `X-Namespace`:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

Control-Plane-Lesezugriffe, Workflow-Befehle, Zeitplanoperationen,
Suchattributoperationen und Einsicht in Task-Warteschlangen und Worker verwenden
denselben Namespace-Kontext. Ausgenommen sind die Namespace-Verwaltungsrouten
selbst: Sie zielen auf den Namespace in Route oder Anfrageinhalt und verlangen
nicht, dass dieser vor dem Erstellen oder Beschreiben bereits existiert.

## Worker-Registrierungsvertrag {#worker-registration-contract}

Jeder Worker-Prozess muss sich vor dem Abfragen registrieren. Registrierung ist
Namespace-bezogen. Das Tupel `(namespace, worker_id)` identifiziert daher den
Worker-Datensatz. Die registrierte `task_queue` muss zu späteren Abfragen dieser
Worker-ID passen.

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| Feld | Erforderlich | Vertrag |
| --- | --- | --- |
| `worker_id` | nein | Stabile Prozessidentität. Ohne Angabe erzeugt der Server eine. Lang laufende Laufzeitumgebungen sollten sie für Logs und Task-Warteschlangendiagnosen setzen. |
| `task_queue` | ja | Von diesem Worker abgefragte Warteschlange. Abfragen einer anderen Warteschlange scheitern mit `reason: "task_queue_mismatch"`. |
| `runtime` | ja | Einer der Werte `php`, `python`, `rust`, `typescript`, `go`, `java` oder `external`. Eine angenommene Laufzeitkennung bedeutet nicht, dass ein offizielles SDK verfügbar ist. |
| `sdk_version` | nein | SDK-Version der Laufzeitumgebung in Worker-Ansichten und Diagnosen. |
| `build_id` | nein | Bereitstellungs-/Build-Identität für Build-ID-Ansichten und Rollout-Kohorten der Task-Warteschlange. Sie sollte für eine Replay-kompatible Worker-Familie stabil bleiben. |
| `supported_workflow_types` | nein | Workflow-Typschlüssel, die dieser Worker wiedergeben kann. Leer bedeutet kein Workflow-Typfilter. |
| `workflow_definition_fingerprints` | nein | Deterministische Definitionsfingerabdrücke je Workflow. Aktive Neuregistrierung mit geändertem Fingerabdruck wird abgelehnt. |
| `supported_activity_types` | nein | Aktivitätstypschlüssel, die dieser Worker ausführen kann. Leer bedeutet kein Aktivitätstypfilter. |
| `max_concurrent_workflow_tasks` | nein | Gemeldete lokale Workflow-Task-Slots. Standard `100`, Minimum `1`. |
| `max_concurrent_activity_tasks` | nein | Gemeldete lokale Aktivitäts-Task-Slots. Standard `100`, Minimum `1`. |

Aktive Neuregistrierung mit derselben Worker-ID ist erlaubt, wenn die gemeldeten
Definitionsfingerabdrücke unverändert sind. Ändert ein laufender Worker den
Workflow-Code eines bereits gemeldeten Typs, muss er mit neuer `worker_id`
neustarten. Andernfalls scheitert die Registrierung mit
`reason: "workflow_definition_changed"`.

`build_id` ist keine bloße Dekoration. Sie ist die betriebsseitige
Kohortenidentität der Task-Warteschlangen-Rollout-APIs. Behalten Sie dieselbe
`build_id` für Worker, die dieselbe laufende Arbeit sicher wiedergeben können.
Ändern Sie sie, wenn ein Rollout eine neue Kompatibilitätsfamilie erzeugt.
[Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing)
erklärt den Bindungs- und Rollback-Vertrag,
[Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout) den Ablauf von
Leeren und Fortsetzen.

## Abfragen und Einsicht {#polling-and-visibility}

Worker-Abfragen müssen denselben Namespace, dieselbe Worker-ID und
Task-Warteschlange wie die Registrierung verwenden:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

Der Betrieb kann denselben Registrierungszustand über die Control Plane untersuchen:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

Task-Warteschlangenansichten sind die erste Anlaufstelle, wenn Worker keine
Tasks erhalten. Sie unterscheiden fehlende Worker von abweichenden
Warteschlangen, nicht unterstützten Workflow-/Aktivitätstypfiltern, ausgelasteten
Worker-Slots, Server-Grenzen aktiver Leases, Zuweisungsraten und Rückstaukontrolle
für Abfrage-Tasks.

Abfrageantworten selbst zeigen dasselbe maschinenlesbare Ergebnis in
`poll_status`, wenn der Server in `GET /api/cluster/info`
`worker_protocol.server_capabilities.poll_status = true` meldet. Die Routen für
Workflow-, Aktivitäts- und Abfrage-Tasks behalten dieses Feld auch bei
`task: null`, damit Worker-Laufzeitumgebungen anhand einer stabilen Oberfläche
verzweigen können:

- `leased`: Ein Task wurde erfolgreich geleast.
- `empty`: Kein Task war vor Rückkehr der Abfrage bereit.
- `throttled`: Warteschlangenzulassungsgrenzen haben für diese Abfrage einen neuen Task zurückgehalten.
- `unavailable`: Der Server konnte die Warteschlange nicht sicher koordinieren
  und lieferte ein typisiertes Nichtverfügbarkeitsergebnis, statt eine leere Warteschlange vorzutäuschen.
- `draining`: Die Build-ID-Kohorte des Workers läuft aus. Die Abfrage scheitert
  mit HTTP `409` und `reason: "worker_draining"`, bis die Kohorte fortgesetzt wird.

## Fehleroberfläche {#error-surface}

Automatisierung sollte nach benannten Gründen statt nach Prosameldungen verzweigen.

| Grund | Ort | Bedeutung | Betriebsaktion |
| --- | --- | --- | --- |
| `missing_control_plane_version` | Control-Plane-Route | `X-Durable-Workflow-Control-Plane-Version: 2` fehlt. | Versions-Header ergänzen oder Client-Profil aktualisieren. |
| `missing_protocol_version` | Worker-Route | `X-Durable-Workflow-Protocol-Version: 1.0` fehlt. | Worker-Client oder SDK-Versionsaushandlung korrigieren. |
| `namespace_not_found` | Namespace-bezogene Route | Der Namespace aus `X-Namespace`, Abfragezeichenfolge oder Server-Standard existiert nicht. | Namespace erstellen oder Client-Namespace korrigieren. |
| `namespace_already_exists` | `POST /api/namespaces` | Ein normalisierter Namespace-Name existiert bereits. | Wiederverwenden oder einen anderen Namen wählen. |
| `task_queue_mismatch` | Worker-Abfrageroute | Eine für eine Warteschlange registrierte Worker-ID wollte eine andere abfragen. | Mit neuer Worker-ID neustarten oder die registrierte Warteschlange abfragen. |
| `worker_draining` | Worker-Abfrageroute | Die Build-ID-Kohorte ist als auslaufend markiert. Der Worker darf laufende Arbeit beenden, aber keine neuen Tasks übernehmen. | Kohorte für Rollback fortsetzen oder Worker nach Auslaufen aktueller Leases stoppen. |
| `workflow_definition_changed` | `POST /api/worker/register` | Aktive Worker-ID wollte geänderte Workflow-Fingerabdrücke melden. | Geänderten Prozess mit neuer Worker-ID neustarten. |
| `validation_failed` | jede JSON-Route | Ein Feld fehlt, ist ungültig, zu groß oder außerhalb erlaubter Grenzen. | `errors` oder `validation_errors` lesen und Nutzlast korrigieren. |

## Siehe auch {#see-also}

- [Server-API-Referenz](/docs/polyglot/server-api-reference)
- [Worker-Protokoll](/docs/polyglot/worker-protocol)
- [Task-Warteschlangenzulassung](/docs/polyglot/task-queue-admission)
- [CLI-Befehlsreferenz](/docs/polyglot/cli-reference)
