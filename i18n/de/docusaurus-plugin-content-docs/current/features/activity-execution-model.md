---
sidebar_position: 22
title: Ausführungsmodell für Aktivitäten
description: Wie gewöhnliche Queue-Aktivitäten, lokale Aktivitäten, Worker-Sitzungen und Sticky Execution in Durable Workflow v2 zusammenpassen.
tags:
  - activities
  - workers
  - execution
keywords:
  - Ausführungsmodell für Aktivitäten
  - lokale Aktivitäten
  - Worker-Sitzungen
  - Sticky Execution
  - dauerhafte Aufgabenzustellung
  - Queue-Aktivitäten
---

# Ausführungsmodell für Aktivitäten {#activity-execution-model}

Die Unterstützung durch Service-Worker und die bei fehlenden Fähigkeiten sicher
ablehnende Aushandlung über PHP, Python und Rust hinweg beschreibt die
Unterstützungsmatrix [Portable Worker-Affinität](/docs/polyglot/portable-worker-affinity)
für den Service-Modus.

Durable Workflow v2 bietet explizite Primitive für die üblichen Möglichkeiten
zur Aktivitätsplatzierung:

- gewöhnliche Queue-Aktivitäten für dauerhafte, unabhängig geleaste Arbeit;
- [lokale Aktivitäten](/docs/features/local-activities) für kurze Aktivitätsarbeit im selben Prozess, die weiterhin Aktivitätshistorie aufzeichnet;
- [Worker-Sitzungen](/docs/features/worker-sessions) für dauerhafte Aktivitätsaffinität über mehrere Queue-Aktivitätsschritte;
- [Sticky Execution](/docs/features/sticky-execution) für die Affinität des Workflow-Replay-Caches, mit gewöhnlichem Replay als Korrektheitsfallback.

## Gewöhnliche Queue-Aktivitäten {#ordinary-queued-activities}

`activity(...)` und `Workflow::activity(...)` sind gewöhnliche Queue-Aktivitäten.
Sie bleiben das Standardprimitiv für Aktivitäten.

1. Workflow-Code ruft `activity(MyActivity::class, ...)` auf.
2. Die Workflow-Aufgabe zeichnet `ActivityScheduled` auf und erstellt auf der konfigurierten Verbindung und Queue eine dauerhafte Aktivitätsaufgabe.
3. Ein kompatibler Worker übernimmt diese Aufgabe mit einer Lease.
4. Der Worker führt die Aktivitätsklasse aus und meldet Abschluss, Fehler, Abbruch, Heartbeat oder Timeout.
5. Die Engine zeichnet das Aktivitätsergebnis in der Workflow-Historie auf und setzt den Workflow aus dauerhaftem Zustand fort.

Gewöhnliche Aktivitätsversuche können auf jedem kompatiblen Worker laufen.
Eine Wiederholung kann auf einem anderen Prozess, Host oder Build landen.
Aktivitätscode muss bei doppelter Zustellung, Wiederholungen nach Lease-Ablauf
und Rennen um späte Abschlussmeldungen idempotent sein. Verwenden Sie
`activity_execution_id` als Standard-Idempotenzschlüssel für entfernte Systeme
und `activity_attempt_id` nur, wenn ein nachgelagertes System Korrelation pro
Versuch benötigt.

```php
use function Workflow\V2\activity;

$quote = activity(FetchQuoteActivity::class, $customerId);
$invoice = activity(CreateInvoiceActivity::class, $quote['id']);
```

## Lokale Aktivitäten {#local-activities}

`localActivity(...)`, `Workflow::localActivity(...)` und
`Workflow::executeLocalActivity(...)` führen eine Aktivitätsklasse innerhalb
des Workflow-Worker-Prozesses aus, der gerade die Workflow-Aufgabe verarbeitet.
Sie erstellen keine gewöhnliche Aktivitätsaufgabe.

Lokale Aktivitäten zeichnen weiterhin normale Aktivitätshistorie auf:

- `ActivityScheduled`
- `ActivityStarted`
- `ActivityHeartbeatRecorded`
- `ActivityRetryScheduled`
- `ActivityCompleted`
- `ActivityFailed`
- `ActivityCancelled`
- `ActivityTimedOut`

