---
sidebar_position: 4
description: Ce que le code des workflows et des activités peut faire.
---

# Résumé des contraintes {#constraints-summary}

| Contrainte | Code du workflow | Code de l’activité |
| --- | --- | --- |
| Entrées-sorties | Interdites | Autorisées |
| Variables globales modifiables | Interdites | Autorisées |
| Fonctions non déterministes | Interdites | Autorisées |
| `Carbon::now()` | Interdit | Autorisé |
| `sleep()` | Interdit | Autorisé |
| Effets de bord externes | À déplacer dans des activités | Autorisés uniquement si leur répétition est sans danger |

Le code d’un workflow doit être déterministe, car le moteur reconstruit son état en relisant l’historique de ses étapes durables. Il rappelle le corps du workflow, sans réexécuter les activités. Si le corps prend des décisions différentes pendant la relecture, le moteur ne peut pas reconstruire l’état ni poursuivre correctement l’exécution. Le corps du workflow n’a pas besoin d’être idempotent. La relecture exige le déterminisme.

Les activités doivent être idempotentes, car elles s’exécutent au moins une fois. Les nouvelles tentatives, l’expiration des baux et les nouvelles livraisons peuvent faire observer plusieurs fois la même tentative. C’est un comportement normal pris en charge, pas une erreur. Rendre le corps de l’activité ou sa cible externe sûr à répéter, au moyen d’une clé d’idempotence, d’une ressource cible déterministe ou d’une opération naturellement idempotente, empêche les exécutions répétées de produire des effets de bord en double.

Consultez [Idempotence et déterminisme des workflows](/docs/constraints/idempotent-vs-deterministic/)
pour une comparaison directe et des exemples distinguant ces deux propriétés.

Les [garanties d’exécution et l’idempotence](./execution-guarantees.md) décrivent
le contrat public v2 associé à ces termes.
