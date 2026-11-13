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

- 框架无关的 SDK 需要 PHP 8.1 或更高版本
- PHP SDK 3.10 及更高版本中的 Laravel 服务模式桥接：需要 PHP 8.2 或更高版本，以及 12.x 中的 Laravel 12.69 或更高版本，或 13.x 中的 Laravel 13.30 或更高版本（需 PHP 8.3 或更高版本）
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

## 活动重试上下文与所属运行 {#activity-retry-context}

PHP SDK **3.6.1 及以上版本**在服务模式活动中提供 `$context->retryInfo`、`$context->workflowId` 和 `$context->runId`。对于有次数上限的策略，使用 `$context->retryInfo->isLastConfiguredAttempt() === true` 判断是否已到达配置的最后一次尝试。`attemptNumber` 保留最初收到的尝试编号。

重试快照区分三种状态：`policyProvided === false` 表示领取的任务未提供策略；提供的根值 `null` 表示未知的旧版策略；对象中显式设置的 `max_attempts: null` 才表示无限次尝试。仅凭 `maxAttempts()` 返回 `null` 不能认定重试次数无限。SDK 不会自行补充默认次数上限。取消、不可重试的失败、工作流关闭和期限届满都可能在次数用尽之前终止执行。

工作流 ID 和运行 ID 标识活动最初所属的运行。旧版任务中缺失的身份仍为 `null`。本地活动保留已知的父级 ID，但不会继承远程活动的重试策略。向所属工作流发送信号时，必须具备这两个 ID，用 `runId` 固定目标运行，并在各次重试中复用同一个业务事件的稳定请求 ID。

业务事件的信号处理必须保持幂等。仅有稳定的请求 ID 并不能保证信号只被接收一次。

