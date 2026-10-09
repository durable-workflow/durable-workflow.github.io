---
sidebar_position: 3
title: Contraintes des activités
description: Rendre les effets externes sûrs face aux nouvelles tentatives, à l’expiration des baux et à la redistribution.
---

# Contraintes des activités {#activity-constraints}

Les activités franchissent la frontière durable pour effectuer des entrées/sorties et des effets de bord. Elles ne sont pas relues comme le code des workflows. Elles sont exécutées **au moins une fois**. De nouvelles tentatives, l’expiration du bail et la redistribution peuvent faire observer plusieurs fois le même travail logique.

Ce comportement fait partie du contrat. Si une activité déclenche un paiement, envoie un e-mail, écrit dans un autre système ou modifie une ressource externe, l’opération doit pouvoir être répétée sans danger.

## Conséquences pratiques {#what-this-means-in-practice}

- L’identifiant d’idempotence par défaut d’une activité logique est `activity_execution_id`.
- Chaque nouvelle tentative possède aussi son propre `activity_attempt_id`.
- Un worker peut terminer le travail externe, perdre son bail et envoyer son rapport trop tard. Le moteur peut refuser le rapport parce qu’un autre worker a déjà enregistré le résultat retenu, alors que l’effet externe a bien eu lieu.
- Les activités peuvent utiliser les entrées/sorties, l’horloge réelle et l’état mutable du processus. Le code des workflows ne le peut pas. Gardez cette frontière explicite.

## Modèles d’idempotence recommandés {#preferred-idempotency-patterns}

De nombreuses API externes acceptent un `Idempotency-Key`. Utilisez l’identifiant de l’activité logique fourni par le runtime lorsque le service distant le permet.

- Privilégiez `activity_execution_id` lorsque le système distant doit traiter les nouvelles tentatives comme une seule requête logique.
- Utilisez `activity_attempt_id` seulement si le système distant doit distinguer les tentatives du même travail logique.

D’autres approches conviennent :

- Écrire vers un nom de ressource externe déterministe ou une clé naturelle.
- Utiliser un upsert ou une table de déduplication indexée par un identifiant durable.
- Rendre l’opération naturellement idempotente, de sorte que le deuxième appel ne change rien.

De nombreuses opérations sont naturellement idempotentes. Encoder deux fois une vidéo donne la même vidéo. Supprimer deux fois le même fichier ne change rien à la deuxième suppression.

D’autres opérations ne le sont pas, mais une duplication peut rester le mode d’échec le plus sûr. Si vous ne savez pas si un e-mail a quitté le fournisseur, le renvoyer peut être préférable à la perte silencieuse de la notification. Choisissez ce compromis explicitement.

## Hypothèses à éviter {#what-not-to-assume}

- Une tentative d’activité n’est pas nécessairement exécutée par un seul worker.
- Une nouvelle tentative ne prouve pas que l’effet externe précédent a échoué.
- Une fin rapportée tardivement ne signifie pas que l’activité n’a jamais été exécutée.
- Déplacer les effets de bord dans le workflow pour éviter les nouvelles tentatives transforme un problème d’idempotence en erreur de déterminisme.

Consultez les [garanties d’exécution et l’idempotence](./execution-guarantees.md) pour le contrat complet, et les [échecs et la reprise](../failures-and-recovery.md) pour les actions d’exploitation.
