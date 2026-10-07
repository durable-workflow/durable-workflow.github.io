---
sidebar_position: 19
title: Набір перевірок відповідності платформи
description: Публічне авторитетне джерело маніфесту перевірок відповідності Durable Workflow v2, каталогу fixture, правил harness і вимог релізів.
tags:
  - compatibility
  - conformance
  - protocols
  - api-stability
keywords:
  - набір перевірок відповідності платформи
  - harness відповідності
  - fixture відповідності
  - сумісність durable workflow
  - platform-conformance-contract
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import platformConformanceContract from '@site/static/platform-conformance-contract.json';

# Набір перевірок відповідності платформи {#platform-conformance-suite}

Ця сторінка є публічним авторитетним джерелом **набору перевірок відповідності
платформи** Durable Workflow. Вона визначає матрицю цілей, каталог повторно
використовуваних fixture, контракт harness, правила успіху й помилок та вимоги
релізів для реалізацій, що заявляють сумісність із Durable Workflow v2.

<PublicAuthorityIdentity
  manifest={platformConformanceContract}
  manifestUrl="https://durable-workflow.github.io/platform-conformance-contract.json"
/>

Самостійний Server оголошує той самий маніфест у `GET /api/cluster/info`
під `platform_conformance_suite`. Каталог
[специфікацій протоколів платформи](/docs/platform-protocol-specs) називає
вкладений маніфест сімейством об'єктів `platform_conformance_suite_manifest`
у специфікації `cluster_info_envelope`.

Набір підпорядковується авторитетному джерелу
[сумісності версій](/docs/compatibility). Назви сімейств поверхонь і правила
стабільності мають відповідати контракту стабільності поверхонь.
Джерело сумісності визначає контракт, а ця сторінка визначає, як реалізація
доводить його виконання.

<WorkerProtocolAuthorityRoles />

## Публічні джерела відповідності {#public-conformance-authorities}

Набір реєструє стабільні машиночитані джерела за ідентичністю схеми й публічним
URL. Незалежний від фреймворку контракт PHP SDK опубліковано як
[`durable-workflow.v2.php-sdk-conformance-contract`](pathname:///platform-conformance/php-sdk-conformance.json).
Він визначає топологію випущених пакетів, вимоги сценаріїв і доказів та
публічні ідентифікатори runner і схеми результату для оцінювання
`durable-workflow/sdk` проти випущеного самостійного Server.

## Матриця цілей {#target-matrix}

**Ціль** відповідності є видом реалізації, що може заявляти сумісність Durable.
Реалізація може заявляти кілька цілей. Наприклад, самостійний Server заявляє
`standalone_server`, `worker_protocol_implementation` і `repair_actionability_surface`.

| Ціль | Обов'язкові сімейства поверхонь | Обов'язкові категорії fixture |
| --- | --- | --- |
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `embedded_engine` | `history_event_wire_formats` | `history_replay_bundles` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |
| `prerelease_release_candidate` | `server_api`, `official_sdks`, `cli_json`, `waterline_api`, `cluster_info_manifests` | `skew_refusal_matrix_contract`, `workflow_update_runtime_contract`, `principal_attribution_contract`, `prerelease_readiness_contract` |

Цілі стабільні. Додавання цілі, потрібної поверхні до наявної цілі чи категорії
fixture, переведення provisional категорії в обов'язкову, зміна `operations`
чи `pass_criteria` стабільного runtime сценарію, зміна його публічної вимоги
(`artifact_policy`, `common_result_evidence`, `required_matrix`,
`scenario_requirements`, `host_runner_contract`) або правил успіху/помилок
є зміною контракту набору й потребує збільшення версії маніфесту.

## Каталог fixture {#fixture-catalog}

Кожне стабільне джерело є публічним артефактом із трьома машиночитаними
прив'язками в каталозі: `artifact_id`, `resolver_url`, `sha256`.
ID артефактів runtime закінчуються версією набору, ID протоколів версією
каталогу протоколів платформи. Споживач отримує артефакт за `resolver_url`
і приймає байти лише за збігу SHA-256 із прив'язкою каталогу.

| Категорія | Статус | Джерело, доступне споживачу |
| --- | --- | --- |
| `control_plane_request_response` | `stable` | [`durable-workflow.v2.control-plane-api@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/control-plane-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-api@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-stream@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-stream.asyncapi.yaml) |
| `signal_query_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/signal_query_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/signal-query-runtime-scenarios.json) |
| `workflow_update_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/workflow_update_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/workflow-update-runtime-scenarios.json) |
| `search_attribute_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/search_attribute_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/search-attribute-runtime-scenarios.json) |
| `schedules_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/schedules_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/schedules-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/history_replay_bundles@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/replay-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.history-event-payloads@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/history-event-payloads.schema.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.replay-bundle@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/replay-bundle.schema.json) |
| `namespace_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/namespace_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/namespace-runtime-scenarios.json) |
| `child_workflow_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/child_workflow_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/child-workflow-runtime-scenarios.json) |
| `worker_versioning_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/worker_versioning_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/worker-versioning-runtime-scenarios.json) |
| `saga_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/saga_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/saga-runtime-scenarios.json) |
| `migration_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/migration_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/migration-runtime-scenarios.json) |
| `skew_refusal_matrix_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/skew_refusal_matrix_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/skew-refusal-matrix-scenarios.json) |
| `prerelease_readiness_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/prerelease_readiness_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/prerelease-readiness-scenarios.json) |
| `failure_repair_actionability` | `stable` | [`durable-workflow.v2.repair-actionability-objects@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/repair-actionability-objects.schema.json) |
| `cli_json_envelopes` | `stable` | [`durable-workflow.cli.output-schema-manifest@3`](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) |
| `principal_attribution_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/principal_attribution_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/principal-attribution-scenarios.json) |

