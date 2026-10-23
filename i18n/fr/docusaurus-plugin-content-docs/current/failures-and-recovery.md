---
sidebar_position: 11
title: Échecs et reprise
description: Diagnostiquer les échecs d’activité, les exceptions non réessayables, les délais d’exécution, le nettoyage d’annulation et les actions de reprise.
tags:
  - failures
  - recovery
  - operations
keywords:
  - échecs de workflow
  - exception non réessayable
  - reprise de workflow
---

# Échecs et reprise {#failures-and-recovery}

Avant d’analyser un échec, gardez à l’esprit le contrat d’exécution :

- les tâches de workflow reprennent en relisant l’historique validé
- les activités s’exécutent au moins une fois et peuvent être observées
  plusieurs fois
- l’expiration d’un bail et la redistribution sont des mécanismes normaux de
  reprise. Elles ne prouvent pas que le worker précédent n’a jamais produit
  l’effet externe

Consultez les
[garanties d’exécution et l’idempotence](./constraints/execution-guarantees.md)
pour connaître les règles précises des nouvelles tentatives, de la
redistribution et des résultats durables.

## Gérer les exceptions {#handling-exceptions}

`Workflow\V2\Activity` utilise `$tries = 1` par défaut : une seule tentative, sans nouvel essai automatique après une exception. Le premier échec de l’activité est transmis au workflow. Son code peut intercepter l’exception, comme ci-dessous ; sinon, l’exécution échoue et devient terminale.

Les nouvelles tentatives sont facultatives et doivent être configurées. Définissez `$tries` au-dessus de `1` pour en autoriser plusieurs, ou à `0` pour un nombre illimité, et choisissez une politique `backoff()`. Un échec réessayable est transmis au code du workflow seulement après épuisement du budget configuré de tentatives ou de temps. Un échec non réessayable ignore les tentatives restantes.

```php
use Exception;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public int $tries = 1;

    public function handle(): void
    {
        throw new Exception();
    }
}
```

```php
use Exception;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        try {
            $result = activity(MyActivity::class);
        } catch (Exception) {
            // handle the exception here
        }
    }
}
```

## Exceptions non réessayables {#non-retryable-exceptions}

Certaines exceptions ne doivent pas déclencher de nouvelle tentative.
Lorsqu’une activité lève une exception non réessayable, le workflow marque
immédiatement l’activité comme ayant échoué et cesse de la réessayer.

```php
use Workflow\V2\Activity;
use Workflow\Exceptions\NonRetryableException;

class MyNonRetryableActivity extends Activity
{
    public function handle(): void
    {
        throw new NonRetryableException('This is a non-retryable error');
    }
}
```

## Procédure de reprise {#recovery-process}

Consultez d’abord l’état durable de l’exécution sélectionnée et la politique de nouvelles tentatives de l’activité. Avec l’unique tentative par défaut, un échec d’activité non géré a déjà rendu l’exécution terminale. Déployer une correction ou appeler `repair()` ne rouvre pas cette exécution échouée.

