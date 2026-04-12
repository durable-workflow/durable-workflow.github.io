---
sidebar_position: 13
---

# Versioning

Since workflows can run for long periods, sometimes months or even years, it's common to need to make changes to a workflow definition while executions are still in progress. Without versioning, modifying workflow code that affects the execution path would cause non-determinism errors during replay.

The `getVersion()` helper function allows you to safely introduce changes to running workflows by creating versioned branch points.

## Using `getVersion`

`getVersion()` is a replay-safe straight-line helper. Each change point records one typed `VersionMarkerRecorded` history event for the selected run, and later workflow replay or query replay reuses that committed value instead of recalculating the branch from today's code. New runs also snapshot a start-time `workflow_definition_fingerprint` on `WorkflowStarted`, so when a run reaches a newly introduced branch point with no recorded marker yet, the runtime can distinguish "this run started before that definition existed" from "this is a fresh execution on the current definition" without relying only on the compatibility marker.

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
- **Runs without a marker yet** fall back to `WorkflowStub::DEFAULT_VERSION` when replay can prove the branch predates the current workflow definition, first by comparing the run's durably snapped `workflow_definition_fingerprint` to the current loadable workflow class and then, for older runs that predate that fingerprint snapshot, by falling back to the compatibility marker and occupied-sequence checks; that legacy fallback does not append a synthetic marker or consume a new workflow step
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

When you roll out a deployment that introduces a new `getVersion()` branch point, keep rotating `WORKFLOW_V2_CURRENT_COMPATIBILITY` for that build wave. The runtime prefers the run's start-time `workflow_definition_fingerprint` when it decides whether a missing version marker belongs to a fresh execution or to an older run that should stay on `DEFAULT_VERSION`, but the compatibility marker still matters for mixed-fleet worker routing and remains the fallback for older runs whose `WorkflowStarted` history predates the fingerprint snapshot.

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
