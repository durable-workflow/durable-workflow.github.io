---
sidebar_position: 4
---

# Conexão com o banco de dados {#database-connection}

Veja as etapas necessárias para personalizar a conexão com o banco de dados usada pelos modelos duráveis do workflow v2. Isso *só* é necessário se você quiser usar uma conexão diferente da conexão padrão definida para sua aplicação Laravel.

Para conhecer o contrato completo de substituição da v2, incluindo subclasses
com tabelas diferentes, regras de serialização, substituição do repositório,
diagnósticos de integridade e requisitos de migração, consulte a
[Matriz de personalização](./customization-matrix.md).

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

As migrações do Workflow são carregadas automaticamente do pacote (`WorkflowServiceProvider::loadMigrationsFrom`) e executadas na conexão padrão com o banco de dados. Ao direcionar as tabelas da v2 para uma conexão diferente da padrão, publique as migrações com `php artisan vendor:publish --tag=migrations` e defina `protected $connection = 'mysql';` em cada classe de migração publicada para que `php artisan migrate` as execute no banco de dados correto.
