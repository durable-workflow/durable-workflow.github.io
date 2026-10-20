---
sidebar_position: 9
---

# Workflows filhos {#child-workflows}

A implementação atual de `Workflow\V2` oferece workflows filhos duráveis por chamadas sequenciais a `child()` e por barreiras de convergência `all([...])`, que podem conter apenas filhos, misturá-los com atividades ou ficar aninhadas em grupos `all([...])` maiores. Juntas, essas opções dão a um workflow pai uma forma durável de agendar um ou mais subworkflows e esperar seus resultados sem manter vivo o processo do pai.

Uma execução filha continua sendo uma execução normal de workflow, com seu próprio ID de instância e ID de execução. O que a torna filha é o vínculo durável com a execução pai e um `child_call_id` estável emitido pelo pai para essa invocação.

```php
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $child = child(ChildWorkflow::class, $name);

        return [
            'parent_workflow_id' => $this->workflowId(),
            'parent_run_id' => $this->runId(),
            'child' => $child,
        ];
    }
}
```

## Comportamento atual {#current-behavior}

- Importe o helper com `use function Workflow\V2\child;` e chame `child(ChildWorkflow::class, ...)`. A chamada suspende o pai, cria uma execução filha durável e retorna o resultado dela quando é encerrada.
- Um filho que falha lança uma exceção no pai; um filho bem-sucedido retorna sua saída. Cancelamento e término aparecem como tipos distintos de exceção.
- `$this->child()` retorna o handle de filho mais recente; `$this->children()` retorna todos os handles na ordem das etapas do workflow. Handles expõem `id()`, `runId()`, `callId()` e helpers de sinal, como `signal()` e `signalWithArguments()`.
- Se um filho usar `continueAsNew()`, o pai acompanha a execução mais recente de forma transparente: `runId()` avança enquanto `id()` permanece estável.
- `all()` pode combinar closures `fn () => child(...)` e `fn () => activity(...)` em uma barreira. O pai desperta na primeira falha de filho, mas espera todas as ramificações bem-sucedidas encerrarem antes de retomar.

## Barreira de filhos paralelos {#parallel-child-barrier}

Importe os helpers com `use function Workflow\V2\all;` e `use function Workflow\V2\child;` quando quiser que uma etapa do pai espere vários workflows filhos em conjunto.

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $children = all([
            fn () => child(FirstChildWorkflow::class),
            fn () => child(SecondChildWorkflow::class),
        ]);

        return $children;
    }
}
```

Essa forma contendo apenas filhos continua útil quando cada membro paralelo é um workflow filho:

- espera o grupo inteiro de filhos como uma etapa do pai
- preserva a ordem original do array nos resultados retornados
- propaga ao corpo do workflow pai o encerramento malsucedido selecionado de um filho, usando o mesmo desempate por horário de encerramento mais antigo e menor índice

Se precisar combinar workflows filhos e atividades na mesma etapa de convergência, use uma barreira mista `all([...])`. As esperas por filhos e por atividades compartilham o mesmo `parallel_group_id`, e o Waterline identifica essa barreira compartilhada como `parallel_group_kind = mixed`. Se um subgrupo misto ou apenas de filhos estiver dentro de um `all([...])` maior, o grupo mais interno ainda determina `parallel_group_id`, enquanto `parallel_group_path` preserva o caminho completo do grupo externo ao interno.

## Contrato de identidade {#identity-contract}

- `child()->id()` e o `target_name` do Waterline referem-se ao ID da instância do workflow filho, estável ao longo da cadeia de execuções dessa instância.
- `child_call_id` refere-se à própria invocação emitida pelo pai, que permanece estável mesmo se o filho usar `continueAsNew()` depois.
- `resume_source_id`, `child_workflow_run_id` e rotas de execução selecionada referem-se a uma execução filha concreta nessa cadeia de invocação.

## Handles de filhos {#child-handles}

Depois que o pai alcança uma etapa de filho de forma durável, o workflow pode inspecionar essa invocação por um `ChildWorkflowHandle`.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\child;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle()
    {
        return child(ApprovalWorkflow::class);
    }

    #[UpdateMethod('approve-child')]
    public function approveChild(string $approvedBy): void
    {
        $this->child()?->signal('approved-by', $approvedBy);
    }
}
```

