---
sidebar_position: 5
---

# Limites structurelles {#structural-limits}

Les limites structurelles plafonnent la consommation de ressources d’une exécution de workflow. Lorsqu’une opération dépasserait une limite configurée, le moteur enregistre un échec typé avec la catégorie lisible par machine `structural_limit` et le type précis de limite, puis fait échouer l’exécution. Cela protège le système contre les déploiements parallèles non bornés, les données utiles trop volumineuses et l’accumulation de métadonnées.

## Types de limites {#limit-kinds}

| Type de limite | Valeur par défaut | Ce qu’elle plafonne |
|---|---|---|
| `pending_activity_count` | 2 000 | Exécutions d’activité non terminales ouvertes simultanément |
| `pending_child_count` | 1 000 | Workflows enfants non terminaux ouverts simultanément |
| `pending_timer_count` | 2 000 | Temporisateurs en attente ouverts simultanément |
| `pending_signal_count` | 5 000 | Signaux non traités simultanément en attente |
| `pending_update_count` | 500 | Mises à jour non résolues simultanément en attente |
| `command_batch_size` | 1 000 | Éléments d’un même groupe parallèle (`all()`) |
| `payload_size_bytes` | 2 MiB | Taille sérialisée des données utiles d’un ensemble d’arguments |
| `memo_size_bytes` | 256 KiB | Taille sérialisée des métadonnées de mémo non indexées |
| `search_attribute_size_bytes` | 40 KiB | Taille sérialisée des métadonnées indexées d’attributs de recherche |
| `history_transaction_size` | 5 000 | Événements d’historique produits par une seule exécution de tâche de workflow |

Toutes les limites sont appliquées lors de la planification, de l’enregistrement ou de l’admission d’une commande. La valeur `0` désactive le contrôle pour le type de limite concerné.

## Avertissements de seuil {#soft-limit-warnings}

Avant qu’une limite stricte termine une exécution ou refuse une commande, le moteur peut signaler qu’une ressource approche de son plafond. Lorsqu’une ressource dénombrable, comme les activités, enfants, temporisateurs, signaux ou mises à jour en attente, la taille d’un lot de commandes ou les événements d’une transaction d’historique, dépasse un pourcentage configurable de la limite stricte, le moteur émet un avertissement structuré.

Le seuil d’avertissement par défaut est de **80 %**. Par exemple, avec la limite `pending_activity_count` par défaut de 2 000, un avertissement est enregistré lorsque l’exécution atteint 1 600 activités en attente. L’exécution continue normalement. L’avertissement laisse aux opérateurs le temps de réagir, en augmentant les workers, en déclenchant une continuation avec une nouvelle exécution ou en relevant la limite, avant que la protection stricte fasse échouer l’exécution.

Configurez le seuil via `workflows.v2.structural_limits.warning_threshold_percent` :

```env
DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT=80
```

La valeur `0` désactive entièrement les avertissements de seuil.

Les avertissements incluent un contexte structuré :

```
[Durable Workflow] Run 42 approaching structural limit [pending_activity_count]: 1620 / 2000 (81% utilization, warning at 80%).
```

Ce contexte comprend `workflow_run_id`, `workflow_type`, `limit_kind`, `current`, `limit` et `utilization_percent` pour l’intégration aux outils d’agrégation des journaux et d’alerte.

## Configuration {#configuration}

Remplacez toute limite via `workflows.v2.structural_limits` dans la configuration ou via les variables d’environnement :

```php
// config/workflows.php
'v2' => [
    'structural_limits' => [
        'pending_activity_count' => (int) env('DW_V2_LIMIT_PENDING_ACTIVITIES', 2000),
        'pending_child_count' => (int) env('DW_V2_LIMIT_PENDING_CHILDREN', 1000),
        'pending_timer_count' => (int) env('DW_V2_LIMIT_PENDING_TIMERS', 2000),
        'pending_signal_count' => (int) env('DW_V2_LIMIT_PENDING_SIGNALS', 5000),
        'pending_update_count' => (int) env('DW_V2_LIMIT_PENDING_UPDATES', 500),
        'command_batch_size' => (int) env('DW_V2_LIMIT_COMMAND_BATCH_SIZE', 1000),
        'payload_size_bytes' => (int) env('DW_V2_LIMIT_PAYLOAD_SIZE_BYTES', 2097152),
        'memo_size_bytes' => (int) env('DW_V2_LIMIT_MEMO_SIZE_BYTES', 262144),
        'search_attribute_size_bytes' => (int) env('DW_V2_LIMIT_SEARCH_ATTRIBUTE_SIZE_BYTES', 40960),
        'history_transaction_size' => (int) env('DW_V2_LIMIT_HISTORY_TRANSACTION_SIZE', 5000),
        'warning_threshold_percent' => (int) env('DW_V2_LIMIT_WARNING_THRESHOLD_PERCENT', 80),
    ],
],
```

