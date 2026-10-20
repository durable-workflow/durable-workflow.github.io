---
sidebar_position: 1
---

# Publier la configuration {#publishing-config}

Cette commande crée un fichier de configuration `workflows.php` dans votre dossier `config`.

```bash
php artisan vendor:publish --provider="Workflow\Providers\WorkflowServiceProvider" --tag="config"
```

## Changer le dossier des workflows {#changing-workflows-folder}

Par défaut, les commandes `make` écrivent dans le dossier `app/Workflows`.

```php
php artisan make:workflow MyWorkflow
php artisan make:activity MyActivity
```

Modifiez le réglage `workflows_folder` pour changer ce dossier.

```php
'workflows_folder' => 'Workflows',
```

## Utiliser des modèles personnalisés (ancienne v1) {#using-custom-models-legacy-v1}

:::note Ancienne version

Ces clés `stored_workflow_*` configurent les classes v1 `Workflow\Models\StoredWorkflow*`. Workflow v2 utilise les modèles durables personnalisés ci-dessous : `instance_model`, `run_model`, `task_model`, etc. Conservez les clés v1 uniquement si vous exécutez encore des workflows v1 pendant la migration.

:::

Dans le fichier `workflows.php` publié, vous pouvez remplacer les classes de modèles v1 par vos propres sous-classes.

```php
'stored_workflow_model' => App\Models\StoredWorkflow::class,

'stored_workflow_exception_model' => App\Models\StoredWorkflowException::class,

'stored_workflow_log_model' => App\Models\StoredWorkflowLog::class,

'stored_workflow_signal_model' => App\Models\StoredWorkflowSignal::class,

'stored_workflow_timer_model' => App\Models\StoredWorkflowTimer::class,
```

## Personnaliser les modèles (v2) {#using-model-overrides-v2}

Le runtime permet aussi de personnaliser les modèles des tables durables d’instances, d’exécutions, de tâches, d’historique et de projections :

```php
'v2' => [
    'instance_model' => App\Models\WorkflowInstance::class,
    'run_model' => App\Models\WorkflowRun::class,
    'task_model' => App\Models\WorkflowTask::class,
    'history_event_model' => App\Models\WorkflowHistoryEvent::class,
    'run_summary_model' => App\Models\WorkflowRunSummary::class,
    'run_wait_model' => App\Models\WorkflowRunWait::class,
    'run_timeline_entry_model' => App\Models\WorkflowTimelineEntry::class,
    'run_timer_entry_model' => App\Models\WorkflowRunTimerEntry::class,
    'run_lineage_entry_model' => App\Models\WorkflowRunLineageEntry::class,
],
```

Ces personnalisations ne se limitent pas aux lectures ou aux reconstructions de projections. `WorkflowStub::make()`, `load()`, `loadSelection()`, la réservation d’instances, la sélection d’exécutions et l’exécution de tâches de workflow utilisent tous les modèles `instance_model`, `run_model` et `task_model` configurés. Les détails Waterline et l’export d’historique lisent via les mêmes classes. Une personnalisation applicative régit donc à la fois le chemin principal du runtime et les lectures destinées aux opérateurs.

Gardez un schéma compatible avec les modèles intégrés dans vos sous-classes. Si une sous-classe modifie aussi des noms de tables ou d’autres conventions Eloquent normalement inférées par les modèles du package, redéfinissez les relations concernées pour que `currentRun()`, `runs()` et les recherches similaires restent cohérentes avec votre schéma.

Consultez la [Matrice de personnalisation](./customization-matrix.md) pour le
contrat de prise en charge v2 figé : sous-classes héritées sûres, redéfinitions
de relations nécessaires, et articulation de la sérialisation, du dépôt,
des diagnostics de santé, de l’import, des migrations et des écritures.

## Codec des données {#payload-codec}

La v2 utilise `avro` pour les données des nouveaux workflows :

```php
'serializer' => 'avro',
```

- **`avro`** (par défaut, requis pour les nouveaux workflows v2) : encodage binaire Apache Avro. Compact sur le réseau et en stockage, et plus rapide à encoder et décoder pour les données volumineuses que l’ancien sérialiseur PHP.

Si une configuration v1 publiée définit encore `serializer`, la version finale v2 continue de lire cette valeur pour les diagnostics `workflow:v2:doctor`, mais les nouvelles données v2 utilisent toujours Avro.

### Anciens codecs (migration v1 uniquement) {#legacy-codecs-v1-migration-only}

Deux codecs réservés à PHP restent disponibles pour lire l’historique v1 pendant la migration :

- `workflow-serializer-y` : `SerializableClosure` PHP avec encodage par échappement d’octets (valeur par défaut v1).
- `workflow-serializer-base64` : `SerializableClosure` PHP avec encodage base64.

