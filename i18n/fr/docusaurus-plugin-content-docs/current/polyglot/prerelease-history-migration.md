---
title: Migrer l’historique conservé des préversions
sidebar_label: Migration de l’historique des préversions
---

# Migrer l’historique conservé des préversions {#migrate-retained-prerelease-history}

Utilisez cette procédure hors ligne lorsqu’un déploiement Durable Workflow 2.0
limité à Avro signale `unsupported_payload_codec` pour un état conservé depuis
une ancienne préversion publique 2.0. Elle convertit les représentations connues
marquées JSON, sans étiquette et Avro Value obsolètes sans rendre un ancien
codec disponible dans une application v2 en cours d’exécution.

Ne remplacez pas cette procédure par un export d’historique. Un export est
une copie portable d’une exécution. Il ne modifie pas les lignes de base
inspectées au démarrage du déploiement. Ne supprimez jamais l’historique pour
faire passer le contrôle préalable.

## Déterminer les données à convertir {#decide-what-must-be-converted}

Les exécutions encore actives peuvent se terminer sur la préversion actuellement
déployée. Drainez-les avant la fenêtre de maintenance si l’exploitation le
permet sans danger. Les exécutions terminales, celles clôturées conservées pour
la relecture et les états qui ne peuvent pas être drainés doivent être convertis.
La migration inventorie les deux groupes sans supprimer aucun des deux.

La simulation couvre les interfaces appartenant au protocole contrôlées
au démarrage de Server :

- entrées et sorties de workflows, données d’activité, commandes, signaux,
  mises à jour, appels de service, tâches de validation de mise à jour et
  références de flux durables
- trames single-object en ligne et enveloppes explicites de données utiles
  imbriquées dans les événements d’historique
- références externes, y compris structure, codec, disponibilité de l’objet,
  longueur en octets et intégrité SHA-256

Les tables de mémo, attributs de recherche, contexte et diagnostic appartenant
aux clients ne sont pas des déclarations de codec et restent inchangées.
Les codecs et empreintes de schéma inconnus, références corrompues et valeurs
non représentables par le schéma Avro Value fixe sont signalés comme dangereux.
Toute détection de ce type bloque l’application des modifications.

## Frontière de responsabilité {#ownership-boundary}

La commande appartient au paquet PHP Workflow, mais doit s’exécuter dans le
processus qui possède la connexion à la base et la configuration des données
utiles externes :

- **Laravel embarqué :** installez le paquet Workflow cible dans le checkout
  de l’application, puis exécutez sa commande `php artisan` en arrêtant
  les processus web, de file, d’ordonnancement et de maintenance.
- **Server autonome :** utilisez un shell ou job ponctuel de l’image Server
  cible, avec la même base, la même configuration d’espace de noms, les mêmes
  identifiants et montages de données externes que le déploiement. Gardez le
  hook d’amorçage normal et tous les processus Server arrêtés jusqu’à la
  réussite de la conversion.

Ne faites pas pointer une application sans rapport sur la base. La politique
de stockage de l’espace de noms fait partie du contrôle d’intégrité.
Un processus incapable de lire un objet externe le signale comme dangereux
au lieu de deviner sa valeur.

## Ordre de déploiement {#deployment-order}

1. Gardez l’ancienne préversion disponible assez longtemps pour terminer les
   exécutions actives choisies. Arrêtez ensuite tous les processus écrivant
   dans la base : nœuds API, workers, ordonnanceurs, jobs d’amorçage et de maintenance.
2. Prenez les instantanés de la base et du stockage objet externe exigés par
   votre politique normale de reprise. Conservez l’ancien artefact applicatif
   ou Server.
3. Installez ou récupérez l’artefact cible contenant
   `workflow:v2:migrate-prerelease-history`, sans le démarrer.
   Lancez l’inventaire de simulation depuis cet artefact :

   ```bash
   php artisan workflow:v2:migrate-prerelease-history --dry-run --json
   ```

   Un code de sortie nul signifie que toutes les valeurs concernées peuvent
   être converties sans danger. Vérifiez les chemins et identifiants
   d’exécution concernés. Un code non nul avec `unsafe_fields` supérieur
   à zéro bloque la mise à niveau. Corrigez l’accès au stockage ou restez
   sur l’ancienne préversion.
4. Choisissez un nouveau chemin privé de sauvegarde et un nouveau répertoire
   privé de preuves sur stockage persistant. Aucun des deux ne doit déjà
   exister. Appliquez la conversion une fois :

   ```bash
   php artisan workflow:v2:migrate-prerelease-history \
     --backup=/secure/dw-prerelease-history-backup.json \
     --evidence-dir=/secure/dw-prerelease-history-evidence
   ```

   La commande écrit la sauvegarde avant les mises à jour et refuse d’écraser
   les preuves. Elle verrouille et met à jour les lignes dans une seule
   transaction, préserve les identités de workflow et d’exécution, vérifie
   les empreintes et tailles des objets externes et conserve tous les objets
   d’origine. Les objets externes de remplacement sont des copies Avro
   adressées par leur contenu. Aucun historique n’est supprimé.
5. Attendez la fin de la commande. Elle exporte et relit strictement chaque
   exécution conservée concernée, reconstruit ses projections de résumé,
   attente, chronologie, temporisateurs et filiation, vérifie leur dérive
   et répète l’inventaire des données utiles. Les trois contrôles doivent
   réussir. Conservez les rapports de relecture et de projection avec la sauvegarde.
6. Ne lancez l’amorçage normal de la cible qu’après la réussite de la migration :

   ```bash
   php artisan server:bootstrap --force
   ```

   Pour Laravel embarqué, utilisez plutôt la procédure normale de migration
   et d’amorçage de l’application. Le contrôle préalable limité à Avro doit
   réussir avant le démarrage de tout nouveau worker, nœud API, ordonnanceur
   ou processus de maintenance.
7. Démarrez le déploiement cible et vérifiez sa disponibilité, puis une
   relecture ou requête de lecture sur une exécution conservée via l’interface
   opérateur normale. Conservez le dossier de migration pendant toute la
   fenêtre de retour arrière.

## Retour arrière {#rollback}

Si l’application, la relecture, la vérification des projections ou le contrôle
final échoue, la mise à niveau est bloquée. Gardez tous les processus
d’écriture arrêtés et exécutez la commande de retour arrière affichée par
la migration. Avec les chemins ci-dessus :

```bash
php artisan workflow:v2:migrate-prerelease-history \
  --rollback-from=/secure/dw-prerelease-history-backup.json \
  --evidence-dir=/secure/dw-prerelease-history-evidence
```

Le retour arrière vérifie l’empreinte de la sauvegarde et l’état de migration.
Il refuse d’écraser les preuves de retour arrière ou de restaurer une ligne
modifiée après conversion. Il restaure les valeurs d’origine en base de façon
atomique et conserve les objets externes de remplacement comme preuves.
Restaurez ensuite l’ancien artefact applicatif ou Server. Si le retour arrière
refuse parce qu’un autre processus a modifié l’état, gardez la mise à niveau
bloquée et restaurez les instantanés coordonnés de la base et du stockage objet
pris à l’étape 2.

Après le retour arrière, le contrôle préalable du déploiement limité à Avro
doit de nouveau échouer. Résolvez l’état dangereux signalé, créez de nouveaux
chemins de sauvegarde et de preuves, puis répétez toute la procédure avant
de réessayer la mise à niveau.
