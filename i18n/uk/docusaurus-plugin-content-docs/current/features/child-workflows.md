---
sidebar_position: 9
---

# Дочірні workflow {#child-workflows}

Поточний `Workflow\V2` підтримує стійкі дочірні workflow через послідовні виклики `child()` та бар’єри збирання результатів `all([...])`. Вони можуть містити лише дочірні workflow, поєднувати їх з activity або бути вкладеними в більші групи `all([...])`. Це дає батьківському workflow стійкий спосіб запланувати один чи кілька підпроцесів workflow та дочекатися їхніх результатів без необхідності тримати батьківський процес запущеним.

Дочірній запуск залишається звичайним запуском workflow із власними ID екземпляра workflow та запуску. Дочірнім його роблять стійкий зв’язок із батьківським запуском та один стабільний `child_call_id`, виданий батьківським workflow для цього виклику.

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## Поточна поведінка {#current-behavior}

- Імпортуйте функцію через `use function Workflow\V2\child;` і викличте `child(ChildWorkflow::class, ...)`. Виклик призупиняє батьківський workflow, створює стійкий дочірній запуск і повертає його результат після закриття.
- Помилка дочірнього workflow спричиняє виняток у батьківському, а успішний дочірній workflow повертає результат. Скасування й примусове завершення представлені різними типами винятків.
- `$this->child()` повертає найновіший дескриптор дочірнього workflow, а `$this->children()` — усі дескриптори в порядку кроків workflow. Дескриптори надають `id()`, `runId()`, `callId()` та допоміжні методи signal, зокрема `signal()` і `signalWithArguments()`.
- Якщо дочірній workflow використовує `continueAsNew()`, батьківський автоматично слідує за найновішим запуском: `runId()` змінюється, а `id()` залишається сталим.
- `all()` може поєднувати замикання `fn () => child(...)` та `fn () => activity(...)` в одному бар’єрі. Батьківський workflow пробуджується за першої помилки дочірнього workflow, але перед продовженням успішного виконання очікує на закриття всіх успішних гілок.

## Бар’єр паралельних дочірніх workflow {#parallel-child-barrier}

Імпортуйте функції через `use function Workflow\V2\all;` та `use function Workflow\V2\child;`, щоб один батьківський крок очікував одразу на кілька дочірніх workflow.

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

Така форма лише з дочірніми workflow корисна, коли всі паралельні учасники є дочірніми workflow:

- очікує на всю дочірню групу як на один батьківський крок
- зберігає початковий порядок масиву в повернених результатах
- передає вибраний неуспішний результат дочірнього workflow до тіла батьківського, обираючи найраніший час закриття, а за однакового часу — найменший індекс

Щоб поєднати дочірні workflow й activity в одному кроці збирання результатів, використовуйте змішаний бар’єр `all([...])`. Очікування дочірніх workflow та activity мають спільний `parallel_group_id`, а Waterline позначає цей бар’єр як `parallel_group_kind = mixed`. Якщо змішана або суто дочірня підгрупа вкладена в більшу `all([...])`, `parallel_group_id` визначає найвнутрішнішу групу, а `parallel_group_path` зберігає повний шлях від зовнішньої до внутрішньої.

## Контракт ідентичності {#identity-contract}

- `child()->id()` та `target_name` у Waterline позначають ID екземпляра дочірнього workflow, який залишається сталим у всьому ланцюжку його запусків.
- `child_call_id` позначає сам виклик, виданий батьківським workflow, і залишається сталим, навіть якщо дочірній workflow згодом використовує `continueAsNew()`.
- `resume_source_id`, `child_workflow_run_id` та маршрути вибраного запуску позначають один конкретний дочірній запуск у ланцюжку цього виклику.

## Дескриптори дочірніх workflow {#child-handles}

