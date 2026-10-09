---
sidebar_position: 1
title: 工作流
description: 定义 Durable Workflow v2 工作流类，并保持编排代码具有确定性。
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - 工作流类
  - v2 工作流编写
  - 确定性工作流代码
---

# 工作流 {#workflows}

工作流和活动分别继承框架提供的 `Workflow` 和 `Activity` 基类。工作流定义一组活动，它们可以串行、并行，或混合执行。

用 Artisan 命令 `make:workflow` 创建工作流：

```php
php artisan make:workflow MyWorkflow
```

继承 `Workflow` 类并实现 `handle()` 方法：

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return activity(MyActivity::class);
    }
}
```
