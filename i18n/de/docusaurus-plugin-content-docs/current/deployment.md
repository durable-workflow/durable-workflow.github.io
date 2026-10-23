---
sidebar_position: 13
title: Selbsthosting-Bereitstellungen
description: Einen unterstützten Selbsthosting-Weg für Durable Workflow v2 und das passende Ausgangsartefakt wählen.
---

# Selbsthosting-Bereitstellungen {#self-hosting-deployments}

Durable Workflow v2 unterstützt mehrere selbst gehostete Formen. Wählen Sie den kleinsten Weg, der zu Ihrer Betriebsumgebung passt, und halten Sie Verträge für Image, Datenbank, Cache, Authentifizierung, Bereitschaft und Upgrades explizit.

Dieser Leitfaden behandelt die eigenständige Serverdistribution. Betreiben Sie das Laravel-Paket eingebettet in Ihrer Anwendung, verwenden Sie stattdessen die Seiten zu Paketinstallation und -konfiguration. Durable Workflow Cloud ist eine separate verwaltete Dienstoption, bei der Cloud Laufzeit, Persistenz, Platzierung und Wiederherstellung betreibt. Ein selbst gehosteter Server wird niemals an Cloud angebunden. Siehe [Verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane). Der aktuelle Cloud-Vertrag umfasst eine verwaltete Laufzeit und Wiederherstellungsgrenze in einer einzelnen Region. Er verspricht keine regionsübergreifende Replikation, automatisches regionales Failover oder Failback.

