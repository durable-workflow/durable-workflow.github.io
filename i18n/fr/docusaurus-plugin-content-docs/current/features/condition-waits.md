---
sidebar_position: 6
---

# Attentes conditionnelles {#condition-waits}

`await($condition, $conditionKey = null)` fournit des attentes conditionnelles sûres à relire. Utilisez cette fonction lorsque le prédicat dépend uniquement d’un état de workflow déjà dérivé d’entrées durables, comme des mises à jour, résultats d’activités ou résultats de workflows enfants. Pour obtenir directement la valeur d’un signal externe nommé, appelez `await('name')`. Consultez [Signaux](./signals.md).

Les attentes conditionnelles sont pilotées par une méthode de mise à jour plutôt que par des méthodes de mutation de signal :

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

La clé de condition facultative est une étiquette opérateur stable et utilisable dans une URL pour identifier l’attente. La relecture vérifie la clé précédemment enregistrée afin qu’un déploiement ultérieur ne puisse pas réutiliser accidentellement la même étape pour un autre prédicat. Consultez [Gestion des versions](./versioning.md) pour faire évoluer un workflow en sécurité entre déploiements.

Pour une attente conditionnelle avec délai d’expiration, consultez [Signal + temporisateur](./signal+timer.md).

**Important :** `await()` doit être utilisé uniquement dans un workflow, pas dans une activité.
