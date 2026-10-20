---
sidebar_position: 5
---

# Estado do workflow {#workflow-status}

`running()` observa o estado carregado da referência. Chame `refresh()` antes de
observar um workflow que outro worker de fila esteja executando. Use uma espera
limitada com uma pausa entre leituras:

```php
$deadline = hrtime(true) + 20_000_000_000;
do {
    $workflow->refresh();
    if (! $workflow->running()) {
        break;
    }
    usleep(100_000);
} while (hrtime(true) < $deadline);

if ($workflow->running()) {
    throw new RuntimeException('Workflow is still running; observation deadline expired.');
}
if (! $workflow->completed()) {
    throw new RuntimeException('Workflow ended with status '.$workflow->status());
}
$result = $workflow->output();
```

Um limite de tempo de observação encerra a espera desse chamador. Ele não cancela
o workflow. Guarde o ID do workflow para que outro observador possa carregar seu
estado atual. Uma falha terminal, cancelamento ou término deve ser tratado antes
de ler uma saída bem-sucedida.

Uma referência de instância obtida por `Workflow\V2\WorkflowStub::load($workflowId)`
acompanha a execução atual quando atualizada, inclusive entre chamadas de
`continueAsNew()`. Uma referência obtida por `loadRun()` ou `loadSelection()`
continua observando a execução selecionada, cuja conclusão pode significar que
ela continuou em uma sucessora. Consulte [API de workflow](./workflow-api.md)
para detalhes sobre seleção e fechamento de execuções.

## Valores de estado {#status-values}

O método `status()` retorna estados como strings:

```text
reserved
pending
running
waiting
cancelled
terminated
completed
failed
```

- `reserved` significa que um ID de instância foi criado, mas o primeiro comando de início ainda não foi aceito
- `pending` significa que a execução existe e tem trabalho pronto para ser assumido
- `running` significa que uma tarefa de workflow está com um lease ativo de um worker
- `waiting` significa que a execução aguarda uma fonte durável de retomada, como uma atividade, temporizador ou sinal nomeado
- `cancelled` significa que um comando de cancelamento aceito pelo mecanismo fechou a execução atual
- `terminated` significa que um comando de término aceito pelo mecanismo fechou a execução atual de forma forçada
- `completed`, `failed`, `cancelled` e `terminated` são estados terminais de execução

Quando uma execução usa `continueAsNew()`, a execução antiga termina com `status = completed` e `closed_reason = continued`. O Waterline mantém essa execução no grupo de concluídas e ainda exibe o `closed_reason` exato para que operadores vejam que a instância avançou para uma execução mais nova.

`running()` retorna `true` para `pending`, `running` e `waiting`.

## Máquina de estados {#state-machine}

Esta é a máquina de estados do estado de um workflow.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="Máquina de estados do workflow"
/>
