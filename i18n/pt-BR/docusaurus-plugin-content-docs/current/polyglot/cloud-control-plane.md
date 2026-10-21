---
sidebar_position: 3
title: Runtime gerenciado do Cloud
description: Compare planos Cloud, capacidade medida de workflows, cobrança e disponibilidade e conecte workers PHP, Python ou Rust a um namespace gerenciado.
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - URL do runtime do namespace
  - credenciais de runtime
  - workers executados pelo cliente
  - rede privada
  - runtime gerenciado em região única
  - runtime gerenciado multirregião
---

# Runtime gerenciado do Cloud {#cloud-managed-runtime}

O Durable Workflow Cloud é um serviço gerenciado de orquestração. O Cloud
opera o plano de controle hospedado e o runtime de orquestração, incluindo
estado de workflows, histórico, agendamentos, filas de tarefas, leases e
visibilidade durável. Clientes executam clientes SDK e workers em um namespace
Cloud provisionado.

Isso é separado da hospedagem própria. Um Durable Workflow Server sob sua
administração executa independentemente e nunca é conectado ao Cloud.

## Planos e preços {#plans-and-pricing}

Pague pela capacidade provisionada, não pela semântica dos workflows. Cada
namespace recebe um runtime gerenciado isolado; workers PHP, Python e Rust do
cliente executam em seu próprio ambiente. Consulte os
[preços do Cloud](https://cloud.durable-workflow.com/pricing) e o painel para
a disponibilidade atual de provisionamento.

Cloud Dev está disponível agora. Os quatro planos HA estão em qualificação e
ainda não podem ser comprados nem provisionados. Seus preços, capacidades,
disponibilidade e termos de SLA abaixo são planejados, não ofertas atuais de compra.

| Plano | Capacidade do runtime | Armazenamento durável incluído | Disponibilidade | Preço (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 GB RAM | 5 GB | Host único, sem SLA | $0.075/hora, mínimo de $2 por mês ativo, teto de $50/mês |
| Cloud Standard | 1 vCPU, 2 GB RAM | 25 GB | HA planejada em região única, SLA de 99.99% | $0.45/hora, mínimo de $10 por mês ativo, teto de $300/mês |
| Cloud Multi-Region | 1 vCPU, 2 GB RAM | 25 GB | HA multirregião planejada, SLA de 99.99% | $0.60/hora, mínimo de $15 por mês ativo, teto de $400/mês |
| Cloud Business | 4 vCPU, 8 GB RAM | 100 GB | HA planejada em região única, SLA de 99.99% | $2.25/hora, mínimo de $50 por mês ativo, teto de $1,500/mês |
| Cloud Business Multi-Region | 4 vCPU, 8 GB RAM | 100 GB | HA multirregião planejada, SLA de 99.99% | $3.00/hora, mínimo de $75 por mês ativo, teto de $2,000/mês |

A capacidade cobre os componentes do runtime gerenciado, não a computação dos
workers do cliente. Nos planos HA planejados, replicação e capacidade de
reserva estão incluídas no preço; a tabela não soma réplicas como capacidade
extra de execução de workflows. Todo plano inclui Managed Waterline, backups
criptografados básicos, atualizações e uma URL estável de runtime.

Runtimes provisionados são cobrados pelo tempo de runtime, medido por minuto
da ativação ao desprovisionamento. Mínimos e tetos se aplicam por compra de
runtime em um mês de calendário UTC. Tempo provisionado ocioso é cobrado; um
mês sem tempo provisionado não tem cobrança de runtime. Uma nova compra tem
seu próprio mínimo e teto; reparo ou recuperação gerenciados pelo serviço não
os reiniciam. Stripe fatura mensalmente o uso acumulado. Preços excluem
impostos aplicáveis.

O armazenamento é fixo na alocação incluída. Não há adicionais de armazenamento
vendidos separadamente, aumentos automáticos ou cobranças por excedente. Para
mais espaço, [solicite um plano maior de runtime](https://cloud.durable-workflow.com/contact)
antes de atingir o limite. Mudar apenas de região única para multirregião não
aumenta o armazenamento. Uma ampliação exige mudança real do runtime, não só
da cobrança; atualmente é organizada com o suporte. O uso de rede é medido,
não é cobrado atualmente e não é ilimitado.

Veja os [preços do Cloud](https://cloud.durable-workflow.com/pricing) para
escolher um plano. Para maior capacidade, outra conectividade, SSO, suporte
empresarial ou requisito personalizado de disponibilidade,
[entre em contato](https://cloud.durable-workflow.com/contact).

## Limite do serviço gerenciado {#managed-service-boundary}

O limite visível ao cliente é um namespace Cloud:

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

O Cloud controla provisionamento do namespace, operação do runtime,
persistência, posicionamento, saúde, recuperação e a interface Managed
Waterline do namespace. Clientes controlam código da aplicação, implementações
de workflow e atividade e os processos de seus workers. Clientes Cloud não
implantam um serviço Waterline separado.

O endpoint HTTPS do namespace se conecta diretamente ao runtime gerenciado.
Tráfego SDK não passa por proxy na aplicação do site/plano de controle Cloud.
Use a URL retornada sem alterações, sem acrescentar `/api`; SDK e CLI constroem
seus caminhos de API. Chamadas administrativas continuam usando
`https://cloud.durable-workflow.com/api/v1`.

Administração Cloud e tráfego de runtime usam credenciais diferentes:

- Uma chave de API Cloud (`dwc_...`) gerencia projetos, ambientes, namespaces,
  cobrança e ciclo de vida das credenciais de runtime.
- Uma credencial de runtime de cliente (`dwr_...`) inicia e controla workflows
  em um namespace gerenciado.
- Uma credencial de runtime de worker (`dwr_...`) registra workers, faz long
  poll por tarefas, envia heartbeats e finaliza trabalho nesse namespace.

Uma chave de API Cloud não é aceita pela URL de runtime do namespace.
Credenciais de runtime têm escopo de um namespace e papel, são retornadas
somente na criação e omitidas de respostas posteriores de listagem e auditoria.

Se a integração inicial Cloud usar a CLI, instale-a pelo [guia da CLI](./cli.mdx)
e atualize uma instalação independente existente explicitamente com `dw upgrade`.
A CLI nunca se atualiza em segundo plano. Depois de instalar ou atualizar,
execute `command -v dw` e `dw --version`; resolva qualquer instrução do
instalador sobre `PATH` antes de usar credenciais Cloud para que o release
selecionado seja o binário ativo.

## Provisionar e conectar um namespace {#provision-and-connect-a-namespace}

### 1. Criar e provisionar o namespace {#1-create-and-provision-the-namespace}

No [painel Cloud](https://cloud.durable-workflow.com/), crie organização,
projeto, ambiente e namespace e selecione seu plano de capacidade. Criar uma
conta ou definição de namespace não provisiona capacidade paga. Conclua a
configuração de pagamento pelo Stripe e selecione **Provisionar** (**Provision**) na página do
namespace. Adicionar um cartão sozinho não inicia o provisionamento.

O provisionamento é assíncrono. A página do namespace atualiza o progresso
enquanto o Cloud prepara o runtime. Aguarde ficar ativo antes de iniciar
trabalho SDK. A página também oferece criação de credenciais de runtime e
acesso ao Managed Waterline para inspecionar workflows e seu histórico.

Para configuração pela API, conclua o pagamento primeiro. O exemplo a seguir
usa o plano padrão da organização; `capacity_plan_version` pode selecionar
outro plano disponível. Não forneça sua própria URL de Server, identificador
de implantação ou registro de posicionamento:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

Depois do provisionamento, a resposta fornece `runtime_url` estável,
`runtime_namespace`, status gerenciado e informações de região visíveis ao
cliente. Trate a URL e o namespace retornados como configuração pertencente ao
Cloud; não derive um endpoint nem o substitua por endereço de Server sob sua administração.

### 2. Emitir credenciais separadas de cliente e worker {#2-issue-separate-client-and-worker-credentials}

Emita os dois papéis de runtime independentemente:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

Cada token é exibido uma vez na resposta de criação. Guarde-o no armazenamento
de segredos usado somente pelo papel correspondente. Um processo
deliberadamente combinado de cliente e worker recebe ambos como dois segredos
distintos. Rotacione e revogue os papéis independentemente e nunca substitua
qualquer credencial de runtime por uma chave de API Cloud.

### 3. Concluir o primeiro workflow no Cloud {#cloud-first-workflow}

O playground compartilhado de runtime externo da Sample App executa o mesmo
caminho de autoria de workflow e atividade em PHP, Python ou Rust. Abra um
[Codespace da Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
exporte os valores provisionados do namespace e as duas credenciais de runtime
e escolha uma fila de tarefas da aplicação:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Escolha um SDK de primeira parte e execute o mesmo contrato de runtime gerenciado:

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

O executor resolve as versões estáveis atuais, fornece cada credencial apenas
ao processo filho correspondente, aguarda até 60 segundos por um registro de
worker anunciando a fila exata e os tipos gerados de workflow e atividade e
inicia uma requisição do cliente. Só tem sucesso depois de o SDK retornar o
resultado esperado, `dw` informar `completed` e o histórico exigido de workflow
e atividade estar presente. O comando não executa Server ou Waterline local
no modo gerenciado.

Para cada linguagem, repita o comando gerenciado completo acima mudando apenas
`language`. Continue com seu guia de autoria específica:

- [SDK PHP](/docs/polyglot/php/): defina `language=php`.
- [SDK Python](/docs/polyglot/python/): defina `language=python`.
- [Início rápido Rust com runtime gerenciado](/docs/polyglot/rust-cloud-quickstart/):
  defina `language=rust` e use seus diagnósticos de prontidão do worker,
  resultado concluído e divergências.

Um caminho combinado de cliente e worker mantém ambas as credenciais como
segredos distintos. Uma chave de administração Cloud não é credencial de
runtime e não deve ser exportada em nenhuma variável de token de runtime.

### 4. Continuar com a operação gerenciada {#4-continue-with-managed-operation}

O cliente SDK inicia workflows e envia comandos seguintes pela URL de runtime
do namespace. Workers do cliente se registram e fazem long poll na mesma URL
com o papel de worker. O Cloud autentica e limita o escopo de cada requisição,
executa o protocolo de orquestração no runtime gerenciado e persiste estado e histórico.

A aplicação cliente não seleciona uma implantação de runtime para uma
operação. IDs de workflow e execução, filas de tarefas, marcadores de
compatibilidade e codificação Avro continuam sendo contratos duráveis da
aplicação dentro do namespace Cloud.

## Conectividade dos workers do cliente {#customer-run-worker-connectivity}

Workers podem executar em sua rede, frota de VMs, plataforma de containers ou
ambiente da aplicação. Precisam de saída HTTPS para a URL de runtime e devem
permitir as requisições de poll de longa duração do protocolo de workers.

- Nenhuma conexão de entrada do Cloud para um worker é necessária.
- Proxies e gateways de saída não devem encurtar long polls e criar um loop
  intenso de novas tentativas.
- Workers devem repetir falhas transitórias de conexão e respostas de serviço
  indisponível com backoff limitado.
- Mover um processo worker não move o estado do workflow; o Cloud retém o
  estado durável e histórico do namespace.
- Rotacionar credenciais não exige alterar URL de runtime, namespace ou fila.

## Posicionamento regional e limite de recuperação {#region-placement-and-recovery-boundary}

Cloud Dev está disponível com o limite de recuperação abaixo. Os limites HA
descrevem planos planejados que permanecem indisponíveis até a qualificação:

- **Cloud Dev:** um host isolado com estado persistente e backups. Manutenção e
  recuperação podem interromper o serviço. Não há SLA de uptime nem failover
  regional automático.
- **HA planejada em região única:** três hosts replicados em uma região, com
  failover automático do primário. Um host pode falhar sem perder o quorum
  restante. Indisponibilidade da região inteira fica fora da cobertura do SLA.
- **HA multirregião planejada:** três hosts replicados em três regiões, com
  failover automático do primário. O SLA inclui perda ou isolamento de uma
  região configurada, desde que os membros restantes formem quorum.

Nos perfis HA planejados, a URL estável de runtime deve acompanhar o primário
eleito; você não altera a configuração SDK durante um failover suportado. Um
antigo primário isolado é impedido de continuar servindo trabalho
autoritativo. Se não for possível estabelecer um primário seguro, o runtime
para de atender em vez de aceitar escritas conflitantes. HA não promete
requisições ininterruptas: clientes e workers ainda precisam de novas
tentativas limitadas para falhas transitórias.

A página do namespace expõe topologia, informações regionais e status do
serviço. Backups ajudam na recuperação, mas não substituem replicação ativa.
Testes curtos de failover demonstram os casos exercitados, não uma garantia
universal de tempo de recuperação ou a disponibilidade alcançada em um mês.

### Medição de SLA e créditos {#sla-measurement-and-credits}

Os quatro planos planejados com SLA especificam uptime de 99.99% por mês de
calendário UTC, medido no endpoint de runtime do cliente em janelas de um
minuto. Medições ausentes contam como indisponibilidade, e manutenção planejada
não é excluída. A disponibilidade de workers hospedados pelo cliente é
separada da disponibilidade do runtime gerenciado.

| Disponibilidade mensal | Crédito automático na conta |
| --- | ---: |
| Pelo menos 99.99% | Nenhum |
| Pelo menos 99.9%, abaixo de 99.99% | 10% |
| Pelo menos 99.0%, abaixo de 99.9% | 25% |
| Abaixo de 99.0% | 100% |

Planos com SLA recebem créditos de serviço automaticamente na conta. Os créditos
nunca excedem o valor cobrado naquele mês pelo runtime afetado, e não há
reembolso em dinheiro por indisponibilidade. Cloud Dev não tem créditos de SLA.
Veja os [termos do Cloud](https://cloud.durable-workflow.com/terms) e os
[preços do Cloud](https://cloud.durable-workflow.com/pricing) para o escopo de
disponibilidade e os termos de cobrança do plano.

## Conectividade privada e limite do suporte {#private-connectivity-and-support-boundary}

O contrato Cloud 2.0 de autosserviço pressupõe saída de clientes e workers
para a URL pública de runtime do namespace. Entrada exclusivamente privada,
VPN ou peering personalizados e roteamento privado específico de provedor
são projetos de conectividade conduzidos pelo suporte, não padrões ocultos.
Clientes nunca recebem endereços internos de runtime nem são orientados a
contornar a URL do namespace.

## Cloud ou Server sob sua administração {#cloud-or-self-hosted-server}

Escolha Cloud quando o Durable Workflow deva operar runtime de orquestração,
persistência, disponibilidade do plano selecionado, recuperação e Managed
Waterline enquanto sua equipe opera clientes SDK e workers.

Escolha [Server sob sua administração](/docs/polyglot/server) quando sua equipe
precisar operar imagem Server, banco, cache, rede, autenticação, backups e
failover independentemente. Um Server sob sua administração não pode ser
registrado no Cloud, conectado a ele ou usado como runtime de um namespace
Cloud. Laravel embarcado, Server sob sua administração e Cloud são opções de
implantação separadas.

## Benchmarks de workflow padrão {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity)
define uma carga pequena e reproduzível: um início de workflow, uma atividade
externa e uma conclusão, com entradas e resultados Avro definidos de 1 KiB.
O worker do cliente executa fora da alocação do runtime gerenciado.

Cloud Dev foi medido em 21 de setembro de 2026 com o mesmo plano provisionado
pelos clientes. Os outros quatro baselines são históricos: incluem a topologia
HA replicada, mas antecedem o release atual do runtime. Não são extrapolados
de Dev e não qualificam a capacidade dos planos atuais com SLA.

| Plano | Workflows padrão/segundo | Ações de workflow em 30 dias | Medição |
| --- | ---: | ---: | --- |
| Cloud Dev | 0.25 | 1,296,000 | 21 de setembro de 2026; detalhes abaixo |
| Cloud Standard | 0.25 | 1,296,000 | Histórico; nova medição pendente |
| Cloud Multi-Region | 0.10 | 518,400 | Histórico; nova medição pendente |
| Cloud Business | 0.50 | 2,592,000 | Histórico; nova medição pendente |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Histórico; nova medição pendente |

A estimativa de 30 dias é `workflows/second x 2,592,000 seconds x 2 workflow actions`:
um início e uma atividade nesta comparação. Pressupõe essa taxa continuamente
por 30 dias. Não é cota de ações incluídas, unidade de cobrança ou mapeamento
exato às definições de ações de outro motor.

São baselines de carga medida, não vazão máxima nem capacidade garantida para
toda aplicação. Payloads maiores, mais atividades, temporizadores, sinais,
consultas, históricos com muito replay, comunicação entre regiões e latência
do worker do cliente mudam o resultado. A tabela não declara benchmarks
separados de temporizadores, sinais, replay ou saturação. Planeje para sua
combinação real de workflows em vez de multiplicar os números por um tamanho arbitrário.

### Medição do Cloud Dev {#cloud-dev-capacity}

Cloud Dev é um runtime gerenciado isolado de host único para desenvolvimento
e avaliação. Esta medição usou um runtime Dev provisionado normalmente, sem
alterar CPU, memória, armazenamento, entrada ou configurações de backup:

| Recurso | Cloud Dev |
| --- | --- |
| Computação do runtime | 1 vCPU compartilhada, 1 GB RAM |
| Armazenamento durável incluído | 5 GB |
| Serviços do runtime | Server, worker de fila, agendador, MySQL e Redis |
| Managed Waterline | Incluído pela aplicação Cloud autenticada; não é um processo no host Dev |
| Caminho de rede | Entrada HTTPS direta e específica do espaço |
| Workers do cliente | Executam no ambiente do cliente |
| Disponibilidade | Sem SLA; interrupções de manutenção são permitidas |
| Preço atual do runtime | Veja [Planos e preços](#plans-and-pricing) |
| Mais armazenamento | Solicite um plano maior de runtime; sem adicionais de armazenamento |

A execução usou a [definição pública PHP de DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/68168f34b637a19c054211f4db2df9c616799a86/benchmarks/capacity/v1/bindings/php/capacity_adapter.php):
um início de workflow, uma atividade echo externa e uma conclusão, carregando
uma string de 1,024 bytes em Avro em cada limite de entrada e resultado de
workflow/atividade. Server 2.3.12 continha Workflow 2.0.14; worker externo e
clientes usaram SDK PHP 2.0.11 em PHP 8.4.25. O runtime usou PHP 8.3.33 e MySQL 8.0.46.

Um worker PHP usou timeout de poll de tarefa de um segundo. Dois slots
independentes de cliente ofereceram um workflow a cada quatro segundos após
um aquecimento separado de 30 segundos. A janela fixa de medição foi
**18:50:30-18:55:30 UTC em 21 de setembro de 2026**. Apenas conclusões
observadas nesses cinco minutos contam na vazão; drenar depois não aumenta a
taxa relatada. Cada resultado, status concluído e histórico ordenado de
workflow/atividade foi verificado.

| Resultado medido | Valor |
| --- | ---: |
| Taxa oferecida e concluída | 0.25 workflows padrão/segundo |
| Workflows concluídos | 75 de 75 |
| Erros / slots de início perdidos | 0 / 0 |
| Latência do início ao resultado, p50 | 2.76 segundos |
| Latência do início ao resultado, p95 | 4.18 segundos |
| Latência do início ao resultado, p99 | 4.33 segundos |
| Workflows não concluídos na coorte medida | 0 |
| Ações de workflow em 30 dias | 1,296,000 |

A latência inclui rede do cliente e polling de resultado a cada 100 ms. Não
é latência interna de agendamento de tarefas e não deve ser comparada à
métrica interna de agendamento de outro motor.

A CPU do host teve média de **63.5% ocupada**, com pico de **89%** em amostras
de cinco segundos. Não houve **encerramentos por OOM nem reinícios de
containers**. Os picos de memória observados foram 95.21 MiB no Server,
197.1 MiB no MySQL, 45.84 MiB no worker de fila, 43.75 MiB no agendador,
9.49 MiB no Redis e 34.59 MiB no conector de entrada. Esses picos individuais
não representam RSS simultâneo do host inteiro; o SO e outros processos
também consomem memória. O host tinha sua configuração normal de 1 GiB de
swap, com até cerca de 90 MiB ocupados na medição. Um backup inicial
criptografado havia sido verificado antes da janela; nenhuma captura de backup a sobrepôs.

Este é um baseline medido de desenvolvimento, não uma conversão universal
para todo workflow, teste de vazão máxima, teste prolongado ou SLA. Payloads
maiores, atividades adicionais, temporizadores, sinais, consultas, históricos
com muito replay e latência do worker do cliente mudam a capacidade. A
cobrança Cloud se baseia no tempo de runtime provisionado com armazenamento
fixo incluído, não em operações de workflow.

## API de uso para cobrança {#billing-usage-api}

Cloud Dev usa uma célula de runtime isolada de host único para cada espaço
Dev provisionado. Seus termos de cobrança são:

| Termo de cobrança | Cloud Dev |
| --- | ---: |
| Runtime provisionado | $0.075 por hora, medido por minuto |
| Máximo no mês de calendário | $50 por compra de runtime |
| Mínimo por mês ativo | $2 por compra de runtime em um mês UTC ativo |
| Capacidade gerenciada | 1 vCPU, 1 GB de memória, 5 GB de armazenamento durável |
| Armazenamento durável adicional | Não vendido separadamente; solicite um plano maior de runtime |
| Backups criptografados básicos | Incluídos |
| Disponibilidade | Host único, sem SLA |

A alocação cobre Server, MySQL, Redis, agendamento, acesso ao Waterline, backups,
atualizações e infraestrutura operados pelo Cloud. Workers PHP, Python e Rust
do cliente executam fora dela. Inícios de workflow, tentativas de atividade,
novas tentativas, temporizadores, sinais, consultas, atualizações e workflows
filhos são telemetria operacional, não unidades de cobrança separadas. Preços
excluem impostos aplicáveis. O armazenamento incluído não gera uma cobrança separada.

O Cloud expõe uso de cobrança por organização para finanças, operações e
automação de rateio. O endpoint é autenticado por uma chave de API Cloud e
não aceita ID de cliente ou organização na requisição; a organização é
resolvida do token bearer `dwc_`, para que um cliente não consulte o uso de outro.

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` e `period_end` são datas ISO-8601 opcionais. Quando omitidas,
o Cloud retorna o mês de calendário atual. Leituras e exportações de uso
continuam disponíveis mesmo quando restrições de cobrança pausam o
provisionamento ou as operações de workflow, para que finanças ainda possa
regularizar a conta.

O schema de resposta é `durable_workflow.cloud.namespace_capacity_usage.v1`.
Ele separa tempo de capacidade alocada de contadores semânticos de eventos.
Campos relacionados a armazenamento permanecem no schema para cobrança
histórica; não autorizam compra de adicionais. A resposta abreviada de Cloud
Dev abaixo mostra os termos atuais do plano.

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

O medidor de tempo Cloud Dev começa quando o runtime isolado é ativado e para
quando é desprovisionado. Teto e mínimo mensais se aplicam por compra de
runtime em meses UTC. O armazenamento não cresce nem começa a ser cobrado
automaticamente. O Cloud preserva uma reserva de operação e recuperação no
disco; solicite um plano maior antes de atingir a alocação incluída.

Runtimes ociosos ainda incorrem em cobrança de capacidade. Desprovisionar
encerra essa cobrança e remove dados ativos e credenciais; não é uma operação
de pausar/retomar. Termos SLA planejados usam o mesmo modelo de tempo
provisionado com suas próprias taxas, mínimos e tetos. Use os `billing_terms`
retornados pelo plano ao interpretar o uso; faturas históricas mantêm os termos aceitos.

Exporte as mesmas evidências como CSV ou relatório JSON quando um sistema
financeiro downstream precisar de um arquivo:

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

Para um painel baseado em JSON, solicite a mesma API com o intervalo do painel:

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

Depois converta as linhas de capacidade de namespace em uma estrutura plana:

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

Use `invoice_units` para reconciliação de capacidade e armazenamento. Use
`operational_telemetry` para entender o perfil da carga e o comportamento do
benchmark; não converta esses contadores de eventos em cobranças.

## Referências relacionadas {#related-references}

- [Modos de implantação](/docs/polyglot/deployment-modes)
- [SDK PHP](/docs/polyglot/php)
- [SDK Python](/docs/polyglot/python)
- [SDK Rust](/docs/polyglot/rust)
- [Server](/docs/polyglot/server)
- [Implantações sob sua administração](/docs/deployment)
- [Suporte](/docs/support)
