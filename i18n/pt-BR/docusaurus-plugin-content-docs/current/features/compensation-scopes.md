---
sidebar_position: 12
title: Escopos de compensação
description: Retenha obrigações de compensação além da execução de workflow que as criou e recupere-as depois que a execução for encerrada, em workflows incorporados ao Laravel.
---

# Escopos de compensação {#compensation-scopes}

Este guia explica a compensação retida em workflows incorporados ao Laravel que usam `Workflow\V2\Workflow`. Uma [saga](sagas.md) compensa dentro da execução que a registrou. Um escopo de compensação mantém cada obrigação em um registro durável (ledger), de modo que a obrigação ainda possa ser compensada depois que essa execução for concluída, falhar ou for cancelada.

Use um escopo quando o cancelamento puder chegar tarde, por exemplo depois que um workflow de envio foi concluído e o pedido correspondente é cancelado dias depois, ou quando uma operação de avanço puder ter efeito sem retornar um resultado registrado.

## Disponibilidade e estabilidade {#availability-and-stability}

| Parte | Status |
| --- | --- |
| `DurableScope`, `RegisteredObligation`, `Obligation`, `ScopeIdentity` | Estável desde a 2.33.0 |
| `ScopedOperation`, `OperationContext`, `ForwardResult`, `Resolution`, `HandlerRegistry`, `HandlerContractViolation` | Estável desde a 2.33.0 |
| `ScopeAuthorization`, `ScopeAuthorizationRefused`, `ScopeRecovery::request()`, `ScopeRecovery::describe()`, `ScopeRetention::release()` | Estável desde a 2.33.0 |
| `DurableScope::reserveChild()` e admissão de raiz (`RootReservationStore`) | Experimental |
| Classes marcadas como `@internal` (atividades, persistência, motor de recuperação) | Não fazem parte da API pública |

As APIs de escopo foram lançadas inicialmente como experimentais na 2.29.0. A recuperação automática depois que a execução de origem é encerrada, o cronograma de novas tentativas da recuperação e `describe()` chegaram na 2.31.0. Os resultados de handler revisados (`failed()`, `rejected()` e `HandlerContractViolation`) chegaram na 2.32.0. Desde a 2.33.0, as partes marcadas como estáveis seguem a [política de compatibilidade 2.x](../compatibility.md). As partes experimentais ainda podem mudar em uma versão secundária. O suporte inicial se limita ao Laravel incorporado e à compensação sequencial.

## Como funciona {#how-it-works}

Um escopo é identificado por `(application, namespace, key, generation)`. Seu trabalho de avanço pertence a uma única execução de origem, então escolha uma geração exclusiva dessa execução. Cada obrigação é registrada, junto com sua compensação, antes que seu efeito de avanço seja despachado. O registro durável armazena:

- um tipo e uma versão de handler fechados, nunca uma closure PHP;
- um ID de operação estável, que o handler usa para reconciliar o provedor;
- entrada portável (no máximo 15.360 bytes como JSON, 500 valores e profundidade 7);
- resultados de avanço e de compensação, com referências de evidência.

Enquanto a execução de origem está aberta, cancelá-la executa a saga nativa, que compensa em ordem inversa à de registro. Depois que a execução é encerrada, um workflow de recuperação canônico compensa as mesmas obrigações a partir do registro durável. Ele nunca reabre a execução original nem altera o histórico dessa execução.

## Configurar o host {#set-up-the-host}

Vincule uma política de autorização de escopo e um registro fechado de handlers em um service provider. A política retorna sua versão de política. Para recusar, ela lança `ScopeAuthorizationRefused`.

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` é chamado com `register`, `forward`, `compensate`, `participate`, `request`, `release` ou `inspect`. Recuse qualquer outro nome de operação. Somente `ScopeAuthorizationRefused` é uma recusa permanente. Qualquer outra exceção é tratada como transitória: ela é repetida, e a recuperação automática tenta novamente mais tarde. Derive o principal de uma política confiável da aplicação, nunca do payload de uma requisição. Execute as migrations do pacote; elas criam as tabelas do registro durável na conexão de armazenamento do workflow.

Identificadores (aplicação, chave, geração, chave de operação e versão do handler) usam de 1 a 128 caracteres de `A-Z a-z 0-9 . _ : / -` e começam com uma letra ou um dígito. Tipos de handler usam `a-z 0-9 . _ -`, começam com uma letra minúscula e não podem começar com `dw.`, que é reservado para o motor.

## Registrar obrigações em um workflow {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` registra a obrigação e depois executa sua operação de avanço.
- `register()` apenas registra e retorna um `RegisteredObligation`. Chame o `execute()` dele mais tarde no mesmo workflow quando a ordem de compensação precisar ser diferente da ordem de despacho.
- `participate()` registra um escopo filho. A compensação sequencial aguarda o registro durável verificado desse filho antes de compensar obrigações anteriores do pai. Um filho ausente ou não verificado interrompe o trabalho anterior do pai.

