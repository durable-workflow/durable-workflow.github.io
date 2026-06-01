---
sidebar_position: 3
title: Server Config Reference
description: Reference for Durable Workflow server environment variables, defaults, legacy aliases, and runtime infrastructure settings.
tags:
  - server
  - config
  - reference
  - operations
keywords:
  - Durable Workflow server config
  - DW environment variables
  - server env audit
  - workflow server environment
---

# Server Config Reference

This page documents the operator-facing `DW_*` environment variable contract
for the Durable Workflow server image. Use it when building deployment
templates, reviewing production configuration, or migrating older
`WORKFLOW_*` / `ACTIVITY_*` names to the v2 server contract.

The server still consumes ordinary Laravel runtime settings such as `DB_*`,
`REDIS_*`, `QUEUE_CONNECTION`, and `CACHE_STORE`. Those runtime infrastructure
variables are listed separately because they are deployment plumbing, not
Durable Workflow API controls.

## How The Contract Is Enforced

The server repository keeps the canonical contract in `config/dw-contract.php`.
At container boot, `php artisan env:audit` warns when it sees unknown `DW_*`
variables or legacy names. Set `DW_ENV_AUDIT_STRICT=1` when you want the
entrypoint to fail instead of booting with warnings.

```bash
DW_ENV_AUDIT_STRICT=1
DW_AUTH_DRIVER=token
DW_ADMIN_TOKEN="${DW_ADMIN_TOKEN}"
DW_OPERATOR_TOKEN="${DW_OPERATOR_TOKEN}"
DW_WORKER_TOKEN="${DW_WORKER_TOKEN}"
```

Legacy names are fallback-only. Prefer the `DW_*` name in every new
deployment, and treat a legacy warning as migration debt even when the server
still honors the value.

## Server Identity And Mode

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_MODE` | `service` | Server mode: `service` makes external workers poll; `embedded` dispatches locally through the Laravel queue. | `WORKFLOW_SERVER_MODE` |
| `DW_SERVER_ID` | `gethostname()` | Unique server instance identifier used in lease ownership and worker registration. | `WORKFLOW_SERVER_ID` |
| `DW_SERVER_TOPOLOGY_SHAPE` | `standalone_server` | Advertised topology shape for cluster discovery, such as `embedded`, `standalone_server`, or `split_control_execution`. | `WORKFLOW_SERVER_TOPOLOGY_SHAPE` |
| `DW_SERVER_PROCESS_CLASS` | `server_http_node` | Advertised process class for this node within the selected topology shape, such as `server_http_node`, `worker_node`, or `scheduler_node`. | `WORKFLOW_SERVER_PROCESS_CLASS` |
| `DW_SERVER_KEY` | generated at container boot | Optional server-internal runtime key. Docker images generate one automatically when unset. | - |
| `DW_DEFAULT_NAMESPACE` | `default` | Namespace used when a request omits the namespace header. | `WORKFLOW_SERVER_DEFAULT_NAMESPACE` |
| `DW_TASK_DISPATCH_MODE` | unset | Overrides `workflows.v2.task_dispatch_mode`; in service mode the server defaults to `poll` unless you set a different value. | `WORKFLOW_V2_TASK_DISPATCH_MODE` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | unset | Path to a `durable-workflow.external-executor.config` JSON file for external executor handler mappings. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | unset | Overlay name from the external executor config file to apply before server validation and discovery. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Authentication

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | unset | Laravel-resolvable class implementing `App\Contracts\AuthProvider`. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | Auth driver: `none`, `token`, or `signature`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | unset | Single shared bearer token when no role-scoped token is configured. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | unset | Shared HMAC signature key when no role-scoped signature key is configured. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | unset | Bearer token for worker registration, polling, heartbeats, and completions. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | unset | Bearer token for read and operator control-plane actions. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | unset | Bearer token for namespace, retention, and other administrative mutations. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | unset | JSON token map for named bearer-token principals. Each entry supplies `token`, `subject`, `roles`, optional `tenant`, `label`, and non-secret `claims`. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | unset | HMAC key for worker-role requests when using signature auth. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | unset | HMAC key for operator-role requests when using signature auth. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | unset | HMAC key for admin-role requests when using signature auth. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | Honor shared `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` as a fallback when a role-scoped credential is missing. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Use role-scoped credentials for production. `DW_AUTH_DRIVER=none` is only for
local smoke work because every endpoint becomes reachable without a bearer
token or signature.

Use `DW_PRINCIPAL_TOKENS` when audit trails need stable actor subjects rather
than role labels. The server derives the recorded principal from the matched
token entry; clients cannot override it with request payloads or headers.

## Command Attribution

These settings let a trusted gateway preserve caller metadata in durable
command history. Leave `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS=false` unless
the server is behind a gateway that strips untrusted client-supplied headers.

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS` | `false` | Record forwarded caller/auth headers into workflow command history. | `WORKFLOW_SERVER_TRUST_FORWARDED_ATTRIBUTION_HEADERS` |
| `DW_CALLER_TYPE_HEADER` | `X-Workflow-Caller-Type` | Header carrying forwarded caller type. | `WORKFLOW_SERVER_CALLER_TYPE_HEADER` |
| `DW_CALLER_LABEL_HEADER` | `X-Workflow-Caller-Label` | Header carrying forwarded caller label. | `WORKFLOW_SERVER_CALLER_LABEL_HEADER` |
| `DW_AUTH_STATUS_HEADER` | `X-Workflow-Auth-Status` | Header carrying forwarded auth status. | `WORKFLOW_SERVER_AUTH_STATUS_HEADER` |
| `DW_AUTH_METHOD_HEADER` | `X-Workflow-Auth-Method` | Header carrying forwarded auth method. | `WORKFLOW_SERVER_AUTH_METHOD_HEADER` |

