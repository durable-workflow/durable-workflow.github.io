---
sidebar_position: 4
title: Довідник команд CLI
description: Команди Durable Workflow CLI, стабільні формати виводу, спільні параметри й поведінка при помилках.
tags:
  - CLI
  - reference
  - control-plane
  - automation
keywords:
  - довідник команд dw
  - вивід CLI
  - bridge webhook
  - команда workflow
---

# Довідник команд CLI {#cli-command-reference}

Ця сторінка описує команди `dw` v2 як контракт для операторів та автоматизації.
Встановлення й налаштування профілів описані в [посібнику CLI](/docs/polyglot/cli).
Цей довідник допоможе підключити скрипти, завдання CI, інструкції операцій чи AI
агентів до точних форм команд.

Усі команди, що працюють із сервером, використовують протокол площини керування
самостійного Server версії `2`. CLI перевіряє опубліковані сервером маніфести
протоколів, перш ніж довіряти канонічним полям запитів і відповідей.

## Глобальні параметри {#global-options}

Команди для сервера приймають ці параметри, якщо не зазначено іншого.

| Параметр | Значення |
| --- | --- |
| `--server`, `-s` | Базовий URL Server. Перевизначає профілі й змінні середовища для цього виклику. |
| `--namespace` | Цільовий namespace. Перевизначає namespace профілю. |
| `--token` | Bearer token для цього виклику. Для збереженої автоматизації краще використовувати профілі з `--token-env`. |
| `--env` | Іменований профіль середовища CLI. Невідоме ім'я спричиняє помилку без резервного вибору. |
| `--output=table|json|jsonl` | Контракт виводу: `table` для людини, `json` як один JSON документ, `jsonl` як один JSON об'єкт на рядок для списків. |
| `--json` | Локальний псевдонім JSON виводу в командах, що його надають. |

Команди з даними від користувача використовують спільний контракт вводу:

| Параметр | Значення |
| --- | --- |
| `--input`, `-i` | Документ вводу безпосередньо в параметрі. |
| `--input-file` | Читати ввід із файлу або зі stdin через `-`. Несумісний із `--input`. |
| `--input-encoding=json|raw|base64` | Декодувати ввід як JSON, передати сирий текст одним аргументом або декодувати base64 одним аргументом. Типово `json`. |

Ввід JSON для запуску workflow, signal, query, update, schedule та завершення
activity є позиційним масивом аргументів v2. Ввід raw і base64 стає одним
позиційним аргументом, тому сервер завжди отримує канонічний масив `input`.

