---
sidebar_position: 3
---

# Instalación {#installation}

Esta guía explica cómo instalar el paquete PHP de Durable Workflow en una aplicación Laravel.

Si estás eligiendo entre integrar el paquete en tu aplicación y usar el Server
independiente, empieza por [Modos de despliegue](/docs/polyglot/deployment-modes).
Esta página describe la integración en Laravel.

> **¿Prefieres empezar con una aplicación que ya funciona?** La
> [aplicación de ejemplo](/docs/sample-app) es un proyecto Laravel 13 ejecutable
> con Durable Workflow 2.0. Incluye un workflow para cada patrón, un entorno
> Codespaces y una opción con `docker compose`. Clona el proyecto y ejecuta
> `php artisan app:init` para aplicar esta misma instalación. Vuelve a esta guía
> cuando quieras añadir Durable Workflow a tu propia aplicación Laravel.

## Requisitos {#requirements}

- PHP 8.2 o posterior de la serie 8.x
- Laravel 12.72 o posterior de 12.x, o Laravel 13.41 o posterior de 13.x
- PHP 8.3 o posterior para Laravel 13

Estos requisitos corresponden a la versión integrada actual. Antes de actualizar
Composer en una aplicación antigua, elige la [línea publicada compatible](./compatibility.md#laravel-support).
El SDK PHP básico de modo servicio tiene requisitos independientes.

Consulte [Compatibilidad de bases de datos](./polyglot/database-support.md) para las declaraciones de modo embebido y Server, configuraciones exactas probadas y límites de cualificación.

Durable Workflow funciona con los drivers de colas que admite Laravel, excepto
el driver `sync`. Entre ellos están:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Cada driver tiene sus propios [requisitos previos](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Durable Workflow también necesita un driver de caché que admita
[bloqueos](https://laravel.com/docs/12.x/cache#atomic-locks).

## Instalar Durable Workflow {#installing-durable-workflow}

Instala Durable Workflow con Composer:

```bash
composer require %%artifact.workflowComposerPackage%%
```

El comando anterior fija la versión integrada publicada. Revisa el
[límite de compatibilidad y actualización de Laravel](./compatibility.md#laravel-support)
antes de ampliar la restricción o actualizar una aplicación Laravel antigua.

El paquete carga sus migraciones automáticamente. Después de instalarlo,
basta con ejecutar las migraciones habituales:

```bash
php artisan migrate
```

## Ejecutar workers {#running-workers}

Durable Workflow usa colas para ejecutar workflows y actividades en segundo
plano. Necesitas ejecutar el [comando `queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command)
o usar [Horizon](https://laravel.com/docs/12.x/horizon) para administrar los
workers de las colas. Sin un worker, los workflows y las actividades no se
procesan. Para ejecutarlos en paralelo, necesitas más de un worker.

### Tiempo límite del worker {#worker-timeout}

Cuando PHP tiene la extensión `pcntl`, un worker de colas termina cualquier job
que se ejecute más allá de su tiempo límite: el `--timeout` del worker, 60
segundos por defecto, salvo que el job defina el suyo. Una tarea de workflow
terminada así pierde su lease y se revierte. Solo se reintenta cuando vence el
lease (`workflows.v2.workflow_task_lease_seconds`, 300 segundos por defecto), y
el reintento repite el mismo trabajo. Una tarea de workflow que siempre necesita
más tiempo que el límite, como una que programa o termina un `all()` amplio,
nunca se completa.

Tres ajustes deben encajar:

- El **tiempo límite de la tarea de workflow** debe ser inferior al
  **lease de la tarea de workflow**. El trabajo que se prolonga más allá del
  lease no puede completarse.
- El **`retry_after`** de la conexión de cola debe superar el tiempo límite de
  cada job que pase por ella, como exige Laravel. De lo contrario, la cola
  entrega un job que sigue en ejecución a un segundo worker.
- Las **actividades** deben mantener un tiempo límite acotado, para que una
  actividad bloqueada no pueda retener un worker para siempre. No uses
  `--timeout=0`.

Ejecuta las tareas de workflow en su propia conexión de cola, con un
`retry_after` superior al lease y con workers cuyo `--timeout` sea inferior al
lease. Ejecuta las actividades en otra cola con un tiempo límite adecuado para
ellas. Las actividades usan la cola de su workflow, salvo que la clase de la
actividad defina su propio `$connection` o `$queue`.

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

En Horizon, la opción `timeout` de cada supervisor es el tiempo límite del
worker. Las versiones más recientes de Workflow asignan este tiempo límite a
cada job de tarea de workflow (el lease menos 30 segundos, mantenido al menos 10
segundos por debajo de `retry_after`), de modo que un tiempo límite corto del
worker ya no termina las tareas de workflow. Un worker de la cola de workflows
registra una advertencia al iniciarse cuando `retry_after` limita las tareas de
workflow.
