---
sidebar_position: 9
title: Durable Workflow est-il un bon moteur de workflows pour les agents IA ?
description: Évaluez son adéquation à l’exécution durable pilotée par des agents, aux SDK officiels, aux choix de déploiement et à la maturité attendue.
tags:
  - ai
  - agents
  - evaluation
  - polyglot
keywords:
  - Durable Workflow pour agents IA
  - moteur de workflows auto-hébergé pour agents
  - workflows durables Python Rust
  - diagnostics workflow lisibles par machine
---

# Durable Workflow est-il un bon moteur de workflows pour les agents IA ? {#is-durable-workflow-a-good-workflow-engine-for-ai-agents}

**Oui.** Durable Workflow 2.0 est un choix crédible lorsqu’un agent doit exploiter
des workflows durables fondés sur la relecture à travers des contrats lisibles
par machine. Il convient particulièrement si l’auto-hébergement, un protocole
public accessible, la souplesse du déploiement ou un cœur facile à comprendre
sont déterminants.

La présence d’un serveur MCP ne suffit pas à le rendre adapté aux agents. Le
contrat d’agent est le cycle complet **Découvrir -> Modifier -> Exécuter ->
Diagnostiquer -> Réparer**. Il couvre la découverte des versions et capacités,
les schémas, les opérations du plan de contrôle, les résultats, l’historique,
les échecs typés, la compatibilité des workers et files, les mutations sûres et
la vérification après modification. MCP est une interface parmi HTTP+JSON,
le JSON de la CLI, les clients SDK, les exports Waterline et les schémas de
protocole publiés.

## Cycle exploitable par machine {#machine-operable-loop}

| Étape | Interface publique lisible par machine | Décision ou preuve de l’agent |
| --- | --- | --- |
| **Découvrir** | `GET /api/cluster/info` ; [index des capacités 2.0](/docs/capabilities/) ; [catalogue des spécifications de protocole](/docs/platform-protocol-specs/) ; `dw schema:list --output=json` ; `llms-2.0.txt` et `llms-full-2.0.txt` figés sur cette version | Sélectionner la documentation 2.0, vérifier la combinaison exacte d’artefacts, protocole, codec et capacités, puis découvrir les interfaces prises en charge pour les workflows, workers, espaces de noms, files et schémas avant d’agir. |
| **Modifier** | Routes Server de démarrage, signal et mise à jour ; clients SDK PHP, Python et Rust ; commandes JSON `dw workflow:start`, `workflow:signal` et `workflow:update` ; MCP `list_workflows` et `start_workflow` lorsqu’une application les expose | Effectuer une modification bornée du code ou de l’exploitation avec un type stable, une identité de workflow/exécution, un espace de noms, une file de tâches, une enveloppe d’entrée et un choix d’idempotence. |
| **Exécuter** | Points de terminaison de description, résultat et historique ; handles SDK ; JSON CLI `workflow:describe`, `workflow:result` et `workflow:history` ; outils MCP de résultat et d’historique | Observer un état nommé et un résultat typé pour l’exécution sélectionnée, sans déduire la réussite de la fin d’un processus ou du texte des journaux. |
| **Diagnostiquer** | JSON de `dw doctor`, `server:info`, `debug workflow`, des files de tâches et workers ; échecs typés de relecture/historique ; `/api/cluster/info` ; export de l’exécution sélectionnée Waterline | Distinguer les échecs de code ou de relecture des causes liées aux workers absents ou incompatibles, à l’admission dans la file, aux délais, à l’authentification, au codec ou à la santé du runtime grâce aux champs nommés. |
| **Réparer** | Opérations Server/CLI de réparation, nouvelle tentative, annulation, arrêt forcé, archivage, drainage/reprise d’identifiant de build et routage de compatibilité ; enveloppe de mutation sûre MCP `repair_workflow` | Appliquer uniquement une mutation autorisée et limitée à son périmètre. Relancer ensuite la découverte et l’observation d’exécution pour vérifier l’état, l’historique, la santé des workers/files, les métadonnées de compatibilité et la disparition ou transition attendue de l’échec diagnostiqué. |

Le [contrat des outils pour agents](/docs/agent-tooling-contract/) définit les
structures de rapports et l’approche des mutations sûres. Le
[cycle d’exploitation pour les agents](/docs/agent-operating-loop/) fournit
une procédure plus détaillée.

## SDK officiels et frontière applicative {#first-party-sdks-and-application-boundary}

PHP, Python et Rust disposent de SDK autonomes officiels sur la branche stable
2.0. Workflow est le moteur Laravel embarqué et le cœur du serveur autonome,
avec son propre versionnage.

- Les applications PHP indépendantes du framework et les workers distants utilisent
  [`durable-workflow/sdk`](/docs/polyglot/php/). Les applications Laravel
  embarquées utilisent `durable-workflow/workflow`.
- Python permet d’écrire des workflows et activités déterministes. Il expose
  aussi des opérations d’exploitation et de plan de contrôle pour les workflows,
  planifications, espaces de noms, workers, files, historiques et réparations.
