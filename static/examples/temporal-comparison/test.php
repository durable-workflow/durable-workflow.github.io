<?php

declare(strict_types=1);

use DurableWorkflow\Client;
use DurableWorkflow\Testing\WorkerTestHarness;
use DurableWorkflow\Worker;

if (!class_exists(Client::class)) {
    require __DIR__.'/vendor/autoload.php';
}
require __DIR__.'/handlers.php';

$client = new Client('http://localhost:8080');
$worker = Worker::create($client, 'comparison-php')
    ->register(GreetingWorkflow::class, GreetingActivities::class);
$harness = new WorkerTestHarness($worker);
$harness->assertWorkflowEmits('comparison.php.greeting', 'schedule_activity', ['Ada']);
$harness->assertActivityResult('comparison.php.greet', 'Hello, Ada!', ['Ada']);
$codec = $client->payloadCodec();
$replay = $harness->runWorkflow('comparison.php.greeting', ['Ada'], [
    ['event_type' => 'ActivityScheduled', 'payload' => ['sequence' => 1, 'activity_type' => 'comparison.php.greet']],
    ['event_type' => 'ActivityCompleted', 'payload' => ['sequence' => 1, 'result' => $codec->envelope('Hello, Ada!')]],
]);
if (($replay->commands[0]['type'] ?? null) !== 'complete_workflow'
    || $codec->decodeEnvelope($replay->commands[0]['result']) !== ['greeting' => 'Hello, Ada!']) {
    throw new RuntimeException('The workflow did not replay to the expected result.');
}
echo "PASS: registration, activity scheduling, activity result, and completed-history replay.\n";
