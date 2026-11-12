---
title: Compatibilité des bases de données
---

# Compatibilité et qualification des bases de données

Utilisez ce tableau pour choisir la base du mode Laravel embarqué ou du Server autohébergé. Cloud gère sa persistance runtime. Les clients Cloud configurent clients SDK et workers, pas une base du runtime.

Une base de compatibilité déclarée ne prouve pas la qualification de toutes les versions ultérieures. Tests source et artefacts publiés installés constituent des preuves différentes. Cet état lie le code Workflow 2.20.3 et les reçus de publication Server 3.3.2. Il ne change pas la compatibilité et ne définit pas de plage minimale/maximale testée.

| Moteur | Compatibilité déclarée | Qualification source observée | Qualification de l’artefact publié |
| --- | --- | --- | --- |
| MySQL | Embarqué : base 8.0. Server : base 8.0. | Core : 26.10.0 dans les jobs originaux à image flottante. Profils Server : 8.0.46 et 8.4.5. | L’observation Core est liée au code publié. Le smoke de publication et le smoke Compose à index exact de Server 3.3.2 utilisent MySQL 8.0 fixé par digest pour des vérifications de démarrage/santé, pas une qualification complète exécution/capacité/TLS. |
| PostgreSQL | Embarqué : base 13. Server : base 13. | Core : 18.6. Profils Server : 16.15 et 17.11. | L’observation Core est liée au code publié. Le smoke de publication de Server 3.3.2 démarre à froid l’image de chaque architecture sur PostgreSQL 17 fixé par digest, uniquement pour la disponibilité et les informations du cluster, pas une qualification complète exécution/capacité/TLS. |
| MariaDB | Embarqué : base 10.5. Server accepte `mariadb` ; aucune version de base n’est établie ici. | Core : 10.5.29. Profil Server : 10.11.19. | L’observation Core est liée au code publié. Aucun reçu d’endpoint MariaDB lié à l’index Server 3.3.2 n’a été trouvé dans les preuves de publication examinées. |
| SQLite | Les capacités/tests embarqués comprennent SQLite. Server déclare une base 3.35. | Les jobs source Core originaux n’ont pas affiché la version de la bibliothèque SQLite. | L’acceptation du Core 2.20.3 installé a exercé SQLite sans établir de plage de versions. Le smoke de publication de Server 3.3.2 démarre à froid sur SQLite, également sans plage de versions de la bibliothèque. |
| SQL Server | Le Core embarqué publié annonce `sqlsrv`, mais reste non qualifié. La qualification Server n’est pas établie ici. | Aucun job SQL Server retrouvé dans la matrice Core publiée. Le garde backend proposé est un travail source distinct. | Aucune qualification publiée correspondante retrouvée. Ne déduisez pas la prise en charge de l’annonce de capacité embarquée. |

## Interpréter les preuves {#reading-the-evidence}

L’[inventaire Core](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) lie les digests d’image originaux et quatre jobs MySQL, quatre PostgreSQL et un MariaDB au code publié. Ses douze cellules de mise à niveau publiée couvrent Laravel/PHP, pas douze endpoints de base de données. Le [reçu Core installé normalement](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) couvre séparément 67 cas stream/replay/fake sous SQLite. Ni version PHP ni sélecteur d’image flottant ne fournissent une version de base non affichée.

L’[inventaire Server](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) sépare les périmètres des jobs source natifs et PHP historiques. Pour Server 3.3.2, l’[exécution de publication](https://github.com/durable-workflow/server/actions/runs/42591612884) démarre à froid les images amd64 et arm64 sur SQLite, PostgreSQL 17 et MySQL 8.0, vérifie `/api/ready` et les informations du cluster authentifiées, puis arrête chacune avec SIGTERM. Le [smoke Compose à index exact](https://github.com/durable-workflow/server/actions/runs/42602031026) contient quatre cellules architecture/profil sur l’index `sha256:4aeceb42…`. `local` et `production` utilisent MySQL, avec `mysql:8.0` fixé par digest. L’[enregistrement de livraison 3.3.2](https://github.com/durable-workflow/server/issues/325#issuecomment-6739628227) accepte les deux. Ces exécutions démarrent des bases vides. Elles ne mettent pas à niveau une base existante, ne qualifient pas la capacité d’écriture et ne vérifient pas TLS, et leurs logs n’indiquent pas de version corrective exacte du moteur. Le [reçu stable 3.0.5](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) antérieur avait la même forme Compose avec un `mysql:8.0` flottant. Les profils source ne qualifient pas une autre image publiée.

## Cycle fournisseur et moteurs distribués {#vendor-lifecycle-and-distributed-engines}

Pour un nouveau déploiement, privilégiez une branche maintenue après qualification du couple runtime/base exact. La [politique PostgreSQL](https://www.postgresql.org/support/versioning/) marque 13 non pris en charge et termine 14 le 12 novembre 2026. L’[avis Oracle](https://www.mysql.com/support/eol-notice.html) place MySQL 8.0 en Sustaining Support depuis le 21 avril 2026. Le cycle fournisseur n’établit ni ne retire notre qualification d’artefact.

TiDB, Vitess, PlanetScale et autres déploiements distribués compatibles MySQL ne sont pas testés ici. Compatibilité protocolaire ne prouve ni isolation transactionnelle, verrouillage de lignes, visibilité commit/after-commit ni reprises. Validez cette sémantique avec le runtime exact avant adoption. Ce tableau n’étend pas le [cadre opérationnel monorégion](../operator-operating-envelope.md) au multirégion.
