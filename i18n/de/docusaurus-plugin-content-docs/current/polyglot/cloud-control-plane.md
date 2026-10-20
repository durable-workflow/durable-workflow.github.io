---
sidebar_position: 3
title: Verwaltete Cloud-Laufzeitumgebung
description: Cloud-Pläne, gemessene Workflow-Kapazität, Abrechnung und Verfügbarkeit vergleichen und PHP-, Python- oder Rust-Worker mit einem verwalteten Namespace verbinden.
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - Namespace-Laufzeit-URL
  - Laufzeit-Zugangsdaten
  - kundenseitig betriebene Worker
  - private Vernetzung
  - verwaltete Laufzeitumgebung in einer Region
  - verwaltete Laufzeitumgebung in mehreren Regionen
---

# Verwaltete Cloud-Laufzeitumgebung {#cloud-managed-runtime}

Durable Workflow Cloud ist ein verwalteter Orchestrierungsdienst. Cloud betreibt
sowohl die gehostete Control Plane als auch die Orchestrierungslaufzeit,
einschließlich Workflow-Zustand, Historie, Zeitplänen, Task-Warteschlangen,
Leases und dauerhafter Einsicht. Kunden betreiben SDK-Clients und -Worker gegen
einen bereitgestellten Cloud-Namespace.

Dies ist vom Selbsthosting getrennt. Ein selbst gehosteter Durable Workflow
Server läuft unabhängig und wird niemals an Cloud angeschlossen.

## Pläne und Preise {#plans-and-pricing}

