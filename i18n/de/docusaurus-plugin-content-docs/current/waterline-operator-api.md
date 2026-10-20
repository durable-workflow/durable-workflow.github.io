---
sidebar_position: 13
title: Waterline-Operator-API-Referenz
description: Typisierte Waterline-API-Verträge für Dashboard-Listen, Details ausgewählter Läufe, Historienexport, Zeitpläne, gespeicherte Ansichten, Einstellungen und Operatoraktionen.
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - Waterline API-Referenz
  - Details ausgewählter Läufe
  - Historienexport
  - Vertrag über Handlungsmöglichkeiten
  - Workflow-Operatoraktionen
---

# Waterline-Operator-API-Referenz {#waterline-operator-api-reference}

Waterline ist die Operatoroberfläche für dauerhaften Zustand sowohl in eingebetteten Laravel- als auch in eigenständigen Serverbereitstellungen. Die Benutzeroberfläche verwendet dieselbe hier dokumentierte HTTP+JSON-API. Skripte, Dashboards und Agenten können daher dauerhafte Workflow-Fakten ohne HTML-Auswertung lesen.

Verwenden Sie diese Referenz für typisierte Operatornachweise: Details ausgewählter Läufe, Historienexport, Handlungsmöglichkeiten, Befehlsverfügbarkeit, gespeicherte Ansichten, Einstellungen und Zeitplansichtbarkeit. [Überwachung](./monitoring.md) erklärt die Trennung zwischen dauerhaftem Waterline-Zustand und Worker-/Laufzeittelemetrie.

## Installation {#installation}

