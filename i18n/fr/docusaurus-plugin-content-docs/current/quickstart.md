---
sidebar_position: 2
title: Démarrage rapide avec Durable Workflow 2.0
description: Choisissez un runtime en mode service et terminez un premier workflow en PHP, Python ou Rust.
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - démarrage rapide Durable Workflow
  - démarrage rapide Durable Workflow 2.0
  - SDK PHP autonome
  - SDK Python
  - SDK Rust
  - Server autonome Docker
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Démarrage rapide avec Durable Workflow 2.0 {#durable-workflow-20-quickstart}

## Avant de commencer {#before-you-begin}

**Objectif :** exécuter un workflow en mode service et lire son résultat
durable après son achèvement, en PHP, Python ou Rust.

**Durée estimée :** environ 15 minutes une fois le runtime disponible.

**Résultat final :** le SDK choisi démarre un worker et un workflow, puis
affiche un identifiant de workflow, `status=completed` et
`Hello, <language>!`.

**Prérequis :**

- `curl` et un terminal
- Docker pour le parcours local auto-hébergé, ou un espace de noms
  Durable Workflow Cloud déjà provisionné
- les outils d’un langage : PHP 8.1+ avec Composer, Python 3.10+ ou Rust 1.86+

Laravel n’est pas nécessaire en mode service. Le parcours Laravel intégré est
présenté séparément à la fin de ce guide.

## 1. Choisir le runtime en mode service {#1-choose-your-service-mode-runtime}

| Runtime | Quand le choisir | Étape suivante |
| --- | --- | --- |
| Durable Workflow Cloud | Vous voulez que Durable Workflow exploite le runtime, la persistance et Managed Waterline. | Suivez le [premier workflow Cloud](/docs/polyglot/cloud-control-plane/#cloud-first-workflow). Ce parcours fournit les sources complètes PHP, Python et Rust, les adapte aux identifiants provisionnés et mène à un résultat `completed`. **N’exécutez pas Server ni un service Waterline séparé.** |
| Server auto-hébergé | Vous voulez exploiter le runtime ou suivre exactement cet exercice local avec les artefacts publiés. | Continuez ci-dessous avec Docker et `curl`. Déployez Waterline séparément si vous souhaitez son interface opérateur. |

Les sources exécutables ci-dessous utilisent un Server local auto-hébergé.
Vous pouvez ainsi suivre l’exercice sans compte ni checkout du code source.
Cloud utilise le même modèle de SDK et de workers. Remplacez la connexion
locale de développement par les valeurs provisionnées décrites dans le
[runtime géré Cloud](/docs/polyglot/cloud-control-plane/).

## 2. Démarrer le Server local {#2-start-the-local-server}

Si vous avez choisi Cloud, sautez cette étape. Pour l’auto-hébergement,
développez et exécutez les commandes exactes ci-dessous.
Elles démarrent l’image Server épinglée, sans code source local, avec SQLite
et un jeton de développement.

<details>
<summary>Démarrer l’image Server épinglée</summary>

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

**Résultat attendu :** la requête de disponibilité réussit et les informations
du cluster identifient le Server autonome local. Laissez-le tourner pendant
que vous terminez le parcours d’un langage.

## 3. Choisir un langage {#choose-one-language}

Les trois SDK officiels sont proposés au même niveau. Seul l’onglet choisi
s’affiche pour que vous puissiez suivre un parcours sans faire défiler les
deux autres programmes.

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

Prérequis : PHP 8.1 ou une version ultérieure et Composer.
Il s’agit du package `durable-workflow/sdk`, indépendant des frameworks.

1. **Installer le SDK.**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **Ajouter le worker et le client.** Développez les sources complètes et
   copiez les deux fichiers dans le nouveau projet.

<details>
<summary>Sources PHP complètes et exécutables</summary>

Le worker enregistre un type de workflow et un type d’activité sur sa propre
file de tâches.

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

#### Client et lecture du résultat {#client-and-result-reader}

Ce client démarre un workflow portant un nom unique, attend l’exécution
sélectionnée, puis décrit l’état terminal durable conservé par Server.

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

3. **Exécuter le worker et le client.**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**Résultat attendu :** `status=completed` et un résultat contenant
`"greeting":"Hello, PHP!"`. Vous avez exécuté un worker PHP autonome et
consulté son résultat durable sans Laravel.

Poursuivez avec le [guide du SDK PHP](/docs/polyglot/php/).

</TabItem>
<TabItem value="python" label="Python">

Prérequis : Python 3.10 ou une version ultérieure.
Le programme exécute le worker et le client dans un seul processus.
Ils communiquent toujours avec Server par les API publiques des workers
et du plan de contrôle.

1. **Installer le SDK.**

   Utilisez la <PythonPackageReleaseLink authority="qualified">version stable
   du SDK Python</PythonPackageReleaseLink> indiquée dans le manifeste
   ci-dessus. La dépendance exacte générée garde ce parcours exécutable sur
   la version stable documentée.

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **Créer et exécuter le worker et le client.** Développez le programme
   complet. Sa dernière commande l’exécute.

<details>
<summary>Programme Python complet et exécutable</summary>

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

**Résultat attendu :** `status=completed` et un résultat contenant
`Hello, Python!`. Les deux derniers appels au SDK lisent le résultat et
l’état terminal durable de l’exécution sélectionnée depuis Server.

Poursuivez avec le [guide du SDK Python](/docs/polyglot/python/).

</TabItem>
<TabItem value="rust" label="Rust">

Prérequis : Rust 1.86 ou une version ultérieure.
Cet exemple exécute un worker natif et un client dans un seul processus Tokio.

1. **Installer le SDK.**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **Créer et exécuter le worker et le client.** Développez le programme
   complet. Sa dernière commande le compile et l’exécute.

<details>
<summary>Programme Rust complet et exécutable</summary>

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

**Résultat attendu :** `status=completed` et un résultat JSON contenant
`"greeting":"Hello, Rust!"`. L’exemple attend que son worker termine
l’exécution, puis lit son état durable et son résultat décodé.

Poursuivez avec le [guide du SDK Rust](/docs/polyglot/rust/).

</TabItem>
</Tabs>

## 4. Nettoyer le Server local {#4-clean-up-the-local-server}

Les utilisateurs Cloud n’ont pas de Server local à supprimer.
Pour l’exercice auto-hébergé :

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## Parcours distinct : Laravel intégré {#separate-path-embedded-laravel}

Laravel intégré est un mode de déploiement PHP officiel distinct pour les
applications qui veulent garder l’état des workflows, l’exécution des files,
la configuration et les outils opérateur dans leur infrastructure Laravel.
Il installe `durable-workflow/workflow`. Il n’utilise pas le Server autonome
ni `durable-workflow/sdk`.

Créez une application intégrée avec le package publié :

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

Pour disposer de l’interface opérateur dans cette même application Laravel,
ajoutez le package Composer Waterline intégré qualifié :

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

Ce package Composer n’est pas le moyen d’installer le service Waterline
auto-hébergé déployé séparément. Laravel intégré n’exécute pas Server et
n’installe aucun des SDK du mode service.

Poursuivez avec l’[installation intégrée](/docs/installation/) pour configurer
une file Laravel autre que `sync`, puis
[définissez](/docs/defining-workflows/workflows/) et
[démarrez](/docs/defining-workflows/starting-workflows/) un workflow intégré.
Les [modes de déploiement](/docs/polyglot/deployment-modes/) comparent ce
parcours à la plateforme en mode service.

## Étapes suivantes {#next-steps}

- Consultez l’[index des capacités](/docs/capabilities/) pour vérifier les
  fonctions prises en charge par le runtime et le SDK choisis.
- Poursuivez avec le guide du SDK
  [PHP](/docs/polyglot/php/),
  [Python](/docs/polyglot/python/) ou
  [Rust](/docs/polyglot/rust/) en mode service.
- Comparez le cycle de vie, les messages, les planifications, la visibilité
  et l’exécution des workers dans les
  [capacités des clients et workers](/docs/polyglot/cli-python-parity/).
- Exploitez le runtime correspondant via le
  [runtime géré Cloud](/docs/polyglot/cloud-control-plane/) ou le
  [Server auto-hébergé](/docs/polyglot/server/), puis ajoutez la
  [CLI](/docs/polyglot/cli/) si l’automatisation en ligne de commande est utile.
- Préparez un déploiement sûr des workers en mode service avec la
  [compatibilité et le routage des workers](/docs/polyglot/worker-compatibility-routing/)
  et le [déploiement par build ID](/docs/polyglot/worker-build-id-rollout/).

Pour écrire des workflows Laravel intégrés utilisant des temporisateurs,
signaux, requêtes de lecture, activités et workflows enfants, consultez la
[documentation du mode intégré](/docs/category/embedded/).

La qualification d’une release est séparée de ce guide de premier succès.
La [suite de conformité de la plateforme](/docs/platform-conformance/)
contient la matrice exacte des artefacts, les contrôles des sources publiques,
les transcriptions complètes, les critères de durée, le nettoyage et le
contrat de démarrage rapide lisible par machine utilisés pour la certification.
