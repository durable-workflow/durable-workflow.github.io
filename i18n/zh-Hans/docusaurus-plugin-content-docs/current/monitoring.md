---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - 工作流监控
  - 持久历史
  - 运行时遥测
  - Waterline 可操作性
  - 仅供诊断的证据
  - 修复状态
---

# 监控 {#monitoring}

[Waterline](https://github.com/durable-workflow/waterline) 是查看工作流状态的操作人员 UI 和 API。其交付方式遵循所选运行时边界：Cloud 包含 Managed Waterline，自托管操作人员则在需要时单独部署 Waterline。

Waterline 是同一个运维产品，有三种使用形式：

- **嵌入模式**：将 Composer 软件包安装到拥有工作流的 Laravel 应用中，在进程内读取该应用的持久状态。
- **自托管服务模式**：运行已发布的 `durableworkflow/waterline` 镜像，通过 PHP SDK 和公开 Server API 读取[独立 Server](./polyglot/server.md) 拥有的状态。Server 发行版不捆绑或运维 Waterline。
- **Cloud Managed Waterline**：[Durable Workflow Cloud](./polyglot/cloud-control-plane.md) 包含的命名空间级运维体验。Cloud 负责运维 Managed Waterline 及其背后的命名空间运行时。

嵌入和自托管服务形式公开相同的核心 Waterline UI 和 `/waterline/api/...` 操作路由族。Cloud 通过托管界面提供操作能力，无需客户部署 Waterline 路由主机。任何形式都不会合并运行时状态：每个视图仅限于其运行时和命名空间拥有的运行实例。对于自托管 Server 运维，无论是否部署 Waterline，都可使用原生 API、CLI 和 SDK 操作接口。原生路由参见 [Server API 参考](./polyglot/server-api-reference.md)，Waterline 路由和响应契约参见 [Waterline 操作 API 参考](./waterline-operator-api.md)。

Durable Workflow 有两个可观测性平面：

| 平面 | 事实来源 | 典型问题 |
| --- | --- | --- |
| 持久状态 | 所属运行时的工作流数据库和 API、Waterline 投影及历史导出 | 工作流是否已启动？哪个运行实例是当前实例？哪些信号、更新、定时器、活动、重试或失败已经提交？现在执行哪种操作是安全的？ |
| Worker/运行时遥测 | 队列 Worker 日志、SDK 指标记录器、Prometheus/OpenMetrics 端点及应用追踪 | Worker 是否在轮询？任务耗时多久？是否配置了导出器？自定义应用指标是否已从 Worker 进程导出？ |

Waterline 刻意不替代 Worker 指标。如果自定义指标在活动或 Worker 代码中记录，应抓取 Worker 的遥测端点。用 Waterline 将该运行时信号与持久工作流历史及当前运行状态关联起来。

Worker 和客户端的配置也独立于运维界面。将应用客户端和 Worker 连接到拥有命名空间的运行时时，应结合语言指南阅读生成的 [PHP SDK API 参考](https://php.durable-workflow.com/api/)、[Python SDK API 参考](https://python.durable-workflow.com/)或 [Rust SDK API 参考](https://rust.durable-workflow.com/)。

如果 Worker 遥测显示重复领取、延迟完成的竞争或卡住的租约，请结合本指南阅读[执行保证与幂等性](./constraints/execution-guarantees.md)。该契约区分至少一次传输的不确定性和重复的持久结果，避免对看似重复的证据作出错误运维判断。

### 仪表板视图 {#dashboard-view}

![Waterline 仪表板](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

仪表板展示运行总量、近期运行计数及整个 Worker 集群的指标，让你快速判断工作是在流动、停滞还是失败。

需要这些事实对应的发布和运维手册契约时，请阅读[操作运行边界](./operator-operating-envelope.md)：哪些诊断会阻止流量、哪些仅供提醒，队列健康事实如何分布在 Waterline 和 Worker 遥测之间，以及如何验证重建、导出和归档路径。

### 工作流视图 {#workflow-view}

![Waterline 工作流详情](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

工作流详情视图显示单个运行实例的持久时间线：依次发生的活动、信号、定时器和子工作流，以及每项的输入、输出和时间信息。

## Waterline 部署与访问 {#waterline-deployment-and-access}

### 嵌入式 Laravel {#embedded-laravel}

将 Waterline 和工作流软件包一起安装到 Laravel 应用中，并运行迁移。完整安装和配置指南参见 [durable-workflow/waterline](https://github.com/durable-workflow/waterline)。

嵌入模式使用宿主应用的数据库连接、路由中间件、身份验证 gate 和工作流软件包。应将 Laravel 应用、队列 Worker、调度器、迁移和 Waterline 资源继续作为同一个部署边界运维。[Waterline 操作 API 参考](./waterline-operator-api.md#installation)包含当前 Composer 命令和资源发布步骤。

### Waterline 服务 {#waterline-service}

已发布镜像内含自己的 PHP 和 Laravel 运行时。容器宿主无需安装 PHP、Composer 或工作流软件包，Waterline 也从不连接独立 Server 的数据库。

以下示例将 Waterline 绑定到宿主回环地址的 `8080` 端口，将其自身 UI 状态持久化到命名卷，并连接一个 Server 命名空间：

```bash
export WATERLINE_SERVER_ENDPOINT=https://workflow.example.com
export WATERLINE_SERVER_TOKEN=replace-with-a-server-token

docker run --detach \
  --name waterline \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:8080 \
  --volume waterline-data:/data \
  --env WATERLINE_SERVER_ENDPOINT \
  --env WATERLINE_SERVER_TOKEN \
  --env WATERLINE_NAMESPACE=orders \
  --env WATERLINE_ACCESS_MODE=read_only \
  --env WATERLINE_ALLOW_UNAUTHENTICATED=true \
  --env APP_URL=https://waterline.example.com \
  durableworkflow/waterline:%%artifact.waterlineVersion%%
```

通过 `APP_URL` 所表示的 URL 打开 `/waterline`。镜像监听容器内的 `8080` 端口；仅在有意修改内部端口时设置 `PORT`。`WATERLINE_PATH` 用于修改默认的 `waterline` URL 前缀。仓库还发布了采用相同连接边界的 [Docker Compose 服务定义](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml)。

服务模式有两个独立的身份验证层：

1. `WATERLINE_SERVER_TOKEN` 是 Waterline 通过 PHP SDK 调用 `WATERLINE_SERVER_ENDPOINT` 时使用的 bearer 凭据。观察工作流、Worker、队列和计划任务需要 Server operator 角色；Server 健康和操作指标可能需要 admin 角色。
2. 浏览器和 Waterline API 访问是部署的入口边界。独立镜像没有宿主 Laravel 用户目录。因此，`WATERLINE_ALLOW_UNAUTHENTICATED=true` 只能用于带身份验证的反向代理之后，或上述回环绑定之类的私有接口上。在外围身份验证边界到位之前，保持为 `false`。

将 `WATERLINE_NAMESPACE` 设置为操作人员要检查的命名空间。Waterline 在每个 SDK 请求中发送它。默认的 `WATERLINE_ACCESS_MODE=read_only` 会阻止 Waterline 中的变更操作；只有 Server 令牌被授权执行所需命令时才使用 `operator`。

`/data` 卷保存 Waterline 自有的已保存视图、显示偏好和 Laravel 运行时状态。默认配置下，它包含位于 `/data/waterline.sqlite` 的文件型 SQLite 数据库，绝不包含 Server 的工作流历史。如果 Waterline 自身状态必须存入 MySQL 或 PostgreSQL，使用 `DATABASE_URL` 或常规 `DB_*` 设置。

#### 健康与指标 {#health-and-metrics}

不同问题使用不同探针：

| 接口 | 能证明什么 |
| --- | --- |
| `GET /up` | Waterline HTTP 进程已启动并能响应请求。镜像的 Docker 健康检查使用此路由。 |
| `GET /waterline/api/v2/health` | Waterline 能通过 PHP SDK 组合命名空间级 Server 健康、Worker 注册和任务队列证据。 |
| `GET /waterline/api/stats` | Waterline 使用的仪表板总量和基于 Server 的操作摘要。 |
| Server 上的 `GET /api/system/health` 和 `GET /api/system/operator-metrics` | 独立于 Waterline 的 Server 原生健康与操作契约。 |

应将 `/waterline/api/stats` 视为操作 JSON，而非 Prometheus 抓取端点。Worker SDK 指标、日志、追踪和自定义应用遥测仍来自 Worker 进程。如果 `/up` 健康而 Waterline 健康或 stats 响应不可用，应排查 Server 连接、授权、命名空间或 SDK 能力边界，而不是认定 Waterline 进程失败。

#### 工作流可见性与操作 {#workflow-visibility-and-operator-actions}

服务模式下，列表视图、所选运行详情、历史导出、计划任务、Worker 状态、任务队列证据、信号、更新、查询、修复、取消、终止和归档都通过 PHP SDK 从配置的独立 Server 投影而来。Waterline 路由结构仍以 [Waterline 操作 API 参考](./waterline-operator-api.md)为准；底层 Server 契约仍以 [Server API 参考](./polyglot/server-api-reference.md)为准。

Waterline 只显示配置的命名空间和所连接 Server 拥有的运行实例。嵌入运行实例仍通过对应的嵌入式 Waterline 部署查看，Server 管理的运行实例则通过服务部署或 Server 原生接口查看。切换 Waterline 后端不会迁移或合并运行实例。

#### 故障排查边界 {#troubleshooting-boundaries}

| 症状 | 应检查的边界 |
| --- | --- |
| 容器尚未提供 `/up` 就退出 | 检查必需的 `WATERLINE_SERVER_ENDPOINT`、`/data` 可写性、`PORT` 有效性、数据库设置和有限范围的启动迁移日志。 |
| 基于 Server 的视图返回 `401` 或 `403` | 检查 `WATERLINE_SERVER_TOKEN` 及其 Server 角色。Waterline 入口拒绝是独立的代理或 `WATERLINE_ALLOW_UNAUTHENTICATED` 问题。 |
| 变更路由返回 `waterline_read_only` | 保持部署只读，或明确设置 `WATERLINE_ACCESS_MODE=operator`；Server 令牌仍必须授权该命令。 |
| 预期的工作流未出现 | 确认 `WATERLINE_NAMESPACE`、Server 端点，以及哪个运行时接受了工作流启动。Waterline 不会搜索其他命名空间或嵌入式运行时。 |
| `/up` 通过，但健康、stats 或视图报告能力不可用 | 先通过 Server API 或 CLI 直接验证端点，再检查令牌角色，以及已发布 Waterline/PHP SDK 组合是否提供所需方法。 |
| 服务目录路由报告 `backend_capability_unavailable` | 服务模式不镜像 Waterline 的嵌入式跨命名空间服务目录。请通过所连接 Server 的原生服务端点和 API 使用此能力。 |
| Waterline 中缺少自定义指标 | 检查 Worker 的指标导出器。Waterline 报告持久操作事实，不报告任意进程指标。 |

### Cloud Managed Waterline {#cloud-managed-waterline}

Cloud 客户从命名空间级托管操作界面打开 Cloud Managed Waterline。他们无需部署或配置 Waterline、Server、PHP 或内部端点，也无需维护第二套 Waterline 登录。上述自托管镜像、`WATERLINE_*` 设置、Server 令牌、数据库和入口身份验证说明不适用于此路径。

客户的 Cloud 身份验证确立操作人员身份。Cloud 组织、项目、环境和命名空间范围的授权决定该身份可打开哪个托管 Waterline 范围。在此边界内，操作人员可使用工作流列表和搜索、运行详情和持久历史、命名空间健康，以及其角色支持的操作。托管界面始终限于所选命名空间，不会合并其他环境或命名空间的数据。

变更操作受角色限制。Cloud 在审计数据中将每项受支持的操作变更归属到已验证的 Cloud 操作者，同时产生的持久工作流转换仍在工作流历史中可见。例如，成功归档会在 Cloud 审计数据中记录操作者，并记录持久的 `WorkflowArchived` 历史事件。操作人员无需私有运行时凭据，也无需了解托管运行时的内部部署就能使用此界面。

## 列表与详情 API {#list-and-detail-api}

Waterline 列表视图（`/waterline/api/flows/{bucket}`）和所选运行详情端点（`/waterline/api/flows/{id}`）返回类型化 JSON 契约，可直接供自己的仪表板或脚本使用。[Waterline 操作 API 参考](./waterline-operator-api.md)说明端点列表、所选运行字段族、历史导出、可操作性、计划任务、已保存视图、偏好和操作契约。

### 可操作性契约 {#actionability-contract}

Waterline 以带版本的可操作性契约标注列表行、所选运行详情响应和历史导出。使用方应将 `actionability_contract.schema = waterline.actionability` 和 `actionability_contract.version = 1` 视为以下字段的契约标识。

运行级 `actionability` 回答所选运行实例能否修复：

| 字段 | 含义 |
| --- | --- |
| `repair_state` | `repairable`、`blocked`、`not_needed` 或 `unknown` 之一。 |
| `repairable` | `repair_state = repairable` 的布尔简写。 |
| `blocked_reason` | `repair_state = blocked` 时的稳定原因码。 |
| `status_bucket` | 决定运行级判断的 Waterline 状态分组。 |
| `closed_reason` | 运行实例关闭时的持久关闭原因。 |
| `task_problem` | Waterline 是否在运行实例上发现任务级问题。 |
| `diagnostic_only_evidence` | 至少一条子证据行提供信息但不能作为恢复来源时为 true。 |

`activities`、`waits`、`timers`、`exceptions`、`logs` 以及时间线/导出条目中的证据行，也可以包含自己的 `actionability` 块：

| 字段 | 含义 |
| --- | --- |
| `state` | 行是有效修复来源时为 `actionable`，否则为 `diagnostic_only`。 |
| `repair_source` | 仅在行具有可修复的权威来源时为 true。 |
| `diagnostic_only` | 该行不得用作恢复来源时为 true。 |
| `history_authority` | 来源权威，例如 `typed_history`、`mutable_open_fallback`、`failure_row_fallback` 或 `unsupported_terminal_without_history`。 |
| `history_unsupported_reason` | 不受支持的回退历史的稳定原因码。 |

自动化应根据 `actionability.repair_state`、`actionability.repairable` 和行级 `actionability.repair_source` 控制是否提供修复、恢复和重放操作。即使包含有用的失败或回退元数据，`diagnostic_only = true` 的行也绝不是持久恢复来源。`history_authority = unsupported_terminal_without_history` 的行仅是诊断证据；它们解释运行实例为何被阻止，却不能证明存在足够的类型化历史来安全重建进度。

## 通过 Waterline 执行控制平面操作 {#control-plane-actions-from-waterline}

操作人员可直接在详情视图中取消、终止、修复和归档工作流。每项操作都映射到针对相同运行 ID 的 `POST`，返回 `200` 和结果状态，或在操作对当前运行状态无效时返回 `409`。

服务模式下，Waterline 通过 PHP SDK 转发受支持命令。变更操作既需要 `WATERLINE_ACCESS_MODE=operator`，也需要被授权执行该命令的 Server 凭据。未部署 Waterline 时，操作人员始终可以直接使用 Server API 或 CLI。

Cloud Managed Waterline 通过 Cloud 角色和命名空间授权限制每项受支持的变更，并使用已验证的 Cloud 身份记录审计归属。客户无需为托管界面配置 Waterline 到 Server 的凭据。

## 相关指南 {#related-guides}

- [执行保证与幂等性](./constraints/execution-guarantees.md)解释形成操作证据的重放、重试、租约过期和持久结果契约。
- [操作运行边界](./operator-operating-envelope.md)将健康、队列状态、重建、导出、归档和拓扑预期统一为操作契约。
- [失败与恢复](./failures-and-recovery.md)解释仪表板事实背后的重试耗尽、不可重试失败、超时和修复行为。
- [AI 辅助开发](./ai-assisted-development.md)列明智能体在诊断工作流状态时应使用的 Waterline、CLI、MCP 和 LLM 可读契约。
