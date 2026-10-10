---
sidebar_position: 13
title: Довідник операторського API Waterline
description: Типізовані контракти API Waterline для списків dashboard, деталей вибраного run, експорту історії, schedules, збережених подань, налаштувань і дій оператора.
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - довідник API Waterline
  - деталі вибраного run
  - експорт історії
  - контракт actionability
  - операторські дії workflow
---

# Довідник операторського API Waterline {#waterline-operator-api-reference}

Waterline надає оператору durable-стан і для вбудованого Laravel,
і для окремого Server. UI використовує той самий HTTP+JSON API,
який описано тут. Тому scripts, dashboards та агенти можуть читати
факти durable workflow без розбору HTML.

Використовуйте цей довідник для типізованих операторських даних:
деталей вибраного run, експорту історії, actionability, доступності команд,
збережених подань, налаштувань та огляду schedules.
[Моніторинг](./monitoring.md) пояснює поділ між durable-станом Waterline
та телеметрією workers/runtime.

## Встановлення {#installation}

Установіть Waterline у тому самому вбудованому Laravel-застосунку,
де встановлено пакет workflow:

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%% \
  %%artifact.phpSdkComposerPackage%%
php artisan waterline:install
```

Згенеровані pins вибирають стабільні випуски 2.x Waterline, Workflow
та PHP SDK. Після оновлення Waterline опублікуйте поточні assets:

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

Самодостатній service image та його параметри підключення,
автентифікації й зберігання описано в
[моніторингу](./monitoring.md#waterline-service).

### Мова інтерфейсу {#interface-language}

Waterline підтримує англійську, бразильську португальську, спрощену китайську, французьку, японську, іспанську та українську
мови у вбудованому режимі та режимі окремого сервісу. Щоб вибрати мову, задайте змінну середовища
Laravel-застосунку або контейнера сервісу:

```dotenv
WATERLINE_LOCALE=uk
```

| Мова | Налаштування |
| --- | --- |
| Англійська | `en` |
| Бразильська португальська | `pt-BR` |
| Спрощена китайська | `zh-Hans` |
| Французька | `fr` |
| Японська | `ja` |
| Іспанська | `es` |
| Українська | `uk` |

Регіональні коди іспанської, наприклад `es-ES`, `es-MX` та `es-419`, вибирають
спільний іспанський інтерфейс. `pt`, `pt_br` та варіанти регістру вибирають
бразильську португальську (`pt-BR`). Інші регіональні коди португальської
повертають англійський інтерфейс. Числа, підписи діаграм і відносні проміжки часу
відображаються вибраною мовою інтерфейсу.
Для спрощеної китайської задайте `zh-Hans`. Коди `zh`, `zh-CN`, `zh-SG` та
явні коди спрощеного письма, наприклад `zh-Hans-CN`, вибирають той самий
інтерфейс. Підкреслення та варіанти регістру також підтримуються. Коди
традиційної китайської, наприклад `zh-Hant`, `zh-TW` і `zh-HK`, повертають
англійський інтерфейс.
Для японської задайте `ja`. Регіональні коди, наприклад `ja-JP`, підкреслення
та варіанти регістру вибирають той самий японський інтерфейс.
Для французької задайте `fr`. Регіональні коди, наприклад `fr-FR` і `fr-CA`,
підкреслення та варіанти регістру вибирають спільний французький інтерфейс.

Англійська (`en`) є типовою мовою та використовується для відсутніх перекладів.
Вбудований застосунок також може задати `waterline.locale` у своїй конфігурації.
Після зміни налаштування оновіть кеш конфігурації Laravel, якщо він увімкнений.
Waterline зберігає мову основного застосунку, назви робочих процесів,
ідентифікатори, дані та оригінальні тексти винятків. Назви полів JSON API
та машинні значення станів залишаються незмінними.

## Межа розгортання {#deployment-boundary}

Waterline має два backend adapters:

- Embedded mode працює в Laravel host і читає durable-стан пакета
  workflow всередині процесу.
- Service mode запускає опублікований образ Waterline та читає один
  namespace окремого Server через `durable-workflow/sdk` і публічний API Server.

Обидва adapters надають маршрути Waterline цієї сторінки.
Service mode перетворює їх на відповідні контракти Server:

| Група маршрутів Waterline | Контракт окремого Server у service mode |
| --- | --- |
| `GET /waterline/api/v2/health` | Стан Server, реєстрація workers та огляд task queues. |
| `GET /waterline/api/stats` | Операторський dashboard і snapshot метрик у межах namespace. |
| Списки flows, деталі вибраного run та експорт історії | Список workflows, деталі, runs, історія та діагностика з [довідника Server API](./polyglot/server-api-reference.md). |
| Дії signal, update, query, cancel, terminate, repair та archive | Відповідні контракти команд workflow та repair Server. |
| Маршрути під `/waterline/api/v2/schedules` | Контракти списку, деталей, історії та зміни schedule Server. |

Після розгортання Waterline API Server, CLI та SDK залишаються доступними
безпосередньо. Не припускайте видимості між режимами чи namespaces:
runs залишаються доступними для читання та дій у власних runtime і namespace.
[Режими розгортання](./polyglot/deployment-modes.md) визначають
цю спільну продуктову межу.

## Базовий шлях та область {#base-path-and-scope}

Waterline використовує налаштований базовий шлях Waterline
Laravel-застосунку. Приклади нижче використовують `/waterline`.
Якщо ваш застосунок публікує Waterline з іншим префіксом,
зберігайте ті самі суфікси `/api/...`.

Коли налаштовано `WATERLINE_NAMESPACE`, кожен маршрут списку, деталей,
schedule та операторської дії обмежений namespace.
Читання та команди інших namespaces повертають not-found,
не розкриваючи стан workflow іншого namespace.

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## Автентифікація {#authentication}

Кожен controller UI та JSON API Waterline проходить перевірку доступу
Waterline. У embedded mode Laravel host визначає цю перевірку та вирішує,
які guards, route middleware, gates, policies, SSO/OIDC/SAML sessions,
групи каталогу, service tokens і rate limits діють.

Поточна група JSON operator API виключає CSRF middleware Laravel,
щоб host міг послідовно застосувати межу session або service token
і до читання, і до команд. Host відповідає за автентифікацію цих запитів
та документування додаткового CSRF-захисту browser sessions навколо API.

Самодостатній service image не має користувачів host-застосунку.
Перед установленням `WATERLINE_ALLOW_UNAUTHENTICATED=true` розмістіть його
за reverse proxy з автентифікацією або на приватному інтерфейсі.
Це налаштування передає вхідну перевірку Waterline навколишньому розгортанню.
Окремо `WATERLINE_SERVER_TOKEN` автентифікує виклики PHP SDK Waterline
до окремого Server. Ніколи не передавайте ці облікові дані Server браузеру.

`WATERLINE_ACCESS_MODE=read_only` локально блокує маршрути зміни Waterline.
`operator` дозволяє їх, але підключений Server усе одно застосовує
власну роль токена та авторизацію namespace. Приклад розгортання
й обидві межі автентифікації наведено в
[моніторингу](./monitoring.md#waterline-service).

## Dashboard та стан {#dashboard-and-health}

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | Зведення dashboard, лічильники backlog, repair policy, операторські метрики та тренди fleet. |
| `GET` | `/waterline/api/v2/health` | Стан пакета/runtime Waterline та готовність джерела даних v2. |

`/waterline/api/stats` є зведенням dashboard. Використовуйте
`operator_metrics` як JSON-діагностику Waterline, а не як поверхню
Prometheus scrape. Для latency runtime та власної телеметрії застосунку
використовуйте метрики SDK worker.

[Операторські межі експлуатації](./operator-operating-envelope.md)
визначають читання цієї діагностики під час rollout і реагування
на інциденти. Зокрема:

| Група полів | Значення |
| --- | --- |
| `operator_metrics.backlog.*` | Кількість durable-роботи, готової до виконання, відкладеної, leased, нездорової, з потребою repair, невдалим claim чи блокуванням сумісності, та загальні для fleet факти потоку черги `tasks_added_last_minute` і `tasks_dispatched_last_minute`. |
| `operator_metrics.matching_role.*` | Локальний контракт matching/dispatch вузла для процесу, що обслуговує запит: `queue_wake_enabled`, форма розгортання `shape`, `task_dispatch_mode`, закріплені `partition_primitives` і поточний `backpressure_model`. |
| `operator_metrics.repair.*` | Обсяг проходу repair loop, включно з вибраними candidates, їхнім віком і тиском scan. |
| `operator_metrics.projections.*` | Кількість drift projections для зведень runs, waits, timelines, timers та lineage. |
| `operator_metrics.command_contracts.*` | Старі snapshots контрактів WorkflowStarted, які ще потребують backfill. |
| `operator_metrics.history.*` | Тиск розміру та кількості подій історії, а також рекомендації continue-as-new. |
| `queue_visibility.available`, `queue_visibility.reason` | Доступність огляду черг у межах namespace на цьому host-застосунку та причина його відсутності. |
| `queue_visibility.task_queues[].stats.*` | Backlog окремої черги, його вік, кількість pollers, готові та leased workflow/activity tasks і факти потоку `tasks_added_last_minute` / `tasks_dispatched_last_minute` кожної черги. |
| `queue_visibility.task_queues[].repair.*` | Тиск repair окремої черги: candidates, помилки dispatch, спливлі leases, прострочені dispatch та найстарший вік кожної умови. |
| `coordination_alerts[]` | Зведені warnings і errors з health checks та ризиків огляду черг, зокрема backlog без pollers, застарілі pollers чи старі repair candidates. |
| `checks[]`, `categories.*` | Блокувальні та рекомендаційні health checks v2 з `category = correctness | acceleration` кожної перевірки та зведеннями категорій Waterline для поверхні workers. |
| `engine_source`, `readiness_contract` | Чи Waterline активно використовує операторський bridge v2 та який контракт readiness визначає цей стан. |

Поля потоку черги показують, чи durable-робота надходить швидше,
ніж система виконує dispatch. `tasks_added_last_minute` рахує окремі
рядки durable tasks, створені за останні 60 секунд,
а `tasks_dispatched_last_minute` — окремі рядки durable tasks,
чий останній успішний dispatch відбувся в тому самому вікні.

Використовуйте загальні значення потоку черги разом із маршрутами
огляду task queue Server. Waterline показує, чи durable inflow випереджає
dispatch, а `/api/task-queues` та `/api/task-queues/{taskQueue}` —
чи навантажена черга є `saturated`, навмисно `throttled`,
`no_active_workers` або має іншу нестачу здорових pollers чи slots.

`GET /waterline/api/v2/health` надає ті самі дані окремих черг
у Waterline. Scripts і dashboards для поточного стану черг одного
namespace мають читати `queue_visibility.task_queues[]` для статистики
кожної черги та `coordination_alerts[]` для зведення умов черги
або health checks, які зараз потребують уваги оператора.

Поля `matching_role` показують, яку форму matching зараз надає цей вузол.
`shape` розрізняє `in_worker` і `dedicated`, `partition_primitives`
закріплює осі маршрутизації `connection`/`queue`/`compatibility`/`namespace`,
а `backpressure_model` зараз повідомляє `lease_ownership`.
Цей блок описує локальний процес. Під час rollout зі змішаними формами
порівнюйте його між вузлами перед висновком, що різниця backlog чи polls
означає проблему worker.

`GET /waterline/api/v2/health` використовує той самий поділ:
`error` блокує, `warning` є рекомендаційним,
а `ok` означає готовність поточного операторського bridge v2.

## Списки {#list-views}

Списки групуються за durable-статусом:

| Метод | Шлях | Група |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | Відкриті або активно заблоковані runs. |
| `GET` | `/waterline/api/flows/completed` | Успішно закриті runs, включно з продовженими runs із `closed_reason = continued`. |
| `GET` | `/waterline/api/flows/failed` | Runs із помилкою. |
| `GET` | `/waterline/api/flows/cancelled` | Скасовані runs. |
| `GET` | `/waterline/api/flows/terminated` | Runs після terminate. |

Рядки списків є стислими операторськими зведеннями. Сталі поля включають
ідентичність workflow (`id`, `instance_id`, `run_id`, `workflow_type`),
стан (`status`, `closed_reason`, `archived_at`), час,
`history_event_count`, `history_size_bytes`, `continue_as_new_recommended`
та позначки repair/actionability, зокрема `repair_blocked`.

## Деталі вибраного run {#selected-run-detail}

Waterline має два режими адресації:

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | Поточний вибраний run екземпляра workflow. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | Явно вибраний run. |
| `GET` | `/waterline/api/flows/{id}` | Legacy-пошук деталей за ID рядка Waterline або run. |

Деталі вибраного run є авторитетним JSON-контрактом операторських екранів.
Вони містять durable-стан та похідну діагностику для:

| Група полів | Значення |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | Поточний та історичний стан очікування, відновлений передусім із типізованої історії. |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | Рядки життєвого циклу команд та цілі контракту workflow, які можна завантажити. |
| `timeline` | Упорядковані durable-події та діагностичні записи. |
| `exceptions`, `logs` | Факти помилок і контекст replay/налагодження. |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | Доступні дії UI та автоматизації для вибраного run. |
| `actionability` | Версійований контракт repair та даних, описаний нижче. |

Автоматизація має віддавати перевагу деталям вибраного run перед screenshots.
Screenshot показує те, що бачив оператор. Деталі вибраного run пояснюють,
чому workflow можна чи не можна repair, query, cancel, archive або replay.

## Експорт історії {#history-export}

Exports історії є наборами для replay/налагодження. Вони навмисно містять
збережені payload workflow, команд, activities, updates, tasks, помилок
та історії, щоб розробник міг відтворити або архівувати вибраний run.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | Експорт поточного вибраного run екземпляра. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | Експорт явно вибраного run. |
| `GET` | `/waterline/api/flows/{id}/history-export` | Legacy-експорт деталей за ID рядка Waterline або run. |

Якщо export може вийти за межі захищеного середовища, спочатку налаштуйте
redactor експорту історії workflow. Подальші інструменти мають зберігати
metadata `redaction` export, щоб перевіряльник міг визначити
політику обробки артефакту.

## Контракт actionability {#actionability-contract}

Waterline додає версійований контракт actionability до рядків списків,
відповідей деталей вибраного run, записів timeline та exports історії:

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

Ідентифікатор контракту —
`actionability_contract.schema = waterline.actionability`
із `actionability_contract.version = 1`.

`actionability` рівня run визначає, чи можна repair вибраний run:

| Поле | Значення |
| --- | --- |
| `repair_state` | Одне зі значень `repairable`, `blocked`, `not_needed` або `unknown`. |
| `repairable` | Булеве скорочення для `repair_state = repairable`. |
| `blocked_reason` | Сталий код reason, коли `repair_state = blocked`. |
| `status_bucket` | Група Waterline, яка визначила рішення рівня run. |
| `closed_reason` | Durable-причина закриття закритого run. |
| `task_problem` | Чи Waterline виявив проблему task на run. |
| `diagnostic_only_evidence` | True, коли принаймні один рядок є інформаційним і не є джерелом resume. |

Рядки даних у `activities`, `waits`, `timers`, `exceptions`, `logs`
та записах timeline/export можуть мати власний блок `actionability`:

| Поле | Значення |
| --- | --- |
| `state` | `actionable`, коли рядок є дійсним джерелом repair, інакше `diagnostic_only`. |
| `repair_source` | True лише для рядків із джерелом, яке дозволяє repair. |
| `diagnostic_only` | True, коли рядок не можна використовувати як джерело resume. |
| `history_authority` | Повноваження джерела, наприклад `typed_history`, `mutable_open_fallback`, `failure_row_fallback` чи `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Сталий код reason для непідтримуваної fallback-історії. |

