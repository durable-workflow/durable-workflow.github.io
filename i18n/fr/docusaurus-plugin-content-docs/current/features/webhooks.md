---
sidebar_position: 13
---

# Webhooks {#webhooks}

Le framework fournit des webhooks permettant aux systèmes externes de démarrer des workflows et d’envoyer des signaux dynamiquement. Ils permettent l’intégration avec des services externes, API et outils d’automatisation.

## Activer les webhooks {#enabling-webhooks}
Pour activer les webhooks, enregistrez leurs routes dans le fichier de routes de votre application (`routes/web.php` ou `routes/api.php`) :

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Transmettez la table explicite des classes de workflow à exposer. Chaque alias devient le segment public de route. Chaque classe doit porter une clé de type durable stable via `#[Type(...)]` ou une entrée dans `workflows.v2.types.workflows`. Consultez [Webhooks explicites de commandes et de requêtes de lecture](#explicit-command-and-query-webhooks) pour la matrice complète des routes.

## Métadonnées de visibilité {#visibility-metadata}
Lorsque vous enregistrez les routes via `Workflow\V2\Webhooks::routes(...)`, la route de démarrage accepte aussi un objet réservé `visibility`. Ces champs sont stockés comme métadonnées de visibilité et ne sont pas transmis à la méthode `handle()` du workflow.

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_id": "order-123",
           "orderId": 123,
           "visibility": {
             "business_key": "order-123",
             "labels": {
               "tenant": "acme",
               "region": "us-east"
             },
             "memo": {
               "customer": {
                 "id": 42,
                 "name": "Taylor"
               },
               "source": "checkout"
             }
           }
         }'
```

`business_key` et `visibility.labels` sont copiés sur l’instance, l’exécution, le résumé, l’historique typé de démarrage, les détails sélectionnés et l’export d’historique. Waterline peut filtrer les listes selon ces champs avec des paramètres de correspondance exacte.

`visibility.memo` est copié sur l’instance, l’exécution, l’historique typé de démarrage, les détails sélectionnés et l’export. Les exécutions ultérieures via `continueAsNew()` héritent du même mémo par défaut. Son premier niveau doit être un objet JSON contenant des scalaires, `null`, tableaux ou objets imbriqués. `memo` est une métadonnée seulement renvoyée, pas un filtre de liste ni un champ de recherche du résumé.

## Authentification des webhooks {#webhook-authentication}
Par défaut, les webhooks n’exigent pas d’authentification. Vous pouvez toutefois configurer plusieurs stratégies dans `config/workflows.php`.

**Important :** Si les URL sont partagées avec des tiers ou exposées publiquement, activez l’authentification par jeton ou signature HMAC pour éviter les accès non autorisés.

### Méthodes d’authentification {#authentication-methods}
Les méthodes prises en charge sont :
1. Aucune authentification (none)
2. Authentification par jeton (token)
3. Vérification de signature HMAC (signature)
4. Authentification personnalisée (custom)

### Authentification par jeton {#token-authentication}
Cette méthode exige un jeton API valide dans les en-têtes de requête. L’en-tête par défaut est `Authorization`, modifiable dans la configuration.

#### Exemple de requête {#example-request}
```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "Authorization: your-api-token" \
     -d '{"orderId": 123}'
```

### Authentification par signature HMAC {#hmac-signature-authentication}
Cette méthode vérifie les requêtes avec une clé secrète. L’en-tête par défaut est `X-Signature`, lui aussi modifiable.

#### Exemple de requête {#example-request-1}
```bash
BODY='{"orderId": 123}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret-key" | awk '{print $2}')

curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -d "$BODY"
```

### Authentification personnalisée {#custom-authentication}
Pour utiliser un authentificateur personnalisé, créez une classe implémentant l’interface `WebhookAuthenticator` :

```php
use Illuminate\Http\Request;
use Workflow\Auth\WebhookAuthenticator;

