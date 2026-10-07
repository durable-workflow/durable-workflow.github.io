---
sidebar_position: 3
---

# Restricciones de las actividades {#activity-constraints}

Las actividades realizan las operaciones de entrada/salida y los efectos
externos de un workflow. Su código se ejecuta **al menos una vez**. Los
reintentos, el vencimiento de una lease y la reentrega pueden hacer que el
mismo trabajo lógico se ejecute varias veces.

Si una actividad cobra un pago, envía un correo, escribe en otro sistema o
modifica un recurso externo, la operación debe ser segura al repetirse.

## Consecuencias prácticas {#what-this-means-in-practice}

- `activity_execution_id` es la identidad idempotente predeterminada de una
  ejecución lógica de actividad.
- Cada intento tiene además su propio `activity_attempt_id`.
- Un worker puede completar el efecto externo, perder su lease y comunicar el
  resultado tarde. El motor puede rechazar ese resultado porque otro worker
  ya registró el resultado duradero. El efecto externo puede haber ocurrido.
- Las actividades pueden usar entrada/salida, el reloj del sistema y estado
  mutable del proceso. El código de workflow debe mantenerse determinista.

## Patrones de idempotencia recomendados {#preferred-idempotency-patterns}

Muchas API externas aceptan una cabecera `Idempotency-Key`. Cuando el servicio
lo permita, usa la identidad lógica de la actividad:

- Prefiere `activity_execution_id` si los reintentos deben representar la
  misma solicitud lógica.
- Usa `activity_attempt_id` cuando el sistema externo necesite distinguir
  cada intento de ese trabajo.

También puedes:

- Escribir en un recurso externo con un nombre o una clave determinista.
- Usar operaciones upsert o tablas de deduplicación con un identificador duradero.
- Diseñar la operación para que repetirla no cambie el resultado.

Algunas operaciones ya son idempotentes: codificar el mismo vídeo puede
producir el mismo archivo, y borrar un archivo ya borrado no produce otro
efecto.

En otras operaciones, duplicar puede ser preferible a perder el resultado.
Si no sabes si un proveedor envió un correo, puede ser más seguro enviarlo de
nuevo que omitir la notificación. Decide esa compensación de forma explícita.

## Suposiciones que debes evitar {#what-not-to-assume}

- Un intento de actividad puede llegar a más de un worker.
- Un reintento no demuestra que el efecto externo anterior haya fallado.
- Un resultado tardío no demuestra que la actividad no se ejecutara.
- Mantén los efectos externos en actividades. Llevarlos al código de workflow
  convierte el problema de idempotencia en un problema de determinismo.

Consulta el contrato completo en
[Garantías de ejecución e idempotencia](./execution-guarantees.md) y el modelo
de recuperación para operadores en [Fallos y recuperación](../failures-and-recovery.md).
