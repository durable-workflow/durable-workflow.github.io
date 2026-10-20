---
sidebar_position: 11
title: Sagas
description: Compensez les activités d’un workflow Laravel, avec ordre inverse, exécution parallèle et échéances applicatives.
---

# Sagas {#sagas}

Ce guide décrit la compensation des workflows Laravel intégrés qui utilisent `Workflow\V2\Workflow`. Pour les workers en mode service, consultez le [guide SDK PHP](https://php.durable-workflow.com/build/workflows-activities/), le [guide SDK Python](https://python.durable-workflow.com/sdk-reference/#saga-compensation) ou la [référence SDK Rust](https://rust.durable-workflow.com/durable_workflow/struct.Saga.html).

Les sagas sont un modèle éprouvé pour gérer des opérations complexes et longues :

- Une saga gère une transaction distribuée comme une suite de transactions locales.
- Une transaction locale est une unité de travail exécutée par un participant à la saga, une activité.
- Chaque opération de la saga peut être inversée par une activité de compensation.
- Le code du workflow décide quand invoquer la compensation. Celle-ci peut échouer et nécessite du temps ainsi que des workers disponibles.

```php
use function Workflow\V2\activity;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('booking-saga')]
class BookingSagaWorkflow extends Workflow
{
    public function handle(): array
    {
        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            $carId = activity(BookRentalCarActivity::class);
            $this->addCompensation(fn () => activity(CancelRentalCarActivity::class, $carId));

            return compact('flightId', 'hotelId', 'carId');
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

Lorsque le workflow intercepte une exception, `$this->compensate()` exécute chaque compensation enregistrée dans l’**ordre inverse**. Dans cet exemple, si `BookRentalCarActivity` échoue, le moteur annule d’abord l’hôtel, puis le vol, en remontant les étapes de la saga depuis la plus récente.

Enregistrez chaque compensation après la réussite de l’activité correspondante. La relecture reconstruit cet ordre et réutilise les résultats d’activité enregistrés, y compris les compensations terminées.

## Compensation déclenchée par une échéance {#deadline-driven-compensation}

Une [expiration du workflow imposée par le moteur](./timeouts.md#timeout-outcome-and-cleanup) ferme le run avant que le code puisse exécuter la compensation. Un bloc `catch` ou `finally` ne change pas ce comportement. Les commandes immédiates `cancel()` et `terminate()` n’offrent pas non plus de fenêtre de nettoyage.

Utilisez une échéance applicative plus courte si l’expiration doit annuler du travail déjà effectué. Ce workflow intégré réserve une ressource, puis attend un signal de confirmation pendant au plus 30 secondes. L’expiration reprend le code, qui libère la réservation avant de renvoyer le résultat métier `expired` :

```php
use function Workflow\V2\{activity, await};
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;

#[Type('reservation-deadline')]
#[Signal('confirm')]
final class ReservationDeadlineWorkflow extends Workflow
{
    public function handle(string $orderId): array
    {
        $reservationId = activity(
            ReserveResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $orderId,
        );
        $this->addCompensation(fn () => activity(
            ReleaseResourceActivity::class,
            new ActivityOptions(scheduleToCloseTimeout: 30),
            $reservationId,
        ));

        if (await('confirm', timeout: 30) === null) {
            $this->compensate();

            return ['status' => 'expired'];
        }

        return ['status' => 'confirmed'];
    }
}
```

`ReserveResourceActivity` et `ReleaseResourceActivity` sont des activités de votre application. Rendez-les idempotentes avec une clé métier stable pour la réservation. L’attente commence après la réussite de la réservation. Envoyez `confirm` sans arguments pour que son résultat réussi soit `true`. `null` signifie que l’attente a expiré.

Démarrez-le avec une limite moteur plus longue comme dernier recours :

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(ReservationDeadlineWorkflow::class, 'order-123');
$workflow->start(
    'order-123',
    StartOptions::rejectDuplicate()->withRunTimeout(300),
);

// From an authenticated application action, before the wait expires:
WorkflowStub::load('order-123')->signal('confirm');
```

Une attente expirée avec compensation réussie se termine normalement avec `status: expired` dans le résultat. Ce n’est pas un run expiré par le moteur. Si l’activité de libération échoue, `compensate()` propage cet échec. Si l’échéance moteur arrive d’abord, le run ferme et les compensations restantes ne peuvent plus s’exécuter. Prévoyez suffisamment de temps pour la planification et les nouvelles tentatives, en tenant compte d’une éventuelle échéance d’exécution globale plus proche.

L’opération coopérative distincte `requestCancellation()` permet un nettoyage demandé par l’appelant pendant qu’un run est actif. Utilisez son bouclier d’annulation borné pour effectuer un nettoyage durable sous une demande d’annulation. Elle n’est pas déclenchée automatiquement par l’expiration d’un workflow. Voir [Annulation coopérative](../polyglot/cancellation.md).

## Ordre des compensations {#compensation-ordering}

Par défaut, les compensations s’exécutent **séquentiellement dans l’ordre inverse de leur enregistrement**. Ce choix protège les dépendances possibles des étapes récentes envers les précédentes.

Par défaut, `compensate()` s’arrête au premier échec de compensation et le propage à l’appelant.

## Compensation parallèle {#parallel-compensation}

Pour exécuter les compensations en parallèle, utilisez `setParallelCompensation(true)`. Chaque closure doit alors renvoyer un appel d’activité démarré mais non attendu, afin que le moteur puisse les exécuter simultanément :

```php
use function Workflow\V2\activity;

use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('parallel-saga')]
class ParallelSagaWorkflow extends Workflow
{
    public function handle(): void
    {
        $this->setParallelCompensation(true);

        try {
            $flightId = activity(BookFlightActivity::class);
            $this->addCompensation(fn () => activity(CancelFlightActivity::class, $flightId));

            $hotelId = activity(BookHotelActivity::class);
            $this->addCompensation(fn () => activity(CancelHotelActivity::class, $hotelId));

            activity(ChargePaymentActivity::class);
        } catch (\Throwable $e) {
            $this->compensate();

            throw $e;
        }
    }
}
```

En mode parallèle, les closures de compensation renvoient des appels d’activité que le moteur regroupe et exécute avec `all()`.

## Poursuivre malgré une erreur {#continue-with-error}

Par défaut, une exception d’activité de compensation interrompt les compensations restantes et se propage. Pour les exécuter toutes malgré les échecs individuels, utilisez `setContinueWithError(true)` :

```php
$this->setContinueWithError(true);
```

Lorsque cette option est active, le moteur intercepte et ignore les exceptions de chaque closure, puis poursuit avec la suivante. Utilisez-la si les compensations sont indépendantes et si vous voulez tenter le nettoyage même en cas d’échec de certaines étapes.

### Combiner les deux options {#combining-both-flags}

`setParallelCompensation(true)` et `setContinueWithError(true)` peuvent être combinés. Toutes les compensations s’exécutent alors simultanément avec `all()`. Une exception est interceptée afin que les autres compensations se terminent. Sans `setContinueWithError(true)`, un échec parallèle se propage immédiatement et le workflow échoue.

```php
$this->setParallelCompensation(true);
$this->setContinueWithError(true);
```

## Fonctionnement {#how-it-works}

- `addCompensation()` enregistre une fonction appelable pour `compensate()`
- `compensate()` parcourt les compensations enregistrées dans l’ordre inverse
- Chaque closure est une étape normale de workflow V2. Ses activités produisent des événements d’historique durables comme toute activité
- Les activités de compensation apparaissent dans la chronologie Waterline et les exports d’historique
- Si le workflow réussit, les closures ne sont jamais appelées et ne produisent aucun historique

## Exécuter cet exemple {#run-this-pattern}

La saga d’agent de voyage pilotée par signaux de l’[application exemple](/docs/sample-app) est la référence exécutable de cette page. Clonez l’application, définissez `OPENAI_API_KEY`, puis lancez :

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` enregistre une compensation pour chaque activité de réservation. Un échec de vol après une réservation d’hôtel réussie annule donc l’hôtel via la liste des compensations. C’est le même modèle que ci-dessus, dont les événements sont visibles dans la chronologie Waterline du run.
