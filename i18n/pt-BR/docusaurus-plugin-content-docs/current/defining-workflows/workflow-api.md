---
sidebar_position: 6
title: API de workflow
sidebar_label: API de workflow
description: Referência da API de workflow.
tags:
  - reference
  - workflows
  - api
keywords:
  - API de workflow
---

# API de workflow {#workflow-api}

Esta página contém a referência completa. Para uma leitura mais acessível, consulte a página de cada recurso.

- [Workflows](./workflows.md) para a estrutura da classe de workflow e o modelo
  de orquestração determinística.
- [Atividades](./activities.md) para efeitos externos, novas tentativas e roteamento.
- [Atividades locais](../features/local-activities.md) para trabalhos curtos de
  atividade no mesmo processo, com histórico de atividade e semântica de novas tentativas.
- [Sinais](../features/signals.md), [Atualizações](../features/updates.md) e
  [Consultas](../features/queries.md) para contratos da interface do workflow.
- [Temporizadores](../features/timers.md),
  [Esperas por condição](../features/condition-waits.md) e
  [Continuar como nova execução](../features/continue-as-new.md) para fluxo de
  controle de longa duração.
- [Fluxos de mensagens](../features/message-streams.md) para mensagens repetidas
  e ordenadas com semântica de cursor.

## Mais informações para IA {#more-info-for-ai}

A maioria dos leitores pode pular a seção expansível abaixo. Abra-a quando
precisar de assinaturas exatas, contratos de retorno, notas utilizáveis por
máquinas ou a superfície completa da API em um só lugar.

<details id="workflow-api-details">
<summary><b>Mais informações para IA</b></summary>

**Objeto base de workflow**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| Membro | Quando usar | Contrato de retorno |
| --- | --- | --- |
| `workflowId()` | O workflow precisa de seu ID público estável de instância. | String do ID de instância, inalterada entre continuações como nova execução. |
| `runId()` | O workflow precisa do ID da execução em andamento. | String do ID da execução selecionada. |
| `lastChild()` | O workflow precisa enviar um sinal ao filho iniciado mais recentemente. | `ChildWorkflowHandle` ou `null`. |
| `children()` | O workflow precisa de referências dos filhos visíveis à sequência atual de replay. | Lista de `ChildWorkflowHandle`. |
| `historyLength()` | O workflow precisa de uma indicação de orçamento de histórico baseada em contagem. | Contagem atual de eventos do histórico. |
| `historySize()` | O workflow precisa de uma indicação de orçamento de histórico baseada em bytes. | Tamanho aproximado do histórico persistido em bytes. |
| `shouldContinueAsNew()` | O workflow deve iniciar outra execução antes que o histórico fique caro. | `true` quando os orçamentos de histórico configurados recomendam essa troca. |

## Comandos duráveis {#durable-commands}

A fachada estática delega aos auxiliares no namespace `Workflow\V2`. As duas
formas são equivalentes:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| Fachada | Auxiliar | Assinatura | Efeito durável |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | Agenda uma atividade e aguarda seu resultado. |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | Alias de `activity()`. |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | Executa uma atividade curta no processo atual do worker de workflow e registra histórico de atividade com `execution_mode=local`. |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | Alias de `localActivity()`. |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Inicia um workflow filho e aguarda seu resultado. Passe um `ChildWorkflowOptions` como primeiro argumento para definir a política de fechamento do pai (padrão `ParentClosePolicy::Abandon`) ou substituir o roteamento do filho. |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Alias de `child()`. |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | Executa uma função chamável como workflow filho gerado automaticamente. |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | Aguarda chamadas concorrentes e retorna os resultados na ordem de iteração. |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | Alias de `all()`. |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | Inicia chamadas duráveis independentes e retorna a primeira vencedora confirmada, além de referências estáveis para todos os membros. |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | Aguarda um sinal nomeado ou uma condição segura para replay. |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | Aguarda um sinal ou condição com um limite de tempo explícito. |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | Aguarda um sinal nomeado. |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | Suspende até que o tempo durável avance. |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | Registra um resultado não determinístico no histórico e o retorna no replay. |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | Gera um UUIDv4 estável no replay. |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | Gera um UUIDv7 estável no replay. |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | Encerra a execução atual e inicia uma nova execução para a mesma instância. |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | Negocia uma versão de código de workflow segura para replay. |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | Retorna se a execução passou por um marcador de patch nomeado. |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | Mantém um marcador de patch ativo após a remoção do código antigo. |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | Atualiza metadados não indexados da execução. |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | Atualiza metadados indexados visíveis ao operador. |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | Lê o tempo determinístico do workflow. |

`activity()` e `executeActivity()` agendam tarefas duráveis de atividade em fila.
`localActivity()` e `executeLocalActivity()` executam no processo atual do worker
de workflow e registram histórico normal de atividade com o marcador local. Use
`sideEffect()` para snapshots seguros para replay que não devam usar semântica
de novas tentativas, limite de tempo, heartbeat ou cancelamento de atividade.
Use `Workflow::workerSession()` ou `Workflow\V2\workerSession()` quando várias
etapas comuns de atividade precisarem do contrato suportado de afinidade de
sessão de worker. Consulte
[Modelo de execução de atividades](/docs/features/activity-execution-model),
[Atividades locais](/docs/features/local-activities) e
[Sessões de worker](/docs/features/worker-sessions) para o contrato completo
de execução.

