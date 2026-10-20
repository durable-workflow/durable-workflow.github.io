---
sidebar_position: 14
title: Betrieblicher Einsatzrahmen
description: Betriebsvertrag von Durable Workflow v2 für Gesundheit, Queues, Projektionen, Exporte, Archive und Wiederherstellung.
tags:
  - operations
  - observability
  - Waterline
keywords:
  - Betriebsrahmen
  - Workflow-v2-Gesundheit
  - Projektionen neu aufbauen
  - Historienexport
  - Archive prüfen
  - Queue-Gesundheit
  - Hochverfügbarkeit
---

# Betrieblicher Einsatzrahmen {#operator-operating-envelope}

Dieser Leitfaden beschreibt den betrieblichen Vertrag von Durable Workflow v2: blockierende und hinweisende Rollout-Diagnosen, Queue-Fakten in Waterline gegenüber Worker-Telemetrie, Prüfung von Neubau und Export sowie abgedeckte Bereitstellungsformen.

Diese Bereitstellungs- und Wiederherstellungsverfahren gelten für eingebettetes Laravel und selbst betriebenen Server. Cloud ist ein eigener verwalteter Dienst und betreibt Persistenz, Einzelregionsplatzierung, Sicherung und Wiederherstellung. Kunden betreiben SDK-Clients und Worker über die Namespace-URL. Dieser Leitfaden verbindet keinen Server mit Cloud; siehe [Cloud-Laufzeit](/docs/polyglot/cloud-control-plane).

## Maßgebliche Oberflächen {#source-of-truth-surfaces}

Verwenden Sie diese Oberflächen gemeinsam:

| Oberfläche | Zweck | Vertragsklasse |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | Backend-Fähigkeiten vor v2-Verkehr oder Upgrades | Blockierend |
| `GET /waterline/api/v2/health` | Engine-Quellbereitschaft und v2-Prüfungen | Blockierend bei `status = error`, Hinweis bei `status = warning` |
| `GET /waterline/api/stats` | Dauerhafte Summen, Rückstand, Reparatur, Projektion und Kompatibilität | Hinweis und Benchmark |
| `php artisan workflow:v2:rebuild-projections ...` | Projektionsvorschau und -reparatur | Wartung |
| `php artisan workflow:v2:backfill-command-contracts ...` | Alte Vertrags-Snapshots prüfen und nachfüllen | Wartung |
| `php artisan workflow:v2:history-export ...` und Waterline-Exportrouten | Replay, Archivübergabe und Vorfallartefakte | Prüfung |
| Waterline-Archivaktionen und `archive()` | Zustandsübergänge geschlossener Läufe | Lebenszyklus |
| Worker-SDK-Metriken, Traces und Protokolle | Startlatenz, Poll-Erfolg, Sticky-Cache und Anwendungstelemetrie | Laufzeittelemetrie |

Der für den Lauf zuständige Runtime besitzt den betrieblichen Vertrag des dauerhaften Zustands. Waterline projiziert ihn aus dem eingebetteten Paket oder über das PHP-SDK aus Server. Worker-Telemetrie bleibt maßgeblich für Latenz und internes Prozessverhalten.

### Oberflächen nach Bereitstellungsform {#surface-mapping-by-deployment-shape}

Die obigen Waterline-Routen existieren in beiden Betriebsformen. Eingebettet wird Laravel-Zustand im Prozess gelesen. Im Dienstmodus liest das veröffentlichte Waterline-Image einen Server-Namespace über das PHP-SDK. Authentifizierte Server-API und `dw`-CLI bleiben mit und ohne Waterline direkt verfügbar:

| Betriebsfrage | Waterline eingebettet oder Dienst | Native Server-Oberfläche |
| --- | --- | --- |
| Engine-Bereitschaft und Sperr-/Hinweisgesundheit | `GET /waterline/api/v2/health` | `GET /api/system/health` mit Admin und Steuerung v2; `dw server:health` für Liveness; `dw server:info` für Topologie, Protokoll und Rollout-Sicherheit |
| Summen, Rückstand, Reparatur, Kompatibilität und Drift | `GET /waterline/api/stats` | `GET /api/system/operator-metrics`, `dw system:operator-metrics` |
| Laufdetail und Historienexport | `GET /waterline/api/instances/...`, `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`, `/runs/{runId}`, `/runs/{runId}/history/export`; siehe [Server-API](./polyglot/server-api-reference.md) |
| Abbruch, Terminierung, Reparatur, Archiv, Signal/Update/Abfrage | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` und Signal-/Update-/Abfragerouten | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}`, `POST /api/system/repair/pass` |
| Topologie und Knotenidentität | Eingebettet: `php artisan workflow:v2:doctor --json`, Objekt `topology`; Dienst: verbundener Server | `GET /api/cluster/info`, `GET /api/health`, `GET /api/ready`, `dw server:info` |

Die folgenden Feldfamilien und Vertragsnamen bleiben unabhängig von der Oberfläche gleich. Waterline ist auf konfigurierte Laufzeit und Namespace begrenzt und mischt keine eingebetteten und serververwalteten Läufe.

## Datierter 2.0-Nachweisstand {#dated-20-evidence-snapshot}

Dieser Stand trennt auf veröffentlichten Artefakten gemessenes Verhalten von unterstützten Verfahren, die Betreiber selbst erproben müssen. Ein Erfolg gilt für das dokumentierte 2.0-Szenario und dessen Topologie, nicht pauschal für andere Grundlagen oder größere Bereitstellungen.

Der aktuelle Nachweisbestand ist:

| Nachweis und UTC-Datum | Direkt gemessen | Grenze |
| --- | --- | --- |
| Einzelregions-Failover, 2026-07-28 | Knotenübergreifender Abschluss, API-Verlust, MySQL-Unterbrechung/-Erholung, Redis-Verlust mit Datenbankrückfall, Lease-Verlust/-Wiedererwerb und Singleton-Neustart; Verlust-/Duplikatprüfungen je Phase bestanden | Zwei APIs hinter gemeinsamem Endpunkt, ein MySQL, ein Beschleunigungs-Redis, ein Queue-Worker und ein Scheduler/Wartungsprozess in einer Region. Containerunterbrechungen, keine Anbieterpromotion |
| Timer-Neustartmatrix, 2026-07-28 | Schlafende Workflows nach Worker-/Server-Neustart abgeschlossen, je Lauf ein geplanter/ausgelöster Timer ohne doppelte Replay-Befehle | Dauerhafte Timer-/Replay-Erholung auf Testtopologie, keine beliebigen Prozesszustände oder externen Effekte |
| Aktivitätsmatrix, 2026-07-29 | Ergebniserholung nach Neustart, Wiederholung/Zeitlimits, Heartbeat/Abbruch, dauerhafte Endergebnisse und idempotenter Abschluss auf erforderlichen Oberflächen | Aktivitäts-Engine; externe Idempotenz bleibt bei der Anwendung |
| Workflow-Lebenszyklusmatrix, 2026-07-29 | Abschluss/Fehler, Doppelstart/ID-Wiederverwendung, Zeitlimits/Wiederholung, Historienkontinuität und Duplikatvermeidung über PHP, Python, Rust, CLI, API, Historie und Waterline | Korrektheit geprüfter Szenarien, kein Verfügbarkeits-/Durchsatzbenchmark |

Unterstützte Releaselinien stehen im [Kompatibilitätsvertrag](./compatibility.md). Erproben Sie das Wiederherstellungsverfahren auf Ihrer Bereitstellung, bevor Sie topologiespezifisches Failover zusagen.

### Gemessene Zusage und unterstütztes Verfahren {#measured-guarantee-vs-supported-procedure}

| Ausfall oder Ergebnis | Direkt datiert bewiesen | Unterstütztes Vorgehen | Nicht belegt |
| --- | --- | --- | --- |
| Ein API-Knoten verloren | Eine von zwei APIs getötet, Überlebende über gemeinsamen Endpunkt erreichbar, bestätigter Zustand erhalten, Lauf abgeschlossen | Über `/api/ready` entfernen, unterbrochene Anfragen wiederholen, Topologie/Registrierung vor Freigabe prüfen | Gesamtflottenverlust, Zonenausfall oder beliebige Partitionen |
| Datenbankunterbrechung | Beide APIs nicht bereit, Zustand erhalten, Ersatz beansprucht nach Lease-Ablauf, Abschluss und Duplikatablehnung | Schreibbare Datenbank zuerst, Bereitschaft abwarten, alten Inhaber ausschließen, Lauf prüfen, Verkehr freigeben. Verwaltete Promotion benötigt natives Fencing, RPO und Zeitnachweis | Anbieterpromotion, bestätigte Writes bei Split Brain oder RPO/RTO jenseits lokaler Unterbrechung |
| Redis-Unterbrechung | Beschleunigungswarnung bei sicherem Datenbank-Polling; gleicher Poll ohne doppeltes Lease; Erholung nach Rückkehr | Redis als Beschleuniger, Warnbereitschaft tolerieren, nach Persistenz wiederherstellen und Erkennungslatenz prüfen | Redis-Dual-Primary, partitionierter Cache oder Anbieterzeiten |
| Worker-Verlust/Neustart | Workflow-Lease wiedererworben und abgeschlossen; Aktivitätsmatrix bestätigt Ergebniserholung und idempotenten Abschluss | Leases ablaufen lassen/Drain, kompatiblen Ersatz starten, Registrierung/Abholung prüfen, externe Effekte idempotent | Nicht gespeicherter Prozesszustand oder exakt einmalige externe Wirkung |
| Server-/Scheduler-Neustart | Schlafende Timer ohne doppelte Befehle abgeschlossen; Fortschritt bei API-Verlust und Singleton-Neustart erhalten | Persistenz, bereite Rollen, genau einen Scheduler/Wartungsprozess, Worker und Abschluss prüfen | Gleichzeitiger Verlust aller Server/Speicherknoten, Mehrregionen oder doppelte Scheduler als Normalbetrieb |
| Doppelte Lieferung | Ein logischer Abschluss und HTTP `409` für Duplikat nach Datenbank-/Worker-Erholung; Redis-Rückfall verwendet altes Lease; Aktivitätszelle idempotent | Stabile Anfrage-/Aufgabenidentitäten, alte Versuche ablehnen, idempotente Effekte | Universelle Exactly-once-Zustellung oder -Effekte außerhalb der Engine |
| Terminaler Abschluss | Knotenübergreifende/API-/Datenbank-/Worker-Fälle im Zustand `completed`; neuere Matrix für Abschluss, Fehler, Abbruch, Terminierung, Zeitlimit, Wiederholung bestanden | Ausgewählten Lauf und Historie/Export vor Archivierung oder Erholungsabschluss prüfen | Ungeprüfte Lastformen, Integrationen oder Fehlerkombinationen |

### Größtes aktuelles Lastszenario {#largest-current-load-cell}

Das größte konfigurierte Server-Lastszenario startet **1.000 Workflows** mit **8** gleichzeitigen Starts und **8** pollenden Workern über 120 Sekunden. Es verlangt mindestens 98 % abgeschlossene Starts und prüft Endpunktverfügbarkeit, Cache-Schlüsselabbau, Stichprobenabdeckung und begrenzten Ressourcenverbrauch.

Dies ist ein kurzer **Korrektheitstest**, kein anhaltender Produktionsbenchmark. Er verspricht keinen universellen Durchsatz, keine Latenz, keinen Speicherbedarf und keine maximale Parallelität. Ermitteln Sie diese mit Benchmark- und Dauerlastnachweisen für genaue Topologie, Worker-Mix, Datenbank, Cache und Release.

### Ausdrücklich ausgeschlossen {#explicitly-out-of-scope}

Die 2.0-Nachweise decken Folgendes nicht ab:

- Netzwerkpartitionen
- Absichtliche Uhrendrift
- Mehrregionsbetrieb
- Split-Brain-Verhalten

Diese Experimente sind keine 2.0-Releasevoraussetzungen. Sie sind vor entsprechenden Aussagen zu Partitionen, Uhrendrift, mehreren Regionen oder Split Brain erforderlich. Der 2.0-Rahmen bleibt veröffentlichte Topologie samt Wiederherstellungspaket und gemessenen Szenarien. Nicht unterstützte Chaos-Szenarien belegen nicht, dass dokumentierte Einzelregionsverfahren unbrauchbar sind.

## Unterstützte Topologien {#supported-topologies}

Durable Workflow v2 unterstützt folgende Betriebsformen. Namen der ersten Spalte entsprechen `topology.current_shape` aus `/api/cluster/info` und [Server-Rollentopologie](./polyglot/server-role-topology.md), damit Betriebsvertrag und automatisierte Erkennung zusammenpassen.