Installieren Sie Waterline in derselben eingebetteten Laravel-Anwendung wie das Workflow-Paket:

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%%
php artisan waterline:install
```

Die erzeugten Versionsfestlegungen wählen stabile 2.x-Veröffentlichungen von Waterline und Workflow. Der eingebettete Modus liest den Workflow-Zustand der Anwendung direkt und benötigt kein Dienst-SDK. Veröffentlichen Sie nach einem Waterline-Upgrade die aktuellen Assets:

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

Installieren Sie für die Beobachtung im Dienstmodus innerhalb eines Laravel-Hosts außerdem das PHP-SDK:

```bash
composer require %%artifact.phpSdkComposerPackage%%
```

Das eigenständige Waterline-Dienstimage enthält dieses SDK bereits. Seine Eingaben für Verbindung, Authentifizierung und Persistenz stehen unter [Überwachung](./monitoring.md#waterline-service).

### Oberflächensprache {#interface-language}

Waterline unterstützt Englisch, brasilianisches Portugiesisch, vereinfachtes Chinesisch, Französisch, Deutsch, Japanisch, Spanisch und Ukrainisch im eingebetteten und im Dienstmodus. Setzen Sie die Sprache in der Umgebung der Laravel-Anwendung oder des Dienstcontainers:

```dotenv
WATERLINE_LOCALE=es
```

| Sprache | Einstellung |
| --- | --- |
| Englisch | `en` |
| Brasilianisches Portugiesisch | `pt-BR` |
| Vereinfachtes Chinesisch | `zh-Hans` |
| Französisch | `fr` |
| Deutsch | `de` |
| Japanisch | `ja` |
| Spanisch | `es` |
| Ukrainisch | `uk` |

Regionale spanische Aliasse wie `es-ES`, `es-MX` und `es-419` wählen die gemeinsame spanische Oberfläche. `pt`, `pt_br` und Varianten der Groß-/Kleinschreibung wählen brasilianisches Portugiesisch (`pt-BR`). Andere portugiesische Regionen fallen auf Englisch zurück. Zahlen, Diagrammbeschriftungen und relative Zeitdauern folgen der gewählten Oberflächensprache.
Verwenden Sie `zh-Hans` für vereinfachtes Chinesisch. `zh`, `zh-CN`, `zh-SG` und explizite Tags für vereinfachte Schrift wie `zh-Hans-CN` wählen dieselbe Oberfläche. Unterstriche und Varianten der Groß-/Kleinschreibung werden akzeptiert. Traditionell-chinesische Tags wie `zh-Hant`, `zh-TW` und `zh-HK` fallen auf Englisch zurück.
Verwenden Sie `ja` für Japanisch. Regionale Aliasse wie `ja-JP`, Unterstriche und Varianten der Groß-/Kleinschreibung wählen dieselbe japanische Oberfläche.
Verwenden Sie `fr` für Französisch. Regionale Aliasse wie `fr-FR` und `fr-CA`, Unterstriche und Varianten der Groß-/Kleinschreibung wählen die gemeinsame französische Oberfläche.
Verwenden Sie `de` für Deutsch. Regionale Aliasse wie `de-DE`, `de-AT` und `de-CH`, Unterstriche und Varianten der Groß-/Kleinschreibung wählen die gemeinsame deutsche Oberfläche.

Englisch ist Standard und Rückfallsprache. Eingebettete Anwendungen können auch `waterline.locale` in ihrer aufgelösten Konfiguration setzen. Erzeugen Sie eine zwischengespeicherte Laravel-Konfiguration nach Änderungen neu. Waterline erhält Spracheinstellung der Hostanwendung, Workflow-Namen, Kennungen, Nutzdaten und ursprüngliche Ausnahmetexte unverändert. JSON-API-Feldnamen und Maschinenzustände behalten ihre bestehenden Werte.

## Bereitstellungsgrenze {#deployment-boundary}

Waterline hat zwei Backend-Adapter:

- Der eingebettete Modus läuft im Laravel-Host und liest den dauerhaften Zustand des Workflow-Pakets im Prozess.
- Der Dienstmodus betreibt das veröffentlichte Waterline-Image und liest einen Namespace eines eigenständigen Servers über `durable-workflow/sdk` und die öffentliche Server-API.

Beide Adapter stellen die hier dokumentierten Waterline-Routen bereit. Der Dienstmodus übersetzt diese in entsprechende Serververträge:

| Waterline-Routenfamilie | Vom Dienstmodus verwendeter Vertrag des eigenständigen Servers |
| --- | --- |
| `GET /waterline/api/v2/health` | Serverzustand, Worker-Registrierung und Aufgabenwarteschlangensichtbarkeit. |
| `GET /waterline/api/stats` | Namespace-bezogenes Operator-Dashboard und Metrikmomentaufnahme. |
| Flow-Listen, Details ausgewählter Läufe und Historienexport | Workflow-Liste, Details, Läufe, Historie und Diagnose aus der [Server-API-Referenz](./polyglot/server-api-reference.md). |
| Signal-, Update-, Abfrage-, Abbruch-, Terminierungs-, Reparatur- und Archivierungsaktionen | Entsprechende Serververträge für Workflow-Befehle und Reparatur. |
| Routen unter `/waterline/api/v2/schedules` | Serververträge für Zeitplanliste, Details, Historie und Mutation. |

Server-API, CLI und SDK-Schnittstellen bleiben bei bereitgestelltem Waterline direkt verfügbar. Nehmen Sie keine modus- oder Namespace-übergreifende Sichtbarkeit an: Läufe bleiben über ihre verantwortliche Laufzeit und ihren Namespace lesbar und bedienbar. [Bereitstellungsmodi](./polyglot/deployment-modes.md) definiert diese gemeinsame Produktgrenze.

## Basispfad und Geltungsbereich {#base-path-and-scope}

Waterline wird unter dem in der Laravel-Anwendung konfigurierten Waterline-Basispfad eingebunden. Die folgenden Beispiele verwenden `/waterline`. Veröffentlicht Ihre Anwendung Waterline unter einem anderen Präfix, behalten Sie die Suffixe `/api/...` bei.

Ist `WATERLINE_NAMESPACE` konfiguriert, sind alle Listen-, Detail-, Zeitplan- und Operatoraktionsrouten auf diesen Namespace begrenzt. Namespace-übergreifende Lesezugriffe und Befehle liefern Nicht-gefunden-Semantik, statt Workflow-Zustand anderer Namespaces offenzulegen.

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## Authentifizierung {#authentication}

Jeder Waterline-UI- und JSON-API-Controller durchläuft Waterlines Zugriffsprüfung. Im eingebetteten Modus definiert der Laravel-Host diese Prüfung und bestimmt die geltenden Guards, Routen-Middlewares, Gates, Richtlinien, SSO-/OIDC-/SAML-Sitzungen, verzeichnisgestützten Gruppen, Diensttokens und Ratenbegrenzungen.

Die aktuelle JSON-Operator-API-Gruppe schließt Laravels CSRF-Middleware aus, damit ein Host eine Sitzungs- oder Diensttokengrenze einheitlich auf Lesezugriffe und Befehle anwenden kann. Der Host bleibt für die Authentifizierung dieser Anfragen verantwortlich und muss zusätzliche CSRF-Schutzmaßnahmen für Browsersitzungen um die API dokumentieren.

Das eigenständige Dienstimage besitzt keine Benutzer der Hostanwendung. Stellen Sie es vor dem Setzen von `WATERLINE_ALLOW_UNAUTHENTICATED=true` hinter einen authentifizierenden Reverse Proxy oder an eine private Schnittstelle. Diese Einstellung delegiert die äußere Waterline-Zugriffsprüfung an die umgebende Bereitstellung. Unabhängig davon authentifiziert `WATERLINE_SERVER_TOKEN` Waterlines PHP-SDK-Aufrufe beim eigenständigen Server. Geben Sie diese Serverzugangsdaten niemals an den Browser weiter.

`WATERLINE_ACCESS_MODE=read_only` blockiert verändernde Waterline-Routen lokal. `operator` aktiviert sie, doch der verbundene Server setzt weiterhin seine eigene Tokenrolle und Namespace-Autorisierung durch. [Überwachung](./monitoring.md#waterline-service) enthält Bereitstellungsbeispiel und beide Authentifizierungsgrenzen.

## Dashboard und Zustand {#dashboard-and-health}

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | Dashboard-Gesamtzahlen, Rückstauzähler, Reparaturrichtlinie, Operatormetriken und Flottentrenddaten. |
| `GET` | `/waterline/api/v2/health` | Waterline-Paket-/Laufzeitzustand und Bereitschaft der v2-Datenquelle. |

`/waterline/api/stats` ist die Zusammenfassungsschnittstelle des Dashboards. Behandeln Sie `operator_metrics` als Waterline-eigene JSON-Diagnose und nicht als Prometheus-Abfrageschnittstelle. Verwenden Sie Worker-SDK-Metriken für Laufzeitlatenz und eigene Anwendungstelemetrie.

Die [Betriebsgrenzen für Operatoren](./operator-operating-envelope.md) definieren die Interpretation dieser Diagnosen bei Rollouts und Vorfällen. Insbesondere:

| Feldfamilie | Bedeutung |
| --- | --- |
| `operator_metrics.backlog.*` | Dauerhafte Zähler für ausführbare, verzögerte, mit Lease versehene, ungesunde, reparaturbedürftige, bei Übernahme fehlgeschlagene und kompatibilitätsblockierte Arbeit sowie flottenweite Warteschlangenflusswerte `tasks_added_last_minute` und `tasks_dispatched_last_minute`. |
| `operator_metrics.matching_role.*` | Knotenlokaler Matching-/Zuteilungsvertrag des antwortenden Prozesses: `queue_wake_enabled`, Bereitstellungs-`shape`, `task_dispatch_mode`, eingefrorene `partition_primitives` und aktuelles `backpressure_model`. |
| `operator_metrics.repair.*` | Umfang der Reparaturschleifendurchläufe, einschließlich ausgewählter Kandidaten, Kandidatenalter und Scanbelastung. |
| `operator_metrics.projections.*` | Zähler für Projektionsabweichungen bei Laufzusammenfassungen, Wartezuständen, Zeitleisten, Timern und Abstammung. |
| `operator_metrics.command_contracts.*` | Ältere Vertragsmomentaufnahmen von WorkflowStarted, die noch nachgetragen werden müssen. |
| `operator_metrics.history.*` | Belastung durch Historiengröße und Ereignisanzahl sowie Continue-As-New-Empfehlungen. |
| `queue_visibility.available`, `queue_visibility.reason` | Ob Namespace-bezogene Warteschlangensichtbarkeit in dieser Hostanwendung verfügbar ist, andernfalls mit Begründung. |
| `queue_visibility.task_queues[].stats.*` | Warteschlangenlokaler Rückstau, dessen Alter, Pollerzahlen, bereite gegenüber mit Lease versehenen Workflow-/Aktivitätsaufgaben und Flusswerte `tasks_added_last_minute` / `tasks_dispatched_last_minute` je Warteschlange. |
| `queue_visibility.task_queues[].repair.*` | Warteschlangenlokaler Reparaturdruck, einschließlich Kandidaten, Zuteilungsfehlern, abgelaufenen Leases, überfälligen Zuteilungen und jeweils höchstem Alter. |
| `coordination_alerts[]` | Zusammengefasste Warnungen und Fehler aus Zustandsprüfungen und Warteschlangensichtbarkeitsrisiken wie Rückstau ohne Poller, veralteten Pollern oder überalterten Reparaturkandidaten. |
| `checks[]`, `categories.*` | Blockierende und hinweisende v2-Zustandsprüfungen mit `category = correctness \| acceleration` je Prüfung sowie den Kategoriezusammenfassungen der Worker-Ansicht. |
| `engine_source`, `readiness_contract` | Ob Waterline die v2-Operator-Bridge aktiv verwendet und welcher Bereitschaftsvertrag diesen Zustand regelt. |

Die Warteschlangenflussfelder beantworten eine konkrete Operatorfrage: Trifft dauerhafte Warteschlangeneingabe schneller ein, als das System sie zuteilt? `tasks_added_last_minute` zählt unterschiedliche dauerhafte Aufgabenzeilen, die in den letzten 60 Sekunden erstellt wurden. `tasks_dispatched_last_minute` zählt unterschiedliche dauerhafte Aufgabenzeilen, deren letzte erfolgreiche Zuteilung in dasselbe Fenster fällt.

Verwenden Sie die Flussgesamtzahlen gemeinsam mit den serverseitigen Sichtbarkeitsrouten für Aufgabenwarteschlangen. Waterline zeigt, ob der dauerhafte Zufluss die Zuteilung überholt. `/api/task-queues` und `/api/task-queues/{taskQueue}` zeigen, ob die belastete Warteschlange `saturated`, bewusst `throttled`, `no_active_workers` oder anderweitig knapp an gesunden Pollern oder Slots ist.

`GET /waterline/api/v2/health` stellt dieselben warteschlangenlokalen Nachweise innerhalb Waterlines bereit. Skripte und Dashboards für die aktuelle Lage eines Namespace sollten `queue_visibility.task_queues[]` für Statistiken je Warteschlange und `coordination_alerts[]` für eine Zusammenfassung aktuell aufmerksamkeitspflichtiger Warteschlangen- oder Zustandsprüfbedingungen lesen.

Die Felder von `matching_role` beantworten eine andere Frage: Welche Matching-Form bedient dieser Knoten derzeit? `shape` unterscheidet `in_worker` von `dedicated`. `partition_primitives` legt die Routingachsen auf `connection`/`queue`/`compatibility`/`namespace` fest. `backpressure_model` meldet derzeit `lease_ownership`. Behandeln Sie diesen Block als prozesslokal. Vergleichen Sie ihn bei Rollouts mit gemischten Formen zwischen Knoten, bevor Sie aus Rückstau- oder Pollingunterschieden auf Worker-Probleme schließen.

`GET /waterline/api/v2/health` verwendet dieselbe Unterscheidung: `error` blockiert, `warning` ist ein Hinweis und `ok` bedeutet, dass die aktuelle v2-Operator-Bridge bereit ist.

## Listenansichten {#list-views}

Listenansichten sind nach dauerhaftem Status gruppiert:

| Methode | Pfad | Kategorie |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | Offene oder aktiv blockierte Läufe. |
| `GET` | `/waterline/api/flows/completed` | Erfolgreich geschlossene Läufe, einschließlich fortgesetzter Läufe mit `closed_reason = continued`. |
| `GET` | `/waterline/api/flows/failed` | Fehlgeschlagene Läufe. |
| `GET` | `/waterline/api/flows/cancelled` | Abgebrochene Läufe. |
| `GET` | `/waterline/api/flows/terminated` | Terminierte Läufe. |

Listenzeilen sind kompakte Operatorzusammenfassungen. Stabile Felder umfassen Workflow-Identität (`id`, `instance_id`, `run_id`, `workflow_type`), Zustand (`status`, `closed_reason`, `archived_at`), Zeitangaben, `history_event_count`, `history_size_bytes`, `continue_as_new_recommended` und Reparatur-/Handlungskennzeichen wie `repair_blocked`.

## Details des ausgewählten Laufes {#selected-run-detail}

Waterline hat zwei Adressierungsmodi:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | Aktuell ausgewählter Lauf einer Workflow-Instanz. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | Explizit ausgewählter Lauf. |
| `GET` | `/waterline/api/flows/{id}` | Älterer-/Detailabruf über Waterline-Zeilen- oder Lauf-ID. |

Die Details des ausgewählten Laufes sind der maßgebliche JSON-Vertrag für Operatoransichten. Sie enthalten dauerhaften Zustand und abgeleitete Diagnose für:

| Feldfamilie | Bedeutung |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | Aktueller und historischer Wartezustand, vorrangig aus typisierter Historie neu aufgebaut. |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | Befehlslebenszykluszeilen und ladbare Workflow-Vertragsziele. |
| `timeline` | Geordnete dauerhafte Ereignisse und diagnostische Einträge. |
| `exceptions`, `logs` | Fehlerfakten und Replay-/Debugkontext. |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | Verfügbare UI- und Automatisierungsaktionen für den ausgewählten Lauf. |
| `actionability` | Der unten beschriebene versionierte Reparatur- und Nachweisvertrag. |

Automatisierung sollte Details des ausgewählten Laufes bevorzugen. Ein Screenshot kann zeigen, was ein Operator sah. Die Laufdetails erklären, warum ein Workflow repariert, abgefragt, abgebrochen, archiviert oder per Replay ausgeführt werden kann oder nicht.

## Historienexport {#history-export}

Historienexporte sind Replay-/Debug-Bündel. Sie enthalten bewusst gespeicherte Workflow-, Befehls-, Aktivitäts-, Update-, Aufgaben-, Fehler- und Historiennutzdaten, damit Entwickler den ausgewählten Lauf reproduzieren oder archivieren können.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | Den aktuell ausgewählten Lauf einer Instanz exportieren. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | Einen expliziten Lauf exportieren. |
| `GET` | `/waterline/api/flows/{id}/history-export` | Älterer-/Detailexport über Waterline-Zeilen- oder Lauf-ID. |

Kann ein Export eine geschützte Umgebung verlassen, konfigurieren Sie zuerst die Schwärzung des Workflow-Historienexports. Nachgelagerte Werkzeuge sollten die Metadaten `redaction` des Exports erhalten, damit Prüfer erkennen, welche Richtlinie das Artefakt geprägt hat.

## Vertrag über Handlungsmöglichkeiten {#actionability-contract}

Waterline versieht Listenzeilen, Detailantworten ausgewählter Läufe, Zeitleisteneinträge und Historienexporte mit dem versionierten Vertrag über Handlungsmöglichkeiten:

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

Die Vertragskennung ist `actionability_contract.schema = waterline.actionability` mit `actionability_contract.version = 1`.

`actionability` auf Laufebene beantwortet, ob der ausgewählte Lauf repariert werden kann:

| Feld | Bedeutung |
| --- | --- |
| `repair_state` | Einer der Werte `repairable`, `blocked`, `not_needed` oder `unknown`. |
| `repairable` | Boolesche Kurzform für `repair_state = repairable`. |
| `blocked_reason` | Stabiler Ursachencode bei `repair_state = blocked`. |
| `status_bucket` | Waterline-Kategorie, die die Entscheidung auf Laufebene bestimmt hat. |
| `closed_reason` | Dauerhafter Abschlussgrund bei geschlossenem Lauf. |
| `task_problem` | Ob Waterline ein Problem auf Aufgabenebene im Lauf erkannt hat. |
| `diagnostic_only_evidence` | Wahr, wenn mindestens eine Zeile informativ, aber keine Wiederaufnahmequelle ist. |

Nachweiszeilen unter `activities`, `waits`, `timers`, `exceptions`, `logs` und Zeitleisten-/Exporteinträgen können ihren eigenen Block `actionability` enthalten:

| Feld | Bedeutung |
| --- | --- |
| `state` | `actionable`, wenn die Zeile eine gültige Reparaturquelle ist, sonst `diagnostic_only`. |
| `repair_source` | Nur bei Zeilen wahr, die auf einer maßgeblichen reparierbaren Quelle beruhen. |
| `diagnostic_only` | Wahr, wenn die Zeile nicht als Wiederaufnahmequelle verwendet werden darf. |
| `history_authority` | Maßgebliche Quelle wie `typed_history`, `mutable_open_fallback`, `failure_row_fallback` oder `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Stabiler Ursachencode für nicht unterstützte Fallback-Historie. |

