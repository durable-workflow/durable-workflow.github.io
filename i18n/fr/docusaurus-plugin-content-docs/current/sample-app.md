---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - application exemple
  - consommateur Laravel
  - exemple de workflow IA
  - tableau de bord Waterline
---

# Application exemple {#sample-app}

https://github.com/durable-workflow/sample-app

Cette galerie Laravel embarquée est une application exemple Laravel 13 fondée
sur la branche stable Durable Workflow 2.0. Ses workflows peuvent s'exécuter
dans un GitHub Codespace. Elle constitue le bon point de départ pour un
déploiement **Laravel embarqué** si vous souhaitez inspecter ensemble
l'exécution des files Laravel et Waterline.

Choisissez les exemples qui correspondent à votre runtime :

| Modèle de déploiement | Parcours d'exemple |
| --- | --- |
| Durable Workflow Cloud | Commencez par le [runtime Cloud géré](/docs/polyglot/cloud-control-plane/), puis choisissez le guide SDK PHP, Python ou Rust avec les identifiants de l'espace de noms provisionné. Les utilisateurs Cloud n'exécutent pas Server. |
| Mode service auto-hébergé | Utilisez le [démarrage rapide Durable Workflow 2.0](/docs/quickstart/) pour des exemples complets PHP, Python et Rust avec les artefacts publiés et un Server local. |
| Laravel embarqué | Poursuivez avec cette galerie et l'[installation embarquée](/docs/installation/). |

La galerie prouve le fonctionnement de bout en bout du moteur hébergé dans
Laravel. Elle n'est pas une application de démarrage universelle pour le mode
service ou les déploiements polyglottes. C'est le premier endroit où les
fonctionnalités embarquées sont couvertes dans un contexte Laravel réaliste,
et la source reprise par ce site pour les modèles natifs Laravel. Pour partager
un modèle de workflow durable, le guide
[contribuer un exemple](/docs/contribute-a-sample) décrit la procédure.

