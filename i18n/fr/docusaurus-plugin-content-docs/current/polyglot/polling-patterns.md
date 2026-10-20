---
title: Interroger un état externe
description: Choisir des tentatives bornées, des activités avec heartbeat ou des boucles de temporisateurs durables et comptabiliser leur coût dans l’historique.
---

# Interroger un état externe {#polling-external-state}

Interrogez un travail externe dans une activité, jamais par des requêtes réseau dans le code du workflow. Déterminez où doit se situer l’attente avant de choisir son intervalle.

## Choisir la frontière de l’attente {#choose-the-waiting-boundary}

| Modèle | Utilisation des workers | Historique durable et contrôle |
| --- | --- | --- |
| Réessayer une activité jusqu’à disponibilité | Un slot d’activité pendant chaque tentative ; libéré pendant le délai entre tentatives | Chaque tentative et chaque replanification ajoutent de l’historique. Le code du workflow ne reprend pas entre tentatives : il ne peut donc ni consulter son budget d’historique ni continuer comme nouveau à cet instant. |
| Une activité longue avec heartbeats | Occupe son slot d’activité pendant toute l’attente | Chaque heartbeat accepté ajoute un événement. Utilisez des échéances finies pour l’activité et un délai maximal borné pour les requêtes externes ; les heartbeats ne prolongent pas l’échéance de toute l’exécution. |
| Vérification par activité suivie d’un temporisateur durable | Libère les slots d’activité entre vérifications | Chaque vérification ajoute des événements d’activité et chaque intervalle des événements de temporisateur. Entre vérifications, le workflow peut décider de s’arrêter, de compenser ou de continuer comme nouveau. |
| Un workflow enfant consacré aux vérifications | L’enfant utilise les slots requis par son modèle | Déplace l’historique des vérifications dans l’enfant ; ajoute au parent les événements de démarrage et de résolution de l’enfant. L’historique et l’exécution de l’enfant conservent un coût. Choisissez explicitement la politique de fermeture du parent. |

Utilisez des vérifications courtes pouvant être répétées sans danger. Un callback bloqué sur une requête externe ne devient pas réactif simplement parce que son workflow dispose d’un temporisateur ou d’une politique d’annulation.

## Borner les tentatives et l’historique {#bound-retries-and-history}

Les nouvelles tentatives sont explicites : les activités PHP disposent d’une seule tentative par défaut. Configurez par exemple `maxAttempts: 3`, `backoff: [5, 30]`, `startToCloseTimeout: 10` et `scheduleToCloseTimeout: 90` pour trois tentatives distantes avec délais finis et durée totale d’origine. La politique Python correspondante est `ActivityRetryPolicy(max_attempts=3, backoff_seconds=[5, 30])`, avec des options distinctes pour la durée maximale par tentative et totale. Un retour réussi « pas encore prêt » n’est pas un échec et ne déclenche pas de nouvelle tentative. Voir [échecs et récupération](../failures-and-recovery.md).

