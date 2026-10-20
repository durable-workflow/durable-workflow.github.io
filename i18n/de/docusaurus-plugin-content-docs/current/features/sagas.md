---
sidebar_position: 11
title: Sagas
description: Aktivitäten eingebetteter Laravel-Workflows mit umgekehrter Reihenfolge, paralleler Ausführung und Anwendungsfristen kompensieren.
---

# Sagas {#sagas}

Dieser Leitfaden behandelt Kompensation in eingebetteten Laravel-Workflows mit `Workflow\V2\Workflow`. Für Worker im Dienstmodus verwenden Sie den [PHP-SDK-Leitfaden](https://php.durable-workflow.com/build/workflows-activities/), den [Python-SDK-Leitfaden](https://python.durable-workflow.com/sdk-reference/#saga-compensation) oder die [Rust-SDK-Referenz](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html).

Sagas sind ein etabliertes Entwurfsmuster für komplexe, lang laufende Vorgänge:

- Eine Saga verwaltet verteilte Transaktionen durch eine Folge lokaler Transaktionen.
- Eine lokale Transaktion ist eine Arbeitseinheit eines Saga-Teilnehmers, also einer Aktivität.
- Jeder Saga-Vorgang kann durch eine kompensierende Aktivität rückgängig gemacht werden.
- Workflow-Code entscheidet, wann Kompensation ausgeführt wird. Sie kann fehlschlagen und benötigt Zeit sowie funktionierende Worker.

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('booking-saga')]
class BookingSagaWorkflow extends Workflow
{
    public function handle(): array
    {
        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));

            return compact('flightId', 'hotelId', 'carId');
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

Wenn der Workflow eine Ausnahme abfängt, führt `$this->compensate()` alle registrierten Kompensationen in **umgekehrter Reihenfolge** aus. Schlägt im Beispiel `BookRentalCarActivity` fehl, storniert die Engine zuerst das Hotel und danach den Flug. Die Saga wird vom letzten Schritt aus zurückgenommen.

Registrieren Sie jede Kompensation nach erfolgreichem Abschluss der vorwärts gerichteten Aktivität. Replay rekonstruiert diese Reihenfolge und verwendet gespeicherte Aktivitätsergebnisse einschließlich abgeschlossener Kompensationen.

## Kompensation bei einer Anwendungsfrist {#deadline-driven-compensation}

Ein von der Engine durchgesetztes [Workflow-Zeitlimit](./timeouts.md#timeout-outcome-and-cleanup) schließt den Lauf, bevor Workflow-Code Kompensation ausführen kann. Ein `catch`- oder `finally`-Block ändert dies nicht. Auch die unmittelbaren Befehle `cancel()` und `terminate()` bieten kein Aufräumfenster.

Verwenden Sie eine frühere Anwendungsfrist, wenn bei Ablauf bereits erledigte Arbeit zurückgenommen werden soll. Dieser eingebettete Workflow reserviert eine Ressource und wartet danach höchstens 30 Sekunden auf ein Bestätigungssignal. Bei Ablauf wird Workflow-Code fortgesetzt, der die Reservierung vor Rückgabe des fachlichen Ergebnisses `expired` freigibt:

```php
use function Workflow\V2\{activity, await};
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;

#[Type('reservation-deadline')]
#[Signal('confirm')]
final class ReservationDeadlineWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $reservationId = activity(
            ReserveResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $orderId,
        );
        $this->addCompensation(fn () => activity(
            ReleaseResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $reservationId,
        ));

        if (await('confirm', timeout: 30) === null) {
            $this->compensate();

            return ['status' => 'expired'];
        }

        return ['status' => 'confirmed'];
    }
}
```

`ReserveResourceActivity` und `ReleaseResourceActivity` sind Aktivitäten Ihrer Anwendung. Beide müssen mit einem stabilen fachlichen Reservierungsschlüssel idempotent sein. Das Warten beginnt nach erfolgreicher Reservierung. Senden Sie `confirm` ohne Argumente, damit das erfolgreiche Ergebnis `true` ist; `null` bedeutet, dass die Wartefrist abgelaufen ist.

Starten Sie ihn mit einer längeren Engine-Frist als letzter Grenze:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ReservationDeadlineWorkflow::class, 'order-123');
$workflow->start(
    'order-123',
    StartOptions::rejectDuplicate()->withRunTimeout(300),
);

