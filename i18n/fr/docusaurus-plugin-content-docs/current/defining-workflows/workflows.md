---
sidebar_position: 1
title: Workflows
description: Définir des classes de workflows Durable Workflow v2 avec un code d’orchestration déterministe.
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - classe de workflow
  - création de workflows v2
  - code déterministe
---

# Workflows {#workflows}

Les workflows et les activités sont des classes qui héritent des classes de base `Workflow` et `Activity` fournies par le framework. Un workflow décrit des activités exécutées en série, en parallèle ou selon une combinaison des deux.

La commande Artisan `make:workflow` crée un nouveau workflow :

```php
php artisan make:workflow MyWorkflow
```

Héritez de `Workflow` et implémentez la méthode `handle()` :

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
