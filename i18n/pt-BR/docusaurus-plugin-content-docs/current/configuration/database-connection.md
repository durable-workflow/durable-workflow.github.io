---
sidebar_position: 4
---

# Conexão com o banco de dados {#database-connection}

O Workflow usa a conexão de banco de dados padrão da aplicação Laravel, a menos que você selecione outra conexão para o armazenamento durável.

Para usar no armazenamento de workflows uma conexão definida em `config/database.php`, informe o nome dela no ambiente:

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Os modelos, as transações, os bloqueios de linha e as ações após o commit do Workflow usam essa conexão. Mantenha todas as tabelas duráveis de workflow na mesma conexão Laravel. Configure o transporte da fila separadamente na configuração de filas do Laravel.

Você também pode selecionar a conexão por classes de modelos personalizados, como descrito abaixo. O `run_model` v2 configurado fornece a conexão de armazenamento dos metadados v2 sem conexão explícita no modelo. As conexões explícitas dos modelos devem ser iguais a ela. `DW_STORAGE_CONNECTION` tem prioridade sobre as propriedades de conexão dos modelos.

Para conhecer o contrato completo de substituição da v2, incluindo subclasses
com tabelas diferentes, regras de serialização, substituição do repositório,
diagnósticos de integridade e requisitos de migração, consulte a
[Matriz de personalização](./customization-matrix.md).

## Conexões de modelos personalizados {#custom-model-connections}

1. Crie classes no diretório de modelos da aplicação que estendam as classes de modelo base da v2
2. Defina a opção `$connection` desejada em cada classe
3. Publique o arquivo de configuração de workflows
4. Atualize os vínculos de modelos em `workflows.v2` para apontar para suas classes personalizadas

## Estendendo os modelos de workflow da v2 {#extending-v2-workflow-models}

Coloque o seguinte código em `app\Models\V2\WorkflowInstance.php`.

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

Repita o padrão para cada modelo durável da v2 que precisar redirecionar, no mínimo:

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

Cada subclasse deve declarar `protected $connection = 'mysql';` (ou o nome da conexão que você definiu em `config/database.php`).

## Registrando modelos personalizados {#registering-custom-models}

Publique o arquivo de configuração de workflows e atualize os vínculos `workflows.v2.*_model` para apontar para suas classes personalizadas:

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

O pacote resolve os modelos por meio de `Workflow\V2\Support\ConfiguredV2Models`, então qualquer relação ou consulta que acesse um modelo da v2 usará a conexão configurada de forma transparente.

Se você for além de subclasses com esquema compatível e alterar a chave
estrangeira inferida do seu `instance_model` personalizado, o pacote agora
verifica na inicialização se as relações `runs()`, `commands()` e `updates()`
foram substituídas explicitamente.

## Migrações {#migrations}

As migrações do Workflow são carregadas automaticamente do pacote e respeitam `DW_STORAGE_CONNECTION`. As migrações da aplicação mantêm suas próprias conexões configuradas.

Ao usar conexões de modelos personalizados sem `DW_STORAGE_CONNECTION`, atribua a mesma `$connection` às migrações de workflow publicadas correspondentes. A opção `--database` do Laravel também permite escolher o destino ao executar somente essas migrações de workflow. Mantenha as migrações da aplicação na conexão da aplicação.

## Limites das transações {#transaction-boundaries}

Quando os dados da aplicação e o armazenamento de workflow usam a mesma conexão Laravel, iniciar um workflow dentro de uma transação o inclui nessa transação. Um rollback remove as gravações de workflow feitas dentro dela. O mecanismo publica as tarefas do workflow na fila e emite os eventos de ciclo de vida após o commit da transação de armazenamento mais externa. Um rollback descarta essas ações.

Por exemplo, com `DW_STORAGE_CONNECTION=workflows`:

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

Os modelos da aplicação cujas alterações precisam ser confirmadas atomicamente com esse início também devem usar a conexão `workflows`.

Transações em conexões Laravel diferentes são confirmadas de forma independente, mesmo quando os nomes apontam para o mesmo banco de dados físico. Uma transação na conexão padrão da aplicação não pode reverter um workflow já confirmado em outra conexão de armazenamento. Coloque as alterações que precisam de atomicidade na mesma conexão e inclua-as na transação dessa conexão.

A publicação após o commit protege o limite do armazenamento de workflow. Um banco de dados ou broker de mensagens separado usado pela fila tem suas próprias regras de transação e entrega.
