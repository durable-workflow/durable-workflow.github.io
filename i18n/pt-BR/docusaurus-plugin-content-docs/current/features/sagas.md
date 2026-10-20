---
sidebar_position: 11
title: Sagas
description: Compensação durável, ordem de desfazer operações e limpeza antes de um prazo.
---

# Sagas {#sagas}

Este guia explica a compensação em workflows incorporados ao Laravel que usam `Workflow\V2\Workflow`. Para workers no modo de serviço, consulte o [guia do SDK PHP](https://php.durable-workflow.com/build/workflows-activities/), o [guia do SDK Python](https://python.durable-workflow.com/sdk-reference/#saga-compensation) ou a [referência do SDK Rust](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html).

Sagas são um padrão consolidado para gerenciar operações complexas e prolongadas:

- Uma saga gerencia transações distribuídas por meio de uma sequência de transações locais.
- Uma transação local é uma unidade de trabalho executada por um participante da saga, uma atividade.
- Cada operação da saga pode ser revertida por uma atividade compensatória.
- O código do workflow decide quando chamar a compensação. Ela pode falhar e precisa de tempo e workers operacionais para terminar.

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

Quando o workflow captura uma exceção, `$this->compensate()` executa todas as compensações registradas em **ordem inversa**. No exemplo, se `BookRentalCarActivity` falhar, o motor cancela primeiro o hotel e depois o voo, desfazendo a saga a partir da etapa mais recente.

Registre cada compensação depois que sua atividade direta terminar com sucesso. O replay reconstrói essa ordem de registro e reutiliza os resultados de atividade já gravados, incluindo as compensações concluídas.

## Compensação por vencimento do prazo {#deadline-driven-compensation}

Um [tempo limite de workflow](./timeouts.md#timeout-outcome-and-cleanup) aplicado pelo motor encerra a execução antes que seu código possa compensar. Um bloco `catch` ou `finally` não muda esse comportamento. Os comandos imediatos `cancel()` e `terminate()` também não dão tempo para a limpeza.

Use um prazo anterior da aplicação quando quiser desfazer o trabalho concluído ao esgotar o tempo. Este workflow incorporado reserva um recurso e espera até 30 segundos por um sinal de confirmação. Ao vencer, o código do workflow retoma, libera a reserva e retorna o resultado de negócio `expired`:

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

`ReserveResourceActivity` e `ReleaseResourceActivity` são atividades da sua aplicação. Torne ambas idempotentes com uma chave de negócio estável para a reserva. A espera começa depois de reservar com sucesso. Envie `confirm` sem argumentos para obter `true` como resultado bem-sucedido; `null` significa que a espera venceu.

Inicie-o com um limite maior do motor como proteção final:

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

Se a espera vencer e a compensação terminar com sucesso, o workflow conclui normalmente com `status: expired` no resultado. Não é uma execução encerrada pelo tempo limite do motor. Se a atividade que libera a reserva falhar, `compensate()` propaga a falha. Se o prazo do motor chegar primeiro, a execução é encerrada e a compensação restante não pode executar. Reserve tempo suficiente para agendamento e novas tentativas, e considere um prazo anterior de execução completa, se houver.

A operação cooperativa independente `requestCancellation()` permite que um chamador solicite limpeza enquanto a execução está ativa. Use sua proteção limitada contra cancelamento para realizar limpeza durável sob essa solicitação. O tempo limite de um workflow não a aciona automaticamente. Consulte [Cancelamento cooperativo](../polyglot/cancellation.md).

## Ordem das compensações {#compensation-ordering}

Por padrão, as compensações executam **sequencialmente na ordem inversa do registro**. É a opção mais segura, pois etapas posteriores podem depender das anteriores.

Por padrão, `compensate()` para na primeira falha de compensação e a propaga ao chamador.

## Compensação em paralelo {#parallel-compensation}

Para executar compensações em paralelo, use `setParallelCompensation(true)`. Nesse modo, cada closure de compensação deve retornar uma chamada de atividade iniciada, sem aguardar seu resultado, para que o motor possa executá-las simultaneamente:

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

Quando a compensação paralela está ativada, as closures retornam chamadas de atividade que o motor reúne e executa por meio de `all()`.

## Continuar após erros {#continue-with-error}

Por padrão, se uma atividade compensatória lançar uma exceção, as compensações restantes são ignoradas e a falha é propagada. Para executar todas mesmo que alguma falhe, use `setContinueWithError(true)`:

```php
$this->setContinueWithError(true);
```

Com essa opção, o motor captura e descarta as exceções de cada closure de compensação e continua para a próxima. É útil quando as compensações são independentes e se deseja tentar a limpeza mesmo que algumas etapas falhem.

### Combinar as duas opções {#combining-both-flags}

É possível combinar `setParallelCompensation(true)` e `setContinueWithError(true)`. Com ambas as opções, todas as compensações executam em paralelo por meio de `all()` e a exceção de qualquer uma delas é capturada para que as demais terminem. Sem `setContinueWithError(true)`, uma falha de compensação paralela é propagada imediatamente e o workflow falha.

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## Como funciona {#how-it-works}

- `addCompensation()` registra uma função invocável que será executada durante `compensate()`
- `compensate()` percorre as compensações registradas na ordem inversa
- Cada closure de compensação é uma etapa normal do workflow V2. Suas atividades produzem eventos duráveis de histórico como qualquer outra atividade
- As atividades de compensação aparecem na linha do tempo e na exportação do histórico do Waterline
- Se o workflow terminar com sucesso, as closures de compensação não são chamadas nem produzem histórico

## Executar este padrão {#run-this-pattern}

A saga do agente de viagens orientada por sinais da [Sample App](/docs/sample-app) é a referência executável desta página. Clone a aplicação de exemplo, configure `OPENAI_API_KEY` e execute:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` registra compensações para cada atividade de reserva. Se um voo falhar após reservar um hotel, a lista de compensações desfaz a reserva do hotel. É o mesmo padrão desta página, com eventos visíveis na linha do tempo da execução no Waterline.