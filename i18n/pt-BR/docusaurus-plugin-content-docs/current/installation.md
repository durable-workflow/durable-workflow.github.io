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

A linha publicada Workflow 2.20.x exige:

- PHP `^8.1`
- Laravel 10–13 nas versões mínimas declaradas no
  [manifesto do pacote](https://github.com/durable-workflow/workflow/blob/2.20.4/composer.json)

Laravel 11 e 12 exigem PHP 8.2 ou superior; Laravel 13 exige PHP 8.3 ou superior.
Veja [Compatibilidade de versões](/docs/compatibility/#embedded-php-and-laravel-support)
para as restrições exatas e o limite independente do SDK PHP.

### Preparação para Workflow 2.21 {#preparing-for-workflow-2-21}

:::info Mudança de suporte ainda não publicada

O código de Workflow 2.21 exige PHP `^8.2` e Laravel `^12.69.0|^13.30.0`.
Ainda não foi publicado nem passou por Release Verification. O comando abaixo
continua selecionando um artefato publicado; integrar o código-fonte não muda
essa autoridade.

:::

Atualize aplicações PHP 8.1 ou Laravel 10/11 para uma plataforma suportada antes
de adotar 2.21. Laravel 13 continua exigindo PHP 8.3 ou superior. Atualize os
processos web, CLI e workers, mantendo o arquivo de lock 2.20.x da aplicação
durante a preparação e os testes. Uma solicitação explícita de 2.21 deve recusar
uma plataforma não suportada; mantenha ativas as verificações de plataforma e
o bloqueio por avisos de segurança do Composer. Manter 2.20.x não estende o
suporte de segurança dos projetos PHP ou Laravel.

Essa mudança de suporte não introduz migração de esquema, histórico ou
protocolo. As execuções v1 continuam pertencendo à v1; o
[procedimento de migração](/docs/migration/) continua definindo o esvaziamento ou a coexistência.

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

Use `durable-workflow/workflow:^2.0` para aceitar automaticamente atualizações
compatíveis de 2.x. Consulte [Compatibilidade de versões](/docs/compatibility)
para conhecer as regras do ambiente e dos pacotes.

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
