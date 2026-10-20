---
sidebar_position: 1
title: Migração do modo embarcado para Server
description: Mova uma implantação v2 embarcada no Laravel para o servidor independente Durable Workflow.
---

# Migração do modo embarcado para Server {#embedded-to-server-migration}

Este guia se destina a equipes que já executam Durable Workflow v2 dentro de
uma aplicação Laravel e movem novos workflows para o servidor independente.
Se a aplicação ainda usa v1, comece por [Migrar para 2.0](/docs/migration) e
mantenha execuções v1 existentes no motor v1 até terminarem.

Use primeiro [Adoção do Laravel e transição de runtime](/docs/laravel-adoption/)
quando o destino ainda não estiver escolhido ou a integração com Laravel fizer
parte da decisão. Esta página é o runbook de Server sob sua administração
após essa escolha; não é o caminho de migração para Cloud.

A migração é um caminho de adoção, não uma movimentação do banco no local.
O servidor independente controla novos inícios pelo plano de controle,
histórico durável, agendamentos, registros de workers e entrega de tarefas
por HTTP. Seus workers de aplicação continuam responsáveis pelo código de
workflow e atividade.

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  O Durable Workflow 2.0 tem um único codec público de payload: <code data-payload-codec-field="codec">avro</code>.
  JSON é o transporte de documentos HTTP, não um codec de payload durável.
  Leitores v1 exclusivos de PHP permanecem internos ao caminho de importação/drenagem
  e não podem ser selecionados para novas execuções v2. Veja o <a href="/docs/polyglot/avro-value-protocol/">protocolo Avro Value</a>.
</div>

Este é um guia de migração para infraestrutura própria. Ele não transforma a
implantação embarcada em namespace Cloud, e o Server resultante não é
conectado ao Durable Workflow Cloud. Para a opção separada de serviço
gerenciado, veja [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane).

## Limite atual {#current-boundary}

Suportado hoje:

- Iniciar novos workflows pela API do plano de controle ou CLI do servidor.
- Registrar workers PHP, Python, Rust ou HTTP personalizados no servidor.
- Consultar e concluir tarefas de workflow e atividade pelo protocolo de workers.
- Importar pacotes elegíveis de exportação de histórico v2 embarcado para o
  servidor como estado de workflow gerenciado pelo servidor.
- Exportar pacotes de histórico de execuções fechadas de v2 embarcado ou v2
  servidor para auditoria, diagnóstico e transferência para arquivo.
