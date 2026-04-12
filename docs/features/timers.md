---
sidebar_position: 3
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Timers

The framework provides the ability to suspend the execution of a workflow and resume at a later time. These are durable timers, meaning they survive restarts and failures while remaining consistent with workflow replay semantics. This can be useful for implementing delays, retry logic, or timeouts.

To use timers, call `timer($duration)` within your workflow:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        timer(30);

        return 'The workflow waited 30 seconds.';
    }
}
```

<TimerSimulator />

Timer behavior:

- each `timer()` call creates a durable timer row plus typed `TimerScheduled`, `TimerFired`, and, when superseded, `TimerCancelled` history events
- delayed timers run through a dedicated timer task before the workflow task is resumed
- `timer(0)` fires inline during the workflow task and does not create a timer task
- replay and query paths treat typed `TimerScheduled`, `TimerFired`, and `TimerCancelled` history as authoritative for timer lifecycle, so pure timers stay blocked until the committed fire event arrives and selected-run detail can rebuild open, fired, or cancelled timer waits from history
- Waterline surfaces timer waits in run detail and dashboard payloads
- engine-level `cancel()` and `terminate()` commands supersede open timer waits durably, and late timer jobs no-op instead of reopening the run

`sideEffect()` is available for replay-safe snapshots such as randomness or one-time branch inputs. A dedicated `Workflow\V2\now()` and unit-helper API is still evolving, so `timer()` remains the only time suspension helper today.
