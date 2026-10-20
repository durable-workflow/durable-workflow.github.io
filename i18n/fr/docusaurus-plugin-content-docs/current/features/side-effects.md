---
sidebar_position: 7
---

# Effets de bord {#side-effects}

Un effet de bord est une fermeture contenant du code non déterministe. La fermeture est exécutée une seule fois et son résultat est enregistré. Si le workflow est réessayé, elle ne s’exécute plus et renvoie le résultat enregistré. Le workflow devient ainsi déterministe : sa relecture renvoie toujours la même valeur stockée au lieu de réexécuter le code non déterministe.

```php
use function Workflow\V2\await;
use function Workflow\V2\sideEffect;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Workflow;

#[Signal('finish')]
class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        $token = sideEffect(fn () => random_int(1000, 9999));
        $finish = await('finish');

        return compact('token', 'finish');
    }
}
```

Le workflow appelle `random_int()` une seule fois et enregistre le résultat, même s’il échoue ensuite et est réessayé.

## Quand utiliser les effets de bord {#when-to-use-side-effects}

Utilisez `sideEffect()` pour une valeur non déterministe qui :

- est calculée localement sans E/S externes (nombres aléatoires, UUID, horodatages)
- ne doit plus changer une fois enregistrée, même entre relectures
- ne nécessite pas de nouvelle tentative, car la fermeture s’exécute exactement une fois

```php
// Generate a correlation token for downstream systems.
$correlationId = sideEffect(fn () => (string) Str::uuid());

// Snapshot the current time for a business rule.
$decidedAt = sideEffect(fn () => now()->toIso8601String());
```

## Quand utiliser plutôt une activité {#when-to-use-an-activity-instead}

Si le code peut échouer, communique avec un service externe ou nécessite de nouvelles tentatives ou des délais d’expiration, utilisez une [activité](../defining-workflows/activities.md) plutôt qu’un effet de bord :

| Situation | Utiliser |
|---|---|
| Générer un jeton aléatoire | `sideEffect()` |
| Lire une valeur de configuration au moment d’une décision | `sideEffect()` |
| Appeler une API externe | `activity()` |
| Écrire dans une base de données | `activity()` |
| Envoyer un e-mail ou une notification | `activity()` |
| Calculer une valeur coûteuse susceptible de lever une exception | `activity()` |

Règle pratique : si la fermeture peut lever une exception après laquelle vous voudriez réessayer, placez-la dans une activité.

## Fonctionnement {#how-it-works}

- chaque appel à `sideEffect()` ajoute un événement d’historique typé `SideEffectRecorded` avec la séquence de l’étape du workflow
- la relecture du workflow et celle des requêtes de lecture réutilisent cette valeur validée au lieu de réexécuter la fermeture
- Waterline expose l’instantané comme une entrée d’historique typée dans la chronologie de l’exécution sélectionnée
- les effets de bord restent réservés aux instantanés sûrs à relire, pas au travail susceptible d’échouer ou nécessitant de nouvelles tentatives

## Pratiques à éviter {#anti-patterns}

**N’appelez pas de services externes dans un effet de bord.** Si l’appel échoue, l’effet de bord ne sera pas réessayé et le workflow échouera définitivement :

```php
// BAD: HTTP calls can fail and side effects do not retry.
$price = sideEffect(fn () => Http::get('/api/price')->json('amount'));

// GOOD: Use an activity for external calls.
$price = activity(FetchPriceActivity::class);
```

**Ne placez pas d’opérations lentes ou bloquantes dans un effet de bord.** La fermeture s’exécute sur le fil de la tâche de workflow. Un travail long retarde toute la tâche :

```php
// BAD: Expensive computation blocks the workflow task.
$hash = sideEffect(fn () => bcrypt($largePayload));

// GOOD: Offload heavy work to an activity.
$hash = activity(ComputeHashActivity::class, $largePayload);
```

**Ne dépendez pas d’un état externe mutable.** La fermeture s’exécute exactement une fois. Si vous lisez une valeur qui évolue, l’instantané est figé au moment de la première exécution, pas au moment de la relecture :

```php
// The cached value is whatever it was during the first execution.
// If the cache changes later, this workflow still sees the old value.
$setting = sideEffect(fn () => cache('feature.flag'));
```

Ce comportement est voulu : l’instantané est délibérément figé pour préserver le déterminisme. Si une valeur doit évoluer pendant la vie du workflow, utilisez un signal ou une activité.

## Exécuter ce modèle {#run-this-pattern}

Le workflow de temps écoulé de la [Sample App](/docs/sample-app) est la référence
exécutable pour encapsuler les lectures d’horloge dans `sideEffect()` :

```bash
php artisan app:elapsed
```

`App\Workflows\Elapsed\ElapsedTimeWorkflow` enregistre les horodatages de début
et de fin sous forme d’entiers dans des fonctions de rappel `sideEffect()` pour
que la valeur survive au décodage Avro lors de la relecture. Les détails
Waterline montrent deux événements `MarkerRecorded` encadrant le déclenchement
du temporisateur. Cette paire de marqueurs constitue la preuve persistée que
les lectures d’horloge sont restées déterministes.