**Auxiliares de temporizador**

Os auxiliares de temporizador são atalhos para `timer()` e `Workflow::timer()`:

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| Auxiliar | Equivalente |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

Use chamadas explícitas de `timer()` quando a duração vier da configuração ou
da entrada do workflow. Use auxiliares de temporizador quando o código-fonte
deva expressar uma espera fixa de negócio.

**Fluxos de mensagens**

Abra fluxos duráveis de mensagens a partir da instância do workflow:

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| Método | Assinatura | Contrato |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Abre o fluxo para leitura ou envio. |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias para código de recebimento. |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias para código de envio. |
| `MessageStream::key()` | `key(): string` | Retorna a chave do fluxo. |
| `MessageStream::cursor()` | `cursor(): int` | Retorna a posição durável do cursor para esta execução. |
| `MessageStream::hasPending()` | `hasPending(): bool` | Retorna se há mensagens não consumidas no fluxo. |
| `MessageStream::pendingCount()` | `pendingCount(): int` | Retorna o número de mensagens não consumidas no fluxo. |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | Lê mensagens pendentes sem consumi-las. |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | Lê e consome mensagens, registrando o avanço do cursor. |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | Lê e consome uma mensagem. |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | Envia uma mensagem ordenada com referência de payload a outra instância de workflow. |

Use fluxos de mensagens para mensagens repetidas e ordenadas com semântica de
cursor. Use [Sinais](../features/signals.md) para eventos externos pontuais e
[Atualizações](../features/updates.md) para mutações com solicitação e retorno.

**Atributos e contratos públicos**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| Atributo | Alvo | Contrato estável |
| --- | --- | --- |
| `#[Type('type-key')]` | Classe de workflow ou atividade | Declara a chave de tipo durável independente de linguagem. |
| `#[Signal('signal-name', [...])]` | Classe de workflow, repetível | Declara nomes de sinais aceitos e contratos opcionais de parâmetros ordenados. |
| `#[QueryMethod('query-name')]` | Método de workflow | Declara um nome de consulta seguro para replay. Omita o nome para usar o nome do método PHP. |
| `#[UpdateMethod('update-name')]` | Método de workflow | Declara um nome de atualização seguro para replay. Omita o nome para usar o nome do método PHP. |

Sinais, consultas e atualizações são contratos públicos do workflow. Prefira
nomes explícitos para que renomear métodos PHP não quebre a API.

**Superfície de falhas**

Falhas na API de autoria são falhas duráveis do workflow, a menos que o comando
seja rejeitado antes da execução:

| Superfície | Falha típica | Significado para o operador |
| --- | --- | --- |
| `activity()` | A atividade lança uma exceção, excede o limite de tempo ou esgota a política de tentativas. | A execução registra o histórico de falha da atividade e segue o tratamento de erros do workflow. |
| `child()` | O workflow filho falha, é cancelado, é terminado ou excede o limite de tempo. | O pai observa um resultado de falha do filho no comando em espera. |
| `await()` | O limite de tempo expira antes que a condição seja satisfeita ou o sinal recebido. | A espera retorna ou falha de acordo com a forma de await selecionada. |
| `timer()` | Entrada de duração inválida após a normalização. | O código deve passar durações positivas ou esperas explícitas de duração zero. |
| `continueAsNew()` | Não é possível criar a nova execução. | A execução atual permanece como ponto de evidência da transição que falhou. |
| `upsertSearchAttributes()` | Chave, contagem ou tamanho total dos atributos excede os limites. | A execução falha antes que metadados indexados inválidos sejam persistidos. |
| `MessageStream::receive()` | Não há sequência positiva de histórico do workflow disponível. | O recebimento deve ocorrer na execução do workflow, não diretamente no código de serviço. |
| `MessageStream::sendReference()` | A referência de payload, a rota ou o contrato de armazenamento é inválido em uma etapa posterior. | A ordenação de mensagens permanece separada da integridade do armazenamento de payloads. |

Para limites de payload e histórico, consulte [Limites estruturais](../constraints/structural-limits.md).
Para respostas de rejeição de comandos fora do código PHP do workflow, consulte
[Referência da API do Server](../polyglot/server-api-reference.md).

**Regras de determinismo**

O código do workflow deve ser seguro para replay. Mantenha trabalhos
irreversíveis ou não determinísticos atrás de comandos duráveis:

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- Use `Workflow::now()` em vez do relógio do sistema nas ramificações do workflow.
- Use `Workflow::uuid4()` ou `Workflow::uuid7()` em vez de aleatoriedade direta.
- Coloque chamadas de rede, gravações no sistema de arquivos, envio de e-mails
  e efeitos externos em atividades.
- Use `Workflow::sideEffect()` apenas quando o valor precisar ser capturado no
  histórico e o efeito em si não for a ação de negócio.
- Use `Workflow::getVersion()`, `Workflow::patched()` e
  `Workflow::deprecatePatch()` para evoluir o código do workflow sem quebrar o replay.

</details>
