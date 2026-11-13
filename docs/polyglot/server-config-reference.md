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
`WORKFLOW_*` / `ACTIVITY_*` names to the v2 server contract. The current Server
is the native 3.x Server; [Native Server 3.x](#native-server-3x) lists which
settings it honors, ignores or refuses. PHP Server 2.x is frozen at 2.11.8.

The PHP 2.x server also consumes ordinary Laravel runtime settings such as
`DB_*`, `REDIS_*`, `QUEUE_CONNECTION`, and `CACHE_STORE`. Those runtime
infrastructure variables are listed separately because they are deployment
plumbing, not Durable Workflow API controls.

## Native Server 3.x {#native-server-3x}

The variable tables on this page record the `DW_*` contract published by PHP
Server 2.11.0, and their purposes describe PHP 2.x. The native 3.x Server reads
the same names, with the same legacy aliases, through a startup audit that
gives every contract setting one disposition:

- **Honored:** native reads the setting and applies the PHP meaning. Settings
  not listed below are honored.
- **Ignored:** native accepts the setting, but it changes nothing clients or
  operators observe.
- **Refused unless default:** native refuses to start unless the setting is
  unset or keeps the PHP default. The startup error names the setting, the
  accepted value and the reason.

Native reads its environment once when the process starts and keeps no
configuration cache. To change a setting, restart or replace the Server
process. Like PHP's `env:audit`, the native audit warns about unknown `DW_*`
names and legacy names, and `DW_ENV_AUDIT_STRICT=1` turns those warnings into a
startup refusal.

Native refuses these settings unless they keep the listed value:

| Reason | Settings and accepted values |
| --- | --- |
| Native always pins runs to their recorded workflow definition | `DW_V2_PIN_TO_RECORDED_FINGERPRINT`: unset or `true` |
| Native cannot apply a changed Nexus operation limit | `DW_MAX_NEXUS_OPERATIONS_PER_CALLER`: unset or `200`<br />`DW_MAX_OPERATION_NAME_LENGTH`: unset or `256` |
| Native cannot apply a changed metrics series limit | `DW_METRICS_PROMETHEUS_ACTIVITY_SERIES_LIMIT`: unset or `100`<br />`DW_METRICS_PROMETHEUS_TASK_QUEUE_SERIES_LIMIT`: unset or `100`<br />`DW_METRICS_PROMETHEUS_WORKFLOW_SERIES_LIMIT`: unset or `100`<br />`DW_METRICS_WORKFLOW_TASK_FAILURE_TYPE_LIMIT`: unset or `20` |
| Native cannot apply a changed pending query task cap | `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE`: unset or `1024` |
| Native cannot apply a changed structural limit | `DW_V2_LIMIT_COMMAND_BATCH_SIZE`: unset or `1000` |
| Native cannot apply changed task repair timing | `DW_V2_TASK_REPAIR_FAILURE_BACKOFF_MAX_SECONDS`: unset or `60`<br />`DW_V2_TASK_REPAIR_REDISPATCH_AFTER_SECONDS`: unset or `3`<br />`DW_V2_TASK_REPAIR_SCAN_LIMIT`: unset or `25` |
| Native does not publish package provenance | `DW_EXPOSE_PACKAGE_PROVENANCE`: unset or `false` |
| Native does not report a multi-node declaration | `DW_V2_MULTI_NODE`: unset or `false` |
| Native does not run Workflow 1 workflows | `DW_V1_ENABLED`: unset or `false` |
| Native does not validate worker fleet compatibility | `DW_V2_FLEET_VALIDATION_MODE`: unset or not `fail` |
| Native hands tasks only to polling workers | `DW_TASK_DISPATCH_MODE`: unset or `poll` |
| Native has no external executor configuration | `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`: unset or empty<br />`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`: unset or empty |
| Native has no memo migration recovery mode | `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY`: unset or empty |
| Native has no namespace durable-state limits | `DW_NAMESPACE_DURABLE_HARD_LIMITS`: unset or `{}`<br />`DW_NAMESPACE_DURABLE_LIMITS`: unset or `{}`<br />`DW_NAMESPACE_DURABLE_OVERRIDES`: unset or `{}` |
| Native has no namespace request admission limits | `DW_NAMESPACE_ADMISSION_OVERRIDES`: unset or `{}`<br />`DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS`: unset or empty<br />`DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE`: unset or empty<br />`DW_NAMESPACE_MAX_CONCURRENT_REQUESTS`: unset or empty<br />`DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE`: unset or empty |
| Native has no service boundary policy | `DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT`: unset or `allow`<br />`DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT`: unset or empty<br />`DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE`: unset or empty<br />`DW_SERVICE_BOUNDARY_MAX_IN_FLIGHT`: unset or empty<br />`DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT`: unset or empty<br />`DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES`: unset or `{}`<br />`DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE`: unset or empty<br />`DW_SERVICE_BOUNDARY_RATE_LIMIT_PER_MINUTE`: unset or empty |
| Native has no storage admission file | `DW_STORAGE_ADMISSION_FILE`: unset or empty<br />`DW_STORAGE_ADMISSION_SOURCE`: unset or empty |
| Native has no task admission limits | `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: unset, empty or not a positive number<br />`DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: unset, empty or not a positive number<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE`: unset, empty or not a positive number<br />`DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: unset, empty or not a positive number<br />`DW_TASK_QUEUE_ADMISSION_OVERRIDES`: unset or `{}`<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE`: unset, empty or not a positive number<br />`DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE`: unset, empty or not a positive number<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE`: unset, empty or not a positive number<br />`DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE`: unset, empty or not a positive number |
| Native implements one worker protocol version | `DW_WORKER_PROTOCOL_VERSION`: unset or `1.20` |
| Native never trusts forwarded attribution headers | `DW_TRUST_FORWARDED_ATTRIBUTION_HEADERS`: unset or `false` |
| Native pins runs to registered worker build ids only; it has no server-wide compatibility markers | `DW_V2_COMPATIBILITY_HEARTBEAT_TTL`: unset or `30`<br />`DW_V2_COMPATIBILITY_NAMESPACE`: unset or empty<br />`DW_V2_CURRENT_COMPATIBILITY`: unset or empty<br />`DW_V2_NAMESPACE`: unset or empty<br />`DW_V2_SUPPORTED_COMPATIBILITIES`: unset or empty |
| Native reports no payload codec issues | `DW_SERIALIZER`: unset, empty or `avro` |
| Native runs only as a standalone HTTP server process | `DW_MODE`: unset or `service`<br />`DW_SERVER_PROCESS_CLASS`: unset or not one of `scheduler_node`, `worker_node`<br />`DW_SERVER_TOPOLOGY_SHAPE`: unset or not one of `embedded`, `split_control_execution` |
| Native serves `default` to requests that name no namespace | `DW_DEFAULT_NAMESPACE`: unset or `default` |
| Native stores external payloads only on its local disk | `DW_EXTERNAL_PAYLOAD_S3_BUCKET`: unset or empty |
| Native supports only its token authentication | `DW_AUTH_BACKWARD_COMPATIBLE`: unset or `true`<br />`DW_AUTH_PROVIDER`: unset or empty<br />`DW_PRINCIPAL_TOKENS`: unset or empty |

Native accepts but ignores: `DW_ADMIN_SIGNATURE_KEY`, `DW_AUTH_METHOD_HEADER`, `DW_AUTH_STATUS_HEADER`, `DW_BOOTSTRAP_DELAY_SECONDS`, `DW_BOOTSTRAP_RETRIES`, `DW_CALLER_LABEL_HEADER`, `DW_CALLER_TYPE_HEADER`, `DW_COMPRESSION_ENABLED`, `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT`, `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS`, `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID`, `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT`, `DW_EXTERNAL_PAYLOAD_S3_REGION`, `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY`, `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN`, `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT`, `DW_MAX_HISTORY_EVENTS`, `DW_MAX_TASKS_PER_POLL`, `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST`, `DW_OBSERVABILITY_CONTEXT_ENABLED`, `DW_OPERATOR_SIGNATURE_KEY`, `DW_PACKAGE_PROVENANCE_PATH`, `DW_POLLING_CACHE_PATH`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT`, `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_SIGNATURE_KEY`, `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS`, `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS`, `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS`, `DW_V2_CACHE_VALIDATION_MODE`, `DW_V2_GUARDRAILS_BOOT`, `DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES`, `DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT`, `DW_V2_MATCHING_ROLE_QUEUE_WAKE`, `DW_V2_TASK_DISPATCH_MODE`, `DW_V2_TASK_REPAIR_LOOP_THROTTLE_SECONDS`, `DW_V2_TENANCY_ENVIRONMENT`, `DW_V2_TENANCY_ORGANIZATION`, `DW_V2_TENANCY_PROJECT`, `DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS`, `DW_V2_VALIDATE_CACHE_BACKEND`, `DW_WAKE_SIGNAL_TTL_SECONDS`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT`, `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE`, `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS`, `DW_WORKER_POLL_INTERVAL_MS`, `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS`, `DW_WORKER_SIGNATURE_KEY`.

Native has no server-side task-queue lease or dispatch caps, budget groups,
namespace request admission, namespace durable-state quotas or held-poll caps,
and no native equivalent of them yet. Each native Server process opens at most
four database connections. Query tasks have a fixed bound of 16 pending or
leased tasks per namespace, beyond which new queries are refused with HTTP
`429` and `query_task_queue_full`, as on PHP; it is not configurable. To bound task
concurrency on native, size each SDK worker's slots and the number of workers.
[Task queue admission](/docs/polyglot/task-queue-admission) describes the PHP
2.x controls.

Native authentication differs from PHP 2.x in these ways:

- `DW_AUTH_TOKEN` is required. Native refuses to start without it, and it
  accepts the shared token for every role alongside any role-scoped tokens.
- `DW_AUTH_DRIVER` accepts only `token`. Native refuses `signature`, and a
  release image also refuses `none`. The signature-key settings are ignored.

Native also reads settings outside the PHP contract:

- `DW_BIND_ADDRESS`: the listen address. The binary defaults to
  `127.0.0.1:8080`; the published image sets `0.0.0.0:8080`.
- `DW_RUST_MAINTENANCE_LOOP`: `1` or `true` adds the repair pass (task repair
  and activity timeouts) to the in-process timer and schedule loop. The
  published image sets `1`, because it has no separate scheduler.
- `DW_RUST_EXPERIMENTAL`: required as `1` only by development builds without a
  release version. Release images do not need it.
- `DW_UPGRADE_BACKUP_FINGERPRINT` and `DW_RUST_UPGRADE_QUEUE_*`: inputs to the
  one-way [native takeover](%%artifact.serverTakeoverRunbookUrl%%)
  of a PHP database, qualified on the published 3.0.4 image within the
  runbook's stated scope.
- `DW_V2_LIMIT_HISTORY_TRANSACTION_ROWS` (legacy
  `WORKFLOW_V2_LIMIT_HISTORY_TRANSACTION_ROWS`): honored ahead of its addition
  to the PHP contract.


## How Changes Take Effect

Native 3.x reads its environment only at process start; restart or replace the
Server process to apply a change. The rest of this section describes PHP 2.x.

The published PHP Server image runs `php artisan config:cache` in its
entrypoint. Environment values are resolved at that startup and written to
Laravel's configuration cache. Editing an environment file, changing an
orchestrator's environment declaration, or replacing a mounted configuration
file does not hot-reload a running deployment.

Restart or replace every affected process with the new configuration: HTTP
API replicas, local Laravel queue workers, and scheduler processes. Restart
long-lived SDK workers separately when changing their own client or worker
configuration. A successful API restart does not update a still-running queue
worker or scheduler. Keep the same intended configuration across the roles
that share a database and cache.

During a rolling change, each node enforces its own loaded limits. Shared
admission counters do not make differently configured nodes agree on a limit,
so a request can be accepted on one API replica and refused on another. For a
limit change that must take effect consistently:

1. Pause new caller submissions and drain affected API replicas from ingress.
   Let in-flight requests finish. Stop affected queue and scheduler roles
   gracefully according to their shutdown budgets.
2. Apply the same configuration to every affected role and restart or replace
   them. Let each container's entrypoint rebuild its configuration cache.
3. Check startup logs for configuration errors, verify readiness and exercise
   the changed limit before restoring ingress and caller submissions. See the
   [deployment and readiness guide](/docs/deployment#readiness-contract).

Database-backed operator settings have a different lifecycle. Successful
mutations below are available to subsequent operations without restarting
Server:

| Setting | Live mutation | Scope and limits |
| --- | --- | --- |
| Namespace description and retention | [`PUT /api/namespaces/{namespace}`](/docs/polyglot/server-api-reference#namespace-and-storage), or [`dw namespace:update`](/docs/polyglot/cli-reference#namespace-and-search-attribute-commands) | Retention policy governs later retention passes. Changing it does not restore already-pruned data. See [Server retention](/docs/polyglot/server#retention). |
| Namespace external payload storage policy | [`PUT /api/namespaces/{namespace}/external-storage`](/docs/features/external-payload-storage#configuring-a-namespace) | Changes the stored namespace policy. Provider credentials, configured filesystem disks and other process configuration still require the restart procedure above. Preserve access to objects referenced by existing runs. |
| Namespace search attribute definitions | [`POST` / `DELETE /api/search-attributes`](/docs/polyglot/server-api-reference#schedules-and-search-attributes) | Updates the registration used by subsequent requests. It does not rewrite workflow history or replace environment-configured size and count limits. |

The `DW_*` defaults and caps in this reference remain process configuration
unless a documented control-plane operation explicitly changes stored state.
Server does not poll configuration files for changes.

## How The Contract Is Enforced

The server repository keeps the canonical contract in `config/dw-contract.php`.
Native 3.x runs the equivalent audit at startup, as described in
[Native Server 3.x](#native-server-3x). On PHP 2.x, at container boot,
`php artisan env:audit` warns when it sees unknown `DW_*`
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
| `DW_WORKFLOW_MEMO_MIGRATION_RECOVERY` | unset | One-run MySQL recovery proof for an unrecorded memo rewrite: `raw-json` or `envelope-prefix:<last-converted-id>`. | `WORKFLOW_SERVER_WORKFLOW_MEMO_MIGRATION_RECOVERY` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` | unset | Path to a `durable-workflow.external-executor.config` JSON file for external executor handler mappings. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_PATH` |
| `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` | unset | Overlay name from the external executor config file to apply before server validation and discovery. | `WORKFLOW_SERVER_EXTERNAL_EXECUTOR_CONFIG_OVERLAY` |

## Authentication

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_AUTH_PROVIDER` | unset | PHP 2.x: Laravel-resolvable class implementing `App\Contracts\AuthProvider`. Native 3.x refuses to start when it is set. | `WORKFLOW_SERVER_AUTH_PROVIDER` |
| `DW_AUTH_DRIVER` | `token` | PHP 2.x auth driver: `none`, `token`, or `signature`. Native 3.x accepts only `token`. | `WORKFLOW_SERVER_AUTH_DRIVER` |
| `DW_AUTH_TOKEN` | unset | PHP 2.x: single shared bearer token when no role-scoped token is configured. Native 3.x: required, and accepted for every role. | `WORKFLOW_SERVER_AUTH_TOKEN` |
| `DW_SIGNATURE_KEY` | unset | PHP 2.x: shared HMAC signature key when no role-scoped signature key is configured. Ignored by native 3.x, which has no signature auth. | `WORKFLOW_SERVER_SIGNATURE_KEY` |
| `DW_WORKER_TOKEN` | unset | Bearer token for worker registration, polling, heartbeats, and completions. | `WORKFLOW_SERVER_WORKER_TOKEN` |
| `DW_OPERATOR_TOKEN` | unset | Bearer token for read and operator control-plane actions. | `WORKFLOW_SERVER_OPERATOR_TOKEN` |
| `DW_ADMIN_TOKEN` | unset | Bearer token for namespace, retention, and other administrative mutations. | `WORKFLOW_SERVER_ADMIN_TOKEN` |
| `DW_PRINCIPAL_TOKENS` | unset | PHP 2.x: JSON token map for named bearer-token principals. Each entry supplies `token`, `subject`, `roles`, optional `tenant`, `label`, and non-secret `claims`. Native 3.x refuses to start when it is set. | `WORKFLOW_SERVER_PRINCIPAL_TOKENS` |
| `DW_WORKER_SIGNATURE_KEY` | unset | HMAC key for worker-role requests when using signature auth. | `WORKFLOW_SERVER_WORKER_SIGNATURE_KEY` |
| `DW_OPERATOR_SIGNATURE_KEY` | unset | HMAC key for operator-role requests when using signature auth. | `WORKFLOW_SERVER_OPERATOR_SIGNATURE_KEY` |
| `DW_ADMIN_SIGNATURE_KEY` | unset | HMAC key for admin-role requests when using signature auth. | `WORKFLOW_SERVER_ADMIN_SIGNATURE_KEY` |
| `DW_AUTH_BACKWARD_COMPATIBLE` | `true` | PHP 2.x: honor shared `DW_AUTH_TOKEN` / `DW_SIGNATURE_KEY` as a fallback when a role-scoped credential is missing. Native 3.x always accepts the shared token and refuses to start when this is `false`. | `WORKFLOW_SERVER_AUTH_BACKWARD_COMPATIBLE` |

Use role-scoped credentials for production. On PHP 2.x, `DW_AUTH_DRIVER=none`
is only for local smoke work because every endpoint becomes reachable without a
bearer token or signature; native release images refuse it.

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
| `DW_WORKER_POLL_TIMEOUT` | `30` | Default wait when a poll request omits `timeout_seconds`. SDK-supplied waits override it; this is not their maximum. See [end-to-end timeout budgets](../deployment.md#worker-long-poll-timeout-budgets). | `WORKFLOW_SERVER_WORKER_POLL_TIMEOUT` |
| `DW_WORKER_POLL_INTERVAL_MS` | `1000` | Milliseconds between internal scans while a poll is held open. | `WORKFLOW_SERVER_WORKER_POLL_INTERVAL_MS` |
| `DW_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` | `100` | Milliseconds between wake-signal checks while a poll is held open. | `WORKFLOW_SERVER_WORKER_POLL_SIGNAL_CHECK_INTERVAL_MS` |
| `DW_POLLING_CACHE_PATH` | `storage/framework/cache/server-polling/<APP_ENV>` | Directory for worker-poll coordination state when using file-backed polling cache. | `WORKFLOW_SERVER_POLLING_CACHE_PATH` |
| `DW_WAKE_SIGNAL_TTL_SECONDS` | `max(DW_WORKER_POLL_TIMEOUT + 5, 60)` | TTL for per-queue wake signals that short-circuit a pending poll. | `WORKFLOW_SERVER_WAKE_SIGNAL_TTL_SECONDS` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT` | unset; derived for `PHP_CLI_SERVER_WORKERS` | Optional cap for concurrent held workflow/activity worker long-poll waits on this server node. Query-task polls use a separate wait budget. Native 3.x ignores it; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT` |
| `DW_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` | `2` | PHP CLI server workers reserved for health and control-plane requests when deriving the workflow/activity long-poll wait cap. Native 3.x ignores it; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_RESERVED_HTTP_WORKERS` |
| `DW_MAX_TASKS_PER_POLL` | `1` | Maximum tasks returned per worker poll. | `WORKFLOW_SERVER_MAX_TASKS_PER_POLL` |
| `DW_SQLITE_CLAIM_LOCK_TTL_SECONDS` | `10` | Seconds the SQLite quickstart backend holds the cache-backed worker poll claim gate before the lock expires. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_TTL_SECONDS` |
| `DW_SQLITE_CLAIM_LOCK_WAIT_SECONDS` | `5` | Seconds SQLite worker poll claims wait for the cache-backed claim gate before returning backend lock pressure. | `WORKFLOW_SERVER_SQLITE_CLAIM_LOCK_WAIT_SECONDS` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | unset | Active workflow-task lease cap per namespace/task queue. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | unset | Active workflow-task lease cap across all queues in a namespace. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` | unset | Per-minute workflow-task dispatch cap per namespace/task queue. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | unset | Per-minute workflow-task dispatch cap across a namespace. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` | unset | Active activity-task lease cap per namespace/task queue. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE` |
| `DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` | unset | Active activity-task lease cap across all queues in a namespace. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` | unset | Per-minute activity-task dispatch cap per namespace/task queue. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE` |
| `DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` | unset | Per-minute activity-task dispatch cap across a namespace. Native 3.x refuses to start when it is a positive number; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE` |
| `DW_TASK_QUEUE_ADMISSION_OVERRIDES` | `{}` | JSON overrides keyed by `namespace:task_queue`, `namespace:*`, `task_queue`, or `*` for active leases, dispatch rate, namespace caps, and downstream budget groups. Native 3.x refuses to start unless it is unset or `{}`; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_TASK_QUEUE_ADMISSION_OVERRIDES` |
| `DW_DUE_TIMER_RECOVERY_SCAN_LIMIT` | `5` | Maximum due service-mode timer tasks recovered per worker poll pass. | `WORKFLOW_SERVER_DUE_TIMER_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` | `5` | Maximum expired workflow tasks recovered per pass. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_SCAN_LIMIT` |
| `DW_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` | `5` | Minimum seconds between expired-task recovery passes per queue. | `WORKFLOW_SERVER_EXPIRED_WORKFLOW_TASK_RECOVERY_TTL_SECONDS` |

Sticky execution has no standalone server-image environment variables. See
[Sticky Execution](/docs/features/sticky-execution) for the sticky-cache
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
| `DW_UPDATE_VALIDATION_TIMEOUT` | `10` | Seconds the control plane waits for a synchronous pre-accept update validator result. | `WORKFLOW_SERVER_UPDATE_VALIDATION_TIMEOUT` |
| `DW_UPDATE_VALIDATION_LEASE_TIMEOUT` | `5` | Seconds an update-validation task lease remains owned before a replacement validator-capable worker may retry it. | `WORKFLOW_SERVER_UPDATE_VALIDATION_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TIMEOUT` | `DW_WORKER_POLL_TIMEOUT` | Seconds the control plane waits for a query task response from the worker. | `WORKFLOW_SERVER_QUERY_TASK_TIMEOUT` |
| `DW_QUERY_TASK_LEASE_TIMEOUT` | `DW_WORKFLOW_TASK_TIMEOUT` | Lease timeout for ephemeral query tasks handed to workers. | `WORKFLOW_SERVER_QUERY_TASK_LEASE_TIMEOUT` |
| `DW_QUERY_TASK_TTL_SECONDS` | `180` | How long the server retains query-task result rows before reaping them. | `WORKFLOW_SERVER_QUERY_TASK_TTL_SECONDS` |
| `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` | `1024` | Maximum pending cache-backed query tasks per namespace/task queue before new queries are rejected. Native 3.x refuses any value other than `1024` and applies its own fixed query-task bound instead; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_MAX_PENDING_PER_QUEUE` |
| `DW_QUERY_TASK_POLL_TIMEOUT` | `5` | Maximum seconds each idle query-task worker poll waits before rechecking workflow-task pressure and control-plane availability. | `WORKFLOW_SERVER_QUERY_TASK_POLL_TIMEOUT` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT` | unset; derived for `PHP_CLI_SERVER_WORKERS` | Optional cap for concurrent held idle query-task worker long-poll waits on this server node. Pending query tasks can still be claimed immediately before an idle poll waits. Native 3.x ignores it; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT` |
| `DW_WORKFLOW_TASK_TIMEOUT` | `60` | Default workflow-task lease timeout in seconds. | `WORKFLOW_TASK_TIMEOUT` |
| `DW_ACTIVITY_TASK_TIMEOUT` | `300` | Default activity-task lease timeout in seconds. | `ACTIVITY_TASK_TIMEOUT` |
| `DW_WORKER_STALE_AFTER_SECONDS` | `max(DW_WORKER_HEARTBEAT_INTERVAL_SECONDS * 3, 30)` | Seconds after a worker heartbeat before the worker registration is stale. | `WORKFLOW_SERVER_WORKER_STALE_AFTER_SECONDS` |
| `DW_WORKER_HEARTBEAT_INTERVAL_SECONDS` | `10` | Cadence in seconds advertised to SDKs in worker register and heartbeat acknowledgements. | `WORKFLOW_SERVER_WORKER_HEARTBEAT_INTERVAL_SECONDS` |

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
| `DW_MAX_HISTORY_EVENTS` | `50000` | Has no effect. No Server release reads it and history per run is not capped. Bound long histories with continue-as-new. | `WORKFLOW_MAX_HISTORY_EVENTS` |
| `DW_HISTORY_RETENTION_DAYS` | `30` | Default number of days closed-run history is retained when a namespace does not override it. | `WORKFLOW_HISTORY_RETENTION_DAYS` |
| `DW_MAX_PAYLOAD_BYTES` | `2097152` | Maximum serialized bytes for one payload. | `WORKFLOW_MAX_PAYLOAD_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES` | `67108864` | Maximum encoded size in bytes (64 MiB) accepted by the authenticated external-payload upload and fetch transport. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` | `30` | Client-facing upload and fetch request-timeout budget advertised by the server, in seconds. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_REQUEST_TIMEOUT` |
| `DW_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` | `3600` | Seconds an uploaded external payload may remain unclaimed before its opaque reference expires. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_UPLOAD_EXPIRY` |
| `DW_MAX_MEMO_BYTES` | `262144` | Maximum serialized bytes for a workflow memo. | `WORKFLOW_MAX_MEMO_BYTES` |
| `DW_MAX_SEARCH_ATTRIBUTES` | `100` | Maximum number of search attributes on one workflow. | `WORKFLOW_MAX_SEARCH_ATTRIBUTES` |
| `DW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` | `128` | Maximum byte length for one search-attribute key. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_KEY_LENGTH` |
| `DW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` | `2048` | Maximum byte size for one search-attribute string value. | `WORKFLOW_MAX_SEARCH_ATTRIBUTE_VALUE_BYTES` |
| `DW_MAX_OPERATION_NAME_LENGTH` | `256` | Maximum byte length for a signal, update, or query name. | `WORKFLOW_MAX_OPERATION_NAME_LENGTH` |
| `DW_MAX_PENDING_ACTIVITIES` | `2000` | Maximum pending activities per workflow run before rejecting a command batch. | `WORKFLOW_MAX_PENDING_ACTIVITIES` |
| `DW_MAX_PENDING_CHILDREN` | `2000` | Maximum pending child workflows per run before rejecting a command batch. | `WORKFLOW_MAX_PENDING_CHILDREN` |
| `DW_MAX_NEXUS_OPERATIONS_PER_CALLER` | `200` | Maximum Nexus operations returned per caller from the operations history surface before clients must paginate. | `WORKFLOW_MAX_NEXUS_OPERATIONS_PER_CALLER` |
| `DW_COMPRESSION_ENABLED` | `true` | Enable JSON response compression above the minimum size threshold. | `WORKFLOW_SERVER_COMPRESSION_ENABLED` |

## Server request-boundary limits {#server-request-boundary-limits}

When using the standalone server, a separate set of caps is enforced at the HTTP request boundary before a workflow task, signal, update, or query ever reaches the control plane. These limits fail fast with a `422 validation_failed` (or `413 payload_too_large` for whole-body checks) response so clients learn the rejection reason without the server writing any row to the database.

| Limit | Default | Config key | What it caps |
|---|---|---|---|
| Body size | 2 MiB | `server.limits.max_payload_bytes` | Total HTTP request body bytes, except a workflow-task completion on native Server 3.6.0 or later (next row) |
| Workflow-task completion size | 32 MiB (16 × body size) | derived from `server.limits.max_payload_bytes` | Native Server 3.6.0 or later: a request that completes a workflow task with commands. Each command's arguments still meet the per-payload limit |
| Memo size | 256 KiB | `server.limits.max_memo_bytes` | Serialized memo on `POST /workflows` and `POST /schedules` |
| Search-attribute count | 100 | `server.limits.max_search_attributes` | Registered custom search attributes per namespace |
| Search-attribute key length | 128 bytes | `server.limits.max_search_attribute_key_length` | Length of a single SA key on start |
| Search-attribute value size | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Each string value (and each element of an array value) on start |
| Signal / update / query name | 256 bytes | `server.limits.max_operation_name_length` | URL path segment for signal/update/query names |
| `workflow_id` length | 128 chars | controller validator | Workflow ID on `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 chars | controller validator | String fields on `POST /workflows` |
| `request_id` | 255 chars | controller validator | Deduplication token on signals/updates/cancel/terminate |
| `reason` | 1,000 chars | controller validator | Reason text on cancel/terminate/archive |

Use the documented `DW_*` settings for configurable PHP Server 2.x limits.
Controller-validator bounds are fixed. Native Server 3.x supports the settings
listed in its [implementation notes](#native-server-3x). On native 3.8.0,
`DW_MAX_PAYLOAD_BYTES=0` sets a zero-byte ceiling for ordinary requests and
workflow-task completions, rejecting nonempty bodies. Its operation-name
ceiling is fixed at 256 bytes.

The currently-configured values are published under `limits` on the `GET /api/cluster/info` response, so clients can discover them at runtime:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Validation errors are returned in the standard control-plane error envelope with `reason: "validation_failed"` and a `validation_errors` map keyed by the offending field (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo`, and so on). Payload-size rejections use `reason: "payload_too_large"` and the `413` status code.

### Native worker-command names and IDs {#native-worker-command-name-limits}

Keep native worker commands within these storage-compatible bounds. Lengths
count characters, not UTF-8 bytes. The workflow-ID row is the separate start
API limit; child-call fields have stricter bounds than other commands.

| Field | Maximum characters | Scope |
|---|---|---|
| `workflow_id` | 128 | `POST /api/workflows` |
| `activity_type` | 191 | Activity commands |
| `signal_name` | 191 | `open_signal_wait` |
| `condition_key` / `condition_definition_fingerprint` | 191 | `open_condition_wait` |
| `connection` | 255 | Worker commands |
| `queue` | 255 | Worker commands except `start_child_workflow` |
| `workflow_type` | 255 | `continue_as_new` |
| `workflow_type` / `queue` | 191 | `start_child_workflow` |

Native Server 3.8.0 does not consistently validate these command-name bounds
before writes. SQLite can silently store over-long names; other backends can
return database errors. The [source correction](https://github.com/durable-workflow/server/pull/1186)
adds field-specific `422` refusals before writes, such as
`commands.0.activity_type`, but awaits a qualified published Server release.
The selected stable remains 3.8.0. Review existing activity types and signal
waits longer than 191 characters before upgrading to that corrected release:
new commands using those names will be refused. The remaining identifier
sweep is tracked in [Server #607](https://github.com/durable-workflow/server/issues/607).
The 256-byte HTTP operation-name ceiling above is a separate boundary.

### Workflow-task completion size {#workflow-task-completion-size}

On native Server 3.6.0 and later, a request that completes a workflow task
with commands (`POST /api/worker/workflow-tasks/{id}/complete` and
`POST /api/worker/activity-tasks/{id}/continuation/complete`) may be up to 16
times `max_payload_bytes`: 32 MiB with the default 2 MiB. It follows
`DW_MAX_PAYLOAD_BYTES` and has no setting of its own. Each command's arguments
still meet the per-payload limit inside the completion. PHP Server 2.x and
earlier native releases cap a completion at one payload limit, like any other
request.

A larger completion is refused with `413 payload_too_large` and
`limit_kind: workflow_task_completion_bytes` before anything is recorded.
Replaying the task produces the same commands, so sending the completion again
gets the same refusal. When PHP SDK 3.17.0 or later receives this typed refusal, it does not resend
the completion: the worker fails the run once with a `fail_workflow` command whose message starts
`Structural limit exceeded: workflow_task_completion_bytes:` and names both
sizes, and the Server records the failure with
`failure_category = structural_limit`.

Python SDK 2.17 and Rust SDK 4.15 include handling for the typed refusal.
On Server 3.8.0, an oversized completion can fail at the transport before the
worker receives HTTP 413. In the published Python test, `httpx.ReadError` left
the workflow pending instead of failing structurally. Published-Server
over-limit acceptance remains open under the
[Server response fix](https://github.com/durable-workflow/.github/issues/228#issuecomment-6848969678).
Reduce completion sizes until that path is qualified.

To keep a completion within the limit:

- Split a large fan-out into smaller batches across workflow tasks.
- Move work into child workflows, or continue as new.
- Store large arguments with external payload storage, so the completion
  carries references instead of the payloads.

#### Rust command planning {#rust-completion-planning}

Rust SDK 4.15.0 still uses the ordinary per-payload limit as the aggregate
command-planning ceiling (2 MiB by default), before the Server's larger
completion allowance. Without namespace external payload storage, the
published 300 × 10 KB fan-out is refused with `external_payload_unavailable`;
the worker exits and the run remains pending. Use smaller command batches
while the [SDK aggregate planner fix](https://github.com/durable-workflow/sdk-rust/issues/254)
is pending. This SDK path does not yet implement the larger Server allowance.

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
| `DW_V2_PIN_TO_RECORDED_FINGERPRINT` | `true` | Prefer the recorded workflow definition; see the runtime-specific fallback boundary below. | `WORKFLOW_V2_PIN_TO_RECORDED_FINGERPRINT` |
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

**Released fingerprint preference.** Server 2.9.9 makes the fingerprint
preference effective for service workers. With pinning enabled, a changed
definition may fall back only when no eligible recorded-definition worker
remains and the replacement advertises `workflow_entry_arguments_validation`.
With pinning disabled, the source preference is removed; build pins,
namespace/queue/type isolation, registration identity and strict replay remain.
The accompanying entry safeguards are available from PHP SDK 2.5.4, Python SDK
2.6.2 and Rust SDK 3.5.6. These are minimum feature versions; install current
stable releases for security fixes. Do not assume this behavior on an
older runtime merely because its configuration contains the same key. See
[definition routing](./worker-compatibility-routing.md#definition-fingerprint-evolution).

Use `DW_V2_GUARDRAILS_BOOT` in CI and deployment manifests. The older `WORKFLOW_V2_GUARDRAILS_BOOT` name is retained only so `env:audit` can point alpha-era operators at the rename; the workflow package no longer reads it as a runtime fallback.

Use [Task Matching and Dispatch](/docs/polyglot/task-matching-dispatch)
when you configure `DW_V2_MATCHING_ROLE_QUEUE_WAKE` or a dedicated
`workflow:v2:repair-pass --loop` daemon. Those settings change where
ready-task discovery runs, not the worker-protocol contract itself.

## Additional published PHP controls {#additional-published-php-controls}

This reference covers the published **PHP Server 2.11.0** contract, including the controls below. Check the image you actually run: the independently selected installation version can be older. `unset` means no environment value is supplied; its effect depends on the control. Defaults and aliases come from the [published contract](https://github.com/durable-workflow/server/blob/36d16273604755f3dd0743cab331cc7c62e51d8e/config/dw-contract.php). The versioned contract snapshot is checked against every locale during the documentation build. This reference does not change the selected installation tuple.

### Namespace HTTP admission {#namespace-request-controls}

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_NAMESPACE_MAX_REQUESTS_PER_MINUTE` | `unset` | Optional per-minute control-plane request cap for each namespace. Unset means unlimited. Native 3.x refuses to start when it is non-empty; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_MAX_CONCURRENT_REQUESTS` | `unset` | Optional concurrent control-plane request cap for each namespace. Unset means unlimited. Native 3.x refuses to start when it is non-empty; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` | `unset` | Non-bypassable ceiling for namespace control-plane requests per minute, including namespace overrides. Native 3.x refuses to start when it is non-empty; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_REQUESTS_PER_MINUTE` |
| `DW_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` | `unset` | Non-bypassable ceiling for concurrent namespace control-plane requests, including namespace overrides. Native 3.x refuses to start when it is non-empty; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_HARD_MAX_CONCURRENT_REQUESTS` |
| `DW_NAMESPACE_ADMISSION_OVERRIDES` | `{}` | JSON object keyed by namespace with optional request-rate and concurrent-request overrides. Native 3.x refuses to start unless it is unset or `{}`; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_ADMISSION_OVERRIDES` |

[Namespace request admission](./task-queue-admission.md#namespace-request-admission).

### Namespace durable-state quotas {#namespace-durable-controls}

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_NAMESPACE_DURABLE_LIMITS` | `{}` | JSON object of default per-namespace durable row limits across workflow instances, runs, history, tasks, timers, waits, commands, schedules, workers, and streams. Lifetime and pending/open limits are independent; pending workflow tasks count queued ready rows because active leases have separate admission limits. An empty object is unlimited. Native 3.x refuses to start unless it is unset or `{}`; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_LIMITS` |
| `DW_NAMESPACE_DURABLE_HARD_LIMITS` | `{}` | JSON object of non-bypassable ceilings for the namespace durable row limit fields, including per-namespace overrides. An empty object adds no operator hard ceilings. Native 3.x refuses to start unless it is unset or `{}`; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_HARD_LIMITS` |
| `DW_NAMESPACE_DURABLE_OVERRIDES` | `{}` | JSON object keyed by namespace with optional namespace durable row limit overrides. Hard limits remain authoritative. Native 3.x refuses to start unless it is unset or `{}`; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_NAMESPACE_DURABLE_OVERRIDES` |

[Namespace durable-state quotas](./task-queue-admission.md#namespace-durable-state).

### External payload quotas and S3 transport {#external-payload-quotas-and-s3}

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` | `unset` | Distinct bytes allowed across immutable upload slots for one leased completion; unset uses DW_EXTERNAL_PAYLOAD_MAX_BYTES. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_COMPLETION_MAX_BYTES` |
| `DW_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` | `unset` | Optional cumulative external-payload byte cap for each namespace. Ready and in-progress objects count toward the cap; unset means unlimited. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Optional external-payload object-count cap for each namespace. Ready and in-progress objects count toward the cap; unset means unlimited. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` | `unset` | Non-bypassable cumulative external-payload byte ceiling for each namespace, including namespace overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_BYTES_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` | `unset` | Non-bypassable external-payload object-count ceiling for each namespace, including namespace overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_HARD_MAX_OBJECTS_PER_NAMESPACE` |
| `DW_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` | `{}` | JSON object keyed by namespace with optional max_bytes and max_objects external-payload quota overrides. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_NAMESPACE_OVERRIDES` |
| `DW_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` | `unset` | Optional access-key ID for the runtime-managed S3-compatible external-payload disk. May be omitted when workload identity supplies credentials. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ACCESS_KEY_ID` |
| `DW_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` | `unset` | Optional secret access key for the runtime-managed S3-compatible external-payload disk. Must be set with the access-key ID. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SECRET_ACCESS_KEY` |
| `DW_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` | `unset` | Optional session token for temporary credentials on the runtime-managed S3-compatible external-payload disk. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_SESSION_TOKEN` |
| `DW_EXTERNAL_PAYLOAD_S3_REGION` | `us-east-1` | Region used by the runtime-managed S3-compatible external-payload disk. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_REGION` |
| `DW_EXTERNAL_PAYLOAD_S3_BUCKET` | `unset` | Bucket used by the runtime-managed S3-compatible external-payload disk. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_BUCKET` |
| `DW_EXTERNAL_PAYLOAD_S3_ENDPOINT` | `unset` | Optional HTTPS endpoint for an S3-compatible external-payload service. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_ENDPOINT` |
| `DW_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` | `false` | Use path-style bucket addressing for the runtime-managed S3-compatible external-payload service. | `WORKFLOW_SERVER_EXTERNAL_PAYLOAD_S3_USE_PATH_STYLE_ENDPOINT` |

### Caller-namespace service boundaries {#service-caller-namespace-controls}

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` | `unset` | Optional shared per-minute service-call limit aggregated across each caller namespace. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` | `unset` | Optional shared in-flight service-call limit aggregated across each caller namespace. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` | `unset` | Non-bypassable per-minute ceiling for service-call boundary and caller-namespace policies. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_RATE_LIMIT_PER_MINUTE` |
| `DW_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` | `unset` | Non-bypassable in-flight ceiling for service-call boundary and caller-namespace policies. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_HARD_MAX_IN_FLIGHT` |
| `DW_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` | `{}` | JSON object of caller-namespace service-call rate and in-flight overrides; hard ceilings still apply. | `WORKFLOW_SERVER_SERVICE_BOUNDARY_NAMESPACE_OVERRIDES` |

### Coordination, storage and runtime {#coordination-storage-and-runtime-controls}

| Variable | Default | Purpose | Legacy alias |
| --- | --- | --- | --- |
| `DW_OBSERVABILITY_CONTEXT_ENABLED` | `false` | Enable optional bounded trace context persistence, delivery and capability discovery when its optional API and schema are installed. | - |
| `DW_OBSERVABILITY_BAGGAGE_ALLOWLIST` | `[]` | JSON list of baggage keys permitted on run origins; default empty. Links never carry baggage. | - |
| `DW_STORAGE_ADMISSION_FILE` | `unset` | Optional read-only local storage-pressure observation file; invalid or stale observations fence writes. | - |
| `DW_STORAGE_ADMISSION_SOURCE` | `unset` | Expected storage resource identity in the admission observation. | - |
| `DW_STORAGE_ADMISSION_MAX_AGE_SECONDS` | `15` | Maximum age of a storage observation in seconds (1-300). | - |
| `DW_RUNTIME_CREDENTIALS_ENABLED` | `false` | Enable durable, database-backed, namespace-bound runtime bearer credentials managed through the admin API. | `WORKFLOW_SERVER_RUNTIME_CREDENTIALS_ENABLED` |
| `DW_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Optional per-node cap for concurrent held workflow/activity long-poll waits from one namespace. The effective cap cannot exceed the global worker wait cap. Configured namespace isolation fails closed when shared cache authority is unavailable. Native 3.x ignores it; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_WORKER_LONG_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` | `unset` | Optional per-node cap for concurrent held query-task long-poll waits from one namespace. The effective cap cannot exceed the global query-task wait cap. Configured namespace isolation fails closed when shared cache authority is unavailable. Native 3.x ignores it; see [Native Server 3.x](#native-server-3x). | `WORKFLOW_SERVER_QUERY_TASK_POLL_MAX_CONCURRENT_PER_NAMESPACE` |
| `DW_V1_ENABLED` | `false` | Enable legacy embedded v1 migration and queue-drain behavior. Standalone Server defaults to v2-only; enable only when deliberately preserving v1 state. | `WORKFLOW_V1_ENABLED` |

## Runtime Infrastructure Variables

Runtime infrastructure variables are framework and dependency controls. The
server audit recognizes them so it does not warn, but they are not stable
Durable Workflow API knobs. Native 3.x reads the Database group, including the
TLS settings below. It has no Redis, cache or Laravel queue, writes its logs to
standard error and does not read `LOG_CHANNEL` or `LOG_LEVEL`.

| Group | Variables | Use |
| --- | --- | --- |
| Application | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_VERSION`, locale, timezone, maintenance, and cipher settings | Laravel application runtime identity and boot behavior. |
| Logging | `LOG_CHANNEL`, `LOG_LEVEL`, `LOG_STDERR_FORMATTER`, stack, daily, Slack, and Papertrail settings | Laravel logging destinations, formatting and retention. |
| Database | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SOCKET`, `DB_URL`, `DB_SSLMODE` (`DB_SSL_MODE`), `DB_SSLROOTCERT` (`DB_SSL_ROOT_CERT`), `MYSQL_ATTR_SSL_CA`, charset, collation, and foreign-key settings | SQL state store for workflow, namespace, worker, and projection tables. See [database TLS](#database-tls). |
| Redis/cache/queue | `REDIS_*`, `QUEUE_CONNECTION`, `QUEUE_FAILED_DRIVER`, `CACHE_STORE`, `CACHE_PREFIX`, `SESSION_*` | Queue workers, cache locks, long-poll signaling, and web/session runtime support. |
| Filesystems/mail/broadcasting | `FILESYSTEM_DISK`, `MAIL_*`, `BROADCAST_*`, `PUSHER_*`, `AWS_*` | Framework integrations used by deployment-specific features. |
| Build/runtime | `MYSQL_VERSION`, `REDIS_VERSION`, `PHP_CLI_SERVER_WORKERS`, `VITE_APP_NAME`, `BCRYPT_ROUNDS` | Docker Compose images and framework runtime behavior. |

## Database TLS {#database-tls}

Native 3.x resolves these settings as PHP 2.x does: the same inputs, aliases,
mode names and refusals. It has one Server process to configure, plus any
`schema-upgrade` or takeover command run against the same database. On PHP
2.x, set the same TLS settings on the API server, queue worker,
bootstrap/migration job and scheduler. PostgreSQL defaults to `prefer`; MySQL/MariaDB keep their
connection defaults when no mode is set. Neither default guarantees an
authenticated encrypted connection.

| `DB_SSLMODE` | PostgreSQL | MySQL / MariaDB |
| --- | --- | --- |
| `disable` | No TLS. | No TLS; conflicting TLS options are refused. |
| `allow`, `prefer` | Opportunistic TLS without an encryption or identity guarantee. | Refused. |
| `require` | Encryption required. | Encryption required with mysqlnd and OpenSSL. |
| `verify-ca` | Encryption and a trusted certificate chain required. | Refused: PDO mysqlnd cannot verify only the chain independently of the hostname. |
| `verify-full` | Encryption, trusted chain and matching hostname required. | Encryption, trusted chain and matching hostname required. |

`DB_SSL_MODE` aliases `DB_SSLMODE`; `DB_SSL_ROOT_CERT` aliases
`DB_SSLROOTCERT`. For certificate verification, mount a readable CA bundle at
the configured path in **every role**, including migrations. `MYSQL_ATTR_SSL_CA`
can supply the CA for explicit MySQL/MariaDB `verify-full`. Conflicting
canonical, alias or URL settings refuse startup. Required TLS needs an explicit
TCP hostname; Unix sockets are refused. Explicit MySQL/MariaDB TLS modes need
PDO MySQL with mysqlnd and OpenSSL.

```dotenv
DB_CONNECTION=pgsql
DB_HOST=database.example.com
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/run/database-ca/ca.pem
```

Use the certificate's DNS hostname. With Helm, configure
`externalDatabase.sslMode` and `externalDatabase.tls.existingSecret` / `caKey`.
Create the Secret before installation or upgrade; the chart mounts its CA in
all four roles, including the bootstrap hook. Restart persistent roles after
changing environment settings because configuration is cached at startup.

## Container logs

Native 3.x always writes its logs to standard error. On PHP 2.x, set
`LOG_CHANNEL=stderr` on API, worker and scheduler containers so `docker logs`
or `kubectl logs` can collect application logs. Set it explicitly on existing
releases. Use `LOG_LEVEL` to select the minimum severity. For newline-delimited
JSON, also set:

```dotenv
LOG_STDERR_FORMATTER="Monolog\Formatter\JsonFormatter"
```

Restart persistent roles after changing these settings because configuration is
cached at startup. An explicit file channel needs its own storage and collection;
Kubernetes does not collect `storage/logs/laravel.log` automatically.
`DW_LOG_FORMAT` is not a supported setting.

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