## Worker Polling And Admission

These values control long-poll timing, wake coordination, server-side
admission caps, and bounded task dispatch budgets.

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_WORKER_POLL_TIMEOUT` | `30` | Seconds the server holds a poll open waiting for a task. | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Milliseconds between internal scans while a poll is held open. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Milliseconds between wake-signal checks while a poll is held open. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Directory for worker-poll coordination state when using file-backed polling cache. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL for per-queue wake signals that short-circuit a pending poll. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | unset; derived for `PHP_CLI_SERVER_WORKERS` | Optional cap for concurrent held workflow/activity worker long-poll waits on this server node. Query-task polls use a separate wait budget. | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | PHP CLI server workers reserved for health and control-plane requests when deriving the workflow/activity long-poll wait cap. | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Maximum tasks returned per worker poll. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Seconds the SQLite quickstart backend holds the cache-backed worker poll claim gate before the lock expires. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Seconds SQLite worker poll claims wait for the cache-backed claim gate before returning backend lock pressure. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | unset | Active workflow-task lease cap per namespace/task queue. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | unset | Active workflow-task lease cap across all queues in a namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | unset | Per-minute workflow-task dispatch cap per namespace/task queue. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | unset | Per-minute workflow-task dispatch cap across a namespace. | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | unset | Active activity-task lease cap per namespace/task queue. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | unset | Active activity-task lease cap across all queues in a namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | unset | Per-minute activity-task dispatch cap per namespace/task queue. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | unset | Per-minute activity-task dispatch cap across a namespace. | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | JSON overrides keyed by `namespace:task_queue`, `namespace:*`, `task_queue`, or `*` for active leases, dispatch rate, namespace caps, and downstream budget groups. | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Maximum expired workflow tasks recovered per pass. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Minimum seconds between expired-task recovery passes per queue. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

Sticky execution has no standalone server-image environment variables. See
[Sticky Execution](/docs/2.0/features/sticky-execution) for the sticky-cache
lifecycle, worker protocol fields, replay modes, and diagnostics.

Example admission override:

```json
{
  "production:billing": {
    "workflow_tasks": {
      "max_active_leases": 50,
      "max_dispatches_per_minute": 600
    },
    "activity_tasks": {
      "max_active_leases": 200
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 500
    }
  }
}
```

## Worker Protocol And Query Transport

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_WORKER_PROTOCOL_VERSION` | `WorkerProtocolVersion::VERSION` | Worker-protocol version advertised on worker-plane responses. | `WORKFLOW_SERVER_WORKER_PROTOCOL_VERSION` |
| `DW_HISTORY_PAGE_SIZE_DEFAULT` | `WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` | Default page size for worker history reads. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_DEFAULT` |
| `DW_HISTORY_PAGE_SIZE_MAX` | `WorkerProtocolVersion::MAX_HISTORY_PAGE_SIZE` | Maximum page size honored on worker history reads. | `WORKFLOW_SERVER_HISTORY_PAGE_SIZE_MAX` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Seconds the control plane waits for a query task response from the worker. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Lease timeout for ephemeral query tasks handed to workers. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | How long the server retains query-task result rows before reaping them. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Maximum pending cache-backed query tasks per namespace/task queue before new queries are rejected. | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | unset; derived for `PHP_CLI_SERVER_WORKERS` | Optional cap for concurrent held idle query-task worker long-poll waits on this server node. Pending query tasks can still be claimed immediately before an idle poll waits. | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Default workflow-task lease timeout in seconds. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Default activity-task lease timeout in seconds. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT * 2, 60)` | Seconds after a worker heartbeat before the worker registration is stale. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `60` | Cadence in seconds advertised to SDKs in worker register and heartbeat acknowledgements. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

