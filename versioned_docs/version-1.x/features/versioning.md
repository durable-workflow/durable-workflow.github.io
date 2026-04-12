---
sidebar_position: 13
---

# Versioning

Since workflows can run for long periods, sometimes months or even years, it's common to need to make changes to a workflow definition while executions are still in progress. Without versioning, modifying workflow code that affects the execution path would cause non-determinism errors during replay.

The `getVersion()` helper function allows you to safely introduce changes to running workflows by creating versioned branch points.

```php
use Workflow\Workflow;
use Workflow\WorkflowStub;
use function Workflow\{activity, getVersion};

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $version = yield getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            yield activity(OldActivity::class);
        } else {
            yield activity(NewActivity::class);
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

- **New executions** record the `maxSupported` version and return it
- **Replaying executions** return the previously recorded version

This allows new workflows to use the latest code path while existing workflows continue using their original path.

## Adding a New Version

Suppose you have an existing workflow that calls `prePatchActivity`:

```php
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $result = yield activity(PrePatchActivity::class);

        return $result;
    }
}
```

To replace it with `postPatchActivity` without breaking running workflows:

```php
use function Workflow\{activity, getVersion};
use Workflow\Workflow;
use Workflow\WorkflowStub;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $version = yield getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? yield activity(PrePatchActivity::class)
            : yield activity(PostPatchActivity::class);

        return $result;
    }
}
```

## Adding More Versions

When you need to make additional changes, increment `maxSupported`:

```php
$version = yield getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => yield activity(PrePatchActivity::class),
    1 => yield activity(PostPatchActivity::class),
    2 => yield activity(AnotherPatchActivity::class),
};
```

## Deprecating Old Versions

After all workflows using an old version have completed, you can drop support by increasing `minSupported`. This removes the need to maintain old code paths.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = yield getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => yield activity(PostPatchActivity::class),
    2 => yield activity(AnotherPatchActivity::class),
};
```

If a workflow with a version older than `minSupported` tries to replay, it will throw a `VersionNotSupportedException`.

## Multiple Change Points

You can use multiple `getVersion()` calls in the same workflow for independent changes:

```php
use function Workflow\getVersion;
use Workflow\Workflow;
use Workflow\WorkflowStub;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        $version1 = yield getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = yield getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Important:** Each `changeId` should be unique within a workflow. The version is recorded in the workflow logs and will be replayed deterministically.
