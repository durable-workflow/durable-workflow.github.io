---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Nebenläufigkeit {#concurrency}

Diese Anleitung behandelt Nebenläufigkeit in eingebetteten Laravel-Workflows
mit `Workflow\V2\Workflow`. Für Worker im Service-Modus verwenden Sie die
[PHP-SDK-Anleitung](https://php.durable-workflow.com/build/workflows-activities/),
[Python-SDK-Anleitung](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups)
oder [Rust-SDK-Referenz](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel).

`all([...])` beschreibt die gesamte dauerhafte Gruppe vor der Unterbrechung.
Die eingebettete Laufzeit plant deren Aktivitäts- und Kindworkflow-Befehle ein
und gibt Ergebnisse in der ursprünglichen verschachtelten Eingabeform zurück.

Verwenden Sie eine Auswahlgruppe, wenn der Fortschritt vom zuerst
abgeschlossenen Mitglied statt von der gesamten Barriere abhängt. Auch die
Auswahl ist dauerhaft: Sie startet jedes Mitglied, zeichnet einen Gewinner auf
und lässt alle übrigen Mitglieder weiterlaufen, bis Workflow-Code darauf
wartet oder sie explizit abbricht.

## Seriell {#series}

Dieses Beispiel führt 3 Aktivitäten nacheinander aus und wartet jeweils auf
den Abschluss, bevor die nächste beginnt.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Simulator für serielle Ausführung"
/>

## Parallel {#parallel}

Dieses Beispiel führt 3 Aktivitäten parallel aus, wartet auf den Abschluss
aller Aktivitäten und sammelt deren Ergebnisse.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulator für parallele Ausführung"
/>

Der wesentliche Unterschied zwischen serieller und paralleler Ausführung ist
der Ort der Unterbrechung. Im seriellen Beispiel unterbricht und setzt jeder
`activity()`-Aufruf den Workflow direkt fort. Im parallelen Beispiel beschreiben
die Closures zuerst die gesamte Barriere. `all()` unterbricht dann einmal für
die ganze Gruppe, sodass jedes Mitglied parallel laufen kann, bevor der
Workflow fortgesetzt wird.

## Auswahl des ersten Abschlusses {#first-completion-selection}

`select([...])` startet unabhängige Aktivitäten, untergeordnete Workflows,
Timer, Signalwarteoperationen, Bedingungswarteoperationen oder verschachtelte
gewöhnliche Barrieren. Es setzt fort, wenn ein Mitglied ein zulässiges Ergebnis
oder einen typisierten Fehler festschreibt. Geben Sie Mitgliedern stabile
Anwendungsschlüssel, wenn späterer Code sie unterscheiden oder erneut auf sie
zugreifen muss. Mitgliedsschlüssel müssen nicht leere Zeichenfolgen oder
nicht negative Ganzzahlen sein.

Der folgende Koordinator startet seine Frist im selben dauerhaften Schritt wie
den Resolver. Eingabeverarbeitung und Resolver-Fortschritt können diese Frist
nicht zurücksetzen oder verschieben:

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

Das Ergebnis enthält stabilen Mitgliedsschlüssel und Index, Operationsart und
dauerhafte Identität, Ergebnis oder typisierten Fehler, die Gewinnerreferenz
und eine Referenz für jedes Mitglied. Auf eine Nichtgewinnerreferenz kann
später mit `await()` gewartet werden; `cancel()` fordert ihren Abbruch an.
Die Auswahl verwirft oder bricht Geschwister niemals implizit ab. `cancel()`
ist eine Anfrage ohne Rückgabewert (void/unit) und meldet nie, ob der Abbruch
gewonnen hat. Die Historie `SelectionOperationCancelled` ist für das Ergebnis
maßgeblich. Wird der Abschluss zuerst festgeschrieben, schreibt die Laufzeit
keinen Abbruchmarker. Replay geht erst dann über den Abbruchaufruf hinaus,
wenn eine festgeschriebene Workflow-Aufgabengrenze, ein Folgebefehl oder ein
endgültiges Workflow-Ereignis beweist, dass die wirkungslose Operation
festgeschrieben wurde. Abfrage-Replay stoppt bei einem laufenden Abbruch,
statt spekulativen Zustand danach zu zeigen. Warten auf die Referenz nach der
festgeschriebenen wirkungslosen Operation liefert den früheren Abschluss.

Die Laufzeit zeichnet die erste zulässige Auflösung unter der Commit-Sperre
des Elternlaufs auf. Kaltstart, erneutes Laden gespeicherter Historie,
Abfrage-Replay und spätere Verliererabschlüsse verwenden deshalb den
aufgezeichneten Gewinner wieder, statt lokale Sprach-Futures gegeneinander
laufen zu lassen oder Historienreihenfolge neu zu deuten. Exakt doppelte
Zustellung ist idempotent. Gleichzeitige Eingaben werden nach ihrer
festgeschriebenen dauerhaften Historie geordnet. Eine während einer Aktivität
eintreffende Eingabe wird in der nächsten Workflow-Aufgabe sichtbar. Eine
späte oder doppelte Eingabe kann keinen bereits aufgezeichneten Gewinner
ersetzen.

## Verschachtelte Barrieren {#nested-barriers}

Verschachtelte `all([...])`-Gruppen lassen einen Workflow-Schritt einen Baum
dauerhafter Auffächerungs- und Zusammenführungsarbeit ausdrücken. Die Laufzeit
plant jede Aktivität oder jeden untergeordneten Workflow als dauerhafte
Blattsequenz ein, zeichnet den vollständigen `parallel_group_path` des Blatts
auf und wartet, bis jede einschließende Barriere Fortschritt machen kann.
Dann rekonstruiert sie vor der Fortsetzung des Workflow-Rumpfs die
ursprüngliche verschachtelte Ergebnisform. Beim Replay muss ein Aktivitäts-
oder Kindblatt eines `all([...])`-Schritts weiterhin zum aufgezeichneten
Gruppenpfad passen. Typisierte Blatthistorie ohne Gruppenmetadaten wird als
inkompatible ältere Vorschauhistorie behandelt, statt ihre Einordnung in die
aktuelle Barriere zu erraten.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

In diesem Beispiel zeigt Waterline drei offene Blattwarteoperationen und keine
synthetische „verschachtelte“ Warteoperation. Das erste Blatt gehört nur zur
äußeren Barriere. Das zweite und dritte zeigen einen `parallel_group_path` mit
zwei Einträgen, damit Betreiber sowohl die äußere Gruppe als auch die noch
offene innere Untergruppe sehen.

Die Größe der äußeren Gruppe zählt dauerhafte Blätter, keine verschachtelten
Arrays. Jedes verschachtelte Blatt trägt einen `parallel_group_path` von außen
nach innen. Jeder Pfadeintrag erhält dieselbe dauerhafte Workflow-Position.
Die Gruppe plant alle Blätter vor der Unterbrechung ein und setzt erfolgreiche
Werte danach anhand ihrer Eingabeposition zusammen. Worker-Neustart und Replay
abgeschlossener Historie rekonstruieren dieselbe Gruppenidentität. Exakt
doppelte Abschlusszustellungen werden ignoriert. Ein später Geschwisterabschluss
kann Teildiagnosen ergänzen, ohne das bereits nach der deterministischen
Richtlinie der eingebetteten Laufzeit ausgewählte fehlgeschlagene Mitglied zu
ändern.

Die eingebettete Laufzeit löst den typisierten Blattfehler aus `all()` aus und
erhält die dauerhaften Gruppenmetadaten der Barriere in Historie und
Betreiberansichten.

## Asynchroner Callback {#async-callback}

`async(...)` führt einen serialisierbaren Callback als dauerhaften
untergeordneten Workflow mit dem Systemtyp `durable-workflow.async` aus.
Asynchrone Callbacks verwenden denselben ausschließlich geradlinigen
Helfervertrag wie benannte v2-Workflows. Daher unterbrechen `activity()`,
`await()`, `timer()`, `sideEffect()` und die anderen Einzelschritthelfer direkt
im Callback-Rumpf, ohne `yield` zu verlangen.

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

Der Elternlauf sieht den Callback als Kindwarteoperation. Befehlshistorie,
Abstammung und Waterline-Details verwenden deshalb dieselbe `child_call_id`,
Kindlauf-ID und Kind-Ergebnishistorie wie ein expliziter `child(...)`-Aufruf.
Der Callback wird mit Laravels Unterstützung für serialisierbare Closures
serialisiert. Halten Sie ihn deshalb anwendungs- und bereitstellungslokal.
Verwenden Sie einen benannten Aufruf `child(SomeWorkflow::class, ...)`, wenn die
Arbeit einen stabilen öffentlichen Workflow-Typ für dienstübergreifendes
Routing oder langfristige Codeentwicklung benötigt. `async(...)`-Callbacks
sind in v2 ausschließlich geradlinig. Rufen Sie Helfer wie `activity()`,
`child()`, `await()`, `timer()` und `all([...])` direkt ohne `yield` auf.

## Gemischte Aktivitäts- und Kindbarrieren {#mixed-activity--child-barriers}

Derselbe `all()`-Helfer kann eine gemischte Gruppe aus Aktivitäten und
untergeordneten Workflows zusammenführen. Ergebnisse kommen weiterhin in der
ursprünglichen Array-Reihenfolge zurück. Erfolgreiche Mitglieder warten auf
den Rest der Gruppe. Das erste fehlgeschlagene Mitglied weckt den Elternlauf
weiterhin sofort auf.

Sind beim Replay des Elternlaufs bereits mehrere Barrierenmitglieder
erfolglos geschlossen, erhält er den Fehler mit der frühesten aufgezeichneten
Abschlusszeit. Haben zwei Fehler dieselbe Zeit, gewinnt der niedrigere
Barrierenblattindex. Workflow-Fortsetzung und Abfrage-Replay wählen dadurch
dieselbe Ausnahme. Spätere Geschwisterfehler ersetzen die bereits in den
Elternschritt geworfene Ausnahme nicht.

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## Aktuelle Grenzen {#current-limits}

Die aktuelle Nebenläufigkeitsoberfläche enthält noch nicht:

- eingebaute Helfer für begrenzte Nebenläufigkeit über explizite verschachtelte `all([...])`-Gruppen hinaus.

## Untergeordnete Workflows parallel ausführen {#child-workflows-in-parallel}

Untergeordnete Workflows können auch in einer eigenen `all([...])`-Barriere
laufen. Dies funktioniert wie parallele Aktivitätsausführung, aber für
untergeordnete Workflows: Der Elternworkflow fächert mehrere Kindläufe
dauerhaft auf und setzt erst fort, wenn die gesamte Kindbarriere Fortschritt
machen kann.

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulator für parallele untergeordnete Workflows"
/>

So können Sie hierarchische Parallelität in Workflows einbauen, einschließlich
verschachtelter reiner Kindgruppen oder gemischter Kind-/Aktivitätsgruppen,
wenn ein Elternschritt mehr als eine Zusammenführungsebene benötigt.
