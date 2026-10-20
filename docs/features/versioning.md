---
sidebar_position: 15
---

# Versioning

Since workflows can run for long periods, sometimes months or even years, it's common to need to make changes to a workflow definition while executions are still in progress. Without versioning, modifying workflow code that affects the execution path would cause non-determinism errors during replay.

The `getVersion()` helper function allows you to safely introduce changes to running workflows by creating versioned branch points.

## Evolving Recorded Entry Arguments {#evolving-recorded-entry-arguments}

A run keeps the arguments recorded when it started. Deploying a new definition does not rewrite that input. On replay, the runtime binds those recorded values to today's workflow entry method **before any code inside that method runs**. A `getVersion()` or `patched()` branch inside the body cannot rescue an incompatible signature: the runtime has to enter the body first.

Keep existing positional arguments in the same order and accept their recorded types. A PHP default fills an omitted argument; it does not replace an incompatible value already recorded at that position. For example, a run started with `[7]` still supplies the integer `7` after deployment:

| Entry change | Effect on the recorded input `[7]` |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | The old argument still binds; the new trailing argument can use its default. Keep replayed commands compatible too. |
| Add a required trailing argument without a default | The old run has no value for it. |
| Insert, remove or reorder leading arguments | Existing values can move into the wrong parameter. Do not assume matching parameter names repair positional input. |
| Change `int $amount` to `string $amount` | The recorded integer has not become a string. |
| Change `int $amount` to `PaymentRequest $request` | Dependency injection is not an input migration. A newly constructed DTO must not replace the recorded amount with constructor defaults. |
| Remove only a trailing parameter | PHP can accept the call, but verify that dropping its meaning does not change replayed commands or business behavior. |

Prefer an additive, optional trailing parameter or a new workflow type for a different input contract. If you need a new DTO internally, construct it explicitly from compatible recorded arguments **inside** the workflow body and version any change to durable commands there. Keep code able to replay every supported input shape until those runs no longer need it. Test the actual stored inputs against the new definition, including a cold replay after a durable wait; testing only new starts misses this deployment boundary.

### Workflow 2.7.2 Behavior {#released-embedded-entry-behavior}

