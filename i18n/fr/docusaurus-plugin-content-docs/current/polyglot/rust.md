---
sidebar_position: 5
title: SDK Rust
description: Installez le SDK Rust officiel et retrouvez sa crate, son code source et sa documentation d’API générée.
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK Rust
  - crate durable-workflow
  - worker Rust
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# SDK Rust {#rust-sdk}

Ce guide présente le SDK accessible à tous. Consultez ensuite la référence
d’API générée pour les types et méthodes individuels. Aucun compte Cloud
n’est nécessaire : le parcours principal utilise la crate Rust publiée avec
un Server auto-hébergé. Les développeurs déjà inscrits à l’accès anticipé
contrôlé Durable Workflow Cloud peuvent choisir le
[démarrage rapide avec runtime géré](./rust-cloud-quickstart.md), clairement séparé.

Le SDK Rust officiel permet d’écrire des workflows, au-delà du rôle de client
compatible avec le protocole. Rust permet de créer des workflows déterministes,
des activités et des services worker de longue durée selon le même modèle
d’exécution durable que PHP et Python. Le client asynchrone du plan de contrôle
démarre les exécutions, envoie des signaux, effectue des requêtes de lecture et
mises à jour, annule, arrête de force et attend les résultats. Le runtime
worker relit l’historique, exécute les gestionnaires de workflow, d’activité
et de mise à jour, émet les battements de cœur worker et activité et échange
des données indépendantes du langage avec un Server auto-hébergé ou un runtime
d’espace de noms Durable Workflow Cloud.

