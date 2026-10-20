---
sidebar_position: 19
title: Suite de conformité de la plateforme
description: Référence publique du manifeste de la suite de conformité Durable Workflow v2, du catalogue de jeux de données, des règles du banc de test et des contrôles de publication.
tags:
  - compatibility
  - conformance
  - protocols
  - api-stability
keywords:
  - suite de conformité de la plateforme
  - banc de conformité
  - jeux de données de conformité
  - compatibilité Durable Workflow
  - platform-conformance-contract
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import platformConformanceContract from '@site/static/platform-conformance-contract.json';

# Suite de conformité de la plateforme {#platform-conformance-suite}

Cette page fait publiquement autorité pour la **suite de conformité de la
plateforme** Durable Workflow. Elle définit la matrice des cibles de
conformité, le catalogue de jeux de données réutilisables, le contrat du banc
de test, les règles de réussite/échec et les contrôles de publication des
implémentations revendiquant une compatibilité Durable Workflow v2.

<PublicAuthorityIdentity
  manifest={platformConformanceContract}
  manifestUrl="https://durable-workflow.github.io/platform-conformance-contract.json"
/>

Le serveur autonome annonce le même manifeste dans `GET /api/cluster/info`
sous `platform_conformance_suite`. Le catalogue des
[spécifications des protocoles de la plateforme](/docs/platform-protocol-specs)
nomme ce manifeste imbriqué comme famille d'objets
`platform_conformance_suite_manifest` dans la spécification `cluster_info_envelope`.

La suite dépend de l'autorité de [compatibilité des versions](/docs/compatibility).
Les familles d'interfaces et règles de stabilité énumérées doivent concorder
avec le contrat de stabilité des interfaces. L'autorité de compatibilité
définit le contrat ; cette page définit comment une implémentation prouve
qu'elle le respecte.

<WorkerProtocolAuthorityRoles />

## Autorités publiques de conformité {#public-conformance-authorities}

