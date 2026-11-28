---
title: Agrupar revisões após um período de silêncio
description: Atualize uma entidade após um período de silêncio usando esperas duráveis por sinais.
---

# Agrupar revisões após um período de silêncio {#debouncing-and-coalescing}

## Aguarde um período de silêncio {#quiet-window}

Use um ID de workflow estável por entidade. Guarde a maior revisão positiva e atualize para essa versão. O padrão ignora deliberadamente revisões intermediárias. Use-o para chegar ao estado mais recente. Trate operações como pagamentos individuais em um fluxo que processe cada solicitação.

Cada sinal abre uma nova espera com limite de tempo. O resultado `null` encerra o período de silêncio. As esperas e os temporizadores registrados orientam o replay.

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

Registre o tipo do workflow para que um novo worker ou uma execução sucessora encontre a mesma definição.

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Admita mudanças de forma atômica {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

O recibo confirma a admissão durável. A atividade pode ainda estar pendente. O `signalWithStart` embarcado inicia uma instância ausente, sinaliza a execução ativa ou cria uma nova execução após o fechamento. As políticas comuns de início mantêm fechada uma instância encerrada.

## Preserve mudanças pendentes e limite o histórico {#pending-input-and-continuation}

Um sinal recebido durante a atividade permanece pendente até a próxima espera. O próximo lote tem seu próprio período de silêncio. A atividade em execução continua. Passe como argumentos da continuação a revisão aplicada e qualquer revisão pendente já consumida. Sinais pendentes direcionados à instância com manipulador declarado podem passar à sucessora. Um comando direcionado a uma execução permanece vinculado à execução selecionada.

Meça o histórico com uma rajada representativa. `SignalReceived`, `SignalApplied`, esperas, temporizadores e atividades acrescentam eventos. Uma rajada contínua pode preencher o histórico antes do fim de um período de silêncio. Limite as entradas e reserve margem para continuar. Continue-as-new preserva o prazo da execução.

A atividade de exemplo devolve a revisão escolhida. Para um efeito real, use uma chave de idempotência como `(entidade, revisão)` no sistema de destino. Uma nova tentativa da atividade pode repetir a solicitação externa mesmo quando o sinal foi deduplicado.
