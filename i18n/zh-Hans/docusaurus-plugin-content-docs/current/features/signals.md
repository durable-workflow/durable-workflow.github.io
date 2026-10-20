---
sidebar_position: 1
title: 信号
description: 向运行中的工作流发送类型化外部命令，理解信号校验、路由和等待。
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - 工作流信号
  - 信号命令
  - 人工参与工作流
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# 信号 {#signals}

信号允许从工作流外部触发工作流中的事件，适用于响应外部事件、允许*人工参与*干预，或通知外部任务完成。需要重复有序输入及持久游标推进时，请使用[消息流](./message-streams.md)。

## 接受与关闭 {#acceptance-and-closure}

`signal_received` 确认持久接受，不确认工作流代码已处理信号。业务操作需要确认时，请检查信号保留的状态和历史。

使用 Core 2.7.0 或兼容 Server 时，远程工作流任务期间接受的符合条件信号，会在成功关闭前获得一次投递执行机会。发送给实例且由其命令契约声明的已接收信号，会跨[继续为新运行](./continue-as-new.md)保留原始标识、参数和顺序。发送给具体运行的信号绝不会移动到其他运行。

没有持久信号声明的运行，不会从 Worker 后续注册中获得声明。如果运行时无法确定能够投递，已接受信号将以下述显式拒绝结果关闭。

运行关闭前未应用的信号，其状态变为 `rejected`，包含 `run_closed_before_signal_applied`、关闭时间戳和 `SignalRejected` 历史事件。这包括正常完成时未使用的缓冲信号，以及失败、取消或超时前无法应用的信号。先前的接受回执仍然有效。调用方需要保留的处理结果，而非仅接受确认时，请使用[更新](./updates.md)。

将写入方升级至 Core 2.7.0 前，请排空并升级所有嵌入式或直接访问数据库的读取方，包括读取同一数据库的 Waterline。旧读取方无法解码 `SignalRejected`；不要让其继续访问新写入方，也不要在该事件写入后回滚读取方。

## 具名信号等待 {#named-signal-waits}

工作流直接调用 `await('signal-name')`。下一个同名已接受信号命令恢复运行，并向暂停的工作流返回确定性值。

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

从 PHP 通过公开实例 ID 触发信号：

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

信号行为：

- 预先通过可重复的 `#[Signal('signal-name')]` 类特性声明每个外部信号名，可选地包含有序参数契约。
- 信号命令指向公开工作流实例 ID，而非运行 ID，因此 continue-as-new 链保留同一公开信号路由。
- 有参数契约时，接收阶段将无效载荷以 `rejected_invalid_arguments` 拒绝，并提供机器可读的 `validation_errors`。
- 无契约时，`await('name')` 在无参数时返回 `true`，一个参数时返回该值，多个参数时返回完整参数数组。
- 未知信号名以 `rejected_unknown_signal` 拒绝；针对已关闭或未启动实例的信号分别以 `rejected_not_active` 或 `rejected_not_started` 拒绝。

## 兼容地演进信号载荷 {#evolve-a-signal-payload}

需要兼容扩展的应用载荷应使用一个已声明的映射参数。本例添加可选的信息性 `note` 时仍保留 `schema_version: 1`。旧发送方省略该字段，新读取方使用 `null`。旧读取方可以忽略它，而不会改变审批决定。需要影响授权或业务行为的变更，不应放在会被忽略的字段中。

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

两种发送方都使用同一个已声明的 `payload` 参数：

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

声明检查的是外层参数。用标量替代 `payload` 会在准入时被拒绝。`array` 类型既不验证嵌套字段，也不区分 PHP 列表和字符串键映射。工作流会在执行业务操作之前检查这些应用规则。因此，不支持的版本或无效的 `note` 可能先被持久接受，随后产生 `rejected_payload` 工作流结果。这个结果与 `signal_received` 回执不同。

保持必填字段及其含义稳定。明确字段缺失与显式 `null` 是否含义相同，本例中的 `note` 将二者视为相同。保留读取已记录旧值的解码器。不兼容的结构或语义变更需要新的应用版本和明确的兼容计划，而不只是再增加一个可选字段。

