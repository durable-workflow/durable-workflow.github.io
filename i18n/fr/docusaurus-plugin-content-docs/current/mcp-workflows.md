---
sidebar_position: 9.2
title: Contrat MCP des workflows
description: Utilisez le serveur MCP de l’application d’exemple comme interface de référence pour la découverte, le démarrage, le diagnostic, la réparation, les résultats et l’historique.
tags:
  - ai
  - agents
  - mcp
  - sample-app
keywords:
  - durable workflow mcp
  - outils de workflow mcp
  - serveur mcp application exemple
  - découverte workflow client IA
---

# Contrat MCP des workflows {#mcp-workflow-surface}

L’application d’exemple expose le serveur MCP de référence Durable Workflow v2 à :

```text
/mcp/workflows
```

Utilisez-le lorsqu’un client IA doit inspecter ou exploiter une application
locale de workflow sans analyser Waterline ni deviner les détails internes
de Laravel. Cette interface de développement structurée nomme les workflows
que l’application choisit d’exposer, décrit les identifiants requis, démarre
les exécutions, interroge les résultats et retourne des faits d’historique bornés.

## Contrat du serveur {#server-contract}

L’application d’exemple enregistre le serveur depuis `routes/ai.php` et
configure les clés de workflows exposées dans `config/workflow_mcp.php`.
Cette configuration constitue la liste publique d’autorisation pour les clients
IA. Un workflow n’est exploitable par MCP que s’il y figure avec assez de
métadonnées pour qu’un client décide s’il peut l’exécuter sans danger.

Chaque workflow configuré doit décrire :

- une clé de workflow stable
- la classe de workflow associée
- les arguments requis et facultatifs
- les identifiants requis
- son aptitude aux tests locaux sans identifiants externes
- les attentes de résultat et d’historique qu’un agent peut citer

Gardez les secrets hors des descriptions d’outils. Indiquez qu’un identifiant
est nécessaire, sans inclure sa valeur ni des détails propres au compte.

## Outils {#tools}

Le serveur de référence expose six outils de workflow :

| Outil | Usage |
| --- | --- |
| `list_workflows` | Découvrir les clés configurées, descriptions, identifiants requis, états v2 et exécutions récentes. |
| `start_workflow` | Démarrer un workflow configuré et retourner `workflow_id`, `run_id`, l’état, la clé métier et le résultat de commande. |
| `get_workflow_result` | Interroger l’exécution courante ou sélectionnée pour connaître son état, son résultat, les métadonnées de visibilité et le résumé du dernier échec. |
| `get_workflow_history` | Récupérer une fin d’historique bornée d’événements v2 typés et les échecs durables récents. |
| `diagnose_workflow` | Classifier une exécution sélectionnée avec des faits structurés, la cause racine, la remédiation et les prochaines actions. |
| `repair_workflow` | Demander la commande de réparation v2 intégrée et retourner une mutation structurée acceptée, refusée ou inutile. |

Appelez `list_workflows` avant tout démarrage. C’est le contrôle de compatibilité
de l’agent : la réponse indique les clés existantes et si un workflow peut
s’exécuter dans l’environnement actuel.

Les enveloppes de découverte utilisent le schéma normatif
`durable-workflow.v2.mcp-discovery`. Les agents peuvent ainsi reconnaître
la structure de la liste d’outils publiée, les schémas de paramètres,
les indications de découverte et les règles de `payload_preview_limit_bytes`
avant d’appeler un outil.

## Contrat d’entrée des outils {#tool-input-contract}

Les schémas des outils MCP utilisent volontairement les termes Durable Workflow
plutôt que les détails internes de Laravel. Préservez ces champs lors de
l’extension du serveur de l’application d’exemple :

| Outil | Entrées stables |
| --- | --- |
| `list_workflows` | `show_recent`, `limit` et `status` facultatif pour découvrir les exécutions récentes. |
| `start_workflow` | `workflow`, `arguments` ordonnés et les champs facultatifs `instance_id`, `business_key`, `visibility_labels`, `memo`, `search_attributes` et `duplicate_start_policy`. |
| `get_workflow_result` | `workflow_id`, puis `run_id`, `include_recent_history` et `history_limit` facultatifs. |
| `get_workflow_history` | `workflow_id` ou `run_id`, `limit` et `include_payloads`. |
| `diagnose_workflow` | `workflow_id` ou `run_id`, avec `history_limit` facultatif. |
| `repair_workflow` | `workflow_id` ou `run_id`. |

Préférez `arguments` à l’ancienne entrée `args` pour les nouveaux agents.
`arguments` correspond directement à l’ordre des arguments de `handle()`.
`args` existe uniquement pour les anciens appelants utilisant une structure objet.

N’utilisez un `instance_id` fourni par l’appelant que si l’agent a besoin
d’idempotence. Associez-le à `duplicate_start_policy=return_existing_active`
si un test répété doit rejoindre le workflow actif plutôt qu’échouer comme doublon.

## Contrat de résultat des outils {#tool-result-contract}

