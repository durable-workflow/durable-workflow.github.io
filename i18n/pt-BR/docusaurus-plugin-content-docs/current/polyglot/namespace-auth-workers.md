---
sidebar_position: 4
title: Namespace, autenticação e registro de workers
description: Referência dos contratos de resolução de namespace, autenticação por papel e registro de workers do servidor.
tags:
  - server
  - namespaces
  - authentication
  - worker-protocol
keywords:
  - autenticação de namespace Durable Workflow
  - tokens de servidor com escopo por papel
  - contrato de registro de workers
  - X-Namespace
---

# Namespace, autenticação e registro de workers {#namespace-auth-and-worker-registration}

Use esta referência ao provisionar um servidor independente, emitir credenciais
de automação ou implementar um runtime de worker. O servidor tem três contratos
separados que devem estar alinhados antes que o trabalho possa fluir:

- a requisição nomeia um namespace por `X-Namespace`, `?namespace=` ou pelo namespace padrão do servidor
- a credencial tem o papel exigido pela família de rotas
- workers registram o mesmo namespace, fila de tarefas, runtime, chaves de tipos
  e capacidade usados pelos inícios de workflow e polls de tarefas

## Autoridade da requisição {#request-authority}

O Durable Workflow trata namespace, papel de autenticação e versão do protocolo
como autoridade da requisição. Não os deduza de IDs de workflow, IDs de tarefa
ou rótulos de exibição.

| Família de requisições | Papel exigido da credencial | Cabeçalho de versão exigido | Origem do namespace |
| --- | --- | --- | --- |
| Descoberta `GET /api/cluster/info` | `worker`, `operator` ou `admin` | nenhum | `X-Namespace` opcional para contexto |
| Listagem/descrição de namespaces | `operator` ou `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | destino da rota ou contexto da requisição |
| Criação/atualização/política de armazenamento de namespaces | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | destino da rota ou corpo da requisição |
| Visibilidade de workflows, agendamentos, filas de tarefas, adaptadores de ponte e workers | `operator` ou `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=` e depois o padrão |
| Saúde, métricas, passagens de manutenção e testes de armazenamento do sistema | `admin` | `X-Durable-Workflow-Control-Plane-Version: 2` | `X-Namespace`, `?namespace=` e depois o padrão |
| Registro, polling, heartbeats e conclusão de workers | `worker` | `X-Durable-Workflow-Protocol-Version: 1.0` | `X-Namespace`, `?namespace=` e depois o padrão |

O servidor verifica o papel da rota antes da existência do namespace em
endpoints protegidos por papel. Um token com papel incorreto recebe uma falha
de autenticação em vez de um sinal de existência do namespace. Após passar nas
verificações de papel e versão, rotas com escopo de namespace rejeitam
namespaces desconhecidos com `reason: "namespace_not_found"`.

## Papéis de autenticação {#auth-roles}

Autenticação por token é o caminho padrão de produção:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Se uma implantação usar um único `DW_AUTH_TOKEN` compartilhado, esse token terá
efetivamente todas as permissões de rota. Prefira tokens com escopo por papel
em produção para que um processo worker não possa alterar namespaces nem
executar passagens de manutenção do sistema.

A mesma divisão de papéis existe na autenticação por assinatura:

```bash
DW_AUTH_DRIVER=signature
DW_WORKER_SIGNATURE_KEY=worker-signature-secret
DW_OPERATOR_SIGNATURE_KEY=operator-signature-secret
DW_ADMIN_SIGNATURE_KEY=admin-signature-secret
```

`DW_AUTH_DRIVER=none` destina-se apenas ao desenvolvimento local. Ele remove
o limite de autenticação de todas as rotas e nunca deve ser exposto fora de
uma rede local confiável.

## Autorização e atribuição de sinais {#signal-authorization-and-attribution}

Antes de admitir um sinal, o Server autentica a requisição e aplica a política
configurada de papel e namespace. As rotas de sinais de workflow exigem uma
credencial `operator` ou `admin`. Essas permissões de rota não implementam a
política de aprovação de pedidos da sua aplicação. Aplique essa decisão de
negócio em um gateway confiável da aplicação antes de encaminhar o sinal, ou
em seu provedor de autenticação personalizado suportado. Mantenha credenciais
privilegiadas do Server nesse limite confiável quando usuários finais não
devem enviar sinais diretamente.

O Server deriva o `principal` de um comando da credencial autenticada. Um
argumento de sinal como `approvedBy` continua sendo dado da aplicação, mesmo
quando tem a mesma grafia de um sujeito ator. Um gateway com um único token de
serviço registra o principal desse serviço, não necessariamente a pessoa por
trás da requisição. Derive qualquer campo de aprovação humana do usuário
autenticado do gateway e da decisão de autorização, em vez de aceitá-lo do cliente.

Para inspeção de auditoria, respostas de comandos e metadados vinculados de
comando/histórico expõem o principal registrado. O comando persistido o guarda
em `context.principal`; isso é separado dos argumentos do sinal e do valor
retornado por uma espera de sinal nomeado do workflow. A ausência de metadados
de principal não comprova um remetente específico. Veja o
[exemplo de sinal embarcado](/docs/features/signals#sender-identity-and-authorization)
para uma verificação de política Laravel e contexto de comando no host.

Use [tokens de principal nomeado](/docs/polyglot/server-config-reference#authentication)
quando trilhas de auditoria precisarem de sujeitos atores estáveis. Um token
de papel compartilhado não identifica um usuário individual da aplicação, e o
modo de desenvolvimento sem autenticação não fornece identidade humana
autenticada. Cabeçalhos encaminhados de atribuição de chamador/autenticação
podem adicionar rótulos de auditoria configurados; eles não fornecem o
principal autenticado pelo Server. Mantenha a atribuição encaminhada
desabilitada, a menos que os
[requisitos de gateway confiável](/docs/polyglot/server-config-reference#command-attribution)
sejam atendidos.

## Contrato de namespace {#namespace-contract}

O bootstrap cria o namespace padrão. Defina `DW_DEFAULT_NAMESPACE` quando
cabeçalhos de namespace omitidos devam resolver para algo diferente de `default`:

```bash
DW_DEFAULT_NAMESPACE=default
```

Crie cada namespace de tenant ou ambiente antes de direcionar clientes ou
workers para ele:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-prod",
    "description": "production order workflows",
    "retention_days": 90
  }'
```

