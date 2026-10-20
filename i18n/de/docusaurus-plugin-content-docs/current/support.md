---
sidebar_position: 15
---

# Unterstützung {#support}

Durable Workflow ist ein Open-Source-Projekt und unter der MIT-Lizenz kostenlos nutzbar. Sie benötigen keine kommerzielle Vereinbarung, um es zu betreiben, auszuliefern oder damit Produktionssysteme aufzubauen.

## Unterstützung durch die Community {#community-support}

Die Community ist die erste Anlaufstelle für Hilfe zu Durable Workflow. Community-Unterstützung eignet sich besonders für öffentliche Fragen, Entwurfsdiskussionen, Fehlerberichte und gemeinsame Betriebsmuster.

Hier sind Sie richtig für:

- Fragen zur Verwendung
- Beratung zur Workflow-Modellierung
- Hilfe beim Verständnis von Determinismus und Replay
- Austausch von Ideen und Mustern
- Meldung von Fehlern oder unerwartetem Verhalten

### GitHub Discussions {#github-discussions}

GitHub Discussions ist der bevorzugte Ort für ausführlichere Fragen, Entwurfsdiskussionen und Themen, von denen auch andere profitieren können.

https://github.com/durable-workflow/workflow/discussions

### Discord {#discord}

Discord eignet sich besonders für:

- kurze Fragen
- informelle Diskussionen
- frühes Feedback
- Zusammenarbeit in der Community

https://discord.gg/xu5aDDpqVy

Community-Unterstützung erfolgt nach Verfügbarkeit und reicht häufig für Entwicklung, Experimente und viele Produktionsanwendungen aus.

## Grenzen der Bereitstellungsunterstützung {#deployment-support-boundary}

Durable Workflow soll ohne Vertriebsgespräch nützlich sein. Die öffentliche Distribution ist bewusst für die Bereitstellungswege optimiert, die die meisten Teams zuerst benötigen:

- **Lokale Entwicklung und interne Nichtproduktionsumgebungen**\
  Betreiben Sie das Paket oder den eigenständigen Server lokal, in einem LAN oder in einer gemeinsamen Staging-Umgebung, damit Entwickler Workflows schnell ausprobieren und weiterentwickeln können.

- **Produktion auf einem Knoten**\
  Betreiben Sie den eigenständigen Server auf einer VM, einem VPS oder einem internen Host mit dauerhafter Datenbank, Cache, Reverse Proxy, Sicherungen und rollenbezogenen Zugangsdaten.

- **Kleine Clusterbereitstellungen**\
  Betreiben Sie 2–3 zustandslose API-Container hinter einem Load Balancer mit gemeinsamem externem MySQL oder PostgreSQL, gemeinsamem Redis, unabhängig skalierten Workern und genau einem Scheduler oder Wartungsprozess.

- **Kubernetes-Manifeste**\
  Verwenden Sie die bereitgestellten Manifeste, wenn Ihr Team bereits Kubernetes betreibt und einen Kubernetes-nativen Ausgangspunkt sucht.

Das gehostete Durable Workflow Cloud ist ein separater [verwalteter Orchestrierungsdienst](/docs/polyglot/cloud-control-plane). Cloud betreibt Laufzeit, Persistenz, Platzierung in einer einzelnen Region und Wiederherstellung. Kunden betreiben SDK-Clients und Worker. Kunden binden keinen selbst gehosteten Server an Cloud an. Replikation über mehrere Regionen, regionales Failover und Failback sind nicht Teil des aktuellen Cloud-Vertrags.

