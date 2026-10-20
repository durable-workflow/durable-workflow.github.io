---
sidebar_position: 4.5
title: Matrice de personnalisation
description: Matrice de prise en charge figée des modèles personnalisés, sérialiseurs, dépôts d’observabilité, diagnostics, imports, migrations et écritures de Durable Workflow v2.
---

# Matrice de personnalisation {#customization-matrix}

Cette page fixe le contrat de personnalisation pris en charge par Durable Workflow v2.
Consultez-la pour déplacer les modèles durables v2 vers une autre connexion,
remplacer des sous-classes de modèles ou le dépôt PHP d’observabilité destiné
aux opérateurs, ou déterminer si un ancien réglage de sérialisation reste valide pendant la migration.

## Matrice des personnalisations prises en charge {#supported-override-matrix}

| Surface | Contrat pris en charge | Remarques |
| --- | --- | --- |
| `workflows.v2.instance_model` avec une sous-classe au schéma compatible qui conserve le nom de base `WorkflowInstance` | Pris en charge | Utilisez cette forme si vous avez seulement besoin d’une autre connexion, de conversions de types ou d’un espace de noms applicatif. Les relations héritées conservent le contrat de clé étrangère `workflow_instance_id` du package. |
| `workflows.v2.instance_model` avec une sous-classe qui change de table ou de nom de base | Pris en charge avec redéfinition explicite des relations | Redéfinissez `runs()`, `commands()` et `updates()` pour conserver `workflow_instance_id`. Le package vérifie désormais ce point au démarrage et rejette les inférences de relations héritées qui modifieraient ces clés. `currentRun()` fixe déjà explicitement `current_run_id` et n’a pas besoin d’être redéfinie. |
| Autres personnalisations `workflows.v2.*_model` (`run_model`, `task_model`, `history_event_model`, projections, planifications, lignes d’activité, échecs, messages, mémos, attributs de recherche, appels enfants) | Prises en charge pour les sous-classes au schéma compatible | Conservez les noms de colonnes, clés primaires et clés étrangères du package. Ces relations fixent déjà les clés utilisées. Les sous-classes qui changent de table peuvent donc conserver les méthodes de relation héritées si le schéma reste compatible. |
| Noms de tables et de colonnes de clés étrangères personnalisés | Non pris en charge | Le runtime v2 et les interfaces opérateur supposent les noms de colonnes et de clés du package. Les modifier sort du contrat pris en charge. |
| Remplacement de `OperatorObservabilityRepository` | Pris en charge par liaison dans le conteneur | Liez votre implémentation à `Workflow\V2\Contracts\OperatorObservabilityRepository`. Il s’agit d’un contrat d’intégration du runtime PHP pour Waterline et `WorkflowStub::historyExport()`, pas d’une API multilangage stable. Le dépôt reçoit les objets modèles du package. |
| `serializer` | Pris en charge uniquement pour `avro` et les anciens codecs de vidage/import | Les nouvelles exécutions v2 utilisent toujours la sémantique Avro. `workflow-serializer-y` et `workflow-serializer-base64` restent valides uniquement pour terminer ou importer un historique v1 nécessitant encore un décodage natif PHP. Les classes de sérialisation personnalisées v1 ne sont pas prises en charge en v2. |
| Diagnostics de santé et doctor | Pris en charge | `php artisan workflow:v2:doctor` et les vues santé/statistiques de Waterline v2 reflètent les classes de modèles configurées et signalent les réglages de sérialisation obsolètes comme une dette de migration. |
| Migrations du package sur une connexion autre que celle par défaut | Prises en charge avec publication des migrations | Les migrations chargées automatiquement s’exécutent sur la connexion Laravel par défaut. Si vos modèles durables utilisent une autre connexion, publiez les migrations et définissez explicitement leur `$connection`. |
| Chemin d’écriture principal du runtime (`WorkflowStub::make()`, `load()`, création de tâches, résolution de l’exécution courante) | Pris en charge via les modèles durables configurés | Le runtime respecte les modèles `instance_model`, `run_model` et `task_model` configurés. Conservez des tables d’écriture dont le schéma est compatible avec les colonnes et clés du package. |

## Clés exactes des modèles v2 {#exact-v2-model-keys}

