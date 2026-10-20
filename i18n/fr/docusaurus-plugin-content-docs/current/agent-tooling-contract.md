---
sidebar_position: 9.3
title: Contrat des outils pour agents
description: Réunissez les outils MCP, le JSON de la CLI, les diagnostics Server, les exports Waterline et les jeux de données SDK dans un même contrat v2 exploitable par machine.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - outils agent durable workflow
  - contrat des outils IA
  - diagnostics workflow mcp
  - opérations workflow lisibles par machine
---

# Contrat des outils pour agents {#agent-tooling-contract}

Durable Workflow v2 rend le développement assisté par IA prévisible en exposant
les faits du produit à travers des contrats stables. Un outil ne doit pas
déduire l’état d’un workflow du HTML, analyser les journaux comme source de
vérité ni deviner quel comportement SDK correspond à une commande CLI.
Il doit lire la version de documentation, découvrir les interfaces locales,
appeler les opérations documentées et rapporter des faits nommés.

Cette page définit la structure du contrat que les futurs outils MCP, agents
locaux, scripts et SDK doivent préserver.

## Couches du contrat {#contract-layers}

| Couche | Référence stable | Attente du contrat |
| --- | --- | --- |
| Récupération de documentation | Les fichiers canoniques `llms.txt` et `llms-full.txt` suivent la documentation stable 2.0. `llms-2.0.txt` et `llms-full-2.0.txt` sont des alias figés sur la même branche de version. | Utilisez les URL canoniques pour les travaux produit 2.0. Figez sur `-1.x.txt` si l’URL doit nommer la branche archivée 1.x, ou sur `-2.0.txt` si le consommateur exige une URL de version majeure explicite. |
| Découverte locale | `/mcp/workflows` `list_workflows` | La liste d’autorisation MCP gérée par l’application nomme les clés de workflows exposées, les identifiants requis, les arguments attendus et leur aptitude aux tests de bon fonctionnement. |
| Opérations de workflow | MCP `start_workflow`, `get_workflow_result`, `get_workflow_history`, `diagnose_workflow`, `repair_workflow` ; commandes JSON `dw` ; clients SDK | Chaque client rapporte les identifiants de workflow et d’exécution, l’espace de noms, la file de tâches, l’état de commande, la classification de cause racine, la remédiation et les champs d’échec nommés sans analyser une interface graphique. |
| Diagnostics Server | `/api/cluster/info`, `dw server:info --output=json`, `dw doctor --output=json`, `dw debug workflow --output=json` | Les faits sur la compatibilité, le protocole, les files de tâches, les workers et les exécutions bloquées sont lisibles par machine et bornés. |
| Éléments de preuve durables | Détails de l’exécution sélectionnée et export d’historique Waterline | La relecture, les attentes, temporisateurs, filiations, sources des projections, contrôles d’intégrité, échecs durables et possibilités d’action opérateur proviennent d’un état typé. |
| Parité entre langages | Jeux de requêtes CLI/Python et tests SDK | Les opérations communes du plan de contrôle conservent la même structure de requête entre langages. |

Chaque couche doit être utilisable seule. Ensemble, elles donnent à un agent
assez de contexte pour effectuer une petite modification, la démontrer et
expliquer son résultat.

## Conception des outils MCP {#mcp-tool-design}

Les nouveaux outils MCP doivent exposer directement les concepts Durable Workflow :

- Utilisez les noms du produit, comme workflow, exécution, file de tâches,
  planification, historique, échec, worker, espace de noms et compatibilité.
- Retournez des identifiants stables et des champs d’état nommés plutôt que
  des résumés uniquement rédigés en prose.
- Retournez les objets `root_cause`, `remediation` et `next_actions` dans
  les outils de diagnostic pour que les agents choisissent la prochaine
  commande sans analyser du langage naturel.
- Bornez les tableaux et aperçus d’historique, d’échecs et de données utiles
  pour permettre l’inspection sans télécharger une trace illimitée.
- Séparez découverte et mutation. Un client doit pouvoir demander ce qui
  existe et quels identifiants sont requis avant de démarrer ou commander un workflow.
- Gardez les mutations explicites et structurées. Pour les workflows d’exemple
  locaux, `repair_workflow` est la mutation de réparation dédiée. Elle retourne
  une enveloppe `durable-workflow.v2.safe-mutation`, même si la réparation est
  refusée ou inutile.
- Signalez explicitement les workflows de test sans identifiants externes afin
  que les agents testent le câblage local sans toucher aux services externes.
- N’incluez jamais de valeurs secrètes, de noms d’hôte propres aux clients ni
  d’identifiants de compte dans les descriptions d’outils ou métadonnées de résultat.

