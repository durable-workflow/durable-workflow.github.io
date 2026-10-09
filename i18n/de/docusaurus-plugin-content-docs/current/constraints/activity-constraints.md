---
sidebar_position: 3
---

# Aktivitäts-Einschränkungen {#activity-constraints}

Aktivitäten führen Ein- und Ausgabe sowie externe Nebenwirkungen aus. Sie werden nicht wie Workflow-Code per Replay durchlaufen. Ihre Ausführung erfolgt **mindestens einmal**. Wiederholungsversuche, abgelaufene Leases und erneute Zustellung können dieselbe logische Arbeit mehrfach ausführen.

Das ist normales Verhalten. Wenn eine Aktivität eine Zahlung auslöst, eine E-Mail sendet, in ein anderes System schreibt oder eine externe Ressource verändert, muss eine Wiederholung sicher sein.

## Auswirkungen in der Praxis {#what-this-means-in-practice}

- Der Standard-Idempotenzschlüssel für eine logische Aktivitätsausführung ist `activity_execution_id`.
- Jeder Versuch erhält außerdem eine eigene `activity_attempt_id`.
- Ein Worker kann eine externe Operation abschließen, seine Lease verlieren und das Ergebnis erst danach melden. Die Engine kann den verspäteten Bericht ablehnen, weil ein anderer Worker bereits das dauerhafte Ergebnis festgeschrieben hat. Die externe Nebenwirkung kann trotzdem stattgefunden haben.
- Aktivitätscode darf Ein- und Ausgabe, die aktuelle Uhrzeit und veränderlichen Prozesszustand nutzen. Workflow-Code darf das nicht. Halten Sie diese Grenze klar ein.

## Empfohlene Idempotenzmuster {#preferred-idempotency-patterns}

Viele externe APIs unterstützen einen `Idempotency-Key`. Verwenden Sie die logische Aktivitätskennung der Laufzeitumgebung, wenn der entfernte Dienst sie unterstützt.

- Bevorzugen Sie `activity_execution_id`, wenn Wiederholungsversuche im Zielsystem als dieselbe logische Anfrage gelten sollen.
- Nutzen Sie `activity_attempt_id` nur, wenn das Zielsystem einzelne Versuche unterscheiden muss.

Weitere geeignete Muster:

- Schreiben Sie in eine externe Ressource mit deterministischem Namen oder natürlichem Schlüssel.
- Verwenden Sie Upserts oder Tabellen zur Duplikaterkennung mit einer dauerhaften Kennung als Schlüssel.
- Gestalten Sie die Operation von sich aus idempotent, sodass ein zweiter Aufruf nichts mehr verändert.

Viele Operationen sind von sich aus idempotent. Wenn Sie dasselbe Video zweimal kodieren, erhalten Sie weiterhin dasselbe Video. Wenn Sie dieselbe Datei zweimal löschen, bewirkt die zweite Löschung nichts.

Bei anderen Operationen kann eine doppelte Ausführung der sicherere Fehlerfall sein. Ist unklar, ob ein E-Mail-Anbieter eine Nachricht versendet hat, kann eine doppelte Nachricht besser sein als eine stillschweigend verworfene Benachrichtigung. Treffen Sie diese Abwägung bewusst.

## Annahmen, die Sie vermeiden sollten {#what-not-to-assume}

- Nehmen Sie nicht an, dass ein Aktivitätsversuch nur auf einem Worker ausgeführt wird.
- Nehmen Sie nicht an, dass ein neuer Versuch beweist, dass die vorige externe Nebenwirkung fehlgeschlagen ist.
- Nehmen Sie nicht an, dass ein verspäteter Abschluss bedeutet, die Aktivität sei nie ausgeführt worden.
- Verschieben Sie Nebenwirkungen nicht in Workflow-Code, um Wiederholungsversuche zu vermeiden. Daraus würde ein Determinismusfehler entstehen.

Die [Ausführungsgarantien und Idempotenz](./execution-guarantees.md) beschreiben den vollständigen Vertrag. [Fehler und Wiederherstellung](../failures-and-recovery.md) erklärt das Wiederherstellungsmodell aus Sicht des Betriebs.