Рядок набору зберігає ревізію схеми CLI v3 як незмінний історичний доказ.
Поточний контракт CLI є повним набором
[`durable-workflow.cli.output-schema-manifest@4`](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json),
який публікує поля payload лише Avro без зміни байтів v2 чи v3.

Поточна ціль протоколу worker у наборі використовує незалежні від життєвого
циклу байти протоколу 1.19, записані як
`durable-workflow.v2.worker-protocol-api@catalog-16` і
`durable-workflow.v2.worker-protocol-stream@catalog-16`. Ревізії 1.15–1.18
залишаються доступними за версіонованими URL із історії набору.
Ці fixture не заміняють неверсіонованого поточного джерела протоколу
опублікованого Server. Колишні байти з формулюванням beta доступні лише як
явно історична прив'язка
[`durable-workflow.v2.worker-protocol-api@catalog-16-beta-history`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/static/platform-protocol-specs/worker-protocol-api.openapi.yaml)
у маніфесті набору.

Заплановані категорії `waterline_observer_envelopes` і `mcp_discovery_envelopes`
залишаються `provisional`. Їхні шляхи вихідного коду є ненормативними
заповнювачами: harness не має отримувати їх як fixture чи використовувати
для заяви стабільної відповідності.

## Джерело релізу життєвого циклу workflow {#workflow-lifecycle-release-authority}

Точне джерело сценаріїв випущеного життєвого циклу workflow
[опубліковано як JSON](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json).
Воно фіксує вимоги життєвого циклу, перевірені на поточній межі релізів
опублікованих Server, PHP SDK і Rust SDK.

Шард PHP встановлює точний пакет `durable-workflow/sdk` із поточного кортежу
артефактів з Packagist у тимчасовий проєкт Composer. Він запускає окремі
процеси клієнта й worker PHP проти відповідного публічного образу Server,
фіксує походження дистрибутива Packagist і офіційного `apache/avro` та
має повідомити `local_product_source_checkouts_used=false`.

