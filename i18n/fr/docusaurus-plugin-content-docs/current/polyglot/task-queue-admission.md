---
sidebar_position: 6
title: Admission des files de tâches
description: Régler les emplacements des workers, les budgets des files côté serveur et la contre-pression des tâches de requête de lecture du serveur autonome.
tags:
  - admission
  - operations
  - task-queues
  - bounded-growth
keywords:
  - admission des files de tâches
  - budget de distribution
  - limites des files
  - files de workers bornées
---

# Admission des files de tâches {#task-queue-admission}

L'admission empêche une file, un locataire ou une dépendance aval de consommer
toute la flotte de workers. Durable Workflow expose l'admission en trois couches :

- les inscriptions des workers annoncent des emplacements locaux de workflow et d'activité ;
- le serveur peut plafonner les baux actifs de workflow et d'activité par espace de noms et file ;
- le serveur peut plafonner les distributions de workflow et d'activité par minute, espace de noms et file ;
- le serveur peut plafonner les distributions par minute de groupes de budget
  aval nommés partagés par plusieurs files ;
- les tâches de requête de lecture disposent d'une file d'attente bornée pour
  que les lectures synchrones échouent rapidement au lieu de croître sans limite.

Utilisez ces contrôles lorsqu'une file dépend d'un service à débit limité,
lorsque des locataires partagent un serveur ou lorsque les opérateurs doivent
établir pourquoi un workflow attend.

L'admission se superpose au contrat d'appariement. Lisez
[Appariement et distribution des tâches](/docs/polyglot/task-matching-dispatch)
pour comprendre comment le travail prêt est découvert et loué avant que ces
budgets décident si la prochaine tâche est autorisée à passer.

## Application du budget {#how-the-budget-is-applied}

L'interrogation des tâches de workflow et d'activité part des workers
actuellement inscrits pour un espace de noms et une file de tâches. Chaque
worker annonce `max_concurrent_workflow_tasks` et
`max_concurrent_activity_tasks`. Le serveur additionne les workers actifs non
périmés pour calculer la capacité d'emplacements inscrite de la file.

Les plafonds côté serveur des baux actifs et du débit de distribution sont
facultatifs. S'ils sont configurés, le serveur vérifie un verrou de cache de
courte durée avant de louer la prochaine tâche de workflow ou d'activité. Si
le plafond de baux actifs est atteint, l'interrogation ne renvoie aucune tâche
plutôt que de dépasser le budget en cours. Si le plafond de distribution par
minute est atteint, elle ne renvoie aucune tâche avant qu'une nouvelle tranche
de minute ait de la capacité. Les groupes de budget aval appliquent le même
comportement par minute à toutes les files de l'espace de noms partageant un
nom `dispatch_budget_group`.

Les tâches de requête de lecture sont différentes : le plan de contrôle place
une tâche éphémère en file et attend la réponse d'un worker.
`DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` plafonne le nombre de tâches de requête
en attente par espace de noms et file. Une file pleine fait renvoyer aux
nouvelles requêtes `query_task_queue_full` avec HTTP `429`. Si le cache ne peut
fournir le verrou nécessaire à la modification de la file de requêtes, elles
renvoient `query_task_queue_unavailable` avec HTTP `503`.

## Charge des nouvelles tentatives et budgets du service dépendant {#retry-load-and-downstream-budgets}

**Premiers essais et nouvelles tentatives comptent tous** dans les plafonds de dispatch par file, namespace et groupe. Le plafond couvre les tentatives de tâches d’activité effectivement acquises entre workflows, pas seulement les réessais. Un plafond plein laisse le travail attendre sans faire échouer l’activité à lui seul. Les délais schedule-to-start, schedule-to-close et ceux du workflow continuent ; l’attente peut donc épuiser un timeout configuré.

Le plafond mesure des tentatives par minute, pas un taux de réussite ni la santé du service. Il n’ouvre aucun circuit breaker. Une acquisition peut produire plusieurs appels HTTP si l’activité ou le client réessaie en interne ; bornez-les séparément. Même un refus rapide sans appel au service consomme une acquisition.

