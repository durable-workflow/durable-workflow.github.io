---
sidebar_position: 9
---

# Failures and Recovery

## Handling Exceptions

When an activity throws an exception, the workflow won't immediately be informed. Instead, it waits until the number of `$tries` has been exhausted. The system will keep retrying the activity based on its retry policy. If you want the exception to be immediately sent to the workflow upon a failure, you can set the number of `$tries` to 1.

```php
use Exception;
use Workflow\Activity;

class MyActivity extends Activity
{
    public $tries = 1;

    public function execute()
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        try {
            $result = yield activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Non-retryable Exceptions

In certain cases, you may encounter exceptions that should not be retried. These are referred to as non-retryable exceptions. When an activity throws a non-retryable exception, the workflow will immediately mark the activity as failed and stop retrying.

```php
use Workflow\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function execute()
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Failing Activities

The default value for `$tries` is 0 which means to retry forever. This is because the retry policy includes a backoff function which increases the delay between each retry attempt. This gives you time to fix the error without creating too many attempts.

There are two types of failures that can occur in a activity: recoverable failures and non-recoverable failures. Recoverable failures are temporary and can be resolved without intervention, such as a timeout or temporary network failure. Non-recoverable failures require manual intervention, such as a deployment or code change.

## Recovery Process

The general process to fix a failing activity is:

1. Check the logs for the activity that is failing and look for any errors or exceptions that are being thrown.
2. Identify the source of the error and fix it in the code.
3. Deploy the fix to the server where the queue is running.
4. Restart the queue worker to pick up the new code.
5. Wait for the activity to automatically retry and ensure that it is now completing successfully without errors.
6. If the activity continues to fail, repeat the process until the issue is resolved.

This allows you to keep the workflow in a running status even while an activity is failing. After you fix the failing activity, the workflow will finish in a completed status. A workflow with a failed status means that all activity `$tries` have been exhausted and the exception wasn't handled.