Agenten und Skripte müssen Reparatur-/Wiederaufnahmeentscheidungen anhand von `actionability.repair_state`, `actionability.repairable` und zeilenbezogenem `actionability.repair_source` treffen. Eine Zeile mit `diagnostic_only = true` ist ein Nachweis und keine Erlaubnis für Replay oder Wiederaufnahme.

## Operatoraktionen {#operator-actions}

Waterline-Aktionen sind dauerhafte Befehle über den Vertrag des ausgewählten Laufes. Instanzrouten zielen auf den aktuellen Lauf. Laufrouten lehnen veraltete oder falsche Laufziele explizit ab.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | Eine deklarierte Abfrage gegen den aktuellen Lauf ausführen. |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | Ein Signal an den aktuellen Lauf senden. |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | Ein Update an den aktuellen Lauf übermitteln. |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | Einen Reparaturdurchlauf für den aktuellen Lauf zuteilen, wenn die Handlungsmöglichkeiten es erlauben. |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | Abbruch des aktuellen Laufes anfordern. |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | Den aktuellen Lauf terminieren. |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | Den ausgewählten geschlossenen Lauf archivieren. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | Eine Abfrage gegen einen explizit ausgewählten Lauf ausführen. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | Nur bei aktuellem ausgewähltem Lauf ein Signal senden. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | Nur bei aktuellem ausgewähltem Lauf ein Update übermitteln. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | Einen explizit ausgewählten Lauf reparieren. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | Nur bei aktuellem ausgewähltem Lauf abbrechen. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | Nur bei aktuellem ausgewähltem Lauf terminieren. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | Den ausgewählten geschlossenen Lauf archivieren. |

