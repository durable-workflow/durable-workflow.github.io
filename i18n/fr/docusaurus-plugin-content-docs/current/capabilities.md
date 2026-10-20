---
sidebar_position: 2
title: Index des capacités 2.0
description: Index des SDK en mode service, du runtime embarqué, des protocoles et des capacités de Durable Workflow 2.0.
tags:
  - capabilities
  - compatibility
  - polyglot
keywords:
  - capacités Durable Workflow 2.0
  - SDK PHP Python Rust
  - matrice des fonctionnalités du moteur de workflows
  - versions minimales exactes des fonctionnalités
---

# Index des capacités de Durable Workflow 2.0 {#durable-workflow-20-capability-index}

Cet index couvre les capacités de la branche stable Durable Workflow 2.0.

## Canal installable pris en charge {#supported-installable-channel}

Les identités exactes des artefacts relèvent des registres de paquets et des
métadonnées de publication, pas de ce résumé des capacités.

| Interface | Canal pris en charge | Rôle dans cet index |
| --- | --- | --- |
| CLI | 2.0 stable | Client opérateur et de diagnostic lisible par machine. |
| SDK PHP | 2.0 stable | Client officiel `durable-workflow/sdk` en mode service et worker distant de workflows et d'activités pour le runtime d'un espace de noms Cloud ou un Server auto-hébergé. |
| Moteur Laravel embarqué | 2.0 stable | Mode de déploiement distinct `durable-workflow/workflow` dans l'application, avec son propre runtime d'écriture, moteur de persistance, files et relecture. |
| SDK Python | 2.0 stable | SDK officiel de workflows et d'activités déterministes en mode service, avec client d'exploitation et du plan de contrôle pour un runtime Cloud ou un Server auto-hébergé. Nécessite Python 3.10 ou ultérieur. |
| SDK Rust | 2.0 stable | SDK officiel de workflows et d'activités déterministes en mode service, service worker et client du plan de contrôle pour un runtime Cloud ou un Server auto-hébergé. Nécessite Rust 1.86 ou ultérieur. |
| Server | 2.0 stable | Runtime auto-hébergé indépendant des langages, implémenté en PHP, pour les protocoles v2 du plan de contrôle et des workers. |
| Waterline | 2.0 stable | Cloud inclut Managed Waterline. Les opérateurs auto-hébergés déploient séparément l'image de service pour un espace de noms Server. Laravel embarqué installe le paquet Composer et lit l'état de l'application dans son processus. |

PHP, Python et Rust sont les trois langages des SDK officiels en mode service.
Chacun peut cibler le runtime d'un espace de noms Durable Workflow Cloud
provisionné ou un Server auto-hébergé dont la découverte annonce la capacité
publiée. Ils partagent des noms de type stables sous forme de chaînes, un même
modèle durable de commandes et d'historique, la version `2` du plan de contrôle,
la version majeure `1` du protocole worker et l'enveloppe publique des charges
utiles. Rust est un SDK de workflows : il exécute du code de workflow
déterministe, des activités et des services workers, au-delà des appels bruts
au protocole. Python associe l'écriture de workflows à des clients d'exploitation
des espaces de noms, planifications, workers, files, historiques, réparations et autres opérations.

Laravel embarqué reste un mode PHP distinct dans l'application. Il n'est pas
requis pour les clients ou workers PHP en mode service. Le SDK PHP indépendant
du framework est versionné séparément du moteur Laravel embarqué.

Utilisez les [modes de déploiement](/docs/polyglot/deployment-modes/) pour choisir
la frontière de responsabilité, puis consultez le
[runtime Cloud géré](/docs/polyglot/cloud-control-plane/) ou le
[Server auto-hébergé](/docs/polyglot/server/). Les preuves de capacités ci-dessous
ne s'appliquent que si le runtime choisi annonce le contrat requis.

Les SDK PHP 2.3.2, Python 2.5.7 et Rust 3.5.0 utilisent par défaut le protocole
worker `1.20`. Les workers par défaut nécessitent un Server annonçant `1.20` ou
une version mineure ultérieure de la majeure `1`. Chaque SDK permet aussi de
choisir explicitement `1.19` pour un Server compatible plus ancien. L'annulation
coopérative exige `1.20` et son activation explicite. La découverte du runtime
et les métadonnées publiées du SDK sélectionné déterminent la compatibilité.
Consultez [Compatibilité des versions](/docs/compatibility/) et le
[protocole worker](/docs/polyglot/worker-protocol/).

