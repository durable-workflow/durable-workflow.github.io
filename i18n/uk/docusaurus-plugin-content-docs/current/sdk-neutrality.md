---
sidebar_position: 19
title: Незалежність від SDK
description: Постійний контракт незалежності від мови, який дозволяє реалізувати публічні інтерфейси Durable Workflow у майбутньому SDK TypeScript, Go, Java або .NET без зміни протоколу.
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - незалежність від SDK
  - незалежність від мови
  - нейтральність протоколу
  - нейтральність кодека
  - typescript sdk
  - go sdk
  - java sdk
  - dotnet sdk
  - python sdk
  - php workflow package
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Незалежність від SDK {#sdk-neutrality}

Ця сторінка пояснює загальноплатформний контракт незалежності від SDK.
Вона перелічує мінімальні правила нейтральності для кожного публічного
інтерфейсу Durable Workflow та постійну перевірку незалежності від мови,
яку рецензенти випусків застосовують до нових інтерфейсів Server,
Workflow, CLI, Waterline й MCP.

Архітектурний посібник upstream опублікований у
[`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md).
Машиночитане джерело істини опубліковане на цьому сайті як
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json) зі schema id
`durable-workflow.v2.sdk-neutrality.contract`. Джерелом вимог до протоколу
та набору SDK є JSON у пакеті Workflow Composer за адресою
`resources/sdk-neutrality-contract.json`. Публічна копія додає поточні
метадані розповсюдження пакетів із централізованого набору артефактів
документації. Окремий Durable Workflow Server повторно публікує базовий
маніфест пакета через `GET /api/cluster/info` у `sdk_neutrality_contract`.
Якщо ця сторінка суперечить опублікованому контракту JSON, пріоритет має
контракт JSON, а суперечність є помилкою документації.

Цей контракт спирається на
[сумісність версій](/docs/compatibility), що визначає, *які* інтерфейси
публічні та *як* вони можуть змінюватися, і каталог
[специфікацій протоколів платформи](/docs/platform-protocol-specs), що
визначає, *де* розміщена нормативна специфікація кожного інтерфейсу.
Він визначає дозволену *форму* цих специфікацій, щоб майбутній SDK поза
поточним набором PHP, Python і Rust міг реалізувати їх без зміни протоколу.

## Навіщо це потрібно {#why-this-exists}

Durable має три офіційні окремі SDK: пакет PHP `durable-workflow/sdk`,
пакет Python `durable_workflow` і crate Rust `durable-workflow`.
Окремий пакет PHP `durable-workflow/workflow` залишається вбудованим
рушієм Laravel, відповідальним за replay. Він не є PHP SDK, незалежним
від фреймворку. Створення чи підтримка широкого набору офіційних SDK
**не** є метою випуску. Попит на SDK для екосистем TypeScript, Go, Java
та .NET ще не доведено, а вартість підтримки широкого набору висока.

Контракт захищає від поступового вбудовування мовних припущень у публічні
контракти під цими SDK. Якщо створення SDK TypeScript або Go стане
виправданим, робота має полягати в написанні нового клієнта за опублікованим
протоколом передавання, без потреби переробляти протокол заради іншої мови.

## Область дії {#scope}

| Ключ області | Значення |
| --- | --- |
| `goal` | Зберігати нейтральність протоколу й контракту, щоб майбутній SDK TypeScript, Go, Java або .NET міг існувати без зміни протоколу. |
| `non_goal` | Постачати широкий набір офіційних SDK. Набір навмисно вузький і розширюється лише за виправданого попиту. |
| `present_priority` | Python зараз є найціннішим шляхом поза PHP для наявних користувачів і має пріоритет у перевірках паритету. |
| `future_posture` | TypeScript, Go, Java, .NET та інші мови залежать від попиту. Вони не мають зарезервованого випуску, але кожен публічний контракт повинен дозволяти написати SDK цими мовами без порушення протоколу передавання. |

## Політика набору офіційних SDK {#official-sdk-breadth-policy}

Набір офіційних SDK навмисно вузький:

| Мова | Статус | Опублікований пакет | Джерело вимог відповідності |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), учасники `sdk_php`, `php_sdk_client` і `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json), учасник `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), учасники `rust_sdk`, `rust_worker` і `rust_sdk_client` |
| TypeScript | `demand_driven` | Немає | Публічні контракти мають залишатися придатними до реалізації в TypeScript без зміни протоколу. |
| Go | `demand_driven` | Немає | Публічні контракти мають залишатися придатними до реалізації в Go без зміни протоколу. |
| Java | `demand_driven` | Немає | Публічні контракти мають залишатися придатними до реалізації в Java без зміни протоколу. |
| .NET | `demand_driven` | Немає | Публічні контракти мають залишатися придатними до реалізації в .NET без зміни протоколу. |

Контракт JSON перелічує точні `scenario_ids`, що складають покриття
`first_party.php_sdk`, `first_party.python_sdk` і `first_party.rust_sdk`.
Пакет Laravel відстежується окремо як `embedded_engines.php_workflow_engine`
із покриттям replay для учасника `workflow_php_runtime`. Споживачі можуть
знайти ці ідентифікатори безпосередньо в пов’язаних каталогах без клонування
репозиторію SDK або читання його тестів.

Новий офіційний SDK додається лише за таких умов:

1. Є задокументований попит користувачів, який наявні SDK не задовольняють.
2. Команда майбутніх супроводжувачів зобов’язується підтримувати SDK у
   перевірках відповідності, каталозі специфікацій протоколів і маніфесті
   джерел істини випуску.
3. Додавання SDK не потребує несумісних змін протоколу worker, площини
   керування, форматів подій історії або фікстур replay. Якщо потребує,
   виправлення потрібне протоколу.

## Правила нейтральності {#neutrality-rules}

Кожен публічний контракт Durable має відповідати всім семи правилам нижче.
Маніфест JSON визначає точні форми полів, а ці описи допомагають рецензентам.
Кожне правило маніфесту JSON містить `requirement`, `rationale`, рядок
`how_to_apply` і масив `authority`. Кожен запис джерела істини має стабільний
ID каталогу чи схеми й абсолютну URL-адресу опублікованого артефакту.

| Правило | Вимога |
| --- | --- |
| `protocol_neutrality` | Публічні RPC та події використовують форми HTTP+JSON або AsyncAPI, які може створювати й читати будь-який runtime із підтримкою HTTP. |
| `codec_neutrality` | Кожен стійкий payload, що перетинає публічну межу, оголошує `avro`. Інші публічні або специфічні для рушія кодеки v2 не пропонуються. |
| `error_shape_neutrality` | Публічні об’єкти помилок мають структурований конверт із `code`, `message` і необов’язковим `details`. Назви класів винятків PHP та Python призначені лише для діагностики. |
| `type_identity_neutrality` | Типи workflow, activity, дочірніх workflow і винятків визначаються стабільними рядковими назвами. FQCN класів і шляхи модулів є зручністю вводу SDK, а не контрактом. |
| `replay_fixture_neutrality` | Фікстури replay й еталонні пакети історії є JSON за опублікованими схемами `history_event_payloads` і `replay_bundle`. |
| `discovery_neutrality` | Кожен публічний інтерфейс доступний через `GET /api/cluster/info` та каталог `platform_protocol_specs`. |
| `documentation_neutrality` | Документація публічних контрактів описує форми через схеми, маршрути й семантику полів. Поведінка класів PHP та Python подається як приклад SDK, а не нормативний контракт. |

## Постійна перевірка незалежності від мови {#standing-language-agnosticism-audit}

Кожен новий інтерфейс Server, Workflow, CLI, Waterline або MCP має пройти
перевірку нейтральності перед переходом до `stable`. Це постійна вимога
рецензування PR випуску для кожної зміни сімейства інтерфейсів у її області.
До цієї області належать:

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

Список перевірки має вісім кроків. Сім відповідають правилам нейтральності
вище. Восьмий, **уявна реалізація майбутнього SDK**, просить рецензента
двома реченнями пояснити, як SDK TypeScript або Go використовуватиме новий
інтерфейс лише за опублікованим каталогом специфікацій і стандартними
інструментами HTTP+JSON. Якщо відповідь потребує офіційного SDK, інтерфейс
не є нейтральним. Перед переходом до стабільного статусу його слід змінити
або записати цю прогалину як відоме обмеження.

## На що спирається майбутній SDK {#what-a-future-sdk-relies-on}

Контракт визначає інтерфейси, які майбутній SDK повинен читати без вивчення
вихідного коду жодного офіційного SDK:

- **Протокол** — `durable-workflow.v2.control-plane-api`,
  `durable-workflow.v2.worker-protocol-api` і
  `durable-workflow.v2.worker-protocol-stream` в опублікованому
  [каталозі протоколів](https://durable-workflow.github.io/platform-protocol-specs.json).
- **Кодеки** — універсальний набір кодеків, описаний
  `durable-workflow.v2.worker-protocol-api` та оголошений схемою виявлення
  `durable-workflow.v2.cluster-info-envelope`.
- **Форма помилки** — конверт помилки протоколу worker і схема
  `durable-workflow.v2.repair-actionability-objects`.
- **Вхід replay** — JSON Schema `durable-workflow.v2.history-event-payloads`
  та `durable-workflow.v2.replay-bundle`, а також ID сценаріїв публічного
  каталогу [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json).
- **Виявлення** — `durable-workflow.v2.cluster-info-envelope` і сам каталог
  `durable-workflow.v2.platform-protocol-specs.catalog`.

Якщо кандидатний SDK певної мови не має доступу до одного з цих інтерфейсів,
його створення потребує змін протоколу й гарантія незалежності від мови
не виконується.

## Вимоги до випуску {#release-gates}

Випуск, що вводить нове сімейство публічних інтерфейсів або переводить
наявний інтерфейс із `prerelease` чи `experimental` до `stable`, має
зафіксувати результат перевірки в PR випуску. Розділ вимог маніфесту
перелічує конкретні перевірки:

- `audit_recorded` — опис PR випуску вказує застосовані кроки перевірки та
  містить посилання на запис каталогу специфікацій, фікстуру відповідності
  й запис виявлення нового інтерфейсу.
- `no_php_or_python_only_required_fields` — жодне гарантоване поле
  інтерфейсу `stable` не потребує кодека лише для PHP чи Python.
- `universal_codec_advertised` — узгодження протоколу worker оголошує
  рівно один універсальний кодек, `avro`.
- `fixture_schema_validated` — нові фікстури replay або еталонні пакети
  історії проходять перевірку за опублікованими JSON Schema.
- `discovery_entry_present` — нові публічні інтерфейси мають запис
  каталогу `platform_protocol_specs` із непорожніми `surface_family`,
  `owner_repo` та `format`.

Перевірки поділено між автоматизацією й людьми. CI випуску розв’язує кожну
URL-адресу джерела істини, ID протоколу/схеми та ID сценарію відповідності
в публічному контракті, звіряє область перевірки із сімействами стабільності
інтерфейсів і відхиляє локальні шляхи репозиторію або символи реалізації
як джерела істини. Рецензенти підтверджують перевірку незалежності від SDK
в кожному PR випуску, який додає чи підвищує статус публічного інтерфейсу,
і залишаються відповідальними за уявну реалізацію майбутнього SDK.

## Зміна контракту {#changing-this-contract}

Додавання правила нейтральності, посилення наявного правила, додавання
обов’язкового кроку чи сімейства інтерфейсів до області перевірки, а також
зміна політики набору офіційних SDK є зміною контракту. Підвищіть версію
маніфесту, оновіть архітектурний посібник і цю сторінку в тій самій зміні
та узгодьте доступний для використання контракт
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json).
Вилучення правила нейтральності або кроку перевірки є великою зміною.
