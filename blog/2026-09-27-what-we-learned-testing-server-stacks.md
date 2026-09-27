---
slug: what-we-learned-testing-server-stacks
title: "What We Learned Testing Durable Workflow Server's HTTP Stacks"
authors: [richard]
tags: [server, performance, php, laravel, reliability]
---

Which HTTP stack should serve Durable Workflow Server? We measured Apache,
PHP-FPM, and persistent PHP workers against the same application workload. The
answer depends on the whole request path, including the time SDK workers spend
waiting for tasks. Here are the results, what they mean for our Server, and why
a different application might choose differently.

<!-- truncate -->

## The results

<!-- Complete this lead section only after Server #137 and #222 have all
     measured results and final decisions. Show a compact six-stack comparison,
     exact published tuple, PHP version, host and container limits, workloads,
     repetitions/variation, offered and completed rates, latency, CPU, memory,
     ordinary API failures and correctness. Put one link to the complete Server
     report at the end, where readers can find raw artifacts. Keep the uncapped
     Apache reference separate. Include the
     verified image size, pull/start and before/after outcome from #222. State
     what each result supports without inventing saturation capacity. -->

## Why a standalone Server is still a Laravel app

Durable Workflow Server presents a language-neutral HTTP protocol to PHP,
Python, and Rust SDKs. Its implementation is a Laravel application. Laravel
handles its API routes and middleware. The published stack runs separate HTTP,
queue worker, and scheduler processes. The queue worker advances durable work.
MySQL holds durable state. Redis supports the queue, cache, and wake signals.
The HTTP process accepts starts and completions, and serves workflow, activity,
and query polls to SDK workers. An SDK client does not need to be written in
PHP just because the Server is.

That structure matters when choosing the front end. An ordinary short API
request enters Laravel and leaves. A long poll can wait for work inside
`LongPoller`.
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

## What else moved the numbers

Workers must wake for the right task. Registering a query poll was needlessly
waking workflow and activity polls, so we separated their wake signals. In a
bounded local test, spaced activity schedule-to-start fell from **3.65 to 3.88
seconds** in five of six old-worker runs to **86 to 184 milliseconds** in six
new-worker runs. The same fix increased Redis commands by about **18%** in one
idle sample. That tradeoff matters when interpreting the benefit. The local
test does not establish a published capacity gain.

We also made readiness detect an unavailable Redis queue and made the
published queue worker restart after a backend interruption. These changes
affect whether a fast Server stays useful through a failure. On the client
side, a worker-count check showed that one SDK worker limited the load test
while four contended for the fixed CPU budget. We sized the test client to
exercise the Server without turning it into the bottleneck.

## What we chose, and what could change the answer

<!-- Complete the recommendation only after reviewing all comparable #137
     results, correctness, recovery, memory, and operational costs. Include
     #222's verified image tuning outcome and released digest. -->

Another application can get a different result. An API with short, CPU-heavy
requests and few idle polls has a different worker-occupancy pattern. A site
whose PHP bootstrap dominates every response could benefit more from
persistent workers. A service with ample memory but tight CPU limits, or one
whose team already operates PHP-FPM, may value the tradeoffs differently. The
useful method is to freeze the application and workload, measure completed
work against total resources, and make readiness and recovery part of the
decision.

The selected image's production tuning measures distribution and cold-start
costs as well as runtime performance. These Server measurements do not qualify
a managed Cloud plan or establish a customer throughput guarantee. The full
methods, results, and raw artifacts are in [the public engineering
report](https://github.com/durable-workflow/server/issues/137).
