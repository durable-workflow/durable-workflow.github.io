---
sidebar_position: 5
---

# Sinal + temporizador {#signal--timer}

`Workflow\V2` oferece tanto `await($condition, timeout: $seconds, conditionKey: $key)` para esperas por condição com tempo limite quanto `await('signal-name', timeout: $seconds)` para esperas por sinais nomeados com tempo limite.

Use quando o workflow precisar continuar assim que alguma condição sobre o estado durável reconstruído por replay se tornar verdadeira, mas também precisar desbloquear após um prazo caso esse estado nunca mude.

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

`await()` com o parâmetro `timeout:` funciona assim:

- O predicado deve depender apenas de entradas duráveis reconstruídas por replay (resultados de atividades, alterações feitas por atualizações, resultados de workflows filhos). Estado não durável não desperta a espera.
- A chave de condição opcional é um rótulo estável para o operador que identifica a espera. O replay valida a chave com o histórico anterior para que uma nova implantação não reutilize silenciosamente a mesma etapa do workflow para outro predicado.
- Se o predicado se tornar verdadeiro antes do disparo do temporizador, `await()` retorna `true`.
- Se o prazo vencer primeiro, `await()` retorna `false`.

Há helpers de conveniência para expressar tempos limite de forma legível: `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`, `years()`.

Para alterar o predicado de forma durável a partir do código da aplicação, chame a atualização declarada:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

O valor retornado é `true` quando a condição se torna verdadeira antes do disparo da tarefa de tempo limite, e `false` quando o tempo limite vence.

Para sinais nomeados, `await('name', timeout: minutes(5))` retorna o payload do sinal quando ele chega e `null` quando o tempo limite vence. `null` é reservado ao tempo limite: sinais sem argumentos resolvem para `true`, com um argumento resolvem para esse valor e com vários argumentos resolvem para um array. `Workflow\V2` não usa os métodos mutadores legados `#[SignalMethod]` para alterar o estado do workflow.

## Helper `awaitWithTimeout()` {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` é um atalho para `await($condition, timeout: $timeout, conditionKey: $conditionKey)`. A ordem dos argumentos coloca o prazo primeiro para deixar clara a intenção de limitar o tempo no local da chamada.

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

A semântica de retorno é a mesma de `await()` com o parâmetro `timeout:`: a chamada retorna `true` quando a condição vence, `false` quando o prazo vence para um predicado chamável, o payload do sinal quando um sinal nomeado vence e `null` quando o prazo vence para um sinal nomeado.

`awaitWithTimeout()` expressa “espere no máximo este tempo por uma condição”, enquanto a outra forma expressa “espere por uma condição, com uma opção de tempo limite”. Use a forma mais clara no local da chamada. O runtime trata as duas de modo idêntico, e elas registram o mesmo histórico do workflow.
