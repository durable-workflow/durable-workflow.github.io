---
sidebar_position: 4
title: Adopción en Laravel y transición del entorno de ejecución
description: Migra una flota Laravel de v1 a Durable Workflow 2.0 integrado o en modo servicio sin perder la integración con el framework ni claridad sobre la propiedad del entorno.
tags:
  - laravel
  - migration
  - service-mode
  - embedded
keywords:
  - migración de Durable Workflow en Laravel
  - modo servicio en Laravel
  - migración de v1 a v2
  - de integrado a modo servicio
---

# Adopción en Laravel y transición del entorno de ejecución {#laravel-adoption-and-runtime-transition}

Las aplicaciones Laravel tienen dos destinos oficiales en Durable Workflow 2.0.
El modo integrado mantiene la ejecución duradera dentro de la aplicación. El
modo servicio conserva Laravel como framework de aplicación y workers, mientras
Cloud o un Server autogestionado son propietarios del estado duradero.

Esta página ayuda a decidir y ejecutar tres transiciones:

1. De Laravel v1 estable a 2.0 integrado.
2. De Laravel v1 estable al SDK PHP 2.0 en modo servicio.
3. De Laravel 2.0 integrado al SDK PHP 2.0 en modo servicio.

Si tu objetivo inmediato es actualizar el paquete v1, consulta a la vez la
[guía detallada de migración a 2.0](/docs/migration/). Si ya elegiste un entorno
de servicio autogestionado, continúa con el
[procedimiento de integrado a Server](/docs/polyglot/embedded-to-server/) tras
elegir aquí la política de transición.

## Elige el destino {#pick-the-destination}

| Punto de partida | Destino | Cuándo elegirlo | Primer límite de transición |
| --- | --- | --- | --- |
| Laravel v1 estable | 2.0 integrado | La aplicación debe seguir siendo propietaria de persistencia, colas, ejecución y Waterline integrado. | Actualiza `durable-workflow/workflow` a la línea 2.0. Las ejecuciones v1 terminan mediante la ruta de compatibilidad del paquete; los nuevos inicios usan v2. |
| Laravel v1 estable | SDK PHP en modo servicio | Laravel debe conservar inyección de dependencias, configuración, Artisan, registros, eventos y simulaciones de prueba, pero Cloud o Server deben poseer el estado duradero. | Instala `durable-workflow/sdk` como límite separado de cliente/worker. El historial v1 y los trabajos duraderos de colas Laravel permanecen en v1 hasta terminar. |
| Laravel 2.0 integrado | SDK PHP en modo servicio | La aplicación debe dejar de operar la orquestación o necesita un entorno compartido/políglota. | Dirige los nuevos inicios al servicio tras preparar sus workers. Drena las ejecuciones integradas en origen o usa la importación explícita de ejecuciones v2 elegibles a Server autogestionado. |

El puente del SDK PHP y el paquete integrado admiten Laravel 9 a 13 con sus
versiones PHP compatibles. Una aplicación v1 admitida puede elegir cualquiera
de los destinos sin una actualización de Laravel ajena a esta transición.

## Compara los límites de responsabilidad {#compare-the-ownership-boundary}

