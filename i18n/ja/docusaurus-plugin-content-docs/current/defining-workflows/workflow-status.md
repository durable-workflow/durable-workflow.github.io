---
sidebar_position: 5
---

# ワークフローの状態 {#workflow-status}

`running()` はハンドルに読み込まれた状態を参照します。別のキュー Worker が実行中のワークフローを観測する前に `refresh()` を呼んでください。読み取りの間に休止を挟み、期限付きで待機します。

```php
$deadline = hrtime(true) + 20_000_000_000;
do {
    $workflow->refresh();
    if (! $workflow->running()) {
        break;
    }
    usleep(100_000);
} while (hrtime(true) < $deadline);

if ($workflow->running()) {
    throw new RuntimeException('Workflow is still running; observation deadline expired.');
}
if (! $workflow->completed()) {
    throw new RuntimeException('Workflow ended with status '.$workflow->status());
}
$result = $workflow->output();
```

観測のタイムアウトは、この呼び出し元の待機を終了するだけで、ワークフローをキャンセルしません。別の観測者が現在の状態を読み込めるよう、ワークフロー ID を保持してください。成功時の出力を読む前に、終端の失敗、キャンセル、強制終了を処理する必要があります。

`Workflow\V2\WorkflowStub::load($workflowId)` で得たインスタンスハンドルは、更新すると `continueAsNew()` をまたいで現在の実行を追跡します。`loadRun()` や `loadSelection()` のハンドルは選択した実行を観測し続けます。その完了は後続実行への継続を意味する場合があります。実行の選択と終了の詳細は[ワークフロー API](./workflow-api.md)を参照してください。

## 状態の値 {#status-values}

`status()` は状態を文字列で返します。

```text
reserved
pending
running
waiting
cancelled
terminated
completed
failed
```

- `reserved` はインスタンス ID が作成済みで、最初の開始コマンドがまだ受理されていない状態です。
- `pending` は実行が存在し、取得可能な処理がある状態です。
- `running` はワークフロータスクが Worker に有効にリースされている状態です。
- `waiting` はアクティビティ、タイマー、名前付きシグナルなど、永続的な再開要因を待っている状態です。
- `cancelled` はエンジンレベルのキャンセルコマンドが受理され、現在の実行が終了した状態です。
- `terminated` はエンジンレベルの強制終了コマンドが受理され、現在の実行が強制的に終了した状態です。
- `completed`、`failed`、`cancelled`、`terminated` は実行の終端状態です。

`continueAsNew()` を使うと、旧実行は `status = completed`、`closed_reason = continued` で終了します。Waterline は完了の分類に入れつつ、正確な `closed_reason` を表示するため、運用者はインスタンスが新しい実行へ進んだことを確認できます。

`running()` は `pending`、`running`、`waiting` に対して `true` を返します。

## 状態マシン {#state-machine}

ワークフローの状態遷移を以下に示します。

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="ワークフロー状態の状態マシン"
/>
