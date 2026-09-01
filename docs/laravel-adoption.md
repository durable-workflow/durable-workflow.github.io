---
sidebar_position: 4
title: Laravel Adoption and Runtime Transition
description: Move a Laravel workflow fleet from v1 to Durable Workflow 2.0 embedded or service mode without losing framework integration or runtime ownership clarity.
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - Laravel Durable Workflow migration
  - Laravel service mode
  - v1 to v2 migration
  - embedded to service mode
---

# Laravel Adoption and Runtime Transition

Laravel applications have two first-party Durable Workflow 2.0 destinations.
Embedded mode keeps durable execution inside the application. Service mode
keeps Laravel as the application and worker framework while Cloud or a
self-hosted Server owns durable state.

This is the decision and transition page for three journeys:

1. Stable v1 Laravel to 2.0 embedded.
2. Stable v1 Laravel to the 2.0 PHP SDK in service mode.
3. 2.0 embedded Laravel to the 2.0 PHP SDK in service mode.

If your immediate goal is a package-level v1 upgrade, keep the detailed
[2.0 migration guide](/docs/migration/) open beside this page. If you have
already selected a self-hosted service runtime, continue with the
[embedded-to-Server runbook](/docs/polyglot/embedded-to-server/) after
choosing the transition policy here.

## Pick the destination

| Starting point | Destination | Choose it when | First transition boundary |
| --- | --- | --- | --- |
| Stable v1 Laravel | 2.0 embedded | The Laravel app should continue to own workflow persistence, queues, execution, and embedded Waterline. | Upgrade the maintained `durable-workflow/workflow` package to the 2.0 release line. Existing v1 runs finish through the package's v1 compatibility path; new starts use v2. |
| Stable v1 Laravel | PHP SDK service mode | Laravel should keep dependency injection, configuration, Artisan, logging, events, and test fakes, but Cloud or Server should own durable state. | Install `durable-workflow/sdk` as a separate service client/worker boundary. v1 history and durable Laravel queue jobs stay on the v1 runtime until terminal. |
| 2.0 embedded Laravel | PHP SDK service mode | The application should stop owning the orchestration runtime or needs a shared/polyglot runtime boundary. | Route new starts to the service runtime after its workers are ready. Drain embedded runs where they started, or use the explicit eligible embedded-v2 import procedure for self-hosted Server. |

The PHP SDK bridge and the embedded package support Laravel 9 through 13 on
their compatible PHP versions. A supported v1 application can therefore choose
either destination without an unrelated Laravel upgrade.

## Compare the ownership boundary

| Concern | Stable v1 Laravel | 2.0 embedded Laravel | 2.0 PHP SDK service mode |
| --- | --- | --- | --- |
| Runtime owner | The Laravel application owns orchestration and replay. | The Laravel application owns the v2 engine, history, matching, timers, and replay. | Cloud operates the namespace runtime, or your team operates a self-hosted Server. Laravel runs clients and remote workers, not the runtime. |
| Composer package | `durable-workflow/workflow` on the stable 1.x line. | `durable-workflow/workflow` from the 2.0 artifact authority. | `durable-workflow/sdk` from the independently published PHP SDK authority. It does not depend on the embedded engine. |
| Required processes | Laravel web/CLI processes plus Laravel queue workers or Horizon. | Laravel web/CLI processes plus queue workers or Horizon; scheduler and repair roles follow the embedded deployment configuration. | Laravel application processes plus one or more `php artisan durable-workflow:worker` processes. Cloud supplies the runtime. Self-hosting additionally requires Server and its persistence. |
| Queues and storage | Workflow rows and PHP-oriented history live in configured Laravel databases; workflow, activity, retry, and timer jobs live in Laravel queue backends. | Event history and projections live in the application's configured database; embedded tasks normally use Laravel queues. | Durable history and task state live in Cloud or Server persistence. `DURABLE_WORKFLOW_TASK_QUEUE` is a remote task-queue identity polled by the SDK worker, not a Laravel queue connection. |
| Workflow/activity identity | PHP workflow and activity classes are durable identities. | Configure stable aliases under `workflows.v2.types`; classes remain local implementations. | `#[Workflow('orders.fulfill')]` and `#[Activity('orders.reserve')]` publish stable string type keys during worker registration. Do not use PHP FQCNs as the cross-runtime contract. |
| Credentials | Laravel application, database, cache, and queue credentials; the original `APP_KEY` remains part of v1 recovery. | Laravel application credentials plus the database, cache, queue, and any embedded Waterline authentication owned by the host app. | Cloud application processes receive only a control credential and worker processes only a worker credential. A self-hosted deployment may use one shared token or equivalent scoped credentials. Credentials are process inputs and are deliberately absent from cached Laravel configuration. |
| Operational tooling | Laravel logs/events, queue tooling, Horizon, v1 Waterline, and `workflow:v1:list` where available. | Laravel logs/events, queue tooling, `workflow:v2:doctor`, history/repair commands, and embedded Waterline. | SDK diagnostics flow through Laravel's PSR logger and `WorkerDiagnosticEvent`. Cloud includes Managed Waterline. Self-hosted operators use Server APIs/CLI and may deploy Waterline separately against the Server namespace. |
| Cutover and rollback owner | Your team preserves the v1 database, queue state, configuration, and secrets as one recovery set. | Your team separates v1 and v2 starts, retains v1 wake paths, and decides when old tables/queues can be retired. | Your team routes each command to the runtime that owns its run. Cloud owns runtime rollback inside the managed service; self-hosted operators own Server persistence and rollback. Application rollback must keep both old and new runtime routes until their runs are terminal. |

