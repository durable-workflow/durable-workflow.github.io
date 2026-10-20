---
sidebar_position: 17
title: Compatibilidade de versões
description: Contrato canônico de compatibilidade e autoridade de releases das interfaces públicas do Durable Workflow.
tags:
  - compatibility
  - operations
  - protocols
  - api-stability
keywords:
  - compatibilidade de versões
  - autoridade de compatibilidade
  - autoridade de releases
  - níveis de estabilidade
  - manifestos de protocolo
  - versão do plano de controle
  - versão do protocolo de workers
  - contrato de estabilidade de interfaces
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Compatibilidade de versões {#version-compatibility}

Esta página é o **contrato canônico de compatibilidade e autoridade de
releases** da plataforma pública Durable Workflow. Ela é a fonte única de referência para:

- quais interfaces são públicas,
- o nível de estabilidade de cada interface pública,
- quais alterações podem ser distribuídas em releases de correção, secundários ou principais,
- se determinado campo faz parte do contrato ou é apenas diagnóstico,
- e o protocolo de negociação de versões em runtime que os clientes usam
  para recusar a operação quando o servidor anuncia uma interface que não suportam.

Os documentos de estabilidade de cada pacote (por exemplo,
`docs/api-stability.md` no repositório `durable-workflow/workflow`, a referência
da CLI `dw` e a página da API do operador Waterline) são **subordinados**
a esta página. Eles acrescentam detalhes dos pacotes sob estas regras;
quando houver divergência, esta página prevalece e a divergência é um bug
no documento do pacote.

O mesmo contrato é publicado em formato legível por máquina para que SDKs,
manifestos do servidor e verificações de CI se validem contra uma única fonte:

- `surface_stability_contract` no corpo da resposta de
  `GET /api/cluster/info` do servidor independente Durable Workflow, esquema
  `durable-workflow.v2.surface-stability.contract`, versão `5`.
- Uma cópia congelada do mesmo manifesto neste repositório em
  `static/compatibility-contract.json`.
- A classe PHP `Workflow\V2\Support\SurfaceStabilityContract`, que é
  a fonte em processo reexposta pelo servidor.

Um release que altere qualquer interface listada abaixo, seu nível de
estabilidade, conjunto de campos ou regras de alterações incompatíveis deve
atualizar esta página, a cópia JSON, o manifesto PHP e os documentos de
estabilidade de pacotes pertinentes na mesma alteração. A CI da documentação
valida o contrato legível por máquina, os metadados Rust publicados quando disponíveis e as especificações
do protocolo de workers. O alinhamento editorial entre esta página e o
manifesto continua sendo responsabilidade explícita da revisão de release.

## Documento complementar: catálogo de especificações de protocolos da plataforma {#companion-platform-protocol-spec-catalog}

Esta página define *quais* interfaces são públicas e *como* podem mudar.
O catálogo complementar de
[Especificações de protocolos da plataforma](/docs/platform-protocol-specs)
define *onde* está a especificação normativa legível por máquina de cada
interface, *qual formato* usa (OpenAPI para APIs HTTP, JSON Schema para
famílias de objetos, AsyncAPI para semântica de fluxos de eventos), *qual
repositório* é responsável por ela, quais famílias de objetos ela rege
e qual URL pública aponta para o artefato. Autores de SDKs, agentes e
operadores devem validar contra o catálogo, em vez de reler texto livre
ou depender de detalhes de implementação locais do repositório.

O catálogo é anunciado como `platform_protocol_specs` em `GET /api/cluster/info`.

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

O `surface_family` de cada entrada do catálogo deve existir no contrato acima;
a CI do site valida o catálogo, resolve cada URL pública de especificação
e rejeita campos normativos locais do repositório.

<WorkerProtocolAuthorityRoles />

Cada entrada obrigatória do catálogo de protocolos da plataforma está marcada
como `published`; a entrada do transporte invocable continua `in_progress`.
Cada entrada disponível aponta diretamente para um documento público OpenAPI,
AsyncAPI ou JSON Schema. O esquema
[`cluster_info_envelope`](/docs/platform-protocol-specs#cluster-info-envelope-notes)
fixa a interface de descoberta a partir da qual todas as outras entradas do
catálogo podem ser alcançadas.

## Níveis de estabilidade {#stability-levels}

Cada interface pública do Durable Workflow tem exatamente um destes níveis.
Os níveis são explícitos; uma interface sem classificação não é pública.

| Nível | Significado | Quando alterações incompatíveis são permitidas |
|-------|---------|-----------------------------------|
| `frozen` | Formato de transmissão ou persistido que deve ser decodificado da mesma forma durante toda a vida do workflow. Renomear, remover ou reaproveitar um campo quebra o protocolo e nunca é uma alteração secundária. | Somente pela introdução de uma **primitiva paralela** com um novo nome de tipo. O formato original permanece decodificável indefinidamente. |
| `stable` | Interface pública coberta pela garantia de versionamento semântico da plataforma. Adições são distribuídas em releases secundários. | Somente em release de versão principal. |
| `prerelease` | Interface pública com recursos completos, mas ainda sujeita a mudanças antes do lançamento correspondente `1.0.0` / `2.0.0`. | Em versões de pré-release claramente identificadas, com destaque nas notas de release. |
| `experimental` | Interface pública, mas instável. Pode mudar em qualquer release, inclusive de correção. Chamadores devem aderir explicitamente lendo o indicador experimental da interface. | Em qualquer release, com destaque da alteração nas notas. |

## Famílias de interfaces públicas {#public-surface-families}

Esta é a lista completa das famílias de interfaces públicas. Adicionar,
remover ou reclassificar uma família exige alteração de contrato (incremento
da versão de `SurfaceStabilityContract`, esta página e a cópia JSON no mesmo commit).

| Família | Estabilidade | Manifesto normativo em `/api/cluster/info` | Abrangência |
|--------|-----------|-------------------------------------------|----------------|
| `server_api` | `stable` | `control_plane` | API HTTP do servidor independente: rotas do plano de controle, namespaces, agendamentos e sistema, além de `/api/health`, `/api/ready` e `/api/cluster/info`. A versão de cada rota é regida por `control_plane.request_contract` e `control_plane.response.contract`. O `version` de nível superior do servidor é a identidade do build, não a autoridade de compatibilidade dos clientes. |
| `worker_protocol` | `stable` | `worker_protocol` | API HTTP do plano de workers usada por workers externos dos SDKs para registrar, consultar tarefas, enviar heartbeats, gerenciar leases de sessões de worker, concluir e informar falhas de tarefas de workflow, atividade e consulta. Inclui os contratos de runtime `worker_sessions` e `local_activities`, `external_execution_surface_contract`, `external_executor_config_contract`, `invocable_carrier_contract`, `external_task_input_contract` e `external_task_result_contract`. |
| `cli_json` | `stable` | não se aplica (consulte a referência da CLI) | Os formatos `--output=json` e `--output=jsonl` emitidos por `dw`. Códigos de saída JSON e nomes de campos JSON são a interface durável; o formato legível por pessoas `--output=table` é documentação, não contrato. |
| `waterline_api` | `stable` | não se aplica (consulte a API do operador Waterline) | API HTTP de observabilidade do Waterline em `/waterline/api/v2/*`, contrato da origem da engine e formatos JSON do painel. A versão principal do Waterline deve corresponder à do pacote Workflow. |
| `mcp_discovery_results` | `stable` | não se aplica (consulte a página de workflows MCP) | As interfaces Model Context Protocol `/mcp/*` e os arquivos de descoberta `llms.txt` / `llms-2.0.txt`. Nomes de ferramentas MCP, esquemas de parâmetros e semântica de `payload_preview_limit_bytes` fazem parte do contrato; descrições de ferramentas e orientações de descoberta são diagnósticas. |
| `official_sdks` | `stable` | `client_compatibility` | Os SDKs oficiais: PHP `durable-workflow/sdk`, Python `durable_workflow` e Rust `durable-workflow`. A CLI `dw` é o cliente oficial de comandos. A interface pública de cada SDK é regida pelo documento de estabilidade do próprio pacote, subordinado a esta página. |
| `history_event_wire_formats` | `frozen` | não se aplica (formatos congelados; consulte `docs/api-stability.md` do Workflow) | O formato persistido de cada linha em `workflow_history_events` e `workflow_schedule_history_events`. Depois que um workflow grava um evento, qualquer SDK futuro que o reproduza deve decodificar o mesmo conjunto de campos. |
| `cluster_info_manifests` | `stable` | `surface_stability_contract`, `client_compatibility`, `control_plane`, `worker_protocol`, `auth_composition_contract`, `coordination_health` | Os próprios manifestos de protocolo publicados por `GET /api/cluster/info`. Cada manifesto aninhado tem seu próprio `schema` e `version` e evolui segundo suas regras contratuais. As chaves do envelope são estáveis. |

### Documentos de estabilidade por pacote {#per-package-stability-documents}

Estes documentos acrescentam detalhes de cada pacote sob as regras desta página:

- `durable-workflow/workflow` (PHP): [`docs/api-stability.md`](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md). Normativo para a API de autoria PHP, classes `Support\*` voltadas ao servidor e tabelas congeladas de formatos de transmissão de eventos do histórico.
- `durable-workflow/sdk` (PHP): [`README.md`](https://github.com/durable-workflow/sdk-php/blob/main/README.md). Normativo para a API de cliente remoto e worker independente de framework distribuída pelo Packagist.
- `durable-workflow/server`: [`README.md`](https://github.com/durable-workflow/server/blob/main/README.md) e `docs/contracts/*`. Normativos para os contratos de requisição/resposta do servidor independente.
- CLI `dw`: [`/docs/polyglot/cli-reference`](/docs/polyglot/cli-reference). Normativo para formatos de saída JSON e códigos de saída.
- SDK Python: `README.md` em `durable-workflow/sdk-python`. Normativo para a API pública do pacote `durable_workflow`.
- SDK Rust: `README.md` e `[package.metadata.durable-workflow]` em
  `durable-workflow/sdk-rust`. Normativos para a API pública da crate
  `durable-workflow` e sua declaração de compatibilidade de pacote.

## Regras de release {#release-rules}

Estas regras valem para todas as famílias públicas acima. São reproduzidas
na cópia JSON em `release_rules`.

### Releases de correção {#patch-releases}

Permitido:
- correções de bugs que preservem o contrato documentado
- correções na documentação
- atualizações de dependências que não alterem a interface pública
- alterações em interfaces marcadas como `experimental`

Proibido:
- remover ou renomear qualquer campo, rota, comando ou classe `stable` ou `frozen`
- restringir as entradas aceitas por qualquer rota ou comando `stable`
- alterar o significado de um campo `stable` existente

### Releases secundários {#minor-releases}

Permitido:
- adicionar campos, rotas, comandos ou classes a uma interface `stable`
- adicionar parâmetros opcionais com valores padrão seguros
- adicionar indicadores de capacidade às respostas de descoberta
- promover uma interface `prerelease` ou `experimental` a `stable`

Proibido:
- remover ou renomear qualquer campo, rota, comando ou classe `stable` ou `frozen`
- alterar o significado de um campo `stable` ou `frozen` existente

### Releases principais {#major-releases}

Permitido:
- remover, renomear ou restringir uma interface `stable`
- aumentar o `control_plane.version` ou `worker_protocol.version` exigido
- deixar de suportar um intervalo de versões de SDK ou CLI antes aceito

Obrigatório:
- anunciar nas notas de release com pelo menos um release secundário
  de antecedência ao lançamento da versão principal
- quando viável, distribuir a nova interface junto da antiga em um release
  secundário anterior para que os chamadores migrem antes da versão principal
- documentar o caminho de migração no [guia de migração](/docs/migration)
  antes de publicar

## Campos apenas diagnósticos e campos garantidos {#diagnostic-only-versus-guaranteed-fields}

Todo campo de qualquer interface `stable` ou `frozen` é **garantido** ou
**apenas diagnóstico**. As regras de alteração são diferentes:

- **Campos garantidos** fazem parte do contrato documentado. Os produtores
  devem continuar emitindo-os no formato documentado; consumidores podem
  depender de sua presença e significado. Remover ou renomear um campo
  garantido de uma interface `stable` é uma alteração de versão principal.
- **Campos apenas diagnósticos** são emitidos para triagem humana, depuração
  e observabilidade. Podem ser adicionados, renomeados ou removidos em qualquer
  release secundário. Devem ser marcados como `diagnostic_only: true` (ou
  equivalente na página) onde forem documentados. **Consumidores não devem
  interpretar, persistir nem usar campos diagnósticos para decidir caminhos
  na lógica de produção.**

Campos aditivos desconhecidos em um formato `stable` ou `frozen` devem ser
ignorados por consumidores antigos (compatibilidade futura). Campos
obrigatórios desconhecidos devem provocar recusa segura. SDKs e CLIs publicam
seu comportamento de compatibilidade futura nos documentos de estabilidade dos pacotes.

## Matriz de compatibilidade {#compatibility-matrix}

Esta é a matriz operacional de compatibilidade. Ela registra quais versões
de clientes são validadas contra quais manifestos de protocolo do servidor.
Os componentes validam a matriz em runtime por `GET /api/cluster/info`
e recusam a operação quando os manifestos não concordam.

### Última combinação reproduzível qualificada {#last-qualified-reproducible-tuple}

A tabela mostra a combinação estável revisada selecionada para esta documentação
a partir de [`stable-releases.json`](/stable-releases.json). Cada componente
tem versionamento independente. Assim, uma combinação compatível pode conter
versões diferentes de pacotes. Relatórios de release e qualificação mantêm
as versões exatas e os digests de imagens usados em cada verificação concluída.

| Componente | Versão suportada | Identidade de instalação |
|-----------|-------------------|------------------|
| Server | `%%artifact.serverVersion%%` | `%%artifact.serverDockerHubImage%%` |
| CLI | `%%artifact.cliVersion%%` | `%%artifact.cliInstallerEnv%%` |
| Engine Workflow | `%%artifact.workflowVersion%%` | `%%artifact.workflowComposerPackage%%` |
| Operador Waterline | `%%artifact.waterlineVersion%%` | `%%artifact.waterlineComposerPackage%%` |
| SDK PHP | `%%artifact.phpSdkVersion%%` | `%%artifact.phpSdkComposerPackage%%` |
| SDK Python | `%%artifact.pythonSdkVersion%%` | `%%artifact.pythonPackagePin%%` |
| SDK Rust | `%%artifact.rustSdkVersion%%` | `%%artifact.rustCargoRequirement%%` |

O PyPI exibe a versão da distribuição Python como
`%%artifact.pythonRegistryVersion%%`; a grafia documentada de instalação PEP 440
`%%artifact.pythonSdkVersion%%` resolve para o mesmo release. Essa normalização
não cria uma segunda versão suportada.

A combinação selecionada avança após a qualificação dos consumidores afetados.
Os registros publicados do Server e os quickstarts gerados usam os artefatos
selecionados. Pacotes podem publicar releases de forma independente, com
compatibilidade verificada por manifestos de protocolo, capacidades e
verificações de consumidores.

Artefatos alpha e beta anteriores são históricos. Não são opções alternativas
de onboarding, e o histórico de releases permanece intacto.

Cada componente estável segue versionamento semântico. Capacidades aditivas
podem ser distribuídas em releases compatíveis; mudanças públicas incompatíveis
exigem uma versão principal. Use descoberta em runtime para verificar as
capacidades do Server e dos workers instalados antes de habilitar um recurso.

### Compatibilidade de protocolos em runtime {#runtime-protocol-compatibility}

As versões de nível superior dos pacotes selecionam a linha suportada.
Manifestos de protocolo em runtime fornecem uma segunda verificação com recusa segura:

| Cliente | Linha do produto | Plano de controle | Protocolo padrão de registro de workers |
|--------|---------------|---------------|--------------------------------------|
| CLI | `%%artifact.cliVersion%%` | `2` | não se aplica |
| SDK PHP | `%%artifact.phpSdkVersion%%` | `2` | `1.20` |
| SDK Python | `%%artifact.pythonSdkVersion%%` | `2` | `1.20` |
| SDK Rust | `%%artifact.rustSdkVersion%%` | `2` | `1.20` |

Os SDKs também permitem selecionar explicitamente o protocolo de workers
`1.19` para um Server compatível mais antigo. O cancelamento cooperativo
exige `1.20`; selecionar `1.19` não fornece essa capacidade. Cada operação
pode usar sua versão mínima documentada de protocolo, portanto o padrão
de registro não significa que toda requisição de worker envie `1.20`.

O Server publicado atual anuncia a versão de protocolo de workers mostrada
na tabela de papéis de autoridade acima. Ele aceita cabeçalhos de requisição
com a mesma versão principal e versão secundária menor ou igual à anunciada,
e retorna a versão anunciada. Cabeçalhos ausentes ou malformados, versões
principais diferentes e versões secundárias de workers à frente do servidor
provocam recusa segura. A CLI valida `control_plane.version: "2"`.

O `version` de nível superior do servidor é a identidade do build. Clientes
devem usar os manifestos `control_plane`, `worker_protocol`,
`client_compatibility` e `surface_stability_contract` retornados por
`GET /api/cluster/info` para negociar protocolos.

Workflow e Waterline devem usar releases 2.x compatíveis. A descoberta em
runtime e as restrições de pacotes definem o limite de compatibilidade após
o lançamento estável.

### Exemplos de validação em runtime {#runtime-validation-examples}

Os SDKs validam a descoberta antes de registrar um worker. Um servidor
incompatível produz um erro explícito de compatibilidade, em vez de tentar
um caminho legado de pré-release. Todas as requisições de workers enviam
`X-Durable-Workflow-Protocol-Version`; requisições do plano de controle enviam
`X-Durable-Workflow-Control-Plane-Version: 2`.

Antes de promover uma linha do produto, a qualificação de release deve partir
de uma máquina limpa, instalar apenas os artefatos publicados citados acima
e concluir os caminhos de conformidade PHP, Python e Rust. Checkouts de
código-fonte e substituições não publicadas não contam como evidência de artefatos públicos.

Metadados estáveis de pacotes e descoberta em runtime agora definem o limite
de compatibilidade suportado da linha 2.x. A qualificação ainda instala
os artefatos públicos em conjunto antes da publicação, enquanto releases
de correção e secundários seguem as regras de versionamento semântico abaixo.

### Progressão de releases {#release-progression}

Releases de correção preservam os contratos estáveis documentados. Releases
secundários podem adicionar campos, rotas, comandos, classes ou parâmetros
opcionais com valores padrão seguros. Alterações estáveis incompatíveis
exigem uma versão principal e um caminho de migração documentado. Formatos
congelados de eventos do histórico permanecem decodificáveis indefinidamente;
um novo formato usa uma primitiva paralela em vez de alterar um evento existente.

Todo release deve manter sincronizados metadados de pacotes, notas de release,
comandos de instalação e exemplos entre linguagens.

### Lista de revisão de release {#release-review-checklist}

- Confirme que o contrato de compatibilidade legível por máquina corresponde
  ao manifesto de estabilidade de interfaces do Workflow.
- Confirme que cada versão selecionada de SDK passa contra o Server selecionado.
- Confirme que exemplos de instalação usam o canal estável.
- Confirme que os metadados do pacote identificam o release exato do SDK e
  as versões de protocolo; registre a qualificação posterior do Server nas
  evidências de compatibilidade.
- Confirme que a conformidade com artefatos publicados em máquina limpa
  passa para PHP, Python e Rust.
- Confirme que as notas de release descrevem adições posteriores à versão-base
  e não apresentam pré-releases antigos como opções suportadas.

## Veja também {#see-also}

- [Configuração do Server](/docs/polyglot/server): implantação do servidor independente
- [Referência da API do Server](/docs/polyglot/server-api-reference): `GET /api/cluster/info` e manifestos de protocolo
- [SDK PHP](/docs/polyglot/php): cliente e worker PHP
- [SDK Python](/docs/polyglot/python): cliente e worker Python
- [SDK Rust](/docs/polyglot/rust): cliente e worker Rust
- [CLI](/docs/polyglot/cli): interface de linha de comando
- [Guia de migração](/docs/migration): migração da v1 para a v2
- [`docs/api-stability.md` do Workflow PHP](https://github.com/durable-workflow/workflow/blob/main/docs/api-stability.md): estabilidade específica do pacote Workflow PHP