| Aspecto | Laravel v1 estable | Laravel 2.0 integrado | SDK PHP 2.0 en modo servicio |
| --- | --- | --- | --- |
| Propietario del entorno | Laravel posee orquestación y reproducción. | Laravel posee motor v2, historial, asignación, temporizadores y reproducción. | Cloud opera el namespace o tu equipo opera Server. Laravel ejecuta clientes y workers remotos, no el entorno de orquestación. |
| Paquete Composer | `durable-workflow/workflow` estable 1.x. | `durable-workflow/workflow` de la autoridad de artefactos 2.0. | `durable-workflow/sdk` de la autoridad independiente del SDK PHP. No depende del motor integrado. |
| Procesos necesarios | Procesos web/CLI Laravel y workers de colas o Horizon. | Procesos web/CLI Laravel y workers o Horizon; programador y reparación siguen la configuración integrada. | Procesos Laravel y uno o más `php artisan durable-workflow:worker`. Cloud aporta el entorno. Alojamiento propio exige además Server y su persistencia. |
| Colas y almacenamiento | Filas e historial orientado a PHP en bases Laravel configuradas; trabajos de workflow, actividad, reintento y temporizador en backends de colas Laravel. | Historial y proyecciones en la base de la aplicación; las tareas integradas usan normalmente colas Laravel. | Historial y tareas en Cloud o Server. `DURABLE_WORKFLOW_TASK_QUEUE` identifica una cola remota sondeada por el worker SDK, no una conexión de cola Laravel. |
| Identidad de workflow/actividad | Las clases PHP son identidades duraderas. | Configura alias estables bajo `workflows.v2.types`; las clases son implementaciones locales. | `#[Workflow('orders.fulfill')]` y `#[Activity('orders.reserve')]` publican claves de tipo de cadena estables al registrar. No uses nombres PHP plenamente cualificados como contrato entre entornos. |
| Credenciales | Credenciales de aplicación, base, caché y cola; la `APP_KEY` original sigue siendo parte de la recuperación v1. | Credenciales Laravel y de base, caché, cola y autenticación de Waterline integrado a cargo de la aplicación. | Los procesos de aplicación Cloud reciben solo credencial de control y los workers solo credencial de worker. En alojamiento propio puede usarse un token compartido o credenciales limitadas equivalentes. Se proporcionan por proceso y se excluyen deliberadamente de la configuración Laravel en caché. |
| Herramientas operativas | Registros/eventos Laravel, herramientas de colas, Horizon, Waterline v1 y `workflow:v1:list` si está disponible. | Registros/eventos, herramientas de colas, `workflow:v2:doctor`, comandos de historial/reparación y Waterline integrado. | Diagnósticos SDK por el logger PSR y `WorkerDiagnosticEvent`. Cloud incluye Managed Waterline. Los operadores propios usan API/CLI de Server y pueden desplegar Waterline aparte contra su namespace. |
| Transición y reversión | Tu equipo conserva base v1, colas, configuración y secretos como conjunto de recuperación. | Tu equipo separa inicios v1/v2, conserva mecanismos de activación v1 y decide cuándo retirar tablas/colas antiguas. | Tu equipo dirige cada comando al entorno propietario. Cloud revierte su entorno gestionado; los operadores propios se encargan de persistencia y reversión de Server. Al revertir la aplicación conserva rutas a ambos entornos hasta terminar sus ejecuciones. |

Cloud y Server autogestionado son alternativas del modo servicio. Los usuarios de
Cloud no instalan Server ni otro Waterline. Los operadores propios despliegan,
protegen, respaldan, escalan y actualizan Server. Waterline es un despliegue
opcional separado contra el namespace de Server.

## Un caso de uso Laravel en los tres modos {#one-laravel-use-case-in-all-three-modes}

Los ejemplos reservan inventario para `orders.fulfill`. Mapea expresamente la
clase v1 estable a claves de tipo v2 y conserva estables esas claves y la cola.
La reserva de inventario y el consumidor de eventos de negocio deben ser
idempotentes, pues una actividad puede ejecutarse más de una vez tras un reintento
o la pérdida de confirmación de finalización.

La acción de aplicación es la misma en producción y pruebas:

| Modo | Entrada de producción | Entrada tras activar su simulación |
| --- | --- | --- |
| Laravel v1 estable | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| Laravel 2.0 integrado | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |
| SDK PHP en modo servicio | `app(StartOrderFulfillment::class)->start('1001')` | `app(StartOrderFulfillment::class)->start('1001')` |

La inyección por constructor de Laravel está disponible en el límite de aplicación
en todos los modos. v1 inyecta dependencias de actividad en `execute()`. v2
integrado y servicio piden al contenedor construir workflows y actividades, por
lo que usan constructores normales. Toda lectura de un workflow reproducido debe
ser determinista y respaldada por configuración. Base de datos, red, reloj y
otros efectos secundarios pertenecen a actividades.

### Laravel v1 estable {#stable-v1-laravel}

Conserva la [instalación v1 estable](/docs/1.x/installation/) y sus requisitos de
controlador de colas real. Esta implementación usa un iniciador de aplicación con
inyección por constructor y servicios de actividad con inyección por método:

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

`config/queue.php` y el entorno siguen seleccionando la conexión real Laravel.
Ejecuta un worker para la cola configurada:

<!-- docs-example id="laravel.adoption.v1.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

La simulación estable ejecuta la misma acción inyectada que producción:

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

Las comprobaciones de eventos Laravel siguen disponibles al probar la actividad
real. No sustituyas workers v1 solo porque se añadió el SDK v2 en otra parte.

