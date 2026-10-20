---
sidebar_position: 5
---

# État du workflow {#workflow-status}

`running()` consulte l’état chargé dans le handle. Appelez `refresh()` avant
d’observer un workflow exécuté par un autre worker de file d’attente. Limitez
la durée d’attente et marquez une pause entre les lectures :

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

L’expiration du délai d’observation met fin à l’attente de cet appelant. Elle
n’annule pas le workflow. Conservez l’identifiant du workflow pour qu’un autre
observateur puisse charger son état actuel. Traitez un échec définitif, une
annulation ou un arrêt forcé avant de lire un résultat de réussite.

Un handle d’instance obtenu par `Workflow\V2\WorkflowStub::load($workflowId)` suit
l’exécution courante à chaque actualisation, y compris après `continueAsNew()`.
Un handle obtenu par `loadRun()` ou `loadSelection()` continue d’observer
l’exécution sélectionnée, dont la fin peut signifier qu’elle s’est poursuivie
dans une exécution suivante. Consultez l’[API des workflows](./workflow-api.md)
pour les détails de sélection et de clôture des exécutions.

## Valeurs d’état {#status-values}

La méthode `status()` retourne les états sous forme de chaînes :

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

- `reserved` signifie qu’un identifiant d’instance a été créé, mais que la première commande de démarrage n’a pas encore été acceptée
- `pending` signifie que l’exécution existe et que du travail est prêt à être pris en charge
- `running` signifie qu’une tâche de workflow fait actuellement l’objet d’un bail détenu par un worker
- `waiting` signifie que l’exécution attend une source de reprise durable telle qu’une activité, un temporisateur ou un signal nommé
- `cancelled` signifie qu’une commande d’annulation du moteur a été acceptée et a clôturé l’exécution courante
- `terminated` signifie qu’une commande d’arrêt forcé du moteur a été acceptée et a forcé la clôture de l’exécution courante
- `completed`, `failed`, `cancelled` et `terminated` sont des états terminaux d’exécution

Lorsqu’une exécution utilise `continueAsNew()`, l’ancienne se termine avec `status = completed` et `closed_reason = continued`. Waterline la conserve dans la catégorie des exécutions terminées tout en affichant la valeur exacte de `closed_reason`, afin que les opérateurs voient que l’instance s’est poursuivie dans une nouvelle exécution.

`running()` retourne `true` pour `pending`, `running` et `waiting`.

## Machine à états {#state-machine}

Voici la machine à états qui décrit l’état d’un workflow.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="Machine à états du workflow"
/>