In Workflow **2.7.2**, an entry arity or type error can become a terminal `WorkflowFailed` event. Some dependency-resolution errors instead leave the run open with a repeatedly failing task. A scalar changed to a newly injected DTO with default constructor values can even run with the wrong data. These are product defects tracked in [Workflow #866](https://github.com/durable-workflow/workflow/issues/866), not a safe versioning strategy.

Restoring compatible code can recover an open run that can be redelivered, but it does not reopen a run already made terminal. Neither `repair()` nor a new version branch promises to revive such a failed original. Inspect its actual status and failure first; preserve its input and history while deciding on recovery.

### Released Embedded Safeguard {#embedded-entry-argument-safeguard}

Workflow **2.7.3** validates recorded entry arguments before entering application code. Incompatible binding becomes a typed `WorkflowEntryArgumentsMismatchException` and a replay-blocked **workflow task**, with `replay_blocked_reason = workflow_entry_arguments_mismatch`; the **run stays nonterminal**. Diagnostic fields identify the workflow, entry method, parameter and expected/actual types without copying argument values. A newly injected DTO that would discard recorded input is refused too. Check the actual Workflow package installed in the embedded application. This safeguard does not reopen terminal runs created by an older release.

With that released safeguard, recover the same still-open original as follows:

1. Inspect the selected run's task diagnostic and confirm `workflow_entry_arguments_mismatch`, rather than assuming every task failure has this cause.
2. Restore a definition that accepts the original recorded arguments, or deploy a compatible adapter in the workflow body. Keep the original workflow identity, input, history and deadlines; do not edit storage to make the new signature fit.
3. Use the supported repair action for that same still-open run after compatible code is available, then verify its original work resumes and its terminal outcome is recorded once. Repair does not extend the original deadline; a deadline that has elapsed still applies.

The safeguard does **not** reinterpret exceptions thrown by the workflow body as deployment mismatches. A genuine application `TypeError` or other unhandled body failure still follows normal workflow failure behavior. It also does not supply the fleet-level legacy-branch retirement check tracked in [shared #220](https://github.com/durable-workflow/.github/issues/220).

### Service SDKs Have Separate Boundaries {#service-sdk-entry-boundaries}

An embedded Core fix does not change the SDK process that executes service-mode workflow code. The following are the source-verified published boundaries; equivalent recoverable entry validation remains open in [shared #221](https://github.com/durable-workflow/.github/issues/221):

| Published SDK | Entry-binding behavior |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | Calls the registered handler with context followed by recorded positional input. An entry `ArgumentCountError` or `TypeError` can follow the generic workflow-failure path. |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | Calls `run(ctx, *start_input)`. Changed arity can fail the workflow; type annotations alone do not enforce argument types or convert recorded values. Generator-body errors are application failures too. |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | The typed adapter deserializes input before calling its fixed-signature handler. A changed request type can fail that decoding step. This differs from PHP/Python positional binding; an incidental unconsumed-history refusal is not a promised recoverable signature safeguard. |

Keep service input compatibility and actual SDK qualification separate from the embedded release. Do not catch every `TypeError` or every Rust handler error and label it replay-safe: that would hide real application failures.

## Using `getVersion`

`getVersion()` is a replay-safe straight-line helper. Each change point records a durable version marker for the run on first execution, and every later replay reuses that committed value instead of recalculating the branch from today's code. Old runs that predate a newly introduced branch point conservatively receive `DEFAULT_VERSION`.

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## How It Works

The `getVersion()` method takes three parameters:

- **changeId** - A unique identifier for this change point
- **minSupported** - The minimum version this code still supports
- **maxSupported** - The maximum (current) version for new executions

When a workflow encounters `getVersion()`:

- **New executions** append a typed `VersionMarkerRecorded` history event with the `change_id`, chosen `version`, and supported range, then return `maxSupported`
- **Replaying executions** return the previously recorded version from that history marker
- **Runs without a marker yet** fall back to `WorkflowStub::DEFAULT_VERSION` when the runtime determines the branch predates the current workflow definition. It first checks the run's compatibility marker against the current worker, then compares the run's durably snapped `workflow_definition_fingerprint` to the current loadable workflow class. If the fingerprints match, the run is on the same definition and the marker is recorded fresh; if they differ, the run predates the change and the fallback fires. Runs whose `WorkflowStarted` history predates the fingerprint snapshot (no recorded fingerprint) conservatively receive `DEFAULT_VERSION` because the runtime cannot prove the definition has not changed. This conservative fallback is the frozen 2.0 policy for pre-fingerprint runs: the runtime does not block claim solely because an older run lacks a recorded fingerprint. The fallback does not append a synthetic marker or consume a new workflow step
- **Query methods** replay the same committed version marker before invoking the annotated method, so queries see the same branch the workflow task saw
- **Waterline** exposes recorded markers in the selected-run timeline with `version_change_id`, `version`, `version_min_supported`, and `version_max_supported`, and selected-run detail now also surfaces `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint`, and `workflow_definition_matches_current` so operators can see when a long-lived run started on an older definition even before a version marker was committed

This allows new workflows to use the latest code path while existing workflows continue using their original path.

## Adding a New Version

Suppose you have an existing workflow that calls `prePatchActivity`:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

To replace it with `postPatchActivity` without breaking running workflows:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

When you roll out a deployment that introduces a new `getVersion()` branch point, keep rotating `DW_V2_CURRENT_COMPATIBILITY` for that build wave. The runtime uses the run's start-time `workflow_definition_fingerprint` as its primary authority when deciding whether a missing version marker belongs to a fresh execution or to an older run that should stay on `DEFAULT_VERSION`. The compatibility marker still matters for compatibility-aware worker routing and fires before the fingerprint check. Runs that predate the fingerprint snapshot (no recorded fingerprint) conservatively stay on `DEFAULT_VERSION` since the runtime cannot verify the definition has not changed.

## Adding More Versions

When you need to make additional changes, increment `maxSupported`:

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## Deprecating Old Versions

After all workflows using an old version have completed, you can drop support by increasing `minSupported`. This removes the need to maintain old code paths.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

If a workflow with a version older than `minSupported` tries to replay, it will throw a `VersionNotSupportedException`. That includes older-compatibility runs whose safe fallback is still `WorkflowStub::DEFAULT_VERSION`.

If you accidentally reuse the same `changeId` for a different branch point later, the runtime treats that as a determinism error instead of silently accepting the mismatch. Keep one stable `changeId` per logical code change.

## Multiple Change Points

You can use multiple `getVersion()` calls in the same workflow for independent changes:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Important:** Each `changeId` should be unique within a workflow. The chosen version is recorded as typed workflow history and replayed deterministically on later workflow tasks, queries, and Waterline detail views. When Waterline shows no `VersionMarkerRecorded` entry for a change point on an older run, that means replay stayed on the legacy `DEFAULT_VERSION` path without backfilling a new marker into existing history. The selected-run detail fields `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint`, and `workflow_definition_matches_current` tell you whether that run started on a different workflow definition than the one your current build can load today.

## `patched()` Shorthand

`patched($changeId)` is a two-state shorthand for the common "did this run cross a one-time code change?" question. It records the same durable `VersionMarkerRecorded` history event as `getVersion()` and resolves to a boolean instead of an integer.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

Behavior:

- New runs commit the marker, take the new branch, and `patched()` returns `true`.
- Runs that started before this `changeId` was added stay on `DEFAULT_VERSION` under the same fingerprint fallback `getVersion()` uses, and `patched()` returns `false`.
- Replays of either kind read the previously committed marker and return the same value, so the branch decision is durable.

`patched()` is exactly equivalent to `getVersion($changeId, DEFAULT_VERSION, 1) === 1`. Use it when you only have two branches and you do not need to keep the legacy branch around forever — the boolean spelling reads cleaner at the call site than a `match` over `DEFAULT_VERSION` and `1`.

If you need more than two branches, or you plan to add another version of the same logical change later, use `getVersion()` with an explicit `maxSupported`. Switching from `patched()` to `getVersion()` for the same `changeId` is a determinism error because the existing marker was recorded with `maxSupported = 1`.

## Removing the Legacy Branch with `deprecatePatch()`

When every legacy run for a `patched()` change point has finished, you can delete the legacy branch from your workflow code. The compatible way to do that is to replace the `patched()` call with `deprecatePatch()` rather than removing the call entirely.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` keeps the change point on the workflow timeline so already-committed `VersionMarkerRecorded` history events still match a known call, but it returns `null` and unconditionally takes the new path. Once you ship this version:

- New runs commit a `deprecate_patch` marker, take the new branch, and the `deprecatePatch()` call returns `null`.
- Existing runs that already committed a `patched` marker for this `changeId` keep replaying that marker and resolve through the deprecated branch — which is now the only branch — without erroring.
- Existing runs that committed `false` for `patched()` (the legacy path) are no longer in flight by assumption. If one is still running and tries to replay, the workflow will still read the legacy marker but execute the new branch — which is why the safe lifecycle is "wait for legacy runs to drain before deploying `deprecatePatch()`".

Two-phase patch lifecycle and placement rules:

1. **Introduce `patched()`** at the change point. Both branches stay in the workflow code. New runs take the new branch; older runs keep taking the legacy branch.
2. **Wait for every legacy run to finish.** Use Waterline run search or `dw workflow:list` to confirm there are no open runs that could replay through the legacy branch.
3. **Replace `patched()` with `deprecatePatch()`** at the same call site, with the same `changeId`, and delete the legacy branch from the function body. Keep the call there — do not remove it — so durable history still matches a known change point.
4. **Optional: remove `deprecatePatch()` entirely** once you are also confident no historical replay (queries, exports, audits) will ever read history that committed this marker. That is an irreversible step; most workflows can leave `deprecatePatch()` in place indefinitely without paying any runtime cost.

Placement rules:

- `patched()` and `deprecatePatch()` must be called from the workflow function body, not from activities, signal handlers, or query methods. They are workflow steps and must replay deterministically.
- Each `changeId` is one logical change point. Reusing the same `changeId` for a different branch is a determinism error.
- A `changeId` can appear in `patched()` or `deprecatePatch()` form during its lifetime, but never both at the same time. The deploy that swaps the call must replace, not coexist.
- `getVersion()` and `patched()` cannot coexist for the same `changeId`. Pick one model when you introduce the change point.
