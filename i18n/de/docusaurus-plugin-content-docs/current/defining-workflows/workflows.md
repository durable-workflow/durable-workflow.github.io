---
sidebar_position: 1
title: Workflows
description: Definieren Sie Workflow-Klassen für Durable Workflow v2 und halten Sie den Orchestrierungscode deterministisch.
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - durable workflow Workflow-Klasse
  - Workflows erstellen v2
  - deterministischer Workflow-Code
---

# Workflows {#workflows}

Workflows und Aktivitäten sind Klassen, die die Basisklassen `Workflow` und `Activity` des Frameworks erweitern. Ein Workflow definiert eine Folge von Aktivitäten, die parallel, nacheinander oder in einer Kombination beider Formen ausgeführt werden.

Erstellen Sie einen neuen Workflow mit dem Artisan-Befehl `make:workflow`:

```php
php artisan make:workflow MyWorkflow
```

Erweitern Sie die Klasse `Workflow` und implementieren Sie die Methode `handle()`:

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
