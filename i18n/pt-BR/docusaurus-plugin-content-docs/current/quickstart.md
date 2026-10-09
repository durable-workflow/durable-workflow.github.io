---
sidebar_position: 2
title: Primeiros passos com Durable Workflow 2.0
description: Escolha um runtime em modo serviço e conclua seu primeiro workflow com PHP, Python ou Rust.
tags:
  - quickstart
  - getting-started
  - PHP
  - Python
  - Rust
keywords:
  - primeiros passos Durable Workflow
  - tutorial Durable Workflow 2.0
  - SDK PHP independente
  - SDK Python
  - SDK Rust
  - Server com Docker
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import PythonPackageReleaseLink from '@site/src/components/PythonPackageReleaseLink';

# Primeiros passos com Durable Workflow 2.0 {#durable-workflow-20-quickstart}

## Antes de começar {#before-you-begin}

**Objetivo:** executar um workflow em modo serviço e ler seu resultado durável
concluído com PHP, Python ou Rust.

**Tempo estimado:** cerca de 15 minutos depois que seu runtime estiver disponível.

**Resultado final:** o SDK escolhido inicia um worker e um workflow, depois
exibe um identificador de workflow, `status=completed` e `Hello, <language>!`.

**Pré-requisitos:**

- `curl` e um terminal
- Docker para o caminho local sob sua administração, ou um namespace provisionado
  no Durable Workflow Cloud
- ferramentas de uma linguagem: PHP 8.1+ com Composer, Python 3.10+ ou Rust 1.86+

O modo serviço não exige Laravel. O caminho para Laravel integrado aparece
separadamente no fim deste guia.

## 1. Escolha seu runtime em modo serviço {#1-choose-your-service-mode-runtime}

