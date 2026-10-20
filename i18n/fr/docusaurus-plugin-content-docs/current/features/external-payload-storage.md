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

# Stockage externe des données {#external-payload-storage}

Le stockage externe déporte les données volumineuses de workflow vers un
stockage objet interchangeable (S3, GCS, Azure Blob ou système de fichiers local)
et remplace les octets intégrés à l’historique par une petite enveloppe de
référence vérifiable. Utilisez-le lorsque les arguments d’activité ou de workflow
enfant, résultats, signaux ou données de mise à jour sont trop volumineux pour
la ligne de base de données portant l’historique.

Le runtime conserve les données intégrées tant que leur taille encodée reste
sous le seuil de l’espace de noms. Seules celles atteignant le seuil sont
écrites via le pilote configuré et enregistrées dans l’historique comme enveloppe
`durable-workflow.v2.external-payload-reference.v1`. La relecture et l’export
échouent par sécurité si une référence manque, a été modifiée ou sort du préfixe
configuré. Le système ne remplace jamais silencieusement un objet manquant par
une valeur vide.

## Quand l’utiliser {#when-to-use-it}

Préférez le stockage externe si l’application doit légitimement faire passer
plus de quelques centaines de kilo-octets par un workflow :

- Chaînes de traitement de documents et médias transmettant des PDF, images
  ou objets audio d’une activité à la suivante.
- Rapports, exports ou archives produisant un artefact sérialisé volumineux.
- Données de flux de messages venant de systèmes externes qui n’exposent pas
  d’URL d’objet stable directement référençable par le workflow.
