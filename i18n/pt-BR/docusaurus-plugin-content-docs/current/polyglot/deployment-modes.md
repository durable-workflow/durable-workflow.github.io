---
sidebar_position: 2
title: Modos de implantação
description: Escolha o modo serviço com Durable Workflow Cloud ou Server sob sua administração, ou integre o runtime ao Laravel.
tags:
  - deployment
  - server
  - laravel
  - polyglot
keywords:
  - modos de implantação Durable Workflow
  - modo integrado
  - modo serviço
  - Durable Workflow Cloud
  - Server independente
  - Cloud ou infraestrutura própria
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# Modos de implantação {#deployment-modes}

<ProductPromotion source="docs-v2-deployment-modes">
Escolha o modo serviço gerenciado para seus workers PHP, Python ou Rust sem
operar o runtime de orquestração.
</ProductPromotion>

Durable Workflow v2 tem dois modos de implantação:

- **Modo serviço:** aplicações e workers se conectam por SDKs a um runtime
  remoto. Escolha [Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)
  ou [Server sob sua administração](/docs/polyglot/server/).
- **Modo integrado:** uma aplicação Laravel instala
  `durable-workflow/workflow` e opera o runtime diretamente.

Cloud e Server sob sua administração são opções de runtime dentro do modo
serviço. Não são componentes para executar juntos. No Cloud, Durable Workflow
opera a orquestração e a persistência, enquanto os clientes executam os clientes
dos SDKs e os workers. O Cloud inclui Managed Waterline. **Clientes do Cloud não
instalam, implantam nem conectam um serviço próprio de Server ou Waterline.**
Um Server sob sua administração não inclui Waterline. Operadores podem implantá-lo
separadamente, conectado a um namespace pertencente ao Server.

Use esta página para decidir quem deve operar uma frota de workflows, planejar
a transição entre modos ou documentar quais partes do contrato permanecem
iguais nos dois modos.

Equipes Laravel podem seguir o
[Guia de adoção do Laravel e transição de runtime](/docs/laravel-adoption/)
para os caminhos da v1 para v2 e do modo integrado para serviço, incluindo a
integração publicada do SDK PHP e seu fake de testes para Laravel.

## Escolha um runtime em modo serviço {#choose-a-service-mode-runtime}

| Runtime | Quem opera o estado durável | O que sua equipe executa | Comece aqui |
| --- | --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow opera o runtime gerenciado do namespace, a persistência, as atualizações, o endpoint de serviço e o Managed Waterline. | Clientes da aplicação e workers PHP, Python ou Rust com credenciais provisionadas. Não execute Server nem um serviço Waterline separado. | [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/) |
| Server sob sua administração | Sua equipe implanta, protege, escala, faz backup e atualiza o Server e sua persistência. | Server, clientes da aplicação e workers PHP, Python ou Rust. Se quiser, implante Waterline como serviço separado conectado a um namespace pertencente ao Server. | [Server sob sua administração](/docs/polyglot/server/) |

As duas opções usam o mesmo modelo de cliente e worker. A diferença está na
operação do runtime e nas credenciais, não no código dos workflows.

## Mesmo modelo durável, outra fronteira {#same-durable-model-different-boundary}

O modo integrado e o modo serviço usam o mesmo núcleo v2. O que muda é a
fronteira de hospedagem, autenticação e transporte ao redor dele. O modo serviço
expõe o mesmo núcleo por APIs HTTP+JSON para o plano de controle e os workers.
Não há gRPC obrigatório nem um segundo mecanismo.

| Recurso | Modo integrado | Modo serviço | O que permanece igual |
| --- | --- | --- | --- |
| Modelo de workflow durável | A aplicação Laravel hospeda o pacote e grava o estado no runtime da aplicação. | Cloud ou Server sob sua administração mantém o estado por trás da API de serviço. | Identificadores de workflow e execução, histórico tipado, resultados de comandos, novas tentativas, regras de reparo e exportação de histórico seguem o mesmo contrato v2. |
| Plano de controle | Inícios e comandos vêm do código da aplicação, de `WorkflowStub` ou das ferramentas locais de operação. | Inícios e comandos passam pela API do Server, CLI ou SDKs em HTTP+JSON, com autenticação e cabeçalhos de protocolo explícitos. Clientes PHP independentes de framework usam `DurableWorkflow\Client` do pacote `durable-workflow/sdk`. | Política de início duplicado, seleção de execução, identificadores de comando e resultados nomeados permanecem iguais. Envie os comandos seguintes ao runtime que aceitou o início. |
| Transporte dos workers | Workers de fila do Laravel executam tarefas de workflow e atividade na implantação da aplicação. | Workers se registram, fazem long polling, enviam heartbeats e concluem trabalho pelo protocolo HTTP+JSON. Workers PHP remotos usam `DurableWorkflow\Worker` do pacote `durable-workflow/sdk`. | Leases de tarefas, marcadores de compatibilidade, regras de replay e execução de atividades pelo menos uma vez permanecem iguais. |
| Despacho padrão de tarefas | Normalmente, as tarefas são enviadas à fila Laravel no processo da aplicação. | O runtime de serviço usa despacho por polling para que workers externos encontrem trabalho por HTTP. Operadores de Server sob sua administração podem alterar esse padrão explicitamente. | O ciclo de tarefa pronta, adquirida e reparada e o modelo de tarefa durável permanecem iguais. |
| Chaves de tipos de workflow e atividade | Aliases PHP podem apontar para classes locais da aplicação. | Workers anunciam as chaves de tipos suportadas no registro. | As chaves públicas devem ser estáveis e independentes de linguagem. Nomes de classe PHP totalmente qualificados ou tipos PHP espelhados não devem ser o contrato público. |
| Ferramentas de operação | O pacote Waterline integrado ou as ferramentas locais leem o estado durável da aplicação Laravel no próprio processo. | Cloud oferece Managed Waterline para o namespace. Operadores de Server podem implantar Waterline separadamente. APIs de serviço, CLI e SDKs também leem o estado mantido pelo runtime. | Atributos de busca, memos, estado da execução, diagnóstico de filas e exportação de histórico são fatos duráveis no runtime que possui a execução. Waterline não combina runtimes nem namespaces. |
| Autenticação e isolamento | A aplicação Laravel define a autenticação de suas próprias rotas e sessões. | A seleção de namespace e os tokens ou assinaturas de autenticação do Server são fronteiras obrigatórias da API. | Nomes de namespace, filas de tarefas, marcadores de compatibilidade e contrato fixo de payload Avro devem permanecer estáveis na transição. |
| Descoberta do runtime | A aplicação resolve serviços no processo ou pela configuração local. | Workers e clientes usam uma URL base remota explícita. | Não dependa de `APP_URL` ou `APP_KEY` compartilhados, de pressupostos sobre localhost nem de descoberta no mesmo container. |
| Migração | Execuções integradas existentes continuam onde começaram. | Novas execuções em modo serviço começam no Cloud ou Server escolhido e permanecem lá. | Não há migração automática de execuções em andamento entre modos. A exportação serve para auditoria e diagnóstico, não para importar estado vivo. |

