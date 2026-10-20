---
sidebar_position: 4
title: Laravel 采用与运行时迁移
description: 将 Laravel 工作流集群从 v1 迁移到 Durable Workflow 2.0 嵌入或服务模式，同时保留框架集成并明确运行时归属。
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - Laravel Durable Workflow 迁移
  - Laravel 服务模式
  - v1 到 v2 迁移
  - 嵌入模式到服务模式
---

# Laravel 采用与运行时迁移 {#laravel-adoption-and-runtime-transition}

Laravel 应用有两个第一方 Durable Workflow 2.0 目标。嵌入模式让持久执行留在应用内。服务模式保留 Laravel 作为应用和 Worker 框架，由 Cloud 或自托管 Server 拥有持久状态。

本页帮助你对以下三种路径作出决策并完成迁移：

1. 稳定 v1 Laravel 到 2.0 嵌入模式。
2. 稳定 v1 Laravel 到服务模式的 2.0 PHP SDK。
3. 2.0 嵌入式 Laravel 到服务模式的 2.0 PHP SDK。

如果当前目标是软件包级 v1 升级，请同时参阅详细的 [2.0 迁移指南](/docs/migration/)。如果已选择自托管服务运行时，在此选定迁移策略后，继续阅读[嵌入模式到 Server 运维手册](/docs/polyglot/embedded-to-server/)。

## 选择目标 {#pick-the-destination}

| 起点 | 目标 | 何时选择 | 首个迁移边界 |
| --- | --- | --- | --- |
| 稳定 v1 Laravel | 2.0 嵌入模式 | Laravel 应用应继续拥有工作流持久化、队列、执行和嵌入式 Waterline。 | 将维护中的 `durable-workflow/workflow` 软件包升级至 2.0 发布系列。现有 v1 运行实例通过软件包的 v1 兼容路径完成；新启动使用 v2。 |
| 稳定 v1 Laravel | PHP SDK 服务模式 | Laravel 应保留依赖注入、配置、Artisan、日志、事件和测试 fake，但由 Cloud 或 Server 拥有持久状态。 | 安装 `durable-workflow/sdk` 作为独立服务客户端/Worker 边界。v1 历史和持久 Laravel 队列 job 留在 v1 运行时，直到进入终态。 |
| 2.0 嵌入式 Laravel | PHP SDK 服务模式 | 应用应不再拥有编排运行时，或需要共享/多语言运行时边界。 | 服务 Worker 就绪后，将新启动路由到服务运行时。嵌入运行实例在原处排空，或对自托管 Server 使用明确的符合条件的嵌入 v2 导入流程。 |

PHP SDK 桥接和嵌入软件包在各自兼容的 PHP 版本上支持 Laravel 9 至 13。因此，受支持的 v1 应用无需进行无关的 Laravel 升级即可选择任一目标。

## 比较归属边界 {#compare-the-ownership-boundary}