Corriger le code pendant que l’exécution d’origine attend n’est possible que si l’activité dispose encore d’une tentative admissible. Configurez `$tries` au-dessus de `1`, ou à `0` pour un nombre illimité, avec `backoff()` avant de planifier l’activité. Vous pouvez définir `ActivityOptions::$scheduleToCloseTimeout` pour borner la durée totale de l’activité, toutes tentatives comprises ; les échéances du workflow restent applicables. Consultez [Nouvelles tentatives](./configuration/options.md#retries), [Délai entre tentatives](./configuration/options.md#backoff) et [ActivityOptions](./configuration/options.md#activityoptions). La politique est figée lors de la planification ; un déploiement ultérieur n’étend pas les budgets de tentatives ou de temps d’une activité existante.

Pour une exécution qui attend encore une activité réessayable :

1. Consultez ses logs et recherchez les erreurs ou exceptions.
2. Identifiez la cause et corrigez le code.
3. Déployez la correction là où tournent les workers de la file.
4. Redémarrez ou remplacez progressivement les workers concernés afin qu’ils chargent le nouveau code et reprennent les tâches en sécurité.
5. Laissez un worker sain exécuter la prochaine tentative admissible. Réparation et redistribution peuvent rétablir un transport de tâches perdu ; elles n’accordent pas une tentative métier supplémentaire après la clôture de l’activité ou de l’exécution.
6. Vérifiez le résultat durable dans Waterline, l’export d’historique ou l’API Server. Une ligne de log d’un worker ne fait pas autorité.
7. Si l’activité échoue encore, vérifiez les budgets de tentatives et de temps restants avant de répéter la procédure.

Une exécution disposant d’une tentative d’activité admissible reste en attente et peut continuer après le succès du code corrigé, si ses budgets d’origine n’ont pas expiré. Cela ne garantit pas de corriger tout workflow sur place : un échec final d’activité non géré, un échec du code du workflow, une limite structurelle ou un délai de workflow dépassé peuvent rendre l’exécution terminale.

Pour une exécution échouée terminale, conservez son historique et rapprochez les effets externes avant de décider si l’application doit lancer un nouveau workflow. Rendez les opérations métier répétées idempotentes dans l’application. Il n’y a ni nouvelle tentative automatique de tout le workflow ni réouverture d’une exécution terminale ; consultez [Nouvelles tentatives au niveau du workflow](#workflow-level-retry).

## Refus à l’entrée en mode service et récupération {#service-entry-recovery}

**Prise en charge publiée.** Server 2.9.9 et les SDK PHP 2.5.4, Python 2.6.2 et Rust 3.5.6 ont introduit les protections d’entrée et le comportement de routage et de récupération décrits ci-dessous. Ce sont les versions minimales pour ces fonctions. Installez les versions stables actuelles pour bénéficier des correctifs de sécurité.

Une incompatibilité à l’entrée est un refus de déploiement ou de relecture, avant l’exécution du code applicatif du workflow. Ce n’est ni une nouvelle tentative d’activité ni un échec métier terminal. Le worker signale `failure_reason = workflow_entry_arguments_mismatch`, et le Server conserve la tâche de workflow en échec avec `replay_blocked = true` au lieu de créer automatiquement une autre tentative. Son `replay_blocked_reason` générique est `worker_reported_replay_failure`. L’exécution reste non terminale et conserve son entrée enregistrée, son historique et ses échéances. Ce cas diffère d’une exception levée après l’entrée réussie dans le corps du workflow, qui peut toujours faire échouer l’exécution.

Ne procédez à la récupération qu’après avoir vérifié l’état durable réel :

1. Inspectez l’exécution sélectionnée avec `GET /api/workflows/{workflowId}/runs/{runId}/debug`. Confirmez que `latest_workflow_task_failure.reason` vaut `workflow_entry_arguments_mismatch` et que l’exécution d’origine est toujours ouverte. Cette procédure ne rouvre pas une exécution terminale.
2. Déployez du code acceptant les arguments positionnels ou l’entrée typée enregistrés. Préservez les identifiants de workflow et d’exécution, le namespace, la file, la compatibilité du build, l’historique et les échéances d’origine. Ne modifiez jamais l’entrée stockée et ne la remplacez pas par des valeurs par défaut de DTO.
3. Confirmez la disponibilité d’un worker éligible à l’aide du [routage des définitions](./polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution). La réparation ne crée pas de worker et ne prouve pas la compatibilité de relecture.
4. Utilisez `POST /api/workflows/{workflowId}/runs/{runId}/repair` avec les identifiants opérateur autorisés et le namespace habituels. La route ciblant une exécution refuse une cible historique au lieu de réparer silencieusement une exécution plus récente. PHP expose aussi `Client::repairWorkflow($workflowId, $runId)` ; `repair_workflow(workflow_id)` en Python cible l’instance actuelle, et Rust n’a pas de méthode de commodité équivalente pour la réparation.
5. Vérifiez que la même exécution d’origine reprend avec son entrée enregistrée et son préfixe d’historique, puis enregistre une seule fois le résultat attendu. L’échéance d’origine reste applicable même si elle est déjà dépassée. Si le remplacement reste incompatible, inspectez le nouveau refus au lieu de répéter les demandes de réparation.

Les anciennes versions de Server peuvent stocker le motif spécifique du SDK sans le classer comme blocage de relecture. Le seul signalement de l’échec ne garantit donc pas l’absence de nouvelle tentative automatique. Utilisez la combinaison qualifiée de runtime et de SDK. Consultez [Versioning](./features/versioning.md#service-sdk-entry-safeguard) pour les limites propres à chaque langage et [Commandes de workflow](./polyglot/server-api-reference.md#workflow-commands) pour les routes authentifiées ciblant une exécution.

## Application des délais des workflows {#workflow-timeout-enforcement}

Avec `StartOptions::withExecutionTimeout()` ou
`StartOptions::withRunTimeout()`, le moteur enregistre une échéance sur
l’exécution. Le délai d’exécution logique couvre tout le workflow, y compris
les exécutions créées par continue-as-new. Le délai d’une exécution se
réinitialise à chaque nouvelle exécution.

Si l’échéance est dépassée au démarrage d’une tâche de workflow, l’exécution
est immédiatement fermée :

- Toutes les exécutions d’activité ouvertes, les temporisateurs et les tâches
  en attente sont annulés avec des événements d’historique typés
  (`ActivityCancelled`, `TimerCancelled`).
- Une ligne `WorkflowFailure` est enregistrée avec
  `failure_category = timeout` et `propagation_kind = timeout`.
- Un événement `WorkflowTimedOut` est enregistré avec `timeout_kind`
  égal à `execution_timeout` ou `run_timeout`.
- L’état devient `failed` avec `closed_reason = timed_out`.
- Les workflows parents qui attendent cet enfant sont informés.

Le watchdog des tâches recherche aussi les exécutions non terminales dont
l’échéance est dépassée et qui n’ont aucune tâche de workflow ouverte.
C’est notamment le cas d’une exécution qui attend une activité ou un
temporisateur. Il crée alors une tâche de workflow pour que l’exécuteur
détecte et applique le délai au passage suivant.

Waterline affiche `failure_category` dans une colonne **Catégorie** du
tableau des exceptions et dans les détails des échecs de la chronologie.
L’export d’historique inclut ce champ dans `failures[*]`.
La version v2 finale écrit cette classification au moment de l’échec.
Les lignes v1 importées qui ne peuvent pas être classées restent visibles
comme diagnostics non classés.

## Nouvelles tentatives d’activité {#activity-retries}

Pour un budget de tentatives partagé entre workflows et files, combinez les limites de réessai avec [l’admission Server et un breaker applicatif](./polyglot/task-queue-admission.md#retry-load-and-downstream-budgets). Premiers essais et réessais comptent ; l’exécution locale/embarquée a d’autres limites.

`Workflow\V2\Activity` utilise `$tries = 1` par défaut.
Un échec est donc transmis immédiatement au workflow, sauf si l’activité
autorise davantage de tentatives.

```php
use RuntimeException;
use Workflow\V2\Activity;

class ChargeCard extends Activity
{
    public int $tries = 3;

    public function backoff(): array
    {
        return [5, 30];
    }

    public function handle(): string
    {
        throw new RuntimeException('temporary gateway failure');
    }
}
```

Dans le code du workflow, bornez la durée totale de l’activité, y compris les attentes en file et entre les tentatives :

```php
use Workflow\V2\Support\ActivityOptions;
use function Workflow\V2\activity;

$result = activity(ChargeCard::class, new ActivityOptions(
    scheduleToCloseTimeout: 120,
));
```

Ces réglages autorisent au maximum trois tentatives, avec des pauses de 5 et 30 secondes, dans le délai schedule-to-close initial de 120 secondes. Une échéance du workflow plus proche reste applicable. N’activez les nouvelles tentatives que pour les opérations pouvant être répétées sans danger et protégez les effets externes par des mécanismes d’idempotence.

Lorsqu’une activité réessayable lève une exception avant d’avoir épuisé
`$tries`, le moteur ferme la ligne `activity_attempts` courante dans
l’état du runtime, remet la ligne `activity_executions` à `pending`,
enregistre un événement typé `ActivityRetryScheduled` pour la tentative
échouée et crée une nouvelle tâche durable. Son `available_at` est défini
par la politique `backoff()`. Le workflow continue d’attendre la même
exécution d’activité. Il ne reçoit l’exception qu’après l’échec de la
dernière tentative réessayable.

La tâche de nouvelle tentative contient `retry_of_task_id`,
`retry_after_attempt_id`, `retry_after_attempt` et
`retry_backoff_seconds` pour que Waterline explique sa planification.
Les détails de l’exécution sélectionnée reconstruisent d’abord les tentatives
échouées dans `activities[*].attempts` depuis l’historique typé des
activités. Ils affichent `ActivityRetryScheduled` dans la chronologie.
Les métriques exposent les activités en cours de nouvelle tentative via
`operator_metrics.activities.retrying`,
`operator_metrics.activities.failed_attempts` et
`operator_metrics.backlog.retrying_activities`.

`Workflow\Exceptions\NonRetryableExceptionContract` court-circuite
toujours cette politique : une exception non réessayable fait immédiatement
échouer l’exécution d’activité et reprend le workflow avec l’exception.

### Résolution du délai entre tentatives {#retry-delay-resolution}

Les valeurs de `backoff()` d’une activité sont des secondes entières. Les
intervalles de nouvelle tentative durables ont une résolution d’une seconde.
N’utilisez pas une fraction comme `0.1` pour demander une nouvelle tentative après
100 ms. Les API des SDK qui génèrent des intervalles à partir de valeurs
fractionnaires les arrondissent à la seconde entière supérieure. Les références
des SDK Python et Rust précisent les types de paramètres acceptés et leurs conversions.

Une nouvelle tentative peut commencer une fois le délai écoulé, mais la latence
de la file et la charge des workers peuvent la retarder davantage. Pour des tests
rapides, utilisez [une horloge contrôlée ou des cas bornés sans délai](./testing.md#keeping-delay-tests-fast).

### Identité de l’exécution d’activité et idempotence {#activity-execution-identity-and-idempotency}

Les nouvelles tentatives ne sont pas la seule raison d’observer plusieurs
fois la même activité logique. L’expiration du bail, la perte d’un worker,
un compte rendu tardif et la redistribution peuvent produire une autre
tentative ou un compte rendu périmé pour la même exécution durable.

- `activity_execution_id` identifie l’activité logique à travers les
  nouvelles tentatives et les redistributions. Utilisez-le comme clé
  d’idempotence par défaut pour les effets externes distants.
- `activity_attempt_id` identifie une tentative précise. Utilisez-le
  uniquement si un système externe doit distinguer les tentatives.
- Un compte rendu tardif de réussite ou d’échec provenant d’une tentative
  remplacée est un comportement normal de tentative périmée. Il ne prouve
  pas que le moteur a validé deux fois cette tentative.

Lors de l’analyse d’une terminaison tardive après expiration du bail :

- consultez Waterline, l’export d’historique ou l’API Server pour savoir quelle
  tentative a remporté la validation durable
- ne supposez pas qu’un compte rendu tardif rejeté signifie que l’effet
  externe n’a pas eu lieu
- vérifiez le système externe par sa clé d’idempotence avant de forcer une
  nouvelle tentative ou une réparation manuelle

Le choix le plus sûr consiste à rendre l’effet externe idempotent avec
`activity_execution_id`, puis à consulter le résultat durable pour savoir
si le moteur a accepté le compte rendu de cette tentative précise.

### Marqueurs d’échec non réessayable {#non-retryable-failure-markers}

Lorsqu’une activité ou un workflow lève une exception qui implémente
`Workflow\Exceptions\NonRetryableExceptionContract`, le moteur écrit
`non_retryable = true` dans la ligne `WorkflowFailure` et dans les
données de l’événement typé
(`ActivityFailed`, `WorkflowFailed`, `UpdateCompleted`).
Ce marqueur durable indique aux opérateurs, workers externes et outils que
l’échec est permanent. Réessayer la même opération ne permettra pas de réussir.

Le marqueur est présent dans toutes les interfaces de visibilité :

- **Lignes d’échec :** colonne booléenne
  `workflow_failures.non_retryable`.
- **Événements d’historique :** champ `non_retryable` dans les données
  de l’événement typé.
- **Instantanés des échecs :** `non_retryable` dans
  `FailureSnapshots::forRun()`.
- **Détails d’exécution :** `non_retryable` dans le tableau des exceptions.
- **Chronologie :** `non_retryable` dans les métadonnées des échecs.
- **Exports d’historique :** `non_retryable` dans `failures[*]`.
- **Waterline :** badge « non réessayable » à côté de la catégorie dans le
  tableau des exceptions et la chronologie.
- **Pont des workers externes :** les données de la commande `complete()`
  acceptent `non_retryable`. Les workers de workflow externes peuvent
  signaler ces échecs sans que le processus hôte ait à résoudre la classe
  de l’exception.

Pour les exceptions qui n’implémentent pas ce contrat, `non_retryable`
vaut `false` par défaut. La version v2 finale écrit le marqueur au moment
de l’échec. Déclarez donc le contrat avant l’écriture de l’échec lorsque les
opérateurs ou les SDK doivent distinguer les échecs permanents de ceux qui
peuvent être réessayés.

```php
use Workflow\Exceptions\NonRetryableExceptionContract;

class PaymentDeclinedException extends \RuntimeException implements NonRetryableExceptionContract
{
    // This failure will be marked as non-retryable in the durable record.
}
```

## Nouvelles tentatives au niveau du workflow {#workflow-level-retry}

Durable Workflow v2 ne prend **pas** en charge les nouvelles tentatives
automatiques au niveau du workflow. Lorsqu’une exécution échoue à cause d’une
exception non gérée, d’une limite structurelle ou d’un délai dépassé, elle est
terminale. Le moteur ne démarre pas automatiquement une nouvelle exécution
de la même instance de workflow.

Ce choix est délibéré :

- **Les activités ont déjà leurs politiques de nouvelles tentatives.**
  `$tries`, `backoff()` et les exceptions non réessayables traitent les
  échecs transitoires à la bonne granularité.
- **La relecture est le mécanisme de reprise du workflow.** Une erreur
  d’infrastructure transitoire, comme une erreur de base de données ou un
  crash de worker, entraîne la redistribution de la tâche durable.
  La relecture reprend depuis l’historique validé sans nouvelle exécution.
- **Continue-as-new convient aux workflows de longue durée.** Ceux qui ont
  besoin d’un état neuf ou d’une réduction de l’historique utilisent
  explicitement `continueAsNew()`.
- **La réparation reprend les exécutions bloquées.** La commande `repair()`
  et la réparation automatique dans la boucle des workers reprennent les
  exécutions dont le transport des tâches durables a été perdu.

Si votre application a besoin de nouvelles tentatives au niveau du workflow,
modélisez-les explicitement :

```php
use function Workflow\V2\activity;
use Throwable;
use Workflow\V2\Workflow;

class RetryableWorkflow extends Workflow
{
    public function handle(string $orderId): void
    {
        try {
            activity(ProcessOrderActivity::class, $orderId);
        } catch (Throwable $e) {
            // Record the failure, then start a new workflow
            // for retry-at-workflow-level scenarios.
            activity(NotifyFailureActivity::class, $orderId, $e->getMessage());
        }
    }
}
```

## Limites des rapports d’échec PHP en mode service {#php-failure-report-limits}

Le SDK PHP **3.5.0 ou ultérieur** borne les rapports d’échec sortants en mode service à des messages UTF-8 de 62 KiB, des piles de 128 KiB, 64 KiB de métadonnées facultatives combinées et un corps complet encodé de 1 MiB, marqueurs compris. Les limites de transport connues plus basses s’appliquent. Le [guide des rapports PHP](./polyglot/php.md#bounded-failure-reports) explique la configuration, les diagnostics d’omission, la sémantique de nouvelle tentative conservée et l’égalité entre première exécution locale et relecture à froid. Ces limites concernent les rapports du SDK. L’enregistrement embarqué et le stockage des résumés du Core gardent leurs contrats distincts.

## Limites des rapports d’échec Python en mode service {#python-failure-report-limits}

Le SDK Python **2.11.0 ou ultérieur** borne les rapports d’échec sortants en mode service à des messages UTF-8 de 62 KiB, des piles de 128 KiB, 64 KiB de métadonnées facultatives combinées et un corps complet encodé de 1 MiB, marqueurs compris. Les limites de transport connues plus basses s’appliquent. Le [guide des rapports Python](./polyglot/python.md#bounded-failure-reports) explique la configuration, les diagnostics d’omission, la sémantique de nouvelle tentative conservée et l’égalité entre première exécution locale et relecture à froid. Ces limites concernent les rapports du SDK. L’enregistrement embarqué et le stockage des résumés du Core gardent leurs contrats distincts.

## Limites des rapports d’échec Rust en mode service {#rust-failure-report-limits}

Pour les workers de service exécutant réellement Rust SDK **4.10.1 ou ultérieur**, le message sortant atteint au plus 62 KiB UTF-8 avec marqueur, le stack 128 KiB si pris en charge, les métadonnées facultatives sérialisées combinées 64 KiB et le corps encodé complet 1 MiB ou une limite de transport connue plus basse. Type, retry et identité restent intacts ; une enveloppe obligatoire impossible est refusée. Le [guide Rust](./polyglot/rust.md#bounded-failure-reports) explique marqueurs, details Avro entiers et résultats locaux. Cela ne qualifie pas anciens SDK, mode embedded ou correction séparée du stockage des résumés Core.

## Guides associés {#related-guides}

- Les [garanties d’exécution et l’idempotence](./constraints/execution-guarantees.md)
  décrivent le contrat de relecture, de nouvelles tentatives, d’expiration
  des baux et de redistribution qui régit chaque procédure de reprise.
- La [supervision](./monitoring.md) explique où Waterline, l’export d’historique,
  les logs des workers et la télémétrie du runtime exposent les faits
  nécessaires au diagnostic.