// From an authenticated application action, before the wait expires:
WorkflowStub::load('order-123')->signal('confirm');
```

Eine abgelaufene Wartefrist mit erfolgreicher Kompensation schließt normal mit `status: expired` in der Ausgabe ab. Der Lauf wurde nicht durch das Engine-Zeitlimit beendet. Schlägt die Freigabeaktivität fehl, gibt `compensate()` diesen Fehler weiter. Kommt die Engine-Frist zuerst, wird der Lauf geschlossen und verbleibende Kompensation kann nicht mehr ausgeführt werden. Planen Sie ausreichend Zeit für Zustellung und Wiederholungen ein und berücksichtigen Sie eine gegebenenfalls frühere Gesamtausführungsfrist.

Der gesonderte kooperative Vorgang `requestCancellation()` ermöglicht vom Aufrufer gewünschtes Aufräumen während eines aktiven Laufs. Verwenden Sie seinen begrenzten Abbruchschutz für dauerhafte Aufräumarbeit unter einer Abbruchanfrage. Eine Workflow-Zeitüberschreitung löst ihn nicht automatisch aus. Siehe [Kooperativer Abbruch](../polyglot/cancellation.md).

## Reihenfolge der Kompensationen {#compensation-ordering}

Standardmäßig werden Kompensationen **nacheinander in umgekehrter Registrierungsreihenfolge** ausgeführt. Dies ist die sicherste Voreinstellung, da spätere Schritte von früheren abhängen können.

Standardmäßig stoppt `compensate()` beim ersten Kompensationsfehler und gibt ihn an den Aufrufer weiter.

## Parallele Kompensation {#parallel-compensation}

Verwenden Sie `setParallelCompensation(true)` für parallele Kompensation. Jede Kompensations-Closure sollte dann einen gestarteten, aber noch nicht abgewarteten Aktivitätsaufruf zurückgeben, damit die Engine die Aufrufe gleichzeitig ausführen kann:

```php
use function Workflow\V2\activity;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('parallel-saga')]
class ParallelSagaWorkflow extends Workflow
{
    public function handle(): void
    {
        $this->setParallelCompensation(true);

        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

Bei paralleler Kompensation geben die Closures Aktivitätsaufrufe zurück, die die Engine sammelt und über `all()` ausführt.

## Trotz Fehler fortfahren {#continue-with-error}

Wirft eine Kompensationsaktivität eine Ausnahme, werden standardmäßig die übrigen Kompensationen übersprungen und der Fehler weitergegeben. Mit `setContinueWithError(true)` führen Sie alle Kompensationen trotz einzelner Fehler aus:

```php
$this->setContinueWithError(true);
```

Bei aktivierter Option fängt und verwirft die Engine Ausnahmen jeder Kompensations-Closure und fährt mit der nächsten fort. Dies eignet sich für unabhängige Kompensationen, wenn trotz einzelner Fehler möglichst weit aufgeräumt werden soll.

### Beide Optionen kombinieren {#combining-both-flags}

`setParallelCompensation(true)` und `setContinueWithError(true)` sind kombinierbar. Dann laufen alle Kompensationen gleichzeitig über `all()`. Geworfene Fehler werden abgefangen, damit die übrigen Kompensationen abschließen können. Ohne `setContinueWithError(true)` wird ein paralleler Kompensationsfehler sofort weitergegeben und der Workflow schlägt fehl.

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## Funktionsweise {#how-it-works}

- `addCompensation()` registriert eine bei `compensate()` aufzurufende Funktion
- `compensate()` durchläuft registrierte Kompensationen in umgekehrter Reihenfolge
- Jede Kompensations-Closure ist ein normaler V2-Workflow-Schritt. Ihre Aktivitätsaufrufe erzeugen wie andere Aktivitäten dauerhafte Historienereignisse
- Kompensationsaktivitäten sind in Waterlines Zeitleiste und im Historienexport sichtbar
- Bei erfolgreichem Workflow werden die Closures nie aufgerufen und erzeugen keine Historie

## Dieses Muster ausführen {#run-this-pattern}

Die signalgesteuerte Reisebüro-Saga in der [Beispielanwendung](/docs/sample-app) ist die ausführbare Referenz dieser Seite. Klonen Sie die Anwendung, setzen Sie `OPENAI_API_KEY` und führen Sie Folgendes aus:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` registriert Kompensationen für alle Buchungsaktivitäten. Schlägt ein Flug nach einer erfolgreichen Hotelbuchung fehl, wird das Hotel über die Kompensationsliste storniert. Dies ist dasselbe hier beschriebene Muster; seine Ereignisse sind in der Waterline-Zeitleiste sichtbar.