| Runtime | Quando escolher | Próxima ação |
| --- | --- | --- |
| Durable Workflow Cloud | Você quer que Durable Workflow opere o runtime, a persistência e o Managed Waterline. | Siga o guia executável [Primeiro workflow no Cloud](/docs/polyglot/cloud-control-plane/#cloud-first-workflow), que conecta os programas completos de PHP, Python e Rust às credenciais provisionadas e a um resultado `completed`. **Não execute Server nem um serviço Waterline separado.** |
| Server sob sua administração | Você quer operar o runtime ou executar este exercício local com os artefatos publicados. | Continue abaixo com Docker e `curl`. Implante Waterline separadamente apenas se quiser sua interface de operação. |

O exemplo abaixo usa um Server local sob sua administração. Assim, você pode
executá-lo sem criar uma conta nem obter o código-fonte. O Cloud usa o mesmo
modelo de SDK e worker. Substitua a conexão de desenvolvimento local pelos
valores provisionados descritos em
[Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/).

## 2. Inicie o Server local {#2-start-the-local-server}

Pule esta etapa se escolheu Cloud. Para o caminho sob sua administração, expanda
e execute a configuração com a versão fixada. Ela inicia um Server que não
depende de um checkout do código-fonte, com SQLite e um token de desenvolvimento.

<details>
<summary>Iniciar a imagem fixada do Server</summary>

<!-- docs-example id="quickstart.server.setup" -->
```bash
export DW_SERVER_IMAGE=%%artifact.serverDockerHubImage%%
export DW_AUTH_TOKEN=dev-token

docker volume create durable-workflow-quickstart

docker run --rm \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE" server-bootstrap

docker rm -f durable-workflow-server >/dev/null 2>&1 || true
docker run -d --name durable-workflow-server \
  -p 8080:8080 \
  -v durable-workflow-quickstart:/app/database \
  -e DW_AUTH_DRIVER=token \
  -e DW_AUTH_TOKEN="$DW_AUTH_TOKEN" \
  "$DW_SERVER_IMAGE"

until curl -sf http://localhost:8080/api/ready >/dev/null; do sleep 1; done
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info
```

</details>

**Resultado esperado:** a verificação de prontidão é bem-sucedida e a resposta
de informações do cluster identifica o Server local independente. Mantenha-o
em execução enquanto conclui o caminho de uma linguagem.

## 3. Escolha uma linguagem {#choose-one-language}

Os três SDKs oficiais têm o mesmo destaque. Apenas a aba selecionada é exibida,
para que você possa seguir um caminho sem percorrer os programas das outras
duas linguagens.

<Tabs groupId="quickstart-language" className="quickstart-language-tabs">
<TabItem value="php" label="PHP" default>

Requisitos: PHP 8.1 ou superior e Composer. Este é o pacote
`durable-workflow/sdk`, independente de framework, e não o mecanismo integrado
ao Laravel.

1. **Instale o SDK.**

<!-- docs-example id="quickstart.php.install" -->
```bash
mkdir durable-workflow-php-quickstart
cd durable-workflow-php-quickstart
composer require %%artifact.phpSdkComposerPackage%%
```

2. **Adicione o worker e o cliente.** Expanda o código completo e copie os dois
   arquivos para o novo projeto.

<details>
<summary>Código PHP completo para execução</summary>

O worker registra um tipo de workflow e um tipo de atividade em sua própria
fila de tarefas.

<!-- docs-example id="quickstart.php.worker" -->
```bash
cat > worker.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;
use DurableWorkflow\Worker;
use DurableWorkflow\Worker\ActivityContext;
use DurableWorkflow\Worker\WorkflowContext;

$client = new Client('http://localhost:8080', token: 'dev-token');
$worker = new Worker($client, 'quickstart-php');

$worker->registerActivity(
    'quickstart.greet',
    static fn (ActivityContext $context, string $name): string => "Hello, {$name}!",
);

$worker->registerWorkflow(
    'quickstart.greeter',
    static function (WorkflowContext $context, string $name): array {
        $greeting = $context->activity('quickstart.greet', [$name]);

        return ['greeting' => $greeting, 'language' => 'php'];
    },
);

$worker->run();
PHP
```

#### Cliente e leitura do resultado {#client-and-result-reader}

Este cliente inicia um workflow com nome único, aguarda a execução selecionada
e consulta o estado terminal durável mantido pelo Server.

<!-- docs-example id="quickstart.php.client" -->
```bash
cat > start.php <<'PHP'
<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use DurableWorkflow\Client;

$client = new Client('http://localhost:8080', token: 'dev-token');
$workflowId = 'quickstart-php-greeter-'.bin2hex(random_bytes(4));
$handle = $client->startWorkflow(
    workflowType: 'quickstart.greeter',
    workflowId: $workflowId,
    taskQueue: 'quickstart-php',
    input: ['PHP'],
);

$result = $handle->result(timeoutSeconds: 30);
$execution = $handle->describeSelectedRun();

echo "workflow_id={$execution->workflowId}\n";
echo "status={$execution->status}\n";
echo 'result='.json_encode($result, JSON_THROW_ON_ERROR)."\n";
PHP
```

</details>

3. **Execute o worker e o cliente.**

<!-- docs-example id="quickstart.php.run" -->
```bash
php worker.php > quickstart-worker.log 2>&1 &
export QUICKSTART_WORKER_PID=$!
trap 'kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true' EXIT

php start.php

kill "$QUICKSTART_WORKER_PID" 2>/dev/null || true
trap - EXIT
```

**Resultado esperado:** `status=completed` e um resultado contendo
`"greeting":"Hello, PHP!"`. Você executou um worker PHP independente e
inspecionou seu resultado durável sem Laravel.

Continue com o [Guia do SDK PHP](/docs/polyglot/php/).

</TabItem>
<TabItem value="python" label="Python">

Requisitos: Python 3.10 ou superior. O programa mantém o worker e o cliente em
um único processo, mas ambos se comunicam com o Server pelas APIs públicas de
workers e do plano de controle.

1. **Instale o SDK.**

   Use a <PythonPackageReleaseLink authority="qualified">versão estável do SDK
   Python</PythonPackageReleaseLink> indicada no manifesto acima.
   O requisito exato gerado mantém este caminho executável na versão estável
   documentada.

<!-- docs-example id="quickstart.python.install" -->
```bash
mkdir durable-workflow-python-quickstart
cd durable-workflow-python-quickstart

python3 -m venv .venv
. .venv/bin/activate
pip install %%artifact.pythonPackagePin%%
```

2. **Crie e execute o worker e o cliente.** Expanda o programa completo.
   Seu último comando executa o programa.

<details>
<summary>Código Python completo para execução</summary>

<!-- docs-example id="quickstart.python.greeter" -->
```bash
cat > greeter.py <<'PY'
import asyncio
import time

from durable_workflow import Client, Worker, activity, workflow


@activity.defn(name="quickstart.greet")
async def greet(name: str) -> dict:
    return {"greeting": f"Hello, {name}!", "language": "python"}


@workflow.defn(name="quickstart.greeter")
class GreeterWorkflow:
    def run(self, ctx, name):
        return (yield ctx.schedule_activity("quickstart.greet", [name]))


async def main():
    workflow_id = f"quickstart-python-greeter-{int(time.time())}"

    async with Client(
        "http://localhost:8080",
        token="dev-token",
        namespace="default",
    ) as client:
        handle = await client.start_workflow(
            workflow_type="quickstart.greeter",
            task_queue="quickstart-python",
            workflow_id=workflow_id,
            input=["Python"],
        )

        worker = Worker(
            client,
            task_queue="quickstart-python",
            workflows=[GreeterWorkflow],
            activities=[greet],
        )
        await worker.run_until(workflow_id=workflow_id, timeout=30.0)

        result = await handle.result(timeout=10.0)
        execution = await handle.describe_run()

    print(f"workflow_id={execution.workflow_id}")
    print(f"status={execution.status}")
    print(f"result={result}")


asyncio.run(main())
PY

python greeter.py
```

</details>

**Resultado esperado:** `status=completed` e um resultado contendo
`Hello, Python!`. As duas últimas chamadas do SDK leem o resultado da execução
selecionada e seu estado terminal durável no Server.

Continue com o [Guia do SDK Python](/docs/polyglot/python/).

</TabItem>
<TabItem value="rust" label="Rust">

Requisitos: Rust 1.86 ou superior. Este exemplo executa um worker nativo e um
cliente em um único processo Tokio.

1. **Instale o SDK.**

<!-- docs-example id="quickstart.rust.install" -->
```bash
cargo new durable-workflow-rust-quickstart
cd durable-workflow-rust-quickstart
%%artifact.rustCargoAddCommand%%
cargo add tokio --features macros,rt-multi-thread,time
```

2. **Crie e execute o worker e o cliente.** Expanda o programa completo.
   Seu último comando compila e executa o programa.

<details>
<summary>Código Rust completo para execução</summary>

<!-- docs-example id="quickstart.rust.greeter" -->
```bash
cat > src/main.rs <<'RS'
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use durable_workflow::{json, Client, Result, Worker, WorkflowResultOptions};

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::builder("http://localhost:8080")
        .token(Some("dev-token".to_string()))
        .namespace("default")
        .build()?;
    let task_queue = "quickstart-rust";
    let mut worker = Worker::new(client.clone(), task_queue);

    worker.register_activity("quickstart.greet", |_context, arguments| async move {
        let name = arguments
            .get(0)
            .and_then(|value| value.as_str())
            .unwrap_or("Rust");
        Ok(json!({"greeting": format!("Hello, {name}!"), "language": "rust"}))
    });

    worker.register_workflow("quickstart.greeter", |context, input| async move {
        let name = input.get(0).and_then(|value| value.as_str()).unwrap_or("Rust");
        context.activity("quickstart.greet", json!([name])).await
    });

    worker.register().await?;
    let workflow_id = format!("quickstart-rust-greeter-{}", unique_suffix());
    let handle = client
        .start_workflow(
            "quickstart.greeter",
            task_queue,
            &workflow_id,
            json!(["Rust"]),
        )
        .await?;

    let watcher = handle.clone();
    worker
        .run_until(async move {
            loop {
                if watcher.describe().await.is_ok_and(|run| run.is_terminal()) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        })
        .await?;

    let result = handle.result(WorkflowResultOptions::default()).await?;
    let execution = handle.describe_selected_run().await?;

    println!("workflow_id={workflow_id}");
    println!("status={}", execution.status.as_deref().unwrap_or("unknown"));
    println!("result={result}");
    Ok(())
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
RS

cargo run
```

</details>

**Resultado esperado:** `status=completed` e um resultado JSON contendo
`"greeting":"Hello, Rust!"`. O exemplo aguarda o worker concluir a execução,
depois lê o estado durável e o resultado decodificado da execução selecionada.

Continue com o [Guia do SDK Rust](/docs/polyglot/rust/).

</TabItem>
</Tabs>

## 4. Remova o Server local {#4-clean-up-the-local-server}

Quem usa Cloud não tem um Server local para remover. Para o exercício sob sua
administração:

```bash
docker rm -f durable-workflow-server
docker volume rm durable-workflow-quickstart
```

## Caminho separado: Laravel integrado {#separate-path-embedded-laravel}

Laravel integrado é um modo oficial de implantação em PHP para aplicações que
querem manter o estado dos workflows, a execução em fila, a configuração e as
ferramentas de operação na infraestrutura Laravel existente. Ele instala
`durable-workflow/workflow`. Não usa Server nem `durable-workflow/sdk`.

Crie uma aplicação integrada com o pacote publicado:

```bash
composer create-project laravel/laravel durable-workflow-laravel-quickstart
cd durable-workflow-laravel-quickstart
composer require %%artifact.workflowComposerPackage%%
php artisan migrate
php artisan queue:work
```

Para usar a interface de operação dentro da mesma aplicação Laravel, adicione
o pacote Composer qualificado do Waterline integrado:

```bash
composer require %%artifact.waterlineComposerPackage%%
php artisan waterline:install
```

Esse pacote Composer não é a forma de instalar o serviço Waterline separado
para um Server sob sua administração. Laravel integrado não executa Server nem
instala um SDK de modo serviço.

Continue em [Instalação integrada](/docs/installation/) para configurar uma fila
Laravel diferente de `sync`. Depois,
[defina](/docs/defining-workflows/workflows/) e
[inicie](/docs/defining-workflows/starting-workflows/) um workflow integrado.
[Modos de implantação](/docs/polyglot/deployment-modes/) compara esse caminho
especializado com a plataforma em modo serviço.

## Próximos passos {#next-steps}

- Consulte o [Índice de capacidades](/docs/capabilities/) para verificar o que
  seu runtime e SDK oferecem.
- Continue com o guia de modo serviço do
  [SDK PHP](/docs/polyglot/php/), [SDK Python](/docs/polyglot/python/) ou
  [SDK Rust](/docs/polyglot/rust/).
- Compare ciclo de vida, mensagens, agendamentos, visibilidade e execução de
  workers em [Capacidades de clientes e workers](/docs/polyglot/cli-python-parity/).
- Opere o runtime escolhido com
  [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/) ou
  [Server sob sua administração](/docs/polyglot/server/). Adicione a
  [CLI](/docs/polyglot/cli/) quando a automação pelo terminal for útil.
- Planeje a implantação segura de workers em modo serviço com
  [Compatibilidade e roteamento de workers](/docs/polyglot/worker-compatibility-routing/)
  e [Implantação por build ID](/docs/polyglot/worker-build-id-rollout/).

Para os recursos de código do Laravel integrado, como temporizadores, sinais,
consultas, atividades e workflows filhos, use a
[Documentação integrada](/docs/category/embedded/).

A qualificação de releases é separada deste guia de primeiro resultado.
A [Suíte de conformidade da plataforma](/docs/platform-conformance/) reúne
a matriz exata de artefatos, as verificações do código público, os registros
completos de execução, os critérios de tempo, a limpeza e o contrato de
primeiros passos legível por máquina.
