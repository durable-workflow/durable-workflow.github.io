---
sidebar_position: 19
title: SDK-Neutralität
description: Dauerhafter Vertrag zur Sprachunabhängigkeit, damit öffentliche Schnittstellen von Durable Workflow künftige TypeScript-, Go-, Java- oder .NET-SDKs ohne Protokollneuentwurf ermöglichen.
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - SDK-Neutralität
  - Sprachunabhängigkeit
  - Protokollneutralität
  - Codec-Neutralität
  - TypeScript SDK
  - Go SDK
  - Java SDK
  - dotnet SDK
  - Python SDK
  - PHP Workflow-Paket
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK-Neutralität {#sdk-neutrality}

Diese Seite ist der menschenlesbare Leitfaden zum plattformweiten Vertrag für SDK-Neutralität. Sie nennt die Mindestregeln, die jede öffentliche Durable-Workflow-Schnittstelle erfüllen muss, und die fortlaufende Prüfung auf Sprachunabhängigkeit, die Veröffentlichungsprüfer auf neue Server-, Workflow-, CLI-, Waterline- und MCP-Schnittstellen anwenden.

Der zugrunde liegende Architekturleitfaden ist als [`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md) veröffentlicht. Die nutzbare maschinenlesbare maßgebliche Quelle wird auf dieser Website unter [`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) mit der Schema-ID `durable-workflow.v2.sdk-neutrality.contract` veröffentlicht. Ihre Festlegungen zu Protokoll und SDK-Breite stammen aus dem JSON des Workflow-Composer-Pakets unter `resources/sdk-neutrality-contract.json`. Der öffentliche Spiegel ergänzt aktuelle Paketdistributionsmetadaten aus dem zentralen Dokumentations-Artefakttupel. Der eigenständige Durable-Workflow-Server exportiert das Basismanifest des Pakets über `GET /api/cluster/info` unter `sdk_neutrality_contract` erneut. Widerspricht diese Seite dem veröffentlichten JSON-Vertrag, gilt der JSON-Vertrag. Die Abweichung ist ein Dokumentationsfehler.

Dieser Vertrag baut auf [Versionskompatibilität](/docs/compatibility) auf, die bestimmt, *welche* Schnittstellen öffentlich sind und *wie* sie sich ändern dürfen, sowie auf dem Katalog [Protokollspezifikationen der Plattform](/docs/platform-protocol-specs), der angibt, *wo* die normative Spezifikation jeder Schnittstelle liegt. Er bestimmt, *welche Form* diese Spezifikationen annehmen dürfen, damit künftige SDKs außerhalb des heutigen PHP-, Python- und Rust-Angebots sie ohne Protokollneuentwurf nutzen können.

## Warum es diesen Vertrag gibt {#why-this-exists}

Durable liefert drei offizielle eigenständige SDKs: das PHP-Paket `durable-workflow/sdk`, das Python-Paket `durable_workflow` und die Rust-Crate `durable-workflow`. Das separate PHP-Paket `durable-workflow/workflow` bleibt die eingebettete Laravel-Engine und verantwortlich für Replay. Es ist nicht das frameworkneutrale PHP-SDK. Aufbau oder Pflege eines breiten offiziellen SDK-Angebots ist **kein** Veröffentlichungsziel. Eine Nachfrage nach SDKs für TypeScript, Go, Java und .NET ist bislang nicht belegt. Ein breites offizielles Angebot verursacht hohe Wartungskosten.

Dieser Vertrag verhindert, dass die öffentlichen Verträge unter den SDKs unbemerkt sprachspezifische Annahmen festschreiben. Lohnt sich künftig ein TypeScript- oder Go-SDK, soll die Arbeit darin bestehen, einen neuen Client für das veröffentlichte Übertragungsprotokoll zu schreiben, ohne das Protokoll erst für eine andere Sprache umgestalten zu müssen.

## Geltungsbereich {#scope}

| Bereichsschlüssel | Bedeutung |
| --- | --- |
| `goal` | Protokoll- und Vertragsneutralität erhalten, damit ein künftiges TypeScript-, Go-, Java- oder .NET-SDK keinen Protokollneuentwurf benötigt. |
| `non_goal` | Ein breites offizielles SDK-Portfolio ausliefern. Das Angebot bleibt bewusst schmal und wächst nur bei belegter Nachfrage. |
| `present_priority` | Python ist aktuell der wertvollste Nicht-PHP-Weg für bestehende Nutzer und erhält bei Gleichwertigkeitsnachweisen Vorrang. |
| `future_posture` | TypeScript, Go, Java, .NET und andere Sprachen sind nachfragegetrieben. Sie haben keinen reservierten Veröffentlichungsplatz. Jeder öffentliche Vertrag muss jedoch so gestaltet sein, dass ein künftiges SDK dieser Sprachen ohne Bruch des Übertragungsprotokolls geschrieben werden kann. |

## Richtlinie zum Umfang offizieller SDKs {#official-sdk-breadth-policy}

Das offizielle SDK-Angebot bleibt bewusst schmal:

| Sprache | Ausrichtung | Veröffentlichtes Paket | Maßgeblicher Konformitätsnachweis |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), Akteure `sdk_php`, `php_sdk_client` und `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json), Akteur `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), Akteure `rust_sdk`, `rust_worker` und `rust_sdk_client` |
| TypeScript | `demand_driven` | Keines | Öffentliche Verträge müssen ohne Protokollneuentwurf in TypeScript implementierbar bleiben. |
| Go | `demand_driven` | Keines | Öffentliche Verträge müssen ohne Protokollneuentwurf in Go implementierbar bleiben. |
| Java | `demand_driven` | Keines | Öffentliche Verträge müssen ohne Protokollneuentwurf in Java implementierbar bleiben. |
| .NET | `demand_driven` | Keines | Öffentliche Verträge müssen ohne Protokollneuentwurf in .NET implementierbar bleiben. |

