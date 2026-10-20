---
sidebar_position: 19
title: Suite de conformidad de la plataforma
description: Autoridad pública del manifiesto, catálogo de casos de prueba, reglas del ejecutor y controles de publicación de la suite de conformidad Durable Workflow v2.
tags:
  - compatibility
  - conformance
  - protocols
  - api-stability
keywords:
  - suite de conformidad de la plataforma
  - ejecutor de conformidad
  - casos de prueba de conformidad
  - compatibilidad de durable workflow
  - platform-conformance-contract
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import platformConformanceContract from '@site/static/platform-conformance-contract.json';

# Suite de conformidad de la plataforma {#platform-conformance-suite}

Esta página es la autoridad pública de la **suite de conformidad de la
plataforma** Durable Workflow. Define la matriz de objetivos, catálogo reutilizable
de casos de prueba, contrato del ejecutor, reglas de éxito/fallo y controles de
publicación para implementaciones que afirman compatibilidad con Durable Workflow v2.

<PublicAuthorityIdentity
  manifest={platformConformanceContract}
  manifestUrl="https://durable-workflow.github.io/platform-conformance-contract.json"
/>

El servidor independiente anuncia el mismo manifiesto en `GET /api/cluster/info`
bajo `platform_conformance_suite`. El catálogo de
[especificaciones de protocolos de la plataforma](/docs/platform-protocol-specs)
identifica ese manifiesto anidado como familia de objetos
`platform_conformance_suite_manifest` en `cluster_info_envelope`.

La suite está subordinada a la autoridad de
[compatibilidad de versiones](/docs/compatibility). Sus familias de interfaces
y reglas de estabilidad deben coincidir con ese contrato. La autoridad de
compatibilidad define el contrato; esta página, cómo demostrar que se cumple.

<WorkerProtocolAuthorityRoles />

## Autoridades públicas de conformidad {#public-conformance-authorities}

La suite registra autoridades estables legibles por máquinas mediante identidad
de esquema y URL pública. La del SDK PHP independiente del framework se publica
como [`durable-workflow.v2.php-sdk-conformance-contract`](pathname:///platform-conformance/php-sdk-conformance.json).
Declara topología de paquetes publicados, escenarios y evidencia necesarios, e
identificadores públicos de ejecutor y esquema de resultados para evaluar
`durable-workflow/sdk` contra Server publicado.

## Matriz de objetivos {#target-matrix}

Un **objetivo** es un tipo de implementación que puede afirmar compatibilidad.
Una implementación puede cubrir varios. Por ejemplo, el servidor independiente
declara `standalone_server`, `worker_protocol_implementation` y
`repair_actionability_surface`.

| Objetivo | Familias de interfaces obligatorias | Categorías de casos obligatorias |
| --- | --- | --- |
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `embedded_engine` | `history_event_wire_formats` | `history_replay_bundles` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |
| `prerelease_release_candidate` | `server_api`, `official_sdks`, `cli_json`, `waterline_api`, `cluster_info_manifests` | `skew_refusal_matrix_contract`, `workflow_update_runtime_contract`, `principal_attribution_contract`, `prerelease_readiness_contract` |


Los objetivos son estables. Añadir uno, añadirle una interfaz o categoría
obligatoria, promover una categoría provisional a obligatoria, cambiar
`operations` o `pass_criteria` de un escenario estable, cambiar sus requisitos
públicos (`artifact_policy`, `common_result_evidence`, `required_matrix`,
`scenario_requirements` o `host_runner_contract`) o una regla de éxito/fallo es
un cambio del contrato y exige incrementar la versión del manifiesto.

## Catálogo de casos de prueba {#fixture-catalog}

Cada fuente estable es un artefacto público con tres vínculos legibles por
máquinas: `artifact_id`, `resolver_url` y `sha256`. Los identificadores de
artefactos de ejecución terminan en la versión de la suite; los de protocolo,
en la versión del catálogo de protocolos. Se resuelve obteniendo `resolver_url`
y aceptando los bytes solo si su huella SHA-256 coincide con la del catálogo.

| Categoría | Estado | Autoridad resoluble por el consumidor |
| --- | --- | --- |
| `control_plane_request_response` | `stable` | [`durable-workflow.v2.control-plane-api@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/control-plane-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-api@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-stream@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-stream.asyncapi.yaml) |
| `signal_query_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/signal_query_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/signal-query-runtime-scenarios.json) |
| `workflow_update_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/workflow_update_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/workflow-update-runtime-scenarios.json) |
| `search_attribute_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/search_attribute_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/search-attribute-runtime-scenarios.json) |
| `schedules_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/schedules_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/schedules-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/history_replay_bundles@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/replay-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.history-event-payloads@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/history-event-payloads.schema.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.replay-bundle@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/replay-bundle.schema.json) |
| `namespace_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/namespace_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/namespace-runtime-scenarios.json) |
| `child_workflow_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/child_workflow_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/child-workflow-runtime-scenarios.json) |
| `worker_versioning_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/worker_versioning_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/worker-versioning-runtime-scenarios.json) |
| `saga_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/saga_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/saga-runtime-scenarios.json) |
| `migration_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/migration_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/migration-runtime-scenarios.json) |
| `skew_refusal_matrix_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/skew_refusal_matrix_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/skew-refusal-matrix-scenarios.json) |
| `prerelease_readiness_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/prerelease_readiness_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/prerelease-readiness-scenarios.json) |
| `failure_repair_actionability` | `stable` | [`durable-workflow.v2.repair-actionability-objects@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/repair-actionability-objects.schema.json) |
| `cli_json_envelopes` | `stable` | [`durable-workflow.cli.output-schema-manifest@3`](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) |
| `principal_attribution_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/principal_attribution_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/principal-attribution-scenarios.json) |


