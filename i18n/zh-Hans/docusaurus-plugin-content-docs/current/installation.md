---
sidebar_position: 3
---

# 安装 {#installation}

本指南说明如何在 Laravel 应用中安装 Durable Workflow PHP 包。

如果还在内嵌包与独立 Server 之间选择，请先阅读[部署模式](/docs/polyglot/deployment-modes)。本页只介绍 Laravel 内嵌路径。

> **想从可运行的应用开始？** [Sample App](/docs/sample-app)是使用 Durable Workflow 2.0 的 Laravel 13 项目，为各类模式提供工作流示例，并支持 Codespaces 和 `docker compose`。克隆后运行 `php artisan app:init` 即可完成安装。需要将 Durable Workflow 加入自己的 Laravel 应用时，再回到本指南。

## 环境要求 {#requirements}

- PHP 8.x 系列中的 8.2 或更高版本
- Laravel 12.x 中的 12.72 或更高版本，或 13.x 中的 13.41 或更高版本
- Laravel 13 需要 PHP 8.3 或更高版本

这些要求适用于当前嵌入式版本。更新旧应用的 Composer 依赖前，请先选择
[已发布的兼容版本线](./compatibility.md#laravel-support)。服务模式的基础 PHP SDK 有独立要求。

参阅[数据库兼容性](./polyglot/database-support.md)，了解嵌入式与 Server 声明、确切测试配置及验证边界。

Durable Workflow 支持 Laravel 的各类队列驱动，**不支持 `sync`**，例如：

- Amazon SQS
- Beanstalkd
- Database
- Redis

各队列驱动有自己的[前提条件](https://laravel.com/docs/12.x/queues#driver-prerequisites)。

还需要使用支持[锁](https://laravel.com/docs/12.x/cache#atomic-locks)的缓存驱动。

## 安装 Durable Workflow {#installing-durable-workflow}

通过 Composer 安装：

```bash
composer require %%artifact.workflowComposerPackage%%
```

上述命令固定已发布的嵌入式版本。放宽约束或升级旧 Laravel 应用之前，
请查看 [Laravel 支持与升级边界](./compatibility.md#laravel-support)。

包会自动加载数据库迁移，安装后运行常规迁移命令即可：

```bash
php artisan migrate
```

## 运行 Worker {#running-workers}

Durable Workflow 使用队列在后台执行工作流和活动。运行 [`queue:work` 命令](https://laravel.com/docs/12.x/queues#the-queue-work-command)，或通过 [Horizon](https://laravel.com/docs/12.x/horizon)管理队列 Worker。没有队列 Worker，工作流和活动就不会被处理。并行执行工作流和活动需要多个队列 Worker。

### Worker 超时 {#worker-timeout}

当 PHP 启用了 `pcntl` 扩展时，队列 Worker 会终止运行时间超过其超时的任何作业。这个超时就是 Worker 的 `--timeout`，默认 60 秒，除非作业设置了自己的超时。被终止的工作流任务会失去租约并被回滚。只有在租约到期（`workflows.v2.workflow_task_lease_seconds`，默认 300 秒）后才会重试，而重试会重复同样的工作。始终需要比超时更长时间的工作流任务（例如调度或完成一个大规模 `all()` 的任务）永远无法完成。

以下三项设置必须相互匹配：

- **工作流任务超时**必须小于**工作流任务租约**。运行超过租约的工作无法完成。
- 队列连接的 **`retry_after`** 必须大于该连接上每个作业的超时，这是 Laravel 的要求。否则，队列会把仍在运行的作业交给第二个 Worker。
- **活动**应保留有上限的超时，以免挂起的活动永远占用 Worker。不要使用 `--timeout=0`。

在专用的队列连接上运行工作流任务，该连接的 `retry_after` 要大于租约，Worker 的 `--timeout` 要小于租约。在另一个队列上运行活动，并使用适合它们的超时。除非活动类设置了自己的 `$connection` 或 `$queue`，活动会使用其工作流的队列。

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

在 Horizon 中，每个 supervisor 的 `timeout` 选项就是 Worker 超时。较新的 Workflow 版本会为每个工作流任务作业设置这一超时（租约减去 30 秒，并保持比 `retry_after` 至少小 10 秒），因此较短的 Worker 超时不再会终止工作流任务。当 `retry_after` 限制了工作流任务时，工作流队列上的 Worker 会在启动时记录一条警告。
