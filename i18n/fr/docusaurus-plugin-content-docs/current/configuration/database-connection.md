---
sidebar_position: 4
---

# Connexion à la base de données {#database-connection}

Voici les étapes permettant de personnaliser la connexion à la base de données utilisée par les modèles durables workflow v2. Cela est nécessaire *uniquement* pour utiliser une connexion différente de celle définie par défaut dans votre application Laravel.

Pour le contrat complet des personnalisations v2, notamment les sous-classes
changeant de table, les règles de sérialisation, le remplacement du dépôt,
les diagnostics de santé et les exigences de migration, consultez la
[Matrice de personnalisation](./customization-matrix.md).

1. Créez dans le répertoire des modèles de votre application des classes qui étendent les modèles de base v2.
2. Définissez l’option `$connection` souhaitée dans chaque classe.
3. Publiez le fichier de configuration workflow.
4. Faites pointer les liaisons de modèles `workflows.v2` vers vos classes personnalisées.

## Étendre les modèles workflow v2 {#extending-v2-workflow-models}

Placez ceci dans `app\Models\V2\WorkflowInstance.php`.

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'mysql';
}
```

Répétez ce modèle pour chaque modèle durable v2 à rediriger, au minimum :

- `Workflow\V2\Models\WorkflowRun`
- `Workflow\V2\Models\WorkflowHistoryEvent`
- `Workflow\V2\Models\WorkflowTask`
- `Workflow\V2\Models\WorkflowCommand`
- `Workflow\V2\Models\WorkflowLink`
- `Workflow\V2\Models\ActivityExecution`
- `Workflow\V2\Models\ActivityAttempt`
- `Workflow\V2\Models\WorkflowTimer`
- `Workflow\V2\Models\WorkflowFailure`
- `Workflow\V2\Models\WorkflowRunSummary`
- `Workflow\V2\Models\WorkflowSchedule`
- `Workflow\V2\Models\WorkflowScheduleHistoryEvent`

Chaque sous-classe doit déclarer `protected $connection = 'mysql';` (ou le nom de connexion que vous avez défini dans `config/database.php`).

## Enregistrer les modèles personnalisés {#registering-custom-models}

Publiez le fichier de configuration workflow et faites pointer les liaisons `workflows.v2.*_model` vers vos classes personnalisées :

```php
// config/workflows.php

'v2' => [
    'instance_model' => App\Models\V2\WorkflowInstance::class,
    'run_model' => App\Models\V2\WorkflowRun::class,
    'history_event_model' => App\Models\V2\WorkflowHistoryEvent::class,
    'task_model' => App\Models\V2\WorkflowTask::class,
    'command_model' => App\Models\V2\WorkflowCommand::class,
    // ...
],
```

Le package résout les modèles via `Workflow\V2\Support\ConfiguredV2Models`. Toute relation ou requête accédant à un modèle v2 utilise donc automatiquement la connexion configurée.

Si vous allez au-delà de sous-classes au schéma compatible et modifiez la clé
étrangère inférée de votre `instance_model` personnalisé, le package vérifie
désormais au démarrage que les relations `runs()`, `commands()` et `updates()`
ont été explicitement redéfinies.

## Migrations {#migrations}

Les migrations workflow sont chargées automatiquement depuis le package (`WorkflowServiceProvider::loadMigrationsFrom`) et s’exécutent sur la connexion de base de données par défaut. Lorsque vous dirigez les tables v2 vers une autre connexion, publiez les migrations avec `php artisan vendor:publish --tag=migrations` et définissez `protected $connection = 'mysql';` sur chaque classe de migration publiée afin que `php artisan migrate` les exécute sur la bonne base de données.
