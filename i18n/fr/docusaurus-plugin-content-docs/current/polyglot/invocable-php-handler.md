---
sidebar_position: 5
title: Gestionnaire d’activité PHP invocable
description: Utilisez InvocableActivityHandler pour héberger des gestionnaires d’activité derrière un point de terminaison HTTPS recevant les enveloppes d’entrée des tâches externes et retournant les enveloppes de résultat.
tags:
  - external-execution
  - invocable-carrier
  - worker-protocol
keywords:
  - gestionnaire d’activité invocable
  - InvocableActivityHandler
  - entrée de tâche externe
  - résultat de tâche externe
  - adaptateur activité PHP
  - gestionnaire activité Lambda
---

# Gestionnaire d’activité PHP invocable {#php-invocable-activity-handler}

Le [support HTTP invocable](./invocable-carrier.md) permet au serveur d’envoyer
par POST une tâche d’activité sous bail à un point de terminaison HTTPS, sans
attendre un worker en long polling. La classe PHP
`Workflow\V2\Support\InvocableActivityHandler` est l’implémentation
de référence qu’un processus PHP externe utilise pour convertir cette requête
en enveloppe de résultat que le serveur peut rapprocher de la tâche.

Utilisez-la pour intégrer un gestionnaire d’activité dans :

- une AWS Lambda ou Google Cloud Function appelée via HTTPS
- un contrôleur Laravel derrière un service HTTP léger
- un conteneur exposant un point de terminaison POST par file d’activités

La classe analyse l’enveloppe d’entrée de tâche externe indépendante du support,
recherche le callable enregistré, applique l’échéance du bail et produit une
enveloppe de résultat indépendante du support, y compris les formes d’échec
attendues par le serveur.

## Démarrage rapide {#quick-start}

Installez le paquet Durable Workflow dans le processus externe, enregistrez un
callable par nom de gestionnaire d’activité et transmettez le corps de la
requête à `handle()` :

```php
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler([
    'billing.charge-card' => static function (int $amount, string $currency): array {
        // Real charge-card logic. Must be idempotent per task id.
        return [
            'approved' => true,
            'amount' => $amount,
            'currency' => $currency,
        ];
    },
]);

$envelope = json_decode(file_get_contents('php://input'), associative: true);
$result = $handler->handle($envelope);

header('Content-Type: application/vnd.durable-workflow.external-task-result+json');
echo json_encode($result, JSON_UNESCAPED_SLASHES);
```

Le gestionnaire reçoit l’enveloppe d’entrée et retourne celle du résultat.
Le support HTTP invocable définit le contrat de transport : HTTPS, POST,
authentification, délais et budget de nouvelles tentatives. La classe PHP
gère le décodage des arguments, l’appel du gestionnaire, les échéances,
l’encodage du résultat et la classification des échecs.

## Enregistrer les gestionnaires {#registering-handlers}

Le premier argument du constructeur est une table dont les clés sont les
valeurs de `task.handler` envoyées par le serveur dans l’enveloppe d’entrée.
Cette valeur correspond au champ `handler` de l’entrée associée dans la
configuration des exécuteurs externes :

```php
new InvocableActivityHandler(
    handlers: [
        'billing.charge-card' => [$billingService, 'chargeCard'],
        'billing.refund' => [$billingService, 'refund'],
        'ops.rotate-key' => static fn (string $keyId): array => $keys->rotate($keyId),
    ],
    carrier: 'billing-lambda',
    resultCodec: 'avro',
);
```

Une entrée dont `task.handler` n’est pas enregistré produit un résultat
`failed` avec `failure.kind = application`,
`classification = application_error` et
`type = UnknownActivityHandler`. La politique de nouvelles tentatives
configurée pour l’activité continue de s’appliquer côté serveur.

