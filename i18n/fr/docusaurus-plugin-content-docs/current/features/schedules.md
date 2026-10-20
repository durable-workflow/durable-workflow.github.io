---
sidebar_position: 20
---

# Planifications {#schedules}

Les planifications démarrent des workflows de manière récurrente à l’aide d’expressions cron. Chacune est une entité nommée durable que le moteur évalue à chaque passage pour déterminer s’il faut déclencher une exécution.

## Créer une planification {#creating-a-schedule}

Utilisez `ScheduleManager::create()` pour définir une planification nommée :

```php
use Workflow\V2\Enums\ScheduleOverlapPolicy;
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::create(
    scheduleId: 'daily-invoice-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 2 * * *',
    arguments: ['nightly'],
    timezone: 'America/New_York',
    overlapPolicy: ScheduleOverlapPolicy::Skip,
    labels: ['team' => 'billing'],
    memo: ['origin' => 'scheduled'],
    searchAttributes: ['tenant_id' => '42'],
    notes: 'Runs every night at 2 AM ET.',
    executionTimeoutSeconds: 120,
    runTimeoutSeconds: 60,
);
```

Le `scheduleId` est un identifiant unique choisi par l’utilisateur. Chaque exécution déclenchée reçoit un identifiant d’instance déterministe dérivé de cet identifiant et de l’horodatage du déclenchement.

### Paramètres {#parameters}

| Paramètre | Type | Valeur par défaut | Description |
|---|---|---|---|
| `scheduleId` | `string` | requis | Identifiant unique de la planification |
| `workflowClass` | `string` | requis | Classe de workflow à démarrer |
| `cronExpression` | `string` | requis | Expression cron standard à 5 champs |
| `arguments` | `array` | `[]` | Arguments transmis à la méthode `handle()` du workflow |
| `timezone` | `string` | `'UTC'` | Fuseau horaire d’évaluation de l’expression cron |
| `overlapPolicy` | `ScheduleOverlapPolicy` | `Skip` | Action si l’exécution précédente est encore active |
| `labels` | `array` | `[]` | Étiquettes de visibilité appliquées à chaque exécution |
| `memo` | `array` | `[]` | Champs de mémo appliqués à chaque exécution |
| `searchAttributes` | `array` | `[]` | Attributs de recherche appliqués à chaque exécution |
| `jitterSeconds` | `int` | `0` | Délai aléatoire maximal en secondes ajouté à chaque échéance pour réduire les pics simultanés |
| `maxRuns` | `int\|null` | `null` | Nombre maximal d’exécutions avant suppression automatique |
| `connection` | `string\|null` | `null` | Connexion de file des exécutions, remplaçant la valeur par défaut de la classe |
| `queue` | `string\|null` | `null` | Nom de file des exécutions, remplaçant la valeur par défaut de la classe |
| `notes` | `string\|null` | `null` | Notes opérateur libres |
| `namespace` | `string\|null` | `null` | Espace de noms, par défaut le `workflows.v2.namespace` configuré ou `'default'` |
| `executionTimeoutSeconds` | `int\|null` | `null` | Délai d’expiration de chaque exécution logique, nouvelles tentatives et continuations incluses |
| `runTimeoutSeconds` | `int\|null` | `null` | Délai de chaque exécution individuelle, réinitialisé à chaque continuation |

### Délais d’expiration du workflow {#workflow-timeouts}

Le délai d’exécution logique couvre les nouvelles tentatives et continuations.
Le délai individuel limite une seule exécution et se réinitialise à chaque
continuation. Une exécution ne peut dépasser le budget logique restant. Chaque
occurrence planifiée démarre un nouveau budget mesuré depuis le démarrage réel
du workflow, pas depuis son échéance planifiée.

Les deux options acceptent des secondes entières strictement positives ou `null`.
Une option omise ou `null` laisse la limite non définie. Les déclenchements
manuels, passages automatiques, démarrages en tampon et rattrapages appliquent
les limites stockées via le lanceur PHP par défaut.

