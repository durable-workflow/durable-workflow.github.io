---
sidebar_position: 3
---

# Updates {#updates}

Updates ermöglichen es, Informationen über den aktuellen Workflow-Zustand
abzurufen und ihn gleichzeitig zu verändern. Sie verbinden im Wesentlichen
eine Abfrage und ein Signal in einer Operation.

## Explizite Update-Befehle {#explicit-update-commands}

Jedes angenommene Update:

- ist ein Anfrage-Antwort-Aufruf an einen laufenden Workflow. `attemptUpdate*()` wartet auf den Handler-Abschluss. `submitUpdate*()` kehrt nach dauerhafter Befehlsannahme zurück und bietet mit `inspectUpdate($updateId)` spätere Statusabfragen;
- verwendet den deklarierten dauerhaften Updatenamen in Befehlshistorie und Webhook-Routing. `#[UpdateMethod('mark-approved')]` hält den öffentlichen aufrufbaren Namen über PHP-Methodenumbenennungen hinweg stabil;
- wird für historische oder bereits geschlossene Läufe abgelehnt, statt still den aktuellen Lauf zu verändern;
- lehnt nicht deklarierte Methodennamen als `rejected_unknown_update` und vertragswidrige Argumente als `rejected_invalid_arguments` (mit maschinenlesbaren `validation_errors`) vor Ausführung des Handlers ab.
- lehnt eine Anfrage, die Ihr [Update-Validator](#validate-updates-before-acceptance) ablehnt, vor der Annahme als `update_validator_rejected` ab.

Wie Abfragen spielen Updates zuerst festgeschriebene Historie erneut ab.
Anders als Abfragen dürfen sie Replay-sicheren Workflow-Zustand ändern und
einen Wert zurückgeben.

Deklarieren Sie eine Update-Methode am Workflow mit `UpdateMethod`.
Das optionale Zeichenfolgenargument legt einen dauerhaften öffentlichen Namen
fest, der PHP-Methodenumbenennungen übersteht:

```php
use Workflow\UpdateMethod;
use Workflow\V2\Workflow;

final class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[UpdateMethod('mark-ready')]
    public function updateReady(bool $ready): bool
    {
        $this->ready = $ready;

        return $this->ready;
    }
}
```

Rufen Sie die Update-Methode für den reinen Rückgabewert direkt auf:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$ready = $workflow->updateReady(true);
```

Dieser direkte PHP-Aufruf verwendet weiterhin den Methodennamen. Das dauerhafte
Befehlsziel bleibt `mark-ready`.

Verwenden Sie `attemptUpdate()`, wenn Sie auch das dauerhafte Befehlsergebnis
benötigen. Übergeben Sie dort den dauerhaften Updatenamen:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123');

$result = $workflow->attemptUpdate('mark-ready', true);

$result->accepted();        // true
$result->completed();       // true when the update body ran successfully
$result->updateStatus();    // "accepted", "completed", "failed", or "rejected"
$result->updateId();        // Durable update lifecycle id
$result->result();          // Raw update return value when completed
$result->failureMessage();  // Failure message when the update body threw
```

`attemptUpdate()` zeichnet zuerst das angenommene Update auf und wartet dann,
bis der Workflow-Worker es anwendet und seinen Lebenszyklus schließt. Die
Wartezeit wird durch `workflows.v2.update_wait.completion_timeout_seconds`
begrenzt. Hat der Worker das Update bei Ablauf des Budgets nicht geschlossen,
gibt `attemptUpdate()` den angenommenen Lebenszyklus mit
`waitTimedOut() === true` und `updateStatus() === 'accepted'` zurück.

Verwenden Sie `withUpdateWaitTimeout()`, wenn ein Aufruf ein anderes
Abschlussbudget benötigt:

```php
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::load('order-123')
    ->withUpdateWaitTimeout(5);

$result = $workflow->attemptUpdate('mark-ready', true);
```

Verwenden Sie `attemptUpdateWithArguments()`, wenn bereits eine positionale
Liste oder eine Zuordnung benannter Parameter vorliegt:

```php
$result = $workflow->attemptUpdateWithArguments('mark-ready', [
    'ready' => true,
]);
```

Benannte Zuordnungen werden gegen den dauerhaft gespeicherten
Update-Vertrag validiert und vor Annahme in Deklarationsreihenfolge normalisiert.

Verwenden Sie `submitUpdate()` oder `submitUpdateWithArguments()`, wenn der
Aufrufer nur dauerhafte Annahme benötigt und die spätere Anwendung durch den
Workflow-Worker akzeptiert:

```php
$accepted = $workflow->submitUpdate('mark-ready', true);

$accepted->accepted();     // true
$accepted->completed();    // false
$accepted->updateStatus(); // "accepted"
$accepted->result();       // null until the worker records UpdateCompleted
```

Verwenden Sie `inspectUpdate()`, wenn bereits eine `update_id` vorliegt und Sie
den gespeicherten Lebenszyklus später ohne erneutes Warten lesen möchten:

```php
$latest = $workflow->inspectUpdate($accepted->updateId());

$latest->updateStatus(); // "accepted"
$latest->closedAt();     // null until the lifecycle closes
```

`inspectUpdate()` wartet nicht auf Workflow-Ausführung. Es lädt den
gespeicherten dauerhaften Lebenszyklus neu und gibt das aktuelle
`UpdateResult` zurück.

## Updates vor der Annahme validieren {#validate-updates-before-acceptance}

Ohne Validator wird ein Update, das gegen eine Geschäftsregel verstößt, zuerst angenommen und schlägt dann fehl. Es wird als fehlgeschlagenes Update aufgezeichnet, und der Aufrufer kann eine fehlerhafte Anfrage nicht von einer fehlgeschlagenen Operation unterscheiden. Deklarieren Sie einen Validator, um die Anfrage vor der Annahme abzulehnen. Validatoren erfordern Workflow 2.42.0 oder neuer.

```php
use RuntimeException;
use Workflow\UpdateMethod;
use Workflow\UpdateValidator;
use Workflow\V2\Workflow;

final class CartWorkflow extends Workflow
{
    private array $items = [];

    #[UpdateMethod('add-item')]
    public function addItem(string $item): array
    {
        $this->items[] = $item;

        return $this->items;
    }

    #[UpdateValidator('add-item')]
    public function validateAddItem(string $item): void
    {
        if (count($this->items) >= 10) {
            throw new RuntimeException('The cart is full.');
        }
    }
}
```

`#[UpdateValidator]` benennt das Update über seinen dauerhaften Namen oder, wenn das Update keinen Alias hat, über seinen Methodennamen. Der Validator erhält dieselben Argumente wie das Update. Bevor das Update angenommen wird, rekonstruiert die Engine den Zustand des Laufs aus seinem Verlauf und ruft nur den Validator auf:

- Kehrt er normal zurück, wird das Update wie gewohnt angenommen und angewendet.
- Wirft er eine Exception oder gibt `false` zurück, wird das Update mit dem Grund `update_validator_rejected` und dem Ergebnis `rejected_invalid_arguments` abgelehnt. `rejectedByValidator()` ist dann wahr, `rejectionMessage()` liefert die Exception-Meldung, und `validationErrors()` liefert die Fehler einer Laravel-`ValidationException`. `update()` wirft eine `LogicException`, die beides enthält.
- Ein abgelehntes Update wird nie angenommen, sein Handler läuft nie, und der Workflow wird nicht geweckt. Wie jede andere Ablehnung wird es nur als Audit-Ereignis `UpdateRejected` aufgezeichnet, das der Replay ignoriert.

Validatoren sind schreibgeschützt. Sie können den wiederhergestellten Workflow-Zustand lesen, aber jeder dauerhafte Aufruf (eine Aktivität, ein Timer, ein Child-Workflow, ein Signal, ein Side Effect, `await`, Continue-as-New oder ein Upsert von Memo oder Suchattributen) wirft `UpdateValidatorCommandException` und lehnt das Update ab. Änderungen, die ein Validator am wiederhergestellten Zustand vornimmt, werden verworfen. Ein Generator-Validator wird abgelehnt, weil sein Rumpf nie ausgeführt wird.

Validatoren werden nicht im Verlauf aufgezeichnet und laufen nie während eines Replays, daher beeinflussen sie den Determinismus nicht. Sie sehen den Zustand aus dem persistierten Verlauf: Ein Update, das angenommen, aber noch nicht angewendet wurde, ist für sie nicht sichtbar. Replay und Validator laufen, während die Annahme des Updates die Sperren des Laufs hält; halten Sie Validatoren deshalb schnell.

Kann der Zustand nicht wiederhergestellt werden oder trifft der Validator auf einen Datenbankfehler, wird `UpdateValidationFailedException` geworfen, und nichts wird aufgezeichnet. Webhook-Routen für Updates beantworten das mit einem wiederholbaren `503` und `update_validation_failed`. Wiederholen Sie die Anfrage mit derselben Request-ID.

Eine Wiederholung eines abgelehnten Updates mit demselben Schlüssel liefert die gespeicherte Ablehnung, ohne den Validator erneut auszuführen.

## Nach einer ungewissen Antwort wiederherstellen {#recover-after-an-uncertain-response}

Dauerhafte Annahme, Handler-Abschluss und ein externer Geschäftseffekt sind
getrennte Tatsachen. Nach einem Aufrufer-Timeout kann ein angenommenes Update
weiterlaufen. Eine verlorene Antwort kann ein bereits festgeschriebenes
Ergebnis verbergen. Die spätere Ablehnung eines neuen Updates klärt das
ursprüngliche Ergebnis nicht.

Hat Ihre Anwendung eine Update-ID gespeichert, untersuchen Sie diesen
aufbewahrten Lebenszyklus, statt ein weiteres Update einzureichen. Bewahren
Sie die ursprüngliche Lauf-ID auf, damit Continue-as-new die Untersuchung nicht
umleitet:

```php
use Workflow\V2\WorkflowStub;

$latest = WorkflowStub::loadRun($savedRunId, $savedNamespace)->inspectUpdate($savedUpdateId);

$latest->updateStatus();
$latest->result(); // Available when that retained update completed.
```

Die gespeicherten IDs stammen aus der ursprünglichen Operation. Die Untersuchung
liest den aufbewahrten Datensatz und kann auch nach Abschluss oder
Historischwerden dieses Laufs funktionieren. Fehlende oder bereinigte Nachweise
lassen das Ergebnis ungeklärt. Sie erlauben nicht das Wiederholen eines
Geschäftseffekts. Bewahren Sie einen anwendungseigenen Operationsdatensatz zum
Abgleich auf, falls ursprüngliche Antwort und erzeugte Update-ID verloren gingen.

### Anfrage-IDs und aufbewahrte Belege {#request-ids-and-retained-receipts}

Speichern Sie Namespace, Instanz-ID, ursprüngliche Lauf-ID, Update-ID,
Operationsnamen und beabsichtigte Wirkung in Ihrem Anwendungsdatensatz. Ein
Annahmebeleg beweist dauerhafte Annahme. Ein abgeschlossener Lebenszyklus
liefert das aufgezeichnete Handler-Ergebnis. Keiner beweist, dass eine separate
Zahlung, E-Mail oder Datenbankschreiboperation genau einmal stattfand.

Eingebettete Laravel-Update-Webhooks lesen den Aufruferschlüssel aus
`X-Request-Id`. Erhalten Sie diesen Header beim Weiterleiten durch Proxys.
HTTP-Updates des eigenständigen Servers lesen den Schlüssel dagegen nur aus
`request_id` im JSON-Body; ihr Header `X-Request-Id` dient der Korrelation.
Ohne Body-Schlüssel hat das Update keinen Deduplizierungsschlüssel, auch wenn
mehrere Anfragen denselben Header verwenden.

Ein Befehlsschlüssel identifiziert ein Update auf einer Workflow-Instanz, über
alle ihre Läufe hinweg. Ab Workflow 2.18.0 hängen Sie ihn mit `withRequestId()`
an. Senden Sie nach einer verlorenen Antwort dasselbe Update mit demselben
Schlüssel erneut:

```php
use Workflow\V2\WorkflowStub;

$result = WorkflowStub::load('order-123')
    ->withRequestId('mark-ready-order-123')
    ->attemptUpdate('mark-ready', true);

$result->retained();          // True when this call returned an earlier admission
$result->intentVerified();    // False only for a legacy receipt
$result->requestIdConflict(); // True when the key already names a different update
$result->updateId();          // The original update on every matching retry
```

- Eine Wiederholung mit demselben Schlüssel, Updatenamen, denselben typisierten
  Argumenten und demselben expliziten Laufziel gibt den ursprünglichen Beleg
  einschließlich seiner Update-ID zurück und zeichnet nichts auf. Nach Abschluss
  oder Continue-as-new liefert die Wiederholung weiterhin das ursprüngliche
  Update. Sie nimmt kein neues Update in einem Nachfolgelauf an.
- Derselbe Schlüssel mit anderem Updatenamen, anderen Argumenten oder anderem
  Laufziel wird als `rejected_request_id_conflict` abgelehnt. `conflict()` nennt
  den aufbewahrten Befehl und die abweichenden Teile. Nichts wird aufgezeichnet,
  und der Schlüssel behält seinen ursprünglichen Beleg.
- Ein Beleg, der angenommen wurde, bevor Workflow die Befehlsabsicht
  aufzeichnete, wird mit `retained()` true und `intentVerified()` false
  zurückgelesen. Das ist die ursprüngliche Annahme, kein Nachweis, dass die
  Argumente dieser Wiederholung mit ihr übereinstimmen.
- Schlüssel umfassen 1 bis 255 Unicode-Zeichen und werden exakt verglichen. Ein
  ungültiger Schlüssel löst vor der Annahme `InvalidCommandRequestIdException`
  aus.

Verwenden Sie einen Schlüssel für eine logische Operation und ändern Sie nie
deren Argumente. Verwenden Sie für eine neue Operation einen neuen Schlüssel,
auch nachdem Sie bestätigt haben, dass ein Update mit Schlüssel abgelehnt wurde.
Releases vor Workflow 2.18.0 und nativem Server 3.9.0 vergleichen die Absicht
nicht: Dort liefert ein Schlüssel, der mit anderen Argumenten oder für einen
anderen Updatenamen wiederverwendet wird, den Beleg des ersten Updates.

Clients im Service-Modus senden den Schlüssel als `request_id` im Body. Native
Server 3.9.2 und neuer wenden dieselben Regeln an und ergänzen für einige
Legacy-Schlüssel eine Ablehnung `request_id_ambiguous`. Den HTTP-Vertrag und die
Aufrufe für PHP, Python, Rust und die CLI beschreibt
[Befehlsschlüssel für Signale und Updates](/docs/polyglot/server-api-reference#command-keys).

Die Wiederherstellung von Belegen hängt von aufbewahrten Befehls-, Update- und
Historiendatensätzen ab. Wenn die Aufbewahrung die Details eines Laufs bereinigt,
verschwinden auch seine Schlüssel, und eine spätere Anfrage unter diesem
Schlüssel wird als neuer Befehl angenommen. Es wird hier keine
anwendungsunabhängige Deduplizierungsdauer versprochen. Prüfen Sie die
[Historienaufbewahrung](../configuration/pruning-workflows.md) und bewahren Sie
Ihr Geschäftsbuch für die von Ihrer Anwendung benötigte Dauer auf. Fehlende
Nachweise bedeuten weiterhin ein unbekanntes Ergebnis.

### Den Geschäftseffekt schützen {#protect-the-business-effect}

Für eine Operation wie das Belasten einer Rechnung:

1. Speichern Sie vor dem Senden einen Anwendungs-Operationsschlüssel wie `tenant-1:charge:invoice-123` und seine unveränderliche Absicht. Verwenden Sie diesen Schlüssel bei der Wiederherstellung erneut.
2. Verwenden Sie in der ausführenden Aktivität eine eindeutige Datenbankbedingung für Mandant und Operationsschlüssel. Prüfen Sie die gespeicherte Absicht atomar, wenden Sie den lokalen Datenbankeffekt an und speichern Sie sein Ergebnis in einer Transaktion. Geben Sie bei einem Duplikat mit gleicher Absicht das gespeicherte Ergebnis zurück. Lehnen Sie eine andere Absicht ab.
3. Verwenden Sie bei externen Anbietern deren unterstützten Idempotenzvertrag oder eine Outbox mit Abgleichprozess. Eine Transaktion in Ihrer Datenbank kann einen separaten Anbieteraufruf nicht atomar machen.
4. Gleichen Sie nach einer ungewissen Antwort Operationsdatensatz, ursprünglichen Update-Lebenszyklus und Anbieternachweise ab. Dokumentieren Sie vor einer weiteren Aktion, ob der Effekt aussteht, festgeschrieben, fehlgeschlagen oder weiter unbekannt ist.

Eine Abfrage mit anschließendem Befehl lässt ein Rennen offen. Ein doppeltes
Signal kann eine weitere Aktivität auslösen, auch wenn das ursprüngliche
angenommen wurde. Die Anwendungssicherung muss wiederholte Zustellung
vertragen. Das geprüfte Beispiel führt zwei Aktivitäten für denselben
Schlüssel aus, schreibt aber nur einen lokalen Datenbankeffekt fest. Es
belegt keine Genau-einmal-Ausführung für beliebige externe Systeme.

Update-Regeln:

- `load($instanceId)` aktualisiert den neuesten dauerhaften Lauf dieser Instanz, auch nach Continue-as-new.
- Neue Updates über `loadRun($runId)` werden mit `rejected_not_current` abgelehnt, sobald der ausgewählte Lauf historisch ist. Die Untersuchung aufbewahrter Belege ist davon getrennt.
- Neue Updates gegen geschlossene Läufe werden mit `rejected_not_active` abgelehnt. Das Wiedergeben aufbewahrter schlüsselbezogener Belege ist davon getrennt.
- Ein Update, das angenommen wird, während die Workflow-Aufgabe läuft, die den Lauf abschließt, erhält wie ein Signal vor dem Schließen des Laufs einen Zustellungsdurchgang. Sein Handler läuft, und der Aufrufer erhält das Ergebnis. Updates, die noch ausstehen, wenn ein Lauf fehlschlägt, abgebrochen oder beendet wird, werden mit einem expliziten Fehler geschlossen.
- Fehlgeschlagene Update-Rümpfe schließen den Workflow-Lauf nicht. Sie werden als Update-bezogene Fehler aufgezeichnet und lassen den Lauf für die nächste Replay-Aufgabe offen.
- Abfragen spielen abgeschlossene Updates erneut ab. Abgelehnte oder fehlgeschlagene Updates bleiben ausschließlich nicht erneut abspielbare Befehls- und Historienfakten.
