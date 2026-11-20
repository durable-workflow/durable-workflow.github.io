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
| Cloud Standard | 2 vCPU, 4 GB RAM | 25 GB | Geplante HA in einer Region, 99.99% SLA | $0.45/Stunde, $10 Mindestbetrag je aktivem Monat, $300/Monat Obergrenze |
| Cloud Multi-Region | 2 vCPU, 4 GB RAM | 25 GB | Geplante HA über mehrere Regionen, 99.99% SLA | $0.60/Stunde, $15 Mindestbetrag je aktivem Monat, $400/Monat Obergrenze |
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

SLA-Pläne erhalten automatisch Servicegutschriften auf das Konto. Die Summe ist
auf die Gebühren der betroffenen Laufzeitumgebung im jeweiligen Monat begrenzt; für
Ausfälle gibt es keine Barauszahlungen. Cloud Dev hat keine SLA-Gutschriften.
Verfügbarkeit und Abrechnungsbedingungen stehen in den
[Cloud-Nutzungsbedingungen](https://cloud.durable-workflow.com/terms) und unter
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

Cloud Dev wurde am 19. November 2026 auf der nativen Server-3.15.0-Laufzeitumgebung
gemessen, die Cloud für neue Dev-Laufzeitumgebungen bereitstellt. Die vier anderen Basiswerte sind historisch: Sie enthalten ihre
replizierte HA-Topologie, stammen aber von vor dem aktuellen Laufzeitrelease.
Sie sind nicht aus Dev hochgerechnet und qualifizieren nicht die Kapazität der
aktuellen SLA-Pläne.

| Plan | Standard-Workflows/Sekunde | Workflow-Aktionen in 30 Tagen | Messung |
| --- | ---: | ---: | --- |
| Cloud Dev | 1.5 | 7,776,000 | 19. November 2026; Details unten |
| Cloud Standard | 0.25 | 1,296,000 | Historisch; erneute Messung ausstehend |
| Cloud Multi-Region | 0.10 | 518,400 | Historisch; erneute Messung ausstehend |
| Cloud Business | 0.50 | 2,592,000 | Historisch; erneute Messung ausstehend |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Historisch; erneute Messung ausstehend |

Die 30-Tage-Schätzung ist `workflows/second x 2,592,000 seconds x 2 workflow actions`:
ein Start und eine Aktivität für diesen Vergleich. Für Cloud Dev ergibt das
1.5 x 2,592,000 x 2 = 7,776,000. Sie setzt diese Rate ununterbrochen über
30 Tage voraus. Sie ist weder enthaltenes Aktionskontingent noch
Abrechnungseinheit oder exakte Zuordnung zu Aktionsdefinitionen anderer Engines.

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
Netzwerk, Eingang oder Sicherungseinstellungen:

| Ressource | Cloud Dev |
| --- | --- |
| Laufzeit-Rechenleistung | 1 geteilte vCPU, 1 GB RAM |
| Enthaltener dauerhafter Speicher | 5 GB |
| Laufzeitdienste | Nativer Server, MySQL, Redis und der Eingangsconnector |
| Managed Waterline | Über die authentifizierte Cloud-Anwendung enthalten; kein Prozess auf dem Dev-Host |
| Netzwerkpfad | Direkter, Space-spezifischer HTTPS-Eingang |
| Ausgehender Laufzeitverkehr | Auf 4 Mbit/s begrenzt |
| Kunden-Worker | Laufen in der Kundenumgebung |
| Verfügbarkeit | Kein SLA; Wartungsunterbrechungen sind zulässig |
| Aktueller Laufzeitpreis | Siehe [Pläne und Preise](#plans-and-pricing) |
| Mehr Speicher | Größeren Laufzeitplan anfordern; keine Speichererweiterungen |

Der Lauf verwendete die öffentliche [PHP-Definition von DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/f16f9b7337d3d64b1ba6458ab61ba2d7ed7f334f/benchmarks/capacity/v1/bindings/php/capacity_adapter.php):
ein Workflow-Start, eine externe Echo-Aktivität und ein Abschluss mit einer
1,024-Byte-Zeichenfolge in Avro an jeder Workflow-/Aktivitätseingabe- und
Ergebnisgrenze. Die Laufzeitumgebung war das Server-Release, das Cloud für neue
Dev-Laufzeitumgebungen bereitstellt: nativer Server 3.15.0 mit MySQL 8.0.46 und
Redis 7.4.11. Sein `/api/cluster/info` meldete die Implementierung `rust`,
Version 3.15.0 und Worker-Protokoll 1.20. Externe Worker und Clients
verwendeten das veröffentlichte PHP SDK 3.22.0 auf PHP 8.4.27, das in diesem
Binding anstelle des dort fest vorgegebenen SDK 2.0.10 installiert wurde. Sie
liefen außerhalb des Laufzeit-Hosts und verbanden sich über dessen normalen
HTTPS-Eingang.

Die Last wurde in Stufen von 0.25, 0.5, 1, 1.5 und 2 Workflows/Sekunde
gesteigert, und die Grenzstufen wurden wiederholt. Jede Stufe hatte eine
separate 30-sekündige Aufwärmphase und danach ein festes fünfminütiges Fenster.
Nur innerhalb des Fensters beobachtete Abschlüsse zählen zum Durchsatz.
Späteres Auslaufen erhöht die gemeldete Rate nicht.

- Worker: vier PHP-Worker bis 1 Workflow/Sekunde, sechs bei 1.5 und vier, sechs
  oder acht bei 2. Jeder nutzte einen Task-Abfrage-Timeout von einer Sekunde.
- Clients: `max(2, 8 x rate)` unabhängige Client-Slots boten Starts nach einem
  festen Zeitplan an. Ein Start, der mehr als eine Sekunde zu spät erfolgt, zählt
  als verpasster Start-Slot.
- Ergebnisse: Clients fragten das Ergebnis jedes Workflows einmal pro Sekunde
  ab. Der native Server unterstützt Long Polling der Historie (`wait_new_event`,
  [server#1257](https://github.com/durable-workflow/server/issues/1257)) noch
  nicht.
- Prüfungen: Jedes Ergebnis, jeder abgeschlossene Status und die geordnete
  Workflow-/Aktivitätshistorie wurden verifiziert.
- Eine Stufe besteht ohne Fehler, ohne verpasste Start-Slots im Fenster, mit
  jedem verifizierten Workflow, ohne wachsenden Rückstau und ohne OOM-Kill oder
  Neustart. Die veröffentlichte Rate ist die höchste bestandene Stufe mit einer
  Host-CPU-Auslastung von höchstens etwa 80%.
- Die Host-CPU stammte alle fünf Sekunden aus `/proc/stat`. Der
  Container-Speicher ist das cgroup-Working-Set.

| Angebotene Rate (Worker) | Fenster, 19. November (UTC) | Gestartet / angeboten | Im Fenster abgeschlossen | Verpasst / Fehler | p50 / p95 / p99 (s) | Unfertig am Fensterende | Host-CPU Durchschnitt / Spitze | Ergebnis |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0.25/s (4) | 22:56-23:01 | 75 / 75 | 75 | 0 / 0 | 1.24 / 1.30 / 1.42 | 0 | 29.3% / 35.2% | bestanden |
| 0.5/s (4) | 23:02-23:07 | 150 / 150 | 151 | 0 / 0 | 1.25 / 1.41 / 2.61 | 0 | 38.2% / 45.5% | bestanden |
| 1/s (4) | 23:08-23:13 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.57 / 1.65 | 1 | 58.8% / 64.2% | bestanden |
| 1/s (4), Wiederholung | 23:36-23:41 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.56 / 1.64 | 1 | 48.5% / 61.6% | bestanden |
| 1.5/s (6) | 23:29-23:34 | 450 / 450 | 446 | 0 / 0 | 1.78 / 3.98 / 5.10 | 6 | 54.0% / 60.9% | bestanden |
| 1.5/s (6), Wiederholung | 23:43-23:48 | 450 / 450 | 446 | 0 / 0 | 1.77 / 3.71 / 4.83 | 6 | 55.8% / 61.8% | bestanden |
| 2/s (4) | 23:15-23:20 | 522 / 600 | 520 | 78 / 0 | 6.49 / 9.87 / 10.58 | 16 | 50.4% / 65.5% | nicht bestanden: verpasste Starts |
| 2/s (8) | 23:22-23:27 | 455 / 600 | 452 | 145 / 0 | 7.92 / 11.66 / 12.86 | 14 | 43.0% / 50.1% | nicht bestanden: verpasste Starts |
| 2/s (6) | 23:49-23:54 | 496 / 600 | 487 | 104 / 1 | 6.97 / 10.43 / 11.04 | 15 | 48.6% / 56.4% | nicht bestanden: verpasste Starts, 1 fehlgeschlagener Workflow |

| Messergebnis bei 1.5 Workflows/Sekunde | Wert |
| --- | ---: |
| Angebotene Rate | 1.5 Standard-Workflows/Sekunde |
| Messfenster | 23:29:52-23:34:52 UTC |
| Innerhalb des Fensters abgeschlossen | 446 (1.49/Sekunde) |
| Nach dem Auslaufen abgeschlossen | 450 von 450 gestarteten |
| Fehler / verpasste Start-Slots | 0 / 0 |
| Start-bis-Ergebnis-Latenz, p50 | 1.78 Sekunden |
| Start-bis-Ergebnis-Latenz, p95 | 3.98 Sekunden |
| Start-bis-Ergebnis-Latenz, p99 | 5.10 Sekunden |
| Unfertige Workflows der gemessenen Kohorte am Fensterende | 6 |
| Host-CPU, Durchschnitt / Spitze | 54.0% / 60.9% |
| Workflow-Aktionen in 30 Tagen | 7,776,000 |

Die sechs unfertigen Workflows wurden in den letzten Sekunden des Fensters
gestartet und innerhalb des normalen Latenzbereichs abgeschlossen; sie werden
nicht gezählt. Während des Fensters waren höchstens neun Workflows gleichzeitig
offen, und die Medianlatenz in der letzten Minute (1.87 Sekunden) blieb nahe an
der ersten Minute (1.76 Sekunden), es gab also keinen wachsenden Rückstau. Die
wiederholte 1.5-Stufe bestand mit demselben Durchsatz, einer p99-Latenz von
4.83 Sekunden und einer durchschnittlichen Host-CPU-Auslastung von 55.8%.

Die Latenz enthält Client-Netzwerk (etwa 85-170 ms pro HTTPS-Roundtrip vom
messenden Host) und Ergebnisabfragen im Sekundentakt, sodass der Median nicht
wesentlich unter eine Sekunde fallen kann. Sie ist keine interne
Task-Planungslatenz und sollte nicht mit einer internen Planungsmetrik einer
Engine verglichen werden.

In keiner Stufe gab es **Container-OOM-Kills oder Neustarts**. Bei 1.5
Workflows/Sekunde betrug der beobachtete maximale Container-Speicher (Working
Set) 17.16 MiB für den nativen Server, 244.35 MiB für MySQL, 6.29 MiB für Redis
und 30.16 MiB für den Eingangsconnector. Diese einzelnen Spitzen sind kein
gleichzeitiger Gesamt-Host-RSS. Betriebssystem und andere Host-Prozesse
verbrauchen ebenfalls Speicher. Der Host hatte seine normale
1-GiB-Swap-Konfiguration, von der bis zu etwa 50 MiB belegt waren. Die erste
verschlüsselte Sicherung wurde vor dem ersten Fenster erstellt und geprüft, und
keine weitere Sicherungserstellung überlappte den Lauf.

Die Stufe mit 2 Workflows/Sekunde hat nicht bestanden. Drei Versuche mit vier,
acht und sechs Workern verpassten 78, 145 und 104 von 600 Start-Slots, bei einer
p99-Latenz von 10.6 bis 12.9 Sekunden. Die Host-CPU war nicht die Grenze: Sie
lag in diesen Versuchen durchschnittlich bei 43-50%. Die Grenze war die
Begrenzung des ausgehenden Verkehrs der Laufzeitumgebung. Diese Methode erzeugte
etwa 400 KB ausgehenden Laufzeitverkehr pro Workflow (Ergebnisabfragen,
Worker-Task-Antworten und Transport-Overhead): 3.35 Mbit/s bei 1 Workflow/Sekunde
und die vollen 4.0 Mbit/s bei 1.5 und 2. Mehr Worker halfen nicht, weil ihre
Abfragen zusätzlichen Verkehr erzeugen. Im Versuch mit sechs Workern schlug ein
Workflow fehl, nachdem seine Aktivität ihre Task-Lease verloren hatte, während
der ausgehende Verkehr gesättigt war. Jeder andere Workflow in jeder Stufe wurde
mit der erwarteten Historie abgeschlossen, ohne Fehler und ohne OOM-Kills oder
Neustarts. Der gemessene Dev-Basiswert beträgt daher 1.5
Standard-Workflows/Sekunde; höhere Raten werden nicht beansprucht.

Dies ersetzt den Dev-Basiswert vom 18. November 2026 von 0.25
Workflows/Sekunde. Jener Lauf maß die PHP-Server-2.9.12-Laufzeitumgebung, die Dev
damals bereitstellte, mit einem Worker und Ergebnisabfragen alle 100 ms, und
ihre einzelne vCPU war die Grenze.

Dies war eine frische Laufzeitumgebung, die über etwa eine Stunde gemessen wurde,
kein Langzeit-Dauertest. Die Wartungsscans von Server 3.15.0 lesen jeden
aufbewahrten Lauf, sodass die Datenbankarbeit mit der aufbewahrten Historie
wächst; Server 3.16.0 begrenzt diese Scans auf offene Arbeit
([server#1256](https://github.com/durable-workflow/server/issues/1256)). Cloud
Dev wird auf Server 3.16.0 erneut gemessen, einschließlich eines längeren Laufs
mit aufbewahrter Historie. Dies ist ein gemessener Entwicklungsbasiswert, keine
universelle Umrechnung für jeden Workflow, kein Maximaldurchsatztest und kein
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

Folgen Sie vor der Deprovisionierung [Workloads zwischen Laufzeiten verschieben](/docs/polyglot/runtime-migration/#preserve-evidence): Bewahren Sie geprüfte Verlaufs- und Payload-Nachweise auf und bestätigen Sie den Endzustand aller Quell-Läufe. Kapazitätskosten laufen weiter, solange die Quelle bereitgestellt ist.

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
