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

We tested six ways to serve the same Laravel application. In a two-hour run,
each stack handled short API requests while twelve synthetic workers kept a
mix of workflow, activity, and query polls active. The HTTP side had one CPU
and 1 GiB of memory. MySQL, Redis, the queue worker, and SDK workers had their
own fixed limits. These runs used published Server 2.4.15, PHP 8.3.35, and
the same standard one-activity workflow. Every completed workflow had its
result and ordered history checked.

| HTTP model | Workflows completed | Workflow p95 | Peak HTTP memory | Ordinary API gate |
| --- | ---: | ---: | ---: | --- |
| Apache prefork + mod_php | 811/811 | 11.62 s | 138.5 MiB | Passed |
| nginx + PHP-FPM | 790/790 | 13.12 s | 159.9 MiB | Passed |
| Apache event + PHP-FPM | 788/788 | 13.34 s | 181.6 MiB | One readiness failure |
| Octane + FrankenPHP | 857/857 | 11.87 s | 304.2 MiB | Passed |
| Octane + Swoole | 684/684 | 13.15 s | 755.5 MiB | Timed out |
| Octane + OpenSwoole | 702/702 | 12.77 s | 749.2 MiB | Timed out |

The two-hour runs test sustained behavior and whether ordinary API calls
remain available. Their closed-loop workflow totals are not a maximum
throughput ranking. Apache, nginx/FPM, and FrankenPHP passed that gate.
Apache event/FPM had a readiness failure. Swoole and OpenSwoole completed
their workflows but timed out ordinary requests under this load.

We also repeated a fixed-rate workload on the newer published Server 2.4.26
application, bundled Workflow 2.2.18, and PHP SDK 2.1.5. Two SDK workers
offered 75 workflows at 1.25 starts per second for 60 seconds. Each run
included a measured drain, so a late completion did not count as work
finished during the offer.

| HTTP model | Completed during the 60-second offer | Completed after drain | HTTP CPU per completed workflow | HTTP memory after load |
| --- | ---: | ---: | ---: | ---: |
| Apache | 37 to 38 of 75 | 75 of 75 | 1.20 to 1.22 s | About 79 MiB |
| Swoole, eight workers | 53 to 61 of 75 | 75 of 75 | 0.90 to 0.97 s | 365 to 390 MiB |
| OpenSwoole, four workers | 56 to 62 of 75 | 75 of 75 | 0.89 to 0.92 s | 289 to 304 MiB |

That is a real speed advantage for the coroutine runtimes in this local
workload, with a substantial memory cost. Apache's three recheck windows
finished 37 to 38 workflows during the offer. The Swoole and OpenSwoole
ranges show their variation across three windows each. All work completed,
with no final backlog, swap, or result errors. A larger host might make the
memory trade worthwhile. On a small all-in-one Server, HTTP memory also has
to leave room for MySQL, Redis, the queue worker, and the operating system.

## Why a standalone Server is still a Laravel app

Durable Workflow Server presents a language-neutral HTTP protocol to PHP,
Python, and Rust SDKs. Its implementation is a Laravel application. Laravel
handles its API routes and middleware. The published stack runs separate HTTP,
queue worker, and scheduler processes. The queue worker advances durable work.
MySQL holds durable state. Redis supports the queue, cache, and wake signals.
The HTTP process accepts starts and completions, and serves workflow, activity,
and query polls to SDK workers.

That structure matters when choosing the front end. An ordinary short API
request enters Laravel and leaves. A long poll can wait for work inside
`LongPoller`. In the current implementation, that wait occupies the PHP
execution slot handling the request. A web server may accept many connections,
but it cannot make a finite pool of busy PHP workers unlimited. The process limit,
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
of the stack choice.

## What else moved the numbers

Workers must wake for the right task. Registering a query poll was needlessly
waking workflow and activity polls, so we separated their wake signals. In a
local six-run comparison, spaced activity schedule-to-start fell from **3.65
to 3.88 seconds** in five of six old-worker runs to **86 to 184 milliseconds**
in all six new-worker runs.

We also made readiness detect an unavailable Redis queue and made the
published queue worker restart after a backend interruption. These changes
affect whether a fast Server stays useful through a failure. On the client
side, a worker-count check showed that one SDK worker limited the load test
while four contended for the fixed CPU budget. We sized the test client to
exercise the Server without turning it into the bottleneck.

## What we chose, and what could change the answer

We kept Apache prefork with mod_php as the Server default. It passed the
two-hour mixed-request gate, kept the smallest HTTP memory footprint of the
passing stacks, and needs the fewest extra moving parts. The faster Swoole
and OpenSwoole local runs are valuable evidence, but their memory use and
ordinary API timeouts kept them out of this small-host default.

We then tuned the selected Apache image. The released Server 2.4.27 image
removes build-time Git while keeping the PHP extensions, Node and Python
tools used by the published conformance runner, and the existing Apache and
OPcache settings. Its compressed layers are 19.5 MB smaller on both amd64
and arm64. The amd64 visible root filesystem is about 32 MB smaller. Three
repeated fixed-load runs and a fresh baseline check showed similar completed
work, CPU use, latency, and memory. The gain is less data to transfer and
store, with the same application behavior. The exact published image passed
PHP, Python, and Rust lifecycle checks, plus recovery after MySQL and Redis
interruptions.

Another application can get a different result. An API with short, CPU-heavy
requests and few idle polls has a different worker-occupancy pattern. A site
whose PHP bootstrap dominates every response could benefit more from
persistent workers. A service with ample memory but tight CPU limits, or one
whose team already operates PHP-FPM, may value the tradeoffs differently. The
useful method is to freeze the application and workload, measure completed
work against total resources, and make readiness and recovery part of the
decision.

The local pull took about 21 seconds for either image with a shared base layer
cached. Fresh stacks reached readiness in about a minute and a half, including
MySQL initialization and migrations. Cloud plan qualification is a separate
step. The full methods, results, and raw artifacts are in
[the public engineering report](https://github.com/durable-workflow/server/issues/137#issuecomment-5892913410).