| Form (`topology.current_shape`) | Unterstützter Vertrag | Hauptfehlerdomänen | Erwartete Erholung |
| --- | --- | --- | --- |
| `embedded`, Einzelknoten | Waterline, Steuerung, Gesundheit, Neubau, Export und Archiv in einer Anwendung mit einer Datenbank und einem Cache | Laravel-Prozess, Datenbank und Cache eines Hosts | Host-/Datenbankverlust: Vollausfall. Daten, einen bereiten Anwendungsknoten und Worker vor Verkehr herstellen |
| `embedded`, kleiner Einzelregionscluster | Gemeinsame Datenbank/Weckcache, gleiche Kompatibilität/Konfiguration und begrenzte Wecklatenz im selben Rechenzentrum/Region | Gemeinsame Datenbank, Cache/Weckpfad, Load Balancer, Singleton-Scheduler/Wartung | Anwendungsverlust mindert Kapazität; Datenbank stoppt dauerhafte Arbeit; Redis allein warnt bei sicherem Datenbank-Polling. Scheduler-Failover/Upgrades bleiben ausdrückliche Verfahren, keine automatische HA-Zusage |
| `standalone_server` | Matrix für [Selbstbetrieb](./deployment.md), gleiche Unterscheidung über `/api/system/...`, `/api/workflows/...` oder getrenntes Waterline | Datenbank, Redis, APIs, Worker, optionales Waterline, Singleton | APIs/Waterline sind ersetzbar; Datenbank, Redis und Singleton bestimmen Reihenfolge. Erst Persistenz, dann `/api/ready`, `/api/cluster/info` und Registrierung vor Freigabe |
| `split_control_execution` | Gleicher Vertrag mit `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node`; Admin-Lesen zur zuständigen Rolle routen | [Rollentopologie](./polyglot/server-role-topology.md); gemeinsame Datenbank, Redis, Singleton-Wahl bleiben flottenweit | Gleiche Reihenfolge; je Knoten `topology.current_shape`, `topology.current_process_class`, `topology.current_roles` prüfen. Falsche Klasse: `503 topology_role_unavailable` |

`split_control_execution` ist dieselbe Engine und dasselbe Produkt wie `standalone_server`, mit Prozessklassen aus `topology.shape_assignments`. Sofern kein bestimmter Rollenhinweis vorliegt, gilt dieser Leitfaden für beide Formen. [Server-Rollentopologie](./polyglot/server-role-topology.md) beschreibt Begriffe, Zuständigkeiten und Migration.

Waterline im Dienstmodus ist eine Beobachterbereitstellung. Hinzufügen oder Entfernen ändert weder `topology.current_shape` noch Server-API/CLI oder die zuständige Laufzeit eines Laufs.

Veröffentlichen Sie Wiederherstellungsreihenfolge, Sicherungsrhythmus, erwartete Failover-Verzögerung und Regionsbindungen im Betriebshandbuch. Der Produktvertrag benennt zu messende Fakten; Ihr Bereitstellungsvertrag hält akzeptierte Zeiten, manuelle Schritte und Fehlerdomänen fest.

### Fehlerdomänen je unterstützter Form {#failure-domain-checklist-by-supported-shape}

Verwenden Sie die Topologietabelle als Kurzüberblick und schreiben Sie Ihr Handbuch anhand dieser genaueren Ausfallmodelle:

- **Laravel eingebettet, Einzelknoten**: Ein Prozess besitzt Steuerung, Zuordnung, Projektion, Scheduler und Ausführung. Sein Verlust unterbricht dauerhafte Befehle, Fortschritt, Schedule-Auslösung und Betriebslesezugriffe bis zur bereiten Rückkehr derselben Anwendung mit intaktem Speicher.
- **Laravel eingebettet, kleiner Einzelregionscluster**: Ein verlorener Knoten entfernt nur einen Teil der HTTP-/Worker-Kapazität; übrige Knoten beanspruchen weiter Arbeit aus gemeinsamem Speicher. Gemeinsame Datenbank, Cache-Weckpfad und aktueller Singleton-Scheduler-/Wartungsinhaber sind die wesentlichen Korrektheitsgrenzen.
- **Eigenständiger Server (`standalone_server`)**: Verlust eines `server_http_node` stoppt nur dessen Ingress und Befehle. Worker können geleaste Arbeit abschließen, andere API-Knoten weiter dienen. Verlust eines `worker_node` erhöht Rückstand, Alter oder Kompatibilitätswarnungen nur betroffener `(connection, queue, compatibility)`-Bereiche. Verlust von `scheduler_node` pausiert neue Schedules und Wartung, ohne laufende Workflows ungültig zu machen. Datenbankverlust ist flottenweit. Redis-Verlust verschlechtert `long_poll_wake_acceleration` und Erkennungslatenz, erhält aber Datenbank-Polling.
- **Getrennte Rollen (`split_control_execution`)**: `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` tragen eigene Rollen. Ingress-Verlust stoppt externes HTTP; Steuerungsverlust lässt Befehle schnell scheitern, während Leases weiterlaufen; Zuordnung fällt auf direkte Suche zurück; Scheduler-Ausfall pausiert Auslösung und erfasst verpasste Läufe; Ausführungsverlust sammelt bereite Aufgaben ohne Zustandsverlust. Datenbankverlust bleibt flottenweit. Redis-Verlust ist Beschleunigungsdegradation mit gleichem Datenbankrückfall und Bereitschaftswarnung.

Beruht Ihre Bereitstellung auf anderen Annahmen, behandeln Sie sie mit eigenem geprüften Vertrag statt unveränderter Übernahme der Selbstbedienungsanleitung.

### Veröffentlichtes Wiederherstellungspaket je Topologie {#published-recovery-packet-by-topology}

Diese Topologien sind erst produktionsbereit, wenn das Betriebshandbuch das passende Wiederherstellungspaket enthält:

| Topologie | Vom Betreiber zu veröffentlichen |
| --- | --- |
| `embedded`, Einzelknoten | Datenbanksicherungsplan, Cache-Erwartungen, genaue Revision/Konfiguration zur Wiederherstellung, maximaler Rückstand und letzte erfolgreiche Probe |
| `embedded`, kleiner Einzelregionscluster | Einzelknotenpaket plus Scheduler-/Wartungsinhaber, Wirkung von Knoten- gegenüber Datenbank-/Cache-Verlust und Wiederanlauf des Weckpfads |
| `standalone_server` | Datenbank-/Redis-Sicherung, fixiertes Image/Digest, Zugangsdatenablage, Erwartungen an `server_http_node`, `worker_node`, `scheduler_node`, letzte `/api/ready`-/`/api/cluster/info`- und Worker-Wiederregistrierungsnachweise |
| `split_control_execution` | Server-Paket plus Skalierungs-/Ausfallverhalten je `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` und Client-Routing bei `503 topology_role_unavailable` |

Fehlt das Paket, ist es veraltet oder ungeprüft, behandeln Sie die Topologie unabhängig von der Knotenzahl als Entwicklungsumgebung.

### Live-Topologie vor Vertrauen in Basiswerte prüfen {#verify-live-topology-identity-before-trusting-the-baseline}

Prüfen Sie bei eigenständigen und getrennten Server-Rollen vor Queue-, Scheduler- oder Ausfallinterpretation die vom Produkt gemeldete Knotenidentität. Maßgeblich ist `GET /api/cluster/info`:

| Feld | Zweck |
| --- | --- |
| `topology.current_shape` | Gemeldete Form: `embedded`, `standalone_server` oder `split_control_execution` |
| `topology.current_roles` | Tatsächlich gehostete logische Rollen |
| `topology.supported_shapes` | Öffentlich unterstützte Formen dieses Builds |
| `topology.shape_assignments` | Erlaubte Prozessklassen/Rollenbündel zum Vergleich mit dem Knoten |

Prüfen Sie mit diesen Feldern zuerst Topologieabweichung bei Rollouts:

- Bei eigenständigem Server melden API-Knoten `api_ingress`, `control_plane`, `matching`, `history_projection`; Scheduler `scheduler`; Worker `execution_plane`.
- Bei getrennten Rollen prüfen Sie `current_roles` gegen erlaubte Bündel in `shape_assignments`, bevor Sie Rückstand oder Scheduler-Verzug dem Worker zuschreiben.
- Weichen Rollen vom Plan ab, gelten Queue-/Failover-Basiswerte bis Korrektur der Identität als fraglich.

Eingebettete Installationen veröffentlichen `/api/cluster/info` nicht. Führen Sie `php artisan workflow:v2:doctor --json` aus und prüfen Sie `topology`: gleiches Schema mit `current_shape`, `current_process_class`, `current_roles`, `execution_mode` und verschachteltem `matching_role` der Anwendung.

## Blockierende und hinweisende Diagnosen {#blocking-and-advisory-diagnostics}

Durable Workflow v2 trennt blockierende von hinweisenden Diagnosen.

| Schwere | Bedeutung | Typische Aktion |
| --- | --- | --- |
| Blockierend | Konfiguration/Bereitschaft für v2-Verkehr nicht sicher | Rollout stoppen, Voraussetzung beheben, erneut prüfen |
| Hinweis | Lesbare Oberfläche, aber abgeleitete Fakten benötigen Neubau, Backfill oder Prüfung | Gegebenenfalls weiter bedienen, benannte Oberfläche reparieren |
| Gesund | Kein aktuelles Problem gefunden | Normal weiterarbeiten |

Wenden Sie dies auf die gelieferten Oberflächen an:

- `workflow:v2:doctor --strict` blockiert bei Backend-Fähigkeitsfehlern mit Schwere `error`, etwa nicht unterstütztem Queue-Treiber im Queue-Modus oder Cache ohne Sperren. Informative Queue-Diagnosen im Poll-Modus bleiben Hinweise.
- `GET /waterline/api/v2/health` liefert `status = ok` bei bereiter konsistenter Oberfläche; `status = warning` bei weiter lesbarer Oberfläche mit Neubau-/Backfill-/Reparaturbedarf; `status = error` und HTTP `503` bei nicht bereiter Engine-Brücke oder blockierendem Fähigkeitsproblem.
- `GET /waterline/api/stats` veröffentlicht dauerhafte Betriebsfakten für Dashboards und Skripte, keinen Metrik-Scrape-Endpunkt.

## Korrektheits- und Beschleunigungsprüfungen {#correctness-vs-acceleration-checks}

Jede v2-Gesundheitsprüfung trägt `category` mit `correctness` oder `acceleration`. Der Snapshot fasst Kategorien zusammen, damit beide Fragen ohne erneute Aggregation beantwortet werden.

- **Korrektheit**: prüft dauerhafte Aufgabenerkennung, Projektionsfrische, Vertrags-Backfill, Aufbewahrung, Worker-Kompatibilität und Backend-Fähigkeiten. `status = error` gefährdet sichere Abholung oder vertrauenswürdigen Zustand; Rollout bis Behebung stoppen.
- **Beschleunigung**: prüft optionale Wecksignalverbreitung. Dauerhafte Poller sichern Korrektheit; `status = warning` kann knotenübergreifende Wecklatenz erhöhen, ohne Aufgaben stranden zu lassen.

Jeder `checks`-Eintrag enthält seine `category`; `categories` ergänzt die Dashboard-Zusammenfassung:

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

Eine verschlechterte `acceleration` betrifft nur Beschleunigung: Cache-/Wecksystem prüfen, aber nicht Verkehr blockieren, der nur dauerhafte Aufgabenerkennung benötigt. Verschlechterte `correctness` ist das Sperrsignal. `long_poll_wake_acceleration` ist die maßgebliche Beschleunigungsprüfung und erreicht höchstens `warning`; alle anderen prüfen Korrektheit.

## Bedeutung des Queue-Zustands {#queue-health-semantics}

Queue-Gesundheit trennt dauerhaften Zustand von Worker-/Laufzeittelemetrie.

### Dauerhafte Queue-Fakten {#durable-queue-facts}

Verwenden Sie Waterline-Statistiken und Queue-Ansichten für dauerhaften Aufgabenzustand:

