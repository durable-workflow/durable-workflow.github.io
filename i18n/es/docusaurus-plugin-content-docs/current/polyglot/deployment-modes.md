---
sidebar_position: 2
title: Modos de despliegue
description: Elige el modo servicio con Durable Workflow Cloud o Server autogestionado, o integra el entorno en Laravel.
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - modos de despliegue de Durable Workflow
  - modo integrado
  - modo servicio
  - Durable Workflow Cloud
  - Server independiente
  - Cloud y alojamiento propio
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Modos de despliegue {#deployment-modes}

<ProductPromotion source="docs-v2-deployment-modes">
Elige el servicio gestionado para tus workers de PHP, Python o Rust sin operar
el entorno de orquestación.
</ProductPromotion>

Durable Workflow v2 tiene dos modos de despliegue:

- **Modo servicio:** las aplicaciones y los workers se conectan mediante SDK a
  un entorno remoto. Elige [Cloud](/docs/polyglot/cloud-control-plane/) o
  [Server autogestionado](/docs/polyglot/server/).
- **Modo integrado:** una aplicación Laravel instala
  `durable-workflow/workflow` y opera directamente el entorno.

Cloud y Server autogestionado son alternativas dentro del modo servicio.
Cloud opera la orquestación, la persistencia y Managed Waterline. El cliente
ejecuta sus aplicaciones y workers del SDK. **En Cloud no instalas, despliegas
ni conectas tu propio Server ni un servicio Waterline separado.** Server autogestionado no
incluye Waterline. Puedes desplegarlo por separado para observar un espacio
de nombres gestionado por Server.

Usa esta página para elegir qué modelo debe operar tu flota de workflows,
planificar una transición entre modelos o documentar qué partes del contrato
del producto deben ser idénticas en ambos. Los equipos Laravel deben consultar la
[Guía de adopción y transición](/docs/laravel-adoption/) para las rutas de v1 a v2
y del modo integrado al modo servicio, incluido el puente Laravel publicado
del SDK PHP y su implementación simulada para pruebas de Laravel.

## Elige un entorno en modo servicio {#choose-a-service-mode-runtime}

| Entorno | Quién opera el estado duradero | Qué ejecuta tu equipo | Primer paso |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow opera el runtime del namespace gestionado, la persistencia, las actualizaciones, el endpoint del servicio y Managed Waterline. | Clientes de aplicación y workers de PHP, Python o Rust con credenciales provisionadas. No ejecutes Server ni un servicio Waterline separado. | [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/) |
| Server autogestionado | Tu equipo despliega, protege, escala, respalda y actualiza Server y su persistencia. | Server, clientes de aplicación y workers de PHP, Python o Rust. Si quieres, despliega Waterline como servicio separado contra el namespace gestionado por Server. | [Server autogestionado](/docs/polyglot/server/) |

Ambos usan el mismo modelo de clientes y workers. Cambian la operación del
entorno y las credenciales, no la autoría de workflows.

## El mismo modelo duradero con distintas interfaces {#same-durable-model-different-boundary}

Los dos modos comparten el núcleo de v2. Cambian el alojamiento, la
autenticación y el transporte. El modo servicio expone HTTP+JSON, sin gRPC
obligatorio ni un segundo motor.

| Superficie | Modo integrado | Modo servicio | Contrato compartido |
| --- | --- | --- | --- |
| Modelo de workflow duradero | Una aplicación Laravel aloja el paquete directamente y escribe el estado de workflow en su runtime. | Cloud o Server autogestionado mantiene el estado detrás de la API del servicio. | Los ID de workflow y ejecución, historial tipado, resultados de comandos, reintentos, semántica de reparación y exportación del historial conservan el mismo contrato v2. |
| Plano de control | Código de la aplicación, `WorkflowStub` o herramientas locales. | API, CLI o SDK con autenticación y cabeceras de protocolo. PHP usa `DurableWorkflow\Client` de `durable-workflow/sdk`. | Política de inicios duplicados, selección de ejecución, IDs de comandos y resultados. Los comandos posteriores van al entorno que aceptó el inicio. |
| Transporte de workers | Los workers de colas Laravel ejecutan tareas de workflow y actividad dentro del despliegue de la aplicación. | Los workers se registran, hacen long polling, envían heartbeats y completan trabajo mediante el protocolo HTTP+JSON de workers. Los workers PHP remotos usan `DurableWorkflow\Worker` de `durable-workflow/sdk`. | Las leases de tareas, marcas de compatibilidad, semántica de reproducción y ejecución de actividades al menos una vez se mantienen. |
| Despacho predeterminado | Colas Laravel dentro de la aplicación. | Despacho por polling para workers externos. Server permite cambiarlo explícitamente. | Ciclo de disponibilidad, lease y reparación de tareas duraderas. |
| Claves de tipo de workflow y actividad | Los alias PHP pueden resolver clases locales de la aplicación. | Los workers anuncian las claves de tipo admitidas al registrarse. | Las claves de tipo públicas deben ser estables e independientes del lenguaje. No conviertas los FQCN PHP ni tipos PHP vacíos que repliquen otros tipos en el contrato público. |
| Interfaz de operador | El paquete Waterline integrado o las herramientas locales de la aplicación leen su estado duradero de Laravel en el mismo proceso. | Cloud ofrece Managed Waterline para su namespace. Los operadores autogestionados pueden desplegar Waterline por separado contra un namespace de Server. Las API de servicio, el CLI y los SDK también leen el estado del runtime. | Los atributos de búsqueda, memos, estado de ejecución, diagnósticos de colas y exportación del historial son hechos duraderos del runtime que posee la ejecución. Waterline no combina runtimes ni namespaces. |
| Límite de autenticación y aislamiento entre clientes | La aplicación Laravel define la autenticación que expone para sus propias rutas y sesiones. | La selección de namespace y los tokens o firmas de autenticación de Server son límites obligatorios de la API. | Los nombres de namespaces, colas de tareas, marcas de compatibilidad y contrato fijo de cargas útiles Avro deben mantenerse estables durante la transición. |
| Descubrimiento del runtime | La aplicación puede resolver servicios en el mismo proceso o mediante su configuración local. | Los workers y clientes deben dirigirse a una URL base remota explícita. | No acoples ningún modo a `APP_URL` o `APP_KEY` compartidos, suposiciones sobre localhost ni descubrimiento dentro del mismo contenedor. |
| Migración | Las ejecuciones existentes permanecen en su entorno. | Las nuevas empiezan en el entorno elegido. | No hay migración automática de ejecuciones activas. Exportar sirve para auditoría y diagnóstico, no para importar estado activo. |

## Cuándo elegir el modo integrado {#choose-embedded-mode-when}

- Tu aplicación Laravel reúne código, workers y acceso de operadores.
- Sus colas y su autenticación son la interfaz adecuada.
- Quieres un entorno autocontenido y no necesitas workers de otros lenguajes.
- Tus operadores pueden usar Waterline integrado o las herramientas de la aplicación.

Empieza con [Instalación integrada](/docs/installation/) y la
[Documentación del modo integrado](/docs/category/embedded/), incluido su grupo de Configuración.

## Cuándo elegir el modo servicio {#choose-service-mode-when}

- Varias aplicaciones o equipos comparten un entorno de workflows.
- Los workers, clientes u operadores no usan todos Laravel/PHP.
- Necesitas autenticación remota y espacios de nombres explícitos.
- Quieres escalar por separado las API, el despacho y los workers mediante la
  [Topología de roles de Server](/docs/polyglot/server-role-topology).
- Quieres observar Server autogestionado con un Waterline separado.
  Cloud ya incluye Managed Waterline.

Para el servicio gestionado, empieza con [Cloud](/docs/polyglot/cloud-control-plane/).
Para autogestión, consulta [Server](/docs/polyglot/server/) y
[Despliegues autogestionados](/docs/deployment/). Elige después el
[SDK PHP](/docs/polyglot/php/), [SDK Python](/docs/polyglot/python/) o
[SDK Rust](/docs/polyglot/rust/). Los usuarios de Cloud operan mediante Managed
Waterline. Para desplegar un servicio Waterline separado en un entorno
autogestionado, consulta la
[API de Server](/docs/polyglot/server-api-reference/) y
[Monitorización](/docs/monitoring#waterline-service).

## Transición al modo servicio autogestionado {#migration-tooling-to-self-hosted-service-mode}

La ruta admitida del modo integrado al modo servicio es una adopción gradual,
no un traspaso en vivo del estado de ejecuciones en curso:

- Sigue [Migración del modo integrado a Server](/docs/polyglot/embedded-to-server).
- Comprueba la versión, topología y capacidades con `GET /api/cluster/info`.
- Registra workers con `POST /api/worker/register` y verifica que ejecutan los
  nombres de tipos estables elegidos.
- Antes de cambiar el tráfico, comprueba la cobertura de workers compatibles
  mediante `GET /api/system/operator-metrics`, `dw worker:list` o Waterline.
- Consulta [Capacidades de clientes y workers](/docs/polyglot/cli-python-parity/)
  al sustituir llamadas locales por automatización remota.
- Usa Managed Waterline de Cloud, el despliegue Waterline conectado al runtime
  autogestionado o la exportación nativa del historial de Server como evidencia
  de auditoría y diagnóstico. No trates los paquetes exportados como una ruta
  de importación de ejecuciones activas gestionadas por Server.

Respeta estas tres reglas:

1. Las ejecuciones existentes permanecen donde empezaron.
2. Las nuevas usan nombres estables de tipos, espacios de nombres, colas y el
   contrato Avro desde el primer cambio de tráfico.
3. Señales, consultas, actualizaciones, reparación, cancelación, terminación y
   archivo se dirigen al entorno que posee la ejecución.

## Referencias relacionadas {#related-references}

- [Instalación](/docs/installation)
- [Server](/docs/polyglot/server)
- [SDK PHP](/docs/polyglot/php)
- [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane)
- [Migración a Server](/docs/polyglot/embedded-to-server)
- [Topología de roles](/docs/polyglot/server-role-topology)
- [Configuración de Server](/docs/polyglot/server-config-reference)
