---
sidebar_position: 5
title: Protocole worker
description: Implémenter le protocole versionné du plan worker pour les interrogations, baux, relectures d'historique, heartbeats, finalisations et résultats de tâches externes.
tags:
  - worker-protocol
  - external-workers
  - polyglot
keywords:
  - protocole worker
  - interrogation des workers externes
  - passerelle de tâches de workflow
---

# Protocole worker {#worker-protocol}

Durable Workflow expose un protocole worker versionné via deux contrats de
passerelle. Ces contrats définissent l'ensemble des opérations utilisées par
les workers externes, y compris le serveur Durable Workflow autonome, pour
interroger, prendre en charge, exécuter et terminer les tâches de workflow et d'activité.

## Version du protocole {#protocol-version}

La version du protocole actuellement annoncée par le serveur est **1.20**.
La numérotation suit un modèle de type semver :

- La version **majeure** augmente pour un changement incompatible (nouveaux
  champs obligatoires, opérations supprimées, sémantique de pagination modifiée).
- La version **mineure** augmente pour des ajouts (nouveaux champs facultatifs,
  nouveaux types de commandes non terminales).

Les workers peuvent utiliser une version mineure antérieure dans la même
version majeure. Un serveur annonçant `1.N` accepte
`X-Durable-Workflow-Protocol-Version: 1.M` si `M <= N` et renvoie son `1.N`
annoncé dans la réponse. Le serveur par défaut `1.20` accepte donc les
versions de requête de `1.0` à `1.20`. Découvrez avant déploiement la version
mineure requise et le profil de capacités facultatives de chaque SDK.
Les en-têtes absents ou mal formés, les versions majeures différentes et les
versions mineures de worker plus récentes que le serveur sont rejetés.

Les SDK PHP 2.3.2, Python 2.5.7 et Rust 3.5.0 utilisent `1.20` par défaut.
Ces versions permettent aussi de sélectionner explicitement `1.19` pour un
Server antérieur compatible. Les capacités facultatives des workers, dont
l'annulation coopérative, restent soumises à une activation explicite. Choisir
une version de protocole ne les active pas. Consultez la
[documentation de chaque SDK](/docs/polyglot/deployment-modes/) pour sa
configuration et ses métadonnées de compatibilité publiées.

Vous pouvez récupérer la description complète du protocole par programmation :

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$summary = WorkerProtocolVersion::describe();
// Returns version, verb lists, command types, and pagination defaults.
```

## Découverte des capacités {#capability-discovery}

Le serveur autonome publie les capacités du protocole worker sous
`worker_protocol.server_capabilities` dans `GET /api/cluster/info`. Le même
objet est repris sous `server_capabilities` dans les réponses du plan worker,
y compris celles d'interrogation, de heartbeat, de finalisation et d'échec.

Lisez ces champs avant d'envoyer des champs de commande facultatifs :

- `supported_workflow_task_commands` : types de commandes acceptés par la
  finalisation d'une tâche de workflow.
- `poll_status` : les réponses d'interrogation portent un état lisible par
  machine même sans tâche louée, distinguant `leased`, `empty`, `throttled` et
  `unavailable` sans imposer de déduire l'état de file de `task: null`.
- `activity_retry_policy` et `activity_timeouts` : options de nouvelle
  tentative et de délai des commandes d'activité.
- `worker_session_verbs` et `worker_sessions` : opérations du cycle de vie des
  sessions de workers, champs des commandes d'activité, renouvellement,
  détection des échecs et états terminaux. La forme du runtime des sessions
  est spécifiée par
  [`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json).
- `child_workflow_retry_policy` et `child_workflow_timeouts` : options de
  nouvelle tentative et de délai des workflows enfants.
- `parent_close_policy` : prise en charge de la politique de fermeture du parent des enfants.
- `query_tasks` : tâches de requête de workflow routées par le serveur vers les runtimes externes.
- `non_retryable_failures` : prise en charge des métadonnées d'échec des workflows et activités.

