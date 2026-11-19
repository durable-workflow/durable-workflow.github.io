---
sidebar_position: 3
---

# インストール {#installation}

このガイドでは、Laravel アプリに Durable Workflow PHP パッケージをインストールします。

組み込みパッケージと独立した Server のどちらを使うか検討している場合は、[デプロイモード](/docs/polyglot/deployment-modes)を先に読んでください。このページは Laravel 組み込みモードを扱います。

> **動くアプリから始めたい場合：** [Sample App](/docs/sample-app)は、Durable Workflow 2.0 を使う Laravel 13 プロジェクトです。各パターンのワークフロー、Codespaces と `docker compose` の手順を備えています。クローンして `php artisan app:init` を実行すればインストールできます。自分の Laravel アプリに Durable Workflow を追加するとき、このガイドに戻ってください。

## 必要な環境 {#requirements}

- PHP 8.x 系の 8.2 以降
- Laravel 12.x 系の 12.72 以降、または 13.x 系の 13.41 以降
- Laravel 13 では PHP 8.3 以降

これは現在の組み込みリリースの要件です。古いアプリの Composer を更新する前に、
[公開済みの対応リリース系列](./compatibility.md#laravel-support)を選んでください。
サービスモードの基本 PHP SDK には別の要件があります。

組み込みと Server の宣言、正確なテスト構成、検証の限界は[データベースの互換性](./polyglot/database-support.md)を確認してください。

Laravel が対応するキュードライバーを利用できます。**`sync` ドライバーは対象外です。** 例えば次のドライバーを使えます。

- Amazon SQS
- Beanstalkd
- データベース
- Redis

各キュードライバーの[前提条件](https://laravel.com/docs/12.x/queues#driver-prerequisites)を確認してください。

[ロック](https://laravel.com/docs/12.x/cache#atomic-locks)に対応するキャッシュドライバーも必要です。

## Durable Workflow をインストールする {#installing-durable-workflow}

Composer でインストールします。

```bash
composer require %%artifact.workflowComposerPackage%%
```

上のコマンドは公開済みの組み込みリリースを固定します。制約を広げたり古いアプリを更新したりする前に、
[Laravel のサポートと更新の境界](./compatibility.md#laravel-support)を確認してください。

パッケージはマイグレーションを自動読み込みするため、インストール後は通常のマイグレーションを実行します。

```bash
php artisan migrate
```

## Worker を実行する {#running-workers}

Durable Workflow はキューを使って、ワークフローとアクティビティをバックグラウンドで実行します。[`queue:work` コマンド](https://laravel.com/docs/12.x/queues#the-queue-work-command)を実行するか、[Horizon](https://laravel.com/docs/12.x/horizon)でキュー Worker を管理してください。キュー Worker がなければ、ワークフローとアクティビティは処理されません。並列に実行するには、複数のキュー Worker が必要です。

### Worker のタイムアウト {#worker-timeout}

PHP に `pcntl` 拡張がある場合、キュー Worker はタイムアウトを超えて実行されたジョブを強制終了します。タイムアウトは Worker の `--timeout`（デフォルトは 60 秒）で、ジョブが独自に設定している場合はその値です。強制終了されたワークフロータスクはリースを失い、ロールバックされます。再試行はリースの期限（`workflows.v2.workflow_task_lease_seconds`、デフォルトは 300 秒）が切れた後にしか行われず、再試行では同じ作業が繰り返されます。幅の広い `all()` をスケジュールまたは完了するタスクのように、常にタイムアウトより長い時間を必要とするワークフロータスクは、いつまでも完了しません。

次の三つの設定を揃える必要があります。

- **ワークフロータスクのタイムアウト**は**ワークフロータスクのリース**より短くしなければなりません。リースを超えて実行される作業は完了できません。
- キュー接続の **`retry_after`** は、Laravel が求めるとおり、その接続上のすべてのジョブのタイムアウトより長くしなければなりません。そうでないと、キューはまだ実行中のジョブを別の Worker に渡してしまいます。
- **アクティビティ**には上限のあるタイムアウトを残し、ハングしたアクティビティが Worker を永久に占有できないようにしてください。`--timeout=0` は使わないでください。

ワークフロータスクは専用のキュー接続で実行し、その接続の `retry_after` をリースより長く、Worker の `--timeout` をリースより短くしてください。アクティビティは、それに合ったタイムアウトを設定した別のキューで実行してください。アクティビティクラスが独自の `$connection` または `$queue` を設定していない限り、アクティビティはワークフローのキューを使います。

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

Horizon では、各 supervisor の `timeout` オプションが Worker のタイムアウトです。新しい Workflow リリースでは、すべてのワークフロータスクのジョブにこのタイムアウト（リースから 30 秒を引いた値で、`retry_after` より少なくとも 10 秒短く保たれます）が設定されるため、短い Worker タイムアウトでワークフロータスクが強制終了されることはなくなります。ワークフローキューの Worker は、`retry_after` がワークフロータスクを制限している場合、起動時に警告をログに出力します。
