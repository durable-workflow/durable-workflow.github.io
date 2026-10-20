---
sidebar_position: 6
title: Nettoyer les workflows
description: Archivez les runs, exportez un historique vérifié et supprimez les détails sans perdre les copies nécessaires à la récupération.
---

# Nettoyer les workflows {#pruning-workflows}

Workflow v2 distingue deux opérations de cycle de vie :

1. **Archiver** : marque un run terminal comme archivé pour l’exclure des vues actives de la flotte. L’archivage ne supprime **aucune** ligne.
2. **Supprimer les détails** : retire les détails conservés éligibles ou les projections orphelines. L’API de nettoyage intégrée exige un run terminal fermé et vérifie les blocages de conservation. L’application hôte choisit la politique de rétention. L’archivage n’est pas un prérequis de l’API.

Server applique sa propre politique de rétention par namespace : le nettoyage automatique ignore les runs archivés. Archiver un run Server le protège donc de ce nettoyage. Ce n’est pas une étape préparatoire à la suppression automatique.

## Conserver l’historique au-delà de la rétention en base {#keeping-history-beyond-database-retention}

Choisissez où conserver l’historique nécessaire avant d’activer le nettoyage :

| Besoin | Option | Stockage et conséquence du nettoyage |
| --- | --- | --- |
| Conserver l’historique récent dans Server | Rétention bornée du namespace, de 1 à 365 jours | Les détails des runs fermés éligibles peuvent être supprimés après l’échéance. Exportez avant si vous avez besoin d’un historique plus long. |
| Conserver tout l’historique du namespace dans Server | Mode de rétention `forever` | L’historique reste dans la base principale jusqu’au retour explicite à une rétention bornée. |
| Préserver certains runs Server fermés | Archiver ces runs | Les passages automatiques et explicites de rétention Server les ignorent. L’API publiée ne propose pas de désarchivage : n’utilisez pas l’archive comme verrou temporaire d’export. |
| Conserver un historique indépendant plus long | Exporter chaque run fermé et préserver ses objets payload externes | Votre application gère la planification, la vérification, le contrôle d’accès et la suppression ultérieure de la copie. Aucun export continu d’historique n’est intégré. |

`forever` et l’archivage conservent les lignes en base sans les déplacer vers un stockage moins coûteux. Prévoyez la croissance des octets d’historique et de payload, les index, les sauvegardes et les temps de restauration. La suppression des détails conserve les lignes de run et d’instance, y compris leurs payloads racines. Leur stockage ne tombe donc pas à zéro. Un export d’historique sert à la relecture et à l’investigation. Ce n’est ni une sauvegarde complète de la base ni une garantie de reprise du run à partir de ce seul fichier.

### Exporter avant de supprimer {#export-before-pruning}

Utilisez la même procédure pour le nettoyage d’une application intégrée et celui d’un namespace Server. La sélection et l’autorité de suppression diffèrent, comme décrit ci-dessous.