Avant toute interrogation, chaque worker doit inscrire son espace de noms,
sa file de tâches, son runtime, ses clés de types pris en charge et sa capacité
locale via `POST /api/worker/register`. La référence
[Espaces de noms, authentification et inscription des workers](/docs/polyglot/namespace-auth-workers)
fige cette charge d'inscription et le contrat d'authentification par rôle.
Consultez [Appariement et distribution des tâches](/docs/polyglot/task-matching-dispatch)
pour le contrat général de découverte des tâches prêtes et d'attribution des
baux, et les [sessions de workers](/docs/features/worker-sessions) pour
l'affinité des activités entre plusieurs étapes durables.

## Sémantique d'exécution {#execution-semantics}

Le transport worker est une coordination distribuée au moins une fois, pas une
livraison exactement une fois :

- la relecture d'une tâche de workflow reconstruit l'état à partir de
  l'historique validé ; ce n'est pas une nouvelle tentative du workflow ;
- l'expiration du bail d'une tâche d'activité peut déclencher sa relivraison à un autre worker ;
- les rapports tardifs de finalisation ou d'échec peuvent être rejetés comme
  périmés, une autre tentative ayant déjà gagné la course durable.

Utilisez `activity_execution_id` comme clé d'idempotence distante par défaut
quand un worker ou transporteur communique avec un autre système. N'utilisez
`activity_attempt_id` que si le système aval doit distinguer les essais
séparés d'une même exécution logique d'activité.