## З'єднання та діагностика {#connection-and-diagnostics}

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw --version` | Показати ідентичність збірки CLI. Якщо `DW_ENV` чи `DURABLE_WORKFLOW_SERVER_URL` вибирає ціль, також виконати коротку перевірку сумісності. | | `-V`, `--version` |
| `dw server:health` | Перевірити стан Server і доступність автентифікації. | | глобальні параметри, `--json` |
| `dw server:info` | Показати версію Server, маніфест топології ролей, маніфести протоколів, контракт запиту, протокол worker, факти про парк worker і метадані сумісності. | | глобальні параметри, `--json` |
| `dw doctor` | Пояснити визначений стан профілю, Server, token і TLS, попередження віддаленої сумісності та наступні дії. | | глобальні параметри, `--json` |
| `dw debug workflow <workflow-id>` | Зібрати діагностику застряглого виконання: стан, очікувані завдання, відомості про чергу, помилки й метадані сумісності. | | `--run-id`, глобальні параметри, `--json` |
| `dw server:start-dev` | Запустити локальний сервер розробки для коротких перевірок. | | `--port`, `--db=sqlite|mysql|pgsql` |
| `dw watch workflow <workflow-id>` | Опитувати workflow до термінального стану чи заданої межі опитувань. | | `--run-id`, `--interval`, `--max-polls`, глобальні параметри |
| `dw upgrade` | Замінити поточний самостійний бінарний файл `dw` новішим чи зафіксованим релізом. Відмовляється змінювати Composer vendor, Homebrew cellar і PHAR. | | `--tag`, `--dry-run`, `--force`, `--output=table|json` |

Використовуйте `server:info` для перевірки форми контракту, `doctor` для пояснення
проблем зв'язку CLI із сервером, а `debug workflow` для отримання
машиночитаного знімка виконання для підтримки.

### Інформація про Server і топологію ролей {#server-info-and-role-topology}

`dw server:info` надає CLI доступ до `GET /api/cluster/info`. Табличний режим
містить розділ `Topology:`, який узагальнює контракт топології ролей,
опублікований сервером для вузла, що відповідає:

- `Supported Shapes` і `Current Shape` визначають дозволені форми розгортання
  та форму, яку зараз обслуговує цей вузол.
- `Current Process Class` і `Current Roles` називають клас процесу та набір ролей вузла.
- `Matching Role`, `Matching Partitions` і `Matching Backpressure` показують
  форму ролі matching, володіння пробудженням, режим доставлення завдань та
  примітиви партицій, що визначають отримання готової роботи.
- `Matching Discovery Limits` узагальнює зафіксований числовий контракт ролі
  matching: `poll_batch_cap`, `availability_ceiling_seconds`,
  `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` і
  `activity_task_lease_seconds`. Оператори можуть перевірити відповідність
  розгортання контракту без пошуку у вихідному коді пакета.
- `Current Write Boundaries` перелічує поверхні надійного запису, якими володіють ролі вузла.
- `Scaling Boundaries` і `Failure Domains` пояснюють джерела навантаження
  та перші ознаки збоїв для кожної ролі.

Використовуйте `--output=json`, якщо скрипту потрібен сам маніфест.
`topology.schema` і `topology.version` фіксують його ревізію для виявлення
зміни форми, а `topology.execution_mode` показує режим доставлення вузла.
Стабільні машинні поля містяться в `topology`: `supported_shapes`,
`current_shape`, `current_process_class`, `current_roles`, `matching_role`,
`role_catalog`, `authority_boundaries`, `authority_surfaces`,
`supported_topologies`, `scaling_boundaries` і `failure_domains`.
Блок `topology.matching_role` також публікує `partition_primitives` і
`backpressure_model`, щоб скрипти перевіряли осі маршрутизації пошуку готових
завдань без розбору тексту. `topology.matching_role.discovery_limits`
надає зафіксований числовий контракт: `poll_batch_cap`,
`availability_ceiling_seconds`, `wake_signal_ttl_seconds`,
`workflow_task_lease_seconds` і `activity_task_lease_seconds`. Скрипти можуть
фіксувати ці числа пакета workflow без читання розділу для людини.

```bash
dw server:info --output=json \
  | jq '.topology | {current_shape, current_process_class, current_roles, matching_role, scaling_boundaries, failure_domains}'
```

Значення цих полів описані в розділі
[Топологія ролей Server](/docs/polyglot/server-role-topology).

### Інформація про Server і стан координації {#server-info-and-coordination-health}

`dw server:info` також публікує висновок про безпечність розгортання для всіх
namespace сервера, щоб оператори могли читати стан координації без окремої
поверхні перевірки здоров'я. Табличний режим показує `Coordination Health:`
під `Topology:`. У `--output=json` ті самі дані містяться в
`coordination_health` зі стабільними машинними полями:

- `coordination_health.schema` і `coordination_health.version` фіксують ревізію контракту маніфесту.
- `coordination_health.namespace_scope` показує, чи висновок охоплює один namespace або весь парк.
- `coordination_health.status` і `coordination_health.http_status` показують
  загальний висновок та HTTP перевірку, яку сервер застосовує до готовності.
- `coordination_health.generated_at` фіксує час знімка.
- `coordination_health.categories` узагальнює кількість перевірок за категоріями,
  наприклад `correctness`, `safety`, `routing`.
- `coordination_health.warning_checks` і `coordination_health.error_checks`
  перелічують перевірки, що перевели висновок у попередження чи помилку.
- `coordination_health.checks[]` містить деталі кожної перевірки з `name`,
  `status`, `category` і `message` для автоматизованого пояснення погіршення.
  Зафіксований перелік завжди містить `worker_compatibility`, `task_transport`,
  `routing_health`, `durable_resume_paths`, перевірки проєкцій і планувальника та
  `activity_path`. `activity_path` є відповідником `task_transport` для activity:
  він показує виконання activity, чиї дедлайни schedule-to-start, start-to-close,
  schedule-to-close або heartbeat минули без примусового застосування, а також
  тривалий backlog повторних спроб activity. Перейменування `activity_path`
  є зміною рівня протоколу.

```bash
dw server:info --output=json \
  | jq '.coordination_health | {status, http_status, namespace_scope, warning_checks, error_checks}'