class CustomAuthenticator implements WebhookAuthenticator
{
    public function validate(Request $request): Request
    {
        $allow = true;

        if ($allow) {
            return $request;
        } else {
            abort(401, 'Unauthorized');
        }
    }
}
```

Puis configurez-la dans `config/workflows.php` :

```php
'webhook_auth' => [
    'method' => 'custom',
    'custom' => [
        'class' => App\Your\CustomAuthenticator::class,
    ],
],
```

La méthode `validate()` doit renvoyer la `Request` si elle est valide, ou appeler `abort(401)` si elle n’est pas autorisée.

## Configurer les routes webhook {#configuring-webhook-routes}
Par défaut, les webhooks sont accessibles sous `/webhooks`. Vous pouvez personnaliser ce chemin dans `config/workflows.php` :

```php
'webhooks_route' => 'workflows',
```

Après cette modification, les webhooks sont accessibles sous :
```
POST /workflows/start/order-workflow
POST /workflows/signal/order-workflow/{workflowId}/mark-as-shipped
POST /workflows/instances/{workflowId}/queries/{query}
POST /workflows/instances/{workflowId}/runs/{runId}/queries/{query}
POST /workflows/instances/{workflowId}/signals/{signal}
POST /workflows/instances/{workflowId}/runs/{runId}/signals/{signal}
POST /workflows/instances/{workflowId}/repair
POST /workflows/instances/{workflowId}/cancel
POST /workflows/instances/{workflowId}/terminate
GET  /workflows/instances/{workflowId}/describe
POST /workflows/instances/{workflowId}/runs/{runId}/repair
POST /workflows/instances/{workflowId}/runs/{runId}/cancel
POST /workflows/instances/{workflowId}/runs/{runId}/terminate
GET  /workflows/instances/{workflowId}/runs/{runId}/describe
GET  /workflows/workflow-tasks/poll
GET  /workflows/activity-tasks/poll
POST /workflows/control-plane/start
```

## Webhooks explicites de commandes et de requêtes de lecture {#explicit-command-and-query-webhooks}

Les commandes durables de démarrage, signal, mise à jour, réparation, annulation et arrêt forcé sont exposées en HTTP, ainsi que les routes de requête de lecture sûres à relire pour les exécutions courantes ou sélectionnées.

Enregistrez une table explicite d’alias pour router uniquement les workflows à exposer.

```php
use Workflow\V2\Webhooks;

Webhooks::routes([
    App\Workflows\OrderWorkflow::class,
    'manual-invoice' => App\Workflows\InvoiceWorkflow::class,
]);
```

Une classe enregistrée directement doit définir une clé de type stable avec `#[Type(...)]` ou être enregistrée sous `workflows.v2.types.workflows` :

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('order-workflow')]
class OrderWorkflow extends Workflow
{
    public function handle(int $orderId)
    {
        // ...
    }
}
```

Enregistrement équivalent dans la configuration :

```php
// config/workflows.php
'v2' => [
    'types' => [
        'workflows' => [
            'order-workflow' => App\Workflows\OrderWorkflow::class,
        ],
    ],
],
```

La route de démarrage résultante est :

```
POST /webhooks/start/order-workflow
```

Exemple de requête :

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123}'
```

Le `workflow_id` est l’identifiant public opaque de l’instance. Ce n’est pas un identifiant d’exécution et il doit être traité comme une chaîne opaque.

Les `workflow_id` fournis par l’appelant doivent être des chaînes non vides utilisables dans une URL, de 191 caractères maximum, contenant uniquement des lettres, chiffres, `.`, `_`, `-` et `:`. Les identifiants vides, trop longs ou contenant des caractères non pris en charge sont rejetés à la validation avec HTTP `422`.

Cette même table de types durables sert de repli aux workers si un nom de classe stocké change après refactorisation. Si `order-workflow` reste stable et que l’enregistrement pointe vers la nouvelle classe, le travail v2 en file peut toujours résoudre la clé durable même si la classe PHP stockée d’origine n’est plus chargeable.

Vous pouvez aussi demander un comportement explicite pour les démarrages en double :

```bash
curl -X POST "https://example.com/webhooks/start/order-workflow" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id":"order-123","orderId":123,"on_duplicate":"return_existing_active"}'
```

Les valeurs `on_duplicate` prises en charge sont :

- `reject_duplicate`
- `return_existing_active`

Tous les webhooks de commande renvoient la même enveloppe JSON :

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Réponse acceptée lorsqu’une nouvelle exécution est créée :

