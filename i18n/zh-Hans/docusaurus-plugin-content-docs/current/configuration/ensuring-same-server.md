---
sidebar_position: 3
title: Worker 放置与亲和性
description: 根据需要选择队列路由、本地活动或 Worker 会话，理解队列名不代表物理主机亲和性。
tags:
  - configuration
  - workers
  - affinity
keywords:
  - 活动 Worker 亲和性
  - 专用活动队列
  - 同进程活动
  - Worker 会话
---

# Worker 放置与亲和性 {#worker-placement-and-affinity}

队列名规定路由边界，不保证物理主机亲和性。在工作流或活动上设置 `$queue` 属性可限制哪些 Worker 可以认领任务，但轮询该队列的任何兼容 Worker 都可能收到任务。不要通过 Worker 的本地文件系统在普通活动间传递数据，除非数据也存储在持久的共享位置。

## 将工作路由到专用 Worker 池 {#route-work-to-a-dedicated-worker-pool}

某类工作需要特定 Worker 池时，请使用专用队列，例如挂载共享卷或具备 GPU 能力的 Worker：

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

在该队列上只启动预期的 Laravel Worker：

```bash
php artisan queue:work --queue=gpu-activities
```

Laravel Horizon 也可以管理该队列。两种情况下保证的都是“分配给此队列的某个 Worker”，而非“执行上一步的同一进程或主机”。请将交接数据放入持久工作流载荷、外部载荷存储，或所有符合条件的 Worker 都能访问的其他共享存储中。

## 选择所需的亲和性契约 {#choose-the-affinity-contract-you-need}

- 工作可在队列中的任何兼容 Worker 上执行时，使用[普通队列活动](/docs/defining-workflows/activities)。
- 一个短时、可重试的活动必须在当前处理工作流任务的 Worker 进程内执行时，使用[本地活动](/docs/features/local-activities)。
- 多个持久活动步骤需要复用同一 Worker 会话租约，以访问进程本地状态、GPU 内存或 Worker 本地挂载的文件系统时，使用 [Worker 会话](/docs/features/worker-sessions)。

Worker 会话仍首先应用队列路由，然后增加显式租约和能力契约，包括过期和可选的重新获取。会话不能保证单台机器永不失效。如果状态必须在 Worker 丢失或会话重新获取后继续存在，请将其保存在持久共享存储中。

放置方式的比较见[活动执行模型](/docs/features/activity-execution-model)，类级和逐调用的队列配置见[选项](/docs/configuration/options#queue)。
