---
sidebar_position: 4
title: Adoção no Laravel e transição de runtime
description: Mova uma frota de workflows Laravel da v1 para o Durable Workflow 2.0 integrado ou em modo de serviço sem perder a integração com o framework nem a clareza sobre a responsabilidade pelo runtime.
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - migração do Durable Workflow no Laravel
  - modo de serviço no Laravel
  - migração da v1 para v2
  - integrado para modo de serviço
---

# Adoção no Laravel e transição de runtime {#laravel-adoption-and-runtime-transition}

Aplicações Laravel têm dois destinos oficiais no Durable Workflow 2.0.
O modo integrado mantém a execução durável dentro da aplicação. O modo de
serviço mantém o Laravel como framework da aplicação e dos workers, enquanto
o Cloud ou um Server sob sua administração é responsável pelo estado durável.

Esta página orienta a decisão e a transição em três jornadas:

1. Laravel v1 estável para 2.0 integrado.
2. Laravel v1 estável para o SDK PHP 2.0 em modo de serviço.
3. Laravel 2.0 integrado para o SDK PHP 2.0 em modo de serviço.

Se seu objetivo imediato é atualizar o pacote da v1, mantenha o
[guia detalhado de migração para 2.0](/docs/migration/) aberto ao lado desta
página. Se já escolheu um runtime de serviço sob sua administração, continue
com o [manual de transição do modo integrado para Server](/docs/polyglot/embedded-to-server/)
depois de escolher a política de transição aqui.

## Escolha o destino {#pick-the-destination}

| Ponto de partida | Destino | Quando escolher | Primeira fronteira de transição |
| --- | --- | --- | --- |
| Laravel v1 estável | 2.0 integrado | A aplicação Laravel deve continuar responsável pela persistência, filas, execução de workflows e Waterline integrado. | Atualize o pacote mantido `durable-workflow/workflow` para a linha de releases 2.0. Execuções existentes da v1 terminam pelo caminho de compatibilidade v1 do pacote. Novos inícios usam v2. |
| Laravel v1 estável | SDK PHP em modo de serviço | O Laravel deve manter injeção de dependências, configuração, Artisan, logs, eventos e fakes de teste, mas o Cloud ou Server deve ser responsável pelo estado durável. | Instale `durable-workflow/sdk` como uma fronteira separada de cliente/worker de serviço. O histórico v1 e os jobs duráveis das filas Laravel permanecem no runtime v1 até atingirem estado terminal. |
| Laravel 2.0 integrado | SDK PHP em modo de serviço | A aplicação deve deixar de ser responsável pelo runtime de orquestração ou precisa de uma fronteira de runtime compartilhada/entre linguagens. | Direcione novos inícios ao runtime de serviço depois que seus workers estiverem prontos. Deixe as execuções integradas terminarem onde começaram, ou use o procedimento explícito de importação de execuções elegíveis da v2 integrada para Server sob sua administração. |

A ponte Laravel do SDK PHP e o pacote integrado suportam Laravel 9 a 13 nas
versões compatíveis de PHP. Assim, uma aplicação v1 suportada pode escolher
qualquer um dos destinos sem uma atualização não relacionada do Laravel.

## Compare a fronteira de responsabilidade {#compare-the-ownership-boundary}