## Points d’application {#enforcement-points}

### Limites de nombre en attente côté exécuteur {#pending-count-limits-executor-side}

Avant de planifier une activité, un workflow enfant ou un temporisateur, l’exécuteur compte les éléments de ce type actuellement non terminaux dans l’exécution. Si leur nombre atteint ou dépasse déjà la limite configurée, l’exécution échoue immédiatement avec une `StructuralLimitExceededException`.

Cela protège contre les boucles de lancement parallèle non bornées qui accumulent des milliers d’opérations en attente :

```php
// This will fail if $items exceeds the pending_activity_count limit
$calls = [];
foreach ($items as $item) {
    $calls[] = fn () => activity(ProcessItemActivity::class, $item);
}
return all($calls); // Also checked against command_batch_size
```

Pour traiter de grands lots dans les limites, divisez les éléments en groupes bornés :

```php
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);
}
```

### Limites de nombre en attente côté admission {#pending-count-limits-intake-side}

Lorsqu’une commande de signal ou de mise à jour arrive via le plan de contrôle, un webhook ou `WorkflowStub`, le moteur vérifie le nombre de signaux non traités (état `received`) ou de mises à jour non résolues (état `accepted`) dans l’exécution cible avant d’accepter la commande.

Si ce nombre atteint ou dépasse la limite configurée, la commande est **refusée** avec le motif `structural_limit_exceeded`. La réponse de refus contient des métadonnées lisibles par machine (`structural_limit_kind`, `structural_limit_value`, `structural_limit_configured`) pour identifier la cause.

Les limites côté exécuteur font échouer l’exécution. Celles côté admission refusent la commande individuelle sans terminer le workflow. L’exécution reste active et l’appelant peut réessayer après le traitement des éléments en attente.

```php
// If 5,000 signals are already pending, this will be rejected:
$result = $workflow->attemptSignal('process-item', $data);
if ($result->rejected()) {
    // $result->rejectionReason() === 'structural_limit_exceeded'
    // back off and retry later
}
```

### Taille des lots de commandes {#command-batch-size}

La fonction `all()` compare le nombre total d’opérations feuilles d’un même groupe parallèle à `command_batch_size`. Le contrôle précède la planification de toute activité ou de tout enfant. L’exécution échoue donc proprement, sans planifier seulement une partie du lot.

### Taille des données utiles {#payload-size}

Lorsqu’il planifie une activité ou un workflow enfant, l’exécuteur sérialise les arguments et compare leur taille en octets à `payload_size_bytes`. Si les données sérialisées dépassent la limite, l’exécution échoue avant la création de toute ligne en base pour cette opération.

Cela concerne :

- Les **arguments d’activité**, contrôlés lorsque `scheduleActivity` sérialise les arguments d’`ActivityCall`.
- Les **arguments du workflow enfant**, contrôlés lorsque `scheduleChildWorkflow` sérialise les arguments de démarrage de l’enfant, avant de créer les lignes de son instance ou de son exécution.

```php
// A 3 MiB payload will fail with the default 2 MiB limit
activity(ProcessDocumentActivity::class, $threeMegabyteBlob);
```

Pour respecter cette limite, activez le
[stockage externe des données utiles](../features/external-payload-storage.md)
sur l’espace de noms afin que le runtime décharge automatiquement les données
dépassant le seuil vers un stockage objet configuré, ou stockez vous-même les
octets et transmettez une référence gérée par l’application :

```php
$ref = Storage::put('docs/incoming.pdf', $blob);
activity(ProcessDocumentActivity::class, $ref);
```

Le stockage externe préserve l’intégrité de la relecture en enregistrant dans
l’historique une enveloppe `durable-workflow.v2.external-payload-reference.v1`
avec une empreinte de hachage. La limite s’applique alors à l’enveloppe de
référence plutôt qu’aux octets référencés.

### Taille du mémo {#memo-size}

