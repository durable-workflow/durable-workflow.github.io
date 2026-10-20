---
sidebar_position: 3
title: Iniciando workflows
description: Inicie instâncias de workflow de forma assíncrona e adicione argumentos, metadados de visibilidade, chaves de negócio e opções de início.
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - iniciar workflow
  - id de instância de workflow
  - opções de início do durable workflow
---

# Iniciando workflows {#starting-workflows}

Para iniciar um workflow, crie uma instância de workflow e então chame seu método `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Depois de iniciado, o workflow será executado de forma assíncrona por um worker de fila. O método `start()` retorna imediatamente e não bloqueia a requisição atual.

Passe argumentos ao método `handle()` do workflow por meio de `start()`:

```php
$workflow->start($orderId);
```

Você pode adicionar rótulos de visibilidade, uma chave de negócio, memo ou limites de tempo por meio de `StartOptions`. Consulte [Opções de início](/docs/configuration/options#startoptions) quando precisar delas.