```

Базовий контракт готовності цих полів описаний у
[довіднику API Server](/docs/polyglot/server-api-reference).

### Самооновлення {#self-upgrade}

`dw upgrade` завантажує відповідний платформі файл із релізу GitHub
`durable-workflow/cli`, перевіряє його за `SHA256SUMS` релізу та замінює
поточний бінарний файл лише після збігу контрольної суми. `--tag` фіксує
конкретний тег релізу, `--dry-run` визначає цільовий реліз і показує URL файлів
без завантаження, а `--force` примусово завантажує й замінює файл навіть
за однакових поточної та цільової версій.

Команда відмовляється змінювати інсталяції, якими керує інший інструмент.
JSON містить стабільне поле `status` для автоматизації без розбору тексту:

| `status` | Значення |
| --- | --- |
| `upgraded` | Бінарний файл замінено на `target_version`. |
| `noop` | `current_version` уже відповідає `target_version`. `--force` обходить цю перевірку. |
| `dry-run` | `--dry-run` визначив `target_version`, `asset_url` і `checksum_url` без завантаження. |
| `refused` | Інсталяція не є самостійним бінарним файлом релізу (Composer vendor, Homebrew cellar чи PHAR) або для платформи немає опублікованого файлу. |
| `permission-denied` | Каталог інсталяції недоступний для запису. Payload містить `hint` із рекомендованою дією. |
| `error` | Помилка отримання каталогу релізів, невідповідність контрольної суми чи помилка файлової системи. |

У разі відмови `installation.kind` визначає інструмент керування
(`composer-vendor`, `homebrew`, `phar` чи `binary`), а `reason` називає
належний спосіб оновлення. Для публічної автоматизації без вихідного коду
перевстановіть зафіксований реліз через `https://durable-workflow.com/install.sh`.
Для інсталяцій Homebrew використовуйте `brew upgrade durable-workflow/tap/dw`.

## Профілі середовищ {#environment-profiles}

Профілі містяться в `~/.config/dw/config.json` або
`$XDG_CONFIG_HOME/dw/config.json`, якщо змінна задана. Для ізоляції профілів
тестів чи CI задайте `DW_CONFIG_HOME`.

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw env:set <name>` | Створити чи оновити іменований профіль. | | `--server`, `--namespace`, `--token-env`, `--token`, `--tls-verify=true|false`, `--profile-output=table|json|jsonl`, `--make-default`, `--json` |
| `dw env:list` | Показати профілі з типовим приховуванням буквальних token. | | `--show-token`, `--json`, `--output=jsonl` |
| `dw env:show [name]` | Показати один профіль, типово поточний. | | `--show-token`, `--json` |
| `dw env:use <name>` | Задати типовий профіль. Невідомі імена спричиняють помилку. | | `--json` |
| `dw env:delete <name>` | Видалити профіль. | | `--json` |

Для production профілів надавайте перевагу `--token-env=NAME`, щоб секрети
залишалися в середовищі виконання й не потрапляли до файлу профілю.

## Команди workflow {#workflow-commands}

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw workflow:start` | Запустити workflow через площину керування. | | `--type`, `--workflow-id`, `--business-key`, `--task-queue`, `--duplicate-policy`, `--memo`, `--search-attr key=value`, `--execution-timeout`, `--run-timeout`, `--wait`, параметри вводу, `--json` |
| `dw workflow:list` | Показати екземпляри workflow. | | `--type`, `--status`, `--query`, `--limit`, глобальні параметри виводу |
| `dw workflow:describe <workflow-id>` | Описати поточне чи вибране виконання. | | `--run-id`, `--follow`, `--json` |
| `dw workflow:list-runs <workflow-id>` | Показати виконання екземпляра workflow. | | `--json` |
| `dw workflow:show-run <workflow-id> <run-id>` | Показати одне виконання. | | `--follow`, `--json` |
| `dw workflow:history <workflow-id> <run-id>` | Прочитати події історії виконання. | | `--follow`, `--page-size`, `--json` |
| `dw workflow:history-export <workflow-id> <run-id>` | Експортувати архівний payload історії виконання. | | `--output-file`, глобальні параметри |
| `dw workflow:signal <workflow-id> <signal-name>` | Надіслати signal. | | `--run-id`, параметри вводу, `--json` |
| `dw workflow:query <workflow-id> <query-name>` | Виконати query workflow лише для читання. | | `--run-id`, параметри вводу, `--json` |
| `dw workflow:update <workflow-id> <update-name>` | Подати чи виконати update workflow. | | `--wait=accepted|completed`, `--run-id`, параметри вводу, `--json` |
| `dw workflow:cancel [workflow-id]` | Закрити один workflow чи вибрану групу як скасовані без очищення в коді workflow. | | `--reason`, `--run-id`, `--all-matching`, `--type`, `--status`, `--limit`, `--yes`, `--json` |
| `dw workflow:terminate <workflow-id>` | Примусово завершити workflow. | | `--reason`, `--run-id`, `--json` |
| `dw workflow:repair <workflow-id>` | Попросити сервер відновити застрягле виконання чи виконання, що допускає повторну спробу. | | `--json` |
| `dw workflow:archive <workflow-id>` | Архівувати закрите виконання. | | `--reason`, `--json` |

