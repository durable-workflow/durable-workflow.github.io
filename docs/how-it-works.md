---
sidebar_position: 10
---

# How It Works

Durable Workflow uses Laravel's queued jobs and event-sourced persistence to create durable coroutines. Workflows suspend through Fiber-backed helper calls for a durable replay contract.

## Runtime

A workflow is a class whose `handle()` method calls straight-line helpers such as `activity()`, `await()`, `timer()`, `sideEffect()`, `child()`, and `all([...])`. Each helper call suspends the workflow until the corresponding durable step completes, then resumes from where it left off with the recorded result.

Every step produces a durable history event. The engine replays that history whenever the workflow wakes up, rebuilding state from the event stream before running the next unexecuted step. That replay is what lets a workflow survive worker restarts, deployments, and machine failures without losing its place.

`WorkflowStub::make()` reserves a public workflow instance id. Starting the workflow creates the first run and the first workflow task. Each run has its own run id; operations such as `signal()`, `cancel()`, and `terminate()` target the current instance run.

## Event Sourcing

Event sourcing builds up the current state from a sequence of saved events rather than saving the state directly. This has several benefits: it provides a complete history of the execution events, and it can be used to resume a workflow if the worker crashes.

## Coroutines

Coroutines are functions whose execution can be suspended and resumed. Durable suspension points are expressed as straight-line Fiber-backed helper calls such as `activity()`, `await()`, `timer()`, and `sideEffect()`.

User workflow code lives in `handle()`, which is an ordinary method that calls those helpers directly. The runtime first checks whether the step already completed durably. If so, the cached result is replayed from history instead of running the step a second time. Otherwise, the runtime queues the next activity, timer, or child work and suspends until that durable step completes or fails.

## Activities

By calling multiple activities, a workflow can orchestrate the results between each of them. The execution of the workflow and the durable steps it schedules are interleaved: the workflow reaches an activity call, suspends until that activity completes, and then continues execution from where it left off.

If a workflow fails, the events leading up to the failure are replayed to rebuild the current state. This allows the workflow to pick up where it left off, with the same inputs and outputs as before, ensuring determinism.

Activities are always ordinary queued work in v2. There is no in-process local
activity fast path and no worker-session pinning that a workflow author can
rely on for correctness. If you need a replay-safe one-shot value without
queueing an activity, use [`sideEffect(...)`](./features/side-effects.md). For
the full contract, see
[Activity Execution Model](./features/activity-execution-model.md).

## Queues

Queued jobs are background processes that run at a later time. Laravel supports queues via Amazon SQS, Redis, or a relational database. Workflows and activities are both queued jobs, but they behave a little differently. A workflow is dispatched multiple times during normal operation: it runs, dispatches one or more activities, and then exits until the activities complete. An activity executes once during normal operation and is only retried on error.

## Example

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            fn () => all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## Sequence Diagram

This sequence diagram shows how a workflow progresses through a series of activities, both serial and parallel.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="Workflow Sequence Diagram"
/>

1. The workflow starts by getting dispatched as a queued job.
2. The first activity, `TestActivity`, is then dispatched as a queued job. The workflow job then exits. Once `TestActivity` has completed, it saves the result to the database and returns control to the workflow by dispatching it again.
3. At this point, the workflow enters the event sourcing replay loop. This is where it goes back to the database and looks at the event stream to rebuild the current state. This is necessary because the workflow is not a long running process. The workflow exits while any activities are running and then is dispatched again after completion.
4. Once the event stream has been replayed, the workflow continues to the next activity, `TestOtherActivity`, and starts it by dispatching it as a queued job. Again, once `TestOtherActivity` has completed, it saves the result to the database and returns control to the workflow by dispatching it as a queued job.
5. The workflow then enters the event sourcing replay loop again, rebuilding the current state from the event stream.
6. Next, the workflow starts two parallel activities, `TestParallelActivity` and `TestOtherParallelActivity`. Both activities are dispatched. Once they have completed, they save the results to the database and return control to the workflow.
7. Finally, the workflow enters the event sourcing replay loop one last time to rebuild the current state from the event stream. This completes the execution of the workflow.

## Determinism

Because history is replayed on every wake-up, workflow code must produce the same commands given the same history. Read [Constraints](./constraints/overview.md) for the authoring rules and the helpers Durable Workflow exposes (`Workflow\now()`, `sideEffect()`, `getVersion()`, and similar) for situations where code would otherwise be non-deterministic.
