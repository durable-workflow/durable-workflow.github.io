---
sidebar_position: 17
title: Compatibilidad de versiones
description: Contrato de referencia de compatibilidad y autoridad de publicación para las interfaces públicas de Durable Workflow.
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - compatibilidad de versiones
  - autoridad de compatibilidad
  - autoridad de publicación
  - niveles de estabilidad
  - manifiestos de protocolos
  - versión del plano de control
  - versión del protocolo de workers
  - contrato de estabilidad de interfaces
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Compatibilidad de versiones {#version-compatibility}

Esta página es el **contrato de referencia de compatibilidad y autoridad de
publicación** de la plataforma pública de Durable Workflow. Es la fuente única
de referencia para:

- qué interfaces son públicas,
- el nivel de estabilidad de cada una,
- qué cambios se pueden distribuir en una versión de parche, menor o mayor,
- si un campo pertenece al contrato o sirve solo para diagnóstico,
- y el protocolo de negociación de versiones que usan los clientes para rechazar
  la operación cuando el servidor anuncia una interfaz que no entienden.

Los documentos de estabilidad de cada paquete (por ejemplo,
`docs/api-stability.md` en `durable-workflow/workflow`, la referencia de la CLI
`dw` o la API de operadores de Waterline) están **subordinados** a esta página.
Añaden detalles de cada paquete siguiendo estas reglas. Si discrepan de esta
página, prevalece esta página y la discrepancia es un error del documento del
paquete.

El mismo contrato se publica en formato legible por máquinas para que SDK,
manifiestos del servidor y controles de CI se validen contra una sola referencia:

- `surface_stability_contract` en el cuerpo de respuesta de
  `GET /api/cluster/info` del servidor independiente de Durable Workflow,
  esquema `durable-workflow.v2.surface-stability.contract`, versión `5`.
- Una copia congelada del mismo manifiesto en
  `static/compatibility-contract.json` de este repositorio.
- La clase PHP `Workflow\V2\Support\SurfaceStabilityContract`, que es la fuente
  dentro del proceso que el servidor vuelve a exponer.

Una publicación que cambie una interfaz de las siguientes, su estabilidad,
sus campos o sus reglas para cambios incompatibles, debe actualizar a la vez
esta página, la copia JSON, el manifiesto PHP y los documentos de estabilidad de
paquetes afectados. El CI valida el contrato legible por máquinas, los metadatos
Rust publicados cuando están disponibles y las especificaciones del protocolo de workers. La coherencia
editorial entre esta página y el manifiesto sigue siendo una responsabilidad
explícita de la revisión de la publicación.

## Complemento: catálogo de especificaciones de protocolos de la plataforma {#companion-platform-protocol-spec-catalog}

Esta página indica *qué* interfaces son públicas y *cómo* pueden cambiar.
El catálogo complementario de
[especificaciones de protocolos de la plataforma](/docs/platform-protocol-specs)
indica *dónde* está la especificación normativa legible por máquinas de cada
interfaz, *qué formato* usa (OpenAPI para API HTTP, JSON Schema para familias de
objetos, AsyncAPI para semántica de flujos de eventos), *qué repositorio* la
mantiene, qué familias de objetos rige y qué URL pública resuelve al artefacto.
Autores de SDK, agentes y operadores deben validar contra el catálogo, en vez de
releer prosa o depender de detalles de implementación locales del repositorio.

El catálogo se anuncia como `platform_protocol_specs` en
`GET /api/cluster/info`.

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

El `surface_family` de cada entrada debe existir en el contrato anterior.
El CI del sitio valida el catálogo, resuelve cada URL pública y rechaza campos
de autoridad locales del repositorio.

<WorkerProtocolAuthorityRoles />

Cada entrada obligatoria del catálogo está marcada como `published`. La entrada
del contenedor invocable sigue en `in_progress`. Cada entrada disponible enlaza
directamente un documento público OpenAPI, AsyncAPI o JSON Schema. El esquema
[`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes)
fija la interfaz de descubrimiento desde la que se alcanza el resto del catálogo.

## Compatibilidad de Laravel publicada {#laravel-support}

Elige la versión del paquete antes de comparar los requisitos de PHP y Laravel.
El paquete integrado y el SDK de modo servicio tienen contratos distintos.

| Línea del paquete | PHP | Laravel |
| --- | --- | --- |
| Workflow integrado 2.28 actual | PHP 8.2+ de 8.x; PHP 8.3+ para Laravel 13 | `^12.69.0` o `^13.30.0` |
| Workflow integrado 2.20.5 | PHP `^8.1`, sujeto al mínimo del framework | `^10.50.4`, `^11.56.1`, `^12.69.0` o `^13.30.0` |
| SDK PHP 3.14 publicado | SDK básico PHP `^8.1`; el puente Laravel necesita PHP `^8.2`, y PHP 8.3+ para Laravel 13 | `^12.69.0` o `^13.30.0` |
| SDK PHP 3.9.5 | SDK básico PHP `^8.1`; el puente Laravel también exige el mínimo del framework | `^10.50.4`, `^11.56.1`, `^12.69.0` o `^13.30.0` |

Las autoridades son el [contrato integrado publicado](https://github.com/durable-workflow/workflow/blob/2.28.0/resources/laravel-embedded-upgrade-contract.json)
y el `composer.json` de cada versión. La versión integrada actual se verificó
con Laravel 12/PHP 8.2–8.4 y Laravel 13/PHP 8.3–8.4. Retira PHP 8.1 y Laravel
10/11. No cambia la [guía histórica de v1 estable](/docs/1.x/installation/)
ni los [requisitos independientes del SDK PHP](https://php.durable-workflow.com/).

Actualiza primero PHP y Laravel a una combinación compatible. Si aún no puedes,
`~2.20.5` mantiene Composer en los parches 2.20, sin prometer mantenimiento
indefinido. `^2.0` puede seleccionar un minor posterior cuando la plataforma lo
permita. Conserva el runtime original de las ejecuciones v1 abiertas y sigue la
[guía de adopción](/docs/laravel-adoption) para drenar o coexistir. Cambiar la
restricción Composer no migra el historial durable.

El SDK PHP 3.10 llevó el puente Laravel de modo servicio a los mismos mínimos
de PHP y Laravel que Workflow 2.21 y retiró el soporte para Laravel 10/11; de 3.11 a 3.14
los mantienen. Su proveedor rechaza versiones del framework y de PHP no
compatibles o desconocidas antes de registrar configuración, clientes o workers.
Las aplicaciones existentes con el SDK 3.9.x conservan su propio contrato
mientras se actualiza la plataforma. Consulta las
[notas de actualización del SDK PHP](./polyglot/php.md#upgrade-to-3-10-and-3-11).

Workflow 2.22 no añade ninguna migración de base de datos y mantiene los
mínimos de soporte de 2.21. Su protocolo de workers integrado anuncia `1.22` y
sigue aceptando solicitudes `1.20`. `1.22` añade un plazo por ocurrencia
opcional que los llamantes externos pueden solicitar para las esperas de
condición; el ejecutor integrado mantiene su comportamiento de espera actual.
Después de que cualquier workflow haya usado esa política, revierte a una
versión anterior de Workflow solo restaurando una copia de seguridad tomada
antes de la actualización. Las versiones anteriores pueden descartar la
política y mezclar la cadena de espera, y volver a actualizar no repara ese
historial. Consulta el
[registro de cambios de 2.22.0](https://github.com/durable-workflow/workflow/blob/2.22.0/CHANGELOG.md).

Workflow 2.23 y 2.24 mantienen los mínimos de soporte de 2.21 y el protocolo de workers integrado `1.22`. 2.23 no añade ninguna migración de base de datos. 2.24 añade una, así que ejecute `php artisan migrate` al actualizar. Añade a `activity_attempts` las columnas anulables `last_heartbeat_progress`, `last_heartbeat_progress_at` y `last_heartbeat_recorded_at`, sin rellenar datos. Cambios de comportamiento que conviene revisar antes de actualizar:

- Desde 2.24, un heartbeat escribe un evento `ActivityHeartbeatRecorded` solo cuando su progreso cambió, como máximo una vez por max(timeout de heartbeat, 60 segundos). Consulte [Heartbeats](./features/heartbeats.md).
- Desde 2.24, crear un schedule con un id ya ocupado, incluido el de un schedule eliminado o agotado, lanza `ScheduleAlreadyExistsException`, y volver a aplicar un schedule sin cambios no registra nada.
- Desde 2.23.1, una actividad nueva con `maxAttempts` menor que 1 hace fallar la ejecución en lugar de ejecutarse una vez. Para intentos ilimitados, omita `maxAttempts` y ponga `$tries` de la clase de actividad en 0. Los historiales registrados antes se siguen reproduciendo.
- Desde 2.23.1, la compensación de sagas integrada se ejecuta bajo un escudo de cancelación, y una actualización aceptada mientras la ejecución se cierra recibe igualmente su resultado.

Consulte las notas de versión de [2.23.0](https://github.com/durable-workflow/workflow/releases/tag/2.23.0), [2.23.1](https://github.com/durable-workflow/workflow/releases/tag/2.23.1), [2.23.2](https://github.com/durable-workflow/workflow/releases/tag/2.23.2) y [2.24.0](https://github.com/durable-workflow/workflow/releases/tag/2.24.0).

Workflow 2.25 y 2.26 mantienen los mínimos de soporte de 2.21 y el protocolo de workers integrado `1.22`. 2.25 no añade ninguna migración de base de datos. 2.26 añade una, así que ejecute `php artisan migrate` al actualizar. Crea la tabla `workflow_child_supervisions`. Cambios que conviene revisar antes de actualizar:

- Desde 2.26, un padre que continúa como nueva ejecución mientras los hijos que inició siguen abiertos los entrega a la ejecución continuada. La ejecución final de la cadena aplica su política de cierre del padre, y un hijo que falla se sigue reintentando con su política de reintentos registrada. Consulte [Continuar como nueva ejecución e hijos abiertos](./features/child-workflows.md#continue-as-new-and-open-children).
- Desde 2.26, las migraciones de versiones anteriores que rellenan filas existentes (`2026_07_13`, `2026_09_24`, `2026_09_29` y `2026_10_11`) ya no bloquean la tabla durante todo el relleno. Primero añaden la columna, rellenan las filas en lotes pequeños y después crean sus índices sin bloquear las escrituras. Si una de ellas se interrumpe, vuelva a ejecutar `php artisan migrate`. Las instalaciones que ya las ejecutaron no se ven afectadas.
- Desde 2.26, el redrive reutiliza un workflow hijo que se completó antes del fallo. Las versiones anteriores a 2.26 reproducen esa sucesora con una hora del workflow distinta después del hijo reutilizado, así que mantenga los workers en 2.26 o posterior una vez que exista una. Consulte [Redrive de una ejecución fallida](./failures-and-recovery.md#redrive).
- Desde 2.26, `historyBudgetAtStep()` y `shouldContinueAsNewAtStep()` leen el presupuesto de historial de la misma forma en cada replay. Úselos en bucles. Consulte [Presupuesto de historial](./features/continue-as-new.md#history-budget).
- Desde 2.25, superar un límite fijo de memo o de atributo de búsqueda lanza `StructuralLimitExceededException` en lugar de `InvalidArgumentException`, y el valor predeterminado de `memo_size_bytes` es 65.536. Consulte [Límites estructurales](./constraints/structural-limits.md).

Consulte las notas de versión de [2.25.0](https://github.com/durable-workflow/workflow/releases/tag/2.25.0) y [2.26.0](https://github.com/durable-workflow/workflow/releases/tag/2.26.0).

Workflow 2.27 mantiene los mínimos de soporte de 2.21 y el protocolo de workers integrado `1.22`, y no añade ninguna migración de base de datos. Cambios que conviene revisar antes de actualizar:

- Desde 2.27, una aplicación integrada repara y ejecuta trabajo solo en sus propios espacios de nombres. Si la aplicación inicia, programa o envía señales a workflows en espacios de nombres distintos de `DW_V2_NAMESPACE`, inclúyalos todos en `DW_V2_NAMESPACES`. Un proceso que atiende todos los espacios de nombres define `DW_V2_ALL_NAMESPACES=true`. Consulte [Qué espacios de nombres ejecuta una aplicación](./configuration/options.md#namespace-allowlist).
- Desde 2.27, cerrar un hijo le cuesta al padre el mismo trabajo sin importar cuántos hermanos tenga. Consulte [Coste de una ramificación amplia](./features/child-workflows.md#fan-out-cost).

Consulte las [notas de la versión 2.27.0](https://github.com/durable-workflow/workflow/releases/tag/2.27.0).

Workflow 2.28 mantiene los mínimos de soporte de 2.21 y el protocolo de workers integrado `1.22`, y no añade ninguna migración de base de datos. Cambio de comportamiento que conviene revisar antes de actualizar:

- Desde 2.28, una ejecución que se completa, falla o continúa como nueva cancela en la misma transacción las actividades y los temporizadores que nunca esperó, como los perdedores de `select()`, en lugar de dejarlos en ejecución. Un resultado tardío de esa actividad se rechaza con `run_closed`. Si un workflow necesita el efecto de un perdedor, espérelo antes de retornar. Consulte [Perdedores cuando se cierra la ejecución](./features/concurrency.md#selection-losers-at-close).

Consulte las [notas de la versión 2.28.0](https://github.com/durable-workflow/workflow/releases/tag/2.28.0).

## Niveles de estabilidad {#stability-levels}

Cada interfaz pública tiene exactamente uno de estos niveles de estabilidad.
Los niveles son explícitos. Una interfaz sin clasificación no es pública.

| Nivel | Significado | Cuándo se permiten cambios incompatibles |
|-------|---------|-----------------------------------|
| `frozen` | Formato de transmisión o estructura persistida que debe decodificarse igual durante toda la vida del workflow. Renombrar, quitar o reutilizar un campo rompe el protocolo y nunca es un cambio menor. | Solo introduciendo una **primitiva paralela** con un nombre de tipo nuevo. La estructura original sigue siendo decodificable indefinidamente. |
| `stable` | Interfaz pública cubierta por la garantía de versionado semántico de la plataforma. Los cambios aditivos se distribuyen en versiones menores. | Solo en una versión mayor. |
| `prerelease` | Interfaz pública con todas sus funcionalidades, pero que aún puede cambiar antes de publicar su `1.0.0` / `2.0.0` correspondiente. | En versiones preliminares claramente identificadas y documentadas en las notas de publicación. |
| `experimental` | Interfaz pública inestable. Puede cambiar en cualquier versión, incluidos parches. Los consumidores deben aceptar su uso leyendo el indicador experimental de la interfaz. | En cualquier versión, indicando el cambio en las notas de publicación. |

## Familias de interfaces públicas {#public-surface-families}

Esta es la lista completa de familias de interfaces públicas. Añadir, quitar o
reclasificar una familia requiere cambiar el contrato (incremento de versión de
`SurfaceStabilityContract`, esta página y la copia JSON en el mismo commit).

| Familia | Estabilidad | Manifiesto de autoridad en `/api/cluster/info` | Qué cubre |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | API HTTP del servidor independiente: rutas del plano de control, namespaces, programaciones y sistema, además de `/api/health`, `/api/ready` y `/api/cluster/info`. La versión por ruta se rige por `control_plane.request_contract` y `control_plane.response.contract`. El `version` superior del servidor identifica la compilación, no la autoridad de compatibilidad del cliente. |
| `worker_protocol` | `stable` | `worker_protocol` | API HTTP del plano de workers que usan los workers externos de SDK para registrarse, sondear, enviar latidos, gestionar leases de sesiones y completar o fallar tareas de workflows, actividades y consultas. Incluye los contratos de ejecución `worker_sessions` y `local_activities`, `external_execution_surface_contract`, `external_executor_config_contract`, `invocable_carrier_contract`, `external_task_input_contract` y `external_task_result_contract`. |
| `cli_json` | `stable` | No aplicable (véase la referencia de la CLI) | Estructuras `--output=json` y `--output=jsonl` emitidas por `dw`. Los códigos de salida JSON y nombres de campos JSON son la interfaz duradera. El formato legible por personas `--output=table` es documentación, no contrato. |
| `waterline_api` | `stable` | No aplicable (véase la API de operadores de Waterline) | API HTTP de observabilidad de Waterline en `/waterline/api/v2/*`, el contrato de origen del motor y las estructuras JSON del panel. Waterline debe coincidir con la versión mayor del paquete Workflow. |
| `mcp_discovery_results` | `stable` | No aplicable (véase la página de workflows MCP) | Interfaces Model Context Protocol `/mcp/*` y archivos de descubrimiento `llms.txt` / `llms-2.0.txt`. Los nombres de herramientas MCP, esquemas de parámetros y semántica de `payload_preview_limit_bytes` forman parte del contrato. Las descripciones y pistas de descubrimiento son diagnósticas. |
| `official_sdks` | `stable` | `client_compatibility` | SDK oficiales: PHP `durable-workflow/sdk`, Python `durable_workflow` y Rust `durable-workflow`. La CLI `dw` es el cliente de comandos oficial. La interfaz pública de cada SDK se rige por su documento de estabilidad, subordinado a esta página. |
| `history_event_wire_formats` | `frozen` | No aplicable (estructuras congeladas; véase `docs/api-stability.md` de workflow) | Estructura persistida de cada fila en `workflow_history_events` y `workflow_schedule_history_events`. Tras escribir un evento, todo SDK futuro que lo reproduzca debe decodificar el mismo conjunto de campos. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | Los propios manifiestos publicados por `GET /api/cluster/info`. Cada manifiesto anidado tiene su `schema` y `version`, y evoluciona según sus reglas de contrato. Las claves del sobre son estables. |

### Documentos de estabilidad por paquete {#per-package-stability-documents}

Estos documentos añaden detalles de cada paquete siguiendo las reglas de esta página:

- `durable-workflow/workflow` (PHP): [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md). Referencia de la API de creación PHP, las clases `Support\*` orientadas al servidor y las tablas de formatos congelados de eventos del historial.
- `durable-workflow/sdk` (PHP): [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md). Referencia de la API de cliente remoto y worker independiente del framework distribuida en Packagist.
- `durable-workflow/server`: [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) y `docs/contracts/*`. Referencia de los contratos de petición/respuesta del servidor independiente.
- CLI `dw`: [`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference). Referencia de estructuras de salida JSON y códigos de salida.
- SDK Python: `README.md` en `durable-workflow/sdk-python`. Referencia de la API pública de `durable_workflow`.
- SDK Rust: `README.md` y `[package.metadata.durable-workflow]` en
  `durable-workflow/sdk-rust`. Referencia de la API pública del crate
  `durable-workflow` y de su declaración de compatibilidad del paquete.

## Reglas de publicación {#release-rules}

Estas reglas se aplican a todas las familias públicas anteriores. Se reproducen
en la copia JSON bajo `release_rules`.

### Versiones de parche {#patch-releases}

Permitido:
- correcciones de errores que preserven el contrato documentado
- correcciones de documentación
- actualizaciones de dependencias que no cambien la interfaz pública
- cambios en interfaces marcadas `experimental`

Prohibido:
- quitar o renombrar campos, rutas, comandos o clases `stable` o `frozen`
- restringir entradas aceptadas en rutas o comandos `stable`
- cambiar el significado de un campo `stable` existente

### Versiones menores {#minor-releases}

Permitido:
- añadir campos, rutas, comandos o clases a una interfaz `stable`
- añadir parámetros opcionales con valores predeterminados seguros
- añadir indicadores de capacidad a las respuestas de descubrimiento
- promover una interfaz `prerelease` o `experimental` a `stable`

Prohibido:
- quitar o renombrar campos, rutas, comandos o clases `stable` o `frozen`
- cambiar el significado de campos `stable` o `frozen` existentes

### Versiones mayores {#major-releases}

Permitido:
- quitar, renombrar o restringir una interfaz `stable`
- aumentar la `control_plane.version` o `worker_protocol.version` requerida
- dejar de admitir un intervalo de versiones de SDK o CLI antes compatible

Obligatorio:
- anunciar el cambio en las notas de publicación al menos una versión menor
  antes de publicar la mayor
- cuando sea viable, distribuir la interfaz nueva junto a la antigua en una
  versión menor anterior para permitir migrar antes de la mayor
- documentar la ruta en la [guía de migración](/docs/migration) antes de publicar

## Campos solo de diagnóstico y campos garantizados {#diagnostic-only-versus-guaranteed-fields}

Cada campo de una interfaz `stable` o `frozen` es **garantizado** o **solo de
diagnóstico**. Tienen reglas de cambio diferentes:

- **Campos garantizados:** forman parte del contrato documentado. Los
  productores deben seguir emitiéndolos con la estructura documentada. Los
  consumidores pueden depender de su presencia y significado. Quitarlos o
  renombrarlos en una interfaz `stable` es un cambio mayor.
- **Campos solo de diagnóstico:** sirven para clasificación humana, depuración
  y observabilidad. Pueden añadirse, renombrarse o quitarse en cualquier versión
  menor. Deben marcarse `diagnostic_only: true` (o su equivalente en la página)
  donde se documenten. **Los consumidores no deben analizar, persistir ni tomar
  decisiones de producción basándose en campos de diagnóstico.**

Los consumidores antiguos deben ignorar los campos aditivos desconocidos de
una estructura `stable` o `frozen` (compatibilidad hacia delante). Los campos
obligatorios desconocidos deben provocar el rechazo de la operación. SDK y CLI
publican su comportamiento de compatibilidad hacia delante en sus documentos
de estabilidad.

## Matriz de compatibilidad {#compatibility-matrix}

Esta matriz operativa registra qué versiones de clientes se validan contra qué
manifiestos de protocolos del servidor. Los componentes la validan en ejecución
mediante `GET /api/cluster/info` y rechazan operar si los manifiestos no concuerdan.

### Última combinación reproducible validada {#last-qualified-reproducible-tuple}

La tabla muestra la combinación estable revisada seleccionada para estas guías
desde [`stable-releases.json`](/stable-releases.json). Cada componente se versiona
por separado. Una combinación compatible puede contener versiones distintas de
paquetes. Los informes de publicación y validación conservan las versiones y
huellas de imágenes exactas usadas en cada comprobación completada.

| Componente | Versión admitida | Identidad de instalación |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| Chart de Helm | `%%artifact.helmChartVersion%%` | `%%artifact.helmChartInstallIdentity%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Motor Workflow | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Operador Waterline | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| SDK PHP | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| SDK Python | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| SDK Rust | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

El Server seleccionado es el Server nativo 3.x. PHP Server 2.x está congelado en la versión 2.11.8 y no recibirá más publicaciones; las instalaciones PHP existentes pueden pasar al Server nativo con `upgrade-takeover` siguiendo el [runbook de toma de control nativa](%%artifact.serverTakeoverRunbookUrl%%). La toma de control está validada en la imagen publicada 3.0.4 dentro del alcance indicado en el runbook; es de un solo sentido y exige una copia de seguridad previa.

PHP Server 2.11.8 sigue sin parche para los avisos de Laravel de noviembre. Los despliegues fijados existentes deben seguir las [condiciones de exposición y acciones de retirada](./polyglot/server.md#retired-php-server-security); la evidencia histórica de takeover mantiene sus límites originales.

El `appVersion` registrado del chart de Helm es `%%artifact.helmChartAppVersion%%`, que coincide con el Server seleccionado, y el chart ejecuta el Server nativo de forma predeterminada. Su [comprobante de publicación](%%artifact.helmChartQualificationUrl%%) registra la ejecución de publicación del chart, los digests OCI/del paquete, la identidad del código fuente y una instalación en kind dentro de esa misma ejecución; no es una calificación en un clúster de producción. Consulte la [selección y actualización del chart](./deployment.md#helm-chart-selection) antes de instalar o sustituir la imagen.


PyPI muestra la versión de distribución de Python como
`%%artifact.pythonRegistryVersion%%`. La forma de instalación PEP 440 documentada
`%%artifact.pythonSdkVersion%%` resuelve a esa misma publicación. Esta
normalización no crea una segunda versión admitida.

La combinación seleccionada avanza después de validar los consumidores
afectados. Los registros publicados de Server y los inicios rápidos generados
usan los artefactos seleccionados. Los paquetes pueden publicarse de forma
independiente, verificando la compatibilidad mediante manifiestos de protocolos,
capacidades y comprobaciones de consumidores.

Los artefactos alfa y beta anteriores son históricos. No son alternativas de
instalación inicial, y se conserva el historial de publicaciones.

Cada componente estable sigue el versionado semántico. Se pueden distribuir
capacidades aditivas en versiones compatibles. Los cambios públicos
incompatibles requieren una versión mayor. Usa el descubrimiento en ejecución
para comprobar las capacidades disponibles en Server y los workers instalados
antes de activar una funcionalidad.

### Compatibilidad de protocolos en ejecución {#runtime-protocol-compatibility}

Las versiones superiores de los paquetes seleccionan la línea admitida. Los
manifiestos de protocolos aportan una segunda comprobación que rechaza operar
ante incompatibilidades:

| Cliente | Línea del producto | Plano de control | Protocolo predeterminado de registro de workers |
|--------|---------------|---------------|--------------------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | No aplicable |
| SDK PHP | `%%artifact.phpSdkVersion%%` | `2` | `1.20` |
| SDK Python | `%%artifact.pythonSdkVersion%%` | `2` | `1.20` |
| SDK Rust | `%%artifact.rustSdkVersion%%` | `2` | `1.20` |

Los SDK también permiten seleccionar explícitamente el protocolo de workers
`1.19` para un Server anterior compatible. La cancelación cooperativa requiere
`1.20`; seleccionar `1.19` no proporciona esa capacidad. Cada operación puede
usar su versión mínima de protocolo documentada, por lo que el valor
predeterminado de registro no implica que todas las peticiones de workers envíen
`1.20`.

El Server publicado actual anuncia la versión del protocolo de workers que
aparece en la tabla anterior de roles de autoridad. Acepta cabeceras de petición
de la misma versión mayor y una menor igual o inferior a la anunciada, y devuelve
la versión anunciada. Las cabeceras ausentes o malformadas, las versiones mayores
distintas y las menores por delante del servidor se rechazan. La CLI valida
`control_plane.version: "2"`.

El `version` superior del servidor identifica la compilación. Los clientes deben
usar los manifiestos `control_plane`, `worker_protocol`, `client_compatibility`
y `surface_stability_contract` de `GET /api/cluster/info` para negociar protocolos.

Workflow y Waterline deben usar versiones 2.x compatibles. El descubrimiento en
ejecución y las restricciones de paquetes delimitan la compatibilidad después de
la publicación estable.

### Ejemplos de validación en ejecución {#runtime-validation-examples}

Los SDK validan el descubrimiento antes de registrar un worker. Un servidor
incompatible produce un error de compatibilidad explícito en lugar de intentar
una ruta de una versión preliminar antigua. Todas las peticiones de workers
envían `X-Durable-Workflow-Protocol-Version`; las del plano de control envían
`X-Durable-Workflow-Control-Plane-Version: 2`.

Antes de promover una línea del producto, la validación debe partir de una
máquina limpia, instalar solo los artefactos publicados anteriores y completar
los recorridos de conformidad PHP, Python y Rust. Las copias del código fuente y
las sustituciones no publicadas no cuentan como evidencia de artefactos públicos.

Los metadatos de los paquetes estables y el descubrimiento en ejecución definen
ahora el límite de compatibilidad 2.x admitido. La validación sigue instalando
los artefactos públicos juntos antes de publicar, mientras que los parches y las
versiones menores siguen las reglas de versionado semántico siguientes.

### Progresión de publicaciones {#release-progression}

Los parches preservan los contratos estables documentados. Las versiones menores
pueden añadir campos, rutas, comandos, clases o parámetros opcionales con valores
predeterminados seguros. Los cambios incompatibles estables requieren una versión
mayor y una migración documentada. Las estructuras congeladas de eventos siguen
siendo decodificables indefinidamente. Una estructura nueva usa una primitiva
paralela, sin modificar un evento existente.

Cada publicación debe mantener sincronizados los metadatos de paquetes, las
notas de publicación, los comandos de instalación y los ejemplos entre lenguajes.

### Lista de revisión de publicaciones {#release-review-checklist}

- Confirma que el contrato legible por máquinas coincide con el manifiesto de
  estabilidad de interfaces de Workflow.
- Confirma que cada versión de SDK seleccionada pasa contra el Server seleccionado.
- Confirma que los ejemplos de instalación usan el canal estable.
- Confirma que los metadatos identifican la publicación exacta del SDK y las
  versiones de protocolos. Registra las validaciones posteriores de Server en
  la evidencia de compatibilidad.
- Confirma que la conformidad con artefactos publicados desde una máquina limpia
  pasa en PHP, Python y Rust.
- Confirma que las notas describen las incorporaciones posteriores a la base y
  no presentan versiones preliminares antiguas como opciones admitidas.

## Véase también {#see-also}

- [Configuración de Server](/docs/polyglot/server): despliegue del servidor independiente
- [Referencia de la API de Server](/docs/polyglot/server-api-reference): `GET /api/cluster/info` y manifiestos de protocolos
- [SDK PHP](/docs/polyglot/php): cliente y worker PHP
- [SDK Python](/docs/polyglot/python): cliente y worker Python
- [SDK Rust](/docs/polyglot/rust): cliente y worker Rust
- [CLI](/docs/polyglot/cli): interfaz de línea de comandos
- [Guía de migración](/docs/migration): migración de v1 a v2
- [`docs/api-stability.md` del workflow PHP](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md): estabilidad del paquete Workflow PHP
