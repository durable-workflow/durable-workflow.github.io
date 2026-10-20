---
title: Operaciones de servicio
description: Llama a una operación de otro espacio de nombres desde un workflow PHP integrado.
---

# Operaciones de servicio {#service-operations}

Usa una operación de servicio cuando un workflow necesite un resultado duradero de un servicio perteneciente a otro espacio de nombres. La llamada identifica un endpoint, servicio y operación registrados. El runtime registra la llamada y su resultado para que un worker de reemplazo reproduzca el mismo resultado.

Los workflows hijo y las señales permanecen en su espacio de nombres original. Cambiar el nombre del tipo hijo o la cola de tareas no cruza ese límite. Para ejecutar trabajo publicado en otro espacio de nombres del mismo clúster de Durable Workflow, usa una operación de servicio.

## Llamar desde PHP integrado {#call-from-embedded-php}

Registra el catálogo de destino y su manejador antes de iniciar el workflow llamante. La [guía del modo servicio](../polyglot/service-operations.md) explica el catálogo compartido, la política de límites y las interfaces de SDK publicadas de forma independiente.

La función auxiliar integrada usa el catálogo de servicios y el plano de control del propio runtime de la aplicación. No se conecta por sí sola a un Server remoto. Usa el PHP SDK cuando el llamante sea un worker remoto en modo servicio.

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` devuelve `ServiceOperationResult`, con el `serviceCallId` duradero, el estado del ciclo de vida, el desenlace y los datos de respuesta. Un fallo o una cancelación terminal del servicio se restaura como una excepción tipada del workflow en la llamada original. Mantén disponibles las correspondencias de errores de la aplicación para la reproducción.

## Elegir qué espera el llamante {#choose-what-the-caller-waits-for}

Usa `modeOverride: 'sync'` y `waitFor: 'completed'` cuando la siguiente decisión del workflow dependa del resultado del servicio. El workflow se suspende de forma duradera mientras la llamada no sea terminal.

Usa `modeOverride: 'async'` o `waitFor: 'accepted'` cuando baste con la admisión. El registro devuelto identifica la llamada original. La aceptación no equivale a trabajo de negocio completado. Un resultado posterior del destino no reescribe el resultado ya registrado para un llamante que solo esperaba admisión. Si el workflow necesita el resultado terminal, elige desde el principio esperar a la finalización.

## Conservar el contrato registrado {#preserve-the-recorded-contract}

Mantén estables el espacio de nombres de destino, endpoint/servicio/operación, petición y opciones de espera de una ejecución abierta. Usa ramas de versión del workflow para cambios incompatibles. La reproducción reutiliza la identidad y el resultado registrados, en lugar de solicitar otra ejecución.

Una clave explícita de idempotencia es una identidad de negocio duradera. Reutilízala solo para la misma operación y petición previstas. No la cambies únicamente porque se perdió una respuesta o venció una espera. Inspecciona la llamada original antes de decidir si otra operación de negocio es segura.

Para limitar la ejecución del servicio, establece `deadline_policy` en la operación del catálogo. Su `timeout_seconds` se resuelve una sola vez desde la aceptación original en `call_deadline_at`; la alternativa es `deadline_at` con desplazamiento horario. Reemplazar el worker o reproducir no renueva ese plazo. `waitTimeoutSeconds` no es el plazo de ejecución del servicio. Coordina los presupuestos del workflow y del servicio e inspecciona el destino tras un timeout, en vez de suponer que no hubo efectos externos.

## Guías relacionadas {#related-guides}

- [Llamadas entre espacios de nombres](../polyglot/service-operations.md)
- [Workflows hijo](./child-workflows.md)
- [Versionado](./versioning.md)
- [Fallos y recuperación](../failures-and-recovery.md)
