---
sidebar_position: 4
title: Démarrage rapide Rust sur Cloud
description: Exécutez l’environnement Rust commun de l’application d’exemple sur un espace de noms Durable Workflow Cloud provisionné.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - démarrage rapide Rust Cloud
  - URL runtime espace de noms
  - worker Rust
  - environnement application exemple
---

# Démarrage rapide Rust sur Cloud {#rust-cloud-quickstart}

:::caution Accès anticipé contrôlé

Durable Workflow Cloud est disponible en accès anticipé contrôlé.
N’utilisez ce guide qu’après le provisionnement d’un espace de noms et de
deux identifiants de runtime limités par rôle par Cloud. Le parcours Rust
généralement disponible ne nécessite pas Cloud. Commencez par le
[guide du SDK Rust](./rust.md) ou exécutez `scripts/playground rust`
avec le runtime local par défaut de l’environnement d’exemple.

:::

L’application d’exemple propose un environnement symétrique pour PHP, Python
et Rust. Cette page sélectionne Rust et ne change que le runtime cible.
Les parcours SDK [PHP](./php.md) et [Python](./python.md) utilisent la même
commande avec `php` ou `python`. Le
[contrat de l’environnement d’exemple](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)
documente les trois choix.

L’environnement résout les versions stables actuelles des artefacts à partir
des métadonnées de l’application d’exemple gérées par machine. Utilisez ces
versions générées sans recopier de numéros dans les commandes ni ajouter
une installation distincte du SDK.

## 1. Ouvrir l’application d’exemple préparée {#1-open-the-prepared-sample-app}

[Créez un Codespace depuis la branche `main` de l’application d’exemple](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
attendez la fin de la préparation et ouvrez un terminal à la racine du dépôt.
L’image préparée contient les outils des SDK et `dw` nécessaires à
l’environnement commun.

Cloud fournit l’URL du runtime, son espace de noms et deux identifiants de
rôle. Choisissez une file de tâches applicative, puis exportez ces paramètres
uniquement après les avoir remplacés par les valeurs correspondantes :

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

L’URL est la racine de runtime de l’espace de noms retournée par Cloud.
Elle doit être une URL HTTPS absolue sans requête, fragment ni `/api` final.
Le SDK et la CLI ajoutent leurs propres routes API. L’espace de noms du runtime
est la valeur séparée retournée avec cette URL. Ne le déduisez pas du chemin.

L’identifiant client démarre, décrit et lit les workflows. L’identifiant worker
enregistre le worker, interroge les tâches, envoie les battements de cœur et
termine les tâches. Ces secrets doivent être distincts et limités à leur rôle,
même si une seule commande lance les deux processus enfants. Une clé
d’administration Cloud gère les espaces de noms et identifiants. Ne l’exportez
pas et ne la transmettez pas à la place d’un identifiant de runtime.

## 2. Exécuter le parcours Rust {#2-run-the-rust-journey}

Exécutez le contrat commun de runtime externe :

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

La commande génère les fichiers manquants sous `.playground/rust` sans
remplacer le code appartenant à l’appelant. Avant tout démarrage, elle affiche
les types effectifs de workflow et d’activité, la file, les commandes worker
et client, les entrées et le résultat attendu. Le worker ne reçoit que son
identifiant. Une fois son enregistrement exact visible, le client ne reçoit
que l’identifiant client.

L’attente d’enregistrement est limitée à 60 secondes. Le seul démarrage du
processus ne prouve pas qu’il est prêt. Ne poursuivez qu’après l’affichage
d’un point de contrôle de cette forme, avec des identités illustratives :

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

La même commande démarre un workflow, attend jusqu’à 120 secondes le résultat
du client SDK, confirme `status=completed` avec `dw` et vérifie les
historiques de workflow et d’activité requis. Voici un résultat réussi :

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

La ligne finale `Playground success` répète le runtime cible, l’espace de
noms, la file, les types enregistrés et la forme du résultat attendu sans
valeurs d’identifiants. La commande écrit aussi
`storage/app/playground-rust-evidence.json` avec les versions des artefacts
sélectionnées, l’enregistrement exact, l’identité du workflow et de l’exécution,
l’état `completed`, le résultat et les types d’événements d’historique.
Managed Waterline reste l’interface opérateur de l’espace de noms provisionné.
Le parcours géré ne démarre ni Server ni Waterline local.

## Diagnostic borné {#bounded-diagnosis}

Si le point de contrôle `Worker ready` n’apparaît pas dans les 60 secondes,
commencez par le contrat effectif affiché au-dessus de l’erreur :

- **File différente :** le lanceur interroge la valeur exacte passée à
  `--task-queue`. Vérifiez que Cloud admet cette file et que l’enregistrement
  affiché utilise la même valeur, puis relancez la même commande.
- **Types différents :** l’erreur nomme les types de workflow et d’activité
  que le worker doit annoncer. Comparez-les au contrat effectif. Si les
  fichiers de l’appelant contiennent d’anciens enregistrements codés en dur,
  actualisez-les ou vérifiez le modèle actuel dans un nouveau répertoire
  avec `--source "$HOME/durable-rust-worker"`.
- **Rôles d’identifiants différents :** un échec d’autorisation avant
  enregistrement concerne l’identifiant worker. Pendant la description ou le
  démarrage, il concerne l’identifiant client. N’échangez pas leurs valeurs
  et ne les remplacez pas par une clé d’administration Cloud.
- **Runtime différent :** les deux rôles doivent utiliser exactement l’URL
  et l’espace de noms provisionnés. Retirez un `/api` final.
  Ne substituez pas l’URL d’administration Cloud ni celle d’un Server auto-hébergé.

Si l’enregistrement réussit mais que la fin échoue, conservez l’identité
affichée du workflow et de l’exécution. Inspectez cette exécution dans Managed
Waterline et comparez son type de workflow ou d’activité en attente et sa file
au contrat effectif. Corrigez la différence avant de démarrer une autre
exécution. Le chemin des preuves conservées et la sortie bornée du worker
indiquent si l’échec concerne le résultat client, l’état durable, le résultat
attendu ou le contrôle d’historique requis.

Revenez au [guide du SDK Rust](./rust.md), ou utilisez la
[référence d’API Rust générée](https://rust.durable-workflow.com/durable_workflow/)
pour les types et méthodes individuels.