```json
{
  "outcome": "started_new",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Réponse acceptée si l’appelant demande de réutiliser l’exécution active existante :

```json
{
  "outcome": "returned_existing_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Réponse de rejet d’un démarrage en double :

```json
{
  "outcome": "rejected_duplicate",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "command_source": "webhook",
  "rejection_reason": "instance_already_started"
}
```

Champs de réponse :

- `workflow_id` est l’identifiant public d’instance.
- `run_id` est la première exécution active créée par la commande acceptée.
- `requested_run_id` est défini uniquement si l’appelant cible explicitement une exécution.
- `resolved_run_id` est l’exécution effectivement résolue par le moteur. Pour les démarrages visant l’instance, il correspond à `run_id`.
- `command_id` est l’identifiant durable de commande de démarrage.
- `command_source` vaut `webhook` pour ces routes.
- les routes de signal, mise à jour, réparation, annulation et arrêt forcé visant l’instance résolvent sa dernière exécution durable plutôt que de se fier uniquement au pointeur modifiable courant. Les chaînes de continuation restent accessibles par le même identifiant public même si cette colonne dérive.
- les routes visant une exécution fixent la sélection sous le même identifiant d’instance et rejettent avec `target_scope = run`, `outcome = rejected_not_current` et `rejection_reason = selected_run_not_current` si elle n’est plus courante. `run_id` et `requested_run_id` restent alors sur la sélection historique, tandis que `resolved_run_id` indique l’exécution courante à cibler ensuite.
- les clés des données correspondent aux noms de paramètres `handle()` dans l’ordre de déclaration.
- les workflows définissent leurs arguments de démarrage sur `handle()`.
- les classes sans déclaration `handle()` sont rejetées avec des erreurs de validation HTTP `422` avant toute création d’exécution.
- les clés obligatoires manquantes sont rejetées avec HTTP `422` au lieu d’être abandonnées silencieusement.
- les `workflow_id` vides, trop longs ou non utilisables dans une route sont rejetés avec HTTP `422` plutôt que transmis au traitement des doublons.
- les valeurs `on_duplicate` invalides sont rejetées avec HTTP `422`.
- `on_duplicate = return_existing_active` renvoie HTTP `200` si l’exécution active courante est réutilisée.
- les démarrages en double non réutilisés renvoient HTTP `409` avec `outcome = rejected_duplicate`, `command_status = rejected` et `rejection_reason = instance_already_started`.
- la ligne durable `workflow_commands` stocke aussi le contexte d’entrée webhook séparément des arguments métier : étiquette d’appelant, méthode ou résultat d’authentification, nom de route, chemin de requête et empreinte issue des données normalisées et de certains en-têtes comme `X-Request-Id` et `X-Correlation-Id`

Matrice actuelle des réponses HTTP du webhook de démarrage :

- `202` avec `outcome = started_new` lorsqu’une exécution est créée
- `200` avec `outcome = returned_existing_active` lorsque l’exécution active est réutilisée
- `409` avec `outcome = rejected_duplicate` lorsque le doublon est rejeté
- `401` en cas d’échec d’authentification
- `404` pour un alias inconnu
- `422` en cas d’échec de validation des données


### Webhooks de commande de signal {#signal-command-webhooks}

Les commandes de signal peuvent viser une instance ou une exécution :

```text
POST /webhooks/instances/{workflowId}/signals/{signal}
POST /webhooks/instances/{workflowId}/runs/{runId}/signals/{signal}
```

`workflowId` est l’identifiant public d’instance. La route visant l’instance résout l’exécution active courante au moment de l’application. La route visant une exécution prend aussi un `runId` sélectionné et rejette une sélection historique. Le nom de signal vient du paramètre de route. Le corps accepte actuellement un champ facultatif au premier niveau :

```json
{
  "arguments": ["Taylor"]
}
```

Le champ `arguments` doit être un tableau. S’il est omis, un workflow attendant avec `await('signal-name')` reprend avec `true`.
La classe ciblée doit déclarer le nom avec `#[Workflow\V2\Attributes\Signal('...')]`. Les noms non déclarés sont rejetés durablement plutôt que mis aveuglément en tampon.

Exemple de signal :

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/signals/approved-by" \
     -H "Content-Type: application/json" \
     -d '{"arguments":["Taylor"]}'
```

Réponse de signal accepté :

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "rejection_reason": null
}
```

Chaque commande de signal acceptée ou rejetée possède aussi une ligne durable de cycle de vie `workflow_signal_records` liée à sa commande d’origine. La réponse conserve l’identifiant de commande comme corrélation HTTP. Les détails Waterline et exports exposent la ligne comme `signals[*].id`, avec le nom, `signal_wait_id`, la séquence de commande, la séquence de workflow après application, le statut, le résultat, les erreurs de validation et les arguments stockés.

Réponse rejetée si l’instance existe mais n’a pas encore démarré d’exécution :

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Réponse rejetée si l’exécution courante est déjà clôturée :

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Réponse rejetée si la route cible un signal non déclaré :

```json
{
  "outcome": "rejected_unknown_signal",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "unknown_signal"
}
```

Réponse rejetée si la route de signal vise une exécution historique :

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Matrice actuelle des réponses HTTP du webhook de signal :

- `202` avec `outcome = signal_received` si la commande est acceptée
- `401` en cas d’échec d’authentification
- `404` pour un identifiant d’instance inconnu
- `404` avec `outcome = rejected_unknown_signal` si le workflow ne déclare pas ce nom. Si l’exécution porte déjà un instantané de contrat typé `WorkflowStarted`, ou si un ancien `WorkflowStarted` peut être complété à la première admission compatible, le rejet ne dépend plus d’une réflexion préalable de la classe active
- `409` avec `outcome = rejected_not_started` si l’instance n’a pas encore d’exécution courante
- `409` avec `outcome = rejected_not_active` si l’exécution courante ciblée est clôturée
- `409` avec `outcome = rejected_not_current` si la route cible une sélection historique
- `422` si `arguments` est présent sans être un tableau

### Webhooks de signal avec démarrage {#signal-with-start-webhooks}

Une route d’admission liée visant l’instance démarre une exécution ou réutilise l’exécution active avant d’enregistrer un signal :

```text
POST /webhooks/start/{alias}/signals/{signal}
```

`alias` est l’alias de workflow enregistré dans `Workflow\V2\Webhooks::routes([...])`. `signal` est le nom durable déclaré par `#[Signal(...)]`.

Le corps combine les champs normaux de démarrage et le champ réservé `signal_arguments` pour les données du signal joint :

```json
{
  "workflow_id": "order-123",
  "signal_arguments": ["Taylor"],
  "visibility": {
    "business_key": "order-123"
  }
}
```

`signal_arguments` doit être un tableau. La route utilise `on_duplicate` égal à `return_existing_active` par défaut et rejette toute autre politique de doublon pour cette admission liée.

Réponse acceptée lorsque la route démarre une exécution :

```json
{
  "outcome": "signal_received",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": null,
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "start_command_id": "01J...",
  "start_command_sequence": 1,
  "start_outcome": "started_new",
  "start_command_status": "accepted",
  "intake_group_id": "01J...",
  "rejection_reason": null
}
```

Si l’instance a déjà une exécution active, la route renvoie `start_outcome = returned_existing_active` et conserve la commande de signal comme objet de réponse principal `command_*`. Les commandes liées de démarrage et de signal partagent `intake_group_id`, les métadonnées de route et les en-têtes de corrélation. Le runtime les enregistre en une transaction avant que le worker puisse exécuter la première étape utilisateur.

Les détails sélectionnés et l’export figent cette admission composée sous `linked_intakes[*]`. L’autorité durable est le `workflow_commands.context.intake.group_id` partagé et le `mode` de chaque ligne acceptée. En mode `signal_with_start`, la ligne groupée expose `start_command_*`, le `primary_command_*` hors démarrage, `complete`, `missing_expected_command_types` et les instantanés imbriqués ordonnés `commands[*]`.

Si le nom est inconnu ou les données non conformes au contrat durable, le runtime rejette le signal avant de créer une exécution. La réponse laisse alors `run_id`, `start_command_id` et `start_outcome` à `null`.

Matrice actuelle des réponses HTTP du webhook de signal avec démarrage :

- `202` avec `outcome = signal_received` et `start_outcome = started_new` si la requête crée une exécution et enregistre le signal
- `202` avec `outcome = signal_received` et `start_outcome = returned_existing_active` si elle réutilise l’exécution active et enregistre le signal
- `401` en cas d’échec d’authentification
- `404` pour un alias de workflow inconnu
- `404` avec `outcome = rejected_unknown_signal` si le workflow ne déclare pas ce nom
- `422` avec `outcome = rejected_invalid_arguments` si `signal_arguments` est un tableau non conforme au contrat durable
- `422` si `signal_arguments` est présent sans être un tableau, ou si `on_duplicate` diffère de `return_existing_active`

### Webhooks de requête de lecture {#query-webhooks}

Les routes de requête de lecture peuvent viser une instance ou une exécution :

```text
POST /webhooks/instances/{workflowId}/queries/{query}
POST /webhooks/instances/{workflowId}/runs/{runId}/queries/{query}
```

`workflowId` est l’identifiant public d’instance. La route visant l’instance résout sa dernière exécution durable après actualisation. Celle visant une exécution fixe le `runId` sélectionné, y compris historique ou clôturé, car les requêtes sont des relectures en lecture seule.

`query` est la cible publique déclarée par `#[QueryMethod]`. Si la définition reste chargeable, la route accepte aussi le nom de méthode PHP, mais les réponses réussies normalisent `query_name` vers la cible publique durable.

Le corps accepte une liste positionnelle `arguments` ou une table nommée `arguments` indexée par les paramètres déclarés :

```json
{
  "arguments": ["start"]
}
```

```json
{
  "arguments": {
    "prefix": "start"
  }
}
```

Les webhooks de lecture n’ajoutent pas de ligne durable de commande, contrairement aux routes de mutation. Ils relisent l’exécution sélectionnée et renvoient immédiatement un résultat sérialisé.

Exemple de requête de lecture :

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/queries/events-starting-with" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"prefix":"start"}}'
```

Réponse de requête de lecture acceptée :

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "result": "i:1;"
}
```

Réponse rejetée si les arguments ne correspondent pas au contrat déclaré :

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "message": "Workflow query [events-starting-with] received invalid arguments.",
  "validation_errors": {
    "prefix": [
      "The prefix argument is required."
    ]
  }
}
```

Réponse rejetée si la définition du workflow sélectionné ne peut plus être relue :

```json
{
  "query_name": "events-starting-with",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "target_scope": "instance",
  "blocked_reason": "workflow_definition_unavailable",
  "message": "Workflow 01J... [order-123] cannot execute query [events-starting-with] because the workflow definition is unavailable for durable type [order-workflow]."
}
```

Matrice actuelle des réponses HTTP du webhook de requête de lecture :

- `200` avec un `result` sérialisé si la relecture réussit
- `401` en cas d’échec d’authentification
- `404` pour un identifiant d’instance ou d’exécution sélectionnée inconnu
- `409` si l’instance n’a pas démarré, si la requête n’est pas déclarée sur cette exécution ou si la relecture est bloquée par `blocked_reason = workflow_definition_unavailable`
- `422` si le contrat de lecture rejette les `arguments` fournis

### Webhooks de commande de mise à jour {#update-command-webhooks}

Des routes POST de mise à jour visant l’instance ou une exécution et des routes de consultation du cycle durable sont disponibles :

```text
POST /webhooks/instances/{workflowId}/updates/{update}
POST /webhooks/instances/{workflowId}/runs/{runId}/updates/{update}
GET /webhooks/instances/{workflowId}/updates/{updateId}
GET /webhooks/instances/{workflowId}/runs/{runId}/updates/{updateId}
```

`workflowId` est l’identifiant public d’instance. `update` est le nom durable déclaré par `#[UpdateMethod]`. `updateId` est l’identifiant durable de cycle renvoyé dans les réponses. Le POST visant l’instance résout l’exécution active lors de l’application. Celui visant une exécution prend aussi un `runId` et rejette une sélection historique. Le GET visant l’instance lit son cycle stocké ; le GET visant une exécution limite la recherche à celle-ci.

