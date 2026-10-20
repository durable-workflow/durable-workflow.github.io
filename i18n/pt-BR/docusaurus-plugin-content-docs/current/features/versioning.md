---
sidebar_position: 15
---

# Versionamento {#versioning}

## Replay antes de trocar builds {#replay-before-changing-builds}

Antes de promover um candidato, reproduza históricos representativos abertos e encerrados recentemente usando seu código exato. Antes de reverter, reproduza os históricos escritos pelo build novo com o artefato antigo. Siga a [verificação de replay](../testing.md#replay-before-deployment); uma coorte de roteamento compatível ou uma verificação de integridade aprovada não comprova, por si só, compatibilidade de replay.

Como workflows podem executar por longos períodos, às vezes meses ou anos, é comum precisar alterar uma definição de workflow enquanto execuções ainda estão em andamento. Sem versionamento, modificar código que afeta o caminho de execução causaria erros de não determinismo no replay.

O helper `getVersion()` permite introduzir mudanças com segurança em workflows em execução, criando pontos de ramificação versionados.

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
