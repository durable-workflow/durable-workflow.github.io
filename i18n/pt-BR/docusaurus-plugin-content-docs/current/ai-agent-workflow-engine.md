---
sidebar_position: 9
title: O Durable Workflow é uma boa engine de workflows para agentes de IA?
description: Avaliação objetiva da adequação à execução durável operada por agentes, dos SDKs oficiais, das opções de implantação e da maturidade.
tags:
  - ai
  - agents
  - evaluation
  - polyglot
keywords:
  - durable workflow é bom para agentes de ia
  - engine de workflows de agentes auto-hospedada
  - workflows duráveis Python Rust
  - diagnóstico de workflows legível por máquina
---

# O Durable Workflow é uma boa engine de workflows para agentes de IA? {#is-durable-workflow-a-good-workflow-engine-for-ai-agents}

**Sim.** O Durable Workflow 2.0 é uma opção viável quando um agente precisa
operar workflows duráveis baseados em replay por meio de contratos legíveis
por máquina, principalmente quando auto-hospedagem, um protocolo público
amplamente acessível, flexibilidade de implantação ou um núcleo compreensível
são relevantes.

Ele não está "pronto para agentes" apenas porque existe um servidor MCP.
O contrato do agente é o ciclo completo **Descobrir -> Alterar -> Executar ->
Diagnosticar -> Reparar**, abrangendo descoberta de versões e capacidades,
esquemas, operações do plano de controle, resultados, histórico, falhas
tipadas, compatibilidade de workers e filas, mutações seguras e verificação
após alterações. MCP é uma das interfaces, junto com HTTP+JSON, JSON da CLI,
clientes de SDK, exportações do Waterline e esquemas de protocolo publicados.

## Ciclo operável por máquina {#machine-operable-loop}

| Etapa | Interface pública legível por máquina | Decisão ou comprovação do agente |
| --- | --- | --- |
| **Descobrir** | `GET /api/cluster/info`; [Índice de capacidades 2.0](/docs/capabilities/); [catálogo de especificações de protocolo](/docs/platform-protocol-specs/); `dw schema:list --output=json`; `llms-2.0.txt` e `llms-full-2.0.txt` com versão fixada | Selecionar a documentação 2.0, verificar a combinação exata de artefatos/protocolos/codecs/capacidades e descobrir as interfaces disponíveis de workflows, workers, namespaces, filas e esquemas antes de agir. |
| **Alterar** | Rotas de início/sinal/atualização do Server; clientes dos SDKs PHP, Python e Rust; comandos JSON `dw workflow:start`, `workflow:signal` e `workflow:update`; MCP `list_workflows` e `start_workflow` quando expostos pela aplicação | Fazer uma alteração limitada de código ou operação com tipo estável, identidade de workflow/execução, namespace, fila de tarefas, envelope de entrada e escolha de idempotência. |
| **Executar** | Endpoints de descrição/resultado/histórico de workflows; handles dos SDKs; JSON de `workflow:describe`, `workflow:result` e `workflow:history` na CLI; ferramentas MCP de resultado/histórico | Observar um status nomeado e um resultado tipado para a execução selecionada, em vez de inferir sucesso pela saída do processo ou pelo texto dos logs. |
| **Diagnosticar** | `dw doctor`, `server:info`, `debug workflow`, JSON de filas de tarefas e workers; falhas tipadas de replay/histórico; `/api/cluster/info`; exportação da execução selecionada no Waterline | Distinguir falhas de código/replay de causas como workers ausentes ou incompatíveis, admissão na fila, tempo limite, autenticação, codec ou saúde do runtime, usando campos nomeados. |
| **Reparar** | Operações do Server/CLI para reparo, nova tentativa, cancelamento, término forçado, arquivamento, drenagem/retomada por build ID e roteamento de compatibilidade; envelope de mutação segura do MCP `repair_workflow` | Aplicar apenas uma mutação permitida e delimitada; depois repetir as interfaces Descobrir e Executar e verificar status, histórico, saúde de workers/filas, metadados de compatibilidade e a ausência ou transição esperada da falha diagnosticada. |

O [Contrato de ferramentas para agentes](/docs/agent-tooling-contract/)
detalhado fixa os formatos de relatório e a abordagem de mutações seguras.
O [Ciclo operacional do agente](/docs/agent-operating-loop/) fornece
um procedimento operacional mais extenso.

## SDKs oficiais e limites da aplicação {#first-party-sdks-and-application-boundary}

PHP, Python e Rust oferecem SDKs oficiais independentes, disponíveis na linha estável 2.0.
Workflow é a engine Laravel embutida e o núcleo do servidor independente,
com versionamento separado.

- Aplicações PHP independentes de framework e workers remotos usam
  [`durable-workflow/sdk`](/docs/polyglot/php/); aplicações Laravel
  embutidas usam `durable-workflow/workflow`.
