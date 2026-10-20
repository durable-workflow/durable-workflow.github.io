---
sidebar_position: 4.5
title: Matriz de personalização
description: Matriz de suporte consolidada para substituições de modelos, configurações de serialização, substituição do repositório de observabilidade, integridade, importações, migrações e comportamento de escrita do Durable Workflow v2.
---

# Matriz de personalização {#customization-matrix}

Esta página consolida o contrato de personalização suportado pelo Durable Workflow v2.
Use-a quando precisar mover modelos duráveis da v2 para outra conexão,
trocar subclasses de modelos, substituir o repositório PHP de observabilidade
do operador ou decidir se uma configuração antiga de serialização ainda é
válida durante a migração.

## Matriz de substituições suportadas {#supported-override-matrix}

| Superfície | Contrato suportado | Observações |
| --- | --- | --- |
| `workflows.v2.instance_model` com uma subclasse de esquema compatível que mantenha o nome base `WorkflowInstance` | Suportado | Use esse formato quando precisar apenas de outra conexão, conversões de atributos ou namespace da aplicação. As relações herdadas mantêm o contrato da chave estrangeira `workflow_instance_id` do pacote. |
| `workflows.v2.instance_model` com uma subclasse que altere a tabela ou o nome base | Suportado com substituições explícitas das relações | Substitua `runs()`, `commands()` e `updates()` para que mantenham `workflow_instance_id`. O pacote agora valida isso na inicialização e rejeita inferências de relações herdadas que alterariam essas chaves. `currentRun()` já fixa `current_run_id` explicitamente e não precisa ser substituído. |
| Outras substituições de `workflows.v2.*_model` (`run_model`, `task_model`, `history_event_model`, projeções, agendamentos, registros de atividades, falhas, mensagens, memos, atributos de pesquisa, chamadas de workflows filhos) | Suportado para subclasses de esquema compatível | Mantenha os nomes de colunas, chaves primárias e chaves estrangeiras do pacote. Essas relações já fixam as chaves usadas, então subclasses com tabelas diferentes podem manter os métodos de relação herdados quando o esquema continuar compatível. |
| Nomes de tabelas personalizados junto com nomes personalizados de colunas de chave estrangeira | Não suportado | O runtime da v2 e as interfaces do operador pressupõem os nomes de colunas e chaves do pacote. Se você os alterar, estará fora do contrato suportado. |
| Substituição de `OperatorObservabilityRepository` | Suportado por vínculo no contêiner | Vincule sua implementação a `Workflow\V2\Contracts\OperatorObservabilityRepository`. Esse é um contrato de integração do runtime PHP para Waterline e `WorkflowStub::historyExport()`, não uma API estável entre linguagens. O repositório recebe objetos de modelo do pacote. |
| `serializer` | Suportado apenas para `avro` e codecs legados de conclusão/importação | Novas execuções da v2 sempre usam a semântica Avro. `workflow-serializer-y` e `workflow-serializer-base64` continuam válidos apenas para concluir ou importar históricos da v1 que ainda precisem de decodificação nativa do PHP. Classes personalizadas de serialização da v1 não são suportadas na v2. |
| Diagnósticos de integridade e doctor | Suportado | `php artisan workflow:v2:doctor` e a integridade/estatísticas do Waterline v2 refletem as classes de modelo configuradas e sinalizam configurações de serialização desatualizadas como dívida de migração. |
| Migrações do pacote em uma conexão diferente da padrão | Suportado com migrações publicadas | As migrações do pacote carregadas automaticamente usam a conexão padrão do Laravel. Se seus modelos duráveis usarem outra conexão, publique as migrações e defina explicitamente a `$connection` da migração. |
| Runtime central de escrita (`WorkflowStub::make()`, `load()`, criação de tarefas, resolução da execução atual) | Suportado por meio dos modelos duráveis configurados | O runtime respeita os valores configurados de `instance_model`, `run_model` e `task_model`. Mantenha as tabelas de escrita com esquema compatível com as colunas e chaves do pacote. |

