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

Lorsque PHP dispose de l’extension `pcntl`, un worker de file tue tout job qui s’exécute au-delà de son délai d’expiration : le `--timeout` du worker, 60 secondes par défaut, sauf si le job définit le sien. Une tâche de workflow tuée perd son bail et ses changements sont annulés. Elle n’est relancée qu’après l’expiration du bail (`workflows.v2.workflow_task_lease_seconds`, 300 secondes par défaut), et la nouvelle tentative refait le même travail. Une tâche de workflow qui a toujours besoin de plus de temps que ce délai, par exemple une tâche qui planifie ou termine un large `all()`, ne se termine jamais.

Trois réglages doivent être cohérents :

- Le **délai d’expiration de la tâche de workflow** doit être inférieur au **bail de la tâche de workflow**. Un travail qui dépasse le bail ne peut pas se terminer.
- Le **`retry_after`** de la connexion de file doit dépasser le délai d’expiration de chaque job qu’elle transporte, comme l’exige Laravel. Sinon, la file confie un job encore en cours à un second worker.
- Les **activités** doivent garder un délai d’expiration borné, afin qu’une activité bloquée ne puisse pas occuper un worker indéfiniment. N’utilisez pas `--timeout=0`.

Exécutez les tâches de workflow sur leur propre connexion de file, dont le `retry_after` dépasse le bail, avec des workers dont le `--timeout` est inférieur au bail. Exécutez les activités sur une autre file avec un délai d’expiration qui leur convient. Les activités utilisent la file de leur workflow, sauf si la classe d’activité définit ses propres `$connection` ou `$queue`.

```php
// config/queue.php: a connection for workflow tasks
'workflows' => [
    'driver' => 'redis',
    'connection' => 'default',
    'queue' => 'workflows',
    'retry_after' => 330, // above the 300-second workflow task lease
],
```

```bash
# DW_V2_CONNECTION=workflows DW_V2_QUEUE=workflows
php artisan queue:work workflows --queue=workflows --timeout=270
php artisan queue:work --queue=default --timeout=60
```

Dans Horizon, l’option `timeout` de chaque superviseur est le délai d’expiration du worker. Les versions plus récentes de Workflow attribuent ce délai à chaque job de tâche de workflow (le bail moins 30 secondes, maintenu au moins 10 secondes sous `retry_after`), si bien qu’un délai court du worker ne tue plus les tâches de workflow. Un worker de la file des workflows journalise un avertissement au démarrage lorsque `retry_after` limite les tâches de workflow.