Шард Rust встановлює точний crate поточного кортежу артефактів із crates.io
та фіксує джерело реєстру й контрольну суму цього crate та офіційного
`apache-avro`. Доказ payload використовує опубліковану Avro обгортку SDK
на основі `apache-avro`. Власний кодек чи локальні вихідні коди продукту
не є прийнятним походженням.

Шард Rust має виконати й повідомити всі ці перевірки:

- `instance_cancel` і `instance_terminate` через публічні команди SDK.
- `selected_run_guard` і `stale_run_rejection`, щоб вибране виконання не
  плуталося з поточним виконанням екземпляра.
- `typed_failed`, `typed_cancelled`, `typed_terminated`, `typed_timed_out`
  як типізовані термінальні результати з ідентичністю workflow й виконання.
- `cancellation_heartbeat` і `late_activity_completion_refused`, щоб activity
  спостерігала скасування, а пізнє завершення не перезаписувало термінальний результат.
- `worker_restart_during_cancellation`, поки врегулювання скасування ще триває,
  щоб довести відсутність повторного отримання закритої activity новим worker.

Маніфест також вимагає точні версії артефактів і Server, ідентичність кластера,
походження інсталяції, ідентичності workflow, результати кожної перевірки,
сталі причини, контракт payload, топологію виконання, версію контракту Rust
шарда, ідентичність runner і статус завершення шарда. Відсутні, непідтримувані,
заблоковані runner чи неуспішні докази Rust не задовольняють категорію.

Категорія fixture обов'язкова для цілі лише якщо ціль її перелічує та статус
категорії не `provisional`. Provisional категорії дають рекомендаційні
попередження й стають обов'язковими лише після переведення в `stable`
у пізнішій версії набору.

Категорія `signal_query_runtime_contract` стабільна. Результат має фіксувати
конкретні опубліковані версії артефактів і називати кожен потрібний сценарій
як `pass`, `fail`, `unsupported`, `not_covered` чи `runner_blocked` із
посиланнями на знахідки. Заповнювачі чи невизначені версії на кшталт
`latest`, `current`, `head`, `<latest>`, `${VERSION}` чи `{{ version }}`
не проходять перевірку результату. Лише `pass` зараховується до успішної категорії:
`published_artifact_install_only`,
`python_worker_cli_and_sdk_baseline`, `php_worker_cli_and_sdk_baseline`,
`python_worker_php_facing_and_cli_clients`,
`php_worker_python_and_cli_clients`,
`rust_worker_rust_php_python_clients`, `python_worker_rust_client`,
`php_worker_rust_client`, `rust_query_error_and_immutability`,
`ordered_signal_delivery`,
`dedup_contract_observation`, `signal_during_replay`,
`query_during_replay`,
`rust_replayed_instance_state_query_after_cold_restart`,
`completed_run_signal_and_query`,
`unknown_signal_and_query_errors`,
`malformed_signal_and_query_payloads`, and
`waterline_operator_visibility`.

