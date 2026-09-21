<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';
require __DIR__.'/handlers.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;

$client = new Client(
    getenv('DURABLE_WORKFLOW_RUNTIME_URL') ?: 'http://localhost:8080',
    namespace: getenv('DURABLE_WORKFLOW_NAMESPACE') ?: 'default',
    workerToken: getenv('DURABLE_WORKFLOW_WORKER_TOKEN') ?: 'dev-token',
);

Worker::create($client, 'comparison-php')
    ->register(GreetingWorkflow::class, GreetingActivities::class)
    ->run();
