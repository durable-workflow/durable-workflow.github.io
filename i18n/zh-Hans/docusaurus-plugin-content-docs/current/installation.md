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
