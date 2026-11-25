---
sidebar_position: 2
title: Restrições dos workflows
description: Mantenha o replay determinístico e identifique chamadas inseguras na inicialização da aplicação.
---

# Restrições dos workflows {#workflow-constraints}

Uma classe de workflow não deve depender de estado externo ou de serviços que possam mudar ao longo do tempo. Isso inclui operações que dependam da data e hora atuais, do usuário conectado, de recursos de rede externos ou de qualquer outra fonte de estado variável.

Evite estas operações dentro de uma classe de workflow:

- Não use `Carbon::now()` para obter a data e hora atuais, pois o resultado muda a cada chamada. Use `Workflow\V2\Workflow::now()` ou a função `Workflow\V2\now()`, que retornam o tempo do workflow de forma segura para replay.
- Não use `Auth::user()` para obter o usuário atual, pois o resultado depende de quem está conectado. Passe o usuário como entrada ao iniciar o workflow.
- Não faça chamadas de rede para recursos externos, que podem estar lentos ou indisponíveis em momentos diferentes. Passe os dados necessários como entrada ao iniciar o workflow ou use uma atividade para buscá-los.
- Não use geradores de números aleatórios, exceto dentro de um efeito registrado com `sideEffect`, nem outras fontes de aleatoriedade. Passe os valores aleatórios necessários como entrada ao iniciar o workflow.

## Logging no código do workflow {#workflow-logging}

O motor faz o replay de um workflow a partir do histórico toda vez que ele acorda, então uma chamada de log comum no código do workflow é gravada novamente a cada passo concluído. Um workflow com 50 passos registra sua primeira linha 50 vezes. Use, em vez disso, o logger ciente do replay. Ele só grava quando o código é executado pela primeira vez. Os loggers de workflows embarcados, do PHP SDK e do Rust também acrescentam a identidade da execução a cada linha:

- Workflows embarcados (Workflow 2.42.0 ou posterior): `$this->logger()` retorna um logger PSR-3 que grava pelo logger do Laravel, ou pelo canal que você informar, como em `$this->logger('workflow')`. Cada linha traz `workflow_instance_id`, `workflow_run_id`, `workflow_type` e `namespace`. `$this->replayState()` retorna `Workflow\V2\Enums\WorkflowReplayState` (`Replaying`, `Executing` ou `Unavailable`), e `$this->isReplaying()` é sua forma booleana.
- PHP SDK: `$context->logger()` grava pelo logger PSR-3 do `Worker`. Veja o [guia do PHP SDK](../polyglot/php.md#workflow-logging).
- Rust SDK: `ctx.logger()`. Veja o [logger de workflow do Rust SDK 4.17](../polyglot/rust.md#workflow-logging).
- Python SDK: `ctx.logger`, que fica em silêncio durante o replay, mas não acrescenta a identidade da execução.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

final class ShipOrderWorkflow extends Workflow
{
    public function handle(string $orderId): string
    {
        $this->logger()->info('Shipping started', ['order_id' => $orderId]);
        $label = activity(PrintLabelActivity::class, $orderId);
        $this->logger()->info('Label printed', ['label' => $label]);

        return $label;
    }
}
```

Consultas e validadores de atualização nunca registram logs, porque são sempre um replay.

Em workflows embarcados, as linhas são gravadas depois que a transação de banco de dados da tarefa de workflow é confirmada, então uma tarefa revertida não grava nada. Código que aguarda um handle `select()` pendente sem registrar um passo registra uma única vez, na tarefa que passa da espera. Linhas de um handler de atualização executado ao vivo são gravadas quando a atualização é aplicada. No PHP SDK, as linhas são gravadas depois que o Server aceita a tarefa de workflow; veja o [guia do PHP SDK](../polyglot/php.md#workflow-logging).

Logging é uma observação do processo. Mantenha os comandos duráveis do workflow independentes das observações do estado de replay e da entrega de logs. Um logger ciente do replay não é um outbox exactly-once: se um worker embarcado ou do PHP SDK morrer entre a confirmação ou a aceitação e a gravação, essas linhas se perdem, e o logger do Rust pode repetir uma mensagem de uma tentativa não confirmada após uma falha ou um retry. Mantenha os handlers do host limitados e não bloqueantes para que o logging não trave o worker. Coloque efeitos de negócio duráveis na atividade adequada ou em uma operação de workflow registrada.

## Verificações na inicialização {#boot-time-guardrails}

Quando classes de workflow são registradas em `workflows.v2.types.workflows`, o pacote analisa o código na inicialização da aplicação para identificar chamadas obviamente inseguras para replay, como `Carbon::now()`, `Auth::user()`, `DB::`, `Http::` e `random_int()`. O tratamento dos resultados é definido por `workflows.v2.guardrails.boot`:

| Modo | Comportamento |
| --- | --- |
| `warn` (padrão) | Registra um aviso para cada ocorrência detectada, sem impedir a inicialização. |
| `silent` | Desativa a análise na inicialização. |
| `throw` | Lança uma `LogicException` na primeira ocorrência. Útil em pipelines de CI. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Configure `DW_V2_GUARDRAILS_BOOT=throw` na CI para reprovar builds que introduzam chamadas inseguras para replay. Mantenha `warn` em produção para que uma ocorrência ainda não identificada não bloqueie uma implantação.

### O que a verificação analisa {#scan-coverage}

A verificação é léxica. Ela lê apenas a classe do workflow, suas classes pai e seus traits, e sinaliza:

- leituras do relógio: `time()`, `date()`, `microtime()`, `hrtime()`, `today()`, chamadas estáticas como `Carbon::now()`, e `new DateTime()`, `new DateTimeImmutable()`, `new Carbon()` ou `new CarbonImmutable()` sem argumento ou com um tempo relativo como `'now'` ou `'+1 day'`. Uma data fixa não é sinalizada.
- aleatoriedade: `random_int()`, `random_bytes()`, `rand()`, `mt_rand()`, `uniqid()`, `shuffle()`, `array_rand()`, `str_shuffle()` e helpers no estilo de `Str::uuid()`.
- estado externo: `DB::`, `Cache::`, `Http::`, `Auth::`, `auth()` e `request()`.

Ela não vê chamadas feitas por classes auxiliares ou de serviço, valores que dependem do estado do processo, como propriedades estáticas ou a ordem de dados não ordenados, nem nada decidido em tempo de execução. Uma verificação limpa não prova determinismo. Execute a [verificação de replay](../testing.md) em históricos registrados para detectar o restante.

Na versão inicial, a análise na inicialização é a única verificação de determinismo que pode bloquear a execução. O runtime não repete esse diagnóstico ao adquirir uma tarefa de workflow. Essa escolha é intencional na 2.0: a análise identifica problemas nos workflows PHP registrados localmente antes da implantação, e o Waterline mostra mudanças na impressão digital da definição em execuções longas, sem tornar a aquisição de tarefas entre builds uma nova fonte de falhas de implantação.

Execuções anteriores ao registro de impressões digitais também seguem uma política conservadora. Se uma execução alcançar um novo ramo de `getVersion()` e seu histórico `WorkflowStarted` for anterior ao registro da impressão digital, o runtime mantém essa execução em `WorkflowStub::DEFAULT_VERSION`, sem presumir que a definição atual é segura. Veja [Versionamento](../features/versioning.md).

### Edições de comentários e formatação {#comment-only-edits}

Por padrão, a impressão digital de uma definição cobre as linhas de código-fonte brutas. Por isso, editar apenas comentários, docblocks ou espaços em branco em uma classe de workflow, em seus traits ou em suas classes de workflow pai, ou dentro de uma closure de condição de `await()`, conta como uma mudança de definição para execuções em andamento: um marcador `getVersion()` ou `patched()` ausente recebe `WorkflowStub::DEFAULT_VERSION`, e uma closure de condição editada faz o replay falhar.

A partir da 2.34, os workers podem registrar, em vez disso, impressões digitais dos tokens de código PHP sem comentários e espaços em branco (prefixo `sha256-tokens:`), que essas edições não alteram. Ative com `DW_DEFINITION_FINGERPRINT_VERSION=v2` depois que todos os workers estiverem na 2.34 ou posterior, porque um worker mais antigo trata essa execução como alterada. Cada execução mantém a versão de impressão digital que registrou: execuções iniciadas antes da ativação continuam sensíveis a edições de comentários, e voltar para `v1` é seguro.
