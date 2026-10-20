---
sidebar_position: 4
title: Laravel-Einführung und Laufzeitwechsel
description: Eine Laravel-Workflow-Flotte von v1 zu Durable Workflow 2.0 im eingebetteten oder Dienstmodus führen und dabei Frameworkintegration sowie klare Laufzeitverantwortung erhalten.
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - Laravel Durable Workflow Migration
  - Laravel Dienstmodus
  - Migration v1 zu v2
  - eingebetteter Modus zu Dienstmodus
---

# Laravel-Einführung und Laufzeitwechsel {#laravel-adoption-and-runtime-transition}

Laravel-Anwendungen haben zwei offizielle Ziele in Durable Workflow 2.0. Der eingebettete Modus hält dauerhafte Ausführung innerhalb der Anwendung. Im Dienstmodus bleibt Laravel das Anwendungs- und Worker-Framework, während Cloud oder ein selbst gehosteter Server den dauerhaften Zustand verwaltet.

Diese Seite behandelt Entscheidung und Übergang für drei Wege:

1. Stabiles v1-Laravel zu eingebettetem 2.0.
2. Stabiles v1-Laravel zum 2.0-PHP-SDK im Dienstmodus.
3. Eingebettetes 2.0-Laravel zum 2.0-PHP-SDK im Dienstmodus.

Für ein unmittelbares v1-Upgrade auf Paketebene halten Sie den ausführlichen [2.0-Migrationsleitfaden](/docs/migration/) daneben geöffnet. Haben Sie bereits eine selbst gehostete Dienstlaufzeit gewählt, fahren Sie nach der Übergangsentscheidung hier mit der [Betriebsanleitung für eingebettet zu Server](/docs/polyglot/embedded-to-server/) fort.

## Ziel wählen {#pick-the-destination}

| Ausgangspunkt | Ziel | Wann es passt | Erste Übergangsgrenze |
| --- | --- | --- | --- |
| Stabiles v1-Laravel | Eingebettetes 2.0 | Die Laravel-Anwendung soll Workflow-Persistenz, Warteschlangen, Ausführung und eingebettetes Waterline weiter verwalten. | Das gepflegte Paket `durable-workflow/workflow` auf die 2.0-Linie aktualisieren. Bestehende v1-Läufe schließen über den v1-Kompatibilitätspfad des Pakets ab. Neue Starts verwenden v2. |
| Stabiles v1-Laravel | PHP-SDK-Dienstmodus | Laravel soll Dependency Injection, Konfiguration, Artisan, Logging, Ereignisse und Test-Fakes behalten, Cloud oder Server aber den dauerhaften Zustand verwalten. | `durable-workflow/sdk` als separate Dienstclient-/Worker-Grenze installieren. v1-Historie und dauerhafte Laravel-Warteschlangenjobs bleiben bis zum terminalen Zustand auf der v1-Laufzeit. |
| Eingebettetes 2.0-Laravel | PHP-SDK-Dienstmodus | Die Anwendung soll die Orchestrierungslaufzeit nicht mehr verwalten oder benötigt eine gemeinsame/mehrsprachige Laufzeitgrenze. | Neue Starts nach Bereitschaft der Worker an die Dienstlaufzeit leiten. Eingebettete Läufe an ihrem Ursprungsort abschließen lassen oder für selbst gehosteten Server das explizite Importverfahren für geeignete eingebettete v2-Läufe verwenden. |

Die PHP-SDK-Bridge und das eingebettete Paket unterstützen Laravel 9 bis 13 mit ihren kompatiblen PHP-Versionen. Eine unterstützte v1-Anwendung kann daher beide Ziele ohne sachfremdes Laravel-Upgrade wählen.

## Verantwortungsgrenzen vergleichen {#compare-the-ownership-boundary}

