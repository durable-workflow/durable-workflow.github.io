---
sidebar_position: 4
title: Timer
description: Використовуйте стійкі timer та детермінований час workflow без залежності від реального часу процесу.
tags:
  - timers
  - deterministic-time
  - waits
keywords:
  - стійкі timer
  - детермінований час
  - час workflow
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Timer {#timers}

Фреймворк дозволяє призупинити виконання workflow та продовжити його пізніше.
Це стійкі timer: вони переживають перезапуски й збої та залишаються узгодженими
із семантикою відтворення workflow. Це корисно для затримок, логіки повторних
спроб чи тайм-аутів.

Для використання timer викличте `timer($duration)` усередині workflow:

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        timer(30);

        return 'The workflow waited 30 seconds.';
    }
}
```

<TimerSimulator />

## Роздільність затримок {#delay-resolution}

Затримки стійких timer задаються в цілих секундах. Передавайте ціле число секунд,
наприклад `timer(1)`. Якщо використовується рядок інтервалу PHP або `CarbonInterval`,
додатна тривалість із часткою секунди округлюється вгору до наступної цілої секунди.
Отже, 100 мс перетворюються на одну секунду. `timer(0)` і далі спрацьовує в поточному завданні.

Настання строку лише дозволяє обробити timer. Затримка черги та навантаження worker
можуть відкласти виконання, тому ця роздільність не гарантує точного моменту
відновлення й не зменшує точність записаних часових міток. Дивіться
[тестування](../testing.md#keeping-delay-tests-fast), щоб уникнути реального очікування.

Поведінка timer:

- кожен `timer()` створює стійкий рядок timer та типізовані події історії
  `TimerScheduled`, `TimerFired` і, після заміщення, `TimerCancelled`
- відкладені timer виконуються через окреме завдання timer до відновлення
  завдання workflow
- `timer(0)` спрацьовує безпосередньо під час завдання workflow та не створює
  завдання timer
- шляхи відтворення й query вважають типізовану історію `TimerScheduled`,
  `TimerFired` та `TimerCancelled` авторитетним джерелом життєвого циклу timer.
  Тому звичайні timer залишаються заблокованими до надходження зафіксованої
  події спрацювання, а деталі обраного запуску можуть відновити з історії
  відкриті, спрацьовані чи скасовані очікування timer
- Waterline показує очікування timer у деталях запуску та даних панелі
- команди `cancel()` і `terminate()` на рівні рушія стійко заміщують відкриті
  очікування timer. Запізнілі завдання timer нічого не змінюють і не відкривають
  запуск повторно

Timer будь-якої тривалості працюють із кожним драйвером черг Laravel, включно
з Amazon SQS. Рушій автоматично ділить довгі затримки на частини відповідно до
межі драйвера для одного повідомлення.

`sideEffect()` доступний для знімків, безпечних для відтворення, наприклад
випадковості чи одноразових вхідних даних розгалуження.

## Читання детермінованого часу {#reading-deterministic-time}

У тілі workflow для поточного часу використовуйте `Workflow::now()` або
`Workflow\V2\now()` замість допоміжної функції Laravel `now()` чи `Carbon::now()`:

```php
use function Workflow\V2\activity;
use function Workflow\V2\now;
use Workflow\V2\Workflow;

class DurationAwareWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $startedAt = Workflow::now();
        $greeting = activity(GreetingActivity::class, $name);
        $finishedAt = Workflow::now();

        return [
            'greeting' => $greeting,
            'took_ms' => $finishedAt->getTimestampMs() - $startedAt->getTimestampMs(),
        ];
    }
}
```

`Workflow::now()` просувається, коли виконавець відтворює події історії. Він
повертає `recorded_at` останнього завершення activity, спрацювання timer,
отримання signal, розв’язання умови чи завершення дочірнього workflow, яке
спожило відтворення. До споживання будь-якої події він повертає `started_at`
запуску. Поза Fiber workflow, наприклад в activity чи методі query, що делегує
допоміжній функції поза workflow, він використовує реальний час `now()`.

Використання `Workflow::now()` зберігає детермінованість workflow: два
відтворення тієї самої історії повертають ті самі значення часу, навіть якщо
між ними реальний час просунувся.