Jedes lokale Aktivitätsereignis trägt `execution_mode=local` und
`local_activity=true`. Der Snapshot der Aktivitätsausführung speichert
`activity_options.execution_mode=local`. Aktivitäts-Heartbeats verlängern die
Lease der besitzenden Workflow-Aufgabe, während der lokale Versuch läuft.

Verwenden Sie lokale Aktivitäten für kurze idempotente Seiteneffekte, die
Aktivitätswiederholungen, Timeouts, Heartbeats, Abbruch und Sichtbarkeit
benötigen, aber kein Queue-Routing und keine unabhängige
Aktivitäts-Worker-Flotte. Die Verträge für API, Timeouts, Wiederholung,
Herunterfahren, kaltes Replay, Routing und Metriken beschreibt
[Lokale Aktivitäten](/docs/features/local-activities).

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

## Worker-Sitzungen {#worker-sessions}

Worker-Sitzungen binden eine Folge gewöhnlicher Queue-Aktivitätsversuche an
eine gemeinsame Worker-Sitzungs-Lease. Verwenden Sie sie, wenn mehrere
dauerhafte Schritte Worker-lokale Ressourcen wie GPU-Speicher, ein eingebundenes
Dateisystem oder ein geladenes Modell wiederverwenden müssen.

Worker-Sitzungen machen eine Aktivität nicht lokal. Jede Aktivität innerhalb
einer Sitzung bleibt eine dauerhafte Aktivitätsaufgabe mit eigener Lease,
Heartbeat, Timeout, Wiederholung und Abschluss-Historie. Die Sitzung ergänzt
das normale Queue-Routing um explizite Affinitäts- und Zulassungsregeln.

Sitzungs-API, Lease-Lebenszyklus, Routing, Fehlerbehandlung, Verhalten beim
Herunterfahren und Betreiberdiagnosen beschreibt
[Worker-Sitzungen](/docs/features/worker-sessions).

## Sticky Execution {#sticky-execution}

Sticky Execution optimiert das Replay von Workflow-Aufgaben. Ein Worker kann
nach Abschluss einer Workflow-Aufgabe einen warmen prozesslokalen Replay-Cache
behalten. Die Aufgabenzuordnung kann diesen Worker für die nächste
Workflow-Aufgabe desselben Laufs bevorzugen.

Sticky Execution macht Workflow-Fortschritt nicht prozesslokal. Nach
Cache-Fehltreffern, Worker-Neustart, Leerlaufen, Rollout oder Verdrängung fällt
die Korrektheit immer auf gewöhnliches kaltes Replay aus dauerhafter Historie
zurück. Workflow-Code darf sich nicht auf Speicherzustand außerhalb der
Historie verlassen.

Cache-Lebenszyklus, Routing-Identität, Fallback-Regeln, Bereitstellungsoptionen
und Metriken beschreibt [Sticky Execution](/docs/features/sticky-execution).

## Das richtige Primitiv wählen {#choosing-the-right-primitive}

Verwenden Sie Workflow-Code direkt für deterministische Verzweigungen und
Berechnungen.

Verwenden Sie [`sideEffect(...)`](/docs/features/side-effects) für einen
Replay-sicheren Snapshot eines nichtdeterministischen Werts, der keine
Aktivitätswiederholungen, Timeouts, Heartbeats oder Abbruchsemantik benötigt.

Verwenden Sie [lokale Aktivitäten](/docs/features/local-activities) für kurze,
wiederholbare Seiteneffekte im selben Prozess, die als Aktivitätsversuche
sichtbar sein sollen, aber nicht an der normalen Aufgabenzuordnung teilnehmen
sollen.

Verwenden Sie gewöhnliche [Aktivitäten](/docs/defining-workflows/activities) für
entfernte Aufrufe, langsame Ein-/Ausgabe, rechenintensive Arbeit,
Queue-Rückstau, dedizierte Worker-Flotten oder Arbeit, die über eine separat
geleaste Aktivitätsaufgabe fortgesetzt werden soll.

Verwenden Sie [Worker-Sitzungen](/docs/features/worker-sessions), wenn mehrere
gewöhnliche Aktivitätsschritte explizite Worker-lokale Affinität benötigen.