Pour `createFromSpec()`, placez les limites dans l’action :

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'hourly-invoice-sync',
    spec: ['intervals' => [['every' => 'PT1H']]],
    action: [
        'workflow_class' => InvoiceSyncWorkflow::class,
        'input' => ['hourly'],
        'execution_timeout_seconds' => 120,
        'run_timeout_seconds' => 60,
    ],
);
```

La création et les modifications d’action valident les délais PHP selon les
mêmes règles `StartOptions` que les démarrages directs. Aucun lanceur personnalisé
n’est nécessaire.

Modifiez l’action pour changer les limites des futurs démarrages :

```php
$schedule = ScheduleManager::update($schedule, action: [
    ...$schedule->action,
    'execution_timeout_seconds' => 240,
    'run_timeout_seconds' => 90,
]);
```

L’action est remplacée : conservez donc sa classe de workflow et ses entrées
comme montré. Les exécutions déjà démarrées gardent leurs échéances initiales.
Définissez un champ de délai à `null` pour supprimer sa limite des démarrages suivants.

## Planification avancée {#advanced-scheduling}

Les sections suivantes couvrent les besoins allant au-delà du cron simple : intervalles fixes, mélange cron/intervalles et politiques de chevauchement. Passez-les si vous n’en avez pas besoin.

### Planifications par intervalle {#interval-based-schedules}

En plus de cron, les planifications prennent en charge les intervalles avec des durées ISO 8601. Utilisez `ScheduleManager::createFromSpec()` pour contrôler toute la spécification :

```php
use Workflow\V2\Support\ScheduleManager;

$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'health-check-30m',
    spec: [
        'intervals' => [
            ['every' => 'PT30M'],
        ],
    ],
    action: [
        'workflow_type' => 'health-check',
        'workflow_class' => HealthCheckWorkflow::class,
        'input' => ['region' => 'us-east-1'],
    ],
);
```

### Champs de spécification d’intervalle {#interval-spec-fields}

| Champ | Type | Description |
|---|---|---|
| `every` | `string` | Durée ISO 8601 (`PT30M` pour 30 minutes, `PT1H` pour 1 heure, `P1D` pour 1 jour) |
| `offset` | `string\|null` | Décalage de phase en durée ISO 8601, déplaçant le point d’alignement de l’intervalle |

Le décalage contrôle la position de déclenchement dans le cycle. Un intervalle horaire décalé de 5 minutes se déclenche à `:05`, `:05+1h`, etc. :

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'offset-hourly',
    spec: [
        'intervals' => [
            ['every' => 'PT1H', 'offset' => 'PT5M'],
        ],
    ],
    action: [
        'workflow_type' => 'sync-workflow',
        'workflow_class' => SyncWorkflow::class,
        'input' => [],
    ],
);
```

### Spécifications mixtes cron et intervalles {#mixed-cron-and-interval-specs}

Une planification peut combiner expressions cron et intervalles. Le moteur évalue toutes les spécifications et retient la prochaine échéance la plus proche :

```php
$schedule = ScheduleManager::createFromSpec(
    scheduleId: 'mixed-schedule',
    spec: [
        'cron_expressions' => ['0 12 * * *'],  // noon daily
        'intervals' => [['every' => 'PT6H']],  // every 6 hours
        'timezone' => 'America/Chicago',
    ],
    action: [
        'workflow_type' => 'report-workflow',
        'workflow_class' => ReportWorkflow::class,
        'input' => [],
    ],
);
```

La méthode `createFromSpec` accepte les mêmes paramètres de cycle de vie que `create()` (`overlapPolicy`, `jitterSeconds`, `maxRuns`, `connection`, `queue`, `namespace`, etc.) sous forme d’arguments nommés distincts.

## Politiques de chevauchement {#overlap-policies}

Si la planification se déclenche pendant que l’exécution précédente est active, la politique de chevauchement décide du comportement :

| Politique | Comportement |
|---|---|
| `Skip` | Ne pas démarrer de nouvelle exécution (par défaut) |
| `BufferOne` | Mettre un déclenchement en tampon, puis ignorer les suivants jusqu’à son vidage. Au prochain `tick()` après la fin de l’exécution active, le déclenchement en tampon s’exécute automatiquement. |
| `BufferAll` | Mettre tous les déclenchements en tampon sans plafond. Ils sont vidés séquentiellement à mesure que les exécutions précédentes se terminent. |
| `AllowAll` | Démarrer quelle que soit la situation de l’exécution précédente |
| `CancelOther` | Annuler l’exécution précédente, puis démarrer la nouvelle |
| `TerminateOther` | Arrêter de force l’exécution précédente, puis démarrer la nouvelle |

## Gérer les planifications {#managing-schedules}

### Suspendre et reprendre {#pause-and-resume}

```php
ScheduleManager::pause($schedule);

// The schedule will not trigger while paused.

ScheduleManager::resume($schedule);
// next_fire_at is recalculated from now.
```

