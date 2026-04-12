---
sidebar_position: 4
---

# Database Connection

Here is an overview of the steps needed to customize the database connection used for the stored workflow models. This is *only* required if you want to use a different database connection than the default connection you specified for your Laravel application.

1. Create classes in your app models directory that extend the base workflow model classes
2. Set the desired `$connection` option in each class
3. Publish the workflow config file
4. Update the config file to use your custom classes

## Extending Workflow Models

In `app\Models\StoredWorkflow.php` put this.

```php
namespace App\Models;

use Workflow\Models\StoredWorkflow as BaseStoredWorkflow;

class StoredWorkflow extends BaseStoredWorkflow
{
    protected $connection = 'mysql';
}
```

In `app\Models\StoredWorkflowException.php` put this.


```php
namespace App\Models;

use Workflow\Models\StoredWorkflowException as BaseStoredWorkflowException;

class StoredWorkflowException extends BaseStoredWorkflowException
{
    protected $connection = 'mysql';

}
```

In `app\Models\StoredWorkflowLog.php` put this.


```php
namespace App\Models;

use Workflow\Models\StoredWorkflowLog as BaseStoredWorkflowLog;

class StoredWorkflowLog extends BaseStoredWorkflowLog
{
    protected $connection = 'mysql';
}
```

In `app\Models\StoredWorkflowSignal.php` put this.

```php
namespace App\Models;

use Workflow\Models\StoredWorkflowSignal as BaseStoredWorkflowSignal;

class StoredWorkflowSignal extends BaseStoredWorkflowSignal
{
    protected $connection = 'mysql';
}
```

In `app\Models\StoredWorkflowTimer.php` put this.

```php
namespace App\Models;

use Workflow\Models\StoredWorkflowTimer as BaseStoredWorkflowTimer;

class StoredWorkflowTimer extends BaseStoredWorkflowTimer
{
    protected $connection = 'mysql';
}
```