Приклади:

```bash
dw workflow:start \
  --type=App\\Workflows\\ProcessOrder \
  --workflow-id=order-123 \
  --task-queue=payments \
  --input='["order-123"]' \
  --json

dw workflow:update order-123 approve --wait=completed --input='["manager"]'
dw workflow:cancel --all-matching='WorkflowType = "ImportJob"' --limit=25 --yes
```

`workflow:start`, `workflow:signal`, `workflow:query` і `workflow:update`
перевіряють канонічні поля запиту за контрактом, опублікованим сервером.
Неканонічні застарілі псевдоніми відхиляються до надсилання запиту.

## Команди адаптерів bridge {#bridge-adapter-commands}

Команди bridge є обмеженими інструментами приймання та передавання подій
інтеграції. Вони викликають серверні адаптери bridge і повертають форму
`durable-workflow.v2.bridge-adapter-outcome.contract` у режимі JSON.
Вони не виконують код workflow і не керують переходами стану workflow.

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw bridge:webhook <adapter>` | Надіслати одну подію webhook bridge, що запускає workflow, надсилає signal чи update через площину керування. | | `--action=start_workflow|signal_workflow|update_workflow`, `--idempotency-key`, `--target`, параметри вводу, `--correlation`, `--json` |

Приклади:

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json

dw bridge:webhook pagerduty \
  --action=signal_workflow \
  --idempotency-key=pd-event-3003 \
  --target='{"workflow_id":"wf-remediation-42","signal_name":"incident_escalated"}' \
  --input='{"severity":"critical"}'
```

Використовуйте поля результату bridge замість висновків лише за HTTP статусом.
`outcome`, `reason`, `control_plane_outcome`, `idempotency_key` та зведення
`target` із прихованими даними є контрактом автоматизації для дублікатів,
відсутніх маршрутів, неправильних payload і прийнятих передавань.

