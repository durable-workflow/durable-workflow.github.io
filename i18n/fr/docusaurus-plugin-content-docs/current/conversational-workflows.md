---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - workflow conversationnel
  - conversation de longue durée
  - approbation humaine
  - remplacement de worker
---

# Référence de workflow conversationnel {#conversational-workflow-reference}

Cette page est une référence exécutable unique pour une conversation de longue
durée dans le runtime Laravel embarqué. Elle combine des fonctionnalités qui
disposent chacune de leur propre guide :
les [signaux](./features/signals.md) pour les entrées ordonnées,
les [activités](./defining-workflows/activities.md) pour le travail du modèle,
les [requêtes de lecture](./features/queries.md) pour le statut et la
[continuation dans une nouvelle exécution](./features/continue-as-new.md) pour
borner l’historique. Les workers en mode service utilisent les mêmes primitives
via leurs [guides SDK](./polyglot/deployment-modes.md). L’application exemple
exécute aussi cette conversation sur un worker du SDK PHP ; consultez
[Conversation sur un worker PHP en mode service](https://github.com/durable-workflow/sample-app#conversation-on-a-php-service-mode-worker)
(`php artisan app:service-mode-conversation`).

La source est `ConversationWorkflow` dans l’[application exemple](./sample-app.md),
sous [`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation).
Elle utilise un modèle factice déterministe : elle ne nécessite donc ni compte
chez un fournisseur d’IA ni secret. C’est une référence du schéma de durabilité,
pas un chatbot de production, et elle ne promet rien en matière de latence ni de
montée en charge.

## Exécuter l’exemple {#run-it}

Avec le worker de file de l’application exemple en cours d’exécution (`composer run dev`) :

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

Sans `--message`, la commande demande une saisie. Un message contenant « refund »
amène le modèle factice à proposer une action, et la commande demande alors une
approbation. `--decision=decline` répond par un refus aux approbations scriptées.
Ouvrez `/waterline` pour inspecter chaque exécution de la chaîne. La
conversation se termine après une heure sans message, et une proposition
qu’aucun approbateur ne tranche dans les cinq minutes ne modifie rien.

## Déroulement d’un tour {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'proposalId', 'type' => 'string'],
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(
        array $state = [],
        int $turnsPerRun = 3,
        string $inactivityTimeout = '1 hour',
        string $approvalTimeout = '5 minutes',
    ): array {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivityTimeout,
                    $approvalTimeout,
                );
            }

            $text = await('message', $inactivityTimeout);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   uuid4() records an ID for a proposed action (replay-safe)
            //   await('decision', ...) waits up to $approvalTimeout for a decision naming that ID
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. Chaque signal `message` correspond à une entrée utilisateur. Le workflow
   applique les messages acceptés un tour à la fois, dans l’ordre de leur
   acceptation.
2. L’appel au modèle s’exécute dans une activité. La relecture réutilise le
   résultat enregistré au lieu d’appeler de nouveau le modèle.
3. Lorsque le modèle propose une action, le workflow lui attribue un identifiant
   avec `uuid4()`, qui enregistre la valeur dans l’historique : la relecture
   renvoie donc le même identifiant. Il attend ensuite, pendant au plus
   `$approvalTimeout`, indépendamment du délai d’inactivité, un signal
   `decision` qui reprend cet identifiant ; la requête de lecture `status`
   l’indique. Les signaux sont mis en mémoire tampon par nom : une décision
   portant sur une autre proposition (envoyée trop tôt, deux fois, ou renvoyée
   après une réponse incertaine) est donc ignorée au lieu de s’appliquer à la
   proposition suivante, et elle ne prolonge pas l’échéance. Seule une
   approbation de la proposition en attente exécute
   `ApplyApprovedActionActivity`. Un refus ou une expiration enregistre la
   réponse et ne modifie rien.
4. `RecordReplyActivity` écrit la réponse dans la table applicative
   `conversation_records`, sous une référence construite à partir de l’ID du
   workflow et du numéro de tour. L’historique ne stocke que cette référence.
5. La requête de lecture `status` indique la phase (`waiting_for_input`, `thinking`,
   `awaiting_approval`, `applying_action`, `recording_reply`,
   `continuing_as_new` ou `completed`), la génération, le nombre de tours, toute
   proposition en attente et la référence de la dernière réponse. Lisez le texte
   de la réponse à l’aide de cette référence.

## Ce qui survit à la perte d’un worker {#what-survives-a-lost-worker}

Les tests de l’exemple exécutent le moteur une tâche à la fois et arrêtent un
worker à un point choisi :

| Défaillance | Ce qui se passe |
| --- | --- |
| Un worker prend sous bail la tâche qui applique un message, puis s’arrête brutalement | Rien ne progresse avant l’expiration du bail. Le passage de réparation remet ensuite la même tâche à un autre worker, qui applique le message une seule fois. |
| Un worker s’arrête brutalement pendant l’exécution de l’activité du modèle | Après l’expiration du bail, l’activité fait l’objet d’une nouvelle tentative sur un autre worker. L’exécution enregistre un seul achèvement pour cette activité, et la réponse est enregistrée une seule fois. |
| Le worker de réponse écrit la ligne, puis s’arrête brutalement avant d’en rendre compte | La nouvelle tentative exécute de nouveau l’activité. Comme la ligne a pour clé la référence, une seule réponse subsiste. |

Les activités s’exécutent au moins une fois : une nouvelle tentative peut
répéter un travail déjà effectué hors du moteur. L’historique durable enregistre
chaque résultat une seule fois. Donnez à chaque effet de bord une clé stable,
comme le font les références de réponse et d’action, et transmettez cette même
clé à tout système externe. Consultez les
[garanties d’exécution](./constraints/execution-guarantees.md) et
[l’expiration du bail et la redistribution](./constraints/execution-guarantees.md#lease-expiry-and-redelivery).

## Borner l’historique {#bounding-history}

Après `$turnsPerRun` tours, l’exécution continue dans une nouvelle exécution.
L’exécution suivante reçoit uniquement l’état explicite transmis à
`continueAsNew()` : la génération, le nombre de tours, un résumé borné et la
référence de la dernière réponse. Les autres propriétés de l’objet workflow sont
reconstruites par relecture et ne sont pas copiées.

Les messages acceptés mais pas encore appliqués passent à l’exécution suivante
dans leur ordre d’origine. Cela s’applique aux signaux déclarés envoyés à
l’instance de workflow. Un signal envoyé à une exécution précise est rejeté si
cette exécution se clôt avant. Consultez
[acceptation et clôture des signaux](./features/signals.md#acceptance-and-closure)
et la [continuation dans une nouvelle exécution](./features/continue-as-new.md).

## Ce qui reste à votre charge {#what-stays-your-responsibility}

- **Stockage des charges utiles.** L’exemple conserve le texte des réponses dans
  une table applicative. Choisissez sa rétention, son contrôle d’accès et sa
  sauvegarde, ou utilisez le
  [stockage externe des charges utiles](./features/external-payload-storage.md).
- **Résumé.** Le modèle factice conserve un résumé courant de longueur fixe.
  Avec un modèle réel, c’est à vous de décider quel contexte franchit la
  continuation dans une nouvelle exécution et jusqu’à quelle taille il peut croître.
- **Qui peut envoyer des entrées ou approuver.** Le moteur enregistre le signal
  et ses arguments. Authentifiez et autorisez les émetteurs et les approbateurs
  dans votre application avant d’envoyer le signal ; consultez
  [identité de l’émetteur et autorisation](./features/signals.md#sender-identity-and-authorization).
- **Effets externes.** Le moteur ne garantit pas qu’un appel externe a lieu
  exactement une fois. Utilisez des clés d’idempotence, comme le fait
  l’activité d’action approuvée.
- **Envois de signaux réessayés.** Si la réponse à un envoi de signal est
  perdue, consultez [après une réponse incertaine](./features/signals.md#after-an-uncertain-response)
  avant de le renvoyer.

L’exemple stocke les réponses via une activité et n’utilise pas les flux de
messages depuis le code du workflow. Dans les versions de Workflow jusqu’à
2.20.0 incluse, `outbox()->sendReference()` et `inbox()->receive()` ne sont pas
sûrs à la relecture dans le code du workflow
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)) ;
consultez l’avertissement dans les [flux de messages](./features/message-streams.md).

## Guides associés {#related-guides}

- [Signaux](./features/signals.md) et [requêtes de lecture](./features/queries.md)
- [Continuation dans une nouvelle exécution](./features/continue-as-new.md)
- [Flux de messages](./features/message-streams.md)
- [Activités](./defining-workflows/activities.md) et
  [garanties d’exécution](./constraints/execution-guarantees.md)
- [Échecs et reprise](./failures-and-recovery.md)
- [Application exemple](./sample-app.md)
