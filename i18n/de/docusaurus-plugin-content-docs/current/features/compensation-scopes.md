---
sidebar_position: 12
title: Kompensationsbereiche
description: Kompensationsverpflichtungen in eingebetteten Laravel-Workflows über den erzeugenden Workflow-Lauf hinaus aufbewahren und nach dem Schließen des Laufs wiederherstellen.
---

# Kompensationsbereiche {#compensation-scopes}

Dieser Leitfaden behandelt aufbewahrte Kompensation in eingebetteten Laravel-Workflows mit `Workflow\V2\Workflow`. Eine [Saga](sagas.md) kompensiert innerhalb des Laufs, der sie registriert hat. Ein Kompensationsbereich hält jede Verpflichtung in einem dauerhaften Ledger fest, sodass die Verpflichtung auch dann noch kompensiert werden kann, wenn dieser Lauf abgeschlossen, fehlgeschlagen oder abgebrochen ist.

Verwenden Sie einen Bereich, wenn ein Abbruch spät eintreffen kann, etwa wenn ein Versand-Workflow abgeschlossen ist und die zugehörige Bestellung Tage später storniert wird, oder wenn ein vorwärts gerichteter Vorgang wirksam werden kann, ohne ein aufgezeichnetes Ergebnis zurückzugeben.

## Verfügbarkeit und Stabilität {#availability-and-stability}

| Teil | Status |
| --- | --- |
| `DurableScope`, `RegisteredObligation`, `Obligation`, `ScopeIdentity` | Stabil ab 2.31.0 |
| `ScopedOperation`, `OperationContext`, `ForwardResult`, `Resolution`, `HandlerRegistry` | Stabil ab 2.31.0 |
| `ScopeAuthorization`, `ScopeRecovery::request()`, `ScopeRecovery::describe()`, `ScopeRetention::release()` | Stabil ab 2.31.0 |
| `DurableScope::reserveChild()` und Root-Zulassung (`RootReservationStore`) | Experimentell |
| Mit `@internal` markierte Klassen (Aktivitäten, Persistenz, Wiederherstellungs-Engine) | Keine öffentliche API |

Die Bereichs-APIs wurden erstmals in 2.29.0 als experimentell ausgeliefert. Die automatische Wiederherstellung nach dem Schließen des ursprünglichen Laufs, der Wiederholungsplan der Wiederherstellung und `describe()` kommen mit 2.31.0. Vor 2.31.0 ist die gesamte API experimentell und kann sich in einem Minor-Release ändern. Ab 2.31.0 folgen die stabilen Teile der [2.x-Kompatibilitätsrichtlinie](../compatibility.md). Die anfängliche Unterstützung ist auf eingebettetes Laravel und sequenzielle Kompensation beschränkt.

## Funktionsweise {#how-it-works}

Ein Bereich wird durch `(application, namespace, key, generation)` identifiziert. Seine vorwärts gerichtete Arbeit gehört zu genau einem ursprünglichen Lauf; wählen Sie daher eine Generation, die für diesen Lauf eindeutig ist. Jede Verpflichtung wird zusammen mit ihrer Kompensation registriert, bevor ihre vorwärts gerichtete Wirkung ausgelöst wird. Das Ledger speichert:

- einen geschlossenen Handler-Typ und eine Handler-Version, niemals eine PHP-Closure;
- eine stabile Vorgangs-ID, mit der der Handler den Abgleich mit dem Anbieter durchführt;
- portable Eingaben (höchstens 16 KiB, 512 Werte und Tiefe 8);
- Ergebnisse der Vorwärtsausführung und der Kompensation, mit Nachweisreferenzen.

Solange der ursprüngliche Lauf offen ist, führt ein Abbruch die native Saga aus, die in umgekehrter Registrierungsreihenfolge kompensiert. Nach dem Schließen des Laufs kompensiert ein kanonischer Wiederherstellungs-Workflow dieselben Verpflichtungen anhand des Ledgers. Er öffnet den ursprünglichen Lauf nie erneut und ändert dessen Historie nicht.

## Host einrichten {#set-up-the-host}

Binden Sie in einem Service-Provider eine Autorisierungsrichtlinie für Bereiche und eine geschlossene Handler-Registry. Die Richtlinie gibt ihre Richtlinienversion zurück oder wirft eine Ausnahme, um abzulehnen.

```php
use App\Compensation\OrderScopeAuthorization;
use App\Compensation\StockReservation;
use Workflow\V2\Compensation\Execution\HandlerRegistry;
use Workflow\V2\Compensation\Security\ScopeAuthorization;

$this->app->singleton(ScopeAuthorization::class, OrderScopeAuthorization::class);
$this->app->singleton(HandlerRegistry::class, static fn (): HandlerRegistry => new HandlerRegistry([
    'stock.reserve' => ['1' => new StockReservation()],
]));
```

