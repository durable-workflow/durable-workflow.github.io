---
sidebar_position: 1
title: Migration du mode embarqué vers Server
description: Déplacez un déploiement Laravel embarqué v2 vers le serveur autonome Durable Workflow.
---

# Migration du mode embarqué vers Server {#embedded-to-server-migration}

Ce guide s’adresse aux équipes qui exécutent déjà Durable Workflow v2 dans
une application Laravel et souhaitent diriger les nouveaux workflows vers
le serveur autonome. Si l’application utilise encore v1, commencez par la
[migration vers 2.0](/docs/migration) et laissez les exécutions v1 existantes
se terminer sur le moteur v1.

Consultez d’abord le [guide d’adoption Laravel et de transition du runtime](/docs/laravel-adoption/)
si la destination n’est pas encore choisie ou si l’intégration au framework
Laravel fait partie de la décision. Cette page décrit la procédure Server
auto-hébergé après ce choix. Elle ne décrit pas une migration vers Cloud.

La migration est un parcours d’adoption, sans déplacement en place de la base.
Le serveur autonome prend en charge les nouveaux démarrages du plan de
contrôle, l’historique durable, les planifications, les enregistrements des
workers et la livraison des tâches via HTTP. Vos workers applicatifs
conservent le code des workflows et activités.

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  Durable Workflow 2.0 possède un seul codec public de données utiles : <code data-payload-codec-field="codec">avro</code>.
  JSON sert au transport des documents HTTP. Les lecteurs v1 réservés à PHP
  restent internes au parcours d’import et de drainage et ne peuvent pas être
  sélectionnés pour de nouvelles exécutions v2.
  Consultez le <a href="/docs/polyglot/avro-value-protocol/">protocole Avro Value</a>.
</div>

Ce guide décrit une migration auto-hébergée. Il ne transforme pas le déploiement
embarqué en espace de noms Cloud et le Server obtenu n’est pas raccordé à
Durable Workflow Cloud. Le [runtime Cloud géré](/docs/polyglot/cloud-control-plane)
décrit le choix distinct de service géré.

## Périmètre actuel {#current-boundary}

Les opérations suivantes sont prises en charge :

- Démarrer de nouveaux workflows via l’API du plan de contrôle Server ou la CLI.
- Enregistrer des workers PHP, Python, Rust ou HTTP personnalisés auprès du serveur.
- Interroger et terminer les tâches de workflow et d’activité via le protocole worker.
- Importer des bundles d’export d’historique embarqué v2 admissibles comme état
  de workflow géré par Server.
- Exporter l’historique d’exécutions clôturées depuis le mode embarqué v2 ou
  Server v2 pour l’audit, le débogage et l’archivage.
