---
sidebar_position: 2
title: "Idempotence et déterminisme"
sidebar_label: Idempotence et déterminisme
description: Dans Durable Workflow 2.0, le déterminisme protège la relecture de l’orchestration et l’idempotence rend sûrs les effets des activités réessayées.
slug: /constraints/idempotent-vs-deterministic
canonical_path: /docs/constraints/idempotent-vs-deterministic/
image: /img/idempotent-vs-deterministic.png
tags:
  - constraints
  - determinism
  - idempotency
  - replay
keywords:
  - idempotent et déterministe
  - idempotence et déterminisme
  - déterministe et idempotent
  - workflow déterministe
  - activité idempotente
---

# Workflows idempotents et déterministes : quelle différence ? {#idempotent-vs-deterministic-workflows-whats-the-difference}

**Un comportement déterministe prend les mêmes décisions avec les mêmes entrées et le même historique. Un comportement idempotent produit le même effet voulu, que l’opération soit exécutée une seule fois ou plusieurs fois.** Le déterminisme rend une exécution prévisible. L’idempotence rend les répétitions sûres. Aucune de ces propriétés n’implique l’autre.

| Question | Déterministe | Idempotent |
| --- | --- | --- |
| Qu’est-ce qui reste identique ? | Les décisions prises à partir des mêmes entrées et du même historique | L’effet externe voulu après un ou plusieurs appels |
| Pourquoi Durable Workflow en a-t-il besoin ? | La relecture doit reconstruire le même parcours de workflow | Les nouvelles tentatives et livraisons ne doivent pas dupliquer les effets de bord |
| Où cette propriété s’applique-t-elle ? | Dans le code des workflows et de l’orchestration | Dans les activités et les systèmes qu’elles appellent |
| Interdit-elle les entrées-sorties ou le hasard ? | Oui, dans le code de workflow relu, sauf si le résultat est enregistré | Non. Une activité peut utiliser les entrées-sorties, l’heure ou le hasard tout en rendant son effet sûr à répéter |

## Deux propriétés indépendantes {#the-properties-are-independent}

### Déterministe mais non idempotent {#deterministic-but-not-idempotent}

Prenons une opération qui incrémente un compteur :

```text
increment(counter):
    counter.value = counter.value + 1
```

À partir de la même valeur initiale du compteur, l’opération effectue toujours le même calcul. Elle est donc déterministe. Elle n’est pas idempotente : deux appels incrémentent le compteur deux fois, tandis qu’un appel l’incrémente une seule fois.

### Idempotent mais non déterministe {#idempotent-but-not-deterministic}

Prenons maintenant une activité qui place une commande dans un état connu, mais utilise un délai aléatoire entre les tentatives de contact du service :

```text
archive(order_id):
    wait(random_backoff())
    PUT /orders/{order_id}/status {"status": "archived"}
```

Les délais et le nombre de tentatives internes peuvent varier. Cette implémentation n’est donc pas déterministe. L’opération peut néanmoins être idempotente : après un appel réussi ou plusieurs, la commande est archivée. La réponse, la latence et le parcours interne n’ont pas besoin d’être identiques. C’est l’effet externe voulu qui doit le rester.

## Pourquoi le code des workflows doit être déterministe {#why-workflow-code-must-be-deterministic}

Durable Workflow reconstruit l’état de l’orchestration en relisant l’historique validé. Avec les mêmes entrées et le même historique, le code du workflow doit planifier les mêmes activités, temporisateurs et attentes dans le même ordre. Une lecture de l’horloge système, une valeur aléatoire, une requête sur la base de données actuelle ou une réponse réseau dans le corps du workflow peut sélectionner une branche différente pendant la relecture. Les nouvelles décisions seraient alors en désaccord avec l’historique.

Déplacez ces opérations dans des activités, ou utilisez une fonction de workflow qui enregistre la valeur dans l’historique. La relecture retourne alors le résultat enregistré de l’activité ou de l’effet de bord, sans refaire l’opération externe. Le déterminisme n’exige pas que chaque appel d’activité produise une réponse universelle et intemporelle. Il exige que l’orchestration relue prenne des décisions conformes à son historique enregistré.

Consultez les [contraintes des workflows](./workflow-constraints.md) pour les règles d’écriture et le [fonctionnement interne](../how-it-works.md) pour le modèle de relecture.

## Pourquoi les activités et les effets de bord doivent être idempotents {#why-activities-and-side-effects-must-be-idempotent}

Les activités franchissent la frontière de persistance vers les bases de données, API de paiement, fournisseurs d’e-mail, stockages objet et autres systèmes. Elles peuvent être livrées de nouveau après une expiration, une nouvelle tentative, une défaillance de worker ou l’expiration d’un bail. Un worker peut même terminer la modification externe puis échouer avant que Durable Workflow reçoive son compte rendu.

Concevez l’effet voulu de l’activité pour qu’une autre tentative soit sûre :

- envoyez une clé d’idempotence stable à l’API distante
- faites un upsert à l’aide d’un identifiant métier ou d’exécution durable
- écrivez dans un objet ou une ressource dont le nom est déterministe
- utilisez une opération naturellement idempotente, comme définir une valeur ou supprimer une ressource connue

Une clé d’idempotence ne rend pas le code d’activité déterministe et n’empêche pas le démarrage d’une autre tentative. Elle permet au système externe de reconnaître que les tentatives répétées représentent la même opération logique.

Consultez les [contraintes des activités](./activity-constraints.md), le [modèle d’exécution des activités](../features/activity-execution-model.md) et les [garanties d’exécution et l’idempotence](./execution-guarantees.md) pour les contrats de nouvelles tentatives, de nouvelles livraisons et d’historique durable.

## Une même frontière pour tous les SDK {#one-boundary-across-every-sdk}

La même conception s’applique aux workers écrits en PHP, Python ou Rust :

1. Préservez la sûreté de la relecture de l’orchestration : avec les mêmes entrées et le même historique, émettez les mêmes commandes durables.
2. Placez les appels réseau, horloges, valeurs aléatoires et états externes modifiables derrière une frontière d’activité.
3. Donnez à chaque activité produisant un effet de bord une identité stable que le système cible peut dédupliquer.

La syntaxe du langage change. La frontière entre déterminisme et idempotence reste la même.
