---
sidebar_position: 4
title: Temporizadores
description: Usa temporizadores duraderos y tiempo determinista del workflow sin depender del reloj real del proceso.
tags:
  - timers
  - deterministic-time
  - waits
keywords:
  - temporizadores duraderos
  - tiempo determinista
  - workflow now
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Temporizadores {#timers}

El framework permite suspender un workflow y reanudarlo más tarde. Los temporizadores son duraderos: sobreviven a reinicios y fallos y conservan la coherencia con la reproducción del workflow. Sirven para implementar demoras, reintentos y tiempos de espera.

Para usarlos, llama a `timer($duration)` dentro del workflow:

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

## Resolución de los retrasos {#delay-resolution}

Los retrasos de los temporizadores duraderos se expresan en segundos enteros.
Pase segundos enteros, como `timer(1)`. Al usar una cadena de intervalo de PHP
o `CarbonInterval`, una duración positiva con fracciones de segundo se redondea
hacia arriba al siguiente segundo entero. Por tanto, 100 ms se convierten en un
segundo. `timer(0)` sigue resolviéndose dentro de la tarea actual.

Que un temporizador venza permite procesarlo. La latencia de la cola y la carga
de los workers pueden retrasar su ejecución, por lo que esta resolución no
garantiza un instante exacto de reanudación ni reduce la precisión de las marcas
de tiempo almacenadas. Consulte las [pruebas](../testing.md#keeping-delay-tests-fast)
para evitar esperas reales.

Comportamiento de los temporizadores:

- cada llamada `timer()` crea una fila duradera y eventos tipados `TimerScheduled`, `TimerFired` y, al quedar sustituido, `TimerCancelled`;
- los temporizadores diferidos usan una tarea dedicada antes de reanudar la tarea de workflow;
- `timer(0)` se dispara dentro de la tarea de workflow y no crea una tarea de temporizador;
- la reproducción y las consultas consideran el historial tipado `TimerScheduled`, `TimerFired` y `TimerCancelled` la autoridad sobre su ciclo de vida. Los temporizadores puros siguen bloqueados hasta que llega el evento de disparo confirmado, y el detalle de ejecución seleccionada reconstruye desde el historial las esperas abiertas, disparadas o canceladas;
- Waterline muestra las esperas en el detalle de ejecución y las cargas del panel;
- los comandos `cancel()` y `terminate()` del motor sustituyen de forma duradera las esperas abiertas. Los trabajos tardíos de temporizador no hacen nada y no reabren la ejecución.

Los temporizadores de cualquier duración funcionan con todos los controladores de colas de Laravel, incluido Amazon SQS. El motor divide automáticamente las esperas largas según el límite por mensaje del controlador.

`sideEffect()` permite capturar instantáneas seguras para la reproducción, como aleatoriedad o entradas de una bifurcación que solo se leen una vez.

## Leer tiempo determinista {#reading-deterministic-time}

Dentro del workflow, usa `Workflow::now()` (o `Workflow\V2\now()`) en lugar del helper `now()` de Laravel o `Carbon::now()` para obtener la hora actual:

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

`Workflow::now()` avanza al reproducir eventos: devuelve el `recorded_at` de la última finalización de actividad, disparo de temporizador, recepción de señal, resolución de condición o finalización de hijo que haya consumido la reproducción. Antes de consumir eventos devuelve el `started_at` de la ejecución. Fuera de una fibra de workflow (por ejemplo, en una actividad o un método de consulta que delega en un helper ajeno al workflow), recurre al `now()` del reloj real.

Usar `Workflow::now()` conserva el determinismo: dos reproducciones del mismo historial producen los mismos valores de tiempo aunque el reloj real haya avanzado.
