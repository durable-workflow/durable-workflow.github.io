---
sidebar_position: 8
---

# Battements d’activité {#heartbeats}

Les battements permettent à une activité longue de signaler que sa tentative courante est toujours active.

`heartbeat()` met à jour la ligne `activity_attempts` actuellement réclamée avec l’heure du heartbeat et la progression la plus récente, reporte le dernier heartbeat sur l’exécution d’activité en cours et renouvelle le lease de cette tâche d’activité. Il écrit un événement d’historique `ActivityHeartbeatRecorded` uniquement lorsque la progression a changé, au plus une fois par intervalle d’enregistrement (voir ci-dessous). Le détail de l’exécution sélectionnée dans Waterline et les exports d’historique lisent le dernier heartbeat et la progression sur la ligne de la tentative, et reconstruisent l’état de la tentative, l’identifiant de tâche, le worker, le lease, l’annulation et les horodatages de clôture à partir de l’historique typé `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` et `ActivityCancelled`, avec les lignes de tentative en repli pour les données plus anciennes.

```php
use Workflow\V2\Activity;

final class PollRemoteJob extends Activity
{
    public function handle(string $jobId): array
    {
        do {
            sleep(1);

            $status = RemoteService::status($jobId);

            $this->heartbeat([
                'message' => 'Polling remote job',
                'current' => $status['completed'] ?? null,
                'total' => $status['total'] ?? null,
                'unit' => 'steps',
                'details' => [
                    'remote_state' => $status['state'] ?? 'running',
                ],
            ]);
        } while ($status['state'] === 'running');

        return $status;
    }
}
```

Dans l’activité, `activityId()`, `attemptId()` et `attemptCount()` exposent l’identité de l’exécution durable et de la tentative courante si vous avez besoin de clés de corrélation pour du travail externe. Utilisez `activityId()` comme clé d’idempotence distante par défaut. Réservez `attemptId()` aux systèmes devant distinguer les tentatives d’une même exécution durable d’activité.

Les workers polyglottes peuvent envoyer des battements via la passerelle HTTP des workers sans instancier la classe PHP d’activité. Consultez le [protocole des workers](/docs/polyglot/worker-protocol) pour les points de terminaison.

