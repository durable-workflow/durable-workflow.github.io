---
sidebar_position: 26
title: Portable Worker-Affinität
description: Unverbindliche Worker-Affinität, Replay-Caches, gewöhnliche Aufgabenzuordnung und Unterstützung durch die SDKs.
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# Portable Worker-Affinität {#portable-worker-affinity}

Service-Worker implementieren die unten aufgeführten Funktionen über Servers Worker-Protokoll. SDK-Version und Worker-Konfiguration bestimmen die Verfügbarkeit.

Lokale Aktivitäten, Worker-Sitzungen und Sticky Execution folgen derselben Portabilitätsregel: Ein Service-Worker muss jede Funktion als unterstützt oder ausdrücklich abgelehnt melden. Protokollversion `1.18` ist dafür die Mindestversion. Server lehnt eine einfache Routing-Fähigkeitsangabe ab, wenn das strukturierte Manifest die Funktion nicht ebenfalls unterstützt.

## SDK-Unterstützung {#sdk-support}

| SDK-Worker | Lokale Aktivitäten | Worker-Sitzungen | Sticky Execution |
| --- | --- | --- | --- |
| PHP | Unterstützt | Unterstützt | Unterstützt |
| Python | Seit 2.2.0 | Seit 2.3.0 | Seit 2.5.0 mit `sticky_cache_capacity` größer als null |
| Rust | Seit 3.1.0 mit `Worker::local_activities(true)` | Seit 3.2.0 mit `Worker::worker_sessions(true)` | Seit 3.4.0 mit `Worker::sticky_cache(...)` |

Worker melden nur implementierte und im Profil aktivierte Fähigkeiten. Rust benötigt für lokale Aktivitäten, Sitzungen und Sticky Execution eine ausdrückliche Aktivierung, Python für Sticky Execution. Ältere SDKs lehnen nicht implementierte Fähigkeiten ab. Gewöhnliche Workflows und Queue-Aktivitäten verwenden ohne diese Optimierungen vollständiges Replay dauerhafter Historie.

## Aufzeichnung lokaler Aktivitäten {#local-activity-recording}

PHP-, Python- und entsprechend aktivierte Rust-Worker führen lokale Aktivitäten im Workflow-Worker aus. Der Aufgabenabschluss enthält Argumente, Versuchsergebnisse, Wiederholungs- und Zeitlimitregeln, Heartbeat-Fortschritt sowie terminales Ergebnis oder Fehler. Server speichert die Sequenz atomar als gewöhnliche Aktivitätshistorie mit `execution_mode=local`.

Replay verwendet das gespeicherte terminale Aktivitätsereignis, ohne den lokalen Handler erneut aufzurufen. Geht ein Worker vor dem Festschreiben durch Server verloren, kann der Handler erneut laufen. Externe Effekte müssen daher idempotent sein.

Gewöhnliche PHP-Worker führen synchrone Handler im Prozess aus. Abbruch sowie Heartbeat-, Versuchs- und Gesamtzeitlimits werden vor einem Versuch, bei `ActivityContext::heartbeat()` oder nach Rückkehr des Handlers beobachtet. Handler müssen kurz bleiben und blockierende Arbeit durch sichere Heartbeat-Punkte unterteilen.

