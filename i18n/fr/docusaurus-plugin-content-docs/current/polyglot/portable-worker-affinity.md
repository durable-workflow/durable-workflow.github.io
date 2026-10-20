---
sidebar_position: 26
title: Affinité portable des workers
description: Affinité indicative des workers, caches de relecture, attribution normale des tâches et prise en charge par les SDK.
tags:
  - workers
  - activities
  - replay
  - polyglot
---

# Affinité portable des workers {#portable-worker-affinity}

Les workers en mode service implémentent les fonctions ci-dessous via le protocole worker Server. Leur disponibilité dépend de la version et de la configuration du SDK.

Les activités locales, sessions worker et caches sticky suivent une même règle : un worker doit déclarer chaque fonction comme prise en charge ou explicitement refusée. Le protocole `1.18` est le minimum pour ces déclarations. Server refuse une capacité de routage simple si le manifeste structuré du worker ne déclare pas la même fonction comme prise en charge.

## Prise en charge par SDK {#sdk-support}

| SDK worker | Activités locales | Sessions worker | Exécution sticky |
| --- | --- | --- | --- |
| PHP | Prises en charge | Prises en charge | Prise en charge |
| Python | Depuis 2.2.0 | Depuis 2.3.0 | Depuis 2.5.0 avec `sticky_cache_capacity` supérieur à zéro |
| Rust | Depuis 3.1.0 avec `Worker::local_activities(true)` | Depuis 3.2.0 avec `Worker::worker_sessions(true)` | Depuis 3.4.0 avec `Worker::sticky_cache(...)` |

Les workers n’annoncent que les capacités implémentées et activées dans leur profil. Les activités locales, sessions et caches sticky Rust, ainsi que le cache sticky Python, exigent une activation explicite. Les anciens SDK refusent les capacités non implémentées. Les workflows ordinaires et les activités en file relisent entièrement l’historique durable sans ces optimisations.

## Enregistrement des activités locales {#local-activity-recording}

Les workers PHP, Python et Rust avec activation exécutent une activité locale dans le worker de workflow. La réponse de fin de tâche contient arguments, résultats de tentatives, politique de nouvelles tentatives et délais, progression des heartbeats et résultat ou échec terminal. Server enregistre cette séquence atomiquement comme historique d’activité normal avec `execution_mode=local`.

La relecture consomme l’événement terminal enregistré sans rappeler le gestionnaire local. Si le worker disparaît avant la validation du résultat par Server, le gestionnaire peut être exécuté à nouveau. Les effets externes doivent donc être idempotents.

Les workers PHP ordinaires exécutent le gestionnaire synchrone dans leur processus. L’annulation et les délais heartbeat, par tentative et globaux sont observés avant une tentative, à `ActivityContext::heartbeat()` ou après le retour du gestionnaire. Ces gestionnaires doivent rester courts et répartir le travail bloquant avec des points de heartbeat sûrs.

