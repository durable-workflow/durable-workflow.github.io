---
sidebar_position: 12
title: 补偿作用域
description: 在嵌入式 Laravel 工作流中，让补偿义务在创建它们的工作流运行之外继续保留，并在该运行关闭后恢复它们。
---

# 补偿作用域 {#compensation-scopes}

本指南介绍使用 `Workflow\V2\Workflow` 的嵌入式 Laravel 工作流中的保留式补偿。[Saga](sagas.md) 在注册补偿的运行内部执行补偿。补偿作用域将每项义务保存在持久账本中，因此即使该运行已完成、失败或被取消，义务仍然可以得到补偿。

当取消可能迟到时，请使用作用域，例如发货工作流已完成，而其订单在几天后才被取消；或者正向操作可能在未返回已记录结果的情况下产生效果。

## 可用性与稳定性 {#availability-and-stability}

| 部分 | 状态 |
| --- | --- |
| `DurableScope`、`RegisteredObligation`、`Obligation`、`ScopeIdentity` | 计划稳定（2.32.0 或更高版本） |
| `ScopedOperation`、`OperationContext`、`ForwardResult`、`Resolution`、`HandlerRegistry`、`HandlerContractViolation` | 计划稳定（2.32.0 或更高版本） |
| `ScopeAuthorization`、`ScopeAuthorizationRefused`、`ScopeRecovery::request()`、`ScopeRecovery::describe()`、`ScopeRetention::release()` | 计划稳定（2.32.0 或更高版本） |
| `DurableScope::reserveChild()` 和根准入（`RootReservationStore`） | 实验性 |
| 标记为 `@internal` 的类（活动、持久化、恢复引擎） | 非公共 API |

作用域 API 最初在 2.29.0 中以实验性功能发布。来源运行关闭后的自动恢复、恢复重试计划以及 `describe()` 在 2.31.0 中提供。经过评审的处理器结果（`failed()`、`rejected()` 和 `HandlerContractViolation`）在 2.32.0 中提供。在后续某个版本（2.32.0 或更高版本，具体在该版本发布时决定）将标记为计划稳定的部分提升为稳定之前，整个 API 仍是实验性的，可能在次要版本中发生变化。提升之后，这些部分遵循 [2.x 兼容性策略](../compatibility.md)。初始支持仅限于嵌入式 Laravel 和顺序补偿。

## 工作原理 {#how-it-works}

作用域由 `(application, namespace, key, generation)` 标识。它的正向工作属于一个来源运行，因此请选择该运行唯一的 generation。每项义务在其正向效果被分派之前，与其补偿一起注册。账本记录：

- 封闭的处理器类型和版本，绝不是 PHP 闭包；
- 稳定的操作 ID，处理器用它与提供方对账；
- 可移植的输入（以 JSON 计最多 15,360 字节、500 个值、深度 7）；
- 正向结果和补偿结果，以及证据引用。

来源运行处于打开状态时，取消它会运行原生 saga，按注册的逆序进行补偿。运行关闭后，规范恢复工作流会根据账本补偿相同的义务。它绝不会重新打开原始运行，也不会更改该运行的历史。

## 设置宿主 {#set-up-the-host}

在服务提供者中绑定作用域授权策略和封闭的处理器注册表。策略返回其策略版本。要拒绝时，它会抛出 `ScopeAuthorizationRefused`。

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

调用 `ScopeAuthorization::assertAllowed($scope, $principal, $operation)` 时，操作为 `register`、`forward`、`compensate`、`participate`、`request`、`release` 或 `inspect` 之一。对其他任何操作名都应拒绝。只有 `ScopeAuthorizationRefused` 是永久拒绝。其他任何异常都被视为暂时性的：它会被重试，自动恢复也会稍后再次尝试。请从可信的应用策略推导主体，绝不要从请求载荷中获取。运行包迁移；它们会在工作流存储连接上创建账本表。

标识符（应用、键、generation、操作键和处理器版本）由 1 到 128 个来自 `A-Z a-z 0-9 . _ : / -` 的字符组成，并以字母或数字开头。处理器类型使用 `a-z 0-9 . _ -`，以小写字母开头，且不得以 `dw.` 开头，该前缀保留给引擎使用。

## 在工作流中注册义务 {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` 先注册义务，然后运行其正向操作。
- `register()` 只注册并返回一个 `RegisteredObligation`。当补偿顺序必须与分派顺序不同时，稍后在同一工作流中调用它的 `execute()`。
- `participate()` 注册一个子作用域。顺序补偿在补偿更早的父义务之前，会等待该子作用域的账本变为 verified。缺失或未验证的子作用域会阻止更早的父工作。

