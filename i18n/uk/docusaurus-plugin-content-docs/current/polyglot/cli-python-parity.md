---
title: Можливості клієнтів і worker
description: Порівняння можливостей клієнтів і worker CLI, PHP SDK, Python SDK та Rust SDK.
---

# Можливості клієнтів і worker {#client-and-worker-capabilities}

Оберіть інтерфейс за потребами процесу. CLI `dw` та офіційні SDK PHP,
Python і Rust використовують спільні контракти площини керування v2
та worker, але їхні ролі оператора, клієнта й worker відрізняються.

Цей посібник для всіх клієнтів залишається за початковим маршрутом
`/docs/polyglot/cli-python-parity/`, щоб наявні посилання працювали.

## Порівняння можливостей {#capability-comparison}

| Можливість | CLI `dw` | PHP SDK | Python SDK | Rust SDK |
| --- | --- | --- | --- | --- |
| Життєвий цикл workflow | **Підтримується:** команди оператора для запуску, списку, перегляду, очікування, скасування, припинення й архівування. [Команди](./cli-reference.md#workflow-commands) | **Підтримується:** запуск, опис, список, очікування результатів, скасування й припинення через `Client` і `WorkflowHandle`. [Докази життєвого циклу](./php.md#lifecycle-updates-schedules-and-visibility) | **Підтримується:** запуск, список/опис, очікування результатів, скасування й припинення через async-клієнт. [Операції workflow](./python.md#workflow-operations) | **Підтримується:** запуск, опис, очікування результатів, скасування й припинення через `Client` і `WorkflowHandle`. [Термінальні операції](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| Signal | **Підтримується:** надсилання за ID workflow або обраним run. [Команди](./cli-reference.md#workflow-commands) | **Підтримується:** методи надсилання клієнта й handle та історія signal worker. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Підтримується:** async-клієнт надсилає signal, а worker workflow обробляють їх. [Повідомлення](./python.md#signals-queries-and-updates) | **Підтримується:** надсилання клієнтом і handle та обробка signal worker. [Rust API](https://rust.durable-workflow.com/) |
| Query | **Підтримується:** виконання іменованого query лише для читання зі структурованим виводом. [Команди](./cli-reference.md#workflow-commands) | **Підтримується:** query клієнта й handle та зареєстровані обробники query worker. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Підтримується:** query async-клієнта та обробники query worker через replay. [Повідомлення](./python.md#signals-queries-and-updates) | **Підтримується:** query клієнта та обробники query worker через replay, коли виявлення runtime оголошує підтримку завдань query. [Rust API](https://rust.durable-workflow.com/) |
| Update | **Підтримується:** подання й очікування прийнятого або завершеного результату. [Команди](./cli-reference.md#workflow-commands) | **Підтримується:** `updateWorkflow` і `registerUpdate`. PHP SDK не має написання валідаторів і не оголошує їх. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Підтримується:** клієнти, обробники workflow та синхронні оголошені валідатори, коли виявлення оголошує контракт перевірки перед прийняттям. Worker із валідаторами відхиляють непідтримувані runtime. [Повідомлення](./python.md#signals-queries-and-updates) | **Підтримується:** клієнт, handle, payload Avro та зареєстровані інтерфейси update worker. Rust SDK не має написання валідаторів і не оголошує їх. [Update](./rust.md#workflow-updates) |
| Розклади | **Підтримується:** повний життєвий цикл розкладу, backfill та історія аудиту. [Команди](./cli-reference.md#schedule-commands) | **Підтримується:** повний життєвий цикл розкладу та список через `Client`. [PHP API](./php.md#lifecycle-updates-schedules-and-visibility) | **Підтримується:** повний async-життєвий цикл розкладу та посторінкова історія аудиту. [Розклади](./python.md#schedules) | **Не підтримується:** поточний Rust SDK не заявляє API керування розкладами. Використовуйте CLI, PHP, Python або Server API. |
| Видимість | **Підтримується:** пошук workflow/run, worker, черги завдань, історія та JSON діагностики. [Команди](./cli-reference.md#workflow-commands) | **Підтримується:** фільтрування/посторінковий перегляд workflow, історія, простори імен, worker та черги завдань. [Докази видимості](./php.md#lifecycle-updates-schedules-and-visibility) | **Підтримується:** клієнтські інтерфейси workflow, розкладів, просторів імен, worker, черг, історії та пошукових атрибутів. [Client API](./python.md#client-api-reference) | **Відрізняється:** опис/результат обраного run підтримуються. Загальний список/пошук усіх worker/run та адміністрування просторів імен не заявлені. [Клієнт Rust](./rust.md#package-and-source) |
| Виконання worker | **Навмисно відрізняється:** низькорівневі команди протоколу worker підтримують діагностику й перевірку відповідності. `dw` не є runtime worker застосунку. [Команди worker](./cli-reference.md#worker-protocol-commands) | **Підтримується:** віддалені обробники workflow, activity, query та update через `durable-workflow/sdk`. [Worker PHP](./php.md#run-a-remote-php-worker) | **Підтримується:** детерміновані worker workflow та activity. [Worker Python](./python.md#worker) | **Підтримується:** власні обробники workflow, activity, query та update. [API worker Rust](https://rust.durable-workflow.com/) |

**Підтримується** означає, що названий інтерфейс поточного випуску має
можливість. **Відрізняється** позначає навмисну межу ролі.
**Не підтримується** є явною поточною прогалиною без прихованої обіцянки.
Виявлення протоколу runtime залишається джерелом істини, коли можливість
залежить від узгодженого протоколу worker.

## Докази за інтерфейсами продукту {#evidence-by-product-surface}

### CLI {#cli}

[Огляд CLI](./cli.mdx) визначає встановлення, профілі, структурований
вивід і поведінку кодів завершення.
[Довідник команд](./cli-reference.md) містить повний інтерфейс оператора:
життєвий цикл, повідомлення, розклади, видимість і низькорівневі команди
протоколу worker, які не є циклом worker SDK.

### PHP SDK {#php-sdk}

Зафіксований PHP SDK має API клієнта та віддаленого worker, незалежні
від фреймворку. Його поточний публічний інтерфейс містить життєвий цикл
workflow й handle результатів, signal, query, update, розклади,
фільтрування/історію workflow, видимість просторів імен, worker і черг
завдань, а також зареєстровані обробники workflow, activity, query та update.
Дивіться [посібник PHP SDK](./php.md) і згенерований
[довідник PHP API](https://php.durable-workflow.com/api/).

### Python SDK {#python-sdk}

Python SDK поєднує async-клієнт площини керування з детермінованими worker
workflow та activity. Його посібник описує
[операції клієнта](./python.md#client-api-reference),
[обробники повідомлень](./python.md#signals-queries-and-updates),
[виконання worker](./python.md#worker) і
[керування розкладами](./python.md#schedules). Згенерований
[довідник Python API](https://python.durable-workflow.com/) містить точні
сигнатури й типи результатів.

### Rust SDK {#rust-sdk}

Опублікований Rust SDK має площину керування й життєвий цикл обраного run,
signal, query через replay, update та власні worker workflow/activity.
Підтримка update містить `Client::update_workflow`, `WorkflowHandle::update`,
`Worker::register_update` та їхні варіанти зі значеннями Avro.
Керування розкладами й загальний список/пошук залишаються явними прогалинами.
Дивіться [посібник Rust SDK](./rust.md) і згенерований
[довідник Rust API](https://rust.durable-workflow.com/).

## Докази спільного контракту {#shared-contract-evidence}

Усі чотири продукти працюють з однаковою версійованою площиною керування
HTTP+JSON та публічним конвертом payload. Докази поділено за тим, що вони
підтверджують:

- [Індекс можливостей](/docs/capabilities/) фіксує точні мінімальні
  версії артефактів і поточний набір підтримки.
- [Набір перевірок відповідності платформи](/docs/platform-conformance/)
  фіксує сценарії runtime між клієнтами та worker.
- Репозиторії CLI й Python зберігають спільні фікстури запитів операцій,
  для яких семантичні тіла запитів зараз порівнюються байт у байт.
- Публічні довідники API PHP та Rust і тести випусків підтверджують
  додаткові підтримувані методи, перелічені вище.

Наявність спільної фікстури у двох репозиторіях не означає відсутності
операції в інших SDK. Так само спільний endpoint не означає, що кожен
продукт має однакову роль оператора чи worker.

## Додавання або розширення клієнтського інтерфейсу {#adding-or-extending-a-client-surface}

Під час додавання нової операції CLI або SDK:

1. Зберігайте шляхи, методи, семантичні поля, конверти payload і результати
   помилок незалежними від мови.
2. Додавайте докази запитів і runtime для кожного клієнта чи worker-учасника.
3. Документуйте навмисні відмінності синтаксису або межі ролей.
4. Явно позначайте непідтримувані продукти.
5. Вважайте мовну серіалізацію, шляхи файлів, назви класів або форми
   помилок дефектами публічного контракту.
