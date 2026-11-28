---
title: Regrouper les révisions après une pause
description: Actualisez une entité après une période calme grâce aux attentes de signal durables.
---

# Regrouper les révisions après une pause {#debouncing-and-coalescing}

## Attendre une période calme {#quiet-window}

Utilisez un identifiant de workflow stable par entité. Conservez la plus grande révision positive et actualisez à cette version. Ce modèle ignore volontairement les révisions intermédiaires. Il convient à la mise à jour vers le dernier état. Traitez chaque paiement individuel dans un flux distinct qui exécute chaque demande.

Chaque signal ouvre une nouvelle attente avec délai. Le résultat `null` marque la fin de la pause. Les attentes et les minuteurs enregistrés guident le replay.

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

Enregistrez le type de workflow pour qu’un nouveau worker ou une exécution suivante retrouve la même définition.

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Admettre les changements de façon atomique {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

Le reçu confirme l’admission durable. L’activité peut encore être en attente. Le `signalWithStart` intégré démarre une instance absente, signale son exécution active ou crée une nouvelle exécution après la fermeture. Les règles de démarrage ordinaires laissent une instance fermée dans cet état.

## Conserver les changements en attente et borner l’historique {#pending-input-and-continuation}

Un signal reçu pendant l’activité reste en attente jusqu’à la prochaine attente. Le lot suivant bénéficie de sa propre période calme. L’activité en cours continue. Transmettez la révision appliquée et toute révision en attente déjà lue dans les arguments de continuation. Les signaux en attente destinés à l’instance et associés à un gestionnaire déclaré peuvent passer à l’exécution suivante. Une commande ciblant une exécution reste liée à celle-ci.

Mesurez l’historique pour une rafale représentative. `SignalReceived`, `SignalApplied`, les attentes, les minuteurs et les activités ajoutent des événements. Un flux continu peut remplir l’historique avant la fin d’une période calme. Limitez les entrées et gardez une marge pour la continuation. Continue-as-new préserve l’échéance d’exécution.

L’activité de démonstration renvoie la révision choisie. Pour un effet réel, utilisez une clé d’idempotence comme `(entité, révision)` dans le système destinataire. Une nouvelle tentative d’activité peut répéter la requête externe même après déduplication du signal.
