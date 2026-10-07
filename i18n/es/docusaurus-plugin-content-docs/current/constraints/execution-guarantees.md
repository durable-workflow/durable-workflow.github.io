---
sidebar_position: 3.5
title: Garantías de ejecución e idempotencia
description: Contrato público de v2 para reproducción, reintentos, vencimiento de leases, reentrega e identidades idempotentes.
tags:
  - constraints
  - idempotency
  - retries
  - replay
keywords:
  - garantías de ejecución
  - idempotencia
  - reproducción
  - reentrega
---

# Garantías de ejecución e idempotencia {#execution-guarantees-and-idempotency}

Durable Workflow v2 distingue entre **reproducción de workflows** y
**ejecución de actividades**:

- El código del workflow se reproduce a partir del historial confirmado y
  debe ser determinista.
- Las actividades realizan efectos externos y se ejecutan **al menos una vez**.
- El historial registra los resultados confirmados de workflows y actividades
  exactamente una vez por identificador duradero, aunque el transporte
  entregue el trabajo varias veces.

Estas garantías permiten reanudar después de reinicios de workers, vencimiento
de leases, reentrega de tareas y despliegues graduales sin perder el punto de
ejecución.

## Reproducción y reintento {#replay-is-not-retry}

Las tareas de workflow reconstruyen el estado a partir del historial confirmado
y deciden el siguiente paso. La reproducción vuelve a ejecutar el cuerpo del
workflow. Las actividades, señales y efectos externos ya registrados se
recuperan del historial, sin repetirse.

Por eso, el código del workflow debe mantenerse determinista. Usa funciones
seguras como [`Workflow::now()`](../defining-workflows/workflow-api.md),
[`sideEffect(...)`](../features/side-effects.md), consultas, actualizaciones,
resultados de actividades, memos y atributos de búsqueda para cruzar el límite
de persistencia duradera.

## Las actividades se ejecutan al menos una vez {#activity-execution-is-at-least-once}

Las actividades realizan los efectos externos. Su contrato permite:

- Que un intento de actividad sea reclamado más de una vez.
- Que el vencimiento de una lease provoque una reentrega a otro worker.
- Que un worker termine el trabajo externo, pierda su lease y comunique el
  resultado tarde.
- Que un reintento programe un nuevo intento duradero de la misma actividad
  lógica.

La ejecución duplicada forma parte del contrato. El autor de la aplicación
debe hacer que la actividad o el sistema remoto sean seguros al repetirse.

Consulta [Restricciones de las actividades](./activity-constraints.md) para
escribirlas y [Fallos y recuperación](../failures-and-recovery.md) para operarlas.

## Qué se registra exactamente una vez {#what-is-exactly-once}

Un worker puede recibir varias veces un trabajo con efectos externos. Los
hechos duraderos confirmados son la autoridad y no se duplican para el mismo
identificador duradero.

En la práctica:

- Una decisión confirmada del workflow se guarda una vez en el historial
  tipado para el ID de su comando o paso.
- El resultado terminal confirmado de un intento se guarda una vez para ese
  `activity_attempt_id`.
- La reproducción lee esos hechos y reconstruye el estado del workflow.

La distinción esencial es:

- **El transporte y los workers entregan trabajo al menos una vez.**
- **El historial duradero confirmado registra cada hecho exactamente una vez
  por identificador duradero.**

## Vencimiento de leases y reentrega {#lease-expiry-and-redelivery}

El vencimiento de una lease es una vía normal de recuperación:

- Una tarea reclamada tiene un propietario de lease y una hora de vencimiento.
- Si la lease vence antes de que el worker comunique progreso o finalización,
  la tarea puede volver a entregarse.
- Otro worker puede reclamar el mismo trabajo lógico.

La reentrega recupera trabajo cuyo estado en el worker o en el transporte es
incierto. Los hechos ya confirmados siguen en el historial.

Ante síntomas de duplicación, investiga por separado:

1. ¿Ocurrió el efecto externo más de una vez?
2. ¿Registró el estado duradero más de un resultado confirmado para el mismo
   identificador?

La primera cuestión requiere actividades idempotentes. La segunda pertenece
al contrato del motor.

## Identidades idempotentes predeterminadas {#default-idempotency-surfaces}

Estos identificadores estables permiten deduplicar trabajo:

| Identificador | Qué identifica | Uso habitual |
| --- | --- | --- |
| `workflow_instance_id` | Una instancia pública de workflow | Deduplicar inicios e identificar el proceso de negocio |
| `workflow_run_id` | Una ejecución duradera concreta | Fijar la ejecución consultada, exportada o diagnosticada |
| `workflow_command_id` | Un comando externo que modifica estado | Deduplicar reintentos de solicitudes del cliente |
| `activity_execution_id` | Una actividad lógica a través de sus reintentos | Clave idempotente predeterminada para efectos externos |
| `activity_attempt_id` | Un intento concreto de esa actividad | Correlación cuando el sistema remoto distingue intentos |
| `schedule_id` | Una definición de programación | Deduplicar propiedad y disparos de la programación |
| `idempotencyKey` de un flujo de mensajes | Un envío lógico de mensaje | Evitar la entrada duplicada cuando el emisor reintenta |

Usa `activity_execution_id` como clave idempotente predeterminada de una
operación externa. Elige `activity_attempt_id` cuando el destino necesite
distinguir cada intento.

```php
use Workflow\V2\Activity;

final class ChargeCard extends Activity
{
    public function handle(array $payload): string
    {
        return app(PaymentGateway::class)->charge(
            $payload,
            idempotencyKey: $this->activityId(),
            attemptCorrelation: $this->attemptId(),
        );
    }
}
```

## Qué debe ser idempotente en tu aplicación {#what-developers-must-make-idempotent}

El framework se encarga de reproducir el workflow y reconstruir el estado a
partir del historial confirmado.

Tu aplicación debe hacer seguros al repetirse los efectos externos, como:

- Pagos y operaciones de facturación.
- Correos, mensajes y webhooks.
- Escrituras en otra base de datos o servicio.
- Creación o subida de archivos.
- Comandos que crean o modifican estado fuera del historial del workflow.

Patrones habituales:

- Pasar una clave idempotente a la API remota.
- Escribir en un recurso determinista, como una clave de objeto conocida.
- Usar un upsert o una transacción con un identificador duradero.
- Hacer que repetir la acción no produzca otro efecto.

## Guía para operadores {#operator-guidance}

Al diagnosticar una ejecución en Waterline, el CLI o los registros de Server:

- La entrega duplicada después del vencimiento de una lease es esperable.
  Comprueba el resultado duradero del intento.
- El motor resuelve los informes tardíos de finalización o fallo. Su rechazo
  no demuestra que el efecto externo no ocurriera.
- La reproducción de tareas recupera el workflow dentro de su ejecución.
- Investiga la ausencia de workers compatibles, las leases atascadas y las
  reparaciones repetidas antes de volver a ejecutar efectos externos.

Durante la operación, distingue la **incertidumbre del transporte** del
**resultado duradero**. Durable Workflow expone ambos para poder investigarlos.

## Guías relacionadas {#related-guides}

- [Resumen](./overview.md): separación entre workflows y actividades.
- [Restricciones de los workflows](./workflow-constraints.md): determinismo.
- [Restricciones de las actividades](./activity-constraints.md): seguridad de
  los efectos externos e idempotencia.
- [Fallos y recuperación](../failures-and-recovery.md): reintentos, plazos y reparación.
- [Modelo de ejecución de actividades](../features/activity-execution-model.md):
  actividades en cola, actividades locales, sesiones de workers y ejecución sticky.
- [Actividades locales](../features/local-activities.md): intentos en el mismo
  proceso, heartbeats de tareas, reintentos y reproducción en frío.
- [Ejecución sticky](../features/sticky-execution.md): cachés de reproducción
  y recuperación correcta mediante reproducción en frío.