- `$this->child()` retorna o handle de filho visível mais recente ou `null`.
- `$this->children()` retorna todos os handles visíveis na ordem das etapas do workflow.
- Durante barreiras `all([fn () => child(...)])`, esses handles aparecem na mesma ordem das chamadas de filhos dentro da barreira, e `$this->child()` retorna o último visível.
- O `runId()` de um handle acompanha o `ChildRunStarted` mais recente registrado pelo pai nessa cadeia de invocação. Assim, um pai esperando um filho que usou `continueAsNew()` ainda vê o ID mais recente da execução filha, sem perder o `callId()` original.

## Disponibilidade dos handles {#handle-availability}

Handles de filhos são respaldados pelo histórico, sem especulação:

- Antes de o pai alcançar uma etapa de filho de forma durável, `$this->child()` retorna `null` e `$this->children()` retorna uma lista vazia.
- Depois que o pai registra no histórico o agendamento ou início do filho nessa etapa, o handle fica visível para consultas, atualizações e replays posteriores do workflow.
- O replay para consulta nunca envia sinais a filhos a partir de atualizações registradas. Apenas restaura o estado em memória derivado do histórico confirmado.

## Visibilidade no Waterline {#waterline-visibility}

Quando o pai está bloqueado em um filho, o Waterline apresenta uma espera por filho, em vez de um tipo separado de tarefa. Isso significa:

- o resumo da execução pai informa `wait_kind = child` e `liveness_state = waiting_for_child`
- `waits` inclui `kind = child`, o `child_call_id` estável, o ID da instância do workflow filho em `target_name` e o ID da execução filha em `resume_source_id`
- quando várias esperas por filhos estão abertas ao mesmo tempo, os detalhes também expõem `open_wait_count`
- esperas por filhos criadas por uma barreira `all([...])` mista ou apenas de filhos compartilham `parallel_group_id` e expõem `parallel_group_kind`, `parallel_group_base_sequence`, `parallel_group_size` e `parallel_group_index`
- esperas aninhadas por filhos também expõem `parallel_group_path`, ordenado da barreira envolvente mais externa à mais interna
- `timeline` inclui eventos tipados de filhos, como `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted` e `ChildRunFailed`, com o mesmo `child_call_id` estável
- esperas abertas por filhos e a linhagem agora priorizam o histórico tipado `ChildWorkflowScheduled` / `ChildRunStarted` do pai, mantêm uma entrada lógica de filho por `child_call_id` estável e acompanham a execução filha mais recente registrada pelo pai, mesmo que linhas copiadas de `workflow_links` desapareçam ou o `current_run_id` mutável da instância filha divirja após a confirmação do histórico
- depois que o pai registra um evento tipado de resolução do filho, os detalhes da execução selecionada mantêm essa espera resolvida com base no histórico do pai, mesmo se a linha mutável da execução filha divergir depois. O histórico terminal do filho ou dados legados de vínculos podem enriquecer a linhagem e o diagnóstico, mas não substituem histórico tipado ausente da etapa de filho no pai para replay
- quando esse evento tipado de resolução existe, a linhagem da execução selecionada e a exportação de histórico também mantêm tipo e classe do workflow filho, número da execução, grupo de status e motivo do encerramento a partir do histórico do pai, sem reler a linha mutável da execução filha para esses campos do filho resolvido
- se houver uma linha terminal de filho ou um vínculo, mas o pai não tiver histórico tipado `ChildWorkflowScheduled`, `ChildRunStarted`, `ChildRunCompleted`, `ChildRunFailed`, `ChildRunCancelled` ou `ChildRunTerminated` para essa etapa, o replay do worker e de consulta bloqueia com `history_shape_mismatch` e eventos registrados `no typed history`. O Waterline marca a espera selecionada como `status = unsupported`, expõe `history_authority = unsupported_terminal_without_history` e `history_unsupported_reason = terminal_child_link_without_typed_parent_history`, e apresenta a identidade do filho pela tarefa bloqueada ou pela linhagem alternativa, quando disponível
- se a linha da tarefa de workflow que retoma o pai for perdida após o evento de resolução do filho, os detalhes da execução selecionada continuam em `repair_needed` e expõem uma tarefa de workflow ausente sintética com `workflow_wait_kind = child`, `child_call_id` e `child_workflow_run_id`. O `repair()` manual, `workflow:v2:repair-pass` ou o reparo do loop de workers recria a mesma tarefa de resolução do filho a partir do histórico tipado do pai
- arrays de linhagem expõem a relação durável entre pai e filho junto com vínculos continue-as-new, e entradas de workflows filhos agora contêm o mesmo `child_call_id`

