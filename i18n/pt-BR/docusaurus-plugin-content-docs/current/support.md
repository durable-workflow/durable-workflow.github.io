---
sidebar_position: 15
---

# Suporte {#support}

O Durable Workflow é um projeto de código aberto, gratuito para uso sob a licença MIT. Você não precisa de um contrato comercial para executá-lo, distribuí-lo ou criar sistemas de produção com ele.

## Suporte da comunidade {#community-support}

A principal forma de obter ajuda com o Durable Workflow é pela comunidade. Esse suporte é indicado para perguntas públicas, discussões de projeto, relatos de bugs e padrões operacionais compartilhados.

Este é o melhor lugar para:

- Dúvidas de uso
- Orientações sobre modelagem de workflows
- Ajuda para entender determinismo e replay
- Compartilhar ideias e padrões
- Relatar bugs ou comportamentos inesperados

### GitHub Discussions {#github-discussions}

O GitHub Discussions é o local preferencial para perguntas mais detalhadas, discussões de projeto e assuntos que possam ajudar outras pessoas.

https://github.com/durable-workflow/workflow/discussions

### Discord {#discord}

O Discord é indicado para:

- Perguntas rápidas
- Conversas informais
- Comentários iniciais
- Colaboração com a comunidade

https://discord.gg/xu5aDDpqVy

O suporte da comunidade é prestado conforme a disponibilidade e costuma ser suficiente para desenvolvimento, experimentação e muitos casos de uso em produção.

## Limites do suporte à implantação {#deployment-support-boundary}

O Durable Workflow foi projetado para ser útil sem uma conversa com vendas. A distribuição pública prioriza intencionalmente os caminhos de implantação de que a maioria das equipes precisa primeiro:

- **Desenvolvimento local e ambientes internos fora de produção**  
  Execute o pacote ou o servidor independente localmente, em uma rede local ou em um ambiente de homologação compartilhado, para que os desenvolvedores possam executar workflows e iterar rapidamente.

- **Produção em nó único**  
  Execute o servidor independente em uma VM, VPS ou máquina interna, com banco de dados durável, cache, proxy reverso, backups e credenciais limitadas por função.

- **Implantações em pequenos clusters**  
  Execute de 2 a 3 contêineres de API sem estado atrás de um balanceador de carga, com MySQL ou PostgreSQL externo compartilhado, Redis compartilhado, workers dimensionados de forma independente e exatamente um agendador ou executor de manutenção.

- **Manifestos Kubernetes**  
  Use os manifestos fornecidos quando sua equipe já operar Kubernetes e precisar de um ponto de partida nativo dessa plataforma.

O Durable Workflow Cloud hospedado é um
[serviço de orquestração gerenciado](/docs/polyglot/cloud-control-plane) separado.
O Cloud opera seu runtime, persistência, alocação em uma única região e
recuperação; os clientes executam os clientes de SDK e os workers. Os clientes
não conectam um Server auto-hospedado ao Cloud. Replicação entre regiões,
failover regional e retorno à região original não fazem parte do contrato
atual do Cloud.

