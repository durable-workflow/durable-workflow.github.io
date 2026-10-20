---
sidebar_position: 19
title: Neutralidad de los SDK
description: Contrato permanente de independencia del lenguaje que permite implementar las interfaces públicas de Durable Workflow desde futuros SDK TypeScript, Go, Java o .NET sin rediseñar el protocolo.
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - neutralidad de los SDK
  - independencia del lenguaje
  - neutralidad del protocolo
  - neutralidad de códecs
  - SDK TypeScript
  - SDK Go
  - SDK Java
  - SDK dotnet
  - SDK Python
  - paquete de workflows PHP
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Neutralidad de los SDK {#sdk-neutrality}

Esta página es la guía para personas del contrato de neutralidad de los SDK
de toda la plataforma. Enumera las reglas mínimas de neutralidad que debe
cumplir cada interfaz pública de Durable Workflow y la auditoría permanente
de independencia del lenguaje que los revisores de publicaciones aplican a
las nuevas interfaces de Server, Workflow, CLI, Waterline y MCP.

La guía de arquitectura de origen se publica en
[`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md).
La autoridad consumible por máquinas se publica en este sitio en
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json), con el ID de
esquema `durable-workflow.v2.sdk-neutrality.contract`. Su autoridad sobre el
protocolo y el alcance de los SDK procede del JSON distribuido en el paquete
Composer Workflow en `resources/sdk-neutrality-contract.json`. La copia pública
añade metadatos actuales de distribución de paquetes desde la tupla centralizada
de artefactos de la documentación. El servidor independiente Durable Workflow
vuelve a exponer el manifiesto base del paquete en `GET /api/cluster/info`,
bajo `sdk_neutrality_contract`. Si esta página contradice el contrato JSON
publicado, prevalece el contrato JSON y la discrepancia es un error de documentación.

Este contrato depende de la autoridad de
[Compatibilidad de versiones](/docs/compatibility), que define *qué* interfaces
son públicas y *cómo* pueden cambiar, y del catálogo de
[Especificaciones de protocolos de la plataforma](/docs/platform-protocol-specs),
que define *dónde* está la especificación normativa de cada interfaz. Define
*qué estructura* pueden tener esas especificaciones para que un futuro SDK
fuera de los actuales PHP, Python y Rust pueda implementarlas sin necesitar
un rediseño del protocolo.

## Por qué existe {#why-this-exists}

Durable distribuye tres SDK independientes oficiales: el paquete PHP
`durable-workflow/sdk`, el paquete Python `durable_workflow` y el crate Rust
`durable-workflow`. El paquete PHP separado `durable-workflow/workflow` sigue
siendo el motor Laravel integrado y el responsable de la reproducción. No es
el SDK PHP independiente del framework. Crear o mantener una amplia gama de
SDK oficiales **no** es un objetivo de publicación. Todavía no se ha demostrado
demanda de SDK en los ecosistemas TypeScript, Go, Java y .NET, y mantener una
gama oficial extensa tiene un coste alto.

Este contrato protege frente a otro modo de fallo: que los contratos públicos
que usan esos SDK incorporen de forma inadvertida suposiciones específicas de
un lenguaje. Si en el futuro merece la pena crear un SDK TypeScript o Go, el
trabajo debe consistir en escribir un cliente nuevo para el protocolo de
transmisión publicado, sin tener que rediseñar el protocolo para permitir
que otro lenguaje lo utilice.

## Alcance {#scope}

| Clave de alcance | Significado |
| --- | --- |
| `goal` | Conservar la neutralidad de protocolos y contratos para que un futuro SDK TypeScript, Go, Java o .NET pueda existir sin rediseñar el protocolo. |
| `non_goal` | Publicar una amplia cartera de SDK oficiales. La variedad de SDK oficiales se mantiene limitada deliberadamente y crece solo cuando la demanda de adopción lo justifica. |
| `present_priority` | Python es actualmente la opción no PHP de mayor valor para los usuarios existentes y se trata como interfaz prioritaria para la cobertura de paridad. |
| `future_posture` | TypeScript, Go, Java, .NET y otros lenguajes dependen de la demanda. No tienen una publicación reservada, pero cada contrato público debe permitir escribir un futuro SDK en esos lenguajes sin romper el protocolo de transmisión. |

## Política de variedad de SDK oficiales {#official-sdk-breadth-policy}

La gama de SDK oficiales se mantiene limitada deliberadamente:

| Lenguaje | Criterio | Paquete publicado | Autoridad de conformidad |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), actores `sdk_php`, `php_sdk_client` y `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json), actor `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), actores `rust_sdk`, `rust_worker` y `rust_sdk_client` |
| TypeScript | `demand_driven` | Ninguno | Los contratos públicos deben seguir siendo implementables en TypeScript sin rediseñar el protocolo. |
| Go | `demand_driven` | Ninguno | Los contratos públicos deben seguir siendo implementables en Go sin rediseñar el protocolo. |
| Java | `demand_driven` | Ninguno | Los contratos públicos deben seguir siendo implementables en Java sin rediseñar el protocolo. |
| .NET | `demand_driven` | Ninguno | Los contratos públicos deben seguir siendo implementables en .NET sin rediseñar el protocolo. |

El contrato JSON enumera los `scenario_ids` exactos que constituyen la cobertura
de `first_party.php_sdk`, `first_party.python_sdk` y `first_party.rust_sdk`.
Registra el paquete Laravel por separado como
`embedded_engines.php_workflow_engine`, con cobertura de reproducción bajo el
actor `workflow_php_runtime`. Los consumidores pueden resolver directamente
esos identificadores en los catálogos enlazados sin clonar un repositorio de
SDK ni leer su suite de pruebas.

Se añade un SDK oficial nuevo solo cuando:

1. Hay demanda documentada de usuarios que los SDK existentes no pueden atender.
2. Un equipo candidato de mantenimiento se compromete a mantener el SDK en el
   banco de conformidad, el catálogo de especificaciones de protocolos y el
   manifiesto de autoridad de publicaciones.
3. Añadirlo no exige cambios incompatibles en el protocolo de workers, el plano
   de control, los formatos de transmisión de eventos de historial ni los
   fixtures de reproducción. Si los exige, el error está en el protocolo.

## Reglas de neutralidad {#neutrality-rules}

Cada contrato público de Durable debe cumplir las siete reglas siguientes.
El manifiesto JSON es la autoridad sobre las estructuras exactas de campos.
Los resúmenes sirven a los revisores. Cada regla del manifiesto JSON contiene
una línea `requirement`, `rationale` y `how_to_apply`, y una matriz `authority`.
Cada entrada de autoridad tiene un ID estable de catálogo o esquema y una URL
absoluta a su artefacto publicado.

| Regla | Requisito |
| --- | --- |
| `protocol_neutrality` | Las interfaces públicas de RPC y eventos usan estructuras HTTP+JSON o AsyncAPI que cualquier runtime con HTTP pueda producir y consumir. |
| `codec_neutrality` | Cada carga útil duradera que cruce un límite público anuncia `avro`. No se ofrece ningún otro códec v2 público ni específico del motor. |
| `error_shape_neutrality` | Los objetos públicos de fallo usan un sobre estructurado con `code`, `message` y `details` opcional. Los nombres de clases de excepción PHP y Python solo sirven para diagnóstico. |
| `type_identity_neutrality` | Los tipos de workflow, actividad, workflow hijo y excepción se identifican mediante nombres de cadena estables. Los FQCN de clases y las rutas de módulos facilitan la entrada a los SDK, pero no constituyen el contrato. |
| `replay_fixture_neutrality` | Los fixtures de reproducción y los paquetes de historial de referencia son JSON que cumple los esquemas publicados `history_event_payloads` y `replay_bundle`. |
| `discovery_neutrality` | Cada interfaz pública es accesible desde `GET /api/cluster/info` y el catálogo `platform_protocol_specs`. |
| `documentation_neutrality` | La documentación de contratos públicos describe estructuras mediante esquemas, rutas y semántica de campos. El comportamiento de clases PHP y Python aparece como ejemplos de SDK, no como contrato normativo. |

## Auditoría permanente de independencia del lenguaje {#standing-language-agnosticism-audit}

Cada interfaz nueva de Server, Workflow, CLI, Waterline o MCP debe superar la
auditoría de neutralidad antes de promoverse a `stable`. Es un punto permanente
de revisión en el PR de publicación de cualquier cambio que afecte a una familia
de interfaces incluida en el alcance de la auditoría. Estas familias son:

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

La lista tiene ocho pasos. Siete corresponden a las reglas de neutralidad
anteriores. El octavo, el **ejercicio mental del futuro SDK**, pide al revisor
describir en dos frases cómo un SDK TypeScript o Go consumiría la interfaz
nueva usando solo el catálogo de especificaciones publicado y herramientas
estándar HTTP+JSON. Si la respuesta requiere un SDK oficial, la interfaz no es
neutral: debe cambiar de estructura o registrar la carencia de neutralidad como
limitación conocida antes de la promoción.

## De qué depende un SDK futuro {#what-a-future-sdk-relies-on}

El contrato identifica las interfaces que un SDK futuro debe poder leer sin
inspeccionar el código fuente de ningún SDK oficial:

- **Protocolo**: `durable-workflow.v2.control-plane-api`,
  `durable-workflow.v2.worker-protocol-api` y
  `durable-workflow.v2.worker-protocol-stream` en el
  [catálogo de protocolos](https://durable-workflow.github.io/platform-protocol-specs.json) publicado.
- **Códecs**: el conjunto universal de códecs documentado en
  `durable-workflow.v2.worker-protocol-api` y anunciado mediante el esquema de
  descubrimiento `durable-workflow.v2.cluster-info-envelope`.
- **Estructura de errores**: el sobre de fallos del protocolo de workers y el
  esquema `durable-workflow.v2.repair-actionability-objects`.
- **Entradas de reproducción**: los JSON Schema
  `durable-workflow.v2.history-event-payloads` y
  `durable-workflow.v2.replay-bundle`, más los ID de escenarios del catálogo público
  [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json).
- **Descubrimiento**: `durable-workflow.v2.cluster-info-envelope` y el propio
  `durable-workflow.v2.platform-protocol-specs.catalog`.

Si alguna de estas interfaces no es accesible para un SDK candidato en un
lenguaje concreto, crear ese SDK requiere cambios de protocolo y no se está
cumpliendo la garantía de independencia del lenguaje.

## Controles de publicación {#release-gates}

Una publicación que introduce una familia nueva de interfaces públicas o
promueve una interfaz existente de `prerelease` o `experimental` a `stable`
debe registrar el resultado de la auditoría en el PR de publicación. La sección
de controles de publicación del manifiesto enumera las comprobaciones concretas:

- `audit_recorded`: la descripción del PR indica qué pasos de la auditoría se
  aplicaron y enlaza la entrada del catálogo de especificaciones de protocolos,
  el fixture de conformidad y la entrada de descubrimiento de la interfaz nueva.
- `no_php_or_python_only_required_fields`: ningún campo garantizado de una
  interfaz `stable` requiere un códec exclusivo de PHP o Python.
- `universal_codec_advertised`: la negociación del protocolo de workers
  anuncia exactamente un códec universal, `avro`.
- `fixture_schema_validated`: los fixtures nuevos de reproducción o paquetes
  de historial de referencia validan contra los JSON Schema publicados.
- `discovery_entry_present`: las interfaces públicas nuevas tienen una entrada
  en el catálogo `platform_protocol_specs` con `surface_family`, `owner_repo`
  y `format` no vacíos.

La aplicación de los controles se reparte entre máquinas y personas. El CI de
publicación resuelve todas las URL de autoridad, los ID de protocolo y esquema
y los ID de escenarios de conformidad del contrato público. Cruza el alcance
de la auditoría con las familias de estabilidad de interfaces y rechaza rutas
de autoridad locales del repositorio o símbolos de implementación. Los
revisores marcan la auditoría de neutralidad de SDK en cada PR de publicación
que añade o promueve una interfaz pública y siguen siendo responsables del
ejercicio mental del futuro SDK.

## Cambiar este contrato {#changing-this-contract}

Añadir una regla de neutralidad, hacer más estricta una regla existente, añadir
un paso obligatorio de auditoría, añadir una familia de interfaces a su alcance
o cambiar la política de variedad de SDK oficiales es un cambio de contrato.
Incrementa la versión del manifiesto, actualiza la guía de arquitectura y esta
página en el mismo cambio, y alinea el contrato consumible en
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json).
Eliminar una regla de neutralidad o un paso de auditoría es un cambio mayor.