## Capacités et versions minimales des SDK {#capability-and-sdk-floors}

Le « mode service » signifie que Cloud ou un Server auto-hébergé possède le
runtime distant. Le mode « embarqué » signifie qu'une application Laravel
possède le runtime dans son processus. La colonne SDK consigne volontairement
les différences. Un SDK absent ou limité n'est pas présumé offrir la parité.

| Capacité | Contrat 2.0 actuel et version minimale officielle | Preuves 2.0 explicites |
| --- | --- | --- |
| Workflows | Les workers distants PHP, Python et Rust exécutent des workflows déterministes. L'écriture Laravel embarquée utilise le paquet Workflow. | [Écrire des workflows](/docs/defining-workflows/workflows/), [SDK PHP](/docs/polyglot/php/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Activités et services | Le moteur embarqué et les trois SDK en mode service permettent d'écrire des activités. Les workflows et activités Rust s'exécutent dans des services workers officiels. Python et PHP exposent aussi des clients officiels de contrôle et de service. | [Activités](/docs/defining-workflows/activities/), [SDK PHP](/docs/polyglot/php/), [Exécution des activités](/docs/features/activity-execution-model/), [Exécution externe](/docs/polyglot/external-execution/) |
| Signaux | Les interfaces de workflow PHP, Python et Rust offrent une mutation durable asynchrone à leurs versions minimales actuelles. | [Signaux](/docs/features/signals/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Requêtes de lecture | Les requêtes de relecture en lecture seule sont prises en charge. PHP, Python et Rust exposent des gestionnaires et clients de requête. Les tâches de requête relues en Rust exigent le protocole worker `1.8` ou ultérieur. | [Requêtes de lecture](/docs/features/queries/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Mises à jour | PHP, Python et Rust exposent des clients et gestionnaires workers de mise à jour. Les validateurs déclarés en Python valident synchroniquement avant acceptation quand la découverte Server annonce ce contrat exact : l'acceptation suit l'approbation, tandis que rejet, perte de worker, dépassement de délai et achèvement bloqué par clôture de bail échouent explicitement. PHP et Rust ne permettent pas d'écrire des validateurs et n'en déclarent aucun. | [Mises à jour](/docs/features/updates/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/#workflow-updates) |
| Temporisateurs | Les temporisateurs durables du runtime de service sont relus en PHP, Python et Rust. | [Temporisateurs](/docs/features/timers/), [SDK Rust](/docs/polyglot/rust/) |
| Nouvelles tentatives | La politique durable de nouvelles tentatives d'activité est enregistrée avec la commande. PHP, Python et Rust exposent ces options à leurs versions minimales actuelles. | [Échecs et reprise](/docs/failures-and-recovery/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Délais | Les runtimes Cloud et Server auto-hébergés appliquent les familles de délais des activités et workflows. Rust inclut les options d'activité et les échéances d'exécution et de lancement d'une exécution de workflow. | [Délais](/docs/features/timeouts/), [SDK Rust](/docs/polyglot/rust/) |
| Workflows enfants | PHP, Python et Rust lancent et attendent des enfants durables. Leur identité de type interlangage est une chaîne stable et leurs charges utiles utilisent l'enveloppe partagée. | [Workflows enfants](/docs/features/child-workflows/), [SDK Python](/docs/polyglot/python/) |
| Composition parallèle déterministe | PHP `all()`/`parallel()`, les listes imbriquées avec yield de Python et Rust `WorkflowContext::parallel()`/`join()` planifient des groupes d'activités, d'enfants, de temporisateurs, mixtes et imbriqués via des commandes ordinaires. Les trois publient les métadonnées partagées d'identité et de chemin de groupe et restaurent les résultats dans l'ordre des entrées imbriquées. | [Concurrence](/docs/features/concurrency/), [SDK Python](/docs/polyglot/python/#fan-out), [SDK Rust](/docs/polyglot/rust/#deterministic-parallel-groups) |
| <span id="durable-first-completion-selection-capability">Sélection durable du premier achèvement</span> | PHP embarqué et les SDK de service PHP, Python et Rust lancent des membres indépendants : activité, workflow enfant, temporisateur, attente d'entrée externe et groupe imbriqué. Un gagnant est persisté avec une identité de membre stable. Les autres continuent et conservent leurs moyens d'attente et d'annulation. | [Concurrence](/docs/features/concurrency/#first-completion-selection), [SDK Python](/docs/polyglot/python/#first-completion-selection), [SDK Rust](/docs/polyglot/rust/#durable-first-completion-selection) |
| Compensation saga | Les assistants Saga de PHP, Python `WorkflowContext.saga()` et Rust `WorkflowContext::saga()` enregistrent des compensations durables après la réussite de l'action et les exécutent par défaut séquentiellement dans l'ordre inverse. Python et Rust s'arrêtent au premier échec de compensation et conservent les échecs initial et de compensation. PHP expose aussi des politiques facultatives parallèles et de poursuite malgré les erreurs. | [Sagas](/docs/features/sagas/), [SDK Python](/docs/polyglot/python/#saga-compensation), [SDK Rust](/docs/polyglot/rust/#saga-compensation) |
| Annulation | Laravel embarqué et les SDK de service PHP, Python et Rust prennent en charge les demandes d'annulation coopérative avec une identité racine unique, une échéance immuable et un nettoyage borné sur les workers explicitement activés. L'annulation terminale immédiate reste disponible avec protection de l'exécution sélectionnée et résultats typés. | [Annuler et terminer](/docs/features/cancel-and-terminate/), [Annulation en mode service](/docs/polyglot/cancellation/), [SDK Rust](/docs/polyglot/rust/) |
| Terminaison | La terminaison ferme immédiatement une exécution avec un résultat terminal distinct. Elle est exposée par les runtimes Cloud et Server auto-hébergés, la CLI et les interfaces de contrôle PHP, Python et Rust. | [Annuler et terminer](/docs/features/cancel-and-terminate/), [API Server](/docs/polyglot/server-api-reference/) |
| Effets de bord | PHP, Python et Rust enregistrent une valeur non déterministe exactement une fois, puis décodent la valeur enregistrée à la relecture. | [Effets de bord](/docs/features/side-effects/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Workflow Streams | PHP, Python et Rust exposent des opérations typées de liste, description, abonnement/reprise par décalage, ajout, fermeture et erreur sur les flux de sortie appartenant au Server et limités à l'exécution. Les trois produisent des émissions sûres à la relecture à partir d'une identité de commande durable. Python résout les charges utiles externes via son pilote de stockage configuré. PHP et Rust conservent les références opaques. | [Workflow Streams](/docs/polyglot/workflow-streams/), [matrice SDK exacte](/workflow-stream-capabilities.json), [scénarios du runtime](/platform-conformance/workflow-stream-runtime-scenarios.json) |
| Marqueurs de version | PHP, Python et Rust exposent des marqueurs durables pour faire évoluer le code de manière compatible. | [Versionnage](/docs/features/versioning/), [SDK Python](/docs/polyglot/python/), [SDK Rust](/docs/polyglot/rust/) |
| Relecture déterministe | Les workers PHP, Python et Rust reconstruisent les décisions à partir de l'historique durable et signalent le non-déterminisme avec un type précis au lieu de réexécuter le travail externe. | [Garanties d'exécution](/docs/constraints/execution-guarantees/), [Conformité de la plateforme](/docs/platform-conformance/), [SDK Rust](/docs/polyglot/rust/) |
| Planifications | Les runtimes Cloud et Server auto-hébergés possèdent les planifications durables. PHP, Python et la CLI exposent leurs opérations. Rust ne revendique pas d'API de gestion des planifications. | [Planifications](/docs/features/schedules/), [Référence CLI](/docs/polyglot/cli-reference/), [SDK Python](/docs/polyglot/python/) |
| Espaces de noms | Les runtimes en mode service sont limités par espace de noms. Les clients PHP/Python et la CLI les gèrent si le runtime choisi expose cette opération. Les workers et clients Rust ciblent un espace de noms, sans revendiquer son administration à la version minimale actuelle. | [Espace de noms, authentification et workers](/docs/polyglot/namespace-auth-workers/), [API Server](/docs/polyglot/server-api-reference/) |
| Attributs de recherche | Les runtimes Cloud et Server auto-hébergés indexent des attributs typés. PHP et Python exposent des interfaces d'écriture et de contrôle. La CLI et les API opérateur exposent la découverte et le filtrage structurés. | [Attributs de recherche](/docs/features/search-attributes/), [SDK Python](/docs/polyglot/python/) |
| Compatibilité des workers | Les SDK enregistrent runtime, version SDK, identifiant de build, types pris en charge, version de protocole et capacité. Le serveur publie les versions acceptées et les faits de routage. | [Compatibilité](/docs/compatibility/), [Compatibilité et routage des workers](/docs/polyglot/worker-compatibility-routing/) |
| Activités locales | Disponibles dans Laravel embarqué, les SDK de service PHP et Python et le SDK Rust 3.1.0 avec activation explicite du worker. | [Exécution des activités embarquées](/docs/features/activity-execution-model/), [Matrice en mode service](/docs/polyglot/portable-worker-affinity/) |
| Sessions workers | Disponibles dans Laravel embarqué, les SDK de service PHP et Python et le SDK Rust 3.2.0 avec activation explicite du worker. | [Sessions workers](/docs/features/worker-sessions/), [Matrice en mode service](/docs/polyglot/portable-worker-affinity/) |
| Exécution avec affinité | Disponible dans Laravel embarqué et le SDK de service PHP. Python et Rust restent non pris en charge. | [Exécution avec affinité](/docs/features/sticky-execution/), [Matrice en mode service](/docs/polyglot/portable-worker-affinity/) |
| Interopérabilité des codecs | PHP, Python et Rust utilisent l'enveloppe publique `codec` + `blob` et un même schéma Avro Value récursif fixe. Les branches nommées préservent les distinctions entier/double, texte/octets, booléen/entier et liste/table de correspondance. | [Protocole Avro Value](/docs/polyglot/avro-value-protocol/), [Protocole worker](/docs/polyglot/worker-protocol/), [SDK Rust](/docs/polyglot/rust/) |
| Diagnostics | Les runtimes de service et la CLI publient en JSON les faits de version, protocole, workers, files, relecture, historique, échecs typés et réparation. Managed Waterline, le service auto-hébergé distinct ou le paquet embarqué présentent les preuves de leur runtime propriétaire. | [Supervision](/docs/monitoring/), [Référence CLI](/docs/polyglot/cli-reference/), [API opérateur Waterline](/docs/waterline-operator-api/) |
| Outils pour agents | Découvrir -> Modifier -> Exécuter -> Diagnostiquer -> Réparer est accessible via les manifestes publics, schémas, opérations HTTP, JSON CLI, clients SDK, historiques et diagnostics typés et mutations sûres. MCP est une interface facultative, pas la définition. | [Contrat des outils pour agents](/docs/agent-tooling-contract/), [Boucle opératoire des agents](/docs/agent-operating-loop/) |

## Frontière d'interopérabilité des charges utiles {#payload-interoperability-boundary}

Les appels interlangages de workflow et d'activité ne transmettent ni objets PHP
sérialisés, ni pickles Python, ni types d'implémentation Rust. Ils transmettent
des noms de type enregistrés sous forme de chaînes et une enveloppe publique.
Avec `avro`, chaque SDK officiel utilise l'implémentation officielle du langage
et le même schéma Value fixe. Tables de correspondance, listes, chaînes,
octets, entiers, doubles, booléens et valeurs nulles décodés gardent leur type
primitif. Une classe propre à un langage n'est reconstruite que dans son SDK.

Ce contrat couvre les entrées et résultats de workflow, enfants, entrées et
résultats d'activité, signaux, requêtes de lecture, mises à jour et exécution
externe. Les déploiements doivent toujours vérifier les codecs annoncés par
`GET /api/cluster/info` avant d'admettre un worker.

## Frontière de publication et de maturité {#release-and-maturity-boundary}

Les contrats de plateforme indexés ici constituent l'interface stable du produit
2.0. Utilisez l'[évaluateur pour agents IA](/docs/ai-agent-workflow-engine/) pour
décider rapidement si le produit convient.
