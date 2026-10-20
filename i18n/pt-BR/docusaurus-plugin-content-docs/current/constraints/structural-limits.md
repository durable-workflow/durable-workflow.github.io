---
sidebar_position: 5
---

# Limites estruturais {#structural-limits}

Os limites estruturais restringem o consumo de recursos de uma única execução de workflow. Quando uma operação excederia um limite configurado, o mecanismo registra uma falha tipada com a categoria de falha `structural_limit`, legível por máquina, e o tipo específico de limite, e então faz a execução falhar. Isso protege o sistema contra expansão paralela ilimitada, payloads grandes demais e excesso de metadados.

## Tipos de limite {#limit-kinds}

| Tipo de limite | Padrão | O que restringe |
|---|---|---|
| `pending_activity_count` | 2.000 | Execuções de atividades não terminais abertas simultaneamente |
| `pending_child_count` | 1.000 | Workflows filhos não terminais abertos simultaneamente |
| `pending_timer_count` | 2.000 | Temporizadores pendentes abertos simultaneamente |
| `pending_signal_count` | 5.000 | Sinais não processados pendentes simultaneamente |
| `pending_update_count` | 500 | Atualizações não resolvidas pendentes simultaneamente |
| `command_batch_size` | 1.000 | Itens em uma única expansão paralela (`all()`) |
| `payload_size_bytes` | 2 MiB | Tamanho serializado de um único payload de argumentos |
| `memo_size_bytes` | 256 KiB | Tamanho serializado de metadados de memo não indexados |
| `search_attribute_size_bytes` | 40 KiB | Tamanho serializado de metadados de atributos de busca indexados |
| `history_transaction_size` | 5.000 | Eventos de histórico produzidos por uma única execução de tarefa de workflow |

Todos os limites são aplicados no momento do agendamento, do registro ou do recebimento de comandos. O valor `0` desativa a verificação desse tipo de limite.

## Avisos de aproximação dos limites {#soft-limit-warnings}

Antes que um limite rígido termine uma execução ou rejeite um comando, o mecanismo pode avisar que um recurso está se aproximando do teto. Quando um recurso baseado em contagem (atividades, filhos, temporizadores, sinais ou atualizações pendentes, tamanho do lote de comandos ou eventos de transação de histórico) ultrapassa uma porcentagem configurável do limite rígido, o mecanismo registra um aviso estruturado no log.

O limiar padrão de aviso é **80%**. Por exemplo, com o limite padrão `pending_activity_count` de 2.000, um aviso é registrado quando uma execução chega a 1.600 atividades pendentes. A execução continua normalmente. O aviso dá aos operadores tempo para reagir (escalar workers, acionar a continuação como nova execução, aumentar o limite) antes que a proteção rígida faça a execução falhar.

Configure o limiar por meio de `workflows.v2.structural_limits.warning_threshold_percent`:

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

Defina como `0` para desativar totalmente os avisos de aproximação dos limites.

As entradas de aviso no log incluem contexto estruturado:

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

O contexto estruturado do log inclui `workflow_run_id`, `workflow_type`, `limit_kind`, `current`, `limit` e `utilization_percent` para integração com ferramentas de agregação de logs e alertas.

## Configuração {#configuration}

Substitua qualquer limite por meio de `workflows.v2.structural_limits` na configuração ou por variáveis de ambiente:

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 262144),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## Pontos de aplicação {#enforcement-points}

### Limites de contagem de pendências (lado do executor) {#pending-count-limits-executor-side}

Antes de agendar uma atividade, workflow filho ou temporizador, o executor conta os itens desse tipo que ainda não são terminais na execução. Se a contagem já estiver no limite configurado ou acima dele, a execução falha imediatamente com uma `StructuralLimitExceededException`.

Isso protege contra padrões como laços de expansão paralela ilimitada que acumulam milhares de operações pendentes:

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

