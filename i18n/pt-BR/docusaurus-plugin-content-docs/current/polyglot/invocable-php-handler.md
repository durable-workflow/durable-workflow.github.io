---
sidebar_position: 5
title: Handler PHP de atividade invocável
description: Use o auxiliar PHP InvocableActivityHandler para hospedar handlers de atividade em um endpoint HTTPS que recebe envelopes de entrada de tarefas externas e retorna envelopes de resultado.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - handler de atividade invocável
  - InvocableActivityHandler
  - entrada de tarefa externa
  - resultado de tarefa externa
  - adaptador de atividade PHP
  - handler de atividade Lambda
---

# Handler PHP de atividade invocável {#php-invocable-activity-handler}

O [transportador HTTP invocável](./invocable-carrier.md) permite que o servidor
envie por POST uma tarefa de atividade sob lease a um endpoint HTTPS em vez de
aguardar um worker de long poll. O auxiliar PHP
`Workflow\V2\Support\InvocableActivityHandler` é a implementação de referência
usada por um processo PHP externo para transformar essa requisição em um
envelope de resultado que o servidor possa reconciliar.

Use-o para conectar um handler de atividade a:

- uma AWS Lambda ou Google Cloud Function invocada por HTTPS
- um controller Laravel por trás de um serviço HTTP simples
- um container expondo um endpoint POST por fila de atividades

O auxiliar interpreta o envelope de entrada de tarefa externa independente de
transportador, localiza o callable registrado, aplica o prazo do lease e emite
o envelope de resultado de tarefa externa independente de transportador,
incluindo os formatos de falha esperados pelo servidor.

## Início rápido {#quick-start}

Instale o pacote Durable Workflow no processo externo, registre um callable
por nome de handler de atividade e passe o corpo da requisição a `handle()`:

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

O handler recebe o envelope de entrada e retorna o envelope de resultado. O
contrato do transportador (HTTPS, POST, autenticação, timeouts e orçamento de
novas tentativas) pertence ao transportador HTTP invocável. O auxiliar PHP
cuida da decodificação de argumentos, despacho do handler, aplicação de prazos,
codificação do resultado e taxonomia de falhas.

## Registrar handlers {#registering-handlers}

O primeiro argumento do construtor é um mapa indexado pelo valor `task.handler`
que o servidor envia no envelope de entrada. Esse valor é o campo `handler`
na entrada correspondente da configuração do executor externo:

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

Uma entrada com `task.handler` não registrado produz um resultado `failed`
com `failure.kind = application`, `classification = application_error` e
`type = UnknownActivityHandler`. A política configurada de novas tentativas
da atividade continua se aplicando no servidor.

O nome opcional `carrier` é repetido em `metadata.carrier` em cada envelope de
resultado para que operadores saibam qual runtime externo produziu a resposta.
Use um identificador estável e seguro para exibição (`billing-lambda`,
`ops-cloud-run`, `laravel-admin-api`).

O `resultCodec` opcional controla como o auxiliar serializa o valor de retorno
em `result.payload.blob`. O padrão é `avro`, o mesmo codec que workers PHP já
usam para payloads duráveis. O codec de resultado deve ser conhecido pelo
`CodecRegistry` do servidor; `protobuf` não é aceito e falha rapidamente no construtor.

## Envelope de resultado {#result-envelope}

Em caso de sucesso, `handle()` retorna o envelope de sucesso independente de transportador:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

Os campos `task.id`, `task.attempt` e `task.idempotency_key` são copiados da
entrada para que o servidor possa reconciliar o resultado com o lease original.

Em caso de falha, `handle()` retorna o envelope de falha. O bloco `failure`
contém tipo, classificação, mensagem, tipo PHP de origem, stack trace e se a
falha permite nova tentativa. Uma falha de prazo também inclui o nome
`deadline` e o valor `expires_at`:

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## Taxonomia de falhas {#failure-taxonomy}

