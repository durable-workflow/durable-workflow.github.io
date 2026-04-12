---
sidebar_position: 11
---

# Webhooks

The framework provides webhooks that allow external systems to start workflows and send signals dynamically. This feature enables seamless integration with external services, APIs, and automation tools.

## Enabling Webhooks
To enable webhooks, register the webhook routes in your application’s routes file (`routes/web.php` or `routes/api.php`):

```php
use Workflow\Webhooks;

Webhooks::routes();
```

By default, webhooks will:
- Auto-discover workflows in the `app/Workflows` folder.
- Expose webhooks to workflows marked with `#[Webhook]` at the class level.
- Expose webhooks to signal methods marked with `#[Webhook]`.

## Starting a Workflow via Webhook
To expose a workflow as a webhook, add the `#[Webhook]` attribute on the class itself.

```php
use Workflow\Webhook;
use Workflow\Workflow;

#[Webhook]
class OrderWorkflow extends Workflow
{
    public function execute($orderId)
    {
        // your code here
    }
}
```

### Webhook URL
```
POST /webhooks/start/order-workflow
```

### Example Request
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"orderId": 123}'
```

## Sending a Signal via Webhook
To allow external systems to send signals to a workflow, add the `#[Webhook]` attribute on the method.

```php
use Workflow\SignalMethod;
use Workflow\Webhook;
use Workflow\Workflow;

class OrderWorkflow extends Workflow
{
    protected bool $shipped = false;

    #[SignalMethod]
    #[Webhook]
    public function markAsShipped()
    {
        $this->shipped = true;
    }
}
```

### Webhook URL
```
POST /webhooks/signal/order-workflow/{workflowId}/mark-as-shipped
```

### Example Request
```bash
curl -X POST "https://example.com/webhooks/signal/order-workflow/1/mark-as-shipped" \
     -H "Content-Type: application/json"
```

## Webhook URL Helper
The `$this->webhookUrl()` helper generates webhook URLs for starting workflows or sending signals.

```
public function webhookUrl(string $signalMethod = ''): string
```

If `$signalMethod` is empty or omitted, `$this->webhookUrl()` returns the URL for starting the workflow. If `$signalMethod` is provided, `$this->webhookUrl()` returns the URL for sending a signal to an active workflow instance.

```
use Workflow\Activity;

class ShipOrderActivity extends Activity
{
    public function execute(string $email): void
    {
        $startUrl = $this->webhookUrl();
        // $startUrl = '/webhooks/start/order-workflow';

        $signalUrl = $this->webhookUrl('markAsShipped');
        // $signalUrl = '/webhooks/signal/order-workflow/{workflowId}/mark-as-shipped';
    }
}
```

## Webhook Authentication
By default, webhooks don't require authentication, but you can configure one of several strategies in `config/workflows.php`.

**Important:** If webhook URLs are shared with external parties or exposed publicly, enable authentication (token or HMAC signature) to prevent unauthorized access.

### Authentication Methods
It supports:
1. No Authentication (none)
2. Token-based Authentication (token)
3. HMAC Signature Verification (signature)
4. Custom Authentication (custom)

### Token Authentication
For token authentication, webhooks require a valid API token in the request headers. The default header is `Authorization` but you can change this in the configuration settings.

#### Example Request
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### HMAC Signature Authentication
For HMAC authentication, it verifies requests using a secret key. The default header is `X-Signature` but this can also be changed.

#### Example Request
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Custom Authentication
To use a custom authenticator, create a class that implements the `WebhookAuthenticator` interface:

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Then configure it in `config/workflows.php`:

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

The `validate()` method should return the `Request` if valid, or call `abort(401)` if unauthorized.

## Configuring Webhook Routes
By default, webhooks are accessible under `/webhooks`. You can customize the route path in `config/workflows.php`:

```php
'webhooks_route' => 'workflows',
```

After this change, webhooks will be accessible under:
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
```
