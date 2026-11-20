---
sidebar_position: 1
title: Sinais
description: Envie comandos externos tipados a workflows em execução e entenda a validação, o roteamento e as esperas por sinais.
tags:
  - comandos
  - sinais
  - intervenção-humana
keywords:
  - sinais de workflow
  - comando de sinal
  - workflow com intervenção humana
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Sinais {#signals}

Sinais permitem acionar eventos em um workflow a partir de fora dele. Isso é útil para reagir a eventos externos, permitir intervenções humanas ou indicar a conclusão de uma tarefa externa. Para entradas repetidas e ordenadas com avanço durável de cursor, use [Fluxos de mensagens](./message-streams.md).

## Fronteira do namespace {#namespace-boundary}

Um sinal comum tem como destino um workflow no namespace do cliente. O handle de um filho também preserva o namespace original. Use uma [operação de serviço](./service-operations.md) para uma operação publicada em outro namespace. Alterar um id de workflow ou uma fila não concede autoridade entre namespaces.

## Aceitação e encerramento {#acceptance-and-closure}

`signal_received` confirma a aceitação durável. Não confirma que o código do
workflow processou o sinal. Inspecione o status retido e o histórico do sinal
quando a operação de negócio precisar de confirmação.

Com o Core 2.7.0 ou um Server compatível, sinais elegíveis aceitos durante uma
tarefa remota de workflow recebem uma oportunidade de entrega antes do
encerramento bem-sucedido. Sinais recebidos endereçados à instância e declarados
em seu contrato de comandos são transferidos ao [continuar como novo](./continue-as-new.md),
com identidade, argumentos e ordem originais. Um sinal endereçado a uma
execução específica nunca passa para outra execução.

Execuções sem uma declaração durável de sinal não a adquirem por um registro
posterior de worker. Se o runtime não conseguir estabelecer a entrega, o sinal
aceito é encerrado com a rejeição explícita abaixo.

Se uma execução encerrar sem aplicar um sinal, o status dele passa a `rejected`
com `run_closed_before_signal_applied`, um horário de encerramento e um evento
`SignalRejected` no histórico. Isso inclui sinais em buffer não usados na
conclusão normal e sinais que não puderam ser aplicados antes de falha,
cancelamento ou tempo limite. O recibo anterior de aceitação continua válido.
Use uma [atualização](./updates.md) quando o chamador precisar de um resultado
de processamento retido, além da aceitação.

Antes de atualizar um escritor para o Core 2.7.0, drene e atualize todos os
leitores embarcados ou com acesso direto ao banco, incluindo o Waterline quando
ele lê o mesmo banco. Leitores antigos não conseguem decodificar `SignalRejected`.
Não os deixe executando contra o novo escritor nem reverta um leitor depois
que esse evento tiver sido armazenado.

## Esperas por sinais nomeados {#named-signal-waits}

Um workflow chama `await('signal-name')` diretamente. O próximo comando de sinal aceito com esse nome retoma a execução e retorna um valor determinístico ao workflow suspenso.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Acione o sinal em PHP endereçando o ID público da instância:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Comportamento dos sinais:

- Declare antecipadamente cada nome de sinal externo com um atributo de classe repetível `#[Signal('signal-name')]`. Opcionalmente, inclua um contrato ordenado de parâmetros.
- Comandos de sinal direcionam o ID público da instância de workflow, e não um ID de execução. Assim, cadeias continue-as-new mantêm a mesma rota pública de sinal.
- Com um contrato de parâmetros, a entrada rejeita payloads inválidos como `rejected_invalid_arguments`, com `validation_errors` legíveis por máquina.
- Sem contrato, `await('name')` retorna `true` quando nenhum argumento foi enviado, o argumento único quando um foi enviado ou o array completo de argumentos quando vários foram enviados.
- Nomes de sinal desconhecidos são rejeitados como `rejected_unknown_signal`. Sinais para uma instância encerrada ou ainda não iniciada são rejeitados como `rejected_not_active` ou `rejected_not_started`.

## Iniciar e sinalizar em uma única operação {#signal-with-start}

`signalWithStart()` inicia o workflow ou reutiliza sua execução aberta e
registra o sinal nessa execução, em uma única transação. Um `start()` separado
seguido de `signal()` deixa um intervalo no qual a execução pode encerrar e o
sinal é recusado:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::make(OrderApprovalWorkflow::class, 'order-123')
    ->signalWithStart('approved-by', ['approvedBy' => 'Taylor'], StartOptions::returnExistingActive());

$result->startOutcome(); // "started_new" or "returned_existing_active"
```

Quando a execução atual foi encerrada, o signal-with-start embarcado inicia uma
nova execução após ela, e a execução encerrada mantém seu resultado. Clientes no
modo de serviço usam o signal-with-start do Server, que exige o Server nativo
3.15.0 ou posterior e recusa uma execução encerrada, a menos que o chamador peça
uma nova. Consulte [signal-with-start](/docs/polyglot/workflow-signals#signal-with-start)
para as chamadas dos SDKs PHP, Python e Rust.

## Sinalizar outro workflow {#signal-another-workflow}

:::note Experimental
O signal-external durável para workflows embarcados está disponível desde o
Workflow 2.35.0. Sua API é experimental.
:::

O código do workflow pode enviar um sinal a outro workflow em seu namespace com
`signalExternalWorkflow()`. Este workflow registra a requisição uma única vez e
aguarda. Depois que isso é confirmado, o runtime admite o sinal no destino e
registra o resultado no histórico deste workflow, tentando novamente em caso de
conflitos de banco de dados em vez de fazer qualquer um dos workflows falhar. O
replay retorna o resultado registrado sem enviar novamente:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\signalExternalWorkflow;

#[Type('order-approver')]
final class OrderApproverWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $result = signalExternalWorkflow($orderId, 'approved-by', ['Taylor']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

- Um destino ausente, encerrado ou que recusa o sinal é um `ExternalSignalResult`
  retornado, não uma exceção. Os resultados e motivos são os mesmos do Server,
  listados no [guia do modo de serviço](/docs/polyglot/workflow-signals#signal-another-workflow).
- Passe um ID de execução como quarto argumento para sinalizar apenas essa
  execução. O handle de um filho tem `signalDurably()`, por exemplo
  `$this->lastChild()->signalDurably('approved-by', 'Taylor')`. O `signal()` do
  handle continua enviando diretamente, fora do histórico do pai, e pode enviar
  novamente quando o pai faz replay.
- No destino, ele é um sinal comum atribuído à execução remetente, com a chave
  `workflow-signal:<sender run id>:<sequence>`. Aplicações não podem usar esse
  prefixo de ID de requisição.
- O nome do sinal segue as regras do Server (não pode estar em branco, sem
  caracteres de controle, no máximo 191 caracteres e 255 bytes). Um nome
  recusado lança `InvalidExternalSignalException` no código do workflow antes de
  qualquer registro.
- Alterar o destino, a execução, o nome do sinal ou os argumentos em uma etapa
  registrada bloqueia o replay como divergência no formato do histórico.

Sinais permanecem dentro do namespace. Use uma
[operação de serviço](./service-operations.md) para alcançar outro namespace. Use
uma atividade quando precisar de signal-with-start a partir do código do
workflow, e dê a ela um ID de requisição estável para que uma nova tentativa da
atividade não envie o sinal duas vezes.

## Evoluir um payload de sinal com compatibilidade {#evolve-a-signal-payload}

Use um único argumento de mapa declarado para um payload da aplicação que precise de acréscimos compatíveis. Este exemplo mantém `schema_version: 1` ao adicionar a `note` opcional e informativa. Um emissor antigo a omite; um leitor mais recente usa `null`. Um leitor anterior pode ignorá-la sem mudar a decisão de aprovação. Não use um campo ignorado para uma alteração que deva afetar a autorização ou o comportamento de negócio.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

Os dois emissores usam o mesmo parâmetro declarado `payload`:

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

A declaração verifica o argumento externo. Um escalar no lugar de `payload` é recusado na admissão. O tipo `array` não valida campos aninhados nem distingue uma lista PHP de um mapa com chaves de texto. O workflow verifica essas regras da aplicação antes do trabalho de negócio. Uma versão não suportada ou uma `note` inválida pode, portanto, ser aceita de forma durável e depois produzir `rejected_payload` como resultado do workflow. Esse resultado é distinto do recibo `signal_received`.

Mantenha os campos obrigatórios e seus significados estáveis. Defina se um valor ausente e um `null` explícito significam a mesma coisa; neste exemplo, sim para `note`. Preserve os decodificadores dos valores antigos registrados. Uma mudança incompatível de formato ou significado exige uma nova versão da aplicação e um plano explícito de compatibilidade, não apenas mais um campo opcional.

Uma execução mantém as declarações e os valores padrão de sinais registrados no início. Alterar a assinatura ou um valor padrão do handler atual não reescreve esse contrato. Adicionar outro argumento de sinal no nível superior é diferente de adicionar uma chave ao mapa existente. Não suponha que uma execução antiga o aceite ou adote o novo padrão. Novas execuções podem registrar uma nova declaração enquanto as antigas mantêm a original.

Esse formato da aplicação é separado do [esquema de transporte Avro Value](/docs/polyglot/avro-value-protocol), que é fixo. Clientes PHP, Python e Rust em modo de serviço codificam mapas, listas e escalares suportados por meio de seus SDKs. Uma dataclass Python, um objeto de domínio PHP ou uma struct Rust precisa do adaptador de valores explícito correspondente. Um campo de versão da aplicação não é um registro de esquemas. Consulte as [referências dos SDKs](/docs/sdk-neutrality) para as APIs do modo de serviço.

A compatibilidade de payload também não autoriza uma definição modificada de workflow a assumir uma execução existente. Mantenha disponível o worker ou build compatível necessário. A restrição de impressão digital do código-fonte do Server 2.9.7 é acompanhada separadamente em [Server #518](https://github.com/durable-workflow/server/issues/518). Esta receita não contorna essa restrição nem promete que um handler atual substitua o código da execução antiga. Use [versionamento de workflows](./versioning.md) para alterações de código seguras durante o replay, dentro do contrato de roteamento suportado pelo runtime.

O mesmo limite dos valores registrados se aplica aos argumentos e resultados de atividades: novas tentativas e replay podem encontrar formatos antigos. Mantenha os adaptadores compatíveis com esses valores em vez de reescrever o histórico ou depender dos valores padrão atuais do modelo.

## Após uma resposta incerta {#after-an-uncertain-response}

Um tempo limite ou uma resposta perdida pode ocorrer depois da admissão
durável de um sinal. Uma resposta posterior de execução encerrada ou não
encontrada descreve essa requisição posterior; ela não estabelece se o sinal
original foi aplicado. Uma verificação de status antes do envio também deixa
um intervalo no qual o workflow pode encerrar ou continuar como novo.

Preserve o namespace, a identidade do workflow, o nome do sinal, os argumentos
e a chave de operação da aplicação originais ao investigar uma entrega incerta.
Não inicie um workflow substituto apenas porque a repetição foi recusada.

### Repita com a mesma chave de comando {#retry-with-the-same-command-key}

Uma chave de comando torna a própria repetição segura. Escolha uma chave para
cada sinal lógico, como `approve-order-123`, e salve-a no registro da operação
antes do envio. Com o Workflow 2.18.0 ou posterior, anexe-a com
`withRequestId()`. Após uma resposta perdida, envie o mesmo sinal novamente com
a mesma chave, o mesmo nome, os mesmos argumentos e o mesmo destino:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('approve-order-123')
    ->attemptSignalWithArguments('approved-by', ['approvedBy' => 'Taylor']);

if ($result->requestIdConflict()) {
    // The key already names a different signal. Nothing was recorded.
    $retainedCommandId = $result->conflict()['retained_command_id'];
} elseif ($result->retained() && ! $result->intentVerified()) {
    // A legacy receipt: the original admission, not proof that this retry matches it.
} else {
    $result->commandId(); // The same signal command on every matching retry.
}
```

- Uma repetição com a mesma chave, o mesmo nome de sinal, os mesmos argumentos
  tipados e o mesmo destino de execução explícito retorna o recibo original e
  não registra nada. `retained()` é verdadeiro. Isso também funciona depois que
  a execução foi encerrada ou continuou como nova, enquanto o comando original
  estiver retido.
- A mesma chave com nome, argumentos ou destino de execução diferentes é
  recusada: `requestIdConflict()` é verdadeiro e `outcome()` é
  `rejected_request_id_conflict`. `conflict()` identifica o comando retido e as
  partes que diferem. Nada é registrado, e a chave mantém seu recibo original.
  Envie a entrada original para ler esse recibo ou use uma nova chave para uma
  nova entrada.
- Um recibo admitido antes de o Workflow registrar a intenção do comando é lido
  com `retained()` verdadeiro e `intentVerified()` falso. Essa é a admissão
  original, não uma prova de que os argumentos desta repetição correspondem a
  ela. Verifique suas identidades antes de tratá-lo como o seu sinal.
- As chaves têm de 1 a 255 caracteres Unicode e são comparadas exatamente, sem
  equivalência de maiúsculas e minúsculas nem normalização. Uma chave vazia,
  longa demais ou com UTF-8 inválido lança `InvalidCommandRequestIdException`
  antes da admissão. Um sinal enviado sem chave é sempre um novo sinal.

Antes de atualizar, aplique a migração `intent_digest` do Workflow e, em
seguida, esvazie e atualize juntos todos os gravadores do banco de dados
embarcado. Versões anteriores não comparam a intenção: nelas, uma chave de sinal
repetida registra um segundo sinal.

Clientes no modo de serviço enviam a chave como `request_id` no corpo. O Server
nativo 3.9.2 e posteriores aplicam as mesmas regras e acrescentam uma recusa
`request_id_ambiguous` para algumas chaves legadas. Consulte
[chaves de comando de sinais e atualizações](/docs/polyglot/server-api-reference#command-keys)
para o contrato HTTP e as chamadas em PHP, Python, Rust e CLI.

Uma chave de comando admite o sinal uma única vez. Ela não faz com que as
atividades disparadas pelo sinal sejam executadas exatamente uma vez. Consulte
[recuperação de um comando incerto](./updates.md#recover-after-an-uncertain-response)
para inspecionar atualizações retidas e realizar a reconciliação sob responsabilidade da aplicação.

## Identidade do remetente e autorização {#sender-identity-and-authorization}

`approvedBy` é um dado da aplicação. A string `Taylor` do exemplo não comprova
um remetente autenticado. Um contrato `#[Signal]` valida o nome do sinal e os
argumentos. Sua aplicação Laravel deve autenticar o chamador e autorizar a
operação antes de admitir o sinal.

Por exemplo, um endpoint de aprovação pode usar o usuário autenticado e uma
política de pedido. Esta aplicação define um modelo `Order` com os campos
armazenados `workflow_instance_id` e `workflow_namespace`, e registra uma
política `approve` que verifica o acesso do usuário ao pedido. O endpoint não
obtém o autor nem os valores de roteamento do workflow a partir do corpo da requisição:

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

A política é verificada antes de carregar o workflow ou enviar o sinal. Todo
ponto de entrada de aprovação deve aplicar a mesma política da aplicação,
incluindo endpoints de webhook ou administrativos que possam enviar esse
sinal. Dentro do workflow, `await('approved-by')` recebe o argumento registrado;
não retorna um objeto de remetente autenticado nem faz outra verificação de permissão.

A identidade de auditoria do comando é separada desse argumento.
`withCommandContext()` registra o contexto no `WorkflowCommand` identificado
por `commandId()`. Seu `context.principal` e os acessores `principalType()`,
`principalId()` e `principalLabel()` permitem inspeção de auditoria no host.
O histórico vinculado e as telas do operador podem exibir a atribuição
registrada do comando. A ausência de atribuição não estabelece uma identidade de remetente.

`CommandContext::withPrincipal()` registra o que o código confiável do host
fornece. Não autentica um usuário nem autoriza um sinal. Mantenha esse contexto
fora das entradas controladas pelo chamador e não use uma sessão HTTP ativa
nem consulte permissões atuais no banco dentro do replay determinístico do workflow.

Chamadas dos SDKs no modo de serviço usam o limite de autorização HTTP do
Server em vez dessa rota embarcada. Consulte
[Autorização e atribuição de sinais](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution)
para conhecer credenciais, gateways confiáveis e identidade de auditoria.

<SignalSimulator />

**Importante:** A função `await()` deve ser usada apenas em um workflow, nunca em uma atividade.

Para esperar até que um predicado sobre o estado durável se torne verdadeiro, consulte [Esperas por condição](./condition-waits.md). Para `await` com tempo limite, consulte [Sinal + temporizador](./signal+timer.md). Para fluxos repetidos de entrada e saída, consulte [Fluxos de mensagens](./message-streams.md).

## Execute este padrão {#run-this-pattern}

O workflow iniciado por webhook no
[aplicativo de exemplo](/docs/sample-app) é a referência executável para o
padrão de espera por sinal nomeado desta página:

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` inicia por uma entrada de webhook
HTTP e fica suspenso em `await('ready')` até chegar o sinal correspondente.
Abra o Waterline enquanto ele estiver suspenso para ver o evento
`SignalReceived` surgir no momento em que o sinal é aceito.
