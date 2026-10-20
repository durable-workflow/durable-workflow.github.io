---
sidebar_position: 19
title: Neutralité des SDK
description: Contrat permanent d'indépendance des langages permettant de créer un futur SDK TypeScript, Go, Java ou .NET pour les interfaces publiques de Durable Workflow sans refonte du protocole.
tags:
  - compatibility
  - protocols
  - api-stability
  - sdk
  - language-agnosticism
keywords:
  - neutralité des SDK
  - indépendance des langages
  - neutralité du protocole
  - neutralité du codec
  - sdk typescript
  - sdk go
  - sdk java
  - sdk dotnet
  - sdk python
  - paquet workflow php
---

import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Neutralité des SDK {#sdk-neutrality}

Cette page explique le contrat de neutralité des SDK de la plateforme. Elle
énumère les règles minimales que chaque interface publique de Durable Workflow
doit respecter et l'audit permanent d'indépendance des langages appliqué par les
responsables de publication aux nouvelles interfaces Server, Workflow, CLI,
Waterline et MCP.

Le guide d'architecture amont est publié dans
[`sdk-neutrality.md`](https://github.com/durable-workflow/workflow/blob/main/docs/architecture/sdk-neutrality.md).
Le contrat de référence lisible par machine est publié sur ce site à
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json), avec l'identifiant
de schéma `durable-workflow.v2.sdk-neutrality.contract`. Son autorité sur le
protocole et le périmètre des SDK vient du JSON livré dans le paquet Composer
Workflow à `resources/sdk-neutrality-contract.json`. Le miroir public ajoute
les métadonnées actuelles de distribution des paquets issues du tuple centralisé
d'artefacts de la documentation. Le serveur autonome Durable Workflow réexporte
le manifeste de base du paquet dans `GET /api/cluster/info`, sous
`sdk_neutrality_contract`. En cas de désaccord avec cette page, le contrat JSON
publié fait foi et la divergence est un bogue de documentation.

Ce contrat dépend de la référence [Compatibilité des versions](/docs/compatibility)
(qui définit *quelles* interfaces sont publiques et *comment* elles peuvent
évoluer) et du catalogue [Spécifications des protocoles de la plateforme](/docs/platform-protocol-specs)
(qui indique *où* se trouve la spécification normative de chaque interface). Il
définit la *forme* autorisée de ces spécifications pour qu'un futur SDK en dehors
des langages PHP, Python et Rust actuels puisse les cibler sans refondre le protocole.

## Pourquoi ce contrat existe {#why-this-exists}

Durable fournit trois SDK autonomes officiels : le paquet PHP
`durable-workflow/sdk`, le paquet Python `durable_workflow` et la crate Rust
`durable-workflow`. Le paquet PHP distinct `durable-workflow/workflow` reste le
moteur Laravel embarqué et le responsable de la relecture. Ce n'est pas le SDK
PHP indépendant du framework. Créer ou entretenir un vaste ensemble de SDK
officiels n'est **pas** un objectif de publication. La demande de SDK pour
TypeScript, Go, Java et .NET n'est pas encore démontrée, et le coût de maintenance
d'un large ensemble officiel est élevé.

Ce contrat protège contre un autre risque : que les contrats publics sous les
SDK intègrent discrètement des hypothèses propres à un langage. Si un SDK
TypeScript ou Go devient utile, le travail doit consister à écrire un client
pour le protocole public, sans devoir repenser ce protocole pour qu'un autre
langage puisse simplement l'utiliser.

## Périmètre {#scope}

| Clé de périmètre | Signification |
| --- | --- |
| `goal` | Préserver la neutralité du protocole et des contrats pour qu'un futur SDK TypeScript, Go, Java ou .NET puisse exister sans refonte du protocole. |
| `non_goal` | Fournir un large portefeuille de SDK officiels. Leur nombre reste volontairement limité et ne croît que si la demande d'adoption le justifie. |
| `present_priority` | Python est actuellement le parcours hors PHP le plus utile aux utilisateurs existants et constitue une interface prioritaire pour la couverture de parité. |
| `future_posture` | TypeScript, Go, Java, .NET et les autres langages dépendent de la demande. Aucune publication ne leur est réservée, mais chaque contrat public doit permettre d'écrire un futur SDK dans ces langages sans casser le protocole d'échange. |

## Politique de périmètre des SDK officiels {#official-sdk-breadth-policy}

L'ensemble de SDK officiels reste volontairement limité :

| Langage | Position | Paquet publié | Référence de conformité |
| --- | --- | --- | --- |
| PHP | `priority` | [`durable-workflow/sdk`](https://packagist.org/packages/durable-workflow/sdk) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), acteurs `sdk_php`, `php_sdk_client` et `php_worker` |
| Python | `priority` | <PythonPackageReleaseLink>`durable_workflow` %%artifact.pythonPublishedSdkVersion%%</PythonPackageReleaseLink> | [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json), acteur `python_sdk_runtime` |
| Rust | `priority` | [`durable-workflow`](https://crates.io/crates/durable-workflow) | [`signal_query_runtime_contract`](https://durable-workflow.github.io/platform-conformance/signal-query-runtime-scenarios.json), acteurs `rust_sdk`, `rust_worker` et `rust_sdk_client` |
| TypeScript | `demand_driven` | Aucun | Les contrats publics doivent rester implémentables en TypeScript sans refonte du protocole. |
| Go | `demand_driven` | Aucun | Les contrats publics doivent rester implémentables en Go sans refonte du protocole. |
| Java | `demand_driven` | Aucun | Les contrats publics doivent rester implémentables en Java sans refonte du protocole. |
| .NET | `demand_driven` | Aucun | Les contrats publics doivent rester implémentables en .NET sans refonte du protocole. |

Le contrat JSON énumère les `scenario_ids` exacts qui constituent la couverture
de `first_party.php_sdk`, `first_party.python_sdk` et `first_party.rust_sdk`.
Il suit séparément le paquet Laravel sous `embedded_engines.php_workflow_engine`,
avec une couverture de relecture pour l'acteur `workflow_php_runtime`. Les
consommateurs peuvent résoudre ces identifiants dans les catalogues liés sans
cloner de dépôt SDK ni lire sa suite de tests.

Un nouveau SDK officiel n'est ajouté que si :

1. Une demande utilisateur documentée ne peut pas être satisfaite par les SDK existants.
2. Une équipe de maintenance candidate s'engage à maintenir le SDK dans le
   banc de conformité, le catalogue des spécifications et le manifeste de
   référence des publications.
3. Son ajout n'exige aucune modification incompatible du protocole worker, du
   plan de contrôle, des formats d'événements d'historique ou des fixtures de
   relecture. Si de telles modifications sont nécessaires, le défaut est dans
   le protocole, pas dans le SDK.

## Règles de neutralité {#neutrality-rules}

Chaque contrat public Durable doit respecter les sept règles ci-dessous. Le
manifeste JSON fait foi pour la forme exacte des champs. Ces résumés servent
aux réviseurs. Chaque règle du manifeste porte des champs `requirement`,
`rationale`, `how_to_apply` et un tableau `authority`. Chaque référence contient
un identifiant stable de catalogue ou de schéma et une URL absolue de l'artefact publié.

| Règle | Exigence |
| --- | --- |
| `protocol_neutrality` | Les interfaces publiques RPC et événementielles utilisent des formes HTTP+JSON ou AsyncAPI que tout runtime capable d'utiliser HTTP peut produire et consommer. |
| `codec_neutrality` | Chaque charge utile durable traversant une frontière publique annonce `avro`. Aucun autre codec v2 public ou propre au moteur n'est proposé. |
| `error_shape_neutrality` | Les objets d'échec publics utilisent une enveloppe structurée (`code`, `message`, `details` facultatif). Les noms de classes d'exception PHP et Python sont uniquement diagnostiques. |
| `type_identity_neutrality` | Les types de workflow, d'activité, de workflow enfant et d'exception sont identifiés par des noms de chaîne stables. Les FQCN de classe et chemins de module sont des commodités d'entrée SDK, pas le contrat. |
| `replay_fixture_neutrality` | Les fixtures de relecture et les ensembles d'historiques de référence sont du JSON conforme aux schémas publiés `history_event_payloads` et `replay_bundle`. |
| `discovery_neutrality` | Chaque interface publique est accessible depuis `GET /api/cluster/info` et le catalogue `platform_protocol_specs`. |
| `documentation_neutrality` | La documentation des contrats publics décrit les formes par les schémas, les routes et la sémantique des champs. Le comportement des classes PHP et Python sert d'exemple SDK, pas de contrat normatif. |

## Audit permanent d'indépendance des langages {#standing-language-agnosticism-audit}

Chaque nouvelle interface Server, Workflow, CLI, Waterline ou MCP doit réussir
l'audit de neutralité avant sa promotion à `stable`. Cet audit est un point
permanent de la revue de publication pour toute modification touchant une
famille d'interfaces concernée. Ces familles sont :

- `server_api`
- `worker_protocol`
- `cli_json`
- `waterline_api`
- `mcp_discovery_results`
- `cluster_info_manifests`

La liste de contrôle comporte huit étapes. Sept correspondent aux règles
ci-dessus. La huitième, l'**expérience de pensée du futur SDK**, demande au
réviseur de décrire en deux phrases comment un SDK TypeScript ou Go utiliserait
la nouvelle interface avec le seul catalogue public et une chaîne d'outils
HTTP+JSON standard. Si la réponse nécessite un SDK officiel, l'interface n'est
pas neutre. Elle doit être repensée, ou l'écart de neutralité doit être consigné
comme limite connue avant sa promotion.

## Ce sur quoi repose un futur SDK {#what-a-future-sdk-relies-on}

Le contrat identifie les interfaces qu'un futur SDK doit pouvoir lire sans
examiner le code source d'un SDK officiel :

- **Protocole** : `durable-workflow.v2.control-plane-api`,
  `durable-workflow.v2.worker-protocol-api` et
  `durable-workflow.v2.worker-protocol-stream` dans le
  [catalogue de protocoles](https://durable-workflow.github.io/platform-protocol-specs.json) publié.
- **Codecs** : l'ensemble universel documenté par
  `durable-workflow.v2.worker-protocol-api` et annoncé par le schéma de
  découverte `durable-workflow.v2.cluster-info-envelope`.
- **Forme des erreurs** : l'enveloppe d'échec du protocole worker et le schéma
  `durable-workflow.v2.repair-actionability-objects`.
- **Entrées de relecture** : les schémas JSON
  `durable-workflow.v2.history-event-payloads` et
  `durable-workflow.v2.replay-bundle`, ainsi que les identifiants de scénario du
  catalogue public [`history_replay_bundles`](https://durable-workflow.github.io/platform-conformance/replay-runtime-scenarios.json).
- **Découverte** : `durable-workflow.v2.cluster-info-envelope` et le catalogue
  `durable-workflow.v2.platform-protocol-specs.catalog` lui-même.

Si un SDK candidat dans un langage donné ne peut pas atteindre l'une de ces
interfaces, sa création nécessite une modification du protocole et la garantie
d'indépendance des langages n'est pas respectée.

## Conditions de publication {#release-gates}

Une publication qui introduit une nouvelle famille d'interfaces publiques ou
promeut une interface de `prerelease` ou `experimental` à `stable` doit consigner
le résultat de l'audit dans sa PR. La section correspondante du manifeste
énumère les contrôles précis :

- `audit_recorded` : la description de la PR indique les étapes appliquées et
  lie l'entrée du catalogue des spécifications, la fixture de conformité et
  l'entrée de découverte de la nouvelle interface.
- `no_php_or_python_only_required_fields` : aucun champ garanti d'une interface
  `stable` ne nécessite un codec réservé à PHP ou Python.
- `universal_codec_advertised` : la négociation du protocole worker annonce
  exactement un codec universel, `avro`.
- `fixture_schema_validated` : les nouvelles fixtures de relecture ou ensembles
  d'historiques de référence sont validés par les schémas JSON publiés.
- `discovery_entry_present` : les nouvelles interfaces publiques ont une entrée
  `platform_protocol_specs` avec des champs `surface_family`, `owner_repo` et
  `format` non vides.

L'application des règles se répartit entre contrôles automatiques et humains.
La CI de publication résout chaque URL de référence, identifiant de protocole
ou schéma et identifiant de scénario de conformité du contrat public. Elle
recoupe le périmètre d'audit avec les familles de stabilité et rejette les
chemins de référence propres au dépôt ou les symboles d'implémentation. Les
réviseurs valident l'audit de neutralité pour chaque PR qui ajoute ou promeut
une interface et restent responsables de l'expérience de pensée du futur SDK.

## Modifier ce contrat {#changing-this-contract}

Ajouter une règle de neutralité, renforcer une règle, ajouter une étape d'audit
obligatoire, ajouter une famille à son périmètre ou modifier la politique de
périmètre des SDK officiels constitue une modification du contrat. Incrémentez
la version du manifeste, mettez à jour le guide d'architecture et cette page
dans la même modification, puis alignez le contrat consommable à
[`/sdk-neutrality-contract.json`](/sdk-neutrality-contract.json).
Supprimer une règle de neutralité ou une étape d'audit est une modification majeure.
