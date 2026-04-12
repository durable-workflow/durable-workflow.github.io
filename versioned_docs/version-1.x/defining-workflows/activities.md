---
sidebar_position: 2
---

# Activities

An activity is a unit of work that performs a specific task or operation (e.g. making an API request, processing data, sending an email) and can be executed by a workflow.

You may use the `make:activity` artisan command to generate a new activity:

```php
php artisan make:activity MyActivity
```

It is defined by extending the `Activity` class and implementing the `execute()` method.

```php
use Workflow\Activity;

class MyActivity extends Activity
{
    public function execute()
    {
        // Perform some work...
        return $result;
    }
}
```
