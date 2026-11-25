---
sidebar_position: 3
---

# Atualizações {#updates}

Atualizações permitem obter informações sobre o estado atual de um workflow e alterá-lo ao mesmo tempo. Em essência, combinam uma consulta e um sinal em uma única operação.

## Comandos explícitos de atualização {#explicit-update-commands}

Cada atualização aceita:

- É uma chamada de requisição e resposta a um workflow em execução. `attemptUpdate*()` espera o handler terminar; `submitUpdate*()` retorna assim que o comando é aceito de forma durável e disponibiliza `inspectUpdate($updateId)` para consulta posterior.
- Usa o nome durável declarado da atualização no histórico de comandos e no roteamento de webhooks. `#[UpdateMethod('mark-approved')]` mantém o nome público estável entre renomeações do método PHP.
- É rejeitada em execuções históricas ou já encerradas, em vez de alterar silenciosamente a execução atual.
- Rejeita nomes de métodos não declarados como `rejected_unknown_update` e argumentos incompatíveis com o contrato como `rejected_invalid_arguments` (com `validation_errors` legíveis por máquina), antes de executar o handler.
- Rejeita como `update_validator_rejected`, antes de aceitá-la, uma solicitação que o seu [validador de atualização](#validate-updates-before-acceptance) recusa.

Assim como consultas, atualizações primeiro reproduzem o histórico confirmado. Diferentemente das consultas, atualizações podem alterar o estado do workflow seguro para replay e retornar um valor.

Para definir um método de atualização em um workflow, use a anotação `UpdateMethod`. O argumento string opcional permite fixar um nome público durável que permanece válido após renomeações do método PHP:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Chame o método de atualização diretamente quando quiser o valor de retorno bruto:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

Essa chamada PHP direta ainda usa o nome do método. O destino durável do comando continua sendo `mark-ready`.

Use `attemptUpdate()` quando também quiser o resultado do comando durável. Passe o nome durável da atualização:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` primeiro registra a atualização aceita e depois espera o worker de workflow aplicá-la e encerrar seu ciclo de vida antes de retornar. A espera é limitada por `workflows.v2.update_wait.completion_timeout_seconds`. Se o worker não tiver encerrado a atualização quando esse prazo expirar, `attemptUpdate()` retorna o ciclo de vida aceito com `waitTimedOut() === true` e `updateStatus() === 'accepted'`.

Use `withUpdateWaitTimeout()` quando uma chamada precisar de outro prazo de conclusão:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Use `attemptUpdateWithArguments()` quando o chamador já tiver uma lista posicional ou um mapa de parâmetros nomeados:

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Mapas nomeados são validados contra o instantâneo durável do contrato da atualização e normalizados na ordem da declaração antes da aceitação.

Use `submitUpdate()` ou `submitUpdateWithArguments()` quando o chamador precisar apenas de aceitação durável e puder deixar o worker de workflow aplicar a atualização depois:

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Use `inspectUpdate()` quando já tiver um `update_id` e quiser ler o ciclo de vida armazenado depois, sem esperar novamente:

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` não espera a execução do workflow. Recarrega o ciclo de vida durável armazenado e retorna o `UpdateResult` atual.

## Validar atualizações antes da aceitação {#validate-updates-before-acceptance}

Sem um validador, uma atualização que viola uma regra de negócio é aceita e depois falha. Ela é registrada como atualização com falha, e quem chama não consegue distinguir uma solicitação inválida de uma operação que falhou. Declare um validador para recusar a solicitação antes que ela seja aceita. Validadores exigem Workflow 2.42.0 ou posterior.

```php
use Workflow\UpdateMethod;
use Workflow\UpdateValidator;
use Workflow\V2\Workflow;

final class CartWorkflow extends Workflow
{
    private array $items = [];

    #[UpdateMethod('add-item')]
    public function addItem(string $item): array
    {
        $this->items[] = $item;

        return $this->items;
    }

    #[UpdateValidator('add-item')]
    public function validateAddItem(string $item): void
    {
        if (count($this->items) >= 10) {
            throw new \RuntimeException('The cart is full.');
        }
    }
}
```

`#[UpdateValidator]` identifica a atualização pelo seu nome durável, ou pelo nome do método quando a atualização não tem alias. O validador recebe os mesmos argumentos da atualização. Antes de a atualização ser aceita, o motor reconstrói o estado da execução a partir do histórico e chama apenas o validador:

- Se ele retornar normalmente, a atualização é aceita e aplicada como de costume.
- Se ele lançar uma exceção ou retornar `false`, a atualização é rejeitada com o motivo `update_validator_rejected` e o resultado `rejected_invalid_arguments`. `rejectedByValidator()` é verdadeiro, `rejectionMessage()` retorna a mensagem da exceção e `validationErrors()` retorna os erros de uma `ValidationException` do Laravel. `update()` lança uma `LogicException` que inclui o motivo e a mensagem do validador.
- Uma atualização rejeitada nunca é aceita, seu handler nunca é executado e o workflow não é acordado. Como qualquer outra rejeição, ela é registrada apenas como um evento de auditoria `UpdateRejected`, que o replay ignora.

Validadores são somente leitura. Eles podem ler o estado reconstruído do workflow, mas qualquer chamada durável (uma atividade, um temporizador, um workflow filho, um sinal, um side effect, `await`, `getVersion()`, `patched()`, continue-as-new ou um upsert de memo ou de atributos de busca) lança `UpdateValidatorCommandException` e rejeita a atualização. Alterações que um validador faz no estado reconstruído são descartadas. Um validador gerador é rejeitado, porque seu corpo nunca é executado.

Validadores não são registrados no histórico e nunca são executados durante o replay, portanto não afetam o determinismo. Eles veem o estado do histórico confirmado: uma atualização aceita, mas ainda não aplicada, não é visível para eles. O replay e o validador são executados enquanto a admissão da atualização mantém os bloqueios da execução, então mantenha os validadores rápidos.

Se o estado não puder ser reconstruído, ou se o validador encontrar um erro de banco de dados, `UpdateValidationFailedException` é lançada e nada é registrado. As rotas de webhook de atualização respondem com um `503` que pode ser repetido e `update_validation_failed`. Repita com o mesmo ID de solicitação.

Uma nova tentativa com chave de uma atualização rejeitada retorna a rejeição retida sem executar o validador novamente.

Validadores de atualização não passam pelos interceptadores do worker.

## Recuperação após uma resposta incerta {#recover-after-an-uncertain-response}

Admissão durável, conclusão do handler e um efeito externo de negócio são
fatos separados. Um tempo limite no chamador pode deixar uma atualização
aceita ainda em andamento, e uma resposta perdida pode ocultar um resultado
já confirmado. Uma recusa posterior de enviar uma nova atualização não
esclarece o resultado original.

Quando sua aplicação tiver salvo um ID de atualização, inspecione esse ciclo
de vida retido em vez de enviar outra atualização. Preserve o ID original da
execução para que uma transição continue-as-new não redirecione a investigação:

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

Os IDs salvos vêm da operação original. A inspeção lê o registro retido e pode
continuar funcionando após o encerramento da execução ou depois que ela se
torna histórica. Evidência ausente ou removida pela retenção deixa o resultado
sem resolução; não autoriza repetir um efeito de negócio. Preserve um registro
de operação da própria aplicação para reconciliação quando a resposta original
e o ID de atualização gerado tiverem sido perdidos.

### IDs de requisição e recibos retidos {#request-ids-and-retained-receipts}

Salve namespace, ID da instância, ID original da execução, ID da atualização,
nome da operação e intenção no registro da aplicação. Um recibo aceito comprova
a admissão durável. Um ciclo de vida concluído fornece o resultado registrado
do handler. Nenhum deles comprova que um pagamento, e-mail ou gravação separada
no banco aconteceu exatamente uma vez.

Os webhooks de atualização do Laravel embarcado usam `X-Request-Id` como chave
do chamador. Preserve esse cabeçalho ao passar por proxies. Nas atualizações
HTTP do Server independente, a chave vem somente de `request_id` no corpo JSON;
o cabeçalho `X-Request-Id` serve para correlação. Sem a chave no corpo, a
atualização não recebe chave de deduplicação, mesmo quando requisições
compartilham o cabeçalho.

Uma chave de comando identifica uma atualização em uma instância de workflow,
em todas as suas execuções. Com o Workflow 2.18.0 ou posterior, anexe-a com
`withRequestId()`. Após uma resposta perdida, envie a mesma atualização
novamente com a mesma chave:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('mark-ready-order-123')
    ->attemptUpdate('mark-ready', true);

$result->retained();          // True when this call returned an earlier admission
$result->intentVerified();    // False only for a legacy receipt
$result->requestIdConflict(); // True when the key already names a different update
$result->updateId();          // The original update on every matching retry
```

- Uma repetição com a mesma chave, o mesmo nome de atualização, os mesmos
  argumentos tipados e o mesmo destino de execução explícito retorna o recibo
  original, incluindo seu ID de atualização, e não registra nada. Após o
  encerramento ou continue-as-new, a repetição ainda retorna a atualização
  original. Ela não admite uma nova atualização em uma execução sucessora.
- A mesma chave com nome de atualização, argumentos ou destino de execução
  diferentes é recusada como `rejected_request_id_conflict`. `conflict()`
  identifica o comando retido e as partes que diferem. Nada é registrado, e a
  chave mantém seu recibo original.
- Um recibo admitido antes de o Workflow registrar a intenção do comando é lido
  com `retained()` verdadeiro e `intentVerified()` falso. Essa é a admissão
  original, não uma prova de que os argumentos desta repetição correspondem a
  ela.
- As chaves têm de 1 a 255 caracteres Unicode e são comparadas exatamente. Uma
  chave inválida lança `InvalidCommandRequestIdException` antes da admissão.

Use uma chave para uma operação lógica e nunca altere seus argumentos. Use uma
nova chave para uma nova operação, inclusive depois de confirmar que uma
atualização com chave foi rejeitada. Versões anteriores ao Workflow 2.18.0 e ao
Server nativo 3.9.0 não comparam a intenção: nelas, uma chave reutilizada com
argumentos diferentes ou outro nome de atualização retorna o recibo da primeira
atualização.

Clientes no modo de serviço enviam a chave como `request_id` no corpo. O Server
nativo 3.9.2 e posteriores aplicam as mesmas regras e acrescentam uma recusa
`request_id_ambiguous` para algumas chaves legadas. Consulte
[chaves de comando de sinais e atualizações](/docs/polyglot/server-api-reference#command-keys)
para o contrato HTTP e as chamadas em PHP, Python, Rust e CLI.

A recuperação de recibos depende dos registros retidos de comandos,
atualizações e histórico. Quando a retenção remove os detalhes de uma execução,
as chaves dela também são removidas, e uma requisição posterior com essa chave
é admitida como um novo comando. Não há aqui uma promessa de prazo de deduplicação
independente da aplicação. Revise a [retenção de histórico](../configuration/pruning-workflows.md)
e mantenha seu livro de registros de negócio pelo período exigido pela aplicação.
Evidência ausente continua representando um resultado desconhecido.

### Proteja o efeito de negócio {#protect-the-business-effect}

Para uma operação como cobrar uma fatura:

1. Persista uma chave de operação da aplicação, como `tenant-1:charge:invoice-123`,
   e sua intenção imutável antes de enviar o comando. Reutilize essa chave na recuperação.
2. Na atividade que aplica o efeito, use uma restrição única no banco para o
   tenant e a chave de operação. Verifique atomicamente a intenção armazenada,
   aplique o efeito local no banco e armazene seu resultado em uma transação.
   Retorne o resultado armazenado para uma duplicata com a mesma intenção.
   Recuse uma intenção diferente.
3. Para um provedor externo, use seu contrato de idempotência suportado ou um
   processo de outbox e reconciliação. Uma transação no seu banco não pode
   tornar atômica uma chamada separada ao provedor.
4. Após uma resposta incerta, reconcilie o registro da operação, o ciclo de vida
   original da atualização e a evidência do provedor. Registre se o efeito está
   pendente, confirmado, falhou ou ainda é desconhecido antes de decidir outra ação.

Uma consulta seguida de um comando deixa uma condição de corrida. Um sinal
duplicado pode acionar outra atividade mesmo quando o original foi admitido.
A proteção da aplicação deve tolerar entregas repetidas. O exemplo qualificado
executa duas atividades para a mesma chave, mas confirma apenas um efeito no
banco local. Ele não estabelece execução exatamente uma vez para sistemas externos arbitrários.

Regras das atualizações:

- `load($instanceId)` atualiza a execução durável mais recente da instância, inclusive após continue-as-new.
- Novas atualizações por `loadRun($runId)` são rejeitadas com `rejected_not_current` quando a execução selecionada se torna histórica. A inspeção de recibos retidos é uma operação separada.
- Novas atualizações em execuções encerradas são rejeitadas com `rejected_not_active`. A reprodução de um recibo retido associado à chave é separada.
- Uma atualização aceita enquanto a tarefa de workflow que conclui a execução está em andamento recebe uma vez de entrega antes de a execução ser encerrada, como acontece com um sinal. O handler dela é executado e quem chamou recebe o resultado. Atualizações ainda pendentes quando uma execução falha, é cancelada ou é terminada são encerradas com uma falha explícita.
- Corpos de atualização que falham não encerram a execução do workflow. As falhas são registradas no escopo da atualização, deixando a execução aberta para a próxima tarefa de replay.
- Consultas reproduzem atualizações concluídas, mas atualizações rejeitadas ou que falharam permanecem apenas como fatos de comandos e de histórico que não são reproduzidos.
