---
title: Топологія ролей Server
description: Читання topology manifest /api/cluster/info для ролей Durable Workflow Server, меж масштабування, областей відмов і кроків міграції.
tags:
  - server
  - topology
  - deployment
  - control-plane
  - workers
keywords:
  - топологія ролей Durable Workflow
  - cluster info topology
  - межі масштабування Server
  - split control execution
---

# Топологія ролей Server {#server-role-topology}

## Призначення manifest {#why-this-manifest-exists}

`GET /api/cluster/info` публікує manifest `topology` Server зі schema
`durable-workflow.v2.role-topology`. Це публічний контракт назв ролей,
підтримуваних форм розгортання, повноважень durable-запису, очікувань
щодо областей відмов, меж масштабування та впорядкованого шляху міграції
від поточного окремого Server до топології з розділеними керуванням і виконанням.

Ця сторінка допомагає працювати з формою Server у scripts, dashboards,
runbooks та автоматизації rollout. HTTP-поверхня наведена в
[довіднику Server API](/docs/polyglot/server-api-reference),
а налаштування розгортання — у
[настанові Server](/docs/polyglot/server).

## Читання topology manifest {#reading-the-topology-manifest}

Об'єкт `topology` відповідає на такі питання контракту:

| Група полів | Питання |
| --- | --- |
| `schema`, `version` | Яку редакцію контракту топології ви читаєте? |
| `supported_shapes` | Які форми розгортання продукту дозволені? |
| `role_vocabulary` | Які назви ролей дійсні для цього контракту? |
| `current_shape`, `current_process_class`, `current_roles`, `execution_mode` | Що зараз робить вузол, який відповів? |
| `matching_role.*` | Хто відповідає за широке wake готових tasks, які осі маршрутизації закріплено та який режим dispatch/backpressure активний? |
| `role_catalog`, `authority_surfaces` | Які інтерфейси та поверхні durable-змін належать кожній ролі? |
| `shape_assignments` | Які класи процесів дозволені для кожної підтримуваної форми? |
| `authority_boundaries`, `failure_domains`, `scaling_boundaries` | Що кожна роль може записувати, як відмовляє та за яким навантаженням масштабується? |
| `supported_topologies`, `migration_path` | Які сімейства розгортань підтримує продукт та який порядок переходу від окремого Server до ізольованіших ролей? |
| `kernel_invariants` | Які гарантії durable-ядра має зберігати поділ ролей незалежно від активної форми? |

`current_shape`, `current_process_class` і `current_roles` описують вузол,
який відповів на HTTP-запит, а не весь fleet. Використовуйте
`current_process_class` як оголошену ідентичність вузла, а для перевірки
зіставляйте `current_roles` з наборами ролей класів процесів у `shape_assignments`.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '{
    current_shape: .topology.current_shape,
    current_process_class: .topology.current_process_class,
    current_roles: .topology.current_roles,
    execution_mode: .topology.execution_mode,
    matching_role: .topology.matching_role,
    scaling_boundaries: .topology.scaling_boundaries,
    migration_path: .topology.migration_path
  }'
