---
sidebar_position: 5
title: Compatibilité et routage des workers
description: Sécuriser les déploiements de builds de workers en affectant le travail en cours à des exécuteurs compatibles et en rendant explicites les lacunes de déploiement.
tags:
  - worker-protocol
  - compatibility
  - operations
  - rollouts
keywords:
  - compatibilité des workers
  - déploiements de builds de workers
  - marqueurs de compatibilité
  - routage par build id
  - retour arrière des workers
---

# Compatibilité et routage des workers {#worker-compatibility-and-routing}

Utilisez ce guide pour déployer un nouveau build de worker, essayer un canari
sur une file de tâches, revenir sur un build défectueux ou maintenir des
workflows de longue durée pendant un déploiement de workers. Durable Workflow
v2 traite la compatibilité des workers comme un contrat de routage, plutôt
que comme une convention informelle de déploiement.

La règle essentielle est simple : une exécution démarrée dans une famille de
compatibilité doit continuer à arriver sur des workers capables de la relire
et de l'exécuter en toute sécurité. Le système doit exposer « aucun worker
compatible n'est disponible » comme un état opérationnel explicite plutôt que
de transmettre silencieusement la tâche à un autre build.

## Deux identités liées {#two-related-identities}

Durable Workflow expose deux interfaces de déploiement liées mais différentes :

- Le **build id** est l'identité de cohorte présentée à l'opérateur sur le
  serveur autonome. C'est la valeur qu'un worker enregistre sous `build_id`,
  et celle que les API de déploiement de file de tâches drainent ou réactivent.
- Le **marqueur de compatibilité** est l'identité de routage du travail en
  cours. Pour les workers PHP embarqués ou hébergés par le serveur, il provient
  de `DW_V2_CURRENT_COMPATIBILITY` et `DW_V2_SUPPORTED_COMPATIBILITIES`. Sur le
  serveur autonome, les cohortes de build-id permettent à l'opérateur
  d'inspecter et de contrôler ces groupes de workers compatibles.

Traitez ces deux valeurs comme des chaînes opaques, par exemple
`orders-2026-04-28` ou `api-v3`. Durable Workflow n'interprète pas semver, ne
compare pas les dates et ne suppose pas qu'une chaîne est plus récente qu'une autre.

## Éléments dont la compatibilité est fixée {#what-gets-pinned}

La compatibilité est attachée au travail durable du workflow, pas seulement
aux processus worker en cours d'exécution.

- Le **démarrage du workflow** enregistre la famille de compatibilité actuelle
  sur la nouvelle exécution.
- Les **tâches de workflow** héritent de cette famille et la conservent lors
  des nouvelles tentatives, expirations de bail et redistributions.
- Les **tâches d'activité** héritent de la même famille que leur exécution parente.
- Les **exécutions de nouvelle tentative** conservent la famille de l'exécution source.
- **Continue-as-new** conserve la famille de l'exécution actuelle.
- Les **workflows enfants** héritent de la famille de l'exécution parente.

Un workflow de longue durée ne passe donc pas à une autre famille d'exécuteurs
simplement parce qu'un déploiement a changé. Les nouveaux builds influent sur
les nouveaux démarrages, sauf si vous drainez volontairement les anciennes
cohortes et déplacez le trafic.

## Fonctionnement du routage {#how-routing-works}

Le contrôle de compatibilité intervient à plusieurs niveaux.

### Restriction lors de l'interrogation {#poll-time-narrowing}

Les workers restreignent leurs demandes par file de tâches et cohorte de
compatibilité/build pour que le serveur ou le moteur embarqué évite de
proposer d'abord des tâches manifestement incompatibles.

Il s'agit d'une indication d'efficacité, pas de la frontière de sûreté finale.

### Contrôle lors de la prise en charge {#claim-time-enforcement}

Le contrôle lors de la prise en charge garantit la correction. Si un worker
ne peut pas exécuter une tâche en toute sécurité, Durable Workflow rejette
la prise en charge avec un motif de compatibilité explicite plutôt que de
réaffecter silencieusement la propriété.

C'est le contrat sur lequel s'appuyer lors des déploiements affectant la compatibilité :

