---
slug: extending-laravel-workflow-to-support-spatie-laravel-tags
title: "Extending Workflow to Support Spatie Laravel Tags"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [laravel, workflow, spatie, tags, automation]
---

One of the strengths of the Laravel ecosystem is its flexibility, thanks to a myriad of community-driven packages that enhance the framework’s capabilities. The `laravel-workflow` and `spatie/laravel-tags` packages are two such examples, and in this post, we'll integrate them together to make workflows taggable.

## Installation Instructions

Before diving into the code, let’s ensure both libraries are properly installed:

1. Install [Workflow](https://github.com/durable-workflow/workflow) and [Spatie Laravel Tags](https://github.com/spatie/laravel-tags).
```sh
composer require laravel-workflow/laravel-workflow spatie/laravel-tags
```

2. Both packages include migrations that must be published.
```sh
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="migrations"
php artisan vendor:publish --provider="Spatie\Tags\TagsServiceProvider" --tag="tags-migrations"
```

3. Run the migrations.
```sh
php artisan migrate
```

## Publishing Configuration

To extend Workflow, publish its configuration file:
```sh
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Extending Workflows to Support Tags

We need to extend the `StoredWorkflow` model of `laravel-workflow` to support tagging.

```php
namespace App\Models;

use Spatie\Tags\HasTags;
use Workflow\Models\StoredWorkflow as BaseStoredWorkflow;
use Workflow\WorkflowStub;

class StoredWorkflow extends BaseStoredWorkflow
{
    use HasTags;
    
    public static function tag(WorkflowStub $workflow, $tag): void
    {
        $storedWorkflow = static::find($workflow->id());
        if ($storedWorkflow) {
            $storedWorkflow->attachTag($tag);
        }
    }
    
    public static function findByTag($tag): ?WorkflowStub
    {
        $storedWorkflow = static::withAnyTags([$tag])->first();
        if ($storedWorkflow) {
            return WorkflowStub::fromStoredWorkflow($storedWorkflow);
        }
    }
}
```

## Modify the Configuration

In `config/workflow.php`, update this line:
```php
'stored_workflow_model' => Workflow\Models\StoredWorkflow::class,
```
To:
```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,
```
This ensures Workflow uses the extended model.

## Running Tagged Workflows

With the taggable `StoredWorkflow` ready, create a console command to create, tag, retrieve, and run a workflow.

```php
namespace App\Console\Commands;

use App\Models\StoredWorkflow;
use App\Workflows\Simple\SimpleWorkflow;
use Illuminate\Console\Command;
use Workflow\WorkflowStub;

class Workflow extends Command
{
    protected $signature = 'workflow';

    protected $description = 'Runs a workflow';

    public function handle()
    {
        // Create a workflow and tag it
        $workflow = WorkflowStub::make(SimpleWorkflow::class);
        StoredWorkflow::tag($workflow, 'tag1');
        
        // Find the workflow by tag and start it
        $workflow = StoredWorkflow::findByTag('tag1');
        $workflow->start();
        
        while ($workflow->running());
        
        $this->info($workflow->output());
    }
}
```

## Conclusion

By integrating `laravel-workflow` with `spatie/laravel-tags`, we've enabled tagging for workflows, making management more intuitive in larger applications. Thanks to Laravel’s extensible nature, endless possibilities await developers leveraging these powerful packages.