Avec `#[UpdateMethod('mark-approved')]`, la cible publique est `mark-approved`, même si la méthode PHP porte un autre nom.

Le corps accepte une liste positionnelle `arguments` ou une table nommée `arguments` indexée par les paramètres déclarés de la mise à jour :

```json
{
  "arguments": [true, "api"]
}
```

```json
{
  "arguments": {
    "approved": true
  }
}
```

Définissez `wait_for` à `accepted` si l’appelant n’a besoin que de l’acceptation durable et souhaite une application ultérieure par le worker :

```json
{
  "arguments": {
    "approved": true
  },
  "wait_for": "accepted"
}
```

Si `wait_for` est omis ou vaut `completed`, le webhook enregistre d’abord la mise à jour acceptée, puis attend son application par le worker jusqu’au budget configuré. Remplacez ce budget par requête avec `wait_timeout_seconds` :

```json
{
  "arguments": {
    "approved": true
  },
  "wait_timeout_seconds": 5
}
```

Si le worker termine dans le budget, le webhook renvoie la réponse normale de fin ou d’échec. Si le budget expire d’abord, il renvoie HTTP `202` avec le cycle accepté encore ouvert plutôt que de bloquer indéfiniment. Avec `wait_for` égal à `accepted`, il enregistre la commande, la ligne native de cycle et l’historique typé `UpdateAccepted`, puis programme ou renvoie une tâche de workflow et répond HTTP `202` sans attendre l’application.

