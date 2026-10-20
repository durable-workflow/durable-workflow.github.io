---
sidebar_position: 5
---

# Стан workflow {#workflow-status}

`running()` читає стан, завантажений у дескриптор. Перед перевіркою workflow, який
виконує інший worker черги, викличте `refresh()`. Обмежте час очікування та робіть
паузу між читаннями:

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

Завершення часу спостереження припиняє лише очікування цього викликача і не скасовує
workflow. Збережіть його ID, щоб інший спостерігач міг завантажити поточний стан.
Кінцеву помилку, скасування чи примусове завершення слід обробити перед читанням
успішного результату.

Дескриптор екземпляра з `Workflow\V2\WorkflowStub::load($workflowId)` після `refresh()`
стежить за поточним запуском, зокрема після `continueAsNew()`. Дескриптор з `loadRun()`
або `loadSelection()` продовжує спостерігати за вибраним запуском, завершення якого
може означати перехід до наступного. Вибір запуску та подробиці його закриття
описано в [Workflow API](./workflow-api.md).

## Значення станів {#status-values}

Метод `status()` повертає рядкові значення стану:

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

- `reserved` означає, що ідентифікатор екземпляра створено, але першу команду
  запуску ще не прийнято
- `pending` означає, що запуск існує та має роботу, готову для отримання
- `running` означає, що завдання workflow має активну оренду worker
- `waiting` означає, що запуск очікує на стійке джерело відновлення, наприклад
  activity, timer або іменований signal
- `cancelled` означає, що прийнята команда скасування на рівні рушія закрила
  поточний запуск
- `terminated` означає, що прийнята команда примусового завершення на рівні
  рушія примусово закрила поточний запуск
- `completed`, `failed`, `cancelled` та `terminated` є кінцевими станами запуску

Коли запуск використовує `continueAsNew()`, старий запуск завершується зі
`status = completed` та `closed_reason = continued`. Waterline залишає його в
групі завершених, але показує точне `closed_reason`, щоб оператори бачили, що
екземпляр перейшов до нового запуску.

`running()` повертає `true` для `pending`, `running` та `waiting`.

## Автомат станів {#state-machine}

Це автомат станів workflow.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="Автомат станів workflow"
/>
