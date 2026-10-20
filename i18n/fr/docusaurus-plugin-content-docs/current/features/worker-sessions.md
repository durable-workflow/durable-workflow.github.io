---
sidebar_position: 24
title: Sessions de worker
description: Attacher une séquence de tentatives d’activité durables à un bail de session de worker pour une affinité GPU, système de fichiers ou état local au processus.
tags:
  - activities
  - workers
  - affinity
  - operations
keywords:
  - sessions de worker
  - affinité des activités
  - workers GPU
  - workers avec système de fichiers local
  - sessions du protocole des workers
---

# Sessions de worker {#worker-sessions}

Les sessions de worker sont la primitive v2 d’affinité des activités. Utilisez-les
lorsque plusieurs étapes d’activité durables doivent réutiliser un état local
au processus, de la mémoire GPU, un système de fichiers monté ou une autre ressource
locale au worker.

## Résumé du contrat {#contract-summary}

- Une session n’a qu’un propriétaire de bail à la fois.
- La première activité admise dans la session crée ou réacquiert le bail.
- Les battements d’activité renouvellent le bail de tentative d’activité et
  celui de la session.
- `POST /api/worker/sessions`, `POST /api/worker/sessions/{sessionId}/heartbeat`,
  et `DELETE /api/worker/sessions/{sessionId}` exposent des opérations explicites
  de cycle de vie aux workers externes.
- Le routage par file s’applique d’abord. L’admission en session intervient
  après l’enregistrement du worker pour la file de tâches.
- Les `capabilities` enregistrées du worker doivent satisfaire toutes les exigences de session.
- Les sessions expirées ou orphelines sont visibles des opérateurs et peuvent
  être réacquises si la session autorise la récupération après échec.

## API de définition {#authoring-api}

Les auteurs de workflows PHP créent une référence de session avec
`Workflow::workerSession()` ou `Workflow\V2\workerSession()` et programment
les activités via cette référence :

```php
use Workflow\V2\Support\WorkerSessionOptions;
use Workflow\V2\Workflow;

$session = Workflow::workerSession(
    'gpu-render',
    new WorkerSessionOptions(
        queue: 'gpu-activities',
        requirements: ['gpu:nvidia-l4'],
        leaseSeconds: 120,
        ttlSeconds: 1800,
        maxConcurrentActivities: 1,
    ),
);

$frames = $session->activity(RenderFramesActivity::class, $videoId);
$manifest = $session->activity(AssembleManifestActivity::class, $frames['path']);
```

L’instantané des options d’activité stocke le même contrat sous
`activity_options.worker_session`. Les runtimes externes utilisent la même
structure JSON dans une commande de tâche de workflow `schedule_activity`,
sous `worker_session`.

```json
{
  "type": "schedule_activity",
  "activity_type": "media.render-frames",
  "worker_session": {
    "session_id": "gpu-render",
    "queue": "gpu-activities",
    "requirements": ["gpu:nvidia-l4"],
    "lease_seconds": 120,
    "ttl_seconds": 1800,
    "max_concurrent_activities": 1,
    "create_if_missing": true,
    "allow_reacquire_after_failure": true
  }
}
```

## Cycle de vie {#lifecycle}

La création de session est différée. La couche d’appariement crée ou réacquiert
une session lorsque sa première tâche d’activité est admise sur un worker
capable. Un worker peut aussi créer explicitement la session avant d’interroger
les tâches en appelant `POST /api/worker/sessions`.

Une session active se termine lorsque son détenteur la ferme, que son bail ou
sa durée de vie absolue expire, ou que le worker détenteur est détecté en échec.
L’expiration de la durée de vie et la fermeture explicite sont terminales pour
cet identifiant de session. Après expiration de bail ou détection d’une session
orpheline, la réacquisition est possible si `allow_reacquire_after_failure` vaut
true.

## Bail et propriété {#lease-and-ownership}

Au plus un worker détient le bail d’une session à un instant donné. Le serveur
n’admet ses tâches d’activité que dans l’un de ces cas :

