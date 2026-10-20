---
sidebar_position: 25
title: Exécution sticky
description: Affinité indicative des workers, caches de relecture, attribution normale des tâches et prise en charge par les SDK.
tags:
  - sticky-execution
  - replay
  - operations
keywords:
  - exécution sticky
  - cache de relecture sticky
  - relecture à froid
  - routage worker_id
  - diagnostics du cache
---

# Exécution sticky {#sticky-execution}

L’exécution sticky est une optimisation de relecture prise en charge par Durable Workflow v2. Un worker peut conserver un cache local chaud après la fin d’une tâche de workflow. S’il reçoit une autre tâche du même run, il peut réutiliser son cache valide. L’affinité ne lui réserve pas la tâche.

L’exécution sticky ne garantit pas la correction du workflow. Le progrès reste validé uniquement dans l’historique durable, et une relecture complète à froid reste toujours valide. Le code ne doit pas dépendre de l’état local du processus pour fonctionner correctement.

## Résumé du contrat {#contract-summary}

L’exécution sticky offre quatre garanties :

- Les caches sticky appartiennent aux processus worker, pas au serveur ni à la base.
- L’affinité utilise le `worker_id` du protocole comme identité du propriétaire du cache.
- L’affinité est indicative et expire. La relecture à froid est le repli obligatoire après un cache manquant, un redémarrage, un drainage, un déploiement ou une éviction.
- Les opérateurs disposent de paramètres et diagnostics nommés : activation, TTL, capacité, taux de succès et d’échec du cache, relecture forcée à froid et pression de capacité.

Les champs d’affinité durables sont `sticky_worker_id` et `sticky_until` sur les runs et tâches de workflow. Les diagnostics des tâches sont `sticky_replay_mode` et `sticky_claimed_at`.

## Cycle de vie du cache sticky {#sticky-cache-lifecycle}

Un cache sticky est une structure locale du worker contenant l’état de workflow relu d’un ou plusieurs runs. Lorsqu’un worker compatible termine une tâche, Server peut l’enregistrer comme propriétaire sticky jusqu’à `sticky_until`. Les tâches de workflow suivantes héritent de cette affinité lors de leur création.

Le worker gère le contenu et l’éviction du cache. Il peut retirer des runs lorsqu’il atteint sa capacité, commence un drainage, redémarre, change de build, détecte un cache non sûr ou libère de la mémoire. Server ne traite jamais le contenu du cache comme un état durable.

Si un worker reçoit une tâche avec affinité sans disposer d’une entrée de cache valide, il doit relire l’historique durable à froid. Le bail de tâche reste la seule autorité permettant de valider le progrès du workflow.

## Identité de routage {#routing-identity}

L’identité est le `worker_id` du protocole worker. Les workers activent cette affinité en s’enregistrant avec le cache sticky activé et en continuant d’envoyer des heartbeats comme workers actifs de la file.

L’affinité sticky ne privilégie pas le propriétaire et ne lui retient pas les tâches prêtes. Le runtime PHP sélectionne les candidats par priorité, `available_at`, puis identifiant de tâche. Server peut aussi rééquilibrer le lot de candidats entre clés d’équité dans un même niveau de priorité. Les vérifications habituelles de compatibilité, type de workflow, file, namespace, capacité et bail s’appliquent toujours.

Tout worker éligible peut réclamer la tâche avant `sticky_until`, même si un autre worker actif possède l’affinité. Si le propriétaire n’a aucun emplacement de workflow libre, un autre worker éligible peut la prendre immédiatement et relire à froid. La tâche n’attend ni le cache du propriétaire ni l’expiration de l’affinité. Augmenter le TTL ne crée pas une réservation plus longue.

`sticky_until` borne la validité de l’affinité et la période où une attribution au propriétaire peut être étiquetée `sticky_hit_expected`. Il ne règle pas la disponibilité de la tâche, ne prolonge pas son bail et ne garantit pas que le cache du propriétaire contient encore le run.

## Comportement de repli {#fallback-semantics}

La relecture à froid est le repli obligatoire. Elle intervient lorsque :

- L’exécution sticky est désactivée.
- Le worker n’a pas enregistré la prise en charge du cache.
- La tâche n’a pas de `sticky_worker_id` et `sticky_until` actifs.
- Le propriétaire est périmé, absent, en drainage, redémarré ou remplacé.
- Le propriétaire a évincé le run du cache.
- Un autre worker réclame la tâche, y compris pendant l’affinité active du propriétaire.
- L’affinité a expiré avant l’attribution.

Les modes de relecture diagnostiques sont :

