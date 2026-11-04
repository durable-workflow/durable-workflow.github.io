---
title: "Déplacer les charges entre runtimes"
description: "Laissez finir les exécutions existantes et déplacez les nouveaux démarrages entre Server autohébergés et Cloud."
tags:
  - migration
  - operations
  - polyglot
---

# Déplacer les charges entre runtimes

Dirigez les nouveaux démarrages vers la destination pendant que les exécutions existantes se terminent à la source. Cette procédure couvre des runtimes indépendants en mode service. Un export d’historique conserve des preuves, mais ne transfère pas une exécution active issue de Server. L’[import embedded v2](./embedded-to-server.md#phase-e-import-eligible-embedded-v2-runs) accepte uniquement les sources embedded éligibles.

## Choisir la destination {#paths}

| Déplacement | Préparation de la destination |
| --- | --- |
| Server autohébergé vers un autre Server autohébergé | Déployez la destination avec sa propre base autoritative, son stockage de payloads et ses identifiants. Suivez le [guide de déploiement](../deployment.md). |
| Server autohébergé vers Cloud | Provisionnez l’espace de noms cible et vérifiez l’URL du runtime, les identifiants et les capacités renvoyés. Suivez la [configuration Cloud](./cloud-control-plane.md). |
| Cloud vers Server autohébergé | Préparez la destination et ses workers SDK avant de modifier le trafic applicatif. Gardez la source Cloud provisionnée pendant que ses exécutions se terminent. |

## Préparer les deux runtimes {#prepare}

Consignez chaque endpoint source, espace de noms, ID d’instance et d’exécution, file de tâches, types de workflow/activity et dépendances du stockage de payloads. Conservez une voie de récupération testée pour le stockage autohébergé. Quitter Cloud ne donne pas accès à une sauvegarde de base et ne copie pas les identifiants Cloud vers la destination. Vérifiez la version et les capacités réelles de la destination, les identifiants par rôle, les workers enregistrés et les types annoncés.

## Basculer les nouveaux démarrages par petits groupes {#cutover}

1. Exécutez la destination et ses workers à côté de la source. Terminez une exécution canari identifiée de manière unique, avec des activités et résultats représentatifs. Isolez ses effets du travail métier réel.
2. Inventoriez tous les producteurs de démarrages : appels applicatifs, planifications, adaptateurs webhook/bridge et appels de service. Choisissez un point de bascule pour une famille de workflows. Coordonnez les pauses de planifications et leur enregistrement à destination pour éviter de lancer la même occurrence sur les deux runtimes.
3. Dirigez les nouveaux démarrages de cette famille vers la destination. Conservez dans l’application l’endpoint et l’espace de noms ayant accepté chaque workflow. Réutiliser une clé métier sur un autre runtime ne fournit pas de déduplication entre runtimes.
4. Dirigez signaux, approbations, mises à jour, requêtes, annulations et lectures de résultats/historique vers le runtime propriétaire de l’exécution. Gardez les workers, files, timers, identifiants et accès aux payloads de la source. Changer l’URL du client ne déplace ni le travail accepté ni ses baux d’activité.
5. Vérifiez résultats et échecs avant de déplacer la famille suivante. Si le résultat d’un démarrage est incertain à cause du transport, résolvez-le sur le runtime d’origine avant de le soumettre ailleurs. Une exécution longue qui n’atteint jamais un état terminal n’est pas drainée.

## Conserver les preuves avant le retrait {#preserve-evidence}

Exportez l’historique à conserver, notamment chaque exécution de continuation nécessaire, les octets originaux des payloads et les codecs. Vérifiez intégrité et exhaustivité avec un consommateur compatible et conservez l’identité exacte du producteur. Le [guide d’export et de replay](../testing.md#service-sdk-replay) explique les contrôles distincts. Les exports d’audit ne rendent pas les exécutions Server éligibles à l’import d’état actif.

Vérifiez le producteur qui sert réellement l’export. Core 2.11.4 seul ne qualifie pas les exports Server, CLI inclus, SDK HTTP ou Cloud. Suivez la [qualification séparée du producteur HTTP et de l’image Server](https://github.com/durable-workflow/server/issues/692). Les anciens bundles avec pertes restent invalides. Ne modifiez ni nombres ni sommes de contrôle pour forcer leur acceptation, et ne détruisez pas la source autoritative tant que les preuves requises sont indisponibles ou invérifiables.

## Retirer la source en dernier {#retire-source}

Confirmez l’absence d’exécutions non terminales appartenant à la source dans tous les espaces de noms concernés et toutes les pages de listes. Incluez parents/enfants en attente et exécutions créées par les producteurs restants. Un endpoint sain, une première page vide ou des métriques indisponibles ne prouvent pas l’absence de travail ouvert. Confirmez qu’aucun appelant, callback ou worker ne dépend encore de la source et que les archives requises sont lisibles.

Retirez alors seulement les ressources autohébergées ou déprovisionnez le runtime Cloud. Les frais de capacité Cloud continuent tant qu’il reste provisionné, y compris au repos ou pendant le drainage. Le déprovisionnement supprime les données actives et les identifiants et n’est pas une pause avec reprise. Utilisez les conditions renvoyées par le plan existant ; cette procédure ne crée ni remboursement automatique ni exception de facturation.

## Revenir sur le routage sans déplacer les exécutions {#rollback}

Renvoyez les démarrages futurs uniquement vers une source saine et compatible. Les exécutions déjà acceptées par la destination y restent et ont besoin de ses workers et du routage de leurs commandes jusqu’à leur état terminal. Conservez les deux registres de propriété et évitez les démarrages en double. Ne restaurez pas un ancien stockage sur un état accepté plus récent et ne réactivez pas une seconde copie de l’exécution.
