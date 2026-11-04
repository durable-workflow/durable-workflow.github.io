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

:::warning Flux de messages avant Workflow 2.20.3

Le code de workflow est relu à chaque tâche de workflow ultérieure et à chaque
requête de lecture. Dans les versions de Workflow jusqu’à 2.20.0 incluse,
`outbox()->sendReference()` écrit un nouveau message sortant et un nouveau
message entrant à chaque relecture, et `inbox()->receive()` et `receiveOne()`
peuvent renvoyer un autre message, ou aucun, lors de la relecture
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)).
Workflow 2.20.1 enregistre les envois et réceptions pour la relecture et empêche
les requêtes de lecture d’écrire ou de consommer des messages. Les réceptions
vides et les flux conservés entre les étapes nécessitent les corrections
supplémentaires de relecture de 2.20.3 décrites ci-dessous.

- Les lignes dupliquées par les versions antérieures ne sont pas supprimées.
  Donnez à chaque envoi logique un `idempotencyKey` stable, comme
  `reply:{turn}`, et dédupliquez par `idempotency_key` lors de la consommation
  d’un flux écrit par une version antérieure. Les messages qu’une version
  antérieure a consommés sous la mauvaise étape restent consommés.
- Les signaux, les mises à jour et tous les flux partagent un curseur de
  messages. Jusqu’à 2.20.2 incluse, un signal, une mise à jour ou une réception
  sur un autre flux peut le faire avancer au-delà des messages en attente et
  les masquer
  ([workflow#1011](https://github.com/durable-workflow/workflow/issues/1011)).
  Pour ce cas d’ordre des signaux dans ces versions, envoyez le signal avant
  le message et ne recevez qu’après qu’un signal ou une condition indique
  qu’un message est présent.

:::

## Mise à niveau des flux et retour en arrière {#stream-upgrades}

Dans Workflow 2.20.3, le curseur partagé ne masque plus les messages en attente
à `receive()`, `receiveOne()`, `peek()`, `pendingCount()` ou `hasPending()`.
Les réceptions conservent l’ordre de séquence et leur limite de lot. Après la
mise à niveau, une boucle de réception peut renvoyer d’abord d’anciens messages
en attente que le curseur partagé masquait, puis les plus récents.

Une réception relue renvoie ce que son étape d’origine a consommé. Si l’appel
d’origine n’a rien trouvé, la relecture ne renvoie de nouveau rien. Un
gestionnaire de mise à jour exécuté pour la première fois peut toujours
recevoir. Un flux conservé dans une propriété enregistre désormais les
réceptions à l’étape courante du workflow, plutôt qu’à celle où le flux a été
ouvert. Les réceptions que les anciennes versions ont enregistrées à l’étape
d’ouverture restent relisibles.

Avant de ramener une application embarquée à une version antérieure à 2.20.3,
appliquez le [contrôle de relecture](../testing.md#replay-before-deployment)
aux historiques écrits par le paquet plus récent. Les anciennes versions
cherchent les réceptions des flux conservés à l’étape d’ouverture et peuvent
relire ces exécutions différemment. Le retour en arrière rétablit aussi les
défauts du curseur partagé, de relecture des réceptions vides et de précision
du traitement des tâches simulées. Consultez les
[notes de compatibilité du tag](https://github.com/durable-workflow/workflow/blob/2.20.3/CHANGELOG.md#2203---2026-11-04).

La limite des requêtes de lecture dans
[workflow#1024](https://github.com/durable-workflow/workflow/issues/1024)
subsiste : une requête peut ne rien renvoyer pour un message reçu par un
gestionnaire de mise à jour, car elle relit celui-ci à la mauvaise étape.
La requête ne modifie aucune ligne de message. La relecture du workflow
lui-même et sa sortie après achèvement renvoient toujours ce que le
gestionnaire a reçu.

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
en attente passent à la nouvelle exécution, la position du curseur est reportée,
et les messages consommés restent attachés à l’ancienne comme preuves
historiques. Workflow 2.20.1 et les versions antérieures ne reportaient que le
curseur : les messages encore en attente au moment de la continuation restaient
sur l’exécution fermée, et la nouvelle exécution ne les recevait jamais
([workflow#1018](https://github.com/durable-workflow/workflow/issues/1018),
corrigé dans 2.20.2). Sur ces versions, recevez les messages en attente avant
d’appeler `continueAsNew()`, ou envoyez les entrées qui doivent survivre au
passage de relais sous forme de [signal](./signals.md) : les signaux acceptés que
l’exécution n’a pas encore appliqués passent à la nouvelle exécution.

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
