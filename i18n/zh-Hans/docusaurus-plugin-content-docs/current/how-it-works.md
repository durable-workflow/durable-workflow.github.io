---
sidebar_position: 10
title: 工作原理
description: 理解 Laravel 队列、事件溯源、活动和确定性重放如何组成持久执行。
---

# 工作原理 {#how-it-works}

Durable Workflow 使用 Laravel 队列任务和基于事件溯源的持久存储，实现持久协程。工作流通过基于 Fiber 的函数调用暂停执行，并按持久历史重放。

## 运行时 {#runtime}

工作流是一个类，其 `handle()` 方法直接调用 `activity()`、`await()`、`timer()`、`sideEffect()`、`child()` 和 `all([...])` 等函数。每次调用会暂停工作流，直到相应持久步骤完成，再带着已记录的结果继续执行。

每一步都会产生持久历史事件。工作流被唤醒时，引擎重放历史，根据事件流重建状态，再执行下一个尚未完成的步骤。因此，工作流能够跨越 Worker 重启、部署和机器故障，保留自己的执行进度。

`WorkflowStub::make()` 预留公开的工作流实例 ID。启动工作流会创建第一次运行及第一项工作流任务。每次运行有独立的运行 ID。`signal()`、`cancel()` 和 `terminate()` 等操作面向该实例的当前运行。

## 事件溯源 {#event-sourcing}

事件溯源根据已保存的事件序列重建当前状态，不直接保存整个状态快照。它提供完整的执行历史，也能在 Worker 崩溃后用来恢复工作流。

## 协程 {#coroutines}

协程是可以暂停并恢复执行的函数。持久暂停点通过 `activity()`、`await()`、`timer()` 和 `sideEffect()` 等基于 Fiber 的调用表达。

用户代码位于普通的 `handle()` 方法中，直接调用这些函数。运行时先检查该步骤是否已持久完成。如果已完成，就从历史读取结果，不再执行第二次。如果尚未完成，就将下一项活动、定时器或子工作流任务入队，并暂停到该步骤完成或失败。

## 活动 {#activities}

工作流调用多个活动来协调它们的结果。编排代码和持久步骤交替执行：到达活动调用时暂停，活动完成后继续。

如果工作流 Worker 崩溃，引擎重放已提交的事件，重建当前状态。工作流使用相同的输入与输出继续执行，保持确定性。未处理的工作流失败会使运行进入终态，重放不会重新尝试已经失败的运行。

v2 的普通活动是持久队列任务，可以由任意兼容 Worker 执行。[本地活动](./features/local-activities.md)在工作流 Worker 进程中执行短时工作，同时保留持久历史与重试语义。如果多个活动需要同一 Worker 的本地资源，可以通过 [Worker 会话](./features/worker-sessions.md)申请明确的租约。如果需要只记录一次、可安全重放的值，而无需将活动入队，使用 [`sideEffect(...)`](./features/side-effects.md)。完整契约见[活动执行模型](./features/activity-execution-model.md)。

## 执行保证 {#execution-guarantees}

工作流代码和活动代码对重复执行有不同语义：

- **工作流代码会被重放。** 重新投递工作流任务时，从持久历史重建状态并重新运行确定性的编排代码，不重复已记录的外部副作用。
- **活动是至少一次的队列任务。** 重试、租约过期或 Worker 丢失后，同一逻辑活动可能再次被投递或观察。重复投递是分布式系统的正常情况。
- **活动标识是持久的。** `activity_execution_id` 标识跨重试与重新投递的逻辑活动执行，`activity_attempt_id` 标识一次具体尝试。默认使用前者作为远程幂等键，只有外部系统需要区分尝试时才使用后者。

完整 v2 契约见[执行保证与幂等性](./constraints/execution-guarantees.md)、[活动执行模型](./features/activity-execution-model.md)和[故障与恢复](./failures-and-recovery.md)。

## 队列 {#queues}

队列任务在后台稍后执行。Laravel 支持 Amazon SQS、Redis 或关系数据库队列。工作流和活动都是队列任务，但执行方式不同。正常工作流会被派发多次：执行编排代码，派发一个或多个活动，然后结束本次任务，等待活动完成后再次被派发。活动按至少一次执行，常见情况是一次成功尝试，但重试、租约过期或 Worker 丢失都可能造成同一逻辑活动被再次投递。

## 示例 {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## 时序图 {#sequence-diagram}

下图展示工作流如何经过串行和并行活动继续执行。

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="工作流执行时序图"
/>

1. 工作流作为队列任务被派发。
2. 第一个活动 `TestActivity` 被派发，工作流任务结束。活动完成后将结果保存到数据库，并再次派发工作流。
3. 工作流进入事件溯源的重放循环，从数据库读取事件流，重建当前状态。工作流不是持续运行的进程，它在活动执行期间结束任务，在活动完成后再次被派发。
4. 重放后，工作流派发下一个活动 `TestOtherActivity`。该活动完成后保存结果，再次派发工作流。
5. 工作流再次重放事件流，重建状态。
6. 工作流并行派发 `TestParallelActivity` 和 `TestParallelOtherActivity`。两个活动完成后保存结果，把控制权交还给工作流。
7. 工作流最后一次重放历史、重建状态，完成执行。

## 确定性 {#determinism}

每次唤醒都会重放历史，因此相同历史必须产生相同命令。[约束](./constraints/overview.md)介绍代码规则，以及在原本可能不确定的场景中可用的功能，例如 `Workflow\V2\Workflow` 上的 `Workflow::now()`、`sideEffect()` 和 `getVersion()`。
