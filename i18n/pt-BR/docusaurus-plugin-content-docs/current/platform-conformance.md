---
sidebar_position: 19
title: Suíte de conformidade da plataforma
description: Referência pública oficial do manifesto da suíte de conformidade, catálogo de fixtures, regras do executor e critérios de liberação do Durable Workflow v2.
tags:
  - compatibilidade
  - conformidade
  - protocolos
  - estabilidade-da-api
keywords:
  - suíte de conformidade da plataforma
  - executor de conformidade
  - fixtures de conformidade
  - compatibilidade do durable workflow
  - platform-conformance-contract
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import platformConformanceContract from '@site/static/platform-conformance-contract.json';

# Suíte de conformidade da plataforma {#platform-conformance-suite}

Esta página é a referência pública oficial da **suíte de conformidade da
plataforma** Durable Workflow. Ela define a matriz de alvos de conformidade,
o catálogo de fixtures reutilizáveis, o contrato do executor, as regras de
aprovação e reprovação e os critérios de liberação para implementações que
declaram compatibilidade com o Durable Workflow v2.

<PublicAuthorityIdentity
  manifest={platformConformanceContract}
  manifestUrl="https://durable-workflow.github.io/platform-conformance-contract.json"
/>

O mesmo manifesto é anunciado pelo servidor independente em
`GET /api/cluster/info`, no campo `platform_conformance_suite`. O catálogo de
[especificações do protocolo da plataforma](/docs/platform-protocol-specs)
identifica esse manifesto aninhado como a família de objetos
`platform_conformance_suite_manifest` na especificação `cluster_info_envelope`.

A suíte depende da referência oficial de
[Compatibilidade de versões](/docs/compatibility). Ao enumerar uma família de
interfaces ou uma regra de estabilidade, a suíte deve corresponder ao contrato
de estabilidade dessas interfaces. A referência de compatibilidade define o
contrato; esta página define como uma implementação comprova que o segue.

<WorkerProtocolAuthorityRoles />

## Referências públicas oficiais de conformidade {#public-conformance-authorities}

