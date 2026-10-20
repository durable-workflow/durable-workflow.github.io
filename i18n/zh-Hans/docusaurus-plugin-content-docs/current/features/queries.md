---
sidebar_position: 2
---

import QuerySimulator from '@site/src/components/QuerySimulator';

# 查询 {#queries}

查询可获取工作流当前状态的信息，不影响其执行，适用于监控和调试。

## 可安全重放的查询方法 {#replay-safe-query-methods}

查询会重放当前所选运行的已提交历史，然后在已恢复状态的工作流对象上调用带特性的方法。它不会隐式应用已接受但尚未应用的信号或更新命令。

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

final class ApprovalWorkflow extends Workflow
{
    private string $stage = 'booting';

    public function handle(): void
    {
        $this->stage = 'waiting-for-approval';

        await('approved-by');

        $this->stage = 'approved';
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[QueryMethod('starts-with')]
    public function startsWith(string $prefix): bool
    {
        return str_starts_with($this->stage, $prefix);
    }
}
```

通过公开实例 ID 访问当前运行：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->currentStage(); // "waiting-for-approval"
$workflow->query('starts-with', 'waiting'); // true
$workflow->queryWithArguments('starts-with', ['prefix' => 'waiting']); // true
```

需要显式固定某个历史运行或所选运行时，请通过 `loadRun($runId)` 查询：

```php
$selectedRun = WorkflowStub::loadRun($runId);

$selectedRun->currentStage();
```

查询行为：

- 查询可安全重放：只观察已提交历史，不修改工作流状态。
- 参数转发给带特性的方法。使用 `#[QueryMethod('public-name')]` 声明稳定的公开名称，使调用在 PHP 方法重命名后仍有效。
- `load($instanceId)` 查询实例最新的持久运行；`loadRun($runId)` 指向某个具体运行，适用于查询 continue-as-new 前的状态。
- 已接受但尚未应用的信号和更新可在命令历史中查看，但在 Worker 记录 `SignalApplied` / `UpdateApplied` 前，不属于已应用状态。

使用 `QueryMethod` 特性定义工作流查询方法。可选字符串参数可固定公开的持久查询名称，使其不受 PHP 方法重命名影响：

```php
use Workflow\QueryMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[QueryMethod('is-ready')]
    public function getReady(): bool
    {
        return $this->ready;
    }
}
```

要查询工作流，请在工作流实例上调用该方法。查询方法会返回工作流中的数据。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->getReady();
$sameReady = $workflow->query('is-ready');
```

调用方已有位置参数列表或具名参数映射时，使用 `queryWithArguments()`：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$workflow->queryWithArguments('starts-with', [
    'prefix' => 'wait',
]);
```

Waterline 使用所选运行的查询契约接口。仪表板在信号和更新旁展示 `declared_query_targets[*]`，但只有 `can_query = true` 时才显示查询执行功能。所选运行或当前运行的查询操作将 JSON `arguments` 提交到 `/waterline/api/instances/{instanceId}/queries/{query}` 或 `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}`。执行查询仍需要可加载的工作流定义，因为调用查询方法前必须重放所选运行。如果持久查询目标存在但定义不可用，所选运行详情报告 `can_query = false` 和 `query_blocked_reason = workflow_definition_unavailable`，查询 POST 返回 HTTP `409 Conflict` 和 `blocked_reason = workflow_definition_unavailable`。如果运行仅有不完整快照，且当前构建无法完成回填，详情报告 `declared_contract_source = unavailable`；保留下来的查询目标仍作为诊断元数据可见，但在兼容构建持久化缺失契约前，具名查询参数仍会收到 `422` 拒绝。

公开 Webhook 桥接在 Waterline 之外提供相同的可安全重放查询接口：

```text
POST /webhooks/instances/{instanceId}/queries/{query}
POST /webhooks/instances/{instanceId}/runs/{runId}/queries/{query}
```

这些 Webhook 路由接受与 Waterline 相同的 JSON `arguments` 字段，成功时返回类型化 JSON `result`，无效参数和重放阻塞也使用相同错误结构，分别为带 `validation_errors` 的 `422` 和带 `blocked_reason` 的 `409`。当前工作流定义仍可加载时，调用方可使用持久 `#[QueryMethod('public-name')]` 目标或底层 PHP 方法名访问查询；成功的 HTTP 响应会将 `query_name` 规范化回持久公开目标，避免外部调用方依赖方法重命名细节。

<QuerySimulator />

**注意：** 查询工作流不会推进执行，信号则会。