`ScopeAuthorization::assertAllowed($scope, $principal, $operation)` wird mit `register`, `forward`, `compensate`, `participate`, `request`, `release` oder `inspect` aufgerufen. Leiten Sie den Principal aus vertrauenswürdigen Anwendungsrichtlinien ab, niemals aus einer Anfrage-Nutzlast. Führen Sie die Paketmigrationen aus; sie legen die Ledger-Tabellen auf der Speicherverbindung des Workflows an.

## Verpflichtungen in einem Workflow registrieren {#register-obligations-in-a-workflow}

```php
use Workflow\V2\Attributes\Type;
use Workflow\V2\Compensation\Definition\Obligation;
use Workflow\V2\Compensation\Definition\ScopeIdentity;
use Workflow\V2\Compensation\DurableScope;
use Workflow\V2\Exceptions\WorkflowCancellationRequestedException;
use Workflow\V2\Workflow;

#[Type('order')]
final class OrderWorkflow extends Workflow
{
    public function handle(array $identity, array $shipment): array
    {
        $scope = new DurableScope($this, ScopeIdentity::fromArray($identity), 'order-service');
        try {
            $scope->execute(new Obligation('reserve-stock', 'stock.reserve', '1', ['sku' => 'sku-1']));
            $scope->participate('shipment', ScopeIdentity::fromArray($shipment));
            // ... start the shipment workflow, wait for business events ...

            return ['status' => 'completed'];
        } catch (WorkflowCancellationRequestedException $cancelled) {
            self::cancellationShield(fn () => $this->compensate());

            return self::cancellationShield(static fn () => $scope->verifyCompensation());
        }
    }
}
```

- `execute()` registriert die Verpflichtung und führt anschließend ihren vorwärts gerichteten Vorgang aus.
- `register()` registriert nur und gibt eine `RegisteredObligation` zurück. Rufen Sie deren `execute()` später im selben Workflow auf, wenn die Kompensationsreihenfolge von der Auslösereihenfolge abweichen muss.
- `participate()` registriert einen untergeordneten Bereich. Sequenzielle Kompensation wartet auf das verifizierte Ledger dieses untergeordneten Bereichs, bevor frühere Verpflichtungen des übergeordneten Bereichs kompensiert werden. Ein fehlender oder nicht verifizierter untergeordneter Bereich stoppt frühere Arbeit des übergeordneten Bereichs.

## Handler schreiben {#write-a-handler}

```php
use InvalidArgumentException;
use Workflow\V2\Compensation\Execution\ForwardResult;
use Workflow\V2\Compensation\Execution\OperationContext;
use Workflow\V2\Compensation\Execution\Resolution;
use Workflow\V2\Compensation\Execution\ScopedOperation;

final class StockReservation implements ScopedOperation
{
    public function assertInput(array $input): void
    {
        if (! is_string($input['sku'] ?? null)) {
            throw new InvalidArgumentException('A SKU is required.');
        }
    }

    public function execute(OperationContext $context): ForwardResult
    {
        // Idempotent by operation ID: a retry or a lost acknowledgement finds the same reservation.
        $reservation = Stock::reserve($context->operationId, $context->obligation->input['sku']);

        return ForwardResult::observed(['reservation' => $reservation->id], ['stock:' . $reservation->id]);
    }

    public function compensate(OperationContext $context): Resolution
    {
        if (! Stock::release($context->operationId)) {
            return Resolution::unknown('stock-release-pending');
        }

        return Resolution::verified(['stock-release:' . $context->operationId], true);
    }
}
```

Handler können für denselben Vorgang mehr als einmal laufen; machen Sie daher beide Methoden über `operationId` idempotent. Geben Sie `ForwardResult::unknown()` zurück, wenn das Ergebnis beim Anbieter ungewiss ist. Geben Sie `Resolution::verified()` nur mit einem Nachweis zurück, dass die Wirkung rückgängig gemacht wurde; ein Callback-Rückgabewert, ein Timeout oder ein geschlossener Lauf ist kein solcher Nachweis. `Resolution::unknown()` lässt die Verpflichtung ungelöst und erlaubt native Wiederholungen.

## Abbrechen und wiederherstellen {#cancel-and-recover}

Fordern Sie Kompensation mit einem stabilen Anfrageschlüssel an:

```php
use Workflow\V2\Compensation\Recovery\ScopeRecovery;

$result = app(ScopeRecovery::class)->request($scope, 'cancel-order-42', 'order-service', 'customer-cancelled');
```

