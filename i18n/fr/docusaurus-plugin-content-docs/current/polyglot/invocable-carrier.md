---
sidebar_position: 4
title: Transporteur HTTP invocable
description: Configurer le transporteur invocable_http réservé aux activités pour que le serveur envoie une tâche d'activité sous bail par POST à un gestionnaire HTTPS et rapproche le résultat structuré.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - transporteur invocable
  - invocable_http
  - configuration d'exécuteur externe
  - gestionnaire HTTP d'activité
  - enveloppe d'entrée de tâche externe
  - enveloppe de résultat de tâche externe
---

# Transporteur HTTP invocable {#invocable-http-carrier}

Le transporteur HTTP invocable est le premier transporteur concret défini par
l'[interface d'exécution externe](./external-execution.md). Il est publié par
`GET /api/cluster/info` sous `worker_protocol.invocable_carrier_contract` avec
`schema: durable-workflow.v2.invocable-carrier.contract`, `version: 1` et
`carrier_type: invocable_http`.

Lorsqu'une correspondance de gestionnaire configurée se résout en transporteur
`invocable_http`, le serveur invoque le point de terminaison configuré avec
l'[enveloppe d'entrée de tâche externe](./external-execution.md#published-contract-seams)
indépendante du transporteur, puis rapproche la réponse de l'[enveloppe de
résultat de tâche externe](./external-execution.md#published-contract-seams).
Les tâches de workflow, l'ordre des signaux/mises à jour, la relecture et les
modifications de l'historique restent dans le serveur. Le transporteur se
limite au transfert des enveloppes déclarées d'entrée et de résultat à travers
une frontière HTTPS.

## Définition {#what-it-is}

Le transporteur HTTP invocable sert aux tâches de niveau activité qu'une
équipe d'exploitation préfère héberger dans un gestionnaire HTTPS plutôt que
dans un worker à interrogation longue :

- activités de maintenance des opérateurs et automatisation de plateforme
  hébergées dans un service HTTP interne ;
- transmissions d'intégration bornées aboutissant déjà à un point de terminaison HTTPS ;
- gestionnaires d'activités serverless ou conteneurisés exposant une seule
  route POST par type d'activité.

L'exécution de l'activité est déléguée au point de terminaison configuré.
L'état durable du workflow, l'historique et le contrat de finalisation de
l'activité restent sous la responsabilité du serveur.

## Périmètre réservé aux activités {#activity-only-scope}

Le manifeste publié fixe le périmètre à `task_kinds: [activity_task]` et nomme
explicitement les objectifs exclus pour empêcher une dérive par configuration :

- `workflow_task_execution` : les tâches de workflow restent dans les véritables runtimes de workflow ;
- `workflow_replay` : le transporteur ne relit jamais l'historique du workflow ;
- `history_mutation` : les gestionnaires ne peuvent pas modifier directement l'historique des événements ;
- `generic_webhook_ingress` : l'entrée générique passe par un adaptateur de
  passerelle, pas par ce transporteur.

Une correspondance de gestionnaire dont `kind` n'est pas une activité, ou de
transporteur ayant une capacité autre que `activity_task`, échoue à la
validation avec `invalid_invocable_carrier_scope` avant de pouvoir apparaître
dans la réponse d'interrogation d'activité.

## Cible HTTPS et méthode {#https-target-and-method}

Les `target_fields` du transporteur sont validés par le serveur avant
l'exposition d'une correspondance :

| Champ | Obligatoire | Valeurs permises | Notes |
| --- | --- | --- | --- |
| `url` | oui | URL HTTPS absolue, ou HTTP pour le développement sur boucle locale (`localhost`, `127.0.0.0/8`, `::1`) | Les identifiants dans l'URL (`scheme://user:pass@host`) sont interdits. |
| `method` | non | `POST` | `POST` par défaut. Aucune autre méthode HTTP n'est acceptée. |
| `timeout_seconds` | non | entier 1–900 | Échéance de transport d'une tentative du gestionnaire. Celle de la tâche est appliquée séparément par le serveur/runtime. |
| `retry_policy` | non | objet (voir ci-dessous) | Budget de nouvelles tentatives de transport géré par le transporteur. |

Les cibles invalides sont rejetées avec `invalid_carrier_target` et
n'apparaissent jamais dans la sortie de découverte.

## Modèle d'authentification {#auth-model}

Les correspondances `invocable_http` hors boucle locale doivent résoudre un
`auth_ref` depuis la configuration de l'exécuteur externe. HTTP invocable sans
authentification n'est autorisé que vers des cibles HTTP de boucle locale
pour permettre le développement local.

- Les `auth_refs` sont déclarés une fois au niveau supérieur de la
  configuration et référencés dans les valeurs par défaut ou par
  correspondance. Les types pris en charge incluent `profile`, `env`,
  `token_file`, `mtls` et `signed_headers`.
- Une correspondance résolue vers une cible hors boucle locale sans
  `auth_ref` effectif échoue à la validation avec `missing_invocable_auth_ref`.
- Les jetons, secrets, signatures et en-têtes d'autorisation ne sont jamais
  répétés dans les diagnostics du cluster, la sortie de `dw server:info` ni la
  réponse d'interrogation d'activité. Les diagnostics indiquent l'`auth_ref`
  résolu et un résumé expurgé, jamais la valeur de l'identifiant.

L'opérateur peut ainsi lire les diagnostics expurgés du runtime et confirmer
quel secret d'authentification sera utilisé, sans que le serveur expose le secret lui-même.

## Nouvelles tentatives de transport et d'activité durable {#transport-retry-versus-durable-activity-retry}

La `retry_policy` facultative d'un transporteur invocable concerne
**uniquement le transport**. Elle régit la livraison HTTP avant que le
gestionnaire signale un résultat :

| Champ `retry_policy` | Valeurs permises | Valeur par défaut | Signification |
| --- | --- | --- | --- |
| `max_attempts` | entier 1–5 | `1` | Nombre maximal de tentatives de livraison HTTP effectuées par le transporteur pour un bail de tâche. |
| `backoff_seconds` | tableau d'entiers entre 0 et 300, jusqu'à 5 entrées | `[]` | Attente par tentative avant le prochain essai HTTP. |
| `retryable_status_codes` | sous-ensemble de `[408, 425, 429, "5xx"]` | `[408, 429, "5xx"]` | Codes de réponse permettant une nouvelle tentative de transport. |

Les nouvelles tentatives de transport ne deviennent jamais des événements
d'historique. Le serveur ne connaît que la tentative finale du transporteur :
l'enveloppe structurée de réussite/d'échec renvoyée par le gestionnaire, un
délai de transport dépassé converti en
`failure.kind=timeout, classification=deadline_exceeded`, ou l'un des chemins
de sortie mal formée.

Une fois le résultat signalé, la **politique de nouvelle tentative d'activité
durable reste sous l'autorité du serveur/runtime**. Les nouvelles tentatives,
la planification et les attentes au niveau tâche suivent toujours la
politique d'activité déclarée côté workflow. La `retry_policy` du transporteur
ne la prolonge pas, ne la remplace pas et ne la supplante pas.

## Enveloppes de requête et de réponse {#request-and-response-envelope}

Le serveur envoie l'enveloppe d'entrée indépendante du transporteur et attend
en retour l'enveloppe de résultat indépendante du transporteur :

| Direction | Type de contenu | Schéma |
| --- | --- | --- |
| Requête | `application/vnd.durable-workflow.external-task-input+json` | `external_task_input_contract` |
| Réponse | `application/vnd.durable-workflow.external-task-result+json` | `external_task_result_contract` |

Le gestionnaire doit préserver `task.id`, `task.attempt` et
`task.idempotency_key` depuis l'enveloppe d'entrée et répondre avec l'enveloppe
de réussite ou d'échec déclarée (ou provoquer un rejet sûr par une conversion
en sortie mal formée).

