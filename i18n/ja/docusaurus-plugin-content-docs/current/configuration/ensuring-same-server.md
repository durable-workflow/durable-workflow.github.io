---
sidebar_position: 3
title: Worker の配置とアフィニティ
description: キュー名を物理ホストへの固定と見なさず、キュールーティング、ローカルアクティビティ、Worker セッションを選択します。
tags:
  - configuration
  - workers
  - affinity
keywords:
  - アクティビティ Worker のアフィニティ
  - 専用アクティビティキュー
  - 同一プロセスのアクティビティ
  - Worker セッション
---

# Worker の配置とアフィニティ {#worker-placement-and-affinity}

キュー名はルーティングの境界であり、物理ホストへのアフィニティを保証しません。ワークフローやアクティビティの `$queue` は、タスクを取得できる Worker を制限しますが、そのキューをポーリングする互換性のある Worker ならどれでも受信できます。データを永続的な共有領域にも保存している場合を除き、通常のアクティビティ間で Worker のローカルファイルシステムを使ってデータを渡さないでください。

## 専用 Worker プールへのルーティング {#route-work-to-a-dedicated-worker-pool}

共有ボリュームをマウントした Worker や GPU を備えた Worker など、特定の Worker プールが必要な処理には専用キューを使います。

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

そのキューでは対象の Laravel Worker だけを起動します。

```bash
php artisan queue:work --queue=gpu-activities
```

Laravel Horizon でも同じキューを監視できます。どちらも保証するのは「このキューに割り当てられた Worker のいずれか」であり、「前のステップを実行した同じプロセスやホスト」ではありません。引き継ぐデータは、永続ワークフローペイロード、外部ペイロードストレージ、または実行可能な全 Worker が参照できる別の共有ストアに保存してください。

## 必要なアフィニティ契約の選択 {#choose-the-affinity-contract-you-need}

- キュー内の互換性のあるどの Worker でも実行できる処理には、[通常のキュー経由アクティビティ](/docs/defining-workflows/activities)を使います。
- 短くリトライ可能な1つのアクティビティを、現在のワークフロータスクを処理する Worker プロセス内で実行する必要がある場合は、[ローカルアクティビティ](/docs/features/local-activities)を使います。
- プロセスローカルな状態、GPU メモリ、Worker にマウントされたローカルファイルシステムのために、複数の永続アクティビティステップで同じセッションリースを再利用する必要がある場合は、[Worker セッション](/docs/features/worker-sessions)を使います。

Worker セッションでも最初にキュールーティングが適用されます。その後に、失効と任意の再取得を含む明示的なリースと機能の契約を追加します。個々のマシンが永久に存続するわけではありません。Worker の喪失やセッションの再取得後も状態が必要なら、永続的な共有ストレージに保存してください。

配置方法の比較は[アクティビティの実行モデル](/docs/features/activity-execution-model)、クラス単位と呼び出し単位のキュー設定は[オプション](/docs/configuration/options#queue)を参照してください。
