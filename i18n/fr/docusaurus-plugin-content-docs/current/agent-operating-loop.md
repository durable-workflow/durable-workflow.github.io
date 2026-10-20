---
sidebar_position: 9.1
title: Cycle d’exploitation pour les agents
description: Donnez aux agents IA un processus v2 stable pour découvrir, modifier, exécuter, diagnostiquer et réparer des applications Durable Workflow.
tags:
  - ai
  - agents
  - mcp
  - operations
keywords:
  - cycle agent durable workflow
  - débogage workflow par IA
  - workflows mcp
  - export historique waterline
  - sortie json dw
---

# Cycle d’exploitation pour les agents {#agent-operating-loop}

Durable Workflow v2 est plus simple à utiliser par les agents lorsque chaque
étape possède une référence stable. Le cycle ci-dessous part du même invariant
qu’apprend un humain, puis passe à des contrats lisibles par machine pour la
découverte, l’exécution, le diagnostic et la réparation.

## 1. Utiliser la bonne version de documentation {#1-use-the-right-docs-line}

Pour travailler sur la version stable 2.0, utilisez le bundle canonique. Il
suit le même chemin de documentation par défaut, sans version dans l’URL,
que celui proposé aux lecteurs du site public :

```text
https://durable-workflow.com/llms-full.txt
```

Utilisez le bundle spécifique à la version 2.0 lorsque l’URL elle-même doit
indiquer la version majeure actuelle :

```text
https://durable-workflow.com/llms-full-2.0.txt
```

Utilisez l’URL explicitement figée sur 1.x lorsque l’URL elle-même doit
indiquer cette version majeure stable :

```text
https://durable-workflow.com/llms-full-1.x.txt
```

## 2. Découvrir les workflows locaux exposés {#2-discover-the-local-workflow-surface}

Commencez par le point de terminaison MCP de l’application d’exemple
lorsqu’il est disponible :

```text
/mcp/workflows
```

Le [contrat MCP des workflows](./mcp-workflows.md) définit les outils de
référence, les clés de workflows de test sûrs et la structure des rapports d’agent.

Appelez d’abord `list_workflows`. La réponse indique les workflows exposés,
les identifiants nécessaires, les arguments acceptés et les exécutions
récentes déjà présentes. Utilisez `simple` ou `elapsed` pour tester sans
identifiants externes avant d’utiliser les exemples qui nécessitent des clés d’API.

Si MCP n’est pas disponible, utilisez les contrats de la CLI et du serveur :

```bash
dw server:info --output=json
dw workflow:list --output=json
dw task-queue:list --output=json
```

Ces commandes fournissent les versions de protocole, le contexte d’espace
de noms, la visibilité des workflows et l’état de santé des files de tâches,
sans analyser une interface graphique.

## 3. Effectuer la plus petite modification {#3-make-the-smallest-change}

Lorsque vous modifiez le code du workflow, préservez la frontière durable :

- conservez les décisions d’orchestration dans les méthodes du workflow
- placez les entrées-sorties, le hasard, les appels réseau et les identifiants externes dans les activités
- utilisez les signaux, mises à jour, requêtes de lecture, temporisateurs et flux de messages plutôt que des tables ou tâches de file ad hoc
- traitez les entrées humaines ou IA répétées via le contrat des
  [flux de messages](./features/message-streams.md)

Cette frontière compte davantage que la syntaxe du langage. Les classes
PHP de workflow, `dw`, le SDK Python et les workers externes doivent tous
décrire les mêmes opérations du plan de contrôle.

Si aucune modification du code n’est nécessaire, l’étape « modifier » peut
être une décision d’exploitation explicite : sélectionner la clé du workflow
exposé, fournir une `business_key` stable, choisir
`duplicate_start_policy=return_existing_active` pour des tests idempotents,
ou envoyer l’entrée de signal ou de mise à jour documentée que recommande
`diagnose_workflow`.

## 4. Exécuter via des interfaces structurées {#4-run-through-structured-handles}

Utilisez l’interface la plus précise disponible pour la tâche :

