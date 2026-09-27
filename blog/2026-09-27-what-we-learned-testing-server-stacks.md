---
slug: what-we-learned-testing-server-stacks
title: "What We Learned Testing Durable Workflow Server's HTTP Stacks"
authors: [richard]
tags: [server, performance, php, laravel, reliability]
---

Which HTTP stack should serve Durable Workflow Server? We expected a comparison
of Apache, PHP-FPM, and persistent PHP workers. The measurements first exposed
problems that an HTTP server swap could never solve: how idle workers wake up,
whether readiness tells the truth, and whether the load generator has enough
workers to exercise the server.

The investigation has also produced a practical runtime recommendation. Here
is the architecture behind that choice, the evidence for it, and the limits of
what we measured.

<!-- truncate -->

## Why a standalone Server is still a Laravel app

Durable Workflow Server presents a language-neutral HTTP protocol to PHP,
Python, and Rust SDKs. Its implementation is a
[Laravel application](https://github.com/durable-workflow/server/blob/main/composer.json):
Laravel bootstraps its
[API routes and middleware](https://github.com/durable-workflow/server/blob/main/bootstrap/app.php),
and its [published Compose stack](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml)
runs separate HTTP, queue-worker, and scheduler processes. The queue worker
advances durable work; MySQL holds durable state; Redis supports the queue,
cache, and wake signals. The HTTP process accepts starts and completions, and
serves workflow, activity, and query polls to SDK workers. An SDK client does
not need to be written in PHP just because the Server is.

That structure matters when choosing the front end. An ordinary short API
request enters Laravel and leaves. A long poll can wait for work inside
[`LongPoller`](https://github.com/durable-workflow/server/blob/main/app/Support/LongPoller.php).
In the current implementation, that wait occupies the PHP execution slot
handling the request. A web server may accept many connections, but it cannot
make a finite pool of busy PHP workers unlimited. The exact process limit,
memory per waiting worker, wakeup path, and responsiveness of ordinary API
requests matter more than the web server's name.

The candidates change how those slots are provided:

| Model | What serves Laravel requests | Operational question |
| --- | --- | --- |
| Apache prefork + mod_php | Apache child processes run PHP | How many children fit in memory, and when should they recycle? |
| nginx + PHP-FPM | nginx proxies to a separate PHP process pool | Does separating connections from PHP work help enough to justify another process and configuration? |
| Apache event + PHP-FPM | Apache event MPM proxies to PHP-FPM | Does its connection handling change the result for this workload? |
| Octane + FrankenPHP, Swoole, or OpenSwoole | Long-lived PHP application workers | Can we gain capacity while preserving request isolation, recovery, and a bounded worker lifetime? |

Persistent workers also keep Laravel state in memory between requests. That
can remove repeated bootstrap work, but it makes cross-request state reset,
authentication isolation, stale backend connections, and clean recycling part
of the correctness test. We did not treat a fast response as proof that those
contracts hold.

## The bugs the comparison found first

Workflow, activity, and query workers share a task queue, but their polls must
wake for the right reasons. We found that registering a query poll broadcast a
wake signal to workflow and activity polls, even when no matching work had
arrived. The [Server fix](https://github.com/durable-workflow/server/pull/195)
separates that signal and adds a capability-gated notification when another
task kind really is ready. In a disposable local source-pair test, five of six
old-worker runs had spaced activity schedule-to-start times of **3.65–3.88
seconds**; all six new-worker runs were **86–184 milliseconds**. Those are
bounded local observations, not a published throughput claim. One idle sample
also saw about **18% more Redis commands**, a cost to keep measuring.

The same work exposed an unreliable health signal. When the required Redis
queue was unavailable, `/api/ready` could return 200 while the Laravel queue
worker had exited. [Readiness now probes the configured queue](https://github.com/durable-workflow/server/pull/189)
and returns 503 when it cannot reach it. That check reports a necessary backend
condition; process supervision is still a separate responsibility. In the
published Compose stack, the queue worker lacked a restart policy. The
[supervision fix](https://github.com/durable-workflow/server/pull/191) gives it
`unless-stopped`; a disposable Redis-interruption fixture then showed the
worker recovering automatically and a subsequent four-workflow canary
completing. That is evidence for this recovery path, not a general failover
guarantee.

Finally, the first comparison was testing its own client-side ceiling. With
one SDK worker, adding HTTP capacity did little; two workers helped the
diagnostic run, while four on a fixed CPU budget made contention worse. The
[worker-count matrix](https://github.com/durable-workflow/server/issues/137#issuecomment-5838172790)
changed the load generator before we judged the Server. A benchmark must
measure the intended system, not accidentally cap it with its client.

## How we compared the stacks

<!-- Complete this section from Server #137 after all six fixed-envelope runs.
     Name the exact Server digest, bundled Workflow and published SDK tuple,
     PHP version, hardware, host and container limits, workload, warmup and
     measured window, repetitions, and raw artifact links. Keep the uncapped
     Apache pass in a separate reference row. State that the current soak is
     closed-loop and does not determine saturation capacity. -->

## What we chose, and what could change the answer

<!-- Complete the recommendation only after reviewing all comparable results,
     correctness, recovery, memory, and operational costs. Mention Server #222
     image tuning if qualified by publication, otherwise state its status. -->

Another application can get a different result. An API with short, CPU-heavy
requests and few idle polls has a different worker-occupancy pattern. A site
whose PHP bootstrap dominates every response could benefit more from
persistent workers. A service with ample memory but tight CPU limits, or one
whose team already operates PHP-FPM, may value the tradeoffs differently. The
useful method is to freeze the application and workload, measure completed
work against total resources, and make readiness and recovery part of the
decision.

The [Server investigation](https://github.com/durable-workflow/server/issues/137)
and its raw comparison artifacts are public. The selected image's separate
[production-tuning work](https://github.com/durable-workflow/server/issues/222)
measures distribution and cold-start costs as well as runtime performance.
These Server measurements do not qualify a managed Cloud plan or establish a
customer throughput guarantee.
