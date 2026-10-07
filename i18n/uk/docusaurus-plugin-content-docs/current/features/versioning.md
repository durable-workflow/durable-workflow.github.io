---
sidebar_position: 15
---

# Керування версіями {#versioning}

Workflow можуть працювати довго, іноді місяцями або роками, тому часто потрібно змінювати визначення workflow, поки виконання ще тривають. Без керування версіями зміна коду workflow, яка впливає на шлях виконання, спричиняла б помилки недетермінізму під час replay.

Функція `getVersion()` дає змогу безпечно змінювати активні workflow, створюючи точки розгалуження з версіями.

## Використання `getVersion` {#using-getversion}

`getVersion()` — це безпечна щодо replay функція для послідовного коду. Під час першого виконання кожна точка зміни записує стійкий маркер версії запуску. Кожен подальший replay використовує це зафіксоване значення замість повторного визначення гілки за поточним кодом. Старі запуски, що передують новій точці розгалуження, консервативно отримують `DEFAULT_VERSION`.

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## Як це працює {#how-it-works}

Метод `getVersion()` приймає три параметри:

- **changeId** — унікальний ідентифікатор точки зміни
- **minSupported** — найменша версія, яку цей код ще підтримує
- **maxSupported** — найбільша, поточна версія для нових виконань

Коли workflow доходить до `getVersion()`:

- **Нові виконання** додають типізовану подію історії `VersionMarkerRecorded` із `change_id`, вибраною `version` і підтримуваним діапазоном, а потім повертають `maxSupported`
- **Виконання під час replay** повертають раніше записану версію з цього маркера історії
- **Запуски без маркера** переходять до `WorkflowStub::DEFAULT_VERSION`, коли runtime визначає, що гілка передує поточному визначенню workflow. Спочатку він перевіряє маркер сумісності запуску відносно поточного worker, а потім порівнює стійко зафіксований `workflow_definition_fingerprint` запуску з поточним доступним для завантаження класом workflow. Якщо відбитки збігаються, запуск використовує те саме визначення й записує новий маркер. Якщо ні, запуск передує зміні й застосовується запасний варіант. Запуски, чия історія `WorkflowStarted` передує фіксації відбитка та не містить його, консервативно отримують `DEFAULT_VERSION`, оскільки runtime не може довести незмінність визначення. Це зафіксована політика 2.0 для запусків без відбитка: runtime не блокує отримання завдання лише через відсутність записаного відбитка в старого запуску. Запасний варіант не додає штучного маркера й не споживає нового кроку workflow
- **Методи query** відтворюють той самий зафіксований маркер версії перед викликом анотованого методу, тому query бачать ту саму гілку, що й завдання workflow
- **Waterline** показує записані маркери в хронології вибраного запуску з `version_change_id`, `version`, `version_min_supported` та `version_max_supported`. Деталі вибраного запуску також містять `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` і `workflow_definition_matches_current`, щоб оператори бачили, коли тривалий запуск почався зі старішим визначенням, навіть до фіксації маркера версії

Це дає новим workflow змогу використовувати найновіший шлях коду, поки наявні workflow продовжують використовувати початковий.

## Додавання нової версії {#adding-a-new-version}

Припустімо, наявний workflow викликає `prePatchActivity`:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

Щоб замінити його на `postPatchActivity` без порушення активних workflow:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

Під час розгортання нової точки розгалуження `getVersion()` продовжуйте змінювати `DW_V2_CURRENT_COMPATIBILITY` для цієї хвилі збірок. Runtime насамперед використовує `workflow_definition_fingerprint`, зафіксований на початку запуску, щоб визначити, чи відсутній маркер версії належить новому виконанню або старішому запуску, який має залишитися на `DEFAULT_VERSION`. Маркер сумісності залишається важливим для маршрутизації до сумісних worker і перевіряється перед відбитком. Запуски без записаного відбитка консервативно залишаються на `DEFAULT_VERSION`, оскільки runtime не може перевірити незмінність визначення.

## Додавання наступних версій {#adding-more-versions}

Для подальших змін збільшуйте `maxSupported`:

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## Припинення підтримки старих версій {#deprecating-old-versions}

Після завершення всіх workflow, які використовують стару версію, можна припинити її підтримку, збільшивши `minSupported`. Тоді більше не потрібно підтримувати старі шляхи коду.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

Якщо workflow із версією, старішою за `minSupported`, намагається виконати replay, виникає `VersionNotSupportedException`. Це також стосується запусків зі старішою сумісністю, чий безпечний запасний варіант досі є `WorkflowStub::DEFAULT_VERSION`.

Якщо випадково повторно використати той самий `changeId` для іншої точки розгалуження, runtime вважатиме це помилкою детермінізму, а не непомітно прийме невідповідність. Зберігайте один стабільний `changeId` для кожної логічної зміни коду.

## Кілька точок зміни {#multiple-change-points}