| Fakt | Bedeutung |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | Jetzt beanspruchbare dauerhafte Aufgaben |
| `operator_metrics.backlog.delayed_tasks` | Bestehende Aufgaben vor `available_at` |
| `operator_metrics.backlog.leased_tasks` | Aktuell beanspruchte Aufgaben |
| `operator_metrics.backlog.tasks_added_last_minute` | Unterschiedliche Zeilen der letzten 60 Sekunden: dauerhafter Zufluss, kein Transportversuchszähler |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | Unterschiedliche Zeilen mit letztem erfolgreichem `last_dispatched_at` in den letzten 60 Sekunden; mit `tasks_added_last_minute` vergleichen |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | Akzeptierter Start-Rückstand vor aktiver Workflow-Aufgabenarbeit, getrennt von Worker-Lag |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | Älteste ausführbare Aufgabe und ihr Bereitschaftsalter |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | Bereite Aufgaben ohne erfolgreiche Weckzustellung und maximales Alter; Beschleunigerfehler von gewöhnlichem Wachstum trennen |
| `operator_metrics.backlog.unhealthy_tasks` | Zustellungs-/Claim-Fehler, überfällige Zustellung oder abgelaufene Leases |
| `operator_metrics.backlog.repair_needed_runs` | Offene Läufe ohne verlässlichen dauerhaften Fortsetzungspfad |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | Ältestes abgelaufenes Lease samt Alter; Signal für Blockade/Duplikatrisiko |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | Älteste Kompatibilitätssperre und Alter bei erhaltenem Zustand ohne berechtigten Worker |
| Aktive/veraltete Poller | Ob registrierte Queue-Worker weiter heartbeaten |
| Aktuelle Leases | Jetzt beanspruchte Workflow-/Aktivitätsaufgaben und Ablauf |

Diese Fakten beschreiben nur dauerhafte Workflow- und Aktivitätsaufgaben.

Queue-Details statt Flottensummen liefern Server-Routen mit Rückstandsalter, Pollern, Leases, Zulassung, `stats.tasks_added_last_minute` und `stats.tasks_dispatched_last_minute`. Vergleichen Sie Zufluss und Versand zur Erkennung einzelner Rückstände oder Kapazitätslücken. Das Paar `operator_metrics.backlog.*` beschreibt die Flottensumme.

Waterlines `GET /waterline/api/v2/health` bietet dieselben Details unter `queue_visibility.*` für den konfigurierten Namespace. Diese Feldfamilien bilden den typisierten Queue-Gesundheitsvertrag:

| Feldfamilie | Bedeutung |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | Verfügbarkeit der Namespace-Queue-Sicht und Grund bei Fehlen |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | Queue-Rückstand und ältestes dauerhaftes Alter |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | 60-Sekunden-Zufluss/-Versand, auch bei durch Flottensummen verdeckter heißer Queue |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | Gesunde/veraltete Poller und verwendete Heartbeat-Altersgrenze |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | Bereite/geleaste Aufgaben und abgelaufene Leases je Aufgabenart |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | Reparaturbedarf, Zustellungsfehler, Lease-Ablauf und überfällige Neuzustellung |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | Älteste Zeitpunkte und Höchstalter für Queue-Zustellungsfehler, Lease-Ablauf und Versandverzug |

`coordination_alerts[]` in derselben Antwort fasst Queue-Fakten und Prüfungen zusammen. Nutzen Sie es als Anzeigeübersicht von Warnungen/Fehlern und untersuchen Sie zugehörige `queue_visibility`- oder `checks`-Einträge als Beleg.

Die Queue-Zulassung ist das maßgebliche Platz-/Poller-Signal. `saturated` bedeutet lebende Worker, aber alle Plätze geleast; `throttled` absichtliche Lease-/Ratenbegrenzung; `no_slots` registrierte Worker ohne Kapazität für diese Art; `no_active_workers` keinen gesunden Poller; `unavailable` eine konfigurierte Sperrprüfung ohne sicheren Nachweis.

Verwenden Sie `operator_metrics.starts.*` bei scheinbar blockierten Starts trotz normaler bestehender Queue-Latenz. Dies trennt Startzulassung und Erzeugung erster Aufgaben von nachgelagerter Worker-Abholung.

### Poller-Druck und Zulassungsbudgets {#poller-pressure-and-admission-budgets}

Verwenden Sie Queue-Details oder `dw task-queue:describe`, um fehlende Worker-Kapazität, beabsichtigte Server-Drosselung und fehlende lebende Poller zu trennen:

| Zustand | Bedeutung | Bewertung |
| --- | --- | --- |
| `accepting` | Freie Plätze, kein Server-Limit voll | Gesunder Basiszustand |
| `saturated` | Alle registrierten Plätze geleast | Worker-Kapazitätsdruck |
| `throttled` | Absichtliche Lease-/Zustellratenbegrenzung | Hinweis, außer unerwartetem Limit oder dauerhaftem Wachstum über Basis |
| `no_slots` | Aktive Worker ohne Plätze für diese Art | Für Queue blockierend |
| `no_active_workers` | Kein gesunder Poller | Für Queue blockierend |
| `unavailable` | Erforderliche Zulassungssperre nicht erwerbbar | Bis Erholung der Abhängigkeit blockierend |

Verwenden Sie diese Zustände zusammen mit Queue-Flussdaten:

- `tasks_added_last_minute > tasks_dispatched_last_minute` mit `saturated`: dauerhafter Zufluss übersteigt Worker-Kapazität.
- Dieselbe Differenz mit `throttled`: ein ausdrückliches Server-Limit hält zurück; gegen dessen Vertrag statt unbegrenzten Durchsatz bewerten.
- Wachsendes ältestes Bereitschaftsalter mit `no_active_workers` oder veralteten Pollern bedeutet Routing-Ausfall in diesem Bereich.

### Bereitstellungsform der Zuordnungsrolle {#matching-role-deployment-shape}

`operator_metrics.matching_role.*` bestätigt den tatsächlich von diesem Knoten bereitgestellten Zuordnungs-/Zustellungsvertrag:

| Fakt | Bedeutung |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | Ob dieser Knoten breite interne Queue-Weckprüfung ausführt |
| `operator_metrics.matching_role.shape` | `in_worker` für eigenen Pfad, `dedicated` für gesondertes `workflow:v2:repair-pass --loop` |
| `operator_metrics.matching_role.task_dispatch_mode` | Zustellung bereiter Aufgaben: `queue` oder `poll` |
| `operator_metrics.matching_role.partition_primitives` | Festgeschriebene Achsen in Reihenfolge: `connection`, `queue`, `compatibility`, `namespace` |
| `operator_metrics.matching_role.backpressure_model` | Dauerhafte Zulassungsgrenze, derzeit `lease_ownership` |

