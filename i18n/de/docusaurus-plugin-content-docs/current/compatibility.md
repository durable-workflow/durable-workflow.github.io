---
sidebar_position: 17
title: Versionskompatibilität
description: Kanonischer Vertrag für Kompatibilität und Veröffentlichungsautorität der öffentlichen Durable-Workflow-Schnittstellen.
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - Versionskompatibilität
  - maßgebliche Kompatibilität
  - Veröffentlichungsautorität
  - Stabilitätsstufen
  - Protokollmanifeste
  - Control-Plane-Version
  - Worker-Protokollversion
  - Stabilitätsvertrag der Schnittstellen
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Versionskompatibilität {#version-compatibility}

Diese Seite ist der **kanonische Vertrag für Kompatibilität und Veröffentlichungsautorität** der öffentlichen Durable-Workflow-Plattform. Sie ist die einzige maßgebliche Quelle dafür:

- welche Schnittstellen öffentlich sind,
- welche Stabilitätsstufe jede öffentliche Schnittstelle hat,
- welche Änderungen in einer Patch-, Neben- oder Hauptversion ausgeliefert werden dürfen,
- ob ein Feld Vertragsbestandteil oder ausschließlich diagnostisch ist,
- und welches Protokoll zur Versionsaushandlung Clients verwenden, um sicher abzulehnen, wenn der Server eine Schnittstelle ausweist, die sie nicht unterstützen.

Paketspezifische Stabilitätsdokumente wie `docs/api-stability.md` im Repository `durable-workflow/workflow`, die `dw`-CLI-Referenz und die Waterline-Operator-API-Seite sind dieser Seite **nachgeordnet**. Sie ergänzen unter diesen Regeln paketbezogene Details. Bei Widersprüchen gilt diese Seite, und die Abweichung ist ein Fehler im paketspezifischen Dokument.

Derselbe Vertrag wird maschinenlesbar veröffentlicht, damit SDKs, Servermanifeste und CI-Prüfungen sich gegen eine gemeinsame maßgebliche Quelle validieren können:

- `surface_stability_contract` im Antwortinhalt von `GET /api/cluster/info` auf dem eigenständigen Durable-Workflow-Server, Schema `durable-workflow.v2.surface-stability.contract`, Version `5`.
- Ein eingefrorener Spiegel desselben Manifests in diesem Repository unter `static/compatibility-contract.json`.
- Die PHP-Klasse `Workflow\V2\Support\SurfaceStabilityContract` als prozessinterne Quelle, die der Server erneut exportiert.

Die Zulassung von Artefaktkanälen wird separat durch [`/public-artifact-release-policy.json`](pathname:///public-artifact-release-policy.json) geregelt. Diese unabhängig geprüfte Richtlinie bestimmt, welche 2.0-Kanäle zum kanonischen öffentlichen Tupel werden dürfen.

Eine Veröffentlichung, die eine unten aufgeführte Schnittstelle verändert, etwa Stabilitätsstufe, Feldmenge oder Regeln für inkompatible Änderungen, muss diese Seite, den JSON-Spiegel, das PHP-Manifest und alle paketspezifischen Stabilitätsdokumente gemeinsam aktualisieren. Die Dokumentations-CI validiert den maschinenlesbaren Vertrag, die Richtlinie zur Artefakt-Veröffentlichungsphase, veröffentlichte Rust-Metadaten soweit verfügbar und Worker-Protokollspezifikationen. Die redaktionelle Übereinstimmung dieser Seite mit dem Manifest bleibt eine ausdrückliche Aufgabe der Veröffentlichungsprüfung.

## Ergänzung: Katalog der Plattform-Protokollspezifikationen {#companion-platform-protocol-spec-catalog}

Diese Seite bestimmt, *welche* Schnittstellen öffentlich sind und *wie* sie sich ändern dürfen. Der zugehörige Katalog [Protokollspezifikationen der Plattform](/docs/platform-protocol-specs) bestimmt, *wo* die normative maschinenlesbare Spezifikation jeder Schnittstelle liegt, *welches Format* sie verwendet (OpenAPI für HTTP-APIs, JSON Schema für Objektfamilien, AsyncAPI für Ereignisstromsemantik), *welches Repository* sie verantwortet, welche Objektfamilien sie regelt und welche öffentliche URL das Artefakt auflöst. SDK-Autoren, Agenten und Operatoren sollten gegen den Spezifikationskatalog validieren, statt Prosa erneut auszuwerten oder repositorylokale Implementierungsdetails zu verwenden.

Der Katalog wird als `platform_protocol_specs` in `GET /api/cluster/info` ausgewiesen.

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

Jedes `surface_family` eines Katalogeintrags muss im obigen Vertrag existieren. Die CI der Dokumentationswebsite validiert den Katalog, löst jede öffentliche Spezifikations-URL auf und lehnt repositorylokale Autoritätsfelder ab.

<WorkerProtocolAuthorityRoles />

Jeder erforderliche Plattform-Protokollkatalogeintrag ist als `published` markiert. Der Eintrag für den aufrufbaren Träger bleibt `in_progress`. Jeder verfügbare Eintrag verlinkt direkt ein öffentliches OpenAPI-, AsyncAPI- oder JSON-Schema-Dokument. Das Schema [`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes) legt die Ermittlungsschnittstelle fest, von der aus alle anderen Katalogeinträge erreichbar sind.

## Stabilitätsstufen {#stability-levels}

Jede öffentliche Durable-Workflow-Schnittstelle trägt genau eine dieser Stabilitätsstufen. Die Stufen sind explizit: Eine nicht klassifizierte Schnittstelle ist nicht öffentlich.

| Stufe | Bedeutung | Wann inkompatible Änderungen erlaubt sind |
|-------|---------|-----------------------------------|
| `frozen` | Übertragungsformat oder gespeicherte Struktur, die während der gesamten Workflow-Lebensdauer gleich dekodiert werden muss. Umbenennen, Entfernen oder Umwidmen eines Feldes ist ein Protokollbruch und niemals eine Nebenversionsänderung. | Nur durch Einführung eines **parallelen Primitivs** mit neuem Typnamen. Die ursprüngliche Struktur bleibt unbegrenzt dekodierbar. |
| `stable` | Öffentliche Schnittstelle unter der Semver-Garantie der Plattform. Additive Änderungen erscheinen in Nebenversionen. | Nur in einer Hauptversion. |
| `prerelease` | Funktionsvollständige öffentliche Schnittstelle, die sich vor der entsprechenden Veröffentlichung `1.0.0` / `2.0.0` noch ändern darf. | In klar gekennzeichneten Vorabversionen, mit Hinweis in den Veröffentlichungshinweisen. |
| `experimental` | Öffentliche, aber instabile Schnittstelle. Änderungen sind in jeder Veröffentlichung einschließlich Patches möglich. Aufrufer müssen über das experimentelle Kennzeichen der Schnittstelle ausdrücklich zustimmen. | In jeder Veröffentlichung, mit Hinweis in den Veröffentlichungshinweisen. |

## Öffentliche Schnittstellenfamilien {#public-surface-families}

Dies ist die vollständige Liste öffentlicher Schnittstellenfamilien. Ergänzen, Entfernen oder Neuklassifizieren einer Familie erfordert eine Vertragsänderung: Versionserhöhung von `SurfaceStabilityContract`, diese Seite und der JSON-Spiegel im selben Commit.

| Familie | Stabilität | Maßgebliches Manifest in `/api/cluster/info` | Geltungsbereich |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | HTTP-API des eigenständigen Servers: Control-Plane-, Namespace-, Zeitplan- und Systemrouten sowie `/api/health`, `/api/ready`, `/api/cluster/info`. Die routenbezogene Version wird durch `control_plane.request_contract` und `control_plane.response.contract` bestimmt. Die übergeordnete Server-`version` ist die Build-Identität und nicht die maßgebliche Quelle der Clientkompatibilität. |
| `worker_protocol` | `stable` | `worker_protocol` | Worker-Plane-HTTP-API, mit der externe SDK-Worker sich registrieren, pollen, Heartbeats senden, Leases für Worker-Sitzungen verwalten und Workflow-, Aktivitäts- und Abfrageaufgaben abschließen oder fehlschlagen lassen. Umfasst die Laufzeitverträge `worker_sessions` und `local_activities`, `external_execution_surface_contract`, `external_executor_config_contract`, `invocable_carrier_contract`, `external_task_input_contract` und `external_task_result_contract`. |
| `cli_json` | `stable` | Nicht anwendbar (siehe CLI-Referenz) | Die von `dw` ausgegebenen Strukturen `--output=json` und `--output=jsonl`. JSON-Exit-Codes und JSON-Feldnamen sind die dauerhafte Schnittstelle. Die menschenlesbare Form `--output=table` ist Dokumentation, kein Vertrag. |
| `waterline_api` | `stable` | Nicht anwendbar (siehe Waterline-Operator-API) | Waterlines HTTP-API für Beobachtbarkeit unter `/waterline/api/v2/*`, der Engine-Quellvertrag und Dashboard-JSON-Strukturen. Waterline muss zur Hauptversion des Workflow-Pakets passen. |
| `mcp_discovery_results` | `stable` | Nicht anwendbar (siehe MCP-Workflows-Seite) | Die Model-Context-Protocol-Schnittstellen `/mcp/*` und die Ermittlungsdateien `llms.txt` / `llms-2.0.txt`. MCP-Werkzeugnamen, Parameterschemas und die Semantik von `payload_preview_limit_bytes` sind Vertragsbestandteil. Werkzeugbeschreibungen und Ermittlungshinweise dienen der Diagnose. |
| `official_sdks` | `stable` | `client_compatibility` | Die offiziellen SDKs: PHP `durable-workflow/sdk`, Python `durable_workflow` und Rust `durable-workflow`. Die CLI `dw` ist der offizielle Befehlsclient. Die öffentliche Schnittstelle jedes SDKs wird durch dessen paketspezifisches Stabilitätsdokument bestimmt, das dieser Seite untergeordnet sein muss. |
| `history_event_wire_formats` | `frozen` | Nicht anwendbar (eingefrorene Strukturen; siehe Workflow `docs/api-stability.md`) | Die gespeicherte Struktur jeder Zeile in `workflow_history_events` und `workflow_schedule_history_events`. Sobald ein Workflow ein Ereignis schreibt, muss jedes künftige SDK es mit derselben Feldmenge dekodieren können. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | Die durch `GET /api/cluster/info` selbst veröffentlichten Protokollmanifeste. Jedes verschachtelte Manifest trägt sein eigenes `schema` und seine eigene `version` und entwickelt sich nach eigenen Vertragsregeln. Die Hüllenschlüssel sind stabil. |

### Paketspezifische Stabilitätsdokumente {#per-package-stability-documents}

Diese Dokumente ergänzen paketbezogene Details unter den Regeln dieser Seite:

- `durable-workflow/workflow` (PHP): [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md). Maßgeblich für die PHP-Programmier-API, die serverseitigen Klassen `Support\*` und die eingefrorenen Tabellen der Übertragungsformate von Historienereignissen.
- `durable-workflow/sdk` (PHP): [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md). Maßgeblich für die frameworkneutrale API für entfernte Clients und Worker aus Packagist.
- `durable-workflow/server`: [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) und `docs/contracts/*`. Maßgeblich für Anfrage-/Antwortverträge des eigenständigen Servers.
- CLI `dw`: [`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference). Maßgeblich für JSON-Ausgabestrukturen und Exit-Codes.
- Python-SDK: `README.md` in `durable-workflow/sdk-python`. Maßgeblich für die öffentliche API des Pakets `durable_workflow`.
- Rust-SDK: `README.md` und `[package.metadata.durable-workflow]` in `durable-workflow/sdk-rust`. Maßgeblich für die öffentliche API der Crate `durable-workflow` und ihre Paketkompatibilitätserklärung.

## Veröffentlichungsregeln {#release-rules}

Diese Regeln gelten für jede obige öffentliche Schnittstellenfamilie. Sie sind im JSON-Spiegel unter `release_rules` wiedergegeben.

### Patchversionen {#patch-releases}

Erlaubt:
- Fehlerkorrekturen, die den dokumentierten Vertrag erhalten
- Dokumentationskorrekturen
- Abhängigkeitsupdates ohne Änderung der öffentlichen Schnittstelle
- Änderungen an als `experimental` markierten Schnittstellen

Verboten:
- Entfernen oder Umbenennen von Feldern, Routen, Befehlen oder Klassen mit `stable` oder `frozen`
- Einschränken akzeptierter Eingaben einer `stable`-Route oder eines `stable`-Befehls
- Ändern der Bedeutung eines bestehenden `stable`-Feldes

### Nebenversionen {#minor-releases}

Erlaubt:
- Ergänzen neuer Felder, Routen, Befehle oder Klassen einer `stable`-Schnittstelle
- Ergänzen neuer optionaler Parameter mit sicheren Standardwerten
- Ergänzen neuer Fähigkeitskennzeichen in Ermittlungsantworten
- Hochstufen einer `prerelease`- oder `experimental`-Schnittstelle auf `stable`

Verboten:
- Entfernen oder Umbenennen von Feldern, Routen, Befehlen oder Klassen mit `stable` oder `frozen`
- Ändern der Bedeutung eines bestehenden `stable`- oder `frozen`-Feldes

### Hauptversionen {#major-releases}

Erlaubt:
- Entfernen, Umbenennen oder Einschränken einer `stable`-Schnittstelle
- Erhöhen der erforderlichen `control_plane.version` oder `worker_protocol.version`
- Aufgeben eines zuvor unterstützten SDK- oder CLI-Versionsbereichs

Erforderlich:
- Ankündigung in Veröffentlichungshinweisen mindestens eine Nebenversion vor der Hauptversion
- soweit möglich, Auslieferung der neuen neben der alten Schnittstelle in einer vorhergehenden Nebenversion, damit Aufrufer vor der Hauptversion migrieren können
- Dokumentation des Migrationswegs im [Migrationsleitfaden](/docs/migration) vor der Veröffentlichung

## Ausschließlich diagnostische und garantierte Felder {#diagnostic-only-versus-guaranteed-fields}

Jedes Feld jeder `stable`- oder `frozen`-Schnittstelle ist entweder **garantiert** oder **ausschließlich diagnostisch**. Dafür gelten unterschiedliche Änderungsregeln:

- **Garantierte Felder** sind Teil des dokumentierten Vertrags. Erzeuger müssen sie weiterhin in der dokumentierten Struktur ausgeben. Verbraucher dürfen sich auf Vorhandensein und Bedeutung verlassen. Entfernen oder Umbenennen eines garantierten Feldes einer `stable`-Schnittstelle ist eine Hauptversionsänderung.
- **Ausschließlich diagnostische Felder** dienen menschlicher Fehlereinordnung, Fehlersuche und Beobachtbarkeit. Sie dürfen in jeder Nebenversion ergänzt, umbenannt oder entfernt werden. Überall, wo sie dokumentiert sind, müssen sie als `diagnostic_only: true` oder entsprechend auf der Dokumentationsseite gekennzeichnet sein. **Verbraucher dürfen diagnostische Felder in produktiver Entscheidungslogik weder auswerten noch speichern noch für Verzweigungen verwenden.**

Ältere Verbraucher müssen unbekannte additive Felder einer `stable`- oder `frozen`-Struktur ignorieren (Vorwärtskompatibilität). Unbekannte Pflichtfelder müssen zur sicheren Ablehnung führen. SDKs und CLIs veröffentlichen ihr eigenes Vorwärtskompatibilitätsverhalten in den paketspezifischen Stabilitätsdokumenten.

## Kompatibilitätsmatrix {#compatibility-matrix}

Dies ist die operative Kompatibilitätsmatrix. Sie hält fest, welche Clientversionen gegen welche Server-Protokollmanifeste validiert sind. Komponenten prüfen die Matrix zur Laufzeit über `GET /api/cluster/info` und lehnen sicher ab, wenn die Manifeste nicht übereinstimmen.

### Zuletzt qualifiziertes reproduzierbares Tupel {#last-qualified-reproducible-tuple}

Die Tabelle zeigt die für diese Dokumentation geprüfte stabile Kombination aus [`stable-releases.json`](/stable-releases.json). Jede Komponente wird unabhängig versioniert. Eine kompatible Kombination kann daher unterschiedliche Paketversionen enthalten. Veröffentlichungs- und Qualifizierungsberichte bewahren die genauen Versionen und Image-Digests jeder abgeschlossenen Prüfung auf.

| Komponente | Unterstützte Version | Installationsidentität |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Workflow-Engine | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Waterline-Operator | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| PHP-SDK | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| Python-SDK | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| Rust-SDK | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

PyPI stellt die Python-Distributionsversion als `%%artifact.pythonRegistryVersion%%` dar. Die dokumentierte PEP-440-Installationsschreibweise `%%artifact.pythonSdkVersion%%` löst dieselbe Veröffentlichung auf. Diese Normalisierung erzeugt keine zweite unterstützte Version.

Die gewählte Kombination wird nach Qualifizierung der betroffenen Verbraucher weitergeführt. Die veröffentlichten Serverregistries und generierten Schnellstarts verwenden die gewählten Artefakte. Pakete können unabhängig veröffentlicht werden. Ihre Kompatibilität wird über Protokollmanifeste, Fähigkeiten und Verbraucherprüfungen bestätigt.

Frühere Alpha- und Beta-Artefakte sind historisch. Sie sind keine alternativen Einstiegsoptionen. Der Veröffentlichungsverlauf bleibt erhalten.

Jede stabile Komponente folgt semantischer Versionierung. Additive Fähigkeiten dürfen in kompatiblen Veröffentlichungen erscheinen. Inkompatible öffentliche Änderungen erfordern eine Hauptversion. Prüfen Sie vor der Aktivierung einer Funktion über Laufzeitermittlung, welche Fähigkeiten Ihr installierter Server und Ihre Worker bereitstellen.

### Protokollkompatibilität zur Laufzeit {#runtime-protocol-compatibility}

Übergeordnete Paketversionen wählen die unterstützte Versionslinie. Laufzeit-Protokollmanifeste bieten eine zweite Prüfung mit sicherer Ablehnung:

| Client | Produktlinie | Control Plane | Worker-Protokollanforderung |
|--------|---------------|---------------|-------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | Nicht anwendbar |
| PHP-SDK | `%%artifact.phpSdkVersion%%` | `2` | `1.13` |
| Python-SDK | `%%artifact.pythonSdkVersion%%` | `2` | `1.1` |
| Rust-SDK | `%%artifact.rustSdkVersion%%` | `2` | `1.2` |

Der aktuell veröffentlichte Server weist die Worker-Protokollversion aus der obigen Tabelle der Autoritätsrollen aus. Er akzeptiert Anfrageheader derselben Hauptversion mit einer Nebenversionsnummer kleiner oder gleich der ausgewiesenen Nebenversionsnummer und gibt dann die ausgewiesene Version zurück. Fehlende oder fehlerhafte Header, andere Hauptversionen und höhere Worker-Nebenversionen als beim Server werden sicher abgelehnt. Die CLI validiert `control_plane.version: "2"`.

Die übergeordnete Server-`version` ist die Build-Identität. Clients müssen für die Protokollaushandlung die von `GET /api/cluster/info` zurückgegebenen Manifeste `control_plane`, `worker_protocol`, `client_compatibility` und `surface_stability_contract` verwenden.

Workflow und Waterline müssen kompatible 2.x-Versionen verwenden. Laufzeitermittlung und Paketbedingungen bilden nach der stabilen Veröffentlichung die Kompatibilitätsgrenze.

### Beispiele zur Laufzeitvalidierung {#runtime-validation-examples}

Die SDKs validieren die Ermittlung vor der Worker-Registrierung. Ein inkompatibler Server erzeugt einen expliziten Kompatibilitätsfehler, statt einen alten Vorabversionspfad zu versuchen. Alle Worker-Anfragen senden `X-Durable-Workflow-Protocol-Version`. Control-Plane-Anfragen senden `X-Durable-Workflow-Control-Plane-Version: 2`.

Bevor eine Produktlinie hochgestuft wird, muss die Veröffentlichungsqualifizierung auf einer sauberen Maschine beginnen, ausschließlich die oben genannten veröffentlichten Artefakte installieren und die PHP-, Python- und Rust-Konformitätswege abschließen. Quellcode-Checkouts und unveröffentlichte Ersatzartefakte zählen nicht als Nachweis für öffentliche Artefakte.

Stabile Paketmetadaten und Laufzeitermittlung definieren jetzt die unterstützte 2.x-Kompatibilitätsgrenze. Die Veröffentlichungsqualifizierung installiert öffentliche Artefakte weiterhin vor der Veröffentlichung gemeinsam. Patch- und Nebenversionen folgen den folgenden Regeln semantischer Versionierung.

### Fortschreibung von Veröffentlichungen {#release-progression}

Patchversionen erhalten dokumentierte stabile Verträge. Nebenversionen dürfen Felder, Routen, Befehle, Klassen oder optionale Parameter mit sicheren Standardwerten ergänzen. Inkompatible stabile Änderungen erfordern eine Hauptversion und einen dokumentierten Migrationsweg. Eingefrorene Historienereignisstrukturen bleiben unbegrenzt dekodierbar. Neue Strukturen verwenden ein paralleles Primitiv, statt ein bestehendes Ereignis zu verändern.

Jede Veröffentlichung muss Paketmetadaten, Veröffentlichungshinweise, Installationsbefehle und sprachübergreifende Beispiele synchron halten.

### Prüfliste für Veröffentlichungen {#release-review-checklist}

- Bestätigen, dass der maschinenlesbare Kompatibilitätsvertrag mit dem Workflow-Manifest zur Schnittstellenstabilität übereinstimmt.
- Bestätigen, dass jede gewählte SDK-Version gegen den gewählten Server besteht.
- Bestätigen, dass Installationsbeispiele den stabilen Veröffentlichungskanal verwenden.
- Bestätigen, dass Paketmetadaten die genaue SDK-Veröffentlichung und Protokollversionen identifizieren. Spätere Serverqualifizierung im Kompatibilitätsnachweis festhalten.
- Bestätigen, dass die Konformitätsprüfung veröffentlichter Artefakte auf einer sauberen Maschine für PHP, Python und Rust besteht.
- Bestätigen, dass Veröffentlichungshinweise Ergänzungen nach der Ausgangsbasis beschreiben und ältere Vorabversionen nicht als unterstützte Optionen darstellen.

## Siehe auch {#see-also}

- [Servereinrichtung](/docs/polyglot/server): Bereitstellung des eigenständigen Servers
- [Server-API-Referenz](/docs/polyglot/server-api-reference): `GET /api/cluster/info` und die Protokollmanifeste
- [PHP-SDK](/docs/polyglot/php): PHP-Client und -Worker
- [Python-SDK](/docs/polyglot/python): Python-Client und -Worker
- [Rust-SDK](/docs/polyglot/rust): Rust-Client und -Worker
- [CLI](/docs/polyglot/cli): Befehlszeilenschnittstelle
- [Migrationsleitfaden](/docs/migration): Migration von v1 zu v2
- [PHP-Workflow `docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md): paketspezifische Stabilität des PHP-Workflow-Pakets
