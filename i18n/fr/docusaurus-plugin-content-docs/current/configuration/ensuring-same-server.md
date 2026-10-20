---
sidebar_position: 3
title: Placement et affinité des workers
description: Choisir le routage par file, les activités locales ou les sessions de worker sans confondre nom de file et affinité avec un hôte physique.
tags:
  - configuration
  - workers
  - affinity
keywords:
  - activity worker affinity
  - dedicated activity queue
  - same process activity
  - worker sessions
---

# Placement et affinité des workers {#worker-placement-and-affinity}

Un nom de file délimite le routage, sans garantir une affinité avec un hôte physique.
Définir la propriété `$queue` d’un workflow ou d’une activité limite les workers
autorisés à prendre la tâche, mais tout worker compatible interrogeant cette file
peut la recevoir. Ne transmettez pas de données entre activités ordinaires via
le système de fichiers local d’un worker, sauf si ces données sont également
conservées dans un emplacement partagé durable.

## Router le travail vers un groupe de workers dédié {#route-work-to-a-dedicated-worker-pool}

Utilisez une file dédiée lorsqu’un type de travail nécessite un groupe particulier
de workers, par exemple avec un volume partagé monté ou une capacité GPU :

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

Démarrez uniquement les workers Laravel prévus sur cette file :

```bash
php artisan queue:work --queue=gpu-activities
```

Laravel Horizon peut superviser la même file. Dans les deux cas, la garantie
est « un des workers affectés à cette file », pas « le même processus ou hôte
que celui de l’étape précédente ». Placez les données à transmettre dans les
données durables du workflow, un stockage externe de données ou un autre
stockage partagé accessible à tous les workers éligibles.

## Choisir le contrat d’affinité nécessaire {#choose-the-affinity-contract-you-need}

- Utilisez une [activité ordinaire en file](/docs/defining-workflows/activities)
  si le travail peut s’exécuter sur tout worker compatible de sa file.
- Utilisez une [activité locale](/docs/features/local-activities) si une activité
  courte et réessayable doit s’exécuter dans le processus du worker qui traite
  actuellement la tâche du workflow.
- Utilisez une [session de worker](/docs/features/worker-sessions) si plusieurs
  étapes d’activité durables doivent réutiliser un même bail de session pour
  un état local au processus, de la mémoire GPU ou un système de fichiers monté localement.

Les sessions de worker appliquent toujours d’abord le routage par file. Elles
ajoutent ensuite un contrat explicite de bail et de capacité, avec expiration
et réacquisition facultative. Elles ne rendent pas une machine immortelle. Si
l’état doit survivre à la perte d’un worker ou à la réacquisition d’une session,
conservez-le dans un stockage partagé durable.

Consultez le [Modèle d’exécution des activités](/docs/features/activity-execution-model)
pour comparer les placements et les [Options](/docs/configuration/options#queue)
pour configurer les files au niveau de la classe ou de l’appel.
