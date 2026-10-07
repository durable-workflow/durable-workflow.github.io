---
sidebar_position: 1
---

# Resumen {#overview}

Los workflows y las actividades tienen restricciones distintas. El código de
un workflow se **reproduce a partir del historial**. El código de una actividad
puede **volver a intentarse**. Las reglas dependen de estas dos formas de
ejecución.

Empieza por [Workflows idempotentes y deterministas](/docs/constraints/idempotent-vs-deterministic/)
para ver una comparación con ejemplos que muestran por qué una propiedad no
implica la otra.

- **El código del workflow debe ser determinista.** Cada vez que el workflow
  continúa, el motor reproduce su historial para reconstruir el estado. Esto
  ocurre también al cambiar de worker, después de un reinicio o despliegue, y
  durante ejecuciones largas. La reproducción vuelve a ejecutar el cuerpo del
  workflow y reutiliza los resultados registrados de las actividades. Ante el
  mismo historial, el workflow debe tomar las mismas decisiones en el mismo
  orden. Su cuerpo no puede consultar el reloj del sistema ni una caché que
  pueda cambiar, generar números aleatorios o hacer llamadas de red. Usa
  [`Workflow::now()`](../defining-workflows/workflow-api.md),
  [`sideEffect(...)`](../features/side-effects.md), actividades y otros helpers
  para obtener valores que deban quedar registrados de forma duradera.

- **El código de las actividades debe ser idempotente.** Los intentos de una
  actividad se ejecutan **al menos una vez**. Los reintentos, el vencimiento de
  un lease y la entrega repetida pueden hacer que el mismo trabajo lógico se
  ejecute más de una vez. El framework registra como máximo un resultado
  terminal por intento en el estado duradero, pero el cuerpo de una actividad
  puede empezar a ejecutarse varias veces antes de que el motor reciba el
  informe que prevalece. Diseña las actividades para admitir esta repetición.
  Usa una clave de idempotencia, un recurso de destino determinista o una
  operación naturalmente idempotente cuando el efecto externo no deba duplicarse.

- **Event sourcing conserva el historial de los pasos duraderos.** El motor
  registra cada paso como un evento con un tipo definido, por ejemplo la
  finalización de una actividad, el disparo de un timer, la recepción de una
  signal o el valor de un side effect. Al reproducir el historial, devuelve los
  resultados registrados al cuerpo del workflow sin volver a enviar esas
  actividades, timers o signals. Cada evento de estado duradero asociado a un
  identificador se registra exactamente una vez en el historial, aunque el
  transporte haya entregado el trabajo más de una vez.

El determinismo y la idempotencia permiten continuar workflows a través de
despliegues, reinicios de workers y reintentos distribuidos. El motor conserva
la posición de la ejecución, y la aplicación evita duplicar los efectos
externos que ha diseñado para poder repetirse de forma segura.

Consulta [Garantías de ejecución e idempotencia](./execution-guarantees.md)
para conocer el contrato público de v2 sobre reproducción, entregas repetidas,
vencimiento de leases e historial duradero con eventos registrados exactamente
una vez. Después, lee [Restricciones de los workflows](./workflow-constraints.md)
para escribir código determinista y [Restricciones de las actividades](./activity-constraints.md)
para hacer seguras las ejecuciones que pueden repetirse.