La fila conserva la revisión de esquema CLI v3 como evidencia histórica
inmutable. El contrato CLI actual es el conjunto cerrado
[`durable-workflow.cli.output-schema-manifest@4`](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json),
que publica campos de cargas exclusivamente Avro sin reescribir bytes v2 o v3.

El objetivo actual de protocolo de workers usa los bytes del protocolo 1.19
neutrales respecto al ciclo de vida registrados por
`durable-workflow.v2.worker-protocol-api@catalog-16` y
`durable-workflow.v2.worker-protocol-stream@catalog-16`. Las revisiones 1.15 a
1.18 siguen en las URL versionadas conservadas por el historial. No sustituyen
la autoridad actual sin versión del protocolo de Server publicado. Los bytes
anteriores con redacción beta solo permanecen como vínculo expresamente histórico
[`durable-workflow.v2.worker-protocol-api@catalog-16-beta-history`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/static/platform-protocol-specs/worker-protocol-api.openapi.yaml)
registrado en el manifiesto.

`waterline_observer_envelopes` y `mcp_discovery_envelopes` siguen en estado
`provisional`. Sus ubicaciones previstas en el código no son normativas. Los
ejecutores no deben resolverlas como casos de prueba ni usarlas para afirmar
conformidad estable.

## Autoridad de publicación del ciclo de vida de workflows {#workflow-lifecycle-release-authority}

La autoridad exacta de escenarios de ciclo de vida publicados está
[publicada en JSON](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json).
Registra los requisitos ejercitados en el límite de publicación actual de
Server, SDK PHP y SDK Rust.

La partición PHP instala el `durable-workflow/sdk` exacto de la combinación
actual desde Packagist en un proyecto Composer desechable. Ejecuta cliente y
worker PHP separados contra la imagen pública correspondiente, registra la
distribución Packagist y procedencia de `apache/avro` oficial y debe indicar
`local_product_source_checkouts_used=false`.

La partición Rust instala el crate exacto de la combinación desde crates.io y
registra origen de registro y suma de comprobación de ese crate y `apache-avro`
oficial. La prueba de cargas usa el sobre Avro publicado del SDK respaldado por
`apache-avro`. Un códec propio o código local de producto no son procedencia aceptable.

Rust debe ejecutar y registrar todas estas celdas:

- `instance_cancel` e `instance_terminate` mediante comandos públicos del SDK.
- `selected_run_guard` y `stale_run_rejection` para no confundir la ejecución
  seleccionada con la actual de la instancia.
- `typed_failed`, `typed_cancelled`, `typed_terminated` y `typed_timed_out` como
  resultados terminales tipados con identidad de workflow y ejecución.
