---
sidebar_position: 2
title: Contraintes des workflows
description: Préserver une relecture déterministe et détecter les appels dangereux au démarrage.
---

# Contraintes des workflows {#workflow-constraints}

Une classe de workflow ne doit pas dépendre d’un état externe ou de services qui peuvent changer avec le temps. Cela inclut la date et l’heure actuelles, l’utilisateur connecté, les ressources réseau et les autres sources d’état changeant.

Dans le corps d’un workflow :

- Évitez `Carbon::now()`, dont le résultat change à chaque appel. Utilisez `Workflow\V2\Workflow::now()` ou `Workflow\V2\now()` pour obtenir une heure compatible avec la relecture.
- Évitez `Auth::user()`, dont le résultat dépend de l’utilisateur connecté. Passez l’utilisateur en entrée au démarrage du workflow.
- Évitez les requêtes réseau directes, dont la réponse, la vitesse et la disponibilité varient. Passez les données en entrée ou récupérez-les dans une activité.
- Évitez les générateurs de nombres aléatoires et les autres sources d’aléa, sauf si le résultat est enregistré avec un effet de bord durable. Vous pouvez aussi passer la valeur aléatoire en entrée au démarrage.

## Contrôles au démarrage {#boot-time-guardrails}

Au démarrage, le package analyse les classes enregistrées dans `workflows.v2.types.workflows`. Il repère les appels manifestement incompatibles avec la relecture, comme `Carbon::now()`, `Auth::user()`, `DB::`, `Http::` et `random_int()`. La configuration `workflows.v2.guardrails.boot` détermine la réaction :

| Mode | Comportement |
| --- | --- |
| `warn` (par défaut) | Enregistre un avertissement pour chaque problème détecté, sans bloquer le démarrage. |
| `silent` | Ignore complètement l’analyse au démarrage. |
| `throw` | Lève une `LogicException` au premier problème. Utile en intégration continue. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Utilisez `DW_V2_GUARDRAILS_BOOT=throw` en intégration continue pour refuser de nouveaux appels incompatibles avec la relecture. En production, gardez `warn` pour qu’un problème latent ne bloque pas le déploiement.

Dans le périmètre initial de 2.0, l’analyse au démarrage est le seul contrôle de déterminisme qui peut bloquer un workflow. Le runtime ne relance pas ces diagnostics lors de la prise d’une tâche de workflow. L’analyse vérifie les workflows PHP enregistrés localement avant leur déploiement. Waterline affiche les changements d’empreinte de définition des exécutions longues, sans faire de la prise de tâches entre builds une nouvelle source d’échec du déploiement.

Les exécutions antérieures aux empreintes suivent aussi une politique prudente. Si une exécution atteint une nouvelle branche `getVersion()` et que son événement `WorkflowStarted` précède l’instantané d’empreinte, le runtime conserve `WorkflowStub::DEFAULT_VERSION`. Il ne suppose pas que la définition actuelle permet une relecture sûre. Consultez la [gestion des versions](../features/versioning.md).