Diese Felder sind knotenlokal. Lesen Sie bei gemischtem Rollout jeden betroffenen Knoten oder Pod, um den geplanten Umzug der Zuordnungsrolle vor einer Worker-Gesundheitsdiagnose zu bestätigen.

### Worker- und SDK-Telemetrie {#worker-and-sdk-telemetry}

Verwenden Sie Worker-Metriken, Traces und Protokolle für:

- `schedule_to_start`-Latenz von Workflows und Aktivitäten
- Poll-Erfolgsrate und synchrone/sofortige Zustellung
- Sticky-Cache-Größe und Verdrängung
- CPU-, Speicher-, Thread- und Ereignisschleifendruck
- Eigene Anwendungsmetriken aus Aktivitäten oder Workern

Kennzeichnen Sie synchrone Abfragen, Live-Debugging und andere nichtdauerhafte Steuerungsaufrufe gesondert. Sie gehören nicht zum dauerhaften Rückstand und ändern Waterline-Reparaturzähler nicht.

## Worker-Kompatibilität und Rollout-Zustand {#worker-compatibility-and-rollout-health}

`operator_metrics.workers` veröffentlicht Kompatibilitätsfakten zur sicheren Verarbeitung des erforderlichen Vertrags durch die aktive Flotte:

| Fakt | Bedeutung |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Im Namespace erforderliche Marker |
| `operator_metrics.workers.active_workers` | Unterschiedliche lebende Worker aus Kompatibilitäts-Heartbeats |
| `operator_metrics.workers.active_worker_scopes` | Abgedeckte `(connection, queue)`-Bereiche |
| `operator_metrics.workers.active_workers_supporting_required` | Worker mit allen erforderlichen Kompatibilitätsmarkern |
| `operator_metrics.workers.fleet` | Liste je Bereich mit `worker_id`, `connection`, `queue`, `supported`, `supports_required`, Heartbeat-`source` (`database` oder `cache`) und `recorded_at` |

Die Summen zeigen Rollout-Phasen, in denen Worker erforderliche Arbeit nicht sicher beanspruchen können. `fleet` nennt genau fehlende `(connection, queue)`-Abdeckung. Waterline zeigt dieselbe Liste im Kompatibilitätsbereich ohne manuelle Metrikabfrage.

Bei `active_workers_supporting_required` gleich null meldet Waterline `no_compatible_worker_for_task` an betroffenen Läufen. Die Prüfung `worker_compatibility` warnt unter `correctness`, dessen Zusammenfassung ebenfalls `warning` wird, damit die Lücke unmittelbar sichtbar ist.

Siehe [Worker-Builds mit Build-IDs ausrollen](./polyglot/worker-build-id-rollout.md) für Drain/Fortsetzung und [Kompatibilität und Routing](./polyglot/worker-compatibility-routing.md) für die Bindungsregeln.

## Bedeutung der Alarme {#alert-semantics}

Alarmschwellen sind bereitstellungsspezifisch. Veröffentlichen Sie Zahlen für Queue-Alter, Reparaturverzug, Worker-Abdeckung und Wiederherstellung. Alarmieren Sie bei Vertragsverletzungen länger als ein gewöhnliches Reparatur-/Watchdog-Fenster Ihrer Topologie.

| Alarm | Quelle | Bewertung | Eskalation | Reaktion |
| --- | --- | --- | --- | --- |
| Blockierte Bereitschaft | `workflow:v2:doctor --strict`, `GET /waterline/api/v2/health` | Blockierend | Fehler von `doctor --strict`, `status = error` oder HTTP `503` | Rollout/Verkehrswechsel stoppen, beheben, Bereitschaft/Kompatibilität prüfen |
| Kompatible Abdeckung | `operator_metrics.workers.*`, `worker_compatibility`, `no_compatible_worker_for_task` | Blockierend | `active_workers_supporting_required = 0` für Namespace oder nötiges `(connection, queue)` | Inkompatible drainen, passende registrieren, `correctness` prüfen |
| Dauerhafter Queue-Verzug | Waterline, `operator_metrics.backlog.*`, Worker-`schedule_to_start` | Bei Dauer blockierend, kurzzeitig Hinweis | Bereitschaftsalter/Latenz trotz kompatibler Worker über Basis | Kapazität, Zulassung und Scheduler-/Zuordnungsfortschritt prüfen |
| Poller-Druck/Sättigung | Queue-Detail, `dw task-queue:describe`, `status`, alte Poller und Raten | `no_active_workers`, `no_slots`, `unavailable` blockieren; geplantes `throttled` Hinweis | `saturated` bei wachsendem Alter/Ratenabstand oder Sperrzustände außerhalb Wartung | Plätze ergänzen, Kohorte herstellen, Limit/Sperre vor blindem Skalieren prüfen |
| Start-Rückstand | `operator_metrics.starts.*`, Start-/Erstaufgabentelemetrie | Bei Dauer blockierend | `pending_commands`, `ready_tasks`, `max_pending_ms` trotz Kapazität über Basis | Startbefehle, erste dauerhafte Aufgabe und Zustellung prüfen; vom Worker-Lag trennen |
| Projektion/Reparaturschuld | `run_summary_projection`, `selected_run_projections`, `operator_metrics.repair.*` | Hinweis | Nach Neubaufenster weiter Warnung oder steigendes Kandidatenalter | Vorschau, Reparatur und Rückkehr zum Basisalter prüfen |
| Wiederholungs-/Fehlersturm | `operator_metrics.backlog.unhealthy_tasks`, dauerhafte Diagnose, Worker-Fehler | Hinweis, bei Fortschrittsblockade sperrend | Zustell-/Claim-Fehler, Lease-Ablauf oder erschöpfte Versuche dauerhaft über Basis | Aufgabenfamilie und Telemetrie/Zustand vergleichen; Verkehr drainen oder Queue isolieren |
| Weckbeschleunigung | `long_poll_wake_acceleration`, `acceleration` | Hinweis | Warnung nach Cache-/Notifier-Wartungsfenster | Cache/Verbreitung prüfen; ohne `correctness`-Degradation kein Korrektheitsausfall |

Alarmierung gilt dauerhaftem Vertragsrisiko. Queue- und Worker-Meldungen werden erst blockierend, wenn sie den Vertrag der tatsächlich betriebenen Topologie gefährden.

## Neubau, Reparatur und Wiederherstellung {#rebuild-repair-and-restore-expectations}