## Команди schedule {#schedule-commands}

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw schedule:create` | Створити schedule. | | `--schedule-id`, `--workflow-type`, `--cron`, `--interval`, `--task-queue`, `--timezone`, `--execution-timeout`, `--run-timeout`, `--overlap-policy`, `--jitter`, `--max-runs`, `--paused`, `--note`, параметри вводу, `--json` |
| `dw schedule:list` | Показати schedule. | | глобальні параметри виводу |
| `dw schedule:describe <schedule-id>` | Описати один schedule. | | `--json` |
| `dw schedule:update <schedule-id>` | Оновити специфікацію schedule чи ввід workflow. | | параметри створення schedule, параметри вводу, `--json` |
| `dw schedule:pause <schedule-id>` | Призупинити schedule. | | `--note`, `--json` |
| `dw schedule:resume <schedule-id>` | Відновити schedule. | | `--note`, `--json` |
| `dw schedule:trigger <schedule-id>` | Негайно запустити schedule. | | `--overlap-policy`, `--json` |
| `dw schedule:backfill <schedule-id>` | Виконати backfill часового вікна. | | `--start-time`, `--end-time`, `--overlap-policy`, `--json` |
| `dw schedule:delete <schedule-id>` | Видалити schedule. | | `--json` |

Під час створення schedule використовуйте `--cron` або `--interval`.
`--paused` дозволяє зареєструвати schedule під час розгортання без запуску роботи.

## Команди worker і черг завдань {#worker-and-task-queue-commands}

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw worker:register [worker-id]` | Зареєструвати worker із місткістю й метаданими сумісності. | | `--task-queue`, `--runtime`, `--sdk-version`, `--build-id`, `--workflow-type`, `--activity-type`, `--max-workflow-tasks`, `--max-activity-tasks`, `--json` |
| `dw worker:list` | Показати worker. | | `--task-queue`, `--status`, глобальні параметри виводу |
| `dw worker:describe <worker-id>` | Описати одного worker. | | `--json` |
| `dw worker:deregister <worker-id>` | Скасувати реєстрацію worker. | | `--json` |
| `dw task-queue:list` | Показати активні черги завдань і стан допуску. | | глобальні параметри виводу |
| `dw task-queue:describe <queue>` | Описати місткість worker, lease, бюджети доставлення й місткість очікуваних завдань query. | | `--json` |
| `dw task-queue:build-ids <queue>` | Перевірити стан груп за build-id і розгортання однієї черги. | | `--json` |
| `dw task-queue:drain <queue>` | Позначити групу build-id як draining, щоб вона перестала отримувати нові завдання. | | `--build-id <value>`, `--unversioned`, `--json` |
| `dw task-queue:resume <queue>` | Зняти попередній drain, щоб група знову отримувала нові завдання. | | `--build-id <value>`, `--unversioned`, `--json` |

Команди черг завдань є рекомендованим операторським оглядом обмеження потоку,
місткості та відсутності worker. Серверну політику цих полів описано в
[допуску черг завдань](/docs/polyglot/task-queue-admission), а повний перехід
від неверсіонованих до версіонованих worker, canary, drain і відкат описано в
[розгортанні build-id worker](/docs/polyglot/worker-build-id-rollout).

`dw task-queue:drain` і `dw task-queue:resume` потребують або
`--build-id <value>` для певної групи збірки, або `--unversioned` для worker,
зареєстрованих без `build_id`. Поєднання цих параметрів одразу спричиняє
помилку параметрів. Обидві команди ідемпотентні: повторний drain не зсуває
записаний час `drained_at`, а resume вже активної групи не змінює стану.

## Команди протоколу worker {#worker-protocol-commands}

Ці команди є низькорівневими інструментами протоколу для діагностики,
коротких перевірок і експериментів із worker без SDK. Звичайні worker PHP
і Python мають використовувати цикли своїх SDK.

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw workflow-task:poll <worker-id>` | Опитати одне завдання workflow. | | `--task-queue`, `--build-id`, `--poll-request-id`, `--history-page-size`, `--accept-history-encoding`, `--json` |
| `dw workflow-task:history <task-id> <page-token>` | Отримати наступну сторінку історії орендованого завдання workflow. | | `--lease-owner`, `--attempt`, `--json` |
| `dw workflow-task:complete <task-id> <attempt>` | Завершити одне завдання workflow з payload команд. | | `--lease-owner`, `--complete-result`, `--command`, `--json` |
| `dw workflow-task:fail <task-id> <attempt>` | Повідомити про помилку виконання завдання workflow для повторної спроби чи діагностики. Відрізняється від завершення завдання командою `fail_workflow`. | | `--lease-owner`, `--message`, `--type`, `--stack-trace`, `--json` |
| `dw query-task:poll <worker-id>` | Опитати й орендувати одне маршрутизоване завдання query workflow. | | `--task-queue`, `--json` |
| `dw query-task:complete <query-task-id> <attempt>` | Завершити орендоване завдання query результатом JSON і відповідною обгорткою. | | `--lease-owner`, `--result`, `--json` |
| `dw query-task:fail <query-task-id> <attempt>` | Повідомити про помилку орендованого завдання query з машиночитаною причиною. | | `--lease-owner`, `--message`, `--reason`, `--type`, `--stack-trace`, `--json` |
| `dw activity:complete <task-id> <attempt-id>` | Завершити одну орендовану спробу activity. | | `--lease-owner`, параметри вводу, `--json` |
| `dw activity:fail <task-id> <attempt-id>` | Завершити одну орендовану спробу activity помилкою. | | `--lease-owner`, `--message`, `--type`, `--non-retryable`, `--json` |

Використовуйте `workflow-task:fail` для помилок виконання на боці worker,
наприклад розбіжностей replay чи помилок десеріалізації. Команда звертається до
`POST /worker/workflow-tasks/{taskId}/fail`. Завершення завдання командою,
що завершує workflow помилкою, є окремою дією через `workflow-task:complete`
з відповідним payload команди.

`query-task:poll`, `query-task:complete` і `query-task:fail` працюють із
маршрутизованими query worker через `/worker/query-tasks/…`. Звичайні worker
отримують завдання query через обробник query SDK. CLI призначений для
діагностики, перевірок паритету CLI/SDK та експериментів без SDK.
Типова причина помилки query: `--reason=query_rejected`. Використовуйте сталу
причину, наприклад `unknown_query`, `decode_failure` чи ідентифікатор runtime,
щоб викликаючий код розрізняв очікувані відхилення та помилки runtime.

### Сторінки історії завдання workflow {#workflow-task-history-pages}

`workflow-task:history` є діагностичною обгорткою CLI для endpoint сторінок
історії worker. Використовуйте її лише після отримання орендованого завдання
workflow з `next_history_page_token` через `workflow-task:poll`.
Звичайні worker мають дозволяти SDK завантажувати додаткові сторінки історії.

<!-- docs-example id="cli.workflow-task-history.command" -->
```bash
dw workflow-task:history workflow-task-01 history-page-2 \
  --lease-owner=python-worker-1 \
  --attempt=2 \
  --json