Lisez [Garanties d'exécution et idempotence](/docs/constraints/execution-guarantees)
pour le contrat de référence de relecture, nouvelles tentatives, expiration
des baux, relivraison et historique durable exactement une fois derrière ces opérations.

## Passerelle de tâches de workflow {#workflow-task-bridge}

Le contrat `WorkflowTaskBridge` définit l'interaction d'un worker externe avec
les tâches durables de workflow :

| Opération | Description |
|------|-------------|
| `poll` | Trouver les tâches de workflow prêtes correspondant aux critères de file et de compatibilité |
| `claim` / `claimStatus` | Prendre une tâche précise en acquérant un bail de 5 minutes |
| `historyPayload` | Récupérer l'historique complet de relecture d'une tâche prise en charge |
| `historyPayloadPaginated` | Récupérer l'historique par pages pour les grands workflows |
| `execute` | Prendre et exécuter une tâche dans le processus avec l'exécuteur du paquet |
| `complete` | Soumettre les commandes d'un worker externe pour terminer une tâche |
| `fail` | Enregistrer un échec de tâche depuis un worker externe |
| `heartbeat` | Prolonger le bail d'une tâche prise en charge |

### Historique paginé {#paginated-history}

Pour les workflows à historique volumineux, utilisez `historyPayloadPaginated`
pour récupérer les événements par pages :

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;

$bridge = app(WorkflowTaskBridge::class);

$afterSequence = 0;
$allEvents = [];

do {
    $page = $bridge->historyPayloadPaginated($taskId, $afterSequence, 500);
    $allEvents = array_merge($allEvents, $page['history_events']);
    $afterSequence = $page['next_after_sequence'] ?? $afterSequence;
} while ($page['has_more']);
```

La taille de page par défaut est de 500 événements (comme
`WorkerProtocolVersion::DEFAULT_HISTORY_PAGE_SIZE` et la valeur
`default_history_page_size` publiée dans les capacités du protocole worker) ;
le maximum est de 1000. Les serveurs peuvent annoncer une autre valeur par
défaut effective dans le manifeste : préférez lire la capacité publiée plutôt
que coder l'un de ces nombres en dur. La réponse inclut `has_more` et
`next_after_sequence` pour la pagination par curseur.

### Compression de l'historique {#history-compression}

Pour les historiques très volumineux, la passerelle ou le serveur peut
compresser les événements pour réduire la taille du transfert. La compression
est facultative : l'appelant doit la demander par un paramètre de type `Accept-Encoding`.

Si le nombre d'événements d'une réponse dépasse le seuil de compression
(50 événements), la passerelle peut renvoyer :

- `history_events` : `[]` (tableau vide indiquant que les événements sont dans la clé compressée) ;
- `history_events_compressed` : charge utile compressée encodée en base64 ;
- `history_events_encoding` : algorithme utilisé (`gzip` ou `deflate`).

L'appelant décode base64, décompresse avec l'algorithme indiqué et décode le
résultat JSON pour retrouver le tableau `history_events` d'origine.

```php
use Workflow\V2\Support\HistoryPayloadCompression;

// Compress a history payload for transfer (bridge/server side).
$compressed = HistoryPayloadCompression::compress($payload, 'gzip');

// Decompress on the worker side.
$original = HistoryPayloadCompression::decompress($compressed);
```

Si l'appelant ne demande pas la compression, ou si le nombre d'événements est
sous le seuil, la réponse contient le tableau standard `history_events` non compressé.

### Sémantique d'interrogation longue {#long-poll-semantics}

Les deux opérations `poll` proposent un mode d'interrogation longue
facultatif. Si l'appelant inclut `timeout_seconds`, la passerelle ou le serveur
garde la connexion ouverte jusqu'à cette durée en attendant qu'une tâche
correspondante soit prête, plutôt que de renvoyer immédiatement un résultat vide.

| Paramètre | Valeur par défaut | Min | Max |
|-----------|---------|-----|-----|
| `timeout_seconds` | 30 | 1 | 60 |

Comportement :

- Une tâche devenant prête pendant l'attente est renvoyée immédiatement.
- Si le délai expire sans tâche, la réponse conserve l'enveloppe normale et
  renvoie `task: null` avec `poll_status: "empty"`.
- Le client devrait réessayer immédiatement après une réponse vide, sauf s'il s'arrête.
- Les délais HTTP de transport devraient dépasser 60 secondes pour éviter les déconnexions prématurées.

Chaque réponse d'interrogation worker inclut `poll_status` :

| Valeur | Signification |
|------|---------|
| `leased` | Le serveur a loué une tâche à ce worker. |
| `empty` | Aucune tâche correspondante n'était prête avant la fin de l'interrogation courte ou du délai d'interrogation longue. |
| `throttled` | Les limites d'admission ont empêché la location malgré la présence possible de tâches prêtes dans la file. |
| `unavailable` | La file ou le chemin d'appariement était temporairement indisponible ; le worker devrait traiter l'interrogation comme un échec transitoire d'infrastructure. |

Examinez `poll_status` avant de supposer qu'une interrogation vide signifie une
capacité inutilisée. `task: null` avec `poll_status: "throttled"` est de la
contre-pression, pas une absence de travail.

```php
use Workflow\V2\Support\WorkerProtocolVersion;

$semantics = WorkerProtocolVersion::longPollSemantics();
// ['default_timeout_seconds' => 30, 'min_timeout_seconds' => 1, 'max_timeout_seconds' => 60]

// Clamp a caller-supplied timeout to the valid range.
$clamped = WorkerProtocolVersion::clampLongPollTimeout($userTimeout);
```

### État des réponses d'interrogation {#poll-response-status}

Le serveur conserve un contrat unique pour les interrogations des tâches de
workflow, d'activité et de requête de lecture :

- `task` : charge utile de la tâche louée, ou `null` si aucune n'a été louée.
- `poll_status` : résultat lisible par machine de la tentative d'interrogation.
- `protocol_version` et `server_capabilities` : champs repris du manifeste du protocole worker.

Les workers devraient examiner `poll_status` avant toute supposition sur
`task` propre à une route :

| `poll_status` | État HTTP habituel | Signification |
| --- | --- | --- |
| `leased` | `200` | Le serveur a loué du travail et `task` contient la charge utile. |
| `empty` | `200` | Aucune tâche correspondante n'était prête avant le retour de l'interrogation. |
| `throttled` | `200` | Les limites d'admission de la file ont retenu un nouveau bail pour cette tentative. |
| `unavailable` | `503` ou `200` | Le serveur n'a pas pu coordonner la file en toute sécurité et a renvoyé un résultat typé d'indisponibilité. |
| `draining` | `409` | La cohorte build-id du worker est en drainage ; le serveur refuse tout nouveau bail et renvoie `reason: "worker_draining"`. |

### Requêtes de finalisation, de heartbeat et d'échec {#completion-heartbeat-and-fail-requests}

Les points `complete`, `heartbeat` et `fail` des tâches de workflow exigent
tous que le worker répète deux champs d'identité du bail provenant de la
réponse d'interrogation ou de prise en charge :

| Champ | Type | Description |
|------|------|-------------|
| `lease_owner` | chaîne | Identité du worker détenant le bail. Doit correspondre au `lease_owner` renvoyé par `poll` ou `claim`. |
| `workflow_task_attempt` | entier ≥ 1 | Numéro de tentative de la tâche sous bail. Doit correspondre au `workflow_task_attempt` renvoyé par `poll` ou `claim`. |

Les tentatives périmées ou les mauvais détenteurs de bail sont rejetés avant
l'application des commandes : un worker au bail expiré ne peut donc pas
valider de commandes de relecture sur une tâche reprise par un autre worker.

Points de terminaison et corps des requêtes :

- `POST /api/worker/workflow-tasks/{task_id}/complete` : exige `lease_owner`,
  `workflow_task_attempt` et un tableau `commands` non vide. Voir les
  [types de commandes](#command-types) pour leur forme.
- `POST /api/worker/workflow-tasks/{task_id}/heartbeat` : exige `lease_owner`
  et `workflow_task_attempt`. Renvoie l'expiration du bail renouvelé et l'état
  actuel de l'exécution.
- `POST /api/worker/workflow-tasks/{task_id}/fail` : exige `lease_owner`,
  `workflow_task_attempt` et un objet `failure` contenant `message`
  (obligatoire), plus `type` et `stack_trace` facultatifs.

Exemple de requête de finalisation :

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "commands": [
    { "type": "complete_workflow" }
  ]
}
```

Exemple de requête de heartbeat :

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1
}
```

Exemple de requête d'échec :

```json
{
  "lease_owner": "py-worker-1",
  "workflow_task_attempt": 1,
  "failure": {
    "message": "Replay mismatch at event 7",
    "type": "DeterminismFailed"
  }
}
```

### Types de commandes {#command-types}

Pour terminer une tâche de workflow, le worker externe soumet une liste de
commandes typées. Au plus une commande terminale est autorisée par finalisation.

**Commandes non terminales** (zéro ou plus, traitées dans l'ordre) :

| Type | Champs obligatoires | Description |
|------|----------------|-------------|
| `schedule_activity` | `activity_type` | Planifier l'exécution d'une tâche d'activité |
| `start_timer` | `delay_seconds` | Planifier un temporisateur durable |
| `start_child_workflow` | `workflow_type` | Démarrer une instance de workflow enfant |
| `complete_update` | `update_id` | Marquer une mise à jour acceptée comme appliquée et terminée |
| `fail_update` | `update_id`, `message` | Marquer une mise à jour acceptée comme échouée |
| `record_side_effect` | `result` | Enregistrer un résultat déterministe d'effet de bord |
| `record_version_marker` | `change_id`, `version`, `min_supported`, `max_supported` | Enregistrer une décision de versionnement |
| `upsert_search_attributes` | `attributes` | Insérer ou mettre à jour des métadonnées indexées de l'exécution |

`schedule_activity` accepte les champs facultatifs `retry_policy`,
`start_to_close_timeout`, `schedule_to_start_timeout`,
`schedule_to_close_timeout` et `heartbeat_timeout`. `retry_policy` utilise
`max_attempts`, `backoff_seconds` et `non_retryable_error_types`.

`start_child_workflow` accepte les champs facultatifs `parent_close_policy`,
`retry_policy`, `execution_timeout_seconds` et `run_timeout_seconds`.
`parent_close_policy` vaut `abandon`, `request_cancel`, `request_cancellation`
ou `terminate`. `request_cancel` ferme immédiatement l'enfant ;
`request_cancellation` demande un nettoyage coopératif avec l'identité et
l'échéance d'annulation d'origine. Voir l'[annulation coopérative](/docs/polyglot/cancellation).
La politique de nouvelle tentative des enfants utilise le même objet
`max_attempts`, `backoff_seconds` et `non_retryable_error_types` que les
activités. L'attente s'applique après l'échec d'une exécution enfant. Les
commandes invalides de démarrage d'enfant sont des erreurs de protocole et ne
consomment pas de tentative enfant.

`complete_update` ferme la mise à jour acceptée nommée par `update_id` après
application de son gestionnaire par le worker. Elle accepte un `result`
facultatif utilisant la même enveloppe `{codec, blob}` que les résultats de
workflow. `fail_update` ferme la mise à jour acceptée en échec et accepte les
champs facultatifs `exception_class`, `exception_type` et `non_retryable`,
en plus du `message` obligatoire.

**Commandes terminales** (au plus une) :

| Type | Champs obligatoires | Description |
|------|----------------|-------------|
| `complete_workflow` | — | Marquer l'exécution terminée (`result` facultatif) |
| `fail_workflow` | `message` | Marquer l'exécution échouée |
| `continue_as_new` | — | Fermer l'exécution et en démarrer une nouvelle (`arguments`, `workflow_type` facultatifs) |

Si une commande d'annulation ou de terminaison ferme l'exécution pendant le
bail d'une tâche de workflow, les appels `history`, `heartbeat`, `complete`
et `fail` conservent l'enveloppe du protocole mais rejettent avec
`reason: "run_closed"`. La réponse inclut aussi `can_continue: false`,
`cancel_requested: true` et un `stop_reason` concret comme `run_cancelled` ou
`run_terminated` pour distinguer l'observation d'annulation d'une erreur
générique de bail. Elle inclut `run_closed_reason` et `run_closed_at` issus de
l'enregistrement durable de l'exécution pour journaliser l'état exact de
fermeture ayant arrêté la tâche sous bail.

Les réponses d'interrogation de tâches de workflow incluent un contexte de
reprise stable copié de la charge utile durable de la tâche :

| Champ | Signification |
|------|---------|
| `workflow_wait_kind` | Attente appliquée par la tâche : `update`, `signal`, `child`, `condition`, `timer`, ou `null` pour les tâches ordinaires de relecture/démarrage |
| `open_wait_id` | Identité stable d'attente comme `update:{id}` ou `signal-application:{id}` |
| `resume_source_kind` / `resume_source_id` | Source durable ayant réveillé la tâche, comme `workflow_update`, `workflow_signal`, `timer` ou `child_workflow_run` |
| `workflow_update_id` | Identifiant de mise à jour acceptée lorsque la tâche applique une mise à jour |
| `workflow_signal_id` | Identifiant de signal accepté lorsque la tâche applique un signal |
| `signal_name` / `signal_wait_id` | Cible du signal et identité stable d'attente lorsque la tâche applique un signal ou une attente de signal avec temporisateur |
| `workflow_command_id` | Identifiant de commande du plan de contrôle ayant produit la tâche, si disponible |
| `activity_execution_id` / `activity_attempt_id` / `activity_type` | Identifiants d'activité lors d'une reprise après activité terminée ou échouée |
| `child_call_id` / `child_workflow_run_id` | Identifiants d'attente enfant lorsque la tâche résout un workflow enfant |
| `timer_id` / `condition_wait_id` | Identifiants de temporisateur pur et de condition avec temporisateur lors d'une reprise après temporisateur |
| `condition_key` / `condition_definition_fingerprint` | Libellé stable de condition et empreinte du prédicat lorsqu'une attente de condition avec temporisateur les a enregistrés |
| `workflow_sequence` / `workflow_event_type` | Séquence d'historique et type d'événement des tâches de résolution d'activité, d'enfant et de temporisateur fondées sur un événement |

Les champs non applicables valent `null`. Les workers des SDK devraient les
préférer au parcours de l'historique pour corréler une tâche sous bail à une
mise à jour acceptée, un signal, un résultat d'activité, une résolution enfant
ou une attente avec temporisateur. Les reprises de temporisateur pur fixent
`workflow_wait_kind: "timer"`, `open_wait_id: "timer:{timer_id}"`,
`resume_source_kind: "timer"` et `timer_id`. Les reprises par signal fixent
`workflow_wait_kind: "signal"` et `signal_name` ; les tâches d'application de
signal accepté fixent aussi `workflow_signal_id`, et les attentes de signal
avec temporisateur fixent `signal_wait_id` avec le `timer_id` déclenché. Les
reprises sur expiration de condition fixent `workflow_wait_kind: "condition"`,
`condition_wait_id` et, pour les attentes à clé, `condition_key` et
`condition_definition_fingerprint`.

## Tâches de requête de lecture {#query-tasks}

Si une requête du plan de contrôle vise un workflow dont le code appartient à
un runtime externe, le serveur autonome ne peut pas le relire dans son
processus PHP. Il crée alors une tâche de requête éphémère et attend qu'un
worker actif capable de requêtes sur la file du workflow l'exécute. Cela
inclut les workers distants du SDK PHP dont le code workflow est hors du
processus Server.

Ces tâches sont en lecture seule. Les workers relisent l'historique fourni,
invoquent le gestionnaire enregistré, puis terminent ou font échouer la tâche.
Elles n'écrivent aucun événement d'historique durable et ne sont pas réessayées
après expiration de la requête du plan de contrôle de l'appelant.

| Point de terminaison | Description |
|----------|-------------|
| `POST /api/worker/query-tasks/poll` | Interrogation longue d'une tâche de requête sur la file inscrite du worker |
| `POST /api/worker/query-tasks/{query_task_id}/complete` | Soumettre le résultat de requête |
| `POST /api/worker/query-tasks/{query_task_id}/fail` | Rejeter ou faire échouer la requête |

Requête d'interrogation :

```json
{
  "worker_id": "py-worker-1",
  "task_queue": "orders"
}
```

Réponse d'interrogation :

```json
{
  "poll_status": "leased",
  "task": {
    "query_task_id": "01J...",
    "query_task_attempt": 1,
    "workflow_id": "order-123",
    "run_id": "01J...",
    "workflow_type": "order-processing",
    "query_name": "status",
    "payload_codec": "avro",
    "workflow_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "query_arguments": { "codec": "avro", "blob": "<base64-avro-bytes>" },
    "history_events": [],
    "task_queue": "orders",
    "lease_owner": "py-worker-1",
    "lease_expires_at": "2026-04-18T12:00:00.000000Z"
  },
  "protocol_version": "1.13",
  "server_capabilities": { "query_tasks": true }
}
```

`task` vaut `null` quand l'interrogation ne renvoie aucun bail. `poll_status`
distingue une attente vide ordinaire d'une limitation ou indisponibilité
temporaire de la file. Le worker doit répéter `lease_owner` et
`query_task_attempt` en finalisation ou échec ; les tentatives périmées et
mauvais détenteurs de bail sont rejetés.

Requête de finalisation :

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "result": { "status": "ready" },
  "result_envelope": { "codec": "avro", "blob": "<base64-avro-bytes>" }
}
```