- `cancellation_heartbeat` y `late_activity_completion_refused` para que la
  actividad observe cancelación y una finalización tardía no sobrescriba el resultado.
- `worker_restart_during_cancellation` mientras queda pendiente resolver la
  cancelación, demostrando que un reemplazo no reclama la actividad cerrada.

El manifiesto exige también versiones exactas, identidad de clúster, procedencia,
identidades de workflow, resultados por celda, motivos estables, contrato de
carga, topología del ejecutor, versión del contrato de partición Rust, identidad
del ejecutor y código de salida. Evidencia Rust ausente, no admitida, bloqueada
o fallida no satisface la categoría de ciclo de vida.

Una categoría es obligatoria solo si el objetivo la enumera y no es
`provisional`. Las provisionales emiten advertencias informativas y solo son
vinculantes al promoverse a `stable` en otra versión de la suite.

`signal_query_runtime_contract` es estable. Su resultado debe registrar versiones
concretas fijadas de artefactos publicados y todos los escenarios como `pass`,
`fail`, `unsupported`, `not_covered` o `runner_blocked`, con hallazgos enlazados.
Marcadores sin resolver como `latest`, `current`, `head`, `<latest>`, `${VERSION}`
o `{{ version }}` fallan el control de resultados. Solo cuentan celdas `pass`:
`published_artifact_install_only`,
`python_worker_cli_and_sdk_baseline`, `php_worker_cli_and_sdk_baseline`,
`python_worker_php_facing_and_cli_clients`,
`php_worker_python_and_cli_clients`,
`rust_worker_rust_php_python_clients`, `python_worker_rust_client`,
`php_worker_rust_client`, `rust_query_error_and_immutability`,
`ordered_signal_delivery`,
`dedup_contract_observation`, `signal_during_replay`,
`query_during_replay`,
`rust_replayed_instance_state_query_after_cold_restart`,
`completed_run_signal_and_query`,
`unknown_signal_and_query_errors`,
`malformed_signal_and_query_payloads` y
`waterline_operator_visibility`.

Los identificadores y criterios se publican en el manifiesto de escenarios
[`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json).
Las pruebas de implementación pueden ejercitarlos, pero no son fuentes estables
de casos de prueba para ejecutores externos.

Las celdas Rust instalan de crates.io la versión exacta `durable-workflow` del
manifiesto y registran origen Cargo y suma del SDK y su dependencia `apache-avro`.
El transporte de consultas derivadas de instantáneas se evalúa con
`rust_worker_rust_php_python_clients` y `rust_query_error_and_immutability`.
No es estado de instancia reproducido. La celda separada
`rust_replayed_instance_state_query_after_cold_restart` usa
`register_replayed_workflow` y `register_replayed_query`, inicia otro proceso tras
parada completa, restaura historial duradero y compara estado activo, restaurado
y completado mediante clientes Rust, PHP y Python. Las secuencias de consulta
correctas y fallidas capturan recuentos de historial y comandos antes de la
primera consulta medida correcta y deben dejarlos intactos.

En `completed_run_signal_and_query`, una ejecución completada correctamente con
manejador declarado reproducible debe devolver su estado final por cada
interfaz pública de consulta declarada. Los errores estables de estado terminal
solo valen para estados expresamente no admitidos o manejadores no disponibles.
Un error terminal genérico para una ejecución completada reproducible no pasa.

`workflow_update_runtime_contract` es una categoría estable. Exige artefactos
publicados, versiones fijadas de Server, CLI, SDK Python, SDK PHP y Waterline,
declarar si se usó código fuente local y registrar todos los escenarios de
actualización como `pass`, `fail`, `unsupported`, `not_covered` o `runner_blocked`
con hallazgos enlazados. La evidencia satisfactoria debe ejercitar control,
historial, CLI/SDK e interfaces para operadores públicos; código local no cuenta.

Los escenarios obligatorios cubren instalación publicada, visibilidad del
contrato declarado, aceptación en control e historial, visibilidad de operador
en ejecución o espera, resultado completado de ida y vuelta, fallo o rechazo,
duplicados e idempotencia, rechazo de actualización desconocida o entrada
inválida, sobres de carga, workflows terminales, atribución de identidad
autenticada, paridad cliente/worker PHP y Python y diagnósticos. Si falta soporte
de actualizaciones de primera clase en un SDK, registra una celda no admitida
tipada y un hallazgo específico, sin omitir el lenguaje.

Los identificadores y criterios están en
[`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json).
El traspaso actual al ejecutor anfitrión está deliberadamente `runner_blocked`
hasta que uno registrado instale los artefactos fijados y ejecute toda la matriz.

