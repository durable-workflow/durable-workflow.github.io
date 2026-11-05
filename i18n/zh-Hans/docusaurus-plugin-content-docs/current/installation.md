---
sidebar_position: 3
---

# 安装 {#installation}

本指南说明如何在 Laravel 应用中安装 Durable Workflow PHP 包。

如果还在内嵌包与独立 Server 之间选择，请先阅读[部署模式](/docs/polyglot/deployment-modes)。本页只介绍 Laravel 内嵌路径。

> **想从可运行的应用开始？** [Sample App](/docs/sample-app)是使用 Durable Workflow 2.0 的 Laravel 13 项目，为各类模式提供工作流示例，并支持 Codespaces 和 `docker compose`。克隆后运行 `php artisan app:init` 即可完成安装。需要将 Durable Workflow 加入自己的 Laravel 应用时，再回到本指南。

## 环境要求 {#requirements}

已发布的 Workflow 2.20.x 系列要求：

- PHP `^8.1`
- Laravel 10–13，且满足[软件包清单](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)
  中声明的最低版本

Laravel 11 和 12 要求 PHP 8.2 或更高版本，Laravel 13 要求 PHP 8.3 或更高版本。
确切约束及 PHP SDK 的独立边界请参阅
[版本兼容性](/docs/compatibility/#embedded-php-and-laravel-support)。

### 为 Workflow 2.21 做准备 {#preparing-for-workflow-2-21}

:::info 尚未发布的支持范围变更

Workflow 2.21 的源代码要求 PHP `^8.2` 和 Laravel `^12.69.0|^13.30.0`。
该版本尚未发布，也尚未通过 Release Verification。下方安装命令仍选择已发布的产物；
合并源代码不会改变这一权威依据。

:::

采用 2.21 之前，请将使用 PHP 8.1 或 Laravel 10/11 的应用升级到受支持的平台。
Laravel 13 仍要求 PHP 8.3 或更高版本。准备和测试期间应保留应用现有的 2.20.x 锁文件，
并更新 Web、CLI 和 Worker 进程所用的环境。显式要求 2.21 时应拒绝不受支持的平台；
请保持 Composer 的平台检查和安全公告阻断机制启用。保留 2.20.x 并不会延长旧版
PHP 或 Laravel 的上游安全支持。

此次支持范围变更不引入模式、历史或协议迁移。现有 v1 运行仍由 v1 管理；
排空或共存仍须遵循[迁移流程](/docs/migration/)。

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

如果希望 Composer 自动接受兼容的 2.x 更新，可以使用 `durable-workflow/workflow:^2.0`。[版本兼容性](/docs/compatibility)说明运行时和包的兼容规则。

包会自动加载数据库迁移，安装后运行常规迁移命令即可：

```bash
php artisan migrate
```

## 运行 Worker {#running-workers}

Durable Workflow 使用队列在后台执行工作流和活动。运行 [`queue:work` 命令](https://laravel.com/docs/12.x/queues#the-queue-work-command)，或通过 [Horizon](https://laravel.com/docs/12.x/horizon)管理队列 Worker。没有队列 Worker，工作流和活动就不会被处理。并行执行工作流和活动需要多个队列 Worker。