Requête d'échec :

```json
{
  "lease_owner": "py-worker-1",
  "query_task_attempt": 1,
  "failure": {
    "reason": "rejected_unknown_query",
    "message": "unknown query 'status'",
    "type": "QueryFailed"
  }
}
```

Utilisez `reason: "rejected_unknown_query"` si le type de workflow n'a aucun
gestionnaire de requête correspondant ; l'appelant reçoit `404`. Les autres
échecs de requête côté worker devraient utiliser `reason: "query_rejected"`
et renvoyer `409`. Sans worker actif acceptant la requête, le plan de contrôle
renvoie `query_worker_unavailable` ; sans résultat avant le délai configuré,
il renvoie `query_worker_timeout`.

## Passerelle de tâches d'activité {#activity-task-bridge}

Le contrat `ActivityTaskBridge` définit l'interaction d'un worker externe avec
les tâches d'activité :

| Opération | Description |
|------|-------------|
| `poll` | Trouver les tâches d'activité prêtes correspondant aux critères de file et de compatibilité |
| `claim` / `claimStatus` | Prendre une tâche d'activité précise sous bail |
| `complete` | Enregistrer la finalisation de l'activité avec un résultat |
| `fail` | Enregistrer l'échec de l'activité avec des `failure.details` facultatifs étiquetés par codec |
| `status` | Vérifier la présence et l'état d'annulation sans renouveler le bail |
| `heartbeat` | Prolonger le bail et signaler une progression facultative |

