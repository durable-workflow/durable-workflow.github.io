---
sidebar_position: 24
title: Сесії worker
description: Прив’язуйте послідовність стійких спроб activity до однієї оренди сесії worker для GPU, файлової системи або локального стану процесу.
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - сесії worker
  - прив’язка activity
  - worker GPU
  - worker з локальною файловою системою
  - сесії протоколу worker
---

# Сесії worker {#worker-sessions}

Сесії worker — це примітив прив’язки activity у v2. Використовуйте їх, коли
кілька стійких кроків activity мають повторно використовувати локальний стан
процесу, пам’ять GPU, змонтовану файлову систему або інший локальний ресурс worker.

## Стислий контракт {#contract-summary}

- У кожен момент сесія має одного власника оренди.
- Перша допущена activity у сесії створює або повторно отримує оренду.
- Heartbeat activity поновлюють оренду спроби activity та оренду сесії.
- `POST /api/worker/sessions`, `POST /api/worker/sessions/{sessionId}/heartbeat`
  та `DELETE /api/worker/sessions/{sessionId}` надають явні операції життєвого
  циклу для зовнішніх worker.
- Спочатку виконується маршрутизація черг. Допуск до сесії worker відбувається
  після реєстрації worker у черзі завдань.
- `capabilities` реєстрації worker мають задовольняти всі вимоги сесії.
- Прострочені сесії та сесії без власника видимі операторам і можуть бути
  отримані повторно, якщо сесія дозволяє відновлення після збою.

## API для написання коду {#authoring-api}

Автори PHP workflow створюють дескриптор сесії через `Workflow::workerSession()`
або `Workflow\V2\workerSession()` і планують activity через цей дескриптор:

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

Знімок параметрів activity зберігає той самий контракт у
`activity_options.worker_session`. Зовнішні runtime використовують таку саму
структуру JSON у полі `worker_session` команди завдання workflow `schedule_activity`.

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Життєвий цикл {#lifecycle}

Сесія створюється ліниво. Шар підбору завдань створює або повторно отримує
сесію, коли перше завдання activity у сесії допускається до worker із потрібними
можливостями. Worker також може явно створити сесію перед опитуванням через
`POST /api/worker/sessions`.

Активна сесія завершується після закриття власником, спливу оренди сесії,
спливу абсолютного TTL або виявлення збою worker-власника. Сплив TTL і явне
закриття є термінальними для цього ID сесії. Після спливу оренди або виявлення
відсутності власника сесію можна отримати повторно, якщо
`allow_reacquire_after_failure` має значення true.

## Оренда й володіння {#lease-and-ownership}

Одночасно орендою сесії володіє щонайбільше один worker. Сервер допускає
завдання activity у сесії лише за виконання однієї з умов:

- сесія відсутня, а `create_if_missing` має значення true;
- активною сесією вже володіє worker, який опитує чергу;
- сесія прострочена, завершилася збоєм або втратила власника, а повторне отримання дозволено.

Володіння сесією не замінює оренди окремої спроби activity. Кожна спроба
activity має власні `activity_attempt_id`, власника оренди, heartbeat,
шляхи завершення, помилки, тайм-ауту й скасування.

## Допуск і маршрутизація {#admission-and-routing}

Сесії worker беруть участь у звичайній маршрутизації черг. `WorkerSessionOptions`
може задавати `connection` та `queue`, а `ActivityOptions` окремого виклику
може їх перевизначити. Сервер перевіряє допуск до конкретної сесії після
звичайного допуску до черги завдань:

- `capabilities` реєстрації worker мають покривати всі вимоги сесії;
- `max_concurrent_activities` обмежує кількість орендованих спроб activity
  у сесії;
- `max_concurrent_worker_sessions` обмежує кількість активних оренд сесій,
  які утримує одна реєстрація worker.

Маршрутизація для конкретної групи worker використовує звичайні рядки
можливостей, наприклад `gpu:nvidia-l4`, `gpu:a100`, `fs:/mnt/models` або
`zone:us-east-1a`.

## Збої, скасування й зупинка {#failure-cancellation-and-shutdown}

Heartbeat activity поновлюють оренду спроби activity та оренду сесії. Worker
також можуть поновлювати сесію безпосередньо через протокол worker. Після
спливу оренди сесія стає `expired`. Якщо heartbeat реєстрації worker-власника
застарів або відсутній, сесія стає `orphaned`.

Якщо worker-власник гине посеред послідовності, активні activity зберігають
звичайну семантику at-least-once: оренди спроб спливають, відновлення робить
їх знову доступними для отримання, а застаріле завершення може бути відхилене.
Worker із потрібними можливостями може повторно отримати сесію, якщо контракт
це дозволяє. Автори workflow мають передбачити відновлення локального стану
процесу після повторного отримання.

Скасування workflow також передається у відповідях heartbeat activity. Оренда
сесії ніколи не дозволяє activity у сесії ігнорувати `cancel_requested`.
Перед запланованою зупинкою процесу worker має закрити свої сесії через
`DELETE /api/worker/sessions/{sessionId}`. Активні activity і далі завершуються,
повідомляють помилку, скасовуються або спливають за власними орендами спроб.

## Видимість {#visibility}

Можливості протоколу worker повідомляють `worker_session_verbs` і контракт
runtime `worker_sessions` через `GET /api/cluster/info` та кожну відповідь
площини worker. Машиночитаний контракт опубліковано в
[`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)
і включено до каталогу
[специфікації протоколів платформи](/docs/platform-protocol-specs#worker-session-runtime-notes).

Оператори можуть переглядати активні, закриті, прострочені, неуспішні сесії
та сесії без власника через `GET /api/worker-sessions`. Деталі містять ID сесії,
власника, чергу, вимоги, сплив оренди, сплив TTL, кількість активних activity
та причину збою. Системні метрики оператора містять кількість сесій кожного стану.

## Коли обирати сесії worker {#choosing-worker-sessions}

Обирайте звичайні activity у черзі, коли кожен крок незалежний. Обирайте одну
більшу activity, коли вся операція є одним атомарним побічним ефектом.
Використовуйте сесію worker лише тоді, коли кілька стійких кроків activity
мають повторно використовувати локальний ресурс worker, а workflow допускає
відновлення цього ресурсу після збою worker.

Як сесії worker пов’язані зі звичайними activity у черзі, локальними activity
та sticky execution, описано в розділі
[Модель виконання activity](/docs/features/activity-execution-model).
