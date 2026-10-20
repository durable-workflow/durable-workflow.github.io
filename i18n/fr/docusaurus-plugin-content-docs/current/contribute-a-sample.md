---
sidebar_position: 9
tags:
  - sample-app
  - contributing
  - patterns
keywords:
  - contribuer un exemple
  - contribution exemple durable workflow
  - processus sample-request
  - workflow d’exemple externe
---

# Contribuer un exemple {#contribute-a-sample}

L’[application d’exemple](/docs/sample-app) est la référence pour montrer un
modèle Durable Workflow dans un vrai projet Laravel. Si vous avez un modèle
utile à d’autres ingénieurs, comme une forme de saga encore absente, un autre
usage des flux de messages ou une intégration non couverte par les exemples
actuels, ce guide décrit le parcours pour le faire intégrer.

Ce contrat est volontairement court. Un exemple qui le respecte est intégré
à un rythme prévisible. Un exemple incomplet reste en revue jusqu’à ce que
les éléments manquants soient fournis.

## Avant d’écrire du code {#before-you-write-code}

1. **Ouvrez d’abord une issue `sample-request`.** Le
   [modèle `sample-request`](https://github.com/durable-workflow/sample-app/issues/new/choose)
   précise le modèle illustré, sa page de documentation publique et la version
   minimale du paquet Durable Workflow nécessaire. L’issue permet aux
   mainteneurs et au contributeur de convenir de l’intérêt de l’exemple
   *avant* d’investir dans une PR.
2. **Choisissez un modèle encore absent de l’index des exemples.** L’[index du README](https://github.com/durable-workflow/sample-app#sample-index)
   énumère tous les modèles couverts. Une autre écriture du workflow simple
   correspond à une modification documentaire de `App\Workflows\Simple\SimpleWorkflow`,
   sans constituer un nouvel exemple.
3. **Trouvez la classe de workflow existante la plus proche.** Un nouvel
   exemple doit ressembler à ses voisins : même structure sous
   `app/Workflows/<Pattern>/`, même forme de commande Artisan et même
   approche des tests. Un exemple qui invente une nouvelle structure de
   projet est refusé, même si le modèle illustré est pertinent.

## Les éléments d’un exemple intégré {#what-a-merged-sample-looks-like}

Un exemple intégré est *exécutable*, *pédagogique*, *testé* et *visible*.
Cela correspond à quatre éléments dans le dépôt sample-app :

1. **Une classe de workflow** sous `app/Workflows/<Pattern>/` qui démontre
   le modèle de bout en bout. Le code reste déterministe : lectures d’horloge
   derrière `sideEffect()`, travail externe dans des activités, attentes
   via signaux, mises à jour, temporisateurs ou flux de messages. La classe
   compile sans `OPENAI_API_KEY` ni autres identifiants externes, sauf si
   le modèle les exige explicitement.
2. **Une commande Artisan** qui démarre le workflow avec des données réalistes
   pour qu’un lecteur puisse lancer une commande et voir l’exécution dans
   Waterline. La commande côtoie les autres commandes Artisan dans
   `routes/console.php`, ou l’entrée d’enregistrement équivalente, et
   respecte la convention `app:<short-pattern>`.
3. **Une entrée `config/workflow_mcp.php`** qui nomme la classe de workflow,
   le modèle, la commande, les identifiants requis et les arguments. Cette
   entrée rend l’exemple découvrable via MCP. Le contrôle de couverture amont
   refuse de marquer une ligne `covered` tant qu’elle est absente.
4. **Un test sous `tests/`** qui exerce le workflow avec le worker v2 en
   mémoire. Il n’a pas besoin de vérifier chaque événement d’historique typé,
   mais doit démontrer que le workflow se termine pour les entrées transmises
   par la commande Artisan.

Si l’exemple démontre une *correction de bogue* plutôt qu’une fonctionnalité,
placez-le sous `app/Workflows/Bug/<short-id>/`, avec les mêmes quatre éléments.

## Contenu de la documentation {#what-goes-in-the-docs}

Trois parties de la documentation changent lors de l’ajout d’un exemple :

- **L’index « Sample Index » du README** du dépôt sample-app, avec une ligne
  par exemple indiquant son objectif, sa classe de workflow, sa commande
  Artisan et sa clé MCP. C’est la source de référence.
- **La galerie du site documentaire
  ([`docs/sample-app.md`](/docs/sample-app))**, avec une ligne correspondante
  indiquant l’écran Waterline attendu. Elle permet au lecteur de choisir
  l’exemple avant de cloner le dépôt.
- **Un lien depuis la page du modèle** sur le site documentaire qui définit
  l’interface concernée : sagas, signaux, flux de messages, workflows enfants,
  etc. La table de liens au bas de la page sample-app est la liste de
  référence. Une entrée qui nomme une interface sans lien vers un exemple
  constitue une lacune.

Proposez l’exemple et le README dans la PR sample-app, et la galerie et les
pages de modèles dans une PR liée sur le site documentaire. Les mainteneurs
intègrent ces modifications ensemble.
Sans miroir sur le site documentaire, un exemple reste à l’état `gap` dans
le suivi de couverture amont jusqu’à l’intégration de la PR de documentation.
Les contributeurs sont donc encouragés à les livrer ensemble.

## Nommage, structure et style {#naming-layout-and-style}

- **Structure des classes.** `app/Workflows/<Pattern>/<Pattern>Workflow.php`,
  avec les activités à côté sous `app/Workflows/<Pattern>/Activities/`.
  Les reproductions de bogues suivent la même structure sous
  `app/Workflows/Bug/<short-id>/`.
- **Commande Artisan.** `app:<short-pattern>`, en minuscules et sans trait
  d’union. Les noms longs comme `app:run-<pattern>` ne sont pas utilisés.
- **Clé MCP.** Utilisez le même nom court que la commande Artisan pour que
  le client MCP voie le nom tapé par un humain dans le terminal.
- **Commentaires.** Expliquez les raisons. Les invariants de sûreté de
  relecture méritent un commentaire, comme le recours à `sideEffect()` ou
  à un temporisateur plutôt qu’à `usleep()`. Répéter le même commentaire
  à chaque appel d’activité n’est pas utile.
- **Captures Waterline.** La galerie sample-app du site documentaire nomme
  l’écran Waterline attendu. Ajoutez ou actualisez cette capture dans la PR
  de l’exemple.

## Motifs de refus {#what-gets-a-sample-rejected}

Un exemple est renvoyé pour correction lorsque :

- le workflow utilise `now()`, `random_*()` ou d’autres appels non
  déterministes hors de `sideEffect()` ou d’une activité
- les activités effectuent la tenue d’état durable déjà gérée par le moteur,
  comme écrire directement dans `workflow_messages`, avancer les curseurs
  de flux manuellement ou persister l’état Waterline depuis le workflow
- la commande Artisan nécessite des identifiants externes sans l’indiquer
  dans le champ `requires` de l’entrée MCP
- la ligne de l’index du README, celle de la galerie et le lien de la page
  du modèle ne sont pas livrés dans la même modification
- l’exemple reproduit un modèle existant sans nouvelle forme, nouveau mode
  d’échec ni nouvelle intégration. Le même modèle décrit autrement relève
  d’une modification documentaire

Le contrôle de couverture amont et la liste de revue sample-app vérifient ces
mêmes points. Les détecter avant d’ouvrir la PR accélère donc son intégration.

## Liste de contrôle rapide {#quick-checklist}

Utilisez cette liste à l’ouverture de la PR :

- [ ] Une issue `sample-request` existe et lie la page publique du modèle.
- [ ] Une classe de workflow est présente sous `app/Workflows/<Pattern>/`.
- [ ] Une commande Artisan est enregistrée sous le nom `app:<short-pattern>`.
- [ ] L’entrée `config/workflow_mcp.php` contient classe, modèle, commande,
      identifiants requis et arguments.
- [ ] Un test exerce le workflow de bout en bout.
- [ ] Une ligne figure dans l’index « Sample Index » du README.
- [ ] Une ligne figure dans la galerie [`docs/sample-app.md`](/docs/sample-app).
- [ ] Un lien provient de la page du modèle correspondant sur le site.
- [ ] Le contrôle des frontières publiques est réussi (`scripts/check-public-boundary.sh`).

Les mainteneurs utilisent la même liste pendant la revue. Une PR qui coche
toutes les cases devrait être intégrée dans un cycle de publication.
