---
sidebar_position: 6
---

# Identifiant du workflow {#workflow-id}

## Identifiants d’instance et d’exécution {#instance-ids-and-run-ids}

Un workflow durable possède deux identifiants dont les cycles de vie diffèrent :

- L’**identifiant d’instance** (`id()`, `workflowId()`) est la référence publique stable du workflow. Il est généré au premier démarrage du workflow, ou fourni par l’appelant, et ne change jamais pendant sa durée de vie, y compris dans les chaînes de continuation avec une nouvelle exécution.
- L’**identifiant d’exécution** (`runId()`) désigne une génération d’exécution précise de ce workflow. Un nouvel identifiant est attribué à chaque création d’exécution, lors du premier démarrage et de chaque continuation avec une nouvelle exécution.

Utilisez l’identifiant d’instance comme référence publique pour les appels. L’identifiant d’exécution désigne une génération précise pour l’inspection, le débogage ou l’audit. Les appelants du plan de contrôle ne doivent pas le suivre à long terme.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);

$id = $workflow->id();

$workflow->start();

$runId = $workflow->runId();
```

Utilisez l’identifiant d’instance pour une référence publique stable au workflow. Utilisez l’identifiant d’exécution pour inspecter une exécution précise.

## Cycle de vie de l’identifiant d’exécution {#run-id-lifecycle}

Un identifiant d’exécution désigne une génération d’exécution. Chaque génération d’un workflow v2 possède le sien, et un même identifiant d’instance peut couvrir de nombreuses générations au fil du temps :

- Un premier appel à `start()` crée la première exécution et son identifiant.
- `continueAsNew(...)` clôture l’exécution courante avec `completed` / `continued` et démarre une nouvelle exécution, dotée d’un nouvel identifiant, sous le même identifiant d’instance. Consultez la [continuation avec une nouvelle exécution](/docs/features/continue-as-new).

Comme l’identifiant d’exécution appartient à une génération précise, les appelants qui souhaitent un comportement durable à travers ces transitions doivent résoudre la cible par identifiant d’instance :

- Les signaux, requêtes de lecture, mises à jour et commandes d’opérateur ciblent toujours l’exécution durable la plus récente de l’instance. Les appelants n’ont pas besoin de suivre les identifiants d’exécution lors des continuations avec une nouvelle exécution.
- Les outils qui ciblent une génération précise, comme la vue de détail d’exécution de Waterline, un export d’historique ou un débogueur de relecture, acceptent un identifiant d’exécution explicite afin d’inspecter une exécution isolément.

L’identifiant d’exécution est exposé par `runId()` dans le code des workflows et des activités, et par les champs `workflow_run_id` / `run_id` dans l’historique, les projections et les exports. Il correspond toujours à la génération à laquelle appartient l’événement ou la ligne. Un identifiant enregistré dans un ancien événement d’historique ne correspond donc pas nécessairement à l’identifiant d’exécution courant de la même instance.

## Identifiants d’instance définis par l’utilisateur {#user-defined-instance-ids}

Au démarrage d’un workflow, vous pouvez préciser son identifiant. Les identifiants définis par l’utilisateur doivent être des chaînes compatibles avec les URL, de 191 caractères maximum, composées uniquement de lettres, chiffres, `.`, `_`, `-` et `:`.

```php
$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');
```

Vous pouvez ensuite charger le workflow à l’aide de cet identifiant personnalisé.

```php
$workflow = WorkflowStub::load('order-123');
```

### Choisir un identifiant fourni par l’appelant {#choosing-a-caller-supplied-id}

Choisissez un identifiant qui désigne toujours la même opération métier.
Réutilisez-le lors d’une nouvelle tentative du même démarrage. Générez-en un
nouveau pour une opération différente. Ajoutez un préfixe indiquant le type de
workflow et, si nécessaire, une référence opaque au locataire pour éviter les
collisions entre applications partageant le même stockage. Par exemple,
`order:tenant-7f2:01J9Z6K6Z2EPV5G0C3R8F4M9AN` combine ces préfixes avec un
identifiant résistant aux collisions. Un préfixe de locataire est une convention
de nommage, sans constituer une frontière d’autorisation. Configurez séparément
l’isolation des espaces de noms.

L’identifiant ne remplace pas la [politique de démarrage en double](../configuration/options.md).
Par défaut, un démarrage en double est refusé. `ReturnExistingActive` peut
retourner le workflow actif existant sans démarrer une autre exécution ni
remplacer ses arguments initiaux. L’identifiant d’une instance terminée reste
réservé. Changer le type de workflow ne le rend pas de nouveau disponible.

### Les identifiants sont des métadonnées visibles {#ids-are-visible-metadata}

Les identifiants d’instance apparaissent en clair dans Waterline, les URL, les
sorties CLI, les journaux, les exports d’historique et la base de données. Les
codecs de données utiles, y compris le chiffrement, ne couvrent pas ces
identifiants. Utilisez des références opaques plutôt que des adresses e-mail,
des noms, des jetons d’accès ou d’autres données personnelles ou secrètes.
Conservez les détails métier sensibles dans les champs de données utiles
protégés par la politique de traitement des données de votre application.
Un identifiant impossible à deviner ne remplace pas l’autorisation.

## Accéder aux identifiants dans les activités et les workflows {#accessing-ids-inside-activities-and-workflows}

Dans une activité :

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(): void
    {
        $id = $this->workflowId();
        $runId = $this->runId();
    }
}
```

Dans un workflow, `$this->workflowId()` retourne l’identifiant d’instance et `$this->runId()` retourne l’identifiant de l’exécution sélectionnée pour l’exécution en cours.
