---
sidebar_position: 26
title: Переносима спорідненість worker
description: Підтримка й обмеження спорідненості worker сервісного режиму в SDK PHP, Python і Rust.
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# Переносима спорідненість worker {#portable-worker-affinity}

Worker сервісного режиму реалізують наведені нижче можливості через
протокол worker Server. Доступність визначають версії SDK та налаштування
worker.

Локальні activity, сеанси worker і sticky execution мають спільне правило
переносимості: сервісний worker має оголосити кожну можливість підтримуваною
або явно відхиленою. Для цих оголошень мінімальна версія протоколу — `1.18`.
Server відхиляє плоску можливість маршрутизації, якщо структурований
маніфест worker не позначає ту саму можливість як підтримувану.

## Підтримка SDK {#sdk-support}

| Worker SDK | Локальні activity | Сеанси worker | Sticky execution |
| --- | --- | --- | --- |
| PHP | Підтримується | Підтримується | Підтримується |
| Python | Підтримується з 2.2.0 | Підтримується з 2.3.0 | Підтримується з 2.5.0, якщо `sticky_cache_capacity` більше нуля |
| Rust | Підтримується з 3.1.0 із `Worker::local_activities(true)` | Підтримується з 3.2.0 із `Worker::worker_sessions(true)` | Підтримується з 3.4.0 із `Worker::sticky_cache(...)` |

Worker оголошують лише реалізовані й увімкнені для свого профілю
можливості. Локальні activity, сеанси та sticky execution Rust, а також sticky execution у
Python потребують явного увімкнення. Старі версії SDK відхиляють нереалізовані
можливості. Звичайні workflow та activity
в черзі використовують повний replay стійкої історії без цих оптимізацій.

## Запис локальної activity {#local-activity-recording}

Worker PHP, Python і Rust із явно увімкненою підтримкою виконують локальну
activity усередині worker workflow. Завершення завдання workflow містить
аргументи, результати спроб, налаштування повторних спроб і тайм-аутів,
поступ heartbeat та термінальний результат або помилку. Server атомарно
записує цю послідовність як звичайну історію activity з позначкою
`execution_mode=local`.

Replay читає записану термінальну подію activity й не викликає локальний
обробник повторно. Втрата worker до фіксації завершення Server може
призвести до повторного виконання обробника, тому зовнішні ефекти мають
бути ідемпотентними.

Звичайні worker PHP виконують синхронний обробник безпосередньо.
Скасування та спливання тайм-аутів heartbeat, окремої спроби й загального
виконання спостерігаються перед спробою, у `ActivityContext::heartbeat()`
або після повернення обробника. Ці обробники мають залишатися короткими
й розділяти блокувальну роботу безпечними межами heartbeat.

Async callback Python і Rust мають передавати керування runtime мови.
Rust поновлює точну оренду завдання workflow незалежно від heartbeat
застосунку, припиняє callback після тайм-ауту, втрати повноважень чи
зупинки worker та записує обмежені звіти спроб і heartbeat. Дивіться
[приклад локальної activity Rust](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
і [довідник API](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

Worker PHP з увімкненим
[кооперативним скасуванням](/docs/polyglot/cancellation) використовують
протокол 1.20 та процеси callback під наглядом для підготовлених локальних
activity. Безпосереднє локальне виконання Rust використовує окремий
звичайний профіль worker і не поєднується з підготовленим кооперативним
наглядом локальних activity. Блокувальні callback потребують нагляду
процесів для гарантії фізичної зупинки.

## Життєвий цикл сеансу worker {#worker-session-lifecycle}

SDK PHP, Python і Rust мають типізовані параметри сеансів та операції
створення, використання, поновлення й закриття. Параметри містять вимоги,
чергу, тривалість оренди, загальний TTL, максимальну кількість одночасних
activity та політику повторного отримання. Під час коректної зупинки
worker закриває утримувані сеанси.

Якщо утримувач зникає, його оренда й резервування конкурентності спливають.
Новий утримувач може отримати сеанс за збігу вимог, але має відновити
локальні ресурси worker до першого використання activity. Ідентичність
сеансу ніколи не робить пам’ять процесу стійкою.

Повторне отримання зберігає початковий абсолютний TTL сеансу. Поновлення
продовжує повноваження утримувача без продовження цього TTL. Використовуйте
Server 2.5.1 або новіший для збереження початкового TTL та записаної
маршрутизації сеансу під час холодного replay. Дивіться
[приклад сеансу Rust](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
і [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html).

## Sticky execution і холодний replay {#sticky-execution-and-cold-replay}

Кеші PHP, Python і Rust обмежені й мають ключ із точних ID workflow, ID run та
build ID worker. Вони повідомляють `hit`, `miss`, `eviction` і `forced_cold_replay`.
Спливання, витіснення, заміна worker, втрата утримувача або невідповідність
збірки відкидає оптимізацію й відтворює повну стійку історію.

Використовуйте Python SDK 2.5.0 із Server 2.5.10 або новішим. Типово кеш
вимкнений. Увімкніть його через `sticky_cache_capacity` і задайте для worker
ліміт байтів збереженої історії та TTL. Кеш зберігає закодовану стійку історію
й може повторно використовувати перевірені курсори сторінок, щоб зменшити
повторне завантаження. Передбачте додаткову пам'ять для декодування й
детермінованого replay. Дивіться
[посібник Python sticky execution і готовий приклад](https://python.durable-workflow.com/guides/sticky-execution/).

Rust SDK 3.4.0 підтримує ту саму базову версію опублікованого Server.
Увімкніть кеш через `Worker::sticky_cache(StickyCacheOptions::new(...))`
і задайте ліміт байтів закодованої історії та TTL. Кожен replay декодує
новий знімок. Повторно використані курсори історії перевіряються за поточною
орендою завдання та стійкою історією перед зарахуванням влучання в кеш.
Кеш зберігає історію, а не живі об’єкти workflow чи ресурси сеансів. Дивіться
[StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html)
та [виконуваний приклад Rust](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs).

Server 2.5.10 зберігає повний replay для PHP SDK до 2.2.0. Використовуйте
PHP SDK 2.2.0 або новіший для підказок replay історій, що починаються з StartAccepted.

Sticky routing є оптимізацією спорідненості. Примусовий холодний replay
є діагностичним доказом недоступності оптимізації, а не помилкою
коректності workflow. Код workflow має залишатися детермінованим із
порожнім кешем.

## Безпечні типові значення й поступові оновлення worker {#safe-defaults-and-rolling-fleets}

Звичайні workflow не потребують налаштувань сеансу чи sticky execution.
Набори worker зі змішаними версіями відхиляють несумісні дані на межі
протоколу: Server перевіряє узгоджену версію, плоску можливість,
структурований маніфест і точну ідентичність sticky cache перед прийняттям
даних завершення конкретної можливості.

Опублікований [маніфест між-SDK сценаріїв](/platform-conformance/portable-worker-affinity-runtime-scenarios.json)
охоплює правдивість маніфесту, replay локальних activity, втрату й повторне
отримання утримувача сеансу, sticky hits і витіснення, заміну worker,
примусовий холодний replay та workflow без додаткових налаштувань.

Для вбудованих реалізацій Laravel дивіться
[локальні activity](/docs/features/local-activities),
[сеанси worker](/docs/features/worker-sessions) і
[sticky execution](/docs/features/sticky-execution). Ці API належать
пакету Workflow. Для сервісних worker використовуйте API відповідного SDK.
