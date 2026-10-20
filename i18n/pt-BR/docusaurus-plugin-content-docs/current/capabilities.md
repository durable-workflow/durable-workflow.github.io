---
sidebar_position: 2
title: Índice de capacidades 2.0
description: Índice de SDKs no modo de serviço, runtime embutido, protocolos e capacidades do Durable Workflow 2.0.
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - capacidades Durable Workflow 2.0
  - SDK PHP Python Rust
  - matriz de recursos da engine de workflow
  - versões mínimas exatas dos recursos
---

# Índice de capacidades do Durable Workflow 2.0 {#durable-workflow-20-capability-index}

Este é o índice de capacidades da linha estável Durable Workflow 2.0.

## Canal suportado para instalação {#supported-installable-channel}

As identidades exatas dos artefatos pertencem aos registros de pacotes e aos
metadados de release, não a este resumo de capacidades.

| Interface | Canal suportado | Papel neste índice |
| --- | --- | --- |
| CLI | 2.0 estável | Cliente de operação e diagnóstico legível por máquina. |
| SDK PHP | 2.0 estável | Cliente oficial `durable-workflow/sdk` no modo de serviço e worker remoto de workflows/atividades para o runtime de um namespace Cloud ou Server auto-hospedado. |
| Engine Laravel embutida | 2.0 estável | Modo de implantação separado dentro da aplicação com `durable-workflow/workflow`, com seu próprio runtime de autoria, engine de persistência, filas e replay. |
| SDK Python | 2.0 estável | SDK oficial de workflows/atividades determinísticos no modo de serviço, além de cliente operacional e do plano de controle para o runtime de um namespace Cloud ou Server auto-hospedado. Exige Python 3.10 ou mais recente. |
| SDK Rust | 2.0 estável | SDK oficial de workflows/atividades determinísticos no modo de serviço, serviço de worker e cliente do plano de controle para o runtime de um namespace Cloud ou Server auto-hospedado. Exige Rust 1.86 ou mais recente. |
| Server | 2.0 estável | Runtime auto-hospedado, implementado em PHP e neutro em relação à linguagem, para os protocolos v2 do plano de controle e de workers. |
| Waterline | 2.0 estável | O Cloud inclui Managed Waterline; operadores auto-hospedados implantam separadamente a imagem do serviço contra um namespace do Server; o modo Laravel embutido instala o pacote Composer e lê em processo o estado pertencente à aplicação. |

PHP, Python e Rust são as três linguagens com SDKs oficiais no modo de serviço.
Cada um pode acessar o runtime de um namespace provisionado do Durable Workflow
Cloud ou um Server auto-hospedado quando a descoberta do runtime informa a
capacidade publicada. Eles compartilham nomes de tipo estáveis em string,
um modelo de comandos/histórico duráveis, plano de controle versão `2`,
protocolo de workers versão principal `1` e o envelope público de payload.
Rust é um SDK de workflows: executa código determinístico de workflow,
atividades e serviços de worker, não apenas chamadas brutas de protocolo.
Python combina autoria de workflows com interfaces de cliente para namespaces,
agendamentos, workers, filas, histórico, reparo e outras operações.

O modo Laravel embutido continua sendo uma implantação PHP separada dentro
da aplicação; ele não é necessário para clientes ou workers PHP no modo de
serviço. O SDK PHP independente de framework tem versionamento próprio,
separado da engine Laravel embutida.

Use [Modos de implantação](/docs/polyglot/deployment-modes/) para escolher
os limites de responsabilidade e depois prossiga com
[Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/) ou
[Server auto-hospedado](/docs/polyglot/server/). As evidências de capacidade
abaixo se aplicam somente quando o runtime selecionado anuncia o contrato exigido.

O SDK PHP 2.3.2, o SDK Python 2.5.7 e o SDK Rust 3.5.0 usam por padrão o
protocolo de workers `1.20`. Os workers padrão exigem um Server que anuncie
`1.20` ou mais recente dentro da versão principal `1`. Cada SDK também
permite selecionar explicitamente `1.19` para um Server compatível mais
antigo. O cancelamento cooperativo exige `1.20` e a habilitação explícita
da capacidade. A descoberta do runtime e os metadados publicados do SDK
selecionado determinam a compatibilidade. Consulte
[Compatibilidade de versões](/docs/compatibility/) e
[Protocolo de workers](/docs/polyglot/worker-protocol/).

