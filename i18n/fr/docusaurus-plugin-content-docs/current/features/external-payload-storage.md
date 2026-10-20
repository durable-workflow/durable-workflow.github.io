---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - stockage externe des données
  - données volumineuses
  - déport des données
  - stockage S3
  - stockage GCS
  - stockage Azure Blob
---

# Stockage externe des charges utiles {#external-payload-storage}

Dans Laravel embarqué, le stockage externe remplace les grandes valeurs encodées de l’historique du workflow par des références vérifiées vers le stockage de l’application. Cette page décrit cette frontière. Les clients et workers en mode service utilisent le [transport du runtime Server](../polyglot/server-api-reference.md#runtime-external-payload-transport) : Server conserve les identifiants du fournisseur et les SDK échangent des identifiants de référence opaques par HTTP authentifié. Un URI fournisseur n’est pas une enveloppe de charge utile valide pour Server.

## Quand l’utiliser {#when-to-use-it}

Utilisez le stockage externe pour les documents, médias, rapports, arguments ou résultats d’activités volumineux qui doivent réellement traverser l’exécution durable. Les petites valeurs restent intégrées et ne nécessitent aucune écriture dans le stockage objet. L’externalisation ne supprime ni les limites de charge utile ou d’événements d’historique, ni la nécessité de borner les objets conservés par une exécution.

## Fonctionnement de l’externalisation {#how-offload-works}

La politique de l’espace de noms de l’application fournit un pilote et un `threshold_bytes` positif. Les charges encodées dont la taille est **supérieure** au seuil sont stockées par le pilote. Les valeurs égales ou inférieures restent intégrées. Une politique désactivée ou sans pilote conserve également les valeurs intégrées.

La référence fournisseur embarquée utilise le schéma `durable-workflow.v2.external-payload-reference.v1` avec `uri`, `sha256`, `size_bytes`, `codec` et éventuellement `expires_at`. Le codec est `avro`. `Workflow\V2\Support\ExternalPayloads` stocke l’enveloppe encodée avec le préfixe `dw-external-payload:v1:`. Lorsque le runtime a besoin de la valeur, il récupère les octets encodés et vérifie leur taille et SHA-256 avant décodage. Des octets absents ou modifiés provoquent un échec, jamais une valeur `null` de remplacement.

Cette référence diffère du schéma Server `durable-workflow.v2.runtime-external-payload-reference.v1`. Consultez le [tableau de prise en charge par mode](../polyglot/server-api-reference.md#external-payload-support-by-mode) avant de déplacer un utilitaire de pilote ou une enveloppe stockée entre modes de déploiement.

## Frontière de confiance du décodage {#decode-trust-boundary}

Stockage et décodage ont des frontières de confiance distinctes. Un fournisseur peut conserver des octets encodés, tandis qu’un worker, un serveur de codecs ou un outil d’export qui les décode peut voir les valeurs de l’application. Définissez où s’exécutent les décodeurs, les clés accessibles et le masquage des aperçus et journaux. Les empreintes, tailles et noms de codecs sont des métadonnées d’intégrité, pas une garantie de chiffrement de bout en bout. Les URI fournisseur peuvent aussi contenir des noms d’objets sensibles.

## Choix des pilotes {#driver-choices}

| Pilote | Schéma URI | Exigence en mode embarqué |
| --- | --- | --- |
| Système de fichiers local | `file://` | Tout processus embarqué résolvant une référence doit accéder à la même racine de stockage. |
| Stockage compatible S3 | `s3://` | Pilote ou disque de l’application avec le bucket, le préfixe et les identifiants appropriés. |
| Google Cloud Storage | `gs://` | Pilote ou disque de l’application et client fournisseur. |
| Azure Blob Storage | `azure://` | Pilote ou disque de l’application et client fournisseur. |

Server peut utiliser un stockage local pendant que les workers SDK distants récupèrent les données par HTTP. Ces workers n’ont besoin ni d’un système de fichiers partagé ni d’identifiants fournisseur.

## Configurer un espace de noms {#configuring-a-namespace}

Les applications embarquées configurent leur politique de stockage et `ExternalPayloadStorageDriver` dans leur runtime Laravel. Conservez les identifiants dans la configuration de l’application, pas dans les arguments du workflow, l’historique ou les URI de référence. Utilisez une politique cohérente dans les processus d’exécution et de relecture.

Pour Server auto-hébergé, l’[API administrative de stockage](../polyglot/server-api-reference.md#namespace-and-storage) et les [commandes CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) configurent la politique de Server. Elles ne donnent pas aux workers SDK un accès direct au fournisseur.

### Avec la CLI {#with-the-cli}

`dw namespace:set-storage-driver` configure un espace de noms Server, pas le conteneur Laravel d’une application embarquée indépendante. Les options obligatoires de disque, bucket et préfixe figurent dans la référence CLI.

### Avec l’API Server {#with-the-server-api}

`PUT /api/namespaces/{namespace}/external-storage` est une opération administrative de politique. Les clients SDK ordinaires découvrent le transport résultant par `GET /api/cluster/info` ; ils ne copient pas sa configuration fournisseur dans les workers.

## Vérifier la politique {#verifying-the-policy}

Testez une valeur supérieure au seuil avec le pilote réellement configuré et les processus de relecture. Après récupération, vérifiez la longueur exacte des octets encodés et SHA-256. Pour Server, `dw storage:test --namespace=billing --json` vérifie le chemin configuré. Un diagnostic de stockage ne prouve ni l’exécution de workflows avec chaque SDK, ni la restauration des sauvegardes, ni tous les adaptateurs fournisseurs.

## Choisir un seuil {#picking-a-threshold}

Gardez une marge sous les limites ordinaires de requête et de charge utile. Le seuil porte sur les **octets encodés**, pas sur la taille du fichier d’origine ou du JSON métier. Un seuil très bas ajoute des requêtes de stockage et des références conservées pour de petites valeurs. Le transport du runtime peut aussi externaliser des valeurs supplémentaires pour faire tenir une requête HTTP agrégée dans sa limite. En mode service, utilisez les limites découvertes de Server, sans traiter le seuil embarqué comme une limite du protocole.

## Relecture, rétention et nettoyage {#replay-retention-and-cleanup}

- **Intégrité de la relecture.** Une valeur n’est décodée qu’après récupération et vérification des octets référencés. Préservez les objets encore nécessaires à chaque exécution conservée.
- **Cache des lectures vérifiées.** `ExternalPayloadStorage` borne son cache d’octets vérifiés. Le vider ne supprime pas l’objet et ne change pas son propriétaire.
- **Rétention.** Le nettoyage du runtime tient compte des propriétaires conservés et objets partagés. Les défaillances du stockage, blocages de sauvegarde ou références restantes peuvent retarder la suppression. L’exécution de la rétention ne garantit pas l’absence d’objets orphelins.
- **Export de l’historique.** Un export peut conserver les métadonnées des références sans récupérer l’objet. Sa somme de contrôle ou `history_complete` ne prouve ni la présence des octets externes ni la possibilité de rejouer l’archive. Respectez la [frontière de sauvegarde et restauration](../configuration/pruning-workflows.md#export-before-pruning) et vérifiez les objets séparément. Les archives autonomes restent suivies dans [Server #520](https://github.com/durable-workflow/server/issues/520).

## Utilisation depuis le code {#using-it-from-code}

PHP embarqué utilise `Workflow\V2\Support\ExternalPayloadStorage` avec un `ExternalPayloadStorageDriver`. `LocalFilesystemExternalPayloadStorage` gère les racines locales. Les adaptateurs fournisseurs définissent leur configuration d’accès et leurs règles URI. Les applications laissent généralement le runtime appliquer leur politique d’espace de noms plutôt que de construire manuellement les enveloppes stockées.

En mode service, les clients et workers des SDK PHP, Python et Rust téléversent et récupèrent automatiquement les charges lorsque Server annonce un transport disponible. N’envoyez pas d’enveloppe fournisseur `external_storage` à Server et ne supprimez pas les objets gérés par Server avec un utilitaire fournisseur direct. Consultez le [contrat de téléversement et récupération](../polyglot/server-api-reference.md#runtime-external-payload-transport) et la [frontière des utilitaires Python](../polyglot/python.md#external-payload-storage).

## Voir aussi {#see-also}

- [Transmettre des données](../defining-workflows/passing-data.md)
- [Limites structurelles : taille des charges](../constraints/structural-limits.md#payload-size)
- [API Server : transport des charges externes](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [SDK Python : stockage externe des charges](../polyglot/python.md#external-payload-storage)