- Toute donnée dépassant autrement la
  [limite structurelle `payload_size_bytes`](../constraints/structural-limits.md#payload-size).

Les petites données (champs du plan de contrôle, identifiants, indicateurs de
statut, JSON courant) restent intégrées sans coût supplémentaire. La politique
étant conditionnée au seuil, son activation ne déplace pas les petites données.

## Fonctionnement du déport {#how-offload-works}

Chaque espace de noms a sa propre politique de stockage externe. Lorsque le
runtime encode des données pour leur stockage durable, il compare la longueur
encodée en octets au `threshold_bytes` configuré :

- Taille sous le seuil : les données restent intégrées, comme auparavant.
  L’historique ne change pas.
- Taille égale ou supérieure au seuil : le runtime transmet les octets encodés
  au pilote, reçoit un URI géré par ce pilote et enregistre une référence
  externe dans l’historique. Elle porte l’URI, une empreinte SHA-256, la longueur
  exacte en octets, le codec et une indication facultative `expires_at`.

À la relecture, les workers récupèrent les octets via le même pilote, vérifient
la taille et le SHA-256 de l’objet, puis seulement les transmettent au décodeur.
Une différence de taille ou d’empreinte lève `ExternalPayloadIntegrityException`
(PHP) ou `ExternalPayloadIntegrityError` (Python) et apparaît comme un échec
de relecture, jamais comme des données vides silencieuses.

L’enveloppe de référence est un format réseau stable, identique pour un workflow
PHP, un worker SDK Python ou un appelant HTTP direct. Pour le contrat complet
des champs, consultez
[Enveloppe de référence des données externes](../polyglot/server-api-reference.md#external-payload-reference-envelope).

## Frontière de confiance du décodage {#decode-trust-boundary}

Le stockage et le décodage sont des frontières de confiance distinctes. Un
stockage objet peut contenir des octets encodés ou des références. Un serveur
de codec, décodeur personnalisé, processus worker ou outil d’export qui les
décode peut voir les données applicatives en clair.

Traitez tout serveur de codec comme une frontière de confiance gérée par le
client : décidez où il s’exécute, quel réseau y accède, quelles clés il utilise,
quels journaux d’audit il émet et comment masquer les aperçus décodés avant leur
affichage aux opérateurs. Durable Workflow enregistre noms de codecs, URI de
référence, empreintes, tailles, empreintes de schémas et aperçus bornés. Ces
faits ne constituent pas un chiffrement de bout en bout.

## Choix du pilote {#driver-choices}

| Pilote | Schéma d’URI | Usage courant |
| --- | --- | --- |
| `local` | `file://` | Développement local, CI et déploiements sur un seul nœud où serveur et workers partagent un système de fichiers. Inadapté aux workers sur d’autres hôtes. |
| `s3` | `s3://` | Amazon S3 et stockages compatibles S3 (MinIO, Cloudflare R2, etc.) via un disque de système de fichiers côté serveur. |
| `gcs` | `gs://` | Google Cloud Storage via un disque de système de fichiers côté serveur. |
| `azure` | `azure://` | Azure Blob Storage via un disque de système de fichiers côté serveur. |

Les pilotes de stockage objet configurent les identifiants du bucket ou
conteneur via un disque nommé côté serveur. Les secrets restent donc dans la
configuration serveur plutôt que dans la politique de l’espace de noms.

## Configurer un espace de noms {#configuring-a-namespace}

Configurez la politique avec la [CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
ou l’[API HTTP du serveur](../polyglot/server-api-reference.md#namespace-and-storage).
Toutes deux écrivent la même enveloppe `external_payload_storage` sur
l’enregistrement d’espace de noms.

### Avec la CLI {#with-the-cli}

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### Avec l’API serveur {#with-the-server-api}

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

La description renvoyée par `GET /api/namespaces/{name}` ou
`dw namespace:describe` porte l’enveloppe `external_payload_storage` résolue.
Les opérateurs et automatisations peuvent ainsi vérifier la politique active
sans réémettre d’écriture.

## Vérifier la politique {#verifying-the-policy}

Utilisez le diagnostic aller-retour pour prouver que la politique peut écrire
et lire des octets avec les identifiants de l’espace de noms avant d’y ouvrir
le trafic de workflows :

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

Le diagnostic écrit de petites données intégrées et des données dépassant le
seuil, récupère les deux, vérifie taille et SHA-256 puis renvoie les objets de
résultat `small_payload` et `large_payload` lisibles par machine. La réussite
du cas volumineux prouve que le pilote produit une enveloppe valide
`durable-workflow.v2.external-payload-reference.v1` de bout en bout. Un échec
signale un problème de politique de stockage. N’activez pas le trafic dans un
espace dont la politique ne réussit pas cet aller-retour.

## Choisir un seuil {#picking-a-threshold}

Par défaut, les données restent intégrées tant qu’elles n’atteignent pas
`threshold_bytes`. Points de départ utiles :

- Placez le seuil au point où les données intégrées commencent à créer une
  pression opérationnelle, généralement entre 256 Kio et 2 Mio d’octets encodés.
- Gardez une marge confortable sous la limite structurelle
  [`payload_size_bytes`](../constraints/structural-limits.md#payload-size)
  de l’espace de noms pour que le plafond s’applique à l’enveloppe de référence,
  pas aux octets eux-mêmes.
- Définissez un seul seuil par espace de noms. Choisissez-le selon l’activité
  ou le workflow produisant le plus d’octets par exécution, plutôt que selon
  les données médianes.

Un seuil très bas n’apporte aucun avantage : les petites données font un
aller-retour en base plus vite que via le stockage externe, et l’enveloppe
elle-même consomme un peu d’espace dans l’historique.

## Relecture, rétention et nettoyage {#replay-retention-and-cleanup}

- **Intégrité de relecture.** Chaque récupération vérifie l’objet contre les
  `size_bytes` et `sha256` de la référence. Un objet modifié ou manquant lève une
  exception d’intégrité au lieu de substituer silencieusement une autre valeur.
- **Cache de récupérations vérifiées.** Les workers mettent les octets vérifiés
  en cache par `(uri, sha256, size, codec)`, avec limites d’entrées et d’octets.
  Les lectures répétées d’une même exécution évitent de récupérer à nouveau
  l’objet sans affaiblir la vérification au premier chargement.
- **Rétention.** Quand le passage de rétention supprime une exécution, il supprime
  aussi les objets externes référencés par son historique. Les objets orphelins
  ne s’accumulent pas tant que la rétention fonctionne.
- **Export d’historique.** L’export conserve l’enveloppe de référence. Les
  consommateurs ayant besoin des octets doivent les récupérer via le même pilote
  et les vérifier contre l’enveloppe avant décodage. L’export n’intègre pas les
  octets externes.

## Utilisation depuis le code {#using-it-from-code}

La plupart des applications n’appellent jamais directement l’API de stockage :
le runtime déporte automatiquement selon la politique et le SDK décode les
références à la relecture. Les applications créant ou consommant des enveloppes
hors runtime, comme un gestionnaire de passerelle multilangage ou un test
générant des données volumineuses, utilisent les fonctions du SDK.

- **PHP (package workflow).** La classe
  `Workflow\V2\Support\ExternalPayloadStorage` stocke et récupère les octets
  via tout pilote implémentant
  `Workflow\V2\Contracts\ExternalPayloadStorageDriver`.
  `LocalFilesystemExternalPayloadStorage` gère les URI `file://`. Le serveur
  autonome fournit un pilote de disque qui prend en charge les pilotes de
  politique `s3`, `gcs` et `azure` via un disque Laravel nommé.
- **SDK Python.** Consultez
  [Stockage externe des données](../polyglot/python.md#external-payload-storage)
  pour `ExternalPayloadReference`, `ExternalPayloadCache`,
  `store_external_payload()`, `fetch_external_payload()` et les adaptateurs
  `LocalFilesystemExternalStorage`, `S3ExternalStorage`,
  `GCSExternalStorage` et `AzureBlobExternalStorage`. Les clients SDK cloud
  restent à la charge de l’application. Le SDK n’ajoute pas boto3,
  google-cloud-storage ou azure-storage-blob aux dépendances d’exécution.
- **HTTP direct.** Les appelants encodant manuellement peuvent stocker les octets
  via le pilote puis soumettre l’enveloppe de référence comme champ de données
  de la requête. L’enveloppe du protocole worker (`{codec, blob}`) porte toujours
  les références des arguments et résultats d’activité, signaux et mises à jour.

## Voir aussi {#see-also}

- [Transmission de données](../defining-workflows/passing-data.md) pour le
  contrat par défaut des données intégrées.
- [Limites structurelles : taille des données](../constraints/structural-limits.md#payload-size)
  pour le plafond du moteur sous lequel le stockage externe permet de travailler.
- [Référence API serveur : espaces de noms et stockage](../polyglot/server-api-reference.md#namespace-and-storage)
  pour le contrat HTTP complet et les champs de l’enveloppe de référence.
- [Référence CLI : commandes d’espaces de noms et d’attributs de recherche](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
  pour utiliser `dw namespace:set-storage-driver` et `dw storage:test`.
- [SDK Python : stockage externe des données](../polyglot/python.md#external-payload-storage)
  pour les pilotes, fonctions et conseils de cache de relecture Python.
