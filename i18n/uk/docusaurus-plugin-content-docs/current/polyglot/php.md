---
sidebar_position: 9
title: PHP SDK
description: Підключення незалежних від фреймворку PHP-застосунків і віддалених workers до самостійно розгорнутого Server або керованого Cloud runtime.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Durable Workflow PHP SDK
  - віддалений PHP worker
  - PHP клієнт окремого Server
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# PHP SDK {#php-sdk}

Використовуйте `durable-workflow/sdk`, коли PHP-застосунок або віддалений worker
підключається до окремого Durable Workflow Server чи runtime URL namespace
у Durable Workflow Cloud. Цей офіційний SDK не залежить від фреймворку:
він надає клієнт площини керування, автентифікацію, транспорт, публічний codec
payload, обробник replay та керований життєвий цикл віддаленого worker,
не потребуючи Laravel або пакета вбудованого рушія.

## Спробуйте локальний playground Sample App {#try-the-local-sample-app-playground}

Для найкоротшого шляху до написання workflow без Cloud відкрийте
[`main` у GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
для поточного Sample App і виконайте:

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

Локальний playground генерує код workflow та activity, яким володіє користувач,
вибирає поточні стабільні артефакти й запускає опубліковані Server та Waterline.
Перед запуском workflow він очікує реєстрації worker, у якого ідентифікатор,
тип workflow, тип activity і task queue відповідають згенерованому контракту.
Успішний запуск має повернути очікуваний результат та історію. Після цього
термінал виводить точне локальне посилання на run у Waterline та шлях
до структурованих JSON-даних перевірки.

Наведені нижче quickstart і довідник API самого пакета залишаються прямим шляхом
для тих, хто додає SDK до наявного проєкту без Sample App.

<ProductPromotion source="docs-v2-php-sdk">
Запускайте PHP-клієнти та workers у керованому Cloud namespace з окремими
обліковими даними для кожної ролі.
</ProductPromotion>

Покрокові настанови щодо початку роботи, інтеграції з фреймворками, тестування,
розгортання й діагностики наведено на
[порталі PHP-розробника](https://php.durable-workflow.com/). Точні сигнатури
конструкторів, типи результатів та класи винятків дивіться в окремому
[згенерованому довіднику API](https://php.durable-workflow.com/api/).
[Машиночитаний контракт](https://php.durable-workflow.com/quickstart-contract.json)
порталу визначає пакет, форми runtime, облікові дані ролей, вихідні файли,
очікуваний результат і smoke-перевірку опублікованого артефакту як єдиний
перевірений шлях.

Клієнти Cloud використовують runtime URL та namespace, повернуті під час
підготовки середовища, з окремими обліковими даними клієнта і worker.
Цю межу підключення описано в
[керованому Cloud runtime](/docs/polyglot/cloud-control-plane).
Приклади нижче показують той самий SDK із локальними значеннями
для самостійно розгорнутого Server.

Для окремого вбудованого режиму Laravel використовуйте
`durable-workflow/workflow`. У ньому застосунок зберігає стан workflow
у власній базі даних і виконує роботу через черги Laravel.
Повне порівняння відповідальності наведено в
[режимах розгортання](/docs/polyglot/deployment-modes/).

## Вимоги {#requirements}

- PHP 8.1 або новіший
- Доступний [самостійно розгорнутий Server](/docs/polyglot/server/) або підготовлений
  [runtime простору імен Cloud](/docs/polyglot/cloud-control-plane)

## Встановлення {#install}

Установіть поточний опублікований PHP SDK. Точна вимога нижче генерується
з джерела опублікованих артефактів, яке оновлюється з реєстрів.
Composer записує вибраний пакет у `composer.lock`:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

SDK використовує офіційний Composer-пакет `apache/avro` для публічної оболонки
payload. Його production-залежності не включають Laravel, Illuminate,
`durable-workflow/workflow` чи `durable-workflow/server`.

## Запуск та огляд workflow {#start-and-inspect-a-workflow}

Quickstart SDK створює чистий Composer-проєкт, визначає workflow та activity
з атрибутами, запускає worker, починає workflow з унікальним ідентифікатором
і чекає результату. Ті самі файли `bootstrap.php`, `worker.php` і
`client.php` установлюються з пакета та виконуються захищеною smoke-перевіркою
опублікованого артефакту. Тому ця сторінка не підтримує ще одну копію коду.

Виберіть лише значення підключення до runtime:

| Runtime | Значення для `Client` | Формування шляху запиту SDK |
| --- | --- | --- |
| Самостійно розгорнутий Server | Адреса origin без шляху, наприклад `http://localhost:8080` | Додає один сегмент `/api`. Користувач не додає `/api` самостійно. |
| Durable Workflow Cloud | Повний підготовлений URI, наприклад `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Зберігає шлях namespace runtime і додає після нього endpoint `/api`. |

Точні команди й відкритий вихідний код наведено в
[перевіреному PHP-сценарії](https://php.durable-workflow.com/).
Клієнтські операції читають `DURABLE_WORKFLOW_CLIENT_TOKEN`,
а polling worker читає `DURABLE_WORKFLOW_WORKER_TOKEN`.
Настанова зберігає ці облікові дані в окремих процесах, не виводячи
й не додаючи жодне значення до репозиторію.

`Worker::register()` знаходить обробники `#[Workflow]` та `#[Activity]`
в одному вихідному файлі. Настанова також описує пряму альтернативу
`registerWorkflow()`/`registerActivity()` для коду на основі callable.
Bootstrap звільняє користувача від вибору шляху autoloader, коли ці файли
запускаються в окремому проєкті, checkout SDK, установленому пакеті
або playground/контейнері, де вони лежать поруч із Composer-каталогом `vendor/`.

`WorkflowHandle` стежить за поточним run після переходу continue-as-new.
Коли операцію потрібно обмежити конкретним run, використовуйте його
методи для вибраного run.

## Життєвий цикл, update, розклади та огляд стану {#lifecycle-updates-schedules-and-visibility}

Поточний публічний клієнт підтримує більше, ніж отримання результату вибраного run:

- `WorkflowHandle` надає `describe`, `result`, `signal`, `query`,
  `cancel` та `terminate`, з варіантами для безпечної роботи з конкретним run.
- `Client` надає `listWorkflows` із серверними фільтрами та пагінацією,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow` та `terminateWorkflow`.
- `requestCancellation()` запитує обмежене в часі cleanup у workers,
  які підтримують кооперативне скасування. Наявні `cancel()` та
  `cancelWorkflow()` закривають run негайно. Контракт написання та відновлення
  описано в [кооперативному скасуванні](/docs/polyglot/cancellation).
- Методи schedules охоплюють створення, опис, список, зміну, призупинення,
  відновлення, ручний запуск, backfill і видалення.
- Операційний огляд включає `listNamespaces`, `listWorkers` та
  `listTaskQueues` з відповідними методами опису.

Віддалені workers реєструють обробники workflow, activity, query та update
через `registerWorkflow`, `registerActivity`, `registerQuery`
та `registerUpdate`. Повні параметри й типи результатів наведено
у [згенерованому довіднику PHP SDK API](https://php.durable-workflow.com/api/).

## Контекст повторних спроб і вихідний запуск активності {#activity-retry-context}

PHP SDK **3.6.1 або новіший** надає `$context->retryInfo`, `$context->workflowId` і `$context->runId` в активностях у сервісному режимі. Перевірка `$context->retryInfo->isLastConfiguredAttempt() === true` визначає останню налаштовану спробу політики з обмеженням кількості спроб. `attemptNumber` зберігає початковий отриманий номер спроби.

Знімок розрізняє три стани: `policyProvided === false` означає, що отримане завдання не містило політики; передане кореневе значення `null` означає невідому застарілу політику; об’єкт із явно заданим `max_attempts: null` означає необмежені спроби. Саме лише повернення `null` з `maxAttempts()` не доводить відсутності обмеження. SDK не вигадує ліміт за замовчуванням. Скасування, помилка без повторної спроби, завершення workflow та вичерпані строки можуть припинити виконання до досягнення ліміту.

Ідентифікатори workflow і запуску вказують на початковий запуск, якому належить активність. Відсутні застарілі ідентифікатори залишаються `null`. Локальні активності зберігають відомі батьківські ID, не успадковуючи політику повторних спроб віддаленої активності. Щоб надіслати сигнал відповідному workflow, вимагайте обидва ID, явно вкажіть `runId` і повторно використовуйте стабільний ID запиту бізнес-події між спробами.

Обробляйте сигнали ідемпотентно для відповідної бізнес-події. Самого стабільного ID запиту недостатньо для гарантії одноразового прийняття сигналу.

Дивіться [повні приклади перевірки останньої спроби та сигналу власному запуску](https://php.durable-workflow.com/build/workflows-activities/#inspect-retry-budget-and-the-owning-workflow) у посібнику PHP SDK.

## Heartbeat activity {#activity-heartbeats}

Для віддалених activities викликайте `ActivityContext::heartbeat($details)` під час обмеженої роботи activity, задовго до налаштованого тайм-ауту heartbeat. Перше вікно починається, коли runtime отримує повноваження на завдання, а не коли PHP отримує його. Затримки запитів, паузи й транспортні повтори витрачають це вікно. Дотримуйтеся [порад щодо періодичності](../features/heartbeats.md#heartbeat-cadence-and-receipts).

Метод повертає `void`. У прямому шляху обробника відповідь про зупинку спричиняє `ActivityCancelled`. Помилки HTTP та транспорту з `Client::heartbeatActivityTask()` надходять як `ServerException`. Worker із кооперативним наглядом може зупинити чи покинути свій callback у разі збою heartbeat або перевірки повноважень, замість повернути звичайну відповідь коду activity. Не припускайте, що код очищення завжди виконається, не приховуйте втрату повноважень і не надсилайте успіх після неї.

Повернення з виклику не фіксує зовнішньої роботи та не надає відновлюваної контрольної точки. Зберігайте зовнішні ефекти ідемпотентними й не вважайте транспортний повтор новим вікном heartbeat.

## Запуск віддаленого PHP worker {#run-a-remote-php-worker}

Обробники workflow є звичайними callable, які виконуються послідовно
в керованому Fiber. Викликайте такі операції, як
`WorkflowContext::activity()`, безпосередньо. SDK призупиняє Fiber на durable-рішеннях
і під час replay повертає записані результати, не повторюючи зовнішню activity.
Не оголошуйте workflow як Generator і не повертайте команди `WorkflowContext`
через yield: результати Generator відхиляються. Керований worker реєструє
назви типів workflow та activity, опитує публічний worker-протокол,
надсилає heartbeats, завершує tasks успішно або з помилкою та підтримує
коректне завершення процесу, коли доступний `pcntl`.

### Вибір першого завершення {#first-completion-selection}

Використовуйте `WorkflowContext::select()`, щоб почати незалежні відкладені
activities, дочірні workflows, timers, очікування умов або вкладені звичайні
бар'єри та продовжити з першим переможцем, durable-результат якого вже зафіксовано.
Повернений `SelectionResult` містить сталі ключі й ідентифікатори учасників
та по одному handle для кожного:

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

Вибір не скасовує інших учасників. Викличте `await()` на handle,
щоб отримати його майбутній результат, або `cancel()`, щоб записати явне
скасування. Новий worker або replay завершеної історії використовує записаного
переможця навіть за іншого порядку доставки повторних чи пізніших вхідних
і термінальних подій.
`cancel()` повертає void і не повідомляє термінальний результат.
Лише історія `SelectionOperationCancelled` доводить, що скасування перемогло.
Replay проходить запит cancel без такого запису. Якщо операція завершилася
раніше, `await()` усе одно повертає її результат.

## Сумісність входу та відновлення {#entry-compatibility-and-recovery}

**Підтримка в опублікованих випусках.** SDK PHP 2.5.4 запровадив наведений нижче захист входу, а Server 2.9.9 додав маршрутизацію та відновлення. Це мінімальні версії для цих можливостей. Установлюйте поточні стабільні випуски, щоб отримувати виправлення безпеки.

Керований worker перевіряє записаний позиційний вхід handler до входу в його Fiber. Відсутній обов’язковий аргумент або несумісний оголошений PHP-тип спричиняє `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` і причину task `workflow_entry_arguments_mismatch`. Необов’язкові значення за замовчуванням застосовуються лише до пропущеного входу, а не замінюють несумісне записане значення. `TypeError`, кинутий після успішного входу, залишається помилкою застосунку.

Worker автоматично оголошує `workflow_entry_arguments_validation`. За відповідної підтримки Server відхилений task блокується для replay, а оригінальний run залишається нетермінальним. Старіший runtime може натомість повторювати невдалий task, тому одного оновлення SDK недостатньо для повного контракту відновлення.

Перевірте оригінал через `Client::describeWorkflow($workflowId, $runId)` і debug endpoint вибраного run. Відновіть сумісний код перед `Client::repairWorkflow($workflowId, $runId)`, а потім переконайтеся, що той самий run продовжується без зміни входу, історії, ідентичності маршрутизації чи дедлайнів. Не перехоплюйте цю помилку всередині тіла workflow та не застосовуйте repair до несумісного коду знову і знову. Див. [процедуру сервісного відновлення](../failures-and-recovery.md#service-entry-recovery) та [маршрутизацію визначень](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Сервісний режим фреймворків та вбудований Laravel {#framework-service-mode-and-embedded-laravel}

Той самий пакет містить офіційні інтеграції
[Laravel service mode](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
та [Symfony service mode](https://github.com/durable-workflow/sdk-php#symfony-service-mode).
Вони зберігають dependency injection фреймворку, конфігурацію, логування,
консольні workers і тестові fakes, підключаючись до Cloud або Server.

Ці інтеграції відрізняються від
[вбудованих Laravel workflows](/docs/installation/), де
`durable-workflow/workflow` передає самому Laravel-застосунку зберігання
durable-стану та виконання через черги Laravel.
[Інтеграція Laravel та перехід між runtime](/docs/laravel-adoption/)
показує той самий типовий Laravel-сценарій у v1, вбудованому v2 та цьому
service mode, включно з drain і rollback.
Ширше порівняння меж runtime наведено в
[режимах розгортання](/docs/polyglot/deployment-modes/).

## Межі протоколу та випусків {#protocol-and-release-boundary}

SDK оголошує підтримуваний діапазон Server, версію worker-протоколу,
версію площини керування й codecs payload у Composer metadata.
Server також публікує прийняті протоколи та codecs через
`GET /api/cluster/info`. Під час розгортання перевіряйте discovery runtime,
а не виводьте сумісність із patch-версії Server.

PHP SDK має незалежну від Laravel-пакета версію. Зберігайте точну опубліковану
версію у виконуваних прикладах і читайте примітки до випуску під час оновлення
SDK. Сумісність визначає оголошений контракт SDK, а не збіг номерів версій пакетів.

## Пов'язані довідники {#related-references}

- [Окремий Server](/docs/polyglot/server/)
- [Режими розгортання](/docs/polyglot/deployment-modes/)
- [Worker-протокол](/docs/polyglot/worker-protocol/)
- [Каталог можливостей](/docs/capabilities/)
- [Портал PHP-розробника](https://php.durable-workflow.com/)
- [Довідник PHP API](https://php.durable-workflow.com/api/)
- [Виконуваний PHP quickstart-контракт](https://php.durable-workflow.com/quickstart-contract.json)
- [Вихідний код PHP SDK](https://github.com/durable-workflow/sdk-php)

## Сторінки списку workflow та історії {#workflow-list-and-history-pages}

Ці опубліковані виклики повертають **одну сторінку**, а не автоматично повний результат: `Client::listWorkflows(...)` / `Client::workflowHistory(...)`. Продовжуйте з повернутим непрозорим token, зберігаючи namespace, фільтри та вибрані workflow/run; зупиняйтеся на null/порожньому token й явно обробляйте помилки сторінок. Часткова сторінка не є replay-bundle. Для офлайн-replay використовуйте API експорту історії SDK. [Опублікований клієнт PHP 3.2.0](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php) визначає поточні параметри; нові ітератори не заявляються.

## Обмежені звіти про помилки {#bounded-failure-reports}

У PHP SDK **3.5.0** з’явилися обмеження вихідних звітів про помилки. Типові межі: **62 KiB UTF-8 для повідомлення**, **128 KiB для стека**, **64 KiB для разом серіалізованих необов’язкових деталей і діагностики** та **1 MiB для всього тіла, закодованого в JSON**. До ліміту тіла входять маркери, екранування JSON, ідентичність оренди та інші команди пакета. Нижчий налаштований або заявлений транспортом ліміт має пріоритет. Тип, клас і код помилки, політика повторних спроб та ідентичність оренди зберігаються.

`withFailureReportLimit()` повертає новий клієнт із меншим лімітом усього запиту, від 1 до 1 048 576 байтів. Використовуйте повернений екземпляр. Нижчий ліміт, заявлений транспортом, також діє.

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

Видимий маркер скорочення та початкові кількості байтів позначають скорочені поля. Деталі Avro зберігаються цілими або пропускаються повністю. Якщо обов’язковий конверт неможливо подати, до надсилання HTTP виникає `DurableWorkflow\Exception\FailureReportRefused`. Локальні помилки нормалізуються до того, як код workflow їх спостерігає. Тому перше виконання й холодне відтворення бачать збережене повідомлення. Уже спостережене локальне повідомлення залишається незмінним під час остаточного підлаштування пакета до ліміту.
