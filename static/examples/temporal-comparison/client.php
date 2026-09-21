<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;

$client = new Client(
    getenv('DURABLE_WORKFLOW_RUNTIME_URL') ?: 'http://localhost:18080',
    namespace: getenv('DURABLE_WORKFLOW_NAMESPACE') ?: 'default',
    controlToken: getenv('DURABLE_WORKFLOW_CLIENT_TOKEN') ?: 'dev-token',
);
$handle = $client->startWorkflow(
    workflowType: 'comparison.php.greeting',
    workflowId: 'comparison-'.bin2hex(random_bytes(8)),
    taskQueue: 'comparison-php',
    input: ['Ada'],
);
echo json_encode($handle->result(timeoutSeconds: 60), JSON_THROW_ON_ERROR).PHP_EOL;
