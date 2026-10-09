---
sidebar_position: 10
title: 仕組み
description: Laravel キュー、イベントソーシング、アクティビティ、決定的なリプレイによる永続実行の仕組み。
---

# 仕組み {#how-it-works}

Durable Workflow は、Laravel のキュージョブとイベントソーシングによる永続化で、永続コルーチンを実現します。ワークフローは Fiber ベースのヘルパー呼び出しで停止し、永続履歴に従ってリプレイされます。

## ランタイム {#runtime}

ワークフローは、`handle()` メソッドで `activity()`、`await()`、`timer()`、`sideEffect()`、`child()`、`all([...])` などを直接呼び出すクラスです。各呼び出しは、対応する永続ステップが完了するまでワークフローを停止し、記録された結果を使って再開します。

各ステップは永続履歴イベントを生成します。エンジンはワークフローが起きるたびに履歴をリプレイし、イベント列から状態を再構築して、次の未実行ステップへ進みます。このため、Worker の再起動、デプロイ、マシン障害をまたいでも進行状況を失いません。

`WorkflowStub::make()` は、公開ワークフローインスタンス ID を予約します。開始時に最初の実行とワークフロータスクを作成します。各実行には独自の run ID があります。`signal()`、`cancel()`、`terminate()` などは、インスタンスの現在の実行を対象にします。

## イベントソーシング {#event-sourcing}

イベントソーシングは、保存されたイベント列から現在の状態を再構築します。実行イベントの完全な履歴を保持し、Worker がクラッシュした場合もワークフローの再開に使えます。

## コルーチン {#coroutines}

コルーチンは、停止して再開できる関数です。永続的な停止点を、`activity()`、`await()`、`timer()`、`sideEffect()` などの Fiber ベースの呼び出しで表します。

ユーザーコードは通常の `handle()` メソッドにあり、これらを直接呼び出します。ランタイムは、ステップがすでに永続的に完了したか確認します。完了済みなら履歴の結果を返します。未完了なら次のアクティビティ、タイマー、子ワークフローの作業をキューに入れ、そのステップの完了または失敗まで停止します。

## アクティビティ {#activities}

ワークフローは複数のアクティビティを呼び出し、結果を組み合わせます。アクティビティ呼び出しに到達すると停止し、完了後に続行します。

ワークフロー Worker がクラッシュした場合、確定済みイベントをリプレイして現在の状態を再構築します。同じ入力と出力を使って続行し、決定性を保ちます。未処理のワークフロー失敗は、その実行を終端状態にします。リプレイは失敗済みの実行をリトライしません。

v2 の通常のアクティビティは、永続的なキュー作業です。明示的な[ローカルアクティビティ](./features/local-activities.md)は、永続履歴とリトライの意味を保ちながら、ワークフロー Worker のプロセス内で短い処理を実行します。通常のアクティビティは任意の互換 Worker で実行できます。同じ Worker のローカルリソースが必要な複数ステップには、[Worker セッション](./features/worker-sessions.md)の明示的なリースを使います。アクティビティをキューに入れず、一回だけ記録するリプレイに安全な値が必要なら、[`sideEffect(...)`](./features/side-effects.md)を使います。全体の契約は[アクティビティ実行モデル](./features/activity-execution-model.md)を参照してください。

## 実行保証 {#execution-guarantees}

ワークフローとアクティビティでは、繰り返し実行の意味が異なります。

- **ワークフローコードはリプレイされます。** ワークフロータスクの再配信は、永続履歴から状態を再構築し、決定的なコードを再び実行します。記録済みの外部副作用は繰り返しません。
- **アクティビティは少なくとも一回のキュー作業です。** リトライ、リース期限切れ、Worker の喪失により、同じ論理アクティビティが再配信または再び観測されることがあります。重複配信は分散システムの正常な動作です。
- **アクティビティ識別子は永続的です。** `activity_execution_id` はリトライや再配信をまたぐ論理的なアクティビティを、`activity_attempt_id` は個別の試行を識別します。外部の冪等キーには前者を使い、下流システムが試行を区別する必要がある場合だけ後者を使います。

公開 v2 契約は、[実行保証と冪等性](./constraints/execution-guarantees.md)、[アクティビティ実行モデル](./features/activity-execution-model.md)、[障害と復旧](./failures-and-recovery.md)を参照してください。

## キュー {#queues}

キュージョブは、後でバックグラウンド実行する処理です。Laravel は Amazon SQS、Redis、リレーショナルデータベースのキューに対応します。ワークフローとアクティビティはどちらもキュージョブですが、動作が異なります。ワークフローは通常、複数回ディスパッチされます。実行してアクティビティを派遣し、いったん終了して、アクティビティの完了後に再び実行されます。アクティビティは少なくとも一回のタスクです。一般的には一回の試行で成功しますが、リトライ、リース期限切れ、Worker の喪失で、同じ論理アクティビティが複数回配信されることがあります。

## 例 {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## シーケンス図 {#sequence-diagram}

直列と並列のアクティビティを通じて、ワークフローがどのように進むかを示します。

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="ワークフローの実行シーケンス図"
/>

1. ワークフローをキュージョブとしてディスパッチします。
2. 最初のアクティビティ `TestActivity` をディスパッチし、ワークフロージョブを終了します。アクティビティが結果をデータベースに保存し、ワークフローを再びディスパッチします。
3. ワークフローはイベントソーシングのリプレイループに入り、データベースのイベント列から状態を再構築します。ワークフローは常駐プロセスではなく、アクティビティ実行中は終了し、完了後に再びディスパッチされます。
4. リプレイ後、次の `TestOtherActivity` をディスパッチします。アクティビティが完了すると結果を保存し、ワークフローを再びディスパッチします。
5. 再び履歴をリプレイして状態を再構築します。
6. `TestParallelActivity` と `TestParallelOtherActivity` を並列にディスパッチします。両方が結果を保存し、ワークフローへ制御を戻します。
7. 最後に履歴をリプレイして状態を再構築し、ワークフローを完了します。

## 決定性 {#determinism}

起きるたびに履歴をリプレイするため、同じ履歴から同じコマンドを生成する必要があります。[制約](./constraints/overview.md)で、コードのルールと、`Workflow\V2\Workflow` の `Workflow::now()`、`sideEffect()`、`getVersion()` など、非決定的になりうる処理を安全に扱う機能を確認してください。
