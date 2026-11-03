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

Les données utiles V2 utilisent un format de valeurs portable. Un modèle Eloquent ne peut donc pas être un argument ou un résultat de workflow ou d’activité. Transmettez la clé du modèle et chargez le modèle dans l’activité qui l’utilise.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

Chargez les modèles dans les activités, pas dans le code du workflow. Le code du workflow est rejoué lors de la relecture, et une requête à la base de données peut renvoyer d’autres lignes lors d’une relecture ultérieure.

Transmettre un modèle à `start()` lève une `InvalidArgumentException`. Transmettre un modèle à `activity()` fait échouer l’exécution du workflow. Les deux messages d’erreur commencent par `unsupported_value_type`.

La même règle s’applique aux collections Eloquent. Transmettez plutôt un tableau de clés. Si l’activité n’a besoin que de quelques attributs, transmettez uniquement ces valeurs sous forme de tableau. L’historique du workflow les conserve : n’y incluez jamais d’identifiants de connexion ni d’autres secrets.

En v1, les workflows et les activités recevaient les modèles via `SerializesModels`, qui stockait un identifiant de modèle et rechargeait le modèle à l’exécution du job. V2 ne le fait pas.

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