`search_attribute_runtime_contract` es estable. Exige artefactos publicados e
inicio/actualización de atributos en PHP y Python, consultas y errores CLI,
visibilidad Waterline, cargas entre lenguajes, consultas de igualdad/rango/bool,
gramática OR/NOT, pertenencia a listas keyword, seguridad de tipos, distribución
de latencia de indexación, latencia bajo carga, aislamiento de namespace, rechazo
de nombres reservados y protección ante inyección. Un subconjunto básico
Python/Server no es conforme hasta registrar cada celda como `pass`, `fail`,
`unsupported`, `not_covered` o `runner_blocked`, con hallazgos. Solo cuenta `pass`.

Identificadores y criterios:
[`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json).

`schedules_runtime_contract` es estable. Con artefactos publicados debe cubrir
cadencia cron y de tasa fija, lista y detalle, ventanas de pausa/reanudación sin activaciones,
eliminación que detiene activaciones futuras, política de activaciones perdidas,
supervivencia a reinicio, operaciones CLI y SDK Python y orientadas a PHP,
programaciones Python que activan PHP y viceversa, rechazo de cron inválido y
tipos de workflow inexistentes. Un subconjunto básico no es conforme hasta
registrar cada celda como `pass`, `fail`, `unsupported`, `not_covered` o
`runner_blocked` con hallazgos. Solo cuenta `pass`.

Identificadores y criterios:
[`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json).

`history_replay_bundles` también es estable. Con artefactos publicados debe cubrir
reproducción PHP/Python de historiales completados, reinicio de worker,
actividad, señal/actualización, condición de espera, marcador de versión,
compensación de saga, rechazo de divergencia de código, mutación de historial en
servidor e historial malformado y temporización de reinicio con señal en curso.
Un subconjunto básico de historiales de referencia no es conforme hasta registrar
cada celda como `pass`, `fail`, `unsupported`, `not_covered` o `runner_blocked`
con hallazgos. Solo cuenta `pass`.

Identificadores y criterios:
[`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json).

`namespace_runtime_contract` es estable. Con artefactos publicados cubre
creación/actualización/detalle/listado, limpieza y recreación, aislamiento de
visibilidad y mutaciones, colas de workers PHP, contexto CLI y ámbito
predeterminado, selección de namespace entre SDK, aislamiento de esquema y
consultas de atributos y programaciones, visibilidad Waterline/operador,
llamadas Nexus explícitas entre namespaces, nombres reservados y enrutamiento
del registro de resultados para hallazgos. Un subconjunto no es conforme hasta
registrar cada celda como `pass`, `fail`, `unsupported`, `not_covered` o
`runner_blocked` con hallazgos. Solo cuenta `pass`.

Las notas de implementación no normativas de visibilidad de operador pueden
proceder del artefacto Waterline publicado o una partición específica. Son
útiles capturas acotadas de listas y detalle, programaciones si existen,
atributos de búsqueda, ámbito del panel, estadísticas API y veredicto documentado
de vistas predeterminadas o sin ámbito anunciadas. Los criterios normativos
siguen siendo los de `waterline_operator_namespace_visibility` siguiente.

Identificadores y criterios:
[`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json).

`child_workflow_runtime_contract` es estable. Con artefactos publicados cubre
padre/hijo en PHP y en Python, PHP a Python y viceversa, tipos de fallo del hijo
de ida y vuelta, propagación de cancelación del padre, cancelación directa del
hijo observada por el padre, reinicio de worker padre mientras espera,
paralelismo de cinco hijos y comportamiento de namespaces. Un ejemplo básico
padre/hijo no es conforme hasta registrar cada celda como `pass`, `fail`,
`unsupported`, `not_covered` o `runner_blocked` con hallazgos. Solo cuenta `pass`.

