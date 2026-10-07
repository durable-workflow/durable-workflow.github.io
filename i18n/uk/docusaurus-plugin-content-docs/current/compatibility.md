---
sidebar_position: 17
title: Сумісність версій
description: Канонічний контракт сумісності та повноважень випуску публічних поверхонь Durable Workflow.
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - сумісність версій
  - джерело контракту сумісності
  - повноваження випуску
  - рівні стабільності
  - protocol manifests
  - версія площини керування
  - версія worker-протоколу
  - контракт стабільності поверхонь
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Сумісність версій {#version-compatibility}

Ця сторінка є **канонічним контрактом сумісності та повноважень випуску**
публічної платформи Durable Workflow. Вона є єдиним джерелом істини щодо:

- публічних поверхонь,
- рівня стабільності кожної публічної поверхні,
- змін, дозволених у patch, minor чи major release,
- належності поля до контракту або лише до діагностики,
- протоколу узгодження версій runtime, за яким клієнти відхиляють роботу,
  якщо Server оголошує поверхню, яку вони не підтримують.

Документи стабільності окремих пакетів, наприклад `docs/api-stability.md`
репозиторію `durable-workflow/workflow`, довідник CLI `dw` та сторінка
операторського API Waterline, **підпорядковані** цій сторінці.
Вони додають деталі пакетів за цими правилами. У разі розбіжності
діє ця сторінка, а розбіжність є помилкою документа пакета.

Той самий контракт публікується в машиночитаній формі, щоб SDK,
Server manifests та перевірки CI могли звірятися з одним джерелом істини:

- `surface_stability_contract` у тілі відповіді `GET /api/cluster/info`
  окремого Durable Workflow Server, schema
  `durable-workflow.v2.surface-stability.contract`, версія `5`.
- Закріплене дзеркало того самого manifest у цьому репозиторії:
  `static/compatibility-contract.json`.
- PHP-клас `Workflow\V2\Support\SurfaceStabilityContract`, який є
  внутрішньопроцесним джерелом, повторно експортованим Server.

Допуск каналів артефактів окремо визначає
[`/public-artifact-release-policy.json`](pathname:///public-artifact-release-policy.json).
Ця незалежно перевірена політика визначає, які канали 2.0 можуть стати
канонічним публічним набором версій.

Випуск, який змінює рівень стабільності, набір полів або правила
несумісних змін будь-якої наведеної нижче поверхні, має одночасно
оновити цю сторінку, JSON-дзеркало, PHP manifest та відповідні документи
стабільності пакетів. Docs CI перевіряє машиночитаний контракт,
політику фази випуску артефактів, metadata опублікованого Rust за наявності
та worker-protocol specs. Узгодження тексту цієї сторінки з manifest
залишається явним обов'язком перевірки випуску.

## Додатково: каталог специфікацій протоколів платформи {#companion-platform-protocol-spec-catalog}

Ця сторінка визначає, *які* поверхні публічні та *як* вони можуть змінюватися.
Каталог [специфікацій протоколів платформи](/docs/platform-protocol-specs)
визначає, *де* лежить нормативна машиночитана специфікація кожної поверхні,
*який формат* вона використовує: OpenAPI для HTTP API, JSON Schema для
сімейств об'єктів, AsyncAPI для семантики event streams. Він також визначає
*репозиторій-власник*, керовані сімейства об'єктів та публічний URL артефакту.
Автори SDK, агенти й оператори мають перевіряти відповідність каталогу specs,
а не залежати від повторного читання тексту чи деталей реалізації репозиторію.

Каталог оголошується як `platform_protocol_specs`
у `GET /api/cluster/info`.

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

`surface_family` кожного запису каталогу має існувати в контракті вище.
CI документації перевіряє каталог, отримує кожен публічний spec URL
і відхиляє поля повноважень, локальні для репозиторію.

<WorkerProtocolAuthorityRoles />

Кожен обов'язковий запис каталогу протоколів платформи має позначку
`published`. Запис invocable carrier залишається `in_progress`.
Кожен доступний запис безпосередньо посилається на публічний документ
OpenAPI, AsyncAPI чи JSON Schema. Schema
[`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes)
закріплює discovery-поверхню, через яку доступні всі інші записи каталогу.

## Рівні стабільності {#stability-levels}

Кожна публічна поверхня Durable Workflow має рівно один із цих рівнів
стабільності. Рівні задаються явно. Некласифікована поверхня не є публічною.

| Рівень | Значення | Коли дозволені несумісні зміни |
|-------|---------|-----------------------------------|
| `frozen` | Формат передачі чи збережена форма, які мають декодуватися однаково протягом життя workflow. Перейменування, видалення чи зміна призначення поля порушує протокол і не є minor-зміною. | Лише через **паралельний primitive** з новою назвою типу. Початкова форма назавжди залишається придатною до декодування. |
| `stable` | Публічна поверхня під гарантією semver платформи. Додаткові можливості випускаються в minor releases. | Лише major release. |
| `prerelease` | Функціонально завершена публічна поверхня, яка ще може змінюватися до відповідного випуску `1.0.0` / `2.0.0`. | У явно позначених prerelease-версіях із повідомленням у release notes. |
| `experimental` | Нестабільна публічна поверхня. Може змінюватися в будь-якому випуску, включно з patch. Користувач має явно погодитися, прочитавши experimental-прапорець поверхні. | Будь-який випуск із повідомленням у release notes. |

## Сімейства публічних поверхонь {#public-surface-families}

Це повний список сімейств публічних поверхонь. Додавання, видалення
або зміна класифікації сімейства вимагає зміни контракту:
підвищення версії `SurfaceStabilityContract`, оновлення цієї сторінки
та JSON-дзеркала в одному commit.

| Сімейство | Стабільність | Джерело manifest у `/api/cluster/info` | Область |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | HTTP API окремого Server: маршрути керування, namespaces, schedules, системи та `/api/health`, `/api/ready`, `/api/cluster/info`. Версію маршруту визначають `control_plane.request_contract` і `control_plane.response.contract`. Верхньорівнева `version` Server визначає збірку, а не сумісність клієнта. |
| `worker_protocol` | `stable` | `worker_protocol` | HTTP API worker plane для реєстрації зовнішніх SDK workers, polling, heartbeat, leases worker sessions, успішного завершення та помилок workflow, activity і query tasks. Включає runtime-контракти `worker_sessions` і `local_activities`, `external_execution_surface_contract`, `external_executor_config_contract`, `invocable_carrier_contract`, `external_task_input_contract` та `external_task_result_contract`. |
| `cli_json` | `stable` | не застосовується (дивіться довідник CLI) | Форми `--output=json` та `--output=jsonl`, які виводить `dw`. JSON exit codes і назви JSON-полів є durable-поверхнею. Людиночитана форма `--output=table` є документацією, а не контрактом. |
| `waterline_api` | `stable` | не застосовується (дивіться операторський API Waterline) | HTTP API спостереження Waterline під `/waterline/api/v2/*`, контракт engine source та JSON-форми dashboard. Waterline має відповідати major-версії пакета workflow. |
| `mcp_discovery_results` | `stable` | не застосовується (дивіться MCP workflows) | Поверхні Model Context Protocol `/mcp/*` та discovery-файли `llms.txt` / `llms-2.0.txt`. Назви MCP-інструментів, schemas параметрів і семантика `payload_preview_limit_bytes` є контрактом. Описи інструментів та discovery hints є діагностичними. |
| `official_sdks` | `stable` | `client_compatibility` | Офіційні SDK: PHP `durable-workflow/sdk`, Python `durable_workflow` та Rust `durable-workflow`. CLI `dw` є офіційним клієнтом команд. Публічну поверхню кожного SDK визначає його документ стабільності, підпорядкований цій сторінці. |
| `history_event_wire_formats` | `frozen` | не застосовується (закріплені форми, дивіться workflow `docs/api-stability.md`) | Збережена форма кожного рядка `workflow_history_events` та `workflow_schedule_history_events`. Після запису події workflow кожен майбутній SDK, який replay її, має декодувати той самий набір полів. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | Самі protocol manifests, опубліковані `GET /api/cluster/info`. Кожен вкладений manifest має власні `schema` і `version` та змінюється за власними правилами контракту. Ключі оболонки сталі. |

### Документи стабільності пакетів {#per-package-stability-documents}

Ці документи додають деталі пакетів за правилами цієї сторінки:

- `durable-workflow/workflow` (PHP) — [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md). Джерело контракту PHP API написання workflow, серверних класів `Support\*` та таблиць закріплених форматів передачі подій історії.
- `durable-workflow/sdk` (PHP) — [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md). Джерело контракту незалежного від фреймворку API віддаленого клієнта та worker з Packagist.
- `durable-workflow/server` — [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) та `docs/contracts/*`. Джерело контрактів запитів і відповідей окремого Server.
- CLI `dw` — [`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference). Джерело контракту форм JSON-виводу та exit codes.
- Python SDK — `README.md` у `durable-workflow/sdk-python`. Джерело контракту публічного API пакета `durable_workflow`.
- Rust SDK — `README.md` і `[package.metadata.durable-workflow]` у `durable-workflow/sdk-rust`. Джерело контракту публічного API crate `durable-workflow` та його оголошення сумісності.

## Правила випусків {#release-rules}

Ці правила діють для кожного сімейства публічних поверхонь вище.
Вони відтворені в JSON-дзеркалі під `release_rules`.

### Patch releases {#patch-releases}

Дозволено:
- виправлення помилок зі збереженням документованого контракту
- виправлення документації
- оновлення залежностей без зміни публічної поверхні
- зміни поверхонь з позначкою `experimental`

Заборонено:
- видалення або перейменування будь-якого поля, маршруту, команди чи класу `stable` або `frozen`
- звуження прийнятих вхідних даних маршруту чи команди `stable`
- зміна значення наявного поля `stable`

### Minor releases {#minor-releases}

Дозволено:
- додавання нових полів, маршрутів, команд чи класів до поверхні `stable`
- додавання необов'язкових параметрів із безпечними стандартними значеннями
- додавання capability flags до discovery-відповідей
- переведення поверхні `prerelease` чи `experimental` до `stable`

Заборонено:
- видалення або перейменування будь-якого поля, маршруту, команди чи класу `stable` або `frozen`
- зміна значення наявного поля `stable` або `frozen`

### Major releases {#major-releases}

Дозволено:
- видалення, перейменування або звуження поверхні `stable`
- підвищення потрібної `control_plane.version` чи `worker_protocol.version`
- припинення підтримки раніше підтримуваного діапазону версій SDK або CLI

Обов'язково:
- повідомити в release notes щонайменше за один minor release до major
- за можливості випустити нову поверхню поряд зі старою в попередньому
  minor release, щоб користувачі могли мігрувати до major
- до публікації описати шлях переходу в
  [настанові міграції](/docs/migration)

## Діагностичні та гарантовані поля {#diagnostic-only-versus-guaranteed-fields}

Кожне поле кожної поверхні `stable` чи `frozen` є **гарантованим**
або **лише діагностичним**. Для них діють різні правила зміни:

- **Гарантовані поля** є частиною документованого контракту.
  Виробники мають продовжувати надавати їх у документованій формі.
  Споживачі можуть покладатися на їхню присутність і значення.
  Видалення чи перейменування гарантованого поля поверхні `stable`
  є major-зміною.
- **Лише діагностичні поля** надаються для розбору проблем людиною,
  налагодження та спостереження. Їх можна додавати, перейменовувати
  або прибирати в будь-якому minor release. Усюди в документації
  вони мають бути позначені `diagnostic_only: true` або відповідником
  на сторінці. **Споживачі не можуть розбирати, зберігати чи використовувати
  діагностичні поля для production-логіки прийняття рішень.**

Старіші споживачі мають ігнорувати невідомі додаткові поля форм
`stable` чи `frozen` для forward compatibility. Невідомі обов'язкові
поля мають спричиняти відхилення. SDK та CLI публікують власну поведінку
forward compatibility в документах стабільності пакетів.

## Матриця сумісності {#compatibility-matrix}

Операційна матриця сумісності записує, які версії клієнтів перевірено
з якими protocol manifests Server. Компоненти перевіряють матрицю
під час роботи через `GET /api/cluster/info` та відхиляють роботу,
коли manifests не узгоджуються.

### Останній перевірений відтворюваний набір {#last-qualified-reproducible-tuple}

Таблиця є незмінним підтвердженням сумісності останнього спільно
перевіреного набору 2.0. Це запис для відтворення, а не окремі
твердження про найновіший пакет кожного реєстру:

| Компонент | Підтримувана версія | Ідентичність установлення |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Рушій Workflow | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Операторський Waterline | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

PyPI показує версію Python distribution як
`%%artifact.pythonRegistryVersion%%`. Документоване позначення встановлення
PEP 440 `%%artifact.productTrainVersion%%` вибирає той самий випуск.
Ця нормалізація не створює другої підтримуваної версії.

Перевірка координується для всього набору. Набір можна опублікувати
лише за спільного ідентифікатора джерела всіх семи записів, збігу обох
реєстрів Server та використання цих точних артефактів згенерованим
quickstart-контрактом. Оновлювач реєстрів відхиляє неузгоджений набір
замість поєднання незалежно найновіших пакетів. Його поточна дозволена
фаза випуску — `%%artifact.releasePhase%%`. Tags пізніших каналів реєстрів
залишаються недопустимими до перевірки та зміни політики випуску.

Попередні alpha- та beta-артефакти належать до історії випусків.
Вони не є альтернативами для початку роботи. Історія випусків зберігається.

Можливості цієї серії є базовими для 2.0, тому не мають матриці версій
першої появи функцій. Нові можливості проходять через звичайні сумісні
випуски: додаткова робота підвищує сумісну версію, а несумісна зміна
публічної поверхні чекає наступної major-версії.
Кожен стабільний компонент дотримується semantic versioning від цієї бази 2.0.

### Сумісність протоколів runtime {#runtime-protocol-compatibility}

Верхньорівневі версії пакетів вибирають підтримувану серію.
Protocol manifests runtime надають другу перевірку з відхиленням невідповідності:

| Клієнт | Серія продукту | Площина керування | Запит worker-протоколу |
|--------|---------------|---------------|-------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | не застосовується |
| PHP SDK | `%%artifact.phpSdkVersion%%` | `2` | `1.13` |
| Python SDK | `%%artifact.pythonSdkVersion%%` | `2` | `1.1` |
| Rust SDK | `%%artifact.rustSdkVersion%%` | `2` | `1.2` |

Поточний опублікований Server оголошує версію worker-протоколу,
наведену в таблиці повноважень вище. Він приймає заголовки запиту
з тією самою major-версією та minor не вище оголошеної, після чого
повертає оголошену версію. Відсутні або некоректні заголовки, інші major
та worker minor вище Server відхиляються.
CLI перевіряє `control_plane.version: "2"`.

Верхньорівнева `version` Server ідентифікує збірку.
Для узгодження протоколу клієнти мають використовувати manifests
`control_plane`, `worker_protocol`, `client_compatibility` та
`surface_stability_contract`, повернуті `GET /api/cluster/info`.

Workflow та Waterline мають використовувати сумісні випуски 2.x.
Після стабільного випуску межу сумісності визначають runtime discovery
та обмеження пакетів.

### Приклади перевірки runtime {#runtime-validation-examples}

SDK перевіряють discovery перед реєстрацією worker.
Несумісний Server дає явну помилку сумісності замість спроби використати
старий prerelease-шлях. Усі запити worker надсилають
`X-Durable-Workflow-Protocol-Version`, а запити площини керування —
`X-Durable-Workflow-Control-Plane-Version: 2`.

Перед просуванням серії продукту перевірка випуску має починатися
з чистого середовища, установлювати лише наведені вище опубліковані
артефакти та проходити conformance для PHP, Python і Rust.
Source checkouts і неопубліковані заміни не є підтвердженням
опублікованих артефактів.

Metadata стабільних пакетів та runtime discovery визначають підтримувану
межу сумісності 2.x. Перевірка випуску й далі спільно встановлює
публічні артефакти перед публікацією, а patch і minor releases
дотримуються наведених нижче правил semantic versioning.

### Розвиток випусків {#release-progression}

Patch releases зберігають документовані стабільні контракти.
Minor releases можуть додавати поля, маршрути, команди, класи
чи необов'язкові параметри з безпечними стандартними значеннями.
Несумісні стабільні зміни потребують major release та документованого
шляху міграції. Закріплені форми подій історії назавжди залишаються
придатними до декодування. Нова форма використовує паралельний primitive
замість зміни наявної події.

Кожен випуск має узгоджувати metadata пакетів, release notes,
команди встановлення та міжмовні приклади.

### Перевірка випуску {#release-review-checklist}

- Перевірте відповідність машиночитаного контракту сумісності
  manifest стабільності поверхонь Workflow.
- Перевірте кожну вибрану версію SDK з вибраним Server.
- Перевірте використання стабільного каналу в прикладах установлення.
- Перевірте точні версії SDK та протоколів у metadata пакета.
  Запишіть пізнішу перевірку Server у даних сумісності.
- Перевірте проходження conformance опублікованих артефактів
  у чистому середовищі для PHP, Python і Rust.
- Перевірте, що release notes описують доповнення після базового випуску
  та не подають старі prereleases як підтримувані варіанти.

## Дивіться також {#see-also}

- [Налаштування Server](/docs/polyglot/server) — розгортання окремого Server
- [Довідник Server API](/docs/polyglot/server-api-reference) — `GET /api/cluster/info` та protocol manifests
- [PHP SDK](/docs/polyglot/php) — PHP-клієнт і worker
- [Python SDK](/docs/polyglot/python) — Python-клієнт і worker
- [Rust SDK](/docs/polyglot/rust) — Rust-клієнт і worker
- [CLI](/docs/polyglot/cli) — інтерфейс командного рядка
- [Настанова міграції](/docs/migration) — перехід із v1 до v2
- [PHP workflow `docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md) — стабільність пакета PHP workflow
