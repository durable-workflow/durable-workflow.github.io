---
title: 数据库兼容性
---

# 数据库兼容性与验证

此表用于选择嵌入式 Laravel 与自托管 Server 的数据库。Cloud 管理其运行时持久化。Cloud 客户配置 SDK 客户端与 Worker，而不是运行时数据库。

声明的兼容性基线不证明所有更高版本都通过验证。源码测试与安装已发布产物的验证是不同证据。此快照绑定 Workflow 2.20.3 源码与 Server 3.3.2 发布记录，不改变运行时兼容性，也不建立已测试的最低/最新版本范围。

| 引擎 | 声明的兼容性 | 观测到的源码验证 | 已发布产物验证 |
| --- | --- | --- | --- |
| MySQL | 嵌入式：基线 8.0。Server：基线 8.0。 | Core：原始浮动镜像功能任务中为 26.10.0。Server 配置：8.0.46、8.4.5。 | Core 观测绑定发布源码。Server 3.3.2 的发布冒烟和确切索引 Compose 冒烟使用按摘要固定的 MySQL 8.0 进行启动/健康检查，不是完整执行、容量或 TLS 验证。 |
| PostgreSQL | 嵌入式：基线 13。Server：基线 13。 | Core：18.6。Server 配置：16.15、17.11。 | Core 观测绑定发布源码。Server 3.3.2 的发布冒烟在按摘要固定的 PostgreSQL 17 上冷启动每种架构的镜像，仅检查就绪状态和集群信息，不是完整执行、容量或 TLS 验证。 |
| MariaDB | 嵌入式：基线 10.5。Server 接受 `mariadb`，此处未确立版本基线。 | Core：10.5.29。Server 配置：10.11.19。 | Core 观测绑定发布源码。在检查的发布证据中未找到绑定 Server 3.3.2 索引的 MariaDB 端点记录。 |
| SQLite | 嵌入式能力和测试包含 SQLite。Server 声明基线 3.35。 | 原始 Core 源码任务没有输出 SQLite 库版本。 | 安装的 Core 2.20.3 验证使用了 SQLite，但未建立库版本范围。Server 3.3.2 的发布冒烟在 SQLite 上冷启动，同样未建立库版本范围。 |
| SQL Server | 已发布嵌入式 Core 声明 `sqlsrv`，但仍未验证。此处未确立 Server 验证。 | 已发布 Core 矩阵中未找到 SQL Server 任务。拟议的后端守卫是独立源码工作。 | 未找到对应发布验证。不要由嵌入式能力声明推断支持已获验证。 |

## 如何理解证据 {#reading-the-evidence}

[Core 清单](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325)将原始镜像摘要及四个 MySQL、四个 PostgreSQL 和一个 MariaDB 功能任务绑定到发布源码。十二个已发布升级单元覆盖 Laravel/PHP 组合，不是十二种数据库端点。独立的[正常安装 Core 记录](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927)覆盖基于 SQLite 的 67 个 stream/replay/fake 用例。PHP 版本或浮动镜像选择器都不能补出未记录的数据库版本。

[Server 清单](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277)区分原生与旧 PHP 源码任务范围。对于 Server 3.3.2，[发布运行](https://github.com/durable-workflow/server/actions/runs/42591612884)在 SQLite、PostgreSQL 17 和 MySQL 8.0 上冷启动 amd64 和 arm64 镜像，检查 `/api/ready` 和经身份验证的集群信息，并使用 SIGTERM 停止每个实例。[确切索引 Compose 冒烟](https://github.com/durable-workflow/server/actions/runs/42602031026)针对索引 `sha256:4aeceb42…` 有四个架构/配置单元。`local` 和 `production` 都使用 MySQL，其中 `mysql:8.0` 按摘要固定。[3.3.2 交付记录](https://github.com/durable-workflow/server/issues/325#issuecomment-6739628227)接受了这两项运行。这些运行从空数据库启动，不升级已有数据库，不验证写入容量，也不验证 TLS，其日志也未报告确切的引擎补丁版本。更早的[稳定版 3.0.5 记录](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603)采用相同的 Compose 结构，但使用浮动的 `mysql:8.0`。源码配置不能验证另一个已发布镜像。

## 厂商生命周期与分布式引擎 {#vendor-lifecycle-and-distributed-engines}

新部署应在确切运行时/数据库组合通过验证后，优先选择厂商维护的版本线。[PostgreSQL 策略](https://www.postgresql.org/support/versioning/)标记 13 已停止支持，14 于 2026 年 11 月 12 日结束支持。[Oracle 公告](https://www.mysql.com/support/eol-notice.html)将 MySQL 8.0 自 2026 年 4 月 21 日起列为 Sustaining Support。厂商生命周期不会建立或取消我们的产物验证。

TiDB、Vitess、PlanetScale 等分布式 MySQL 兼容部署在此未经测试。协议兼容性不证明事务隔离、行锁、commit/after-commit 可见性或重试行为。采用前应以确切运行时验证这些语义。此表不将[单区域运行边界](../operator-operating-envelope.md)扩展到多区域运行。