| Tâche | Interface recommandée |
| --- | --- |
| Démarrer un workflow d’exemple local | `start_workflow` via `/mcp/workflows` |
| Réparer un workflow d’exemple local | `diagnose_workflow`, puis `repair_workflow` uniquement si la remédiation l’autorise |
| Démarrer ou commander un workflow sur le serveur | `dw workflow:start`, `dw workflow:signal`, `dw workflow:update` ou leurs équivalents SDK |
| Vérifier la compatibilité | `dw server:info --output=json` et `/api/cluster/info` |
| Inspecter la santé d’une file | `dw task-queue:describe <queue> --output=json` |
| Comparer les interfaces client et worker | [Capacités des clients et des workers](./polyglot/cli-python-parity.md) |
| Implémenter un worker hors PHP | [Protocole worker](./polyglot/worker-protocol.md) |
| Implémenter un gestionnaire externe | [Interface d’exécution externe](./polyglot/external-execution.md) |

Préférez les sorties JSON ou JSONL pour les cycles d’agent. Les tableaux
du terminal sont destinés aux humains.

## 5. Diagnostiquer avant de réparer {#5-diagnose-before-repairing}

Collectez les faits avant de modifier le code ou de rejouer des commandes :

```bash
dw doctor --output=json
dw server:info --output=json
dw debug workflow <workflow-id> --output=json
dw workflow:history <workflow-id> <run-id> --output=json
```

Pour l’interface MCP de l’application d’exemple, appelez :

```json
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Lisez `root_cause.category`, `remediation.classification` et
`remediation.automatic_repair.allowed`. Appelez `repair_workflow`
uniquement si le dernier champ vaut true :

```json
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
```

Si Waterline est disponible, exportez l’historique de l’exécution sélectionnée.
Il contient les événements typés, le contexte de l’exécution, les attentes,
temporisateurs, filiations, métadonnées de source des projections, contrôles
d’intégrité et échecs durables. Ces faits permettent de distinguer un défaut
du workflow d’un worker indisponible, d’un identifiant manquant, d’une panne
de file, d’un client incompatible ou d’une action opérateur en attente.

## 6. Rapporter les faits du contrat {#6-report-with-contracts}

Les rapports d’agent doivent citer des faits stables :

- version de la documentation et bundle LLM utilisés
- identifiants de workflow et d’exécution, espace de noms et file de tâches
- commande ou outil MCP appelé
- état JSON, code de sortie ou motif d’échec nommé
- `root_cause.category`, `remediation.classification` et autorisation ou refus de réparation
- événements d’historique typés récents et dernier échec durable
- version de compatibilité ou de protocole donnée par `server:info` ou `/api/cluster/info`

Cette structure fonctionne pour les applications d’exemple locales, les
serveurs autonomes, les workers Python et les futurs SDK clients.

## 7. Preuve sur artefacts publiés {#7-published-proof}

Le banc de conformité de l’application d’exemple démontre le cycle d’agent
à partir d’artefacts publiés. Son volet MCP effectue :

1. découverte : JSON-RPC `tools/list` et `list_workflows`
2. modification : choix du workflow `simple`, sans identifiants externes, avec une `business_key` explicite
3. exécution : `start_workflow`
4. diagnostic : `diagnose_workflow` avec les objets de cause racine et de remédiation
5. réparation : `repair_workflow` avec mutation structurée sûre ou refus
6. vérification : `get_workflow_result`, `diagnose_workflow` et `get_workflow_history`

Les métadonnées de conformité consignent les codes d’état des outils,
l’identifiant du workflow, l’état de fin, les identifiants de schéma de cause
racine, de remédiation et de mutation sûre, ainsi que des éléments d’historique bornés.

## Pages associées {#related-pages}

- [Développement assisté par IA](./ai-assisted-development.md)
- [Contrat des outils pour agents](./agent-tooling-contract.md)
- [Contrat MCP des workflows](./mcp-workflows.md)
- [Application d’exemple](./sample-app.md)
- [Référence des commandes CLI](./polyglot/cli-reference.md)
- [Protocole worker](./polyglot/worker-protocol.md)
- [Interface d’exécution externe](./polyglot/external-execution.md)
