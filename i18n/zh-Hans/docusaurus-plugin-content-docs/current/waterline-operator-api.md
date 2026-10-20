---
sidebar_position: 13
title: Waterline 操作 API 参考
description: 仪表板列表、所选运行详情、历史导出、计划、已保存视图、偏好和操作的类型化 Waterline API 契约。
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - Waterline API 参考
  - 所选运行详情
  - 历史导出
  - 可操作性契约
  - 工作流操作
---

# Waterline 操作 API 参考 {#waterline-operator-api-reference}

Waterline 是嵌入式 Laravel 和独立 Server 部署的持久状态操作界面。UI 使用的就是本页记录的 HTTP+JSON API，因此脚本、仪表板和代理可以读取持久工作流事实，无需抓取 HTML。

需要类型化操作证据时使用本参考，包括所选运行详情、历史导出、可操作性、命令可用操作、已保存视图、偏好和计划可见性。Waterline 持久状态与 Worker/运行时遥测的概念区别参见[监控](./monitoring.md)。

## 安装 {#installation}

将 Waterline 安装到已安装工作流软件包的同一个嵌入式 Laravel 应用中：

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%%
php artisan waterline:install
```

生成的固定版本选择 Waterline 和 Workflow 的稳定 2.x 发布。嵌入模式直接读取应用的工作流状态，不需要服务 SDK。升级 Waterline 后，发布当前资源：

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

若在 Laravel 宿主中观察服务模式，还需安装 PHP SDK：

```bash
composer require %%artifact.phpSdkComposerPackage%%
```

独立 Waterline 服务镜像已包含该 SDK。其连接、身份验证和持久化输入参见[监控](./monitoring.md#waterline-service)。

### 界面语言 {#interface-language}

Waterline 在嵌入和服务模式下都支持英语、巴西葡萄牙语、简体中文、法语、德语、日语、西班牙语和乌克兰语。在 Laravel 应用环境或服务容器环境中设置语言：

```dotenv
WATERLINE_LOCALE=es
```

| 语言 | 设置 |
| --- | --- |
| 英语 | `en` |
| 巴西葡萄牙语 | `pt-BR` |
| 简体中文 | `zh-Hans` |
| 法语 | `fr` |
| 德语 | `de` |
| 日语 | `ja` |
| 西班牙语 | `es` |
| 乌克兰语 | `uk` |

`es-ES`、`es-MX` 和 `es-419` 等西班牙语区域别名会选择共享的西班牙语界面。`pt`、`pt_br` 及大小写变体选择巴西葡萄牙语（`pt-BR`）。其他葡萄牙语区域回退到英语。计数、图表标签和相对时长遵循所选界面语言。
简体中文使用 `zh-Hans`。`zh`、`zh-CN`、`zh-SG` 和 `zh-Hans-CN` 等明确指定简体字形的标签选择同一界面。支持下划线和大小写变体。`zh-Hant`、`zh-TW` 和 `zh-HK` 等繁体中文标签回退到英语。
日语使用 `ja`。`ja-JP` 等区域别名、下划线及大小写变体均选择同一日语界面。
法语使用 `fr`。`fr-FR`、`fr-CA` 等区域别名、下划线及大小写变体均选择共享法语界面。
德语使用 `de`。`de-DE`、`de-AT`、`de-CH` 等区域别名、下划线及大小写变体均选择共享德语界面。

英语是默认和回退语言。嵌入式应用也可在解析后的配置中设置 `waterline.locale`。修改后应重建 Laravel 配置缓存。Waterline 保持宿主应用语言、工作流名称、标识符、负载和原始异常文本不变。JSON API 字段名和机器状态保留现有值。

## 部署边界 {#deployment-boundary}

Waterline 有两个后端适配器：

- 嵌入模式运行在 Laravel 宿主内，在进程内读取工作流软件包的持久状态。
- 服务模式运行已发布 Waterline 镜像，通过 `durable-workflow/sdk` 和 Server 公开 API 读取一个独立 Server 命名空间。

两个适配器都公开本页记录的 Waterline 路由。服务模式将这些路由转换为对应的 Server 契约：

| Waterline 路由族 | 服务模式使用的独立 Server 契约 |
| --- | --- |
| `GET /waterline/api/v2/health` | Server 健康、Worker 注册和任务队列可见性。 |
| `GET /waterline/api/stats` | 命名空间级操作仪表板和指标快照。 |
| 工作流列表、所选运行详情和历史导出 | [Server API 参考](./polyglot/server-api-reference.md)中的工作流列表、详情、运行实例、历史和诊断。 |
| 信号、更新、查询、取消、终止、修复和归档操作 | 对应的 Server 工作流命令和修复契约。 |
| `/waterline/api/v2/schedules` 下的路由 | Server 的计划列表、详情、历史和变更契约。 |

部署 Waterline 后仍可直接使用 Server API、CLI 和 SDK 接口。不要假设可跨模式或跨命名空间查看：运行实例始终通过所属运行时和命名空间读取和操作。[部署模式](./polyglot/deployment-modes.md)定义了这一共享产品边界。

## 基础路径与范围 {#base-path-and-scope}

Waterline 挂载在 Laravel 应用配置的 Waterline 基础路径下。以下示例使用 `/waterline`；若应用以其他前缀发布 Waterline，保持 `/api/...` 后缀不变。

配置 `WATERLINE_NAMESPACE` 后，每个列表、详情、计划和操作路由都限于该命名空间。跨命名空间读取和命令返回未找到语义，避免泄露其他命名空间的工作流状态。

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## 身份验证 {#authentication}

每个 Waterline UI 和 JSON API 控制器都经过 Waterline 访问检查。嵌入模式下，Laravel 宿主定义该检查，决定适用的 guard、路由中间件、gate、策略、SSO/OIDC/SAML 会话、基于目录的组、服务令牌和速率限制。

当前 JSON 操作 API 路由组排除了 Laravel 的 CSRF 中间件，让宿主能对读取和命令统一应用会话或服务令牌边界。宿主仍负责验证这些请求，并记录它在 API 外围添加的浏览器会话 CSRF 保护。

独立服务镜像没有宿主应用用户。在设置 `WATERLINE_ALLOW_UNAUTHENTICATED=true` 前，先将其放在带身份验证的反向代理之后或私有接口上；该设置将 Waterline 入口检查委托给外围部署。另一个独立边界是 `WATERLINE_SERVER_TOKEN`，用于验证 Waterline 通过 PHP SDK 发往独立 Server 的调用。绝不要将此 Server 凭据暴露给浏览器。

`WATERLINE_ACCESS_MODE=read_only` 在本地阻止 Waterline 变更路由。`operator` 启用这些路由，但所连接 Server 仍执行自己的令牌角色和命名空间授权。部署示例和两层身份验证边界参见[监控](./monitoring.md#waterline-service)。

## 仪表板与健康 {#dashboard-and-health}

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | 仪表板总量、积压计数、修复策略、操作指标和 Worker 集群趋势数据。 |
| `GET` | `/waterline/api/v2/health` | Waterline 软件包/运行时健康和 v2 数据源就绪状态。 |

`/waterline/api/stats` 是仪表板摘要接口。应将 `operator_metrics` 视为 Waterline 自有的 JSON 诊断，而非 Prometheus 抓取接口。运行时延迟和自定义应用遥测请使用 Worker SDK 指标。

[操作运行边界](./operator-operating-envelope.md)定义如何在发布和事故响应中解读这些诊断，具体包括：

| 字段族 | 含义 |
| --- | --- |
| `operator_metrics.backlog.*` | 持久的可运行、延迟、已租出、不健康、需要修复、领取失败和兼容性阻塞的工作数量，以及集群级 `tasks_added_last_minute` 和 `tasks_dispatched_last_minute` 队列流量事实。 |
| `operator_metrics.matching_role.*` | 响应请求的进程所使用的节点本地匹配/分发契约：`queue_wake_enabled`、部署 `shape`、`task_dispatch_mode`、冻结的 `partition_primitives` 以及当前 `backpressure_model`。 |
| `operator_metrics.repair.*` | 修复循环扫描范围，包括选中候选项、候选项年龄和扫描压力。 |
| `operator_metrics.projections.*` | 运行摘要、等待、时间线、定时器和谱系的投影漂移计数。 |
| `operator_metrics.command_contracts.*` | 仍需回填的旧版 WorkflowStarted 契约快照。 |
| `operator_metrics.history.*` | 历史大小和事件计数压力，以及 continue-as-new 建议。 |
| `queue_visibility.available`, `queue_visibility.reason` | 宿主应用上是否有命名空间级队列可见性，以及不可用的原因。 |
| `queue_visibility.task_queues[].stats.*` | 队列本地积压、积压年龄、轮询者数量、工作流/活动的就绪与已租出计数，以及每队列 `tasks_added_last_minute` / `tasks_dispatched_last_minute` 流量事实。 |
| `queue_visibility.task_queues[].repair.*` | 队列本地修复压力，包括候选项、分发失败、过期租约、分发逾期数量，以及每种情况的最长年龄。 |
| `coordination_alerts[]` | 根据健康检查及队列可见性风险汇总的警告和错误，例如有积压但无轮询者、轮询者过期或修复候选项过旧。 |
| `checks[]`, `categories.*` | 阻塞与提示性的 v2 健康检查，每项检查有 `category = correctness | acceleration`，以及 Waterline 在 Worker 界面使用的分类汇总。 |
| `engine_source`, `readiness_contract` | Waterline 是否正在使用 v2 操作桥接，以及约束该状态的就绪契约。 |

队列流量字段回答一个具体的运维问题：持久队列输入的到达速度是否超过系统分发速度？`tasks_added_last_minute` 统计过去 60 秒内新建的不同持久任务行，`tasks_dispatched_last_minute` 统计最近一次成功分发发生在同一窗口内的不同持久任务行。

应将队列流量总量与 Server 任务队列可见性路由一起使用。Waterline 告诉你持久流入是否超过分发速度；`/api/task-queues` 和 `/api/task-queues/{taskQueue}` 则说明热点队列是 `saturated`、有意 `throttled`、`no_active_workers`，还是存在其他健康轮询者或槽位不足问题。

`GET /waterline/api/v2/health` 无需离开 Waterline 界面即可提供同样的队列本地证据。需要某个命名空间当前队列状态的脚本和仪表板，应读取 `queue_visibility.task_queues[]` 获取每队列统计，并读取 `coordination_alerts[]` 了解当前哪些队列或健康检查条件需要操作人员关注。

`matching_role` 字段回答另一个问题：此节点当前提供哪种匹配形态？`shape` 区分 `in_worker` 与 `dedicated`，`partition_primitives` 将路由轴固定为 `connection`/`queue`/`compatibility`/`namespace`，`backpressure_model` 当前报告 `lease_ownership`。应将此块视为进程本地信息。在混合形态发布期间，先比较各节点，再判断积压或轮询差异是否意味着 Worker 故障。

`GET /waterline/api/v2/health` 使用相同区分：`error` 表示阻塞，`warning` 表示提示，`ok` 表示当前 v2 操作桥接已就绪。

## 列表视图 {#list-views}

列表视图按持久状态分组：

| 方法 | 路径 | 分组 |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | 开放或处于阻塞中的运行实例。 |
| `GET` | `/waterline/api/flows/completed` | 成功关闭的运行实例，包括 `closed_reason = continued` 的续接实例。 |
| `GET` | `/waterline/api/flows/failed` | 失败的运行实例。 |
| `GET` | `/waterline/api/flows/cancelled` | 已取消的运行实例。 |
| `GET` | `/waterline/api/flows/terminated` | 已终止的运行实例。 |

列表行是紧凑的操作摘要。稳定字段包括工作流身份（`id`、`instance_id`、`run_id`、`workflow_type`）、状态（`status`、`closed_reason`、`archived_at`）、时间信息、`history_event_count`、`history_size_bytes`、`continue_as_new_recommended`，以及 `repair_blocked` 等修复/可操作性标记。

## 所选运行详情 {#selected-run-detail}

Waterline 有两种寻址模式：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | 工作流实例当前选中的运行实例。 |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | 明确指定的所选运行实例。 |
| `GET` | `/waterline/api/flows/{id}` | 按 Waterline 行 ID 或运行 ID 进行旧版/详情查找。 |

所选运行详情是操作界面的权威 JSON 契约，包含以下持久状态和派生诊断：

| 字段族 | 含义 |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | 优先从类型化历史重建的当前和历史等待状态。 |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | 命令生命周期行和可加载的工作流契约目标。 |
| `timeline` | 有序的持久事件和诊断条目。 |
| `exceptions`, `logs` | 失败事实和重放/调试上下文。 |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | 所选运行实例的 UI 和自动化可用操作。 |
| `actionability` | 下文说明的带版本修复与证据契约。 |

自动化应优先使用所选运行详情而非截图。截图能展示操作人员看到什么；所选运行详情解释为何能够或不能修复、查询、取消、归档或重放工作流。

## 历史导出 {#history-export}

历史导出是重放/调试包。它们刻意包含已存储的工作流、命令、活动、更新、任务、失败和历史负载，让开发者能够复现或归档所选运行实例。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | 导出某实例当前选中的运行实例。 |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | 导出明确指定的运行实例。 |
| `GET` | `/waterline/api/flows/{id}/history-export` | 按 Waterline 行 ID 或运行 ID 进行旧版/详情导出。 |

如果导出可能离开受保护环境，应先配置工作流历史导出脱敏器。下游工具应保留导出的 `redaction` 元数据，让审查者知道产物应用了哪项策略。

## 可操作性契约 {#actionability-contract}

Waterline 以带版本的可操作性契约标注列表行、所选运行详情响应、时间线条目和历史导出：

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

契约标识为 `actionability_contract.schema = waterline.actionability` 和 `actionability_contract.version = 1`。

运行级 `actionability` 回答所选运行实例能否修复：

| 字段 | 含义 |
| --- | --- |
| `repair_state` | `repairable`、`blocked`、`not_needed` 或 `unknown` 之一。 |
| `repairable` | `repair_state = repairable` 的布尔简写。 |
| `blocked_reason` | `repair_state = blocked` 时的稳定原因码。 |
| `status_bucket` | 决定运行级判断的 Waterline 状态分组。 |
| `closed_reason` | 运行实例关闭时的持久关闭原因。 |
| `task_problem` | Waterline 是否在运行实例上发现任务级问题。 |
| `diagnostic_only_evidence` | 至少一行提供信息但不能作为恢复来源时为 true。 |

`activities`、`waits`、`timers`、`exceptions`、`logs` 及时间线/导出条目中的证据行，可包含自己的 `actionability` 块：

| 字段 | 含义 |
| --- | --- |
| `state` | 行是有效修复来源时为 `actionable`，否则为 `diagnostic_only`。 |
| `repair_source` | 仅在行具有可修复的权威来源时为 true。 |
| `diagnostic_only` | 该行不得用作恢复来源时为 true。 |
| `history_authority` | 来源权威，例如 `typed_history`、`mutable_open_fallback`、`failure_row_fallback` 或 `unsupported_terminal_without_history`。 |
| `history_unsupported_reason` | 不受支持的回退历史的稳定原因码。 |

代理和脚本必须依据 `actionability.repair_state`、`actionability.repairable` 和行级 `actionability.repair_source` 决定是否修复/恢复。`diagnostic_only = true` 的行是证据，不代表允许重放或恢复。

## 操作 {#operator-actions}

Waterline 操作是通过所选运行契约发出的持久命令。实例路由指向当前运行实例；运行路由明确拒绝过期或错误的运行目标。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | 对当前运行实例执行已声明的查询。 |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | 向当前运行实例发送信号。 |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | 向当前运行实例提交更新。 |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | 可操作性允许时，为当前运行实例分发一次修复。 |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | 请求取消当前运行实例。 |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | 终止当前运行实例。 |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | 归档所选的已关闭运行实例。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | 对明确选定的运行实例执行查询。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | 仅当所选运行实例是当前实例时发送信号。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | 仅当所选运行实例是当前实例时提交更新。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | 修复明确选定的运行实例。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | 仅当所选运行实例是当前实例时取消。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | 仅当所选运行实例是当前实例时终止。 |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | 归档所选的已关闭运行实例。 |

信号、更新和查询接受 JSON `arguments`。参数无效时返回字段级验证失败。重放被阻止时返回 `409 Conflict` 和 `workflow_definition_unavailable` 等稳定原因，而不会尝试尽力执行。

## 检查更新 {#update-inspection}

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | 检查当前运行实例的更新生命周期行。 |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | 检查明确指定运行实例的更新生命周期行。 |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | 旧版/详情更新查找。 |

当 UI 或代理需要解释更新是已接受、已应用、已完成、已拒绝、等待期间超时，还是因重放兼容性被阻止时，使用更新检查。

## 计划 {#schedules}

Waterline 计划路由是 v2 可见性和操作路由：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | 列出当前命名空间内可见的计划。 |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | 描述一个计划。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | 暂停后续触发。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | 恢复已暂停的计划。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | 立即触发一次。 |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | 补触发某个时间窗口。 |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | 删除计划。 |

计划响应公开操作、状态、下次触发、近期触发历史、重叠策略、备注、memo 和搜索属性，供操作人员审查。

## 已保存视图与偏好 {#saved-views-and-preferences}

已保存视图和偏好是 UI 自有的操作配置，不是工作流历史。它们仍有助于形成稳定运维手册，让团队共享事故期间使用的确切筛选条件和表格布局。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | 列出已保存的操作视图。 |
| `POST` | `/waterline/api/saved-views` | 创建已保存视图。 |
| `GET` | `/waterline/api/saved-views/{view}` | 读取一个已保存视图。 |
| `PUT` | `/waterline/api/saved-views/{view}` | 更新已保存视图。 |
| `DELETE` | `/waterline/api/saved-views/{view}` | 删除已保存视图。 |
| `GET` | `/waterline/api/preferences/{surface}` | 读取某个界面的 UI 偏好。 |
| `PUT` | `/waterline/api/preferences/{surface}` | 更新某个界面的 UI 偏好。 |

不要将已保存视图名称或偏好负载视为持久工作流事实。需要证据时，应引用所选运行详情或历史导出。

## 错误契约 {#error-contract}

Waterline 使用常规 HTTP 状态码和 JSON 错误详情：

| 状态 | 含义 |
| --- | --- |
| `400` | 请求格式错误或操作负载不受支持。 |
| `404` | 当前命名空间内未找到工作流实例、运行实例、更新、计划、已保存视图或偏好界面。 |
| `409` | 所选运行实例无法执行该操作，通常因为它是历史实例、已关闭、重放被阻止或定义不可用。 |
| `422` | 验证失败；响应包含字段级错误。 |
| `500` | 意外应用失败。 |

自动化应根据状态码及 `blocked_reason`、`query_blocked_reason`、`outcome`、`reason` 和 `actionability` 等稳定字段值决定分支。不要把提示消息文本或按钮标签当作契约来解析。

## 另请参阅 {#see-also}

- [监控](./monitoring.md)
- [失败与恢复](./failures-and-recovery.md)
- [查询](./features/queries.md)
- [取消与终止](./features/cancel-and-terminate.md)
- [代理工具契约](./agent-tooling-contract.md)
