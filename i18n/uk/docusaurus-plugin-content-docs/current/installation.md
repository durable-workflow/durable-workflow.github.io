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

Коли PHP має розширення `pcntl`, worker черги примусово завершує будь-який job,
що виконується довше за свій тайм-аут: `--timeout` worker, типово 60 секунд,
якщо job не задає власний. Завдання workflow, завершене в такий спосіб, втрачає
оренду, а його зміни відкочуються. Його буде повторено лише після спливання
оренди (`workflows.v2.workflow_task_lease_seconds`, типово 300 секунд), і
повторна спроба виконає ту саму роботу ще раз. Завдання workflow, якому завжди
потрібно більше часу, ніж дозволяє тайм-аут, наприклад завдання, що планує або
завершує широкий `all()`, ніколи не завершиться.

Три налаштування мають узгоджуватися:

- **Тайм-аут завдання workflow** має бути меншим за
  **оренду завдання workflow**. Робота, що триває довше за оренду, не може
  завершитися.
- **`retry_after`** з’єднання черги має перевищувати тайм-аут кожного job у
  цьому з’єднанні, як вимагає Laravel. Інакше черга передасть job, що ще
  виконується, другому worker.
- **Activity** мають зберігати обмежений тайм-аут, щоб завислий activity не міг
  утримувати worker назавжди. Не використовуйте `--timeout=0`.

Запускайте завдання workflow в окремому з’єднанні черги, у якого `retry_after`
перевищує оренду, з worker, чий `--timeout` менший за оренду. Запускайте
activity в іншій черзі з тайм-аутом, що їм підходить. Activity використовують
чергу свого workflow, якщо клас activity не задає власні `$connection` або
`$queue`.

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

У Horizon параметр `timeout` кожного супервізора є тайм-аутом worker. Новіші
випуски Workflow задають цей тайм-аут кожному job завдання workflow (оренда
мінус 30 секунд, і щонайменше на 10 секунд менше за `retry_after`), тож короткий
тайм-аут worker більше не завершує завдання workflow. Worker у черзі workflow
під час запуску записує в журнал попередження, коли `retry_after` обмежує
завдання workflow.