Sie zahlen für bereitgestellte Kapazität, nicht für Workflow-Semantik. Jeder
Namespace erhält eine isolierte verwaltete Laufzeitumgebung. Ihre PHP-, Python-
und Rust-Worker laufen in Ihrer eigenen Umgebung. Aktuelle
Bereitstellungsverfügbarkeit zeigen [Cloud-Preise](https://cloud.durable-workflow.com/pricing)
und das Dashboard.

Cloud Dev ist jetzt verfügbar. Die vier HA-Pläne werden qualifiziert und können
noch nicht gekauft oder bereitgestellt werden. Ihre unten genannten Preise,
Kapazitäten, Verfügbarkeit und SLA-Bedingungen sind geplant, keine aktuellen Kaufangebote.

| Plan | Laufzeitkapazität | Enthaltener dauerhafter Speicher | Verfügbarkeit | Preis (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 GB RAM | 5 GB | Ein Host, kein SLA | $0.075/Stunde, $2 Mindestbetrag je aktivem Monat, $50/Monat Obergrenze |
| Cloud Standard | 1 vCPU, 2 GB RAM | 25 GB | Geplante HA in einer Region, 99.99% SLA | $0.45/Stunde, $10 Mindestbetrag je aktivem Monat, $300/Monat Obergrenze |
| Cloud Multi-Region | 1 vCPU, 2 GB RAM | 25 GB | Geplante HA über mehrere Regionen, 99.99% SLA | $0.60/Stunde, $15 Mindestbetrag je aktivem Monat, $400/Monat Obergrenze |
| Cloud Business | 4 vCPU, 8 GB RAM | 100 GB | Geplante HA in einer Region, 99.99% SLA | $2.25/Stunde, $50 Mindestbetrag je aktivem Monat, $1,500/Monat Obergrenze |
| Cloud Business Multi-Region | 4 vCPU, 8 GB RAM | 100 GB | Geplante HA über mehrere Regionen, 99.99% SLA | $3.00/Stunde, $75 Mindestbetrag je aktivem Monat, $2,000/Monat Obergrenze |

Kapazität umfasst verwaltete Laufzeitkomponenten, nicht die Rechenleistung Ihrer
Worker. Bei geplanten HA-Plänen sind Replikation und Standby-Kapazität im Preis
enthalten. Die Tabelle addiert Replikate nicht als zusätzliche
Workflow-Ausführungskapazität. Jeder Plan enthält Managed Waterline,
grundlegende verschlüsselte Sicherungen, Upgrades und eine stabile Laufzeit-URL.

Bereitgestellte Laufzeitumgebungen werden nach Laufzeitdauer abgerechnet, von
Aktivierung bis Stilllegung minutengenau gemessen. Mindestbeträge und
Obergrenzen gelten je Laufzeitkauf in einem UTC-Kalendermonat. Ungenutzte
bereitgestellte Zeit ist kostenpflichtig. Ein Monat ohne bereitgestellte Zeit
hat keine Laufzeitkosten. Ein neuer Kauf hat eigene Mindest- und Höchstbeträge.
Dienstseitige Reparatur oder Wiederherstellung setzt sie nicht zurück. Stripe
stellt aufgelaufene Nutzung monatlich in Rechnung. Preise verstehen sich
zuzüglich gegebenenfalls anfallender Steuern.

Speicher ist auf die enthaltene Zuteilung begrenzt. Es gibt keine separat
käuflichen Speichererweiterungen, automatische Speichervergrößerung oder
Speicher-Mehrverbrauchsgebühren. [Fordern Sie einen größeren Laufzeitplan an](https://cloud.durable-workflow.com/contact),
bevor Sie die Grenze erreichen. Der alleinige Wechsel von einer zu mehreren
Regionen erhöht den Speicher nicht. Ein Kapazitätsupgrade erfordert eine
tatsächliche Laufzeitänderung, nicht nur eine Abrechnungsänderung, und wird
derzeit mit Support vereinbart. Netzwerknutzung wird gemessen, derzeit nicht
berechnet und ist nicht unbegrenzt.

Wählen Sie einen Plan über [Cloud-Preise](https://cloud.durable-workflow.com/pricing).
Für größere Kapazität, andere Vernetzung, SSO, Unternehmenssupport oder eigene
Verfügbarkeitsanforderungen [kontaktieren Sie uns](https://cloud.durable-workflow.com/contact).

## Grenze des verwalteten Dienstes {#managed-service-boundary}

Die kundensichtbare Grenze ist ein Cloud-Namespace:

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud verantwortet Namespace-Bereitstellung, Laufzeitbetrieb, Persistenz,
Platzierung, Laufzeitzustand, Wiederherstellung und Managed Waterline für den
Namespace. Kunden verantworten Anwendungscode, Workflow- und
Aktivitätsimplementierungen sowie ihre Worker-Prozesse. Cloud-Kunden stellen
keinen separaten Waterline-Dienst bereit.

Der HTTPS-Endpunkt des Namespace verbindet direkt mit seiner verwalteten
Laufzeitumgebung. SDK-Verkehr wird nicht durch die Cloud-Website-/Control-Plane-Anwendung
geleitet. Verwenden Sie die zurückgegebene Laufzeit-URL unverändert ohne
angehängtes `/api`. SDK und CLI bauen ihre API-Pfade selbst. Verwaltungs-API-Aufrufe
verwenden weiterhin `https://cloud.durable-workflow.com/api/v1`.

Cloud-Verwaltung und Laufzeitverkehr verwenden unterschiedliche Zugangsdaten:

- Ein Cloud-API-Schlüssel (`dwc_...`) verwaltet Projekte, Umgebungen,
  Namespaces, Abrechnung und den Lebenszyklus von Laufzeit-Zugangsdaten.
- Client-Laufzeit-Zugangsdaten (`dwr_...`) starten und steuern Workflows in
  einem verwalteten Namespace.
- Worker-Laufzeit-Zugangsdaten (`dwr_...`) registrieren Worker, fragen Tasks
  per Long Polling ab, senden Heartbeats und schließen Arbeit in diesem Namespace ab.

Ein Cloud-API-Schlüssel wird an der Namespace-Laufzeit-URL nicht angenommen.
Laufzeit-Zugangsdaten gelten für einen Namespace und eine Rolle, werden nur
bei Erstellung zurückgegeben und fehlen in späteren Listen- und Audit-Antworten.

Verwendet der Cloud-Einstieg die CLI, installieren Sie sie nach dem
[CLI-Leitfaden](./cli.mdx) und aktualisieren Sie eine bestehende eigenständige
Installation explizit mit `dw upgrade`. Die CLI aktualisiert sich niemals im
Hintergrund. Führen Sie nach Installation oder Upgrade `command -v dw` und
`dw --version` aus. Beheben Sie Hinweise zum Installer-`PATH`, bevor Sie
Cloud-Zugangsdaten verwenden, damit das gewählte Release die aktive Binärdatei ist.

## Einen Namespace bereitstellen und verbinden {#provision-and-connect-a-namespace}

### 1. Namespace erstellen und bereitstellen {#1-create-and-provision-the-namespace}

Erstellen Sie im [Cloud-Dashboard](https://cloud.durable-workflow.com/) eine
Organisation, ein Projekt, eine Umgebung und einen Namespace. Wählen Sie dann
seinen Kapazitätsplan. Das Erstellen eines Kontos oder einer Namespace-Definition
stellt keine kostenpflichtige Kapazität bereit. Schließen Sie die
Zahlungseinrichtung über Stripe ab und wählen Sie auf der Namespace-Seite
**Bereitstellen (Provision)**. Das bloße Hinzufügen einer Karte startet die
Bereitstellung nicht.

Bereitstellung ist asynchron. Die Namespace-Seite aktualisiert den Fortschritt,
während Cloud die Laufzeitumgebung vorbereitet. Warten Sie vor SDK-Arbeit auf
den aktiven Zustand. Die Seite bietet außerdem die Erstellung von
Laufzeit-Zugangsdaten und Managed-Waterline-Zugriff zur Inspektion von Workflows
und ihrer Historie.

Schließen Sie bei API-gesteuerter Einrichtung zuerst die Zahlungseinrichtung ab.
Das folgende Beispiel verwendet den Standardplan der Organisation.
`capacity_plan_version` kann einen anderen verfügbaren Plan wählen. Geben Sie
keine eigene Server-URL, Bereitstellungskennung oder Platzierungsangabe an:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

Nach abgeschlossener Bereitstellung liefert die Namespace-Antwort die stabile
`runtime_url`, `runtime_namespace`, den verwalteten Status und kundensichtbare
Regionsinformationen. Behandeln Sie URL und Namespace als von Cloud verwaltete
Konfiguration. Leiten Sie keinen Endpunkt ab und ersetzen Sie ihn nicht durch
eine selbst gehostete Server-Adresse.

### 2. Getrennte Client- und Worker-Zugangsdaten ausstellen {#2-issue-separate-client-and-worker-credentials}

Stellen Sie die beiden Laufzeitrollen unabhängig aus:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

Jedes Token wird einmal in seiner Erstellungsantwort angezeigt. Speichern Sie
es im Geheimnisspeicher, den nur die zugehörige Rolle verwendet. Ein bewusst
kombinierter Client-/Worker-Prozess erhält beide Werte als zwei getrennte
Geheimnisse. Rotieren und widerrufen Sie die Rollen unabhängig. Ersetzen Sie
Laufzeit-Zugangsdaten niemals durch einen Cloud-API-Schlüssel.

### 3. Einen ersten Cloud-Workflow abschließen {#cloud-first-workflow}

Die gemeinsame Testumgebung der Sample App für externe Laufzeitumgebungen führt
denselben implementierten Workflow-/Aktivitätsablauf mit PHP, Python oder Rust
aus. Öffnen Sie einen [Sample-App-Codespace](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
exportieren Sie die bereitgestellten Namespace-Werte und zwei
Laufzeit-Zugangsdaten und wählen Sie eine Anwendungs-Task-Warteschlange:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Wählen Sie dann ein offizielles SDK und führen Sie denselben verwalteten Laufzeitvertrag aus:

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

Der Runner ermittelt aktuelle stabile Artefaktversionen, gibt jede Zugangsdatenrolle
nur an ihren Kindprozess, wartet bis zu 60 Sekunden auf eine
Worker-Registrierung mit genau der Warteschlange und den erzeugten Workflow-
und Aktivitätstypen und startet dann eine Client-Anfrage. Erfolg erfordert das
erwartete SDK-Ergebnis, `completed` von `dw` und die erforderliche Workflow-
und Aktivitätshistorie. Im verwalteten Modus startet der Befehl keinen lokalen
Server und kein lokales Waterline.

Führen Sie für jede Sprache den vollständigen verwalteten Befehl oben erneut
aus und ändern Sie nur `language`. Die Implementierung im jeweiligen SDK
beschreibt dessen Leitfaden:

- [PHP SDK](/docs/polyglot/php/): `language=php` setzen.
- [Python SDK](/docs/polyglot/python/): `language=python` setzen.
- [Rust-Schnellstart für verwaltete Laufzeitumgebungen](/docs/polyglot/rust-cloud-quickstart/):
  `language=rust` setzen und die Diagnosen für Worker-Bereitschaft, abgeschlossenes
  Ergebnis und Abweichungen verwenden.

Ein kombinierter Client-/Worker-Ablauf hält beide Laufzeit-Zugangsdaten als
getrennte Geheimnisse. Ein Cloud-Verwaltungsschlüssel ist keine
Laufzeit-Zugangsberechtigung und darf unter keiner Laufzeit-Token-Variable
exportiert werden.

### 4. Im verwalteten Betrieb fortfahren {#4-continue-with-managed-operation}

Der SDK-Client startet Workflows und sendet Folgebefehle über die
Namespace-Laufzeit-URL. Kundenseitig betriebene Worker registrieren sich und
fragen mit der Worker-Rolle über dieselbe URL per Long Polling ab. Cloud
authentifiziert und begrenzt jede Anfrage, führt das Orchestrierungsprotokoll
in der verwalteten Laufzeitumgebung aus und speichert Workflow-Zustand und Historie.

Die Kundenanwendung wählt für eine Operation keine Laufzeitbereitstellung.
Workflow-IDs, Lauf-IDs, Task-Warteschlangen, Kompatibilitätsmarker und
Avro-Nutzlastcodierung bleiben dauerhafte Anwendungsverträge im Cloud-Namespace.

## Vernetzung kundenseitig betriebener Worker {#customer-run-worker-connectivity}

Worker können in Ihrem Netzwerk, Ihrer VM-Flotte, Containerplattform oder
Anwendungsumgebung laufen. Sie benötigen ausgehendes HTTPS zur
Namespace-Laufzeit-URL und müssen langlebige Worker-Protokoll-Abfragen zulassen.

- Eingehende Verbindungen von Cloud zu Workern sind nicht erforderlich.
- Proxys und Ausgangsgateways dürfen Long Polling nicht in eine hektische Wiederholungsschleife verkürzen.
- Worker sollten vorübergehende Verbindungsfehler und Nichtverfügbarkeitsantworten mit begrenzten Wartezeiten wiederholen.
- Das Verschieben eines Worker-Prozesses verschiebt keinen Workflow-Zustand. Cloud hält dauerhaften Namespace-Zustand und Historie.
- Zugangsdatenrotation erfordert keine Änderung von Laufzeit-URL, Namespace oder Task-Warteschlange.

## Regionsplatzierung und Wiederherstellungsgrenze {#region-placement-and-recovery-boundary}

Cloud Dev ist mit der unten beschriebenen Wiederherstellungsgrenze verfügbar.
Die HA-Grenzen beschreiben geplante, bis zur Qualifizierung nicht verfügbare Pläne:

- **Cloud Dev:** ein isolierter Host mit dauerhaftem Zustand und Sicherungen.
  Wartung und Wiederherstellung können den Dienst unterbrechen. Es gibt kein
  Verfügbarkeits-SLA und kein automatisches regionales Failover.
- **Geplante HA in einer Region:** drei replizierte Hosts in einer Region mit
  automatischem Primary-Failover. Ein Host darf ausfallen, ohne das verbleibende
  Quorum zu verlieren. Ein Ausfall der gesamten Region ist vom SLA nicht abgedeckt.
- **Geplante HA über mehrere Regionen:** drei replizierte Hosts in drei Regionen
  mit automatischem Primary-Failover. Das SLA umfasst Verlust oder Isolation
  einer konfigurierten Region, sofern die verbleibenden Mitglieder ein Quorum bilden können.

Bei den geplanten HA-Profilen soll die stabile Laufzeit-URL dem gewählten
Primary folgen. Bei unterstütztem Failover ändern Sie die SDK-Konfiguration
nicht. Ein isolierter ehemaliger Primary darf keine maßgebliche Arbeit
weiter bedienen. Kann kein sicherer Primary bestimmt werden, stoppt die
Laufzeitumgebung, statt widersprüchliche Schreibzugriffe anzunehmen. HA
verspricht keine unterbrechungsfreien Anfragen: Clients und Worker benötigen
weiterhin begrenzte Wiederholungen für vorübergehende Fehler.

Die Namespace-Seite zeigt Topologie, Regionsinformationen und Dienststatus.
Sicherungen unterstützen Wiederherstellung, ersetzen aber keine laufende
Replikation. Kurze Failover-Tests belegen die geprüften Ausfälle, keine
allgemeine Wiederherstellungszeitgarantie oder erreichte Monatsverfügbarkeit.

### SLA-Messung und Gutschriften {#sla-measurement-and-credits}

Die vier geplanten SLA-Pläne sehen 99.99% Verfügbarkeit je UTC-Kalendermonat
vor, am Kunden-Laufzeitendpunkt in Ein-Minuten-Fenstern gemessen. Fehlende
Messungen zählen als nicht verfügbar; geplante Wartung wird nicht ausgenommen.
Die Verfügbarkeit kundenseitiger Worker ist von der verwalteten
Laufzeitverfügbarkeit getrennt.

| Monatliche Verfügbarkeit | Automatische Kontogutschrift |
| --- | ---: |
| Mindestens 99.99% | Keine |
| Mindestens 99.9%, unter 99.99% | 10% |
| Mindestens 99.0%, unter 99.9% | 25% |
| Unter 99.0% | 100% |

Kontogutschriften werden automatisch angewendet. Barauszahlungen erfordern
Prüfung und Genehmigung. Cloud Dev hat keine SLA-Gutschriften. Verfügbarkeit
und Abrechnungsbedingungen des Plans stehen unter
[Cloud-Preise](https://cloud.durable-workflow.com/pricing).

## Private Vernetzung und Support-Grenze {#private-connectivity-and-support-boundary}

Der Cloud-Selbstbedienungsvertrag für 2.0 setzt ausgehenden Zugriff von Clients
und Workern auf die öffentliche Namespace-Laufzeit-URL voraus. Rein private
Eingänge, individuelle VPN-/Peering-Vereinbarungen und anbieterspezifisches
privates Routing sind supportbegleitete Vernetzungsentwürfe, keine versteckten
Standards. Kunden erhalten niemals interne Laufzeitadressen und werden nicht
aufgefordert, die Namespace-URL zu umgehen.

## Cloud oder selbst gehosteter Server {#cloud-or-self-hosted-server}

Wählen Sie Cloud, wenn Durable Workflow Orchestrierungslaufzeit, Persistenz,
Verfügbarkeit des gewählten Plans, Wiederherstellung und Managed Waterline
betreiben soll, während Ihr Team SDK-Clients und -Worker betreibt.

Wählen Sie [selbst gehosteten Server](/docs/polyglot/server), wenn Ihr Team
Server-Image, Datenbank, Cache, Vernetzung, Authentifizierung, Sicherungen und
Failover unabhängig betreiben muss. Ein selbst gehosteter Server kann nicht
für einen Cloud-Namespace registriert, daran angeschlossen oder als dessen
Laufzeitgrundlage verwendet werden. Eingebettetes Laravel, selbst gehosteter
Server und Cloud sind getrennte Bereitstellungsentscheidungen.

## Standard-Workflow-Benchmarks {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity)
definiert eine kleine wiederholbare Last: ein Workflow-Start, eine externe
Aktivität und ein Workflow-Abschluss mit definierten 1-KiB-Avro-Eingaben und
-Ergebnissen. Der Kunden-Worker läuft außerhalb der verwalteten Laufzeitzuteilung.

Cloud Dev wurde am 21. September 2026 mit demselben Plan gemessen, den Kunden
bereitstellen. Die vier anderen Basiswerte sind historisch: Sie enthalten ihre
replizierte HA-Topologie, stammen aber von vor dem aktuellen Laufzeitrelease.
Sie sind nicht aus Dev hochgerechnet und qualifizieren nicht die Kapazität der
aktuellen SLA-Pläne.

| Plan | Standard-Workflows/Sekunde | Workflow-Aktionen in 30 Tagen | Messung |
| --- | ---: | ---: | --- |
| Cloud Dev | 0.25 | 1,296,000 | 21. September 2026; Details unten |
| Cloud Standard | 0.25 | 1,296,000 | Historisch; erneute Messung ausstehend |
| Cloud Multi-Region | 0.10 | 518,400 | Historisch; erneute Messung ausstehend |
| Cloud Business | 0.50 | 2,592,000 | Historisch; erneute Messung ausstehend |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Historisch; erneute Messung ausstehend |

Die 30-Tage-Schätzung ist `Workflows/Sekunde x 2,592,000 Sekunden x 2 Workflow-Aktionen`:
ein Start und eine Aktivität für diesen Vergleich. Sie setzt diese Rate
ununterbrochen über 30 Tage voraus. Sie ist weder enthaltenes Aktionskontingent
noch Abrechnungseinheit oder exakte Zuordnung zu Aktionsdefinitionen anderer Engines.

Dies sind gemessene Lastbasiswerte, kein Maximaldurchsatz und keine garantierte
Kapazität für jede Anwendung. Größere Nutzlasten, mehr Aktivitäten, Timer,
Signale, Abfragen, Replay-lastige Historien, regionsübergreifende Kommunikation
und Kunden-Worker-Latenz ändern das Ergebnis. Die Tabelle beansprucht keine
separaten Timer-, Signal-, Replay- oder Sättigungsbenchmarks. Planen Sie für
Ihren tatsächlichen Workflow-Mix, statt diese Zahlen mit einer beliebigen
Workflow-Größe zu multiplizieren.

### Cloud-Dev-Messung {#cloud-dev-capacity}

Cloud Dev ist eine isolierte verwaltete Einzelhost-Laufzeitumgebung für
Entwicklung und Evaluierung. Diese Messung nutzte eine gewöhnlich bereitgestellte
Dev-Laufzeitumgebung ohne Änderungen an CPU, Arbeitsspeicher, Speicher,
Eingang oder Sicherungseinstellungen:

| Ressource | Cloud Dev |
| --- | --- |
| Laufzeit-Rechenleistung | 1 geteilte vCPU, 1 GB RAM |
| Enthaltener dauerhafter Speicher | 5 GB |
| Laufzeitdienste | Server, Warteschlangen-Worker, Scheduler, MySQL und Redis |
| Managed Waterline | Über die authentifizierte Cloud-Anwendung enthalten; kein Prozess auf dem Dev-Host |
| Netzwerkpfad | Direkter, Space-spezifischer HTTPS-Eingang |
| Kunden-Worker | Laufen in der Kundenumgebung |
| Verfügbarkeit | Kein SLA; Wartungsunterbrechungen sind zulässig |
| Aktueller Laufzeitpreis | Siehe [Pläne und Preise](#plans-and-pricing) |
| Mehr Speicher | Größeren Laufzeitplan anfordern; keine Speichererweiterungen |

Der Lauf verwendete die öffentliche [PHP-Definition von DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/68168f34b637a19c054211f4db2df9c616799a86/benchmarks/capacity/v1/bindings/php/capacity_adapter.php):
ein Workflow-Start, eine externe Echo-Aktivität und ein Abschluss mit einer
1,024-Byte-Zeichenfolge in Avro an jeder Workflow-/Aktivitätseingabe- und
Ergebnisgrenze. Server 2.3.12 enthielt Workflow 2.0.14. Externer Worker und
Clients verwendeten PHP SDK 2.0.11 auf PHP 8.4.25. Die Laufzeitumgebung verwendete
PHP 8.3.33 und MySQL 8.0.46.

Ein PHP-Worker nutzte einen Task-Abfrage-Timeout von einer Sekunde. Zwei
unabhängige Client-Slots boten nach separater 30-sekündiger Aufwärmphase alle
vier Sekunden einen Workflow an. Das feste Messfenster war
**18:50:30–18:55:30 UTC am 21. September 2026**. Nur innerhalb dieser fünf
Minuten beobachtete Abschlüsse zählen zum Durchsatz. Späteres Auslaufen erhöht
die gemeldete Rate nicht. Jedes Ergebnis, jeder abgeschlossene Status und die
geordnete Workflow-/Aktivitätshistorie wurden geprüft.

| Messergebnis | Wert |
| --- | ---: |
| Angebotene und abgeschlossene Rate | 0.25 Standard-Workflows/Sekunde |
| Abgeschlossene Workflows | 75 von 75 |
| Fehler / verpasste Start-Slots | 0 / 0 |
| Start-bis-Ergebnis-Latenz, p50 | 2.76 Sekunden |
| Start-bis-Ergebnis-Latenz, p95 | 4.18 Sekunden |
| Start-bis-Ergebnis-Latenz, p99 | 4.33 Sekunden |
| Unfertige Workflows der gemessenen Kohorte | 0 |
| Workflow-Aktionen in 30 Tagen | 1,296,000 |

Die Latenz enthält Client-Netzwerk und Ergebnisabfragen alle 100 ms. Sie ist
keine interne Task-Planungslatenz und sollte nicht mit einer internen
Planungsmetrik einer Engine verglichen werden.

Die Host-CPU war in Fünf-Sekunden-Stichproben durchschnittlich **63.5%** und
maximal **89%** ausgelastet. Es gab **keine Container-OOM-Kills oder Neustarts**.
Der beobachtete maximale Container-Speicher betrug 95.21 MiB für Server,
197.1 MiB für MySQL, 45.84 MiB für den Warteschlangen-Worker, 43.75 MiB für den
Scheduler, 9.49 MiB für Redis und 34.59 MiB für den Eingangsconnector. Diese
einzelnen Spitzen sind kein gleichzeitiger Gesamt-Host-RSS. Betriebssystem und
andere Host-Prozesse verbrauchen ebenfalls Speicher. Der Host hatte seine
normale 1-GiB-Swap-Konfiguration; während der Messung waren bis zu etwa 90 MiB
belegt. Eine erste verschlüsselte Sicherung war vor dem Fenster geprüft worden.
Keine Sicherungserstellung überlappte das Fenster.

Dies ist ein gemessener Entwicklungsbasiswert, keine universelle Umrechnung
für jeden Workflow, kein Maximaldurchsatztest, kein Langzeit-Dauertest und kein
SLA. Größere Nutzlasten, zusätzliche Aktivitäten, Timer, Signale, Abfragen,
Replay-lastige Historien und Kunden-Worker-Latenz ändern die Kapazität.
Cloud-Abrechnung basiert auf bereitgestellter Laufzeitdauer mit fest enthaltenem
Speicher, nicht auf Workflow-Operationen.

## API für abrechnungsbezogene Nutzung {#billing-usage-api}

Cloud Dev verwendet für jeden bereitgestellten Dev-Space eine isolierte
Einzelhost-Laufzeitzelle. Es gelten diese Abrechnungsbedingungen:

| Abrechnungsbedingung | Cloud Dev |
| --- | ---: |
| Bereitgestellte Laufzeit | $0.075 pro Stunde, minutengenau gemessen |
| Kalendermonatsmaximum | $50 je Laufzeitkauf |
| Mindestbetrag im aktiven Monat | $2 je Laufzeitkauf in einem aktiven UTC-Monat |
| Verwaltete Kapazität | 1 vCPU, 1 GB Arbeitsspeicher, 5 GB dauerhafter Speicher |
| Zusätzlicher dauerhafter Speicher | Nicht separat verkauft; größeren Laufzeitplan anfordern |
| Grundlegende verschlüsselte Sicherungen | Enthalten |
| Verfügbarkeit | Ein Host, kein SLA |

Die Zuteilung umfasst den von Cloud betriebenen Server, MySQL, Redis, Planung,
Waterline-Zugriff, Sicherungen, Upgrades und Infrastruktur. Ihre PHP-, Python-
und Rust-Worker laufen außerhalb davon. Workflow-Starts, Aktivitätsversuche,
Wiederholungen, Timer, Signale, Abfragen, Updates und Kind-Workflows sind
Betriebstelemetrie, keine separaten Abrechnungseinheiten. Preise verstehen sich
zuzüglich gegebenenfalls anfallender Steuern. Enthaltener Speicher erzeugt keine
separate Gebühr.

Cloud bietet organisationsbezogene Nutzungsdaten für Finanzen, Betrieb und
automatisierte Kostenverrechnung. Der Endpunkt authentifiziert per
Cloud-API-Schlüssel und akzeptiert keine Kunden- oder Organisations-ID in der
Anfrage. Die Organisation wird aus dem `dwc_`-Bearer-Token aufgelöst, damit
Kunden keine fremde Nutzung abfragen können.

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` und `period_end` sind optionale ISO-8601-Daten. Ohne Angabe liefert
Cloud den aktuellen Kalendermonat. Lesen und Export der Nutzungsdaten bleiben
auch verfügbar, wenn Abrechnungsbeschränkungen Namespace-Bereitstellung oder
Workflow-Operationen pausieren. Finanzteams können so weiterhin den Kontostatus bereinigen.

Das Antwortschema ist `durable_workflow.cloud.namespace_capacity_usage.v1`.
Es trennt zugeteilte Kapazitätszeit von semantischen Ereigniszählern.
Speicherbezogene Felder bleiben für historische Abrechnung im Schema. Sie
autorisieren keinen Erweiterungskauf. Die verkürzte Cloud-Dev-Antwort unten
zeigt die aktuellen Planbedingungen.

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

Cloud Devs Zeitmessung beginnt mit Aktivierung der isolierten Laufzeitumgebung
und endet mit deren Stilllegung. Monatsobergrenze und Mindestbetrag gelten je
Laufzeitkauf in UTC-Kalendermonaten. Speicher wächst nicht automatisch und
beginnt nicht automatisch Gebühren zu erzeugen. Cloud hält auf dem
Laufzeitdatenträger eine Betriebs- und Wiederherstellungsreserve vor. Fordern
Sie vor Erreichen der enthaltenen Zuteilung einen größeren Laufzeitplan an.

Ungenutzte Laufzeitumgebungen verursachen weiter Kapazitätskosten. Stilllegung
stoppt die Kapazitätsabrechnung und entfernt aktive Laufzeitdaten und
Zugangsdaten. Sie ist kein Pausieren/Fortsetzen. Geplante SLA-Bedingungen nutzen
dasselbe Modell bereitgestellter Zeit mit eigenen Sätzen, Mindest- und
Höchstbeträgen. Verwenden Sie beim Interpretieren der Nutzung die vom Plan
zurückgegebenen `billing_terms`. Historische Rechnungen behalten ihre akzeptierten Bedingungen.

Exportieren Sie dieselben Nachweise als CSV oder JSON-Bericht, wenn ein
nachgelagertes Finanzsystem eine Datei benötigt:

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

Für ein JSON-gestütztes Dashboard-Panel fordern Sie dieselbe API mit dessen
Zeitraum an:

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

Führen Sie dann die Namespace-Kapazitätszeilen in eine flache Struktur über:

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

Verwenden Sie `invoice_units` für Kapazitäts- und Speicherabgleich.
`operational_telemetry` hilft, Lastform und Benchmark-Verhalten zu verstehen.
Wandeln Sie diese Ereigniszähler nicht in Gebühren um.

## Verwandte Referenzen {#related-references}

- [Bereitstellungsmodi](/docs/polyglot/deployment-modes)
- [PHP SDK](/docs/polyglot/php)
- [Python SDK](/docs/polyglot/python)
- [Rust SDK](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [Selbst gehostete Bereitstellungen](/docs/deployment)
- [Support](/docs/support)
