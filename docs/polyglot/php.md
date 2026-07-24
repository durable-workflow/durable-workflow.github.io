---
sidebar_position: 9
title: PHP SDK
description: Connect framework-neutral PHP applications and remote workers to a self-hosted Server or Cloud managed runtime.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - Durable Workflow PHP SDK
  - PHP remote worker
  - PHP standalone server client
---

# PHP SDK

Use `durable-workflow/sdk` when a PHP application or remote worker connects to
the standalone Durable Workflow Server or a Durable Workflow Cloud namespace
runtime URL. This first-party SDK is framework-neutral: it provides the
control-plane client, authentication, transport, public payload codec, replay
handler, and managed remote-worker lifecycle without requiring Laravel or the
embedded engine package.

For constructor signatures, return types, and exception classes, see the
generated [PHP SDK API reference](https://php.durable-workflow.com/).

Cloud customers use the runtime URL and namespace returned during provisioning,
with separate client and worker credentials. See
[Cloud Managed Runtime](/docs/2.0/polyglot/cloud-control-plane) for that
connection boundary; the examples below show the same SDK against local
self-hosted values.

Use `durable-workflow/workflow` for the separate embedded Laravel path, where
the application owns workflow state in its existing database and executes work
through its Laravel queues. See [Deployment Modes](/docs/2.0/polyglot/deployment-modes/)
for the complete ownership comparison.

## Requirements

- PHP 8.1 or later
- A reachable [self-hosted Server](/docs/2.0/polyglot/server/) or provisioned
  [Cloud namespace runtime](/docs/2.0/polyglot/cloud-control-plane)

## Install

Install the exact PHP SDK version in the current public artifact tuple:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.phpSdkComposerPackage%%
```

The SDK uses the official `apache/avro` Composer package for the public payload
envelope. Its production dependency graph excludes Laravel, Illuminate,
`durable-workflow/workflow`, and `durable-workflow/server`.

## Start and inspect a workflow

Create a client for the standalone server, start a workflow by its registered
string type name, and keep the returned handle for signals, queries, and the
eventual result:

<!-- docs-example id="php.sdk.client" -->
```php
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Auth\TokenAuthentication;
use DurableWorkflow\Client;

$client = new Client(
    'http://localhost:8080',
    new TokenAuthentication('operator-token'),
    namespace: 'production',
);

$handle = $client->startWorkflow(
    workflowType: 'orders.process',
    workflowId: 'order-1001',
    taskQueue: 'orders',
    input: [['order_id' => '1001']],
);

$handle->signal('approve', ['reviewer' => 'Ada']);
var_dump($handle->query('status'));
var_dump($handle->result(timeoutSeconds: 30));
```

`WorkflowHandle` follows the current run after a continue-as-new transition.
Use its selected-run methods when an operation must remain guarded to one
specific run.

## Run a remote PHP worker

Workflow handlers may be ordinary callables or generators. Yielding a command
from `WorkflowContext` records a durable decision; replay sends the recorded
value back into the generator without repeating the external activity.

<!-- docs-example id="php.sdk.worker" -->
```php
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    'http://server:8080',
    token: 'worker-token',
    namespace: 'production',
);
$worker = new Worker($client, 'orders');

$worker->registerActivity(
    'orders.reserve-inventory',
    static fn (ActivityContext $context, string $orderId): array => [
        'order_id' => $orderId,
        'reserved' => true,
    ],
);

$worker->registerWorkflow(
    'orders.process',
    static function (WorkflowContext $context, array $input): Generator {
        return yield $context->activity(
            'orders.reserve-inventory',
            [$input['order_id']],
        );
    },
);

$worker->run();
```

The worker registers its workflow and activity type names, polls the public
worker protocol, heartbeats, completes or fails tasks, and handles graceful
shutdown when `pcntl` is available.

## Protocol and release boundary

The SDK declares its supported server range, worker protocol version,
control-plane version, and payload codecs in Composer metadata. The server also
publishes its accepted protocol and codec set from `GET /api/cluster/info`.
Check runtime discovery during deployment instead of inferring compatibility
from a server patch version.

The PHP SDK is versioned independently from the 2.0 Laravel package. Keep the
exact published pin in runnable prerelease examples and evaluate release notes
when moving between pre-1.0 SDK releases; no cross-release shim is implied.

## Related references

- [Standalone Server](/docs/2.0/polyglot/server/)
- [Deployment Modes](/docs/2.0/polyglot/deployment-modes/)
- [Worker Protocol](/docs/2.0/polyglot/worker-protocol/)
- [Capability Index](/docs/2.0/capabilities/)
- [PHP API reference](https://php.durable-workflow.com/)
- [PHP SDK source](https://github.com/durable-workflow/sdk-php)