ID цих сценаріїв та критерії успіху опубліковані як машиночитаний маніфест
runtime сценаріїв у
[`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json).
Тести реалізації можуть перевіряти сценарії, але не є стабільним джерелом
fixture для зовнішніх harness.

Перевірки Rust встановлюють точну версію crate `durable-workflow`, оголошену
маніфестом runtime сценаріїв, із crates.io та фіксують джерело Cargo і
контрольні суми SDK та визначеної залежності `apache-avro`.
Транспорт query, отриманий зі знімка, оцінюють
`rust_worker_rust_php_python_clients` і `rust_query_error_and_immutability`.
Це не стан екземпляра workflow, відновлений replay. Окрема перевірка
`rust_replayed_instance_state_query_after_cold_restart` використовує
`register_replayed_workflow` і `register_replayed_query`, запускає новий
процес worker Rust після холодної зупинки, відновлює надійну історію й
порівнює активний, відновлений і завершений стан через виклики Rust, PHP і Python.
Успішні й помилкові послідовності query фіксують кількості історії й команд
workflow до першого успішного вимірюваного query та залишають їх незмінними.

Для `completed_run_signal_and_query` чисто завершене виконання з оголошеним
обробником query, придатним для replay, має повертати остаточний стан query
через кожну заявлену публічну поверхню. Сталі помилки термінального стану
допустимі лише для явно непідтримуваних станів чи недоступних обробників.
Загальна помилка completed-run не є успіхом для завершеного виконання з replay.

`workflow_update_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат має використовувати опубліковані артефакти, фіксувати версії Server,
CLI, Python SDK, PHP SDK і Waterline, зазначати використання локальних
вихідних кодів продукту та називати кожен сценарій update як `pass`, `fail`,
`unsupported`, `not_covered` чи `runner_blocked` із посиланнями на знахідки.
Успішні докази update мають перевіряти публічні поверхні площини керування,
історії, CLI/SDK й оператора. Виконання локальних вихідних кодів не зараховується.

Обов'язкові сценарії update охоплюють інсталяцію опублікованих артефактів,
видимість оголошеного контракту update, докази прийнятого update в площині
керування й історії, видимість активного чи очікувального стану оператором,
отримання завершеного результату, помилки й відмови, дублікати та ідемпотентність,
відмову невідомому update чи неправильному вводу, обгортку payload,
термінальний workflow, автентифікованого суб'єкта, паритет клієнта/worker PHP
і Python та операторську діагностику. Якщо SDK не підтримує update як основну
функцію, результат має містити типізований unsupported і конкретну знахідку
SDK замість мовчазного пропуску мови.

ID цих сценаріїв і критерії успіху опубліковані в
[`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json).
Поточне передавання host-runner навмисно має `runner_blocked`, доки
зареєстрований host runner не встановить зафіксовані опубліковані артефакти
й не виконає всю матрицю update workflow.

`search_attribute_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти та охоплює start/upsert PHP і Python,
query і помилки CLI, видимість у Waterline, обмін через кодек між мовами,
query рівності/діапазону/bool, граматику OR/NOT, належність keyword-list,
безпеку типів, розподіл затримки індексування, затримку під навантаженням,
ізоляцію namespace, відмову зарезервованим назвам і захист від ін'єкції query.
Підмножина Python/Server не відповідає контракту, доки кожна потрібна перевірка
не записана як `pass`, `fail`, `unsupported`, `not_covered` чи `runner_blocked`
із посиланнями на знахідки. Лише `pass` зараховується до успішної категорії.

ID сценаріїв атрибутів пошуку та критерії успіху опубліковані в
[`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json).

`schedules_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює періодичність cron
і fixed-rate, list/describe, pause/resume без спрацювань, припинення запусків
після delete, політику пропущених запусків, відновлення після restart,
операції CLI, Python SDK та PHP, запуски PHP workflow з Python schedule і навпаки,
відмову неправильному cron і невідомому типу workflow. Часткова перевірка
життєвого циклу schedule не відповідає контракту, доки кожна потрібна перевірка
не записана як `pass`, `fail`, `unsupported`, `not_covered` чи `runner_blocked`
із посиланнями на знахідки. Лише `pass` зараховується до успішної категорії.

ID сценаріїв schedule та критерії успіху опубліковані в
[`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json).

`history_replay_bundles` також є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює replay PHP і Python
завершеної історії, restart worker, activity, signal/update, wait-condition,
version-marker, saga-компенсацію, явну відмову розбіжності коду, зміні історії
на сервері й неправильній історії та час restart під час signal.
Часткова перевірка еталонної історії не відповідає контракту, доки всі потрібні
перевірки не записані як `pass`, `fail`, `unsupported`, `not_covered` чи
`runner_blocked` із посиланнями на знахідки. Лише `pass` зараховується до успіху.

ID сценаріїв replay та критерії успіху опубліковані в
[`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json).

`namespace_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює create/update/describe/list
namespace, очищення й повторне створення, ізоляцію видимості й змін workflow,
черг worker PHP, контекст namespace CLI й типової області, паритет вибору
namespace SDK, ізоляцію схем і query значень атрибутів пошуку, schedule,
видимість Waterline/оператора, явні виклики Nexus між namespace, відмову
зарезервованим назвам і маршрутизацію записів результатів до знахідок продукту.
Часткова перевірка namespace не відповідає контракту, доки всі перевірки не
записані як `pass`, `fail`, `unsupported`, `not_covered` чи `runner_blocked`
із посиланнями на знахідки. Лише `pass` зараховується до успіху.

Ненормативні примітки реалізації видимості Waterline/оператора можуть походити
з опублікованого артефакту Waterline чи окремого його шарда. Корисні знімки
для перевірки: обмежені списки й деталі workflow, schedule за наявності,
значення атрибутів пошуку, область панелі, статистика API оператора та
задокументований висновок для типового чи необмеженого огляду продукту.
Нормативні критерії залишаються в сценарії `waterline_operator_namespace_visibility`.

ID сценаріїв namespace та критерії успіху опубліковані в
[`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json).

`child_workflow_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює батьківські/дочірні
виконання PHP і Python однією мовою та між мовами, типізоване повернення помилки
дочірнього workflow, поширення скасування батька на дитину, спостереження
батьком прямого скасування дитини, replay після restart батьківського worker
під час очікування дитини, паралельний запуск п'яти дітей і поведінку namespace.
Одна перевірка parent/child не відповідає контракту, доки всі перевірки не
записані як `pass`, `fail`, `unsupported`, `not_covered` чи `runner_blocked`
із посиланнями на знахідки. Лише `pass` зараховується до успіху.

ID сценаріїв дочірніх workflow та критерії успіху опубліковані в
[`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json).

`saga_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює успіх прямого виконання,
помилку пізнього кроку з компенсацією у зворотному порядку, помилку раннього кроку
без зайвої компенсації, ідемпотентність повторної компенсації, термінальну
видимість помилки компенсації, restart worker під час неї, PHP workflow з
Python компенсацією й навпаки, типізовані помилки компенсації та її видимий
оператору поточний стан. Перевірка лише успішного шляху чи одного SDK не
відповідає контракту, доки всі перевірки не записані як `pass`, `fail`,
`unsupported`, `not_covered` чи `runner_blocked` із посиланнями на знахідки.
Лише `pass` зараховується до успіху. Матриця runtime називає пакет PHP
`workflow-php`, а порівняння набору артефактів релізу також може записувати `workflow`.

ID сценаріїв saga та критерії успіху опубліковані в
[`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json).

