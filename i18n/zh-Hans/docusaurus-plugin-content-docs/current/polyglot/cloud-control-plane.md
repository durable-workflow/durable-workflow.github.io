---
sidebar_position: 3
title: Cloud 托管运行时
description: 比较 Cloud 套餐、实测工作流容量、计费和可用性，再将 PHP、Python 或 Rust Worker 连接到托管命名空间。
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - 命名空间运行时 URL
  - 运行时凭据
  - 客户运行的 Worker
  - 私有网络
  - 单区域托管运行时
  - 多区域托管运行时
---

# Cloud 托管运行时 {#cloud-managed-runtime}

Durable Workflow Cloud 是托管编排服务。Cloud 运维托管控制平面及编排运行时，包括工作流状态、历史、计划、任务队列、租约和持久可见性。客户对已配置的 Cloud 命名空间运行 SDK 客户端和 Worker。

这与自托管相互独立。自托管 Durable Workflow Server 独立运行，绝不会接入 Cloud。

## 套餐与价格 {#plans-and-pricing}

按已配置容量付费，不按工作流语义付费。每个命名空间获得隔离的托管运行时；客户的 PHP、Python 和 Rust Worker 在自己的环境中运行。当前可配置的套餐请查看 [Cloud 价格](https://cloud.durable-workflow.com/pricing)及仪表盘。

Cloud Dev 现已可用。四种 HA 套餐仍在资格验证中，尚不能购买或配置。下方价格、容量、可用性和 SLA 条款均为计划条款，不是当前购买要约。

| 套餐 | 运行时容量 | 包含的持久存储 | 可用性 | 价格（美元） |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU，1 GB RAM | 5 GB | 单主机，无 SLA | $0.075/小时，活跃月最低 $2，每月上限 $50 |
| Cloud Standard | 1 vCPU，2 GB RAM | 25 GB | 计划提供单区域 HA，99.99% SLA | $0.45/小时，活跃月最低 $10，每月上限 $300 |
| Cloud Multi-Region | 1 vCPU，2 GB RAM | 25 GB | 计划提供多区域 HA，99.99% SLA | $0.60/小时，活跃月最低 $15，每月上限 $400 |
| Cloud Business | 4 vCPU，8 GB RAM | 100 GB | 计划提供单区域 HA，99.99% SLA | $2.25/小时，活跃月最低 $50，每月上限 $1,500 |
| Cloud Business Multi-Region | 4 vCPU，8 GB RAM | 100 GB | 计划提供多区域 HA，99.99% SLA | $3.00/小时，活跃月最低 $75，每月上限 $2,000 |

容量涵盖托管运行时组件，不包含客户 Worker 计算资源。对于计划中的 HA 套餐，价格包含复制和备用容量；表中不会把副本累加为额外工作流执行容量。每个套餐都包含 Managed Waterline、基本加密备份、升级及稳定运行时 URL。

已配置运行时按运行时间计费，从激活到取消配置，按分钟计量。最低费用和上限适用于 UTC 自然月内的每次运行时购买。已配置但空闲的时间仍计费；当月没有已配置时间则没有运行时费用。新购买有自己的最低费用和上限；服务管理的修复或恢复不会重置它们。Stripe 每月对累计用量开票。价格不含适用税费。

存储固定为套餐包含的配额。没有单独购买的存储附加包、自动扩容或存储超额费用。需要更多空间时，请在达到上限前[申请更大的运行时套餐](https://cloud.durable-workflow.com/contact)。仅从单区域切换到多区域不会增加存储。容量升级要求实际改变运行时，不能只更改账单；目前由支持团队安排。网络用量会被计量，目前不收费，也不是无限量。

选择套餐请查看 [Cloud 价格](https://cloud.durable-workflow.com/pricing)。如果需要更大容量、不同连接方式、SSO、企业支持或自定义可用性要求，请[联系我们](https://cloud.durable-workflow.com/contact)。

## 托管服务边界 {#managed-service-boundary}

客户可见的边界是一个 Cloud 命名空间：

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud 负责命名空间配置、运行时运维、持久化、放置、运行时健康、恢复及该命名空间的 Managed Waterline 界面。客户负责应用代码、工作流和活动实现，以及运行 Worker 的进程。Cloud 客户不部署独立的 Waterline 服务。

命名空间的 HTTPS 端点直接连接其托管运行时。SDK 流量不经过 Cloud 网站/控制平面应用代理。原样使用返回的运行时 URL，不要追加 `/api`；SDK 和 CLI 会构造自己的 API 路径。管理 API 调用仍使用 `https://cloud.durable-workflow.com/api/v1`。

Cloud 管理与运行时流量使用不同凭据：

- Cloud API 密钥（`dwc_...`）管理项目、环境、命名空间、计费及运行时凭据生命周期。
- 客户端运行时凭据（`dwr_...`）在一个托管命名空间中启动和控制工作流。
- Worker 运行时凭据（`dwr_...`）在该命名空间中注册 Worker、长轮询任务、发送心跳并结算工作。

命名空间运行时 URL 不接受 Cloud API 密钥。运行时凭据限定为一个命名空间及角色，仅在创建时返回，后续列表和审计响应不会包含它们。

如果 Cloud 入门使用 CLI，请按 [CLI 指南](./cli.mdx)安装，并用 `dw upgrade` 显式更新已有独立安装。CLI 绝不会在后台更新。安装或升级后，运行 `command -v dw` 和 `dw --version`；在使用 Cloud 凭据前，解决安装器提示的任何 `PATH` 问题，确保当前使用的是所选发布版本的二进制文件。

## 配置并连接命名空间 {#provision-and-connect-a-namespace}

### 1. 创建并配置命名空间 {#1-create-and-provision-the-namespace}

在 [Cloud 仪表盘](https://cloud.durable-workflow.com/)中创建组织、项目、环境及命名空间，然后选择容量套餐。创建账号或命名空间定义不会配置付费容量。通过 Stripe 完成支付设置，再在命名空间页面选择 **Provision**。仅添加银行卡不会开始配置。

配置过程是异步的。Cloud 准备运行时时，命名空间页面会更新进度。等待其变为活动状态后再开始 SDK 工作。该页面还提供运行时凭据创建及 Managed Waterline 访问，用于检查工作流和历史。

通过 API 设置时，先完成支付设置。以下示例使用组织默认套餐；`capacity_plan_version` 可选择其他可用套餐。不要提供自己的 Server URL、部署标识或放置记录：

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

配置完成后，命名空间响应提供稳定的 `runtime_url`、`runtime_namespace`、托管状态及客户可见的区域信息。将返回的 URL 和命名空间值视为 Cloud 管理的配置；不要自行推导端点，也不要替换为自托管 Server 地址。

### 2. 签发独立的客户端和 Worker 凭据 {#2-issue-separate-client-and-worker-credentials}

独立签发两个运行时角色：

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

每个令牌只在创建响应中显示一次。将其存入仅供对应角色使用的密钥存储。明确合并客户端和 Worker 的进程将两个值作为两个独立密钥接收。独立轮换和撤销角色，绝不要用 Cloud API 密钥替代任一运行时凭据。

### 3. 完成第一个 Cloud 工作流 {#cloud-first-workflow}

Sample App 的共享外部运行时试验环境通过 PHP、Python 或 Rust 执行同样的工作流与活动编写流程。打开 [Sample App Codespace](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)，导出已配置的命名空间值和两个运行时凭据，并选择应用任务队列：

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

然后选择第一方 SDK，运行相同的托管运行时契约：

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

运行器解析当前稳定制品版本，仅将每个凭据交给匹配的子进程，最多等待 60 秒，直到 Worker 注册公布精确队列及生成的工作流和活动类型，再启动一次客户端请求。只有 SDK 返回预期结果、`dw` 报告 `completed`，且存在必需的工作流和活动历史才算成功。托管模式下，该命令不会运行本地 Server 或 Waterline。

对每种语言重新运行上方完整托管命令，仅更改 `language`。继续阅读对应指南，了解 SDK 专属编写方式：

- [PHP SDK](/docs/polyglot/php/)：设置 `language=php`。
- [Python SDK](/docs/polyglot/python/)：设置 `language=python`。
- [Rust 托管运行时快速入门](/docs/polyglot/rust-cloud-quickstart/)：设置 `language=rust`，并使用其中的 Worker 就绪、完成结果和不匹配诊断。

合并的客户端与 Worker 流程将两个运行时凭据保存为不同密钥。Cloud 管理密钥不是运行时凭据，不得导出到任一运行时令牌变量。

### 4. 继续托管运维 {#4-continue-with-managed-operation}

SDK 客户端通过命名空间运行时 URL 启动工作流并发送后续命令。客户运行的 Worker 使用 Worker 角色，通过相同 URL 注册和长轮询。Cloud 对每个请求进行认证并限定作用域，在托管运行时执行编排协议，并持久化工作流状态和历史。

客户应用不为某次操作选择运行时部署。工作流 ID、运行 ID、任务队列、兼容性标记及 Avro 负载编码仍是 Cloud 命名空间内的持久应用契约。

## 客户运行的 Worker 连接 {#customer-run-worker-connectivity}

Worker 可以在你的网络、VM 集群、容器平台或应用环境中运行。它们需要通过出站 HTTPS 访问命名空间运行时 URL，并必须允许 Worker 协议的长时间轮询请求。

- 不需要 Cloud 到 Worker 的入站连接。
- 代理和出口网关不得缩短长轮询，导致忙碌重试循环。
- Worker 应对短暂连接失败及服务不可用响应进行有界退避重试。
- 移动 Worker 进程不会移动工作流状态；Cloud 保留命名空间的持久状态和历史。
- 轮换凭据无需更改运行时 URL、命名空间或任务队列。

## 区域放置与恢复边界 {#region-placement-and-recovery-boundary}

Cloud Dev 已可用，其恢复边界如下。HA 边界描述仍待资格验证、尚不可用的计划套餐：

- **Cloud Dev：**一台隔离主机，提供持久状态和备份。维护和恢复可能中断服务。没有可用性 SLA 或自动区域故障转移。
- **计划中的单区域 HA：**同一区域内三台复制主机，提供自动主节点故障转移。可容忍一台主机故障，剩余成员仍保持法定多数。整个区域中断不在此套餐 SLA 覆盖范围内。
- **计划中的多区域 HA：**跨三个区域的三台复制主机，提供自动主节点故障转移。只要剩余成员能形成法定多数，SLA 包含一个已配置区域丢失或隔离的情况。

对于计划中的 HA 配置，稳定运行时 URL 预期跟随选出的主节点；受支持的故障转移期间无需更改 SDK 配置。隔离的旧主节点会被阻止继续提供权威工作。如果无法建立安全主节点，运行时会停止服务，不接受冲突写入。HA 不承诺请求不中断：客户端和 Worker 仍需对短暂失败进行有限重试。

命名空间页面展示拓扑、区域信息及服务状态。备份支持恢复，但不能替代实时复制。短时故障转移测试证明已执行的故障场景，不代表通用恢复时间保证或整月实际可用性。

### SLA 测量与抵扣 {#sla-measurement-and-credits}

四种计划中的 SLA 套餐规定 UTC 自然月内 99.99% 的可用性 SLA，在客户运行时端点以一分钟窗口测量。缺失测量计为不可用，计划维护不予排除。客户托管 Worker 的可用性与托管运行时可用性独立计算。

| 月度可用性 | 自动账户抵扣 |
| --- | ---: |
| 至少 99.99% | 无 |
| 至少 99.9%，低于 99.99% | 10% |
| 至少 99.0%，低于 99.9% | 25% |
| 低于 99.0% | 100% |

SLA 套餐会自动向账户提供服务抵扣，金额不超过该月受影响运行时的实际收费，
中断不会获得现金退款。Cloud Dev 没有 SLA 抵扣。套餐可用性范围和计费条款见
[Cloud 条款](https://cloud.durable-workflow.com/terms)和
[Cloud 价格](https://cloud.durable-workflow.com/pricing)。

## 私有连接与支持边界 {#private-connectivity-and-support-boundary}

2.0 自助 Cloud 契约假定客户端和 Worker 能出站访问公开命名空间运行时 URL。仅私有入口、定制 VPN 或对等连接，以及提供商专有私有路由均属于支持团队主导的连接设计，不是隐藏默认值。绝不会向客户提供内部运行时地址，也不会要求绕过命名空间 URL 路由。

## Cloud 或自托管 Server {#cloud-or-self-hosted-server}

如果希望由 Durable Workflow 运维编排运行时、持久化、所选套餐的可用性、恢复及 Managed Waterline，而团队只运维 SDK 客户端和 Worker，请选择 Cloud。

如果团队需要独立运维 Server 镜像、数据库、缓存、网络、认证、备份和故障转移，请选择[自托管 Server](/docs/polyglot/server)。自托管 Server 不能注册或接入 Cloud 命名空间，也不能作为其后端运行时。嵌入式 Laravel、自托管 Server 和 Cloud 是独立的部署选择。

## 标准工作流基准 {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity) 定义小型可重复工作负载：一次工作流启动、一个外部活动和一次工作流完成，使用规定的 1 KiB Avro 输入和结果。客户 Worker 在托管运行时配额之外运行。

Cloud Dev 于 2026 年 9 月 21 日使用客户配置的同一套餐测量。其他四个基线是历史结果：它们包含各自的复制 HA 拓扑，但早于当前运行时发布。它们不是从 Dev 推算而来，也不能证明当前 SLA 套餐的容量已通过资格验证。

| 套餐 | 标准工作流/秒 | 30 天工作流动作数 | 测量 |
| --- | ---: | ---: | --- |
| Cloud Dev | 0.25 | 1,296,000 | 2026 年 9 月 21 日；详情见下方 |
| Cloud Standard | 0.25 | 1,296,000 | 历史结果；待重新测量 |
| Cloud Multi-Region | 0.10 | 518,400 | 历史结果；待重新测量 |
| Cloud Business | 0.50 | 2,592,000 | 历史结果；待重新测量 |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | 历史结果；待重新测量 |

30 天估算公式为 `workflows/second x 2,592,000 seconds x 2 workflow actions`：本比较将一次启动和一个活动计为两个动作。它假设以该速率连续运行 30 天。它不是套餐动作配额、计费单位，也不精确对应其他引擎的动作定义。

这些是实测工作负载基线，不是所有应用的最大吞吐量或容量保证。更大负载、更多活动、定时器、信号、查询、重放密集的历史、跨区域通信和客户 Worker 延迟都会改变结果。表中不声称包含独立的定时器、信号、重放或饱和基准。应根据实际工作流组合规划，不要将这些数字乘以任意工作流大小。

### Cloud Dev 测量 {#cloud-dev-capacity}

Cloud Dev 是用于开发和评估的隔离单主机托管运行时。本次测量使用普通配置的 Dev 运行时，未更改 CPU、内存、存储、入口或备份设置：

| 资源 | Cloud Dev |
| --- | --- |
| 运行时计算资源 | 1 个共享 vCPU，1 GB RAM |
| 包含的持久存储 | 5 GB |
| 运行时服务 | Server、队列 Worker、调度器、MySQL 和 Redis |
| Managed Waterline | 通过经认证的 Cloud 应用提供；不是 Dev 主机上的进程 |
| 网络路径 | 直接、空间专属的 HTTPS 入口 |
| 客户 Worker | 在客户环境中运行 |
| 可用性 | 无 SLA；允许维护中断 |
| 当前运行时价格 | 参见[套餐与价格](#plans-and-pricing) |
| 更多存储 | 申请更大的运行时套餐；无存储附加包 |

该运行使用公开的 [DW Standard Workflow v1 PHP 定义](https://github.com/durable-workflow/server/blob/68168f34b637a19c054211f4db2df9c616799a86/benchmarks/capacity/v1/bindings/php/capacity_adapter.php)：一次工作流启动、一个外部回显活动及一次完成，每个工作流/活动输入及结果边界都以 Avro 携带一个 1,024 字节字符串。Server 2.3.12 包含 Workflow 2.0.14；外部 Worker 和客户端在 PHP 8.4.25 上使用 PHP SDK 2.0.11。运行时使用 PHP 8.3.33 和 MySQL 8.0.46。

一个 PHP Worker 使用一秒任务轮询超时。经过独立的 30 秒预热后，两个独立客户端槽位每四秒提交一个工作流。固定测量窗口为 **2026 年 9 月 21 日 UTC 18:50:30-18:55:30**。只有这五分钟内观察到的完成计入吞吐量；之后排空不能提高所报告速率。每个结果、完成状态及有序工作流/活动历史都经过检查。

| 实测结果 | 值 |
| --- | ---: |
| 提交与完成速率 | 0.25 个标准工作流/秒 |
| 完成工作流 | 75 / 75 |
| 错误 / 错过的启动槽位 | 0 / 0 |
| 启动到结果延迟，p50 | 2.76 秒 |
| 启动到结果延迟，p95 | 4.18 秒 |
| 启动到结果延迟，p99 | 4.33 秒 |
| 测量群组内未完成工作流 | 0 |
| 30 天工作流动作数 | 1,296,000 |

延迟包含客户端网络及每 100 ms 的结果轮询。它不是内部任务调度延迟，不应与引擎内部调度指标比较。

主机 CPU 平均**忙碌率为 63.5%**，五秒采样中的峰值为 **89%**。**没有容器因 OOM 被终止或重启**。观察到的容器内存峰值分别是 Server 95.21 MiB、MySQL 197.1 MiB、队列 Worker 45.84 MiB、调度器 43.75 MiB、Redis 9.49 MiB、入口连接器 34.59 MiB。这些单项峰值不是同一时刻的整机 RSS；操作系统和其他主机进程也消耗内存。主机使用正常的 1 GiB 交换空间配置，测量期间占用最高约 90 MiB。测量窗口前已验证初始加密备份；窗口内没有备份采集。

这是实测开发基线，不是每个工作流的通用换算、最大吞吐测试、长时间稳定性测试或 SLA。更大负载、额外活动、定时器、信号、查询、重放密集的历史及客户 Worker 延迟都会改变容量。Cloud 按已配置运行时的时间计费，并包含固定存储，不按工作流操作计费。

## 计费用量 API {#billing-usage-api}

Cloud Dev 为每个已配置 Dev 空间使用一个隔离的单主机运行时单元。其计费条款如下：

| 计费条款 | Cloud Dev |
| --- | ---: |
| 已配置运行时 | 每小时 $0.075，按分钟计量 |
| 自然月最高费用 | 每次运行时购买 $50 |
| 活跃月最低费用 | 活跃 UTC 月内，每次运行时购买 $2 |
| 托管容量 | 1 vCPU，1 GB 内存，5 GB 持久存储 |
| 额外持久存储 | 不单独销售；请申请更大的运行时套餐 |
| 基本加密备份 | 已包含 |
| 可用性 | 单主机，无 SLA |

配额涵盖 Cloud 运维的 Server、MySQL、Redis、计划调度、Waterline 访问、备份、升级和基础设施。客户的 PHP、Python 和 Rust Worker 在该配额之外运行。工作流启动、活动尝试、重试、定时器、信号、查询、更新及子工作流属于运维遥测，不是独立计费单位。价格不含适用税费。包含的存储不产生单独费用。

Cloud 提供组织作用域的计费用量，供财务、运维及费用分摊自动化使用。端点通过 Cloud API 密钥认证，不接受请求中的客户或组织 ID；调用方组织从 `dwc_` bearer 令牌解析，防止客户查询其他客户用量。

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` 和 `period_end` 是可选 ISO-8601 日期。省略时，Cloud 返回当前自然月。即使计费限制暂停命名空间配置或工作流操作，计费用量读取和导出仍可用，使财务团队仍能恢复账户正常状态。

响应模式为 `durable_workflow.cloud.namespace_capacity_usage.v1`。它将分配容量时间与语义事件计数器分开。存储相关字段保留在模式中用于历史计费，不授权附加购买。下方缩略的 Cloud Dev 响应展示当前套餐条款。

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

Cloud Dev 的时间计量从隔离运行时激活开始，到取消配置时停止。月度上限和最低费用按 UTC 自然月适用于每次运行时购买。存储不会自动增长或开始计费。Cloud 在运行时磁盘上保留运维和恢复预留空间；请在达到包含配额前申请更大的运行时套餐。

空闲运行时仍产生容量费用。取消配置会停止运行时容量计费，并删除活动运行时数据和凭据；它不是暂停/恢复操作。计划中的 SLA 条款使用相同的已配置时间模型，采用各自费率、最低费用和上限。解释用量时，使用套餐返回的 `billing_terms`；历史账单保留当时接受的条款。

下游财务系统需要文件交接时，将相同证据导出为 CSV 或 JSON 报告：

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

对于使用 JSON 的仪表盘面板，请以面板时间范围请求同一 API：

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

然后用以下命令展开命名空间容量行：

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

使用 `invoice_units` 进行容量和存储对账。使用 `operational_telemetry` 理解工作负载形态及基准行为；不要将这些事件计数器换算为费用。

## 相关参考 {#related-references}

- [部署模式](/docs/polyglot/deployment-modes)
- [PHP SDK](/docs/polyglot/php)
- [Python SDK](/docs/polyglot/python)
- [Rust SDK](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [自托管部署](/docs/deployment)
- [支持](/docs/support)
