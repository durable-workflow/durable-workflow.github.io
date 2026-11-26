---
sidebar_position: 3
title: Керований Cloud runtime
description: Порівняння планів Cloud, виміряної місткості workflow, оплати й доступності та підключення PHP, Python чи Rust workers до керованого простору імен.
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - namespace runtime URL
  - runtime credentials
  - workers клієнта
  - приватна мережа
  - single-region managed runtime
  - multi-region managed runtime
---

# Керований Cloud runtime {#cloud-managed-runtime}

Durable Workflow Cloud є керованим сервісом оркестрації.
Cloud обслуговує розміщену площину керування та середовище оркестрації,
включно зі станом workflow, історією, розкладами, чергами завдань, орендами
та оглядом стійкого стану. Клієнти запускають клієнти SDK і workers
для підготовленого простору імен Cloud.

Це окремий шлях від власного розгортання.
Власний Durable Workflow Server працює незалежно й ніколи не підключається до Cloud.

## Плани та ціни {#plans-and-pricing}

Оплачуйте підготовлену місткість, а не семантику workflow.
Кожен namespace отримує ізольований керований runtime.
PHP, Python та Rust workers клієнта працюють у вашому середовищі.
Перевіряйте [ціни Cloud](https://cloud.durable-workflow.com/pricing)
і панель керування щодо поточної доступності підготовки ресурсів.

Cloud Dev доступний зараз. Чотири плани високої доступності проходять перевірку
та ще не доступні для придбання чи підготовки ресурсів.
Їхні ціни, місткість, доступність та SLA нижче є запланованими умовами,
а не поточними пропозиціями придбання.

| План | Місткість runtime | Включене durable-сховище | Доступність | Ціна (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 GB RAM | 5 GB | Один host, без SLA | $0.075/год, мінімум $2 за активний місяць, максимум $50/місяць |
| Cloud Standard | 2 vCPU, 4 GB RAM | 25 GB | Запланований single-region HA, SLA 99.99% | $0.45/год, мінімум $10 за активний місяць, максимум $300/місяць |
| Cloud Multi-Region | 2 vCPU, 4 GB RAM | 25 GB | Запланований multi-region HA, SLA 99.99% | $0.525/год, мінімум $13 за активний місяць, максимум $350/місяць |
| Cloud Business | 4 vCPU, 8 GB RAM | 100 GB | Запланований single-region HA, SLA 99.99% | $0.90/год, мінімум $20 за активний місяць, максимум $600/місяць |
| Cloud Business Multi-Region | 4 vCPU, 8 GB RAM | 100 GB | Запланований multi-region HA, SLA 99.99% | $1.125/год, мінімум $28 за активний місяць, максимум $750/місяць |

Місткість охоплює компоненти керованого runtime, а не обчислення workers клієнта.
Для запланованих HA-планів реплікацію та резервну місткість включено в ціну.
Таблиця не підсумовує репліки як додаткову місткість виконання workflows.
Кожен план включає Managed Waterline, базові зашифровані резервні копії,
оновлення та сталу URL-адресу runtime.

Підготовлені runtimes оплачуються за час роботи, виміряний похвилинно
від активації до видалення ресурсів. Мінімум та максимум діють на кожне
придбання runtime в календарному місяці UTC.
Час простою підготовлених ресурсів оплачується. За місяць без підготовлених
ресурсів плати за runtime немає. Нове придбання має власні мінімум і максимум.
Керовані сервісом виправлення чи відновлення не скидають їх.
Stripe виставляє рахунок за накопичене використання щомісяця.
Ціни не включають застосовні податки.

Сховище фіксоване в межах включеного обсягу. Окремих доповнень сховища,
автоматичного збільшення чи плати за перевищення обсягу немає.
Для більшого місця [запросіть більший план runtime](https://cloud.durable-workflow.com/contact)
до досягнення межі. Сам перехід з одного регіону до кількох
не збільшує сховище. Збільшення місткості потребує справжньої зміни runtime,
а не лише оплати, і зараз узгоджується з підтримкою.
Використання мережі вимірюється, зараз не оплачується та не є необмеженим.

Виберіть план за [цінами Cloud](https://cloud.durable-workflow.com/pricing).
Для більшої місткості, іншого підключення, SSO, корпоративної підтримки
чи власної вимоги до доступності
[зверніться до нас](https://cloud.durable-workflow.com/contact).

## Межа керованого сервісу {#managed-service-boundary}

Видима клієнту межа — один Cloud namespace:

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud відповідає за provisioning namespace, роботу runtime, зберігання,
розміщення, стан runtime, recovery та Managed Waterline namespace.
Клієнти відповідають за код застосунку, реалізації workflow/activity
та процеси своїх workers. Клієнти Cloud не розгортають окремий Waterline service.

HTTPS endpoint namespace підключається безпосередньо до його керованого runtime.
Трафік SDK не проходить через website/control-plane застосунок Cloud.
Використовуйте повернений runtime URL без змін і без додавання `/api`.
SDK та CLI будують свої API paths. Адміністративні API calls використовують
`https://cloud.durable-workflow.com/api/v1`.

Адміністрування Cloud та runtime traffic використовують різні credentials:

- Cloud API key (`dwc_...`) керує projects, environments, namespaces,
  billing і життєвим циклом runtime credentials.
- Client runtime credential (`dwr_...`) починає та керує workflows
  в одному managed namespace.
- Worker runtime credential (`dwr_...`) реєструє workers, виконує long poll
  tasks, надсилає heartbeats та завершує роботу цього namespace.

Cloud API key не приймається runtime URL namespace.
Runtime credentials обмежені одним namespace і роллю, повертаються
лише під час створення та відсутні в подальших list і audit responses.

Для Cloud onboarding через CLI встановіть його за
[настановою CLI](./cli.mdx) та явно оновіть наявне standalone-встановлення
через `dw upgrade`. CLI ніколи не оновлюється у background.
Після встановлення чи upgrade виконайте `command -v dw` та `dw --version`.
Виконайте інструкції інсталятора щодо `PATH` до використання облікових даних Cloud,
щоб активним виконуваним файлом був вибраний випуск.

## Підготовка та підключення простору імен {#provision-and-connect-a-namespace}

### 1. Створіть і підготуйте простір імен {#1-create-and-provision-the-namespace}

У [Cloud dashboard](https://cloud.durable-workflow.com/) створіть
organization, project, environment і namespace та виберіть capacity plan.
Створення account чи визначення namespace не готує платну місткість.
Завершіть payment setup через Stripe, потім виберіть **Provision**
на сторінці namespace. Саме додавання картки не починає provisioning.

Provisioning асинхронний. Сторінка namespace показує progress,
поки Cloud готує runtime. Перед роботою SDK дочекайтеся активного стану.
Сторінка також надає створення runtime credentials та доступ
до Managed Waterline для огляду workflows і їхньої історії.

Для API-driven setup спочатку завершіть payment setup.
Приклад використовує стандартний план organization.
`capacity_plan_version` може вибрати інший доступний план.
Не передавайте власний Server URL, deployment identifier чи placement record:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

Після provisioning відповідь namespace надає сталий `runtime_url`,
`runtime_namespace`, managed status та видиму клієнту інформацію про region.
Повернені URL і namespace є конфігурацією Cloud.
Не виводьте endpoint самостійно й не замінюйте його адресою власного Server.

### 2. Видайте окремі облікові дані клієнта й worker {#2-issue-separate-client-and-worker-credentials}

Видайте обидві runtime roles незалежно:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

Кожен токен показується один раз у create response.
Зберігайте його в secret store, доступному лише відповідній ролі.
Навмисно спільний client/worker process отримує обидва значення
як два окремі secrets. Ротуйте й відкликайте ролі незалежно.
Ніколи не замінюйте runtime credential на Cloud API key.

### 3. Перший workflow у Cloud {#cloud-first-workflow}

Спільний external-runtime playground Sample App виконує той самий
написаний workflow/activity сценарій із PHP, Python чи Rust.
Відкрийте [Sample App Codespace](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
експортуйте підготовлені значення namespace і два runtime credentials
та виберіть task queue застосунку:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Потім виберіть офіційний SDK і запустіть той самий managed-runtime контракт:

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

Runner визначає поточні стабільні версії артефактів, передає кожен credential
лише відповідному дочірньому процесу, чекає до 60 секунд реєстрації worker
з точною чергою та згенерованими типами workflow/activity,
після чого починає один client request.
Успіх потребує очікуваного результату SDK, статусу `completed` від `dw`
та потрібної історії workflow/activity. У managed mode команда
не запускає локальний Server чи Waterline.

Для кожної мови повторіть повну managed-команду вище, змінюючи лише
`language`. Для написання workflow конкретного SDK продовжуйте його настановою:

- [PHP SDK](/docs/polyglot/php/): задайте `language=php`.
- [Python SDK](/docs/polyglot/python/): задайте `language=python`.
- [Rust managed-runtime quickstart](/docs/polyglot/rust-cloud-quickstart/):
  задайте `language=rust` і використовуйте його діагностику
  готовності worker, завершеного результату та невідповідностей.

Спільний client/worker сценарій зберігає обидва runtime credentials
як окремі secrets. Cloud administration key не є runtime credential
і не може експортуватися в жодній змінній runtime token.

### 4. Подальша керована робота {#4-continue-with-managed-operation}

SDK client починає workflows і надсилає наступні команди через runtime URL
namespace. Workers клієнта реєструються та виконують long poll через той самий
URL із роллю worker. Cloud автентифікує та обмежує кожен запит,
виконує orchestration protocol у managed runtime
та зберігає стан workflow й історію.

Застосунок клієнта не вибирає runtime deployment для операції.
Workflow IDs, run IDs, task queues, compatibility markers і кодування Avro
залишаються durable-контрактами застосунку всередині Cloud namespace.

## Підключення workers клієнта {#customer-run-worker-connectivity}

Workers можуть працювати у вашій мережі, VM fleet, контейнерній платформі
чи середовищі застосунку. Їм потрібний вихідний HTTPS-доступ до runtime URL
namespace та дозвіл довготривалих poll requests worker-протоколу.

- Вхідне підключення від Cloud до worker не потрібне.
- Proxies та egress gateways не мають скорочувати long polls до busy retry loop.
- Workers мають повторювати тимчасові connection failures та service-unavailable
  responses з обмеженим backoff.
- Переміщення worker process не переміщує стан workflow.
  Cloud зберігає durable-стан namespace та історію.
- Ротація credentials не потребує зміни runtime URL, namespace чи task queue.

## Розміщення в регіонах і межа відновлення {#region-placement-and-recovery-boundary}

Cloud Dev доступний із межею recovery нижче.
HA-межі описують заплановані плани, які залишаються
недоступними до завершення qualification:

- **Cloud Dev:** один ізольований host із постійним станом і backups.
  Maintenance і recovery можуть переривати сервіс.
  Uptime SLA та автоматичного regional failover немає.
- **Запланований single-region HA:** три репліковані hosts в одному регіоні
  з автоматичним primary failover. Один host може відмовити
  без втрати решти quorum. Відмова цілого регіону не покривається SLA цього плану.
- **Запланований multi-region HA:** три репліковані hosts у трьох регіонах
  з автоматичним primary failover. SLA включає втрату чи ізоляцію одного
  налаштованого регіону за можливості решти members сформувати quorum.

Для запланованих HA-профілів сталий runtime URL має стежити за elected primary.
SDK-конфігурацію не потрібно змінювати під час підтримуваного failover.
Ізольований колишній primary не може продовжувати authoritative-роботу.
Якщо безпечний primary неможливо визначити, runtime припиняє обслуговування
замість приймання суперечливих записів. HA не обіцяє безперервних запитів:
клієнти та workers усе одно потребують bounded retries тимчасових помилок.

Сторінка namespace показує топологію, інформацію про region та service status.
Backups підтримують recovery, але не замінюють live replication.
Короткі failover-тести демонструють виконані випадки відмов,
а не універсальну гарантію recovery time чи місяць досягнутої availability.

### Вимірювання SLA та зарахування коштів {#sla-measurement-and-credits}

Чотири заплановані SLA-плани визначають uptime SLA 99.99%
за календарний місяць UTC, виміряний на runtime endpoint клієнта
в однохвилинних вікнах. Відсутні вимірювання рахуються як недоступність.
Планове обслуговування не виключається. Доступність workers клієнта
відокремлена від доступності керованого runtime.

| Місячна доступність | Автоматичне зарахування на рахунок |
| --- | ---: |
| Щонайменше 99.99% | Немає |
| Щонайменше 99.9%, нижче 99.99% | 10% |
| Щонайменше 99.0%, нижче 99.9% | 25% |
| Нижче 99.0% | 100% |

Плани з SLA автоматично отримують сервісні зарахування на рахунок. Їхня сума
ніколи не перевищує оплату за відповідне середовище виконання в цьому місяці;
за перебої в роботі кошти готівкою не повертаються. Cloud Dev не має зарахувань за SLA.
Межі доступності та умови оплати наведено в
[умовах Cloud](https://cloud.durable-workflow.com/terms) і
[цінах Cloud](https://cloud.durable-workflow.com/pricing).

## Приватне підключення та межа підтримки {#private-connectivity-and-support-boundary}

Самостійний контракт Cloud 2.0 передбачає вихідний доступ clients
і workers до публічного runtime URL namespace. Private-only ingress,
окремі VPN чи peering та private routing конкретного provider
є connectivity-дизайном із підтримкою, а не прихованими стандартними
налаштуваннями. Клієнтам не надають внутрішні runtime addresses
і не пропонують обхід namespace URL.

## Cloud або власний Server {#cloud-or-self-hosted-server}

Виберіть Cloud, коли Durable Workflow має оперувати orchestration runtime,
зберіганням, availability вибраного плану, recovery та Managed Waterline,
а ваша команда — SDK clients і workers.

Виберіть [власний Server](/docs/polyglot/server), коли ваша команда
має незалежно оперувати image Server, базою, cache, мережею,
автентифікацією, backups і failover. Власний Server не можна
зареєструвати, підключити чи використати як backing runtime
Cloud namespace. Embedded Laravel, власний Server та Cloud
є окремими виборами розгортання.

## Вимірювання стандартного workflow {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity)
визначає невелике відтворюване навантаження: один запуск workflow,
одну external activity та один completion workflow з визначеними
Avro inputs і results по 1 KiB. Worker клієнта працює поза
виділеною місткістю managed runtime.

Cloud Dev виміряно 19 листопада 2026 року на native Server 3.15.0 runtime,
який Cloud готує для нових Dev runtimes. Інші чотири baselines є історичними:
вони включають replicated HA topology, але передують поточному runtime release.
Їх не екстрапольовано з Dev, і вони не підтверджують
місткість поточних SLA-планів.

| План | Стандартних workflows/секунду | Workflow actions за 30 днів | Вимірювання |
| --- | ---: | ---: | --- |
| Cloud Dev | 1.5 | 7,776,000 | 19 листопада 2026 року, деталі нижче |
| Cloud Standard | 0.25 | 1,296,000 | Історичне, очікується повторне вимірювання |
| Cloud Multi-Region | 0.10 | 518,400 | Історичне, очікується повторне вимірювання |
| Cloud Business | 0.50 | 2,592,000 | Історичне, очікується повторне вимірювання |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Історичне, очікується повторне вимірювання |

Оцінка за 30 днів дорівнює
`workflows/second x 2,592,000 seconds x 2 workflow actions`:
один start та одна activity у цьому порівнянні. Для Cloud Dev це
1.5 x 2,592,000 x 2 = 7,776,000.
Вона припускає безперервну роботу з цією швидкістю протягом 30 днів.
Це не включена квота actions, billing unit чи точне зіставлення
з визначеннями actions іншого рушія.

Це виміряні baselines навантаження, а не максимальний throughput
чи гарантована місткість кожного застосунку. Більші payload, більше activities,
timers, signals, queries, історія з великим replay, міжрегіональна
комунікація та latency workers клієнта змінюють результат.
Таблиця не заявляє окремих benchmarks timer, signal, replay чи saturation.
Плануйте фактичну суміш workflow замість множення цих чисел
на довільний розмір workflow.

### Вимірювання Cloud Dev {#cloud-dev-capacity}

Cloud Dev є ізольованим single-host managed runtime для розробки
та оцінювання. Вимірювання використовувало звичайно підготовлений
Dev runtime без змін CPU, memory, storage, network, ingress чи backup:

| Ресурс | Cloud Dev |
| --- | --- |
| Обчислення runtime | 1 shared vCPU, 1 GB RAM |
| Включене durable-сховище | 5 GB |
| Сервіси runtime | Native Server, MySQL, Redis та ingress connector |
| Managed Waterline | Включений через автентифікований Cloud-застосунок, не є процесом на Dev host |
| Мережевий шлях | Прямий HTTPS ingress конкретного space |
| Вихідний трафік runtime | Обмежений (traffic shaping) до 4 Mbit/s |
| Workers клієнта | Працюють у середовищі клієнта |
| Доступність | Без SLA, перерви на обслуговування дозволені |
| Поточна ціна runtime | Дивіться [плани та ціни](#plans-and-pricing) |
| Більше storage | Запросіть більший runtime plan, storage add-ons немає |

Запуск використав публічне
[PHP-визначення DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/f16f9b7337d3d64b1ba6458ab61ba2d7ed7f334f/benchmarks/capacity/v1/bindings/php/capacity_adapter.php):
один workflow start, одну зовнішню echo activity та один completion
із рядком 1,024 bytes в Avro на кожній межі workflow/activity input і result.
Runtime був тим Server release, який Cloud готує для нових Dev runtimes:
native Server 3.15.0 з MySQL 8.0.46 і Redis 7.4.11. Його `/api/cluster/info`
повідомив implementation `rust`, version 3.15.0 та worker protocol 1.20.
Зовнішні workers та clients використовували опублікований PHP SDK 3.22.0
на PHP 8.4.27, встановлений у цей binding замість закріпленого в ньому SDK 2.0.10.
Вони працювали поза runtime host і підключалися через його звичайний HTTPS ingress.

Навантаження подавалося кроками 0.25, 0.5, 1, 1.5 і 2 workflows/секунду,
а граничні кроки було повторено. Кожен крок мав окремий 30-секундний warmup,
після якого йшло фіксоване п'ятихвилинне вікно. Throughput рахує лише
completions, спостережені у вікні. Пізніший drain не збільшує повідомлену швидкість.

- Workers: чотири PHP workers до 1 workflow/секунду, шість при 1.5 та чотири,
  шість або вісім при 2. Кожен використовував task-poll timeout в одну секунду.
- Clients: `max(2, 8 x rate)` незалежних client slots подавали starts
  за фіксованим розкладом. Start, що запізнився більше ніж на одну секунду,
  вважається пропущеним start slot.
- Результати: clients опитували result кожного workflow раз на секунду. Native
  Server ще не підтримує long polling історії (`wait_new_event`,
  [server#1257](https://github.com/durable-workflow/server/issues/1257)).
- Перевірки: кожен result, completed status та впорядковану історію
  workflow/activity перевірено.
- Крок проходить, якщо немає помилок і пропущених start slots у вікні, кожен
  workflow перевірено, backlog не зростає і немає OOM kill чи restart.
  Опублікована швидкість — найвищий пройдений крок із host CPU не вище
  приблизно 80%.
- Host CPU знімався з `/proc/stat` кожні п'ять секунд. Memory контейнера —
  це cgroup working set.

| Подана швидкість (workers) | Вікно, 19 листопада (UTC) | Запущено / подано | Завершено у вікні | Пропущено / помилки | p50 / p95 / p99 (s) | Незавершені на кінець вікна | Host CPU середнє / пік | Результат |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0.25/s (4) | 22:56-23:01 | 75 / 75 | 75 | 0 / 0 | 1.24 / 1.30 / 1.42 | 0 | 29.3% / 35.2% | пройдено |
| 0.5/s (4) | 23:02-23:07 | 150 / 150 | 151 | 0 / 0 | 1.25 / 1.41 / 2.61 | 0 | 38.2% / 45.5% | пройдено |
| 1/s (4) | 23:08-23:13 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.57 / 1.65 | 1 | 58.8% / 64.2% | пройдено |
| 1/s (4), повтор | 23:36-23:41 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.56 / 1.64 | 1 | 48.5% / 61.6% | пройдено |
| 1.5/s (6) | 23:29-23:34 | 450 / 450 | 446 | 0 / 0 | 1.78 / 3.98 / 5.10 | 6 | 54.0% / 60.9% | пройдено |
| 1.5/s (6), повтор | 23:43-23:48 | 450 / 450 | 446 | 0 / 0 | 1.77 / 3.71 / 4.83 | 6 | 55.8% / 61.8% | пройдено |
| 2/s (4) | 23:15-23:20 | 522 / 600 | 520 | 78 / 0 | 6.49 / 9.87 / 10.58 | 16 | 50.4% / 65.5% | не пройдено: пропущені starts |
| 2/s (8) | 23:22-23:27 | 455 / 600 | 452 | 145 / 0 | 7.92 / 11.66 / 12.86 | 14 | 43.0% / 50.1% | не пройдено: пропущені starts |
| 2/s (6) | 23:49-23:54 | 496 / 600 | 487 | 104 / 1 | 6.97 / 10.43 / 11.04 | 15 | 48.6% / 56.4% | не пройдено: пропущені starts, 1 невдалий workflow |

| Виміряний результат при 1.5 workflows/секунду | Значення |
| --- | ---: |
| Подана швидкість | 1.5 стандартних workflows/секунду |
| Вікно вимірювання | 23:29:52-23:34:52 UTC |
| Завершені в межах вікна | 446 (1.49/секунду) |
| Завершені після drain | 450 із 450 запущених |
| Помилки / пропущені start slots | 0 / 0 |
| Start-to-result latency, p50 | 1.78 секунди |
| Start-to-result latency, p95 | 3.98 секунди |
| Start-to-result latency, p99 | 5.10 секунди |
| Незавершені workflows виміряної групи на кінець вікна | 6 |
| Host CPU, середнє / пік | 54.0% / 60.9% |
| Workflow actions за 30 днів | 7,776,000 |

Шість незавершених workflows було запущено в останні секунди вікна,
і вони завершилися в межах звичайного діапазону latency; їх не враховано.
Протягом вікна одночасно було відкрито не більше дев'яти workflows,
а медіанна latency в останню хвилину (1.87 секунди) лишалася близькою
до першої хвилини (1.76 секунди), тож backlog не зростав. Повторний крок 1.5
пройшов із тим самим throughput, p99 4.83 секунди та host CPU
у середньому 55.8%.

Latency включає мережу клієнта (приблизно 85-170 ms на HTTPS round trip
від вимірювального host) та polling результату раз на секунду, тож медіана
не може опуститися значно нижче однієї секунди. Це не внутрішня latency
планування task, і її не слід порівнювати з внутрішньою scheduling-метрикою рушія.

**OOM kills чи restarts контейнерів не було** у жодному кроці. При 1.5
workflows/секунду спостережені піки memory containers (working set):
17.16 MiB native Server, 244.35 MiB MySQL, 6.29 MiB Redis
та 30.16 MiB ingress connector. Ці окремі піки не є одночасним RSS
усього host. OS та інші host processes також споживають memory.
Host мав звичайну конфігурацію swap 1 GiB, із зайнятими приблизно
до 50 MiB. Початковий зашифрований backup було створено й перевірено
до першого вікна, і жоден інший backup capture із запуском не перетинався.

Крок 2 workflows/секунду не пройшов. Три спроби, з чотирма, вісьмома
та шістьма workers, пропустили 78, 145 і 104 із 600 start slots,
із p99 latency від 10.6 до 12.9 секунди. Host CPU не був обмеженням:
у цих спробах він у середньому становив 43-50%. Обмеженням був traffic shaping
вихідного трафіку runtime. Цей метод генерував приблизно 400 KB вихідного
трафіку runtime на workflow (polling результатів, відповіді workers на tasks
і transport overhead): 3.35 Mbit/s при 1 workflow/секунду та повні 4.0 Mbit/s
при 1.5 і 2. Більше workers не допомогло, бо їхній polling додає трафік.
У спробі з шістьма workers один workflow завершився невдачею після того,
як його activity втратила task lease, коли вихідний трафік був насичений.
Кожен інший workflow у кожному кроці завершився з очікуваною історією,
без помилок, OOM kills чи restarts. Тому виміряна Dev baseline становить
1.5 стандартних workflows/секунду; вищі швидкості не заявляються.

Це замінює Dev baseline від 18 листопада 2026 року, що становила
0.25 workflows/секунду. Той запуск вимірював PHP Server 2.9.12 runtime,
який тоді готував Dev, з одним worker і polling результатів кожні 100 ms,
і обмеженням був його єдиний vCPU.

Це був свіжий runtime, виміряний протягом приблизно години, а не довготривалий soak.
Maintenance scans у Server 3.15.0 читають кожен збережений run, тож робота
бази даних зростає разом зі збереженою історією; Server 3.16.0 обмежує ці scans
відкритою роботою
([server#1256](https://github.com/durable-workflow/server/issues/1256)).
Cloud Dev буде повторно виміряно на Server 3.16.0, зокрема довшим запуском
зі збереженою історією. Це виміряна development baseline, а не універсальний
перерахунок кожного workflow, maximum-throughput тест чи SLA.
Більші payload, додаткові activities, timers, signals, queries,
історія з великим replay та latency workers клієнта змінюють capacity.
Cloud billing базується на provisioned runtime time з фіксованим
включеним storage, а не на workflow operations.

## API використання для оплати {#billing-usage-api}

Cloud Dev використовує одну ізольовану single-host runtime cell
для кожного підготовленого Dev space. Billing terms:

| Умова оплати | Cloud Dev |
| --- | ---: |
| Provisioned runtime | $0.075 за годину, вимірювання похвилинно |
| Максимум календарного місяця | $50 на придбання runtime |
| Мінімум активного місяця | $2 на придбання runtime в активному місяці UTC |
| Керована місткість | 1 vCPU, 1 GB memory, 5 GB durable storage |
| Додаткове durable-сховище | Не продається окремо, запросіть більший runtime plan |
| Базові зашифровані backups | Включено |
| Доступність | Один host, без SLA |

Виділена місткість охоплює Server, MySQL, Redis, scheduling, доступ Waterline,
backups, upgrades та інфраструктуру Cloud. PHP, Python і Rust workers
клієнта працюють поза нею. Workflow starts, activity attempts, retries,
timers, signals, queries, updates та child workflows є операційною
телеметрією, а не окремими billing units.
Ціни не включають застосовні податки. Включений storage не створює окремої плати.

Cloud надає billing usage у межах organization для finance, operations
та chargeback automation. Endpoint автентифікується Cloud API key
і не приймає customer чи organization ID у запиті.
Organization ініціатора визначається bearer token `dwc_`,
щоб один клієнт не міг читати usage іншого.

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` і `period_end` є необов'язковими ISO-8601 dates.
Без них Cloud повертає поточний календарний місяць.
Читання та exports billing usage залишаються доступними, навіть якщо
billing restrictions призупинили provisioning namespace чи workflow operations,
щоб finance teams могли відновити стан account.

Schema відповіді — `durable_workflow.cloud.namespace_capacity_usage.v1`.
Вона розділяє allocated capacity time та semantic event counters.
Storage-related поля залишаються для історичного billing
і не дозволяють придбання add-on. Скорочена відповідь Cloud Dev
нижче показує поточні plan terms.

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

Time meter Cloud Dev починається під час activation ізольованого runtime
та зупиняється під час deprovisioning. Місячні максимум і мінімум
діють на придбання runtime в календарних місяцях UTC.
Storage не зростає та не починає оплачуватися автоматично.
Cloud зберігає operating та recovery reserve на runtime disk.
Запросіть більший runtime plan до досягнення включеного обсягу.

Idle runtimes усе одно оплачують capacity. Deprovisioning припиняє
capacity billing і видаляє активні runtime data та credentials.
Це не pause/resume операція. Заплановані SLA terms використовують
ту саму provisioned-time модель із власними rates, мінімумами й максимумами.
Для читання usage використовуйте повернені `billing_terms` плану.
Історичні invoices зберігають прийняті ними terms.

До видалення середовища виконайте [процедуру переходу](/docs/polyglot/runtime-migration/#preserve-evidence): збережіть перевірені докази історії та payload і підтвердьте термінальний стан усіх запусків джерела. Плата за потужність триває, поки джерело виділене.

Експортуйте ті самі дані у CSV чи JSON report для передачі файлу
до downstream finance system:

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

Для JSON-backed dashboard panel запитайте той самий API
з часовим діапазоном panel:

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

Потім перетворіть namespace capacity rows на плоску структуру:

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

Використовуйте `invoice_units` для звірки capacity та storage.
`operational_telemetry` пояснює структуру навантаження і поведінку benchmarks.
Не перетворюйте ці event counters на оплату.

## Пов'язані довідники {#related-references}

- [Режими розгортання](/docs/polyglot/deployment-modes)
- [PHP SDK](/docs/polyglot/php)
- [Python SDK](/docs/polyglot/python)
- [Rust SDK](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [Самостійне розгортання](/docs/deployment)
- [Підтримка](/docs/support)