```

JSON повертає відповідь сервера без перейменування полів:

<!-- docs-example id="cli.workflow-task-history.response" -->
```json
{
  "history_events": [
    {"event_id": 2, "event_type": "ActivityScheduled", "payload": {}}
  ],
  "total_history_events": 4,
  "next_history_page_token": "history-page-3"
}
```

Автоматизація має читати `history_events`, `total_history_events` і
`next_history_page_token`. Endpoint історії worker не використовує поля
`events` чи `next_page_token` історії виконання площини керування.

## Команди namespace й атрибутів пошуку {#namespace-and-search-attribute-commands}

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw namespace:list` | Показати namespace. | | глобальні параметри виводу |
| `dw namespace:create <name>` | Створити namespace. | | `--description`, `--retention`, `--json` |
| `dw namespace:describe <name>` | Описати один namespace. | | `--json` |
| `dw namespace:update <name>` | Оновити метадані namespace. | | `--description`, `--retention`, `--json` |
| `dw namespace:set-storage-driver <name> <driver>` | Налаштувати політику зовнішнього сховища payload namespace для закодованих payload, що перевищують поріг винесення. | | `--threshold-bytes`, `--uri`, `--disk`, `--bucket`, `--prefix`, `--region`, `--endpoint`, `--auth-profile`, `--disable`, `--json` |
| `dw storage:test` | Перевірити запис і читання малого вбудованого й великого винесеного payload через вибрану політику сховища namespace чи перевизначений драйвер. | | `--driver=local|s3|gcs|azure`, `--small-bytes`, `--large-bytes`, глобальні параметри, `--json` |
| `dw search-attribute:list` | Показати атрибути пошуку. | | глобальні параметри виводу |
| `dw search-attribute:create <name> <type>` | Зареєструвати атрибут пошуку. | | `--json` |
| `dw search-attribute:delete <name>` | Видалити атрибут пошуку. | | `--json` |

Типи атрибутів пошуку є сумісними із сервером значеннями: `keyword`, `text`,
`int`, `double`, `bool`, `datetime` і `keyword_list`.

Команди зовнішнього сховища payload викликають API сховища namespace сервера.
Драйвер має бути `local`, `s3`, `gcs` чи `azure`. Драйвери об'єктних сховищ
використовують серверну конфігурацію файлової системи, тому параметри CLI
описують політику namespace й не містять облікових даних провайдера.
`--disk` прив'язує драйвер `s3`, `gcs` чи `azure` до іменованого диска серверної
файлової системи з фактичними обліковими даними. `--disable` зберігає запис
політики, але забороняє нове винесення payload.

