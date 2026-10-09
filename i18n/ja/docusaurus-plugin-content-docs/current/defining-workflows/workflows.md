---
sidebar_position: 1
title: ワークフロー
description: Durable Workflow v2 のワークフロークラスを定義し、オーケストレーションコードの決定性を保ちます。
tags:
  - authoring
  - workflows
  - determinism
keywords:
  - ワークフロークラス
  - v2 ワークフローの作成
  - 決定的なワークフローコード
---

# ワークフロー {#workflows}

ワークフローとアクティビティは、フレームワークの `Workflow` と `Activity` 基底クラスを継承して定義します。ワークフローは、直列、並列、またはその組み合わせで実行するアクティビティを定義するクラスです。

Artisan の `make:workflow` コマンドでワークフローを作成できます。

```php
php artisan make:workflow MyWorkflow
```

`Workflow` を継承し、`handle()` メソッドを実装します。

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
