---
sidebar_position: 7
---

# Efeitos colaterais {#side-effects}

Um efeito colateral é uma closure que contém código não determinístico. A closure é executada apenas uma vez e o resultado é salvo. Se o workflow for repetido, ela não será executada novamente: retornará o resultado salvo. Isso torna o workflow determinístico, pois o replay sempre retorna o mesmo valor armazenado, em vez de executar novamente o código não determinístico.

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

O workflow chama `random_int()` apenas uma vez e salva o resultado, mesmo que depois falhe e seja repetido.

## Quando usar efeitos colaterais {#when-to-use-side-effects}

Use `sideEffect()` quando precisar de um valor não determinístico que:

- seja calculado localmente, sem E/S externa (números aleatórios, UUIDs, horários)
- nunca deva mudar depois de registrado, mesmo entre replays
- não precise de semântica de repetição, pois a closure é executada exatamente uma vez

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## Quando usar uma atividade no lugar {#when-to-use-an-activity-instead}

Se o código puder falhar, comunicar-se com um serviço externo ou precisar de semântica de repetição ou tempo limite, use uma [atividade](../defining-workflows/activities.md) em vez de um efeito colateral:

| Cenário | Use |
|---|---|
| Gerar um token aleatório | `sideEffect()` |
| Ler um valor de configuração no momento da decisão | `sideEffect()` |
| Chamar uma API externa | `activity()` |
| Gravar em um banco de dados | `activity()` |
| Enviar um e-mail ou uma notificação | `activity()` |
| Calcular um valor custoso que pode lançar uma exceção | `activity()` |

A regra prática é: se a closure puder lançar uma exceção para a qual você desejaria repetir a operação, ela deve ficar em uma atividade.

## Como funciona {#how-it-works}

- cada chamada a `sideEffect()` acrescenta um evento tipado `SideEffectRecorded` ao histórico com a sequência da etapa do workflow
- tanto o replay do workflow quanto o replay para consulta reutilizam esse valor confirmado, em vez de executar novamente a closure
- o Waterline apresenta o instantâneo do efeito colateral como uma entrada tipada de histórico na linha do tempo da execução selecionada
- efeitos colaterais continuam restritos a instantâneos seguros para replay, sem trabalho que possa falhar ou precise de semântica de repetição

## Antipadrões {#anti-patterns}

**Não chame serviços externos dentro de um efeito colateral.** Se a chamada ao serviço falhar, o efeito colateral não será repetido e o workflow falhará permanentemente:

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**Não coloque operações lentas ou bloqueantes dentro de um efeito colateral.** A closure é executada na thread da tarefa do workflow. Um trabalho demorado atrasa toda a tarefa do workflow:

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**Não dependa de estado externo mutável.** A closure é executada exatamente uma vez. Se você ler um valor que muda com o tempo, o instantâneo fica congelado no momento da primeira execução, sem ser atualizado no replay:

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

Esse comportamento é intencional: o instantâneo fica congelado para garantir o determinismo. Se precisar de um valor que seja atualizado ao longo da vida do workflow, use um sinal ou uma atividade.

## Execute este padrão {#run-this-pattern}

O workflow de tempo decorrido no
[aplicativo de exemplo](/docs/sample-app) é a referência executável para
manter as leituras do relógio dentro de `sideEffect()`:

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` registra os horários de início e fim
como valores inteiros dentro de callbacks de `sideEffect()`, para que o valor
registrado sobreviva à decodificação do payload Avro no replay. Os detalhes da
execução no Waterline mostram dois eventos `MarkerRecorded` em torno do disparo
do temporizador. Esse par de marcadores é a evidência persistida de que as
leituras do relógio permaneceram determinísticas.
