---
title: Consulta periódica de estado externo
description: Escolha tentativas limitadas, atividades com heartbeat ou ciclos de temporizadores duráveis e contabilize o custo no histórico.
---

# Consulta periódica de estado externo {#polling-external-state}

Consulte um trabalho externo em uma atividade, nunca com solicitações de rede no código do workflow. Decida onde a espera deve acontecer antes de escolher o intervalo.

## Escolha o limite da espera {#choose-the-waiting-boundary}

| Padrão | Uso de workers | Histórico durável e controle |
| --- | --- | --- |
| Repetir uma atividade até ficar pronta | Um slot de atividade em cada tentativa; liberado durante o intervalo entre tentativas | Cada tentativa e repetição acrescenta histórico. O código do workflow não retoma entre tentativas, portanto não pode consultar o orçamento do histórico nem continuar como novo nesse intervalo. |
| Uma atividade longa com heartbeats | Ocupa seu slot de atividade durante toda a espera | Cada heartbeat aceito acrescenta um evento ao histórico. Use prazos finitos para a atividade e um timeout limitado na solicitação externa; heartbeats não ampliam o prazo de toda a execução. |
| Consulta em atividade seguida de temporizador durável | Libera slots de atividade entre consultas | Cada consulta acrescenta eventos de atividade e cada intervalo acrescenta eventos de temporizador. Entre consultas, o workflow pode decidir parar, compensar ou continuar como novo. |
| Um workflow filho dedicado à consulta | O filho usa os slots exigidos pelo padrão escolhido | Transfere o histórico de consultas para o filho; acrescenta eventos de início e resolução do filho ao pai. O histórico e a execução do filho continuam tendo custo. Escolha explicitamente a política de fechamento do pai. |

Use consultas curtas que possam ser repetidas com segurança. Um callback bloqueado em uma solicitação externa não se torna responsivo apenas porque seu workflow tem um temporizador ou uma política de cancelamento.

## Limite tentativas e histórico {#bound-retries-and-history}

As repetições precisam ser habilitadas: atividades PHP têm uma tentativa por padrão. Para três tentativas remotas, configure uma quantidade finita de tentativas, os dois intervalos desejados, um timeout por tentativa e o timeout total original da atividade. Retornar com sucesso «ainda não está pronto» não é uma falha e não dispara nova tentativa. Veja [falhas e recuperação](../failures-and-recovery.md).

Repetições são adequadas quando a indisponibilidade é um resultado explicitamente repetível e o workflow não precisa executar entre consultas. Não transforme tentativas ilimitadas em um ciclo de consulta invisível. A paridade dos intervalos em atividades locais é acompanhada na [issue do contrato de repetição](https://github.com/durable-workflow/.github/issues/219); estes exemplos usam atividades remotas.

## Faça a transição deliberadamente {#roll-over-deliberately}

Esta demonstração executável consulta uma vez por execução, espera e passa um contador finito de consultas restantes para a próxima execução. Substitua apenas a consulta sintética de estado da atividade por uma solicitação real limitada. O exemplo retorna o último estado mesmo quando o limite de consultas acaba; quem chama precisa verificar `ready`.

### PHP integrado {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

Inicie pelo [procedimento normal de workflow integrado](../installation.md), com timeouts finitos por execução individual e para toda a execução lógica.

### Worker Python no modo serviço {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

Registre `PollDemo` e `check_status` no mesmo [worker Python](./python.md), depois inicie com os argumentos `[2, 30]` e timeouts finitos para a execução lógica e a execução individual. Observe a instância atual do workflow para acompanhar a sucessora; um handle específico de uma execução continua selecionando a execução original.

Os dois exemplos foram executados nas versões publicadas Server **2.9.7 / Core 2.7.2**, com Python **2.6.1** instalado normalmente e entrada de teste `[2, 1]`. Ambos concluíram duas consultas reais em duas execuções. Continue-as-new reinicia o histórico da execução, acrescenta custos de execução e vínculo e preserva o prazo original da execução lógica. Isso não oferece duração ilimitada.

Use esperas duráveis relativas. O avanço do relógio Python e as leituras de orçamento do histórico estáveis durante a reprodução continuam sendo trabalhos separados de [relógio](https://github.com/durable-workflow/.github/issues/215) e [orçamento](https://github.com/durable-workflow/workflow/issues/859). Esta receita não decide com base em `ctx.now()` nem no tamanho recalculado do histórico. Não trate `DW_MAX_HISTORY_EVENTS` como uma transição automática obrigatória: [Server #504](https://github.com/durable-workflow/server/issues/504) acompanha essa lacuna.

## Interrompa e reconcilie {#interrupt-and-reconcile}

Para parar por sinal, [selecione entre um sinal e a espera pendente](../features/concurrency.md) e cancele explicitamente a operação perdedora conforme a política de cancelamento suportada. A seleção sozinha não cancela as demais operações. Solicitar que uma atividade pare não prova que um efeito externo nunca aconteceu: use chaves de idempotência e reconcilie antes de compensar ou reiniciar. Cancelamento imediato, terminação e timeout rígido do workflow não executam seu código de compensação; use o caminho suportado de [cancelamento cooperativo](./cancellation.md) quando a limpeza precisar executar.

## Inspecione o histórico real {#inspect-the-actual-history}

As medições anteriores do modo serviço Python registraram:

| Caso concluído | Eventos do histórico canônico |
| --- | --- |
| Uma atividade remota que tem sucesso na terceira tentativa | 10 no total: 1 agendamento, 3 inícios, 2 agendamentos de repetição, 1 conclusão e 3 eventos do ciclo de vida da execução |
| Uma atividade com dois heartbeats aceitos | 8 no total: 3 eventos de atividade, 2 de heartbeat e 3 do ciclo de vida |
| Duas consultas bem-sucedidas separadas por um temporizador | 11 no total: 6 eventos de atividade, 2 de temporizador e 3 do ciclo de vida |

O exemplo de transição registrou **8 + 5** eventos entre as execuções Python e **8 + 6** entre as PHP; PHP também registra `StartAccepted` para a sucessora. São custos medidos de operações e execuções, não totais universais de eventos, unidades de cobrança ou resultados de desempenho. Outros comandos, falhas, cancelamentos e metadados de admissão do runtime podem acrescentar eventos. Inspecione o histórico de cada execução, a política de tentativas retida e os prazos originais, em vez de estimar o crescimento apenas pelas iterações. As observações exatas e os registros malsucedidos das provas são preservados no [comprovante de qualificação](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564).