Les callbacks asynchrones Python et Rust doivent rendre la main à leur runtime. Rust renouvelle le bail exact de tâche indépendamment des heartbeats applicatifs, abandonne le callback en cas de délai dépassé, perte d’autorité ou arrêt du worker et enregistre des rapports bornés de tentative et heartbeat. Voir l’[exemple Rust d’activité locale](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs) et la [référence API](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

Les workers PHP avec [annulation coopérative](/docs/polyglot/cancellation) utilisent le protocole 1.20 et des processus callback supervisés pour les activités locales préparées. L’exécution locale ordinaire dans le worker Rust utilise un autre profil et ne peut pas être combinée à cette supervision coopérative. Un callback bloquant nécessite une supervision de processus pour garantir son arrêt physique.

## Cycle de vie d’une session worker {#worker-session-lifecycle}

Les SDK PHP, Python et Rust exposent des options de session typées et des opérations de création, utilisation, renouvellement et fermeture. Les options couvrent exigences, file, bail, TTL total, activités simultanées et politique de réattribution. Le worker ferme ses sessions pendant un arrêt propre.

Si le détenteur disparaît, son bail et sa réservation de concurrence expirent. Un nouveau détenteur peut reprendre la session si les exigences correspondent, mais doit reconstruire ses ressources locales avant la première activité. L’identité de session ne rend jamais durable la mémoire du processus.

La réattribution conserve le TTL absolu d’origine de la session. Le renouvellement prolonge l’autorité du détenteur, pas ce TTL. Utilisez Server 2.5.1 ou plus récent pour préserver le TTL et le routage de session enregistré lors d’une relecture à froid. Voir l’[exemple Rust de session](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs) et [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html).

## Exécution sticky et relecture à froid {#sticky-execution-and-cold-replay}

Les caches PHP, Python et Rust sont bornés et indexés par les identifiants exacts de workflow, de run et de build worker. Ils rapportent `hit`, `miss`, `eviction` et `forced_cold_replay`. Une expiration, éviction, remplacement, perte du détenteur ou différence de build invalide l’optimisation et impose une relecture complète.

Utilisez Python SDK 2.5.0 avec Server 2.5.10 ou plus récent. Le cache est désactivé par défaut. Activez-le avec `sticky_cache_capacity` et définissez sa limite d’octets d’historique et son TTL. Il conserve l’historique encodé et réutilise des curseurs vérifiés pour éviter des téléchargements répétés. Prévoyez aussi la mémoire de décodage et de relecture déterministe. Voir le [guide Python et son exemple exécutable](https://python.durable-workflow.com/guides/sticky-execution/).

Rust SDK 3.4.0 prend en charge le même Server publié. Activez son cache avec `Worker::sticky_cache(StickyCacheOptions::new(...))` et configurez la limite d’historique encodé et le TTL. Chaque relecture décode un nouvel instantané. Les curseurs réutilisés sont vérifiés contre le bail courant et l’historique durable avant d’accepter un succès chaud. Le cache conserve de l’historique, pas des instances actives ni des ressources de session. Voir [StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html) et l’[exemple Rust](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs).

Server 2.5.10 conserve la relecture complète pour les SDK PHP antérieurs à 2.2.0. Utilisez PHP SDK 2.2.0 ou plus récent pour les indications de relecture des historiques qui commencent par StartAccepted.

L’affinité sticky ne réserve pas les tâches au propriétaire du cache et ne lui accorde pas de priorité. Un worker éligible peut réclamer une tâche pendant l’affinité active d’un autre worker, y compris si le propriétaire n’a aucun emplacement libre. L’attribution est étiquetée `forced_cold_replay`. Augmenter le TTL ne force pas l’attente du propriétaire.

Une relecture forcée à froid indique que l’optimisation du cache était indisponible. Ce n’est pas une erreur de correction. Le workflow doit rester déterministe avec un cache vide. Voir les [règles d’attribution et de diagnostic](/docs/features/sticky-execution#routing-identity).

## Valeurs sûres et mises à jour progressives {#safe-defaults-and-rolling-fleets}

Les workflows ordinaires ne nécessitent aucune configuration de session ou sticky. Une flotte à versions mixtes refuse les données incompatibles au seuil du protocole : Server vérifie version négociée, capacité simple, manifeste structuré et identité exacte du cache avant d’accepter une réponse de fin propre à une fonction.

Le [manifeste publié des scénarios multi-SDK](/platform-conformance/portable-worker-affinity-runtime-scenarios.json) couvre la véracité des déclarations, la relecture d’activités locales, la perte et la reprise de sessions, succès et évictions du cache, remplacement de workers, relecture forcée à froid et workflows sans configuration.

Pour Laravel intégré, consultez [Activités locales](/docs/features/local-activities), [Sessions worker](/docs/features/worker-sessions) et [Exécution sticky](/docs/features/sticky-execution). Ces API appartiennent au package Workflow. Utilisez l’API du SDK correspondant pour les workers en mode service.
