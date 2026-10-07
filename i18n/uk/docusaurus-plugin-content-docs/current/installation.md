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

- PHP 8.1 або новіший
- Laravel 9 або новіший

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

Використовуйте `durable-workflow/workflow:^2.0`, щоб Composer автоматично
приймав сумісні оновлення 2.x. Правила сумісності середовища виконання та
пакетів описано в [сумісності версій](/docs/compatibility).

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
