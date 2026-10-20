---
sidebar_position: 2
title: "冪等性と決定性"
sidebar_label: 冪等性と決定性
description: Durable Workflow 2.0 では、決定性がオーケストレーションの安全なリプレイを支え、冪等性がアクティビティのリトライによる作用を安全にします。
slug: /constraints/idempotent-vs-deterministic
canonical_path: /docs/constraints/idempotent-vs-deterministic/
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - idempotent vs deterministic
  - idempotency vs determinism
  - deterministic vs idempotent
  - deterministic workflow
  - idempotent activity
---

# ワークフローの冪等性と決定性の違い {#idempotent-vs-deterministic-workflows-whats-the-difference}

**決定的な処理は、同じ入力と履歴が与えられたときに同じ判断をします。冪等な処理は、1回実行しても複数回実行しても、意図する作用が同じです。** 決定性は1回の実行を予測可能にし、冪等性は繰り返し実行を安全にします。一方の性質がもう一方を意味するわけではありません。

| 問い | 決定性 | 冪等性 |
| --- | --- | --- |
| 何が同じになるか | 同じ入力と履歴から導く判断 | 1回または複数回の呼び出し後に意図する外部への作用 |
| Durable Workflow で必要な理由 | リプレイで同じワークフロー経路を再構築するため | リトライや再配信で副作用を重複させないため |
| 必要な場所 | ワークフローとオーケストレーションのコード | アクティビティとその呼び出し先システム |
| IO や乱数は禁止されるか | リプレイされるワークフロー内では、結果を記録する場合を除き禁止 | いいえ。アクティビティは IO、時刻、乱数を使っていても、繰り返して安全な作用を実現できる |

## 互いに独立した性質 {#the-properties-are-independent}

### 決定的だが冪等ではない処理 {#deterministic-but-not-idempotent}

カウンターを増やす操作を考えます。

```text
increment(counter):
    counter.value = counter.value + 1
```

開始時のカウンター値が同じなら常に同じ計算をするため、これは決定的です。しかし冪等ではありません。2回呼び出すと2回増加し、1回呼び出すと1回だけ増加します。

### 冪等だが決定的ではない処理 {#idempotent-but-not-deterministic}

次に、注文を既知の状態に設定する一方で、サービスへの接続時にランダムなバックオフを使うアクティビティを考えます。

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

内部試行のタイミングや回数が変わり得るため、この実装は決定的ではありません。それでも操作は冪等にできます。成功した呼び出しが1回でも複数回でも、注文はアーカイブ済みになります。応答、レイテンシ、内部の経路まで同じである必要はありません。同じであるべきなのは、意図する外部への作用です。

## ワークフローのコードに決定性が必要な理由 {#why-workflow-code-must-be-deterministic}

Durable Workflow はコミット済みの履歴をリプレイしてオーケストレーションの状態を再構築します。同じワークフロー入力と履歴に対し、コードは同じアクティビティ、タイマー、待機を同じ順序でスケジュールする必要があります。本体で実時計、乱数、ライブのデータベースクエリ、ネットワーク応答を使うと、リプレイ時に別の分岐を選び、新しい判断が履歴と食い違う可能性があります。

これらの操作はアクティビティに移すか、値を履歴に記録するワークフローヘルパーを使ってください。リプレイは外部操作を再び実行せず、記録済みのアクティビティや副作用の結果を返します。決定性は、すべてのアクティビティ呼び出しが時刻を問わず普遍的な答えを返すことを求めません。リプレイされるオーケストレーションが、記録済み履歴と一致する判断をすることを求めます。

記述ルールは[ワークフローの制約](./workflow-constraints.md)、リプレイのモデルは[仕組み](../how-it-works.md)を参照してください。

## アクティビティと副作用に冪等性が必要な理由 {#why-activities-and-side-effects-must-be-idempotent}

アクティビティは永続化の境界を越え、データベース、決済 API、メールプロバイダー、オブジェクトストレージなどのシステムを操作します。タイムアウト、リトライ、Worker 障害、リース失効後に再配信されることがあります。外部の変更が完了しても、その報告を Durable Workflow が受け取る前に Worker が失敗する場合もあります。

再試行しても安全な作用になるよう設計してください。

- リモート API に安定した冪等性キーを渡す
- 永続的なビジネス識別子や実行識別子で upsert する
- 決定的なオブジェクト名やリソース名に書き込む
- 値の設定や既知のリソースの削除など、元々冪等な操作を使う

冪等性キーはコードを決定的にするものでも、別の試行の開始を防ぐものでもありません。繰り返し試行が同じ論理操作であると、外部システムが認識できるようにします。

リトライ、再配信、永続履歴の契約は、[アクティビティの制約](./activity-constraints.md)、[アクティビティの実行モデル](../features/activity-execution-model.md)、[実行保証と冪等性](./execution-guarantees.md)を参照してください。

## 全 SDK に共通する境界 {#one-boundary-across-every-sdk}

Worker の言語が PHP、Python、Rust のどれでも、同じ設計を適用します。

1. オーケストレーションを安全にリプレイできるようにし、同じ入力と履歴に対して同じ永続コマンドを発行します。
2. ネットワーク呼び出し、時計、乱数、変更可能な外部状態をアクティビティの境界の外に置きます。
3. 副作用を持つ各アクティビティに、対象システムが重複排除できる安定した識別子を与えます。

言語の構文が変わっても、決定性と冪等性の境界は変わりません。