```

## Назви ролей {#role-vocabulary}

Публічні назви ролей закріплені в `topology.role_vocabulary`:

| Роль | Відповідальність |
| --- | --- |
| `api_ingress` | Приймання зовнішнього HTTP-трафіку, включно з discovery та входом до площини керування. |
| `control_plane` | Запуск, signal, update, repair, cancel, terminate, archive та інші зміни життєвого циклу workflow. |
| `matching` | Пошук готової роботи, володіння task leases та координація тиску dispatch. |
| `history_projection` | Зберігання durable-історії та підтримка похідних зведень runs і exports. |
| `scheduler` | Запуск schedules та зберігання стану schedule runs. |
| `execution_plane` | Виконання workflow tasks та activity tasks. |

Автоматизація має використовувати саме ці ідентифікатори як сталі назви.

## Підтримувані форми розгортання {#supported-deployment-shapes}

`topology.supported_shapes` визначає дозволені форми розгортання продукту:

| Форма | Класи процесів у `shape_assignments` | Значення контракту |
| --- | --- | --- |
| `embedded` | `application_process` | Один процес застосунку відповідає за керування, matching, проєкцію історії, scheduler і виконання. |
| `standalone_server` | `server_http_node`, `scheduler_node`, `worker_node` | Поточний окремий Server: HTTP ingress і керування на вузлі Server, scheduler в окремому класі процесу, виконання на вузлах workers. |
| `split_control_execution` | `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` | Той самий контракт продукту з вужчими класами процесів за ролями, щоб переміщувати межі масштабування та відмов за підсистемами. |

`split_control_execution` є підтримуваною топологією. Вона використовує
той самий рушій та API. Одна discovery-поверхня описує і окремий Server,
і форму з розділеними ролями.

## Ідентичність поточного вузла {#current-node-identity}

Використовуйте разом `current_shape`, `current_process_class`,
`current_roles` та `execution_mode`:

- `current_shape` визначає контракт форми вузла, який відповів.
- `current_process_class` визначає оголошений клас процесу цього вузла.
- `current_roles` визначає активний набір ролей вузла.
- `execution_mode` розрізняє `remote_worker_protocol` та `local_queue_worker`.

Для окремого Server `current_shape` залишається `standalone_server`,
навіть коли `DW_MODE=embedded` перемикає виконання на локальні queue workers.
У цьому випадку `execution_mode` змінюється на `local_queue_worker`,
а HTTP-вузол зберігає контракт ролей окремого Server.

### Перевірка розміщених маршрутів {#hosted-route-gating}

Той самий контракт топології визначає, коли вузол має відхиляти трафік.
Автентифіковані розміщені маршрути відхиляються, якщо вузол не оголошує
потрібний їм поточний HTTP-набір керування:
`api_ingress` разом із `control_plane`.

Відповідь неправильного вузла містить `503`,
`reason: "topology_role_unavailable"` та дані топології
для вибору іншого маршруту:

- `current_shape`
- `current_process_class`
- `current_roles`
- `required_roles`
- `missing_roles`

Ця перевірка передує визначенню namespace на розміщених маршрутах.
Тому запит до `scheduler_node`, `matching_node` чи `execution_node`
не дізнається, чи існує названий namespace, перед переходом до правильного
класу вузла. `GET /api/health`, `GET /api/ready` та автентифікований
`GET /api/cluster/info` залишаються доступними, щоб автоматизація могла
визначити форму вузла перед повторенням запиту в іншому місці.

### Перевірка bootstrap workflow {#workflow-bootstrap-gate}

Друга перевірка маршрутів відхиляє запити, коли вузол має нерозв'язані
blockers bootstrap workflow v2. Поки `checks.workflow_v2.status`
дорівнює `blocked`, автентифіковані маршрути запуску та зміни workflow,
зміни schedule, bridge adapters і worker-протоколу повертають
`503` із `reason: "workflow_v2_blocked"` та:

- `blocked_by`: упорядкований список попередніх blockers готовності,
  наприклад `migrations`.
- `remediation`: інструкція оператору для усунення перелічених blockers,
  скопійована з `checks.workflow_v2.remediation` у `/api/ready`.

Перевірка bootstrap виконується на тому самому етапі, що й перевірка
топології розміщених маршрутів: після ролі та версії протоколу,
перед визначенням namespace. Тому заблокований запит ніколи
не отримує інформації про існування namespace.

Перевіряються маршрути workflow, наприклад `/api/workflows`,
зміни schedules, зокрема `POST /api/schedules`,
`PUT /api/schedules/{scheduleId}`, `DELETE /api/schedules/{scheduleId}`,
`/pause`, `/resume`, `/trigger` та `/backfill`, маршрути bridge adapters,
наприклад `/api/bridge-adapters/webhook/{adapter}`,
і worker-протокол під `/api/worker`.

**Читання** schedules (`GET /api/schedules`,
`GET /api/schedules/{scheduleId}`, `GET /api/schedules/{scheduleId}/history`)
навмисно виключено з перевірки, щоб оператор міг оглянути стан schedule
під час відновлення. Маршрути worker-протоколу повертають той самий payload
перевірки bootstrap в оболонці worker-протоколу. Тому SDK workers використовують
той самий машиночитаний `reason: "workflow_v2_blocked"`, що й площина керування.

## Контракт ролі matching {#matching-role-contract}

`topology.matching_role` закріплює поточні matching і wake
для вузла, який відповів:

| Поле | Значення |
| --- | --- |
| `queue_wake_enabled` | Чи увімкнено зараз короткотривалі wake signals черги. |
| `shape` | Яку форму розгортання matching оголошує вузол: `in_worker` чи `dedicated`. |
| `wake_owner` | Хто зараз відповідає за широкий wake-прохід: `worker_loop` чи `dedicated_repair_pass`. |
| `task_dispatch_mode` | Чи dispatch виконується через віддалені workers із `poll`, чи через локальне виконання з `queue`. |
| `partition_primitives` | Закріплені осі маршрутизації matching у порядку: `connection`, `queue`, `compatibility`, `namespace`. |
| `backpressure_model` | Durable-межа приймання роботи, яку контролює matching. Поточний v2 повідомляє `lease_ownership`. |
| `discovery_limits` | Закріплений числовий контракт matching, скомпільований у пакеті workflow: `poll_batch_cap`, `availability_ceiling_seconds`, `wake_signal_ttl_seconds`, `workflow_task_lease_seconds` та `activity_task_lease_seconds`. |

Це дає операторам та автоматизації змогу розрізняти погіршення wake
за наявного matching і навмисний інший режим dispatch вузла.
Воно також надає ті самі назви маршрутизації та backpressure,
які Server публікує в операторських метриках.

`discovery_limits` є числовим контрактом matching: `poll_batch_cap`
закріплює максимальну кількість рядків готових tasks на poll,
`availability_ceiling_seconds` — допуск різних backends до `available_at`,
щоб щойно доступні tasks витримували дрейф timestamp менше секунди,
`wake_signal_ttl_seconds` — стандартний TTL signal `CacheLongPollWakeStore`,
а `workflow_task_lease_seconds` / `activity_task_lease_seconds` — стандартні
тривалості leases workflow та activity tasks. Оператори перевіряють за цими
значеннями відповідність розгортання контракту matching без пошуку в коді пакета.
Посилення будь-якого обмеження є зміною протоколу, оскільки від нього
залежать строки dispatch, workers та прискорення в інших частинах контракту.
Перейменування поля також порушує сумісність протоколу.

## Межі повноважень {#authority-boundaries}

`topology.authority_boundaries` визначає поверхні durable-запису,
які кожна роль має змінювати:

| Роль | Опубліковані записи |
| --- | --- |
| `api_ingress` | `worker_registrations` |
| `control_plane` | `workflow_instances`, `workflow_runs.status`, `workflow_tasks.lifecycle` |
| `matching` | `workflow_tasks.leases`, `activity_tasks.leases` |
| `history_projection` | `history_events`, `workflow_run_summaries`, `workflow_history_exports` |
| `scheduler` | `workflow_schedules.fire_state`, `workflow_starts.scheduled` |
| `execution_plane` | `workflow_tasks.outcomes`, `activity_attempts`, `worker_compatibility_heartbeats` |

За цим контрактом виявляйте вихід за межі ролей перед поділом процесів
або додаванням автоматизації для окремої топології.

## Межі відмов і масштабування {#failure-and-scaling-boundaries}

### Області відмов {#failure-domains}

`topology.failure_domains` визначає перше погіршення поведінки
та перший видимий оператору signal для відмови кожної ролі:

| Область відмови | `effect` | `operator_signal` |
| --- | --- | --- |
| `control_plane_down` | `workers_continue_claimed_tasks_only_until_lease_expiry` | `operator_commands_fail_fast` |
| `execution_plane_down` | `ready_tasks_accumulate_without_loss` | `operators_see_ready_depth_growth` |
| `matching_down` | `claim_falls_back_to_direct_ready_task_discovery` | `ready_depth_rises_while_claim_rate_falls` |
| `history_projection_down` | `projection_reads_may_stale_while_durable_writes_continue` | `projection_lag_seconds_may_increase` |
| `scheduler_down` | `scheduled_workflows_stop_firing_and_record_missed_runs` | `operators_see_missed_schedule_state` |
| `api_ingress_down` | `external_http_traffic_stops_at_the_edge` | `embedded_in_process_calls_may_continue` |

Це очікувана поведінка продукту. Використовуйте її для визначення
того, що має відбутися за погіршення ролі, перед читанням логів.

### Межі масштабування {#scaling-boundaries}

`topology.scaling_boundaries` визначає основну вісь навантаження,
за якою масштабується кожна роль у моделі поділу ролей:

| Роль | Межа масштабування |
| --- | --- |
| `api_ingress` | `incoming_http_request_rate` |
| `control_plane` | `operator_commands_and_run_lifecycle_transitions` |
| `matching` | `ready_task_rate_and_poller_count` |
| `history_projection` | `durable_event_rate` |
| `scheduler` | `active_schedule_count` |
| `execution_plane` | `workflow_and_activity_task_rate` |

Це явна відповідь на питання, що масштабується незалежно
в топології з поділеними ролями.

## Шлях міграції {#migration-path}

`topology.migration_path` упорядкований. Кожен крок зберігає одне
durable-ядро та чіткіше ізолює відповідальність:

1. `audit_role_boundaries`
   Результат: інструменти виявляють записи за межами ролей перед зміною форми runtime.
2. `expose_role_bindings`
   Результат: точки інтеграції контейнера дозволяють позапроцесні adapters без змін пакета.
3. `introduce_dedicated_matching_shape`
   Результат: matching працює у власному класі процесу без зміни контракту claim.
4. `split_history_projection`
   Результат: історія та projections можуть перейти за межі процесу без другого writer.
5. `split_scheduler`
   Результат: запуск schedule може використовувати leader election, зберігаючи підтримку однієї репліки.
6. `optional_execution_partitioning`
   Результат: workers можуть поділятися за namespace, connection, queue та compatibility.

Цей список визначає підтримуваний порядок переходу топології
для поточного рушія.

Кожен запис `topology.migration_path[]` має явний прапорець
`reversible: true`. Шлях міграції працює в обидва боки:
розгортання, яке досягло `split_history_projection`, МОЖЕ повернути
роль історії до процесу площини керування та залишатися дозволеною
формою топології. Rollback є частиною контракту.

## Інваріанти durable-ядра {#durable-kernel-invariants}

`topology.kernel_invariants` перелічує гарантії, які поділ ролей
зберігає за кожної підтримуваної форми. Використовуйте цей список
для перевірки, що запропонована зміна топології підтримується продуктом
і зберігає контракт рушія:

| Інваріант | Гарантія |
| --- | --- |
| `single_persistence_engine` | Одна база workflow підтримує всі форми топології. Поділ ролей не вводить другого рушія зберігання. |
| `single_worker_protocol` | Один HTTP worker-протокол передає claim, complete, fail і heartbeat у кожній топології. Поділ ролей не створює окремого контракту worker. |
| `single_history_writer` | `history_events` має рівно одного durable writer на логічну подію незалежно від місця виконання ролі історії/projection. |
| `single_control_authority_per_run` | Кожна зміна run workflow проходить через один центр повноважень площини керування. Row locks run серіалізують переходи між репліками. |
| `embedded_topology_remains_supported` | Вбудована форма з усіма ролями в одному процесі МАЄ залишатися дозволеною. Наявні embedded hosts не змушують мігрувати. |
| `role_split_is_topology_only` | Поділ ролей змінює топологію, зберігаючи той самий продукт. Повернення всіх ролей до одного процесу завжди є дозволеною топологією. |

Поле `applies_to` кожного запису перелічує форми, які охоплює інваріант.
Для підтримуваного сімейства топологій кожен інваріант зараз діє для
`embedded`, `standalone_server` та `split_control_execution`.
Якщо оновлення додає нову форму, інваріанти, чиє `applies_to` її
не містить, МАЮТЬ бути перевірені до визнання підтримки цієї форми продуктом.

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/cluster/info" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Namespace: default" \
  | jq '.topology.kernel_invariants[] | {id, applies_to}'
```

