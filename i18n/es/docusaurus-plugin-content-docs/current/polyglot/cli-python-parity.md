---
title: Capacidades de clientes y workers
description: Compara las capacidades de cliente y worker de la CLI y de los SDK de PHP, Python y Rust.
---

# Capacidades de clientes y workers {#client-and-worker-capabilities}

Elige una interfaz según lo que necesite hacer el proceso. La CLI `dw` y los
SDK oficiales de PHP, Python y Rust comparten los contratos v2 del plano de
control y de workers, pero sus funciones de operador, cliente y worker difieren.

Esta guía de todos los clientes conserva la ruta original
`/docs/polyglot/cli-python-parity/` para mantener los enlaces existentes.

## Comparación de capacidades {#capability-comparison}

| Capacidad | CLI `dw` | SDK de PHP | SDK de Python | SDK de Rust |
| --- | --- | --- | --- | --- |
| Ciclo de vida del workflow | **Compatible:** comandos de operador para iniciar, listar, inspeccionar, esperar, cancelar, terminar y archivar. [Comandos](./cli-reference.md#workflow-commands) | **Compatible:** iniciar, describir, listar, esperar resultados, cancelar y terminar mediante `Client` y `WorkflowHandle`. [Evidencia del ciclo de vida](./php.md#lifecycle-updates-schedules-and-visibility) | **Compatible:** iniciar, listar/describir, esperar resultados, cancelar y terminar mediante el cliente asíncrono. [Operaciones de workflow](./python.md#workflow-operations) | **Compatible:** iniciar, describir, esperar resultados, cancelar y terminar mediante `Client` y `WorkflowHandle`. [Operaciones terminales](./rust.md#cancel-terminate-and-handle-terminal-outcomes) |
| Señales | **Compatible:** enviar por ID de workflow o ejecución seleccionada. [Comandos](./cli-reference.md#workflow-commands) | **Compatible:** métodos de envío del cliente y del handle, más historial de señales del worker. [API de PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Compatible:** el cliente asíncrono envía señales y los workers de workflow las procesan. [Mensajes](./python.md#signals-queries-and-updates) | **Compatible:** envío mediante cliente y handle, más procesamiento de señales en workers. [API de Rust](https://rust.durable-workflow.com/) |
| Consultas | **Compatible:** ejecutar una consulta con nombre de solo lectura con salida estructurada. [Comandos](./cli-reference.md#workflow-commands) | **Compatible:** consultas mediante cliente y handle, más manejadores de consulta registrados en workers. [API de PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Compatible:** consultas del cliente asíncrono y manejadores de consulta del worker mediante reproducción. [Mensajes](./python.md#signals-queries-and-updates) | **Compatible:** consultas del cliente y manejadores de consulta del worker mediante reproducción cuando el descubrimiento anuncia tareas de consulta. [API de Rust](https://rust.durable-workflow.com/) |
| Actualizaciones | **Compatible:** enviar y esperar resultados aceptados o completados. [Comandos](./cli-reference.md#workflow-commands) | **Compatible:** `updateWorkflow` y `registerUpdate`; el SDK de PHP no permite definir validadores y no declara ninguno. [API de PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Compatible:** clientes, manejadores de workflow y validadores síncronos declarados cuando el descubrimiento anuncia el contrato previo a la aceptación. Los workers con validadores rechazan runtimes incompatibles. [Mensajes](./python.md#signals-queries-and-updates) | **Compatible:** interfaces de cliente, handle, cargas útiles Avro y actualizaciones registradas en workers; el SDK de Rust no permite definir validadores y no declara ninguno. [Actualizaciones](./rust.md#workflow-updates) |
| Programaciones | **Compatible:** ciclo de vida completo de programaciones, ejecución retroactiva e historial de auditoría. [Comandos](./cli-reference.md#schedule-commands) | **Compatible:** ciclo de vida completo y listado de programaciones mediante `Client`. [API de PHP](./php.md#lifecycle-updates-schedules-and-visibility) | **Compatible:** ciclo de vida asíncrono completo de programaciones y paginación del historial de auditoría. [Programaciones](./python.md#schedules) | **No compatible:** el SDK actual de Rust no ofrece una API de gestión de programaciones. Utiliza la CLI, PHP, Python o la API del servidor. |
| Visibilidad | **Compatible:** búsqueda de workflows/ejecuciones, workers, colas de tareas, historial y JSON de diagnóstico. [Comandos](./cli-reference.md#workflow-commands) | **Compatible:** filtrado/paginación de workflows, historial, espacios de nombres, workers y colas de tareas. [Evidencia de visibilidad](./php.md#lifecycle-updates-schedules-and-visibility) | **Compatible:** interfaces de cliente para workflows, programaciones, espacios de nombres, workers, colas, historial y atributos de búsqueda. [API del cliente](./python.md#client-api-reference) | **Diferente:** admite descripción/resultado de la ejecución seleccionada; no ofrece listado/búsqueda de toda la flota ni administración de espacios de nombres. [Cliente de Rust](./rust.md#package-and-source) |
| Ejecución de workers | **Diferencia deliberada:** los comandos de protocolo de workers de bajo nivel sirven para diagnóstico y conformidad; `dw` no es un runtime de workers de aplicación. [Comandos de workers](./cli-reference.md#worker-protocol-commands) | **Compatible:** manejadores remotos de workflows, actividades, consultas y actualizaciones mediante `durable-workflow/sdk`. [Worker de PHP](./php.md#run-a-remote-php-worker) | **Compatible:** workers deterministas de workflows y actividades. [Worker de Python](./python.md#worker) | **Compatible:** manejadores nativos de workflows, actividades, consultas y actualizaciones. [API de workers de Rust](https://rust.durable-workflow.com/) |

**Compatible** significa que la interfaz de la versión actual indicada ofrece
la capacidad. **Diferente** identifica un límite de alcance deliberado.
**No compatible** es una carencia actual explícita, no una promesa implícita.
El descubrimiento del protocolo del runtime sigue siendo la autoridad cuando
una capacidad depende de un protocolo de workers negociado.

## Evidencia por interfaz de producto {#evidence-by-product-surface}

### CLI {#cli}

La [introducción a la CLI](./cli.mdx) define la instalación, los perfiles, la
salida estructurada y los códigos de salida. La [referencia de comandos](./cli-reference.md)
contiene la interfaz completa del operador: ciclo de vida, mensajes,
programaciones, visibilidad y comandos de protocolo de workers de bajo nivel,
que deliberadamente no constituyen un bucle de worker de SDK.

### SDK de PHP {#php-sdk}

El SDK fijado de PHP ofrece API de cliente y de workers remotos independientes
del framework. Su interfaz pública actual incluye el ciclo de vida del workflow,
handles de resultados, señales, consultas, actualizaciones, programaciones,
filtrado/historial de workflows, visibilidad de espacios de nombres, workers y
colas de tareas, además de manejadores registrados de workflows, actividades,
consultas y actualizaciones. Consulta la [guía del SDK de PHP](./php.md) y la
[referencia generada de la API de PHP](https://php.durable-workflow.com/api/).

### SDK de Python {#python-sdk}

El SDK de Python combina un cliente asíncrono del plano de control con workers
deterministas de workflows y actividades. Su guía documenta las
[operaciones del cliente](./python.md#client-api-reference), los
[manejadores de mensajes](./python.md#signals-queries-and-updates), la
[ejecución de workers](./python.md#worker) y la
[gestión de programaciones](./python.md#schedules). La
[referencia generada de la API de Python](https://python.durable-workflow.com/)
contiene las firmas y los tipos de resultado exactos.

### SDK de Rust {#rust-sdk}

El SDK publicado de Rust ofrece el plano de control y el ciclo de vida de la
ejecución seleccionada, señales, consultas mediante reproducción,
actualizaciones y workers nativos de workflows/actividades. Las actualizaciones
incluyen `Client::update_workflow`, `WorkflowHandle::update`,
`Worker::register_update` y sus variantes con valores Avro. La gestión de
programaciones y el listado/búsqueda de toda la flota siguen siendo carencias
explícitas. Consulta la [guía del SDK de Rust](./rust.md) y la
[referencia generada de la API de Rust](https://rust.durable-workflow.com/).

## Evidencia del contrato compartido {#shared-contract-evidence}

Los cuatro productos utilizan el mismo plano de control HTTP+JSON versionado y
el mismo sobre público de cargas útiles. La evidencia se divide según lo que demuestra:

- el [índice de capacidades](/docs/capabilities/) registra las versiones mínimas
  exactas de los artefactos y el alcance actual;
- la [suite de conformidad de la plataforma](/docs/platform-conformance/)
  registra escenarios de runtime entre clientes y workers;
- los repositorios de CLI y Python conservan fixtures compartidos de solicitudes
  para operaciones cuyos cuerpos semánticos se comparan hoy byte a byte;
- las referencias públicas de las API de PHP y Rust y sus pruebas de publicación
  acreditan los métodos adicionales admitidos que se enumeran arriba.

Que exista un fixture compartido en dos repositorios no implica que los demás
SDK carezcan de la operación. A su vez, compartir un endpoint no implica que
todos los productos expongan la misma función de operador o worker.

## Añadir o ampliar una interfaz de cliente {#adding-or-extending-a-client-surface}

Al añadir una operación a la CLI o a un SDK:

1. Mantén independientes del lenguaje las rutas, los métodos, los campos
   semánticos, los sobres de cargas útiles y los resultados de error.
2. Añade evidencia de solicitudes y de runtime para cada cliente o worker participante.
3. Documenta las diferencias deliberadas de sintaxis o de funciones.
4. Indica explícitamente los productos no compatibles.
5. Trata la serialización, las rutas de archivo, los nombres de clase o las
   estructuras de error específicas de un lenguaje como defectos del contrato público.