Par exemple, dans le namespace `production`, les files d’activité ordinaires `payments` et `refunds` partagent un budget `payment-api` de 20 acquisitions par minute. Configurez le même plafond sur chaque file participante ; les autres n’y entrent pas. C’est un plafond par tranche d’une minute, pas un débit lissé ni une part réservée :

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  },
  "production:refunds": {
    "activity_tasks": {
      "dispatch_budget_group": "payment-api",
      "max_dispatches_per_minute_per_budget_group": 20
    }
  }
}'
```

Combinez ce plafond Server avec des tentatives et un backoff bornés. Cet exemple Python SDK 2.9.0 suppose que votre application fournit un breaker partagé asynchrone et un client de paiement via `myapp.payments` ; bornez les I/O et utilisez une idempotence stable dans ce client. Enregistrez `charge` sur le worker `payments` de `production`, et `PaymentWorkflow` sur son worker de workflows :

```python
from durable_workflow import NonRetryableError, activity, workflow
from myapp.payments import breaker, payment_api

@activity.defn(name="payments.charge")
async def charge(order):
    if await breaker.is_open("payment-api"):
        raise NonRetryableError("payment-api breaker is open")
    return await payment_api.charge(order, idempotency_key=order["id"])

@workflow.defn(name="payments.order")
class PaymentWorkflow:
    def run(self, ctx, order):
        return (yield ctx.schedule_activity(
            "payments.charge", [order], queue="payments",
            retry_policy={"max_attempts": 3, "backoff_seconds": [2, 5]},
            start_to_close_timeout=10,
            schedule_to_start_timeout=30,
            schedule_to_close_timeout=90,
        ))
