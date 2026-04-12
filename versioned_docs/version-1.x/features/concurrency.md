---
sidebar_position: 8
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';
import ThemedImage from '@site/src/components/ThemedImage';

# Concurrency

Activities can be executed in series or in parallel. In either case, you start by using `activity()` to create a new instance of an activity and return a promise that represents the execution of that activity. The activity will immediately begin executing in the background. You can then `yield` this promise to pause the execution of the workflow and wait for the result of the activity, or pass the promise into the `all()` method to wait for a group of activities to complete in parallel.

## Series

This example will execute 3 activities in series, waiting for the completion of each activity before continuing to the next one.

```php
use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        return [
            yield activity(MyActivity1::class),
            yield activity(MyActivity2::class),
            yield activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Series Execution Simulator"
/>

## Parallel

This example will execute 3 activities in parallel, waiting for the completion of all activities and collecting the results.

```php
use function Workflow\{activity, all};
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        return yield all([
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Parallel Execution Simulator"
/>

The main difference between the serial example and the parallel execution example is the number of `yield` statements. In the serial example, there are 3 `yield` statements, one for each activity. This means that the workflow will pause and wait for each activity to complete before continuing to the next one. In the parallel example, there is only 1 `yield` statement, which wraps all of the activities in a call to `all()`. This means that all of the activities will be executed in parallel, and the workflow will pause and wait for all of them to complete as a group before continuing.

## Mix and Match

You can also mix serial and parallel executions as desired.

```php
use function Workflow\{activity, all, async};
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public function execute()
    {
        return [
            yield activity(MyActivity1::class),
            yield all([
                async(fn () => [
                    yield activity(MyActivity2::class),
                    yield activity(MyActivity3::class),
                ]),
                activity(MyActivity4::class),
                activity(MyActivity5::class),
            ]),
            yield activity(MyActivity6::class),
        ];
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 1200, group: 0 },
    { name: 'MyActivity2', duration: 1000, group: 1, subgroup: 'a' },
    { name: 'MyActivity3', duration: 1200, group: 1, subgroup: 'a' },
    { name: 'MyActivity4', duration: 1800, group: 1 },
    { name: 'MyActivity5', duration: 1400, group: 1 },
    { name: 'MyActivity6', duration: 1000, group: 2 },
  ]}
  mode="mix"
  title="Mix and Match Simulator"
/>

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNpVUstuwjAQ_BVrzwHhYBOSQyVa2kOVSIhyKsnBJYZYSmzkOG0p4t_rvFqzJ8_szKzX8hUOKucQwbFUX4eCaYN261SmEtla7ZPL6mDEpzAXnI1s3XycNDsXaPO43zayRkKiDdOsLHmZ9ZK2cqG59SqJ4u1ovbPHzy-7v4A3rgWvHXtbMXYu4GdoMnlAse9wc8fAZe6OSYijI44uoU6DDo3BPKzdD8IuSsgdoqM29jvi1clcDJkJ6VsDoiMCD05a5BAZ3XAPKq4r1kK4tsoUTMErnkJkjzk_sqY0KaTyZm1nJt-VqkanVs2pgOjIytqi5pwzw9eC2df9l9jFuH5SjTQQhV0CRFf4hojMwmmIKcYzQv1lGPjEg4ulF9NlQMKALqmP54sAk5sHP93Qme1QD3gujNJJ_2u6z3P7BSs8q2k?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNpVUstuwjAQ_JVozwElthMFHyrR0h6qREKUUxsOLjHEamIjx2lLEf9e54XMnjyzM7NeyxfYq4IDhUOlfvYl08bbrnKZS8_W8iM7L_dGfAtzDncT27SfR81Opbd-_Ni0svGE9NZMs6ri1W6QdFUIza1XSS_dTNY7e_r8sr0FvHEteOPYu0pD5wJo581mD16KHA47Bi4Ld0xGHB1xdFnkNKKxMZrHtYdBoYsycoeiSZuinnh1MuMxMyNDa0TRhMCHoxYFUKNb7kPNdc06CJdOmYMpec1zoPZYMP2VQy6v1nNi8l2perJp1R5LoAdWNRa1p4IZvhLMPm19Y7Vdi-sn1UoDNFqQPgToBX6B4jCZLyJbQYiCJMbYhzPQEAfzmJAFIihGBCdXH_76oZZGuKcICTBCSeIDL4RROhv-T_-Nrv-BIKzD?type=png"
  lightLink="https://mermaid.live/edit#pako:eNpVUstuwjAQ_BVrzwHhYBOSQyVa2kOVSIhyKsnBJYZYSmzkOG0p4t_rvFqzJ8_szKzX8hUOKucQwbFUX4eCaYN261SmEtla7ZPL6mDEpzAXnI1s3XycNDsXaPO43zayRkKiDdOsLHmZ9ZK2cqG59SqJ4u1ovbPHzy-7v4A3rgWvHXtbMXYu4GdoMnlAse9wc8fAZe6OSYijI44uoU6DDo3BPKzdD8IuSsgdoqM29jvi1clcDJkJ6VsDoiMCD05a5BAZ3XAPKq4r1kK4tsoUTMErnkJkjzk_sqY0KaTyZm1nJt-VqkanVs2pgOjIytqi5pwzw9eC2df9l9jFuH5SjTQQhV0CRFf4hojMwmmIKcYzQv1lGPjEg4ulF9NlQMKALqmP54sAk5sHP93Qme1QD3gujNJJ_2u6z3P7BSs8q2k"
  darkLink="https://mermaid.live/edit#pako:eNpVUstuwjAQ_JVozwElthMFHyrR0h6qREKUUxsOLjHEamIjx2lLEf9e54XMnjyzM7NeyxfYq4IDhUOlfvYl08bbrnKZS8_W8iM7L_dGfAtzDncT27SfR81Opbd-_Ni0svGE9NZMs6ri1W6QdFUIza1XSS_dTNY7e_r8sr0FvHEteOPYu0pD5wJo581mD16KHA47Bi4Ld0xGHB1xdFnkNKKxMZrHtYdBoYsycoeiSZuinnh1MuMxMyNDa0TRhMCHoxYFUKNb7kPNdc06CJdOmYMpec1zoPZYMP2VQy6v1nNi8l2perJp1R5LoAdWNRa1p4IZvhLMPm19Y7Vdi-sn1UoDNFqQPgToBX6B4jCZLyJbQYiCJMbYhzPQEAfzmJAFIihGBCdXH_76oZZGuKcICTBCSeIDL4RROhv-T_-Nrv-BIKzD"
  alt="Mix and Match Execution Flow"
/>

Activity 1 will execute and complete before any other activities start. Activities 2 and 3 will execute in series, waiting for each to complete one after another before continuing. At the same time, activities 4 and 5 will execute together in parallel and only when they all complete will execution continue. Finally, activity 6 executes last after all others have completed.

## Child Workflows in Parallel

You can pass child workflows to `all()` along with other activities. It works the same way as parallel activity execution, but for child workflows. It allows you to fan out multiple child workflows and wait for all of them to complete together.

```php
use function Workflow\{all, child};

$results = yield all([
    child(MyChild1::class),
    child(MyChild2::class),
    child(MyChild3::class),
]);
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Child Workflows in Parallel Simulator"
/>

This makes it easy to build hierarchical parallelism into your workflows.
