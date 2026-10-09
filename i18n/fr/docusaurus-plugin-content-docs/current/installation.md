---
sidebar_position: 3
---

# Installation {#installation}

Ce guide installe le package PHP Durable Workflow dans une application Laravel.

Si vous hésitez entre l’intégration du package et un Server indépendant, commencez par les [modes de déploiement](/docs/polyglot/deployment-modes). Cette page décrit le mode intégré à Laravel.

> **Vous préférez commencer par une application qui fonctionne ?** La [Sample App](/docs/sample-app) est un projet Laravel 13 exécutable avec Durable Workflow 2.0. Elle propose un workflow pour chaque modèle, un parcours Codespaces et un parcours `docker compose`. Clonez-la et exécutez `php artisan app:init` pour appliquer l’installation. Revenez ici pour ajouter Durable Workflow à votre propre application Laravel.

## Prérequis {#requirements}

- PHP 8.1 ou ultérieur
- Laravel 9 ou ultérieur

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

Utilisez `durable-workflow/workflow:^2.0` pour que Composer accepte automatiquement les mises à jour 2.x compatibles. La [compatibilité des versions](/docs/compatibility) précise les règles pour les packages et les runtimes.

Le package charge automatiquement ses migrations. Après l’installation, exécutez les migrations habituelles :

```bash
php artisan migrate
```

## Exécuter les workers {#running-workers}

Durable Workflow utilise des files pour exécuter les workflows et les activités en arrière-plan. Exécutez la commande [`queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command) ou utilisez [Horizon](https://laravel.com/docs/12.x/horizon) pour gérer vos workers de file. Sans worker, les workflows et les activités ne sont pas traités. Pour les exécuter en parallèle, il faut plusieurs workers.
