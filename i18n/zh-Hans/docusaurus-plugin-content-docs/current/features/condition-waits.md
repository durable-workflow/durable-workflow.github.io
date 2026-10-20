---
sidebar_position: 6
---

# 条件等待 {#condition-waits}

`await($condition, $conditionKey = null)` 提供可安全重放的条件等待。谓词仅依赖由更新、活动结果或子工作流结果等持久输入推导出的工作流状态时，使用此方法。如果只需要直接取得某个具名外部信号的值，请调用 `await('name')`，参阅[信号](./signals.md)。

条件等待由更新方法驱动，而不是信号状态修改方法：

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

可选条件键是稳定、URL 安全的等待运维标签。重放会校验先前记录的键，防止后续部署意外将同一工作流步骤用于不同谓词。跨部署安全演进工作流的方法见[版本管理](./versioning.md)。

带超时的条件等待见[信号与定时器](./signal+timer.md)。

**注意：** `await()` 仅应在工作流中使用，不能在活动中使用。