Asynchrone Python- und Rust-Callbacks müssen ihrer Laufzeit Ausführungszeit überlassen. Rust erneuert das genaue Workflow-Aufgaben-Lease unabhängig von Anwendungs-Heartbeats, verwirft Callbacks bei Zeitüberschreitung, Autoritätsverlust oder Worker-Stopp und speichert begrenzte Versuchs- und Heartbeat-Berichte. Siehe das [Rust-Beispiel lokaler Aktivitäten](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs) und die [API-Referenz](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

PHP-Worker mit [kooperativem Abbruch](/docs/polyglot/cancellation) verwenden Protokoll 1.20 und überwachte Callback-Prozesse für vorbereitete lokale Aktivitäten. Gewöhnliche lokale Rust-Ausführung nutzt ein anderes Worker-Profil und ist nicht mit vorbereiteter kooperativer Überwachung kombinierbar. Blockierende Callbacks benötigen Prozessüberwachung für eine garantierte physische Beendigung.

## Lebenszyklus einer Worker-Sitzung {#worker-session-lifecycle}

Die PHP-, Python- und Rust-SDKs bieten typisierte Sitzungsoptionen sowie Erstellen, Verwenden, Erneuern und Schließen. Optionen umfassen Anforderungen, Queue, Lease-Dauer, Gesamt-TTL, Aktivitätsparallelität und Wiedererwerbsregel. Bei geordnetem Herunterfahren schließt ein Worker seine Sitzungen.

Verschwindet ein Inhaber, laufen Lease und Gleichzeitigkeitsreservierung ab. Ein neuer Inhaber kann die Sitzung bei passenden Anforderungen wiedererwerben, muss aber lokale Ressourcen vor der ersten Aktivität neu aufbauen. Sitzungsidentität macht Prozessspeicher niemals dauerhaft.

Wiedererwerb erhält die ursprüngliche absolute Sitzungs-TTL. Erneuerung verlängert die Inhaberberechtigung, nicht diese TTL. Verwenden Sie Server 2.5.1 oder neuer für ursprüngliche TTL-Erhaltung und gespeichertes Sitzungsrouting bei kaltem Replay. Siehe das [Rust-Sitzungsbeispiel](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs) und [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html).

## Sticky Execution und kaltes Replay {#sticky-execution-and-cold-replay}

Die PHP-, Python- und Rust-Caches sind begrenzt und nach genauer Workflow-ID, Lauf-ID und Worker-Build-ID indiziert. Sie melden `hit`, `miss`, `eviction` und `forced_cold_replay`. Ablauf, Verdrängung, Worker-Wechsel, Inhaberverlust oder Build-Abweichung verwerfen die Optimierung und führen vollständige Historie erneut aus.

Verwenden Sie Python SDK 2.5.0 mit Server 2.5.10 oder neuer. Der Cache ist standardmäßig aus. Aktivieren Sie ihn mit `sticky_cache_capacity` und setzen Sie Byte-Grenze und TTL der gespeicherten Historie. Er speichert kodierte Historie und kann geprüfte Seitencursor für weniger Downloads wiederverwenden. Planen Sie zusätzlichen Speicher für Dekodierung und deterministisches Replay ein. Siehe den [Python-Leitfaden mit ausführbarem Beispiel](https://python.durable-workflow.com/guides/sticky-execution/).

Rust SDK 3.4.0 unterstützt dieselbe veröffentlichte Server-Basis. Aktivieren Sie den Cache mit `Worker::sticky_cache(StickyCacheOptions::new(...))` und konfigurieren Sie Byte-Grenze und TTL der kodierten Historie. Jedes Replay dekodiert einen neuen Snapshot. Wiederverwendete Cursor werden gegen aktuelles Lease und dauerhafte Historie geprüft, bevor ein warmer Treffer akzeptiert wird. Der Cache enthält Historie, keine lebenden Workflow-Instanzen oder Sitzungsressourcen. Siehe [StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html) und das [Rust-Beispiel](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs).

Server 2.5.10 erhält vollständiges Replay für PHP-SDKs vor 2.2.0. Verwenden Sie PHP SDK 2.2.0 oder neuer für Replay-Hinweise bei Historien, die mit StartAccepted beginnen.

Sticky-Affinität reserviert bereite Aufgaben weder für den Cache-Inhaber noch gibt sie ihm Zuordnungspriorität. Ein berechtigter Worker kann eine Aufgabe während aktiver Affinität eines anderen lebenden Workers übernehmen, auch wenn diesem freie Workflow-Plätze fehlen. Die Übernahme heißt `forced_cold_replay`. Eine höhere TTL lässt die Zuordnung nicht auf den Inhaber warten.

Erzwungenes kaltes Replay belegt diagnostisch die fehlende Cache-Optimierung, keinen Korrektheitsfehler. Workflow-Code muss bei leerem Cache deterministisch bleiben. Siehe die [Zuordnungs- und Diagnoseregeln](/docs/features/sticky-execution#routing-identity).

## Sichere Voreinstellungen und rollende Worker-Flotten {#safe-defaults-and-rolling-fleets}

Gewöhnliche Workflows benötigen keine Sitzungs- oder Sticky-Konfiguration. Flotten mit gemischten Versionen lehnen inkompatible Daten an der Protokollgrenze ab: Server prüft ausgehandelte Version, einfache Fähigkeitsangabe, strukturiertes Manifest und genaue Cache-Identität vor Annahme funktionsspezifischer Abschlussdaten.

Das veröffentlichte [SDK-übergreifende Szenariomanifest](/platform-conformance/portable-worker-affinity-runtime-scenarios.json) umfasst korrekte Fähigkeitsmeldungen, lokale Aktivitäts-Replays, Sitzungsinhaberverlust und Wiedererwerb, Cache-Treffer und Verdrängung, Worker-Ersatz, erzwungenes kaltes Replay und Workflows ohne Zusatzkonfiguration.

Für eingebettete Laravel-Implementierungen siehe [Lokale Aktivitäten](/docs/features/local-activities), [Worker-Sitzungen](/docs/features/worker-sessions) und [Sticky Execution](/docs/features/sticky-execution). Diese APIs gehören zum Workflow-Paket. Verwenden Sie für Service-Worker die API des jeweiligen SDKs.
