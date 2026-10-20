---
sidebar_position: 6
---

# ID do workflow {#workflow-id}

## IDs de instância e IDs de execução {#instance-ids-and-run-ids}

Um workflow durável tem dois identificadores com ciclos de vida diferentes:

- O **ID de instância** (`id()`, `workflowId()`) é a referência pública estável do workflow. Ele é gerado quando o workflow é iniciado pela primeira vez, ou fornecido pelo chamador, e nunca muda durante a vida desse workflow, inclusive em cadeias de continuação como nova execução.
- O **ID de execução** (`runId()`) identifica uma geração concreta de execução desse workflow. Um novo ID é alocado sempre que uma execução é criada, o que ocorre no primeiro início e quando o workflow continua como nova execução.

Trate o ID de instância como a referência pública para fazer chamadas. Trate o ID de execução como um ponteiro para uma geração específica, útil para inspeção, depuração ou auditoria, e não como algo que chamadores de longa duração do plano de controle precisem acompanhar.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Use o ID quando quiser a referência pública estável do workflow. Use o ID de execução quando precisar inspecionar uma execução concreta.

## Ciclo de vida do ID de execução {#run-id-lifecycle}

Um ID de execução identifica uma geração de execução. Cada geração de workflow da v2 tem seu próprio ID de execução, e um único ID de instância pode abranger muitas gerações ao longo do tempo:

- Um novo `start()` cria a primeira execução e seu primeiro ID de execução.
- `continueAsNew(...)` fecha a execução atual como `completed` / `continued` e inicia outra execução com um novo ID de execução sob o mesmo ID de instância. Consulte [Continuar como nova execução](/docs/features/continue-as-new).

Como um ID de execução pertence a uma geração, chamadores que precisem de comportamento durável ao longo dessas transições devem resolver pelo ID de instância:

- Sinais, consultas, atualizações e comandos do operador sempre resolvem a execução durável mais recente de uma instância. Chamadores não precisam acompanhar IDs de execução entre continuações como nova execução.
- Ferramentas de inspeção detalhada que fixam uma geração específica, como a visão de detalhes da execução no Waterline, uma exportação de histórico ou um depurador de replay, aceitam um ID de execução explícito para inspecionar uma execução isoladamente.

O ID de execução aparece como `runId()` no código de workflows e atividades, e como o campo `workflow_run_id` / `run_id` em históricos, projeções e exportações. Ele sempre é o ID de execução da geração à qual o evento ou registro pertence. Não espere que um ID de execução registrado em eventos antigos do histórico seja igual ao ID da execução atual da mesma instância.

## IDs de instância definidos pelo usuário {#user-defined-instance-ids}

Ao iniciar um workflow, você pode especificar o ID opcionalmente. IDs definidos pelo usuário devem ser strings seguras para URLs, com até 191 caracteres, usando apenas letras, números, `.`, `_`, `-` e `:`.

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

Depois, quando quiser referenciar o workflow, você poderá carregá-lo com seu ID personalizado.

```php
$workflow = WorkflowStub::load('order-123');
```

### Escolhendo um ID fornecido pelo chamador {#choosing-a-caller-supplied-id}

Escolha um ID que identifique uma operação de negócio de forma consistente.
Uma nova tentativa do mesmo início deve reutilizar esse ID. Gere um novo ID para
outra operação. Inclua um prefixo de tipo de workflow e, quando necessário, uma
referência opaca ao tenant para evitar colisões entre aplicações que compartilham
um armazenamento. Por exemplo, `order:tenant-7f2:01J9Z6K6Z2EPV5G0C3R8F4M9AN`
combina esses prefixos com um identificador resistente a colisões. Um prefixo de
tenant é uma convenção de nomenclatura, não uma fronteira de autorização.
Configure o isolamento por namespace separadamente.

O ID não substitui a [política de início duplicado](../configuration/options.md).
O padrão rejeita um início duplicado. `ReturnExistingActive` pode retornar o
workflow ativo existente sem iniciar outra execução nem substituir seus argumentos
originais. O ID de uma instância concluída permanece reservado. Alterar o tipo
de workflow não disponibiliza esse ID novamente.

### IDs são metadados visíveis {#ids-are-visible-metadata}

IDs de instância aparecem em texto simples no Waterline, nas URLs, na saída da
CLI, nos logs, nas exportações de histórico e no banco de dados. Codecs de
payload, incluindo criptografia de payload, não abrangem esses identificadores.
Use referências opacas em vez de endereços de e-mail, nomes, tokens de acesso ou
outros dados pessoais ou secretos. Mantenha detalhes sensíveis de negócio em
campos de payload protegidos pela política de tratamento de dados da aplicação.
Um ID impossível de adivinhar não substitui a autorização.

## Acessando IDs dentro de atividades e workflows {#accessing-ids-inside-activities-and-workflows}

Dentro de uma atividade:

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Dentro de um workflow, `$this->workflowId()` retorna o ID de instância e `$this->runId()` retorna o ID da execução selecionada que está sendo executada no momento.
