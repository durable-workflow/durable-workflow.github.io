---
sidebar_position: 2
---

# Opções {#options}

Há várias opções disponíveis ao definir seus workflows e atividades. Elas incluem o número de tentativas permitidas para um workflow ou atividade antes da falha, a conexão e a fila, e o número máximo de segundos de execução.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public ?string $connection = 'default';
    public ?string $queue = 'default';

    public int $tries = 3;

    public function backoff(): array
    {
        return [1, 2, 5, 10, 15, 30, 60, 120];
    }
}
```

As propriedades `$connection` e `$queue` de `Workflow\V2\Workflow` e `Workflow\V2\Activity` são declaradas como `public ?string` e têm `null` como padrão. As substituições em subclasses devem manter o tipo anulável para que as regras invariantes de tipagem de propriedades públicas do PHP aceitem a redeclaração. Use `null` quando quiser herdar a conexão ou fila padrão da aplicação em vez de fixar um valor no código.

Os limites de tempo de atividades não são configurados por uma propriedade da classe. Use [`ActivityOptions`](#activityoptions) por chamada (por exemplo, `startToCloseTimeout`) ou o snapshot da política de novas tentativas da atividade capturado no agendamento. Consulte também [Política de reparo de tarefas](/docs/polyglot/server-config-reference#workflow-package-controls) para as configurações de tempo do laço do worker.

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` contém as configurações de visibilidade, deduplicação e limite de tempo de execução no início do workflow. Ela não seleciona uma fila. O roteamento por fila é determinado pelas propriedades `$connection` e `$queue` das classes de workflow e atividade, junto com `ActivityOptions` por chamada.

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;
use Workflow\V2\Enums\DuplicateStartPolicy;

$workflow = WorkflowStub::make(MyWorkflow::class);

