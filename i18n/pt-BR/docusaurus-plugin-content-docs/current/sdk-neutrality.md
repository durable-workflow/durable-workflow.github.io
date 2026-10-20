---
sidebar_position: 19
title: Neutralidade dos SDKs
description: Contrato permanente de independência de linguagem que permite implementar as interfaces públicas do Durable Workflow em um futuro SDK TypeScript, Go, Java ou .NET sem redesenhar o protocolo.
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - neutralidade de sdk
  - independência de linguagem
  - neutralidade de protocolo
  - neutralidade de codec
  - sdk typescript
  - sdk go
  - sdk java
  - sdk dotnet
  - sdk python
  - pacote php workflow
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Neutralidade dos SDKs {#sdk-neutrality}

Esta página é o guia legível por pessoas do contrato de neutralidade dos
SDKs em toda a plataforma. Ela enumera as regras mínimas de neutralidade
que cada interface pública do Durable Workflow deve atender e a auditoria
permanente de independência de linguagem aplicada pelos revisores de releases
a novas interfaces do Server, Workflow, CLI, Waterline e MCP.

O guia de arquitetura de origem está publicado em
[`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md).
A fonte normativa legível por máquina para consumidores é publicada neste site em
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json), sob o ID de
esquema `durable-workflow.v2.sdk-neutrality.contract`. Sua autoridade sobre
protocolo e abrangência de SDKs vem do JSON distribuído no pacote Composer
Workflow em `resources/sdk-neutrality-contract.json`. A cópia pública adiciona
metadados atuais de distribuição de pacotes a partir da combinação centralizada
de artefatos da documentação. O servidor independente Durable Workflow reexpõe
o manifesto-base do pacote em `GET /api/cluster/info`, no campo
`sdk_neutrality_contract`. Quando esta página diverge do contrato JSON
publicado, o contrato JSON prevalece e a divergência é um bug de documentação.

Este contrato é subordinado à autoridade de
[Compatibilidade de versões](/docs/compatibility) (que define *quais* interfaces
são públicas e *como* podem mudar) e ao catálogo de
[Especificações de protocolos da plataforma](/docs/platform-protocol-specs)
(que define *onde* está a especificação normativa de cada interface).
Ele define *qual formato* essas especificações podem ter para que um futuro
SDK fora do conjunto atual PHP, Python e Rust possa implementá-las sem
exigir um redesenho do protocolo.

## Por que este contrato existe {#why-this-exists}

O Durable distribui três SDKs oficiais independentes: o pacote PHP
`durable-workflow/sdk`, o pacote Python `durable_workflow` e a crate Rust
`durable-workflow`. O pacote PHP separado `durable-workflow/workflow`
continua sendo a engine Laravel embutida e responsável pelo replay; ele
não é o SDK PHP independente de framework. Criar ou manter um conjunto
amplo de SDKs oficiais **não** é um objetivo de release. Ainda não há
demanda demonstrada por SDKs nos ecossistemas TypeScript, Go, Java e .NET,
e o custo de manutenção de um conjunto oficial amplo é alto.

Este contrato protege contra outro modo de falha: os contratos públicos
subjacentes a esses SDKs incorporarem silenciosamente premissas específicas
de uma linguagem. Se valer a pena criar um futuro SDK TypeScript ou Go,
o trabalho deve ser "escrever um novo cliente contra o protocolo de
transmissão publicado", e não "redesenhar o protocolo para que outra
linguagem sequer consiga usá-lo".

## Escopo {#scope}

| Chave de escopo | Significado |
| --- | --- |
| `goal` | Preservar a neutralidade de protocolos e contratos para que um futuro SDK TypeScript, Go, Java ou .NET não exija redesenhar o protocolo para existir. |
| `non_goal` | Distribuir um portfólio amplo de SDKs oficiais. A abrangência dos SDKs oficiais é intencionalmente restrita e cresce somente quando a demanda de adoção justifica. |
| `present_priority` | Python é atualmente o caminho de maior valor fora do PHP para os usuários existentes e é tratado como interface prioritária para cobertura de paridade. |
| `future_posture` | TypeScript, Go, Java, .NET e outras linguagens dependem da demanda. Não têm espaço reservado em releases, mas todos os contratos públicos devem permitir escrever um futuro SDK nessas linguagens sem quebrar o protocolo de transmissão. |

## Política de abrangência dos SDKs oficiais {#official-sdk-breadth-policy}

O conjunto de SDKs oficiais é intencionalmente restrito:

| Linguagem | Abordagem | Pacote publicado | Autoridade de conformidade |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), atores `sdk_php`, `php_sdk_client` e `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json), ator `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), atores `rust_sdk`, `rust_worker` e `rust_sdk_client` |
| TypeScript | `demand_driven` | Nenhum | Os contratos públicos devem continuar implementáveis em TypeScript sem redesenhar o protocolo. |
| Go | `demand_driven` | Nenhum | Os contratos públicos devem continuar implementáveis em Go sem redesenhar o protocolo. |
| Java | `demand_driven` | Nenhum | Os contratos públicos devem continuar implementáveis em Java sem redesenhar o protocolo. |
| .NET | `demand_driven` | Nenhum | Os contratos públicos devem continuar implementáveis em .NET sem redesenhar o protocolo. |

O contrato JSON lista os `scenario_ids` exatos que constituem a cobertura de
`first_party.php_sdk`, `first_party.python_sdk` e `first_party.rust_sdk`.
Ele acompanha separadamente o pacote Laravel como
`embedded_engines.php_workflow_engine`, com cobertura de replay pelo ator
`workflow_php_runtime`. Consumidores podem resolver esses identificadores
diretamente nos catálogos vinculados sem clonar um repositório de SDK ou
ler sua suíte de testes.

Um novo SDK oficial só é adicionado quando:

1. Há demanda documentada de usuários que os SDKs existentes não conseguem atender.
2. Uma equipe candidata a mantenedora se compromete a manter o SDK na
   estrutura de conformidade, no catálogo de especificações de protocolo
   e no manifesto de autoridade de releases.
3. A adição não exige alterações incompatíveis no protocolo de workers,
   plano de controle, formatos de transmissão de eventos do histórico ou
   fixtures de replay. Se exigir, o bug está no protocolo, não no SDK.

## Regras de neutralidade {#neutrality-rules}

Cada contrato público do Durable deve atender às sete regras abaixo.
O manifesto JSON é a fonte normativa dos formatos exatos dos campos;
os resumos destinam-se aos revisores. Cada regra no manifesto JSON contém
`requirement`, `rationale`, uma linha `how_to_apply` e um array `authority`.
Cada entrada de autoridade tem um ID estável de catálogo ou esquema e uma
URL absoluta para seu artefato publicado.

| Regra | Requisito |
| --- | --- |
| `protocol_neutrality` | Interfaces públicas de RPC e eventos usam formatos HTTP+JSON ou AsyncAPI que qualquer runtime com suporte HTTP pode produzir e consumir. |
| `codec_neutrality` | Todo payload durável que cruza um limite público anuncia `avro`. Nenhum outro codec v2 público ou específico da engine é oferecido. |
| `error_shape_neutrality` | Objetos públicos de falha usam um envelope estruturado de (`code`, `message`, `details` opcional). Nomes de classes de exceção PHP e Python são apenas diagnósticos. |
| `type_identity_neutrality` | Tipos de workflow, atividade, workflow filho e exceção são identificados por nomes estáveis em string. FQCNs de classes e caminhos de módulos são conveniências de entrada dos SDKs, não o contrato. |
| `replay_fixture_neutrality` | Fixtures de replay e pacotes de histórico de referência são JSON conforme os esquemas publicados `history_event_payloads` e `replay_bundle`. |
| `discovery_neutrality` | Cada interface pública é acessível a partir de `GET /api/cluster/info` e do catálogo `platform_protocol_specs`. |
| `documentation_neutrality` | A documentação de contratos públicos descreve formatos pela semântica de esquemas, rotas e campos. O comportamento de classes PHP e Python aparece como exemplo de SDK, não como contrato normativo. |

## Auditoria permanente de independência de linguagem {#standing-language-agnosticism-audit}

Cada nova interface do Server, Workflow, CLI, Waterline ou MCP deve passar
pela auditoria de neutralidade antes da promoção a `stable`. A auditoria
é um item permanente de revisão no PR de release de toda alteração que
afete uma família de interfaces dentro do escopo. As famílias são:

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

A lista de verificação tem oito etapas. Sete correspondem às regras acima.
A oitava, o **exercício de um SDK futuro**, pede ao revisor que descreva em
duas frases como um SDK TypeScript ou Go consumiria a nova interface usando
somente o catálogo publicado de especificações e ferramentas HTTP+JSON padrão.
Se a resposta exigir um SDK oficial, a interface não é neutra: deve ser
reformulada, ou a lacuna de neutralidade deve ser registrada como limitação
conhecida antes da promoção.

## De que um SDK futuro depende {#what-a-future-sdk-relies-on}

O contrato identifica as interfaces que um SDK futuro deve poder ler sem
inspecionar o código-fonte de qualquer SDK oficial:

- **Protocolo**: `durable-workflow.v2.control-plane-api`,
  `durable-workflow.v2.worker-protocol-api` e
  `durable-workflow.v2.worker-protocol-stream` no
  [catálogo publicado de protocolos](https://durable-workflow.github.io/platform-protocol-specs.json).
- **Codecs**: o conjunto universal de codecs documentado por
  `durable-workflow.v2.worker-protocol-api` e anunciado no esquema de
  descoberta `durable-workflow.v2.cluster-info-envelope`.
- **Formato dos erros**: o envelope de falha do protocolo de workers e
  o esquema `durable-workflow.v2.repair-actionability-objects`.
- **Entradas de replay**: os JSON Schemas
  `durable-workflow.v2.history-event-payloads` e
  `durable-workflow.v2.replay-bundle`, além dos IDs de cenários do catálogo
  público [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json).
- **Descoberta**: `durable-workflow.v2.cluster-info-envelope` e o próprio
  catálogo `durable-workflow.v2.platform-protocol-specs.catalog`.

Se qualquer uma dessas interfaces não estiver acessível a um SDK candidato
em determinada linguagem, a construção do SDK exige mudanças de protocolo
e a garantia de independência de linguagem não está sendo cumprida.

## Critérios de release {#release-gates}

Um release que introduza uma nova família de interfaces públicas ou promova
uma interface de `prerelease` ou `experimental` para `stable` deve registrar
o resultado da auditoria no PR de release. A seção de critérios de release
do manifesto enumera as verificações específicas:

- `audit_recorded`: a descrição do PR de release informa as etapas aplicadas
  e vincula a entrada no catálogo de especificações de protocolo, a fixture
  de conformidade e a entrada de descoberta da nova interface.
- `no_php_or_python_only_required_fields`: nenhum campo garantido de uma
  interface `stable` exige um codec exclusivo de PHP ou Python.
- `universal_codec_advertised`: a negociação do protocolo de workers
  anuncia exatamente um codec universal, `avro`.
- `fixture_schema_validated`: novas fixtures de replay ou pacotes de
  histórico de referência são validados pelos JSON Schemas publicados.
- `discovery_entry_present`: novas interfaces públicas têm uma entrada
  no catálogo `platform_protocol_specs` com `surface_family`, `owner_repo`
  e `format` não vazios.

A aplicação dos critérios se divide entre verificações automatizadas e
humanas. A CI de release resolve todas as URLs normativas, IDs de
protocolo/esquema e IDs de cenários de conformidade do contrato público;
cruza o escopo da auditoria com as famílias de estabilidade das interfaces;
e rejeita caminhos normativos locais de repositório ou símbolos de
implementação. Os revisores verificam a auditoria de neutralidade dos SDKs
em todo PR de release que adicione ou promova uma interface pública e
continuam responsáveis pelo exercício de um SDK futuro.

## Como alterar este contrato {#changing-this-contract}

Adicionar uma regra de neutralidade, tornar uma regra existente mais rígida,
adicionar uma etapa obrigatória de auditoria, incluir uma família de
interfaces no escopo ou mudar a política de abrangência dos SDKs oficiais
é uma alteração de contrato. Incremente a versão do manifesto, atualize
o guia de arquitetura e esta página na mesma alteração e alinhe o contrato
para consumidores em
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json).
Remover uma regra de neutralidade ou etapa de auditoria é uma alteração de versão principal.
