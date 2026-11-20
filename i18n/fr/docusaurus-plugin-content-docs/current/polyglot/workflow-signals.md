---
title: Signal-with-start et signaux entre workflows
description: Démarrer ou réutiliser un workflow et lui envoyer un signal en une seule opération, et signaler durablement un autre workflow depuis le code d’un workflow, avec les SDK PHP, Python et Rust.
---

# Signal-with-start et signaux entre workflows {#signal-with-start-and-workflow-signals}

Le Server natif 3.15.0 ajoute deux opérations de signal :

- **Signal-with-start** est un appel client. Une seule requête démarre le
  workflow ou réutilise son exécution ouverte, et enregistre un signal sur
  cette exécution, dans une seule transaction du Server.
- **Signaler un autre workflow** est une commande de workflow. Le code d’un
  workflow envoie un signal à un autre workflow de son espace de noms. La
  requête et son résultat sont enregistrés une seule fois dans l’historique de
  l’émetteur, et le rejeu ne renvoie jamais le signal.

## Prérequis {#requirements}

| Runtime | Signal-with-start | Signaler un autre workflow |
| --- | --- | --- |
| Server natif | 3.15.0 ou ultérieur, annoncé par `capabilities.signal_with_start` | 3.15.0 ou ultérieur, annoncé par la commande de worker `signal_external_workflow` |
| PHP SDK | 3.22.0 ou ultérieur : `Client::signalWithStart()` | 3.22.0 ou ultérieur : `WorkflowContext::signalExternalWorkflow()` |
| Python SDK | 2.20.0 ou ultérieur : `Client.signal_with_start()` | 2.20.0 ou ultérieur : `ctx.signal_external_workflow()` |
| Rust SDK | 4.21.0 ou ultérieur : `Client::signal_with_start()` | 4.21.0 ou ultérieur : `ctx.signal_external_workflow()` |
| PHP embarqué (Laravel) | `WorkflowStub::signalWithStart()`, voir le [guide des signaux](../features/signals.md#signal-with-start) | Workflow 2.35.0 ou ultérieur (expérimental) : `signalExternalWorkflow()`, voir le [guide des signaux](../features/signals.md#signal-another-workflow) |

Le PHP Server 2.x publié ne prend en charge aucune des deux opérations. Les SDK
vérifient le Server connecté avant l’envoi. Face à un Server plus ancien, un
appel client lève `ServerCapabilityUnavailable` (PHP),
`RuntimeCapabilityUnsupported` (Python) ou `Error::SignalWithStartUnavailable`
(Rust), et rien n’est envoyé. Un worker refuse une nouvelle commande de signal
avec `signal_external_workflow_unavailable` avant de soumettre quoi que ce
soit : la tâche de workflow ne se termine donc pas et l’exécution n’échoue pas.

## Signal-with-start {#signal-with-start}

Utilisez signal-with-start lorsqu’un appelant cible une entité et ne doit pas
perdre l’événement entre un démarrage et un signal séparés. Un
`start(use-existing)` suivi d’un `signal` représente deux opérations :
l’exécution peut se clore entre les deux, et le signal est alors refusé.
Signal-with-start ne laisse aucun intervalle.

- **Aucune exécution.** Une nouvelle exécution démarre avec l’entrée et les
  échéances de cet appel. Le `start_outcome` du reçu vaut `started_new`.
- **Une exécution ouverte**, y compris la plus récente après une continuation
  dans une nouvelle exécution. Le signal la rejoint, et `start_outcome` vaut
  `returned_existing_active`. L’exécution conserve son entrée, ses échéances et
  son historique. Une politique de doublon `fail` la refuse plutôt avec
  `instance_already_started`.
- **Une exécution close.** Refusée avec `run_not_active`, sauf si la politique
  d’exécution close est `start_new_run`. Une nouvelle exécution démarre alors
  après celle qui est close, et le reçu nomme l’exécution close dans
  `closed_run_id`. L’exécution close conserve son résultat.

Le type de workflow doit être celui de l’instance, et la file de tâches doit
être celle de l’exécution ouverte. Sinon le Server refuse avec
`workflow_type_conflict` ou `task_queue_conflict`. Aucun refus n’écrit quoi que
ce soit.

L’identifiant de requête est la [clé de commande](./server-api-reference.md#command-keys)
du signal. Chaque SDK en génère une par appel si vous l’omettez. Enregistrez
votre propre clé lorsqu’une nouvelle tentative doit survivre au redémarrage du
processus. Une nouvelle tentative avec la même clé, le même nom de signal, les
mêmes arguments et le même type de workflow renvoie le reçu d’origine avec
`retained: true`, même après la clôture ou la continuation de l’exécution, et
ne démarre rien.

```php
use DurableWorkflow\Exception\SignalWithStartFailed;

try {
    $receipt = $client->signalWithStart(
        'orders.entity',      // workflow type
        'order-42',           // workflow ID
        'orders',             // task queue
        'changed',            // signal name
        [2],                  // signal arguments
        input: ['order-42'],  // input for a run this call starts
        requestId: 'order-42-revision-2',
    );
    $receipt['start_outcome']; // "started_new" or "returned_existing_active"
} catch (SignalWithStartFailed $failed) {
    $failed->reason(); // For example "run_not_active". Nothing was written.
}
```

```python
from durable_workflow.errors import SignalWithStartFailed

try:
    receipt = await client.signal_with_start(
        "order-42",
        "changed",
        workflow_type="orders.entity",
        task_queue="orders",
        input=["order-42"],
        signal_args=[2],
        request_id="order-42-revision-2",
    )
    receipt["start_outcome"]  # "started_new" or "returned_existing_active"
except SignalWithStartFailed as failed:
    failed.reason  # For example "run_not_active". Nothing was written.
```

```rust
use durable_workflow::{json, SignalWithStartOptions};

match client
    .signal_with_start(
        "orders.entity",
        "orders",
        "order-42",
        "changed",
        json!(["order-42"]),
        json!([2]),
        SignalWithStartOptions::new().request_id("order-42-revision-2"),
    )
    .await
{
    Ok(receipt) => println!("{}", receipt["start_outcome"]),
    // For example Some("run_not_active"). Nothing was written.
    Err(error) => println!("{:?}", error.signal_with_start_refusal()),
}
```

Passez `closedRunPolicy: 'start_new_run'` (PHP),
`closed_run_policy="start_new_run"` (Python) ou `ClosedRunPolicy::StartNewRun`
(Rust) pour démarrer une nouvelle exécution après une exécution close.
Signal-with-start admet le signal une seule fois. Le travail que déclenche le
signal a toujours besoin de sa propre idempotence.

## Signaler un autre workflow {#signal-another-workflow}

Le code d’un workflow envoie un signal à un autre workflow de son espace de
noms par identifiant de workflow. Sans identifiant d’exécution, le signal va à
l’exécution courante de la cible ; avec un identifiant, uniquement à cette
exécution. Le signal est une commande de workflow, pas une activité :

- La complétion qui le porte enregistre `ExternalSignalRequested` dans
  l’historique de l’émetteur, admet le signal sur la cible et enregistre
  exactement un résultat, `ExternalSignalDelivered` ou `ExternalSignalFailed`,
  à la même séquence, le tout dans une seule transaction du Server.
- Sur la cible, c’est un signal ordinaire : le même événement `SignalReceived`
  et le même enregistrement de signal que pour tout autre signal, attribués à
  l’exécution émettrice. Sa clé de commande sur la cible est
  `workflow-signal:<sender run ID>:<sequence>`. Les appelants ne peuvent pas
  utiliser ce préfixe : un signal ou un signal-with-start dont l’identifiant de
  requête commence par `workflow-signal:` est refusé avec 422 et
  `reason: "request_id_reserved"`.
- Le rejeu lit le résultat enregistré et ne renvoie jamais le signal. Une cible,
  une exécution, un nom de signal ou des arguments différents à cet endroit du
  workflow font échouer le rejeu comme non déterministe.

Un signal non livré est une valeur renvoyée, pas une exception. Le code du
workflow décide quoi en faire.

| Résultat | Raison | Quand |
| --- | --- | --- |
| `delivered` | aucune | L’exécution cible a admis le signal. |
| `target_not_found` | `instance_not_found` | Aucun workflow avec cet identifiant n’existe dans cet espace de noms. |
| `target_not_found` | `run_not_found` | L’identifiant d’exécution ne désigne aucune exécution de ce workflow. |
| `target_closed` | `run_not_active` | L’exécution cible est close. |
| `target_closed` | `historical_run` | L’identifiant d’exécution désigne une exécution remplacée par une continuation dans une nouvelle exécution. |
| `rejected` | `unknown_signal`, `invalid_signal_arguments`, `structural_limit_exceeded` | La cible a refusé le signal, comme elle refuserait un signal HTTP. |
| `rejected` | `runtime_reserved_signal` | Le nom est réservé au flux de messages du runtime. |
| `rejected` | `self_target` | La cible est le workflow de l’émetteur lui-même. |
| `rejected` | `request_id_conflict` | La clé de commande a déjà servi pour un autre signal. |

Les SDK vérifient le nom du signal dans le code du workflow avant tout
enregistrement. Il ne doit pas être vide, ne doit pas contenir de caractère de
contrôle (un octet inférieur à `0x20`, ou `0x7f`) et compte au plus
191 caractères et 255 octets. L’identifiant du workflow cible compte de 1 à
191 caractères. Un nom refusé lève `InvalidSignalName` (PHP et Python) ou
renvoie `Error::InvalidExternalSignal` (Rust), et aucune commande n’est
envoyée.

```php
use DurableWorkflow\Attribute\Workflow;
use DurableWorkflow\Worker\WorkflowContext;

final class ApproverWorkflow
{
    #[Workflow('orders.approver')]
    public function run(WorkflowContext $context, string $orderId): array
    {
        $result = $context->signalExternalWorkflow($orderId, 'approve', ['Ada']);

        if (! $result->delivered()) {
            // target_not_found, target_closed or rejected, with a reason
            return ['skipped' => $result->outcome->value, 'reason' => $result->reason];
        }

        return ['delivered_to' => $result->targetRunId];
    }
}
```

Le handle d’un enfant démarré dispose de la même commande : `$child->signal('approve', ['Ada'])`.

```python
from durable_workflow import workflow


@workflow.defn(name="orders.approver")
class Approver:
    def run(self, ctx: workflow.WorkflowContext, order_id: str):
        result = yield ctx.signal_external_workflow(order_id, "approve", ["Ada"])
        if not result.delivered:
            # target_not_found, target_closed or rejected, with a reason
            return {"skipped": result.outcome, "reason": result.reason}
        return {"delivered_to": result.target_run_id}
```

```rust
use durable_workflow::{json, ExternalSignalOutcome};

worker.register_workflow("orders.approver", |ctx, input| async move {
    let order_id = input[0].as_str().unwrap_or_default().to_owned();
    let result = ctx
        .signal_external_workflow(order_id, "approve", json!(["Ada"]))
        .await?;
    match result.outcome {
        ExternalSignalOutcome::Delivered => Ok(json!({"delivered_to": result.target_run_id})),
        // target_not_found, target_closed or rejected, with a reason
        _ => Ok(json!({"skipped": result.outcome.as_str(), "reason": result.reason})),
    }
});
```

Ajoutez `.run_id(run_id)` en Rust, `run_id=` en Python ou `runId:` en PHP pour
ne signaler qu’une seule exécution de la cible.

Exécutez la commande seule. Elle ne peut pas faire partie d’un groupe parallèle
ni d’une sélection durable. Un worker qui détient une tâche de workflow peut
signaler n’importe quel workflow de l’espace de noms de cette tâche, sans le
rôle d’opérateur qu’exige un signal HTTP. Placez dans un espace de noms séparé
un workflow que le code d’autres workflows ne doit pas signaler.

## Quand une activité reste nécessaire {#when-an-activity-is-still-needed}

Utilisez une activité qui appelle le client lorsque la commande de workflow ne
convient pas :

- **Signal-with-start depuis le code d’un workflow.** Il n’existe pas de
  commande de workflow pour signal-with-start. Appelez le signal-with-start du
  client depuis une activité, et dérivez son identifiant de requête de données
  stables du workflow, comme l’identifiant du workflow et une clé métier, afin
  que chaque nouvelle tentative de l’activité envoie la même clé et que le
  Server admette le signal une seule fois.
- **Un autre espace de noms.** Les signaux restent dans l’espace de noms.
  Utilisez plutôt un [appel de service entre espaces de noms](./service-operations.md).
- **Un Server plus ancien.** Avant le Server natif 3.15.0, le code d’un
  workflow ne peut envoyer de signal que par une activité. Donnez aussi à ce
  signal un identifiant de requête stable, afin qu’une nouvelle tentative de
  l’activité n’enregistre pas un second signal.

Une activité s’exécute au moins une fois : c’est l’identifiant de requête
stable qui empêche une nouvelle tentative d’envoyer un second signal. La
commande de signal enregistre son résultat dans l’historique sans tâche
d’activité.
