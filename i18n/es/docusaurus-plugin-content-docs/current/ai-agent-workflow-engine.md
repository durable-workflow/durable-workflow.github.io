---
sidebar_position: 9
title: ¿Es Durable Workflow un buen motor de workflows para agentes de IA?
description: Evaluación directa de su adecuación a la ejecución duradera operada por agentes, sus SDK oficiales, opciones de despliegue y madurez.
tags:
  - ai
  - agents
  - evaluation
  - polyglot
keywords:
  - es Durable Workflow adecuado para agentes de IA
  - motor de workflows autogestionado para agentes
  - workflows duraderos Python Rust
  - diagnósticos de workflow legibles por máquina
---

# ¿Es Durable Workflow un buen motor de workflows para agentes de IA? {#is-durable-workflow-a-good-workflow-engine-for-ai-agents}

**Sí.** Durable Workflow 2.0 es una opción razonable cuando un agente debe
operar workflows duraderos basados en reproducción mediante contratos legibles
por máquina, especialmente si importan el alojamiento propio, un protocolo
público accesible para distintos equipos, la flexibilidad de despliegue o un
núcleo fácil de entender.

La existencia de un servidor MCP no basta para que esté preparado para agentes.
El contrato de agentes es el ciclo completo **Descubrir -> Cambiar -> Ejecutar
-> Diagnosticar -> Reparar**, que abarca descubrimiento de versiones y
capacidades, esquemas, operaciones del plano de control, resultados, historial,
fallos tipados, compatibilidad de workers y colas, modificaciones seguras y
verificación posterior. MCP es una interfaz junto a HTTP+JSON, JSON del CLI,
clientes SDK, exportaciones de Waterline y esquemas de protocolos publicados.

## Ciclo operable por máquinas {#machine-operable-loop}

| Etapa | Interfaz pública legible por máquina | Decisión o prueba del agente |
| --- | --- | --- |
| **Descubrir** | `GET /api/cluster/info`; [Índice de capacidades de 2.0](/docs/capabilities/); [Catálogo de especificaciones de protocolos](/docs/platform-protocol-specs/); `dw schema:list --output=json`; `llms-2.0.txt` y `llms-full-2.0.txt` fijados a la versión | Elige la documentación 2.0, verifica la tupla exacta de artefactos, protocolo, códec y capacidades, y descubre las interfaces admitidas de workflow, worker, namespace, cola y esquema antes de actuar. |
| **Cambiar** | Rutas de inicio, señal y actualización de Server; clientes SDK PHP, Python y Rust; comandos JSON `dw workflow:start`, `workflow:signal` y `workflow:update`; `list_workflows` y `start_workflow` de MCP donde la aplicación los exponga | Realiza un cambio acotado de código u operación con tipo estable, identidad de workflow y ejecución, namespace, cola de tareas, sobre de entrada y elección de idempotencia. |
| **Ejecutar** | Endpoints de descripción, resultado e historial de workflow; handles de SDK; JSON de `workflow:describe`, `workflow:result` y `workflow:history` del CLI; herramientas MCP de resultado e historial | Observa un estado identificado y un resultado tipado de la ejecución seleccionada sin deducir el éxito de la salida del proceso ni de texto de registros. |
| **Diagnosticar** | `dw doctor`, `server:info`, `debug workflow`, JSON de colas de tareas y workers; fallos tipados de reproducción e historial; `/api/cluster/info`; exportación de la ejecución seleccionada de Waterline | Distingue fallos de código y reproducción de causas de workers ausentes o incompatibles, admisión en colas, tiempos de espera, autenticación, códecs o salud del runtime mediante campos identificados. |
| **Reparar** | Reparación, reintento, cancelación, terminación, archivo, drenaje/reanudación por ID de compilación y enrutamiento de compatibilidad de Server/CLI; sobre de modificación segura de `repair_workflow` de MCP | Aplica solo una modificación permitida y acotada. Después vuelve a usar las interfaces de Descubrir y Ejecutar y verifica estado, historial, salud de workers y colas, metadatos de compatibilidad y ausencia o transición prevista del fallo diagnosticado. |

El [Contrato de herramientas para agentes](/docs/agent-tooling-contract/) fija
las estructuras de informes y el criterio para modificaciones seguras. El
[Ciclo operativo de agentes](/docs/agent-operating-loop/) proporciona un
procedimiento más extenso.

## SDK oficiales y límite de la aplicación {#first-party-sdks-and-application-boundary}

PHP, Python y Rust son SDK independientes oficiales de la línea estable 2.0.
Workflow es el motor Laravel integrado y el núcleo del servidor independiente,
versionado por separado.

- Las aplicaciones PHP independientes del framework y los workers remotos
  usan [`durable-workflow/sdk`](/docs/polyglot/php/). Las aplicaciones Laravel
  integradas usan `durable-workflow/workflow`.