Les nouvelles tentatives conviennent lorsque l’indisponibilité constitue un résultat explicitement réessayable et que le workflow n’a pas besoin de s’exécuter entre vérifications. N’utilisez pas des tentatives illimitées comme boucle d’interrogation invisible. La cohérence des délais des activités locales est suivie dans [l’issue du contrat de nouvelle tentative](https://github.com/durable-workflow/.github/issues/219) ; les exemples ici utilisent des activités distantes.

## Passer volontairement à une nouvelle exécution {#roll-over-deliberately}

Cette démonstration exécutable vérifie une fois par exécution, attend, puis transmet un compteur fini de vérifications restantes à l’exécution suivante. Remplacez uniquement la recherche d’état synthétique de l’activité par une vraie requête bornée. L’exemple renvoie le dernier état même lorsque la limite de vérifications est atteinte ; l’appelant doit examiner `ready`.

### PHP intégré {#embedded-php}

```php
use Workflow\V2\Activity;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\timer;
use function Workflow\V2\continueAsNew;

final class CheckDemoStatus extends Activity
{
    public function handle(int $remaining): array
    {
        return ['ready' => $remaining <= 1];
    }
}

final class PollDemo extends Workflow
{
    public function handle(int $remaining = 2, int $intervalSeconds = 30): array
    {
        $status = activity(CheckDemoStatus::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $remaining);
        if ($status['ready'] || $remaining <= 1) {
            return $status;
        }
        timer($intervalSeconds);
        return continueAsNew($remaining - 1, $intervalSeconds);
    }
}
```

Démarrez-le avec la [configuration normale du workflow intégré](../installation.md), en fixant des durées maximales finies pour chaque exécution et pour toute l’exécution logique.

### Worker Python en mode service {#python-service-worker}

```python
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="poll-demo.status")
async def check_status(remaining):
    return {"ready": remaining <= 1}

@workflow.defn(name="poll-demo")
class PollDemo:
    def run(self, ctx, remaining=2, interval_seconds=30):
        result = yield ctx.schedule_activity(
            "poll-demo.status", [remaining],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        if result["ready"] or remaining <= 1:
            return result
        yield ctx.sleep(interval_seconds)
        return ctx.continue_as_new(remaining - 1, interval_seconds)
```

Enregistrez `PollDemo` et `check_status` dans le même [worker Python](./python.md), puis démarrez avec `[2, 30]` et des durées maximales finies pour l’exécution logique et chaque exécution individuelle. Observez l’instance courante du workflow pour suivre sa successeure ; un handle lié à une exécution particulière sélectionne toujours l’exécution d’origine.

Les deux exemples ont été exécutés sur les versions publiées Server **2.9.7 / Core 2.7.2**, avec Python **2.6.1** installé normalement et l’entrée de test `[2, 1]`. Chacun a effectué deux vérifications réelles dans deux exécutions. Continue-as-new recommence l’historique, ajoute le coût d’une exécution et de son lien, et conserve l’échéance d’origine de l’exécution logique. Il n’accorde pas une durée de vie illimitée.

Utilisez ici des attentes durables relatives. L’avancement de l’horloge Python et les lectures du budget d’historique stables pendant la relecture restent des travaux distincts sur [l’horloge](https://github.com/durable-workflow/.github/issues/215) et le [budget](https://github.com/durable-workflow/workflow/issues/859). Cette recette ne branche pas selon `ctx.now()` ni une longueur d’historique recalculée. Ne considérez pas `DW_MAX_HISTORY_EVENTS` comme une transition automatique imposée : [Server #504](https://github.com/durable-workflow/server/issues/504) suit cette lacune.

## Interrompre et réconcilier {#interrupt-and-reconcile}

Pour un arrêt par signal, [sélectionnez entre le signal et l’attente en cours](../features/concurrency.md), puis annulez explicitement l’opération perdante selon sa politique d’annulation prise en charge. La sélection seule n’annule pas les autres opérations. Demander l’arrêt d’une activité ne prouve pas qu’un effet externe n’a jamais eu lieu : utilisez des clés d’idempotence et réconciliez avant de compenser ou de redémarrer. L’annulation immédiate, la terminaison et l’expiration stricte du workflow n’exécutent pas son code de compensation ; utilisez [l’annulation coopérative](./cancellation.md) prise en charge si le nettoyage doit s’exécuter.

## Examiner l’historique réel {#inspect-the-actual-history}

Les mesures précédentes en mode service Python ont enregistré :

| Cas terminé | Événements de l’historique canonique |
| --- | --- |
| Une activité distante réussissant à la troisième tentative | 10 au total : 1 planification, 3 démarrages, 2 replanifications, 1 achèvement et 3 événements du cycle de vie de l’exécution |
| Une activité avec deux heartbeats acceptés | 8 au total : 3 événements d’activité, 2 de heartbeat et 3 du cycle de vie |
| Deux vérifications réussies séparées par un temporisateur | 11 au total : 6 événements d’activité, 2 de temporisateur et 3 du cycle de vie |

L’exemple de transition a enregistré **8 + 5** événements dans ses exécutions Python et **8 + 6** dans ses exécutions PHP ; PHP enregistre aussi `StartAccepted` pour la successeure. Ce sont des coûts mesurés d’opérations et d’exécutions, pas des totaux universels, des unités de facturation ou des résultats de performance. D’autres commandes, échecs, annulations et métadonnées d’admission du runtime peuvent ajouter des événements. Examinez l’historique de chaque exécution, sa politique de tentatives conservée et ses échéances d’origine au lieu d’estimer la croissance par le seul nombre d’itérations. Les observations exactes et les essais de vérification infructueux sont conservés dans [le justificatif de qualification](https://github.com/durable-workflow/durable-workflow.github.io/issues/283#issuecomment-6288504564).
