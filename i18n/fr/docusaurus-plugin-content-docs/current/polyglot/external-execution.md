---
sidebar_position: 3
title: Interface d'exécution externe
description: Utiliser le contrat d'exécution externe de niveau activité, indépendant du transport, pour les tâches bornées, les passerelles et les gestionnaires pilotables par IA.
tags:
  - external-execution
  - bridge-adapters
  - worker-protocol
  - AI
keywords:
  - exécution externe
  - adaptateur de passerelle
  - protocole worker d'activité
  - enveloppe de résultat de tâche
---

# Interface d'exécution externe {#external-execution-surface}

Durable Workflow v2 traite l'exécution externe comme une interface produit
définie par son contrat, plutôt que comme une convention shell ou un transport
worker unique. Le serveur autonome publie le contrat global lisible par machine
à `GET /api/cluster/info`, sous
`worker_protocol.external_execution_surface_contract`.

Ce contrat s'appelle `activity_grade_external_execution`. Il concerne les
tâches durables et bornées pouvant s'exécuter hors d'un runtime de workflow complet :

- activités de maintenance des opérateurs ;
- automatisation de plateforme ;
- transmissions aux intégrations ;
- adaptateurs de passerelle qui démarrent, signalent, mettent à jour ou transmettent du travail ;
- gestionnaires fondés sur un script, un démon, HTTP, une file, une fonction serverless ou un agent.

L'usage principal est l'automatisation des opérations, de la plateforme et des
intégrations. Les agents IA et les scripts sont des consommateurs importants
car ils ont besoin de handles stables, mais ils ne redéfinissent pas la
frontière du runtime.

## Frontière {#boundary}

Les gestionnaires externes peuvent :

- exécuter une tâche de workflow ou d'activité sous bail ;
- signaler la progression du bail par heartbeat via le protocole worker ;
- renvoyer une enveloppe structurée de réussite ou d'échec ;
- utiliser un adaptateur de passerelle pour démarrer, signaler, mettre à jour
  ou transmettre du travail borné.

Les gestionnaires externes ne doivent pas :

- interpréter la sémantique de relecture des workflows ;
- prendre en charge le comportement `ContinueAsNew` ;
- appliquer des règles d'ordre des signaux, mises à jour ou requêtes de lecture
  hors du contrat du runtime ;
- modifier directement l'historique des événements ;
- agir comme un runtime de workflow non borné.

Ces règles restent dans le serveur et les véritables runtimes des SDK. Un
transporteur doit seulement déplacer les enveloppes déclarées d'entrée et de
résultat à travers une frontière de transport.

## Points d'articulation publiés du contrat {#published-contract-seams}

Lisez `GET /api/cluster/info` avant de raccorder un transporteur. Les chemins
v2 pertinents sont :

| Chemin | Rôle |
| --- | --- |
| `worker_protocol.external_execution_surface_contract` | Frontières du produit et du runtime, classes de transporteurs valides et état des points d'articulation. |
| `worker_protocol.external_task_input_contract` | Enveloppe d'entrée indépendante du transporteur pour une tâche de workflow ou d'activité sous bail. |
| `worker_protocol.external_task_result_contract` | Enveloppe de réussite, d'échec et de sortie mal formée indépendante du transporteur. |
| `worker_protocol.server_capabilities.external_execution_surface` | Pointeur de capacité compact pour la négociation du plan worker. |

L'interface d'exécution externe nomme aussi les points d'articulation prévus
pour la composition déterministe de l'authentification/des profils/de TLS, les
correspondances de gestionnaires définies par configuration, les adaptateurs
de passerelle bornés, le stockage externe des charges utiles et la sûreté de
l'admission/des déploiements. Considérez-les comme des éléments du contrat,
pas comme des détails privés d'implémentation.

## Exigences des transporteurs {#carrier-requirements}

