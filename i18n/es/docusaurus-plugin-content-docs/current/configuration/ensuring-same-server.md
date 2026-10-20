---
sidebar_position: 3
title: Ubicación y afinidad de los workers
description: Elige entre enrutamiento por colas, actividades locales y sesiones de worker sin confundir el nombre de una cola con afinidad a un host físico.
tags:
  - configuration
  - workers
  - affinity
keywords:
  - afinidad del worker de actividades
  - cola dedicada de actividades
  - actividad en el mismo proceso
  - sesiones de worker
---

# Ubicación y afinidad de los workers {#worker-placement-and-affinity}

El nombre de una cola delimita el enrutamiento, pero no garantiza afinidad con un
host físico. La propiedad `$queue` de un workflow o actividad restringe los workers
que pueden reclamar la tarea, pero puede recibirla cualquier worker compatible
que consulte esa cola. No pases datos entre actividades ordinarias mediante el
sistema de archivos local de un worker salvo que también estén guardados en una
ubicación compartida durable.

## Dirigir trabajo a un grupo dedicado de workers {#route-work-to-a-dedicated-worker-pool}

Usa una cola dedicada cuando un tipo de trabajo necesite un grupo concreto de
workers, por ejemplo, con un volumen compartido montado o capacidad de GPU:

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

Inicia en esa cola únicamente los workers de Laravel previstos:

```bash
php artisan queue:work --queue=gpu-activities
```

Laravel Horizon puede supervisar esa misma cola. En ambos casos, la garantía es
«uno de los workers asignados a esta cola», no «el mismo proceso u host que ejecutó
el paso anterior». Guarda los datos de traspaso en cargas útiles durables del
workflow, almacenamiento externo de cargas útiles u otro almacén compartido
accesible para todos los workers aptos.

## Elegir el contrato de afinidad necesario {#choose-the-affinity-contract-you-need}

- Usa una [actividad ordinaria en cola](/docs/defining-workflows/activities)
  cuando el trabajo pueda ejecutarse en cualquier worker compatible de su cola.
- Usa una [actividad local](/docs/features/local-activities) cuando una actividad
  breve y reintentable deba ejecutarse dentro del proceso del worker de workflow
  que esté atendiendo la tarea de workflow.
- Usa una [sesión de worker](/docs/features/worker-sessions) cuando varios pasos
  de actividad durables deban reutilizar una misma concesión de sesión para
  estado local del proceso, memoria GPU o un sistema de archivos montado local al worker.

Las sesiones de worker siguen aplicando primero el enrutamiento por colas.
Después añaden un contrato explícito de concesión y capacidades, con caducidad
y readquisición opcional; no hacen inmortal una máquina. Si el estado debe
sobrevivir a la pérdida del worker o a la readquisición de la sesión, consérvalo
en almacenamiento compartido durable.

Consulta [Modelo de ejecución de actividades](/docs/features/activity-execution-model)
para comparar ubicaciones y [Opciones](/docs/configuration/options#queue) para
configurar colas por clase o por llamada.
