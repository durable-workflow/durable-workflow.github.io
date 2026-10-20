---
sidebar_position: 25
title: Sticky 执行
description: 了解建议性工作流任务亲和性、Worker 本地重放缓存、常规任务匹配与冷重放诊断。
tags:
  - sticky-execution
  - replay
  - operations
keywords:
  - Sticky 执行
  - Sticky 重放缓存
  - 冷重放回退
  - worker_id 路由
  - Sticky 缓存诊断
---

# Sticky 执行 {#sticky-execution}

Sticky 执行是 Durable Workflow v2 支持的重放优化。Worker 完成工作流任务后，可以保留进程内已预热的工作流缓存。之后同一 Worker 领取同一运行的任务时，可复用有效缓存。亲和性不会为该 Worker 预留任务。

Sticky 执行不是正确性机制。工作流进度仍只通过持久化历史提交，直接从历史进行普通冷重放始终有效。工作流代码不得依赖进程内状态保证正确性。

## 契约摘要 {#contract-summary}

Sticky 执行提供四项保证：

- Sticky 缓存由 Worker 进程持有，而非 Server 或数据库。
- Sticky 亲和性使用 Worker 协议的 `worker_id` 标识缓存所有者。
- Sticky 亲和性是有期限的建议；缓存未命中、Worker 重启、排空、发布或驱逐后，必须回退到冷重放。
- 运维人员可使用明确的配置与诊断，检查启用状态、TTL、容量、命中率、未命中率、强制冷重放及容量压力。

运行与工作流任务上的持久化亲和性字段为 `sticky_worker_id` 和 `sticky_until`。工作流任务诊断字段为 `sticky_replay_mode` 和 `sticky_claimed_at`。

## Sticky 缓存生命周期 {#sticky-cache-lifecycle}

Sticky 缓存是 Worker 本地的数据结构，保存一个或多个运行的已重放状态。具备此能力的 Worker 完成任务时，Server 可将它记录为运行的 sticky 所有者，直到 `sticky_until`。后续工作流任务创建时继承此亲和性。

Worker 管理缓存内容与驱逐策略，可在容量耗尽、开始排空、重启、更换构建、发现不安全缓存状态或主动释放内存时驱逐运行。Server 从不把缓存内容视为持久化状态。

Worker 收到带 sticky 路由信息的任务但已无有效缓存条目时，必须从持久化历史冷重放。任务租约仍是提交工作流进度的唯一权限。

## 路由标识 {#routing-identity}

路由标识为 Worker 协议中的 `worker_id`。Worker 通过启用 sticky 缓存注册，并持续作为任务队列中的活动 Worker 发送心跳来选择加入。

Sticky 亲和性不会在就绪任务匹配中增加所有者优先级或仅限所有者的保留。PHP 运行时按优先级、`available_at`、任务 ID 选择候选。Server 也可在同一优先级内按公平性键重新平衡候选批次。兼容性、工作流类型、队列、命名空间、容量与租约的常规检查仍然适用。

即使另一个在线 Worker 持有亲和性，任何符合条件的轮询 Worker 仍可在 `sticky_until` 前领取任务。所有者没有空闲工作流槽位时，其他合格 Worker 可立即领取并冷重放。任务不等待所有者缓存或亲和性到期。提高 TTL 不会延长所有者预留。

`sticky_until` 限定持久化亲和性有效的时间，以及所有者领取可被标记为 `sticky_hit_expected` 的时间。它不设置任务可用性、不延长租约，也不保证所有者本地缓存仍包含该运行。

## 回退语义 {#fallback-semantics}

冷重放是强制回退路径，发生于：

- Sticky 执行已禁用。
- Worker 未注册 sticky 缓存支持。
- 任务没有有效的 `sticky_worker_id` 与 `sticky_until`。
- 所有者已过期、缺失、正在排空、重启或已被替换。
- 所有者驱逐了运行。
- 另一 Worker 领取任务，包括所有者亲和性仍有效时。
- 任务领取前亲和性已过期。

