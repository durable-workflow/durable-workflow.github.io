---
sidebar_position: 2
title: Getting Started
description: Install Durable Workflow into a Laravel app and run a workflow end to end in a few minutes.
---

# Getting Started

The fastest way to see Durable Workflow work is the maintained sample
application. It installs the Laravel package, runs migrations, starts a
queue worker, and executes a real workflow.

```bash
git clone https://github.com/durable-workflow/sample-app.git
cd sample-app
composer install
php artisan app:init
```

Keep the worker running in one terminal:

```bash
php artisan queue:work
```

Start the example workflow from a second terminal:

```bash
php artisan app:workflow
```

You now have a workflow running through Laravel queues and durable workflow
state. Open `/waterline/dashboard` in the sample app to inspect the run, or
continue with the [sample app guide](/docs/2.0/sample-app).

Not using Laravel? See [Polyglot](/docs/2.0/polyglot/) for the standalone
server, CLI, and Python SDK.
