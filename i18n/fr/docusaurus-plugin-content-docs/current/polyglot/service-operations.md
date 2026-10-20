---
title: Appels de service entre espaces de noms
description: Publier une opération de service et l’appeler durablement depuis un autre espace de noms.
---

# Appels de service entre espaces de noms {#cross-namespace-service-calls}

Une opération de service, également appelée opération Nexus, est l’appel durable pris en charge entre espaces de noms d’un même cluster Durable Workflow. Elle est adressée par l’espace de noms cible et le triplet endpoint/service/opération. Un workflow enfant ou un signal ordinaire reste dans son espace de noms. Ni le nom d’une file ni un autre langage ne change cette règle.

## Choisir une interface prise en charge {#choose-a-supported-authoring-surface}

| Appelant | Interface publiée | Espace de noms cible |
| --- | --- | --- |
| PHP embarqué | `Workflow::serviceOperation()` ou la fonction auxiliaire `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | Option de tableau `namespace => 'billing'` |
| Python SDK | `yield context.call_nexus_service(...)` | Argument nommé `target_namespace='billing'` |
| Rust SDK | La création d’attentes Nexus n’est pas publiée | Suivie dans [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86). Un brouillon retenu ne constitue pas une prise en charge installable. |

Utilisez l’[exemple embarqué](../features/service-operations.md) pour un workflow Laravel, l’[exemple du PHP SDK](https://php.durable-workflow.com/build/workflows-activities/) pour son API de worker séquentielle ou la [référence des workflows Python](https://python.durable-workflow.com/reference/workflow/) pour les générateurs. Avant de déployer un appelant, vérifiez le contrat des opérations de service annoncé par le runtime connecté. Une API de gestion du client ne prouve pas à elle seule la prise en charge par un worker de workflows.

Dans le PHP SDK, l’option de tableau est actuellement la voie de création des appels entre espaces de noms. L’option typée équivalente est suivie dans [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193).

## Publier l’opération cible {#publish-the-target-operation}

L’espace de noms cible possède l’endpoint, le service, l’opération et le worker du gestionnaire. Créez d’abord cet espace et lancez un worker qui enregistre le type de workflow cible sur la file choisie. Ce catalogue utilise l’espace `billing`, le type `billing.invoice` et la file `billing`.

Les modifications du catalogue nécessitent des identifiants administrateur. Le runtime vérifie séparément l’autorité de l’appelant lorsqu’un workflow détenant un bail émet sa commande de service.

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

Les noms du catalogue sont normalisés en minuscules. Les enregistrements d’endpoint et de service organisent l’opération sans remplacer son gestionnaire réel. Gardez un worker compatible disponible dans l’espace de noms cible. L’enregistrement ne prouve pas que du travail a été exécuté.

## Attente et résultats enregistrés {#waiting-and-recorded-results}

Le PHP SDK utilise par défaut `mode_override=sync` et `wait_for=completed`. Python utilise `mode='sync'` et `wait_for='completed'`. Les deux suspendent l’exécution jusqu’à une issue terminale durable du service puis rejouent le résultat enregistré ou l’échec typé au point d’appel d’origine. Un appel en attente ou démarré n’est pas un résultat métier réussi.

Pour attendre seulement l’admission, PHP utilise `wait_for='accepted'` ou `mode_override='async'`; Python prend en charge `wait_for='accepted'`, `mode='async'` et la fonction auxiliaire `start_nexus_operation()`. Conservez l’id renvoyé pour l’inspection. Une fin ultérieure ne remplace pas l’admission d’origine enregistrée pour l’appelant. Attendez la fin lorsque les décisions du workflow nécessitent le résultat cible.

Bornez l’exécution du service avec la `deadline_policy` du catalogue, comme ci-dessus. Elle accepte exactement un entier positif `timeout_seconds` ou un `deadline_at` RFC3339 avec décalage horaire. Le runtime enregistre un unique `call_deadline_at` depuis l’acceptation d’origine. La relecture, les nouvelles tentatives et les modifications ultérieures du catalogue ne le réinitialisent pas. Une politique null ne crée pas de nouvelle échéance de service.

N’utilisez pas le `wait_timeout_seconds` de l’appelant comme timeout d’exécution. Une option d’attente d’une seconde sans échéance de catalogue peut tout de même livrer le résultat d’une cible terminant après trois secondes. Après un timeout, inspectez l’appel d’origine et la cible liée. L’expiration ne prouve pas l’absence d’effets externes; l’annulation de la cible relève d’une politique distincte.

## Échecs, nouvelles tentatives et idempotence {#failures-retries-and-idempotency}

PHP expose les échecs terminaux du service via `ServiceOperationFailed`; Python lève `NexusOperationFailed` au point de yield. Conservez les détails typés et l’id de l’appel lors du traitement d’une erreur. Le workflow peut gérer les échecs métier attendus; les autres peuvent rester des échecs de workflow.

Le runtime possède la politique enregistrée de nouvelles tentatives du service. N’ajoutez pas une seconde boucle de tentatives HTTP dans le workflow. PHP et Python déduisent des clés stables pour les appels habituels. Si l’application fournit une clé, gardez la même cible, requête et opération prévue pour les tentatives et la relecture. Une nouvelle clé est une nouvelle requête métier, pas la récupération d’un accusé de réception perdu.

Gardez stables l’espace cible, le triplet du catalogue, le payload et les options d’attente dans les historiques ouverts. Utilisez une branche de version du workflow lorsque cette intention durable change.

## Appliquer la frontière de l’espace de noms {#enforce-the-namespace-boundary}

La valeur par défaut entre espaces de noms est `allow`. L’authentification, les vérifications de rôles, les autres politiques de frontière et l’autorisation d’espace de noms continuent de s’appliquer. L’identité de l’appelant provient du workflow détenant le bail; les données applicatives ne peuvent pas usurper un autre espace appelant.

Pour qu’un PHP Server autohébergé refuse ces appels, configurez et redémarrez ses rôles API/worker de façon cohérente:

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

La politique refuse l’appel entre espaces de noms avant l’envoi au gestionnaire. Les appels dans le même espace et les autres politiques de frontière restent à examiner. Cette variable ne remplace ni les identifiants ni les ACL des locataires.

## Inspecter l’appel d’origine {#inspect-the-original-call}

Utilisez l’[API de détail des appels et du catalogue](./server-api-reference.md#service-catalog-admin-apis) ou l’[inspection des appels de service du CLI](./cli-reference.md#service-call-inspection). Conservez ensemble les ids de workflow/exécution appelants et celui de l’appel de service cible. Une inspection en lecture seule ne demande aucune nouvelle exécution. Réutilisez l’id d’origine pour vérifier une réponse perdue ou un remplacement de worker.