| 关注点 | 稳定 v1 Laravel | 2.0 嵌入式 Laravel | 2.0 PHP SDK 服务模式 |
| --- | --- | --- | --- |
| 运行时负责方 | Laravel 应用负责编排和重放。 | Laravel 应用负责 v2 引擎、历史、匹配、定时器和重放。 | Cloud 运维命名空间运行时，或你的团队运维自托管 Server。Laravel 运行客户端和远程 Worker，不运行编排运行时。 |
| Composer 软件包 | 稳定 1.x 系列的 `durable-workflow/workflow`。 | 来自 2.0 产物权威来源的 `durable-workflow/workflow`。 | 来自独立发布的 PHP SDK 权威来源的 `durable-workflow/sdk`。它不依赖嵌入引擎。 |
| 必需进程 | Laravel Web/CLI 进程，加 Laravel 队列 Worker 或 Horizon。 | Laravel Web/CLI 进程，加队列 Worker 或 Horizon；调度器和修复角色遵循嵌入部署配置。 | Laravel 应用进程，加一个或多个 `php artisan durable-workflow:worker` 进程。Cloud 提供运行时。自托管还需要 Server 及其持久化。 |
| 队列与存储 | 工作流行和面向 PHP 的历史位于配置的 Laravel 数据库；工作流、活动、重试和定时器 job 位于 Laravel 队列后端。 | 事件历史和投影位于应用配置的数据库；嵌入任务通常使用 Laravel 队列。 | 持久历史和任务状态位于 Cloud 或 Server 持久化中。`DURABLE_WORKFLOW_TASK_QUEUE` 是 SDK Worker 轮询的远程任务队列身份，不是 Laravel 队列连接。 |
| 工作流/活动身份 | PHP 工作流和活动类是持久身份。 | 在 `workflows.v2.types` 下配置稳定别名；类仍是本地实现。 | `#[Workflow('orders.fulfill')]` 和 `#[Activity('orders.reserve')]` 在 Worker 注册时发布稳定字符串类型键。不要把 PHP FQCN 当作跨运行时契约。 |
| 凭据 | Laravel 应用、数据库、缓存和队列凭据；原始 `APP_KEY` 仍是 v1 恢复的一部分。 | Laravel 应用凭据，以及宿主应用拥有的数据库、缓存、队列和任何嵌入 Waterline 身份验证。 | Cloud 应用进程仅接收控制凭据，Worker 进程仅接收 Worker 凭据。自托管部署可使用一个共享令牌或等价的限定权限凭据。凭据是进程输入，刻意不进入缓存的 Laravel 配置。 |
| 运维工具 | Laravel 日志/事件、队列工具、Horizon、v1 Waterline，以及可用时的 `workflow:v1:list`。 | Laravel 日志/事件、队列工具、`workflow:v2:doctor`、历史/修复命令和嵌入式 Waterline。 | SDK 诊断通过 Laravel PSR logger 和 `WorkerDiagnosticEvent` 传递。Cloud 包含 Managed Waterline。自托管操作人员使用 Server API/CLI，也可单独部署 Waterline 连接 Server 命名空间。 |
| 切换与回滚负责方 | 你的团队将 v1 数据库、队列状态、配置和密钥保存为一套恢复集。 | 你的团队区分 v1 与 v2 启动、保留 v1 唤醒路径，并决定何时退役旧表/队列。 | 你的团队将每条命令路由到拥有其运行实例的运行时。Cloud 负责托管服务内的运行时回滚；自托管操作人员负责 Server 持久化和回滚。应用回滚必须保留新旧运行时路由，直到对应运行实例终结。 |

Cloud 和自托管 Server 是服务模式中的两种选择。Cloud 用户不安装 Server 或独立 Waterline 服务。自托管操作人员负责 Server 的部署、安全、备份、扩缩和升级；Waterline 是连接 Server 管理的命名空间的独立可选部署。

## 同一个 Laravel 用例的三种模式 {#one-laravel-use-case-in-all-three-modes}

这些示例为 `orders.fulfill` 预留库存。明确地将稳定 v1 类映射到 v2 类型键，之后保持这些 v2 类型键及配置的任务队列稳定。库存预留和业务事件使用方必须幂等，因为重试或完成确认丢失后，活动可能执行多次。

生产和测试中的应用操作相同：

| 模式 | 生产入口 | 启用对应 fake 后的入口 |
| --- | --- | --- |
| 稳定 v1 Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| 2.0 嵌入式 Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| PHP SDK 服务模式 | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

每种模式在应用边界都保留 Laravel 构造函数注入。稳定 v1 将活动依赖注入 `execute()`。嵌入 v2 和服务模式都请求 Laravel 容器构造工作流和活动对象，因此应用依赖使用普通构造函数。重放工作流读取的内容应保持确定性并基于配置；数据库、网络、时钟和其他副作用应放在活动中。

### 稳定 v1 Laravel {#stable-v1-laravel}

保留[稳定 v1 安装](/docs/1.x/installation/)及其真实队列驱动要求。以下代表性实现使用构造函数注入的应用启动器和方法注入的活动服务：

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