Identificadores y criterios:
[`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json).

`saga_runtime_contract` es estable. Con artefactos publicados cubre avance
correcto, fallo tardío con compensación inversa, fallo temprano sin compensación
extra, idempotencia de reintentos de compensación, fallo terminal visible,
reinicio a mitad de compensación, workflow PHP a compensación Python y viceversa,
errores tipados de ida y vuelta y estado de compensación en curso visible al
operador. Una prueba de un solo camino correcto o SDK no es conforme hasta
registrar cada celda como `pass`, `fail`, `unsupported`, `not_covered` o
`runner_blocked` con hallazgos. Solo cuenta `pass`. PHP se identifica como
`workflow-php` en la matriz y también puede registrarse como `workflow` al comparar
el conjunto de artefactos de publicación.

Identificadores y criterios:
[`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json).

`worker_versioning_runtime_contract` es estable. Con artefactos publicados cubre
registro por build-ID, visibilidad del despliegue, drenaje/reanudación,
compatibilidad fijada por ejecución, reproducción solo compatible, enrutamiento
de nuevos inicios a versión promovida, reproducción tras expulsar caché,
diagnósticos sin worker compatible, visibilidad CLI/Waterline, fijación entre
PHP y Python, comportamiento adversarial sin incremento de versión y versiones
fijadas de API de historial. Un subconjunto no es conforme hasta registrar cada
celda como `pass`, `fail`, `unsupported`, `not_covered` o `runner_blocked` con
hallazgos. Solo cuenta `pass`.

La evidencia PHP/Python debe registrar identidades de entorno de workers,
identificadores de workflow/ejecución, estado de despliegue de cola, resultados
públicos de sondeo y despliegue usados para verificar la fijación, origen y
versión de instalación del artefacto publicado y ausencia de código local del producto.

Identificadores y criterios:
[`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json).

`migration_runtime_contract` es estable. Con artefactos publicados cubre el
estado inicial de la última v1 admitida, pasos documentados, conservación y
reproducción de historiales completados, progreso en curso, reintentos a mitad
de actividad, esperas de señal/temporizador, cadencia de programaciones,
proyección de registro de workers, visibilidad Waterline, acceso CLI a estado
previo, inicios v2, reversión consciente de colas y rechazo explícito de
versiones incompatibles. La evidencia de reversión debe inventariar trabajos v1
listos, diferidos y reservados, indicar si se drenó, capturó SQL y colas
coherentemente o se aceptó pérdida, y demostrar una activación ejecutable de cola
o señal para cada fila no terminal restaurada. Un `pending` antiguo elegible
solo puede usar Watchdog v1.0.77 si se observa al bucle despachar el Watchdog
habilitado por defecto, a este redespachar tras cinco minutos y a la fila avanzar
en su cola registrada. Esto no sustituye colas de reintentos, temporizadores ni
`waiting`/`running`. Restaurar solo SQL pasa como evidencia solo si no existe
otra ejecución v1 no terminal dependiente de cola en el punto de recuperación.
El manifiesto debe registrar solo referencia y versión de `APP_KEY` en el gestor
de secretos; clave y credenciales de recuperación se protegen por separado de
SQL y copias de colas. Una instalación nueva básica o una migración sin estado
v1 realista no es conforme hasta registrar cada celda como `pass`, `fail`,
`unsupported`, `not_covered` o `runner_blocked` con hallazgos. Solo cuenta `pass`.

La celda de pasos documentados debe registrar la lista de comandos de la guía
pública actual, los ejecutados en su orden, códigos de salida y tiempos por
comando. Las instantáneas anteriores y posteriores deben incluir historial
completado, workflow en curso, actividad reintentando, espera de señal o
temporizador, programación y registro de worker observados.

Identificadores y criterios:
[`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json).

`skew_refusal_matrix_contract` es estable. Con artefactos publicados cubre
combinaciones compatibles, versiones anteriores, posteriores y fuera de ventana
para CLI, SDK Python, worker SDK PHP independiente y Waterline. Workflow solo
aparece como motor de Laravel integrado y Waterline. Debe probar límites de
versiones futuras, capturar peticiones/respuestas de cada operación divergente,
clasificar workers como `register_refused`, `register_and_serve` o
`register_and_drop`, y Waterline como `banner`, `render_refused` o `stale_render`.
Un subconjunto de manifiestos no es conforme hasta registrar cada celda como
`pass`, `fail`, `unsupported`, `not_covered` o `runner_blocked` con hallazgos.
Solo cuenta `pass`. `register_and_drop` y `stale_render` sin advertencia explícita
son defectos bloqueantes del producto.