Signale, Updates und Abfragen akzeptieren JSON-`arguments`. Ungültige Argumente liefern feldbezogene Validierungsfehler. Replay-Blockaden liefern `409 Conflict` mit einem stabilen Grund wie `workflow_definition_unavailable`, statt eine bestmögliche Ausführung zu versuchen.

## Update-Inspektion {#update-inspection}

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | Eine Update-Lebenszykluszeile des aktuellen Laufes prüfen. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | Eine Update-Lebenszykluszeile eines expliziten Laufes prüfen. |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | Älterer-/Detailabruf eines Updates. |

Verwenden Sie Update-Inspektion, wenn eine Oberfläche oder ein Agent erklären muss, ob ein Update angenommen, angewendet, abgeschlossen, abgelehnt, beim Warten zeitlich abgelaufen oder durch Replay-Kompatibilität blockiert ist.

## Zeitpläne {#schedules}

Waterline-Zeitplanrouten sind v2-Routen für Sichtbarkeit und Operatoraktionen:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | Im aktuellen Geltungsbereich sichtbare Zeitpläne auflisten. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | Einen Zeitplan beschreiben. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}/history` | Die Audit-Ereignisse zum Lebenszyklus des Zeitplans lesen. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | Künftige Auslösungen pausieren. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | Einen pausierten Zeitplan wieder aufnehmen. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | Sofort auslösen. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | Ein Zeitfenster nachträglich ausführen. |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | Einen Zeitplan löschen. |

Ein Zeitplan wird durch seinen Namespace und seine `schedule_id` identifiziert. Dieselbe `schedule_id` kann in mehreren Namespaces vorkommen. Jede Route für einen einzelnen Zeitplan akzeptiert optional `namespace` als Abfrageparameter oder im Anfragetext:

- Ein auf einen Namespace begrenztes Waterline arbeitet nur mit seinem eigenen Namespace. Dazu gehören eingebettetes Waterline mit gesetztem `WATERLINE_NAMESPACE` und jede Bereitstellung im Dienstmodus. Eine Anfrage für einen anderen Namespace liefert `404`.
- Ein clusterweites eingebettetes Waterline arbeitet mit dem angefragten Namespace. Ohne `namespace` liefert eine `schedule_id`, die in mehreren Namespaces vorkommt, `409` mit dem Grund `schedule_namespace_required`. Dabei ändert sich nichts.

```bash
curl -sS -X POST \
  "$APP_URL/waterline/api/v2/schedules/nightly-invoice-sync/pause?namespace=billing" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"note": "Supplier maintenance"}' | jq '.status, .note'