Le nom facultatif `carrier` est repris dans `metadata.carrier` de chaque
enveloppe de résultat afin que les opérateurs identifient le runtime externe
ayant produit la réponse. Utilisez un identifiant stable ne nécessitant pas
de masquage, comme `billing-lambda`, `ops-cloud-run` ou `laravel-admin-api`.

L’option `resultCodec` contrôle la sérialisation de la valeur retournée dans
`result.payload.blob`. Elle vaut `avro` par défaut, comme le codec des
données durables des workers PHP. Le codec doit être connu du
`CodecRegistry` du serveur. `protobuf` est refusé immédiatement dans le constructeur.

## Enveloppe de résultat {#result-envelope}

En cas de réussite, `handle()` retourne l’enveloppe de succès indépendante du support :

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "succeeded",
    "recorded": true
  },
  "task": {
    "id": "acttask_01HV7D3G3G61TAH2YB5RK45XJS",
    "kind": "activity_task",
    "attempt": 1,
    "idempotency_key": "attempt_01HV7D3KJ1C8WQNNY8MVM8J40X"
  },
  "result": {
    "payload": {
      "codec": "avro",
      "blob": "<base64-encoded payload>"
    },
    "metadata": {
      "content_type": "application/vnd.durable-workflow.result+json"
    }
  },
  "metadata": {
    "handler": "billing.charge-card",
    "carrier": "billing-lambda",
    "duration_ms": 42
  }
}
```

Les champs `task.id`, `task.attempt` et `task.idempotency_key` sont
recopiés depuis l’enveloppe d’entrée pour rapprocher le résultat du bail initial.

En cas d’échec, `handle()` retourne l’enveloppe d’échec. Le bloc
`failure` contient le type d’échec, la classification, le message, le type
PHP d’origine, la trace de pile et la possibilité de réessayer. Un échec
d’échéance inclut aussi le nom `deadline` et la valeur `expires_at` :

```json
{
  "schema": "durable-workflow.v2.external-task-result",
  "version": 1,
  "outcome": {
    "status": "failed",
    "retryable": true,
    "recorded": true
  },
  "task": {"id": "...", "kind": "activity_task", "attempt": 1, "idempotency_key": "..."},
  "failure": {
    "kind": "timeout",
    "classification": "deadline_exceeded",
    "message": "Invocable activity task received after lease.expires_at.",
    "type": "ExternalTaskDeadlineExceeded",
    "stack_trace": null,
    "timeout_type": "deadline_exceeded",
    "cancelled": false,
    "details": {
      "deadline": "lease.expires_at",
      "expires_at": "2026-04-22T15:14:02.000000Z"
    }
  },
  "metadata": {"handler": "billing.charge-card", "carrier": "billing-lambda", "duration_ms": 3}
}
```

## Classification des échecs {#failure-taxonomy}

| `failure.kind` | `classification` | Nouvelle tentative possible | Déclenchement |
| --- | --- | --- | --- |
| `timeout` | `deadline_exceeded` | oui | Le bail ou une échéance d’entrée a déjà expiré à la réception de l’enveloppe, ou le gestionnaire retourne après une expiration pendant son exécution. |
| `decode_failure` | `decode_failure` | non | Les arguments ne peuvent pas être décodés avec le codec déclaré, une échéance est illisible, le gestionnaire lève `TypeError` / `ValueError` sur ses paramètres, ou le résultat de réussite ne peut pas être réencodé avec le codec configuré. |
| `application` | `application_error` | selon l’exception levée | Le gestionnaire lève une exception. `retryable` vaut `false` si elle implémente `Workflow\Exceptions\NonRetryableExceptionContract`, sinon `true`. Le message et `type` correspondent à ceux de l’exception. |
| `application` | `application_error` | non | `task.kind` n’est pas `activity_task`, ou `task.handler` n’est pas enregistré dans la table. |

La classe ne retourne jamais une exception seule. Tous les chemins de code
produisent une enveloppe de résultat structurée afin que le support invocable
puisse rapprocher la réponse de manière déterministe.

## Échéances et idempotence {#deadlines-and-idempotency}

L’enveloppe d’entrée porte le bail actif `lease.expires_at` et les
échéances déclarées de l’activité : `schedule_to_start`, `start_to_close`,
`schedule_to_close` et `heartbeat`. La classe les vérifie toutes :

- Avant d’appeler le gestionnaire, toute échéance dépassée produit directement
  un échec `timeout`. `details.deadline` nomme le champ expiré. Le callable
  enregistré n’est pas appelé.
- Au retour du gestionnaire, la classe vérifie de nouveau les échéances.
  Un gestionnaire qui dépasse son bail produit le même échec `timeout`,
  et sa valeur de retour est retirée de l’enveloppe.

Le support réessaie les livraisons de transport et le runtime redistribue les
tâches sous bail sans compte rendu. Les mêmes `task.id` et
`task.idempotency_key` peuvent donc arriver plusieurs fois. Le gestionnaire
doit être idempotent. La clé d’idempotence de chaque enveloppe reste stable
entre les nouvelles livraisons d’une même tentative.

## Codecs et stockage externe {#payload-codecs-and-external-storage}

Les données des arguments arrivent dans `payloads.arguments` avec un champ
`codec`. La classe utilise le `CodecRegistry` du serveur pour les décoder.
Le seul codec public v2 est `avro`. `json`, les codecs inconnus et les blobs
mal formés ou sans étiquette sont refusés. JSON reste le format du document
HTTP de transport, sans être un codec de données durables.

Lorsque les entrées du workflow dépassent le seuil configuré de
[stockage externe des données utiles](../features/external-payload-storage.md),
le serveur stocke les octets via le pilote configuré et envoie une enveloppe
de référence plutôt qu’un blob en ligne. Fournissez un
`ExternalPayloadStorageDriver` au constructeur pour résoudre les références
avant d’appeler le gestionnaire :

```php
use Workflow\V2\Contracts\ExternalPayloadStorageDriver;
use Workflow\V2\Support\InvocableActivityHandler;

