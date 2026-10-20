---
title: Consulta periódica de estado externo
description: Escolha consultas limitadas ou sinais de callback, espere de forma durável no workflow e considere o custo do histórico.
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
| Enviar e retornar, depois receber um sinal de callback | Libera o slot de atividade após o envio; o workflow espera de forma durável | Envio, admissão e aplicação do sinal e esperas com prazo acrescentam histórico. Exige correlação autenticada e tratamento de duplicatas na aplicação. |

Use consultas curtas que possam ser repetidas com segurança. Um callback bloqueado em uma solicitação externa não se torna responsivo apenas porque seu workflow tem um temporizador ou uma política de cancelamento.

## Conclusão por callback e sinal {#callback-and-signal-completion}

Quando o sistema externo puder notificá-lo, envie o trabalho em uma atividade curta e retorne a confirmação de recebimento. Deixe o **workflow** esperar por um sinal declarado ou uma condição reconstruída no replay, com prazo finito. Não mantenha uma atividade, resposta HTTP ou conexão SSE aberta até o trabalho terminar.

Escolha o ID da instância e salve a relação entre a operação externa autenticada, o namespace, o **ID público da instância do workflow** e o nome do sinal declarado antes de iniciar o workflow. A atividade pode enviar o trabalho assim que o início for confirmado. Um ID de run identifica apenas aquele run; ele não é um endereço estável para callbacks após continue-as-new. Autentique o callback e confira a relação salva antes de encaminhá-lo; não confie em campos de identidade ou roteamento de uma requisição arbitrária.

### Callback PHP embutido {#embedded-php-callback}

Configure `services.jobs.url` para o provedor e `services.jobs.callback_url` para o adaptador autenticado da aplicação. Adapte a requisição `/jobs` à API do provedor: ela deve confirmar o envio rapidamente e retornar `job_id`. Implemente a autenticação específica do provedor e limite a duração da requisição. A chave da operação só ajuda a deduplicar se o provedor realmente a respeitar.

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

Inicie com um ID de instância escolhido pelo chamador e timeouts finitos para o run e para toda a execução. Registre `ExternalCompletion` com [webhooks autenticados](../features/webhooks.md); o adaptador pode encaminhar a entrada validada à rota de sinal direcionada à instância:

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

Esse é o formato `arguments` do webhook embutido, não o envelope de payload do Server. O provedor deve chamar o adaptador autenticado da aplicação, sem receber credenciais de operador ou de worker do Server.

### Callback e condição em Python {#python-callback-and-condition}

A atividade abaixo realiza apenas o envio limitado. Configure `JOB_API_URL`, `JOB_CALLBACK_URL` e a autenticação do provedor no ambiente dela. Registre ambas as definições no [worker Python](./python.md). Passe explicitamente o ID da instância conhecido pelo chamador; este exemplo não inventa um acesso ao ID no contexto do workflow.

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

Escolha o ID e persista a relação namespace/instância/sinal da operação **antes de chamar start**. A atividade pode começar assim que o início for confirmado. A aplicação então inicia essa instância com orçamentos de tempo finitos:

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

Após autenticar o provedor e resolver a relação salva para sua operação, o adaptador usa um Client no **mesmo namespace**:

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

Isso chama `POST /api/workflows/{workflowId}/signal/{signalName}` do Server usando o envelope Avro normal do SDK. Uma chamada bem-sucedida confirma a admissão, não que o workflow processou o callback. Quando a confirmação for importante, consulte o resultado do workflow ou o estado retido do sinal.

### Callbacks antecipados, continuações e callbacks atrasados {#early-continued-and-late-callbacks}

