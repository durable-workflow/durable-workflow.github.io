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

`request_id` não é um contrato portátil de ID de atualização com escopo de
execução. Os caminhos PHP verificados podem retornar a primeira atualização
retida quando a mesma chave é enviada com argumentos diferentes. A busca
embarcada também abrange nomes de atualizações dentro da instância. Reutilizar
uma chave após continue-as-new pode retornar o resultado da antecessora sem
admitir uma atualização na sucessora. Um recibo retido associado à chave também
pode ser retornado após o encerramento, enquanto uma nova atualização é recusada.

Use uma chave para uma operação lógica e preserve sua intenção original. Não
altere os argumentos, não a reutilize para outro nome de atualização nem
presuma que ela inicia uma nova operação na próxima execução. O caminho de
atualização ativa do serviço PHP e a busca embarcada não têm regras idênticas
de correspondência. Em especial, a reutilização entre nomes de atualizações
não é uma receita de recuperação suportada. O [registro de qualificação](https://github.com/durable-workflow/durable-workflow.github.io/pull/268)
identifica o runtime e o SDK PHP publicados e registra os diferentes caminhos.
O Server nativo e os caminhos de outros SDKs exigem qualificação própria.

A recuperação de recibos depende dos registros retidos de comandos,
atualizações e histórico. Não há aqui uma promessa de prazo de deduplicação
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
- Corpos de atualização que falham não encerram a execução do workflow. As falhas são registradas no escopo da atualização, deixando a execução aberta para a próxima tarefa de replay.
- Consultas reproduzem atualizações concluídas, mas atualizações rejeitadas ou que falharam permanecem apenas como fatos de comandos e de histórico que não são reproduzidos.
