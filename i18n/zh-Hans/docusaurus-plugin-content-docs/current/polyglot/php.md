---
sidebar_position: 9
title: PHP SDK
description: 将框架无关的 PHP 应用和远程 Worker 连接到自托管 Server 或 Cloud 托管运行时。
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Durable Workflow PHP SDK
  - PHP 远程 Worker
  - PHP 独立 Server 客户端
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# PHP SDK {#php-sdk}

PHP 应用或远程 Worker 连接独立 Durable Workflow Server 或 Durable Workflow Cloud 命名空间运行时 URL 时，请使用 `durable-workflow/sdk`。此第一方 SDK 与框架无关：它提供控制平面客户端、认证、传输、公开负载编解码器、重放处理器及受管理的远程 Worker 生命周期，不需要 Laravel 或嵌入式引擎包。

## 试用本地 Sample App 试验环境 {#try-the-local-sample-app-playground}

若要通过最短路径在不使用 Cloud 的情况下编写工作流，请在 [GitHub Codespaces 中打开当前 Sample App 的 `main` 分支](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)，然后运行：

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

本地试验环境生成由调用方拥有的工作流和活动源码，选择当前稳定制品，并启动已发布的 Server 和 Waterline。它先等待与生成契约中的标识、工作流类型、活动类型和任务队列完全匹配的 Worker 注册，再启动工作流。成功要求获得预期的完成结果和历史；随后终端输出精确的本地 Waterline 运行链接和结构化 JSON 证据路径。

对于希望不通过 Sample App、直接将 SDK 添加到现有项目的用户，下方由包维护的快速入门和 API 参考仍是直接路径。

<ProductPromotion source="docs-v2-php-sdk">
使用独立的角色限定凭据，对 Cloud 托管命名空间运行 PHP 客户端和 Worker。
</ProductPromotion>

分步入门、框架路径、测试、部署及故障排查请使用编写的 [PHP 开发者门户](https://php.durable-workflow.com/)。精确的构造函数签名、返回类型和异常类请查看单独的[生成 API 参考](https://php.durable-workflow.com/api/)。门户的[机器可读契约](https://php.durable-workflow.com/quickstart-contract.json) 将包、运行时形式、角色凭据、随包源码文件、预期结果及已发布制品冒烟测试定义为一条经过测试的路径。

Cloud 客户使用配置时返回的运行时 URL 和命名空间，并使用独立的客户端与 Worker 凭据。该连接边界见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)；下方示例展示同一个 SDK 连接本地自托管地址。

独立的嵌入式 Laravel 路径使用 `durable-workflow/workflow`，应用在现有数据库中管理工作流状态，并通过 Laravel 队列执行工作。完整的职责比较见[部署模式](/docs/polyglot/deployment-modes/)。

## 要求 {#requirements}

- PHP 8.1 或更高版本
- 可访问的[自托管 Server](/docs/polyglot/server/) 或已配置的 [Cloud 命名空间运行时](/docs/polyglot/cloud-control-plane)

## 安装 {#install}

安装当前已发布的 PHP SDK。下方精确依赖约束由根据注册表刷新的已发布制品权威数据生成，Composer 将解析后的包记录在 `composer.lock` 中：

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

SDK 使用官方 `apache/avro` Composer 包处理公开负载封装。其生产依赖图不包含 Laravel、Illuminate、`durable-workflow/workflow` 和 `durable-workflow/server`。

## 启动并检查工作流 {#start-and-inspect-a-workflow}

SDK 维护的快速入门创建干净的 Composer 项目，定义带特性的工作流和活动，启动 Worker，启动唯一工作流，并等待结果。随包提供的同一套 `bootstrap.php`、`worker.php` 和 `client.php` 从包中安装，并由受保护的已发布制品冒烟测试执行，因此本页不维护另一套代码清单。

只需选择运行时连接值：