## Стан координації {#coordination-health}

`/api/cluster/info` також публікує `coordination_health` поруч
із `topology`. Вони описують різне:

- `topology` визначає дозволені дії вузла та очікувану поведінку форми продукту.
- `coordination_health` визначає поточний стан перевірок безпеки rollout
  та координації між namespaces.
- `coordination_health.blocked_by`, `coordination_health.message` та
  `coordination_health.remediation` з'являються, коли Server не може перевірити
  безпеку rollout через відсутність передумов готовності, наприклад migrations
  чи підключення до бази даних.
- `coordination_health.routing_drains` підсумовує групи build ID у drain
  між чергами та namespaces. `queues_with_drains` показує, чи автоматизація
  rollout зараз навмисно утримує трафік від певної групи.
- `coordination_health.warning_checks`, `coordination_health.error_checks` та
  `coordination_health.checks` залишаються нормалізованим переліком перевірок
  після запуску оцінювання безпеки rollout.
- `coordination_health.checks[]` завжди містить закріплену перевірку
  `activity_path` поруч із `worker_compatibility`, `task_transport`,
  `routing_health`, `durable_resume_paths` та перевірками projection/scheduler.
  `activity_path` є аналогом `task_transport` для activities: вона показує
  виконання activities зі спливлими, але не застосованими deadlines
  schedule-to-start, start-to-close, schedule-to-close або heartbeat,
  а також сталий backlog retries activities. Перейменування перевірки
  є зміною протоколу.

Використовуйте обидві поверхні разом, щоб визначити,
чи зміна топології підтримується та чи безпечна вона зараз.

## Пов'язані довідники {#related-references}

- [Довідник Server API](/docs/polyglot/server-api-reference) —
  автентифікований HTTP-контракт `/api/cluster/info`.
- [Настанова Server](/docs/polyglot/server) — налаштування розгортання
  та ширша модель експлуатації окремого Server.
- [Режими розгортання](/docs/polyglot/deployment-modes) — вибір вбудованого
  режиму, окремого Server чи ширших топологій за участі підтримки.