`worker_versioning_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює реєстрацію build-ID,
видимість розгортання оператором, drain/resume, прив'язки сумісності виконань,
replay лише сумісними worker, маршрутизацію нових запусків до promoted версії,
replay після витіснення кешу, діагностику відсутності сумісного worker,
поверхні CLI й Waterline, прив'язки PHP/Python між мовами, навмисну відсутність
збільшення версії та прив'язки версій API історії. Часткова перевірка не
відповідає контракту, доки всі перевірки не записані як `pass`, `fail`,
`unsupported`, `not_covered` чи `runner_blocked` із посиланнями на знахідки.
Лише `pass` зараховується до успіху.

Докази прив'язки PHP/Python між мовами мають фіксувати ідентичність runtime
worker, ID workflow й виконання, стан розгортання черги, результати публічних
poll і rollout для перевірки прив'язки, джерело й версію встановленого
артефакту worker та відсутність локальних вихідних кодів продукту.

ID сценаріїв версіонування worker та критерії успіху опубліковані в
[`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json).

`migration_runtime_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює стан останньої
підтримуваної v1, задокументовані кроки міграції, збереження й replay завершеної
історії, прогрес активного workflow, стан повторної activity, очікування signal
чи timer, періодичність schedule, проєкцію реєстрації worker, видимість Waterline,
доступ CLI до стану перед оновленням, нові запуски v2, відкат з урахуванням черги
та явну відмову непідтримуваній різниці версій. Докази відкату мають перелічувати
готову, відкладену й зарезервовану роботу v1, зазначати завершення роботи,
узгоджений знімок SQL із чергою чи прийняту невідновлюваність та доводити
наявність виконуваного пробудження через чергу чи signal для кожного
відновленого незавершеного рядка v1. Придатний застарілий `pending` може
використовувати Watchdog v1.0.77 лише за спостереження запуску типово
ввімкненого Watchdog циклом worker, повторного направлення workflow після
п'ятихвилинної межі та просування рядка на записаній черзі. Цей шлях лише
для pending не заміняє збереження черги повторних спроб, timer чи роботи
`waiting`/`running`. Відновлення лише SQL є успішним доказом відкату лише
за відсутності інших незавершених залежних від черги виконань v1 на момент знімка.
Маніфест відновлення має містити лише посилання на `APP_KEY` у менеджері
секретів і версію, тоді як ключ і облікові дані відновлення зберігаються
окремо від копій SQL і черг під окремим контролем доступу. Чиста інсталяція
чи міграція без реалістичного стану v1 не відповідає контракту, доки всі
перевірки не записані як `pass`, `fail`, `unsupported`, `not_covered` чи
`runner_blocked` із посиланнями на знахідки. Лише `pass` зараховується до успіху.

Перевірка задокументованих кроків має записати актуальний список команд
посібника, фактично виконані команди в його порядку, коди завершення й час
кожної команди. Знімки до й після мають містити завершену історію, активний
workflow, повторну activity, очікування signal чи timer, schedule й реєстрацію worker.

ID сценаріїв міграції та критерії успіху опубліковані в
[`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json).

