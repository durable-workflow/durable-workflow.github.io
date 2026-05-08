---
slug: learning-durable-workflow-from-the-sample-app
title: "Learning Durable Workflow from the Sample App"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [sample-app, workflow, learning, patterns]
---

Most "how do I learn this thing?" answers are link dumps. A
quickstart, a feature tour, a couple of API references, maybe a video.
You read them and you can recognize the words but you can't yet write
the code, because nothing connects.

For Durable Workflow, there is one answer that connects: the
[Sample App](/docs/2.0/sample-app). It is a runnable Laravel 13
project with one workflow per pattern surface — deterministic chains,
elapsed-time measurement, microservice coordination, browser
automation, webhook-started workflows, AI activity loops, and a
signal-driven travel-agent saga. Each one ships with an artisan
command that runs it, an MCP entry that exposes it to AI clients, and
a Waterline screen that proves the run committed.

This post walks through the loop the sample app is built around:
**read, run, change**. It is the loop we use ourselves when a new
engineer joins the project. Forty-five minutes later they can
explain the difference between a signal and an update, and they have
a workflow they wrote running in Waterline.

<!-- truncate -->

## Read the sample

The sample app's
[README](https://github.com/durable-workflow/sample-app#sample-index)
opens with a sample index — one row per pattern, naming the workflow
class, the artisan command, and the MCP key. That table is the only
map you need; every other piece of the sample app reads from it.

Open
[`App\Workflows\Simple\SimpleWorkflow`](https://github.com/durable-workflow/sample-app/blob/main/app/Workflows/Simple/SimpleWorkflow.php)
first. It is the smallest possible v2 workflow: one activity in, one
activity out, one return value. Reading this class is how you learn
the file shape — `extends Workflow`, the `handle()` method, the use
of the `activity()` function instead of dispatching jobs. After this
class, every other sample reads as the same shape with one new piece.

If you are coming for a specific pattern, jump straight to it:

- **Saga compensation under failure?** Read
  [`App\Workflows\Ai\AiWorkflow`](https://github.com/durable-workflow/sample-app/blob/main/app/Workflows/Ai/AiWorkflow.php).
  It is a real travel-agent loop with hotel, flight, and rental
  bookings; if any leg fails, the registered compensations unwind the
  earlier ones in reverse order.
- **A workflow that parks until an external event?** Read
  [`App\Workflows\Webhooks\WebhookWorkflow`](https://github.com/durable-workflow/sample-app/blob/main/app/Workflows/Webhooks/WebhookWorkflow.php).
  It starts from a webhook and waits on `await('ready')` until a
  signal lands.
- **Elapsed time without replay drift?** Read
  [`App\Workflows\Elapsed\ElapsedTimeWorkflow`](https://github.com/durable-workflow/sample-app/blob/main/app/Workflows/Elapsed/ElapsedTimeWorkflow.php).
  Every clock read is wrapped in `sideEffect()` and stored as an
  integer timestamp.

The point of reading first is that the sample app is not a tutorial
where steps land in order; it is a reference where each workflow is
independent and self-explanatory. You read the one you need.

## Run the sample

Reading is necessary but not sufficient. Until you watch a run land
in Waterline, "durable" is an abstract claim.

Spin up the codespace or run `docker compose up -d --build --wait
app worker` locally. Then, in two terminals:

```bash
# terminal 1
php artisan queue:work

# terminal 2
php artisan app:simple
```

Open `http://localhost:8000/waterline/dashboard`. There is your run.
Click into it and you see the typed history events the workflow class
produced — `ActivityTaskScheduled`, `ActivityTaskCompleted`,
`WorkflowExecutionCompleted`. That list is the on-disk shape of the
class you just read.

Now run a more interesting one:

```bash
php artisan app:webhook
```

The workflow starts and parks on `await('ready')`. Waterline shows
the run in `Waiting` state. From a third terminal, send the signal
the workflow is waiting for, then refresh Waterline — the run
advances to `Completed`, and you can see the `WorkflowExecutionSignaled`
event in the timeline. That is what "signal" means in practice. You
just learned it from a five-second observation, not a paragraph.

Repeat the loop with `app:elapsed`, `app:microservice`, and `app:ai`
(for the last one, set `OPENAI_API_KEY` first; the workflow class
will fail fast if you forget). Each one teaches a different surface,
and each one is forty seconds of clicking around in Waterline after
the run completes.

## Change the sample

The third part of the loop is where the patterns become yours.

Pick a sample workflow you ran. Make a one-line change. Add a
`Log::info(...)` inside an activity. Increase a timer. Replace one
activity call with two parallel ones using `all([...])`. Run the
artisan command again, watch Waterline, and see how the typed history
differs.

This is when you start to feel which calls produce history events
and which calls do not. It is also when you find out which calls
break replay if you mis-place them — the
[Constraints](/docs/2.0/constraints/overview) page describes those
rules abstractly, but you understand them in your bones the first
time you accidentally call `now()` in workflow code and watch the
replay diverge.

When you are ready to build something new, follow the
[Contribute a Sample](/docs/2.0/contribute-a-sample) guide. The
guide describes the contract every merged sample meets: a workflow
class under `app/Workflows/<Pattern>/`, an artisan command, a
`config/workflow_mcp.php` entry, a test, a README index row, a
docs-site gallery row, and a cross-link from the matching pattern
page. If your idea passes the contract, it lands in the sample app
on a predictable cadence and the next engineer learns from it the
same way you just did.

## Why the sample app, and not a tutorial?

A tutorial decays. The minute the workflow package adds a new
attribute, a new function, or a new history event, the tutorial is
at risk of teaching yesterday's API. The sample app does not have
that problem because it is a *project*, not a document. CI runs
every sample on every push. The upstream-coverage manifest names
which features the sample app is expected to demonstrate, marks
each one `covered` or `gap`, and lints on every push. A feature
that ships upstream without a sample becomes visible in the
manifest, not in tribal memory. The
[Sample-App Plan, Phase 4](https://github.com/durable-workflow/workflow/blob/v2/docs/sample-app/plan.md)
spells the cadence out: the pinned `durable-workflow/workflow`
version moves within one release cycle of every upstream tag.

That is also why this post links into the sample app instead of
inlining the workflow code. The class on the
[`main` branch](https://github.com/durable-workflow/sample-app)
is the version that just passed CI; the snippet I might paste into
a blog post would be a snapshot. Read the file in the repo, and you
will read the same code your local run is going to execute.

## What to read next

- [Sample App](/docs/2.0/sample-app) — the reference page, with the
  full sample gallery and pattern-page cross-links.
- [Contribute a Sample](/docs/2.0/contribute-a-sample) — the
  contract for landing a new sample.
- [How It Works](/docs/2.0/how-it-works) — the engine internals
  story for when "the run committed" stops being magic and you want
  to know how.

The fastest way to learn Durable Workflow is to read a sample, run
it in Waterline, and change one line. Forty-five minutes; one loop.