运行会保留启动时记录的信号声明和默认值。修改当前处理器的签名或默认值不会重写这个契约。添加一个顶层信号参数，与在现有映射中添加键并不相同。不要假定旧运行会接受该参数或采用新的默认值。新运行可以记录新的声明，旧运行则保留原声明。

这种应用格式独立于固定的 [Avro Value 传输模式](/docs/polyglot/avro-value-protocol)。服务模式下的 PHP、Python 和 Rust 客户端通过各自 SDK 编码所支持的映射、列表及标量值。Python dataclass、PHP 领域对象或 Rust struct 需要相应的显式值适配器。应用版本字段不是模式注册中心。服务模式 API 请参阅 [SDK 参考](/docs/sdk-neutrality)。

载荷兼容也不意味着修改后的工作流定义有权领取现有运行。请保持所需的兼容 worker 或 build 可用。Server 2.9.7 的源代码指纹限制单独跟踪于 [Server #518](https://github.com/durable-workflow/server/issues/518)。本配方不会绕过该限制，也不承诺当前处理器会替换旧运行的代码。在运行时所支持的路由契约内进行可安全重放的代码变更，请使用[工作流版本控制](./versioning.md)。

相同的已记录值边界也适用于活动参数和结果：重试与重放可能读取旧结构。请让相应适配器继续兼容这些值，而不是重写历史或依赖当前模型的默认值。

## 响应不确定之后 {#after-an-uncertain-response}

超时或响应丢失可能发生在信号已被持久接收之后。后续的运行已关闭或未找到响应描述的是后一次请求，无法证明原信号是否被应用。发送前检查状态也会留下窗口，工作流可能在此期间关闭或继续为新运行。

调查不确定投递时，保留原始命名空间、工作流标识、信号名称、参数和应用操作键。重复信号必须遵守目标实际的重复处理契约。不要仅因为重试被拒绝就启动替代工作流。

保留更新检查和应用自行管理的对账见[不确定命令的恢复](./updates.md#recover-after-an-uncertain-response)。

## 发送方身份与授权 {#sender-identity-and-authorization}

`approvedBy` 是应用数据。示例中的字符串 `Taylor` 不证明发送者经过身份验证。`#[Signal]` 契约校验信号名称和参数；Laravel 应用必须在接收信号前验证调用方身份并授权该操作。

例如，审批端点可使用已验证用户和订单策略。此应用定义一个存有 `workflow_instance_id`、`workflow_namespace` 字段的 `Order` 模型，并注册检查用户是否有权访问该订单的 `approve` 策略。端点不从请求体接收操作者或工作流路由值：

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

策略检查发生在加载或发送信号之前。所有审批入口，包括可发送该信号的 Webhook 或管理端点，都必须应用同一应用策略。工作流内部，`await('approved-by')` 接收记录的参数，不返回已验证发送方对象，也不再次执行权限检查。

命令审计身份与该参数独立。`withCommandContext()` 将上下文记录到 `commandId()` 标识的 `WorkflowCommand` 上。其 `context.principal` 及 `principalType()`、`principalId()`、`principalLabel()` 访问器支持宿主侧审计检查；关联历史和运维视图可展示已记录的命令归属。缺少归属记录不能证明发送方身份。

`CommandContext::withPrincipal()` 记录可信宿主代码提供的内容，不验证用户身份或授权信号。不要让调用方控制该上下文，也不要在确定性工作流重放中访问实时 HTTP 会话或查询数据库中的当前权限。

服务模式 SDK 调用使用 Server 的 HTTP 授权边界，而非此嵌入式路由。凭据、可信网关和审计身份见[信号授权与归属](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution)。

<SignalSimulator />

**注意：** `await()` 只能在工作流中使用，不能在活动中使用。

等待持久状态上的谓词变为真时，参阅[条件等待](./condition-waits.md)。带超时的 `await` 见[信号与定时器](./signal+timer.md)。重复收件箱／发件箱流程见[消息流](./message-streams.md)。

## 运行此模式 {#run-this-pattern}

[示例应用](/docs/sample-app)中由 Webhook 启动的工作流，是本页具名信号等待模式的可运行参考：

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` 从 HTTP Webhook 入口启动，并停在 `await('ready')`，直到匹配信号到达。等待期间打开 Waterline，可以在信号被接受时看到 `SignalReceived` 事件。