Définir `serializer` sur un ancien codec est signalé par `php artisan workflow:v2:doctor`. Les nouveaux workflows v2 utilisent toujours Avro. Conservez un ancien codec uniquement pour terminer ou importer des exécutions v1 nécessitant un décodage natif PHP.

Le lecteur interne d’import et de vidage v1 reconnaît les anciens noms de classes pleinement qualifiés (par exemple `Workflow\Serializers\Y::class`). Ce ne sont pas des alias de codecs publics v2 et une nouvelle exécution v2 ou un SDK ne peut pas les sélectionner.

## Marqueurs de compatibilité {#compatibility-markers}

Le runtime peut attribuer un marqueur de compatibilité à chaque nouvelle exécution et laisser les workers annoncer les marqueurs qu’ils peuvent exécuter en sécurité. Cette barrière maintient les exécutions longues sur des versions compatibles pendant un déploiement contrôlé de versions de workers.

Définissez le marqueur des nouvelles exécutions sur la version courante :

```env
DW_V2_CURRENT_COMPATIBILITY=build-2026-04
```

Vous pouvez demander à un worker d’accepter plusieurs marqueurs pendant un déploiement :

```env
DW_V2_SUPPORTED_COMPATIBILITIES=build-2026-04,build-2026-03
```

Réglez la durée de visibilité d’un instantané de battement de worker dans la vue du parc stockée en base :

```env
DW_V2_COMPATIBILITY_HEARTBEAT_TTL=30
```

Vous pouvez limiter cette vue du parc à une application ou à un espace de noms de déploiement si plusieurs applications partagent la même base de workflows :

```env
DW_V2_COMPATIBILITY_NAMESPACE=sample-app
```

La configuration `workflows.php` publiée associe ces valeurs ici :

```php
'v2' => [
    'compatibility' => [
        'current' => env('DW_V2_CURRENT_COMPATIBILITY'),
        'supported' => env('DW_V2_SUPPORTED_COMPATIBILITIES'),
        'namespace' => env('DW_V2_COMPATIBILITY_NAMESPACE'),
        'heartbeat_ttl_seconds' => (int) env('DW_V2_COMPATIBILITY_HEARTBEAT_TTL', 30),
    ],
],
```

Sans `supported`, les workers utilisent par défaut le seul marqueur `current`. Les anciennes lignes de tâches et de résumés créées avant les marqueurs de compatibilité par tâche sont complétées à partir du marqueur de leur exécution pendant la migration, puis à nouveau lors de la prise en charge ou de la récupération par le runtime si nécessaire. Les tâches et exécutions sans aucun marqueur restent accessibles à tout worker.

Le mécanisme de repli de `getVersion()` privilégie le `workflow_definition_fingerprint` enregistré au démarrage lorsque la relecture atteint une nouvelle branche sans événement typé `VersionMarkerRecorded`. Une exécution de même compatibilité peut ainsi conserver la branche `DEFAULT_VERSION` lorsqu’elle a clairement démarré avec une ancienne définition du workflow. Les anciennes exécutions dont l’historique `WorkflowStarted` précède l’instantané d’empreinte se rabattent encore sur le marqueur de compatibilité initial et les vérifications des séquences occupées. Continuez donc de renouveler `DW_V2_CURRENT_COMPATIBILITY` pour les vagues de déploiement introduisant du code de workflow versionné, et listez temporairement les anciens et nouveaux marqueurs dans `DW_V2_SUPPORTED_COMPATIBILITIES` pendant que l’ancienne cohorte de workers termine son travail.

Chaque worker de file enregistre aussi un instantané de battement de compatibilité en base pendant `Looping` et le traitement des tâches. Waterline et les fonctions de détail exposent la vue de la version locale (`compatibility_supported`, `compatibility_reason`) et celle du parc (`compatibility_namespace`, `compatibility_supported_in_fleet`, `compatibility_fleet_reason`, `compatibility_fleet`). Lorsque `DW_V2_COMPATIBILITY_NAMESPACE` est défini, les lignes de battement en base doivent correspondre à cet espace. Chaque instantané indique son `namespace`, son `worker_id`, la portée des files, les marqueurs pris en charge et `source = database`. Pendant une mise à niveau progressive, cette vue lit aussi l’ancien format de battement en cache des workers pas encore redémarrés sur la nouvelle table d’instantanés. Ces anciennes lignes restent visibles comme repli de déploiement même avec un espace configuré, mais affichent `namespace = null` jusqu’au redémarrage de ces workers sur le chemin d’instantanés avec espace de noms. L’isolation stricte des espaces de noms n’est donc complète qu’après le redémarrage de tous les workers sur les battements en base. La récupération du transport, par exemple le renvoi d’une tâche en retard ou la recréation d’une tâche manquante, ne dépend plus de la capacité du worker de contrôle à exécuter cette tâche. Seule sa prise en charge finale reste soumise à la compatibilité.