`skew_refusal_matrix_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й охоплює сумісні пари, старіші,
новіші та поза вікном сумісності версії CLI, Python SDK, самостійного worker
PHP SDK і Waterline. Workflow присутній лише як рушій вбудованого Laravel і
Waterline. Перевірка також тестує межі майбутніх версій, фіксує запити й
відповіді кожної операції з різницею версій, класифікує worker як
`register_refused`, `register_and_serve` чи `register_and_drop`, Waterline як
`banner`, `render_refused` чи `stale_render`. Часткова перевірка маніфесту
протоколу не відповідає контракту, доки всі сценарії не записані як `pass`,
`fail`, `unsupported`, `not_covered` чи `runner_blocked` із посиланнями на знахідки.
Лише `pass` зараховується до успіху. `register_and_drop` і `stale_render`
без явного попередження є блокувальними дефектами продукту.

ID сценаріїв відмови несумісним версіям та критерії успіху опубліковані в
[`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json).

`principal_attribution_contract` є стабільною категорією runtime сценаріїв.
Результат використовує опубліковані артефакти й доводить запис визначених
сервером суб'єктів в історію для запуску, signal, query, скасування, завершення,
помилки, анонімних і серверних подій. Він перевіряє підробку payload/заголовків,
іменованих alice/bob, ротацію облікових даних, видимість CLI і Waterline та
автентифіковані start/signal через Python SDK і PHP `DurableWorkflow\Client`.
Перевірки SDK записують версію пакета, результати операцій, приклади суб'єктів
історії/API й еталонних HTTP викликів для порівняння форми та очікуваних ID.
PHP має отримати `durable-workflow/sdk` як точний дистрибутив Packagist
і записати тип, URL і reference. `durable-workflow/workflow` встановлюється
окремо лише для вбудованого Laravel і Waterline. Часткова перевірка role-token
не відповідає контракту, доки всі сценарії не записані як `pass`, `fail`,
`unsupported`, `not_covered` чи `runner_blocked` із посиланнями на знахідки.

