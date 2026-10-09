---
sidebar_position: 1
description: Escolha Durable Workflow Cloud, um Server sob sua administração ou Laravel integrado e conclua seu primeiro workflow com um SDK oficial.
tags:
  - concepts
  - getting-started
  - workflows
keywords:
  - durable workflow
  - execução durável
  - orquestração durável
  - workflows em vários linguagens
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Introdução {#introduction}

O Durable Workflow 2.0 mantém o estado e o histórico dos workflows fora dos
processos de curta duração da aplicação. Assim, workers de PHP, Python e Rust
podem retomar o trabalho com segurança após um reinício. Comece pelo
[Guia de início rápido](/docs/quickstart/) para levar um workflow ao estado
`completed` antes de consultar o [Índice de capacidades](/docs/capabilities/).

## Escolha um modelo de implantação {#choose-a-deployment-model}

### Modo de serviço {#service-mode}

As aplicações acessam um ambiente de execução durável remoto pelos SDKs
oficiais. Escolha quem opera esse ambiente:

- **[Durable Workflow Cloud](/docs/polyglot/cloud-control-plane/)** é a opção
  gerenciada. O Durable Workflow opera a orquestração, a persistência e o
  Managed Waterline. Sua equipe executa os clientes e workers do SDK no
  namespace provisionado. **Usuários do Cloud não instalam nem executam
  Durable Workflow Server ou um serviço Waterline separado.**
- **[Server sob sua administração](/docs/polyglot/server/)** oferece a mesma
  interface de serviço. Sua equipe implanta, protege, dimensiona, faz backups
  e atualiza o ambiente. O Waterline é um serviço de observação separado que
  você pode implantar para acessar o namespace administrado pelo Server.

As duas opções compartilham o plano de controle HTTP+JSON versionado, o
protocolo de workers, o modelo de namespaces e o envelope de dados independente
da linguagem. Consulte [Modelos de implantação](/docs/polyglot/deployment-modes/)
para entender as responsabilidades de cada modelo.

### Laravel integrado {#embedded-laravel}

O modo integrado é um modelo de implantação para aplicações Laravel que
mantêm o estado dos workflows, as filas, a configuração e as ferramentas de
operação na própria infraestrutura. Ele instala `durable-workflow/workflow`,
sem se conectar ao Cloud ou exigir um Server separado. O pacote Waterline
integrado lê o estado da aplicação no mesmo processo.

Siga a [Instalação integrada](/docs/installation/) quando quiser que a aplicação
seja responsável por esse ambiente.

Equipes Laravel que vêm da versão estável v1 ou estão reconsiderando uma
implantação integrada de 2.0 podem consultar o
[Guia de adoção e transição de ambiente no Laravel](/docs/laravel-adoption/)
para comparar os caminhos executáveis do modo integrado e do SDK PHP antes
de alterar o tráfego.

## Escolha um SDK para o modo de serviço {#choose-a-service-mode-sdk}

- **[SDK PHP](/docs/polyglot/php/):** instale `durable-workflow/sdk` em uma
  aplicação PHP independente de framework ou em um worker remoto.
- **[SDK Python](/docs/polyglot/python/):** escreva workflows determinísticos
  e atividades e use o cliente assíncrono do plano de controle. A
  <PythonPackageReleaseLink authority="qualified">versão estável do
  Python</PythonPackageReleaseLink> consta no mesmo manifesto de versões
  estáveis usado pelo guia de início rápido do Server.
- **[SDK Rust](/docs/polyglot/rust/):** escreva workflows determinísticos e
  atividades e execute serviços de workers nativos.

Os três são implementações oficiais da mesma interface pública. O guia de
[Capacidades de clientes e workers](/docs/polyglot/cli-python-parity/)
explica os recursos disponíveis e as diferenças entre as interfaces.

## Seu primeiro workflow concluído {#your-first-completed-workflow}

O [Guia de início rápido](/docs/quickstart/) apresenta o objetivo, a escolha do
ambiente, os requisitos, o tempo estimado e o resultado esperado. Você pode
seguir um caminho em PHP, Python ou Rust, um de cada vez. O caminho local usa
artefatos publicados sem exigir o código-fonte do produto. O caminho do Cloud
usa os dados de conexão do namespace gerenciado, sem executar Server.

## Como as partes do modo de serviço se conectam {#how-service-mode-fits-together}

Uma implantação no modo de serviço tem três partes:

- **O ambiente de execução** mantém o estado durável, os comandos e o
  histórico, a atribuição de tarefas, os temporizadores, os agendamentos, os
  namespaces e os protocolos autenticados. O Cloud opera os namespaces
  gerenciados. Sua equipe opera o ambiente quando administra o Server.
- **Os workers da aplicação** executam workflows e atividades pelos SDKs de
  PHP, Python ou Rust. Eles podem ser implantados junto com a aplicação ou
  como serviços independentes e escalar separadamente do ambiente.
- **Os clientes e as ferramentas de operação** iniciam, inspecionam e
  controlam o mesmo estado pelos SDKs, pelo CLI `dw`, pelas APIs HTTP, pelos
  esquemas legíveis por máquina, pelo Waterline e pelas interfaces para agentes.

## Um contrato público de execução durável {#one-public-durable-execution-contract}

Os SDKs oficiais compartilham nomes de tipos de workflow e atividade
registrados como strings e um envelope público de dados. O envelope identifica
seu codec e contém valores portáveis, em vez de serialização PHP, pickles do
Python ou tipos internos do Rust.

Os workers de workflow reconstroem as decisões a partir dos comandos e do
histórico durável. Entradas e resultados de atividades e workflows filhos podem
cruzar linguagens quando os workers anunciam o mesmo codec público e registram
os mesmos nomes de tipos. Consulte o [Índice de capacidades](/docs/capabilities/)
e as informações do ambiente antes de depender de uma interface específica de
um SDK.

## Aprenda com os exemplos do seu modelo {#learn-from-the-matching-examples}

- **Modo de serviço e várias linguagens:** siga o
  [Guia de início rápido](/docs/quickstart/) e o guia do SDK escolhido.
- **Laravel integrado:** explore os padrões nativos do Laravel e as
  informações do Waterline na galeria [Sample App](/docs/sample-app/).

Para Cloud ou Server sob sua administração, comece pelo guia do modo de
serviço. A galeria integrada é voltada ao Laravel.

## Operação por agentes com um contrato explícito {#agent-operable-by-contract}

Pessoas e agentes autônomos usam o mesmo contrato legível por máquina.
O ciclo verificável é **Descobrir → Alterar → Executar → Diagnosticar → Reparar**:
manifestos de versões e capacidades, comandos explícitos, resultados
estruturados, histórico tipado, diagnósticos de workers e filas, alterações
seguras e verificação posterior. Consulte o
[Ciclo de operação de agentes](/docs/agent-operating-loop/) e o
[Avaliador de motores para agentes de IA](/docs/ai-agent-workflow-engine/).

## Você precisa de um workflow? {#do-you-need-a-workflow}

Provavelmente precisa se:

- O processo dura minutos, horas ou dias.
- Você precisa aguardar uma aprovação humana.
- Você precisa aguardar um webhook ou outro evento externo.
- Você quer pausar e continuar depois sem manter um processo em execução.
- Você precisa retomar após uma falha sem causar erros ou duplicar trabalho.

Se a tarefa é executar cinco jobs em ordem e parar na primeira falha, uma cadeia
de jobs costuma ser mais adequada. O Durable Workflow atende a casos em que
a próxima etapa depende de um evento externo, de uma espera ou de uma decisão
que não pode ser conhecida antecipadamente.