```

Un breaker applicatif ouvert lève `NonRetryableError` avant le paiement ; les erreurs réessayables peuvent utiliser au plus trois tentatives avec le backoff configuré. Les timeouts d’origine peuvent expirer avant. Le workflow peut intercepter l’échec final selon le métier ; un échec final non intercepté peut le fermer. Choisissez séparément le délai global du workflow.

Gardez les appels protégés dans des **activités ordinaires en file**. Les activités locales inline ne créent aucune tâche d’activité ordinaire ; les plafonds de dispatch par file/namespace/groupe ne les mesurent pas. Une acquisition locale préparée valide l’autorité d’exécution, pas ce budget. Laravel embarqué n’a pas l’admission du Server autonome ; utilisez ses propres contrôles de déploiement. Voir les [activités locales](../features/local-activities.md).

## Configuration du serveur {#server-configuration}

Définissez des plafonds globaux si chaque file doit avoir la même limite :

```bash
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=25
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_QUEUE=100
DW_WORKFLOW_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=500
DW_ACTIVITY_TASK_MAX_ACTIVE_LEASES_PER_NAMESPACE=2000
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE=600
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE=1200
DW_WORKFLOW_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=12000
DW_ACTIVITY_TASK_MAX_DISPATCHES_PER_MINUTE_PER_NAMESPACE=24000
DW_QUERY_TASK_MAX_PENDING_PER_QUEUE=1024
```

Les plafonds de file protègent une seule file de tâches. Les plafonds d'espace
de noms protègent le total du locataire sur toutes ses files, ce qui est utile
quand il peut répartir son travail entre de nombreuses files tout en partageant
un quota aval. Les plafonds de groupe de budget protègent une dépendance aval
nommée sur certaines files sans limiter toutes les files de l'espace de noms.

Utilisez `DW_TASK_QUEUE_ADMISSION_OVERRIDES` lorsque certaines files ou certains
espaces de noms nécessitent des budgets différents. Les clés sont examinées
dans cet ordre : `namespace:task_queue`, `namespace:*`, `task_queue`, puis `*`.

```bash
DW_TASK_QUEUE_ADMISSION_OVERRIDES='{
  "production:payments": {
    "workflow_tasks": {
      "max_active_leases_per_queue": 8,
      "max_dispatches_per_minute": 120,
      "dispatch_budget_group": "downstream-openai",
      "max_dispatches_per_minute_per_budget_group": 600
    },
    "activity_tasks": {
      "max_active_leases_per_queue": 12,
      "max_dispatches_per_minute": 240
    }
  },
  "production:*": {
    "workflow_tasks": {
      "max_active_leases_per_namespace": 300,
      "max_dispatches_per_minute_per_namespace": 6000
    },
    "activity_tasks": {
      "max_active_leases_per_namespace": 1200,
      "max_dispatches_per_minute_per_namespace": 12000
    }
  },
  "email": {
    "activity_tasks": {
      "max_active_leases_per_queue": 4,
      "max_dispatches_per_minute": 60,
      "dispatch_budget_group": "downstream-sendgrid",
      "max_dispatches_per_minute_per_budget_group": 300
    }
  },
  "*": {
    "workflow_tasks": { "max_active_leases_per_queue": 50 }
  }
}'
```

La valeur de surcharge accepte aussi `max_active_leases` comme alias de
`max_active_leases_per_queue` et `budget_group` comme alias de `dispatch_budget_group`.

Le cache doit prendre en charge les verrous atomiques pour les plafonds de
baux actifs et de débit de distribution côté serveur ainsi que l'admission des
tâches de requête. Les compteurs de débit sont des tranches de minute de
courte durée, créées uniquement pour les files plafonnées qui louent
effectivement des tâches. Redis est le cache recommandé en déploiement multinœud.

## Inscription des emplacements des workers {#worker-slot-registration}

Pour donner aux gestionnaires Python de workflows et d'activités des
ressources de processus indépendantes, utilisez l'[exemple de processus worker
séparés](https://python.durable-workflow.com/guides/separate-workers/).
Choisissez les listes de gestionnaires inscrits pour séparer les rôles.
Gardez les deux valeurs de concurrence positives et appliquez des plafonds
serveur si le total entre processus doit être borné.

Les workers Python exposent les sémaphores locaux via `Worker(...)` et
envoient les mêmes valeurs à l'inscription :

```python
worker = Worker(
    client,
    task_queue="payments",
    workflows=[PaymentWorkflow],
    activities=[charge_card, send_receipt],
    max_concurrent_workflow_tasks=8,
    max_concurrent_activity_tasks=12,
)
```

Pour les workers HTTP personnalisés, envoyez les champs d'emplacements à
`POST /api/worker/register` :

```json
{
  "worker_id": "payments-python-1",
  "task_queue": "payments",
  "runtime": "python",
  "supported_workflow_types": ["payments.PaymentWorkflow"],
  "supported_activity_types": ["payments.charge_card", "payments.send_receipt"],
  "max_concurrent_workflow_tasks": 8,
  "max_concurrent_activity_tasks": 12
}
```

Les emplacements des workers ne constituent pas seuls un budget strict de
locataire. Ils décrivent ce que les workers actifs peuvent traiter
actuellement. Ajoutez des plafonds serveur pour imposer une limite sur toute
la file, même si davantage de workers sont déployés.

## Inspecter l'admission {#inspect-admission}

Utilisez la CLI pour le débogage :

```bash
dw task-queue:list
dw task-queue:describe payments
dw task-queue:describe payments --json | jq '.admission'
```

Le serveur expose les mêmes données via :

- `GET /api/task-queues`
- `GET /api/task-queues/{name}`

Une charge utile d'admission comporte trois sections :

```json
{
  "workflow_tasks": {
    "status": "throttled",
    "active_worker_count": 3,
    "configured_slot_count": 24,
    "leased_count": 8,
    "ready_count": 5,
    "available_slot_count": 16,
    "server_max_active_leases_per_queue": 8,
    "server_active_lease_count": 8,
    "server_remaining_active_lease_capacity": 0,
    "server_max_active_leases_per_namespace": 300,
    "server_namespace_active_lease_count": 149,
    "server_remaining_namespace_active_lease_capacity": 151,
    "server_max_dispatches_per_minute": 120,
    "server_dispatch_count_this_minute": 120,
    "server_remaining_dispatch_capacity": 0,
    "server_max_dispatches_per_minute_per_namespace": 6000,
    "server_namespace_dispatch_count_this_minute": 3520,
    "server_remaining_namespace_dispatch_capacity": 2480,
    "server_dispatch_budget_group": "downstream-openai",
    "server_max_dispatches_per_minute_per_budget_group": 600,
    "server_budget_group_dispatch_count_this_minute": 600,
    "server_remaining_budget_group_dispatch_capacity": 0,
    "server_lock_required": true,
    "server_lock_supported": true,
    "budget_source": "worker_registration.max_concurrent_workflow_tasks",
    "server_budget_source": "server.admission.queue_overrides"
  },
  "activity_tasks": {
    "status": "accepting",
    "configured_slot_count": 36,
    "server_max_active_leases_per_queue": 12,
    "server_remaining_active_lease_capacity": 4,
    "server_max_dispatches_per_minute": 240,
    "server_remaining_dispatch_capacity": 197
  },
  "query_tasks": {
    "status": "accepting",
    "max_pending_per_queue": 1024,
    "approximate_pending_count": 7,
    "remaining_pending_capacity": 1017,
    "lock_supported": true,
    "budget_source": "server.query_tasks.max_pending_per_queue"
  }
}
```

## Référence des états {#status-reference}

| Section | État | Signification |
|---------|--------|---------|
| Workflow/activité | `accepting` | Les workers actifs ont des emplacements disponibles et aucun plafond serveur n'est atteint. |
| Workflow/activité | `throttled` | Le plafond facultatif côté serveur des baux actifs ou des distributions par minute est atteint. |
| Workflow/activité | `saturated` | Tous les emplacements inscrits des workers sont sous bail, même sans plafond serveur configuré. |
| Workflow/activité | `no_slots` | Les workers actifs ont inscrit zéro emplacement pour ce type de tâche. |
| Workflow/activité | `no_active_workers` | Aucun worker actif non périmé n'interroge cette file. |
| Workflow/activité | `unavailable` | Un plafond serveur configuré nécessite un verrou de cache qui est indisponible. |
| Requête de lecture | `accepting` | La file des tâches de requête en attente dispose encore de capacité. |
| Requête de lecture | `full` | Les tâches de requête en attente ont atteint `DW_QUERY_TASK_MAX_PENDING_PER_QUEUE` ; les nouvelles requêtes renvoient HTTP `429`. |
| Requête de lecture | `unavailable` | La file de tâches de requête ne peut pas acquérir son verrou de cache ; les nouvelles requêtes renvoient HTTP `503`. |

## Méthode de réglage {#tuning-pattern}

1. Dimensionnez d'abord les emplacements des workers selon le processus : le
   nombre de tâches de workflow limitées par le CPU est généralement inférieur
   à celui des tâches d'activité riches en entrées/sorties.
2. Ajoutez des plafonds de baux actifs aux files nécessitant une limite de
   travail en cours sur tous les workers.
3. Ajoutez des plafonds de baux actifs par espace de noms lorsqu'un locataire
   peut créer de nombreuses files mais nécessite une limite totale en cours.
4. Ajoutez des plafonds de distribution par minute aux files protégeant une
   API externe à débit limité, un pool de base de données, un locataire ou un
   service ancien contre les pointes, même si les workers ont des emplacements libres.
5. Ajoutez des plafonds de distribution par groupe de budget lorsque plusieurs
   files partagent une dépendance aval, mais que les autres files de l'espace
   de noms doivent continuer à fonctionner.
6. Ajoutez des plafonds de distribution par espace de noms si le quota aval
   s'applique au locataire entier plutôt qu'à une file.
7. Inspectez `dw task-queue:describe <queue>` sous charge. `saturated` indique
   qu'il faut ajouter de la capacité worker ou réduire le parallélisme du
   workflow. `throttled` indique qu'un plafond de baux actifs ou de débit de
   distribution remplit son rôle. `no_active_workers` indique que la file n'a
   aucun demandeur sain.
8. Gardez une capacité de tâches de requête suffisante pour les lectures
   opérationnelles normales, mais assez basse pour échouer rapidement pendant
   les incidents. Leur débordement est une contre-pression, pas une perte de données.

## Guides associés {#related-guides}

- [Serveur](/docs/polyglot/server)
- [CLI](/docs/polyglot/cli)
- [SDK Python](/docs/polyglot/python)
- [Protocole worker](/docs/polyglot/worker-protocol)
