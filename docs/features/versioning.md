---
sidebar_position: 15
---

# Versioning

Since workflows can run for long periods, sometimes months or even years, it's common to need to make changes to a workflow definition while executions are still in progress. Without versioning, modifying workflow code that affects the execution path would cause non-determinism errors during replay.

The `getVersion()` helper function allows you to safely introduce changes to running workflows by creating versioned branch points.

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
