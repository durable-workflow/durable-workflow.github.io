---
sidebar_position: 18
title: Protokollspezifikationen der Plattform
description: Katalog der öffentlichen OpenAPI-, JSON-Schema- und AsyncAPI-Spezifikationen von Durable Workflow für Verbraucher.
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - Protokollspezifikationen der Plattform
  - Protokollkatalog
  - openapi
  - asyncapi
  - json schema
  - Control-Plane-Spezifikation
  - Worker-Protokollspezifikation
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Protokollspezifikationen der Plattform {#platform-protocol-specs}

Der Protokollkatalog der Plattform zeigt SDK-Autoren, Agenten, Operatoren und Drittanbieterwerkzeugen genau, welche maschinenlesbare Spezifikation die jeweilige öffentliche Schnittstelle von Durable Workflow bestimmt.

Verwenden Sie für Automatisierung den [maschinenlesbaren Katalog](https://durable-workflow.github.io/platform-protocol-specs.json). Jeder verfügbare Eintrag enthält eine stabile Spezifikationskennung und eine öffentliche HTTPS-URL, die direkt zu einem OpenAPI-, AsyncAPI- oder JSON-Schema-Artefakt führt.

Repository-Pfade, Implementierungssymbole und Test-Fixtures sind bewusst keine maßgebliche Quelle für Verbraucher. Sie sind vom veröffentlichten Katalog ausgeschlossen und werden nur für die Validierungsdiagnose aufbewahrt.

## Katalogidentität und Ermittlung {#catalog-identity-and-discovery}

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

Der Katalog ist außerdem verfügbar über:

- den öffentlichen JSON-Katalog unter https://durable-workflow.github.io/platform-protocol-specs.json;
- platform_protocol_specs in GET /api/cluster/info auf dem eigenständigen Server;
- diesen 2.0-Leitfaden für menschenlesbaren Kontext.

Die JSON-URL ist die maßgebliche maschinell nutzbare Katalogquelle. Der Server exportiert denselben Katalog erneut, damit Clients die aktive Protokollschnittstelle ohne Annahmen zur Repository-Struktur ermitteln können.

<WorkerProtocolAuthorityRoles />

## Felder für Verbraucher {#consumer-fields}

Jeder Eintrag stellt folgenden Vertrag bereit:

| Feld | Bedeutung |
|---|---|
| spec_id | Stabile Protokollkennung von Durable Workflow. Veröffentlichte Dokumente tragen die entsprechende Identität. |
| spec_url | Direkte öffentliche HTTPS-URL der maschinenlesbaren Spezifikation. |
| format | openapi, json_schema oder asyncapi. |
| status | Ob das referenzierte Artefakt veröffentlicht, in Bearbeitung oder geplant ist. |
| surface_family | Familie der Kompatibilitätsrichtlinie, die die Schnittstelle regelt. |
| authority_manifest | Ermittlungsmanifest, über das eine Laufzeit die Schnittstelle ankündigt. |
| owner_repo | Für die Spezifikation verantwortliches Projekt. |
| object_families | Öffentliche Namen der Objektfamilien und ihre verantwortlichen Projekte. |
| evolution_rule | Kompatibilitätsregel für additive und inkompatible Änderungen. |
| breaking_change_release | Von dieser Entwicklungsregel geforderte Veröffentlichungsgrenze. |

Verbraucher sollten spec_url auflösen und die Dokumentidentität gegen spec_id prüfen. Zugriff auf einen Quellcode-Checkout ist nicht erforderlich.

## Verfügbare Spezifikationen {#available-specifications}

Diese Übersicht wird aus dem öffentlichen JSON-Katalog erzeugt. Identität, Verfügbarkeit, öffentliche Links und Verantwortlichkeit für Objektfamilien bleiben damit Katalogdaten und werden nicht zu einer zweiten maßgeblichen Quelle in Prosa.

<ProtocolCatalog />

### Hinweise zur Laufzeit von Worker-Sitzungen {#worker-session-runtime-notes}

Dieses Schema umfasst Fähigkeitsermittlung für Worker-Sitzungen, Lebenszyklushüllen, Momentaufnahmen der Aufgabenaffinität und Sichtbarkeit für Operatoren. Seine stabile Kennung lautet durable-workflow.v2.worker-sessions-runtime.

### Hinweise zur Laufzeit lokaler Aktivitäten {#local-activity-runtime-notes}

Dieses Schema umfasst Fähigkeitsermittlung für lokale Aktivitäten, Optionsmomentaufnahmen, Verlaufsmarker, Wiederholungssemantik und Sichtbarkeit für Operatoren. Seine stabile Kennung lautet durable-workflow.v2.local-activity-runtime.

### Hinweise zur Cluster-Info-Hülle {#cluster-info-envelope-notes}

Dieses Schema umfasst GET /api/cluster/info und die über diesen Endpunkt verfügbaren verschachtelten Ermittlungsmanifeste. Seine stabile Kennung lautet durable-workflow.v2.cluster-info-envelope.

## Formate {#formats}

| Format | Verwendung |
|---|---|
| OpenAPI 3.1 | HTTP- und JSON-Anfrage-/Antwortschnittstellen, deren Routen, Methoden, Statuscodes und Hüllen Vertragsbestandteil sind. |
| JSON Schema 2020-12 | Gespeicherte Datensätze, Ereignisnutzdaten, Ergebnishüllen, Laufzeitoptionen und verwandte Objektfamilien. |
| AsyncAPI 2.6 oder neuer | Semantik für Polling, Streams, Lease-Verlängerung, Reihenfolge und Zustellung. |

## Statusstufen {#status-levels}

| Status | Bedeutung |
|---|---|
| published | Die öffentliche maschinenlesbare Spezifikation ist unter spec_url verfügbar und direkt nutzbar. |
| in_progress | Eine öffentliche Spezifikation ist verfügbar, deckt aber nur einen Teil ab. Aufgeführte Felder und Routen sind normativ. |
| planned | Der Eintrag besitzt eine stabile Katalogidentität, aber noch keine nutzbare Spezifikation. Geplante Einträge enthalten keine spec_url. |

## Entwicklungsregeln {#evolution-rules}

additive_minor_breaking_major erlaubt additive Änderungen in Nebenversionen. Entfernen, Umbenennen, Einschränken von Typen und semantische Änderungen erfordern eine Hauptversion und sollten, soweit praktikabel, eine parallele Route oder ein paralleles Feld verwenden.

parallel_primitive_only gilt für eingefrorene Übertragungsformate. Eine inkompatible Struktur muss unter einem neuen Ereignistyp, Befehlstyp oder einer neuen Schemakennung eingeführt werden. Die ursprüngliche Struktur bleibt dekodierbar.

experimental_any_release gilt nur für ausdrücklich experimentelle Spezifikationen und erlaubt Änderungen in jeder Veröffentlichung.

## Veröffentlichungsvalidierung {#release-validation}

Die CI der Dokumentationswebsite erzwingt folgende maschinelle Prüfungen:

| Prüfschritt | Was die CI prüft |
|---|---|
| catalog_aligned_with_surface_families | Jeder Eintrag verweist auf eine deklarierte öffentliche Kompatibilitätsfamilie. |
| owner_repo_known | Verantwortliche von Einträgen und Objektfamilien verwenden das Katalogvokabular. |
| format_known | Jedes verfügbare Artefakt lässt sich als sein deklariertes Format einlesen. |
| public_spec_references_resolve | Jede verfügbare spec_url ist eine HTTPS-URL im öffentlichen Namespace für Protokollspezifikationen und führt zu einem ausgelieferten Artefakt mit einer zu spec_id passenden Identität. |
| repository_local_authority_fields_rejected | Veröffentlichte Einträge enthalten keine repositorylokalen Pfade, Implementierungssymbole, Testreferenzen oder veralteten Autoritätsfelder. |
| workflow_package_mirror_aligned | Der öffentliche Katalog stimmt mit dem im Workflow-Paket enthaltenen Katalog überein, sofern diese Veröffentlichungseingabe verfügbar ist. |
| server_owned_spec_mirrors_aligned | Veröffentlichte Artefakte unter Server-Verantwortung stimmen mit den Spiegeln im verantwortlichen Repository überein, sofern diese Eingaben verfügbar sind. |
| diagnostic_provenance_complete | Die ausschließlich zur Validierung verwendeten Herkunftsnachweise decken jeden Katalogeintrag und jede Objektfamilie ab. |
| object_family_metadata_declared | Katalogeinträge und veröffentlichte Dokumente stimmen bei Namen und Verantwortlichen der Objektfamilien überein. |
| rendered_retrieval_surfaces_aligned | Die erzeugte 2.0-Seite und die vollständigen 2.0-Bündel für Modellabruf enthalten Katalogidentität, öffentliche URL und Verantwortlichkeit für Objektfamilien jedes verfügbaren Eintrags. |
| breaking_change_release_consistent_with_evolution_rule | Jeder Veröffentlichungswert für inkompatible Änderungen entspricht seiner Entwicklungsregel. |
| deliverable_specs_published | Für jede erforderliche Plattformschnittstelle liegt eine veröffentlichte, einlesbare Spezifikation vor. |

Die maschinelle Prüfung lädt den öffentlichen JSON-Katalog, validiert sein Vokabular und sichere Verbraucherreferenzen, liest ausgelieferte Spezifikationen ein, prüft Metadaten zu Objektfamilien und eingebetteten Schemas und vergleicht Paketspiegel, sofern verfügbar. Nach dem Erzeugen der Website und Modellbündel vergleicht eine semantische Prüfung die gerenderten Katalogwerte mit derselben maßgeblichen JSON-Quelle. Dokumentationsprosa und Überschriftentexte sind nicht Teil des Vergleichs.

Wenn sich der Vertrag ändert, aktualisieren Sie gemeinsam den im Workflow-Paket enthaltenen Katalog, diesen öffentlichen JSON-Spiegel und die betroffenen veröffentlichten Spezifikationsartefakte. Menschliche Prüfung bestätigt, dass die erklärende Prosa nützlich bleibt, ohne sie als maschinell maßgeblich zu behandeln.

Gehen Sie zur [Konformitätstestsuite der Plattform](/docs/platform-conformance), um die aktiven, bytegebundenen Fixtures für diese Protokollspezifikationen aufzulösen. Historische Fixture-Nachweise sind dort getrennt gekennzeichnet und ersetzen keine aktuelle maßgebliche Katalogquelle.