Les enveloppes de résultat utilisent le schéma normatif
`durable-workflow.v2.mcp-tool-results`. Les agents peuvent analyser l’état
du résultat, la troncature des aperçus de données utiles, les champs d’erreur,
les objets de cause racine et de remédiation, les enveloppes de mutation sûre
et les marqueurs de schéma et de version.

Les agents doivent utiliser ces champs pour la corrélation durable entre outils :

| Outil | Champs de résultat stables |
| --- | --- |
| `list_workflows` | `available_workflows`, `allow_fqcn`, `workflow_id_kind`, `run_id_kind`, `status_values` et `recent_workflows` facultatif. |
| `start_workflow` | `workflow_id`, `run_id`, `workflow`, `workflow_class`, `workflow_type`, `status`, `running`, `business_key`, `duplicate_start_policy` et `command`. |
| `get_workflow_result` | `found`, `workflow_id`, `run_id`, `current_run_id`, `current_run_is_selected`, `status`, `running`, `output`, `error`, métadonnées de visibilité et horodatages. |
| `get_workflow_history` | `found`, `workflow_id`, `run_id`, `current_run_id`, `status`, `history_event_count`, `returned_event_count`, `events_are_most_recent`, `payloads_included`, `events` et `failures`. |
| `diagnose_workflow` | `found`, `workflow_id`, `run_id`, `diagnosis`, `facts`, `latest_failure`, `recent_history`, `root_cause`, `remediation` et `next_actions`. |
| `repair_workflow` | `found`, `workflow_id`, `run_id`, `accepted`, `status`, `mutation`, `command`, `remediation` et `next_actions`. |

Les aperçus des données d’historique sont volontairement bornés. Si
`include_payloads` vaut true, chaque aperçu indique
`payload_preview_limit_bytes`, `size_bytes`, `preview_bytes` et
`truncated`. L’agent peut ainsi préciser s’il a vu toutes les données ou un aperçu.

## Classification des échecs et remédiation {#failure-and-remediation-taxonomy}

`diagnose_workflow` expose les causes racines lisibles par machine. Son objet
`root_cause` utilise le schéma `durable-workflow.v2.agent-root-cause`
et contient :

- `category`, comme `activity_failure`, `workflow_failure`,
  `task_repair_attention`, `waiting_for_signal`, `history_growth_attention`,
  `in_progress` ou `none`
- `source.kind` et `source.id` pour le workflow, l’activité, l’attente, la file
  de tâches ou la famille d’historique à l’origine de la classification
- `retryable`, `severity` et `actionable`
- les détails d’échec comme `failure_category`, `exception_class` et
  `handled` lorsqu’une ligne d’échec durable existe

L’objet associé `remediation` utilise le schéma
`durable-workflow.v2.agent-remediation`. Il comprend
`classification`, un court `summary`, `automatic_repair.tool` et
`automatic_repair.allowed`, ainsi que les entrées `next_actions` pour les
commandes de suivi prises en charge. Les agents ne doivent appeler
`repair_workflow` que si `automatic_repair.allowed` vaut true.
Les autres classifications demandent d’attendre, d’envoyer l’entrée attendue
via l’interface de commande documentée du workflow, d’inspecter l’historique,
de modifier le code du workflow ou de l’activité, ou de planifier une
continuation avec une nouvelle exécution.

`repair_workflow` retourne une enveloppe `durable-workflow.v2.safe-mutation`.
Le champ `mutation.applied` indique si une commande de réparation a été acceptée.
`command.outcome` distingue `repair_dispatched`, `repair_not_needed` et
les refus structurés, par exemple pour une exécution terminale ou non courante.

## Cycle d’agent sûr {#safe-agent-loop}

Commencez par les workflows sans identifiants externes :

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "diagnose_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "repair_workflow", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Les clés `simple` et `elapsed` sont recommandées pour les tests de bon
fonctionnement. N’utilisez les exemples nécessitant des identifiants qu’après
que `list_workflows` a signalé cette exigence et que les clés sont présentes
dans l’environnement local.

## Structure du rapport {#report-shape}

Un client IA doit rapporter les résultats MCP avec des faits stables :

- version de documentation utilisée, normalement `2.0`
- point de terminaison MCP et nom de l’outil
- clé du workflow, `workflow_id` et `run_id`
- état et résumé du dernier échec
- `root_cause.category` et `remediation.classification`
- valeur true ou non de `remediation.automatic_repair.allowed` avant
  toute tentative de mutation de réparation
- noms d’événements et horodatages d’un historique borné
- utilisation d’un workflow de test sans identifiants externes ou d’un exemple
  nécessitant des identifiants

Ces faits correspondent aux interfaces CLI, SDK Python et export d’historique
Waterline. Un humain peut ainsi reproduire la même exécution depuis un autre client.

## Pages associées {#related-pages}

- [Développement assisté par IA](./ai-assisted-development.md)
- [Cycle d’exploitation pour les agents](./agent-operating-loop.md)
- [Contrat des outils pour agents](./agent-tooling-contract.md)
- [Application d’exemple](./sample-app.md)
- [Capacités des clients et des workers](./polyglot/cli-python-parity.md)
- [Flux de messages](./features/message-streams.md)
