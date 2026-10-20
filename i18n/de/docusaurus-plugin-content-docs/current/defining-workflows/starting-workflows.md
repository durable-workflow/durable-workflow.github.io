---
sidebar_position: 3
title: Workflows starten
description: Starten Sie Workflow-Instanzen asynchron und versehen Sie sie mit Argumenten, Sichtbarkeitsmetadaten, Geschäftsschlüsseln und Startoptionen.
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - Workflow starten
  - Workflow-Instanz-ID
  - Startoptionen für Durable Workflow
---

# Workflows starten {#starting-workflows}

Erstellen Sie zum Starten eines Workflows eine Workflow-Instanz und rufen Sie
anschließend deren Methode `start()` auf.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

Nach dem Start wird ein Workflow asynchron von einem Queue-Worker ausgeführt.
Die Methode `start()` kehrt sofort zurück und blockiert die aktuelle Anfrage
nicht.

Übergeben Sie Argumente an die Workflow-Methode `handle()` über `start()`:

```php
$workflow->start($orderId);
```

Über `StartOptions` können Sie Sichtbarkeitslabels, einen Geschäftsschlüssel,
ein Memo oder Timeouts hinzufügen. Bei Bedarf finden Sie diese unter
[Startoptionen](/docs/configuration/options#startoptions).
