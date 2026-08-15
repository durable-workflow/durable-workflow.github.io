---
slug: laravel-workflows-as-mcp-tools-for-ai-clients
title: "Laravel Workflows as MCP Tools for AI Clients"
description: "Build a Laravel MCP server that lets AI clients discover, start, and monitor durable workflows asynchronously through three focused tools."
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [ai, workflow, mcp, agents, tools]
---

AI clients need a non-blocking way to launch work that outlives one request. This tutorial builds a Laravel MCP server that exposes durable workflows as tools clients can discover, start asynchronously, and monitor through completion.

In this post, we'll show how to build an MCP server that allows AI clients to:

- Discover available workflows
- Start workflows asynchronously
- Poll for status and retrieve results

This creates a powerful pattern where AI agents can orchestrate long-running, durable workflows, perfect for complex tasks that can't complete in a single request.

### Why MCP + Durable Workflow?

Durable Workflow (formerly Laravel Workflow) excels at durable, stateful execution. MCP excels at giving AI clients structured access to external capabilities. Together, they enable:

- **Async AI operations**: Start a workflow, continue the conversation, check results later
- **Reliable execution**: Workflows survive crashes, retries, and long wait times
- **Observability**: Track every workflow through Waterline's dashboard
- **Stateless servers**: The MCP server doesn't hold state. Clients track workflow IDs

This mirrors how humans delegate tasks: "Start this report, I'll check back later."

### What We're Building

We'll create an MCP server with three tools:

| Tool | Purpose |
|------|---------|
| `list_workflows` | Discover available workflows and view recent runs |
| `start_workflow` | Start a workflow and get a tracking ID |
| `get_workflow_result` | Check status and retrieve output when complete |

### Step-by-Step Implementation

#### 1. Install Laravel MCP

```bash
composer require laravel/mcp
php artisan vendor:publish --tag=ai-routes
```

This gives you `routes/ai.php` where you'll register your MCP server.

#### 2. Create the MCP Server

```bash
php artisan make:mcp-server WorkflowServer
```

Configure it with instructions for the AI:

```php
namespace App\Mcp\Servers;

use App\Mcp\Tools\GetWorkflowResultTool;
use App\Mcp\Tools\ListWorkflowsTool;
use App\Mcp\Tools\StartWorkflowTool;
use Laravel\Mcp\Server;

class WorkflowServer extends Server
{
    protected string $name = 'Workflow Server';
    protected string $version = '1.0.0';

    protected string $instructions = <<<'MARKDOWN'
        This server allows you to start and monitor Workflows.

        ## Typical Usage Pattern

        1. Call `list_workflows` to see what workflows are available.
        2. Call `start_workflow` with the workflow name and arguments.
        3. Store the returned `workflow_id`.
        4. Call `get_workflow_result` until status is `WorkflowCompletedStatus`.
        5. Read the `output` field for the result.

        ## Status Values

        - `WorkflowCreatedStatus` - Workflow has been created
        - `WorkflowPendingStatus` - Queued for execution
        - `WorkflowRunningStatus` - Currently executing
        - `WorkflowWaitingStatus` - Waiting (timer, signal, etc.)
        - `WorkflowCompletedStatus` - Finished successfully
        - `WorkflowFailedStatus` - Encountered an error
    MARKDOWN;

    protected array $tools = [
        ListWorkflowsTool::class,
        StartWorkflowTool::class,
        GetWorkflowResultTool::class,
    ];
}
```

#### 3. Create the Start Workflow Tool

```bash
php artisan make:mcp-tool StartWorkflowTool
```

