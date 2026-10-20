---
sidebar_position: 3
title: Démarrer des workflows
description: Démarrez des instances de workflow de manière asynchrone avec des arguments, des métadonnées de visibilité, des clés métier et des options de démarrage.
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - démarrer un workflow
  - identifiant d’instance de workflow
  - options de démarrage durable workflow
---

# Démarrer des workflows {#starting-workflows}

Pour démarrer un workflow, créez une instance, puis appelez sa méthode `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Une fois démarré, le workflow est exécuté de manière asynchrone par un worker de file d’attente. La méthode `start()` retourne immédiatement sans bloquer la requête en cours.

Transmettez les arguments à la méthode `handle()` du workflow via `start()` :

```php
$workflow->start($orderId);
```

Vous pouvez joindre des libellés de visibilité, une clé métier, un mémo ou des délais d’expiration via `StartOptions`. Consultez les [options de démarrage](/docs/configuration/options#startoptions) si vous en avez besoin.