Lorsqu’un workflow effectue un upsert de mémo via `upsertMemo()`, l’exécuteur fusionne les nouvelles entrées avec le mémo existant, encode le résultat en JSON et compare sa taille en octets à `memo_size_bytes`. Si le mémo fusionné dépasse la limite, l’exécution échoue avant sa persistance.

### Taille des transactions d’historique {#history-transaction-size}

Chaque exécution de tâche de workflow, soit un « tour » de relecture et de progression, peut produire de nouveaux événements d’historique : planification d’activités, création de temporisateurs, enregistrement d’effets de bord, upserts d’attributs de recherche, etc. `history_transaction_size` plafonne le nombre total de nouveaux événements qu’une seule tâche peut produire.

Cela détecte les boucles incontrôlées qui créent un nombre non borné d’événements dans une tâche sans rendre la main :

```php
// If a workflow schedules thousands of operations in one task,
// the history transaction limit prevents the task from growing
// without bound. Process large batches in bounded chunks instead.
foreach (array_chunk($items, 500) as $chunk) {
    $calls = [];
    foreach ($chunk as $item) {
        $calls[] = fn () => activity(ProcessItemActivity::class, $item);
    }
    all($calls);  // Each chunk is a separate task execution
}
```

Le contrôle s’effectue au début de chaque itération de la boucle principale de l’exécuteur. Les événements parcourus pendant la relecture de l’historique existant ne comptent pas. Seuls les nouveaux événements écrits pendant la tâche courante contribuent à la limite.

### Taille des attributs de recherche {#search-attribute-size}

Lorsqu’un workflow effectue un upsert d’attributs via `upsertSearchAttributes()`, l’exécuteur fusionne les nouveaux attributs avec ceux existants, encode le résultat en JSON et compare sa taille en octets à `search_attribute_size_bytes`. Si les attributs fusionnés dépassent la limite, l’exécution échoue avant leur persistance.

## Classification des échecs {#failure-taxonomy}

Lorsqu’une limite structurelle est dépassée, le moteur enregistre :

- Une ligne `WorkflowFailure` avec `failure_category = structural_limit`
- Un événement d’historique `WorkflowFailed` contenant :
  - `failure_category = structural_limit`
  - `structural_limit_kind` : le type de limite dépassée, par exemple `pending_activity_count` ou `command_batch_size`
  - `structural_limit_value` : le nombre ou la taille qui a déclenché la limite
  - `structural_limit_configured` : le plafond configuré

Ces métadonnées sont lisibles par machine. Les opérateurs, Waterline et les outils externes peuvent identifier la cause sans analyser des messages en texte libre.

## Contrôle de santé {#health-check}

La configuration actuelle des limites structurelles figure dans l’instantané du contrôle de santé v2 sous `structural_limits`, afin que les opérateurs voient les plafonds actifs :

```json
{
  "structural_limits": {
    "pending_activity_count": 2000,
    "pending_child_count": 1000,
    "pending_timer_count": 2000,
    "pending_signal_count": 5000,
    "pending_update_count": 500,
    "command_batch_size": 1000,
    "payload_size_bytes": 2097152,
    "memo_size_bytes": 262144,
    "search_attribute_size_bytes": 40960,
    "history_transaction_size": 5000,
    "warning_threshold_percent": 80
  }
}
```

## Limites dépendant du backend {#backend-dependent-limits}

L’instantané des capacités du backend publie le contrat complet des limites structurelles ajusté à l’infrastructure actuelle. La plupart des limites sont indépendantes du backend, mais certains imposent des contraintes supplémentaires :

- **File SQS** : les [délais standard des messages SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html) sont plafonnés à 900 secondes. La couche de transport fractionne les délais plus longs des temporisateurs, nouvelles tentatives d’activité et tâches de workflow. L’instantané des capacités conserve `max_single_timer_delay_seconds: 900` pour la compatibilité.
- **Base SQLite** : SQLite sérialise les écritures. L’instantané indique donc `concurrent_write_safety: limited`. Des limites élevées d’éléments en attente peuvent provoquer des conflits de verrouillage sous la charge de workers concurrents.

Une livraison SQS anticipée planifie un autre message au délai plafonné sans
prendre le bail de la tâche durable, consommer de tentative d’exécution, écrire
d’historique d’exécution ni exécuter de code utilisateur. La valeur initiale de
`available_at` reste inchangée. À l’échéance, la tâche suit l’exécution normale
et les protections contre les livraisons en double. Les échéances globales du
workflow et de l’activité continuent de s’écouler pendant l’attente. Choisissez
donc un délai entre tentatives compatible avec ces budgets. Les pilotes de file
sans plafond de délai conservent exactement le délai demandé.

