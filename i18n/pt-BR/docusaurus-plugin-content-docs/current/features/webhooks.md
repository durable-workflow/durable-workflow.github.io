---
sidebar_position: 13
---

# Webhooks {#webhooks}

O framework oferece webhooks que permitem a sistemas externos iniciar workflows e enviar sinais dinamicamente. Esse recurso permite integrar serviços externos, APIs e ferramentas de automação.

## Habilitação de webhooks {#enabling-webhooks}
Para habilitar webhooks, registre as rotas de webhook no arquivo de rotas da aplicação (`routes/web.php` ou `routes/api.php`):

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Passe o mapa explícito das classes de workflow que deseja expor. Cada alias se torna o segmento público da rota, e cada classe deve ter uma chave de tipo durável estável por `#[Type(...)]` ou uma entrada registrada em `workflows.v2.types.workflows`. Consulte a matriz completa de rotas na seção [Webhooks explícitos de comandos e consultas](#explicit-command-and-query-webhooks).

## Metadados de visibilidade {#visibility-metadata}
Ao registrar rotas por `Workflow\V2\Webhooks::routes(...)`, a rota de início também aceita um objeto reservado `visibility`. Esses campos são armazenados como metadados de visibilidade do workflow e não são passados ao método `handle()`.

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` e `visibility.labels` são copiados para a instância, execução, resumo da execução, histórico tipado de início, detalhes da execução selecionada e exportação de histórico. O Waterline pode filtrar telas de lista por esses campos com parâmetros de consulta de correspondência exata.

`visibility.memo` é copiado para a instância, execução, histórico tipado de início, detalhes da execução selecionada e exportação de histórico, e execuções posteriores de `continueAsNew()` herdam o mesmo memo por padrão. Ele deve ser um objeto JSON no nível superior, com escalares, `null`, arrays ou objetos aninhados. `memo` é um metadado apenas de retorno, sem servir como campo de filtro de lista ou de busca no resumo da execução.

## Autenticação de webhooks {#webhook-authentication}
Por padrão, webhooks não exigem autenticação, mas você pode configurar uma das estratégias em `config/workflows.php`.

**Importante:** Se URLs de webhook forem compartilhadas com terceiros ou expostas publicamente, habilite autenticação por token ou assinatura HMAC para impedir acesso não autorizado.

### Métodos de autenticação {#authentication-methods}
Há suporte a:
1. Sem autenticação (none)
2. Autenticação por token (token)
3. Verificação de assinatura HMAC (signature)
4. Autenticação personalizada (custom)

### Autenticação por token {#token-authentication}
Na autenticação por token, webhooks exigem um token de API válido nos cabeçalhos da requisição. O cabeçalho padrão é `Authorization`, mas você pode alterá-lo na configuração.

#### Exemplo de requisição {#example-request}
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### Autenticação por assinatura HMAC {#hmac-signature-authentication}
A autenticação HMAC verifica requisições usando uma chave secreta. O cabeçalho padrão é `X-Signature`, mas também pode ser alterado.

#### Exemplo de requisição {#example-request-1}
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Autenticação personalizada {#custom-authentication}
Para usar um autenticador personalizado, crie uma classe que implemente a interface `WebhookAuthenticator`:

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Depois, configure-a em `config/workflows.php`:

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

O método `validate()` deve retornar a `Request` se for válida ou chamar `abort(401)` se não for autorizada.

## Configuração de rotas de webhook {#configuring-webhook-routes}
Por padrão, webhooks ficam acessíveis em `/webhooks`. Você pode personalizar o caminho da rota em `config/workflows.php`:

```php
'webhooks_route' => 'workflows',
```

Após essa mudança, os webhooks ficam acessíveis em:
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## Webhooks explícitos de comandos e consultas {#explicit-command-and-query-webhooks}

Comandos duráveis de início, sinal, atualização, reparo, cancelamento e término são expostos por HTTP, junto com rotas de consulta seguras para replay para leituras da execução atual e da selecionada.

Você registra um mapa explícito de aliases e roteia apenas os workflows que deseja expor.

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Ao registrar uma classe de workflow diretamente, ela deve definir uma chave de tipo estável com `#[Type(...)]` ou estar registrada em `workflows.v2.types.workflows`:

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

Registro equivalente na configuração:

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

A rota de início resultante é:

```
POST /webhooks/start/order-workflow
```

Exemplo de requisição:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

`workflow_id` é o ID público opaco da instância de workflow. Não é um ID de execução e deve ser tratado como uma string opaca.

Valores de `workflow_id` fornecidos pelo chamador devem ser strings não vazias seguras para URLs, de até 191 caracteres, usando apenas letras, números, `.`, `_`, `-` e `:`. IDs em branco, longos demais ou com caracteres não suportados são rejeitados na validação do webhook com HTTP `422`.

O mesmo mapa durável de tipos também é a alternativa atual do worker quando o nome armazenado da classe de workflow muda após uma refatoração. Se você mantiver `order-workflow` estável e redirecionar o registro de configuração para a nova classe, o trabalho v2 em fila ainda poderá resolver a chave de tipo durável, mesmo quando o nome original armazenado da classe PHP não puder mais ser carregado.

Você também pode solicitar um comportamento explícito para inícios duplicados:

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

Os valores suportados de `on_duplicate` são:

- `reject_duplicate`
- `return_existing_active`

Todos os webhooks de comando retornam o mesmo envelope JSON:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Resposta de aceitação quando uma nova execução é criada:

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Resposta de aceitação quando o chamador solicitou reutilizar a execução ativa existente:

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Resposta de rejeição de início duplicado:

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

Campos da resposta:

- `workflow_id` é o ID público da instância de workflow.
- `run_id` é a primeira execução ativa criada pelo comando de início aceito.
- `requested_run_id` só é definido quando o chamador endereça explicitamente uma execução selecionada.
- `resolved_run_id` é a execução que o mecanismo realmente resolveu para este comando. Em inícios direcionados à instância, corresponde a `run_id`.
- `command_id` é o ID durável do comando de início.
- `command_source` é `webhook` para as rotas de webhook.
- rotas de sinal, atualização, reparo, cancelamento e término direcionadas à instância resolvem a execução durável mais recente, em vez de confiar apenas no ponteiro mutável da execução atual. Assim, cadeias continue-as-new continuam endereçáveis pelo mesmo ID público, mesmo se essa coluna divergir.
- rotas de comando direcionadas a uma execução fixam uma execução selecionada sob o mesmo ID público de instância e rejeitam com `target_scope = run`, `outcome = rejected_not_current` e `rejection_reason = selected_run_not_current` se ela não for mais a atual. Nesse caso, `run_id` e `requested_run_id` permanecem na seleção histórica, enquanto `resolved_run_id` aponta para a execução atual que os chamadores devem endereçar em seguida.
- chaves de payload são associadas aos nomes dos parâmetros de `handle()` na ordem da declaração.
- Workflows definem seus argumentos de início em `handle()`.
- Classes de workflow que não declaram `handle()` são rejeitadas com erros de validação HTTP `422` antes da criação de uma execução.
- chaves obrigatórias ausentes no payload são rejeitadas com erros de validação HTTP `422`, em vez de serem descartadas silenciosamente.
- valores de `workflow_id` em branco, longos demais ou inadequados para rotas são rejeitados com erros de validação HTTP `422`, antes do tratamento de início duplicado.
- valores inválidos de `on_duplicate` são rejeitados com erros de validação HTTP `422`.
- `on_duplicate = return_existing_active` retorna HTTP `200` quando a execução ativa atual é reutilizada.
- inícios duplicados sem reutilização retornam HTTP `409` com `outcome = rejected_duplicate`, `command_status = rejected` e `rejection_reason = instance_already_started`.
- a linha durável de `workflow_commands` também armazena o contexto de entrada do webhook separadamente dos argumentos de negócio, incluindo rótulo do chamador, método ou resultado da autenticação, nome da rota da requisição, caminho da requisição e uma impressão digital derivada do payload normalizado e de cabeçalhos selecionados, como `X-Request-Id` e `X-Correlation-Id`

Matriz atual de respostas HTTP do webhook de início:

- `202` com `outcome = started_new` quando uma nova execução é criada
- `200` com `outcome = returned_existing_active` quando a execução ativa existente é reutilizada
- `409` com `outcome = rejected_duplicate` quando o início duplicado é rejeitado
- `401` para falha de autenticação do webhook
- `404` para um alias desconhecido
- `422` para falha de validação do payload


### Webhooks de comandos de sinal {#signal-command-webhooks}

Há comandos de sinal direcionados tanto à instância quanto a uma execução:

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` é o ID público da instância de workflow. A rota direcionada à instância resolve a execução ativa atual no momento da aplicação. A rota direcionada a uma execução também recebe um `runId` selecionado e rejeita se essa execução for histórica. O nome do sinal vem do parâmetro de rota. O corpo da requisição aceita atualmente um campo opcional no nível superior:

```json
{
  "arguments": ["Taylor"]
}
```

O campo `arguments` deve ser um array. Quando omitido, um workflow esperando em `await('signal-name')` retoma com `true`.
A classe de workflow de destino também deve declarar o nome do sinal com `#[Workflow\V2\Attributes\Signal('...')]`. Nomes não declarados são rejeitados de forma durável, sem serem colocados cegamente em buffer.

Exemplo de sinal:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

Resposta de aceitação do sinal:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Comandos de sinal aceitos e rejeitados também recebem uma linha durável própria de ciclo de vida em `workflow_signal_records`, vinculada ao comando de origem. As respostas de comando de sinal continuam retornando o ID do comando como ID de correlação HTTP. Os detalhes da execução selecionada no Waterline e as exportações de histórico expõem a linha de ciclo de vida como `signals[*].id`, junto com nome do sinal, `signal_wait_id`, sequência do comando, sequência do workflow após a aplicação, status, resultado, erros de validação e argumentos armazenados.

Resposta de rejeição quando a instância existe, mas ainda não iniciou uma execução:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Resposta de rejeição quando a execução atual já está encerrada:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Resposta de rejeição quando a rota direciona um nome de sinal não declarado:

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

Resposta de rejeição quando uma rota de sinal direcionada a uma execução endereça uma execução histórica:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Matriz atual de respostas HTTP do webhook de sinal:

- `202` com `outcome = signal_received` quando o comando de sinal é aceito
- `401` para falha de autenticação do webhook
- `404` para um ID de instância de workflow desconhecido
- `404` com `outcome = rejected_unknown_signal` quando o workflow não declara esse nome de sinal. Quando a execução já contém um instantâneo tipado do contrato em `WorkflowStarted`, ou quando um evento `WorkflowStarted` antigo pode ser preenchido na primeira entrada compatível, essa rejeição deixa de depender de refletir primeiro a classe ativa do workflow
- `409` com `outcome = rejected_not_started` quando a instância ainda não tem execução atual
- `409` com `outcome = rejected_not_active` quando a execução atual de destino já está encerrada
- `409` com `outcome = rejected_not_current` quando a rota direcionada a uma execução endereça uma execução histórica selecionada
- `422` quando `arguments` está presente, mas não é um array

### Webhooks de sinal com início {#signal-with-start-webhooks}

Uma rota de entrada vinculada direcionada à instância inicia uma nova execução ou reutiliza a execução ativa atual antes de registrar um sinal:

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` é o alias de webhook do workflow registrado em `Workflow\V2\Webhooks::routes([...])`. `signal` é o nome durável do sinal declarado por `#[Signal(...)]`.

O corpo da requisição combina os campos normais de início com um campo reservado `signal_arguments` para o payload do sinal anexado:

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` deve ser um array. A rota usa `return_existing_active` como padrão de `on_duplicate` e rejeita qualquer outro valor de política de duplicidade nessa rota de entrada vinculada.

Resposta de aceitação quando a rota inicia uma nova execução:

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

Quando a instância de workflow já tem uma execução atual ativa, a mesma rota retorna `start_outcome = returned_existing_active` e mantém o comando de sinal como objeto de resposta `command_*` no nível superior. Os comandos vinculados de início e sinal compartilham `intake_group_id`, metadados da rota e cabeçalhos de correlação da requisição. O runtime registra ambos em uma transação antes que o worker possa executar a primeira etapa do workflow do usuário.

Os detalhes da execução selecionada e a exportação de histórico congelam essa mesma entrada composta em `linked_intakes[*]`. A fonte durável de verdade é o `workflow_commands.context.intake.group_id` compartilhado mais o `mode` registrado em cada linha de comando aceito. No modo `signal_with_start`, a linha agrupada expõe `start_command_*`, o `primary_command_*` que não é de início, `complete`, `missing_expected_command_types` e os instantâneos ordenados e aninhados `commands[*]`.

Se o nome do sinal for desconhecido ou o payload falhar na validação do contrato durável, o runtime rejeita o comando de sinal antes de criar uma nova execução. Nesse caso, a resposta deixa `run_id`, `start_command_id` e `start_outcome` como `null`.

Matriz atual de respostas HTTP do webhook de sinal com início:

- `202` com `outcome = signal_received` e `start_outcome = started_new` quando a requisição cria uma execução e registra o sinal
- `202` com `outcome = signal_received` e `start_outcome = returned_existing_active` quando a requisição reutiliza a execução ativa atual e registra o sinal
- `401` para falha de autenticação do webhook
- `404` para um alias de webhook de workflow desconhecido
- `404` com `outcome = rejected_unknown_signal` quando o workflow não declara esse nome de sinal
- `422` com `outcome = rejected_invalid_arguments` quando `signal_arguments` é um array, mas não atende ao contrato durável do sinal
- `422` quando `signal_arguments` está presente, mas não é um array, ou quando `on_duplicate` tem qualquer valor diferente de `return_existing_active`

### Webhooks de consulta {#query-webhooks}

Há rotas de consulta direcionadas tanto à instância quanto a uma execução:

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` é o ID público da instância de workflow. A rota direcionada à instância resolve a execução durável mais recente após atualizar os dados. A rota direcionada a uma execução fixa um `runId` selecionado, incluindo execuções históricas ou já encerradas, pois consultas são operações de replay somente de leitura.

`query` é o destino público da consulta declarado por `#[QueryMethod]`. Quando a definição do workflow ainda pode ser carregada, a rota também aceita o nome do método PHP subjacente, mas respostas bem-sucedidas normalizam `query_name` para o destino público durável.

O corpo da requisição aceita uma lista posicional `arguments` ou um mapa nomeado `arguments` cujas chaves são os parâmetros declarados da consulta:

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

Diferentemente das rotas de webhook que alteram estado, webhooks de consulta não acrescentam uma linha durável de comando. Eles reproduzem a execução selecionada e retornam imediatamente um resultado serializado.

Exemplo de consulta:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

Resposta de aceitação da consulta:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

Resposta de rejeição quando os argumentos da consulta não correspondem ao contrato declarado:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

Resposta de rejeição quando a definição de workflow da execução selecionada não pode mais passar por replay:

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

Matriz atual de respostas HTTP do webhook de consulta:

- `200` com um `result` serializado quando o replay da consulta tem sucesso
- `401` para falha de autenticação do webhook
- `404` para um ID de instância de workflow ou ID de execução selecionada desconhecido
- `409` quando a instância selecionada ainda não iniciou, quando a consulta solicitada não é declarada nessa execução ou quando o replay está bloqueado por `blocked_reason = workflow_definition_unavailable`
- `422` quando o contrato declarado da consulta rejeita os `arguments` fornecidos

### Webhooks de comandos de atualização {#update-command-webhooks}

Há rotas POST de atualização direcionadas à instância e a uma execução, além de rotas de busca do ciclo de vida durável:

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` é o ID público da instância de workflow. `update` é o nome durável da atualização declarado por `#[UpdateMethod]`. `updateId` é o ID durável do ciclo de vida retornado pelas respostas de atualização. A rota POST direcionada à instância resolve a execução ativa atual no momento da aplicação. A rota POST direcionada a uma execução também recebe um `runId` selecionado e rejeita se essa execução for histórica. A rota GET direcionada à instância lê o ciclo de vida armazenado dessa instância, enquanto a rota GET direcionada a uma execução restringe a busca à execução selecionada.

Se você usar `#[UpdateMethod('mark-approved')]`, o destino público do webhook será `mark-approved`, mesmo que o método PHP subjacente tenha outro nome.

O corpo da requisição aceita uma lista posicional `arguments` ou um mapa nomeado `arguments` cujas chaves são os parâmetros declarados da atualização:

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

Defina `wait_for` como `accepted` quando o chamador precisar apenas da aceitação durável do comando e quiser que o worker de workflow aplique a atualização depois:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

Quando `wait_for` é omitido ou definido como `completed`, o webhook primeiro registra a atualização aceita e depois espera, até o prazo de conclusão configurado, que o worker de workflow a aplique. Sobrescreva esse prazo por requisição com `wait_timeout_seconds`:

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

Se o worker concluir dentro desse prazo, o webhook retorna a resposta normal de atualização concluída ou com falha. Se o prazo de espera expirar primeiro, retorna HTTP `202` com o ciclo de vida aceito ainda aberto, sem bloquear indefinidamente. Quando `wait_for` é `accepted`, o webhook registra a linha de comando, a linha própria de ciclo de vida da atualização e o histórico tipado `UpdateAccepted`, depois agenda ou reenvia uma tarefa de workflow e retorna HTTP `202` sem esperar a aplicação da atualização.

Toda resposta POST e GET de atualização inclui os campos normais de comando mais `update_id`, `update_name`, `update_status`, `workflow_sequence`, `accepted_at`, `applied_at`, `rejected_at` e `closed_at`. Ciclos de vida aceitos ainda abertos retornam `workflow_sequence = null`, `result = null`, `applied_at = null`, `rejected_at = null` e `closed_at = null` até que o worker encerre o ciclo de vida.

Quando um mapa nomeado é aceito, o mecanismo o normaliza na ordem declarada dos parâmetros antes de acrescentar o histórico tipado `UpdateAccepted` ou `UpdateApplied`. Nessa normalização, parâmetros opcionais também são preenchidos com seus valores padrão do PHP.

Cada atualização aceita ou rejeitada é respaldada por uma linha durável de `workflow_updates` identificada por `update_id`. Assim, chamadores podem fazer um POST e depois um GET do ciclo de vida armazenado, sem inferir estado a partir de linhas genéricas de comando.

Exemplo de atualização:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

Resposta de atualização concluída:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Resposta de atualização apenas aceita:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Exemplo de busca de ciclo de vida:

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

Resposta da busca enquanto a atualização ainda está aberta:

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Resposta da busca após o encerramento do ciclo de vida:

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Rotas de busca não esperam a execução. Apenas leem o ciclo de vida durável armazenado, portanto sempre retornam `wait_for = status`, `wait_timed_out = false` e `wait_timeout_seconds = null`.

Quando a execução selecionada já tem um sinal aceito anterior esperando aplicação, o POST posterior é rejeitado como `rejected_pending_signal`, em vez de executar essa tarefa de workflow diretamente no caminho do chamador. Payloads nomeados ou posicionais inválidos são rejeitados como `rejected_invalid_arguments` com `validation_errors`. Rotas POST direcionadas a execuções históricas são rejeitadas como `rejected_not_current`.

Matriz atual de respostas HTTP das rotas POST de atualização:

- `200` com `outcome = update_completed` quando o comando de atualização é aceito e concluído
- `202` com `update_status = accepted` quando `wait_for = accepted` aceita o comando de forma durável e deixa sua aplicação para o worker de workflow
- `202` com `update_status = accepted`, `wait_for = completed` e `wait_timed_out = true` quando o webhook esperou até `wait_timeout_seconds` ou o padrão configurado e o worker ainda não encerrou o ciclo de vida da atualização
- `401` para falha de autenticação do webhook
- `404` para um ID de instância de workflow desconhecido
- `404` com `outcome = rejected_unknown_update` para um nome durável de atualização desconhecido. Quando a execução já tem um instantâneo tipado do contrato em `WorkflowStarted`, ou um evento `WorkflowStarted` antigo pode ser preenchido na primeira entrada compatível, essa rejeição pode vir dos metadados duráveis da execução antes de recorrer à definição ativa
- `409` com `outcome = rejected_not_started` quando a instância ainda não tem execução atual
- `409` com `outcome = rejected_not_active` quando a execução atual já está encerrada
- `409` com `outcome = rejected_not_current` quando a rota direcionada a uma execução endereça uma execução histórica selecionada
- `409` com `outcome = rejected_pending_signal` quando um sinal aceito anterior ainda precisa ser aplicado antes de executar a atualização
- `422` com `outcome = rejected_invalid_arguments` quando o payload da atualização é um array, mas não atende ao contrato declarado, incluindo argumentos ausentes ou desconhecidos, divergências de tipo ou violações de nulabilidade
- `422` com `outcome = update_failed` quando o corpo da atualização lança uma exceção
- `422` quando `arguments` está presente, mas não é um array. Essa falha de formato da requisição é rejeitada antes da criação de uma linha durável de comando

Matriz atual de respostas HTTP das rotas GET de busca de atualização:

- `200` quando o ciclo de vida está encerrado e `update_status` é `completed`, `failed` ou `rejected`
- `202` enquanto `update_status = accepted`
- `401` para falha de autenticação do webhook
- `404` para um ID de instância de workflow, ID de execução selecionada ou `update_id` desconhecido dentro do escopo solicitado

### Webhooks de reparo e comandos terminais {#repair-and-terminal-command-webhooks}

Há rotas de reparo e comandos terminais direcionadas tanto à instância quanto a uma execução:

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

Aqui, `workflowId` é o ID público da instância de workflow. As rotas de instância sempre resolvem a execução ativa atual. As rotas de execução também recebem um `runId` selecionado e rejeitam seleções históricas com o resultado durável `rejected_not_current`. A mesma configuração `workflows.webhook_auth` da rota de início se aplica a essas rotas de comandos terminais.

Exemplo de reparo:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

Exemplo de cancelamento:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

Exemplo de término:

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

Resposta de aceitação do reparo quando o runtime restaura o progresso durável da execução atual:

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Resposta de aceitação do reparo quando a execução atual já tem um caminho durável saudável de retomada:

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Resposta de aceitação do cancelamento:

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Resposta de aceitação do término:

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Resposta de rejeição quando a instância existe, mas ainda não iniciou uma execução:

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Resposta de rejeição quando a execução atual já está encerrada:

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Resposta de rejeição quando uma rota de reparo, cancelamento ou término direcionada a uma execução endereça uma execução histórica:

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Matriz atual de respostas HTTP dos webhooks de reparo, cancelamento e término:

- `200` com `outcome = repair_dispatched` quando o reparo reenvia uma tarefa pronta atrasada, recupera uma concessão expirada ou recria uma tarefa durável ausente que ainda não começou a executar, incluindo tarefas de aplicação de atualizações e sinais aceitos cujas linhas foram perdidas antes da aplicação do comando
- `200` com `outcome = repair_not_needed` quando a execução já tem um caminho durável saudável de retomada ou quando a execução selecionada já está em uma atividade em andamento sem linha de tarefa
- `200` com `outcome = cancelled` ou `outcome = terminated` quando a execução atual é encerrada com sucesso
- `401` para falha de autenticação do webhook
- `404` para um ID de instância de workflow desconhecido
- `409` com `outcome = rejected_not_started` quando a instância ainda não tem execução atual
- `409` com `outcome = rejected_not_active` quando a execução atual já está encerrada
- `409` com `outcome = rejected_not_current` quando a rota direcionada a uma execução endereça uma execução histórica selecionada

### Webhooks de descrição {#describe-webhooks}

Há rotas de descrição direcionadas à instância e a uma execução para inspecionar o estado do workflow por HTTP:

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` é o ID público da instância de workflow. A rota direcionada à instância retorna o estado da execução atual. A rota direcionada a uma execução descreve uma execução específica pelo ID, incluindo execuções históricas ou já encerradas.

A descrição é uma operação de inspeção somente de leitura. Não cria uma linha durável de comando nem reproduz o workflow. Retorna metadados da instância, estado da execução atual ou selecionada, campos de resumo e disponibilidade de ações a partir de dados confirmados de projeção.

Exemplo de descrição:

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

Resposta para um workflow ativo:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

Resposta para um workflow terminado:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

A disponibilidade das ações reflete se a operação pode ter sucesso no momento: execuções encerradas não aceitam comandos, workflows exclusivamente remotos não podem atender consultas ou atualizações localmente, e execuções que não são atuais não podem receber sinais, atualizações, cancelamentos ou términos.

Exemplo de descrição direcionada a uma execução:

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

A resposta direcionada a uma execução inclui o mesmo payload, mas `is_current_run` será `false` quando a execução selecionada for histórica, e todas as ações que alteram estado indicarão `false`.

Resposta quando a instância não é encontrada:

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

Resposta quando a instância existe, mas a execução selecionada não é encontrada:

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

Matriz atual de respostas HTTP dos webhooks de descrição:

- `200` quando a instância é encontrada, esteja a execução ativa, encerrada ou histórica
- `200` quando a instância é encontrada, mas a execução selecionada não existe (`reason = run_not_found`)
- `401` para falha de autenticação do webhook
- `404` quando o ID da instância de workflow não existe (`reason = instance_not_found`)


### Webhook de início do plano de controle {#control-plane-start-webhook}

Uma rota de início do plano de controle aceita diretamente uma chave de tipo durável de workflow, sem exigir que a classe possa ser resolvida localmente. Esse é o caminho de início preferencial para um consumidor externo que controla workflows por chaves de tipo, em vez de aliases de classes PHP.

```text
POST /webhooks/control-plane/start
```

O corpo da requisição aceita:

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `workflow_type` | string | sim | Chave de tipo durável de workflow |
| `instance_id` | string | não | ID público da instância de workflow fornecido pelo chamador |
| `arguments` | string | não | Argumentos serializados identificados pelo codec |
| `connection` | string | não | Sobrescrita da conexão de fila |
| `queue` | string | não | Sobrescrita do nome da fila |
| `business_key` | string | não | Chave de negócio fornecida pelo chamador |
| `labels` | object | não | Rótulos de visibilidade |
| `memo` | object | não | Metadados não indexados |
| `duplicate_start_policy` | string | não | `reject_duplicate` ou `return_existing_active` |

Exemplo de requisição:

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

Resposta para um workflow recém-iniciado:

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

Quando `instance_id` é omitido, o mecanismo gera automaticamente um ID de instância baseado em ULID.

Quando a chave de tipo do workflow é mapeada a uma classe que pode ser resolvida localmente pela configuração `workflows.v2.types.workflows` ou por um atributo `#[Type(...)]`, o instantâneo completo do contrato de comandos e o roteamento são aplicados no início. Quando a classe não está disponível localmente, a instância é criada com a chave de tipo e o roteamento explícito das opções. O instantâneo do contrato de comandos e a impressão digital da definição ficam a cargo do worker que reivindicar a primeira tarefa. Assim, um consumidor externo pode iniciar workflows com chaves de tipo que apenas a frota de workers consegue resolver.

Matriz atual de respostas HTTP do webhook de início do plano de controle:

- `202` com `outcome = started_new` quando uma nova execução é criada
- `200` com `outcome = returned_existing_active` quando a execução ativa existente é reutilizada
- `409` com `outcome = rejected_duplicate` quando o início duplicado é rejeitado
- `401` para falha de autenticação do webhook
- `422` quando `workflow_type` está ausente ou `instance_id` é inválido

O contrato `WorkflowControlPlane` também está disponível como singleton resolvível pelo contêiner para uso programático. Resolva `Workflow\V2\Contracts\WorkflowControlPlane` pelo contêiner do Laravel para chamar `start()`, `signal()`, `query()`, `update()`, `cancel()`, `terminate()` e `describe()` diretamente de código PHP, testes ou comandos Artisan.

O sistema de webhooks abrange a entrada explícita de início por alias, webhooks de sinal, atualização, consulta, descrição, reparo, cancelamento e término direcionados tanto à instância quanto a uma execução, rotas de polling para tarefas de workflow e atividade e uma rota de início do plano de controle para criar workflows por chave de tipo.
