---
sidebar_position: 3
---

# 更新 {#updates}

更新允许在获取工作流当前状态信息的同时修改工作流状态，相当于将查询与信号结合为一个操作。

## 显式更新命令 {#explicit-update-commands}

每个被接受的更新：

- 是面向运行中工作流的请求／响应调用。`attemptUpdate*()` 等待处理器完成；`submitUpdate*()` 在命令被持久接受后立即返回，之后可通过 `inspectUpdate($updateId)` 轮询。
- 在命令历史和 Webhook 路由中使用声明的持久更新名称。`#[UpdateMethod('mark-approved')]` 使公开可调用名称在 PHP 方法重命名后仍保持稳定。
- 拒绝针对历史运行或已关闭运行的请求，不会悄然修改当前运行。
- 在处理器运行前，将未声明方法名以 `rejected_unknown_update` 拒绝，将不符合契约的参数以 `rejected_invalid_arguments` 拒绝，并提供机器可读的 `validation_errors`。

更新与查询一样，先重放已提交历史。与查询不同，更新允许修改可安全重放的工作流状态，并返回一个值。

使用 `UpdateMethod` 特性定义工作流更新方法。可选字符串参数可固定公开的持久名称，使其不受 PHP 方法重命名影响：

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

需要原始返回值时，直接调用更新方法：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

直接 PHP 调用仍使用方法名，持久命令目标仍是 `mark-ready`。

还需要持久命令结果时，使用 `attemptUpdate()`，并传入持久更新名称：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` 先记录已接受的更新，再等待工作流 Worker 应用它并关闭更新生命周期后返回。等待受 `workflows.v2.update_wait.completion_timeout_seconds` 的时间限制；预算耗尽时 Worker 若尚未关闭更新，`attemptUpdate()` 返回已接受的生命周期，且 `waitTimedOut() === true`、`updateStatus() === 'accepted'`。

单次调用需要不同的完成时间预算时，使用 `withUpdateWaitTimeout()`：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

调用方已有位置参数列表或具名参数映射时，使用 `attemptUpdateWithArguments()`：

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

具名映射根据持久快照中的更新契约校验，并在接受前规范化为声明顺序。

调用方只需要持久接受，并允许工作流 Worker 稍后应用更新时，使用 `submitUpdate()` 或 `submitUpdateWithArguments()`：

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

已有 `update_id`，希望稍后读取已存储的生命周期而不再次等待时，使用 `inspectUpdate()`：

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` 不等待工作流执行。它重新加载已存储的持久生命周期，并返回当前 `UpdateResult`。

## 响应不确定后的恢复 {#recover-after-an-uncertain-response}

持久接收、处理器完成和外部业务效果是独立的事实。调用方超时后，已接受的更新可能仍在运行；响应丢失也可能掩盖已经提交的结果。之后重新提交更新被拒绝，并不能确定原操作的结果。

应用已保存更新 ID 时，应检查保留的生命周期，而不是再次提交更新。保留原始运行 ID，避免 continue-as-new 转换使调查指向别的运行：

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

保存的 ID 来自原操作。检查会读取保留的记录，在该运行关闭或成为历史后仍可能有效。证据缺失或已被清理意味着结果仍未确定，并不代表可以重复业务效果。原始响应和生成的更新 ID 丢失时，应保留应用自行管理的操作记录以便对账。

### 请求 ID 与保留的回执 {#request-ids-and-retained-receipts}

在应用记录中保存命名空间、实例 ID、原始运行 ID、更新 ID、操作名称和意图。已接受回执证明持久接收；已完成生命周期提供处理器记录的结果。两者都不能证明独立的支付、邮件或数据库写入恰好发生一次。

`request_id` 不是可移植、按运行限定的更新 ID 契约。在已验证的 PHP 路径中，同一键以不同参数提交时，可能返回最先保留的更新。嵌入式查找还会跨该实例内的更新名称匹配。在 continue-as-new 之后复用键，可能返回前一运行的结果，而没有向后继运行接收更新。运行关闭后，也可能返回保留的带键回执，同时拒绝新的更新。

一个键只用于一个逻辑操作，并保留原始意图。不要更改参数、将键复用于其他更新名，或假定它会在下一运行启动新操作。PHP 服务的活动更新路径与嵌入式查找的匹配规则不完全相同，尤其不支持将跨更新名称复用作为恢复方法。[资格验证记录](https://github.com/durable-workflow/durable-workflow.github.io/pull/268)列出了已发布的 PHP 运行时和 SDK，并记录不同路径。原生 Server 和其他 SDK 路径需要单独验证。

回执恢复依赖保留的命令、更新和历史记录。本页不承诺独立于应用的去重有效期。请审查[历史保留](../configuration/pruning-workflows.md)，并按应用要求保留业务账本。缺失证据意味着结果仍未知。

### 保护业务效果 {#protect-the-business-effect}

对于发票扣款之类的操作：

1. 发送命令前，持久化应用操作键，例如 `tenant-1:charge:invoice-123`，以及不可变的操作意图。恢复期间复用该键。
2. 在应用效果的活动中，对租户和操作键设置数据库唯一约束。在同一事务中原子地检查已存意图、应用本地数据库效果并存储结果。相同意图的重复请求返回已存结果；不同意图则拒绝。
3. 对外部服务商，使用其支持的幂等契约，或使用发件箱及对账流程。你的数据库事务不能使独立的服务商调用具有原子性。
4. 响应不确定后，对照操作记录、原始更新生命周期和服务商证据进行核对。决定下一步之前，记录效果是待处理、已提交、失败还是仍未知。

先查询再发命令仍存在竞争。即使原信号已被接收，重复信号也可能触发另一个活动。应用防护必须容忍重复投递。已验证的示例为同一键执行两个活动，但只提交一次本地数据库效果。这不代表任意外部系统都能恰好执行一次。

更新规则：

- `load($instanceId)` 更新该实例最新的持久运行，包括 continue-as-new 之后。
- 所选运行成为历史后，通过 `loadRun($runId)` 发起的新更新会以 `rejected_not_current` 拒绝。保留回执检查是独立操作。
- 针对已关闭运行的新更新会以 `rejected_not_active` 拒绝。重放保留的带键回执是独立操作。
- 更新主体失败不会关闭工作流运行；故障记录在更新范围内，运行保持打开以等待下一次重放任务。
- 查询会重放已完成的更新，而被拒绝或失败的更新仅保留为不可重放的命令和历史事实。
