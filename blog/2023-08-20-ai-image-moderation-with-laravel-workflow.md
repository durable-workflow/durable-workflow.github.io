---
slug: ai-image-moderation-with-laravel-workflow
title: "AI Image Moderation with Workflow"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [ai, image-moderation, workflow, automation]
---

Before we begin, let’s understand the scenario. We are building an image moderation system where:

1. Every image undergoes an initial AI check to determine if it’s safe.
2. If the AI deems the image unsafe, it’s automatically logged and deleted.
3. If it’s potentially safe, a human moderator is alerted to further review the image. They have the option to approve or reject the image.
4. Approved images are moved to a public location, whereas rejected images are deleted.

## Workflow

Workflow is designed to streamline and organize complex processes in applications. It allows developers to define, manage, and execute workflows seamlessly. You can find installation instructions [here](https://github.com/durable-workflow/workflow).

## ClarifAI API

ClarifAI provides AI-powered moderation tools for analyzing visual content. They offer a [free plan](https://www.clarifai.com/pricing) with up to 1,000 actions per month.

#### 1. Store your credentials in `.env`.
```ini
CLARIFAI_API_KEY=key
CLARIFAI_APP=my-application
CLARIFAI_WORKFLOW=my-workflow
CLARIFAI_USER=username
```

#### 2. Add the service to `config/services.php`.
```php
'clarifai' => [
    'api_key' => env('CLARIFAI_API_KEY'),
    'app' => env('CLARIFAI_APP'),
    'workflow' => env('CLARIFAI_WORKFLOW'),
    'user' => env('CLARIFAI_USER'),
],
```

#### 3. Create a service at `app/Services/ClarifAI.php`.
```php
namespace App\Services;

use Illuminate\Support\Facades\Http;

class ClarifAI
{
    private $apiKey;
    private $apiUrl;

    public function __construct()
    {
        $app = config('services.clarifai.app');
        $workflow = config('services.clarifai.workflow');
        $user = config('services.clarifai.user');
        $this->apiKey = config('services.clarifai.api_key');
        $this->apiUrl = "https://api.clarifai.com/v2/users/{$user}/apps/{$app}/workflows/{$workflow}/results/";
    }

    public function checkImage(string $image): bool
    {
        $response = Http::withToken($this->apiKey, 'Key')
            ->post($this->apiUrl, ['inputs' => [
                ['data' => ['image' => ['base64' => base64_encode($image)]]],
            ]]);

        return collect($response->json('results.0.outputs.0.data.concepts', []))
            ->filter(fn ($value) => $value['name'] === 'safe')
            ->map(fn ($value) => round((float) $value['value']) > 0)
            ->first() ?? false;
    }
}
```

## Creating the Workflow

```php
namespace App\Workflows;

use Workflow\SignalMethod;
use Workflow\Workflow;
use function Workflow\{activity, all, awaitWithTimeout};

class ImageModerationWorkflow extends Workflow
{
    private bool $approved = false;
    private bool $rejected = false;

    #[SignalMethod]
    public function approve()
    {
        $this->approved = true;
    }

    #[SignalMethod]
    public function reject()
    {
        $this->rejected = true;
    }

    public function execute($imagePath)
    {
        $safe = yield from $this->check($imagePath);

        if (! $safe) {
            yield from $this->unsafe($imagePath);
            return 'unsafe';
        }

        yield from $this->moderate($imagePath);

        return $this->approved ? 'approved' : 'rejected';
    }

    private function check($imagePath)
    {
        return yield activity(AutomatedImageCheckActivity::class, $imagePath);
    }

    private function unsafe($imagePath)
    {
        yield all([
            activity(LogUnsafeImageActivity::class, $imagePath),
            activity(DeleteImageActivity::class, $imagePath),
        ]);
    }

    private function moderate($imagePath)
    {
        while (true) {
            yield activity(NotifyImageModeratorActivity::class, $imagePath);

            $signaled = yield awaitWithTimeout('24 hours', fn () => $this->approved || $this->rejected);

            if ($signaled) break;
        }
    }
}
```

## Activities

### Automated Image Check
```php
namespace App\Workflows;

use App\Services\ClarifAI;
use Illuminate\Support\Facades\Storage;
use Workflow\Activity;

class AutomatedImageCheckActivity extends Activity
{
    public function execute($imagePath)
    {
        return app(ClarifAI::class)
            ->checkImage(Storage::get($imagePath));
    }
}
```

### Logging Unsafe Images
```php
namespace App\Workflows;

use Illuminate\Support\Facades\Log;
use Workflow\Activity;

class LogUnsafeImageActivity extends Activity
{
    public function execute($imagePath)
    {
        Log::info('Unsafe image detected at: ' . $imagePath);
    }
}
```

### Deleting Images
```php
namespace App\Workflows;

use Illuminate\Support\Facades\Storage;
use Workflow\Activity;

class DeleteImageActivity extends Activity
{
    public function execute($imagePath)
    {
        Storage::delete($imagePath);
    }
}
```

## Starting and Signaling the Workflow
```php
$workflow = WorkflowStub::make(ImageModerationWorkflow::class);
$workflow->start('tmp/good.jpg');
```

For approvals or rejections:
```php
$workflow = WorkflowStub::load($id);
$workflow->approve();
// or
$workflow->reject();
```

## Conclusion

[Workflow](https://github.com/durable-workflow/workflow) provides a structured approach to handle complex processes like image moderation. It supports asynchronous processing, external API integrations, and modular design for scalability. Thanks for reading!

