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

## Évolution de l’empreinte de définition {#definition-fingerprint-evolution}

**Prise en charge publiée.** Server 2.9.9 et les SDK PHP 2.5.4, Python 2.6.2 et Rust 3.5.6 ont introduit les protections d’entrée et le comportement de routage et de récupération décrits ci-dessous. Ce sont les versions minimales pour ces fonctions. Installez les versions stables actuelles pour bénéficier des correctifs de sécurité.

Le build fixé à l’origine et l’empreinte de définition répondent à des questions différentes. Une reconstruction compatible avec la relecture peut rester dans la même famille de builds tout en changeant l’empreinte du code source. Par défaut, le Server préfère un worker éligible dont l’empreinte correspond à celle enregistrée à `WorkflowStarted`. S’il n’en reste aucun, une définition modifiée ne peut prendre l’original que si son worker annonce `workflow_entry_arguments_validation`. Cette capacité promet un refus avant l’entrée sans faire échouer l’exécution métier. Elle ne se déduit ni du langage du runtime ni de la version du protocole ; ajouter manuellement cette chaîne ne rend pas sûre une implémentation worker qui ne l’est pas.

Le repli exige toujours le namespace, la file de tâches, le type de workflow, le build et les capacités de relecture d’origine. L’exécution conserve son empreinte enregistrée et ses instantanés d’admission. Le SDK doit valider l’entrée d’origine et relire les commandes validées ; une modification du code, un marqueur de version ou un enregistrement réussi ne prouve pas que cette relecture réussira. Redémarrez le code modifié avec un nouvel identifiant de worker, car un enregistrement actif ne peut pas modifier l’empreinte qu’il annonce.

Le détail d’exécution, le débogage ciblant l’exécution, les réponses de réparation et le détail de la file de tâches exposent `definition_routing` :

| Statut | Sens et action |
| --- | --- |
| `matching_definition_available` / `matching_definition_preferred` | Une capacité éligible correspondant à la définition enregistrée est disponible ou préférée au worker modifié. |
| `replay_required` | Une définition modifiée disposant de la capacité requise peut prendre la tâche. La validation d’entrée et la relecture stricte doivent encore réussir. Ce n’est pas un verdict de blocage. |
| `entry_validation_unavailable` | Le remplacement ne dispose pas de la capacité de validation d’entrée. Mettez le SDK à niveau ou restaurez la définition enregistrée. |
| `no_eligible_worker` / `worker_definition_missing` / `recorded_definition_missing` | Inspectez les informations de capacité ou d’empreinte manquantes en préservant les contrôles de routage d’origine. |
| `pinning_disabled` | La préférence pour le code source correspondant est désactivée ; les autres contrôles de prise de tâche et de relecture restent applicables. |

`blocked = true` décrit une tâche de workflow prête et arrivée à échéance de disponibilité, sans route de définition éligible. Le détail de la file échantillonne au plus dix exécutions et indique si d’autres exécutions prêtes existent ; ce n’est pas un décompte complet des exécutions passives ou bloquées. La réparation ne peut ni créer un worker correspondant ni réécrire l’historique. Après un véritable refus à l’entrée, suivez la [procédure de récupération de la même exécution d’origine](../failures-and-recovery.md#service-entry-recovery).

`DW_V2_PIN_TO_RECORDED_FINGERPRINT=false` supprime la préférence pour le code source correspondant. Cela ne supprime ni les builds fixés, ni les limites de namespace/file/type, ni l’identité d’enregistrement, ni le fencing des leases, ni les contrôles stricts de relecture. Ce réglage ne remplace pas le SDK sûr et la mise à niveau par le chemin par défaut. Les anciens runtimes peuvent laisser silencieusement une définition modifiée sans worker utilisable ou relancer un refus d’entrée non classé ; utilisez la combinaison exacte de runtime et de SDK qualifiée.

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