La suite enregistre des autorités stables lisibles par machine par identité
de schéma et URL publique. L'autorité du SDK PHP indépendant du framework est
publiée sous
[`durable-workflow.v2.php-sdk-conformance-contract`](pathname:///platform-conformance/php-sdk-conformance.json).
Elle déclare la topologie des paquets publiés, les exigences de scénarios et
de preuves, ainsi que les identifiants publics du runner et du schéma de
résultat utilisés pour évaluer `durable-workflow/sdk` face au serveur autonome publié.

## Matrice des cibles {#target-matrix}

Une **cible** de conformité est une catégorie d'implémentation pouvant
revendiquer la compatibilité Durable. Une implémentation peut en revendiquer
plusieurs. Le serveur autonome revendique par exemple `standalone_server`,
`worker_protocol_implementation` et `repair_actionability_surface`.

| Cible | Familles d'interfaces requises | Catégories de jeux de données requises |
| --- | --- | --- |
| `standalone_server` | `server_api`, `worker_protocol`, `cluster_info_manifests` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `failure_repair_actionability` |
| `embedded_engine` | `history_event_wire_formats` | `history_replay_bundles` |
| `official_sdk` | `official_sdks`, `worker_protocol`, `history_event_wire_formats` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `worker_task_lifecycle`, `history_replay_bundles` |
| `worker_protocol_implementation` | `worker_protocol`, `history_event_wire_formats` | `worker_task_lifecycle`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `history_replay_bundles` |
| `cli_json_client` | `cli_json` | `control_plane_request_response`, `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `schedules_runtime_contract`, `namespace_runtime_contract`, `child_workflow_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `cli_json_envelopes` |
| `waterline_contract_surface` | `waterline_api` | `signal_query_runtime_contract`, `workflow_update_runtime_contract`, `search_attribute_runtime_contract`, `namespace_runtime_contract`, `saga_runtime_contract`, `worker_versioning_runtime_contract`, `migration_runtime_contract`, `skew_refusal_matrix_contract`, `principal_attribution_contract`, `waterline_observer_envelopes` |
| `repair_actionability_surface` | `worker_protocol`, `server_api` | `failure_repair_actionability` |
| `mcp_discovery_surface` | `mcp_discovery_results` | `mcp_discovery_envelopes` |
| `prerelease_release_candidate` | `server_api`, `official_sdks`, `cli_json`, `waterline_api`, `cluster_info_manifests` | `skew_refusal_matrix_contract`, `workflow_update_runtime_contract`, `principal_attribution_contract`, `prerelease_readiness_contract` |

Les cibles sont stables. Ajouter une cible, une interface requise à une cible
existante ou une catégorie de jeux de données requise, rendre une catégorie
provisoire obligatoire, modifier `operations` ou `pass_criteria` d'un scénario
runtime stable, modifier un champ d'exigence publique de scénario stable
(`artifact_policy`, `common_result_evidence`, `required_matrix`,
`scenario_requirements` ou `host_runner_contract`), ou changer une règle de
réussite/échec modifie le contrat de la suite et doit augmenter la version du manifeste.

## Catalogue des jeux de données {#fixture-catalog}

Chaque source stable est un artefact public possédant trois liaisons lisibles
par machine dans le catalogue : `artifact_id`, `resolver_url` et `sha256`.
Les identifiants d'artefacts runtime se terminent par la version de la suite,
ceux des protocoles par la version du catalogue des protocoles de la
plateforme. Le consommateur récupère `resolver_url` et n'accepte les octets
que si leur empreinte SHA-256 correspond à la liaison du catalogue.

| Catégorie | État | Autorité résoluble par le consommateur |
| --- | --- | --- |
| `control_plane_request_response` | `stable` | [`durable-workflow.v2.control-plane-api@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/control-plane-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-api@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-api.openapi.yaml) |
| `worker_task_lifecycle` | `stable` | [`durable-workflow.v2.worker-protocol-stream@catalog-16`](https://durable-workflow.github.io/platform-protocol-specs/v1.19/worker-protocol-stream.asyncapi.yaml) |
| `signal_query_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/signal_query_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/signal-query-runtime-scenarios.json) |
| `workflow_update_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/workflow_update_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/workflow-update-runtime-scenarios.json) |
| `search_attribute_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/search_attribute_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/search-attribute-runtime-scenarios.json) |
| `schedules_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/schedules_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/schedules-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/history_replay_bundles@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/replay-runtime-scenarios.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.history-event-payloads@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/history-event-payloads.schema.json) |
| `history_replay_bundles` | `stable` | [`durable-workflow.v2.replay-bundle@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/replay-bundle.schema.json) |
| `namespace_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/namespace_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/namespace-runtime-scenarios.json) |
| `child_workflow_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/child_workflow_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/child-workflow-runtime-scenarios.json) |
| `worker_versioning_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/worker_versioning_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/worker-versioning-runtime-scenarios.json) |
| `saga_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/saga_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/saga-runtime-scenarios.json) |
| `migration_runtime_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/migration_runtime_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/migration-runtime-scenarios.json) |
| `skew_refusal_matrix_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/skew_refusal_matrix_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/skew-refusal-matrix-scenarios.json) |
| `prerelease_readiness_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/prerelease_readiness_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/prerelease-readiness-scenarios.json) |
| `failure_repair_actionability` | `stable` | [`durable-workflow.v2.repair-actionability-objects@catalog-16`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/f781ced1ae33c8697835bd527a125bdf3eaf4321/static/platform-protocol-specs/repair-actionability-objects.schema.json) |
| `cli_json_envelopes` | `stable` | [`durable-workflow.cli.output-schema-manifest@3`](https://durable-workflow.github.io/cli-json-envelopes/v3/manifest.json) |
| `principal_attribution_contract` | `stable` | [`durable-workflow.v2.platform-conformance.runtime-scenarios/principal_attribution_contract@38`](https://raw.githubusercontent.com/durable-workflow/workflow/75dfd5c869823409ef3d6c4b009a7882159ae9a2/resources/conformance/suite-v38/platform-conformance/principal-attribution-scenarios.json) |

La ligne de la suite conserve la révision v3 du schéma CLI comme preuve
historique immuable. Le contrat CLI actuel est l'ensemble lié
[`durable-workflow.cli.output-schema-manifest@4`](https://durable-workflow.github.io/cli-json-envelopes/v4/manifest.json)
qui publie les champs de charge utile exclusivement Avro sans réécrire les
octets v2 ou v3.

La cible actuelle du protocole worker de la suite utilise les octets du
protocole 1.19 à formulation neutre quant au cycle de vie, enregistrés par
`durable-workflow.v2.worker-protocol-api@catalog-16` et
`durable-workflow.v2.worker-protocol-stream@catalog-16`. Les révisions 1.15 à
1.18 restent disponibles aux URL versionnées conservées dans l'historique de
la suite. Ces jeux versionnés ne remplacent pas l'autorité non versionnée du
protocole Server actuellement publié. Les anciens octets à formulation bêta
restent disponibles uniquement via la liaison explicitement historique
[`durable-workflow.v2.worker-protocol-api@catalog-16-beta-history`](https://raw.githubusercontent.com/durable-workflow/durable-workflow.github.io/e990bc36731463cc5b2cb2a9175dbccfdea61704/static/platform-protocol-specs/worker-protocol-api.openapi.yaml)
enregistrée dans le manifeste de la suite.

Les catégories prévues `waterline_observer_envelopes` et
`mcp_discovery_envelopes` restent `provisional`. Leurs emplacements prévus
dans l'arbre source sont des substituts non normatifs : les bancs ne doivent
pas les résoudre comme jeux de données ni les utiliser pour revendiquer une
conformité stable.

## Autorité de publication du cycle de vie des workflows {#workflow-lifecycle-release-authority}

L'autorité exacte des scénarios publiés de cycle de vie des workflows est
[publiée en JSON](https://durable-workflow.github.io/platform-conformance/workflow-lifecycle-scenarios.json).
Elle consigne les exigences exercées à la frontière de publication actuelle
du serveur et des SDK PHP et Rust.

Le volet PHP installe depuis Packagist le paquet `durable-workflow/sdk` exact
du tuple courant dans un projet Composer jetable. Il exécute des processus
client et worker PHP séparés contre l'image publique correspondante du
serveur, consigne la distribution Packagist et la provenance officielle
d'`apache/avro` et doit annoncer
`local_product_source_checkouts_used=false`.

Le volet Rust installe depuis crates.io la crate exacte du tuple courant et
consigne la source du registre et les sommes de contrôle de cette crate et
de la crate officielle `apache-avro`. La preuve de charge utile utilise
l'enveloppe Avro du SDK publié fondée sur `apache-avro` ; un codec personnalisé
ou une extraction locale du produit ne constitue pas une provenance acceptable.

Le volet Rust doit exécuter et rapporter toutes ces cellules :

- `instance_cancel` et `instance_terminate` par les commandes publiques du SDK.
- `selected_run_guard` et `stale_run_rejection` pour ne pas confondre une
  exécution sélectionnée avec l'exécution actuelle de l'instance.
- `typed_failed`, `typed_cancelled`, `typed_terminated` et `typed_timed_out`
  comme résultats terminaux typés portant les identités du workflow et de l'exécution.
- `cancellation_heartbeat` et `late_activity_completion_refused` pour que le
  code d'activité observe l'annulation et qu'une finalisation tardive ne
  puisse écraser le résultat terminal.
- `worker_restart_during_cancellation` pendant que le règlement de l'annulation
  reste en attente, prouvant qu'un worker remplaçant ne reprend pas l'activité fermée.

Le manifeste exige aussi les versions exactes des artefacts et du serveur,
l'identité du cluster, la provenance d'installation, les identités workflow,
les résultats par cellule, motifs stables, contrat de charge utile, topologie
d'exécuteurs, version du contrat du volet Rust, identité du runner et code de
sortie. Des preuves Rust absentes, non prises en charge, bloquées par le runner
ou infructueuses ne satisfont pas la catégorie de cycle de vie.

Une catégorie n'est requise pour une cible que si elle y figure et si son
état n'est pas `provisional`. Les catégories provisoires produisent des
avertissements indicatifs et ne deviennent contraignantes qu'après promotion
à `stable` dans une version ultérieure de la suite.

La catégorie `signal_query_runtime_contract` est stable. Son résultat doit
enregistrer des versions concrètes épinglées d'artefacts publiés et nommer
chaque scénario requis comme `pass`, `fail`, `unsupported`, `not_covered` ou
`runner_blocked`, avec des constats liés. Les versions substitutives ou non
résolues telles que `latest`, `current`, `head`, `<latest>`, `${VERSION}` ou
`{{ version }}` échouent au contrôle de résultat. Seules les cellules `pass`
comptent dans la réussite de la catégorie :
`published_artifact_install_only`,
`python_worker_cli_and_sdk_baseline`, `php_worker_cli_and_sdk_baseline`,
`python_worker_php_facing_and_cli_clients`,
`php_worker_python_and_cli_clients`,
`rust_worker_rust_php_python_clients`, `python_worker_rust_client`,
`php_worker_rust_client`, `rust_query_error_and_immutability`,
`ordered_signal_delivery`,
`dedup_contract_observation`, `signal_during_replay`,
`query_during_replay`,
`rust_replayed_instance_state_query_after_cold_restart`,
`completed_run_signal_and_query`,
`unknown_signal_and_query_errors`,
`malformed_signal_and_query_payloads` et
`waterline_operator_visibility`.

Ces identifiants et critères de réussite sont publiés dans le manifeste de
scénarios runtime lisible par machine à
[`static/platform-conformance/signal-query-runtime-scenarios.json`](pathname:///platform-conformance/signal-query-runtime-scenarios.json).
Les tests d'implémentation peuvent exercer ces scénarios, mais ne sont pas
des sources stables de jeux de données pour les bancs externes.

Les cellules Rust installent depuis crates.io la version exacte de la crate
`durable-workflow` déclarée par le manifeste et consignent la source du
registre Cargo et la somme de contrôle du SDK et de sa dépendance résolue
`apache-avro`. Le transport des requêtes dérivé d'un instantané est évalué par
`rust_worker_rust_php_python_clients` et
`rust_query_error_and_immutability`. Il ne s'agit pas de l'état d'instance du
workflow relu. La cellule distincte
`rust_replayed_instance_state_query_after_cold_restart` utilise
`register_replayed_workflow` et `register_replayed_query`, démarre un nouveau
processus worker Rust après un arrêt à froid, restaure l'historique durable et
compare les états en cours, restauré et terminé via des appelants Rust, PHP
et Python. Les séquences de requêtes réussies comme échouées capturent les
nombres d'événements d'historique et de commandes workflow avant la première
requête mesurée réussie et doivent les laisser inchangés.

Pour `completed_run_signal_and_query`, une exécution terminée proprement avec
un gestionnaire de requête déclaré et relisible doit retourner son état final
par chaque interface publique de requête revendiquée. Les erreurs stables
d'état terminal ne sont valides que pour les états explicitement non pris en
charge ou les gestionnaires indisponibles ; une erreur terminale générique
d'exécution terminée n'est pas une réussite pour une exécution terminée relisible.

La catégorie `workflow_update_runtime_contract` est une catégorie stable de
scénarios runtime. Son résultat doit utiliser des artefacts publiés, épingler
les versions du serveur, de la CLI, des SDK Python et PHP et de Waterline,
indiquer si des sources locales du produit ont été utilisées et nommer chaque
scénario de mise à jour requis comme `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, avec des constats liés. Les preuves
réussies doivent exercer les interfaces publiques du plan de contrôle, de
l'historique, CLI/SDK et celles lisibles par l'opérateur ; l'exécution de
sources locales ne compte pas.