1. **Prévoyez une fenêtre sûre.** Lancez l’export assez tôt dans la période de rétention pour permettre nouvelles tentatives, pannes et retard de vérification. Par exemple, un export quotidien avec 30 jours de rétention en base laisse plus de temps de récupération qu’un premier export au jour 30. Avant un premier export ou une réduction de rétention, protégez temporairement la source : suspendez le nettoyage intégré ou activez `forever` dans Server. Notez l’ancienne politique et ne la rétablissez qu’après vérification. Le nettoyage peut démarrer dès qu’un run est éligible.
2. **Inventoriez les runs fermés.** Fixez une borne supérieure UTC et sélectionnez les `closed_at` antérieurs. Exportez chaque run, y compris les prédécesseurs échoués, annulés, terminés et remplacés par continue-as-new. Une instance peut avoir plusieurs runs. Conservez namespace, identifiant d’instance, identifiant de run et heure de fermeture pour chaque candidat, et parcourez toutes les pages.
3. **Exportez un run précis.** Utilisez le point d’accès ou la commande limité au run ci-dessous, plutôt que le run courant au moment du traitement. Séparez les exports candidats des copies déjà vérifiées.
4. **Vérifiez la copie stockée.** Relisez-la depuis sa destination. Vérifiez l’identité du run contre l’inventaire du namespace, la version de schéma, la séquence finale attendue, la plage complète d’événements, la politique d’occultation et la somme de contrôle. Vérifiez toute signature avec une clé de confiance. Préservez la version exacte de l’application et les codecs nécessaires à une relecture à froid. Une somme de contrôle prouve l’égalité des octets, pas la complétude de l’historique à l’export.
5. **Préservez les objets externes.** L’export conserve les enveloppes de référence externes, pas une copie indépendante de chaque objet référencé. Conservez ces octets pendant toute la durée de vie de l’export et testez leur récupération sans cache chaud. Suivez le [cycle de vie des payloads externes](../features/external-payload-storage.md#replay-retention-and-cleanup).
6. **Réconciliez avant suppression.** Comparez l’inventaire des runs fermés aux copies vérifiées à destination. Déclenchez une alerte pour les identifiants manquants, les échecs de vérification et un retard d’export proche de l’échéance. N’avancez le point de contrôle qu’une fois chaque candidat comptabilisé. Réexaminez des fenêtres de fermeture qui se chevauchent et dédupliquez par namespace et identifiant de run. Ne remplacez pas un bundle complet vérifié par un export ultérieur incomplet.

:::warning Sans copie de récupération, la suppression est irréversible

Un export après suppression ne peut pas reconstruire les événements effacés. L’implémentation publiée peut pourtant encore marquer un run terminal nettoyé `history_complete: true` et réutiliser son ancien `dedupe_key`. Ce défaut est suivi dans [Workflow #856](https://github.com/durable-workflow/workflow/issues/856). Aucun de ces champs ne prouve donc l’absence de nettoyage. Les exports intégrés doivent refuser les runs dont `details_pruned_at` est renseigné. La liste Server cesse de montrer un run après suppression de son résumé. Un inventaire commencé après nettoyage ne peut donc pas prouver que tous les anciens runs ont été exportés. Conservez l’inventaire préalable et examinez les manques à partir d’une copie de récupération.

:::

### Sélectionner et exporter les runs Server {#selecting-and-exporting-server-runs}

La liste des workflows accepte des comparaisons `CloseTime` dans son paramètre `query`. Cet exemple sélectionne un intervalle UTC fixe, borne haute exclue :

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

Lisez `workflow_id`, `run_id` et `closed_at` de chaque entrée de `workflows`. Répétez la même requête avec `next_page_token` jusqu’à recevoir `next_page_token: null`. Ne filtrez pas uniquement `status=completed`, car cela exclurait les échecs et les autres états terminaux. Conservez la même fenêtre pendant la pagination et empêchez le nettoyage de supprimer ses résumés durant la capture.

Pour chaque paire sélectionnée, exportez et stockez son bundle :

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

La [politique de rétention Server](../polyglot/server.md#retention) détermine quand le nettoyage automatique peut agir. Après vérification de toutes les copies requises, rétablissez la politique bornée prévue. Vérifiez la capacité avant de laisser `forever` actif pendant une panne prolongée d’export. Les runs archivés restent protégés indépendamment de cette politique.

### Sélectionner et exporter les runs intégrés {#selecting-and-exporting-embedded-runs}

Utilisez le modèle de run configuré pour sélectionner les runs fermés non nettoyés par `closed_at`. La requête suivante produit l’inventaire des candidats, pas un export automatique :

```php
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Support\ConfiguredV2Models;

$runs = ConfiguredV2Models::query('run_model', WorkflowRun::class)
    ->whereNull('details_pruned_at')
    ->whereNotNull('closed_at')
    ->where('closed_at', '>=', $fromUtc)
    ->where('closed_at', '<', $untilUtc)
    ->orderBy('id')
    ->lazyById(100);

foreach ($runs as $run) {
    // Persist the candidate run id and close time in your export inventory.
}
```

Exportez chaque run sélectionné avec l’initialisation normale de l’application et sa configuration de stockage :

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` vérifie l’intégrité et la structure sans exécuter de relecture. Il ne prouve ni la disponibilité des objets externes ni la capture de l’artefact avant suppression. Testez séparément une relecture complète représentative avec la version applicative prévue. Le nettoyage ne peut appeler `pruneRun()` qu’après satisfaction des exigences de rétention et d’export. La réussite d’un export n’autorise pas automatiquement la suppression.

## Archiver les runs terminaux {#archiving-terminal-runs}

Archivez un run terminé, échoué, annulé ou interrompu via le plan de contrôle :

```php
use Workflow\V2\Contracts\WorkflowControlPlane;

$controlPlane = app(WorkflowControlPlane::class);

$result = $controlPlane->archive('order-12345', [
    'reason' => 'Retention period expired',
]);

if ($result['accepted']) {
    // Run's archived_at is now set; it disappears from active fleet views.
}
```

La même opération est disponible via la route HTTP du plan de contrôle. Seuls les runs fermés peuvent être archivés. Un run déjà archivé renvoie `accepted` avec le résultat `archive_not_needed`.

### Automatiser l’archivage {#automating-archival}

Planifiez l’archivage en recherchant dans la table durable les runs terminés au-delà de votre période de rétention, puis appelez `archive()` pour chacun. Pour une règle temporelle simple, ajoutez par exemple ceci à `routes/console.php` :

```php
use Illuminate\Support\Facades\Schedule;
use Workflow\V2\Models\WorkflowRun;
use Workflow\V2\Contracts\WorkflowControlPlane;

Schedule::call(function (WorkflowControlPlane $controlPlane): void {
    WorkflowRun::query()
        ->whereIn('status', ['completed', 'failed', 'cancelled', 'terminated'])
        ->whereNull('archived_at')
        ->where('closed_at', '<=', now()->subMonth())
        ->with('instance:id')
        ->chunkById(100, function ($runs) use ($controlPlane): void {
            foreach ($runs as $run) {
                $controlPlane->archive($run->instance->id, [
                    'reason' => 'retention_policy',
                ]);
            }
        });
})->daily();
```

## Supprimer les lignes de projection {#pruning-projection-rows}

Les projections de résumé, d’attente, de chronologie, de timer et de filiation peuvent être reconstruites depuis l’historique et les commandes durables. Utilisez `workflow:v2:rebuild-projections --prune-stale` pour supprimer les projections dont le run durable n’existe plus :

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## Supprimer les données durables {#pruning-durable-rows}

Les applications intégrées peuvent utiliser l’API de nettoyage fournie après application de leur politique de rétention et vérification des exports ou copies de récupération requis :

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` verrouille le run choisi et supprime ses détails dans une transaction de stockage unique. Il refuse un run non terminal, sans date de fermeture, ou avec une activité détachée encore ouverte (`detached_activity_still_open`). L’hôte reste responsable du choix du run autorisé et de sa période de rétention. `retentionHoldReason($runId)` permet d’inspecter le blocage dû à une activité détachée. La suppression le vérifie de nouveau avant d’effacer les lignes.

Conservez `workflow_runs` et `workflow_instances`. Le run reste une trace terminale avec `details_pruned_at`. Un nettoyage répété conserve le premier marqueur. Les champs d’entrée et de sortie racines restent dans la ligne du run : comptez leur stockage séparément. Ne recréez pas les résumés ou l’historique supprimés par une reconstruction de projections. Un export après suppression ne peut pas récupérer l’historique effacé. Cette limite de complétude est suivie dans [Workflow #856](https://github.com/durable-workflow/workflow/issues/856).

Cette API supprime les détails en base. L’hôte gère la conservation et le nettoyage des objets externes, y compris les références depuis les racines conservées, le travail détaché et les blocages actifs de sauvegarde ou récupération. Suivez le [cycle de vie des payloads externes](../features/external-payload-storage.md) avant de supprimer les objets. Vérifiez l’export et les octets externes requis **avant** la suppression des détails. Les runs archivés avec leurs détails restent disponibles pour l’analyse d’incidents.
