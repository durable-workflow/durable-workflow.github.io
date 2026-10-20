---
title: Interroger un état externe
description: Choisir une interrogation bornée ou des signaux de rappel, attendre durablement dans le workflow et comptabiliser le coût de l’historique.
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
| Soumettre puis revenir, et recevoir un signal de rappel | Libère le slot d’activité après la soumission ; le workflow attend durablement | La soumission, l’admission et l’application du signal, ainsi que toute attente avec échéance, ajoutent de l’historique. Exige une corrélation authentifiée et une gestion des doublons dans l’application. |

Utilisez des vérifications courtes pouvant être répétées sans danger. Un callback bloqué sur une requête externe ne devient pas réactif simplement parce que son workflow dispose d’un temporisateur ou d’une politique d’annulation.

## Terminer par rappel et signal {#callback-and-signal-completion}

Si le système externe peut vous notifier, soumettez son travail dans une activité courte et renvoyez l’accusé de réception. Laissez le **workflow** attendre un signal déclaré ou une condition reconstruite par rejeu, avec une échéance finie. Ne gardez pas une activité, une réponse HTTP ou une connexion SSE ouverte jusqu’à la fin du travail.

Choisissez l’identifiant d’instance et enregistrez la correspondance entre l’opération externe authentifiée, le namespace, l’**identifiant public d’instance de workflow** et le nom du signal déclaré avant de démarrer. L’activité peut soumettre le travail dès que le démarrage est validé. Un identifiant de run ne désigne qu’un run : ce n’est pas une adresse stable après continue-as-new. Authentifiez le rappel et vérifiez cette correspondance avant de le transmettre ; ne faites pas confiance aux champs de routage ou d’identité d’une requête quelconque.

### Rappel PHP intégré {#embedded-php-callback}

Configurez `services.jobs.url` pour le fournisseur et `services.jobs.callback_url` pour l’adaptateur authentifié de l’application. Adaptez la requête `/jobs` à son API : elle doit confirmer rapidement la soumission et renvoyer `job_id`. Ajoutez l’authentification propre au fournisseur et bornez la requête. La clé d’opération ne déduplique que si le fournisseur la respecte réellement.

```php
use Illuminate\Support\Facades\Http;
use Workflow\V2\Activity;
use Workflow\V2\Attributes\Signal;
use Workflow\V2\Attributes\Type;
use Workflow\V2\Support\ActivityOptions;
use Workflow\V2\Workflow;
use function Workflow\V2\activity;
use function Workflow\V2\await;

#[Type('external.submit')]
final class SubmitExternalJob extends Activity
{
    public function handle(string $workflowId, string $operationId): array
    {
        return Http::connectTimeout(2)->timeout(5)
            ->withHeaders(['Idempotency-Key' => $operationId])
            ->post(config('services.jobs.url').'/jobs', [
                'workflow_id' => $workflowId,
                'operation_id' => $operationId,
                'signal' => 'job-completed',
                'callback_url' => config('services.jobs.callback_url'),
            ])->throw()->json();
    }
}

#[Type('external-completion')]
#[Signal('job-completed', [
    ['name' => 'operationId', 'type' => 'string'],
    ['name' => 'result', 'type' => 'array'],
])]
final class ExternalCompletion extends Workflow
{
    public function handle(string $operationId): array
    {
        $job = activity(SubmitExternalJob::class, new ActivityOptions(
            maxAttempts: 1, startToCloseTimeout: 10, scheduleToCloseTimeout: 15,
        ), $this->workflowId(), $operationId);

        $received = await('job-completed', timeout: 10);
        if ($received === null) {
            return ['status' => 'timed_out', 'job_id' => $job['job_id']];
        }
        if ($received[0] !== $operationId) {
            return ['status' => 'unexpected_operation'];
        }
        return ['status' => 'completed', 'result' => $received[1]];
    }
}
```

Démarrez avec un identifiant d’instance choisi par l’appelant et des délais finis pour le run et l’exécution logique. Enregistrez `ExternalCompletion` avec des [webhooks authentifiés](../features/webhooks.md) ; l’adaptateur de rappel peut transmettre les données validées à la route de signal ciblant l’instance :

```bash
curl -fsS -X POST "$APP_URL/webhooks/instances/external-job-42/signals/job-completed" \
  -H "Authorization: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"arguments":["op-42",{"value":42}]}'
```

Il s’agit du format `arguments` du webhook intégré, pas de l’enveloppe de charge utile du Server. Le fournisseur doit appeler l’adaptateur authentifié de votre application et ne doit pas recevoir les identifiants d’opérateur ou de worker du Server.

### Rappel et condition Python {#python-callback-and-condition}

L’activité suivante effectue seulement la soumission bornée. Configurez `JOB_API_URL`, `JOB_CALLBACK_URL` et l’authentification du fournisseur dans son environnement. Enregistrez les deux définitions dans le [worker Python](./python.md). Passez explicitement l’identifiant d’instance connu de l’appelant ; cet exemple n’invente aucun accesseur d’identifiant sur le contexte du workflow.

