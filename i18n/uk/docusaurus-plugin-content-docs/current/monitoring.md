---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - моніторинг workflow
  - стійка історія
  - телеметрія runtime
  - доступні дії waterline
  - суто діагностичні докази
  - стан відновлення
---

# Моніторинг {#monitoring}

[Waterline](https://github.com/durable-workflow/waterline) — UI та API
оператора для стану workflow. Його постачання відповідає обраній межі
runtime: Cloud містить Managed Waterline, а оператор власного розгортання
за потреби окремо розгортає Waterline.

Waterline — один операторський продукт із трьома способами використання:

- **Вбудований режим** встановлює пакет Composer у Laravel-застосунок,
  що володіє workflow, і читає його стійкий стан у процесі застосунку.
- **Власний сервісний режим** запускає опублікований образ
  `durableworkflow/waterline` та читає стан
  [окремого Server](./polyglot/server.md) через PHP SDK і публічний
  Server API. Дистрибутив Server не містить і не обслуговує Waterline.
- **Cloud Managed Waterline** є інтерфейсом оператора в межах простору
  імен, включеним до [Durable Workflow Cloud](./polyglot/cloud-control-plane.md).
  Cloud обслуговує Managed Waterline та runtime простору імен за ним.

Вбудований і власний сервісний режими надають той самий основний UI
Waterline та сімейства маршрутів оператора `/waterline/api/...`.
Cloud надає можливості оператора через керований інтерфейс. Кожне подання
обмежене run свого runtime та простору імен і не об’єднує стан runtime.
Для операцій власного Server його API, CLI та операторські інтерфейси SDK
доступні незалежно від розгортання Waterline. Використовуйте
[довідник Server API](./polyglot/server-api-reference.md) для власних
маршрутів Server і [довідник API оператора Waterline](./waterline-operator-api.md)
для маршрутів Waterline та контрактів відповідей.

Durable Workflow має дві площини спостереження:

| Площина | Джерело істини | Типові питання |
| --- | --- | --- |
| Стійкий стан | База даних workflow та API runtime-власника, проєкції Waterline й експорт історії | Чи почався workflow? Який run поточний? Які signal, update, timer, activity, повторна спроба або помилка зафіксовані? Яка дія оператора зараз безпечна? |
| Телеметрія worker/runtime | Журнали worker черг, реєстратори метрик SDK, endpoint Prometheus/OpenMetrics і трасування застосунку | Чи worker опитують черги? Скільки тривають завдання? Чи налаштований exporter? Чи власні метрики застосунку вийшли з процесу worker? |

Waterline навмисно не замінює метрики worker.
Власні метрики, записані кодом activity або worker, зчитуйте з endpoint
телеметрії worker. Використовуйте Waterline для зіставлення такого
сигналу runtime зі стійкою історією workflow та поточним станом run.

Налаштування worker і клієнтів також відокремлене від інтерфейсу оператора.
Під час підключення клієнтів застосунку та worker до runtime-власника
простору імен використовуйте згенеровані
[PHP SDK API](https://php.durable-workflow.com/api/),
[Python SDK API](https://python.durable-workflow.com/) або
[Rust SDK API](https://rust.durable-workflow.com/) разом із мовними
посібниками.

Коли телеметрія worker показує повторні claims, змагання пізніх завершень
або застряглі оренди, читайте
[гарантії виконання й ідемпотентність](./constraints/execution-guarantees.md)
разом із цим посібником. Контракт розрізняє невизначеність транспорту
щонайменше один раз і повторні стійкі результати, щоб схожі на дублікати
докази не призвели до неправильного операційного висновку.

## Трасування OpenTelemetry {#opentelemetry-tracing}

Пов’язуйте запити застосунку, завдання workflow та спроби activity між процесами за допомогою необов’язкового трасування OpenTelemetry. Виберіть налаштування для середовища виконання, яке керує вашими запусками.

### Вбудований Laravel {#embedded-tracing}

Щоб пов'язати журнали застосунку із запуском workflow та спробою activity,
налаштуйте [необов'язкову інтеграцію трасування для вбудованого режиму (англійською)](https://github.com/durable-workflow/workflow/blob/main/docs/embedded-tracing.md).
Вона зберігає контекст W3C між worker черги, повторними спробами й відновленням
та використовує провайдер OpenTelemetry і канали журналювання Laravel вашого
застосунку. Посібник пояснює, як увімкнути трасування, додати tap журналів,
виконати міграції схеми й обмежити експорт. Перед розгортанням перегляньте
діаграму span і матрицю можливостей runtime та SDK.

У файлі `config/workflows.php` застосунку зіставте змінну середовища, якою керує застосунок, з наявною конфігурацією трасування:

```php
'tracing' => [
    'enabled' => (bool) env('DW_TRACING_ENABLED', false),
    'baggage_allowlist' => [],
],
```

Цей приклад спочатку не передає baggage. Установіть необов’язковий API та налаштуйте провайдер, tap журналів, міграції й експортер з обмеженнями за пов’язаним посібником, а потім перезапустіть worker.

### Трасування в сервісному режимі {#service-mode-tracing}

Налаштуйте провайдер, семплювання, пропагатори та обмежений експорт перед увімкненням телеметрії SDK. Використовуйте [посібник PHP](https://php.durable-workflow.com/operate/tracing/), [посібник Python](https://python.durable-workflow.com/telemetry/) або [API Rust](https://rust.durable-workflow.com/durable_workflow/telemetry/) англійською.

| Runtime | Межа поширення контексту |
| --- | --- |
| Вбудований Laravel | Необов'язкова інтеграція Core зберігає контекст між воркерами черги застосунку. |
| Сервер PHP | [Посібник сервера](https://github.com/durable-workflow/server/blob/2.10.0/docs/observability-context.md) вимагає образ застосунку з необов'язковим API, увімкненою опцією та фактичною схемою з nullable-полями. |
| SDK PHP, Python і Rust | Необов'язкові spans задач/спроб і кореляція логів у межах виконання. Надійне поширення контексту виклику вимагає точної заявленої можливості сервера. Відсутня або некоректна можливість дає незалежні траси задач. |
| Нативний сервер Rust | Цей PHP-реліз не підтверджує нативні carriers або конвертацію каталогу. |
| Cloud | Цей реліз не містить розгортання Cloud. Перевірте підтримку керованого runtime. |

Ідентифікатори trace, run, активності, спроби та запиту залишаються окремими. Baggage обмежений списком дозволених ключів, порожнім за замовчуванням; links не містять baggage. Провайдери й експортери належать застосунку. Раптова зупинка може втратити телеметрію; replay не гарантує експорт рівно один раз. Для бізнес-результатів використовуйте надійну історію.

## Подання Waterline {#waterline-views}

### Панель огляду {#dashboard-view}

![Панель Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

Панель показує поточні підсумки, лічильники недавніх run і загальні
метрики, щоб одразу побачити рух, затримку чи помилки роботи.

Використовуйте [операційні межі оператора](./operator-operating-envelope.md)
для контракту розгортання й операційного посібника: які діагностичні
факти блокують трафік, які є рекомендаційними, як факти здоров’я черг
поділені між Waterline і телеметрією worker, як перевіряти відновлення
проєкцій, експорт та архівування.

### Подання workflow {#workflow-view}

![Деталі workflow Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

Деталі workflow показують стійку часову шкалу одного run: activity,
signal, timer і дочірні workflow в порядку подій, кожен із входами,
виходами й часом.

## Розгортання й доступ Waterline {#waterline-deployment-and-access}

### Вбудований Laravel {#embedded-laravel}

Встановіть Waterline у Laravel-застосунок поруч із пакетом Workflow
і виконайте його міграції. Повний посібник встановлення й налаштування
наведено в [durable-workflow/waterline](https://github.com/durable-workflow/waterline).

Вбудований режим використовує підключення до бази даних, middleware
маршрутів, шлюз автентифікації та пакет Workflow хост-застосунку.
Обслуговуйте Laravel-застосунок, його worker черг, scheduler, міграції
та ресурси Waterline як одну межу розгортання.
[Довідник API оператора Waterline](./waterline-operator-api.md#installation)
містить поточну команду Composer і крок публікації ресурсів.

### Права операторів у вбудованому режимі {#embedded-waterline-operator-permissions}

Ці необов’язкові засоби потребують **Waterline 2.13.0**. Зберігайте gate `viewWaterline` для перегляду: gate дій не надає доступу до перегляду. Типово користувачі, які бачать вбудований Waterline, можуть виконувати операторські дії; нові параметри застосовуються лише явно й без налаштувань зберігають цю поведінку.

Щоб заборонити операторські записи всім глядачам, задайте `'read_only' => true` у `config/waterline.php` або підключіть `WATERLINE_READ_ONLY=true` через конфігурацію застосунку перед перебудовою кешу. Перегляд, експорт історії, query та особисті збережені подання/налаштування зберігають чинну авторизацію. Це не зупиняє workflow worker застосунку й не змінює прямі права SDK/Server.

Для окремих прав користувачів визначте Laravel gates у service provider і зіставте кожну групу дій, яку потрібно обмежити. Назви дозволів у прикладі належать політиці вашого застосунку:

```php
use Illuminate\Support\Facades\Gate;

Gate::define('waterline-messages', fn ($user) => $user->can('support-workflows'));
Gate::define('waterline-operations', fn ($user) => $user->can('operate-workflows'));
```

Додайте цю конфігурацію до `config/waterline.php`:

```php
'authorization' => [
    'gates' => [
        'messages' => 'waterline-messages',
        'repair' => 'waterline-operations',
        'cancel' => 'waterline-operations',
        'terminate' => 'waterline-operations',
        'archive' => 'waterline-operations',
        'schedules' => 'waterline-operations',
    ],
],
```

`messages` охоплює signal і update; `schedules` — pause, resume, trigger, backfill і delete. Кожен gate отримує поточного користувача застосунку, а за потреби — HTTP request другим аргументом. Відсутнє або null-зіставлення зберігає типовий доступ до дій. Налаштований gate має існувати й авторизувати користувача; неправильні параметри відхиляють дію. Звичайні правила Laravel для гостей і `Gate::before` діють, але глобальний read-only переважає навіть адміністраторські винятки. Gate не обходить обмеження namespace чи runtime.

Розгорніть розв’язану конфігурацію застосунку й перебудуйте кеш через `php artisan config:cache`; сама зміна середовища не оновлює кешовані чи буквальні параметри. Встановіть перевірений пакет і опублікуйте відповідні assets за звичайними [кроками встановлення](./waterline-operator-api.md#installation). Заборонені записи повертають HTTP 403 із `reason=waterline_action_forbidden` або `reason=waterline_read_only` і `capability`. UI приховує недоступні дії запуску та пояснює вимкнені дії/елементи schedule; backend також захищає старі й exact-run URL змін.

Це **права користувачів вбудованого застосунку**. Service mode зберігає `WATERLINE_ACCESS_MODE=read_only` та права upstream token замість Laravel gates застосунку. Функція не змінює мінімальні залежності SDK/Core й не налаштовує Cloud Managed Waterline.

### Служба Waterline {#waterline-service}

Опублікований образ містить власні PHP і Laravel runtime. Він не потребує
PHP, Composer або пакета Workflow на хості контейнера й ніколи
не підключається до бази даних окремого Server.

Цей приклад прив’язує Waterline до loopback порту хоста `8080`, зберігає
його власний стан UI в іменованому томі й підключає до одного простору
імен Server:

```bash
export WATERLINE_SERVER_ENDPOINT=https://workflow.example.com
export WATERLINE_SERVER_TOKEN=replace-with-a-server-token

docker run --detach \
  --name waterline \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:8080 \
  --volume waterline-data:/data \
  --env WATERLINE_SERVER_ENDPOINT \
  --env WATERLINE_SERVER_TOKEN \
  --env WATERLINE_NAMESPACE=orders \
  --env WATERLINE_ACCESS_MODE=read_only \
  --env WATERLINE_ALLOW_UNAUTHENTICATED=true \
  --env APP_URL=https://waterline.example.com \
  durableworkflow/waterline:%%artifact.waterlineVersion%%
```

Відкрийте `/waterline` через URL-адресу, задану `APP_URL`. Образ слухає
порт контейнера `8080`. Задавайте `PORT` лише за свідомої зміни внутрішнього
порту. `WATERLINE_PATH` змінює типовий префікс URL `waterline`.
Репозиторій також публікує
[визначення служби Docker Compose](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml)
з тією самою межею підключення.

Сервісний режим має два незалежні шари автентифікації:

1. `WATERLINE_SERVER_TOKEN` — bearer-облікові дані Waterline для викликів
   PHP SDK до `WATERLINE_SERVER_ENDPOINT`. Спостереження workflow, worker,
   черг і розкладів потребує ролі оператора Server. Здоров’я Server та
   метрики оператора можуть потребувати ролі admin.
2. Доступ браузера й Waterline API є зовнішньою межею розгортання.
   Самодостатній образ не має каталогу користувачів хост-застосунку
   Laravel. Тому `WATERLINE_ALLOW_UNAUTHENTICATED=true` допустимий лише
   за reverse proxy з автентифікацією або на приватному інтерфейсі,
   як прив’язка loopback вище. Залишайте `false`, доки така зовнішня
   межа автентифікації не налаштована.

Задайте `WATERLINE_NAMESPACE` відповідно до простору імен, який оператори
мають переглядати. Waterline надсилає його з кожним запитом SDK.
`WATERLINE_ACCESS_MODE=read_only` є типовим і блокує зміни в Waterline.
Використовуйте `operator` лише з токеном Server, авторизованим для
потрібних команд.

Том `/data` містить збережені подання Waterline, налаштування відображення
й стан runtime Laravel. За типових налаштувань він містить файлову базу
SQLite `/data/waterline.sqlite`. Він ніколи не містить історії workflow
Server. Використовуйте `DATABASE_URL` або звичайні `DB_*`, якщо власний
стан Waterline має зберігатися в MySQL чи PostgreSQL.

#### Здоров’я й метрики {#health-and-metrics}

Ці перевірки відповідають на різні питання:

| Інтерфейс | Що доводить |
| --- | --- |
| `GET /up` | Процес HTTP Waterline запустився й відповідає на запити. Docker health check образу використовує цей маршрут. |
| `GET /waterline/api/v2/health` | Waterline може зібрати здоров’я Server у межах простору імен, реєстрацію worker та докази черг завдань через PHP SDK. |
| `GET /waterline/api/stats` | Підсумки панелі та огляд оператора на основі Server, який використовує Waterline. |
| `GET /api/system/health` і `GET /api/system/operator-metrics` на Server | Власні контракти здоров’я й оператора Server, незалежні від Waterline. |

`/waterline/api/stats` є JSON оператора, а не endpoint збору Prometheus.
Метрики SDK worker, журнали, трасування й власна телеметрія застосунку
надходять із процесів worker. Здоровий `/up` за недоступної відповіді
здоров’я чи stats Waterline вказує на підключення Server, авторизацію,
простір імен або можливості SDK, а не падіння процесу Waterline.

#### Видимість workflow і дії оператора {#workflow-visibility-and-operator-actions}

У сервісному режимі списки, деталі обраного run, експорт історії,
розклади, статус worker, докази черг завдань, signal, update, query,
відновлення, скасування, припинення та архівування проєктуються з
налаштованого окремого Server через PHP SDK. Форми маршрутів Waterline
відповідають [довіднику API оператора Waterline](./waterline-operator-api.md),
а базові контракти Server описані в
[довіднику Server API](./polyglot/server-api-reference.md).

Waterline показує лише налаштований простір імен і run підключеного
Server. Вбудовані run залишаються видимими через своє вбудоване
розгортання Waterline, а run Server — через сервісне розгортання або
власні інтерфейси Server. Зміна backend Waterline не мігрує та
не об’єднує run.

#### Межі діагностики {#troubleshooting-boundaries}

| Симптом | Що перевірити |
| --- | --- |
| Контейнер завершується до обслуговування `/up` | Обов’язковий `WATERLINE_SERVER_ENDPOINT`, доступний для запису `/data`, допустимий `PORT`, налаштування бази даних і обмежені журнали міграцій запуску. |
| Подання на основі Server повертає `401` або `403` | `WATERLINE_SERVER_TOKEN` і його роль Server. Відмова зовнішнього доступу Waterline є окремим питанням proxy або `WATERLINE_ALLOW_UNAUTHENTICATED`. |
| Маршрут зміни повертає `waterline_read_only` | Залиште лише читання або явно задайте `WATERLINE_ACCESS_MODE=operator`. Токен Server усе одно має авторизувати команду. |
| Очікувані workflow відсутні | `WATERLINE_NAMESPACE`, endpoint Server і runtime, який прийняв запуск. Waterline не шукає в інших просторах імен чи вбудованих runtime. |
| `/up` успішний, але здоров’я, stats або подання повідомляє недоступну можливість | Безпосередньо перевірте endpoint Server через API чи CLI, потім ролі токена й наявність потрібного методу в опублікованому наборі Waterline/PHP SDK. |
| Маршрут каталогу служб повідомляє `backend_capability_unavailable` | Сервісний режим не відтворює вбудований каталог служб Waterline між просторами імен. Для цієї можливості використовуйте власні endpoint служб і API підключеного Server. |
| Власної метрики немає в Waterline | Перегляньте exporter метрик worker. Waterline повідомляє стійкі факти оператора, а не довільні метрики процесу. |

### Позначка середовища {#waterline-environment-banner}

Позначайте вкладки production та інших середовищ банером Waterline. Ці змінні працюють у вбудованому Laravel і standalone service mode:

```dotenv
WATERLINE_ENV_NAME=production
WATERLINE_ENV_COLOR="#dc3545"
```

`WATERLINE_ENV_COLOR` обирає колір із фіксованої палітри, сумісної з CSP:

| Прийняте значення | Колір банера |
| --- | --- |
| `#0d6efd` або `#2563eb` | Синій |
| `#198754` або `#28a745` | Зелений |
| `#6f42c1` або `#7746ec` | Фіолетовий |
| `#dc3545` | Червоний |
| `#fd7e14` | Помаранчевий |
| `#ffc107` | Жовтий |

Інші значення дають нейтральний сірий колір, зокрема коректні hex-кольори на кшталт `#ff0000`. Для потрібного кольору використовуйте значення з таблиці.

У вбудованому Laravel визначальними є розв’язані ключі `env_name` та `env_color` у `config/waterline.php`. Опублікована конфігурація може перевизначати значення зі змінних середовища. Після зміни такої конфігурації перебудуйте кеш конфігурації застосунку звичайним шляхом розгортання:

```bash
php artisan config:cache
```

Якщо банер відрізняється від `.env`, перевірте розв’язану конфігурацію Waterline. Кешовані значення діють до перебудови. У standalone service mode оновіть середовище розгортання Waterline та створіть контейнер заново або повторно розгорніть його, щоб завантажити нові значення. Це налаштування відображення Waterline; задавайте їх для описаного вище сервісу Waterline.

### Cloud Managed Waterline {#cloud-managed-waterline}

Клієнти Cloud відкривають Cloud Managed Waterline з керованого інтерфейсу
оператора в межах простору імен. Вони не розгортають і не налаштовують
Waterline, Server, PHP чи внутрішні endpoint і не мають другого входу
Waterline. Інструкції власного образу, `WATERLINE_*`, токена Server,
бази даних і зовнішньої автентифікації вище не застосовуються до цього шляху.

Автентифікація Cloud визначає ідентичність оператора. Авторизація
організації, проєкту, середовища та простору імен Cloud визначає область
Managed Waterline, доступну цій ідентичності. У її межах оператори можуть
переглядати списки й пошук workflow, деталі run та стійку історію,
здоров’я простору імен і дії, підтримувані їхньою роллю. Керований
інтерфейс обмежений обраним простором імен і не об’єднує дані інших
середовищ або просторів імен.

Зміни обмежені ролями. Cloud приписує кожну підтримувану зміну оператора
автентифікованому діячу Cloud в аудиті, а отриманий стійкий перехід
workflow залишається видимим в історії workflow. Наприклад, успішне
архівування приписується в аудиті Cloud та записує стійку подію історії
`WorkflowArchived`. Операторам не потрібні приватні облікові дані runtime
або знання його внутрішнього розгортання для використання цього інтерфейсу.

## API списку й деталей {#list-and-detail-api}

Списки Waterline (`/waterline/api/flows/{bucket}`) та endpoint деталей
обраного run (`/waterline/api/flows/{id}`) повертають типізовані контракти
JSON для прямого використання власними панелями чи скриптами.
[Довідник API оператора Waterline](./waterline-operator-api.md) описує
endpoint, сімейства полів обраного run, експорт історії, доступні дії,
розклади, збережені подання, налаштування та контракт дій оператора.

### Контракт доступних дій {#actionability-contract}

Waterline додає версійований контракт доступних дій до рядків списку,
відповідей деталей обраного run та експорту історії. Для полів нижче
ідентифікатором контракту є
`actionability_contract.schema = waterline.actionability` і
`actionability_contract.version = 1`.

`actionability` рівня run відповідає, чи можна відновити обраний run:

| Поле | Значення |
| --- | --- |
| `repair_state` | Одне з `repairable`, `blocked`, `not_needed` або `unknown`. |
| `repairable` | Boolean-скорочення `repair_state = repairable`. |
| `blocked_reason` | Стабільний код причини за `repair_state = blocked`. |
| `status_bucket` | Категорія Waterline, що визначила рішення рівня run. |
| `closed_reason` | Стійка причина закриття закритого run. |
| `task_problem` | Чи Waterline виявив проблему завдання run. |
| `diagnostic_only_evidence` | True, якщо хоча б один дочірній рядок доказів інформативний, але не є джерелом відновлення виконання. |

Рядки доказів у `activities`, `waits`, `timers`, `exceptions`, `logs`
і записи часової шкали/експорту також можуть мати власний блок
`actionability`:

| Поле | Значення |
| --- | --- |
| `state` | `actionable`, якщо рядок є допустимим джерелом відновлення, інакше `diagnostic_only`. |
| `repair_source` | True лише для рядків із джерелом істини, придатним до відновлення. |
| `diagnostic_only` | True, якщо рядок не можна використовувати як джерело продовження виконання. |
| `history_authority` | Джерело істини, як `typed_history`, `mutable_open_fallback`, `failure_row_fallback` або `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Стабільний код причини непідтримуваної запасної історії. |

Автоматизація має визначати доступність відновлення, продовження та replay
за `actionability.repair_state`, `actionability.repairable` і
`actionability.repair_source` рівня рядка. Рядок із
`diagnostic_only = true` ніколи не є стійким джерелом продовження, навіть
якщо містить корисні метадані помилки чи запасного джерела. Рядки з
`history_authority = unsupported_terminal_without_history` є лише
діагностичними доказами: пояснюють блокування run, але не доводять
достатньої типізованої історії для безпечного відновлення поступу.

## Дії площини керування з Waterline {#control-plane-actions-from-waterline}

Оператори можуть скасувати, припинити, відновити й архівувати workflow
безпосередньо з деталей. Кожна дія відповідає `POST` для того самого ID
run і повертає `200` з отриманим станом або `409`, коли дія недопустима
для поточного стану run.

У сервісному режимі Waterline передає підтримувані команди через PHP SDK.
Для змін потрібні `WATERLINE_ACCESS_MODE=operator` та облікові дані Server,
авторизовані для команди. За відсутності Waterline оператори завжди можуть
використовувати Server API або CLI безпосередньо.

У Cloud Managed Waterline кожну підтримувану зміну обмежують роль Cloud
та авторизація простору імен, а автентифікована ідентичність Cloud визначає
її автора в аудиті. Клієнти не налаштовують облікові дані Waterline→Server
для керованого інтерфейсу.

## Пов’язані посібники {#related-guides}

- [Гарантії виконання й ідемпотентність](./constraints/execution-guarantees.md)
  пояснюють контракт replay, повторних спроб, спливання оренди та стійких
  результатів, що визначає докази оператора.
- [Операційні межі оператора](./operator-operating-envelope.md) поєднують
  здоров’я, стан черг, відновлення проєкцій, експорт, архівування та
  очікування топології в один контракт оператора.
- [Помилки й відновлення](./failures-and-recovery.md) пояснюють вичерпання
  повторних спроб, помилки non-retryable, тайм-аути й поведінку відновлення
  за фактами панелі.
- [Розробка за допомогою AI](./ai-assisted-development.md) називає
  контракти Waterline, CLI, MCP та читання LLM, які агенти мають
  використовувати для діагностики стану workflow.