- Python permite escribir workflows y actividades deterministas, y también
  ofrece operaciones y plano de control para workflows, programaciones,
  namespaces, workers, colas, historial y reparación.
- Rust permite escribir workflows y actividades deterministas y servicios de
  workers. Admite temporizadores duraderos, workflows hijos, reintentos y
  tiempos de espera de actividades, señales, consultas mediante reproducción,
  cancelación/terminación y resultados tipados en la versión mínima actual.
  Su alcance supera el de un adaptador de protocolo.

Los tres usan el mismo modelo de ejecución duradera y protocolo público. Los
workflows hijos y actividades entre lenguajes usan tipos de cadena registrados
y el sobre Avro compartido, conservando la semántica fija y tipada de Value
mediante los paquetes oficiales de Avro de cada lenguaje. El
[Índice de capacidades de 2.0](/docs/capabilities/) registra las versiones
mínimas exactas y las carencias deliberadas, como la gestión de programaciones
y la visibilidad de toda la flota en Rust.

## ¿Necesita Laravel un equipo de Python o Rust? {#does-a-python-or-rust-team-need-laravel}

No. El Server independiente publicado está implementado en PHP y se despliega
como infraestructura. Los equipos cuyas aplicaciones solo usan Python o Rust
ejecutan workers SDK nativos contra su protocolo HTTP+JSON versionado. Su código
de aplicación no integra Laravel ni se convierte en una aplicación Laravel.

Hay tres opciones de despliegue y plano de control:

1. **Independiente:** aloja el servidor publicado y conecta workers SDK nativos.
   Consulta [Server independiente](/docs/polyglot/server/).
2. **Integrado:** instala el motor PHP en una aplicación Laravel y reutiliza
   sus colas, base de datos, configuración y despliegue. Es una opción específica
   y nativa de Laravel, no la categoría de toda la plataforma.
3. **Durable Workflow Cloud:** provisiona un namespace gestionado. Cloud opera
   el runtime de orquestación, estado, historial, programaciones, ubicación y
   recuperación mientras los equipos ejecutan clientes SDK y workers. No se
   conecta un Server autogestionado a Cloud. Evalúa únicamente el contrato exacto
   de [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/).

## Qué existe actualmente {#what-exists-now}

La tupla 2.0 publicada actual implementa workflows deterministas, actividades,
señales, consultas, actualizaciones donde se anuncian, temporizadores,
reintentos, tiempos de espera, workflows hijos, cancelación, terminación,
side effects y marcadores de versión en los SDK indicados por el índice de
capacidades, además de programaciones, namespaces, atributos de búsqueda,
interoperabilidad de códecs, compatibilidad de workers, historial y fallos
tipados, diagnósticos estructurados y comandos seguros de operador.

Lee los manifiestos del runtime y la
[matriz exacta de compatibilidad](/docs/compatibility/) en lugar de suponer
paridad entre SDK o deducir capacidades de una versión general del producto.

## Madurez y adecuación {#maturity-and-fit}

Durable Workflow 2.0 es estable, pero su ecosistema e historial de producción
son más jóvenes que los de plataformas consolidadas de ejecución duradera.
Evalúa las capacidades exactas y el ámbito operativo documentado para el
despliegue que pretendas ejecutar.

Durable Workflow 2.0 resulta atractivo cuando son decisivos la operación por
agentes, el alojamiento propio, un protocolo HTTP+JSON público accesible, la
elección entre operación independiente, integrada y Cloud gestionado, o un
núcleo PHP comprensible. La comparación trata de adecuación y madurez, no de
si ambos productos implementan ejecución duradera basada en reproducción.

## ¿Quién debería elegirlo? {#who-should-choose-it}

Elige Durable Workflow 2.0 para evaluarlo cuando:

- Los operadores autónomos o humanos necesiten descubrimiento estructurado,
  diagnósticos tipados, modificaciones seguras y verificación posterior.
- El código de workflow y aplicación Python, Rust y PHP deba compartir un
  modelo de ejecución duradera y un contrato de códec.
- Tenga valor alojarlo por tu cuenta o elegir entre despliegue independiente,
  Laravel integrado y el contrato actual exacto del runtime gestionado de Cloud.
- El equipo pueda validar las capacidades mínimas que requiere contra los
  manifiestos publicados del runtime.

No lo elijas todavía cuando:

- Necesites una función de SDK que el [índice de capacidades](/docs/capabilities/)
  marque como no disponible para el lenguaje elegido.
- Necesites un historial de producción más largo, un ecosistema más amplio o
  más evidencia acumulada de producción de la que proporciona la versión actual.
- Necesites capacidades gestionadas, regiones, SLA, certificaciones,
  conectividad privada, responsabilidades de workers y runtime u otras garantías
  que superen el [contrato actual exacto de Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/).