### Modifier {#update}

```php
ScheduleManager::update(
    $schedule,
    cronExpression: '30 3 * * *',
    timezone: 'America/Chicago',
    overlapPolicy: ScheduleOverlapPolicy::AllowAll,
    notes: 'Moved to 3:30 AM CT.',
);
```

Modifier l’expression cron ou le fuseau horaire recalcule `next_fire_at`.

### Supprimer {#delete}

```php
ScheduleManager::delete($schedule);
```

La suppression est logique : la ligne reste avec le statut `deleted` et un horodatage `deleted_at`. Une planification supprimée ne peut être suspendue, reprise, modifiée ou déclenchée.

### Décrire {#describe}

```php
$description = ScheduleManager::describe($schedule);

$description->scheduleId;      // 'daily-invoice-sync'
$description->namespace;       // 'default'
$description->status;          // ScheduleStatus::Active
$description->spec;            // ['cron_expressions' => ['0 2 * * *'], 'timezone' => 'America/New_York']
$description->overlapPolicy;   // ScheduleOverlapPolicy::Skip
$description->firesCount;      // 47
$description->nextFireAt;      // DateTimeInterface|null
$description->lastFiredAt;     // DateTimeInterface|null
$description->latestInstanceId; // 'schedule:daily-invoice-sync:...'
$description->jitterSeconds;   // 0
$description->note;            // 'Runs every night at 2 AM ET.'
$description->toArray();       // full array representation
```

### Trouver par identifiant {#find-by-schedule-id}

```php
$schedule = ScheduleManager::findByScheduleId('daily-invoice-sync');
```

## Déclencher les planifications {#triggering-schedules}

### Déclenchement manuel {#manual-trigger}

```php
$instanceId = ScheduleManager::trigger($schedule);
```

Cette opération évalue immédiatement la politique de chevauchement et démarre une exécution si elle l’autorise. Elle renvoie l’identifiant d’instance démarrée, ou `null` si le déclenchement est ignoré.

### Passage d’évaluation des échéances {#tick-evaluate-all-due-schedules}

```php
$results = ScheduleManager::tick();

// Returns rows with schedule_id, instance_id, outcome, occurrence_time,
// last_fired_at, and next_fire_at when those fields apply.
```

`tick()` trouve les planifications actives dont `next_fire_at` est passé et les déclenche dans l’ordre. `occurrence_time` est l’échéance observée. Après chaque déclenchement, `next_fire_at` avance depuis l’heure courante jusqu’à la prochaine occurrence cron ou d’intervalle.

### Politique des échéances manquées {#missed-fire-policy}

L’évaluation en direct applique **un déclenchement, puis reprise**. Si le planificateur est arrêté pendant une ou plusieurs échéances nominales, le premier passage après récupération démarre un workflow pour le `next_fire_at` en retard, enregistre cette échéance comme `occurrence_time`, puis avance `next_fire_at` depuis l’heure courante. Les autres occurrences nominales passées pendant l’arrêt sont ignorées par l’évaluation en direct.

Utilisez `backfill()` si chaque occurrence manquée doit s’exécuter. Le rattrapage énumère explicitement la fenêtre demandée et enregistre chaque occurrence séparément.

### Commande Artisan {#artisan-command}

Exécutez un seul passage en ligne de commande :

```bash
php artisan workflow:v2:schedule-tick
php artisan workflow:v2:schedule-tick --json
```

Le serveur autonome expose le même passage avec sa propre commande :

```bash
php artisan schedule:evaluate --limit=100
```

Pour évaluer les planifications en continu, appelez cette commande depuis le planificateur Laravel :

```php
// app/Console/Kernel.php
$schedule->command('workflow:v2:schedule-tick')->everyMinute();
```

## Nombre maximal d’exécutions {#max-runs}

Si `maxRuns` est défini, la planification suit `remaining_actions`. Après le dernier déclenchement autorisé, elle est automatiquement supprimée logiquement.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'one-shot-retry',
    workflowClass: RetryWorkflow::class,
    cronExpression: '*/5 * * * *',
    maxRuns: 3,
);

// After 3 triggers, the schedule status becomes 'deleted'.
```

## Rattrapage {#backfill}

Le rattrapage déclenche les occurrences cron passées manquées, par exemple après une suspension, une panne de déploiement ou une création tardive :

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
);

// Returns: [['schedule_id' => '...', 'instance_id' => '...|null', 'cron_time' => '...'], ...]
```

