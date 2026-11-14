---
sidebar_position: 9
title: PHP SDK
description: Connect framework-neutral PHP applications and remote workers to a self-hosted Server or Cloud managed runtime.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Durable Workflow PHP SDK
  - PHP remote worker
  - PHP standalone server client
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# PHP SDK

Use `durable-workflow/sdk` when a PHP application or remote worker connects to
the standalone Durable Workflow Server or a Durable Workflow Cloud namespace
runtime URL. This first-party SDK is framework-neutral: it provides the
control-plane client, authentication, transport, public payload codec, replay
handler, and managed remote-worker lifecycle without requiring Laravel or the
embedded engine package.

## Try the local Sample App playground

For the shortest no-Cloud authoring journey, open the current Sample App
[`main` branch in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
and run:

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

The local playground generates caller-owned workflow and activity source,
selects the current stable artifacts, and starts the published
Server and Waterline. It waits for a worker registration whose identity,
workflow type, activity type, and task queue match the generated contract before
starting the workflow. Success requires the expected completed result and
history; the terminal then prints the exact local Waterline run link and the
path to structured JSON evidence.

The package-owned quickstart and API reference below remain the direct path for
users who want to add the SDK to an existing project without Sample App.

<ProductPromotion source="docs-v2-php-sdk">
Run PHP clients and workers against a Cloud-managed namespace with separate
role-scoped credentials.
</ProductPromotion>

For step-by-step onboarding, framework paths, testing, deployment, and
troubleshooting, use the authored
[PHP developer portal](https://php.durable-workflow.com/). For exact
constructor signatures, return types, and exception classes, use its distinct
[generated API reference](https://php.durable-workflow.com/api/). The portal's
[machine-readable contract](https://php.durable-workflow.com/quickstart-contract.json)
identifies the package, runtime forms, role credentials, shipped source files,
expected result, and published-artifact smoke as one tested path.

Cloud customers use the runtime URL and namespace returned during provisioning,
with separate client and worker credentials. See
[Cloud Managed Runtime](/docs/polyglot/cloud-control-plane) for that
connection boundary; the examples below show the same SDK against local
self-hosted values.

Use `durable-workflow/workflow` for the separate embedded Laravel path, where
the application owns workflow state in its existing database and executes work
through its Laravel queues. See [Deployment Modes](/docs/polyglot/deployment-modes/)
for the complete ownership comparison.

## Requirements

- PHP 8.1 or later for the framework-neutral SDK
- For the Laravel service-mode bridge in PHP SDK 3.10 and later: PHP 8.2 or
  later and Laravel 12.69 or later in 12.x, or Laravel 13.30 or later in 13.x
  with PHP 8.3 or later
- A reachable [self-hosted Server](/docs/polyglot/server/) or provisioned
  [Cloud namespace runtime](/docs/polyglot/cloud-control-plane)

## Install

Install the current published PHP SDK. The exact requirement below is generated
from the registry-refreshed published-artifact authority, and Composer records
the resolved package in `composer.lock`:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

The SDK uses the official `apache/avro` Composer package for the public payload
envelope. Its production dependency graph excludes Laravel, Illuminate,
`durable-workflow/workflow`, and `durable-workflow/server`.

## Start and inspect a workflow

The SDK-owned quickstart creates a clean Composer project, defines one
attributed workflow and activity, starts the worker, starts a unique workflow,
and waits for the result. The same shipped `bootstrap.php`, `worker.php`, and
`client.php` files are installed from the package and executed by the protected
published-artifact smoke, so this page does not maintain a second code listing.

Choose only the runtime connection value:

| Runtime | Value passed to `Client` | SDK request path behavior |
| --- | --- | --- |
| Self-hosted Server | Bare origin such as `http://localhost:8080` | Adds one `/api` segment; callers do not append `/api`. |
| Durable Workflow Cloud | Complete provisioned URI such as `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Preserves the namespace runtime path and appends endpoint `/api` after it. |

Open the [tested PHP path](https://php.durable-workflow.com/) for the exact
commands and visible source. Client operations read
`DURABLE_WORKFLOW_CLIENT_TOKEN`; worker polling reads
`DURABLE_WORKFLOW_WORKER_TOKEN`. The guide keeps those credentials in separate
processes without echoing or committing either value.

`Worker::register()` discovers `#[Workflow]` and `#[Activity]` handlers in the
same source file. The guide also documents the direct
`registerWorkflow()`/`registerActivity()` alternative for callable-first code.
The bootstrap removes autoloader-path selection from users when those shipped
files run in a standalone project, SDK checkout, installed package, or a
playground/container that places them beside its Composer `vendor/` directory.

`WorkflowHandle` follows the current run after a continue-as-new transition.
Use its selected-run methods when an operation must remain guarded to one
specific run.

## Lifecycle, updates, schedules, and visibility

The current public client is broader than selected-run result handling:

- `WorkflowHandle` exposes `describe`, `result`, `signal`, `query`, `cancel`,
  and `terminate`, with selected-run variants for run-specific safety.
- `Client` exposes `listWorkflows` with server filtering and pagination,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow`, and
  `terminateWorkflow`.
- `requestCancellation()` requests bounded cleanup from cooperating workers.
  Existing `cancel()` and `cancelWorkflow()` close the run immediately. See
  [cooperative cancellation](/docs/polyglot/cancellation) for the authoring and
  recovery contract.
- Schedule methods cover create, describe, list, update, pause, resume,
  trigger, backfill, and delete.
- Operational visibility includes `listNamespaces`, `listWorkers`, and
  `listTaskQueues`, with matching describe methods.

Remote workers register workflow, activity, query, and update handlers through
`registerWorkflow`, `registerActivity`, `registerQuery`, and `registerUpdate`.
Use the generated [PHP SDK API reference](https://php.durable-workflow.com/api/)
for complete parameters and return types.

## Activity retry context and owning run {#activity-retry-context}

PHP SDK **3.6.1 or later** exposes `$context->retryInfo`, `$context->workflowId` and `$context->runId` in service-mode activities. Check `$context->retryInfo->isLastConfiguredAttempt() === true` for the final configured attempt of a bounded policy. `attemptNumber` preserves the original received attempt number.

The retry snapshot preserves three distinct states: `policyProvided === false` means the claim omitted the policy; a provided root `null` is unknown legacy policy; an object with explicit `max_attempts: null` means unlimited. `maxAttempts()` returning `null` alone does not establish unlimited retries. The SDK does not invent a default budget. Cancellation, non-retryable failure, workflow closure and elapsed deadlines can end execution before the budget is exhausted.

The workflow and run IDs identify the original owning run. Missing legacy identity stays `null`. Local activities retain known parent IDs without inheriting a remote retry policy. To signal the owning workflow, require both IDs, pin the signal to `runId` and reuse a stable business-event request ID across retries.

Keep signal processing idempotent for the business event. A stable request ID alone does not establish once-only signal admission.

See the [complete final-attempt and own-run signal examples](https://php.durable-workflow.com/build/workflows-activities/) in the PHP SDK guide.

## Activity heartbeats {#activity-heartbeats}

For remote activities, call `ActivityContext::heartbeat($details)` during bounded work, well before the configured heartbeat timeout. The first window starts at runtime claim, not when PHP receives the task. Request latency, pauses and transport retries consume that window. Follow the [cadence guidance](../features/heartbeats.md#heartbeat-cadence-and-receipts).

The method returns `void`. In the direct handler path, a stop reply raises `ActivityCancelled`. HTTP and transport failures from `Client::heartbeatActivityTask()` surface as `ServerException`. A cooperatively supervised worker can stop or abandon its callback when a heartbeat or ownership check fails instead of delivering a normal response to activity code. Do not assume cleanup code always runs. Do not suppress a failure after losing the claim or submit success after losing authority.

A returned call does not commit external work or provide a resumable checkpoint. Keep external effects idempotent and do not treat a transport retry as a fresh heartbeat window.

## Run a remote PHP worker

Workflow handlers are ordinary callables that run as straight-line code inside
a managed Fiber. Call operations such as `WorkflowContext::activity()`
directly; the SDK suspends the Fiber at durable decisions and returns recorded
results during replay without repeating external activity. Do not declare a
workflow as a Generator or yield `WorkflowContext` commands: Generator results
are rejected. The managed worker registers its workflow and activity type
names, polls the public worker protocol, heartbeats, completes or fails tasks,
and handles graceful shutdown when `pcntl` is available.

### First-completion selection

Use `WorkflowContext::select()` to start independent deferred activities,
child workflows, timers, condition waits, or nested ordinary barriers and
resume from the first durably committed winner. The returned `SelectionResult`
contains stable member keys and identities plus one handle per member:

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

Selection does not cancel non-winners. Call `await()` on a handle to consume
its eventual result or `cancel()` to record explicit cancellation. A cold worker
or completed-history replay consumes the recorded winner even when duplicate or
later input and terminal events appear in another delivery order.
`cancel()` returns void and does not report its terminal outcome. Only
`SelectionOperationCancelled` history proves cancellation won; replay advances
past an unmarked cancel request, and if the operation completed first,
`await()` still returns that result.

### Durations {#durations}

From PHP SDK 3.9.0, workflow timers and timeouts take the same duration forms as
the embedded Laravel package. `sleep()`, `deferTimer()`, the `timeout` of
`waitCondition()` and `deferCondition()`, the activity timeout options, the
child workflow `execution_timeout_seconds` and `run_timeout_seconds` options and
the service operation `wait_timeout_seconds` option accept int or float
seconds, a string such as `'30 minutes'`, or a `DateInterval` or
`CarbonInterval`:

```php
use Carbon\CarbonInterval;

$verified = $ctx->waitCondition(
    static fn (): bool => $ctx->signals('verify') !== [],
    key: 'email-verified',
    timeout: '30 minutes',
);

$ctx->sleep(CarbonInterval::hours(2));

$receipt = $ctx->activity('payments.capture', [$orderId], [
    'start_to_close_timeout' => '30 seconds',
    'schedule_to_close_timeout' => '10 minutes',
]);
```

Each value converts once to whole seconds, rounding up, so `'30 minutes'`,
`1800` and `CarbonInterval::minutes(30)` record the same history. Strings
convert exactly as the embedded `timer()` and `await()` do. The SDK rejects
ISO 8601 strings such as `'PT30M'` (pass `new DateInterval('PT30M')` instead),
negative values, fractions of a month or a longer calendar unit, parts with more
than 15 integer digits, and unparseable text. A numeric string such as `'30'` keeps its
earlier meaning: timers and condition timeouts round it up to whole seconds,
and activity and child workflow options pass it through unchanged. A zero
duration is valid for timers, condition waits and `wait_timeout_seconds`;
activity and child workflow timeouts need at least one second. Earlier SDK
releases accept seconds only. PHP SDK 3.9.0 adds `nesbot/carbon`
(`^2.72.6|^3.8.4`) as a required dependency, so durations convert with the
same parser as the embedded package.
The [PHP SDK duration reference](https://php.durable-workflow.com/build/workflows-activities/#durations)
lists every unit.

## Entry compatibility and recovery {#entry-compatibility-and-recovery}

**Released support.** PHP SDK 2.5.4 introduced the entry safeguard below, with routing and recovery support in Server 2.9.9. These are minimum feature versions; install current stable releases for security fixes.

The managed worker checks the handler's recorded positional input before entering its Fiber. Missing required arguments or incompatible declared PHP types raise `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` and report the task reason `workflow_entry_arguments_mismatch`. Optional defaults apply only to omitted input; they never replace an incompatible recorded value. A `TypeError` thrown after successful entry remains an application failure.

The worker advertises `workflow_entry_arguments_validation` automatically. With the matching Server support, a refused task is replay-blocked and the original run stays nonterminal. An older runtime may instead retry the failed task, so an SDK upgrade alone does not establish the complete recovery contract.

Inspect the original with `Client::describeWorkflow($workflowId, $runId)` and the selected-run debug endpoint. Restore compatible code before calling `Client::repairWorkflow($workflowId, $runId)`, then verify that same run resumes without changing input, history, routing identity or deadlines. Do not catch this failure inside the workflow body or repeatedly repair incompatible code. See the [service recovery procedure](../failures-and-recovery.md#service-entry-recovery) and [definition routing](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Framework service mode and embedded Laravel

The same package ships first-party
[Laravel service-mode](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
and
[Symfony service-mode](https://github.com/durable-workflow/sdk-php#symfony-service-mode)
bridges. They retain framework dependency injection, configuration, logging,
console workers, and test fakes while connecting to Cloud or Server.

Those bridges are distinct from
[embedded Laravel workflows](/docs/installation/), where
`durable-workflow/workflow` makes the Laravel application itself own durable
state and execute through Laravel queues. See
[Laravel Adoption and Runtime Transition](/docs/laravel-adoption/) for the
same representative Laravel use case across v1, v2 embedded, and this shipped
service-mode bridge, including drain and rollback. Use
[Deployment Modes](/docs/polyglot/deployment-modes/) for the wider runtime
boundary comparison.

## Query results with binary values {#query-binary-results}

PHP SDK 3.18.2 fixes query completion for valid Avro results containing nested
`AvroBinaryValue` bytes. The `result_envelope` remains authoritative. The SDK
omits only the optional plain `result` projection when it cannot be JSON
encoded; ordinary JSON-compatible results keep that projection.

[Published PHP 3.18.2 / native Server 3.9.1 installed controls](https://github.com/durable-workflow/sdk-php/pull/415#issuecomment-6858062312)
(PHP 8.3.36, linux/amd64, SQLite) verify an actual Worker round-trip for nested
binary bytes, ordinary JSON, signed zero and `null`, plus workflow completion
and graceful Worker deregistration. This is a compatible query fix; it does
not add a capability or establish full request-key or timeout-cleanup support.
See the [PHP query guide](https://php.durable-workflow.com/build/messages/#register-a-read-only-query).

## Read an accepted update later {#read-an-update-outcome}

The selected PHP SDK %%artifact.publishedPhpSdkVersion%% supports reading a retained update by its stable ID
without admitting it again. `Client::updateOutcome($workflowId, $updateId)`
defaults to `waitFor: 'completed'`: pending work throws `UpdateStillPending`;
a completed result may legitimately be `null`. `updateOutcomeReceipt()` defaults
to `waitFor: 'accepted'` and returns the Server receipt so callers can inspect
`update_status` and `wait_timed_out` separately from a completed result.

These GET reads require the `update_outcome_reads` capability (native Server
3.6.0 and later). Without it, the SDK throws `LogicException` and does not
resubmit the update. An initial `updateWorkflow()` pending exception retains
the caller's request ID. A pending GET read retains `updateId`, but its original
request key may be unavailable: `$pending->requestId` is then `''`, meaning
unknown. Continue reading with that update ID; never submit an empty, inferred
or internal hashed key as the original request ID.

The [published PHP guide](https://php.durable-workflow.com/build/messages/#apply-a-tracked-update)
shows the workflow-side handler and client journey. [Installed PHP 3.18.1 /
native Server 3.9.1 controls](https://github.com/durable-workflow/sdk-php/pull/411#issuecomment-6855609359)
verify pending-to-completed-null reads without a second update admission, plus
[completion-size handling](./server-config-reference.md#workflow-task-completion-size).
This evidence does not establish full request-key acceptance under shared #216
or native timeout-cleanup support.

## Upgrade to PHP SDK 3.12 through 3.14 {#upgrade-to-3-12-through-3-14}

PHP `^8.1`, the Laravel bridge floors, worker protocol `1.20` and control plane
`2` are unchanged from 3.11. Check these behavior changes before deploying:

- **Updates that outlast their wait.** From 3.13, when a
  `waitFor: 'completed'` update wait ends before the update finishes,
  `Client::updateWorkflow()` and `WorkflowHandle::update()` throw
  `UpdateStillPending`. Earlier releases returned the Server receipt as if it
  were the update's result. To keep waiting, call the update again with
  `$pending->requestId`. That does not apply the update twice.
- **Stale worker registration.** From 3.13, `Worker::run()` registers again
  after `stale_worker_registration` instead of stopping. Tasks the fenced
  worker held are dropped without completing, and the Server redelivers them.
  Each recovery logs `worker.reregistered` and increments
  `durable_workflow_worker_reregistrations`. Pass
  `stopOnStaleRegistration: true` to keep the old behavior.
- **Local activity backoff.** From 3.13, a local activity with more retries
  than `backoff_seconds` entries repeats the last delay instead of retrying
  immediately, as Server-scheduled activities do.
- **Condition waits in groups on native Server.** Native Server doesn't accept
  a condition or signal wait inside `all()` or `parallel()` yet. From 3.13.1,
  the worker fails that workflow task with `grouped_condition_wait_unsupported`
  and keeps running, instead of exiting. Await the condition outside the group.

New in these releases:

- **Sticky history suffixes (3.14).** Workers advertise
  `sticky_history_suffix`. On Server 3.5.0 or later, a worker that already
  holds a run's history receives only the events after the sequence it cached.
  A suffix that doesn't continue the cached history exactly is dropped and the
  full history is fetched. Older Servers keep sending full history.
- **Schedule origin (3.13).** `WorkflowContext::scheduleOrigin()` returns the
  schedule id, occurrence time and trigger number of the schedule fire that
  started the run, or `null` for an ordinary start. The value is the same on
  replay. From Server 3.5.0, a run that continues as new keeps its schedule
  origin.
- **Activity continuations (3.12).** Pass `enableActivityContinuation: true` to
  the `Worker` constructor to submit the next workflow commands together with a
  successful activity result when the Server advertises
  `activity_workflow_continuation` (native Server 3.4.0 or later). It defaults
  to `false`. Turning it on currently costs throughput: in our benchmark under
  load, workflows ran 24–49% slower with it on and used twice as many database
  transactions ([measurement](https://github.com/durable-workflow/server/issues/1078)). Use 3.12.1 or later if you enable it, and drain or disable
  opted-in workers before downgrading the Server or adding older Server nodes.

See the [3.14.0 changelog](https://github.com/durable-workflow/sdk-php/blob/3.14.0/CHANGELOG.md)
for the complete list.

## Upgrade to PHP SDK 3.10 and 3.11 {#upgrade-to-3-10-and-3-11}

Read the [PHP SDK upgrade guide](https://github.com/durable-workflow/sdk-php/blob/3.11.0/docs/portal/operate/upgrading.md)
before deploying. Upgrade every worker that can receive work from a task queue
together, including standby and autoscaling pools.

- **Laravel bridge.** From 3.10, the Laravel service-mode bridge follows
  Workflow 2.21: PHP `^8.2` and patched Laravel `^12.69.0|^13.30.0`. Laravel
  10 and 11 are no longer supported. The provider refuses unsupported or
  unknown framework and PHP versions before registering anything. The bare SDK
  keeps PHP `^8.1` and Symfony 6.4/7/8 support.
- **Condition fingerprints.** From 3.10, new condition waits record v2
  (`dwphp2:sha256:`) predicate fingerprints. Older workers reject them, so
  rolling workers back below 3.10 after v2 waits exist can fail replay. Stop or
  drain older workers before replacements start, deploy PHP sources atomically
  and restart every long-running worker, including workers using OPcache.
  Workers that replay v2 waits need PHP's tokenizer. Existing v1 waits still
  require an exact source-line match.
- **Static credentials.** From 3.10, static credentials are validated as
  given. Malformed UTF-8, Unicode whitespace at either edge and embedded
  control characters now fail instead of being trimmed or ignored. Check shared,
  client, worker and framework process-handoff values before upgrading.
- **Occurrence deadlines.** In 3.11, a new top-level condition wait keeps its
  first deadline across false wakes when the Server advertises
  `condition_wait_occurrence_deadline` (native Server 3.3.0 or later). Without
  that capability, workers send the same commands as before. Grouped condition
  waits do not opt in yet. On an older Server, upgrade every worker on the queue
  to 3.11 before upgrading the Server. On a Server that already advertises the
  capability, drain or stop every older worker before any 3.11 worker consumes
  the queue. Once an anchored wait exists, do not roll that queue's workers back
  below 3.11.

PHP SDK 3.10 also adds `WorkflowContext::startChildWorkflow()`, which returns a
`ChildWorkflowHandle` once the child start commits and needs a runtime that
advertises `child_workflow_start_turn`. Other additions are
`ActivityContext::activityExecutionId`, optional typed declarations for
`upsertSearchAttributes()`, lazy workflow list and history iterators, and the
`enableCompletionPipelining` Worker option, which defaults to `false`.
Completion-carried polls are used only when the runtime advertises them. See
the [3.11.0 changelog](https://github.com/durable-workflow/sdk-php/blob/3.11.0/CHANGELOG.md)
for the complete list.

## Protocol and release boundary

The SDK declares its supported server range, worker protocol version,
control-plane version, and payload codecs in Composer metadata. The server also
publishes its accepted protocol and codec set from `GET /api/cluster/info`.
Check runtime discovery during deployment instead of inferring compatibility
from a server patch version.

The PHP SDK is versioned independently from the Laravel package. Keep the
exact published pin in runnable examples and evaluate release notes when
upgrading SDK releases. Compatibility follows the SDK's declared contract,
not matching package version numbers.

## Related references

- [Standalone Server](/docs/polyglot/server/)
- [Deployment Modes](/docs/polyglot/deployment-modes/)
- [Worker Protocol](/docs/polyglot/worker-protocol/)
- [Capability Index](/docs/capabilities/)
- [PHP developer portal](https://php.durable-workflow.com/)
- [PHP API reference](https://php.durable-workflow.com/api/)
- [PHP executable quickstart contract](https://php.durable-workflow.com/quickstart-contract.json)
- [PHP SDK source](https://github.com/durable-workflow/sdk-php)

## Workflow list and history pages {#workflow-list-and-history-pages}

These published calls return **one page**, not an automatic complete read: `Client::listWorkflows(...)` / `Client::workflowHistory(...)`. Continue with the returned opaque token while keeping namespace, filters and selected workflow/run fixed; stop at the final null/empty token and handle page errors explicitly. A partial page is not a replay bundle. Use the SDK history-export API for offline replay. The [published PHP 3.2.0 client source](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php) defines the page parameters.

PHP SDK 3.10.0 and later also provide `Client::iterateWorkflows()` and `Client::iterateWorkflowHistory()`. They read a complete workflow listing or exact-run history lazily, one page at a time, keeping the opaque cursor, namespace and filters. Errors on later pages propagate, and malformed continuations or token cycles are refused instead of truncating or looping. See the [published PHP 3.11.0 client source](https://github.com/durable-workflow/sdk-php/blob/3.11.0/src/Client.php).

## Bounded failure reports {#bounded-failure-reports}

PHP SDK **3.5.0** introduced bounded outgoing failure reports. Defaults are **62 KiB UTF-8 for the message**, **128 KiB for the stack**, **64 KiB for combined serialized optional details and diagnostics**, and **1 MiB for the complete JSON-encoded body**. Markers, JSON escaping, claim identity and other commands in the batch count toward that body limit. A lower configured or transport-declared limit takes precedence. Failure type, class, code, retry policy and claim identity are preserved.

`withFailureReportLimit()` returns a new client with a smaller whole-request budget, from 1 to 1,048,576 bytes. Use the returned instance. A lower transport-declared cap also applies.

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

A visible truncation marker and original byte counts identify shortened fields. Avro details remain intact or are omitted whole. An unrepresentable required envelope raises `DurableWorkflow\Exception\FailureReportRefused` before HTTP submission. Local failures are normalized before workflow code observes them, so first execution and cold replay see the persisted message. An already observed local message remains immutable during final batch fitting.
