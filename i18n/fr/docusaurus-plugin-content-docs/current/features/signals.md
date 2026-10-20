---
sidebar_position: 1
title: Signaux
description: Envoyer des commandes externes typées aux workflows en cours et comprendre la validation, le routage et les attentes de signaux.
tags:
  - commands
  - signals
  - human-in-the-loop
keywords:
  - signaux de workflow
  - commande de signal
  - workflow avec intervention humaine
---

import SignalSimulator from '@site/src/components/SignalSimulator';

# Signaux {#signals}

Les signaux permettent de déclencher des événements dans un workflow depuis l’extérieur. Ils servent à réagir à des événements externes, permettre des *interventions humaines* ou signaler la fin d’une tâche externe. Pour des entrées répétées et ordonnées avec progression durable d’un curseur, utilisez les [Flux de messages](./message-streams.md).

## Acceptation et clôture {#acceptance-and-closure}

`signal_received` confirme l’acceptation durable. Il ne confirme pas que le code
du workflow a traité le signal. Consultez le statut conservé et l’historique du
signal si l’opération métier exige une confirmation.

Avec Core 2.7.0 ou un Server compatible, les signaux éligibles acceptés pendant
une tâche de workflow distante bénéficient d’un tour de livraison avant la
clôture réussie. Les signaux reçus adressés à l’instance et déclarés dans son
contrat de commandes sont transférés lors d’une [continuation dans une nouvelle exécution](./continue-as-new.md)
avec leur identité, leurs arguments et leur ordre d’origine. Un signal adressé
à une exécution précise ne passe jamais à une autre exécution.

Une exécution sans déclaration durable de signal n’en acquiert pas lors d’un
enregistrement ultérieur de worker. Si le runtime ne peut établir la livraison,
le signal accepté se clôt avec le rejet explicite décrit ci-dessous.

Si une exécution se clôt sans appliquer un signal, son statut devient `rejected`
avec `run_closed_before_signal_applied`, un horodatage de clôture et un événement
d’historique `SignalRejected`. Cela inclut les signaux en tampon inutilisés à la
fin normale et ceux qui ne peuvent être appliqués avant un échec, une annulation
ou une expiration. Le reçu d’acceptation antérieur reste valide. Utilisez une
[mise à jour](./updates.md) si l’appelant a besoin d’un résultat de traitement
conservé plutôt que d’une simple acceptation.

Avant de mettre un composant d’écriture à niveau vers Core 2.7.0, terminez le
travail en cours et mettez à niveau tous les lecteurs intégrés ou accédant
directement à la base, dont Waterline s’il lit la même base. Les anciens lecteurs
ne peuvent décoder `SignalRejected`. Ne les laissez pas fonctionner avec le
nouveau composant d’écriture et ne rétrogradez pas un lecteur après le stockage
de cet événement.

## Attentes de signaux nommés {#named-signal-waits}

Un workflow appelle directement `await('signal-name')`. La prochaine commande de signal acceptée avec ce nom reprend l’exécution et renvoie une valeur déterministe au workflow suspendu.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('order-approval')]
#[Signal('approved-by', [
    ['name' => 'approvedBy', 'type' => 'string'],
])]
final class OrderApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $approvedBy = await('approved-by');

        return [
            'approved_by' => $approvedBy,
            'workflow_id' => $this->workflowId(),
            'run_id' => $this->runId(),
        ];
    }
}
```

Déclenchez le signal depuis PHP en ciblant l’identifiant public d’instance :

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptSignalWithArguments('approved-by', [
    'approvedBy' => 'Taylor',
]);

$result->accepted();    // true
$result->outcome();     // "signal_received"
$result->commandId();   // Durable signal-command id
$result->instanceId();  // "order-123"
```

Comportement des signaux :

- Déclarez chaque nom de signal externe à l’avance avec l’attribut de classe répétable `#[Signal('signal-name')]`. Vous pouvez inclure un contrat de paramètres ordonnés.
- Les commandes de signal ciblent l’identifiant public d’instance de workflow, pas un identifiant d’exécution. Les chaînes de continuation conservent ainsi la même route publique de signal.
- Avec un contrat de paramètres, l’admission rejette les données invalides avec `rejected_invalid_arguments` et des `validation_errors` lisibles par machine.
- Sans contrat, `await('name')` renvoie `true` sans argument envoyé, l’argument unique s’il n’y en a qu’un, ou le tableau complet s’il y en a plusieurs.
- Les noms inconnus sont rejetés avec `rejected_unknown_signal`. Les signaux vers une instance fermée ou non démarrée sont rejetés avec `rejected_not_active` ou `rejected_not_started`.

## Faire évoluer la charge utile d’un signal {#evolve-a-signal-payload}