Para processar lotes grandes dentro dos limites, divida os itens em blocos de tamanho limitado:

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Limites de contagem de pendências (lado do recebimento) {#pending-count-limits-intake-side}

Quando um comando de sinal ou atualização chega pelo plano de controle, webhook ou `WorkflowStub`, o mecanismo verifica a contagem de sinais não processados (estado `received`) ou atualizações não resolvidas (estado `accepted`) na execução de destino antes de aceitar o comando.

Se a contagem estiver no limite configurado ou acima dele, o comando é **rejeitado** com o motivo `structural_limit_exceeded`. A resposta de rejeição inclui metadados legíveis por máquina (`structural_limit_kind`, `structural_limit_value`, `structural_limit_configured`) para que os chamadores identifiquem a causa raiz.

Ao contrário dos limites do executor (que fazem a execução falhar), os limites de recebimento rejeitam o comando individual sem terminar o workflow. A execução permanece ativa, e o chamador pode tentar novamente depois que os itens pendentes forem processados.

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### Tamanho do lote de comandos {#command-batch-size}

A função `all()` compara o número total de operações folha em um único grupo de expansão paralela com `command_batch_size`. A verificação acontece antes de qualquer atividade individual ou workflow filho ser agendado. Assim, a execução falha de forma íntegra em vez de agendar parcialmente um lote.

### Tamanho do payload {#payload-size}

Quando o executor agenda uma atividade ou workflow filho, ele serializa o payload de argumentos e compara seu tamanho em bytes com `payload_size_bytes`. Se o payload serializado exceder o limite, a execução falha antes que qualquer registro da operação seja criado no banco de dados.

Isso se aplica a:

- **Argumentos de atividades**: verificados quando `scheduleActivity` serializa os argumentos de `ActivityCall`.
- **Argumentos de workflows filhos**: verificados quando `scheduleChildWorkflow` serializa os argumentos de início do filho, antes de criar os registros de instância ou execução do filho.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

Para respeitar o limite, ative o
[Armazenamento externo de payloads](../features/external-payload-storage.md) no
namespace para que o runtime transfira de forma transparente payloads acima do
limiar para um armazenamento de objetos configurado, ou armazene os bytes por
conta própria e passe uma referência no nível da aplicação:

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

O armazenamento externo de payloads preserva a integridade do replay registrando
no histórico um envelope `durable-workflow.v2.external-payload-reference.v1`
com hash. Assim, o envelope de referência passa a ser o payload verificado pelo
limite, em vez dos bytes.

### Tamanho do memo {#memo-size}

Quando um workflow insere ou atualiza entradas de memo por `upsertMemo()`, o executor mescla as novas entradas ao mapa de memo existente, codifica o resultado em JSON e compara seu tamanho em bytes com `memo_size_bytes`. Se o memo mesclado exceder o limite, a execução falha antes de ele ser persistido.

### Tamanho da transação de histórico {#history-transaction-size}

Cada execução de tarefa de workflow (um único "turno" de replay e avanço) pode produzir novos eventos de histórico: agendamento de atividades, criação de temporizadores, registro de efeitos, inserção ou atualização de atributos de busca e assim por diante. O limite `history_transaction_size` restringe o número total de novos eventos que uma única tarefa pode produzir.

Isso detecta laços descontrolados que criam eventos ilimitados em uma única tarefa sem ceder o controle:

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

A verificação é executada no início de cada iteração do laço principal do executor. Eventos criados durante o replay (leitura do histórico existente) não contam para o limite. Apenas novos eventos gravados durante a tarefa atual são contabilizados.

### Tamanho dos atributos de busca {#search-attribute-size}

Quando um workflow insere ou atualiza atributos de busca por `upsertSearchAttributes()`, o executor mescla os novos atributos ao conjunto existente, codifica o resultado em JSON e compara seu tamanho em bytes com `search_attribute_size_bytes`. Se os atributos mesclados excederem o limite, a execução falha antes de eles serem persistidos.

## Taxonomia de falhas {#failure-taxonomy}

Quando um limite estrutural é excedido, o mecanismo registra:

- Um registro `WorkflowFailure` com `failure_category = structural_limit`
- Um evento de histórico `WorkflowFailed` com:
  - `failure_category = structural_limit`
  - `structural_limit_kind`: o limite específico que foi excedido (por exemplo, `pending_activity_count`, `command_batch_size`)
  - `structural_limit_value`: a contagem ou o tamanho atual que acionou o limite
  - `structural_limit_configured`: o teto configurado

Esses metadados são legíveis por máquina, então operadores, Waterline e ferramentas externas podem identificar a causa raiz sem interpretar mensagens de texto livre.

## Verificação de integridade {#health-check}

A configuração atual dos limites estruturais é incluída no snapshot de verificação de integridade da v2 em `structural_limits`, tornando os tetos ativos visíveis aos operadores:

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 262144,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## Limites dependentes do backend {#backend-dependent-limits}

O snapshot de capacidades do backend publica o contrato completo de limites estruturais ajustado à infraestrutura atual. A maioria dos limites é composta por valores de configuração independentes do backend, mas alguns backends impõem restrições adicionais:

- **Fila SQS**: [os atrasos de mensagens do SQS Standard](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html) são limitados a 900 segundos. Atrasos maiores de temporizadores, novas tentativas de atividades e tarefas de workflow são divididos em blocos pela camada de transporte. O snapshot de capacidades mantém `max_single_timer_delay_seconds: 900` por compatibilidade.
- **Banco de dados SQLite**: o SQLite serializa escritas, então o snapshot informa `concurrent_write_safety: limited`. Limites altos de contagem de pendências podem causar contenção de bloqueios sob carga de workers concorrentes.

Uma entrega antecipada do SQS agenda outra mensagem com atraso limitado sem
adquirir um lease da tarefa durável, consumir uma tentativa de execução, gravar
histórico de execução ou executar código do usuário. O `available_at` original
permanece inalterado. Quando chega a hora, a tarefa segue a execução normal e a
proteção contra entregas duplicadas. Os prazos gerais do workflow e da atividade
continuam correndo durante a espera. Portanto, escolha um intervalo entre
tentativas que caiba nesses orçamentos. Drivers de fila sem teto de atraso
mantêm exatamente o atraso solicitado.

O contrato completo está disponível na seção `structural_limits` da resposta de capacidades do backend:

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline {#waterline}

O Waterline exibe falhas de limites estruturais na tabela de exceções com a categoria de falha `structural_limit`. Os detalhes da falha na linha do tempo incluem o tipo de limite, o valor atual e o teto configurado.

## Limites na fronteira de requisições do Server {#server-request-boundary-limits}

Ao usar o servidor independente, um conjunto separado de tetos é aplicado na fronteira de requisições HTTP, antes que uma tarefa de workflow, sinal, atualização ou consulta chegue ao plano de controle. Esses limites falham imediatamente com uma resposta `422 validation_failed` (ou `413 payload_too_large` nas verificações do corpo inteiro), para que clientes saibam o motivo da rejeição sem que o servidor grave qualquer registro no banco de dados.

| Limite | Padrão | Chave de configuração | O que restringe |
|---|---|---|---|
| Tamanho do corpo | 2 MiB | `server.limits.max_payload_bytes` | Total de bytes do corpo da requisição HTTP |
| Tamanho do memo | 256 KiB | `server.limits.max_memo_bytes` | Memo serializado em `POST /workflows` e `POST /schedules` |
| Contagem de atributos de busca | 100 | `server.limits.max_search_attributes` | Atributos de busca personalizados registrados por namespace |
| Comprimento da chave de atributo de busca | 128 bytes | `server.limits.max_search_attribute_key_length` | Comprimento de uma única chave de atributo de busca no início |
| Tamanho do valor de atributo de busca | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Cada valor de string (e cada elemento de um valor de array) no início |
| Nome de sinal / atualização / consulta | 256 bytes | `server.limits.max_operation_name_length` | Segmento do caminho da URL para nomes de sinal/atualização/consulta |
| Comprimento de `workflow_id` | 128 caracteres | validador do controlador | ID do workflow em `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 caracteres | validador do controlador | Campos de string em `POST /workflows` |
| `request_id` | 255 caracteres | validador do controlador | Token de deduplicação em sinais/atualizações/cancelamento/término |
| `reason` | 1.000 caracteres | validador do controlador | Texto do motivo em cancelamento/término/arquivamento |

Cada limite pode ser configurado individualmente por variáveis de ambiente `DW_*` (consulte `config/dw-contract.php` para o contrato completo). Definir o valor `0` desativa a verificação daquele limite específico, mas mantém os demais em vigor.

Os valores configurados atualmente são publicados em `limits` na resposta de `GET /api/cluster/info`, para que clientes possam descobri-los em tempo de execução:

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Erros de validação são retornados no envelope padrão de erro do plano de controle, com `reason: "validation_failed"` e um mapa `validation_errors` cujas chaves são os campos inválidos (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo` e assim por diante). Rejeições por tamanho de payload usam `reason: "payload_too_large"` e o código de status `413`.