Cloud and self-hosted Server are alternatives inside service mode. Cloud users
do not install Server or a separate Waterline service. Self-hosted operators
deploy, secure, back up, scale, and upgrade Server; Waterline is a separate
optional deployment against the Server-owned namespace.

## One Laravel use case in all three modes

The examples reserve inventory for `orders.fulfill`. Map the stable v1 class to
the v2 type keys deliberately, then keep those v2 type keys and the configured
task queue stable. Inventory reservation and the business event consumer must
be idempotent because an activity can execute more than once after a retry or
lost completion acknowledgement.

The application action remains the same in production and tests:

| Mode | Production entry point | Entry point after enabling its fake |
| --- | --- | --- |
| Stable v1 Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| 2.0 embedded Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| PHP SDK service mode | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

Laravel constructor injection remains available at the application boundary in
every mode. Stable v1 injects activity dependencies into `execute()`. Embedded
v2 and service mode both ask Laravel's container to construct workflow and
activity objects, so their application dependencies use ordinary constructors.
Keep anything read by a replayed workflow deterministic and config-backed;
database, network, clock, and other side effects belong in activities.

### Stable v1 Laravel

Keep the [stable installation](/docs/installation/) and its real queue-driver
requirements. This representative implementation uses a constructor-injected
application starter and method-injected activity services:

<!-- docs-example id="laravel.adoption.v1.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\Activity;
use Workflow\Workflow;
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;
use function Workflow\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public function execute(string $orderId): \Generator
    {
        return yield activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public function execute(
        OrderPolicy $orders,
        InventoryGateway $inventory,
        LoggerInterface $logger,
        Dispatcher $events,
        string $orderId,
    ): array {
        $orders->assertFulfillable($orderId);
        $reservation = $inventory->reserve($orderId);
        $logger->info('Inventory reserved', ['order_id' => $orderId]);
        $events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        $workflow = WorkflowStub::make(FulfillOrderWorkflow::class);
        $workflow->start($orderId, new WorkflowOptions('redis', 'orders'));
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

`config/queue.php` and the deployment environment still select the real
Laravel queue connection. Run a worker for the configured queue:

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

The stable fake runs the same injected application action used in production:

<!-- docs-example id="laravel.adoption.v1.fake" -->
```php
<?php

use Workflow\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Laravel event assertions remain available when testing the real activity. Do
not replace v1 workers merely because the v2 SDK has been added elsewhere in
the application.

### 2.0 embedded Laravel

The stable install uses the same Workflow package as the embedded quickstart:

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

Publish or update `config/workflows.php`, then give the same business contract
stable aliases. The published file contains additional required v1 and v2
settings; merge these values into its existing arrays instead of replacing the
complete file with this focused excerpt:

<!-- docs-example id="laravel.adoption.v2-embedded.config" -->
```php
<?php

return [
    'v2' => [
        'namespace' => env('DW_V2_NAMESPACE', 'production'),
        'types' => [
            'workflows' => [
                'orders.fulfill' => App\Workflows\FulfillOrderWorkflow::class,
            ],
            'activities' => [
                'orders.reserve' => App\Activities\ReserveInventoryActivity::class,
            ],
        ],
    ],
];
```

The authoring API changes to `handle()` and no longer yields activity results.
Laravel constructs both objects, while the activity remains the right place
for logging and business events that represent side effects:

<!-- docs-example id="laravel.adoption.v2-embedded.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\V2\Activity;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        WorkflowStub::make(FulfillOrderWorkflow::class, "order-{$orderId}")
            ->start($orderId);
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

Run the Laravel queue worker exactly as an embedded deployment requires:

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Use the embedded fake through the same application action. It executes ready
workflow tasks inline and records activity dispatches:

<!-- docs-example id="laravel.adoption.v2-embedded.fake" -->
```php
<?php

use Workflow\V2\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');
while (WorkflowStub::runReadyTasks() > 0) {
}

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

This fake exercises embedded durable rows and history. It is not the SDK client
fake and does not stand in for a service runtime.

### PHP SDK service mode in Laravel

Install the independently published SDK package. This command is rendered from
the published PHP SDK artifact authority, not copied from a point release:

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9 through 13 auto-discover the provider. Publish the package
configuration and list the attributed handler classes:

<!-- docs-example id="laravel.adoption.service.config" -->
```php
<?php

return [
    'runtime_url' => env('DURABLE_WORKFLOW_RUNTIME_URL', 'http://localhost:8080'),
    'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'production'),
    'task_queue' => env('DURABLE_WORKFLOW_TASK_QUEUE', 'orders'),
    'handlers' => [
        App\Workflows\FulfillOrderWorkflow::class,
        App\Activities\ReserveInventoryActivity::class,
    ],
    'poll_timeout_seconds' => 5,
];
```

The service workflow uses the same public strings as embedded v2. Laravel
container-constructs both attributed service classes:

<!-- docs-example id="laravel.adoption.service.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;

final class FulfillOrderWorkflow
{
    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    #[Workflow('orders.fulfill')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return $context->activity('orders.reserve', [$orderId]);
    }
}

final class ReserveInventoryActivity
{
    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    #[Activity('orders.reserve')]
    public function run(ActivityContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}
```

Application code injects the Laravel-native SDK interface instead of reaching
through a facade or assembling a transport client. The attributed class
supplies the workflow type, and published configuration supplies the default
task queue:

<!-- docs-example id="laravel.adoption.service.client" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\LaravelWorkflowClientInterface;
use DurableWorkflow\WorkflowHandleInterface;

final class StartOrderFulfillment
{
    public function __construct(
        private readonly LaravelWorkflowClientInterface $workflows,
    ) {
    }

    public function start(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->start(
            FulfillOrderWorkflow::class,
            [$orderId],
            workflowId: "order-{$orderId}",
        );
    }

    public function handle(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->handle(
            FulfillOrderWorkflow::class,
            "order-{$orderId}",
        );
    }
}
```

After publishing the configuration, cache only non-secret settings. Set
`RUNTIME_URL` to the complete provisioned Cloud namespace runtime URI or to the
self-hosted Server origin; do not append `/api`.

Start the worker with only its worker-role credential:

<!-- docs-example id="laravel.adoption.service.worker" -->
```bash
php artisan vendor:publish --tag=durable-workflow-config
env -u DURABLE_WORKFLOW_TOKEN \
  -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  -u DURABLE_WORKFLOW_WORKER_TOKEN \
  DURABLE_WORKFLOW_RUNTIME_URL="$RUNTIME_URL" \
  DURABLE_WORKFLOW_NAMESPACE=production \
  DURABLE_WORKFLOW_TASK_QUEUE=orders \
  php artisan config:cache
env -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  DURABLE_WORKFLOW_WORKER_TOKEN="$WORKER_SECRET" \
  php artisan durable-workflow:worker
```

With no `--queue` override, the Artisan worker polls the configured `orders`
task queue. Its registered-and-polling diagnostic names the runtime, namespace,
queue, attributed workflow/activity types, and worker credential role before
normal polling begins.

Application/web/queue processes instead receive
`DURABLE_WORKFLOW_CLIENT_TOKEN` and not the worker token. Self-hosted operators
may use `DURABLE_WORKFLOW_TOKEN` when one credential is intentionally authorized
for both roles.

The SDK worker writes lifecycle, retry, handler-failure, and shutdown
diagnostics through Laravel's PSR logger and dispatches
`DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` through Laravel events.
Business activities can keep using the injected logger and event dispatcher as
shown above.

The shipped facade fake replaces the same injected interface used by
application code:

<!-- docs-example id="laravel.adoption.service.fake" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\Facades\DurableWorkflow;

$workflows = DurableWorkflow::fake()
    ->setWorkflowResult('order-1001', ['status' => 'fulfilled']);

app(StartOrderFulfillment::class)->start('1001');
$result = app(StartOrderFulfillment::class)->handle('1001')->result();

$this->assertSame(['status' => 'fulfilled'], $result);
$workflows->assertWorkflowStarted(
    FulfillOrderWorkflow::class,
    ['1001'],
    workflowId: 'order-1001',
);
$workflows->assertResultRequested('order-1001');
```

This fake proves the Laravel application interaction without requiring Cloud or
Server. Use the SDK's worker test harness when testing workflow/activity handler
commands; the client fake does not execute remote worker code.

## Drain, cut over, and roll back

Changing a Composer requirement does not move an in-flight workflow, its
history, a delayed timer, an activity retry, or a ready/reserved queue job.
Treat the old and new runtimes as separate durable systems throughout the
transition.

### 1. Establish the recovery cut

Before changing traffic:

- Inventory the v1/embedded database connection, every configured workflow and
  activity queue, queue backend account/region/prefix, cache locks, and the
  secret-manager reference for the original `APP_KEY`.
- Block new starts and message ingress long enough to quiesce the source. Stop
  every worker after its current job boundary; `queue:restart` alone is not a
  quiesce when a supervisor immediately replaces the process.
- Either drain all source runs, or capture an application-consistent recovery
  cut containing SQL plus every ready, delayed, and reserved queue job. A
  database-only backup does not recreate queue-backed timers, retries, or
  activities.
- Record which runtime owns each nonterminal workflow ID. Signals, queries,
  updates, cancellation, termination, repair, and result reads must continue to
  follow that ownership record.

### 2. Apply the path-specific rule

| Transition | Existing nonterminal runs | New runs after cutover | Rollback boundary |
| --- | --- | --- | --- |
| v1 to 2.0 embedded | Finish through the v1 compatibility path. Retain their v1 tables, PHP decoding requirements, Laravel queue consumers, and queue state until terminal. | Start through `Workflow\V2\WorkflowStub` only after the v2 canary passes. | Restore the matched v1 SQL/queue recovery cut and exact app configuration, or fix forward. Do not restore SQL over newer queue state. |
| v1 to Cloud or self-hosted service mode | Stay on v1. v1 history cannot be imported into the service runtime or replayed by remote workers. | Start with `LaravelWorkflowClientInterface` after a registered SDK worker advertises the expected type keys. | Route new starts back to v1 only if the v1 runtime remains healthy. Runs already accepted by service mode stay there. |
| Embedded v2 to Cloud | Drain embedded runs in place; Cloud onboarding does not turn a package change into history import. | Start in the provisioned Cloud namespace after client/worker credential and task-queue checks pass. | Route new starts back to embedded if needed; keep commands for Cloud-accepted runs pointed at Cloud. |
| Embedded v2 to self-hosted Server | Drain in place, or separately perform the supported export, dry-run, and atomic import for an eligible quiesced embedded-v2 run. Never infer eligibility from package installation. | Start through the SDK after Server discovery, namespace, worker registration, and queue checks pass. | A failed import writes no partial run. After a committed import, Server owns that run; do not resume the embedded copy. |

For the self-hosted import option, use the complete
[embedded-to-Server migration procedure](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs).
It rejects v1, redacted history, leased tasks, running activity attempts, and
other unsafe snapshots. History export by itself is audit/debugging data; only
that explicit validated import operation creates Server-owned state.

### 3. Prove the destination before switching traffic

1. Configure one namespace, task queue, and stable workflow/activity type set.
2. Start the destination runtime and its SDK workers beside the old runtime.
3. Verify Server discovery or Cloud provisioning, role credentials, worker
   registration, advertised type keys, task-queue visibility, and Laravel
   diagnostics.
4. Send a uniquely identified shadow/canary order and wait for a terminal
   result in the destination's operator surface.
5. Switch new starts one workflow family at a time. Prevent the same business
   key from starting in both runtimes.
6. Keep source workers, queue state, credentials, logs/events, and the old
   operator surface until every source-owned run is terminal or has completed a
   supported self-hosted import.

Retiring an old package, queue, table, secret, or Waterline deployment is the
last step, never the cutover mechanism.

## Continue with the chosen path

- [Stable v1 installation](/docs/installation/)
- [Stable v1 migration planning](/docs/migration/)
- [2.0 embedded installation](/docs/installation/)
- [Detailed v1-to-v2 package migration](/docs/migration/)
- [PHP SDK service mode](/docs/polyglot/php/)
- [Cloud managed runtime](/docs/polyglot/cloud-control-plane/)
- [Self-hosted Server](/docs/polyglot/server/)
- [Embedded v2 to self-hosted Server](/docs/polyglot/embedded-to-server/)
