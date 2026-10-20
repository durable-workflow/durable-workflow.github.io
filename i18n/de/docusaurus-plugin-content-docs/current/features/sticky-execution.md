---
sidebar_position: 25
title: Sticky Execution
description: Unverbindliche Worker-Affinität, Replay-Caches, gewöhnliche Aufgabenzuordnung und Unterstützung durch die SDKs.
tags:
  - sticky-execution
  - replay
  - operations
keywords:
  - Sticky Execution
  - Sticky-Replay-Cache
  - kaltes Replay
  - worker_id-Routing
  - Cache-Diagnosen
---

# Sticky Execution {#sticky-execution}

Sticky Execution ist eine unterstützte Replay-Optimierung von Durable Workflow v2. Ein Worker kann nach Abschluss einer Workflow-Aufgabe einen warmen prozesslokalen Cache behalten. Beansprucht er eine spätere Aufgabe desselben Laufs, kann er den gültigen Cache wiederverwenden. Die Affinität reserviert ihm die Aufgabe nicht.

Sticky Execution ist kein Korrektheitsmerkmal. Workflow-Fortschritt wird weiterhin ausschließlich durch dauerhafte Historie festgeschrieben; gewöhnliches kaltes Replay bleibt gültig. Workflow-Code darf für Korrektheit nicht von prozesslokalem Zustand abhängen.

## Vertragsübersicht {#contract-summary}

Sticky Execution hat vier Zusagen:

- Sticky-Caches gehören Worker-Prozessen, nicht Server oder Datenbank.
- Die Affinität verwendet die protokollseitige `worker_id` als Kennung des Cache-Inhabers.
- Die Affinität ist unverbindlich und läuft ab. Kaltes Replay ist bei Cache-Miss, Neustart, Drain, Rollout oder Verdrängung der verpflichtende Rückfall.
- Betreiber erhalten benannte Einstellungen und Diagnosen für Aktivierung, TTL, Kapazität, Treffer- und Fehlraten, erzwungenes kaltes Replay und Kapazitätsdruck.

Die dauerhaften Affinitätsfelder von Läufen und Workflow-Aufgaben sind `sticky_worker_id` und `sticky_until`. Die Aufgaben-Diagnosefelder sind `sticky_replay_mode` und `sticky_claimed_at`.

## Lebenszyklus des Sticky-Cache {#sticky-cache-lifecycle}

Ein Sticky-Cache ist eine lokale Datenstruktur mit wiedergegebenem Workflow-Zustand eines oder mehrerer Läufe. Schließt ein Sticky-fähiger Worker eine Aufgabe ab, kann Server ihn bis `sticky_until` als Sticky-Inhaber des Laufs speichern. Folgeaufgaben übernehmen diese Affinität bei ihrer Erstellung.

Der Worker bestimmt Cache-Inhalt und Verdrängungsregeln. Er darf Läufe bei Kapazitätsgrenzen, Drain, Neustart, Build-Wechsel, unsicherem Cache-Zustand oder zur Speicherfreigabe entfernen. Server behandelt Cache-Inhalte nie als dauerhaften Zustand.

Erhält ein Worker eine Aufgabe mit Affinität, hat aber keinen gültigen Cache-Eintrag mehr, muss er die dauerhafte Historie kalt wiedergeben. Allein das Aufgaben-Lease berechtigt zum Festschreiben von Workflow-Fortschritt.

## Routing-Identität {#routing-identity}

Die Routing-Identität ist die protokollseitige `worker_id`. Worker aktivieren Sticky-Affinität durch Registrierung mit eingeschaltetem Cache und fortlaufende Heartbeats als aktive Worker der Warteschlange.

Sticky-Affinität fügt der Zuordnung bereiter Aufgaben weder eine Inhaberbevorzugung noch eine exklusive Wartefrist hinzu. Die PHP-Laufzeit wählt Kandidaten nach Priorität, `available_at` und Aufgabenkennung. Server kann den Kandidatenstapel innerhalb einer Prioritätsstufe nach Fairness-Schlüsseln ausgleichen. Gewöhnliche Prüfungen für Kompatibilität, Workflow-Typ, Queue, Namespace, Kapazität und Lease bleiben bestehen.

Jeder berechtigte pollende Worker kann die Aufgabe vor `sticky_until` beanspruchen, auch wenn ein anderer lebender Worker die Affinität hält. Hat der Inhaber keinen freien Workflow-Platz, kann ein anderer berechtigter Worker sofort übernehmen und kalt wiedergeben. Die Aufgabe wartet weder auf den Cache noch auf den Affinitätsablauf. Eine höhere TTL erzeugt keine längere Inhaberreservierung.

`sticky_until` begrenzt die Gültigkeit der gespeicherten Affinität und den Zeitraum, in dem eine Inhaberbeanspruchung `sticky_hit_expected` heißen darf. Es bestimmt weder Aufgabenverfügbarkeit noch Lease-Verlängerung und garantiert keinen vorhandenen Cache-Eintrag.

## Rückfallverhalten {#fallback-semantics}

Kaltes Replay ist der verpflichtende Rückfall. Es erfolgt, wenn:

- Sticky Execution deaktiviert ist.
- Der Worker keine Sticky-Cache-Unterstützung registriert hat.
- Die Aufgabe keine aktive `sticky_worker_id` und `sticky_until` besitzt.
- Der Inhaber veraltet, abwesend, im Drain, neu gestartet oder ersetzt ist.
- Der Inhaber den Lauf aus dem Cache verdrängt hat.
- Ein anderer Worker die Aufgabe übernimmt, auch bei noch aktiver Affinität.
- Die Affinität vor Beanspruchung abgelaufen ist.

Die Replay-Diagnosemodi sind:

- `sticky_hit_expected`: Der Inhaber beanspruchte die Aufgabe vor Ablauf. Der Worker muss seinen lokalen Cache trotzdem vor Verwendung prüfen.
- `cold_replay`: Keine Sticky-Affinität galt.
- `forced_cold_replay`: Ein Inhaber war gespeichert, aber ein anderer Worker übernahm oder die Affinität war abgelaufen. Das ist auch bei gesundem ursprünglichem Inhaber möglich.

`forced_cold_replay` ist kein Korrektheitsfehler. Die Sticky-Optimierung hat für diese Aufgabe lediglich nicht den vorgesehenen Replay-Vorteil erbracht.

## Bereitstellung, Drain und Rollout {#deployment-drain-and-rollout}

Sticky Execution folgt dem Worker-Lebenszyklus. Bei Drain soll ein Worker keine neuen Workflow-Aufgaben beanspruchen, während er vorhandene Aufgaben abschließt, Heartbeats sendet, Fehler meldet oder Leases regelgemäß ablaufen lässt. Andere kompatible Worker können bereite Aufgaben übernehmen und kalt wiedergeben, ohne auf Affinitätsablauf zu warten.

Ersatz-Worker übernehmen keine prozesslokalen Caches. Ein Rollout kann `forced_cold_replay` deshalb erhöhen, bis neue Worker eigene Caches aufbauen. Verwenden Sie je Worker-Prozess oder Neustart eindeutige `worker_id`-Werte, um alte Cache-Inhaber von neuen Prozessen zu unterscheiden.

Build-ID-Kompatibilität und Workflow-Definitionsfingerabdrücke entscheiden weiterhin, ob ein Worker eine Aufgabe ausführen darf. Sticky Execution erlaubt kein Routing inkompatiblen Codes zu einem Lauf.

## Betriebseinstellungen {#operator-controls}

Sticky Execution wird durch Workflow-/Laufzeitkonfiguration und Worker-Fähigkeiten gesteuert, nicht durch eigene Server-Image-Umgebungsvariablen. Die Paketkonfiguration stellt Aktivierung und Affinitäts-TTL bereit:

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

Jeder Worker meldet Cache-Kapazität bei Registrierung und Heartbeat. Deaktivieren Sie Sticky-Affinität in der Laufzeitkonfiguration oder verwenden Sie Worker ohne Sticky-Cache-Unterstützung, ohne Workflow-Semantik zu ändern. Bestehende Läufe werden per kaltem Replay fortgesetzt.

## Worker-Protokollfelder {#worker-protocol-fields}

Sticky-fähige Worker melden die Unterstützung bei der Registrierung:

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Worker melden Cache-Diagnosen per Heartbeat:

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

Workflow-Poll-Antworten enthalten `task.sticky_execution` mit `sticky_worker_id`, `sticky_until`, `replay_mode` und `cache_directive`. `resume_if_present` erlaubt die Verwendung eines gültigen warmen Cache. Bei fehlendem oder ungültigem Eintrag muss der Worker kalt wiedergeben.

## Metriken und Diagnosen {#metrics-and-diagnostics}

Zu den Betriebsmetriken gehören:

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

Der eigenständige Server meldet unter `sticky_execution_workers` außerdem Cache-Kapazität, -Größe, Treffer, Fehltreffer, erzwungene kalte Replays, Verdrängungen und die Zahl von Workern unter Kapazitätsdruck.

Verwenden Sie diese Diagnosen wie folgt:

- `ready_sticky_tasks` zählt bereite Workflow-Aufgaben mit noch gültiger gespeicherter Affinität. Die Aufgaben werden damit nicht für ihre Inhaber zurückgehalten. Die PHP-Laufzeit meldet dieselbe Zahl derzeit als `capacity_pressure_tasks`.
- Eine niedrige erwartete Trefferrate kann durch Übernahme anderer Worker, TTL-Ablauf, Worker-Wechsel oder Cache-Verdrängung entstehen. Vergleichen Sie beanspruchende Worker und deren Cache-Metriken vor Änderungen an TTL oder Kapazität.
- Viele Fehltreffer oder erzwungene kalte Replays gefährden die Korrektheit nicht, zeigen aber ausbleibende Replay-Kostenvorteile.
- Worker-Cache-Kapazitätsdruck meldet Worker nahe oder oberhalb ihrer angegebenen Cache-Kapazität. Er ist von freien Ausführungsplätzen und der Zahl bereiter Aufgaben zu unterscheiden.

## Replay-sicherer Code {#replay-safe-code}

Workflow-Code muss bei Sticky-Ausführung und kaltem Replay dasselbe Verhalten zeigen. Entscheidungen beruhen auf dauerhafter Historie: Eingaben, Aktivitätsergebnissen, Timern, Signalen, Updates, aufgezeichneten Seiteneffekten und Versionsmarkern. Memo- und Suchattributprojektionen sind Betriebsmetadaten; verzweigen Sie nicht anhand ihrer veränderlichen Werte.

Verlassen Sie sich für Korrektheit nicht auf veränderliche globale Werte, lokale Dateien, offene Sockets, Objektidentität, Zufallswerte, Wanduhrzeit oder sonstigen prozesslokalen Zustand. Sticky Execution kann solche Werte zufällig für eine Aufgabe erhalten und sie beim nächsten Cache-Miss, Neustart, Rollout oder Verdrängen verlieren.

Verwenden Sie [`sideEffect(...)`](/docs/features/side-effects) für einmalig aufzuzeichnende nichtdeterministische Werte und gewöhnliche Aktivitäten für externe Seiteneffekte. Siehe [Ausführungsgarantien und Idempotenz](/docs/constraints/execution-guarantees) zum Replay- und Historienvertrag.
