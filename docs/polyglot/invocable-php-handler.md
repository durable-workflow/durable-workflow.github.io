---
sidebar_position: 5
title: PHP Invocable Activity Handler
description: Use the PHP InvocableActivityHandler helper to host activity handlers behind an HTTPS endpoint that receives external task input envelopes and returns result envelopes.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - invocable activity handler
  - InvocableActivityHandler
  - external task input
  - external task result
  - PHP activity adapter
  - Lambda activity handler
---

# PHP Invocable Activity Handler

The [invocable HTTP carrier](./invocable-carrier.md) lets the server POST a
leased activity task to an HTTPS endpoint instead of waiting for a long-poll
worker. The PHP helper `Workflow\V2\Support\InvocableActivityHandler` is the
reference implementation that an external PHP process uses to turn that
request into a result envelope the server can reconcile.

Use it to wire an activity handler into:

- an AWS Lambda or Google Cloud Function invoked over HTTPS
- a Laravel controller sitting behind a thin HTTP service
- a container exposing one POST endpoint per activity queue

The helper parses the carrier-neutral external task input envelope, looks up
the registered callable, enforces the lease deadline, and emits the
carrier-neutral external task result envelope — including the failure shapes
the server expects.

## Quick Start

Install the Durable Workflow package in the external process, register one
callable per activity handler name, and hand the request body to
`handle()`:

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

The handler receives the input envelope and returns the result envelope.
The carrier contract (HTTPS, POST, auth, timeouts, retry budget) is owned by
the invocable HTTP carrier. The PHP helper owns argument decoding, handler
dispatch, deadline enforcement, result encoding, and the failure taxonomy.

## Registering Handlers

The first constructor argument is a map keyed by the `task.handler` value the
server sends on the input envelope. That value is the `handler` field on the
matching entry in the external executor config:

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

An input with a `task.handler` that is not registered produces a
`failed` result with `failure.kind = application`,
`classification = application_error`, and
`type = UnknownActivityHandler`. The configured activity retry policy still
applies on the server side.

The optional `carrier` name is echoed in `metadata.carrier` on every result
envelope so operators can tell which external runtime produced the response.
Use a stable, redaction-safe identifier (`billing-lambda`,
`ops-cloud-run`, `laravel-admin-api`).

The optional `resultCodec` controls how the helper serializes the return
value into `result.payload.blob`. It defaults to `avro`, which matches the
codec that PHP workers already use for durable payloads. The result codec
must be one the server's `CodecRegistry` knows about; `protobuf` is not
accepted and fails fast in the constructor.

## Result Envelope

On success, `handle()` returns the carrier-neutral success envelope:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

The `task.id`, `task.attempt`, and `task.idempotency_key` fields are copied
from the input envelope so the server can reconcile the result with the
original lease.

On failure, `handle()` returns the failure envelope. The `failure` block
carries the kind, classification, message, originating PHP type, stack
trace, and whether the failure is retryable. A deadline failure also
includes the `deadline` name and `expires_at` value:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## Failure Taxonomy

| `failure.kind` | `classification` | Retryable | When it fires |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | yes | Lease or input deadline already expired when the envelope arrived, or the handler returned after one expired during execution. |
| `decode_failure` | `decode_failure` | no | Arguments could not be decoded with the declared codec, a deadline string was unparseable, the handler raised `TypeError` / `ValueError` on its parameters, or the success payload could not be re-encoded with the configured result codec. |
| `application` | `application_error` | depends on thrown exception | The handler threw. `retryable` is `false` when the thrown exception implements `Workflow\Exceptions\NonRetryableExceptionContract`; otherwise `true`. The message is the exception message and `type` is the exception class. |
| `application` | `application_error` | no | `task.kind` is not `activity_task`, or `task.handler` is not registered in the map. |

The helper never returns a bare exception. Every code path produces a
structured result envelope so the invocable carrier can reconcile the
response deterministically.

## Deadlines And Idempotency

The input envelope carries the active `lease.expires_at` plus the declared
activity deadlines (`schedule_to_start`, `start_to_close`,
`schedule_to_close`, `heartbeat`). The helper checks all of them:

- Before dispatching the handler, any expired deadline short-circuits into a
  `timeout` failure with `details.deadline` naming which field expired. The
  registered callable is not invoked.
- After the handler returns, the helper re-checks the deadlines. A handler
  that ran for longer than its lease produces the same `timeout` failure
  and the return value is dropped from the envelope.

Because the carrier retries transport delivery and the runtime redelivers
leases that were not reported, the same `task.id` and
`task.idempotency_key` can arrive more than once. Handler code must be
idempotent. The idempotency key on every envelope is stable across retries
for the same attempt.

## Payload Codecs And External Storage

Argument payloads arrive on `payloads.arguments` with a `codec` field. The
helper uses the server's `CodecRegistry` to decode them, so the external
process must reference the matching codec implementation (`avro`, `json`,
etc.). A mismatched codec or a malformed blob becomes a
`decode_failure`.

When workflow inputs exceed the configured
[external payload storage](../features/external-payload-storage.md)
threshold, the server stores the bytes in the configured driver and sends
a reference envelope instead of an inline blob. Pass an
`ExternalPayloadStorageDriver` into the constructor so the helper can
resolve references before calling the handler:

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

The driver must satisfy the same contract the server uses to write the
payload so the reference, hash, and codec all match. A reference that the
external process cannot resolve produces a `decode_failure` instead of a
silent empty payload.

## Production Wiring

A Laravel controller that hosts the handler behind a single POST route
looks like this:

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

Route the external executor config at the HTTPS URL that fronts this
controller and declare an `auth_ref` so the route is authenticated. The
loopback HTTP exemption only applies to developer iteration.

## Related Surfaces

- [Invocable HTTP Carrier](./invocable-carrier.md) — the server-side carrier
  contract that delivers input envelopes and reconciles result envelopes.
- [External Execution Surface](./external-execution.md) — the carrier-neutral
  product boundary, including the input and result envelope schemas the
  helper implements.
- [External Payload Storage](../features/external-payload-storage.md) — how
  oversized arguments or results are offloaded to a configured driver and
  represented as a verifiable reference envelope.
- [Worker Protocol](./worker-protocol.md) — the broader worker-plane contract
  that publishes the invocable carrier contract alongside poll-based handler
  shapes.
