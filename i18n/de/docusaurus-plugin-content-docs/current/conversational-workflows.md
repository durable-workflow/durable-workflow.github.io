---
sidebar_position: 8
tags:
  - signals
  - queries
  - continue-as-new
  - sample-app
keywords:
  - Konversations-Workflow
  - langlebige Konversation
  - menschliche Genehmigung
  - Worker-Ersatz
---

# Referenz für Konversations-Workflows {#conversational-workflow-reference}

Dies ist eine ausführbare Referenz für eine langlebige Konversation in der
eingebetteten Laravel-Laufzeit. Sie kombiniert Funktionen, die eigene
Leitfäden haben:
[Signale](./features/signals.md) für geordnete Eingaben,
[Aktivitäten](./defining-workflows/activities.md) für Modellarbeit,
[Abfragen](./features/queries.md) für den Status und
[Continue-as-new](./features/continue-as-new.md) zur Begrenzung der Historie.
Worker im Dienstmodus verwenden dieselben Grundbausteine über ihre
[SDK-Leitfäden](./polyglot/deployment-modes.md).

Die Quelle ist `ConversationWorkflow` in der
[Beispielanwendung](./sample-app.md), unter
[`app/Workflows/Conversation`](https://github.com/durable-workflow/sample-app/tree/main/app/Workflows/Conversation).
Sie verwendet ein deterministisches Ersatzmodell und benötigt daher weder ein
Konto bei einem KI-Anbieter noch Geheimnisse. Sie ist eine Referenz für das
Dauerhaftigkeitsmuster, kein produktiver Chatbot, und gibt keine Zusagen zu
Latenz oder Skalierung.

## Ausführen {#run-it}

Bei laufendem Warteschlangen-Worker der Beispielanwendung (`composer run dev`):

```bash
php artisan app:conversation \
  --message="Hello" \
  --message="Please refund my order" \
  --message="Thanks" \
  --turns-per-run=2
```

Ohne `--message` fragt der Befehl nach Eingaben. Enthält eine Nachricht
„refund“, schlägt das Ersatzmodell eine Aktion vor, und der Befehl fragt nach
einer Genehmigung. `--decision=decline` beantwortet vorgegebene
Genehmigungen mit einer Ablehnung. Öffnen Sie `/waterline`, um jeden Lauf der
Kette zu untersuchen.

## Ablauf eines Gesprächszugs {#how-a-turn-works}

```php
#[Signal('message', [['name' => 'text', 'type' => 'string']])]
#[Signal('decision', [
    ['name' => 'proposalId', 'type' => 'string'],
    ['name' => 'approved', 'type' => 'bool'],
    ['name' => 'reviewer', 'type' => 'string'],
])]
class ConversationWorkflow extends Workflow
{
    public function handle(array $state = [], int $turnsPerRun = 3, int $inactivitySeconds = 3600): array
    {
        $this->state = array_replace($this->state, $state);

        while (true) {
            if ($this->turnsThisRun >= $turnsPerRun) {
                return continueAsNew(
                    array_replace($this->state, ['generation' => $this->state['generation'] + 1]),
                    $turnsPerRun,
                    $inactivitySeconds,
                );
            }

            $text = await('message', $inactivitySeconds);

            // A null text is the inactivity timeout; "/end" finishes.
            // Otherwise one turn runs:
            //   activity(FakeModelActivity::class, ...) proposes a reply
            //   uuid4() records an ID for a proposed action (replay-safe)
            //   await('decision', ...) waits for a decision naming that ID
            //   activity(RecordReplyActivity::class, ...) stores the reply
        }
    }
}
```

1. Jedes Signal `message` ist eine Benutzereingabe. Der Workflow wendet
   angenommene Nachrichten einzeln, Zug für Zug, in der Reihenfolge ihrer
   Annahme an.
2. Der Modellaufruf läuft in einer Aktivität. Replay verwendet das
   aufgezeichnete Ergebnis wieder, statt das Modell erneut aufzurufen.
3. Schlägt das Modell eine Aktion vor, gibt der Workflow ihr mit `uuid4()` eine
   ID. `uuid4()` zeichnet den Wert in der Historie auf, sodass ein Replay dieselbe
   ID liefert. Danach wartet der Workflow auf ein Signal `decision`, das diese ID
   wiederholt; die Abfrage `status` meldet sie. Signale werden nach Namen
   gepuffert. Eine Entscheidung zu einem anderen Vorschlag (zu früh, doppelt oder
   nach einer unsicheren Antwort erneut gesendet) wird daher ignoriert und nicht
   auf den nächsten Vorschlag angewendet. Nur eine Genehmigung des offenen
   Vorschlags führt `ApplyApprovedActionActivity` aus. Eine Ablehnung oder ein
   Timeout zeichnet die Antwort auf und ändert nichts.
4. `RecordReplyActivity` schreibt die Antwort in die Anwendungstabelle
   `conversation_records`, unter einer Referenz aus Workflow-ID und
   Zugnummer. Die Historie speichert nur diese Referenz.
5. Die Abfrage `status` meldet die Phase (`waiting_for_input`, `thinking`,
   `awaiting_approval`, `applying_action`, `recording_reply`,
   `continuing_as_new` oder `completed`), die Generation, die Anzahl der Züge,
   einen etwaigen ausstehenden Vorschlag und die jüngste Antwortreferenz. Lesen
   Sie den Antworttext über diese Referenz.

## Was einen verlorenen Worker übersteht {#what-survives-a-lost-worker}

Die Tests des Beispiels führen die Engine Aufgabe für Aufgabe aus und halten
einen Worker an einem gewählten Punkt an:

| Fehler | Was geschieht |
| --- | --- |
| Ein Worker übernimmt die Aufgabe, die eine Nachricht anwendet, per Lease und fällt dann aus | Bis zum Ablauf der Lease gibt es keinen Fortschritt. Danach übergibt der Reparaturdurchlauf dieselbe Aufgabe an einen anderen Worker, der die Nachricht einmal anwendet. |
| Ein Worker fällt aus, während die Modellaktivität läuft | Nach Ablauf der Lease wird die Aktivität auf einem anderen Worker wiederholt. Der Lauf zeichnet für diese Aktivität einen Abschluss auf, und die Antwort wird einmal aufgezeichnet. |
| Der Antwort-Worker schreibt die Zeile und fällt vor der Rückmeldung aus | Der Wiederholungsversuch führt die Aktivität erneut aus. Da die Referenz der Schlüssel der Zeile ist, bleibt eine Antwort bestehen. |

Aktivitäten werden mindestens einmal ausgeführt: Ein Wiederholungsversuch kann
Arbeit wiederholen, die außerhalb der Engine bereits geschehen ist. Die
dauerhafte Historie zeichnet jedes Ergebnis einmal auf. Geben Sie jeder
Nebenwirkung einen stabilen Schlüssel, wie es die Antwort- und
Aktionsreferenzen tun, und übergeben Sie denselben Schlüssel an jedes externe
System. Siehe
[Ausführungsgarantien](./constraints/execution-guarantees.md) und
[abgelaufene Leases und erneute Zustellung](./constraints/execution-guarantees.md#lease-expiry-and-redelivery).

## Historie begrenzen {#bounding-history}

Nach `$turnsPerRun` Zügen setzt sich der Lauf als neuer Lauf fort. Der nächste
Lauf erhält nur den expliziten Zustand, der an `continueAsNew()` übergeben
wird: die Generation, die Anzahl der Züge, eine begrenzte Zusammenfassung und
die jüngste Antwortreferenz. Andere Eigenschaften des Workflow-Objekts werden
durch Replay neu aufgebaut und nicht kopiert.

Nachrichten, die angenommen, aber noch nicht angewendet wurden, gehen in ihrer
ursprünglichen Reihenfolge auf den nächsten Lauf über. Dies gilt für
deklarierte Signale, die an die Workflow-Instanz gesendet werden. Ein Signal an
einen bestimmten Lauf wird abgelehnt, wenn dieser Lauf zuerst schließt. Siehe
[Annahme und Abschluss von Signalen](./features/signals.md#acceptance-and-closure)
und [Continue-as-new](./features/continue-as-new.md).

## Was in Ihrer Verantwortung bleibt {#what-stays-your-responsibility}

- **Nutzlastspeicher.** Das Beispiel hält Antworttexte in einer
  Anwendungstabelle. Legen Sie deren Aufbewahrung, Zugriffskontrolle und
  Sicherung fest, oder verwenden Sie
  [externen Nutzlastspeicher](./features/external-payload-storage.md).
- **Zusammenfassung.** Das Ersatzmodell führt eine fortlaufende
  Zusammenfassung fester Länge. Mit einem echten Modell entscheiden Sie, welcher
  Kontext Continue-as-new überquert und wie groß er werden darf.
- **Wer Eingaben senden oder genehmigen darf.** Die Engine zeichnet das Signal
  und seine Argumente auf. Authentifizieren und autorisieren Sie Absender und
  Prüfer in Ihrer Anwendung, bevor Sie das Signal senden; siehe
  [Absenderidentität und Autorisierung](./features/signals.md#sender-identity-and-authorization).
- **Externe Wirkungen.** Die Engine macht einen externen Aufruf nicht zu einem
  Genau-einmal-Aufruf. Verwenden Sie Idempotenzschlüssel, wie es die Aktivität
  für genehmigte Aktionen tut.
- **Wiederholtes Senden von Signalen.** Geht die Antwort auf das Senden eines
  Signals verloren, lesen Sie
  [Nach einer ungewissen Antwort](./features/signals.md#after-an-uncertain-response),
  bevor Sie es erneut senden.

Das Beispiel speichert Antworten über eine Aktivität und verwendet keine
Nachrichtenströme aus Workflow-Code. In Workflow-Releases bis einschließlich
2.20.0 sind `outbox()->sendReference()` und `inbox()->receive()` in
Workflow-Code nicht replay-sicher
([workflow#1010](https://github.com/durable-workflow/workflow/issues/1010)); siehe
die Warnung unter [Nachrichtenströme](./features/message-streams.md).

## Weitere Leitfäden {#related-guides}

- [Signale](./features/signals.md) und [Abfragen](./features/queries.md)
- [Continue-as-new](./features/continue-as-new.md)
- [Nachrichtenströme](./features/message-streams.md)
- [Aktivitäten](./defining-workflows/activities.md) und
  [Ausführungsgarantien](./constraints/execution-guarantees.md)
- [Fehler und Wiederherstellung](./failures-and-recovery.md)
- [Beispielanwendung](./sample-app.md)