$handler = new InvocableActivityHandler(
    handlers: $handlers,
    carrier: 'billing-lambda',
    resultCodec: 'avro',
    externalStorage: $driver,
);
```

Le pilote doit respecter le même contrat que celui utilisé par le serveur pour
écrire les données, afin que la référence, le hachage et le codec concordent.
Une référence que le processus externe ne peut pas résoudre produit un
`decode_failure`, sans retourner silencieusement des données vides.

## Intégration en production {#production-wiring}

Voici un contrôleur Laravel hébergeant le gestionnaire derrière une route POST :

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Workflow\V2\Support\InvocableActivityHandler;

final class BillingActivityController
{
    public function __construct(private readonly InvocableActivityHandler $handler) {}

    public function __invoke(Request $request): JsonResponse
    {
        $result = $this->handler->handle($request->all());

        return new JsonResponse(
            data: $result,
            headers: ['Content-Type' => 'application/vnd.durable-workflow.external-task-result+json'],
        );
    }
}
```

Faites pointer la configuration de l’exécuteur externe sur l’URL HTTPS du
contrôleur et déclarez un `auth_ref` pour authentifier la route.
L’exception HTTP sur l’adresse de boucle locale est réservée au développement.

## Interfaces associées {#related-surfaces}

- [Support HTTP invocable](./invocable-carrier.md) : contrat de transport côté
  serveur qui livre les entrées et rapproche les résultats.
- [Interface d’exécution externe](./external-execution.md) : frontière produit
  indépendante du support, y compris les schémas d’entrée et de résultat
  implémentés par la classe.
- [Stockage externe des données utiles](../features/external-payload-storage.md) :
  déchargement des arguments ou résultats volumineux vers un pilote configuré
  et représentation par une enveloppe de référence vérifiable.
- [Protocole worker](./worker-protocol.md) : contrat plus large du plan worker
  qui publie le contrat invocable avec les formes de gestionnaires fondées sur l’interrogation.