Агенти й scripts мають приймати рішення repair/resume за
`actionability.repair_state`, `actionability.repairable`
та `actionability.repair_source` кожного рядка.
Рядок із `diagnostic_only = true` надає інформацію,
але не дозволяє replay чи resume.

## Дії оператора {#operator-actions}

Дії Waterline є durable-командами через контракт вибраного run.
Маршрути instance спрямовані на поточний run. Маршрути run явно
відхиляють застарілі цілі чи цілі іншого run.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | Виконання оголошеного query для поточного run. |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | Надсилання signal поточному run. |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | Подання update поточному run. |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | Dispatch проходу repair поточного run, коли це дозволяє actionability. |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | Запит скасування поточного run. |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | Terminate поточного run. |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | Архівування вибраного закритого run. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | Виконання query для явно вибраного run. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | Надсилання signal лише за умови, що вибраний run є поточним. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | Подання update лише за умови, що вибраний run є поточним. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | Repair явно вибраного run. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | Скасування лише за умови, що вибраний run є поточним. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | Terminate лише за умови, що вибраний run є поточним. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | Архівування вибраного закритого run. |

Signals, updates та queries приймають JSON `arguments`.
Некоректні аргументи повертають помилки перевірки окремих полів.
Блокування replay повертає `409 Conflict` зі сталим reason,
наприклад `workflow_definition_unavailable`, замість спроби
виконання без потрібних гарантій.

