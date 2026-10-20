---
sidebar_position: 4
description: Qué puede hacer el código de un workflow y de una actividad.
---

# Resumen de restricciones {#constraints-summary}

| Restricción | Código del workflow | Código de la actividad |
| --- | --- | --- |
| Entrada/salida | No permitida | Permitida |
| Variables globales mutables | No permitidas | Permitidas |
| Funciones no deterministas | No permitidas | Permitidas |
| `Carbon::now()` | No permitido | Permitido |
| `sleep()` | No permitido | Permitido |
| Efectos externos | Trasládalos a actividades | Permitidos solo si es seguro repetirlos |

El código de un workflow debe ser determinista porque el motor reconstruye su estado reproduciendo el historial de pasos duraderos. Vuelve a invocar el cuerpo del workflow, no las actividades. Si el cuerpo toma decisiones distintas durante la reproducción, el motor no puede reconstruir el estado del workflow ni continuar su ejecución correctamente. El cuerpo del workflow no necesita ser idempotente. El determinismo es el requisito para reproducir el historial.

Las actividades deben ser idempotentes porque se ejecutan al menos una vez. Los reintentos, el vencimiento de leases y la reentrega pueden hacer que el mismo intento se observe más de una vez. Esto forma parte del comportamiento previsto, no es un error. Hacer que el cuerpo de la actividad o su destino externo sea seguro al repetirse, mediante una clave de idempotencia, un recurso de destino determinista o una operación naturalmente idempotente, evita que la ejecución duplicada produzca efectos externos duplicados.

Consulta [Workflows idempotentes y deterministas](/docs/constraints/idempotent-vs-deterministic/)
para ver una comparación directa y ejemplos que distinguen las dos propiedades.

Consulta [Garantías de ejecución e idempotencia](./execution-guarantees.md) para
conocer el contrato público de v2 que define estos términos.