## Escrever um handler {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId]);
    }
}
```

Handlers podem ser executados mais de uma vez para a mesma operação, então torne os dois métodos idempotentes por `operationId`.

- `execute()` retorna `ForwardResult::observed()` com evidência, `unknown()` quando o resultado do provedor for incerto, ou `rejected()` quando o provedor com certeza não produziu nenhum efeito. Um avanço rejeitado faz a chamada do workflow falhar com `scope_forward_rejected`, e sua compensação não precisa de nenhuma chamada ao provedor. Quando `$context->reconcileBeforeForward` for true, uma tentativa anterior pode ter produzido efeito; consulte a operação antes de emiti-la novamente.
- `compensate()` retorna `Resolution::verified()` somente com evidência de que o efeito foi desfeito e de que nenhum efeito de avanço tardio é possível. O retorno de um callback, um tempo limite ou uma execução encerrada não constituem essa evidência. Retorne `unknown()` para manter a obrigação não resolvida e permitir que as novas tentativas nativas sejam executadas, ou `failed()` quando a compensação com certeza não puder ser concluída. Quando `$context->forwardOutcomeUnconfirmed` for true, o efeito de avanço nunca foi confirmado e ainda pode chegar tarde.
- Um resultado inválido, como `verified()` sem evidência, um motivo inválido ou um valor do resultado de avanço acima do limite, lança `HandlerContractViolation`. O motor registra o resultado como desconhecido, de modo que a compensação ainda reconcilia a operação, e faz a atividade falhar com o erro sem novas tentativas `scope_handler_contract_violation` seguido da mensagem da violação. Ele não passa por novas tentativas como um resultado desconhecido do provedor.
- Handlers escritos para a 2.31.0 ou anterior podem passar um segundo argumento para `verified()`. `verified($evidence, true)` ainda verifica e emite um aviso `E_USER_DEPRECATED`; `verified($evidence, false)` retorna `unknown('late-forward-possible')`. Remova o segundo argumento.

## Cancelar e recuperar {#cancel-and-recover}

Solicite a compensação com uma chave de requisição estável:

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- Se a execução de origem ainda estiver aberta, a requisição pede que ela seja cancelada, e a saga dela compensa.
- Se essa execução for encerrada com o escopo ainda não verificado, o watchdog de tarefas encaminha a mesma requisição para a recuperação canônica na sua próxima passagem. Ele é executado nos loops dos workers de fila e em `workflow:v2:repair-pass`, e primeiro reautoriza o principal original. Passagens simultâneas ou uma requisição manual concorrente iniciam uma única execução de recuperação.
- Se a execução já estiver encerrada, a requisição inicia a recuperação canônica diretamente.

As execuções de recuperação fazem até seis tentativas por compensação. Entre as tentativas, elas aguardam 1, 2, 5 e 10 segundos e, depois, o equivalente a uma concessão (lease) de atividade mais uma passagem de reparo de tarefas, para que a tentativa de um worker que travou seja recuperada antes da última tentativa. A verificação de um filho, ou uma nova requisição autorizada, desperta imediatamente uma nova tentativa em espera. Uma falha persistente ainda faz a execução de recuperação falhar, deixando a obrigação não resolvida.

Inspecione o resultado com `describe()`. Ele é somente leitura e exige autorização `inspect`. Ele sempre retorna as mesmas chaves. Os status vêm dos enums `ScopeStatus`, `NextAction`, `AutomaticRecovery` e `ObligationStatus`, e uma recusa é um `code` estável mais a `message` do host, que não é estável para processamento automático. Esses enums podem ganhar novos casos em uma versão secundária, então trate os valores que você não reconhecer com um ramo padrão:

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryRunId, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

`nextAction` é `submit_fresh_authorized_request` quando a recuperação automática foi recusada (`automaticRecovery: recovery_authorization_failed`) ou uma execução de recuperação falhou. Nesse caso, envie uma nova chave de requisição. Repetir uma chave de requisição retorna o recibo original e nunca inicia outra execução.

O registro durável do escopo liquida a compensação. Uma decisão de negócio, como marcar o pedido como `cancelled`, continua sendo uma etapa da sua aplicação depois que `scopeStatus` for `verified`. O padrão recomendado é um listener que finaliza o cancelamento de negócio quando uma execução de recuperação é concluída, como faz o exemplo de provedor no repositório do motor.

## Retenção, atualização e reversão {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` remove entradas retidas e resultados de avanço após a verificação. Ele mantém um marcador de exclusão (tombstone), para que uma geração ou chave de requisição antiga nunca mais possa ser aceita. Nada expira automaticamente, e a limpeza do histórico de execuções nunca remove o registro durável.
- Uma reversão de schema é recusada antes que qualquer migration execute `down()` enquanto o registro durável contiver qualquer escopo, inclusive um tombstone liberado. Para voltar atrás, restaure um backup do banco de dados feito antes da atualização.
- Fazer downgrade apenas do pacote mantém o registro durável. A recuperação é retomada depois que você atualizar novamente. Não faça downgrade enquanto houver uma execução de recuperação aberta.

## Garantias e limites {#guarantees-and-limits}

Desde a 2.33.0, as APIs estáveis não mudam de forma incompatível dentro da 2.x. Históricos de compensação registrados fazem replay em todas as versões 2.x posteriores, e novos comportamentos chegam apenas por trás de um marcador de versão registrado. As migrations do registro durável apenas adicionam.

Estes limites são mínimos que podem aumentar, mas não diminuirão:

- entrada de obrigação: 15.360 bytes como JSON, 500 valores e profundidade 7; valor do resultado de avanço: 11.264 bytes, 400 valores e profundidade 7 (escopos registrados antes da 2.32.0 mantêm para ambos o limite de envelope anterior, maior);
- 256 obrigações por escopo, incluindo até 16 participantes filhos, e um nível de aninhamento;
- 128 requisições por escopo, compartilhadas com as requisições filhas do motor;
- 32 referências de evidência de no máximo 128 bytes por resultado.

Não garantidos: o tempo do watchdog, os intervalos exatos entre novas tentativas (apenas que a recuperação dura mais que um reparo de concessão), o layout das linhas do registro durável e qualquer coisa marcada como `@internal`. Efeitos externos exatamente uma vez nunca são prometidos; a reconciliação com o provedor por ID de operação é responsabilidade do seu handler.

O [guia de escopos de compensação](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md) do repositório do motor documenta o contrato completo, incluindo as APIs experimentais de reserva de filhos e de admissão de raiz.
