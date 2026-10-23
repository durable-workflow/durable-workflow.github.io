---
sidebar_position: 15
---

# Versionamento {#versioning}

## Replay antes de trocar builds {#replay-before-changing-builds}

Antes de promover um candidato, reproduza históricos representativos abertos e encerrados recentemente usando seu código exato. Antes de reverter, reproduza os históricos escritos pelo build novo com o artefato antigo. Siga a [verificação de replay](../testing.md#replay-before-deployment); uma coorte de roteamento compatível ou uma verificação de integridade aprovada não comprova, por si só, compatibilidade de replay.

Como workflows podem executar por longos períodos, às vezes meses ou anos, é comum precisar alterar uma definição de workflow enquanto execuções ainda estão em andamento. Sem versionamento, modificar código que afeta o caminho de execução causaria erros de não determinismo no replay.

O helper `getVersion()` permite introduzir mudanças com segurança em workflows em execução, criando pontos de ramificação versionados.

## Evolução dos argumentos de entrada registrados {#evolving-recorded-entry-arguments}

Uma execução mantém os argumentos registrados quando foi iniciada. Implantar uma nova definição não reescreve essa entrada. No replay, o runtime associa esses valores ao método de entrada atual **antes de executar qualquer código no corpo desse método**. Uma ramificação `getVersion()` ou `patched()` dentro do corpo não consegue recuperar uma assinatura incompatível: primeiro é preciso conseguir entrar no método.

Mantenha os argumentos posicionais existentes na mesma ordem e aceite seus tipos registrados. Um valor padrão do PHP preenche um argumento omitido; não substitui um valor incompatível já registrado naquela posição. Por exemplo, uma execução iniciada com `[7]` continua fornecendo o inteiro `7` após a implantação:

| Mudança na entrada | Efeito sobre a entrada registrada `[7]` |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | O argumento antigo continua compatível; o novo argumento final pode usar o valor padrão. Preserve também a compatibilidade dos comandos reproduzidos. |
| Adicionar um argumento final obrigatório sem valor padrão | A execução antiga não tem um valor para ele. |
| Inserir, remover ou reordenar argumentos iniciais | Valores existentes podem ir para o parâmetro errado. Não suponha que nomes de parâmetros iguais corrijam uma entrada posicional. |
| Mudar `int $amount` para `string $amount` | O inteiro registrado não se tornou uma string. |
| Mudar `int $amount` para `PaymentRequest $request` | Injeção de dependências não é migração de entrada. Um DTO recém-construído não deve substituir o valor registrado pelos padrões do construtor. |
| Remover apenas um parâmetro final | O PHP pode aceitar a chamada, mas verifique se descartar seu significado não altera os comandos reproduzidos nem o comportamento de negócio. |

Prefira adicionar um parâmetro final opcional ou criar outro tipo de workflow para um contrato de entrada diferente. Se precisar de um novo DTO internamente, construa-o explicitamente com argumentos registrados compatíveis **dentro** do corpo do workflow e versione ali qualquer mudança nos comandos duráveis. Preserve código capaz de reproduzir cada formato de entrada suportado enquanto essas execuções precisarem dele. Teste as entradas realmente armazenadas contra a nova definição, incluindo um replay a frio após uma espera durável; testar apenas novas execuções não cobre esse limite de implantação.

### Comportamento do Workflow 2.7.2 {#released-embedded-entry-behavior}

No Workflow **2.7.2**, um erro na quantidade ou no tipo dos argumentos de entrada pode se tornar um evento terminal `WorkflowFailed`. Alguns erros de resolução de dependências deixam a execução aberta com uma tarefa que falha repetidamente. Trocar um escalar por um DTO injetado com valores padrão no construtor pode até executar o workflow com dados errados. Esses são defeitos do produto registrados em [Workflow #866](https://github.com/durable-workflow/workflow/issues/866), não uma estratégia segura de versionamento.

Restaurar código compatível pode recuperar uma execução aberta que possa ser entregue novamente, mas não reabre uma que já ficou terminal. Nem `repair()` nem uma nova ramificação de versão prometem reativar esse original com falha. Primeiro inspecione seu estado e sua falha reais; preserve a entrada e o histórico enquanto decide a recuperação.

### Proteção embutida publicada {#embedded-entry-argument-safeguard}

Workflow **2.7.3** valida os argumentos registrados antes de entrar no código da aplicação. Uma associação incompatível produz uma `WorkflowEntryArgumentsMismatchException` tipada e uma **tarefa de workflow** com replay bloqueado, com `replay_blocked_reason = workflow_entry_arguments_mismatch`; a **execução permanece não terminal**. Os campos de diagnóstico identificam workflow, método de entrada, parâmetro e tipos esperado e real sem copiar valores dos argumentos. Um novo DTO injetado que descartaria a entrada registrada também é recusado. Verifique o pacote Workflow realmente instalado na aplicação embutida. Essa proteção não reabre execuções terminais criadas por uma versão anterior.

Com essa proteção publicada, recupere o mesmo original ainda aberto assim:

1. Inspecione o diagnóstico da tarefa da execução selecionada e confirme `workflow_entry_arguments_mismatch`, sem presumir que toda falha de tarefa tenha essa causa.
2. Restaure uma definição que aceite os argumentos originais registrados ou implante um adaptador compatível no corpo do workflow. Preserve identidade, entrada, histórico e prazos originais; não edite o armazenamento para encaixar a nova assinatura.
3. Use a ação de reparo suportada para essa mesma execução ainda aberta depois que o código compatível estiver disponível. Verifique então se o trabalho original continua e se o resultado terminal é registrado uma única vez. O reparo não estende o prazo original; um prazo já vencido continua valendo.

A proteção **não** reinterpreta exceções lançadas pelo corpo do workflow como incompatibilidades de implantação. Um `TypeError` real da aplicação ou outra falha não tratada no corpo continua seguindo o comportamento normal de falha do workflow. Ela também não fornece a verificação de toda a frota para retirar ramificações legadas, acompanhada em [shared #220](https://github.com/durable-workflow/.github/issues/220).

### Os SDKs em modo de serviço têm limites separados {#service-sdk-entry-boundaries}

Uma correção no Core integrado não altera o processo do SDK que executa workflows no modo de serviço. Os SDKs publicados mais antigos abaixo são anteriores à proteção de entrada de serviço acompanhada na [issue compartilhada #221](https://github.com/durable-workflow/.github/issues/221):

| SDK publicado | Comportamento da associação de entrada |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | Chama o handler registrado com o contexto seguido da entrada posicional registrada. Um `ArgumentCountError` ou `TypeError` na entrada pode seguir o caminho genérico de falha do workflow. |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | Chama `run(ctx, *start_input)`. Uma mudança na quantidade de argumentos pode falhar o workflow; anotações de tipo sozinhas não impõem tipos nem convertem os valores registrados. Erros no corpo do gerador também são falhas da aplicação. |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | O adaptador tipado desserializa a entrada antes de chamar o handler de assinatura fixa. Mudar o tipo da requisição pode falhar nessa decodificação. Isso difere da associação posicional do PHP/Python; uma recusa incidental por histórico não consumido não é garantia de proteção recuperável de assinaturas. |

Mantenha a compatibilidade de entrada em modo serviço e a qualificação real dos SDKs separadas da versão embutida publicada. Não capture todo `TypeError` ou todo erro de handler Rust para chamá-lo de seguro para replay: isso esconderia falhas reais da aplicação.

### Proteção de entrada dos SDKs de serviço {#service-sdk-entry-safeguard}

**Suporte publicado.** O Server 2.9.9 e os SDKs PHP 2.5.4, Python 2.6.2 e Rust 3.5.6 introduziram as proteções de entrada e o comportamento de roteamento e recuperação descritos abaixo. Essas são as versões mínimas para esses recursos; instale as versões estáveis atuais para receber correções de segurança.

Os SDKs preparados validam a entrada registrada antes de executar o código de workflow da aplicação. Uma entrada incompatível informa `workflow_entry_arguments_mismatch` como falha de uma **tarefa** de workflow bloqueada para replay, sem emitir `fail_workflow` nem encerrar a **execução** de negócio. A entrada, a identidade de workflow e execução, o histórico confirmado, a fixação do build e os prazos originais permanecem inalterados. PHP valida os argumentos posicionais obrigatórios e os tipos PHP declarados. Python faz a vinculação à assinatura para verificar a quantidade de argumentos e os valores padrão; as anotações não passam a impor tipos em tempo de execução. Os adaptadores tipados de Rust validam a decodificação da entrada antes de chamar o handler ou sua fábrica de estado. Handlers Rust de baixo nível continuam responsáveis por tratar a entrada da aplicação.

O campo específico da tarefa no Server, `failure_reason`, é `workflow_entry_arguments_mismatch`; `replay_blocked_reason` continua sendo o genérico `worker_reported_replay_failure`. Inspecione `latest_workflow_task_failure.reason` na resposta de depuração da execução selecionada. Não confunda esses campos com o diagnóstico do Core integrado acima. Se o código da aplicação já tiver iniciado corretamente e lançar um `TypeError`, retornar um erro de handler Rust ou falhar de outra forma, o comportamento normal de falha de negócio continua valendo.

Restaure código que aceite a entrada original registrada e siga o [procedimento suportado de recuperação do mesmo original](../failures-and-recovery.md#service-entry-recovery). Não substitua a entrada por valores padrão de um DTO, altere o histórico ou reinicie um prazo. Essa proteção não reabre um original que um worker antigo já tenha tornado terminal.

O roteamento seguro para uma substituição também exige a [capacidade de validação de entrada do worker](../polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution). Um fingerprint diferente não comprova compatibilidade de replay nem justifica reescrever o fingerprint original de uma execução. Versione as mudanças de comandos duráveis dentro de um método de entrada compatível e valide o replay a frio antes de promover o build.

## Evoluir argumentos e resultados de atividades {#evolving-activity-arguments-and-results}

Uma atividade tem dois contratos armazenados: os argumentos registrados no agendamento e o resultado registrado na conclusão. Um deploy não migra nenhum deles. Isso vale para PHP incorporado e para workers em modo serviço com os SDKs de PHP, Python e Rust.

Uma tentativa pendente ou repetida recebe os argumentos originais registrados. Ela executa a implementação selecionada pelo registro do worker e pela política de roteamento de builds, que ainda pode ser uma build anterior. Publicar uma nova implementação não garante que todas as tentativas a utilizem nem atualiza os argumentos na fila.

No replay de uma atividade concluída, o código atual do workflow recebe o resultado registrado sem executar a atividade novamente. A correspondência do passo e do tipo da atividade não valida o esquema dos argumentos ou do resultado. Uma mudança de estrutura pode causar falha no código da aplicação sem uma divergência de histórico.

### Adicionar entrada opcional sem reinterpretar valores antigos {#additive-activity-input}

Preserve os argumentos posicionais existentes e seu significado. No PHP incorporado, um parâmetro opcional no final permite continuar aceitando argumentos já agendados como `[7]`:

```php
use Workflow\V2\Activity;

final class PriceActivity extends Activity
{
    public function handle(int $amount, string $currency = 'USD'): array
    {
        return ['amount' => $amount, 'currency' => $currency];
    }
}
```

O valor padrão preenche um argumento ausente. Ele não converte um valor registrado incompatível nem corrige argumentos reordenados. Preserve também a compatibilidade dos efeitos externos: uma nova tentativa pode ocorrer depois do deploy e deve continuar idempotente.

Handlers de PHP em modo serviço recebem o contexto da atividade seguido dos argumentos posicionais registrados. Handlers de Python recebem esses argumentos posicionais diretamente. Ambos precisam de valores padrão para argumentos omitidos. As anotações de Python, por si só, não validam nem convertem valores. Atividades tipadas de Rust desserializam um único valor de requisição. Adicione um campo opcional ou um campo com padrão explícito do Serde, preservando a representação existente. Um novo campo obrigatório pode causar falha de decodificação antes da execução do handler Rust. Consulte as APIs de atividades nos guias dos SDKs de [PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/) e [Rust](https://rust.durable-workflow.com/).

### Ler resultados antigos com um valor de fallback {#additive-activity-result}

Quando um novo resultado de atividade adiciona `currency`, os workflows ainda devem aceitar resultados antigos concluídos que contêm apenas `amount`:

```php
$result = activity(PriceActivity::class, 7);
$currency = $result['currency'] ?? 'USD';
```

Escolha um fallback que preserve o significado de negócio anterior. Mantenha-o para todo histórico que possa passar por replay, inclusive consultas e recuperação. Faça o deploy de leitores compatíveis antes do código que grava a nova representação. Verifique também os leitores de rollback com os resultados novos já registrados. Um padrão no argumento da atividade não adiciona um campo a um resultado já registrado.

### Usar um novo tipo para um contrato diferente {#incompatible-activity-contract}

Para renomear um campo, mudar sua representação ou alterar seu significado de negócio, mantenha disponível o tipo anterior da atividade e introduza um novo. Use uma ramificação `getVersion()` na chamada de agendamento quando os históricos antigos precisarem manter seu passo anterior e os novos runs precisarem agendar o novo tipo. Uma ramificação dentro da atividade não corrige argumentos que falham antes da entrada no corpo. Um marcador de versão também não reescreve resultados no histórico.

Teste dois limites de deploy em processos novos com os pacotes realmente instalados: agendar com o código antigo e executar com a atividade candidata; depois, concluir com a atividade antiga e fazer replay com o workflow candidato. Inclua entradas e resultados incompatíveis como controles de falha. Não suponha que as proteções de entrada do workflow descritas acima também protejam assinaturas de atividades ou o acesso da aplicação aos resultados. O defeito confirmado de injeção de DTO nas atividades incorporadas está em [Workflow #910](https://github.com/durable-workflow/workflow/issues/910).

Revise, junto com estes contratos de atividade, as regras de [argumentos iniciais registrados do workflow](#evolving-recorded-entry-arguments) e a [receita de evolução do payload de sinais](signals.md#evolve-a-signal-payload).

### Limites de falha verificados {#activity-compatibility-failures}

As [verificações de pacotes publicados em #363](https://github.com/durable-workflow/durable-workflow.github.io/issues/363) usaram processos novos em cada limite de deploy. São versões verificadas, não versões mínimas compatíveis:

| Pacote publicado | Entrada de atividade incompatível | Leitura de resultado incompatível |
| --- | --- | --- |
| Workflow incorporado 2.11.2 | Um argumento obrigatório ausente produz `ArgumentCountError` e falha da atividade. | Acessar um campo ausente de array com o tratamento de erros do Laravel produz `ErrorException` e falha do workflow. |
| PHP SDK 3.2.0 com Server 2.11.0 | Um argumento posicional obrigatório ausente é informado como `ArgumentCountError` na falha da atividade. | Passar um campo ausente a um leitor que exige uma string produz `TypeError` e falha do workflow. |
| Python SDK 2.9.0 com Server 2.11.0 | Um argumento posicional obrigatório ausente produz `TypeError` e falha da atividade. | Acessar uma chave de resultado ausente produz `KeyError` e falha do workflow. |
| Rust SDK 4.2.2 com Server 2.11.0 | Um novo campo obrigatório da requisição causa falha de decodificação da entrada tipada antes do handler da atividade. | Um novo campo obrigatório do resultado causa falha de decodificação do resultado tipado no workflow. |

As verificações de serviço registraram `max_attempts = 1`; depois, a falha de atividade não tratada fez o workflow falhar. Em geral, falhas de atividade seguem sua política registrada de tentativas e timeouts. Um workflow pode tratar a falha após o esgotamento das tentativas da atividade. Um erro na leitura do resultado é uma falha da aplicação no workflow, não um pedido para repetir a atividade concluída. Todos os controles aditivos concluíram com o valor original `7` e a moeda padrão `USD`, com uma tentativa de atividade e sem reparos. Nos controles de resultado, a atividade concluída permaneceu concluída.

Workflow incorporado 2.11.2 também aceita uma mudança de assinatura que substitui o escalar registrado `7` por um DTO injetado com valor padrão `0`, e pode concluir incorretamente com `0`. [Workflow #910](https://github.com/durable-workflow/workflow/issues/910) acompanha esse defeito do produto. Não use injeção de dependências como migração de entrada da atividade nem suponha que a proteção de entrada do workflow cubra esse caso. Restaurar código compatível não reabre um run terminal. Inspecione o estado real e siga o [guia de recuperação](../failures-and-recovery.md) sem alterar entradas registradas, histórico ou prazos.

### Proteção publicada para atividades embutidas {#embedded-activity-argument-safeguard}

Workflow **2.11.3 é a versão mínima corrigida** da proteção PHP embutida contra vinculação de atividade que desloca argumentos registrados. Nos caminhos de atividade em fila e local, substituir o escalar registrado `7` por um DTO injetado cujo padrão é `0` é recusado antes de executar o corpo, com `ActivityEntryArgumentsMismatchException`. A [verificação do pacote publicado e instalado em processos novos](https://github.com/durable-workflow/workflow/issues/910#issuecomment-6362080363) comprova recusa e recuperação com a entrada original. A versão 2.11.2 descrita acima continua afetada. A proteção não adiciona campos a resultados antigos; leitores compatíveis ainda precisam do valor alternativo.

A recusa segue a **política registrada de tentativas, backoff e timeouts** da atividade. Com uma única tentativa permitida, a atividade esgota as tentativas e uma falha não tratada faz o workflow falhar. Se restarem tentativas definidas pelo autor e o código compatível voltar antes da nova tentativa permitida e dos prazos, a mesma execução/atividade original pode concluir com sua entrada registrada. A verificação comprova duas tentativas definidas pelo autor, backoff zero e resultado `7`; ela não promete espera indefinida por uma implantação futura nem concede tentativas extras.

Restaurar o código ou instalar o pacote não reabre originais terminais, reinicia prazos nem restaura tentativas consumidas. Inspecione a falha real e preserve entrada/histórico registrados. Verifique o pacote Workflow instalado na aplicação embutida: esta versão da biblioteca não atualiza imagens existentes do Server nem estabelece aceitação de workers de serviço ou nativos.

## Uso de `getVersion` {#using-getversion}

`getVersion()` é um helper de fluxo sequencial seguro para replay. Cada ponto de mudança registra um marcador durável de versão para a execução na primeira passagem, e todo replay posterior reutiliza esse valor confirmado, em vez de recalcular a ramificação a partir do código atual. Execuções antigas que precedem um ponto de ramificação recém-introduzido recebem `DEFAULT_VERSION` de forma conservadora.

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## Como funciona {#how-it-works}

O método `getVersion()` recebe três parâmetros:

- **changeId** - Um identificador único para este ponto de mudança
- **minSupported** - A versão mínima que este código ainda suporta
- **maxSupported** - A versão máxima (atual) para novas execuções

Quando um workflow encontra `getVersion()`:

- **Novas execuções** acrescentam um evento tipado `VersionMarkerRecorded` ao histórico com o `change_id`, a `version` escolhida e o intervalo suportado, e retornam `maxSupported`
- **Execuções em replay** retornam a versão registrada anteriormente nesse marcador de histórico
- **Execuções ainda sem marcador** recorrem a `WorkflowStub::DEFAULT_VERSION` quando o runtime determina que a ramificação precede a definição atual do workflow. Primeiro, ele verifica o marcador de compatibilidade da execução em relação ao worker atual. Depois, compara o `workflow_definition_fingerprint` capturado de forma durável na execução com a classe de workflow que pode ser carregada no momento. Se as impressões digitais coincidirem, a execução usa a mesma definição e um novo marcador é registrado. Se diferirem, a execução precede a mudança e a alternativa é acionada. Execuções cujo histórico `WorkflowStarted` precede a captura da impressão digital, sem impressão digital registrada, recebem `DEFAULT_VERSION` de forma conservadora, pois o runtime não pode comprovar que a definição não mudou. Essa alternativa conservadora é a política congelada da versão 2.0 para execuções anteriores à impressão digital: o runtime não bloqueia a reivindicação apenas porque uma execução antiga não tem impressão digital registrada. A alternativa não acrescenta um marcador sintético nem consome uma nova etapa do workflow
- **Métodos de consulta** reproduzem o mesmo marcador de versão confirmado antes de invocar o método anotado, para que consultas vejam a mesma ramificação vista pela tarefa de workflow
- **Waterline** expõe os marcadores registrados na linha do tempo da execução selecionada com `version_change_id`, `version`, `version_min_supported` e `version_max_supported`. Os detalhes também apresentam `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` e `workflow_definition_matches_current`, para que operadores vejam quando uma execução de longa duração iniciou em uma definição antiga, mesmo antes da confirmação de um marcador de versão

Isso permite que novos workflows usem o caminho de código mais recente enquanto workflows existentes continuam usando o caminho original.

## Adição de uma nova versão {#adding-a-new-version}

Suponha que você tenha um workflow existente que chama `prePatchActivity`:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

Para substituí-lo por `postPatchActivity` sem quebrar workflows em execução:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

Ao implantar um build que introduz um novo ponto de ramificação `getVersion()`, continue renovando `DW_V2_CURRENT_COMPATIBILITY` para essa onda de builds. O runtime usa o `workflow_definition_fingerprint` capturado no início da execução como fonte principal para decidir se a ausência de um marcador de versão pertence a uma execução nova ou a uma antiga que deve permanecer em `DEFAULT_VERSION`. O marcador de compatibilidade continua relevante para o roteamento de workers sensível à compatibilidade e é verificado antes da impressão digital. Execuções anteriores à captura da impressão digital, sem registro dela, permanecem conservadoramente em `DEFAULT_VERSION`, pois o runtime não pode verificar que a definição não mudou.

## Adição de outras versões {#adding-more-versions}

Quando precisar fazer outras mudanças, incremente `maxSupported`:

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## Descontinuação de versões antigas {#deprecating-old-versions}

Depois que todos os workflows usando uma versão antiga concluírem, você pode remover o suporte aumentando `minSupported`. Isso elimina a necessidade de manter caminhos antigos de código.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

Se um workflow com uma versão anterior a `minSupported` tentar fazer replay, lançará `VersionNotSupportedException`. Isso inclui execuções de compatibilidade antiga cuja alternativa segura ainda é `WorkflowStub::DEFAULT_VERSION`.

Se você reutilizar por engano o mesmo `changeId` para outro ponto de ramificação depois, o runtime tratará isso como erro de determinismo, em vez de aceitar silenciosamente a divergência. Mantenha um `changeId` estável por mudança lógica de código.

## Vários pontos de mudança {#multiple-change-points}

Você pode usar várias chamadas `getVersion()` no mesmo workflow para mudanças independentes:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Importante:** Cada `changeId` deve ser único dentro de um workflow. A versão escolhida é registrada no histórico tipado do workflow e reproduzida deterministicamente em tarefas posteriores, consultas e telas de detalhes do Waterline. Quando o Waterline não mostra uma entrada `VersionMarkerRecorded` para um ponto de mudança em uma execução antiga, significa que o replay permaneceu no caminho legado `DEFAULT_VERSION`, sem inserir retroativamente um novo marcador no histórico existente. Os campos de detalhes da execução selecionada `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` e `workflow_definition_matches_current` informam se a execução iniciou em uma definição de workflow diferente daquela que o build atual pode carregar.

## Atalho `patched()` {#patched-shorthand}

`patched($changeId)` é um atalho de dois estados para a pergunta comum “esta execução passou por uma mudança pontual de código?”. Ele registra o mesmo evento durável `VersionMarkerRecorded` de `getVersion()` e resolve para um booleano em vez de um inteiro.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

Comportamento:

- Novas execuções confirmam o marcador, seguem a nova ramificação e `patched()` retorna `true`.
- Execuções iniciadas antes da adição desse `changeId` permanecem em `DEFAULT_VERSION` sob a mesma alternativa por impressão digital usada por `getVersion()`, e `patched()` retorna `false`.
- Replays de ambos os tipos leem o marcador confirmado anteriormente e retornam o mesmo valor, tornando durável a decisão de ramificação.

`patched()` equivale exatamente a `getVersion($changeId, DEFAULT_VERSION, 1) === 1`. Use quando houver apenas duas ramificações e você não precisar manter a legada para sempre. A forma booleana é mais clara no local da chamada do que um `match` sobre `DEFAULT_VERSION` e `1`.

Se precisar de mais de duas ramificações ou planejar adicionar outra versão da mesma mudança lógica depois, use `getVersion()` com `maxSupported` explícito. Trocar `patched()` por `getVersion()` para o mesmo `changeId` é um erro de determinismo, pois o marcador existente foi registrado com `maxSupported = 1`.

## Remoção da ramificação legada com `deprecatePatch()` {#removing-the-legacy-branch-with-deprecatepatch}

Quando todas as execuções legadas de um ponto de mudança `patched()` terminarem, você poderá excluir a ramificação legada do código do workflow. A forma compatível de fazer isso é substituir a chamada `patched()` por `deprecatePatch()`, em vez de remover a chamada por completo.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` mantém o ponto de mudança na linha do tempo do workflow para que eventos de histórico `VersionMarkerRecorded` já confirmados ainda correspondam a uma chamada conhecida, mas retorna `null` e segue incondicionalmente o novo caminho. Depois de publicar essa versão:

- Novas execuções confirmam um marcador `deprecate_patch`, seguem a nova ramificação e a chamada `deprecatePatch()` retorna `null`.
- Execuções existentes que já confirmaram um marcador `patched` para esse `changeId` continuam reproduzindo esse marcador e resolvem pela ramificação com o patch descontinuado, agora a única, sem erro.
- Por premissa, execuções existentes que confirmaram `false` para `patched()`, o caminho legado, já não estão em andamento. Se uma ainda estiver executando e tentar fazer replay, o workflow ainda lerá o marcador legado, mas executará a nova ramificação. Por isso, o ciclo de vida seguro exige esperar todas as execuções legadas terminarem antes de implantar `deprecatePatch()`.

Ciclo de vida do patch em duas fases e regras de posicionamento:

1. **Introduza `patched()`** no ponto de mudança. Ambas as ramificações permanecem no código do workflow. Novas execuções seguem a nova ramificação; as antigas continuam seguindo a legada.
2. **Espere todas as execuções legadas terminarem.** Use a busca de execuções do Waterline ou `dw workflow:list` para confirmar que não há execuções abertas que possam fazer replay pela ramificação legada.
3. **Substitua `patched()` por `deprecatePatch()`** no mesmo local de chamada, com o mesmo `changeId`, e exclua a ramificação legada do corpo da função. Mantenha a chamada ali, sem removê-la, para que o histórico durável ainda corresponda a um ponto de mudança conhecido.
4. **Opcional: remova `deprecatePatch()` por completo** quando também tiver certeza de que nenhum replay histórico, incluindo consultas, exportações e auditorias, lerá histórico que confirmou esse marcador. Essa etapa é irreversível. A maioria dos workflows pode manter `deprecatePatch()` indefinidamente sem custo de runtime.

Regras de posicionamento:

- `patched()` e `deprecatePatch()` devem ser chamados no corpo da função do workflow, e não em atividades, handlers de sinais ou métodos de consulta. São etapas de workflow e devem ser reproduzidas deterministicamente.
- Cada `changeId` representa um ponto lógico de mudança. Reutilizar o mesmo `changeId` para outra ramificação é um erro de determinismo.
- Um `changeId` pode aparecer na forma `patched()` ou `deprecatePatch()` durante sua vida, mas nunca nas duas ao mesmo tempo. A implantação que troca a chamada deve substituí-la, sem manter ambas.
- `getVersion()` e `patched()` não podem coexistir para o mesmo `changeId`. Escolha um modelo ao introduzir o ponto de mudança.