Le contrat complet figure dans la section `structural_limits` de la réponse des capacités du backend :

```json
{
  "structural_limits": {
    "configured": { "pending_activity_count": 2000, "..." : "..." },
    "backend_adjustments": { "max_single_timer_delay_seconds": 900 },
    "effective": { "pending_activity_count": 2000, "max_single_timer_delay_seconds": 900, "..." : "..." },
    "issues": [
      {
        "component": "structural_limits",
        "severity": "info",
        "code": "queue_max_delay_constraint",
        "message": "The [sqs] queue driver limits delayed dispatch to 900 seconds; longer task delays are chunked by the transport layer."
      }
    ]
  }
}
```

## Waterline {#waterline}

Waterline affiche les échecs de limite structurelle dans la table des exceptions avec la catégorie `structural_limit`. Les détails d’échec de la chronologie incluent le type de limite, la valeur courante et le plafond configuré.

## Limites à l’entrée des requêtes Server {#server-request-boundary-limits}

Avec le serveur autonome, un ensemble distinct de limites s’applique à l’entrée des requêtes HTTP, avant qu’une tâche de workflow, un signal, une mise à jour ou une requête de lecture atteigne le plan de contrôle. Ces contrôles renvoient immédiatement `422 validation_failed`, ou `413 payload_too_large` pour la taille du corps entier. Le client connaît ainsi le motif du refus sans qu’aucune ligne soit écrite en base.

| Limite | Valeur par défaut | Clé de configuration | Ce qu’elle plafonne |
|---|---|---|---|
| Taille du corps | 2 MiB | `server.limits.max_payload_bytes` | Nombre total d’octets du corps HTTP |
| Taille du mémo | 256 KiB | `server.limits.max_memo_bytes` | Mémo sérialisé sur `POST /workflows` et `POST /schedules` |
| Nombre d’attributs de recherche | 100 | `server.limits.max_search_attributes` | Attributs personnalisés enregistrés par espace de noms |
| Longueur de clé d’attribut de recherche | 128 octets | `server.limits.max_search_attribute_key_length` | Longueur d’une clé d’attribut au démarrage |
| Taille de valeur d’attribut de recherche | 2 KiB | `server.limits.max_search_attribute_value_bytes` | Chaque valeur chaîne et chaque élément d’un tableau au démarrage |
| Nom de signal / mise à jour / requête de lecture | 256 octets | `server.limits.max_operation_name_length` | Segment d’URL des noms de signal, mise à jour ou requête de lecture |
| Longueur de `workflow_id` | 128 caractères | validateur du contrôleur | Identifiant du workflow sur `POST /workflows` |
| `workflow_type` / `task_queue` / `business_key` | 255 caractères | validateur du contrôleur | Champs chaîne sur `POST /workflows` |
| `request_id` | 255 caractères | validateur du contrôleur | Jeton de déduplication des signaux/mises à jour/annulations/arrêts forcés |
| `reason` | 1 000 caractères | validateur du contrôleur | Motif des annulations/arrêts forcés/archivages |

Chaque limite se configure individuellement via des variables d’environnement `DW_*`. Consultez `config/dw-contract.php` pour le contrat complet. La valeur `0` désactive le contrôle de cette limite précise, sans désactiver les autres.

Les valeurs actuellement configurées sont publiées sous `limits` dans la réponse de `GET /api/cluster/info`, pour permettre leur découverte par les clients :

```json
{
  "limits": {
    "max_payload_bytes": 2097152,
    "max_memo_bytes": 262144,
    "max_search_attributes": 100,
    "max_search_attribute_key_length": 128,
    "max_search_attribute_value_bytes": 2048,
    "max_operation_name_length": 256,
    "max_pending_activities": 2000,
    "max_pending_children": 2000
  }
}
```

Les erreurs de validation utilisent l’enveloppe d’erreur standard du plan de contrôle avec `reason: "validation_failed"` et une table `validation_errors` indexée par champ en cause (`signal_name`, `update_name`, `query_name`, `search_attributes`, `memo`, etc.). Les refus de taille utilisent `reason: "payload_too_large"` et le code `413`.
