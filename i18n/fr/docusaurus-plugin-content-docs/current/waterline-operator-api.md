---
sidebar_position: 13
title: Référence API opérateur Waterline
description: Contrats API typés de Waterline pour les listes, le détail d'exécution, l'export d'historique, les planifications, les vues enregistrées, les préférences et les actions opérateur.
tags:
  - Waterline
  - observability
  - API
  - reference
keywords:
  - référence API Waterline
  - détail de l'exécution sélectionnée
  - export d'historique
  - contrat des actions possibles
  - actions opérateur de workflow
---

# Référence API opérateur Waterline {#waterline-operator-api-reference}

Waterline est l'interface opérateur de l'état durable pour Laravel embarqué et
les déploiements de serveur autonome. Son interface utilise la même API
HTTP+JSON documentée ici. Scripts, tableaux de bord et agents peuvent donc lire
les faits durables sans analyser de HTML.

Utilisez cette référence pour des preuves opérateur typées : détail d'exécution,
export d'historique, actions possibles, commandes disponibles, vues enregistrées,
préférences et visibilité des planifications. La [supervision](./monitoring.md)
explique la distinction entre état durable Waterline et télémétrie worker/runtime.

## Installation {#installation}

Installez Waterline dans l'application Laravel embarquée qui installe le paquet Workflow :

```bash
composer require \
  %%artifact.waterlineComposerPackage%% \
  %%artifact.workflowComposerPackage%%
php artisan waterline:install
```

Les versions générées sélectionnent des versions stables 2.x de Waterline et
Workflow. Le mode embarqué lit directement l'état de l'application sans SDK de
service. Après mise à niveau de Waterline, publiez les ressources actuelles :

```bash
composer update durable-workflow/waterline
php artisan waterline:publish
```

Pour l'observation en mode service dans un hôte Laravel, installez aussi le SDK PHP :

```bash
composer require %%artifact.phpSdkComposerPackage%%
```

