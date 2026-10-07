---
sidebar_position: 3
title: Запуск workflow
description: Запускайте екземпляри workflow асинхронно та додавайте аргументи, метадані видимості, бізнес-ключі й параметри запуску.
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - start workflow
  - workflow instance id
  - durable workflow start options
---

# Запуск workflow {#starting-workflows}

Щоб запустити workflow, створіть його екземпляр, а потім викличте метод `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Після запуску workflow виконуватиметься асинхронно worker черги. Метод `start()`
повертається одразу й не блокує поточний запит.

Передавайте аргументи до методу `handle()` workflow через `start()`:

```php
$workflow->start($orderId);
```

За допомогою `StartOptions` можна додати мітки видимості, бізнес-ключ, memo або
тайм-аути. За потреби дивіться [параметри запуску](/docs/configuration/options#startoptions).