L’[accueil de la documentation Rust](https://rust.durable-workflow.com/)
fournit l’index du SDK et les points d’entrée généraux. Pour les modules,
structures, traits et méthodes de la crate, consultez la
[référence d’API générée du SDK Rust](https://rust.durable-workflow.com/durable_workflow/).

Le SDK Rust stable prend en charge les temporisateurs durables, workflows
enfants, nouvelles tentatives et délais d’activité, activités locales, sessions
de worker, exécution sticky, signaux, gestionnaires de requête de lecture par
relecture, annulation et arrêt forcé, échéances de workflow appliquées par le
serveur, effets de bord typés, marqueurs de version, mises à jour et échecs
terminaux ou de relecture typés. Il ne revendique pas encore la gestion des
planifications. Consultez l’[index des capacités 2.0](/docs/capabilities/)
pour connaître l’étendue exacte de chaque SDK.

## Essayer l’environnement local de l’application d’exemple {#try-the-local-sample-app-playground}

Pour le parcours de création le plus court sans Cloud, ouvrez la
[branche `main` de l’application d’exemple dans GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
et exécutez :

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

L’environnement local génère le code de workflow et d’activité appartenant à
l’appelant, sélectionne les artefacts stables actuels et démarre Server et
Waterline publiés. Il attend un enregistrement de worker dont l’identité,
le type de workflow, le type d’activité et la file correspondent au contrat
généré avant de démarrer le workflow. La réussite exige le résultat terminé
attendu et l’historique requis. Le terminal affiche ensuite le lien exact de
l’exécution Waterline locale et le chemin des preuves JSON structurées.

Ce modèle volontairement réduit privilégie le transport et utilise
`serde_json::Value`. Ce n’est pas le seul contrat recommandé pour une
application Rust. Poursuivez avec l’[exemple d’entrées/sorties typées](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs),
l’[exemple de politique d’activité couvrant tentatives, délais, battements
de cœur et échecs terminaux](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)
et l’[exemple d’activité locale](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs).
Le paquet, l’exemple du dépôt et la référence d’API générée restent les
parcours directs pour les utilisateurs ne souhaitant pas l’application d’exemple.

## Paquet et code source {#package-and-source}

- [Crate sur crates.io](https://crates.io/crates/durable-workflow)
- [Dépôt source](https://github.com/durable-workflow/sdk-rust)

Installez le SDK Rust de la dernière combinaison d’artefacts qualifiée avec
succès. La dépendance exacte est générée depuis la même référence lisible
par machine que le démarrage rapide Server :

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

Ou déclarez directement la même dépendance qualifiée dans `Cargo.toml` :

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

La crate nécessite Rust 1.86 ou ultérieur. Ses métadonnées enregistrent la
version Server utilisée pour qualifier le SDK, les versions par défaut et
minimale du protocole worker, et le plan de contrôle 2. La compatibilité avec
un Server plus récent est vérifiée séparément. Pendant le déploiement, utilisez
les manifestes de protocole et capacités annoncés par `GET /api/cluster/info`.

Server négocie les en-têtes du protocole worker dans la version majeure `1` :
un serveur annonçant `1.N` accepte un en-tête `1.M` uniquement si
`M <= N`. Le SDK Rust 3.5.0 utilise par défaut
`X-Durable-Workflow-Protocol-Version: 1.20` et exige un serveur annonçant
`1.20` ou ultérieur. Pour un ancien Server compatible, sélectionnez
`WorkerProtocolVersion::V119` via le réglage `worker_protocol_version`
du constructeur de client. Le SDK 3.4.x utilise `1.19` par défaut.
Le profil facultatif d’annulation coopérative exige `1.20` et refuse
une sélection explicite de `1.19`.

La négociation refuse tout cas non reconnu. Un en-tête absent ou mal formé,
une autre version majeure ou une version mineure worker plus récente que
celle annoncée par Server est refusée. Les versions de publication SDK et
Server sont suivies indépendamment. Leurs manifestes de protocole runtime
déterminent la compatibilité.

## Activités locales {#local-activities}

Le SDK Rust 3.1.0 ajoute l’exécution locale en ligne sur les workers configurés
avec `Worker::local_activities(true)`. Enregistrez les callbacks via les
méthodes ordinaires d’enregistrement d’activités, puis utilisez les méthodes
d’activité locale du contexte de workflow. L’[exemple exécutable](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
et la [référence LocalActivityOptions](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)
décrivent les tentatives et délais.

Server enregistre le résultat terminal pour la relecture à froid.
Des effets locaux non validés peuvent se reproduire après la perte d’un worker
et doivent être idempotents. Les callbacks asynchrones doivent rendre la main
à Tokio. Le travail bloquant exige une supervision de processus séparée.
L’exécution locale en ligne et la supervision locale coopérative préparée
utilisent des profils de worker distincts.

## Sessions de worker {#worker-sessions}

Activez `Worker::worker_sessions(true)` et déclarez les exigences satisfaites
par votre worker avec `capabilities(...)`. Routez les activités distantes
avec `in_worker_session(WorkerSessionOptions::new(session_id))`.
Le contexte d’activité donne accès au handle partagé via `worker_session()`.
Les handles explicites prennent en charge `create()`, `renew()` et
`close(reason)` après enregistrement du worker.

Bornez le nombre de sessions avec `max_concurrent_worker_sessions(...)`
et la concurrence d’activité avec `max_concurrent_activities(...)`.
Renouvelez explicitement les handles inactifs. Les battements d’activité
renouvellent aussi le bail du détenteur, en conservant le TTL absolu d’origine.
Un callback asynchrone qui rend la main à Tokio est abandonné lorsque son
bail ou TTL observé localement expire, sans exiger de battements applicatifs.

Les ressources de session vivent dans le processus détenteur. Un remplaçant
doit les reconstruire. Les effets externes interrompus nécessitent idempotence
et protection contre les tentatives obsolètes. Les résultats validés sont relus
sans réexécuter le callback. L’arrêt propre ferme les sessions détenues avant
désenregistrement. Les activités locales ne peuvent pas utiliser ce routage.

La prise en charge commence avec le SDK Rust 3.2.0. Utilisez Server 2.5.1
ou ultérieur. L’[exemple exécutable](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
réutilise un cache local au processus entre deux activités typées et affiche
sa génération. Consultez [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)
et [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html)
pour la configuration et les méthodes de cycle de vie.

## Exécution sticky bornée {#bounded-sticky-execution}

Activez `Worker::sticky_cache(StickyCacheOptions::new(capacity))` pour conserver
un historique encodé immuable destiné aux relectures suivantes. Le cache est
désactivé par défaut. Définissez `max_history_bytes(...)` et `ttl(...)`
pour borner l’historique conservé et sa durée de vie. Prévoyez de la mémoire
supplémentaire pour le décodage et la relecture.

Le cache utilise les identités de workflow, d’exécution et de build.
Le remplacement du worker, l’expiration, l’éviction ou un curseur d’historique
invalide provoque un repli vers l’historique durable complet. Les workflows
terminaux et workers arrêtés suppriment leurs entrées. Le code doit être relu
correctement avec un cache vide.

La prise en charge commence avec le SDK Rust 3.4.0 et la référence Server
qualifiée. Consultez la [référence de configuration](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html),
l’[exemple exécutable](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)
et le [guide d’affinité portable des workers](./portable-worker-affinity.md).

## Préparer l’exemple du dépôt publié {#prepare-the-released-repository-example}

L’[exemple `hello_world`](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
enregistre un worker Rust, démarre un workflow, envoie un signal, exécute une
activité, émet un battement d’activité et attend le résultat terminé.
Comme il exécute client applicatif et worker dans un même processus, le parcours
sans compte ci-dessous utilise un Server auto-hébergé. Un espace Cloud
provisionné est un runtime secondaire facultatif avec des identifiants distincts par rôle.

Pour un exercice source reproductible, récupérez le code exact de la crate
indiqué par la combinaison qualifiée. La valeur ci-dessous est générée depuis
cette référence lisible par machine. Le répertoire d’exemple est absolu afin
que les deux parcours de connexion puissent y accéder directement :

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## Exécuter l’exemple combiné avec Server auto-hébergé {#run-the-combined-example-with-self-hosted-server}

L’exemple `hello_world` non modifié accepte un seul jeton pour un Server
auto-hébergé dont la politique d’authentification autorise le même identifiant
pour les commandes de workflow et l’interrogation des tâches :

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

L’exemple utilise l’espace de noms `default` provisionné par le démarrage
rapide Server local. Utilisez `TASK_QUEUE` pour remplacer sa file
`rust-workers` par défaut. Ce parcours ne nécessite ni inscription
ni identifiants Cloud.

## Parcours secondaire facultatif : Durable Workflow Cloud {#optional-secondary-path-connect-to-durable-workflow-cloud}

Pour la preuve la plus courte sur runtime géré, utilisez le
[démarrage rapide Rust Cloud](./rust-cloud-quickstart.md). Il exécute le même
environnement symétrique d’exemple que PHP et Python, sélectionne dynamiquement
les artefacts stables, vérifie exactement la disponibilité du worker et attend
un résultat terminé.

<ProductPromotion source="docs-v2-rust-sdk">
Déjà inscrit à Cloud ? Exécutez l’environnement Rust commun sur votre espace de
noms provisionné avec des identifiants de runtime distincts et limités par rôle.
</ProductPromotion>

L’exemple SDK combiné de plus bas niveau ci-dessous convient pour adapter
un processus Rust existant. Exportez les valeurs retournées lorsque Cloud
provisionne l’espace de noms et crée ses deux identifiants de runtime.

Le [runtime Cloud géré](/docs/polyglot/cloud-control-plane) décrit la frontière
de connexion gérée.

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

Dans `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs`, remplacez
la configuration existante de `server_url`, `token` et
`Client::builder(...)` par ce constructeur à jetons séparés :

<!-- docs-example id="rust.sdk.cloud.client" -->
```rust
let runtime_url = std::env::var("DURABLE_WORKFLOW_RUNTIME_URL")
    .expect("DURABLE_WORKFLOW_RUNTIME_URL must be set");
let runtime_namespace = std::env::var("DURABLE_WORKFLOW_RUNTIME_NAMESPACE")
    .expect("DURABLE_WORKFLOW_RUNTIME_NAMESPACE must be set");
let client_token = std::env::var("DURABLE_WORKFLOW_CLIENT_TOKEN")
    .expect("DURABLE_WORKFLOW_CLIENT_TOKEN must be set");
let worker_token = std::env::var("DURABLE_WORKFLOW_WORKER_TOKEN")
    .expect("DURABLE_WORKFLOW_WORKER_TOKEN must be set");

let client = Client::builder(runtime_url)
    .namespace(runtime_namespace)
    .control_token(Some(client_token))
    .worker_token(Some(worker_token))
    .build()?;
```

Exécutez ensuite l’exemple normalement :

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

Les appels de démarrage, signal, description et résultat utilisent
`control_token`. L’enregistrement, l’interrogation, les battements et les
fins de tâches du `Worker` utilisent `worker_token`. Les deux rôles
partagent l’URL Cloud, l’espace de noms et la file, mais pas leur identifiant.
Ne remplacez aucun identifiant Cloud par `.token(...)`, mécanisme générique
à jeton unique du parcours auto-hébergé précédent.

## Démarrer avec des délais de workflow appliqués par Server {#start-with-server-enforced-workflow-timeouts}

Le SDK Rust fournit `WorkflowStartOptions` et
`Client::start_workflow_with_options` pour les échéances de workflow
appliquées par Server même après la fin du processus de démarrage.
Le délai d’exécution global couvre toute l’instance, y compris les
continuations avec une nouvelle exécution. Le délai d’une exécution couvre
une seule exécution et est recalculé au début de la suivante.

<!-- docs-example id="rust.workflow-start-timeouts" -->
```rust
use durable_workflow::{json, Client, Result, WorkflowStartOptions};

async fn start(client: &Client) -> Result<()> {
    let handle = client.start_workflow_with_options(
        "orders.await-payment",
        "orders",
        "order-42",
        WorkflowStartOptions::new()
            .execution_timeout_seconds(300)
            .run_timeout_seconds(30),
        json!([{"order_id": "order-42"}]),
    ).await?;

    println!("workflow={} run={:?}", handle.workflow_id, handle.run_id);
    Ok(())
}
```

Les deux valeurs sont en secondes et doivent être positives. Le délai d’une
exécution ne peut pas dépasser le délai global de l’instance.
La méthode `Client::start_workflow` utilise
`WorkflowStartOptions::default()` : 3 600 secondes pour l’instance et
600 secondes par exécution. Les [délais d’expiration](/docs/features/timeouts)
décrivent les échéances Server et la continuation avec une nouvelle exécution.

Ce sont des politiques de workflow. `WorkflowResultOptions::timeout`
interrompt uniquement l’attente locale de `result()`. Il ne ferme,
n’annule ni ne modifie l’exécution. L’appelant peut inspecter l’identité
retournée et attendre de nouveau. Une échéance configurée par
`WorkflowStartOptions` est un état durable Server. À son expiration,
Server ferme l’exécution avec le résultat terminal `timed_out`.

## Groupes parallèles déterministes {#deterministic-parallel-groups}

`WorkflowContext::parallel` et son alias `join` composent activités,
workflows enfants, temporisateurs, groupes mixtes et imbriqués sans nouvelle
commande Server. Les constructeurs de `ParallelOperation` diffèrent
chaque feuille jusqu’à ce que l’arbre complet soit connu :

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.parallel(vec![
    ParallelOperation::activity("load-profile", json!(["customer-42"])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "quote-shipping",
            ChildWorkflowOptions::new("shipping-workers"),
            json!(["customer-42"]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

Chaque feuille porte l’identité stable du groupe partagé et son chemin complet
de l’extérieur vers l’intérieur. Les résultats réussis conservent la structure
imbriquée et l’ordre d’entrée. `Error::ParallelFailed` préserve la cause
typée de la feuille, son chemin déterministe, le chemin du groupe et les
membres voisins terminés. Les historiques en attente et terminés sont relus
sans nouvelle planification. Les doublons exacts et fins tardives ne changent
pas le résultat positionnel retenu.

## Sélection durable de la première fin {#durable-first-completion-selection}

`WorkflowContext::select` et `select_keyed` démarrent ensemble activités,
workflows enfants, temporisateurs, signaux, attentes conditionnelles et
groupes ordinaires imbriqués, puis reprennent avec le gagnant enregistré
par le runtime :

```rust
use durable_workflow::{json, ParallelOperation, SelectionKey};
use std::time::Duration;

let selected = ctx.select_keyed(vec![
    ("resolver", ParallelOperation::activity("resolve-request", json!([request_id]))),
    ("input", ParallelOperation::signal("resolution.received")),
    ("deadline", ParallelOperation::timer(Duration::from_secs(2))),
]).await?;

if selected.key == SelectionKey::Name("deadline".to_string()) {
    if let Some(resolver) = selected.handle(&SelectionKey::Name("resolver".to_string())) {
        resolver.cancel().await?;
    }
}
```

`SelectionResult` préserve la clé ou l’index stable, le type et l’identité
de l’opération, la valeur ou l’échec typé et un `DurableOperationHandle`
par membre. Un perdant continue sauf si le workflow attend ensuite
`handle.await_result()` ou `handle.cancel()`. La future d’annulation
se résout en unité. Seul un événement validé `SelectionOperationCancelled`
prouve que l’annulation a gagné. La relecture dépasse une demande sans marqueur,
et `await_result()` retourne toujours une fin validée en premier.
Le redémarrage et la relecture utilisent le gagnant persistant.
Les événements terminaux tardifs ou en double ne peuvent pas le modifier.

## Compensation des sagas {#saga-compensation}

N’enregistrez une compensation qu’après la fin de l’activité correspondante,
puis transmettez le résultat des opérations principales à `Saga::finish` :

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

Un échec géré exécute la commande d’activité existante dans l’ordre inverse
d’enregistrement, une compensation à la fois. La compensation s’arrête au
premier échec. `Error::SagaCompensationFailed` préserve les deux erreurs
typées, le type d’activité de compensation et son ordre d’enregistrement
à travers les redémarrages et relectures.
Un `cancel_workflow` terminal ne reprend pas le code pour exécuter les compensations.

## Effets de bord déterministes et marqueurs de version {#deterministic-side-effects-and-version-markers}

Le SDK Rust enregistre les petites valeurs non déterministes avec
`WorkflowContext::side_effect` et produit des UUIDv4 déterministes avec
`WorkflowContext::uuid_v4`. Une relecture à froid décode la valeur
enregistrée sans rappeler le callback. Des marqueurs réordonnés, manquants,
en double ou au codec incompatible retournent
`Error::NonDeterministicReplay`.

Utilisez `WorkflowContext::get_version(change_id, min_supported, max_supported)`
pour garder les anciennes et nouvelles branches compatibles avec la relecture
pendant un déploiement. Les nouvelles exécutions enregistrent `max_supported`.
Les anciennes réutilisent le marqueur durable. `patched(change_id)` fournit
la forme booléenne de déploiement et `deprecate_patch(change_id)` préserve
le marqueur après la fin des anciennes branches. Les [effets de bord](/docs/features/side-effects/)
et la [gestion des versions](/docs/features/versioning/) décrivent ces règles communes.

## Annuler, arrêter de force et traiter les résultats terminaux {#cancel-terminate-and-handle-terminal-outcomes}

En mode service, `cancel_workflow` et `terminate_workflow` ferment tous deux
l’exécution immédiatement. Ils enregistrent des résultats terminaux distincts,
sans demander de nettoyage au code du workflow. Utilisez
`request_cancellation()` avec des workers coopératifs pour un nettoyage
borné. Le [guide d’annulation coopérative](/docs/polyglot/cancellation) décrit
les politiques d’opération, la supervision et la reprise.

```rust
use durable_workflow::{Client, WorkflowCommandOptions};

# async fn cancel(client: &Client) -> durable_workflow::Result<()> {
client.cancel_workflow(
    "order-42",
    WorkflowCommandOptions::new()
        .reason("customer withdrew the order")
        .request_id("cancel-order-42"),
).await?;
# Ok(())
# }
```

Les commandes `cancel_workflow` et `terminate_workflow` visant une instance
résolvent son exécution courante sur Server. Pour protéger une exécution
sélectionnée, appelez `cancel_workflow_run` ou `terminate_workflow_run`,
ou les méthodes `cancel_selected_run` et `terminate_selected_run`
d’un handle. Si l’exécution sélectionnée est ancienne,
`Error::WorkflowCommandRejected` expose le motif stable
`historical_run_command_rejected`, les identifiants de workflow et
d’exécution, le périmètre cible, l’état HTTP et le corps de réponse.

Les appels réussis à `WorkflowHandle::result` retournent la valeur JSON
décodée. Traitez les variantes terminales typées pour tous les autres résultats.
Branchez-vous sur les champs stables de motif et de catégorie :

<!-- docs-example id="rust.typed-workflow-timeouts" -->
```rust
use durable_workflow::{Error, WorkflowHandle, WorkflowResultOptions};

# async fn wait(handle: WorkflowHandle) -> durable_workflow::Result<()> {
match handle.result(WorkflowResultOptions::default()).await {
    Ok(value) => println!("completed: {value}"),
    Err(Error::WorkflowCancelled(outcome)) => {
        println!("cancelled {:?}: {}", outcome.run_id, outcome.reason);
    }
    Err(Error::WorkflowTerminated(outcome)) => {
        println!("terminated: {}", outcome.reason);
    }
    Err(Error::WorkflowFailed(outcome)) => {
        println!("failure {:?}: {:?}", outcome.failure_id, outcome.exception_class);
    }
    Err(Error::WorkflowTimedOut(outcome)) => match (
        outcome.reason.as_str(),
        outcome.failure_category.as_deref(),
    ) {
        ("result_wait_timeout", Some("client_timeout")) => {
            println!(
                "caller deadline for {} / {:?}; the run may still be open",
                outcome.workflow_id, outcome.run_id,
            );
        }
        ("execution_timeout" | "run_timeout", category) => {
            println!(
                "server timeout for {} / {:?}: reason={} category={:?}",
                outcome.workflow_id, outcome.run_id, outcome.reason, category,
            );
        }
        (reason, category) => {
            println!("other typed timeout: reason={reason} category={category:?}");
        }
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

Chaque résultat terminal porte les identités de workflow et d’exécution.
Il conserve aussi le motif public, la catégorie et l’identité de l’échec,
le type et la classe d’exception, le caractère non réessayable, le message
et les données d’exception fournis par Server. Une échéance locale d’attente
a pour motif `result_wait_timeout` et catégorie `client_timeout`.
Une expiration Server est une exécution terminale `timed_out` dont le motif
stable est `execution_timeout` ou `run_timeout`.

Les handles retournés par les deux méthodes de démarrage conservent le
`run_id` sélectionné. `WorkflowHandle::result` décrit cette route propre
à l’exécution. Réutiliser l’identifiant du workflow pour une nouvelle
exécution ne peut donc pas faire retourner silencieusement son résultat par
une ancienne attente. Conservez `outcome.workflow_id` et `outcome.run_id`
dans les journaux, métriques et enregistrements de nouvelles tentatives.
N’utilisez les recherches par instance que pour suivre volontairement
l’exécution courante.

## Mises à jour des workflows {#workflow-updates}

Rust prend en charge les mises à jour durables dans les rôles client
applicatif, handle sélectionné et écriture worker.
Utilisez `Client::update_workflow` ou `WorkflowHandle::update` pour les
valeurs compatibles JSON, et `update_workflow_avro_value` ou
`update_avro_value` pour les valeurs Avro explicitement typées.

Les workers enregistrent les gestionnaires nommés avec
`Worker::register_update`. Utilisez `register_update_avro_value` si
le gestionnaire consomme et retourne directement des valeurs Avro.
Une mise à jour est une mutation durable de workflow qui produit un résultat.
Elle se distingue des signaux sans attente de réponse et des requêtes de
lecture relues sans mutation.

## Enveloppe de données utiles {#payload-envelope}

Les entrées de workflow, signaux, activités, requêtes de lecture et résultats
utilisent le contrat publié `PayloadEnvelope` : un `codec` et un
`blob` encodé. Le parcours `avro` par défaut utilise la dépendance
déclarée `apache-avro` et le schéma Value fixe versionné de la plateforme.
Ne fabriquez pas le blob manuellement et ne remplacez pas l’enveloppe par
un enregistrement propre à une implémentation.

<!-- docs-example id="rust.avro-payload-envelope" -->
```rust
use durable_workflow::{decode_payload, json, PayloadEnvelope, Result, Value};

fn round_trip() -> Result<()> {
    let envelope = PayloadEnvelope::avro(&json!({"order_id": "order-42"}))?;
    assert_eq!(envelope.codec, "avro");

    let decoded: Value = decode_payload(&envelope)?;
    assert_eq!(decoded["order_id"], "order-42");
    Ok(())
}
```

`start_workflow` et `start_workflow_with_options` appliquent automatiquement
l’enveloppe à leur entrée sérialisable. Utilisez les fonctions publiques
uniquement lorsqu’un programme doit échanger directement une enveloppe.

Les activités longues doivent émettre des battements et consulter
`should_stop()`. À l’annulation, libérez les fichiers temporaires, connexions
et autres ressources locales et retournez rapidement. L’état durable refuse
une fin tardive, qui ne peut pas convertir une exécution annulée ou arrêtée
de force en réussite. Les workers gérés continuent d’interroger les tâches
après ce refus définitif et après redémarrage.

Pour les images Server, l’authentification et la topologie de production,
consultez le [guide de configuration du serveur](/docs/polyglot/server).