| Thema | Stabiles v1-Laravel | Eingebettetes 2.0-Laravel | 2.0-PHP-SDK-Dienstmodus |
| --- | --- | --- | --- |
| Laufzeitverantwortlicher | Die Laravel-Anwendung verwaltet Orchestrierung und Replay. | Die Laravel-Anwendung verwaltet v2-Engine, Historie, Matching, Timer und Replay. | Cloud betreibt die Namespace-Laufzeit oder Ihr Team einen selbst gehosteten Server. Laravel betreibt Clients und entfernte Worker, nicht die Laufzeit. |
| Composer-Paket | `durable-workflow/workflow` der stabilen 1.x-Linie. | `durable-workflow/workflow` aus der maßgeblichen 2.0-Artefaktquelle. | `durable-workflow/sdk` aus der unabhängig veröffentlichten maßgeblichen PHP-SDK-Quelle. Es hängt nicht von der eingebetteten Engine ab. |
| Erforderliche Prozesse | Laravel-Web-/CLI-Prozesse und Laravel-Warteschlangen-Worker oder Horizon. | Laravel-Web-/CLI-Prozesse und Warteschlangen-Worker oder Horizon. Scheduler- und Reparaturrollen folgen der eingebetteten Bereitstellungskonfiguration. | Laravel-Anwendungsprozesse und ein oder mehrere Prozesse `php artisan durable-workflow:worker`. Cloud stellt die Laufzeit. Selbsthosting benötigt zusätzlich Server und dessen Persistenz. |
| Warteschlangen und Speicher | Workflow-Zeilen und PHP-orientierte Historie liegen in konfigurierten Laravel-Datenbanken. Workflow-, Aktivitäts-, Wiederholungs- und Timerjobs liegen in Laravel-Warteschlangenbackends. | Ereignishistorie und Projektionen liegen in der konfigurierten Anwendungsdatenbank. Eingebettete Aufgaben verwenden normalerweise Laravel-Warteschlangen. | Dauerhafte Historie und Aufgabenzustand liegen in Cloud- oder Serverpersistenz. `DURABLE_WORKFLOW_TASK_QUEUE` ist eine entfernte Aufgabenwarteschlangenidentität, die der SDK-Worker abfragt, keine Laravel-Warteschlangenverbindung. |
| Workflow-/Aktivitätsidentität | PHP-Workflow- und Aktivitätsklassen sind dauerhafte Identitäten. | Stabile Aliasse unter `workflows.v2.types` konfigurieren. Klassen bleiben lokale Implementierungen. | `#[Workflow('orders.fulfill')]` und `#[Activity('orders.reserve')]` veröffentlichen bei der Worker-Registrierung stabile Typenschlüssel als Zeichenketten. PHP-FQCNs sind kein laufzeitübergreifender Vertrag. |
| Zugangsdaten | Laravel-Anwendungs-, Datenbank-, Cache- und Warteschlangenzugangsdaten. Der ursprüngliche `APP_KEY` bleibt Teil der v1-Wiederherstellung. | Laravel-Anwendungszugangsdaten sowie Datenbank, Cache, Warteschlange und die Authentifizierung eines eingebetteten Waterline der Hostanwendung. | Cloud-Anwendungsprozesse erhalten nur ein Steuerungszugangsmerkmal und Worker-Prozesse nur ein Worker-Zugangsmerkmal. Selbsthosting kann einen gemeinsamen Token oder gleichwertige abgegrenzte Zugangsdaten verwenden. Zugangsdaten sind Prozesseingaben und fehlen bewusst in der zwischengespeicherten Laravel-Konfiguration. |
| Betriebswerkzeuge | Laravel-Logs/-Ereignisse, Warteschlangenwerkzeuge, Horizon, v1-Waterline und `workflow:v1:list`, soweit verfügbar. | Laravel-Logs/-Ereignisse, Warteschlangenwerkzeuge, `workflow:v2:doctor`, Historien-/Reparaturbefehle und eingebettetes Waterline. | SDK-Diagnosen laufen über Laravels PSR-Logger und `WorkerDiagnosticEvent`. Cloud enthält Managed Waterline. Selbsthosting-Operatoren verwenden Server-APIs/CLI und können Waterline separat gegen den Server-Namespace bereitstellen. |
| Verantwortung für Umstellung und Rollback | Ihr Team erhält v1-Datenbank, Warteschlangenzustand, Konfiguration und Geheimnisse als gemeinsamen Wiederherstellungssatz. | Ihr Team trennt v1- und v2-Starts, erhält v1-Weckpfade und entscheidet über die Stilllegung alter Tabellen/Warteschlangen. | Ihr Team leitet jeden Befehl an die Laufzeit, die seinen Lauf verwaltet. Cloud verantwortet Laufzeit-Rollback im verwalteten Dienst, Selbsthosting-Operatoren Serverpersistenz und -Rollback. Anwendungs-Rollback muss alte und neue Laufzeitrouten erhalten, bis deren Läufe terminal sind. |