Le transporteur convertit les faits de transport en faits de résultat de manière déterministe :

- délai de transport dépassé → `failure.kind=timeout`,
  `classification=deadline_exceeded`
- réponse hors 2xx sans enveloppe de résultat valide → `malformed_output`
- JSON invalide ou non-conformité au schéma dans la réponse → `malformed_output`
- enveloppe de résultat contenant une référence de charge utile non prise en charge →
  `unsupported_payload`

Les gestionnaires doivent être idempotents. Les mêmes `task.id` et
`task.idempotency_key` peuvent arriver plusieurs fois si le transporteur
réessaie une livraison ou si le runtime relivre un bail non terminé.

## Exemple de configuration {#configuration-example}

Le serveur lit les correspondances de gestionnaires depuis
`DW_EXTERNAL_EXECUTOR_CONFIG_PATH`, avec sélection facultative d'une surcouche
par `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`. Consultez la
[référence de configuration de Server](./server-config-reference.md) pour la
liste complète des variables d'environnement.

Voici un document minimal `durable-workflow.external-executor.config`
inscrivant un transporteur `invocable_http` et une correspondance d'activité :

```json
{
  "schema": "durable-workflow.external-executor.config",
  "version": 1,
  "defaults": {
    "profile": "prod",
    "namespace": "operations",
    "task_queue": "operator-tasks",
    "auth_ref": "handler-token"
  },
  "auth_refs": {
    "handler-token": {
      "type": "env",
      "env": "DURABLE_WORKFLOW_HANDLER_TOKEN"
    }
  },
  "carriers": {
    "ops-invocable": {
      "type": "invocable_http",
      "url": "https://handlers.example.com/durable/activity",
      "method": "POST",
      "timeout_seconds": 60,
      "capabilities": ["activity_task"],
      "retry_policy": {
        "max_attempts": 3,
        "backoff_seconds": [2, 5],
        "retryable_status_codes": [408, 429, "5xx"]
      }
    }
  },
  "mappings": [
    {
      "name": "billing.reconcile-ledger",
      "kind": "activity",
      "task_queue": "operator-tasks",
      "activity_type": "billing.reconcile-ledger",
      "carrier": "ops-invocable",
      "handler": "billing.reconcile-ledger",
      "timeout_seconds": 60
    }
  ]
}
```

