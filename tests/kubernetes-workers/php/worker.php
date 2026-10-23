<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client(
    baseUri: getenv('DW_SERVER_URL'),
    namespace: getenv('DW_NAMESPACE'),
    workerToken: getenv('DW_WORKER_TOKEN'),
    requestTimeoutSeconds: 5,
);
$worker = new Worker($client, getenv('DW_TASK_QUEUE'), workerId: getenv('DW_WORKER_ID'));
$worker->registerWorkflow('website336.echo', function (WorkflowContext $context, string $name): mixed {
    return $context->activity('website336.greet', [$name]);
});
$worker->registerActivity('website336.greet', function (ActivityContext $context, string $name): array {
    return ['sdk' => 'php', 'name' => $name, 'worker_id' => getenv('DW_WORKER_ID')];
});
$worker->run(pollTimeoutSeconds: 1);
echo json_encode(['event' => 'worker_stopped', 'sdk' => 'php'], JSON_THROW_ON_ERROR).PHP_EOL;
