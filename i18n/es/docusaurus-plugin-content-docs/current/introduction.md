---
sidebar_position: 1
description: Elige Durable Workflow Cloud, Server autogestionado o Laravel integrado y completa tu primer workflow con un SDK oficial.
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - motor de workflows políglota
  - orquestación duradera
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Introducción {#introduction}

Durable Workflow 2.0 guarda el estado y el historial de los workflows fuera de
los procesos de la aplicación. Así, los workers de PHP, Python y Rust pueden
reanudar su trabajo después de un reinicio. Empieza con la
[Guía de inicio rápido](/docs/quickstart/) para completar un workflow antes de
consultar el [Índice de capacidades](/docs/capabilities/).

## Elige un modelo de despliegue {#choose-a-deployment-model}

### Modo servicio {#service-mode}

Las aplicaciones se conectan a un entorno de ejecución remoto mediante los
SDK oficiales. Elige quién se encarga de operarlo:

- **[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)** es la
  opción gestionada. Durable Workflow opera la orquestación, la persistencia
  y Managed Waterline. Tu equipo ejecuta los clientes y workers del SDK en el
  espacio de nombres provisionado. **Los usuarios de Cloud no instalan ni
  ejecutan Server ni un servicio Waterline separado.**
- **[Server autogestionado](/docs/polyglot/server/)** ofrece la misma interfaz
  de servicio. Tu equipo despliega, protege, escala, respalda y actualiza el
  entorno de ejecución. Puedes desplegar Waterline como servicio separado
  para observar el espacio de nombres gestionado por Server.

Ambas opciones comparten el plano de control HTTP+JSON versionado, el protocolo
de workers, el modelo de espacios de nombres y el formato de datos independiente
del lenguaje. Consulta [Modos de despliegue](/docs/polyglot/deployment-modes/)
para conocer las responsabilidades de cada modelo.

### Laravel integrado {#embedded-laravel}

El modo integrado permite que una aplicación Laravel mantenga el estado, las
colas, la configuración y las herramientas de operación en su propia
infraestructura. Instala `durable-workflow/workflow`, sin conectarse a Cloud ni
necesitar un Server separado. El paquete Waterline integrado lee ese estado
dentro de la aplicación.

Elige la [Instalación integrada](/docs/installation/) cuando quieras que la
aplicación sea responsable de ese entorno.

Si vienes de v1 o estás reconsiderando un despliegue integrado de 2.0, consulta
la [Guía de adopción en Laravel](/docs/laravel-adoption/) para comparar las
rutas ejecutables del modo integrado y del SDK PHP antes de cambiar el tráfico.

## Elige un SDK para el modo servicio {#choose-a-service-mode-sdk}

- **[SDK PHP](/docs/polyglot/php/):** instala `durable-workflow/sdk` en una
  aplicación PHP independiente del framework o en un worker remoto.
- **[SDK Python](/docs/polyglot/python/):** escribe workflows deterministas y
  actividades, y usa el cliente asíncrono del plano de control. La
  <PythonPackageReleaseLink authority="qualified">versión estable de
  Python</PythonPackageReleaseLink> figura en el mismo manifiesto de versiones
  estables que la guía de inicio de Server.
- **[SDK Rust](/docs/polyglot/rust/):** escribe workflows deterministas y
  actividades, y ejecuta servicios de workers nativos.

Los tres implementan la misma interfaz pública. La guía de
[Capacidades de clientes y workers](/docs/polyglot/cli-python-parity/) explica
qué funciones admiten y dónde difieren sus interfaces.

## Tu primer workflow completado {#your-first-completed-workflow}

La [Guía de inicio rápido](/docs/quickstart/) indica el objetivo, la elección
del entorno, los requisitos, el tiempo estimado y el resultado esperado.
Puedes seguir una ruta de PHP, Python o Rust. La ruta local usa artefactos
publicados sin descargar el código fuente. La ruta de Cloud usa los datos de
conexión del espacio de nombres gestionado, sin ejecutar Server.

## Cómo encajan las piezas del modo servicio {#how-service-mode-fits-together}

Un despliegue en modo servicio tiene tres partes:

- **El entorno de ejecución** mantiene el estado duradero, los comandos y el
  historial, la asignación de tareas, los temporizadores, las programaciones,
  los espacios de nombres y los protocolos autenticados. Cloud lo opera en
  los espacios gestionados. Tu equipo lo opera en un despliegue autogestionado.
- **Los workers de la aplicación** ejecutan workflows y actividades con los
  SDK de PHP, Python o Rust. Pueden desplegarse junto a la aplicación o como
  servicios independientes, y escalar por separado.
- **Los clientes y las herramientas de operación** inician, inspeccionan y
  controlan el mismo estado mediante los SDK, el CLI `dw`, las API HTTP, los
  esquemas legibles por máquinas, Waterline y las interfaces para agentes.

## Un contrato público de ejecución duradera {#one-public-durable-execution-contract}

Los SDK oficiales comparten nombres de tipos de workflow y actividad
registrados como cadenas, y un formato público para los datos. Ese formato
identifica su codec y contiene valores portables en lugar de serialización
PHP, pickles de Python o tipos internos de Rust.

Los workers reconstruyen las decisiones a partir de los comandos y del
historial duradero. Las entradas y los resultados de actividades y workflows
hijos pueden cruzar lenguajes cuando los workers anuncian el mismo codec
público y registran los mismos nombres de tipos. Consulta el
[Índice de capacidades](/docs/capabilities/) y la información del entorno
antes de depender de una función concreta de un SDK.

## Aprende con los ejemplos de tu modelo {#learn-from-the-matching-examples}

- **Modo servicio y varios lenguajes:** sigue la
  [Guía de inicio rápido](/docs/quickstart/) y la guía del SDK elegido.
- **Laravel integrado:** explora los patrones nativos de Laravel y la
  información de Waterline en la galería [Sample App](/docs/sample-app/).

La galería integrada está orientada a Laravel. Para Cloud o Server
autogestionado, empieza con la guía del modo servicio.

## Operación por agentes mediante un contrato explícito {#agent-operable-by-contract}

Las personas y los agentes autónomos usan el mismo contrato legible por
máquinas. El ciclo verificable es **Descubrir → Cambiar → Ejecutar → Diagnosticar
→ Reparar**: manifiestos de versiones y capacidades, comandos explícitos,
resultados estructurados, historial tipado, diagnósticos de workers y colas,
modificaciones seguras y verificación posterior. Consulta el
[Ciclo de operación de agentes](/docs/agent-operating-loop/) y el
[Evaluador de motores para agentes de IA](/docs/ai-agent-workflow-engine/).

## ¿Necesitas un workflow? {#do-you-need-a-workflow}

Probablemente lo necesitas si:

- El proceso dura minutos, horas o días.
- Debes esperar una aprobación humana.
- Debes esperar un webhook u otro evento externo.
- Quieres pausar y continuar sin mantener un proceso en ejecución.
- Debes reanudar después de un fallo sin perder el estado ni duplicar trabajo.

Si solo necesitas ejecutar cinco trabajos en orden y detenerte ante el primer
fallo, una cadena de trabajos suele bastar. Durable Workflow resulta útil
cuando el siguiente paso depende de un evento externo, una espera o una
decisión que no puede conocerse de antemano.
