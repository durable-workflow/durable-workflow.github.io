---
sidebar_position: 1
---

# Publishing Config

This will create a `workflows.php` configuration file in your `config` folder.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Changing Workflows Folder

By default, the `make` commands will write to the `app/Workflows` folder.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

This can be changed by updating the `workflows_folder` setting.

```php
'workflows_folder' => 'Workflows',
```

## Using Custom Models

In the `workflows.php` config file you can update the model classes to use your own.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Changing Serializer

This setting allows you to optionally use the Base64 serializer instead of Y (kind of like yEnc encoding where it only gets rid of null bytes). If you change this it will only affect new workflows and old workflows will revert to whatever they were encoded with to ensure compatibility.

The default serializer setting in `workflows.php` is:

```php
'serializer' => Workflow\Serializers\Y::class,
```

To use Base64 instead, update it to:

```php
'serializer' => Workflow\Serializers\Base64::class,
```

