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

### Transport chunking

Some queue drivers impose a maximum delay on initial message delivery. For example, Amazon SQS caps `DelaySeconds` at 900 seconds (15 minutes). When a timer's duration exceeds the queue driver's limit, the engine automatically chunks the delay:

1. The timer task is dispatched with the driver's maximum delay instead of the full duration.
2. When the task arrives early (before `fire_at`), it re-releases itself with the remaining delay.
3. This relay continues until the timer's actual fire time is reached.

This is transparent to the workflow — the timer row still records the full duration and the correct `fire_at` timestamp. The chunking happens purely at the transport layer. For SQS, subsequent relay hops can use up to 43,200 seconds (12 hours) via `ChangeMessageVisibility`, so most timers complete in one or two hops.

`sideEffect()` is available for replay-safe snapshots such as randomness or one-time branch inputs. A dedicated `Workflow\V2\now()` and unit-helper API is still evolving, so `timer()` remains the only time suspension helper today.