## Огляд update {#update-inspection}

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | Огляд рядка життєвого циклу update поточного run. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | Огляд рядка життєвого циклу update явного run. |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | Legacy-пошук деталей update. |

Використовуйте огляд update, коли UI або агент має пояснити,
чи update прийнято, застосовано, завершено, відхилено,
чи сплив час його очікування або його заблокувала сумісність replay.

## Schedules {#schedules}

Маршрути schedules Waterline надають огляд v2 та дії оператора:

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | Список schedules поточного namespace. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | Опис одного schedule. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | Призупинення майбутніх запусків. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | Відновлення призупиненого schedule. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | Негайний запуск. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | Backfill часового вікна. |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | Видалення schedule. |

Відповіді schedule показують action, статус, наступний запуск,
недавню історію запусків, overlap policy, note, memo та search attributes
для перевірки оператором.

## Збережені подання та налаштування {#saved-views-and-preferences}

Збережені подання та налаштування є операторською конфігурацією UI.
Вони не є історією workflow, але корисні для сталих runbooks:
команди можуть ділитися точними фільтрами й розташуванням таблиці,
які використовували під час інциденту.

| Метод | Шлях | Призначення |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | Список збережених операторських подань. |
| `POST` | `/waterline/api/saved-views` | Створення збереженого подання. |
| `GET` | `/waterline/api/saved-views/{view}` | Читання одного збереженого подання. |
| `PUT` | `/waterline/api/saved-views/{view}` | Зміна збереженого подання. |
| `DELETE` | `/waterline/api/saved-views/{view}` | Видалення збереженого подання. |
| `GET` | `/waterline/api/preferences/{surface}` | Читання налаштувань UI однієї поверхні. |
| `PUT` | `/waterline/api/preferences/{surface}` | Зміна налаштувань UI однієї поверхні. |

