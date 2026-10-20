---
sidebar_position: 6
title: Task-Zuordnung und -Zuweisung
description: Wie Durable Workflow bereite dauerhafte Tasks Workern zuweist, vom Aufwecken langer Abfragen bis zu dedizierten Matching-Rollen.
tags:
  - worker-protocol
  - task-queues
  - operations
  - dispatch
keywords:
  - Task-Zuordnung
  - Task-Zuweisung
  - Matching-Rolle
  - Erkennung bereiter Tasks
  - Warteschlangen-Aufwecken
---

# Task-Zuordnung und -Zuweisung {#task-matching-and-dispatch}

Dieser Leitfaden erklärt, wie Durable Workflow bereite Arbeit findet,
kompatiblen Workern zuweist und diesen Zuweisungspfad über „jeder Knoten fragt
alles ab“ hinaus skaliert. Er beschreibt den Vertrag hinter Workflow-Task-
und Aktivitäts-Task-Abfragen, dem Aufwecken von Warteschlangen und
Bereitstellungen mit dedizierter Matching-Rolle.

Durable Workflow trennt zwei Aufgaben:

- Dauerhafte Historie und Task-Zustand bleiben in der Datenbank.
- Die Task-Zuordnung entscheidet, welcher lebende Worker den nächsten geeigneten Task erhält.

Diese Trennung ist schon vor der Einführung eines eigenen Matching-Dienstes
wichtig. Der Betrieb kann damit Erkennung bereiter Tasks, Zuständigkeit für
Warteschlangen, Lease-Wechsel und Rückstaukontrolle als eine explizite Rolle
betrachten statt als beiläufige Effekte jedes Worker-Prozesses.

## Aufgaben der Matching-Rolle {#what-the-matching-role-does}

Die Matching-Rolle ist verantwortlich für:

- das Finden bereiter Workflow- und Aktivitäts-Tasks
- das Eingrenzen geeigneter Tasks nach Namespace, Verbindung, Warteschlange und Kompatibilitätsfamilie
- das Anbieten eines Tasks an jeweils einen Worker
- das Umwandeln eines erfolgreichen Claims in eine Lease mit Ablaufzeit
- das Erhalten desselben Tasks, wenn ein Claim scheitert, eine Lease abläuft oder ein Worker verschwindet
- das Sichtbarmachen von Aufweck- und Rückstauzustand für den Betrieb

Matching ersetzt weder dauerhafte Historie noch Workflow-Replay oder
Task-Ausführung. Es entscheidet, wer als Nächstes ausführen darf.

## Bereitstellungsformen {#deployment-shapes}

Durable Workflow unterstützt derzeit drei praktische Formen:

### Matching im Worker {#in-worker-matching}

Dies ist die Standardform. Worker-Prozesse fragen mit Long Polling bereite
Arbeit ab. Sperren bei der Übernahme stellen sicher, dass jeweils nur ein
Worker eine Task-Lease besitzt.

Verwenden Sie dies, wenn:

- Sie einen einzelnen Knoten oder eine kleine Flotte betreiben
- der Warteschlangendruck mäßig ist
- Sie noch keinen dedizierten Matching-Daemon benötigen

### HTTP-Matching im Server {#in-server-http-matching}

Bei eigenständigen Server-Bereitstellungen erreichen externe Worker denselben
Matching-Vertrag über das Worker-Protokoll:

- `POST /api/worker/workflow-tasks/poll`
- `POST /api/worker/activity-tasks/poll`

Der Server wird zum Netzwerkeinstiegspunkt für denselben Ablauf aus Erkennung
bereiter Tasks, Claim, Heartbeat und Abschluss.

### Bereitstellung mit dedizierter Matching-Rolle {#dedicated-matching-role-deployment}

Größere Flotten können die breite Suche nach bereiten Tasks in einem dedizierten
Matching-Prozess bündeln. Die derzeit dokumentierte Betriebsform ist:

```bash
php artisan workflow:v2:repair-pass --loop
```

Führen Sie diesen Daemon in einem eigenen Prozess aus und setzen Sie
`DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` auf reinen Ausführungsknoten, damit diese
nicht mehr bei jedem Schleifendurchlauf breit Warteschlangen-Worker aufwecken.

Verwenden Sie diese Form, wenn:

- Ausführungsknoten sich auf Replay und Aktivitätsausführung konzentrieren sollen
- breite unabhängige Abfragen unnötige Konkurrenz erzeugen
- der Betrieb eine explizite Zuständigkeit für die Suche nach bereiten Tasks und deren Prüftakt möchte

Die dedizierte Rolle ändert den Ort des Matchings, nicht den Worker-Protokollvertrag.
Die Semantik von Abfragen, Claims, Leases und erneuter Zustellung bleibt gleich.

## Bereite Tasks erkennen {#ready-task-discovery}

Die Matching-Rolle sucht dauerhafte Tasks, die tatsächlich jetzt ausführbar sind:

- Die Task-Art passt zum Abfrager (`workflow` oder `activity`).
- Der Task ist im Zustand `ready`.
- Der Zeitpunkt `available_at` ist erreicht.
- Namespace-, Warteschlangen-, Verbindungs- und Kompatibilitätsfilter passen weiterhin.
- Aktivitätsabfragen erfordern zusätzlich einen passenden gemeldeten Aktivitätstyp.

Das Aufwecken langer Abfragen beschleunigt den Ablauf, sichert aber nicht dessen
Korrektheit. Kommt das Aufwecksignal verspätet oder gar nicht, wird der Task
weiterhin durch dauerhaftes Abfragen sichtbar. Ein Aufweckfehler sollte die
Latenz erhöhen, keine Arbeit stranden lassen.

## Claim, Lease und Rückstaukontrolle {#claim-lease-and-backpressure}

Matching bietet nur eine Gelegenheit. Die Zuständigkeit beginnt, wenn ein
Worker den Task erfolgreich übernimmt und eine Lease erhält.

Diese Lease sorgt für die Rückstaukontrolle von Durable Workflow:

- Ein Worker besitzt den Task, bis die Lease erneuert, abgeschlossen, freigegeben oder abgelaufen ist.
- Ein ausgefallener oder veralteter Worker hält den Task nicht dauerhaft fest.
- Erneute Zustellung ist normal und muss als Teil einer Mindestens-einmal-Ausführung behandelt werden.
- Inkompatible Worker stehlen die Lease nicht, sondern erhalten eine explizite Ablehnung.

Da Arbeit auf Leases basiert, zeigt sich Warteschlangendruck als Rückstau,
veraltete Leases oder wiederholte Zustellung statt als versteckter Verlust im Speicher.

## Warteschlangen aufteilen {#queue-partitioning}

Die wichtigsten Aufteilungsmerkmale sind:

- **Namespace** für Mandanten- oder Umgebungsgrenzen
- **Verbindung** und **Warteschlange** für Arbeitsrouting-Grenzen
- **Kompatibilitätsfamilie** für sicheres Routing nach Kompatibilitätsmarkern
- **Aktivitätstypfilter** für Worker, die nur ausgewählte Aktivitäten ausführen

Verwenden Sie getrennte Warteschlangen für stärkere Isolation, unabhängige
Worker-Pools oder unterschiedliche Budgets nachgelagerter Systeme. Verwenden
Sie Kompatibilitätsfamilien, wenn dieselbe Warteschlange während eines Rollouts
oder Rollbacks weiterlaufen muss, ohne laufende Arbeit auf inkompatible
Executors zu verschieben.

## Aufwecksignale und dedizierte Suchläufe {#wake-signals-and-dedicated-sweeps}

Aufwecksignale verkürzen die Zeit zwischen „Task wurde bereit“ und „ein Abfrager
hat ihn bemerkt“. Sie sind nicht die dauerhafte maßgebliche Zustandsquelle.