Un appel bloquant peut nécessiter un auxiliaire dédié aux heartbeats. Celui-ci
signale que le processus vit, pas que le travail avance. Donnez à l’appel son
propre délai fini et arrêtez l’auxiliaire à la fin ou à la perte d’autorité.
Pour Python, suivez l’[exemple de capture du contexte et d’annulation](../polyglot/python.md#heartbeat-helper-thread).

## Fréquence et confirmations {#heartbeat-cadence-and-receipts}

Pour une activité mise en file d’attente, la première échéance de heartbeat commence lorsque le moteur la réclame, avant la livraison de la tâche et le code applicatif. Un heartbeat enregistré fixe la prochaine échéance à son horodatage du moteur plus `heartbeatTimeout`. Ni l’envoi de la requête ni la réception de sa réponse n’ouvre une nouvelle fenêtre complète. Consultez [Délai de heartbeat](./timeouts.md#heartbeat-timeout).

Choisissez une fréquence avec une marge importante dans cette fenêtre et bornez le travail entre les appels. Avec un délai de 15 secondes, viser environ cinq secondes peut servir de point de départ uniquement si la livraison, chaque lot ou appel d’E/S, les pauses d’exécution, la latence réseau et les nouvelles tentatives de transport tiennent dans le budget restant. Mesurez ces délais et gardez une marge. C’est une aide à la planification, pas un intervalle garanti sûr. Une tentative expirée ou remplacée ne récupère pas son bail en envoyant un heartbeat tardif.

Il n’existe ni calendrier automatique de heartbeats de progression ni garantie de regroupement dans le SDK. Les heartbeats d’enregistrement du worker et les vérifications de propriété ne publient pas de progression d’activité. Chaque heartbeat accepté renouvelle le lease et repousse l’échéance de heartbeat. Un événement d’historique n’est écrit que lorsque la progression diffère de la dernière progression enregistrée et qu’au moins la plus grande valeur entre le délai de heartbeat et 60 secondes s’est écoulée depuis cet événement. Un heartbeat sans progression prouve seulement l’activité et n’écrit pas d’historique. La progression retenue par l’intervalle est enregistrée une fois à la clôture de la tentative. Un heartbeat par seconde pendant une heure avec une progression inchangée écrit un seul événement. Les historiques plus anciens conservent les événements par heartbeat déjà enregistrés.

En mode embarqué, `Activity::heartbeat()` renvoie `void`. Une progression invalide ou une défaillance de stockage peut lever une exception. Un retour normal n’est pas un objet de confirmation : une tentative fermée, expirée ou remplacée peut retourner sans enregistrer un nouveau heartbeat. En mode service, les erreurs diffèrent entre les appels directs au client et les workers supervisés. Consultez les guides [PHP](../polyglot/php.md#activity-heartbeats), [Python](../polyglot/python.md#activity-heartbeat-requests) et [Rust](../polyglot/rust.md#activity-heartbeats).

La progression d’un heartbeat ne valide pas atomiquement un lot externe et ne protège pas ses effets externes contre un ancien détenteur. Un point de reprise applicatif sûr face aux nouvelles tentatives exige sa propre validation durable, une clé logique de travail stable et de l’idempotence ou un contrôle externe de possession. L’accès d’une tentative de remplacement à un point de reprise confirmé est suivi séparément dans [la fonction de points de reprise](https://github.com/durable-workflow/.github/issues/218).

## Instantanés de progression {#progress-snapshots}

`Activity::heartbeat()` et `ActivityTaskBridge::heartbeat()` acceptent tous deux un instantané facultatif et borné de progression :

- `message`
  - chaîne non vide de 280 caractères maximum
- `current`
  - entier ou nombre flottant positif ou nul
- `total`
  - entier ou nombre flottant positif ou nul
- `unit`
  - chaîne non vide de 64 caractères maximum
- `details`
  - table à un seul niveau de 20 entrées `key => scalar|null` maximum, avec des clés conformes à `[A-Za-z0-9_.:-]{1,64}`

Utilisez ces données pour une progression destinée aux opérateurs, comme `"Downloading chunk"` ou `2 / 5 chunks`, pas pour de longs journaux ou un état imbriqué arbitraire. Les détails d’exécution sélectionnée Waterline, l’entrée de battement de la chronologie et l’export d’historique les exposent comme `last_heartbeat_progress` sur l’activité et la tentative courante. L’événement brut typé `ActivityHeartbeatRecorded` conserve les mêmes données normalisées sous `progress`.

## Suivi durable des tentatives {#durable-attempt-tracking}

Le runtime enregistre une ligne durable propre à chaque tentative d’activité, avec le numéro de tentative, l’état, l’heure de début, le dernier heartbeat et la progression, l’expiration du lease et l’heure de clôture. Il enregistre aussi un historique typé de la tentative lorsque les activités démarrent, envoient un heartbeat, sont relancées, se terminent, échouent ou sont annulées, afin que le détail historique survive même si les lignes modifiables de tentative ou de tâche divergent plus tard. Un heartbeat enregistré ajoute un point compact `ActivityHeartbeatRecorded` à la chronologie avec l’identifiant de l’exécution d’activité, l’identifiant de la tentative, l’heure du heartbeat, l’expiration du lease, la progression et un instantané de l’activité au moment de l’événement. Si une commande cancel ou terminate clôture l’exécution, le pont enregistre `ActivityCancelled` lorsque le worker constate l’arrêt et rejette une fin ou un échec ultérieurs comme obsolètes, au lieu de transformer l’annulation en résultat.

Les heartbeats sont des signaux opérationnels d’activité. Envoyez-en aussi souvent que vos délais et votre reprise l’exigent. Les heartbeats qui prouvent seulement l’activité n’ajoutent pas d’historique, et les changements de progression sont enregistrés au plus une fois par intervalle. Gardez l’instantané de progression facultatif assez compact pour le diagnostic des opérateurs, au lieu de le traiter comme un flux d’événements.
