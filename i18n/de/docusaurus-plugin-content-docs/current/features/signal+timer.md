---
sidebar_position: 5
---

# Signal + Timer {#signal--timer}

`Workflow\V2` unterstützt sowohl
`await($condition, timeout: $seconds, conditionKey: $key)` für Bedingungswarten
mit Timeout als auch `await('signal-name', timeout: $seconds)` für Warten auf
benannte Signale mit Timeout.

Verwenden Sie dies, wenn der Workflow fortfahren soll, sobald ein dauerhafter
erneut abgespielter Zustand wahr wird, aber auch nach einer Frist weiterlaufen
soll, falls dieser Zustand sich nie ändert.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\minutes;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = await(fn () => $this->ready, timeout: minutes(5), conditionKey: 'approval.ready');

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

`await()` mit einem Parameter `timeout:` funktioniert wie folgt:

- Das Prädikat darf nur von erneut abgespielten dauerhaften Eingaben abhängen: Aktivitätsergebnissen, Update-Änderungen und Ergebnissen untergeordneter Workflows. Nicht dauerhafter Zustand weckt die Warteoperation nicht.
- Der optionale Bedingungsschlüssel ist eine stabile Betreiberkennung für die Warteoperation. Replay prüft ihn gegen frühere Historie, damit eine erneute Bereitstellung denselben Workflow-Schritt nicht still für ein anderes Prädikat verwenden kann.
- Wird das Prädikat vor dem Timer wahr, gibt `await()` `true` zurück.
- Gewinnt die Frist zuerst, gibt `await()` `false` zurück.

Timer-Kurzformen stehen für lesbare Timeout-Werte bereit: `seconds()`,
`minutes()`, `hours()`, `days()`, `weeks()`, `months()`, `years()`.

Rufen Sie das deklarierte Update auf, um das Prädikat aus Anwendungscode
dauerhaft zu ändern:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

Der Rückgabewert ist `true`, wenn die Bedingung vor Auslösen der Timeout-Aufgabe
wahr wird, und `false`, wenn der Timeout gewinnt.

Bei benannten Signalen gibt `await('name', timeout: minutes(5))` bei Eintreffen
des Signals dessen Payload zurück und bei gewonnenem Timeout `null`.
`null` ist für den Timeout reserviert: Signale ohne Argumente ergeben `true`,
ein Argument ergibt diesen Wert und mehrere Argumente ergeben ein Array.
`Workflow\V2` verwendet keine älteren `#[SignalMethod]`-Mutatormethoden, um
Workflow-Zustand umzuschalten.

## Helfer `awaitWithTimeout()` {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` ist
eine Kurzform für
`await($condition, timeout: $timeout, conditionKey: $conditionKey)`.
Die Argumentreihenfolge stellt die Frist voran, um die Timeout-Absicht am Aufruf
deutlich zu machen.

```php
use function Workflow\V2\{await, minutes};
use Workflow\V2\Workflow;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = Workflow::awaitWithTimeout(
            minutes(5),
            fn () => $this->ready,
            'approval.ready',
        );

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

Die Rückgabesemantik entspricht `await()` mit `timeout:`: Bei aufrufbaren
Prädikaten liefert der Aufruf `true`, wenn die Bedingung gewinnt, und `false`,
wenn die Frist gewinnt. Bei benannten Signalen liefert er bei gewonnenem
Signal dessen Payload und bei gewonnener Frist `null`.

`awaitWithTimeout()` liest sich als „höchstens so lange auf eine Bedingung
warten“ statt „auf eine Bedingung mit Timeout-Option warten“. Verwenden Sie die
am Aufruf verständlichere Schreibweise. Die Laufzeit behandelt beide identisch
und zeichnet dieselbe Workflow-Historie auf.