### Laravel 2.0 integrado {#20-embedded-laravel}

La instalación estable usa el mismo paquete Workflow que el inicio rápido integrado:

<!-- docs-example id="laravel.adoption.v2-embedded.install" -->
```bash
composer require %%artifact.workflowComposerPackage%%
```

Publica o actualiza `config/workflows.php` y asigna alias estables al mismo contrato
de negocio. El archivo publicado contiene más opciones v1/v2 obligatorias.
Combina estos valores con sus arrays existentes, sin reemplazar el archivo
completo por este extracto:

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

La API pasa a `handle()` y deja de devolver resultados de actividades con `yield`.
Laravel construye ambos objetos. La actividad sigue siendo el lugar adecuado
para registros y eventos de negocio con efectos secundarios:

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

Ejecuta el worker de colas Laravel según el despliegue integrado:

<!-- docs-example id="laravel.adoption.v2-embedded.worker" -->
```bash
php artisan queue:work redis --queue=orders
```

Usa la simulación integrada desde la misma acción. Ejecuta inmediatamente las
tareas listas y registra despachos de actividad:

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

Esta simulación ejercita filas duraderas e historial integrados. No es la
simulación del cliente SDK ni sustituye un entorno de servicio.

### SDK PHP en modo servicio en Laravel {#php-sdk-service-mode-in-laravel}

Instala el SDK publicado de forma independiente. El comando se genera desde la
autoridad del artefacto SDK PHP publicado, sin copiar una versión puntual:

<!-- docs-example id="laravel.adoption.service.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

Laravel 9 a 13 descubre automáticamente el proveedor. Publica la configuración y
enumera las clases de manejadores con atributos:

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

El workflow de servicio usa las mismas cadenas públicas que v2 integrado.
El contenedor Laravel construye ambas clases de servicio con atributos:

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

La aplicación inyecta la interfaz SDK nativa de Laravel en vez de acceder por
fachada o construir un cliente de transporte. La clase con atributos aporta el
tipo de workflow; la configuración publicada, la cola predeterminada:

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

Tras publicar la configuración, guarda en caché solo opciones sin secretos.
`RUNTIME_URL` debe ser la URI completa del entorno de namespace provisionado en
Cloud o el origen de Server autogestionado. No añadas `/api`.

Inicia el worker solo con su credencial de rol worker:

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

Sin `--queue`, el worker Artisan sondea la cola `orders` configurada. Antes del
sondeo normal, su diagnóstico de registro y sondeo identifica entorno, namespace,
cola, tipos de workflow/actividad con atributos y rol de la credencial.

Los procesos de aplicación/web/colas reciben `DURABLE_WORKFLOW_CLIENT_TOKEN`,
sin token de worker. En alojamiento propio se puede usar `DURABLE_WORKFLOW_TOKEN`
cuando se autoriza deliberadamente una credencial para ambos roles.

El worker SDK escribe diagnósticos de ciclo de vida, reintentos, fallos y cierre
mediante el logger PSR y despacha
`DurableWorkflow\Bridge\Event\WorkerDiagnosticEvent` por eventos Laravel.
Las actividades de negocio pueden seguir usando el logger y despachador inyectados.

La simulación de fachada incluida sustituye la misma interfaz inyectada de la aplicación:

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

Esta simulación demuestra la interacción Laravel sin Cloud ni Server. Usa el
banco de pruebas de workers del SDK para comandos de manejadores. La simulación
del cliente no ejecuta código de workers remotos.

## Drenar, cambiar de entorno y revertir {#drain-cut-over-and-roll-back}

Cambiar un requisito Composer no mueve un workflow en curso, historial,
temporizador diferido, reintento ni trabajo de cola listo/reservado. Trata los
entornos antiguo y nuevo como sistemas duraderos separados durante toda la transición.

### 1. Establecer el punto de recuperación {#1-establish-the-recovery-cut}

Antes de cambiar tráfico:

- Inventaría conexión de base v1/integrada, todas las colas de workflow y actividad,
  cuenta/región/prefijo del backend, bloqueos de caché y referencia del gestor de
  secretos a la `APP_KEY` original.
- Bloquea nuevos inicios y entrada de mensajes el tiempo necesario para detener
  la actividad de origen. Detén cada worker al terminar su trabajo actual.
  `queue:restart` no basta si un supervisor lo sustituye inmediatamente.