| 运行时 | 传给 `Client` 的值 | SDK 请求路径行为 |
| --- | --- | --- |
| 自托管 Server | 不带路径的源地址，如 `http://localhost:8080` | 添加一个 `/api` 段；调用方不追加 `/api`。 |
| Durable Workflow Cloud | 完整的已配置 URI，如 `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | 保留命名空间运行时路径，并在其后追加端点 `/api`。 |

打开[经过测试的 PHP 路径](https://php.durable-workflow.com/) 查看精确命令及可见源码。客户端操作读取 `DURABLE_WORKFLOW_CLIENT_TOKEN`；Worker 轮询读取 `DURABLE_WORKFLOW_WORKER_TOKEN`。指南将凭据保存在独立进程中，不回显或提交任何一个值。

`Worker::register()` 发现同一源码文件中的 `#[Workflow]` 和 `#[Activity]` 处理器。指南也记录面向可调用对象的直接 `registerWorkflow()`/`registerActivity()` 替代方式。随包文件在独立项目、SDK 检出、已安装包，或将其放在 Composer `vendor/` 目录旁的试验环境/容器中运行时，引导文件让用户无需选择自动加载器路径。

发生 Continue-As-New 转换后，`WorkflowHandle` 跟随当前运行。如果某操作必须限定在某个特定运行，请使用其选定运行方法。

## 生命周期、更新、计划与可见性 {#lifecycle-updates-schedules-and-visibility}

当前公开客户端不限于处理选定运行的结果：

- `WorkflowHandle` 提供 `describe`、`result`、`signal`、`query`、`cancel` 和 `terminate`，并有选定运行变体保障特定运行操作的安全性。
- `Client` 提供带 Server 过滤和分页的 `listWorkflows`，以及 `workflowHistory`、`updateWorkflow`、`cancelWorkflow` 和 `terminateWorkflow`。
- `requestCancellation()` 向协作 Worker 请求有时限的清理。现有的 `cancel()` 和 `cancelWorkflow()` 立即关闭运行。编写及恢复契约见[协作式取消](/docs/polyglot/cancellation)。
- 计划方法覆盖创建、描述、列出、更新、暂停、恢复、触发、补跑及删除。
- 运维可见性包括 `listNamespaces`、`listWorkers` 和 `listTaskQueues`，以及对应的描述方法。

