---
sidebar_position: 7
title: Déploiement des identifiants de build des workers
description: Inspecter les cohortes, choisir le build des nouveaux démarrages et conserver la capacité des exécutions épinglées.
tags: [worker-protocol, operations, rollouts, build-ids, task-queues]
keywords: [build des workers, drainage, retour arrière, canary, workers sans version]
---

# Déploiement des identifiants de build des workers

## Relecture avant un changement de build {#replay-before-changing-builds}

Avant de promouvoir un candidat, relisez des historiques représentatifs ouverts et récemment clôturés avec son code applicatif exact. Avant un retour arrière, relisez les historiques écrits par le nouveau build avec l’ancien artefact. Suivez le [contrôle de relecture](../testing.md#replay-before-deployment) : une cohorte de routage compatible ou une vérification d’intégrité réussie ne prouve pas à elle seule la compatibilité de relecture.

Inspectez les cohortes, choisissez le build des nouveaux workflows et conservez des workers compatibles pour les exécutions existantes. La promotion change la sélection des nouveaux démarrages. Le drainage empêche de nouvelles prises de tâches par la cohorte. Aucune de ces opérations ne migre les exécutions ni ne prouve qu'un build peut être supprimé ; c'est le [retrait protégé](#retire-a-build-or-queue) qui en décide.

[Compatibilité et routage des workers](/docs/polyglot/worker-compatibility-routing) décrit l'identité portée par les tâches, activités, reprises, enfants et continue-as-new. Une cohorte est délimitée par `(namespace, task_queue, build_id)`. Sans `build_id`, une inscription appartient à la cohorte non versionnée `null`.

## État du déploiement conservé par le serveur {#rollout-state-the-server-records}

| Champ | Signification |
| --- | --- |
| `build_id` | Identité enregistrée ; `null` désigne la cohorte non versionnée. |
| `rollout_status` | `active`, `active_with_draining`, `draining`, `stale_only` ou `no_workers`. |
| `drain_intent`, `drained_at` | Intention persistante et premier horodatage du drainage ; le répéter ne décale pas cet horodatage. |
| `promoted_at`, `rolled_back_at` | Horodatages persistants de promotion et de retour arrière. |
| `new_start_selected` | Cohorte sélectionnée par promotion explicite. `false` n'exclut pas le repli sur une cohorte unique décrit plus bas. |
| `active_worker_count` | Inscriptions récentes non drainées ; ni places libres ni garantie de couverture de tous les types de workflow. |
| `draining_worker_count` | Inscriptions récentes drainées, sans nouvelle prise de tâche ; elles ne détiennent pas nécessairement un bail. |
| `stale_worker_count` | Inscriptions dont le heartbeat dépasse `stale_after_seconds`. |
| `total_worker_count` | Total des inscriptions actives, drainées et périmées. |
| `runtimes`, `sdk_versions` | Chaînes de runtime et de SDK observées dans les inscriptions. |
| `last_heartbeat_at`, `first_seen_at` | Fraîcheur et ancienneté des inscriptions, pas preuve de l'absence d'exécutions restantes. |
| `pending_workflow_tasks` | Compteurs et diagnostic des tâches de workflow, détaillés ci-dessous. |

L'intention de drainage survit aux redémarrages, à l'absence de workers et aux heartbeats périmés. Seule une reprise explicite l'efface ; l'absence d'un worker ne le réactive pas.

## Inspecter le déploiement {#inspect-the-rollout}

Vérifiez le namespace et la file exacts avant de modifier la capacité :

```bash
curl -fsS "$DURABLE_WORKFLOW_SERVER_URL/api/task-queues/orders-critical/build-ids" \
  -H "Authorization: Bearer $DW_OPERATOR_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

```bash
dw task-queue:build-ids orders-critical --namespace orders-prod --json
```

```python
from durable_workflow import Client

async with Client("https://durable-workflow.example", token=operator_token,
                  namespace="orders-prod") as client:
    rollout = await client.list_task_queue_build_ids("orders-critical")
    for cohort in rollout.build_ids:
        print(cohort.build_id, cohort.rollout_status, cohort.total_worker_count)
```

Le snapshot HTTP fait référence pour les champs supplémentaires absents du modèle de réponse d'un ancien SDK.

## Tâches de workflow en attente par cohorte {#pending-workflow-tasks-by-cohort}

`pending_workflow_tasks` compte uniquement les tâches de workflow de ce namespace et de cette file, groupées selon leur compatibilité effective, avec celle de l'exécution comme repli. Ce n'est ni la file d'activités, ni le nombre d'exécutions ouvertes, ni le débit ou la charge des processus.

| Sous-champ | Interprétation |
| --- | --- |
| `ready_count` | Lignes de tâches de workflow à l'état `ready`. |
| `leased_count` | Lignes à l'état `leased`. |
| `total_count` | `ready_count + leased_count`. |
| `status` | `idle` si aucune tâche ; sinon `pending`, ou `no_compatible_worker` pour un build non nul sans worker actif. |
| `operator_visible_signal`, `message` | Diagnostic des workers compatibles manquants ; ces valeurs peuvent sinon être nulles. |

La cohorte non versionnée ne reçoit pas ce diagnostic propre au build. Un champ absent, une requête échouée ou une observation ancienne ne signifie pas zéro. Relisez le snapshot et vérifiez les heartbeats ainsi que les types déclarés.

Un ancien build peut avoir deux tâches prêtes et une louée, tandis que le nouveau n'en a aucune. Un total de trois pour la file ne désigne pas la flotte à renforcer. Sans worker actif de l'ancien build, restaurez sa capacité compatible ou reprenez-le si son drainage était accidentel. Des workers du nouveau build ne consomment pas les tâches épinglées à l'ancien. Si seules des inscriptions périmées subsistent, recherchez les processus ou heartbeats perdus avant de les compter comme capacité disponible.

Réduisez une cohorte prudemment après examen de ses tâches, inscriptions récentes, types de workflow, places disponibles et intention de drainage. Conservez de la capacité pour les baux et les futures tâches des exécutions existantes. Une exécution attendant signal, timer, activité ou enfant peut n'avoir aucune tâche de workflow maintenant et nécessiter l'ancien build plus tard. Les activités peuvent utiliser d'autres files enregistrées. Cet endpoint n'autorise ni la suppression sûre du build ni la réduction à zéro de la dernière cohorte nécessaire ; utilisez pour cela le [retrait protégé](#retire-a-build-or-queue).

[Server #534](https://github.com/durable-workflow/server/issues/534) suit la capacité distincte de collecte et de réduction à zéro. Aucun déclencheur KEDA/HPA intégré n'est documenté ici.

## Première transition du non versionné au versionné {#first-cutover-unversioned-to-versioned}

1. Démarrez les nouveaux workers avec un identifiant stable ; vérifiez namespace, file, types et heartbeats récents.
2. Inspectez les deux cohortes et les exécutions d'origine. Un nom plus récent ou un nombre de workers ne prouve aucune compatibilité.
3. Promouvez explicitement le build lorsque les nouveaux démarrages doivent le sélectionner :

   ```bash
   dw task-queue:promote orders-critical --namespace orders-prod --build-id orders-v2
   ```

4. Gardez les workers compatibles avec les historiques existants. La promotion ne modifie pas les anciens épinglages ; drainer n'est pas migrer.
5. Retirez l'ancien build avec le [retrait protégé](#retire-a-build-or-queue) dès que son inventaire est vide. Des compteurs vides et zéro inscription ne le prouvent pas. Conservez l'artefact tant qu'une exécution peut en dépendre.

## Tester un nouveau build en canary {#canary-a-new-build}

Le serveur ne répartit pas les cohortes selon un pourcentage. Il choisit, pour les nouveaux démarrages, la dernière cohorte promue qui n'est ni drainée ni révoquée. À défaut, il choisit l'unique cohorte active déclarant le type demandé, puis l'unique cohorte active de la file. Sinon l'exécution reste non épinglée. Plusieurs cohortes actives du même type sans promotion n'impliquent donc aucune répartition pondérée.

Ajouter des workers change la capacité, pas la politique des démarrages promus. Pour isoler un canary, utilisez une autre file et routez-y explicitement certains démarrages applicatifs. Conservez les anciens workers pour les exécutions déjà épinglées lors d'une promotion sur la file d'origine.

## Déplacer une chaîne à sa prochaine poursuite {#move-a-chain-at-its-next-continuation}

Lorsque le Server et le SDK négocient `continue_as_new_target_build` avec le protocole worker 1.21, vous pouvez choisir le build promu au point de continue-as-new. L’exécution suivante crée un nouvel historique avec les arguments transmis. Utilisez cette option quand le build promu peut décoder et accepter ces arguments. Un continue-as-new ordinaire conserve le build épinglé de l’exécution précédente.

Quand il ferme l’exécution précédente, le Server sélectionne la promotion persistée pour l’espace de noms, la file et le type de workflow exacts de l’exécution suivante. Le build de destination peut être à zéro worker si le Server dispose déjà d’une preuve persistée qu’il prend en charge ce type. En l’absence de promotion admissible, le Server refuse la transition et laisse l’exécution actuelle ouverte. Le worker signale `promoted_build_unavailable` via le mécanisme habituel de réessai de la tâche de workflow. Waterline affiche le refus et l’heure du prochain essai s’il est planifié. Une transition réussie enregistre les deux builds épinglés dans les historiques des exécutions liées.

Gardez les workers de l’ancien build disponibles tant que des exécutions ouvertes en ont besoin. Chaque chaîne change de build à la validation de sa propre poursuite avec cette option. Les exécutions enfants ouvertes conservent leurs builds épinglés.

## Drainer un ancien build {#drain-an-older-build}

Le drainage empêche les polls de workflow, d'activité et de query de cette cohorte de prendre de nouvelles tâches ; il ne déplace pas ces tâches. Le poll d'un worker drainé reçoit HTTP409 avec `poll_status: "draining"` et `reason: "worker_draining"`. Les baux existants conservent leur autorité d'origine.

```bash
dw task-queue:drain orders-critical --namespace orders-prod --build-id orders-v1
```

Ne drainez pas simplement parce que le nouveau build sait prendre son propre travail : d'anciennes exécutions peuvent rester bloquées. Pour corriger un drainage prématuré, reprenez la cohorte et restaurez les workers du build d'origine :

```bash
dw task-queue:resume orders-critical --namespace orders-prod --build-id orders-v1
```

Drainer ou arrêter tous les workers ne prouve pas que l'artefact est supprimable. Le drainage reste l'arrêt d'urgence : il refuse immédiatement les polls du build, qu'il reste ou non du travail épinglé dessus. Utilisez le [retrait protégé](#retire-a-build-or-queue) pour décider de sa suppression.

## Retirer un build ou une file {#retire-a-build-or-queue}

Native Server 3.14.0 et versions ultérieures indiquent si un build ou une file peut être supprimé sans risque, et refusent le retrait tant qu'une dépendance active subsiste. Exigez que `capabilities.worker_build_retirement` vaille exactement `true` dans `GET /api/cluster/info` ; le Server PHP publié ne sert pas ces routes. Utilisez un jeton opérateur ou administrateur et le namespace, comme pour les autres routes build-id.

| Intention | Endpoint HTTP |
| --- | --- |
| Inspecter un build | `GET /api/deployments/{namespace}/{taskQueue}@{buildId}/retirement` (`@unversioned` pour la cohorte non versionnée) |
| Retirer un build | `POST /api/deployments/{namespace}/{taskQueue}@{buildId}/retire` |
| Inspecter toutes les cohortes d'une file | `GET /api/task-queues/{taskQueue}/retirement` |
| Retirer une file | `POST /api/task-queues/{taskQueue}/retire` |

1. Promouvez le build de remplacement et laissez tourner les workers de l'ancien. Ils terminent les exécutions encore épinglées dessus, les reprises différées, les timers et les chaînes continuées.
2. Inspectez l'ancien build jusqu'à ce que `retirable` vaille `true` :

   ```bash
   dw task-queue:retirement orders-critical --namespace orders-prod --build-id orders-v1 --json
   ```

   Chaque blocage donne son `count` exact, jusqu'à 20 identités d'exemple et une action `recovery` : laisser le travail se terminer, ou annuler ou terminer les exécutions que vous choisissez d'abandonner.
3. Retirez-le, éventuellement lié à l'`observation.inventory_revision` inspectée :

   ```bash
   dw task-queue:retire orders-critical --namespace orders-prod --build-id orders-v1 \
     --expected-revision "$INVENTORY_REVISION"
   ```

4. N'arrêtez les processus de l'ancien build qu'après la réussite du retrait.

Sans `--build-id` ni `--unversioned`, les deux commandes portent sur toutes les cohortes de la file. Ces commandes arrivent dans la première version de la CLI après 2.11.0 ; avec la CLI 2.11.0 ou antérieure, appelez directement les routes HTTP.

L'inventaire compte les exécutions ouvertes épinglées au build (y compris celles en attente, continuées et enfants), les tâches prêtes, louées et différées (reprises d'activité et timers pas encore échus), les activités ouvertes, les validations de mise à jour en attente et, pour une file, les planifications qui y démarrent des exécutions. Une exécution ouverte sans file de tâches enregistrée rend l'inventaire `incomplete`, et le retrait est indisponible.

L'inspection n'est qu'un aperçu. Le retrait recompte dans la même transition sérialisée que les démarrages, les reprises et la création de tâches, et n'écrit que lorsqu'il ne reste rien. Un retrait refusé répond HTTP409 et ne change rien ; suivez `expected_resolution` puis inspectez de nouveau.

| `reason` | Signification |
| --- | --- |
| `unknown_deployment`, `unknown_task_queue` | Aucun worker inscrit et aucun déploiement enregistré pour la cible. |
| `selected_for_new_starts` | Les nouveaux démarrages de la file sélectionnent encore ce build. Promouvez d'abord le remplaçant. |
| `inventory_incomplete` | Des exécutions ouvertes non attribuées existent. Un inventaire manquant n'autorise jamais un retrait. |
| `live_dependencies` | Au moins un blocage a un compteur non nul. |
| `inventory_changed` | L'`expected_inventory_revision` ne correspond plus. |

Un retrait réussi renvoie HTTP200 avec `outcome: "retired"`, `retired_at` et `retired_by`. L'intention de déploiement du build passe à l'état terminal `drained` : il n'est plus jamais sélectionné pour les nouveaux démarrages, ne peut être ni promu ni repris via le cycle de vie du déploiement, et ses workers restent en drainage. Quand toutes les cohortes d'une file sont retirées et qu'aucun worker actif ne reste, les nouveaux démarrages y sont refusés avec `task_queue_draining` et `routing_status: "retired"` jusqu'à l'inscription d'une nouvelle cohorte active. Les pins d'exécution, files d'activités, historiques et échéances restent inchangés.

Pour récupérer, `dw task-queue:resume` (`POST /api/task-queues/{taskQueue}/build-ids/resume`) remet un build retiré à `active` ; le retrait garantissait qu'il n'avait aucun travail à ce moment-là.

## Revenir d'un build défectueux {#roll-back-a-bad-build}

Restaurez les workers connus comme fonctionnels, reprenez leur cohorte si nécessaire et promouvez ce build pour les futurs démarrages. Appliquez ensuite le rollback au mauvais déploiement. Le rollback ne réécrit pas les épinglages et ne remet pas leur travail restant à un autre build. Gardez des workers compatibles ou prenez une décision explicite de récupération applicative.

Les réessais, les exécutions enfants et le continue-as-new ordinaire héritent de l’épinglage initial. Gardez une identité de build stable pour les déploiements compatibles avec la relecture. Les chaînes de longue durée peuvent [choisir le build promu](#move-a-chain-at-its-next-continuation) lors de la poursuite. Préservez les champs de compatibilité enregistrés lors de la récupération.

## Référence des endpoints et commandes {#endpoints-and-commands-reference}

| Intention | Endpoint HTTP | CLI | Méthode du SDK Python |
| --- | --- | --- | --- |
| Inspecter les cohortes | `GET /api/task-queues/{taskQueue}/build-ids` | `dw task-queue:build-ids` | `Client.list_task_queue_build_ids` |
| Sélectionner les nouveaux démarrages | `POST /api/task-queues/{taskQueue}/build-ids/promote` | `dw task-queue:promote` | `Client.promote_task_queue_build_id` |
| Drainer | `POST /api/task-queues/{taskQueue}/build-ids/drain` | `dw task-queue:drain` | `Client.drain_task_queue_build_id` |
| Reprendre | `POST /api/task-queues/{taskQueue}/build-ids/resume` | `dw task-queue:resume` | `Client.resume_task_queue_build_id` |
| Inspecter le retrait | `GET /api/task-queues/{taskQueue}/retirement`, `GET /api/deployments/{name}/retirement` | `dw task-queue:retirement` | — |
| Retirer | `POST /api/task-queues/{taskQueue}/retire`, `POST /api/deployments/{name}/retire` | `dw task-queue:retire` | — |

Les routes de promotion, de drainage et de reprise acceptent `{"build_id":"orders-v2"}` ou `{"build_id":null}` pour la cohorte non versionnée. Les routes de retrait acceptent un corps optionnel `{"expected_inventory_revision":"..."}`. Les commandes CLI choisissent soit `--build-id`, soit `--unversioned`, jamais les deux.

Le cycle de vie complet utilise `GET /api/deployments` et `POST /api/deployments/{name}/{promote,drain,resume,rollback}`. Reprenez le nom retourné, par exemple `orders-prod/orders-critical@orders-v2`, et son namespace d'origine. Sur le chemin Apache publié, gardez le séparateur `/` du nom : encoder le nom composé entier peut produire une HTML404 Apache avant d'atteindre l'API. Une action refusée retourne HTTP409 avec un `reason` typé et un tableau `blockages`. Consultez `expected_resolution` ; un refus n'est pas une promotion réussie. [Server #521](https://github.com/durable-workflow/server/issues/521) concerne le miroir OpenAPI actuel incomplet, pas une nouvelle implémentation ni un changement des schémas figés.

## Références associées {#related-references}

- [Compatibilité et routage des workers](/docs/polyglot/worker-compatibility-routing)
- [Namespace, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers)
- [Admission des files de tâches](/docs/polyglot/task-queue-admission)
- [Mises à niveau progressives](/docs/rolling-upgrades)
- [Référence de l'API Server](/docs/polyglot/server-api-reference)
- [Référence des commandes CLI](/docs/polyglot/cli-reference)
