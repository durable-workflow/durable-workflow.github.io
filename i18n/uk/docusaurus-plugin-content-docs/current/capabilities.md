---
sidebar_position: 2
title: Індекс можливостей 2.0
description: Індекс SDK сервісного режиму, вбудованого runtime, протоколів і можливостей Durable Workflow 2.0.
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - можливості Durable Workflow 2.0
  - SDK PHP Python Rust
  - матриця можливостей рушія workflow
  - мінімальні версії можливостей
---

# Індекс можливостей Durable Workflow 2.0 {#durable-workflow-20-capability-index}

Це індекс можливостей стабільної лінійки випусків Durable Workflow 2.0.

## Підтримуваний канал встановлення {#supported-installable-channel}

Точні ідентифікатори артефактів визначають реєстри пакетів і метадані
випусків, а не цей огляд можливостей.

| Інтерфейс | Підтримуваний канал | Роль в індексі |
| --- | --- | --- |
| CLI | 2.0 stable | Машиночитаний клієнт для операторів і діагностики. |
| PHP SDK | 2.0 stable | Офіційний клієнт сервісного режиму `durable-workflow/sdk` і віддалений worker workflow/activity для runtime простору імен Cloud або самостійно розгорнутого Server. |
| Вбудований рушій Laravel | 2.0 stable | Окремий режим `durable-workflow/workflow` усередині застосунку з власним середовищем написання workflow, рушієм збереження, чергами та replay. |
| Python SDK | 2.0 stable | Офіційний SDK детермінованих workflow/activity сервісного режиму та клієнт операцій і площини керування для runtime простору імен Cloud або самостійно розгорнутого Server. Потрібен Python 3.10 або новіший. |
| Rust SDK | 2.0 stable | Офіційний SDK детермінованих workflow/activity сервісного режиму, служба worker і клієнт площини керування для runtime простору імен Cloud або самостійно розгорнутого Server. Потрібен Rust 1.86 або новіший. |
| Server | 2.0 stable | Незалежний від мови runtime, реалізований на PHP, для самостійного розгортання протоколів площини керування й worker v2. |
| Waterline | 2.0 stable | Cloud містить Managed Waterline. Оператори власного Server окремо розгортають образ служби для простору імен Server. Вбудований Laravel встановлює пакет Composer і читає стан застосунку в його процесі. |

PHP, Python і Rust — три мови офіційних SDK сервісного режиму.
Кожен може працювати з підготовленим runtime простору імен Durable Workflow
Cloud або власним Server, якщо виявлення runtime повідомляє опубліковану
можливість. Вони використовують стабільні рядкові назви типів, одну модель
стійких команд та історії, версію площини керування `2`, основну версію
протоколу worker `1` і публічний конверт payload. Rust — повноцінний SDK
workflow: він виконує детермінований код workflow, activity та служби worker,
а не лише низькорівневі виклики протоколу. Python поєднує написання workflow
з клієнтськими операціями просторів імен, розкладів, worker, черг, історії,
відновлення та іншими операційними інтерфейсами.

Вбудований Laravel залишається окремим режимом PHP усередині застосунку.
Він не потрібен клієнтам або worker сервісного режиму PHP. Незалежний від
фреймворку PHP SDK має власні версії, окремі від вбудованого рушія Laravel.

Оберіть межу відповідальності за допомогою
[режимів розгортання](/docs/polyglot/deployment-modes/), а потім перейдіть до
[керованого runtime Cloud](/docs/polyglot/cloud-control-plane/) або
[самостійно розгорнутого Server](/docs/polyglot/server/). Наведені нижче
докази можливостей застосовуються лише там, де обраний runtime оголошує
потрібний контракт.

Поточна мінімальна версія власного Server оголошує протокол worker `1.13`.
Python використовує заявлену базову версію `1.1`, а Rust — `1.2` і потребує
додаткового інтерфейсу завдань query `1.8` для query через replay. Можливість
підключення клієнта визначає виявлення runtime, а не припущення за номером
патча Server. Дивіться [сумісність версій](/docs/compatibility/).

