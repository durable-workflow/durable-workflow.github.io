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

:::warning Fluxos de mensagens anteriores ao Workflow 2.20.3

O código do workflow passa por replay em cada tarefa de workflow posterior e em
cada consulta. Nas versões do Workflow até a 2.20.0, `outbox()->sendReference()`
grava uma nova mensagem de saída e uma nova mensagem de entrada a cada replay, e
`inbox()->receive()` e `receiveOne()` podem retornar uma mensagem diferente, ou
nenhuma, no replay
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).
O Workflow 2.20.1 registra envios e recebimentos para replay e impede que
consultas gravem ou consumam mensagens. Recebimentos vazios e fluxos mantidos
entre etapas precisam das correções adicionais de replay da versão 2.20.3,
descritas abaixo.

- As linhas que versões anteriores duplicaram não são removidas. Dê a cada envio
  lógico um `idempotencyKey` estável, como `reply:{turn}`, e elimine duplicatas
  por `idempotency_key` ao consumir um fluxo que uma versão anterior gravou. As
  mensagens que uma versão anterior consumiu sob a etapa errada permanecem
  consumidas.
- Sinais, atualizações e todos os fluxos compartilham um cursor de mensagens.
  Até a versão 2.20.2, um sinal, uma atualização ou um recebimento em outro
  fluxo pode avançá-lo para além de mensagens pendentes e ocultá-las
  ([workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)).
  Para esse caso de ordenação de sinais nessas versões, envie o sinal antes
  da mensagem e receba somente depois que um sinal ou condição indicar que há
  uma mensagem.

:::

## Atualizações de fluxos e reversão {#stream-upgrades}

No Workflow 2.20.3, o cursor compartilhado deixa de ocultar mensagens pendentes
de `receive()`, `receiveOne()`, `peek()`, `pendingCount()` e `hasPending()`.
Os recebimentos mantêm a ordem de sequência e seu limite de lote. Após a
atualização, um loop de recebimento pode retornar primeiro mensagens pendentes
antigas que o cursor compartilhado ocultava e depois as mais recentes.

Um recebimento em replay retorna o que sua etapa original consumiu. Se a
chamada original não encontrou nada, o replay volta a não retornar nada. Um
handler de atualização executado pela primeira vez continua podendo receber.
Um fluxo mantido em uma propriedade agora registra os recebimentos na etapa
atual do workflow, em vez da etapa em que o fluxo foi aberto. Recebimentos que
versões anteriores registraram na etapa de abertura continuam sendo
reproduzidos em replay.

Antes de reverter uma aplicação embutida para uma versão anterior à 2.20.3,
siga o [critério de replay](../testing.md#replay-before-deployment) com
históricos gravados pelo pacote mais recente. Versões anteriores procuram os
recebimentos de fluxos mantidos na etapa de abertura e podem fazer o replay
dessas execuções de outra forma. A reversão também restaura os erros do
cursor compartilhado, do replay de recebimentos vazios e da precisão do
processamento de tarefas fake. Veja as
[notas de compatibilidade da tag](https://github.com/durable-workflow/workflow/blob/2.20.3/CHANGELOG.md#2203---2026-11-04).

A limitação de consultas em
[workflow#1024](https://github.com/durable-workflow/workflow/issues/1024)
permanece: uma consulta pode não retornar uma mensagem recebida por um handler
de atualização porque faz o replay do handler na etapa errada. A consulta não
altera linhas de mensagens. O replay do próprio workflow e a saída da execução
concluída continuam retornando o que o handler recebeu.

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
novo, as mensagens de entrada pendentes passam para a nova execução, a posição
do cursor é levada adiante, e mensagens consumidas permanecem vinculadas à
execução original como evidência histórica. O Workflow 2.20.1 e anteriores
moviam só o cursor: mensagens ainda pendentes quando a execução continuava como
nova ficavam na execução encerrada, e a nova execução nunca as recebia
([workflow#1018](https://github.com/durable-workflow/workflow/issues/1018),
corrigido no 2.20.2). Nessas versões, receba as mensagens pendentes antes de
chamar `continueAsNew()`, ou envie entradas que precisam sobreviver à transição
como um [sinal](./signals.md): sinais aceitos que a execução ainda não aplicou
passam para a nova execução.

Assim, um workflow de longa duração pode iniciar uma nova execução com um
histórico menor e manter a mesma rota pública de mensagens:

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
