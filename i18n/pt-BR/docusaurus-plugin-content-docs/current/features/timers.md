---
sidebar_position: 4
title: Temporizadores
description: Use temporizadores duráveis e tempo determinístico no workflow sem depender do relógio do processo.
tags:
  - temporizadores
  - tempo-determinístico
  - esperas
keywords:
  - temporizadores duráveis
  - tempo determinístico
  - hora atual do workflow
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Temporizadores {#timers}

O framework permite suspender a execução de um workflow e retomá-la posteriormente. Esses temporizadores são duráveis: sobrevivem a reinicializações e falhas, mantendo a consistência com a semântica de replay do workflow. Isso é útil para implementar atrasos, lógica de repetição ou tempos limite.

Para usar temporizadores, chame `timer($duration)` dentro do workflow:

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

## Resolução dos atrasos {#delay-resolution}

Os atrasos de temporizadores duráveis são expressos em segundos inteiros. Passe
segundos inteiros, como `timer(1)`. Ao usar uma string de intervalo do PHP ou
`CarbonInterval`, uma duração positiva com frações de segundo é arredondada para
cima, até o próximo segundo inteiro. Assim, 100 ms se tornam um segundo.
`timer(0)` continua sendo resolvido na tarefa atual.

Um temporizador vencido fica apto a ser processado. A latência da fila e a carga
dos workers podem atrasar sua execução. Essa resolução não garante um instante
exato de retomada nem reduz a precisão dos timestamps gravados. Veja os
[testes](../testing.md#keeping-delay-tests-fast) para evitar esperas reais.

Comportamento dos temporizadores:

- cada chamada a `timer()` cria uma linha durável de temporizador e os eventos tipados de histórico `TimerScheduled`, `TimerFired` e, quando substituído, `TimerCancelled`
- temporizadores com atraso passam por uma tarefa dedicada de temporizador antes da retomada da tarefa do workflow
- `timer(0)` dispara diretamente durante a tarefa do workflow, sem criar uma tarefa de temporizador
- os caminhos de replay e consulta tratam o histórico tipado de `TimerScheduled`, `TimerFired` e `TimerCancelled` como fonte de verdade para o ciclo de vida do temporizador. Assim, temporizadores puros permanecem bloqueados até a chegada do evento de disparo confirmado, e os detalhes da execução selecionada podem reconstruir pelo histórico as esperas abertas, disparadas ou canceladas
- o Waterline apresenta esperas por temporizadores nos detalhes da execução e nos payloads do painel
- os comandos `cancel()` e `terminate()` do mecanismo substituem de forma durável as esperas abertas por temporizadores. Jobs de temporizadores que chegam atrasados não fazem nada, em vez de reabrir a execução

Temporizadores de qualquer duração funcionam com todos os drivers de fila do Laravel, incluindo o Amazon SQS. O mecanismo divide atrasos longos de forma transparente para respeitar o limite por mensagem do driver.

`sideEffect()` está disponível para instantâneos seguros para replay, como valores aleatórios ou entradas únicas para decisões de fluxo.

## Leitura do tempo determinístico {#reading-deterministic-time}

Dentro do corpo de um workflow, use `Workflow::now()` (ou `Workflow\V2\now()`) em vez do helper `now()` do Laravel ou de `Carbon::now()` quando precisar da hora atual:

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

`Workflow::now()` avança conforme o executor reproduz eventos do histórico. Retorna o `recorded_at` do último evento consumido pelo replay entre conclusão de atividade, disparo de temporizador, recebimento de sinal, resolução de condição ou conclusão de workflow filho. Antes de consumir qualquer evento, retorna o `started_at` da execução. Fora de uma fiber de workflow, por exemplo em uma atividade ou em um método de consulta que delega para um helper externo ao workflow, usa o `now()` do relógio real como alternativa.

Usar `Workflow::now()` mantém o workflow determinístico: dois replays do mesmo histórico produzem os mesmos valores de tempo, mesmo que o relógio real tenha avançado entre eles.