- aucune session n’existe et `create_if_missing` vaut true ;
- la session active appartient déjà au worker qui interroge les tâches ;
- la session est expirée, en échec ou orpheline et la réacquisition est autorisée.

La propriété de session ne remplace pas le bail de chaque tentative d’activité.
Chacune conserve son propre `activity_attempt_id`, propriétaire de bail,
battement et chemin de fin, d’échec, d’expiration et d’annulation.

## Admission et routage {#admission-and-routing}

Les sessions participent au routage normal par file. `WorkerSessionOptions`
peut définir `connection` et `queue`, que les `ActivityOptions` par appel peuvent
encore remplacer. Le serveur applique l’admission propre à la session après
l’admission normale dans la file de tâches :

- les `capabilities` enregistrées du worker doivent couvrir toutes les exigences de session ;
- `max_concurrent_activities` limite les tentatives d’activité sous bail dans
  la session ;
- `max_concurrent_worker_sessions` limite les baux de session actifs détenus
  par un même enregistrement de worker.

Le routage propre au parc utilise de simples chaînes de capacité telles que
`gpu:nvidia-l4`, `gpu:a100`, `fs:/mnt/models` ou `zone:us-east-1a`.

## Échec, annulation et arrêt {#failure-cancellation-and-shutdown}

Les battements d’activité renouvellent les baux de tentative et de session.
Les workers peuvent aussi renouveler directement la session via leur protocole.
Si le bail de session expire, elle devient `expired`. Si le battement de
l’enregistrement du worker détenteur est périmé ou absent, elle devient
`orphaned`.

Si le worker détenteur meurt au milieu de la séquence, les activités en cours
conservent le comportement ordinaire d’exécution au moins une fois : leurs baux
de tentative expirent, la réparation permet une nouvelle prise en charge et les
résultats périmés peuvent être rejetés. Un worker capable peut réacquérir la
session si le contrat l’autorise. Les auteurs de workflows doivent prévoir
de reconstruire l’état local au processus après réacquisition.

L’annulation du workflow se propage toujours via les réponses aux battements
d’activité. Un bail de session n’autorise jamais une activité à ignorer
`cancel_requested`. Un arrêt planifié du worker doit fermer ses sessions via
`DELETE /api/worker/sessions/{sessionId}` avant d’arrêter le processus. Les
activités en cours se terminent, échouent, sont annulées ou expirent sous leurs
propres baux de tentative.

## Visibilité {#visibility}

Les capacités du protocole des workers annoncent `worker_session_verbs` et le
contrat runtime `worker_sessions` via `GET /api/cluster/info` et chaque réponse
du plan des workers. Le contrat lisible par machine est publié dans
[`worker-sessions-runtime.schema.json`](/platform-protocol-specs/worker-sessions-runtime.schema.json)
et figure dans le catalogue des
[Spécifications du protocole de plateforme](/docs/platform-protocol-specs#worker-session-runtime-notes).

Les opérateurs peuvent lister les sessions actives, fermées, expirées, en échec
et orphelines via `GET /api/worker-sessions`. Les détails incluent l’identifiant,
le détenteur, la file, les exigences, les expirations de bail et de durée de vie,
le nombre d’activités actives et la raison de l’échec. Les métriques système
opérateur comptent les sessions de chaque statut.

## Choisir les sessions de worker {#choosing-worker-sessions}

Préférez les activités ordinaires en file si chaque étape est indépendante.
Préférez une activité plus grande si l’opération entière est un seul effet de
bord atomique. Utilisez une session uniquement si plusieurs étapes d’activité
durables doivent réutiliser une ressource locale au worker et si le workflow
peut tolérer sa reconstruction après la défaillance d’un worker.

Consultez le [Modèle d’exécution des activités](/docs/features/activity-execution-model)
pour l’articulation des sessions avec les activités ordinaires en file, les
activités locales et l’exécution avec affinité de cache.
