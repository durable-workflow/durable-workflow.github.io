---
sidebar_position: 2
title: Índice de capacidades de 2.0
description: Índice de SDK en modo servicio, runtime integrado, protocolos y capacidades de Durable Workflow 2.0.
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - capacidades de Durable Workflow 2.0
  - SDK PHP Python Rust
  - matriz de funcionalidades del motor de workflows
  - versiones mínimas exactas de funcionalidades
---

# Índice de capacidades de Durable Workflow 2.0 {#durable-workflow-20-capability-index}

Este es el índice de capacidades de la línea estable Durable Workflow 2.0.

## Canal instalable admitido {#supported-installable-channel}

Las identidades exactas de los artefactos corresponden a los registros de
paquetes y a los metadatos de publicación, no a este resumen de capacidades.

| Interfaz | Canal admitido | Función en este índice |
| --- | --- | --- |
| CLI | 2.0 estable | Cliente de operador y diagnóstico con salida legible por máquina. |
| SDK de PHP | 2.0 estable | Cliente oficial `durable-workflow/sdk` en modo servicio y worker remoto de workflows y actividades para el runtime de un namespace de Cloud o un Server autogestionado. |
| Motor Laravel integrado | 2.0 estable | Modo de despliegue separado dentro de la aplicación mediante `durable-workflow/workflow`, con su propio runtime de autoría, motor de persistencia, colas y reproducción. |
| SDK de Python | 2.0 estable | SDK oficial determinista de workflows y actividades en modo servicio, más cliente operativo y del plano de control para el runtime de un namespace de Cloud o un Server autogestionado. Requiere Python 3.10 o posterior. |
| SDK de Rust | 2.0 estable | SDK oficial determinista de workflows y actividades en modo servicio, servicio de workers y cliente del plano de control para el runtime de un namespace de Cloud o un Server autogestionado. Requiere Rust 1.86 o posterior. |
| Server | 2.0 estable | Runtime autogestionado, implementado en PHP e independiente del lenguaje, para los protocolos v2 del plano de control y de workers. |
| Waterline | 2.0 estable | Cloud incluye Managed Waterline. Los operadores autogestionados despliegan por separado la imagen del servicio contra un namespace de Server. Laravel integrado instala el paquete Composer y lee en el mismo proceso el estado que pertenece a la aplicación. |

PHP, Python y Rust son los tres lenguajes con SDK oficiales en modo servicio.
Todos pueden dirigirse al runtime de un namespace provisionado de Durable
Workflow Cloud o a un Server autogestionado cuyo descubrimiento anuncie la
capacidad publicada. Comparten nombres de tipo estables de cadena, un modelo
de comandos e historial duradero, versión `2` del plano de control, versión
mayor `1` del protocolo de workers y el sobre público de cargas útiles. Rust
es un SDK de workflows: ejecuta código determinista de workflow, actividades y
servicios de workers, además de llamadas de protocolo de bajo nivel. Python
combina la autoría de workflows con interfaces de cliente para namespaces,
programaciones, workers, colas, historial, reparación y otras operaciones.

Laravel integrado sigue siendo un modo de despliegue PHP separado dentro de
la aplicación. No es necesario para los clientes ni los workers PHP en modo
servicio. El SDK de PHP independiente del framework se versiona por separado
del motor Laravel integrado.

Usa [Modos de despliegue](/docs/polyglot/deployment-modes/) para elegir el
límite de responsabilidades y continúa con
[Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/) o con
[Server autogestionado](/docs/polyglot/server/). La evidencia de capacidades que
sigue solo se aplica si el runtime elegido anuncia el contrato necesario.

El SDK de PHP 2.3.2, el SDK de Python 2.5.7 y el SDK de Rust 3.5.0 usan por
defecto el protocolo de workers `1.20`. Los workers predeterminados necesitan
un Server que anuncie `1.20` o posterior dentro de la versión mayor `1`. Cada
SDK también permite seleccionar explícitamente `1.19` para un Server anterior
compatible. La cancelación cooperativa requiere `1.20` y habilitar explícitamente
su capacidad. El descubrimiento del runtime y los metadatos publicados del SDK
elegido determinan la compatibilidad. Consulta
[Compatibilidad de versiones](/docs/compatibility/) y
[Protocolo de workers](/docs/polyglot/worker-protocol/).

## Capacidades y versiones mínimas de SDK {#capability-and-sdk-floors}

