---
title: 服务操作
description: 从嵌入式 PHP 工作流调用其他命名空间的操作。
---

# 服务操作 {#service-operations}

工作流需要另一个命名空间所拥有的服务的持久结果时，请使用服务操作。调用方指定已注册的端点、服务和操作。运行时记录调用及其结果，因此替代 Worker 可以重放同一结果。

子工作流和信号仍属于原命名空间。更改子工作流类型名称或任务队列不会跨越这一边界。要在同一个 Durable Workflow 集群的其他命名空间中执行已发布的工作，请使用服务操作。

## 从嵌入式 PHP 调用 {#call-from-embedded-php}

启动调用方工作流前，先注册目标目录及其处理程序。[服务模式指南](../polyglot/service-operations.md)介绍共享目录、边界策略以及各自独立发布的 SDK 接口。

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` 返回 `ServiceOperationResult`，其中包含持久的 `serviceCallId`、生命周期状态、执行结局和响应数据。服务的终态失败或取消会在原调用位置恢复为带类型的工作流异常。请保留应用的错误映射以供重放使用。

## 选择调用方的等待目标 {#choose-what-the-caller-waits-for}

下一步工作流决策依赖服务结果时，使用 `modeOverride: 'sync'` 和 `waitFor: 'completed'`。调用尚未终结时，工作流会持久挂起。

如果只需确认接纳，使用 `modeOverride: 'async'` 或 `waitFor: 'accepted'`。返回的记录标识原调用。接受并不表示业务工作已完成。目标稍后完成也不会改写仅等待接纳的调用方已经记录的结果。如果工作流需要最终结果，请从一开始就选择等待完成。

## 保留已记录的契约 {#preserve-the-recorded-contract}

对于尚未结束的运行，请保持目标命名空间、端点/服务/操作、请求和等待选项稳定。使用工作流版本分支处理不兼容的代码变更。重放复用记录的调用身份和结果，而不是请求再次执行。

显式幂等键是持久的业务身份。只能对同一个预期操作和请求复用该键。不要仅因为响应丢失或等待到期就更换键。在判断是否可以安全发起另一笔业务操作之前，先检查原调用。

要限制服务执行时间，请配置目录操作的 `deadline_policy`。其中的 `timeout_seconds` 从原始接纳时间起只解析一次，生成 `call_deadline_at`；也可使用带时区偏移的 `deadline_at`。替换 Worker 和重放不会延长该截止时间。`waitTimeoutSeconds` 不是服务执行截止时间。请协调工作流与服务的预算，在超时后检查目标，不要假定外部副作用未发生。

## 相关指南 {#related-guides}

- [跨命名空间服务调用](../polyglot/service-operations.md)
- [子工作流](./child-workflows.md)
- [版本管理](./versioning.md)
- [失败与恢复](../failures-and-recovery.md)
