---
sidebar_position: 4
title: Temporisateurs
description: Utiliser des temporisateurs durables et un temps de workflow déterministe sans dépendre de l’horloge réelle du processus.
tags:
  - timers
  - deterministic-time
  - waits
keywords:
  - temporisateurs durables
  - temps déterministe
  - heure courante du workflow
---

import TimerSimulator from '@site/src/components/TimerSimulator';

# Temporisateurs {#timers}

Le framework permet de suspendre un workflow et de le reprendre plus tard. Ces temporisateurs sont durables : ils survivent aux redémarrages et aux échecs tout en respectant la sémantique de relecture du workflow. Ils servent notamment aux délais, à la logique de nouvelle tentative ou aux expirations.

Pour utiliser un temporisateur, appelez `timer($duration)` dans votre workflow :

```php
use function Workflow\V2\timer;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        timer(30);

        return 'The workflow waited 30 seconds.';
    }
}
```

<TimerSimulator />

## Résolution des délais {#delay-resolution}

Les délais des temporisateurs durables sont exprimés en secondes entières.
Passez un nombre entier de secondes, par exemple `timer(1)`. Avec une chaîne
d’intervalle PHP ou `CarbonInterval`, une durée positive comportant une fraction
de seconde est arrondie à la seconde entière supérieure. Ainsi, 100 ms deviennent
une seconde. `timer(0)` se déclenche toujours dans la tâche courante.

Un temporisateur arrivé à échéance peut être traité. La latence de la file et la
charge des workers peuvent retarder son traitement. Cette résolution ne garantit
donc pas un instant de reprise exact et ne réduit pas la précision des horodatages
enregistrés. Consultez les [tests](../testing.md#keeping-delay-tests-fast) pour
éviter les attentes réelles.

Comportement des temporisateurs :

- chaque appel à `timer()` crée une ligne durable et des événements d’historique typés `TimerScheduled`, `TimerFired` et, en cas de remplacement, `TimerCancelled`
- les temporisateurs différés passent par une tâche dédiée avant la reprise de la tâche de workflow
- `timer(0)` se déclenche directement pendant la tâche de workflow sans créer de tâche de temporisateur
- les chemins de relecture et de requête de lecture font autorité à partir de l’historique typé `TimerScheduled`, `TimerFired` et `TimerCancelled` pour le cycle de vie : les temporisateurs purs restent bloqués jusqu’à l’événement de déclenchement validé, et les détails de l’exécution sélectionnée reconstruisent les attentes ouvertes, déclenchées ou annulées depuis l’historique
- Waterline expose les attentes de temporisateur dans les détails d’exécution et les données du tableau de bord
- les commandes moteur `cancel()` et `terminate()` supplantent durablement les attentes ouvertes, et les traitements tardifs de temporisateur ne font rien au lieu de rouvrir l’exécution

Les temporisateurs de toute durée fonctionnent avec chaque pilote de file Laravel, y compris Amazon SQS. Le moteur découpe automatiquement les longs délais selon la limite par message du pilote.

`sideEffect()` permet d’enregistrer des instantanés sûrs à relire, comme des valeurs aléatoires ou des entrées de branchement uniques.

## Lire un temps déterministe {#reading-deterministic-time}

Dans le corps d’un workflow, utilisez `Workflow::now()` (ou `Workflow\V2\now()`) plutôt que la fonction Laravel `now()` ou `Carbon::now()` pour obtenir l’heure courante :

```php
use function Workflow\V2\activity;
use function Workflow\V2\now;
use Workflow\V2\Workflow;

class DurationAwareWorkflow extends Workflow
{
    public function handle(string $name): array
    {
        $startedAt = Workflow::now();
        $greeting = activity(GreetingActivity::class, $name);
        $finishedAt = Workflow::now();

        return [
            'greeting' => $greeting,
            'took_ms' => $finishedAt->getTimestampMs() - $startedAt->getTimestampMs(),
        ];
    }
}
```

`Workflow::now()` avance à mesure que l’exécuteur relit les événements d’historique. Cette méthode renvoie le `recorded_at` de la dernière fin d’activité, du dernier déclenchement de temporisateur, signal reçu, résolution de condition ou achèvement de workflow enfant consommé par la relecture. Avant tout événement consommé, elle renvoie le `started_at` de l’exécution. Hors d’une fibre de workflow (par exemple dans une activité ou une méthode de requête de lecture déléguant à une fonction hors workflow), elle utilise l’heure réelle de `now()`.

`Workflow::now()` préserve le déterminisme : deux relectures du même historique produisent les mêmes valeurs temporelles, même si l’heure réelle a avancé entre-temps.
