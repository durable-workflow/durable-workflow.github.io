---
sidebar_position: 6
title: API des workflows
sidebar_label: API des workflows
description: Référence de l’API des workflows.
tags:
  - reference
  - workflows
  - api
keywords:
  - API des workflows
---

# API des workflows {#workflow-api}

Cette page fournit la référence complète. Pour une présentation plus facile à lire, consultez les pages de chaque fonctionnalité.

- Les [workflows](./workflows.md) pour la structure des classes et le modèle d’orchestration déterministe.
- Les [activités](./activities.md) pour les effets de bord, les nouvelles tentatives et le routage.
- Les [activités locales](../features/local-activities.md) pour de courtes opérations dans le même processus, avec historique d’activité et nouvelles tentatives.
- Les [signaux](../features/signals.md), [mises à jour](../features/updates.md) et [requêtes de lecture](../features/queries.md) pour les contrats exposés par les workflows.
- Les [temporisateurs](../features/timers.md), [attentes conditionnelles](../features/condition-waits.md) et [continuations avec une nouvelle exécution](../features/continue-as-new.md) pour le contrôle des exécutions longues.
- Les [flux de messages](../features/message-streams.md) pour les messages répétés et ordonnés avec gestion d’un curseur.

## Informations complémentaires pour l’IA {#more-info-for-ai}

La plupart des lecteurs peuvent ignorer le panneau ci-dessous. Ouvrez-le pour consulter les signatures exactes, les contrats de retour, les notes exploitables par machine ou toute l’API au même endroit.

<details id="workflow-api-details">
<summary><b>Informations complémentaires pour l’IA</b></summary>

**Objet de base du workflow**

```php
use Workflow\V2\Workflow;

abstract class Workflow
{
    public ?string $connection = null;
    public ?string $queue = null;

    public function workflowId(): string;
    public function runId(): string;
    public function lastChild(): ?ChildWorkflowHandle;
    public function children(): array;
    public function historyLength(): int;
    public function historySize(): int;
    public function shouldContinueAsNew(): bool;
}
```

| Membre | Quand l’utiliser | Contrat de retour |
| --- | --- | --- |
| `workflowId()` | Le workflow a besoin de son identifiant public stable d’instance. | Identifiant d’instance sous forme de chaîne, inchangé lors des continuations avec une nouvelle exécution. |
| `runId()` | Le workflow a besoin de l’identifiant de l’exécution en cours. | Identifiant de l’exécution sélectionnée sous forme de chaîne. |
| `lastChild()` | Le workflow doit envoyer un signal au dernier enfant créé. | `ChildWorkflowHandle` ou `null`. |
| `children()` | Le workflow a besoin des handles des enfants visibles dans la séquence de relecture actuelle. | Liste de `ChildWorkflowHandle`. |
| `historyLength()` | Le workflow a besoin d’un indicateur de budget d’historique basé sur le nombre d’événements. | Nombre actuel d’événements d’historique. |
| `historySize()` | Le workflow a besoin d’un indicateur de budget d’historique en octets. | Taille approximative de l’historique persistant en octets. |
| `shouldContinueAsNew()` | Le workflow doit passer à une nouvelle exécution avant que l’historique devienne coûteux. | `true` lorsque les budgets d’historique configurés recommandent une rotation. |

## Commandes durables {#durable-commands}

La façade statique délègue aux fonctions de l’espace de noms `Workflow\V2`. Les deux formes sont équivalentes :

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

