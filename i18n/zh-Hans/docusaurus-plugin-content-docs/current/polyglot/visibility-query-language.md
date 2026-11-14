---
displayed_sidebar: tutorialSidebar
title: 可见性查询语言
description: 按状态、时间、标识和带类型的搜索属性筛选 Server 工作流运行，包含 HTTP 示例和分页说明。
---

# 可见性查询语言

使用 `GET /api/workflows?query=...` 查找 Server 某个命名空间中的运行。本参考描述[兼容性清单](../compatibility.md#last-qualified-reproducible-tuple)选定的已发布原生 Server，当前为 `%%artifact.serverVersion%%`。列表读取已存储的可见性数据，不执行工作流的命名查询处理程序。

请求需要 operator 或 admin 角色的 bearer 令牌、`X-Namespace` 和 `X-Durable-Workflow-Control-Plane-Version: 2`。请参阅[命名空间授权](./namespace-auth-workers.md)。结果包含所有匹配的运行，包括实例较早的运行和属性匹配的子工作流运行。没有内置的仅筛选根工作流的谓词。

## 发送请求 {#make-a-request}

将 `DURABLE_WORKFLOW_SERVER_URL` 设为 Server 基础 URL，将 `DURABLE_WORKFLOW_AUTH_TOKEN` 设为 operator 或 admin 令牌。示例需要 Bash、curl 和 jq。请将固定 UTC 区间替换为要检查的时间范围。

```bash
query='Status = failed AND CloseTime >= "2026-11-14T00:00:00Z" AND CloseTime < "2026-11-15T00:00:00Z"'
page=$(curl --fail-with-body --silent --show-error --get \
  "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H 'X-Namespace: default' \
  -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
  --data-urlencode "query=$query" \
  --data-urlencode 'page_size=50')
printf '%s\n' "$page" | jq '{workflow_count, workflows, next_page_token}'
```

`Status = failed` 选择的状态组还包含已取消和已终止的运行。使用 `Status = cancelled` 或 `Status = terminated` 精确选择这些状态。`running` 包括 pending、running 和 waiting。`completed` 选择已完成的运行。状态值不区分大小写。

对查询和分页令牌使用 `--data-urlencode`。Shell 引号、查询字符串转义和 URL 编码是不同步骤。成功响应中的 `workflows: []` 表示没有运行匹配此次请求。

## 字段 {#fields}

字段名区分大小写。内置名称优先于自定义属性。

| 字段 | 值 | 运算符 |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | 运行类型、实例 ID、运行 ID 或任务队列 | `=`、`!=`、`IN`、否定 `IN` |
| `Status`, `ExecutionStatus` | 上述状态或状态组 | `=`, `!=` |
| `StartTime`, `ExecutionTime` | 运行的开始时刻，两个名称互为别名。 | 标量比较、`IN`、否定 `IN` |
| `CloseTime` | 运行的关闭时刻 | 标量比较、`IN`、否定 `IN` |
| `BuildId`, `BuildIds` | 运行兼容性值的别名，不是 Worker 集群查询 | keyword 运算符，但受下述原生拒绝限制 |

标量比较为 `=`、`!=`、`<`、`<=`、`>` 和 `>=`。开始或关闭时刻缺失时，任何比较都不匹配，包括否定比较。若待返回运行的 compatibility 非 null，原生列表返回 HTTP `409` / `unqualified_build_visibility` 拒绝。能解析 build 谓词不代表按 build 列表查询已通过资格验证。

其他字段必须是在本命名空间注册的搜索属性。用 `GET /api/search-attributes` 查看定义，用 `POST /api/search-attributes` 和 JSON 请求体（例如 `{"name":"OrderTotal","type":"double"}`）注册属性。注册需要 admin 令牌。仅有推断出的存储类型并不使未注册键可查询。删除定义会保留存储值，但该键的查询将无效。

标识符必须以 ASCII 字母开头，后续为 ASCII 字母、数字或 `_`。请精确使用注册名称。Memo、可见性标签、业务键和父级/根关系名称不是额外的内置结构化字段。普通搜索仍可按下文说明查找业务键。

## 类型和比较 {#types-and-comparisons}

| 注册类型 | 字面量和比较行为 |
| --- | --- |
| `keyword` | 比较整个文本值的相等或不等，支持 `IN` 和否定 `IN`，不支持排序比较。 |
| `string`, `text` | 比较整个文本值，运算符与 `keyword` 相同。不支持子串、全文或 `LIKE` 运算符。 |
| `int` | 不加引号的整数，例如 `42` 或 `-3`。支持标量比较、`IN` 和否定 `IN`。带引号的数字或小数不是整数字面量。 |
| `double` | 不加引号的整数或小数，也支持 `1.5e3` 等指数记法。支持标量比较、`IN` 和否定 `IN`。 |
| `bool` | 不加引号的 `true` 或 `false`，不区分大小写。支持标量比较、`IN` 和否定 `IN`；`false` 小于 `true`。`1` 和 `"true"` 不是布尔字面量。 |
| `datetime` | 加引号的日期时间。标量比较、`IN` 和否定 `IN` 按时刻比较。使用明确的 UTC 或带偏移量的时间戳，例如 `"2026-11-14T12:34:56.123456Z"`。 |
| `keyword_list` | `Tags = "urgent"` 检查成员关系。`Tags IN ("urgent", "review")` 匹配任一列出的成员。不等、排序和否定成员关系会被拒绝。 |

运行缺少被查询属性时，永远不匹配该谓词，包括 `!=` 和否定 `IN`。没有存在性或 `IS NULL` 谓词。按旧的其他注册类型保留的值不会自动转换为新类型。

keyword、文本和内置文本字段的比较遵循数据库的相等规则。已发布 MySQL/MariaDB 模式使用 `utf8mb4_unicode_ci`，忽略大小写、重音和尾随空格。SQLite 和原生 PostgreSQL 比较是精确比较。keyword_list 的成员匹配也是精确比较。不要假定这些后端的文本查询结果相同。

日期时间接受 ISO 日期和时间戳，小数部分保留到微秒。仅有日期表示 UTC 午夜；省略时区时使用 UTC。可移植查询应使用明确时间戳。`tomorrow` 等相对日期和 `Europe/Paris` 等时区名称不是有效的日期时间值。请在调用方计算滚动区间，再发送固定边界。

## 语法、优先级和转义 {#syntax-and-escaping}

- 比较写作 `Field operator literal`，用 `AND` 或 `OR` 分隔谓词。关键字不区分大小写。
- `NOT` 先于 `AND` 作用于下一个谓词；`AND` 的优先级高于 `OR`。`A = 1 OR B = 2 AND C = 3` 的含义是 `A = 1 OR (B = 2 AND C = 3)`。
- 括号仅用于非空、逗号分隔的 `IN` 列表，不用于布尔表达式分组。必要时在不同 `OR` 分支中重复谓词。
- 否定成员关系写作 **`NOT Region IN ("eu", "us")`**。不支持 SQL 写法 `Region NOT IN (...)`。也不支持 `Status IN (...)`；请用 `Status = running OR Status = completed`。
- 字符串可用单引号或双引号。用 `\` 转义所选引号和字面的反斜杠，例如 `Customer = 'O\'Brien'` 和 `Path = "C:\\orders"`。解析器也解码 `\n`、`\t`、`\r` 等 C 风格转义；这里 JSON 的 `\uXXXX` 不是 Unicode 转义。请直接写 Unicode 字符。
- 不加引号的文本字面量允许 ASCII 字母、数字、`_`、`.`、`:` 和 `-`。建议给文本加引号，避免意外推断为布尔值或数字。不支持 SQL 的 `SELECT`、`ORDER BY` 或 `LIMIT` 子句。

表达式中的独立已注册布尔字段可表示 `Flag = true`，`NOT Flag` 表示 `Flag = false`。但单独的 `Flag` 会作为普通搜索文本。使用显式比较可避免歧义。

Server 通过比较语法、`IN (...)` 或开头的 `NOT` 谓词识别表达式。其他文本按工作流 ID 和业务键进行子串搜索，例如 `query=order-1001` 是普通搜索。因此，不受支持的类 SQL 文本可能退回普通搜索，而不是返回语法错误。请使用已记录的语法，并在已识别表达式无效时检查 `query` 错误。

## 查询示例 {#query-examples}

将下列任一表达式作为上述 curl 请求中的 `query` 值。自定义示例假定在所选命名空间中已注册并填充 `OrderTotal: double`、`Attempt: int`、`Region: keyword`、`Tags: keyword_list`、`Approved: bool` 和 `DueAt: datetime`。

| 任务 | 查询 |
| --- | --- |
| 超过数值阈值的订单 | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| 闭区间内的尝试次数 | `Attempt >= 2 AND Attempt <= 5` |
| 任一地区 | `Region IN ("eu", "us")` |
| 其他已记录地区 | `NOT Region IN ("eu", "us")` |
| 列表中的任一标签 | `Tags IN ("urgent", "review")` |
| 明确的 false | `Approved = false` |
| 时间窗口 | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| 同一类型下的两个队列 | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## 分页和限制 {#pagination-and-limits}

| 参数 | 行为 |
| --- | --- |
| `workflow_type` | 可选的精确类型筛选，与 `query`、`status` 通过 `AND` 结合。 |
| `status` | 可选筛选。建议使用规范状态组 `running`、`completed` 或 `failed`。当前列表端点还接受精确的 `cancelled`、`terminated`；此处不接受 `pending`、`waiting`。 |
| `page_size` | 从 `1` 到 `200` 的整数，默认 `50`。使用此参数，不要使用 `limit`。 |
| `next_page_token` | 原样复制前一响应的令牌，不要解码或自行构造。令牌为 null 时停止。 |

`workflow_count` 是本页数量，不是全部匹配运行的总数。结果先按开始/排序时间降序，再按运行 ID 降序排列。分页使用偏移量读取实时数据。应保持命名空间、查询、筛选和页大小不变。请求之间的插入、关闭或属性更新可能移动匹配项，造成重复或遗漏；它不是快照导出。无效令牌当前会从第一页重新开始，而不是返回错误。

如果第一页包含后续令牌，用以下方式获取下一页：

```bash
next=$(printf '%s\n' "$page" | jq -r '.next_page_token // empty')
if [ -n "$next" ]; then
  curl --fail-with-body --silent --show-error --get \
    "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
    -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
    -H 'X-Namespace: default' \
    -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
    --data-urlencode "query=$query" \
    --data-urlencode 'page_size=50' \
    --data-urlencode "next_page_token=$next" | jq .
fi
```

页大小限制返回行数，不限制查询求值工作量。请控制表达式和 `IN` 列表大小，并使用选择性较高的类型、状态或属性谓词。工作流解析器没有采用 schedule API 的 2048 字符查询限制。HTTP 服务器和代理可以施加自己的请求 URI 限制。[Schedule 列表](./server-api-reference.md#schedule-list-filters)使用不同的语法，仅支持相等与 `AND`。

## 无效查询 {#invalid-queries}

已识别表达式若在解析、字段查找或类型检查时失败，返回 HTTP `422`，包含 `reason: "validation_failed"`、`message`，以及 `errors.query` 和 `validation_errors.query` 数组。页大小或状态无效时，改用相应参数键。

| 无效表达式 | 修正方式 |
| --- | --- |
| `Unknown = 1` | 在当前命名空间注册属性，或修正字段名。 |
| `OrderTotal = "1000"` | 使用数值字面量 `1000`。 |
| `Approved = 1` | 使用 `true` 或 `false`。 |
| `Region > "eu"` | keyword 支持相等和成员关系，不支持排序比较。 |
| `Tags != "urgent"` 或 `NOT Tags IN ("urgent")` | keyword_list 不支持否定成员关系。 |
| `Attempt IN ()`, `Attempt = 1 AND` | 提供非空列表或完整谓词。 |
| `DueAt > "tomorrow"` | 发送具体时间戳。 |

## 嵌入模式和 Waterline {#mode-support}

Server 的工作流列表 API 提供此语言。当前嵌入模式列表和 Waterline 已保存视图筛选器没有实现完整语法。现有精确 `key=value` 元数据筛选和子串字段不代表支持范围、`IN`、`!=` 或布尔表达式。服务模式 Waterline 也需要明确的 UI/API 支持，才能将已保存视图视为此查询语言。共享一致性工作仍在[可见性查询功能](https://github.com/durable-workflow/.github/issues/224)中跟踪。

本参考依据[已发布的原生解析器及其单元测试](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs)、[HTTP 分页实现](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs)和[列表 API 测试](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs)。它们描述已发布 Server 的行为，不表示嵌入模式或 Waterline 一致性工作已完成。
