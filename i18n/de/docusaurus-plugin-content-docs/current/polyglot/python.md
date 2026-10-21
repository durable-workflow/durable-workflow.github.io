---
sidebar_position: 4
tags:
  - Python
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - Python SDK
  - durable_workflow Client
  - Python-Worker
  - asynchroner Workflow-Client
---

import ProductPromotion from '@site/src/components/ProductPromotion';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Python SDK {#python-sdk}

Das Python SDK ist ein schlanker, vorrangig asynchroner Client für einen selbst
gehosteten Durable Workflow Server oder eine Cloud-Namespace-Laufzeitumgebung.
Python-Prozesse können über deren Control-Plane-API Workflows starten,
beobachten, signalisieren und abbrechen sowie sich als Worker zur Ausführung
von Workflow-Tasks und Aktivitäten registrieren.

## Die lokale Testumgebung der Sample App ausprobieren {#try-the-local-sample-app-playground}

Für den kürzesten Implementierungsweg ohne Cloud öffnen Sie den aktuellen
[`main`-Branch der Sample App in GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
und führen Sie aus:

<!-- docs-example id="sdk.python.sample-app-playground" -->
```bash
scripts/playground python
```

Die lokale Testumgebung erzeugt Workflow- und Aktivitätsquellcode unter der
Verantwortung des Aufrufers, wählt aktuelle stabile Artefakte und startet die
veröffentlichten Server- und Waterline-Versionen. Vor dem Workflow-Start wartet
sie auf eine Worker-Registrierung, deren Identität, Workflow-Typ, Aktivitätstyp
und Task-Warteschlange zum erzeugten Vertrag passen. Erfolg erfordert das
erwartete abgeschlossene Ergebnis und die Historie. Danach gibt das Terminal
den genauen lokalen Waterline-Lauflink und den Pfad zum strukturierten
JSON-Nachweis aus.

Paketinstallation, Inline-Schnellstart, API-Referenz und Repository-Beispiel
unten bleiben die direkten Wege ohne Sample App.

<ProductPromotion source="docs-v2-python-sdk">
Führen Sie Python-Clients und -Worker mit getrennten rollenspezifischen
Zugangsdaten gegen einen Cloud-verwalteten Namespace aus.
</ProductPromotion>

Das SDK verwendet dasselbe dauerhafte Modell wie das PHP-Paket: Instanz-IDs, Lauf-IDs, Historienereignisse, Task-Warteschlangen und Typschlüssel sind sprachübergreifend gemeinsam. Ein Python-Worker kann Aktivitäten eines in PHP implementierten Workflows bedienen und umgekehrt.

Den Fähigkeitsvergleich von Python SDK, PHP SDK, Rust SDK und `dw` bietet
[Client- und Worker-Fähigkeiten](/docs/polyglot/cli-python-parity/).

Konstruktorsignaturen, Rückgabetypen, Ausnahmeklassen und Metriknamen stehen
in der generierten [Python-SDK-API-Referenz](https://python.durable-workflow.com/).

Python SDK 2.5.0 ergänzt einen optionalen begrenzten Historiencache für
Sticky-Ausführung. Verwenden Sie Server 2.5.10 oder neuer und aktivieren Sie
ihn auf jedem Worker. Siehe [Portable Worker-Affinität](/docs/polyglot/portable-worker-affinity)
und den [Python-Leitfaden mit ausführbarem Beispiel](https://python.durable-workflow.com/guides/sticky-execution/).

Cloud-Kunden verwenden Laufzeit-URL und Namespace des bereitgestellten
Namespace mit getrennten Client- und Worker-Zugangsdaten. Die Verbindungsgrenze
beschreibt [Verwaltete Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane).
Der Schnellstart unten verwendet lokale selbst gehostete Werte.

## Voraussetzungen {#requirements}

- Python 3.10 oder neuer
- Docker für den lokalen Server dieses Schnellstarts, ein bestehender
  [selbst gehosteter Server](/docs/polyglot/server) oder eine bereitgestellte
  [Cloud-Namespace-Laufzeitumgebung](/docs/polyglot/cloud-control-plane)

## Installation {#installation}

Installieren Sie das <PythonPackageReleaseLink authority="qualified">stabile
Python-SDK-Release</PythonPackageReleaseLink>. Die genaue Anforderung wird aus
demselben Tupel wie der Server-Schnellstart erzeugt. Eine Lock- oder
Constraints-Datei kann sie für Reproduzierbarkeit festhalten.

<!-- docs-example id="python.sdk.install" -->
```bash
pip install %%artifact.pythonPackagePin%%
```

Das SDK verwendet [httpx](https://www.python-httpx.org/) für HTTP und das
Python-Paket `fastavro` zum Codieren des Apache-Avro-Übertragungsformats des
einzigen öffentlichen v2-Nutzlast-Codecs. Prometheus-Metriken sind optional.

## Schnellstart {#quickstart}

Dieses vollständige Python-Programm definiert einen Workflow mit einer Aktivität, startet ihn gegen einen lokalen Durable Workflow Server und wartet auf das Ergebnis:

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

### Mit einem lokalen Server ausführen {#running-against-a-local-server}

Das Programm oben setzt einen unter `http://localhost:8080` erreichbaren
Durable Workflow Server mit lokalem `dev-token` voraus. Falls noch keiner läuft,
ist das veröffentlichte Server-Image der schnellste Weg ohne Quellcode:

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

Produktionsbereitstellung mit Authentifizierungstreibern, Datenbankkonfiguration und TLS erklärt der [Server-Einrichtungsleitfaden](/docs/polyglot/server).

Ein größeres Beispiel enthält das SDK-Repository unter [`examples/order_processing`](https://github.com/durable-workflow/sdk-python/tree/main/examples/order_processing): ein Docker-Compose-Stack, der einen Python-Worker durch einen vollständigen Bestell-Workflow führt.

## Client-API-Referenz {#client-api-reference}

Der asynchrone `durable_workflow.Client` ist der öffentliche Einstiegspunkt für
Control-Plane- und Worker-Plane-HTTP-Aufrufe. Verwenden Sie ihn als asynchronen
Kontextmanager, damit der zugrunde liegende Verbindungspool von
`httpx.AsyncClient` sauber geschlossen wird.

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

### Konstruktor {#constructor}

| Argument | Typ | Standard | Verwenden, wenn |
| --- | --- | --- | --- |
| `base_url` | `str` | erforderlich | Server-Ursprung ohne `/api`. |
| `token` | `str \| None` | `None` | Ein Bearer-Token soll Control-Plane- und Worker-Plane-Aufrufe autorisieren. |
| `control_token` | `str \| None` | `None` | Control-Plane-Aufrufe benötigen ein anderes Bearer-Token als Worker-Abfragen. |
| `worker_token` | `str \| None` | `None` | Worker-Plane-Aufrufe benötigen ein anderes Bearer-Token als Betriebsaufrufe. |
| `namespace` | `str` | `"default"` | Server-Namespace über `X-Namespace` ansprechen. |
| `timeout` | `float` | `60.0` | Standard-HTTP-Timeout überschreiben. |
| `retry_policy` | `TransportRetryPolicy \| None` | Standardrichtlinie | Transportwiederholungen für vorübergehende HTTP-Fehler abstimmen. |
| `metrics` | `MetricsRecorder \| None` | ohne Wirkung | Client- und Worker-Metriken an einen eigenen Recorder ausgeben. |
| `payload_size_limit_bytes` | `int` | SDK-Standard | Vertrag des Servers zur maximalen Nutzlastgröße abbilden. |
| `payload_size_warning_threshold_percent` | `int` | SDK-Standard | Vor Erreichen der konfigurierten Nutzlastgrenze warnen. |
| `payload_size_warnings` | `bool` | `True` | Lokale Nutzlastgrößenwarnungen in Tests oder kontrollierten Skripten deaktivieren. |

`token` ist die einfachste Option. Sind `control_token` und `worker_token`
gesetzt, verwenden Control-Plane-Methoden `control_token` und
Worker-Plane-Methoden `worker_token`.

### Externer Nutzlastspeicher {#external-payload-storage}

Normale `Client`- und `Worker`-Operationen verwenden automatisch den authentifizierten Runtime-Transport von Server. Das SDK ermittelt Richtlinie und Limits über `GET /api/cluster/info`, lädt codierte Werte über dem Schwellenwert oder bei Bedarf zum Einhalten des Anfragelimits hoch und lädt Referenzwerte vor dem Decodieren. Workflow- und Aktivitätscode erhalten den decodierten Wert. Anbieter-Zugangsdaten bleiben auf dem Server. Entfernte Worker benötigen weder boto3 noch Anbieter-Clients oder Zugriff auf das lokale Server-Verzeichnis.

Die Runtime-Referenz verwendet Schema `durable-workflow.v2.runtime-external-payload-reference.v1` und eine opake `reference_id`. Sie enthält keine Anbieter-`uri`. Upload und Abruf verwenden normale Rollen-Zugangsdaten und den Namespace, prüfen Größe und SHA-256 und erhalten die Aufgabenversuchs- und Lease-Abgrenzung beim Worker-Abschluss. Der [HTTP-Vertrag](./server-api-reference.md#runtime-external-payload-transport) beschreibt Routen, Limits und typisierte Ablehnungen. Unterstützung erfordert einen verfügbaren kompatiblen Transport, nicht nur einen konfigurierten Treiber.

Die folgenden **direkten Anbieterhelfer** dienen anwendungseigenem Speicher und Tests, die bewusst auf ihren eigenen Anbieter zugreifen. Sie verwenden ein anderes URI-Schema. Normale Server- oder Cloud-Clients benötigen sie nicht. Server lehnt Anbieter-Envelopes `external_storage` mit HTTP `422` und `external_payload_unsupported` ab.

| API | Rolle | Fehleroberfläche |
| --- | --- | --- |
| `ExternalStorageDriver` | Protokoll für `put(data, sha256=..., codec=...)`, `get(uri)` und `delete(uri)`. | Vom Treiber ausgelöste Speicherfehler. |
| `LocalFilesystemExternalStorage` | Abhängigkeitsfreier `file://`-Treiber für lokale Entwicklung und Tests. | `ValueError`, wenn eine referenzierte URI die konfigurierte Wurzel verlässt. |
| `S3ExternalStorage` | Adapter für einen boto3-kompatiblen Client. | `ValueError` bei fremden Bucket-/Präfixreferenzen oder Antworten ohne Bytes. |
| `GCSExternalStorage` | Adapter für einen Client nach Art von google-cloud-storage. | `ValueError` bei fremden Bucket-/Präfixreferenzen oder Antworten ohne Bytes. |
| `AzureBlobExternalStorage` | Adapter für einen Azure-Container-Client. | `ValueError` bei fremden Container-/Präfixreferenzen oder Antworten ohne Bytes. |
| `ExternalPayloadReference` | Unveränderliche Übertragungsreferenz mit `uri`, `sha256`, `size_bytes`, `codec` und Schema. | `ValueError`, wenn `from_dict()` ein nicht unterstütztes Schema oder ungültige Felder erhält. |
| `ExternalPayloadCache` | Begrenzter Replay-Cache für bereits geprüfte externe Nutzlastbytes. | Konstruktor lehnt nicht positive Eintrags- oder Byte-Grenzen ab. |
| `store_external_payload()` | Speichert codierte Bytes über einen Treiber und liefert `ExternalPayloadReference`. | Treiberfehler. |
| `fetch_external_payload()` | Ruft referenzierte Bytes ab und prüft vor Decodierung Größe und SHA-256. | `ExternalPayloadIntegrityError` bei Größen-/Hashabweichung. |
| `delete_external_payload()` | Löscht das referenzierte Objekt und verdrängt den Cache-Eintrag. | Vom Treiber ausgelöste Speicherfehler. |
| `external_storage_envelope()` | Codiert einen Wert bis zur Schwelle inline und schreibt danach Bytes über einen Treiber. | `ValueError` bei ungültiger Schwelle oder fehlendem Treiber zur Referenzauflösung. |
| `external_storage_driver_from_policy()` | Erstellt einen direkten Treiber aus expliziter Richtlinie und anwendungseigenen Anbieter-Clients. Gewährt keinen direkten Anbieterzugriff auf Server oder Cloud. | `ValueError` bei deaktivierter/nicht unterstützter Richtlinie oder fehlendem Client/Bucket/Container. |

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

Für diese direkten Helfer lautet das Referenzschema `EXTERNAL_PAYLOAD_REFERENCE_SCHEMA` (`durable-workflow.v2.external-payload-reference.v1`). Anbieteradapter fügen `durable-workflow` keine Cloud-SDK-Abhängigkeiten hinzu; Anwendungen stellen ihre konfigurierten S3-, GCS- oder Azure-Clients bereit.

Ihre Anbieterreferenz enthält diese Felder. Sie ist nicht die Runtime-Referenz der Server-HTTP-Routen:

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

`ExternalPayloadReference.from_dict()` lehnt unbekannte Schemas und fehlerhafte Felder ab. `fetch_external_payload()` prüft `size_bytes` und `sha256` vor der Rückgabe und wirft bei Größen- oder Hashabweichung `ExternalPayloadIntegrityError`. Fehlende Objekte können außerdem einen Fehler des Anbietertreibers auslösen. Verwenden Sie `ExternalPayloadCache` nur für geprüfte Bytes. Cache-Verdrängung berechtigt nicht zum Löschen Server-verwalteter Objekte. `delete_external_payload()` ist eine direkte Anbieteroperation, keine Bereinigungs-API für Runtime-Referenzen.

Verwenden Sie `external_storage_driver_from_policy()` in Code, der bewusst auf anwendungseigenen Anbieterspeicher zugreift und den erforderlichen Client besitzt. Das Lesen der Richtlinie macht Anbieter-Envelopes nicht zu gültigen Server-Anfragen. Die Clients bleiben anwendungseigen. Optionale Adapter ergänzen keine Runtime-Abhängigkeiten auf boto3, google-cloud-storage oder azure-storage-blob:

```python
from durable_workflow.external_storage import external_storage_driver_from_policy

namespace = await client.describe_namespace("billing")
driver = external_storage_driver_from_policy(
    namespace.external_payload_storage,
    s3_client=application_owned_s3_client,
)
```

Die Factory wirft `ValueError`, wenn die Richtlinie deaktiviert, der Treiber nicht unterstützt oder der passende Client nicht vorhanden ist. Deaktivierte Richtlinien liefern keinen leeren Treiber. Prüfen Sie vorher `policy.enabled`.

### Namespaces {#namespaces}

Namespaces sind die Mandantengrenze für Workflows, Zeitpläne, Suchattribute und
externen Nutzlastspeicher. Der Client zielt über `namespace=` im Konstruktor
jeweils auf einen Namespace. Die Betriebsoberfläche unten gilt jedoch für
jeden Namespace, für den das Bearer-Token autorisiert ist.

| Methode | Rückgabe | Fehleroberfläche |
| --- | --- | --- |
| `await client.list_namespaces()` | `NamespaceList` | Authentifizierungs-/Serverfehler. |
| `await client.describe_namespace(name)` | `NamespaceDescription` | `NamespaceNotFound`, Authentifizierungs-/Serverfehler. |
| `await client.create_namespace(name, description=None, retention_days=30)` | `NamespaceDescription` | `InvalidArgument` bei doppelten Namen oder ungültiger Aufbewahrung, Authentifizierungs-/Serverfehler. |
| `await client.update_namespace(name, description=None, retention_days=None)` | `NamespaceDescription` | `NamespaceNotFound`, `InvalidArgument`, Authentifizierungs-/Serverfehler. Nur angegebene Felder werden gesendet. |
| `await client.set_namespace_external_storage(name, driver=..., enabled=True, threshold_bytes=None, config=None)` | `NamespaceDescription` | `InvalidArgument` bei fehlgeschlagener Server-Validierung der Richtlinie, Authentifizierungs-/Serverfehler. |
| `await client.test_external_storage(driver=None, small_payload_bytes=None, large_payload_bytes=None)` | `StorageTestResult` | `InvalidArgument` bei fehlenden Pflichtfeldern der gebundenen Richtlinie, Authentifizierungs-/Serverfehler. |

`set_namespace_external_storage` entspricht `dw namespace:set-storage-driver`.
Das erste Positionsargument ist der Namespace-`name`, passend zu
`describe_namespace`, `create_namespace` und `update_namespace`. Der veraltete
Alias `namespace=` erzeugt eine `DeprecationWarning`. Neuer Code sollte den
positionellen `name` verwenden. Das Dictionary `config` enthält treiberspezifische
Schlüssel, einschließlich optionalem `disk` bei `s3`, `gcs` und `azure`, damit
Zugangsdaten auf Server bleiben. Die zurückgegebene `NamespaceDescription`
zeigt die tatsächlich gespeicherte Richtlinie, einschließlich der vom Server
gewählten Standardschwelle, wenn der Aufrufer keine angegeben hat.

`test_external_storage` entspricht `dw storage:test`. Der Server schreibt und
liest eine kleine und eine große Nutzlast über den gebundenen externen
Speichertreiber und liefert `StorageTestResult` mit
`StoragePayloadTestResult`-Datensätzen je Nutzlast und den Feldern `wrote`,
`read`, `verified`, `latency_ms` und `bytes`.

`NamespaceDescription` enthält die unter [Externer Nutzlastspeicher](#external-payload-storage) beschriebene `external_payload_storage`-Richtlinie. Normale Clients verwenden automatisch den ermittelten Runtime-Transport. Direkte Anbieterhelfer setzen anwendungseigenen Anbieterzugriff voraus; eine Richtlinienbeschreibung macht Anbieter-Envelopes nicht zu gültigen Server-Anfragen.

### Cluster und Task-Warteschlangen {#cluster-and-task-queues}

| Methode | Rückgabe | Hinweise |
| --- | --- | --- |
| `await client.health()` | `dict[str, Any]` | Ruft den Zustandsendpunkt für Lebendigkeitsprüfungen auf. |
| `await client.get_cluster_info()` | `dict[str, Any]` | Liest Server-Version, Protokoll-, Fähigkeits- und Kompatibilitätsmetadaten. |
| `await client.list_task_queues()` | `TaskQueueList` | Listet im Namespace sichtbare Task-Warteschlangen auf. |
| `await client.describe_task_queue(name)` | `TaskQueueDescription` | Liefert Worker-Kapazität, aktuelle Leases, Abfragezulassung und Zuweisungsbudgets. |
| `await client.list_task_queue_build_ids(task_queue)` | `TaskQueueBuildIdRollout` | Snapshot des Kohortenzustands je Build-ID einer Warteschlange, einschließlich unversionierter Worker in der Kohorte mit `build_id: None`. |
| `await client.drain_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Markiert Build-ID-Kohorte als auslaufend, damit sie keine neuen Tasks übernimmt. `build_id=None` leert unversionierte Worker. Idempotent. |
| `await client.resume_task_queue_build_id(task_queue, build_id)` | `TaskQueueBuildIdRolloutState` | Hebt frühere Leerung auf, damit die Kohorte wieder Arbeit übernimmt. `build_id=None` setzt unversionierte Worker fort. Idempotent. |

Task-Warteschlangenrückgabetypen enthalten verschachtelte Dataclasses
`TaskQueueAdmission`, `TaskQueueTaskAdmission`, `TaskQueueQueryAdmission`,
`TaskQueueBuildIdCohort`, `TaskQueueBuildIdRollout` und
`TaskQueueBuildIdRolloutState`. Skripte können serverseitige Kapazität und
Build-ID-Rollout damit ohne Prosaauswertung prüfen. Den vollständigen Ablauf
zeigt [Worker-Build-ID-Rollout](/docs/polyglot/worker-build-id-rollout).
Die entsprechenden CLI-Befehle sind `dw task-queue:build-ids`,
`dw task-queue:drain` und `dw task-queue:resume`.

### Workflow-Operationen {#workflow-operations}

| Methode | Rückgabe | Fehleroberfläche |
| --- | --- | --- |
| `await client.start_workflow(...)` | `WorkflowHandle` | `WorkflowAlreadyStarted`, `InvalidArgument`, `Unauthorized`, `ServerError` |
| `await client.describe_workflow(workflow_id)` | `WorkflowExecution` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.list_workflows(...)` | `WorkflowList` | Authentifizierungs-/Serverfehler |
| `await client.list_workflow_runs(workflow_id)` | `WorkflowRunList` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.describe_workflow_run(workflow_id, run_id)` | `WorkflowRun` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.get_history(workflow_id, run_id)` | decodierte Historiennutzlast | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.export_history(workflow_id, run_id)` | decodierte Archivhistoriennutzlast | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.signal_workflow(workflow_id, signal_name, args=None)` | `None` | `WorkflowNotFound`, `InvalidArgument`, Authentifizierungs-/Serverfehler |
| `await client.query_workflow(workflow_id, query_name, args=None)` | decodiertes Abfrageergebnis | `QueryFailed`, `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.update_workflow(workflow_id, update_name, args=None, ...)` | decodiertes Update-Ergebnis | `UpdateRejected`, `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.cancel_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.terminate_workflow(workflow_id, reason=None)` | `None` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.repair_workflow(workflow_id)` | `WorkflowCommandResult` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.archive_workflow(workflow_id, reason=None)` | `WorkflowCommandResult` | `WorkflowNotFound`, Authentifizierungs-/Serverfehler |
| `await client.get_result(handle, poll_interval=0.5, timeout=30.0)` | decodierte Workflow-Ausgabe | `WorkflowFailed`, `WorkflowCancelled`, `WorkflowTerminated`, `TimeoutError` |

`start_workflow` akzeptiert `workflow_type`, `task_queue`, optional `workflow_id`,
optional `input`, `duplicate_policy`, `memo`, `search_attributes`, `business_key`,
`execution_timeout_seconds` und `run_timeout_seconds`. Alle Aufrufernutzlasten
werden vor der HTTP-Grenze in Avro-Envelopes verpackt.

Verwenden Sie `client.get_workflow_handle(workflow_id, run_id=None, workflow_type="")`,
wenn ein Skript die Workflow-ID bereits kennt und Handle-Methoden nutzen möchte.

| `WorkflowHandle`-Methode | Entsprechende Client-Methode |
| --- | --- |
| `await handle.result(...)` | `client.get_result(handle, ...)` |
| `await handle.describe()` | `client.describe_workflow(handle.workflow_id)` |
| `await handle.signal(name, args=None)` | `client.signal_workflow(...)` |
| `await handle.query(name, args=None)` | `client.query_workflow(...)` |
| `await handle.update(name, args=None, ...)` | `client.update_workflow(...)` |
| `await handle.cancel(reason=None)` | `client.cancel_workflow(...)` |
| `await handle.terminate(reason=None)` | `client.terminate_workflow(...)` |

Beide Operationen schließen den Server-Lauf sofort mit unterschiedlichen
terminalen Ergebnissen. `cancel_workflow` stellt keine kooperative Anfrage an
Workflow-Code zu und führt keine Saga-/finally-Bereinigung aus. Verwenden Sie
`request_cancellation()` mit kooperierenden Workern für begrenzte
Workflow-Bereinigung. [Kooperativer Abbruch](/docs/polyglot/cancellation)
erklärt Operationsrichtlinien, Überwachung und Wiederherstellung.

### Zeitpläne {#schedules}

Zeitpläne verwenden `ScheduleSpec` für Kalender-/Intervallregeln und
`ScheduleAction` für die beim Auslösen gesendete Workflow-Startanfrage.

| Methode | Rückgabe | Hinweise |
| --- | --- | --- |
| `await client.create_schedule(...)` | `ScheduleHandle` | Erstellt einen Zeitplan und liefert ein Handle. |
| `await client.list_schedules()` | `ScheduleList` | Listet sichtbare Zeitpläne auf. |
| `await client.describe_schedule(schedule_id)` | `ScheduleDescription` | Liest Zeitplanstatus, Aktion, nächste Auslösung und Zähler. |
| `await client.update_schedule(schedule_id, ...)` | `None` | Aktualisiert Spezifikation, Aktion, Überlappungsrichtlinie, Jitter, Memo, Suchattribute oder Notiz. |
| `await client.pause_schedule(schedule_id, note=None)` | `None` | Pausiert künftige Auslösungen. |
| `await client.resume_schedule(schedule_id, note=None)` | `None` | Setzt pausierten Zeitplan fort. |
| `await client.trigger_schedule(schedule_id, overlap_policy=None)` | `ScheduleTriggerResult` | Fordert sofortige Auslösung an. |
| `await client.backfill_schedule(schedule_id, start_time=..., end_time=..., overlap_policy=None)` | `ScheduleBackfillResult` | Holt verpasste Auslösefenster nach. |
| `await client.get_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `ScheduleHistoryPage` | Liefert eine nach `sequence` aufsteigend geordnete Seite der Audit-Historie. `limit` wird serverseitig auf 1 bis 500 begrenzt (Standard 100). `after_sequence` ist ein nicht negativer Cursor aus `next_cursor` der vorigen Seite. Löst bei unbekannter Zeitplan-ID `ScheduleNotFound` aus. Historie überlebt `delete_schedule`, damit der Betrieb den Löschgrund auditieren kann. |
| `client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)` | `AsyncIterator[ScheduleHistoryEvent]` | Liefert jedes Audit-Ereignis des Zeitplans und liest intern Seiten, bis der Server `has_more=False` meldet. Dieselbe Fehleroberfläche wie `get_schedule_history`. |
| `await client.delete_schedule(schedule_id)` | `None` | Löscht den Zeitplan. |

`client.get_schedule_handle(schedule_id)` liefert ein `ScheduleHandle` mit
`describe`, `update`, `pause`, `resume`, `trigger`, `backfill`, `history`,
`iter_history` und `delete`, die an passende Client-Methoden weiterleiten.
`ScheduleHandle.history(...)` liefert `ScheduleHistoryPage`,
`ScheduleHandle.iter_history(...)` einen `AsyncIterator[ScheduleHistoryEvent]`.

`ScheduleHistoryPage` enthält die geordnete Liste `events`, `has_more`, einen
Ganzzahl-`next_cursor` (oder auf der letzten Seite `None`), `schedule_id` und
den zugehörigen `namespace`. Jedes `ScheduleHistoryEvent` enthält `sequence`,
`event_type` (`ScheduleCreated`, `SchedulePaused`, `ScheduleResumed`,
`ScheduleUpdated`, `ScheduleTriggered`, `ScheduleTriggerSkipped` oder
`ScheduleDeleted`), `recorded_at`, optional `workflow_instance_id` und
`workflow_run_id` ausgelöster Workflows und das rohe Dictionary `payload`,
das die Control Plane für den Übergang aufzeichnete.

### Brückenereignisse und Worker-Plane-Methoden {#bridge-events-and-worker-plane-methods}

`await client.send_webhook_bridge_event(adapter, action=..., target=..., input=..., idempotency_key=..., correlation=None)`
liefert `BridgeAdapterOutcome`, denselben maschinenlesbaren Ergebnisvertrag
wie `dw bridge:webhook`. Es ist der Python-Einstiegspunkt für begrenzten
Eingang aus Webhook-artigen Systemen.

Die Worker-Plane-Methoden auf niedriger Ebene sind für eigene Worker und
Protokolltests öffentlich. Normale Anwendungen sollten `Worker` nutzen:

| Methodengruppe | Methoden |
| --- | --- |
| Worker-Registrierung | `register_worker` |
| Workflow-Tasks | `poll_workflow_task`, `complete_workflow_task`, `fail_workflow_task`, `workflow_task_history` |
| Abfrage-Tasks | `poll_query_task`, `complete_query_task`, `fail_query_task` |
| Aktivitäts-Tasks | `poll_activity_task`, `complete_activity_task`, `fail_activity_task`, `heartbeat_activity_task` |

Diese Methoden senden `X-Durable-Workflow-Protocol-Version` und verwenden bei
Konfiguration `worker_token`. Bevorzugen Sie den höher abstrahierten `Worker`,
sofern Sie keinen SDK-Adapter oder Protokollkonformitätstest schreiben.

`workflow_task_history(...)` liest Replay-Historie eines bereits geleasten
Workflow-Tasks seitenweise. Rufen Sie es nur auf, nachdem
`poll_workflow_task(...)` `next_history_page_token` liefert:

```python
page = await client.workflow_task_history(
    task_id="workflow-task-01",
    next_history_page_token="history-page-2",
    lease_owner="python-worker-1",
    workflow_task_attempt=2,
)
```

Die Anfrage verwendet `next_history_page_token`, `lease_owner` und
`workflow_task_attempt`. Die decodierte Antwort nutzt die Worker-Protokollfelder
`history_events`, `total_history_events` und `next_history_page_token`, nicht
die Control-Plane-Laufhistoriennamen `events` oder `next_page_token`.

### Worker {#workers}

Das Worker-Verzeichnis zeigt kürzlich vom Server beobachtete Worker und deren
Fähigkeiten. Steuern Sie damit Build-ID-Rollouts, finden Sie veraltete Worker
zur Deregistrierung und gleichen Sie Flottenkapazität aus Betriebsskripten ab.

| Methode | Rückgabe | Fehleroberfläche |
| --- | --- | --- |
| `await client.list_workers(task_queue=None, status=None)` | `WorkerList` | Authentifizierungs-/Serverfehler. |
| `await client.describe_worker(worker_id)` | `WorkerDescription` | `WorkerNotFound`, Authentifizierungs-/Serverfehler. |
| `await client.deregister_worker(worker_id)` | `dict[str, Any]` | `WorkerNotFound`, Authentifizierungs-/Serverfehler. |

`list_workers` filtert serverseitig: `task_queue` begrenzt auf eine Warteschlange,
`status` auf eine vom Server erkannte Statuszeichenfolge. Standardmäßig werden
alle registrierten Worker des Namespace geliefert.

`WorkerDescription` enthält Laufzeitumgebung, SDK-Version, Build-ID, deklarierte
Workflow-/Aktivitätstypen, letzten Heartbeat und aktuelle Task-Zulassung.
Skripte können damit entscheiden, welche Kohorte auslaufen soll oder welche
Worker aus dem Verzeichnis entfernt werden sollen.

`deregister_worker` ist serverseitig idempotent. Es entfernt einen Worker ohne
weitere Heartbeats, damit Kapazitätsrechnung und `list_workers` sauber bleiben.
Es unterbricht keine laufenden Leases.

### Suchattribute {#search-attributes}

Suchattribute sind typisierte Namespace-Metadaten an Workflow-Ausführungen zum
Filtern und Indizieren. Der Python-Client spiegelt dieselbe Control-Plane-Oberfläche
wie die CLI.

| Methode | Rückgabe | Fehleroberfläche |
| --- | --- | --- |
| `await client.list_search_attributes()` | `SearchAttributeList` | Authentifizierungs-/Serverfehler. |
| `await client.create_search_attribute(name, attribute_type)` | `dict[str, Any]` | `InvalidArgument` bei doppelten Namen oder nicht unterstützten Typen, Authentifizierungs-/Serverfehler. |
| `await client.delete_search_attribute(name)` | `dict[str, Any]` | `SearchAttributeNotFound`, `InvalidArgument` bei systemdefiniertem Attribut, Authentifizierungs-/Serverfehler. |

`SearchAttributeList` trennt `system`- und `custom`-Definitionen. Betriebsskripte
können damit engineeigene Schlüssel (Workflow-ID, Status, Typ, Startzeit usw.)
prüfen, bevor sie kollidierende eigene Schlüssel ablehnen. Unterstützte
`attribute_type`-Werte sind `keyword`, `text`, `int`, `double`, `bool`,
`datetime` und `keyword_list`.

### Systemwartung {#system-maintenance}

Betriebsskripte und Bereitschaftsautomatisierung steuern über den Client dieselben
Wartungsschleifen wie `dw system:*`. Jede Methode benötigt Admin-Berechtigung
im Bearer-Token, andernfalls liefert der Server `Unauthorized`.

| Methode | Rückgabe | CLI-Entsprechung |
| --- | --- | --- |
| `await client.repair_status()` | `dict[str, Any]` | `dw system:repair-status` |
| `await client.repair_pass(run_ids=None, instance_id=None)` | `dict[str, Any]` | `dw system:repair-pass` |
| `await client.retention_status()` | `dict[str, Any]` | `dw system:retention-status` |
| `await client.retention_pass(run_ids=None, limit=None)` | `dict[str, Any]` | `dw system:retention-pass` |
| `await client.activity_timeout_status()` | `dict[str, Any]` | `dw system:activity-timeout-status` |
| `await client.activity_timeout_pass(execution_ids=None, limit=None)` | `dict[str, Any]` | `dw system:activity-timeout-pass` |

`repair_pass` führt einen Task-Reparatursuchlauf aus. Ohne Filter deckt er den
gesamten Namespace ab. `run_ids` begrenzt auf eine Liste von Workflow-Läufen,
`instance_id` auf eine einzelne laufende Instanz.

Ohne `run_ids` fordert `retention_pass` den PHP Server auf, abgelaufene terminale
Läufe nach aktueller Namespace-Richtlinie bis zur Suchgrenze zu bereinigen.
Explizite `run_ids` zielen direkt auf geschlossene Läufe und umgehen diese
Alterssuche. Sie können jüngere Historie als das begrenzte Aufbewahrungsfenster
entfernen. Schutz für unbegrenzte Aufbewahrung und archivierte Läufe gilt
weiter. `retention_status()` zeigt aktuelle Richtlinie, Stichtag und begrenzte
Liste geeigneter Läufe ohne Löschung. Prüfen Sie das
[Aufbewahrungsverfahren](./server.md#retention) vor Verkürzen einer Richtlinie
oder Übermitteln expliziter Ziele.

`activity_timeout_pass` erzwingt Start-to-close- und Schedule-to-close-Fristen
bereits überfälliger Aktivitätsausführungen. Ohne Filter verarbeitet der Server
abgelaufene Ausführungen bis zur Suchgrenze. `execution_ids` wählt eine konkrete
Liste, `limit` begrenzt einen Durchlauf.

Leere Arbeit löst keine Fehler aus: Wiederholte Aufrufe in ruhigen Zeiten
liefern dieselben Zähler `passes` / `repaired` / `pruned` mit Änderungen von null
und sind daher für Cron-Betriebsskripte sicher.

## Workflows definieren {#defining-workflows}

Workflows sind mit `@workflow.defn` dekorierte Python-Klassen. Die Methode `run` ist eine gewöhnliche synchrone Funktion oder ein synchroner Generator, der dauerhafte Befehle an den Server ausgibt. Verwenden Sie die Generatorform, wenn der Workflow dauerhafte Arbeit ausführen muss; `async def run` wird nicht unterstützt.

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

Der `name` in `@workflow.defn(name="...")` ist der sprachübergreifende Typschlüssel. Er muss eine einfache Zeichenfolge sein, kein Python-Modulpfad oder Klassenverweis.

### Signale, Abfragen und Updates {#signals-queries-and-updates}

Signale werden in dauerhafter Historie aufgezeichnet und beim Workflow-Replay
an Python-Handler zugestellt:

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

Der Workflow wartet, nicht eine Aktivität. Das Prädikat liest den bei der Wiedergabe rekonstruierten Zustand des Signalhandlers; für die Freigabe bleibt kein Aktivitätsslot belegt. Das Zeitlimit der Bedingung ist von den endlichen Lauf- und Ausführungsfristen des Workflows getrennt. Zur Fertigstellung externer Aufträge verwenden Sie eine kurze Aktivität, die den Auftrag übermittelt und zurückkehrt, sowie einen [zugeordneten Rückruf](./polling-patterns.md#callback-and-signal-completion).

Empfängerdekoratoren für Abfragen und Updates erlauben Workflow-Klassen,
stabile Handler-Namen zu veröffentlichen. Python-Worker führen servergeroutete
Abfrage-Tasks aus, indem sie die festgeschriebene Workflow-Historie wiedergeben
und den registrierten Abfrage-Handler auf dem rekonstruierten Zustand aufrufen.
Sie wenden auch angenommene, über Workflow-Tasks zugestellte Updates an:

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

Python-Worker schließen servergeroutete Abfragen durch Rückgabe eines
Abfrage-Task-Ergebnisses an den Server ab. Für einen deklarierten
Update-Validator erhält der Worker stattdessen einen eigenen Validierungs-Task,
gibt maßgeblichen Workflow-Zustand wieder und ruft nur den Validator auf.
Vor erfolgreicher Validierung zeichnet der Server kein angenommenes Update
auf und startet keinen Update-Handler. Worker mit Validatoren verweigern die
Registrierung, sofern die Erkennung nicht den synchronen Vertrag vor Annahme
meldet. Ablehnung, fehlende oder inkompatible Worker, Worker-Verlust, Timeout
und gesperrte doppelte oder veraltete Abschlüsse bleiben explizite typisierte
Ergebnisse. PHP und Rust bieten derzeit keine APIs zur Update-Validator-Implementierung
und melden diese Abwesenheit in ihren Workflow-Verträgen, statt
Validator-Parität zu beanspruchen.

### Lebenszyklus der Handler {#handler-lifecycle}

**Veröffentlichte Validierung.** Python SDK 2.6.2 hat die folgenden Handler-Schutzprüfungen eingeführt. Asynchrone, vom Server geroutete Abfragen und Update-Validatoren werden weiterhin unterstützt. Den korrigierten Umfang beschreibt [SDK #177](https://github.com/durable-workflow/sdk-python/issues/177#issuecomment-6296781770).

Jedes Replay erstellt vor der Ausführung von `run()` eine neue Workflow-Instanz. Bereits beim Workflow-Start aufgezeichnete Signale werden angewendet, nachdem `run()` sein erstes `yield` erreicht hat. Konstruktor und Initialisierung vor diesem `yield` laufen daher zuerst. Signal- und Update-Handler verändern diesen durch Replay hergestellten Zustand. Abfragen untersuchen ihn, ohne dauerhaften Zustand zu ändern; Update-Validatoren prüfen vor der Annahme einen anschließend verworfenen Replay-Zustand. Dauerhafte Aktivitäten, Timer und Kind-Workflow-Befehle gehören in `run()`, nicht in einen Handler.

| Handler | Unterstützte Form und Fehlerfolge |
| --- | --- |
| `@workflow.signal` | Synchrone Funktion. Eine Ausnahme beim Anwenden des Signals während des Replays lässt den Workflow-Lauf fehlschlagen. |
| `@workflow.update` | Synchrone Funktion. Eine Handler-Ausnahme lässt dieses Update fehlschlagen. |
| `@workflow.update_validator` oder `@update_method.validator` | Synchrone Funktion oder `async def` unter dem Worker. Eine Ausnahme lehnt das Update vor seiner Annahme ab. |
| `@workflow.query` | Synchrone Funktion oder `async def` unter dem Worker. Eine Handler-Ausnahme lässt die Abfrage fehlschlagen, nicht den Workflow-Lauf. |

Die Validierung lehnt Coroutine-Funktionen für Signale und Updates ab. Generator- und asynchrone Generatorfunktionen werden für **alle** Arten dekorierter Handler abgelehnt, einschließlich Abfragen und Validatoren. Sie löst bei Definition, Registrierung oder Replay `InvalidWorkflowDefinition` aus, auch bei geerbten Handlern und in Offline-Werkzeugen. Synchrone Wrapper für Signale und Updates können die Prüfungen nicht durch die Rückgabe asynchroner Werte umgehen. Generatorwerte und asynchrone Generatorwerte werden bei jeder Handler-Art abgelehnt. Diese Einschränkungen verbieten nicht den synchronen Generator von `run()`.

Bei einer vom Server gerouteten Abfrage wartet der Worker ausdrücklich auf ein asynchrones Ergebnis, unter der ursprünglichen Abfragefrist sowie der ursprünglichen Claim- und Abbruchautorität. Dieses Warten gibt weder ein neues Budget noch erlaubt es ein Ergebnis nach Verlust der Autorität. Bei der Prüfung vor Annahme wartet der Worker ebenfalls auf ein asynchrones Validatorergebnis, das anhand eines anschließend verworfenen Replay-Zustands ermittelt wird.

Die lokalen synchronen Hilfsmethoden können nicht asynchron warten. Dabei lehnt `workflow.query_state()` ein asynchrones Ergebnis mit `QueryFailed` ab, und `workflow.validate_update()` lehnt es mit `UpdateRejected` ab. Beide schließen zurückgegebene Coroutinen, statt sie als Operationsergebnisse nach außen gelangen zu lassen.

### Workflow-Kontext {#workflow-context}

Der an `run` übergebene `WorkflowContext` bietet deterministische Operationen:

| Methode | Beschreibung |
|--------|-------------|
| `ctx.schedule_activity(type, args)` | Aktivitäts-Task planen, optional mit Wiederholungs- und Timeout-Optionen je Aufruf |
| `ctx.start_timer(seconds)` | Dauerhaft warten |
| `ctx.start_child_workflow(type, args)` | Kind-Workflow starten, optional mit Wiederholungs- und Workflow-Timeout-Optionen je Aufruf |
| `yield [command, [...]]` | Verschachtelte deterministische Aktivitäts-, Kind-Workflow-, Timer- oder gemischte Gruppe in Eingabereihenfolge zusammenführen |
| `yield ctx.select({key: command, ...})` | Beim ersten dauerhaft festgeschriebenen Mitglied fortsetzen und Handles aller Nichtgewinner behalten |
| `ctx.saga()` | Dauerhafte Aktivitätskompensationen in umgekehrter Reihenfolge registrieren und ausführen |
| `ctx.side_effect(fn)` | Nicht deterministischen Wert erfassen |
| `ctx.get_version(change_id, min, max)` | Workflow-Code sicher versionieren |
| `ctx.upsert_search_attributes(attrs)` | Suchattribute aktualisieren |
| `ctx.continue_as_new(*args)` | Workflow mit neuer Eingabe neu starten |
| `ctx.now()` | Gespeicherte Workflow-Startzeit, während dieses Runs fest |
| `ctx.random()` | Zufallsgenerator mit festgelegtem Startwert |
| `ctx.uuid4()` | Deterministische UUID |
| `ctx.logger` | Beim Replay stummer Logger |

### Kompatibilität am Einstieg und Wiederherstellung {#entry-compatibility-and-recovery}

**Veröffentlichte Unterstützung.** Python SDK 2.6.2 hat den nachfolgenden Einstiegsschutz eingeführt, ergänzt durch Routing und Wiederherstellung in Server 2.9.9. Dies sind die Mindestversionen für diese Funktionen. Installieren Sie aktuelle stabile Versionen, um Sicherheitskorrekturen zu erhalten.

Vor dem Aufruf von `run(ctx, *start_input)` bindet der Worker die aufgezeichneten Argumente an die Einstiegssignatur. Ein fehlendes erforderliches Argument oder eine unpassende Argumentanzahl löst vor der Ausführung des Rumpfs `WorkflowEntryArgumentsMismatchError` mit dem Grund `workflow_entry_arguments_mismatch` aus. Standardwerte ergänzen nur ausgelassene Argumente. Python-Annotationen werden weiterhin nicht erzwungen: Eine geänderte Annotation prüft oder konvertiert keine aufgezeichneten Daten. Ein `TypeError` im erfolgreich betretenen normalen Rumpf oder Generatorrumpf bleibt ein Anwendungsfehler.

Der Worker kündigt `workflow_entry_arguments_validation` automatisch an. Mit einem qualifizierten Server wird die fehlgeschlagene Aufgabe für Replay blockiert, während der ursprüngliche Lauf nichtterminal bleibt. Ältere Laufzeiten können die Aufgabe stattdessen wiederholen; die SDK-seitige Ablehnung allein belegt nicht den vollständigen Wiederherstellungsvertrag.

Prüfen Sie den genauen Lauf mit `await client.describe_workflow_run(workflow_id, run_id)` und dem Debug-Endpunkt für den ausgewählten Lauf. Verwenden Sie nach Wiederherstellung einer kompatiblen Einstiegsmethode die laufbezogene HTTP-Reparaturroute aus dem [Wiederherstellungsverfahren](../failures-and-recovery.md#service-entry-recovery). `await client.repair_workflow(workflow_id)` und `handle.repair()` ermitteln dagegen den aktuellen Lauf der Instanz; keine der Methoden akzeptiert eine Lauf-ID als Argument. Bewahren Sie ursprüngliche Eingabe, Historie, Namespace, Warteschlange, Build und Fristen. Platzieren Sie bei Befehlsänderungen `ctx.get_version` innerhalb dieser kompatiblen Methode und qualifizieren Sie kaltes Replay anhand des [Routings nach Definition](./worker-compatibility-routing.md#definition-fingerprint-evolution).

### Workflow-Zeit und dauerhafte Warteoperationen {#workflow-time-and-durable-waits}

Beim Replay im Worker gibt `ctx.now()` die **gespeicherte Startzeit des Runs**
zurück. Sie schreitet nach einer Aktivität, einem Timer, Signal oder anderen
dauerhaften Schritt nicht fort. Wiederholte Cold-Replays derselben Historie
liefern denselben Startwert. Ein Continue-as-new-Nachfolger hat seine eigene
Startzeit und übernimmt nicht den Uhranker des Vorgängers.

Die [veröffentlichte Python-Implementierung](https://github.com/durable-workflow/sdk-python/blob/150c6f6bc14e3516f75cc615b2f75f093ed84ea1/src/durable_workflow/workflow.py#L2594-L2601)
verwendet `WorkflowStarted.payload.timestamp`, falls vorhanden, andernfalls das
kanonische `WorkflowStarted.recorded_at`. Fehlende oder ungültige gespeicherte
Replay-Zeit führt zu einem ausdrücklichen Uhrfehler, nicht zum Lesen der
Wanduhr des Workers. Das ist der in [SDK #146](https://github.com/durable-workflow/sdk-python/issues/146)
vereinbarte Vertrag mit fester Startzeit.

Warten Sie auf eine dauerhafte Operation, statt auf eine Änderung von
`ctx.now()` zu warten:

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

Der dauerhafte Abschluss des Timers setzt den Workflow fort. Beide
zurückgegebenen Zeitstempel enthalten dieselbe Startzeit. Eine Schleife wie
`while ctx.now() < deadline` wird nicht allein durch ausgelöste Timer falsch.

Für eine relative Verzögerung verwenden Sie `yield ctx.start_timer(seconds)`
oder `yield ctx.sleep(seconds)`. Verwenden Sie die
[Auswahl des ersten Abschlusses](#first-completion-selection), wenn Arbeit mit
einem dauerhaften Timer konkurrieren soll. Setzen Sie `execution_timeout_seconds`
und `run_timeout_seconds` bei `client.start_workflow(...)`, wenn der Server eine
Workflow-Frist auch bei gestoppten Workern durchsetzen muss. Ein HTTP- oder
`get_result()`-Wartezeitlimit begrenzt nur die lokale Anfrage und ersetzt keine
gespeicherte Workflow-Frist. Geben Sie eine Anwendungsfrist ausdrücklich als
Eingabe an Continue-as-new weiter, ohne die ursprüngliche Ausführungsfrist des
Servers zu ersetzen.

Um die tatsächliche Dauer innerhalb eines Aktivitätsaufrufs zu messen, lesen
Sie dort eine monotone Uhr und geben die Dauer als Aktivitätsergebnis zurück.
Für eine externe UTC-Frist lassen Sie eine Aktivität die maßgebliche externe
Uhr prüfen und ihre Entscheidung zurückgeben; der Workflow spielt dieses
gespeicherte Ergebnis ab. Vergleichen Sie UTC-Zeitstempel nie mit monotonen
Werten und subtrahieren Sie keine monotonen Messwerte verschiedener Prozesse
oder Hosts. Die Differenz von `ctx.now()`-Werten misst in Python weder aktive
Verarbeitungszeit noch verstrichene Wanduhrzeit.

#### Unterschiede zwischen den SDK-Uhren {#clock-differences-across-sdks}

Diese APIs sind, soweit vorhanden, deterministisch, teilen aber keine gemeinsame Uhr:

| Autorenschnittstelle | Wiederholte Aufrufe und dauerhafte Schritte | Continue-as-new-Nachfolger |
| --- | --- | --- |
| Python `ctx.now()` | Bleibt auf der gespeicherten Startzeit dieses Runs, auch nach einem Timer oder einer Aktivität. | Verwendet den Startanker des Nachfolger-Runs. |
| Embedded PHP `Workflow::now()` | Beginnt mit der Run-Startzeit und schreitet zur aufgezeichneten Ereigniszeit fort, die das Replay verarbeitet hat. Siehe [Workflow-Zeit](../features/timers.md#reading-deterministic-time). | Beginnt mit dem neuen Run und schreitet durch dessen verarbeitete Ereignisse fort. |
| PHP-SDK im Service-Modus | Kein allgemeiner öffentlicher Workflow-Helfer `now()`. Verwenden Sie dauerhafte Operationen oder aufgezeichnete Aktivitäts-/Seiteneffektwerte. | Übergeben Sie Anwendungszeitdaten ausdrücklich, wenn sie die Übergabe überleben müssen. |
| Rust-SDK im Service-Modus | Kein allgemeiner öffentlicher Helfer `WorkflowContext::now()`. Ein `side_effect` kann eine kleine Wanduhrmomentaufnahme speichern; sie ist keine fortschreitende Uhr. | Ein Seiteneffekt im neuen Run ist eine neue Operation; übergeben Sie bei Bedarf frühere Zeitdaten ausdrücklich. |

Das Embedded-PHP-Verhalten ist im
[veröffentlichten Core](https://github.com/durable-workflow/workflow/blob/64efa176e4c37e5d6ae80e767ba3b41464024e53/src/V2/Support/WorkflowFiberContext.php)
vorhanden. Der separate [PHP-SDK-Kontext](https://github.com/durable-workflow/sdk-php/blob/2.5.2/src/Worker/WorkflowContext.php)
und [Rust-SDK-Kontext](https://github.com/durable-workflow/sdk-rust/blob/3.5.5/src/lib.rs)
haben eigene APIs. Übertragen Sie die dauerhafte Operation und Fristenregel,
statt für jeden SDK-Uhrhelfer dieselbe Semantik anzunehmen.

#### Ausgegebene Ereignisse mit Sequenzwerten ordnen {#order-emitted-events-with-sequence-values}

Ein Workflow-Zeitstempel ist kein Sortierschlüssel für Ereignisse. Python-Ereignisse
mit `ctx.now()` können alle denselben Zeitstempel haben. Verwenden Sie
[Workflow-Stream-Offsets](./workflow-streams.md), die passende
[Embedded-Outbox-Sequenz](../features/message-streams.md) oder einen
deterministischen Workflow-lokalen Zähler. Kombinieren Sie einen Run-lokalen
Zähler mit `run_id`; übergeben Sie ihn bei Continue-as-new ausdrücklich, wenn
die Anwendung eine logische Sequenz benötigt. Zeitstempel geben unabhängigen
Streams oder Runs keine globale Reihenfolge.


### Aktivitätswiederholungen und -Timeouts {#activity-retries-and-timeouts}

Verwenden Sie `ActivityRetryPolicy` und Timeout-Schlüsselwortargumente an
`ctx.schedule_activity(...)`, wenn ein Aufruf ein anderes Wiederholungsbudget
oder eine andere Frist als das standardmäßige Ein-Versuch-Verhalten benötigt:

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

`start_to_close_timeout` begrenzt einen Versuch ab Worker-Start.
`schedule_to_close_timeout` begrenzt die gesamte Aktivitätsausführung über alle
Versuche. `heartbeat_timeout` verlangt bei lang laufenden Aktivitäten
`activity.context().heartbeat(...)` vor Ablauf des Intervalls. Die
Wiederholungsrichtlinie wird beim Planen als Snapshot an die dauerhafte
Aktivitätsausführung gebunden. Spätere Bereitstellungen ändern daher laufende
Versuche nicht.

`ctx.schedule_activity(..., queue="payments-v2")` wählt die Queue einer neu geplanten Aktivitätsausführung. Bereits gespeicherte Aktivitäten, ihre Wiederholungen und reparierte Aufgaben behalten die ursprüngliche Queue. Eine Änderung von `Worker.task_queue` verschiebt weder diese Aufgaben noch die Workflow-Queue bestehender Läufe. Halte den kompatiblen alten Pool verfügbar, bis alle Abhängigkeiten berücksichtigt sind; siehe [gespeicherte Aktivitätsqueues](./task-matching-dispatch.md#recorded-activity-queues).

### Regeln für Determinismus {#determinism-rules}

Workflow-Code wird aus der Historie wiedergegeben. Er darf keine nicht deterministischen Operationen direkt ausführen:

- Keine E/A (HTTP-Aufrufe, Dateilesen, Datenbankabfragen).
- Kein `datetime.now()` oder `time.time()`: `ctx.now()` nur als festen Run-Startanker verwenden; für Warteoperationen dauerhafte Timer verwenden.
- Kein `random.random()`: `ctx.random()` verwenden.
- Kein `uuid.uuid4()`: `ctx.uuid4()` verwenden.

Jeder Nichtdeterminismus muss über den Kontext laufen oder mit `ctx.side_effect()` erfasst werden.

### Auffächerung {#fan-out}

Geben Sie eine Liste von Befehlen aus, um sie nebenläufig auszuführen:

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

Der Worker gibt je dauerhaftem Blatt einen gewöhnlichen Befehl aus und ergänzt
die gemeinsamen stabilen Felder `parallel_group_*` sowie den vollständigen Pfad
von außen nach innen. Historie kann Mitglieder in beliebiger Reihenfolge
schließen. Replay bindet Ergebnisse und Fehler trotzdem an die dauerhafte
Eingabeposition. Exakte doppelte Terminalzustellungen werden ignoriert.
Ausstehende Historie nach Worker-Neustart und vollständig abgeschlossene
Historie rekonstruieren dieselbe Gruppe ohne erneute Planung erledigter Arbeit.

### Auswahl des ersten Abschlusses {#first-completion-selection}

Verwenden Sie `ctx.select()`, wenn unabhängige Arbeit gemeinsam starten soll,
der Workflow aber nach Abschluss eines Mitglieds vorankommen kann:

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

`SelectionResult` enthält stabilen Schlüssel, Eingabeindex, Operationsart und
dauerhafte Identität des Gewinners, typisiertes Ergebnis sowie alle
`DurableOperationHandle`-Instanzen. `yield handle.await_result()` wartet später
auf einen Nichtgewinner. `yield handle.cancel()` zeichnet eine explizite
Anfrage ohne Rückgabewert auf. Nur festgeschriebene Historie
`SelectionOperationCancelled` belegt den gewonnenen Abbruch. Replay geht über
eine unmarkierte Anfrage hinweg. `await_result()` liefert weiterhin einen zuerst
festgeschriebenen Abschluss. Replay verwendet den gespeicherten Gewinner,
selbst wenn spätere Historie zuerst einen anderen Abschluss enthält. Doppelte
und ungeordnete externe Zustellung kann keinen festgeschriebenen Gewinner ersetzen.

### Saga-Kompensation {#saga-compensation}

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

Nach einem Fehler führt die Saga gewöhnliche Aktivitätsbefehle sequenziell in
umgekehrter Registrierungsreihenfolge aus. Terminales `cancel_workflow` setzt
den Workflow nicht zum Kompensieren fort. Der Helfer stoppt beim ersten
Kompensationsfehler. `SagaCompensationFailed` erhält auslösenden Fehler,
Kompensationsfehler, Kompensationsaktivitätstyp und deterministische
Registrierungsreihenfolge als strukturierte Diagnosen.

### Kind-Workflows {#child-workflows}

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

`execution_timeout_seconds` begrenzt die logische Kind-Workflow-Ausführung über
Wiederholungen und Continue-as-new-Läufe hinweg. `run_timeout_seconds`
begrenzt jeden Kindlaufversuch. Wiederholungswartezeiten gelten nach
fehlgeschlagenem Kindlauf. Ungültige Kindstartbefehle sind Protokollfehler und
werden nicht als Kindversuche wiederholt.

### Continue-as-new {#continue-as-new}

Verwenden Sie für lang laufende Workflows Continue-as-new zum Zurücksetzen der Historie:

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

## Aktivitäten definieren {#defining-activities}

Aktivitäten sind asynchrone, mit `@activity.defn` dekorierte Python-Funktionen. Anders als Workflows dürfen Aktivitäten frei E/A ausführen.

```python
from durable_workflow import activity

@activity.defn(name="send_email")
async def send_email(to: str, subject: str, body: str) -> dict:
    # Activities can do I/O: HTTP calls, database queries, etc.
    response = await some_email_client.send(to=to, subject=subject, body=body)
    return {"message_id": response.id, "sent": True}
```

Der `name` ist der sprachübergreifende Typschlüssel. Ein PHP-Workflow kann eine Aktivität `"send_email"` planen und ein Python-Worker führt sie aus, und umgekehrt.

### Aktivitätskontext {#activity-context}

Greifen Sie innerhalb einer Aktivität über `activity.context()` auf Ausführungsmetadaten und Heartbeats zu:

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

### Heartbeat-Anfragen {#activity-heartbeat-requests}

Rufen Sie bei entfernten Aktivitäten `await ctx.heartbeat(...)` während begrenzter Aktivitätsarbeit deutlich vor `heartbeat_timeout` auf. Das erste Zeitfenster beginnt mit der Beanspruchung durch die Laufzeit, bevor Python die Aufgabe empfängt. Jeder aufgezeichnete Heartbeat verwendet den Aufzeichnungszeitpunkt der Laufzeit, nicht den Empfangszeitpunkt der Antwort in Python. Pausen, Anfragelatenz und Transportwiederholungen verbrauchen das Budget. Beachten Sie die [Taktempfehlungen](../features/heartbeats.md#heartbeat-cadence-and-receipts).

Der direkte Aufruf von `Client.heartbeat_activity_task()` verwendet die konfigurierte `TransportRetryPolicy`. Nach dieser Richtlinie können Transportfehler als `httpx.TransportError` weitergegeben werden. HTTP-Ablehnungen werden zu zugeordneten SDK-Ausnahmen wie `ServerError`. Das ist HTTP-Wiederholungsverhalten, kein neuer Aktivitätsversuch und keine zusätzliche Heartbeat-Zeit. `ActivityContext.heartbeat()` kann `ActivityCancelled` auslösen, wenn der Worker die Aktivität zum Stoppen auffordert. Wenn die kooperative Prozessüberwachung aktiviert ist, können fehlgeschlagene Heartbeat- oder Besitzprüfungen den Callback stoppen oder aufgeben. Nicht jeder Fehler erreicht einen Ausnahmehandler, und Bereinigungscode läuft nicht immer.

Unterdrücken Sie Heartbeat- oder Besitzfehler nicht, um externe Arbeit fortzusetzen oder Erfolg zu melden. Fortschritt ist weder ein externer Commit noch eine Bestätigung eines fortsetzbaren Prüfpunkts. Halten Sie externe Effekte idempotent.

### Nicht wiederholbare Fehler {#non-retryable-errors}

Lösen Sie `NonRetryableError` aus, um eine Aktivität ohne Wiederholungen scheitern zu lassen:

```python
from durable_workflow import NonRetryableError

@activity.defn(name="validate")
async def validate(data: dict) -> dict:
    if "required_field" not in data:
        raise NonRetryableError("Missing required_field")
    return data
```

### Synchrone und asynchrone Aktivitäten {#activity-execution}

Gewöhnliche entfernte `def`-Aktivitäten laufen in einem eigenen Threadpool,
dessen Größe durch `max_concurrent_activity_tasks` begrenzt ist. Jeder Callback
behält seinen Aktivitätskontext. Polling, Workflow-Tasks und Worker-Heartbeats
können weiterlaufen, während ein Callback blockiert. Aktivitäten mit `async def`
laufen in der Ereignisschleife und müssen nichtblockierende Ein-/Ausgabe verwenden.
Ein blockierender Aufruf in einer asynchronen Funktion blockiert weiterhin diese Schleife.

Verwenden Sie in einem synchronen Callback
`activity.context().heartbeat_sync(details)`, um Fortschritt über die zuständige
Ereignisschleife mit den ursprünglichen Kennungen von Task, Versuch und Worker zu
melden. Asynchrone Callbacks verwenden
`await activity.context().heartbeat(details)`.

Das Abbrechen eines Await-Vorgangs stoppt keinen laufenden Python-Thread. Sein
tatsächlicher Slot bleibt bis zur Rückkehr des Callbacks belegt. Eine verspätete
Rückkehr übermittelt nach dem Abbruch kein Ergebnis. Läuft ein Callback nach
`shutdown_timeout` noch, löst das Herunterfahren `RuntimeError` aus und behält
die Worker-Registrierung bei. Legen Sie Zeitlimits für nachgelagerte
Ein-/Ausgabe fest und verwenden Sie für rechenintensive Arbeit getrennte, isolierte
Worker-Prozesse. Siehe die
[SDK-Referenz zu Ausführung und Herunterfahren](https://python.durable-workflow.com/reference/worker/).

## Worker {#worker}

Der `Worker` registriert sich beim Server, fragt Tasks ab und übergibt sie an Ihre Workflow- und Aktivitätsimplementierungen.

Für unabhängige Workflow- und Aktivitätsprozesse folgen Sie dem
[ausführbaren Leitfaden zur Prozesstrennung](https://python.durable-workflow.com/guides/separate-workers/)
des Python SDKs. Er behandelt getrennte Registrierungen, gemeinsame oder
eigene Task-Warteschlangen, Wiederholungen, rollenspezifische Slots und
geordnetes Herunterfahren.

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

Für Smoke-Tests und Beispiele mit einem Workflow registriert
`await worker.run_until(workflow_id="...", timeout=60.0)` denselben Worker und
führt einen Workflow mit sequenziellen Abfragen bis zum terminalen Zustand.
Verwenden Sie `run()` für bereitgestellte Worker, die weiter abfragen sollen.

| Parameter | Standard | Beschreibung |
|-----------|---------|-------------|
| `task_queue` | erforderlich | Abzufragende Task-Warteschlange |
| `workflows` | `()` | Zu registrierende Workflow-Klassen |
| `activities` | `()` | Zu registrierende Aktivitätsfunktionen |
| `worker_id` | automatisch erzeugt | Eindeutige Worker-Kennung |
| `poll_timeout` | `35.0` | Long-Poll-Timeout in Sekunden |
| `max_concurrent_workflow_tasks` | `10` | Maximale parallele Workflow-Tasks |
| `max_concurrent_activity_tasks` | `10` | Maximale parallele Aktivitäts-Tasks |
| `shutdown_timeout` | `30.0` | Sekunden zum Beenden laufender Tasks beim Stoppen |
| `metrics` | Recorder des Clients | Optionaler Metrikrecorder für Abfrage- und Task-Zähler/-Histogramme |
| `interceptors` | `()` | Geordnete Worker-Task-Wrapper für Instrumentierung, Tracing und Richtlinien-Hooks |

Die beiden Werte `max_concurrent_*` werden dem Server bei Registrierung gemeldet
und erscheinen in Task-Warteschlangenzulassungsdiagnosen. Sie sind die lokale
Worker-Kapazität. Verwenden Sie serverseitige
[Task-Warteschlangenzulassungsgrenzen](/docs/polyglot/task-queue-admission),
wenn Namespace, Warteschlange oder nachgelagerte Budgetgruppe ein hartes
geteiltes Budget über mehrere Worker benötigt.

### Worker-API-Referenz {#worker-api-reference}

| Methode | Rückgabe | Verwenden, wenn |
| --- | --- | --- |
| `await worker.run()` | `None` | Lang laufender, durch systemd, Docker, Kubernetes oder lokale Entwicklungsshell überwachter Prozess. Registriert einmal und fragt Workflow-, Aktivitäts- und Abfrage-Tasks bis zum Stoppen oder Abbruch ab. |
| `await worker.run_until(workflow_id=..., timeout=60.0, poll_interval=0.5)` | `WorkflowExecution` | Smoke-Tests und Beispiele starten einen Workflow und wollen ihn im selben Prozess bis zum terminalen Status führen. |
| `await worker.stop()` | `None` | Kooperatives Herunterfahren. Stoppt neue Abfragen und lässt laufende Tasks bis `shutdown_timeout` auslaufen. |

`run()` prüft Server-Kompatibilität vor dem Abfragen. Der Worker verlangt,
dass die veröffentlichten `control_plane.version`, `control_plane.request_contract`,
`worker_protocol.version` und `auth_composition_contract` den vom SDK
unterstützten Vertragsversionen entsprechen. Fehlende oder inkompatible
Manifeste lösen bei Registrierung `RuntimeError` aus. Supervisoren scheitern
so früh, statt einen Worker auszuführen, der Tasks nicht sicher abschließen kann.

`run_until()` nutzt dieselbe Registrierung und Zuweisung wie `run()`, fragt
jedoch sequenziell ab und liefert die abschließende `WorkflowExecution` des
benannten Workflows. Ist dieser nach dem Timeout noch nicht terminal, wird
`TimeoutError` ausgelöst.

Während der Task-Ausführung:

- Unbekannte Workflow- oder Aktivitätstypen werden als Task-Fehler an Server
  gemeldet, nicht in lokalen Logs versteckt.
- `NonRetryableError` markiert Aktivitätsfehler als nicht wiederholbar.
- `ActivityCancelled` wird als Abbruchergebnis weitergegeben.
- Unbehandelte Aktivitätsausnahmen werden als wiederholbare Fehler gemeldet,
  sofern Aktivitäts-Wiederholungsrichtlinie oder Server-Frist nichts anderes vorgeben.
- Abfrage-Handler-Ausnahmen werden als `QueryFailed` gemeldet.

### Worker-Interceptors {#worker-interceptors}

Übergeben Sie `interceptors=[...]`, wenn Worker-Ausführung Tracing, Metriken,
Audit-Logging oder lokale Richtlinienprüfungen um Tasks benötigt. Interceptors
laufen in der angegebenen Reihenfolge. Der erste ist der äußere Wrapper und
sollte zur Fortsetzung der Kette `next` aufrufen.

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

| Hook | Kontextfelder | Rückgabe von `next` |
| --- | --- | --- |
| `execute_workflow_task(context, next)` | `worker_id`, `task_queue`, `task` | Workflow-Befehle oder `None` |
| `execute_activity(context, next)` | `worker_id`, `task_queue`, `task`, `activity_type`, `args` | decodiertes Aktivitätsergebnis |
| `execute_query_task(context, next)` | `worker_id`, `task_queue`, `task` | codierte Abfrageergebniszeichenfolge |

Verwenden Sie `PassthroughWorkerInterceptor` als Basisklasse für nur einen
Hook. Implementieren Sie `WorkerInterceptor` direkt, wenn Typprüfer das
Vorhandensein aller Hooks erzwingen sollen.

## Logging {#logging}

Das SDK verwendet Pythons Standardmodul `logging` mit strukturierten Logger-Namen:

| Logger-Name | Protokollierter Inhalt |
|-------------|--------------|
| `durable_workflow.worker` | Worker-Registrierung, Task-Abfragen, Task-Abschluss, Fehler |
| `durable_workflow.workflow.replay` | Workflow-Replay-Ereignisse (während Replay stumm) |

### Logging konfigurieren {#configuring-logging}

Setzen Sie die Log-Stufe im Einstiegspunkt Ihrer Anwendung:

```python
import logging

# Show INFO-level worker events (registration, task completion)
logging.basicConfig(level=logging.INFO)

# Or configure specific loggers
logging.getLogger("durable_workflow.worker").setLevel(logging.DEBUG)
logging.getLogger("durable_workflow.workflow.replay").setLevel(logging.INFO)
```

### Log-Stufen {#log-levels}

- **INFO**: Worker-Registrierung, Task-Starts/-Abschlüsse, Workflow-Abschluss
- **DEBUG**: Detaillierte Task-Nutzlasten (gekürzt), Abfragezyklen
- **WARNING**: Wiederholbare Fehler (fehlgeschlagene API-Aufrufe, unbekannte Workflow-Typen)
- **ERROR**: Nicht wiederholbare Fehler, Replay-Abstürze

### Replay-bewusstes Logging {#replay-aware-logging}

Verwenden Sie innerhalb von Workflows `ctx.logger` für Replay-bewusstes Logging:

```python
@workflow.defn(name="order_processor")
class OrderProcessor:
    def run(self, ctx, order_id: str):
        ctx.logger.info("Processing order %s", order_id)  # Only logs during execution, not replay
        result = yield ctx.schedule_activity("process_order", [order_id])
        ctx.logger.info("Order processed: %s", result)
        return result
```

Log-Anweisungen sind **während Replay stumm**, um doppelte Log-Fluten bei Wiederherstellung oder Fortsetzung von Workflows zu vermeiden.

### Strukturiertes Logging {#structured-logging}

Für JSON-strukturierte Logs konfigurieren Sie den Root-Logger Ihrer Anwendung mit einem JSON-Formatter:

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

## Metriken {#metrics}

`Client(metrics=...)` und `Worker(metrics=...)` akzeptieren jeden Recorder mit zwei Methoden:

```python
def increment(name: str, value: float = 1.0, tags: dict[str, str] | None = None) -> None: ...
def record(name: str, value: float, tags: dict[str, str] | None = None) -> None: ...
```

Der Standardrecorder bewirkt nichts. Metrikerfassung benötigt daher keine Einrichtung. Verwenden Sie `InMemoryMetrics` für Tests oder eigene Exporterschleifen:

```python
from durable_workflow import Client, InMemoryMetrics, Worker

metrics = InMemoryMetrics()

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(client, task_queue="default", workflows=[GreeterWorkflow], activities=[greet])
```

Installieren Sie für Prometheus das optionale Extra und übergeben Sie `PrometheusMetrics`:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from durable_workflow import Client, PrometheusMetrics

metrics = PrometheusMetrics()
client = Client("http://localhost:8080", token="secret", metrics=metrics)
```

Das SDK zeichnet auf:

| Metrik | Typ | Tags |
|--------|------|------|
| `durable_workflow_client_requests` | Zähler | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_client_request_duration_seconds` | Histogramm | `method`, `route`, `plane`, `status_code`, `outcome` |
| `durable_workflow_worker_polls` | Zähler | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_poll_duration_seconds` | Histogramm | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_tasks` | Zähler | `task_kind`, `task_queue`, `outcome` |
| `durable_workflow_worker_task_duration_seconds` | Histogramm | `task_kind`, `task_queue`, `outcome` |

## Zeitpläne {#schedules-1}

Erstellen und verwalten Sie geplante Workflows über den Client:

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

## Synchroner Client {#synchronous-client}

Für Skripte, Notebooks und nicht asynchrone Kontexte verwenden Sie den synchronen Wrapper:

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

Der synchrone Client spiegelt die asynchrone API, umschließt aber jeden Aufruf mit `asyncio.run`.

## Fehlerbehandlung {#error-handling}

Das SDK bildet Server-Fehlercodes auf typisierte Python-Ausnahmen ab:

| Ausnahme | Auslöser |
|-----------|------|
| `WorkflowNotFound` | Workflow-ID existiert nicht |
| `WorkflowAlreadyStarted` | Doppelte Workflow-ID mit widersprüchlicher Richtlinie |
| `WorkflowFailed` | Workflow-Ausführung fehlgeschlagen |
| `WorkflowCancelled` | Workflow abgebrochen (erbt von `BaseException`, nicht `Exception`) |
| `WorkflowTerminated` | Workflow terminiert |
| `ActivityCancelled` | Aktivität während Ausführung abgebrochen (erbt von `BaseException`, nicht `Exception`) |
| `ChildWorkflowFailed` | Kind-Workflow fehlgeschlagen |
| `QueryFailed` | Abfrage-Handler lieferte Fehler |
| `UpdateRejected` | Workflow lehnte Update ab |
| `ScheduleNotFound` | Zeitplan-ID existiert nicht |
| `ScheduleAlreadyExists` | Doppelte Zeitplan-ID |
| `NamespaceNotFound` | Namespace existiert nicht |
| `InvalidArgument` | Ungültige Anfrageparameter |
| `Unauthorized` | Authentifizierung fehlgeschlagen |
| `ServerError` | Server lieferte unerwarteten Fehler |

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

### Abbruch ist bewusst nicht mit `except Exception` abfangbar {#cancellation-is-intentionally-uncatchable-by-except-exception}

`WorkflowCancelled` und `ActivityCancelled` erben von `BaseException`, nicht `Exception`. Ein allgemeiner Block `except Exception:` im Aktivitätskörper oder in Code, der auf `client.get_result()` wartet, fängt sie **nicht** ab. Das ist beabsichtigt: Abbruch ist ein Control-Plane-Ergebnis. Ihn still in einem Sammel-Catch zu verschlucken würde einer Aktivität erlauben, nach Aufforderung ihres Workflows zum Stoppen Erfolg zu melden.

Benötigt eine Aktivität lokale Bereinigung bei Task-Abbruch, fangen Sie die
Klasse namentlich ab und lösen Sie sie erneut aus. Dies setzt den geschlossenen
Workflow nicht für Kompensation fort:

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

Dies folgt dem Vorbild von `asyncio.CancelledError` und `KeyboardInterrupt` aus der Standardbibliothek.

## Tests {#testing}

Workflow-Entwickler sollen Workflow-Code ohne laufenden Server oder Worker
testen können. `durable_workflow.testing` liefert zwei Einstiegspunkte:

- `WorkflowEnvironment` führt einen Workflow in einem Python-Prozess gegen
  vom Nutzer registrierte Aktivitäts-Mocks bis zum Abschluss.
- `replay_history` und `replay_history_file` geben erfasste Produktionshistorie
  gegen aktuellen Workflow-Code wieder und lösen bei Nichtdeterminismus Fehler aus.

Beide verwenden dieselbe `durable_workflow.workflow.replay`-Mechanik wie der
Worker zur Laufzeit. Ein Workflow, der seine Testumgebung besteht, verhält sich
daher unter einem echten Worker genauso.

### WorkflowEnvironment {#workflowenvironment}

`WorkflowEnvironment` führt ausgegebene Workflow-Befehle gegen registrierte
Mocks aus und löst Timer, Seiteneffekte sowie Suchattribut-Upserts automatisch
aus. Tests benötigen weder echte Uhr noch Redis oder Server.

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

| Methode | Zweck |
| --- | --- |
| `register_activity_result(name, result)` | Für jeden Aufruf der Aktivität `name` `result` liefern. Verwenden, wenn Argumente für den Test unwichtig sind. |
| `register_activity(name, fn)` | Für jeden geplanten Aufruf der Aktivität `name` `fn(*arguments)` aufrufen. Verwenden, wenn der Mock nach Argumenten variieren oder Aufrufe erfassen muss. |
| `register_child_workflow_result(workflow_type, result)` | `result` liefern, wenn der Workflow ein Kind vom Typ `workflow_type` startet. |
| `signal(name, args=None, run=None)` | Signal zur Zustellung vor der nächsten Replay-Iteration einreihen. Die Testumgebung fügt `SignalReceived` ein und stellt an den registrierten Handler `@workflow.signal` zu. `run=N` zielt auf Glied `N` einer Continue-as-new-Kette. |
| `register_workflow(workflow_cls)` | Eine zusätzliche Workflow-Klasse per Name auflösbar machen. Nötig, wenn eine Kette `continue_as_new(workflow_type=...)` mit anderem Typ als dem Start-Workflow aufruft. |
| `execute_workflow(workflow_cls, *args, run_id="test-run")` | Workflow bis zum terminalen Zustand führen und Ergebnis liefern. Folgt `continue_as_new` bis zum letzten Lauf und liefert dessen Ergebnis. Löst `WorkflowFailed` aus, wenn der Workflow als fehlgeschlagen endet. |
| `runs` / `run_count` | Nach Rückkehr von `execute_workflow` einen `WorkflowRunRecord` je Kettenglied zeigen (Eingabe, Workflow-Typ, Historienereignisse, terminaler Befehl), damit Tests die gesamte Fortsetzungskette prüfen können. |

Die Testumgebung scheitert klar bei fehlenden Fixtures:

- Planen einer Aktivität ohne registrierten Mock löst `KeyError` aus.
- Starten eines Kind-Workflows ohne registrierten Mock löst `KeyError` aus.
- Ein Workflow ohne terminalen Zustand innerhalb der Iterationsgrenze
  (Standard `1000`) löst `RuntimeError` aus.

Mit `iteration_limit=...` an `WorkflowEnvironment(...)` passen Sie die Grenze
für Workflows an, die berechtigt öfter iterieren.

#### Aufrufbare Aktivitäts-Mocks {#callable-activity-mocks}

Verwenden Sie `register_activity`, wenn der Mock anhand von Argumenten antworten
oder Aufrufe aufzeichnen muss:

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

#### Signale {#signals}

Mit `env.signal(...)` eingereihte Signale werden vor der nächsten
Replay-Iteration zugestellt. Die Signalnutzlast wird in dieselbe `{codec, blob}`-Envelope
verpackt, die der Worker zur Laufzeit sieht, und an den registrierten Handler
`@workflow.signal` des Workflows übergeben:

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

#### Timer, Seiteneffekte und Suchattribute {#timers-side-effects-and-search-attributes}

Die Testumgebung löst für jeden dieser Befehle das entsprechende
Historienereignis automatisch aus. Workflows warten in Tests daher nicht auf
die reale Uhrzeit:

- `ctx.sleep(seconds)` → `TimerFired`
- `ctx.side_effect(...)` → `SideEffectRecorded`
- `ctx.upsert_search_attributes(...)` → `SearchAttributesUpserted`
- `workflow.version(...)`-Marker → `VersionMarkerRecorded`

#### Continue-as-new-Ketten {#continue-as-new-chains}

Liefert ein Workflow `ctx.continue_as_new(...)`, hängt die Testumgebung ein
Ereignis `WorkflowContinuedAsNew` an den abschließenden Lauf an, setzt die
Historie zurück und startet einen neuen Lauf mit den Befehlsargumenten.
`execute_workflow` liefert das terminale Ergebnis des letzten Glieds.

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

Wechselt die Kette Workflow-Typen, registrieren Sie zuerst die Folgeklasse:

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

Zielen Sie mit `run=N` auf ein bestimmtes Glied der Kette:

```python
env.signal("approve", ["alice"], run=2)  # delivered to the second run
```

Die Kettenlänge ist durch `continue_as_new_limit` begrenzt (Standard `50`).
Überschreiten löst `RuntimeError` aus, damit Tests entgleiste Fortsetzungen
erkennen, statt endlos zu laufen. Passen Sie die Grenze mit
`WorkflowEnvironment(continue_as_new_limit=...)` an, wenn eine Kette berechtigt
länger läuft.

#### Fehler prüfen {#failure-assertions}

Workflows, die eine Python-Ausnahme auslösen, erscheinen als `WorkflowFailed`:

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

### Replay-Tests gegen Produktionshistorie {#replay-testing-against-production-history}

Verwenden Sie `replay_history`, um Workflow-Änderungen gegen echte, vom Server
erfasste Historie auf Regressionen zu prüfen. Der Replayer führt aktuellen
Workflow-Code gegen die aufgezeichnete Ereignisfolge aus und scheitert, wenn
er einen anderen als den aufgezeichneten Befehl ausgibt. Das ist die Definition
eines Nichtdeterminismusfehlers.

```python
from durable_workflow import Client
from durable_workflow.testing import replay_history

async with Client("http://localhost:8080") as client:
    history = await client.get_history("order-42", run_id="...")

replay_history(OrderWorkflow, history["events"], start_input=["order-42"])
```

Ein zuvor abgeschlossener Workflow muss beim Replay derselben Historie erneut
abschließen. Weicht geänderter Workflow-Code von der aufgezeichneten Folge ab
(umgeordnete Aktivitätsaufrufe, entfernte Zweige, geänderte Aktivitätstypen),
scheitert `replay_history`, damit CI die Regression vor der Produktion erkennt.

`replay_history_file` ist ein Komfortwrapper zum Lesen einer JSON-Datei mit
einer von zwei Formen: einer obersten Ereignisliste oder einem Dictionary mit
`events`-Schlüssel entsprechend der Antwortstruktur von `get_history`:

```python
from durable_workflow.testing import replay_history_file

replay_history_file(
    OrderWorkflow,
    "tests/histories/order-42.json",
    start_input=["order-42"],
)
```

Beide Funktionen akzeptieren einen optionalen Validierungshinweis `payload_codec`.
Ohne Angabe gilt das aufgezeichnete Tag der Historie. Ein explizites oder
aufgezeichnetes Tag muss `avro` sein. `json`, unbekannte oder nicht getaggte
dauerhafte Nutzlasten scheitern vor der Decodierung.

#### Klassenbasierter Replayer {#class-based-replayer}

Verwenden Sie `Replayer`, wenn ein Testdurchlauf Historien mehrerer Workflow-Typen
wiedergibt oder das erfasste Ereignis `WorkflowStarted` den Typ bestimmen soll.
Registrieren Sie alle Workflow-Klassen vorab und rufen Sie je erfasster Historie
`replay(...)` auf:

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

`Replayer(workflows=[...])` lehnt eine leere Menge oder doppelte Registrierung
mit `ValueError` ab. `replay(...)` löst `ValueError` aus, wenn die Historie einen
nicht registrierten Workflow-Typ verlangt oder bei mehreren registrierten
Workflows weder der Aufrufer `workflow_type` angibt noch die Historie ein
Ereignis `WorkflowStarted` enthält.

`ReplayOutcome.commands` ist dieselbe Befehlsliste wie bei den funktionalen
`replay_history`-Hilfen. Die Klasse erlaubt einer Testsuite, eine Registrierung
über viele Historien gemeinsam zu nutzen.

### Referenz der Testumgebung {#test-harness-reference}

| Symbol | Zweck |
| --- | --- |
| `durable_workflow.testing.WorkflowEnvironment` | Testumgebung im Prozess. Führt einen Workflow gegen registrierte Aktivitäts- und Kind-Workflow-Mocks bis zum Abschluss. |
| `durable_workflow.testing.replay_history(workflow_cls, events, start_input=None, *, run_id="", payload_codec=None)` | Historienereignisfolge gegen aktuellen Workflow-Code wiedergeben. Scheitert bei Nichtdeterminismus. |
| `durable_workflow.testing.replay_history_file(workflow_cls, path, start_input=None, *, run_id="", payload_codec=None)` | JSON-Historie vom Datenträger laden und wiedergeben. Akzeptiert eine oberste Ereignisliste oder ein Dictionary mit `events`-Schlüssel. |
| `durable_workflow.Replayer(*, workflows=[...])` | Klassenbasierter Replayer. Eine oder mehrere Workflow-Klassen registrieren und jede erfasste Historie mit `replay(history, start_input=None, *, workflow_type=None, workflow_id=None, run_id="", payload_codec=None)` wiedergeben. Leitet `workflow_type` und `start_input` aus einem vorhandenen `WorkflowStarted`-Ereignis ab. |
| `durable_workflow.ReplayOutcome` | Von `Replayer.replay` gelieferte Dataclass. Enthält `commands: list[Command]`, die als Nächstes ausgegebenen Befehle des wiedergegebenen Workflows. |
| `durable_workflow.errors.WorkflowFailed` | Von `execute_workflow` ausgelöst, wenn der Workflow als fehlgeschlagen endet. |
| `durable_workflow.errors.WorkflowCancelled` | Terminaler Zustand nach Workflow-Abbruch. Erbt von `BaseException`. |
| `durable_workflow.errors.WorkflowTerminated` | Terminaler Zustand nach Terminierung durch Server. Erbt von `BaseException`. |

## Nutzlast-Codec {#payload-codec}

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="none">
  Jede Nutzlast über die Worker-Protokollgrenze trägt ein Codec-Tag.
  Durable Workflow 2.0 hat einen öffentlichen Nutzlast-Codec: <code data-payload-codec-field="codec">avro</code>.
  Das Python SDK lehnt JSON-getaggte, unbekannte und nicht getaggte dauerhafte
  Nutzlasten ab, statt einen anderen Decoder zu wählen. Siehe das <a href="/docs/polyglot/avro-value-protocol/">Avro-Value-Protokoll</a>.
</div>

### Avro-Unterstützung ist eingebaut {#avro-support-is-built-in}

Das festgelegte 2.0-SDK-Artefakt bindet `fastavro` als Laufzeitabhängigkeit ein.
Jede ausgehende Oberfläche (`start_workflow`, `signal_workflow`,
`query_workflow`, `update_workflow`, Aktivitätsergebniscodierung,
Zeitplanaktionen) erzeugt daher Avro-getaggte Nutzlasten über den optimierten
Produktionspfad. Es gibt kein optionales Codec-Extra zu installieren.

### Feste typisierte Werte {#fixed-typed-values}

Das SDK wählt benannte Zweige im gemeinsamen Schema
`durable_workflow.protocol.Value` explizit aus. Es codiert Werte nicht als JSON
innerhalb von Avro. Ganzzahlen und Double-Werte, Zeichenfolgen und Bytes,
boolesche Werte und Ganzzahlen sowie Listen und Maps bleiben daher
SDK-übergreifend verschieden. Die Übertragung verwendet Avro-Einzelobjektrahmen
und Schema-Fingerabdruck. Unbekannte Fingerabdrücke scheitern mit
`unsupported_payload_schema`.

Jede Client- und Worker-Oberfläche funktioniert durchgehend mit Avro als Standard:

- **Client-Starts, Signale, Abfragen, Updates**: `start_workflow`, `signal_workflow`, `query_workflow` und `update_workflow` erzeugen `payload_codec = "avro"`-Nutzlasten über das feste Value-Schema. Ein Python-Client kann deshalb Workflows steuern, die PHP und andere polyglotte SDKs wiedergeben, und umgekehrt.
- **Aktivitäts-Worker**: Avro-getaggte Aktivitätsargumente werden transparent decodiert. Der Worker codiert Ergebnisse als Avro, damit PHP, Python und künftige SDK-Worker eine Nutzlastgrenze teilen.
- **Aktivitätsfehler**: `fail_activity_task(..., details=...)` sendet `failure.details` als `{codec, blob}`-Envelope. Server zeichnet Blob und `details_payload_codec` auf, damit Diagnosedaten von Python-Workern in Historienexporten und Beobachtungsansichten sprachneutral bleiben.
- **Historien-Replay im Workflow-Worker**: Avro-getaggte Starteingaben und Aktivitätsergebnisereignisse werden beim Replay decodiert, sodass ein Python-Workflow an einem Avro-codierten Lauf teilnehmen kann.
- **Workflow-Abfrage-Tasks**: Servergeroutete Abfrage-Tasks enthalten Avro-getaggte Workflow-Argumente, Abfrageargumente und Replay-Historie. Der Worker liefert das Abfrageergebnis als Avro-Envelope.

### Einen Python-Aktivitäts-Worker gegen einen v2-Lauf ausführen {#running-a-python-activity-worker-against-a-v2-run}

Keine Codec-Konfiguration ist nötig. Das SDK prüft `payload_codec` vor jeder
Claim-Decodierung, akzeptiert nur `avro`, führt die Aktivität aus und liefert
ein Avro-getaggtes Ergebnis. Jedes andere Tag wird strikt mit
`unsupported_payload_codec` abgelehnt. Der Worker versucht niemals, das Format
zu erkennen oder zu erraten.

### Verlustfrei zwischen Python und PHP austauschbare Typen {#types-that-round-trip-cleanly-across-python-and-php}

| Python-Typ | Avro-Value-Zweig | PHP-Typ |
|-------------|------|----------|
| `str` | `StringValue` | `string` |
| `bytes` | `BytesValue` | `AvroBinaryValue` |
| `int` | `LongValue` | `int` |
| `float` | `DoubleValue` | `float` |
| `bool` | `BooleanValue` | `bool` |
| `None` | `null` | `null` |
| `list` | `ArrayValue` | `array` (Liste) |
| `dict[str, ...]` | `MapValue` | `array` (Map mit Zeichenfolgeschlüsseln) |

Überführen Sie Python-spezifische Typen wie Dataclasses, Mengen, Tupel und
datetime-Objekte vor der Nutzung als Workflow- oder Aktivitätswerte in
kanonische Zeichenfolgen, Ganzzahlen, Maps oder Listen.

## Mit einem gemeinsam genutzten Server ausführen {#running-against-a-shared-server}

Der [Schnellstart](#quickstart) oben startet einen lokalen Server mit dem
veröffentlichten Docker-Image. In einer Teamumgebung richten Sie den
Python-Worker gewöhnlich auf einen bestehenden Server (Staging, Produktion
oder gemeinsame Entwicklungsinstanz):

```python
from durable_workflow import Client

client = Client(
    "https://workflow.example.internal",
    control_token="team-orders-operator-token",
    worker_token="team-orders-worker-token",
    namespace="team-orders",
)
```

Setzen Sie `namespace` auf den für Ihr Team bereitgestellten Mandanten-Namespace
und verwenden Sie dessen ausgestellte Zugangsdaten. Der Server-Betrieb
verwaltet die Namespace-Erstellung. Details stehen im
[Server-Leitfaden](/docs/polyglot/server).

Derselbe Konstruktor unterstützt eine Cloud-verwaltete Laufzeitumgebung.
Verwenden Sie die von Cloud gelieferte Laufzeit-URL und den Namespace-Wert,
setzen Sie `control_token` auf die Client-Laufzeit-Zugangsdaten und
`worker_token` auf die Worker-Laufzeit-Zugangsdaten. Cloud stellt den Namespace
bereit. Setzen Sie keine selbst gehostete Server-Adresse ein. Siehe
[Verwaltete Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane).