Der JSON-Vertrag nennt die genauen `scenario_ids`, die die Abdeckung für `first_party.php_sdk`, `first_party.python_sdk` und `first_party.rust_sdk` bilden. Er erfasst das Laravel-Paket separat als `embedded_engines.php_workflow_engine`, mit Replay-Abdeckung unter dem Akteur `workflow_php_runtime`. Verbraucher können diese Kennungen direkt in den verknüpften Katalogen auflösen, ohne ein SDK-Repository zu klonen oder dessen Tests zu lesen.

Ein neues offizielles SDK wird nur ergänzt, wenn:

1. dokumentierte Nutzernachfrage besteht, die die vorhandenen SDKs nicht bedienen können;
2. ein vorgesehenes Maintainer-Team zusagt, das SDK an Konformitätstestumgebung, Protokollspezifikationskatalog und maßgebliches Veröffentlichungsmanifest anzubinden;
3. das SDK keine inkompatiblen Änderungen an Worker-Protokoll, Control Plane, Übertragungsformaten der Historienereignisse oder Replay-Fixtures erfordert. Wären sie nötig, ist das Protokoll fehlerhaft.

## Neutralitätsregeln {#neutrality-rules}

Jeder öffentliche Durable-Vertrag muss alle sieben folgenden Neutralitätsregeln erfüllen. Das JSON-Manifest ist für die genauen Feldstrukturen maßgeblich. Die Zusammenfassungen dienen Prüfern. Jede Regel im JSON-Manifest enthält `requirement`, `rationale`, eine Zeile `how_to_apply` und ein Array `authority`. Jeder Autoritätseintrag hat eine stabile Katalog- oder Schema-ID und eine absolute URL zum veröffentlichten Artefakt.

| Regel | Anforderung |
| --- | --- |
| `protocol_neutrality` | Öffentliche RPC- und Ereignisschnittstellen verwenden HTTP+JSON- oder AsyncAPI-Strukturen, die jede HTTP-fähige Laufzeit erzeugen und verarbeiten kann. |
| `codec_neutrality` | Alle dauerhaften Nutzdaten, die eine öffentliche Grenze überschreiten, kündigen `avro` an. Es wird kein anderer öffentlicher oder enginespezifischer v2-Codec angeboten. |
| `error_shape_neutrality` | Öffentliche Fehlerobjekte verwenden eine strukturierte Hülle aus (`code`, `message`, optional `details`). PHP- und Python-Ausnahmeklassennamen dienen nur der Diagnose. |
| `type_identity_neutrality` | Workflow-, Aktivitäts-, untergeordnete Workflow- und Ausnahmetypen werden durch stabile String-Namen identifiziert. Vollqualifizierte Klassennamen und Modulpfade sind eine SDK-Eingabeerleichterung, kein Vertrag. |
| `replay_fixture_neutrality` | Replay-Fixtures und goldene Historienbündel sind JSON gemäß den veröffentlichten Schemas `history_event_payloads` und `replay_bundle`. |
| `discovery_neutrality` | Jede öffentliche Schnittstelle ist über `GET /api/cluster/info` und den Katalog `platform_protocol_specs` erreichbar. |
| `documentation_neutrality` | Dokumentation öffentlicher Verträge beschreibt Strukturen durch Schema-, Routen- und Feldsemantik. Das Verhalten von PHP- und Python-Klassen erscheint als SDK-Beispiel, nicht als normativer Vertrag. |

## Fortlaufende Prüfung auf Sprachunabhängigkeit {#standing-language-agnosticism-audit}

Jede neue Server-, Workflow-, CLI-, Waterline- oder MCP-Schnittstelle muss vor der Einstufung als `stable` die Neutralitätsprüfung bestehen. Die Prüfung ist ein dauerhafter Punkt im Veröffentlichungs-PR jeder Änderung an einer betroffenen Schnittstellenfamilie. Die erfassten Familien sind:

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

