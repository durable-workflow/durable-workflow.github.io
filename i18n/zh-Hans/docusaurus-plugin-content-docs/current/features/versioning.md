---
sidebar_position: 15
---

# 版本管理 {#versioning}

工作流可能运行很久，甚至数月或数年，因此常需在执行尚未结束时修改工作流定义。没有版本管理时，修改影响执行路径的工作流代码会导致重放出现非确定性错误。

`getVersion()` 辅助函数通过创建版本化分支点，让你安全地向运行中的工作流引入更改。

## 演进已记录的入口参数 {#evolving-recorded-entry-arguments}

运行会保留启动时记录的参数。部署新定义不会改写这些输入。重放时，运行时会先将已记录的值绑定到当前工作流入口方法，**然后才执行方法体中的任何代码**。方法体内的 `getVersion()` 或 `patched()` 分支无法挽救不兼容的签名：必须先能进入方法体。

请保持现有位置参数的顺序，并继续接受它们已记录的类型。PHP 默认值只补充省略的参数，不会替换该位置上已经记录的不兼容值。例如，以 `[7]` 启动的运行在部署后仍会传入整数 `7`：

| 入口变更 | 对已记录输入 `[7]` 的影响 |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | 原参数仍可绑定；新增的末尾参数可以使用默认值。还须保持重放命令的兼容性。 |
| 新增一个没有默认值的必需末尾参数 | 旧运行没有可提供给它的值。 |
| 插入、删除或重新排列前部参数 | 现有值可能绑定到错误的参数。不要以为同名参数能修复位置输入。 |
| 将 `int $amount` 改为 `string $amount` | 已记录的整数并没有变成字符串。 |
| 将 `int $amount` 改为 `PaymentRequest $request` | 依赖注入不是输入迁移。新建 DTO 不得用构造函数默认值替换已记录的金额。 |
| 仅删除末尾参数 | PHP 可能接受调用，但须验证丢弃其含义不会改变重放命令或业务行为。 |

优先追加可选的末尾参数，或为不同的输入契约创建新的工作流类型。如果内部需要新 DTO，请在工作流**方法体内**根据兼容的已记录参数显式构造它，并在方法体内为持久命令的任何变更进行版本管理。在相关运行仍有需要时，保留能够重放每种受支持输入结构的代码。用实际存储的输入测试新定义，包括持久等待后的冷重放；只测试新启动的运行无法覆盖这一部署边界。

### Workflow 2.7.2 的行为 {#released-embedded-entry-behavior}

