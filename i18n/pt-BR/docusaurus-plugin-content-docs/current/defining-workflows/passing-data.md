---
sidebar_position: 4
---

# Passando dados {#passing-data}

Você pode passar dados para um workflow pelo método `start()`.

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class);
$workflow->start('world');
```

Os argumentos são passados ao método `handle()` do workflow.

Da mesma forma, você pode passar dados para uma atividade pela função auxiliar `activity()`.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle($name)
    {
        return activity(MyActivity::class, $name);
    }
}
```

Os argumentos são passados ao método `handle()` da atividade.

```php
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle($name)
    {
        return "Hello, {$name}!";
    }
}
```

import PassingDataSimulator from '@site/src/components/PassingDataSimulator';

<PassingDataSimulator />

Em geral, passe apenas pequenas quantidades de dados dessa forma. Em vez de passar grandes volumes, grave os dados no banco de dados, cache ou sistema de arquivos. Então passe a chave ou o caminho do arquivo para o workflow e as atividades. As atividades podem usar essa chave ou caminho para ler os dados.

Quando a aplicação realmente precisar transportar grandes volumes de bytes pelo histórico, como documentos, blobs de mídia ou exportações serializadas, ative o [Armazenamento externo de payloads](../features/external-payload-storage.md) no namespace. O runtime transfere payloads acima do limiar para um armazenamento de objetos configurado e registra no histórico um envelope de referência verificável, mantendo a integridade do replay e respeitando o [limite estrutural `payload_size_bytes`](../constraints/structural-limits.md#payload-size).

## Saída {#output}

Depois que o workflow for concluído, você pode obter a saída pelo método `output()`.

```php
$workflow->output();
=> 'Hello, world!'
```

## Modelos {#models}

Passar modelos funciona de forma semelhante a `SerializesModels`.

```php
use App\Models\User;
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(User $user)
    {
        return activity(MyActivity::class, $user->name);
    }
}
```

Quando um modelo Eloquent é passado a um workflow ou atividade, apenas seu `ModelIdentifier` é serializado. Isso reduz o tamanho do payload, mantendo a eficiência e o desempenho dos workflows.

```
object(ModelIdentifier) {
    id: 42,
    class: "App\Models\User",
    relations: [],
    connection: "mysql"
}
```

Quando o workflow ou a atividade executar, ele recuperará do banco de dados a instância completa do modelo, incluindo quaisquer relações carregadas. Para evitar chamadas extras ao banco durante a execução de um workflow ou atividade, considere converter o modelo em um array antes de passá-lo.

## Injeção de dependências {#dependency-injection}

Além de passar dados, você pode declarar os tipos de dependências nos métodos `handle()` do workflow ou da atividade. O contêiner de serviços do Laravel injetará essas dependências automaticamente.

```php
use Illuminate\Contracts\Foundation\Application;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(Application $app)
    {
        if ($app->runningInConsole()) {
            // ...
        }
    }
}
```

A injeção de dependências não flexibiliza o determinismo do workflow. Um workflow
pode declarar tipos de serviços estáveis, como o contêiner da aplicação Laravel
ou leitores de configuração, mas dependências injetadas que realizem trabalho
ainda precisam da fronteira durável correta. Coloque entrada/saída externa,
acesso ao banco de dados, chamadas de serviço ou outros trabalhos que possam
falhar ou devam permitir novas tentativas em `activity(...)` ou
`localActivity(...)`. Use `sideEffect()` apenas para um snapshot único de valor,
seguro para replay, que deva ficar fixo no histórico, como uma leitura do relógio
do sistema, um valor aleatório gerado ou uma configuração capturada no momento
da decisão.