Identificadores y criterios:
[`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json).

`principal_attribution_contract` es estable. Con artefactos publicados debe
demostrar que el historial registra identidades derivadas del servidor para
inicio, señal, consulta, cancelación, finalización, fallo, anonimato y eventos
originados en servidor. Debe ejercitar suplantación adversarial de cargas y
cabeceras, identidades alice/bob, rotación de credenciales, visibilidad CLI y
Waterline e inicios o señales autenticados desde SDK Python y PHP
`DurableWorkflow\Client`. Las celdas SDK registran versión, salidas, muestras
de identidades de historial/API e identidades de referencia HTTP para comparar
estructura e identificadores esperados. PHP debe resolver `durable-workflow/sdk`
como distribución Packagist exacta y registrar tipo, URL y referencia dist.
`durable-workflow/workflow` se resuelve aparte solo para el motor integrado y
Waterline. Un subconjunto de tokens por rol no es conforme hasta registrar cada
escenario como `pass`, `fail`, `unsupported`, `not_covered` o `runner_blocked` con
hallazgos.

Identificadores y criterios:
[`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json).

`prerelease_readiness_contract` es una categoría estable de la candidata
coordinada 2.0. Solo admite artefactos publicados y documentación pública para
usuarios, exige veredictos GO / NO-GO separados de Workflow y Waterline y cubre
funcionalidad básica completa, migración preparada, estabilidad API, exactitud
documental, configuración comprensible y compatibilidad. Evalúa Server, CLI,
SDK PHP/Python/Rust, Workflow, Waterline, sample-app y documentación como una
combinación del ecosistema. Debe ejecutar cada inicio rápido independiente 2.0
versionado y el recorrido Laravel integrado desde documentación pública actual
hasta workflows completados observables en 10 minutos, registrando comandos,
salidas, versiones, procedencia y tiempos reales exactos. Comprobar solo
descubrimiento no es conforme hasta registrar los escenarios PHP, Python, Rust
y Laravel como `pass`, `fail`, `unsupported`, `not_covered` o `runner_blocked`.
Cualquier artefacto ausente, guía obsoleta, paso no documentado, fallo de
instalación, inestabilidad API, riesgo de incompatibilidad entre componentes o
discordancia de canal se registra como celda no satisfactoria con hallazgo.
Evidencia solo del ejecutor no es conforme ni permite dar por lista la versión
preliminar.