«Modo servicio» significa que Cloud o un Server autogestionado opera el runtime
remoto. «Integrado» significa que una aplicación Laravel opera el runtime en su
propio proceso. La columna de SDK registra las diferencias deliberadamente.
Una entrada vacía o un SDK limitado no implica paridad.

| Capacidad | Contrato actual de 2.0 y versión mínima oficial | Evidencia explícita de 2.0 |
| --- | --- | --- |
| Workflows | Los workers remotos PHP, Python y Rust permiten escribir workflows deterministas. La autoría en Laravel integrado usa el paquete Workflow. | [Autoría de workflows](/docs/defining-workflows/workflows/), [SDK de PHP](/docs/polyglot/php/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/) |
| Actividades y servicios | El motor integrado y los tres SDK en modo servicio permiten escribir actividades. Los workflows y actividades Rust se ejecutan en servicios de workers oficiales. Python y PHP también ofrecen clientes oficiales de control y servicio. | [Actividades](/docs/defining-workflows/activities/), [SDK de PHP](/docs/polyglot/php/), [Ejecución de actividades](/docs/features/activity-execution-model/), [Ejecución externa](/docs/polyglot/external-execution/) |
| Llamadas de servicio entre espacios de nombres | PHP integrado, PHP SDK y Python SDK crean operaciones de servicio duraderas registradas con espera de finalización o solo admisión y resultados registrados. El espacio de destino en PHP servicio usa actualmente la opción de array `namespace`. Las llamadas de autoría Rust no están disponibles hasta [sdk-rust #86](https://github.com/durable-workflow/sdk-rust/issues/86). | [Autoría integrada](/docs/features/service-operations/), [Catálogo compartido y soporte de SDK](/docs/polyglot/service-operations/) |
| Señales | Las interfaces de workflow de PHP, Python y Rust ofrecen modificaciones duraderas y asíncronas en sus versiones mínimas actuales. | [Señales](/docs/features/signals/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/) |
| Consultas | Se admiten consultas de solo lectura mediante reproducción. PHP, Python y Rust ofrecen manejadores y clientes de consultas. Las tareas de consulta reproducidas de Rust requieren el protocolo de workers `1.8` o posterior. | [Consultas](/docs/features/queries/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/) |
| Actualizaciones | PHP, Python y Rust ofrecen interfaces de cliente y manejadores de worker para actualizaciones. Los validadores declarados de Python utilizan validación síncrona previa a la aceptación cuando el descubrimiento de Server anuncia ese contrato exacto: la aceptación sigue a la aprobación, mientras que el rechazo, la pérdida del worker, el tiempo de espera agotado y una finalización sin autoridad válida fallan explícitamente. PHP y Rust no ofrecen autoría de validadores y no declaran ninguno. | [Actualizaciones](/docs/features/updates/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/#workflow-updates) |
| Temporizadores | Los temporizadores duraderos respaldados por el runtime del servicio se reproducen en PHP, Python y Rust. | [Temporizadores](/docs/features/timers/), [SDK de Rust](/docs/polyglot/rust/) |
| Reintentos | La política duradera de reintentos de actividades se registra con el comando. PHP, Python y Rust ofrecen opciones de reintento de actividades en sus versiones mínimas actuales. | [Fallos y recuperación](/docs/failures-and-recovery/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/) |
| Tiempos de espera | Los runtimes en modo servicio de Cloud y Server autogestionado aplican las familias de tiempos de espera de actividades y workflows. Rust incluye opciones de actividad y plazos de ejecución y de inicio de ejecución de workflows. | [Tiempos de espera](/docs/features/timeouts/), [SDK de Rust](/docs/polyglot/rust/) |
| Workflows hijos | PHP, Python y Rust inician y esperan hijos duraderos. La identidad de tipo entre lenguajes es una cadena estable y las cargas útiles de los hijos usan el sobre compartido. | [Workflows hijos](/docs/features/child-workflows/), [SDK de Python](/docs/polyglot/python/) |
| Composición paralela determinista | `all()`/`parallel()` de PHP, list-yield anidado de Python y `WorkflowContext::parallel()`/`join()` de Rust programan grupos de actividades, workflows hijos, temporizadores, grupos mixtos y anidados mediante comandos ordinarios. Los tres publican metadatos compartidos de identidad y ruta del grupo, y restauran los resultados en el orden de las entradas anidadas. | [Concurrencia](/docs/features/concurrency/), [SDK de Python](/docs/polyglot/python/#fan-out), [SDK de Rust](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">Selección duradera de la primera finalización</span> | PHP integrado y los SDK de servicio de PHP, Python y Rust inician miembros independientes de actividad, workflow hijo, temporizador, espera de entrada externa y grupos anidados. Se persiste un ganador con identidad estable de miembro. Los demás continúan y conservan handles para esperar o cancelar. | [Concurrencia](/docs/features/concurrency/#first-completion-selection), [SDK de Python](/docs/polyglot/python/#first-completion-selection), [SDK de Rust](/docs/polyglot/rust/#durable-first-completion-selection) |
| Compensación de sagas | Los helpers Saga de PHP, `WorkflowContext.saga()` de Python y `WorkflowContext::saga()` de Rust registran compensaciones duraderas después del éxito de la operación hacia delante y las ejecutan secuencialmente en orden inverso por defecto. Python y Rust se detienen en el primer fallo de compensación y conservan tanto el fallo inicial como el de compensación. PHP también ofrece políticas opcionales de ejecución paralela y continuación tras errores. | [Sagas](/docs/features/sagas/), [SDK de Python](/docs/polyglot/python/#saga-compensation), [SDK de Rust](/docs/polyglot/rust/#saga-compensation) |
| Cancelación | Laravel integrado y PHP, Python y Rust en modo servicio admiten solicitudes cooperativas de cancelación con una identidad raíz, un plazo inmutable y limpieza acotada en workers que las habilitan explícitamente. La cancelación terminal inmediata sigue disponible con seguridad sobre la ejecución seleccionada y resultados con tipos definidos. | [Cancelar y terminar](/docs/features/cancel-and-terminate/), [Cancelación en modo servicio](/docs/polyglot/cancellation/), [SDK de Rust](/docs/polyglot/rust/) |
| Terminación | Terminar cierra una ejecución inmediatamente con un resultado terminal propio. Está disponible mediante los runtimes de servicio de Cloud y Server autogestionado y las interfaces de control de CLI, PHP, Python y Rust. | [Cancelar y terminar](/docs/features/cancel-and-terminate/), [API de Server](/docs/polyglot/server-api-reference/) |
| Side effects | PHP, Python y Rust registran valores no deterministas exactamente una vez y decodifican el valor registrado durante la reproducción. | [Side effects](/docs/features/side-effects/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/) |
| Workflow Streams | PHP, Python y Rust ofrecen operaciones tipadas para listar, describir, suscribirse o reanudar por posición, añadir, cerrar y marcar errores en flujos de salida asociados a una ejecución y gestionados por Server. Los tres permiten emitir de forma segura para la reproducción a partir de una identidad de comando duradera. Python resuelve cargas útiles externas con su controlador de almacenamiento configurado. PHP y Rust conservan referencias opacas. | [Workflow Streams](/docs/polyglot/workflow-streams/), [Matriz exacta de SDK](/workflow-stream-capabilities.json), [Escenarios de runtime](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| Marcadores de versión | PHP, Python y Rust ofrecen marcadores duraderos de versión para evolucionar el código de forma compatible. | [Versionado](/docs/features/versioning/), [SDK de Python](/docs/polyglot/python/), [SDK de Rust](/docs/polyglot/rust/) |
| Reproducción determinista | Los workers de workflow de PHP, Python y Rust reconstruyen decisiones a partir del historial duradero e informan del no determinismo con tipos definidos, sin volver a ejecutar trabajo externo. | [Garantías de ejecución](/docs/constraints/execution-guarantees/), [Conformidad de la plataforma](/docs/platform-conformance/), [SDK de Rust](/docs/polyglot/rust/) |
| Programaciones | Los runtimes de servicio de Cloud y Server autogestionado gestionan programaciones duraderas. PHP, Python y CLI ofrecen operaciones de programación. Rust no ofrece una API de gestión de programaciones. | [Programaciones](/docs/features/schedules/), [Referencia del CLI](/docs/polyglot/cli-reference/), [SDK de Python](/docs/polyglot/python/) |
| Namespaces | Los runtimes en modo servicio están limitados por namespace. Los clientes PHP/Python y el CLI gestionan namespaces cuando el runtime elegido expone esa operación. Los workers y clientes Rust se dirigen a un namespace, pero no ofrecen administración de namespaces en la versión mínima actual. | [Namespaces, autenticación y workers](/docs/polyglot/namespace-auth-workers/), [API de Server](/docs/polyglot/server-api-reference/) |
| Atributos de búsqueda | Los runtimes de servicio de Cloud y Server autogestionado indexan atributos de búsqueda tipados. PHP y Python ofrecen interfaces de autoría y control. El CLI y las API de operador ofrecen descubrimiento y filtrado estructurados. | [Atributos de búsqueda](/docs/features/search-attributes/), [SDK de Python](/docs/polyglot/python/) |
| Compatibilidad de workers | Los SDK registran runtime, versión del SDK, ID de compilación, tipos admitidos, versión del protocolo y capacidad. El servidor publica las versiones aceptadas y los hechos de enrutamiento. | [Compatibilidad](/docs/compatibility/), [Compatibilidad y enrutamiento de workers](/docs/polyglot/worker-compatibility-routing/) |
| Actividades locales | Disponibles en Laravel integrado, los SDK de servicio PHP y Python y el SDK de Rust 3.1.0, con habilitación explícita del worker. | [Ejecución de actividades integradas](/docs/features/activity-execution-model/), [Matriz de compatibilidad en modo servicio](/docs/polyglot/portable-worker-affinity/) |
| Sesiones de workers | Disponibles en Laravel integrado, los SDK de servicio PHP y Python y el SDK de Rust 3.2.0, con habilitación explícita del worker. | [Sesiones de workers](/docs/features/worker-sessions/), [Matriz de compatibilidad en modo servicio](/docs/polyglot/portable-worker-affinity/) |
| Ejecución sticky | Disponible en Laravel integrado y en el SDK de servicio PHP. Python y Rust también ofrecen cachés de historial opcionales y acotadas que deben habilitarse explícitamente en el worker. Todos los workers deben seguir reproduciendo correctamente desde cero. | [Ejecución sticky](/docs/features/sticky-execution/), [Matriz de compatibilidad en modo servicio](/docs/polyglot/portable-worker-affinity/) |
| Interoperabilidad de códecs | PHP, Python y Rust usan el sobre público `codec` + `blob` y un único esquema recursivo fijo Avro Value. Las ramas con nombre preservan enteros frente a doubles, texto frente a bytes, booleanos frente a enteros y listas frente a mapas. | [Protocolo Avro Value](/docs/polyglot/avro-value-protocol/), [Protocolo de workers](/docs/polyglot/worker-protocol/), [SDK de Rust](/docs/polyglot/rust/) |
| Diagnósticos | Los runtimes de servicio y el CLI publican en JSON hechos sobre versión, protocolo, workers, colas de tareas, reproducción, historial, fallos con tipos definidos y reparación. Managed Waterline, un servicio autogestionado desplegado por separado o el paquete integrado presentan evidencia del runtime correspondiente. | [Monitorización](/docs/monitoring/), [Referencia del CLI](/docs/polyglot/cli-reference/), [API de operador de Waterline](/docs/waterline-operator-api/) |
| Herramientas de agentes | El ciclo Descubrir -> Cambiar -> Ejecutar -> Diagnosticar -> Reparar está disponible mediante manifiestos públicos, esquemas, operaciones HTTP, JSON del CLI, clientes SDK, historial y diagnósticos con tipos definidos y modificaciones seguras. MCP es una interfaz opcional, no la definición del contrato. | [Contrato de herramientas para agentes](/docs/agent-tooling-contract/), [Ciclo operativo de agentes](/docs/agent-operating-loop/) |

## Límite de interoperabilidad de cargas útiles {#payload-interoperability-boundary}

Las llamadas a workflows y actividades entre lenguajes no pasan objetos PHP
serializados, pickles de Python ni tipos de implementación Rust. Pasan nombres
de tipo de cadena registrados y un sobre público de cargas útiles. Con `avro`,
cada SDK oficial utiliza la implementación oficial de su lenguaje y el mismo
esquema fijo Value. Los mapas, listas, cadenas, bytes, enteros, doubles,
booleanos y nulos decodificados conservan su tipo primitivo. Las clases
específicas de un lenguaje solo se reconstruyen dentro de su propio SDK.

Este contrato se aplica a entradas y resultados de workflow, workflows hijos,
entradas y resultados de actividad, señales, consultas, actualizaciones y
ejecución externa. Los despliegues deben verificar los códecs anunciados por
`GET /api/cluster/info` antes de admitir un worker.

## Alcance de publicación y madurez {#release-and-maturity-boundary}

Los contratos de plataforma de este índice constituyen la interfaz del producto
estable 2.0. Usa el [evaluador para agentes de IA](/docs/ai-agent-workflow-engine/)
para decidir de forma concisa si se ajusta a tus necesidades.
