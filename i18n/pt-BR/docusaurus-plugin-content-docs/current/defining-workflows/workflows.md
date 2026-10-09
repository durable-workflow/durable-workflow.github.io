---
sidebar_position: 1
title: Workflows
description: Defina classes de workflow da v2 e mantenha o código de orquestração determinístico.
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - classe de workflow
  - código de workflow v2
  - workflow determinístico
---

# Workflows

Workflows e atividades são definidos como classes que estendem as classes base `Workflow` e `Activity` fornecidas pelo framework. Um workflow define uma sequência de atividades que podem executar em paralelo, em série ou em uma combinação das duas formas.

Use o comando Artisan `make:workflow` para criar um workflow:

```php
php artisan make:workflow MyWorkflow
```

Estenda a classe `Workflow` e implemente o método `handle()`:

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
