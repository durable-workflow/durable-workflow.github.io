---
sidebar_position: 8
---

# Heartbeat {#heartbeats}

Heartbeat дають тривалій activity змогу повідомляти, що її поточна спроба досі працює.

`heartbeat()` оновлює отриманий worker запис `activity_attempts`, переносить останній heartbeat у поточне виконання activity, поновлює оренду завдання activity й додає типізовану подію історії `ActivityHeartbeatRecorded` для поточної спроби. Детальний перегляд вибраного запуску у Waterline та експорт історії відновлюють стан спроби, ID завдання, worker, heartbeat, оренду, скасування й час закриття насамперед із типізованої історії `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` та `ActivityCancelled`. Змінювані записи спроб використовуються як запасне джерело або доповнення для старих даних.

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

Усередині activity методи `activityId()`, `attemptId()` та `attemptCount()` надають ідентичність стійкого виконання й поточної спроби, якщо потрібні ключі кореляції для зовнішньої роботи. Типовим ключем ідемпотентності віддаленої роботи обирайте `activityId()`. Використовуйте `attemptId()` лише для систем, яким потрібно розрізняти окремі спроби одного стійкого виконання activity.

Worker різних мов можуть надсилати heartbeat через HTTP-міст worker без створення екземпляра PHP-класу activity. Кінцеві точки наведено в [протоколі worker](/docs/polyglot/worker-protocol).

## Знімки прогресу {#progress-snapshots}

`Activity::heartbeat()` та `ActivityTaskBridge::heartbeat()` приймають необов’язковий знімок прогресу з обмеженим розміром:

- `message`
  - непорожній рядок завдовжки до 280 символів
- `current`
  - невід’ємне ціле число або число з рухомою комою
- `total`
  - невід’ємне ціле число або число з рухомою комою
- `unit`
  - непорожній рядок завдовжки до 64 символів
- `details`
  - пласка мапа з не більш ніж 20 записів `key => scalar|null`, де ключі відповідають `[A-Za-z0-9_.:-]{1,64}`

Використовуйте ці дані для показу прогресу оператору, наприклад `"Downloading chunk"` або `2 / 5 chunks`, а не для великих журналів чи довільного вкладеного стану. Детальний перегляд вибраного запуску у Waterline, запис heartbeat у хронології та експорт історії повертають їх у полі `last_heartbeat_progress` activity й поточної спроби. Необроблена типізована подія історії `ActivityHeartbeatRecorded` зберігає ті самі нормалізовані дані в `progress`.

## Стійке відстеження спроб {#durable-attempt-tracking}

Runtime зберігає окремий стійкий запис для кожної спроби activity: номер, стан, час початку, останній heartbeat, сплив оренди й час закриття. Він також записує типізовану історію початку, heartbeat, повторних спроб, завершення, помилок і скасування activity. Тому історичні деталі спроб зберігаються, навіть якщо змінювані записи спроб або завдань згодом розходяться з історією. Кожен успішний heartbeat поточної отриманої спроби записує компактну подію хронології `ActivityHeartbeatRecorded` з ID виконання activity, ID спроби activity, часовою міткою heartbeat, спливом оренди та знімком activity на момент події. Якщо команда cancel або terminate закриває запуск, міст записує `ActivityCancelled`, коли worker виявляє зупинку, і відхиляє подальше завершення або помилку як застарілі, не перетворюючи скасування на результат.

Heartbeat — це операційні ознаки активності. Кожен прийнятий heartbeat входить до стійкої історії, тому обирайте інтервал відповідно до потреб тайм-аутів і відновлення, а не використовуйте його як інтенсивний журнал прогресу. Необов’язковий знімок прогресу має залишатися компактним для діагностики оператором, а не перетворюватися на потік подій.
