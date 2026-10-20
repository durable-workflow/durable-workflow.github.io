---
sidebar_position: 15
---

# 版本管理 {#versioning}

工作流可能运行很久，甚至数月或数年，因此常需在执行尚未结束时修改工作流定义。没有版本管理时，修改影响执行路径的工作流代码会导致重放出现非确定性错误。

`getVersion()` 辅助函数通过创建版本化分支点，让你安全地向运行中的工作流引入更改。

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
