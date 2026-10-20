---
sidebar_position: 3
title: ワークフローの開始
description: ワークフローインスタンスを非同期に開始し、引数、可視化メタデータ、ビジネスキー、開始オプションを指定します。
tags:
  - authoring
  - workflow-start
  - visibility
keywords:
  - start workflow
  - workflow instance id
  - durable workflow start options
---

# ワークフローの開始 {#starting-workflows}

ワークフローを開始するには、ワークフローインスタンスを作成し、その `start()` メソッドを呼び出します。

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start();
```

開始したワークフローはキュー Worker が非同期に実行します。`start()` は直ちに戻り、現在のリクエストをブロックしません。

`start()` を通じてワークフローの `handle()` メソッドに引数を渡します。

```php
$workflow->start($orderId);
```

`StartOptions` では可視化ラベル、ビジネスキー、メモ、タイムアウトを指定できます。必要に応じて[開始オプション](/docs/configuration/options#startoptions)を参照してください。