`config/queue.php` 和部署环境仍负责选择真实 Laravel 队列连接。为配置的队列运行 Worker：

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

稳定版 fake 运行生产中使用的同一个注入式应用操作：

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

测试真实活动时，仍可使用 Laravel 事件断言。不要仅因应用其他地方添加了 v2 SDK 就替换 v1 Worker。

### 2.0 嵌入式 Laravel {#20-embedded-laravel}

稳定安装使用与嵌入式快速入门相同的 Workflow 软件包：

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

发布或更新 `config/workflows.php`，再为同一业务契约分配稳定别名。发布的文件还包含其他必需的 v1 和 v2 设置；应将这些值合入现有数组，而不是用此局部摘录替换整个文件：

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

编写 API 改为 `handle()`，不再 yield 活动结果。Laravel 构造两个对象，活动仍是执行日志和业务事件等副作用的正确位置：

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

按嵌入部署的要求运行 Laravel 队列 Worker：

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

通过同一个应用操作使用嵌入式 fake。它内联执行就绪工作流任务并记录活动分发：

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

此 fake 测试嵌入式持久行和历史。它不是 SDK 客户端 fake，也不代表服务运行时。

### Laravel 中的 PHP SDK 服务模式 {#php-sdk-service-mode-in-laravel}

安装独立发布的 SDK 软件包。此命令根据已发布 PHP SDK 产物权威来源渲染，不是从某个具体发布复制的：

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9 至 13 自动发现 provider。发布软件包配置，并列出带属性标记的处理器类：

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

服务工作流使用与嵌入 v2 相同的公开字符串。Laravel 容器构造两个带属性标记的服务类：

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

应用代码注入 Laravel 原生 SDK 接口，无需通过 facade 间接访问或自行组装传输客户端。带属性标记的类提供工作流类型，已发布配置提供默认任务队列：

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

发布配置后，仅缓存非密钥设置。将 `RUNTIME_URL` 设置为已提供的完整 Cloud 命名空间运行时 URI，或自托管 Server 源地址；不要追加 `/api`。

仅向 Worker 提供其 Worker 角色凭据并启动：

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

没有 `--queue` 覆盖时，Artisan Worker 轮询配置的 `orders` 任务队列。其“已注册并开始轮询”诊断会在正常轮询开始前列出运行时、命名空间、队列、带属性标记的工作流/活动类型和 Worker 凭据角色。

应用/Web/队列进程则接收 `DURABLE_WORKFLOW_CLIENT_TOKEN`，不接收 Worker 令牌。自托管操作人员有意授权一个凭据承担两种角色时，可使用 `DURABLE_WORKFLOW_TOKEN`。

SDK Worker 通过 Laravel PSR logger 输出生命周期、重试、处理器失败和关闭诊断，并通过 Laravel 事件分发 `DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent`。业务活动可以继续使用上文中的注入式 logger 和事件 dispatcher。

随包提供的 facade fake 替换应用代码使用的同一个注入接口：

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

此 fake 无需 Cloud 或 Server 即可验证 Laravel 应用交互。测试工作流/活动处理器命令时，使用 SDK Worker 测试框架；客户端 fake 不执行远程 Worker 代码。

## 排空、切换与回滚 {#drain-cut-over-and-roll-back}

修改 Composer 依赖要求不会移动正在进行的工作流、历史、延迟定时器、活动重试或就绪/已保留队列 job。整个迁移期间，应将新旧运行时视为独立的持久系统。

### 1. 建立恢复切点 {#1-establish-the-recovery-cut}

改变流量前：

- 盘点 v1/嵌入式数据库连接、所有配置的工作流和活动队列、队列后端账号/区域/前缀、缓存锁，以及原始 `APP_KEY` 的密钥管理器引用。
- 阻止新启动和消息入口足够长时间，使源端静止。每个 Worker 完成当前 job 后停止它；若 supervisor 立即替换进程，单独执行 `queue:restart` 不构成静止状态。
- 排空全部源端运行实例，或捕获应用一致的恢复切点，包含 SQL 及全部就绪、延迟和已保留队列 job。仅备份数据库无法重建由队列承载的定时器、重试或活动。
- 记录每个非终态工作流 ID 归哪个运行时所有。信号、查询、更新、取消、终止、修复和结果读取必须继续遵循该归属记录。