- `sticky_hit_expected` : le propriétaire a réclamé la tâche avant expiration. Le worker doit quand même vérifier son cache avant usage.
- `cold_replay` : aucune affinité sticky ne s’appliquait.
- `forced_cold_replay` : un propriétaire était enregistré, mais un autre worker a réclamé la tâche ou l’affinité a expiré. Cela peut se produire avec un propriétaire initial en bonne santé.

`forced_cold_replay` n’est pas une erreur de correction. Cela signifie que l’optimisation sticky n’a pas fourni le gain de relecture attendu pour cette tâche.

## Déploiement, drainage et mise à jour {#deployment-drain-and-rollout}

L’exécution sticky suit le cycle de vie du worker. Pendant le drainage, un worker doit cesser de réclamer de nouvelles tâches tout en terminant ses tâches, en envoyant des heartbeats, en signalant les échecs ou en laissant ses baux expirer normalement. D’autres workers compatibles peuvent réclamer les tâches prêtes et relire à froid sans attendre l’expiration de l’affinité.

Les workers de remplacement n’héritent pas des caches des anciens processus. Un déploiement peut donc augmenter `forced_cold_replay` jusqu’au réchauffement des nouveaux caches. Utilisez un `worker_id` unique pour chaque processus ou redémarrage afin de distinguer l’ancien propriétaire d’un nouveau processus.

La compatibilité des builds et l’empreinte de définition du workflow déterminent toujours si un worker peut exécuter une tâche. L’affinité sticky ne permet pas d’acheminer du code incompatible vers un run.

## Paramètres opérateur {#operator-controls}

L’exécution sticky dépend de la configuration du workflow/runtime et des capacités des workers, pas de variables propres à l’image Server. La configuration du package expose son activation et le TTL de l’affinité :

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

Chaque worker annonce la capacité de son cache à l’enregistrement et lors des heartbeats. Vous pouvez désactiver l’affinité dans la configuration du runtime ou utiliser des workers sans cache sticky sans changer la sémantique du workflow. Les runs existants poursuivent leur exécution par relecture à froid.

## Champs du protocole worker {#worker-protocol-fields}

Les workers compatibles déclarent leur prise en charge à l’enregistrement :

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Les workers transmettent les diagnostics de cache lors des heartbeats :

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

Les réponses aux polls de tâches de workflow incluent `task.sticky_execution` avec `sticky_worker_id`, `sticky_until`, `replay_mode` et `cache_directive`. `resume_if_present` autorise l’usage d’un cache chaud valide. Si l’entrée est absente ou invalide, le worker doit relire à froid.

## Métriques et diagnostics {#metrics-and-diagnostics}

Les métriques opérateur incluent :

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

Le serveur autonome rapporte aussi dans `sticky_execution_workers` la capacité et la taille des caches, les succès, échecs, relectures forcées à froid, évictions et le nombre de workers sous pression de capacité.

Interprétez ces diagnostics ainsi :

- `ready_sticky_tasks` compte les tâches prêtes dont l’affinité enregistrée n’a pas expiré. Cela ne signifie pas qu’elles sont retenues pour leurs propriétaires. Le runtime PHP expose actuellement le même nombre dans `capacity_pressure_tasks`.
- Un faible taux de succès attendu peut provenir d’un autre worker qui réclame les tâches, du TTL, du remplacement de workers ou des évictions. Comparez les identifiants des demandeurs et les métriques de cache des workers avant de modifier TTL ou capacité.
- Un taux élevé d’échec de cache ou de relecture forcée à froid préserve la correction, mais indique que le cache ne réduit pas le coût de relecture.
- La pression de capacité du cache worker indique une utilisation proche de la capacité annoncée ou supérieure. Elle est distincte des emplacements libres d’exécution et du nombre de tâches prêtes.

## Code compatible avec la relecture {#replay-safe-code}

Le code doit se comporter à l’identique avec une exécution sticky ou une relecture à froid. Ses décisions utilisent l’historique durable : entrées, résultats d’activité, timers, signaux, mises à jour, effets enregistrés et marqueurs de version. Les projections de memo et d’attributs de recherche sont des métadonnées opérateur. Ne choisissez pas une branche métier à partir de leurs valeurs modifiables.

Pour la correction, ne dépendez pas de variables globales modifiables, fichiers locaux, sockets ouvertes, identité d’objets, valeurs aléatoires, horloge réelle ou autres états locaux. Le cache peut conserver ces valeurs par accident pour une tâche, puis les perdre après un échec de cache, un redémarrage, un déploiement ou une éviction.

Utilisez [`sideEffect(...)`](/docs/features/side-effects) pour les valeurs non déterministes à enregistrer une seule fois et des activités ordinaires pour les effets externes. Voir [Garanties d’exécution et idempotence](/docs/constraints/execution-guarantees) pour le contrat de relecture et d’historique durable.