Для незалежних змін можна використовувати кілька викликів `getVersion()` в одному workflow:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Важливо:** кожен `changeId` має бути унікальним у межах workflow. Вибрана версія записується в типізовану історію workflow й детерміновано відтворюється в подальших завданнях workflow, query та деталях Waterline. Якщо Waterline не показує `VersionMarkerRecorded` для точки зміни в старішому запуску, replay залишився на старому шляху `DEFAULT_VERSION` без додавання нового маркера до наявної історії. Поля деталей вибраного запуску `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` та `workflow_definition_matches_current` показують, чи почався запуск з іншим визначенням workflow, ніж те, яке може завантажити поточна збірка.

## Скорочений виклик `patched()` {#patched-shorthand}

`patched($changeId)` — це скорочений виклик із двома станами для звичного питання: чи перейшов запуск через одноразову зміну коду? Він записує ту саму стійку подію історії `VersionMarkerRecorded`, що й `getVersion()`, але повертає булеве значення замість цілого числа.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

Поведінка:

- Нові запуски фіксують маркер, обирають нову гілку, а `patched()` повертає `true`.
- Запуски, які почалися до додавання цього `changeId`, залишаються на `DEFAULT_VERSION` за тією самою перевіркою відбитка, що й у `getVersion()`, а `patched()` повертає `false`.
- Replay обох типів читає раніше зафіксований маркер і повертає те саме значення, тому рішення про гілку є стійким.

`patched()` точно еквівалентний `getVersion($changeId, DEFAULT_VERSION, 1) === 1`. Використовуйте його, коли є лише дві гілки й не потрібно зберігати стару гілку назавжди. Булевий виклик читається простіше, ніж `match` за `DEFAULT_VERSION` та `1`.

Якщо потрібні понад дві гілки або згодом планується ще одна версія тієї самої логічної зміни, використовуйте `getVersion()` із явним `maxSupported`. Перехід від `patched()` до `getVersion()` для того самого `changeId` є помилкою детермінізму, оскільки наявний маркер записано з `maxSupported = 1`.

## Видалення старої гілки через `deprecatePatch()` {#removing-the-legacy-branch-with-deprecatepatch}

Коли всі старі запуски для точки зміни `patched()` завершилися, стару гілку можна видалити з коду workflow. Сумісний спосіб — замінити виклик `patched()` на `deprecatePatch()`, а не видаляти його повністю.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` зберігає точку зміни на хронології workflow, щоб уже зафіксовані події історії `VersionMarkerRecorded` і далі відповідали відомому виклику. Він повертає `null` і безумовно обирає новий шлях. Після випуску цієї версії:

- Нові запуски фіксують маркер `deprecate_patch`, обирають нову гілку, а виклик `deprecatePatch()` повертає `null`.
- Наявні запуски, які вже зафіксували маркер `patched` для цього `changeId`, продовжують відтворювати його й проходять через гілку після припинення підтримки старого коду, яка тепер є єдиною, без помилки.
- Передбачається, що наявні запуски, які зафіксували `false` для `patched()` і використовували старий шлях, уже не активні. Якщо такий запуск досі працює й виконує replay, workflow прочитає старий маркер, але виконає нову гілку. Тому безпечний порядок — дочекатися завершення старих запусків перед розгортанням `deprecatePatch()`.

Двоетапний життєвий цикл patch і правила розміщення:

1. **Додайте `patched()`** у точці зміни. Обидві гілки залишаються в коді workflow. Нові запуски обирають нову гілку, а старі продовжують використовувати стару.
2. **Дочекайтеся завершення всіх старих запусків.** За допомогою пошуку запусків Waterline або `dw workflow:list` підтвердьте відсутність відкритих запусків, які можуть відтворювати стару гілку.
3. **Замініть `patched()` на `deprecatePatch()`** у тому самому місці з тим самим `changeId` і видаліть стару гілку з тіла функції. Залиште виклик, щоб стійка історія й далі відповідала відомій точці зміни.
4. **Необов’язково: повністю видаліть `deprecatePatch()`**, коли впевнені, що жоден історичний replay для query, експорту або аудиту більше не читатиме історію з цим маркером. Це незворотний крок. Більшість workflow можуть залишати `deprecatePatch()` необмежено довго без витрат під час виконання.

Правила розміщення:

- `patched()` та `deprecatePatch()` слід викликати з тіла функції workflow, а не з activity, обробників signal або методів query. Це кроки workflow, які мають відтворюватися детерміновано.
- Кожен `changeId` є однією логічною точкою зміни. Повторне використання того самого `changeId` для іншої гілки є помилкою детермінізму.
- Протягом життєвого циклу `changeId` може використовуватися у формі `patched()` або `deprecatePatch()`, але ніколи в обох одночасно. Розгортання, яке змінює виклик, має замінити його, а не залишати обидва.
- `getVersion()` та `patched()` не можуть співіснувати для того самого `changeId`. Оберіть одну модель під час додавання точки зміни.
