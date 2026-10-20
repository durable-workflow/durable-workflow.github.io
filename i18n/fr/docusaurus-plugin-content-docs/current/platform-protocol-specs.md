---
sidebar_position: 18
title: Spécifications des protocoles de la plateforme
description: Catalogue des spécifications publiques OpenAPI, JSON Schema et AsyncAPI de Durable Workflow destiné aux consommateurs.
tags:
  - compatibility
  - protocols
  - api-stability
  - openapi
  - json-schema
  - asyncapi
keywords:
  - spécifications des protocoles de la plateforme
  - catalogue des protocoles
  - openapi
  - asyncapi
  - json schema
  - spécification du plan de contrôle
  - spécification du protocole worker
---

import PublicAuthorityIdentity from '@site/src/components/PublicAuthorityIdentity';
import ProtocolCatalog from '@site/src/components/ProtocolCatalog';
import WorkerProtocolAuthorityRoles from '@site/src/components/WorkerProtocolAuthorityRoles';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

# Spécifications des protocoles de la plateforme {#platform-protocol-specs}

Le catalogue des protocoles de la plateforme indique précisément aux auteurs
de SDK, agents, opérateurs et outils tiers quelle spécification lisible par
machine régit chaque interface publique de Durable Workflow.

Utilisez le [catalogue lisible par machine](https://durable-workflow.github.io/platform-protocol-specs.json)
pour l'automatisation. Chaque entrée disponible fournit un identifiant stable
de spécification et une URL HTTPS publique pointant directement vers un
artefact OpenAPI, AsyncAPI ou JSON Schema.

Les chemins de dépôt, symboles d'implémentation et jeux de données de test ne
font volontairement pas autorité pour les consommateurs. Ils sont exclus du
catalogue publié et conservés uniquement comme diagnostics de validation.

## Identité et découverte du catalogue {#catalog-identity-and-discovery}

<PublicAuthorityIdentity
  manifest={protocolCatalog}
  manifestUrl="https://durable-workflow.github.io/platform-protocol-specs.json"
/>

Le catalogue est aussi disponible via :

- le catalogue JSON public à
  https://durable-workflow.github.io/platform-protocol-specs.json;
- platform_protocol_specs dans GET /api/cluster/info sur le serveur autonome ;
- ce guide 2.0 pour le contexte destiné aux humains.

L'URL JSON est la référence du catalogue exploitable par machine. Le serveur
réexporte le même catalogue afin que les clients découvrent l'interface de
protocole active sans supposer une organisation du dépôt.

<WorkerProtocolAuthorityRoles />

## Champs destinés aux consommateurs {#consumer-fields}

Chaque entrée expose le contrat suivant :

| Champ | Signification |
|---|---|
| spec_id | Identifiant stable du protocole Durable Workflow. Les documents publiés portent l'identité correspondante. |
| spec_url | URL HTTPS publique directe de la spécification lisible par machine. |
| format | openapi, json_schema ou asyncapi. |
| status | Indique si l'artefact référencé est publié, en cours ou prévu. |
| surface_family | Famille de politique de compatibilité régissant l'interface. |
| authority_manifest | Manifeste de découverte par lequel un runtime annonce l'interface. |
| owner_repo | Projet responsable de la spécification. |
| object_families | Noms publics des familles d'objets et projets responsables. |
| evolution_rule | Règle de compatibilité pour les ajouts et changements incompatibles. |
| breaking_change_release | Frontière de publication exigée par cette règle d'évolution. |

Les consommateurs devraient résoudre spec_url et valider l'identité du
document avec spec_id. Aucun accès aux sources extraites n'est nécessaire.

## Spécifications disponibles {#available-specifications}

Cet inventaire est généré à partir du catalogue JSON public. L'identité, la
disponibilité, les liens publics et la responsabilité des familles d'objets
restent donc des données du catalogue plutôt qu'une seconde autorité en prose.

<ProtocolCatalog />

### Notes sur le runtime des sessions de workers {#worker-session-runtime-notes}

Ce schéma couvre la découverte des capacités des sessions de workers, les
enveloppes de cycle de vie, les instantanés d'affinité des tâches et la
visibilité opérationnelle. Son identifiant stable est
durable-workflow.v2.worker-sessions-runtime.

### Notes sur le runtime des activités locales {#local-activity-runtime-notes}

Ce schéma couvre la découverte des capacités d'activités locales, les
instantanés d'options, marqueurs d'historique, sémantiques de nouvelles
tentatives et la visibilité opérationnelle. Son identifiant stable est
durable-workflow.v2.local-activity-runtime.

### Notes sur l'enveloppe cluster-info {#cluster-info-envelope-notes}

Ce schéma couvre GET /api/cluster/info et les manifestes de découverte
imbriqués disponibles à ce point de terminaison. Son identifiant stable est
durable-workflow.v2.cluster-info-envelope.

## Formats {#formats}

| Format | Utilisation |
|---|---|
| OpenAPI 3.1 | Interfaces requête-réponse HTTP et JSON dont les routes, méthodes, codes d'état et enveloppes font partie du contrat. |
| JSON Schema 2020-12 | Enregistrements persistés, charges utiles d'événements, enveloppes de résultats, options de runtime et familles d'objets associées. |
| AsyncAPI 2.6 ou ultérieur | Sémantiques d'interrogation, de flux, de renouvellement de bail, d'ordre et de livraison. |

## Niveaux d'état {#status-levels}

| État | Signification |
|---|---|
| published | La spécification publique lisible par machine est disponible à spec_url et directement exploitable. |
| in_progress | Une spécification publique est disponible, mais sa couverture est partielle. Les champs et routes énumérés sont normatifs. |
| planned | L'entrée possède une identité de catalogue stable mais pas encore de spécification exploitable. Les entrées prévues n'annoncent pas spec_url. |

## Règles d'évolution {#evolution-rules}

additive_minor_breaking_major autorise les ajouts dans les versions mineures.
Suppressions, renommages, restrictions de types et changements sémantiques
exigent une version majeure et devraient utiliser une route ou un champ
parallèle lorsque c'est réalisable.

parallel_primitive_only régit les formats de transport figés. Une forme
incompatible doit être introduite sous un nouveau type d'événement, type de
commande ou identifiant de schéma, tandis que l'original reste décodable.

experimental_any_release ne s'applique qu'aux spécifications explicitement
expérimentales et autorise des changements dans toute version.

## Validation des publications {#release-validation}

La CI du site documentaire impose les contrôles machine suivants :

| Contrôle | Vérification de la CI |
|---|---|
| catalog_aligned_with_surface_families | Chaque entrée référence une famille publique déclarée de compatibilité. |
| owner_repo_known | Les responsables des entrées et familles d'objets utilisent le vocabulaire du catalogue. |
| format_known | Chaque artefact disponible s'analyse dans le format déclaré. |
| public_spec_references_resolve | Chaque spec_url disponible est une URL HTTPS de l'espace public des spécifications et se résout en un artefact livré dont l'identité correspond à spec_id. |
| repository_local_authority_fields_rejected | Les entrées publiées ne contiennent aucun chemin local au dépôt, symbole d'implémentation, référence de test ni ancien champ d'autorité. |
| workflow_package_mirror_aligned | Le catalogue public correspond au catalogue Workflow empaqueté lorsque cette entrée de publication est disponible. |
| server_owned_spec_mirrors_aligned | Les artefacts publiés relevant de Server correspondent aux miroirs du dépôt responsable lorsque ces entrées sont disponibles. |
| diagnostic_provenance_complete | La provenance réservée à la validation couvre chaque entrée du catalogue et famille d'objets. |
| object_family_metadata_declared | Les entrées du catalogue et documents publiés concordent sur les noms et responsables des familles d'objets. |
| rendered_retrieval_surfaces_aligned | La page 2.0 construite et les ensembles complets 2.0 de récupération pour modèles exposent l'identité de catalogue, l'URL publique et les responsables des familles d'objets de chaque entrée disponible. |
| breaking_change_release_consistent_with_evolution_rule | Chaque valeur de version pour changement incompatible correspond à sa règle d'évolution. |
| deliverable_specs_published | Chaque interface requise de la plateforme possède une spécification publiée et analysable. |

Le contrôle machine charge le catalogue JSON public, valide son vocabulaire et
ses références utilisables par les consommateurs, analyse les spécifications
livrées, vérifie les métadonnées des familles d'objets et schémas embarqués et
compare les miroirs des paquets lorsqu'ils sont disponibles. Après génération
du site et des ensembles pour modèles, un contrôle sémantique compare leurs
valeurs de catalogue rendues à la même autorité JSON. Le texte de la
documentation et des titres ne participe pas à cette comparaison.

Si le contrat change, mettez à jour ensemble le catalogue Workflow empaqueté,
ce miroir JSON public et les artefacts publiés des spécifications affectées.
La revue humaine confirme que les explications restent utiles sans les
traiter comme autorité machine.

Passez à la [suite de conformité de la plateforme](/docs/platform-conformance)
pour résoudre les jeux de données actifs liés à des octets précis qui exercent
ces spécifications. Les preuves historiques y sont identifiées séparément et
ne remplacent pas une autorité de catalogue actuelle.
