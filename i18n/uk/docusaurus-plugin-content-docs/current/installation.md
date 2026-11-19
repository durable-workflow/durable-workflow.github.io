---
sidebar_position: 3
---

# Встановлення {#installation}

Цей посібник описує встановлення PHP-пакета Durable Workflow для застосунків Laravel.

Якщо ви обираєте між вбудованим пакетом та окремим Server, почніть із
[моделей розгортання](/docs/polyglot/deployment-modes). Ця сторінка описує
вбудований режим Laravel.

> **Хочете почати з робочого застосунку?**
> [Sample App](/docs/sample-app) є готовим проєктом Laravel 13 на
> Durable Workflow 2.0 з окремим workflow для кожного шаблону,
> запуском через Codespaces або `docker compose`. Клонуйте його,
> виконайте `php artisan app:init`, і потрібне встановлення вже буде
> налаштовано. Поверніться сюди, коли будете готові додати Durable Workflow
> до власного застосунку Laravel.

## Вимоги {#requirements}

- PHP 8.2 або новіший у лінійці 8.x
- Laravel 12.72 або новіший у 12.x чи Laravel 13.41 або новіший у 13.x
- PHP 8.3 або новіший для Laravel 13

Ці вимоги стосуються поточного вбудованого випуску. Перед оновленням Composer
у старому застосунку виберіть [сумісну опубліковану лінійку](./compatibility.md#laravel-support).
Базовий PHP SDK сервісного режиму має окремі вимоги.

Дивіться [сумісність баз даних](./polyglot/database-support.md): заяви вбудованого режиму та Server, точні перевірені конфігурації й межі кваліфікації.

Durable Workflow підтримує всі драйвери черг Laravel, крім `sync`, зокрема:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Кожен драйвер черги має власні
[передумови](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Durable Workflow також потребує драйвера кешу з підтримкою
[блокувань](https://laravel.com/docs/12.x/cache#atomic-locks).

## Встановлення Durable Workflow {#installing-durable-workflow}

Durable Workflow можна встановити через Composer:

```bash
composer require %%artifact.workflowComposerPackage%%
```

Команда вище фіксує опублікований вбудований випуск. Перед розширенням
обмеження чи оновленням старого застосунку Laravel перевірте
[межі підтримки й оновлення Laravel](./compatibility.md#laravel-support).

Пакет автоматично завантажує свої міграції. Після встановлення достатньо
звичайного запуску міграцій:

```bash
php artisan migrate
```

## Запуск worker {#running-workers}

Durable Workflow використовує черги для фонового виконання workflow та
activity. Потрібно запустити
[команду](https://laravel.com/docs/12.x/queues#the-queue-work-command)
`queue:work` або скористатися [Horizon](https://laravel.com/docs/12.x/horizon)
для запуску worker черги. Без worker черги workflow та activity не
оброблятимуться. Для паралельного виконання потрібно кілька worker черги.

### Тайм-аут worker {#worker-timeout}

```bash
php artisan queue:work --timeout=0
```

Коли PHP має розширення `pcntl`, `queue:work` примусово завершує будь-який job
черги, що виконується довше за `--timeout` секунд (типово 60). Зміни завдання
workflow, завершеного в такий спосіб, відкочуються. Завдання буде повторено
після спливання оренди завдання workflow (типово 300 секунд), і повторна спроба
виконає ту саму роботу ще раз. Завдання workflow, якому завжди потрібно більше
часу, ніж дозволяє тайм-аут, наприклад завдання, що планує або завершує широкий
`all()`, ніколи не завершиться.

Запускайте worker для workflow з `--timeout=0` або зі значенням, більшим за
тривалість вашого найдовшого завдання workflow. Тримайте
`workflows.v2.workflow_task_lease_seconds` вищим за це значення. У Horizon
параметр `timeout` супервізора є тим самим налаштуванням.
