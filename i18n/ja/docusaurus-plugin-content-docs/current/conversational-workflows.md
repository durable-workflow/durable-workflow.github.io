---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - 会話型ワークフロー
  - 長期間続く会話
  - 人による承認
  - Worker の交代
---

# 会話型ワークフローのリファレンス {#conversational-workflow-reference}

このページは、組み込み Laravel ランタイムで長期間続く会話を扱う、実行可能なリファレンスです。それぞれ個別のガイドがある機能を組み合わせています。順序付き入力には[シグナル](./features/signals.md)、モデルの処理には[アクティビティ](./defining-workflows/activities.md)、ステータスには[クエリ](./features/queries.md)、履歴の制限には[新しい実行への継続](./features/continue-as-new.md)を使います。サービスモードの Worker は、各 [SDK ガイド](./polyglot/deployment-modes.md)を通じて同じプリミティブを使います。

ソースは[サンプルアプリ](./sample-app.md)の [`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation) にある `ConversationWorkflow` です。決定的な偽のモデルを使うため、AI プロバイダーのアカウントやシークレットは不要です。これは永続性パターンのリファレンスであり、本番用のチャットボットではありません。レイテンシや規模についての保証もしません。

## 実行方法 {#run-it}

サンプルアプリのキュー Worker を実行した状態（`composer run dev`）で、次を実行します。

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

`--message` を指定しない場合、コマンドは入力を求めます。"refund" を含むメッセージを送ると偽のモデルが操作を提案し、コマンドは承認を求めます。`--decision=decline` を指定すると、スクリプトによる承認に拒否で応答します。`/waterline` を開くと、連鎖内の各実行を調べられます。

## ターンの仕組み {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'proposalId', 'type' => 'string'],
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(array $state = [], int $turnsPerRun = 3, int $inactivitySeconds = 3600): array
    {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivitySeconds,
                );
            }

            $text = await('message', $inactivitySeconds);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   uuid4() records an ID for a proposed action (replay-safe)
            //   await('decision', ...) waits for a decision naming that ID
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. 各 `message` シグナルが一つのユーザー入力です。ワークフローは受理したメッセージを、受理した順に一ターンずつ適用します。
2. モデル呼び出しはアクティビティ内で実行します。リプレイでは、モデルを再度呼び出さずに記録済みの結果を再利用します。
3. モデルが操作を提案すると、ワークフローは `uuid4()` でその提案に ID を付けます。`uuid4()` は値を履歴に記録するため、リプレイしても同じ ID が返ります。次に、その ID を指定した `decision` シグナルを待ちます。ID は `status` クエリで確認できます。シグナルは名前ごとにバッファーされるため、別の提案に対する決定（早すぎる送信、二重送信、不確かな応答の後の再送）は次の提案に適用されず、無視されます。保留中の提案が承認された場合だけ `ApplyApprovedActionActivity` を実行します。拒否またはタイムアウトの場合は応答を記録し、何も変更しません。
4. `RecordReplyActivity` は、ワークフロー ID とターン番号から組み立てた参照で、アプリケーションの `conversation_records` テーブルに応答を書き込みます。履歴にはその参照だけを保存します。
5. `status` クエリは、フェーズ（`waiting_for_input`、`thinking`、`awaiting_approval`、`applying_action`、`recording_reply`、`continuing_as_new`、`completed` のいずれか）、世代、ターン数、保留中の提案、最新の応答参照を報告します。応答テキストはその参照で読み取ります。

## Worker を失っても保たれるもの {#what-survives-a-lost-worker}

サンプルのテストは、エンジンを一度に一タスクずつ実行し、選んだ時点で Worker を停止します。

| 障害 | 結果 |
| --- | --- |
| Worker がメッセージを適用するタスクをリースした後に停止する | リースが期限切れになるまで何も進みません。その後、修復パスが同じタスクを別の Worker に渡し、その Worker がメッセージを一回だけ適用します。 |
| モデルのアクティビティの実行中に Worker が停止する | リースの期限切れ後、アクティビティは別の Worker でリトライされます。実行はそのアクティビティの完了を一回だけ記録し、応答も一回だけ記録されます。 |
| 応答の Worker が行を書き込んだ後、報告前に停止する | リトライでアクティビティが再度実行されます。行は参照をキーとしているため、残る応答は一つです。 |

アクティビティは少なくとも一回実行されます。リトライにより、エンジンの外ですでに行われた処理が繰り返されることがあります。永続履歴は各結果を一回だけ記録します。応答と操作の参照と同じように、すべての副作用に安定したキーを与え、外部システムにも同じキーを渡してください。[実行保証](./constraints/execution-guarantees.md)と[リース期限切れと再配信](./constraints/execution-guarantees.md#lease-expiry-and-redelivery)を参照してください。

## 履歴の制限 {#bounding-history}

`$turnsPerRun` ターンの後、実行は新しい実行に継続します。次の実行が受け取るのは、`continueAsNew()` に渡した明示的な状態だけです。つまり、世代、ターン数、サイズを制限した要約、最新の応答参照です。ワークフローオブジェクトのその他のプロパティはリプレイで再構築され、コピーされません。

受理済みでまだ適用されていないメッセージは、元の順序のまま次の実行に移ります。これはワークフローインスタンス宛てに送った宣言済みシグナルに適用されます。特定の実行宛てに送ったシグナルは、その実行が先に閉じると拒否されます。[シグナルの受理と終了](./features/signals.md#acceptance-and-closure)と[新しい実行への継続](./features/continue-as-new.md)を参照してください。

## 利用者の責任として残るもの {#what-stays-your-responsibility}

- **ペイロードの保存。** サンプルは応答テキストをアプリケーションのテーブルに保持します。その保持期間、アクセス制御、バックアップを決めるか、[外部ペイロードストレージ](./features/external-payload-storage.md)を使ってください。
- **要約。** 偽のモデルは固定長の累積要約を保持します。実際のモデルでは、continue-as-new をまたいで引き継ぐコンテキストと、その許容サイズを利用者が決めます。
- **入力や承認を行える人。** エンジンはシグナルとその引数を記録します。シグナルを送る前に、アプリケーション側で送信者とレビュー担当者を認証・認可してください。[送信者の識別と認可](./features/signals.md#sender-identity-and-authorization)を参照してください。
- **外部への影響。** エンジンは外部呼び出しを厳密に一回だけにするわけではありません。承認済み操作のアクティビティと同じように、冪等キーを使ってください。
- **シグナル送信のリトライ。** シグナル送信の応答が失われた場合は、再送する前に[応答が不確かな場合](./features/signals.md#after-an-uncertain-response)を参照してください。

サンプルはアクティビティを通じて応答を保存し、ワークフローコードからメッセージストリームを使いません。Workflow 2.20.0 までのリリースでは、ワークフローコード内の `outbox()->sendReference()` と `inbox()->receive()` はリプレイ安全ではありません（[workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)）。[メッセージストリーム](./features/message-streams.md)の警告を参照してください。

## 関連ガイド {#related-guides}

- [シグナル](./features/signals.md)と[クエリ](./features/queries.md)
- [新しい実行への継続](./features/continue-as-new.md)
- [メッセージストリーム](./features/message-streams.md)
- [アクティビティ](./defining-workflows/activities.md)と
  [実行保証](./constraints/execution-guarantees.md)
- [障害と復旧](./failures-and-recovery.md)
- [サンプルアプリ](./sample-app.md)