## 编写处理器 {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId]);
    }
}
```

处理器可能针对同一操作运行多次，因此请让两个方法都基于 `operationId` 保持幂等。

- `execute()` 在有证据时返回 `ForwardResult::observed()`，在提供方的结果不确定时返回 `unknown()`，在提供方确定没有产生任何效果时返回 `rejected()`。被拒绝的正向操作会使工作流的调用以 `scope_forward_rejected` 失败，其补偿也无需调用提供方。当 `$context->reconcileBeforeForward` 为 true 时，之前的尝试可能已经生效；请先查询该操作，再重新发起。
- 只有在有证据表明效果已被撤销、且不可能再出现迟到的正向效果时，`compensate()` 才返回 `Resolution::verified()`。回调返回、超时或已关闭的运行都不是这种证据。返回 `unknown()` 可让义务保持未解决状态并允许原生重试运行；在补偿确定无法完成时返回 `failed()`。当 `$context->forwardOutcomeUnconfirmed` 为 true 时，正向效果从未得到确认，仍可能迟到。
- 无效的结果（例如没有证据的 `verified()`、无效的原因，或超出限制的正向结果值）会抛出 `HandlerContractViolation`。引擎会将该结果记录为未知，因此补偿仍会对该操作进行对账；同时以不可重试的错误 `scope_handler_contract_violation`（后接违规消息）使该活动失败。它不会作为提供方的未知结果被重试。
- 为 2.31.0 或更早版本编写的处理器可能会向 `verified()` 传入第二个参数。`verified($evidence, true)` 仍会完成验证，并触发 `E_USER_DEPRECATED` 通知；`verified($evidence, false)` 返回 `unknown('late-forward-possible')`。请删除第二个参数。

## 取消与恢复 {#cancel-and-recover}

使用稳定的请求键请求补偿：

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- 如果来源运行仍处于打开状态，请求会要求它取消，并由它的 saga 进行补偿。
- 如果该运行关闭时作用域仍未验证，任务看门狗会在下一轮将同一请求转交给规范恢复。看门狗在队列 worker 循环和 `workflow:v2:repair-pass` 中运行，并先对原始主体重新授权。并发的轮次或竞争的手动请求只会启动一个恢复运行。
- 如果运行已经关闭，请求会直接启动规范恢复。

恢复运行对每项补偿最多尝试六次。两次尝试之间依次等待 1、2、5 和 10 秒，之后等待一个活动租约加一轮任务修复的时间，以便在最后一次尝试之前回收崩溃 worker 的尝试。子作用域完成验证或出现新的已授权请求时，会立即唤醒正在等待的重试。持续失败仍会使恢复运行失败，义务保持未解决状态。

使用 `describe()` 检查结果。它是只读的，需要 `inspect` 授权。它始终返回相同的键。状态取自 `ScopeStatus`、`NextAction`、`AutomaticRecovery` 和 `ObligationStatus` 枚举；拒绝由稳定的 `code` 加上宿主的 `message` 组成，其中 `message` 不保证对机器处理保持稳定。这些枚举可能会在次要版本中新增成员，因此请用默认分支处理无法识别的值：

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryRunId, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

当自动恢复被拒绝（`automaticRecovery: recovery_authorization_failed`）或恢复运行失败时，`nextAction` 为 `submit_fresh_authorized_request`。这种情况下请提交新的请求键。重复使用请求键会返回其原始回执，绝不会启动另一个运行。

作用域账本负责结清补偿。诸如将订单标记为 `cancelled` 之类的业务决策，仍是 `scopeStatus` 变为 `verified` 之后由应用执行的步骤。推荐模式是使用监听器在恢复运行完成时最终完成业务取消，引擎仓库中的提供者示例就是这样做的。

## 保留、升级与回滚 {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` 在验证后移除保留的输入和正向结果。它会保留一个 tombstone，因此旧的 generation 或请求键永远不会再被接受。没有任何内容会自动过期，运行历史清理也绝不会移除账本。
- 只要账本中还保存着任何作用域（包括已释放的 tombstone），架构回滚就会在任何迁移运行 `down()` 之前被拒绝。若要回退，请恢复升级前创建的数据库备份。
- 仅降级包时会保留账本。再次升级后恢复会继续。恢复运行处于打开状态时，请不要降级。

## 保证与限制 {#guarantees-and-limits}

提升之后，稳定 API 在 2.x 范围内不会发生不兼容的变更。已记录的补偿历史会在之后的每个 2.x 版本上重放，新行为只会在已记录的版本标记之后引入。账本迁移只做添加。

以下限制是最小值，可能提高但不会降低：

- 义务输入：以 JSON 计 15,360 字节、500 个值、深度 7；正向结果值：11,264 字节、400 个值、深度 7（2.32.0 之前记录的作用域对两者仍沿用先前更大的信封限制）；
- 每个作用域 256 项义务，其中最多包含 16 个子参与者，一层嵌套；
- 每个作用域 128 个请求，与引擎的子请求共享；
- 每个结果 32 个证据引用，每个最多 128 字节。

不保证的内容：看门狗的时机、精确的重试间隔（仅保证恢复持续时间超过一次租约修复）、账本行布局，以及任何标记为 `@internal` 的内容。绝不承诺外部效果恰好执行一次；按操作 ID 与提供方对账是处理器的责任。

引擎仓库的[补偿作用域指南](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md)记录了完整契约，包括实验性的子作用域预留和根准入 API。
