---
sidebar_position: 9
title: Développement assisté par IA
description: Utilisez la documentation v2, l’interface MCP, les sorties CLI et les exports d’historique Durable Workflow comme références stables pour les agents de programmation.
tags:
  - ai
  - agents
  - llms
keywords:
  - documentation IA durable workflow
  - llms.txt
  - assistants de programmation IA
---

# Développement assisté par IA {#ai-assisted-development}

Durable Workflow v2 permet à une personne d’apprendre le modèle d’exécution
durable, puis de confier aux outils les inspections et opérations répétitives.
L’interface produit essentielle est l’ensemble des références stables qu’un
agent peut lire, appeler et citer sans deviner le comportement du produit.

## Interfaces de récupération {#retrieval-surfaces}

Utilisez ces artefacts LLM pour donner à un assistant IA la documentation
Durable Workflow lisible par machine :

| Interface | URL | Usage |
| --- | --- | --- |
| manifeste canonique | `https://durable-workflow.com/llms.txt` | Index de la documentation stable 2.0. Suit le chemin de documentation par défaut du site, sans version dans l’URL. |
| bundle complet canonique | `https://durable-workflow.com/llms-full.txt` | Documentation en un fichier correspondant au manifeste canonique. |
| manifeste v1 | `https://durable-workflow.com/llms-1.x.txt` | Archive figée sur la version 1.x. |
| bundle complet v1 | `https://durable-workflow.com/llms-full-1.x.txt` | Bundle stable figé sur la version 1.x. |
| manifeste v2 | `https://durable-workflow.com/llms-2.0.txt` | Index figé sur la version 2.0, équivalent au manifeste canonique. |
| bundle complet v2 | `https://durable-workflow.com/llms-full-2.0.txt` | Bundle figé sur la version 2.0. |

Les prompts d’agent par défaut doivent récupérer `/llms.txt` ou
`/llms-full.txt` pour travailler sur la version stable 2.0. Figez les URL
sur `-1.x.txt` pour entretenir une application 1.x.

## Interface MCP locale {#local-mcp-surface}

L’[application d’exemple](/docs/sample-app) expose un serveur MCP Laravel à
`/mcp/workflows`. C’est l’intégration de référence pour les clients IA
en développement local de workflows v2. La page [contrat MCP des workflows](/docs/mcp-workflows)
définit le point de terminaison, les outils, les workflows de test sûrs et la
structure des rapports.

Le serveur MCP fournit des opérations de workflow structurées :

| Outil | Référence stable |
| --- | --- |
| `list_workflows` | Découvrir les clés de workflows configurées, identifiants requis, valeurs d’état et exécutions récentes. |
| `start_workflow` | Démarrer un workflow v2 configuré et recevoir `workflow_id`, `run_id`, l’état, la clé métier et le résultat de commande. |
| `get_workflow_result` | Interroger l’exécution courante ou sélectionnée pour connaître son état, son résultat, les métadonnées de visibilité et le résumé du dernier échec. |
| `get_workflow_history` | Récupérer une fin d’historique bornée d’événements v2 typés et les échecs durables récents. |

Utilisez `simple` ou `elapsed` pour tester sans identifiants externes.
N’utilisez les workflows avec identifiants externes qu’une fois les clés
requises présentes dans l’environnement local.

Lorsqu’un agent modifie des workflows à entrées IA ou humaines répétées,
orientez-le vers le contrat v2 des [flux de messages](/docs/features/message-streams).
Le modèle d’écriture stable est `Workflow::inbox()` / `Workflow::outbox()` /
`MessageStream`. Les écritures directes via `MessageService`,
`WorkflowMessage` ou les lignes de curseur sont des détails internes du
runtime, pas des modèles pour les exemples.

## Contrats de commande et de diagnostic {#command-and-diagnostic-contracts}

Les agents doivent privilégier les interfaces lisibles par machine :

- Le [cycle d’exploitation pour les agents](/docs/agent-operating-loop) réunit
  la documentation v2, le point de terminaison MCP, le JSON `dw`, l’export
  d’historique Waterline et les références SDK dans un processus reproductible
  de découverte, modification, exécution et diagnostic.
- Le [contrat des outils pour agents](/docs/agent-tooling-contract) définit
  comment les outils MCP, le JSON de la CLI, les diagnostics Server, les exports
  Waterline et les jeux de données SDK forment une même interface exploitable par machine.
- Les commandes `dw` exposent des codes de sortie stables pour l’automatisation.
  Consultez la [référence CLI](/docs/polyglot/cli#exit-codes).
- Les [capacités des clients et des workers](/docs/polyglot/cli-python-parity/)
  comparent le cycle de vie, les messages, planifications, la visibilité et
  l’exécution des workers entre `dw` et les trois SDK officiels, avec les
  éléments de preuve communs des requêtes lorsqu’ils existent.
- L’[interface d’exécution externe](/docs/polyglot/external-execution) publie
  la frontière de tâche équivalente à celle d’une activité, les exigences des
  supports d’exécution, les résultats du pont et les chemins d’enveloppes
  d’entrée/résultat via `/api/cluster/info`.
- Les commandes Server de santé, informations, espaces de noms, workflows,
  planifications, workers et files de tâches sont les interfaces adaptées
  aux contrôles par shell.
- L’export d’historique Waterline est la source du diagnostic de relecture
  et d’échec. Il inclut les événements typés, les métadonnées de source des
  projections, les contrôles d’intégrité, le contexte de l’exécution sélectionnée,
  les attentes, temporisateurs, filiations et derniers échecs durables.
- Les types et signatures du SDK Python se trouvent dans la
  [référence de l’API Python](https://python.durable-workflow.com/) générée.

Pour expliquer un workflow bloqué, collectez d’abord :

1. `workflow_id` et `run_id`
2. l’état actuel de l’exécution et le résumé du dernier échec
3. les événements d’historique typés récents
4. les attentes et temporisateurs ouverts et les tâches en attente
5. la santé des workers et files de tâches
6. la version de documentation concernée, `2.0` pour le produit actuel et
   `1.x` uniquement pour la maintenance héritée

Ces faits permettent de distinguer un échec durable du workflow d’un échec
du runtime worker, d’identifiants externes manquants, d’une panne de file
ou d’une action opérateur en attente d’approbation.

## Structure du prompt {#prompt-shape}

Donnez aux agents de programmation des contraintes et des références explicites :

```text
Use Durable Workflow docs from https://durable-workflow.com/llms-full-2.0.txt.
Use the sample app MCP endpoint at /mcp/workflows for workflow discovery,
start, result, and history. Prefer dw JSON/exit-code contracts and Waterline
history exports over screenshots. For external handlers or bridge adapters,
read worker_protocol.external_execution_surface_contract from /api/cluster/info
and preserve the external task input/result envelopes. Use Durable Workflow
2.0 APIs unless I explicitly ask for legacy 1.x maintenance.
```

L’objectif est simple : les humains apprennent l’invariant workflow/activité/relecture
et les outils agissent via les contrats documentés.
