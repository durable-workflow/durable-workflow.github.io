---
sidebar_position: 10
---

# Funktionsweise {#how-it-works}

Durable Workflow verwendet Laravel-Queue-Jobs und ereignisbasierte Speicherung, um dauerhaft fortsetzbare Coroutinen zu erzeugen. Workflows pausieren über Fiber-basierte Hilfsfunktionen, deren Schritte durch Replay rekonstruiert werden können.

## Laufzeitumgebung {#runtime}

Ein Workflow ist eine Klasse, deren `handle()`-Methode Hilfsfunktionen wie `activity()`, `await()`, `timer()`, `sideEffect()`, `child()` und `all([...])` direkt aufruft. Jeder Aufruf pausiert den Workflow, bis der entsprechende dauerhafte Schritt abgeschlossen ist. Anschließend wird er mit dem gespeicherten Ergebnis fortgesetzt.

Jeder Schritt erzeugt ein dauerhaftes Historienereignis. Wenn der Workflow aufwacht, rekonstruiert die Engine seinen Zustand aus der Historie und führt danach den nächsten noch offenen Schritt aus. Dieses Replay erlaubt es dem Workflow, Worker-Neustarts, Bereitstellungen und Maschinenausfälle zu überstehen, ohne seine Position zu verlieren.

`WorkflowStub::make()` reserviert eine öffentliche Workflow-Instanzkennung. Der Start erzeugt den ersten Lauf und die erste Workflow-Aufgabe. Jeder Lauf erhält eine eigene Laufkennung. Operationen wie `signal()`, `cancel()` und `terminate()` beziehen sich auf den aktuellen Lauf der Instanz.

## Event Sourcing {#event-sourcing}

Event Sourcing rekonstruiert den aktuellen Zustand aus einer Folge gespeicherter Ereignisse, anstatt nur den Zustand selbst zu speichern. Dadurch bleibt eine vollständige Ausführungshistorie erhalten. Nach einem Worker-Absturz lässt sich der Workflow daraus fortsetzen.

## Coroutinen {#coroutines}

Coroutinen können ihre Ausführung pausieren und später fortsetzen. Dauerhafte Pausen werden durch direkte Fiber-basierte Aufrufe wie `activity()`, `await()`, `timer()` und `sideEffect()` ausgedrückt.

Der Workflow-Code steht in der normalen Methode `handle()`. Die Laufzeitumgebung prüft bei jedem Hilfsaufruf zuerst, ob der Schritt bereits dauerhaft abgeschlossen wurde. In diesem Fall gibt sie das gespeicherte Ergebnis aus der Historie zurück. Andernfalls plant sie die nächste Aktivität, den Timer oder den untergeordneten Workflow und pausiert, bis der Schritt abgeschlossen ist oder fehlschlägt.

## Aktivitäten {#activities}

Mit mehreren Aktivitäten kann ein Workflow deren Ergebnisse koordinieren. Er erreicht einen Aktivitätsaufruf, pausiert bis zum Abschluss dieser Aktivität und setzt seine Ausführung danach fort.

Stürzt ein Workflow-Worker ab, rekonstruiert Replay den Zustand aus festgeschriebenen Ereignissen. So setzt der Workflow mit denselben Eingaben und Ergebnissen fort und bleibt deterministisch. Ein unbehandelter Workflow-Fehler beendet dagegen den Lauf endgültig. Replay startet einen fehlgeschlagenen Lauf nicht erneut.

Normale Aktivitäten sind in v2 dauerhaft gespeicherte Queue-Aufgaben. Explizite [lokale Aktivitäten](./features/local-activities.md) führen kurze Arbeit im Workflow-Worker-Prozess aus und behalten dabei dauerhafte Historie und Wiederholungsregeln bei. Normale Aktivitäten können auf jedem kompatiblen Worker laufen. [Worker-Sitzungen](./features/worker-sessions.md) ergänzen eine explizite Lease, wenn mehrere Aktivitätsschritte dieselbe lokale Ressource benötigen. Für einen einmal ermittelten, im Replay wiederverwendbaren Wert ohne Queue-Aktivität nutzen Sie [`sideEffect(...)`](./features/side-effects.md). Den vollständigen Vertrag beschreibt das [Aktivitäts-Ausführungsmodell](./features/activity-execution-model.md).

