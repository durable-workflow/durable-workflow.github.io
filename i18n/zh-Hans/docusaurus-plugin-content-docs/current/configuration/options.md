---
sidebar_position: 2
---

# 选项 {#options}

定义工作流和活动时，可以配置多种选项，包括失败前允许尝试的次数、连接和队列，以及允许运行的最长秒数。

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

`Workflow\V2\Workflow` 和 `Workflow\V2\Activity` 的 `$connection` 与 `$queue` 属性声明为 `public ?string`，默认值为 `null`。子类覆盖时必须保留可空类型，才能符合 PHP 公共属性类型的不变性规则。希望继承应用的默认连接或队列时，使用 `null`，无需硬编码值。

活动超时不通过类属性配置。请逐次调用使用 [`ActivityOptions`](#activityoptions)（如 `startToCloseTimeout`），或使用调度时保存的活动重试策略快照。Worker 循环的时间设置另见[任务修复策略](/docs/polyglot/server-config-reference#workflow-package-controls)。

## StartOptions {#startoptions}

`Workflow\V2\StartOptions` 在启动工作流时携带可见性、去重和执行超时配置。它不选择队列；队列路由由工作流和活动类的 `$connection`、`$queue` 属性，以及逐调用的 `ActivityOptions` 决定。

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

`StartOptions` 由工作流引擎使用，不作为参数传入工作流的 `handle()` 方法。它们随工作流持久化，用于后续的工作流／活动派发，包括重放和 continue-as-new 行为。

## ActivityOptions {#activityoptions}

`Workflow\V2\Support\ActivityOptions` 在调用活动时提供逐调用的路由、重试和超时覆盖，无需修改活动类本身：

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

`ActivityOptions` 中的路由覆盖项在调度新的活动执行时生效，不会移动已记录在历史中的活动。更换工作器池前，请参阅[已记录的活动队列](../polyglot/task-matching-dispatch.md#recorded-activity-queues)。

## 连接 {#connection}

`$connection` 指定工作流或活动发送到哪个队列连接。默认不设置 `$connection`，即使用默认连接。可通过设置工作流或活动类的 `$connection` 属性覆盖。

## 队列 {#queue}

`$queue` 指定工作流或活动加入哪个队列。默认不设置 `$queue`，即使用指定连接的默认队列。可通过设置工作流或活动类的 `$queue` 属性覆盖。

活动在调度时保存解析后的连接和队列。即使类默认值或每次调用的选项发生变化，重试和修复后的任务仍使用已记录的路由。现有工作流运行也保留其已记录的工作流队列。只要这些依赖仍存在，就应在旧队列上保留兼容的工作器。请遵循[队列切换流程](../polyglot/task-matching-dispatch.md#recorded-activity-queues)。

## 重试 {#retries}

`$tries` 控制活动被判定为失败前允许的总尝试次数。默认 `$tries` 为 `1`，即只尝试一次，不自动重试。将 `$tries` 设为大于 `1` 的值以允许重试，设为 `0` 则无限重试。可通过 `ActivityOptions::$maxAttempts` 逐调用覆盖。

## 超时 {#timeout}

v2 `Activity` 基类没有 `$timeout` 类属性。请通过 [`ActivityOptions`](#activityoptions) 的 `startToCloseTimeout`、`scheduleToStartTimeout`、`scheduleToCloseTimeout` 或 `heartbeatTimeout` 逐调用配置超时。运行时在调度活动执行时保存最终重试策略的快照，因此即使后续部署更改活动类或选项，已调度尝试的超时仍保持不变。Worker 循环级派发时间由[任务修复策略](/docs/polyglot/server-config-reference#workflow-package-controls)控制。

## 退避 {#backoff}

`backoff` 方法返回整数数组，各项对应相应尝试的退避时间。默认 `backoff` 采用指数退避，最长为 2 分钟。可在活动类中实现 `backoff` 方法进行覆盖。

## 命名空间 {#namespace}

工作流可以限定在命名空间内，实现多命名空间隔离。配置的命名空间同时适用于控制平面启动 API 和 `Workflow\V2\WorkflowStub::make()->start()`，并持久化到新实例、运行、持久任务和运行摘要投影中。任务轮询和 Waterline 可见性过滤器可将结果限制在单个命名空间。请使用 Workflow 2.4.2 或更新版本，确保两个 PHP 启动 API 的命名空间分配一致。

命名空间名称只能包含小写字母、数字、点、下划线和连字符，须匹配 `[a-z0-9._-]+`，最多 128 个字符。

通过环境变量设置默认命名空间：

```env
DW_V2_NAMESPACE=production
```

或在 `config/workflows.php` 中设置：

```php
'v2' => [
    'namespace' => env('DW_V2_NAMESPACE'),
    // ...
],
```

显式传入的命名空间覆盖配置的默认值。stub 的 `make()` 接受它作为第三个参数：

```php
$workflow = \Workflow\V2\WorkflowStub::make(
    OrderProcessingWorkflow::class,
    'order-12345',
    'staging',
);
$workflow->start();
```

控制平面在 `start()` 选项中接受该值：

```php
$controlPlane->start('order-processing', 'order-12345', [
    'namespace' => 'staging',
    // ...
]);
```

未配置命名空间且未显式传入时，新实例的命名空间保留为 `null`。限定命名空间的观察者不会包含这些运行。更改配置不会重新分配已有实例。通过不同命名空间启动已有实例会被拒绝。

### Waterline 命名空间范围 {#waterline-namespace-scoping}

Waterline 部署在包含多个命名空间的共享数据库上时，设置 `WATERLINE_NAMESPACE` 可将所有列表视图限制在一个命名空间：

```env
WATERLINE_NAMESPACE=production
```

这会向每个可见性查询注入命名空间过滤器，使 Waterline 仅显示配置命名空间中的工作流。设置后，Waterline 也将所有命令操作（取消、信号、终止、更新、修复、归档和查询）限定到该命名空间。命令若指向其他命名空间的实例或运行，将返回 404，不会执行。

### 命令命名空间范围 {#command-namespace-scoping}

`WorkflowStub::load()`、`loadSelection()` 和 `loadRun()` 接受可选的 `namespace` 参数：

```php
use Workflow\V2\WorkflowStub;

// Load only if the instance belongs to the given namespace
$stub = WorkflowStub::load('order-12345', namespace: 'production');

// Load a specific run, scoped to namespace
$stub = WorkflowStub::loadRun($runId, namespace: 'production');

// Load a specific selection, scoped to namespace
$stub = WorkflowStub::loadSelection('order-12345', $runId, namespace: 'production');
```

`namespace` 为 `null`（默认值）时，加载操作不限定范围，可访问所有命名空间，以保持向后兼容。提供命名空间时，查询会在数据库层按命名空间过滤；工作流在该命名空间中不存在时，抛出 `ModelNotFoundException`。

控制平面命令方法（`signal`、`cancel`、`terminate`、`update`、`repair`、`archive`）也在选项数组中接受 `namespace`：

```php
$controlPlane->cancel('order-12345', [
    'namespace' => 'production',
]);
```

### 任务桥接的命名空间过滤 {#task-bridge-namespace-filtering}

工作流任务桥接和活动任务桥接的 `poll()` 都接受可选的 `namespace` 参数：

```php
$tasks = $bridge->poll('redis', 'default', limit: 10, namespace: 'production');
```

省略该参数时，`poll()` 返回所有命名空间的任务，兼容尚未使用命名空间的安装。

## 持久类型别名 {#durable-type-aliases}

在 `workflows.v2.types` 下注册工作流和活动时，会保存持久类型键。故障载荷也可对异常类使用相同模式：

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

活动、更新、子工作流或工作流的故障以异常别名记录时，引擎将别名保存为类型化历史中的 `exception_type` 和故障载荷中的 `type`。重放先解析别名，再回退到记录的 PHP 类。因此，只要别名仍指向当前可抛出类，后续移动类也能保持工作流的 `catch` 语义稳定。

对于在异常别名出现前记录并导入的 v1 故障，`workflows.v2.types.exception_class_aliases` 可将记录的旧异常完全限定类名映射到当前可抛出类。持久 `exceptions` 类型别名仍具有最高优先级。类别名映射仅用于衔接重构前已记录且没有持久 `type` 的载荷；新工作流应使用持久异常类型别名，使历史独立于 PHP 类名。

最终版 v2 在记录故障时写入持久异常别名，因此，对以后可能移动可抛出类的故障，应在记录前配置稳定别名。

如果重放的故障无法通过持久 `exceptions` 映射、类别名映射或记录的类解析，引擎不会在工作流代码中回退为通用运行时异常。查询重放会抛出 `UnresolvedWorkflowFailureException`，Waterline 将故障标记为 `exception_replay_blocked = true`，遇到同样缺口的 Worker 任务会保持失败，而运行仍保持打开。请修正映射并修复运行，不要依赖宽泛的 `catch (RuntimeException)` 来处理已重命名的历史故障。