Chaque occurrence manquée est déclenchée séquentiellement. La politique de chevauchement s’applique, sauf que **les politiques de tampon (`BufferOne`, `BufferAll`) deviennent `AllowAll` pendant le rattrapage**. Le tampon contrôle le flux en temps réel et n’a pas de sens pour le rattrapage, qui doit lancer chaque occurrence plutôt que remplir un tampon qui ne serait jamais vidé. Vous pouvez aussi remplacer explicitement la politique :

```php
$results = ScheduleManager::backfill(
    $schedule,
    from: new DateTimeImmutable('2026-04-10 00:00:00'),
    to: new DateTimeImmutable('2026-04-14 00:00:00'),
    overlapPolicyOverride: ScheduleOverlapPolicy::AllowAll,
);
```

Le rattrapage respecte `maxRuns`. Si les actions restantes s’épuisent pendant l’opération, elle s’arrête et la planification est supprimée automatiquement.

Les identifiants d’instance du rattrapage sont déterministes : `schedule:{scheduleId}:backfill:{timestamp}`.

## Routage par file {#queue-routing}

Si `connection` ou `queue` est défini, les workflows déclenchés utilisent ce routage plutôt que la valeur par défaut de leur classe :

```php
$schedule = ScheduleManager::create(
    scheduleId: 'priority-sync',
    workflowClass: InvoiceSyncWorkflow::class,
    cronExpression: '0 * * * *',
    connection: 'redis',
    queue: 'high-priority',
);

// Every triggered run dispatches to redis/high-priority,
// regardless of InvoiceSyncWorkflow's default routing.
```

L’ordre de priorité est : champs de planification → valeurs par défaut de la classe → configuration globale des files.

## Décalage aléatoire {#jitter}

Des planifications de même expression cron se déclenchent au même instant et créent un pic simultané. `jitterSeconds` répartit les déclenchements dans une fenêtre aléatoire pour lisser la charge.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'hourly-report',
    workflowClass: ReportWorkflow::class,
    cronExpression: '0 * * * *',
    jitterSeconds: 300, // fire within 0–300 seconds after the top of the hour
);
```

Si `jitterSeconds` est défini, chaque `next_fire_at` calculé est décalé d’une valeur aléatoire entre 0 et `jitterSeconds` inclus. Le tirage est renouvelé à chaque calcul de la prochaine échéance, après un déclenchement, une reprise ou une modification.

Le décalage ne concerne que l’échéance d’évaluation stockée en base. Le rattrapage utilise toujours les heures cron canoniques sans décalage pour respecter les limites exactes des occurrences.

Définir `jitterSeconds` à `0` (par défaut) désactive tout décalage. Les échéances correspondent exactement à cron.

## Types d’événements d’historique {#history-event-types}

Le cycle de vie des planifications est enregistré dans deux flux distincts :

- **Filiation d’exécution.** Lorsqu’une planification déclenche un workflow,
  un événement `ScheduleTriggered` est ajouté à l’historique de l’exécution
  (`workflow_history_events`), fournissant un lien vérifiable vers la
  planification qui l’a démarrée.
- **Flux d’audit de planification.** Chaque transition est enregistrée dans
  son journal d’audit (`workflow_schedule_history_events`) avec un champ
  `sequence` strictement croissant. Ce flux fait autorité sur ce qui est
  arrivé à la planification ; l’historique d’exécution fait autorité sur
  la raison de son démarrage.

Les deux flux utilisent la même énumération `HistoryEventType` et le même
registre de clés `HistoryEventPayloadContract`. Les noms d’événements et
structures de données restent donc synchronisés.

### Événement de filiation sur l’exécution démarrée {#run-lineage-event-on-the-started-workflow-run}

`ScheduleTriggered` est ajouté à l’historique du workflow déclenché avec les
clés suivantes :

- `schedule_id` : identifiant visible de la planification.
- `schedule_ulid` : clé primaire ULID interne.
- `cron_expression`, `timezone`, `overlap_policy` : expression cron principale,
  fuseau IANA et politique de chevauchement active au déclenchement.
- `trigger_number` : numéro du déclenchement, commençant à 1.
- `occurrence_time` : échéance évaluée par le planificateur. Les déclenchements
  par passage enregistrent le `next_fire_at` dû ; ceux du rattrapage enregistrent
  l’occurrence énumérée. Si le décalage aléatoire est activé, la valeur des
  passages inclut l’échéance décalée stockée sur la planification.

### Flux d’audit sur la planification {#schedule-audit-stream-on-the-schedule-itself}

Chaque transition est enregistrée dans le flux d’audit propre à la planification.
Les séquences commencent à `1` pour `ScheduleCreated` et augmentent de façon
monotone par planification.

| Événement | Moment d’enregistrement | Clés des données |
| --- | --- | --- |
| `ScheduleCreated` | Création de la planification | `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `SchedulePaused` | Suspension | `reason`, `paused_at`, `command_context` |
| `ScheduleResumed` | Reprise | `next_fire_at`, `command_context` |
| `ScheduleUpdated` | Modification du cron, fuseau, spécification, action ou politique | `changed_fields`, `spec`, `action`, `overlap_policy`, `next_fire_at`, `command_context` |
| `ScheduleTriggered` | Démarrage d’un workflow depuis la planification | `workflow_instance_id`, `workflow_run_id`, `outcome`, `effective_overlap_policy`, `trigger_number`, `occurrence_time`, `command_context` |
| `ScheduleTriggerSkipped` | Déclenchement ignoré pour chevauchement, statut non déclenchable ou actions épuisées | `reason`, `skipped_trigger_count`, `last_skipped_at`, `command_context` |
| `ScheduleDeleted` | Suppression logique explicite ou après épuisement de `max_runs` (`reason: max_runs_exhausted`) | `reason`, `deleted_at`, `command_context` |