Une variante de développement sur boucle locale utilise
`"url": "http://127.0.0.1:8080/durable/activity"` et peut omettre `auth_ref`,
car HTTP sur boucle locale est le seul chemin sans authentification autorisé.

## Inspection et diagnostics {#inspection-and-diagnostics}

Deux commandes CLI exposent le contrat publié du transporteur invocable d'un
serveur en cours d'exécution :

- `dw server:info` affiche le nom du schéma, la version du contrat, le type de
  transporteur, les types de tâches, les types de contenu autorisés en requête
  et réponse et les diagnostics expurgés des correspondances de l'exécuteur
  externe. Utilisez-le pour confirmer le chargement des correspondances attendues.
- `dw doctor` exécute le diagnostic cluster-info, affiche le bloc
  `invocable_carrier_contract` et signale les erreurs `invalid_carrier_target`,
  `missing_invocable_auth_ref`, `invalid_invocable_carrier_scope`,
  `unknown_carrier`, `unknown_auth_ref` ou `unknown_handler` qui ont empêché
  l'annonce d'une correspondance.

La réponse d'interrogation d'activité indique elle-même la correspondance
résolue, la cible du transporteur (authentification expurgée) et la
`retry_policy` effective. Les workers et les outils d'exploitation utilisent
ces champs comme référence au lieu de mettre en cache leur propre copie du
fichier de configuration.

## Coexistence et déploiement {#coexistence-and-rollout}

La frontière de déploiement du transporteur invocable est publiée dans le même manifeste :

- Un transporteur par interrogation et un transporteur `invocable_http` ne
  peuvent partager une file que si les correspondances sont propres à un type
  d'activité. Deux correspondances ne peuvent revendiquer le même couple
  `(task_queue, activity_type)`.
- Les opérateurs doivent supprimer les correspondances invocables ou les
  désactiver par surcouche avant de supprimer les identifiants qu'elles
  référencent. Retirer les identifiants avant drainage de la correspondance
  fait passer chaque nouvelle tentative à `failure.kind=auth`, sans réussite silencieuse.
- La `retry_policy` du transporteur concerne uniquement le transport. La
  politique d'activité durable reste la seule autorité sur le nombre de
  tentatives de tâche observées par le workflow.

## Interfaces associées {#related-surfaces}

- [Interface d'exécution externe](./external-execution.md) : frontière produit
  indépendante du transporteur que ce transporteur implémente.
- [Gestionnaire d'activité PHP invocable](./invocable-php-handler.md) : outil
  PHP utilisé par un processus externe pour analyser les enveloppes d'entrée,
  distribuer les appels d'activité et émettre les enveloppes structurées de
  résultat attendues par ce transporteur.
- [Référence de configuration de Server](./server-config-reference.md) :
  variables d'environnement `DW_EXTERNAL_EXECUTOR_CONFIG_PATH` et
  `DW_EXTERNAL_EXECUTOR_CONFIG_OVERLAY`.
- [Stockage externe des charges utiles](../features/external-payload-storage.md) :
  délégation des charges utiles de requête ou résultat trop volumineuses à un
  pilote configuré, puis représentation sous forme d'enveloppe de référence
  vérifiable dans les mêmes schémas d'entrée et de résultat que le transporteur invocable.
- [Protocole worker](./worker-protocol.md) : contrat plus large du plan worker,
  publiant ce transporteur avec les formes de gestionnaires par interrogation.