```python
import os
import httpx
from durable_workflow import activity, workflow
from durable_workflow.workflow import ActivityRetryPolicy

@activity.defn(name="external.submit")
async def submit_external_job(workflow_id, operation_id):
    async with httpx.AsyncClient(timeout=5.0) as provider:
        response = await provider.post(
            os.environ["JOB_API_URL"] + "/jobs",
            headers={"Idempotency-Key": operation_id},
            json={"workflow_id": workflow_id, "operation_id": operation_id,
                  "signal": "job-completed",
                  "callback_url": os.environ["JOB_CALLBACK_URL"]},
        )
        response.raise_for_status()
        return response.json()

@workflow.defn(name="external-completion")
class ExternalCompletion:
    def __init__(self):
        self.results = {}

    @workflow.signal("job-completed")
    def completed(self, operation_id: str, result: dict):
        self.results.setdefault(operation_id, result)

    def run(self, ctx, workflow_id, operation_id):
        job = yield ctx.schedule_activity(
            "external.submit", [workflow_id, operation_id],
            retry_policy=ActivityRetryPolicy(max_attempts=1, backoff_seconds=[1]),
            start_to_close_timeout=10, schedule_to_close_timeout=15,
        )
        ready = yield ctx.wait_condition(
            lambda: operation_id in self.results,
            key="external.completed", timeout=10,
        )
        if not ready:
            return {"status": "timed_out", "job_id": job["job_id"]}
        return {"status": "completed", "result": self.results[operation_id]}
```

Choisissez l’identifiant et persistez la correspondance namespace/instance/signal de l’opération **avant d’appeler start**. L’activité peut commencer dès la validation du démarrage. L’application démarre ensuite cette instance avec des budgets finis :

```python
handle = await client.start_workflow(
    workflow_type="external-completion", task_queue="external-jobs",
    workflow_id="external-job-42", input=["external-job-42", "op-42"],
    execution_timeout_seconds=60, run_timeout_seconds=30,
)
```

Après authentification du fournisseur et résolution de la correspondance enregistrée, l’adaptateur utilise un Client dans le **même namespace** :

```python
await client.signal_workflow(
    "external-job-42", "job-completed", args=["op-42", {"value": 42}],
)
```

Cet appel utilise `POST /api/workflows/{workflowId}/signal/{signalName}` du Server et l’enveloppe Avro normale du SDK. Sa réussite confirme l’admission, pas le traitement du rappel par le workflow. Si la confirmation compte, consultez le résultat du workflow ou l’état conservé du signal.

### Rappels précoces, continuations et rappels tardifs {#early-continued-and-late-callbacks}

- Déclarez le signal avant de démarrer le run. Un rappel reçu avant l’attente est conservé et consommé dans l’ordre durable ; Python reconstruit l’état du gestionnaire pendant le rejeu. Une inscription ultérieure ne peut pas réécrire les déclarations d’un ancien run.
- Les rappels ciblant l’instance suivent continue-as-new ; les appels ciblant explicitement un run restent limités à celui-ci. Avec les runtimes compatibles Core 2.7.0+, les signaux d’instance reçus et éligibles conservent leur identité et leur ordre pendant le transfert. L’état des rappels **déjà appliqués** doit être transmis dans les arguments de continuation si l’application en a encore besoin.
- Un rappel après fermeture terminale est explicitement refusé. Avec le Server publié, Python expose `SignalFailed.reason == "run_not_active"` et le statut409. Un signal admis mais non appliqué peut plutôt conserver un rejet lié à la fermeture ; son ancien reçu d’admission n’est pas effacé. Voir [admission et fermeture des signaux](../features/signals.md#acceptance-and-closure).
- L’échéance d’attente n’annule pas le travail externe. Réconciliez son résultat ou demandez son annulation par une activité. Un résultat tardif peut demander une décision de récupération ; ne lancez pas silencieusement un travail de remplacement.

### Doublons et limites du streaming {#duplicate-delivery-and-streaming-limits}

Les fournisseurs répètent les rappels, et une erreur réseau peut survenir après admission du signal. Persistez la clé d’opération/d’événement et l’intention exacte, dédupliquez à l’entrée du rappel et dans le traitement métier, et conservez les livraisons indéterminées pour réconciliation. Le gestionnaire Python garde le premier résultat par opération dans ce run ; il ne garantit ni déduplication entre runs ni admission unique. Ne marquez pas une transmission incertaine comme traitée simplement parce que la requête a été envoyée. [L’issue commune #216](https://github.com/durable-workflow/.github/issues/216) couvre toujours les répétitions sûres et l’identité d’admission conservée. Un en-tête d’idempotence ou une seule tentative d’activité ne garantit pas, à lui seul, un effet externe unique.

Démarrez le workflow avant que cette recette soumette le travail. En mode service, `start(use-existing)` suivi de `signal` représente **deux opérations**, avec une course à la fermeture ; l’admission atomique reste dans [l’issue commune #222](https://github.com/durable-workflow/.github/issues/222). Le `signalWithStart` intégré est une API atomique distincte. La demande de debounce [Website #280](https://github.com/durable-workflow/durable-workflow.github.io/issues/280) a été remplacée par cette exigence produit, pas achevée par cette recette.

Un socket HTTP/SSE maintenu dans une activité n’est pas durable : perdre le worker ou son processus le ferme, il occupe un slot, et une reconnexion peut répéter ou manquer des événements externes. Soumission et rappels ajoutent encore de l’historique d’activité, de signal et d’attente ; l’exécution n’est ni gratuite ni illimitée. Pour la **sortie durable du workflow**, utilisez [Workflow Streams](./workflow-streams.md) et leur contrat de séquence/curseur persisté au lieu de prendre une connexion de transport pour du stockage.

Les exemples PHP et Python ont été exécutés sur **Server 2.9.7 / Core 2.7.2** publié, avec le **SDK Python 2.6.1** installé normalement. Des contrôles PostgreSQL 17.11 distincts ont couvert les rappels précoces et pendant l’attente, le refus tardif et continue-as-new avec rappel en l’absence du worker Python, puis lecture à froid. Les contrôles intégrés ont utilisé la vraie route webhook. Cela qualifie la recette, pas toutes les bases, l’authentification du fournisseur, l’arrêt gracieux ou le runtime natif. Le [compte rendu de qualification](https://github.com/durable-workflow/durable-workflow.github.io/issues/321#issuecomment-6292485315) conserve séparément les originaux infructueux.

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