In der Standardform können Warteschlangen-Worker im normalen Schleifenablauf
Aufwecksignale erzeugen. Bei einer dedizierten Matching-Rolle deaktivieren reine
Ausführungsknoten diesen breiten Aufweckpfad. Stattdessen verantwortet der
Matching-Daemon den Suchrhythmus.

Diese Einstellungen dienen der Abstimmung:

- `DW_V2_MATCHING_ROLE_QUEUE_WAKE` steuert, ob Ausführungsknoten im Worker aufwecken.
- `DW_WAKE_SIGNAL_TTL_SECONDS` bestimmt, wie lange Aufweckmarker sichtbar bleiben.
- Long-Poll-Timeouts bestimmen, wie lange Abfrager wartend auf Arbeit ruhen.

## Was der Betrieb beobachten sollte {#what-operators-should-watch}

Verwenden Sie diese Oberflächen gemeinsam:

- `GET /api/cluster/info` für die Rollentopologie je Knoten:
  `current_shape`, `current_process_class`, aktuelle Rollen und den vollständigen
  `matching_role`-Vertrag mit `queue_wake_enabled`, Bereitstellungs-`shape`,
  `wake_owner`, `task_dispatch_mode`, festgelegten `partition_primitives` und dem
  aktuellen `backpressure_model`
- Einsicht in Task-Warteschlangen für Anzahl bereiter Tasks, aktive Slots und Drosselung
- Einsicht in die Worker-Flotte für aktive gegenüber veralteten Abfragern je Warteschlange
- `dw system:operator-metrics --json` oder `/api/system/operator-metrics`
  für denselben knotenlokalen `matching_role`-Vertrag neben aktuellen Rückstau-,
  Reparatur-, Worker- und Zustandszählern des antwortenden Prozesses
- Zustands- und Waterline-Diagnosen für fehlerhafte Tasks, veraltete Leases und Lücken kompatibler Worker
- Prüfungen für rollende Upgrades während eines Überlappungsfensters, wenn Matching unsichere Claims blockieren muss

Wächst das Alter des ältesten bereiten Tasks, während kompatible Worker
verfügbar sind, kommt der Matching-Pfad nicht schnell genug voran. Bleiben
bereite Tasks erhalten, können aber von keinem kompatiblen Worker übernommen
werden, ist dies ein Kompatibilitätsproblem, kein Arbeitsverlust durch Matching.

## Wann eine dedizierte Matching-Rolle sinnvoll ist {#when-to-introduce-a-dedicated-matching-role}

Wechseln Sie vom Standard-Matching im Worker zu einer dedizierten Rolle, wenn:

- breite Abfragen sichtbare Datenbank- oder Cache-Konkurrenz erzeugen
- Ausführungsknoten nicht länger den Aufwand der Suche nach bereiten Tasks tragen sollen
- Warteschlangenfairness und Zuweisungszuständigkeit als explizites Teilsystem betrachtet werden müssen
- der Betrieb einen eigenen Prozess zum Skalieren, Überwachen und Debuggen der Suche nach bereiten Tasks möchte

Bleiben Sie bei der Standardform, wenn die Flotte klein ist und klare
Rollout- und Kompatibilitätsregeln wichtiger sind als eine neue Topologie.

## Verwandte Referenzen {#related-references}

- [Worker-Protokoll](/docs/polyglot/worker-protocol) für Abfragen, Heartbeats, Abschluss und Fehlermeldung
- [Task-Warteschlangenzulassung](/docs/polyglot/task-queue-admission) für Slot-, Lease- und Zuweisungsbudgets über dem Matching
- [Rollende Upgrades](/docs/rolling-upgrades) für das Rollout-Verfahren mit Matching und Kompatibilität
- [Server-Konfigurationsreferenz](/docs/polyglot/server-config-reference) für
  `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, Abfragezeiten und Aufwecksignal-Einstellungen