L'image de service Waterline autonome inclut déjà ce SDK. Les paramètres de
connexion, d'authentification et de persistance sont décrits dans la
[supervision](./monitoring.md#waterline-service).

### Langue de l'interface {#interface-language}

Waterline prend en charge l'anglais, le portugais brésilien, le chinois simplifié,
le français, l'allemand, le japonais, l'espagnol et l'ukrainien, en mode embarqué
et service. Définissez la langue dans l'environnement de l'application Laravel
ou du conteneur de service :

```dotenv
WATERLINE_LOCALE=es
```

| Langue | Paramètre |
| --- | --- |
| Anglais | `en` |
| Portugais brésilien | `pt-BR` |
| Chinois simplifié | `zh-Hans` |
| Français | `fr` |
| Allemand | `de` |
| Japonais | `ja` |
| Espagnol | `es` |
| Ukrainien | `uk` |

Les alias régionaux espagnols comme `es-ES`, `es-MX` et `es-419` sélectionnent
l'interface espagnole commune. `pt`, `pt_br` et les variantes de casse
sélectionnent le portugais brésilien (`pt-BR`). Les autres régions portugaises
reviennent à l'anglais. Les nombres, libellés des graphiques et durées relatives
suivent la langue d'interface choisie.
Utilisez `zh-Hans` pour le chinois simplifié. `zh`, `zh-CN`, `zh-SG` et les
balises explicitement simplifiées comme `zh-Hans-CN` sélectionnent la même
interface. Les traits de soulignement et variantes de casse sont acceptés.
Les balises traditionnelles `zh-Hant`, `zh-TW` et `zh-HK` reviennent à l'anglais.
Utilisez `ja` pour le japonais. Les alias régionaux comme `ja-JP`, traits de
soulignement et variantes de casse sélectionnent la même interface japonaise.
Utilisez `fr` pour le français. `fr-FR`, `fr-CA`, traits de soulignement et
variantes de casse sélectionnent l'interface française commune.
Utilisez `de` pour l'allemand. `de-DE`, `de-AT`, `de-CH`, traits de soulignement
et variantes de casse sélectionnent l'interface allemande commune.

L'anglais est la langue par défaut et de repli. Les applications embarquées
peuvent aussi définir `waterline.locale` dans leur configuration résolue.
Reconstruisez le cache de configuration Laravel après modification. Waterline
conserve la langue de l'application hôte, les noms de workflows, identifiants,
charges utiles et textes d'exception originaux. Les noms de champs JSON et
états machine gardent leurs valeurs existantes.

## Frontière de déploiement {#deployment-boundary}

Waterline dispose de deux adaptateurs backend :

- Le mode embarqué s'exécute dans Laravel et lit l'état durable du paquet
  Workflow dans le même processus.
- Le mode service exécute l'image publiée et lit un espace de noms du serveur
  autonome via `durable-workflow/sdk` et son API publique.

Les deux exposent les routes documentées ici. Le mode service les traduit vers
les contrats serveur correspondants :

| Famille de routes Waterline | Contrat du serveur autonome utilisé en mode service |
| --- | --- |
| `GET /waterline/api/v2/health` | Santé serveur, enregistrement des workers et visibilité des files. |
| `GET /waterline/api/stats` | Tableau de bord opérateur et instantané de métriques limités à l'espace de noms. |
| Listes de workflows, détail d'exécution et export d'historique | Liste, détail, exécutions, historique et diagnostics de la [référence API Server](./polyglot/server-api-reference.md). |
| Signaux, mises à jour, requêtes de lecture, annulation, terminaison, réparation et archivage | Contrats correspondants de commandes et réparation des workflows serveur. |
| Routes sous `/waterline/api/v2/schedules` | Contrats serveur de liste, détail, historique et mutation des planifications. |

API serveur, CLI et SDK restent directement accessibles avec Waterline. Ne
supposez aucune visibilité entre modes ou espaces de noms : lecture et actions
restent dans le runtime et l'espace de noms propriétaires. Les
[modes de déploiement](./polyglot/deployment-modes.md) définissent cette frontière
commune du produit.

## Chemin de base et périmètre {#base-path-and-scope}

Waterline est monté sous le chemin configuré dans l'application Laravel. Les
exemples utilisent `/waterline`. Si votre préfixe diffère, conservez les suffixes
`/api/...`.

Quand `WATERLINE_NAMESPACE` est configuré, chaque route de liste, détail,
planification et action opérateur est limitée à cet espace. Les lectures et
commandes vers un autre espace renvoient une sémantique « introuvable » sans
divulguer l'état des workflows de cet espace.

```bash
curl -sS "$APP_URL/waterline/api/instances/order-1001" \
  -H "Accept: application/json" | jq '.status, .run_id, .actionability'
```

## Authentification {#authentication}

Chaque contrôleur d'interface et d'API JSON passe par le contrôle d'accès
Waterline. En mode embarqué, l'hôte Laravel le définit : gardes, middlewares,
gates, politiques, sessions SSO/OIDC/SAML, groupes d'annuaire, jetons de service
et limites de débit applicables.

Le groupe actuel de l'API JSON opérateur exclut le middleware CSRF Laravel afin
que l'hôte applique une frontière cohérente de session ou jeton aux lectures et
commandes. L'hôte reste responsable de l'authentification et de la documentation
des protections CSRF ajoutées autour de l'API pour les sessions navigateur.

L'image autonome n'a pas d'utilisateurs d'application hôte. Placez-la derrière
un proxy inverse authentifiant ou sur une interface privée avant de définir
`WATERLINE_ALLOW_UNAUTHENTICATED=true`. Ce paramètre délègue le contrôle d'entrée
au déploiement environnant. Séparément, `WATERLINE_SERVER_TOKEN` authentifie les
appels SDK PHP au serveur autonome. N'exposez jamais cet identifiant au navigateur.

`WATERLINE_ACCESS_MODE=read_only` bloque localement les routes de mutation.
`operator` les active, mais le serveur connecté applique toujours le rôle de
son jeton et les autorisations d'espace de noms. La
[supervision](./monitoring.md#waterline-service) donne un exemple de déploiement
et détaille les deux frontières d'authentification.

## Tableau de bord et santé {#dashboard-and-health}

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/waterline/api/stats` | Totaux du tableau de bord, compteurs de retard, politique de réparation, métriques opérateur et tendances des workers. |
| `GET` | `/waterline/api/v2/health` | Santé du paquet/runtime Waterline et disponibilité de la source v2. |

`/waterline/api/stats` est le résumé du tableau de bord. Traitez `operator_metrics`
comme des diagnostics JSON propres à Waterline, pas une source de collecte
Prometheus. Utilisez les métriques SDK worker pour la latence du runtime et la
télémétrie applicative personnalisée.

Le [périmètre d'exploitation opérateur](./operator-operating-envelope.md) définit
leur interprétation lors des déploiements et incidents. En particulier :

| Famille de champs | Signification |
| --- | --- |
| `operator_metrics.backlog.*` | Comptages durables du travail exécutable, différé, loué, défaillant, à réparer, à prise en charge échouée ou bloqué par compatibilité, et faits globaux de débit `tasks_added_last_minute` et `tasks_dispatched_last_minute`. |
| `operator_metrics.matching_role.*` | Contrat local de mise en correspondance/distribution du processus répondant : `queue_wake_enabled`, topologie `shape`, `task_dispatch_mode`, `partition_primitives` figées et `backpressure_model` courant. |
| `operator_metrics.repair.*` | Empreinte des passages de réparation : candidats choisis, ancienneté et pression de balayage. |
| `operator_metrics.projections.*` | Comptages des dérives de projection des résumés, attentes, chronologies, temporisateurs et filiations. |
| `operator_metrics.command_contracts.*` | Instantanés des anciens contrats WorkflowStarted qui nécessitent encore un rattrapage. |
| `operator_metrics.history.*` | Pression de taille et de nombre d'événements et recommandations continue-as-new. |
| `queue_visibility.available`, `queue_visibility.reason` | Disponibilité de la visibilité des files par espace de noms sur cet hôte et raison d'indisponibilité. |
| `queue_visibility.task_queues[].stats.*` | Retard et ancienneté par file, nombre de pollers, tâches de workflow/activité prêtes ou louées et débits `tasks_added_last_minute` / `tasks_dispatched_last_minute` de la file. |
| `queue_visibility.task_queues[].repair.*` | Pression de réparation locale : candidats, échecs de distribution, baux expirés, distributions en retard et ancienneté maximale de chaque condition. |
| `coordination_alerts[]` | Synthèse d'avertissements et erreurs des contrôles de santé et des risques des files : retard sans pollers, pollers périmés ou anciens candidats à la réparation. |
| `checks[]`, `categories.*` | Contrôles de santé v2 bloquants ou indicatifs, avec `category = correctness \| acceleration` par contrôle et synthèses de catégorie utilisées dans la vue workers. |
| `engine_source`, `readiness_contract` | Utilisation active du pont opérateur v2 et contrat de disponibilité régissant cet état. |

Les champs de débit répondent à une question précise : les entrées durables
arrivent-elles plus vite que leur distribution ? `tasks_added_last_minute`
compte les lignes de tâche distinctes créées dans les 60 dernières secondes.
`tasks_dispatched_last_minute` compte celles dont la dernière distribution
réussie est dans ce même intervalle.

Utilisez ces totaux avec les routes serveur de visibilité des files. Waterline
indique si les entrées dépassent la distribution. `/api/task-queues` et
`/api/task-queues/{taskQueue}` indiquent si la file chargée est `saturated`,
volontairement `throttled`, `no_active_workers` ou manque autrement de pollers
sains ou d'emplacements.

`GET /waterline/api/v2/health` expose les mêmes preuves locales aux files sans
quitter Waterline. Scripts et tableaux de bord qui ont besoin de la situation
d'un espace de noms doivent lire `queue_visibility.task_queues[]` pour les
statistiques par file et `coordination_alerts[]` pour savoir quelle file ou
condition de santé nécessite l'attention de l'opérateur.

Les champs `matching_role` répondent à une autre question : quelle topologie de
mise en correspondance sert ce nœud ? `shape` distingue `in_worker` et
`dedicated`. `partition_primitives` fige les axes de routage
`connection`/`queue`/`compatibility`/`namespace`. `backpressure_model` annonce
actuellement `lease_ownership`. Ce bloc est local au processus. Lors d'un
déploiement à topologies mixtes, comparez-le entre nœuds avant d'attribuer les
différences de retard ou d'interrogation à un problème worker.

`GET /waterline/api/v2/health` utilise la même distinction : `error` bloque,
`warning` est indicatif et `ok` signifie que le pont opérateur v2 courant est prêt.

## Vues de liste {#list-views}

Les listes sont regroupées par état durable :

| Méthode | Chemin | Catégorie |
| --- | --- | --- |
| `GET` | `/waterline/api/flows/running` | Exécutions ouvertes ou activement bloquées. |
| `GET` | `/waterline/api/flows/completed` | Exécutions fermées avec succès, y compris celles poursuivies avec `closed_reason = continued`. |
| `GET` | `/waterline/api/flows/failed` | Exécutions échouées. |
| `GET` | `/waterline/api/flows/cancelled` | Exécutions annulées. |
| `GET` | `/waterline/api/flows/terminated` | Exécutions terminées de force. |

Les lignes sont des résumés opérateur compacts. Les champs stables incluent
l'identité (`id`, `instance_id`, `run_id`, `workflow_type`), l'état (`status`,
`closed_reason`, `archived_at`), les temps, `history_event_count`,
`history_size_bytes`, `continue_as_new_recommended` et les indicateurs de
réparation ou d'action possible comme `repair_blocked`.

## Détail d'exécution sélectionnée {#selected-run-detail}

Waterline a deux modes d'adressage :

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}` | Exécution courante sélectionnée d'une instance. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}` | Exécution explicitement sélectionnée. |
| `GET` | `/waterline/api/flows/{id}` | Ancienne recherche de détail par ligne Waterline ou identifiant d'exécution. |

Le détail d'exécution est le contrat JSON de référence des écrans opérateur.
Il contient l'état durable et les diagnostics dérivés :

| Famille de champs | Signification |
| --- | --- |
| `activities`, `timers`, `waits`, `children` | Attentes courantes et historiques reconstruites d'abord à partir de l'historique typé. |
| `signals`, `updates`, `declared_signals`, `declared_updates`, `declared_queries` | Cycle de vie des commandes et cibles chargeables du contrat de workflow. |
| `timeline` | Événements durables ordonnés et entrées de diagnostic. |
| `exceptions`, `logs` | Faits d'échec et contexte de relecture ou diagnostic. |
| `can_signal`, `can_update`, `can_query`, `can_cancel`, `can_terminate`, `can_archive` | Actions disponibles pour l'interface et l'automatisation sur l'exécution choisie. |
| `actionability` | Contrat versionné de réparation et de preuves décrit ci-dessous. |

L'automatisation doit préférer le détail aux captures d'écran. Une capture
montre ce qu'a vu l'opérateur. Le détail explique pourquoi un workflow peut
ou non être réparé, interrogé, annulé, archivé ou relu.

## Export d'historique {#history-export}

Les exports sont des ensembles de relecture et diagnostic. Ils incluent
volontairement les charges utiles stockées des workflows, commandes, activités,
mises à jour, tâches, échecs et historique pour reproduire ou archiver l'exécution.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/history-export` | Exporter l'exécution courante sélectionnée d'une instance. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/history-export` | Exporter une exécution explicite. |
| `GET` | `/waterline/api/flows/{id}/history-export` | Ancien export de détail par ligne Waterline ou identifiant d'exécution. |

Si l'export peut quitter un environnement protégé, configurez d'abord la
suppression des données sensibles de l'export. Les outils en aval doivent
préserver ses métadonnées `redaction` pour rendre la politique appliquée visible.

## Contrat des actions possibles {#actionability-contract}

Waterline annote listes, détails, chronologies et exports avec le contrat versionné :

```json
{
  "actionability_contract": {
    "schema": "waterline.actionability",
    "version": 1
  }
}
```

Il est identifié par `actionability_contract.schema = waterline.actionability`
avec `actionability_contract.version = 1`.

Le bloc `actionability` d'exécution indique si l'exécution choisie est réparable :

| Champ | Signification |
| --- | --- |
| `repair_state` | `repairable`, `blocked`, `not_needed` ou `unknown`. |
| `repairable` | Raccourci booléen pour `repair_state = repairable`. |
| `blocked_reason` | Code de raison stable si `repair_state = blocked`. |
| `status_bucket` | Catégorie Waterline ayant déterminé la décision pour l'exécution. |
| `closed_reason` | Raison durable de fermeture si l'exécution est fermée. |
| `task_problem` | Présence d'un problème de tâche vu par Waterline sur l'exécution. |
| `diagnostic_only_evidence` | Vrai si au moins une ligne informe sans constituer une source de reprise. |

Les preuves sous `activities`, `waits`, `timers`, `exceptions`, `logs` et les
entrées de chronologie ou d'export peuvent contenir leur bloc `actionability` :

| Champ | Signification |
| --- | --- |
| `state` | `actionable` si la ligne est une source de réparation valide, sinon `diagnostic_only`. |
| `repair_source` | Vrai uniquement pour les lignes appuyées par une source de référence réparable. |
| `diagnostic_only` | Vrai si la ligne ne doit pas servir de source de reprise. |
| `history_authority` | Référence source telle que `typed_history`, `mutable_open_fallback`, `failure_row_fallback` ou `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Code de raison stable d'un historique de repli non pris en charge. |

Agents et scripts doivent conditionner réparation et reprise à
`actionability.repair_state`, `actionability.repairable` et
`actionability.repair_source` de chaque ligne. `diagnostic_only = true` constitue
une preuve, pas une autorisation de relecture ou de reprise.

## Actions opérateur {#operator-actions}

Les actions Waterline sont des commandes durables émises via le contrat
d'exécution sélectionnée. Les routes d'instance ciblent l'exécution courante.
Les routes d'exécution rejettent explicitement les cibles périmées ou incorrectes.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `POST` | `/waterline/api/instances/{instanceId}/queries/{query}` | Exécuter une requête de lecture déclarée sur l'exécution courante. |
| `POST` | `/waterline/api/instances/{instanceId}/signals/{signal}` | Envoyer un signal à l'exécution courante. |
| `POST` | `/waterline/api/instances/{instanceId}/updates/{update}` | Soumettre une mise à jour à l'exécution courante. |
| `POST` | `/waterline/api/instances/{instanceId}/repair` | Distribuer un passage de réparation de l'exécution courante si le contrat l'autorise. |
| `POST` | `/waterline/api/instances/{instanceId}/cancel` | Demander l'annulation de l'exécution courante. |
| `POST` | `/waterline/api/instances/{instanceId}/terminate` | Terminer de force l'exécution courante. |
| `POST` | `/waterline/api/instances/{instanceId}/archive` | Archiver l'exécution fermée sélectionnée. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/queries/{query}` | Exécuter une requête de lecture sur une exécution explicite. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/signals/{signal}` | Envoyer un signal uniquement si l'exécution choisie est courante. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{update}` | Soumettre une mise à jour uniquement si l'exécution choisie est courante. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/repair` | Réparer une exécution explicitement choisie. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/cancel` | Annuler uniquement si l'exécution choisie est courante. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/terminate` | Terminer de force uniquement si l'exécution choisie est courante. |
| `POST` | `/waterline/api/instances/{instanceId}/runs/{runId}/archive` | Archiver l'exécution fermée sélectionnée. |

Signaux, mises à jour et requêtes acceptent `arguments` en JSON. Les arguments
invalides renvoient des erreurs de validation par champ. Les blocages de
relecture renvoient `409 Conflict` avec une raison stable comme
`workflow_definition_unavailable` au lieu de tenter une exécution approximative.

## Inspection des mises à jour {#update-inspection}

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/waterline/api/instances/{instanceId}/updates/{updateId}` | Inspecter le cycle de vie d'une mise à jour de l'exécution courante. |
| `GET` | `/waterline/api/instances/{instanceId}/runs/{runId}/updates/{updateId}` | Inspecter le cycle de vie d'une mise à jour d'une exécution explicite. |
| `GET` | `/waterline/api/flows/{id}/updates/{updateId}` | Ancienne recherche de détail de mise à jour. |

Cette inspection permet à une interface ou un agent d'expliquer si une mise à
jour est acceptée, appliquée, terminée, rejetée, expirée en attente ou bloquée
par la compatibilité de relecture.

## Planifications {#schedules}

Les routes de planification Waterline offrent visibilité et actions opérateur v2 :

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/waterline/api/v2/schedules` | Lister les planifications visibles dans l'espace de noms courant. |
| `GET` | `/waterline/api/v2/schedules/{scheduleId}` | Décrire une planification. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/pause` | Suspendre les futurs déclenchements. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/resume` | Reprendre une planification suspendue. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/trigger` | Déclencher immédiatement. |
| `POST` | `/waterline/api/v2/schedules/{scheduleId}/backfill` | Rattraper une période. |
| `DELETE` | `/waterline/api/v2/schedules/{scheduleId}` | Supprimer une planification. |

Les réponses exposent action, état, prochain déclenchement, historique récent,
politique de chevauchement, note, mémo et attributs de recherche pour l'opérateur.

## Vues enregistrées et préférences {#saved-views-and-preferences}

Vues et préférences sont des configurations opérateur de l'interface, pas de
l'historique de workflow. Elles restent utiles aux procédures stables, car les
équipes peuvent partager les filtres et la disposition exacts utilisés en incident.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| `GET` | `/waterline/api/saved-views` | Lister les vues opérateur enregistrées. |
| `POST` | `/waterline/api/saved-views` | Créer une vue enregistrée. |
| `GET` | `/waterline/api/saved-views/{view}` | Lire une vue enregistrée. |
| `PUT` | `/waterline/api/saved-views/{view}` | Modifier une vue enregistrée. |
| `DELETE` | `/waterline/api/saved-views/{view}` | Supprimer une vue enregistrée. |
| `GET` | `/waterline/api/preferences/{surface}` | Lire les préférences d'une interface. |
| `PUT` | `/waterline/api/preferences/{surface}` | Modifier les préférences d'une interface. |

Ne traitez pas les noms de vue ou charges utiles de préférences comme des faits
durables. Pour les preuves, citez le détail d'exécution ou l'export d'historique.

## Contrat des erreurs {#error-contract}

Waterline utilise les codes HTTP ordinaires et des détails d'erreur JSON :

| État | Signification |
| --- | --- |
| `400` | Requête mal formée ou charge utile d'action non prise en charge. |
| `404` | Instance, exécution, mise à jour, planification, vue enregistrée ou interface de préférences introuvable dans l'espace de noms courant. |
| `409` | L'exécution choisie ne peut effectuer l'action, souvent car elle est historique, fermée, bloquée à la relecture ou sans définition disponible. |
| `422` | Échec de validation, avec erreurs par champ dans la réponse. |
| `500` | Échec applicatif inattendu. |

L'automatisation doit décider selon le code et les champs stables comme
`blocked_reason`, `query_blocked_reason`, `outcome`, `reason` et `actionability`.
N'analysez pas les messages de notification ou libellés de boutons comme contrat.

## Voir aussi {#see-also}

- [Supervision](./monitoring.md)
- [Échecs et reprise](./failures-and-recovery.md)
- [Requêtes de lecture](./features/queries.md)
- [Annuler et terminer](./features/cancel-and-terminate.md)
- [Contrat des outils pour agents](./agent-tooling-contract.md)
