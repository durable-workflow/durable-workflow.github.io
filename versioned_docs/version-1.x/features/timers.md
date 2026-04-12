---
sidebar_position: 3
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Timers

The framework provides the ability to suspend the execution of a workflow and resume at a later time. These are durable timers, meaning they survive restarts and failures while remaining consistent with workflow replay semantics. This can be useful for implementing delays, retry logic, or timeouts.

To use timers, you can use the `timer($duration)` helper function within your workflow. This method returns a `Promise` that will be resolved after the specified duration has passed.

Here is an example of using a timer:

```php
use function Workflow\timer;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        yield timer('5 seconds');

        return 'The workflow waited 5 seconds.';
    }
}
```

<TimerSimulator />

You can specify the `$duration` as an integer number of seconds or as a string e.g. '5 seconds', '30 minutes' or even '3 days'. It can handle any duration.

**Important:** Inside of a workflow, never use `Carbon::now()` or Laravel's `now()` to get the current time. Instead, use `Workflow\now()`, which returns the current time as seen by the workflow system. This is crucial because the actual time may not match your application's system clock.

Additionally, when measuring elapsed time in workflows (e.g., tracking how long an activity takes), always get your start and end times with:

```php
use function Workflow\{now, sideEffect};

$start = yield sideEffect(fn () => now());
```

This ensures an event log is created, preventing replay-related inconsistencies and guaranteeing accurate time calculations.

## Time Helpers

You can also use the following helper functions to create timers for specific units of time:

**seconds, minutes, hours, days, weeks, months, years**

Each function returns a timer promise based on the unit:

```php
use function Workflow\{days, hours};

yield days(3);
yield hours(2);
```
