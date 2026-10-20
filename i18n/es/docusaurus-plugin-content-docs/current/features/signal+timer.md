---
sidebar_position: 5
---

# Señal + temporizador {#signal--timer}

`Workflow\V2` admite `await($condition, timeout: $seconds, conditionKey: $key)` para esperas por condición con plazo y `await('signal-name', timeout: $seconds)` para esperas de señales con nombre y plazo.

Úsalo cuando el workflow deba continuar en cuanto un estado duradero reproducido se vuelva verdadero, pero también deba desbloquearse tras un plazo si ese estado nunca cambia.

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

`await()` con un parámetro `timeout:` funciona así:

- El predicado solo debe depender de entradas duraderas reproducidas (resultados de actividades, mutaciones de actualizaciones y resultados de hijos). El estado no duradero no despierta la espera.
- La clave opcional de condición es una etiqueta estable para el operador. La reproducción la valida frente al historial previo para que otro despliegue no reutilice silenciosamente el mismo paso con otro predicado.
- Si el predicado se cumple antes de dispararse el temporizador, `await()` devuelve `true`.
- Si vence primero el plazo, devuelve `false`.

Hay funciones auxiliares para expresar tiempos de espera legibles: `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()` y `years()`.

Para cambiar el predicado de forma duradera desde la aplicación, llama a la actualización declarada:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

Devuelve `true` si se cumple la condición antes de dispararse la tarea de vencimiento y `false` si vence primero el plazo.

Para señales con nombre, `await('name', timeout: minutes(5))` devuelve la carga de la señal al llegar y `null` si vence el plazo. `null` se reserva para el vencimiento: una señal sin argumentos produce `true`, con un argumento produce ese valor y con varios produce un array. `Workflow\V2` no usa los métodos mutadores heredados `#[SignalMethod]` para cambiar el estado.

## Función auxiliar `awaitWithTimeout()` {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` abrevia `await($condition, timeout: $timeout, conditionKey: $conditionKey)`. Coloca el plazo primero para que su intención sea visible en la llamada.

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

El retorno es el mismo que en `await()` con `timeout:`: `true` si gana la condición, `false` si gana el plazo para un predicado callable, la carga si gana una señal con nombre y `null` si vence el plazo de esa señal.

`awaitWithTimeout()` se lee como «esperar como máximo este tiempo por una condición», frente a «esperar una condición con una opción de tiempo de espera». Elige la forma más clara en cada llamada: el runtime las trata igual y registran el mismo historial.