Не використовуйте назви збережених подань чи payload налаштувань
як факти durable workflow. Для підтвердження посилайтеся
на деталі вибраного run або export історії.

## Контракт помилок {#error-contract}

Waterline використовує звичайні HTTP status codes і JSON-деталі помилок:

| Статус | Значення |
| --- | --- |
| `400` | Некоректний запит або непідтримуваний payload дії. |
| `404` | Екземпляр workflow, run, update, schedule, збережене подання чи поверхню налаштувань не знайдено в поточному namespace. |
| `409` | Вибраний run не може виконати дію, часто через історичний чи закритий стан, блокування replay або недоступність визначення. |
| `422` | Перевірка не пройдена. Відповідь містить помилки окремих полів. |
| `500` | Неочікувана помилка застосунку. |

Автоматизація має розгалужуватися за статусом та сталими полями,
зокрема `blocked_reason`, `query_blocked_reason`, `outcome`,
`reason` і значеннями `actionability`. Не розбирайте текст
сповіщень чи назви кнопок як контракт.

## Дивіться також {#see-also}

- [Моніторинг](./monitoring.md)
- [Помилки та відновлення](./failures-and-recovery.md)
- [Queries](./features/queries.md)
- [Скасування та terminate](./features/cancel-and-terminate.md)
- [Контракт інструментів агента](./agent-tooling-contract.md)