Приклади:

```bash
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152 \
  --json

dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

dw storage:test --namespace=billing --large-bytes=2097152 --json
dw storage:test --driver=s3 --small-bytes=128 --large-bytes=3145728 --json
```

У режимі JSON `namespace:set-storage-driver` повертає payload namespace із
політикою `external_payload_storage`. `storage:test` повертає діагностичний
статус і об'єкти результатів `small_payload` та `large_payload`.
Автоматизація має використовувати ці поля замість розбору таблиці для людини.

Ця діагностика також є найшвидшою операторською перевіркою контракту посилань
на payload. Успішна перевірка великого payload доводить, що вибрана політика
може записати закодовані байти, повернути посилання
`durable-workflow.v2.external-payload-reference.v1`, прочитати об'єкт і
перевірити `size_bytes` та `sha256`. Діагностичну помилку розглядайте як
проблему політики сховища до дозволу workflow виносити payload через цей namespace.

## Системні команди {#system-commands}

Системні команди надають явні операції обслуговування сервера для скриптів.

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw system:repair-status` | Показати backlog і стан відновлення workflow. | | `--json` |
| `dw system:repair-pass` | Виконати один прохід відновлення. | | `--run-id`, `--limit`, `--json` |
| `dw system:activity-timeout-status` | Показати backlog і стан тайм-аутів activity. | | `--json` |
| `dw system:activity-timeout-pass` | Виконати один прохід тайм-аутів activity. | | `--task-id`, `--limit`, `--json` |
| `dw system:retention-status` | Показати backlog і стан retention. | | `--json` |
| `dw system:retention-pass` | Виконати один прохід очищення retention. | | `--run-id`, `--limit`, `--json` |

В інструкціях операцій спочатку використовуйте команди status, а потім pass,
щоб оператори бачили обсяг очікуваної роботи до зміни стану сервера.

## Команди схем {#schema-commands}

| Команда | Призначення | Важливі параметри |
| --- | --- | --- |
| `dw schema:list` | Показати опубліковані машиночитані схеми. | | з'єднання із сервером не потрібне |
| `dw schema:show <command-name>` | Показати вбудовану JSON Schema виводу однієї команди. | | `--output=json|jsonl`; з'єднання із сервером не потрібне |
| `dw schema:manifest` | Показати маніфест схем. | | з'єднання із сервером не потрібне |

Команди схем корисні, якщо AI клієнту чи завданню CI потрібен поточний контракт
площини керування, відповіді чи виводу без розбору документації.
[Поточний маніфест v4](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json)
прив'язує кожну JSON обгортку та схему записів JSONL через публічний resolver
і digest. Поля payload запуску/виконання workflow та query/update приймають
лише кодек `avro`. Збережені
[маніфест v3](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json)
і [маніфест v2](https://durable-workflow.github.io/cli-json-envelopes/v2/manifest.json)
залишаються доступними з початковими байтами для користувачів, що фіксують ревізію.

## Контракт виводу й завершення {#output-and-exit-contract}

Використовуйте `--output=json` для одного об'єкта та `--output=jsonl`, якщо
список передається потоковому процесору. Таблиці для людини можуть
удосконалюватися, а назви полів JSON є контрактом автоматизації.

Усі команди використовують стабільну політику кодів завершення з
[посібника CLI](/docs/polyglot/cli#exit-codes):

| Код | Значення |
| --- | --- |
| `0` | Успіх. |
| `1` | Команда виконалася, але завершилася загальною помилкою. |
| `2` | Неправильне локальне використання чи помилка перевірки. |
| `3` | Помилка мережі чи транспорту. |
| `4` | Помилка автентифікації чи авторизації. |
| `5` | Ресурс не знайдено. |
| `6` | Серверна помилка `5xx`. |
| `7` | Тайм-аут. |

Для підтримки зберіть `dw doctor --output=json`, `dw server:info
--output=json` і `dw debug workflow <workflow-id> --output=json`.

## Пов'язані посібники {#related-guides}

- [CLI](./cli.mdx): встановлення, профілі та коди завершення.
- [Server](./server.md): площина керування HTTP для серверних команд.
- [Можливості клієнтів і worker](./cli-python-parity.md): порівняння
  клієнтів і worker CLI, PHP, Python та Rust.
