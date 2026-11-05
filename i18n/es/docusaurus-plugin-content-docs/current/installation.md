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

La serie publicada Workflow 2.20.x requiere:

- PHP `^8.1`
- Laravel 10–13 con los mínimos declarados en el
  [manifiesto del paquete](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)

Laravel 11 y 12 requieren PHP 8.2 o posterior; Laravel 13 requiere PHP 8.3 o
posterior. Consulta [Compatibilidad de versiones](/docs/compatibility/#embedded-php-and-laravel-support)
para las restricciones exactas y el límite independiente del SDK PHP.

### Prepararse para Workflow 2.21 {#preparing-for-workflow-2-21}

:::info Cambio de soporte aún no publicado

El código de Workflow 2.21 requiere PHP `^8.2` y Laravel `^12.69.0|^13.30.0`.
Todavía no está publicado ni ha superado Release Verification. El comando de
instalación de abajo sigue seleccionando un artefacto publicado; integrar el
código fuente no cambia esa autoridad.

:::

Actualiza las aplicaciones con PHP 8.1 o Laravel 10/11 a una plataforma
compatible antes de adoptar 2.21. Laravel 13 sigue necesitando PHP 8.3 o
posterior. Actualiza los procesos web, CLI y workers, conservando el archivo
de bloqueo de la aplicación 2.20.x mientras preparas y pruebas la actualización.
Una solicitud explícita de 2.21 debe rechazar una plataforma no compatible;
mantén activas las comprobaciones de plataforma y el bloqueo por avisos de
Composer. Conservar 2.20.x no amplía el soporte de seguridad de PHP o Laravel.

Este cambio de soporte no introduce una migración de esquema, historial o
protocolo. Las ejecuciones v1 siguen perteneciendo a v1; el
[procedimiento de migración](/docs/migration/) sigue regulando el vaciado o la coexistencia.

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
