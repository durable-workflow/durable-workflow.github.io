---
sidebar_position: 3
---

# インストール {#installation}

このガイドでは、Laravel アプリに Durable Workflow PHP パッケージをインストールします。

組み込みパッケージと独立した Server のどちらを使うか検討している場合は、[デプロイモード](/docs/polyglot/deployment-modes)を先に読んでください。このページは Laravel 組み込みモードを扱います。

> **動くアプリから始めたい場合：** [Sample App](/docs/sample-app)は、Durable Workflow 2.0 を使う Laravel 13 プロジェクトです。各パターンのワークフロー、Codespaces と `docker compose` の手順を備えています。クローンして `php artisan app:init` を実行すればインストールできます。自分の Laravel アプリに Durable Workflow を追加するとき、このガイドに戻ってください。

## 必要な環境 {#requirements}

公開済みの Workflow 2.20.x 系列には、次が必要です。

- PHP `^8.1`
- [パッケージマニフェスト](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)
  に記載された最低バージョンを満たす Laravel 10–13

Laravel 11 と 12 には PHP 8.2 以降、Laravel 13 には PHP 8.3 以降が必要です。
正確な制約と PHP SDK の独立した要件は
[バージョン互換性](/docs/compatibility/#embedded-php-and-laravel-support)を参照してください。

### Workflow 2.21 への準備 {#preparing-for-workflow-2-21}

:::info 未公開のサポート変更

Workflow 2.21 のソースは PHP `^8.2` と Laravel `^12.69.0|^13.30.0` を要求します。
まだ公開されておらず、Release Verification も完了していません。下記のインストールコマンドは
引き続き公開済みの成果物を選択します。ソースの統合だけでは、その根拠は変わりません。

:::

2.21 を導入する前に、PHP 8.1 または Laravel 10/11 のアプリケーションを対応プラットフォームへ
更新してください。Laravel 13 には引き続き PHP 8.3 以降が必要です。準備とテストの間は既存の
2.20.x のロックファイルを保持し、Web、CLI、Worker の各プロセスの環境を更新します。
2.21 を明示的に指定した場合、非対応の環境は拒否される必要があります。Composer の
プラットフォーム検査とセキュリティ勧告によるブロックを有効にしてください。
2.20.x を維持しても、古い PHP や Laravel の上流のセキュリティサポートは延長されません。

このサポート変更自体は、スキーマ、履歴、プロトコルの移行を導入しません。
既存の v1 実行は v1 が引き続き管理します。排出または共存には、引き続き
[移行手順](/docs/migration/)を適用してください。

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

互換性のある 2.x 更新を Composer で自動的に受け入れたい場合は、`durable-workflow/workflow:^2.0` を使います。ランタイムとパッケージの互換ルールは[バージョン互換性](/docs/compatibility)を参照してください。

パッケージはマイグレーションを自動読み込みするため、インストール後は通常のマイグレーションを実行します。

```bash
php artisan migrate
```

## Worker を実行する {#running-workers}

Durable Workflow はキューを使って、ワークフローとアクティビティをバックグラウンドで実行します。[`queue:work` コマンド](https://laravel.com/docs/12.x/queues#the-queue-work-command)を実行するか、[Horizon](https://laravel.com/docs/12.x/horizon)でキュー Worker を管理してください。キュー Worker がなければ、ワークフローとアクティビティは処理されません。並列に実行するには、複数のキュー Worker が必要です。
