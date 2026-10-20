---
sidebar_position: 2
title: Activités
description: Définissez des classes d’activités pour les effets de bord non déterministes, les nouvelles tentatives, le routage et les options propres à chaque appel.
tags:
  - authoring
  - activities
  - retries
keywords:
  - classe d’activité durable workflow
  - options d’activité
  - effets de bord non déterministes
---

# Activités {#activities}

Une activité est une unité de travail qui accomplit une tâche ou une opération précise, comme appeler une API, traiter des données ou envoyer un e-mail. Elle peut être exécutée par un workflow.

:::note Contrat d’exécution durable
Les activités v2 ordinaires s’exécutent comme des tâches durables en file
d’attente. Les activités locales sont une primitive explicite pour de courtes
opérations dans le même processus, qui conservent un historique d’activité
durable. Les sessions de worker permettent de partager un bail de worker entre
plusieurs étapes d’activité durables. L’exécution sticky est une optimisation
de relecture prise en charge, sans garantir la correction de l’exécution.
Consultez le [modèle d’exécution des activités](/docs/features/activity-execution-model),
les [activités locales](/docs/features/local-activities), les [sessions de worker](/docs/features/worker-sessions)
et l’[exécution sticky](/docs/features/sticky-execution) pour les contrats exacts.
:::

Vous pouvez créer une activité avec la commande Artisan `make:activity` :

```php
php artisan make:activity MyActivity --v2
```

Définissez-la en héritant de la classe `Activity` et en implémentant la méthode `handle()`.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle()
    {
        // Perform some work...
        return $result;
    }
}
```

## Contrat d’exécution {#execution-contract}

Chaque appel à `activity(...)` enregistre une commande d’activité dans
l’historique du workflow et crée une tâche durable en file d’attente qu’un
worker peut prendre en charge. Tout worker compatible peut prendre en charge
une activité ordinaire. Les [sessions de worker](/docs/features/worker-sessions)
peuvent rattacher une séquence de tentatives d’activité à un même bail de
session de worker si le workflow choisit explicitement ce contrat.

Pour obtenir une valeur sûre pour la relecture sans planifier du travail en
file d’attente, utilisez [`sideEffect(...)`](/docs/features/side-effects).
Pour une courte activité dans le même processus, avec nouvelles tentatives,
délai d’expiration, battements de cœur et historique d’activité, utilisez les
[activités locales](/docs/features/local-activities).
Le [modèle d’exécution des activités](/docs/features/activity-execution-model)
décrit l’ensemble des règles de placement. L’[exécution sticky](/docs/features/sticky-execution)
décrit le comportement du cache de relecture sticky.

## Idempotence et identité durable {#idempotency-and-durable-identity}

Une activité s’exécute au moins une fois. Les nouvelles tentatives,
l’expiration des baux et les nouvelles livraisons peuvent faire observer
plusieurs fois la même activité logique. L’effet de bord ou l’opération sur
la cible distante doit donc pouvoir être répété sans danger.

Dans l’activité, utilisez les identifiants durables du runtime pour la
corrélation ou la déduplication distante :

- `activityId()` identifie une exécution logique d’activité à travers ses
  nouvelles tentatives et constitue la clé d’idempotence distante par défaut.
- `attemptId()` identifie une tentative précise de cette exécution.
- `attemptCount()` indique quelle tentative est en cours.

Préférez `activityId()` lorsque le système distant doit traiter les nouvelles
tentatives comme une même requête logique. Utilisez `attemptId()` uniquement
s’il doit distinguer chaque tentative. Si un worker termine une opération
distante, perd son bail puis signale sa fin tardivement, le moteur peut rejeter
ce signalement parce qu’un autre worker a déjà remporté la course à la
validation durable. L’effet de bord distant peut toutefois avoir déjà eu lieu.

Consultez les [garanties d’exécution et l’idempotence](/docs/constraints/execution-guarantees),
les [battements de cœur](/docs/features/heartbeats) et les
[échecs et la récupération](/docs/failures-and-recovery) pour le modèle
opérationnel associé à ces identifiants.

## Surcharges par appel {#per-call-overrides}

Par défaut, le routage et les nouvelles tentatives suivent les propriétés `$connection`, `$queue`, `$tries` et `backoff()` de la classe d’activité. Pour les remplacer lors d’un appel précis, par exemple afin de le diriger vers une file plus prioritaire ou de lui accorder davantage de tentatives, transmettez une instance d’`ActivityOptions` :

```php
use function Workflow\V2\activity;
use Workflow\V2\Support\ActivityOptions;

$result = activity(
    MyActivity::class,
    new ActivityOptions(queue: 'high-priority', maxAttempts: 5),
    'Taylor',
);
```

Les [options d’activité](/docs/configuration/options#activityoptions) donnent la liste complète des champs, dont les délais d’expiration et les battements de cœur.

## Appels d’activités locales {#local-activity-calls}

Utilisez `localActivity(...)` lorsqu’un court effet de bord idempotent doit
s’exécuter dans le processus du worker de workflow courant tout en conservant
les règles d’activité pour les nouvelles tentatives, délais d’expiration,
battements de cœur, annulations et historiques :

```php
use Workflow\V2\Support\LocalActivityOptions;
use function Workflow\V2\localActivity;

$receipt = localActivity(
    SendReceiptActivity::class,
    new LocalActivityOptions(maxAttempts: 3, startToCloseTimeout: 10),
    $orderId,
);
```

Les activités locales refusent `connection`, `queue`, le routage par session de
worker et les options de délai entre planification et démarrage, car elles ne
créent pas de tâches d’activité ordinaires. Consultez les
[activités locales](/docs/features/local-activities) pour le contrat complet.
