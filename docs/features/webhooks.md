---
sidebar_position: 11
---

# Webhooks

The framework provides webhooks that allow external systems to start workflows and send signals dynamically. This feature enables seamless integration with external services, APIs, and automation tools.

## Enabling Webhooks
To enable webhooks, register the webhook routes in your application’s routes file (`routes/web.php` or `routes/api.php`):

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Pass the explicit map of workflow classes you want to expose. Each alias becomes the public route segment, and each workflow class must carry a stable durable type key via `#[Type(...)]` or a registered entry in `workflows.v2.types.workflows`. See the [Explicit Command And Query Webhooks](#explicit-command-and-query-webhooks) section for the full route matrix.

## Visibility Metadata
When you register routes through `Workflow\V2\Webhooks::routes(...)`, the start route also accepts a reserved `visibility` object. Those fields are stored as workflow visibility metadata and are not passed to the workflow `handle()` method.

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` and `visibility.labels` are copied onto the instance, run, run summary, typed start history, selected-run detail, and history export. Waterline can filter list screens by those fields with exact-match query parameters.

`visibility.memo` is copied onto the instance, run, typed start history, selected-run detail, and history export, and later `continueAsNew()` runs inherit the same memo by default. It must be a JSON object at the top level, with nested scalars, `null`, arrays, or objects. `memo` is returned-only metadata, not a list-filter or run-summary search field.

## Webhook Authentication
By default, webhooks don't require authentication, but you can configure one of several strategies in `config/workflows.php`.

**Important:** If webhook URLs are shared with external parties or exposed publicly, enable authentication (token or HMAC signature) to prevent unauthorized access.

### Authentication Methods
It supports:
1. No Authentication (none)
2. Token-based Authentication (token)
3. HMAC Signature Verification (signature)
4. Custom Authentication (custom)

### Token Authentication
For token authentication, webhooks require a valid API token in the request headers. The default header is `Authorization` but you can change this in the configuration settings.

#### Example Request
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### HMAC Signature Authentication
For HMAC authentication, it verifies requests using a secret key. The default header is `X-Signature` but this can also be changed.

#### Example Request
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Custom Authentication
To use a custom authenticator, create a class that implements the `WebhookAuthenticator` interface:

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Then configure it in `config/workflows.php`:

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

The `validate()` method should return the `Request` if valid, or call `abort(401)` if unauthorized.

## Configuring Webhook Routes
By default, webhooks are accessible under `/webhooks`. You can customize the route path in `config/workflows.php`:

```php
'webhooks_route' => 'workflows',
```

After this change, webhooks will be accessible under:
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## Explicit Command And Query Webhooks

Durable start, signal, update, repair, cancel, and terminate commands are exposed over HTTP, plus replay-safe query routes for current-run and selected-run reads.

You register an explicit alias map and route only the workflows you want to expose.

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

When you register a workflow class directly, it must define a stable type key with `#[Type(...)]` or be registered under `workflows.v2.types.workflows`:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

Equivalent config registration:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

The resulting start route is:

```
POST /webhooks/start/order-workflow
```

Example request:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

The `workflow_id` is the opaque public workflow instance id. It is not a run id and should be treated as an opaque string.

Caller-supplied `workflow_id` values must be non-empty URL-safe strings up to 191 characters using only letters, numbers, `.`, `_`, `-`, and `:`. Blank, overlong, or unsupported-character ids are rejected at webhook validation time with HTTP `422`.

The same durable type map is also the current worker fallback when a stored workflow class name drifts after a refactor. If you keep `order-workflow` stable and repoint the config registration to the new class, queued v2 work can still resolve the durable type key even when the original stored PHP class name is no longer loadable.

You can also request explicit duplicate-start behavior:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

Supported `on_duplicate` values are:

- `reject_duplicate`
- `return_existing_active`

All command webhooks return the same JSON envelope:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Accepted response when a new run is created:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Accepted response when the caller requested reuse of the existing active run:

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Rejected duplicate-start response:

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

Response fields:

- `workflow_id` is the public workflow instance id.
- `run_id` is the first active run created by the accepted start command.
- `requested_run_id` is only set when the caller explicitly addressed one selected run.
- `resolved_run_id` is the run the engine actually resolved for this command; for instance-targeted starts it matches `run_id`.
- `command_id` is the durable start-command id.
- `command_source` is `webhook` for the webhook routes.
- instance-targeted signal, update, repair, cancel, and terminate routes resolve the newest durable run for that instance instead of trusting only the mutable current-run pointer, so continue-as-new chains stay addressable through the same public id even if that column drifts.
- run-targeted command routes pin one selected run under the same public instance id and reject with `target_scope = run`, `outcome = rejected_not_current`, and `rejection_reason = selected_run_not_current` if that run is no longer current; in that case `run_id` and `requested_run_id` stay on the historical selection while `resolved_run_id` points at the current run that callers should address next.
- payload keys are matched to the workflow `handle()` parameter names in declaration order.
- `handle()` is the canonical start contract. Older workflows that still implement `execute()` continue to load through the compatibility path, but new code should use `handle()` only.
- mixed `handle()`/`execute()` workflow inheritance is rejected with HTTP `422` validation errors before a run is created.
- missing required payload keys are rejected with HTTP `422` validation errors instead of being silently dropped.
- blank, overlong, or non-route-safe `workflow_id` values are rejected with HTTP `422` validation errors instead of falling through duplicate-start handling.
- invalid `on_duplicate` values are rejected with HTTP `422` validation errors.
- `on_duplicate = return_existing_active` returns HTTP `200` when the current active run is reused.
- duplicate starts that are not reused return HTTP `409` with `outcome = rejected_duplicate`, `command_status = rejected`, and `rejection_reason = instance_already_started`.
- the durable `workflow_commands` row also stores webhook ingress context separately from business arguments, including the caller label, auth method or outcome, request route name, request path, and a request fingerprint derived from the normalized payload plus selected request headers such as `X-Request-Id` and `X-Correlation-Id`

Current HTTP response matrix for the start webhook:

- `202` with `outcome = started_new` when a new run is created
- `200` with `outcome = returned_existing_active` when the existing active run is reused
- `409` with `outcome = rejected_duplicate` when the duplicate start is rejected
- `401` for webhook auth failure
- `404` for an unknown alias
- `422` for payload validation failure


### Signal Command Webhooks

Both instance-targeted and run-targeted signal commands are available:

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` is the public workflow instance id. The instance-targeted route resolves the current active run at apply time. The run-targeted route also takes one selected `runId` and rejects if that selected run is historical. The signal name comes from the route parameter. The request body currently accepts one optional top-level field:

```json
{
  "arguments": ["Taylor"]
}
```

The `arguments` field must be an array. When it is omitted, a workflow waiting with `await('signal-name')` resumes with `true`.
The targeted workflow class must also declare the signal name with `#[Workflow\V2\Attributes\Signal('...')]`; undeclared names are rejected durably instead of being buffered blindly.

Signal example:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

Accepted signal response:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Accepted and rejected signal commands also get one first-class durable `workflow_signal_records` lifecycle row linked back to the originating command. Signal command responses still return the command id as the HTTP correlation id; Waterline selected-run detail and history exports expose the lifecycle row as `signals[*].id`, together with the signal name, `signal_wait_id`, command sequence, workflow sequence once applied, status, outcome, validation errors, and stored arguments.

Rejected response when the instance exists but has not started a run yet:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Rejected response when the current run is already closed:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Rejected response when the route targets an undeclared signal name:

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

Rejected response when a run-targeted signal route addresses a historical run:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Current HTTP response matrix for the signal webhook:

- `202` with `outcome = signal_received` when the signal command is accepted
- `401` for webhook auth failure
- `404` for an unknown workflow instance id
- `404` with `outcome = rejected_unknown_signal` when the workflow does not declare that signal name; when the run already carries a typed `WorkflowStarted` contract snapshot, or when an older `WorkflowStarted` event can be backfilled on first compatible intake, that rejection no longer depends on reflecting the live workflow class first
- `409` with `outcome = rejected_not_started` when the instance has no current run yet
- `409` with `outcome = rejected_not_active` when the targeted current run is already closed
- `409` with `outcome = rejected_not_current` when the run-targeted route addresses a historical selected run
- `422` when `arguments` is present but not an array

### Signal-With-Start Webhooks

One instance-targeted linked-intake route starts a new run or reuses the current active run before recording a signal:

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` is the webhook workflow alias you registered in `Workflow\V2\Webhooks::routes([...])`. `signal` is the durable signal name declared by `#[Signal(...)]`.

The request body combines the normal start fields plus one reserved `signal_arguments` field for the attached signal payload:

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` must be an array. The route defaults `on_duplicate` to `return_existing_active`, and rejects any other duplicate policy value for this linked-intake route.

Accepted response when the route starts a new run:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

When the workflow instance already has an active current run, the same route returns `start_outcome = returned_existing_active` and keeps the signal command as the top-level `command_*` response object. The linked start and signal commands share the same `intake_group_id`, request route metadata, and request correlation headers, and the runtime records both commands in one transaction before the worker can run the first user workflow step.

Selected-run detail and history export freeze that same compound intake under `linked_intakes[*]`. The durable authority is the shared `workflow_commands.context.intake.group_id` plus `mode` recorded on each accepted command row. For the `signal_with_start` mode, the grouped row exposes `start_command_*`, the non-start `primary_command_*`, `complete`, `missing_expected_command_types`, and the ordered nested `commands[*]` snapshots.

If the signal name is unknown or the signal payload fails durable contract validation, the runtime rejects the signal command before creating a new run. In that case the response leaves `run_id`, `start_command_id`, and `start_outcome` as `null`.

Current HTTP response matrix for the signal-with-start webhook:

- `202` with `outcome = signal_received` and `start_outcome = started_new` when the request creates a run and records the signal
- `202` with `outcome = signal_received` and `start_outcome = returned_existing_active` when the request reuses the current active run and records the signal
- `401` for webhook auth failure
- `404` for an unknown webhook workflow alias
- `404` with `outcome = rejected_unknown_signal` when the workflow does not declare that signal name
- `422` with `outcome = rejected_invalid_arguments` when `signal_arguments` is an array but does not satisfy the durable signal contract
- `422` when `signal_arguments` is present but not an array, or when `on_duplicate` is set to any value other than `return_existing_active`

### Query Webhooks

Both instance-targeted and run-targeted query routes are available:

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` is the public workflow instance id. The instance-targeted route resolves the newest durable run for that instance after refresh. The run-targeted route pins one selected `runId`, including historical or already-closed runs, because queries are read-only replay operations.

`query` is the public query target declared by `#[QueryMethod]`. When the workflow definition is still loadable, the route also accepts the underlying PHP method name, but successful responses normalize `query_name` back to the durable public target.

The request body accepts either a positional `arguments` list or a named `arguments` map keyed by the declared query parameters:

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

Unlike the mutating webhook routes, query webhooks do not append a durable command row. They replay the selected run and return a serialized result immediately.

Query example:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

Accepted query response:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

Rejected response when the query arguments do not match the declared contract:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

Rejected response when the selected run's workflow definition can no longer be replayed:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

Current HTTP response matrix for the query webhook:

- `200` with a serialized `result` when the query replay succeeds
- `401` for webhook auth failure
- `404` for an unknown workflow instance id or selected run id
- `409` when the selected instance has not started yet, when the requested query is not declared on that selected run, or when replay is blocked by `blocked_reason = workflow_definition_unavailable`
- `422` when the declared query contract rejects the provided `arguments`

### Update Command Webhooks

Instance-targeted and run-targeted update POST routes plus durable lifecycle lookup routes are available:

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` is the public workflow instance id. `update` is the durable update name declared by `#[UpdateMethod]`. `updateId` is the durable lifecycle id returned by update responses. The instance-targeted POST route resolves the current active run at apply time. The run-targeted POST route also takes one selected `runId` and rejects if that selected run is historical. The instance-targeted GET route reads the stored lifecycle for that workflow instance, while the run-targeted GET route narrows lookup to the selected run.

If you use `#[UpdateMethod('mark-approved')]`, the public webhook target is `mark-approved` even if the underlying PHP method is named differently.

The request body accepts either a positional `arguments` list or a named `arguments` map keyed by the declared update parameters:

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

Set `wait_for` to `accepted` when the caller only needs the durable update command to be accepted and wants the workflow worker to apply the update later:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

When `wait_for` is omitted or set to `completed`, the webhook records the accepted update first, then waits up to the configured completion budget for the workflow worker to apply it. Override that budget per request with `wait_timeout_seconds`:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

If the worker completes within that budget, the webhook returns the normal completed or failed update response. If the wait budget expires first, the webhook returns HTTP `202` with the still-open accepted lifecycle instead of blocking indefinitely. When `wait_for` is `accepted`, the webhook records the command row, the first-class update lifecycle row, and typed `UpdateAccepted` history, then schedules or re-dispatches a workflow task and returns HTTP `202` without waiting for application.

Every update POST and GET response includes the normal command fields plus `update_id`, `update_name`, `update_status`, `workflow_sequence`, `accepted_at`, `applied_at`, `rejected_at`, and `closed_at`. Accepted-but-open lifecycles return `workflow_sequence = null`, `result = null`, `applied_at = null`, `rejected_at = null`, and `closed_at = null` until the worker closes the lifecycle.

When a named map is accepted, the engine normalizes it into the declared parameter order before it appends typed `UpdateAccepted` or `UpdateApplied` history. Optional parameters also fill from their PHP defaults during that normalization step.

Every accepted or rejected update is backed by one durable `workflow_updates` row keyed by `update_id`, so callers can POST once and later GET the stored lifecycle without inferring state from generic command rows.

Update example:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

Completed update response:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Accepted-only update response:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Lifecycle lookup example:

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

Lookup response while the update is still open:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Lookup response after the lifecycle closes:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Lookup routes do not wait for execution. They only read the stored durable lifecycle, so they always return `wait_for = status`, `wait_timed_out = false`, and `wait_timeout_seconds = null`.

When the selected run already has an earlier accepted signal waiting to be applied, the later POST rejects as `rejected_pending_signal` instead of running that workflow task inline on the caller path. Invalid named or positional payloads reject as `rejected_invalid_arguments` with `validation_errors`. Historical run-targeted POST routes reject as `rejected_not_current`.

Current HTTP response matrix for the update POST routes:

- `200` with `outcome = update_completed` when the update command is accepted and completed
- `202` with `update_status = accepted` when `wait_for = accepted` durably accepts the update command and leaves application to the workflow worker
- `202` with `update_status = accepted`, `wait_for = completed`, and `wait_timed_out = true` when the webhook waited up to `wait_timeout_seconds` or the configured default and the worker still had not closed the update lifecycle
- `401` for webhook auth failure
- `404` for an unknown workflow instance id
- `404` with `outcome = rejected_unknown_update` for an unknown durable update name; when the run already carries a typed `WorkflowStarted` contract snapshot, or when an older `WorkflowStarted` event can be backfilled on first compatible intake, that rejection can come from durable run metadata before any live-definition fallback
- `409` with `outcome = rejected_not_started` when the instance has no current run yet
- `409` with `outcome = rejected_not_active` when the current run is already closed
- `409` with `outcome = rejected_not_current` when the run-targeted route addresses a historical selected run
- `409` with `outcome = rejected_pending_signal` when an earlier accepted signal still has to be applied before the update can run
- `422` with `outcome = rejected_invalid_arguments` when the update payload is an array but does not satisfy the declared update contract, including missing arguments, unknown arguments, type mismatches, or nullability violations
- `422` with `outcome = update_failed` when the update body throws
- `422` when `arguments` is present but not an array; that request-shape failure is rejected before a durable command row is created

Current HTTP response matrix for the update GET lookup routes:

- `200` once the lifecycle is closed and `update_status` is `completed`, `failed`, or `rejected`
- `202` while `update_status = accepted`
- `401` for webhook auth failure
- `404` for an unknown workflow instance id, selected run id, or `update_id` within the requested scope

### Repair And Terminal Command Webhooks

Both instance-targeted and run-targeted repair and terminal command routes are available:

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

`workflowId` here is the public workflow instance id. The instance routes always resolve the current active run. The run routes also take one selected `runId` and reject historical selections with the durable `rejected_not_current` outcome. The same `workflows.webhook_auth` configuration used by the start route also applies to these terminal command routes.

Repair example:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

Cancel example:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

Terminate example:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

Accepted repair response when the runtime restores durable progress for the current run:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Accepted repair response when the current run already has a healthy durable resume path:

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Accepted cancel response:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Accepted terminate response:

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Rejected response when the instance exists but has not started a run yet:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Rejected response when the current run is already closed:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Rejected response when a run-targeted repair, cancel, or terminate route addresses a historical run:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Current HTTP response matrix for the repair, cancel, and terminate webhooks:

- `200` with `outcome = repair_dispatched` when repair re-dispatches an overdue ready task, reclaims an expired lease, or recreates a missing durable task that has not started running yet, including accepted-update and accepted-signal workflow application tasks whose rows were lost before the command could be applied
- `200` with `outcome = repair_not_needed` when the run already has a healthy durable resume path or when the selected run is already inside an in-flight activity with no task row
- `200` with `outcome = cancelled` or `outcome = terminated` when the current run is closed successfully
- `401` for webhook auth failure
- `404` for an unknown workflow instance id
- `409` with `outcome = rejected_not_started` when the instance has no current run yet
- `409` with `outcome = rejected_not_active` when the current run is already closed
- `409` with `outcome = rejected_not_current` when the run-targeted route addresses a historical selected run

### Describe Webhooks

Both instance-targeted and run-targeted describe routes are available for inspecting workflow state over HTTP:

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` is the public workflow instance id. The instance-targeted route returns the current run's state. The run-targeted route describes a specific run by id, including historical or already-closed runs.

Describe is a read-only inspection operation. It does not create a durable command row and does not replay the workflow. It returns instance metadata, current or selected run state, summary fields, and action availability from committed projection data.

Describe example:

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

Response for an active workflow:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

Response for a terminated workflow:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

Action availability reflects whether the operation can succeed right now: closed runs cannot accept commands, remote-only workflows cannot serve queries or updates locally, and non-current runs cannot receive signals, updates, cancellations, or terminations.

Run-targeted describe example:

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

The run-targeted response includes the same payload but `is_current_run` will be `false` when the selected run is historical, and all mutating actions will show `false`.

Response when the instance is not found:

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

Response when the instance exists but the selected run is not found:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

Current HTTP response matrix for the describe webhooks:

- `200` when the instance is found, whether the run is active, closed, or historical
- `200` when the instance is found but the selected run does not exist (`reason = run_not_found`)
- `401` for webhook auth failure
- `404` when the workflow instance id does not exist (`reason = instance_not_found`)


### Control-Plane Start Webhook

A control-plane start route accepts a durable workflow type key directly, without requiring the workflow class to be locally resolvable. This is the preferred start path for an external consumer that drives workflows through type keys rather than PHP class aliases.

```text
POST /webhooks/control-plane/start
```

The request body accepts:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `workflow_type` | string | yes | Durable workflow type key |
| `instance_id` | string | no | Caller-supplied public workflow instance id |
| `arguments` | string | no | Codec-tagged serialized arguments |
| `connection` | string | no | Queue connection override |
| `queue` | string | no | Queue name override |
| `business_key` | string | no | Caller-supplied business key |
| `labels` | object | no | Visibility labels |
| `memo` | object | no | Non-indexed metadata |
| `duplicate_start_policy` | string | no | `reject_duplicate` or `return_existing_active` |

Example request:

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

Response for a newly started workflow:

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

When `instance_id` is omitted, the engine generates a ULID-based instance id automatically.

When the workflow type key maps to a locally resolvable class through `workflows.v2.types.workflows` config or a `#[Type(...)]` attribute, the full command-contract snapshot and routing are applied at start time. When the class is not locally available, the instance is created with the type key and explicit routing from options; the command-contract snapshot and definition fingerprint are deferred to the worker that claims the first task. This means an external consumer can start workflows for type keys that only the worker fleet can resolve.

Current HTTP response matrix for the control-plane start webhook:

- `202` with `outcome = started_new` when a new run is created
- `200` with `outcome = returned_existing_active` when the existing active run is reused
- `409` with `outcome = rejected_duplicate` when the duplicate start is rejected
- `401` for webhook auth failure
- `422` when `workflow_type` is missing or `instance_id` is invalid

The `WorkflowControlPlane` contract is also available as a container-resolvable singleton for programmatic use. Resolve `Workflow\V2\Contracts\WorkflowControlPlane` from the Laravel container to call `start()`, `signal()`, `query()`, `update()`, `cancel()`, `terminate()`, and `describe()` directly from PHP code, tests, or Artisan commands.

The webhook system covers explicit alias-based start intake plus both instance-targeted and run-targeted signal, update, query, describe, repair, cancel, and terminate command webhooks, task poll routes for workflow and activity tasks, and a control-plane start route for type-key-based workflow creation.