Un transporteur valide peut être une CLI ou un démon procédant par
interrogation, l'invocation d'un gestionnaire HTTP, un worker adossé à une file
ou une invocation serverless. Le transport peut varier, mais pas ces exigences :

- émettre le schéma d'entrée déclaré ;
- accepter le schéma de résultat déclaré ;
- préserver `task.id`, `task.attempt` et `task.idempotency_key` ;
- convertir les échecs de transport en résultat structuré d'échec ou de sortie mal formée ;
- résoudre de manière déterministe les entrées d'authentification, TLS, de
  profil et d'environnement.

Les codes de sortie, stderr, arrêts brutaux de processus, échecs HTTP, délais de
visibilité de file et erreurs de plateforme serverless sont des faits de
transport. Ils ne deviennent des faits du workflow qu'après leur conversion
par le transporteur en enveloppe de résultat déclarée ou en `malformed_output`.

Le premier transporteur concret de ce contrat est le
[transporteur HTTP invocable](./invocable-carrier.md), publié sous
`worker_protocol.invocable_carrier_contract`. Il ne concerne que les tâches
d'activité, exige HTTPS (HTTP sur boucle locale n'étant autorisé qu'en
développement) et résout l'authentification via la configuration de l'exécuteur
externe. Sa `retry_policy` de transport est distincte de la politique de
nouvelle tentative de l'activité durable, qui reste sous l'autorité du
serveur/runtime une fois le résultat signalé.

## Adaptateurs de passerelle {#bridge-adapters}

Les adaptateurs de passerelle sont des interfaces bornées d'entrée ou de
transmission. Ils peuvent démarrer, signaler, mettre à jour ou transmettre du
travail, mais ne sont pas des runtimes de workflow et ne doivent pas masquer
le comportement de relecture ou de l'historique des événements.

Chaque adaptateur de passerelle doit fournir des résultats machine explicites pour :

- une cible inconnue ;
- un échec d'authentification ;
- une charge utile mal formée ;
- un démarrage en double ;
- un routage non pris en charge ;
- une transmission acceptée ;
- une transmission rejetée.

Conservez la clarté opérationnelle du reste du plan de contrôle : codes d'état
stables, valeurs `reason` nommées et contexte suffisant pour que `dw`, Waterline,
les SDK et les agents expliquent ce qui s'est passé sans analyser du texte libre.

La CLI expose directement l'interface de passerelle webhook :

```bash
dw bridge:webhook stripe \
  --action=start_workflow \
  --idempotency-key=stripe-event-1001 \
  --target='{"workflow_type":"orders.fulfillment","task_queue":"external-workflows","business_key":"order-1001"}' \
  --input='{"order_id":"order-1001"}' \
  --json
```

La réponse JSON suit le même contrat de résultat d'adaptateur de passerelle
publié par `/api/cluster/info`, comprenant `outcome`, `reason`,
`control_plane_outcome`, `idempotency_key` et le résumé `target` expurgé.

## Forme pilotable par un agent {#agent-operable-shape}

L'interface d'exécution externe s'inscrit dans le développement assisté par IA
de v2. Les humains apprennent l'invariant workflow/activité/relecture ; les
outils agissent par des contrats stables :

1. découvrir l'interface d'exécution externe depuis `/api/cluster/info` ;
2. choisir un transporteur satisfaisant aux exigences publiées ;
3. émettre une enveloppe d'entrée de tâche externe ;
4. préserver l'identité et l'idempotence de la tâche ;
5. renvoyer une enveloppe de réussite, d'échec ou de sortie mal formée ;
6. signaler les échecs de passerelle et de transport par des résultats nommés.

L'échafaudage assisté par IA et l'automatisation des opérations restent ainsi
prévisibles : l'outil peut citer le manifeste du protocole, l'enveloppe de
tâche, l'enveloppe de résultat et le résultat de passerelle au lieu de déduire
le comportement d'un seul script de démonstration.