- Declare o sinal antes de iniciar o run. Um callback recebido antes da espera é retido e consumido em ordem durável; o Python reconstrói o estado do manipulador durante o replay. Um registro posterior não pode reescrever as declarações de um run antigo.
- Callbacks direcionados à instância acompanham continue-as-new; chamadas explicitamente direcionadas a um run permanecem restritas àquele run. Em runtimes compatíveis com Core 2.7.0+, sinais de instância recebidos e elegíveis mantêm a identidade e a ordem originais na transição. O estado de callbacks **já aplicados** precisa ser levado nos argumentos de continuação se a aplicação ainda precisar dele.
- Um callback após fechamento terminal é recusado explicitamente. No Server publicado, o Python expõe `SignalFailed.reason == "run_not_active"` com status409. Um sinal admitido mas ainda não aplicado pode receber uma disposição retida de rejeição por fechamento; o recibo de admissão anterior não é apagado. Veja [admissão e fechamento de sinais](../features/signals.md#acceptance-and-closure).
- O prazo da espera não cancela o trabalho externo. Reconcilie o resultado ou solicite o cancelamento ao provedor por uma atividade. Um resultado atrasado pode exigir uma decisão de recuperação da aplicação; não inicie silenciosamente um trabalho substituto.

### Entregas duplicadas e limites do streaming {#duplicate-delivery-and-streaming-limits}

Provedores repetem callbacks, e um erro de rede pode ocorrer após a admissão do sinal. Persista a chave da operação/evento e a intenção exata, deduplique na entrada do callback e no processamento de negócio e mantenha entregas incertas para reconciliação. O manipulador Python mantém o primeiro resultado por operação neste run; isso não garante deduplicação entre runs nem admissão única. Não marque um encaminhamento incerto como processado só porque a requisição foi enviada. A [issue compartilhada #216](https://github.com/durable-workflow/.github/issues/216) ainda cobre repetições seguras e a identidade de admissão retida. Um cabeçalho de idempotência ou uma única tentativa de atividade, isoladamente, não garante efeitos externos únicos.

Inicie o workflow antes que esta receita envie o trabalho. Em modo serviço, `start(use-existing)` seguido de `signal` são **duas operações**, sujeitas a uma corrida com o fechamento; a admissão atômica continua na [issue compartilhada #222](https://github.com/durable-workflow/.github/issues/222). O `signalWithStart` embutido é uma API atômica separada. A solicitação de debounce [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) foi substituída por esse requisito de produto, não concluída por esta receita.

Um socket HTTP/SSE mantido dentro de uma atividade não é durável: perder o worker ou processo o encerra, ele ocupa um slot de atividade e a reconexão pode repetir ou perder eventos externos. Envio e callbacks continuam acrescentando histórico de atividade, sinal e espera; a execução não é gratuita nem ilimitada. Para **saída durável do workflow**, use [Workflow Streams](./workflow-streams.md) e seu contrato persistido de sequência/cursor, em vez de tratar uma conexão de transporte como armazenamento.

O código PHP e Python foi executado com **Server 2.9.7 / Core 2.7.2** publicado e **SDK Python 2.6.1** instalado normalmente. Controles separados no PostgreSQL 17.11 cobriram callbacks antecipados e durante a espera, recusa tardia e continue-as-new com callback enquanto o worker Python estava ausente, seguido de leitura a frio. Os controles embutidos usaram a rota real do webhook. Isso comprova a receita, não todas as bases, autenticação do provedor, desligamento gracioso ou runtime nativo. O [registro de qualificação](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) preserva separadamente os originais malsucedidos.

## Limite tentativas e histórico {#bound-retries-and-history}

As repetições precisam ser habilitadas: atividades PHP têm uma tentativa por padrão. Por exemplo, configure `maxAttempts: 3`, `backoff: [5, 30]`, `startToCloseTimeout: 10` e `scheduleToCloseTimeout: 90` para três tentativas remotas com intervalos finitos e tempo total original. A política equivalente em Python é `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`, com opções separadas de timeout por tentativa e total. Retornar com sucesso «ainda não está pronto» não é uma falha e não dispara nova tentativa. Veja [falhas e recuperação](../failures-and-recovery.md).

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
