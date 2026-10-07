---
sidebar_position: 10
---

# Принцип роботи {#how-it-works}

Durable Workflow використовує завдання черг Laravel та зберігання на основі подій для створення стійких корутин. Workflow призупиняються через допоміжні виклики на основі Fiber, забезпечуючи контракт стійкого відтворення.

## Середовище виконання {#runtime}

Workflow — клас, метод `handle()` якого послідовно викликає допоміжні функції, зокрема `activity()`, `await()`, `timer()`, `sideEffect()`, `child()` та `all([...])`. Кожен виклик призупиняє workflow до завершення відповідного стійкого кроку, а потім продовжує з того самого місця із записаним результатом.

Кожен крок створює стійку подію історії. Рушій відтворює історію щоразу, коли workflow прокидається, відновлюючи стан із потоку подій перед виконанням наступного невиконаного кроку. Це відтворення дозволяє workflow переживати перезапуски worker, розгортання та збої машин без втрати позиції.

`WorkflowStub::make()` резервує публічний ідентифікатор екземпляра workflow. Запуск workflow створює перший запуск і перше завдання workflow. Кожен запуск має власний ідентифікатор. Операції `signal()`, `cancel()` та `terminate()` спрямовані на поточний запуск екземпляра.

## Event sourcing {#event-sourcing}

Event sourcing відновлює поточний стан із послідовності збережених подій замість безпосереднього збереження стану. Це надає повну історію подій виконання та дозволяє продовжити workflow, якщо worker аварійно завершиться.

## Корутини {#coroutines}

Корутини — функції, виконання яких можна призупиняти та продовжувати. Стійкі точки призупинення виражаються послідовними допоміжними викликами на основі Fiber, зокрема `activity()`, `await()`, `timer()` та `sideEffect()`.

Код користувацького workflow розміщується в `handle()`, звичайному методі, що безпосередньо викликає ці допоміжні функції. Середовище виконання спочатку перевіряє, чи крок уже завершився стійко. Якщо так, збережений результат відтворюється з історії без повторного виконання кроку. Інакше середовище ставить у чергу наступну activity, timer чи дочірню роботу та призупиняється до успіху чи помилки цього стійкого кроку.

## Activity {#activities}

Викликаючи кілька activity, workflow може координувати їхні результати. Виконання workflow чергується зі стійкими кроками, які він планує: workflow доходить до виклику activity, призупиняється до її завершення, а потім продовжує виконання з того самого місця.

У разі збою workflow події до збою відтворюються для відновлення поточного стану. Це дозволяє workflow продовжити з того самого місця з тими самими вхідними даними й результатами, зберігаючи детермінованість.

Звичайні activity у v2 — стійка робота в черзі. Явні
[локальні activity](./features/local-activities.md) виконують коротку роботу
activity в процесі worker workflow зі збереженням стійкої історії та семантики
повторних спроб. Звичайні activity можуть працювати на будь-якому сумісному
worker, а [сесії worker](./features/worker-sessions.md) додають явну оренду,
коли послідовності кроків activity потрібен той самий локальний ресурс worker.
Якщо потрібне одноразове значення, безпечне для відтворення, без постановки
activity в чергу, використовуйте [`sideEffect(...)`](./features/side-effects.md).
Повний контракт наведено в [моделі виконання activity](./features/activity-execution-model.md).

## Гарантії виконання {#execution-guarantees}

Код workflow та activity має різну семантику повторного виконання:

- **Код workflow відтворюється.** Повторна доставка завдання workflow відновлює стан зі стійкої історії та повторно виконує детермінований код. Відтворення не повторює зовнішні побічні ефекти.
- **Activity — робота в черзі з виконанням щонайменше один раз.** Логічна activity може виконуватися повторно, доставлятися знову після завершення оренди чи спостерігатися повторно після втрати worker. Повторна доставка — звичайна умова розподіленої системи, а не помилка сама по собі.
- **Ідентичність activity стійка.** `activity_execution_id` визначає одне логічне виконання activity між повторними спробами й доставками, а `activity_attempt_id` — окрему спробу. Використовуйте `activity_execution_id` як типовий ключ віддаленої ідемпотентності. Використовуйте `activity_attempt_id` лише тоді, коли системі отримувача потрібна кореляція окремих спроб.

Повний контракт v2 наведено в [гарантіях виконання та ідемпотентності](./constraints/execution-guarantees.md), [моделі виконання activity](./features/activity-execution-model.md) та [збоях і відновленні](./failures-and-recovery.md).

## Черги {#queues}

Завдання черг — фонові процеси, які виконуються пізніше. Laravel підтримує черги через Amazon SQS, Redis чи реляційну базу даних. Workflow й activity є завданнями черг, але поводяться дещо по-різному. Workflow під час звичайної роботи надсилається кілька разів: він виконується, надсилає одну чи кілька activity та виходить до їх завершення. Activity — завдання черги з виконанням щонайменше один раз. Зазвичай достатньо однієї успішної спроби, але повторна спроба, завершення оренди чи втрата worker можуть спричинити повторну доставку того самого логічного виконання activity.

## Приклад {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            fn () => all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## Діаграма послідовності {#sequence-diagram}

Ця діаграма послідовності показує, як workflow проходить через послідовні та паралельні activity.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="Діаграма послідовності workflow"
/>

1. Workflow починається з надсилання як завдання черги.
2. Перша activity, `TestActivity`, надсилається як завдання черги. Потім завдання workflow виходить. Після завершення `TestActivity` зберігає результат у базі даних та повертає керування workflow, знову надсилаючи його.
3. Workflow входить у цикл відтворення event sourcing. Він повертається до бази даних і читає потік подій для відновлення поточного стану. Це потрібно, бо workflow не є тривалим процесом. Він виходить, поки activity виконуються, та знову надсилається після їх завершення.
4. Після відтворення потоку подій workflow переходить до наступної activity, `TestOtherActivity`, запускаючи її як завдання черги. Після завершення вона також зберігає результат у базі даних і повертає керування workflow, надсилаючи його як завдання черги.
5. Workflow знову входить у цикл відтворення event sourcing та відновлює поточний стан із потоку подій.
6. Далі workflow запускає дві паралельні activity, `TestParallelActivity` та `TestOtherParallelActivity`. Обидві надсилаються. Після завершення вони зберігають результати в базі даних та повертають керування workflow.
7. Нарешті workflow востаннє входить у цикл відтворення event sourcing для відновлення поточного стану з потоку подій. Це завершує виконання workflow.

## Детермінованість {#determinism}

Оскільки історія відтворюється під час кожного пробудження, код workflow має створювати ті самі команди за тієї самої історії. Дивіться [обмеження](./constraints/overview.md) для правил написання та допоміжних засобів Durable Workflow (`Workflow\now()`, `sideEffect()`, `getVersion()` тощо) для ситуацій, де код інакше був би недетермінованим.