## Capacidades e versões mínimas dos SDKs {#capability-and-sdk-floors}

"Modo de serviço" significa que o Cloud ou um Server auto-hospedado é
responsável pelo runtime remoto. "Embutido" significa que uma aplicação
Laravel é responsável pelo runtime em processo. A coluna dos SDKs registra
deliberadamente as diferenças; uma entrada em branco ou limitada não implica paridade.

| Capacidade | Contrato atual 2.0 e versão mínima oficial | Evidências explícitas 2.0 |
| --- | --- | --- |
| Workflows | Workers remotos PHP, Python e Rust permitem criar workflows determinísticos; a autoria em Laravel embutido usa o pacote Workflow. | [Autoria de workflows](/docs/defining-workflows/workflows/), [SDK PHP](/docs/polyglot/php/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Atividades e serviços | A engine embutida e os três SDKs no modo de serviço permitem criar atividades. Workflows e atividades Rust executam em serviços oficiais de worker; Python e PHP também expõem clientes oficiais de controle/serviço. | [Atividades](/docs/defining-workflows/activities/), [SDK PHP](/docs/polyglot/php/), [Execução de atividades](/docs/features/activity-execution-model/), [Execução externa](/docs/polyglot/external-execution/) |
| Sinais | A mutação durável assíncrona está disponível nas interfaces de workflow PHP, Python e Rust em suas versões mínimas atuais. | [Sinais](/docs/features/signals/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Consultas | Há suporte a consultas somente leitura por replay. PHP, Python e Rust expõem handlers/clientes de consulta; tarefas de consulta por replay em Rust exigem protocolo de workers `1.8` ou mais recente. | [Consultas](/docs/features/queries/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Atualizações | PHP, Python e Rust expõem interfaces de cliente e handlers de atualização nos workers. Validadores declarados em Python usam validação síncrona antes da aceitação quando a descoberta do Server anuncia esse contrato exato: a aceitação ocorre após aprovação, enquanto rejeição, perda do worker, tempo limite e conclusão impedida por fencing falham explicitamente. PHP e Rust não expõem autoria de validadores e não declaram validadores. | [Atualizações](/docs/features/updates/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/#workflow-updates) |
| Temporizadores | Temporizadores duráveis mantidos pelo runtime de serviço são reproduzidos no replay em PHP, Python e Rust. | [Temporizadores](/docs/features/timers/), [SDK Rust](/docs/polyglot/rust/) |
| Novas tentativas | A política durável de novas tentativas de atividades é registrada com o comando. PHP, Python e Rust expõem opções de novas tentativas de atividades nas versões mínimas atuais. | [Falhas e recuperação](/docs/failures-and-recovery/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Tempos limite | Runtimes no modo de serviço do Cloud e do Server auto-hospedado aplicam as famílias de tempos limite de atividades e workflows. Rust inclui opções de atividades e prazos de execução lógica e de execução individual definidos no início do workflow. | [Tempos limite](/docs/features/timeouts/), [SDK Rust](/docs/polyglot/rust/) |
| Workflows filhos | PHP, Python e Rust iniciam e aguardam filhos duráveis. A identidade de tipo entre linguagens é uma string estável, e os payloads dos filhos usam o envelope compartilhado. | [Workflows filhos](/docs/features/child-workflows/), [SDK Python](/docs/polyglot/python/) |
| Composição paralela determinística | `all()`/`parallel()` em PHP, list-yield aninhado em Python e `WorkflowContext::parallel()`/`join()` em Rust agendam grupos de atividades, workflows filhos, temporizadores, grupos mistos e aninhados por comandos comuns. Os três publicam metadados compartilhados de identidade/caminho de grupo e restauram resultados na ordem aninhada da entrada. | [Concorrência](/docs/features/concurrency/), [SDK Python](/docs/polyglot/python/#fan-out), [SDK Rust](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">Seleção durável da primeira conclusão</span> | PHP embutido e os SDKs de serviço PHP, Python e Rust iniciam membros independentes de atividade, workflow filho, temporizador, espera por entrada externa e grupo aninhado. Um vencedor é persistido com identidade estável de membro; os demais continuam e mantêm handles para aguardar/cancelar. | [Concorrência](/docs/features/concurrency/#first-completion-selection), [SDK Python](/docs/polyglot/python/#first-completion-selection), [SDK Rust](/docs/polyglot/rust/#durable-first-completion-selection) |
| Compensação de sagas | Os auxiliares Saga do PHP, `WorkflowContext.saga()` do Python e `WorkflowContext::saga()` do Rust registram compensações duráveis após o sucesso da operação principal e as executam sequencialmente em ordem inversa por padrão. Python e Rust param na primeira falha de compensação e preservam tanto a falha inicial quanto a de compensação; PHP também expõe políticas opcionais de paralelismo e continuação após erro. | [Sagas](/docs/features/sagas/), [SDK Python](/docs/polyglot/python/#saga-compensation), [SDK Rust](/docs/polyglot/rust/#saga-compensation) |
| Cancelamento | Laravel embutido e PHP, Python e Rust no modo de serviço aceitam solicitações de cancelamento cooperativo com uma identidade raiz, prazo imutável e limpeza limitada em workers com habilitação explícita. O cancelamento terminal imediato continua disponível com segurança para a execução selecionada e resultados tipados. | [Cancelar e terminar](/docs/features/cancel-and-terminate/), [Cancelamento no modo de serviço](/docs/polyglot/cancellation/), [SDK Rust](/docs/polyglot/rust/) |
| Término forçado | O término forçado encerra uma execução imediatamente com um resultado terminal distinto; ele é exposto nos runtimes de serviço do Cloud e do Server auto-hospedado, na CLI e nas interfaces de controle PHP, Python e Rust. | [Cancelar e terminar](/docs/features/cancel-and-terminate/), [API do Server](/docs/polyglot/server-api-reference/) |
| Efeitos colaterais | PHP, Python e Rust registram valores não determinísticos exatamente uma vez e decodificam o valor registrado no replay. | [Efeitos colaterais](/docs/features/side-effects/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Workflow Streams | PHP, Python e Rust expõem operações tipadas de listagem, descrição, assinatura/retomada por offset, acréscimo, fechamento e erro para fluxos de saída pertencentes ao Server e limitados a uma execução. Os três permitem emissões seguras para replay a partir de uma identidade durável de comando. Python resolve payloads externos com seu driver de armazenamento configurado; PHP e Rust preservam referências opacas. | [Workflow Streams](/docs/polyglot/workflow-streams/), [matriz exata de SDKs](/workflow-stream-capabilities.json), [cenários de runtime](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| Marcadores de versão | PHP, Python e Rust expõem marcadores duráveis de versão para evolução compatível do código. | [Versionamento](/docs/features/versioning/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Replay determinístico | Workers de workflow PHP, Python e Rust reconstroem decisões pelo histórico durável e relatam não determinismo tipado, em vez de executar novamente o trabalho externo. | [Garantias de execução](/docs/constraints/execution-guarantees/), [Conformidade da plataforma](/docs/platform-conformance/), [SDK Rust](/docs/polyglot/rust/) |
| Agendamentos | Os runtimes de serviço do Cloud e do Server auto-hospedado são responsáveis por agendamentos duráveis. PHP, Python e CLI expõem operações de agendamento. Rust não declara uma API de gestão de agendamentos. | [Agendamentos](/docs/features/schedules/), [Referência da CLI](/docs/polyglot/cli-reference/), [SDK Python](/docs/polyglot/python/) |
| Namespaces | Runtimes no modo de serviço são limitados por namespace. Clientes PHP/Python e CLI gerenciam namespaces onde o runtime selecionado expõe a operação; workers/clientes Rust usam um namespace, mas não declaram administração de namespaces na versão mínima atual. | [Namespace, autenticação e workers](/docs/polyglot/namespace-auth-workers/), [API do Server](/docs/polyglot/server-api-reference/) |
| Atributos de busca | Os runtimes de serviço do Cloud e do Server auto-hospedado indexam atributos de busca tipados. PHP e Python expõem interfaces de autoria/controle; CLI e APIs do operador expõem descoberta e filtragem estruturadas. | [Atributos de busca](/docs/features/search-attributes/), [SDK Python](/docs/polyglot/python/) |
| Compatibilidade de workers | SDKs registram runtime, versão do SDK, build ID, tipos suportados, versão de protocolo e capacidade; o servidor publica versões aceitas e fatos de roteamento. | [Compatibilidade](/docs/compatibility/), [Compatibilidade e roteamento de workers](/docs/polyglot/worker-compatibility-routing/) |
| Atividades locais | Disponíveis em Laravel embutido, nos SDKs de serviço PHP e Python e no SDK Rust 3.1.0 com habilitação explícita no worker. | [Execução de atividades embutida](/docs/features/activity-execution-model/), [Matriz de suporte no modo de serviço](/docs/polyglot/portable-worker-affinity/) |
| Sessões de worker | Disponíveis em Laravel embutido, nos SDKs de serviço PHP e Python e no SDK Rust 3.2.0 com habilitação explícita no worker. | [Sessões de worker](/docs/features/worker-sessions/), [Matriz de suporte no modo de serviço](/docs/polyglot/portable-worker-affinity/) |
| Execução sticky | Disponível em Laravel embutido e no SDK de serviço PHP. Python e Rust continuam sem suporte. | [Execução sticky](/docs/features/sticky-execution/), [Matriz de suporte no modo de serviço](/docs/polyglot/portable-worker-affinity/) |
| Interoperabilidade de codecs | PHP, Python e Rust usam o envelope público `codec` + `blob` e um esquema recursivo fixo Avro Value. Variantes nomeadas preservam inteiros versus doubles, texto versus bytes, booleanos versus inteiros e listas versus mapas. | [Protocolo Avro Value](/docs/polyglot/avro-value-protocol/), [Protocolo de workers](/docs/polyglot/worker-protocol/), [SDK Rust](/docs/polyglot/rust/) |
| Diagnósticos | Runtimes de serviço e CLI publicam em JSON fatos sobre versão, protocolo, workers, filas de tarefas, replay, histórico, falhas tipadas e reparo. Managed Waterline, um serviço auto-hospedado implantado separadamente ou o pacote embutido apresenta evidências do runtime responsável. | [Monitoramento](/docs/monitoring/), [Referência da CLI](/docs/polyglot/cli-reference/), [API do operador Waterline](/docs/waterline-operator-api/) |
| Ferramentas para agentes | Descobrir -> Alterar -> Executar -> Diagnosticar -> Reparar está disponível por manifestos públicos, esquemas, operações HTTP, JSON da CLI, clientes dos SDKs, histórico/diagnósticos tipados e mutações seguras. MCP é uma interface opcional, não a definição. | [Contrato de ferramentas para agentes](/docs/agent-tooling-contract/), [Ciclo operacional do agente](/docs/agent-operating-loop/) |

## Limites de interoperabilidade de payloads {#payload-interoperability-boundary}

Chamadas de workflows e atividades entre linguagens não transferem objetos
PHP serializados, pickles Python ou tipos de implementação Rust. Elas
transferem nomes de tipos registrados em string e um envelope público de
payload. Com `avro`, cada SDK oficial usa a implementação oficial da linguagem
e o mesmo esquema fixo Value; mapas, listas, strings, bytes, inteiros, doubles,
booleanos e nulos decodificados preservam seu tipo primitivo. Uma classe
específica da linguagem só é reconstruída dentro do SDK ao qual pertence.

Esse contrato vale para entrada e resultado de workflow, workflows filhos,
entrada e resultado de atividade, sinais, consultas, atualizações e execução
externa. As implantações ainda precisam verificar os codecs anunciados por
`GET /api/cluster/info` antes de admitir um worker.

## Limites de release e maturidade {#release-and-maturity-boundary}

Os contratos da plataforma indexados aqui são a interface estável do produto 2.0.
Use a [avaliação para agentes de IA](/docs/ai-agent-workflow-engine/) para
uma decisão concisa de adequação.
