---
sidebar_position: 11
title: 故障与恢复
description: 诊断活动失败、不可重试异常、运行超时、取消清理和恢复操作。
tags:
  - failures
  - recovery
  - operations
keywords:
  - 工作流故障
  - 不可重试异常
  - 工作流恢复
---

# 故障与恢复 {#failures-and-recovery}

排查故障之前，请记住核心执行契约：

- 工作流任务通过重放已提交历史恢复。
- 活动执行遵循至少一次语义，可能被多次观察。
- 租约过期和重新投递是正常恢复路径，不能据此判断上一个 Worker 没有执行副作用。

需要了解重试、重新投递和持久结果的精确语义时，先阅读[执行保证与幂等性](./constraints/execution-guarantees.md)。

## 处理异常 {#handling-exceptions}

`Workflow\V2\Activity` 默认使用 `$tries = 1`：只尝试一次，抛出异常后不会自动重试。活动的第一次失败就会传回工作流。工作流代码可以像下面的示例一样捕获异常；如果没有处理，运行会失败并进入终态。

重试需要显式配置。将 `$tries` 设为大于 `1` 的值可允许多次尝试，设为 `0` 可允许无限次尝试，并选择 `backoff()` 策略。可重试的失败只会在配置的尝试次数或时间预算耗尽后传给工作流代码。不可重试的失败会跳过剩余重试。

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## 不可重试异常 {#non-retryable-exceptions}

有些异常不应重试，称为不可重试异常。活动抛出这类异常时，引擎立即将活动标记为失败，停止重试。

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## 恢复流程 {#recovery-process}

先检查所选运行的持久状态和活动重试策略。使用默认单次尝试时，未处理的活动失败已经使运行进入终态。部署修复或调用 `repair()` 不会重新打开这个已失败的运行。