## Limits, Retention, And Metrics

These settings are request-boundary and bounded-growth controls. If an
application regularly approaches these values, prefer smaller payloads,
external payload storage, or continue-as-new rather than raising the limits by
default.

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` | `20` | Maximum `workflow_type` series reported by `dw_workflow_task_consecutive_failures`; excess types are summarized. | `WORKFLOW_SERVER_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT` |
| `DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` | `100` | Maximum workflow series reported by `/api/system/prometheus-metrics` before excess series are summarized. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` | `100` | Maximum activity series reported by `/api/system/prometheus-metrics` before excess series are summarized. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT` |
| `DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` | `100` | Maximum task-queue runtime series reported by `/api/system/prometheus-metrics` before excess series are summarized. | `WORKFLOW_SERVER_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT` |
| `DW_MAX_HISTORY_EVENTS` | `50000` | Maximum history events per workflow run before continue-as-new is enforced. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Default number of days closed-run history is retained when a namespace does not override it. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Maximum serialized bytes for one payload. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_MAX_MEMO_BYTES` | `262144` | Maximum serialized bytes for a workflow memo. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Maximum number of search attributes on one workflow. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Maximum byte length for one search-attribute key. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Maximum byte size for one search-attribute string value. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Maximum byte length for a signal, update, or query name. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Maximum pending activities per workflow run before rejecting a command batch. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Maximum pending child workflows per run before rejecting a command batch. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Maximum Nexus operations returned per caller from the operations history surface before clients must paginate. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Enable JSON response compression above the minimum size threshold. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Docker Bootstrap And Provenance

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_EXPOSE_PACKAGE_PROVENANCE` | `false` | Include `package_provenance` in `/api/cluster/info` for admin requests. | `WORKFLOW_SERVER_EXPOSE_PACKAGE_PROVENANCE` |
| `DW_PACKAGE_PROVENANCE_PATH` | `<base_path>/.package-provenance` | Absolute path to the Docker build provenance file. | `WORKFLOW_SERVER_PACKAGE_PROVENANCE_PATH` |
| `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` | `allow` | Default service-call boundary action for cross-namespace calls when no more-specific rule matches. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT` |
| `DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` | unset | Optional per-minute service-call boundary rate limit. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT` | unset | Optional service-call boundary concurrency limit. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_MAX_IN_FLIGHT` |