$workflow->start(
    'arg1',
    new StartOptions(
        duplicateStartPolicy: DuplicateStartPolicy::ReturnExistingActive,
        businessKey: 'order-12345',
        labels: ['tenant' => 'acme'],
        executionTimeoutSeconds: 3600,
    ),
);
```

As opções de `StartOptions` são consumidas pelo mecanismo de workflow e não são passadas como argumentos ao método `handle()` do workflow. Elas são persistidas com o workflow e usadas nos despachos posteriores de workflows e atividades (incluindo o comportamento de replay e continuação como nova execução).

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` permite substituir roteamento, novas tentativas e limites de tempo por chamada ao invocar uma atividade, sem exigir alterações na própria classe da atividade:

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    ChargeCard::class,
    new ActivityOptions(
        connection: 'redis',
        queue: 'critical',
        maxAttempts: 5,
        startToCloseTimeout: 30,
    ),
    $orderId,
);
```

As substituições de roteamento em `ActivityOptions` se aplicam ao agendar uma nova execução de atividade. Elas não movem uma atividade já registrada no histórico. Consulte as [filas de atividade registradas](../polyglot/task-matching-dispatch.md#recorded-activity-queues) antes de mudar os pools de workers.

## Conexão {#connection}

A configuração `$connection` especifica para qual conexão de fila o workflow ou a atividade deve ser enviado. Por padrão, o valor de `$connection` não é definido e a conexão padrão é usada. Você pode substituir esse comportamento definindo a propriedade `$connection` na classe do workflow ou da atividade.

## Fila {#queue}

A configuração `$queue` especifica a qual fila o workflow ou a atividade deve ser adicionado. Por padrão, o valor de `$queue` não é definido e a fila padrão da conexão especificada é usada. Você pode substituir esse comportamento definindo a propriedade `$queue` na classe do workflow ou da atividade.

Uma atividade armazena a conexão e a fila resolvidas ao ser agendada. Suas novas tentativas e tarefas reparadas reutilizam esse roteamento registrado, mesmo após mudanças nos padrões da classe ou nas opções por chamada. Execuções de workflow existentes também mantêm sua fila de workflow registrada. Mantenha workers compatíveis nas filas antigas enquanto essas dependências existirem. Siga o [procedimento de transição de filas](../polyglot/task-matching-dispatch.md#recorded-activity-queues).

## Novas tentativas {#retries}

A configuração `$tries` controla o número total de tentativas de uma atividade antes que ela seja considerada com falha. Por padrão, `$tries` é `1` (uma única tentativa, sem novas tentativas automáticas). Defina `$tries` com um valor maior que `1` para permitir novas tentativas, ou com `0` para tentar indefinidamente. Você pode substituir esse valor por chamada por meio de `ActivityOptions::$maxAttempts`.

## Limite de tempo {#timeout}

A classe base `Activity` da v2 não tem uma propriedade de classe `$timeout`. Configure limites de tempo de atividades por chamada por meio de [`ActivityOptions`](#activityoptions), usando `startToCloseTimeout`, `scheduleToStartTimeout`, `scheduleToCloseTimeout` ou `heartbeatTimeout`. O runtime captura um snapshot da política resultante de novas tentativas na execução da atividade quando ela é agendada. Assim, o limite de tempo permanece estável para uma tentativa já agendada mesmo que uma implantação posterior altere a classe ou as opções da atividade. O tempo de despacho no nível do laço do worker é controlado pela [Política de reparo de tarefas](/docs/polyglot/server-config-reference#workflow-package-controls).

## Intervalo entre tentativas {#backoff}

O método `backoff` retorna um array de inteiros correspondentes à tentativa atual. O método `backoff` padrão aplica um recuo exponencial até 2 minutos. Você pode substituí-lo implementando o método `backoff` na classe da atividade.

## Namespace {#namespace}

Workflows podem ter seu escopo limitado a um namespace para isolar múltiplos namespaces. O namespace configurado se aplica tanto à API de início do plano de controle quanto a `Workflow\V2\WorkflowStub::make()->start()`. Ele é persistido na nova instância, na execução, nas tarefas duráveis e na projeção de resumo da execução. A consulta de tarefas e os filtros de visibilidade do Waterline podem então restringir os resultados a um único namespace. Use Workflow 2.4.2 ou mais recente para atribuir namespaces de forma consistente pelas duas APIs PHP de início.

Os nomes de namespace devem conter apenas caracteres alfanuméricos minúsculos, pontos, sublinhados e hífens (correspondendo a `[a-z0-9._-]+`, com no máximo 128 caracteres).

Defina o namespace padrão por uma variável de ambiente:

```env
DW_V2_NAMESPACE=production
```

Ou em `config/workflows.php`:

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

Um namespace explícito substitui o padrão configurado. O stub o aceita como terceiro argumento de `make()`:

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

O plano de controle o aceita nas opções de `start()`:

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

Quando nenhum namespace está configurado e nenhum é passado explicitamente, novas instâncias mantêm um namespace `null`. Um observador com escopo de namespace não inclui essas execuções. Alterar a configuração não reatribui instâncias existentes. Tentar iniciar uma instância existente por outro namespace é rejeitado.

### Escopo de namespace no Waterline {#waterline-namespace-scoping}

Quando o Waterline é implantado com um banco de dados compartilhado por múltiplos namespaces, defina `WATERLINE_NAMESPACE` para restringir todas as listagens a um namespace:

```env
WATERLINE_NAMESPACE=production
```

Isso insere um filtro de namespace em toda consulta de visibilidade para que o Waterline mostre apenas workflows do namespace configurado. Quando definido, o Waterline também limita todas as operações de comando (cancelamento, sinal, término, atualização, reparo, arquivamento e consultas) ao namespace configurado. Um comando direcionado a uma instância ou execução de outro namespace retorna 404 em vez de ser executado.

### Escopo de namespace nos comandos {#command-namespace-scoping}

`WorkflowStub::load()`, `loadSelection()` e `loadRun()` aceitam um parâmetro opcional `namespace`:

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

Quando `namespace` é `null` (o padrão), o carregamento não tem escopo e abrange todos os namespaces, preservando a compatibilidade com versões anteriores. Quando um namespace é fornecido, a consulta filtra pelo namespace no banco de dados e lança `ModelNotFoundException` se o workflow não existir nesse namespace.

Os métodos de comando do plano de controle (`signal`, `cancel`, `terminate`, `update`, `repair`, `archive`) também aceitam `namespace` no array de opções:

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### Filtragem de namespace na ponte de tarefas {#task-bridge-namespace-filtering}

As pontes de tarefas de workflow e de atividade aceitam um parâmetro opcional `namespace` em `poll()`:

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

Quando omitido, `poll()` retorna tarefas de todos os namespaces (compatível com instalações anteriores à introdução de namespaces).

## Aliases de tipos duráveis {#durable-type-aliases}

As chaves de tipos duráveis de workflows e atividades são armazenadas quando você as registra em `workflows.v2.types`. Payloads de falha podem usar o mesmo padrão para classes de exceção:

```php
'v2' => [
    'types' => [
        'workflows' => [
            'billing.invoice-sync' => App\Workflows\InvoiceSyncWorkflow::class,
        ],
        'activities' => [
            'payments.capture' => App\Activities\CapturePaymentActivity::class,
        ],
        'exceptions' => [
            'billing.invoice-declined' => App\Exceptions\InvoiceDeclined::class,
        ],
        'exception_class_aliases' => [
            App\Exceptions\LegacyInvoiceDeclined::class => App\Exceptions\InvoiceDeclined::class,
        ],
    ],
],
```

Quando uma falha de atividade, atualização, workflow filho ou workflow é registrada com um alias de exceção, o mecanismo armazena esse alias no histórico tipado como `exception_type` e no payload de falha como `type`. O replay resolve o alias antes de recorrer à classe PHP registrada. Assim, uma mudança posterior de localização da classe pode manter estável a semântica de `catch` do workflow, desde que o alias continue apontando para a classe atual da exceção lançável.

Para falhas importadas da v1 que foram registradas antes de existir um alias de exceção, `workflows.v2.types.exception_class_aliases` pode mapear o nome de classe totalmente qualificado (FQCN) da exceção legada registrada para a classe lançável atual. Os aliases de tipos duráveis em `exceptions` continuam tendo precedência. O mapa de aliases de classe serve apenas como ponte de refatoração para payloads já registrados sem um `type` durável. Novos workflows devem usar aliases de tipos duráveis de exceção para que o histórico não dependa dos nomes das classes PHP.

A v2 final grava aliases duráveis de exceção quando a falha é registrada. Portanto, configure aliases estáveis antes de registrar falhas cujas classes lançáveis possam mudar de localização depois.

Se uma falha durante o replay não puder ser resolvida pelo mapa durável `exceptions`, pelo mapa de aliases de classe ou pela classe registrada, o mecanismo não recorre a uma exceção genérica de runtime dentro do código do workflow. O replay de consulta lança `UnresolvedWorkflowFailureException`, o Waterline marca a falha com `exception_replay_blocked = true`, e uma tarefa de worker que encontre a mesma lacuna fica com falha enquanto a execução permanece aberta. Corrija o mapeamento e repare a execução em vez de depender de blocos amplos de `catch (RuntimeException)` para tratar falhas históricas renomeadas.