Na suíte, referências estáveis legíveis por máquina são registradas por
identidade de schema e URL pública. A referência do SDK PHP independente de
framework é publicada como
[`durable-workflow.v2.php-sdk-conformance-contract`](pathname:///platform-conformance/php-sdk-conformance.json).
Ela declara a topologia dos pacotes publicados, os requisitos de cenários e
evidências e os identificadores públicos do executor e do schema de resultados
usados para avaliar `durable-workflow/sdk` contra o servidor independente publicado.

## Matriz de alvos {#target-matrix}

Um **alvo** de conformidade é um tipo de implementação que pode declarar
compatibilidade com o Durable. Uma implementação pode declarar mais de um
alvo. Por exemplo, o servidor independente declara `standalone_server`,
`worker_protocol_implementation` e `repair_actionability_surface`.

| Alvo | Famílias de interfaces obrigatórias | Categorias de fixtures obrigatórias |
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

Os alvos são estáveis. Adicionar um alvo, uma interface obrigatória a um alvo
existente ou uma categoria obrigatória de fixtures; promover uma categoria
provisória a obrigatória; alterar `operations` ou `pass_criteria` de cenários
estáveis de runtime; alterar um campo público de requisito desses cenários
(`artifact_policy`, `common_result_evidence`, `required_matrix`,
`scenario_requirements` ou `host_runner_contract`); ou alterar uma regra de
aprovação ou reprovação modifica o contrato da suíte e exige incrementar a
versão do manifesto.

## Catálogo de fixtures {#fixture-catalog}

Cada fonte estável é um artefato público com três vínculos legíveis por máquina
no catálogo da suíte: `artifact_id`, `resolver_url` e `sha256`. IDs de artefatos
de runtime terminam com a versão da suíte. IDs de artefatos de protocolo
terminam com a versão do catálogo de protocolos da plataforma. Um consumidor
resolve um artefato buscando sua `resolver_url` e aceitando os bytes somente
quando seu resumo SHA-256 corresponde ao vínculo do catálogo.

| Categoria | Status | Referência oficial resolvível pelo consumidor |
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

A linha da suíte retém a revisão v3 do schema da CLI como evidência histórica
imutável. O contrato atual da CLI é o conjunto fechado
[`durable-workflow.cli.output-schema-manifest@4`](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json),
que publica os campos de payload exclusivamente Avro sem reescrever os
bytes de v2 ou v3.

O alvo atual de protocolo de workers da suíte de conformidade usa os bytes
do protocolo 1.19 com terminologia neutra de ciclo de vida, registrados por
`durable-workflow.v2.worker-protocol-api@catalog-16` e
`durable-workflow.v2.worker-protocol-stream@catalog-16`. As revisões 1.15 a
1.18 continuam disponíveis nas URLs versionadas de resolução retidas pelo
histórico da suíte. Essas fixtures versionadas não substituem a referência
oficial atual e não versionada do protocolo publicado do Server. Os bytes
anteriores com terminologia beta continuam disponíveis apenas como o vínculo
explicitamente histórico
[`durable-workflow.v2.worker-protocol-api@catalog-16-beta-history`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/static/platform-protocol-specs/worker-protocol-api.openapi.yaml)
registrado no manifesto da suíte.

As categorias planejadas `waterline_observer_envelopes` e
`mcp_discovery_envelopes` permanecem `provisional`. Seus locais planejados na
árvore de fontes são marcadores não normativos: executores não devem resolvê-los
como fixtures nem usá-los para uma declaração estável de conformidade.

## Referência oficial de liberação do ciclo de vida de workflows {#workflow-lifecycle-release-authority}

A referência oficial exata dos cenários publicados de ciclo de vida de
workflows é [publicada em JSON](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json).
Ela registra os requisitos de ciclo de vida exercitados no limite de liberação
atual do servidor e dos SDKs PHP e Rust publicados.

A partição PHP instala do Packagist o pacote exato `durable-workflow/sdk`
indicado pela tupla atual de artefatos em um projeto Composer descartável.
Ela executa processos PHP separados de cliente e worker contra a imagem
pública correspondente do servidor, registra a distribuição do Packagist e
a procedência oficial de `apache/avro`, e deve informar
`local_product_source_checkouts_used=false`.

A partição Rust instala de crates.io o crate exato indicado pela tupla atual
de artefatos e registra a origem do registro e o checksum desse crate e do
crate oficial `apache-avro`. A prova de payload usa o envelope Avro publicado
do SDK, respaldado por `apache-avro`. Uma implementação personalizada de codec
ou um checkout local do produto não é uma procedência aceitável.

A partição Rust deve executar e relatar todas estas células:

- `instance_cancel` e `instance_terminate` pelos comandos públicos do SDK.
- `selected_run_guard` e `stale_run_rejection`, para que uma execução
  selecionada não seja confundida com a execução atual da instância.
- `typed_failed`, `typed_cancelled`, `typed_terminated` e `typed_timed_out`
  como resultados terminais tipados contendo a identidade do workflow e da execução.
- `cancellation_heartbeat` e `late_activity_completion_refused`, para que o
  código da atividade observe o cancelamento e uma conclusão tardia não
  sobrescreva o resultado terminal.
- `worker_restart_during_cancellation` enquanto a finalização do cancelamento
  ainda está pendente, comprovando que um worker substituto não reivindica
  novamente a atividade encerrada.

O manifesto também exige as versões exatas dos artefatos e do servidor,
identidade do cluster, procedência da instalação, identidades de workflows,
resultados por célula, motivos estáveis, contrato de payload, topologia do
executor, versão do contrato da partição Rust, identidade do runner e status
de saída da partição. Evidências Rust ausentes, não suportadas, bloqueadas
pelo runner ou malsucedidas não satisfazem a categoria de ciclo de vida.

Uma categoria de fixtures só é obrigatória para um alvo quando ele a lista
e o status da categoria não é `provisional`. Categorias provisórias emitem
avisos informativos e só passam a ser determinantes quando promovidas a
`stable` em uma versão posterior da suíte.

A categoria `signal_query_runtime_contract` é estável. Um resultado dessa
categoria deve registrar versões concretas e fixadas de artefatos publicados
e identificar cada cenário obrigatório como `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, com vínculos para os achados. Marcadores ou
tokens de versão não resolvidos, como `latest`, `current`, `head`, `<latest>`,
`${VERSION}` ou `{{ version }}`, reprovam o critério de resultado. Somente
células `pass` contam para aprovar uma categoria:
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
`malformed_signal_and_query_payloads`, and
`waterline_operator_visibility`.

Esses IDs de cenário e seus critérios de aprovação são publicados no
manifesto de cenários de runtime legível por máquina em
[`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json).
Testes de implementação podem exercitar os cenários, mas não são fontes
estáveis de fixtures para executores externos.