Die selbst gehostete Serverdistribution enthält und betreibt Waterline nicht. Stellen Sie Waterline nur separat bereit, wenn Sie seine Operatoroberfläche benötigen. Verbinden Sie es nach dem [Leitfaden zu Waterline-Bereitstellung und -Überwachung](/docs/monitoring/#waterline-service) mit einem serververwalteten Namespace. Cloud enthält dagegen Managed Waterline für seinen verwalteten Namespace.

## Unterstützungsmatrix der Bereitstellungen {#deployment-support-matrix}

| Weg | Ausgangspunkt | Unterstützt für | Auf diesem Weg nicht zugesagt | Beginn kommerzieller Unterstützung |
| --- | --- | --- | --- | --- |
| Lokale Entwicklung und interne Nichtproduktion | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) mit `%%artifact.serverTagEnv%%` oder `%%artifact.serverImageEnv%%` | Einzelne Entwicklungsmaschine, LAN-Demos, gemeinsames Staging, SDK- und Worker-Integrationstests | Öffentlich erreichbare Produktion, dauerhafte Sicherungsgarantien, strikte Geheimnisrotation, Mehrknoten-Failover | Sie möchten einen funktionierenden Entwicklungsstack in eine Produktionsbetriebsanleitung überführen. |
| Einzelknotenproduktion | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) mit Produktions-Env-Datei, MySQL- und Redis-Volumes, rollenbezogenen Tokens, Sicherungen, TLS über Reverse Proxy und festgelegten Image-Tags oder -Digests | Eine VM, ein VPS oder interner Docker-Host mit dauerhaftem Workflow-Zustand und einfachem Betriebsmodell | Host-Hochverfügbarkeit, automatisches Datenbank-Failover, regionsübergreifende Wiederherstellung, unterbrechungsfreie große Topologieänderungen | Die Bereitstellung bedient Produktionsverkehr, und Sie möchten Sicherung, Wiederherstellung, Authentifizierung, TLS, Upgrade oder Rollback prüfen lassen. |
| Kleine Clusterbereitstellung | Veröffentlichte Images `durableworkflow/server` oder `ghcr.io/durable-workflow/server` mit dem [Compose-Rezept](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) als Container-/Prozessvorlage, 2–3 API-Knoten, gemeinsamem externem MySQL/PostgreSQL, gemeinsamem Redis, unabhängig skalierten Workern und genau einem Scheduler/Wartungsprozess | Horizontale API- und Worker-Kapazität, wenn ein Knoten nicht mehr genügt; rollierende Upgrades bei Einhaltung aller Garantien des [Vertrags für rollierende Upgrades](/docs/rolling-upgrades) | SQLite-Clustering, Mehrknotenbetrieb ohne Redis, doppelte Scheduler als Dauertopologie, Aktiv/Aktiv-Datenbanken mit mehreren Schreibern, selbst gehostetes bedienungsfreies regionales Failover, pauschale SLA-Zusagen wie „fünf Neunen“ oder „keine Ausfallzeit“ und selbstständig nutzbares Einregionen-HA-Failover vor bestandener [Veröffentlichungsnachweisprüfung](#release-evidence-status) | Sie benötigen Dimensionierungs-, Ausfallbereichs-, Rollout- oder Wiederherstellungsplanung über mehrere Hosts oder wollen das nachweispflichtige Einregionen-HA-Verhalten beanspruchen. |
| Helm-Chart für Kubernetes | Das [serververwaltete Helm-Chart](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow) aus `oci://ghcr.io/durable-workflow/charts/durable-workflow` mit eigener externer Datenbank, Redis, Ingress und Geheimnisverwaltung | Wiederholbarer Produktionsinstallations- und Upgradeweg für Server, Worker, Singleton-Scheduler, Bootstrap, Service, Prüfungen und Richtlinienressourcen des Charts | Mitgelieferte Persistenz, providerverwaltete Infrastruktur, Aktiv/Aktiv über mehrere Regionen, eigene Operatoren und selbstständig nutzbares Einregionen-HA-Failover vor bestandener [Veröffentlichungsnachweisprüfung](#release-evidence-status) | Sie benötigen providerspezifische Architektur, Kapazität, Wiederherstellung oder Änderungen außerhalb des veröffentlichten Values-Vertrags des Charts. |
| Unveränderte Kubernetes-Manifeste | Die Manifeste unter [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) im Serverrepository mit veröffentlichten Serverimages sowie eigener Datenbank, Redis, Ingress und Geheimnisverwaltung | Teams, die Kubernetes bereits betreiben und prüfbare Manifeste für API, Worker, Scheduler, Bootstrap, Service, Prüfungen, Konfiguration und Geheimnisse möchten | Separater Helm-Lebenszyklus, Validierung verwalteter Kubernetes-Provider, Aktiv/Aktiv über mehrere Regionen, eigene Operatoren, umgebungsspezifische Speicher-/Netzwerk-/Sicherheitsentscheidungen und selbstständig nutzbares Einregionen-HA-Failover vor bestandener [Veröffentlichungsnachweisprüfung](#release-evidence-status) | Sie benötigen Overlays, Validierung verwalteter Cluster, providerspezifische Produktionsplanung oder wollen das nachweispflichtige Einregionen-HA-Verhalten beanspruchen. |
| Aktiv/Passiv-Evaluierung über mehrere Regionen | Validierte Einzelknoten- oder Kleinclusterbereitstellung je Region, asynchrone Datenbankreplikation von aktiv zu Standby und geprüfte Failover-/Failback-Betriebsanleitung | Supportbegleitete Architekturbewertung und umgebungsspezifische Probe regionaler Notfallwiederherstellung | Nachgewiesener selbstständig nutzbarer 2.0-Vertrag, Aktiv/Aktiv über mehrere Regionen, automatisches oder bedienungsfreies regionales Failover, synchrone regionsübergreifende Replikation (RPO=0), aktive regionsübergreifende Sichtbarkeit oder föderierte Suche oder von der Engine erzwungene regionsgebundene Aufgabenwarteschlangen als Routingachse | Bevor Sie in Produktion auf regionsübergreifende Replikation, Failover, Failback, RPO oder RTO vertrauen. |
| Supportbegleitete Topologien | Geprüfter Entwurf für Ihre Umgebung | Selbst gehostetes Aktiv/Passiv oder Aktiv/Aktiv über mehrere Regionen, bedienungsfreies regionales Failover, RPO=0-Replikation zwischen Schreibern, doppelte Scheduler als Dauertopologie, individuelle Sicherheit/Netzwerke, private SLOs, eigene Overlays, Migrationsplanung | Selbstständig nutzbarer Betrieb durch Kopieren und Einfügen | Die Topologie selbst ist Teil des Produktrisikos. |

Die öffentliche Distribution ist bewusst für lokale Entwicklung, Einzelknotenproduktion und kleine Cluster optimiert. Kubernetes-Manifeste stehen Teams zur Verfügung, die Kubernetes bereits betreiben. Material zu Aktiv/Passiv über mehrere Regionen ist ein supportbegleiteter Evaluierungsleitfaden, siehe [Aktiv/Passiv über mehrere Regionen](#activepassive-multi-region), kein nachgewiesener selbstständig nutzbarer 2.0-Vertrag.
Einregionen-HA-Failover, also Failover verwalteter Datenbank und verwalteten Redis, Verlust eines API-Knotens oder Workers sowie Schedulerneustart innerhalb einer Region, bleibt supportbegleitet, solange die Prüfung exakter Veröffentlichungsnachweise geschlossen ist. Siehe [Hochverfügbarkeit und Failover in einer Region](#single-region-high-availability-and-failover). Für selbst gehostete Server bleiben Aktiv/Aktiv über mehrere Regionen, automatisches regionales Failover, doppelte Scheduler als Dauertopologie und providerspezifische Validierung verwalteten Kubernetes supportbegleitet. Sie hängen von Ihren Entscheidungen zu Datenbank, Cache, Netzwerk, Sicherheit, Ausführungsprozessen und Upgrades ab. Das veröffentlichte Helm-Chart ist ein selbstständig nutzbarer Paketierungsweg innerhalb derselben operatorverwalteten Grenzen. Cloud bietet derzeit verwalteten Betrieb und Wiederherstellung in einer Region, keine regionsübergreifende Replikation oder regionales Failover. Siehe [Verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane) und die [Supportgrenze](/docs/support) zum kommerziellen Unterstützungsmodell.

## Nachweise zur Produktionswiederherstellung {#production-recovery-deliverables}

Eine Topologie „produktionsbereit“ zu nennen bedeutet, ihr Wiederherstellungspaket zu veröffentlichen. Containerstart allein genügt nicht. Halten Sie aktuelle Nachweise in derselben Betriebsanleitung wie Bereitstellungsbefehle:

| Weg | Mindestens veröffentlichtes Wiederherstellungspaket |
| --- | --- |
| Einzelknotenproduktion | Sicherungszeitplan, festgelegtes Image oder Digest, Ablageort der Env-/Konfigurationsmomentaufnahme, maximal akzeptierter Wiederherstellungsrückstand und Zeitstempel der letzten erfolgreichen Wiederherstellungsprobe mit Prüfnachweis. |
| Kleine Clusterbereitstellung | Einzelknotenpaket sowie erwartete Folgen des Verlusts eines API-Knotens, Worker-Knotens, Schedulers/Wartungsprozesses, Redis oder der gemeinsamen Datenbank; Worker-Neuregistrierung nach Wiederherstellung und dokumentierte Haltung zu rollierendem Upgrade oder vollständiger Unterbrechung für die aktuelle Veröffentlichung. |
| Helm-Chart für Kubernetes | Clusterpaket sowie Chartversion, Values-Revision, Image-Digest, clusterspezifische Verantwortliche für Ingress und Geheimnisse sowie letzte Chart-Upgrade-/Rollback-Probe. |
| Unveränderte Kubernetes-Manifeste | Clusterpaket sowie clusterspezifische Verantwortliche für Speicher, Geheimnisse, Ingress und Rollout, die vor erneuter Gesundmeldung des Verkehrs wiederhergestellt oder angewendet werden müssen. |
| Einregionen-HA-Evaluierung, supportbegleitet bei geschlossener Veröffentlichungsnachweisprüfung | Cluster- oder Rohmanifestpaket sowie Probenachweise für Failover verwalteter Datenbank und verwalteten Redis, API-Knotenverlust, Worker-Verlust und Schedulerneustart. Jedes Ereignis muss innerhalb des Wiederherstellungsziels des [Einregionen-HA-Vertrags](#single-region-high-availability-and-failover) ohne Verlust bestätigter Schreibvorgänge abschließen. |
| Aktiv/Passiv-Evaluierung über mehrere Regionen, supportbegleitet | Paket je Region sowie Datenbankreplikations- und Fencing-Entwurf, gemessener Replikationsrückstand, operatorverantwortete RPO/RTO, Hochstufungs- und Failback-Betriebsanleitungen sowie umgebungsspezifische Probenachweise. |

Können Sie dieses Paket nicht auf Anfrage vorlegen, behandeln Sie die Umgebung als Staging, bis der Wiederherstellungsvertrag dokumentiert und geprobt ist. Die [Betriebsgrenzen für Operatoren](/docs/operator-operating-envelope) definieren Wiederherstellungsreihenfolge, Prüfdurchlauf und Probenrhythmus für diese Pakete.

## Sicherheit, Daten und Audit {#security-data-and-audit-posture}

Selbst gehostete Durable-Workflow-Bereitstellungen übernehmen die meisten Sicherheitsmaßnahmen aus Ihrer Betriebsumgebung. Veröffentlichen Sie diese Fakten im selben Veröffentlichungs- oder Betriebspaket wie Image-Tag, Migrationsplan und Wiederherstellungsnachweise:

| Bereich | Sachliche Veröffentlichungsaussage |
| --- | --- |
| Datenverarbeitung | Workflow-Argumente, Ergebnisse, Historie, Memos, Suchattribute, Sichtbarkeitslabels, Befehlskontext, Auditzeilen, Ausnahmemeldungen und Operatornotizen können Kundenanwendungsdaten enthalten. [Workflow-IDs](./defining-workflows/workflow-id.md#ids-are-visible-metadata), Suchattribute und Labels sind operatorsichtbare Metadaten, kein Geheimnisspeicher. Workflow-IDs bleiben Klartext und werden von Nutzdaten-Codecs nicht erfasst. |
| Verschlüsselung | TLS für jede produktive HTTP-Schnittstelle verwenden und [Datenbank-TLS](./polyglot/server-config-reference.md#database-tls) für jede Server-Rolle einschließlich Migrationen konfigurieren. Verschlüsselung ruhender Daten stammt aus Datenbank, Objektspeicher, Dateisystem, Warteschlange, Cache und Secret Manager. Workflow-Paket und Server verschlüsseln nicht automatisch jedes Nutzdatenfeld. |
| Compliance | Open-Source-Paket und selbst gehosteter Server liefern Maßnahmen und Auditnachweise, allein aber keine Compliance-Zertifizierung. Aussagen zu SOC 2, HIPAA, PCI, ISO oder FedRAMP gehören zu Ihrem eigenen Programm, sofern ein gehostetes Angebot nichts anderes dokumentiert. |
| Auditlogs | Workflow-Befehle, Zeitplan-Auditereignisse, Historienexportmetadaten und Dienstaufrufdatensätze liefern dauerhafte Betriebsnachweise. Ohne zusätzliche Komponenten bilden sie kein vollständiges SIEM, DLP-System, unveränderliches externes Hauptbuch oder System zur rechtlichen Aufbewahrung. |
| Unterstützung | Rollenbezogene Zugangsdaten, TLS-Terminierung, Sicherungen, Wiederherstellungsproben und eng begrenzte selbstständig nutzbare Topologien sind hier dokumentiert. Erweiterte Identität, mTLS-Rollout, private Netzwerke, eigene Richtlinienengines, Provider-Compliance und individuelle Topologieprüfung sind supportbegleitet, sofern öffentliche Dokumentation nichts anderes sagt. |

Die Netzwerkausgestaltung muss explizit sein:

- **Webhook-Eingang:** Öffentlichen Endpunkt, Authentifizierungsmethode, Replay- oder Idempotenzstrategie, Timeout, Nutzdatenlimit, vertrauenswürdige Proxy-Header-Konfiguration und Geheimnisrotationsplan dokumentieren.
- **Worker-zu-Backend-Verkehr:** TLS-Prüfung, rollenbezogene Worker-Zugangsdaten, Namespace-Header sowie private Netzwerke oder mTLS beim Überqueren nicht vertrauenswürdiger Netze verwenden. Rotation darf Worker-Tokens keine Operatorfähigkeiten erteilen.
- **Operatorschnittstellen:** Waterline, Operator-APIs des eigenständigen Servers, CLI-Automatisierungsendpunkte und eigene Adminoberflächen durch authentifizierte Sitzungen oder rollenbezogene Dienstzugangsdaten schützen, mit CSRF-Schutz für Browsersitzungen und dokumentierten Proxy-/TLS-Grenzen.

## Veröffentlichte Images {#published-images}

Verwenden Sie für selbst gehostete Server veröffentlichte Images:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Digest-Festlegung: `durableworkflow/server@sha256:...` oder `ghcr.io/durable-workflow/server@sha256:...`

Veränderliche Tags nur für lokale Experimente verwenden. Produktions-Env-Dateien sollten ein bestimmtes Versionstag oder Digest festlegen, damit Upgrade und Rollback nachvollziehbar sind.

## Lokale Entwicklung und interne Nichtproduktion {#local-development-and-internal-non-production}

Verwenden Sie das Compose-Rezept mit veröffentlichtem Image für einen Stack ohne Quellcode mit MySQL und Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

Prüfen Sie API, Bereitschaft, Clusterermittlung und Worker-Registrierung:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

Dieser Weg eignet sich für Entwicklung und internes Staging. Er ist keine Produktionssicherheitsgrenze: Das Beispiel verwendet einen gemeinsamen Kompatibilitätstoken, Standarddienstpasswörter, lokale benannte Volumes und kein TLS.

## Einzelknotenproduktion {#single-node-production}

Verwenden Sie dasselbe Compose-Artefakt mit Produktionskonfiguration außerhalb der Versionskontrolle:

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

Starten Sie mit dieser Env-Datei:

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

Betreiben Sie den Host als Produktionsdienst:

- TLS, öffentliches Routing, Anfragelogs und IP-Zulassungslisten in einem Reverse Proxy vor dem API-Container platzieren.
- MySQL und Redis nicht öffentlich freigeben.
- `DW_WORKER_TOKEN` für Worker, `DW_OPERATOR_TOKEN` für Anwendungs- und Operatorverkehr sowie `DW_ADMIN_TOKEN` für Namespace- und Verwaltungsarbeit verwenden.
- MySQL-Volume vor jedem Image-Upgrade und regelmäßig sichern. Redis sollte für geordnete Neustarts erhalten bleiben, aber MySQL bleibt die maßgebliche dauerhafte Workflow-Historienquelle.
- Genaue Env-Datei, Image-Tag oder Digest und Datenbanksicherung für Wiederherstellungen gemeinsam aufbewahren.

Upgrade-Reihenfolge:

1. MySQL sichern und aktuelle Image-Referenz festhalten.
2. Ausschließlich `DW_SERVER_IMAGE` oder `DW_SERVER_TAG` ändern.
3. Neues Image abrufen.
4. `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait` ausführen.
5. Vor dem Wechsel externen Verkehrs `/api/ready`, `/api/cluster/info` und Worker-Registrierung bestätigen.

Die Server-README enthält aktuelle Compose-Befehlsbeispiele unter [Offizielles Image + Compose](https://github.com/durable-workflow/server#official-image--compose).

## Kleine Clusterbereitstellungen {#small-clustered-deployments}

Ein kleiner Cluster erweitert das Einzelknotenmodell maßvoll. Der validierte selbstständig nutzbare Vertrag ist bewusst eng:

- 2–3 zustandslose API-Container hinter einem Load Balancer betreiben. Zustand, Bereitschaft, Clusterermittlung, Worker-Registrierung, Workflow-Aufgabenpolling und -abschluss müssen ohne Sticky Sessions funktionieren.
- Eine gemeinsame externe MySQL- oder PostgreSQL-Datenbank für dauerhafte Historie verwenden. SQLite ist nur für einen Knoten vorgesehen und kein Cluster-Persistenzbackend.
- Gemeinsames Redis für Cache, Long-Poll-Wecksignale, Sperren der Abfrageaufgabenwarteschlange, Aufgabenwarteschlangen-Zulassungssperren und Warteschlangenzustand verwenden. Mehrknotenbetrieb ohne Redis ist kein unterstützter Clustervertrag.
- Während des Rollouts auf jedem API-Knoten `GET /api/cluster/info` prüfen. `topology.current_shape` sollte `standalone_server` bleiben, `topology.current_roles` sollte `api_ingress`, `control_plane`, `matching` und `history_projection` enthalten und `topology.execution_mode` auf eigenständigen Serverknoten `remote_worker_protocol` bleiben. Prüfen Sie mit `topology.matching_role` den tatsächlich bereitgestellten Matching-Pfad: Standardknoten melden `queue_wake_enabled: true`, `shape: "in_worker"` und `wake_owner: "worker_loop"`. Dedizierte Matching-Rollouts setzen Knoten mit `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` auf `queue_wake_enabled: false`, `shape: "dedicated"` und `wake_owner: "dedicated_repair_pass"`. Derselbe Block sollte weiterhin den geplanten `task_dispatch_mode`, die eingefrorenen Routingachsen in `partition_primitives` und das aktuelle `backpressure_model` ausweisen. [Server-Rollentopologie](/docs/polyglot/server-role-topology) erklärt jedes Feld des Topologiemanifests.
- Externe SDK-Worker unabhängig von API-Knoten skalieren. Sie dürfen auf separaten Hosts oder Prozessen laufen, sollten aber den lastverteilten API-Endpunkt statt eines fest gebundenen Knotens ansprechen.
- [Aufgabenwarteschlangen-Zulassung](/docs/polyglot/task-queue-admission) für Warteschlangen konfigurieren, die Mandanten, externe APIs, Datenbankpools oder andere gemeinsame nachgelagerte Abhängigkeiten schützen.
- Genau einen Scheduler oder Wartungsprozess für Zeitplanauswertung, Aktivitätstimeouts und Historienbereinigung betreiben.
- Bootstrap/Migrationen einmal pro Rollout ausführen, bevor neue API- und Worker-Container Verkehr annehmen.
- Den Rolloutmodus dieser Veröffentlichung wählen: vollständige Unterbrechung mit auslaufenden Workern, gestopptem Scheduler/Wartungsprozess, API-Knotentausch, Bootstrap/Migrationen und anschließendem Neustart von Workern und Scheduler; oder [rollierende Upgrades](/docs/rolling-upgrades), wenn alle Garantien dieses Vertrags gelten.
- Datenbank und Redis als primäre Ausfallbereiche behandeln. Servercontainer sind austauschbar, Persistenz- und Koordinationsschichten nicht.

Die veröffentlichten selbstständig nutzbaren Rezepte beginnen in der Form `standalone_server`, obwohl die Clusterermittlung auch `split_control_execution` als unterstützte Produkttopologie nennt. Behandeln Sie dies als einen Vertrag mit unterschiedlichen Rollenzuweisungen. Erproben Sie später eine explizitere Rollentrennung, lesen Sie weiter `topology.current_shape`, `topology.current_roles` und `topology.matching_role` aus `/api/cluster/info`, statt Aufgaben aus Host- oder Containernamen abzuleiten. [Server-Rollentopologie](/docs/polyglot/server-role-topology) erklärt diese Rollenzuweisungen und den Migrationsweg gemeinsam.

Jeder API-Knoten sollte gleiche Authentifizierungstokens oder Signaturschlüssel, Anwendungsversion, Workflow-Paketversion, Nutzdaten-Codec-Konfiguration, Datenbankverbindung und Redis-Verbindung verwenden. Geben Sie jedem Knoten eine eindeutige `DW_SERVER_ID`, damit Clusterermittlung und Logs ihn unterscheiden können.

Die nicht unterstützten Grenzen sind explizit: SQLite-Clustering, Mehrknotenbetrieb ohne Redis, doppelte Scheduler als Dauertopologie, Aktiv/Aktiv-Datenbanken mit mehreren Schreibern, selbst gehostetes bedienungsfreies regionales Failover und pauschale SLA-Zusagen wie „fünf Neunen“ oder „keine Ausfallzeit“ benötigen eigene Validierung oder supportbegleiteten Entwurf. Aktiv/Passiv über mehrere Regionen bleibt ebenfalls supportbegleitetes Evaluierungsmaterial; siehe [Aktiv/Passiv über mehrere Regionen](#activepassive-multi-region). Einregionen-HA-Failover mit verwalteter Datenbank, verwaltetem Redis, API-Knotenverlust, Worker-Verlust und Schedulerneustart ist bis zur bestandenen Veröffentlichungsnachweisprüfung ein supportbegleiteter Evaluierungsvertrag. [Hochverfügbarkeit und Failover in einer Region](#single-region-high-availability-and-failover) beschreibt Engine-Wiederherstellungsziele, Bereitschaftsregeln beim Failover und erforderliche Nachweise zur Öffnung dieser Prüfung.

Dieser Weg ist selbstständig nutzbar, wenn Ihr Team bereits ein klares Modell für VM, Netzwerk, Datenbank, Cache, Sicherung und Load Balancer hat. Er wird supportbegleitet, sobald Sie Hilfe bei diesen Grenzen, Kapazität, Rolloutreihenfolge oder Wiederherstellungsverfahren benötigen.

## Timeout-Budgets für Worker-Long-Polling {#worker-long-poll-timeout-budgets}

Ein gesunder Poll kann bis zum Ende der Serverwartezeit ohne Daten bleiben. Planen Sie diese Stille im HTTP-Client des Workers, ausgehenden Proxy, Service-Mesh, öffentlichen Load-Balancer, Ingress und jedem Reverse-Proxy vor der API ein. Worker-Polls nutzen den gemeinsamen API-Ingress. Eine separate Matching-Rolle umgeht diese Stationen nicht.

| Budget | Begrenzter Bereich |
| --- | --- |
| Poll-Dauer des Servers | Die Wartezeit auf Arbeit bis zur leeren Antwort. `timeout_seconds` der Anfrage überschreibt `DW_WORKER_POLL_TIMEOUT`. Die Variable gilt bei ausgelassenem Feld und ist keine Obergrenze für SDK-Polls. Das Protokoll erlaubt bis zu 60 Sekunden. |
| Verbindungs- / Pool-Timeout des Clients | Verbindung aufbauen oder aus dem Pool erhalten. Diese Phasen müssen nicht die ganze stille Poll-Dauer umfassen. |
| Lese- / Gesamt-Timeout des Clients | Auf Antwortbytes warten oder die ganze Operation begrenzen, wenn der Transport eine Gesamtgrenze bietet. Ergänzen Sie die Serverwartezeit um Verbindungs-, Scheduling- und Antwortspielraum. Ein Lese-Timeout kann nur die Pause zwischen Datenblöcken messen. |
| Idle- / Upstream-Lese- / Anfrage-Timeout der Zwischenstationen | Jede Grenze für aktive Anfragen an jeder Station muss den regulären Poll und seine Antwort erlauben. Keepalive zwischen Anfragen begrenzt etwas anderes. |
| Shutdown / Aufruferfrist | Shutdown-Budget des Workers und ursprüngliche Aufrufer- oder Abfrageautorität bleiben harte Grenzen. Brechen Sie innerhalb dieser Grenzen ab oder schließen Sie ab. Verlängern Sie keine Abfragefrist für Proxy oder Wiederholung. |

Prüfen Sie die Berechnung des installierten SDKs. Die unten verifizierte Python-Version fordert bei positiver Wartezeit höchstens 60 Serversekunden an und ergänzt mindestens fünf Sekunden je HTTP-Phase. Der Worker pollt standardmäßig 35 Sekunden, was normalerweise 40 Sekunden für diese Phasen ergibt. Eine Zwischenstation mit 30 Sekunden Leselimit kann daher einen regulären Standard-Poll abbrechen. PHP und Rust haben eigene Vorgaben und Wiederholungsregeln. Weder Pythons Spielraum noch gRPC-Keepalive ist universell. Siehe [PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/), [Rust](https://rust.durable-workflow.com/) und die [Matching-Referenz](./polyglot/task-matching-dispatch.md).

Normale Control-Plane-Aufrufe mit `Client` im PHP SDK **3.2.0** geben keine standardmäßige HTTP-Gesamtfrist vor; siehe die [verifizierte Timeout-Lücke PHP #203](https://github.com/durable-workflow/sdk-php/issues/203). Konfigurieren Sie dafür einen begrenzten HTTP-Client und erhalten Sie die ursprüngliche Aufruferfrist. Ein Worker-Poll-Timeout begrenzt nicht jede SDK-Anfrage.

PHP SDK **3.4.0 oder neuer** ergänzt für gewöhnliche Control-HTTP-Anfragen des SDK-eigenen Transports ein **standardmäßiges Gesamtzeitlimit von 60 Sekunden**; setzen Sie `requestTimeoutSeconds` auf eine positive Sekundenzahl. Zeitüberschreitungen tragen `reason=request_timeout` und `status=0`. Das SDK versucht einmal: Eine Änderung mit Timeout kann bereits angenommen sein; prüfen Sie ursprüngliche Identität/Ergebnis vor erneutem Senden. Injizierte Clients/Transporte behalten ihre Timeout-Policy und lassen sich nicht mit dieser Option kombinieren. Die Anfragegrenze ersetzt keine Worker-Long-Poll-, Payload-Transfer- oder Workflow/Aufrufer-Fristen. Prüfen Sie `composer.lock`: Diese Mindestversion ändert nicht die gewählte Installationskombination. Siehe [HTTP-Einrichtung](https://php.durable-workflow.com/getting-started/client-setup/) und [normale Installationsabnahme 3.4.0](https://github.com/durable-workflow/sdk-php/issues/203#issuecomment-6363909756).

### Verifiziertes Beispiel mit kurzem Poll {#verified-poll-timeout-example}

Ein isolierter Test nutzte veröffentlichte Python SDK **2.9.0**, PHP Server **2.11.0** und Nginx **1.30.5** mit leerer Warteschlange. Beide Zellen behielten **3 Sekunden** Poll-Dauer, **8 Sekunden** HTTPX connect/read/write/pool und **10 Sekunden** äußere Aufruferfrist. Nur Nginx’ Upstream-Lese-Timeout änderte sich:

| Einstellung der Zwischenstation | Beobachtete Antwort |
| --- | --- |
| `proxy_read_timeout 1s` | Nach etwa einer Sekunde Warten auf den Upstream-Antwortheader lieferte Nginx HTTP **504**. Das SDK meldete `ServerError`. |
| `proxy_read_timeout 8s` | Der reguläre stille Poll endete nach etwa drei Sekunden mit HTTP **200**, `task: null` und `poll_status: empty`. |

Die Servervorgabe betrug in beiden Zellen absichtlich eine Sekunde; die expliziten drei Sekunden der Anfrage galten trotzdem. HTTP-Versuche waren auf einen begrenzt, damit der erste Fehler sichtbar blieb. Das ist ein Funktionstest, keine Kapazitäts- oder Produktionsdimensionierung. Die [Qualifikation in #267](https://github.com/durable-workflow/durable-workflow.github.io/issues/267) enthält genaue Images, Anfragen und Proxy-Logs.

Setzen Sie bei Nginx ein passendes Upstream-Lesebudget im bestehenden Location-Block der Worker-Polls. Die folgenden acht Sekunden gehören zu diesem Drei-Sekunden-Beispiel:

```nginx
proxy_connect_timeout 2s;
proxy_read_timeout 8s;
```

[Nginx misst `proxy_read_timeout` zwischen Upstream-Lesevorgängen](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout). [HTTPX unterscheidet Verbindung, Lesen, Schreiben und Pool](https://www.python-httpx.org/advanced/timeouts/). Acht Sekunden je Phase sind keine achtsekündige Gesamtfrist. Setzen Sie nötigenfalls eine ausdrückliche äußere Frist. Andere Proxys und Anbieter verwenden andere Namen und Bedeutungen. Prüfen Sie den ganzen Weg mit dem tatsächlichen SDK: Ein erhöhtes Ingress-Limit korrigiert keine kürzere Grenze an anderer Stelle.

### Antworten vor einem Worker-Neustart diagnostizieren {#diagnose-poll-disconnects}

- **Regulärer leerer Poll:** Die Laufzeitumgebung antwortet erfolgreich ohne Task. In der verifizierten Version lautet der rohe Status `poll_status: empty`. Pollen Sie normal weiter.
- **Abbruch durch eine Zwischenstation:** Transportausnahme, Verbindungsreset oder Proxy-502/504 können vor dem regulären Warteende auftreten. Vergleichen Sie SDK-Fehler und Dauer mit Proxy-/Upstream-Logs. Gesunde Readiness und spätere erfolgreiche Polls schließen eine Fehlkonfiguration nicht aus.
- **Runtime nicht verfügbar:** Prüfen Sie strukturierten Grund und Readiness für Datenbank, Cache und Admission. Eine HTML-Gateway-Fehlerseite ist keine typisierte Ablehnung der Laufzeitumgebung.
- **Namespace- oder Poll-Admission verweigert:** Prüfen Sie Grund, Namespace/Queue und Wiederholungsabstand, einschließlich HTTP 429. Ein höherer Idle-Timeout schafft weder Kapazität noch Berechtigung.

Eine Wiederverbindung beweist keine gesunde ursprüngliche Proxy-Konfiguration. Prüfen Sie tatsächliche weitere Polls und Task-Abschlüsse; halten Sie bei anhaltenden Fehlern Klasse, Queue, Zeitpunkt und Häufigkeit fest. Ein vereinzelter Abbruch erfordert keinen Prozessneustart. Der Python-Client kann nach HTTP-Timeout-Wiederholungen auch `poll_status: timeout` erzeugen. Dieser Wert allein beweist keine leere Runtime-Antwort durch den Proxy. Trennen Sie Transportwiederholungen, Aktivitätswiederholungen, Run-Fristen und Abfrageautorität.

## SQL-Verbindungsbudgets {#sql-connection-budgets}

Planen Sie Datenbanksitzungen, bevor Sie API-Replikate hinzufügen oder bei einem
[Rolling Upgrade](/docs/rolling-upgrades) alte und neue Prozesse überlappen
lassen. Eine Datenbank kann ihre Verbindungsgrenze erreichen, obwohl noch CPU
frei ist. Diese Grenze ist unabhängig von Schreib-/Commit-Latenz,
HTTP-Anfragekapazität und dem Wachstum gespeicherter Daten.

### Alle Prozesse mit SQL-Verbindungen erfassen {#count-every-sql-owning-process}

Die veröffentlichte PHP-Compose-Bereitstellung umfasst diese möglichen SQL-Clients:

| Rolle | Zu berücksichtigen |
| --- | --- |
| API | Jeder gleichzeitig aktive PHP-Anfrageprozess, der SQL verwenden kann, einschließlich Bereitschaftsprüfungen, Operatoranfragen und wartender Polls. Die veröffentlichte Apache-Prefork-Konfiguration erlaubt 24 Anfrageprozesse je API-Container. Das ist eine HTTP-Prozessobergrenze, weder ein SQL-Pool noch eine Messung von 24 offenen Sitzungen. |
| Laravel-Queue-Worker | Jeder Prozess `php artisan queue:work`. Das veröffentlichte Compose-Rezept startet einen; zusätzliche Worker-Container bringen weitere Prozesse mit. Diese Worker sind von externen SDK-Workern zu unterscheiden. |
| Scheduler/Wartung | Gleichzeitig ausgeführte PHP-Befehle, nicht nur den Scheduler-Container. Der Compose-Scheduler führt Zeitplanauswertung, Reparatur, Aktivitäts-Timeout und Bereinigung nacheinander aus. In seiner normalen Schleife ist daher jeweils ein Befehl aktiv. Halten Sie die Singleton-Regel für den Scheduler ein. |
| Bootstrap und Betriebswerkzeuge | Migrations-/Bootstrap-Befehle, Projektionsneubauten, Aufbewahrungsjobs, Sicherungen, Überwachung und interaktive SQL-Clients, die sich mit der Bereitstellung überlappen können. Zählen Sie bewusst gleichzeitig ausgeführte Befehle einzeln. |
| SDK-Clients und -Worker | Normalerweise keine direkten Sitzungen zur Server-Datenbank, weil die PHP-, Python- und Rust-Service-SDKs HTTP verwenden. Addieren Sie Verbindungen nur, wenn Ihr Aktivitätscode oder anderer Anwendungscode diese Datenbank tatsächlich direkt verwendet. |

Zählen Sie **die verschiedenen SQL-Verbindungshandles jedes Prozesses**, nicht
nur Container oder Hostnamen. Laravels Standardverbindung und
`workflows.storage.connection` können denselben konfigurierten Verbindungsnamen
nutzen. Ein anderer Speichername, eine Datenbankverbindung für Queue, Cache oder
Session oder ein getrenntes Read-/Write-/Direct-Handle kann eine zusätzliche
Sitzung öffnen, auch zum selben Datenbankendpunkt. Redis-Verbindungen sind keine
SQL-Sitzungen. Prüfen Sie die wirksame zwischengespeicherte Konfiguration und
die tatsächlich von jeder Rolle verwendeten Verbindungsnamen.

Bei einer eigenen FPM-Bereitstellung zählen die ausführenden PHP-FPM-Prozesse,
nicht nginx- oder Apache-Event-Threads. Erfassen Sie bei einer eigenen
Octane-Bereitstellung Anfrage-Worker, Task-Worker und tatsächliche
Datenbank-Clients. Übernehmen Sie die Apache-Zahl von 24 Prozessen für keines
dieser Frontends als Poolgröße. Synchrone Long Polls belegen während des Wartens
einen ausführenden PHP-Prozess und können eine Datenbanksitzung behalten.
Setzen Sie einen wartenden HTTP-Poll im SQL-Budget deshalb nicht automatisch
mit null an.

### Konservatives Beispiel für ein Rolling Upgrade {#a-conservative-rolling-upgrade-example}

Dies ist ein Planungsbeispiel, **keine gemessene Kapazität**. Angenommen, die
Datenbank erlaubt 120 Client-Sitzungen, zehn entfallen auf andere Anwendungen
und fünfzehn bleiben für Wiederherstellung und Administration reserviert.
Damit stehen dieser Bereitstellung 95 zur Verfügung. Queue und Cache verwenden
Redis; je PHP-Prozess wird höchstens ein SQL-Handle angenommen.

| Maximale Überlappung | Berechnung | Geplante Sitzungen |
| --- | --- | ---: |
| API-Replikate einschließlich eines zusätzlichen Rollout-Replikats | `(2 + 1) × 24 × 1` | 72 |
| Laravel-Queue-Worker | `2 × 1` | 2 |
| Singleton-Scheduler-/Wartungsbefehl | `1 × 1` | 1 |
| Bootstrap/Migration | `1 × 1` | 1 |
| Sicherung, Überwachung und weitere freigegebene Werkzeuge | Explizites Budget | 4 |
| **Zwischensumme der Bereitstellung** | | **80** |
| Noch nicht zugeteilte Reserve der Bereitstellung | `95 − 80` | 15 |

Unter diesen Annahmen würde ein viertes API-Replikat die Zwischensumme auf 104
erhöhen und das Budget von 95 Sitzungen überschreiten. Zwei SQL-Handles je
API-Prozess würden allein für drei API-Replikate bereits 144 Sitzungen
benötigen. Berechnen Sie das Budget bei Änderungen der Speicherverbindungen,
Worker-Zahl oder Rollout-Überlappung neu. Begrenzen Sie Prozesse und Replikate
oder ersetzen Sie sie schrittweise, statt ausreichende Datenbankreserven
vorauszusetzen. Auch eine Erhöhung von `max_connections` erfordert eine Prüfung
des Datenbankspeichers und der Arbeitslast.

### Budget beobachten und durchsetzen {#observe-and-enforce-the-budget}

1. Erfassen Sie die wirksame Verbindungsgrenze, fremde Clients und reservierte
   Wiederherstellungszugänge. Legen Sie Höchstzahlen für API-Replikate und
   -Prozesse sowie zusätzliche Rollout-Replikate fest. Berücksichtigen Sie
   überlappende Queue-Worker-Generationen und Werkzeuge.
2. Beobachten Sie in einer isolierten Kopie mit Ihrem exakten veröffentlichten
   Image und Ihrer Konfiguration Sitzungen im Leerlauf, bei wartenden Polls,
   während echter Arbeit und bei einer begrenzten Alt-/Neu-Überlappung. Zählen
   Sie inaktive Sitzungen und den Monitor selbst mit. PostgreSQL bietet
   `pg_stat_activity`, MySQL `information_schema.PROCESSLIST`. Verwenden Sie
   eine passend eingeschränkte Überwachungsrolle und exportieren Sie keine
   SQL-Texte oder Nutzdaten.
3. Vergleichen Sie beobachtete Sitzungen je Anwendungsbenutzer und Datenbank
   mit dem geplanten Budget pro Prozess. Eine kurze Stichprobe prüft die
   Annahmen dieser Testumgebung, weder eine Sättigungsgrenze noch eine Garantie
   für jede Arbeitslast.
4. Beobachten Sie neben freien Sitzungen auch Verbindungsablehnungen,
   Transaktions-/Commit-Latenz, Lock-Wartezeiten, wartende HTTP-Anfragen und
   Speicherwachstum. Bereitschaft allein beweist keine freie Rollout-Kapazität.
5. Verringern Sie nahe der Grenze die Überlappung oder leeren und beenden Sie
   eine alte API-/Worker-Gruppe, bevor Sie deren Ersatz starten. Erhalten Sie
   Wiederherstellungszugänge und führen Sie Bootstrap nur im geplanten
   Migrationsfenster aus. Passt eine sichere Überlappung nicht, verwenden Sie
   das dokumentierte Upgrade-Verfahren mit vollständiger Unterbrechung.

[Task-Queue-Zulassung](/docs/polyglot/task-queue-admission) begrenzt ausgewählte
Dispatch- und Lease-Aktivität. `DW_WORKER_LONG_POLL_MAX_CONCURRENT` und
`DW_QUERY_TASK_POLL_MAX_CONCURRENT` begrenzen wartende Polls je Knoten. Keine
dieser Einstellungen begrenzt global SQL-Sitzungen, Datenbankbytes oder
Commit-Latenz. Halten Sie auch Kapazität für Abschlüsse, Heartbeats,
Operatoranfragen und Zustandsprüfungen frei.

Verwenden Sie einen direkt erreichbaren beschreibbaren Datenbankendpunkt als Ausgangspunkt. Ein Verbindungsproxy muss mit exakter Server-Version, Poolmodus und Einstellungen für vorbereitete Anweisungen, Transaktionsgrenzen, Sitzungszustand und Sperren qualifiziert werden. **PgBouncer-Transaktionspooling erfordert den korrigierten Server ab Version 2.9.8.** Die [Abnahme der veröffentlichten Version 2.9.8](https://github.com/durable-workflow/server/issues/524#issuecomment-6293185092) qualifiziert PostgreSQL 16.15 mit PgBouncer 1.26.1: direkte PostgreSQL-Verbindung, Sitzungspooling und Transaktionspooling mit `max_prepared_statements=0` oder `max_prepared_statements=200`. Das bezeichnet eine Kompatibilitätsuntergrenze und eine exakt geprüfte Konfiguration, keine Empfehlung zur neuesten Version oder Kapazitätsgarantie; prüfen Sie andere Kombinationen gesondert. Führen Sie vor der Verkehrsfreigabe die normale Initialisierung mit `server-bootstrap` über den gewählten Endpunkt aus.

`GET /api/ready` führt eine Datenbank-Leseabfrage mit gebundenen Parametern (`bound_read_query`) und konfigurierte Bereitschaftsprüfungen aus; die Schreibkapazität bleibt ausdrücklich ungeprüft. Erfolgreiche TCP-Verbindungen, Migrationen oder Bereitschaftsantworten beweisen nicht jede Workflow-SQL-Operation oder die Commit-Kapazität. Lesereplikate dürfen den maßgeblichen Schreiber für Claims und dauerhafte Übergänge nicht ersetzen.

## Helm-Chart für Kubernetes {#helm-chart-for-kubernetes}

Das Serverrepository verantwortet [Chart-Quellcode und Veröffentlichungshinweise](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow). Installieren Sie das veröffentlichte Chart aus der OCI-Registry:

```bash
helm install durable-workflow \
  %%artifact.helmChartRepository%% \
  --version %%artifact.helmChartVersion%% \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Ihre Values-Datei muss auf externes MySQL/PostgreSQL und Redis verweisen, Produktionszugangsdaten über vorhandene Kubernetes Secrets bereitstellen und ingress/TLS für Ihre Umgebung konfigurieren. Das Chart erstellt weder Persistenz noch vom Anbieter verwaltete Infrastruktur. Fixieren Sie das Server-Image für ein reproduzierbares Deployment per Digest.

### Einen Chart-Release auswählen {#helm-chart-selection}

Jeder Chart-Release hält das getestete Server-Image in der `appVersion` der `Chart.yaml` fest; Chart und Server haben unabhängige Versionsnummern. Die ausgewählte [kompatible Kombination](./compatibility.md#last-qualified-reproducible-tuple) verbindet Chart **%%artifact.helmChartVersion%%** mit Server **%%artifact.helmChartAppVersion%%** aus denselben Release-Metadaten wie Tabelle und Installationsbefehl. Der [Prüfbericht zu OCI/veröffentlichtem Paket](%%artifact.helmChartQualificationUrl%%) bestätigt diese Kombination, keine neue Kubernetes-Installation.

Prüfen Sie für eine andere Server-Version die `Chart.yaml` des vorgesehenen veröffentlichten Charts (die [ausgewählte Chart-Quelle](%%artifact.helmChartSourceUrl%%) dient als Beispiel) und wählen Sie eine exakte Chart-Version, deren `appVersion` dem gewünschten Server entspricht. Lesen Sie die [UPGRADING-Hinweise](%%artifact.helmChartUpgradeUrl%%) des ausgewählten Releases einschließlich jeder übersprungenen Chart-Version. Leiten Sie die Chart-Version nicht aus der Server-Version ab und wählen Sie kein unveröffentlichtes Chart aus dem aktuellen Quellstand.

Ein Override von `image.tag` ändert das Image, ohne die aufgezeichnete `appVersion` des Charts zu ändern. Damit entsteht eine eigene Chart-/Image-Kombination, bis gerenderte Manifeste, Bootstrap, Rollout und Runtime gesondert qualifiziert wurden. Behalten Sie übliche Datenbanksicherungen und Rollback-Grenzen im Upgrade-Plan bei; erfolgreiches Rendern allein belegt kein funktionierendes Deployment.

Die veröffentlichte Historie enthält eine Ausnahme: Chart 0.2.2 wechselte unter einer Chart-Patchnummer auf eine neue Server-Minor-Version. Die spätere [veröffentlichte Korrektur](https://github.com/durable-workflow/server/blob/2.11.0/k8s/helm/durable-workflow/docs/UPGRADING.md#chart-022--server-210) erkennt die Ausnahme an und kehrt zur erklärten Minor-Versionspolitik zurück. Historische Versionen bleiben unverändert; dieser Hinweis wählt keine spätere Server-/Chart-Kombination aus.

## Kubernetes-Manifeste {#kubernetes-manifests}

Das Serverrepository enthält unter [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) unveränderte Manifeste für Teams mit bestehendem Kubernetes-Betrieb:

- Namespace und gemeinsame Labels
- Trennung von ConfigMap und Secret
- Bootstrap-/Migrations-Job
- API-Deployment und Service
- Worker-Deployment
- Scheduler-CronJob
- PodDisruptionBudget
- Liveness-Prüfung `/api/health` und Readiness-Prüfung `/api/ready`
- zurückhaltende Ressourcenanforderungen und -grenzen

Ersetzen Sie vor dem Anwenden den Image-Tag durch eine konkrete veröffentlichte Version oder einen Digest, geben Sie echte Datenbank- und Redis-Zugangsdaten an und verbinden Sie ConfigMap-Werte mit den bereits betriebenen Clusterdiensten. Die Manifeste sind bewusst direkt und prüfbar. Sie sind kein Helm-Chart und versprechen kein generisches Verhalten verwalteten Kubernetes.

Weisen Sie für einen Kubernetes-Produktionsrollout mindestens Folgendes nach:

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

Einregionen-HA-Failover mit verwalteter Datenbank, verwaltetem Redis, API-Knotenverlust, Worker-Verlust und Schedulerneustart bleibt auf dem Rohmanifestweg ebenso wie im kleinen Cluster supportbegleitet, solange die Veröffentlichungsnachweisprüfung geschlossen ist. Der beabsichtigte Vertrag erfordert die Regeln für Bereitschaft, Singleton-Scheduler und gemeinsame Basissysteme unter [Hochverfügbarkeit und Failover in einer Region](#single-region-high-availability-and-failover). Providerspezifische Load Balancer, Speicherklassen, Netzwerkrichtlinien, Aktiv/Aktiv über mehrere Regionen und selbst gehostetes bedienungsfreies regionales Failover bleiben supportbegleitet oder werden separat vom Rohmanifestvertrag verfolgt. Verwenden Sie den separat versionierten Helm-Weg oben für Helm-verwaltete Installation und Upgrades.

## Hochverfügbarkeit und Failover in einer Region {#single-region-high-availability-and-failover}

Einregionen-HA-Failover ist derzeit ein **unverifizierter, supportbegleiteter** Vertragskandidat auf Basis des kleinen Clusters und der unveränderten Kubernetes-Form. Er zielt auf Fehlermodi, für deren Überstehen die Engine **innerhalb einer Region** ausgelegt ist: Failover verwalteter Datenbanken wie RDS Multi-AZ, Aurora-Cluster, Cloud SQL HA oder Patroni-Hochstufung; Failover verwalteten Redis wie Sentinel, Elasticache-Replikationsgruppen oder Memorystore HA; API-Knotenverlust, Worker-Verlust und Neustart des Schedulers/Wartungsprozesses. Regionsübergreifende Aktiv/Passiv-Wiederherstellung ist eine andere supportbegleitete Evaluierung. Siehe [Aktiv/Passiv über mehrere Regionen](#activepassive-multi-region).

Der beabsichtigte Vertrag mit Engine-Verhalten, Bereitschaftsregeln, Wiederherstellungszielen je Ereignis, Split-Brain-Vermeidung und Probenabnahmetest liegt in der Workflow-Bibliothek unter [`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md) und im eigenständigen Server unter [`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md). Dieser Abschnitt bildet die öffentliche Darstellung dieser Dokumente.

### Stand der Veröffentlichungsnachweise {#release-evidence-status}

Für die dokumentierte öffentliche Serververöffentlichung ist kein bestandener Nachweis der exakten Veröffentlichung verlinkt. Der aufgezeichnete Versuch mit veröffentlichtem Image stoppte in `topology_start` beim Warten auf API-Bereitschaft, bevor eine Aussage zur Fehlermatrix oder zu Wiederherstellungsgrenzen möglich war. Weder vorhandener Runner noch Szenariomanifest oder bereitstellungsspezifische Probe belegen, dass das veröffentlichte Image die vollständige Matrix bestanden hat. Einregionen-HA bleibt daher supportbegleitet.

Die Darstellung als selbstständig nutzbar ist erst zulässig, wenn ein Lauf ohne Produktquellcode die genau dokumentierte Serververöffentlichung für Image, Runner und Compose-Topologie verwendet und ein `single-region-failover-result.json` veröffentlicht mit `outcome: "pass"`, `runner_blocked: false`, jedem Eintrag von `phase_outcomes` auf `status: "pass"`, bestandenen Urteilen aller Wiederherstellungsgrenzen und Nachweisen für jedes erforderliche Szenario im öffentlichen [Szenariomanifest für Einregionen-Failover](/platform-conformance/single-region-failover-scenarios.json). Dieses öffentliche bestandene Ergebnis muss von diesem Statusabschnitt verlinkt sein und dasselbe Serverimage wie `%%artifact.serverDockerHubImage%%` nennen. Bis alle Bedingungen erfüllt sind, sind die folgenden Wiederherstellungsgrenzen Evaluierungsziele und keine Validierungsbehauptungen für veröffentlichte Images.

### Vorgesehene Topologie {#candidate-topology}

Der beabsichtigte HA-Vertrag gilt bei passender Kleincluster- oder Rohmanifestform und drei vom Operator erhaltenen Regeln:

- **Immer genau ein beschreibbarer Workflow-Datenbankendpunkt.** Verwaltetes Failover wie RDS Multi-AZ, Aurora, Cloud SQL HA oder Patroni ist zulässig, wenn der vorherige Primärknoten vor Wiederanbindung durch Fencing abgesichert wird: Schreibbenutzer entziehen, mit `read_only=on` herabstufen, Replikation trennen oder aus bekannt guter Momentaufnahme wiederherstellen. Ein Verbindungsproxy muss die vom Server verwendete Datenbanksemantik erhalten und mit exakter Version, Modus und Einstellungen qualifiziert werden. [SQL-Verbindungsbudgets](#sql-connection-budgets) beschreibt die Versionsanforderungen und geprüften Modi für PgBouncer-Transaktionspooling.
- **Jeweils ein Redis-Endpunkt mit dokumentiertem Hochstufungspfad.** Verwaltetes Redis-Failover wie Sentinel, Elasticache oder Memorystore HA ist zulässig. Redis ist Beschleunigungsschicht, nicht Korrektheitsgrundlage. Redis-Failover ist daher ein Latenzereignis, niemals ein Korrektheitsereignis.
- **Immer genau ein Scheduler/Wartungsprozess.** Der Orchestrator, etwa ein Compose-Service mit `deploy.replicas: 1`, eine durch Host-Lease geschützte systemd-Unit oder ein Kubernetes-`Deployment` mit `replicas: 1` und `RollingUpdate.maxSurge: 0`, erhält die Singleton-Invariante beim Neustart. Doppelte Scheduler als Dauertopologie gehören nicht zu diesem Vertrag.

### Verhalten je Ereignis und Wiederherstellungsziele {#per-event-behavior-and-recovery-targets}

Der beabsichtigte Engine-Vertrag definiert begrenzte Wiederherstellungsziele pro Ereignisklasse. Bei geschlossener Veröffentlichungsnachweisprüfung sind dies keine Garantien veröffentlichter Images. Die vom Operator beobachtete reale Wiederherstellungszeit ist das Engine-Ziel plus Hochstufungslatenz des verwalteten Dienstes.

| Ereignis | Vorgesehenes Engine-Verhalten | Wiederherstellungsziel nach Rückkehr des Basissystems / Prozesses |
| --- | --- | --- |
| Failover verwalteter Datenbank | Schreibzugriffe liefern Fehler und werden nicht still gepuffert. Lesezugriffe liefern Fehler. `/api/ready` schlägt auf jedem API-Knoten und Scheduler fehl. Keine bestätigte Arbeit geht verloren. | Ein Neuverbinden des Verbindungspools plus ein `task_repair`-Intervall (Standard 3 s) plus ein Long-Poll-Timeout (Standard 30 s, maximal 60 s) für laufende Poller. |
| Failover verwalteten Redis | Verlorene Wecksignale → Ermittlung fällt auf Long-Poll-Timeout zurück. Zustandsprüfungen der Beschleunigungsschicht werden **warning**, nicht error. `/api/ready` bleibt üblicherweise grün. | Neuverbindungsintervall des Redis-Clients. |
| API-Knotenverlust (1 von N) | Load Balancer entfernt den ausgefallenen Knoten innerhalb seines Bereitschaftsintervalls. Laufende Anfragen dorthin schlagen am Load Balancer fehl und werden vom Client wiederholt. | Bereitschaftsintervall des Load Balancers, operatorgesteuert, typischerweise 5–10 s. |
| Worker-Verlust | Aufgaben des ausgefallenen Workers pausieren bis zum Lease-Ablauf. Andere Worker übernehmen ihre eigenen Aufgaben weiter. | Lease-Ablauf, 5 Minuten für Aktivitätsaufgaben, plus ein `task_repair`-Intervall. |
| Scheduler-/Wartungsneustart | Zeitplanauslösung, Aktivitätstimeout-Durchsetzung und Historienbereinigung pausieren. Alle drei setzen beim nächsten Tick nach dem Neustart fort. Wegen des Singleton-Prozesses gibt es keine doppelten Auslösungen. | Neustartlatenz des Orchestrators plus ein Scheduler-Tick. |

### Regeln für Load Balancer, Bereitschaft und Verkehrswechsel {#load-balancer-readiness-and-traffic-shift-rules}

Der Load Balancer vor den API-Knoten ist der einzige Entscheidungspunkt für Verkehrszulassung während eines Failovers:

- Verbinden Sie ihn mit **`GET /api/ready`**, nicht nur mit `/api/health`. `/api/health` belegt ausschließlich HTTP-Bedienung. `/api/ready` meldet Datenbankverbindung und konfigurierte Bereitschaftsprüfungen einschließlich gesunder oder beeinträchtigter Redis-Weckbeschleunigung. Es testet nicht jede Workflow-SQL-Operation und prüft keine Schreibkapazität. Bei Datenbankausfall schlägt `/api/ready` korrekt auf jedem Knoten fehl. Der Load Balancer MUSS den Zustand vollständig ausgefallener Knoten tolerieren, statt auf eine veraltete zuletzt gute Liste zurückzufallen.
- Prüfintervall 5–10 Sekunden und Entfernungsschwelle 2–3 aufeinanderfolgende Fehler verwenden.
- Keine Sticky Sessions verlangen. Der Kleincluster-Funktionstest belegt, dass ein externer Worker auf `server-a` pollen und auf `server-b` abschließen kann.
- Bei reinem Redis-Failover bleibt die Bereitschaft auf jedem Knoten grün, solange die datenbankgestützten dauerhaften Pfade verfügbar sind. Die Beeinträchtigung der Beschleunigungsschicht erscheint als `checks.cache.status=warning` mit `checks.cache.degraded_capability=long_poll_wake_acceleration`. Konfigurieren Sie keine Knotenentfernung aufgrund dieser Warnung.

Nach Wiederherstellung der Basissysteme wird folgende Prüfung empfohlen: Auf 200 von `/api/ready` mindestens eines Knotens warten; `/api/cluster/info` mit Admin-Token über den Load Balancer abrufen und Topologiemanifest bestätigen; `POST /api/worker/register` für einen Prüf-Worker über den lastverteilten Endpunkt ausführen; genau einen aktiven Scheduler im Orchestrator bestätigen; externen Verkehr wieder aufnehmen.

### Probe mit exakten Artefakten ausführen {#run-the-exact-artifact-rehearsal}

Die Serververöffentlichung enthält eine wiederverwendbare Basisprobe für die vollständige Fehlermatrix, ohne Produktcode aus einem Checkout zu bauen. Runner und Compose-Topologie müssen aus demselben Veröffentlichungstag wie das Serverimage stammen. Kombinieren Sie keinen beweglichen Standardbranch-Checkout mit einem beliebigen Image. Führen Sie auf einem sauberen Host mit Docker Engine, Docker Compose v2, Python 3.11 oder neuer und öffentlichem Registry-Zugriff Folgendes aus:

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

Dieser Weg leitet Checkout und `DW_SERVER_IMAGE` bewusst aus einer Veröffentlichungsvariablen ab. Überschreiben Sie das Image nicht unabhängig. Wählen Sie vor dem Klonen durch Änderung von `DW_SERVER_RELEASE` eine andere Veröffentlichung. Der Runner verlangt einen konkreten öffentlichen Server-Tag oder -Digest, lädt alle unterstützenden Images, löst alle Laufzeitimages auf Repository-Digests auf und lehnt Compose-Buildabschnitte, Bind-Mounts von Produktquellcode sowie lokale oder rollierende Serverreferenzen ab. Er startet genau zwei API-Knoten hinter einem nginx-Endpunkt, eine MySQL-Datenbank, einen Redis-Dienst und einen Scheduler/Wartungsprozess.

Das resultierende `single-region-failover-result.json` verwendet das Schema `durable-workflow.v2.single-region-failover.result`. Es erfasst genaue Artefakt- und Werkzeugversionen, normalisierte Topologie, Bereitschaftsübergänge, gemessene Wiederherstellungszeiten und Grenzurteile, Workflow-/Lauf-/Aufgaben-/Zeitplanidentitäten sowie Duplikat-/Verlustprüfungen für knotenübergreifenden Abschluss, API-Knotenverlust, Datenbankunterbrechung, Redis-Unterbrechung, Worker-Lease-Verlust und Singleton-Scheduler-Neustart. Externe Runner ermitteln Aufruf und öffentliches Szenariomanifest über `GET /api/cluster/info` unter `single_region_failover_contract`.

Ein Ergebnis validiert engine-sichtbare Unterbrechung und Wiederherstellung gegen das veröffentlichte Image nur nach bestandener obiger Veröffentlichungsnachweisprüfung. Ein fehlgeschlagenes, teilweises oder Runner-blockiertes Ergebnis ist ein diagnostischer Nachweis, keine Validierung. Auch eine bestandene Basisprobe macht den Neustart eines lokalen MySQL- oder Redis-Containers nicht zum Nachweis eines Cloud-Provider-Hochstufungsmechanismus. Bewahren Sie provider-native Nachweise für Hochstufung, Fencing, RPO und verstrichene Zeit neben dem Basisergebnis auf, bevor Sie verwaltete Hochverfügbarkeit beanspruchen.

### Ergänzungen zum Wiederherstellungspaket {#recovery-packet-additions}

Eine Kleincluster- oder Rohmanifestbereitstellung, die diesen Vertrag beansprucht, MUSS ihr Wiederherstellungspaket gemäß den [Betriebsgrenzen für Operatoren](/docs/operator-operating-envelope) mit Probenachweisen jeder Ereignisklasse erweitern:

- Failover verwalteter Datenbank ohne Verlust bestätigter Schreibvorgänge innerhalb der obigen begrenzten Wiederherstellungszeit;
- Failover verwalteten Redis ohne Flattern der Load-Balancer-Rotation und ohne Verlust bestätigter Arbeit, mit `checks.cache.status=warning` und `long_poll_wake_acceleration` als beeinträchtigter Fähigkeit;
- API-Knotenverlust, den der Load Balancer innerhalb des konfigurierten Bereitschaftsintervalls ohne Verlust bestätigter Schreibvorgänge abfängt;
- Worker-Verlust, der den dauerhaften Lauf bis zum Lease-Ablauf erhält, nach der konfigurierten Reparaturgrenze erneut übernimmt und genau einmal abschließt;
- Schedulerneustart auf einem anderen Host ohne doppelte Zeitplanauslösung und ohne Zeitplan, der über `next_fire_at` plus einen Tick hinaus unausgewertet bleibt.

Bei geschlossener Veröffentlichungsnachweisprüfung bleibt jede Bereitstellung supportbegleitet, auch wenn ihre eigene Probe besteht. Öffnet ein öffentliches Ergebnis aller Phasen die Veröffentlichungsprüfung, wird eine Bereitstellung erst selbstständig nutzbar, wenn ihre umgebungsspezifischen Probenachweise im Operator-Wiederherstellungspaket dokumentiert und im Rhythmus der Betriebsgrenzen für Operatoren erneuert werden.

### Grenze zu nicht unterstützten HA-Zusagen {#boundary-against-unsupported-ha-claims}

Der Einregionen-HA-Vertrag ist bewusst eng. Folgendes bleibt **außerhalb** und erfordert weiter supportbegleiteten Entwurf, da die Topologie selbst Produktrisiko ist:

- Aktiv/Aktiv-Datenbanktopologien mit mehreren Schreibern;
- Aktiv/Passiv über mehrere Regionen und automatisches oder bedienungsfreies regionales Failover für Selbsthosting. Der [nächste Abschnitt](#activepassive-multi-region) enthält Evaluierungshinweise;
- synchrone regionsübergreifende Datenbankreplikation (RPO=0);
- doppelte Scheduler/Wartungsprozesse als Dauertopologie;
- von der Engine erzwungene regionsgebundene Aufgabenwarteschlangen als Routingachse;
- providerspezifische Validierung verwalteten Kubernetes jenseits des Paketierungsvertrags des veröffentlichten Charts;
- pauschale SLA-Zusagen wie „fünf Neunen“ oder „keine Ausfallzeit“ jenseits der obigen begrenzten Wiederherstellungszeiten.

Der Vertrag betrifft *begrenzte Wiederherstellung bei benannten Ereignissen*. Er ist kein Verfügbarkeitsversprechen, das von Datenbank-, Netzwerk- und Orchestratorentscheidungen des Operators abhängt. Marketing- oder SLA-Aussagen für Selbsthosting DÜRFEN diese Grenze ohne eigene Validierung NICHT überschreiten.

## Aktiv/Passiv über mehrere Regionen {#activepassive-multi-region}

Aktiv/Passiv über mehrere Regionen sind **supportbegleitete Evaluierungshinweise**, kein nachgewiesener selbstständig nutzbarer Vertrag innerhalb der unterstützten 2.0-Betriebsgrenzen. Prüfen Sie damit eine mögliche Architektur und entwickeln Sie mit Support eine umgebungsspezifische Probe, bevor Sie sich in Produktion darauf verlassen. Jede Region beginnt weiterhin mit einem dokumentierten Einzelknoten-, Kleincluster- oder unveränderten Kubernetes-Weg. Diese Einregionen-Verträge belegen jedoch keine regionsübergreifende Replikation, Failover, Failback, RPO, RTO oder Split-Brain-Verhalten. Vertiefter Entwurf zu maßgeblichen Daten, Replikationsannahmen, Namespace-/Aufgabenwarteschlangen-/Worker-Verhalten, Failover-/Failback-Betriebsanleitung, Fencing und Konsistenz-/Latenzabwägungen liegt in der Workflow-Bibliothek unter [`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md) und im eigenständigen Server unter [`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

Zu evaluierende Form:

- Eine **aktive Region** mit validiertem Einzelknoten- oder Kleinclustervertrag: API-Container hinter Load Balancer, gemeinsames externes MySQL oder PostgreSQL als beschreibbare dauerhafte Datenbank, gemeinsames Redis, genau ein Scheduler/Wartungsprozess und externe Worker.
- Eine **Standby-Region** mit asynchron repliziertem Standby der Workflow-Datenbank, optionalem Standby-Redis, keinem Scheduler/Wartungsprozess und null oder mehr vorab bereitgestellten API-/Worker-Containern, die bis zur Hochstufung untätig sind.
- Ein **regionales Failover** als ausdrückliche Operatorarbeit: Schreibverkehr zur ausgefallenen Region stoppen, Replikationsstand gegen das veröffentlichte RPO bestätigen, Standby-Datenbank hochstufen, erforderliche Versionsmigrationen auf dem neuen Primärknoten ausführen, Singleton-Scheduler/Wartungsprozess in der neuen aktiven Region starten, Worker-Endpunkte und externen Verkehr umschalten sowie abgeleitete Projektionen neu aufbauen. Es gibt keine automatische regionsübergreifende Umstellung.
- Ein **Failback** mit derselben umgekehrten Reihenfolge nach Rückkehr der ursprünglichen Region. Der wiederhergestellte Primärknoten wird vor der Wiederanbindung als Standby durch Fencing abgesichert: Schreibbenutzer entziehen, mit `read_only=on` herabstufen, Replikation trennen oder aus bekannt guter Momentaufnahme wiederherstellen.

Maßgebliche Daten und Replikationsannahmen:

- Die Workflow-Datenbank ist die einzige dauerhafte maßgebliche Quelle und regionsgebunden. Genau eine Region schreibt zu jedem Zeitpunkt. Die Datenbank der Standby-Region ist bis zur Hochstufung eine Lesereplik. Das Wiederherstellungspunktziel RPO ist der asynchrone Replikationsrückstand, das Wiederherstellungszeitziel RTO die Ausführungszeit der Operator-Betriebsanleitung.
- Redis ist regionslokale Beschleunigung. Wecksignale, Sperren der Abfrageaufgabenwarteschlange und Zulassungssperren werden nicht regionsübergreifend weitergegeben und dürfen nicht so vorausgesetzt werden. Jede Region betreibt eigenes Redis. Der Standby-Cache ist nach Operatorentscheidung kalt oder warm. Korrektheit hängt nicht von seinem Erhalt beim Failover ab.
- Sichtbarkeit kommt aus der Datenbank der aktiven Region. Erst hochstufen, dann lesen.

Verhalten von Namespace, Aufgabenwarteschlange und Worker-Registrierung:

- Namespaces und Aufgabenwarteschlangen liegen in der Workflow-Datenbank und überstehen die Hochstufung exakt im Stand des letzten replizierten Commits. Die Engine teilt sie nicht regional auf.
- Worker der neuen aktiven Region registrieren sich nach der Hochstufung am lokalen API-Endpunkt. Bestehende Registrierungen der ausgefallenen Region bleiben in der Datenbank und verfallen über den normalen Worker-Ablaufpfad.
- Build-ID-Rollouts und Bereitstellungslebenszykluszustand überstehen Failover, weil sie in der Workflow-Datenbank liegen.

Abwägungen zwischen Konsistenz und Latenz im Normalbetrieb:

- Workflow-Starts, Signale und Updates werden gegen die Datenbank der aktiven Region bestätigt. Ihre Latenz ist deren Commitlatenz. Während des Entzugs der Zuständigkeit beim Failover werden sie abgelehnt.
- Workflow- und Aktivitätsaufgabenzustellung folgen innerhalb der aktiven Region dem Einregionen-Beschleunigungsvertrag: unter einer Sekunde bei gesundem Redis, andernfalls dauerhafter Pollingrhythmus.
- Zeitpläne werden vom Singleton-Scheduler der aktiven Region ausgelöst und pausieren ohne laufenden Scheduler. Nach Hochstufung setzen Auslösungen aus dauerhaften Zeitplanzeilen fort.
- Sichtbarkeitslesezugriffe bieten Read-after-write nur innerhalb der aktiven Region. Die Engine bietet kein regionsübergreifendes Lesen eigener Schreibvorgänge und kein RPO=0.

Die Notfallwiederherstellungsgrenze ist explizit: Dieser Entwurf ersetzt weder Sicherungen noch Nachweise. Das Wiederherstellungspaket aus den [Betriebsgrenzen für Operatoren](/docs/operator-operating-envelope) bleibt erforderlich, ergänzt um Replikationsrückstands-SLO, Latenz der Hochstufungsbetriebsanleitung, Datum der letzten erfolgreichen Failover-Probe und Fencing-Verfahren für den wiederhergestellten Primärknoten.

Für Selbsthosting bleiben Aktiv/Passiv und Aktiv/Aktiv über mehrere Regionen, automatisches regionales Failover, synchrone regionsübergreifende Replikation (RPO=0), aktive regionsübergreifende Sichtbarkeit und von der Engine erzwungene regionsgebundene Aufgabenwarteschlangen als Routingachse [supportbegleitet](/docs/support), weil die Topologie selbst Produktrisiko ist. Der aktuelle [Vertrag für die verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane) gilt für eine Region und liefert diese Mehrregionengarantien nicht.

## Bereitschaftsvertrag {#readiness-contract}

Verwenden Sie Zustands- und Bereitschaftsprüfungen:

- `GET /api/health` belegt HTTP-Bedienung durch den Prozess.
- `GET /api/ready` meldet konfigurierte Abhängigkeitsprüfungen einschließlich Datenbankverbindung, Migrationen und Bereitschaft des Standard-Namespace. Es beweist weder jede Workflow-SQL-Operation noch verfügbare Schreibkapazität.
- `GET /api/cluster/info` belegt, dass ein authentifizierter Client Build-Identität, Control-Plane-Protokoll, Worker-Protokoll, Nutzdaten-Codecs und Serverfähigkeiten ermitteln kann.
- `POST /api/worker/register` belegt, dass Worker sich im erwarteten Namespace und in der erwarteten Aufgabenwarteschlange authentifizieren können.

Wechseln Sie Verkehr nicht allein auf Grundlage von `/api/health`.
