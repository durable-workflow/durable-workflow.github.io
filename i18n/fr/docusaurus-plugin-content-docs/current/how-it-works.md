---
sidebar_position: 10
title: Fonctionnement
description: Comprendre l’exécution durable, la relecture de l’historique et les activités en file dans Laravel.
---

# Fonctionnement {#how-it-works}

Durable Workflow utilise les jobs en file de Laravel et la persistance par événements pour créer des coroutines durables. Les workflows se suspendent à travers des appels fondés sur les Fibers, avec un contrat de relecture durable.

## Runtime {#runtime}

Un workflow est une classe dont la méthode `handle()` appelle directement des fonctions comme `activity()`, `await()`, `timer()`, `sideEffect()`, `child()` et `all([...])`. Chaque appel suspend le workflow jusqu’à la fin de l’étape durable correspondante. Il reprend ensuite avec le résultat enregistré.

Chaque étape produit un événement d’historique durable. À chaque réveil du workflow, le moteur relit l’historique et reconstruit son état avant d’exécuter la prochaine étape non effectuée. Cette relecture permet de reprendre après un redémarrage de worker, un déploiement ou une panne de machine sans perdre sa progression.

`WorkflowStub::make()` réserve un identifiant public d’instance. Le démarrage crée la première exécution et la première tâche de workflow. Chaque exécution possède son propre run ID. Les opérations `signal()`, `cancel()` et `terminate()` ciblent l’exécution courante de l’instance.

## Event sourcing {#event-sourcing}

L’event sourcing reconstruit l’état courant à partir d’une suite d’événements enregistrés. Il fournit un historique complet des événements d’exécution et permet de reprendre un workflow après l’arrêt brutal d’un worker.

## Coroutines {#coroutines}

Une coroutine est une fonction dont l’exécution peut être suspendue puis reprise. Les points de suspension durables sont des appels directs fondés sur les Fibers, comme `activity()`, `await()`, `timer()` et `sideEffect()`.

Le code utilisateur se trouve dans `handle()`, une méthode ordinaire qui appelle ces fonctions directement. Le runtime vérifie d’abord si l’étape est déjà terminée de façon durable. Si c’est le cas, il retourne le résultat enregistré dans l’historique. Sinon, il met en file l’activité, le temporisateur ou le travail du workflow enfant, puis suspend l’exécution jusqu’à la réussite ou à l’échec de l’étape.

## Activités {#activities}

Un workflow appelle plusieurs activités et orchestre leurs résultats. Lorsqu’il atteint un appel d’activité, il se suspend jusqu’à sa fin, puis poursuit son exécution.

Si un worker de workflow s’arrête brutalement, la relecture des événements validés reconstruit l’état courant. Le workflow reprend avec les mêmes entrées et sorties et conserve son déterminisme. Une erreur de workflow non gérée rend l’exécution terminale. La relecture ne réessaie pas une exécution déjà échouée.

En v2, les activités ordinaires sont du travail durable en file. Les [activités locales](./features/local-activities.md) explicites exécutent un travail court dans le processus du worker de workflow, tout en conservant l’historique durable et les règles de nouvelle tentative. Une activité ordinaire peut être exécutée par n’importe quel worker compatible. Les [sessions de worker](./features/worker-sessions.md) ajoutent un bail explicite lorsqu’une suite d’activités doit utiliser la même ressource locale au worker. Pour enregistrer une valeur une seule fois, compatible avec la relecture et sans mettre d’activité en file, utilisez [`sideEffect(...)`](./features/side-effects.md). Le [modèle d’exécution des activités](./features/activity-execution-model.md) décrit le contrat complet.

## Garanties d’exécution {#execution-guarantees}

La répétition du code a une signification différente pour les workflows et les activités :

- **Le code d’un workflow est relu.** La redistribution d’une tâche reconstruit l’état depuis l’historique durable et réexécute le code déterministe. Elle ne répète pas les effets externes déjà enregistrés.
- **Les activités sont du travail en file exécuté au moins une fois.** Une activité logique peut être réessayée, redistribuée après expiration du bail ou observée à nouveau après la perte d’un worker. Une livraison en double est normale dans un système distribué.
- **L’identité d’une activité est durable.** `activity_execution_id` identifie une activité logique à travers les nouvelles tentatives et la redistribution. `activity_attempt_id` identifie une tentative particulière. Utilisez le premier comme clé d’idempotence distante par défaut. Utilisez le second seulement si le système distant doit distinguer les tentatives.

Consultez les [garanties d’exécution et l’idempotence](./constraints/execution-guarantees.md), le [modèle d’exécution des activités](./features/activity-execution-model.md) et les [échecs et la reprise](./failures-and-recovery.md) pour le contrat v2 complet.

## Files {#queues}

Les jobs en file s’exécutent plus tard en arrière-plan. Laravel prend en charge les files Amazon SQS, Redis et celles fondées sur une base relationnelle. Workflows et activités sont tous deux des jobs en file, avec des comportements différents. Un workflow est distribué plusieurs fois en fonctionnement normal : il exécute son code, distribue une ou plusieurs activités, puis se termine en attendant leur résultat. Une activité est une tâche exécutée au moins une fois. Elle réussit généralement dès la première tentative, mais une nouvelle tentative, l’expiration du bail ou la perte du worker peut faire redistribuer la même activité logique.

## Exemple {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## Diagramme de séquence {#sequence-diagram}

Le diagramme montre la progression du workflow à travers des activités en série et en parallèle.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="Diagramme de séquence d’un workflow"
/>

1. Le workflow est distribué comme un job en file.
2. La première activité, `TestActivity`, est distribuée, puis le job de workflow se termine. L’activité enregistre son résultat en base et redistribue le workflow.
3. Le workflow relit la suite d’événements en base pour reconstruire son état. Il n’est pas un processus permanent : il se termine pendant l’exécution des activités et est redistribué après leur fin.
4. Après la relecture, il distribue `TestOtherActivity`. Cette activité enregistre son résultat et redistribue le workflow.
5. Le workflow relit de nouveau l’historique pour reconstruire son état.
6. Il distribue `TestParallelActivity` et `TestParallelOtherActivity` en parallèle. Les deux activités enregistrent leur résultat et rendent la main au workflow.
7. Une dernière relecture reconstruit l’état et termine l’exécution du workflow.

## Déterminisme {#determinism}

L’historique est relu à chaque réveil. Avec le même historique, le workflow doit produire les mêmes commandes. Les [contraintes](./constraints/overview.md) expliquent les règles et les fonctions disponibles, dont `Workflow::now()` sur `Workflow\V2\Workflow`, `sideEffect()` et `getVersion()`, pour traiter les sources de non-déterminisme.
