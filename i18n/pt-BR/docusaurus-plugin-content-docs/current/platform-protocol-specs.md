---
sidebar_position: 18
title: Especificações de protocolos da plataforma
description: Catálogo para consumidores das especificações públicas OpenAPI, JSON Schema e AsyncAPI do Durable Workflow.
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - especificações de protocolos da plataforma
  - catálogo de protocolos
  - openapi
  - asyncapi
  - json schema
  - especificação do plano de controle
  - especificação do protocolo de workers
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Especificações de protocolos da plataforma {#platform-protocol-specs}

O catálogo de protocolos da plataforma informa aos autores de SDKs,
agentes, operadores e ferramentas de terceiros exatamente qual especificação
legível por máquina rege cada interface pública do Durable Workflow.

Use o
[catálogo legível por máquina](https://durable-workflow.github.io/platform-protocol-specs.json)
para automação. Cada entrada disponível fornece um identificador estável de
especificação e uma URL HTTPS pública que aponta diretamente para um artefato
OpenAPI, AsyncAPI ou JSON Schema.

Caminhos de repositório, símbolos de implementação e fixtures de teste
intencionalmente não são fontes normativas para consumidores. Eles são
excluídos do catálogo publicado e mantidos apenas como diagnósticos de validação.

## Identidade e descoberta do catálogo {#catalog-identity-and-discovery}

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

O catálogo também está disponível por:

- o catálogo JSON público em
  https://durable-workflow.github.io/platform-protocol-specs.json;
- platform_protocol_specs em GET /api/cluster/info no servidor independente;
- este guia 2.0 para contexto legível por pessoas.

A URL JSON é a fonte normativa do catálogo para consumo por máquina.
O servidor reexpõe o mesmo catálogo para que clientes descubram as interfaces
ativas de protocolo sem presumir uma organização de repositório.

<WorkerProtocolAuthorityRoles />

## Campos para consumidores {#consumer-fields}

Cada entrada expõe o seguinte contrato:

| Campo | Significado |
|---|---|
| spec_id | Identificador estável de protocolo do Durable Workflow. Os documentos publicados contêm a identidade correspondente. |
| spec_url | URL HTTPS pública direta da especificação legível por máquina. |
| format | openapi, json_schema ou asyncapi. |
| status | Indica se o artefato referenciado está publicado, em andamento ou planejado. |
| surface_family | Família da política de compatibilidade que rege a interface. |
| authority_manifest | Manifesto de descoberta pelo qual um runtime anuncia a interface. |
| owner_repo | Projeto responsável pela especificação. |
| object_families | Nomes públicos das famílias de objetos e os projetos responsáveis por elas. |
| evolution_rule | Regra de compatibilidade para alterações aditivas e incompatíveis. |
| breaking_change_release | Limite de release exigido por essa regra de evolução. |

Os consumidores devem resolver spec_url e validar a identidade do documento
contra spec_id. Eles não precisam acessar um checkout do código-fonte.

## Especificações disponíveis {#available-specifications}

Este inventário é renderizado a partir do catálogo JSON público. Assim,
identidade, disponibilidade, links públicos e responsabilidade pelas famílias
de objetos permanecem dados do catálogo, em vez de uma segunda fonte normativa em texto.

<ProtocolCatalog />

### Notas sobre o runtime de sessões de worker {#worker-session-runtime-notes}

Este esquema abrange descoberta da capacidade de sessões de worker, envelopes
de ciclo de vida, instantâneos de afinidade de tarefas e visibilidade para
operadores. Seu identificador estável é durable-workflow.v2.worker-sessions-runtime.

### Notas sobre o runtime de atividades locais {#local-activity-runtime-notes}

Este esquema abrange descoberta da capacidade de atividades locais,
instantâneos de opções, marcadores de histórico, semântica de novas tentativas
e visibilidade para operadores. Seu identificador estável é
durable-workflow.v2.local-activity-runtime.

### Notas sobre o envelope cluster-info {#cluster-info-envelope-notes}

Este esquema abrange GET /api/cluster/info e os manifestos de descoberta
aninhados disponíveis nesse endpoint. Seu identificador estável é
durable-workflow.v2.cluster-info-envelope.

## Formatos {#formats}

| Formato | Uso |
|---|---|
| OpenAPI 3.1 | Interfaces HTTP e JSON de requisição/resposta cujas rotas, métodos, códigos de status e envelopes fazem parte do contrato. |
| JSON Schema 2020-12 | Registros persistidos, payloads de eventos, envelopes de resultados, opções de runtime e famílias de objetos relacionadas. |
| AsyncAPI 2.6 ou mais recente | Semântica de consulta periódica, streams, renovação de leases, ordenação e entrega. |

## Níveis de status {#status-levels}

| Status | Significado |
|---|---|
| published | A especificação pública legível por máquina está disponível em spec_url e pode ser consumida diretamente. |
| in_progress | Há uma especificação pública disponível, mas sua cobertura é parcial. Os campos e rotas listados são normativos. |
| planned | A entrada tem identidade estável no catálogo, mas ainda não há uma especificação consumível. Entradas planejadas não anunciam spec_url. |

## Regras de evolução {#evolution-rules}

additive_minor_breaking_major permite adições em releases de versão secundária.
Remoções, renomeações, restrições de tipo e alterações de semântica exigem um
release de versão principal e devem usar uma rota ou campo paralelo quando viável.

parallel_primitive_only rege formatos de transmissão congelados. Um formato
incompatível deve ser introduzido sob um novo tipo de evento, tipo de comando
ou identificador de esquema, enquanto o original permanece decodificável.

experimental_any_release aplica-se apenas a especificações explicitamente
experimentais e permite alterações em qualquer release.

## Validação de releases {#release-validation}

A CI do site da documentação aplica as seguintes verificações automatizadas:

| Critério | O que a CI verifica |
|---|---|
| catalog_aligned_with_surface_families | Cada entrada referencia uma família pública de compatibilidade declarada. |
| owner_repo_known | Os responsáveis por entradas e famílias de objetos usam o vocabulário do catálogo. |
| format_known | Cada artefato disponível pode ser interpretado no formato declarado. |
| public_spec_references_resolve | Cada spec_url disponível é uma URL HTTPS no namespace público de especificações de protocolo e aponta para um artefato distribuído cuja identidade corresponde a spec_id. |
| repository_local_authority_fields_rejected | Entradas publicadas não contêm caminhos locais de repositório, símbolos de implementação, referências a testes ou campos normativos legados. |
| workflow_package_mirror_aligned | O catálogo público corresponde ao catálogo do pacote Workflow quando essa entrada de release está disponível. |
| server_owned_spec_mirrors_aligned | Artefatos publicados sob responsabilidade do Server correspondem às cópias do repositório responsável quando essas entradas estão disponíveis. |
| diagnostic_provenance_complete | A proveniência usada apenas para validação cobre cada entrada do catálogo e família de objetos. |
| object_family_metadata_declared | Entradas do catálogo e documentos publicados concordam sobre nomes de famílias de objetos e seus responsáveis. |
| rendered_retrieval_surfaces_aligned | A página 2.0 gerada e os pacotes completos 2.0 para recuperação por modelos expõem a identidade de catálogo, URL pública e responsáveis pelas famílias de objetos de cada entrada disponível. |
| breaking_change_release_consistent_with_evolution_rule | Cada valor de release para alteração incompatível corresponde à regra de evolução. |
| deliverable_specs_published | Cada interface exigida da plataforma tem uma especificação publicada e interpretável. |

A verificação automatizada carrega o catálogo JSON público, valida o vocabulário
e as referências seguras para consumidores, interpreta as especificações
distribuídas, verifica metadados de famílias de objetos e esquemas embutidos,
e compara cópias dos pacotes quando disponíveis. Após gerar o site e os
pacotes para modelos, uma verificação semântica compara os valores renderizados
do catálogo com a mesma fonte normativa JSON. O texto da documentação e dos
títulos não faz parte dessa comparação.

Quando o contrato mudar, atualize em conjunto o catálogo do pacote Workflow,
esta cópia JSON pública e os artefatos de especificação publicados afetados.
A revisão humana confirma que o texto explicativo continua útil sem tratá-lo
como fonte normativa para máquinas.

Prossiga para a [Suíte de conformidade da plataforma](/docs/platform-conformance)
para localizar as fixtures ativas vinculadas a bytes exatos que exercitam
estas especificações de protocolo. Evidências históricas de fixtures são
identificadas separadamente nessa suíte e não substituem a autoridade atual do catálogo.