Les réponses de heartbeat d'activité incluent `can_continue` et
`cancel_requested`, permettant aux activités longues de réagir aux demandes
d'annulation. Si une commande d'annulation ou de terminaison d'exécution
arrête une activité sous bail, les réponses de heartbeat, de finalisation et
d'échec incluent aussi `run_closed_reason` et `run_closed_at`.

## Codecs des charges utiles {#payload-codecs}

Chaque chaîne d'octets de charge utile franchissant la frontière du protocole
worker est étiquetée avec un **`payload_codec`** nommant le format du blob
associé. La v2 utilise un codec indépendant du langage : **`avro`**. Tout SDK
(PHP, Python, Go, TypeScript, Rust) peut ainsi encoder et décoder sans partager
de runtime ni de clé applicative. Le serveur en cours annonce ses codecs pris
en charge dans `GET /api/cluster/info` sous **`capabilities.payload_codecs`**.

### Le codec `avro` {#the-avro-codec}

`avro` est le codec v2 de valeurs typées. Chaque charge utilise le schéma
récursif fixe `durable_workflow.protocol.Value` et une trame Avro single-object
standard. Ses branches nommées préservent booléens, entiers signés 64 bits,
doubles finis, octets, chaînes UTF-8, listes et tables à clés chaînes, sans
schémas propres au workflow ni registre. Voir le
[protocole Avro Value](/docs/polyglot/avro-value-protocol/).