- Observar workflows gerenciados pelo servidor pelas APIs, CLI e SDKs que leem
  seu estado ou implantar [modo de serviço do Waterline](/docs/monitoring#waterline-service)
  como observador separado conectado pelo SDK PHP. O pacote Waterline na
  aplicação Laravel original continua lendo somente o estado daquele runtime embarcado.

Não suportado como operação automática hoje:

- Mover execuções v1 para o servidor.
- Reproduzir histórico v1 com workers não PHP.

Planeje a transição para que execuções v1 drenem onde começaram. Execuções v2
embarcadas podem drenar no local ou ser movidas pelo fluxo de importação abaixo.

## Contrato de modo de implantação {#deployment-mode-contract}

Para a comparação congelada entre embarcado e serviço, veja
[Modos de implantação](/docs/polyglot/deployment-modes). Este guia acrescenta
quatro regras específicas de transição ao contrato compartilhado:

- Execuções embarcadas existentes continuam onde começaram.
- Novas execuções gerenciadas pelo servidor usam chaves estáveis de tipos,
  nomes de namespace, filas e o contrato Avro desde a primeira transição.
- Sinais, consultas, atualizações, reparo, cancelamento, terminação e
  arquivamento continuam sendo roteados ao runtime que possui a execução de destino.
- Cada implantação Waterline continua apontando para o runtime e namespace
  que deve observar; ela não mescla execuções embarcadas e gerenciadas pelo servidor.

## Invariantes da transição {#cutover-invariants}

Mantenha estas regras durante toda a migração:

- Configure o servidor como dependência remota explícita: defina URL base,
  namespace, fila e material de autenticação diretamente em vez de inferir
  de configurações locais da aplicação Laravel.
- Mantenha estáveis IDs de workflow, regras de seleção de execução, chaves de
  tipos de workflow/atividade, tag de codec (`avro`) e marcadores de
  compatibilidade nos dois runtimes.
- Roteie sinais, consultas, atualizações, reparo, cancelamento, terminação e
  arquivamento ao mesmo runtime que possui a execução de destino.
- Antes de importar uma execução embarcada, pause seus workers pelo tempo
  necessário para exportar um pacote em repouso sem tarefa de workflow/atividade
  sob lease nem tentativa de atividade em execução.
- Trate a neutralidade de linguagem como parte do contrato: workflows
  gerenciados pelo servidor usam aliases estáveis e o schema fixo Avro Value,
  não nomes de classes ou formatos de payload exclusivos de PHP.

## Fase A: preparar v2 embarcado {#phase-a-prepare-embedded-v2}

Antes de implantar o servidor, faça a aplicação embarcada usar contratos
independentes de linguagem. Isso reduz o código alterado na transição.

1. Defina chaves estáveis de tipos de workflow e atividade.

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. Use essas chaves em todos os limites externos.

   Clientes Server enviam `workflow_type: "orders.process"`, e workers
   registram `supported_workflow_types` / `supported_activity_types` com as
   mesmas strings. Não exponha FQCNs PHP como contrato público durável.

3. Use o contrato de payload Avro v2.

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   Avro é obrigatório para novos workflows v2 embarcados e gerenciados pelo
   servidor. Um leitor PHP legado só pode ser mantido no caminho de
   importação/drenagem v1 enquanto execuções v1 antigas terminam.

4. Escolha nomes de namespace e fila de tarefas.

   Escolha nomes que possa manter estáveis durante a transição para Server:

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. Decida se marcadores de compatibilidade são necessários.

   Uma implantação de frota única pode deixar a compatibilidade sem valor.
   As mecânicas padrão de rollout v2 (canário, drenagem, rollback, diagnóstico
   de replay) operam em um contrato v2 estável; não há um caminho de adoção
   "v2 de frota mista". Se uma janela de divergência de builds ocorrer durante
   a transição, defina `DW_V2_CURRENT_COMPATIBILITY` e
   `DW_V2_SUPPORTED_COMPATIBILITIES` antes para impedir que um novo build
   reserve execuções de um build incompatível nessa janela.

## Fase B: implantar o Server ao lado do embarcado {#phase-b-deploy-the-server-beside-embedded}

Execute o Server independente ao lado da aplicação Laravel enquanto ela
continua tratando execuções embarcadas existentes.

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

Para desenvolvimento local, você pode definir `DW_AUTH_DRIVER=none`. Em
ambientes compartilhados, use credenciais com escopo por papel:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Verifique a descoberta e crie o namespace:

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

O servidor rejeita requisições do plano de controle sem
`X-Durable-Workflow-Control-Plane-Version: 2`; workers usam o cabeçalho
separado `X-Durable-Workflow-Protocol-Version: 1.0`.

## Fase C: conectar workers {#phase-c-connect-workers}

Workers devem se registrar antes de fazer polling. O registro anuncia runtime,
fila e as chaves de tipos que o worker pode executar.

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

Depois execute workers no modo servidor para o mesmo namespace e fila.
Workers Python seguem o mesmo contrato de registro e poll pelo SDK Python.
Workers personalizados podem usar o
[Protocolo de workers](/docs/polyglot/worker-protocol) diretamente.

Verifique a visibilidade antes da transição:

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## Fase D: rotear novos inícios para o Server {#phase-d-route-new-starts-to-the-server}

Transfira uma família de workflows por vez. Mantenha aplicação embarcada e
workers de fila executando para execuções antigas até drenarem.

Inicie primeiro um workflow de validação em paralelo:

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

Acompanhe a execução:

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Depois de o caminho de validação funcionar, mova o chamador de produção de
`WorkflowStub::start()` para cliente Server, CLI ou API HTTP direta. Mantenha
sinais, consultas, atualizações, cancelamento e terminação roteados ao mesmo
runtime que iniciou o workflow. Um workflow iniciado embarcado deve receber
comandos embarcados; um iniciado no servidor deve receber comandos do plano
de controle do servidor.

## Fase E: importar execuções v2 embarcadas elegíveis {#phase-e-import-eligible-embedded-v2-runs}

Use a exportação de histórico como formato de importação. O runtime embarcado
continua fonte de verdade do pacote; o servidor o verifica, grava linhas
duráveis em uma transação e reconstrói projeções a partir delas.

Elegibilidade:

- O schema deve ser `durable-workflow.v2.history-export` com `schema_version: 1`.
- A origem deve ser v2 embarcado, e a exportação deve conter
  `workflow.source_runtime: "embedded"`. Histórico v1 permanece fora do escopo.
- Uma execução não terminal deve ser a execução embarcada atual.
- Uma execução terminal deve ter `history_complete: true`.
- Pacotes com dados ocultos são rejeitados.
- Tarefas de workflow sob lease, tarefas de atividade sob lease e tentativas
  de atividade em andamento são rejeitadas. Pause workers ou deixe os leases
  expirarem e exporte novamente.

Regras da fonte de verdade da importação:

- `history_events` são copiados como log autoritativo de replay e auditoria.
- Identidade do workflow, payloads, comandos, sinais, atualizações, tarefas,
  execuções de atividade, temporizadores, falhas e links de linhagem são
  reconstruídos a partir do pacote.
- Projeções de resumo, espera, temporizador, linha do tempo e linhagem do
  servidor são reconstruídas após importar. Linhas de projeção não são a
  autoridade de importação.
- Tarefas pendentes de workflow continuam reserváveis por workers compatíveis do servidor.
- Execuções pendentes e tarefas prontas de atividade continuam reserváveis por
  workers de atividade compatíveis do servidor.
- Temporizadores pendentes mantêm `fire_at` e ficam visíveis ao reparo/recuperação
  de temporizadores do servidor.

Falha e rollback:

- A importação é tudo ou nada em uma transação de banco.
- Se o processo sair ou a validação falhar antes do commit, nenhum estado
  parcial de execução permanece no servidor.
- Repetir o mesmo pacote é idempotente por `run_id` e `dedupe_key`.
- Se outra execução no servidor já possuir o mesmo `run_id`, a importação é rejeitada.

Visibilidade e auditoria:

- Execuções importadas expõem `engine_source: embedded_v2_import` nas
  visualizações de lista/detalhe do servidor.
- A linha durável registra `import_source=embedded_v2`, `import_id`,
  `import_dedupe_key`, `import_contract_version` e `imported_at`.

Fluxo do operador:

Para execuções v2 embarcadas:

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

Simule a importação no servidor:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

Importe o pacote:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

Ou chame o endpoint HTTP de operador:

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

em que `order-123-import-request.json` é:

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

O objeto `bundle` acima é abreviado; passe o documento JSON completo de
`workflow:v2:history-export`.

Para execuções gerenciadas pelo servidor que só precisa preservar ou auditar:

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

Arquive execuções terminais do servidor após exportar para protegê-las da poda
por retenção:

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## Fase F: adicionar workers poliglotas {#phase-f-add-polyglot-workers}

Depois de uma família de workflows executar pelo servidor, adicione workers
Python, Rust ou personalizados registrando o mesmo namespace, fila e chaves de
tipos. Todo payload público v2 usa `avro`; mantenha entradas e saídas de
atividade independentes de linguagem: arrays, objetos, strings, números,
booleanos e nulos.

Use o [guia do SDK Python](/docs/polyglot/python) ou
[guia do SDK Rust](/docs/polyglot/rust). Para implementações HTTP diretas,
use a [referência do protocolo de workers](/docs/polyglot/worker-protocol).

## Checklist da transição {#cutover-checklist}

- [ ] Execuções v1 estão drenadas ou intencionalmente mantidas no motor v1.
- [ ] v2 embarcado usa chaves estáveis de tipos, não FQCNs PHP, nos limites externos.
- [ ] Todo novo workflow v2 usa o único codec público `avro`.
- [ ] `/api/health` e `/api/cluster/info` do Server passam a partir da rede de implantação.
- [ ] O namespace de destino existe no servidor.
- [ ] Workers registram a fila e as chaves de tipos suportadas esperadas.
- [ ] Um workflow de validação inicia, é reservado por um worker e chega ao estado esperado.
- [ ] Operadores podem listar workflows, inspecionar filas e ver registros de workers.
- [ ] Iniciadores embarcados antigos estão pausados ou movidos para evitar
  inícios com chaves de negócio duplicadas nos dois runtimes.
- [ ] Execuções v2 selecionadas para importação são exportadas de um runtime
  embarcado em repouso e passam em `workflow:v2:history-import --dry-run`.
- [ ] Execuções importadas mostram `engine_source: embedded_v2_import` e o
  `import_id` esperado nos detalhes/listagens do servidor.
- [ ] Execuções antigas fechadas que só precisam de retenção são exportadas
  para armazenamento durável.

## Solução de problemas {#troubleshooting}

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| `missing_control_plane_version` | Cliente chamou uma rota de controle sem o cabeçalho v2 | Envie `X-Durable-Workflow-Control-Plane-Version: 2` |
| `missing_protocol_version` | Worker chamou uma rota de worker sem o cabeçalho do protocolo | Envie `X-Durable-Workflow-Protocol-Version: 1.0` |
| `namespace_not_found` | O namespace não foi criado no servidor | Crie-o com `POST /api/namespaces` |
| Polls de worker não retornam tarefa | Fila, chave de tipo, namespace ou marcador de compatibilidade divergente | Compare payload de início, registro do worker e visibilidade da fila |
| Payload v1 não pode ser decodificado por worker não PHP | A execução contém histórico v1 nativo de PHP | Mantenha a execução no caminho interno PHP v1 de importação/drenagem; não a roteie a worker v2 |
| Workflow antigo não responde a sinal/consulta/atualização do servidor | A execução foi iniciada embarcada | Envie comandos pela aplicação embarcada até terminar |
| Importação rejeita `tasks.leased_task_present` | A exportação capturou uma tarefa sob lease | Pause workers embarcados, aguarde liberar ou concluir leases e exporte novamente |
| Importação retorna `already_imported` | O mesmo `run_id` e `dedupe_key` já existem no servidor | Trate a repetição como sucesso e inspecione a execução no servidor |
| Execução importada visível, mas não reservada | Chave de tipo, fila, namespace ou marcador divergente da linha importada | Compare relatório de importação, detalhe da execução e registro do worker |

## Guias relacionados {#related-guides}

- [Configuração do Server](/docs/polyglot/server)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
- [SDK Python](/docs/polyglot/python)
- [Migrar para 2.0](/docs/migration)
