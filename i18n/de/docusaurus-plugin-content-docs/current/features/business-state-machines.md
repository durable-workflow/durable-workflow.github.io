---
sidebar_position: 12
title: Fachliche Zustandsautomaten
description: Experimentelles Übergangsprotokoll für gemeinsame fachliche Zustände, integrationsspezifische Richtlinienprofile, verschachtelte untergeordnete Automaten und beibehaltene Kompensation in eingebetteten Laravel-Workflows.
---

# Fachliche Zustandsautomaten {#business-state-machines}

:::warning Experimentell

Die API `Workflow\V2\StateMachine` sowie der von ihr verwendete bestätigte Kindstart (`Workflow::startChild()`) und `DurableScope::reserveChild()` sind experimentell. Sie werden ab Workflow 2.29.0 experimentell ausgeliefert, fallen nicht unter die Stabilitätsgarantien des Pakets und können sich in einem Minor-Release ändern. Sie sind eine `experimental`-Oberfläche gemäß den [Stabilitätsstufen](../compatibility.md#stability-levels). Die übrige von ihr verwendete API für beibehaltene Kompensationsbereiche ist seit Workflow 2.33.0 stabil. Der Katalog für Kindbindungen, die Übergangserklärungen und `MachineInspection` kamen in Workflow 2.41.0 hinzu.

Die Beispiele auf dieser Seite sind Quellbeispiele aus dem Repository mit synthetischen Anbietern. Sie sind keine Qualifizierung für installierte Pakete oder echte Anbieter. Nichts auf dieser Seite impliziert:

- die Migration einer laufenden Ausführung auf eine neue Definitions-, Profil-, Regel- oder Handler-Version;
- rekursive oder gemeinsam genutzte untergeordnete Automaten;
- Garantien für einen echten Zahlungsanbieter, Versanddienstleister oder Lageranbieter;
- dass die Funktion für fachliche Zustandsautomaten vollständig ist oder ein stabiles Release hat.

:::

Dieser Leitfaden behandelt das optionale fachliche Übergangsprotokoll für eingebettete Laravel-Workflows mit `Workflow\V2\Workflow`. Es baut auf vorhandenen Primitiven auf: Aktivitäten, untergeordneten Workflows, dauerhaften Wartevorgängen, Replay und [Saga](sagas.md)-Kompensation. Bestehende Workflows und `Workflow\States\StateMachine` bleiben unverändert.

## Wann Sie es verwenden {#when-to-use-it}

Verwenden Sie das Protokoll, wenn fachliche Zustände eine gemeinsame Bedeutung haben, der Weg dorthin sich aber zwischen Integrationen unterscheidet:

- **Gemeinsame Bedeutungen der Automaten.** Eine `MachineDefinition` deklariert die Bedeutungen der Zustände, die Übergangsidentitäten, eine verpflichtende Invariante und benannte Kind-Slots.
- **Integrationsspezifische Richtlinien.** Jedes `PolicyProfile` wählt innerhalb dieser Definition seine Kanten, Handler-Versionen und benannten Bedingungen. Eine Integration kann vor einem Übergang eine externe Operation verlangen; eine andere kann den Nachweis bereits liefern und die Arbeit überspringen.
- **Verschachtelte untergeordnete Automaten.** Eine Order kann einen Shipment-Automaten hosten, solange sie sich in einem deklarierten Zustand befindet. Die Bindung bewahrt die ursprüngliche Identität des Kindes über Wiederholungen, Zustandswechsel und Worker-Neustarts hinweg.
- **Geschützte fachliche Entscheidungen.** Der neue fachliche Zustand wird über eine anwendungseigene Grenze festgeschrieben, die den erwarteten Zustand, die Revision und einen angenommenen Abbruch prüft.
- **Beibehaltene Kompensation.** Verpflichtungen können über beibehaltene Kompensationsbereiche den Lauf überdauern, der sie erzeugt hat.

Wenn ein Workflow mit einer Saga genügt, verwenden Sie [Sagas](sagas.md) und [untergeordnete Workflows](child-workflows.md) direkt.

## Der Übergangsvertrag {#the-transition-contract}

Jeder Übergangs-Handler implementiert dieselben vier Methoden, unabhängig von Automat oder Integration:

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` beantwortet, ob das Ziel bereits erreicht ist. Die Methode ist eine reine Projektion der aufgezeichneten Zielbewertung.
- `canExecute()` beantwortet, ob die Arbeit zulässig ist. Die Methode ist eine reine Projektion der aufgezeichneten Berechtigungsbewertung.
- `execute()` orchestriert aufgezeichnete Aktivitäten oder dauerhafte Wartevorgänge und gibt einen `ExecutionReceipt` zurück. Der Beleg bestätigt die Arbeit; er begründet keine Bereitschaft zum Commit.
- `compensate()` erhält die ursprüngliche `ExecutionReference`. Kehren Sie erst zurück, nachdem die erforderlichen Wirkungen oder deren Ausbleiben verifiziert sind. Unbekannte oder ausstehende Arbeit muss warten oder explizit fehlschlagen und darf niemals erfolgreich zurückkehren.

Erweitern Sie `AssessedTransitionStep`, um die beiden Guards direkt aus dem aufgezeichneten Snapshot zu implementieren. Der Runner weist einen benutzerdefinierten Guard zurück, der der aufgezeichneten Bewertung widerspricht.

## Wie der Runner einen Übergang ausführt {#how-the-runner-executes-a-transition}

`TransitionRunner::run()` nimmt den Workflow, das fixierte Profil, die ursprüngliche `ExecutionReference`, das Ereignis, eine `TransitionRuntime` und eine geschlossene Handler-Registry entgegen. Anschließend geht er so vor:

1. Er wählt die eindeutige Kante für das Ereignis und den Quellzustand. Ohne Kandidaten liefert er `Unavailable`, bei mehreren `Ambiguous`.
2. Er fordert einen aufgezeichneten `before`-Snapshot an und prüft, wenn das Profil eine Definition hat, deren gemeinsame Invariante. Eine nicht erfüllte Invariante liefert `Blocked`, eine unbekannte `Unknown`.
3. Er prüft den Ziel-Guard. Ein erfülltes Ziel überspringt die Arbeit, durchläuft aber dennoch den geschützten Commit; das Überspringen übernimmt nicht die Verantwortung für bereits vorhandene externe Wirkungen. Ein unbekanntes Ziel liefert `Unknown`.
4. Er liefert `Pending`, wenn die Kante keine Arbeit deklariert. Andernfalls prüft er den Ausführungs-Guard und zeichnet die Live-Zulassung auf. Eine Ablehnung liefert `Blocked`, eine unbekannte Antwort `Unknown`.
5. Er registriert die Kompensation des ursprünglichen Schritts bei der nativen Saga und ruft dann `execute()` auf.
6. Er fordert einen frischen `after`-Snapshot an und prüft Invariante und Ziel erneut. Ein veralteter Quellzustand oder eine veraltete Revision liefert `Conflict`, ein nicht erfülltes Ergebnis `Pending` und ein unbekanntes `Unknown`. Ein erfülltes Ziel geht zum geschützten Commit über.
7. Er schreibt über die Runtime fest, die `Committed`, `Conflict` oder `CancellationRequested` meldet.

`TransitionStatus`-Werte sind Verarbeitungsergebnisse, nicht Ihr Katalog fachlicher Zustände. Der Runner wiederholt nie einen ganzen Übergang und kompensiert einen blockierten Übergang nie von selbst. Die Anwendung entscheidet, ob gewartet, wiederholt, abgeglichen oder kompensiert wird. Ein Ergebnis ist keine Erlaubnis, den besitzenden Workflow zu schließen: Halten Sie ihn offen, solange Vorwärtsarbeit oder Kompensationsverpflichtungen bestehen.

`ActivityTransitionRuntime` implementiert `TransitionRuntime` mit drei Anwendungsaktivitäten (Snapshot, Zulassung und Commit) und einer optionalen `MachineDefinition`. Sie verwendet gewöhnliche Aktivitätshistorie und fügt weder einen Worker-Befehl noch ein Historienereignis hinzu. Im konfigurierten Order/Shipment-Beispiel durchläuft jeder Übergang denselben Runner-Aufruf:

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

Die drei Aktivitätsklassen sind Anwendungscode, keine Paketklassen.

## Definitionen, Profile und Versionen {#definitions-profiles-and-versions}

Eine `MachineDefinition` enthält, was alle Integrationen gemeinsam haben. Die Definition in Version zwei des Beispiels deklariert vier Zustände, die Übergangsidentitäten, eine Invariantenregel und den Shipment-Kind-Slot:

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` hängt die `TransitionDefinition`-Kanten und benannten Bedingungen einer Integration an diese Definition an. Ein Profil kann keinen nicht deklarierten Zustand und keine nicht deklarierte Übergangsidentität hinzufügen, und benannte Profilbedingungen können die gemeinsame Invariante nicht ersetzen.

Für die Versionierung gelten diese Regeln:

- **Fingerprints.** Der Definitions-Fingerprint umfasst die Bedeutungen der Zustände, die Invariante und die Slot-Deklarationen. Der Profil-Fingerprint umfasst die Definitions- und Profilmetadaten, den Graphen, die Bedingungsstrukturen, die Handler-Versionen und etwaige Limits. Keiner von beiden hasht PHP-Implementierungen.
- **Fixierte Ausführungen.** Eine `ExecutionReference` fixiert Scope, fachliches Subjekt, Ausführungs-ID, Richtlinien-Fingerprint, erwarteten Quellzustand und Revision. Zeichnen Sie den ausgewählten Fingerprint auf, bevor die Arbeit beginnt, und übergeben Sie ihn beim Replay erneut. Berechnen Sie ihn beim Fortsetzen niemals aus der neuesten Konfiguration.
- **Nur neue Ausführungen.** Eine neue Definitions- oder Profilversion wird für neue Ausführungen ausgewählt. Das Umschreiben der Zuordnung eines laufenden Subjekts ändert dessen Fingerprint, und die ursprüngliche Ausführung verweigert sich danach. Es gibt keine API zur Migration laufender Ausführungen.
- **Beibehaltene Implementierungen.** Lassen Sie alte Definitionen, Regeln, Handler und Autorisierungsversionen bereitgestellt, solange ihre Ausführungen oder beibehaltenen Verpflichtungen wiederherstellbar bleiben. Handler stammen aus einer geschlossenen Typ-/Versions-Registry mit dem Schlüssel `TransitionDefinition::handlerKey()`. Gespeicherte Daten können keine PHP-Klasse auswählen, und ein fehlender Handler schlägt vor jeglicher Anwendungs-I/O fehl.

Die allgemeinen Regeln für Änderungen an Workflow-Code finden Sie unter [Versionierung](versioning.md).

## Regeln, Bedingungen und aufgezeichnete Fakten {#rules-conditions-and-recorded-facts}

Die Konfiguration wählt Bedingungen aus; Regelimplementierungen bleiben vertrauenswürdiger Anwendungscode. Eine in vertrauenswürdigem Bootstrap-Code aufgebaute `RuleRegistry` ordnet einem Regeltyp und einer Version ein `ConditionRule`-Objekt zu. Eine `RuleReference` fixiert Typ, Version und Parameter, und `ConditionDefinition::rule()`, `all()`, `any()` und `not()` kombinieren diese Blätter. Eine Bedingung hat höchstens 64 Knoten.

Entscheidungen haben drei Werte: `Verdict::Satisfied`, `Verdict::Unsatisfied` und `Verdict::Unknown`. Bei `all()` macht ein nicht erfülltes Kind die Gruppe nicht erfüllt; andernfalls macht ein unbekanntes Kind sie unbekannt. Bei `any()` macht ein erfülltes Kind die Gruppe erfüllt; andernfalls macht ein unbekanntes Kind sie unbekannt. Die Negation von unbekannt bleibt unbekannt.

Fakten werden nur in der aufgezeichneten Snapshot-Aktivität erhoben. Der `AssessmentStore` des Beispiels zeichnet die Fakten mit Nachweisreferenzen auf und wertet die Ziel- und Berechtigungsbedingungen des Profils aus:

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

Wenn das Profil eine Definition hat, wertet dieselbe Aktivität `MachineDefinition::assess()` aus und gibt `MachineAssessment::fromEvaluation()` als `machineAssessment` des Snapshots zurück. Bewahren Sie die vollständige Erklärung aus `ConditionEvaluation::toArray()` zusammen mit dem Snapshot auf. Eine fehlende Bewertung, eine geänderte Definition oder eine geänderte Bedingung führt vor der Arbeit zur Ablehnung. Eine aufgezeichnete Bewertung ist ein Nachweis des Hosts, keine Autorisierung: Der geschützte Commit muss weiterhin Live-Befugnis, Revision und Abbruch prüfen.

## Deterministisches Replay {#deterministic-replay}

Das Protokoll stützt sich auf aufgezeichnete Historie, daher gelten die üblichen [Workflow-Einschränkungen](../constraints/workflow-constraints.md) strikt:

- Guards und Regeln führen keine I/O aus. Sie lesen weder die Datenbank noch die Konfiguration, einen Anbieter oder den Container.
- Live-Lesevorgänge finden innerhalb der Snapshot-Aktivität statt. Beim Replay liefern abgeschlossene Aktivitäten ihre aufgezeichneten Ergebnisse; Regeln werden nicht erneut gegen Live-Daten ausgewertet.
- Ein `after`-Snapshot muss eine andere Snapshot-ID und frisch erhobene Fakten verwenden. `SnapshotPhase` trennt `before`-, `after`- und `compensation`-Nachweise, sodass eine Phase nicht für eine andere einstehen kann.
- `execute()` und `compensate()` rufen Aktivitäten auf. Kapseln Sie einen synchronen Anbieter- oder Anwendungs-Handler in einer Aktivität; ein direkter Aufruf aus Workflow-Code kann dessen Wirkungen beim Replay wiederholen.
- Die Zulassung zeichnet nur Befugnis und Berechtigung auf. Sie darf die vorwärts gerichtete fachliche Wirkung nicht vor der Saga-Registrierung ausführen.
- Verwenden Sie `TransitionResult::toArray()` über Workflow- und Historiengrenzen hinweg. Domänenobjekte der Anwendung bleiben hinter Ihren Schritt- und Runtime-Adaptern.

## Geschützte fachliche Commits {#protected-business-commits}

Die Commit-Aktivität ist die fachliche Autorität der Anwendung. Sie muss:

1. Die Entscheidungs-ID an Scope, Subjekt, Richtlinie, Übergang und Inhalt binden. Ein exaktes Duplikat liefert das aufgezeichnete Ergebnis; die Wiederverwendung der ID für anderen Inhalt wird abgelehnt.
2. Live-Befugnis, den erwarteten Quellzustand und die Revision sowie jeden angenommenen Abbruch unter der maßgeblichen Sperre der Anwendung erneut prüfen.
3. Den fachlichen Zustand, die Entscheidung und eine etwaige Veröffentlichungsabsicht atomar aufzeichnen, wenn sie sich einen Speicher teilen.
4. Nach einer verlorenen Bestätigung genau diese Entscheidung nachschlagen oder wiederholen, statt Wirkungen zu wiederholen.

Sie gibt ein `CommitResult` mit `committed`, `conflict` oder `cancellation_requested` zurück. Der letzte Status bedeutet, dass ein angenommener Abbruch diesen Commit verhindert hat. Er bedeutet nicht, dass die Kompensation abgeschlossen oder die fachliche Entität abgebrochen ist. Zwischen dem Anwendungsspeicher und Durable Workflow wird keine verteilte Transaktion impliziert.

## An Elternzustände gebundene untergeordnete Automaten {#child-machines-bound-to-parent-states}

Ein `ChildSlot` in der Elterndefinition benennt den Slot, seine Host-Zustände, den untergeordneten Automaten und dessen Definitionsversion sowie das erforderliche fachliche Ergebnis. `MachineDefinition::assertBinding()` prüft eine Bindung gegen diese Deklaration. Die Methode führt kein Nachschlagen, keine Autorisierung und keine Zulassung durch.

### Katalog für Kindbindungen {#child-binding-catalog}

Ab Workflow 2.41.0 registriert ein `MachineCatalog` die Definitionen, die einander hosten dürfen. Beim Erstellen wird jeder Slot auf eine registrierte `machine@version` aufgelöst, und ein ungültiger Graph wird abgelehnt, bevor eine Bindung ihn verwendet:

```php
$catalog = new MachineCatalog([$orders, $returns, $shipments], maxChildDepth: 1);

$catalog->child($orders, 'shipment');
$catalog->assertBinding($parentProfile, $binding, $childProfile);
```

- Eine doppelte Automatenversion, ein Slot, der ein nicht registriertes Kind benennt, und eine rekursive oder zyklische Bindung lösen `InvalidMachineCatalog` aus. Sein `reason` ist `state_machine_definition_duplicate`, `state_machine_child_definition_unregistered` oder `state_machine_child_binding_cycle`. Ein Automat, der sich selbst hostet, direkt, über andere Automaten oder unter einer anderen Version, ist ein Zyklus.
- `InvalidMachineCatalog::$path` listet die Route auf, zum Beispiel `orders@1 -> shipment:shipments@1 -> parent:orders@1`.
- Das optionale `maxChildDepth` löst `ResourceLimitExceeded` mit der Dimension `child_depth` aus, wenn die tiefste Slot-Route länger ist; `observed` meldet diese Tiefe. Beibehaltene Kompensation unterstützt eine Kindebene, verwenden Sie daher `maxChildDepth: 1`, wenn Kinder an beibehaltenen Bereichen teilnehmen.
- Mehrere Eltern oder Host-Zustände können eine Kinddefinition gemeinsam nutzen.
- `$catalog->assertBinding()` verlangt außerdem, dass beide Profile genau die registrierten Definitionen verwenden, verglichen per Fingerprint.

Der Katalog ist optional. Der native Kindstart, Reservierungen und `MachineDefinition::assertBinding()` ziehen ihn nicht heran; rufen Sie `$catalog->assertBinding()` daher in der Bindungsautorisierung des Hosts auf, wie es das konfigurierte Beispiel tut. Ein Katalog ist Konfiguration: Jede Ausführung pinnt weiterhin ihre eigenen Fingerprints, und das Ersetzen des Katalogs migriert nichts.

Eine `BindingIdentity` fixiert die ursprüngliche Elternausführung, Namespace, Elterninstanz und -lauf, Slot, **Generation**, Host-Zustand, untergeordneten Workflow-Typ, Richtlinien-Fingerprint des Kindes, erforderliches Ergebnis, Eingabe-Fingerprint und Kindoptionen. Die Generation identifiziert einen einzelnen Eintritt in einen Zustand. Anfragen für eine alte Generation werden nie zu einem neueren Kind umgeleitet, nachdem der Eltern-Workflow einen Zustand wechselt oder erneut betritt.

Das Starten und das Abwarten eines Kindes sind getrennte Übergänge:

- **Start.** Der Eltern-Workflow reserviert das Kind und lässt es zu, zeichnet die exakte Bindung auf und schreibt erst dann den Host-Zustand fest. Ist die Bindung bereits aufgezeichnet, verwendet der Schritt sie wieder, statt erneut zu starten. Mit beibehaltenen Bereichen gibt `DurableScope::reserveChild()` eine `ChildReservation` zurück, und `ChildReservation::start()` verwendet den bestätigten nativen Kindstart. `ChildReservationStore::close()` liefert später entweder die zugelassene `ChildBinding` oder ein endgültiges `NeverAdmittedChild`.
- **Abwarten.** Ein späterer Übergang beobachtet dieselbe Zulassung. Er erzeugt weder ein zweites Kind noch einen zweiten Kompensationseigentümer.

Der gemeinsame Schritt des Beispiels zeigt beide Übergänge:

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

Ohne Reservierung gibt `Workflow::startChild()` einen `StartedChildWorkflow`-Beleg zurück, den ein späterer Schritt mit `await()` abwarten kann. Der Eltern-Workflow muss das fachliche Ergebnis des Kindes verifizieren; ein technischer Abschluss des Kindes, ein angenommenes Signal oder ein Timeout genügt nicht. `Workflow::startChild()` ist nur eingebettet verfügbar; eine Ausführung über das Worker-Protokoll lehnt es ab.

## Kompensation und beibehaltene Bereiche {#compensation-and-retained-scopes}

Der Runner registriert den ursprünglichen Schritt bei der nativen Saga, bevor `execute()` suspendieren oder fehlschlagen kann. Der Callback erfasst die ursprüngliche Ausführung und den Schritt, nicht den Beleg. Während der Kompensation fordert der Runner einen frischen `compensation`-Snapshot an und ruft `compensate()` mit der ursprünglichen Ausführung auf. Verwenden Sie die standardmäßige sequenzielle Kompensation.

Ein laufgebundener Saga-Callback endet mit seinem Lauf. Beibehaltene Kompensationsbereiche (`Workflow\V2\Compensation`) halten jede Verpflichtung in einem dauerhaften Ledger fest, sodass sie kompensiert werden kann, nachdem der auslösende Lauf geschlossen wurde. Der [Leitfaden zu Kompensationsbereichen](./compensation-scopes.md) beschreibt diese API und welche ihrer Teile stabil sind. In den Beispielen wird jede externe Wirkung über `DurableScope::execute()` als `Obligation` registriert, bevor sie ausgelöst wird, und ein Kindbereich wird verifiziert, bevor frühere Wirkungen des Eltern-Workflows rückgängig gemacht werden. Die eigene Kompensation des Schritts verifiziert dann nur seine ursprünglichen Verpflichtungen:

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

Der fachliche Abbruch ist eine separate Entscheidung. In den Beispielen schreibt ein reiner Nachweisübergang `cancelled` erst fest, nachdem der beibehaltene Bereich verifiziert ist. Ein technischer Abbruch, eine eingereihte Wiederherstellungsanforderung oder eine fehlgeschlagene Kompensation begründet ihn nicht. Der aktuelle beibehaltene Graph hat eine Eltern-/Kind-Ebene, höchstens 16 Kinder und 256 Verpflichtungen pro Bereich. Die Vorwärtsverantwortung von Wurzel und Kind geht nicht auf Nachfolger durch Continue-as-new oder Redrive über, und die Freigabe der Aufbewahrung bleibt explizit.

## Budgets und explizite Ergebnisse {#budgets-and-explicit-outcomes}

Vertrauenswürdige Konfiguration kann einen Automaten begrenzen:

- `DefinitionLimits` (`states`, `transitions`, `childSlots`, `ruleNodes`) wird `MachineDefinition` als `limits:` übergeben. Jedes gebundene Profil prüft zusätzlich seine expandierten Quellkanten und die Gesamtzahl seiner Bedingungsknoten.
- `ExecutionLimits` (`commands`, `historyEvents`, `historyBytes`, `groupDepth`) wird mit `PolicyProfile::withLimits()` oder dem Argument `limits:` von `PolicyProfile::forDefinition()` angehängt. Das Befehlsbudget umfasst jede dauerhafte Suspendierung innerhalb von `TransitionRunner`, bis zu 4.096 Befehle und 64 Gruppenebenen. Historienwerte sind Zulassungsschwellen, die vor jedem Befehl mit `Workflow::historyBudgetAtStep()` gemessen werden, keine absoluten Obergrenzen.

Beide Limits fließen in ihre Fingerprints ein. Werden sie weggelassen, bleiben frühere Fingerprints erhalten; das Hinzufügen oder Ändern eines Budgets erfordert eine explizit ausgewählte Version für neue Ausführungen.

Ein während der Ausführung erreichtes Budget liefert `TransitionStatus::Blocked` mit dem Grund `state_machine_<dimension>_limit_exceeded`. Eine ungültige Definition löst `ResourceLimitExceeded` mit Dimension, beobachteter Anzahl und Limit aus, bevor ein Handler läuft. Keines der beiden Ergebnisse bedeutet, dass ein Abbruch gelungen ist oder dass eine frühere externe Wirkung nicht eingetreten ist. `Workflow::compensate()` läuft außerhalb der Vorwärtsbudgets.

## Diagnose {#diagnostics}

- `TransitionResult::toArray()` liefert Ausführung, Status, Grund, Bewertung und Übergangsschlüssel.
- Ab 2.41.0 nennt `TransitionResult::explain()` zusätzlich die `TransitionStage`, die das Ergebnis erzeugt hat, sowie den aufgezeichneten Snapshot und die Phase, die diese Prüfung ausgewertet hat. `toArray()` bleibt unverändert.
- `ConditionEvaluation::toArray()` bewahrt den Struktur-Fingerprint, die Snapshot-ID, Regelversionen, Gründe, Nachweisreferenzen und fehlende Fakten.
- `MachineAssessment::toArray()` zeichnet die an Definition und Snapshot gebundene Invariantenentscheidung auf.
- `ResourceLimitExceeded` stellt `dimension`, `observed` und `limit` bereit.
- `ScopeRecovery::describe()` meldet den Zustand eines beibehaltenen Bereichs, einschließlich der Fälle, in denen eine neue autorisierte Abbruchanforderung nötig ist.

Die Stufe unterscheidet Ergebnisse mit demselben Status:

| Stufe | Status | Bedeutung |
| --- | --- | --- |
| `selection` | `unavailable`, `ambiguous` | Keine eindeutige Kante für Ereignis und Quelle. Kein Snapshot. |
| `source` | `conflict` | Zustand oder Revision des Snapshots weichen von der erwarteten Quelle ab. |
| `invariant` | `blocked`, `unknown` | Die gemeinsame Invariante hat abgelehnt, vor oder nach der Arbeit. |
| `target` | `pending`, `unknown` | Das Ziel war unbekannt, hatte keine deklarierte Arbeit oder blieb nach der Arbeit unerfüllt. |
| `permission` | `blocked`, `unknown` | Der Ausführungs-Guard hat abgelehnt. |
| `admission` | `blocked`, `unknown` | Die aufgezeichnete Live-Zulassung hat abgelehnt. |
| `budget` | `blocked` | Ein Vorwärtsbudget hat den nächsten Befehl abgelehnt. Kein Snapshot. |
| `commit` | `committed`, `conflict`, `cancellation_requested` | Der geschützte Commit hat die Entscheidung bestätigt. |

Für die Stufen `invariant`, `target` und `permission` findet die Snapshot-ID die `ConditionEvaluation`, die der Host für diesen Snapshot aufbewahrt hat. Bei `admission` und `commit` stammt der Grund aus der aufgezeichneten Zulassung oder dem Commit, und der Snapshot kennzeichnet nur die verwendeten Belege. Eine Ablehnung nach der Arbeit nennt den `after`-Snapshot.

`MachineInspection` gibt Betriebswerkzeugen eine versionierte Sicht auf ein fachliches Subjekt. Der Host erstellt sie außerhalb des Workflow-Codes aus Werten, die er bereits autorisiert hat:

```php
$inspection = new MachineInspection(
    $profile, $state, $revision, $execution, $result,
    [$childBinding, $childReservation, $neverAdmittedChild],
    [['scope' => $scopeIdentity, 'description' => $scopeRecovery->describe($scopeIdentity, $principal)]],
);
$view = $inspection->toArray();
```

- `machine` enthält die gepinnten Automaten-, Definitions- und Profilversionen mit ihren Fingerprints. `business` ist der aktuelle Zustand mit Revision aus dem Speicher der Anwendung, getrennt vom Status des Workflow-Laufs. `transition` ist das `explain()` der Ausführung.
- `children` hat einen Eintrag pro Bindungsgeneration und kann daher kürzer sein als die übergebene Liste. Jeder Eintrag hat einen `status` (`admitted`, `never_admitted` oder `reserved`), den Bindungsschlüssel, Slot, die Generation, den Host-Zustand, das erforderliche Ergebnis, die bindende Ausführung, Kindinstanz und -lauf sowie eine Abschluss-ID. Ein zugelassenes Kind ist kein Beleg für sein fachliches Ergebnis.
- `participation` verknüpft ein Kind mit den IDs seines beibehaltenen Eltern- und Kindbereichs und dem Verpflichtungsschlüssel, die sich mit der `scopeId` der `compensation`-Einträge verbinden lassen. Übergeben Sie die `ChildReservation` eines zugelassenen Kindes neben seinem `ChildBinding`. Ein `participation` von null bedeutet, dass das Kind keine beibehaltene Teilnahme hat oder keine Reservierung übergeben wurde.
- `compensation` listet Identität und ID jedes Bereichs mit den Schlüsseln von `ScopeRecovery::describe()` auf.

Die Erstellung lehnt einen nicht deklarierten Zustand, eine Ausführung unter einem anderen Profil, einen Übergang einer anderen Ausführung, Kindarbeit eines anderen Subjekts oder Profils, widersprüchliche oder wiederholte Generationen, wiederholte Bereiche und fehlerhafte Bereichsbeschreibungen ab. Sie führt keine I/O aus und autorisiert nichts. Bereichsschlüssel werden von der Anwendung definiert, daher ordnet der Host Wurzelbereiche dem Subjekt zu.

## Ausführbare Beispiele {#runnable-examples}

Die Beispiele liegen im Workflow-Repository und laufen gegen dessen Entwicklungsabhängigkeiten und Testdatenbank. Sie verwenden eigene, wegwerfbare Anwendungstabellen, keine Paketmigrationen.

| Beispiel | Was es zeigt |
| --- | --- |
| [Konfigurierte Order und Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | Zwei Integrationsprofile, `prepare` und `imported`, mit denselben Zuständen und einem gemeinsamen Schritt. Die Vorbereitung hostet Shipment in `working`; der Import hostet es in `received`. Eine reine Nachweiskante `reconcile` überspringt Arbeit, wenn Nachweise vorliegen. Version zwei fügt gemeinsame Definitionen für neue Subjekte hinzu, während Version eins fixiert bleibt. Enthält Kindreservierung, beibehaltene Kompensation und den Abschluss des Abbruchs. |
| [Anbietergestützte Order, Payment und Shipment](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | Drei Automaten auf demselben Protokoll gegen ein synthetisches Anbieterjournal. Die Rezepte decken Checkout mit Reservierung zuerst und mit Zahlung zuerst ab, Erstattungsergebnisse, Autorisierung und Capture nach Bestand oder Lieferung, Finanzierung per Bank, Nachnahme (COD), Anzahlung und Restzahlung sowie Abonnement, Cart-Leases, Geldbeträge in Einheiten, Teilbestand, Rücksendungen, Umtausch, Zustellvorfälle und Wiederherstellung nach Worker-Verlust. |
| [Fachliche SQL-Entscheidungen](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | Ein anwendungseigener geschützter Commit mit SQL-Fencing für Abbruch, Revisionskonflikte, Entzug von Befugnissen, Veröffentlichungsabsicht und verlorene Bestätigungen sowie native verschachtelte Kompensation von Order und Shipment. |

Führen Sie die Tests des konfigurierten Beispiels im Workflow-Repository aus:

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

Alle drei verwenden synthetische Anbieter oder Anbieter in derselben Datenbank. Sie qualifizieren weder einen echten Versanddienstleister, Zahlungsanbieter oder Lageranbieter noch ein Upgrade eines installierten Pakets oder eine Migration laufender Ausführungen. Eine echte Integration muss eigene Idempotenz, eigenes Fencing und einen eigenen Abgleich unsicherer Ergebnisse bereitstellen.

Die [Referenz zu fachlichen Zustandsautomaten](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md) im Engine-Repository dokumentiert den vollständigen Vertrag einschließlich der Payload-Formen der Aktivitäten. Der Lieferstatus wird in [durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069) verfolgt.