Utilisez un seul argument map déclaré pour une charge utile applicative nécessitant des ajouts compatibles. Cet exemple conserve `schema_version: 1` pour le champ `note`, facultatif et purement informatif. Un ancien émetteur l’omet ; un lecteur plus récent utilise `null`. Un ancien lecteur peut l’ignorer sans modifier la décision d’approbation. N’utilisez pas un champ ignoré pour une modification qui doit influer sur les autorisations ou le comportement métier.

```php
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\await;

#[Type('map-approval')]
#[Signal('reviewed', [
    ['name' => 'payload', 'type' => 'array', 'allows_null' => false],
])]
final class MapApprovalWorkflow extends Workflow
{
    public function handle(): array
    {
        $payload = await('reviewed');
        if (! is_array($payload) || array_is_list($payload)
            || ($payload['schema_version'] ?? null) !== 1) {
            return ['status' => 'rejected_payload', 'reason' => 'unsupported_shape_or_version'];
        }
        if (! in_array($payload['decision'] ?? null, ['approved', 'rejected'], true)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_decision'];
        }
        $note = $payload['note'] ?? null;
        if ($note !== null && ! is_string($note)) {
            return ['status' => 'rejected_payload', 'reason' => 'invalid_note'];
        }

        return ['status' => 'processed', 'decision' => $payload['decision'], 'note' => $note];
    }
}
```

Les deux émetteurs utilisent le même paramètre déclaré `payload` :

```php
use Workflow\V2\WorkflowStub;

$oldPayload = ['schema_version' => 1, 'decision' => 'approved'];
$newPayload = [...$oldPayload, 'note' => 'review λ'];

$receipt = WorkflowStub::load('review-123')->attemptSignalWithArguments(
    'reviewed',
    ['payload' => $newPayload], // An old sender passes $oldPayload here.
);
```

La déclaration vérifie l’argument extérieur. Un scalaire à la place de `payload` est refusé à l’admission. Le type `array` ne valide pas les champs imbriqués et ne distingue pas une liste PHP d’une map à clés textuelles. Le workflow vérifie ces règles applicatives avant le traitement métier. Une version non prise en charge ou une `note` invalide peut donc être acceptée durablement, puis produire `rejected_payload` comme résultat du workflow. Ce résultat est distinct de l’accusé de réception `signal_received`.

Conservez les champs obligatoires et leur signification. Définissez si une valeur absente et un `null` explicite ont le même sens ; c’est le cas de `note` ici. Conservez les décodeurs des anciennes valeurs enregistrées. Une structure ou une signification incompatible nécessite une nouvelle version applicative et un plan de compatibilité explicite, et pas simplement un champ facultatif supplémentaire.

Une exécution conserve les déclarations de signaux et les valeurs par défaut enregistrées à son démarrage. Modifier la signature ou une valeur par défaut du handler actuel ne réécrit pas ce contrat. Ajouter un argument de signal de premier niveau est différent d’ajouter une clé dans la map existante. Ne supposez pas qu’une ancienne exécution l’accepte ou adopte la nouvelle valeur par défaut. Les nouvelles exécutions peuvent enregistrer une nouvelle déclaration tandis que les anciennes conservent la leur.

Ce format applicatif est distinct du [schéma de transport Avro Value](/docs/polyglot/avro-value-protocol), qui est fixe. Les clients PHP, Python et Rust en mode service encodent les valeurs map, liste et scalaires prises en charge au moyen de leurs SDK. Une dataclass Python, un objet métier PHP ou une struct Rust nécessite l’adaptateur de valeurs explicite approprié. Un champ de version applicative n’est pas un registre de schémas. Consultez les [références des SDK](/docs/sdk-neutrality) pour les API du mode service.