| `failure.kind` | `classification` | Permite nova tentativa | Quando ocorre |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | sim | O lease ou prazo de entrada já expirou quando o envelope chegou, ou o handler retornou após um deles expirar durante a execução. |
| `decode_failure` | `decode_failure` | não | Os argumentos não puderam ser decodificados com o codec declarado, uma string de prazo não pôde ser interpretada, o handler lançou `TypeError` / `ValueError` em seus parâmetros ou o payload de sucesso não pôde ser recodificado com o codec de resultado configurado. |
| `application` | `application_error` | depende da exceção lançada | O handler lançou uma exceção. `retryable` é `false` quando ela implementa `Workflow\Exceptions\NonRetryableExceptionContract`; caso contrário, `true`. A mensagem é a da exceção e `type` é sua classe. |
| `application` | `application_error` | não | `task.kind` não é `activity_task` ou `task.handler` não está registrado no mapa. |

O auxiliar nunca retorna uma exceção isolada. Todos os caminhos de código
produzem um envelope de resultado estruturado para que o transportador
invocável possa reconciliar a resposta deterministicamente.

## Prazos e idempotência {#deadlines-and-idempotency}

O envelope de entrada contém o `lease.expires_at` ativo e os prazos declarados
da atividade (`schedule_to_start`, `start_to_close`, `schedule_to_close`,
`heartbeat`). O auxiliar verifica todos eles:

- Antes de despachar o handler, qualquer prazo expirado causa retorno imediato
  de uma falha `timeout`, com `details.deadline` nomeando o campo expirado. O
  callable registrado não é invocado.
- Depois que o handler retorna, o auxiliar verifica os prazos novamente. Um
  handler que executou por mais tempo que seu lease produz a mesma falha
  `timeout`, e o valor de retorno é descartado do envelope.

Como o transportador repete a entrega e o runtime reentrega leases não
reportados, o mesmo `task.id` e `task.idempotency_key` podem chegar mais de uma
vez. O código do handler deve ser idempotente. A chave de idempotência em cada
envelope é estável entre novas tentativas de transporte da mesma tentativa de tarefa.

## Codecs de payload e armazenamento externo {#payload-codecs-and-external-storage}

Payloads de argumentos chegam em `payloads.arguments` com um campo `codec`.
O auxiliar usa o `CodecRegistry` do servidor para decodificá-los. O único
codec público v2 é `avro`; `json`, codecs desconhecidos e blobs malformados ou
sem tag são rejeitados. JSON continua sendo o documento do transportador HTTP,
não um codec de payload durável.

Quando as entradas do workflow excedem o limite configurado de
[armazenamento externo de payloads](../features/external-payload-storage.md),
o servidor guarda os bytes no driver configurado e envia um envelope de
referência em vez de um blob inline. Passe um `ExternalPayloadStorageDriver`
ao construtor para que o auxiliar resolva referências antes de chamar o handler:

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

O driver deve cumprir o mesmo contrato que o servidor usa para gravar o payload
para que referência, hash e codec correspondam. Uma referência que o processo
externo não consegue resolver produz `decode_failure` em vez de um payload vazio silencioso.

## Conexão em produção {#production-wiring}

Um controller Laravel que hospeda o handler em uma única rota POST tem esta forma:

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

Aponte a configuração do executor externo para a URL HTTPS diante desse
controller e declare um `auth_ref` para autenticar a rota. A isenção de HTTP
em loopback se aplica somente à iteração de desenvolvimento.

## Interfaces relacionadas {#related-surfaces}

- [Transportador HTTP invocável](./invocable-carrier.md): contrato do
  transportador no servidor que entrega envelopes de entrada e reconcilia resultados.
- [Interface de execução externa](./external-execution.md): limite de produto
  independente de transportador, incluindo os schemas de entrada e resultado
  implementados pelo auxiliar.
- [Armazenamento externo de payloads](../features/external-payload-storage.md):
  como argumentos ou resultados grandes são transferidos a um driver
  configurado e representados por um envelope de referência verificável.
- [Protocolo de workers](./worker-protocol.md): contrato mais amplo do plano
  de workers que publica o contrato do transportador invocável junto aos
  formatos de handlers baseados em poll.