As células Rust instalam de crates.io a versão exata do crate
`durable-workflow` declarada pelo manifesto de cenários de runtime e registram
a origem do registro Cargo e o checksum tanto do SDK quanto da dependência
resolvida `apache-avro`. O transporte de consultas derivadas de instantâneos
é avaliado por
`rust_worker_rust_php_python_clients` e
`rust_query_error_and_immutability`. Isso não é estado da instância de workflow
reconstruído por replay. A célula separada
`rust_replayed_instance_state_query_after_cold_restart` usa
`register_replayed_workflow` e `register_replayed_query`, inicia um novo
processo de worker Rust após uma parada a frio, restaura o histórico durável
e compara o estado em andamento, restaurado e concluído por chamadores Rust,
PHP e Python. Tanto sequências de consultas bem-sucedidas quanto com falha
capturam as contagens de histórico e de comandos de workflow antes da primeira
consulta medida bem-sucedida e devem deixar essas contagens inalteradas.

Para `completed_run_signal_and_query`, uma execução concluída normalmente,
com um handler declarado de consulta que possa passar por replay, deve
retornar seu estado final de consulta em toda interface pública de consulta
declarada. Erros estáveis de estado terminal só são válidos para estados
terminais explicitamente não suportados ou handlers indisponíveis. Um erro
terminal genérico de execução concluída não aprova uma execução concluída
que possa passar por replay.

A categoria `workflow_update_runtime_contract` é uma categoria estável de
cenários de runtime. Um resultado deve usar artefatos publicados, fixar as
versões de servidor, CLI, SDK Python, SDK PHP e Waterline, declarar se algum
checkout local de fontes do produto foi usado e identificar cada cenário
obrigatório de atualização como `pass`, `fail`, `unsupported`, `not_covered`
ou `runner_blocked`, com vínculos para os achados. Evidências aprovadas de
atualização devem exercitar interfaces públicas de plano de controle,
histórico, CLI/SDK e leitura pelo operador. Execução a partir de fontes locais não conta.

Os cenários obrigatórios de atualização cobrem instalação de artefatos
publicados, visibilidade do contrato declarado da atualização, evidência de
aceitação no plano de controle e no histórico, visibilidade para o operador
durante execução ou espera, ida e volta do resultado concluído, resultados
com falha ou recusados, comportamento de requisições duplicadas ou idempotência,
recusa de atualização desconhecida, recusa de entrada inválida, ida e volta
do envelope de payload, comportamento de workflows terminais, atribuição de
principal autenticado, paridade entre cliente e worker PHP, paridade entre
cliente e worker Python e diagnóstico para operadores. Se um SDK não tiver
suporte próprio a atualizações, o resultado deve relatar uma célula tipada de
não suporte com um achado específico do SDK, em vez de omitir silenciosamente a linguagem.

