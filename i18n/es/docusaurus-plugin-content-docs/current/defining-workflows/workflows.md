---
sidebar_position: 1
title: Workflows
description: Define clases de workflow de Durable Workflow v2 y mantén determinista el código de orquestación.
tags:
  - authoring
  - workflows
  - determinism
---

# Workflows {#workflows}

En Laravel integrado, los workflows y las actividades son clases que extienden
`Workflow` y `Activity`. Un workflow coordina actividades en serie, en paralelo
o combinando ambos patrones.

Crea la clase con el comando Artisan `make:workflow`:

```php
php artisan make:workflow MyWorkflow
```

Extiende `Workflow` e implementa el método `handle()`:

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