在 Workflow **2.7.2** 中，入口参数数量或类型错误可能变成终态 `WorkflowFailed` 事件。某些依赖解析错误则会让运行保持未关闭状态，但任务反复失败。把标量改为构造函数带默认值的注入 DTO，甚至可能使工作流使用错误数据运行。这些是 [Workflow #866](https://github.com/durable-workflow/workflow/issues/866) 跟踪的产品缺陷，不是安全的版本管理策略。

恢复兼容代码可能恢复仍可重新投递的未关闭运行，但不会重新打开已经进入终态的运行。`repair()` 和新的版本分支都不保证能复活这样的失败原运行。请先检查其实际状态和失败原因；决定恢复方案时保留原始输入和历史。

### 已发布的嵌入式保护 {#embedded-entry-argument-safeguard}

Workflow **2.7.3** 会在进入应用代码前验证已记录的入口参数。不兼容绑定会产生类型化的 `WorkflowEntryArgumentsMismatchException`，并将**工作流任务**设为重放阻塞状态，`replay_blocked_reason = workflow_entry_arguments_mismatch`；**运行本身仍处于非终态**。诊断字段标识工作流、入口方法、参数以及预期和实际类型，不复制参数值。新注入的 DTO 若会丢弃已记录输入，也会被拒绝。请检查嵌入式应用实际安装的 Workflow 包。该保护不会重新打开旧版本已进入终态的运行。

使用此已发布保护，按以下步骤恢复同一个仍未关闭的原运行：

1. 检查所选运行的任务诊断并确认 `workflow_entry_arguments_mismatch`，不要假设每个任务失败都由此引起。
2. 恢复接受原始已记录参数的定义，或在工作流方法体内部署兼容适配器。保留原始工作流标识、输入、历史和截止时间；不要修改存储来适配新签名。
3. 兼容代码可用后，对同一个仍未关闭的运行使用受支持的修复操作，然后验证原工作继续推进，且终态结果只记录一次。修复不会延长原截止时间；已经到期的截止时间仍然有效。

该保护**不会**把工作流方法体抛出的异常重新归类为部署不匹配。真正的应用 `TypeError` 或其他未处理的方法体错误仍遵循正常的工作流失败行为。它也不提供 [shared #220](https://github.com/durable-workflow/.github/issues/220) 跟踪的用于退役旧分支的全量运行检查。

### 服务模式 SDK 具有各自的边界 {#service-sdk-entry-boundaries}

修复嵌入式 Core 不会改变执行服务模式工作流代码的 SDK 进程。下表列出经源码验证的已发布版本边界；等效的可恢复入口验证仍由 [shared #221](https://github.com/durable-workflow/.github/issues/221) 跟踪，尚未完成：

| 已发布 SDK | 入口绑定行为 |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | 调用已注册处理器时先传入上下文，再传入已记录的位置输入。入口 `ArgumentCountError` 或 `TypeError` 可能进入通用工作流失败路径。 |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | 调用 `run(ctx, *start_input)`。参数数量变化可能导致工作流失败；类型注解本身不会强制参数类型，也不会转换已记录值。生成器方法体错误同样是应用失败。 |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | 类型化适配器会先反序列化输入，再调用签名固定的处理器。请求类型变化可能使该解码步骤失败。这与 PHP/Python 的位置绑定不同；因历史未完全消费而偶然触发的拒绝，不等于承诺提供可恢复的签名保护。 |

请将服务输入兼容性、实际 SDK 资格验证与嵌入式发布版本分别看待。不要捕获所有 `TypeError` 或所有 Rust 处理器错误并标记为可安全重放，这会掩盖真正的应用失败。

## 使用 `getVersion` {#using-getversion}

`getVersion()` 是可安全重放、按顺序编写的辅助函数。每个变更点在首次执行时为运行记录持久版本标记，后续每次重放都复用该已提交值，不会根据当前代码重新计算分支。早于新引入分支点的旧运行会保守地获得 `DEFAULT_VERSION`。

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## 工作原理 {#how-it-works}

`getVersion()` 方法接受三个参数：

- **changeId**：该变更点的唯一标识
- **minSupported**：当前代码仍支持的最低版本
- **maxSupported**：新执行使用的最高（当前）版本

工作流遇到 `getVersion()` 时：

- **新执行**追加类型化 `VersionMarkerRecorded` 历史事件，包含 `change_id`、所选 `version` 和支持范围，然后返回 `maxSupported`
- **重放执行**从该历史标记返回先前记录的版本
- **尚无标记的运行**，如果运行时判断该运行早于当前工作流定义，则回退为 `WorkflowStub::DEFAULT_VERSION`。它先比较运行与当前 Worker 的兼容性标记，再比较运行持久快照中的 `workflow_definition_fingerprint` 与当前可加载工作流类。指纹相同表示定义一致，可新记录标记；指纹不同表示运行早于变更，触发回退。`WorkflowStarted` 历史早于指纹快照、没有记录指纹的运行，会保守地获得 `DEFAULT_VERSION`，因为运行时无法证明定义未变。这是 2.0 对指纹出现前运行的固定策略：运行时不会仅因旧运行没有记录指纹而阻止认领。回退不会追加合成标记，也不消耗新的工作流步骤
- **查询方法**在调用带特性的方法前重放同一个已提交版本标记，因此查询看到与工作流任务相同的分支
- **Waterline**在所选运行时间线中展示已记录标记，包含 `version_change_id`、`version`、`version_min_supported` 和 `version_max_supported`；所选运行详情还提供 `workflow_definition_fingerprint`、`workflow_definition_current_fingerprint` 和 `workflow_definition_matches_current`，使运维人员在版本标记提交前就能看到长期运行是否从旧定义启动

这样，新工作流使用最新代码路径，已有工作流继续使用原始路径。

## 添加新版本 {#adding-a-new-version}

假设已有工作流调用 `prePatchActivity`：

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

要在不破坏运行中工作流的情况下替换为 `postPatchActivity`：

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

发布引入新 `getVersion()` 分支点的部署时，应为该构建批次更新 `DW_V2_CURRENT_COMPATIBILITY`。判断缺失版本标记属于新执行，还是应保留 `DEFAULT_VERSION` 的旧运行时，运行时以启动时的 `workflow_definition_fingerprint` 为主要权威依据。兼容性标记仍用于兼容性路由，并在指纹检查之前生效。早于指纹快照且没有记录指纹的运行，保守地保留 `DEFAULT_VERSION`，因为运行时无法验证定义未变。

## 添加更多版本 {#adding-more-versions}

需要进一步更改时，递增 `maxSupported`：

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## 弃用旧版本 {#deprecating-old-versions}

所有使用旧版本的工作流完成后，可提高 `minSupported`，停止支持旧版本，从而无需继续维护旧代码路径。

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

版本低于 `minSupported` 的工作流尝试重放时，会抛出 `VersionNotSupportedException`。这也包括安全回退仍为 `WorkflowStub::DEFAULT_VERSION` 的旧兼容性运行。

之后若意外将同一 `changeId` 复用于不同分支点，运行时会视为确定性错误，不会静默接受不匹配。每项逻辑代码变更应保留一个稳定 `changeId`。

## 多个变更点 {#multiple-change-points}

同一工作流可为独立变更使用多个 `getVersion()` 调用：

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**注意：** 每个 `changeId` 在工作流内应唯一。所选版本作为类型化工作流历史记录，在后续工作流任务、查询和 Waterline 详情中确定性重放。Waterline 在旧运行的某变更点没有显示 `VersionMarkerRecorded`，表示重放保留旧 `DEFAULT_VERSION` 路径，没有向已有历史回填新标记。所选运行详情的 `workflow_definition_fingerprint`、`workflow_definition_current_fingerprint` 和 `workflow_definition_matches_current`，可判断该运行启动时的定义是否不同于当前构建可加载的定义。

## `patched()` 简写 {#patched-shorthand}

`patched($changeId)` 是“此运行是否经过一次性代码变更”的两状态简写。它与 `getVersion()` 记录相同的持久 `VersionMarkerRecorded` 历史事件，但解析为布尔值而非整数。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

行为：

- 新运行提交标记、采用新分支，`patched()` 返回 `true`。
- 在加入该 `changeId` 前启动的运行，按与 `getVersion()` 相同的指纹回退规则保留 `DEFAULT_VERSION`，`patched()` 返回 `false`。
- 两类运行重放时均读取先前已提交标记，返回相同值，因此分支决策是持久的。

`patched()` 完全等价于 `getVersion($changeId, DEFAULT_VERSION, 1) === 1`。只有两个分支，且无需永久保留旧分支时使用；调用处的布尔写法比针对 `DEFAULT_VERSION` 和 `1` 的 `match` 更易读。

需要超过两个分支，或计划以后为同一逻辑变更新增版本时，使用显式 `maxSupported` 的 `getVersion()`。对同一 `changeId` 从 `patched()` 改为 `getVersion()` 会导致确定性错误，因为现有标记以 `maxSupported = 1` 记录。

## 用 `deprecatePatch()` 移除旧分支 {#removing-the-legacy-branch-with-deprecatepatch}

`patched()` 变更点的所有旧运行完成后，可从工作流代码删除旧分支。兼容的方式是将 `patched()` 调用替换为 `deprecatePatch()`，而非直接移除调用。

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` 将变更点保留在工作流时间线上，使已提交的 `VersionMarkerRecorded` 历史事件仍匹配已知调用，但它返回 `null`，并无条件采用新路径。发布该版本后：

- 新运行提交 `deprecate_patch` 标记、采用新分支，`deprecatePatch()` 返回 `null`。
- 已为该 `changeId` 提交 `patched` 标记的已有运行，继续重放该标记，并通过已弃用分支解析。该分支现在是唯一分支，不会出错。
- 假定为 `patched()` 提交 `false` 的旧路径运行已不再执行。如果仍有这样的运行尝试重放，工作流仍读取旧标记，却执行新分支。因此，安全生命周期要求“等待旧运行排空，再部署 `deprecatePatch()`”。

两阶段补丁生命周期和放置规则：

1. 在变更点**引入 `patched()`**。工作流代码保留两个分支。新运行采用新分支，旧运行继续采用旧分支。
2. **等待所有旧运行结束。** 使用 Waterline 运行搜索或 `dw workflow:list`，确认没有可能通过旧分支重放的未关闭运行。
3. 在相同调用位置、使用相同 `changeId`，**用 `deprecatePatch()` 替换 `patched()`**，并从函数主体删除旧分支。保留该调用，不要移除，使持久历史仍匹配已知变更点。
4. **可选：彻底移除 `deprecatePatch()`。** 只有确信查询、导出、审计等历史重放永远不会再读取提交过该标记的历史时才可执行。这是不可逆步骤；多数工作流可无限期保留 `deprecatePatch()`，不付出运行时成本。

放置规则：

- `patched()` 和 `deprecatePatch()` 必须从工作流函数主体调用，不能从活动、信号处理器或查询方法调用。它们是工作流步骤，必须确定性重放。
- 每个 `changeId` 代表一个逻辑变更点。将同一 `changeId` 复用于其他分支会导致确定性错误。
- `changeId` 在生命周期内可采用 `patched()` 或 `deprecatePatch()` 形式，但不能同时出现。切换调用的部署必须替换旧调用，不能让二者共存。
- 同一 `changeId` 不能同时使用 `getVersion()` 和 `patched()`。引入变更点时应选择其中一种模型。