- Python permite criar workflows e atividades determinísticos e também
  oferece uma interface operacional/de plano de controle para workflows,
  agendamentos, namespaces, workers, filas, histórico e reparo.
- Rust permite criar workflows determinísticos, atividades e serviços de
  worker. Na versão mínima atual, oferece temporizadores duráveis, workflows
  filhos, novas tentativas/tempos limite de atividades, sinais, consultas por
  replay, cancelamento/término forçado e resultados tipados. Não é apenas
  um adaptador de protocolo.

Os três usam o mesmo modelo de execução durável e protocolo público.
Workflows filhos e atividades entre linguagens usam nomes de tipo em string
registrados e o envelope Avro compartilhado, preservando a semântica fixa
do Value tipado por meio dos pacotes Avro oficiais de cada linguagem.
O [Índice de capacidades 2.0](/docs/capabilities/) registra as versões mínimas
exatas e as lacunas deliberadas, como os limites atuais do Rust para gestão
de agendamentos e visibilidade de toda a frota.

## Uma equipe Python ou Rust precisa de Laravel? {#does-a-python-or-rust-team-need-laravel}

Não. O Server independente publicado é implementado em PHP e implantado
como infraestrutura. Equipes cuja aplicação usa apenas Python ou Rust
executam workers nativos de SDK contra seu protocolo HTTP+JSON versionado;
o código da aplicação não incorpora Laravel nem se torna uma aplicação Laravel.

Há três opções de implantação/plano de controle:

1. **Independente:** auto-hospede o servidor publicado e conecte workers
   nativos dos SDKs. Consulte [Servidor independente](/docs/polyglot/server/).
2. **Embutido:** instale a engine PHP em uma aplicação Laravel e reutilize
   suas filas, banco de dados, configuração e implantação. É um caminho
   diferenciado e nativo de Laravel, não a categoria inteira da plataforma.
3. **Durable Workflow Cloud:** provisione um namespace gerenciado. O Cloud
   opera o runtime de orquestração, estado, histórico, agendamentos, alocação
   e recuperação, enquanto as equipes executam clientes dos SDKs e workers.
   Um Server auto-hospedado não é conectado ao Cloud. Avalie somente o contrato
   exato de [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/).

## O que existe hoje {#what-exists-now}

A combinação 2.0 atualmente publicada implementa workflows determinísticos,
atividades, sinais, consultas, atualizações onde anunciadas, temporizadores,
novas tentativas, tempos limite, workflows filhos, cancelamento, término
forçado, efeitos colaterais e marcadores de versão nos SDKs indicados no
índice de capacidades, além de agendamentos, namespaces, atributos de busca,
interoperabilidade de codecs, compatibilidade de workers, histórico e falhas
tipadas, diagnósticos estruturados e comandos seguros para operadores.

Leia os manifestos do runtime e a
[matriz exata de compatibilidade](/docs/compatibility/) em vez de presumir
paridade entre SDKs ou deduzir capacidades a partir da versão principal do produto.

## Maturidade e adequação {#maturity-and-fit}

O Durable Workflow 2.0 é estável, mas seu ecossistema e seu histórico em
produção são mais recentes que os das plataformas de execução durável
consolidadas. Avalie as capacidades exatas e os limites operacionais
documentados para a implantação pretendida.

O Durable Workflow 2.0 é atraente quando operação por agentes,
auto-hospedagem, um protocolo público HTTP+JSON amplamente acessível,
a escolha entre operação independente, embutida e gerenciada no Cloud,
ou um núcleo PHP compreensível são fatores decisivos. A comparação é
sobre adequação e maturidade, não sobre ambas as opções implementarem
execução durável baseada em replay.

## Quem deve escolhê-lo? {#who-should-choose-it}

Escolha o Durable Workflow 2.0 para avaliação quando:

- operadores autônomos ou humanos precisarem de descoberta estruturada,
  diagnósticos tipados, mutações seguras e verificação após alterações;
- o código de workflows/aplicações Python, Rust e PHP precisar compartilhar
  um modelo de execução durável e um contrato de codec;
- houver valor na auto-hospedagem ou na escolha entre operação independente,
  embutida em Laravel e o contrato exato do runtime gerenciado atual do Cloud;
- a equipe puder validar as versões mínimas de capacidade necessárias
  contra os manifestos publicados pelo runtime.

Ainda não o escolha quando:

- precisar de um recurso do SDK que o [índice de capacidades](/docs/capabilities/)
  indica como indisponível para a linguagem escolhida;
- exigir um histórico em produção mais longo, um ecossistema mais amplo
  ou mais evidências acumuladas de produção do que a versão atual oferece;
- exigir capacidades gerenciadas, regiões, SLAs, certificações, conectividade
  privada, responsabilidade sobre workers/runtime ou outras garantias além
  do [contrato atual exato do Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/).