Chaque réponse POST ou GET inclut les champs normaux de commande et `update_id`, `update_name`, `update_status`, `workflow_sequence`, `accepted_at`, `applied_at`, `rejected_at` et `closed_at`. Les cycles acceptés encore ouverts renvoient `workflow_sequence = null`, `result = null`, `applied_at = null`, `rejected_at = null` et `closed_at = null` jusqu’à leur clôture par le worker.

Lorsqu’une table nommée est acceptée, le moteur la normalise dans l’ordre des paramètres déclarés avant d’ajouter l’historique typé `UpdateAccepted` ou `UpdateApplied`. Les paramètres facultatifs sont aussi complétés avec leurs valeurs PHP par défaut.

Chaque mise à jour acceptée ou rejetée repose sur une ligne durable `workflow_updates` indexée par `update_id`. L’appelant peut donc envoyer un POST puis consulter le cycle par GET sans déduire l’état des lignes de commandes génériques.

Exemple de mise à jour :

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/updates/mark-ready" \
     -H "Content-Type: application/json" \
     -d '{"arguments":{"approved":true}}'
```

Réponse de mise à jour terminée :

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "completed",
  "wait_timed_out": false,
  "wait_timeout_seconds": 10,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Réponse de mise à jour seulement acceptée :

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "accepted",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Exemple de consultation du cycle de vie :

```bash
curl "https://example.com/webhooks/instances/order-123/updates/01J..." \
     -H "Content-Type: application/json"
