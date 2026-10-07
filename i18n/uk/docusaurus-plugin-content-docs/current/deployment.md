---
sidebar_position: 13
title: Самостійне розгортання
description: Вибір підтримуваного шляху самостійного розгортання Durable Workflow v2 та початкового артефакту.
---

# Самостійне розгортання {#self-hosting-deployments}

Durable Workflow v2 підтримує кілька форм самостійного розгортання.
Виберіть найменший шлях, який відповідає вашому середовищу,
і явно визначте образ, базу даних, cache, автентифікацію,
readiness та контракт оновлення.

Ця настанова описує окремий Server. Для Laravel-пакета,
вбудованого у власний застосунок, використовуйте сторінки встановлення
та конфігурації пакета. Durable Workflow Cloud є окремим керованим
сервісом, де Cloud оперує runtime, зберіганням, розміщенням і відновленням.
Власний Server ніколи не підключається до Cloud.
Дивіться [керований Cloud runtime](/docs/polyglot/cloud-control-plane).
Поточний контракт Cloud визначає керований runtime та відновлення
в одному регіоні. Він не обіцяє multi-region replication,
автоматичного regional failover чи failback.

Власний Server не містить і не оперує Waterline.
Розгортайте Waterline окремо, коли потрібний його операторський UI,
і підключайте до namespace Server за
[настановою розгортання та моніторингу Waterline](/docs/monitoring/#waterline-service).
Cloud включає Managed Waterline для свого керованого namespace.

## Матриця підтримки розгортань {#deployment-support-matrix}

| Шлях | Початковий артефакт | Підтримується для | Що цей шлях не обіцяє | Коли потрібна комерційна підтримка |
| --- | --- | --- | --- | --- |
| Локальна розробка та внутрішнє non-production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) із `%%artifact.serverTagEnv%%` або `%%artifact.serverImageEnv%%` | Один комп'ютер розробника, LAN demos, спільний staging, інтеграційні тести SDK та workers | Відкритий в інтернет production, гарантії durable backup, сувора ротація секретів, багатовузловий failover | Потрібна допомога з перетворення робочого dev stack на production runbook |
| Одновузловий production | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) із production env file, volumes MySQL і Redis, токенами ролей, backups, TLS через reverse proxy та закріпленими image tags чи digests | Одна VM, VPS чи внутрішній Docker host із постійним станом workflow і простою операційною моделлю | HA host, автоматичний failover бази, multi-region recovery, великі зміни топології без перерви | Розгортання обслуговує production-трафік і потребує перевірки backup, restore, auth, TLS, upgrade чи rollback |
| Невеликий кластер | Опубліковані образи `durableworkflow/server` чи `ghcr.io/durable-workflow/server`, [Compose recipe](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) як шаблон контейнера/процесу, 2–3 API nodes, спільна зовнішня MySQL/PostgreSQL, спільний Redis, незалежно масштабовані workers та рівно один scheduler/maintenance runner | Горизонтальна місткість API та workers, коли одного вузла недостатньо. Rolling upgrades за виконання всіх гарантій [контракту rolling upgrades](/docs/rolling-upgrades) | SQLite clustering, багатовузловий режим без Redis, дублікати schedulers як стала топологія, active/active multi-writer бази, власний regional failover без втручання, широкі SLA «five-nines» чи «zero-downtime» та самостійний HA failover одного регіону до проходження [перевірки випуску](#release-evidence-status) | Потрібне планування місткості, областей відмов, rollout чи recovery між hosts або твердження про умовну поведінку single-region HA |
| Helm chart для Kubernetes | [Helm chart Server](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow) з `oci://ghcr.io/durable-workflow/charts/durable-workflow` із вашими зовнішніми базою, Redis, ingress та керуванням секретами | Відтворюване production-встановлення й оновлення ресурсів chart: server, worker, singleton scheduler, bootstrap, service, probes та policies | Вбудоване сховище, provider-managed інфраструктура, active/active multi-region, custom operators та самостійний single-region HA failover до проходження [перевірки випуску](#release-evidence-status) | Потрібні архітектура конкретного provider, capacity, recovery чи зміни поза опублікованим контрактом values chart |
| Raw Kubernetes manifests | Manifests Server [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) з опублікованими образами Server та вашими базою, Redis, ingress і керуванням секретами | Команди з досвідом Kubernetes, яким потрібні відкриті для перевірки manifests API, worker, scheduler, bootstrap, service, probes, config та secrets | Окремий життєвий цикл Helm, перевірка managed-Kubernetes provider, active/active multi-region, custom operators, рішення сховища/мережі/безпеки середовища та самостійний single-region HA failover до проходження [перевірки випуску](#release-evidence-status) | Потрібні overlays, перевірка managed cluster, production-планування provider чи твердження про умовну поведінку single-region HA |
| Оцінювання active/passive multi-region | Перевірене одновузлове чи невелике кластерне розгортання на регіон, асинхронна реплікація бази з active до standby та перевірений failover/failback runbook | Архітектурне оцінювання з підтримкою та репетиція disaster recovery регіону для конкретного середовища | Доведений самостійний контракт 2.0, active/active multi-region, автоматичний regional failover без втручання, синхронна реплікація між регіонами (RPO=0), активна міжрегіональна видимість чи federated search, прив'язані до регіону task queues як вісь маршрутизації рушія | Перед production-залежністю від міжрегіональної реплікації, failover, failback, RPO чи RTO |
| Топології з підтримкою | Перевірений дизайн вашого середовища | Власні active/passive чи active/active multi-region, regional failover без втручання, RPO=0 cross-writer replication, дублікати scheduler runners як стала топологія, спеціальна безпека/мережа, приватні SLOs, custom overlays, планування міграції | Самостійний запуск копіюванням прикладу | Коли сама топологія є частиною ризику продукту |

Публічний дистрибутив оптимізований для локальної розробки,
одновузлового production та невеликих кластерів. Kubernetes manifests
надано командам, які вже оперують Kubernetes.
Матеріал active/passive multi-region доступний як оцінювальна настанова
з підтримкою, а не доведений самостійний контракт 2.0.
Дивіться [active/passive multi-region](#activepassive-multi-region) нижче.
Single-region HA failover: failover керованої бази, керованого Redis,
втрата API node чи worker та restart scheduler runner у межах регіону,
зараз потребує підтримки, поки перевірка точного випуску не пройдена.
Дивіться [single-region HA та failover](#single-region-high-availability-and-failover).
Для власного Server active/active multi-region, автоматичний regional failover,
дублікати scheduler runners як стала топологія та перевірка managed-Kubernetes
provider залишаються шляхами з підтримкою через залежність від бази, cache,
мережі, безпеки, runner та upgrade. Опублікований Helm chart надає
самостійне пакування в тих самих межах відповідальності оператора.
Cloud зараз надає керовану роботу та recovery в одному регіоні,
без multi-region replication чи regional failover.
Дивіться [керований Cloud runtime](/docs/polyglot/cloud-control-plane)
та [межу підтримки](/docs/support) для комерційної моделі.

## Матеріали production-відновлення {#production-recovery-deliverables}

«Готовність до production» означає публікацію набору відновлення
для топології разом із запуском контейнерів. Зберігайте актуальні
підтвердження в тому самому runbook, що й команди розгортання:

| Шлях | Мінімальний опублікований набір відновлення |
| --- | --- |
| Одновузловий production | Розклад backup, закріплений image чи digest, місце snapshot env/config, максимальна прийнятна затримка restore та timestamp останньої успішної репетиції restore з даними перевірки. |
| Невеликий кластер | Одновузловий набір та очікуваний вплив втрати одного API node, worker node, scheduler/maintenance runner, Redis або спільної бази. Кроки повторної реєстрації worker після restore та документований rolling-upgrade чи stop-the-world режим поточного випуску. |
| Helm chart для Kubernetes | Кластерний набір, версія chart, редакція values, image digest, власники ingress і secrets кластера та остання репетиція upgrade/rollback chart. |
| Raw Kubernetes manifests | Кластерний набір та власники storage, secrets, ingress і rollout кластера, які потрібно відновити або повторно застосувати перед визнанням трафіку здоровим. |
| Оцінювання single-region HA з підтримкою до проходження перевірки випуску | Кластерний чи raw-manifest набір та репетиції failover керованої бази, керованого Redis, втрати API node, worker і restart scheduler runner. Кожна має завершитися в межах цілі [single-region HA контракту](#single-region-high-availability-and-failover) без втрати підтверджених записів. |
| Оцінювання active/passive multi-region з підтримкою | Набір кожного регіону, дизайн реплікації бази та fencing, виміряна затримка реплікації, RPO/RTO оператора, runbooks promotion і failback та репетиції конкретного середовища. |

Якщо цей набір неможливо надати на вимогу, вважайте середовище staging,
доки контракт відновлення не записаний і не відрепетируваний.
[Операторські межі експлуатації](/docs/operator-operating-envelope)
визначають порядок restore, перевірку та періодичність репетицій цих наборів.

## Безпека, дані та аудит {#security-data-and-audit-posture}

Власні розгортання Durable Workflow успадковують більшість механізмів
безпеки з вашого середовища. Публікуйте ці факти в тому самому наборі
випуску чи runbook, що й image tag, план міграції та підтвердження recovery:

| Область | Точне твердження випуску |
| --- | --- |
| Обробка даних | Аргументи workflow, результати, історія, memos, search attributes, мітки видимості, контекст команд, рядки аудиту, повідомлення винятків та операторські notes можуть містити дані застосунку клієнта. Search attributes і мітки є видимими оператору metadata, а не сховищем секретів. |
| Шифрування | Використовуйте TLS на кожній production HTTP-поверхні. Шифрування at rest надають база, object storage, файлова система, черга, cache та secret manager. Пакет workflow і Server не шифрують автоматично кожне поле payload. |
| Compliance | Open-source пакет та власний Server надають механізми й дані аудиту, а не саму compliance-сертифікацію. Твердження SOC 2, HIPAA, PCI, ISO чи FedRAMP належать вашій програмі, якщо hosted offering не документує інше. |
| Логи аудиту | Команди workflow, audit events schedules, metadata exports історії та записи service calls надають durable-операційні дані. Повний SIEM, DLP, незмінний зовнішній ledger чи legal-hold system потребує додаткових компонентів. |
| Підтримка | Тут документовано credentials ролей, TLS termination, backups, репетиції restore та вузькі самостійні топології. Advanced identity, mTLS rollout, приватна мережа, custom policy engines, compliance provider та окрема перевірка топології потребують підтримки, якщо публічні docs не визначають інше. |

Мережева модель має бути явною:

- **Webhook ingress:** документуйте публічний endpoint, метод auth,
  replay або стратегію ідемпотентності, timeout, обмеження payload,
  конфігурацію довірених proxy headers і план ротації секретів.
- **Worker-to-backend трафік:** використовуйте перевірку TLS, credentials ролі
  worker, заголовки namespace, приватну мережу чи mTLS за недовіреної мережі
  та ротацію, що не надає токенам worker повноважень operator.
- **Операторські поверхні:** захищайте Waterline, операторські API Server,
  endpoints автоматизації CLI та власні admin panels автентифікованими
  sessions чи service credentials ролей, із CSRF-захистом browser sessions
  та документованими межами proxy/TLS.

## Опубліковані образи {#published-images}

Для власних розгортань Server використовуйте опубліковані образи:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Закріплення digest: `durableworkflow/server@sha256:...` або
  `ghcr.io/durable-workflow/server@sha256:...`

Використовуйте mutable tags лише для локальних експериментів.
Production env files мають закріплювати конкретну version tag чи digest,
щоб кроки upgrade і rollback можна було перевірити.

## Локальна розробка та внутрішнє non-production {#local-development-and-internal-non-production}

Використовуйте Compose recipe опублікованого образу для stack
без source code з MySQL та Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

Перевірте API, readiness, discovery кластера та реєстрацію worker:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

Цей шлях придатний для розробки та внутрішнього staging.
Він не є межею production-безпеки: приклад використовує один токен
сумісності, стандартні passwords сервісів, локальні named volumes і не має TLS.

## Одновузловий production {#single-node-production}

Використовуйте той самий Compose-артефакт із production-конфігурацією
поза source control:

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

Запустіть із цим env file:

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

Оперуйте host як production-сервісом:

- Розмістіть TLS, public routing, логування запитів та IP allow lists
  у reverse proxy перед контейнером API.
- Не відкривайте MySQL чи Redis публічно.
- Використовуйте `DW_WORKER_TOKEN` для workers, `DW_OPERATOR_TOKEN`
  для застосунку та операторського трафіку, `DW_ADMIN_TOKEN`
  для namespaces та адміністрування.
- Резервуйте MySQL volume перед кожним image upgrade та регулярно.
  Redis слід зберігати для graceful restarts, але MySQL залишається
  durable-джерелом істини історії workflow.
- Зберігайте точний env file, image tag чи digest та backup бази разом для restore.

Порядок upgrade:

1. Створіть backup MySQL і запишіть поточний image reference.
2. Змініть лише `DW_SERVER_IMAGE` або `DW_SERVER_TAG`.
3. Завантажте новий image.
4. Виконайте `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait`.
5. Перевірте `/api/ready`, `/api/cluster/info` та реєстрацію worker
   перед переведенням зовнішнього трафіку.

README Server підтримує актуальні Compose-команди в розділі
[Official Image + Compose](https://github.com/durable-workflow/server#official-image--compose).

## Невеликі кластерні розгортання {#small-clustered-deployments}

Невеликий кластер трохи розширює одновузлову модель.
Перевірений самостійний контракт навмисно вузький:

- Запускайте 2–3 stateless API-контейнери за load balancer.
  Health, readiness, discovery кластера, реєстрація worker, polling workflow tasks
  та completion workflow tasks мають працювати без sticky sessions.
- Використовуйте одну спільну зовнішню MySQL чи PostgreSQL для durable-історії.
  SQLite підтримує лише один вузол і не є backend кластерного зберігання.
- Використовуйте спільний Redis для cache, long-poll wake signals, locks
  query-task queues, locks приймання task queue та стану черг.
  Багатовузловий режим без Redis не входить до підтримуваного контракту.
- Перевіряйте `GET /api/cluster/info` кожного API node під час rollout.
  `topology.current_shape` має залишатися `standalone_server`,
  `topology.current_roles` — містити `api_ingress`, `control_plane`,
  `matching` і `history_projection`, `topology.execution_mode` —
  залишатися `remote_worker_protocol` для вузлів окремого Server.
  Перевіряйте фактичний matching через `topology.matching_role`.
  Стандартні вузли повідомляють `queue_wake_enabled: true`, `shape: "in_worker"`
  та `wake_owner: "worker_loop"`. Rollout dedicated matching перемикає вузли
  з `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` на `queue_wake_enabled: false`,
  `shape: "dedicated"` і `wake_owner: "dedicated_repair_pass"`.
  Той самий блок має зберігати очікуваний `task_dispatch_mode`, закріплені
  осі маршрутизації `partition_primitives` та поточний `backpressure_model`.
  Значення кожного поля описано в
  [топології ролей Server](/docs/polyglot/server-role-topology).
- Масштабуйте зовнішні SDK workers незалежно від API nodes.
  Workers можуть працювати на окремих hosts чи процесах, але мають
  підключатися до load-balanced API endpoint, а не одного sticky node.
- Налаштуйте [приймання task queue](/docs/polyglot/task-queue-admission)
  для черг, які захищають tenant, зовнішній API, database pool
  або іншу спільну downstream-залежність.
- Запускайте рівно один scheduler чи maintenance process для schedules,
  застосування activity timeouts та pruning історії.
- Виконуйте bootstrap/migrations один раз на rollout перед прийманням
  трафіку новими API та worker containers.
- Виберіть режим rollout випуску: stop-the-world (drain workers,
  зупинка scheduler/maintenance, заміна API nodes, bootstrap/migrations,
  restart workers і scheduler) або [rolling upgrades](/docs/rolling-upgrades),
  коли діє кожна гарантія цього контракту.
- Розглядайте базу та Redis як основні області відмов.
  Контейнери Server можна замінити. Persistence і coordination — ні.

Опубліковані самостійні recipes починаються з форми `standalone_server`,
хоча discovery також називає `split_control_execution` підтримуваною
топологією продукту. Це один контракт із різними призначеннями ролей.
Під час подальшої проби явнішого поділу ролей продовжуйте читати
`topology.current_shape`, `topology.current_roles` і `topology.matching_role`
з `/api/cluster/info`, а не виводити обов'язки з hostname чи назви контейнера.
[Топологія ролей Server](/docs/polyglot/server-role-topology)
пояснює призначення ролей та шлях міграції.

Кожен API node має використовувати однакові auth tokens чи signature keys,
версію застосунку, версію пакета workflow, конфігурацію codec payload,
підключення бази та Redis. Задайте кожному API node унікальний
`DW_SERVER_ID`, щоб discovery і логи могли розрізняти вузли.

Непідтримувані межі визначено явно: SQLite clustering, багатовузловий режим
без Redis, дублікати schedulers як стала топологія, active/active multi-writer
бази, власний regional failover без втручання та широкі SLA «five-nines»
чи «zero-downtime» потребують окремої перевірки або дизайну з підтримкою
перед використанням. Active/passive multi-region також є оцінювальним
матеріалом із підтримкою. Дивіться
[active/passive multi-region](#activepassive-multi-region).
Single-region HA failover: failover керованої бази, керованого Redis,
втрата API node, worker та restart scheduler runner в одному регіоні,
залишається оцінювальним контрактом із підтримкою до проходження перевірки
випуску. Цілі recovery рушія, readiness під час failover та потрібні
підтвердження наведено в
[single-region HA та failover](#single-region-high-availability-and-failover).

Цей шлях самостійний, коли команда вже має чітку модель VM, мережі,
бази, cache, backup і load balancer. Підтримка потрібна, коли слід
визначити ці межі, capacity, порядок rollout чи процедури recovery.

## Helm chart для Kubernetes {#helm-chart-for-kubernetes}

Репозиторій Server володіє
[кодом chart та настановами випуску](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow).
Установіть опублікований chart з OCI registry:

```bash
helm install durable-workflow \
  oci://ghcr.io/durable-workflow/charts/durable-workflow \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Values file має вказувати зовнішні MySQL/PostgreSQL і Redis,
надавати production credentials через наявні Kubernetes Secrets
та налаштовувати ingress/TLS вашого середовища.
Chart не створює сховище чи provider-managed інфраструктуру.
Для відтворюваного production додайте `--version <validated-chart-version>`
і закріпіть образ Server за digest. Репозиторій Server публікує
версії chart та документує upgrades поруч із кодом chart.

## Kubernetes manifests {#kubernetes-manifests}

Репозиторій Server містить raw manifests під
[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s)
для команд, які вже оперують Kubernetes:

- Namespace та спільні labels
- Поділ ConfigMap і Secret
- Bootstrap/migration Job
- API Deployment і Service
- Worker Deployment
- Scheduler CronJob
- PodDisruptionBudget
- Liveness probe `/api/health` та readiness probe `/api/ready`
- Консервативні resource requests і limits

Перед застосуванням manifests замініть image tag на конкретну
опубліковану версію чи digest, надайте справжні credentials бази та Redis
і підключіть ConfigMap до сервісів вашого кластера.
Manifests навмисно відкриті для перевірки та не є Helm chart.
Вони не обіцяють універсальної поведінки managed Kubernetes.

Для production rollout Kubernetes перевірте щонайменше:

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

Single-region HA failover: failover керованої бази, керованого Redis,
втрата API node, worker та restart scheduler runner в одному регіоні,
на raw-manifest шляху потребує підтримки, як і на малому кластері,
поки перевірка випуску не пройдена. Передбачений контракт потребує
правил readiness, singleton scheduler та спільного substrate у
[single-region HA та failover](#single-region-high-availability-and-failover).
Load balancers provider, storage classes, network policies,
active/active multi-region та власний regional failover без втручання
потребують підтримки або окремо відстежуються поза raw-manifest контрактом.
Для встановлення та upgrades через Helm використовуйте окремо
версійований Helm-шлях вище.

## Single-region HA та failover {#single-region-high-availability-and-failover}

Single-region HA failover зараз є **неперевіреним кандидатом контракту
з підтримкою** поверх невеликого кластера та raw Kubernetes.
Він охоплює відмови, які рушій розрахований витримати **в одному регіоні**:
failover керованої бази (RDS Multi-AZ, Aurora cluster failover, Cloud SQL HA,
Patroni promotion тощо), керованого Redis (Sentinel, Elasticache
replication-group failover, Memorystore HA тощо), втрату API node,
worker та restart scheduler/maintenance runner.
Active/passive recovery між регіонами є окремим оцінюванням із підтримкою.
Дивіться [active/passive multi-region](#activepassive-multi-region).

Передбачений контракт: поведінка рушія, readiness, цілі recovery
кожної події, запобігання split brain та приймальна репетиція,
зберігається в бібліотеці workflow:
[`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md)
та в окремому Server:
[`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md).
Цей розділ є публічною поверхнею цих документів.

### Стан підтвердження випуску {#release-evidence-status}

Для документованого публічного випуску Server немає посилання
на успішний результат точного випуску. Записана спроба опублікованого
образу зупинилася під час `topology_start`, очікуючи readiness API,
до підтвердження матриці відмов чи меж recovery.
Наявність runner, його scenario manifest чи репетиція окремого
розгортання не доводять проходження повної матриці опублікованим образом.
Тому single-region HA залишається шляхом із підтримкою.

Самостійний контракт дозволений лише після запуску без source code
з точним документованим випуском Server для image, runner та Compose-топології
і публікації `single-region-failover-result.json` із `outcome: "pass"`,
`runner_blocked: false`, `status: "pass"` кожного запису `phase_outcomes`,
успішними вердиктами всіх меж recovery та даними кожного обов'язкового
сценарію публічного
[scenario manifest single-region failover](/platform-conformance/single-region-failover-scenarios.json).
Посилання на цей публічний успішний результат має бути в цьому розділі
з тим самим образом Server, що й `%%artifact.serverDockerHubImage%%`.
До виконання всіх умов межі recovery нижче є цілями оцінювання,
а не твердженнями перевірки опублікованого образу.

### Кандидат топології {#candidate-topology}

Передбачений HA-контракт діє, коли розгортання відповідає формі
невеликого кластера чи raw manifests, а оператор зберігає три правила:

- **Завжди один writable endpoint бази workflow.** Керований failover
  (RDS Multi-AZ, Aurora cluster failover, Cloud SQL HA, Patroni тощо)
  дозволений, якщо попередній primary відгороджений через fencing
  до повторного підключення: відкликання write user, переведення
  в `read_only=on`, розрив replication чи restore відомого справного snapshot.
  Connection proxy (RDS Proxy, ProxySQL, PgBouncer) між API/scheduler
  та базою дозволений. Він не змінює гарантій, бо контракт рушія
  визначається підключенням, яке він бачить.
- **Один Redis endpoint одночасно з документованим promotion.**
  Керований failover Redis (Sentinel, Elasticache replication-group failover,
  Memorystore HA тощо) дозволений. Redis є шаром прискорення,
  тому failover Redis впливає на latency та не змінює correctness.
- **Завжди один scheduler/maintenance runner.** Orchestrator
  (Compose service з `deploy.replicas: 1`, systemd unit під host lease
  чи Kubernetes `Deployment` із `replicas: 1` та `RollingUpdate.maxSurge: 0`)
  відповідає за збереження singleton під час restart.
  Дублікати scheduler runners як стала топологія не входять до контракту.

### Поведінка та цілі recovery кожної події {#per-event-behavior-and-recovery-targets}

Передбачений контракт рушія визначає обмежені цілі recovery
для кожного класу подій. Вони не є гарантіями опублікованого образу
до проходження перевірки випуску. Спостережений оператором wall-clock recovery
дорівнює цілі рушія плюс latency promotion самого керованого сервісу.

| Подія | Передбачена поведінка рушія | Ціль recovery після повернення substrate / runner |
| --- | --- | --- |
| Failover керованої бази | Writes і reads повертають помилки. Writes не буферизуються приховано. `/api/ready` не проходить на всіх API nodes та scheduler. Підтверджена робота не втрачається. | Одне перепідключення connection pool, один інтервал `task_repair` (стандартно 3 с) та один timeout long poll (стандартно 30 с, максимум 60 с) для активних pollers. |
| Failover керованого Redis | Втрачені wake signals переводять discovery на timeout long poll. Health checks прискорення стають **warning**, а не error. `/api/ready` зазвичай залишається успішним. | Інтервал reconnect Redis client. |
| Втрата API node (1 з N) | Load balancer прибирає несправний вузол у межах readiness interval. Активні запити до нього не проходять у LB і повторюються клієнтом. | Readiness interval load balancer, контрольований оператором, зазвичай 5–10 с. |
| Втрата worker | Tasks несправного worker чекають до спливу lease. Інші workers продовжують claim своїх tasks. | Сплив lease (5 хв для activity tasks) плюс один інтервал `task_repair`. |
| Restart scheduler/maintenance | Запуски schedules, застосування activity timeouts та pruning історії призупиняються. Усі три відновлюються на наступному tick після restart. Дублікатів запуску немає, бо runner singleton. | Restart latency orchestrator плюс один tick scheduler. |

### Правила load balancer, readiness та переведення трафіку {#load-balancer-readiness-and-traffic-shift-rules}

Load balancer перед API nodes є єдиною точкою рішення
про приймання трафіку під час failover:

- Підключіть load balancer до **`GET /api/ready`**, а не лише `/api/health`.
  `/api/health` доводить обслуговування HTTP процесом. `/api/ready`
  доводить доступ Server до durable-бази та повідомляє здоровий
  чи погіршений стан прискорення wake Redis. За відмови бази `/api/ready`
  правильно не проходить на всіх вузлах. Load balancer МАЄ приймати
  стан all-down без повернення до застарілого «останнього справного» списку.
- Задайте інтервал перевірки 5–10 секунд та поріг видалення
  2–3 послідовних невдалих перевірок.
- Не вимагайте sticky sessions. Small-cluster smoke доводить,
  що зовнішній worker може poll `server-a` і complete на `server-b`.
- За failover лише Redis readiness залишається успішним на кожному вузлі,
  поки database-backed durable-шляхи доступні. Погіршення прискорення
  проявляється як `checks.cache.status=warning` з
  `checks.cache.degraded_capability=long_poll_wake_acceleration`.
  Не прибирайте вузли load balancer через цей warning.

Після recovery substrate рекомендовано дочекатися HTTP 200 від
`/api/ready` хоча б одного вузла, запитати `/api/cluster/info`
через load balancer з admin token для перевірки topology manifest,
виконати `POST /api/worker/register` probe worker через load-balanced
endpoint, перевірити рівно один активний scheduler runner
у його orchestrator та відновити зовнішній трафік.

### Репетиція точного артефакту {#run-the-exact-artifact-rehearsal}

Випуск Server містить багаторазову базову репетицію повної матриці відмов
без build продукту з checkout. Runner і Compose-топологія мають походити
з того самого release tag, що й image Server. Не поєднуйте мінливий checkout
стандартної гілки з довільним image. На чистому host з Docker Engine,
Docker Compose v2, Python 3.11 або новішим та доступом до публічних
реєстрів виконайте:

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

Цей шлях навмисно визначає checkout та `DW_SERVER_IMAGE` за однією
release variable. Не перевизначайте image незалежно.
Вибирайте інший випуск зміною `DW_SERVER_RELEASE` перед clone.
Runner потребує конкретного публічного tag чи digest Server,
завантажує всі допоміжні images, визначає repository digests усіх runtime images
і відхиляє Compose build sections, product-source bind mounts та локальні
або rolling references Server. Він запускає рівно два API nodes
за одним nginx endpoint, одну MySQL, один Redis
та один scheduler/maintenance runner.

Отриманий `single-region-failover-result.json` використовує schema
`durable-workflow.v2.single-region-failover.result`.
Він записує точні версії артефактів та інструментів, нормалізовану
топологію, readiness transitions, виміряні recovery times і вердикти меж,
ідентичності workflow/run/task/schedule та перевірки дублікатів/втрат
для cross-node completion, втрати API node, interruption бази,
Redis, втрати lease worker та restart singleton scheduler.
Зовнішні runners знаходять виклик і публічний scenario manifest
у `single_region_failover_contract` відповіді `GET /api/cluster/info`.

Результат підтверджує видимі рушію interruption та recovery
опублікованого образу лише після проходження вимог випуску вище.
Невдалий, частковий чи runner-blocked результат є діагностикою.
Навіть успішна база не перетворює restart локального контейнера
MySQL чи Redis на підтвердження promotion cloud provider.
Зберігайте provider-native promotion, fencing, RPO та elapsed-time дані
поруч із базовим результатом перед твердженнями про managed-service HA.

### Доповнення набору відновлення {#recovery-packet-additions}

Невеликий кластер чи raw-manifest розгортання, яке заявляє цей контракт,
МАЄ доповнити набір відновлення за
[операторськими межами експлуатації](/docs/operator-operating-envelope)
репетиціями кожного класу подій:

- failover керованої бази без втрати підтверджених записів
  та в межах recovery time вище;
- failover керованого Redis без коливань ротації load balancer,
  без втрати підтвердженої роботи та з `checks.cache.status=warning`
  і degraded capability `long_poll_wake_acceleration`;
- втрату API node, яку load balancer поглинає в налаштованому
  readiness interval без втрати підтверджених записів;
- втрату worker зі збереженням durable run до спливу lease,
  повторним claim у налаштованій межі repair та рівно одним completion;
- restart scheduler runner на іншому host без повторних schedules
  і без schedule, що залишився неоціненим після `next_fire_at` плюс один tick.

Поки перевірка випуску не пройдена, кожне розгортання потребує підтримки,
навіть якщо власна репетиція успішна. Після публічного успішного результату
всіх фаз розгортання стає самостійним за цим контрактом лише після
запису репетиції конкретного середовища в набір відновлення оператора
та її оновлення за періодичністю операторських меж експлуатації.

### Межа непідтримуваних тверджень HA {#boundary-against-unsupported-ha-claims}

Single-region HA контракт навмисно вузький.
Таке залишається **поза** ним і потребує дизайну з підтримкою,
бо сама топологія є частиною ризику продукту:

- active/active multi-writer топології баз;
- active/passive multi-region та автоматичний regional failover
  без втручання для власних топологій.
  [Наступний розділ](#activepassive-multi-region) зберігає оцінювальну настанову;
- синхронна міжрегіональна реплікація бази (RPO=0);
- дублікати scheduler/maintenance runners як стала топологія;
- прив'язані до регіону task queues як вісь маршрутизації рушія;
- перевірка managed-Kubernetes provider поза контрактом пакування chart;
- широкі SLA «five-nines» чи «zero-downtime» поза обмеженими recovery times вище.

Контракт визначає *обмежене recovery під час названих подій*.
Uptime залежить від бази, мережі та orchestrator оператора.
Маркетингові чи SLA-твердження власних розгортань НЕ МОЖУТЬ
переходити цю межу без окремої перевірки.

## Active/passive multi-region {#activepassive-multi-region}

Active/passive multi-region є **оцінювальною настановою з підтримкою**,
а не доведеним самостійним контрактом підтримуваних меж експлуатації 2.0.
Використовуйте цей розділ для перевірки кандидата архітектури та створення
репетиції конкретного середовища з підтримкою перед production.
Кожен регіон починається з документованого одновузлового, невеликого
кластерного чи raw Kubernetes шляху, але їхні single-region контракти
не встановлюють міжрегіональну replication, failover, failback, RPO, RTO
чи split-brain поведінку. Глибший дизайн: повноваження даних,
припущення replication, поведінка namespace/task queue/worker,
runbook failover/failback, fencing та компроміси consistency/latency,
міститься в бібліотеці workflow:
[`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md)
та в окремому Server:
[`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

Кандидат форми для оцінювання:

- Один **active region** із перевіреним одновузловим чи невеликим
  кластерним контрактом: API containers за load balancer, спільна
  зовнішня MySQL чи PostgreSQL як writable durable-база, спільний Redis,
  рівно один scheduler/maintenance runner та зовнішні workers.
- Один **standby region** з асинхронно реплікованою standby-базою workflow,
  необов'язковим standby Redis, без scheduler/maintenance process
  і з нулем чи більше заздалегідь підготовлених API/worker containers,
  які простоюють до promotion.
- **Regional failover** є явною роботою оператора: зупинка write traffic
  несправного регіону, перевірка replication за опублікованим RPO,
  promotion standby-бази, потрібні випуску migrations нового primary,
  старт singleton scheduler/maintenance runner нового active region,
  зміна endpoints workers, переведення зовнішнього трафіку та відновлення
  похідних projections. Автоматичного міжрегіонального cutover немає.
- **Failback** виконує ту саму послідовність у зворотному порядку після
  відновлення початкового регіону. Відновлений primary відгороджується
  до підключення як standby: відкликання write user, `read_only=on`,
  розрив replication чи restore відомого справного snapshot.

Повноваження даних та припущення replication:

- База workflow є єдиним durable-джерелом істини, прив'язаним до регіону.
  У будь-який момент записує рівно один регіон. База standby region
  залишається read replica до promotion. Recovery point objective (RPO)
  дорівнює затримці асинхронної replication, а recovery time objective (RTO) —
  часу виконання runbook оператором.
- Redis є локальним прискоренням регіону. Wake signals, locks query-task queues
  та admission locks не переносяться між регіонами. Кожен регіон запускає
  власний Redis. Cache standby може бути cold або warm за рішенням
  оператора. Correctness не залежить від його збереження під час failover.
- Огляд стану читає базу active region. Спочатку promotion, потім читання.

Поведінка namespace, task queue та реєстрації worker:

- Namespaces і task queues зберігаються в базі workflow та переживають
  promotion точно в стані останнього реплікованого commit.
  Рушій не поділяє їх за регіонами.
- Workers нового active region реєструються на локальному API endpoint
  після promotion. Попередні реєстрації несправного регіону залишаються
  в базі й спливають через звичайний шлях expiry worker.
- Rollouts build ID та deployment-lifecycle state переживають failover,
  оскільки зберігаються в базі workflow.

Компроміси consistency та latency у сталому стані:

- Запуски workflow, signals і updates фіксуються в базі active region.
  Їхня latency відповідає commit latency цього регіону.
  Вони відхиляються під час відкликання повноважень у failover.
- Доставка workflow tasks та activity tasks дотримується single-region
  контракту прискорення active region: менше секунди за здорового Redis,
  інакше durable poll cadence.
- Schedules запускає singleton scheduler active region.
  Вони призупиняються без scheduler і відновлюються з durable-рядків
  schedule після promotion.
- Огляд стану має read-after-write лише в active region.
  Рушій не надає міжрегіонального read-your-writes чи RPO=0.

Цей кандидат disaster recovery не замінює backups та підтвердження.
Набір відновлення за
[операторськими межами експлуатації](/docs/operator-operating-envelope)
залишається обов'язковим. Доповніть його replication-lag SLO,
latency promotion runbook, датою останньої успішної failover-репетиції
та fencing-процедурою відновленого primary.

Для власних розгортань active/passive та active/active multi-region,
автоматичний regional failover, синхронна міжрегіональна replication (RPO=0),
активна міжрегіональна видимість та region-pinned task queues
як вісь маршрутизації рушія залишаються
[шляхами з підтримкою](/docs/support), бо топологія є частиною ризику продукту.
Поточний [контракт керованого Cloud runtime](/docs/polyglot/cloud-control-plane)
є single-region і не надає цих multi-region гарантій.

## Контракт readiness {#readiness-contract}

Використовуйте перевірки і health, і readiness:

- `GET /api/health` доводить обслуговування HTTP процесом.
- `GET /api/ready` доводить доступ Server до налаштованих runtime-залежностей,
  включно з migrations і готовністю стандартного namespace.
- `GET /api/cluster/info` доводить, що автентифікований клієнт може знайти
  ідентичність build, протокол керування, worker-протокол, codecs payload
  та capabilities Server.
- `POST /api/worker/register` доводить можливість автентифікації workers
  в очікувані namespace та task queue.

Не переводьте трафік лише за `/api/health`.
