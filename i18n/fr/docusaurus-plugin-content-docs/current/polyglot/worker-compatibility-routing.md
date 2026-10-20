---
sidebar_position: 5
title: Compatibilité et routage des workers
description: Préserver les épinglages d'origine, promouvoir les nouveaux démarrages et inspecter les workers compatibles manquants.
tags: [worker-protocol, compatibility, operations, rollouts]
keywords: [compatibilité des workers, déploiement, marqueurs, routage des builds, rollback]
---

# Compatibilité et routage des workers

La compatibilité est un contrat de routage. Gardez des workers capables de rejouer les historiques existants pendant le changement de build pour les nouveaux démarrages. Le drainage ne transfère pas les exécutions à un autre build.

## Deux identités liées {#two-related-identities}

- L'**identifiant de build** est le `build_id` enregistré d'une cohorte du Server autonome, dans un namespace et une file. Promotion, drainage et reprise ciblent cette cohorte.
- Le **marqueur de compatibilité** est conservé dans le travail durable. PHP embarqué utilise `DW_V2_CURRENT_COMPATIBILITY` et `DW_V2_SUPPORTED_COMPATIBILITIES` ; les builds des workers autonomes fournissent l'identité de routage correspondante.

Traitez ces identités comme des chaînes opaques. Un nom apparemment plus récent ne prouve pas la compatibilité au replay et n'autorise pas à changer le pin d'une exécution existante.

## Ce qui est épinglé {#what-gets-pinned}

Le Server autonome sélectionne le pin des nouveaux démarrages par promotion explicite, puis par ses replis sur une seule cohorte active. Une sélection ambiguë peut rester sans pin. Voir [l'ordre de sélection](/docs/polyglot/worker-build-id-rollout#canary-a-new-build).

Tâches de workflow et activités héritent de la compatibilité de l'exécution. Reprises de tâches, expiration des baux et redistribution la préservent. Les nouvelles exécutions de reprise, enfants et continue-as-new héritent aussi du pin d'origine. La promotion concerne les nouvelles instances ultérieures ; elle ne déplace pas une chaîne poursuivie.

## Fonctionnement du routage {#how-routing-works}

### Filtrage lors du poll {#poll-time-narrowing}

Les workers demandent un namespace, une file et une cohorte compatible. La sélection du poll évite de proposer du travail incompatible, mais n'est pas l'autorité finale.

### Vérification lors de la prise de tâche {#claim-time-enforcement}

La prise vérifie la compatibilité d'origine et l'identité du worker. Un worker incompatible n'obtient pas un bail parce qu'un autre build manque. L'expiration d'un bail n'élargit pas la compatibilité.

## Configuration opérateur {#what-operators-should-configure}

Pour PHP embarqué, configurez la famille courante et celles explicitement prises en charge :

```bash
DW_V2_CURRENT_COMPATIBILITY=orders-2026-04-28
DW_V2_SUPPORTED_COMPATIBILITIES=orders-2026-04-28,orders-2026-04-21
```

La première valeur épingle les nouveaux workflows embarqués ; la seconde autorise les prises pour ces familles. Utilisez `*` seulement avec une politique de compatibilité volontairement vérifiée. Pour les workers autonomes, enregistrez un `build_id` stable et utilisez la promotion et les contrôles de cycle de vie du Server. Gardez la même famille entre reconstructions compatibles au replay ; changer l'étiquette ne rend pas du code incompatible rejouable.

## Schéma de déploiement sûr {#safe-rollout-pattern}

1. Déployez et inspectez namespace, file, types et inscriptions récentes de la nouvelle cohorte. Gardez l'ancienne disponible.
2. Promouvez explicitement le build souhaité pour les nouveaux démarrages. Le nombre de workers ne définit pas de pourcentage de trafic.
3. Conservez la capacité compatible des exécutions épinglées, y compris celles qui attendent passivement timer, signal, activité ou enfant.
4. Drainez uniquement pour arrêter volontairement les nouvelles prises de cette cohorte. Si cela bloque du travail, reprenez et restaurez le build compatible d'origine.
5. Pour revenir sur les nouveaux démarrages, restaurez/reprenez et promouvez la cohorte connue comme fonctionnelle, puis révoquez le mauvais déploiement. Les pins existants restent inchangés.

Zéro tâche de workflow en attente ne prouve pas un retrait sûr. Conservez l'artefact et la voie de récupération tant qu'une exécution épinglée ou une chaîne héritée peut en dépendre. [Server #519](https://github.com/durable-workflow/server/issues/519) suit cette capacité protégée distincte ; la checklist ne la livre pas.

## État explicite de worker manquant {#explicit-missing-worker-state}

Inspectez ensemble les [tâches en attente par cohorte](/docs/polyglot/worker-build-id-rollout#pending-workflow-tasks-by-cohort), les inscriptions récentes/drainées/périmées et le pin d'origine. `no_compatible_worker` indique du travail de workflow en attente pour un build non nul sans worker actif compatible. Il ne compte ni les files d'activités ni toutes les exécutions passives épinglées. Un champ absent, une requête échouée ou un heartbeat périmé ne signifie pas une flotte vide ou zéro tâche. Restaurez le build attendu ou examinez sa file, son namespace et ses types avant d'ajouter des workers sans rapport.

## Lien avec les déploiements par build {#how-this-relates-to-build-id-rollouts}

L'état du déploiement décrit la capacité enregistrée et les intentions de nouveaux démarrages/cycle de vie ; la compatibilité détermine la prise d'une tâche d'origine précise. Utilisez les deux. Ni drainage ni rollback ne réécrit la compatibilité durable ou ne prouve qu'un build est supprimable.

## Références associées {#related-references}

- [Namespace, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers)
- [Déploiement des identifiants de build](/docs/polyglot/worker-build-id-rollout)
- [Référence de configuration Server](/docs/polyglot/server-config-reference)
- [Cadre d'exploitation](/docs/operator-operating-envelope)