Identificadores y criterios:
[`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json).
El [inicio rápido 2.0](/docs/quickstart/) conciso es la ruta pública de incorporación.

## Reglas de éxito y fallo {#pass--fail-rules}

1. **`guaranteed_field_equality`.** Cada campo garantizado del esquema debe
   estar presente con tipo y valor correctos en la respuesta. Se ignoran los
   campos solo diagnósticos.
2. **`unknown_additive_fields_tolerated`.** Los campos extra solo pasan si están
   documentados como diagnósticos o el nivel de estabilidad permite evolución aditiva.
3. **`frozen_shape_exact_match`.** Los casos de familias `frozen` deben coincidir
   exactamente. Una discrepancia de estructura congelada siempre falla.
4. **`required_fixtures_must_pass`.** Una publicación debe superar todas las
   categorías obligatorias de cada objetivo declarado. Una sola obligatoria
   fallida impide conformidad para ese objetivo.
5. **`stable_runtime_scenario_coverage`.** Una categoría estable debe informar
   cada escenario obligatorio con los estados de su manifiesto: `pass`, `fail`,
   `unsupported`, `not_covered` o `runner_blocked`. La conformidad completa exige
   todos satisfactorios. Subconjuntos básicos, omisiones, interfaces públicas no
   admitidas o celdas sin cubrir o bloqueadas no son conformes y deben enlazar el
   hallazgo responsable. Este conjunto de estados y regla de solo éxitos son
   semántica de la suite 5 y posteriores.
6. **`provisional_categories_warn_only`.** Un caso provisional fallido emite
   advertencia y no bloquea la publicación.
7. **`diagnostic_only_mismatches_pass`.** Si solo difieren campos diagnósticos,
   se registra la diferencia en `diagnostic_diff` y el caso pasa.

El resultado declara uno de cuatro niveles:

| Nivel | Significado |
| --- | --- |
| `full` | Pasan todos los casos obligatorios de todos los objetivos declarados. |
| `partial` | Pasan todos los obligatorios de al menos un objetivo, pero falla otro declarado. |
| `provisional` | Solo fallan categorías provisionales; pasan todas las obligatorias. |
| `nonconforming` | Falla al menos un caso obligatorio en cada objetivo declarado. |

## Contrato del ejecutor de pruebas {#harness-contract}

Un ejecutor conforme:

- carga el manifiesto desde `platform_conformance_suite` de
  `GET /api/cluster/info` o su copia estática para pruebas sin conexión;
- carga cada caso desde su ruta de referencia;
- ejercita la implementación mediante la operación documentada;
- compara respuestas según las reglas anteriores;
- emite un resultado por ejecución con esquema
  `durable-workflow.v2.platform-conformance.result`, versión de suite, identidad
  de implementación, resultados por caso, diferencias diagnósticas y nivel global;
- sale con código distinto de cero si y solo si el nivel es `nonconforming`.

El documento de resultados es un artefacto. La afirmación de compatibilidad solo
vale si se produjo contra la compilación y versión de suite identificadas por
esa compilación.

## Controles de publicación {#release-gates}

| Publicación | Objetivos obligatorios declarados | Artefacto obligatorio |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | Documento de resultados adjunto a la publicación. |
| `durable-workflow/workflow` | `embedded_engine` | Documento de resultados adjunto a la publicación. |
| `durable-workflow/sdk` | `official_sdk`, `worker_protocol_implementation` | Documento de resultados adjunto a la publicación. |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | Documento de resultados adjunto a la publicación. |
| `dw` | `cli_json_client` | Documento de resultados adjunto a la publicación. |
| `waterline` | `waterline_contract_surface` | Documento de resultados adjunto a la publicación. |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | El registro de conformidad conserva el resultado de preparación preliminar con artefactos publicados. |

Los revisores confirman resultado adjunto, nivel `full` o `provisional` y versión
de suite coincidente con la expuesta por la compilación probada. `nonconforming`
bloquea la publicación.

## Comprobación de publicación {#release-check}

`scripts/check-platform-conformance-authority.js` falla la compilación si el
manifiesto estático apunta a autoridad ausente, local, basada solo en un alias
de versión o fuera del sitio documental. También valida cada `authority_doc`
estable como URL canónica de documentación actual y rechaza árboles fuente
relativos, casos de prueba, documentación o directorios de esquema del
repositorio, identificadores sin versión, resolutores privados y huellas
incorrectas en todas las categorías estables. Las categorías de ejecución
deben exponer además un manifiesto público vinculado a la suite. La comprobación
exige que esta página enumere esquema, objetivos, categorías, reglas y controles
de la copia legible por máquinas.

Al cambiar la suite, actualiza juntos esta página y
`static/platform-conformance-contract.json`. Si añades objetivos o categorías
obligatorias, promueves categorías, cambias `operations` o `pass_criteria`
estables, requisitos públicos (`artifact_policy`, `common_result_evidence`,
`required_matrix`, `scenario_requirements` o `host_runner_contract`) o reglas,
incrementa la versión en el mismo cambio de publicación. La comprobación fija
criterios y requisitos públicos mediante huellas por versión para que ejecutores
externos no observen nuevos criterios o requisitos de evidencia bajo una suite antigua.

Las entradas publicadas de huellas de criterios y requisitos son de solo adición.
Para cambiar `operations` o `pass_criteria` estables, deja intactas las entradas
`VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS`, aumenta la versión, actualiza el
manifiesto de escenarios y añade una huella de criterios para la suite nueva.
Para cambiar evidencia pública, política de artefactos, matriz, requisitos de
escenario o contrato de anfitrión, deja intactas las entradas
`VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS`, avanza la versión,
actualiza el manifiesto y añade la huella correspondiente. La comprobación
compara entradas publicadas de la rama destino con el cambio actual. Editar o
eliminar una antigua falla aunque la versión actual añada otra.
