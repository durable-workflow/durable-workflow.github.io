---
sidebar_position: 1
title: Vue d’ensemble des contraintes
description: Comprendre le déterminisme des workflows, l’idempotence des activités et leurs frontières d’exécution.
---

# Vue d’ensemble {#overview}

Workflows et activités se trouvent de part et d’autre de la frontière durable et ont des contraintes différentes. Le code d’un workflow est **relu**. Le code d’une activité peut être **réessayé**.

Le guide [idempotence et déterminisme](/docs/constraints/idempotent-vs-deterministic/) compare les deux propriétés avec des exemples et explique pourquoi l’une n’implique pas l’autre.

- **Le code d’un workflow doit être déterministe.** Le moteur relit l’historique pour reconstruire son état à chaque reprise : sur un autre worker, après un redémarrage ou un déploiement, ou pendant une longue exécution. La relecture appelle de nouveau le corps du workflow, pas les activités. Avec le même historique, il doit produire les mêmes décisions dans le même ordre. Il ne doit pas lire directement l’horloge réelle, un cache changeant, des nombres aléatoires ou le réseau. Utilisez [`Workflow::now()`](../defining-workflows/workflow-api.md), [`sideEffect(...)`](../features/side-effects.md), les activités et les autres mécanismes durables pour franchir cette frontière.

- **Le code d’une activité doit être idempotent.** Les tentatives d’activité sont exécutées **au moins une fois**. Les nouvelles tentatives, l’expiration du bail et la redistribution peuvent faire observer plusieurs fois le même travail logique. C’est un comportement prévu. Le framework enregistre au plus un résultat terminal par tentative dans l’état durable, mais le corps d’une activité peut démarrer plusieurs fois avant que le moteur reçoive le rapport retenu. Utilisez une clé d’idempotence, une ressource cible déterministe ou une opération naturellement idempotente lorsque l’effet externe ne doit pas être dupliqué.

- **L’event sourcing conserve l’historique.** Chaque étape durable, comme la fin d’une activité, le déclenchement d’un temporisateur, la réception d’un signal ou l’enregistrement d’un effet de bord, devient un événement d’historique typé. La relecture fournit les résultats enregistrés au corps du workflow. Elle ne redistribue pas les activités, temporisateurs ou signaux déjà enregistrés. Les événements d’état durable d’un même identifiant sont enregistrés une seule fois dans l’historique, même si le transport a livré le travail plusieurs fois.

Déterminisme et idempotence permettent de reprendre des workflows à travers les déploiements, redémarrages de workers et nouvelles tentatives distribuées sans perdre leur progression, ni dupliquer les effets externes que l’application a rendus sûrs à répéter.

Les [garanties d’exécution et l’idempotence](./execution-guarantees.md) décrivent le contrat public v2 de relecture, redistribution, expiration des baux et enregistrement unique de l’historique durable. Les [contraintes des workflows](./workflow-constraints.md) précisent les règles de déterminisme. Les [contraintes des activités](./activity-constraints.md) expliquent comment sécuriser leur exécution au moins une fois.
