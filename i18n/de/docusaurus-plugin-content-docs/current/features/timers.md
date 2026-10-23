---
sidebar_position: 4
title: Timer
description: Verwenden Sie dauerhafte Timer und deterministische Workflow-Zeit ohne Abhängigkeit vom Echtzeit-Prozesszustand.
tags:
  - timers
  - deterministic-time
  - waits
keywords:
  - dauerhafte Timer
  - deterministische Zeit
  - Workflow now
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Timer {#timers}

Das Framework kann die Ausführung eines Workflows unterbrechen und später
fortsetzen. Diese Timer sind dauerhaft: Sie überstehen Neustarts und Fehler
und bleiben mit der Workflow-Replay-Semantik konsistent. Das ist für
Verzögerungen, Wiederholungslogik oder Timeouts nützlich.

Rufen Sie innerhalb Ihres Workflows `timer($duration)` auf:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        timer(30);

        return 'The workflow waited 30 seconds.';
    }
}
```

<TimerSimulator />

## Auflösung der Verzögerung {#delay-resolution}

Dauerhafte Timer-Verzögerungen werden in ganzen Sekunden angegeben. Übergeben Sie
ganze Sekunden, etwa `timer(1)`. Bei einem PHP-Intervallstring oder `CarbonInterval`
wird eine positive Dauer mit Sekundenbruchteilen auf die nächste volle Sekunde
aufgerundet. Aus 100 ms wird daher eine Sekunde. `timer(0)` wird weiterhin inline ausgelöst.

Ein fälliger Timer darf ausgeführt werden. Queue-Latenz und Worker-Auslastung können
die Verarbeitung verzögern. Die Auflösung garantiert daher keinen exakten Aufwachzeitpunkt
und verringert nicht die Genauigkeit gespeicherter Zeitstempel. Unter
[Tests](../testing.md#keeping-delay-tests-fast) finden Sie Beispiele ohne reale Wartezeiten.

Timer-Verhalten:

- Jeder `timer()`-Aufruf erstellt eine dauerhafte Timer-Zeile und typisierte Historienereignisse `TimerScheduled`, `TimerFired` und bei Ablösung `TimerCancelled`.
- Verzögerte Timer durchlaufen eine eigene Timer-Aufgabe, bevor die Workflow-Aufgabe fortgesetzt wird.
- `timer(0)` löst direkt während der Workflow-Aufgabe aus und erstellt keine Timer-Aufgabe.
- Replay- und Abfragepfade behandeln typisierte Historie `TimerScheduled`, `TimerFired` und `TimerCancelled` als maßgeblich für den Timer-Lebenszyklus. Reine Timer bleiben daher bis zum festgeschriebenen Auslöseereignis blockiert. Die Laufdetailansicht kann offene, ausgelöste oder abgebrochene Timer-Warteoperationen aus Historie rekonstruieren.
- Waterline zeigt Timer-Warteoperationen in Laufdetails und Dashboard-Payloads.
- Die Engine-Befehle `cancel()` und `terminate()` lösen offene Timer-Warteoperationen dauerhaft ab. Späte Timer-Jobs bleiben wirkungslos, statt den Lauf erneut zu öffnen.

Timer beliebiger Dauer funktionieren mit jedem Laravel-Queue-Treiber,
einschließlich Amazon SQS. Die Engine teilt lange Verzögerungen transparent
entsprechend der Nachrichtengrenze des Treibers auf.

`sideEffect()` steht für Replay-sichere Snapshots wie Zufall oder einmalige
Verzweigungseingaben bereit.

## Deterministische Zeit lesen {#reading-deterministic-time}

Verwenden Sie im Workflow-Rumpf `Workflow::now()` (oder `Workflow\V2\now()`)
statt Laravels Helfer `now()` oder `Carbon::now()`, wenn Sie die aktuelle Zeit
benötigen:

```php
use function Workflow\V2\activity;
use function Workflow\V2\now;
use Workflow\V2\Workflow;

class DurationAwareWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $startedAt = Workflow::now();
        $greeting = activity(GreetingActivity::class, $name);
        $finishedAt = Workflow::now();

        return [
            'greeting' => $greeting,
            'took_ms' => $finishedAt->getTimestampMs() - $startedAt->getTimestampMs(),
        ];
    }
}
```

`Workflow::now()` schreitet beim Replay von Historienereignissen durch den
Executor fort. Es liefert `recorded_at` des letzten verbrauchten
Aktivitätsabschlusses, Timer-Auslösens, Signalempfangs, der Bedingungsauflösung
oder des Abschlusses eines untergeordneten Workflows. Vor dem ersten
verbrauchten Ereignis liefert es `started_at` des Laufs. Außerhalb einer
Workflow-Fiber, etwa in einer Aktivität oder einer Abfragemethode, die an einen
Nicht-Workflow-Helfer delegiert, fällt es auf die Echtzeit `now()` zurück.

Mit `Workflow::now()` bleibt Ihr Workflow deterministisch: Zwei Replays
derselben Historie erzeugen dieselben Zeitwerte, selbst wenn dazwischen reale
Zeit vergangen ist.