La compatibilité des charges utiles n’autorise pas non plus une définition de workflow modifiée à prendre une exécution existante. Gardez disponible le worker ou le build compatible requis. La restriction d’empreinte du code source de Server 2.9.7 est suivie séparément dans [Server #518](https://github.com/durable-workflow/server/issues/518). Cette recette ne la contourne pas et ne promet pas qu’un handler actuel remplace le code de l’ancienne exécution. Utilisez le [versionnement des workflows](./versioning.md) pour modifier le code sans compromettre le replay, dans le cadre du contrat de routage pris en charge par le runtime.

La même règle concernant les valeurs enregistrées s’applique aux arguments et aux résultats des activités : les nouvelles tentatives et le replay peuvent rencontrer d’anciennes structures. Maintenez leurs adaptateurs compatibles avec ces valeurs plutôt que de réécrire l’historique ou de dépendre des valeurs par défaut actuelles du modèle.

## Après une réponse incertaine {#after-an-uncertain-response}

Une expiration ou une perte de réponse peut survenir après l’admission durable
du signal. Une réponse ultérieure indiquant une exécution fermée ou introuvable
décrit cette requête ultérieure. Elle ne prouve pas si le signal initial a été
appliqué. Une vérification du statut avant l’envoi laisse aussi un intervalle
pendant lequel le workflow peut se clôturer ou continuer dans une nouvelle exécution.

Conservez l’espace de noms, l’identité du workflow, le nom du signal, les
arguments et la clé d’opération applicative d’origine pour enquêter sur une
livraison incertaine. Répéter un signal doit respecter le contrat réel de gestion
des doublons de la cible. Ne démarrez pas un workflow de remplacement au seul
motif que la nouvelle tentative a été refusée.

Consultez la [récupération d’une commande incertaine](./updates.md#recover-after-an-uncertain-response)
pour inspecter les mises à jour conservées et effectuer un rapprochement applicatif.

## Identité de l’émetteur et autorisation {#sender-identity-and-authorization}

`approvedBy` est une donnée applicative. La chaîne `Taylor` de l’exemple ne
prouve pas l’authentification de l’émetteur. Un contrat `#[Signal]` valide le nom
et les arguments du signal. Votre application Laravel doit authentifier
l’appelant et autoriser l’opération avant d’admettre le signal.

Par exemple, un point de terminaison d’approbation peut utiliser l’utilisateur
authentifié et une politique de commande. Cette application définit un modèle
`Order` avec les champs stockés `workflow_instance_id` et `workflow_namespace`,
et enregistre une politique `approve` vérifiant l’accès de l’utilisateur à la
commande. Le point de terminaison ne prend ni l’acteur ni le routage du workflow
depuis le corps de la requête :

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Workflow\V2\CommandContext;
use Workflow\V2\WorkflowStub;

Route::post('/orders/{order}/approve', function (Request $request, Order $order) {
    $user = $request->user();
    Gate::forUser($user)->authorize('approve', $order);

    $actorId = (string) $user->getAuthIdentifier();
    $context = CommandContext::phpApi()->withPrincipal('user', $actorId);

    $result = WorkflowStub::load(
        $order->workflow_instance_id,
        $order->workflow_namespace,
    )->withCommandContext($context)->attemptSignalWithArguments('approved-by', [
        'approvedBy' => $actorId,
    ]);

    return response()->json([
        'accepted' => $result->accepted(),
        'outcome' => $result->outcome(),
        'command_id' => $result->commandId(),
    ], $result->accepted() ? 202 : 409);
})->middleware('auth');
```

La vérification de politique précède le chargement ou l’envoi du signal. Chaque
point d’entrée d’approbation doit appliquer la même politique applicative,
y compris les webhooks et points administratifs pouvant envoyer ce signal.
Dans le workflow, `await('approved-by')` reçoit l’argument enregistré. Il ne
renvoie pas d’objet représentant un émetteur authentifié et ne revérifie pas
les permissions.

L’identité d’audit de la commande est distincte de cet argument.
`withCommandContext()` enregistre le contexte sur le `WorkflowCommand` identifié
par `commandId()`. Son `context.principal` et ses accesseurs `principalType()`,
`principalId()` et `principalLabel()` permettent l’inspection d’audit côté hôte.
L’historique lié et les vues opérateur peuvent afficher l’attribution enregistrée.
L’absence d’attribution ne permet pas d’établir l’identité d’un émetteur.

`CommandContext::withPrincipal()` enregistre ce que fournit le code hôte de
confiance. Il n’authentifie pas un utilisateur et n’autorise pas un signal.
Conservez ce contexte hors des entrées contrôlées par l’appelant. N’utilisez
pas de session HTTP active ni de lecture des permissions courantes en base
dans la relecture déterministe du workflow.

Les appels SDK en mode service utilisent la frontière d’autorisation HTTP du
Server plutôt que cette route intégrée. Consultez
[Autorisation et attribution des signaux](/docs/polyglot/namespace-auth-workers#signal-authorization-and-attribution)
pour les identifiants d’accès, passerelles de confiance et identités d’audit.

<SignalSimulator />

**Important :** La fonction `await()` doit être utilisée uniquement dans un workflow, pas dans une activité.

Pour attendre qu’un prédicat sur un état durable devienne vrai, consultez [Attentes conditionnelles](./condition-waits.md). Pour un `await` avec expiration, consultez [Signal + temporisateur](./signal+timer.md). Pour des flux répétés de réception et d’émission, consultez [Flux de messages](./message-streams.md).

## Exécuter ce modèle {#run-this-pattern}

Le workflow démarré par webhook dans la [Sample App](/docs/sample-app) est la
référence exécutable du modèle d’attente de signal nommé de cette page :

```bash
php artisan app:webhook
```

`App\Workflows\Webhooks\WebhookWorkflow` démarre depuis une entrée webhook HTTP
et s’arrête sur `await('ready')` jusqu’à l’arrivée du signal correspondant.
Ouvrez Waterline pendant cette attente : l’événement `WorkflowExecutionSignaled`
apparaît dès l’acceptation du signal.
