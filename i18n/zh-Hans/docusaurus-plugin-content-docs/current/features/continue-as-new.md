---
sidebar_position: 14
tags:
  - continue-as-new
  - history
  - message-streams
  - workflows
keywords:
  - 继续为新运行
  - 工作流历史增长
  - 运行交接
  - 消息流交接
---

# 继续为新运行 {#continue-as-new}

**继续为新运行（Continue As New）**模式允许正在运行的工作流用新参数重新启动自身。适用于：

* 防止工作流历史无限增长。
* 建模迭代循环或递归工作流。
* 将长时间运行的工作流拆分为更小、易管理的执行，同时保留连续性。

## 使用 `continueAsNew` {#using-continueasnew}

在工作流的 `handle()` 方法中调用 `continueAsNew(...)` 辅助函数，即可继续为新运行。`continueAsNew()` 是正式的运行转换。

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class CounterWorkflow extends Workflow
{
    public function handle(int $count = 0, int $max = 3)
    {
        $result = activity(CountActivity::class, $count);

        if ($count >= $max) {
            return [
                'count' => $result,
                'workflow_id' => $this->workflowId(),
                'run_id' => $this->runId(),
            ];
        }

        return continueAsNew($count + 1, $max);
    }
}
```

此示例中：

* 工作流每轮执行一个活动。
* 尚未达到最大次数时，使用递增后的参数继续为新运行。
* 只有循环完成时才返回最终结果。

工作流继续为新运行时：

- 实例 ID 在整个链中保持稳定；`WorkflowStub::runId()` 推进到最新运行。
- 原运行以 `completed` / `continued` 关闭，下一运行立即以全新运行 ID 启动。
- 实例范围的信号、查询、更新和运维命令解析到最新持久运行。显式指定运行的命令仍绑定所选运行。

Core 2.7.0 和兼容 Server 会保留已收到、由运行命令契约声明处理器、且旧运行尚未应用的实例范围信号。它们与待处理的已接受更新按原始命令顺序转移。信号和命令 ID、参数字节及接收时间保持不变。已应用的信号不会再次投递给后继运行。下一运行需要的业务状态应放入传给 `continueAsNew()` 的参数，任意本地状态不会自动复制。

指定运行的信号绝不重新定向。如果在目标运行关闭前无法应用，会获得[信号接受与关闭](./signals.md#acceptance-and-closure)中说明的显式拒绝结果。缺少旧版声明并不允许交接；这些信号会在前一运行上显式关闭。

长期运行的循环可以释放历史，无需在每次运行推进时创建新的公开工作流 ID。

## 历史预算 {#history-budget}

工作流代码可通过显式运行时上下文读取当前历史长度和继续为新运行的建议标记，让长期循环在历史预算导致成本陡增之前主动交接。

```php
use function Workflow\V2\activity;
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

### 可用方法 {#available-methods}

| 方法 | 返回类型 | 说明 |
| --- | --- | --- |
| `$this->historyLength()` | `int` | 当前运行的历史事件数 |
| `$this->historySize()` | `int` | 历史事件的总字节数 |
| `$this->shouldContinueAsNew()` | `bool` | 运行超过配置的事件数量或字节大小预算时为 `true` |

### 配置 {#configuration}

可配置继续为新运行的建议阈值：

```php
// config/workflows.php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => 10000,
        'continue_as_new_size_bytes_threshold' => 5242880, // 5 MB
    ],
],
```

任一阈值被超过时，`shouldContinueAsNew()` 返回 `true`。运行摘要也跟踪 `history_event_count`、`history_size_bytes` 和 `continue_as_new_recommended`，便于 Waterline 在集群视图中标记长期运行。

## 元数据继承 {#metadata-carry-forward}

工作流继续为新运行时，新运行自动继承上一运行的元数据：

| 元数据 | 继承行为 |
| --- | --- |
| 搜索属性 | 继承完整合并映射，包括运行中插入或更新的内容 |
| memo | 继承完整合并映射，包括运行中插入或更新的内容 |
| 可见性标签 | 原样继承，启动时仅设置一次 |
| 业务键 | 原样继承 |
| 兼容性标记 | 继承，以便新运行面向相同 Worker 构建 |
| 消息游标位置 | 继承，使新运行知道通过[消息流](./message-streams.md)消费过哪些入站消息 |

新运行以继承的元数据开始，并可继续插入或更新搜索属性和 memo。因此，长期轮询工作流可跨执行代累积元数据，而不会在释放历史时丢失状态。

```php
use function Workflow\V2\{activity, continueAsNew, upsertMemo, upsertSearchAttributes};
use Workflow\V2\Workflow;

class PollingWorkflow extends Workflow
{
    public function handle(int $iteration = 0)
    {
        $result = activity(PollActivity::class);

        upsertSearchAttributes(['iteration' => (string) $iteration, 'status' => 'polling']);
        upsertMemo(['last_result' => $result, 'iteration' => $iteration]);

        if ($this->shouldContinueAsNew()) {
            // The new run inherits all search attributes and memo
            return continueAsNew($iteration + 1);
        }

        return ['result' => $result, 'iteration' => $iteration];
    }
}
```

长期运行的人类输入或助手循环，优先使用正式的 `$this->inbox()` / `$this->outbox()` [消息流](./message-streams.md)门面。待处理流消息和游标位置转移到新运行，已消费消息留在原运行，作为历史证据。
