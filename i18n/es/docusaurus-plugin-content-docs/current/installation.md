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

- PHP 8.1 o posterior
- Laravel 9 o posterior

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

Usa `durable-workflow/workflow:^2.0` para que Composer pueda instalar
actualizaciones compatibles de la serie 2.x. Consulta
[Compatibilidad de versiones](/docs/compatibility) para conocer las reglas
de compatibilidad entre el runtime y los paquetes.

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
