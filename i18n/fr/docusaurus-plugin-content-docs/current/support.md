---
sidebar_position: 15
---

# Assistance {#support}

Durable Workflow est un projet open source utilisable gratuitement sous licence MIT. Aucun accord commercial n'est nécessaire pour l'exécuter, le distribuer ou l'utiliser dans des systèmes de production.

## Assistance communautaire {#community-support}

La communauté est le principal moyen d'obtenir de l'aide sur Durable Workflow. Elle convient aux questions publiques, aux discussions de conception, aux rapports de bogues et au partage de pratiques d'exploitation.

C'est le bon endroit pour :

- Poser des questions d'utilisation
- Demander des conseils de modélisation des workflows
- Comprendre le déterminisme et la relecture
- Partager des idées et des modèles
- Signaler des bogues ou des comportements inattendus

### GitHub Discussions {#github-discussions}

GitHub Discussions est l'endroit privilégié pour les questions détaillées, les discussions de conception et les problèmes qui peuvent être utiles à d'autres personnes.

https://github.com/durable-workflow/workflow/discussions

### Discord {#discord}

Discord convient aux :

- Questions rapides
- Discussions informelles
- Premiers retours
- Collaborations communautaires

https://discord.gg/xu5aDDpqVy

L'assistance communautaire est fournie dans la mesure des disponibilités. Elle suffit souvent pour le développement, l'expérimentation et de nombreux usages en production.

## Périmètre de l'assistance au déploiement {#deployment-support-boundary}

Durable Workflow est conçu pour être utile sans entretien commercial. La distribution publique est volontairement optimisée pour les déploiements dont la plupart des équipes ont besoin en premier :

- **Développement local et environnements internes hors production**  
  Exécutez le paquet ou le serveur autonome en local, sur un réseau local ou dans un environnement de préproduction partagé pour que les développeurs puissent tester des workflows et itérer rapidement.

- **Production sur un seul nœud**  
  Exécutez le serveur autonome sur une VM, un VPS ou un hôte interne, avec une base de données durable, un cache, un proxy inverse, des sauvegardes et des identifiants limités par rôle.

- **Petits clusters**  
  Exécutez 2 à 3 conteneurs API sans état derrière un répartiteur de charge, avec MySQL ou PostgreSQL externe partagé, Redis partagé, des workers dimensionnés indépendamment et exactement un ordonnanceur ou processus de maintenance.

- **Manifestes Kubernetes**  
  Utilisez les manifestes fournis si votre équipe exploite déjà Kubernetes et souhaite un point de départ natif Kubernetes.