## Política de encerramento do pai {#parent-close-policy}

Quando um workflow pai encerra, seja por conclusão, falha, tempo limite, cancelamento ou término, cada workflow filho aberto é afetado conforme sua **política de encerramento do pai**. A política é definida por chamada de filho e controla o que acontece com ele quando a execução pai termina.

| Política | Valor | Comportamento |
|---|---|---|
| Abandonar | `abandon` | O filho continua executando de forma independente. É o padrão. |
| Solicitar cancelamento cooperativo | `request_cancellation` | O filho recebe uma solicitação de limpeza cooperativa com a linhagem e o prazo originais do cancelamento do pai. |
| Solicitar cancelamento imediato | `request_cancel` | Um comando de cancelamento é enviado ao filho quando o pai encerra. |
| Terminar | `terminate` | Um comando de término é enviado ao filho quando o pai encerra. |

### Política padrão {#default-policy}

Uma chamada `child()` sem `ChildWorkflowOptions` sempre executa sob `ParentClosePolicy::Abandon`. Os helpers compatíveis em código-fonte, `Workflow\V2\child()`, `Workflow\V2\Workflow::child()` e `Workflow\V2\Workflow::executeChildWorkflow()`, constroem as opções padrão quando o primeiro argumento não é um `ChildWorkflowOptions`, definindo `parentClosePolicy` como `ParentClosePolicy::Abandon`. O mesmo padrão vale para toda closure `child()` dentro de uma barreira `all([...])` que omita o argumento de opções. Sobrescreva o padrão passando um `ChildWorkflowOptions` explícito, como mostrado abaixo.

### Definição da política {#setting-the-policy}

Passe um `ChildWorkflowOptions` como primeiro argumento de `child()`:

```php
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        $options = new ChildWorkflowOptions(
            parentClosePolicy: ParentClosePolicy::RequestCancel,
        );

        return child(ChildWorkflow::class, $options, 'argument1');
    }
}
```

O mesmo padrão funciona com closures dentro de `all()` para barreiras paralelas:

```php
use function Workflow\V2\all;
use function Workflow\V2\child;
use Workflow\V2\Enums\ParentClosePolicy;
use Workflow\V2\Support\ChildWorkflowOptions;

$cancelOptions = new ChildWorkflowOptions(
    parentClosePolicy: ParentClosePolicy::RequestCancel,
);

$results = all([
    fn () => child(FirstChild::class, $cancelOptions),
    fn () => child(SecondChild::class, $cancelOptions, 'arg'),
]);
```

### Como funciona {#how-it-works}

- A política é registrada na linha de `workflow_links` (`parent_close_policy`) e no payload do evento de histórico `ChildWorkflowScheduled`.
- Quando a execução pai encerra por qualquer motivo, o mecanismo consulta vínculos abertos de filhos com uma política diferente de abandonar e envia o comando adequado (solicitar cancelamento cooperativo, cancelar ou terminar) a cada filho aberto.
- Se o filho já tiver encerrado quando a política for aplicada, nenhuma ação ocorre: o comando é ignorado silenciosamente.
- A aplicação da política é de melhor esforço: se um comando do filho for rejeitado, por exemplo porque ele já está terminal, o encerramento do pai não é afetado. Quando a aplicação tem sucesso, um evento `ParentClosePolicyApplied` é registrado no histórico da execução pai. Quando falha, registra-se `ParentClosePolicyFailed`, permitindo aos operadores distinguir a aplicação bem-sucedida de falhas silenciosas.
- Continue-as-new **não** aciona a política de encerramento do pai, pois a instância de workflow permanece ativa sob uma nova execução.

### Matriz de resultados do pai {#parent-disposition-matrix}

A política de encerramento do pai é acionada para todo resultado terminal do pai e permanece inativa para execuções ainda ativas ou transferidas para uma nova execução. O comportamento do mecanismo é o mesmo para todo resultado que torna o pai terminal: a política é aplicada a qualquer vínculo de filho ainda aberto cuja política não seja abandonar.