## Chaves exatas dos modelos da v2 {#exact-v2-model-keys}

A configuração publicada de `workflows.php` expõe estas chaves de modelos
duráveis em `workflows.v2`:

- `instance_model`
- `run_model`
- `history_event_model`
- `task_model`
- `command_model`
- `link_model`
- `activity_execution_model`
- `activity_attempt_model`
- `timer_model`
- `failure_model`
- `run_summary_model`
- `run_wait_model`
- `run_timeline_entry_model`
- `run_timer_entry_model`
- `run_lineage_entry_model`
- `schedule_model`
- `schedule_history_event_model`

Use subclasses dos modelos do pacote nessas chaves. Mantenha os nomes de colunas
e chaves estrangeiras do pacote, a menos que uma página desta documentação
indique o contrário.

## Regra de substituição do modelo de instância {#instance-model-override-rule}

A única substituição atual da v2 que exige trabalho adicional nas relações é
`workflows.v2.instance_model`, quando sua subclasse altera a chave estrangeira
inferida para algo diferente de `workflow_instance_id`.

Exemplo típico seguro:

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

Como o nome base da subclasse continua sendo `WorkflowInstance`, o Eloquent
mantém a mesma chave estrangeira inferida e as relações herdadas permanecem alinhadas.

Se você usar outro nome base ou um modelo de armazenamento com outra tabela,
substitua explicitamente as relações afetadas:

```php
namespace App\Workflow\Storage;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Workflow\V2\Models\WorkflowCommand;
use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Models\WorkflowUpdate;
use Workflow\V2\Support\ConfiguredV2Models;

final class TenantWorkflowInstance extends BaseWorkflowInstance
{
    protected $table = 'tenant_workflow_instances';

    public function runs(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('run_model', WorkflowRun::class),
            'workflow_instance_id',
        );
    }

    public function commands(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('command_model', WorkflowCommand::class),
            'workflow_instance_id',
        )->oldest('created_at');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('update_model', WorkflowUpdate::class),
            'workflow_instance_id',
        )
            ->orderBy('command_sequence')
            ->oldest('accepted_at')
            ->oldest('created_at')
            ->oldest('id');
    }
}
```

Se essas substituições estiverem ausentes, a inicialização do pacote agora falha
imediatamente, em vez de permitir que a aplicação use chaves inferidas como
`tenant_workflow_instance_id` ou `custom_workflow_instance_id`.

## Regras de serialização, importação e integridade {#serializer-import-and-health-rules}

- Mantenha `serializer = 'avro'` para novos trabalhos da v2.
- Use codecs legados apenas ao concluir ou importar históricos da v1 que ainda
  precisem de decodificação de payload nativa do PHP.
- Não aponte a v2 para classes personalizadas de serialização removidas da v1.
- Execute `php artisan workflow:v2:doctor` após atualizações e alterações de
  configuração. Esse diagnóstico sinaliza configurações legadas de serialização
  e outros problemas de prontidão para a inicialização.
- Trate a integridade e as estatísticas do Waterline v2 como a visão que o
  operador tem da mesma configuração de modelos duráveis.

## Regras de migração e escrita {#migration-and-write-side-rules}

- O caminho normal usa as migrações do pacote carregadas automaticamente na conexão padrão.
- Se seus modelos duráveis usarem outra conexão, publique as migrações e defina
  a `$connection` da migração para que `php artisan migrate` use o mesmo banco
  de dados das subclasses de modelo configuradas.
- Mantenha os nomes de tabelas, chaves primárias e chaves estrangeiras do pacote
  em todos os modelos que participem do caminho de escrita do runtime.
- A personalização do caminho de escrita não se limita a leituras: inícios,
  carregamentos, resolução da execução atual e execução de tarefas usam os
  modelos duráveis configurados.

## Guias relacionados {#related-guides}

- [Publicando a configuração](./publishing-config.md)
- [Conexão com o banco de dados](./database-connection.md)
- [Guia de migração](../migration.md)
- [Monitoramento](../monitoring.md)
