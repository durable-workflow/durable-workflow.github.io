---
sidebar_position: 7
---

# Seiteneffekte {#side-effects}

Ein Seiteneffekt ist eine Closure mit nichtdeterministischem Code. Sie wird nur
einmal ausgeführt und ihr Ergebnis wird gespeichert. Bei einer Wiederholung
des Workflows läuft sie nicht erneut, sondern gibt das gespeicherte Ergebnis
zurück. Das macht den Workflow deterministisch: Replay liefert immer denselben
gespeicherten Wert, statt den nichtdeterministischen Code erneut auszuführen.

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

Der Workflow ruft `random_int()` nur einmal auf und speichert das Ergebnis,
selbst wenn er später fehlschlägt und wiederholt wird.

## Wann Seiteneffekte geeignet sind {#when-to-use-side-effects}

Verwenden Sie `sideEffect()`, wenn Sie einen nichtdeterministischen Wert
benötigen, der:

- lokal ohne externe Ein-/Ausgabe berechnet wird (Zufallszahlen, UUIDs, Zeitstempel);
- nach der Aufzeichnung auch über Replays hinweg unverändert bleiben soll;
- keine Wiederholungssemantik benötigt: Die Closure läuft genau einmal.

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## Wann stattdessen eine Aktivität geeignet ist {#when-to-use-an-activity-instead}

Wenn Code fehlschlagen kann, einen externen Dienst anspricht oder Wiederholungs-
und Timeout-Semantik benötigt, verwenden Sie eine
[Aktivität](../defining-workflows/activities.md) statt eines Seiteneffekts:

| Szenario | Verwenden |
|---|---|
| Zufälliges Token erzeugen | `sideEffect()` |
| Konfigurationswert zum Entscheidungszeitpunkt lesen | `sideEffect()` |
| Externe API aufrufen | `activity()` |
| In eine Datenbank schreiben | `activity()` |
| E-Mail oder Benachrichtigung senden | `activity()` |
| Aufwendigen Wert berechnen, wobei eine Ausnahme möglich ist | `activity()` |

Die Faustregel: Kann die Closure eine Ausnahme auslösen, die Sie wiederholen
möchten, gehört sie in eine Aktivität.

## Funktionsweise {#how-it-works}

- Jeder `sideEffect()`-Aufruf fügt ein typisiertes Historienereignis `SideEffectRecorded` mit der Workflow-Schrittsequenz an.
- Workflow- und Abfrage-Replay verwenden diesen festgeschriebenen Wert wieder, statt die Closure erneut auszuführen.
- Waterline zeigt den Seiteneffekt-Snapshot als typisierten Historieneintrag in der Zeitleiste des ausgewählten Laufs.
- Seiteneffekte dienen weiterhin nur Replay-sicheren Snapshots, nicht Arbeit, die fehlschlagen oder Wiederholungssemantik benötigen kann.

## Problematische Muster {#anti-patterns}

**Rufen Sie innerhalb eines Seiteneffekts keine externen Dienste auf.** Schlägt
der Dienstaufruf fehl, wird der Seiteneffekt nicht wiederholt und der Workflow
schlägt dauerhaft fehl:

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**Platzieren Sie keine langsamen oder blockierenden Operationen in einem
Seiteneffekt.** Die Closure läuft im Thread der Workflow-Aufgabe. Langlebige
Arbeit verzögert die gesamte Workflow-Aufgabe:

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**Verlassen Sie sich nicht auf veränderlichen externen Zustand.** Die Closure
wird genau einmal ausgeführt. Wenn Sie einen zeitlich veränderlichen Wert
lesen, wird der Snapshot beim ersten Ausführen eingefroren, nicht beim Replay:

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

Dies ist beabsichtigt: Der Snapshot wird für den Determinismus bewusst
eingefroren. Wenn sich ein Wert während der Workflow-Lebensdauer aktualisieren
soll, verwenden Sie ein Signal oder eine Aktivität.

## Dieses Muster ausführen {#run-this-pattern}

Der Workflow für verstrichene Zeit in der [Beispielanwendung](/docs/sample-app)
ist die ausführbare Referenz für Uhrzeitabfragen hinter `sideEffect()`:

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` zeichnet Start- und Endzeitstempel
als Ganzzahlen in `sideEffect()`-Callbacks auf. Der aufgezeichnete Wert
übersteht so die Avro-Payload-Dekodierung beim Replay. Waterlines Laufdetails
zeigen zwei `MarkerRecorded`-Ereignisse vor und nach der Timer-Auslösung.
Dieses Markerpaar ist der gespeicherte Nachweis für deterministische
Uhrzeitabfragen.