- Ist der ursprüngliche Lauf noch offen, fordert die Anfrage ihn zum Abbruch auf, und seine Saga kompensiert.
- Schließt dieser Lauf, während der Bereich noch nicht verifiziert ist, leitet der Task-Watchdog dieselbe Anfrage bei seinem nächsten Durchlauf an die kanonische Wiederherstellung weiter. Er läuft in den Schleifen der Queue-Worker und in `workflow:v2:repair-pass` und autorisiert zuerst den ursprünglichen Principal erneut. Gleichzeitige Durchläufe oder eine konkurrierende manuelle Anfrage starten genau einen Wiederherstellungslauf.
- Ist der Lauf bereits geschlossen, startet die Anfrage die kanonische Wiederherstellung direkt.

Wiederherstellungsläufe unternehmen bis zu sechs Versuche pro Kompensation. Zwischen den Versuchen warten sie 1, 2, 5 und 10 Sekunden, danach eine Aktivitäts-Lease plus einen Task-Reparaturdurchlauf, sodass der Versuch eines abgestürzten Workers vor dem letzten Versuch zurückgewonnen wird. Die Verifizierung eines untergeordneten Bereichs oder eine neue autorisierte Anfrage weckt eine wartende Wiederholung sofort. Ein dauerhafter Fehler lässt den Wiederherstellungslauf dennoch fehlschlagen, wobei die Verpflichtung ungelöst bleibt.

Prüfen Sie das Ergebnis mit `describe()`. Der Aufruf ist schreibgeschützt und erfordert die Autorisierung `inspect`:

```php
$view = app(ScopeRecovery::class)->describe($scope, 'order-service');
// scopeStatus, originStatus, recoveryStatus, automaticRecovery, refusal, nextAction, unresolved
```

`nextAction` ist `submit_fresh_authorized_request`, wenn die automatische Wiederherstellung abgelehnt wurde (`automaticRecovery: recovery_authorization_failed`) oder ein Wiederherstellungslauf fehlgeschlagen ist. Senden Sie in diesem Fall einen neuen Anfrageschlüssel. Ein wiederholter Anfrageschlüssel gibt seine ursprüngliche Quittung zurück und startet nie einen weiteren Lauf.

Das Bereichs-Ledger erledigt die Kompensation. Eine fachliche Entscheidung, etwa die Bestellung als `cancelled` zu markieren, bleibt ein Schritt Ihrer Anwendung, nachdem `scopeStatus` den Wert `verified` hat. Empfohlen wird ein Listener, der die fachliche Stornierung abschließt, wenn ein Wiederherstellungslauf abgeschlossen ist, wie es das Anbieterbeispiel im Engine-Repository tut.

## Aufbewahrung, Upgrade und Rollback {#retention-upgrade-and-rollback}

- `ScopeRetention::release($scope, $principal)` entfernt nach der Verifizierung aufbewahrte Eingaben und Vorwärtsergebnisse. Es behält einen Tombstone, sodass eine alte Generation oder ein alter Anfrageschlüssel nie wieder akzeptiert werden kann. Nichts läuft automatisch ab, und das Bereinigen der Laufhistorie entfernt das Ledger nie.
- Ein Schema-Rollback wird abgelehnt, bevor eine Migration `down()` ausführt, solange das Ledger einen Bereich enthält, einschließlich eines freigegebenen Tombstones. Um zurückzukehren, stellen Sie ein vor dem Upgrade erstelltes Datenbank-Backup wieder her.
- Ein Downgrade nur des Pakets behält das Ledger. Die Wiederherstellung wird nach einem erneuten Upgrade fortgesetzt. Führen Sie kein Downgrade durch, solange ein Wiederherstellungslauf offen ist.

## Garantien und Grenzen {#guarantees-and-limits}

Ab 2.31.0 ändern sich die stabilen APIs innerhalb von 2.x nicht inkompatibel. Aufgezeichnete Kompensationshistorien werden in jedem späteren 2.x-Release wiedergegeben, und neues Verhalten kommt nur hinter einer aufgezeichneten Versionsmarkierung. Ledger-Migrationen fügen nur hinzu.

Diese Grenzen sind Mindestwerte, die steigen, aber nicht sinken können:

- 256 Verpflichtungen pro Bereich, 16 untergeordnete Bereiche pro übergeordnetem Bereich, eine Verschachtelungsebene;
- 128 Anfragen pro Bereich;
- 32 Nachweisreferenzen von höchstens 128 Bytes pro Ergebnis.

Nicht garantiert sind: das Timing des Watchdogs, genaue Wiederholungsintervalle (nur, dass die Wiederherstellung länger dauert als eine Lease-Reparatur), das Zeilenlayout des Ledgers und alles, was mit `@internal` markiert ist. Genau-einmal-Wirkungen nach außen werden nie zugesagt; der Abgleich mit dem Anbieter über die Vorgangs-ID liegt in der Verantwortung Ihres Handlers.

Der [Leitfaden zu Kompensationsbereichen](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md) im Engine-Repository dokumentiert den vollständigen Vertrag, einschließlich der experimentellen APIs für die Reservierung untergeordneter Bereiche und die Root-Zulassung.