Durable Workflow Cloud est un
[service d'orchestration géré](/docs/polyglot/cloud-control-plane) distinct. Cloud
exploite son runtime, sa persistance, son placement dans une seule région et sa
reprise. Les clients exécutent les clients SDK et les workers. Ils ne raccordent
pas de Server auto-hébergé à Cloud. La réplication multirégion, le basculement
régional et le retour à la région initiale ne font pas partie du contrat Cloud actuel.

La distribution publique est volontairement optimisée pour le développement local,
la production sur un nœud et le contrat limité de petit cluster décrit dans le
guide d'auto-hébergement. Les manifestes Kubernetes s'adressent aux équipes qui
exploitent déjà Kubernetes. Le contrat de petit cluster prend en charge les
[mises à niveau progressives](/docs/rolling-upgrades) si toutes les garanties de
cette page sont respectées. Le mode multirégion actif/passif avec basculement
régional piloté par l'opérateur reste une démarche d'évaluation accompagnée par
l'assistance. Consultez [Multirégion actif/passif](/docs/deployment#activepassive-multi-region)
dans le guide d'auto-hébergement. Le chart Helm publié permet une installation
et un déploiement en autonomie. Les modifications de chart, l'infrastructure du
fournisseur, les ordonnanceurs en double, le fonctionnement multinœud sans Redis,
le basculement du fournisseur, le multirégion actif/passif ou actif/actif, le
basculement régional automatique en auto-hébergement et les topologies avancées
de haute disponibilité restent accompagnés par l'assistance : ils nécessitent
des décisions propres à l'environnement sur le dimensionnement, la base de
données, le réseau, la sécurité et les mises à niveau.

Consultez le [guide de déploiement auto-hébergé](/docs/deployment) pour la matrice
de prise en charge, les recettes Compose utilisant les images publiées, le
périmètre des manifestes Kubernetes bruts, les contrôles de disponibilité et le
point où commence l'accompagnement.

Ce périmètre garde le parcours autonome simple tout en permettant une aide plus approfondie lorsque le déploiement devient lui-même un projet de systèmes distribués.

## Assistance commerciale facultative {#commercial-support-optional}

Une assistance commerciale et des prestations de conseil sont disponibles pour les équipes qui ont besoin de garanties supplémentaires ou de l'expertise du mainteneur.

L'utilisation de Durable Workflow ne nécessite **pas** d'accord commercial. Toutes les fonctionnalités restent entièrement open source, avec ou sans assistance commerciale.

L'assistance commerciale s'adresse aux équipes dont les systèmes de production exigent de la rigueur sur l'exactitude, la sécurité des mises à niveau, la topologie de déploiement et la sémantique des exécutions longues.

## Contenu de l'assistance commerciale {#what-commercial-support-covers}

Les prestations sont assurées par le mainteneur du projet et couvrent généralement :

- **Planification du déploiement en production**  
  Aide au choix entre un nœud, un petit cluster au périmètre limité, Kubernetes et les modèles accompagnés, notamment pour la base de données, le cache, le proxy inverse, l'ordonnanceur et les workers.

- **Dimensionnement, fiabilité et planification des mises à niveau**  
  Aide sur les hypothèses de capacité, les sauvegardes et restaurations, l'ordre d'initialisation et des migrations, la sécurité des déploiements et les procédures d'exploitation.

- **Topologies avancées**  
  Conception accompagnée pour les modifications de chart Helm, l'infrastructure Kubernetes propre à un fournisseur, les surcouches personnalisées, les ordonnanceurs en double, le mode multinœud sans Redis, la haute disponibilité, le multirégion actif/passif ou actif/actif, le basculement régional automatique en auto-hébergement et la réplication synchrone entre régions. Le chart publié reste un parcours d'installation autonome. Le [guide d'auto-hébergement](/docs/deployment#activepassive-multi-region) conserve l'architecture actif/passif et les procédures pour une évaluation accompagnée. Le [contrat du runtime Cloud géré](/docs/polyglot/cloud-control-plane) décrit séparément le placement dans une seule région, la reprise et le périmètre de connectivité du service hébergé.

- **Revue de sécurité**  
  Aide sur les identifiants limités par rôle, l'exposition réseau, les points de terminaison internes ou publics, la terminaison TLS et les limites d'accès des opérateurs et workers.

- **Revue d'architecture et de conception des workflows**  
  Conseils de modélisation, notamment sur les frontières des activités, les signaux, les boîtes d'entrée et de sortie et les exécutions longues.

- **Déterminisme et sécurité de la relecture**  
  Aide à identifier et éviter les comportements non déterministes, les problèmes de relecture et les défauts subtils susceptibles d'apparaître avec le temps.

- **Stratégie de mise à niveau et de versionnage**  
  Aide pour les mises à niveau sûres, le versionnage des workflows et le choix de modèles comme `continue-as-new`.

- **Diagnostic des comportements complexes**  
  Aide au diagnostic des workflows bloqués, des boucles inattendues, des problèmes de traitement des signaux et des comportements du runtime difficiles à analyser.

- **Correctifs et rétroportages**  
  Accès aux correctifs et rétroportages des versions prises en charge pour éviter l'entretien de forks privés.

- **Intégrations personnalisées sur accord**  
  Aide à l'intégration avec les plateformes de discussion, systèmes d'approbation, API internes ou outils d'observabilité existants.

## À qui s'adresse l'assistance commerciale {#who-commercial-support-is-for}

Elle convient généralement si vous :

- Exécutez Durable Workflow en **production**
- Déployez le serveur autonome pour **plusieurs équipes ou services**
- Construisez des **workflows longs ou avec intervention humaine**
- Concevez une **topologie en cluster, Kubernetes/Helm personnalisée ou propre à un fournisseur, multirégion actif/passif ou actif/actif, ou à basculement automatique auto-hébergé** au-delà du périmètre d'exploitation 2.0 éprouvé dans une seule région
- Travaillez dans un environnement où **l'exactitude et la sécurité des mises à niveau comptent**
- Recherchez **l'expertise du mainteneur**
- Souhaitez éviter les forks et les risques de maintenance à long terme

## Contact {#contact}

Pour discuter de l'assistance commerciale ou du conseil, contactez :

**support@durable-workflow.com**

Un bref premier échange permet de comprendre votre cas d'usage et de déterminer les prochaines étapes.
