---
sidebar_position: 1
description: Wählen Sie Durable Workflow Cloud, einen selbst betriebenen Server oder die Einbettung in Laravel und schließen Sie einen ersten Workflow mit einem offiziellen SDK ab.
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - sprachübergreifende Workflow-Engine
  - Workflow-Engine für KI-Agenten
  - dauerhafte Orchestrierung
  - Workflow-Konzepte v2
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Einführung {#introduction}

Durable Workflow 2.0 speichert den Zustand und die Historie von Workflows außerhalb kurzlebiger Anwendungsprozesse. So können PHP-, Python- und Rust-Worker nach einem Neustart sicher fortfahren. Beginnen Sie beim ersten Besuch mit dem [Schnellstart](/docs/quickstart/). Er führt einen Workflow bis zum Zustand `completed`, bevor Sie den umfangreicheren [Funktionsindex](/docs/capabilities/) lesen.

## Ein Bereitstellungsmodell wählen {#choose-a-deployment-model}

### Dienstmodus {#service-mode}

Anwendungen greifen über die offiziellen SDKs auf eine entfernte Laufzeitumgebung zu. Wählen Sie, wer sie betreibt:

- **[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)** ist das verwaltete Angebot. Durable Workflow übernimmt Orchestrierung, dauerhafte Speicherung und Managed Waterline. Ihr Team betreibt SDK-Clients und Worker für den bereitgestellten Namespace. **Cloud-Nutzer installieren oder betreiben weder Durable Workflow Server noch einen separaten Waterline-Dienst.**
- **[Ein selbst betriebener Server](/docs/polyglot/server/)** bietet dieselbe Dienstschnittstelle. Ihr Team übernimmt Bereitstellung, Absicherung, Skalierung, Sicherungen und Upgrades. Bei Bedarf betreiben Sie Waterline als separaten Beobachtungsdienst für einen Namespace dieses Servers.

Beide Angebote verwenden dieselbe versionierte HTTP+JSON-Steuerungsschnittstelle, dasselbe Worker-Protokoll, dasselbe Namespace-Modell und dasselbe sprachunabhängige Payload-Format. Die [Bereitstellungsmodelle](/docs/polyglot/deployment-modes/) erklären die jeweiligen Verantwortlichkeiten.

### Einbettung in Laravel {#embedded-laravel}

Der eingebettete Modus richtet sich an Laravel-Anwendungen, die Workflow-Zustand, Warteschlangen, Konfiguration und Betriebswerkzeuge in ihrer eigenen Infrastruktur halten möchten. Er installiert `durable-workflow/workflow`, verbindet sich nicht mit Cloud und benötigt keinen separaten Server. Das eingebettete Waterline-Paket liest den anwendungseigenen Zustand direkt im Prozess.

Beginnen Sie mit der [eingebetteten Installation](/docs/installation/), wenn Sie dieses Modell bewusst wählen.

Laravel-Teams, die von der stabilen Version 1 kommen oder eine bestehende eingebettete 2.0-Bereitstellung überprüfen, können mit dem [Leitfaden zur Laravel-Einführung und zum Wechsel der Laufzeitumgebung](/docs/laravel-adoption/) die ausführbaren eingebetteten Beispiele und den PHP-SDK-Weg vergleichen, bevor sie Datenverkehr umstellen.

## Ein SDK für den Dienstmodus wählen {#choose-a-service-mode-sdk}

- **[PHP-SDK](/docs/polyglot/php/):** Installieren Sie `durable-workflow/sdk` in einer frameworkunabhängigen PHP-Anwendung oder einem entfernten Worker.
- **[Python-SDK](/docs/polyglot/python/):** Schreiben Sie deterministische Workflows und Aktivitäten und nutzen Sie den asynchronen Steuerungsclient. Die <PythonPackageReleaseLink authority="qualified">stabile Python-Version</PythonPackageReleaseLink> steht im selben maschinenlesbaren Versionsmanifest wie der Server-Schnellstart.
- **[Rust-SDK](/docs/polyglot/rust/):** Schreiben Sie deterministische Workflows und Aktivitäten und betreiben Sie native Worker-Dienste.

Alle drei sind offizielle Implementierungen derselben öffentlichen Dienstschnittstelle. Der Leitfaden [Client- und Worker-Funktionen](/docs/polyglot/cli-python-parity/) zeigt unterstützte Funktionen und bewusste Unterschiede zwischen den Clients und Workern.

## Einen ersten Workflow abschließen {#your-first-completed-workflow}

Der [Schnellstart](/docs/quickstart/) nennt zuerst Ziel, Laufzeitumgebung, Voraussetzungen, Zeitbedarf und erwartetes Ergebnis. PHP, Python und Rust stehen gleichberechtigt zur Wahl. Es wird jeweils nur ein ausführbarer Sprachpfad angezeigt. Der lokale, selbst betriebene Weg verwendet veröffentlichte Pakete und Images ohne Quellcode-Checkout. Für einen verwalteten Namespace nutzen Sie die Cloud-Verbindungsdaten, ohne einen Server zu betreiben.

## Die Bestandteile des Dienstmodus {#how-service-mode-fits-together}

Eine Bereitstellung im Dienstmodus besteht aus drei Teilen:

- **Die Laufzeitumgebung** verwaltet dauerhaften Zustand, Befehle und Historie, Aufgabenzuordnung, Timer, Zeitpläne, Namespaces und authentifizierte Protokolle. Für verwaltete Namespaces übernimmt Cloud den Betrieb. Beim Selbstbetrieb ist Ihr Team zuständig.
- **Anwendungs-Worker** führen Workflow- und Aktivitätscode über das PHP-, Python- oder Rust-SDK aus. Sie können zusammen mit der Anwendung oder als eigenständige Dienste bereitgestellt und unabhängig von der Laufzeitumgebung skaliert werden.
- **Clients und Betriebswerkzeuge** starten, prüfen und steuern denselben Laufzeitzustand über SDK-Clients, die `dw`-CLI, HTTP-APIs, maschinenlesbare Schemas, Waterline und Agentenschnittstellen.

## Ein öffentlicher Vertrag für dauerhafte Ausführung {#one-public-durable-execution-contract}

Die offiziellen SDKs verwenden registrierte Zeichenketten als Workflow- und Aktivitätstypnamen sowie ein gemeinsames öffentliches Payload-Format. Dieses kennzeichnet den Codec und enthält portable Werte statt PHP-Serialisierung, Python-Pickles oder Rust-Implementierungstypen.

Workflow-Worker rekonstruieren Entscheidungen aus dauerhaft gespeicherten Befehlen und Historieneinträgen. Eingaben und Ergebnisse von Aktivitäten und untergeordneten Workflows können Sprachgrenzen überqueren, wenn die Worker denselben öffentlichen Codec unterstützen und passende Typnamen registrieren. Prüfen Sie den [Funktionsindex](/docs/capabilities/) und die Fähigkeitenerkennung der Laufzeitumgebung, bevor Sie eine bestimmte SDK-Funktion voraussetzen.

## Die passenden Beispiele verwenden {#learn-from-the-matching-examples}

- **Dienstmodus und mehrere Sprachen:** Nutzen Sie den [Schnellstart](/docs/quickstart/) und den PHP-, Python- oder Rust-SDK-Leitfaden.
- **Einbettung in Laravel:** Die [Beispielanwendung](/docs/sample-app/) zeigt Laravel-spezifische Workflow-Muster und deren Darstellung in Waterline.

Die eingebettete Beispielgalerie richtet sich an Laravel-Nutzer. Für Cloud und den selbst betriebenen Dienstmodus beginnt der passende Weg beim Schnellstart.

## Ein Vertrag für Agenten und Menschen {#agent-operable-by-contract}

Menschen und autonome Agenten verwenden denselben maschinenlesbaren Vertrag. Der überprüfbare Ablauf lautet **Erkennen -> Ändern -> Ausführen -> Diagnostizieren -> Reparieren**. Dazu gehören Versions- und Funktionsmanifeste, explizite Workflow-Befehle, strukturierte Ergebnisse, typisierte Historie, Worker- und Warteschlangendiagnosen, sichere Änderungen und eine anschließende Prüfung. Lesen Sie den [Betriebsablauf für Agenten](/docs/agent-operating-loop/) und die [Bewertung für KI-Agenten](/docs/ai-agent-workflow-engine/).

## Brauchen Sie einen Workflow? {#do-you-need-a-workflow}

Ein Workflow ist wahrscheinlich sinnvoll, wenn:

- der Prozess Minuten, Stunden oder Tage dauert
- Sie auf eine menschliche Freigabe warten müssen
- Sie auf einen Webhook oder ein anderes externes Ereignis warten müssen
- Sie pausieren und später fortfahren möchten, ohne einen Prozess laufen zu lassen
- Sie nach einem Absturz fortfahren müssen, ohne Fehler oder doppelte Arbeit zu verursachen

Für „fünf Queue-Jobs nacheinander ausführen und beim ersten Fehler abbrechen“ reicht meist eine Job-Kette. Durable Workflow eignet sich für Prozesse, bei denen der nächste Schritt von einem externen Ereignis, einer Wartezeit oder einer vorab unbekannten Entscheidung abhängt.