```

Réponse de consultation pendant que la mise à jour reste ouverte :

```json
{
  "outcome": null,
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "accepted",
  "workflow_sequence": null,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": null,
  "rejected_at": null,
  "closed_at": null,
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": null,
  "failure_id": null,
  "failure_message": null
}
```

Réponse de consultation après clôture :

```json
{
  "outcome": "update_completed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "update_id": "01J...",
  "command_sequence": 2,
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "command_source": "webhook",
  "update_name": "mark-ready",
  "update_status": "completed",
  "workflow_sequence": 1,
  "accepted_at": "2026-04-10T12:00:00.000000Z",
  "applied_at": "2026-04-10T12:00:01.000000Z",
  "rejected_at": null,
  "closed_at": "2026-04-10T12:00:01.000000Z",
  "wait_for": "status",
  "wait_timed_out": false,
  "wait_timeout_seconds": null,
  "rejection_reason": null,
  "validation_errors": [],
  "result": {
    "approved": true
  },
  "failure_id": null,
  "failure_message": null
}
```

Les routes de consultation n’attendent pas l’exécution. Elles lisent uniquement le cycle durable stocké et renvoient donc toujours `wait_for = status`, `wait_timed_out = false` et `wait_timeout_seconds = null`.

Si un signal accepté antérieur attend déjà son application sur l’exécution sélectionnée, le POST ultérieur est rejeté avec `rejected_pending_signal` au lieu d’exécuter directement la tâche sur le chemin de l’appelant. Les données nommées ou positionnelles invalides sont rejetées avec `rejected_invalid_arguments` et `validation_errors`. Les POST visant une exécution historique sont rejetés avec `rejected_not_current`.

Matrice actuelle des réponses HTTP des routes POST de mise à jour :

- `200` avec `outcome = update_completed` si la commande est acceptée et terminée
- `202` avec `update_status = accepted` si `wait_for = accepted` accepte durablement la commande et laisse l’application au worker
- `202` avec `update_status = accepted`, `wait_for = completed` et `wait_timed_out = true` si l’attente a atteint `wait_timeout_seconds` ou la valeur par défaut sans clôture du cycle par le worker
- `401` en cas d’échec d’authentification
- `404` pour un identifiant d’instance inconnu
- `404` avec `outcome = rejected_unknown_update` pour un nom durable inconnu. Si un instantané typé `WorkflowStarted` est déjà présent, ou si un ancien événement `WorkflowStarted` peut être complété à la première admission compatible, le rejet peut provenir des métadonnées durables avant tout repli vers la définition active
- `409` avec `outcome = rejected_not_started` si l’instance n’a pas encore d’exécution courante
- `409` avec `outcome = rejected_not_active` si l’exécution courante est clôturée
- `409` avec `outcome = rejected_not_current` si la route cible une sélection historique
- `409` avec `outcome = rejected_pending_signal` si un signal accepté antérieur doit encore être appliqué
- `422` avec `outcome = rejected_invalid_arguments` si les données sont un tableau mais violent le contrat : arguments manquants ou inconnus, mauvais types ou nullabilité non respectée
- `422` avec `outcome = update_failed` si le corps de la mise à jour lève une exception
- `422` si `arguments` est présent sans être un tableau. Cette erreur de forme est rejetée avant création d’une ligne durable de commande

Matrice actuelle des réponses HTTP des routes GET de consultation :

- `200` une fois le cycle clôturé et `update_status` égal à `completed`, `failed` ou `rejected`
- `202` tant que `update_status = accepted`
- `401` en cas d’échec d’authentification
- `404` pour une instance, une exécution sélectionnée ou un `update_id` inconnu dans la portée demandée

### Webhooks de réparation et de commandes terminales {#repair-and-terminal-command-webhooks}

Les routes de réparation et de commandes terminales peuvent viser une instance ou une exécution :

```text
POST /webhooks/instances/{workflowId}/repair
POST /webhooks/instances/{workflowId}/cancel
POST /webhooks/instances/{workflowId}/terminate
POST /webhooks/instances/{workflowId}/runs/{runId}/repair
POST /webhooks/instances/{workflowId}/runs/{runId}/cancel
POST /webhooks/instances/{workflowId}/runs/{runId}/terminate
```

`workflowId` est l’identifiant public d’instance. Les routes d’instance résolvent toujours l’exécution active courante. Les routes d’exécution prennent aussi un `runId` sélectionné et rejettent les sélections historiques avec le résultat durable `rejected_not_current`. La configuration `workflows.webhook_auth` de la route de démarrage s’applique aussi à ces routes terminales.

Exemple de réparation :

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/repair" \
     -H "Content-Type: application/json"
```

Exemple d’annulation :

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/cancel" \
     -H "Content-Type: application/json"
```

Exemple d’arrêt forcé :

```bash
curl -X POST "https://example.com/webhooks/instances/order-123/terminate" \
     -H "Content-Type: application/json"
