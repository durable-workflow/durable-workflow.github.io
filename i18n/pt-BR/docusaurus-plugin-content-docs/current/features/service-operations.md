---
title: Operações de serviço
description: Chame uma operação de outro namespace a partir de um workflow PHP embarcado.
---

# Operações de serviço {#service-operations}

Use uma operação de serviço quando um workflow precisar de um resultado durável de um serviço pertencente a outro namespace. A chamada identifica um endpoint, serviço e operação registrados. O runtime registra a chamada e o resultado para que um worker substituto possa reproduzir o mesmo resultado.

Workflows filhos e sinais permanecem no namespace original. Alterar o nome do tipo filho ou a fila de tarefas não atravessa esse limite. Use uma operação de serviço para trabalho publicado em outro namespace do mesmo cluster Durable Workflow.

## Chamar pelo PHP embarcado {#call-from-embedded-php}

Registre o catálogo de destino e seu handler antes de iniciar o workflow chamador. O [guia do modo serviço](../polyglot/service-operations.md) explica o catálogo compartilhado, a política de fronteira e as interfaces dos SDKs publicadas separadamente.

```php
use Workflow\V2\Support\ServiceOperationOptions;
use Workflow\V2\Workflow;

final class CreateInvoice extends Workflow
{
    public function handle(int $invoiceId): mixed
    {
        $call = self::serviceOperation(
            'billing',
            'invoices',
            'create',
            [$invoiceId],
            new ServiceOperationOptions(
                targetNamespace: 'billing',
                modeOverride: 'sync',
                waitFor: 'completed',
            ),
        );

        return $call->responsePayload;
    }
}
```

`serviceOperation()` retorna `ServiceOperationResult`, incluindo o `serviceCallId` durável, status do ciclo de vida, desfecho e dados da resposta. Uma falha ou cancelamento terminal do serviço é restaurado como exceção tipada de workflow na chamada original. Mantenha os mapeamentos de falhas da aplicação disponíveis para replay.

## Escolher o que o chamador aguarda {#choose-what-the-caller-waits-for}

Use `modeOverride: 'sync'` e `waitFor: 'completed'` quando a próxima decisão do workflow depender do resultado do serviço. O workflow fica suspenso de forma durável enquanto a chamada não for terminal.

Use `modeOverride: 'async'` ou `waitFor: 'accepted'` quando a admissão for suficiente. O registro retornado identifica a chamada original. Aceitação não significa trabalho de negócio concluído. Um resultado posterior do destino não reescreve o resultado já registrado para um chamador que aguardava apenas admissão. Se o workflow precisar do resultado terminal, escolha a espera pela conclusão desde o início.

## Preservar o contrato registrado {#preserve-the-recorded-contract}

Mantenha estáveis o namespace de destino, endpoint/serviço/operação, requisição e opções de espera de uma execução aberta. Use ramificações de versão do workflow para alterações incompatíveis. O replay reutiliza a identidade e o resultado registrados, em vez de solicitar outra execução.

Uma chave explícita de idempotência é uma identidade durável de negócio. Reutilize-a somente para a mesma operação e requisição pretendidas. Não a altere apenas porque uma resposta se perdeu ou uma espera venceu. Inspecione a chamada original antes de decidir se outra operação de negócio é segura.

Para limitar a execução do serviço, defina `deadline_policy` na operação do catálogo. Seu `timeout_seconds` é resolvido uma única vez a partir da aceitação original em `call_deadline_at`; a alternativa é `deadline_at` com deslocamento de fuso horário. Substituição de worker e replay não renovam esse prazo. `waitTimeoutSeconds` não é o prazo de execução do serviço. Alinhe os orçamentos do workflow e do serviço e inspecione o destino após um timeout, em vez de presumir que não houve efeitos externos.

## Guias relacionados {#related-guides}

- [Chamadas entre namespaces](../polyglot/service-operations.md)
- [Workflows filhos](./child-workflows.md)
- [Versionamento](./versioning.md)
- [Falhas e recuperação](../failures-and-recovery.md)