### Format de transport : enveloppe de charge utile {#wire-format-payload-envelope}

Pour les champs portant des octets (`arguments`, `result`, `payload`, etc.),
le protocole worker expose le codec avec la chaîne opaque. Les réponses
d'interrogation ressemblent à ceci :

```json
{
  "task_id": "...",
  "payload_codec": "avro",
  "arguments": {
    "codec": "avro",
    "blob": "<base64-avro-bytes>"
  },
  "history_events": [ ... ]
}
```

Le worker lit `payload_codec` et confirme sa valeur `avro` avant décodage.
Un codec inconnu est une erreur : le worker ne devrait pas tenter de deviner
ni de détecter son format.

Les finalisations d'activité envoient `result` dans la même enveloppe
`{codec, blob}`. Les échecs peuvent envoyer des diagnostics structurés dans
`failure.details` ; s'il est présent, ce champ est lui aussi une enveloppe
`{codec, blob}`. Le serveur conserve le blob tel quel et enregistre
`details_payload_codec` avec la charge durable de l'échec pour que les workers
non PHP puissent échanger ces données sans sérialisation PHP.

L'interface d'échec stable entre langages est `activity_type`,
`failure_category`, `exception_type`, `message`, `code`, `non_retryable` et
`details` étiqueté par codec. Les champs du runtime tels que noms de classes
d'exception, chemins de fichiers sources, numéros de ligne et traces de pile
ne sont que des diagnostics. Les SDK ne devraient pas les exposer dans leur
`exception_payload` par défaut ; ils peuvent seulement les présenter si un
worker ou serveur enregistre explicitement une enveloppe `diagnostics` ou
`runtime_diagnostics`.