```

Réponse de réparation acceptée si le runtime restaure la progression durable de l’exécution courante :

```json
{
  "outcome": "repair_dispatched",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Réponse de réparation acceptée si un chemin durable sain de reprise existe déjà :

```json
{
  "outcome": "repair_not_needed",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Réponse d’annulation acceptée :

```json
{
  "outcome": "cancelled",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Réponse d’arrêt forcé accepté :

```json
{
  "outcome": "terminated",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "accepted",
  "rejection_reason": null
}
```

Réponse rejetée si l’instance existe sans avoir encore démarré d’exécution :

```json
{
  "outcome": "rejected_not_started",
  "workflow_id": "order-123",
  "run_id": null,
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "instance_not_started"
}
```

Réponse rejetée si l’exécution courante est déjà clôturée :

```json
{
  "outcome": "rejected_not_active",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "instance",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "run_not_active"
}
```

Réponse rejetée si une route de réparation, annulation ou arrêt forcé cible une exécution historique :

```json
{
  "outcome": "rejected_not_current",
  "workflow_id": "order-123",
  "run_id": "01J...",
  "requested_run_id": "01J...",
  "resolved_run_id": "01J...",
  "command_id": "01J...",
  "target_scope": "run",
  "workflow_type": "order-workflow",
  "command_status": "rejected",
  "rejection_reason": "selected_run_not_current"
}
```

Matrice actuelle des réponses HTTP des webhooks de réparation, annulation et arrêt forcé :

- `200` avec `outcome = repair_dispatched` si la réparation renvoie une tâche prête en retard, récupère un bail expiré ou recrée une tâche durable manquante pas encore démarrée, y compris les tâches d’application de mises à jour ou signaux acceptés dont les lignes ont été perdues avant application
- `200` avec `outcome = repair_not_needed` si l’exécution possède déjà un chemin durable sain de reprise ou se trouve dans une activité en cours sans ligne de tâche
- `200` avec `outcome = cancelled` ou `outcome = terminated` si la clôture de l’exécution courante réussit
- `401` en cas d’échec d’authentification
- `404` pour un identifiant d’instance inconnu
- `409` avec `outcome = rejected_not_started` si l’instance n’a pas encore d’exécution courante
- `409` avec `outcome = rejected_not_active` si l’exécution courante est clôturée
- `409` avec `outcome = rejected_not_current` si la route cible une sélection historique

### Webhooks de description {#describe-webhooks}

Les routes de description permettent d’inspecter en HTTP l’état d’une instance ou d’une exécution :

```text
GET /webhooks/instances/{workflowId}/describe
GET /webhooks/instances/{workflowId}/runs/{runId}/describe
```

`workflowId` est l’identifiant public d’instance. La route d’instance renvoie l’état de l’exécution courante. La route d’exécution décrit un identifiant précis, y compris historique ou déjà clôturé.

La description est une inspection en lecture seule. Elle ne crée pas de ligne durable de commande et ne relit pas le workflow. Elle renvoie les métadonnées d’instance, l’état courant ou sélectionné, les champs de résumé et les actions disponibles à partir des projections validées.

Exemple de description :

```bash
curl "https://example.com/webhooks/instances/order-123/describe"
```

Réponse pour un workflow actif :

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "waiting",
    "status_bucket": "running",
    "closed_reason": null,
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": null,
    "last_progress_at": "2026-04-12T12:00:01+00:00",
    "wait_kind": "signal",
    "wait_reason": "Waiting for signal [approved-by]"
  },
  "run_count": 1,
  "actions": {
    "can_signal": true,
    "can_query": true,
    "can_update": true,
    "can_cancel": true,
    "can_terminate": true
  },
  "reason": null
}
```

Réponse pour un workflow arrêté de force :

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": {
    "workflow_run_id": "01J...",
    "run_number": 1,
    "is_current_run": true,
    "status": "terminated",
    "status_bucket": "failed",
    "closed_reason": "terminated",
    "compatibility": "build-a",
    "connection": "redis",
    "queue": "default",
    "started_at": "2026-04-12T12:00:00+00:00",
    "closed_at": "2026-04-12T12:01:00+00:00",
    "last_progress_at": "2026-04-12T12:01:00+00:00",
    "wait_kind": null,
    "wait_reason": null
  },
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": null
}
```

La disponibilité des actions indique si l’opération peut réussir maintenant : les exécutions clôturées n’acceptent pas de commandes, les workflows uniquement distants ne peuvent traiter localement les requêtes de lecture ou mises à jour, et les exécutions non courantes ne reçoivent ni signaux, ni mises à jour, ni annulations, ni arrêts forcés.

Exemple de description ciblant une exécution :

