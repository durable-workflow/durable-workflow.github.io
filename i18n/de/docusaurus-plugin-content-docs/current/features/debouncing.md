---
title: Revisionen entprellen und zusammenfassen
description: Aktualisieren Sie eine Entität nach einer Ruhephase mit dauerhaften Signalwarteoperationen.
---

# Revisionen entprellen und zusammenfassen {#debouncing-and-coalescing}

## Auf eine Ruhephase warten {#quiet-window}

Verwenden Sie pro Entität eine feste Workflow-ID. Behalten Sie die höchste positive Revision und aktualisieren Sie auf diese Version. Zwischenrevisionen werden bewusst übersprungen. Nutzen Sie dieses Muster für den neuesten Stand. Einzelne Zahlungen gehören in einen Ablauf, der jeden Auftrag verarbeitet.

Jedes Signal öffnet eine neue Warteoperation mit Zeitlimit. `null` beendet die Ruhephase. Die aufgezeichneten Warteoperationen und Timer steuern das Replay.

```php
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, await, continueAsNew};

#[Type('docs.entity-debounce')]
#[Signal('changed', [
    ['name' => 'revision', 'type' => 'int', 'allows_null' => false],
])]
final class EntityDebounce extends Workflow
{
    public function handle(
        string $entity,
        int $pending = 0,
        int $applied = 0,
        int $batches = 0,
    ): mixed {
        while (true) {
            if ($pending <= $applied) {
                $pending = max($applied, await('changed'));
            }

            while (($next = await('changed', timeout: 1)) !== null) {
                $pending = max($pending, $next);
            }

            if ($pending <= $applied) {
                continue;
            }

            activity(ApplyRevision::class, $entity, $pending);
            $applied = $pending;

            if (++$batches >= 2) {
                return continueAsNew($entity, 0, $applied, 0);
            }
        }
    }
}

#[Type('docs.apply-revision')]
final class ApplyRevision extends Activity
{
    public function handle(string $entity, int $revision): array
    {
        return ['entity' => $entity, 'revision' => $revision];
    }
}
```

Registrieren Sie den Workflow-Typ, damit ein neuer Worker oder Nachfolgelauf dieselbe Definition findet.

```php
config(['workflows.v2.types.workflows' => [
    'docs.entity-debounce' => EntityDebounce::class,
]]);
```

## Änderungen atomar annehmen {#embedded-intake}

```php
use Workflow\V2\WorkflowStub;

$entity = 'customer-42';
$revision = 1;
$receipt = WorkflowStub::make(EntityDebounce::class, 'refresh:'.$entity)
    ->signalWithStart('changed', [$revision], $entity);
```

Die Quittung bestätigt die dauerhafte Annahme. Die Aktivität kann noch ausstehen. Eingebettetes `signalWithStart` startet eine fehlende Instanz, signalisiert ihren aktiven Lauf oder erzeugt nach dem Abschluss einen neuen Lauf. Gewöhnliche Startregeln belassen eine geschlossene Instanz im geschlossenen Zustand.

## Offene Änderungen erhalten und die Historie begrenzen {#pending-input-and-continuation}

Ein Signal während der Aktivität bleibt bis zur nächsten Warteoperation offen. Der nächste Stapel erhält seine eigene Ruhephase. Die laufende Aktivität wird fortgesetzt. Übergeben Sie die angewandte und die bereits gelesene offene Revision als Fortsetzungsargumente. Offene, instanzbezogene Signale für deklarierte Handler können in den Nachfolgelauf gelangen. Ein laufbezogener Befehl bleibt an den ausgewählten Lauf gebunden.

Messen Sie die Historie mit repräsentativen Spitzen. `SignalReceived`, `SignalApplied`, Warteoperationen, Timer und Aktivitäten erzeugen Ereignisse. Dauernder Eingang kann die Historie vor dem Ende einer Ruhephase vergrößern. Begrenzen Sie Eingaben und lassen Sie Reserve für die Fortsetzung. Continue-as-new erhält die Ausführungsfrist.

Die Beispielaktivität gibt die ausgewählte Revision zurück. Verwenden Sie für echte Effekte einen Idempotenzschlüssel wie `(Entität, Revision)` im Zielsystem. Eine wiederholte Aktivität kann dieselbe externe Anfrage erneut senden, obwohl das Signal dedupliziert wurde.