## Docker Bootstrap

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_ENV_AUDIT_STRICT` | `0` | Fail container boot when `env:audit` finds unknown or legacy `DW_*` variables. | - |
| `DW_BOOTSTRAP_RETRIES` | `30` | Bootstrap attempts before entrypoint gives up on migrations and default namespace seed. | `WORKFLOW_SERVER_BOOTSTRAP_RETRIES` |
| `DW_BOOTSTRAP_DELAY_SECONDS` | `2` | Seconds between bootstrap attempts. | `WORKFLOW_SERVER_BOOTSTRAP_DELAY_SECONDS` |

## Workflow Package Controls

The server image bundles `durable-workflow/workflow`, so it also exposes the
package-level `DW_V2_*` controls. These should match worker deployments that
execute the same workflows.

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_V2_NAMESPACE` | unset | Scope workflow instances to a namespace. | `WORKFLOW_V2_NAMESPACE` |
| `DW_V2_TENANCY_ORGANIZATION` | unset | Optional organization segment for the workflow package tenancy hierarchy exposed to readiness, discovery, and operator surfaces. | `WORKFLOW_V2_TENANCY_ORGANIZATION` |
| `DW_V2_TENANCY_PROJECT` | unset | Optional project segment for the workflow package tenancy hierarchy exposed to readiness, discovery, and operator surfaces. | `WORKFLOW_V2_TENANCY_PROJECT` |
| `DW_V2_TENANCY_ENVIRONMENT` | unset | Optional environment segment for the workflow package tenancy hierarchy exposed to readiness, discovery, and operator surfaces. | `WORKFLOW_V2_TENANCY_ENVIRONMENT` |
| `DW_V2_CURRENT_COMPATIBILITY` | unset | Worker-compatibility marker this worker advertises. | `WORKFLOW_V2_CURRENT_COMPATIBILITY` |
| `DW_V2_SUPPORTED_COMPATIBILITIES` | unset | Comma-separated compatibility markers this worker accepts, or `*`. | `WORKFLOW_V2_SUPPORTED_COMPATIBILITIES` |
| `DW_V2_COMPATIBILITY_NAMESPACE` | unset | Compatibility namespace for shared workflow databases with independent fleets. | `WORKFLOW_V2_COMPATIBILITY_NAMESPACE` |
| `DW_V2_COMPATIBILITY_HEARTBEAT_TTL` | `30` | Seconds a worker-compatibility heartbeat remains valid. | `WORKFLOW_V2_COMPATIBILITY_HEARTBEAT_TTL` |
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Resolve in-flight runs from the workflow fingerprint recorded at `WorkflowStarted`. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
| `DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` | `10000` | History event count at which the package asks the workflow author to continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD` |
| `DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` | `5242880` | Serialized-history byte size at which the package asks for continue-as-new. | `WORKFLOW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY` | unset | Optional HMAC key for authenticating history export archives. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY` |
| `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` | unset | Key identifier recorded alongside signed history exports. | `WORKFLOW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` |
| `DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` | `10` | Seconds the server waits for an update to reach a terminal stage. | `WORKFLOW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS` |
| `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` | `50` | Milliseconds between update-stage polls. | `WORKFLOW_V2_UPDATE_WAIT_POLL_INTERVAL_MS` |
| `DW_V2_GUARDRAILS_BOOT` | `warn` | Boot-time structural guardrail mode: `warn`, `fail`, or `silent`. | `WORKFLOW_V2_GUARDRAILS_BOOT` |
| `DW_V2_LIMIT_PENDING_ACTIVITIES` | `2000` | Package-level pending-activity ceiling. | `WORKFLOW_V2_LIMIT_PENDING_ACTIVITIES` |
| `DW_V2_LIMIT_PENDING_CHILDREN` | `1000` | Package-level pending-child-workflow ceiling. | `WORKFLOW_V2_LIMIT_PENDING_CHILDREN` |
| `DW_V2_LIMIT_PENDING_TIMERS` | `2000` | Package-level pending-timer ceiling. | `WORKFLOW_V2_LIMIT_PENDING_TIMERS` |
| `DW_V2_LIMIT_PENDING_SIGNALS` | `5000` | Package-level pending-signal ceiling. | `WORKFLOW_V2_LIMIT_PENDING_SIGNALS` |
| `DW_V2_LIMIT_PENDING_UPDATES` | `500` | Package-level pending-update ceiling. | `WORKFLOW_V2_LIMIT_PENDING_UPDATES` |
| `DW_V2_LIMIT_COMMAND_BATCH_SIZE` | `1000` | Maximum commands accepted in one workflow-task completion. | `WORKFLOW_V2_LIMIT_COMMAND_BATCH_SIZE` |
| `DW_V2_LIMIT_PAYLOAD_SIZE_BYTES` | `2097152` | Package-level single-payload byte ceiling. | `WORKFLOW_V2_LIMIT_PAYLOAD_SIZE_BYTES` |
| `DW_V2_LIMIT_MEMO_SIZE_BYTES` | `262144` | Package-level workflow-memo byte ceiling. | `WORKFLOW_V2_LIMIT_MEMO_SIZE_BYTES` |
| `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` | `40960` | Package-level search-attribute byte ceiling. | `WORKFLOW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES` |
| `DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` | `5000` | Package-level history-transaction event ceiling. | `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_SIZE` |
| `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` | `80` | Percent of a structural limit at which the package emits a warning. | `WORKFLOW_V2_LIMIT_WARNING_THRESHOLD_PERCENT` |
| `DW_V2_TASK_DISPATCH_MODE` | `queue` | Package-level task dispatch mode, usually overridden by `DW_TASK_DISPATCH_MODE` in server mode. | - |
| `DW_V2_MATCHING_ROLE_QUEUE_WAKE` | `true` | Whether queue workers run the in-worker matching-role wake on every Looping event. Set to `false` to opt execution-only nodes out of the broad-poll wake when a dedicated `php artisan workflow:v2:repair-pass --loop` daemon owns the sweep instead. | `WORKFLOW_V2_MATCHING_ROLE_QUEUE_WAKE` |
| `DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` | `3` | Seconds before an orphaned workflow task is redispatched by repair. | `WORKFLOW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS` |
| `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` | `5` | Minimum seconds between task-repair passes per queue. | `WORKFLOW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS` |
| `DW_V2_TASK_REPAIR_SCAN_LIMIT` | `25` | Maximum tasks considered per task-repair pass. | `WORKFLOW_V2_TASK_REPAIR_SCAN_LIMIT` |
| `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` | `60` | Maximum task-repair failure backoff in seconds. | `WORKFLOW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS` |
| `DW_V2_MULTI_NODE` | `false` | Declare a multi-node deployment so cache backends are validated for cross-node coordination. | `WORKFLOW_V2_MULTI_NODE` |
| `DW_V2_VALIDATE_CACHE_BACKEND` | `true` | Validate the long-poll cache backend at boot. | `WORKFLOW_V2_VALIDATE_CACHE_BACKEND` |
| `DW_V2_CACHE_VALIDATION_MODE` | `warn` | Cache-backend validation failure mode: `fail`, `warn`, or `silent`. | `WORKFLOW_V2_CACHE_VALIDATION_MODE` |
| `DW_V2_FLEET_VALIDATION_MODE` | `warn` | Fleet-compatibility validation mode: `warn` logs, `fail` blocks dispatch and fails closed when no compatible worker is available. | `WORKFLOW_V2_FLEET_VALIDATION_MODE` |
| `DW_SERIALIZER` | `avro` | Payload codec diagnostic input; final v2 resolves new-run payloads to Avro. | `WORKFLOW_SERIALIZER` |

