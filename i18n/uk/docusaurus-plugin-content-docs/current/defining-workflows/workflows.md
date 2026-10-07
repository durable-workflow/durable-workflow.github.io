---
sidebar_position: 1
title: Workflow
description: Визначайте класи workflow Durable Workflow v2 та зберігайте детермінованість коду оркестрації.
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - durable workflow workflow class
  - v2 workflow authoring
  - deterministic workflow code
---

# Workflow {#workflows}

Workflow й activity визначаються як класи, що успадковують базові класи
`Workflow` та `Activity`, надані фреймворком. Workflow — це клас, який визначає
послідовність activity, що виконуються паралельно, послідовно або поєднують
обидва підходи.

Для створення нового workflow можна використати команду Artisan `make:workflow`:

```php
php artisan make:workflow MyWorkflow
```

Він визначається успадкуванням класу `Workflow` та реалізацією методу `handle()`.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return activity(MyActivity::class);
    }
}
```
