---
sidebar_position: 7
title: Déploiement des build-id de workers
description: Déployer, tester en canari, drainer et restaurer des builds de workers sans bloquer les exécutions, grâce à l'état de déploiement build-id du serveur autonome.
tags:
  - worker-protocol
  - operations
  - rollouts
  - build-ids
  - task-queues
keywords:
  - déploiement build id de worker
  - drainer un build de worker
  - retour arrière d'un build de worker
  - workers canaris
  - migration non versionnée vers versionnée
---

# Déploiement des build-id de workers {#worker-build-id-rollout}

Utilisez cette référence pour passer de workers non versionnés à des workers
étiquetés par build, essayer un nouveau build en canari sur une file de tâches,
drainer un ancien build avant son retrait ou revenir sur un build défectueux.
Le serveur enregistre l'intention de l'opérateur avec les lignes des workers
actifs pour que l'interrogation suivante, la description CLI ou l'appel
`list_task_queue_build_ids` reflète fidèlement l'état du déploiement, même si
les anciens workers disparaissent avant la résorption de leur retard.

Ce guide concerne le contrôle des cohortes, pas l'intégralité du contrat de
routage. Lisez [Compatibilité et routage des workers](/docs/polyglot/worker-compatibility-routing)
pour la règle imposant de conserver l'affectation du travail en cours à des
exécuteurs compatibles et de présenter « aucun worker compatible n'est
disponible » comme un état opérationnel explicite.

Le serveur Durable Workflow exprime un déploiement sur une file de tâches
comme un ensemble de **cohortes build-id**. Une cohorte regroupe chaque
inscription de worker ayant déclaré le même `build_id` lors de son appel à
`POST /api/worker/register`. Les workers qui omettent `build_id` constituent la
**cohorte non versionnée**, valeur par défaut avant déploiement et point de
départ de la première migration.

## État de déploiement enregistré par le serveur {#rollout-state-the-server-records}

Chaque cohorte `(namespace, task_queue, build_id)` contient l'état agrégé des
workers (nombres actifs, en drainage, périmés et total) et l'intention de l'opérateur :

| Champ | Rôle |
| --- | --- |
| `build_id` | Identité du build enregistrée. `null` désigne la cohorte non versionnée. |
| `rollout_status` | Vue agrégée du comportement de la cohorte envers les nouvelles tâches : `active`, `active_with_draining`, `draining`, `stale_only` ou `no_workers`. |
| `drain_intent` | Intention de l'opérateur pour la cohorte : `active` ou `draining`. |
| `drained_at` | Date du premier marquage de la cohorte en drainage. Absente tant que la cohorte est active. Les appels de drainage répétés ne décalent pas cet horodatage. |
| `active_worker_count` | Workers vivants acceptant actuellement de nouvelles tâches. |
| `draining_worker_count` | Workers vivants détenant encore des tâches en cours mais n'en prenant plus de nouvelles. |
| `stale_worker_count` | Workers dont le dernier heartbeat est antérieur au seuil de péremption. |
| `total_worker_count` | Somme des trois populations de la cohorte. |
| `runtimes`, `sdk_versions` | Chaînes distinctes de runtimes et de versions de SDK observées dans la cohorte. |
| `last_heartbeat_at`, `first_seen_at` | Fenêtre de heartbeats de la cohorte, utile pour confirmer l'inactivité d'une cohorte avant sa suppression. |

`drain_intent` est persistant : redémarrer un worker, arrêter tous les workers
ou laisser la cohorte devenir périmée ne le remet pas silencieusement à
`active`. Seul un `POST .../build-ids/resume` explicite efface `drain_intent`
et `drained_at`. `rollout_status` reste ainsi fidèle à l'intention même
lorsqu'une cohorte n'a plus aucun worker vivant.

## Inspecter le déploiement {#inspect-the-rollout}

Avant de drainer ou supprimer un build, confirmez les cohortes encore
joignables sur la file :

```bash
curl -sS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Le même instantané est disponible dans la CLI opérateur et le SDK Python :

```bash
dw task-queue:build-ids orders-critical --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token) as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

## Première migration : du non versionné au versionné {#first-cutover-unversioned-to-versioned}

Une file toujours desservie par des workers non versionnés présente une seule
cohorte `build_id: null`, avec `rollout_status: "active"`. La première migration
introduit une nouvelle cohorte étiquetée par build à côté de celle-ci.

1. Déployez la nouvelle flotte de workers avec un `build_id` stable (par
   exemple `orders-worker-2026-04-22`) enregistré via `POST /api/worker/register`.
2. Confirmez que les deux cohortes sont actives :
   ```bash
   dw task-queue:build-ids orders-critical --json
   ```
   `null` et le nouveau `build_id` doivent tous deux annoncer
   `rollout_status: "active"` et un `active_worker_count` non nul.
3. Lancez le drainage de la cohorte non versionnée quand les nouveaux workers
   traitent du travail :
   ```bash
   dw task-queue:drain orders-critical --unversioned
   ```
   `drain_intent` passe à `draining` pour la cohorte non versionnée. Les workers
   encore en marche traitent leurs tâches en cours mais cessent d'en prendre
   de nouvelles. Les inscriptions ou heartbeats ultérieurs sans `build_id`
   arrivent eux aussi en état de drainage.