请参阅 PHP SDK 指南中的[最后一次尝试检查与向自身运行发送信号的完整示例](https://php.durable-workflow.com/build/workflows-activities/)。

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

### 时长 {#durations}

从 PHP SDK 3.9.0 起，工作流定时器和超时接受与嵌入式 Laravel 包相同的时长形式。
`sleep()`、`deferTimer()`、`waitCondition()` 和 `deferCondition()` 的 `timeout`、活动超时选项、
子工作流的 `execution_timeout_seconds` 和 `run_timeout_seconds` 选项，以及服务操作的
`wait_timeout_seconds` 选项，均接受 int 或 float 秒数、`'30 minutes'` 之类的字符串，
或 `DateInterval`、`CarbonInterval`：

```php
use Carbon\CarbonInterval;

$verified = $ctx->waitCondition(
    static fn (): bool => $ctx->signals('verify') !== [],
    key: 'email-verified',
    timeout: '30 minutes',
);

$ctx->sleep(CarbonInterval::hours(2));

$receipt = $ctx->activity('payments.capture', [$orderId], [
    'start_to_close_timeout' => '30 seconds',
    'schedule_to_close_timeout' => '10 minutes',
]);
```

每个值只转换一次，向上取整为整秒，因此 `'30 minutes'`、`1800` 和
`CarbonInterval::minutes(30)` 记录的历史相同。字符串的转换方式与嵌入式 `timer()` 和
`await()` 完全相同。SDK 会拒绝 `'PT30M'` 之类的 ISO 8601 字符串（请改为传入
`new DateInterval('PT30M')`）、负值、月或更长日历单位的小数部分、超过 15 位整数数字的部分，
以及无法解析的文本。`'30'` 之类的数字字符串保持原有含义：定时器和条件超时会将其向上取整为
整秒，而活动和子工作流选项会原样传递。零时长对定时器、条件等待和 `wait_timeout_seconds` 有效；活动和子工作流超时
至少需要一秒。更早的 SDK 版本只接受秒数。PHP SDK 3.9.0 将 `nesbot/carbon`（`^2.72.6|^3.8.4`）添加为必需依赖，因此时长使用与嵌入式包相同的解析器进行转换。
[PHP SDK 时长参考](https://php.durable-workflow.com/build/workflows-activities/#durations)列出了所有单位。

## 入口兼容性与恢复 {#entry-compatibility-and-recovery}

**已发布支持。** PHP SDK 2.5.4 引入了下述入口保护，Server 2.9.9 提供了配套的路由和恢复支持。这些是相应功能的最低支持版本；请安装当前稳定版本以获取安全修复。

托管 Worker 会在进入处理器的 Fiber 前检查已记录的位置参数。缺少必需参数或声明的 PHP 类型不兼容时，会抛出 `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` 并报告任务原因 `workflow_entry_arguments_mismatch`。可选参数的默认值只用于省略的输入，绝不会替换不兼容的已记录值。成功进入后抛出的 `TypeError` 仍属于应用失败。

Worker 会自动声明 `workflow_entry_arguments_validation`。在配套 Server 支持下，被拒绝的任务会阻止重放，原运行则保持非终态。较旧的运行时可能改为重试失败任务，因此仅升级 SDK 并不能确立完整的恢复契约。

使用 `Client::describeWorkflow($workflowId, $runId)` 和指定运行的调试端点检查原运行。先恢复兼容代码，再调用 `Client::repairWorkflow($workflowId, $runId)`，然后确认同一个运行在不改变输入、历史、路由标识和截止时间的情况下继续执行。不要在工作流方法体中捕获此失败，也不要反复修复不兼容代码。请参阅[服务模式恢复流程](../failures-and-recovery.md#service-entry-recovery)和[定义路由](./worker-compatibility-routing.md#definition-fingerprint-evolution)。

## 框架服务模式与嵌入式 Laravel {#framework-service-mode-and-embedded-laravel}

同一个包提供第一方 [Laravel 服务模式](https://github.com/durable-workflow/sdk-php#laravel-service-mode) 和 [Symfony 服务模式](https://github.com/durable-workflow/sdk-php#symfony-service-mode) 桥接。连接 Cloud 或 Server 时，它们保留框架依赖注入、配置、日志、控制台 Worker 和测试替身。

这些桥接不同于[嵌入式 Laravel 工作流](/docs/installation/)；后者通过 `durable-workflow/workflow` 使 Laravel 应用自身管理持久状态并通过 Laravel 队列执行。参见 [Laravel 采用与运行时迁移](/docs/laravel-adoption/)，了解同一个典型 Laravel 用例如何使用 v1、v2 嵌入式及已提供的服务模式桥接，包括排空和回滚。更全面的运行时边界比较见[部署模式](/docs/polyglot/deployment-modes/)。

## 含二进制值的查询结果 {#query-binary-results}

PHP SDK 3.18.2 修复了包含嵌套 `AvroBinaryValue` 字节的有效 Avro 结果在查询完成时的问题。`result_envelope` 仍是权威表示。SDK 仅在无法编码为 JSON 时省略可选的普通 `result` 投影；普通 JSON 兼容结果保留该投影。

[已发布 PHP 3.18.2 / 原生 Server 3.9.1 的安装后验证](https://github.com/durable-workflow/sdk-php/pull/415#issuecomment-6858062312)（PHP 8.3.36、linux/amd64、SQLite）确认实际 Worker 对嵌套二进制字节、普通 JSON、有符号零和 `null` 的往返处理，以及 workflow 完成和 Worker 正常注销。这是兼容的查询修复，不会添加 capability，也不代表完整请求键或超时清理支持。参见 [PHP 查询指南](https://php.durable-workflow.com/build/messages/#register-a-read-only-query)。

## 稍后读取已接受的更新 {#read-an-update-outcome}

所选 PHP SDK %%artifact.publishedPhpSdkVersion%% 可通过稳定 ID 读取保留的更新，无需再次受理。`Client::updateOutcome($workflowId, $updateId)` 默认使用 `waitFor: 'completed'`：仍在等待时抛出 `UpdateStillPending`；已完成的结果可以合法地为 `null`。`updateOutcomeReceipt()` 默认使用 `waitFor: 'accepted'`，返回 Server 回执，以便将 `update_status`、`wait_timed_out` 与已完成结果分开检查。

这些 GET 读取要求 `update_outcome_reads` capability（原生 Server 3.6.0 及以上）。不支持时 SDK 抛出 `LogicException`，不会重新提交更新。首次 `updateWorkflow()` 的等待异常保留调用方请求 ID。待完成的 GET 读取保留 `updateId`，但原始请求键可能不可用：此时 `$pending->requestId` 为 `''`，表示未知。请继续使用该更新 ID 读取；切勿将空键、推测键或内部哈希键当作原始请求 ID 提交。

[已发布的 PHP 指南](https://php.durable-workflow.com/build/messages/#apply-a-tracked-update)展示处理器和客户端流程。[已安装 PHP 3.18.1 / 原生 Server 3.9.1 的验证](https://github.com/durable-workflow/sdk-php/pull/411#issuecomment-6855609359)确认从待完成到完成 null 的读取没有第二次更新受理，并验证了[完成请求大小处理](./server-config-reference.md#workflow-task-completion-size)。这些证据不代表共享 #216 的完整请求键验收或原生超时清理支持。

## 升级到 PHP SDK 3.12 至 3.14 {#upgrade-to-3-12-through-3-14}

PHP `^8.1`、Laravel 桥接的下限、worker 协议 `1.20` 和控制平面 `2` 与 3.11 相同。部署前请检查以下行为变化：

- **超出等待时间的 update。** 自 3.13 起，当 `waitFor: 'completed'` 的等待在 update 完成前结束时，`Client::updateWorkflow()` 和 `WorkflowHandle::update()` 会抛出 `UpdateStillPending`。之前的版本会把 Server 回执当作 update 的结果返回。如需继续等待，请使用 `$pending->requestId` 再次调用该 update，这不会重复应用 update。
- **过期的 worker 注册。** 自 3.13 起，`Worker::run()` 在遇到 `stale_worker_registration` 后会重新注册，而不是停止。被隔离的 worker 持有的任务会被丢弃且不完成，由 Server 重新投递。每次恢复都会记录 `worker.reregistered` 日志并递增 `durable_workflow_worker_reregistrations`。传入 `stopOnStaleRegistration: true` 可保留旧行为。
- **本地活动的退避。** 自 3.13 起，重试次数多于 `backoff_seconds` 条目的本地活动会重复最后一个延迟，而不是立即重试，与 Server 调度的活动一致。
- **原生 Server 上分组内的条件等待。** 原生 Server 目前还不接受 `all()` 或 `parallel()` 中的条件或信号等待。自 3.13.1 起，worker 会以 `grouped_condition_wait_unsupported` 使该工作流任务失败并继续运行，而不是退出。请在分组之外等待条件。

这些版本的新功能：

- **Sticky 历史后缀（3.14）。** Worker 声明 `sticky_history_suffix`。在 Server 3.5.0 或更高版本上，已持有某个运行历史的 worker 只接收其缓存序列之后的事件。不能精确接续缓存历史的后缀会被丢弃，并重新获取完整历史。旧版 Server 仍发送完整历史。
- **计划来源（3.13）。** `WorkflowContext::scheduleOrigin()` 返回启动该运行的计划触发的计划 id、发生时间和触发编号；普通启动返回 `null`。重放时该值相同。自 Server 3.5.0 起，以 continue-as-new 继续的运行会保留其计划来源。
- **活动续接（3.12）。** 当 Server 声明 `activity_workflow_continuation`（原生 Server 3.4.0 或更高版本）时，向 `Worker` 构造函数传入 `enableActivityContinuation: true`，即可把下一批工作流命令与成功的活动结果一起提交。默认值为 `false`。目前启用它会降低吞吐量：在我们的负载基准测试中，启用后工作流运行慢了 24–49%，数据库事务数量是原来的两倍（[测量](https://github.com/durable-workflow/server/issues/1078)）。如果启用，请使用 3.12.1 或更高版本，并在降级 Server 或加入旧版 Server 节点之前排空或停用这些 worker。

完整列表请参见 [3.14.0 变更日志](https://github.com/durable-workflow/sdk-php/blob/3.14.0/CHANGELOG.md)。

## 升级到 PHP SDK 3.10 和 3.11 {#upgrade-to-3-10-and-3-11}

部署前请阅读 [PHP SDK 升级指南](https://github.com/durable-workflow/sdk-php/blob/3.11.0/docs/portal/operate/upgrading.md)。可从同一任务队列接收工作的所有 Worker 须一并升级，包括备用池和自动扩缩容池。

- **Laravel 桥接。** 从 3.10 起，Laravel 服务模式桥接与 Workflow 2.21 保持一致：PHP `^8.2` 及已打补丁的 Laravel `^12.69.0|^13.30.0`。不再支持 Laravel 10 和 11。provider 会在注册任何内容之前拒绝不受支持或未知的框架与 PHP 版本。基础 SDK 继续支持 PHP `^8.1` 以及 Symfony 6.4/7/8。
- **条件指纹。** 从 3.10 起，新的条件等待会记录 v2（`dwphp2:sha256:`）谓词指纹。旧版 Worker 会拒绝这类指纹，因此在已存在 v2 等待后将 Worker 回滚到 3.10 以下，可能导致 replay 失败。请在替换 Worker 启动前停止或排空旧版 Worker，以原子方式部署 PHP 源码，并重启每个长时间运行的 Worker，包括使用 OPcache 的 Worker。replay v2 等待的 Worker 需要 PHP 的 tokenizer 扩展。现有 v1 等待仍要求源码行完全匹配。
- **静态凭据。** 从 3.10 起，静态凭据按原样校验。格式错误的 UTF-8、首尾的 Unicode 空白字符以及内嵌的控制字符现在会导致失败，而不再被裁剪或忽略。升级前请检查共享、客户端、Worker 以及框架进程交接中使用的值。
- **单次出现截止时间。** 在 3.11 中，当 Server 声明 `condition_wait_occurrence_deadline`（原生 Server 3.3.0 或更高版本）时，新的顶层条件等待在虚假唤醒后仍保留其首个截止时间。若没有该能力，Worker 发送的命令与之前相同。分组条件等待暂未启用此行为。对于较旧的 Server，请先将该队列上的所有 Worker 升级到 3.11，再升级 Server。对于已声明该能力的 Server，请在任何 3.11 Worker 消费该队列之前，排空或停止所有旧版 Worker。一旦存在锚定的等待，就不要将该队列的 Worker 回滚到 3.11 以下。

PHP SDK 3.10 还新增了 `WorkflowContext::startChildWorkflow()`，它在子工作流启动提交后返回 `ChildWorkflowHandle`，并要求运行时声明 `child_workflow_start_turn`。其他新增内容包括 `ActivityContext::activityExecutionId`、`upsertSearchAttributes()` 的可选类型化声明、惰性工作流列表与历史迭代器，以及默认值为 `false` 的 `enableCompletionPipelining` Worker 选项。只有在运行时声明支持时才会使用随完成结果携带的轮询。完整列表见 [3.11.0 变更日志](https://github.com/durable-workflow/sdk-php/blob/3.11.0/CHANGELOG.md)。

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

## 工作流列表与历史页面 {#workflow-list-and-history-pages}

这些已发布调用每次返回**一页**，不会自动完整读取：`Client::listWorkflows(...)` / `Client::workflowHistory(...)`。继续请求时使用返回的不透明 token，并保持 namespace、筛选条件和所选 workflow/run 不变；最终 null/空 token 表示结束，页面错误必须明确处理。部分页面不是 replay bundle。离线 replay 请使用 SDK 的历史导出 API。[已发布的 PHP 3.2.0 客户端源码](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php)定义分页参数。

PHP SDK 3.10.0 及更高版本还提供 `Client::iterateWorkflows()` 和 `Client::iterateWorkflowHistory()`。它们以惰性方式逐页读取完整的工作流列表或精确运行的历史，并保持不透明游标、namespace 和筛选条件不变。后续页面的错误会向上传播；格式错误的续读或 token 循环会被拒绝，而不会截断结果或陷入循环。参见[已发布的 PHP 3.11.0 客户端源码](https://github.com/durable-workflow/sdk-php/blob/3.11.0/src/Client.php)。

## 有界失败报告 {#bounded-failure-reports}

PHP SDK **3.5.0** 为发出的失败报告引入了大小限制。默认上限为：**消息使用 UTF-8 编码后 62 KiB**、**堆栈 128 KiB**、**可选详情和诊断信息序列化后合计 64 KiB**，以及 **JSON 编码后的完整请求体 1 MiB**。标记、JSON 转义、租约身份和批次中的其他命令都计入请求体上限。配置或传输实现声明的上限更低时，以较低值为准。失败类型、类、代码、重试策略和租约身份会保留。

`withFailureReportLimit()` 返回一个新客户端，将完整请求的上限降低到 1 至 1,048,576 字节之间。请使用返回的实例。传输实现声明了更低上限时，也会采用该上限。

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

被缩短的字段带有可见的截断标记和原始字节数。Avro 详情要么完整保留，要么整体省略。无法表示必需的信封时，会在发送 HTTP 请求前抛出 `DurableWorkflow\Exception\FailureReportRefused`。本地失败会在工作流代码读取前规范化，因此首次执行和冷重放读取的是同一条已持久化消息。已经读取的本地消息在最终调整批次大小时保持不变。
