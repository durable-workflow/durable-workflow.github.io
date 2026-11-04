---
title: Compatibilité des bases de données
---

# Compatibilité et qualification des bases de données

Utilisez ce tableau pour choisir la base du mode Laravel embarqué ou du Server autohébergé. Cloud gère sa persistance runtime. Les clients Cloud configurent clients SDK et workers, pas une base du runtime.

Une base de compatibilité déclarée ne prouve pas la qualification de toutes les versions ultérieures. Tests source et artefacts publiés installés constituent des preuves différentes. Cet état lie le code Workflow 2.20.3 et les reçus Server 3.0.5. Il ne change pas la compatibilité et ne définit pas de plage minimale/maximale testée.

| Moteur | Compatibilité déclarée | Qualification source observée | Qualification de l’artefact publié |
| --- | --- | --- | --- |
| MySQL | Embarqué : base 8.0. Server : base 8.0. | Core : 26.10.0 dans les jobs originaux à image flottante. Profils Server : 8.0.46 et 8.4.5. | L’observation Core est liée au code publié. Compose Server 3.0.5 utilise `mysql:8.0` pour un smoke schéma/santé, pas une qualification complète exécution/capacité/TLS. |
| PostgreSQL | Embarqué : base 13. Server : base 13. | Core : 18.6. Profils Server : 16.15 et 17.11. | L’observation Core est liée au code publié. Aucun reçu d’endpoint PostgreSQL lié à l’index Server 3.0.5 n’a été trouvé dans l’inventaire examiné. |
| MariaDB | Embarqué : base 10.5. Server accepte `mariadb` ; aucune version de base n’est établie ici. | Core : 10.5.29. Profil Server : 10.11.19. | L’observation Core est liée au code publié. Aucun reçu d’endpoint MariaDB lié à l’index Server 3.0.5 n’a été trouvé dans l’inventaire examiné. |
| SQLite | Les capacités/tests embarqués comprennent SQLite. Server déclare une base 3.35. | Les jobs source Core originaux n’ont pas affiché la version de la bibliothèque SQLite. | L’acceptation du Core 2.20.3 installé a exercé SQLite sans établir de plage de versions. Le corpus du candidat Server 3.1.0 figé reste distinct du stable 3.0.5. |
| SQL Server | Le Core embarqué publié annonce `sqlsrv`, mais reste non qualifié. La qualification Server n’est pas établie ici. | Aucun job SQL Server retrouvé dans la matrice Core publiée. Le garde backend proposé est un travail source distinct. | Aucune qualification publiée correspondante retrouvée. Ne déduisez pas la prise en charge de l’annonce de capacité embarquée. |

## Interpréter les preuves {#reading-the-evidence}

L’[inventaire Core](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) lie les digests d’image originaux et quatre jobs MySQL, quatre PostgreSQL et un MariaDB au code publié. Ses douze cellules de mise à niveau publiée couvrent Laravel/PHP, pas douze endpoints de base de données. Le [reçu Core installé normalement](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) couvre séparément 67 cas stream/replay/fake sous SQLite. Ni version PHP ni sélecteur d’image flottant ne fournissent une version de base non affichée.

L’[inventaire Server](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) sépare les périmètres des jobs source natifs et PHP historiques. Le [reçu stable 3.0.5](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) contient quatre cellules smoke Compose architecture/profil. `local` et `production` utilisent MySQL. Les logs examinés ne récupèrent pas de version/digest exact du compagnon, de qualification de capacité d’écriture ou de TLS vérifié. Profils source et candidat figé ne qualifient pas une autre image publiée.

## Cycle fournisseur et moteurs distribués {#vendor-lifecycle-and-distributed-engines}

Pour un nouveau déploiement, privilégiez une branche maintenue après qualification du couple runtime/base exact. La [politique PostgreSQL](https://www.postgresql.org/support/versioning/) marque 13 non pris en charge et termine 14 le 12 novembre 2026. L’[avis Oracle](https://www.mysql.com/support/eol-notice.html) place MySQL 8.0 en Sustaining Support depuis le 21 avril 2026. Le cycle fournisseur n’établit ni ne retire notre qualification d’artefact.

TiDB, Vitess, PlanetScale et autres déploiements distribués compatibles MySQL ne sont pas testés ici. Compatibilité protocolaire ne prouve ni isolation transactionnelle, verrouillage de lignes, visibilité commit/after-commit ni reprises. Validez cette sémantique avec le runtime exact avant adoption. Ce tableau n’étend pas le [cadre opérationnel monorégion](../operator-operating-envelope.md) au multirégion.