La configuration `workflows.php` publiée expose les clés de modèles durables suivantes sous `workflows.v2` :

- `instance_model`
- `run_model`
- `history_event_model`
- `task_model`
- `command_model`
- `link_model`
- `activity_execution_model`
- `activity_attempt_model`
- `timer_model`
- `failure_model`
- `run_summary_model`
- `run_wait_model`
- `run_timeline_entry_model`
- `run_timer_entry_model`
- `run_lineage_entry_model`
- `schedule_model`
- `schedule_history_event_model`

Utilisez des sous-classes des modèles du package pour ces clés. Conservez ses
noms de colonnes et clés étrangères, sauf indication contraire dans cette documentation.

## Règle de personnalisation du modèle d’instance {#instance-model-override-rule}

La seule personnalisation v2 actuelle nécessitant un travail supplémentaire sur
les relations est `workflows.v2.instance_model` lorsque votre sous-classe conduit
à inférer une clé étrangère différente de `workflow_instance_id`.

Exemple courant sûr :

```php
namespace App\Models\V2;

use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;

final class WorkflowInstance extends BaseWorkflowInstance
{
    protected $connection = 'workflow';
}
```

Le nom de base de la sous-classe étant toujours `WorkflowInstance`, Eloquent
conserve la même clé étrangère inférée et les relations héritées restent cohérentes.

Si vous utilisez un autre nom de base ou un modèle de stockage qui change de
table, redéfinissez explicitement les relations concernées :

```php
namespace App\Workflow\Storage;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Workflow\V2\Models\WorkflowCommand;
use Workflow\V2\Models\WorkflowInstance as BaseWorkflowInstance;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Models\WorkflowUpdate;
use Workflow\V2\Support\ConfiguredV2Models;

final class TenantWorkflowInstance extends BaseWorkflowInstance
{
    protected $table = 'tenant_workflow_instances';

    public function runs(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('run_model', WorkflowRun::class),
            'workflow_instance_id',
        );
    }

    public function commands(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('command_model', WorkflowCommand::class),
            'workflow_instance_id',
        )->oldest('created_at');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(
            ConfiguredV2Models::resolve('update_model', WorkflowUpdate::class),
            'workflow_instance_id',
        )
            ->orderBy('command_sequence')
            ->oldest('accepted_at')
            ->oldest('created_at')
            ->oldest('id');
    }
}
```

Si ces redéfinitions manquent, le package échoue désormais immédiatement au
démarrage au lieu de laisser l’application utiliser des clés inférées comme
`tenant_workflow_instance_id` ou `custom_workflow_instance_id`.

## Règles de sérialisation, d’import et de santé {#serializer-import-and-health-rules}

- Conservez `serializer = 'avro'` pour les nouveaux traitements v2.
- Utilisez les anciens codecs uniquement pour terminer ou importer un historique v1
  qui nécessite encore un décodage des données natif PHP.
- Ne configurez pas v2 avec des classes de sérialisation personnalisées v1 supprimées.
- Exécutez `php artisan workflow:v2:doctor` après une mise à niveau ou un changement
  de configuration. Ce diagnostic signale les anciens réglages de sérialisation
  et les autres problèmes de préparation au démarrage.
- Considérez la santé et les statistiques Waterline v2 comme la vue opérateur
  de cette même configuration de modèles durables.

## Règles de migration et d’écriture {#migration-and-write-side-rules}

- Le fonctionnement normal utilise les migrations du package chargées automatiquement
  sur la connexion par défaut.
- Si vos modèles durables utilisent une autre connexion, publiez les migrations
  et définissez leur `$connection` pour que `php artisan migrate` cible la même
  base de données que les sous-classes de modèles configurées.
- Conservez les noms de tables, clés primaires et clés étrangères du package
  sur chaque modèle participant au chemin d’écriture du runtime.
- Cette personnalisation ne se limite pas aux lectures : les démarrages,
  chargements, résolutions de l’exécution courante et exécutions de tâches
  utilisent tous les modèles durables configurés.

## Guides associés {#related-guides}

- [Publication de la configuration](./publishing-config.md)
- [Connexion à la base de données](./database-connection.md)
- [Guide de migration](../migration.md)
- [Supervision](../monitoring.md)
