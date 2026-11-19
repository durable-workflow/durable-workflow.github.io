---
sidebar_position: 12
title: 业务状态机
description: 嵌入式 Laravel 工作流中的实验性转换协议，用于共享业务状态、集成专属的策略配置档、嵌套子状态机和保留式补偿。
---

# 业务状态机 {#business-state-machines}

:::warning 实验性

`Workflow\V2\StateMachine` API，以及它所使用的保留式补偿作用域 API 和已确认的子工作流启动（`Workflow::startChild()`），均为实验性功能。它们从 Workflow 2.29.0 起以实验性方式提供，不受本包稳定性保证的覆盖，并且可能在次要版本中发生变化。按照[稳定性级别](../compatibility.md#stability-levels)，它们属于 `experimental` 接口。

本页示例是使用合成提供方的仓库源码示例，并非针对已安装包或真实提供方的资格验证。本页内容不意味着以下任何一项：

- 将进行中的执行迁移到新的定义、配置档、规则或处理器版本；
- 递归或共享的子状态机；
- 对任何真实支付、承运商或仓储提供方的保证；
- 业务状态机功能已经完成或已有稳定版本。

:::

本指南介绍使用 `Workflow\V2\Workflow` 的嵌入式 Laravel 工作流可选的业务转换协议。它基于现有原语构建：活动、子工作流、持久等待、重放和 [Saga](sagas.md) 补偿。现有工作流和 `Workflow\States\StateMachine` 保持不变。

## 适用场景 {#when-to-use-it}

当业务状态具有同一种共享含义，但不同集成到达这些状态的方式不同时，请使用该协议：

- **共享的状态机含义。** 一个 `MachineDefinition` 声明状态含义、转换标识、一个必需的不变式以及命名的子槽位。
- **集成专属的策略。** 每个 `PolicyProfile` 在该定义范围内选择自己的边、处理器版本和命名条件。一个集成可以要求在转换前执行某个外部操作；另一个集成可能已经提供了证据，从而跳过该工作。
- **嵌套子状态机。** Order 处于某个已声明状态时，可以承载一个 Shipment 状态机。绑定会在重试、状态变化和 Worker 重启之间保持子状态机的原始标识。
- **受保护的业务决策。** 新的业务状态通过应用拥有的边界提交，该边界会检查预期状态、修订版本和已接受的取消。
- **保留式补偿。** 借助保留式补偿作用域，义务可以比创建它们的运行存续得更久。

如果一个带 saga 的工作流就已足够，请直接使用 [Saga](sagas.md) 和[子工作流](child-workflows.md)。

## 转换契约 {#the-transition-contract}

无论是哪个状态机或集成，每个转换处理器都实现相同的四个方法：

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` 回答目标是否已经达到。它是对已记录的目标评估的纯投影。
- `canExecute()` 回答是否允许执行该工作。它是对已记录的许可评估的纯投影。
- `execute()` 编排已记录的活动或持久等待，并返回 `ExecutionReceipt`。该回执确认了这项工作，但并不表明已具备提交条件。
- `compensate()` 接收原始的 `ExecutionReference`。只有在所需效果（或其不存在）得到验证之后才能返回。未知或待处理的工作必须等待或显式失败，绝不能成功返回。

继承 `AssessedTransitionStep`，即可直接根据已记录的快照实现这两个守卫。如果自定义守卫与已记录的评估相矛盾，运行器会拒绝它。

## 运行器如何执行转换 {#how-the-runner-executes-a-transition}

`TransitionRunner::run()` 接收工作流、已固定的配置档、原始的 `ExecutionReference`、事件、一个 `TransitionRuntime` 以及一个封闭的处理器注册表。随后它会：

1. 为该事件和源状态选择唯一的边。没有候选边时返回 `Unavailable`；有多个候选边时返回 `Ambiguous`。
2. 请求一个已记录的 `before` 快照，并在配置档带有定义时检查其共享不变式。不变式不满足时返回 `Blocked`；不变式未知时返回 `Unknown`。
3. 检查目标守卫。目标已满足时会跳过工作，但仍要经过受保护的提交；跳过并不会接管已存在的外部效果的所有权。目标未知时返回 `Unknown`。
4. 当边未声明任何工作时返回 `Pending`。否则检查执行守卫并记录实时准入。被拒绝时返回 `Blocked`；回答未知时返回 `Unknown`。
5. 将原始步骤的补偿注册到原生 Saga，然后调用 `execute()`。
6. 请求一个新的 `after` 快照，并再次检查不变式和目标。源状态或修订版本已过期时返回 `Conflict`，结果不满足时返回 `Pending`，结果未知时返回 `Unknown`。目标已满足时继续进行受保护的提交。
7. 通过运行时提交，运行时报告 `Committed`、`Conflict` 或 `CancellationRequested`。

`TransitionStatus` 的值是处理结果，而不是你的业务状态目录。运行器从不重试整个转换，也从不自行补偿被阻塞的转换。由应用决定是等待、重试、对账还是补偿。结果并不代表可以关闭所属的工作流：只要仍有正向工作或补偿义务，就应保持该工作流处于打开状态。

`ActivityTransitionRuntime` 使用三个应用活动（快照、准入和提交）以及一个可选的 `MachineDefinition` 实现 `TransitionRuntime`。它使用普通的活动历史，不会新增任何 Worker 命令或历史事件。在已配置的 Order/Shipment 示例中，每个转换都经过同一个运行器调用：

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

这三个活动类是应用代码，而不是包中的类。

## 定义、配置档与版本 {#definitions-profiles-and-versions}

`MachineDefinition` 保存所有集成共享的内容。示例的第二版定义声明了四个状态、转换标识、一条不变式规则以及 Shipment 子槽位：

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` 将某个集成的 `TransitionDefinition` 边和命名条件附加到该定义上。配置档不能添加未声明的状态或转换标识，命名的配置档条件也不能取代共享不变式。

版本控制遵循以下规则：

- **指纹。** 定义指纹涵盖状态含义、不变式和槽位声明。配置档指纹涵盖定义和配置档元数据、图、条件结构、处理器版本以及任何限制。两者都不会对 PHP 实现进行哈希。
- **固定的执行。** `ExecutionReference` 固定作用域、业务主体、执行 ID、策略指纹、预期的源状态和修订版本。请在工作开始前记录所选的指纹，并在重放时再次提供它。恢复时绝不要根据最新的配置计算它。
- **仅用于新执行。** 新的定义或配置档版本只会被新执行选用。改写正在运行的主体的分配会改变其指纹，原始执行随后会拒绝。不存在进行中迁移的 API。
- **保留的实现。** 只要旧的定义、规则、处理器和授权版本所对应的执行或保留义务仍可恢复，就要让它们保持部署。处理器来自以 `TransitionDefinition::handlerKey()` 为键的封闭类型/版本注册表。存储的数据不能选择 PHP 类，缺失的处理器会在任何应用 I/O 之前失败。

有关修改工作流代码的一般规则，请参阅[版本控制](versioning.md)。

## 规则、条件与已记录的事实 {#rules-conditions-and-recorded-facts}

配置负责选择条件；规则实现仍是受信任的应用代码。在受信任的引导阶段构建的 `RuleRegistry` 将规则类型和版本映射到 `ConditionRule` 对象。`RuleReference` 固定类型、版本和参数，`ConditionDefinition::rule()`、`all()`、`any()` 和 `not()` 将这些叶节点组合起来。一个条件最多有 64 个节点。

决策有三种取值：`Verdict::Satisfied`、`Verdict::Unsatisfied` 和 `Verdict::Unknown`。对于 `all()`，有子项不满足时该组不满足；否则，有子项未知时该组未知。对于 `any()`，有子项满足时该组满足；否则，有子项未知时该组未知。对未知取反仍为未知。

事实只在已记录的快照活动中收集。示例的 `AssessmentStore` 连同证据引用一起记录事实，并评估配置档的目标条件和许可条件：

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

当配置档带有定义时，同一个活动会评估 `MachineDefinition::assess()`，并将 `MachineAssessment::fromEvaluation()` 作为快照的 `machineAssessment` 返回。请将完整的 `ConditionEvaluation::toArray()` 解释与快照一起保留。评估缺失、定义发生变化或条件发生变化时，会在工作开始前拒绝。已记录的评估是宿主证据，而不是授权：受保护的提交仍必须检查实时权限、修订版本和取消。

## 确定性重放 {#deterministic-replay}

该协议依赖已记录的历史，因此必须严格遵守通常的[工作流约束](../constraints/workflow-constraints.md)：

- 守卫和规则不执行任何 I/O。它们不读取数据库、配置、提供方或容器。
- 实时读取发生在快照活动内部。重放时，已完成的活动返回其已记录的结果；规则不会针对实时数据重新评估。
- `after` 快照必须使用不同的快照 ID 和新收集的事实。`SnapshotPhase` 区分 `before`、`after` 和 `compensation` 证据，因此一个阶段不能替代另一个阶段。
- `execute()` 和 `compensate()` 调用活动。请将同步的提供方或应用处理器包装在活动中；直接从工作流代码调用它，可能会在重放时重复其效果。
- 准入只记录权限和许可。它不得在 Saga 注册之前执行正向业务效果。
- 在工作流和历史边界之间使用 `TransitionResult::toArray()`。应用领域对象应留在你的步骤和运行时适配器之后。

## 受保护的业务提交 {#protected-business-commits}

提交活动是应用的业务权威。它必须：

1. 将决策 ID 绑定到其作用域、主体、策略、转换和内容。完全相同的重复请求返回已记录的结果；将该 ID 复用于其他内容会被拒绝。
2. 在应用的权威锁下，重新检查实时权限、预期的源状态和修订版本，以及任何已接受的取消。
3. 当业务状态、决策和任何发布意图共享同一存储时，以原子方式记录它们。
4. 确认丢失后，查找或重试该确切的决策，而不是重复执行效果。

它返回带有 `committed`、`conflict` 或 `cancellation_requested` 的 `CommitResult`。最后一种状态表示已接受的取消阻止了此次提交。它并不表示补偿已经完成，也不表示业务实体已被取消。这并不意味着应用存储与 Durable Workflow 之间存在分布式事务。

## 绑定到父状态的子状态机 {#child-machines-bound-to-parent-states}

父定义中的 `ChildSlot` 指定槽位名称、其承载状态、子状态机及其定义版本，以及所需的业务结果。`MachineDefinition::assertBinding()` 根据该声明检查绑定。它不执行任何查找、授权或准入。

`BindingIdentity` 固定原始的父执行、命名空间、父实例和运行、槽位、**代次**、承载状态、子工作流类型、子策略指纹、所需结果、输入指纹和子选项。代次标识一次状态进入。在父状态机变更状态或重新进入某个状态后，针对旧代次的请求绝不会重定向到较新的子状态机。

启动子状态机和等待子状态机是两个独立的转换：

- **启动。** 父状态机预留并准入子状态机，记录确切的绑定，然后才提交承载状态。如果绑定已被记录，该步骤会复用它，而不是再次启动。使用保留作用域时，`DurableScope::reserveChild()` 返回 `ChildReservation`，`ChildReservation::start()` 使用已确认的原生子工作流启动。之后 `ChildReservationStore::close()` 返回已准入的 `ChildBinding` 或永久性的 `NeverAdmittedChild`。
- **等待。** 后续转换观察同一个准入。它既不会创建第二个子状态机，也不会创建第二个补偿所有者。

示例的共享步骤展示了这两个转换：

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

在没有预留的情况下，`Workflow::startChild()` 返回一个 `StartedChildWorkflow` 回执，后续步骤可以对其调用 `await()`。父级必须验证子级的业务结果；子工作流在技术上完成、已接受的信号或超时都不足以证明这一点。`Workflow::startChild()` 仅限嵌入式使用；Worker 协议执行会拒绝它。

## 补偿与保留作用域 {#compensation-and-retained-scopes}

运行器会在 `execute()` 可能挂起或失败之前，将原始步骤注册到原生 Saga。回调捕获的是原始执行和步骤，而不是回执。补偿期间，运行器请求一个新的 `compensation` 快照，并使用原始执行调用 `compensate()`。请使用默认的顺序补偿。

运行本地的 Saga 回调随其运行一同结束。保留式补偿作用域（`Workflow\V2\Compensation`，同样是实验性功能）将每项义务保存在持久账本中，因此可以在发起运行关闭之后对其进行补偿。引擎仓库的[补偿作用域指南](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md)介绍了该 API。在这些示例中，每个外部效果在派发之前都会通过 `DurableScope::execute()` 注册为 `Obligation`，并且在撤销较早的父级效果之前会先验证子作用域。随后，该步骤自身的补偿只验证其原始义务：

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

业务取消是一个单独的决策。在这些示例中，仅证明型转换只有在保留作用域验证通过后才会提交 `cancelled`。技术性取消、已排队的恢复请求或失败的补偿都不能确立业务取消。当前的保留图只有一层父/子关系，每个作用域最多 16 个子项和 256 项义务。根作用域和子作用域的正向所有权不会转移给 continue-as-new 或 redrive 的后继运行，保留的释放仍需显式进行。

## 预算与显式结果 {#budgets-and-explicit-outcomes}

受信任的配置可以为状态机设定上限：

- `DefinitionLimits`（`states`、`transitions`、`childSlots`、`ruleNodes`）作为 `limits:` 传给 `MachineDefinition`。每个绑定的配置档还会检查其展开后的源边和条件节点总数。
- `ExecutionLimits`（`commands`、`historyEvents`、`historyBytes`、`groupDepth`）通过 `PolicyProfile::withLimits()` 或 `PolicyProfile::forDefinition()` 的 `limits:` 参数附加。命令预算涵盖 `TransitionRunner` 内部的每一次持久挂起，最多 4,096 条命令和 64 层分组。历史值是在每条命令之前通过 `Workflow::historyBudgetAtStep()` 测量的准入阈值，而不是绝对上限。

两种限制都会计入各自的指纹。省略它们会保留之前的指纹；添加或更改预算需要为新执行显式选择一个版本。

执行期间达到预算时，返回 `TransitionStatus::Blocked`，原因为 `state_machine_<dimension>_limit_exceeded`。无效的定义会在任何处理器运行之前抛出 `ResourceLimitExceeded`，其中包含维度、观测到的计数和限制。这两种结果都不表示取消已成功，也不表示较早的外部效果没有发生。`Workflow::compensate()` 在正向预算之外运行。

## 诊断 {#diagnostics}

- `TransitionResult::toArray()` 返回执行、状态、原因、评估和转换键。
- `ConditionEvaluation::toArray()` 保留结构指纹、快照 ID、规则版本、原因、证据引用和缺失的事实。
- `MachineAssessment::toArray()` 记录绑定到定义和快照的不变式决策。
- `ResourceLimitExceeded` 公开 `dimension`、`observed` 和 `limit`。
- `ScopeRecovery::describe()` 报告保留作用域的状态，包括何时需要一个新的、经过授权的取消请求。

## 可运行示例 {#runnable-examples}

这些示例位于 workflow 仓库中，基于该仓库的开发依赖和测试数据库运行。它们使用各自的一次性应用表，而不是包迁移。

| 示例 | 演示内容 |
| --- | --- |
| [已配置的 Order 与 Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | 两个集成配置档 `prepare` 和 `imported`，具有相同的状态和一个共享步骤。准备流程在 `working` 中承载 Shipment；导入流程在 `received` 中承载它。仅证明型的 `reconcile` 边在证据存在时跳过工作。第二版为新主体添加共享定义，而第一版保持固定。包括子状态机预留、保留式补偿和取消终结处理。 |
| [由提供方支持的 Order、Payment 与 Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | 三个状态机基于同一协议，针对一个合成的提供方日志运行。方案涵盖先预留与先付款的结账、退款结果、在备货或交付之后进行授权和扣款、银行、货到付款、预付加尾款以及订阅的资金方式、Cart 租约、单位金额、部分库存、退货、换货、承运商事故以及 Worker 丢失后的恢复。 |
| [SQL 业务决策](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | 应用拥有的受保护提交，使用 SQL 栅栏（fencing）处理取消、修订冲突、权限撤销、发布意图和确认丢失，另外还有原生嵌套的 Order 与 Shipment 补偿。 |

在 workflow 仓库中运行已配置示例的测试：

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

这三个示例都使用合成的或同一数据库的提供方。它们不构成对真实承运商、支付提供方或仓库、已安装包升级或进行中迁移的资格验证。真实集成必须自行提供幂等性、栅栏机制以及对不确定结果的对账。

引擎仓库的[业务状态机参考](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md)记录了完整的契约，包括活动载荷的结构。交付状态在 [durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069) 中跟踪。
