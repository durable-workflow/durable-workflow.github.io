---
sidebar_position: 5
---

# Estado del workflow {#workflow-status}

`running()` observa el estado cargado en la referencia. Llama a `refresh()` antes
de observar un workflow que ejecuta otro worker de cola. Usa una espera limitada
con pausas entre lecturas:

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

El vencimiento del plazo de observación detiene la espera de quien llama. No
cancela el workflow. Conserva el ID para que otro observador cargue su estado
actual. Gestiona los fallos terminales, cancelaciones o terminaciones antes de
leer un resultado satisfactorio.

Una referencia de instancia de `Workflow\V2\WorkflowStub::load($workflowId)` sigue
la ejecución actual al actualizarse, incluso a través de `continueAsNew()`. Las
referencias de `loadRun()` o `loadSelection()` siguen observando la ejecución
seleccionada, cuya finalización puede significar que continuó en una sucesora.
Consulta los detalles de selección y cierre en [API de workflow](./workflow-api.md).

## Valores de estado {#status-values}

El método `status()` devuelve estados de tipo cadena:

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

- `reserved`: se ha creado un id de instancia, pero aún no se ha aceptado el primer comando de inicio.
- `pending`: la ejecución existe y tiene trabajo listo para reclamar.
- `running`: un worker tiene una lease activa de una tarea de workflow.
- `waiting`: la ejecución espera una fuente duradera de reanudación, como una actividad, temporizador o señal con nombre.
- `cancelled`: un comando de cancelación aceptado por el motor cerró la ejecución actual.
- `terminated`: un comando de terminación aceptado por el motor forzó el cierre de la ejecución actual.
- `completed`, `failed`, `cancelled` y `terminated` son estados terminales de ejecución.

Cuando una ejecución usa `continueAsNew()`, termina con `status = completed` y `closed_reason = continued`. Waterline la mantiene en el grupo de completadas y muestra el `closed_reason` exacto para que el operador vea que la instancia pasó a otra ejecución.

`running()` devuelve `true` para `pending`, `running` y `waiting`.

## Máquina de estados {#state-machine}

Esta es la máquina de estados de un workflow.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="Máquina de estados del workflow"
/>
