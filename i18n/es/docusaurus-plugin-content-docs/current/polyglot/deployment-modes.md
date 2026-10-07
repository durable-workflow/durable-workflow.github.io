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
ejecuta sus aplicaciones y workers. **En Cloud no instalas ni despliegas tu
propio Server ni un servicio Waterline separado.** Server autogestionado no
incluye Waterline. Puedes desplegarlo por separado para observar un espacio
de nombres gestionado por Server.

Usa esta página para elegir quién mantiene tus workflows o planificar un
cambio de modelo. Los equipos Laravel pueden consultar la
[Guía de adopción y transición](/docs/laravel-adoption/), incluido el puente
Laravel del SDK PHP y su implementación de pruebas.

## Elige un entorno en modo servicio {#choose-a-service-mode-runtime}

| Entorno | Quién opera el estado duradero | Qué ejecuta tu equipo | Primer paso |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow opera la persistencia, las actualizaciones, el endpoint y Managed Waterline. | Clientes y workers de PHP, Python o Rust con credenciales provisionadas. | [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane/) |
| Server autogestionado | Tu equipo despliega, protege, escala, respalda y actualiza Server y su persistencia. | Server, clientes y workers. Waterline puede desplegarse como servicio separado. | [Server autogestionado](/docs/polyglot/server/) |

Ambos usan el mismo modelo de clientes y workers. Cambian la operación del
entorno y las credenciales.

## El mismo modelo duradero con distintas interfaces {#same-durable-model-different-boundary}

Los dos modos comparten el núcleo de v2. Cambian el alojamiento, la
autenticación y el transporte. El modo servicio expone HTTP+JSON, sin gRPC
obligatorio ni un segundo motor.

| Superficie | Modo integrado | Modo servicio | Contrato compartido |
| --- | --- | --- | --- |
| Estado duradero | Laravel aloja el paquete y su estado. | Cloud o Server mantiene el estado detrás de la API. | IDs de instancia y ejecución, historial tipado, resultados de comandos, reintentos, reparación y exportación. |
| Plano de control | Código de la aplicación, `WorkflowStub` o herramientas locales. | API, CLI o SDK con autenticación y cabeceras de protocolo. PHP usa `DurableWorkflow\Client` de `durable-workflow/sdk`. | Política de inicios duplicados, selección de ejecución, IDs de comandos y resultados. Los comandos posteriores van al entorno que aceptó el inicio. |
| Workers | Workers de colas Laravel dentro de la aplicación. | Registro, long polling, heartbeat y finalización por HTTP+JSON. PHP usa `DurableWorkflow\Worker`. | Leases, compatibilidad, reproducción y actividades ejecutadas al menos una vez. |
| Despacho predeterminado | Colas Laravel dentro de la aplicación. | Despacho por polling para workers externos. Server permite cambiarlo explícitamente. | Ciclo de disponibilidad, lease y reparación de tareas duraderas. |
| Tipos de workflow y actividad | Los alias PHP pueden resolver clases locales. | Los workers anuncian los tipos que admiten. | Nombres públicos estables e independientes del lenguaje. Evita usar nombres completos de clases PHP como contrato público. |
| Observación | Waterline integrado lee el estado de Laravel. | Cloud incluye Managed Waterline. Server admite un Waterline separado, además de API, CLI y SDK. | Estado, atributos de búsqueda, memos, diagnósticos de colas e historial del entorno que posee la ejecución. Waterline no combina entornos ni espacios de nombres. |
| Autenticación | La aplicación Laravel controla rutas y sesiones. | La selección de espacio de nombres y la autenticación de Server son obligatorias. | Nombres de espacios, colas, marcas de compatibilidad y contrato Avro estable durante la transición. |
| Conexión | Servicios internos o configuración de la aplicación. | URL base remota explícita. | No depender de `APP_URL`, `APP_KEY`, localhost ni compartir contenedor. |
| Migración | Las ejecuciones existentes permanecen en su entorno. | Las nuevas empiezan en el entorno elegido. | No hay migración automática de ejecuciones activas. Exportar sirve para auditoría y diagnóstico, no para importar estado activo. |

## Cuándo elegir el modo integrado {#choose-embedded-mode-when}

- Tu aplicación Laravel reúne código, workers y acceso de operadores.
- Sus colas y su autenticación son la interfaz adecuada.
- Quieres un entorno autocontenido y no necesitas workers de otros lenguajes.
- Tus operadores pueden usar Waterline integrado o las herramientas de la aplicación.

Empieza con [Instalación integrada](/docs/installation/) y la
[Documentación del modo integrado](/docs/category/embedded/).

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
[SDK Rust](/docs/polyglot/rust/). Para un Waterline separado, consulta la
[API de Server](/docs/polyglot/server-api-reference/) y
[Monitorización](/docs/monitoring#waterline-service).

## Transición al modo servicio autogestionado {#migration-tooling-to-self-hosted-service-mode}

La ruta admitida es una adopción gradual:

- Sigue [Migración del modo integrado a Server](/docs/polyglot/embedded-to-server).
- Comprueba la versión, topología y capacidades con `GET /api/cluster/info`.
- Registra workers con `POST /api/worker/register` y verifica que ejecutan los
  nombres de tipos estables elegidos.
- Antes de cambiar el tráfico, comprueba la cobertura de workers compatibles
  mediante `GET /api/system/operator-metrics`, `dw worker:list` o Waterline.
- Consulta [Capacidades de clientes y workers](/docs/polyglot/cli-python-parity/)
  al sustituir llamadas locales por automatización remota.
- Usa Waterline o la exportación del historial para auditoría y diagnóstico.
  Una exportación no importa ejecuciones activas en otro entorno.

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
