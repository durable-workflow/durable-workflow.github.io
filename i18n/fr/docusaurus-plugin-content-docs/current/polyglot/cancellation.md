---
title: Annulation coopérative
description: Demander un nettoyage borné pour un workflow, ses enfants et ses activités.
---

# Annulation coopérative {#cooperative-cancellation}

Server 2.5.0 ajoute l'annulation coopérative via le protocole 1.20. Elle exige
des workers qui activent explicitement la coopération. Vérifiez la découverte
du runtime et les capacités prises en charge par le SDK avant de l'utiliser.

## Demander le nettoyage {#request-cleanup}

Utilisez `requestCancellation()` dans le SDK PHP, `request_cancellation()` en
Python ou Rust, ou la route `request-cancellation` de Server. L'exécution reste
active pendant que le code du workflow traite la demande et effectue le
nettoyage. Un nettoyage réussi termine l'exécution avec l'état `Cancelled`.

```http
POST /api/workflows/{workflowId}/runs/{runId}/request-cancellation
X-Durable-Workflow-Control-Plane-Version: 2
Authorization: Bearer <operator-token>
X-Namespace: <namespace>
Content-Type: application/json

{"reason":"Order withdrawn","cleanup_timeout_seconds":30}
```

L'exécution sélectionnée doit toujours être l'exécution courante. Une première
demande acceptée renvoie HTTP 202. Un doublon renvoie HTTP 200 avec l'identité
et l'échéance de la demande d'origine. Modifier le délai dans un doublon ne
prolonge pas le budget de nettoyage.

Le contexte d'annulation immuable expose les identifiants de la demande et de
sa racine, le motif, le demandeur, la source, l'heure d'origine, l'échéance et
la filiation ordonnée. Le code du workflow le reçoit à la frontière de
livraison enregistrée. Les appels terminés auparavant sont relus normalement.
Les fonctions déterministes `deadline()` et `remaining()` permettent au
nettoyage de prendre les mêmes décisions après un redémarrage.

La méthode existante `cancel()` ferme immédiatement une exécution sans
reprendre le nettoyage du workflow. `terminate()` la ferme aussi immédiatement,
avec le résultat `Terminated`.

## Choisir les politiques des opérations {#choose-operation-policies}

| Politique | Workflow enfant | Activité distante | Activité locale |
| --- | --- | --- | --- |
| TryCancel | Demander le nettoyage de l'enfant et poursuivre celui du parent | Demander l'arrêt du callback et poursuivre le nettoyage du workflow | Arrêter le callback supervisé et poursuivre le nettoyage |
| WaitCancellationCompleted | Attendre le résultat terminal enregistré de l'enfant | Attendre le reçu durable d'arrêt du callback d'origine | Attendre le reçu durable d'arrêt du callback d'origine |
| Abandon | Laisser l'enfant indépendant | Laisser l'activité indépendante sous son délai total fini d'origine | Rejetée avant admission |

La fermeture du parent possède sa propre politique. `RequestCancellation`
transmet une demande coopérative avec la filiation d'annulation d'origine et
une échéance bornée. `RequestCancel` conserve son comportement historique
d'annulation immédiate.

Chaque enfant coopératif hérite de l'identité de la demande racine et du budget
de nettoyage. Un enfant peut recevoir une échéance plus courte, mais ne peut
pas augmenter ce budget. Une opération abandonnée possède une durée de vie
indépendante et ne participe pas à cette attente de nettoyage.

## Supervision et reprise {#supervision-and-recovery}

Les workers coopératifs observent l'annulation indépendamment des heartbeats
des activités de l'application. PHP utilise des processus de callback
supervisés. Python supervise les callbacks asynchrones et synchrones. Rust
supervise les futures des callbacks asynchrones. Les tâches détachées et les
services en aval nécessitent leur propre comportement d'annulation et
d'idempotence.

Le nettoyage peut utiliser un bouclier d'annulation pour effectuer des
activités durables, des temporisateurs et des appels d'enfants. Le bouclier
conserve l'échéance d'origine. Si un worker meurt, son remplaçant relit la même
frontière de livraison et les appels de nettoyage terminés avant de reprendre.
L'expiration ou la terminaison révoque l'autorité d'exécution restante.

Une ancienne tentative d'activité ne peut plus publier de résultat après la
révocation de son autorité. Les effets externes déjà acceptés nécessitent
toujours une idempotence ou une réconciliation au niveau de l'application.

## Inspecter la cascade {#inspect-the-cascade}

Les diagnostics d'exécution exposent `cancellation_cascade`, avec la demande
racine, les exécutions participantes, les tentatives d'activité, les
politiques, les reçus d'arrêt, les échéances et les résultats du nettoyage.
La CLI et Waterline présentent la même vue.

Le cycle de vie distingue `requested`, `delivered`, `cleaning_up`, `cancelled`,
`deadline_expired` et `terminated`. Une vue incomplète indique ce qui ne peut
pas être vérifié au lieu de considérer l'absence d'un reçu comme une réussite.

Une demande visant une attribution active à un worker incompatible renvoie un
refus de capacité explicite sans enregistrer d'annulation partielle. Mettre à
jour une inscription ne met pas à jour une attribution déjà émise.

## Périmètre de la version {#release-boundary}

Les demandes portant sur une exécution entière, les politiques des enfants et
activités, le nettoyage protégé borné, la reprise et l'inspection des cascades
constituent la version prise en charge. Les portées d'opérations annulables
indépendamment restent un aperçu désactivé dans les sources et sont marquées
comme expérimentales dans la référence du protocole.

Consultez la [spécification du protocole worker](/platform-protocol-specs/worker-protocol-api.openapi.yaml)
pour les formes exactes des demandes, reçus et capacités. Les guides d'écriture
propres aux langages se trouvent sur les sites des SDK
[PHP](https://php.durable-workflow.com/), [Python](https://python.durable-workflow.com/)
et [Rust](https://rust.durable-workflow.com/).