Nomes de namespace são normalizados para minúsculas e podem conter letras,
números, ponto, sublinhado e hífen. Eles são únicos após a normalização. Por
exemplo, criar `Production` e depois `production` é um conflito com
`reason: "namespace_already_exists"`.

Um início normal de workflow nomeia o namespace com `X-Namespace`:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_type": "orders.fulfillment",
    "workflow_id": "order-1001",
    "task_queue": "orders",
    "input": ["order-1001"]
  }'
```

Leituras do plano de controle, comandos de workflow, operações de agendamento,
operações de atributos de busca e visibilidade de filas e workers usam esse
mesmo contexto de namespace. As próprias rotas de administração de namespaces
são a exceção: elas apontam para o namespace na rota ou no corpo e não exigem
que ele já exista antes de executar criação ou descrição.

## Contrato de registro de workers {#worker-registration-contract}

Cada processo worker deve se registrar antes de fazer polling. O registro tem
escopo de namespace, portanto a tupla `(namespace, worker_id)` identifica o
registro do worker. O `task_queue` registrado deve corresponder às futuras
requisições de poll desse ID de worker.

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/register" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "runtime": "python",
    "sdk_version": "<installed-sdk-version>",
    "build_id": "orders-worker-2026-04-22",
    "supported_workflow_types": ["orders.fulfillment"],
    "workflow_definition_fingerprints": {
      "orders.fulfillment": "sha256:definition-fingerprint"
    },
    "supported_activity_types": ["payments.capture"],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

| Campo | Obrigatório | Contrato |
| --- | --- | --- |
| `worker_id` | não | Identidade estável do processo. O servidor gera uma quando omitida, mas runtimes de longa duração devem defini-la para logs e diagnósticos da fila. |
| `task_queue` | sim | Fila consultada por este worker. Requisições de poll para outra fila falham com `reason: "task_queue_mismatch"`. |
| `runtime` | sim | Um de `php`, `python`, `rust`, `typescript`, `go`, `java` ou `external`. Aceitar um identificador de runtime não implica disponibilidade de um SDK de primeira parte. |
| `sdk_version` | não | Versão do SDK do runtime exibida na visibilidade e nos diagnósticos de workers. |
| `build_id` | não | Identidade de implantação/build usada na visibilidade por build id da fila e nas coortes de rollout. Deve permanecer estável para uma família de workers compatível com replay. |
| `supported_workflow_types` | não | Chaves de tipos de workflow que este worker pode reproduzir. Vazio significa sem filtro de tipos de workflow. |
| `workflow_definition_fingerprints` | não | Fingerprints determinísticos de definição por workflow. Novo registro ativo com fingerprint alterado é rejeitado. |
| `supported_activity_types` | não | Chaves de tipos de atividade que este worker pode executar. Vazio significa sem filtro de tipos de atividade. |
| `max_concurrent_workflow_tasks` | não | Slots locais anunciados de tarefas de workflow. Padrão `100`; mínimo `1`. |
| `max_concurrent_activity_tasks` | não | Slots locais anunciados de tarefas de atividade. Padrão `100`; mínimo `1`. |

Um novo registro ativo com o mesmo ID de worker é permitido quando os
fingerprints de definição anunciados não mudaram. Se um worker em execução
alterar o código de workflow de um tipo já anunciado, ele deve reiniciar com
um novo `worker_id`; caso contrário, o registro falha com
`reason: "workflow_definition_changed"`.

`build_id` não é apenas metadado decorativo. É a identidade de coorte visível
ao operador usada pelas APIs de rollout da fila. Mantenha um `build_id` para
workers que possam reproduzir com segurança o mesmo trabalho em andamento e
altere-o quando um rollout criar uma nova família de compatibilidade. Veja
[Compatibilidade e roteamento de workers](/docs/polyglot/worker-compatibility-routing)
para o contrato de vinculação e rollback e
[Rollout por build id de workers](/docs/polyglot/worker-build-id-rollout) para
o fluxo de drenagem/retomada.

## Polling e visibilidade {#polling-and-visibility}

Requisições de poll de workers devem usar o mesmo namespace, ID de worker e
fila de tarefas usados no registro:

```bash
curl -sS -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/worker/workflow-tasks/poll" \
  -H "Authorization: Bearer $DW_WORKER_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "py-orders-1",
    "task_queue": "orders",
    "timeout_seconds": 30
  }'
