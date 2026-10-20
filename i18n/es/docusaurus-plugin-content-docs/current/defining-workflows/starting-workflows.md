---
sidebar_position: 3
title: Iniciar workflows
description: Inicia instancias de workflow de forma asíncrona y adjunta argumentos, metadatos de visibilidad, claves de negocio y opciones de inicio.
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - iniciar workflow
  - id de instancia de workflow
  - opciones de inicio de workflow duradero
---

# Iniciar workflows {#starting-workflows}

Para iniciar un workflow, crea una instancia y llama a su método `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Tras iniciarse, un worker de cola ejecuta el workflow de forma asíncrona. El método `start()` devuelve el control inmediatamente y no bloquea la solicitud actual.

Pasa argumentos al método `handle()` del workflow mediante `start()`:

```php
$workflow->start($orderId);
```

Puedes adjuntar etiquetas de visibilidad, una clave de negocio, un memo o tiempos de espera mediante `StartOptions`. Consulta [Opciones de inicio](/docs/configuration/options#startoptions) cuando las necesites.
