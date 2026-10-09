---
sidebar_position: 2
title: Bereitstellungsmodelle
description: Wählen Sie den Dienstmodus mit Durable Workflow Cloud oder einem selbst betriebenen Server oder betten Sie die Laufzeitumgebung in Laravel ein.
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - Durable Workflow Bereitstellungsmodelle
  - eingebetteter Modus
  - Dienstmodus
  - Durable Workflow Cloud
  - eigenständiger Server
  - Cloud und Selbstbetrieb
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Bereitstellungsmodelle {#deployment-modes}

<ProductPromotion source="docs-v2-deployment-modes">
Nutzen Sie den verwalteten Dienstmodus für PHP-, Python- oder Rust-Worker, ohne die Orchestrierung selbst zu betreiben.
</ProductPromotion>

Durable Workflow v2 bietet zwei Bereitstellungsmodelle:

- **Dienstmodus:** Anwendungen und Worker verbinden sich über SDKs mit einer entfernten Laufzeitumgebung. Wählen Sie [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/) oder einen [selbst betriebenen Server](/docs/polyglot/server/).
- **Eingebetteter Modus:** Eine Laravel-Anwendung installiert `durable-workflow/workflow` und betreibt die Laufzeitumgebung direkt.

Cloud und selbst betriebener Server sind Alternativen innerhalb des Dienstmodus. In Cloud übernimmt Durable Workflow Orchestrierung und Speicherung. Kunden betreiben SDK-Clients und Worker. Cloud enthält Managed Waterline. **Cloud-Kunden installieren, betreiben oder verbinden keinen eigenen Server oder Waterline-Dienst.** Ein selbst betriebener Server enthält Waterline nicht. Betreiber können Waterline separat für einen Namespace dieses Servers bereitstellen.

Nutzen Sie diese Seite, um Verantwortlichkeiten für eine Workflow-Flotte zu wählen, eine Umstellung zu planen oder gemeinsame Produktverträge beider Modelle festzuhalten.

Laravel-Teams finden im [Leitfaden zur Laravel-Einführung und zum Wechsel der Laufzeitumgebung](/docs/laravel-adoption/) die Wege von v1 zu v2 und vom eingebetteten Modus zum Dienstmodus, einschließlich der veröffentlichten PHP-SDK-Brücke und ihres Laravel-Test-Fakes.

## Eine Laufzeitumgebung im Dienstmodus wählen {#choose-a-service-mode-runtime}

| Laufzeitumgebung | Betrieb des dauerhaften Zustands | Was Ihr Team betreibt | Einstieg |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow betreibt den verwalteten Namespace, Speicherung, Upgrades, Dienstendpunkt und Managed Waterline. | Anwendungsclients und PHP-, Python- oder Rust-Worker mit bereitgestellten Zugangsdaten. Kein Server und kein separater Waterline-Dienst. | [Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane/) |
| Selbst betriebener Server | Ihr Team übernimmt Bereitstellung, Absicherung, Skalierung, Sicherungen und Upgrades von Server und Speicher. | Server, Anwendungsclients und PHP-, Python- oder Rust-Worker. Optional Waterline als separater Dienst für einen Server-Namespace. | [Selbst betriebener Server](/docs/polyglot/server/) |

Beide verwenden dasselbe Client- und Worker-Modell. Sie unterscheiden sich in Betriebsverantwortung und Zugangsdaten. Der Workflow-Code folgt demselben Modell.

## Gemeinsames dauerhaftes Modell, unterschiedliche Grenzen {#same-durable-model-different-boundary}

Der eingebettete Modus und der Dienstmodus verwenden denselben v2-Kern. Hosting, Authentifizierung und Transport bilden unterschiedliche Grenzen darum. Im Dienstmodus liegt derselbe Kern hinter HTTP+JSON-Steuerungs- und Worker-Schnittstellen. Es gibt keine Pflicht zu gRPC und keine zweite Engine.

| Bereich | Eingebetteter Modus | Dienstmodus | In beiden Modellen stabil |
| --- | --- | --- | --- |
| Dauerhaftes Workflow-Modell | Die Laravel-Anwendung betreibt das Paket direkt und speichert Workflow-Zustand in ihrer Laufzeitumgebung. | Cloud oder ein selbst betriebener Server verwaltet den Zustand hinter der Dienst-API. | Workflow- und Laufkennungen, typisierte Historie, Befehlsergebnisse, Wiederholungsversuche, Reparatur und Historienexport folgen demselben v2-Vertrag. |
| Steuerung | Starts und Befehle kommen aus Anwendungscode, `WorkflowStub` oder lokalen Betriebswerkzeugen. | Starts und Befehle gehen über Server-API, CLI oder SDKs mit expliziter Authentifizierung und Protokollheadern. Frameworkunabhängige PHP-Clients verwenden `DurableWorkflow\Client` aus `durable-workflow/sdk`. | Regeln für doppelte Starts, Laufauswahl, Befehlskennungen und benannte Ergebnisse bleiben gleich. Folgebefehle gehen an die Laufzeitumgebung, die den Start angenommen hat. |
| Worker-Transport | Laravel-Queue-Worker führen Aufgaben innerhalb der Anwendung aus. | Worker registrieren sich, warten per Long Poll, senden Heartbeats und melden Ergebnisse über HTTP+JSON. Entfernte PHP-Worker verwenden `DurableWorkflow\Worker` aus `durable-workflow/sdk`. | Aufgaben-Leases, Kompatibilitätsmarker, Replay und mindestens einmal ausgeführte Aktivitäten bleiben gleich. |
| Standard-Aufgabenzustellung | Aufgaben gehen normalerweise innerhalb der Anwendung an die Laravel-Queue. | Externe Worker finden Aufgaben über HTTP-Polling. Betreiber eines selbst betriebenen Servers können diesen Standard explizit ändern. | Der Lebenszyklus bereit/geleast/Reparatur und das dauerhafte Aufgabenmodell bleiben gleich. |
| Workflow- und Aktivitätstypen | PHP-Aliasse können lokale Klassen der Anwendung auflösen. | Worker melden unterstützte Typkennungen bei der Registrierung. | Öffentliche Typkennungen bleiben stabil und sprachunabhängig. Vollqualifizierte PHP-Klassennamen oder gespiegelte PHP-Platzhaltertypen dürfen nicht zum öffentlichen Vertrag werden. |
| Betriebsoberfläche | Das eingebettete Waterline-Paket oder lokale Werkzeuge lesen den Anwendungszustand im Prozess. | Cloud stellt Managed Waterline für den Namespace bereit. Im Selbstbetrieb kann Waterline separat angeschlossen werden. Auch Dienst-APIs, CLI und SDKs lesen den Laufzeitzustand. | Suchattribute, Memos, Laufstatus, Warteschlangendiagnosen und Historienexport bleiben dauerhafte Fakten der zuständigen Laufzeitumgebung. Waterline führt Laufzeitumgebungen oder Namespaces nicht zusammen. |
| Authentifizierung und Mandantengrenze | Die Laravel-Anwendung bestimmt die Authentifizierung ihrer Routen und Sitzungen. | Namespace-Auswahl sowie Server-Tokens oder Signaturen sind verbindliche API-Grenzen. | Namespace-Namen, Aufgabenwarteschlangen, Kompatibilitätsmarker und der feste Avro-Payload-Vertrag bleiben bei einer Umstellung stabil. |
| Erkennung der Laufzeitumgebung | Die Anwendung löst Dienste im Prozess oder über lokale Konfiguration auf. | Clients und Worker verwenden eine explizite entfernte Basis-URL. | Koppeln Sie die Modelle nicht an gemeinsame `APP_URL`- oder `APP_KEY`-Werte, localhost-Annahmen oder Erkennung im selben Container. |
| Migration | Bestehende eingebettete Läufe bleiben dort, wo sie gestartet wurden. | Neue Dienstläufe starten in der gewählten Cloud- oder Server-Laufzeitumgebung und bleiben dort. | Es gibt keine automatische Live-Migration laufender Workflows zwischen den Modellen. Export dient Prüfung und Fehlersuche, nicht dem Import laufenden Zustands. |

## Wann der eingebettete Modus passt {#choose-embedded-mode-when}

- Ihre Laravel-Anwendung vereint Workflow-Code, Worker-Ausführung und Betriebszugriff in einer Bereitstellung.
- Das vorhandene Queue- und Authentifizierungsmodell bildet die passende Grenze.
- Sie möchten eine kleine, eigenständige Laufzeitumgebung ohne sprachunabhängiges Worker-Protokoll.
- Waterline oder Werkzeuge der Host-Anwendung bilden Ihre primäre Betriebsoberfläche.

Beginnen Sie mit der [eingebetteten Installation](/docs/installation/) und der [Dokumentation des eingebetteten Modus](/docs/category/embedded/), einschließlich der Konfiguration.

## Wann der Dienstmodus passt {#choose-service-mode-when}

- Mehrere Anwendungen oder Teams sollen eine Workflow-Laufzeitumgebung nutzen.
- Worker, Steuerungsclients oder Betriebswerkzeuge verwenden weitere Sprachen neben Laravel/PHP.
- Sie benötigen eine explizite entfernte Authentifizierungs- und Namespace-Grenze zwischen Clients und Engine.
- Sie möchten API-Zugriff, Aufgabenzuordnung und Worker innerhalb der unterstützten [Server-Rollentopologie](/docs/polyglot/server-role-topology) unabhängig skalieren.
- Im Selbstbetrieb möchten Sie Waterline als Beobachtungsdienst für einen Server-Namespace bereitstellen. Cloud enthält Managed Waterline.

Für eine verwaltete Laufzeitumgebung beginnen Sie mit [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/). Für den Selbstbetrieb nutzen Sie [Server](/docs/polyglot/server/) und [Selbst gehostete Bereitstellungen](/docs/deployment/). Wählen Sie dann das [PHP-SDK](/docs/polyglot/php/), [Python-SDK](/docs/polyglot/python/) oder [Rust-SDK](/docs/polyglot/rust/). Cloud-Nutzer verwenden Managed Waterline. Im Selbstbetrieb helfen die [Server-API-Referenz](/docs/polyglot/server-api-reference/) und [Monitoring](/docs/monitoring#waterline-service) beim Bereitstellen eines separaten Waterline-Dienstes.

## Migration zum selbst betriebenen Dienstmodus {#migration-tooling-to-self-hosted-service-mode}

Der unterstützte Wechsel erfolgt schrittweise. Bereits laufender Zustand wird nicht live übergeben:

- Folgen Sie der [Migration vom eingebetteten Modus zum Server](/docs/polyglot/embedded-to-server).
- Prüfen Sie mit `GET /api/cluster/info` Server-Build, Topologie und Funktionsvertrag, bevor Sie Datenverkehr umstellen.
- Prüfen Sie mit `POST /api/worker/register` und dem Worker-Protokoll, ob externe Worker die gewählten stabilen Typkennungen ausführen können.
- Prüfen Sie mit `GET /api/system/operator-metrics`, `dw worker:list` oder Waterline die Worker-Registrierung und kompatible Flottenabdeckung, bevor Sie Produktionsverkehr verlagern.
- Nutzen Sie [Client- und Worker-Funktionen](/docs/polyglot/cli-python-parity/), wenn Sie lokale Steuerungsaufrufe durch Server-Automatisierung ersetzen.
- Verwenden Sie Cloud Managed Waterline, eine an den selbst betriebenen Server angeschlossene Waterline-Instanz oder den Server-Historienexport für Prüfung und Fehlersuche. Exportdateien importieren keine laufenden Server-Workflows.

Drei Regeln sind verbindlich:

1. Bestehende Läufe bleiben in der Laufzeitumgebung, in der sie gestartet wurden.
2. Neue Dienstläufe verwenden vom ersten Umstellungsschritt an stabile Typkennungen, Namespace-Namen, Aufgabenwarteschlangen und den festen Avro-Payload-Vertrag.
3. Signale, Abfragen, Updates, Reparatur, Abbruch, Terminierung und Archivierung gehen an die Laufzeitumgebung des jeweiligen Laufs.

## Weitere Referenzen {#related-references}

- [Installation](/docs/installation)
- [Server](/docs/polyglot/server)
- [PHP-SDK](/docs/polyglot/php)
- [Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane)
- [Migration vom eingebetteten Modus zum Server](/docs/polyglot/embedded-to-server)
- [Server-Rollentopologie](/docs/polyglot/server-role-topology)
- [Server-Konfigurationsreferenz](/docs/polyglot/server-config-reference)