$resultFromFacade = Workflow::activity(SendReceipt::class, $orderId);
$resultFromHelper = activity(SendReceipt::class, $orderId);
```

<span id="durable-command-surface"></span>

| Façade | Fonction | Signature | Effet durable |
| --- | --- | --- | --- |
| `Workflow::activity()` | `activity()` | `activity(string $activity, mixed ...$arguments): mixed` | Planifie une activité et attend son résultat. |
| `Workflow::executeActivity()` | `activity()` | `executeActivity(string $activity, mixed ...$arguments): mixed` | Alias d’`activity()`. |
| `Workflow::localActivity()` | `localActivity()` | `localActivity(string $activity, mixed ...$arguments): mixed` | Exécute une courte activité dans le processus du worker de workflow courant et enregistre son historique avec `execution_mode=local`. |
| `Workflow::executeLocalActivity()` | `localActivity()` | `executeLocalActivity(string $activity, mixed ...$arguments): mixed` | Alias de `localActivity()`. |
| `Workflow::child()` | `child()` | `child(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Démarre un workflow enfant et attend son résultat. Transmettez `ChildWorkflowOptions` comme premier argument pour définir la politique de clôture du parent (`ParentClosePolicy::Abandon` par défaut) ou remplacer le routage de l’enfant. |
| `Workflow::executeChildWorkflow()` | `child()` | `executeChildWorkflow(string $workflow, ChildWorkflowOptions? $options = null, mixed ...$arguments): mixed` | Alias de `child()`. |
| `Workflow::async()` | `async()` | `async(callable $callback): mixed` | Exécute un callable sous forme de workflow enfant généré automatiquement. |
| `Workflow::all()` | `all()` | `all(iterable $calls): mixed` | Attend les appels concurrents et retourne les résultats dans l’ordre d’itération. |
| `Workflow::parallel()` | `all()` | `parallel(iterable $calls): mixed` | Alias d’`all()`. |
| `Workflow::select()` | `select()` | `select(iterable $calls): SelectionResult` | Démarre des appels durables indépendants et retourne le premier gagnant validé ainsi que des handles stables pour chaque membre. |
| `Workflow::await()` | `await()` | `await(callable\|string $condition, int\|string\|CarbonInterval\|null $timeout = null, ?string $conditionKey = null): mixed` | Attend un signal nommé ou une condition sûre pour la relecture. |
| `Workflow::awaitWithTimeout()` | `await()` | `awaitWithTimeout(int\|string\|CarbonInterval $timeout, callable\|string $condition, ?string $conditionKey = null): mixed` | Attend un signal ou une condition avec un délai d’expiration explicite. |
| `Workflow::awaitSignal()` | `await()` | `awaitSignal(string $name): mixed` | Attend un signal nommé. |
| `Workflow::timer()` | `timer()` | `timer(int\|string\|CarbonInterval $duration): mixed` | Suspend l’exécution jusqu’à l’avancement du temps durable. |
| `Workflow::sideEffect()` | `sideEffect()` | `sideEffect(callable $callback): mixed` | Enregistre un résultat non déterministe dans l’historique et le restitue lors de la relecture. |
| `Workflow::uuid4()` | `uuid4()` | `uuid4(): mixed` | Génère un UUIDv4 stable à la relecture. |
| `Workflow::uuid7()` | `uuid7()` | `uuid7(): mixed` | Génère un UUIDv7 stable à la relecture. |
| `Workflow::continueAsNew()` | `continueAsNew()` | `continueAsNew(mixed ...$arguments): mixed` | Termine l’exécution courante et en démarre une nouvelle pour la même instance. |
| `Workflow::getVersion()` | `getVersion()` | `getVersion(string $changeId, int $minSupported = WorkflowStub::DEFAULT_VERSION, int $maxSupported = 1): mixed` | Négocie une version du code de workflow sûre pour la relecture. |
| `Workflow::patched()` | `patched()` | `patched(string $changeId): mixed` | Indique si l’exécution a franchi un marqueur de correctif nommé. |
| `Workflow::deprecatePatch()` | `deprecatePatch()` | `deprecatePatch(string $changeId): mixed` | Maintient un marqueur de correctif après la suppression de l’ancien code. |
| `Workflow::upsertMemo()` | `upsertMemo()` | `upsertMemo(array $entries): void` | Met à jour les métadonnées non indexées de l’exécution. |
| `Workflow::upsertSearchAttributes()` | `upsertSearchAttributes()` | `upsertSearchAttributes(array $attributes): void` | Met à jour les métadonnées indexées visibles par l’opérateur. |
| `Workflow::now()` | `now()` | `now(): CarbonInterface` | Lit le temps déterministe du workflow. |

`activity()` et `executeActivity()` planifient des tâches d’activité durables en file d’attente. `localActivity()` et `executeLocalActivity()` s’exécutent dans le processus du worker de workflow courant et enregistrent un historique normal d’activité avec le marqueur local. Utilisez `sideEffect()` pour les instantanés sûrs pour la relecture qui ne doivent pas suivre les règles d’activité pour les nouvelles tentatives, les délais, les battements de cœur ou l’annulation. Utilisez `Workflow::workerSession()` ou `Workflow\V2\workerSession()` lorsque plusieurs étapes d’activité ordinaires nécessitent le contrat d’affinité pris en charge par les sessions de worker. Le [modèle d’exécution des activités](/docs/features/activity-execution-model), les [activités locales](/docs/features/local-activities) et les [sessions de worker](/docs/features/worker-sessions) décrivent le contrat complet.

**Fonctions de temporisation**

Les fonctions de temporisation sont des raccourcis de `timer()` et `Workflow::timer()` :

```php
use Workflow\V2\Workflow;

Workflow::seconds(30);
Workflow::minutes(5);
Workflow::hours(2);
Workflow::days(1);
Workflow::weeks(1);
Workflow::months(1);
Workflow::years(1);
```

| Fonction | Équivalent |
| --- | --- |
| `seconds(int $seconds)` | `timer($seconds)` |
| `minutes(int $minutes)` | `timer($minutes * 60)` |
| `hours(int $hours)` | `timer($hours * 3600)` |
| `days(int $days)` | `timer($days * 86400)` |
| `weeks(int $weeks)` | `timer($weeks * 604800)` |
| `months(int $months)` | `timer("{$months} months")` |
| `years(int $years)` | `timer("{$years} years")` |

Utilisez un appel explicite à `timer()` lorsque la durée vient de la configuration ou des entrées du workflow. Utilisez les fonctions de temporisation lorsque le code doit exprimer une attente métier fixe.

**Flux de messages**

Ouvrez des flux de messages durables depuis l’instance du workflow :

```php
use Workflow\V2\MessageStream;
use Workflow\V2\Workflow;

final class AssistantWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId): array
    {
        $message = $this->inbox('ai.user')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting'];
        }

        $reply = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: 'app://payloads/reply-123',
            correlationId: $this->workflowId(),
            idempotencyKey: 'reply-123',
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $reply->stream_key,
            'sequence' => $reply->sequence,
        ];
    }
}
```

| Méthode | Signature | Contrat |
| --- | --- | --- |
| `$this->messages()` | `messages(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Ouvre le flux pour lire ou envoyer des messages. |
| `$this->inbox()` | `inbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias pour le code de réception. |
| `$this->outbox()` | `outbox(?string $streamKey = null, ?MessageService $messages = null): MessageStream` | Alias pour le code d’envoi. |
| `MessageStream::key()` | `key(): string` | Retourne la clé du flux. |
| `MessageStream::cursor()` | `cursor(): int` | Retourne la position durable du curseur pour cette exécution. |
| `MessageStream::hasPending()` | `hasPending(): bool` | Indique si le flux contient des messages non consommés. |
| `MessageStream::pendingCount()` | `pendingCount(): int` | Retourne le nombre de messages non consommés du flux. |
| `MessageStream::peek()` | `peek(int $limit = 100): Collection` | Lit les messages en attente sans les consommer. |
| `MessageStream::receive()` | `receive(int $limit = 1, ?int $consumedBySequence = null): Collection` | Lit et consomme les messages en enregistrant l’avancement du curseur. |
| `MessageStream::receiveOne()` | `receiveOne(?int $consumedBySequence = null): ?WorkflowMessage` | Lit et consomme un message. |
| `MessageStream::sendReference()` | `sendReference(string $targetInstanceId, ?string $payloadReference = null, MessageChannel\|string $channel = MessageChannel::WorkflowMessage, ?string $correlationId = null, ?string $idempotencyKey = null, array $metadata = [], ?DateTimeInterface $expiresAt = null): WorkflowMessage` | Envoie à une autre instance de workflow un message ordonné portant une référence aux données utiles. |

Utilisez les flux de messages pour les messages répétés et ordonnés avec gestion d’un curseur. Utilisez les [signaux](../features/signals.md) pour les événements externes ponctuels et les [mises à jour](../features/updates.md) pour les mutations avec requête et retour.

**Attributs et contrats publics**

```php
use Workflow\QueryMethod;
use Workflow\UpdateMethod;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string', 'allows_null' => false],
])]
final class OrderApprovalWorkflow extends Workflow
{
    private string $stage = 'waiting';

    public function handle(): void
    {
        $this->stage = Workflow::awaitSignal('approved-by');
    }

    #[QueryMethod('current-stage')]
    public function currentStage(): string
    {
        return $this->stage;
    }

    #[UpdateMethod('mark-ready')]
    public function markReady(): string
    {
        return $this->stage = 'ready';
    }
}
```

| Attribut | Cible | Contrat stable |
| --- | --- | --- |
| `#[Type('type-key')]` | Classe de workflow ou d’activité | Déclare la clé de type durable indépendante du langage. |
| `#[Signal('signal-name', [...])]` | Classe de workflow, répétable | Déclare les noms des signaux acceptés et les contrats facultatifs des paramètres ordonnés. |
| `#[QueryMethod('query-name')]` | Méthode de workflow | Déclare un nom de requête de lecture sûr pour la relecture. Omettez-le pour utiliser le nom de la méthode PHP. |
| `#[UpdateMethod('update-name')]` | Méthode de workflow | Déclare un nom de mise à jour sûr pour la relecture. Omettez-le pour utiliser le nom de la méthode PHP. |

Les signaux, requêtes de lecture et mises à jour sont des contrats publics du workflow. Préférez des noms explicites pour que renommer une méthode PHP ne rompe pas l’API.

**Échecs de l’API**

Les échecs de l’API d’écriture sont des échecs durables de workflow, sauf si la commande est refusée avant son exécution :

| Interface | Échec habituel | Signification pour l’opérateur |
| --- | --- | --- |
| `activity()` | L’activité lève une exception, expire ou épuise ses tentatives. | L’exécution enregistre l’échec d’activité dans l’historique et suit le traitement des erreurs du workflow. |
| `child()` | Le workflow enfant échoue, est annulé, est arrêté de force ou expire. | Le parent observe un échec de l’enfant au niveau de la commande en attente. |
| `await()` | Le délai expire avant que la condition soit remplie ou le signal reçu. | L’attente retourne ou échoue selon la forme d’attente choisie. |
| `timer()` | La durée fournie est invalide après normalisation. | Le code doit transmettre des durées positives ou des attentes explicites de durée nulle. |
| `continueAsNew()` | La nouvelle exécution ne peut pas être créée. | L’exécution courante reste la référence pour les éléments de preuve de la transition échouée. |
| `upsertSearchAttributes()` | Une clé d’attribut, leur nombre ou leur taille totale dépasse les limites. | L’exécution échoue avant la persistance des métadonnées indexées invalides. |
| `MessageStream::receive()` | Aucun numéro de séquence positif d’historique de workflow n’est disponible. | La réception doit avoir lieu depuis l’exécution du workflow, sans appel direct depuis le code d’un service. |
| `MessageStream::sendReference()` | La référence de données utiles, le routage ou le contrat de stockage est invalide en aval. | L’ordre des messages reste indépendant de l’intégrité du stockage des données utiles. |

Pour les limites des données utiles et de l’historique, consultez les [limites structurelles](../constraints/structural-limits.md). Pour les réponses de refus de commande hors du code PHP de workflow, consultez la [référence de l’API Server](../polyglot/server-api-reference.md).

**Règles de déterminisme**

Le code du workflow doit être sûr pour la relecture. Placez les opérations irréversibles ou non déterministes derrière des commandes durables :

```php
use Workflow\V2\Workflow;

final class DeterministicWorkflow extends Workflow
{
    public function handle(): array
    {
        $workflowTime = Workflow::now();
        $stableId = Workflow::uuid7();
        $remoteQuote = Workflow::activity(FetchQuote::class);

        return [
            'time' => $workflowTime->toIso8601String(),
            'id' => $stableId,
            'quote' => $remoteQuote,
        ];
    }
}
```

- Utilisez `Workflow::now()` plutôt que l’horloge système dans les branches du workflow.
- Utilisez `Workflow::uuid4()` ou `Workflow::uuid7()` plutôt que des valeurs aléatoires directes.
- Placez les appels réseau, écritures de fichiers, envois d’e-mails et effets de bord externes dans des activités.
- Utilisez `Workflow::sideEffect()` uniquement lorsque la valeur doit être capturée dans l’historique et que l’effet de bord lui-même n’est pas l’action métier.
- Utilisez `Workflow::getVersion()`, `Workflow::patched()` et `Workflow::deprecatePatch()` pour faire évoluer le code du workflow sans rompre la relecture.

</details>