```php
namespace App\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Arr;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Workflow\Workflow;
use Workflow\WorkflowStub;

class StartWorkflowTool extends Tool
{
    protected string $description = <<<'MARKDOWN'
        Start a Workflow asynchronously and return its workflow ID.
        
        The workflow will execute in the background on the queue. Use the
        `get_workflow_result` tool to poll for status and retrieve results
        once the workflow completes.
    MARKDOWN;

    public function handle(Request $request): Response
    {
        $data = $request->validate([
            'workflow' => ['required', 'string'],
            'args' => ['nullable', 'array'],
            'external_id' => ['nullable', 'string', 'max:255'],
        ]);

        $workflowKey = $data['workflow'];
        $args = Arr::get($data, 'args', []);
        $externalId = $data['external_id'] ?? null;

        $workflowClass = $this->resolveWorkflowClass($workflowKey);

        if ($workflowClass === null) {
            return Response::error("Unknown workflow: {$workflowKey}");
        }

        if (! class_exists($workflowClass) || ! is_subclass_of($workflowClass, Workflow::class)) {
            return Response::error("Invalid workflow class: {$workflowClass}");
        }

        $stub = WorkflowStub::make($workflowClass);
        $stub->start(...array_values($args));

        $status = $stub->status();
        $statusName = is_object($status) ? class_basename($status) : class_basename((string) $status);

        return Response::json([
            'workflow_id' => $stub->id(),
            'workflow' => $workflowKey,
            'status' => $statusName,
            'external_id' => $externalId,
            'message' => 'Workflow started. Use get_workflow_result to poll status.',
        ]);
    }

    protected function resolveWorkflowClass(string $key): ?string
    {
        $mapped = config("workflow_mcp.workflows.{$key}");
        if ($mapped !== null) {
            return $mapped;
        }

        if (config('workflow_mcp.allow_fqcn', false) && str_contains($key, '\\')) {
            return $key;
        }

        return null;
    }

    public function schema(JsonSchema $schema): array
    {
        $workflows = implode(', ', array_keys(config('workflow_mcp.workflows', [])));

        return [
            'workflow' => $schema->string()
                ->description("The workflow to start. Available: {$workflows}"),
            'args' => $schema->object()
                ->description('Arguments for the workflow execute() method.'),
            'external_id' => $schema->string()
                ->description('Optional idempotency key for tracking.'),
        ];
    }
}
```

#### 4. Create the Get Result Tool

```bash
php artisan make:mcp-tool GetWorkflowResultTool
```

```php
namespace App\Mcp\Tools;

use App\Models\StoredWorkflow;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Workflow\States\WorkflowCompletedStatus;
use Workflow\States\WorkflowFailedStatus;
use Workflow\WorkflowStub;

class GetWorkflowResultTool extends Tool
{
    protected string $description = <<<'MARKDOWN'
        Fetch the status and, if completed, the output of a Workflow.
        
        Use the workflow_id returned by `start_workflow` to check progress.
        Once status is `WorkflowCompletedStatus`, the output field contains the result.
    MARKDOWN;

    public function handle(Request $request): Response
    {
        $data = $request->validate([
            'workflow_id' => ['required'],
        ]);

        $workflowId = $data['workflow_id'];
        $stored = StoredWorkflow::find($workflowId);

        if (! $stored) {
            return Response::json([
                'found' => false,
                'message' => "Workflow {$workflowId} not found.",
            ]);
        }

        $workflow = WorkflowStub::load($workflowId);
        $status = $workflow->status();
        $statusName = is_object($status) ? class_basename($status) : class_basename((string) $status);
        $running = $workflow->running();

        $result = null;
        $error = null;

        if (! $running && str_contains($statusName, 'Completed')) {
            $result = $workflow->output();
        }

        if (! $running && str_contains($statusName, 'Failed')) {
            $exception = $stored->exceptions()->latest()->first();
            $error = $exception?->exception ?? 'Unknown error';
        }

        return Response::json([
            'found' => true,
            'workflow_id' => $workflowId,
            'status' => $statusName,
            'running' => $running,
            'output' => $result,
            'error' => $error,
            'created_at' => $stored->created_at?->toIso8601String(),
            'updated_at' => $stored->updated_at?->toIso8601String(),
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'workflow_id' => $schema->string()
                ->description('The workflow ID returned by start_workflow.'),
        ];
    }
}
```

#### 5. Create the List Workflows Tool

```bash
php artisan make:mcp-tool ListWorkflowsTool
```

