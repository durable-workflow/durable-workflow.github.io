---
sidebar_position: 4
---

# Transmettre des données {#passing-data}

Vous pouvez transmettre des données à un workflow via la méthode `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

Les arguments sont transmis à la méthode `handle()` du workflow.

De la même manière, vous pouvez transmettre des données à une activité via la fonction utilitaire `activity()`.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

Les arguments sont transmis à la méthode `handle()` de l’activité.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

En général, ne transmettez que de petites quantités de données de cette façon. Pour des volumes importants, écrivez les données dans une base de données, un cache ou le système de fichiers. Transmettez ensuite la clé ou le chemin du fichier au workflow et aux activités. Les activités pourront utiliser cette référence pour lire les données.

Lorsque l’application doit transporter des volumes importants dans l’historique, comme des documents, des objets multimédias ou des exports sérialisés, activez le [stockage externe des données utiles](../features/external-payload-storage.md) sur l’espace de noms. Le runtime décharge les données dépassant le seuil vers un stockage objet configuré et enregistre une enveloppe de référence vérifiable dans l’historique. Il préserve ainsi l’intégrité de la relecture tout en respectant la [limite structurelle `payload_size_bytes`](../constraints/structural-limits.md#payload-size).

## Résultat {#output}

Une fois le workflow terminé, récupérez son résultat avec la méthode `output()`.

```php
$workflow->output();
=> 'Hello, world!'
```

## Modèles {#models}

La transmission de modèles fonctionne de manière similaire à `SerializesModels`.

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

Lorsqu’un modèle Eloquent est transmis à un workflow ou à une activité, seul son `ModelIdentifier` est sérialisé. Cela réduit la taille des données utiles et préserve l’efficacité et les performances des workflows.

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

Lors de son exécution, le workflow ou l’activité récupère l’instance complète du modèle dans la base de données, avec les relations chargées. Pour éviter des appels supplémentaires à la base de données pendant l’exécution, envisagez de convertir le modèle en tableau avant de le transmettre.

## Injection de dépendances {#dependency-injection}

En plus de transmettre des données, vous pouvez déclarer les types des dépendances dans les méthodes `handle()` des workflows ou des activités. Le conteneur de services Laravel injecte automatiquement ces dépendances.

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

L’injection de dépendances n’assouplit pas les exigences de déterminisme du
workflow. Un workflow peut déclarer les types de services stables, comme le
conteneur d’application Laravel ou des lecteurs de configuration. Les dépendances
injectées qui effectuent du travail doivent toutefois respecter la bonne
frontière de persistance. Placez les entrées-sorties externes, les accès à la
base de données, les appels de services et les autres opérations susceptibles
d’échouer ou de nécessiter une nouvelle tentative dans `activity(...)` ou
`localActivity(...)`. Réservez `sideEffect()` à la capture ponctuelle d’une
valeur sûre pour la relecture et figée dans l’historique, comme une lecture de
l’horloge système, une valeur aléatoire générée ou une valeur de configuration
capturée au moment d’une décision.
