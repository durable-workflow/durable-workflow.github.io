---
sidebar_position: 2
title: Aktivitäten
description: Definieren Sie Aktivitätsklassen für nichtdeterministische Seiteneffekte, Wiederholungen, Routing und Optionen pro Aufruf.
tags:
  - authoring
  - activities
  - retries
keywords:
  - Aktivitätsklasse für Durable Workflow
  - Aktivitätsoptionen
  - nichtdeterministische Seiteneffekte
---

# Aktivitäten {#activities}

Eine Aktivität ist eine Arbeitseinheit, die eine bestimmte Aufgabe oder
Operation ausführt, etwa eine API-Anfrage, Datenverarbeitung oder den Versand
einer E-Mail. Sie kann von einem Workflow ausgeführt werden.

:::note Vertrag für dauerhafte Ausführung
Gewöhnliche v2-Aktivitäten laufen als dauerhafte Aufgaben in einer Queue.
Lokale Aktivitäten sind ein explizites Primitiv für kurze Aktivitätsarbeit im
selben Prozess, das weiterhin dauerhafte Aktivitätshistorie aufzeichnet.
Worker-Sitzungen stehen bereit, wenn mehrere dauerhafte Aktivitätsschritte eine
gemeinsame Worker-Lease benötigen. Sticky Execution ist eine unterstützte
Replay-Optimierung, kein Korrektheitsvertrag. Die genauen Verträge beschreiben
[Ausführungsmodell für Aktivitäten](/docs/features/activity-execution-model),
[Lokale Aktivitäten](/docs/features/local-activities),
[Worker-Sitzungen](/docs/features/worker-sessions) und
[Sticky Execution](/docs/features/sticky-execution).
:::

Mit dem Artisan-Befehl `make:activity` können Sie eine neue Aktivität erstellen:

```php
php artisan make:activity MyActivity --v2
```

Sie wird durch Erweitern der Klasse `Activity` und Implementieren der Methode
`handle()` definiert.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## Ausführungsvertrag {#execution-contract}

Jeder Aufruf von `activity(...)` zeichnet einen Aktivitätsbefehl in der
Workflow-Historie auf und erstellt eine dauerhafte Queue-Aufgabe, die ein Worker
übernehmen kann. Gewöhnliche Aktivitäten können von jedem kompatiblen Worker
übernommen werden. [Worker-Sitzungen](/docs/features/worker-sessions) können
eine Folge von Aktivitätsversuchen an eine gemeinsame Worker-Sitzungs-Lease
binden, wenn der Workflow diesen Vertrag ausdrücklich auswählt.

Wenn Sie einen Replay-sicheren Wert ohne Einplanen von Queue-Arbeit benötigen,
verwenden Sie stattdessen [`sideEffect(...)`](/docs/features/side-effects).
Für eine kurze, wiederholbare Aktivität im selben Prozess mit Timeout-,
Heartbeat- und Aktivitätshistorie-Semantik verwenden Sie
[lokale Aktivitäten](/docs/features/local-activities). Das vollständige
Platzierungsmodell beschreibt
[Ausführungsmodell für Aktivitäten](/docs/features/activity-execution-model).
Das Verhalten des Sticky-Replay-Caches beschreibt
[Sticky Execution](/docs/features/sticky-execution).

## Idempotenz und dauerhafte Identität {#idempotency-and-durable-identity}

Aktivitäten werden mindestens einmal ausgeführt. Wiederholungen, abgelaufene
Leases und erneute Zustellungen können dazu führen, dass dieselbe logische
Aktivität mehrfach beobachtet wird. Der Seiteneffekt oder das entfernte Ziel
muss daher sicher wiederholbar sein.

Verwenden Sie innerhalb der Aktivität die dauerhaften Kennungen der Laufzeit,
wenn Sie Korrelation oder entfernte Deduplizierung benötigen:

- `activityId()` identifiziert eine logische Aktivitätsausführung über alle Wiederholungen hinweg und ist der Standard-Idempotenzschlüssel für entfernte Systeme.
- `attemptId()` identifiziert einen konkreten Versuch dieser Ausführung.
- `attemptCount()` gibt an, welcher Versuch gerade läuft.

Bevorzugen Sie `activityId()`, wenn das entfernte System Wiederholungen als
dieselbe logische Anfrage behandeln soll. Verwenden Sie `attemptId()` nur,
wenn das entfernte System tatsächlich einzelne Versuche unterscheiden muss.
Wenn ein Worker entfernte Arbeit abschließt, seine Lease verliert und sich
verspätet meldet, kann die Engine diese späte Abschlussmeldung ablehnen, weil
ein anderer Worker das dauerhafte Rennen bereits gewonnen hat. Der entfernte
Seiteneffekt kann trotzdem bereits eingetreten sein.

Das Betriebsmodell hinter diesen Kennungen beschreiben
[Ausführungsgarantien und Idempotenz](/docs/constraints/execution-guarantees),
[Heartbeats](/docs/features/heartbeats) und
[Fehler und Wiederherstellung](/docs/failures-and-recovery).

## Überschreibungen pro Aufruf {#per-call-overrides}

Routing und Wiederholungen verwenden standardmäßig `$connection`, `$queue`,
`$tries` und `backoff()` der Aktivitätsklasse. Wenn ein einzelner Aufruf dies
überschreiben muss, etwa für eine Queue mit höherer Priorität oder mehr
Wiederholungsversuche, übergeben Sie eine Instanz von `ActivityOptions`:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

Die vollständige Feldliste einschließlich Timeouts und Heartbeats finden Sie
unter [Aktivitätsoptionen](/docs/configuration/options#activityoptions).

## Lokale Aktivitätsaufrufe {#local-activity-calls}

Verwenden Sie `localActivity(...)`, wenn ein kurzer idempotenter Seiteneffekt im
aktuellen Workflow-Worker-Prozess laufen soll, aber weiterhin
Aktivitätswiederholungen, Timeouts, Heartbeats, Abbruch und Historiensemantik
benötigt:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

Lokale Aktivitäten lehnen `connection`, `queue`, Worker-Sitzungs-Routing und
Schedule-to-start-Optionen ab, weil sie keine gewöhnlichen Aktivitätsaufgaben
erstellen. Den vollständigen Vertrag beschreibt
[Lokale Aktivitäten](/docs/features/local-activities).