4. Attendez que `active_worker_count` et `draining_worker_count` soient tous
   deux à zéro pour la cohorte non versionnée. Elle reste répertoriée avec
   `drain_intent: "draining"` pour confirmer le caractère permanent de la migration.

## Tester un nouveau build en canari {#canary-a-new-build}

Un canari est un second build recevant une petite fraction du trafic pendant
que le build principal continue de servir. Utilisez un `build_id` distinct
pour pouvoir inspecter individuellement l'état de chaque cohorte.

1. Déployez les workers canaris avec `build_id: orders-worker-2026-04-22-canary`.
2. Inspectez `list_task_queue_build_ids` pour confirmer que les deux cohortes
   annoncent `rollout_status: "active"` avec les nombres de workers attendus.
3. Promouvez le canari en démarrant davantage de workers sur le nouveau
   `build_id` et en réduisant le nombre de workers du principal, ou retirez-le
   en le drainant :
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22-canary
   ```

Le serveur ne contrôle pas la répartition des tâches entre cohortes. Les
opérateurs dimensionnent les populations et s'appuient sur la distribution
des interrogations pour pondérer le trafic. L'état de déploiement build-id
permet de confirmer quelles cohortes peuvent encore prendre du travail et de
déclencher un transfert propre lorsqu'une cohorte est prête à s'arrêter.

## Drainer un ancien build {#drain-an-older-build}

Le drainage conserve les tâches déjà sous bail sur l'ancien build tandis que
les nouvelles tâches vont aux autres cohortes actives de la file :

```bash
dw task-queue:drain orders-critical --build-id orders-worker-2026-04-21-z9
```

Le serveur inscrit `drain_intent: "draining"` sur la cohorte et marque chaque
worker enregistré sous ce `build_id` comme en drainage à son prochain
heartbeat. L'appel est idempotent : sa répétition ne réinitialise pas
`drained_at`, vous pouvez donc le réessayer sans risque dans une automatisation.

Une fois la ligne d'un worker marquée `draining`, les routes d'interrogation
des tâches de workflow, d'activité et de requête de lecture cessent de lui
louer du nouveau travail. Les interrogations échouent avec HTTP `409`,
`poll_status: "draining"` et `reason: "worker_draining"` jusqu'à réactivation
de la cohorte.

`draining` fait partie du contrat général des réponses d'interrogation, pas
d'un champ réservé au drainage. Cette même interface `poll_status` permet aux
workers d'observer les interrogations normales `leased` et `empty`, les
résultats d'admission `throttled` et les échecs de coordination typés
`unavailable` sur les autres chemins d'interrogation.

Surveillez le drainage en interrogeant `list_task_queue_build_ids` et en
vérifiant la baisse de `active_worker_count` et `draining_worker_count` jusqu'à
zéro. La cohorte affiche alors `rollout_status: "draining"` avec des nombres
de workers nuls : aucun worker vivant ne reste et l'intention de l'opérateur
consigne toujours le drainage. C'est le moment sûr pour arrêter les processus
worker et supprimer l'artefact du build.

## Revenir sur un build défectueux {#roll-back-a-bad-build}

Le retour arrière inverse le flux : réactivez une cohorte drainée auparavant,
redirigez-y les nouvelles tâches et drainez le build défectueux.

1. Réactivez la cohorte connue comme fonctionnelle :
   ```bash
   dw task-queue:resume orders-critical --build-id orders-worker-2026-04-21-z9
   ```
   Le serveur efface `drain_intent` et `drained_at`, et remet immédiatement à
   `active` les lignes des workers qui envoient encore des heartbeats sous ce
   `build_id`, pour que le point de lecture cesse d'annoncer le drainage.
2. Drainez la cohorte défectueuse :
   ```bash
   dw task-queue:drain orders-critical --build-id orders-worker-2026-04-22
   ```
3. Augmentez à nouveau la capacité du build fonctionnel ou redéployez-le si
   ses workers sont déjà arrêtés. Les workers s'inscrivant sous son `build_id`
   prennent en compte l'intention de drainage effacée et arrivent en état `active`.

La réactivation est également idempotente. La répéter sur une cohorte déjà
active ne fait rien ; les retours arrière automatisés peuvent donc l'émettre sans risque.

## Référence des points de terminaison et commandes {#endpoints-and-commands-reference}

| Intention | Point de terminaison HTTP | CLI | Méthode du SDK Python |
| --- | --- | --- | --- |
| Inspecter l'état d'une cohorte | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Marquer une cohorte en drainage | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Réactiver une cohorte drainée auparavant | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |

Le drainage et la réactivation prennent un corps JSON `{"build_id": "..."}`,
ou `{"build_id": null}` pour la cohorte non versionnée. La CLI exprime cette
dernière avec `--unversioned` et les autres builds avec `--build-id <value>`.
Combiner les deux provoque un échec immédiat.

## Références associées {#related-references}

- [Espaces de noms, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers)
  pour l'appel `POST /api/worker/register` inscrivant `build_id` sur chaque worker.
- [Admission des files de tâches](/docs/polyglot/task-queue-admission) pour les
  budgets d'emplacements de workers et de distribution appliqués avec l'état de déploiement.
- [Référence de l'API Server](/docs/polyglot/server-api-reference) pour la liste
  complète des routes du plan de contrôle, leurs rôles et en-têtes de protocole requis.
- [Référence des commandes CLI](/docs/polyglot/cli-reference) pour les arguments
  et options de chaque sous-commande `dw task-queue:*`.
