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
якщо job не задає власний. Зміни завдання workflow, завершеного в такий спосіб,
відкочуються. Його буде повторено лише після спливання його оренди
(`workflows.v2.workflow_task_lease_seconds`, типово 300 секунд), і це
зараховується як втрачена оренда; повторна спроба виконає ту саму роботу ще раз.
Завдання workflow, якому завжди потрібно більше часу, ніж дозволяє тайм-аут,
наприклад завдання, що планує або завершує широкий `all()`, ніколи не
завершиться.

Три налаштування мають узгоджуватися:

- **Тайм-аут worker, що виконують завдання workflow**, має покривати ваше
  найдовше завдання workflow. Завершене завдання workflow чекає до кінця своєї
  оренди, перш ніж його буде повторено.
- **`retry_after`** з’єднання черги має перевищувати тайм-аут кожного job у
  цьому з’єднанні, як вимагає Laravel. Інакше черга передасть job, що ще
  виконується, другому worker.
- **Activity** мають зберігати обмежений тайм-аут, щоб завислий activity не міг
  утримувати worker назавжди. Не використовуйте `--timeout=0`.

Щоб задати для activity коротший тайм-аут, ніж для завдань workflow, запускайте
їх в окремій черзі з окремими worker. Activity виконуються в з’єднанні та черзі
свого workflow, крім випадків, коли клас activity задає `$connection` або
`$queue` чи workflow передає `ActivityOptions`.

```php
// config/queue.php
'redis' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'default',
    'retry_after' => 330, // above the workflow task workers' timeout
],
```

```php
use Workflow\V2\Activity;

final class ChargeCardActivity extends Activity
{
    public ?string $queue = 'activities';
}
```

```bash
php artisan queue:work redis --queue=default --timeout=300      # workflow tasks
php artisan queue:work redis --queue=activities --timeout=60    # activities
```

У Horizon параметр `timeout` кожного супервізора є тайм-аутом worker.

Workflow 2.34.0 додає `DW_V2_WORKFLOW_TASK_JOB_TIMEOUT_SECONDS`, типово не
заданий. Якщо його задано, кожен job завдання workflow має цей тайм-аут,
щонайменше на 10 секунд менший за `retry_after` його з’єднання, і worker
використовують його для таких job замість власного тайм-ауту, тож завдання
workflow та activity можуть спільно використовувати worker. Починаючи з цього
випуску, worker, що обслуговує чергу workflow, під час запуску записує в журнал
попередження, коли тайм-аут, з яким виконуються його завдання workflow, менший
за оренду завдання workflow.
