---
sidebar_position: 13
title: 自托管部署
description: 选择受支持的 Durable Workflow v2 自托管路径及起始产物。
---

# 自托管部署 {#self-hosting-deployments}

Durable Workflow v2 支持多种自托管形态。选择与你运维环境相符的最小路径，然后明确镜像、数据库、缓存、身份验证、就绪和升级契约。

本指南涵盖独立 Server 发行版。如果将 Laravel 软件包嵌入自己的应用中运行，请改用软件包安装和配置页面。Durable Workflow Cloud 是独立的托管服务选择，由 Cloud 运维运行时、持久化、放置和恢复；自托管 Server 绝不会接入 Cloud。参见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)。当前 Cloud 契约是单区域托管运行时和恢复边界，不承诺多区域复制、自动区域故障转移或故障回切。

自托管 Server 发行版不捆绑或运维 Waterline。仅在需要其操作 UI 时单独部署 Waterline，并按照 [Waterline 部署与监控指南](/docs/monitoring/#waterline-service)连接到 Server 所有的命名空间。Cloud 则为托管命名空间提供 Managed Waterline。

## 部署支持矩阵 {#deployment-support-matrix}

| 路径 | 起始产物 | 支持范围 | 此路径不承诺的内容 | 何时需要商业支持 |
| --- | --- | --- | --- | --- |
| 本地开发和内部非生产环境 | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)，配合 `%%artifact.serverTagEnv%%` 或 `%%artifact.serverImageEnv%%` | 单台开发机器、局域网演示、共享预发布环境、SDK 和 Worker 集成测试 | 面向互联网的生产环境、持久备份保证、严格密钥轮换、多节点故障转移 | 希望协助将能运行的开发栈转为生产运维手册 |
| 单节点生产 | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)，配合生产 env 文件、MySQL 和 Redis 卷、按角色限定权限的令牌、备份、反向代理 TLS，以及固定镜像标签或摘要 | 一台 VM、VPS 或内部 Docker 主机，具有持久工作流状态和简单运维模型 | 主机级高可用、自动数据库故障转移、多区域恢复、重大拓扑变化零停机 | 部署承载生产流量，希望审查备份、恢复、身份验证、TLS、升级或回滚流程 |
| 小型集群部署 | 已发布 `durableworkflow/server` 或 `ghcr.io/durable-workflow/server` 镜像，以 [Compose 配方](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)作为容器/进程模板，包含 2 至 3 个 API 节点、共享外部 MySQL/PostgreSQL、共享 Redis、独立扩缩 Worker，以及恰好一个调度器/维护运行器 | 单节点不够时提供横向 API 和 Worker 容量；满足[滚动升级契约](/docs/rolling-upgrades)全部保证时进行滚动升级 | SQLite 集群、无 Redis 多节点模式、以重复调度器作为稳态拓扑、双活多写数据库、自托管无人值守区域故障转移、宽泛的“五个九”或“零停机”SLA 承诺，以及在[发布证据门槛](#release-evidence-status)通过前自助单区域高可用故障转移 | 需要跨多主机容量、故障域、发布或恢复规划，或打算宣称受门槛限制的单区域高可用行为 |
| Kubernetes Helm chart | 来自 `oci://ghcr.io/durable-workflow/charts/durable-workflow` 的 [Server 所属 Helm chart](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow)，配合外部数据库、Redis、ingress 和密钥管理 | 对 chart 的 Server、Worker、单实例调度器、bootstrap、Service、探针和策略资源提供可重复的生产安装及升级路径 | 捆绑持久化、提供商托管基础设施、双活多区域、自定义 operator，以及在[发布证据门槛](#release-evidence-status)通过前自助单区域高可用故障转移 | 需要提供商特定架构、容量、恢复，或超出 chart 已发布 values 契约的变更 |
| 原始 Kubernetes 清单 | Server 仓库 [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) 清单，使用已发布 Server 镜像及已有数据库、Redis、ingress 和密钥管理 | 已运维 Kubernetes，希望使用可检查的 API、Worker、调度器、bootstrap、Service、探针、配置和密钥清单的团队 | 独立 Helm 生命周期、托管 Kubernetes 提供商验证、双活多区域、自定义 operator、环境特定存储/网络/安全决策，以及在[发布证据门槛](#release-evidence-status)通过前自助单区域高可用故障转移 | 需要覆盖配置、托管集群验证、提供商特定生产规划，或打算宣称受门槛限制的单区域高可用行为 |
| 主备多区域评估 | 每区域一个已验证单节点或小型集群部署，加主区域到备用区域的异步数据库复制，以及已审查的故障转移/回切手册 | 支持团队指导下的区域灾难恢复架构评估和环境特定演练 | 已验证的自助 2.0 契约、双活多区域、自动或无人值守区域故障转移、同步跨区域复制（RPO=0）、跨区域活动可见性或联合搜索，或引擎强制的区域固定任务队列路由轴 | 在生产中依赖跨区域复制、故障转移、回切、RPO 或 RTO 之前 |
| 支持团队指导的拓扑 | 针对你的环境审查过的设计 | 自托管主备或双活多区域、无人值守区域故障转移、RPO=0 跨写入方复制、以重复调度器运行器作为稳态拓扑、定制安全/网络、私有 SLO、自定义覆盖配置、迁移规划 | 自助复制粘贴式运维 | 拓扑本身属于产品风险的一部分 |

公开发行版重点优化本地开发、单节点生产和小型集群部署。Kubernetes 清单面向已运维 Kubernetes 的团队。主备多区域材料是支持团队指导的评估指南（参见下方[主备多区域](#activepassive-multi-region)），不是已验证的自助 2.0 契约。
单区域高可用故障转移，即区域内的托管数据库故障转移、托管 Redis 故障转移、API 节点丢失、Worker 丢失和调度器运行器重启，在确切发布证据门槛未开放时仍需支持团队指导（参见下方[单区域高可用与故障转移](#single-region-high-availability-and-failover)）。对自托管 Server，双活多区域、自动区域故障转移、以重复调度器运行器作为稳态拓扑，以及提供商特定托管 Kubernetes 验证仍需支持团队指导，因为它们依赖你的数据库、缓存、网络、安全、运行器和升级选择。已发布 Helm chart 是这些相同操作人员负责边界内的自助打包路径。Cloud 当前提供单区域托管运维和恢复，不提供多区域复制或区域故障转移，参见 [Cloud 托管运行时](/docs/polyglot/cloud-control-plane)。商业支持模型参见[支持边界](/docs/support)。

## 生产恢复交付物 {#production-recovery-deliverables}

称某个拓扑“生产就绪”，意味着发布该拓扑的恢复资料包，而不只是启动容器。将最新证据与部署命令保存在同一本运维手册中：

| 路径 | 最低限度的已发布恢复资料包 |
| --- | --- |
| 单节点生产 | 备份计划、固定镜像或摘要、env/配置快照位置、最大可接受恢复滞后，以及最近成功恢复演练时间戳和验证证据。 |
| 小型集群部署 | 单节点资料包，加丢失一个 API 节点、一个 Worker 节点、调度器/维护运行器、Redis 或共享数据库的预期影响；恢复后的 Worker 重新注册步骤；当前发布记录的滚动升级或整体停机策略。 |
| Kubernetes Helm chart | 集群资料包，加 chart 版本、values 修订、镜像摘要、集群特定 ingress 和密钥负责方，以及最近 chart 升级/回滚演练。 |
| 原始 Kubernetes 清单 | 集群资料包，加宣布流量重新健康前必须恢复或重新应用的集群特定存储、密钥、ingress 和发布负责方。 |
| 单区域高可用评估（发布证据门槛关闭时由支持团队指导） | 集群或原始清单资料包，加托管数据库故障转移、托管 Redis 故障转移、API 节点丢失、Worker 丢失和调度器运行器重启的演练证据；每项都在[单区域高可用契约](#single-region-high-availability-and-failover)发布的恢复目标内完成，且无已确认写入丢失。 |
| 主备多区域评估（支持团队指导） | 每区域资料包，加数据库复制和隔离设计、测得复制滞后、操作人员负责的 RPO/RTO、提升和回切手册，以及环境特定演练证据。 |

如果无法随时提供该资料包，在恢复契约成文并完成演练前应将环境视为预发布。[操作运行边界](/docs/operator-operating-envelope)定义这些资料包必须遵循的恢复顺序、验证过程和演练频率。

## 安全、数据与审计状况 {#security-data-and-audit-posture}

自托管 Durable Workflow 部署的大多数安全控制继承自你运维的环境。将以下事实与镜像标签、迁移计划和恢复证据放在同一发布或运维资料包中：

| 方面 | 如实的发布说明 |
| --- | --- |
| 数据处理 | 工作流参数、结果、历史、memo、搜索属性、可见性标签、命令上下文、审计行、异常消息和操作人员备注都可能包含客户应用数据。[工作流 ID](./defining-workflows/workflow-id.md#ids-are-visible-metadata)、搜索属性和标签是操作人员可见的元数据，不是密钥存储。工作流 ID 保持明文，不受负载编解码器保护。 |
| 加密 | 每个生产 HTTP 接口均使用 TLS。静态加密来自数据库、对象存储、文件系统、队列、缓存和密钥管理器。工作流软件包与 Server 不自动加密每个负载字段。 |
| 合规 | 开源软件包和自托管 Server 提供控制措施及审计证据，本身不构成合规认证。除非托管产品另有说明，SOC 2、HIPAA、PCI、ISO 或 FedRAMP 等声明属于你自己的合规计划。 |
| 审计日志 | 工作流命令、计划审计事件、历史导出元数据和服务调用记录提供持久操作证据。除非自行添加相应组件，否则它们不是完整 SIEM、DLP 系统、不可变外部账本或法律保全系统。 |
| 支持 | 本页记录按角色限定权限的凭据、TLS 终止、备份、恢复演练和范围明确的自助拓扑。除非公开文档另有说明，高级身份、mTLS 发布、私有网络、自定义策略引擎、提供商合规和定制拓扑审查均需支持团队指导。 |

必须明确网络状况：

- **Webhook 入口：** 记录公开端点、身份验证方式、重放或幂等策略、超时、负载限制、受信代理头配置和密钥轮换计划。
- **Worker 到后端流量：** 使用 TLS 验证、按角色限定权限的 Worker 凭据和命名空间头；Worker 跨越不可信网络时使用私有网络或 mTLS；轮换不得将操作权限授予 Worker 令牌。
- **操作接口：** 将 Waterline、独立 Server 操作 API、CLI 自动化端点和自定义管理面板置于已验证会话或按角色限定权限的服务凭据之后，为浏览器会话提供 CSRF 保护，并记录代理/TLS 边界。

## 已发布镜像 {#published-images}

自托管 Server 部署使用已发布镜像：

- Docker Hub：`%%artifact.serverDockerHubImage%%`
- GitHub Container Registry：`%%artifact.serverGhcrImage%%`
- 摘要固定：`durableworkflow/server@sha256:...` 或 `ghcr.io/durable-workflow/server@sha256:...`

可变标签仅用于本地实验。生产 env 文件应固定具体版本标签或摘要，让升级和回滚步骤可审计。

## 本地开发和内部非生产环境 {#local-development-and-internal-non-production}

需要无需源码、由 MySQL 和 Redis 支撑的栈时，使用已发布镜像 Compose 配方：

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

验证 API、就绪状态、集群发现和 Worker 注册：

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

此路径适用于开发和内部预发布，但不是生产安全边界：示例使用一个兼容令牌、默认服务密码、本地命名卷，且没有 TLS。

## 单节点生产 {#single-node-production}

使用同一个 Compose 产物，将生产配置保存在版本控制之外：

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

使用该 env 文件启动：

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

按生产服务运维主机：

- 在 API 容器前的反向代理中配置 TLS、公开路由、请求日志和 IP 允许列表。
- 不要公开暴露 MySQL 或 Redis。
- Worker 使用 `DW_WORKER_TOKEN`，应用和操作流量使用 `DW_OPERATOR_TOKEN`，命名空间与管理工作使用 `DW_ADMIN_TOKEN`。
- 每次镜像升级前备份 MySQL 卷，并定期备份。正常重启时应保留 Redis，但 MySQL 始终是持久工作流历史的事实来源。
- 将确切 env 文件、镜像标签或摘要和数据库备份保存在一起，用于恢复。

升级顺序：

1. 备份 MySQL，记录当前镜像引用。
2. 仅修改 `DW_SERVER_IMAGE` 或 `DW_SERVER_TAG`。
3. 拉取新镜像。
4. 运行 `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait`。
5. 切换外部流量前，确认 `/api/ready`、`/api/cluster/info` 和 Worker 注册。

Server README 的[官方镜像 + Compose](https://github.com/durable-workflow/server#official-image--compose)部分维护最新命令级 Compose 示例。

## 小型集群部署 {#small-clustered-deployments}

小型集群是单节点模型的适度扩展。已验证自助契约刻意保持狭窄：

- 在负载均衡器后运行 2 至 3 个无状态 API 容器。健康、就绪、集群发现、Worker 注册、工作流任务轮询和完成均必须无需粘性会话即可工作。
- 使用一个共享外部 MySQL 或 PostgreSQL 数据库存储持久历史。SQLite 仅限单节点，不是集群持久化后端。
- 使用共享 Redis 承载缓存、长轮询唤醒信号、查询任务队列锁、任务队列准入锁和队列状态。无 Redis 多节点模式不是受支持集群契约。
- 发布期间检查每个 API 节点的 `GET /api/cluster/info`。`topology.current_shape` 应保持 `standalone_server`，`topology.current_roles` 应包含 `api_ingress`、`control_plane`、`matching` 和 `history_projection`，独立 Server 节点的 `topology.execution_mode` 应保持 `remote_worker_protocol`。用 `topology.matching_role` 确认实际部署的匹配路径：默认节点报告 `queue_wake_enabled: true`、`shape: "in_worker"` 和 `wake_owner: "worker_loop"`；专用匹配发布将设置 `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` 的节点改为 `queue_wake_enabled: false`、`shape: "dedicated"` 和 `wake_owner: "dedicated_repair_pass"`。同一块还应继续声明预期的 `task_dispatch_mode`、`partition_primitives` 中冻结的路由轴和当前 `backpressure_model`。拓扑清单的逐字段含义参见 [Server 角色拓扑](/docs/polyglot/server-role-topology)。
- 独立于 API 节点扩缩外部 SDK Worker。Worker 可运行在单独主机或进程上，但应连接负载均衡 API 端点，而非固定到一个节点。
- 对保护租户、外部 API、数据库池或其他共享下游依赖的队列，配置[任务队列准入](/docs/polyglot/task-queue-admission)。
- 恰好运行一个调度器或维护进程，负责计划评估、活动超时执行和历史清理。
- 每次发布运行一次 bootstrap/迁移，然后才让新 API 和 Worker 容器接收流量。
- 为当前发布选择方式：整体停机（排空 Worker、停止调度器/维护、替换 API 节点、运行 bootstrap/迁移，再重启 Worker 和调度器），或在全部保证成立时使用[滚动升级](/docs/rolling-upgrades)。
- 将数据库和 Redis 视为主要故障域。Server 容器可替换，持久化和协调层不可随意替换。

已发布自助配方从 `standalone_server` 形态开始，虽然集群发现也将 `split_control_execution` 列为受支持产品拓扑。应将它视为角色分配不同的同一契约，而非第二个 Server 产品。以后试点更明确的角色拆分时，仍读取 `/api/cluster/info` 的 `topology.current_shape`、`topology.current_roles` 和 `topology.matching_role`，不要从主机名或容器名推断职责。[Server 角色拓扑](/docs/polyglot/server-role-topology)集中解释角色分配和迁移路径。

每个 API 节点应使用相同身份验证令牌或签名密钥、应用版本、工作流软件包版本、负载编解码器配置、数据库连接和 Redis 连接。为每个 API 节点分配唯一 `DW_SERVER_ID`，让集群发现和日志可以区分节点。

不受支持的边界必须明确：SQLite 集群、无 Redis 多节点模式、以重复调度器作为稳态拓扑、双活多写数据库、自托管无人值守区域故障转移，以及宽泛的“五个九”或“零停机”SLA 承诺，需要另行验证或支持团队指导设计后才能依赖。主备多区域指南也属于支持团队指导的评估材料，参见下方[主备多区域](#activepassive-multi-region)。单区域高可用故障转移，即区域内的托管数据库故障转移、托管 Redis 故障转移、API 节点丢失、Worker 丢失和调度器运行器重启，在发布证据门槛通过前属于支持团队指导的评估契约；下方[单区域高可用与故障转移](#single-region-high-availability-and-failover)说明引擎恢复目标、故障转移时的就绪规则和开放门槛所需证据。

团队已明确 VM、网络、数据库、缓存、备份和负载均衡模型时，此路径可自助执行。需要协助确定这些边界、容量、发布顺序或恢复流程时，则由支持团队指导。

## Kubernetes Helm chart {#helm-chart-for-kubernetes}

Server 仓库负责 [chart 源码和发布指南](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow)。从 OCI 镜像仓库安装已发布 chart：

```bash
helm install durable-workflow \
  oci://ghcr.io/durable-workflow/charts/durable-workflow \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Values 文件必须指向外部 MySQL/PostgreSQL 和外部 Redis，通过现有 Kubernetes Secret 提供生产凭据，并针对环境配置 ingress/TLS。Chart 不创建持久化或提供商托管基础设施。为使生产部署可复现，添加 `--version <validated-chart-version>`，并按摘要固定 Server 镜像。Server 仓库发布 chart 版本，并在 chart 源码旁记录升级方法。

## Kubernetes 清单 {#kubernetes-manifests}

Server 仓库在 [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) 下提供面向已运维 Kubernetes 团队的原始清单：

- Namespace 和共享标签
- ConfigMap 与 Secret 分离
- Bootstrap/迁移 Job
- API Deployment 和 Service
- Worker Deployment
- 调度器 CronJob
- PodDisruptionBudget
- `/api/health` 存活探针和 `/api/ready` 就绪探针
- 保守的资源请求和限制

应用清单前，将镜像标签替换为具体已发布版本或摘要，提供真实数据库和 Redis 凭据，并将 ConfigMap 值连接到集群已运维的服务。清单刻意保持原始且可检查；它们不是 Helm chart，也不承诺通用托管 Kubernetes 行为。

Kubernetes 生产发布至少验证：

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

发布证据门槛关闭时，单区域高可用故障转移在原始清单路径上与小型集群路径一样，仍由支持团队指导。预期契约要求遵循下方[单区域高可用与故障转移](#single-region-high-availability-and-failover)中的就绪、单实例调度器和共享基础层规则。提供商特定负载均衡器、存储类、网络策略、双活多区域和自托管无人值守区域故障转移，仍由支持团队指导或在原始清单契约之外单独跟踪。需要 Helm 管理安装与升级时，使用上方独立版本化的 Helm 路径。

## 单区域高可用与故障转移 {#single-region-high-availability-and-failover}

单区域高可用故障转移当前是在小型集群和原始 Kubernetes 形态之上叠加的**尚未验证、由支持团队指导**的候选契约。它面向引擎设计上能在**单一区域内**承受的故障模式：托管数据库故障转移（RDS Multi-AZ、Aurora 集群故障转移、Cloud SQL HA、Patroni 提升等）、托管 Redis 故障转移（Sentinel、Elasticache 复制组故障转移、Memorystore HA 等）、API 节点丢失、Worker 丢失，以及调度器/维护运行器重启。跨区域主备恢复是另一种由支持团队指导的评估，参见下方[主备多区域](#activepassive-multi-region)。

预期契约包含引擎行为、就绪规则、各事件恢复目标、防脑裂规则和演练验收测试，位于 Workflow 库的 [`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md) 和独立 Server 的 [`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md)。本节是这些文档的公开说明。

### 发布证据状态 {#release-evidence-status}

当前文档所述公开 Server 发布尚无链接的通过确切发布验证结果。记录的已发布镜像尝试在 `topology_start` 阶段等待 API 就绪时停止，尚不能建立任何故障矩阵或恢复边界声明。不要把运行器存在、场景清单或某个部署的演练，当作已发布镜像通过完整矩阵的证据。因此单区域高可用仍由支持团队指导。

只有无需源码的运行对镜像、运行器和 Compose 拓扑使用文档中的同一确切 Server 发布，并发布满足以下条件的 `single-region-failover-result.json` 后，才允许使用自助表述：`outcome: "pass"`、`runner_blocked: false`、`phase_outcomes` 每项均为 `status: "pass"`、每个恢复边界判定通过，以及公开[单区域故障转移场景清单](/platform-conformance/single-region-failover-scenarios.json)中每个必需场景均有证据。该公开通过结果必须从本状态节链接，并指定与 `%%artifact.serverDockerHubImage%%` 相同的 Server 镜像。在所有条件满足前，下述恢复边界是评估目标，而非已发布镜像验证声明。

### 候选拓扑 {#candidate-topology}

部署符合小型集群或原始清单形态，且操作人员保持三条规则时，预期高可用契约适用：

- **始终只有一个可写工作流数据库端点。** 允许托管故障转移（RDS Multi-AZ、Aurora 集群故障转移、Cloud SQL HA、Patroni 等），前提是原主节点重新接入前先隔离它：撤销写入用户、用 `read_only=on` 降级、断开复制，或从已知正常快照恢复。API/调度器容器和数据库之间可使用连接代理（RDS Proxy、ProxySQL、PgBouncer）；引擎契约针对它看到的连接，因此代理不改变任何保证。
- **每次只有一个 Redis 端点，并记录提升路径。** 允许托管 Redis 故障转移（Sentinel、Elasticache 复制组故障转移、Memorystore HA 等）。Redis 是加速层，不是正确性基础，因此 Redis 故障转移是延迟事件，绝非正确性事件。
- **始终只有一个调度器/维护运行器。** 编排器（`deploy.replicas: 1` 的 Compose 服务、受主机级租约保护的 systemd unit，或 `replicas: 1` 且 `RollingUpdate.maxSurge: 0` 的 Kubernetes `Deployment`）负责在重启时保持单实例不变量。重复调度器运行器作为稳态拓扑不在此契约内。

### 各事件行为与恢复目标 {#per-event-behavior-and-recovery-targets}

预期引擎契约为每类事件定义有界恢复目标。发布证据门槛关闭时，它们不是已发布镜像保证。操作人员观察到的实际恢复时间，是引擎目标加托管服务自身的提升延迟。

| 事件 | 候选引擎行为 | 恢复目标（基础层/运行器恢复后） |
| --- | --- | --- |
| 托管数据库故障转移 | 写入返回错误，不会悄悄缓冲。读取返回错误。全部 API 节点和调度器的 `/api/ready` 失败。不丢失已确认工作。 | 一次连接池重连，加一个 `task_repair` 周期（默认 3 秒），再加进行中轮询者的一次长轮询超时（默认 30 秒，最大 60 秒）。 |
| 托管 Redis 故障转移 | 唤醒信号丢失 → 发现回退到长轮询超时。加速层健康检查进入 **warning**，不是 error。`/api/ready` 通常保持正常。 | Redis 客户端重连间隔。 |
| API 节点丢失（N 个中的 1 个） | 负载均衡器在其就绪检查间隔内移除故障节点。发往该节点的进行中请求在 LB 失败，由客户端重试。 | 负载均衡器就绪检查间隔（操作人员控制，通常 5–10 秒）。 |
| Worker 丢失 | 故障 Worker 持有的任务暂停到租约过期。其他 Worker 继续领取自己的任务。 | 租约过期（活动任务为 5 分钟），加一个 `task_repair` 周期。 |
| 调度器/维护重启 | 计划触发、活动超时执行和历史清理暂停。重启后下一个 tick 全部恢复。由于运行器是单实例，不会重复触发。 | 编排器重启延迟，加一个调度器 tick。 |

### 负载均衡器、就绪和流量切换规则 {#load-balancer-readiness-and-traffic-shift-rules}

API 节点前的负载均衡器是故障转移期间流量准入的唯一决策点：

- 将负载均衡器连接到 **`GET /api/ready`**，不要仅用 `/api/health`。`/api/health` 仅证明进程能提供 HTTP 服务；`/api/ready` 证明 Server 能使用持久数据库，并报告 Redis 唤醒加速是健康还是降级。数据库中断时，每个节点的 `/api/ready` 都会正确失败；负载均衡器**必须**容忍全部不可用状态，不能回退到过期的“上次已知正常”节点列表。
- 使用 5–10 秒检查间隔，以及连续失败 2–3 次的移除阈值。
- 不要求粘性会话；小型集群冒烟测试证明外部 Worker 能在 `server-a` 轮询并在 `server-b` 完成。
- 仅 Redis 故障转移期间，只要基于数据库的持久路径可用，每个节点仍保持就绪。加速层降级表现为 `checks.cache.status=warning` 和 `checks.cache.degraded_capability=long_poll_wake_acceleration`；不要配置负载均衡器因该警告移除节点。

基础层恢复后，建议按以下顺序验证：等待至少一个节点的 `/api/ready` 返回 200，通过负载均衡器使用 admin 令牌 curl `/api/cluster/info` 确认拓扑清单，通过负载均衡端点为探测 Worker 发出 `POST /api/worker/register`，在编排器中确认恰好一个调度器运行器存活，然后恢复外部流量。

### 运行确切产物演练 {#run-the-exact-artifact-rehearsal}

Server 发布包含可复用的基线演练，目标是不从检出源码构建产品代码也能执行完整故障矩阵。运行器和 Compose 拓扑必须来自与 Server 镜像相同的发布标签；不要混用持续变化的默认分支检出和任意镜像。在具有 Docker Engine、Docker Compose v2、Python 3.11 或更新版本，以及公开镜像仓库访问权限的干净主机上运行：

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

此路径刻意从同一发布变量派生检出和 `DW_SERVER_IMAGE`。不要单独覆盖镜像；若要选择不同发布，克隆前修改 `DW_SERVER_RELEASE`。运行器要求具体的公开 Server 标签或摘要，拉取每个支撑镜像，将全部运行时镜像解析为仓库摘要，并拒绝 Compose build 节、产品源码绑定挂载、本地或滚动 Server 引用。它在一个 nginx 端点后启动恰好两个 API 节点、一个 MySQL 数据库、一个 Redis 服务和一个调度器/维护运行器。

生成的 `single-region-failover-result.json` 使用 schema `durable-workflow.v2.single-region-failover.result`。它记录确切产物和工具版本、规范化拓扑、就绪转换、测得恢复时间及边界判定、工作流/运行/任务/计划身份，以及跨节点完成、API 节点丢失、数据库中断、Redis 中断、Worker 租约丢失和单实例调度器重启的重复/丢失断言。外部运行器通过 `GET /api/cluster/info` 的 `single_region_failover_contract` 发现调用方法和公开场景清单。

只有通过上方发布证据门槛的结果，才验证已发布镜像对引擎可见中断与恢复的行为。失败、部分完成或 runner-blocked 结果都是诊断证据，不是验证。即使基线通过，也不能把本地 MySQL 或 Redis 容器重启当作云提供商提升机制的证据。宣称托管服务高可用前，应在基线结果旁保留提供商原生提升、隔离、RPO 和耗时证据。

### 恢复资料包补充项 {#recovery-packet-additions}

宣称符合此契约的小型集群或原始清单部署，**必须**依据[操作运行边界](/docs/operator-operating-envelope)扩充恢复资料包，为每类事件提供演练证据：

- 托管数据库故障转移在上述有界恢复时间内完成，无已确认写入丢失；
- 托管 Redis 故障转移不导致负载均衡轮转抖动，不丢失任何已确认工作，并报告 `checks.cache.status=warning`，降级能力为 `long_poll_wake_acceleration`；
- API 节点丢失由负载均衡器在配置的就绪检查间隔内吸收，无已确认写入丢失；
- Worker 丢失时，持久运行实例跨越租约过期被保留，在配置修复边界之后重新领取，并恰好完成一次；
- 调度器运行器在另一主机重启，不触发重复计划，也不让任何计划超过 `next_fire_at` 加一个 tick 仍未评估。

发布证据门槛关闭时，即使部署自身演练通过，每个部署仍需支持团队指导。公开的全阶段通过结果开放发布门槛后，部署也只有将环境特定演练证据记录进操作人员恢复资料包，并按操作运行边界公布的频率刷新，才成为本契约下的自助部署。

### 不受支持高可用声明的边界 {#boundary-against-unsupported-ha-claims}

单区域高可用契约刻意保持狭窄。以下内容仍**不在**其内，继续需要支持团队指导设计；拓扑本身属于产品风险：

- 双活多写数据库拓扑；
- 自托管拓扑的主备多区域及自动或无人值守区域故障转移（[下一节](#activepassive-multi-region)保留评估指南）；
- 同步跨区域数据库复制（RPO=0）；
- 以重复调度器/维护运行器作为稳态拓扑；
- 将引擎强制的区域固定任务队列作为路由轴；
- 超出已发布 chart 打包契约的提供商特定托管 Kubernetes 验证；
- 超出上述有界恢复时间的宽泛“五个九”或“零停机”SLA 承诺。

契约是*在指定事件期间的有界恢复*，不是依赖操作人员数据库、网络和编排器选择的可用性承诺。没有专门验证，自托管部署的营销或 SLA 表述**不得**越过此边界。

## 主备多区域 {#activepassive-multi-region}

主备多区域是**支持团队指导的评估指南**，不是受支持 2.0 运行边界内已验证的自助契约。用本节审查候选架构，并在支持团队协助下构建环境特定演练，再在生产中依赖它。每个区域仍从文档中的单节点、小型集群或原始 Kubernetes 路径开始，但这些单区域契约并不证明跨区域复制、故障转移、回切、RPO、RTO 或脑裂行为。更深入的设计材料，包括数据权威、复制假设、命名空间/任务队列/Worker 行为、故障转移和回切手册、隔离及一致性/延迟权衡，位于 Workflow 库的 [`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md) 和独立 Server 的 [`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md)。

待评估的候选形态：

- 一个**主区域**运行已验证单节点或小型集群契约：负载均衡器后的 API 容器、用作可写持久数据库的共享外部 MySQL 或 PostgreSQL、共享 Redis、恰好一个调度器/维护运行器和外部 Worker。
- 一个**备用区域**保存异步复制的工作流数据库备库、可选备用 Redis，不运行调度器/维护进程，并可预先配置零个或多个 API/Worker 容器，在提升前保持空闲。
- **区域故障转移**是明确的操作人员工作：停止发往故障区域的写流量，根据公布 RPO 确认复制状态，提升备用数据库，在新主库执行发布要求的迁移，在新主区域启动单实例调度器/维护运行器，切换 Worker 端点，切换外部流量，重建派生投影。没有自动跨区域切换。
- 原区域恢复服务后，**故障回切**按相反方向执行同样序列；恢复的原主库在重新作为备库接入前必须隔离（撤销写入用户、以 `read_only=on` 降级、断开复制，或从已知正常快照恢复）。

数据权威和复制假设：

- 工作流数据库是唯一持久事实来源，且受区域约束：任何时刻恰好一个区域写入。备用区域数据库在提升前是只读副本。恢复点目标（RPO）是异步复制滞后；恢复时间目标（RTO）是操作人员执行手册所需时间。
- Redis 是区域本地加速。唤醒信号、查询任务队列锁和准入锁不会跨区域传播，也不应预期其传播。每个区域运行自己的 Redis；备用区域缓存可由操作人员选择冷或热状态，正确性不依赖其跨故障转移保留。
- 可见性由主区域数据库提供。先提升，再读取。

命名空间、任务队列和 Worker 注册行为：

- 命名空间和任务队列存储在工作流数据库中，提升后保持最近复制提交时的状态。引擎不按区域对其分区。
- 新主区域 Worker 在提升后向本地 API 端点注册。故障区域已有注册仍留在数据库中，通过正常 Worker 过期路径失效。
- Build-id 发布和部署生命周期状态存于工作流数据库，因此故障转移后仍保留。

稳态下的一致性与延迟权衡：

- 工作流启动、信号和更新向主区域数据库提交；延迟等于主区域提交延迟，故障转移撤销权威期间会被拒绝。
- 工作流任务和活动任务投递遵循主区域内单区域加速契约：Redis 健康时为亚秒级，否则按持久轮询周期进行。
- 计划由主区域单实例调度器触发，无调度器运行时暂停；提升后从持久计划行恢复触发。
- 可见性读取仅在主区域内保证写后读；引擎不提供跨区域读己之写或 RPO=0。

灾难恢复边界必须明确：候选设计不能替代备份或证据。[操作运行边界](/docs/operator-operating-envelope)所述恢复资料包仍然必需，并应额外补充复制滞后 SLO、提升手册耗时、最近成功故障转移演练日期，以及恢复原主库的隔离流程。

对自托管部署，主备和双活多区域、自动区域故障转移、同步跨区域复制（RPO=0）、跨区域活动可见性，以及引擎强制的区域固定任务队列路由轴仍由[支持团队指导](/docs/support)，因为拓扑本身属于产品风险。当前 [Cloud 托管运行时契约](/docs/polyglot/cloud-control-plane)是单区域契约，不提供这些多区域保证。

## 就绪契约 {#readiness-contract}

同时使用健康和就绪检查：

- `GET /api/health` 证明进程正在提供 HTTP 服务。
- `GET /api/ready` 证明 Server 能使用配置的运行时依赖，包括迁移和默认命名空间就绪状态。
- `GET /api/cluster/info` 证明已验证客户端能发现构建身份、控制平面协议、Worker 协议、负载编解码器和 Server 能力。
- `POST /api/worker/register` 证明 Worker 能通过身份验证进入预期命名空间和任务队列。

不要仅根据 `/api/health` 切换流量。