Lorsqu’une tâche ouverte existe déjà mais que ni la version courante ni aucun instantané de battement actif n’annonce son marqueur, l’exécution reste affichée comme en attente d’un worker compatible, sans faux état `repair_needed` sur cette version.

## Budgets d’historique {#history-budgets}

Waterline utilise la projection de résumé pour indiquer la taille de l’historique typé d’une exécution sélectionnée. Ces seuils déterminent quand la projection active `continue_as_new_recommended` :

```env
DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD=10000
DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD=5242880
```

La configuration `workflows.php` publiée associe ces valeurs ici :

```php
'v2' => [
    'history_budget' => [
        'continue_as_new_event_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_EVENT_THRESHOLD', 10000),
        'continue_as_new_size_bytes_threshold' => (int) env('DW_V2_CONTINUE_AS_NEW_SIZE_BYTES_THRESHOLD', 5242880),
    ],
],
```

Définissez un seuil à `0` pour désactiver cette partie de la recommandation. Cet indicateur est consultatif. Utilisez-le pour planifier des limites `continueAsNew()` avant que le coût de relecture augmente, sans modifier le comportement de l’exécution sélectionnée.

## Politique d’attente des mises à jour {#update-wait-policy}

Les API de mise à jour attendant la fin, comme `attemptUpdate()`, les routes webhook de mise à jour et les commandes Waterline, attendent pendant une durée bornée avant de renvoyer le cycle de vie de la mise à jour toujours acceptée. Configurez ce budget par défaut ici :

```env
DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS=10
DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS=50
```

La configuration `workflows.php` publiée associe ces valeurs ici :

```php
'v2' => [
    'update_wait' => [
        'completion_timeout_seconds' => (int) env('DW_V2_UPDATE_WAIT_COMPLETION_TIMEOUT_SECONDS', 10),
        'poll_interval_milliseconds' => (int) env('DW_V2_UPDATE_WAIT_POLL_INTERVAL_MS', 50),
    ],
],
```

`completion_timeout_seconds` définit combien de temps `attemptUpdate*` et les attentes HTTP de fin essaient d’obtenir un résultat appliqué par un worker avant de renvoyer un cycle de vie accepté plutôt que de bloquer indéfiniment. `poll_interval_milliseconds` règle uniquement la fréquence à laquelle l’appelant vérifie la ligne durable de mise à jour pendant l’attente. Il ne modifie ni l’ordre d’exécution des workers ni la relecture. Les métriques opérateur de Waterline affichent les valeurs actives de `update_wait` à côté de la politique de réparation, pour montrer la valeur par défaut effective sans ouvrir les fichiers de configuration.

## Masquage des exports d’historique {#history-export-redaction}

Les exports d’historique incluent par conception les données stockées des workflows, commandes, activités, mises à jour, tâches et échecs, car le débogage par relecture et le transfert d’archives nécessitent des faits durables. Si ces artefacts peuvent quitter un environnement protégé, configurez un outil de masquage avant d’exposer largement le point de terminaison d’export ou la sortie CLI.

Créez un outil de masquage implémentant `Workflow\V2\Contracts\HistoryExportRedactor` :

```php
namespace App\Support;

use Workflow\V2\Contracts\HistoryExportRedactor;

final class WorkflowHistoryExportRedactor implements HistoryExportRedactor
{
    public function redact(mixed $value, array $context): mixed
    {
        return [
            'redacted' => true,
            'path' => $context['path'],
        ];
    }
}
```

Puis enregistrez-le dans `config/workflows.php` :

```php
'v2' => [
    'history_export' => [
        'redactor' => App\Support\WorkflowHistoryExportRedactor::class,
        'signing_key' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY'),
        'signing_key_id' => env('DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID'),
    ],
],
```

L’outil reçoit la valeur courante et un contexte tel que `path`, `category`, `workflow_instance_id`, `workflow_run_id` et `workflow_type`. L’export l’appelle pour les arguments et résultats du workflow, les données d’événements d’historique, les données et contextes de commandes, les données de mises à jour, de tâches et d’activités, ainsi que les diagnostics de message, fichier et trace des échecs. Le paquet obtenu inclut `redaction.applied`, `redaction.policy` et `redaction.paths` pour que les outils en aval identifient la politique appliquée.

Chaque export inclut aussi un bloc `integrity` calculé après masquage. La somme de contrôle utilise `canonicalization = json-recursive-ksort-v1` et `checksum_algorithm = sha256`. Si `signing_key` est configuré, les mêmes données canoniques sont signées avec `signature_algorithm = hmac-sha256` et le `signing_key_id` facultatif est indiqué comme `key_id`. Conservez la clé de signature hors de l’artefact exporté et renouvelez son identifiant lorsque les vérificateurs en aval doivent distinguer les clés.