重放模式诊断为：

- `sticky_hit_expected`：所有者在到期前领取任务，仍须先验证本地缓存再使用。
- `cold_replay`：未应用 sticky 亲和性。
- `forced_cold_replay`：已记录 sticky 所有者，但任务被其他 Worker 领取，或亲和性已过期。原所有者健康时也可能发生。

`forced_cold_replay` 不是正确性失败，它表示该任务未获得 sticky 执行预期的重放性能收益。

## 部署、排空与滚动发布 {#deployment-drain-and-rollout}

Sticky 执行遵循 Worker 生命周期。排空时，Worker 应停止领取新工作流任务，同时按照常规租约契约完成、续心跳、报告失败或等待现有租约到期。其他兼容 Worker 无需等待亲和性到期，即可领取就绪任务并冷重放。

替换 Worker 不继承进程内缓存。因此发布可能增加 `forced_cold_replay`，直到新 Worker 预热自身缓存。每个 Worker 进程或重启应使用唯一 `worker_id`，让诊断区分旧缓存所有者与新进程。

能否执行工作流任务仍由构建 ID 兼容性及工作流定义指纹决定。Sticky 执行绝不能把不兼容代码路由到运行。

## 运维控制 {#operator-controls}

Sticky 执行由工作流/运行时配置与 Worker 能力控制，不由独立 Server 镜像环境变量控制。Workflow 包配置提供启用标志与亲和性 TTL：

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

每个 Worker 在注册和心跳中通告缓存容量。可以在运行时配置禁用 sticky 路由，或运行不支持 sticky 缓存的 Worker，而不改变工作流语义。现有运行通过普通冷重放继续。

## Worker 协议字段 {#worker-protocol-fields}

支持 sticky 的 Worker 在注册时通告支持：

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Worker 在心跳中报告缓存诊断：

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

工作流任务轮询响应包含 `task.sticky_execution`，内含 `sticky_worker_id`、`sticky_until`、`replay_mode` 与 `cache_directive`。Worker 应把 `resume_if_present` 视为允许使用有效暖缓存；条目缺失或无效时应冷重放。

## 指标与诊断 {#metrics-and-diagnostics}

运维指标包括：

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

独立 Server 也在 `sticky_execution_workers` 下报告 Worker 缓存容量、缓存大小、命中数、未命中数、强制冷重放数、驱逐数及存在容量压力的 Worker 数。

可按以下方式使用这些诊断：

- `ready_sticky_tasks` 统计已记录亲和性尚未过期的就绪工作流任务，并不表示为所有者保留这些任务。PHP 运行时的 `capacity_pressure_tasks` 当前报告相同数量。
- 预期命中率低可能由其他 Worker 领取、TTL 到期、Worker 替换或缓存驱逐导致。调整 TTL 或容量前，应比较领取者 ID 与 Worker 报告的缓存指标。
- 高未命中率或大量强制冷重放意味着正确性仍受保护，但 sticky 执行未改善重放成本。
- Worker 缓存容量压力指接近或超过其通告缓存容量的 Worker，区别于空闲工作流执行槽位和就绪任务数量。

## 重放安全的代码 {#replay-safe-code}

工作流代码在 sticky 与冷重放执行下必须表现一致。决策必须使用持久化历史中的工作流输入、活动结果、定时器、信号、更新、副作用及版本标记。Memo 与搜索属性投影是运维元数据，不应依据其可变值分支工作流逻辑。

不要依赖可变全局变量、本地文件、打开的套接字、对象身份、随机值、挂钟读取或其他进程内状态保证正确性。Sticky 执行可能偶然保留这些值，又在缓存未命中、Worker 重启、发布或驱逐时丢失。

对必须记录一次的非确定值使用 [`sideEffect(...)`](/docs/features/side-effects)，对外部副作用使用普通活动。重放与持久化历史契约见[执行保证与幂等性](/docs/constraints/execution-guarantees)。