- Drena todas las ejecuciones de origen o captura un punto de recuperación
  coherente con SQL y todos los trabajos listos, diferidos y reservados. Una
  copia solo de base no recrea temporizadores, reintentos ni actividades en colas.
- Registra qué entorno posee cada identificador no terminal. Señales, consultas,
  actualizaciones, cancelación, terminación, reparación y lecturas de resultados
  deben seguir esa propiedad.

### 2. Aplicar la regla de la transición elegida {#2-apply-the-path-specific-rule}

| Transición | Ejecuciones no terminales existentes | Nuevas ejecuciones tras cambiar | Límite de reversión |
| --- | --- | --- | --- |
| v1 a 2.0 integrado | Terminan mediante compatibilidad v1. Conserva tablas, requisitos de decodificación PHP, consumidores de colas y estado hasta terminar. | Inicia mediante `Workflow\V2\WorkflowStub` solo tras superar la prueba canaria v2. | Restaura SQL/colas del mismo punto v1 y configuración exacta, o corrige hacia delante. No restaures SQL sobre colas más nuevas. |
| v1 a Cloud o servicio autogestionado | Permanecen en v1. Su historial no se importa al servicio ni lo reproducen workers remotos. | Inicia con `LaravelWorkflowClientInterface` después de que un worker SDK registrado anuncie las claves previstas. | Devuelve nuevos inicios a v1 solo si sigue sano. Lo ya aceptado por el servicio permanece allí. |
| v2 integrado a Cloud | Drena en origen. Incorporarse a Cloud no convierte un cambio de paquete en importación de historial. | Inicia en el namespace provisionado tras verificar credenciales y cola. | Devuelve nuevos inicios al integrado si hace falta, manteniendo los comandos de ejecuciones aceptadas por Cloud dirigidos a Cloud. |
| v2 integrado a Server propio | Drena en origen o realiza aparte exportación, simulación e importación atómica admitidas de una ejecución elegible en reposo. Instalar el paquete no demuestra elegibilidad. | Usa el SDK tras verificar descubrimiento, namespace, registro y cola de Server. | Una importación fallida no escribe una ejecución parcial. Tras confirmarse, Server es propietario; no reanudes la copia integrada. |

Para importar a alojamiento propio, usa el
[procedimiento completo de integrado a Server](/docs/polyglot/embedded-to-server/#phase-e-import-eligible-embedded-v2-runs).
Rechaza v1, historial con datos eliminados, tareas con lease, intentos de actividad
en curso y otras instantáneas inseguras. Exportar historial solo aporta datos de
auditoría/depuración. Solo esa importación explícita validada crea estado de Server.

### 3. Demostrar el destino antes de cambiar tráfico {#3-prove-the-destination-before-switching-traffic}

1. Configura un namespace, cola y conjunto estable de tipos de workflow/actividad.
2. Inicia el destino y sus workers SDK junto al entorno antiguo.
3. Verifica descubrimiento de Server o provisión Cloud, credenciales por rol,
   registro, claves anunciadas, visibilidad de colas y diagnósticos Laravel.
4. Envía un pedido canario/de sombra con identidad única y espera un resultado
   terminal en la interfaz de operador del destino.
5. Cambia los nuevos inicios por familia de workflow. Impide iniciar la misma
   clave de negocio en ambos entornos.
6. Conserva workers, colas, credenciales, registros/eventos e interfaz de operador
   de origen hasta que sus ejecuciones terminen o completen una importación
   autogestionada admitida.

Retirar un paquete, cola, tabla, secreto o Waterline antiguo es el último paso,
nunca el mecanismo de transición.

Para traslados entre runtimes de modo servicio, use [trasladar cargas entre runtimes](/docs/polyglot/runtime-migration/). Exportar historial de Server no es importar estado activo.

## Continúa por la opción elegida {#continue-with-the-chosen-path}

- [Instalación v1 estable](/docs/1.x/installation/)
- [Planificación de migración v1 estable](/docs/migration/)
- [Instalación integrada 2.0](/docs/installation/)
- [Migración detallada del paquete de v1 a v2](/docs/migration/)
- [SDK PHP en modo servicio](/docs/polyglot/php/)
- [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/)
- [Server autogestionado](/docs/polyglot/server/)
- [De v2 integrado a Server propio](/docs/polyglot/embedded-to-server/)