> La version Laravel 12 / Durable Workflow 1.x est conservée sur la [branche `Laravel-12`](https://github.com/durable-workflow/sample-app/tree/Laravel-12). Les anciens articles et tutoriels utilisant les modèles v1 (par exemple `Workflow\Workflow`, `yield activity(...)`, `Workflow\Activity`) ciblent cette branche.

## Galerie d'exemples {#sample-gallery}

Chaque entrée nomme le modèle enseigné, la classe de workflow qui l'exerce, la
commande artisan qui l'exécute et l'écran Waterline qui prouve la validation de
l'exécution. La galerie reproduit l'index « Sample Index » du README du dépôt
sample-app. À chaque ajout ou déplacement d'exemple, le README et cette galerie
évoluent ensemble.

| Modèle | Classe de workflow | Commande | Écran Waterline |
|---------|----------------|---------|------------------|
| Workflow v2 déterministe minimal | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | Liste des exécutions → détail avec deux événements d'activité et un événement `WorkflowCompleted` |
| Mesure durable du temps écoulé sans dérive à la relecture | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | Détail avec deux événements `SideEffectRecorded` pour les lectures d'horloge `sideEffect` encadrant un `TimerFired` |
| Coordination entre applications Laravel | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | Détail avec événements d'activité et routage de file entre les workers de l'application et du microservice |
| Automatisation de navigateur avec artefacts capturés | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | Détail avec l'activité Playwright, l'activité FFmpeg et le nettoyage dans l'ordre |
| Workflow démarré par webhook et attendant un signal | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | Détail avec `WorkflowStarted` depuis l'entrée webhook et un `SignalReceived` pour `ready` |
| Boucle d'activités IA avec tentatives et validation durables | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | Détail avec tentatives d'activité répétées et le `ActivityCompleted` qui satisfait le validateur |
| Agent IA piloté par signaux avec compensation saga | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | Détail avec référence de flux de messages, historique de mise à jour et activités de compensation enregistrées après un échec de saga |

La colonne Waterline indique les événements attendus lors d'une exécution saine.
Si l'un manque localement, cet écart est le moyen le plus rapide de localiser
un problème de worker ou d'environnement.

## Liens vers les pages de modèles {#pattern-page-cross-links}

Les pages de modèles du site renvoient directement au workflow exemple qui
exerce chaque interface. Ce tableau mène de la page au workflow exécutable associé.

| Page de modèle | Workflow exemple |
|--------------|-----------------|
| [Sagas](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Signaux](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Flux de messages](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Workflows enfants](/docs/features/child-workflows) | Pas encore d'entrée dédiée. Utilisez le guide des workflows enfants. |
| [Effets de bord](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow` (`php artisan app:elapsed`) |
| [Webhooks](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Workflows MCP](/docs/mcp-workflows) | chaque entrée de la galerie, exposée via `config/workflow_mcp.php` |

**Étape 1**

Créez un codespace depuis la branche principale de ce dépôt.

![Création du codespace](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**Étape 2**

Après sa création, attendez sa construction. Cela prend environ 5 à 10 minutes.

**Étape 3**

Une fois prêt, l'éditeur et le terminal apparaissent en bas.

![Éditeur et terminal](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**Étape 4**

Exécutez composer install.

```bash
composer install
```

**Étape 5**

Exécutez la commande d'initialisation pour configurer l'application, installer
les dépendances supplémentaires et appliquer les migrations.

```bash
php artisan app:init
```

Le parcours `php artisan migrate` de l'exemple détecte directement les migrations
des paquets Workflow et Waterline. Toutes les tables et vues enregistrées
Waterline sont donc prêtes après l'installation normale.

**Étape 6**

Démarrez le worker de file pour traiter workflows et activités.

```bash
php artisan queue:work
```

Pour vérifier la boucle de réparation elle-même sans attendre un nouveau cycle
`Looping` d'un worker occupé, lancez un passage explicite de reprise depuis un
second terminal :

```bash
php artisan workflow:v2:repair-pass
```

Cette commande utilise les mêmes politiques d'analyse et de délai entre
tentatives que la boucle worker. Elle est utile après correction d'un problème
local de file ou backend, pour valider une perte de tâche dans l'exemple, ou
quand un codespace peu actif attendrait longtemps le passage suivant. Ajoutez
`--run-id=...` pour limiter le passage à une ou plusieurs exécutions choisies
pendant une expérience, ou `--instance-id=...` pour couvrir l'instance entière.

**Étape 7**

Créez une nouvelle fenêtre de terminal.

![Nouveau terminal](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**Étape 8**

Démarrez le workflow exemple dans ce nouveau terminal.

```bash
php artisan app:workflow
```

**Étape 9**

Le tableau de bord Waterline est accessible à https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard.

![Tableau de bord Waterline](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

Waterline présente l'état durable : démarrage, exécution courante, événements
typés validés, attentes ouvertes et actions opérateur disponibles. La télémétrie
worker est distincte : latence d'interrogation, durée des tâches, configuration
de l'exportateur, métriques applicatives et erreurs de processus viennent des
journaux du worker PHP ou du point de métriques SDK d'un worker externe.

| Interface | Réponses | Vérification dans l'exemple |
| --- | --- | --- |
| Waterline et export d'historique | État durable, historique, tentatives, attentes, signaux, mises à jour, échecs et actions opérateur | Ouvrir `/waterline/dashboard` puis exporter l'historique de l'exécution choisie |
| Journaux worker | Erreurs du processus worker PHP et journaux applicatifs | Suivre `storage/logs/laravel.log` pendant `php artisan queue:work` |
| Métriques SDK | Nombre de requêtes client/worker externe, latence d'interrogation et durée des tâches | Collecter le point Prometheus/OpenMetrics du worker SDK |

Pour un worker Python, installez l'option Prometheus et exposez les métriques
depuis ce processus worker :

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

Remplacez `GreeterWorkflow` et `greet` par les gestionnaires de workflow et
d'activité enregistrés par ce worker.

Collectez `:9102/metrics` pour les séries `durable_workflow_worker_*` et
`durable_workflow_client_*`. Ces métriques expliquent les performances du runtime
worker. Waterline reste la source de vérité de l'historique de workflow validé.

Le détail Waterline inclut une action « Exporter l'historique » pour l'exécution
choisie. Quand il affiche l'exécution courante de l'instance, le bouton utilise
la route d'export courant limitée à l'instance. Le détail historique conserve
le chemin explicite `/runs/{runId}/history-export`. Vous pouvez exporter le
même ensemble de relecture et de diagnostic depuis le terminal de l'application :

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

L'export inclut une somme d'intégrité SHA-256. Définissez
`DW_V2_HISTORY_EXPORT_SIGNING_KEY` et `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID` dans
l'environnement si un autre système doit vérifier l'ensemble par signature HMAC.

Le bloc exporté `selected_run` inclut `waits_projection_source`,
`timeline_projection_source`, `timers_projection_source` et
`lineage_projection_source`. Le bloc `links` inclut aussi `projection_source`.
Ses sections `links.parents` / `links.children` proviennent d'abord de
l'historique typé de filiation de l'exécution choisie. Les liens d'enfants et
continue-as-new restent donc visibles même si les lignes de liens modifiables
ont dérivé pendant une expérience locale. Quand une ligne de filiation ne
subsiste que dans d'anciennes données de compatibilité modifiables, l'export
la marque `history_authority = mutable_open_fallback` et `diagnostic_only = true`
au lieu de reconstituer silencieusement des métadonnées de liens supplémentaires.

## Flux de messages des workflows IA {#ai-workflow-message-streams}

Les workflows répétés d'IA ou d'entrée humaine doivent utiliser la façade v2
native de flux de messages :

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

Conservez le stockage applicatif des grandes requêtes et réponses, puis faites
passer leur référence dans le flux. Les nouveaux exemples ne doivent pas écrire
directement dans `workflow_messages` ni appeler `MessageStreamCursor` ou
`MessageService`. Consultez les [flux de messages](/docs/features/message-streams)
pour le contrat stable v2 de boîtes d'entrée et de sortie.

**Étape 10**

Exécutez les tests de workflows et d'activités.

```bash
vendor/bin/phpunit
```

Vous pouvez maintenant créer et tester des workflows.

## Serveur MCP pour clients IA {#ai-client-mcp-server}

L'application expose aussi un serveur Laravel MCP à `/mcp/workflows`. C'est
l'interface de référence des clients IA de Durable Workflow v2 : elle donne
aux agents une découverte structurée des workflows, le démarrage, l'état, les
sorties, l'historique typé récent et les faits d'échec sans analyser Waterline.

Pour le contrat détaillé des outils et du point MCP, consultez
l'[interface des workflows MCP](/docs/mcp-workflows). Pour le contrat plus large
de développement assisté par IA, y compris manifestes LLM v2, codes de sortie
CLI, exports Waterline et références SDK, consultez le
[développement assisté par IA](/docs/ai-assisted-development).

Le paquet Laravel MCP enregistre le serveur dans `routes/ai.php`. Les clés de
workflows exposées se trouvent dans `config/workflow_mcp.php`. Chaque entrée
peut inclure la classe et des métadonnées de découverte : description,
identifiants nécessaires et arguments attendus.

Outils par défaut :

| Outil | Rôle |
| --- | --- |
| `list_workflows` | Liste les clés configurées, les identifiants requis, les états v2 et, facultativement, les exécutions récentes. |
| `start_workflow` | Démarre un workflow v2 configuré et renvoie `workflow_id`, `run_id`, état, clé métier et résultat de commande. |
| `get_workflow_result` | Interroge l'exécution courante ou choisie et renvoie état, sortie, métadonnées de visibilité et résumé du dernier échec. |
| `get_workflow_history` | Renvoie une fin bornée d'historique typé v2 et les derniers échecs durables pour le diagnostic. |
| `diagnose_workflow` | Classe une exécution avec faits structurés, cause racine, remédiation et prochaines actions. |
| `repair_workflow` | Demande la commande de réparation v2 intégrée et renvoie une mutation structurée acceptée, refusée ou inutile. |

Une boucle d'agent typique :

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Utilisez `simple` ou `elapsed` pour les tests rapides sans identifiants. Le
workflow `prism` est exposé comme exemple IA, mais nécessite `OPENAI_API_KEY`
avant qu'un worker puisse le terminer.