### Démarrer un workflow {#starting-a-workflow}

`POST /api/workflows` accepte deux formes de `input` :

1. **Tableau JSON simple** : le serveur adapte chaque valeur JSON au schéma
   Avro Value fixe. JSON ne peut exprimer la branche d'octets ; les clients
   ayant besoin d'octets envoient une enveloppe Avro explicite.

   ```json
   { "workflow_type": "MyWorkflow", "input": ["hello", 42] }
   ```

2. **Enveloppe explicite** : pour les clients disposant déjà d'octets préencodés :

   ```json
   {
     "workflow_type": "MyWorkflow",
     "input": { "codec": "avro", "blob": "<base64-avro-bytes>" }
   }
   ```

Le serveur stocke le blob tel quel et étiquette l'exécution avec le codec `avro`.

Le codec est stocké sur `WorkflowRun` et **se propage pendant toute la vie de
l'exécution** : arguments et résultats d'activités, arguments de signaux/mises
à jour et entrées de workflows enfants sont tous encodés en Avro.

Les démarrages embarqués/du paquet (depuis PHP via
`WorkflowStub::make(...)->start(...)` plutôt que l'API HTTP) déterminent aussi
le codec par défaut des nouvelles exécutions à partir du contrat exclusivement
Avro de la v2 finale.

## Résoudre les passerelles {#resolving-the-bridges}

Les deux passerelles sont inscrites dans le conteneur Laravel et se résolvent directement :

```php
use Workflow\V2\Contracts\WorkflowTaskBridge;
use Workflow\V2\Contracts\ActivityTaskBridge;

$workflowBridge = app(WorkflowTaskBridge::class);
$activityBridge = app(ActivityTaskBridge::class);
```

## Guides associés {#related-guides}

- [Server](./server.md) documente les points de terminaison du plan de
  contrôle et la forme de déploiement hébergeant ce protocole.
- [Interface d'exécution externe](./external-execution.md) explique les
  contrats de niveau activité des workers, passerelles et gestionnaires
  construits sur le protocole worker.
