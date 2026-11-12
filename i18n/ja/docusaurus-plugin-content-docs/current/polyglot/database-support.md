---
title: データベースの互換性
---

# データベースの互換性と検証

組み込み Laravel とセルフホスト Server のデータベース選択には、この表を使ってください。Cloud はランタイムの永続化を管理します。Cloud の利用者はランタイムのデータベースではなく SDK クライアントと Worker を設定します。

宣言された互換性の基準は、それ以降の全バージョンの検証を意味しません。ソーステストと、公開済みパッケージをインストールした検証は別の証拠です。この一覧は Workflow 2.20.3 のソースと Server 3.3.2 の公開記録に紐づきます。ランタイム互換性を変更せず、検証済みの最小・最新バージョン範囲も定めません。

| エンジン | 宣言された互換性 | 観測されたソース検証 | 公開成果物の検証 |
| --- | --- | --- | --- |
| MySQL | 組み込み: 基準 8.0。Server: 基準 8.0。 | Core: 元の可変イメージタグの機能ジョブでは 26.10.0。Server のプロファイル: 8.0.46 と 8.4.5。 | Core の観測は公開ソースに紐づきます。Server 3.3.2 のリリーススモークと正確なインデックスに対する Compose スモークは、起動・ヘルス確認にダイジェスト固定の MySQL 8.0 を使います。実行・容量・TLS 全体の検証ではありません。 |
| PostgreSQL | 組み込み: 基準 13。Server: 基準 13。 | Core: 18.6。Server のプロファイル: 16.15 と 17.11。 | Core の観測は公開ソースに紐づきます。Server 3.3.2 のリリーススモークは、各アーキテクチャのイメージをダイジェスト固定の PostgreSQL 17 上でコールドスタートし、準備状態とクラスター情報だけを確認します。実行・容量・TLS 全体の検証ではありません。 |
| MariaDB | 組み込み: 基準 10.5。Server は `mariadb` を受け付けますが、ここではバージョン基準を確定していません。 | Core: 10.5.29。Server のプロファイル: 10.11.19。 | Core の観測は公開ソースに紐づきます。調査したリリース証拠には Server 3.3.2 のインデックスに紐づく MariaDB エンドポイントの記録はありません。 |
| SQLite | 組み込みの機能・テストには SQLite が含まれます。Server は基準 3.35 を宣言しています。 | 元の Core ソースジョブは SQLite ライブラリのバージョンを出力していません。 | インストール済み Core 2.20.3 の検証は SQLite を使いましたが、ライブラリのバージョン範囲は定めません。Server 3.3.2 のリリーススモークは SQLite 上でコールドスタートしますが、こちらもライブラリのバージョン範囲は定めません。 |
| SQL Server | 公開済み組み込み Core は `sqlsrv` を宣言していますが未検証です。Server の検証もここでは確定していません。 | 公開済み Core のマトリックスに SQL Server ジョブは見つかりません。提案中のバックエンドガードは別のソース作業です。 | 対応する公開検証は確認されていません。組み込み機能の宣言だけからサポートを推測しないでください。 |

## 証拠の読み方 {#reading-the-evidence}

[Core の一覧](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325)は、公開ソースにおける元のイメージダイジェストと MySQL 4 ジョブ、PostgreSQL 4 ジョブ、MariaDB 1 ジョブを紐づけます。公開アップグレードの 12 セルは Laravel/PHP の組み合わせであり、12 種のデータベースではありません。別の[通常インストール済み Core の記録](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927)は、SQLite による stream・replay・fake の 67 ケースを対象とします。PHP バージョンや可変イメージタグから、出力されなかったデータベースバージョンは得られません。

[Server の一覧](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277)はネイティブと旧 PHP のソースジョブの範囲を分けています。Server 3.3.2 では、[リリース実行](https://github.com/durable-workflow/server/actions/runs/42591612884)が amd64 と arm64 のイメージを SQLite、PostgreSQL 17、MySQL 8.0 上でコールドスタートし、`/api/ready` と認証付きのクラスター情報を確認して、それぞれを SIGTERM で停止します。[正確なインデックスに対する Compose スモーク](https://github.com/durable-workflow/server/actions/runs/42602031026)には、インデックス `sha256:4aeceb42…` を対象とするアーキテクチャ・プロファイル別の 4 セルがあります。`local` と `production` はどちらも MySQL を使い、`mysql:8.0` はダイジェストで固定されています。[3.3.2 の配信記録](https://github.com/durable-workflow/server/issues/325#issuecomment-6739628227)は両方を受理しています。これらの実行は空のデータベースで開始します。既存のデータベースのアップグレード、書き込み容量の検証、TLS の検証は行わず、ログは正確なエンジンのパッチバージョンを出力しません。以前の[安定版 3.0.5 の記録](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603)は、可変タグの `mysql:8.0` で同じ構成の Compose スモークを行っていました。ソースのプロファイルは、別の公開イメージを検証しません。

## ベンダーのライフサイクルと分散エンジン {#vendor-lifecycle-and-distributed-engines}

新規導入では、正確なランタイムと DB の組み合わせを検証したうえで、ベンダーが保守する系列を選んでください。[PostgreSQL の方針](https://www.postgresql.org/support/versioning/)では 13 はサポート終了、14 は 2026 年 11 月 12 日に終了します。[Oracle の通知](https://www.mysql.com/support/eol-notice.html)では MySQL 8.0 は 2026 年 4 月 21 日から Sustaining Support です。ベンダーの状況は当社の成果物検証を成立・失効させるものではありません。

TiDB、Vitess、PlanetScale などの分散 MySQL 互換構成は、ここでは未検証です。プロトコル互換性は、トランザクション分離、行ロック、commit・after-commit の可視性、再試行動作を証明しません。導入前に正確なランタイムで確認してください。この表は[単一リージョンの運用範囲](../operator-operating-envelope.md)をマルチリージョンへ拡張しません。