Le point de terminaison `/mcp/workflows` de l’application d’exemple est
l’interface locale de référence. Les futurs serveurs MCP propres à un projet
doivent suivre la même approche : la configuration possède la liste
d’autorisation, les outils n’agissent que sur les workflows listés et les
résultats citent des faits durables qu’un humain peut reproduire via `dw`,
Waterline ou un SDK.

## Parité des commandes et des SDK {#command-and-sdk-parity}

L’automatisation doit pouvoir passer d’un client à un autre sans dérive sémantique :

| Famille d’opérations | Preuve de parité requise |
| --- | --- |
| start, signal, update, query, repair, cancel, terminate, archive | Les corps de requête CLI et SDK correspondent à la structure documentée du plan de contrôle. |
| history, describe, list, result | Les réponses conservent les identifiants stables, noms d’état, horodatages et champs d’échec. |
| files de tâches et workers | La capacité, les baux, emplacements, compatibilités et identifiants de worker restent des faits structurés. |
| exécution externe | Les enveloppes d’entrée et de résultat restent indépendantes du langage et portent des résultats de pont nommés. |

Lors de l’ajout d’une commande CLI, d’une méthode SDK ou d’un outil MCP pour
une action du plan de contrôle, préférez un jeu de données commun ou un exemple
JSON documenté qu’un autre client peut vérifier. Des tableaux lisibles par
l’humain peuvent exister, mais le contrat d’automatisation est JSON ou JSONL.

## Structure du rapport de diagnostic {#diagnosis-report-shape}

Lorsqu’un outil explique une exécution échouée ou bloquée, son rapport doit inclure :

- version de documentation et page source utilisées
- commande, méthode SDK ou outil MCP appelé
- identifiants de workflow et d’exécution, espace de noms et file de tâches
- état courant et résumé du dernier échec durable
- noms récents d’événements d’historique typés
- attentes, temporisateurs, tâches ou baux d’activité externe en cours
- compatibilité des workers et files de tâches si elle est disponible
- code de sortie nommé, état HTTP, erreur de validation ou motif de blocage
- `root_cause.category` et `remediation.classification` lisibles par machine
- autorisation, application, refus ou absence de nécessité d’une mutation de réparation sûre

Cette structure rend les rapports portables entre applications Laravel locales,
serveurs autonomes, workers Python et futurs SDK.

## Cause racine et remédiation {#root-cause-and-remediation}

L’identifiant du schéma de cause racine pris en charge est
`durable-workflow.v2.agent-root-cause`. Les outils de diagnostic doivent inclure :

- `category`, comme `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` ou `none`
- `source.kind` et `source.id`
- `retryable`, `severity` et `actionable`

L’identifiant du schéma de remédiation pris en charge est
`durable-workflow.v2.agent-remediation`. Il contient
`classification`, `summary`, `automatic_repair.tool`,
`automatic_repair.allowed` et `next_actions`. `repair_workflow` est
l’interface locale MCP de réparation prise en charge. Si MCP est indisponible,
utilisez le contrat JSON documenté de la CLI `dw` et les routes HTTP du plan
de contrôle Server :

```bash
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
dw workflow:repair <workflow-id> --output=json
dw system:repair-status --output=json
dw system:repair-pass --output=json
```

Ces commandes constituent le contrat pris en charge hors MCP pour l’inspection,
les mutations sûres, les diagnostics et l’automatisation des réparations.

## Garde-fous pour les agents {#guardrails-for-agents}

Autorisez les agents à automatiser les formalités en respectant le modèle durable :

- Gardez l’orchestration des workflows déterministe.
- Placez les entrées-sorties, le hasard, les appels d’API externes et les
  identifiants dans les activités ou gestionnaires externes.
- Utilisez les signaux, mises à jour, requêtes de lecture, planifications,
  temporisateurs et flux de messages plutôt que des tables d’état ad hoc
  pour piloter les workflows.
- Traitez l’export d’historique Waterline comme une preuve, pas comme une API de mutation.
- Traitez les listes de routes, détails de base de données et lignes de modèles
  propres au framework comme des détails d’implémentation, sauf si la
  documentation publique les nomme explicitement.

L’invariant reste lisible par l’humain : les workflows enregistrent les décisions
durables, les activités accomplissent le travail susceptible d’échouer et la
relecture doit pouvoir expliquer ce qui s’est passé. Le contrat des outils
donne aux agents des références stables pour le reste.

## Pages associées {#related-pages}

- [Développement assisté par IA](./ai-assisted-development.md)
- [Cycle d’exploitation pour les agents](./agent-operating-loop.md)
- [Contrat MCP des workflows](./mcp-workflows.md)
- [Capacités des clients et des workers](./polyglot/cli-python-parity.md)
- [Référence de l’API HTTP Server](./polyglot/server-api-reference.md)
- [Supervision](./monitoring.md)
