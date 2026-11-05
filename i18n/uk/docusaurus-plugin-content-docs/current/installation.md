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

Опублікована лінійка Workflow 2.20.x потребує:

- PHP `^8.1`
- Laravel 10–13 із мінімальними версіями, задекларованими в
  [маніфесті пакета](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)

Laravel 11 і 12 потребують PHP 8.2 або новішої версії; Laravel 13 — PHP 8.3 або
новішої. Точні обмеження та окрему межу PHP SDK дивіться в
[сумісності версій](/docs/compatibility/#embedded-php-and-laravel-support).

### Підготовка до Workflow 2.21 {#preparing-for-workflow-2-21}

:::info Ще не опублікована зміна підтримки

Вихідний код Workflow 2.21 потребує PHP `^8.2` та Laravel `^12.69.0|^13.30.0`.
Ця версія ще не опублікована й не пройшла Release Verification. Команда нижче
й надалі вибирає опублікований артефакт; інтеграція вихідного коду не змінює
це джерело повноважень.

:::

Перш ніж переходити на 2.21, оновіть застосунки з PHP 8.1 або Laravel 10/11 до
підтримуваної платформи. Laravel 13 і надалі потребує щонайменше PHP 8.3.
Оновіть вебпроцеси, CLI та workers, зберігаючи наявний lock-файл застосунку
2.20.x під час підготовки й тестування. Явна вимога 2.21 має відхиляти
непідтримувану платформу; залиште ввімкненими перевірки платформи та блокування
за повідомленнями безпеки Composer. Збереження 2.20.x не продовжує підтримку
безпеки старих версій PHP або Laravel їхніми розробниками.

Ця зміна підтримки не запроваджує міграції схеми, історії чи протоколу.
Наявні запуски v1 залишаються під керуванням v1;
[процедура міграції](/docs/migration/) і надалі визначає drain або співіснування.

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
