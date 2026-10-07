---
sidebar_position: 3
title: Керований Cloud runtime
description: Порівняння планів Cloud, виміряної місткості workflow, billing і availability та підключення PHP, Python чи Rust workers до керованого namespace.
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

Durable Workflow Cloud є керованим сервісом orchestration.
Cloud оперує hosted-площиною керування та orchestration runtime,
включно зі станом workflow, історією, schedules, task queues, leases
та durable-оглядом стану. Клієнти запускають SDK clients і workers
для підготовленого Cloud namespace.

Це окремий шлях від власного розгортання.
Власний Durable Workflow Server працює незалежно й ніколи не підключається до Cloud.

## Плани та ціни {#plans-and-pricing}

Оплачуйте підготовлену місткість, а не семантику workflow.
Кожен namespace отримує ізольований керований runtime.
PHP, Python та Rust workers клієнта працюють у вашому середовищі.
Перевіряйте [ціни Cloud](https://cloud.durable-workflow.com/pricing)
і dashboard щодо поточної доступності provisioning.

Cloud Dev доступний зараз. Чотири HA-плани перебувають у qualification
та ще не доступні для придбання чи provisioning.
Їхні ціни, місткість, availability та SLA нижче є запланованими умовами,
а не поточними пропозиціями придбання.

| План | Місткість runtime | Включене durable-сховище | Доступність | Ціна (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 GB RAM | 5 GB | Один host, без SLA | $0.075/год, мінімум $2 за активний місяць, максимум $50/місяць |
| Cloud Standard | 1 vCPU, 2 GB RAM | 25 GB | Запланований single-region HA, SLA 99.99% | $0.45/год, мінімум $10 за активний місяць, максимум $300/місяць |
| Cloud Multi-Region | 1 vCPU, 2 GB RAM | 25 GB | Запланований multi-region HA, SLA 99.99% | $0.60/год, мінімум $15 за активний місяць, максимум $400/місяць |
| Cloud Business | 4 vCPU, 8 GB RAM | 100 GB | Запланований single-region HA, SLA 99.99% | $2.25/год, мінімум $50 за активний місяць, максимум $1,500/місяць |
| Cloud Business Multi-Region | 4 vCPU, 8 GB RAM | 100 GB | Запланований multi-region HA, SLA 99.99% | $3.00/год, мінімум $75 за активний місяць, максимум $2,000/місяць |

Місткість охоплює компоненти керованого runtime, а не обчислення workers клієнта.
Для запланованих HA-планів replication і standby capacity включено в ціну.
Таблиця не підсумовує replicas як додаткову місткість виконання workflows.
Кожен план включає Managed Waterline, базові зашифровані backups,
upgrades та сталий runtime URL.

Підготовлені runtimes оплачуються за runtime time, виміряний похвилинно
від activation до deprovisioning. Мінімум та максимум діють на кожне
придбання runtime в календарному місяці UTC.
Idle provisioned time оплачується. За місяць без provisioned time плати
за runtime немає. Нове придбання має власні мінімум і максимум.
Керовані сервісом repair чи recovery не скидають їх.
Stripe виставляє рахунок за накопичене використання щомісяця.
Ціни не включають застосовні податки.

Storage фіксований у межах включеного обсягу. Окремих storage add-ons,
автоматичного збільшення чи плати за перевищення storage немає.
Для більшого місця [запросіть більший runtime plan](https://cloud.durable-workflow.com/contact)
до досягнення межі. Сам перехід із single-region до multi-region
не збільшує storage. Capacity upgrade потребує справжньої зміни runtime,
а не лише billing, і зараз узгоджується з підтримкою.
Використання мережі вимірюється, зараз не оплачується та не є необмеженим.

Виберіть план за [цінами Cloud](https://cloud.durable-workflow.com/pricing).
Для більшої місткості, іншого connectivity, SSO, enterprise support
чи власної вимоги availability
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
Виконайте PATH-інструкції installer до використання credentials Cloud,
щоб активним binary був вибраний випуск.

## Provisioning та підключення namespace {#provision-and-connect-a-namespace}

### 1. Створення та provisioning namespace {#1-create-and-provision-the-namespace}

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

### 2. Окремі client і worker credentials {#2-issue-separate-client-and-worker-credentials}

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

Для написання workflow конкретного SDK продовжуйте мовною настановою:

- [PHP SDK](/docs/polyglot/php/): виконайте `scripts/playground php`.
- [Python SDK](/docs/polyglot/python/): виконайте `scripts/playground python`.
- [Rust managed-runtime quickstart](/docs/polyglot/rust-cloud-quickstart/):
  виконайте `scripts/playground rust` і використовуйте його діагностику
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

## Розміщення в регіоні та межа recovery {#region-placement-and-recovery-boundary}

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

### Вимірювання SLA та credits {#sla-measurement-and-credits}

Чотири заплановані SLA-плани визначають uptime SLA 99.99%
за календарний місяць UTC, виміряний на runtime endpoint клієнта
в однохвилинних вікнах. Відсутні вимірювання рахуються як недоступність.
Planned maintenance не виключається. Availability workers клієнта
відокремлена від availability managed runtime.

| Місячна availability | Автоматичний account credit |
| --- | ---: |
| Щонайменше 99.99% | Немає |
| Щонайменше 99.9%, нижче 99.99% | 10% |
| Щонайменше 99.0%, нижче 99.9% | 25% |
| Нижче 99.0% | 100% |

Account credits застосовуються автоматично.
Cash refunds потребують перевірки та схвалення.
Cloud Dev не має SLA credits.
Область availability та billing terms плану наведено в
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

## Benchmarks стандартного workflow {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity)
визначає невелике відтворюване навантаження: один запуск workflow,
одну external activity та один completion workflow з визначеними
Avro inputs і results по 1 KiB. Worker клієнта працює поза
виділеною місткістю managed runtime.

Cloud Dev виміряно 21 вересня 2026 року на тому самому плані,
який готують клієнти. Інші чотири baselines є історичними:
вони включають replicated HA topology, але передують поточному runtime release.
Їх не екстрапольовано з Dev, і вони не підтверджують
місткість поточних SLA-планів.

| План | Стандартних workflows/секунду | Workflow actions за 30 днів | Вимірювання |
| --- | ---: | ---: | --- |
| Cloud Dev | 0.25 | 1,296,000 | 21 вересня 2026 року, деталі нижче |
| Cloud Standard | 0.25 | 1,296,000 | Історичне, очікується повторне вимірювання |
| Cloud Multi-Region | 0.10 | 518,400 | Історичне, очікується повторне вимірювання |
| Cloud Business | 0.50 | 2,592,000 | Історичне, очікується повторне вимірювання |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Історичне, очікується повторне вимірювання |

Оцінка за 30 днів дорівнює
`workflows/second x 2,592,000 seconds x 2 workflow actions`:
один start та одна activity у цьому порівнянні.
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
Dev runtime без змін CPU, memory, storage, ingress чи backup:

| Ресурс | Cloud Dev |
| --- | --- |
| Обчислення runtime | 1 shared vCPU, 1 GB RAM |
| Включене durable-сховище | 5 GB |
| Сервіси runtime | Server, queue worker, scheduler, MySQL і Redis |
| Managed Waterline | Включений через автентифікований Cloud-застосунок, не є процесом на Dev host |
| Мережевий шлях | Прямий HTTPS ingress конкретного space |
| Workers клієнта | Працюють у середовищі клієнта |
| Доступність | Без SLA, перерви на обслуговування дозволені |
| Поточна ціна runtime | Дивіться [плани та ціни](#plans-and-pricing) |
| Більше storage | Запросіть більший runtime plan, storage add-ons немає |

Запуск використав публічне
[PHP-визначення DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/68168f34b637a19c054211f4db2df9c616799a86/benchmarks/capacity/v1/bindings/php/capacity_adapter.php):
один workflow start, одну зовнішню echo activity та один completion
із рядком 1,024 bytes в Avro на кожній межі workflow/activity input і result.
Server 2.3.12 містив Workflow 2.0.14. Зовнішній worker та clients
використовували PHP SDK 2.0.11 на PHP 8.4.25.
Runtime використовував PHP 8.3.33 і MySQL 8.0.46.

Один PHP worker використовував task-poll timeout в одну секунду.
Два незалежні client slots подавали один workflow кожні чотири секунди
після окремого 30-секундного warmup. Фіксоване вікно вимірювання —
**18:50:30–18:55:30 UTC 21 вересня 2026 року**.
Throughput рахує лише completions, спостережені в ці п'ять хвилин.
Пізніший drain не збільшує повідомлену швидкість.
Кожен result, completed status та впорядкована історія workflow/activity перевірені.

| Виміряний результат | Значення |
| --- | ---: |
| Подана та завершена швидкість | 0.25 стандартних workflows/секунду |
| Завершені workflows | 75 із 75 |
| Помилки / пропущені start slots | 0 / 0 |
| Start-to-result latency, p50 | 2.76 секунди |
| Start-to-result latency, p95 | 4.18 секунди |
| Start-to-result latency, p99 | 4.33 секунди |
| Незавершені workflows виміряної групи | 0 |
| Workflow actions за 30 днів | 1,296,000 |

Latency включає мережу клієнта та polling результату кожні 100 ms.
Це не внутрішня latency планування task, і її не слід порівнювати
з внутрішньою scheduling-метрикою рушія.

Host CPU у середньому був **63.5% busy**, із піком **89%** у п'ятисекундних
samples. **OOM kills чи restarts контейнерів не було**.
Спостережені піки memory containers: 95.21 MiB Server, 197.1 MiB MySQL,
45.84 MiB queue worker, 43.75 MiB scheduler, 9.49 MiB Redis
та 34.59 MiB ingress connector. Ці окремі піки не є одночасним RSS
усього host. OS та інші host processes також споживають memory.
Host мав звичайну конфігурацію swap 1 GiB, із зайнятими приблизно
до 90 MiB під час вимірювання. Початковий зашифрований backup
було перевірено до вікна. Жоден backup capture з ним не перетинався.

Це виміряна development baseline, а не універсальний перерахунок
кожного workflow, maximum-throughput тест, довготривалий soak чи SLA.
Більші payload, додаткові activities, timers, signals, queries,
історія з великим replay та latency workers клієнта змінюють capacity.
Cloud billing базується на provisioned runtime time з фіксованим
включеним storage, а не на workflow operations.

## API billing usage {#billing-usage-api}

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