```

### Zeitplanzeilen {#schedule-rows}

Die Listenantwort ist paginiert und enthält `data`, `current_page`, `last_page`, `per_page`, `total` und `operator_scope`. Jede Zeile in `data` hat im eingebetteten und im Dienstmodus dieselben Felder:

| Feld | Bedeutung |
| --- | --- |
| `schedule_id` | Die ID des Zeitplans. Senden Sie sie zusammen mit `namespace` an jede Route für einen einzelnen Zeitplan. |
| `id` | Derselbe Wert wie `schedule_id`, für ältere Clients beibehalten. |
| `namespace` | Der Namespace des Zeitplans. |
| `workflow_type`, `workflow_class` | Der Workflow, den der Zeitplan startet. Beide Felder können `null` sein. |
| `status`, `paused` | `active`, `paused` oder `deleted` sowie die Angabe, ob der Zeitplan pausiert ist. |
| `note` | Die Operatornotiz oder `null`. |
| `spec` | Der Auslösetakt: `cron_expressions` (Cron-Zeichenfolgen), `intervals` (Objekte mit den ISO-8601-Dauern `every` und optional `offset`) und `timezone`. |
| `overlap_policy` | `skip`, `buffer_one`, `buffer_all`, `cancel_other`, `terminate_other` oder `allow_all`. |
| `next_fire_at`, `last_fired_at` | ISO-8601-Zeitstempel oder `null`. |
| `last_outcome` | Das zuletzt erfasste Ergebnis einer Auslösung oder `null`, wenn keines erfasst wurde. Es enthält `outcome` (zum Beispiel `scheduled`, `drained`, `backfilled`, `skipped` oder `failed`), `at`, `reason`, `workflow_id` und `run_id`. |
| `fires_count`, `failures_count`, `skipped_trigger_count`, `remaining_actions` | Zähler oder `null`, wenn das Backend den jeweiligen Zähler nicht meldet. |
| `search_attributes` | Die Suchattribute des Zeitplans oder `null`. |
| `created_at`, `updated_at` | ISO-8601-Zeitstempel. |

Eine Zeile mit `last_fired_at` und ohne `last_outcome` bedeutet, dass das Backend den Auslösezeitpunkt ohne dessen Ergebnis gemeldet hat.

Listenzeilen sowie die Antworten der Detailroute und der Routen `pause` und `resume` enthalten außerdem `action`, `max_runs`, `jitter_seconds`, `paused_at`, `last_skip_reason`, `last_skipped_at`, `latest_workflow_instance_id`, `buffered_actions`, `memo` und `recent_actions`. Jeder Eintrag in `recent_actions` enthält `outcome`, `fired_at`, `reason`, `workflow_id`, `run_id` und `occurrence_time`. `latest_instance_id` wiederholt `latest_workflow_instance_id` für ältere Clients. Ein `spec` behält nach seinen Feldern für den Auslösetakt alle weiteren Schlüssel, die das Backend gespeichert hat.

### Ergebnisse von Auslösen und Nachholen {#trigger-and-backfill-results}

`trigger` akzeptiert optional `overlap_policy`. Die Route liefert `schedule_id`, `namespace`, `outcome` (`triggered`, `buffered`, `buffer_full` oder `skipped`), `triggered`, `workflow_id`, `run_id` und `reason`. `triggered` ist nur dann `true`, wenn ein Workflow gestartet wurde. `instance_id` wiederholt `workflow_id` für ältere Clients.

`backfill` erfordert die ISO-8601-Zeitstempel `from` und `to` und akzeptiert optional `overlap_policy`. Die Route liefert `schedule_id`, `namespace`, `fires_attempted`, `started_count`, `skipped_count`, `failed_count` und `results`. Jedes Ergebnis enthält `fire_time`, `workflow_id`, `outcome` (`started`, `skipped` oder `failed`) und `reason`. Für ältere Clients wiederholt jedes Ergebnis außerdem `schedule_id`. Ebenso wiederholen `cron_time`, `instance_id` und `error` die Werte `fire_time`, `workflow_id` und den `reason` eines fehlgeschlagenen Ergebnisses. `backfill` lehnt ein Zeitfenster, dessen Ende nicht nach seinem Beginn liegt, mit `422` und dem Grund `invalid_time_range` ab.

Beide Routen lehnen eine unbekannte `overlap_policy` mit `422` und dem Grund `invalid_overlap_policy` ab.

## Gespeicherte Ansichten und Einstellungen {#saved-views-and-preferences}

Gespeicherte Ansichten und Einstellungen sind UI-eigene Operatorkonfiguration, keine Workflow-Historie. Für stabile Betriebsanleitungen sind sie trotzdem nützlich: Teams können damit die genauen Filter und das Tabellenlayout eines Vorfalls teilen.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | Gespeicherte Operatoransichten auflisten. |
| `POST` | `/waterline/api/saved-views` | Eine gespeicherte Ansicht erstellen. |
| `GET` | `/waterline/api/saved-views/{view}` | Eine gespeicherte Ansicht lesen. |
| `PUT` | `/waterline/api/saved-views/{view}` | Eine gespeicherte Ansicht aktualisieren. |
| `DELETE` | `/waterline/api/saved-views/{view}` | Eine gespeicherte Ansicht löschen. |
| `GET` | `/waterline/api/preferences/{surface}` | UI-Einstellungen einer Schnittstelle lesen. |
| `PUT` | `/waterline/api/preferences/{surface}` | UI-Einstellungen einer Schnittstelle aktualisieren. |

Behandeln Sie Namen gespeicherter Ansichten und Einstellungsnutzdaten nicht als dauerhafte Workflow-Fakten. Führen Sie als Nachweis Details ausgewählter Läufe oder Historienexporte an.

## Fehlervertrag {#error-contract}

Waterline verwendet übliche HTTP-Statuscodes und JSON-Fehlerdetails:

| Status | Bedeutung |
| --- | --- |
| `400` | Fehlerhafte Anfrage oder nicht unterstützte Aktionsnutzdaten. |
| `404` | Workflow-Instanz, Lauf, Update, Zeitplan, gespeicherte Ansicht oder Einstellungsbereich wurde im aktuellen Namespace nicht gefunden. |
| `409` | Der ausgewählte Lauf kann die Aktion nicht ausführen, häufig weil er historisch, geschlossen, Replay-blockiert oder seine Definition nicht verfügbar ist. Eine clusterweite Zeitplananfrage liefert ebenfalls `409`, wenn ihre `schedule_id` einen `namespace` benötigt. |
| `422` | Validierung fehlgeschlagen; die Antwort enthält feldbezogene Fehler. |
| `500` | Unerwarteter Anwendungsfehler. |

Automatisierung sollte nach Status und stabilen Feldern wie `blocked_reason`, `query_blocked_reason`, `outcome`, `reason` und `actionability`-Werten verzweigen. Werten Sie Hinweismeldungen oder Schaltflächenbeschriftungen nicht als Vertrag aus.

## Siehe auch {#see-also}

- [Überwachung](./monitoring.md)
- [Fehler und Wiederherstellung](./failures-and-recovery.md)
- [Abfragen](./features/queries.md)
- [Abbrechen und terminieren](./features/cancel-and-terminate.md)
- [Vertrag für Agentenwerkzeuge](./agent-tooling-contract.md)
