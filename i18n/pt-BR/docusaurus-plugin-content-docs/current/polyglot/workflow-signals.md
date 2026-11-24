---
title: Signal-with-start e sinais entre workflows
description: Inicie ou reutilize um workflow e envie um sinal a ele em uma única operação, e sinalize outro workflow de forma durável a partir do código do workflow, com os SDKs PHP, Python e Rust.
---

# Signal-with-start e sinais entre workflows {#signal-with-start-and-workflow-signals}

O Server nativo 3.15.0 adiciona duas operações de sinal:

- **Signal-with-start** é uma chamada de cliente. Uma requisição inicia o
  workflow ou reutiliza sua execução aberta e registra um sinal nessa execução,
  em uma única transação do Server.
- **Sinalizar outro workflow** é um comando de workflow. O código do workflow
  envia um sinal a outro workflow em seu namespace. A requisição e seu resultado
  são registrados uma única vez no histórico do remetente, e o replay nunca envia
  o sinal novamente.

## Requisitos {#requirements}

| Runtime | Signal-with-start | Sinalizar outro workflow |
| --- | --- | --- |
| Server nativo | 3.15.0 ou posterior, anunciado como `capabilities.signal_with_start` | 3.15.0 ou posterior, anunciado como o comando de worker `signal_external_workflow` |
| PHP SDK | 3.22.0 ou posterior: `Client::signalWithStart()` | 3.22.0 ou posterior: `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 ou posterior: `Client.signal_with_start()` | 2.20.0 ou posterior: `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 ou posterior: `Client::signal_with_start()` | 4.21.0 ou posterior: `ctx.signal_external_workflow()` |
| PHP embarcado (Laravel) | `WorkflowStub::signalWithStart()`, consulte o [guia de sinais](../features/signals.md#signal-with-start) | Workflow 2.35.0 ou posterior (experimental): `signalExternalWorkflow()`, consulte o [guia de sinais](../features/signals.md#signal-another-workflow) |

O PHP Server 2.x publicado não oferece nenhuma das duas operações. Os SDKs
verificam o Server conectado antes do envio. Com um Server mais antigo, uma
chamada de cliente lança `ServerCapabilityUnavailable` (PHP),
`RuntimeCapabilityUnsupported` (Python) ou `Error::SignalWithStartUnavailable`
(Rust), e nada é enviado. Um worker recusa um novo comando de sinal com
`signal_external_workflow_unavailable` antes de enviar qualquer coisa; assim, a
tarefa de workflow não é concluída e a execução não falha.

## Signal-with-start {#signal-with-start}

Use signal-with-start quando um chamador endereça uma única entidade e não pode
perder o evento entre um início e um sinal separados. Um
`start(use-existing)` seguido de `signal` são duas operações: a execução pode
encerrar no intervalo, e o sinal é então recusado. Signal-with-start não tem
esse intervalo.

- **Nenhuma execução.** Uma nova execução é iniciada com a entrada e os prazos
  desta chamada. O `start_outcome` do recibo é `started_new`.
- **Uma execução aberta**, incluindo a execução mais recente após um
  continue-as-new. O sinal entra nela, e `start_outcome` é
  `returned_existing_active`. A execução mantém sua entrada, seus prazos e seu
  histórico. Uma política de duplicidade `fail` a recusa com
  `instance_already_started`.
- **Uma execução encerrada.** Recusada com `run_not_active`, a menos que a
  política para execução encerrada seja `start_new_run`. Nesse caso, uma nova
  execução é iniciada após a encerrada, e o recibo identifica a execução
  encerrada em `closed_run_id`. A execução encerrada mantém seu resultado.

O tipo de workflow deve ser o tipo da instância, e a fila de tarefas deve ser a
fila da execução aberta. Caso contrário, o Server recusa com
`workflow_type_conflict` ou `task_queue_conflict`. Nada é gravado em nenhuma
recusa.

O ID da requisição é a [chave de comando](./server-api-reference.md#command-keys)
do sinal. Cada SDK gera uma por chamada quando você a omite. Salve sua própria
chave quando uma repetição precisar sobreviver a um reinício do processo. Uma
repetição com a mesma chave, o mesmo nome de sinal, os mesmos argumentos e o
mesmo tipo de workflow retorna o recibo original com `retained: true`, mesmo
depois que a execução foi encerrada ou continuou, e não inicia nada.

```php
use DurableWorkflow\Exception\SignalWithStartFailed;

try {
    $receipt = $client->signalWithStart(
        'orders.entity',      // workflow type
        'order-42',           // workflow ID
        'orders',             // task queue
        'changed',            // signal name
        [2],                  // signal arguments
        input: ['order-42'],  // input for a run this call starts
        requestId: 'order-42-revision-2',
    );
    $receipt['start_outcome']; // "started_new" or "returned_existing_active"
} catch (SignalWithStartFailed $failed) {
    $failed->reason(); // For example "run_not_active". Nothing was written.
}
```

```python
from durable_workflow.errors import SignalWithStartFailed

try:
    receipt = await client.signal_with_start(
        "order-42",
        "changed",
        workflow_type="orders.entity",
        task_queue="orders",
        input=["order-42"],
        signal_args=[2],
        request_id="order-42-revision-2",
    )
    receipt["start_outcome"]  # "started_new" or "returned_existing_active"
except SignalWithStartFailed as failed:
    failed.reason  # For example "run_not_active". Nothing was written.
```

```rust
use durable_workflow::{json, SignalWithStartOptions};

match client
    .signal_with_start(
        "orders.entity",
        "orders",
        "order-42",
        "changed",
        json!(["order-42"]),
        json!([2]),
        SignalWithStartOptions::new().request_id("order-42-revision-2"),
    )
    .await
{
    Ok(receipt) => println!("{}", receipt["start_outcome"]),
    // For example Some("run_not_active"). Nothing was written.
    Err(error) => println!("{:?}", error.signal_with_start_refusal()),
}
```

Passe `closedRunPolicy: 'start_new_run'` (PHP), `closed_run_policy="start_new_run"`
(Python) ou `ClosedRunPolicy::StartNewRun` (Rust) para iniciar uma nova execução
após uma encerrada. Signal-with-start admite o sinal uma única vez. O trabalho
que o sinal dispara ainda precisa de sua própria idempotência.

## Sinalizar outro workflow {#signal-another-workflow}

O código do workflow envia um sinal a outro workflow em seu namespace pelo ID do
workflow. Sem um ID de execução, o sinal vai para a execução atual do destino;
com um, apenas para essa execução. O sinal é um comando de workflow, não uma
atividade:

- A conclusão que o carrega registra `ExternalSignalRequested` no histórico do
  remetente, admite o sinal no destino e registra exatamente um resultado,
  `ExternalSignalDelivered` ou `ExternalSignalFailed`, na mesma sequência, tudo
  em uma única transação do Server.
- No destino, ele é um sinal comum: o mesmo evento `SignalReceived` e o mesmo
  registro de sinal de qualquer outro sinal, atribuído à execução remetente. Sua
  chave de comando no destino é `workflow-signal:<sender run ID>:<sequence>`.
  Chamadores não podem usar esse prefixo: um sinal ou signal-with-start cujo ID
  de requisição comece com `workflow-signal:` é recusado com 422 e
  `reason: "request_id_reserved"`.
- O replay lê o resultado registrado e nunca envia novamente. Um destino,
  execução, nome de sinal ou argumentos diferentes nesse ponto do workflow fazem
  o replay falhar como não determinístico.

Um sinal não entregue é um valor retornado, não uma exceção. O código do
workflow decide o que fazer com ele.

| Resultado | Motivo | Quando |
| --- | --- | --- |
| `delivered` | nenhum | A execução de destino admitiu o sinal. |
| `target_not_found` | `instance_not_found` | Não existe workflow com esse ID neste namespace. |
| `target_not_found` | `run_not_found` | O ID de execução não identifica nenhuma execução desse workflow. |
| `target_closed` | `run_not_active` | A execução de destino foi encerrada. |
| `target_closed` | `historical_run` | O ID de execução identifica uma execução substituída por continue-as-new. |
| `rejected` | `unknown_signal`, `invalid_signal_arguments`, `structural_limit_exceeded` | O destino recusou o sinal, como recusaria um sinal HTTP. |
| `rejected` | `runtime_reserved_signal` | O nome é reservado para o fluxo de mensagens do runtime. |
| `rejected` | `self_target` | O destino é o próprio workflow do remetente. |
| `rejected` | `request_id_conflict` | A chave de comando já foi usada para um sinal diferente. |

Os SDKs verificam o nome do sinal no código do workflow antes de registrar
qualquer coisa. Ele não pode estar em branco, não pode conter um caractere de
controle (um byte abaixo de `0x20`, ou `0x7f`) e tem no máximo 191 caracteres e
255 bytes. O ID do workflow de destino tem de 1 a 191 caracteres. Um nome
recusado lança `InvalidSignalName` (PHP e Python) ou retorna
`Error::InvalidExternalSignal` (Rust), e nenhum comando é enviado.

```php
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\WorkflowContext;

final class ApproverWorkflow
{
    #[Workflow('orders.approver')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $result = $context->signalExternalWorkflow($orderId, 'approve', ['Ada']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

O handle de um filho iniciado tem o mesmo comando: `$child->signal('approve', ['Ada'])`.

```python
from durable_workflow import workflow


@workflow.defn(name="orders.approver")
class Approver:
    def run(self, ctx: workflow.WorkflowContext, order_id: str):
        result = yield ctx.signal_external_workflow(order_id, "approve", ["Ada"])
        if not result.delivered:
            # target_not_found, target_closed or rejected, with a reason
            return {"skipped": result.outcome, "reason": result.reason}
        return {"delivered_to": result.target_run_id}
```

```rust
use durable_workflow::{json, ExternalSignalOutcome};

worker.register_workflow("orders.approver", |ctx, input| async move {
    let order_id = input[0].as_str().unwrap_or_default().to_owned();
    let result = ctx
        .signal_external_workflow(order_id, "approve", json!(["Ada"]))
        .await?;
    match result.outcome {
        ExternalSignalOutcome::Delivered => Ok(json!({"delivered_to": result.target_run_id})),
        // target_not_found, target_closed or rejected, with a reason
        _ => Ok(json!({"skipped": result.outcome.as_str(), "reason": result.reason})),
    }
});
```

Adicione `.run_id(run_id)` em Rust, `run_id=` em Python ou `runId:` em PHP para
sinalizar apenas uma execução do destino.

Execute o comando isoladamente. Ele não pode fazer parte de um grupo paralelo
nem de uma seleção durável. Um worker que mantém uma tarefa de workflow pode
sinalizar qualquer workflow no namespace dessa tarefa sem o papel de operador
que um sinal HTTP exige. Coloque em um namespace separado um workflow que o
código de outros workflows não deva sinalizar.

## Ordem das condições com prazo {#timed-condition-order}

Com Native Server 3.27.0 ou posterior, um worker compatível e a criação de esperas ordenadas ativada, uma condição com prazo pode usar sinais e atualizações aplicadas com sucesso que tenham sido recebidos antes do evento `TimerFired` original. Isso vale mesmo quando o worker avalia a condição depois de o temporizador disparar. A ordem de recebimento determina qual estado elegível satisfaz primeiro o predicado. Um sinal nomeado segue o mesmo limite.

Para ordenar os efeitos dos sinais, use o [SDK PHP 3.29.0](https://github.com/durable-workflow/sdk-php/releases/tag/3.29.0) ou posterior. Os efeitos ordenados das atualizações dependem do suporte do worker que as processa.

Em um `select()` compatível, a condição vence um workflow filho se esse primeiro estado que satisfaz o predicado preceder, no histórico, a conclusão ou a falha do filho. Depois que a espera é resolvida, a reprodução usa o resultado registrado.

A criação de esperas ordenadas fica desativada por padrão. Para um Server auto-hospedado, siga o [guia de implantação e reversão](https://github.com/durable-workflow/server/blob/3.27.0/rust/README.md#rolling-out-durable-input-ordering-for-timed-waits) antes de ativá-la.

## Quando uma atividade ainda é necessária {#when-an-activity-is-still-needed}

Use uma atividade que chame o cliente quando o comando de workflow não servir:

- **Signal-with-start a partir do código do workflow.** Não há comando de
  workflow para signal-with-start. Chame o signal-with-start do cliente a partir
  de uma atividade e derive o ID da requisição de dados estáveis do workflow,
  como o ID do workflow e uma chave de negócio, para que cada nova tentativa da
  atividade envie a mesma chave e o Server admita o sinal uma única vez.
- **Outro namespace.** Sinais permanecem dentro do namespace. Use uma
  [chamada de serviço entre namespaces](./service-operations.md).
- **Um Server mais antigo.** Antes do Server nativo 3.15.0, o código do workflow
  só consegue sinalizar por meio de uma atividade. Dê também a esse sinal um ID
  de requisição estável, para que uma nova tentativa da atividade não registre
  um segundo sinal.

Uma atividade é executada pelo menos uma vez; por isso, o ID de requisição
estável é o que impede que uma nova tentativa envie um segundo sinal. O comando
de sinal registra seu resultado no histórico sem nenhuma tarefa de atividade.