```bash
curl "https://example.com/webhooks/instances/order-123/runs/01J.../describe"
```

La réponse contient les mêmes données, mais `is_current_run` vaut `false` pour une sélection historique et toutes les actions de mutation affichent `false`.

Réponse si l’instance est introuvable :

```json
{
  "found": false,
  "workflow_instance_id": "order-123",
  "workflow_type": null,
  "workflow_class": null,
  "business_key": null,
  "run": null,
  "run_count": 0,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "instance_not_found"
}
```

Réponse si l’instance existe mais que l’exécution sélectionnée est introuvable :

```json
{
  "found": true,
  "workflow_instance_id": "order-123",
  "workflow_type": "order-workflow",
  "workflow_class": "App\\Workflows\\OrderWorkflow",
  "business_key": "order-123",
  "run": null,
  "run_count": 1,
  "actions": {
    "can_signal": false,
    "can_query": false,
    "can_update": false,
    "can_cancel": false,
    "can_terminate": false
  },
  "reason": "run_not_found"
}
```

Matrice actuelle des réponses HTTP des webhooks de description :

- `200` si l’instance est trouvée, que l’exécution soit active, clôturée ou historique
- `200` si l’instance est trouvée mais pas l’exécution sélectionnée (`reason = run_not_found`)
- `401` en cas d’échec d’authentification
- `404` si l’identifiant d’instance n’existe pas (`reason = instance_not_found`)


### Webhook de démarrage du plan de contrôle {#control-plane-start-webhook}

Une route de démarrage du plan de contrôle accepte directement une clé durable de type, sans exiger une classe de workflow résoluble localement. C’est le chemin préféré d’un consommateur externe pilotant les workflows par clés de type plutôt que par alias de classes PHP.

```text
POST /webhooks/control-plane/start
```

Le corps de la requête accepte :

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `workflow_type` | string | oui | Clé durable de type de workflow |
| `instance_id` | string | non | Identifiant public d’instance fourni par l’appelant |
| `arguments` | string | non | Arguments sérialisés avec indication de codec |
| `connection` | string | non | Remplacement de la connexion de file |
| `queue` | string | non | Remplacement du nom de file |
| `business_key` | string | non | Clé métier fournie par l’appelant |
| `labels` | object | non | Étiquettes de visibilité |
| `memo` | object | non | Métadonnées non indexées |
| `duplicate_start_policy` | string | non | `reject_duplicate` ou `return_existing_active` |

Exemple de requête :

```bash
curl -X POST "https://example.com/webhooks/control-plane/start" \
     -H "Content-Type: application/json" \
     -d '{
           "workflow_type": "order-workflow",
           "instance_id": "order-123",
           "arguments": "{\"orderId\":123}",
           "connection": "redis",
           "queue": "default",
           "business_key": "order-123",
           "labels": {"tenant": "acme"}
         }'
```

Réponse pour un workflow nouvellement démarré :

```json
{
  "started": true,
  "workflow_instance_id": "order-123",
  "workflow_run_id": "01J...",
  "workflow_type": "order-workflow",
  "outcome": "started_new",
  "task_id": "01J...",
  "reason": null
}
```

Si `instance_id` est omis, le moteur génère automatiquement un identifiant d’instance basé sur un ULID.

Si la clé de type correspond à une classe résoluble localement via `workflows.v2.types.workflows` ou l’attribut `#[Type(...)]`, l’instantané complet du contrat de commandes et le routage sont appliqués au démarrage. Sinon, l’instance est créée avec la clé et le routage explicite des options. L’instantané du contrat et l’empreinte de définition sont différés au worker prenant la première tâche. Un consommateur externe peut donc démarrer des clés de type que seul le parc de workers sait résoudre.

Matrice actuelle des réponses HTTP du webhook de démarrage du plan de contrôle :

- `202` avec `outcome = started_new` si une exécution est créée
- `200` avec `outcome = returned_existing_active` si l’exécution active est réutilisée
- `409` avec `outcome = rejected_duplicate` si le doublon est rejeté
- `401` en cas d’échec d’authentification
- `422` si `workflow_type` manque ou si `instance_id` est invalide

Le contrat `WorkflowControlPlane` est aussi disponible comme singleton résoluble par le conteneur. Résolvez `Workflow\V2\Contracts\WorkflowControlPlane` depuis le conteneur Laravel pour appeler `start()`, `signal()`, `query()`, `update()`, `cancel()`, `terminate()` et `describe()` directement depuis du code PHP, des tests ou des commandes Artisan.

Le système couvre l’admission de démarrage par alias explicite, les webhooks de signal, mise à jour, requête de lecture, description, réparation, annulation et arrêt forcé visant instances ou exécutions, les routes d’interrogation de tâches de workflow et d’activité, ainsi que le démarrage du plan de contrôle par clé de type.
