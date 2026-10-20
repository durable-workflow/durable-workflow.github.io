---
sidebar_position: 2
title: Atividades
description: Defina classes de atividade para efeitos externos não determinísticos, novas tentativas, roteamento e opções por chamada.
tags:
  - authoring
  - activities
  - retries
keywords:
  - classe de atividade do durable workflow
  - opções de atividade
  - efeitos externos não determinísticos
---

# Atividades {#activities}

Uma atividade é uma unidade de trabalho que realiza uma tarefa ou operação específica (por exemplo, fazer uma requisição à API, processar dados ou enviar um e-mail) e pode ser executada por um workflow.

:::note Contrato de execução durável
Atividades comuns da v2 executam como tarefas duráveis em fila. Atividades locais
são uma primitiva explícita no mesmo processo para trabalhos curtos de atividade
que ainda registram histórico durável de atividade. Sessões de worker estão
disponíveis quando várias etapas de atividades duráveis precisam de um lease de
worker. A execução sticky é uma otimização de replay suportada, não um contrato
de correção. Consulte [Modelo de execução de atividades](/docs/features/activity-execution-model),
[Atividades locais](/docs/features/local-activities), [Sessões de worker](/docs/features/worker-sessions)
e [Execução sticky](/docs/features/sticky-execution) para os contratos
exatos.
:::

Você pode usar o comando Artisan `make:activity` para criar uma atividade:

```php
php artisan make:activity MyActivity --v2
```

Ela é definida estendendo a classe `Activity` e implementando o método `handle()`.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## Contrato de execução {#execution-contract}

Toda chamada `activity(...)` registra um comando de atividade no histórico do
workflow e cria uma tarefa durável em fila para um worker assumir. Atividades
comuns podem ser assumidas por qualquer worker compatível, enquanto
[sessões de worker](/docs/features/worker-sessions) podem fixar uma sequência
de tentativas de atividade a um lease de sessão de worker quando o workflow
opta explicitamente por esse contrato.

Se precisar de um valor seguro para replay sem agendar trabalho em fila, use
[`sideEffect(...)`](/docs/features/side-effects). Se precisar de uma atividade
curta no mesmo processo, com novas tentativas e semântica de limite de tempo,
heartbeat e histórico de atividade, use [Atividades locais](/docs/features/local-activities).
Para o modelo completo de posicionamento, consulte [Modelo de execução de atividades](/docs/features/activity-execution-model).
Para o comportamento do cache de replay sticky, consulte
[Execução sticky](/docs/features/sticky-execution).

## Idempotência e identidade durável {#idempotency-and-durable-identity}

A execução de atividades ocorre pelo menos uma vez. Novas tentativas, expiração
de leases e reentrega podem fazer com que a mesma atividade lógica seja observada
mais de uma vez. Portanto, o efeito externo ou o destino remoto deve ser seguro
para repetição.

Dentro da atividade, use os identificadores duráveis do runtime quando precisar
de correlação ou deduplicação remota:

- `activityId()` identifica uma execução lógica de atividade ao longo das novas
  tentativas e é a chave padrão de idempotência remota.
- `attemptId()` identifica uma tentativa concreta dessa execução.
- `attemptCount()` informa qual tentativa está em execução no momento.

Prefira `activityId()` quando o sistema remoto deva tratar novas tentativas como
a mesma solicitação lógica. Use `attemptId()` apenas quando o sistema remoto
realmente precisar distinguir tentativas separadas. Se um worker concluir um
trabalho remoto, perder seu lease e relatar o resultado tarde, o mecanismo pode
rejeitar essa conclusão tardia porque outro worker já venceu a disputa durável,
mas o efeito externo remoto pode ter ocorrido mesmo assim.

Consulte [Garantias de execução e idempotência](/docs/constraints/execution-guarantees),
[Heartbeats](/docs/features/heartbeats) e
[Falhas e recuperação](/docs/failures-and-recovery) para o modelo operacional
por trás desses identificadores.

## Substituições por chamada {#per-call-overrides}

O roteamento e as novas tentativas usam por padrão os valores de `$connection`, `$queue`, `$tries` e `backoff()` da própria classe da atividade. Quando uma chamada precisar substituir esses valores, por exemplo, para direcioná-la a uma fila de maior prioridade ou permitir mais tentativas, passe uma instância de `ActivityOptions`:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

Consulte [Opções de atividade](/docs/configuration/options#activityoptions) para a lista completa de campos, incluindo limites de tempo e heartbeats.

## Chamadas de atividade local {#local-activity-calls}

Use `localActivity(...)` quando um efeito externo curto e idempotente deva
executar dentro do processo atual do worker de workflow, mas ainda precise da
semântica de novas tentativas, limite de tempo, heartbeat, cancelamento e
histórico de atividade:

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

Atividades locais rejeitam `connection`, `queue`, roteamento por sessão de worker
e opções de tempo entre agendamento e início, pois não criam tarefas comuns de
atividade. Consulte [Atividades locais](/docs/features/local-activities) para
o contrato completo.
