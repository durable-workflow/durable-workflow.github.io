---
sidebar_position: 11
title: Falhas e recuperação
description: Diagnostique falhas de atividades, exceções permanentes, timeouts de execução, limpeza de cancelamento e ações de recuperação.
tags:
  - failures
  - recovery
  - operations
keywords:
  - falhas de workflow
  - exceção permanente
  - recuperação de workflow
---

# Falhas e recuperação {#failures-and-recovery}

Antes de investigar uma falha, lembre-se do contrato central de execução:

- tarefas de workflow se recuperam por replay do histórico confirmado
- atividades executam pelo menos uma vez e podem ser observadas mais de uma vez
- expiração de leases e reentrega são caminhos normais de recuperação, sem
  provar que o worker anterior deixou de realizar o efeito externo

Leia [Garantias de execução e idempotência](./constraints/execution-guarantees.md)
para entender as regras exatas de novas tentativas, reentrega e resultados
duráveis.

## Tratamento de exceções {#handling-exceptions}

`Workflow\V2\Activity` usa `$tries = 1` por padrão: uma tentativa, sem repetição automática após uma exceção. A primeira falha da atividade é devolvida ao workflow. O código pode capturá-la, como no exemplo; se não tratar a exceção, a execução falha e se torna terminal.

Novas tentativas precisam ser configuradas explicitamente. Defina `$tries` acima de `1` para permitir mais tentativas, ou como `0` para tentativas ilimitadas, e escolha uma política de `backoff()`. Uma falha que permite repetição só é entregue ao código do workflow quando o orçamento configurado de tentativas ou de tempo se esgota. Uma falha não repetível ignora as tentativas restantes.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Exceções que não permitem novas tentativas {#non-retryable-exceptions}

Algumas exceções representam falhas permanentes que não devem provocar uma
nova tentativa. Quando uma atividade lança uma dessas exceções, o mecanismo
marca a atividade como falha imediatamente e interrompe as tentativas.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Processo de recuperação {#recovery-process}

Primeiro, consulte o estado durável da execução selecionada e a política de novas tentativas da atividade. Com a tentativa única padrão, uma falha de atividade não tratada já tornou a execução terminal. Implantar uma correção ou chamar `repair()` não reabre essa execução com falha.

Corrigir o código enquanto a execução original aguarda só é possível se a atividade ainda tiver uma tentativa válida disponível. Configure `$tries` acima de `1`, ou como `0` para tentativas ilimitadas, com `backoff()` antes de agendar a atividade. Opcionalmente, defina `ActivityOptions::$scheduleToCloseTimeout` para limitar a duração total da atividade entre todas as tentativas; os prazos do workflow continuam valendo. Consulte [Novas tentativas](./configuration/options.md#retries), [Intervalo entre tentativas](./configuration/options.md#backoff) e [ActivityOptions](./configuration/options.md#activityoptions). A política é armazenada ao agendar a atividade; uma implantação posterior não amplia seus orçamentos de tentativas ou de tempo.

Para uma execução que ainda aguarda uma atividade que permite novas tentativas:

1. Consulte seus logs e identifique os erros ou exceções.
2. Encontre a causa e corrija o código.
3. Implante a correção onde os workers da fila são executados.
4. Reinicie ou substitua gradualmente os workers relevantes para que carreguem o novo código e adquiram trabalho com segurança.
5. Deixe um worker saudável executar a próxima tentativa válida. Reparo ou reentrega pode recuperar o transporte de tarefas perdido; não concede outra tentativa de negócio depois que a atividade ou a execução se encerra.
6. Verifique o resultado durável no Waterline, na exportação do histórico ou na API do Server. Uma linha de log de um worker não é a fonte de verdade.
7. Se a atividade continuar falhando, confira os orçamentos restantes de tentativas e de tempo antes de repetir o processo.

Uma execução com uma tentativa válida disponível permanece aguardando e pode continuar quando o código corrigido tiver sucesso, desde que seus orçamentos originais não tenham expirado. Isso não garante corrigir todo workflow no mesmo lugar: uma falha final de atividade não tratada, uma falha do código do workflow, um limite estrutural ou um prazo do workflow podem tornar a execução terminal.

Para uma execução terminal com falha, preserve o histórico e reconcilie os efeitos externos antes de decidir se a aplicação deve iniciar outro workflow. Use idempotência na aplicação para operações de negócio repetidas. Se uma falha de atividade não capturada, uma falha no código do workflow ou um limite estrutural encerrou a execução, verifique depois de implantar a correção se você pode fazer um [redrive](#redrive). O redrive continua em uma nova execução que reutiliza os passos concluídos. Uma falha no código do workflow exige código corrigido e o Workflow 2.19.0 ou posterior. Veja [Redrive com o código do workflow corrigido](#redrive-corrected-definition). Não há repetição automática do workflow inteiro nem reabertura de execução terminal; consulte [Novas tentativas no nível do workflow](#workflow-level-retry).

## Redrive de uma execução com falha {#redrive}

O redrive continua uma execução com falha em uma nova execução da mesma instância de workflow. A nova execução reutiliza os resultados registrados dos passos concluídos antes da falha e executa de novo o restante do workflow. Use-o depois de corrigir a causa da falha, para que o trabalho já concluído, como um pagamento ou um e-mail, não seja repetido.

A execução com falha continua fechada e inalterada. A nova execução, chamada de sucessora, recebe o próximo número de execução e passa a ser a execução atual da instância. O `continued_from_run_id` dela indica a execução com falha. O evento `WorkflowStarted` dela registra `recovery_kind: redrive` e `resume_step_sequence`, o passo em que a execução é retomada.

Esta seção descreve o redrive no Workflow 2.20.1 e versões posteriores. Versões anteriores do Workflow, e o redrive no Server nativo, aceitam menos execuções. Veja [Versões anteriores e o Server nativo](#redrive-earlier-releases).

A sucessora reproduz o código do workflow desde o início:

- Cada chamada de atividade concluída na execução com falha retorna o resultado registrado. A atividade não é executada de novo.
- Um efeito colateral ou marcador de versão antes do passo com falha é reutilizado na ordem dos passos. O efeito colateral não é executado de novo, e uma verificação de versão retorna a versão registrada.
- Um `timer()` que disparou antes do passo com falha é registrado na sucessora como já disparado. A sucessora não espera por ele de novo.
- Um memo ou atributo de busca em que o código do workflow fez upsert antes do passo com falha é reutilizado na ordem dos passos, e a sucessora mantém os mesmos valores.
- Uma espera de sinal (`await('name')`) que recebeu e aplicou o sinal é reutilizada com o valor do sinal. O sinal não é entregue de novo.
- Um update que foi aceito, aplicado e concluído antes do passo com falha é registrado de novo na mesma posição. O replay executa o handler do update com os argumentos registrados, então o estado do workflow confere. O update não é entregue de novo. Um update rejeitado, e um que a falha fechou antes de ser executado, ficam de fora.
- No Workflow 2.26 e posteriores, uma chamada de workflow filho concluída antes do passo com falha retorna o resultado registrado. O filho não é iniciado de novo. A sucessora registra os eventos `ChildWorkflowScheduled`, `ChildRunStarted` e `ChildRunCompleted` da chamada e mantém a instância filha, a execução filha, o id de vínculo e o id de chamada originais, mas não recebe um vínculo de filho próprio.
- `outbox()->sendReference()` e `inbox()->receive()` no código de workflow reutilizado retornam a mensagem que a execução com falha enviou ou consumiu. Eles não a enviam nem a consomem de novo. Um receive em replay cuja chamada original não encontrou nada lê o stream de novo.
- No Workflow 2.20.2 e posteriores, mensagens de entrada do stream ainda pendentes na execução com falha passam para a sucessora. O Workflow 2.20.1 e anteriores as deixavam na execução com falha, então a sucessora nunca as recebia ([workflow#1013](https://github.com/durable-workflow/workflow/issues/1013)).
- Se uma falha de atividade encerrou a execução, a chamada de atividade que falhou é agendada como uma nova execução de atividade, com a política de novas tentativas do código do workflow. As tentativas recomeçam.
- Se a execução falhou no código do workflow ou em um limite estrutural, a sucessora é retomada no passo que o código do workflow nunca alcançou.
- Tudo o que vem depois do passo com falha é executado como em uma nova execução.
- Memos e atributos de busca definidos no início da execução passam para a sucessora, como no continue-as-new.
- A sucessora mantém o prazo de execução da execução com falha. O timeout de execução dela recomeça no redrive.
- Cada passo reutilizado carrega `reused_from_run_id` e `reused_recorded_at`. Em um evento reutilizado de update ou de sinal, os dois sempre vêm em par.
- Um sucessor que reutilizou passos pode passar por um novo redrive. Um payload de sinal ou de update reutilizado mantém em `workflow_run_id` a execução que o registrou primeiro, `reused_from_run_id` indica a execução de onde veio o redrive, e cada passo reutilizado mantém o horário em que foi executado pela primeira vez, então uma cadeia de redrives reutiliza cada passo uma única vez.
- No modo embedded, `Workflow::now()` na sucessora começa no horário de início da execução com falha. A reprodução usa `reused_recorded_at`, então `Workflow::now()` depois de um passo reutilizado corresponde ao horário da execução com falha. Depois de uma chamada de workflow filho reutilizada, esse é o horário em que o filho terminou pela primeira vez. Um passo reutilizado por um segundo redrive mantém o horário em que foi executado pela primeira vez.

### Solicitar um redrive {#request-a-redrive}

No modo embedded, resolva o contrato `Workflow\V2\Contracts\WorkflowControlPlane` a partir do contêiner do Laravel e chame `redrive()` com o id da instância de workflow e o id da execução com falha:

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
]);

if ($result['accepted']) {
    $successorRunId = $result['workflow_run_id'];
} else {
    $reason = $result['reason'];
}
```

No modo de serviço, envie `POST /api/workflows/{workflowId}/runs/{runId}/redrive` com um `request_id` opcional no corpo. Os clientes encapsulam a mesma rota:

| Superfície | Chamada |
| --- | --- |
| CLI | `dw workflow:redrive <workflow-id> <run-id> --request-id <id>` |
| PHP SDK | `Client::redriveWorkflow($workflowId, $failedRunId, $requestId)` |
| Python SDK | `await client.redrive_workflow(workflow_id, failed_run_id, request_id=...)` ou `await handle.redrive()` |
| Rust SDK | `client.redrive_workflow_run(workflow_id, failed_run_id, request_id)` ou `handle.redrive(request_id)` |

Um redrive aceito retorna o id de execução da sucessora e `resume_step_sequence`. Um redrive recusado retorna um `reason` e não altera nada. Fazer redrive de uma execução que já passou por redrive retorna a sucessora existente em vez de criar outra. Passe um `request_id` para que repetir a solicitação seja seguro. Um `request_id` já usado em outro redrive da mesma instância é recusado com `request_id_already_used`.

Os workers de serviço informam uma impressão digital da definição do workflow. O redrive a compara com a impressão digital registrada no início da execução. No SDK Rust, chame `Worker::set_workflow_definition_sources()` para cada workflow em que você quer poder fazer redrive. Um workflow registrado sem identidade de código-fonte continua executando, mas o redrive o recusa.

### Redrive com o código do workflow corrigido {#redrive-corrected-definition}

Quando uma execução falhou porque o código do workflow lançou uma exceção, o mesmo código lançaria a exceção de novo no mesmo passo, então o redrive a recusa com `workflow_code_failure_requires_corrected_definition`. Implante a correção e depois solicite o redrive com `allow_definition_change`:

```php
$result = app(WorkflowControlPlane::class)->redrive($instanceId, $failedRunId, [
    'request_id' => 'incident-42',
    'allow_definition_change' => true,
]);
```

Antes de gravar qualquer coisa, o redrive reproduz em memória os passos concluídos com o novo código. O novo código precisa executar os mesmos passos, na mesma ordem, e chegar ao passo em que o código antigo falhou. Se não conseguir, o redrive recusa a execução com `definition_incompatible_with_prefix`, e `definition_mismatch` indica o primeiro passo que difere (`sequence`) e um `kind` como `step_shape` ou `version_range`. Se o histórico concluído for maior que o orçamento de histórico, o redrive recusa a execução com `definition_check_over_budget`.

Uma alteração aceita executa o código corrigido e registra a impressão digital da definição substituída como `definition_changed_from` no `WorkflowStarted` da sucessora. Um redrive posterior com a mesma definição não registra esse campo.

`allow_definition_change` se aplica a execuções no modo embedded. Para uma execução iniciada por um worker de serviço, o redrive recusa a alteração de definição com `definition_change_requires_replay_check`. Sem `allow_definition_change`, uma definição alterada é recusada com `workflow_definition_unavailable_or_changed`.

### Quando uma execução com falha aceita redrive {#redrive-eligibility}

O redrive aceita uma execução com falha quando tudo isto é verdadeiro:

- A execução é a execução atual da instância.
- A execução falhou porque uma falha de atividade chegou ao código do workflow e não foi capturada, ou porque o código do workflow lançou uma exceção ou um limite estrutural a interrompeu. Uma execução que falhou em um timeout do workflow é recusada.
- Cada passo antes do passo com falha é uma atividade concluída, um efeito colateral, um marcador de versão, um `timer()` que disparou, um upsert de memo ou de atributo de busca, uma espera de sinal que recebeu e aplicou o sinal, um update que foi aceito, aplicado e concluído com os mesmos argumentos ou, no Workflow 2.26 e posteriores, uma chamada de workflow filho que foi concluída. Um update rejeitado, e um que a falha fechou antes de ser executado, são permitidos e ficam de fora. Payloads de atividades, de efeitos colaterais, de sinais, de updates e de resultados de filhos precisam estar armazenados inline. Um payload no armazenamento externo de payloads é recusado.
- A definição do workflow corresponde à impressão digital registrada no início da execução, ou você passou `allow_definition_change` e o código corrigido reproduz os passos concluídos. Uma falha no código do workflow com a mesma definição é recusada.
- O prazo de execução não venceu.
- A execução não tem workflow pai nem atividades locais, e a entrada dela está armazenada em linha. Antes do Workflow 2.26, ela também não tem workflows filhos. Uma execução que é ela própria filha nunca passa por redrive, porque o pai já registrou o resultado do filho.
- Cada chamada de workflow filho antes do passo com falha foi concluída por conta própria, fora de um grupo paralelo ou escopo de cancelamento, sem nova tentativa nem continue-as-new.
- Se um worker de serviço iniciou a execução, os passos antes da falha são apenas atividades, efeitos colaterais, marcadores de versão e timers disparados. Upserts de memo e de atributo de busca, esperas de sinal, updates aplicados e chamadas de workflow filho concluídas são recusados em execuções de serviço.

Uma recusa indica a primeira regra que não foi atendida:

| Motivo | Significado |
| --- | --- |
| `run_not_failed` | A execução não está no estado `failed`. |
| `source_run_not_current` | Existe uma execução mais recente da instância. |
| `unrecorded_failure_boundary` | A falha da execução não tem um passo registrado, como uma falha no código do workflow registrada por uma versão anterior à 2.19.0. |
| `workflow_code_failure_requires_corrected_definition` | O código do workflow lançou uma exceção e a definição não mudou, então o mesmo código lançaria a exceção de novo. |
| `unsupported_history` | O histórico antes da falha tem um passo que o redrive não consegue reutilizar, como um timer cancelado. Antes do Workflow 2.26, qualquer workflow filho. |
| `unsupported_open_child` | Uma chamada de workflow filho antes da falha nunca foi fechada. Workflow 2.26 e posteriores. |
| `unsupported_child_outcome` | Um workflow filho antes da falha falhou, foi cancelado ou foi terminado. Workflow 2.26 e posteriores. |
| `unsupported_child_workflow` | Uma chamada de workflow filho está em um grupo paralelo ou escopo de cancelamento, recebeu nova tentativa ou continuou como nova, ou seus eventos não indicam uma única chamada de filho. Workflow 2.26 e posteriores. |
| `external_child_result_not_supported` | O resultado de um workflow filho concluído está no armazenamento externo de payloads. Workflow 2.26 e posteriores. |
| `unavailable_child_result` | O resultado de um workflow filho concluído não pode ser decodificado. Workflow 2.26 e posteriores. |
| `unsupported_local_activity` | O histórico contém uma atividade local. |
| `unsupported_timer` | O histórico contém um timeout de condição ou de sinal, um timer de limpeza de cancelamento, ou um timer dentro de um escopo de cancelamento ou de um grupo paralelo. |
| `incomplete_timer_step` | Um passo de timer não tem os dois eventos, de agendamento e de disparo. |
| `unsupported_signal_wait` | Uma espera de sinal tem um timeout ou está dentro de um escopo de cancelamento ou de um grupo paralelo. |
| `unsupported_pending_signal` | A execução recebeu um sinal que nunca aplicou. |
| `incomplete_signal_step` | Falta o recebimento ou a aplicação de uma espera de sinal, ou a aplicação não tem um valor registrado. |
| `mismatched_signal_receipt` | Um recebimento de sinal indica outra execução, instância, comando ou espera, um mesmo recebimento é aplicado a duas esperas, ou um evento de sinal reutilizado tem só um de `reused_from_run_id` e `reused_recorded_at`, ou indica outra origem. |
| `unsupported_pending_update` | A execução aceitou um update que nunca aplicou nem fechou. |
| `mismatched_update_history` | Os eventos de um update não têm nenhuma das formas aceitas, indicam outra execução, update, comando ou handler, mudam os argumentos entre a aceitação e a aplicação, ou têm incompleto o par `reused_from_run_id` e `reused_recorded_at`. |
| `incomplete_update_step` | A conclusão de um update aplicado registra uma falha ou não tem resultado. |
| `invalid_step_sequence` | Um passo reutilizado não tem um número de passo válido. |
| `duplicate_step_sequence` | Dois passos reutilizados compartilham o mesmo número de passo. |
| `external_activity_result_not_supported` | Um resultado de atividade concluída está no armazenamento externo de payloads. |
| `external_side_effect_result_not_supported` | Um resultado de efeito colateral está no armazenamento externo de payloads. |
| `external_signal_payload_not_supported` | Os argumentos ou o valor aplicado de um sinal estão no armazenamento externo de payloads. Qualquer chave `external_storage` conta, mesmo nula. |
| `external_update_payload_not_supported` | Os argumentos ou o resultado de um update estão no armazenamento externo de payloads. |
| `unavailable_update_payload` | Os argumentos ou o resultado inline de um update não podem ser decodificados. |
| `missing_activity_result`, `unavailable_activity_result` | Um resultado de atividade concluída está ausente ou não pode ser decodificado. |
| `unsupported_visibility_metadata` | O código do workflow gravou um memo ou atributo de busca em um passo que a sucessora não reutilizaria. |
| `unsupported_source_metadata` | A execução foi iniciada como filha de outro workflow. |
| `unsupported_source_link_or_payload` | A execução está vinculada como filha de outro workflow, ou a entrada dela está no armazenamento externo de payloads. |
| `execution_deadline_elapsed` | O prazo de execução venceu. |
| `workflow_definition_unavailable_or_changed` | A impressão digital da definição está ausente, ou difere da registrada no início e `allow_definition_change` não foi passado. |
| `definition_incompatible_with_prefix` | O código corrigido não consegue reproduzir os passos concluídos. `definition_mismatch` indica o primeiro passo que difere. |
| `definition_check_over_budget` | O histórico concluído é maior que o orçamento de histórico permitido pela verificação de reprodução. |
| `definition_change_requires_replay_check` | Um worker de serviço iniciou a execução, então o redrive não consegue verificar uma definição alterada. |
| `service_redrive_history_not_qualified` | Um worker de serviço iniciou a execução, e os passos antes da falha incluem um upsert de memo, um upsert de atributo de busca, uma espera de sinal, um update aplicado ou uma chamada de workflow filho concluída. O redrive recusa esses passos em execuções de serviço até poder verificar, para cada runtime de SDK, se ele consegue reproduzi-los no replay. |
| `request_id_already_used` | O `request_id` já foi usado em outro redrive da instância. |
| `already_redriven` | Informado pelos detalhes da execução e por `describe()` para uma execução que já passou por redrive. Uma solicitação de redrive para ela retorna o sucessor existente. |
| `invalid_request_id` | O `request_id` tem mais de 191 caracteres. |
| `run_not_found`, `instance_not_found` | A execução ou a instância não existe no namespace. |

Os demais motivos indicam um histórico que não tem o formato esperado: `invalid_history`, `events_after_failure`, `duplicate_start`, `missing_start`, `unexpected_start`, `missing_terminal_history`, `invalid_activity_sequence`, `activity_sequence_gap`, `missing_activity_type`, `activity_type_mismatch`, `duplicate_activity_completion`, `incomplete_activity_prefix` e `invalid_failed_step`. Exporte o histórico da execução e inspecione-o antes de decidir como recuperá-la.

Quando o redrive recusa uma execução, preserve o histórico, reconcilie os efeitos externos e decida se a aplicação deve iniciar um novo workflow.

### Verificar se uma execução aceita redrive {#redrive-check}

No Workflow 2.18.0 e versões posteriores, o detalhe da execução informa `can_redrive` e `redrive_blocked_reason`. O detalhe da execução selecionada do Waterline lê esses campos. `WorkflowControlPlane::describe()` informa os mesmos campos em `actions`. Eles vêm da mesma verificação que `redrive()` aplica, então você vê se uma execução aceita redrive, e por que não, antes de solicitá-lo.

Uma execução que não falhou informa `run_not_failed`. Uma execução que já passou por redrive informa `already_redriven`. Para uma execução no modo de serviço, o relatório só verifica se uma impressão digital foi registrada. `redrive()` continua comparando-a com a impressão digital do worker. O relatório não executa a verificação de reprodução do código corrigido, então uma definição alterada mostra `workflow_definition_unavailable_or_changed` até você solicitar o redrive com `allow_definition_change`.

No Workflow 2.19.0 e versões posteriores, uma sucessora que executa código corrigido informa a impressão digital substituída como `workflow_definition_changed_from` no detalhe da execução e como `run.definition_changed_from` em `describe()`.

No Workflow 2.20.0 e posteriores, os detalhes da execução e `describe()` informam o vínculo de redrive como linhagem tipada. `parents` do sucessor e `continuedWorkflows` da execução com falha o listam com `link_type: redrive` e `history_authority: typed_history`, usando o passo e o horário do `WorkflowStarted` do sucessor. Um vínculo que o histórico não confirma aparece uma vez com `history_authority: mutable_open_fallback` e `diagnostic_only: true`.

### Versões anteriores e o Server nativo {#redrive-earlier-releases}

Versões do Workflow anteriores à 2.26.0 recusam qualquer workflow filho no histórico com `unsupported_history`. Elas ignoram `reused_recorded_at` nos eventos de workflow filho, então uma sucessora da 2.26.0 que reutilizou uma chamada de filho pode ser reproduzida nelas com um horário de workflow diferente, e prazos diferentes, depois da chamada. Elas também recusam um novo redrive dela. Depois que existir uma sucessora assim, mantenha os workers na 2.26.0 ou posterior, ou confirme que nenhum histórico assim pode ser reproduzido, antes de fazer rollback.

O Workflow 2.20.0 não recusa nada que o 2.20.1 aceite. No 2.20.0, `outbox()->sendReference()` no código de workflow reutilizado envia de novo, e um `inbox()->receive()` em replay pode retornar outras mensagens ou nenhuma, ou consumir uma mensagem mais nova ([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).

O Workflow 2.19.0 recusa um update aplicado (`unsupported_history`). Ele também recusa o redrive de um sucessor que reutilizou um update (`unsupported_history`) ou uma espera de sinal (`mismatched_signal_receipt`). Os detalhes da execução e `describe()` mostram os vínculos de redrive como fallback de diagnóstico.

O Workflow 2.18.0 reutiliza atividades concluídas, efeitos colaterais, marcadores de versão e timers disparados. Ele recusa um upsert de memo ou de atributo de busca feito pelo código do workflow (`unsupported_history`), uma espera de sinal (`unsupported_history`), uma execução que falhou no código do workflow (`unrecorded_failure_boundary`) e uma definição alterada (`workflow_definition_unavailable_or_changed`).

Versões do Workflow anteriores à 2.18.0 aceitam um conjunto menor de execuções. Cada passo antes da atividade que falhou precisa ser uma atividade concluída. Um efeito colateral, marcador de versão ou timer nesse histórico é recusado com `unsupported_history`, e qualquer memo ou atributo de busca é recusado com `unsupported_visibility_metadata`. O detalhe da execução e `describe()` não informam `can_redrive` nem `redrive_blocked_reason`.

Versões anteriores à 2.19.0 ignoram `reused_recorded_at` em passos reutilizados de sinal, memo e atributo de busca. Depois que um sucessor do Workflow 2.19.0 ou posterior reutilizar esses passos, mantenha workers 2.19.0 ou posteriores, ou confirme que nenhum histórico assim pode ser reproduzido, antes de voltar de versão. No modo embarcado, o Workflow 2.19.0 reproduz, importa e retoma um sucessor do 2.20.0 que reutilizou um update ou uma espera de sinal encadeada do mesmo jeito que o 2.20.0 ([comprovante de qualificação](https://github.com/durable-workflow/workflow/issues/864#issuecomment-6617902412)).

Desde 3.7.0, o redrive do Server nativo leva ao sucessor memos e atributos de busca definidos no início, e `describe()` informa `can_redrive` e `redrive_blocked_reason` em `actions`. Desde 3.8.0 também reutiliza efeitos colaterais e marcadores de versão anteriores ao passo que falhou, registrando payload original, `reused_from_run_id` e `reused_recorded_at`. As versões nativas 3.8.0–3.10.x preservam strings existentes de timestamps reutilizados, mas escrevem novos relógios de fallback em segundos inteiros; isso não comprova igualdade fracionária do relógio de replay. Essas versões recusam upserts de memo/atributo no código do workflow (`service_redrive_history_not_qualified`), resultados externos de efeitos colaterais (`external_side_effect_result_not_supported`) e temporizadores disparados (`unsupported_history`). A [extensão nativa de temporizadores simples e precisão do relógio](./polyglot/server-api-reference.md#native-redrive-timers) tem um produtor imutável qualificado. A adoção estável ainda exige os recibos instalados aplicáveis de SDK e as condições de Chart/release. O trabalho de precisão/referência do Core e a paridade nativa restante continuam em [server#980](https://github.com/durable-workflow/server/issues/980).

## Recusa de entrada e recuperação no modo de serviço {#service-entry-recovery}

**Suporte publicado.** O Server 2.9.9 e os SDKs PHP 2.5.4, Python 2.6.2 e Rust 3.5.6 introduziram as proteções de entrada e o comportamento de roteamento e recuperação descritos abaixo. Essas são as versões mínimas para esses recursos; instale as versões estáveis atuais para receber correções de segurança.

Uma entrada incompatível provoca uma recusa de implantação/replay antes de executar o código de workflow da aplicação, não uma nova tentativa de atividade nem uma falha terminal de negócio. O worker informa `failure_reason = workflow_entry_arguments_mismatch`, e o Server mantém a tarefa de workflow com falha e `replay_blocked = true`, sem criar outra tentativa automaticamente. Seu `replay_blocked_reason` genérico é `worker_reported_replay_failure`. A execução permanece não terminal, com entrada, histórico e prazos registrados intactos. Já uma exceção lançada pelo corpo do workflow após a entrada bem-sucedida ainda pode fazer a execução falhar.

Recupere somente depois de conferir o estado durável real:

1. Inspecione a execução selecionada com `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Confirme que `latest_workflow_task_failure.reason` é `workflow_entry_arguments_mismatch` e que o original continua aberto. Esse procedimento não reabre uma execução terminal.
2. Implante código que aceite os argumentos posicionais ou a entrada tipada registrados. Preserve os ids originais de workflow e execução, namespace, fila, compatibilidade de build, histórico e prazos. Nunca edite a entrada armazenada nem a substitua por novos valores padrão de DTO.
3. Confirme no [roteamento de definições](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution) que há um worker elegível. Repair não cria um worker nem comprova compatibilidade de replay.
4. Use `POST /api/workflows/{workflowId}/runs/{runId}/repair` com a credencial normal de operador autorizado e o namespace. A rota da execução selecionada recusa um alvo histórico em vez de reparar silenciosamente uma execução mais recente. PHP também oferece `Client::repairWorkflow($workflowId, $runId)`; `repair_workflow(workflow_id)` do Python aponta para a instância atual, e Rust não tem um método auxiliar de reparo equivalente.
5. Verifique se o mesmo original continua com a entrada e o prefixo do histórico registrados e confirma o resultado esperado uma única vez. Um prazo original já vencido continua valendo. Se a substituição ainda for incompatível, inspecione a nova recusa em vez de repetir repair continuamente.

Versões antigas do Server podem armazenar o motivo específico do SDK sem classificá-lo como bloqueio de replay; informar a falha, por si só, não garante a ausência de novas tentativas automáticas. Use a combinação qualificada de runtime e SDK. Consulte os limites por linguagem em [Versionamento](./features/versioning.md#service-sdk-entry-safeguard) e as rotas autenticadas de execução selecionada em [Comandos de workflow](./polyglot/server-api-reference.md#workflow-commands).

## Aplicação de timeouts do workflow {#workflow-timeout-enforcement}

Quando `StartOptions::withExecutionTimeout()` ou
`StartOptions::withRunTimeout()` é configurado, o mecanismo registra um prazo
na execução do workflow. O prazo de execução lógica abrange o workflow inteiro,
incluindo execuções criadas por continue-as-new. O prazo de uma execução
individual recomeça em cada nova execução.

Se o prazo já tiver passado quando o mecanismo iniciar uma tarefa de workflow,
a execução é encerrada imediatamente:

- Atividades abertas, temporizadores e tarefas pendentes são cancelados, com
  eventos de histórico tipados como `ActivityCancelled` e `TimerCancelled`.
- Um registro `WorkflowFailure` é criado com `failure_category = timeout` e
  `propagation_kind = timeout`.
- Um evento `WorkflowTimedOut` é registrado com `timeout_kind` igual a
  `execution_timeout` ou `run_timeout`.
- O estado da execução passa a `failed`, com `closed_reason = timed_out`.
- Workflows pais que aguardam o filho são notificados.

O monitor de tarefas em segundo plano também procura execuções não terminais
com prazos vencidos e sem tarefa de workflow aberta, como uma execução que
aguarda uma atividade ou temporizador. Ao encontrar uma, cria uma tarefa para
que o executor detecte e aplique o timeout na próxima passagem.

Waterline mostra `failure_category` na coluna **Category** da tabela de
exceções e nos detalhes de falhas da linha do tempo. Exportações de histórico
incluem `failure_category` em `failures[*]`. A v2 final grava essa
classificação quando registra a falha. Registros importados da v1 que não podem
ser classificados continuam visíveis como diagnósticos sem classificação.

## Novas tentativas de atividades {#activity-retries}

Para um orçamento compartilhado de tentativas entre workflows e filas, combine os limites de repetição com [admission do Server e breaker da aplicação](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Primeiras tentativas e repetições contam; a execução local/integrada tem outros limites.

O padrão de `Workflow\V2\Activity` é `$tries = 1`. Assim, uma falha é
entregue ao workflow imediatamente, a menos que a atividade configure mais
tentativas.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

No código do workflow, limite o tempo total da atividade, incluindo as esperas na fila e entre tentativas:

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

Juntas, essas configurações permitem no máximo três tentativas, com intervalos de 5 e 30 segundos, dentro do prazo original de 120 segundos de schedule-to-close. Se o prazo do workflow vencer antes, ele também se aplica. Habilite novas tentativas apenas para operações que possam ser repetidas com segurança e proteja os efeitos externos com controles de idempotência.

Quando uma atividade que permite novas tentativas lança uma exceção antes de esgotar
`$tries`, o mecanismo encerra o registro atual de `activity_attempts` no
estado do runtime, devolve o registro de `activity_executions` a `pending`,
grava um evento tipado `ActivityRetryScheduled` e cria uma nova tarefa durável.
O valor de `available_at` segue a política de `backoff()`. O workflow continua
aguardando a mesma execução de atividade. Ele só recebe a exceção quando falha
a última tentativa permitida.

A tarefa registra `retry_of_task_id`, `retry_after_attempt_id`,
`retry_after_attempt` e `retry_backoff_seconds` em seu payload, para que
Waterline explique o agendamento. Os detalhes da execução selecionada
reconstroem a tentativa com falha em `activities[*].attempts` a partir do
histórico tipado de atividades, mostram `ActivityRetryScheduled` na linha do
tempo e informam as contagens de novas tentativas em
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` e
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` interrompe a política de
novas tentativas. Uma exceção que implementa esse contrato faz a atividade
falhar imediatamente e retoma o workflow com a exceção.

### Resolução do atraso entre tentativas {#retry-delay-resolution}

Os valores de `backoff()` de uma atividade são segundos inteiros. Os intervalos
de novas tentativas duráveis têm resolução de um segundo. Não use uma fração como
`0.1` para pedir uma nova tentativa em 100 ms. As APIs dos SDKs que geram intervalos
a partir de valores fracionários os arredondam para cima, até o próximo segundo
inteiro. As referências dos SDKs Python e Rust descrevem os tipos de parâmetros
aceitos e suas conversões.

A próxima tentativa fica apta a começar após o atraso, mas a latência da fila e a
carga dos workers podem adiá-la ainda mais. Para testes rápidos, use
[tempo controlado ou casos limitados com atraso zero](./testing.md#keeping-delay-tests-fast).

### Identidade e idempotência da atividade {#activity-execution-identity-and-idempotency}

Uma nova tentativa não é o único motivo para observar a mesma atividade lógica
mais de uma vez. Expiração de lease, perda de worker, atraso no relato de
conclusão e reentrega podem produzir outra tentativa ou um relato de conclusão
obsoleto para a mesma execução durável.

- `activity_execution_id` identifica a atividade lógica ao longo de novas
  tentativas e reentregas. Use-o como chave padrão de idempotência de efeitos
  remotos.
- `activity_attempt_id` identifica uma tentativa específica. Use-o apenas
  quando o sistema de destino precisa distinguir as tentativas.
- Um relato tardio de conclusão ou falha de uma tentativa substituída é um
  comportamento normal de tentativa obsoleta. Não prova que o mecanismo
  confirmou a mesma tentativa duas vezes.

Ao investigar uma conclusão tardia após a expiração de um lease:

- consulte Waterline, a exportação de histórico ou a API do Server para saber
  qual tentativa venceu a disputa pelo resultado durável
- não presuma que a rejeição do relato tardio significa que o efeito remoto não
  aconteceu
- verifique o sistema externo pela chave de idempotência antes de forçar uma
  nova tentativa ou um reparo manual

O padrão mais seguro é tornar o efeito remoto idempotente por
`activity_execution_id` e usar o resultado durável para saber se o mecanismo
aceitou o relato daquela tentativa específica.

### Marcadores de falha permanente {#non-retryable-failure-markers}

Quando uma atividade ou workflow lança uma exceção que implementa
`Workflow\Exceptions\NonRetryableExceptionContract`, o mecanismo grava
`non_retryable = true` no registro `WorkflowFailure` e no payload do evento
tipado, como `ActivityFailed`, `WorkflowFailed` ou `UpdateCompleted`.
Esse marcador durável informa a operadores, workers externos e ferramentas que
a falha é permanente e que repetir a mesma operação não terá sucesso.

O marcador aparece em toda a camada de visibilidade:

- **Registros de falha:** coluna booleana `workflow_failures.non_retryable`.
- **Eventos de histórico:** campo `non_retryable` no payload tipado.
- **Snapshots de falha:** `non_retryable` em `FailureSnapshots::forRun()`.
- **Detalhes da execução:** `non_retryable` na lista de exceções.
- **Linha do tempo:** `non_retryable` nos metadados de detalhes da falha.
- **Exportações de histórico:** `non_retryable` em `failures[*]`.
- **Waterline:** marcador “non-retryable” ao lado da categoria de falha na tabela
  de exceções e na linha do tempo.
- **Integração de workers externos:** o payload do comando `complete()` aceita
  `non_retryable`. Workers externos podem informar falhas permanentes sem
  exigir que o processo do runtime resolva a classe da exceção.

Para falhas que não implementam o contrato, `non_retryable` é `false` por
padrão. A v2 final grava o marcador no momento da falha. Declare o contrato antes
de registrar a falha quando operadores ou SDKs precisarem distinguir falhas
permanentes das que permitem novas tentativas.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Novas tentativas do workflow inteiro {#workflow-level-retry}

Durable Workflow v2 **não** inicia automaticamente uma nova tentativa do
workflow inteiro. Quando uma execução falha por exceção não tratada, limite
estrutural ou timeout, seu estado é terminal. O mecanismo não inicia
automaticamente outra execução da mesma instância.

Essa é uma escolha de projeto:

- **Atividades já oferecem novas tentativas.** Políticas com `$tries`,
  `backoff()` e exceções permanentes tratam falhas transitórias na etapa
  apropriada.
- **O replay é o mecanismo de recuperação.** Se uma tarefa de workflow encontra
  uma falha transitória de infraestrutura, como erro de banco ou perda de
  worker, o sistema de tarefas duráveis despacha a tarefa novamente e retoma
  pelo histórico confirmado, sem criar outra execução.
- **Continue-as-new atende workflows longos.** Workflows que precisam renovar o
  estado ou compactar o histórico usam `continueAsNew()` como reinício
  explícito.
- **O reparo recupera execuções presas.** O comando `repair()` e o reparo
  automático no loop do worker recuperam execuções cujo transporte de tarefas
  duráveis foi perdido.
- **O redrive é uma ação explícita do operador.** O [redrive](#redrive) continua uma execução com falha em uma nova execução somente quando você solicita, e reutiliza os resultados das atividades concluídas.

Se sua aplicação precisa tentar novamente o workflow inteiro, modele esse
comportamento explicitamente:

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Limites do resumo de timeline do Core {#core-timeline-summary-bounds}

Workflow **2.12.0 ou posterior** limita o resumo derivado completo da timeline a 65.535 bytes UTF-8, incluindo rótulos, pontuação, marcador ` [truncated]` e eventual aviso de recuperação de callback. Preserva a falha registrada autoritativa, o tipo original e a decisão de não repetir. Confira o `composer.lock` real do runtime receptor. O [recibo do pacote instalado normalmente](https://github.com/durable-workflow/workflow/issues/915#issuecomment-6372539577) verifica os limites do resumo separadamente dos limites de reporte do SDK.

A margem de reporte de 62 KiB dos SDKs não corrige um escritor de resumos Core antigo. Uma falha de atividade grande demais é registrada de ponta a ponta ([.github#225](https://github.com/durable-workflow/.github/issues/225)) com PHP SDK 3.5.0, Python SDK 2.11.0 ou Rust SDK 4.10.1 contra o Server nativo 3.5.0 ou o Server PHP 2.11.3 ou posterior, e com Workflow 2.13.0 ou posterior no modo embutido. O modo embutido não tem limite de requisição, então o Workflow registra a falha inteira e o workflow a recebe com o tipo original e a mensagem completa. Uma mensagem além da capacidade `TEXT` do MySQL, ou que contenha um byte NUL, é mantida completa na coluna adicional `message_full`; `WorkflowFailure::message`, o histórico retido e as exportações de histórico retornam a mensagem completa, enquanto a coluna legada `workflow_failures.message` e as listas de falhas recentes guardam uma prévia limitada e rotulada. O Workflow 2.12.0 limita o resumo da timeline, o 2.12.2 adiciona o armazenamento da mensagem completa e a leitura no PostgreSQL de mensagens com NUL, e o 2.13.0 adiciona leitores limitados para diagnósticos de resultados recusados. Execute as migrações do pacote depois de atualizar; elas adicionam a coluna sem preencher as linhas existentes. O Server nativo 3.5.0 registra uma mensagem de falha acima de 64 KiB que versões anteriores recusavam com `503 storage_unavailable` no MySQL e no MariaDB: a linha da falha mantém uma prévia rotulada e o histórico retido carrega a falha completa. O Waterline 2.16.0 marca cada mensagem encurtada nos detalhes da execução. A [reparação datetime baseada no histórico](./features/search-attributes.md#repair-datetime-search-attributes) também exige Workflow 2.12.0 ou posterior realmente instalado. Repara linhas de busca derivadas, não gravações de timeline que falharam ou histórico autoritativo ausente.

## Limites de relatórios de falha PHP no modo de serviço {#php-failure-report-limits}

O SDK PHP **3.5.0 ou posterior** limita os relatórios de falha enviados no modo de serviço a mensagens UTF-8 de 62 KiB, pilhas de 128 KiB, 64 KiB de metadados opcionais combinados e um corpo completo codificado de 1 MiB, incluindo os marcadores. Limites de transporte conhecidos menores são respeitados. O [guia de relatórios PHP](./polyglot/php.md#bounded-failure-reports) explica a configuração, os diagnósticos de omissão, a semântica de novas tentativas preservada e a igualdade entre a primeira execução local e o replay a frio. Esses limites se aplicam aos relatórios do SDK. O registro embarcado e o armazenamento de resumos do Core mantêm contratos separados.

## Limites de relatórios de falha Python no modo de serviço {#python-failure-report-limits}

O SDK Python **2.11.0 ou posterior** limita os relatórios de falha enviados no modo de serviço a mensagens UTF-8 de 62 KiB, pilhas de 128 KiB, 64 KiB de metadados opcionais combinados e um corpo completo codificado de 1 MiB, incluindo os marcadores. Limites de transporte conhecidos menores são respeitados. O [guia de relatórios Python](./polyglot/python.md#bounded-failure-reports) explica a configuração, os diagnósticos de omissão, a semântica de novas tentativas preservada e a igualdade entre a primeira execução local e o replay a frio. Esses limites se aplicam aos relatórios do SDK. O registro embarcado e o armazenamento de resumos do Core mantêm contratos separados.

## Limites de relatos de falha Rust no modo serviço {#rust-failure-report-limits}

Em workers de serviço realmente executando Rust SDK **4.10.1 ou posterior**, mensagem enviada tem até 62 KiB UTF-8 com marcador, stack 128 KiB quando suportado, metadata opcional serializada combinada 64 KiB e corpo codificado completo 1 MiB ou limite de transporte conhecido menor. Tipo, retry e identidade permanecem; envelope obrigatório impossível é recusado. A [guia Rust](./polyglot/rust.md#bounded-failure-reports) explica marcadores, details Avro inteiros e resultados locais. Não qualifica SDKs antigos, modo embedded nem a correção separada do armazenamento de resumo Core.

## Guias relacionados {#related-guides}

- [Garantias de execução e idempotência](./constraints/execution-guarantees.md)
  explica o contrato de replay, novas tentativas, expiração de leases e
  reentrega que orienta todos os caminhos de recuperação desta página.
- [Monitoramento](./monitoring.md) mostra onde Waterline, exportação de histórico,
  logs de workers e telemetria do runtime expõem as informações de falha.
