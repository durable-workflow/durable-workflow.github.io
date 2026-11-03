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

Os payloads da V2 usam um formato de valores portável, então um modelo Eloquent não pode ser argumento nem resultado de um workflow ou atividade. Passe a chave do modelo e carregue o modelo dentro da atividade que o usa.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle(int $userId)
    {
        return activity(MyActivity::class, $userId);
    }
}
```

```php
use App\Models\User;
use Workflow\V2\Activity;

class MyActivity extends Activity
{
    public function handle(int $userId)
    {
        $user = User::findOrFail($userId);

        return "Hello, {$user->name}!";
    }
}
```

Carregue modelos em atividades, não no código do workflow. O código do workflow é executado de novo no replay, e uma consulta ao banco de dados pode retornar linhas diferentes em um replay posterior.

Passar um modelo para `start()` lança uma `InvalidArgumentException`. Passar um modelo para `activity()` faz a execução do workflow falhar. Os dois erros informam a classe do modelo:

```
unsupported_value_type: Eloquent model App\Models\User cannot cross a V2 payload boundary. Pass its key and load the model inside the activity.
```

A mesma regra vale para coleções do Eloquent. Passe um array de chaves no lugar. Se a atividade precisa apenas de alguns atributos, passe-os como array.

Na v1, workflows e atividades recebiam modelos por meio de `SerializesModels`, que armazenava um identificador do modelo e recarregava o modelo quando o job era executado. A V2 não faz isso.

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
