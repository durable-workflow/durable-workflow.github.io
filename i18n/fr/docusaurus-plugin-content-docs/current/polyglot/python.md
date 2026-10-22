---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - environnement d'essai sample-app
  - SDK Python
  - Client durable_workflow
  - worker Python
  - client de workflow asynchrone
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# SDK Python {#python-sdk}

Le SDK Python est un client léger privilégiant l'asynchrone pour un Server
Durable Workflow auto-hébergé ou un runtime d'espace de noms Durable Workflow
Cloud. Il permet aux processus Python de démarrer, observer, signaler et annuler
des workflows via l'API du plan de contrôle, et de s'enregistrer comme workers
qui exécutent des tâches de workflow et des activités.

## Essayer l'environnement local Sample App {#try-the-local-sample-app-playground}

Pour le parcours d'écriture le plus court sans Cloud, ouvrez la
[branche `main` actuelle de Sample App dans GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
et lancez :

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

L'environnement local génère les sources de workflow et d'activité appartenant
à l'appelant, choisit les artefacts stables actuels et démarre les images
publiées Server et Waterline. Il attend un enregistrement worker dont identité,
type de workflow, type d'activité et file correspondent au contrat généré avant
de démarrer le workflow. La réussite exige le résultat terminé et l'historique
attendus. Le terminal affiche alors le lien exact de l'exécution Waterline
locale et le chemin des preuves JSON structurées.

Installation du paquet, démarrage rapide présenté ci-dessous, référence API et exemple de
dépôt ci-dessous restent les parcours directs sans Sample App.

<ProductPromotion source="docs-v2-python-sdk">
Exécutez clients et workers Python sur un espace de noms Cloud géré avec des
identifiants distincts limités par rôle.
</ProductPromotion>

Le SDK cible le même modèle durable que le paquet PHP : identifiants d'instance
et d'exécution, événements d'historique, files et clés de type sont partagés
entre langages. Un worker Python peut servir les activités d'un workflow PHP,
et inversement.

Pour comparer les SDK Python, PHP, Rust et `dw`, consultez les
[capacités des clients et workers](/docs/polyglot/cli-python-parity/).

Pour les signatures de constructeur, types de retour, classes d'exception et
noms de métriques, consultez la
[référence API SDK Python](https://python.durable-workflow.com/) générée.

Le SDK Python 2.5.0 ajoute un cache d'historique borné facultatif pour l'exécution
avec affinité. Utilisez Server 2.5.10 ou ultérieur et activez-le sur chaque worker.
Consultez l'[affinité portable des workers](/docs/polyglot/portable-worker-affinity)
et le [guide Python avec exemple exécutable](https://python.durable-workflow.com/guides/sticky-execution/).

Les clients Cloud utilisent l'URL et l'espace de noms provisionnés avec des
identifiants client et worker distincts. Le
[runtime Cloud géré](/docs/polyglot/cloud-control-plane) définit cette frontière
de connexion. Le démarrage rapide ci-dessous utilise des valeurs auto-hébergées locales.

## Prérequis {#requirements}

- Python 3.10 ou ultérieur
- Docker pour le Server local de ce démarrage rapide, un
  [Server auto-hébergé](/docs/polyglot/server) existant ou un
  [runtime Cloud provisionné](/docs/polyglot/cloud-control-plane)

## Installation {#installation}

Installez la <PythonPackageReleaseLink authority="qualified">version stable du
SDK Python</PythonPackageReleaseLink>. La dépendance exacte est générée depuis
le même tuple que le démarrage rapide Server. Un fichier de verrouillage ou de
contraintes peut la conserver pour la reproductibilité.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

Le SDK dépend de [httpx](https://www.python-httpx.org/) pour HTTP et du paquet
Python `fastavro` pour encoder le format Apache Avro du seul codec public v2.
Les métriques Prometheus sont facultatives.

## Démarrage rapide {#quickstart}

Ce programme Python complet définit un workflow avec une activité, le démarre
sur un serveur Durable Workflow local et attend son résultat :

<!-- docs-example id="python.quickstart.worker" -->
```python
import asyncio
import uuid

from durable_workflow import Client, Worker, workflow, activity

@activity.defn(name="greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "length": len(name)}

@workflow.defn(name="greeter")
class GreeterWorkflow:
    def run(self, ctx, *args):
        result = yield ctx.schedule_activity("greet", list(args))
        return result

async def main():
    workflow_id = f"greeting-{uuid.uuid4().hex}"

    async with Client("http://localhost:8080", token="dev-token", namespace="default") as client:
        handle = await client.start_workflow(
            workflow_type="greeter",
            task_queue="default",
            workflow_id=workflow_id,
            input=["world"],
        )

        worker = Worker(
            client,
            task_queue="default",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )

        await worker.run_until(workflow_id=workflow_id, timeout=30.0)
        result = await handle.result(timeout=10.0)

    print(result)  # {"greeting": "Hello, world!", "length": 5}

asyncio.run(main())
```

### Exécuter sur un serveur local {#running-against-a-local-server}

Le programme suppose un serveur à `http://localhost:8080` avec le jeton local
`dev-token`. Pour en lancer un sans sources, utilisez l'image serveur publiée :

```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-python-quickstart

docker run --rm \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-python-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready > /dev/null; do sleep 1; done
```

Pour la production, notamment authentification, base et TLS, consultez le
[guide d'installation Server](/docs/polyglot/server).

Pour un exemple plus complet, le dépôt SDK inclut
[`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing),
une pile Docker Compose qui exécute de bout en bout un workflow de commande
avec un worker Python.

## Référence API du client {#client-api-reference}

Le client asynchrone `durable_workflow.Client` est l'entrée publique des appels
HTTP des plans de contrôle et worker. Utilisez-le comme gestionnaire de contexte
asynchrone pour fermer proprement le pool de connexions `httpx.AsyncClient`.

```python
from durable_workflow import Client

async with Client(
    "https://workflow.example.com",
    token="shared-token",
    namespace="default",
    timeout=60.0,
) as client:
    info = await client.get_cluster_info()
```

### Constructeur {#constructor}

| Argument | Type | Défaut | Usage |
| --- | --- | --- | --- |
| `base_url` | `str` | obligatoire | Origine Server sans `/api`. |
| `token` | `str \| None` | `None` | Un jeton porteur autorise les appels des deux plans. |
| `control_token` | `str \| None` | `None` | Les appels de contrôle nécessitent un autre jeton que les interrogations worker. |
| `worker_token` | `str \| None` | `None` | Les appels worker nécessitent un autre jeton que les appels opérateur. |
| `namespace` | `str` | `"default"` | Cibler un espace de noms via `X-Namespace`. |
| `timeout` | `float` | `60.0` | Surcharger le délai HTTP. |
| `retry_policy` | `TransportRetryPolicy \| None` | politique par défaut | Ajuster les nouvelles tentatives de transport pour les échecs HTTP transitoires. |
| `metrics` | `MetricsRecorder \| None` | sans effet | Émettre les métriques client et worker vers un enregistreur personnalisé. |
| `payload_size_limit_bytes` | `int` | défaut SDK | Respecter le contrat maximal d'octets du serveur. |
| `payload_size_warning_threshold_percent` | `int` | défaut SDK | Avertir avant d'atteindre la limite configurée. |
| `payload_size_warnings` | `bool` | `True` | Désactiver les avertissements locaux de taille dans les tests ou scripts contrôlés. |

`token` est l'option la plus simple. Si `control_token` et `worker_token` sont
tous deux définis, les méthodes du plan de contrôle utilisent `control_token`
et celles du plan worker utilisent `worker_token`.

### Stockage externe des charges utiles {#external-payload-storage}

Les opérations ordinaires de `Client` et `Worker` utilisent automatiquement le transport authentifié du runtime Server. Le SDK découvre politique et limites via `GET /api/cluster/info`, téléverse les valeurs encodées supérieures au seuil ou nécessaires pour respecter la limite de requête, puis récupère les références avant décodage. Le code du workflow et de l’activité reçoit la valeur décodée. Les identifiants fournisseur restent sur Server. Les workers distants n’ont besoin ni de boto3, ni de clients fournisseur, ni d’accès au répertoire local de Server.

La référence du runtime utilise le schéma `durable-workflow.v2.runtime-external-payload-reference.v1` et un `reference_id` opaque. Elle ne contient aucun `uri` fournisseur. Téléversement et récupération utilisent les identifiants ordinaires du rôle et l’espace de noms, vérifient taille et SHA-256 et préservent les barrières de tentative de tâche et de bail lors de la terminaison. Le [contrat HTTP](./server-api-reference.md#runtime-external-payload-transport) décrit routes, limites et refus typés. La prise en charge exige un transport compatible disponible, pas seulement un pilote configuré.

Les **utilitaires fournisseur directs** suivants servent au stockage et aux tests d’applications accédant délibérément à leur propre fournisseur. Ils utilisent un autre schéma avec URI. Ils ne sont pas nécessaires aux clients ordinaires de Server ou Cloud. Server refuse les enveloppes fournisseur `external_storage` avec HTTP `422` et `external_payload_unsupported`.

| API | Rôle | Échecs possibles |
| --- | --- | --- |
| `ExternalStorageDriver` | Protocole `put(data, sha256=..., codec=...)`, `get(uri)` et `delete(uri)`. | Erreurs de stockage levées par le pilote. |
| `LocalFilesystemExternalStorage` | Pilote `file://` sans dépendance pour développement et tests. | `ValueError` si l'URI sort de la racine configurée. |
| `S3ExternalStorage` | Adaptateur d'un client compatible boto3. | `ValueError` pour des références de bucket/préfixe étrangers ou réponses autres que des octets. |
| `GCSExternalStorage` | Adaptateur d'un client de type google-cloud-storage. | `ValueError` pour des références de bucket/préfixe étrangers ou réponses autres que des octets. |
| `AzureBlobExternalStorage` | Adaptateur d'un client de conteneur Azure. | `ValueError` pour des références de conteneur/préfixe étrangers ou réponses autres que des octets. |
| `ExternalPayloadReference` | Référence d'échange immuable avec `uri`, `sha256`, `size_bytes`, `codec` et schéma. | `ValueError` si `from_dict()` reçoit un schéma non pris en charge ou des champs mal formés. |
| `ExternalPayloadCache` | Cache de relecture borné d'octets externes déjà vérifiés. | Le constructeur rejette les limites d'entrées ou d'octets non positives. |
| `store_external_payload()` | Stocke les octets encodés via un pilote et renvoie `ExternalPayloadReference`. | Erreurs du pilote. |
| `fetch_external_payload()` | Récupère les octets et vérifie taille et SHA-256 avant décodage. | `ExternalPayloadIntegrityError` si taille ou empreinte divergent. |
| `delete_external_payload()` | Supprime l'objet référencé et son entrée de cache. | Erreurs de stockage du pilote. |
| `external_storage_envelope()` | Encode la valeur dans l'enveloppe jusqu'au seuil, puis écrit les octets via le pilote. | `ValueError` si seuil invalide ou aucun pilote ne peut résoudre une référence. |
| `external_storage_driver_from_policy()` | Construit un pilote direct à partir d’une politique explicite et des clients fournisseur de l’application. N’autorise pas d’accès fournisseur direct sur Server ou Cloud. | `ValueError` si la politique est désactivée, non prise en charge ou si client/bucket/conteneur manque. |

```python
from durable_workflow import (
    ExternalPayloadCache,
    LocalFilesystemExternalStorage,
    external_storage_envelope,
    to_avro_payload_value,
)
from durable_workflow.serializer import encode
from durable_workflow.external_storage import fetch_external_payload, store_external_payload

storage = LocalFilesystemExternalStorage("/var/lib/durable-workflow/payloads")
cache = ExternalPayloadCache(max_entries=256, max_bytes=32 * 1024 * 1024)

payload = to_avro_payload_value({"invoice_pdf": "x" * 1_000_000})
envelope = external_storage_envelope(
    payload,
    external_storage=storage,
    threshold_bytes=64 * 1024,
)

reference = store_external_payload(
    storage,
    encode({"archived": True}).encode("utf-8"),
    codec="avro",
)
payload_bytes = fetch_external_payload(storage, reference, cache=cache)
```

Pour ces utilitaires directs, le schéma est `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA` (`durable-workflow.v2.external-payload-reference.v1`). Les adaptateurs n’ajoutent aucune dépendance aux SDK cloud dans `durable-workflow` ; l’application fournit ses clients S3, GCS ou Azure configurés.

Leur référence fournisseur contient les champs suivants. Ce n’est pas la référence du runtime acceptée par les routes HTTP Server :

```json
{
  "schema": "durable-workflow.v2.external-payload-reference.v1",
  "uri": "s3://dw-payloads/billing/run-001/input.avro",
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "size_bytes": 1048576,
  "codec": "avro",
  "expires_at": "2026-05-22T00:00:00Z"
}
```

`ExternalPayloadReference.from_dict()` refuse les schémas inconnus et champs incorrects. `fetch_external_payload()` vérifie `size_bytes` et `sha256` avant de renvoyer les octets et lève `ExternalPayloadIntegrityError` si taille ou empreinte diffèrent. Un objet absent peut aussi provoquer l’erreur du pilote fournisseur. Utilisez `ExternalPayloadCache` uniquement pour les octets vérifiés. L’éviction du cache n’autorise pas à supprimer un objet géré par Server. `delete_external_payload()` est une opération directe du fournisseur, pas une API de nettoyage des références du runtime.

Utilisez `external_storage_driver_from_policy()` dans du code accédant délibérément au stockage fournisseur de l’application et possédant le client requis. Lire une politique ne rend pas les enveloppes fournisseur valides dans les requêtes Server. Les clients restent à la charge de l’application. Les adaptateurs facultatifs n’ajoutent pas boto3, google-cloud-storage ou azure-storage-blob comme dépendances du runtime :

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

La fabrique lève `ValueError` si la politique est désactivée, le pilote non pris en charge ou le client requis absent. Une politique désactivée ne renvoie pas de pilote vide. Vérifiez `policy.enabled` avant l’appel.

### Espaces de noms {#namespaces}

Les espaces de noms séparent les locataires pour workflows, planifications,
attributs de recherche et stockage externe. Le client en cible un à la fois via
`namespace=` au constructeur. Les opérations ci-dessous s'appliquent à tout
espace autorisé pour le jeton porteur.

| Méthode | Retour | Échecs possibles |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | Erreurs d'authentification/serveur. |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`, erreurs d'authentification/serveur. |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | `InvalidArgument` pour noms dupliqués ou rétention invalide, erreurs d'authentification/serveur. |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`, `InvalidArgument`, erreurs d'authentification/serveur. Seuls les champs fournis sont envoyés. |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | `InvalidArgument` si la validation serveur échoue, erreurs d'authentification/serveur. |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | `InvalidArgument` si la politique liée manque de champs requis, erreurs d'authentification/serveur. |

`set_namespace_external_storage` correspond à `dw namespace:set-storage-driver`.
Son premier argument positionnel est `name`, comme `describe_namespace`,
`create_namespace` et `update_namespace`. L'alias obsolète `namespace=` émet un
`DeprecationWarning`. Le nouveau code doit utiliser `name` positionnel. Le
dictionnaire `config` porte les clés du pilote, dont le champ facultatif `disk`
pour `s3`, `gcs` et `azure`, afin de garder les identifiants côté serveur.
`NamespaceDescription` reflète la politique réellement persistée, y compris
le seuil de repli serveur si l'appelant n'en fournit pas.

`test_external_storage` correspond à `dw storage:test`. Le serveur écrit et relit
une petite et une grande charge utile via le pilote lié et renvoie
`StorageTestResult`. Ses enregistrements `StoragePayloadTestResult` par charge
exposent `wrote`, `read`, `verified`, `latency_ms` et `bytes`.

`NamespaceDescription` contient la politique `external_payload_storage` décrite dans [Stockage externe des charges utiles](#external-payload-storage). Les clients ordinaires utilisent automatiquement le transport découvert du runtime. Les utilitaires directs nécessitent l’accès fournisseur de l’application ; décrire une politique ne rend pas les enveloppes fournisseur valides dans les requêtes Server.

### Cluster et files de tâches {#cluster-and-task-queues}

| Méthode | Retour | Remarques |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Appelle la sonde de santé pour vérifier la vie du processus. |
| `await client.get_cluster_info()` | `dict[str, Any]` | Lit version serveur, protocole, capacités et métadonnées de compatibilité. |
| `await client.list_task_queues()` | `TaskQueueList` | Liste les files visibles dans l'espace de noms. |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Renvoie capacité worker, baux courants, admission des requêtes de lecture et budget de distribution. |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | Instantané des cohortes par build-id, y compris workers sans version sous la cohorte `build_id` à `None`. |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Marque une cohorte en drainage pour arrêter la prise de nouvelles tâches. Passez `build_id=None` pour les workers sans version. Idempotent. |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Annule un drainage et autorise de nouveau le travail. Passez `build_id=None` pour les workers sans version. Idempotent. |

Les retours exposent les dataclasses imbriquées `TaskQueueAdmission`,
`TaskQueueTaskAdmission`, `TaskQueueQueryAdmission`, `TaskQueueBuildIdCohort`,
`TaskQueueBuildIdRollout` et `TaskQueueBuildIdRolloutState` pour vérifier capacité
serveur et déploiement par build-id sans analyser de prose. Le
[déploiement par build-id](/docs/polyglot/worker-build-id-rollout) détaille le
parcours complet. Les équivalents CLI sont `dw task-queue:build-ids`,
`dw task-queue:drain` et `dw task-queue:resume`.

### Opérations de workflow {#workflow-operations}

| Méthode | Retour | Échecs possibles |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.list_workflows(...)` | `WorkflowList` | Erreurs d'authentification/serveur |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.get_history(workflow_id, run_id)` | charge utile d'historique décodée | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.export_history(workflow_id, run_id)` | historique d'archivage décodé | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, erreurs d'authentification/serveur |
| `await client.query_workflow(workflow_id, query_name, args=None)` | résultat de requête décodé | `QueryFailed`, `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | résultat de mise à jour décodé | `UpdateRejected`, `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, erreurs d'authentification/serveur |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | sortie de workflow décodée | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` accepte `workflow_type`, `task_queue`, `workflow_id` facultatif,
`input` facultatif, `duplicate_policy`, `memo`, `search_attributes`, `business_key`,
`execution_timeout_seconds` et `run_timeout_seconds`. Toutes les données de
l'appelant sont enveloppées en Avro avant de traverser HTTP.

Utilisez `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`
si un script connaît déjà l'identifiant et souhaite les méthodes d'un handle.

| Méthode `WorkflowHandle` | Méthode client équivalente |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

Les deux opérations ferment immédiatement l'exécution Server avec des résultats
terminaux distincts. `cancel_workflow` n'envoie pas de demande coopérative au
code du workflow et n'exécute aucun nettoyage saga/finally. Utilisez
`request_cancellation()` avec des workers coopératifs pour un nettoyage borné.
Le [guide d'annulation coopérative](/docs/polyglot/cancellation) décrit politiques,
supervision et reprise.

### Identité du workflow courant {#workflow-identity}

Depuis Python SDK 2.9.0, le code du workflow peut lire les propriétés en lecture
seule `ctx.workflow_id` et `ctx.run_id`. Ce sont des chaînes issues de la tâche
courante, identiques lors du rejeu. Après continue-as-new, l'identifiant du
workflow reste le même et le successeur reçoit son propre identifiant de run.
Ne le remplacez pas par un identifiant du prédécesseur passé en argument.

```python
from durable_workflow import workflow

@workflow.defn(name="identity")
class IdentityWorkflow:
    def run(self, ctx):
        identity = {"workflow_id": ctx.workflow_id, "run_id": ctx.run_id}
        yield ctx.schedule_activity("record_identity", [identity])
        return identity
```

Ces propriétés lisent l'identité locale de la tâche sans requête HTTP. Pour
consulter l'état hors du code du workflow, utilisez
`await client.describe_workflow(workflow_id)`. Utilisez
`await client.query_workflow(workflow_id, query_name)` pour l'état exposé par un
gestionnaire de requêtes enregistré. Les propriétés d'identité ne remplacent
aucune de ces opérations.

### Planifications {#schedules}

Les planifications utilisent `ScheduleSpec` pour les règles de calendrier ou
d'intervalle, et `ScheduleAction` pour le démarrage de workflow à chaque déclenchement.

| Méthode | Retour | Remarques |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | Crée une planification et renvoie un handle. |
| `await client.list_schedules()` | `ScheduleList` | Liste les planifications visibles. |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | Lit état, action, prochain déclenchement et compteurs. |
| `await client.update_schedule(schedule_id, ...)` | `None` | Modifie règles, action, chevauchement, dispersion temporelle, mémo, attributs de recherche ou note. |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | Suspend les déclenchements futurs. |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | Reprend une planification suspendue. |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | Demande un déclenchement immédiat. |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | Rattrape les fenêtres de déclenchement manquées. |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | Renvoie une page d'audit ordonnée par `sequence` croissante. `limit` est borné côté serveur entre 1 et 500 (100 par défaut). `after_sequence` est un curseur non négatif issu du `next_cursor` précédent. Lève `ScheduleNotFound` si l'identifiant est inconnu. L'historique survit à `delete_schedule` pour auditer la suppression. |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Produit tous les événements d'audit en paginant jusqu'à `has_more=False`. Mêmes échecs que `get_schedule_history`. |
| `await client.delete_schedule(schedule_id)` | `None` | Supprime la planification. |

`client.get_schedule_handle(schedule_id)` renvoie `ScheduleHandle` avec méthodes
`describe`, `update`, `pause`, `resume`, `trigger`, `backfill`, `history`,
`iter_history` et `delete`, qui appellent leurs équivalents client.
`ScheduleHandle.history(...)` renvoie `ScheduleHistoryPage` et
`ScheduleHandle.iter_history(...)` un `AsyncIterator[ScheduleHistoryEvent]`.

`ScheduleHistoryPage` porte la liste ordonnée `events`, le drapeau `has_more`,
un entier `next_cursor` (ou `None` en dernière page), `schedule_id` et le
`namespace` propriétaire. Chaque `ScheduleHistoryEvent` porte `sequence`,
`event_type` (`ScheduleCreated`, `SchedulePaused`, `ScheduleResumed`,
`ScheduleUpdated`, `ScheduleTriggered`, `ScheduleTriggerSkipped` ou
`ScheduleDeleted`), `recorded_at`, les éventuels `workflow_instance_id` et
`workflow_run_id` des déclenchements, et le dictionnaire `payload` brut enregistré
par le plan de contrôle pour la transition.

### Événements de pont et méthodes du plan worker {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)`
renvoie `BridgeAdapterOutcome`, le même contrat de résultat lisible par machine
que `dw bridge:webhook`. C'est l'entrée Python pour une ingestion bornée depuis
des systèmes de type webhook.

Les méthodes worker bas niveau sont publiques pour les workers personnalisés
et tests de protocole. Les applications ordinaires doivent utiliser `Worker` :

| Groupe | Méthodes |
| --- | --- |
| Enregistrement worker | `register_worker` |
| Tâches de workflow | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| Tâches de requête de lecture | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| Tâches d'activité | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

Ces méthodes envoient `X-Durable-Workflow-Protocol-Version` et utilisent
`worker_token` s'il est configuré. Préférez `Worker`, sauf pour écrire un
adaptateur SDK ou un test de conformité du protocole.

`workflow_task_history(...)` pagine l'historique d'une tâche de workflow déjà
sous bail. Appelez-la uniquement après que `poll_workflow_task(...)` renvoie
`next_history_page_token` :

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

La requête utilise `next_history_page_token`, `lease_owner` et
`workflow_task_attempt`. La réponse décodée utilise les champs worker
`history_events`, `total_history_events` et `next_history_page_token`, pas les
noms d'historique d'exécution du contrôle `events` ou `next_page_token`.

### Workers {#workers}

Le registre expose les workers vus récemment et ce qu'ils peuvent exécuter.
Utilisez-le pour les déploiements par build-id, repérer les workers périmés à
retirer et réconcilier la capacité dans les scripts opérateur.

| Méthode | Retour | Échecs possibles |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | Erreurs d'authentification/serveur. |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, erreurs d'authentification/serveur. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, erreurs d'authentification/serveur. |

`list_workers` filtre côté serveur : `task_queue` limite à une file, `status`
à une chaîne d'état reconnue. Par défaut, tous les workers enregistrés de
l'espace de noms sont renvoyés.

`WorkerDescription` porte runtime, version SDK, build-id, types déclarés,
dernier battement de cœur et admission courante pour décider quelle cohorte
drainer ou quels workers retirer.

`deregister_worker` est idempotente côté serveur et retire un worker qui n'envoie
plus de battement de cœur pour garder capacité et `list_workers` à jour. Elle
n'interrompt pas les baux en cours.

### Attributs de recherche {#search-attributes}

Les attributs de recherche sont des métadonnées typées de l'espace de noms,
présentes sur les exécutions pour filtrage et indexation. Le client Python
reproduit la même interface de contrôle que la CLI.

| Méthode | Retour | Échecs possibles |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | Erreurs d'authentification/serveur. |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | `InvalidArgument` pour doublon ou type non pris en charge, erreurs d'authentification/serveur. |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`, `InvalidArgument` pour un attribut système, erreurs d'authentification/serveur. |

`SearchAttributeList` sépare définitions `system` et `custom` pour que les scripts
vérifient les clés du moteur (identifiant, état, type, début, etc.) avant de
refuser une clé personnalisée conflictuelle. Les valeurs `attribute_type`
acceptées sont `keyword`, `text`, `int`, `double`, `bool`, `datetime`, `keyword_list`.

### Maintenance système {#system-maintenance}

Scripts opérateur et automatisation d'astreinte pilotent les mêmes boucles que
`dw system:*` via le client. Chaque méthode exige un jeton administrateur,
sinon le serveur renvoie `Unauthorized`.

| Méthode | Retour | Équivalent CLI |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` effectue un passage de réparation. Sans filtre, il couvre tout
l'espace de noms. `run_ids` limite à une liste d'exécutions, `instance_id` à
une seule instance en cours.

Sans `run_ids`, `retention_pass` demande au Server PHP de purger les exécutions
terminales expirées selon la politique, dans sa limite de balayage. Des
`run_ids` explicites ciblent directement les exécutions fermées et contournent
l'âge : ils peuvent purger un historique plus récent que la rétention bornée.
La rétention infinie et les protections d'exécutions archivées restent actives.
`retention_status()` décrit politique, seuil et liste éligible bornée sans
supprimer. Consultez la [procédure de rétention](./server.md#retention) avant
de raccourcir une politique ou de soumettre des cibles explicites.

`activity_timeout_pass` applique les échéances start-to-close et schedule-to-close
dépassées. Sans filtre, le serveur traite les exécutions expirées dans sa limite.
`execution_ids` cible une liste et `limit` borne un passage.

Ces méthodes ne lèvent pas d'erreur sans travail : les appels en période calme
renvoient les mêmes compteurs `passes` / `repaired` / `pruned` sans variation.
Elles peuvent être appelées sans risque depuis des scripts cron opérateur.

## Définir des workflows {#defining-workflows}

Les workflows sont des classes Python décorées avec `@workflow.defn`. La méthode `run` est une fonction synchrone ordinaire ou un générateur synchrone qui émet des commandes durables vers le serveur avec yield. Utilisez la forme générateur lorsque le workflow a besoin de travail durable ; `async def run` n’est pas pris en charge.

```python
from durable_workflow import workflow

@workflow.defn(name="order-processing")
class OrderWorkflow:
    def run(self, ctx, *args):
        order = args[0] if args else {}

        # Schedule an activity and wait for the result
        validated = yield ctx.schedule_activity(
            "validate_order", [order]
        )

        # Start a timer (durable sleep)
        yield ctx.start_timer(seconds=60)

        # Schedule another activity
        receipt = yield ctx.schedule_activity(
            "process_payment", [validated]
        )

        return receipt
```

Le `name` de `@workflow.defn(name="...")` est la clé de type commune aux langages.
Il doit être une chaîne simple, pas un chemin de module ou une référence de classe Python.

### Signaux, requêtes de lecture et mises à jour {#signals-queries-and-updates}

Les signaux sont enregistrés dans l'historique durable et transmis aux
gestionnaires Python pendant la relecture :

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False
        self.approved_by = None

    @workflow.signal("approve")
    def approve(self, by: str) -> None:
        self.approved = True
        self.approved_by = by

    def run(self, ctx, *args):
        ready = yield ctx.wait_condition(
            lambda: self.approved, key="approval.approved", timeout=60,
        )
        return {
            "status": "approved" if ready else "timed_out",
            "approved": self.approved,
            "approved_by": self.approved_by,
        }
```

L’attente appartient au workflow, pas à une activité. Son prédicat lit l’état du gestionnaire de signal reconstruit par rejeu ; le worker ne réserve aucun slot d’activité pour cette approbation. Le délai de la condition est distinct des échéances finies de l’exécution individuelle et de l’exécution logique du workflow. Pour terminer un travail externe, utilisez une activité courte qui soumet puis revient, ainsi qu’un [rappel corrélé](./polling-patterns.md#callback-and-signal-completion).

Les décorateurs de réception de requête et de mise à jour permettent de publier
des noms de gestionnaire stables. Les workers Python exécutent les requêtes
routées par le serveur en relisant l'historique validé puis en appelant le
gestionnaire sur cet état. Ils appliquent aussi les mises à jour acceptées
livrées par les tâches de workflow :

```python
@workflow.defn(name="approval")
class ApprovalWorkflow:
    def __init__(self) -> None:
        self.approved = False

    @workflow.query("status")
    def status(self) -> dict:
        return {"approved": self.approved}

    @workflow.update("set_approval")
    def set_approval(self, approved: bool) -> dict:
        self.approved = approved
        return {"approved": self.approved}

    @set_approval.validator
    def validate_set_approval(self, approved: bool) -> None:
        if not isinstance(approved, bool):
            raise ValueError("approved must be boolean")
```

Le worker termine une requête routée en renvoyant son résultat au serveur.
Pour un validateur de mise à jour déclaré, il reçoit plutôt une tâche de
validation dédiée, relit l'état de référence et appelle uniquement le
validateur. Le serveur n'enregistre aucune acceptation et ne distribue aucun
gestionnaire avant réussite de la validation. Les workers avec validateurs
refusent l'enregistrement si la découverte n'annonce pas le contrat synchrone
de préacceptation. Rejet, worker absent ou incompatible, perte worker, délai
dépassé et achèvement dupliqué ou périmé rejeté par la protection de bail
restent des résultats typés explicites. PHP et Rust n'exposent actuellement
pas d'API d'écriture de validateurs et annoncent cette absence dans leurs
contrats au lieu de revendiquer la parité.

### Cycle de vie des handlers {#handler-lifecycle}

**Validation publiée.** Le SDK Python 2.6.2 a introduit les contrôles de handlers ci-dessous. Les requêtes asynchrones et les validateurs d’updates routés par le serveur restent pris en charge. Consultez [SDK #177](https://github.com/durable-workflow/sdk-python/issues/177#issuecomment-6296781770) pour le périmètre corrigé.

Chaque relecture construit une nouvelle instance de workflow avant d’exécuter `run()`. Les signaux déjà enregistrés au démarrage du workflow sont appliqués après que `run()` atteint son premier `yield` ; le constructeur et l’initialisation précédant ce `yield` passent donc en premier. Les handlers de signaux et d’updates modifient cet état reconstitué. Les requêtes l’inspectent sans changer l’état durable ; les validateurs d’updates inspectent avant l’acceptation un état reconstitué qui ne sera pas conservé. Placez les commandes durables d’activités, de timers et de workflows enfants dans `run()`, pas dans un handler.

| Handler | Forme prise en charge et résultat d’un échec |
| --- | --- |
| `@workflow.signal` | Fonction synchrone. Une exception lors de l’application du signal pendant la relecture fait échouer l’exécution du workflow. |
| `@workflow.update` | Fonction synchrone. Une exception du handler fait échouer cet update. |
| `@workflow.update_validator` ou `@update_method.validator` | Fonction synchrone ou `async def` sous le Worker. Une exception rejette l’update avant son acceptation. |
| `@workflow.query` | Fonction synchrone ou `async def` sous le Worker. Une exception du handler fait échouer la requête, pas l’exécution du workflow. |

La validation refuse les fonctions coroutine pour les signaux et les updates, ainsi que les fonctions génératrices ou génératrices asynchrones pour **tous** les types de handlers décorés, y compris les requêtes et les validateurs. Elle lève `InvalidWorkflowDefinition` à la définition, à l’enregistrement ou à la relecture, y compris pour les handlers hérités et les outils hors ligne. Les wrappers synchrones de signaux et d’updates ne peuvent pas contourner ces contrôles en renvoyant des valeurs asynchrones. Le renvoi de générateurs ou de générateurs asynchrones est refusé pour chaque type de handler. Ces restrictions n’interdisent pas le générateur synchrone utilisé par `run()`.

Pour une requête routée par le serveur, le Worker attend explicitement le résultat asynchrone sous l’échéance d’origine de la requête et l’autorité de prise de tâche et d’annulation. Cette attente n’accorde pas de nouveau budget et n’autorise pas de résultat après la perte de l’autorité. Pour la validation précédant l’acceptation, le Worker attend aussi le résultat asynchrone d’un validateur travaillant sur un état reconstitué qui ne sera pas conservé.

Les utilitaires locaux synchrones ne peuvent pas attendre de résultat asynchrone. `workflow.query_state()` refuse un résultat asynchrone avec `QueryFailed` et `workflow.validate_update()` le refuse avec `UpdateRejected`. Ils ferment les coroutines renvoyées au lieu de les laisser devenir des résultats d’opération.

### Contexte de workflow {#workflow-context}

Le `WorkflowContext` transmis à `run` fournit des opérations déterministes :

| Méthode | Description |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Planifier une activité, avec éventuellement une politique de tentative et des délais par appel |
| `ctx.start_timer(seconds)` | Attente durable |
| `ctx.start_child_workflow(type, args)` | Démarrer un enfant, avec éventuellement des tentatives et délais de workflow par appel |
| `yield [command, [...]]` | Joindre un groupe déterministe imbriqué d'activités, enfants, temporisateurs ou mixte dans l'ordre des entrées |
| `yield ctx.select({key: command, ...})` | Reprendre avec le premier membre validé durablement en gardant les handles des autres |
| `ctx.saga()` | Enregistrer et exécuter des compensations durables d'activité dans l'ordre inverse |
| `ctx.side_effect(fn)` | Capturer une valeur non déterministe |
| `ctx.get_version(change_id, min, max)` | Versionner le code du workflow sans risque |
| `ctx.upsert_search_attributes(attrs)` | Mettre à jour les attributs de recherche |
| `ctx.continue_as_new(*args)` | Redémarrer le workflow avec de nouvelles entrées |
| `ctx.now()` | Heure de début persistée du workflow, fixe pour ce run |
| `ctx.random()` | Générateur pseudoaléatoire à graine fixée |
| `ctx.uuid4()` | UUID déterministe |
| `ctx.logger` | Logger silencieux pendant la relecture |

### Compatibilité à l’entrée et récupération {#entry-compatibility-and-recovery}

**Prise en charge publiée.** Le SDK Python 2.6.2 a introduit la protection d’entrée ci-dessous, avec le routage et la récupération dans Server 2.9.9. Ce sont les versions minimales pour ces fonctions. Installez les versions stables actuelles pour bénéficier des correctifs de sécurité.

Avant d’appeler `run(ctx, *start_input)`, le worker lie les arguments enregistrés à la signature d’entrée. Un argument obligatoire absent ou une arité incompatible lève `WorkflowEntryArgumentsMismatchError` avec le motif `workflow_entry_arguments_mismatch`, avant l’exécution du corps. Les valeurs par défaut ne complètent que les arguments omis. Les annotations Python ne sont toujours pas imposées : changer une annotation ne valide ni ne convertit les données enregistrées. Un `TypeError` levé dans un corps ordinaire ou générateur après une entrée réussie reste un échec applicatif.

Le worker annonce automatiquement `workflow_entry_arguments_validation`. Avec un Server qualifié, la tâche en échec est bloquée pour la relecture et l’exécution d’origine reste non terminale. Les anciens runtimes peuvent relancer cette tâche ; le refus côté SDK seul n’établit pas le contrat complet de récupération.

Inspectez l’exécution exacte avec `await client.describe_workflow_run(workflow_id, run_id)` et l’endpoint de débogage ciblant l’exécution. Après avoir restauré une méthode d’entrée compatible, utilisez la route HTTP de réparation ciblant l’exécution décrite dans la [procédure de récupération](../failures-and-recovery.md#service-entry-recovery). `await client.repair_workflow(workflow_id)` et `handle.repair()` résolvent au contraire l’exécution actuelle de l’instance ; aucun n’accepte d’argument d’identifiant d’exécution. Préservez l’entrée, l’historique, le namespace, la file, le build et les échéances d’origine. Pour les changements de commandes, placez `ctx.get_version` dans cette méthode compatible et qualifiez la relecture à froid avec le [routage des définitions](./worker-compatibility-routing.md#definition-fingerprint-evolution).

### Temps du workflow et attentes durables {#workflow-time-and-durable-waits}

Pendant la relecture par le worker, `ctx.now()` renvoie **l'heure de début
persistée du run**. Elle n'avance pas après une activité, un temporisateur, un
signal ou une autre étape durable. Les relectures à froid du même historique
renvoient cette même valeur initiale. Un successeur continue-as-new possède sa
propre heure de début, sans conserver l'ancrage de l'horloge du prédécesseur.

L'[implémentation Python publiée](https://github.com/durable-workflow/sdk-python/blob/150c6f6bc14e3516f75cc615b2f75f093ed84ea1/src/durable_workflow/workflow.py#L2594-L2601)
utilise `WorkflowStarted.payload.timestamp` s'il est présent, sinon la valeur
canonique `WorkflowStarted.recorded_at`. Une heure persistée absente ou invalide
produit une erreur d'horloge explicite, sans autoriser la lecture de l'horloge
murale du worker. C'est le contrat à début fixe établi dans
[SDK #146](https://github.com/durable-workflow/sdk-python/issues/146).

Attendez une opération durable plutôt que de boucler jusqu'à ce que `ctx.now()` change :

```python
from durable_workflow import workflow


@workflow.defn(name="wait_without_clock_loop")
class WaitWithoutClockLoop:
    def run(self, ctx):
        started_at = ctx.now()
        yield ctx.start_timer(30)
        return {
            "run_started_at": started_at.isoformat(),
            "after_wait": ctx.now().isoformat(),
        }
```

La fin durable du temporisateur reprend le workflow. Les deux horodatages
renvoyés sont la même heure de début. Une boucle comme
`while ctx.now() < deadline` ne devient pas fausse simplement parce que des
temporisateurs se déclenchent.

Pour un délai relatif, utilisez `yield ctx.start_timer(seconds)` ou
`yield ctx.sleep(seconds)`. Utilisez la [sélection de la première fin](#first-completion-selection)
pour mettre un travail en concurrence avec un temporisateur durable. Définissez
`execution_timeout_seconds` et `run_timeout_seconds` dans
`client.start_workflow(...)` lorsque Server doit imposer une échéance au
workflow, y compris lorsque les workers sont arrêtés. Le délai d'attente HTTP
ou de `get_result()` limite seulement cette requête locale ; il ne remplace
pas l'échéance persistée du workflow. Transmettez explicitement une échéance
applicative en entrée de continue-as-new pour la conserver, sans remplacer
l'échéance d'exécution initiale de Server.

Pour mesurer le temps écoulé au sein d'un appel d'activité, lisez une horloge
monotone dans cette activité et renvoyez la durée dans son résultat. Pour une
échéance UTC externe, faites vérifier l'horloge externe faisant autorité par une
activité et renvoyez sa décision ; le workflow relit ce résultat enregistré.
Ne comparez jamais des horodatages UTC à des valeurs monotones et ne soustrayez
pas des mesures monotones de processus ou d'hôtes différents. La soustraction
de `ctx.now()` ne mesure en Python ni le temps de traitement actif ni le temps
mural écoulé.

#### Différences d'horloge entre SDK {#clock-differences-across-sdks}

Ces API sont déterministes lorsqu'elles existent, mais ne partagent pas une même horloge :

| Surface d'écriture | Appels répétés et étapes durables | Successeur continue-as-new |
| --- | --- | --- |
| Python `ctx.now()` | Fixe l'heure de début persistée de ce run, même après un temporisateur ou une activité. | Utilise l'ancrage initial du run successeur. |
| PHP intégré `Workflow::now()` | Commence à l'heure de début du run et avance vers l'heure enregistrée de l'événement consommé par la relecture. Voir [temps du workflow](../features/timers.md#reading-deterministic-time). | Commence avec le nouveau run, puis avance au fil de ses propres événements consommés. |
| SDK PHP en mode service | Pas d'aide publique générale `now()` pour le workflow. Utilisez des opérations durables ou les valeurs enregistrées d'activités ou d'effets de bord. | Transmettez explicitement l'état temporel de l'application s'il doit survivre au passage. |
| SDK Rust en mode service | Pas d'aide publique générale `WorkflowContext::now()`. Un `side_effect` peut enregistrer un petit instantané de l'horloge murale, sans constituer une horloge qui avance. | Un effet de bord dans le nouveau run est une nouvelle opération ; transmettez explicitement l'état temporel antérieur si nécessaire. |

Le comportement PHP intégré existe dans le
[Core publié](https://github.com/durable-workflow/workflow/blob/64efa176e4c37e5d6ae80e767ba3b41464024e53/src/V2/Support/WorkflowFiberContext.php).
Les contextes distincts du [SDK PHP](https://github.com/durable-workflow/sdk-php/blob/2.5.2/src/Worker/WorkflowContext.php)
et du [SDK Rust](https://github.com/durable-workflow/sdk-rust/blob/3.5.5/src/lib.rs)
ont leurs propres API. Portez l'opération durable et la politique d'échéance
sans supposer qu'une aide d'horloge possède la même sémantique dans chaque SDK.

#### Ordonner les événements émis avec des séquences {#order-emitted-events-with-sequence-values}

Un horodatage de workflow n'est pas une clé d'ordre des événements. Tous les
événements Python horodatés avec `ctx.now()` peuvent avoir la même heure.
Utilisez les [offsets des Workflow Streams](./workflow-streams.md), la
[séquence de l'outbox intégrée](../features/message-streams.md) appropriée ou un
compteur déterministe local au workflow. Associez un compteur local au run à
`run_id` ; transmettez-le explicitement via continue-as-new si l'application
a besoin d'une séquence logique unique. Les horodatages ne donnent pas d'ordre
global aux streams ou runs indépendants.


### Tentatives et délais d'activité {#activity-retries-and-timeouts}

Utilisez `ActivityRetryPolicy` et les arguments nommés de délai de
`ctx.schedule_activity(...)` si un appel nécessite un budget ou une échéance
différents du comportement par défaut à tentative unique :

```python
from durable_workflow import ActivityRetryPolicy

receipt = yield ctx.schedule_activity(
    "process_payment",
    [validated],
    retry_policy=ActivityRetryPolicy(
        max_attempts=4,
        initial_interval_seconds=1,
        backoff_coefficient=2,
        maximum_interval_seconds=30,
        non_retryable_error_types=["ValidationError"],
    ),
    start_to_close_timeout=120,
    schedule_to_close_timeout=300,
    heartbeat_timeout=15,
)
```

`start_to_close_timeout` borne une tentative après démarrage par le worker.
`schedule_to_close_timeout` borne toute l'exécution d'activité à travers les
tentatives. `heartbeat_timeout` exige que les activités longues appellent
`activity.context().heartbeat(...)` avant expiration de l'intervalle. La
politique est figée dans l'exécution durable à sa planification. Les déploiements
ultérieurs ne changent donc pas les tentatives en cours.

`ctx.schedule_activity(..., queue="payments-v2")` choisit la file d’une nouvelle exécution d’activité. Les activités déjà enregistrées, leurs nouvelles tentatives et tâches réparées conservent la file d’origine. Modifier `Worker.task_queue` ne déplace ni ces tâches ni la file de workflow des exécutions existantes. Gardez l’ancien pool compatible disponible jusqu’à avoir pris en compte toutes les dépendances ; voir les [files d’activité enregistrées](./task-matching-dispatch.md#recorded-activity-queues).

### Règles de déterminisme {#determinism-rules}

Le code du workflow est relu depuis l'historique. Il ne doit effectuer aucune
opération non déterministe directement :

- Aucune entrée/sortie : appels HTTP, fichiers, requêtes de base
- Aucun `datetime.now()` ou `time.time()` : utilisez `ctx.now()` uniquement comme ancrage fixe du début du run et des temporisateurs durables pour les attentes.
- Aucun `random.random()` : utilisez `ctx.random()`
- Aucun `uuid.uuid4()` : utilisez `ctx.uuid4()`

Tout non-déterminisme doit passer par le contexte ou être capturé avec `ctx.side_effect()`.

### Distribution parallèle {#fan-out}

Émettez une liste de commandes avec yield pour les exécuter simultanément :

```python
@workflow.defn(name="fan-out-example")
class FanOutWorkflow:
    def run(self, ctx, *args):
        items = args[0]

        # Nested lists may mix activities, children, and timers.
        results = yield [
            ctx.schedule_activity("process_item", [items[0]]),
            [
                ctx.start_child_workflow("process-batch", [items[1:]]),
                ctx.start_timer(1),
            ],
        ]

        return results  # same nested shape and input order
```

Le worker émet une commande ordinaire par feuille durable et ajoute les champs
stables partagés `parallel_group_*` et le chemin complet de l'extérieur vers
l'intérieur. L'historique peut fermer les membres dans tout ordre. La relecture
associe toujours résultats et échecs à leur position d'entrée durable. Un
doublon terminal exact est ignoré. L'historique en attente après redémarrage et
l'historique entièrement terminé reconstruisent le même groupe sans replanifier
le travail terminé.

### Sélection du premier achèvement {#first-completion-selection}

Utilisez `ctx.select()` si des opérations indépendantes doivent démarrer
ensemble mais que le workflow peut avancer après un seul achèvement :

```python
selected = yield ctx.select({
    "resolver": ctx.schedule_activity("resolve-request", [request_id]),
    "input": ctx.wait_condition(lambda: self.resolution is not None, key="resolution-ready"),
    "deadline": ctx.start_timer(2),
})

if selected.key == "deadline":
    yield selected.handles["resolver"].cancel()
    return {"status": "timed_out"}

yield selected.handles["deadline"].cancel()
return {"status": "resolved", "value": selected.result()}
```

`SelectionResult` inclut clé stable, index d'entrée, nature d'opération et
identité durable du gagnant, son résultat typé et toutes les instances
`DurableOperationHandle`. `yield handle.await_result()` attend plus tard un
autre membre. `yield handle.cancel()` enregistre une demande explicite sans
résultat. Seul l'historique validé `SelectionOperationCancelled` prouve que
l'annulation a gagné. La relecture dépasse une demande non marquée et
`await_result()` renvoie encore un achèvement validé avant elle. Elle consomme
le gagnant persisté même si un historique ultérieur contient d'abord un autre
achèvement. Livraisons externes dupliquées ou désordonnées ne remplacent pas
un gagnant déjà validé.

### Compensation saga {#saga-compensation}

```python
def forward(saga):
    flight = yield ctx.schedule_activity("trip.reserve-flight", [])
    saga.add_compensation("trip.cancel-flight", [flight])

    hotel = yield ctx.schedule_activity("trip.reserve-hotel", [])
    saga.add_compensation("trip.cancel-hotel", [hotel])

    yield ctx.schedule_activity("trip.charge", [])
    return {"status": "booked"}

return (yield from ctx.saga().run(forward))
```

Après échec, la saga exécute des commandes d'activité ordinaires séquentiellement
dans l'ordre inverse d'enregistrement. Le `cancel_workflow` terminal ne reprend
pas le workflow pour compenser. La fonction utilitaire s'arrête au premier échec de
compensation. `SagaCompensationFailed` conserve échec initial, échec de
compensation, type d'activité et ordre d'enregistrement déterministe comme
diagnostics structurés.

### Workflows enfants {#child-workflows}

```python
from durable_workflow import ChildWorkflowRetryPolicy

result = yield ctx.start_child_workflow(
    "child-workflow-type",
    [{"input": "data"}],
    task_queue="child-queue",
    parent_close_policy="terminate",
    retry_policy=ChildWorkflowRetryPolicy(
        max_attempts=3,
        initial_interval_seconds=2,
        backoff_coefficient=2,
        non_retryable_error_types=["ValidationError"],
    ),
    execution_timeout_seconds=600,
    run_timeout_seconds=120,
)
```

`execution_timeout_seconds` borne l'exécution logique de l'enfant à travers
tentatives et exécutions continue-as-new. `run_timeout_seconds` borne chaque
tentative d'exécution enfant. Le délai de nouvelle tentative s'applique après
échec d'une exécution. Une commande de démarrage invalide est une erreur de
protocole, sans nouvelle tentative enfant.

### Continue-as-new {#continue-as-new}

Pour les workflows longs, continue-as-new remet l'historique à zéro :

```python
from durable_workflow import ContinueAsNew

@workflow.defn(name="polling-workflow")
class PollingWorkflow:
    def run(self, ctx, *args):
        iteration = args[0] if args else 0

        result = yield ctx.schedule_activity("poll_source", [])

        if result.get("done"):
            return result

        # Continue with incremented iteration
        return ContinueAsNew(arguments=[iteration + 1])
```

## Définir des activités {#defining-activities}

Les activités sont des fonctions Python asynchrones décorées par `@activity.defn`.
Contrairement aux workflows, elles peuvent effectuer des entrées/sorties librement.

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

Le `name` est la clé commune aux langages. Un workflow PHP peut planifier une
activité `"send_email"` exécutée par un worker Python, et inversement.

### Contexte d'activité {#activity-context}

Dans une activité, accédez aux métadonnées et au battement de cœur avec `activity.context()` :

```python
@activity.defn(name="long_running_task")
async def long_running_task(items: list) -> dict:
    ctx = activity.context()

    print(f"Attempt #{ctx.info.attempt_number}")
    print(f"Task queue: {ctx.info.task_queue}")

    for i, item in enumerate(items):
        # Check for cancellation
        if ctx.is_cancelled:
            return {"partial": True, "processed": i}

        await process(item)

        # Heartbeat to keep the task alive
        await ctx.heartbeat({"progress": i + 1, "total": len(items)})

    return {"processed": len(items)}
```

### Requêtes de heartbeat {#activity-heartbeat-requests}

Pour les activités distantes, appelez `await ctx.heartbeat(...)` pendant un travail d’activité borné, bien avant `heartbeat_timeout`. La première fenêtre commence lorsque le moteur réclame l’activité, avant que Python reçoive la tâche. Chaque heartbeat enregistré utilise le moment de son enregistrement par le moteur, pas celui où sa réponse atteint Python. Les pauses, la latence et les nouvelles tentatives de transport consomment le budget. Suivez les [conseils de fréquence](../features/heartbeats.md#heartbeat-cadence-and-receipts).

L’appel direct à `Client.heartbeat_activity_task()` utilise la `TransportRetryPolicy` configurée. Après cette politique, les erreurs de transport peuvent se propager comme `httpx.TransportError`, et les refus HTTP deviennent des exceptions du SDK telles que `ServerError`. Il s’agit de nouvelles tentatives HTTP, pas d’une autre tentative d’activité ni de temps supplémentaire pour le heartbeat. `ActivityContext.heartbeat()` peut lever `ActivityCancelled` lorsque le worker demande à l’activité de s’arrêter. Lorsque la supervision coopérative des processus est activée, un échec de heartbeat ou de vérification de possession peut arrêter ou abandonner le callback. Ne supposez pas que chaque échec revient dans un gestionnaire d’exception ou que le nettoyage s’exécute toujours.

Ne masquez pas les échecs de heartbeat ou de possession pour poursuivre le travail externe ou annoncer une réussite. La progression n’est ni une validation externe ni une confirmation de point de reprise. Gardez les effets externes idempotents.

### Erreurs non réessayables {#non-retryable-errors}

Levez `NonRetryableError` pour faire échouer l'activité sans nouvelle tentative :

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

### Activités synchrones et asynchrones {#activity-execution}

Les activités distantes ordinaires définies avec `def` s’exécutent dans un pool
de threads dédié, limité par `max_concurrent_activity_tasks`. Chaque fonction
conserve son contexte d’activité. Le polling, les tâches de workflow et les
heartbeats du worker peuvent progresser pendant qu’une fonction est bloquée.
Les activités `async def` s’exécutent dans la boucle événementielle et doivent
utiliser des E/S non bloquantes. Un appel bloquant dans une fonction asynchrone
bloque toujours cette boucle.

Dans une fonction synchrone, appelez
`activity.context().heartbeat_sync(details)` pour transmettre la progression
par la boucle événementielle responsable, avec les identités d’origine de la
tâche, de la tentative et du worker. Les fonctions asynchrones utilisent
`await activity.context().heartbeat(details)`.

Annuler une attente n’arrête pas un thread Python déjà en cours d’exécution.
Son slot physique reste occupé jusqu’au retour de la fonction. Un retour tardif
ne transmet aucun résultat après l’annulation. Si une fonction tourne encore
après `shutdown_timeout`, l’arrêt lève `RuntimeError` et conserve
l’enregistrement du worker. Fixez des délais pour les E/S vers les services appelés
et utilisez des processus de worker isolés pour les calculs intensifs.
Consultez la [référence du SDK sur l’exécution et l’arrêt](https://python.durable-workflow.com/reference/worker/).

## Worker {#worker}

`Worker` s'enregistre auprès du serveur, interroge les tâches et les transmet
à vos implémentations de workflow et d'activité.

Pour des processus indépendants, suivez le
[guide exécutable de séparation des processus](https://python.durable-workflow.com/guides/separate-workers/)
du SDK Python. Il couvre enregistrements distincts, files communes ou séparées,
tentatives, emplacements par rôle et arrêt propre.

```python
from durable_workflow import Client, Worker

async with Client("http://localhost:8080", token="secret") as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow, OrderWorkflow],
        activities=[greet, send_email, validate],
        max_concurrent_workflow_tasks=10,
        max_concurrent_activity_tasks=10,
    )

    await worker.run()  # blocks until worker.stop() is called
```

Pour les tests rapides ou exemples à un workflow,
`await worker.run_until(workflow_id="...", timeout=60.0)` enregistre le même
worker et le pilote jusqu'à l'état terminal par interrogation séquentielle.
Utilisez `run()` pour les workers déployés qui doivent continuer à interroger.

| Paramètre | Défaut | Description |
|-----------|---------|-------------|
| `task_queue` | obligatoire | File à interroger |
| `workflows` | `()` | Classes de workflow à enregistrer |
| `activities` | `()` | Fonctions d'activité à enregistrer |
| `worker_id` | généré automatiquement | Identifiant unique du worker |
| `poll_timeout` | `35.0` | Délai d'interrogation longue en secondes |
| `max_concurrent_workflow_tasks` | `10` | Maximum de tâches de workflow parallèles |
| `max_concurrent_activity_tasks` | `10` | Maximum de tâches d'activité parallèles |
| `shutdown_timeout` | `30.0` | Secondes de drainage des tâches en cours à l'arrêt |
| `metrics` | enregistreur du client | Enregistreur facultatif des compteurs/histogrammes d'interrogation et de tâches |
| `interceptors` | `()` | Enveloppes de tâches ordonnées pour instrumentation, traçage et politiques |

Les deux valeurs `max_concurrent_*` sont annoncées à l'enregistrement et dans
les diagnostics d'admission. Elles représentent la capacité locale du worker.
Utilisez les plafonds serveur d'[admission des files](/docs/polyglot/task-queue-admission)
pour imposer un budget partagé entre plusieurs workers à un espace de noms,
une file ou un groupe de dépendances en aval.

### Référence API du worker {#worker-api-reference}

| Méthode | Retour | Usage |
| --- | --- | --- |
| `await worker.run()` | `None` | Processus long supervisé par systemd, Docker, Kubernetes ou un shell local. S'enregistre une fois puis interroge workflow, activité et requête jusqu'à arrêt ou annulation. |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | Tests rapides et exemples démarrant un workflow que le même processus pilote jusqu'à un état terminal. |
| `await worker.stop()` | `None` | Arrêt coopératif. Cesse les nouvelles interrogations et draine les tâches en cours jusqu'à `shutdown_timeout`. |

`run()` valide la compatibilité avant l'interrogation. Le worker exige que
`control_plane.version`, `control_plane.request_contract`,
`worker_protocol.version` et `auth_composition_contract` publiés correspondent
aux contrats du SDK. Un manifeste absent ou incompatible lève `RuntimeError`
à l'enregistrement. Les superviseurs échouent ainsi rapidement plutôt que
d'exécuter un worker incapable de terminer les tâches sans risque.

`run_until()` utilise les mêmes enregistrement et distribution que `run()`, mais
interroge séquentiellement et renvoie le `WorkflowExecution` final du workflow
nommé. Il lève `TimeoutError` si le délai expire avant son état terminal.

Pendant l'exécution des tâches :

- les types de workflow ou d'activité inconnus sont signalés au serveur comme
  échecs de tâche, sans rester cachés dans les journaux locaux
- `NonRetryableError` marque les échecs d'activité comme non réessayables
- `ActivityCancelled` se propage comme résultat d'annulation
- les exceptions d'activité non gérées sont réessayables sauf indication
  contraire de la politique ou de l'échéance serveur
- les exceptions de gestionnaire de requête sont signalées comme `QueryFailed`

### Intercepteurs worker {#worker-interceptors}

Passez `interceptors=[...]` pour traçage, métriques, audit ou contrôles de
politique autour des tâches. Ils s'exécutent dans l'ordre fourni. Le premier
est l'enveloppe extérieure et doit appeler `next` pour poursuivre.

```python
from durable_workflow import (
    ActivityInterceptorContext,
    PassthroughWorkerInterceptor,
)

class AuditInterceptor(PassthroughWorkerInterceptor):
    async def execute_activity(self, context: ActivityInterceptorContext, next):
        print("activity started", context.activity_type, context.worker_id)
        return await next(context)

worker = Worker(
    client,
    task_queue="orders",
    workflows=[OrderWorkflow],
    activities=[charge_card],
    interceptors=[AuditInterceptor()],
)
```

| Hook | Champs du contexte | Retour de `next` |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | commandes de workflow ou `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | résultat d'activité décodé |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | chaîne de résultat de requête encodée |

Utilisez `PassthroughWorkerInterceptor` comme base pour un seul hook. Implémentez
directement `WorkerInterceptor` si les vérificateurs de types doivent imposer
la présence de tous les hooks.

## Journalisation {#logging}

Le SDK utilise le module standard `logging` avec des noms de logger structurés :

| Nom | Contenu |
|-------------|--------------|
| `durable_workflow.worker` | Enregistrement, interrogations, achèvements et erreurs worker |
| `durable_workflow.workflow.replay` | Événements de relecture, silencieux pendant celle-ci |

### Configurer la journalisation {#configuring-logging}

Définissez le niveau au point d'entrée de l'application :

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### Niveaux de journalisation {#log-levels}

- **INFO** : enregistrement worker, débuts/fins de tâche, achèvement de workflow
- **DEBUG** : charges utiles détaillées tronquées, cycles d'interrogation
- **WARNING** : erreurs réessayables, appels API échoués, types inconnus
- **ERROR** : échecs non réessayables, arrêts anormaux de relecture

### Journalisation consciente de la relecture {#replay-aware-logging}

Dans les workflows, utilisez `ctx.logger` pour adapter la journalisation à la relecture :

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

Les journaux sont **silencieux pendant la relecture** pour éviter les doublons
lors de la reprise ou de la poursuite des workflows.

### Journalisation structurée {#structured-logging}

Pour des journaux JSON, configurez le logger racine avec un formateur JSON :

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        })

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.getLogger("durable_workflow").addHandler(handler)
logging.getLogger("durable_workflow").setLevel(logging.INFO)
```

## Métriques {#metrics}

`Client(metrics=...)` et `Worker(metrics=...)` acceptent tout enregistreur avec
ces deux méthodes :

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

L'enregistreur par défaut ne fait rien : la collecte n'impose aucun coût de
configuration. Utilisez `InMemoryMetrics` pour les tests ou boucles d'export :

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

Pour Prometheus, installez l'option facultative et passez `PrometheusMetrics` :

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

Le SDK enregistre :

| Métrique | Type | Étiquettes |
|--------|------|------|
| `durable_workflow_client_requests` | Compteur | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | Histogramme | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | Compteur | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | Histogramme | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | Compteur | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | Histogramme | `task_kind`, `task_queue`, `outcome` |

## Planifications {#schedules-1}

Créez et gérez des workflows planifiés via le client :

```python
from durable_workflow import ScheduleSpec, ScheduleAction

# Create a schedule
handle = await client.create_schedule(
    schedule_id="hourly-report",
    spec=ScheduleSpec(cron_expressions=["0 * * * *"]),
    action=ScheduleAction(
        workflow_type="generate-report",
        task_queue="default",
        input=[{"format": "pdf"}],
    ),
    overlap_policy="skip",
    jitter_seconds=30,
)

# List all schedules
schedule_list = await client.list_schedules()

# Describe a schedule
desc = await handle.describe()
print(f"Next fire: {desc.next_fire_at}")
print(f"Total fires: {desc.fires_count}")

# Pause and resume
await handle.pause(note="maintenance window")
await handle.resume(note="maintenance complete")

# Trigger immediately
result = await handle.trigger()

# Backfill missed runs
backfill = await handle.backfill(
    start_time="2024-01-01T00:00:00Z",
    end_time="2024-01-02T00:00:00Z",
)

# Update the schedule
await handle.update(
    spec=ScheduleSpec(cron_expressions=["*/30 * * * *"]),
    note="Changed to every 30 minutes",
)

# Read the audit history stream (paused/resumed/triggered/updated events)
page = await handle.history(limit=100)
for event in page.events:
    print(event.sequence, event.event_type, event.recorded_at)
while page.has_more and page.next_cursor is not None:
    page = await handle.history(limit=100, after_sequence=page.next_cursor)
    for event in page.events:
        print(event.sequence, event.event_type, event.recorded_at)

# Or iterate every event without managing cursors
async for event in handle.iter_history():
    print(event.sequence, event.event_type)

# Delete the schedule (history survives the delete for audit)
await handle.delete()
```

## Client synchrone {#synchronous-client}

Pour scripts, notebooks et contextes non asynchrones, utilisez l'enveloppe synchrone :

<!-- docs-example id="python.sync-client" -->
```python
import uuid

from durable_workflow.sync import Client as SyncClient

client = SyncClient("http://localhost:8080", token="secret")
workflow_id = f"sync-greeting-{uuid.uuid4().hex}"

handle = client.start_workflow(
    workflow_type="greeter",
    task_queue="default",
    workflow_id=workflow_id,
    input=["world"],
)

execution = client.describe_workflow(workflow_id)
print(execution.status)
```

Le client synchrone reproduit l'API asynchrone en enveloppant chaque appel dans `asyncio.run`.

## Gestion des erreurs {#error-handling}

Le SDK associe les codes serveur à des exceptions Python typées :

| Exception | Condition |
|-----------|------|
| `WorkflowNotFound` | Identifiant de workflow inexistant |
| `WorkflowAlreadyStarted` | Identifiant dupliqué avec politique conflictuelle |
| `WorkflowFailed` | Échec de l'exécution du workflow |
| `WorkflowCancelled` | Workflow annulé, hérite de `BaseException` et non `Exception` |
| `WorkflowTerminated` | Workflow terminé de force |
| `ActivityCancelled` | Activité annulée pendant son exécution, hérite de `BaseException` et non `Exception` |
| `ChildWorkflowFailed` | Échec d'un enfant |
| `QueryFailed` | Erreur du gestionnaire de requête |
| `UpdateRejected` | Mise à jour rejetée par le workflow |
| `ScheduleNotFound` | Identifiant de planification inexistant |
| `ScheduleAlreadyExists` | Identifiant de planification dupliqué |
| `NamespaceNotFound` | Espace de noms inexistant |
| `InvalidArgument` | Paramètres de requête invalides |
| `Unauthorized` | Échec d'authentification |
| `ServerError` | Erreur serveur inattendue |

<!-- docs-example id="python.duplicate-start-recovery" -->
```python
from durable_workflow import WorkflowNotFound, WorkflowAlreadyStarted

try:
    handle = await client.start_workflow(
        workflow_type="greeter",
        task_queue="default",
        workflow_id="existing-id",
        input=["world"],
    )
except WorkflowAlreadyStarted:
    handle = client.get_workflow_handle("existing-id")
except WorkflowNotFound:
    print("Workflow type not registered on any worker")
```

### L'annulation échappe volontairement à `except Exception` {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` et `ActivityCancelled` héritent de `BaseException`, pas
`Exception`. Un bloc générique `except Exception:` dans une activité ou du code
attendant `client.get_result()` ne les intercepte **pas**. C'est délibéré :
l'annulation est un résultat du plan de contrôle. L'absorber silencieusement
permettrait à une activité d'annoncer un succès alors que le workflow lui a
demandé de s'arrêter.

Si une activité doit nettoyer localement à l'annulation, interceptez la classe
par son nom puis relevez l'exception. Cela ne reprend pas le workflow fermé
pour compenser :

```python
from durable_workflow import ActivityCancelled, activity

@activity.defn(name="long_task")
async def long_task(items: list) -> dict:
    ctx = activity.context()
    try:
        for i, item in enumerate(items):
            await process(item)
            await ctx.heartbeat({"progress": i + 1})
        return {"done": True}
    except ActivityCancelled:
        await cleanup_partial_state()
        raise
```

Ce choix suit le précédent de `asyncio.CancelledError` et `KeyboardInterrupt`
dans la bibliothèque standard.

## Tests {#testing}

Les auteurs doivent pouvoir tester un workflow sans serveur ni worker actif.
Le module `durable_workflow.testing` fournit deux entrées :

- `WorkflowEnvironment` conduit un workflow à son terme dans un processus
  Python unique avec des activités simulées enregistrées par l'utilisateur.
- `replay_history` et `replay_history_file` relisent un historique de production
  capturé contre le code actuel et lèvent une erreur en cas de non-déterminisme.

Les deux réutilisent le mécanisme `durable_workflow.workflow.replay` du worker.
Un workflow validé par son banc de test se comporte donc de la même manière
avec un vrai worker.

### WorkflowEnvironment {#workflowenvironment}

`WorkflowEnvironment` distribue les commandes émises avec yield aux simulations
enregistrées et déclenche automatiquement temporisateurs, effets de bord et
insertions/mises à jour d'attributs de recherche. Les tests n'ont besoin ni
d'horloge réelle, ni Redis, ni serveur.

```python
from durable_workflow import workflow
from durable_workflow.testing import WorkflowEnvironment

@workflow.defn(name="greeter")
class Greeter:
    def run(self, ctx, name: str):
        greeting = yield ctx.schedule_activity("greet", [name])
        return greeting


def test_greeter_returns_activity_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("greet", "hello, world")

    result = env.execute_workflow(Greeter, "world")

    assert result == "hello, world"
```

| Méthode | Rôle |
| --- | --- |
| `register_activity_result(name, result)` | Renvoie `result` à chaque appel d'activité `name`, si les arguments n'importent pas au test. |
| `register_activity(name, fn)` | Appelle `fn(*arguments)` à chaque invocation de `name`, pour varier selon les arguments ou capturer les appels. |
| `register_child_workflow_result(workflow_type, result)` | Renvoie `result` quand le workflow démarre un enfant de type `workflow_type`. |
| `signal(name, args=None, run=None)` | Met un signal en attente avant la prochaine relecture. Le banc injecte `SignalReceived` et le transmet au gestionnaire `@workflow.signal`. Passez `run=N` pour le maillon `N` d'une chaîne continue-as-new. |
| `register_workflow(workflow_cls)` | Rend une autre classe résoluble par nom. Requis si `continue_as_new(workflow_type=...)` utilise un type différent du workflow initial. |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | Conduit le workflow à un état terminal et renvoie son résultat. Suit les liens `continue_as_new` jusqu'au dernier résultat. Lève `WorkflowFailed` si le workflow se termine en échec. |
| `runs` / `run_count` | Après `execute_workflow`, exposent un `WorkflowRunRecord` par maillon, avec entrée, type, événements et commande terminale pour vérifier la chaîne entière. |

Le banc échoue explicitement si une fixture manque :

- planifier une activité sans simulation enregistrée lève `KeyError`
- démarrer un enfant sans simulation enregistrée lève `KeyError`
- ne pas atteindre d'état terminal dans la limite d'itérations (`1000` par
  défaut) lève `RuntimeError`

Passez `iteration_limit=...` à `WorkflowEnvironment(...)` pour les workflows
qui nécessitent légitimement davantage d'itérations.

#### Simulations d'activité par fonction {#callable-activity-mocks}

Utilisez `register_activity` pour répondre selon les arguments ou enregistrer les appels :

```python
def test_callable_mock_captures_arguments() -> None:
    captured: list[str] = []

    def record_greet(name: str) -> str:
        captured.append(name)
        return f"greeted:{name}"

    env = WorkflowEnvironment()
    env.register_activity("greet", record_greet)

    assert env.execute_workflow(Greeter, "alice") == "greeted:alice"
    assert captured == ["alice"]
```

#### Signaux {#signals}

Les signaux de `env.signal(...)` sont distribués avant la prochaine relecture.
Leur charge utile est enveloppée dans le même `{codec, blob}` que voit le worker,
puis transmise au gestionnaire `@workflow.signal` enregistré :

```python
@workflow.defn(name="approval")
class Approval:
    def __init__(self) -> None:
        self.approved_by: str | None = None

    @workflow.signal("approve")
    def on_approve(self, by: str) -> None:
        self.approved_by = by

    def run(self, ctx):
        yield ctx.schedule_activity("wait", [])
        return {"approved_by": self.approved_by}


def test_signal_is_delivered_before_run_returns() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("wait", None)
    env.signal("approve", ["alice"])

    result = env.execute_workflow(Approval)

    assert result == {"approved_by": "alice"}
```

#### Temporisateurs, effets de bord et attributs de recherche {#timers-side-effects-and-search-attributes}

Le banc déclenche automatiquement l'événement correspondant à chaque commande.
Les workflows ne bloquent donc pas sur le temps réel en test :

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- marqueurs `workflow.version(...)` → `VersionMarkerRecorded`

#### Chaînes continue-as-new {#continue-as-new-chains}

Quand un workflow renvoie `ctx.continue_as_new(...)`, le banc ajoute
`WorkflowContinuedAsNew` à l'exécution qui se termine, remet l'historique à zéro
et démarre une exécution avec les arguments de la commande. `execute_workflow`
renvoie le résultat terminal du dernier maillon.

```python
@workflow.defn(name="countdown")
class Countdown:
    def run(self, ctx, counter: int):
        yield ctx.schedule_activity("emit", [counter])
        if counter > 0:
            return ctx.continue_as_new(counter - 1)
        return {"final_counter": counter}


def test_chain_returns_final_run_result() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("emit", None)

    result = env.execute_workflow(Countdown, 3)

    assert result == {"final_counter": 0}
    assert env.run_count == 4
    assert [r.input for r in env.runs] == [[3], [2], [1], [0]]
```

Si la chaîne change de type, enregistrez d'abord la classe suivante :

```python
@workflow.defn(name="stage-one")
class StageOne:
    def run(self, ctx):
        yield ctx.schedule_activity("stage_one", [])
        return ctx.continue_as_new(workflow_type="stage-two")


@workflow.defn(name="stage-two")
class StageTwo:
    def run(self, ctx):
        return (yield ctx.schedule_activity("stage_two", []))


def test_chain_can_switch_workflow_type() -> None:
    env = WorkflowEnvironment()
    env.register_workflow(StageTwo)
    env.register_activity_result("stage_one", None)
    env.register_activity_result("stage_two", "done")

    assert env.execute_workflow(StageOne) == "done"
    assert [r.workflow_type for r in env.runs] == ["stage-one", "stage-two"]
```

Ciblez un maillon précis avec `run=N` :

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

La longueur est bornée par `continue_as_new_limit`, `50` par défaut. Dépasser la
limite lève `RuntimeError` pour détecter les continuations incontrôlées plutôt
que boucler indéfiniment. Ajustez-la avec
`WorkflowEnvironment(continue_as_new_limit=...)` si une chaîne plus longue est légitime.

#### Assertions d'échec {#failure-assertions}

Un workflow levant une exception Python produit `WorkflowFailed` :

```python
import pytest
from durable_workflow.errors import WorkflowFailed

@workflow.defn(name="failing")
class Failing:
    def run(self, ctx):
        yield ctx.schedule_activity("step", [])
        raise RuntimeError("boom")


def test_workflow_failure_surfaces_as_workflow_failed() -> None:
    env = WorkflowEnvironment()
    env.register_activity_result("step", None)

    with pytest.raises(WorkflowFailed) as exc_info:
        env.execute_workflow(Failing)

    assert "boom" in str(exc_info.value)
```

### Tester la relecture d'un historique de production {#replay-testing-against-production-history}

Utilisez `replay_history` pour tester une modification contre un historique réel
capturé du serveur. Le moteur exécute le code actuel sur les événements
enregistrés et lève une erreur s'il émet une autre commande que celle enregistrée,
ce qui définit un bogue de non-déterminisme.

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

Un workflow précédemment terminé doit toujours terminer avec le même historique.
Si le code diverge, par réordre d'appels, retrait de branches ou changement de
types d'activité, `replay_history` lève une erreur pour détecter la régression
en CI plutôt qu'en production.

`replay_history_file` lit un fichier JSON sous deux formes : liste d'événements
racine, ou dictionnaire avec clé `events` conforme à la réponse `get_history` :

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

Les deux fonctions acceptent l'indication de validation facultative
`payload_codec`. Laissez-la absente pour utiliser l'étiquette enregistrée.
Toute étiquette explicite ou enregistrée doit être `avro`. Les charges durables
`json`, inconnues ou non étiquetées échouent avant décodage.

#### Moteur de relecture par classe {#class-based-replayer}

Pour relire plusieurs types de workflow dans un même test, ou laisser l'événement
`WorkflowStarted` capturé choisir le type, utilisez `Replayer`. Enregistrez les
classes en amont et appelez `replay(...)` pour chaque historique :

```python
from durable_workflow import Replayer, ReplayOutcome

replayer = Replayer(workflows=[OrderWorkflow, RefundWorkflow])

# Explicit type and input — equivalent to replay_history(OrderWorkflow, ...).
outcome: ReplayOutcome = replayer.replay(
    history["events"],
    start_input=["order-42"],
    workflow_type="order",
)

# Type and start input inferred from a WorkflowStarted event in the history.
outcome = replayer.replay(history)  # history may be an events list or a
                                    # dict with an "events" key

for command in outcome.commands:
    # Inspect commands the replayed workflow would have emitted next.
    ...
```

`Replayer(workflows=[...])` rejette un ensemble vide ou un enregistrement dupliqué
avec `ValueError`. `replay(...)` lève `ValueError` si le type demandé n'est pas
enregistré, ou si plusieurs workflows sont enregistrés sans `workflow_type`
fourni ni événement `WorkflowStarted` dans l'historique.

`ReplayOutcome.commands` est la même liste de commandes que renvoient les
fonctions `replay_history`. La classe permet de partager un enregistrement
entre de nombreux historiques d'une suite de tests.

### Référence du banc de test {#test-harness-reference}

| Symbole | Rôle |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | Banc dans le processus qui conduit un workflow à son terme avec simulations d'activités et d'enfants. |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | Relit une séquence contre le code actuel. Lève une erreur en cas de non-déterminisme. |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | Charge et relit un historique JSON sur disque, liste racine ou dictionnaire avec `events`. |
| `durable_workflow.Replayer(*, workflows=[...])` | Moteur par classe. Enregistrez les classes puis appelez `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` pour chaque historique. Déduit `workflow_type` et `start_input` d'un `WorkflowStarted` s'il est présent. |
| `durable_workflow.ReplayOutcome` | Dataclass renvoyée par `Replayer.replay`, portant `commands: list[Command]`, les prochaines commandes qu'aurait émises le workflow relu. |
| `durable_workflow.errors.WorkflowFailed` | Levée par `execute_workflow` si le workflow termine en échec. |
| `durable_workflow.errors.WorkflowCancelled` | État terminal d'un workflow annulé. Hérite de `BaseException`. |
| `durable_workflow.errors.WorkflowTerminated` | État terminal après terminaison par le serveur. Hérite de `BaseException`. |

## Codec des charges utiles {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Chaque charge utile traversant la frontière du protocole worker porte une étiquette de codec.
  Durable Workflow 2.0 a un seul codec public : <code data-payload-codec-field="codec">avro</code>.
  Le SDK Python rejette les charges durables JSON, inconnues et non étiquetées
  au lieu de choisir un autre décodeur. Consultez le <a href="/docs/polyglot/avro-value-protocol/">protocole Avro Value</a>.
</div>

### Avro est inclus {#avro-support-is-built-in}

L'artefact SDK 2.0 fixé installe `fastavro` comme dépendance runtime. Chaque
sortie (`start_workflow`, `signal_workflow`, `query_workflow`, `update_workflow`,
encodage de résultats d'activité, actions de planification) émet donc des
charges Avro par le parcours optimisé de production. Aucune option de codec
supplémentaire n'est à installer.

### Valeurs typées fixes {#fixed-typed-values}

Le SDK sélectionne explicitement des branches nommées du schéma partagé
`durable_workflow.protocol.Value`. Il n'encode pas la valeur en JSON dans Avro.
Entiers/doubles, chaînes/octets, booléens/entiers et listes/tables de
correspondance restent donc distincts entre SDK. Le format utilise l'encadrement
Avro à objet unique et l'empreinte du schéma. Une empreinte inconnue échoue avec
`unsupported_payload_schema`.

Chaque interface client et worker fonctionne de bout en bout avec Avro par défaut :

- **Démarrages, signaux, requêtes de lecture et mises à jour client** :
  `start_workflow`, `signal_workflow`, `query_workflow` et `update_workflow`
  émettent `payload_codec = "avro"` via le schéma Value fixe. Un client Python
  peut piloter les workflows relus par PHP et les autres SDK, et inversement.
- **Worker d'activité** : les arguments Avro se décodent automatiquement. Le
  worker encode les résultats en Avro pour une frontière commune à PHP, Python
  et aux futurs SDK.
- **Échecs d'activité** : `fail_activity_task(..., details=...)` envoie
  `failure.details` dans une enveloppe `{codec, blob}`. Le serveur enregistre
  le blob et `details_payload_codec` pour garder les diagnostics Python
  indépendants du langage dans les exports et vues d'observabilité.
- **Relecture d'historique worker** : entrée de démarrage et résultats d'activité
  Avro sont décodés pendant la relecture. Un workflow Python participe ainsi
  à une exécution encodée en Avro.
- **Tâches de requête de lecture** : les tâches routées portent arguments de
  workflow, arguments de requête et historique en Avro. Le worker renvoie
  le résultat dans une enveloppe Avro.

### Exécuter un worker d'activité Python sur une exécution v2 {#running-a-python-activity-worker-against-a-v2-run}

Aucune configuration de codec n'est nécessaire. Le SDK valide `payload_codec`
avant chaque décodage, n'accepte que `avro`, exécute l'activité et renvoie un
résultat Avro. Toute autre étiquette est refusée avec `unsupported_payload_codec`.
Le worker ne tente jamais de détecter ou deviner le format.

### Types conservés à l'aller-retour entre Python et PHP {#types-that-round-trip-cleanly-across-python-and-php}

| Type Python | Branche Avro Value | Type PHP |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array` (liste) |
| `dict[str, ...]` | `MapValue` | `array` (table à clés de chaîne) |

Adaptez les types Python spécifiques, dataclasses, ensembles, tuples et objets
datetime, en chaînes canoniques, entiers, tables ou listes avant leur usage
comme valeurs de workflow ou d'activité.

## Utiliser un serveur partagé {#running-against-a-shared-server}

Le [démarrage rapide](#quickstart) montre comment lancer un serveur local avec
l'image Docker publiée. En équipe, le worker vise généralement un serveur
existant, en préproduction, production ou développement partagé :

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Définissez `namespace` sur l'espace provisionné pour votre équipe et utilisez
ses identifiants. L'opérateur Server gère sa création. Consultez le
[guide Server](/docs/polyglot/server).

Le même constructeur prend en charge Cloud. Utilisez l'URL et la valeur
d'espace de noms fournies par Cloud. Définissez `control_token` sur l'identifiant
runtime client et `worker_token` sur celui du worker. Cloud provisionne
l'espace. Ne remplacez pas son adresse par un Server auto-hébergé. Consultez le
[runtime Cloud géré](/docs/polyglot/cloud-control-plane).