## Quando escolher o modo integrado {#choose-embedded-mode-when}

- Sua aplicação Laravel reúne código de workflows, execução dos workers e
  acesso de operadores em uma implantação.
- O modelo existente de fila e autenticação da aplicação é a fronteira adequada
  para operar workflows.
- Você quer um runtime compacto e autossuficiente, sem precisar de um protocolo
  de workers independente de linguagem.
- Seus operadores podem usar Waterline ou as ferramentas da aplicação como
  interface principal dos workflows.

Comece por [Instalação integrada](/docs/installation/) e pela
[Documentação integrada](/docs/category/embedded/), incluindo o grupo de
configuração.

## Quando escolher o modo serviço {#choose-service-mode-when}

- Várias aplicações ou equipes devem compartilhar um runtime de workflows.
- Workers, clientes do plano de controle ou operadores usam outras tecnologias
  além de Laravel e PHP.
- Você precisa de uma fronteira remota explícita de autenticação e namespace
  entre clientes e mecanismo de workflow.
- Você quer escalar a entrada da API, o matching e despacho e os workers de forma
  independente, dentro da [Topologia de papéis do Server](/docs/polyglot/server-role-topology)
  suportada.
- Com Server sob sua administração, você quer implantar Waterline como
  observador de um namespace pertencente ao Server. O Cloud já inclui Managed
  Waterline.

Para um runtime gerenciado, comece por
[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/).
Para infraestrutura própria, comece por [Server](/docs/polyglot/server/) e
[Implantações sob sua administração](/docs/deployment/). Depois, escolha o
[SDK PHP](/docs/polyglot/php/), [SDK Python](/docs/polyglot/python/) ou
[SDK Rust](/docs/polyglot/rust/). Usuários do Cloud operam pelo Managed Waterline.
Operadores de Server podem consultar a
[Referência da API do Server](/docs/polyglot/server-api-reference/) e
[Monitoramento](/docs/monitoring#waterline-service) ao implantar um serviço
Waterline separado.

## Ferramentas de migração para modo serviço sob sua administração {#migration-tooling-to-self-hosted-service-mode}

O caminho suportado do modo integrado para serviço é a adoção em etapas, sem
transferência de estado de execuções em andamento:

- Siga [Migração do modo integrado para Server](/docs/polyglot/embedded-to-server)
  para a transição passo a passo.
- Use `GET /api/cluster/info` para confirmar build, topologia e capacidades do
  Server de destino antes de mudar o tráfego.
- Use `POST /api/worker/register` e o protocolo de workers para verificar que
  workers externos atendem às chaves de tipos estáveis escolhidas.
- Use `GET /api/system/operator-metrics`, `dw worker:list` ou as telas de operação
  do Waterline para verificar o registro de workers e a cobertura da frota
  compatível antes de mudar o tráfego de produção.
- Consulte [Capacidades de clientes e workers](/docs/polyglot/cli-python-parity/)
  ao substituir chamadas locais do plano de controle por automação via Server.
- Use Managed Waterline do Cloud, Waterline conectado a um runtime sob sua
  administração ou a exportação nativa de histórico do Server para auditoria e
  diagnóstico. Pacotes exportados não importam execuções vivas gerenciadas pelo
  Server.

Três regras de migração são obrigatórias:

1. Execuções existentes permanecem no runtime onde começaram.
2. Novas execuções gerenciadas pelo Server usam chaves de tipos, namespaces,
   filas de tarefas e o contrato fixo de payload Avro estáveis desde a primeira
   etapa da transição.
3. Sinais, consultas, atualizações, reparos, cancelamentos, terminações e
   arquivamentos devem ir ao runtime que possui a execução de destino.

## Referências relacionadas {#related-references}

- [Instalação](/docs/installation)
- [Server](/docs/polyglot/server)
- [SDK PHP](/docs/polyglot/php)
- [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane)
- [Migração do modo integrado para Server](/docs/polyglot/embedded-to-server)
- [Topologia de papéis do Server](/docs/polyglot/server-role-topology)
- [Referência de configuração do Server](/docs/polyglot/server-config-reference)