Bei gemeldeten Abweichungen prüfen Sie in dieser Reihenfolge:

1. Prüfen Sie `GET /waterline/api/v2/health`.
   - `run_summary_projection` und `selected_run_projections` bedeuten weiter erreichbares Waterline mit neu aufzubauenden Listen-/Detailfakten.
   - `command_contract_snapshots` verlangt WorkflowStarted-Vertrags-Backfill alter Läufe vor Vertrauen in deklarierte Signal-, Update- oder Abfrageformulare.
   - `durable_resume_paths` verlangt Reparatur offener Läufe vor Vertrauen in die projizierte nächste Fortsetzungsquelle.
2. Prüfen Sie die Projektionsvorschau:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. Bauen Sie betroffene Projektionen neu auf:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. Zeigen Sie geplanten Befehlsvertrags-Backfill an:

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. Füllen Sie Befehlsverträge nach, wenn die aktuelle Workflow-Klasse noch verfügbar ist:

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. Verwenden Sie `--prune-stale` erst nach absichtlicher dauerhafter Löschung durch Ihre Aufbewahrung, um Projektionen ohne bestehenden Lauf oder Historienzeile zu entfernen.

`operator_metrics.repair.*` veröffentlicht die Reparatursuchlast. Kandidaten-/Auswahlzahlen, maximales Kandidatenalter und Scan-Grenzdruck zeigen, ob die Arbeit im Basisrahmen bleibt oder Kapazitätsprüfung erfordert.

### Aufbewahrung und Projektionsabweichung {#retention-and-projection-drift}

Seit Workflow 2.6.3 zählt ein erhaltener Lauf mit `details_pruned_at` weder als fehlende Zusammenfassung noch als Neubauschuld oder fehlendes Zusammenfassungsalter. Er bleibt in der Summe `runs`. Jeder Neubau überspringt ihn, auch ausdrückliche Lauf-/Instanzauswahl. Reparatur stellt seine gelöschte Listenzeile daher nicht wieder her und führt ihn nicht erneut der Aufbewahrungsauswahl zu.

Ein unmarkierter Lauf ohne Zusammenfassung meldet weiterhin Abweichung. Leere Historie allein beweist keine frühere Bereinigung. Bestätigen Sie absichtliche Löschung aus einem maßgeblichen Aufbewahrungsnachweis vor der Behebung. Projektionsneubau stellt keine gelöschte Historie wieder her; verwenden Sie eine geeignete Sicherung.

Ältere Laufzeiten können bereinigte markierte Läufe fälschlich als fehlende Zusammenfassungen melden. Aktualisieren Sie vor einem Neubau zur Behebung dieser Warnung die Laufzeit. Prüfen Sie danach `run_summary_projection = ok`, den Wert null für `projections.run_summaries.needs_rebuild` und ausbleibende erneute Auswahl derselben Läufe. Echter Projektionsverlust verlangt weiterhin Reparatur.

## Export und Archivierung prüfen {#export-and-archive-verification}

Historienexport und Archivierung dienen unterschiedlichen Zwecken:

- **Historienexport** erzeugt ein Artefakt für Replay, Debugging und Archivzwecke.
- **Archivieren** markiert einen geschlossenen Lauf und entfernt ihn aus aktiven Ansichten.
- **Bereinigen** entfernt Projektionen oder dauerhafte Zeilen nach sicher abgelaufener Aufbewahrung.

Verwenden Sie diese Prüfreihenfolge:

1. Exportieren Sie den ausgewählten Lauf:

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. Prüfen Sie Laufkennung, Schemaversion und konfigurierte Schwärzungsmetadaten im Paket.
3. Prüfen und erhalten Sie referenzierte externe Bytes für die notwendige Lebensdauer. Das [Verfahren vor Bereinigung](./configuration/pruning-workflows.md#export-before-pruning) inventarisiert alle geschlossenen Läufe und erkennt fehlende Kopien.
4. Archivieren Sie nur zur Erhaltung des Laufs in der Datenbank. Server überspringt Archive und kann sie nicht aufheben. Eingebettete Bereinigung liegt bei der Anwendung und verlangt keine vorherige Archivierung.
5. Bereinigen Sie geeignete Details über den zuständigen Aufbewahrungsvorgang. Erhalten Sie Lauf-/Instanznachweise. Projektionsneubau stellt keine Historie wieder her; markierte bereinigte Läufe sind ausgeschlossen.

Die entsprechenden Waterline-Routen stehen in der [Waterline-Betriebs-API-Referenz](./waterline-operator-api.md).

Prüfsummen- und Strukturprüfungen beweisen nicht, dass ein Export alle ursprünglichen Ereignisse oder unabhängige externe Bytes enthält. Lehnen Sie bereits bereinigte Quellen ab. Das falsche Vollständigkeitsmerkmal bleibt unter [Workflow #856](https://github.com/durable-workflow/workflow/issues/856) ein offener Fehler. Dieses manuelle Verfahren liefert auch nicht den unter [Server #520](https://github.com/durable-workflow/server/issues/520) geforderten eigenständigen, verifizierten Archivierungsvorgang. Unterscheiden Sie diese Produktlücken von den tatsächlich bestandenen Wiederherstellungsprüfungen Ihrer Bereitstellung.

## Vertrag für Sicherung, Wiederherstellung und Notfallwiederanlauf {#backup-restore-and-disaster-recovery-contract}

Sicherung, Wiederherstellung und Notfallwiederanlauf gehören zum Betriebsrahmen. Veröffentlichen und erproben Sie für jede Topologie:

1. Den dauerhaften Sicherungssatz: Datenbanksicherung, Server-/Anwendungsimage, Umgebung/Konfiguration, Ablage der Zugangsdaten und genaue Topologie-/Worker-Wiederanbindungsnotizen.
2. Ziele: akzeptierter maximaler Wiederherstellungsrückstand, erwartete Failover-Dauer und Berechtigung zur Verkehrsfreigabe.
3. Reihenfolge: dauerhafte Persistenz, Cache, Initialisierung/Migration, Singleton-Scheduler/Wartung, API-Bereitschaft, Worker-Registrierung.
4. Prüfung: `/api/ready` oder `/waterline/api/v2/health`, gegebenenfalls `/api/cluster/info`, repräsentative Worker-Registrierung und Historienexport aus wiederhergestelltem Zustand.
5. Reparatur: Projektionen und gegebenenfalls Vertrags-Backfill; Queue-, Kompatibilitäts- und Reparaturmetriken müssen vor Gesundmeldung zum Basiswert zurückkehren.

Mehrregionenbetrieb und Split Brain bleiben außerhalb des 2.0-Rahmens. Der [Selbstbetriebsleitfaden](/docs/deployment#activepassive-multi-region) enthält Aktiv/passiv nur zur betreuten Evaluierung, ohne selbstbediente Replikations-, Failover-, Failback-, RPO- oder RTO-Garantien. Der [Cloud-Vertrag](/docs/polyglot/cloud-control-plane) betreibt ebenfalls jeden Namespace in einer Region ohne Zusage regionsübergreifender Replikation oder Umschaltung.

Auch der Rhythmus von Wiederherstellungsproben gehört zum öffentlichen Vertrag. Erproben Sie das Verfahren mindestens:

- Vor dem ersten Produktionsrollout einer Topologie
- Nach Änderungen an Sicherung, Schema/Initialisierung, Authentifizierung oder Topologie
- Regelmäßig nach veröffentlichtem Rhythmus im selben Handbuch wie der Sicherungsplan

Ohne Datum der letzten erfolgreichen Probe, Wiederherstellungsdauer und Prüfnachweise bleiben Sicherung und Notfallwiederherstellung für diese Topologie unbewiesen.

## Benchmark-Rahmen {#benchmark-envelope}

Durable Workflow v2 benennt die für Ihre Umgebung zu messenden Dimensionen. Erfassen Sie Basiswerte in Staging oder Canary, bevor Produktionsverkehr davon abhängt:

| Dimension | Zu ermittelnder Basiswert | Quelle |
| --- | --- | --- |
| Projektionen | `needs_rebuild = 0`, Neubau nach absichtlicher Drift, Alt-/Waisenbereinigung | `/waterline/api/v2/health`, `/waterline/api/stats`, `workflow:v2:rebuild-projections` |
| Queue-Druck | Rückstands-/Bereitschaftsalter, sofortige/verzögerte Aufgaben, Zufluss/Versand, Zustellverzug, alte Poller und `accepting`/`saturated`/`throttled`/`no_slots`/`no_active_workers` | Waterline, `operator_metrics.backlog.*`, `operator_metrics.tasks.*` |
| Startlatenz | Akzeptierte Starts vor erster Aufgabe, ältestes Startalter und Erstabholung | `operator_metrics.starts.*`, `schedule_to_start` |
| Schedule-to-start | Workflow-/Aktivitätswartezeit von Einreihung bis Start | Worker-SDK-Metriken |
| Timer-Auffächerung | Weckverbreitung und Abstand von Feuerzeit bis Sichtbarkeit bereitstehender Aufgaben | Worker-Telemetrie und Einzelregionskoordination |
| Reparatursuche | Kandidaten/Auswahl, Höchstalter Kandidat/fehlender Lauf, Scan-Druck | `operator_metrics.repair.*` |
| Historie | Ereigniszahl, Größe und Continue-as-new-Schwellen | `operator_metrics.history.*` |

Dies sind Messdimensionen, keine allgemeinen Latenzversprechen. Veröffentlichen Sie akzeptable Bereiche Ihrer Topologie.

## Dauerlastnachweise {#long-soak-evidence}

Benchmark-Snapshots allein reichen nicht. Bevor eine Topologie für Dauerverkehr als zuverlässig gilt, halten Sie einen Dauerlastnachweis vor, der die Einhaltung des deklarierten Rahmens über Zeit belegt.

Mindestens enthalten sein müssen:

- Lastform: Topologie, Image/Anwendungsrevision, Worker-Builds, Queues, Cache, Datenbank und repräsentativer Mix aus Starts, Timern, Aktivitäten, Abfragen und Exporten
- Zeitfenster: Beginn/Ende mit mindestens einem Reparaturfenster, gegebenenfalls Aufbewahrungs-/Archivdurchlauf und repräsentativer Schwankung eines Geschäftszyklus
- Queue-Stabilität: Rückstands-, Bereitschafts- und Startalter, Zufluss/Versand und veraltete Poller innerhalb veröffentlichter Basiswerte
- Korrektheit: kein anhaltendes `status = error` bei `GET /waterline/api/v2/health`, kein unerklärtes Wachstum von `operator_metrics.repair.*` und keine dauerhaften Lücken in `operator_metrics.workers.*`
- Prozess/Cache: begrenzter Speicher, CPU-, Thread-/Ereignisschleifendruck und Cache-/Kardinalitätswachstum statt stetigen Anstiegs
- Wiederherstellung: letzte erfolgreiche Sicherung und Probe, Dauer und Befehle zum Nachweis wiederhergestellter Bereitschaft

Speichern Sie das Paket für dieselben Betreiber zugänglich beim Betriebshandbuch. Ohne passenden Dauerlastnachweis bleiben Benchmark-Zahlen, Alarmregeln und Wiederherstellungszeiten vorläufig.

## Durchgehende Betriebsprüfliste {#end-to-end-operator-checklist}

Nach Upgrades und vor Vertrauen in eine neue Umgebung:

1. Führen Sie `php artisan workflow:v2:doctor --strict` aus.
2. Prüfen Sie `GET /waterline/api/v2/health` auf `ok`, `warning` oder `error`.
3. Lesen Sie in `GET /waterline/api/stats` Rückstand, Reparatur, Historie, Verträge, Kompatibilität und Projektionsabweichung.
4. Zeigen Sie bei Drift Neubau-/Backfill-Vorschauen an.
5. Exportieren Sie einen repräsentativen Lauf und prüfen Sie den Artefaktpfad für Replay/Archiv.
6. Prüfen Sie, dass Archive aktive Ansichten verlassen und dauerhafte Zeilen bis zur Bereinigung erhalten bleiben.
7. Erproben Sie die dokumentierte Wiederherstellung/Umschaltung und vergleichen Sie gemessene Zeiten mit der veröffentlichten Erwartung Ihrer Topologie.

## Weitere Leitfäden {#related-guides}

- [Überwachung](./monitoring.md)
- [Waterline-Betriebs-API](./waterline-operator-api.md)
- [Workflow-Daten bereinigen](./configuration/pruning-workflows.md)
- [Selbst betriebene Bereitstellungen](./deployment.md)