| Aspecto | Laravel v1 estável | Laravel 2.0 integrado | SDK PHP 2.0 em modo de serviço |
| --- | --- | --- | --- |
| Responsável pelo runtime | A aplicação Laravel é responsável pela orquestração e pelo replay. | A aplicação Laravel é responsável pelo mecanismo v2, histórico, matching, temporizadores e replay. | O Cloud opera o runtime do namespace, ou sua equipe opera um Server sob sua administração. O Laravel executa clientes e workers remotos, não o runtime. |
| Pacote Composer | `durable-workflow/workflow` na linha estável 1.x. | `durable-workflow/workflow` da fonte oficial de artefatos 2.0. | `durable-workflow/sdk` da fonte oficial de publicação independente do SDK PHP. Ele não depende do mecanismo integrado. |
| Processos necessários | Processos web/CLI do Laravel e workers de fila Laravel ou Horizon. | Processos web/CLI do Laravel e workers de fila ou Horizon. Os papéis de agendador e reparo seguem a configuração de implantação integrada. | Processos da aplicação Laravel e um ou mais processos `php artisan durable-workflow:worker`. O Cloud fornece o runtime. A operação sob sua administração exige também Server e sua persistência. |
| Filas e armazenamento | Registros de workflow e histórico orientado a PHP ficam nos bancos de dados configurados do Laravel. Jobs de workflow, atividade, novas tentativas e temporizador ficam nos backends de fila do Laravel. | O histórico de eventos e as projeções ficam no banco de dados configurado da aplicação. Tarefas integradas normalmente usam filas Laravel. | O histórico durável e o estado das tarefas ficam na persistência do Cloud ou Server. `DURABLE_WORKFLOW_TASK_QUEUE` é uma identidade de fila remota consultada pelo worker do SDK, não uma conexão de fila Laravel. |
| Identidade de workflow/atividade | Classes PHP de workflow e atividade são identidades duráveis. | Configure aliases estáveis em `workflows.v2.types`. Classes continuam sendo implementações locais. | `#[Workflow('orders.fulfill')]` e `#[Activity('orders.reserve')]` publicam chaves de tipo de string estáveis durante o registro do worker. Não use nomes de classe PHP totalmente qualificados como contrato entre runtimes. |
| Credenciais | Credenciais da aplicação Laravel, banco de dados, cache e fila. A `APP_KEY` original continua fazendo parte da recuperação da v1. | Credenciais da aplicação Laravel, do banco de dados, cache, fila e de qualquer autenticação do Waterline integrado sob responsabilidade da aplicação hospedeira. | Processos da aplicação no Cloud recebem apenas uma credencial de controle, e processos de worker apenas uma credencial de worker. Uma implantação sob sua administração pode usar um token compartilhado ou credenciais equivalentes com escopo. Credenciais são entradas dos processos e ficam deliberadamente fora da configuração Laravel em cache. |
| Ferramentas operacionais | Logs/eventos Laravel, ferramentas de fila, Horizon, Waterline v1 e `workflow:v1:list` quando disponível. | Logs/eventos Laravel, ferramentas de fila, `workflow:v2:doctor`, comandos de histórico/reparo e Waterline integrado. | Diagnósticos do SDK passam pelo logger PSR do Laravel e por `WorkerDiagnosticEvent`. O Cloud inclui Managed Waterline. Operadores sob sua administração usam APIs/CLI do Server e podem implantar Waterline separadamente conectado ao namespace do Server. |
| Responsável pela transição e reversão | Sua equipe preserva o banco de dados v1, estado das filas, configuração e segredos como um único conjunto de recuperação. | Sua equipe separa os inícios de v1 e v2, mantém caminhos de reativação da v1 e decide quando tabelas/filas antigas podem ser retiradas. | Sua equipe direciona cada comando ao runtime responsável pela execução. O Cloud é responsável pela reversão do runtime no serviço gerenciado. Operadores sob sua administração são responsáveis pela persistência e reversão do Server. A reversão da aplicação deve manter as rotas para os runtimes antigo e novo até que suas execuções sejam terminais. |

O Cloud e o Server sob sua administração são alternativas dentro do modo de
serviço. Usuários do Cloud não instalam Server nem um serviço Waterline separado.
Operadores sob sua administração implantam, protegem, fazem backup, escalam e
atualizam Server. O Waterline é uma implantação opcional separada conectada ao
namespace sob responsabilidade do Server.

## Um caso de uso Laravel nos três modos {#one-laravel-use-case-in-all-three-modes}

Os exemplos reservam estoque para `orders.fulfill`. Mapeie deliberadamente a
classe da v1 estável para as chaves de tipo da v2 e mantenha essas chaves e a
fila de tarefas configurada estáveis. A reserva de estoque e o consumidor do
evento de negócio devem ser idempotentes, pois uma atividade pode executar mais
de uma vez após uma nova tentativa ou perda da confirmação de conclusão.

A ação da aplicação permanece a mesma em produção e nos testes:

| Modo | Ponto de entrada em produção | Ponto de entrada após habilitar seu fake |
| --- | --- | --- |
| Laravel v1 estável | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| Laravel 2.0 integrado | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| SDK PHP em modo de serviço | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

A injeção por construtor do Laravel continua disponível na fronteira da aplicação
em todos os modos. A v1 estável injeta dependências de atividade em `execute()`.
A v2 integrada e o modo de serviço pedem ao contêiner Laravel que construa os
objetos de workflow e atividade, então suas dependências de aplicação usam
construtores comuns. Mantenha tudo o que um workflow lê durante o replay
determinístico e baseado em configuração. Banco de dados, rede, relógio e outros
efeitos externos pertencem às atividades.

### Laravel v1 estável {#stable-v1-laravel}

Mantenha a [instalação estável da v1](/docs/1.x/installation/) e seus requisitos
reais de driver de fila. Esta implementação representativa usa um iniciador da
aplicação com injeção por construtor e serviços de atividade com injeção por método:

<!-- docs-example id="laravel.adoption.v1.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\Activity;
use Workflow\Workflow;
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;
use function Workflow\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public function execute(string $orderId): \Generator
    {
        return yield activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public function execute(
        OrderPolicy $orders,
        InventoryGateway $inventory,
        LoggerInterface $logger,
        Dispatcher $events,
        string $orderId,
    ): array {
        $orders->assertFulfillable($orderId);
        $reservation = $inventory->reserve($orderId);
        $logger->info('Inventory reserved', ['order_id' => $orderId]);
        $events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        $workflow = WorkflowStub::make(FulfillOrderWorkflow::class);
        $workflow->start($orderId, new WorkflowOptions('redis', 'orders'));
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

`config/queue.php` e o ambiente de implantação continuam selecionando a conexão
real da fila Laravel. Execute um worker para a fila configurada:

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

O fake estável executa a mesma ação de aplicação injetada usada em produção:

<!-- docs-example id="laravel.adoption.v1.fake" -->
```php
<?php

use Workflow\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

As asserções de eventos do Laravel continuam disponíveis ao testar a atividade
real. Não substitua workers da v1 apenas porque o SDK v2 foi adicionado em outra
parte da aplicação.

### Laravel 2.0 integrado {#20-embedded-laravel}

A instalação estável usa o mesmo pacote Workflow do guia de início rápido integrado:

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

Publique ou atualize `config/workflows.php` e atribua aliases estáveis ao mesmo
contrato de negócio. O arquivo publicado contém outras configurações obrigatórias
de v1 e v2. Mescle estes valores nos arrays existentes em vez de substituir
o arquivo completo por este trecho específico:

<!-- docs-example id="laravel.adoption.v2-embedded.config" -->
```php
<?php

return [
    'v2' => [
        'namespace' => env('DW_V2_NAMESPACE', 'production'),
        'types' => [
            'workflows' => [
                'orders.fulfill' => App\Workflows\FulfillOrderWorkflow::class,
            ],
            'activities' => [
                'orders.reserve' => App\Activities\ReserveInventoryActivity::class,
            ],
        ],
    ],
];
```

A API de autoria muda para `handle()` e deixa de usar yield para resultados de
atividade. O Laravel constrói os dois objetos, e a atividade continua sendo o
lugar correto para logs e eventos de negócio que representam efeitos externos:

<!-- docs-example id="laravel.adoption.v2-embedded.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\V2\Activity;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        WorkflowStub::make(FulfillOrderWorkflow::class, "order-{$orderId}")
            ->start($orderId);
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

Execute o worker de fila Laravel exatamente como uma implantação integrada exige:

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Use o fake integrado pela mesma ação da aplicação. Ele executa tarefas prontas
de workflow no mesmo processo e registra despachos de atividades:

<!-- docs-example id="laravel.adoption.v2-embedded.fake" -->
```php
<?php

use Workflow\V2\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');
while (WorkflowStub::runReadyTasks() > 0) {
}

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Esse fake exercita os registros duráveis e o histórico do modo integrado. Ele
não é o fake de cliente do SDK nem substitui um runtime de serviço.

### SDK PHP em modo de serviço no Laravel {#php-sdk-service-mode-in-laravel}

Instale o pacote SDK publicado de forma independente. Este comando é renderizado
a partir da fonte oficial dos artefatos publicados do SDK PHP, em vez de ser
copiado de uma release específica:

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

O Laravel 9 a 13 descobre o provider automaticamente. Publique a configuração
do pacote e liste as classes de handlers com atributos:

<!-- docs-example id="laravel.adoption.service.config" -->
```php
<?php

return [
    'runtime_url' => env('DURABLE_WORKFLOW_RUNTIME_URL', 'http://localhost:8080'),
    'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'production'),
    'task_queue' => env('DURABLE_WORKFLOW_TASK_QUEUE', 'orders'),
    'handlers' => [
        App\Workflows\FulfillOrderWorkflow::class,
        App\Activities\ReserveInventoryActivity::class,
    ],
    'poll_timeout_seconds' => 5,
];
```

O workflow de serviço usa as mesmas strings públicas da v2 integrada. O
contêiner Laravel constrói as duas classes de serviço com atributos:

<!-- docs-example id="laravel.adoption.service.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;

final class FulfillOrderWorkflow
{
    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    #[Workflow('orders.fulfill')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return $context->activity('orders.reserve', [$orderId]);
    }
}

final class ReserveInventoryActivity
{
    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    #[Activity('orders.reserve')]
    public function run(ActivityContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}
```

O código da aplicação injeta a interface do SDK nativa do Laravel em vez de
acessar uma fachada ou montar um cliente de transporte. A classe com atributo
fornece o tipo de workflow, e a configuração publicada fornece a fila de
tarefas padrão:

<!-- docs-example id="laravel.adoption.service.client" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\LaravelWorkflowClientInterface;
use DurableWorkflow\WorkflowHandleInterface;

final class StartOrderFulfillment
{
    public function __construct(
        private readonly LaravelWorkflowClientInterface $workflows,
    ) {
    }

    public function start(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->start(
            FulfillOrderWorkflow::class,
            [$orderId],
            workflowId: "order-{$orderId}",
        );
    }

    public function handle(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->handle(
            FulfillOrderWorkflow::class,
            "order-{$orderId}",
        );
    }
}
```

Depois de publicar a configuração, coloque em cache apenas configurações que
não sejam secretas. Defina `RUNTIME_URL` com o URI completo do runtime do
namespace provisionado no Cloud ou com a origem do Server sob sua administração.
Não acrescente `/api`.

Inicie o worker apenas com sua credencial do papel de worker:

<!-- docs-example id="laravel.adoption.service.worker" -->
```bash
php artisan vendor:publish --tag=durable-workflow-config
env -u DURABLE_WORKFLOW_TOKEN \
  -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  -u DURABLE_WORKFLOW_WORKER_TOKEN \
  DURABLE_WORKFLOW_RUNTIME_URL="$RUNTIME_URL" \
  DURABLE_WORKFLOW_NAMESPACE=production \
  DURABLE_WORKFLOW_TASK_QUEUE=orders \
  php artisan config:cache
env -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  DURABLE_WORKFLOW_WORKER_TOKEN="$WORKER_SECRET" \
  php artisan durable-workflow:worker
```

Sem uma substituição por `--queue`, o worker Artisan consulta a fila de tarefas
`orders` configurada. Seu diagnóstico de registro e consulta informa o runtime,
namespace, fila, tipos de workflow/atividade com atributos e papel da credencial
de worker antes do início das consultas normais.

Processos de aplicação/web/fila recebem `DURABLE_WORKFLOW_CLIENT_TOKEN`, e não
o token de worker. Operadores sob sua administração podem usar
`DURABLE_WORKFLOW_TOKEN` quando uma credencial for intencionalmente autorizada
para ambos os papéis.

O worker do SDK grava diagnósticos de ciclo de vida, novas tentativas, falhas
de handlers e encerramento pelo logger PSR do Laravel e despacha
`DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` pelos eventos do Laravel.
Atividades de negócio podem continuar usando o logger e o dispatcher de eventos
injetados, como mostrado acima.

O fake de fachada fornecido substitui a mesma interface injetada usada pelo
código da aplicação:

<!-- docs-example id="laravel.adoption.service.fake" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\Facades\DurableWorkflow;

$workflows = DurableWorkflow::fake()
    ->setWorkflowResult('order-1001', ['status' => 'fulfilled']);

app(StartOrderFulfillment::class)->start('1001');
$result = app(StartOrderFulfillment::class)->handle('1001')->result();

$this->assertSame(['status' => 'fulfilled'], $result);
$workflows->assertWorkflowStarted(
    FulfillOrderWorkflow::class,
    ['1001'],
    workflowId: 'order-1001',
);
$workflows->assertResultRequested('order-1001');
```

Esse fake comprova a interação da aplicação Laravel sem exigir Cloud ou Server.
Use o ambiente de testes de worker do SDK ao testar comandos de handlers de
workflow/atividade. O fake de cliente não executa código de worker remoto.

## Drene, faça a transição e reverta {#drain-cut-over-and-roll-back}

Alterar um requisito do Composer não move um workflow em andamento, seu histórico,
um temporizador atrasado, uma nova tentativa de atividade ou um job de fila
pronto/reservado. Trate os runtimes antigo e novo como sistemas duráveis
separados durante toda a transição.

### 1. Estabeleça o ponto consistente de recuperação {#1-establish-the-recovery-cut}

Antes de alterar o tráfego:

- Faça um inventário da conexão de banco de dados v1/integrada, de todas as filas
  de workflow e atividade configuradas, da conta/região/prefixo do backend de
  fila, dos locks de cache e da referência no gerenciador de segredos à `APP_KEY` original.
- Bloqueie novos inícios e a entrada de mensagens pelo tempo necessário para
  deixar a origem quiescente. Pare todos os workers após a conclusão do job
  atual. `queue:restart` sozinho não deixa o sistema quiescente quando um
  supervisor substitui imediatamente o processo.
- Deixe todas as execuções de origem terminarem ou capture um ponto de
  recuperação consistente para a aplicação contendo SQL e todos os jobs de fila
  prontos, atrasados e reservados. Um backup somente do banco de dados não recria
  temporizadores, novas tentativas ou atividades mantidos em filas.
- Registre qual runtime é responsável por cada ID de workflow não terminal.
  Sinais, consultas, atualizações, cancelamento, término, reparo e leituras de
  resultado devem continuar seguindo esse registro de responsabilidade.

### 2. Aplique a regra específica do caminho {#2-apply-the-path-specific-rule}

| Transição | Execuções não terminais existentes | Novas execuções após a transição | Fronteira de reversão |
| --- | --- | --- | --- |
| v1 para 2.0 integrado | Conclua pelo caminho de compatibilidade v1. Mantenha suas tabelas v1, requisitos de decodificação PHP, consumidores de filas Laravel e estado das filas até o estado terminal. | Inicie por `Workflow\V2\WorkflowStub` apenas depois que o teste canário da v2 passar. | Restaure o ponto de recuperação correspondente de SQL/filas da v1 e a configuração exata da aplicação, ou corrija avançando. Não restaure SQL sobre um estado de filas mais novo. |
| v1 para Cloud ou modo de serviço sob sua administração | Permanecem na v1. O histórico v1 não pode ser importado no runtime de serviço nem passar por replay em workers remotos. | Inicie com `LaravelWorkflowClientInterface` depois que um worker do SDK registrado anunciar as chaves de tipo esperadas. | Direcione novos inícios de volta à v1 apenas se o runtime v1 continuar saudável. Execuções já aceitas pelo modo de serviço permanecem lá. |
| v2 integrada para Cloud | Deixe as execuções integradas terminarem no lugar. A integração inicial do Cloud não transforma uma mudança de pacote em importação de histórico. | Inicie no namespace provisionado no Cloud após as verificações de credenciais de cliente/worker e fila de tarefas passarem. | Direcione novos inícios de volta ao modo integrado se necessário. Mantenha comandos de execuções aceitas pelo Cloud direcionados ao Cloud. |
| v2 integrada para Server sob sua administração | Deixe terminar no lugar ou execute separadamente a exportação, simulação e importação atômica suportadas para uma execução quiescente e elegível da v2 integrada. Nunca deduza elegibilidade pela instalação do pacote. | Inicie pelo SDK após as verificações de descoberta do Server, namespace, registro de workers e fila passarem. | Uma importação com falha não grava uma execução parcial. Após a confirmação da importação, o Server é responsável pela execução. Não retome a cópia integrada. |

Para a opção de importação sob sua administração, use o
[procedimento completo de migração do modo integrado para Server](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs).
Ele rejeita v1, histórico com dados ocultados, tarefas com lease, tentativas de
atividade em andamento e outros snapshots inseguros. Uma exportação de histórico
por si só é dado de auditoria/depuração. Apenas essa operação explícita e
validada de importação cria estado sob responsabilidade do Server.

### 3. Comprove o destino antes de mudar o tráfego {#3-prove-the-destination-before-switching-traffic}

1. Configure um namespace, uma fila de tarefas e um conjunto estável de tipos de workflow/atividade.
2. Inicie o runtime de destino e seus workers do SDK ao lado do runtime antigo.
3. Verifique a descoberta do Server ou o provisionamento do Cloud, credenciais
   de papéis, registro de workers, chaves de tipo anunciadas, visibilidade da
   fila de tarefas e diagnósticos Laravel.
4. Envie um pedido de sombra/canário com identificação única e aguarde um
   resultado terminal na interface do operador do destino.
5. Mude os novos inícios uma família de workflows por vez. Impeça que a mesma
   chave de negócio seja iniciada nos dois runtimes.
6. Mantenha os workers de origem, estado das filas, credenciais, logs/eventos e
   a interface antiga do operador até que toda execução da origem seja terminal
   ou tenha concluído uma importação suportada para Server sob sua administração.

Retirar um pacote, fila, tabela, segredo ou implantação Waterline antiga é a
última etapa, nunca o mecanismo de transição.

## Continue pelo caminho escolhido {#continue-with-the-chosen-path}

- [Instalação da v1 estável](/docs/1.x/installation/)
- [Planejamento de migração da v1 estável](/docs/migration/)
- [Instalação integrada 2.0](/docs/installation/)
- [Migração detalhada do pacote da v1 para v2](/docs/migration/)
- [SDK PHP em modo de serviço](/docs/polyglot/php/)
- [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/)
- [Server sob sua administração](/docs/polyglot/server/)
- [v2 integrada para Server sob sua administração](/docs/polyglot/embedded-to-server/)
