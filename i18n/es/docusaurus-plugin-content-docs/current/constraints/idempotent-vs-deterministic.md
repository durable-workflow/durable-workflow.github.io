---
sidebar_position: 2
title: "Idempotencia y determinismo"
sidebar_label: Idempotente y determinista
description: En Durable Workflow 2.0, el determinismo permite reproducir la orquestación con seguridad y la idempotencia hace seguros los efectos de las actividades que se reintentan.
slug: /constraints/idempotent-vs-deterministic
canonical_path: /docs/constraints/idempotent-vs-deterministic/
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - idempotente y determinista
  - idempotencia y determinismo
  - determinista e idempotente
  - workflow determinista
  - actividad idempotente
---

# Workflows idempotentes y deterministas: ¿en qué se diferencian? {#idempotent-vs-deterministic-workflows-whats-the-difference}

**Un comportamiento determinista toma las mismas decisiones cuando recibe las mismas entradas y el mismo historial. Un comportamiento idempotente produce el mismo efecto previsto tanto si una operación se ejecuta una vez como si se ejecuta varias.** El determinismo hace predecible una ejecución. La idempotencia hace seguras las ejecuciones repetidas. Ninguna de estas propiedades implica la otra.

| Pregunta | Determinista | Idempotente |
| --- | --- | --- |
| ¿Qué permanece igual? | Las decisiones tomadas a partir de las mismas entradas y el mismo historial | El efecto externo previsto después de una o varias llamadas |
| ¿Por qué lo necesita Durable Workflow? | La reproducción debe reconstruir la misma ruta del workflow | Los reintentos y la reentrega no deben duplicar los efectos externos |
| ¿Dónde corresponde? | En el código de workflows y de orquestación | En las actividades y en los sistemas a los que llaman |
| ¿Prohíbe la entrada/salida o la aleatoriedad? | Sí, dentro del código de workflow que se reproduce, salvo que se registre el resultado | No. Una actividad puede usar entrada/salida, tiempo o aleatoriedad y aun así hacer seguro repetir su efecto |

## Las propiedades son independientes {#the-properties-are-independent}

### Determinista pero no idempotente {#deterministic-but-not-idempotent}

Considera una operación que incrementa un contador:

```text
increment(counter):
    counter.value = counter.value + 1
```

Con el mismo valor inicial del contador, esta operación siempre realiza el mismo cálculo, por lo que es determinista. No es idempotente: llamarla dos veces incrementa el contador dos veces, mientras que llamarla una sola vez lo incrementa una vez.

### Idempotente pero no determinista {#idempotent-but-not-deterministic}

Considera ahora una actividad que establece un estado conocido para un pedido, pero utiliza una espera aleatoria entre reintentos al contactar con el servicio:

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

Los tiempos y el número de intentos internos pueden variar, así que esta implementación no es determinista. La operación puede seguir siendo idempotente: después de una llamada exitosa o de varias, el pedido está archivado. La respuesta, la latencia y la ruta interna no tienen por qué ser idénticas. Lo que debe ser igual es el efecto externo previsto.

## Por qué el código de workflow debe ser determinista {#why-workflow-code-must-be-deterministic}

Durable Workflow reconstruye el estado de la orquestación reproduciendo el historial confirmado. Con las mismas entradas y el mismo historial, el código del workflow debe programar las mismas actividades, temporizadores y esperas en el mismo orden. Consultar el reloj del sistema, obtener un valor aleatorio, consultar una base de datos en tiempo real o recibir una respuesta de red dentro del cuerpo del workflow puede elegir una rama distinta durante la reproducción y hacer que las nuevas decisiones no coincidan con el historial.

Traslada esas operaciones a actividades o utiliza un helper de workflow que registre el valor en el historial. La reproducción devuelve entonces el resultado registrado de la actividad o del side effect en lugar de volver a realizar la operación externa. El determinismo no exige que cada invocación de una actividad produzca una respuesta universal e independiente del tiempo. Exige que la orquestación reproducida tome decisiones que coincidan con su historial registrado.

Consulta [Restricciones de los workflows](./workflow-constraints.md) para conocer las reglas de escritura y [Cómo funciona](../how-it-works.md) para conocer el modelo de reproducción.

Para reglas de Rust sobre `HashMap`, relojes, aleatoriedad y orden de futuros, consulte las [sustituciones duraderas](../polyglot/rust.md#rust-determinism-rules). Rust SDK 4.5.0 añade [pruebas de actividades/workflows sin Server y reproducción del historial registrado](../polyglot/rust.md#offline-testing-and-replay); conserve pruebas de integración para sus límites de ejecución documentados.

## Por qué las actividades y los efectos externos deben ser idempotentes {#why-activities-and-side-effects-must-be-idempotent}

Las actividades cruzan el límite duradero para acceder a bases de datos, API de pagos, proveedores de correo, almacenamiento de objetos y otros sistemas. Pueden volver a entregarse después de un tiempo de espera agotado, un reintento, un fallo del worker o una lease vencida. Un worker incluso puede completar el cambio externo y fallar antes de que Durable Workflow reciba su informe.

Diseña el efecto previsto de la actividad para que otro intento sea seguro:

- Envía una clave de idempotencia estable a la API remota.
- Usa upsert con un identificador duradero del negocio o de la ejecución.
- Escribe en un objeto o recurso con un nombre determinista.
- Usa una operación naturalmente idempotente, como establecer un valor o eliminar un recurso conocido.

Una clave de idempotencia no hace determinista el código de una actividad ni impide que se inicie otro intento. Permite al sistema externo reconocer que los intentos repetidos representan la misma operación lógica.

Consulta [Restricciones de las actividades](./activity-constraints.md), [Modelo de ejecución de actividades](../features/activity-execution-model.md) y [Garantías de ejecución e idempotencia](./execution-guarantees.md) para conocer los contratos de reintento, reentrega e historial duradero.

## El mismo límite en todos los SDK {#one-boundary-across-every-sdk}

El mismo diseño se aplica tanto si el worker está escrito en PHP como en Python o Rust:

1. Mantén la orquestación segura para la reproducción: con las mismas entradas y el mismo historial, emite los mismos comandos duraderos.
2. Sitúa las llamadas de red, los relojes, la aleatoriedad y el estado externo mutable detrás del límite de una actividad.
3. Asigna a cada actividad con efectos externos una identidad estable que el sistema de destino pueda deduplicar.

La sintaxis del lenguaje cambia. El límite entre determinismo e idempotencia se mantiene.