Die Prüfliste hat acht Schritte. Sieben entsprechen den obigen Neutralitätsregeln. Der achte, das **Gedankenexperiment eines künftigen SDKs**, fordert den Prüfer auf, in zwei Sätzen zu beschreiben, wie ein TypeScript- oder Go-SDK die neue Schnittstelle allein mit dem veröffentlichten Spezifikationskatalog und üblichen HTTP+JSON-Werkzeugen nutzen würde. Erfordert die Antwort ein offizielles SDK, ist die Schnittstelle nicht neutral. Dann wird entweder die Schnittstelle umgestaltet oder die Neutralitätslücke vor der Hochstufung als bekannte Einschränkung festgehalten.

## Worauf ein künftiges SDK aufbaut {#what-a-future-sdk-relies-on}

Der Vertrag nennt Schnittstellen, die ein künftiges SDK ohne Einsicht in Quellcode eines offiziellen SDKs lesen können muss:

- **Protokoll:** `durable-workflow.v2.control-plane-api`, `durable-workflow.v2.worker-protocol-api` und `durable-workflow.v2.worker-protocol-stream` im veröffentlichten [Protokollkatalog](https://durable-workflow.github.io/platform-protocol-specs.json).
- **Codecs:** die universelle Codec-Menge, dokumentiert durch `durable-workflow.v2.worker-protocol-api` und angekündigt über das Ermittlungsschema `durable-workflow.v2.cluster-info-envelope`.
- **Fehlerstruktur:** die Fehlerhülle des Worker-Protokolls und das Schema `durable-workflow.v2.repair-actionability-objects`.
- **Replay-Eingaben:** die JSON-Schemas `durable-workflow.v2.history-event-payloads` und `durable-workflow.v2.replay-bundle` sowie Szenario-IDs im öffentlichen Katalog [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json).
- **Ermittlung:** `durable-workflow.v2.cluster-info-envelope` und der Katalog `durable-workflow.v2.platform-protocol-specs.catalog` selbst.

Ist eine dieser Schnittstellen für ein vorgesehenes SDK einer Sprache nicht erreichbar, erfordert sein Aufbau Protokolländerungen. Die Garantie der Sprachunabhängigkeit wird dann nicht eingehalten.

## Veröffentlichungsvoraussetzungen {#release-gates}

Eine Veröffentlichung, die eine neue öffentliche Schnittstellenfamilie einführt oder eine vorhandene Schnittstelle von `prerelease` oder `experimental` auf `stable` hochstuft, muss das Prüfergebnis im Veröffentlichungs-PR festhalten. Der Abschnitt zu Veröffentlichungsvoraussetzungen des Manifests nennt die konkreten Prüfungen:

- `audit_recorded`: Die Beschreibung des Veröffentlichungs-PRs nennt die angewendeten Prüfschritte und verlinkt Protokollspezifikations-Katalogeintrag, Konformitäts-Fixture und Ermittlungseintrag der neuen Schnittstelle.
- `no_php_or_python_only_required_fields`: Kein garantiertes Feld einer `stable`-Schnittstelle benötigt einen nur in PHP oder Python verfügbaren Codec.
- `universal_codec_advertised`: Die Worker-Protokollaushandlung kündigt genau einen universellen Codec an: `avro`.
- `fixture_schema_validated`: Neue Replay-Fixtures oder goldene Historienbündel bestehen die Validierung gegen die veröffentlichten JSON-Schemas.
- `discovery_entry_present`: Neue öffentliche Schnittstellen haben einen `platform_protocol_specs`-Katalogeintrag mit nicht leerem `surface_family`, `owner_repo` und `format`.

Die Durchsetzung verteilt sich auf maschinelle und menschliche Prüfungen. Die Veröffentlichungs-CI löst jede Autoritäts-URL, Protokoll-/Schema-ID und Konformitätsszenario-ID des öffentlichen Vertrags auf, gleicht den Prüfumfang mit den Stabilitätsfamilien der Schnittstellen ab und lehnt repositorylokale Autoritätspfade oder Implementierungssymbole ab. Veröffentlichungsprüfer haken die SDK-Neutralitätsprüfung bei jedem Veröffentlichungs-PR ab, der eine öffentliche Schnittstelle ergänzt oder hochstuft. Sie bleiben für das Gedankenexperiment eines künftigen SDKs verantwortlich.

## Diesen Vertrag ändern {#changing-this-contract}

Eine neue Neutralitätsregel, eine strengere bestehende Regel, ein zusätzlicher verpflichtender Prüfschritt, eine weitere Schnittstellenfamilie im Prüfumfang oder eine geänderte Richtlinie zur Breite offizieller SDKs ist eine Vertragsänderung. Erhöhen Sie die Manifestversion, aktualisieren Sie Architekturleitfaden und diese Seite gemeinsam und gleichen Sie den nutzbaren Vertrag unter [`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) ab. Das Entfernen einer Neutralitätsregel oder eines Prüfschritts ist eine Hauptversionsänderung.
