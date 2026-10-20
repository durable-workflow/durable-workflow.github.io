---
sidebar_position: 6
---

# Auf Bedingungen warten {#condition-waits}

`await($condition, $conditionKey = null)` ermöglicht Replay-sicheres Warten auf
Bedingungen. Verwenden Sie es, wenn das Prädikat nur von Workflow-Zustand
abhängt, der bereits aus dauerhaften Eingaben wie Updates, Aktivitätsergebnissen
oder Ergebnissen untergeordneter Workflows abgeleitet wurde. Wenn Sie direkt
den Wert eines benannten externen Signals benötigen, rufen Sie `await('name')`
auf. Siehe [Signale](./signals.md).

Das Warten auf Bedingungen wird durch eine Update-Methode statt durch
Signalmutatoren gesteuert:

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

Der optionale Bedingungsschlüssel ist eine stabile URL-sichere Betreiberkennung
für die Warteoperation. Replay prüft den zuvor aufgezeichneten Schlüssel,
damit eine spätere Bereitstellung denselben Workflow-Schritt nicht versehentlich
für ein anderes Prädikat wiederverwenden kann. Die sichere Weiterentwicklung
eines Workflows über Bereitstellungen hinweg beschreibt
[Versionierung](./versioning.md).

Warten auf Bedingungen mit Timeout beschreibt [Signal + Timer](./signal+timer.md).

**Wichtig:** `await()` sollte nur in einem Workflow verwendet werden, nicht in
einer Aktivität.