Коли батьківський workflow стійко досягнув дочірнього кроку, він може перевірити цей виклик через `ChildWorkflowHandle`.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` повертає найновіший видимий дескриптор дочірнього workflow або `null`.
- `$this->children()` повертає всі видимі дескриптори в порядку кроків workflow.
- У бар’єрах `all([fn () => child(...)])` дескриптори з’являються в тому самому порядку кроків, що й дочірні виклики всередині бар’єра, а `$this->child()` повертає останній видимий дескриптор.
- `runId()` дескриптора слідує за найновішою `ChildRunStarted`, записаною батьківським workflow у ланцюжку дочірнього виклику. Тому батьківський workflow, який очікує на дочірній після `continueAsNew()`, бачить найновіший ID дочірнього запуску, не втрачаючи початкового `callId()`.

## Доступність дескрипторів {#handle-availability}

Дескриптори дочірніх workflow спираються на історію, а не на припущення:

- Поки батьківський workflow стійко не досягнув дочірнього кроку, `$this->child()` повертає `null`, а `$this->children()` — порожній список.
- Після запису батьківським workflow історії планування або початку дочірнього workflow для цього кроку дескриптор стає видимим для query, update та подальшого replay workflow.
- Replay query ніколи не відправляє signal дочірнім workflow із записаних update. Він лише відновлює стан у пам’яті, визначений зафіксованою історією.

## Видимість у Waterline {#waterline-visibility}

Коли батьківський workflow очікує на дочірній, Waterline показує це як дочірнє очікування, а не окремий тип завдання. Це означає:

- стисле представлення батьківського запуску містить `wait_kind = child` та `liveness_state = waiting_for_child`
- `waits` містить `kind = child`, стабільний `child_call_id`, ID екземпляра дочірнього workflow у `target_name` та ID дочірнього запуску в `resume_source_id`
- якщо одночасно відкрито кілька дочірніх очікувань, деталі також містять `open_wait_count`
- дочірні очікування одного суто дочірнього або змішаного бар’єра `all([...])` мають спільний `parallel_group_id` та містять `parallel_group_kind`, `parallel_group_base_sequence`, `parallel_group_size` і `parallel_group_index`
- вкладені дочірні очікування також містять `parallel_group_path`, упорядкований від найзовнішнішого охоплюючого бар’єра до найвнутрішнішого
- `timeline` містить типізовані дочірні події, зокрема `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted` та `ChildRunFailed`, із тим самим стабільним `child_call_id`
- відкриті дочірні очікування й походження запусків насамперед використовують типізовану історію батьківського workflow `ChildWorkflowScheduled` / `ChildRunStarted`, зберігають один логічний дочірній запис на стабільний `child_call_id` і слідують за найновішим дочірнім запуском, записаним батьківським workflow. Це зберігається, навіть якщо скопійовані записи `workflow_links` зникають або змінюваний `current_run_id` дочірнього екземпляра відхиляється після фіксації історії
- після запису типізованої події результату дочірнього workflow деталі вибраного запуску визначають завершене дочірнє очікування з батьківської історії, навіть якщо змінюваний запис дочірнього запуску згодом відхиляється. Термінальна історія дочірнього workflow або старі дані зв’язків можуть доповнювати походження й діагностику, але не замінюють відсутню типізовану історію дочірнього кроку в батьківському workflow для replay
- за наявності типізованої події результату дочірнього workflow походження вибраного запуску й експорт історії також беруть тип, клас, номер запуску, категорію стану та причину закриття дочірнього workflow з батьківської історії, не перечитуючи змінюваний запис дочірнього запуску для цих полів
- якщо є термінальний дочірній запис або зв’язок, але батьківський workflow не має типізованої історії `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled` чи `ChildRunTerminated` для цього кроку, replay worker і query блокується з `history_shape_mismatch` та записаними подіями `no typed history`. Waterline позначає вибране дочірнє очікування як `status = unsupported`, показує `history_authority = unsupported_terminal_without_history` та `history_unsupported_reason = terminal_child_link_without_typed_parent_history`, а за наявності даних визначає ідентичність дочірнього workflow із заблокованого завдання або запасних даних походження
- якщо після події результату дочірнього workflow втрачено запис завдання відновлення батьківського workflow, деталі вибраного запуску залишаються в стані `repair_needed` і показують синтетичне відсутнє завдання workflow з `workflow_wait_kind = child`, `child_call_id` та `child_workflow_run_id`. Ручний `repair()`, `workflow:v2:repair-pass` або відновлення в циклі worker створюють те саме завдання результату дочірнього workflow з типізованої батьківської історії
- масиви походження показують стійкі зв’язки батьківських і дочірніх workflow поруч зі зв’язками continue-as-new, а записи дочірніх workflow містять той самий `child_call_id`

## Політика закриття батьківського workflow {#parent-close-policy}

Коли батьківський workflow закривається через завершення, помилку, тайм-аут, скасування або примусове завершення, кожен відкритий дочірній workflow підпорядковується своїй **політиці закриття батьківського workflow**. Політика задається для кожного дочірнього виклику й визначає, що станеться з ним після завершення батьківського запуску.

| Політика | Значення | Поведінка |
|---|---|---|
| Abandon | `abandon` | Дочірній workflow продовжує працювати незалежно. Це типова політика. |
| Request Cancellation | `request_cancellation` | Дочірній workflow отримує кооперативний запит очищення з початковим походженням скасування та кінцевим терміном батьківського workflow. |
| Request Cancel | `request_cancel` | Під час закриття батьківського workflow дочірньому надсилається команда cancel. |
| Terminate | `terminate` | Під час закриття батьківського workflow дочірньому надсилається команда terminate. |

### Типова політика {#default-policy}

Виклик `child()` без `ChildWorkflowOptions` завжди використовує `ParentClosePolicy::Abandon`. Сумісні на рівні вихідного коду функції `Workflow\V2\child()`, `Workflow\V2\Workflow::child()` та `Workflow\V2\Workflow::executeChildWorkflow()` створюють типові параметри, якщо перший аргумент не є `ChildWorkflowOptions`, і задають `parentClosePolicy` як `ParentClosePolicy::Abandon`. Те саме діє для кожного замикання `child()` у бар’єрі `all([...])`, де пропущено аргумент параметрів. Щоб змінити типову політику, передайте явний `ChildWorkflowOptions`, як показано нижче.

### Задання політики {#setting-the-policy}

Передайте `ChildWorkflowOptions` першим аргументом `child()`:

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

Той самий підхід працює із замиканнями всередині `all()` для паралельних бар’єрів:

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### Як це працює {#how-it-works}

- Політика записується в запис `workflow_links` (`parent_close_policy`) та дані події історії `ChildWorkflowScheduled`.
- Коли батьківський запуск закривається з будь-якої причини, рушій знаходить відкриті дочірні зв’язки з політикою, відмінною від abandon, і надсилає відповідну команду (request cancellation, cancel або terminate) кожному відкритому дочірньому workflow.
- Якщо на момент застосування політики дочірній workflow уже закрито, команда пропускається без додаткової дії.
- Політика застосовується за принципом best-effort: відхилення дочірньої команди, наприклад через уже термінальний стан дочірнього workflow, не впливає на закриття батьківського. Успішне застосування записує подію історії `ParentClosePolicyApplied` у батьківський запуск. У разі помилки натомість записується `ParentClosePolicyFailed`, щоб оператори могли відрізнити успішне застосування від непомітного збою.
- Continue-as-new **не** запускає політику закриття батьківського workflow, оскільки його екземпляр залишається активним у новому запуску.

### Матриця результатів батьківського workflow {#parent-disposition-matrix}

Політика закриття батьківського workflow діє для кожного термінального результату батьківського запуску й не діє для активних запусків або переходів до продовженого запуску. Поведінка рушія однакова для всіх результатів, що роблять батьківський workflow термінальним: політика застосовується до кожного ще відкритого дочірнього зв’язку з політикою, відмінною від abandon.

| Результат батьківського workflow | Політика застосовується? | Примітки |
|---|---|---|
| Completed | Так | Після запису `WorkflowCompleted`. Послідовний виклик `child()` завжди очікує на дочірній workflow, тому природне завершення зазвичай не має відкритих дочірніх workflow. Перевірка політики все одно виконується для надійності. |
| Failed | Так | Після запису `WorkflowFailed` для будь-якої термінальної помилки завдання workflow. |
| Timed out | Так | Після запису `WorkflowTimedOut` через тайм-аут запуску або виконання. |
| Cancelled | Так | Після того, як прийнята команда `CancelRequested` закриває батьківський запуск. |
| Terminated | Так | Після того, як прийнята команда `TerminateRequested` закриває батьківський запуск. |
| Continue-as-new | Ні | Екземпляр workflow залишається активним у новому запуску, тому наявні дочірні зв’язки спрямовуються на продовжений запуск зі збереженням початкової політики. |
| Reset | Наразі не застосовується | Runtime v2 не надає окремої команди reset або термінального результату reset. Майбутня операція reset чи repair, яка закриває або замінює батьківський запуск, має визначити, чи передається володіння дочірніми workflow. Якщо старий запуск стає термінальним, він має застосувати політику закриття перед припиненням володіння відкритими дочірніми workflow. |

### Коли використовувати кожну політику {#when-to-use-each-policy}

**Abandon** (типова політика) підходить, коли дочірні workflow представляють незалежну роботу, яка має завершитися незалежно від долі батьківського workflow, наприклад workflow сповіщень або обов’язкове завдання очищення.

**Request Cancellation** використовує `ParentClosePolicy::RequestCancellation` для кооперативного очищення. Вона зберігає кореневу ідентичність та незмінний кінцевий термін наявного запиту скасування батьківського workflow. Якщо батьківський workflow закривається без такого запиту, політика записує один спільний бюджет очищення у 600 секунд від записаного часу його закриття. Повторне застосування не додає часу. Контракт очищення й вимоги до можливостей worker у сервісному режимі наведено в розділі [Кооперативне скасування](/docs/polyglot/cancellation).

**Request Cancel** застосовує термінальну команду `cancel()` дочірнього workflow під час закриття батьківського. Попри назву політики, вона не доставляє окремий кооперативний запит `requestCancellation()`. Після закриття запуску цією політикою дочірній workflow не може виконати очищення або компенсацію в коді workflow. Завершіть потрібну компенсацію перед закриттям батьківського workflow або використовуйте **Abandon** для незалежного очищення.

**Terminate** підходить, коли дочірні workflow мають зупинитися негайно. Використовуйте її для суто допоміжних дочірніх workflow, які не мають самостійної цінності після закриття батьківського.

### Видимість у Waterline {#waterline-visibility-1}

Waterline показує `parent_close_policy` у таких місцях:

- запис дочірнього зв’язку в перегляді походження батьківського запуску
- дані запису хронології `ChildWorkflowScheduled`
- подія історії дочірнього workflow `CancelRequested` або `TerminateRequested` під час застосування політики з причиною, яка вказує на закриття батьківського

## Поточні обмеження {#current-limitations}

Поточний API не містить:

- вбудованих засобів обмеження конкурентності, окрім поточних бар’єрів `all([fn () => child(...)])`, `all([fn () => activity(...)])` та змішаних `all([fn () => child(...), fn () => activity(...)])`

Отже, стійкі дескриптори дочірніх workflow підтримуються для вже досягнутих дочірніх кроків. API вищого рівня для запуску з дескриптором або обмеженої конкурентності понад поточні `child(...)` та `all([...])` ще немає.

## Запуск цього прикладу {#run-this-pattern}

Workflow координації мікросервісів у
[Sample App](/docs/sample-app) — це виконуваний приклад оркестрації
батьківського й дочірніх workflow між застосунками:

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` виконує батьківський
workflow у головному Laravel-застосунку й відправляє дочірню роботу
до включеного worker мікросервісу. Відкрийте Waterline під час виконання,
щоб побачити дочірні зв’язки під батьківським запуском і політику закриття
в перегляді походження, як описано на цій сторінці.
