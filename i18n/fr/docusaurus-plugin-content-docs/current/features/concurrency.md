---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Concurrence {#concurrency}

Ce guide couvre la concurrence dans les workflows Laravel intégrés utilisant
`Workflow\V2\Workflow`. Pour les workers en mode service, consultez le
[guide du SDK PHP](https://php.durable-workflow.com/build/workflows-activities/), le
[guide du SDK Python](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups) ou la
[référence du SDK Rust](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel).

`all([...])` décrit le groupe durable complet avant suspension. Le runtime
intégré programme ses commandes d’activité et de workflow enfant, puis renvoie
les résultats dans la structure imbriquée d’entrée initiale.

Utilisez un groupe de sélection si la progression dépend du premier membre
terminé plutôt que de la barrière entière. La sélection est elle aussi durable :
elle démarre tous les membres, enregistre un gagnant et laisse les autres actifs
jusqu’à ce que le code les attende ou les annule explicitement.

## En série {#series}

Cet exemple exécute 3 activités en série et attend la fin de chacune avant de passer à la suivante.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Simulateur d’exécution en série"
/>

## En parallèle {#parallel}

Cet exemple exécute 3 activités en parallèle, attend leur achèvement à toutes et collecte les résultats.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulateur d’exécution en parallèle"
/>

La différence principale tient au moment de la suspension. En série, chaque appel `activity()` suspend et reprend directement le workflow. En parallèle, les fermetures décrivent d’abord la barrière entière et `all()` suspend une seule fois pour le groupe complet. Tous les membres peuvent ainsi s’exécuter en parallèle avant la reprise du workflow.

## Sélection du premier achèvement {#first-completion-selection}

`select([...])` démarre des activités indépendantes, workflows enfants,
temporisateurs, attentes de signal ou de condition, ou barrières ordinaires
imbriquées, et reprend lorsqu’un membre valide un résultat éligible ou un échec
typé. Donnez aux membres des clés applicatives stables si le code ultérieur doit
les distinguer ou y revenir. Ces clés doivent être des chaînes non vides ou des
entiers positifs ou nuls.

Le coordinateur suivant démarre son échéance à la même étape durable que le
résolveur. Le traitement des entrées et la progression du résolveur ne peuvent
ni réinitialiser ni repousser cette échéance :

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

Le résultat contient la clé stable et l’indice du membre, le type d’opération
et son identité durable, le résultat ou l’échec typé, la référence du gagnant
et une référence par membre. Une référence non gagnante peut être attendue
plus tard avec `await()` ou annulée avec `cancel()`. La sélection n’abandonne
ni n’annule implicitement un membre frère. `cancel()` est une demande sans
valeur de retour et n’indique jamais si l’annulation a gagné. L’historique
`SelectionOperationCancelled` fait autorité. Si l’achèvement est validé en
premier, le runtime n’écrit aucun marqueur d’annulation. La relecture ne dépasse
l’appel d’annulation qu’après qu’une limite de tâche validée, une commande
suivante ou un événement terminal prouve que l’absence d’effet a été validée.
La relecture de requête s’arrête sur une annulation en cours au lieu d’exposer
un état spéculatif après celle-ci. Attendre la référence après l’absence d’effet
validée renvoie l’achèvement antérieur.

Le runtime enregistre la première résolution éligible sous le verrou de validation
du parent. Un redémarrage à froid, le rechargement de l’historique persisté,
la relecture de requête et les achèvements ultérieurs des perdants réutilisent
donc le gagnant enregistré au lieu de mettre en concurrence les futures locales
du langage ou de réinterpréter l’ordre historique. Une livraison exactement
identique est idempotente. Les entrées concurrentes sont ordonnées selon leur
historique durable validé. Une entrée arrivant pendant une activité est visible
à la prochaine tâche de workflow ; une entrée tardive ou dupliquée ne remplace
pas un gagnant déjà enregistré.

## Barrières imbriquées {#nested-barriers}

Les groupes `all([...])` imbriqués expriment dans une étape un arbre de travail durable distribué puis regroupé. Le runtime programme chaque activité ou enfant comme une séquence feuille durable, enregistre son `parallel_group_path` complet, attend que chaque barrière englobante puisse avancer puis reconstruit la structure imbriquée initiale avant de reprendre le workflow. À la relecture, une feuille d’activité ou d’enfant d’une étape `all([...])` doit toujours correspondre au chemin enregistré. Un historique typé de feuille sans métadonnées de groupe est traité comme un ancien historique de préversion incompatible, sans rattachement supposé à la barrière actuelle.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

Dans cet exemple, Waterline expose trois attentes feuilles ouvertes, pas une attente « imbriquée » synthétique. La première appartient uniquement à la barrière externe ; les deuxième et troisième exposent un `parallel_group_path` à deux entrées pour montrer aux opérateurs le groupe externe et le sous-groupe interne encore ouvert.

La taille du groupe externe compte les feuilles durables, pas les tableaux
imbriqués. Chaque feuille porte un `parallel_group_path` de l’extérieur vers
l’intérieur ; chaque entrée conserve la même position durable de workflow.
Le groupe programme toutes les feuilles avant suspension puis assemble les
valeurs réussies selon leur position d’entrée. Le redémarrage d’un worker et la
relecture de l’historique terminé reconstruisent la même identité de groupe.
Une livraison terminale exactement dupliquée est ignorée. Un achèvement tardif
d’un frère peut enrichir les diagnostics partiels sans modifier le membre en
échec déjà choisi par la politique déterministe du runtime intégré.

Le runtime intégré lève l’échec typé de la feuille depuis `all()` et conserve
les métadonnées durables du groupe dans l’historique et les vues opérateur.

## Fonction de rappel asynchrone {#async-callback}

`async(...)` exécute une fonction de rappel sérialisable comme workflow enfant durable de type système `durable-workflow.async`. Ces fonctions suivent le même contrat séquentiel que les workflows v2 nommés : `activity()`, `await()`, `timer()`, `sideEffect()` et les autres fonctions d’étape suspendent directement dans leur corps sans imposer `yield`.

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

Le parent voit la fonction de rappel comme une attente d’enfant. L’historique des commandes, la filiation et les détails Waterline utilisent donc les mêmes `child_call_id`, identifiant d’exécution enfant et historique de résultat qu’un appel explicite `child(...)`. La fonction est sérialisée avec la prise en charge des fermetures sérialisables Laravel : gardez-la locale à l’application et au déploiement. Utilisez un appel nommé `child(SomeWorkflow::class, ...)` si le travail nécessite un type public stable pour le routage interservices ou l’évolution durable du code. Les fonctions de rappel `async(...)` sont uniquement séquentielles en v2 : appelez directement `activity()`, `child()`, `await()`, `timer()` et `all([...])` sans `yield`.

## Barrières mixtes activité + enfant {#mixed-activity--child-barriers}

La même fonction `all()` peut regrouper activités et workflows enfants. Les résultats reviennent dans l’ordre initial du tableau, les membres réussis attendent le reste du groupe et le premier membre en échec réveille immédiatement le parent.

Si plusieurs membres se sont déjà clôturés sans succès lorsque le parent relit l’historique, il reçoit l’échec dont l’heure de clôture enregistrée est la plus ancienne. En cas d’égalité, l’indice de feuille le plus faible gagne. La reprise et la relecture de requête choisissent ainsi la même exception. Les échecs ultérieurs des frères ne remplacent pas l’exception déjà propagée dans l’étape parente.

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## Limites actuelles {#current-limits}

L’interface actuelle de concurrence n’inclut pas encore :

- de fonctions intégrées de concurrence bornée au-delà des groupes `all([...])` explicitement imbriqués

## Workflows enfants en parallèle {#child-workflows-in-parallel}

Les workflows enfants peuvent s’exécuter dans leur propre barrière `all([...])`. Le fonctionnement est celui des activités parallèles, appliqué aux enfants : le parent lance durablement plusieurs exécutions enfants et ne reprend que lorsque toute la barrière peut avancer.

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulateur de workflows enfants en parallèle"
/>

Vous pouvez ainsi construire un parallélisme hiérarchique, avec des groupes imbriqués réservés aux enfants ou mêlant enfants et activités si une étape parente nécessite plusieurs niveaux de regroupement.