### 2. 应用具体路径规则 {#2-apply-the-path-specific-rule}

| 迁移 | 现有非终态运行实例 | 切换后的新运行实例 | 回滚边界 |
| --- | --- | --- | --- |
| v1 到 2.0 嵌入模式 | 通过 v1 兼容路径完成。保留 v1 表、PHP 解码要求、Laravel 队列使用方和队列状态，直到终结。 | 仅在 v2 金丝雀验证通过后，通过 `Workflow\V2\WorkflowStub` 启动。 | 恢复匹配的 v1 SQL/队列恢复切点和确切应用配置，或向前修复。不要将 SQL 恢复到更新的队列状态之上。 |
| v1 到 Cloud 或自托管服务模式 | 留在 v1。v1 历史不能导入服务运行时，也不能由远程 Worker 重放。 | 已注册 SDK Worker 声明预期类型键后，通过 `LaravelWorkflowClientInterface` 启动。 | 仅在 v1 运行时仍健康时将新启动路由回 v1。已被服务模式接受的运行实例留在那里。 |
| 嵌入 v2 到 Cloud | 原地排空嵌入运行实例；Cloud 入门不会将软件包修改变成历史导入。 | 客户端/Worker 凭据和任务队列检查通过后，在提供的 Cloud 命名空间中启动。 | 必要时将新启动路由回嵌入模式；Cloud 已接受运行实例的命令仍指向 Cloud。 |
| 嵌入 v2 到自托管 Server | 原地排空，或对符合条件、已静止的嵌入 v2 运行实例单独执行受支持的导出、试运行和原子导入。绝不根据软件包已安装就推断符合条件。 | Server 发现、命名空间、Worker 注册和队列检查通过后，通过 SDK 启动。 | 导入失败不写入部分运行实例。导入提交后，Server 拥有该运行实例；不要恢复嵌入副本。 |

自托管导入选项请使用完整的[嵌入模式到 Server 迁移流程](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs)。它拒绝 v1、脱敏历史、已租出任务、正在运行的活动尝试及其他不安全快照。单独的历史导出是审计/调试数据；只有该明确、经过验证的导入操作才创建由 Server 管理的状态。

### 3. 切换流量前证明目标可用 {#3-prove-the-destination-before-switching-traffic}

1. 配置一个命名空间、任务队列和稳定工作流/活动类型集。
2. 在旧运行时旁启动目标运行时及其 SDK Worker。
3. 验证 Server 发现或 Cloud 开通、角色凭据、Worker 注册、声明的类型键、任务队列可见性和 Laravel 诊断。
4. 发送有唯一标识的影子/金丝雀订单，等待其在目标操作界面进入终态结果。
5. 每次切换一个工作流族的新启动。防止同一业务键在两个运行时中都启动。
6. 保留源 Worker、队列状态、凭据、日志/事件和旧操作界面，直到全部源端运行实例进入终态，或完成受支持的自托管导入。

退役旧软件包、队列、表、密钥或 Waterline 部署是最后一步，绝不是切换机制。

## 按所选路径继续 {#continue-with-the-chosen-path}

- [稳定 v1 安装](/docs/1.x/installation/)
- [稳定 v1 迁移规划](/docs/migration/)
- [2.0 嵌入式安装](/docs/installation/)
- [详细 v1 到 v2 软件包迁移](/docs/migration/)
- [PHP SDK 服务模式](/docs/polyglot/php/)
- [Cloud 托管运行时](/docs/polyglot/cloud-control-plane/)
- [自托管 Server](/docs/polyglot/server/)
- [嵌入 v2 到自托管 Server](/docs/polyglot/embedded-to-server/)

