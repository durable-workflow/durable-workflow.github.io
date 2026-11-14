---
displayed_sidebar: tutorialSidebar
title: Visibility Query Language
description: Filter Server workflow runs by status, time, identity and typed search attributes, with HTTP examples and pagination.
---

# Visibility Query Language

Use `GET /api/workflows?query=...` to find runs in one Server namespace. This reference describes the published native Server selected in the [compatibility manifest](../compatibility.md#last-qualified-reproducible-tuple), currently `%%artifact.serverVersion%%`. Listing reads stored visibility facts. It does not execute a workflow's named query handler.

The request needs an operator or admin bearer token, `X-Namespace` and `X-Durable-Workflow-Control-Plane-Version: 2`. See [namespace authorization](./namespace-auth-workers.md). Results include matching runs, including earlier runs of an instance and children whose attributes match. There is no built-in roots-only predicate.

## Make a request {#make-a-request}

Set `DURABLE_WORKFLOW_SERVER_URL` to your Server base URL and `DURABLE_WORKFLOW_AUTH_TOKEN` to an operator or admin token. This example needs Bash, curl and jq. Replace the fixed UTC interval with the interval you want to inspect.

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

`Status = failed` selects a bucket that also includes cancelled and terminated runs. Use `Status = cancelled` or `Status = terminated` for those exact statuses. `running` includes pending, running and waiting. `completed` selects completed runs. Status values are case-insensitive.

Use `--data-urlencode` for the query and page token. Shell quoting, query-string escaping and URL encoding are separate steps. A successful response with `workflows: []` means no runs matched this request.

## Fields {#fields}

Field names are case-sensitive. Built-in names take precedence over custom attributes.

| Field | Value | Operators |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | Run type, instance ID, run ID or task queue | `=`, `!=`, `IN`, negated `IN` |
| `Status`, `ExecutionStatus` | Status or status bucket, as above | `=`, `!=` |
| `StartTime`, `ExecutionTime` | The run's start instant. These names are aliases. | Scalar comparisons, `IN`, negated `IN` |
| `CloseTime` | The run's close instant | Scalar comparisons, `IN`, negated `IN` |
| `BuildId`, `BuildIds` | Aliases for the run's compatibility value, not a worker-fleet lookup | Keyword operators, subject to the native refusal below |

Scalar comparisons are `=`, `!=`, `<`, `<=`, `>` and `>=`. A missing start or close instant never matches a comparison, including a negated one. Native listing refuses a returned run with non-null compatibility as HTTP `409` / `unqualified_build_visibility`. A parsed build predicate does not establish qualified build-based listing.

Other fields must be registered search attributes in this namespace. Use `GET /api/search-attributes` to inspect definitions and `POST /api/search-attributes` with a JSON body such as `{"name":"OrderTotal","type":"double"}` to register one. Registration needs an admin token. An inferred stored type alone does not make an unregistered key queryable. Deleting a definition leaves stored values but makes queries on that key invalid.

Identifiers start with an ASCII letter and continue with ASCII letters, digits or `_`. Use the registered name exactly. Memos, visibility labels, business keys and parent/root relationship names are not additional built-in structured fields. Plain search can still find a business key as described below.

## Types and comparisons {#types-and-comparisons}

| Registered type | Literal and comparison behavior |
| --- | --- |
| `keyword` | Whole-value text equality or inequality, `IN` and negated `IN`. No ordering. |
| `string`, `text` | Whole-value text comparisons, with the same operators as `keyword`. No substring, full-text or `LIKE` operator. |
| `int` | Unquoted integer, such as `42` or `-3`. Scalar comparisons, `IN` and negated `IN`. A quoted number or a decimal is not an integer literal. |
| `double` | Unquoted integer or decimal, including exponent notation such as `1.5e3`. Scalar comparisons, `IN` and negated `IN`. |
| `bool` | Unquoted `true` or `false`, case-insensitive. Scalar comparisons, `IN` and negated `IN`; `false` sorts before `true`. `1` and `"true"` are not boolean literals. |
| `datetime` | Quoted datetime. Scalar comparisons, `IN` and negated `IN` compare instants. Use explicit UTC or offset timestamps, such as `"2026-11-14T12:34:56.123456Z"`. |
| `keyword_list` | `Tags = "urgent"` tests membership. `Tags IN ("urgent", "review")` matches any listed member. Inequality, ordering and negated membership are refused. |

A run without a queried attribute never matches that predicate, including `!=` and negated `IN`. There is no existence or `IS NULL` predicate. A value retained under an earlier, different registered type is not automatically converted to the new type.

Keyword, text and built-in text comparisons follow the database's equality rules. The published MySQL/MariaDB schema uses `utf8mb4_unicode_ci`, which ignores case, accents and trailing spaces. SQLite and the native PostgreSQL comparison are exact. Keyword-list membership is exact. Do not assume identical text results across these backends.

Datetimes accept ISO dates and timestamps, with fractions retained to microseconds. A date alone means midnight UTC; an omitted timezone is UTC. Use explicit timestamps for portable queries. Relative dates such as `tomorrow` and timezone names such as `Europe/Paris` are not accepted datetime values. Calculate a rolling interval in the caller and send fixed boundaries.

## Syntax, precedence and escaping {#syntax-and-escaping}

- Write comparisons as `Field operator literal`. Separate predicates with `AND` or `OR`. Keywords are case-insensitive.
- `NOT` applies to the next predicate, before `AND`; `AND` binds more tightly than `OR`. `A = 1 OR B = 2 AND C = 3` means `A = 1 OR (B = 2 AND C = 3)`.
- Parentheses delimit a nonempty, comma-separated `IN` list. They do not group boolean expressions. Repeat predicates across `OR` branches when necessary.
- Negated membership is **`NOT Region IN ("eu", "us")`**. The SQL spelling `Region NOT IN (...)` is not supported. `Status IN (...)` is also unsupported; use `Status = running OR Status = completed`.
- Use single or double quotes for strings. Escape the chosen quote and a literal backslash with `\`. For example, `Customer = 'O\'Brien'` and `Path = "C:\\orders"`. The parser also decodes C-style escapes such as `\n`, `\t` and `\r`; JSON's `\uXXXX` syntax is not a Unicode escape here. Write Unicode characters directly.
- Bare text literals allow ASCII letters, digits, `_`, `.`, `:`, and `-`. Prefer quoted text so booleans and numbers are not inferred accidentally. There is no SQL `SELECT`, `ORDER BY` or `LIMIT` clause.

In an expression, a bare registered boolean field can mean `Flag = true`, and `NOT Flag` means `Flag = false`. A lone `Flag` is instead plain search text. Explicit comparisons avoid this ambiguity.

The Server recognizes an expression from comparison syntax, `IN (...)` or a leading `NOT` predicate. Other text is a substring search over workflow ID and business key. For example, `query=order-1001` is plain search. Unsupported SQL-like text can therefore fall back to plain search rather than produce a syntax error. Use the documented grammar and inspect `query` errors when a recognized expression is invalid.

## Query examples {#query-examples}

Pass any expression below as the `query` value in the curl request above. Custom examples assume `OrderTotal: double`, `Attempt: int`, `Region: keyword`, `Tags: keyword_list`, `Approved: bool`, and `DueAt: datetime` are registered and populated in the selected namespace.

| Task | Query |
| --- | --- |
| Orders over a numeric threshold | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| Attempts within an inclusive range | `Attempt >= 2 AND Attempt <= 5` |
| Either region | `Region IN ("eu", "us")` |
| Other recorded regions | `NOT Region IN ("eu", "us")` |
| A tag from either set | `Tags IN ("urgent", "review")` |
| Explicit false | `Approved = false` |
| A time window | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| Two queues under the same type | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## Pagination and limits {#pagination-and-limits}

| Parameter | Behavior |
| --- | --- |
| `workflow_type` | Optional exact type filter, combined with `query` and `status` using `AND`. |
| `status` | Optional filter. Prefer canonical buckets `running`, `completed` or `failed`. The current list endpoint also accepts exact `cancelled` and `terminated`; `pending` and `waiting` are not accepted here. |
| `page_size` | Integer from `1` to `200`, default `50`. Use this parameter, not `limit`. |
| `next_page_token` | Copy the previous response's token without decoding or constructing it. Stop when it is null. |

`workflow_count` is the number in this page, not the total number of matching runs. Results are ordered by descending start/sort time, then descending run ID. Paging reads live data using an offset. Keep namespace, query, filters and page size unchanged. Inserts, closures or attribute updates between requests can move matches and cause repeats or omissions; this is not a snapshot export. An invalid token currently restarts at the first page rather than returning an error.

Fetch the next page from the first example, if present:

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

Page size limits returned rows, not query evaluation work. Keep expressions and `IN` lists small and use selective type, status or attribute predicates. The workflow parser does not define the schedule API's 2048-character query limit. HTTP servers and proxies can impose their own request-URI limits. [Schedule listing](./server-api-reference.md#schedule-list-filters) has a different, equality-and-`AND` grammar.

## Invalid queries {#invalid-queries}

A recognized expression that fails parsing, field lookup or type checking returns HTTP `422` with `reason: "validation_failed"`, a `message`, and arrays in `errors.query` and `validation_errors.query`. An invalid page size or status uses that parameter's key instead.

| Invalid expression | Correction |
| --- | --- |
| `Unknown = 1` | Register the attribute in this namespace or correct the field name. |
| `OrderTotal = "1000"` | Use the numeric literal `1000`. |
| `Approved = 1` | Use `true` or `false`. |
| `Region > "eu"` | Keywords support equality and membership, not ordering. |
| `Tags != "urgent"` or `NOT Tags IN ("urgent")` | Negative membership is not supported for keyword lists. |
| `Attempt IN ()`, `Attempt = 1 AND` | Supply a nonempty list or complete predicate. |
| `DueAt > "tomorrow"` | Send a concrete timestamp. |

## Embedded mode and Waterline {#mode-support}

This language is available through the Server workflow-list API. Current embedded listing and Waterline saved-view filters do not implement this full grammar. Their existing exact `key=value` metadata filters and substring fields do not establish range, `IN`, `!=` or boolean-expression support. Service-mode Waterline also needs explicit UI/API support before a saved view can be treated as this query language. Shared parity work remains open in [the visibility-query feature](https://github.com/durable-workflow/.github/issues/224).

The reference follows the [published native parser and its unit tests](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs), [HTTP pagination implementation](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs), and [listing API tests](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs). These describe the published Server behavior, not completion of embedded or Waterline parity.
