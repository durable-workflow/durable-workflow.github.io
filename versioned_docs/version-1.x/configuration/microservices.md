---
sidebar_position: 5
---

# Microservices
Workflows can span across multiple Laravel applications. For instance, a workflow might exist in one microservice while its corresponding activity resides in another.

To enable seamless communication between Laravel applications, set up a shared database and queue connection across all microservices.

All microservices must have identical `APP_KEY` values in their `.env` files for proper serialization and deserialization from the queue.

Below is a guide on configuring a shared MySQL database and Redis connection:

```php
// config/database.php

'connections' => [
    'shared' => [
        'driver' => 'mysql',
        'url' => env('SHARED_DB_URL'),
        'host' => env('SHARED_DB_HOST', '127.0.0.1'),
        'port' => env('SHARED_DB_PORT', '3306'),
        'database' => env('SHARED_DB_DATABASE', 'laravel'),
        'username' => env('SHARED_DB_USERNAME', 'root'),
        'password' => env('SHARED_DB_PASSWORD', ''),
        'unix_socket' => env('SHARED_DB_SOCKET', ''),
        'charset' => env('SHARED_DB_CHARSET', 'utf8mb4'),
        'collation' => env('SHARED_DB_COLLATION', 'utf8mb4_unicode_ci'),
        'prefix' => '',
        'prefix_indexes' => true,
        'strict' => true,
        'engine' => null,
        'options' => extension_loaded('pdo_mysql') ? array_filter([
            PDO::MYSQL_ATTR_SSL_CA => env('SHARED_MYSQL_ATTR_SSL_CA'),
        ]) : [],
    ],
],

'redis' => [
    'shared' => [
        'url' => env('SHARED_REDIS_URL'),
        'host' => env('SHARED_REDIS_HOST', '127.0.0.1'),
        'username' => env('SHARED_REDIS_USERNAME'),
        'password' => env('SHARED_REDIS_PASSWORD'),
        'port' => env('SHARED_REDIS_PORT', '6379'),
        'database' => env('SHARED_REDIS_DB', '0'),
    ],
],
```

```php
// config/queue.php

'connections' => [
    'shared' => [
        'driver' => 'redis',
        'connection' => env('SHARED_REDIS_QUEUE_CONNECTION', 'default'),
        'queue' => env('SHARED_REDIS_QUEUE', 'default'),
        'retry_after' => (int) env('SHARED_REDIS_QUEUE_RETRY_AFTER', 90),
        'block_for' => null,
        'after_commit' => false,
    ],
],
```

For consistency in the workflow database schema across services, designate only one microservice to publish and run the workflow migrations.

Modify the workflow migrations to use the shared database connection:

```php
// database/migrations/2022_01_01_000000_create_workflows_table.php

final class CreateWorkflowsTable extends Migration
{
    protected $connection = 'shared';
```

In each microservice, extend the workflow models to use the shared connection:

```php
// app\Models\StoredWorkflow.php

class StoredWorkflow extends BaseStoredWorkflow
{
    protected $connection = 'shared';
```

Publish the workflow config file and update it to use your custom models.

Update your workflow and activity classes to use the shared queue connection. Assign unique queue names to each microservice for differentiation:

```php
// App: workflow microservice

use function Workflow\activity;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';

    public function execute($name)
    {
        $result = yield activity(MyActivity::class, $name);
        return $result;
    }
}
```

```php
// App: activity microservice

use Workflow\Activity;

class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';

    public function execute($name)
    {
        return "Hello, {$name}!";
    }
}
```

It's crucial to maintain empty duplicate classes in every microservice, ensuring they share the same namespace and class name. This precaution avoids potential exceptions due to class discrepancies:

```php
// App: workflow microservice

use Workflow\Activity;

class MyActivity extends Activity
{
    public $connection = 'shared';
    public $queue = 'activity';
}
```

```php
// App: activity microservice

use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    public $connection = 'shared';
    public $queue = 'workflow';
}
```

Note: The workflow code should exclusively reside in the workflow microservice, and the activity code should only be found in the activity microservice. The code isn't duplicated; identical class structures are merely maintained across all microservices.

To run queue workers in each microservice, use the shared connection and the respective queue names:

```bash
php artisan queue:work shared --queue=workflow
php artisan queue:work shared --queue=activity
```

In this setup, the workflow queue worker runs in the workflow microservice, while the activity queue worker runs in the activity microservice.
