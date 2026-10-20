---
sidebar_position: 5
---

# Signal + temporisateur {#signal--timer}

`Workflow\V2` prend en charge `await($condition, timeout: $seconds, conditionKey: $key)` pour les attentes conditionnelles avec expiration et `await('signal-name', timeout: $seconds)` pour les attentes de signaux nommés avec expiration.

Utilisez cette fonction si le workflow doit continuer dès qu’un état durable relu devient vrai, tout en se débloquant après une échéance si cet état ne change jamais.

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

use function Workflow\V2\minutes;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = await(fn () => $this->ready, timeout: minutes(5), conditionKey: 'approval.ready');

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

`await()` avec un paramètre `timeout:` fonctionne ainsi :

- Le prédicat doit dépendre uniquement d’entrées durables relues (résultats d’activités, mutations de mises à jour, résultats de workflows enfants). Un état non durable ne réveille pas l’attente.
- La clé de condition facultative est une étiquette opérateur stable. La relecture la valide contre l’historique antérieur pour qu’un redéploiement ne puisse pas réutiliser silencieusement la même étape pour un autre prédicat.
- Si le prédicat devient vrai avant le déclenchement du temporisateur, `await()` renvoie `true`.
- Si l’échéance arrive en premier, `await()` renvoie `false`.

Des fonctions de commodité rendent les durées lisibles : `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`, `years()`.

Pour modifier durablement le prédicat depuis le code applicatif, appelez la mise à jour déclarée :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('approval-with-timeout');

$workflow->markReady();
```

La valeur renvoyée est `true` si la condition devient vraie avant le déclenchement de la tâche d’expiration, et `false` si l’expiration arrive en premier.

Pour les signaux nommés, `await('name', timeout: minutes(5))` renvoie les données du signal à son arrivée et `null` si l’expiration arrive en premier. `null` est réservé à l’expiration : un signal sans argument donne `true`, un seul argument donne sa valeur et plusieurs arguments donnent un tableau. `Workflow\V2` n’utilise pas les anciennes méthodes de mutation `#[SignalMethod]` pour changer l’état du workflow.

## Fonction de commodité `awaitWithTimeout()` {#awaitwithtimeout-helper}

`Workflow::awaitWithTimeout($timeout, $condition, $conditionKey = null)` est un raccourci pour `await($condition, timeout: $timeout, conditionKey: $conditionKey)`. L’ordre des arguments place l’échéance en premier pour rendre l’intention d’expiration claire au point d’appel.

```php
use function Workflow\V2\{await, minutes};
use Workflow\V2\Workflow;

#[Type('approval-with-timeout')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): string
    {
        $approved = Workflow::awaitWithTimeout(
            minutes(5),
            fn () => $this->ready,
            'approval.ready',
        );

        return $approved ? 'approved' : 'timed out';
    }

    #[UpdateMethod]
    public function markReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

La sémantique du résultat est celle de `await()` avec `timeout:` : l’appel renvoie `true` si la condition l’emporte, `false` si l’échéance l’emporte pour un prédicat appelable, les données du signal si un signal nommé l’emporte et `null` si l’échéance l’emporte pour un signal nommé.

`awaitWithTimeout()` se lit « attendre au maximum cette durée pour une condition » plutôt que « attendre une condition, avec une option d’expiration ». Choisissez la forme la plus claire au point d’appel. Le runtime les traite de façon identique et elles enregistrent le même historique.
