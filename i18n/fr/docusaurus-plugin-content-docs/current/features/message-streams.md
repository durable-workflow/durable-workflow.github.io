---
sidebar_position: 18
tags:
  - message-streams
  - workflows
  - continue-as-new
  - AI
keywords:
  - flux de messages
  - boîte de réception de workflow
  - boîte d’envoi de workflow
  - MessageStream
  - messages de workflow répétés
---

# Flux de messages {#message-streams}

Les flux de messages sont l’interface de définition v2 des messages répétés de
workflow : boucles d’entrées humaines, réponses d’assistant, notifications entre
workflows et autres messages ordonnés devant survivre à la relecture et à la
continuation dans une nouvelle exécution.

Cette page décrit l’API de réception et d’émission Laravel intégrée. Les
[Flux de workflow](/docs/polyglot/workflow-streams/) gérés par Server réutilisent
les termes flux, décalage, nombre en attente, cycle de vie et erreur quand leur
sémantique correspond, mais ils sont uniquement sortants. Ils n’ajoutent ni
messagerie entrante de workflow ni transfert de curseur lors d’une continuation
au mode service.

Les auteurs de workflows doivent utiliser la façade native :

- `$this->inbox('stream-key')`
- `$this->outbox('stream-key')`
- `$this->messages('stream-key')`
- `Workflow\V2\MessageStream`

N’écrivez pas directement les lignes `workflow_messages` ou de curseur depuis
le code applicatif du workflow. La façade est le contrat stable. Les services
de messages de bas niveau servent à l’intégration du package et du runtime.

## Recevoir des messages {#receiving-messages}

Utilisez `peek()` pour inspecter les messages entrants en attente sans avancer
le curseur durable. Utilisez `receive()` ou `receiveOne()` lorsque le workflow
est prêt à consommer des messages et à enregistrer la progression du curseur
dans l’historique.

```php
use Workflow\V2\Workflow;

final class ApprovalInboxWorkflow extends Workflow
{
    public function handle(): array
    {
        $pending = $this->inbox('approval.requests')->peek(limit: 10);

        if ($pending->isEmpty()) {
            return ['status' => 'waiting'];
        }

        $message = $this->inbox('approval.requests')->receiveOne();

        return [
            'status' => 'received',
            'payload_reference' => $message?->payload_reference,
            'correlation_id' => $message?->correlation_id,
        ];
    }
}
```

`peek()` est en lecture seule. `receive()` et `receiveOne()` marquent les
messages comme consommés et avancent le curseur durable de l’exécution courante.
Cette progression est un fait historique. La relecture, les exports Waterline
et le transfert de continuation peuvent donc déterminer les messages déjà consommés.

## Envoyer des références {#sending-references}

Utilisez `outbox(...)->sendReference(...)` pour publier un message sortant
ordonné. La table de messages stocke les métadonnées de routage et une référence
aux données. Le contenu volumineux ou appartenant à l’application reste dans
son stockage de données.

```php
use Workflow\V2\Workflow;

final class AssistantReplyWorkflow extends Workflow
{
    public function handle(string $targetWorkflowId, string $replyReference): array
    {
        $message = $this->outbox('ai.assistant')->sendReference(
            targetInstanceId: $targetWorkflowId,
            payloadReference: $replyReference,
            correlationId: $this->workflowId(),
            metadata: ['kind' => 'assistant_reply'],
        );

        return [
            'status' => 'sent',
            'stream' => $message->stream_key,
            'sequence' => $message->sequence,
        ];
    }
}
```

L’historique reste ainsi petit et les consommateurs peuvent valider le stockage
des données indépendamment de l’ordre durable des messages.

## Continuation dans une nouvelle exécution {#continue-as-new}

Les flux privilégient l’instance. Lors d’une continuation, les messages entrants
en attente et la position du curseur sont transférés à la nouvelle exécution.
Les messages consommés restent attachés à l’ancienne comme preuves historiques.

Un workflow long peut donc réduire son historique tout en conservant la même
route publique de messages :

```php
use function Workflow\V2\continueAsNew;
use Workflow\V2\Workflow;

final class HumanInputLoopWorkflow extends Workflow
{
    public function handle(int $iteration = 0): array
    {
        $message = $this->inbox('human.replies')->receiveOne();

        if ($message === null) {
            return ['status' => 'waiting', 'iteration' => $iteration];
        }

        if ($this->shouldContinueAsNew()) {
            return continueAsNew($iteration + 1);
        }

        return [
            'status' => 'processed',
            'iteration' => $iteration,
            'payload_reference' => $message->payload_reference,
        ];
    }
}
```

L’appelant continue de cibler l’identifiant d’instance. Il n’a pas besoin de
savoir quelle exécution détient actuellement le curseur.

## Règles de définition {#authoring-rules}

- Utilisez des clés sémantiques comme `ai.assistant`, `human.replies` ou
  `approval.requests`, et traitez-les comme une partie du contrat public du workflow.
- Utilisez `peek()` pour l’inspection et `receive()` / `receiveOne()` pour la
  consommation durable.
- Utilisez `sendReference()` pour les messages sortants. Stockez les données
  volumineuses dans le stockage applicatif et transmettez une référence.
- Gardez le code applicatif sur `Workflow::inbox()`, `Workflow::outbox()` et
  `MessageStream`. Ne fondez pas la définition sur `MessageService`,
  `WorkflowMessage` ou des écritures de lignes de curseur.
- Pour les événements externes ponctuels, utilisez les [Signaux](./signals.md).
  Pour les changements d’état avec requête et résultat, utilisez les
  [Mises à jour](./updates.md). Choisissez les flux pour les messages répétés
  ordonnés nécessitant une sémantique de curseur.

## Exécuter ce modèle {#run-this-pattern}

Le workflow d’agent de voyage de la [Sample App](/docs/sample-app) est la
référence exécutable du modèle de réception et d’émission de cette page :

```bash
php artisan app:ai
```

`App\Workflows\Ai\AiWorkflow` stocke les données volumineuses de l’assistant dans
la table applicative `ai_workflow_messages` et ne publie qu’une référence durable
dans la boîte d’envoi `ai.assistant`. Les réponses arrivent par le flux de
réception correspondant via la mise à jour `receive`. Lisez la classe du workflow
avec cette page pour voir de bout en bout les mêmes appels `inbox()` / `outbox()` /
`sendReference()` que dans les exemples ci-dessus.
