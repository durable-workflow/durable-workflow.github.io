---
sidebar_position: 5
---

# Workflow-Status {#workflow-status}

`running()` liest den geladenen Zustand der Referenz. Rufen Sie `refresh()`
auf, bevor Sie einen Workflow beobachten, den ein anderer Queue-Worker
ausführt. Verwenden Sie eine begrenzte Wartezeit mit Pausen zwischen den
Lesezugriffen:

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

Ein Beobachtungs-Timeout beendet das Warten dieses Aufrufers. Er bricht den
Workflow nicht ab. Bewahren Sie die Workflow-ID auf, damit ein anderer
Beobachter den aktuellen Zustand laden kann. Ein endgültiger Fehler, Abbruch
oder eine Beendigung muss behandelt werden, bevor eine erfolgreiche Ausgabe
gelesen wird.

Eine Instanzreferenz aus `Workflow\V2\WorkflowStub::load($workflowId)` folgt
beim Aktualisieren dem aktuellen Lauf, auch über `continueAsNew()` hinweg.
Eine Referenz aus `loadRun()` oder `loadSelection()` beobachtet weiterhin den
ausgewählten Lauf. Dessen Abschluss kann bedeuten, dass er in einem Nachfolger
fortgesetzt wurde. Details zu Laufauswahl und Abschluss finden Sie unter
[Workflow-API](./workflow-api.md).

## Statuswerte {#status-values}

Die Methode `status()` gibt Statuswerte als Zeichenfolgen zurück:

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

- `reserved` bedeutet, dass eine Instanz-ID erstellt, aber der erste Startbefehl noch nicht angenommen wurde.
- `pending` bedeutet, dass der Lauf existiert und Arbeit zur Übernahme bereitsteht.
- `running` bedeutet, dass eine Workflow-Aufgabe aktiv an einen Worker verleast ist.
- `waiting` bedeutet, dass der Lauf auf eine dauerhafte Fortsetzungsquelle wie eine Aktivität, einen Timer oder ein benanntes Signal wartet.
- `cancelled` bedeutet, dass ein angenommener Abbruchbefehl auf Engine-Ebene den aktuellen Lauf geschlossen hat.
- `terminated` bedeutet, dass ein angenommener Beendigungsbefehl auf Engine-Ebene den aktuellen Lauf zwangsweise geschlossen hat.
- `completed`, `failed`, `cancelled` und `terminated` sind endgültige Laufzustände.

Verwendet ein Lauf `continueAsNew()`, endet der alte Lauf mit
`status = completed` und `closed_reason = continued`. Waterline führt ihn
weiter in der Gruppe abgeschlossener Läufe, zeigt aber den genauen
`closed_reason`, damit Betreiber die Fortsetzung der Instanz in einem neueren
Lauf erkennen können.

`running()` gibt für `pending`, `running` und `waiting` den Wert `true` zurück.

## Zustandsautomat {#state-machine}

Dies ist der Zustandsautomat für den Workflow-Status.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgKTp1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsXQLGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlsonpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogKR57AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZPCQnb?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqVkktPhDAUhf8KuUsDhFfp0IWbMe5MjC4mUVw0tjCN0JLS-iL8dztMdIIBM3bV23O-e3LTO8CzYhwI9IYafiVorWkbvCal9Nx5vHjyguDS2yn9UjXqbau5c7F757V9KY-mRXGG3XLJhKyXsZk4w66paE5h5zF3VsrVqJk4H0y1XcPNctpfmDRC2v9i64OtMzsqzOpgM_HMqHXm13eBD7UWDIjRlvvQct3SQwnDoWEJZs9bXgJxV8YrahtTQilHh3VUPijVfpNa2XoPpKJN7yrbsdPG_bxql831VllpgGTx1APIAO9AkgyFGEUZwnGO8jgrch8-gMQFDvNNmmO0KVK0yXEy-vA5xUZhGifOHOOoiHCBsyTzgTNhlL45bv20_OMXsQ4LGQ"
  darkLink="https://mermaid.live/edit#pako:eNqVkstugzAQRX8FzbICxMs4eNFNqu4qVe0iUksXVu0QK2AjY_eF-Pc6RG1EBFXqlcf3nrkaeXp4VYwDgc5Qw28ErTRtgreklJ47z1cvXhBcexul99tava81dy726Ly2K-XRNCtOsHsumZDVPDYRJ9gtFfUp7DLmwUq5GDURp4Oppq25mU_7C5NGSPtfbHmwZWZDhVkcbCJeGLXMnH0X-FBpwYAYbbkPDdcNPZTQHxqWYHa84SUQd2VU70vo5eCYlconpZofTCtb7YBsad25yrbstG6_r9oFc71WVhogGRp7AOnhA0iSoRCjKEM4zlEeZ0XuwyeQuMBhvkpzjFZFilY5TgYfvsbYKEzjxJljHBURLnCWZD5wJozSd8eVHzd_-AZOowna"
  alt="Zustandsautomat für den Workflow-Status"
/>