远程 Worker 通过 `registerWorkflow`、`registerActivity`、`registerQuery` 和 `registerUpdate` 注册工作流、活动、查询及更新处理器。完整参数及返回类型见生成的 [PHP SDK API 参考](https://php.durable-workflow.com/api/)。

## 活动心跳 {#activity-heartbeats}

对于远程活动，在有界工作期间调用 `ActivityContext::heartbeat($details)`，并在配置的心跳超时到期前留足时间。第一个窗口从运行时领取任务开始，而不是 PHP 收到任务时开始。请求延迟、暂停和传输重试都会消耗该窗口。请遵循[发送节奏建议](../features/heartbeats.md#heartbeat-cadence-and-receipts)。

该方法返回 `void`。在直接处理器路径中，停止响应会抛出 `ActivityCancelled`。`Client::heartbeatActivityTask()` 的 HTTP 和传输故障表现为 `ServerException`。协作监督下的 Worker 在心跳或所有权检查失败时，可能停止或放弃回调，而不是向活动代码返回正常响应。不要假定清理代码总会执行，不要忽略权限丢失错误，也不要在失去权限后提交成功结果。

调用返回并不表示外部工作已提交，也不会提供可恢复的检查点。请保持外部副作用幂等，不要将传输重试视为新的心跳窗口。

## 运行远程 PHP Worker {#run-a-remote-php-worker}

工作流处理器是普通可调用对象，以直线代码在受管理的 Fiber 中运行。直接调用 `WorkflowContext::activity()` 等操作；SDK 在持久化决策处暂停 Fiber，在重放时返回已记录结果，不重复外部活动。不要将工作流声明为 Generator，也不要 yield `WorkflowContext` 命令：Generator 结果会被拒绝。受管理的 Worker 注册其工作流和活动类型名，轮询公开 Worker 协议，发送心跳，完成或标记任务失败，并在 `pcntl` 可用时处理优雅关闭。

### 首次完成选择 {#first-completion-selection}

使用 `WorkflowContext::select()` 启动独立的延迟活动、子工作流、定时器、条件等待或嵌套的普通屏障，并在首个持久化提交的胜出项处恢复。返回的 `SelectionResult` 包含稳定的成员键和标识，以及每个成员的一个句柄：

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

选择不会取消未胜出的操作。在句柄上调用 `await()` 消费其最终结果，或调用 `cancel()` 记录显式取消。即使重复或后来的输入和终态事件以不同顺序交付，冷启动 Worker 或完整历史重放仍消费已记录的胜出项。`cancel()` 返回 void，不报告其终态结果。只有 `SelectionOperationCancelled` 历史能证明取消胜出；重放会越过未有对应记录的取消请求，如果操作先完成，`await()` 仍返回该结果。

## 入口兼容性与恢复 {#entry-compatibility-and-recovery}

**已发布支持。** PHP SDK 2.5.4 引入了下述入口保护，Server 2.9.9 提供了配套的路由和恢复支持。这些是相应功能的最低支持版本；请安装当前稳定版本以获取安全修复。

托管 Worker 会在进入处理器的 Fiber 前检查已记录的位置参数。缺少必需参数或声明的 PHP 类型不兼容时，会抛出 `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` 并报告任务原因 `workflow_entry_arguments_mismatch`。可选参数的默认值只用于省略的输入，绝不会替换不兼容的已记录值。成功进入后抛出的 `TypeError` 仍属于应用失败。

Worker 会自动声明 `workflow_entry_arguments_validation`。在配套 Server 支持下，被拒绝的任务会阻止重放，原运行则保持非终态。较旧的运行时可能改为重试失败任务，因此仅升级 SDK 并不能确立完整的恢复契约。

使用 `Client::describeWorkflow($workflowId, $runId)` 和指定运行的调试端点检查原运行。先恢复兼容代码，再调用 `Client::repairWorkflow($workflowId, $runId)`，然后确认同一个运行在不改变输入、历史、路由标识和截止时间的情况下继续执行。不要在工作流方法体中捕获此失败，也不要反复修复不兼容代码。请参阅[服务模式恢复流程](../failures-and-recovery.md#service-entry-recovery)和[定义路由](./worker-compatibility-routing.md#definition-fingerprint-evolution)。

## 框架服务模式与嵌入式 Laravel {#framework-service-mode-and-embedded-laravel}

同一个包提供第一方 [Laravel 服务模式](https://github.com/durable-workflow/sdk-php#laravel-service-mode) 和 [Symfony 服务模式](https://github.com/durable-workflow/sdk-php#symfony-service-mode) 桥接。连接 Cloud 或 Server 时，它们保留框架依赖注入、配置、日志、控制台 Worker 和测试替身。

这些桥接不同于[嵌入式 Laravel 工作流](/docs/installation/)；后者通过 `durable-workflow/workflow` 使 Laravel 应用自身管理持久状态并通过 Laravel 队列执行。参见 [Laravel 采用与运行时迁移](/docs/laravel-adoption/)，了解同一个典型 Laravel 用例如何使用 v1、v2 嵌入式及已提供的服务模式桥接，包括排空和回滚。更全面的运行时边界比较见[部署模式](/docs/polyglot/deployment-modes/)。

## 协议与发布边界 {#protocol-and-release-boundary}

SDK 在 Composer 元数据中声明支持的 Server 范围、Worker 协议版本、控制平面版本和负载编解码器。Server 也通过 `GET /api/cluster/info` 公布接受的协议和编解码器集合。部署时检查运行时发现，不要根据 Server 补丁版本推断兼容性。

PHP SDK 独立于 Laravel 包进行版本管理。可运行示例中保留精确的已发布版本固定值，升级 SDK 时评估发布说明。兼容性由 SDK 声明的契约决定，不靠包版本号相同来判断。

## 相关参考 {#related-references}

- [独立 Server](/docs/polyglot/server/)
- [部署模式](/docs/polyglot/deployment-modes/)
- [Worker 协议](/docs/polyglot/worker-protocol/)
- [能力索引](/docs/capabilities/)
- [PHP 开发者门户](https://php.durable-workflow.com/)
- [PHP API 参考](https://php.durable-workflow.com/api/)
- [PHP 可执行快速入门契约](https://php.durable-workflow.com/quickstart-contract.json)
- [PHP SDK 源码](https://github.com/durable-workflow/sdk-php)