`command_context` porte le principal, l’identifiant de requête, la source et
la raison enregistrés par `ScheduleManager` si l’appelant passe un
`CommandContext`. Ce champ est facultatif : sans contexte, la clé est omise
plutôt que d’écrire une valeur vide.

### Stabilité du contrat des données {#payload-contract-stability}

Les clés des deux tableaux sont déclarées dans
`Workflow\V2\Support\HistoryEventPayloadContract`, vérifiées à chaque écriture
et fixées par les tests du package workflow. Ajouter une clé à un événement
de planification change le format réseau et suit les règles de modification
des événements d’historique du
[contrat de compatibilité des versions](../compatibility.md).

### Rétention {#retention}

Le flux d’audit est conservé pendant la vie de la ligne de planification.
La suppression est logique et écrit un dernier `ScheduleDeleted`. Les lignes
d’audit ne sont pas supprimées en cascade lors du retrait d’une planification.
Les opérateurs purgeant les anciennes planifications doivent choisir une
stratégie explicite de rétention. Le package ne fournit pas de durée de vie
automatique pour les événements d’audit.

### Visibilité {#visibility}

Le flux d’audit est exposé par chaque interface opérateur :

- **Dans le processus (Eloquent).** `WorkflowSchedule::historyEvents()`
  (résolu via `ConfiguredV2Models::query(
  'schedule_history_event_model', ...)`) renvoie le flux d’une planification
  depuis l’application hôte.
- **HTTP Waterline.**
  `GET /waterline/api/v2/schedules/{scheduleId}/history` renvoie le flux avec
  pagination par curseur `limit` (1 à 500, 100 par défaut) et `after_sequence`.
  La réponse est limitée à l’espace de noms Waterline : chaque locataire ne voit
  que ses lignes d’audit.
- **Interface Waterline.** L’action **Historique** de chaque ligne du registre
  ouvre une fenêtre affichant le flux. Les événements montrent séquence,
  horodatage enregistré, type, identifiants liés d’instance et d’exécution,
  ainsi que les données formatées. **Charger plus** avance le curseur par lots de 100.
- **HTTP du serveur autonome.**
  `GET /api/schedules/{scheduleId}/history` renvoie le même flux, le même contrat
  de pagination et les mêmes règles de portée `X-Namespace`. L’historique reste
  disponible après suppression logique pour reconstruire une planification retirée.
- **CLI.** `dw schedule:history <schedule-id>` affiche le flux en tableau
  (`Seq`, `Event`, `Recorded At`, `Workflow Refs`) avec l’indication
  **D’autres événements sont disponibles** si `has_more` vaut true. `--limit` et
  `--after-sequence` sont transmis au serveur, `--all` parcourt tous les
  événements restants et `--output=json` / `--output=jsonl` produisent des
  sorties structurées (`jsonl` omet l’enveloppe de curseur : chaque ligne est
  un événement autonome).
