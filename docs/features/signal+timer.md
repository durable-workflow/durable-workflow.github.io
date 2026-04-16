---
sidebar_position: 4
---

# Signal + Timer

`Workflow\V2` supports `await($condition, timeout: $seconds, conditionKey: $key)` for timeout-backed condition waits.

Use it when the workflow should continue as soon as some durable replayed state becomes true, but should also unblock after a deadline if that state never changes.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\minutes;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = await(fn () => $this->ready, timeout: minutes(5), conditionKey: 'approval.ready');

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

`await()` with a `timeout:` parameter works like this:

- the predicate only becomes durable when some committed workflow input changes replayed state, such as an update, an earlier activity result, or a child-workflow result
- the optional condition key is a stable, URL-safe operator label for that wait; if a run already recorded a condition wait at that workflow step, worker and query replay validate that the current code yields the same key instead of silently treating a different predicate as the old wait. This includes the unkeyed-to-keyed case: history recorded without a key reports the recorded key as `none`, and a later build that adds a key blocks replay until compatible code is back.
- when the closure source is available, v2 also records a `condition_definition_fingerprint` on `ConditionWaitOpened`, condition-timeout timer history, `ConditionWaitSatisfied`, and `ConditionWaitTimedOut`. Replaying code with the same key but a different predicate fingerprint blocks the same way as a key mismatch. Query replay raises the mismatch to the caller. Worker replay leaves the run open, marks the workflow task as `replay_blocked`, and projects `liveness_state = workflow_replay_blocked` so operators can deploy a compatible build and then repair the run instead of losing the durable history to a terminal workflow failure.
- replay also validates the typed step shape before opening or resolving the wait. If the same workflow sequence already contains a different step fact, such as a pure `TimerScheduled` from an older definition, query replay raises a history-shape mismatch and worker replay leaves the workflow task in `replay_blocked` with `replay_blocked_reason = history_shape_mismatch`, `replay_blocked_expected_history_shape`, and `replay_blocked_recorded_event_types`. The same guard is shared by activity, child-workflow, pure timer, signal-wait, side-effect, version-marker, continue-as-new, and `all([...])` leaf replay, so committed typed history keeps owning that workflow sequence across deployments.
- Waterline projects the selected run as `wait_kind = condition` and keeps one `condition_wait_id` for that workflow step
- keyed waits also expose `condition_key` and use it as the wait row's `target_name`; waits, timeout timer tasks, timer detail, timeline entries, and history exports carry the same predicate fingerprint when one was recorded
- if you supply a timeout, the engine also creates a durable timer row and timer task for the deadline, but Waterline still shows the wait itself as one condition wait rather than as a separate fake timer wait
- if the predicate becomes true before the timer fires, the engine cancels that timeout timer, records `TimerCancelled`, and then records `ConditionWaitSatisfied`
- if the deadline wins first, the timer records `TimerFired`, then a workflow task applies `ConditionWaitTimedOut` and the returned value resolves to `false`; once `TimerScheduled` exists for the timeout transport, a drifted live timer row marked `fired` is not enough to resolve the wait without matching `TimerFired` history. If the live timer row or the workflow task disappears after `TimerFired`, selected-run detail still shows the fired timeout from typed history and Repair recreates the workflow task rather than scheduling a second timer fire

Timer sugar helpers are available for readable timeout values: `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`, `years()`.

To change the predicate durably from application code, call the declared update:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

The return value is `true` when the condition becomes true before the timeout task fires and `false` when the timeout wins.

If you want to wait for one named signal value directly instead of waiting for a local predicate, keep using `signal('name')`. `Workflow\V2` does not use legacy `#[SignalMethod]` mutator methods to flip workflow state.
