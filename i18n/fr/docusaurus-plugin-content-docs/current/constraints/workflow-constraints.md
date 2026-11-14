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

## Journaliser depuis le code de workflow {#workflow-logging}

Un worker reconstruit l’historique validé du workflow après les activations et remplacements à froid ; la journalisation ordinaire de l’application peut donc répéter les messages précédents. Utilisez le logger conscient du replay documenté pour votre binding lorsqu’il existe. Le mode service Rust fournit le [logger de workflow de Rust SDK 4.17](../polyglot/rust.md#workflow-logging) ; les autres bindings conservent leurs contrats documentés séparément.

La journalisation est une observation du processus. Gardez les commandes durables indépendantes des observations du replay et de la livraison des logs. Même un logger conscient du replay peut répéter un message d’une tentative non validée après un crash ou un retry ; ce n’est pas une outbox garantissant exactement une fois. Les handlers hôtes doivent rester bornés et non bloquants pour ne pas immobiliser le worker. Placez les effets métier durables dans l’activité ou l’opération de workflow enregistrée appropriée.

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

### Ce que l’analyse vérifie {#scan-coverage}

L’analyse est lexicale. Elle lit uniquement la classe de workflow, ses classes parentes et ses traits, et signale :

- les lectures de l’horloge : `time()`, `date()`, `microtime()`, `hrtime()`, `today()`, les appels statiques comme `Carbon::now()`, et `new DateTime()`, `new DateTimeImmutable()`, `new Carbon()` ou `new CarbonImmutable()` sans argument ou avec un temps relatif comme `'now'` ou `'+1 day'`. Une date fixe n’est pas signalée.
- l’aléatoire : `random_int()`, `random_bytes()`, `rand()`, `mt_rand()`, `uniqid()`, `shuffle()`, `array_rand()`, `str_shuffle()` et les helpers du type `Str::uuid()`.
- l’état externe : `DB::`, `Cache::`, `Http::`, `Auth::`, `auth()` et `request()`.

Elle ne voit pas les appels passant par des classes d’aide ou de service, les valeurs qui dépendent de l’état du processus comme les propriétés statiques ou l’ordre de données non ordonnées, ni ce qui est décidé à l’exécution. Une analyse sans résultat ne prouve pas le déterminisme. Lancez la [vérification par relecture](../testing.md) sur des historiques enregistrés pour détecter le reste.

Dans le périmètre initial de 2.0, l’analyse au démarrage est le seul contrôle de déterminisme qui peut bloquer un workflow. Le runtime ne relance pas ces diagnostics lors de la prise d’une tâche de workflow. L’analyse vérifie les workflows PHP enregistrés localement avant leur déploiement. Waterline affiche les changements d’empreinte de définition des exécutions longues, sans faire de la prise de tâches entre builds une nouvelle source d’échec du déploiement.

Les exécutions antérieures aux empreintes suivent aussi une politique prudente. Si une exécution atteint une nouvelle branche `getVersion()` et que son événement `WorkflowStarted` précède l’instantané d’empreinte, le runtime conserve `WorkflowStub::DEFAULT_VERSION`. Il ne suppose pas que la définition actuelle permet une relecture sûre. Consultez la [gestion des versions](../features/versioning.md).