```

Operadores podem inspecionar o mesmo estado de registro pela visibilidade do
plano de controle:

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" | jq '.pollers, .admission'
```

A visibilidade da fila é o primeiro lugar a verificar quando workers não
recebem tarefas. Ela distingue workers ausentes de filas divergentes, filtros
de tipo de workflow/atividade sem suporte, slots saturados, limites de leases
ativos do servidor, limites de taxa de despacho e controle de pressão de consultas.

As próprias respostas de poll expõem o mesmo resultado legível por máquina em
`poll_status` quando o servidor anuncia
`worker_protocol.server_capabilities.poll_status = true` em
`GET /api/cluster/info`. Rotas de poll de tarefas de workflow, atividade e
consulta mantêm esse campo mesmo quando `task` é `null`, para que runtimes de
workers possam decidir com base em uma única interface estável:

- `leased`: o lease de uma tarefa foi concedido com sucesso.
- `empty`: nenhuma tarefa ficou pronta antes de o poll retornar.
- `throttled`: limites de admissão da fila retiveram uma nova tarefa neste poll.
- `unavailable`: o servidor não conseguiu coordenar a fila com segurança e
  retornou indisponibilidade tipada em vez de fingir que ela estava vazia.
- `draining`: a coorte de build id do worker está drenando; o poll falha com
  HTTP `409` e `reason: "worker_draining"` até a coorte ser retomada.

## Interface de erros {#error-surface}

Automações devem decidir com base em motivos nomeados em vez de mensagens em prosa.

| Motivo | Onde | Significado | Ação do operador |
| --- | --- | --- | --- |
| `missing_control_plane_version` | rota do plano de controle | A requisição omitiu `X-Durable-Workflow-Control-Plane-Version: 2`. | Adicione o cabeçalho de versão ou atualize o perfil do cliente. |
| `missing_protocol_version` | rota de worker | A requisição omitiu `X-Durable-Workflow-Protocol-Version: 1.0`. | Corrija o cliente worker ou a negociação de versão do SDK. |
| `namespace_not_found` | rota com escopo de namespace | O namespace de `X-Namespace`, query string ou padrão do servidor não existe. | Crie o namespace ou corrija o namespace do cliente. |
| `namespace_already_exists` | `POST /api/namespaces` | Um nome normalizado de namespace já existe. | Reutilize-o ou escolha um nome distinto. |
| `task_queue_mismatch` | rota de poll de worker | Um ID de worker registrado em uma fila tentou consultar outra. | Reinicie com um novo ID de worker ou consulte a fila registrada. |
| `worker_draining` | rota de poll de worker | A coorte de build id está marcada como drenando, podendo concluir trabalho em andamento, mas não reservar novas tarefas. | Retome a coorte para rollback ou pare o worker após drenar seus leases atuais. |
| `workflow_definition_changed` | `POST /api/worker/register` | Um ID de worker ativo tentou anunciar fingerprints de workflow alterados. | Reinicie o processo alterado com um novo ID de worker. |
| `validation_failed` | qualquer rota JSON | Um campo está ausente, malformado, grande demais ou fora dos limites permitidos. | Leia `errors` ou `validation_errors` e corrija o payload. |

## Veja também {#see-also}

- [Referência da API do Server](/docs/polyglot/server-api-reference)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
- [Admissão de filas de tarefas](/docs/polyglot/task-queue-admission)
- [Referência de comandos da CLI](/docs/polyglot/cli-reference)
