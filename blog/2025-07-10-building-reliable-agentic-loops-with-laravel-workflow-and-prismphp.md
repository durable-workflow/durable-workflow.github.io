---
slug: building-reliable-agentic-loops-with-laravel-workflow-and-prismphp
title: "Building Reliable Agentic Loops with Workflow and PrismPHP"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [ai, workflow, agents, agentic]
---

![captionless image](https://raw.githubusercontent.com/prism-php/prism/main/assets/prism-logo.webp)

Workflow is a powerful tool for orchestrating long-running, stateful workflows in PHP. Paired with [PrismPHP](https://prismphp.com/), it becomes a compelling foundation for building reliable AI agents that not only generate structured data but verify and retry until results meet strict real-world constraints.

In this post, we’ll show how to use Workflow + Prism to create an agentic loop that:

- Generates structured data using an LLM
- Validates the result against custom rules
- Retries automatically until the result passes

You can try this exact workflow right now in your browser with no setup or coding required. Just click the button in the Workflow [Sample App](https://github.com/durable-workflow/sample-app/tree/Laravel-12) and launch a GitHub Codespace to run it.

### What We’re Building

We’ll create a workflow that asks an LLM to generate a user profile with hobbies. Then we’ll validate that:

- The name is present
- At least one hobby is defined
- The name starts with a vowel

If the result fails validation, we loop back to the LLM and regenerate. All of this is durable, asynchronous, and tracked through stateful events.

### Step-by-Step Example

1. Console Command to Trigger the Workflow
```php
use App\Workflows\Prism\PrismWorkflow;
use Illuminate\Console\Command;
use Workflow\WorkflowStub;

class Prism extends Command
{
    protected $signature = 'app:prism';

    protected $description = 'Runs a Prism AI workflow';

    public function handle()
    {
        $workflow = WorkflowStub::make(PrismWorkflow::class);
        $workflow->start();
        while ($workflow->running());
        $user = $workflow->output();

        $this->info('Generated User:');
        $this->info(json_encode($user, JSON_PRETTY_PRINT));
    }
}
```

2. Define the Workflow Logic
```php
use function Workflow\activity;
use Workflow\Workflow;

class PrismWorkflow extends Workflow
{
    public function execute()
    {
        do {
            $user = yield activity(GenerateUserActivity::class);
            $valid = yield activity(ValidateUserActivity::class, $user);
        } while (!$valid);

        return $user;
    }
}
```

This is a classic agent loop. If validation fails, we prompt again automatically.

3. Generate Structured User Data with PrismPHP
```php
use Prism\Prism\Prism;
use Prism\Prism\Enums\Provider;
use Prism\Prism\Schema\ArraySchema;
use Prism\Prism\Schema\ObjectSchema;
use Prism\Prism\Schema\StringSchema;
use Workflow\Activity;

class GenerateUserActivity extends Activity
{
    public function execute()
    {
        $schema = new ObjectSchema(
            name: 'user',
            description: 'A user profile with their hobbies',
            properties: [
                new StringSchema('name', 'The user\'s full name'),
                new ArraySchema(
                    name: 'hobbies',
                    description: 'The user\'s list of hobbies',
                    items: new ObjectSchema(
                        name: 'hobby',
                        description: 'A detailed hobby entry',
                        properties: [
                            new StringSchema('name', 'The name of the hobby'),
                            new StringSchema('description', 'A brief description of the hobby'),
                        ],
                        requiredFields: ['name', 'description']
                    )
                ),
            ],
            requiredFields: ['name', 'hobbies']
        );

        $response = Prism::structured()
            ->using(Provider::OpenAI, 'gpt-4o')
            ->withSchema($schema)
            ->withPrompt('Use names from many languages and vary first initials.')
            ->asStructured();

        return $response->structured;
    }
}
```

4. Validate Business Logic
```php
use Workflow\Activity;

class ValidateUserActivity extends Activity
{
    public function execute($user)
    {
        if (empty($user['name']) || !is_array($user['hobbies']) || count($user['hobbies']) === 0) {
            return false;
        }

        foreach ($user['hobbies'] as $hobby) {
            if (empty($hobby['name']) || empty($hobby['description'])) {
                return false;
            }
        }

        // Extra Validation: The user's name must start with a vowel.
        if (!in_array(strtoupper($user['name'][0]), ['A', 'E', 'I', 'O', 'U'])) {
            return false;
        }

        return true;  
    }
}
```

### What Makes This Pattern Powerful

This design pattern is what you’d call a reliable agentic loop:

- LLM generation via Prism
- Validation & retry via Workflow
- State persistence for crash recovery or inspection
- Observability via Waterline

It’s perfect for AI applications where accuracy, safety, and traceability are required.

### Try It Now in Your Browser

We’ve bundled this workflow into the official Workflow [Sample App](https://github.com/durable-workflow/sample-app/tree/Laravel-12).

To try it:

1. Open the sample-app repo's `Laravel-12` branch on GitHub
2. Click **Code** → **Codespaces** → **Create codespace on Laravel-12**
3. Wait for the environment to build
4. Set your OPENAI_API_KEY in the .env
5. Setup the app and start the queue worker:
   ```bash
   php artisan app:init
   php artisan queue:work
   ```
6. In a second terminal:
```bash
php artisan app:prism
```

You will see the queue working and eventually see the validated output.

### Where to Go From Here
You can easily adapt this pattern to:

- AI agents for form filling
- Data scraping and validation
- Content generation with retry policies
- Moderation and review queues

Each step remains reliable and traceable thanks to Workflow’s durable execution model.
