---
sidebar_position: 3
title: 启动工作流
description: 异步启动工作流实例，并附加参数、可见性元数据、业务键和启动选项。
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - 启动工作流
  - 工作流实例 ID
  - 持久工作流启动选项
---

# 启动工作流 {#starting-workflows}

要启动工作流，请创建工作流实例，再调用其 `start()` 方法。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

启动后的工作流由队列 Worker 异步执行。`start()` 方法立即返回，不阻塞当前请求。

通过 `start()` 向工作流的 `handle()` 方法传入参数：

```php
$workflow->start($orderId);
```

可通过 `StartOptions` 附加可见性标签、业务键、memo 或超时。需要时请参阅[启动选项](/docs/configuration/options#startoptions)。