Les scénarios requis couvrent l'installation d'artefacts publiés, la visibilité
du contrat de mise à jour déclaré, les preuves d'acceptation du plan de
contrôle et de l'historique, la visibilité opérateur de l'état en cours ou en
attente, l'aller-retour du résultat terminé, les échecs et refus, doublons ou
idempotence, refus de mise à jour inconnue ou d'entrée invalide, aller-retour
d'enveloppe, comportement des workflows terminaux, attribution authentifiée du
principal, parités client/worker PHP et Python et diagnostics opérateur. Si un
SDK n'offre pas de prise en charge native des mises à jour, le résultat doit
rapporter une cellule typée non prise en charge avec un constat SDK ciblé,
plutôt que d'omettre silencieusement le langage.

Ces identifiants et critères sont publiés dans le manifeste de scénarios
runtime lisible par machine à
[`static/platform-conformance/workflow-update-runtime-scenarios.json`](pathname:///platform-conformance/workflow-update-runtime-scenarios.json).
Le transfert actuel au runner hôte reste volontairement `runner_blocked`
jusqu'à ce qu'un runner enregistré puisse installer les artefacts publiés
épinglés et exercer la matrice complète des mises à jour.

La catégorie `search_attribute_runtime_contract` est stable. Son résultat doit
utiliser des artefacts publiés et couvrir le démarrage/l'insertion ou mise à
jour de workflows PHP et Python, les requêtes et erreurs CLI, la visibilité
opérateur Waterline, les allers-retours de codec entre langages, les requêtes
d'égalité/plage/booléennes, la grammaire OR/NOT, l'appartenance aux listes de
mots-clés, la sûreté des types, la distribution des latences d'indexation,
la latence sous charge, l'isolation des espaces de noms, le refus des noms
réservés et la protection contre l'injection de requêtes. Un sous-ensemble de
test rapide Python/serveur n'est pas conforme tant que chaque cellule requise
n'est pas enregistrée comme `pass`, `fail`, `unsupported`, `not_covered` ou
`runner_blocked`, avec des constats liés. Seules les cellules `pass` comptent
dans la réussite de la catégorie.

Ces identifiants de scénarios d'attributs de recherche et leurs critères sont publiés à
[`static/platform-conformance/search-attribute-runtime-scenarios.json`](pathname:///platform-conformance/search-attribute-runtime-scenarios.json).

La catégorie `schedules_runtime_contract` est stable. Son résultat doit
utiliser des artefacts publiés et couvrir les cadences cron et à fréquence
fixe, la visibilité par listage et description, les fenêtres pause/reprise
sans déclenchement, l'arrêt des futurs déclenchements après suppression, la
politique des déclenchements manqués, la survie aux redémarrages, les opérations
de planification CLI, SDK Python et PHP, les déclenchements de workflows PHP
créés en Python et inversement, le refus de cron invalide et les résultats de
types workflow inexistants. Un simple test rapide du cycle de vie n'est pas
conforme tant que chaque cellule requise n'est pas enregistrée comme `pass`,
`fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des constats
liés. Seules les cellules `pass` comptent dans la réussite de la catégorie.

Ces identifiants de scénarios de planification et leurs critères sont publiés à
[`static/platform-conformance/schedules-runtime-scenarios.json`](pathname:///platform-conformance/schedules-runtime-scenarios.json).

La catégorie `history_replay_bundles` est également stable. Son résultat doit
utiliser des artefacts publiés et couvrir la relecture PHP et Python des
historiques terminés, le redémarrage des workers, les activités, signaux/mises
à jour, conditions d'attente, marqueurs de version, compensations de saga,
refus explicite des divergences de code, refus de modification d'historique
côté serveur, refus des historiques mal formés et temporisation du redémarrage
pendant un signal en cours. Un test rapide sur historique de référence n'est
pas conforme tant que chaque cellule requise n'est pas enregistrée comme
`pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des
constats liés. Seules les cellules `pass` comptent dans la réussite.

Ces identifiants de scénarios de relecture et leurs critères sont publiés à
[`static/platform-conformance/replay-runtime-scenarios.json`](pathname:///platform-conformance/replay-runtime-scenarios.json).

La catégorie `namespace_runtime_contract` est stable. Son résultat doit
utiliser des artefacts publiés et couvrir création/mise à jour/description/
listage des espaces de noms, nettoyage et recréation, isolation de la
visibilité et des modifications de workflows, isolation des files de workers
PHP, contexte CLI et portée par défaut, parité SDK de sélection des espaces,
isolation des schémas d'attributs de recherche et requêtes de valeurs, des
planifications et de la visibilité Waterline/opérateur, appels Nexus
inter-espaces de noms explicites, refus des noms réservés et routage des
enregistrements de résultat pour les constats produit. Un test rapide n'est
pas conforme tant que chaque cellule requise n'est pas enregistrée comme
`pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des
constats liés. Seules les cellules `pass` comptent dans la réussite.

Les notes d'implémentation non normatives de visibilité Waterline/opérateur
limitée à une portée peuvent provenir de l'artefact Waterline publié ou d'un
volet Waterline ciblé. Les captures utiles comprennent les vues de liste et de
détail des workflows limitées à une portée, les planifications si exposées,
valeurs d'attributs de recherche, portée du tableau de bord, statistiques API
opérateur et verdict documenté des vues par défaut ou sans portée annoncées
par le produit. Les critères normatifs restent ceux du scénario
`waterline_operator_namespace_visibility` ci-dessous.

Ces identifiants de scénarios d'espaces de noms et leurs critères sont publiés à
[`static/platform-conformance/namespace-runtime-scenarios.json`](pathname:///platform-conformance/namespace-runtime-scenarios.json).

La catégorie `child_workflow_runtime_contract` est stable. Son résultat doit
utiliser des artefacts publiés et couvrir les parents/enfants PHP et Python
de même langage et interlangages, le typage aller-retour des échecs enfant,
la propagation de l'annulation du parent à l'enfant, l'annulation directe de
l'enfant observée par le parent, la relecture après redémarrage du worker
parent attendant un enfant, le lancement parallèle de cinq enfants et le
comportement des espaces de noms. Un seul test rapide parent/enfant n'est pas
conforme tant que chaque cellule requise n'est pas enregistrée comme `pass`,
`fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des constats
liés. Seules les cellules `pass` comptent dans la réussite.

Ces identifiants de scénarios de workflows enfants et leurs critères sont publiés à
[`static/platform-conformance/child-workflow-runtime-scenarios.json`](pathname:///platform-conformance/child-workflow-runtime-scenarios.json).

La catégorie `saga_runtime_contract` est stable. Son résultat doit utiliser
des artefacts publiés et couvrir la réussite du parcours avant, l'échec d'une
étape tardive avec compensation inverse, l'échec précoce sans compensation
supplémentaire, l'idempotence des nouvelles tentatives de compensation, la
visibilité terminale de leurs échecs, le redémarrage d'un worker en cours de
compensation, workflow PHP vers compensation Python et inversement,
allers-retours d'erreurs typées et état de compensation en cours visible à
l'opérateur. Un test rapide prouvant un seul parcours heureux ou un SDK n'est
pas conforme tant que chaque cellule requise n'est pas enregistrée comme
`pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des
constats liés. Seules les cellules `pass` comptent dans la réussite. Le paquet
PHP est identifié comme `workflow-php` dans la matrice runtime et peut aussi
être enregistré comme `workflow` lors de la comparaison avec les artefacts
de publication de la plateforme.

Ces identifiants de scénarios de saga et leurs critères sont publiés à
[`static/platform-conformance/saga-runtime-scenarios.json`](pathname:///platform-conformance/saga-runtime-scenarios.json).

La catégorie `worker_versioning_runtime_contract` est stable. Son résultat
doit utiliser des artefacts publiés et couvrir l'inscription build-ID des
workers, la visibilité opérateur du déploiement, les contrôles de
drainage/réactivation, les affectations de compatibilité par exécution, la
relecture uniquement par des workers compatibles, le routage des nouveaux
démarrages vers la version promue, la relecture après éviction du cache, les
diagnostics d'absence de worker compatible, la visibilité CLI et Waterline,
l'affectation interlangages PHP/Python, le comportement adverse sans hausse de
version et les versions épinglées de l'API d'historique. Un test rapide n'est
pas conforme tant que chaque cellule requise n'est pas enregistrée comme
`pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des
constats liés. Seules les cellules `pass` comptent dans la réussite.

Les preuves d'affectation PHP/Python interlangages doivent consigner les
identités de runtime des workers, identifiants de workflow et d'exécution,
état de déploiement des files, résultats publics d'interrogation et de
déploiement utilisés pour vérifier l'affectation, source et version
d'installation de l'artefact worker publié et confirmation de l'absence de
sources produit locales.

Ces identifiants de scénarios de versionnement des workers et leurs critères sont publiés à
[`static/platform-conformance/worker-versioning-runtime-scenarios.json`](pathname:///platform-conformance/worker-versioning-runtime-scenarios.json).

La catégorie `migration_runtime_contract` est stable. Son résultat doit
utiliser des artefacts publiés et couvrir la préparation de l'état v1 le plus
récent pris en charge, les étapes documentées, la conservation et la relecture
des historiques terminés, la progression des workflows en cours, l'état de
nouvelle tentative en cours d'activité, l'attente de signal ou temporisateur,
la cadence des planifications, la projection des inscriptions de workers, la
visibilité Waterline, l'accès CLI à l'état antérieur, les nouveaux démarrages
v2, les retours arrière tenant compte des files et le refus explicite des
écarts de versions non pris en charge. Les preuves de retour arrière doivent
inventorier le travail v1 prêt, différé et réservé en file ; indiquer si la
frontière de reprise a été drainée, capturée par un instantané cohérent de
l'application associant SQL et files, ou acceptée comme irrécupérable ; et
prouver que chaque ligne v1 non terminale restaurée dispose d'une file
exécutable ou d'un chemin de réveil par signal. Une ligne `pending` périmée
admissible peut utiliser le Watchdog pris en charge de v1.0.77 uniquement si
les preuves montrent que la boucle worker distribue le Watchdog activé par
défaut, qu'il redistribue ce workflow après son seuil de péremption de cinq
minutes et que la ligne progresse sur sa file enregistrée. Ce chemin réservé
à `pending` ne remplace pas l'état préservé des files pour les nouvelles
tentatives, temporisateurs ou tâches `waiting`/`running`. Une restauration
SQL seule ne constitue une preuve de retour arrière réussie que si aucune
autre exécution v1 non terminale dépendante des files n'existe à l'instantané
de reprise. Le manifeste de reprise ne doit enregistrer que la référence et
la version d'`APP_KEY` dans le gestionnaire de secrets, la clé et les
identifiants de reprise ayant des accès contrôlés séparément des sauvegardes
SQL et des files. Un test rapide d'installation neuve ou une migration ne
partant pas d'un état v1 réaliste n'est pas conforme tant que chaque cellule
requise n'est pas enregistrée comme `pass`, `fail`, `unsupported`,
`not_covered` ou `runner_blocked`, avec des constats liés. Seules les cellules
`pass` comptent dans la réussite.

La cellule des étapes documentées doit consigner la liste des commandes du
guide actuel, celles réellement exécutées dans son ordre, leurs codes de
sortie et durées individuelles. Les instantanés avant/après doivent inclure
les cellules observées d'historique terminé, de workflow en cours, d'activité
en nouvelle tentative, d'attente de signal ou temporisateur, de planification
et d'inscription des workers.

Ces identifiants de scénarios de migration et leurs critères sont publiés à
[`static/platform-conformance/migration-runtime-scenarios.json`](pathname:///platform-conformance/migration-runtime-scenarios.json).

La catégorie `skew_refusal_matrix_contract` est stable. Son résultat doit
utiliser des artefacts publiés et couvrir les associations compatibles, avec
écart vers l'ancien, vers le récent et hors fenêtre pour la CLI, le SDK
Python, le worker autonome du SDK PHP et les interfaces Waterline. Workflow
n'est présent que comme moteur embarqué de Laravel et Waterline. Il faut
aussi tester les frontières de versions futures, capturer les requêtes et
réponses de chaque opération avec écart, classer les écarts worker comme
`register_refused`, `register_and_serve` ou `register_and_drop`, et ceux de
Waterline comme `banner`, `render_refused` ou `stale_render`. Un simple test
du manifeste de protocole n'est pas conforme tant que chaque cellule requise
n'est pas enregistrée comme `pass`, `fail`, `unsupported`, `not_covered` ou
`runner_blocked`, avec des constats liés. Seules les cellules `pass` comptent
dans la réussite ; `register_and_drop` et `stale_render` sans avertissement
explicite sont des constats produit bloquants.

Ces identifiants de scénarios de refus d'écart et leurs critères sont publiés à
[`static/platform-conformance/skew-refusal-matrix-scenarios.json`](pathname:///platform-conformance/skew-refusal-matrix-scenarios.json).

La catégorie `principal_attribution_contract` est stable. Son résultat doit
utiliser des artefacts publiés et prouver que l'historique enregistre des
principaux dérivés par le serveur pour démarrage, signal, requête, annulation,
finalisation, échec, événements anonymes et événements provenant du serveur.
Il doit exercer l'usurpation adverse par charge utile/en-tête, les identités
nommées alice/bob, la rotation d'identifiants, la visibilité opérateur CLI et
Waterline et les démarrages ou signaux authentifiés via le SDK Python et le
`DurableWorkflow\Client` PHP. Les cellules SDK doivent consigner version du
paquet, sorties d'opérations, échantillons de principaux historique/API et
principaux de référence HTTP brut afin de comparer leur forme et leurs
identifiants attendus. La cellule PHP doit résoudre `durable-workflow/sdk`
comme distribution Packagist exacte et consigner type de distribution, URL
et référence. `durable-workflow/workflow` est résolu séparément uniquement
pour le moteur embarqué Laravel et Waterline. Un test rapide de jeton de rôle
n'est pas conforme tant que chaque scénario requis n'est pas enregistré comme
`pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`, avec des constats liés.

Ces identifiants de scénarios d'attribution du principal et leurs critères sont publiés à
[`static/platform-conformance/principal-attribution-scenarios.json`](pathname:///platform-conformance/principal-attribution-scenarios.json).

La catégorie `prerelease_readiness_contract` est stable pour la version
candidate coordonnée 2.0. Son résultat doit utiliser uniquement les artefacts
publiés et la documentation publique destinée aux utilisateurs, consigner des
verdicts GO / NO-GO séparés pour Workflow et Waterline, couvrir la complétude
des fonctions centrales, la préparation de la migration, la stabilité de
l'API publique, l'exactitude de la documentation, la clarté de la configuration
et la compatibilité entre composants. Il doit évaluer serveur, CLI, SDK PHP,
Python et Rust, Workflow, Waterline, Sample App et documentation comme un tuple
d'écosystème unique. Il doit aussi exécuter chaque parcours autonome versionné
2.0 et le parcours Laravel embarqué distinct depuis la documentation publique
actuelle, jusqu'à des workflows terminés observables en moins de 10 minutes,
en consignant commandes exactes, sorties, versions d'artefacts, provenance des
paquets et durées réelles. Un contrôle limité à la découverte n'est pas
conforme tant qu'il ne consigne pas les parcours PHP, Python, Rust et Laravel
comme `pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`.
Tout artefact absent, page obsolète, étape de migration non documentée, lacune
d'installation, instabilité d'API, risque de rupture entre composants ou
discordance de canal de publication doit être enregistré comme cellule non
réussie avec un constat lié. Les seules preuves du runner ne sont pas
conformes et ne peuvent rendre la préparation de préversion réussie.

Ces identifiants de scénarios de préparation et leurs critères sont publiés à
[`static/platform-conformance/prerelease-readiness-scenarios.json`](pathname:///platform-conformance/prerelease-readiness-scenarios.json).
Le [démarrage rapide 2.0](/docs/quickstart/) concis est le parcours public d'intégration.

## Règles de réussite et d'échec {#pass--fail-rules}

1. **`guaranteed_field_equality`.** Chaque champ garanti du schéma doit être
   présent, correctement typé et de valeur égale dans la réponse de
   l'implémentation. Les champs uniquement diagnostiques sont ignorés.
2. **`unknown_additive_fields_tolerated`.** Les champs supplémentaires ne
   réussissent que s'ils sont documentés comme uniquement diagnostiques ou si
   le niveau de stabilité du jeu autorise une évolution additive.
3. **`frozen_shape_exact_match`.** Les jeux relevant d'une famille `frozen`
   doivent correspondre exactement. Toute divergence de forme figée est un échec.
4. **`required_fixtures_must_pass`.** Une version revendiquant une cible doit
   réussir toutes ses catégories requises. Un seul échec requis signifie que
   la version n'est pas conforme pour cette cible.
5. **`stable_runtime_scenario_coverage`.** Une catégorie runtime stable doit
   rapporter chaque scénario requis avec l'un des états de son manifeste :
   `pass`, `fail`, `unsupported`, `not_covered` ou `runner_blocked`. La conformité
   complète exige leur réussite à tous. Un simple sous-ensemble de test rapide,
   scénario omis, interface publique non prise en charge, cellule non couverte
   ou bloquée par le runner n'est pas conforme et doit lier le constat
   responsable. Cet ensemble d'états et la règle runtime exigeant `pass`
   relèvent de la sémantique des versions 5 et ultérieures de la suite.
6. **`provisional_categories_warn_only`.** Un jeu échoué dans une catégorie
   provisoire produit un avertissement sans bloquer la publication.
7. **`diagnostic_only_mismatches_pass`.** Si seuls des champs diagnostiques
   diffèrent, le banc consigne la différence dans `diagnostic_diff` et le jeu réussit.

Le résultat du banc déclare un des quatre niveaux de conformité :

| Niveau | Signification |
| --- | --- |
| `full` | Chaque jeu requis réussit pour chaque cible revendiquée. |
| `partial` | Chaque jeu requis réussit pour au moins une cible revendiquée, mais une autre échoue. |
| `provisional` | Seules des catégories provisoires ont échoué ; toutes les catégories requises ont réussi. |
| `nonconforming` | Au moins un jeu requis a échoué pour chaque cible revendiquée. |

## Contrat du banc de test {#harness-contract}

Un banc conforme :

- charge le manifeste depuis `platform_conformance_suite` dans
  `GET /api/cluster/info`, ou depuis le miroir statique hors ligne ;
- charge chaque jeu déclaré depuis son chemin de référence ;
- pilote l'implémentation par l'opération documentée du jeu ;
- compare la réponse selon les règles de réussite/échec ci-dessus ;
- émet un document de résultat par exécution avec le schéma
  `durable-workflow.v2.platform-conformance.result`, la version de suite,
  l'identité de l'implémentation, les résultats par jeu, les différences
  diagnostiques et le niveau global de conformité ;
- sort avec un code non nul si et seulement si le niveau est `nonconforming`.

Le document de résultat est un artefact. Une revendication de compatibilité
n'est valide que si le résultat a été produit contre le build de
l'implémentation et la version de suite nommée par ce build.

## Contrôles de publication {#release-gates}

| Publication | Cible(s) revendiquée(s) requise(s) | Artefact requis |
| --- | --- | --- |
| `durable-workflow/server` | `standalone_server`, `worker_protocol_implementation`, `repair_actionability_surface` | Document de résultat du banc joint à la version. |
| `durable-workflow/workflow` | `embedded_engine` | Document de résultat du banc joint à la version. |
| `durable-workflow/sdk` | `official_sdk`, `worker_protocol_implementation` | Document de résultat du banc joint à la version. |
| `durable_workflow` | `official_sdk`, `worker_protocol_implementation` | Document de résultat du banc joint à la version. |
| `dw` | `cli_json_client` | Document de résultat du banc joint à la version. |
| `waterline` | `waterline_contract_surface` | Document de résultat du banc joint à la version. |
| `durable-workflow/2.0-release-candidate` | `prerelease_release_candidate` | L'enregistrement de conformité conserve le résultat de préparation de préversion sur artefacts publiés. |

Les réviseurs confirment que le résultat est joint, que le niveau vaut `full`
ou `provisional` et que la version de suite du résultat correspond à celle
exposée par le build testé. Un résultat `nonconforming` bloque la publication.

## Vérification de publication {#release-check}

Le contrôle du site dans `scripts/check-platform-conformance-authority.js`
fait échouer la construction si le manifeste statique pointe vers une
autorité absente, locale au dépôt, simple alias de version ou hors du site
documentaire. Il valide chaque `authority_doc` de jeu stable comme URL
canonique de version actuelle du site et rejette arbres sources, jeux de
tests, documentation et répertoires de schémas relatifs au dépôt,
identifiants d'artefacts non versionnés, résolveurs non publics et empreintes
d'octets incorrectes dans chaque catégorie stable. Les catégories runtime
doivent aussi exposer un manifeste public de scénarios lié à la suite.
Le même contrôle exige que cette page énumère schéma du manifeste, noms des
cibles et catégories, règles de réussite/échec et contrôles de publication du
miroir lisible par machine.

Quand la suite change, mettez à jour ensemble cette page et
`static/platform-conformance-contract.json`. Si le changement ajoute une cible
ou une catégorie requise, promeut une catégorie provisoire à stable, modifie
`operations` ou `pass_criteria` d'un scénario runtime stable, un champ
d'exigence publique (`artifact_policy`, `common_result_evidence`,
`required_matrix`, `scenario_requirements` ou `host_runner_contract`) ou une
règle de réussite/échec, augmentez la version de suite dans le même changement
de publication. Le contrôle fixe les critères stables et instantanés
d'exigences publiques par empreintes versionnées pour empêcher les bancs
externes d'observer de nouveaux critères ou exigences de preuve sous une
ancienne version de suite.

Les critères runtime publiés et entrées d'empreintes d'exigences publiques
n'acceptent que des ajouts. Pour faire évoluer `operations` ou `pass_criteria`
d'un scénario stable, laissez chaque entrée existante de
`VERSIONED_RUNTIME_SCENARIO_CRITERIA_DIGESTS` inchangée, augmentez la version
de suite, mettez le manifeste de scénarios à cette version et ajoutez une
empreinte de critères pour la nouvelle suite actuelle. Pour modifier les
exigences de preuves du manifeste runtime public, la politique d'artefacts,
la matrice requise, les champs d'exigences des scénarios ou du contrat du
runner hôte, laissez chaque entrée existante de
`VERSIONED_RUNTIME_SCENARIO_PUBLIC_REQUIREMENT_DIGESTS` inchangée, augmentez
la version, mettez le manifeste à cette version et ajoutez l'empreinte
d'exigences correspondante. Le contrôle compare les empreintes publiées de la
branche cible au changement actuel ; modifier ou supprimer une ancienne
entrée échoue même si la suite actuelle ajoute une nouvelle empreinte.