- les tâches ne sont jamais élargies silencieusement à un worker incompatible ;
- l'expiration du bail et la relivraison conservent la famille de compatibilité d'origine ;
- l'absence de worker compatible est un état observable, pas un comportement indéfini.

## Configuration à définir par les opérateurs {#what-operators-should-configure}

Utilisez des familles de compatibilité stables et lisibles pour les builds
capables de relire sans risque les mêmes workflows en cours.

Pour les workers PHP embarqués ou hébergés par le serveur, définissez :

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

`DW_V2_CURRENT_COMPATIBILITY` nomme la famille à laquelle les nouvelles
exécutions sont affectées. `DW_V2_SUPPORTED_COMPATIBILITIES` nomme les familles
que ce worker peut encore prendre en charge pendant un déploiement ou un
retour arrière. N'utilisez `*` que pour les flottes à build unique ou des bancs
de test ciblés ; ne l'utilisez pas pour masquer une politique de déploiement incertaine.

Pour les workers du serveur autonome, enregistrez un `build_id` stable et
utilisez les API de déploiement build-id pour drainer ou réactiver volontairement
les cohortes.

## Séquence de déploiement sûre {#safe-rollout-pattern}

Suivez cette séquence pour les changements de worker affectant la compatibilité :

1. Démarrez la nouvelle cohorte de workers avec un nouveau build id ou marqueur de compatibilité.
2. Gardez l'ancienne cohorte active jusqu'à confirmation que la nouvelle peut prendre du travail.
3. Drainez l'ancienne cohorte pour qu'elle cesse de prendre de nouvelles tâches,
   mais puisse terminer ou libérer celles qu'elle détient déjà sous bail.
4. Surveillez les interfaces de compatibilité et de files de tâches jusqu'à
   ce que l'ancienne cohorte ne soit plus nécessaire.
5. Réactivez l'ancienne cohorte uniquement si un retour arrière est nécessaire.

Conservez la famille de compatibilité lors des reconstructions compatibles
avec la relecture. Ne la changez que lorsque les nouveaux workers ne doivent
plus prendre les tâches créées par l'ancienne famille.

## État explicite en l'absence de worker {#explicit-missing-worker-state}

Lorsqu'aucun worker ne peut satisfaire la famille de compatibilité requise,
Durable Workflow doit l'indiquer clairement :

- les résumés de flotte indiquent que la compatibilité requise n'est pas couverte ;
- les interfaces de files de tâches et de déploiement indiquent les cohortes
  encore actives, en drainage, périmées ou absentes ;
- les diagnostics de workflow indiquent que l'exécution attend un worker compatible ;
- la santé opérationnelle et les métriques exposent le travail bloqué par la
  compatibilité comme une condition nommée.

C'est le signal attendu pendant un déploiement partiel ou un retour arrière
incomplet. Traitez-le comme une véritable condition opérationnelle à corriger,
pas comme un aléa transitoire.

## Lien avec les déploiements build-id {#how-this-relates-to-build-id-rollouts}

L'état du déploiement build-id et le routage de compatibilité résolvent des
problèmes différents :

- Le **déploiement build-id** indique aux opérateurs les cohortes de workers
  actives et leur permet de les drainer ou de les réactiver volontairement.
- Le **routage de compatibilité** décide si une tâche précise en cours peut
  être exécutée sur un worker donné.

On utilise généralement les deux ensemble. Les cohortes build-id indiquent
quels exécuteurs sont disponibles ; le routage de compatibilité garantit que
le travail de longue durée n'arrive que sur une cohorte compatible.

## Références associées {#related-references}

- [Espaces de noms, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers)
  pour la charge utile d'inscription des workers, y compris `build_id`.
- [Déploiement des build-id de workers](/docs/polyglot/worker-build-id-rollout)
  pour le cycle de drainage/réactivation sur une file de tâches.
- [Référence de configuration de Server](/docs/polyglot/server-config-reference)
  pour `DW_V2_CURRENT_COMPATIBILITY`, `DW_V2_SUPPORTED_COMPATIBILITIES` et la
  configuration associée.
- [Enveloppe d'exploitation](/docs/operator-operating-envelope) pour la santé,
  les métriques et les diagnostics d'exécution exposant les lacunes de compatibilité.
