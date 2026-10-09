---
sidebar_position: 1
description: Durable Workflow Cloud、セルフホスト Server、Laravel 組み込みモードを選び、公式 SDK で最初のワークフローを完了させます。
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - 多言語ワークフローエンジン
  - AI エージェント向けワークフローエンジン
  - 永続オーケストレーション
  - v2 ワークフローの概念
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# はじめに {#introduction}

Durable Workflow 2.0 は、短命なアプリケーションプロセスの外にワークフローの状態と履歴を保存します。PHP、Python、Rust の Worker は、再起動後も安全に処理を再開できます。初めて使う場合は、[クイックスタート](/docs/quickstart/)で一つのワークフローを `completed` まで実行してから、詳しい[機能一覧](/docs/capabilities/)に進んでください。

## デプロイ方法を選ぶ {#choose-a-deployment-model}

### サービスモード {#service-mode}

アプリケーションは公式 SDK を使って、リモートの永続ランタイムに接続します。ランタイムの運用者を選べます。

- **[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)** はマネージドの選択肢です。Durable Workflow がオーケストレーション、永続ストレージ、Managed Waterline を運用します。チームは用意された名前空間に接続する SDK クライアントと Worker を実行します。**Cloud 利用者は Durable Workflow Server や独立した Waterline サービスをインストール、実行する必要はありません。**
- **[セルフホスト Server](/docs/polyglot/server/)** は同じサービス境界を提供し、チームがランタイムのデプロイ、保護、拡張、バックアップ、アップグレードを担当します。Waterline は任意の独立サービスとして、Server が管理する名前空間に接続できます。

どちらも、同じバージョン付き HTTP+JSON コントロールプレーン、Worker プロトコル、名前空間モデル、言語に依存しないペイロード形式を公開します。責任の境界は[デプロイモード](/docs/polyglot/deployment-modes/)を参照してください。

### Laravel 組み込みモード {#embedded-laravel}

組み込みモードは、ワークフローの状態、キュー、設定、運用ツールを既存のインフラ内に置きたい Laravel アプリ向けのデプロイ方法です。`durable-workflow/workflow` をインストールし、Cloud や独立した Server への接続は不要です。Waterline の組み込みパッケージは、アプリが管理する状態をプロセス内で読み取ります。

アプリ内でランタイムを管理したい場合は、[組み込みモードのインストール](/docs/installation/)から始めてください。

安定版 v1 から移行するチームや、既存の 2.0 組み込み構成を見直す Laravel チームは、[Laravel の導入とランタイム移行](/docs/laravel-adoption/)で、実行可能な組み込みモードと PHP SDK の経路を比較してからトラフィックを切り替えてください。

## サービスモードの SDK を選ぶ {#choose-a-service-mode-sdk}

- **[PHP SDK](/docs/polyglot/php/)**：フレームワークに依存しない PHP アプリやリモート Worker に `durable-workflow/sdk` をインストールします。
- **[Python SDK](/docs/polyglot/python/)**：決定的なワークフローとアクティビティを作成し、非同期コントロールプレーンクライアントを使います。<PythonPackageReleaseLink authority="qualified">Python SDK の安定版</PythonPackageReleaseLink>は、Server クイックスタートと同じ機械可読の安定版マニフェストに記載されています。
- **[Rust SDK](/docs/polyglot/rust/)**：決定的なワークフローとアクティビティを作成し、ネイティブ Worker サービスを実行します。

三つとも、同じ公開サービス境界の公式実装です。[クライアントと Worker の機能](/docs/polyglot/cli-python-parity/)は、対応する機能と、意図的に異なるクライアントや Worker の機能を明示しています。

## 最初のワークフローを完了させる {#your-first-completed-workflow}

[クイックスタート](/docs/quickstart/)では、目的、ランタイムの選択、前提条件、所要時間、期待する結果を最初に示します。PHP、Python、Rust のすべてに実行可能な経路があり、選んだ言語の手順だけを表示します。

ローカルのセルフホスト経路は、製品のソースコードを取得せずに、公開済みパッケージとイメージで試せます。Cloud の経路では、Server を実行せず、マネージド名前空間の接続情報を使います。

## サービスモードの構成 {#how-service-mode-fits-together}

サービスモードには三つの部分があります。

- **ランタイム**は、永続状態、コマンドと履歴の記録、タスクのマッチング、タイマー、スケジュール、名前空間、認証済みプロトコルを管理します。マネージド名前空間では Cloud が、セルフホストではチームが運用します。
- **アプリケーション Worker**は、PHP、Python、Rust SDK でワークフローとアクティビティのコードを実行します。アプリと一緒に、または独立サービスとしてデプロイでき、ランタイムと別に拡張できます。
- **クライアントと運用ツール**は、SDK クライアント、`dw` CLI、HTTP API、機械可読スキーマ、Waterline、エージェントインターフェースを通じて、同じランタイム管理下の状態を開始、確認、操作します。

## 共通の公開永続実行契約 {#one-public-durable-execution-contract}

公式 SDK は、登録済みの文字列をワークフロー型とアクティビティ型の名前として使い、共通の公開ペイロード形式を共有します。その形式はコーデックを識別し、PHP のシリアライズ、Python の pickle、Rust の内部型に依存せず、言語間で利用できる値を保持します。

ワークフロー Worker は、永続コマンドと履歴から判断を再構築します。同じ公開コーデックを宣言し、対応する型名を登録した Worker の間では、アクティビティや子ワークフローの入力と結果を言語間で渡せます。特定の SDK 機能に依存する前に、[機能一覧](/docs/capabilities/)とランタイムの機能検出情報を確認してください。

## モードに合った例を使う {#learn-from-the-matching-examples}

- **サービスモードと多言語構成**：[クイックスタート](/docs/quickstart/)と PHP、Python、Rust SDK のガイドを使います。
- **Laravel 組み込みモード**：[Sample App](/docs/sample-app/)で、Laravel ネイティブなワークフローパターンと Waterline の表示を確認できます。

組み込み用のサンプル集は Laravel アプリ向けです。Cloud やセルフホストのサービスモードでは、サービスモードのガイドから始めてください。

## エージェントが操作できる契約 {#agent-operable-by-contract}

運用者と自律エージェントは、同じ機械可読契約を使います。検証可能な操作の流れは、**検出 → 変更 → 実行 → 診断 → 修復**です。バージョンと機能のマニフェスト、明確なワークフローコマンド、構造化された結果、型付き履歴、Worker とキューの診断、安全な変更、変更後の検証を利用します。[エージェントの操作ループ](/docs/agent-operating-loop/)と [AI エージェント向け評価ガイド](/docs/ai-agent-workflow-engine/)を参照してください。

## ワークフローが必要ですか？ {#do-you-need-a-workflow}

次のような処理にはワークフローが適しています。

- 処理が数分、数時間、数日にわたる。
- 人による承認を待つ。
- Webhook や外部イベントを待つ。
- プロセスを動かし続けずに、一時停止して後から再開したい。
- クラッシュ後に、誤った処理や重複を起こさず再開したい。

「五つのキュータスクを順番に実行し、最初の失敗で停止する」だけなら、通常はジョブチェーンが適しています。Durable Workflow は、次のステップが外部イベント、待機、事前には分からない判断に依存する場合に適しています。
