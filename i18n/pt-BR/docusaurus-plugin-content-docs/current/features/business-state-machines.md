---
sidebar_position: 12
title: Máquinas de estado de negócio
description: Protocolo experimental de transições para estados de negócio compartilhados, perfis de política específicos de cada integração, máquinas filhas aninhadas e compensação retida em workflows incorporados ao Laravel.
---

# Máquinas de estado de negócio {#business-state-machines}

:::warning Experimental

A API `Workflow\V2\StateMachine`, assim como o início confirmado de filho (`Workflow::startChild()`) e `DurableScope::reserveChild()` que ela usa, são experimentais. Eles são disponibilizados de forma experimental a partir do Workflow 2.29.0, não estão cobertos pelas garantias de estabilidade do pacote e podem mudar em um release secundário. Eles são uma superfície `experimental` segundo os [níveis de estabilidade](../compatibility.md#stability-levels). O restante da API de escopos de compensação retidos que ela usa é estável desde o Workflow 2.33.0. O catálogo de vinculações de filhos, as explicações de transição e `MachineInspection` foram adicionados no Workflow 2.41.0.

Os exemplos desta página são exemplos de código-fonte do repositório com provedores sintéticos. Eles não constituem qualificação de pacote instalado nem de provedor real. Nada nesta página implica:

- migração de uma execução em andamento para uma nova versão de definição, perfil, regra ou handler;
- máquinas filhas recursivas ou compartilhadas;
- garantias para qualquer provedor real de pagamento, transportadora ou armazém;
- que o recurso de máquinas de estado de negócio esteja completo ou tenha um release estável.

:::

Este guia aborda o protocolo opcional de transições de negócio para workflows incorporados ao Laravel que usam `Workflow\V2\Workflow`. Ele é construído a partir de primitivas existentes: atividades, workflows filhos, esperas duráveis, replay e compensação de [Saga](sagas.md). Os workflows existentes e `Workflow\States\StateMachine` permanecem inalterados.

## Quando usar {#when-to-use-it}

Use o protocolo quando os estados de negócio têm um único significado compartilhado, mas a forma de alcançá-los difere entre integrações:

- **Significados compartilhados da máquina.** Uma `MachineDefinition` declara os significados dos estados, as identidades das transições, uma invariante obrigatória e slots de filhos nomeados.
- **Políticas específicas de cada integração.** Cada `PolicyProfile` escolhe suas arestas, versões de handler e condições nomeadas dentro dessa definição. Uma integração pode exigir uma operação externa antes de uma transição; outra pode já fornecer a evidência e pular o trabalho.
- **Máquinas filhas aninhadas.** Um Order pode hospedar uma máquina Shipment enquanto está em um estado declarado. O vínculo mantém a identidade original do filho entre novas tentativas, mudanças de estado e reinícios de workers.
- **Decisões de negócio protegidas.** O novo estado de negócio é confirmado por meio de uma fronteira controlada pela aplicação, que verifica o estado esperado, a revisão e o cancelamento aceito.
- **Compensação retida.** Obrigações podem sobreviver à execução que as criou por meio de escopos de compensação retidos.

Se um único workflow com uma saga for suficiente, use diretamente [Sagas](sagas.md) e [Workflows filhos](child-workflows.md).

## O contrato de transição {#the-transition-contract}

Todo handler de transição implementa os mesmos quatro métodos, qualquer que seja a máquina ou a integração:

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` responde se o alvo já foi alcançado. É uma projeção pura da avaliação de alvo registrada.
- `canExecute()` responde se o trabalho é permitido. É uma projeção pura da avaliação de permissão registrada.
- `execute()` orquestra atividades registradas ou esperas duráveis e retorna um `ExecutionReceipt`. O recibo confirma o trabalho; ele não estabelece que a confirmação do estado pode ser feita.
- `compensate()` recebe a `ExecutionReference` original. Retorne somente depois que os efeitos exigidos, ou a ausência deles, forem verificados. Trabalho desconhecido ou pendente deve esperar ou falhar explicitamente, nunca retornar com sucesso.

Estenda `AssessedTransitionStep` para implementar as duas guardas diretamente a partir do snapshot registrado. O runner rejeita uma guarda personalizada que contradiga a avaliação registrada.

## Como o runner executa uma transição {#how-the-runner-executes-a-transition}

`TransitionRunner::run()` recebe o workflow, o perfil fixado, a `ExecutionReference` original, o evento, um `TransitionRuntime` e um registro fechado de handlers. Em seguida, ele:

1. Seleciona a aresta única para o evento e o estado de origem. Nenhuma candidata retorna `Unavailable`; várias retornam `Ambiguous`.
2. Solicita um snapshot `before` registrado e, quando o perfil tem uma definição, verifica sua invariante compartilhada. Uma invariante não satisfeita retorna `Blocked`; uma desconhecida retorna `Unknown`.
3. Verifica a guarda de alvo. Um alvo satisfeito pula o trabalho, mas ainda passa pela confirmação protegida; pular não assume a propriedade de efeitos externos que já existem. Um alvo desconhecido retorna `Unknown`.
4. Retorna `Pending` quando a aresta não declara trabalho. Caso contrário, verifica a guarda de execução e registra a admissão ao vivo. Uma recusa retorna `Blocked`; uma resposta desconhecida retorna `Unknown`.
5. Registra a compensação da etapa original com a Saga nativa e então chama `execute()`.
6. Solicita um novo snapshot `after` e verifica novamente a invariante e o alvo. Um estado de origem ou uma revisão desatualizados retornam `Conflict`, um resultado não satisfeito retorna `Pending` e um desconhecido retorna `Unknown`. Um alvo satisfeito segue para a confirmação protegida.
7. Confirma por meio do runtime, que informa `Committed`, `Conflict` ou `CancellationRequested`.

Os valores de `TransitionStatus` são resultados de processamento, não o seu catálogo de estados de negócio. O runner nunca tenta novamente uma transição inteira e nunca compensa por conta própria uma transição bloqueada. A aplicação decide se deve esperar, tentar novamente, reconciliar ou compensar. Um resultado não é permissão para fechar o workflow proprietário: mantenha-o aberto enquanto restarem trabalho de avanço ou obrigações de compensação.

`ActivityTransitionRuntime` implementa `TransitionRuntime` com três atividades da aplicação (snapshot, admissão e confirmação) e uma `MachineDefinition` opcional. Ele usa o histórico comum de atividades e não adiciona nenhum comando de worker nem evento de histórico. No exemplo configurado de Order/Shipment, toda transição passa pela mesma chamada ao runner:

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

As três classes de atividade são código da aplicação, não classes do pacote.

## Definições, perfis e versões {#definitions-profiles-and-versions}

Uma `MachineDefinition` contém o que todas as integrações compartilham. A definição da versão dois do exemplo declara quatro estados, as identidades das transições, uma regra de invariante e o slot de filho Shipment:

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` associa a essa definição as arestas `TransitionDefinition` e as condições nomeadas de uma integração. Um perfil não pode adicionar um estado ou uma identidade de transição não declarados, e condições nomeadas do perfil não podem substituir a invariante compartilhada.

O versionamento segue estas regras:

- **Fingerprints.** O fingerprint da definição abrange os significados dos estados, a invariante e as declarações de slots. O fingerprint do perfil abrange os metadados da definição e do perfil, o grafo, as estruturas das condições, as versões de handler e quaisquer limites. Nenhum dos dois calcula hash das implementações em PHP.
- **Execuções fixadas.** Uma `ExecutionReference` fixa o escopo, o sujeito de negócio, o ID da execução, o fingerprint da política, o estado de origem esperado e a revisão. Registre o fingerprint selecionado antes de o trabalho começar e forneça-o novamente no replay. Nunca o calcule a partir da configuração mais recente ao retomar.
- **Somente novas execuções.** Uma nova versão de definição ou de perfil é selecionada para novas execuções. Reescrever a atribuição de um sujeito em execução altera seu fingerprint, e a execução original passa então a recusar. Não há API de migração de execuções em andamento.
- **Implementações retidas.** Mantenha implantadas as definições, regras, handlers e versões de autorização antigos enquanto suas execuções ou obrigações retidas continuarem recuperáveis. Os handlers vêm de um registro fechado de tipo/versão indexado por `TransitionDefinition::handlerKey()`. Dados armazenados não podem selecionar uma classe PHP, e um handler ausente falha antes de qualquer E/S da aplicação.

Consulte [Versionamento](versioning.md) para as regras gerais de alteração do código de workflows.

## Regras, condições e fatos registrados {#rules-conditions-and-recorded-facts}

A configuração seleciona condições; as implementações de regras continuam sendo código confiável da aplicação. Um `RuleRegistry` construído no bootstrap confiável mapeia um tipo e uma versão de regra para um objeto `ConditionRule`. Uma `RuleReference` fixa o tipo, a versão e os parâmetros, e `ConditionDefinition::rule()`, `all()`, `any()` e `not()` combinam essas folhas. Uma condição tem no máximo 64 nós.

As decisões têm três valores: `Verdict::Satisfied`, `Verdict::Unsatisfied` e `Verdict::Unknown`. Em `all()`, um filho não satisfeito torna o grupo não satisfeito; caso contrário, um filho desconhecido o torna desconhecido. Em `any()`, um filho satisfeito torna o grupo satisfeito; caso contrário, um filho desconhecido o torna desconhecido. A negação de desconhecido continua desconhecida.

Os fatos são coletados somente na atividade de snapshot registrada. O `AssessmentStore` do exemplo registra os fatos com referências de evidência e avalia as condições de alvo e de permissão do perfil:

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

Quando o perfil tem uma definição, a mesma atividade avalia `MachineDefinition::assess()` e retorna `MachineAssessment::fromEvaluation()` como o `machineAssessment` do snapshot. Retenha a explicação completa de `ConditionEvaluation::toArray()` junto com o snapshot. Uma avaliação ausente, uma definição alterada ou uma condição alterada causa recusa antes do trabalho. Uma avaliação registrada é evidência do host, não autorização: a confirmação protegida ainda precisa verificar a autoridade ao vivo, a revisão e o cancelamento.

## Replay determinístico {#deterministic-replay}

O protocolo depende do histórico registrado, portanto as [restrições de workflow](../constraints/workflow-constraints.md) habituais se aplicam estritamente:

- Guardas e regras não fazem E/S. Elas não leem o banco de dados, a configuração, um provedor nem o contêiner.
- Leituras ao vivo acontecem dentro da atividade de snapshot. No replay, atividades concluídas retornam seus resultados registrados; as regras não são reavaliadas com dados ao vivo.
- Um snapshot `after` deve usar um ID de snapshot diferente e fatos coletados novamente. `SnapshotPhase` separa as evidências de `before`, `after` e `compensation`, de modo que uma fase não pode substituir outra.
- `execute()` e `compensate()` chamam atividades. Envolva um provedor síncrono ou um handler da aplicação em uma atividade; chamá-lo diretamente do código do workflow pode repetir seus efeitos durante o replay.
- A admissão registra apenas autoridade e permissão. Ela não deve executar o efeito de negócio de avanço antes do registro na Saga.
- Use `TransitionResult::toArray()` nas fronteiras entre workflow e histórico. Os objetos de domínio da aplicação ficam por trás dos adaptadores da sua etapa e do seu runtime.

## Confirmações de negócio protegidas {#protected-business-commits}

A atividade de confirmação é a autoridade de negócio da aplicação. Ela deve:

1. Vincular o ID da decisão ao seu escopo, sujeito, política, transição e conteúdo. Uma duplicata exata retorna o resultado registrado; reutilizar o ID para outro conteúdo causa recusa.
2. Verificar novamente a autoridade ao vivo, o estado de origem e a revisão esperados e qualquer cancelamento aceito, sob o lock autoritativo da aplicação.
3. Registrar atomicamente o estado de negócio, a decisão e qualquer intenção de publicação quando eles compartilham um armazenamento.
4. Após uma confirmação de recebimento perdida, consultar ou tentar novamente essa decisão exata em vez de repetir efeitos.

Ela retorna um `CommitResult` com `committed`, `conflict` ou `cancellation_requested`. O último status significa que um cancelamento aceito impediu esta confirmação. Ele não significa que a compensação terminou nem que a entidade de negócio está cancelada. Não está implícita nenhuma transação distribuída entre o armazenamento da aplicação e o Durable Workflow.

## Máquinas filhas vinculadas a estados do pai {#child-machines-bound-to-parent-states}

Um `ChildSlot` na definição do pai nomeia o slot, seus estados hospedeiros, a máquina filha e a versão da definição, e o resultado de negócio exigido. `MachineDefinition::assertBinding()` verifica um vínculo em relação a essa declaração. Ele não faz consulta, autorização nem admissão.

Um `BindingIdentity` fixa a execução pai original, o namespace, a instância e a execução do pai, o slot, a **geração**, o estado hospedeiro, o tipo de workflow filho, o fingerprint da política do filho, o resultado exigido, o fingerprint da entrada e as opções do filho. A geração identifica uma entrada em um estado. Solicitações para uma geração antiga nunca são redirecionadas para um filho mais novo depois que o pai muda de estado ou reentra em um estado.

Iniciar e aguardar um filho são transições separadas:

- **Início.** O pai reserva e admite o filho, registra o vínculo exato e só então confirma o estado hospedeiro. Se o vínculo já estiver registrado, a etapa o reutiliza em vez de iniciar novamente. Com escopos retidos, `DurableScope::reserveChild()` retorna uma `ChildReservation`, e `ChildReservation::start()` usa o início nativo confirmado do filho. Mais tarde, `ChildReservationStore::close()` retorna o `ChildBinding` admitido ou um `NeverAdmittedChild` permanente.
- **Espera.** Uma transição posterior observa essa mesma admissão. Ela não cria um segundo filho nem um segundo proprietário de compensação.

A etapa compartilhada do exemplo mostra as duas transições:

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

Sem uma reserva, `Workflow::startChild()` retorna um recibo `StartedChildWorkflow` que uma etapa posterior pode aguardar com `await()`. O pai deve verificar o resultado de negócio do filho; a conclusão técnica do filho, um sinal aceito ou um tempo limite não bastam. `Workflow::startChild()` é exclusivo do modo incorporado; a execução pelo protocolo de workers o recusa.

### Catálogo de vinculações de filhos {#child-binding-catalog}

A partir do Workflow 2.41.0, um `MachineCatalog` registra as definições que podem hospedar umas às outras. A construção resolve cada slot para uma `machine@version` registrada e recusa um grafo inválido antes que qualquer vinculação o use:

```php
$catalog = new MachineCatalog([$orders, $returns, $shipments], maxChildDepth: 1);

$catalog->child($orders, 'shipment');
$catalog->assertBinding($parentProfile, $binding, $childProfile);
```

- Uma versão de máquina duplicada, um slot que nomeia um filho não registrado e uma vinculação recursiva ou cíclica lançam `InvalidMachineCatalog`. Seu `reason` é `state_machine_definition_duplicate`, `state_machine_child_definition_unregistered` ou `state_machine_child_binding_cycle`. Uma máquina que hospeda a si mesma, diretamente, por meio de outras máquinas ou em outra versão, é um ciclo.
- `InvalidMachineCatalog::$path` lista a rota, que a mensagem imprime como `orders@1 -> shipment:shipments@1 -> parent:orders@1`.
- O `maxChildDepth` opcional lança `ResourceLimitExceeded` com a dimensão `child_depth` quando a rota de slots mais profunda é maior; `observed` informa essa profundidade. A compensação retida oferece suporte a um nível de filhos, então use `maxChildDepth: 1` quando filhos participarem de escopos retidos.
- Vários pais ou estados hospedeiros podem compartilhar uma definição de filho.
- `$catalog->assertBinding()` também exige que os dois perfis usem exatamente as definições registradas, comparadas por impressão digital.

O catálogo é opcional. O início nativo de filhos, as reservas e `MachineDefinition::assertBinding()` não o consultam, então chame `$catalog->assertBinding()` na autorização de vinculação do host, como faz o exemplo configurado. Um catálogo é configuração: cada execução continua fixando suas próprias impressões digitais, e substituir o catálogo não migra nada.

## Compensação e escopos retidos {#compensation-and-retained-scopes}

O runner registra a etapa original com a Saga nativa antes que `execute()` possa suspender ou falhar. O callback captura a execução e a etapa originais, não o recibo. Durante a compensação, o runner solicita um novo snapshot `compensation` e chama `compensate()` com a execução original. Use a compensação sequencial padrão.

Um callback de Saga local a uma execução termina com essa execução. Os escopos de compensação retidos (`Workflow\V2\Compensation`) mantêm cada obrigação em um registro durável, de modo que ela possa ser compensada depois que a execução de origem for fechada. O [guia de escopos de compensação](./compensation-scopes.md) descreve essa API e quais partes dela são estáveis. Nos exemplos, cada efeito externo é registrado como uma `Obligation` por meio de `DurableScope::execute()` antes de ser despachado, e um escopo filho é verificado antes que efeitos anteriores do pai sejam desfeitos. A compensação da própria etapa verifica então apenas as obrigações originais dela:

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

O cancelamento de negócio é uma decisão separada. Nos exemplos, uma transição somente de comprovação confirma `cancelled` apenas depois que o escopo retido é verificado. Um cancelamento técnico, uma solicitação de recuperação enfileirada ou uma compensação que falhou não o estabelece. O grafo retido atual tem um nível de pai/filho, no máximo 16 filhos e 256 obrigações por escopo. A propriedade de avanço da raiz e do filho não é transferida para sucessores de continue-as-new ou de redrive, e a liberação da retenção continua explícita.

## Orçamentos e resultados explícitos {#budgets-and-explicit-outcomes}

Uma configuração confiável pode limitar uma máquina:

- `DefinitionLimits` (`states`, `transitions`, `childSlots`, `ruleNodes`) é passado para `MachineDefinition` como `limits:`. Cada perfil vinculado também verifica suas arestas de origem expandidas e o total de nós de condição.
- `ExecutionLimits` (`commands`, `historyEvents`, `historyBytes`, `groupDepth`) é associado com `PolicyProfile::withLimits()` ou com o argumento `limits:` de `PolicyProfile::forDefinition()`. O orçamento de comandos abrange toda suspensão durável dentro de `TransitionRunner`, até 4.096 comandos e 64 níveis de grupo. Os valores de histórico são limiares de admissão medidos com `Workflow::historyBudgetAtStep()` antes de cada comando, não tetos absolutos.

Os dois limites entram em seus fingerprints. Omiti-los mantém os fingerprints anteriores; adicionar ou alterar um orçamento exige uma versão selecionada explicitamente para novas execuções.

Um orçamento atingido durante a execução retorna `TransitionStatus::Blocked` com o motivo `state_machine_<dimension>_limit_exceeded`. Uma definição inválida lança `ResourceLimitExceeded` com a dimensão, a contagem observada e o limite antes que qualquer handler seja executado. Nenhum dos dois resultados significa que o cancelamento teve sucesso ou que um efeito externo anterior não aconteceu. `Workflow::compensate()` é executado fora dos orçamentos de avanço.

## Diagnóstico {#diagnostics}

- `TransitionResult::toArray()` retorna a execução, o status, o motivo, a avaliação e a chave da transição.
- A partir do 2.41.0, `TransitionResult::explain()` também nomeia a `TransitionStage` que produziu o resultado e o snapshot registrado e a fase que essa verificação avaliou. `toArray()` não muda.
- `ConditionEvaluation::toArray()` mantém o fingerprint da estrutura, o ID do snapshot, as versões das regras, os motivos, as referências de evidência e os fatos ausentes.
- `MachineAssessment::toArray()` registra a decisão da invariante vinculada à definição e ao snapshot.
- `ResourceLimitExceeded` expõe `dimension`, `observed` e `limit`.
- `ScopeRecovery::describe()` informa o estado de um escopo retido, incluindo quando é necessária uma nova solicitação de cancelamento autorizada.

O estágio distingue resultados com o mesmo status:

| Estágio | Status | Significado |
| --- | --- | --- |
| `selection` | `unavailable`, `ambiguous` | Não há uma aresta única para o evento e a origem. Sem snapshot. |
| `source` | `conflict` | O estado ou a revisão do snapshot difere da origem esperada. |
| `invariant` | `blocked`, `unknown` | O invariante compartilhado recusou, antes ou depois do trabalho. |
| `target` | `pending`, `unknown` | O alvo era desconhecido, não tinha trabalho declarado ou continuou insatisfeito depois do trabalho. |
| `permission` | `blocked`, `unknown` | A guarda de execução recusou. |
| `admission` | `blocked`, `unknown` | A admissão ao vivo registrada recusou. |
| `budget` | `blocked` | Um orçamento de avanço recusou o próximo comando. Sem snapshot. |
| `commit` | `committed`, `conflict`, `cancellation_requested` | O commit protegido confirmou a decisão. |

Para os estágios `invariant`, `target` e `permission`, o ID do snapshot encontra a `ConditionEvaluation` que o host reteve para esse snapshot. Para `admission` e `commit`, o motivo vem da admissão ou do commit registrados, e o snapshot apenas identifica a evidência usada. Uma recusa depois do trabalho nomeia o snapshot `after`. Resultados que o código da aplicação constrói sem estágio mantêm `stage` e `snapshot` como null.

`MachineInspection` oferece às ferramentas de operação uma visão versionada de um sujeito de negócio. O host a constrói fora do código do workflow a partir de valores que já autorizou:

```php
$inspection = new MachineInspection(
    $profile, $state, $revision, $execution, $result,
    [$childBinding, $childReservation, $neverAdmittedChild],
    [['scope' => $scopeIdentity, 'description' => $scopeRecovery->describe($scopeIdentity, $principal)]],
);
$view = $inspection->toArray();
```

- `machine` contém as versões fixadas da máquina, da definição e do perfil com suas impressões digitais. `business` é o estado e a revisão atuais do armazenamento da aplicação, distintos do status da execução do workflow. `transition` é o `explain()` do `TransitionResult` da execução inspecionada, ou null quando nenhum é passado.
- `children` tem uma entrada por geração de vinculação, então pode ser mais curta do que a lista passada. Cada entrada tem um `status` (`admitted`, `never_admitted` ou `reserved`), a chave de vinculação, o slot, a geração, o estado hospedeiro, o tipo de workflow filho, o resultado exigido, a execução pai que criou a vinculação, a instância e a execução filhas e um ID de fechamento. Um filho admitido não é evidência do seu resultado de negócio.
- `participation` liga um filho aos IDs dos seus escopos pai e filho retidos e à chave da obrigação, que se juntam ao `scopeId` das entradas de `compensation`. Passe a `ChildReservation` de um filho admitido ao lado do seu `ChildBinding`. Um `participation` nulo significa que o filho não tem participação retida ou que nenhuma reserva foi passada.
- `compensation` lista a identidade e o ID de cada escopo com as chaves de `ScopeRecovery::describe()`.

A construção recusa um estado não declarado, uma execução com outro perfil, uma transição de outra execução, trabalho de filhos de outro sujeito ou perfil, gerações contraditórias ou repetidas, escopos repetidos e descrições de escopo malformadas. Ela não faz E/S e não autoriza nada. As chaves de escopo são definidas pela aplicação, então o host associa os escopos raiz ao sujeito.

## Exemplos executáveis {#runnable-examples}

Os exemplos ficam no repositório do workflow e são executados com as dependências de desenvolvimento e o banco de dados de teste dele. Eles usam suas próprias tabelas descartáveis da aplicação, não migrações do pacote.

| Exemplo | O que demonstra |
| --- | --- |
| [Order e Shipment configurados](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | Dois perfis de integração, `prepare` e `imported`, com os mesmos estados e uma etapa compartilhada. A preparação hospeda Shipment em `working`; a importação o hospeda em `received`. Uma aresta `reconcile` somente de comprovação pula o trabalho quando existe evidência. A versão dois adiciona definições compartilhadas para novos sujeitos, enquanto a versão um permanece fixada. Inclui reserva de filho, compensação retida e finalização do cancelamento. |
| [Order, Payment e Shipment com provedor](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | Três máquinas no mesmo protocolo com um diário de provedor sintético. As receitas abrangem checkout com reserva primeiro e com pagamento primeiro, resultados de reembolso, autorização e captura após estoque ou entrega, financiamento por banco, COD, adiantamento e saldo e assinatura, leases de Cart, dinheiro em unidades, estoque parcial, devoluções, trocas, incidentes de transportadora e recuperação após perda de worker. |
| [Decisões de negócio em SQL](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | Uma confirmação protegida controlada pela aplicação com fencing em SQL para cancelamento, conflitos de revisão, revogação de autoridade, intenção de publicação e confirmações de recebimento perdidas, além de compensação nativa aninhada de Order e Shipment. |

Execute os testes do exemplo configurado a partir do repositório do workflow:

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

Os três usam provedores sintéticos ou no mesmo banco de dados. Eles não qualificam uma transportadora, um provedor de pagamento ou um armazém reais, uma atualização de pacote instalado nem a migração de execuções em andamento. Uma integração real deve fornecer sua própria idempotência, fencing e reconciliação de resultados incertos.

A [referência de máquinas de estado de negócio](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md) do repositório do motor documenta o contrato completo, incluindo os formatos de payload das atividades. O status da entrega é acompanhado em [durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069).