只有活动仍有有效重试机会时，才能在原运行等待期间修复代码。必须在调度活动之前，将 `$tries` 设为大于 `1` 的值，或设为 `0` 以允许无限次尝试，并配置 `backoff()`。也可以用 `ActivityOptions::$scheduleToCloseTimeout` 限制活动所有重试的总时长；工作流期限仍然适用。参见[重试](./configuration/options.md#retries)、[退避](./configuration/options.md#backoff)和 [ActivityOptions](./configuration/options.md#activityoptions)。活动被调度时会保存重试策略快照，因此后续部署不会延长已有活动的尝试次数或时间预算。

对于仍在等待可重试活动的运行：

1. 查看失败活动的日志，找到报错或异常。
2. 确定错误来源并修复代码。
3. 将修复部署到队列 Worker 所在的环境。
4. 重启或滚动替换相关 Worker，使它们加载新代码并安全认领工作。
5. 让健康 Worker 执行下一次有效尝试。修复或重新投递可以恢复丢失的任务输送，但不会在活动或运行关闭后授予额外的业务重试。
6. 在 Waterline、历史导出或 Server API 中确认持久结果。单条 Worker 日志不能作为最终依据。
7. 如果活动仍失败，在重复流程前检查剩余尝试次数和时间预算。

仍有有效活动重试机会的运行会保持等待；如果原始预算尚未过期，修正后的代码成功后就可以继续执行。这并不保证所有失败的工作流都能原地修复：未处理的最后一次活动失败、工作流代码失败、结构限制或工作流超时都可能使运行进入终态。

对于失败终态的运行，应保留历史并核对所有外部副作用，再决定应用是否应启动新工作流。重复业务操作需要应用层幂等性。如果运行因未捕获的活动失败、工作流代码失败或结构限制而结束，请在部署修复后检查能否对它执行 [redrive](#redrive)。redrive 会在一个新运行中继续，并复用已完成的步骤。工作流代码失败需要修正后的代码以及 Workflow 2.19.0 或更高版本；参见[在修正后的工作流代码上执行 redrive](#redrive-corrected-definition)。系统不会自动重试整个工作流，也不会重新打开终态运行；参见[工作流级重试](#workflow-level-retry)。

## 对失败的运行执行 redrive {#redrive}

redrive 会在同一工作流实例的新运行中继续一个失败的运行。新运行复用失败之前已完成步骤的记录结果，并重新执行工作流的其余部分。修复失败的原因后使用它，这样付款或电子邮件这类已完成的工作就不会重复执行。

失败的运行保持关闭且不变。新运行称为后继运行，它获得下一个运行编号，并成为实例的当前运行。它的 `continued_from_run_id` 指向失败的运行。它的 `WorkflowStarted` 事件记录 `recovery_kind: redrive` 和 `resume_step_sequence`，后者是恢复执行的步骤。

本节介绍 Workflow 2.19.0 及更高版本中的 redrive。更早的 Workflow 版本以及原生 Server 中的 redrive 接受的运行更少。请参阅[更早的版本与原生 Server](#redrive-earlier-releases)。

后继运行从头重放工作流代码：

- 在失败运行中已完成的每个活动调用都返回其记录结果。该活动不会再次运行。
- 失败步骤之前的副作用或版本标记会按步骤顺序复用。副作用不会再次运行，版本检查返回记录的版本。
- 在失败步骤之前已触发的 `timer()` 会在后继运行中记录为已触发。后继运行不会再次等待它。
- 工作流代码在失败步骤之前 upsert 的备忘录或搜索属性会按步骤顺序复用，后继运行保留相同的值。
- 已接收并应用其信号的信号等待（`await('name')`）会连同该信号的值一起复用。该信号不会再次投递。
- 如果运行因活动失败而结束，失败的活动调用会作为新的活动执行被调度，并使用工作流代码中的重试策略。它的尝试次数重新开始计算。
- 如果运行在工作流代码中失败或因结构限制失败，后继运行会从工作流代码未曾到达的步骤处恢复执行。
- 失败步骤之后的所有内容都像在新运行中一样执行。
- 运行开始时设置的备忘录和搜索属性会像 continue-as-new 一样传递给后继运行。
- 后继运行保留失败运行的执行截止时间。它的运行超时从 redrive 时重新开始计算。
- 每个被复用的步骤都带有 `reused_from_run_id` 和 `reused_recorded_at`。
- 在嵌入式模式下，后继运行中的 `Workflow::now()` 从失败运行的开始时间起算。重放使用 `reused_recorded_at`，因此复用步骤之后的 `Workflow::now()` 与失败运行中的时间一致。被第二次 redrive 复用的步骤保留其首次运行的时间。

### 请求 redrive {#request-a-redrive}

在嵌入式模式下，从 Laravel 容器解析 `Workflow\V2\Contracts\WorkflowControlPlane` 契约，并使用工作流实例 ID 和失败运行的 ID 调用 `redrive()`：

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

在服务模式下，发送 `POST /api/workflows/{workflowId}/runs/{runId}/redrive`，可在请求体中附带可选的 `request_id`。各客户端封装的是同一路由：

| 入口 | 调用 |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` 或 `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` 或 `handle.redrive(request_id)` |

被接受的 redrive 返回后继运行的运行 ID 和 `resume_step_sequence`。被拒绝的 redrive 返回 `reason`，且不做任何更改。对已经执行过 redrive 的运行再次执行 redrive，会返回现有的后继运行，而不会再创建一个。请传入 `request_id`，以便安全地重试请求。已用于同一实例另一次 redrive 的 `request_id` 会以 `request_id_already_used` 被拒绝。

服务模式 Worker 会上报工作流定义指纹。redrive 会将其与运行开始时记录的指纹进行比较。在 Rust SDK 中，请为每个需要支持 redrive 的工作流调用 `Worker::set_workflow_definition_sources()`。未注册源码标识的工作流仍可运行，但 redrive 会拒绝它。

### 在修正后的工作流代码上执行 redrive {#redrive-corrected-definition}

如果运行因工作流代码抛出异常而失败，同样的代码会在同一步骤再次抛出异常，因此 redrive 会以 `workflow_code_failure_requires_corrected_definition` 拒绝它。请先部署修复，再附带 `allow_definition_change` 请求 redrive：

```php
$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
    'allow_definition_change' => true,
]);
```

在写入任何内容之前，redrive 会在内存中使用新代码重放已完成的步骤。新代码必须以相同的顺序执行相同的步骤，并到达旧代码失败的那个步骤。否则，redrive 会以 `definition_incompatible_with_prefix` 拒绝，并由 `definition_mismatch` 指出第一个不同的步骤（`sequence`）以及 `kind`，例如 `step_shape` 或 `version_range`。如果已完成的历史超出历史预算，redrive 会以 `definition_check_over_budget` 拒绝。

被接受的变更会运行修正后的代码，并在后继运行的 `WorkflowStarted` 上将被替换定义的指纹记录为 `definition_changed_from`。之后在同一定义上执行的 redrive 不会记录该字段。

`allow_definition_change` 适用于嵌入式运行。对于由服务模式 Worker 启动的运行，redrive 会以 `definition_change_requires_replay_check` 拒绝定义变更。未传入 `allow_definition_change` 时，已变更的定义会以 `workflow_definition_unavailable_or_changed` 被拒绝。

### 失败的运行何时可以 redrive {#redrive-eligibility}

满足以下全部条件时，redrive 才会接受失败的运行：

- 该运行是实例的当前运行。
- 运行失败的原因是活动失败到达工作流代码且未被捕获，或者是工作流代码抛出异常或结构限制使其停止。因工作流超时失败的运行会被拒绝。
- 失败步骤之前的每个步骤都是已完成的活动、副作用、版本标记、已触发的 `timer()`、备忘录或搜索属性的 upsert，或者已接收并应用其信号的信号等待。活动、副作用和信号的负载必须以内联方式存储。存放在外部负载存储中的负载会被拒绝。
- 工作流定义与运行开始时记录的指纹一致，或者你传入了 `allow_definition_change` 且修正后的代码能够重放已完成的步骤。同一定义上的工作流代码失败会被拒绝。
- 执行截止时间尚未过去。
- 运行没有父工作流、子工作流或本地活动，且其输入以内联方式存储。
- 如果运行由服务模式 Worker 启动，失败之前的步骤只能是活动、副作用、版本标记和已触发的计时器。

拒绝结果会指出第一条未满足的规则：

| 原因 | 含义 |
| --- | --- |
| `run_not_failed` | 运行不处于 `failed` 状态。 |
| `source_run_not_current` | 该实例存在更新的运行。 |
| `unrecorded_failure_boundary` | 运行的失败没有记录对应的步骤，例如 2.19.0 之前的版本记录的工作流代码失败。 |
| `workflow_code_failure_requires_corrected_definition` | 工作流代码抛出了异常，且定义没有变化，因此同样的代码会再次抛出异常。 |
| `unsupported_history` | 失败之前的历史中包含 redrive 无法复用的步骤，例如更新、子工作流或已取消的计时器。 |
| `unsupported_local_activity` | 历史中包含本地活动。 |
| `unsupported_timer` | 历史中包含条件或信号超时、取消清理计时器，或位于取消作用域或并行组中的计时器。 |
| `incomplete_timer_step` | 某个计时器步骤没有同时具备调度事件和触发事件。 |
| `unsupported_signal_wait` | 某个信号等待设置了超时，或位于取消作用域或并行组中。 |
| `unsupported_pending_signal` | 运行收到了一个从未应用的信号。 |
| `incomplete_signal_step` | 某个信号等待没有同时具备接收和应用记录，或者应用记录中没有记录的值。 |
| `mismatched_signal_receipt` | 某个信号接收记录指向另一个运行、实例、命令或等待，或者同一条接收记录被应用到两个等待上。 |
| `invalid_step_sequence` | 某个被复用的步骤没有有效的步骤编号。 |
| `duplicate_step_sequence` | 两个被复用的步骤使用了同一个步骤编号。 |
| `external_activity_result_not_supported` | 某个已完成活动的结果存放在外部负载存储中。 |
| `external_side_effect_result_not_supported` | 某个副作用的结果存放在外部负载存储中。 |
| `external_signal_payload_not_supported` | 某个信号的参数或已应用的值存放在外部负载存储中。 |
| `missing_activity_result`, `unavailable_activity_result` | 某个已完成活动的结果缺失或无法解码。 |
| `unsupported_visibility_metadata` | 工作流代码在后继运行不会复用的步骤上写入了备忘录或搜索属性。 |
| `unsupported_source_metadata` | 运行是作为另一个工作流的子工作流启动的。 |
| `unsupported_source_link_or_payload` | 运行作为另一个工作流的子工作流被关联，或其输入存放在外部负载存储中。 |
| `execution_deadline_elapsed` | 执行截止时间已过。 |
| `workflow_definition_unavailable_or_changed` | 定义指纹缺失，或与开始时记录的指纹不同且未传入 `allow_definition_change`。 |
| `definition_incompatible_with_prefix` | 修正后的代码无法重放已完成的步骤。`definition_mismatch` 指出第一个不同的步骤。 |
| `definition_check_over_budget` | 已完成的历史超出了重放检查允许的历史预算。 |
| `definition_change_requires_replay_check` | 运行由服务模式 Worker 启动，因此 redrive 无法检查已变更的定义。 |
| `service_redrive_history_not_qualified` | 运行由服务模式 Worker 启动，且失败之前的步骤包含备忘录 upsert、搜索属性 upsert 或信号等待。在能够逐个检查各 SDK 运行时重放这些步骤的能力之前，Workflow 2.19.0 会拒绝服务模式运行中的这些步骤。 |
| `request_id_already_used` | 该 `request_id` 已用于该实例的另一次 redrive。 |
| `invalid_request_id` | `request_id` 超过 191 个字符。 |
| `run_not_found`, `instance_not_found` | 该命名空间中不存在此运行或实例。 |

其余原因表示历史不符合预期结构：`invalid_history`、`events_after_failure`、`duplicate_start`、`missing_start`、`unexpected_start`、`missing_terminal_history`、`invalid_activity_sequence`、`activity_sequence_gap`、`missing_activity_type`、`activity_type_mismatch`、`duplicate_activity_completion`、`incomplete_activity_prefix` 和 `invalid_failed_step`。在决定如何恢复之前，请导出并检查该运行的历史。

当 redrive 拒绝某个运行时，请保留其历史，核对外部副作用，再决定应用是否应启动新的工作流。

### 检查运行能否 redrive {#redrive-check}

在 Workflow 2.18.0 及更高版本中，运行详情会报告 `can_redrive` 和 `redrive_blocked_reason`。Waterline 的所选运行详情会读取这些字段。`WorkflowControlPlane::describe()` 在 `actions` 下报告相同字段。它们来自 `redrive()` 所应用的同一检查，因此你可以在请求之前看到某个运行能否 redrive，以及不能的原因。

未失败的运行报告 `run_not_failed`。已经执行过 redrive 的运行报告 `already_redriven`。对于服务模式的运行，该报告只检查是否记录了指纹。`redrive()` 仍会将其与 Worker 的指纹进行比较。该报告不会执行针对修正后代码的重放检查，因此在你附带 `allow_definition_change` 请求 redrive 之前，已变更的定义会显示 `workflow_definition_unavailable_or_changed`。

在 Workflow 2.19.0 及更高版本中，运行修正后代码的后继运行会在运行详情中以 `workflow_definition_changed_from`、在 `describe()` 中以 `run.definition_changed_from` 报告被替换的指纹。

### 更早的版本与原生 Server {#redrive-earlier-releases}

Workflow 2.18.0 会复用已完成的活动、副作用、版本标记和已触发的计时器。它会拒绝工作流代码 upsert 的备忘录或搜索属性（`unsupported_history`）、信号等待（`unsupported_history`）、在工作流代码中失败的运行（`unrecorded_failure_boundary`）以及已变更的定义（`workflow_definition_unavailable_or_changed`）。

2.18.0 之前的 Workflow 版本接受的运行范围更窄。失败活动之前的每个步骤都必须是已完成的活动。该历史中的副作用、版本标记或计时器会以 `unsupported_history` 被拒绝，任何备忘录或搜索属性都会以 `unsupported_visibility_metadata` 被拒绝。运行详情和 `describe()` 不会报告 `can_redrive` 或 `redrive_blocked_reason`。

2.19.0 之前的版本会忽略被复用的信号、备忘录和搜索属性步骤上的 `reused_recorded_at`。在 Workflow 2.19.0 的后继运行复用这些步骤之后，如需回滚，请先确保继续使用 2.19.0 或更高版本的 Worker，或者确认不会有此类历史被重放。

原生 Server 中的 redrive 仍适用 2.18.0 之前的规则。原生 Server 对当前规则的支持在 [server#980](https://github.com/durable-workflow/server/issues/980) 中跟踪。

## 服务模式入口拒绝与恢复 {#service-entry-recovery}

**已发布支持。** Server 2.9.9 以及 PHP SDK 2.5.4、Python SDK 2.6.2 和 Rust SDK 3.5.6 引入了下述入口保护、路由和恢复行为。这些是相应功能的最低支持版本；请安装当前稳定版本以获取安全修复。

入口不匹配是在应用工作流代码执行前发生的部署或重放拒绝，不是活动重试，也不是终态业务失败。Worker 报告 `failure_reason = workflow_entry_arguments_mismatch`，Server 保留失败的工作流任务并设置 `replay_blocked = true`，而不是自动创建下一次尝试。通用的 `replay_blocked_reason` 是 `worker_reported_replay_failure`。运行仍处于非终态，已记录的输入、历史和截止时间保持不变。这与成功进入工作流方法体后抛出异常不同，后者仍可能导致整个运行失败。

请先检查实际持久状态，再进行恢复：

1. 使用 `GET /api/workflows/{workflowId}/runs/{runId}/debug` 检查选定运行。确认 `latest_workflow_task_failure.reason` 为 `workflow_entry_arguments_mismatch`，且原运行仍未关闭。此流程不会重新打开终态运行。
2. 部署能够接受已记录位置参数或类型化输入的代码。保留原工作流 ID、运行 ID、命名空间、队列、构建兼容性、历史和截止时间。绝不要编辑存储的输入，也不要用 DTO 默认值替换它。
3. 通过[定义路由](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution)确认有符合条件的 Worker 可用。修复操作不会创建 Worker，也不能证明重放兼容性。
4. 使用通常的已授权操作员凭据和命名空间调用 `POST /api/workflows/{workflowId}/runs/{runId}/repair`。指定运行的路由会拒绝以历史运行为目标的请求，而不是默默修复较新的运行。PHP 还提供 `Client::repairWorkflow($workflowId, $runId)`；Python 的 `repair_workflow(workflow_id)` 面向当前实例，Rust 则没有对应的修复便捷方法。
5. 确认同一个原运行使用已记录的输入和历史前缀继续执行，然后只记录一次预期结果。即使原截止时间已经过去，它仍然有效。如果替换代码仍不兼容，请检查新的拒绝原因，不要反复发起修复。

较旧的 Server 可能保存 SDK 的具体原因，却不将其归类为重放阻塞，因此仅报告失败并不能确立“不自动重试”的契约。请使用经过验证的运行时与 SDK 组合。各语言边界见[版本管理](./features/versioning.md#service-sdk-entry-safeguard)，需要认证的指定运行路由见[工作流命令](./polyglot/server-api-reference.md#workflow-commands)。

## 工作流超时执行 {#workflow-timeout-enforcement}

设置 `StartOptions::withExecutionTimeout()` 或 `StartOptions::withRunTimeout()` 时，引擎会在工作流运行上记录截止时间。执行截止时间跨越整个逻辑工作流，包括 continue-as-new 产生的运行。单次运行的截止时间则在新运行开始时重置。

引擎启动工作流任务时，如果截止时间已过，立即关闭该运行：

- 用类型化历史事件 `ActivityCancelled`、`TimerCancelled` 取消所有未结束的活动执行、定时器和待处理任务。
- 记录一行 `WorkflowFailure`，其中 `failure_category = timeout`，`propagation_kind = timeout`。
- 记录 `WorkflowTimedOut` 历史事件，`timeout_kind` 为 `execution_timeout` 或 `run_timeout`。
- 运行状态变为 `failed`，`closed_reason = timed_out`。
- 通知等待这个超时子工作流的父工作流。

后台任务 watchdog 也会扫描截止时间已过、没有开放工作流任务的非终态运行，例如正在等待活动或定时器的运行。找到后，它会创建工作流任务，让执行器在下一轮检测并执行超时关闭。

Waterline 在异常表的专用**类别（Category）**列和时间线失败详情中显示 `failure_category`。历史导出的 `failures[*]` 数组也包含该字段。最终 v2 在记录失败时写入此分类，无法分类的已导入 v1 行仍作为未分类诊断可见。

## 活动重试 {#activity-retries}

要在多个工作流和队列之间共享尝试预算，请将重试限制与 [Server admission 和应用熔断器](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets)结合。首次尝试和重试都计入上限；本地及嵌入式执行具有不同边界。

`Workflow\V2\Activity` 默认 `$tries = 1`。除非活动主动配置更多尝试，否则失败会立即传回工作流。

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

在工作流代码中，为活动设置总时限，其中包括排队和重试间的等待时间：

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

这些设置共同允许最多三次尝试，重试前分别等待 5 秒和 30 秒，并受最初的 120 秒 schedule-to-close 截止时间约束。如果工作流的截止时间更早，该期限仍然有效。只为可以安全重复的操作启用重试，并使用幂等性检查保护外部副作用。

可重试活动在尝试次数用尽前抛出异常时，引擎会将当前 `activity_attempts` 行作为运行时状态关闭，把 `activity_executions` 行恢复为 `pending`，为失败尝试记录类型化 `ActivityRetryScheduled` 历史事件，并创建新的持久活动任务。新任务的 `available_at` 按 `backoff()` 策略设置。工作流继续等待同一活动执行，直到最后一次可重试尝试失败，才收到异常。

重试任务的载荷记录 `retry_of_task_id`、`retry_after_attempt_id`、`retry_after_attempt` 和 `retry_backoff_seconds`，让 Waterline 能解释任务的调度原因。所选运行详情优先从类型化活动历史重建 `activities[*].attempts` 中的失败尝试，在时间线显示 `ActivityRetryScheduled`，并通过 `operator_metrics.activities.retrying`、`operator_metrics.activities.failed_attempts` 和 `operator_metrics.backlog.retrying_activities` 报告重试统计。

`Workflow\Exceptions\NonRetryableExceptionContract` 会立即中止重试策略。抛出不可重试异常会使活动执行立即失败，并将异常传回工作流。

### 重试延迟分辨率 {#retry-delay-resolution}

活动的 `backoff()` 值以整数秒表示。持久重试间隔的分辨率为 1 秒。请勿使用 `0.1`
这样的数值来请求 100 ms 后重试。接受小数值并据此生成间隔的 SDK API 会向上取整到
下一整秒。Python 和 Rust SDK 参考文档说明了支持的参数类型及转换规则。

延迟结束后，下一次尝试才可以开始，但队列延迟和 Worker 负载可能使其更晚执行。要加快
测试，请使用[受控时间或次数有限的零延迟用例](./testing.md#keeping-delay-tests-fast)。

### 活动执行标识与幂等性 {#activity-execution-identity-and-idempotency}

同一逻辑活动被多次观察的原因包括重试、租约过期、Worker 丢失、完成报告延迟和重新投递。这些情况可能产生另一次尝试，或同一持久活动执行的过期完成报告。

- `activity_execution_id` 标识跨重试和重新投递的逻辑活动。将它作为远程副作用的默认幂等键。
- `activity_attempt_id` 标识该逻辑活动的一次具体尝试。只有下游系统必须区分尝试时才使用它。
- 被替代尝试迟到的完成或失败报告属于正常的过期尝试行为，不能据此判断引擎重复提交了同一次尝试。

租约过期后遇到迟到的完成报告时：

- 以 Waterline、历史导出或 Server API 确定哪次尝试赢得了持久结果的提交权。
- 不要因为迟到的完成报告被拒绝，就认定远程副作用没有发生。
- 强制手动重试或修复之前，先通过幂等键检查外部系统。

最安全的默认做法，是让远程副作用以 `activity_execution_id` 保持幂等，再用持久结果判断引擎是否接受了具体尝试的报告。

### 不可重试失败标记 {#non-retryable-failure-markers}

活动或工作流抛出实现 `Workflow\Exceptions\NonRetryableExceptionContract` 的异常时，引擎在 `WorkflowFailure` 行和类型化历史事件载荷（`ActivityFailed`、`WorkflowFailed`、`UpdateCompleted`）中记录 `non_retryable = true`。这个持久标记告诉运维人员、外部 Worker 和工具：失败是永久性的，重复相同操作不会成功。

标记贯穿所有可见性接口：

- **失败行：** `workflow_failures.non_retryable` 布尔列。
- **历史事件：** 类型化事件载荷中的 `non_retryable` 字段。
- **失败快照：** `FailureSnapshots::forRun()` 包含 `non_retryable`。
- **运行详情：** 异常数组包含 `non_retryable`。
- **时间线：** 失败详情元数据包含 `non_retryable`。
- **历史导出：** `failures[*]` 数组包含 `non_retryable`。
- **Waterline：** 异常表和时间线的失败类别旁显示“不可重试”徽章。
- **外部 Worker 桥接：** `complete()` 命令载荷接受 `non_retryable`，使外部工作流 Worker 无需宿主进程解析异常类即可报告不可重试失败。

未实现这个契约的失败，`non_retryable` 默认为 `false`。最终 v2 在失败时记录此持久标记。如果运维人员或 SDK 需要区分永久失败和可重试失败，应在失败发生前声明契约。

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## 工作流级重试 {#workflow-level-retry}

Durable Workflow v2 不支持自动工作流级重试。工作流运行因未处理异常、结构限制或超时失败后，即进入终态。引擎不会自动为同一个工作流实例启动新运行。

这样设计的原因如下：

- **活动已有重试。** 可配置的 `$tries`、`backoff()` 和不可重试异常，以合适的粒度处理临时故障。
- **工作流重放负责恢复。** 工作流任务遇到数据库错误、Worker 崩溃等临时基础设施故障时，持久任务系统重新派发任务，重放从已提交历史恢复，无需新运行。
- **Continue-as-new 支持长期运行的工作流。** 需要新状态或历史压缩时，工作流通过 `continueAsNew()` 显式开始新运行。
- **修复处理停滞的运行。** `repair()` 命令和 Worker 循环的自动修复恢复持久任务传输丢失的运行。
- **redrive 是需要显式执行的运维操作。** [redrive](#redrive) 只在你提出请求时才会在新运行中继续失败的运行，并复用已完成活动的结果。

应用需要工作流级重试语义时，应在代码中显式建模：

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## PHP 服务模式失败报告上限 {#php-failure-report-limits}

PHP SDK **3.5.0 或更新版本**将服务模式下发出的失败报告限制为：UTF-8 消息 62 KiB、堆栈 128 KiB、可选元数据合计 64 KiB，以及包含标记的完整编码请求体 1 MiB。已知传输上限更低时，以较低值为准。[PHP 报告指南](./polyglot/php.md#bounded-failure-reports)说明了配置、省略诊断信息、保留的重试语义，以及本地首次执行与冷重放的一致性。这些是 SDK 报告的边界。嵌入式记录和 Core 摘要存储遵循各自独立的契约。

## Python 服务模式失败报告上限 {#python-failure-report-limits}

Python SDK **2.11.0 或更新版本**将服务模式下发出的失败报告限制为：UTF-8 消息 62 KiB、堆栈 128 KiB、可选元数据合计 64 KiB，以及包含标记的完整编码请求体 1 MiB。已知传输上限更低时，以较低值为准。[Python 报告指南](./polyglot/python.md#bounded-failure-reports)说明了配置、省略诊断信息、保留的重试语义，以及本地首次执行与冷重放的一致性。这些是 SDK 报告的边界。嵌入式记录和 Core 摘要存储遵循各自独立的契约。

## Rust 服务模式失败报告上限 {#rust-failure-report-limits}

实际运行 Rust SDK **4.10.1 或更新版本**的服务 worker，其发出 UTF-8 message 含标记最多62 KiB，受支持 stack 为128 KiB，可选 metadata 合计序列化结果为64 KiB，完整编码 body 为1 MiB或已知更低传输上限。type、retry 决定和 claim 标识保持不变；必需 envelope 无法容纳时显式拒绝。[Rust 报告指南](./polyglot/rust.md#bounded-failure-reports)说明省略标记、完整 Avro details 和本地结果边界。这不构成对旧 SDK、embedded mode 或独立 Core summary 存储修复的验证。

## 相关指南 {#related-guides}

- [执行保证与幂等性](./constraints/execution-guarantees.md)介绍影响本页所有恢复路径的重放、重试、租约过期和重新投递契约。
- [监控](./monitoring.md)说明 Waterline、历史导出、Worker 日志和运行时遥测如何展示这些失败信息。
