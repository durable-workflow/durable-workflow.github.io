---
sidebar_position: 3
---

# インストール {#installation}

このガイドでは、Laravel アプリに Durable Workflow PHP パッケージをインストールします。

組み込みパッケージと独立した Server のどちらを使うか検討している場合は、[デプロイモード](/docs/polyglot/deployment-modes)を先に読んでください。このページは Laravel 組み込みモードを扱います。

> **動くアプリから始めたい場合：** [Sample App](/docs/sample-app)は、Durable Workflow 2.0 を使う Laravel 13 プロジェクトです。各パターンのワークフロー、Codespaces と `docker compose` の手順を備えています。クローンして `php artisan app:init` を実行すればインストールできます。自分の Laravel アプリに Durable Workflow を追加するとき、このガイドに戻ってください。

## 必要な環境 {#requirements}

- PHP 8.1 以降
- Laravel 9 以降

Laravel が対応するキュードライバーを利用できます。**`sync` ドライバーは対象外です。** 例えば次のドライバーを使えます。

- Amazon SQS
- Beanstalkd
- Database
- Redis

各キュードライバーの[前提条件](https://laravel.com/docs/12.x/queues#driver-prerequisites)を確認してください。

[ロック](https://laravel.com/docs/12.x/cache#atomic-locks)に対応するキャッシュドライバーも必要です。

## Durable Workflow をインストールする {#installing-durable-workflow}

Composer でインストールします。

```bash
composer require %%artifact.workflowComposerPackage%%
```

互換性のある 2.x 更新を Composer で自動的に受け入れたい場合は、`durable-workflow/workflow:^2.0` を使います。ランタイムとパッケージの互換ルールは[バージョン互換性](/docs/compatibility)を参照してください。

パッケージはマイグレーションを自動読み込みするため、インストール後は通常のマイグレーションを実行します。

```bash
php artisan migrate
```

## Worker を実行する {#running-workers}

Durable Workflow はキューを使って、ワークフローとアクティビティをバックグラウンドで実行します。[ `queue:work` コマンド](https://laravel.com/docs/12.x/queues#the-queue-work-command)を実行するか、[Horizon](https://laravel.com/docs/12.x/horizon)でキュー Worker を管理してください。キュー Worker がなければ、ワークフローとアクティビティは処理されません。並列に実行するには、複数のキュー Worker が必要です。
