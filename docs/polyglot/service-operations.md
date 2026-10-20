---
title: Cross-namespace service calls
description: Publish a service operation and call it durably from another namespace.
---

# Cross-namespace service calls {#cross-namespace-service-calls}

A service operation, also called a Nexus operation, is the supported durable
call between namespaces in one Durable Workflow cluster. It is addressed by
the target namespace and an endpoint/service/operation triple. A child workflow
or ordinary signal stays within its namespace. Neither a queue name nor a
different language changes that rule.

## Choose a supported authoring surface {#choose-a-supported-authoring-surface}

| Caller | Published surface | Target namespace |
| --- | --- | --- |
| Embedded PHP | `Workflow::serviceOperation()` or the `serviceOperation()` helper | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | Array option `['namespace' => 'billing']` |
| Python SDK | `yield context.call_nexus_service(...)` | Keyword `target_namespace='billing'` |
| Rust SDK | Authored Nexus waits are not published | Tracked in [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86). A held draft is not installed support. |

Use the [embedded example](../features/service-operations.md) for a Laravel
workflow, the [PHP SDK service-call example](https://php.durable-workflow.com/build/workflows-activities/)
for its straight-line worker API, or the [Python workflow reference](https://python.durable-workflow.com/reference/workflow/)
for generator-based authoring. Discover the connected runtime's advertised
service-operation contract before deploying a caller. A client management API
alone does not prove workflow-worker support.

The PHP SDK's array option is currently the cross-namespace authoring path.
An equivalent typed option is tracked in [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193).

## Publish the target operation {#publish-the-target-operation}

The target namespace owns the endpoint, service, operation and handler worker.
Create the namespace first and run a worker that registers the target workflow
type on its selected queue. The following catalog uses target namespace
`billing`, workflow type `billing.invoice` and queue `billing`.

Catalog mutations require an admin credential. The runtime enforces caller
authority separately when a leased workflow emits its service command.

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

The catalog names are normalized to lowercase. Endpoint and service records
organize the operation; they do not replace its real handler. Keep a compatible
worker available in the target namespace. Registration does not prove that work
has executed.

## Waiting and recorded results {#waiting-and-recorded-results}

The PHP SDK defaults to `mode_override=sync` and `wait_for=completed`. Python
uses `mode='sync'` and `wait_for='completed'`. Both suspend until the service
reaches a durable terminal outcome and replay that recorded result or typed
failure at the original call. A pending or started call is not a successful
business result.

For admission-only behavior, PHP uses `wait_for='accepted'` or
`mode_override='async'`; Python supports `wait_for='accepted'` or
`mode='async'` and the `start_nexus_operation()` helper. Preserve the returned
call id for inspection. A later completion does not replace the caller's
original recorded admission. Choose completion waiting when workflow decisions
need the target result.

Bound service execution with the catalog's `deadline_policy`, as above. It
accepts exactly one positive integer `timeout_seconds` or an offset-bearing
RFC3339 `deadline_at`. The runtime records one `call_deadline_at` from original
acceptance. Replay, retries and later catalog edits cannot reset it. A null
policy does not create a new service deadline.

Do not use the caller's `wait_timeout_seconds` as an execution timeout. A
one-second waiting option with no catalog deadline can still deliver a target
that completes after three seconds. Inspect the original call and linked
target after a timeout; expiration does not prove that external effects did
not happen, and target cancellation is a separate policy.

## Failures, retries and idempotency {#failures-retries-and-idempotency}

PHP exposes terminal service outcomes through `ServiceOperationFailed`;
Python raises `NexusOperationFailed` at the yield point. Keep typed failure
details and the call id when handling an error. Expected business failures may
be handled by workflow code; unexpected ones can remain workflow failures.

The runtime owns the recorded service retry policy. Do not add a second HTTP
retry loop inside workflow code. PHP and Python derive stable keys for normal
workflow calls. If the application supplies a key, keep the same target,
request and intended operation for retries and replay. A new key is a new
business request, not recovery of a lost acknowledgment.

Keep target namespace, catalog triple, payload and waiting options stable for
open histories. Use a workflow version branch when that durable intent changes.

## Enforce the namespace boundary {#enforce-the-namespace-boundary}

The cross-namespace default is `allow`. Authentication, role checks, other
boundary policies and namespace authorization still
apply. Caller identity comes from the leased workflow; application input cannot
impersonate a different caller namespace.

For a self-hosted PHP Server that should refuse cross-namespace service calls,
configure and restart its API/worker roles consistently:

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

The policy refuses the cross-namespace call before handler dispatch. Same-
namespace calls and other boundary policies still need their own review.
Do not treat this variable as a replacement for credentials or tenant ACLs.

## Inspect the original call {#inspect-the-original-call}

Use the [service-call detail and catalog API](./server-api-reference.md#service-catalog-admin-apis)
or [CLI service-call inspection](./cli-reference.md#service-call-inspection).
Keep the caller workflow/run and target service-call ids together. Read-only
inspection does not request another execution. Reuse the original id when
checking a lost response or worker replacement.
