---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK Python
  - durable_workflow Client
  - worker Python
  - cliente assíncrono de workflow
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK Python {#python-sdk}

O SDK Python é um cliente simples com foco em operações assíncronas para um
Durable Workflow Server sob sua administração ou runtime de namespace do
Durable Workflow Cloud. Ele permite que processos Python iniciem, observem,
sinalizem e cancelem workflows pela API do plano de controle do runtime e se
registrem como workers que executam tarefas de workflow e atividades.

## Experimentar o playground local da Sample App {#try-the-local-sample-app-playground}

Para o caminho mais curto de autoria sem Cloud, abra a
[branch `main` atual da Sample App no GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
e execute:

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

O playground local gera código de workflow e atividade pertencente ao chamador,
seleciona os artefatos estáveis atuais e inicia o Server e Waterline publicados.
Ele aguarda um registro de worker cuja identidade, tipo de workflow, tipo de
atividade e fila correspondam ao contrato gerado antes de iniciar o workflow.
O sucesso exige o resultado concluído esperado e o histórico; então o terminal
imprime o link local exato da execução no Waterline e o caminho para evidências JSON estruturadas.

A instalação do pacote, o início rápido inline, a referência da API e o
exemplo do repositório abaixo continuam sendo os caminhos diretos para quem
não deseja a Sample App.

<ProductPromotion source="docs-v2-python-sdk">
Execute clientes e workers Python em um namespace gerenciado pelo Cloud com
credenciais separadas com escopo por papel.
</ProductPromotion>

O SDK usa o mesmo modelo durável do pacote PHP: IDs de instância, IDs de
execução, eventos de histórico, filas de tarefas e chaves de tipos são
compartilhados entre linguagens. Um worker Python pode executar atividades de
um workflow escrito em PHP e vice-versa.

Para comparar capacidades entre os SDKs Python, PHP e Rust e o `dw`, veja
[Capacidades de clientes e workers](/docs/polyglot/cli-python-parity/).

Para assinaturas de construtores, tipos de retorno, classes de exceção e nomes
de métricas, veja a [referência gerada da API do SDK Python](https://python.durable-workflow.com/).

O SDK Python 2.5.0 adiciona um cache opcional e limitado de histórico para
execução sticky. Use Server 2.5.10 ou posterior e habilite-o em cada worker.
Veja [Afinidade portátil de workers](/docs/polyglot/portable-worker-affinity) e
o [guia Python e exemplo executável](https://python.durable-workflow.com/guides/sticky-execution/).

Clientes do Cloud usam a URL de runtime e o namespace provisionados com
credenciais separadas de cliente e worker. Veja
[Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane) para esse
limite de conexão; o início rápido abaixo usa valores locais de infraestrutura própria.

## Requisitos {#requirements}

- Python 3.10 ou posterior
- Docker (para o Server local deste início rápido), um
  [Server sob sua administração](/docs/polyglot/server) existente ou um
  [runtime de namespace do Cloud](/docs/polyglot/cloud-control-plane) provisionado

## Instalação {#installation}

Instale o <PythonPackageReleaseLink authority="qualified">release estável do SDK
Python</PythonPackageReleaseLink>. O requisito exato é gerado da mesma tupla
do início rápido do Server, e um arquivo de lock ou restrições pode retê-lo
para reprodução.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

O SDK depende de [httpx](https://www.python-httpx.org/) para HTTP e do pacote
Python `fastavro` para codificar o formato de transmissão Apache Avro usado
pelo único codec público de payload v2. O suporte a métricas Prometheus é opcional.

## Início rápido {#quickstart}

Este é um programa Python completo que define um workflow com uma atividade,
o inicia em um servidor Durable Workflow local e aguarda o resultado:

<!-- docs-example id="python.quickstart.worker" -->
```python
import asyncio
import uuid

from durable_workflow import Client, Worker, workflow, activity

@activity.defn(name="greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "length": len(name)}

@workflow.defn(name="greeter")
class GreeterWorkflow:
    def run(self, ctx, *args):
        result = yield ctx.schedule_activity("greet", list(args))
        return result

async def main():
    workflow_id = f"greeting-{uuid.uuid4().hex}"

    async with Client("http://localhost:8080", token="dev-token", namespace="default") as client:
        handle = await client.start_workflow(
            workflow_type="greeter",
            task_queue="default",
            workflow_id=workflow_id,
            input=["world"],
        )

        worker = Worker(
            client,
            task_queue="default",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )

        await worker.run_until(workflow_id=workflow_id, timeout=30.0)
        result = await handle.result(timeout=10.0)

    print(result)  # {"greeting": "Hello, world!", "length": 5}

asyncio.run(main())
```

### Executar em um servidor local {#running-against-a-local-server}

O programa acima pressupõe um servidor Durable Workflow acessível em
`http://localhost:8080` com o `dev-token` local. Se ainda não tiver um, o
caminho mais rápido sem código-fonte é a imagem publicada do servidor:

```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-python-quickstart

docker run --rm \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready > /dev/null; do sleep 1; done
```

Para implantação em produção, incluindo drivers de autenticação, configuração
de banco e TLS, veja o [guia de configuração do servidor](/docs/polyglot/server).

Para um exemplo maior, o repositório do SDK inclui
[`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing),
uma stack Docker Compose que executa um worker Python por todo um workflow de pedidos.

## Referência da API do cliente {#client-api-reference}

O `durable_workflow.Client` assíncrono é a entrada pública para chamadas HTTP
dos planos de controle e workers. Use-o como gerenciador de contexto assíncrono
para fechar corretamente o pool de conexões `httpx.AsyncClient` subjacente.

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    token="shared-token",
    namespace="default",
    timeout=60.0,
) as client:
    info = await client.get_cluster_info()
```

### Construtor {#constructor}

| Argumento | Tipo | Padrão | Quando usar |
| --- | --- | --- | --- |
| `base_url` | `str` | obrigatório | Origem do Server, sem `/api`. |
| `token` | `str \| None` | `None` | Um token bearer deve autorizar chamadas dos planos de controle e workers. |
| `control_token` | `str \| None` | `None` | Chamadas do plano de controle precisam de um token bearer diferente do polling de workers. |
| `worker_token` | `str \| None` | `None` | Chamadas do plano de workers precisam de um token bearer diferente das chamadas de operador. |
| `namespace` | `str` | `"default"` | Selecionar um namespace do servidor por `X-Namespace`. |
| `timeout` | `float` | `60.0` | Substituir o timeout HTTP padrão. |
| `retry_policy` | `TransportRetryPolicy \| None` | política padrão | Ajustar novas tentativas de transporte para falhas HTTP transitórias. |
| `metrics` | `MetricsRecorder \| None` | sem operação | Emitir métricas de cliente e worker para um registrador personalizado. |
| `payload_size_limit_bytes` | `int` | padrão do SDK | Corresponder ao contrato de bytes máximos de payload do servidor. |
| `payload_size_warning_threshold_percent` | `int` | padrão do SDK | Avisar antes de um payload atingir o limite configurado. |
| `payload_size_warnings` | `bool` | `True` | Desabilitar avisos locais de tamanho de payload em testes ou scripts controlados. |

`token` é a opção mais simples. Se `control_token` e `worker_token` estiverem
definidos, métodos do plano de controle usam `control_token`, e métodos do
plano de workers usam `worker_token`.

### Armazenamento externo de payloads {#external-payload-storage}

Operações normais de `Client` e `Worker` usam automaticamente o transporte autenticado do runtime do Server. O SDK descobre a política e os limites por `GET /api/cluster/info`, envia valores codificados acima do limite ou necessários para que a solicitação caiba e busca os valores referenciados antes de decodificar. O código do workflow e da atividade recebe o valor decodificado. As credenciais ficam no Server. Workers remotos não precisam de boto3, clientes do provedor nem acesso ao diretório local do Server.

A referência do runtime usa o esquema `durable-workflow.v2.runtime-external-payload-reference.v1` e um `reference_id` opaco. Ela não contém `uri` do provedor. Envio e busca usam a credencial e o namespace normais, verificam tamanho e SHA-256 e preservam as barreiras de tentativa da tarefa e lease na conclusão. O [contrato HTTP](./server-api-reference.md#runtime-external-payload-transport) descreve rotas, limites e recusas tipadas. O suporte exige transporte compatível disponível, não apenas um driver configurado.

Os seguintes **helpers diretos de provedor** servem para armazenamento e testes de aplicações que acessam deliberadamente o próprio provedor. Eles usam outro esquema com URI. Não são necessários para clientes normais do Server ou Cloud. O Server recusa envelopes de provedor `external_storage` com HTTP `422` e `external_payload_unsupported`.

| API | Papel | Interface de falha |
| --- | --- | --- |
| `ExternalStorageDriver` | Protocolo para `put(data, sha256=..., codec=...)`, `get(uri)` e `delete(uri)`. | Erros de armazenamento lançados pelo driver. |
| `LocalFilesystemExternalStorage` | Driver `file://` sem dependências para desenvolvimento e testes locais. | `ValueError` quando um URI referenciado escapa da raiz configurada. |
| `S3ExternalStorage` | Adaptador para cliente compatível com boto3. | `ValueError` para referências a outro bucket/prefixo ou respostas que não sejam bytes. |
| `GCSExternalStorage` | Adaptador para cliente no estilo google-cloud-storage. | `ValueError` para referências a outro bucket/prefixo ou respostas que não sejam bytes. |
| `AzureBlobExternalStorage` | Adaptador para cliente de container Azure. | `ValueError` para referências a outro container/prefixo ou respostas que não sejam bytes. |
| `ExternalPayloadReference` | Referência imutável de transmissão com `uri`, `sha256`, `size_bytes`, `codec` e schema. | `ValueError` quando `from_dict()` recebe schema sem suporte ou campos malformados. |
| `ExternalPayloadCache` | Cache limitado de replay para bytes de payloads externos já verificados. | O construtor rejeita limites de entradas ou bytes não positivos. |
| `store_external_payload()` | Armazena bytes codificados por um driver e retorna `ExternalPayloadReference`. | Erros do driver. |
| `fetch_external_payload()` | Busca bytes referenciados e verifica tamanho e SHA-256 antes de decodificar. | `ExternalPayloadIntegrityError` em divergência de tamanho/hash. |
| `delete_external_payload()` | Exclui o objeto referenciado e remove sua entrada de cache. | Erros de armazenamento lançados pelo driver. |
| `external_storage_envelope()` | Codifica inline até ultrapassar o limite; depois grava os bytes por um driver. | `ValueError` quando o limite é inválido ou nenhum driver pode resolver uma referência. |
| `external_storage_driver_from_policy()` | Constrói um driver direto com uma política explícita e clientes do provedor da aplicação. Não autoriza acesso direto ao provedor no Server ou Cloud. | `ValueError` se a política estiver desativada, não for suportada ou faltar cliente/bucket/contêiner. |

```python
from durable_workflow import (
    ExternalPayloadCache,
    LocalFilesystemExternalStorage,
    external_storage_envelope,
    to_avro_payload_value,
)
from durable_workflow.serializer import encode
from durable_workflow.external_storage import fetch_external_payload, store_external_payload

storage = LocalFilesystemExternalStorage("/var/lib/durable-workflow/payloads")
cache = ExternalPayloadCache(max_entries=256, max_bytes=32 * 1024 * 1024)

payload = to_avro_payload_value({"invoice_pdf": "x" * 1_000_000})
envelope = external_storage_envelope(
    payload,
    external_storage=storage,
    threshold_bytes=64 * 1024,
)

reference = store_external_payload(
    storage,
    encode({"archived": True}).encode("utf-8"),
    codec="avro",
)
payload_bytes = fetch_external_payload(storage, reference, cache=cache)
```

Para esses helpers diretos, o esquema é `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA` (`durable-workflow.v2.external-payload-reference.v1`). Os adaptadores não acrescentam dependências de SDKs de nuvem a `durable-workflow`; a aplicação fornece seus clientes S3, GCS ou Azure configurados.

A referência de provedor possui estes campos. Ela não é a referência do runtime aceita pelas rotas HTTP do Server:

```json
{
  "schema": "durable-workflow.v2.external-payload-reference.v1",
  "uri": "s3://dw-payloads/billing/run-001/input.avro",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size_bytes": 1048576,
  "codec": "avro",
  "expires_at": "2026-05-22T00:00:00Z"
}
```

`ExternalPayloadReference.from_dict()` rejeita esquemas desconhecidos e campos inválidos. `fetch_external_payload()` verifica `size_bytes` e `sha256` antes de retornar bytes e lança `ExternalPayloadIntegrityError` quando tamanho ou hash divergem. Um objeto ausente também pode causar o erro do driver. Use `ExternalPayloadCache` apenas para bytes verificados. Remover do cache não autoriza excluir um objeto gerenciado pelo Server. `delete_external_payload()` opera diretamente no provedor, não é uma API de limpeza de referências do runtime.

Use `external_storage_driver_from_policy()` em código que acessa deliberadamente armazenamento da aplicação e possui o cliente necessário. Ler a política não torna envelopes de provedor solicitações válidas ao Server. Os clientes pertencem à aplicação. Adaptadores opcionais não acrescentam boto3, google-cloud-storage ou azure-storage-blob como dependências de runtime:

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

A fábrica lança `ValueError` se a política estiver desativada, o driver não for suportado ou faltar o cliente necessário. Uma política desativada não retorna driver vazio. Verifique `policy.enabled` antes de solicitá-lo.

### Namespaces {#namespaces}

Namespaces são o limite de tenancy para workflows, agendamentos, atributos de
busca e armazenamento externo de payloads. O Client aponta para um namespace
por vez pelo argumento `namespace=`, mas a interface de operador abaixo se
aplica a qualquer namespace autorizado pelo token bearer.

| Método | Retorno | Interface de falha |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | Erros de autenticação/servidor. |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`, erros de autenticação/servidor. |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | `InvalidArgument` para nomes duplicados ou retenção inválida, erros de autenticação/servidor. |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`, `InvalidArgument`, erros de autenticação/servidor. Só os campos fornecidos são enviados. |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | `InvalidArgument` quando a política falha na validação do servidor, erros de autenticação/servidor. |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | `InvalidArgument` quando faltam campos exigidos na política vinculada, erros de autenticação/servidor. |

`set_namespace_external_storage` espelha `dw namespace:set-storage-driver`. O
primeiro argumento posicional é o `name` do namespace, como em
`describe_namespace`, `create_namespace` e `update_namespace`. O alias
obsoleto `namespace=` emite `DeprecationWarning`; código novo deve usar `name`
posicional. O dict `config` contém chaves específicas do driver, incluindo o
campo opcional `disk` em `s3`, `gcs` e `azure`, para que credenciais fiquem no
servidor. O `NamespaceDescription` retornado reflete a política realmente
persistida, incluindo o limite usado como fallback quando o chamador não fornece um.

`test_external_storage` espelha `dw storage:test`. O servidor grava e lê um
payload pequeno e um grande pelo driver externo vinculado e retorna
`StorageTestResult`, que expõe registros `StoragePayloadTestResult` por
payload com campos `wrote`, `read`, `verified`, `latency_ms` e `bytes`.

`NamespaceDescription` contém a política `external_payload_storage` descrita em [Armazenamento externo de payloads](#external-payload-storage). Clientes normais usam automaticamente o transporte descoberto do runtime. Helpers diretos exigem acesso ao provedor pertencente à aplicação; descrever uma política não torna envelopes de provedor solicitações válidas ao Server.

### Cluster e filas de tarefas {#cluster-and-task-queues}

| Método | Retorno | Observações |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Chama o endpoint de saúde para verificar liveness. |
| `await client.get_cluster_info()` | `dict[str, Any]` | Lê versão do servidor, protocolo, capacidades e metadados de compatibilidade. |
| `await client.list_task_queues()` | `TaskQueueList` | Lista filas visíveis no namespace. |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Retorna capacidade de workers, leases atuais, admissão de consultas e fatos do orçamento de despacho. |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | Obtém snapshot das coortes por build id de uma fila, incluindo workers sem versão na coorte com `build_id` igual a `None`. |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Marca uma coorte como drenando para parar de reservar novas tarefas. Passe `build_id=None` para workers sem versão. Idempotente. |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Reverte uma drenagem anterior para voltar a reservar trabalho. Passe `build_id=None` para workers sem versão. Idempotente. |

Os tipos de retorno de filas expõem as dataclasses aninhadas
`TaskQueueAdmission`, `TaskQueueTaskAdmission`, `TaskQueueQueryAdmission`,
`TaskQueueBuildIdCohort`, `TaskQueueBuildIdRollout` e
`TaskQueueBuildIdRolloutState`, para que scripts verifiquem capacidade no
servidor e rollout por build id sem interpretar prosa. Veja
[Rollout por build id de workers](/docs/polyglot/worker-build-id-rollout) para
o procedimento completo; os equivalentes CLI são `dw task-queue:build-ids`,
`dw task-queue:drain` e `dw task-queue:resume`.

### Operações de workflow {#workflow-operations}

| Método | Retorno | Interface de falha |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.list_workflows(...)` | `WorkflowList` | Erros de autenticação/servidor |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.get_history(workflow_id, run_id)` | payload de histórico decodificado | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.export_history(workflow_id, run_id)` | payload de histórico de arquivo decodificado | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, erros de autenticação/servidor |
| `await client.query_workflow(workflow_id, query_name, args=None)` | resultado de consulta decodificado | `QueryFailed`, `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | resultado de atualização decodificado | `UpdateRejected`, `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, erros de autenticação/servidor |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | saída decodificada do workflow | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` aceita `workflow_type`, `task_queue`, `workflow_id` opcional,
`input` opcional, `duplicate_policy`, `memo`, `search_attributes`,
`business_key`, `execution_timeout_seconds` e `run_timeout_seconds`. Todos os
payloads do chamador são envelopados em Avro antes de cruzar o limite HTTP.

Use `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`
quando um script já conhece o ID do workflow e deseja métodos de handle.

| Método de `WorkflowHandle` | Método equivalente do cliente |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

Ambas as operações fecham a execução no Server imediatamente com resultados
terminais distintos. `cancel_workflow` não entrega uma solicitação cooperativa
ao código do workflow nem executa limpeza de saga/finally. Use
`request_cancellation()` com workers cooperantes para limpeza limitada. Veja o
[guia de cancelamento cooperativo](/docs/polyglot/cancellation) para políticas
de operações, supervisão e recuperação.

### Agendamentos {#schedules}

Agendamentos usam `ScheduleSpec` para regras de calendário/intervalo e
`ScheduleAction` para a requisição de início de workflow emitida no disparo.

| Método | Retorno | Observações |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | Cria um agendamento e retorna um handle. |
| `await client.list_schedules()` | `ScheduleList` | Lista agendamentos visíveis. |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | Lê status, ação, próximo disparo e contadores. |
| `await client.update_schedule(schedule_id, ...)` | `None` | Atualiza especificação, ação, política de sobreposição, jitter, memo, atributos de busca ou nota. |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | Pausa disparos futuros. |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | Retoma um agendamento pausado. |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | Solicita um disparo imediato. |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | Reproduz janelas de disparo perdidas. |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | Retorna uma página do stream de auditoria do agendamento em ordem crescente de `sequence`. `limit` é limitado no servidor entre 1 e 500 (padrão 100); `after_sequence` é um cursor não negativo obtido de `next_cursor` da página anterior. Lança `ScheduleNotFound` para ID desconhecido. O histórico sobrevive a `delete_schedule` para permitir auditar por que um agendamento foi removido. |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Produz todos os eventos de auditoria, paginando internamente até o servidor informar `has_more=False`. Mesmas falhas de `get_schedule_history`. |
| `await client.delete_schedule(schedule_id)` | `None` | Exclui o agendamento. |

`client.get_schedule_handle(schedule_id)` retorna `ScheduleHandle` com métodos
`describe`, `update`, `pause`, `resume`, `trigger`, `backfill`, `history`,
`iter_history` e `delete` que encaminham aos métodos correspondentes do
cliente. `ScheduleHandle.history(...)` retorna `ScheduleHistoryPage`, e
`ScheduleHandle.iter_history(...)` retorna `AsyncIterator[ScheduleHistoryEvent]`.

Uma `ScheduleHistoryPage` contém a lista ordenada `events`, flag `has_more`,
inteiro `next_cursor` (ou `None` na última página), `schedule_id` e o
`namespace` responsável. Cada `ScheduleHistoryEvent` contém `sequence`,
`event_type` (`ScheduleCreated`, `SchedulePaused`, `ScheduleResumed`,
`ScheduleUpdated`, `ScheduleTriggered`, `ScheduleTriggerSkipped` ou
`ScheduleDeleted`), `recorded_at`, `workflow_instance_id` e `workflow_run_id`
opcionais para workflows disparados e o dicionário bruto `payload` registrado
pelo plano de controle na transição.

### Eventos de ponte e métodos do plano de workers {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)`
retorna `BridgeAdapterOutcome`, o mesmo contrato de resultado legível por
máquina usado por `dw bridge:webhook`. É a entrada Python para ingresso
limitado de sistemas baseados em webhooks.

Métodos de baixo nível do plano de workers são públicos para workers
personalizados e testes de protocolo, mas aplicações normais devem usar `Worker`:

| Grupo de métodos | Métodos |
| --- | --- |
| Registro de worker | `register_worker` |
| Tarefas de workflow | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| Tarefas de consulta | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| Tarefas de atividade | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

Esses métodos enviam `X-Durable-Workflow-Protocol-Version` e usam
`worker_token` quando configurado. Prefira `Worker`, de nível mais alto, a
menos que esteja escrevendo um adaptador de SDK ou teste de conformidade do protocolo.

`workflow_task_history(...)` pagina histórico de replay de uma tarefa de
workflow já sob lease. Chame somente depois de `poll_workflow_task(...)`
retornar `next_history_page_token`:

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

O corpo da requisição usa `next_history_page_token`, `lease_owner` e
`workflow_task_attempt`. A resposta decodificada usa os nomes do protocolo de
workers `history_events`, `total_history_events` e `next_history_page_token`;
não usa os nomes `events` ou `next_page_token` do histórico de execução do plano de controle.

### Workers {#workers}

O registro de workers expõe quais workers o servidor viu recentemente e o que
cada um pode executar. Use esses métodos para rollouts por build id, localizar
workers desatualizados a remover e reconciliar capacidade da frota em scripts de operação.

| Método | Retorno | Interface de falha |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | Erros de autenticação/servidor. |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, erros de autenticação/servidor. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, erros de autenticação/servidor. |

`list_workers` filtra no servidor: passe `task_queue` para restringir a uma
fila e `status` para uma string de status reconhecida. O padrão retorna todos
os workers registrados no namespace.

`WorkerDescription` contém runtime, versão de SDK, build id, tipos de workflow
e atividade declarados, último heartbeat e admissão atual de tarefas, para
que um script decida qual coorte drenar ou quais workers remover do registro.

`deregister_worker` é idempotente no servidor; remove um worker que não envia
mais heartbeats para manter limpos o cálculo de capacidade e `list_workers`.
Não interrompe leases em andamento.

### Atributos de busca {#search-attributes}

Atributos de busca são metadados tipados de namespace presentes em execuções
para filtragem e indexação. O cliente Python espelha a mesma interface do
plano de controle da CLI.

| Método | Retorno | Interface de falha |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | Erros de autenticação/servidor. |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | `InvalidArgument` para nomes duplicados ou tipos sem suporte, erros de autenticação/servidor. |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`, `InvalidArgument` para atributo definido pelo sistema, erros de autenticação/servidor. |

`SearchAttributeList` separa definições `system` e `custom`, permitindo a
scripts verificar se as chaves do motor (ID do workflow, status, tipo, início
etc.) estão presentes antes de recusar criar uma chave personalizada
conflitante. Valores suportados de `attribute_type` são `keyword`, `text`,
`int`, `double`, `bool`, `datetime` e `keyword_list`.

### Manutenção do sistema {#system-maintenance}

Scripts de operação e automação de plantão acionam pelo Client os mesmos loops
de manutenção dos comandos `dw system:*`. Cada método exige escopo admin no
token bearer; sem ele, o servidor retorna `Unauthorized`.

| Método | Retorno | Equivalente CLI |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` executa uma varredura de reparo de tarefas. Sem filtros, o
servidor cobre todo o namespace; passe `run_ids` para restringir a uma lista de
execuções ou `instance_id` para limitar a uma instância em execução.

Sem `run_ids`, `retention_pass` pede ao Server PHP para podar execuções
terminais expiradas pela política atual do namespace, até seu limite de
varredura. `run_ids` explícitos apontam diretamente para execuções fechadas e
ignoram essa varredura por idade; podem podar histórico mais recente que a
janela limitada de retenção. Proteções de retenção para sempre e de execuções
arquivadas continuam válidas. `retention_status()` informa política, corte e
lista limitada de elegíveis sem excluir histórico. Revise o
[procedimento de retenção](./server.md#retention) antes de encurtar uma
política ou enviar destinos explícitos.

`activity_timeout_pass` aplica prazos start-to-close e schedule-to-close a
execuções de atividade que já os ultrapassaram. Sem filtros, processa
execuções expiradas até seu limite de varredura; passe `execution_ids` para
uma lista específica ou `limit` para limitar uma passagem.

Esses métodos não lançam erro quando não há trabalho: chamadas repetidas em
períodos tranquilos retornam os mesmos contadores `passes` / `repaired` /
`pruned` com deltas zero, portanto são seguras em scripts de operação via cron.

## Definir workflows {#defining-workflows}

Workflows são classes Python decoradas com `@workflow.defn`. O método `run` é
um gerador que produz comandos para o servidor.

```python
from durable_workflow import workflow

@workflow.defn(name="order-processing")
class OrderWorkflow:
    def run(self, ctx, *args):
        order = args[0] if args else {}

        # Schedule an activity and wait for the result
        validated = yield ctx.schedule_activity(
            "validate_order", [order]
        )

        # Start a timer (durable sleep)
        yield ctx.start_timer(seconds=60)

        # Schedule another activity
        receipt = yield ctx.schedule_activity(
            "process_payment", [validated]
        )

        return receipt
```

O `name` em `@workflow.defn(name="...")` é a chave de tipo usada entre todas as
linguagens. Deve ser uma string simples, não um caminho de módulo Python ou referência de classe.

### Sinais, consultas e atualizações {#signals-queries-and-updates}

Sinais são registrados no histórico durável e despachados para handlers Python
durante o replay do workflow:

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False
        self.approved_by = None

    @workflow.signal("approve")
    def approve(self, by: str) -> None:
        self.approved = True
        self.approved_by = by

    def run(self, ctx, *args):
        ready = yield ctx.wait_condition(
            lambda: self.approved, key="approval.approved", timeout=60,
        )
        return {
            "status": "approved" if ready else "timed_out",
            "approved": self.approved,
            "approved_by": self.approved_by,
        }
```

A espera pertence ao workflow, não a uma atividade. O predicado lê o estado do manipulador de sinal reconstruído no replay; o worker não mantém um slot de atividade ocupado pela aprovação. O timeout da condição é separado dos prazos finitos do run e da execução completa do workflow. Para concluir um trabalho externo, use uma atividade curta que envia e retorna, com um [callback correlacionado](./polling-patterns.md#callback-and-signal-completion).

Decoradores de receptores de consultas e atualizações permitem que classes de
workflow publiquem nomes estáveis de handlers. Workers Python executam
tarefas de consulta roteadas pelo servidor reproduzindo o histórico confirmado
e invocando o handler registrado sobre esse estado reproduzido. Também aplicam
atualizações aceitas entregues por tarefas de workflow:

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False

    @workflow.query("status")
    def status(self) -> dict:
        return {"approved": self.approved}

    @workflow.update("set_approval")
    def set_approval(self, approved: bool) -> dict:
        self.approved = approved
        return {"approved": self.approved}

    @set_approval.validator
    def validate_set_approval(self, approved: bool) -> None:
        if not isinstance(approved, bool):
            raise ValueError("approved must be boolean")
```

Workers Python concluem consultas roteadas pelo servidor retornando um
resultado de tarefa de consulta. Para um validador de atualização declarado,
o worker recebe uma tarefa dedicada de validação, reproduz o estado
autoritativo do workflow e invoca somente o validador. O servidor não registra
atualização aceita nem despacha o handler de atualização antes de essa
validação ter sucesso. Workers com validadores recusam o registro a menos
que a descoberta anuncie o contrato síncrono de pré-aceitação; rejeição,
workers ausentes ou incompatíveis, perda de worker, timeout e conclusão
duplicada ou antiga isolada por fencing continuam sendo resultados tipados
explícitos. PHP e Rust atualmente não expõem APIs de autoria de validadores
e anunciam essa ausência nos contratos de workflow em vez de declarar paridade de validadores.

### Contexto do workflow {#workflow-context}

O `WorkflowContext` passado a `run` fornece operações determinísticas:

| Método | Descrição |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Agenda uma tarefa de atividade, opcionalmente com novas tentativas e timeouts por chamada |
| `ctx.start_timer(seconds)` | Espera durável |
| `ctx.start_child_workflow(type, args)` | Inicia um workflow filho, opcionalmente com novas tentativas e timeouts de workflow por chamada |
| `yield [command, [...]]` | Aguarda um grupo determinístico aninhado de atividades, workflows filhos, temporizadores ou tipos mistos na ordem de entrada |
| `yield ctx.select({key: command, ...})` | Retoma com o primeiro membro confirmado duravelmente, mantendo handles de todos os não vencedores |
| `ctx.saga()` | Registra e executa compensações duráveis de atividades em ordem inversa |
| `ctx.side_effect(fn)` | Captura um valor não determinístico |
| `ctx.get_version(change_id, min, max)` | Versionamento seguro do código de workflow |
| `ctx.upsert_search_attributes(attrs)` | Atualiza atributos de busca |
| `ctx.continue_as_new(*args)` | Reinicia o workflow com nova entrada |
| `ctx.now()` | Horário de início persistido do workflow, fixo durante este run |
| `ctx.random()` | Gerador aleatório com semente |
| `ctx.uuid4()` | UUID determinístico |
| `ctx.logger` | Logger silencioso durante replay |

### Tempo do workflow e esperas duráveis {#workflow-time-and-durable-waits}

Durante o replay no worker, `ctx.now()` retorna o **horário de início
persistido do run**. Ele não avança após uma atividade, temporizador, sinal ou
outra etapa durável. Replays a frio do mesmo histórico retornam o mesmo valor
inicial. Um sucessor continue-as-new tem seu próprio horário de início e não
mantém a referência do relógio do predecessor.

A [implementação Python publicada](https://github.com/durable-workflow/sdk-python/blob/150c6f6bc14e3516f75cc615b2f75f093ed84ea1/src/durable_workflow/workflow.py#L2594-L2601)
usa `WorkflowStarted.payload.timestamp` quando presente; caso contrário, usa o
valor canônico `WorkflowStarted.recorded_at`. Um horário persistido ausente ou
inválido gera um erro explícito de relógio, sem autorizar a leitura do relógio
de parede do worker. Esse é o contrato de início fixo definido no
[SDK #146](https://github.com/durable-workflow/sdk-python/issues/146).

Aguarde uma operação durável em vez de repetir um laço até `ctx.now()` mudar:

```python
from durable_workflow import workflow


@workflow.defn(name="wait_without_clock_loop")
class WaitWithoutClockLoop:
    def run(self, ctx):
        started_at = ctx.now()
        yield ctx.start_timer(30)
        return {
            "run_started_at": started_at.isoformat(),
            "after_wait": ctx.now().isoformat(),
        }
```

A conclusão durável do temporizador retoma o workflow. Os dois horários
retornados são o mesmo início. Um laço como `while ctx.now() < deadline` não
passa a falso apenas porque os temporizadores disparam.

Para um atraso relativo, use `yield ctx.start_timer(seconds)` ou
`yield ctx.sleep(seconds)`. Use a [seleção da primeira conclusão](#first-completion-selection)
quando um trabalho precisar disputar com um temporizador durável. Configure
`execution_timeout_seconds` e `run_timeout_seconds` em
`client.start_workflow(...)` quando o Server precisar impor um prazo ao
workflow, inclusive com os workers parados. Um timeout HTTP ou da espera de
`get_result()` limita apenas essa requisição local; ele não substitui o prazo
persistido do workflow. Para manter um prazo da aplicação em continue-as-new,
passe-o explicitamente como entrada sem substituir o prazo original de
execução do Server.

Para medir o tempo decorrido dentro de uma invocação de atividade, leia ali
um relógio monotônico e retorne a duração como resultado da atividade. Para um
prazo UTC externo, faça uma atividade consultar o relógio externo que é a
fonte de autoridade e retornar sua decisão; o workflow reproduz esse resultado
registrado. Nunca compare horários UTC com valores monotônicos nem subtraia
leituras monotônicas de processos ou hosts diferentes. Subtrair `ctx.now()`
não mede tempo de processamento ativo nem tempo de parede decorrido em Python.

#### Diferenças entre os relógios dos SDKs {#clock-differences-across-sdks}

Essas APIs são determinísticas quando disponíveis, mas não compartilham um único relógio:

| Superfície de autoria | Chamadas repetidas e etapas duráveis | Sucessor continue-as-new |
| --- | --- | --- |
| Python `ctx.now()` | Fixo no horário de início persistido deste run, inclusive depois de um temporizador ou atividade. | Usa a referência inicial do run sucessor. |
| PHP embutido `Workflow::now()` | Começa no início do run e avança para o horário registrado do evento consumido pelo replay. Veja [tempo do workflow](../features/timers.md#reading-deterministic-time). | Começa com o novo run e avança pelos eventos consumidos desse run. |
| SDK PHP no modo serviço | Sem um helper público geral `now()` para workflows. Use operações duráveis ou valores registrados de atividades ou efeitos colaterais. | Passe explicitamente o estado temporal da aplicação se ele precisar sobreviver à transferência. |
| SDK Rust no modo serviço | Sem um helper público geral `WorkflowContext::now()`. Um `side_effect` pode registrar uma pequena leitura do relógio de parede; ele não é um relógio que avança. | Um efeito colateral no novo run é uma nova operação; passe explicitamente o estado temporal anterior se necessário. |

O comportamento do PHP embutido está no
[Core publicado](https://github.com/durable-workflow/workflow/blob/64efa176e4c37e5d6ae80e767ba3b41464024e53/src/V2/Support/WorkflowFiberContext.php).
Os contextos separados do [SDK PHP](https://github.com/durable-workflow/sdk-php/blob/2.5.2/src/Worker/WorkflowContext.php)
e do [SDK Rust](https://github.com/durable-workflow/sdk-rust/blob/3.5.5/src/lib.rs)
têm APIs próprias. Porte a operação durável e a política de prazos sem supor
que um helper de relógio tenha a mesma semântica em todos os SDKs.

#### Ordene eventos emitidos com valores de sequência {#order-emitted-events-with-sequence-values}

Um horário do workflow não é uma chave de ordenação de eventos. Eventos Python
marcados com `ctx.now()` podem ter todos o mesmo horário. Use os
[offsets de Workflow Streams](./workflow-streams.md), a
[sequência da outbox embutida](../features/message-streams.md) correspondente ou
um contador determinístico local ao workflow. Combine um contador local ao run
com `run_id`; passe-o explicitamente por continue-as-new se a aplicação
precisar de uma sequência lógica única. Streams ou runs independentes não
ganham uma ordem global a partir de seus horários.


### Novas tentativas e timeouts de atividades {#activity-retries-and-timeouts}

Use `ActivityRetryPolicy` e argumentos nomeados de timeout em
`ctx.schedule_activity(...)` quando uma chamada precisar de orçamento de novas
tentativas ou prazo diferente do comportamento padrão de tentativa única:

```python
from durable_workflow import ActivityRetryPolicy

receipt = yield ctx.schedule_activity(
    "process_payment",
    [validated],
    retry_policy=ActivityRetryPolicy(
        max_attempts=4,
        initial_interval_seconds=1,
        backoff_coefficient=2,
        maximum_interval_seconds=30,
        non_retryable_error_types=["ValidationError"],
    ),
    start_to_close_timeout=120,
    schedule_to_close_timeout=300,
    heartbeat_timeout=15,
)
```

`start_to_close_timeout` limita uma tentativa após o worker iniciá-la.
`schedule_to_close_timeout` limita toda a execução da atividade entre todas as
tentativas. `heartbeat_timeout` exige que atividades de longa duração chamem
`activity.context().heartbeat(...)` antes de o intervalo expirar. A política
de novas tentativas é capturada na execução durável quando ela é agendada,
portanto implantações posteriores não alteram tentativas já em andamento.

`ctx.schedule_activity(..., queue="payments-v2")` seleciona a fila de uma nova execução de atividade. Atividades já registradas, suas novas tentativas e tarefas reparadas mantêm a fila original. Alterar `Worker.task_queue` não move essas tarefas nem a fila de workflow das execuções existentes. Mantenha o pool antigo compatível disponível até contabilizar todas as dependências; consulte as [filas de atividade registradas](./task-matching-dispatch.md#recorded-activity-queues).

### Regras de determinismo {#determinism-rules}

O código do workflow é reproduzido do histórico. Não deve realizar diretamente
operações não determinísticas:

- Sem E/S (chamadas HTTP, leitura de arquivos, consultas ao banco)
- Sem `datetime.now()` ou `time.time()`; use `ctx.now()` apenas como referência fixa do início do run e temporizadores duráveis para esperar.
- Sem `random.random()`; use `ctx.random()`
- Sem `uuid.uuid4()`; use `ctx.uuid4()`

Todo não determinismo deve passar pelo contexto ou ser capturado com `ctx.side_effect()`.

### Fan-out {#fan-out}

Produza uma lista de comandos com yield para executá-los concorrentemente:

```python
@workflow.defn(name="fan-out-example")
class FanOutWorkflow:
    def run(self, ctx, *args):
        items = args[0]

        # Nested lists may mix activities, children, and timers.
        results = yield [
            ctx.schedule_activity("process_item", [items[0]]),
            [
                ctx.start_child_workflow("process-batch", [items[1:]]),
                ctx.start_timer(1),
            ],
        ]

        return results  # same nested shape and input order
```

O worker emite um comando comum por folha durável e anexa os campos estáveis
compartilhados `parallel_group_*` e o caminho completo de fora para dentro.
O histórico pode fechar membros em qualquer ordem; o replay ainda vincula
resultados e falhas pela posição durável da entrada. Entrega terminal
duplicada exata é ignorada. Histórico pendente após reinício e histórico
totalmente concluído reconstroem o mesmo grupo sem reagendar trabalho concluído.

### Seleção da primeira conclusão {#first-completion-selection}

Use `ctx.select()` quando trabalho independente deva iniciar junto, mas o
workflow possa avançar após a conclusão de um membro:

```python
selected = yield ctx.select({
    "resolver": ctx.schedule_activity("resolve-request", [request_id]),
    "input": ctx.wait_condition(lambda: self.resolution is not None, key="resolution-ready"),
    "deadline": ctx.start_timer(2),
})

if selected.key == "deadline":
    yield selected.handles["resolver"].cancel()
    return {"status": "timed_out"}

yield selected.handles["deadline"].cancel()
return {"status": "resolved", "value": selected.result()}
```

O `SelectionResult` inclui chave estável do vencedor, índice da entrada, tipo
da operação, identidade durável, resultado tipado e todas as instâncias de
`DurableOperationHandle`. `yield handle.await_result()` aguarda um não vencedor
mais tarde; `yield handle.cancel()` registra uma solicitação explícita sem
valor de retorno. Somente o histórico confirmado `SelectionOperationCancelled`
prova que o cancelamento venceu; o replay avança além de uma solicitação sem
marcação, e `await_result()` ainda retorna uma conclusão confirmada primeiro.
O replay consome o vencedor persistido mesmo se o histórico posterior contiver
outra conclusão primeiro. Entrega externa duplicada e fora de ordem não pode
substituir um vencedor já confirmado.

### Compensação de saga {#saga-compensation}

```python
def forward(saga):
    flight = yield ctx.schedule_activity("trip.reserve-flight", [])
    saga.add_compensation("trip.cancel-flight", [flight])

    hotel = yield ctx.schedule_activity("trip.reserve-hotel", [])
    saga.add_compensation("trip.cancel-hotel", [hotel])

    yield ctx.schedule_activity("trip.charge", [])
    return {"status": "booked"}

return (yield from ctx.saga().run(forward))
```

A saga executa comandos comuns de atividade sequencialmente em ordem inversa
de registro após uma falha. O `cancel_workflow` terminal não retoma o workflow
para executar compensações. O auxiliar para na primeira falha de compensação.
`SagaCompensationFailed` preserva falha inicial, falha da compensação, tipo de
atividade da compensação e ordem determinística de registro como diagnósticos estruturados.

### Workflows filhos {#child-workflows}

```python
from durable_workflow import ChildWorkflowRetryPolicy

result = yield ctx.start_child_workflow(
    "child-workflow-type",
    [{"input": "data"}],
    task_queue="child-queue",
    parent_close_policy="terminate",
    retry_policy=ChildWorkflowRetryPolicy(
        max_attempts=3,
        initial_interval_seconds=2,
        backoff_coefficient=2,
        non_retryable_error_types=["ValidationError"],
    ),
    execution_timeout_seconds=600,
    run_timeout_seconds=120,
)
```

`execution_timeout_seconds` limita a execução lógica do workflow filho entre
novas tentativas e execuções de continuar como novo. `run_timeout_seconds`
limita cada tentativa de execução filha. O backoff é aplicado após falha da
execução filha; comandos de início inválidos são erros de protocolo e não
são repetidos como tentativas do filho.

### Continuar como novo {#continue-as-new}

Para workflows de longa duração, use continuar como novo para reiniciar o histórico:

```python
from durable_workflow import ContinueAsNew

@workflow.defn(name="polling-workflow")
class PollingWorkflow:
    def run(self, ctx, *args):
        iteration = args[0] if args else 0

        result = yield ctx.schedule_activity("poll_source", [])

        if result.get("done"):
            return result

        # Continue with incremented iteration
        return ContinueAsNew(arguments=[iteration + 1])
```

## Definir atividades {#defining-activities}

Atividades são funções Python assíncronas decoradas com `@activity.defn`.
Diferentemente dos workflows, atividades podem fazer E/S livremente.

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

O `name` é a chave de tipo compartilhada entre linguagens. Um workflow PHP
pode agendar uma atividade chamada `"send_email"` e um worker Python a
executará, e vice-versa.

### Contexto da atividade {#activity-context}

Dentro de uma atividade, acesse metadados de execução e heartbeat por `activity.context()`:

```python
@activity.defn(name="long_running_task")
async def long_running_task(items: list) -> dict:
    ctx = activity.context()

    print(f"Attempt #{ctx.info.attempt_number}")
    print(f"Task queue: {ctx.info.task_queue}")

    for i, item in enumerate(items):
        # Check for cancellation
        if ctx.is_cancelled:
            return {"partial": True, "processed": i}

        await process(item)

        # Heartbeat to keep the task alive
        await ctx.heartbeat({"progress": i + 1, "total": len(items)})

    return {"processed": len(items)}
```

### Requisições de heartbeat {#activity-heartbeat-requests}

Para atividades remotas, chame `await ctx.heartbeat(...)` durante trabalho de atividade limitado, bem antes de `heartbeat_timeout`. A primeira janela começa na reivindicação pelo runtime, antes de o Python receber a tarefa. Cada heartbeat registrado usa o horário em que o runtime o registra, não quando a resposta chega ao Python. Pausas, latência das requisições e novas tentativas de transporte consomem o orçamento. Siga as [orientações de cadência](../features/heartbeats.md#heartbeat-cadence-and-receipts).

A chamada direta a `Client.heartbeat_activity_task()` usa a `TransportRetryPolicy` configurada. Após essa política, erros de transporte podem se propagar como `httpx.TransportError`, e recusas HTTP se tornam exceções do SDK, como `ServerError`. São novas tentativas HTTP, não outra tentativa de atividade nem mais tempo para o heartbeat. `ActivityContext.heartbeat()` pode lançar `ActivityCancelled` quando o worker manda a atividade parar. Com o worker normal de supervisão cooperativa, falhas de heartbeat ou de verificação de posse podem parar ou abandonar o callback. Não suponha que toda falha volte a um bloco de captura ou que a limpeza sempre seja executada.

Não suprima falhas de heartbeat ou de posse para continuar trabalho externo ou informar sucesso. Progresso não é um commit externo nem uma confirmação de checkpoint retomável. Mantenha os efeitos externos idempotentes.

### Erros que não permitem nova tentativa {#non-retryable-errors}

Lance `NonRetryableError` para falhar a atividade sem novas tentativas:

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

## Worker {#worker}

O `Worker` se registra no servidor, faz poll por tarefas e as despacha para
suas implementações de workflow e atividade.

Para processos independentes de workflow e atividade, siga o
[guia executável de separação de processos](https://python.durable-workflow.com/guides/separate-workers/)
do SDK Python. Ele cobre registros separados, filas compartilhadas ou
distintas, novas tentativas, slots por papel e encerramento gracioso.

```python
from durable_workflow import Client, Worker

async with Client("http://localhost:8080", token="secret") as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow, OrderWorkflow],
        activities=[greet, send_email, validate],
        max_concurrent_workflow_tasks=10,
        max_concurrent_activity_tasks=10,
    )

    await worker.run()  # blocks until worker.stop() is called
```

Para testes de fumaça e exemplos de um workflow,
`await worker.run_until(workflow_id="...", timeout=60.0)` registra o mesmo
worker e conduz um workflow a um estado terminal com polling sequencial. Use
`run()` para workers implantados que devam continuar fazendo polling.

| Parâmetro | Padrão | Descrição |
|-----------|---------|-------------|
| `task_queue` | obrigatório | Fila de tarefas a consultar |
| `workflows` | `()` | Classes de workflow a registrar |
| `activities` | `()` | Funções de atividade a registrar |
| `worker_id` | gerado automaticamente | Identificador único do worker |
| `poll_timeout` | `35.0` | Timeout de long poll em segundos |
| `max_concurrent_workflow_tasks` | `10` | Máximo de tarefas paralelas de workflow |
| `max_concurrent_activity_tasks` | `10` | Máximo de tarefas paralelas de atividade |
| `shutdown_timeout` | `30.0` | Segundos para drenar tarefas em andamento na parada |
| `metrics` | registrador do cliente | Registrador opcional de métricas para contadores/histogramas de polls e tarefas |
| `interceptors` | `()` | Wrappers ordenados de tarefas para instrumentação, tracing e hooks de política |

Os dois valores `max_concurrent_*` são anunciados no registro e aparecem nos
diagnósticos de admissão da fila. Trate-os como capacidade local do worker.
Use limites de [admissão de filas de tarefas](/docs/polyglot/task-queue-admission)
no servidor quando um namespace, fila ou grupo de orçamento downstream
precisar de um orçamento compartilhado rígido entre vários workers.

### Referência da API do worker {#worker-api-reference}

| Método | Retorno | Quando usar |
| --- | --- | --- |
| `await worker.run()` | `None` | Processo de longa duração supervisionado por systemd, Docker, Kubernetes ou shell local de desenvolvimento. Registra uma vez e consulta tarefas de workflow, atividade e consulta até parar ou ser cancelado. |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | Testes de fumaça e exemplos que iniciam um workflow e querem que o mesmo processo o conduza até um estado terminal. |
| `await worker.stop()` | `None` | Encerramento cooperativo. Para novos polls e drena tarefas em andamento até `shutdown_timeout`. |

`run()` valida a compatibilidade do servidor antes de fazer polling. O worker
exige que `control_plane.version`, `control_plane.request_contract`,
`worker_protocol.version` e `auth_composition_contract` publicados correspondam
às versões de contrato suportadas pelo SDK. Manifesto ausente ou incompatível
lança `RuntimeError` no registro, para que supervisores falhem rapidamente em
vez de executar um worker incapaz de concluir tarefas com segurança.

`run_until()` usa o mesmo caminho de registro e despacho de `run()`, mas faz
poll sequencialmente e retorna o `WorkflowExecution` final do workflow
nomeado. Lança `TimeoutError` se o workflow ainda não for terminal após o timeout.

Durante a execução de tarefas:

- tipos desconhecidos de workflow ou atividade são reportados ao servidor como
  falhas de tarefa, não ocultados em logs locais
- `NonRetryableError` marca falhas de atividade como não retentáveis
- `ActivityCancelled` se propaga como resultado de cancelamento
- exceções não tratadas de atividade são reportadas como falhas retentáveis,
  a menos que a política de novas tentativas ou prazo do servidor determine o contrário
- exceções de handlers de consulta são reportadas como `QueryFailed`

### Interceptadores de worker {#worker-interceptors}

Passe `interceptors=[...]` quando a execução precisar de tracing, métricas,
logs de auditoria ou verificações locais de política em torno das tarefas.
Interceptadores executam na ordem fornecida; o primeiro é o wrapper externo
e deve chamar `next` para continuar a cadeia.

```python
from durable_workflow import (
    ActivityInterceptorContext,
    PassthroughWorkerInterceptor,
)

class AuditInterceptor(PassthroughWorkerInterceptor):
    async def execute_activity(self, context: ActivityInterceptorContext, next):
        print("activity started", context.activity_type, context.worker_id)
        return await next(context)

worker = Worker(
    client,
    task_queue="orders",
    workflows=[OrderWorkflow],
    activities=[charge_card],
    interceptors=[AuditInterceptor()],
)
```

| Hook | Campos de contexto | Retorno de `next` |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | comandos de workflow ou `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | resultado decodificado da atividade |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | string do resultado codificado da consulta |

Use `PassthroughWorkerInterceptor` como classe base se precisar de um único
hook. Implemente `WorkerInterceptor` diretamente quando quiser que os
verificadores de tipo exijam todos os hooks.

## Logging {#logging}

O SDK usa o módulo padrão `logging` do Python com nomes estruturados de logger:

| Nome do logger | O que registra |
|-------------|--------------|
| `durable_workflow.worker` | Registro de workers, polls de tarefas, conclusão de tarefas, erros |
| `durable_workflow.workflow.replay` | Eventos de replay de workflow (silencioso durante replay) |

### Configurar logging {#configuring-logging}

Defina o nível de logging no ponto de entrada da aplicação:

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### Níveis de log {#log-levels}

- **INFO**: registro de workers, início/conclusão de tarefas, conclusão de workflow
- **DEBUG**: payloads detalhados de tarefas (truncados), ciclos de poll
- **WARNING**: erros retentáveis (chamadas de API com falha, tipos de workflow desconhecidos)
- **ERROR**: falhas não retentáveis, falhas de replay

### Logging ciente de replay {#replay-aware-logging}

Dentro de workflows, use `ctx.logger` para logging ciente de replay:

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

Instruções de log ficam **silenciosas durante o replay** para evitar excesso
de logs duplicados quando workflows se recuperam ou continuam a execução.

### Logging estruturado {#structured-logging}

Para logs estruturados em JSON, configure o logger raiz da aplicação com um formatador JSON:

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        })

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger("durable_workflow").addHandler(handler)
logging.getLogger("durable_workflow").setLevel(logging.INFO)
```

## Métricas {#metrics}

`Client(metrics=...)` e `Worker(metrics=...)` aceitam qualquer registrador com dois métodos:

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

O registrador padrão não faz nada, portanto a coleta não exige configuração.
Use `InMemoryMetrics` para testes ou loops personalizados de exportação:

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

Para Prometheus, instale o extra opcional e passe `PrometheusMetrics`:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

O SDK registra:

| Métrica | Tipo | Tags |
|--------|------|------|
| `durable_workflow_client_requests` | Contador | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | Histograma | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | Contador | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | Histograma | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | Contador | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | Histograma | `task_kind`, `task_queue`, `outcome` |

## Agendamentos {#schedules-1}

Crie e gerencie workflows agendados pelo cliente:

```python
from durable_workflow import ScheduleSpec, ScheduleAction

# Create a schedule
handle = await client.create_schedule(
    schedule_id="hourly-report",
    spec=ScheduleSpec(cron_expressions=["0 * * * *"]),
    action=ScheduleAction(
        workflow_type="generate-report",
        task_queue="default",
        input=[{"format": "pdf"}],
    ),
    overlap_policy="skip",
    jitter_seconds=30,
)

# List all schedules
schedule_list = await client.list_schedules()

# Describe a schedule
desc = await handle.describe()
print(f"Next fire: {desc.next_fire_at}")
print(f"Total fires: {desc.fires_count}")

# Pause and resume
await handle.pause(note="maintenance window")
await handle.resume(note="maintenance complete")

# Trigger immediately
result = await handle.trigger()

# Backfill missed runs
backfill = await handle.backfill(
    start_time="2024-01-01T00:00:00Z",
    end_time="2024-01-02T00:00:00Z",
)

# Update the schedule
await handle.update(
    spec=ScheduleSpec(cron_expressions=["*/30 * * * *"]),
    note="Changed to every 30 minutes",
)

# Read the audit history stream (paused/resumed/triggered/updated events)
page = await handle.history(limit=100)
for event in page.events:
    print(event.sequence, event.event_type, event.recorded_at)
while page.has_more and page.next_cursor is not None:
    page = await handle.history(limit=100, after_sequence=page.next_cursor)
    for event in page.events:
        print(event.sequence, event.event_type, event.recorded_at)

# Or iterate every event without managing cursors
async for event in handle.iter_history():
    print(event.sequence, event.event_type)

# Delete the schedule (history survives the delete for audit)
await handle.delete()
```

## Cliente síncrono {#synchronous-client}

Para scripts, notebooks e contextos não assíncronos, use o wrapper síncrono:

<!-- docs-example id="python.sync-client" -->
```python
import uuid

from durable_workflow.sync import Client as SyncClient

client = SyncClient("http://localhost:8080", token="secret")
workflow_id = f"sync-greeting-{uuid.uuid4().hex}"

handle = client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id=workflow_id,
    input=["world"],
)

execution = client.describe_workflow(workflow_id)
print(execution.status)
```

O cliente síncrono espelha a API assíncrona, mas envolve cada chamada com `asyncio.run`.

## Tratamento de erros {#error-handling}

O SDK mapeia códigos de erro do servidor para exceções Python tipadas:

| Exceção | Quando |
|-----------|------|
| `WorkflowNotFound` | O ID de workflow não existe |
| `WorkflowAlreadyStarted` | ID de workflow duplicado com política conflitante |
| `WorkflowFailed` | A execução do workflow falhou |
| `WorkflowCancelled` | O workflow foi cancelado (herda de `BaseException`, não de `Exception`) |
| `WorkflowTerminated` | O workflow foi terminado |
| `ActivityCancelled` | A atividade foi cancelada durante a execução (herda de `BaseException`, não de `Exception`) |
| `ChildWorkflowFailed` | Um workflow filho falhou |
| `QueryFailed` | O handler de consulta retornou um erro |
| `UpdateRejected` | A atualização foi rejeitada pelo workflow |
| `ScheduleNotFound` | O ID de agendamento não existe |
| `ScheduleAlreadyExists` | ID de agendamento duplicado |
| `NamespaceNotFound` | O namespace não existe |
| `InvalidArgument` | Parâmetros de requisição inválidos |
| `Unauthorized` | Falha na autenticação |
| `ServerError` | O servidor retornou um erro inesperado |

<!-- docs-example id="python.duplicate-start-recovery" -->
```python
from durable_workflow import WorkflowNotFound, WorkflowAlreadyStarted

try:
    handle = await client.start_workflow(
        workflow_type="greeter",
        task_queue="default",
        workflow_id="existing-id",
        input=["world"],
    )
except WorkflowAlreadyStarted:
    handle = client.get_workflow_handle("existing-id")
except WorkflowNotFound:
    print("Workflow type not registered on any worker")
```

### Cancelamento intencionalmente não é capturado por `except Exception` {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` e `ActivityCancelled` herdam de `BaseException`, não de
`Exception`. Um bloco genérico `except Exception:` no corpo de uma atividade,
ou em código aguardando `client.get_result()`, **não** as captura. Isso é
deliberado: cancelamento é um resultado do plano de controle, e engoli-lo
silenciosamente em uma captura geral permitiria a uma atividade informar
sucesso depois de o workflow pedir que parasse.

Se uma atividade precisar de limpeza local ao ser cancelada, capture a classe
pelo nome e lance novamente. Isso não retoma o workflow fechado para compensação:

```python
from durable_workflow import ActivityCancelled, activity

@activity.defn(name="long_task")
async def long_task(items: list) -> dict:
    ctx = activity.context()
    try:
        for i, item in enumerate(items):
            await process(item)
            await ctx.heartbeat({"progress": i + 1})
        return {"done": True}
    except ActivityCancelled:
        await cleanup_partial_state()
        raise
```

Isso segue o precedente da biblioteca padrão com `asyncio.CancelledError` e `KeyboardInterrupt`.

## Testes {#testing}

Autores devem poder testar código de workflow sem servidor ou worker em
execução. O módulo `durable_workflow.testing` fornece duas entradas:

- `WorkflowEnvironment` conduz um workflow até a conclusão em um único processo
  Python com mocks de atividades registrados pelo usuário.
- `replay_history` e `replay_history_file` reproduzem um histórico de produção
  capturado com o código atual e lançam erro em qualquer não determinismo.

Ambas reutilizam o mesmo mecanismo `durable_workflow.workflow.replay` usado
pelo worker em runtime, de modo que um workflow aprovado no ambiente de testes
se comporta da mesma forma em um worker real.

### WorkflowEnvironment {#workflowenvironment}

`WorkflowEnvironment` despacha comandos produzidos por yield para mocks
registrados e dispara automaticamente temporizadores, efeitos colaterais e
upserts de atributos de busca. Testes não precisam de relógio real, Redis ou servidor.

```python
from durable_workflow import workflow
from durable_workflow.testing import WorkflowEnvironment

@workflow.defn(name="greeter")
class Greeter:
    def run(self, ctx, name: str):
        greeting = yield ctx.schedule_activity("greet", [name])
        return greeting


def test_greeter_returns_activity_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("greet", "hello, world")

    result = env.execute_workflow(Greeter, "world")

    assert result == "hello, world"
```

| Método | Finalidade |
| --- | --- |
| `register_activity_result(name, result)` | Retorna `result` em toda chamada à atividade `name`. Use quando os argumentos não importam ao teste. |
| `register_activity(name, fn)` | Chama `fn(*arguments)` em cada invocação agendada de `name`. Use quando o mock deve variar por argumentos ou capturar invocações. |
| `register_child_workflow_result(workflow_type, result)` | Retorna `result` quando o workflow inicia um filho do tipo `workflow_type`. |
| `signal(name, args=None, run=None)` | Enfileira um sinal para entrega antes da próxima iteração de replay. Injeta um evento `SignalReceived` e o despacha ao handler `@workflow.signal`. Passe `run=N` para selecionar o elo `N` de uma cadeia de continuar como novo. |
| `register_workflow(workflow_cls)` | Permite resolver outra classe de workflow por nome. Necessário quando uma cadeia chama `continue_as_new(workflow_type=...)` com tipo diferente do inicial. |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | Conduz o workflow ao estado terminal e retorna seu resultado. Segue elos `continue_as_new` até a execução final e retorna seu resultado. Lança `WorkflowFailed` se o workflow termina no estado de falha. |
| `runs` / `run_count` | Após `execute_workflow`, expõem um `WorkflowRunRecord` por elo da cadeia (entrada, tipo de workflow, eventos de histórico e comando terminal) para validar toda a cadeia. |

O ambiente falha explicitamente em fixtures ausentes:

- agendar uma atividade sem mock registrado lança `KeyError`
- iniciar um workflow filho sem mock registrado lança `KeyError`
- um workflow que não chega a um estado terminal no limite de iterações
  (padrão `1000`) lança `RuntimeError`

Passe `iteration_limit=...` a `WorkflowEnvironment(...)` para ajustar o teto
de workflows que legitimamente iteram mais que o padrão.

#### Mocks de atividade com callable {#callable-activity-mocks}

Use `register_activity` quando o mock precisar responder com base nos argumentos
ou registrar chamadas:

```python
def test_callable_mock_captures_arguments() -> None:
    captured: list[str] = []

    def record_greet(name: str) -> str:
        captured.append(name)
        return f"greeted:{name}"

    env = WorkflowEnvironment()
    env.register_activity("greet", record_greet)

    assert env.execute_workflow(Greeter, "alice") == "greeted:alice"
    assert captured == ["alice"]
```

#### Sinais {#signals}

Sinais enfileirados com `env.signal(...)` são drenados antes da próxima
iteração de replay. O payload é envolvido no mesmo envelope `{codec, blob}`
visto pelo worker em runtime e despachado ao handler `@workflow.signal` registrado:

```python
@workflow.defn(name="approval")
class Approval:
    def __init__(self) -> None:
        self.approved_by: str | None = None

    @workflow.signal("approve")
    def on_approve(self, by: str) -> None:
        self.approved_by = by

    def run(self, ctx):
        yield ctx.schedule_activity("wait", [])
        return {"approved_by": self.approved_by}


def test_signal_is_delivered_before_run_returns() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("wait", None)
    env.signal("approve", ["alice"])

    result = env.execute_workflow(Approval)

    assert result == {"approved_by": "alice"}
```

#### Temporizadores, efeitos colaterais e atributos de busca {#timers-side-effects-and-search-attributes}

O ambiente dispara automaticamente o evento correspondente de histórico para
cada um destes comandos, para que workflows não bloqueiem no relógio real nos testes:

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- marcadores `workflow.version(...)` → `VersionMarkerRecorded`

#### Cadeias de continuar como novo {#continue-as-new-chains}

Quando um workflow retorna `ctx.continue_as_new(...)`, o ambiente acrescenta
um evento `WorkflowContinuedAsNew` à execução que termina, reinicia o histórico
e inicia uma nova execução com os argumentos do comando. O retorno de
`execute_workflow` é o resultado terminal do último elo.

```python
@workflow.defn(name="countdown")
class Countdown:
    def run(self, ctx, counter: int):
        yield ctx.schedule_activity("emit", [counter])
        if counter > 0:
            return ctx.continue_as_new(counter - 1)
        return {"final_counter": counter}


def test_chain_returns_final_run_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("emit", None)

    result = env.execute_workflow(Countdown, 3)

    assert result == {"final_counter": 0}
    assert env.run_count == 4
    assert [r.input for r in env.runs] == [[3], [2], [1], [0]]
```

Quando a cadeia troca tipos de workflow, registre primeiro a classe seguinte:

```python
@workflow.defn(name="stage-one")
class StageOne:
    def run(self, ctx):
        yield ctx.schedule_activity("stage_one", [])
        return ctx.continue_as_new(workflow_type="stage-two")


@workflow.defn(name="stage-two")
class StageTwo:
    def run(self, ctx):
        return (yield ctx.schedule_activity("stage_two", []))


def test_chain_can_switch_workflow_type() -> None:
    env = WorkflowEnvironment()
    env.register_workflow(StageTwo)
    env.register_activity_result("stage_one", None)
    env.register_activity_result("stage_two", "done")

    assert env.execute_workflow(StageOne) == "done"
    assert [r.workflow_type for r in env.runs] == ["stage-one", "stage-two"]
```

Direcione um sinal a um elo específico com `run=N`:

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

O comprimento da cadeia é limitado por `continue_as_new_limit` (padrão `50`).
Excedê-lo lança `RuntimeError`, para que testes detectem continuações fora de
controle em vez de executar indefinidamente; ajuste com
`WorkflowEnvironment(continue_as_new_limit=...)` quando uma cadeia for
legitimamente maior.

#### Asserções de falha {#failure-assertions}

Workflows que lançam uma exceção Python aparecem como `WorkflowFailed`:

```python
import pytest
from durable_workflow.errors import WorkflowFailed

@workflow.defn(name="failing")
class Failing:
    def run(self, ctx):
        yield ctx.schedule_activity("step", [])
        raise RuntimeError("boom")


def test_workflow_failure_surfaces_as_workflow_failed() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("step", None)

    with pytest.raises(WorkflowFailed) as exc_info:
        env.execute_workflow(Failing)

    assert "boom" in str(exc_info.value)
```

### Testes de replay com histórico de produção {#replay-testing-against-production-history}

Use `replay_history` para testar regressões de uma mudança com histórico real
capturado do servidor. O replayer executa o código atual contra a sequência
registrada e lança erro se produzir comando diferente do registrado, a
definição de um bug de não determinismo.

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

Um workflow que concluiu antes deve continuar concluindo com o mesmo histórico.
Se o código divergir da sequência registrada (chamadas reordenadas de
atividades, ramos removidos ou tipos alterados), `replay_history` lança erro
para detectar a regressão na CI em vez de produção.

`replay_history_file` é um wrapper que lê um arquivo JSON em dois formatos:
lista de eventos no topo ou dict com chave `events` correspondente à resposta
de `get_history`:

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

Ambas as funções aceitam uma indicação opcional de validação `payload_codec`.
Deixe-a sem valor para usar a tag registrada no histórico. Uma tag explícita
ou registrada deve ser `avro`; payloads duráveis `json`, desconhecidos ou sem
tag falham antes de decodificar.

#### Replayer baseado em classe {#class-based-replayer}

Quando uma passagem de teste reproduzir históricos de vários tipos ou quando
o evento capturado `WorkflowStarted` deva decidir qual workflow reproduzir,
use a classe `Replayer`. Registre previamente todas as classes e chame
`replay(...)` uma vez por histórico capturado:

```python
from durable_workflow import Replayer, ReplayOutcome

replayer = Replayer(workflows=[OrderWorkflow, RefundWorkflow])

# Explicit type and input — equivalent to replay_history(OrderWorkflow, ...).
outcome: ReplayOutcome = replayer.replay(
    history["events"],
    start_input=["order-42"],
    workflow_type="order",
)

# Type and start input inferred from a WorkflowStarted event in the history.
outcome = replayer.replay(history)  # history may be an events list or a
                                    # dict with an "events" key

for command in outcome.commands:
    # Inspect commands the replayed workflow would have emitted next.
    ...
```

`Replayer(workflows=[...])` rejeita conjunto vazio ou registro duplicado com
`ValueError`. `replay(...)` lança `ValueError` quando o histórico pede tipo
não registrado ou quando há vários workflows registrados, o chamador não
fornece `workflow_type` e o histórico não contém `WorkflowStarted`.

`ReplayOutcome.commands` é a mesma lista retornada pelos auxiliares funcionais
`replay_history`; a entrada baseada em classe existe para uma suíte compartilhar
um registro entre muitos históricos.

### Referência do ambiente de testes {#test-harness-reference}

| Símbolo | Finalidade |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | Ambiente de testes no processo. Conduz um workflow à conclusão com mocks registrados de atividades e workflows filhos. |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | Reproduz uma sequência de histórico com o código atual. Lança erro em não determinismo. |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | Carrega histórico JSON do disco e o reproduz. Aceita lista no topo ou dict com chave `events`. |
| `durable_workflow.Replayer(*, workflows=[...])` | Replayer baseado em classe. Registre classes e chame `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` por histórico. Infere `workflow_type` e `start_input` de `WorkflowStarted` quando presente. |
| `durable_workflow.ReplayOutcome` | Dataclass retornada por `Replayer.replay`. Contém `commands: list[Command]`, os comandos que o workflow reproduzido emitiria em seguida. |
| `durable_workflow.errors.WorkflowFailed` | Lançada por `execute_workflow` quando o workflow termina em falha. |
| `durable_workflow.errors.WorkflowCancelled` | Estado terminal quando o workflow foi cancelado. Herda de `BaseException`. |
| `durable_workflow.errors.WorkflowTerminated` | Estado terminal quando o workflow foi terminado pelo servidor. Herda de `BaseException`. |

## Codec de payload {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Todo payload que cruza o limite do protocolo de workers tem uma tag de codec.
  O Durable Workflow 2.0 tem um único codec público de payload: <code data-payload-codec-field="codec">avro</code>.
  O SDK Python rejeita payloads duráveis com tag JSON, desconhecidos e sem tag
  em vez de selecionar outro decodificador. Veja o <a href="/docs/polyglot/avro-value-protocol/">protocolo Avro Value</a>.
</div>

### O suporte a Avro é integrado {#avro-support-is-built-in}

O artefato fixado do SDK 2.0 inclui `fastavro` como dependência de runtime,
portanto toda interface de saída (`start_workflow`, `signal_workflow`,
`query_workflow`, `update_workflow`, codificação de resultado de atividade,
ações de agendamento) emite payloads com tag Avro pelo caminho otimizado de
produção. Não há extra opcional de codec a instalar.

### Valores tipados fixos {#fixed-typed-values}

O SDK seleciona explicitamente variantes nomeadas no schema compartilhado
`durable_workflow.protocol.Value`. Não codifica o valor em JSON dentro de
Avro. Assim, inteiros e doubles, strings e bytes, booleanos e inteiros e
listas e mapas permanecem distintos entre SDKs. A transmissão usa frames de
objeto único Avro e o fingerprint do schema; fingerprints desconhecidos
falham com `unsupported_payload_schema`.

Toda interface de cliente e worker funciona de ponta a ponta com o padrão Avro:

- **Inícios, sinais, consultas e atualizações do cliente**: `start_workflow`,
  `signal_workflow`, `query_workflow` e `update_workflow` emitem payloads
  `payload_codec = "avro"` pelo schema Value fixo. Um cliente Python pode
  conduzir workflows que PHP e outros SDKs poliglotas reproduzirão e vice-versa.
- **Worker de atividade**: argumentos com tag Avro decodificam transparentemente.
  O worker codifica resultados em Avro para que PHP, Python e futuros SDKs
  compartilhem um limite de payload.
- **Falhas de atividade**: `fail_activity_task(..., details=...)` envia
  `failure.details` como envelope `{codec, blob}`. O servidor registra o blob
  e `details_payload_codec`, mantendo dados de diagnóstico Python independentes
  de linguagem em exportações e visualizações de observabilidade.
- **Replay de histórico do worker de workflow**: entradas iniciais e eventos
  de resultado de atividade com tag Avro são decodificados no replay,
  permitindo que um workflow Python participe de uma execução codificada em Avro.
- **Tarefas de consulta de workflow**: consultas roteadas pelo servidor contêm
  argumentos de workflow, argumentos de consulta e histórico de replay com tag
  Avro. O worker retorna o resultado da consulta como envelope Avro.

### Executar um worker de atividade Python em uma execução v2 {#running-a-python-activity-worker-against-a-v2-run}

Nenhuma configuração de codec é necessária. O SDK valida `payload_codec` antes
de decodificar cada reserva, aceita somente `avro`, executa a atividade e
retorna um resultado com tag Avro. Qualquer outra tag é rejeitada com
`unsupported_payload_codec`; o worker nunca inspeciona o conteúdo para adivinhar o formato.

### Tipos preservados na ida e volta entre Python e PHP {#types-that-round-trip-cleanly-across-python-and-php}

| Tipo Python | Variante Avro Value | Tipo PHP |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array` (lista) |
| `dict[str, ...]` | `MapValue` | `array` (mapa com chaves string) |

Adapte tipos específicos do Python, como dataclasses, conjuntos, tuplas e
objetos datetime, a strings, inteiros, mapas ou listas canônicos antes de
usá-los como valores de workflow ou atividade.

## Executar em um servidor compartilhado {#running-against-a-shared-server}

O [Início rápido](#quickstart) acima mostra como iniciar um servidor local com
a imagem Docker publicada. Em equipe, normalmente você aponta o worker Python
para um servidor existente (staging, produção ou desenvolvimento compartilhado):

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Defina `namespace` para o namespace de tenant provisionado para sua equipe no
servidor compartilhado e use as credenciais emitidas para ele. O operador do
Server gerencia a criação de namespaces; veja o
[guia do Server](/docs/polyglot/server) para detalhes.

O mesmo construtor suporta um runtime gerenciado do Cloud. Use a URL de
runtime e o valor de namespace fornecidos pelo Cloud, defina `control_token`
para a credencial de runtime de cliente e `worker_token` para a de worker.
O Cloud provisiona o namespace; não substitua por um endereço de Server sob
sua administração. Veja [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane).
