---
displayed_sidebar: tutorialSidebar
title: Langage de requêtes de visibilité
description: Filtrer les exécutions du Server par état, temps, identité et attributs de recherche typés, avec exemples HTTP et pagination.
---

# Langage de requêtes de visibilité

Utilisez `GET /api/workflows?query=...` pour trouver des exécutions dans un espace de noms du Server. Cette référence décrit le Server natif publié sélectionné dans le [manifeste de compatibilité](../compatibility.md#last-qualified-reproducible-tuple), actuellement `%%artifact.serverVersion%%`. La liste lit les données de visibilité stockées. Elle ne lance pas le gestionnaire de requête de lecture nommé du workflow.

La demande nécessite un jeton bearer avec le rôle opérateur ou administrateur, `X-Namespace` et `X-Durable-Workflow-Control-Plane-Version: 2`. Voir [les autorisations des espaces de noms](./namespace-auth-workers.md). Les résultats incluent les exécutions correspondantes, y compris les anciennes exécutions d’une instance et les enfants dont les attributs correspondent. Aucun prédicat intégré ne sélectionne uniquement les racines.

## Envoyer une demande {#make-a-request}

Définissez `DURABLE_WORKFLOW_SERVER_URL` avec l’URL de base du Server et `DURABLE_WORKFLOW_AUTH_TOKEN` avec un jeton opérateur ou administrateur. Cet exemple nécessite Bash, curl et jq. Remplacez l’intervalle UTC fixe par la période à inspecter.

```bash
query='Status = failed AND CloseTime >= "2026-11-14T00:00:00Z" AND CloseTime < "2026-11-15T00:00:00Z"'
page=$(curl --fail-with-body --silent --show-error --get \
  "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H 'X-Namespace: default' \
  -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
  --data-urlencode "query=$query" \
  --data-urlencode 'page_size=50')
printf '%s\n' "$page" | jq '{workflow_count, workflows, next_page_token}'
```

`Status = failed` sélectionne un groupe qui inclut aussi les exécutions annulées et terminées de force. Utilisez `Status = cancelled` ou `Status = terminated` pour ces états exacts. `running` inclut pending, running et waiting. `completed` sélectionne les exécutions achevées. Les valeurs d’état sont insensibles à la casse.

Utilisez `--data-urlencode` pour la requête et le jeton de page. Les guillemets du shell, les échappements du langage et l’encodage URL sont des étapes distinctes. Une réponse réussie avec `workflows: []` indique qu’aucune exécution ne correspond à cette demande.

## Champs {#fields}

Les noms de champs sont sensibles à la casse. Les noms intégrés priment sur les attributs personnalisés.

| Champ | Valeur | Opérateurs |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | Type d’exécution, ID d’instance, ID d’exécution ou file de tâches | `=`, `!=`, `IN`, `IN` nié |
| `Status`, `ExecutionStatus` | État ou groupe d’états décrit ci-dessus | `=`, `!=` |
| `StartTime`, `ExecutionTime` | Instant de début de l’exécution. Ces noms sont des alias. | Comparaisons scalaires, `IN`, `IN` nié |
| `CloseTime` | Instant de clôture de l’exécution | Comparaisons scalaires, `IN`, `IN` nié |
| `BuildId`, `BuildIds` | Alias de la valeur de compatibilité de l’exécution, pas une recherche dans la flotte de workers | Opérateurs de keyword, soumis au refus natif ci-dessous |

Les comparaisons scalaires sont `=`, `!=`, `<`, `<=`, `>` et `>=`. Un instant de début ou de clôture absent ne satisfait jamais une comparaison, même niée. La liste native refuse une exécution qu’elle devrait renvoyer avec une compatibilité non nulle par HTTP `409` / `unqualified_build_visibility`. L’analyse d’un prédicat de build n’établit pas une qualification de la liste par build.

Les autres champs doivent être des attributs de recherche enregistrés dans cet espace de noms. Consultez les définitions avec `GET /api/search-attributes` et enregistrez un attribut avec `POST /api/search-attributes` et un corps JSON comme `{"name":"OrderTotal","type":"double"}`. L’enregistrement exige un jeton administrateur. Un type stocké inféré ne rend pas une clé non enregistrée interrogeable. Supprimer la définition conserve les valeurs mais invalide les requêtes sur cette clé.

Les identifiants commencent par une lettre ASCII, puis contiennent des lettres ASCII, chiffres ou `_`. Respectez exactement le nom enregistré. Memos, labels de visibilité, clés métier et noms de relations parent/racine ne sont pas des champs structurés intégrés supplémentaires. La recherche simple peut toujours trouver une clé métier comme décrit plus bas.

## Types et comparaisons {#types-and-comparisons}

| Type enregistré | Littéraux et comportement de comparaison |
| --- | --- |
| `keyword` | Égalité ou inégalité du texte entier, `IN` et `IN` nié. Aucun ordre. |
| `string`, `text` | Comparaison du texte entier avec les mêmes opérateurs que `keyword`. Aucun opérateur de sous-chaîne, de plein texte ou `LIKE`. |
| `int` | Entier sans guillemets, comme `42` ou `-3`. Comparaisons scalaires, `IN` et `IN` nié. Un nombre entre guillemets ou décimal n’est pas un littéral entier. |
| `double` | Entier ou décimal sans guillemets, y compris la notation exponentielle telle que `1.5e3`. Comparaisons scalaires, `IN` et `IN` nié. |
| `bool` | `true` ou `false` sans guillemets, insensibles à la casse. Comparaisons scalaires, `IN` et `IN` nié ; `false` précède `true`. `1` et `"true"` ne sont pas des littéraux booléens. |
| `datetime` | Date/heure entre guillemets. Comparaisons scalaires, `IN` et `IN` nié comparent les instants. Utilisez un horodatage UTC ou à décalage explicite, tel que `"2026-11-14T12:34:56.123456Z"`. |
| `keyword_list` | `Tags = "urgent"` teste l’appartenance. `Tags IN ("urgent", "review")` correspond à au moins un élément cité. Inégalité, ordre et appartenance niée sont refusés. |

Une exécution sans l’attribut interrogé ne satisfait jamais ce prédicat, même avec `!=` ou `IN` nié. Il n’existe pas de prédicat d’existence ni `IS NULL`. Une valeur conservée sous un ancien type enregistré différent n’est pas convertie automatiquement vers le nouveau type.

Les comparaisons de keyword, texte et champs textuels intégrés suivent les règles d’égalité de la base. Le schéma MySQL/MariaDB publié utilise `utf8mb4_unicode_ci`, qui ignore la casse, les accents et les espaces finaux. SQLite et la comparaison native PostgreSQL sont exacts. L’appartenance aux listes de keywords est exacte. Ne supposez pas des résultats textuels identiques sur ces backends.

Les dates acceptent les dates ISO et les horodatages, avec des fractions conservées à la microseconde. Une date seule signifie minuit UTC ; sans fuseau, UTC s’applique. Utilisez des horodatages explicites pour les requêtes portables. Les dates relatives comme `tomorrow` et les fuseaux nommés comme `Europe/Paris` ne sont pas acceptés. Calculez l’intervalle glissant dans l’appelant et envoyez des bornes fixes.

## Syntaxe, priorité et échappement {#syntax-and-escaping}

- Écrivez les comparaisons sous la forme `Field operator literal`. Séparez les prédicats avec `AND` ou `OR`. Les mots-clés sont insensibles à la casse.
- `NOT` s’applique au prédicat suivant avant `AND` ; `AND` est prioritaire sur `OR`. `A = 1 OR B = 2 AND C = 3` signifie `A = 1 OR (B = 2 AND C = 3)`.
- Les parenthèses délimitent une liste `IN` non vide séparée par des virgules. Elles ne regroupent pas les expressions booléennes. Répétez si nécessaire les prédicats dans les branches `OR`.
- L’appartenance niée s’écrit **`NOT Region IN ("eu", "us")`**. La forme SQL `Region NOT IN (...)` n’est pas prise en charge. `Status IN (...)` non plus ; utilisez `Status = running OR Status = completed`.
- Utilisez des guillemets simples ou doubles pour les chaînes. Échappez le guillemet choisi et une barre oblique inverse littérale avec `\`. Exemples : `Customer = 'O\'Brien'` et `Path = "C:\\orders"`. Le parseur décode aussi les échappements C tels que `\n`, `\t` et `\r` ; `\uXXXX` de JSON n’est pas un échappement Unicode ici. Écrivez directement les caractères Unicode.
- Les littéraux textuels sans guillemets acceptent les lettres ASCII, chiffres, `_`, `.`, `:` et `-`. Préférez les guillemets pour éviter une inférence accidentelle de booléens ou de nombres. Aucune clause SQL `SELECT`, `ORDER BY` ou `LIMIT` n’est disponible.

Dans une expression, un champ booléen enregistré seul peut signifier `Flag = true`, et `NOT Flag` signifie `Flag = false`. Un `Flag` isolé est en revanche du texte de recherche simple. Les comparaisons explicites évitent cette ambiguïté.

Le Server reconnaît une expression par une syntaxe de comparaison, `IN (...)` ou un prédicat `NOT` initial. Le reste est une recherche de sous-chaîne dans l’ID de workflow et la clé métier. Par exemple, `query=order-1001` est une recherche simple. Un texte ressemblant à du SQL non pris en charge peut donc être traité comme recherche simple au lieu de produire une erreur de syntaxe. Utilisez la grammaire documentée et inspectez les erreurs de `query` lorsqu’une expression reconnue est invalide.

## Exemples de requêtes {#query-examples}

Passez une expression ci-dessous comme valeur de `query` dans la demande curl précédente. Les exemples personnalisés supposent que `OrderTotal: double`, `Attempt: int`, `Region: keyword`, `Tags: keyword_list`, `Approved: bool` et `DueAt: datetime` sont enregistrés et renseignés dans l’espace de noms choisi.

| Tâche | Requête |
| --- | --- |
| Commandes au-dessus d’un seuil numérique | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| Tentatives dans un intervalle inclusif | `Attempt >= 2 AND Attempt <= 5` |
| Une des deux régions | `Region IN ("eu", "us")` |
| Autres régions renseignées | `NOT Region IN ("eu", "us")` |
| Une des étiquettes citées | `Tags IN ("urgent", "review")` |
| False explicite | `Approved = false` |
| Une fenêtre temporelle | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| Deux files sous le même type | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## Pagination et limites {#pagination-and-limits}

| Paramètre | Comportement |
| --- | --- |
| `workflow_type` | Filtre facultatif de type exact, combiné avec `query` et `status` par `AND`. |
| `status` | Filtre facultatif. Préférez les groupes canoniques `running`, `completed` ou `failed`. Le point de terminaison actuel accepte aussi `cancelled` et `terminated` exacts ; `pending` et `waiting` ne sont pas acceptés ici. |
| `page_size` | Entier de `1` à `200`, par défaut `50`. Utilisez ce paramètre, pas `limit`. |
| `next_page_token` | Copiez le jeton de la réponse précédente sans le décoder ni en construire un. Arrêtez-vous lorsqu’il est null. |

`workflow_count` compte les éléments de cette page, pas toutes les exécutions correspondantes. Les résultats sont triés par date de début/tri décroissante, puis ID d’exécution décroissant. La pagination lit des données vivantes avec un décalage. Conservez espace de noms, requête, filtres et taille de page. Des insertions, clôtures ou mises à jour d’attributs entre demandes peuvent déplacer les résultats et créer doublons ou omissions ; ce n’est pas un export figé. Un jeton invalide repart actuellement de la première page au lieu de produire une erreur.

Récupérez la page suivante du premier exemple, si elle existe :

```bash
next=$(printf '%s\n' "$page" | jq -r '.next_page_token // empty')
if [ -n "$next" ]; then
  curl --fail-with-body --silent --show-error --get \
    "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
    -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
    -H 'X-Namespace: default' \
    -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
    --data-urlencode "query=$query" \
    --data-urlencode 'page_size=50' \
    --data-urlencode "next_page_token=$next" | jq .
fi
```

La taille de page limite les lignes renvoyées, pas le coût d’évaluation. Gardez expressions et listes `IN` petites et utilisez des prédicats sélectifs de type, état ou attribut. Le parseur de workflows ne définit pas la limite de 2048 caractères de l’API des schedules. Serveurs HTTP et proxys peuvent imposer leurs limites d’URI. La [liste des schedules](./server-api-reference.md#schedule-list-filters) utilise une autre grammaire, fondée sur l’égalité et `AND`.

## Requêtes invalides {#invalid-queries}

Une expression reconnue qui échoue à l’analyse, à la résolution des champs ou au contrôle des types renvoie HTTP `422` avec `reason: "validation_failed"`, un `message`, et des tableaux dans `errors.query` et `validation_errors.query`. Une taille de page ou un état invalide utilise la clé de ce paramètre.

| Expression invalide | Correction |
| --- | --- |
| `Unknown = 1` | Enregistrez l’attribut dans cet espace de noms ou corrigez le nom du champ. |
| `OrderTotal = "1000"` | Utilisez le littéral numérique `1000`. |
| `Approved = 1` | Utilisez `true` ou `false`. |
| `Region > "eu"` | Les keywords acceptent égalité et appartenance, pas l’ordre. |
| `Tags != "urgent"` ou `NOT Tags IN ("urgent")` | L’appartenance négative n’est pas prise en charge pour les listes de keywords. |
| `Attempt IN ()`, `Attempt = 1 AND` | Fournissez une liste non vide ou un prédicat complet. |
| `DueAt > "tomorrow"` | Envoyez un horodatage concret. |

## Mode embedded et Waterline {#mode-support}

Ce langage est disponible via l’API de liste des workflows du Server. La liste embedded actuelle et les filtres des vues enregistrées de Waterline n’implémentent pas toute cette grammaire. Leurs filtres exacts de métadonnées `key=value` et champs de sous-chaîne ne prouvent pas la prise en charge des intervalles, de `IN`, de `!=` ou des expressions booléennes. Waterline en mode service a aussi besoin d’un support explicite dans l’interface/API avant de traiter une vue enregistrée comme ce langage. Le travail de parité reste ouvert dans la [fonction de requêtes de visibilité](https://github.com/durable-workflow/.github/issues/224).

La référence suit le [parseur natif publié et ses tests unitaires](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs), l’[implémentation de pagination HTTP](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs) et les [tests de l’API de liste](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs). Ils décrivent le comportement publié du Server, pas l’achèvement de la parité embedded ou Waterline.