Use `DW_V2_GUARDRAILS_BOOT` in CI and deployment manifests. The older `WORKFLOW_V2_GUARDRAILS_BOOT` name is retained only so `env:audit` can point alpha-era operators at the rename; the workflow package no longer reads it as a runtime fallback.

Use [Task Matching and Dispatch](/docs/2.0/polyglot/task-matching-dispatch)
when you configure `DW_V2_MATCHING_ROLE_QUEUE_WAKE` or a dedicated
`workflow:v2:repair-pass --loop` daemon. Those settings change where
ready-task discovery runs, not the worker-protocol contract itself.

## Runtime Infrastructure Variables

Runtime infrastructure variables are framework and dependency controls. The
server audit recognizes them so it does not warn, but they are not stable
Durable Workflow API knobs.

| Group | Variables | Use |
| --- | --- | --- |
| Application | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, locale, timezone, maintenance, and cipher settings | Laravel application runtime identity and boot behavior. |
| Logging | `LOG_CHANNEL`, `LOG_LEVEL`, stack, daily, Slack, and Papertrail settings | Laravel logging destinations and retention. |
| Database | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, charset, collation, and foreign-key settings | SQL state store for workflow, namespace, worker, and projection tables. |
| Redis/cache/queue | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Queue workers, cache locks, long-poll signaling, and web/session runtime support. |
| Filesystems/mail/broadcasting | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Framework integrations used by deployment-specific features. |
| Build/runtime | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Docker Compose images and framework runtime behavior. |

## Migration Notes

When migrating an older deployment, change the public name first and leave the
legacy name unset. If both are present, the `DW_*` value is the value operators
should reason about, and the legacy name should be removed.

```bash
# Before
WORKFLOW_SERVER_AUTH_DRIVER=token
WORKFLOW_SERVER_OPERATOR_TOKEN=operator-secret

# After
DW_AUTH_DRIVER=token
DW_OPERATOR_TOKEN=operator-secret
```

Run the server image with `DW_ENV_AUDIT_STRICT=1` after migration to catch
misspelled variables, stale aliases, and settings copied from older runbooks.
