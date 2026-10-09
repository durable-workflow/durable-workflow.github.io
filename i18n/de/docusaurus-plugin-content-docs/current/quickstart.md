---
sidebar_position: 2
title: Schnellstart mit Durable Workflow 2.0
description: Wählen Sie eine Laufzeitumgebung im Dienstmodus und schließen Sie einen ersten Workflow mit PHP, Python oder Rust ab.
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - Durable Workflow Schnellstart
  - Durable Workflow 2.0 Schnellstart
  - eigenständiges PHP-SDK
  - Python-SDK Schnellstart
  - Rust-SDK Schnellstart
  - Server Docker Schnellstart
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Schnellstart mit Durable Workflow 2.0 {#durable-workflow-20-quickstart}

## Bevor Sie beginnen {#before-you-begin}

**Ziel:** Führen Sie einen Workflow im Dienstmodus aus und lesen Sie sein dauerhaft gespeichertes Ergebnis mit PHP, Python oder Rust.

**Zeitbedarf:** ungefähr 15 Minuten, sobald die Laufzeitumgebung verfügbar ist.

**Ergebnis:** Das gewählte SDK startet einen Worker und einen Workflow. Anschließend gibt es eine Workflow-Kennung, `status=completed` und `Hello, <language>!` aus.

**Voraussetzungen:**

- `curl` und ein Terminal
- Docker für den lokalen Selbstbetrieb oder ein bereitgestellter Durable Workflow Cloud-Namespace
- eine Sprachumgebung: PHP 8.1+ mit Composer, Python 3.10+ oder Rust 1.86+

Der Dienstmodus benötigt Laravel nicht. Der Weg für eingebettetes Laravel steht am Ende dieses Leitfadens.

## 1. Eine Laufzeitumgebung im Dienstmodus wählen {#1-choose-your-service-mode-runtime}

| Laufzeitumgebung | Wann sie passt | Nächster Schritt |
| --- | --- | --- |
| Durable Workflow Cloud | Durable Workflow soll Laufzeitumgebung, dauerhafte Speicherung und Managed Waterline betreiben. | Folgen Sie dem ausführbaren [ersten Cloud-Workflow](/docs/polyglot/cloud-control-plane/#cloud-first-workflow). Er verbindet die vollständigen PHP-, Python- und Rust-Beispiele mit bereitgestellten Zugangsdaten und einem `completed`-Ergebnis. **Betreiben Sie keinen Server oder separaten Waterline-Dienst.** |
| Selbst betriebener Server | Sie möchten die Laufzeitumgebung selbst betreiben oder dieses lokale Beispiel mit veröffentlichten Paketen und Images ausführen. | Folgen Sie den Docker- und `curl`-Schritten unten. Waterline wird nur bei Bedarf als separate Betriebsoberfläche bereitgestellt. |

Das folgende Beispiel verwendet einen lokalen Server und benötigt weder ein Konto noch einen Quellcode-Checkout. Cloud nutzt dasselbe SDK- und Worker-Modell. Ersetzen Sie dort die lokale Entwicklungsverbindung durch die bereitgestellten Werte aus der [Cloud-Laufzeitumgebung](/docs/polyglot/cloud-control-plane/).

## 2. Den lokalen Server starten {#2-start-the-local-server}

Überspringen Sie diesen Schritt bei Cloud. Für den Selbstbetrieb klappen Sie die festgelegte Konfiguration auf und führen sie aus. Sie startet das veröffentlichte Server-Image mit SQLite und einem Entwicklungstoken.

<details>
<summary>Das festgelegte Server-Image starten</summary>

<!-- docs-example id="quickstart.server.setup" -->
```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-quickstart

docker run --rm \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info
```

</details>

**Erwartetes Ergebnis:** Die Bereitschaftsabfrage ist erfolgreich und die Clusterinformationen nennen den lokalen eigenständigen Server. Lassen Sie ihn laufen, während Sie einen Sprachpfad abschließen.

## 3. Eine Sprache wählen {#choose-one-language}

Alle drei offiziellen SDKs stehen gleichberechtigt zur Verfügung. Es wird nur der gewählte Tab angezeigt, damit Sie einem Beispiel folgen können.

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

Voraussetzungen: PHP 8.1 oder neuer und Composer. Dieser Weg verwendet das frameworkunabhängige Paket `durable-workflow/sdk`.

1. **Das SDK installieren.**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **Worker und Client hinzufügen.** Klappen Sie den vollständigen Quellcode auf und kopieren Sie beide Dateien in das neue Projekt.

<details>
<summary>Vollständiger ausführbarer PHP-Quellcode</summary>

Der Worker registriert einen Workflow-Typ und einen Aktivitätstyp in seiner eigenen Aufgabenwarteschlange.

<!-- docs-example id="quickstart.php.worker" -->
```bash
cat > worker.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client('http://localhost:8080', token: 'dev-token');
$worker = new Worker($client, 'quickstart-php');

$worker->registerActivity(
    'quickstart.greet',
    static fn (ActivityContext $context, string $name): string => "Hello, {$name}!",
);

$worker->registerWorkflow(
    'quickstart.greeter',
    static function (WorkflowContext $context, string $name): array {
        $greeting = $context->activity('quickstart.greet', [$name]);

        return ['greeting' => $greeting, 'language' => 'php'];
    },
);

$worker->run();
PHP
```

#### Client und Ergebnisabfrage {#client-and-result-reader}

Der Client startet einen eindeutig benannten Workflow, wartet auf den ausgewählten Lauf und liest anschließend dessen dauerhaft gespeicherten Endzustand vom Server.

<!-- docs-example id="quickstart.php.client" -->
```bash
cat > start.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;

$client = new Client('http://localhost:8080', token: 'dev-token');
$workflowId = 'quickstart-php-greeter-'.bin2hex(random_bytes(4));
$handle = $client->startWorkflow(
    workflowType: 'quickstart.greeter',
    workflowId: $workflowId,
    taskQueue: 'quickstart-php',
    input: ['PHP'],
);

$result = $handle->result(timeoutSeconds: 30);
$execution = $handle->describeSelectedRun();

echo "workflow_id={$execution->workflowId}\n";
echo "status={$execution->status}\n";
echo 'result='.json_encode($result, JSON_THROW_ON_ERROR)."\n";
PHP
```

</details>

3. **Worker und Client ausführen.**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**Erwartetes Ergebnis:** `status=completed` und ein Ergebnis mit `"greeting":"Hello, PHP!"`. Damit haben Sie einen eigenständigen PHP-Worker ausgeführt und sein dauerhaftes Ergebnis ohne Laravel geprüft.

Fahren Sie mit dem [PHP-SDK-Leitfaden](/docs/polyglot/php/) fort.

</TabItem>
<TabItem value="python" label="Python">

Voraussetzungen: Python 3.10 oder neuer. Worker und Client laufen im selben Prozess, kommunizieren aber weiterhin über die öffentlichen Worker- und Steuerungs-APIs mit dem Server.

1. **Das SDK installieren.**

   Verwenden Sie die <PythonPackageReleaseLink authority="qualified">stabile Python-SDK-Version</PythonPackageReleaseLink> aus dem gemeinsamen Versionsmanifest. Die erzeugte exakte Paketanforderung hält dieses ausführbare Beispiel auf der dokumentierten stabilen Version.

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **Worker und Client erstellen und ausführen.** Klappen Sie das vollständige Programm auf. Der abschließende Befehl führt es aus.

<details>
<summary>Vollständiger ausführbarer Python-Quellcode</summary>

<!-- docs-example id="quickstart.python.greeter" -->
```bash
cat > greeter.py <<'PY'
import asyncio
import time

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="quickstart.greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "language": "python"}


@workflow.defn(name="quickstart.greeter")
class GreeterWorkflow:
    def run(self, ctx, name):
        return (yield ctx.schedule_activity("quickstart.greet", [name]))


async def main():
    workflow_id = f"quickstart-python-greeter-{int(time.time())}"

    async with Client(
        "http://localhost:8080",
        token="dev-token",
        namespace="default",
    ) as client:
        handle = await client.start_workflow(
            workflow_type="quickstart.greeter",
            task_queue="quickstart-python",
            workflow_id=workflow_id,
            input=["Python"],
        )

        worker = Worker(
            client,
            task_queue="quickstart-python",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )
        await worker.run_until(workflow_id=workflow_id, timeout=30.0)

        result = await handle.result(timeout=10.0)
        execution = await handle.describe_run()

    print(f"workflow_id={execution.workflow_id}")
    print(f"status={execution.status}")
    print(f"result={result}")


asyncio.run(main())
PY

python greeter.py
```

</details>

**Erwartetes Ergebnis:** `status=completed` und ein Ergebnis mit `Hello, Python!`. Die letzten beiden SDK-Aufrufe lesen das Ergebnis des ausgewählten Laufs und seinen dauerhaften Endzustand vom Server.

Fahren Sie mit dem [Python-SDK-Leitfaden](/docs/polyglot/python/) fort.

</TabItem>
<TabItem value="rust" label="Rust">

Voraussetzungen: Rust 1.86 oder neuer. Dieses Beispiel führt einen nativen Worker und einen Client in einem Tokio-Prozess aus.

1. **Das SDK installieren.**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **Worker und Client erstellen und ausführen.** Klappen Sie das vollständige Programm auf. Der abschließende Befehl kompiliert und startet es.

<details>
<summary>Vollständiger ausführbarer Rust-Quellcode</summary>

<!-- docs-example id="quickstart.rust.greeter" -->
```bash
cat > src/main.rs <<'RS'
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use durable_workflow::{json, Client, Result, Worker, WorkflowResultOptions};

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::builder("http://localhost:8080")
        .token(Some("dev-token".to_string()))
        .namespace("default")
        .build()?;
    let task_queue = "quickstart-rust";
    let mut worker = Worker::new(client.clone(), task_queue);

    worker.register_activity("quickstart.greet", |_context, arguments| async move {
        let name = arguments
            .get(0)
            .and_then(|value| value.as_str())
            .unwrap_or("Rust");
        Ok(json!({"greeting": format!("Hello, {name}!"), "language": "rust"}))
    });

    worker.register_workflow("quickstart.greeter", |context, input| async move {
        let name = input.get(0).and_then(|value| value.as_str()).unwrap_or("Rust");
        context.activity("quickstart.greet", json!([name])).await
    });

    worker.register().await?;
    let workflow_id = format!("quickstart-rust-greeter-{}", unique_suffix());
    let handle = client
        .start_workflow(
            "quickstart.greeter",
            task_queue,
            &workflow_id,
            json!(["Rust"]),
        )
        .await?;

    let watcher = handle.clone();
    worker
        .run_until(async move {
            loop {
                if watcher.describe().await.is_ok_and(|run| run.is_terminal()) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await?;

    let result = handle.result(WorkflowResultOptions::default()).await?;
    let execution = handle.describe_selected_run().await?;

    println!("workflow_id={workflow_id}");
    println!("status={}", execution.status.as_deref().unwrap_or("unknown"));
    println!("result={result}");
    Ok(())
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
RS

cargo run
```

</details>

**Erwartetes Ergebnis:** `status=completed` und ein JSON-Ergebnis mit `"greeting":"Hello, Rust!"`. Das Beispiel wartet, bis der Worker den Lauf abschließt, und liest dann dessen dauerhaften Status und dekodiertes Ergebnis.

Fahren Sie mit dem [Rust-SDK-Leitfaden](/docs/polyglot/rust/) fort.

</TabItem>
</Tabs>

## 4. Den lokalen Server entfernen {#4-clean-up-the-local-server}

Cloud-Nutzer haben keinen lokalen Server zu entfernen. Für das lokale Beispiel:

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## Eigener Weg für eingebettetes Laravel {#separate-path-embedded-laravel}

Eingebettetes Laravel ist ein offizielles PHP-Bereitstellungsmodell für Anwendungen, die Workflow-Zustand, Queue-Ausführung, Konfiguration und Betriebswerkzeuge in ihrer vorhandenen Laravel-Infrastruktur halten möchten. Es installiert `durable-workflow/workflow`. Es verwendet weder den eigenständigen Server noch `durable-workflow/sdk`.

Beginnen Sie eine neue eingebettete Anwendung mit dem veröffentlichten Paket:

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

Für die Betriebsoberfläche in derselben Laravel-Anwendung installieren Sie das qualifizierte eingebettete Waterline-Composer-Paket:

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

Dieses Composer-Paket installiert den eingebetteten Modus. Der separat bereitgestellte Waterline-Dienst für einen selbst betriebenen Server hat eine andere Installationsform. Eingebettetes Laravel benötigt keinen Server und keines der Dienstmodus-SDKs.

Konfigurieren Sie mit der [eingebetteten Installation](/docs/installation/) eine Laravel-Queue ohne `sync`-Treiber. [Definieren](/docs/defining-workflows/workflows/) und [starten](/docs/defining-workflows/starting-workflows/) Sie anschließend einen eingebetteten Workflow. Die [Bereitstellungsmodelle](/docs/polyglot/deployment-modes/) vergleichen diesen Weg mit der Dienstplattform.

## Nächste Schritte {#next-steps}

- Prüfen Sie im [Funktionsindex](/docs/capabilities/) die unterstützten Funktionen Ihrer Laufzeitumgebung und Ihres SDKs.
- Lesen Sie den Leitfaden zum [PHP-SDK](/docs/polyglot/php/), [Python-SDK](/docs/polyglot/python/) oder [Rust-SDK](/docs/polyglot/rust/).
- Vergleichen Sie Lebenszyklus, Nachrichten, Zeitpläne, Sichtbarkeit und Worker-Ausführung unter [Client- und Worker-Funktionen](/docs/polyglot/cli-python-parity/).
- Nutzen Sie die passende Betriebsanleitung für [Cloud](/docs/polyglot/cloud-control-plane/) oder [Server](/docs/polyglot/server/). Ergänzen Sie die [CLI](/docs/polyglot/cli/), wenn Sie Shell-Automatisierung benötigen.
- Planen Sie sichere Worker-Bereitstellungen mit [Worker-Kompatibilität und Routing](/docs/polyglot/worker-compatibility-routing/) sowie [Build-ID-Rollouts](/docs/polyglot/worker-build-id-rollout/).

Funktionen für eingebettetes Laravel wie Timer, Signale, Abfragen, Aktivitäten und untergeordnete Workflows finden Sie in der [Dokumentation des eingebetteten Modus](/docs/category/embedded/).

Die Veröffentlichungsqualifikation ist vom ersten erfolgreichen Workflow getrennt. Die [Plattform-Konformitätssuite](/docs/platform-conformance/) enthält die exakte Artefaktmatrix, Quellcodeprüfungen, vollständige Ausführungsprotokolle, Zeitkriterien, Bereinigung und den maschinenlesbaren Schnellstartvertrag für die Zertifizierung.
