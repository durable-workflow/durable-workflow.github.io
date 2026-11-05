---
sidebar_position: 3
---

# Installation {#installation}

Ce guide installe le package PHP Durable Workflow dans une application Laravel.

Si vous hésitez entre l’intégration du package et un Server indépendant, commencez par les [modes de déploiement](/docs/polyglot/deployment-modes). Cette page décrit le mode intégré à Laravel.

> **Vous préférez commencer par une application qui fonctionne ?** La [Sample App](/docs/sample-app) est un projet Laravel 13 exécutable avec Durable Workflow 2.0. Elle propose un workflow pour chaque modèle, un parcours Codespaces et un parcours `docker compose`. Clonez-la et exécutez `php artisan app:init` pour appliquer l’installation. Revenez ici pour ajouter Durable Workflow à votre propre application Laravel.

## Prérequis {#requirements}

La branche publiée Workflow 2.20.x nécessite :

- PHP `^8.1`
- Laravel 10–13 aux versions minimales déclarées dans le
  [manifeste du paquet](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)

Laravel 11 et 12 nécessitent PHP 8.2 ou ultérieur ; Laravel 13 nécessite PHP 8.3
ou ultérieur. Consultez la [compatibilité des versions](/docs/compatibility/#embedded-php-and-laravel-support)
pour les contraintes exactes et la limite distincte du SDK PHP.

### Préparer Workflow 2.21 {#preparing-for-workflow-2-21}

:::info Changement de prise en charge non publié

Le code source de Workflow 2.21 nécessite PHP `^8.2` et Laravel `^12.69.0|^13.30.0`.
Il n'est pas encore publié et n'a pas passé Release Verification. La commande
ci-dessous sélectionne toujours un artefact publié ; l'intégration du code
source ne change pas cette autorité.

:::

Mettez les applications PHP 8.1 ou Laravel 10/11 à niveau vers une plateforme
prise en charge avant d'adopter 2.21. Laravel 13 nécessite toujours PHP 8.3 ou
ultérieur. Mettez à jour les processus web, CLI et workers, en conservant le
fichier de verrouillage 2.20.x pendant la préparation et les tests. Une demande
explicite de 2.21 doit refuser une plateforme non prise en charge ; gardez les
contrôles de plateforme et le blocage des avis de sécurité Composer actifs.
Conserver 2.20.x ne prolonge pas le support de sécurité amont de PHP ou Laravel.

Ce changement n'introduit aucune migration de schéma, d'historique ou de
protocole. Les exécutions v1 restent la propriété de v1 ; la
[procédure de migration](/docs/migration/) régit toujours leur vidage ou coexistence.

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

Utilisez `durable-workflow/workflow:^2.0` pour que Composer accepte automatiquement les mises à jour 2.x compatibles. La [compatibilité des versions](/docs/compatibility) précise les règles pour les packages et les runtimes.

Le package charge automatiquement ses migrations. Après l’installation, exécutez les migrations habituelles :

```bash
php artisan migrate
```

## Exécuter les workers {#running-workers}

Durable Workflow utilise des files pour exécuter les workflows et les activités en arrière-plan. Exécutez la commande [`queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command) ou utilisez [Horizon](https://laravel.com/docs/12.x/horizon) pour gérer vos workers de file. Sans worker, les workflows et les activités ne sont pas traités. Pour les exécuter en parallèle, il faut plusieurs workers.
