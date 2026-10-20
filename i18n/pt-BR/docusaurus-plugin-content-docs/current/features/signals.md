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

## Após uma resposta incerta {#after-an-uncertain-response}

Um tempo limite ou uma resposta perdida pode ocorrer depois da admissão
durável de um sinal. Uma resposta posterior de execução encerrada ou não
encontrada descreve essa requisição posterior; ela não estabelece se o sinal
original foi aplicado. Uma verificação de status antes do envio também deixa
um intervalo no qual o workflow pode encerrar ou continuar como novo.

Preserve o namespace, a identidade do workflow, o nome do sinal, os argumentos
e a chave de operação da aplicação originais ao investigar uma entrega incerta.
Repetir um sinal exige seguir o contrato real do destino para tratamento de
duplicatas. Não inicie um workflow substituto apenas porque a repetição foi recusada.

Consulte [recuperação de um comando incerto](./updates.md#recover-after-an-uncertain-response)
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
`WorkflowExecutionSignaled` surgir no momento em que o sinal é aceito.
