---
sidebar_position: 13
title: Implantações sob sua administração
description: Escolha um caminho suportado de implantação do Durable Workflow v2 sob sua administração e o artefato inicial.
---

# Implantações sob sua administração {#self-hosting-deployments}

O Durable Workflow v2 suporta várias topologias sob sua administração. Escolha
o menor caminho que corresponda ao ambiente que você opera e mantenha explícito
o contrato de imagem, banco de dados, cache, autenticação, prontidão e atualização.

Este guia abrange a distribuição do servidor independente. Se você executa o
pacote Laravel integrado à própria aplicação, use as páginas de instalação e
configuração do pacote. O Durable Workflow Cloud é uma opção separada de serviço
gerenciado, na qual o Cloud opera o runtime, a persistência, o posicionamento e
a recuperação. Um Server sob sua administração nunca é conectado ao Cloud.
Consulte [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane).
O contrato atual do Cloud é de runtime gerenciado e fronteira de recuperação
em uma única região. Ele não promete replicação entre regiões, failover
regional automático nem retorno à região original.

A distribuição do Server sob sua administração não inclui nem opera o Waterline.
Implante o Waterline separadamente apenas quando quiser sua interface de
operação e conecte-o a um namespace sob responsabilidade do Server usando o
[guia de implantação e monitoramento do Waterline](/docs/monitoring/#waterline-service).
O Cloud inclui o Managed Waterline para seu namespace gerenciado.

## Matriz de suporte de implantação {#deployment-support-matrix}

| Caminho | Ponto de partida | Suportado para | O que este caminho não promete | Quando começa o suporte comercial |
| --- | --- | --- | --- | --- |
| Desenvolvimento local e ambientes internos fora de produção | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) com `%%artifact.serverTagEnv%%` ou `%%artifact.serverImageEnv%%` | Uma máquina de desenvolvimento, demonstrações em LAN, homologação compartilhada, testes de integração de SDKs e workers | Produção exposta à internet, garantias de backup durável, rotação rigorosa de segredos, failover entre nós | Você quer ajuda para transformar um ambiente de desenvolvimento funcional em um manual de operação de produção |
| Produção em nó único | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) com arquivo de ambiente de produção, volumes MySQL e Redis, tokens com escopo por papel, backups, TLS por proxy reverso e tags ou digests de imagem fixados | Uma VM, VPS ou host Docker interno com estado persistente de workflows e um modelo operacional simples | Alta disponibilidade do host, failover automático de banco de dados, recuperação entre regiões, mudanças importantes de topologia sem indisponibilidade | A implantação atende tráfego de produção e você quer revisão dos procedimentos de backup, restauração, autenticação, TLS, atualização ou reversão |
| Implantação em cluster pequeno | Imagens publicadas `durableworkflow/server` ou `ghcr.io/durable-workflow/server` usando a [receita Compose](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) como modelo de contêiner/processo, com 2 a 3 nós de API, MySQL/PostgreSQL externo compartilhado, Redis compartilhado, workers escalados independentemente e exatamente um agendador/executor de manutenção | Capacidade horizontal de API e workers quando um nó deixa de ser suficiente. Atualizações graduais quando todas as garantias do [contrato de atualização gradual](/docs/rolling-upgrades) forem atendidas | Clusters SQLite, modo com múltiplos nós sem Redis, agendadores duplicados como topologia permanente, bancos com múltiplos escritores ativo/ativo, failover regional sem intervenção sob sua administração, promessas amplas de SLA de "cinco noves" ou "zero indisponibilidade" e failover de alta disponibilidade em região única por conta própria até que seu [critério de evidência da release](#release-evidence-status) seja atendido | Você precisa planejar dimensionamento, domínios de falha, implantação ou recuperação em mais de um host, ou pretende afirmar o comportamento de alta disponibilidade em região única sujeito a esse critério |
| Chart Helm para Kubernetes | O [chart Helm mantido pelo Server](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow) de `oci://ghcr.io/durable-workflow/charts/durable-workflow`, com seu banco de dados externo, Redis, ingress e gerenciamento de segredos | Um caminho repetível de instalação e atualização de produção para os recursos de servidor, worker, agendador único, bootstrap, serviço, verificações e políticas do chart | Persistência incluída, infraestrutura gerenciada pelo provedor, múltiplas regiões ativo/ativo, operadores personalizados e failover de alta disponibilidade em região única por conta própria até que seu [critério de evidência da release](#release-evidence-status) seja atendido | Você precisa de arquitetura, capacidade, recuperação específicas de provedor ou alterações fora do contrato de valores publicados do chart |
| Manifestos Kubernetes diretos | Os manifestos [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) do repositório Server, com imagens publicadas do servidor e seu banco de dados, Redis, ingress e gerenciamento de segredos existentes | Equipes que já operam Kubernetes e querem manifestos inspecionáveis para API, worker, agendador, bootstrap, serviço, verificações, configuração e segredos | O ciclo de vida separado do Helm, validação de provedor Kubernetes gerenciado, múltiplas regiões ativo/ativo, operadores personalizados, decisões de armazenamento/rede/segurança específicas do ambiente e failover de alta disponibilidade em região única por conta própria até que seu [critério de evidência da release](#release-evidence-status) seja atendido | Você precisa de overlays, validação de cluster gerenciado, planejamento de produção específico de provedor ou pretende afirmar o comportamento de alta disponibilidade em região única sujeito a esse critério |
| Avaliação de múltiplas regiões ativo/passivo | Uma implantação validada em nó único ou cluster pequeno por região, replicação assíncrona do banco de dados do ativo para a reserva e um manual revisado de failover/retorno | Avaliação de arquitetura conduzida pelo suporte e ensaio específico do ambiente para recuperação regional de desastres | Um contrato 2.0 comprovado para operação por conta própria, múltiplas regiões ativo/ativo, failover regional automático ou sem intervenção, replicação síncrona entre regiões (RPO=0), visibilidade ativa entre regiões ou busca federada, ou filas de tarefas fixadas por região como eixo de roteamento imposto pelo mecanismo | Antes de depender de replicação entre regiões, failover, retorno, RPO ou RTO em produção |
| Topologias conduzidas pelo suporte | Um projeto revisado com base no seu ambiente | Múltiplas regiões ativo/passivo ou ativo/ativo sob sua administração, failover regional sem intervenção, replicação entre escritores com RPO=0, agendadores duplicados como topologia permanente, segurança/rede sob medida, SLOs privados, overlays personalizados, planejamento de migração | Operação por conta própria apenas copiando e colando | A própria topologia faz parte do risco do produto |

A distribuição pública é intencionalmente otimizada para desenvolvimento local,
produção em nó único e implantações em cluster pequeno. Manifestos Kubernetes
são fornecidos para equipes que já operam Kubernetes. O material de múltiplas
regiões ativo/passivo está disponível como guia de avaliação conduzida pelo
suporte (consulte [Múltiplas regiões ativo/passivo](#activepassive-multi-region)
abaixo), e não como contrato 2.0 comprovado para operação por conta própria.
O failover de alta disponibilidade em região única, incluindo failover de banco
gerenciado, Redis gerenciado, perda de nó de API, perda de worker e reinício do
agendador dentro de uma região, é atualmente conduzido pelo suporte enquanto
seu critério de evidência da release exata permanece fechado (consulte
[Alta disponibilidade e failover em região única](#single-region-high-availability-and-failover)
abaixo). Em implantações de servidor sob sua administração, múltiplas regiões
ativo/ativo, failover regional automático, agendadores duplicados como topologia
permanente e validação de Kubernetes gerenciado específica de provedor continuam
conduzidos pelo suporte porque dependem das suas escolhas de banco de dados,
cache, rede, segurança, executor e atualização. O chart Helm publicado é um
caminho de empacotamento para operação por conta própria dentro desses mesmos
limites sob responsabilidade do operador. O Cloud fornece atualmente operação
e recuperação gerenciadas em uma única região, sem replicação entre regiões nem
failover regional. Consulte [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane).
Veja os [limites do suporte](/docs/support) para conhecer o modelo de suporte comercial.

## Entregáveis de recuperação de produção {#production-recovery-deliverables}

Chamar uma topologia de "pronta para produção" significa publicar o conjunto de
recuperação dessa topologia, além de iniciar os contêineres. Mantenha as
evidências mais recentes no mesmo manual dos comandos de implantação:

| Caminho | Conjunto mínimo de recuperação publicado |
| --- | --- |
| Produção em nó único | Agenda de backups, imagem ou digest fixado, localização do snapshot de ambiente/configuração, defasagem máxima aceitável da restauração e data/hora do último ensaio de restauração bem-sucedido com evidências de verificação. |
| Implantação em cluster pequeno | O conjunto de nó único e o impacto esperado da perda de um nó de API, nó de worker, agendador/executor de manutenção, Redis ou banco compartilhado, as etapas de novo registro de workers após a restauração e a estratégia documentada de atualização gradual ou parada total da release atual. |
| Chart Helm para Kubernetes | O conjunto de cluster e a versão do chart, revisão de valores, digest de imagem, responsáveis por ingress e segredos específicos do cluster e o último ensaio de atualização/reversão do chart. |
| Manifestos Kubernetes diretos | O conjunto de cluster e os responsáveis específicos por armazenamento, segredos, ingress e implantação do cluster, que precisam ser restaurados ou reaplicados antes de declarar o tráfego saudável novamente. |
| Avaliação de alta disponibilidade em região única (conduzida pelo suporte enquanto o critério de evidência da release estiver fechado) | O conjunto de cluster ou manifestos diretos e evidências de ensaio para failover de banco gerenciado, failover de Redis gerenciado, perda de nó de API, perda de worker e reinício de agendador, cada um concluído dentro da meta de recuperação publicada no [contrato de alta disponibilidade em região única](#single-region-high-availability-and-failover), sem perda de escritas confirmadas. |
| Avaliação de múltiplas regiões ativo/passivo (conduzida pelo suporte) | O conjunto por região e o projeto de replicação e isolamento de escrita do banco de dados, atraso de replicação medido, RPO/RTO sob responsabilidade do operador, manuais de promoção e retorno e evidências de ensaio específicas do ambiente. |

Se não conseguir apresentar esse conjunto quando solicitado, trate o ambiente
como homologação até que o contrato de recuperação esteja documentado e ensaiado.
Os [Limites operacionais do operador](/docs/operator-operating-envelope) definem
a ordem de restauração, a verificação e a frequência de ensaios que esses
conjuntos devem seguir.

## Postura de segurança, dados e auditoria {#security-data-and-audit-posture}

Implantações do Durable Workflow sob sua administração herdam a maioria dos
controles de segurança do ambiente que você opera. Publique estes fatos no
mesmo conjunto de release ou manual de operação que a tag da imagem, plano de
migração e evidências de recuperação:

| Área | Declaração fiel da release |
| --- | --- |
| Tratamento de dados | Argumentos, resultados, histórico, memos, atributos de busca, rótulos de visibilidade, contexto de comandos, registros de auditoria, mensagens de exceção e notas do operador podem conter dados da aplicação do cliente. [IDs de workflow](./defining-workflows/workflow-id.md#ids-are-visible-metadata), atributos de busca e rótulos são metadados visíveis ao operador, não armazenamento de segredos. IDs de workflow permanecem em texto simples e não são abrangidos por codecs de payload. |
| Criptografia | Use TLS em toda interface HTTP de produção e configure [TLS do banco de dados](./polyglot/server-config-reference.md#database-tls) em cada papel do Server, inclusive migrações. A criptografia em repouso vem do seu banco de dados, armazenamento de objetos, sistema de arquivos, fila, cache e gerenciador de segredos. O pacote Workflow e o servidor não criptografam automaticamente cada campo de payload. |
| Conformidade | O pacote de código aberto e o servidor sob sua administração fornecem controles e evidências de auditoria, não uma certificação de conformidade por si só. Alegações como SOC 2, HIPAA, PCI, ISO ou FedRAMP pertencem ao seu próprio programa, a menos que uma oferta hospedada documente o contrário. |
| Logs de auditoria | Comandos de workflow, eventos de auditoria de agendamentos, metadados de exportação de histórico e registros de chamadas de serviço fornecem evidências operacionais duráveis. Eles não são um SIEM completo, sistema DLP, registro externo imutável ou sistema de retenção legal, a menos que você adicione esses componentes. |
| Suporte | Credenciais com escopo por papel, terminação TLS, backups, ensaios de restauração e topologias restritas para operação por conta própria são documentados aqui. Identidade avançada, implantação de mTLS, redes privadas, mecanismos de política personalizados, conformidade de provedores e revisão de topologias sob medida são conduzidos pelo suporte, salvo indicação contrária na documentação pública. |

A postura de rede deve ser explícita:

- **Entrada de webhooks:** documente o endpoint público, método de autenticação,
  estratégia de replay ou idempotência, limite de tempo, limite de payload,
  configuração de cabeçalhos de proxy confiáveis e plano de rotação de segredos.
- **Tráfego de worker para backend:** use verificação TLS, credenciais de worker
  com escopo por papel, cabeçalhos de namespace, rede privada ou mTLS quando
  workers atravessarem uma rede não confiável e uma rotação que não conceda
  capacidades de operador a tokens de worker.
- **Interfaces de operador:** coloque Waterline, APIs de operador do servidor
  independente, endpoints de automação CLI e painéis administrativos personalizados
  atrás de sessões autenticadas ou credenciais de serviço com escopo por papel,
  com proteção CSRF para sessões de navegador e limites de proxy/TLS documentados.

## Imagens publicadas {#published-images}

Use imagens publicadas para implantações do servidor sob sua administração:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Fixação por digest: `durableworkflow/server@sha256:...` ou
  `ghcr.io/durable-workflow/server@sha256:...`

Use tags mutáveis apenas em experimentos locais. Arquivos de ambiente de
produção devem fixar uma tag de versão ou digest específico para que as etapas
de atualização e reversão sejam auditáveis.

## Desenvolvimento local e ambientes internos fora de produção {#local-development-and-internal-non-production}

Use a receita Compose com imagem publicada quando quiser um ambiente sem
código-fonte, com MySQL e Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

Verifique a API, a prontidão, a descoberta do cluster e o registro de workers:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

Esse caminho é seguro para desenvolvimento e homologação interna. Ele não é
uma fronteira de segurança de produção: o exemplo usa um token de compatibilidade,
senhas padrão de serviços, volumes nomeados locais e não usa TLS.

## Produção em nó único {#single-node-production}

Use o mesmo artefato Compose com a configuração de produção fora do controle
de versão:

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

Inicie com esse arquivo de ambiente:

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

Opere o host como um serviço de produção:

- Coloque TLS, roteamento público, logs de requisições e listas de IPs permitidos
  em um proxy reverso à frente do contêiner de API.
- Não exponha MySQL nem Redis publicamente.
- Use `DW_WORKER_TOKEN` para workers, `DW_OPERATOR_TOKEN` para tráfego de
  aplicações e operadores e `DW_ADMIN_TOKEN` para trabalho de namespace e administração.
- Faça backup do volume MySQL antes de toda atualização de imagem e em uma
  agenda regular. O Redis deve ser preservado para reinícios ordenados, mas o
  MySQL continua sendo a fonte de verdade do histórico durável de workflows.
- Mantenha juntos o arquivo de ambiente exato, a tag ou digest da imagem e o
  backup do banco de dados para restaurações.

Ordem de atualização:

1. Faça backup do MySQL e registre a referência da imagem atual.
2. Altere apenas `DW_SERVER_IMAGE` ou `DW_SERVER_TAG`.
3. Baixe a nova imagem.
4. Execute `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait`.
5. Confirme `/api/ready`, `/api/cluster/info` e o registro de workers antes de
   mudar o tráfego externo.

O README do servidor mantém os exemplos mais recentes de comandos Compose na
seção [Imagem oficial + Compose](https://github.com/durable-workflow/server#official-image--compose).

## Implantações em cluster pequeno {#small-clustered-deployments}

Um cluster pequeno é uma extensão modesta do modelo de nó único. O contrato
validado para operação por conta própria é intencionalmente restrito:

- Execute 2 a 3 contêineres de API sem estado atrás de um balanceador de carga.
  Integridade, prontidão, descoberta do cluster, registro de workers, consulta
  de tarefas de workflow e conclusão de tarefas de workflow devem funcionar
  sem sessões fixas.
- Use um banco de dados externo MySQL ou PostgreSQL compartilhado para o
  histórico durável. O SQLite é exclusivo de nó único e não é um backend de
  persistência para clusters.
- Use Redis compartilhado para cache, sinais de reativação de long-poll, locks
  da fila de tarefas de consulta, locks de admissão da fila de tarefas e estado
  das filas. O modo com múltiplos nós sem Redis não é um contrato de cluster suportado.
- Verifique `GET /api/cluster/info` em cada nó de API durante a implantação.
  `topology.current_shape` deve permanecer `standalone_server`,
  `topology.current_roles` deve incluir `api_ingress`, `control_plane`,
  `matching` e `history_projection`, e `topology.execution_mode` deve permanecer
  `remote_worker_protocol` nos nós de servidor independente. Use
  `topology.matching_role` para confirmar o caminho de matching realmente implantado:
  nós padrão informam `queue_wake_enabled: true`, `shape: "in_worker"` e
  `wake_owner: "worker_loop"`, enquanto implantações com matching dedicado mudam
  nós com `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` para `queue_wake_enabled: false`,
  `shape: "dedicated"` e `wake_owner: "dedicated_repair_pass"`. O mesmo bloco deve
  continuar anunciando o `task_dispatch_mode` pretendido, os eixos de roteamento
  consolidados em `partition_primitives` e o `backpressure_model` atual.
  Consulte [Topologia de papéis do Server](/docs/polyglot/server-role-topology)
  para o significado de cada campo do manifesto de topologia.
- Escale workers externos de SDK independentemente dos nós de API. Workers
  podem executar em hosts ou processos separados, mas devem se comunicar com
  o endpoint de API balanceado em vez de um nó fixo.
- Configure a [admissão de filas de tarefas](/docs/polyglot/task-queue-admission)
  para filas que protegem um tenant, API externa, pool de banco de dados ou
  outra dependência compartilhada posterior.
- Execute exatamente um agendador ou processo de manutenção para avaliar
  agendamentos, aplicar limites de tempo de atividades e podar o histórico.
- Execute bootstrap/migrações uma vez por implantação, antes que novos
  contêineres de API e worker aceitem tráfego.
- Escolha uma estratégia para esta release: parada total (drene workers, pare
  agendador/manutenção, substitua nós de API, execute bootstrap/migrações e então
  reinicie workers e agendador) ou [atualizações graduais](/docs/rolling-upgrades)
  quando todas as garantias desse contrato forem atendidas.
- Trate banco de dados e Redis como domínios primários de falha. Contêineres
  de servidor são substituíveis. As camadas de persistência e coordenação não são.

As receitas publicadas para operação por conta própria começam na topologia
`standalone_server`, embora a descoberta do cluster também indique
`split_control_execution` como topologia suportada do produto. Trate isso como
um contrato com atribuições diferentes de papéis, não como um segundo produto
de servidor. Se testar uma divisão mais explícita de papéis depois, continue
lendo `topology.current_shape`, `topology.current_roles` e
`topology.matching_role` em `/api/cluster/info` em vez de deduzir funções por
nomes de hosts ou contêineres. A página [Topologia de papéis do Server](/docs/polyglot/server-role-topology)
explica essas atribuições e o caminho de migração em um só lugar.

Todo nó de API deve usar os mesmos tokens de autenticação ou chaves de assinatura,
versão de aplicação, versão do pacote Workflow, configuração de codec de payload,
conexão com banco de dados e conexão Redis. Atribua a cada nó de API um
`DW_SERVER_ID` exclusivo para que a descoberta do cluster e os logs possam distingui-los.

Os limites não suportados são explícitos: clusters SQLite, modo com múltiplos
nós sem Redis, agendadores duplicados como topologia permanente, bancos com
múltiplos escritores ativo/ativo, failover regional sem intervenção sob sua
administração e promessas amplas de SLA de "cinco noves" ou "zero indisponibilidade"
precisam de validação separada ou projeto conduzido pelo suporte antes de você
depender deles. A orientação de múltiplas regiões ativo/passivo também é material
de avaliação conduzida pelo suporte. Consulte [Múltiplas regiões ativo/passivo](#activepassive-multi-region)
abaixo. O failover de alta disponibilidade em região única, com failover de banco
gerenciado, Redis gerenciado, perda de nó de API, perda de worker e reinício do
agendador dentro de uma região, é um contrato de avaliação conduzida pelo suporte
até que o critério de evidência da release seja atendido. Consulte
[Alta disponibilidade e failover em região única](#single-region-high-availability-and-failover)
abaixo para as metas de recuperação do mecanismo, regras de prontidão durante
um failover e evidências necessárias para atender a esse critério.

Esse caminho permite operação por conta própria quando sua equipe já tem um
modelo claro de VM, rede, banco de dados, cache, backup e balanceador de carga.
Ele passa a ser conduzido pelo suporte quando você precisa de ajuda para decidir
esses limites, capacidade, ordem de implantação ou procedimentos de recuperação.

## Orçamentos de timeout para long polls de workers {#worker-long-poll-timeout-budgets}

Um poll saudável pode ficar silencioso até terminar a espera do servidor. Preveja esse silêncio no cliente HTTP do worker, proxy de saída, service mesh, balanceador público, ingress e cada proxy reverso antes da API. Os workers usam o ingress compartilhado da API; uma função de matching separada não evita esses saltos.

| Orçamento | O que limita |
| --- | --- |
| Duração do poll no servidor | A espera por trabalho antes de responder sem tarefa. O `timeout_seconds` da requisição prevalece sobre `DW_WORKER_POLL_TIMEOUT`, que é o padrão quando o campo é omitido, não o máximo para os SDKs. O protocolo permite até 60 segundos. |
| Timeout de conexão / pool do cliente | Estabelecer uma conexão ou obtê-la do pool. Essas fases não precisam durar todo o poll silencioso. |
| Timeout de leitura / total do cliente | Esperar bytes da resposta ou toda a operação, se o transporte tiver um limite total. Some à espera do servidor uma margem para conexão, agendamento e resposta. Um timeout de leitura pode medir inatividade entre blocos, não a requisição inteira. |
| Timeout idle / leitura upstream / requisição dos intermediários | Todos os limites de requisições ativas em cada salto devem permitir o poll legítimo e sua resposta. O keepalive da conexão entre requisições é outro limite. |
| Encerramento / prazo do chamador | O orçamento de encerramento do worker e a autoridade original do chamador ou consulta continuam sendo limites rígidos. Cancele ou drene dentro deles. Não estenda o prazo de uma consulta por causa de proxy ou retry. |

Confira o cálculo do SDK instalado. Na versão de Python verificada abaixo, um poll positivo solicita até 60 segundos ao servidor e recebe pelo menos cinco segundos adicionais por fase HTTP. O poll padrão do Worker é de 35 segundos, normalmente selecionando 40 segundos para essas fases. Um intermediário com limite de leitura de 30 segundos pode interromper um poll legítimo. PHP e Rust têm seus próprios padrões e políticas; nem a margem do Python nem um ajuste de gRPC keepalive é uma regra universal. Consulte os guias de [PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/), [Rust](https://rust.durable-workflow.com/) e a [referência de matching](./polyglot/task-matching-dispatch.md).

Chamadas comuns do control plane com `Client` no PHP SDK **3.2.0** não fornecem um prazo HTTP total padrão. Veja a [lacuna verificada em PHP #203](https://github.com/durable-workflow/sdk-php/issues/203). Configure um cliente HTTP com limites para essas chamadas e preserve o prazo original do chamador. O timeout de polling do Worker não limita todas as requisições do SDK.

### Exemplo verificado de poll curto {#verified-poll-timeout-example}

Uma verificação isolada usou Python SDK **2.9.0**, PHP Server **2.11.0** e Nginx **1.30.5** publicados, com uma fila vazia. Ambas as células mantiveram o poll em **3 segundos**, os timeouts connect/read/write/pool do HTTPX em **8 segundos** e o limite externo do chamador em **10 segundos**. Só mudou o timeout de leitura upstream do Nginx:

| Configuração do intermediário | Resposta observada |
| --- | --- |
| `proxy_read_timeout 1s` | Nginx retornou HTTP **504** após cerca de um segundo aguardando o cabeçalho upstream. O SDK apresentou `ServerError`. |
| `proxy_read_timeout 8s` | O poll silencioso terminou após cerca de três segundos com HTTP **200**, `task: null` e `poll_status: empty`. |

O padrão do servidor foi deliberadamente de um segundo nas duas células; a espera explícita de três segundos da requisição continuou valendo. Os retries HTTP foram limitados a uma tentativa para expor a primeira falha. É um exemplo funcional, não um resultado de capacidade ou dimensionamento de produção. A [verificação em #267](https://github.com/durable-workflow/durable-workflow.github.io/issues/267) registra imagens exatas, requisições e logs.

No Nginx, aplique um orçamento upstream adequado ao location existente de polling dos workers. Os oito segundos abaixo pertencem a este exemplo de poll de três segundos:

```nginx
proxy_connect_timeout 2s;
proxy_read_timeout 8s;
```

[O Nginx mede `proxy_read_timeout` entre leituras upstream](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout). [HTTPX distingue conexão, leitura, escrita e pool](https://www.python-httpx.org/advanced/timeouts/); oito segundos por fase não são um prazo total de oito segundos. Mantenha um prazo externo explícito quando necessário. Outros proxies e provedores usam nomes e semânticas diferentes. Verifique o caminho completo com o SDK real: aumentar um limite do ingress não corrige outro menor em um salto diferente.

### Diagnosticar a resposta antes de reiniciar workers {#diagnose-poll-disconnects}

- **Poll vazio normal:** o runtime retorna uma resposta bem-sucedida sem tarefa. Na versão verificada, a resposta bruta é `poll_status: empty`. Continue o polling normalmente.
- **Desconexão do intermediário:** exceção de transporte, reset ou 502/504 do proxy pode ocorrer antes do fim da espera legítima. Correlacione erro e duração com logs do proxy/upstream. Readiness saudável e polling posterior bem-sucedido não descartam configuração incorreta.
- **Runtime indisponível:** inspecione o motivo estruturado e os checks de readiness de banco, cache e admissão. Uma página HTML do gateway não é uma recusa tipada do runtime.
- **Recusa de admissão de namespace ou poll:** confira motivo, namespace/fila e atraso de retry, inclusive HTTP 429. Aumentar o timeout idle não concede capacidade nem corrige autorização.

Um worker reconectando não prova que a configuração original do proxy era saudável. Confira se o polling e a conclusão de tarefas realmente continuam; retenha classe da falha, fila, horário e frequência se persistirem. Uma desconexão esporádica não exige reiniciar o processo. O cliente Python também pode sintetizar `poll_status: timeout` após retries de timeout HTTP; isso, por si só, não prova que uma resposta vazia do runtime passou pelo proxy. Separe retries de transporte, retries de atividade, prazos de runs e autoridade de consultas.

## Orçamentos de conexões SQL {#sql-connection-budgets}

Planeje as sessões do banco antes de adicionar réplicas de API ou sobrepor
processos antigos e novos durante uma
[atualização gradual](/docs/rolling-upgrades). O banco pode atingir o limite
de conexões mesmo com CPU disponível. Esse limite é distinto da latência de
escrita/commit, da capacidade HTTP e do crescimento dos dados retidos.

### Conte todos os processos que usam SQL {#count-every-sql-owning-process}

O deployment PHP Compose publicado tem estes possíveis clientes SQL:

| Papel | O que contar |
| --- | --- |
| API | Cada processo PHP que atende uma requisição simultânea e pode usar SQL, incluindo prontidão, operações e polls em espera. A configuração Apache prefork publicada permite 24 processos de requisição por contêiner de API. É um teto de processos HTTP, não um pool SQL nem uma medição de 24 sessões abertas. |
| Workers de fila Laravel | Cada processo `php artisan queue:work`. A receita Compose publicada executa um; contêineres worker adicionais acrescentam processos. Eles são distintos dos workers externos dos SDKs. |
| Agendador/manutenção | Comandos PHP simultâneos, não apenas o contêiner do agendador. O Compose executa avaliação de agendamentos, reparo, expiração de atividades e poda em sequência. Assim, o loop normal tem um comando ativo por vez. Preserve a regra de um único agendador. |
| Inicialização e ferramentas operacionais | Comandos de migração/inicialização, reconstrução de projeções, retenção, backups, monitoramento e clientes SQL interativos que possam se sobrepor ao deployment. Conte separadamente os comandos executados simultaneamente de propósito. |
| Clientes e workers dos SDKs | Normalmente nenhuma sessão direta no banco do Server, pois os SDKs PHP, Python e Rust em modo de serviço usam HTTP. Adicione conexões somente se suas atividades ou outro código da aplicação realmente acessarem esse banco. |

Conte **os identificadores de conexão SQL distintos usados por processo**, não
apenas contêineres ou nomes de host. A conexão padrão do Laravel e
`workflows.storage.connection` podem compartilhar um nome configurado. Outro
nome de armazenamento, uma conexão SQL de fila/cache/sessão ou conexões
separadas de leitura/escrita/diretas podem abrir uma sessão adicional, mesmo
no mesmo endpoint. Conexões Redis não são sessões SQL. Inspecione a
configuração efetiva em cache e os nomes realmente usados por cada papel.

Em um deployment FPM próprio, conte processos de execução PHP-FPM, não threads
do nginx ou Apache event. No Octane, inventarie workers de requisição, workers
de tarefas e clientes reais do banco. Não use os 24 processos do Apache como
tamanho de pool desses frontends. Long polls síncronos ocupam um processo PHP
enquanto aguardam e podem manter uma sessão SQL. Não atribua automaticamente
consumo SQL zero a um poll HTTP ocioso.

### Exemplo conservador de atualização gradual {#a-conservative-rolling-upgrade-example}

Este é um exemplo de planejamento, **não capacidade medida**. Considere um
limite de 120 sessões cliente, dez para outras aplicações e quinze reservadas
para recuperação/administração. Restam 95 para este deployment. Considere
fila/cache em Redis e no máximo uma conexão SQL por processo PHP.

| Sobreposição máxima | Cálculo | Sessões planejadas |
| --- | --- | ---: |
| Réplicas de API, incluindo uma réplica adicional no rollout | `(2 + 1) × 24 × 1` | 72 |
| Workers de fila Laravel | `2 × 1` | 2 |
| Comando único de agendador/manutenção | `1 × 1` | 1 |
| Inicialização/migração | `1 × 1` | 1 |
| Backup, monitoramento e outras ferramentas aprovadas | Reserva explícita | 4 |
| **Subtotal do deployment** | | **80** |
| Margem do deployment ainda não alocada | `95 − 80` | 15 |

Nessas condições, uma quarta réplica de API elevaria o subtotal para 104,
ultrapassando a alocação de 95 sessões. Duas conexões SQL por processo de API
já exigiriam 144 sessões apenas para as três réplicas de API. Recalcule ao
alterar conexões de armazenamento, quantidade de workers ou sobreposição do
rollout. Reduza os tetos de processos/réplicas ou substitua por etapas, sem
presumir que o banco absorverá a sobreposição. Aumentar `max_connections`
também exige revisar memória e carga do banco.

### Observe e aplique o orçamento {#observe-and-enforce-the-budget}

1. Registre o limite efetivo de conexões, clientes de outras aplicações e
   acesso reservado para recuperação. Defina máximos de réplicas/processos API
   e de réplicas adicionais no rollout. Inclua gerações de workers de fila e
   ferramentas sobrepostas.
2. Em uma cópia isolada com sua imagem publicada e configuração exatas,
   observe sessões em repouso, com polls em espera, durante trabalho real e
   numa sobreposição antiga/nova limitada. Inclua sessões ociosas e o próprio
   monitor. PostgreSQL expõe `pg_stat_activity`; MySQL,
   `information_schema.PROCESSLIST`. Use um papel de monitoramento com escopo
   apropriado e não exporte texto SQL nem payloads.
3. Compare sessões observadas por usuário/banco com a alocação por processo.
   Uma amostra curta valida as premissas desse ambiente de teste, não um limite
   de saturação ou garantia para qualquer carga.
4. Acompanhe a folga de sessões junto com recusas de conexão, latência de
   transação/commit, espera por bloqueios, requisições HTTP retidas e
   crescimento do armazenamento. Prontidão sozinha não prova folga para rollout.
5. Perto do limite, reduza a sobreposição ou drene e retire um grupo antigo
   de API/worker antes de iniciar seu substituto. Preserve acesso de recuperação
   e execute inicialização apenas na janela de migração planejada. Se uma
   sobreposição segura não couber, use o procedimento documentado com parada total.

A [admissão de filas](/docs/polyglot/task-queue-admission) limita certas
operações de despacho e lease. `DW_WORKER_LONG_POLL_MAX_CONCURRENT` e
`DW_QUERY_TASK_POLL_MAX_CONCURRENT` limitam polls em espera por nó. Nenhum
limita globalmente sessões SQL, bytes do banco ou latência de commit. Reserve
também capacidade para conclusões, heartbeats, operações e verificações de saúde.

Use como referência um endpoint direto e gravável do banco. Um proxy deve ser qualificado com a versão exata do Server, modo de pool e configurações de instruções preparadas, limites de transações, estado da sessão e bloqueios. **O pool transacional do PgBouncer exige o Server corrigido, versão 2.9.8 ou posterior.** A [aceitação da versão publicada 2.9.8](https://github.com/durable-workflow/server/issues/524#issuecomment-6293185092) qualifica PostgreSQL 16.15 com PgBouncer 1.26.1: PostgreSQL direto, pool de sessões e pool transacional com `max_prepared_statements=0` ou `max_prepared_statements=200`. Isso define uma versão mínima compatível e uma configuração exata testada, não uma fixação na versão mais recente nem uma garantia de capacidade; qualifique outras combinações separadamente. Execute a inicialização habitual `server-bootstrap` no endpoint escolhido antes de admitir tráfego.

`GET /api/ready` executa uma leitura do banco com parâmetros vinculados (`bound_read_query`) e as verificações de prontidão configuradas; a capacidade de escrita fica explicitamente sem verificação. Uma conexão TCP, migração ou resposta de prontidão bem-sucedida não comprova todas as operações SQL do workflow nem a capacidade de commit. Réplicas de leitura não devem substituir o escritor autoritativo usado para claims e transições duráveis.

## Chart Helm para Kubernetes {#helm-chart-for-kubernetes}

O repositório Server mantém o
[código-fonte do chart e as orientações de release](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow).
Instale o chart publicado pelo registro OCI:

```bash
helm install durable-workflow \
  %%artifact.helmChartRepository%% \
  --version %%artifact.helmChartVersion%% \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

O arquivo de valores deve apontar para MySQL/PostgreSQL e Redis externos, fornecer credenciais de produção por Kubernetes Secrets existentes e configurar ingress/TLS para o ambiente. O chart não cria persistência ou infraestrutura gerenciada pelo provedor. Fixe a imagem do Server por digest para uma implantação reproduzível.

### Escolher uma versão do chart {#helm-chart-selection}

Cada versão do chart registra em `appVersion` do `Chart.yaml` a imagem do Server com que foi testada; chart e Server têm números de versão independentes. A [combinação compatível selecionada](./compatibility.md#last-qualified-reproducible-tuple) associa o chart **%%artifact.helmChartVersion%%** ao Server **%%artifact.helmChartAppVersion%%**, usando os mesmos metadados da tabela e do comando de instalação. A [verificação OCI/do pacote publicado](%%artifact.helmChartQualificationUrl%%) comprova esse par, não uma nova instalação Kubernetes.

Para outra versão do Server, inspecione o `Chart.yaml` do chart publicado candidato (o [código do chart selecionado](%%artifact.helmChartSourceUrl%%) é um exemplo) e selecione uma versão exata cujo `appVersion` corresponda ao Server desejado. Leia as [notas UPGRADING](%%artifact.helmChartUpgradeUrl%%) da versão selecionada, incluindo cada versão do chart atravessada. Não deduza a versão do chart a partir da versão do Server nem selecione um chart não publicado do código atual.

Sobrescrever `image.tag` altera a imagem sem alterar o `appVersion` registrado no chart. Isso cria uma combinação personalizada até que ela receba sua própria qualificação de manifestos gerados, bootstrap, rollout e runtime. Inclua os backups normais e os limites de rollback no plano de atualização; gerar os manifestos com sucesso não comprova que a implantação funciona.

O histórico publicado inclui uma exceção: o chart 0.2.2 atravessou uma versão minor do Server com um número patch do chart. A [correção publicada posterior](https://github.com/durable-workflow/server/blob/2.11.0/k8s/helm/durable-workflow/docs/UPGRADING.md#chart-022--server-210) reconhece essa exceção e retoma a política declarada de versões minor. Versões históricas ficam inalteradas; esta nota não seleciona a combinação posterior de Server/chart.

## Manifestos Kubernetes {#kubernetes-manifests}

O repositório do servidor inclui manifestos diretos em
[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) para equipes
que já operam Kubernetes:

- Namespace e rótulos compartilhados
- Separação de ConfigMap e Secret
- Job de bootstrap/migração
- Deployment e Service da API
- Deployment de worker
- CronJob do agendador
- PodDisruptionBudget
- Verificações de atividade em `/api/health` e de prontidão em `/api/ready`
- Solicitações e limites conservadores de recursos

Antes de aplicar os manifestos, substitua a tag da imagem por uma versão
publicada ou digest específico, forneça credenciais reais do banco de dados e
Redis e conecte os valores do ConfigMap aos serviços que seu cluster já opera.
Os manifestos são intencionalmente diretos e inspecionáveis. Eles não são um
chart Helm nem prometem comportamento genérico de Kubernetes gerenciado.

Em uma implantação de produção no Kubernetes, comprove no mínimo:

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

O failover de alta disponibilidade em região única, com failover de banco
gerenciado, Redis gerenciado, perda de nó de API, perda de worker e reinício de
agendador dentro de uma região, continua conduzido pelo suporte no caminho de
manifestos diretos, assim como no de cluster pequeno, enquanto o critério de
evidência da release estiver fechado. O contrato pretendido exige as regras de
prontidão, agendador único e infraestrutura compartilhada descritas em
[Alta disponibilidade e failover em região única](#single-region-high-availability-and-failover)
abaixo. Balanceadores de carga, classes de armazenamento e políticas de rede
específicos de provedor, múltiplas regiões ativo/ativo e failover regional sem
intervenção sob sua administração continuam conduzidos pelo suporte ou tratados
separadamente do contrato de manifestos diretos. Use o caminho Helm com versão
independente acima quando quiser instalação e atualizações gerenciadas pelo Helm.

## Alta disponibilidade e failover em região única {#single-region-high-availability-and-failover}

O failover de alta disponibilidade em região única é atualmente um contrato
candidato **não verificado e conduzido pelo suporte**, sobre as topologias de
cluster pequeno e Kubernetes com manifestos diretos. Ele visa aos modos de falha
aos quais o mecanismo foi projetado para sobreviver **dentro de uma região**:
failover de banco gerenciado (RDS Multi-AZ, failover de cluster Aurora, Cloud SQL
HA, promoção Patroni etc.), failover de Redis gerenciado (Sentinel, failover de
grupo de replicação Elasticache, Memorystore HA etc.), perda de nó de API,
perda de worker e reinício de agendador/executor de manutenção. A recuperação
ativo/passivo entre regiões é outra avaliação, conduzida pelo suporte.
Consulte [Múltiplas regiões ativo/passivo](#activepassive-multi-region) abaixo.

O contrato pretendido, com comportamento do mecanismo, regras de prontidão,
metas de recuperação por evento, regras de prevenção de split-brain e teste de
aceitação do ensaio, está na biblioteca Workflow em
[`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md)
e no servidor independente em
[`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md).
Esta seção é a interface pública desses documentos.

### Situação da evidência da release {#release-evidence-status}

Não há um resultado aprovado da release exata vinculado à release pública
documentada do servidor. A tentativa registrada com a imagem publicada parou em
`topology_start`, enquanto aguardava a prontidão da API, antes que qualquer
alegação sobre a matriz de falhas ou limites de recuperação pudesse ser
estabelecida. Não trate a presença do executor, seu manifesto de cenários ou
um ensaio específico de implantação como evidência de que a imagem publicada
passou pela matriz completa. Portanto, a alta disponibilidade em região única
continua conduzida pelo suporte.

A descrição como operação por conta própria só é autorizada depois que uma
execução sem código-fonte usar a release exata documentada do servidor para
imagem, executor e topologia Compose e publicar um
`single-region-failover-result.json` com `outcome: "pass"`, `runner_blocked: false`,
todas as entradas de `phase_outcomes` com `status: "pass"`, todos os veredictos
de limites de recuperação aprovados e evidências de cada cenário obrigatório no
[manifesto público de cenários de failover em região única](/platform-conformance/single-region-failover-scenarios.json).
Esse resultado público aprovado deve ser vinculado nesta seção de situação e
nomear a mesma imagem de servidor que `%%artifact.serverDockerHubImage%%`.
Até que todas essas condições sejam atendidas, os limites de recuperação abaixo
são metas de avaliação, e não alegações de validação da imagem publicada.

### Topologia candidata {#candidate-topology}

O contrato pretendido de alta disponibilidade se aplica quando a implantação
corresponde à topologia de cluster pequeno ou de manifestos diretos e o operador
preserva três regras:

- **Sempre um endpoint gravável de banco de dados de workflows.** O failover
  gerenciado (RDS Multi-AZ, failover de cluster Aurora, Cloud SQL HA, Patroni etc.)
  é permitido desde que o primário anterior seja isolado antes de se reconectar:
  revogue o usuário de escrita, rebaixe com `read_only=on`, corte a replicação
  ou restaure de um snapshot comprovadamente funcional. Um proxy deve preservar
  a semântica de banco usada pelo Server e ser qualificado para sua versão
  exata, modo e configurações. Veja os
  [orçamentos de conexões SQL](#sql-connection-budgets) para os requisitos de versão
  e os modos testados do pool transacional PgBouncer.
- **Um endpoint Redis por vez, com um caminho documentado de promoção.**
  O failover de Redis gerenciado (Sentinel, failover de grupo de replicação
  Elasticache, Memorystore HA etc.) é permitido. O Redis é a camada de aceleração,
  não a base da correção. Por isso, seu failover é um evento de latência, nunca
  um evento de correção.
- **Sempre um agendador/executor de manutenção.** O orquestrador (serviço Compose
  com `deploy.replicas: 1`, unidade systemd protegida por um lease no host ou
  `Deployment` Kubernetes com `replicas: 1` e `RollingUpdate.maxSurge: 0`) é
  responsável por manter a invariável de instância única durante o reinício.
  Agendadores duplicados como topologia permanente não fazem parte deste contrato.

### Comportamento por evento e metas de recuperação {#per-event-behavior-and-recovery-targets}

O contrato pretendido do mecanismo define metas limitadas de recuperação para
cada classe de evento. Elas não são garantias da imagem publicada enquanto o
critério de evidência da release estiver fechado. O tempo real de recuperação
observado pelo operador é a meta do mecanismo somada à latência de promoção do
próprio serviço gerenciado.

| Evento | Comportamento candidato do mecanismo | Meta de recuperação (após a volta da infraestrutura / executor) |
| --- | --- | --- |
| Failover de banco de dados gerenciado | Escritas retornam erros e não são armazenadas silenciosamente em buffer. Leituras retornam erros. `/api/ready` falha em todos os nós de API e no agendador. Nenhum trabalho confirmado é perdido. | Uma reconexão do pool de conexões, mais um ciclo de `task_repair` (padrão 3s), mais um limite de tempo de long-poll (padrão 30s, máximo 60s) para pollers em andamento. |
| Failover de Redis gerenciado | Sinais de reativação perdidos → a descoberta recorre ao limite de tempo de long-poll. Verificações de integridade da camada de aceleração passam a **warning**, não a erro. `/api/ready` normalmente continua indicando sucesso. | Intervalo de reconexão do cliente Redis. |
| Perda de nó de API (1 de N) | O balanceador retira o nó com falha dentro do intervalo de prontidão. Requisições em andamento nesse nó falham no balanceador e o cliente tenta novamente. | Intervalo de prontidão do balanceador (controlado pelo operador, normalmente 5 a 10s). |
| Perda de worker | Tarefas retidas pelo worker com falha pausam até a expiração do lease. Outros workers continuam assumindo suas próprias tarefas. | Expiração do lease (5 min para tarefas de atividade), mais um ciclo de `task_repair`. |
| Reinício de agendador/manutenção | Disparos de agendamentos, aplicação de limites de tempo de atividades e poda de histórico pausam. Os três retomam no próximo ciclo após reiniciar. Não há disparos duplicados porque o executor é único. | Latência de reinício do orquestrador, mais um ciclo do agendador. |

### Regras de balanceador, prontidão e mudança de tráfego {#load-balancer-readiness-and-traffic-shift-rules}

O balanceador de carga à frente dos nós de API é o único ponto de decisão
para admissão de tráfego durante um failover:

- Conecte o balanceador a **`GET /api/ready`**, além de `/api/health`.
  `/api/health` só comprova que o processo atende HTTP. `/api/ready` informa
  conectividade e verificações de prontidão configuradas, incluindo se a
  aceleração de reativação do Redis está saudável ou degradada. Ele não testa
  todas as operações SQL de workflows nem verifica capacidade de escrita. Durante uma
  indisponibilidade do banco, `/api/ready` falha corretamente em todos os nós.
  O balanceador DEVE tolerar o estado de todos indisponíveis em vez de recorrer
  a uma lista desatualizada de "últimos nós conhecidos como saudáveis".
- Use um intervalo de verificação de 5 a 10 segundos e um limiar de retirada de
  2 a 3 falhas consecutivas.
- Não exija sessões fixas. O teste básico de cluster pequeno comprova que um
  worker externo pode consultar `server-a` e concluir em `server-b`.
- Durante um failover apenas do Redis, a prontidão continua indicando sucesso
  em todos os nós enquanto os caminhos duráveis baseados em banco de dados
  estiverem disponíveis. A degradação da camada de aceleração aparece como
  `checks.cache.status=warning` com
  `checks.cache.degraded_capability=long_poll_wake_acceleration`. Não configure
  o balanceador para retirar nós por esse aviso.

Após recuperar a infraestrutura, a sequência recomendada é aguardar
`/api/ready` retornar 200 em pelo menos um nó, acessar `/api/cluster/info`
com curl pelo balanceador usando um token administrativo para confirmar o
manifesto de topologia, emitir `POST /api/worker/register` para um worker de
verificação pelo endpoint balanceado, confirmar que exatamente um executor de
agendador está ativo no orquestrador e retomar o tráfego externo.

### Execute o ensaio com os artefatos exatos {#run-the-exact-artifact-rehearsal}

A release do servidor inclui um ensaio básico reutilizável destinado a exercitar
a matriz completa de falhas sem compilar código do produto a partir de um
checkout. O executor e a topologia Compose devem vir da mesma tag de release
da imagem do servidor. Não combine um checkout variável do branch padrão com
uma imagem arbitrária. Em um host limpo com Docker Engine, Docker Compose v2,
Python 3.11 ou mais recente e acesso a registros públicos, execute:

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

Esse caminho deriva deliberadamente o checkout e `DW_SERVER_IMAGE` de uma única
variável de release. Não substitua a imagem de forma independente. Selecione
outra release alterando `DW_SERVER_RELEASE` antes de clonar. O executor exige
uma tag ou digest concreto e público do servidor, baixa todas as imagens de
apoio, resolve todas as imagens de runtime para digests de repositório e rejeita
seções de build Compose, montagens diretas de código-fonte do produto e referências
locais ou mutáveis do servidor. Ele inicia exatamente dois nós de API atrás de
um endpoint nginx, um banco MySQL, um serviço Redis e um agendador/executor de manutenção.

O `single-region-failover-result.json` resultante usa o esquema
`durable-workflow.v2.single-region-failover.result`. Ele registra versões exatas
de artefatos e ferramentas, topologia normalizada, transições de prontidão,
tempos de recuperação medidos e veredictos dos limites, identidades de
workflow/execução/tarefa/agendamento e asserções de duplicação/perda para conclusão
entre nós, perda de nó de API, interrupção de banco de dados, interrupção de
Redis, perda de lease de worker e reinício do agendador único. Executores
externos descobrem a invocação e o manifesto público de cenários em
`GET /api/cluster/info`, em `single_region_failover_contract`.

Um resultado só valida interrupção e recuperação visíveis ao mecanismo com a
imagem publicada quando atende ao critério de evidência da release acima.
Um resultado com falha, parcial ou bloqueado pelo executor é evidência de
diagnóstico, não validação. Mesmo uma execução básica aprovada não transforma
o reinício de um contêiner local MySQL ou Redis em evidência do mecanismo de
promoção de um provedor de nuvem. Mantenha evidências de promoção nativa do
provedor, isolamento de escrita, RPO e tempo decorrido junto ao resultado básico
antes de afirmar alta disponibilidade de serviço gerenciado.

### Acréscimos ao conjunto de recuperação {#recovery-packet-additions}

Uma implantação de cluster pequeno ou manifestos diretos que afirme atender
a este contrato DEVE ampliar seu conjunto de recuperação (conforme os
[Limites operacionais do operador](/docs/operator-operating-envelope)) com
evidências de ensaio para cada classe de evento:

- um failover de banco gerenciado concluído sem perda de escritas confirmadas
  e dentro do limite de tempo de recuperação acima;
- um failover de Redis gerenciado que não faça a rotação do balanceador oscilar,
  não perca trabalho confirmado e exponha `checks.cache.status=warning` com
  `long_poll_wake_acceleration` como capacidade degradada;
- um evento de perda de nó de API absorvido pelo balanceador dentro do intervalo
  configurado de prontidão, sem perda de escritas confirmadas;
- um evento de perda de worker que preserve a execução durável até a expiração
  do lease, readquira-a após o limite configurado de reparo e a conclua exatamente uma vez;
- um reinício do agendador em outro host que não dispare agendamentos duplicados
  nem deixe algum agendamento sem avaliação além de seu `next_fire_at` mais um ciclo.

Enquanto o critério de evidência da release estiver fechado, toda implantação
continua conduzida pelo suporte, mesmo se seu próprio ensaio passar. Depois
que um resultado público aprovado em todas as fases atender ao critério da
release, uma implantação passa a permitir operação por conta própria sob este
contrato somente após registrar as evidências de ensaio específicas do ambiente
no conjunto de recuperação do operador e atualizá-las na frequência publicada
nos Limites operacionais do operador.

### Limites de alegações não suportadas de alta disponibilidade {#boundary-against-unsupported-ha-claims}

O contrato de alta disponibilidade em região única é intencionalmente restrito.
Os itens a seguir permanecem **fora** dele e continuam exigindo uma revisão de
projeto conduzida pelo suporte. A própria topologia faz parte do risco do produto:

- topologias de banco com múltiplos escritores ativo/ativo;
- múltiplas regiões ativo/passivo e failover regional automático ou sem intervenção
  para topologias sob sua administração (a [próxima seção](#activepassive-multi-region)
  mantém orientações de avaliação);
- replicação síncrona de banco de dados entre regiões (RPO=0);
- agendadores/executores de manutenção duplicados como topologia permanente;
- filas de tarefas fixadas por região como eixo de roteamento imposto pelo mecanismo;
- validação de Kubernetes gerenciado específica de provedor além do contrato
  de empacotamento do chart publicado;
- promessas amplas de SLA de "cinco noves" ou "zero indisponibilidade" além dos
  tempos limitados de recuperação acima.

O contrato é de *recuperação limitada durante eventos específicos*, não uma
promessa de disponibilidade que dependa das escolhas de banco de dados, rede
e orquestrador do operador. A linguagem de marketing ou SLA para implantações
sob sua administração NÃO DEVE ultrapassar esse limite sem validação dedicada.

## Múltiplas regiões ativo/passivo {#activepassive-multi-region}

Múltiplas regiões ativo/passivo são **orientação de avaliação conduzida pelo
suporte**, não um contrato comprovado para operação por conta própria dentro dos
limites operacionais suportados da 2.0. Use esta seção para revisar uma
arquitetura candidata e criar um ensaio específico do ambiente com o suporte
antes de depender dela em produção. Cada região ainda começa por um caminho
documentado de nó único, cluster pequeno ou Kubernetes com manifestos diretos,
mas esses contratos de região única não estabelecem replicação entre regiões,
failover, retorno, RPO, RTO nem comportamento de split-brain. O material de
projeto aprofundado, incluindo autoridade sobre dados, premissas de replicação,
comportamento de namespace/fila de tarefas/worker, manual de failover e retorno,
isolamento de escrita e compromissos entre consistência e latência, está na
biblioteca Workflow em
[`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md)
e no servidor independente em
[`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

A topologia candidata a avaliar:

- Uma **região ativa** executando o contrato validado de nó único ou cluster
  pequeno: contêineres de API atrás de um balanceador, MySQL ou PostgreSQL externo
  compartilhado como banco durável gravável, Redis compartilhado, exatamente um
  agendador/executor de manutenção e workers externos.
- Uma **região de reserva** mantendo uma réplica assíncrona de reserva do banco
  de workflows, Redis de reserva opcional, nenhum processo de agendador/manutenção
  e zero ou mais contêineres de API/worker pré-provisionados e ociosos até a promoção.
- Um **failover regional** que é trabalho explícito do operador: interromper
  tráfego de escrita para a região com falha, confirmar o estado de replicação
  em relação ao RPO publicado, promover o banco de reserva, executar no novo
  primário as migrações exigidas pela release, iniciar o agendador/executor de
  manutenção único na nova região ativa, mudar endpoints de workers, mudar
  tráfego externo e reconstruir projeções derivadas. Não há transição automática
  entre regiões.
- Um **retorno à região original** que execute a mesma sequência em sentido
  inverso quando a região original voltar ao serviço, com o primário recuperado
  isolado antes de se reconectar como reserva (revogue o usuário de escrita,
  rebaixe com `read_only=on`, corte a replicação ou restaure de um snapshot
  comprovadamente funcional).

Autoridade sobre dados e premissas de replicação:

- O banco de workflows é a única fonte de verdade durável e fica vinculado à
  região: exatamente uma região grava nele em cada instante. O banco da região
  de reserva é uma réplica de leitura até a promoção. O objetivo de ponto de
  recuperação (RPO) é o atraso da replicação assíncrona. O objetivo de tempo de
  recuperação (RTO) é o tempo de execução do manual pelo operador.
- O Redis é uma aceleração local à região. Sinais de reativação, locks da fila
  de tarefas de consulta e locks de admissão não se propagam entre regiões e
  não devem ser tratados como se o fizessem. Cada região executa seu próprio
  Redis. O cache da reserva fica frio ou aquecido a critério do operador, e a
  correção não depende de sua preservação durante o failover.
- A visibilidade é atendida pelo banco da região ativa. Promova primeiro e
  depois leia.

Comportamento de namespaces, filas de tarefas e registro de workers:

- Namespaces e filas de tarefas são armazenados no banco de workflows e
  sobrevivem à promoção exatamente como estavam na última transação replicada.
  Eles não são particionados por região pelo mecanismo.
- Workers na nova região ativa se registram no endpoint local da API após a
  promoção. Registros preexistentes da região com falha permanecem no banco e
  expiram pelo caminho normal de expiração de workers.
- Implantações por build ID e o estado do ciclo de vida de implantação
  sobrevivem ao failover porque ficam no banco de workflows.

Compromissos entre consistência e latência em operação normal:

- Inícios de workflow, sinais e atualizações são confirmados no banco da região
  ativa. Sua latência é a latência de confirmação dessa região, e eles são
  recusados enquanto a autoridade de escrita é retirada durante um failover.
- A entrega de tarefas de workflow e atividade segue o contrato de aceleração
  de região única dentro da região ativa: abaixo de um segundo quando o Redis
  está saudável e, caso contrário, na frequência de consultas duráveis.
- Agendamentos disparam pelo agendador único da região ativa e pausam enquanto
  nenhum agendador estiver executando. Os disparos retomam a partir dos registros
  duráveis de agendamento após a promoção.
- Leituras de visibilidade têm consistência de leitura após escrita apenas
  dentro da região ativa. O mecanismo não fornece leitura das próprias escritas
  entre regiões nem RPO=0.

A fronteira de recuperação de desastres é explícita: esse projeto candidato
não substitui backups nem evidências. O conjunto de recuperação documentado nos
[Limites operacionais do operador](/docs/operator-operating-envelope) continua
obrigatório, acrescido do SLO de atraso de replicação, latência do manual de
promoção, data do último ensaio bem-sucedido de failover e procedimento de
isolamento de escrita do primário recuperado.

Em implantações sob sua administração, múltiplas regiões ativo/passivo e
ativo/ativo, failover regional automático, replicação síncrona entre regiões
(RPO=0), visibilidade ativa entre regiões e filas de tarefas fixadas por região
como eixo de roteamento imposto pelo mecanismo continuam
[conduzidos pelo suporte](/docs/support), pois a própria topologia faz parte do
risco do produto. O [contrato atual de runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane)
é de região única e não oferece essas garantias de múltiplas regiões.

## Contrato de prontidão {#readiness-contract}

Use verificações de integridade e de prontidão:

- `GET /api/health` comprova que o processo está atendendo HTTP.
- `GET /api/ready` informa as verificações de dependências configuradas,
  incluindo conectividade, migrações e prontidão do namespace padrão. Não
  comprova todas as operações SQL de workflows nem a capacidade de escrita disponível.
- `GET /api/cluster/info` comprova que um cliente autenticado consegue descobrir
  a identidade do build, os protocolos do plano de controle e de workers, os
  codecs de payload e as capacidades do servidor.
- `POST /api/worker/register` comprova que workers conseguem se autenticar no
  namespace e na fila de tarefas esperados.

Não mude o tráfego com base apenas em `/api/health`.
