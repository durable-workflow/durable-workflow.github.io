---
title: Flux de workflow
description: Produire et consommer des flux de sortie durables propres à une exécution avec les SDK PHP, Python et Rust.
tags:
  - service-mode
  - workflow-streams
  - php
  - python
  - rust
---

# Flux de workflow {#workflow-streams}

Les Workflow Streams sont des journaux de sortie nommés, propres à une
exécution, gérés par Durable Workflow Server. PHP, Python et Rust exposent des
opérations typées pour lister, décrire, s'abonner, ajouter, fermer et signaler
une erreur, sans que les applications aient à composer des requêtes HTTP.
Le runtime annonce `durable-workflow.v2.workflow-streams.contract@1`. La
[matrice des SDK lisible par machine](/workflow-stream-capabilities.json)
consigne la prise en charge exacte de chaque SDK.

Chaque flux attribue des offsets strictement croissants à partir de 0. Le
`next_offset` d'une page est le prochain offset inclusif à demander. La
livraison aux consommateurs a lieu au moins une fois : terminez les effets
idempotents de la page, puis enregistrez durablement `next_offset` comme point
de reprise. Un arrêt brutal avant cet enregistrement peut entraîner une
nouvelle livraison des éléments.

## Émettre depuis le code du workflow {#emit-from-workflow-code}

Les trois SDK émettent à travers la même frontière de commande déterministe :
`record_side_effect.workflow_stream`. Chaque SDK déduit la clé d'idempotence
de l'élément de l'identité durable de commande de workflow de la tâche, du
numéro ordinal de la commande de flux et de l'index dans le lot. Server valide
ensemble la mutation du flux et l'effet enregistré. La relecture consomme cet
effet et ne peut pas créer un autre élément durable pour le même ajout logique.

PHP :

```php
use DurableWorkflow\Model\WorkflowStreamAppendItem;

$context->appendWorkflowStream('progress', [
    new WorkflowStreamAppendItem(['percent' => 50]),
]);
$context->closeWorkflowStream('progress');
```

Python :

```python
from durable_workflow import WorkflowStreamAppendItem

yield ctx.append_workflow_stream("progress", [
    WorkflowStreamAppendItem(payload={"percent": 50}),
])
yield ctx.close_workflow_stream("progress")
```

Rust :

```rust
let item = WorkflowStreamAppendItem::new(serde_json::json!({"percent": 50}))?;
ctx.append_workflow_stream("progress", &[item], None)?;
ctx.close_workflow_stream("progress", None)?;
```

Les fonctions de workflow servent à l'écriture déterministe. Le code extérieur
à un workflow peut utiliser l'opération typée `append` de chaque client et
fournir sa propre clé d'idempotence stable.

## S'abonner et reprendre {#subscribe-and-resume}

L'abonnement lit une page bornée et peut attendre de nouveaux éléments pendant
60 secondes au maximum. PHP accepte un callback d'annulation entre les
interrogations bornées. Python accepte l'annulation normale d'une tâche ou un
`asyncio.Event` qui annule l'interrogation en cours. Abandonner la future
d'abonnement Rust annule sa requête.

| SDK | Opération de page | Valeur de reprise | Itération typée |
| --- | --- | --- | --- |
| PHP | `subscribeWorkflowStream(...)` | `WorkflowStreamPage::$nextOffset` | `iterateWorkflowStream(...)` |
| Python | `await subscribe_workflow_stream(...)` | `WorkflowStreamPage.next_offset` | `iter_workflow_stream(...)` |
| Rust | `subscribe_workflow_stream(...).await` | `WorkflowStreamPage::next_offset` | Répéter la future de page bornée jusqu'à `terminal`. |

Les états du cycle de vie sont `open`, `closed` et `errored`. La description
typée expose également `last_offset`, `total_items`, `pending_items` et
`error_reason`. Tout ajout à un flux terminal est rejeté. Quand la limite
configurée d'éléments en attente est atteinte, l'ajout renvoie `stream_full`.
Les producteurs doivent ralentir ou attendre que les consommateurs vident le flux.

## Références aux charges utiles externes {#external-payload-references}

Les valeurs en ligne utilisent l'enveloppe Avro Value commune. Les références
externes suivent le contrat de stockage existant de chaque SDK au lieu
d'introduire un nouveau transport :

| SDK | Comportement des références externes |
| --- | --- |
| PHP | Ajoute et renvoie un `payload_reference` opaque ; le téléversement et la récupération depuis le stockage restent à la charge de l'application. |
| Python | Utilise le pilote de stockage externe configuré pour téléverser, vérifier l'intégrité, mettre en cache, récupérer et décoder une enveloppe Avro externe. Sans pilote, les appelants peuvent ajouter ou inspecter un `payload_reference` opaque. |
| Rust | Ajoute et renvoie une référence opaque et ses métadonnées. Le SDK Rust actuel ne revendique aucun pilote de stockage externe. |

## Workflow Streams et MessageStream embarqué {#workflow-streams-and-embedded-messagestream}

Les noms concordent lorsque le comportement concorde, mais les modèles ne sont
pas interchangeables.

| Concept | Workflow Stream en mode service | MessageStream Laravel embarqué |
| --- | --- | --- |
| Adresse | Exécution de workflow + nom du flux | Instance/exécution de workflow + clé du flux |
| Direction | Sortie de workflow uniquement | Boîtes de réception et d'envoi du workflow |
| Premier offset | 0 | 1 |
| Livraison | Au moins une fois ; point de reprise géré par le consommateur | Au moins une fois ; curseur de message géré par le moteur |
| Poursuite par une nouvelle exécution | Aucun transfert de curseur du flux | Le curseur de réception est transféré à la nouvelle exécution |
| Messages entrants du workflow | Non fournis ; utiliser les signaux ou mises à jour | Fournis par `inbox()->receive()` |

Waterline utilise une table normalisée commune aux deux modes et affiche le
mode, le cycle de vie, les offsets de tête/curseur, le nombre en attente, la
direction et l'erreur. Il ne présente pas les flux de sortie du mode service
comme une boîte de réception de workflow.

## Qualification {#qualification}

Le [manifeste public des scénarios Workflow Stream](/platform-conformance/workflow-stream-runtime-scenarios.json)
exige des exécutions sur artefacts publiés couvrant un producteur PHP avec des
consommateurs Python et Rust, le redémarrage du worker producteur, la
reconnexion du consommateur, le cycle de vie/la contre-pression/l'annulation
et les références aux charges utiles externes. Un résultat de publication doit
consigner chaque scénario requis. Les seuls tests unitaires des sources ne
constituent pas une preuve de conformité.