Wir optimieren die öffentliche Distribution bewusst für lokale Entwicklung, Produktion auf einem Knoten und den eng begrenzten Vertrag für kleine Cluster im Selbsthosting-Leitfaden. Kubernetes-Manifeste stehen Teams zur Verfügung, die Kubernetes bereits betreiben. Der Vertrag für kleine Cluster unterstützt [rollierende Upgrades](/docs/rolling-upgrades), wenn alle Garantien dieser Seite eingehalten werden. Aktiv/Passiv über mehrere Regionen mit operatorgesteuertem regionalem Failover bleibt eine supportbegleitete Evaluierung. Siehe [Aktiv/Passiv über mehrere Regionen](/docs/deployment#activepassive-multi-region) im Selbsthosting-Leitfaden. Das veröffentlichte Helm-Chart bietet einen selbstständig nutzbaren Paketierungs- und Rolloutweg. Individuelle Chart-Änderungen, Providerinfrastruktur, doppelte Scheduler, Mehrknotenbetrieb ohne Redis, Provider-Failover, Aktiv/Passiv oder Aktiv/Aktiv über mehrere Regionen, selbst gehostetes automatisches regionales Failover und erweiterte Hochverfügbarkeitstopologien bleiben supportbegleitet, da sie umgebungsspezifische Entscheidungen zu Dimensionierung, Datenbank, Netzwerk, Sicherheit und Upgrades erfordern.

Der [Selbsthosting-Bereitstellungsleitfaden](/docs/deployment) enthält die konkrete Unterstützungsmatrix, Compose-Rezepte mit veröffentlichten Images, Grenzen der unveränderten Kubernetes-Manifeste, Bereitschaftsprüfungen und den Übergang zu supportbegleiteter Arbeit.

Diese Grenze hält den selbstständig nutzbaren Weg einfach und lässt zugleich Raum für vertiefte Hilfe, wenn die Bereitstellung selbst zu einem Projekt verteilter Systeme wird.

## Kommerzieller Support (optional) {#commercial-support-optional}

Für Teams, die zusätzliche Sicherheit oder Expertise auf Maintainer-Niveau benötigen, stehen kommerzieller Support und Beratung zur Verfügung.

Die Nutzung von Durable Workflow erfordert **keine** kommerzielle Vereinbarung. Alle Funktionen bleiben vollständig Open Source, unabhängig davon, ob kommerzieller Support genutzt wird.

Kommerzieller Support richtet sich an Teams, die Durable Workflow in Produktionssystemen betreiben, bei denen Korrektheit, sichere Upgrades, Bereitstellungstopologie und die Semantik lang laufender Ausführungen wichtig sind.

## Umfang des kommerziellen Supports {#what-commercial-support-covers}

Kommerzielle Supportaufträge werden vom Projektmaintainer geleitet und umfassen typischerweise:

- **Planung der Produktionsbereitstellung**\
  Beratung bei der Wahl zwischen Einzelknoten-, eng begrenzten Kleincluster-, Kubernetes- und supportbegleiteten Bereitstellungsmodellen, einschließlich Datenbank-, Cache-, Reverse-Proxy-, Scheduler- und Worker-Topologie.

- **Dimensionierung, Zuverlässigkeit und Upgrade-Planung**\
  Hilfe bei Kapazitätsannahmen, Sicherungs- und Wiederherstellungsstrategie, Bootstrap- und Migrationsreihenfolge, Rolloutsicherheit und Betriebsanleitungen.

- **Unterstützung erweiterter Topologien**\
  Supportbegleiteter Entwurf für individuelle Helm-Chart-Änderungen, providerspezifische Kubernetes-Infrastruktur, individuelle Overlays, doppelte Scheduler, Mehrknotenbetrieb ohne Redis, Hochverfügbarkeit, Aktiv/Passiv oder Aktiv/Aktiv über mehrere Regionen, selbst gehostetes automatisches regionales Failover und synchrone regionsübergreifende Replikation. Das veröffentlichte Chart bleibt ein selbstständig nutzbarer Installationsweg. Der [Selbsthosting-Leitfaden](/docs/deployment#activepassive-multi-region) enthält weiterhin Architektur- und Betriebsmaterial für die supportbegleitete Aktiv/Passiv-Evaluierung. Der separate [Vertrag für die verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane) dokumentiert Platzierung in einer einzelnen Region, Wiederherstellung und Konnektivitätsgrenzen des gehosteten Dienstes.

- **Sicherheitsprüfung**\
  Unterstützung bei rollenbezogenen Zugangsdaten, Netzwerkfreigaben, internen und öffentlichen Endpunkten, TLS-Terminierung und Zugriffsgrenzen für Operatoren und Worker.

- **Prüfung von Workflow-Architektur und -Entwurf**\
  Beratung zur korrekten Workflow-Modellierung, einschließlich Aktivitätsgrenzen, Signalen, Inbox-/Outbox-Nutzung und Mustern für lang laufende Ausführungen.

- **Beratung zu Determinismus und Replay-Sicherheit**\
  Hilfe beim Erkennen und Vermeiden nichtdeterministischen Verhaltens, von Replay-Problemen und subtilen Korrektheitsproblemen, die sich erst mit der Zeit zeigen können.

- **Upgrade- und Versionierungsstrategie**\
  Unterstützung bei sicheren Upgrades, Workflow-Versionierung und der Entscheidung, wann Muster wie `continue-as-new` erforderlich sind.

- **Fehlersuche bei komplexem Workflow-Verhalten**\
  Unterstützung bei feststeckenden Workflows, unerwarteten Schleifen, Problemen mit der Signalverarbeitung und anderem schwer nachvollziehbarem Laufzeitverhalten.

- **Backports und Patches**\
  Zugriff auf Korrekturen und Backports für unterstützte Versionen, um die Pflege privater Forks zu vermeiden.

- **Individuelle Integrationen nach Vereinbarung**\
  Hilfe bei der Integration von Durable Workflow mit bestehenden Systemen wie Chatplattformen, Freigabesystemen, internen APIs oder Beobachtbarkeitswerkzeugen.

## Für wen kommerzieller Support geeignet ist {#who-commercial-support-is-for}

Kommerzieller Support passt typischerweise, wenn Sie:

- Durable Workflow in **Produktion** betreiben
- den eigenständigen Server für **mehrere Teams oder Dienste** bereitstellen
- **lang laufende Workflows oder Workflows mit menschlicher Beteiligung** entwickeln
- eine **Cluster-, providerspezifische oder angepasste Kubernetes-/Helm-, regionsübergreifende Aktiv/Passiv- oder Aktiv/Aktiv-Topologie oder eine selbst gehostete Topologie mit automatischem Failover** jenseits der nachgewiesenen Betriebsgrenzen von 2.0 in einer einzelnen Region entwerfen
- in einer Umgebung arbeiten, in der **Korrektheit und sichere Upgrades wichtig sind**
- **Expertise auf Maintainer-Niveau** suchen
- Forks und langfristige Wartungsrisiken vermeiden möchten

## Kontakt {#contact}

Für Gespräche über kommerziellen Support oder Beratung wenden Sie sich an:

**support@durable-workflow.com**

Wir beginnen gern mit einem kurzen Einführungsgespräch, um Ihren Anwendungsfall zu verstehen und die nächsten Schritte zu bestimmen.
