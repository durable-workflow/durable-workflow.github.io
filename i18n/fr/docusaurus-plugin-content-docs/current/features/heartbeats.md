---
sidebar_position: 8
---

# Battements d’activité {#heartbeats}

Les battements permettent à une activité longue de signaler que sa tentative courante est toujours active.

`heartbeat()` met à jour la ligne `activity_attempts` actuellement prise en charge, répercute le dernier battement sur l’exécution d’activité active, renouvelle le bail de sa tâche et ajoute un événement d’historique typé `ActivityHeartbeatRecorded` pour la tentative courante. Les détails d’exécution sélectionnée et les exports d’historique Waterline reconstruisent d’abord le statut, l’identifiant de tâche, le worker et les horodatages de battement, bail, annulation et clôture à partir de l’historique typé `ActivityStarted`, `ActivityHeartbeatRecorded`, `ActivityRetryScheduled`, `ActivityCompleted`, `ActivityFailed` et `ActivityCancelled`. Les lignes de tentatives modifiables servent de repli ou d’enrichissement pour les anciennes données.

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

Il n’existe aucune programmation automatique des heartbeats de progression ni garantie de regroupement par le SDK. Les heartbeats d’enregistrement des workers et les lectures de possession ne publient pas de progression d’activité. Chaque heartbeat de progression accepté ajoute de l’historique durable. Évitez donc d’enregistrer chaque opération minuscule.

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

Le runtime enregistre une ligne durable à part entière par tentative d’activité : numéro, statut, début, dernier battement, expiration du bail et clôture. Il enregistre aussi un historique typé lorsque les activités démarrent, émettent des battements, réessaient, se terminent, échouent ou sont annulées. Les détails historiques survivent ainsi à une dérive ultérieure des lignes modifiables de tentatives ou de tâches. Chaque battement réussi de la tentative actuellement prise en charge enregistre un point compact `ActivityHeartbeatRecorded` dans la chronologie, avec les identifiants d’exécution et de tentative d’activité, l’horodatage du battement, l’expiration du bail et l’instantané d’activité de cette époque. Si une commande d’annulation ou d’arrêt forcé clôt l’exécution, la passerelle enregistre `ActivityCancelled` lorsque le worker constate l’arrêt et rejette comme périmés les résultats ou échecs ultérieurs, au lieu de transformer l’annulation en résultat.

Les battements sont des signaux opérationnels de vitalité. Chaque battement accepté devient de l’historique durable. Choisissez donc un intervalle adapté aux besoins d’expiration et de récupération plutôt qu’un journal de progression à haut volume. Gardez l’instantané facultatif assez compact pour les diagnostics opérateur au lieu de l’utiliser comme un flux continu d’événements.
