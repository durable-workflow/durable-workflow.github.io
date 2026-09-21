<?php

declare(strict_types=1);

use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

final class GreetingWorkflow
{
    #[Workflow('comparison.php.greeting')]
    public function run(WorkflowContext $context, string $name): array
    {
        return ['greeting' => $context->activity('comparison.php.greet', [$name])];
    }
}

final class GreetingActivities
{
    #[Activity('comparison.php.greet')]
    public function greet(ActivityContext $context, string $name): string
    {
        return "Hello, {$name}!";
    }
}