A distribuição pública prioriza intencionalmente o desenvolvimento local,
a produção em nó único e o contrato restrito de pequenos clusters descrito
no guia de auto-hospedagem. Os manifestos Kubernetes atendem às equipes que
já operam Kubernetes. O contrato de pequenos clusters permite
[atualizações graduais](/docs/rolling-upgrades) quando todas as garantias
daquela página são atendidas. A operação multirregional ativa/passiva com
failover regional conduzido pelo operador continua sendo uma orientação
de avaliação acompanhada pelo suporte; consulte
[Multirregião ativa/passiva](/docs/deployment#activepassive-multi-region)
no guia de auto-hospedagem. O chart Helm publicado oferece um caminho de
empacotamento e implantação autônomo; alterações personalizadas no chart,
infraestrutura do provedor, agendadores duplicados, operação multinó sem
Redis, failover de provedor, multirregião ativa/passiva ou ativa/ativa,
failover regional automático auto-hospedado e topologias avançadas de alta
disponibilidade continuam exigindo acompanhamento do suporte, pois dependem
de decisões específicas do ambiente sobre dimensionamento, banco de dados,
rede, segurança e atualizações.

Consulte o [guia de implantação auto-hospedada](/docs/deployment) para
conhecer a matriz de suporte, as receitas Compose com imagens publicadas,
os limites dos manifestos Kubernetes sem adaptações, as verificações de
prontidão e o ponto em que começa o trabalho acompanhado pelo suporte.

Esse limite mantém simples o caminho autônomo e permite uma assistência mais aprofundada quando a própria implantação se torna um projeto de sistemas distribuídos.

## Suporte comercial (opcional) {#commercial-support-optional}

Para equipes que precisam de garantias adicionais ou da experiência dos mantenedores, há suporte comercial e consultoria disponíveis.

O uso do Durable Workflow **não** exige um contrato comercial, e toda a funcionalidade permanece com código totalmente aberto, independentemente da contratação de suporte comercial.

O suporte comercial atende a equipes que executam o Durable Workflow em sistemas de produção nos quais correção, segurança de atualizações, topologia de implantação e semântica de execuções longas são relevantes.

## O que o suporte comercial abrange {#what-commercial-support-covers}

Os serviços de suporte comercial são conduzidos pelo mantenedor do projeto e normalmente incluem:

- **Planejamento de implantação em produção**  
  Orientação para escolher entre nó único, pequenos clusters com contrato restrito, Kubernetes e modelos acompanhados pelo suporte, incluindo a topologia de banco de dados, cache, proxy reverso, agendador e workers.

- **Planejamento de dimensionamento, confiabilidade e atualizações**  
  Ajuda com premissas de capacidade, estratégia de backup e restauração, ordem de inicialização e migração, segurança da implantação gradual e procedimentos operacionais.

- **Suporte a topologias avançadas**  
  Trabalho de projeto acompanhado pelo suporte para alterações personalizadas em charts Helm, infraestrutura Kubernetes específica de provedor, sobreposições personalizadas, projetos com agendadores duplicados, modo multinó sem Redis, implantações de alta disponibilidade, multirregião ativa/passiva ou ativa/ativa, failover regional automático auto-hospedado e replicação síncrona entre regiões. O chart publicado continua sendo um caminho de instalação autônomo; o [guia de auto-hospedagem](/docs/deployment#activepassive-multi-region) mantém o material de arquitetura e procedimentos de operação ativa/passiva para avaliação acompanhada pelo suporte. O [contrato separado do runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane) documenta os limites de alocação em uma única região, recuperação e conectividade do serviço hospedado.

- **Revisão de segurança**  
  Ajuda com credenciais limitadas por função, exposição de rede, endpoints internos e públicos, terminação TLS e limites de acesso de operadores e workers.

- **Revisões de arquitetura e projeto de workflows**  
  Orientação para modelar workflows corretamente, incluindo limites de atividades, sinais, uso de inbox/outbox e padrões de execução de longa duração.

- **Orientação sobre determinismo e segurança de replay**  
  Ajuda para identificar e evitar comportamentos não determinísticos, problemas de replay e falhas sutis de correção que possam surgir com o tempo.

- **Estratégia de atualização e versionamento**  
  Ajuda com atualizações seguras, versionamento de workflows e identificação de quando padrões como `continue-as-new` são necessários.

- **Depuração de comportamentos complexos de workflows**  
  Suporte ao diagnóstico de workflows parados, laços inesperados, problemas no tratamento de sinais e outros comportamentos do runtime difíceis de analisar.

- **Correções e backports**  
  Acesso a correções e backports para versões com suporte, ajudando a evitar a manutenção de forks privados.

- **Integrações personalizadas (mediante acordo)**  
  Ajuda para integrar o Durable Workflow a sistemas existentes, como plataformas de conversa, sistemas de aprovação, APIs internas ou ferramentas de observabilidade.

## Para quem o suporte comercial é indicado {#who-commercial-support-is-for}

O suporte comercial costuma ser adequado se você:

- Executa o Durable Workflow em **produção**
- Implanta o servidor independente para **várias equipes ou serviços**
- Cria **workflows de longa duração ou com participação humana**
- Projeta uma **topologia em cluster, Kubernetes/Helm personalizada ou específica de provedor, multirregião ativa/passiva ou ativa/ativa, ou com failover automático auto-hospedado** além dos limites operacionais comprovados da versão 2.0 em uma única região
- Opera em um ambiente em que **correção e segurança de atualizações são essenciais**
- Busca **a experiência dos mantenedores** em vez de consultoria genérica
- Quer evitar forks e riscos de manutenção de longo prazo

## Contato {#contact}

Para conversar sobre suporte comercial ou consultoria, entre em contato:

**support@durable-workflow.com**

Podemos começar com uma breve conversa para entender seu caso de uso e definir os próximos passos.
