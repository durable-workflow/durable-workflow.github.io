---
sidebar_position: 18
title: Especificaciones de protocolos de la plataforma
description: Catálogo para consumidores de las especificaciones públicas OpenAPI, JSON Schema y AsyncAPI de Durable Workflow.
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - especificaciones de protocolos de la plataforma
  - catálogo de protocolos
  - openapi
  - asyncapi
  - json schema
  - especificación del plano de control
  - especificación del protocolo de workers
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Especificaciones de protocolos de la plataforma {#platform-protocol-specs}

El catálogo de protocolos de la plataforma indica a autores de SDK, agentes,
operadores y herramientas de terceros qué especificación legible por máquinas
rige cada interfaz pública de Durable Workflow.

Para automatización, usa el
[catálogo legible por máquinas](https://durable-workflow.github.io/platform-protocol-specs.json).
Cada entrada disponible proporciona un identificador de especificación estable
y una URL HTTPS pública que resuelve directamente a un artefacto OpenAPI,
AsyncAPI o JSON Schema.

Las rutas del repositorio, los símbolos de implementación y los casos de prueba
no constituyen una autoridad para los consumidores. Se excluyen del catálogo
publicado y se conservan únicamente como diagnósticos de validación.

## Identidad y descubrimiento del catálogo {#catalog-identity-and-discovery}

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

El catálogo también está disponible mediante:

- el catálogo JSON público en
  https://durable-workflow.github.io/platform-protocol-specs.json;
- platform_protocol_specs en GET /api/cluster/info del servidor independiente;
- esta guía 2.0, que aporta contexto para las personas.

La URL JSON es la referencia del catálogo consumible por máquinas. El servidor
vuelve a exponer el mismo catálogo para que los clientes descubran los protocolos
activos sin asumir una estructura de repositorio.

<WorkerProtocolAuthorityRoles />

## Campos para consumidores {#consumer-fields}

Cada entrada expone el siguiente contrato:

| Campo | Significado |
|---|---|
| spec_id | Identificador estable de protocolo de Durable Workflow. Los documentos publicados llevan la identidad correspondiente. |
| spec_url | URL HTTPS pública directa de la especificación legible por máquinas. |
| format | openapi, json_schema o asyncapi. |
| status | Indica si el artefacto referenciado está publicado, en desarrollo o planificado. |
| surface_family | Familia de la política de compatibilidad que rige la interfaz. |
| authority_manifest | Manifiesto de descubrimiento con el que un entorno de ejecución anuncia la interfaz. |
| owner_repo | Proyecto responsable de la especificación. |
| object_families | Nombres públicos de familias de objetos y sus proyectos responsables. |
| evolution_rule | Regla de compatibilidad para cambios aditivos e incompatibles. |
| breaking_change_release | Tipo de versión requerido por esa regla de evolución para un cambio incompatible. |

Los consumidores deben resolver spec_url y validar la identidad del documento
frente a spec_id. No necesitan acceso a una copia del código fuente.

## Especificaciones disponibles {#available-specifications}

Este inventario se genera desde el catálogo JSON público. La identidad,
disponibilidad, enlaces públicos y propiedad de las familias de objetos siguen
siendo datos del catálogo, sin crear una segunda autoridad en el texto.

<ProtocolCatalog />

### Notas sobre el entorno de sesiones de workers {#worker-session-runtime-notes}

Este esquema cubre el descubrimiento de capacidades de sesiones de workers,
los sobres de ciclo de vida, las instantáneas de afinidad de tareas y la
visibilidad para operadores. Su identificador estable es
durable-workflow.v2.worker-sessions-runtime.

### Notas sobre el entorno de actividades locales {#local-activity-runtime-notes}

Este esquema cubre el descubrimiento de capacidades de actividades locales,
las instantáneas de opciones, los marcadores del historial, la semántica de
reintentos y la visibilidad para operadores. Su identificador estable es
durable-workflow.v2.local-activity-runtime.

### Notas sobre el sobre de información del clúster {#cluster-info-envelope-notes}

Este esquema cubre GET /api/cluster/info y los manifiestos de descubrimiento
anidados disponibles en ese endpoint. Su identificador estable es
durable-workflow.v2.cluster-info-envelope.

## Formatos {#formats}

| Formato | Uso |
|---|---|
| OpenAPI 3.1 | Interfaces HTTP y JSON de petición-respuesta cuyas rutas, métodos, códigos de estado y sobres forman parte del contrato. |
| JSON Schema 2020-12 | Registros persistidos, cargas de eventos, sobres de resultados, opciones de ejecución y familias de objetos relacionadas. |
| AsyncAPI 2.6 o posterior | Semántica de sondeo, flujos, renovación de concesiones, orden y entrega. |

## Niveles de estado {#status-levels}

| Estado | Significado |
|---|---|
| published | La especificación pública legible por máquinas está disponible en spec_url y se puede consumir directamente. |
| in_progress | Hay una especificación pública disponible, pero su cobertura es parcial. Los campos y rutas enumerados son normativos. |
| planned | La entrada tiene una identidad estable en el catálogo, pero todavía no hay una especificación consumible. Las entradas planificadas no anuncian spec_url. |

## Reglas de evolución {#evolution-rules}

additive_minor_breaking_major permite cambios aditivos en versiones menores.
Las eliminaciones, cambios de nombre, restricciones de tipos y cambios
semánticos requieren una versión mayor y, cuando sea práctico, deben usar una
ruta o un campo en paralelo.

parallel_primitive_only rige los formatos de transmisión congelados. Una
estructura incompatible debe introducirse con un tipo de evento, tipo de
comando o identificador de esquema nuevo, manteniendo decodificable el original.

experimental_any_release se aplica solo a especificaciones expresamente
experimentales y permite cambios en cualquier versión.

## Validación de publicaciones {#release-validation}

El CI del sitio de documentación impone estas comprobaciones automáticas:

| Control | Qué comprueba el CI |
|---|---|
| catalog_aligned_with_surface_families | Cada entrada referencia una familia de compatibilidad pública declarada. |
| owner_repo_known | Los responsables de entradas y familias de objetos usan el vocabulario del catálogo. |
| format_known | Cada artefacto disponible se puede analizar con el formato que declara. |
| public_spec_references_resolve | Cada spec_url disponible es una URL HTTPS del espacio público de especificaciones de protocolos y resuelve a un artefacto distribuido cuya identidad coincide con spec_id. |
| repository_local_authority_fields_rejected | Las entradas publicadas no contienen rutas locales del repositorio, símbolos de implementación, referencias de pruebas ni campos de autoridad heredados. |
| workflow_package_mirror_aligned | El catálogo público coincide con el del paquete Workflow cuando esa entrada de publicación está disponible. |
| server_owned_spec_mirrors_aligned | Los artefactos publicados propiedad de Server coinciden con sus copias en el repositorio responsable cuando esas entradas están disponibles. |
| diagnostic_provenance_complete | La procedencia usada solo para validación cubre todas las entradas del catálogo y familias de objetos. |
| object_family_metadata_declared | Las entradas del catálogo y los documentos publicados coinciden en los nombres y responsables de las familias de objetos. |
| rendered_retrieval_surfaces_aligned | La página 2.0 generada y los paquetes completos de recuperación para modelos de 2.0 exponen la identidad de catálogo, URL pública y propiedad de familias de objetos de cada entrada disponible. |
| breaking_change_release_consistent_with_evolution_rule | Cada valor de versión para cambios incompatibles coincide con su regla de evolución. |
| deliverable_specs_published | Cada interfaz de plataforma requerida tiene una especificación publicada que se puede analizar. |

La comprobación carga el catálogo JSON público, valida su vocabulario y sus
referencias seguras para consumidores, analiza las especificaciones distribuidas,
comprueba los metadatos de familias de objetos y esquemas incrustados, y compara
las copias de los paquetes cuando están disponibles. Tras generar el sitio y
los paquetes para modelos, una comprobación semántica compara sus valores de
catálogo renderizados con la misma autoridad JSON. El texto de la documentación
y los encabezados no forman parte de la comparación.

Cuando cambie el contrato, actualiza juntos el catálogo del paquete Workflow,
esta copia JSON pública y los artefactos de especificaciones publicados afectados.
La revisión humana confirma que las explicaciones siguen siendo útiles sin
tratarlas como autoridad para las máquinas.

Continúa con la [suite de conformidad de la plataforma](/docs/platform-conformance)
para resolver los casos de prueba activos vinculados a bytes concretos que
ejercitan estas especificaciones. La suite identifica por separado la evidencia
histórica de casos de prueba, que no sustituye a la autoridad actual del catálogo.
