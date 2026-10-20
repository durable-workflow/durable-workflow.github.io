---
sidebar_position: 1
---

# Publicando a configuração {#publishing-config}

Este comando cria um arquivo de configuração `workflows.php` na pasta `config`.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Lease de uma tarefa de workflow (v2) {#workflow-task-lease-v2}

Configure a lease de tarefas de workflow embutidas com um número inteiro positivo de segundos:

```env
DW_V2_WORKFLOW_TASK_LEASE_SECONDS=300
```

Isso corresponde a `workflows.v2.workflow_task_lease_seconds` em `config/workflows.php`, com padrão `300`. As posses e renovações de tarefas leem a configuração efetiva. Zero não desativa a lease. Após alterar a configuração da implantação, atualize a configuração em cache e reinicie os workers de longa duração.

O Server usa `DW_WORKFLOW_TASK_TIMEOUT` em vez disso e aplica o valor à configuração do pacote. Essa lease de recuperação é independente dos prazos de atividades e workflows. Veja [Lease de uma tarefa de workflow](../features/timeouts.md#workflow-task-lease).

## Alterando a pasta de workflows {#changing-workflows-folder}

Por padrão, os comandos `make` gravam na pasta `app/Workflows`.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

Você pode alterar isso atualizando a configuração `workflows_folder`.

```php
'workflows_folder' => 'Workflows',
```

## Usando modelos personalizados (v1 legada) {#using-custom-models-legacy-v1}

:::note Legado

Estas chaves `stored_workflow_*` configuram as classes `Workflow\Models\StoredWorkflow*` da v1. O Workflow v2 usa as substituições de modelos duráveis abaixo: `instance_model`, `run_model`, `task_model` e assim por diante. Mantenha as chaves da v1 apenas se ainda estiver executando workflows da v1 durante a migração.

:::

No arquivo de configuração publicado `workflows.php`, você pode atualizar as classes de modelo da v1 para usar suas próprias subclasses.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Usando substituições de modelos (v2) {#using-model-overrides-v2}

O runtime também permite substituir modelos das tabelas duráveis de instância, execução, tarefa, histórico e projeção:

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

Essas substituições não se limitam a leituras ou reconstruções de projeções. `WorkflowStub::make()`, `load()`, `loadSelection()`, a reserva de instâncias, a seleção de execuções e a execução de tarefas de workflow usam os valores configurados de `instance_model`, `run_model` e `task_model`. Os detalhes do Waterline e a exportação de histórico leem pelas mesmas classes configuradas. Portanto, uma substituição no nível da aplicação governa tanto o caminho central do runtime quanto as leituras voltadas ao operador.

Mantenha as subclasses personalizadas com esquema compatível com os modelos internos. Se uma subclasse também alterar nomes de tabelas ou outras convenções do Eloquent que os modelos do pacote normalmente inferem, substitua também as relações afetadas nessa subclasse para que `currentRun()`, `runs()` e buscas semelhantes permaneçam alinhados ao esquema personalizado.

Consulte a [Matriz de personalização](./customization-matrix.md) para conhecer
o contrato de suporte consolidado da v2, incluindo quais substituições são seguras
como subclasses herdadas, quais exigem substituições explícitas de relações e
como serialização, repositório, integridade, importação, migração e comportamento
de escrita se relacionam.

## Codec de payload {#payload-codec}

A v2 usa `avro` para novos payloads de workflow:

```php
'serializer' => 'avro',
```

- **`avro`** (padrão, obrigatório para novos workflows da v2): codificação binária Apache Avro. Compacta na transmissão e no armazenamento, e mais rápida para codificar/decodificar payloads grandes que o serializador PHP legado.

Se uma configuração publicada da v1 ainda definir `serializer`, a v2 final continua lendo o valor para os diagnósticos de `workflow:v2:doctor`, mas novos payloads da v2 continuam usando Avro.

### Codecs legados (somente migração da v1) {#legacy-codecs-v1-migration-only}

Dois codecs exclusivos de PHP continuam disponíveis para ler o histórico da v1 durante a migração:

- `workflow-serializer-y`: `SerializableClosure` do PHP com codificação por escape de bytes (padrão da v1).
- `workflow-serializer-base64`: `SerializableClosure` do PHP com codificação base64.

Definir `serializer` com um codec legado será sinalizado por `php artisan workflow:v2:doctor`. Novos workflows da v2 continuam usando Avro. Mantenha a configuração de um codec legado apenas enquanto estiver concluindo ou importando execuções da v1 que precisem de decodificação de payload nativa do PHP.

O leitor interno de importação/conclusão da v1 reconhece nomes de classes legadas totalmente qualificados (por exemplo, `Workflow\Serializers\Y::class`). Eles não são aliases públicos de codecs da v2 e não podem ser selecionados por uma nova execução da v2 ou por um SDK.

## Marcadores de compatibilidade {#compatibility-markers}

O runtime pode marcar cada nova execução com um marcador de compatibilidade e permitir que workers anunciem quais marcadores podem executar com segurança. Essa é a barreira do runtime que mantém execuções de longa duração em builds compatíveis durante implantações deliberadas de builds de workers.

Defina o marcador para novas execuções no build atual:

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

Opcionalmente, configure um worker para aceitar mais de um marcador durante uma implantação:

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Ajuste por quanto tempo um snapshot de heartbeat de um worker permanece visível na visão da frota mantida no banco de dados:

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

Opcionalmente, limite essa visão da frota a um namespace de aplicação ou implantação quando várias aplicações compartilharem o mesmo banco de dados de workflows:

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

A configuração publicada de `workflows.php` mapeia esses valores aqui:

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

Se `supported` for omitido, os workers aceitam por padrão apenas o marcador `current`. Registros antigos de tarefas e resumos de execução criados antes dos marcadores de compatibilidade no nível da tarefa são preenchidos a partir do marcador da execução durante a migração e, se necessário, novamente no caminho de aquisição ou recuperação do runtime. Tarefas e execuções que realmente não tenham marcador em nenhum lugar continuam podendo ser assumidas por qualquer worker.

O mecanismo alternativo de `getVersion()` prioriza o `workflow_definition_fingerprint` do momento de início da execução quando um replay chega a um ponto de ramificação recém-introduzido que ainda não tem um evento tipado `VersionMarkerRecorded`. Isso permite que uma execução com a mesma compatibilidade mantenha a ramificação `DEFAULT_VERSION` quando claramente começou com uma definição de workflow mais antiga. Execuções antigas cujo histórico `WorkflowStarted` antecede o snapshot de fingerprint ainda recorrem ao marcador de compatibilidade do início e às verificações de sequências ocupadas. Portanto, continue alternando `DW_V2_CURRENT_COMPATIBILITY` nas ondas de implantação que introduzem novo código de workflow versionado e liste temporariamente os marcadores antigo e novo em `DW_V2_SUPPORTED_COMPATIBILITIES` enquanto o grupo antigo de workers conclui seu trabalho.

Cada worker de fila também registra um snapshot de heartbeat de compatibilidade no banco de dados durante `Looping` e o processamento de tarefas. O Waterline e os auxiliares de detalhes expõem tanto a visão do build local (`compatibility_supported`, `compatibility_reason`) quanto a visão da frota (`compatibility_namespace`, `compatibility_supported_in_fleet`, `compatibility_fleet_reason`, `compatibility_fleet`). Quando `DW_V2_COMPATIBILITY_NAMESPACE` é definido, os registros de heartbeat no banco de dados devem corresponder a esse namespace, e cada snapshot do banco informa seu próprio `namespace` junto com `worker_id`, escopo da fila, marcadores suportados e `source = database`. Durante uma atualização gradual, essa visão da frota também lê o formato antigo de heartbeat em cache dos workers que ainda não reiniciaram usando a nova tabela de snapshots. Esses registros legados de cache permanecem visíveis como alternativa durante a implantação, mesmo com um namespace configurado, mas aparecem com `namespace = null` até que os workers antigos reiniciem usando o caminho de snapshots com namespace. Ou seja, o isolamento estrito por namespace só fica completo depois que todos os workers reiniciarem usando o caminho de heartbeat no banco de dados. A recuperação no nível de transporte, como redespachar uma tarefa atrasada ou recriar uma tarefa ausente, não depende mais de o worker que faz a varredura conseguir executar essa tarefa. Apenas a etapa posterior de aquisição continua sujeita à barreira de compatibilidade.

Quando uma tarefa aberta já existe, mas nem o build atual nem qualquer snapshot ativo de heartbeat de worker anuncia seu marcador, a execução permanece visível como aguardando um worker compatível em vez de apresentar um estado falso de `repair_needed` nesse build.

## Orçamentos de histórico {#history-budgets}

O Waterline usa a projeção de resumo da execução para informar o tamanho alcançado pelo histórico tipado de uma execução selecionada. Estes limites controlam quando a projeção ativa `continue_as_new_recommended`:

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

A configuração publicada de `workflows.php` mapeia esses valores aqui:

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Defina qualquer um dos limites como `0` para desativar esse lado da recomendação. A indicação é consultiva. Use-a para planejar pontos de `continueAsNew()` antes que o custo do replay aumente, sem alterar o comportamento da execução selecionada no runtime.

## Política de espera de atualização {#update-wait-policy}

APIs de atualização que aguardam a conclusão, como `attemptUpdate()`, as rotas de atualização de webhook e os controles de atualização do Waterline, esperam apenas até um limite definido antes de retornar ao ciclo de vida da atualização ainda aceita. Configure esse limite padrão aqui:

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

A configuração publicada de `workflows.php` mapeia esses valores aqui:

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` controla por quanto tempo `attemptUpdate*` e as esperas HTTP por conclusão tentam obter um resultado aplicado pelo worker antes de retornarem um ciclo de vida aceito em vez de bloquear indefinidamente. `poll_interval_milliseconds` ajusta apenas a frequência com que o chamador verifica esse registro durável de atualização durante a espera. Ele não altera a ordem de execução do worker nem o comportamento de replay. As métricas do operador no Waterline expõem os valores ativos de `update_wait` ao lado da política de reparo para que operadores vejam o padrão efetivo sem abrir arquivos de configuração.

## Ocultação de dados na exportação do histórico {#history-export-redaction}

As exportações de histórico incluem, por definição, dados armazenados de workflows, comandos, atividades, atualizações, tarefas e falhas, pois a depuração de replay e a transferência para arquivo precisam de fatos duráveis. Se esses artefatos puderem sair de um ambiente protegido, configure um componente de ocultação de dados antes de expor amplamente o endpoint de exportação ou a saída da CLI.

Crie um componente de ocultação de dados que implemente `Workflow\V2\Contracts\HistoryExportRedactor`:

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

Em seguida, registre-o em `config/workflows.php`:

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

O componente recebe o valor atual e informações de contexto como `path`, `category`, `workflow_instance_id`, `workflow_run_id` e `workflow_type`. A exportação o chama para payloads de argumentos/saída do workflow, payloads de eventos do histórico, payload/contexto de comandos, payloads de atualizações, tarefas e atividades, e diagnósticos de mensagem/arquivo/rastreamento de falha. O pacote resultante inclui `redaction.applied`, `redaction.policy` e `redaction.paths` para que ferramentas posteriores identifiquem qual política moldou o artefato.

Cada exportação também inclui um bloco `integrity` calculado após a ocultação de dados. A soma de verificação usa `canonicalization = json-recursive-ksort-v1` e `checksum_algorithm = sha256`. Quando `signing_key` está configurado, o mesmo payload canônico é assinado com `signature_algorithm = hmac-sha256` e o `signing_key_id` opcional é informado como `key_id`. Mantenha a chave de assinatura fora do artefato exportado e altere o identificador da chave quando os verificadores posteriores precisarem distinguir chaves.
