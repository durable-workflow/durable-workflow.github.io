---
sidebar_position: 6
---

# Esperas por condição {#condition-waits}

`await($condition, $conditionKey = null)` oferece esperas por condição seguras para replay. Use quando o predicado depender apenas do estado do workflow já derivado de entradas duráveis, como atualizações, resultados de atividades ou resultados de workflows filhos. Para obter diretamente o valor de um sinal externo nomeado, chame `await('name')`. Consulte [Sinais](./signals.md).

As esperas por condição são acionadas por um método de atualização, em vez de métodos de sinal que alteram o estado:

```php
use Workflow\UpdateMethod;
use function Workflow\V2\await;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;

#[Type('approval-workflow')]
class MyWorkflow extends Workflow
{
    private bool $ready = false;

    public function handle(): void
    {
        await(fn () => $this->ready, 'approval.ready');
    }

    #[UpdateMethod]
    public function setReady(bool $ready = true): array
    {
        $this->ready = $ready;

        return ['ready' => $this->ready];
    }
}
```

A chave de condição opcional é um rótulo estável para o operador, seguro para uso em URLs, que identifica a espera. O replay valida a chave registrada anteriormente para que uma implantação posterior não reutilize por engano a mesma etapa do workflow para outro predicado. Consulte [Versionamento](./versioning.md) para saber como evoluir um workflow com segurança entre implantações.

Para uma espera por condição com tempo limite, consulte [Sinal + temporizador](./signal+timer.md).

**Importante:** `await()` deve ser usado apenas em um workflow, nunca em uma atividade.