| Resultado do pai | Política aplicada? | Observações |
|---|---|---|
| Concluído | Sim | Aciona após o registro de `WorkflowCompleted`. Uma chamada sequencial `child()` sempre espera o filho, por isso uma conclusão natural normalmente não tem filhos abertos. O aplicador ainda é chamado como verificação de segurança. |
| Falhou | Sim | Aciona após o registro de `WorkflowFailed` para qualquer falha terminal de tarefa de workflow. |
| Tempo limite excedido | Sim | Aciona após o registro de `WorkflowTimedOut` em encerramentos por tempo limite de execução ou da cadeia de execuções. |
| Cancelado | Sim | Aciona depois que o comando aceito `CancelRequested` encerra a execução pai. |
| Terminado | Sim | Aciona depois que o comando aceito `TerminateRequested` encerra a execução pai. |
| Continue-as-new | Não | A instância de workflow permanece ativa sob a nova execução, por isso os vínculos existentes de filhos são redirecionados a ela, preservando a política original. |
| Reset | Não se aplica atualmente | O runtime v2 não expõe um comando independente de reset nem um resultado terminal de reset. Uma futura operação de reset ou reparo que encerre ou substitua uma execução pai deve definir se a titularidade dos filhos é transferida. Se a execução antiga se tornar terminal, deve aplicar a política de encerramento do pai antes de deixar de deter os filhos abertos. |

### Quando usar cada política {#when-to-use-each-policy}

**Abandonar** (padrão) é adequado quando filhos representam trabalho independente que deve concluir independentemente do destino do pai, como um workflow de notificação ou uma tarefa de limpeza que precisa terminar.

**Solicitar cancelamento cooperativo** usa `ParentClosePolicy::RequestCancellation` para limpeza cooperativa. Preserva a identidade raiz e o prazo imutável de uma solicitação de cancelamento existente do pai. Se o pai encerrar sem essa solicitação, a política registra um prazo compartilhado de limpeza de 600 segundos a partir do horário registrado de encerramento do pai. Aplicações repetidas não concedem mais tempo. Consulte [Cancelamento cooperativo](/docs/polyglot/cancellation) para conhecer a capacidade do worker no modo de serviço e o contrato de limpeza.

**Solicitar cancelamento imediato** aplica o comando terminal `cancel()` ao filho quando o pai encerra. Apesar do nome da política, ela não entrega a solicitação cooperativa separada `requestCancellation()`. O filho não pode executar limpeza ou compensação em código de workflow depois que essa política encerra sua execução. Conclua qualquer compensação necessária antes de encerrar o pai ou use **Abandonar** para trabalho de limpeza independente.

**Terminar** é adequado quando filhos precisam parar imediatamente. Use para filhos que sejam apenas auxiliares do pai e não tenham valor independente após seu encerramento.

### Visibilidade no Waterline {#waterline-visibility-1}

O Waterline mostra `parent_close_policy` em:

- a entrada do vínculo de filho na visão de linhagem da execução pai
- o payload da entrada `ChildWorkflowScheduled` na linha do tempo
- o evento de histórico `CancelRequested` ou `TerminateRequested` do filho quando a aplicação da política é acionada, com um motivo que identifica o encerramento do pai

## Limitações atuais {#current-limitations}

A interface atual não inclui:

- helpers integrados de concorrência limitada além das barreiras atuais `all([fn () => child(...)])`, `all([fn () => activity(...)])` e mistas `all([fn () => child(...), fn () => activity(...)])`

Em outras palavras, há suporte a handles duráveis de filhos para etapas já alcançadas, mas ainda não há APIs de nível superior para iniciar e obter handles ou limitar a concorrência além de `child(...)` e `all([...])` atuais.

## Execute este padrão {#run-this-pattern}

O workflow de coordenação de microsserviços no
[aplicativo de exemplo](/docs/sample-app) é a referência executável para
orquestração entre pai e filho através dos limites de aplicações:

```bash
php artisan app:microservice
```

`App\Workflows\Microservice\MicroserviceWorkflow` executa o pai na aplicação
Laravel principal e encaminha o trabalho dos filhos ao worker de microsserviço
incluído. Abra o Waterline durante a execução para ver os vínculos de filhos
preenchidos sob a execução pai, com a política de encerramento visível na
visão de linhagem exatamente como descrito nesta página.