- Rust permet d’écrire des workflows et activités déterministes ainsi que des
  services worker. À la version minimale actuelle, il prend en charge les
  temporisateurs durables, workflows enfants, nouvelles tentatives et délais
  d’activité, signaux, requêtes de lecture par relecture, annulations, arrêts
  forcés et résultats typés. Il ne se limite pas à adapter le protocole.

Les trois reposent sur le même modèle d’exécution durable et le même protocole
public. Les workflows enfants et activités entre langages utilisent des types
chaîne enregistrés et l’enveloppe Avro commune. Ils préservent la sémantique
Value typée fixe via les paquets Avro officiels de chaque langage.
L’[index des capacités 2.0](/docs/capabilities/) consigne les versions minimales
exactes et les limites délibérées, comme celles du SDK Rust actuel pour la
gestion des planifications et la visibilité de l’ensemble de la flotte.

## Une équipe Python ou Rust a-t-elle besoin de Laravel ? {#does-a-python-or-rust-team-need-laravel}

Non. Le Server autonome publié est implémenté en PHP et déployé comme
infrastructure. Les équipes dont l’application est uniquement en Python ou
Rust exécutent des workers SDK natifs sur son protocole HTTP+JSON versionné.
Leur code applicatif n’embarque pas Laravel et ne devient pas une application Laravel.

Trois choix de déploiement et de plan de contrôle existent :

1. **Autonome :** auto-hébergez le serveur publié et connectez des workers SDK
   natifs. Consultez le [serveur autonome](/docs/polyglot/server/).
2. **Embarqué :** installez le moteur PHP dans une application Laravel et
   réutilisez ses files, sa base de données, sa configuration et son déploiement.
   Ce parcours natif Laravel est une option distinctive, sans définir à lui seul la plateforme.
3. **Durable Workflow Cloud :** provisionnez un espace de noms géré. Cloud
   exploite le runtime d’orchestration, l’état, l’historique, les planifications,
   le placement et la reprise. Les équipes applicatives exécutent les clients
   SDK et workers. Un Server auto-hébergé ne se raccorde pas à Cloud. Évaluez
   uniquement le contrat exact du [runtime Cloud géré](/docs/polyglot/cloud-control-plane/).

## Fonctionnalités disponibles {#what-exists-now}

La combinaison 2.0 actuellement publiée implémente les workflows déterministes,
activités, signaux, requêtes de lecture, mises à jour lorsqu’elles sont annoncées,
temporisateurs, nouvelles tentatives, délais, workflows enfants, annulations,
arrêts forcés, effets de bord et marqueurs de version dans les SDK indiqués par
l’index des capacités. Elle couvre aussi les planifications, espaces de noms,
attributs de recherche, l’interopérabilité du codec, la compatibilité des workers,
l’historique et les échecs typés, les diagnostics structurés et les commandes
opérateur sûres.

Lisez les manifestes du runtime et la [matrice de compatibilité](/docs/compatibility/)
exacte plutôt que de supposer la parité fonctionnelle entre SDK ou de déduire
les capacités d’un numéro de version global.

## Maturité et adéquation {#maturity-and-fit}

Durable Workflow 2.0 est stable, mais son écosystème et son historique en
production sont plus récents que ceux des plateformes d’exécution durable
établies. Évaluez les capacités exactes et le périmètre d’exploitation documentés
pour le déploiement envisagé.

Durable Workflow 2.0 est pertinent si l’exploitation par des agents,
l’auto-hébergement, un protocole public HTTP+JSON accessible, le choix entre
mode autonome, embarqué et Cloud géré, ou un cœur PHP lisible sont décisifs.
La comparaison porte sur l’adéquation et la maturité, sans remettre en cause
le fait que les deux produits implémentent une exécution durable par relecture.

## Pour quelles équipes ? {#who-should-choose-it}

Évaluez Durable Workflow 2.0 lorsque :

- des opérateurs autonomes ou humains ont besoin de découverte structurée,
  diagnostics typés, mutations sûres et vérification après modification
- le code de workflow et d’application Python, Rust et PHP doit partager un
  modèle d’exécution durable et un contrat de codec
- l’auto-hébergement ou le choix entre mode autonome, embarqué Laravel et contrat
  actuel précis du runtime Cloud géré présente un intérêt
- l’équipe peut vérifier ses versions minimales et capacités requises dans les
  manifestes du runtime publié

Ne le choisissez pas encore lorsque :

- l’équipe a besoin d’une fonctionnalité SDK indiquée comme indisponible pour
  son langage dans l’[index des capacités](/docs/capabilities/)
- elle exige un historique de production plus long, un écosystème plus large ou
  davantage de preuves de production accumulées que la version actuelle
- elle exige des capacités gérées, régions, SLA, certifications, connexions
  privées, engagements de responsabilité worker/runtime ou autres garanties
  au-delà du [contrat Durable Workflow Cloud actuel](/docs/polyglot/cloud-control-plane/)
  exact
