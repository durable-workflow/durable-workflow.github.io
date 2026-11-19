---
sidebar_position: 3
---

# Installation {#installation}

Ce guide installe le package PHP Durable Workflow dans une application Laravel.

Si vous hésitez entre l’intégration du package et un Server indépendant, commencez par les [modes de déploiement](/docs/polyglot/deployment-modes). Cette page décrit le mode intégré à Laravel.

> **Vous préférez commencer par une application qui fonctionne ?** La [Sample App](/docs/sample-app) est un projet Laravel 13 exécutable avec Durable Workflow 2.0. Elle propose un workflow pour chaque modèle, un parcours Codespaces et un parcours `docker compose`. Clonez-la et exécutez `php artisan app:init` pour appliquer l’installation. Revenez ici pour ajouter Durable Workflow à votre propre application Laravel.

## Prérequis {#requirements}

- PHP 8.2 ou ultérieur dans la série 8.x
- Laravel 12.72 ou ultérieur dans la série 12.x, ou Laravel 13.41 ou ultérieur dans la série 13.x
- PHP 8.3 ou ultérieur pour Laravel 13

Ces exigences concernent la version embarquée actuelle. Avant de mettre à jour
Composer dans une ancienne application, choisissez la [branche publiée compatible](./compatibility.md#laravel-support).
Le SDK PHP de base en mode service a ses propres exigences.

Consultez la [compatibilité des bases de données](./polyglot/database-support.md) pour les déclarations embarquées et Server, configurations exactes testées et limites de qualification.

Durable Workflow prend en charge les pilotes de files de Laravel, **à l’exception de `sync`**, notamment :

- Amazon SQS
- Beanstalkd
- Database
- Redis

Chaque pilote a ses [prérequis](https://laravel.com/docs/12.x/queues#driver-prerequisites).

Le pilote de cache doit aussi prendre en charge les [verrous](https://laravel.com/docs/12.x/cache#atomic-locks).

## Installer Durable Workflow {#installing-durable-workflow}

Installez le package avec Composer :

```bash
composer require %%artifact.workflowComposerPackage%%
```

La commande ci-dessus fixe la version embarquée publiée. Consultez les
[limites de compatibilité et de mise à niveau Laravel](./compatibility.md#laravel-support)
avant d'élargir la contrainte ou de mettre à niveau une ancienne application.

Le package charge automatiquement ses migrations. Après l’installation, exécutez les migrations habituelles :

```bash
php artisan migrate
```

## Exécuter les workers {#running-workers}

Durable Workflow utilise des files pour exécuter les workflows et les activités en arrière-plan. Exécutez la commande [`queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command) ou utilisez [Horizon](https://laravel.com/docs/12.x/horizon) pour gérer vos workers de file. Sans worker, les workflows et les activités ne sont pas traités. Pour les exécuter en parallèle, il faut plusieurs workers.

### Délai d’expiration du worker {#worker-timeout}

Lorsque PHP dispose de l’extension `pcntl`, un worker de file tue tout job qui s’exécute au-delà de son délai d’expiration : le `--timeout` du worker, 60 secondes par défaut, sauf si le job définit le sien. Les changements d’une tâche de workflow tuée sont annulés. Elle n’est relancée qu’après l’expiration de son bail (`workflows.v2.workflow_task_lease_seconds`, 300 secondes par défaut) et est comptée comme un bail perdu, et la nouvelle tentative refait le même travail. Une tâche de workflow qui a toujours besoin de plus de temps que ce délai, par exemple une tâche qui planifie ou termine un large `all()`, ne se termine jamais.

Trois réglages doivent être cohérents :

- Le **délai d’expiration des workers qui exécutent les tâches de workflow** doit couvrir votre plus longue tâche de workflow. Une tâche de workflow tuée attend la fin de son bail avant d’être relancée.
- Le **`retry_after`** de la connexion de file doit dépasser le délai d’expiration de chaque job qu’elle transporte, comme l’exige Laravel. Sinon, la file confie un job encore en cours à un second worker.
- Les **activités** doivent garder un délai d’expiration borné, afin qu’une activité bloquée ne puisse pas occuper un worker indéfiniment. N’utilisez pas `--timeout=0`.

Pour donner aux activités un délai d’expiration plus court qu’aux tâches de workflow, exécutez-les sur leur propre file avec leurs propres workers. Les activités s’exécutent sur la connexion et la file de leur workflow, sauf si la classe d’activité définit `$connection` ou `$queue`, ou si le workflow transmet des `ActivityOptions`.

```php
// config/queue.php
'redis' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'default',
    'retry_after' => 330, // above the workflow task workers' timeout
],
```

```php
use Workflow\V2\Activity;

final class ChargeCardActivity extends Activity
{
    public ?string $queue = 'activities';
}
```

```bash
php artisan queue:work redis --queue=default --timeout=300      # workflow tasks
php artisan queue:work redis --queue=activities --timeout=60    # activities
```

Dans Horizon, l’option `timeout` de chaque superviseur est le délai d’expiration du worker.

Workflow 2.34.0 ajoute `DW_V2_WORKFLOW_TASK_JOB_TIMEOUT_SECONDS`, non défini par défaut. Lorsqu’il est défini, chaque job de tâche de workflow porte ce délai, maintenu au moins 10 secondes sous le `retry_after` de sa connexion, et les workers l’utilisent à la place de leur propre délai pour ces jobs, si bien que tâches de workflow et activités peuvent partager les mêmes workers. À partir de cette version, un worker qui sert la file des workflows journalise un avertissement au démarrage lorsque le délai sous lequel s’exécutent ses tâches de workflow est inférieur au bail de tâche de workflow.
