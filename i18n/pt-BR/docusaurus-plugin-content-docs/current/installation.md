---
sidebar_position: 3
---

# Instalação {#installation}

Este guia mostra como instalar o pacote PHP Durable Workflow em uma aplicação
Laravel.

Se você ainda está escolhendo entre o modo integrado e o Server independente,
comece por [Modelos de implantação](/docs/polyglot/deployment-modes). Esta página
trata do Laravel integrado.

> **Prefere começar com uma aplicação pronta?** O
> [Sample App](/docs/sample-app) é um projeto Laravel 13 executável com
> Durable Workflow 2.0. Ele inclui um workflow por tipo de padrão e caminhos
> para Codespaces e `docker compose`. Clone o projeto e execute
> `php artisan app:init` para obter a instalação pronta. Volte a este guia
> quando quiser adicionar Durable Workflow à sua própria aplicação Laravel.

## Requisitos {#requirements}

- PHP 8.2 ou superior na linha 8.x
- Laravel 12.72 ou superior na linha 12.x, ou Laravel 13.41 ou superior na linha 13.x
- PHP 8.3 ou superior para Laravel 13

Estes requisitos se aplicam à versão embutida atual. Antes de atualizar Composer
em uma aplicação antiga, escolha a [linha publicada compatível](./compatibility.md#laravel-support).
O SDK PHP básico do modo de serviço tem requisitos próprios.

Confira [Compatibilidade de bancos de dados](./polyglot/database-support.md) para declarações do modo embutido e Server, configurações exatas testadas e limites de qualificação.

O Durable Workflow pode usar qualquer driver de fila compatível com Laravel,
exceto `sync`, incluindo:

- Amazon SQS
- Beanstalkd
- Database
- Redis

Cada driver de fila tem seus próprios
[pré-requisitos](https://laravel.com/docs/12.x/queues#driver-prerequisites).

O Durable Workflow também exige um driver de cache com suporte a
[locks](https://laravel.com/docs/12.x/cache#atomic-locks).

## Instale o Durable Workflow {#installing-durable-workflow}

Instale o pacote pelo Composer:

```bash
composer require %%artifact.workflowComposerPackage%%
```

O comando acima fixa a versão embutida publicada. Confira o
[limite de suporte e atualização do Laravel](./compatibility.md#laravel-support)
antes de ampliar a restrição ou atualizar uma aplicação Laravel antiga.

O pacote carrega suas migrations automaticamente. Após a instalação, basta
executar a migração normal:

```bash
php artisan migrate
```

## Execute os workers {#running-workers}

O Durable Workflow usa filas para executar workflows e atividades em segundo
plano. Execute o [comando `queue:work`](https://laravel.com/docs/12.x/queues#the-queue-work-command)
ou use o [Horizon](https://laravel.com/docs/12.x/horizon) para operar os workers
de fila. Sem um worker, workflows e atividades não são processados. Para
executá-los em paralelo, você precisa de mais de um worker de fila.

### Timeout do worker {#worker-timeout}

```bash
php artisan queue:work --timeout=0
```

Quando o PHP tem a extensão `pcntl`, o `queue:work` encerra qualquer job que
rode por mais de `--timeout` segundos, que por padrão são 60. Uma tarefa de
workflow encerrada dessa forma sofre rollback. Ela é tentada novamente depois
que o lease da tarefa de workflow expira (300 segundos por padrão), e a nova
tentativa repete o mesmo trabalho. Uma tarefa de workflow que sempre precisa de
mais tempo que o timeout, como uma que agenda ou conclui um `all()` amplo, nunca
é concluída.

Execute os workers de workflow com `--timeout=0` ou com um valor acima da sua
tarefa de workflow mais longa. Mantenha
`workflows.v2.workflow_task_lease_seconds` acima desse valor. No Horizon, a
opção `timeout` do supervisor é a mesma configuração.
