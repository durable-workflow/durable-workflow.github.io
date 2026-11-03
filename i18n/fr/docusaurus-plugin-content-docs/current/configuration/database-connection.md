---
sidebar_position: 4
---

# Connexion à la base de données {#database-connection}

Workflow utilise la connexion de base de données Laravel par défaut de votre application, sauf si vous choisissez une autre connexion pour son stockage durable.

Pour utiliser une connexion définie dans `config/database.php` pour le stockage des workflows, indiquez son nom dans l’environnement :

```dotenv
DW_STORAGE_CONNECTION=workflows
```

Les modèles, transactions, verrous de ligne et actions après commit de Workflow utilisent cette connexion. Placez toutes les tables durables des workflows sur la même connexion Laravel. Configurez séparément le transport de la file dans la configuration des files de Laravel.

Vous pouvez aussi sélectionner la connexion avec des classes de modèles personnalisées, comme décrit ci-dessous. Le `run_model` v2 configuré fournit la connexion de stockage des métadonnées v2 sans connexion explicite dans leur modèle. Les connexions explicites des modèles doivent être identiques. `DW_STORAGE_CONNECTION` est prioritaire sur les propriétés de connexion des modèles.

Pour le contrat complet des personnalisations v2, notamment les sous-classes
changeant de table, les règles de sérialisation, le remplacement du dépôt,
les diagnostics de santé et les exigences de migration, consultez la
[Matrice de personnalisation](./customization-matrix.md).

## Connexions des modèles personnalisés {#custom-model-connections}

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

Les migrations de Workflow sont chargées automatiquement depuis le package et respectent `DW_STORAGE_CONNECTION`. Les migrations de l’application conservent leurs propres connexions configurées.

Si vous utilisez des connexions de modèles personnalisées sans `DW_STORAGE_CONNECTION`, attribuez la même `$connection` aux migrations Workflow publiées correspondantes. L’option Laravel `--database` permet aussi de sélectionner la cible lors de l’exécution de ces seules migrations Workflow. Gardez les migrations de l’application sur sa connexion.

## Limites des transactions {#transaction-boundaries}

Lorsque les données de l’application et le stockage des workflows utilisent la même connexion Laravel, un workflow démarré dans une transaction y participe. Un rollback supprime les écritures Workflow effectuées dans cette transaction. Le moteur publie les tâches de workflow dans la file et émet les événements de cycle de vie après le commit de la transaction de stockage la plus externe. Un rollback annule ces actions.

Par exemple, avec `DW_STORAGE_CONNECTION=workflows` :

```php
use App\Workflows\OrderWorkflow;
use Illuminate\Support\Facades\DB;
use Workflow\V2\WorkflowStub;

DB::connection('workflows')->transaction(function () {
    WorkflowStub::make(OrderWorkflow::class, 'order-123')->start('order-123');
});
```

Les modèles de l’application dont les changements doivent être validés atomiquement avec ce démarrage doivent aussi utiliser la connexion `workflows`.

Les transactions sur des connexions Laravel différentes sont validées indépendamment, même lorsque leurs noms pointent vers la même base physique. Une transaction sur la connexion par défaut de l’application ne peut pas annuler un workflow déjà validé sur une autre connexion de stockage. Placez les changements qui doivent être atomiques sur la même connexion et incluez-les dans sa transaction.

La publication après commit protège la limite du stockage des workflows. Une base de données ou un broker de messages distinct utilisé par la file possède ses propres règles de transaction et de livraison.