- **SDK Python.** `Client.get_schedule_history(schedule_id, *, limit=None,
  after_sequence=None)` renvoie une `ScheduleHistoryPage`, et
  `Client.iter_schedule_history(schedule_id, *, limit=None, after_sequence=None)`
  est un `AsyncIterator[ScheduleHistoryEvent]` parcourant tout le flux avec les
  mêmes arguments nommés. `ScheduleHandle` expose les méthodes de commodité
  correspondantes `.history(...)` et `.iter_history(...)`. `limit` est borné
  côté serveur entre 1 et 500 (100 par défaut) et `after_sequence` est un curseur
  positif ou nul issu du `next_cursor` de la page précédente.

Toutes ces interfaces lisent la même table `workflow_schedule_history_events`.
Le contrat décrit dans [Stabilité du contrat des données](#payload-contract-stability)
s’applique quelle que soit l’interface utilisée.

### Migration des planifications antérieures à l’audit {#migration-behavior-for-pre-audit-schedules}

Le flux d’audit a été introduit avec la table `workflow_schedule_history_events`.
Les planifications créées avant cette migration n’ont pas d’événement rétroactif
`ScheduleCreated`. `ScheduleManager` n’enregistre l’audit qu’au moment des
transitions. La migration ne génère pas d’événement de rattrapage pour les
planifications existantes.

Conséquences pour les opérateurs :

- Le flux d’une planification existante est vide jusqu’à sa prochaine transition.
  Suspension, reprise, modification, déclenchement, déclenchement ignoré ou
  suppression ajoutent ensuite des événements normalement.
- Les séquences commencent toujours à `1` et augmentent par planification.
  Si le premier événement d’une ancienne planification est `SchedulePaused`,
  il aura `sequence = 1`. L’absence de `ScheduleCreated` antérieur est attendue.
- `ScheduleTriggered` et `ScheduleTriggerSkipped` sont écrits à chaque passage
  évaluant la planification. Les planifications cron accumulent donc des lignes
  d’audit après migration sans intervention.
- Aucune action opérateur n’est requise pour activer l’audit. Il est toujours
  actif, mais reste sans ligne jusqu’au premier événement après migration.

## Suivi des déclenchements ignorés {#skip-tracking}

Lorsqu’un déclenchement est ignoré pour chevauchement, statut non déclenchable ou actions épuisées, la planification le suit :

- `last_skip_reason` : raison du dernier déclenchement ignoré (`overlap_policy_skip`, `status_not_triggerable`, `remaining_actions_exhausted`, par exemple)
- `last_skipped_at` : moment où il a été ignoré
- `skipped_trigger_count` : nombre cumulé de déclenchements ignorés

Ces champs figurent dans `ScheduleManager::describe()` et l’API de détails des planifications Waterline.

## Portée par espace de noms {#namespace-scoping}

Les planifications appartiennent à un espace de noms. Si `namespace` est passé à `create()` ou `createFromSpec()`, elles sont limitées à cet espace. Sinon, elles héritent du `workflows.v2.namespace` configuré (`'default'` par défaut).

Les identifiants sont uniques dans un espace de noms : un même `scheduleId` peut exister dans plusieurs espaces sans conflit.

Le lanceur PHP standard transmet l’espace de noms stocké à l’instance,
l’exécution et aux tâches durables. Un changement ultérieur de l’espace de noms
par défaut de l’application ne déplace pas les exécutions d’une planification
existante. Utilisez Workflow 2.4.2 ou ultérieur pour cette propagation.

```php
$schedule = ScheduleManager::create(
    scheduleId: 'daily-sync',
    workflowClass: SyncWorkflow::class,
    cronExpression: '0 2 * * *',
    namespace: 'billing',
);

// Find by schedule ID within a namespace:
$found = ScheduleManager::findByScheduleId('daily-sync', namespace: 'billing');
```

Si Waterline est configuré avec un espace de noms (`waterline.namespace`), les listes et points de terminaison de détails se limitent automatiquement à cet espace. Les déploiements multilocataires n’affichent donc que les planifications de l’espace de l’opérateur.

## Base de données {#database}

La table `workflow_schedules` est créée par la migration `2026_04_14_000157`. La classe de modèle se configure via `workflows.v2.schedule_model`.

Si votre déploiement exécute les migrations du package avec celles de l’application, la migration 157 détecte une table `workflow_schedules` existante : elle la conserve si son schéma correspond déjà au package, et la remplace si une ancienne migration de compatibilité l’a créée avec un autre schéma.