Esses IDs de cenário e seus critérios de aprovação são publicados no
manifesto de cenários de runtime legível por máquina em
[`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json).
A transferência atual para o runner de host permanece intencionalmente em
`runner_blocked` até que um runner registrado possa instalar os artefatos
publicados fixados e exercitar a matriz completa de atualizações de workflow.

A categoria `search_attribute_runtime_contract` é uma categoria estável de
cenários de runtime. Um resultado deve usar artefatos publicados e cobrir o
comportamento de início e inserção ou atualização em workflows PHP e Python,
interfaces de consulta e erro da CLI, visibilidade para o operador no Waterline,
idas e voltas de codec entre linguagens, consultas de igualdade, intervalo e
booleanos, gramática OR/NOT, pertencimento a listas de palavras-chave, segurança
de tipos, distribuição da latência de indexação, latência sob carga, isolamento
de namespace, recusa de nomes reservados e proteção contra injeção em consultas.
Um subconjunto de teste básico de Python e servidor é não conforme até que
cada célula obrigatória seja registrada como `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, com vínculos para os achados. Somente células
`pass` contam para aprovar uma categoria.

Esses IDs de cenário de atributos de busca e seus critérios de aprovação são
publicados em
[`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json).

A categoria `schedules_runtime_contract` é uma categoria estável de cenários
de runtime. Um resultado deve usar artefatos publicados e cobrir cadência cron,
cadência de frequência fixa, visibilidade em listagem e descrição, janelas
de pausa e retomada sem disparos, exclusão impedindo disparos futuros, política
de disparos perdidos, sobrevivência a reinicializações, operações de agendamento
pela CLI, pelo SDK Python e pelas interfaces PHP, disparos de workflows PHP
criados por Python, disparos de workflows Python criados por PHP, recusa de
cron inválido e resultados para tipos de workflow inexistentes. Um subconjunto
de teste básico de ciclo de vida de agendamentos é não conforme até que cada
célula obrigatória seja registrada como `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, com vínculos para os achados. Somente células
`pass` contam para aprovar uma categoria.

Esses IDs de cenário de agendamentos e seus critérios de aprovação são publicados em
[`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json).

A categoria `history_replay_bundles` também é uma categoria estável de cenários
de runtime. Um resultado deve usar artefatos publicados e cobrir replay em PHP
e Python para históricos concluídos, reinicialização de worker, atividade,
sinal/atualização, espera por condição, marcador de versão, compensação de saga,
recusa explícita de divergência de código, recusa de alteração do histórico
no servidor, recusa de histórico malformado e temporização da reinicialização
com sinal em andamento. Um subconjunto de teste básico de histórico de
referência é não conforme até que cada célula obrigatória seja registrada
como `pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`, com
vínculos para os achados. Somente células `pass` contam para aprovar uma categoria.

Esses IDs de cenário de replay e seus critérios de aprovação são publicados em
[`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json).

A categoria `namespace_runtime_contract` é uma categoria estável de cenários
de runtime. Um resultado deve usar artefatos publicados e cobrir criação,
atualização, descrição e listagem de namespaces; limpeza de ciclo de vida e
recriação; isolamento de visibilidade e alterações de workflows; isolamento
de filas de tarefas de workers PHP; contexto de namespace e comportamento de
escopo padrão da CLI; paridade de seleção de namespace nos SDKs; isolamento
de schema e consultas de valores de atributos de busca; isolamento de
agendamentos; visibilidade restrita por escopo para Waterline e operadores;
chamadas Nexus explícitas entre namespaces; recusa de nomes reservados; e
roteamento de registros de resultado para achados de produto. Um subconjunto
de teste básico de namespace é não conforme até que cada célula obrigatória
seja registrada como `pass`, `fail`, `unsupported`, `not_covered` ou
`runner_blocked`, com vínculos para os achados. Somente células `pass` contam
para aprovar uma categoria.

Notas não normativas de implementação sobre visibilidade restrita por escopo
no Waterline e para operadores podem vir do artefato publicado do Waterline
ou de uma partição focada nele. Capturas úteis para revisão incluem listas
e detalhes de workflows com escopo, visões de agendamentos quando expostas
pelo produto, valores de atributos de busca, escopo do painel, estatísticas
da API do operador e o veredito documentado para qualquer visão padrão ou
sem escopo anunciada pelo produto. Os critérios normativos de aprovação
continuam sendo o cenário `waterline_operator_namespace_visibility` abaixo.

Esses IDs de cenário de namespace e seus critérios de aprovação são publicados em
[`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json).

A categoria `child_workflow_runtime_contract` é uma categoria estável de
cenários de runtime. Um resultado deve usar artefatos publicados e cobrir
execuções de pai e filho na mesma linguagem, em PHP e Python; execuções de
pai e filho de PHP para Python e de Python para PHP; tipagem na ida e volta
de falhas de filhos; propagação do cancelamento do pai ao filho; cancelamento
direto do filho observado pelo pai; replay após reinicialização do worker
do pai durante a espera por um filho; ramificação concorrente para cinco
filhos; e comportamento de namespace. Um único teste básico de pai e filho
é não conforme até que cada célula obrigatória seja registrada como `pass`,
`fail`, `unsupported`, `not_covered` ou `runner_blocked`, com vínculos para
os achados. Somente células `pass` contam para aprovar uma categoria.

Esses IDs de cenário de workflows filhos e seus critérios de aprovação são
publicados em
[`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json).

A categoria `saga_runtime_contract` é uma categoria estável de cenários de
runtime. Um resultado deve usar artefatos publicados e cobrir sucesso no
fluxo de avanço, falha após uma etapa posterior com compensação em ordem
inversa, falha em etapa inicial sem compensação extra, idempotência de
repetições de compensação, visibilidade terminal de falhas de compensação,
reinicialização do worker durante a compensação, workflow PHP com compensação
Python, workflow Python com compensação PHP, idas e voltas de erros tipados
de compensação e status de compensação em andamento visível ao operador.
Um teste básico de saga que comprova apenas um caminho de sucesso ou um SDK
é não conforme até que cada célula obrigatória seja registrada como `pass`,
`fail`, `unsupported`, `not_covered` ou `runner_blocked`, com vínculos para
os achados. Somente células `pass` contam para aprovar uma categoria. O pacote
PHP é identificado como `workflow-php` na matriz de runtime e também pode ser
registrado como `workflow` ao comparar com o conjunto de artefatos de liberação da plataforma.

Esses IDs de cenário de saga e seus critérios de aprovação são publicados em
[`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json).

A categoria `worker_versioning_runtime_contract` é uma categoria estável de
cenários de runtime. Um resultado deve usar artefatos publicados e cobrir
registro de build-ID de workers, visibilidade da implantação para o operador,
controles de drenagem e retomada, fixações de compatibilidade por execução,
replay apenas por workers compatíveis, roteamento para a versão promovida
em novos inícios, replay após expulsão do cache, diagnóstico de ausência de
worker compatível, interfaces de visibilidade da CLI e Waterline, fixação
entre as linguagens PHP e Python, comportamento adversarial sem incremento
de versão e fixações de versão da API de histórico. Um subconjunto de teste
básico de versionamento de workers é não conforme até que cada célula
obrigatória seja registrada como `pass`, `fail`, `unsupported`, `not_covered`
ou `runner_blocked`, com vínculos para os achados. Somente células `pass`
contam para aprovar uma categoria.

A evidência de fixação entre PHP e Python deve registrar identidades de
runtime dos workers, IDs de workflows e execuções, estado de implantação
da fila de tarefas, resultados públicos de polling e implantação usados
para verificar a fixação, origem e versão da instalação do artefato publicado
do worker e confirmação de que nenhum checkout local de fontes do produto foi usado.

Esses IDs de cenário de versionamento de workers e seus critérios de aprovação
são publicados em
[`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json).

A categoria `migration_runtime_contract` é uma categoria estável de cenários
de runtime. Um resultado deve usar artefatos publicados e cobrir a preparação
de estado da versão v1 mais recente suportada, as etapas documentadas de
migração, preservação e replay de histórico concluído, progresso de workflows
em andamento, estado de repetição durante uma atividade, estado de espera por
sinal ou temporizador, cadência de agendamentos, projeção de registro de
workers, visibilidade para o operador no Waterline, acesso pela CLI ao estado
anterior à atualização, novos inícios de workflows v2, semântica de reversão
que considera as filas e recusa explícita de divergências de versão não
suportadas. A evidência de reversão deve inventariar trabalho v1 em fila
pronto, adiado e reservado; registrar se o ponto de recuperação foi drenado,
capturado como um corte consistente da aplicação abrangendo SQL e fila ou
aceito como irrecuperável; e comprovar que cada linha v1 não terminal
restaurada tem um caminho executável de fila ou de despertar por sinal. Uma
linha elegível `pending` desatualizada pode usar, como alternativa, o Watchdog
suportado da v1.0.77 somente quando a evidência observa o loop do worker
disparando o Watchdog habilitado por padrão, o Watchdog reenviando esse
workflow após seu limite de cinco minutos de desatualização e a linha
avançando na fila registrada. Esse caminho exclusivo de pendências não
substitui o estado de fila preservado para repetições, temporizadores ou
trabalho `waiting`/`running`. Uma restauração apenas de SQL só é evidência
aprovada de reversão quando não há outra execução v1 não terminal dependente
de fila no corte de recuperação. O manifesto de recuperação deve registrar
apenas a referência e a versão de `APP_KEY` no gerenciador de segredos. A
chave e as credenciais de recuperação devem ter controle de acesso separado
dos backups SQL e de filas. Um teste básico de instalação nova ou uma execução
de migração que não parta de um estado v1 realista é não conforme até que cada
célula obrigatória seja registrada como `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, com vínculos para os achados. Somente células
`pass` contam para aprovar uma categoria.

A célula de etapas documentadas deve registrar a lista de comandos do guia
atual, os comandos efetivamente executados na ordem do guia, códigos de saída
e tempos por comando. Os instantâneos de estado anteriores e posteriores
devem incluir células observadas de histórico concluído, workflow em
andamento, atividade em repetição, espera por sinal ou temporizador,
agendamento e registro de workers.

Esses IDs de cenário de migração e seus critérios de aprovação são publicados em
[`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json).

A categoria `skew_refusal_matrix_contract` é uma categoria estável de cenários
de runtime. Um resultado deve usar artefatos publicados e cobrir combinações
compatíveis, com divergência para versões anteriores, para versões posteriores
e fora da janela, para CLI, SDK Python, worker independente do SDK PHP e
interfaces do Waterline. Workflow aparece apenas como mecanismo do Laravel
embarcado e do Waterline. Também deve testar limites de versões futuras,
capturar requisições e respostas de cada operação com divergência, classificar
a divergência de workers como `register_refused`, `register_and_serve` ou
`register_and_drop`, e a do Waterline como `banner`, `render_refused` ou
`stale_render`. Um subconjunto de teste básico de manifesto de protocolo é
não conforme até que cada célula obrigatória seja registrada como `pass`,
`fail`, `unsupported`, `not_covered` ou `runner_blocked`, com vínculos para
os achados. Somente células `pass` contam para aprovar uma categoria.
`register_and_drop` e `stale_render` sem aviso explícito são achados de produto bloqueadores.

Esses IDs de cenário de recusa de divergências e seus critérios de aprovação são publicados em
[`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json).

A categoria `principal_attribution_contract` é uma categoria estável de
cenários de runtime. Um resultado deve usar artefatos publicados e comprovar
que o histórico do workflow registra principals derivados do servidor nas
interfaces de eventos de início, sinal, consulta, cancelamento, conclusão,
falha, eventos anônimos e eventos originados pelo servidor. Deve exercitar
falsificação adversarial de payloads e cabeçalhos, identidades nomeadas
alice/bob, rotação de credenciais, visibilidade para o operador pela CLI e
Waterline e operações autenticadas de início ou sinal tanto pelo SDK Python
quanto pelo `DurableWorkflow\Client` PHP. Células de SDK devem registrar a
versão do pacote, saídas das operações, amostras de principals no histórico
e na API e principals de referência de HTTP bruto, para que o executor
compare seu formato e os IDs esperados. A célula PHP deve resolver
`durable-workflow/sdk` como uma distribuição exata do Packagist e registrar
seu tipo de distribuição, URL e referência. `durable-workflow/workflow` é
resolvido separadamente apenas para o mecanismo Laravel embarcado e Waterline.
Um subconjunto de teste básico de tokens de papéis é não conforme até que
cada cenário obrigatório seja registrado como `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, com vínculos para os achados.

Esses IDs de cenário de atribuição de principal e seus critérios de aprovação
são publicados em
[`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json).

A categoria `prerelease_readiness_contract` é uma categoria estável de cenários
de runtime para a candidata coordenada de liberação 2.0. Um resultado deve
usar apenas artefatos publicados e documentação pública para usuários,
registrar vereditos separados de GO / NO-GO para Workflow e Waterline, cobrir
completude dos recursos centrais, prontidão de migração, estabilidade da API
pública, precisão da documentação, clareza da configuração e compatibilidade
entre componentes, e avaliar servidor, CLI, SDKs PHP, Python e Rust, Workflow,
Waterline, aplicativo de exemplo e documentação pública como uma única tupla
do ecossistema. Também deve executar cada caminho versionado de início rápido
independente 2.0 e o caminho separado de Laravel embarcado, a partir da
documentação pública atual até workflows concluídos observáveis em até 10
minutos, registrando comandos exatos, saídas, versões de artefatos, procedência
de pacotes e tempos de relógio real. Uma verificação de início rápido que
apenas descobre caminhos é não conforme até registrar os cenários de PHP,
Python, Rust e Laravel como `pass`, `fail`, `unsupported`, `not_covered` ou
`runner_blocked`. Qualquer artefato ausente, página desatualizada, etapa de
migração não documentada, lacuna de instalabilidade, instabilidade de API,
risco de mudança incompatível entre componentes ou divergência de canal de
liberação deve ser registrado como célula não aprovada com um achado vinculado.
Evidência apenas do runner é não conforme e não pode aprovar a prontidão de pré-lançamento.

Esses IDs de cenário de prontidão de pré-lançamento e seus critérios de
aprovação são publicados em
[`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json).
O [início rápido 2.0](/docs/quickstart/) conciso é o caminho público de integração inicial.

## Regras de aprovação e reprovação {#pass--fail-rules}

1. **`guaranteed_field_equality`.** Todo campo marcado como garantido no
   schema da fixture deve estar presente, com tipo correto e valor igual
   na resposta da implementação. Campos apenas de diagnóstico são ignorados.
2. **`unknown_additive_fields_tolerated`.** Campos extras só são aprovados
   se forem documentados como apenas de diagnóstico ou se a fixture estiver
   em um nível de estabilidade que permita evolução aditiva.
3. **`frozen_shape_exact_match`.** Fixtures respaldadas por uma família de
   interfaces `frozen` devem corresponder exatamente. Uma divergência de
   formato congelado sempre é uma falha.
4. **`required_fixtures_must_pass`.** Uma liberação que declara um alvo deve
   aprovar todas as categorias de fixtures obrigatórias desse alvo. Uma
   única fixture obrigatória com falha torna a liberação não conforme para esse alvo.
5. **`stable_runtime_scenario_coverage`.** Uma categoria estável de runtime
   deve relatar cada cenário obrigatório que declara com um dos status
   publicados no manifesto de cenários de runtime: `pass`, `fail`,
   `unsupported`, `not_covered` ou `runner_blocked`. Conformidade completa
   exige que todos os cenários obrigatórios sejam aprovados. Um subconjunto
   apenas de testes básicos, cenário omitido, interface pública não suportada,
   célula sem cobertura ou bloqueada pelo runner é não conforme e deve
   vincular o achado responsável. Esse conjunto de status e a regra de
   runtime que conta apenas aprovações são a semântica da versão 5 ou posterior da suíte.
6. **`provisional_categories_warn_only`.** Uma fixture com falha em uma
   categoria provisória emite um aviso e não bloqueia a liberação.
7. **`diagnostic_only_mismatches_pass`.** Se apenas campos de diagnóstico
   diferirem, o executor registra a diferença em `diagnostic_diff` e a
   fixture é aprovada.

O resultado do executor declara um entre quatro níveis de conformidade:

| Nível | Significado |
| --- | --- |
| `full` | Toda fixture obrigatória é aprovada para todos os alvos declarados. |
| `partial` | Toda fixture obrigatória é aprovada para pelo menos um alvo declarado, mas outro alvo declarado falha. |
| `provisional` | Apenas categorias provisórias falharam; todas as categorias obrigatórias foram aprovadas. |
| `nonconforming` | Pelo menos uma fixture obrigatória falhou para cada alvo declarado. |

## Contrato do executor {#harness-contract}

Um executor conforme:

- carrega o manifesto da suíte de `platform_conformance_suite` em
  `GET /api/cluster/info` ou do espelho estático para execuções offline;
- carrega cada fixture declarada de seu caminho de fonte de verdade;
- exercita a implementação pela operação documentada da fixture;
- compara a resposta segundo as regras de aprovação e reprovação acima;
- emite um documento de resultado por execução com o schema
  `durable-workflow.v2.platform-conformance.result`, versão da suíte,
  identidade da implementação, resultados por fixture, diferenças de
  diagnóstico e nível geral de conformidade;
- encerra com código diferente de zero se e somente se o nível de
  conformidade for `nonconforming`.

O documento de resultado é um artefato. Uma declaração de compatibilidade só
é válida quando o resultado foi produzido contra o build da implementação
e a versão da suíte indicada por esse build.

## Critérios de liberação {#release-gates}

| Liberação | Alvos declarados obrigatórios | Artefato obrigatório |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | Documento de resultado do executor anexado à liberação. |
| `durable-workflow/workflow` | `embedded_engine` | Documento de resultado do executor anexado à liberação. |
| `durable-workflow/sdk` | `official_sdk`, `worker_protocol_implementation` | Documento de resultado do executor anexado à liberação. |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | Documento de resultado do executor anexado à liberação. |
| `dw` | `cli_json_client` | Documento de resultado do executor anexado à liberação. |
| `waterline` | `waterline_contract_surface` | Documento de resultado do executor anexado à liberação. |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | O registro de conformidade armazena o resultado de prontidão de pré-lançamento com artefatos publicados. |

Revisores da liberação confirmam que o resultado do executor está anexado,
que o nível de conformidade é `full` ou `provisional` e que a versão da suíte
no resultado corresponde à exposta pelo build em teste. Um resultado
`nonconforming` bloqueia a liberação.

## Verificação de liberação {#release-check}

A verificação de liberação do site de documentação em
`scripts/check-platform-conformance-authority.js` reprova o build se o
manifesto estático apontar para uma referência ausente, local ao repositório,
apenas um alias de versão ou externa ao site de documentação. Ela também
valida cada valor `authority_doc` de fixtures estáveis como uma URL canônica
da versão atual no site de documentação, e rejeita árvores de fontes,
fixtures de testes, documentação e diretórios de schema relativos ao
repositório, IDs de artefatos sem versão, resolvedores não públicos e resumos
de bytes incorretos em todas as categorias estáveis de fixtures. Categorias
de runtime também devem expor um manifesto público de cenários vinculado à
suíte. A mesma verificação exige que esta página liste o schema do manifesto,
nomes de alvos, nomes de categorias de fixtures, regras de aprovação e
reprovação e critérios de liberação do espelho legível por máquina.

Quando a suíte mudar, atualize esta página e
`static/platform-conformance-contract.json` juntos. Se a mudança adicionar
um alvo ou categoria obrigatória de fixtures, promover uma categoria
provisória a estável, alterar `operations` ou `pass_criteria` de cenários
estáveis de runtime, alterar um campo público de requisito desses cenários
(`artifact_policy`, `common_result_evidence`, `required_matrix`,
`scenario_requirements` ou `host_runner_contract`) ou alterar uma regra de
aprovação ou reprovação, incremente a versão da suíte na mesma mudança de
liberação. A verificação fixa os critérios de cenários estáveis de runtime
e os instantâneos de requisitos públicos de runtime por resumos versionados
pela suíte, para que executores externos não observem novos critérios ou
requisitos de política de evidência sob uma versão antiga da suíte.

Entradas publicadas de resumos de critérios de cenários de runtime e de
requisitos públicos permitem apenas acréscimos. Para avançar `operations`
ou `pass_criteria` de cenários estáveis de runtime, mantenha inalterada toda
entrada existente de `VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS`, incremente
a versão da suíte, atualize o manifesto de cenários para essa versão e
adicione uma nova entrada de resumo dos critérios para a nova suíte atual.
Para alterar requisitos de evidência, política de artefatos, matriz
obrigatória, campos de requisitos de cenário ou campos do contrato do runner
de host de um manifesto público de runtime, mantenha inalterada toda entrada
existente de `VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS`,
incremente a versão da suíte, atualize o manifesto de cenários para essa
versão e adicione a entrada correspondente de resumo dos requisitos públicos
para a nova suíte atual. A verificação de liberação compara as entradas
publicadas de resumos na branch de destino com a mudança atual. Assim,
editar ou excluir uma entrada de suíte antiga reprova a verificação, mesmo
quando a versão atual da suíte adiciona um novo resumo.