Cloud und selbst gehosteter Server sind Alternativen innerhalb des Dienstmodus. Cloud-Nutzer installieren weder Server noch separaten Waterline-Dienst. Selbsthosting-Operatoren stellen Server bereit, sichern ihn ab, sichern seine Daten, skalieren und aktualisieren ihn. Waterline ist eine separate optionale Bereitstellung gegen den serververwalteten Namespace.

## Ein Laravel-Anwendungsfall in allen drei Modi {#one-laravel-use-case-in-all-three-modes}

Die Beispiele reservieren Bestand für `orders.fulfill`. Ordnen Sie die stabile v1-Klasse bewusst den v2-Typenschlüsseln zu und halten Sie diese sowie die konfigurierte Aufgabenwarteschlange stabil. Bestandsreservierung und Verbraucher des Geschäftsereignisses müssen idempotent sein, da eine Aktivität nach Wiederholung oder verlorener Abschlussbestätigung mehrfach ausgeführt werden kann.

Die Anwendungsaktion bleibt in Produktion und Tests gleich:

| Modus | Produktionseinstieg | Einstieg nach Aktivierung des Fakes |
| --- | --- | --- |
| Stabiles v1-Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| Eingebettetes 2.0-Laravel | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| PHP-SDK-Dienstmodus | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

Laravels Konstruktorinjektion bleibt in jedem Modus an der Anwendungsgrenze verfügbar. Stabiles v1 injiziert Aktivitätsabhängigkeiten in `execute()`. Eingebettetes v2 und Dienstmodus lassen Workflow- und Aktivitätsobjekte vom Laravel-Container erstellen, sodass Anwendungsabhängigkeiten normale Konstruktoren verwenden. Alles, was ein per Replay ausgeführter Workflow liest, muss deterministisch und konfigurationsgestützt sein. Datenbank, Netzwerk, Uhrzeit und andere Seiteneffekte gehören in Aktivitäten.

### Stabiles v1-Laravel {#stable-v1-laravel}

Behalten Sie die [stabile v1-Installation](/docs/1.x/installation/) und ihre Anforderungen an echte Warteschlangentreiber bei. Diese repräsentative Implementierung verwendet einen Anwendungsstarter mit Konstruktorinjektion und Aktivitätsdienste mit Methodeninjektion:

<!-- docs-example id="laravel.adoption.v1.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\Activity;
use Workflow\Workflow;
use Workflow\WorkflowOptions;
use Workflow\WorkflowStub;
use function Workflow\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public function execute(string $orderId): \Generator
    {
        return yield activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public function execute(
        OrderPolicy $orders,
        InventoryGateway $inventory,
        LoggerInterface $logger,
        Dispatcher $events,
        string $orderId,
    ): array {
        $orders->assertFulfillable($orderId);
        $reservation = $inventory->reserve($orderId);
        $logger->info('Inventory reserved', ['order_id' => $orderId]);
        $events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        $workflow = WorkflowStub::make(FulfillOrderWorkflow::class);
        $workflow->start($orderId, new WorkflowOptions('redis', 'orders'));
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

`config/queue.php` und Bereitstellungsumgebung wählen weiterhin die tatsächliche Laravel-Warteschlangenverbindung. Starten Sie einen Worker für die konfigurierte Warteschlange:

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Der stabile Fake führt dieselbe injizierte Anwendungsaktion wie in Produktion aus:

<!-- docs-example id="laravel.adoption.v1.fake" -->
```php
<?php

use Workflow\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Beim Testen der echten Aktivität bleiben Laravel-Ereignisprüfungen verfügbar. Ersetzen Sie v1-Worker nicht allein deshalb, weil das v2-SDK an anderer Stelle in der Anwendung hinzugekommen ist.

### Eingebettetes 2.0-Laravel {#20-embedded-laravel}

Die stabile Installation verwendet dasselbe Workflow-Paket wie der eingebettete Schnellstart:

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

Veröffentlichen oder aktualisieren Sie `config/workflows.php` und vergeben Sie für denselben Geschäftsvertrag stabile Aliasse. Die veröffentlichte Datei enthält weitere erforderliche v1- und v2-Einstellungen. Fügen Sie diese Werte in ihre vorhandenen Arrays ein, statt die vollständige Datei durch diesen gezielten Auszug zu ersetzen:

<!-- docs-example id="laravel.adoption.v2-embedded.config" -->
```php
<?php

return [
    'v2' => [
        'namespace' => env('DW_V2_NAMESPACE', 'production'),
        'types' => [
            'workflows' => [
                'orders.fulfill' => App\Workflows\FulfillOrderWorkflow::class,
            ],
            'activities' => [
                'orders.reserve' => App\Activities\ReserveInventoryActivity::class,
            ],
        ],
    ],
];
```

Die Programmier-API wechselt zu `handle()` und liefert Aktivitätsergebnisse nicht mehr mit `yield`. Laravel erstellt beide Objekte. Die Aktivität bleibt der richtige Ort für Logging und Geschäftsereignisse mit Seiteneffekten:

<!-- docs-example id="laravel.adoption.v2-embedded.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Workflow\V2\Activity;
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\activity;

final class FulfillOrderWorkflow extends Workflow
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return activity(ReserveInventoryActivity::class, $orderId);
    }
}

final class ReserveInventoryActivity extends Activity
{
    public ?string $connection = 'redis';
    public ?string $queue = 'orders';

    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    public function handle(string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}

final class StartOrderFulfillment
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function start(string $orderId): void
    {
        WorkflowStub::make(FulfillOrderWorkflow::class, "order-{$orderId}")
            ->start($orderId);
        $this->logger->info('Order workflow started', ['order_id' => $orderId]);
    }
}
```

Starten Sie den Laravel-Warteschlangen-Worker so, wie es eine eingebettete Bereitstellung erfordert:

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Verwenden Sie den eingebetteten Fake über dieselbe Anwendungsaktion. Er führt bereite Workflow-Aufgaben direkt aus und zeichnet Aktivitätszuteilungen auf:

<!-- docs-example id="laravel.adoption.v2-embedded.fake" -->
```php
<?php

use Workflow\V2\WorkflowStub;

WorkflowStub::fake();
WorkflowStub::mock(ReserveInventoryActivity::class, ['status' => 'reserved']);

app(StartOrderFulfillment::class)->start('1001');
while (WorkflowStub::runReadyTasks() > 0) {
}

WorkflowStub::assertDispatched(
    ReserveInventoryActivity::class,
    fn (string $orderId): bool => $orderId === '1001',
);
```

Dieser Fake prüft eingebettete dauerhafte Zeilen und Historie. Er ist nicht der SDK-Client-Fake und ersetzt keine Dienstlaufzeit.

### PHP-SDK-Dienstmodus in Laravel {#php-sdk-service-mode-in-laravel}

Installieren Sie das unabhängig veröffentlichte SDK-Paket. Dieser Befehl wird aus der maßgeblichen veröffentlichten PHP-SDK-Artefaktquelle erzeugt, nicht aus einer einzelnen Patchversion kopiert:

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9 bis 13 erkennt den Provider automatisch. Veröffentlichen Sie die Paketkonfiguration und listen Sie die mit Attributen versehenen Handlerklassen auf:

<!-- docs-example id="laravel.adoption.service.config" -->
```php
<?php

return [
    'runtime_url' => env('DURABLE_WORKFLOW_RUNTIME_URL', 'http://localhost:8080'),
    'namespace' => env('DURABLE_WORKFLOW_NAMESPACE', 'production'),
    'task_queue' => env('DURABLE_WORKFLOW_TASK_QUEUE', 'orders'),
    'handlers' => [
        App\Workflows\FulfillOrderWorkflow::class,
        App\Activities\ReserveInventoryActivity::class,
    ],
    'poll_timeout_seconds' => 5,
];
```

Der Dienst-Workflow verwendet dieselben öffentlichen Zeichenketten wie eingebettetes v2. Laravel erstellt beide mit Attributen versehenen Dienstklassen über den Container:

<!-- docs-example id="laravel.adoption.service.handlers" -->
```php
<?php

use App\Contracts\InventoryGateway;
use App\Contracts\OrderPolicy;
use App\Events\InventoryReserved;
use DurableWorkflow\Attribute\Activity;
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;

final class FulfillOrderWorkflow
{
    public function __construct(private readonly OrderPolicy $orders)
    {
    }

    #[Workflow('orders.fulfill')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);

        return $context->activity('orders.reserve', [$orderId]);
    }
}

final class ReserveInventoryActivity
{
    public function __construct(
        private readonly OrderPolicy $orders,
        private readonly InventoryGateway $inventory,
        private readonly LoggerInterface $logger,
        private readonly Dispatcher $events,
    ) {
    }

    #[Activity('orders.reserve')]
    public function run(ActivityContext $context, string $orderId): array
    {
        $this->orders->assertFulfillable($orderId);
        $reservation = $this->inventory->reserve($orderId);
        $this->logger->info('Inventory reserved', ['order_id' => $orderId]);
        $this->events->dispatch(new InventoryReserved($orderId));

        return $reservation;
    }
}
```

Anwendungscode injiziert die Laravel-native SDK-Schnittstelle, statt über eine Fassade zuzugreifen oder einen Transportclient zusammenzusetzen. Die mit Attribut versehene Klasse liefert den Workflow-Typ. Die veröffentlichte Konfiguration liefert die Standardaufgabenwarteschlange:

<!-- docs-example id="laravel.adoption.service.client" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\LaravelWorkflowClientInterface;
use DurableWorkflow\WorkflowHandleInterface;

final class StartOrderFulfillment
{
    public function __construct(
        private readonly LaravelWorkflowClientInterface $workflows,
    ) {
    }

    public function start(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->start(
            FulfillOrderWorkflow::class,
            [$orderId],
            workflowId: "order-{$orderId}",
        );
    }

    public function handle(string $orderId): WorkflowHandleInterface
    {
        return $this->workflows->handle(
            FulfillOrderWorkflow::class,
            "order-{$orderId}",
        );
    }
}
```

Speichern Sie nach der Konfigurationsveröffentlichung ausschließlich nicht geheime Einstellungen im Konfigurationscache. Setzen Sie `RUNTIME_URL` auf die vollständige bereitgestellte Cloud-Namespace-Laufzeit-URI oder den Ursprung des selbst gehosteten Servers. Hängen Sie `/api` nicht an.

Starten Sie den Worker ausschließlich mit seinem Worker-Rollen-Zugangsmerkmal:

<!-- docs-example id="laravel.adoption.service.worker" -->
```bash
php artisan vendor:publish --tag=durable-workflow-config
env -u DURABLE_WORKFLOW_TOKEN \
  -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  -u DURABLE_WORKFLOW_WORKER_TOKEN \
  DURABLE_WORKFLOW_RUNTIME_URL="$RUNTIME_URL" \
  DURABLE_WORKFLOW_NAMESPACE=production \
  DURABLE_WORKFLOW_TASK_QUEUE=orders \
  php artisan config:cache
env -u DURABLE_WORKFLOW_CLIENT_TOKEN \
  DURABLE_WORKFLOW_WORKER_TOKEN="$WORKER_SECRET" \
  php artisan durable-workflow:worker
```

Ohne Überschreibung durch `--queue` fragt der Artisan-Worker die konfigurierte Aufgabenwarteschlange `orders` ab. Seine Diagnose zu Registrierung und Polling nennt vor dem normalen Polling Laufzeit, Namespace, Warteschlange, mit Attributen versehene Workflow-/Aktivitätstypen und Worker-Zugangsrolle.

Anwendungs-/Web-/Warteschlangenprozesse erhalten stattdessen `DURABLE_WORKFLOW_CLIENT_TOKEN` und keinen Worker-Token. Selbsthosting-Operatoren können `DURABLE_WORKFLOW_TOKEN` verwenden, wenn ein Zugangsmerkmal bewusst für beide Rollen autorisiert ist.

Der SDK-Worker schreibt Diagnosen zu Lebenszyklus, Wiederholung, Handlerfehler und Herunterfahren über Laravels PSR-Logger und sendet `DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` über Laravel-Ereignisse. Geschäftsaktivitäten können den injizierten Logger und Ereignisdispatcher wie oben weiterverwenden.

Der mitgelieferte Fassaden-Fake ersetzt dieselbe injizierte Schnittstelle, die der Anwendungscode verwendet:

<!-- docs-example id="laravel.adoption.service.fake" -->
```php
<?php

use DurableWorkflow\Bridge\Laravel\Facades\DurableWorkflow;

$workflows = DurableWorkflow::fake()
    ->setWorkflowResult('order-1001', ['status' => 'fulfilled']);

app(StartOrderFulfillment::class)->start('1001');
$result = app(StartOrderFulfillment::class)->handle('1001')->result();

$this->assertSame(['status' => 'fulfilled'], $result);
$workflows->assertWorkflowStarted(
    FulfillOrderWorkflow::class,
    ['1001'],
    workflowId: 'order-1001',
);
$workflows->assertResultRequested('order-1001');
```

Dieser Fake weist die Laravel-Anwendungsinteraktion ohne Cloud oder Server nach. Verwenden Sie für Workflow-/Aktivitätshandlerbefehle die Worker-Testumgebung des SDKs. Der Client-Fake führt keinen entfernten Worker-Code aus.

## Auslaufen, umstellen und zurückrollen {#drain-cut-over-and-roll-back}

Eine geänderte Composer-Anforderung verschiebt weder einen laufenden Workflow noch seine Historie, einen verzögerten Timer, eine Aktivitätswiederholung oder einen bereiten/reservierten Warteschlangenjob. Behandeln Sie alte und neue Laufzeit während des gesamten Übergangs als getrennte dauerhafte Systeme.

### 1. Konsistenten Wiederherstellungsstand festlegen {#1-establish-the-recovery-cut}

Vor der Verkehrsänderung:

- Erfassen Sie v1-/eingebettete Datenbankverbindung, alle konfigurierten Workflow- und Aktivitätswarteschlangen, Konto/Region/Präfix des Warteschlangenbackends, Cache-Sperren und die Secret-Manager-Referenz des ursprünglichen `APP_KEY`.
- Blockieren Sie neue Starts und Nachrichteneingänge lange genug, um die Quelle stillzulegen. Stoppen Sie jeden Worker nach seiner aktuellen Jobgrenze. `queue:restart` allein stellt nicht still, wenn ein Supervisor den Prozess sofort ersetzt.
- Lassen Sie entweder alle Quellläufe abschließen oder erfassen Sie einen anwendungskonsistenten Wiederherstellungsstand mit SQL und jedem bereiten, verzögerten und reservierten Warteschlangenjob. Eine reine Datenbanksicherung stellt warteschlangenbasierte Timer, Wiederholungen oder Aktivitäten nicht wieder her.
- Halten Sie fest, welche Laufzeit jede nichtterminale Workflow-ID verwaltet. Signale, Abfragen, Updates, Abbruch, Terminierung, Reparatur und Ergebnisabrufe müssen dieser Zuordnung weiter folgen.

### 2. Die pfadspezifische Regel anwenden {#2-apply-the-path-specific-rule}

| Übergang | Bestehende nichtterminale Läufe | Neue Läufe nach der Umstellung | Rollback-Grenze |
| --- | --- | --- | --- |
| v1 zu eingebettetem 2.0 | Über den v1-Kompatibilitätspfad abschließen. v1-Tabellen, PHP-Dekodierungsanforderungen, Laravel-Warteschlangenverbraucher und Warteschlangenzustand bis zum terminalen Zustand erhalten. | Erst nach bestandenem v2-Canary über `Workflow\V2\WorkflowStub` starten. | Zusammengehörigen v1-SQL-/Warteschlangen-Wiederherstellungsstand und genaue Anwendungskonfiguration wiederherstellen oder vorwärts korrigieren. SQL nicht über neueren Warteschlangenzustand wiederherstellen. |
| v1 zu Cloud oder selbst gehostetem Dienstmodus | Auf v1 belassen. v1-Historie lässt sich weder in die Dienstlaufzeit importieren noch von entfernten Workern per Replay ausführen. | Mit `LaravelWorkflowClientInterface` starten, nachdem ein registrierter SDK-Worker die erwarteten Typenschlüssel ausweist. | Neue Starts nur bei weiterhin gesunder v1-Laufzeit zurück auf v1 leiten. Vom Dienstmodus bereits angenommene Läufe bleiben dort. |
| Eingebettetes v2 zu Cloud | Eingebettete Läufe vor Ort abschließen lassen. Cloud-Einstieg macht eine Paketänderung nicht zum Historienimport. | Nach bestandenen Prüfungen für Client-/Worker-Zugangsdaten und Aufgabenwarteschlange im bereitgestellten Cloud-Namespace starten. | Neue Starts bei Bedarf zurück zu eingebettet leiten. Befehle für von Cloud angenommene Läufe weiter an Cloud senden. |
| Eingebettetes v2 zu selbst gehostetem Server | Vor Ort abschließen lassen oder separat unterstützten Export, Probelauf und atomaren Import eines geeigneten stillgelegten eingebetteten v2-Laufes ausführen. Eignung niemals aus einer Paketinstallation ableiten. | Nach bestandener Serverermittlung, Namespace-, Worker-Registrierungs- und Warteschlangenprüfung über das SDK starten. | Ein fehlgeschlagener Import schreibt keinen Teillauf. Nach einem bestätigten Import verwaltet Server diesen Lauf. Die eingebettete Kopie nicht wieder aufnehmen. |

Verwenden Sie für den Selbsthosting-Import das vollständige [Migrationsverfahren von eingebettet zu Server](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs). Es lehnt v1, geschwärzte Historie, Aufgaben mit Lease, laufende Aktivitätsversuche und andere unsichere Momentaufnahmen ab. Ein Historienexport allein sind Audit-/Debugdaten. Nur diese explizite validierte Importoperation erzeugt serververwalteten Zustand.

### 3. Ziel vor dem Verkehrswechsel nachweisen {#3-prove-the-destination-before-switching-traffic}

1. Einen Namespace, eine Aufgabenwarteschlange und einen stabilen Workflow-/Aktivitätstypensatz konfigurieren.
2. Ziellaufzeit und ihre SDK-Worker neben der alten Laufzeit starten.
3. Serverermittlung oder Cloud-Bereitstellung, Rollenzugangsdaten, Worker-Registrierung, ausgewiesene Typenschlüssel, Aufgabenwarteschlangensichtbarkeit und Laravel-Diagnosen prüfen.
4. Einen eindeutig identifizierten Shadow-/Canary-Auftrag senden und in der Operatoroberfläche des Ziels auf ein terminales Ergebnis warten.
5. Neue Starts Workflow-Familie für Workflow-Familie umstellen. Den Start desselben Geschäftsschlüssels in beiden Laufzeiten verhindern.
6. Quell-Worker, Warteschlangenzustand, Zugangsdaten, Logs/Ereignisse und alte Operatoroberfläche erhalten, bis jeder quellverwaltete Lauf terminal ist oder einen unterstützten Selbsthosting-Import abgeschlossen hat.

Ein altes Paket, eine Warteschlange, Tabelle, ein Geheimnis oder eine Waterline-Bereitstellung wird zuletzt stillgelegt. Dies ist nie der Umstellungsmechanismus.

## Mit dem gewählten Weg fortfahren {#continue-with-the-chosen-path}

- [Stabile v1-Installation](/docs/1.x/installation/)
- [Planung der stabilen v1-Migration](/docs/migration/)
- [Eingebettete 2.0-Installation](/docs/installation/)
- [Ausführliche Paketmigration von v1 zu v2](/docs/migration/)
- [PHP-SDK-Dienstmodus](/docs/polyglot/php/)
- [Verwaltete Cloud-Laufzeit](/docs/polyglot/cloud-control-plane/)
- [Selbst gehosteter Server](/docs/polyglot/server/)
- [Eingebettetes v2 zu selbst gehostetem Server](/docs/polyglot/embedded-to-server/)