- Observer les workflows gérés par Server via son API, la CLI et les SDK qui
  lisent son état, ou déployer [Waterline en mode service](/docs/monitoring#waterline-service)
  comme observateur séparé connecté par le SDK PHP. Le paquet Waterline de
  l’application Laravel d’origine continue de lire uniquement l’état de son
  runtime embarqué.

Les opérations suivantes ne sont actuellement pas automatiques :

- Déplacer les exécutions v1 vers le serveur.
- Relire l’historique v1 avec des workers hors PHP.

Préparez la transition pour laisser les exécutions v1 se terminer là où elles
ont démarré. Les exécutions embarquées v2 peuvent soit se terminer sur place,
soit passer par le parcours d’import ci-dessous.

## Contrat des modes de déploiement {#deployment-mode-contract}

Les [modes de déploiement](/docs/polyglot/deployment-modes) fixent la comparaison
entre embarqué et service. Ce guide ajoute quatre règles de transition :

- Les exécutions embarquées existantes continuent là où elles ont démarré.
- Dès la première transition, les nouvelles exécutions gérées par Server
  utilisent des clés de type, espaces de noms et files stables, avec le contrat Avro.
- Les signaux, requêtes de lecture, mises à jour, réparations, annulations,
  arrêts forcés et archivages restent dirigés vers le runtime propriétaire
  de l’exécution cible.
- Chaque déploiement Waterline continue de cibler le runtime et l’espace de
  noms qu’il observe. Il ne fusionne pas les exécutions embarquées et gérées par Server.

## Invariants de transition {#cutover-invariants}

Préservez ces règles pendant toute la migration :

- Configurez Server comme dépendance distante explicite : URL de base,
  espace de noms, file et authentification, sans les déduire des réglages
  locaux de l’application Laravel.
- Gardez les identifiants de workflow, règles de ciblage des exécutions,
  clés de type workflow/activité, étiquette de codec (`avro`) et marqueurs
  de compatibilité stables entre les deux runtimes.
- Dirigez les signaux, requêtes de lecture, mises à jour, réparations,
  annulations, arrêts forcés et archivages vers le runtime propriétaire de la cible.
- Avant d’importer une exécution embarquée, suspendez les workers assez
  longtemps pour exporter un bundle au repos, sans tâche de workflow ou
  d’activité sous bail ni tentative d’activité en cours.
- La neutralité des langages fait partie du contrat : les workflows gérés
  par Server utilisent des alias stables et le schéma Avro Value fixe,
  sans noms de classes ni formats de données réservés à PHP.

## Phase A : préparer le mode embarqué v2 {#phase-a-prepare-embedded-v2}

Avant de déployer Server, faites utiliser des contrats indépendants du langage
à l’application embarquée. Cela réduit les modifications de code pendant la transition.

1. Définissez des clés stables de type workflow et activité.

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. Utilisez ces clés à chaque frontière externe.

   Les clients Server envoient `workflow_type: "orders.process"` et les workers
   enregistrent `supported_workflow_types` / `supported_activity_types`
   avec les mêmes chaînes. N’exposez pas les noms PHP pleinement qualifiés
   comme contrat public durable.

3. Utilisez le contrat de données utiles Avro v2.

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   Avro est obligatoire pour les nouveaux workflows v2 embarqués et gérés
   par Server. Un ancien lecteur PHP ne peut être conservé que dans le
   parcours d’import et de drainage v1 pendant la fin des exécutions v1.

4. Choisissez les noms d’espace de noms et de file de tâches.

   Choisissez des noms qui resteront stables pendant la transition :

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. Décidez si des marqueurs de compatibilité sont nécessaires.

   Un déploiement avec un seul parc peut laisser la compatibilité non définie.
   Les mécanismes v2 ordinaires de déploiement canari, drainage, retour arrière
   et débogage par relecture fonctionnent dans un même contrat v2 stable.
   Il n’existe pas de parcours d’adoption « v2 à parcs mixtes ». Si une fenêtre
   de décalage entre builds apparaît pendant la transition, définissez
   `DW_V2_CURRENT_COMPATIBILITY` et `DW_V2_SUPPORTED_COMPATIBILITIES`
   avant celle-ci pour qu’un nouveau build ne prenne pas les exécutions
   d’un build incompatible pendant cette fenêtre.

## Phase B : déployer Server à côté du mode embarqué {#phase-b-deploy-the-server-beside-embedded}

Exécutez Server à côté de l’application Laravel pendant qu’elle continue
de traiter les exécutions embarquées existantes.

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

En développement local, vous pouvez définir `DW_AUTH_DRIVER=none`.
Dans les environnements partagés, utilisez des identifiants limités par rôle :

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Vérifiez la découverte et créez l’espace de noms :

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

Server refuse les requêtes du plan de contrôle sans
`X-Durable-Workflow-Control-Plane-Version: 2`. Les workers utilisent
l’en-tête distinct `X-Durable-Workflow-Protocol-Version: 1.0`.

## Phase C : connecter les workers {#phase-c-connect-workers}

Les workers doivent s’enregistrer avant d’interroger les tâches.
L’enregistrement annonce le runtime, la file et les clés de type exécutables.

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

Exécutez ensuite les workers en mode serveur pour le même espace de noms et
la même file. Les workers Python suivent les mêmes contrats d’enregistrement
et d’interrogation via le SDK Python. Les workers personnalisés peuvent
utiliser directement le [protocole worker](/docs/polyglot/worker-protocol).

Vérifiez la visibilité avant la transition :

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## Phase D : diriger les nouveaux démarrages vers Server {#phase-d-route-new-starts-to-the-server}

Basculez une famille de workflows à la fois. Gardez l’application embarquée
et ses workers de file en fonctionnement pour les anciennes exécutions
jusqu’à leur fin.

Démarrez d’abord un workflow de validation parallèle :

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

Observez l’exécution :

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Lorsque ce parcours fonctionne, remplacez `WorkflowStub::start()` chez
l’appelant de production par le client Server, la CLI ou l’API HTTP directe.
Laissez les signaux, requêtes de lecture, mises à jour, annulations et arrêts
forcés dirigés vers le runtime qui a démarré le workflow. Un workflow embarqué
reçoit des commandes embarquées. Un workflow démarré sur Server reçoit les
commandes de son plan de contrôle.

## Phase E : importer les exécutions embarquées v2 admissibles {#phase-e-import-eligible-embedded-v2-runs}

L’export d’historique est le format d’import. Le runtime embarqué reste la
source de vérité du bundle. Server le vérifie, écrit les lignes durables
dans une seule transaction et reconstruit ses projections depuis ces lignes.

Conditions d’admissibilité :

- Le schéma du bundle doit être `durable-workflow.v2.history-export`
  avec `schema_version: 1`.
- L’exécution source doit être embarquée v2 et l’export porter
  `workflow.source_runtime: "embedded"`. L’historique v1 reste hors périmètre.
- Une exécution non terminale doit être l’exécution embarquée courante.
- Une exécution terminale doit avoir `history_complete: true`.
- Les bundles masqués sont refusés.
- Les tâches de workflow et d’activité sous bail et les tentatives d’activité
  en cours sont refusées. Suspendez les workers ou laissez expirer les baux,
  puis exportez de nouveau.

Règles de référence de l’import :

- `history_events` est copié comme journal de référence de relecture et d’audit.
- L’identité du workflow, les données utiles, commandes, signaux, mises à jour,
  tâches, exécutions d’activité, temporisateurs, échecs et liens de filiation
  sont reconstruits depuis le bundle.
- Les projections Server de résumé, attente, temporisateurs, chronologie et
  filiation sont reconstruites après import. Les lignes de projection ne font
  pas autorité pour l’import.
- Les tâches de workflow en attente restent disponibles pour les workers
  Server compatibles.
- Les exécutions d’activité en attente et tâches d’activité prêtes restent
  disponibles pour les workers d’activité Server compatibles.
- Les temporisateurs en attente conservent `fire_at` et sont visibles
  pour la réparation et la récupération des temporisateurs Server.

Échec et retour arrière :

- L’import est intégral ou nul dans une seule transaction de base de données.
- Si le processus s’arrête ou que la validation échoue avant le commit,
  aucun état partiel d’exécution ne reste sur Server.
- Réessayer le même bundle est idempotent par `run_id` et `dedupe_key`.
- Si une autre exécution Server possède déjà le même `run_id`, l’import est refusé.

Visibilité et audit :

- Les exécutions importées exposent `engine_source: embedded_v2_import`
  dans les vues de liste et de détail Server.
- La ligne durable d’exécution enregistre `import_source=embedded_v2`,
  `import_id`, `import_dedupe_key`, `import_contract_version` et `imported_at`.

Procédure opérateur :

Pour les exécutions embarquées v2 :

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

Simulez l’import sur Server :

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

Importez le bundle :

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

Ou appelez le point de terminaison HTTP opérateur :

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

Le fichier `order-123-import-request.json` contient :

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

L’objet `bundle` ci-dessus est abrégé. Transmettez le document JSON
`workflow:v2:history-export` complet.

Pour les exécutions gérées par Server à conserver ou auditer uniquement :

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

Archivez les exécutions Server terminales après export pour les protéger
de l’élagage de rétention :

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## Phase F : ajouter des workers multilangages {#phase-f-add-polyglot-workers}

Une fois une famille de workflows gérée par Server, ajoutez des workers Python,
Rust ou personnalisés en enregistrant les mêmes espace de noms, file et clés
de type. Toute donnée utile publique v2 utilise `avro`. Gardez les entrées
et sorties d’activité indépendantes du langage : tableaux, objets, chaînes,
nombres, booléens et valeurs null.

Consultez le [guide du SDK Python](/docs/polyglot/python) ou le
[guide du SDK Rust](/docs/polyglot/rust). Pour une implémentation HTTP directe,
utilisez la [référence du protocole worker](/docs/polyglot/worker-protocol).

## Liste de contrôle de transition {#cutover-checklist}

- [ ] Les exécutions v1 sont terminées ou volontairement laissées sur le moteur v1.
- [ ] Le mode embarqué v2 utilise des clés de type stables aux frontières
      externes, sans noms de classes PHP pleinement qualifiés.
- [ ] Tout nouveau workflow v2 utilise le seul codec public `avro`.
- [ ] Les contrôles Server `/api/health` et `/api/cluster/info` réussissent
      depuis le réseau de déploiement.
- [ ] L’espace de noms cible existe sur Server.
- [ ] Les workers s’enregistrent avec la file et les clés de type attendues.
- [ ] Un workflow de validation parallèle démarre, est pris par un worker
      et atteint l’état attendu.
- [ ] Les opérateurs peuvent lister les workflows, inspecter les files et
      consulter les enregistrements des workers.
- [ ] Les anciens points de démarrage embarqués sont suspendus ou déplacés
      pour éviter qu’une même clé métier démarre dans les deux runtimes.
- [ ] Les exécutions embarquées v2 à importer sont exportées depuis un runtime
      au repos et passent `workflow:v2:history-import --dry-run`.
- [ ] Les vues Server de détail/liste affichent `engine_source: embedded_v2_import`
      et l’`import_id` attendu pour les exécutions importées.
- [ ] Les anciennes exécutions clôturées à conserver sont exportées vers un stockage durable.

## Dépannage {#troubleshooting}

| Symptôme | Cause probable | Correction |
| --- | --- | --- |
| `missing_control_plane_version` | Appel du plan de contrôle sans en-tête v2 | Envoyez `X-Durable-Workflow-Control-Plane-Version: 2` |
| `missing_protocol_version` | Appel worker sans en-tête de protocole worker | Envoyez `X-Durable-Workflow-Protocol-Version: 1.0` |
| `namespace_not_found` | L’espace de noms n’a pas été créé sur Server | Créez-le via `POST /api/namespaces` |
| L’interrogation worker ne retourne aucune tâche | La file, la clé de type, l’espace de noms ou le marqueur de compatibilité diffère | Comparez les données de démarrage, l’enregistrement worker et la visibilité de la file |
| Un worker hors PHP ne peut pas décoder les données v1 | L’exécution contient un historique v1 natif PHP | Gardez-la sur le parcours interne PHP d’import et de drainage v1. Ne la dirigez pas vers un worker v2 |
| L’ancien workflow ne répond pas aux signaux/requêtes/mises à jour Server | Il a démarré en mode embarqué | Envoyez les commandes via l’application embarquée jusqu’à sa fin |
| L’import refuse `tasks.leased_task_present` | L’export embarqué contient une tâche sous bail | Suspendez les workers embarqués, attendez la libération ou la fin des baux et exportez de nouveau |
| L’import retourne `already_imported` | Les mêmes `run_id` et `dedupe_key` sont déjà sur Server | Traitez la nouvelle tentative comme réussie et inspectez l’exécution Server |
| L’exécution importée est visible mais non prise en charge | La clé de type, la file, l’espace de noms ou le marqueur worker diffère de la ligne importée | Comparez le rapport d’import, les détails de l’exécution et l’enregistrement worker |

## Guides associés {#related-guides}

- [Préparation de Server](/docs/polyglot/server)
- [Protocole worker](/docs/polyglot/worker-protocol)
- [SDK Python](/docs/polyglot/python)
- [Migration vers 2.0](/docs/migration)