## Ausführungsgarantien {#execution-guarantees}

Für Workflow-Code und Aktivitätscode gelten unterschiedliche Wiederholungsregeln:

- **Workflow-Code wird per Replay durchlaufen.** Eine erneut zugestellte Workflow-Aufgabe rekonstruiert den Zustand aus der dauerhaften Historie und durchläuft den deterministischen Workflow-Code. Bereits gespeicherte externe Nebenwirkungen werden dabei nicht erneut ausgeführt.
- **Aktivitäten werden mindestens einmal ausgeführt.** Wiederholungsversuche, abgelaufene Leases oder Worker-Verlust können dieselbe logische Aktivität erneut zustellen. Doppelte Zustellung gehört zum normalen Verhalten verteilter Systeme.
- **Die Aktivitätskennung ist dauerhaft.** `activity_execution_id` identifiziert eine logische Ausführung über Wiederholungsversuche und erneute Zustellung hinweg. `activity_attempt_id` kennzeichnet einen einzelnen Versuch. Verwenden Sie standardmäßig `activity_execution_id` als entfernten Idempotenzschlüssel. Nutzen Sie `activity_attempt_id` nur für Systeme, die einzelne Versuche unterscheiden müssen.

Lesen Sie [Ausführungsgarantien und Idempotenz](./constraints/execution-guarantees.md), [Aktivitäts-Ausführungsmodell](./features/activity-execution-model.md) und [Fehler und Wiederherstellung](./failures-and-recovery.md) für den vollständigen v2-Vertrag.

## Warteschlangen {#queues}

Queue-Jobs werden später im Hintergrund ausgeführt. Laravel unterstützt dafür Amazon SQS, Redis und relationale Datenbanken. Workflows und Aktivitäten sind beide Queue-Jobs, verhalten sich aber unterschiedlich. Ein Workflow wird während des normalen Ablaufs mehrfach zugestellt: Er plant Aktivitäten und beendet den aktuellen Job, bis die Aktivitäten abgeschlossen sind. Bei einer Aktivität ist der übliche Fall ein erfolgreicher Versuch. Wiederholungsversuche, abgelaufene Leases oder Worker-Verlust können jedoch dieselbe logische Aktivität mehrfach zustellen.

## Beispiel {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## Sequenzdiagramm {#sequence-diagram}

Das Diagramm zeigt einen Workflow mit aufeinanderfolgenden und parallelen Aktivitäten.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="Workflow-Sequenzdiagramm"
/>

1. Der Workflow wird als Queue-Job zugestellt.
2. Die erste Aktivität `TestActivity` wird als Queue-Job zugestellt. Der Workflow-Job endet. Nach ihrem Abschluss speichert die Aktivität ihr Ergebnis in der Datenbank und stellt den Workflow erneut zu.
3. Der Workflow liest den Ereignisstrom aus der Datenbank und rekonstruiert seinen Zustand durch Replay. Das ist nötig, weil der Workflow kein dauerhaft laufender Prozess ist. Während Aktivitäten laufen, ist der Workflow-Job beendet. Nach ihrem Abschluss wird er erneut zugestellt.
4. Nach dem Replay plant der Workflow `TestOtherActivity` als Queue-Job. Diese Aktivität speichert nach ihrem Abschluss ihr Ergebnis und stellt den Workflow erneut zu.
5. Der Workflow rekonstruiert seinen Zustand erneut aus dem Ereignisstrom.
6. Danach plant er die parallelen Aktivitäten `TestParallelActivity` und `TestParallelOtherActivity`. Nach ihrem Abschluss werden die Ergebnisse gespeichert und der Workflow fortgesetzt.
7. Ein letztes Replay rekonstruiert den Zustand. Damit ist der Workflow abgeschlossen.

## Determinismus {#determinism}

Da die Historie bei jedem Aufwachen erneut gelesen wird, muss Workflow-Code für dieselbe Historie dieselben Befehle erzeugen. Die [Einschränkungen](./constraints/overview.md) erklären die Regeln und Hilfsfunktionen für sonst nichtdeterministische Operationen, etwa `Workflow::now()` auf `Workflow\V2\Workflow`, `sideEffect()` und `getVersion()`.