## Можливості й мінімальні версії SDK {#capability-and-sdk-floors}

«Сервісний режим» означає, що віддалений runtime належить Cloud або власному
Server. «Вбудований» означає, що runtime працює в процесі Laravel-застосунку.
Стовпець SDK явно фіксує відмінності. Порожнє або обмежене покриття SDK
не означає паритету.

| Можливість | Поточний контракт 2.0 і мінімальна офіційна підтримка | Явні докази 2.0 |
| --- | --- | --- |
| Workflow | Віддалені worker PHP, Python і Rust виконують детерміновані workflow. Вбудований Laravel використовує пакет Workflow. | [Написання workflow](/docs/defining-workflows/workflows/), [PHP SDK](/docs/polyglot/php/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Activity та служби | Вбудований рушій і всі три SDK сервісного режиму підтримують написання activity. Workflow та activity Rust виконуються в офіційних службах worker. Python і PHP також мають офіційні клієнти керування/служб. | [Activity](/docs/defining-workflows/activities/), [PHP SDK](/docs/polyglot/php/), [Виконання activity](/docs/features/activity-execution-model/), [Зовнішнє виконання](/docs/polyglot/external-execution/) |
| Signal | Стійка асинхронна зміна доступна для workflow PHP, Python і Rust за поточних мінімальних версій. | [Signal](/docs/features/signals/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Query | Підтримуються query лише для читання через replay. PHP, Python і Rust мають обробники/клієнти query. Завдання query Rust через replay потребують протоколу worker `1.8` або новішого. | [Query](/docs/features/queries/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Update | PHP, Python і Rust мають клієнтські інтерфейси update та обробники worker. Оголошені валідатори Python синхронно перевіряють update перед прийняттям, якщо виявлення Server оголошує саме цей контракт: прийняття йде після схвалення, а відхилення, втрата worker, тайм-аут і відсічене завершення явно завершуються помилкою. PHP і Rust не підтримують написання валідаторів і не оголошують їх. | [Update](/docs/features/updates/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/#workflow-updates) |
| Timer | Стійкі timer сервісного runtime відтворюються через replay у PHP, Python і Rust. | [Timer](/docs/features/timers/), [Rust SDK](/docs/polyglot/rust/) |
| Повторні спроби | Стійка політика повторних спроб activity записується разом із командою. PHP, Python і Rust мають параметри повторних спроб activity за поточних мінімальних версій. | [Помилки й відновлення](/docs/failures-and-recovery/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Тайм-аути | Сервісні runtime Cloud і власного Server забезпечують сімейства тайм-аутів activity та workflow. Rust містить параметри activity й дедлайни запуску для виконання/окремого run workflow. | [Тайм-аути](/docs/features/timeouts/), [Rust SDK](/docs/polyglot/rust/) |
| Дочірні workflow | PHP, Python і Rust запускають стійкі дочірні workflow та очікують їх. Ідентичність типу між мовами є стабільним рядком, а payload дочірнього workflow використовує спільний конверт. | [Дочірні workflow](/docs/features/child-workflows/), [Python SDK](/docs/polyglot/python/) |
| Детермінована паралельна композиція | PHP `all()`/`parallel()`, вкладений list-yield Python і Rust `WorkflowContext::parallel()`/`join()` планують activity, дочірні workflow, timer, змішані та вкладені групи через звичайні команди. Усі три публікують спільні метадані ідентичності/шляху групи й відновлюють результати у вкладеному порядку входу. | [Конкурентність](/docs/features/concurrency/), [Python SDK](/docs/polyglot/python/#fan-out), [Rust SDK](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">Стійкий вибір першого завершення</span> | Вбудований PHP та сервісні SDK PHP, Python і Rust запускають незалежні activity, дочірні workflow, timer, очікування зовнішнього входу й учасників вкладених груп. Один переможець зберігається зі стабільною ідентичністю учасника. Інші продовжують роботу та зберігають дескриптори очікування/скасування. | [Конкурентність](/docs/features/concurrency/#first-completion-selection), [Python SDK](/docs/polyglot/python/#first-completion-selection), [Rust SDK](/docs/polyglot/rust/#durable-first-completion-selection) |
| Компенсація saga | Помічники Saga PHP, Python `WorkflowContext.saga()` і Rust `WorkflowContext::saga()` реєструють стійкі компенсації після успіху прямої дії та за замовчуванням виконують їх послідовно у зворотному порядку. Python і Rust зупиняються після першої помилки компенсації та зберігають початкову помилку разом із помилками компенсації. PHP додатково має політики паралельного виконання й продовження після помилки за явним увімкненням. | [Saga](/docs/features/sagas/), [Python SDK](/docs/polyglot/python/#saga-compensation), [Rust SDK](/docs/polyglot/rust/#saga-compensation) |
| Скасування | Вбудований Laravel та сервісні PHP, Python і Rust підтримують запити кооперативного скасування з однією кореневою ідентичністю, незмінним дедлайном і обмеженим часом очищення на явно увімкнених worker. Негайне термінальне скасування залишається доступним із безпечним вибором run і типізованими результатами. | [Скасування й припинення](/docs/features/cancel-and-terminate/), [Скасування в сервісному режимі](/docs/polyglot/cancellation/), [Rust SDK](/docs/polyglot/rust/) |
| Припинення | Припинення негайно закриває run з окремим термінальним результатом. Воно доступне в сервісних runtime Cloud і власного Server, CLI, інтерфейсах керування PHP, Python і Rust. | [Скасування й припинення](/docs/features/cancel-and-terminate/), [Server API](/docs/polyglot/server-api-reference/) |
| Side effect | PHP, Python і Rust записують недетерміновані значення рівно один раз і декодують записане значення під час replay. | [Side effect](/docs/features/side-effects/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Workflow Streams | PHP, Python і Rust мають типізовані операції списку, опису, підписки/відновлення зі зміщення, додавання, закриття й помилки для вихідних потоків окремого run, якими володіє Server. Усі три підтримують безпечні для replay emits зі стійкої ідентичності команди. Python розв’язує зовнішні payload через налаштований драйвер сховища. PHP і Rust зберігають непрозорі посилання. | [Workflow Streams](/docs/polyglot/workflow-streams/), [точна матриця SDK](/workflow-stream-capabilities.json), [сценарії runtime](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| Маркери версій | PHP, Python і Rust мають стійкі маркери версій для сумісної еволюції коду. | [Версіонування](/docs/features/versioning/), [Python SDK](/docs/polyglot/python/), [Rust SDK](/docs/polyglot/rust/) |
| Детермінований replay | Worker workflow PHP, Python і Rust відновлюють рішення зі стійкої історії та повідомляють типізовану недетермінованість замість повторного виконання зовнішньої роботи. | [Гарантії виконання](/docs/constraints/execution-guarantees/), [Відповідність платформи](/docs/platform-conformance/), [Rust SDK](/docs/polyglot/rust/) |
| Розклади | Сервісні runtime Cloud і власного Server володіють стійкими розкладами. PHP, Python і CLI мають операції розкладів. Rust не заявляє API керування розкладами. | [Розклади](/docs/features/schedules/), [Довідник CLI](/docs/polyglot/cli-reference/), [Python SDK](/docs/polyglot/python/) |
| Простори імен | Сервісні runtime обмежені простором імен. Клієнти PHP/Python і CLI керують просторами імен там, де обраний runtime має цю операцію. Worker/клієнти Rust працюють із простором імен, але не заявляють його адміністрування за поточної мінімальної версії. | [Простори імен, автентифікація та worker](/docs/polyglot/namespace-auth-workers/), [Server API](/docs/polyglot/server-api-reference/) |
| Пошукові атрибути | Сервісні runtime Cloud і власного Server індексують типізовані пошукові атрибути. PHP і Python мають інтерфейси написання/керування. CLI й API оператора мають структуроване виявлення та фільтрування. | [Пошукові атрибути](/docs/features/search-attributes/), [Python SDK](/docs/polyglot/python/) |
| Сумісність worker | SDK реєструють runtime, версію SDK, build ID, підтримувані типи, версію протоколу й місткість. Server публікує прийняті версії та факти маршрутизації. | [Сумісність](/docs/compatibility/), [Сумісність і маршрутизація worker](/docs/polyglot/worker-compatibility-routing/) |
| Локальні activity | Доступні у вбудованому Laravel, сервісних SDK PHP і Python та Rust SDK 3.1.0 за явного увімкнення worker. | [Вбудоване виконання activity](/docs/features/activity-execution-model/), [Матриця підтримки сервісного режиму](/docs/polyglot/portable-worker-affinity/) |
| Сеанси worker | Доступні у вбудованому Laravel, сервісних SDK PHP та Python і Rust SDK 3.2.0 за явного увімкнення worker. | [Сеанси worker](/docs/features/worker-sessions/), [Матриця підтримки сервісного режиму](/docs/polyglot/portable-worker-affinity/) |
| Sticky execution | Доступне у вбудованому Laravel і сервісному PHP SDK. Python і Rust не підтримуються. | [Sticky execution](/docs/features/sticky-execution/), [Матриця підтримки сервісного режиму](/docs/polyglot/portable-worker-affinity/) |
| Сумісність кодеків | PHP, Python і Rust використовують публічний конверт `codec` + `blob` і одну фіксовану рекурсивну схему Avro Value. Іменовані гілки зберігають відмінності цілих чисел і double, тексту й bytes, boolean і цілих чисел, списків і мап. | [Протокол Avro Value](/docs/polyglot/avro-value-protocol/), [Протокол worker](/docs/polyglot/worker-protocol/), [Rust SDK](/docs/polyglot/rust/) |
| Діагностика | Сервісні runtime та CLI публікують факти версій, протоколів, worker, черг завдань, replay, історії, типізованих помилок і відновлення як JSON. Managed Waterline, окрема власна служба або вбудований пакет показують докази з runtime, що ними володіє. | [Моніторинг](/docs/monitoring/), [Довідник CLI](/docs/polyglot/cli-reference/), [API оператора Waterline](/docs/waterline-operator-api/) |
| Інструменти агентів | Виявити -> Змінити -> Виконати -> Діагностувати -> Відновити доступно через публічні маніфести, схеми, HTTP-операції, JSON CLI, клієнти SDK, типізовану історію/діагностику та безпечні зміни. MCP — один необов’язковий інтерфейс, а не визначення цього контракту. | [Контракт інструментів агентів](/docs/agent-tooling-contract/), [Операційний цикл агента](/docs/agent-operating-loop/) |

## Межа сумісності payload {#payload-interoperability-boundary}

Міжмовні виклики workflow та activity не передають серіалізовані об’єкти
PHP, pickle Python або типи реалізації Rust. Вони передають зареєстровані
рядкові назви типів і публічний конверт payload. З `avro` кожен офіційний
SDK використовує офіційну реалізацію своєї мови й ту саму фіксовану схему
Value. Декодовані мапи, списки, рядки, bytes, цілі числа, double, boolean
та null зберігають свої примітивні типи. Мовний клас відновлюється лише
в SDK, якому він належить.

Цей контракт діє для входу й результату workflow, дочірніх workflow,
входу й результату activity, signal, query, update та зовнішнього виконання.
Перед допуском worker розгортання все одно має перевірити кодеки,
оголошені `GET /api/cluster/info`.

## Межа випуску й зрілості {#release-and-maturity-boundary}

Наведені тут контракти платформи є стабільним публічним інтерфейсом
продукту 2.0. Для стислого рішення про відповідність задачі скористайтеся
[оцінюванням для AI-агентів](/docs/ai-agent-workflow-engine/).