```php
namespace App\Mcp\Tools;

use App\Models\StoredWorkflow;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;

class ListWorkflowsTool extends Tool
{
    protected string $description = <<<'MARKDOWN'
        List available workflow types and optionally show recent workflow runs.
        
        Use this to discover what workflows can be started, or to see
        the status of recent executions.
    MARKDOWN;

    public function handle(Request $request): Response
    {
        $data = $request->validate([
            'show_recent' => ['nullable', 'boolean'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
            'status' => ['nullable', 'string'],
        ]);

        $showRecent = $data['show_recent'] ?? false;
        $limit = $data['limit'] ?? 10;
        $statusFilter = $data['status'] ?? null;

        $availableWorkflows = [];
        foreach (config('workflow_mcp.workflows', []) as $key => $class) {
            $availableWorkflows[] = ['key' => $key, 'class' => $class];
        }

        $response = [
            'available_workflows' => $availableWorkflows,
        ];

        if ($showRecent) {
            $query = StoredWorkflow::query()
                ->orderBy('created_at', 'desc')
                ->limit($limit);

            if ($statusFilter) {
                $query->where('status', 'like', "%{$statusFilter}%");
            }

            $response['recent_workflows'] = $query->get()->map(function ($w) {
                $status = $w->status;
                $statusName = is_object($status) ? class_basename($status) : class_basename((string) $status);

                return [
                    'id' => $w->id,
                    'class' => $w->class,
                    'status' => $statusName,
                    'created_at' => $w->created_at?->toIso8601String(),
                ];
            });
        }

        return Response::json($response);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'show_recent' => $schema->boolean()
                ->description('Include recent workflow runs in response.'),
            'limit' => $schema->integer()
                ->description('Max recent workflows to return (default: 10).'),
            'status' => $schema->string()
                ->description('Filter by status (e.g., "Completed", "Failed").'),
        ];
    }
}
```

#### 6. Configure Available Workflows

Create `config/workflow_mcp.php` to whitelist which workflows AI clients can start:

```php
return [
    'allow_fqcn' => env('WORKFLOW_MCP_ALLOW_FQCN', false),

    'workflows' => [
        'simple' => App\Workflows\Simple\SimpleWorkflow::class,
        'prism' => App\Workflows\Prism\PrismWorkflow::class,
    ],
];
```

This prevents arbitrary class execution. Only mapped workflows are accessible.

#### 7. Register the MCP Server

Update `routes/ai.php`:

```php
use App\Mcp\Servers\WorkflowServer;
use Laravel\Mcp\Facades\Mcp;

Mcp::web('/mcp/workflows', WorkflowServer::class);
```

### Connecting AI Clients

#### VS Code / GitHub Copilot

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "laravel-workflow": {
      "type": "http",
      "url": "http://localhost/mcp/workflows"
    }
  }
}
```

This configuration works for both local development and GitHub Codespaces. In Codespaces, the VS Code server runs inside the container, so `localhost` correctly reaches the Laravel server without needing public ports or the `*.app.github.dev` URL.

After reloading VS Code (Cmd/Ctrl+Shift+P → "Developer: Reload Window"), Copilot can use the workflow tools directly in chat.

### Real-World Usage

Once connected, you can have natural conversations with your AI assistant:

> **You:** "What workflows are available?"
> 
> **AI:** *calls list_workflows* "I found 2 workflows: `simple` and `prism`."

> **You:** "Start the prism workflow"
> 
> **AI:** *calls start_workflow* "Started workflow ID 42. I'll check its status."

> **AI:** *calls get_workflow_result* "The workflow completed! Here's the generated user profile: \{ name: 'Elena', hobbies: [...] \}"

This creates a seamless experience where AI assistants can orchestrate complex, long-running operations while keeping the user informed.

### What Makes This Pattern Powerful

- **Durability**: Workflows survive server restarts and network failures
- **Async by design**: AI clients don't block waiting for completion
- **Observable**: Every workflow is tracked in Waterline's dashboard
- **Secure**: Whitelist-based workflow access prevents arbitrary execution
- **Stateless MCP**: The server holds no state. Clients track workflow IDs

### Try It Now in Your Browser

This MCP integration is included and pre-configured in the Durable Workflow [Sample App](https://github.com/durable-workflow/sample-app/tree/Laravel-12).

To try it:

1. Open the sample-app repo's `Laravel-12` branch on GitHub
2. Click **Code** → **Codespaces** → **Create codespace on Laravel-12**
3. Wait for the environment to build
4. Setup the app and start the queue worker:
   ```bash
   php artisan app:init
   php artisan queue:work
   ```
5. Enable the Durable Workflow Server MCP tools
6. Ask your AI to list and run workflows!

### Where to Go From Here

You can extend this pattern to:

- **Parameterized workflows**: Pass user input to workflow arguments
- **Webhook notifications**: Push completion events instead of polling
- **Workflow signals**: Let AI clients send signals to waiting workflows
- **Progress streaming**: Use SSE to stream workflow progress in real-time
- **Multi-step agents**: Chain multiple workflows together in a conversation

The combination of Durable Workflow's durable execution and MCP's tool protocol creates a foundation for truly capable AI agents that can handle real-world complexity.
