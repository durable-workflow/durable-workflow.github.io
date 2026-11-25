---
sidebar_position: 2
---

# Workflow Constraints

The determinism constraints for workflow classes dictate that a workflow class must not depend on external state or services that may change over time. This means that a workflow class should not perform any operations that rely on the current date and time, the current user, external network resources, or any other source of potentially changing state.

Here are some examples of things you shouldn't do inside of a workflow class:

- Don't use the `Carbon::now()` method to get the current date and time, as this will produce different results each time it is called. Instead, use `Workflow\V2\Workflow::now()` (or the `Workflow\V2\now()` helper), which returns replay-safe workflow time.
- Don't use the `Auth::user()` method to get the current user, as this will produce different results depending on who is currently logged in. Instead, pass the user as an input to the workflow when it is started.
- Don't make network requests to external resources, as these may be slow or unavailable at different times. Instead, pass the necessary data as inputs to the workflow when it is started or use an activity to retrieve the data.
- Don't use random number generators (unless using a side effect) or other sources of randomness, as these will produce different results each time they are called. Instead, pass any necessary randomness as an input to the workflow when it is started.

## Logging from workflow code {#workflow-logging}

The engine replays a workflow from its history every time it wakes up, so an ordinary log call in workflow code is written again for every completed step. A workflow with 50 steps logs its opening line 50 times. Use the replay-aware logger instead. It writes only when the code runs for the first time, and adds the run's identity to each line:

- Embedded workflows (Workflow 2.42.0 or later): `$this->logger()` returns a PSR-3 logger that writes through the Laravel logger, or through the channel you pass, as in `$this->logger('workflow')`. Each line carries `workflow_instance_id`, `workflow_run_id`, `workflow_type` and `namespace`. `$this->replayState()` returns `Workflow\V2\Enums\WorkflowReplayState` (`Replaying`, `Executing` or `Unavailable`), and `$this->isReplaying()` is its boolean form.
- PHP SDK: `$context->logger()` writes through the `Worker`'s PSR-3 logger. See the [PHP SDK guide](../polyglot/php.md#workflow-logging).
- Rust SDK: `ctx.logger()`. See the [Rust SDK 4.17 workflow logger](../polyglot/rust.md#workflow-logging).
- Python SDK: `ctx.logger`.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class ShipOrderWorkflow extends Workflow
{
    public function handle(string $orderId): string
    {
        $this->logger()->info('Shipping started', ['order_id' => $orderId]);
        $label = activity(PrintLabelActivity::class, $orderId);
        $this->logger()->info('Label printed', ['label' => $label]);

        return $label;
    }
}
```

Queries and update validators never log, because they always replay.

Logging is a process observation. Keep durable workflow commands independent of replay-state observations and log delivery. Even a replay-aware logger can repeat a message from an uncommitted attempt after a crash or retry; it is not an exactly-once outbox. Keep host handlers bounded and nonblocking so logging does not stall the worker. Put durable business effects behind the appropriate activity or recorded workflow operation instead.

## Boot-Time Guardrails

When workflow classes are registered under `workflows.v2.types.workflows`, the package scans them at boot time for obvious replay-unsafe calls (`Carbon::now()`, `Auth::user()`, `DB::`, `Http::`, `random_int()`, and similar) and surfaces findings according to `workflows.v2.guardrails.boot`:

| Mode | Behavior |
|------|----------|
| `warn` (default) | Logs a warning for each detected finding. Does not block application boot. |
| `silent` | Skips boot-time scanning entirely. |
| `throw` | Throws a `LogicException` on the first finding. Useful for CI pipelines. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Set `DW_V2_GUARDRAILS_BOOT=throw` in CI to fail builds that introduce new replay-unsafe calls; keep `warn` in production so rollouts are not blocked by a latent finding.

### What the scan checks {#scan-coverage}

The scan is lexical. It reads only the workflow class, its parent classes and its traits, and flags:

- wall-clock reads: `time()`, `date()`, `microtime()`, `hrtime()`, `today()`, static calls such as `Carbon::now()`, and `new DateTime()`, `new DateTimeImmutable()`, `new Carbon()` or `new CarbonImmutable()` with no argument or a relative time such as `'now'` or `'+1 day'`. A fixed date is not flagged.
- randomness: `random_int()`, `random_bytes()`, `rand()`, `mt_rand()`, `uniqid()`, `shuffle()`, `array_rand()`, `str_shuffle()` and `Str::uuid()`-style helpers.
- live state: `DB::`, `Cache::`, `Http::`, `Auth::`, `auth()` and `request()`.

It can't see calls made through helper or service classes, values that depend on process state such as static properties or the order of unordered data, or anything decided at runtime. A clean scan is not proof of determinism. Run [replay verification](../testing.md) against recorded histories to catch the rest.

First-release scope: boot-time scanning is the only blocking workflow-mode guardrail. The runtime does not rerun determinism diagnostics again at workflow-task claim time. That deferral is intentional for 2.0: boot scanning catches locally registered PHP workflows before rollout, and Waterline surfaces definition-fingerprint drift for long-lived runs without turning cross-build claims into a new source of deploy failures.

Pre-fingerprint runs also follow a conservative first-release policy. If a run reaches a new `getVersion()` branch and its `WorkflowStarted` history predates the fingerprint snapshot, the runtime keeps that run on `WorkflowStub::DEFAULT_VERSION` instead of assuming the current definition is safe. See [Versioning](../features/versioning.md).

### Comment and formatting edits {#comment-only-edits}

By default, a definition fingerprint covers raw source lines. Editing only comments, docblocks or whitespace in a workflow class, its traits or parent workflow classes, or inside an `await()` condition closure therefore counts as a definition change for runs in flight: a missing `getVersion()` or `patched()` marker takes `WorkflowStub::DEFAULT_VERSION`, and an edited condition closure fails replay.

From 2.34, workers can instead record fingerprints of the PHP code tokens without comments and whitespace (prefix `sha256-tokens:`), which those edits don't change. Opt in with `DW_DEFINITION_FINGERPRINT_VERSION=v2` once all workers are upgraded to 2.34 or later, because an older worker treats such a run as changed. Each run keeps the fingerprint version it recorded: runs started before you opt in stay sensitive to comment edits, and switching back to `v1` is safe.
