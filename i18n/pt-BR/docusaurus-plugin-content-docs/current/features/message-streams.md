---
sidebar_position: 18
tags:
  - fluxos-de-mensagens
  - workflows
  - continue-as-new
  - IA
keywords:
  - fluxos de mensagens
  - caixa de entrada do workflow
  - caixa de saída do workflow
  - MessageStream
  - mensagens repetidas de workflow
---

# Fluxos de mensagens {#message-streams}

Fluxos de mensagens são a interface de autoria v2 para mensagens repetidas de
workflow: loops de entrada humana, respostas de assistentes, notificações entre
workflows e outras mensagens ordenadas que devem sobreviver a replay e continue-as-new.

Esta página descreve a API de entrada e saída do Laravel embarcado. Os
[Fluxos de workflow](/docs/polyglot/workflow-streams/) mantidos pelo Server
reutilizam nomes como fluxo, offset, contagem pendente, ciclo de vida e erro
quando a semântica coincide, mas são apenas de saída. Eles não adicionam
mensagens de entrada para workflows nem transferência de cursor em
continue-as-new ao modo de serviço.

Autores de workflows devem usar a fachada própria:

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

Não grave linhas de `workflow_messages` ou de cursor diretamente pelo código
de workflow da aplicação. A fachada é o contrato estável. Os serviços de
mensagens de nível inferior existem para integração do pacote com o runtime.

## Recebimento de mensagens {#receiving-messages}

Use `peek()` quando um workflow precisar inspecionar mensagens de entrada
pendentes sem avançar seu cursor durável. Use `receive()` ou `receiveOne()`
quando o workflow estiver pronto para consumir mensagens e registrar o avanço
do cursor no histórico.

```php
use Workflow\V2\Workflow;

final class ApprovalInboxWorkflow extends Workflow
{
    public function handle(): array
    {
        $pending = $this->inbox('approval.requests')->peek(limit: 10);

        if ($pending->isEmpty()) {
            return ['status' => 'waiting'];
        }

        $message = $this->inbox('approval.requests')->receiveOne();

        return [
            'status' => 'received',
            'payload_reference' => $message?->payload_reference,
            'correlation_id' => $message?->correlation_id,
        ];
    }
}
```

`peek()` é somente leitura. `receive()` e `receiveOne()` marcam mensagens como
consumidas e avançam o cursor durável de mensagens da execução atual. O avanço
do cursor é um fato do histórico, permitindo que o replay, as exportações do
Waterline e a transferência continue-as-new determinem quais mensagens de
entrada já foram consumidas.

## Envio de referências {#sending-references}

Use `outbox(...)->sendReference(...)` quando um workflow precisar publicar uma
mensagem de saída ordenada. A tabela de mensagens armazena metadados de
roteamento e uma referência ao payload. Conteúdo grande ou pertencente à
aplicação permanece no armazenamento de payloads dela.

```php
use Workflow\V2\Workflow;

final class AssistantReplyWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId, string $replyReference): array
    {
        $message = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: $replyReference,
            correlationId: $this->workflowId(),
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $message->stream_key,
            'sequence' => $message->sequence,
        ];
    }
}
```

Isso mantém o histórico do workflow pequeno e permite que consumidores validem
o armazenamento de payloads separadamente da ordenação durável de mensagens.

## Continuar como novo {#continue-as-new}

Fluxos de mensagens priorizam a instância. Quando um workflow continua como
novo, mensagens de entrada pendentes e a posição do cursor são transferidas
para a nova execução. Mensagens consumidas permanecem vinculadas à execução
original como evidência histórica.

Assim, um workflow de longa duração pode descartar o histórico e manter a
mesma rota pública de mensagens:

```php
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

final class HumanInputLoopWorkflow extends Workflow
{
    public function handle(int $iteration = 0): array
    {
        $message = $this->inbox('human.replies')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting', 'iteration' => $iteration];
        }

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return [
            'status' => 'processed',
            'iteration' => $iteration,
            'payload_reference' => $message->payload_reference,
        ];
    }
}
```

O chamador continua endereçando o ID da instância de workflow. Ele não precisa
saber qual execução detém o cursor do fluxo no momento.

## Regras de autoria {#authoring-rules}

- Use chaves semânticas de fluxo, como `ai.assistant`, `human.replies` ou
  `approval.requests`. Trate-as como parte do contrato público do workflow.
- Use `peek()` para inspeção e `receive()` / `receiveOne()` para consumo durável.
- Use `sendReference()` para mensagens de saída. Armazene payloads grandes no
  armazenamento de payloads da aplicação e passe uma referência.
- Mantenha o código da aplicação em `Workflow::inbox()`, `Workflow::outbox()` e
  `MessageStream`. Não dependa de `MessageService`, `WorkflowMessage` ou
  gravações de linhas de cursor como padrão de autoria.
- Para eventos externos únicos, use [Sinais](./signals.md). Para alterações de
  estado com requisição e retorno, use [Atualizações](./updates.md). Use fluxos
  de mensagens quando mensagens repetidas e ordenadas precisarem de semântica de cursor.

## Execute este padrão {#run-this-pattern}

O workflow de agente de viagens no
[aplicativo de exemplo](/docs/sample-app) é a referência executável para o
formato de entrada e saída descrito nesta página:

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` armazena payloads grandes do assistente na tabela
`ai_workflow_messages` da própria aplicação e publica apenas uma referência
durável na saída `ai.assistant`. Respostas chegam pelo fluxo de entrada
correspondente por meio da atualização `receive`. Leia a classe do workflow
junto com esta página para ver, de ponta a ponta, as mesmas chamadas
`inbox()` / `outbox()` / `sendReference()` usadas nos trechos acima.
