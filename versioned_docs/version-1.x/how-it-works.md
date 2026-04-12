---
sidebar_position: 10
---

# How It Works

Durable Workflow uses Laravel's queued jobs and event sourced persistence to create durable coroutines.

## Queues

Queued jobs are background processes that are scheduled to run at a later time. Laravel supports running queues via Amazon SQS, Redis, or even a relational database. Workflows and activities are both queued jobs but each behaves a little differently. A workflow will be dispatched mutliple times during normal operation. A workflow runs, dispatches one or more activities and then exits again until the activities are completed. An activity will only execute once during normal operation, as it will only be retried in the case of an error.

## Event Sourcing

Event sourcing is a way to build up the current state from a sequence of saved events rather than saving the state directly. This has several benefits, such as providing a complete history of the execution events which can be used to resume a workflow if the server it is running on crashes.

## Coroutines

Coroutines are functions that allow execution to be suspended and resumed by returning control to the calling function. In PHP, this is done using the yield keyword inside a generator. A generator is typically invoked by calling the [`Generator::current()`](https://www.php.net/manual/en/generator.current.php) method. This will execute the generator up to the first yield and then control will be returned to the caller.

The `execute()` method of a workflow class is a [generator](https://www.php.net/manual/en/language.generators.syntax.php). It works by yielding each activity. This allows the workflow to first check if the activity has already successfully completed. If so, the cached result is pulled from the event store and returned instead of running the activity a second time. If the activity hasn't been successfully completed before, it will queue the activity to run. The workflow is then able to suspend execution until the activity completes or fails.

## Activities

By calling multiple activities, a workflow can orchestrate the results between each of the activities. The execution of the workflow and the activities it yields are interleaved, with the workflow yielding an activity, suspending execution until the activity completes, and then continuing execution from where it left off.

If a workflow fails, the events leading up to the failure are replayed to rebuild the current state. This allows the workflow to pick up where it left off, with the same inputs and outputs as before, ensuring determinism.

## Promises

Promises are used to represent the result of an asynchronous operation, such as an activity. The yield keyword suspends execution until the promise is fulfilled or rejected. This allows the workflow to wait for an activity to complete before continuing execution.

## Example

```php
use Workflow\Workflow;
use function Workflow\{activity, all};

class MyWorkflow extends Workflow
{
    public function execute()
    {
        return [
            yield activity(TestActivity::class),
            yield activity(TestOtherActivity::class),
            yield all([
                activity(TestParallelActivity::class),
                activity(TestParallelOtherActivity::class),
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
2. The first activity, TestActivity, is then dispatched as a queued job. The workflow job then exits. Once TestActivity has completed, it saves the result to the database and returns control to the workflow by dispatching it again.
3. At this point, the workflow enters the event sourcing replay loop. This is where it goes back to the database and looks at the event stream to rebuild the current state. This is necessary because the workflow is not a long running process. The workflow exits while any activities are running and then is dispatched again after completion.
4. Once the event stream has been replayed, the workflow continues to the next activity, TestOtherActivity, and starts it by dispatching it as a queued job. Again, once TestOtherActivity has completed, it saves the result to the database and returns control to the workflow by dispatching it as a queued job.
5. The workflow then enters the event sourcing replay loop again, rebuilding the current state from the event stream.
6. Next, the workflow starts two parallel activities, TestParallelActivity and TestOtherParallelActivity. Both activities are dispatched. Once they have completed, they save the results to the database and return control to the workflow.
7. Finally, the workflow enters the event sourcing replay loop one last time to rebuild the current state from the event stream. This completes the execution of the workflow.

## Summary
The sequence diagram illustrates the workflow starting with the TestActivity and then the TestOtherActivity being executed in series. After both activities complete, the workflow replayed the events in order to rebuild the current state. This process is necessary in order to ensure that the workflow can be resumed after a crash or other interruption.

The need for determinism comes into play when the events are replayed. In order for the workflow to rebuild the correct state, the code for each activity must produce the same result when run multiple times with the same inputs. This means that activities should avoid using things like random numbers (unless using a side effect) or dates, as these will produce different results each time they are run.

The need for idempotency comes into play when an API fails to return a response even though it has actually completed successfully. For example, if an activity charges a customer and is not idempotent, rerunning it after a a failed response could result in the customer being charged twice. To avoid this, activities should be designed to be idempotent.