ID сценаріїв визначення суб'єкта та критерії успіху опубліковані в
[`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json).

`prerelease_readiness_contract` є стабільною категорією runtime сценаріїв
узгодженого кандидата релізу 2.0. Результат використовує лише опубліковані
артефакти й публічну документацію, фіксує окремі GO / NO-GO для Workflow і
Waterline, охоплює повноту основних функцій, готовність міграції, стабільність
API, точність документації, зрозумілість конфігурації та сумісність компонентів.
Server, CLI, SDK PHP/Python/Rust, Workflow, Waterline, sample app і публічні
документи оцінюються як один кортеж екосистеми. Кожен версіонований
самостійний quickstart 2.0 та окремий вбудований шлях Laravel має пройти
з актуальної публічної документації до видимого завершення workflow за
10 хвилин із точними командами, виводом, версіями, походженням пакетів і часом.
Перевірка лише виявлення quickstart не відповідає контракту до запису сценаріїв
PHP, Python, Rust і Laravel як `pass`, `fail`, `unsupported`, `not_covered`
чи `runner_blocked`. Відсутній артефакт, застаріла сторінка, незадокументований
крок міграції, проблема інсталяції, нестабільність API, ризик несумісності
компонентів чи невідповідність каналу релізу мають бути non-pass із знахідкою.
Докази лише runner не можуть зробити готовність prerelease успішною.

ID сценаріїв готовності prerelease та критерії успіху опубліковані в
[`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json).
Стислий [quickstart 2.0](/docs/quickstart/) є публічним шляхом початку роботи.

## Правила успіху й помилок {#pass--fail-rules}

1. **`guaranteed_field_equality`.** Кожне гарантоване поле схеми fixture
   має бути присутнім із правильним типом і тим самим значенням у відповіді
   реалізації. Суто діагностичні поля ігноруються.
2. **`unknown_additive_fields_tolerated`.** Зайві поля допустимі лише як
   задокументовані суто діагностичні або за рівня стабільності fixture,
   що дозволяє додавання полів.
3. **`frozen_shape_exact_match`.** Fixture поверхні `frozen` мають
   збігатися точно. Розбіжність замороженої форми завжди є помилкою.
4. **`required_fixtures_must_pass`.** Реліз, що заявляє ціль, має пройти
   кожну обов'язкову категорію fixture цієї цілі. Один провал означає
   невідповідність релізу цій цілі.
5. **`stable_runtime_scenario_coverage`.** Стабільна категорія runtime
   має повідомити кожен потрібний сценарій зі статусом свого маніфесту:
   `pass`, `fail`, `unsupported`, `not_covered`, `runner_blocked`.
   Повна відповідність потребує успіху всіх сценаріїв. Часткова перевірка,
   пропуск, непідтримувана поверхня, непокрита чи runner-blocked перевірка
   не відповідають контракту й мають посилатися на знахідку. Цей набір
   статусів і правило лише pass належать семантиці версії набору 5+.
6. **`provisional_categories_warn_only`.** Провал fixture provisional
   категорії дає попередження й не блокує реліз.
7. **`diagnostic_only_mismatches_pass`.** За відмінностей лише діагностичних
   полів harness записує їх у `diagnostic_diff`, а fixture проходить.

Документ результату harness оголошує один із чотирьох рівнів відповідності:

| Рівень | Значення |
| --- | --- |
| `full` | Усі обов'язкові fixture успішні для всіх заявлених цілей. |
| `partial` | Усі обов'язкові fixture успішні хоча б для однієї цілі, але інша ціль неуспішна. |
| `provisional` | Провалилися лише provisional категорії, усі обов'язкові успішні. |
| `nonconforming` | Для кожної заявленої цілі провалився хоча б один обов'язковий fixture. |

## Контракт harness {#harness-contract}

Harness, що відповідає контракту:

- завантажує маніфест із `platform_conformance_suite` у `GET /api/cluster/info`
  або зі статичного дзеркала для офлайн перевірок;
- отримує кожен оголошений fixture з авторитетного джерела;
- викликає реалізацію задокументованою операцією fixture;
- порівнює відповідь за правилами вище;
- створює один документ результату перевірки зі схемою
  `durable-workflow.v2.platform-conformance.result`, версією набору,
  ідентичністю реалізації, результатами fixture, діагностичними відмінностями
  та загальним рівнем відповідності;
- завершується ненульовим кодом тоді й лише тоді, коли рівень `nonconforming`.

Документ результату є артефактом. Заява сумісності дійсна лише за отримання
результату для конкретної збірки реалізації та версії набору, названої цією збіркою.

## Вимоги релізів {#release-gates}

| Реліз | Обов'язкові заявлені цілі | Обов'язковий артефакт |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | Документ результату harness, прикріплений до релізу. |
| `durable-workflow/workflow` | `embedded_engine` | Документ результату harness, прикріплений до релізу. |
| `durable-workflow/sdk` | `official_sdk`, `worker_protocol_implementation` | Документ результату harness, прикріплений до релізу. |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | Документ результату harness, прикріплений до релізу. |
| `dw` | `cli_json_client` | Документ результату harness, прикріплений до релізу. |
| `waterline` | `waterline_contract_surface` | Документ результату harness, прикріплений до релізу. |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | Запис відповідності зберігає результат готовності prerelease на опублікованих артефактах. |

Під час перевірки релізу підтверджують наявність результату harness, рівень
`full` чи `provisional` і збіг версії набору в результаті з версією тестованої
збірки. `nonconforming` блокує реліз.

## Перевірка релізу {#release-check}

Перевірка релізу сайту `scripts/check-platform-conformance-authority.js`
завершує збірку помилкою, якщо статичний маніфест посилається на відсутнє,
локальне для репозиторію, суто версійний псевдонім чи позасайтове джерело.
Вона перевіряє `authority_doc` кожного стабільного fixture як канонічний URL
поточної документації й відхиляє відносні дерева коду, тестові fixture,
документацію, каталоги схем, неверсіоновані ID артефактів, непублічні resolver
і неправильні digest байтів стабільних категорій. Категорії runtime додатково
мають надавати публічний маніфест сценаріїв, прив'язаний до набору.
Перевірка також вимагає перелік схеми маніфесту, цілей, категорій fixture,
правил успіху/помилок і вимог релізу на цій сторінці за машиночитаним дзеркалом.

Після зміни набору оновіть цю сторінку та `static/platform-conformance-contract.json`
разом. Якщо зміна додає ціль чи потрібну категорію fixture, переводить
provisional у stable, змінює `operations` чи `pass_criteria` стабільного сценарію,
його публічну вимогу (`artifact_policy`, `common_result_evidence`,
`required_matrix`, `scenario_requirements`, `host_runner_contract`) або правило
успіху/помилки, збільште версію набору в тій самій зміні релізу.
Перевірка фіксує критерії стабільних сценаріїв і знімки публічних вимог через
версіоновані digest, щоб зовнішні harness не отримували нові критерії чи
політики доказів під старою версією набору.

Опубліковані записи digest критеріїв і публічних вимог runtime сценаріїв
дозволяють лише додавання. Для зміни `operations` чи `pass_criteria` залиште
наявні `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS` незмінними, збільште
версію набору, оновіть маніфест сценаріїв і додайте digest нової версії.
Для зміни вимог доказів, політики артефактів, матриці, полів вимог сценарію
чи контракту host-runner залиште наявні
`VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS` незмінними,
збільште версію набору, оновіть маніфест і додайте відповідний digest.
Перевірка порівнює опубліковані записи цільової гілки з поточною зміною,
тому редагування чи видалення старого запису спричиняє помилку навіть
за додавання digest нової поточної версії.
