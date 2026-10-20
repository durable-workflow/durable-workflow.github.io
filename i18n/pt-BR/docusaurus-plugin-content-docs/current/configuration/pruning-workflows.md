---
sidebar_position: 6
title: Remoção de dados de workflows
description: Arquivamento, retenção, exportações verificadas e remoção segura de dados de workflows.
---

# Remoção de dados de workflows {#pruning-workflows}

O Workflow v2 distingue duas operações de ciclo de vida:

1. **Arquivar**: marca uma execução terminal como arquivada para excluí-la das visões da frota ativa. Arquivar **não** remove linhas.
2. **Remover dados**: exclui detalhes retidos elegíveis ou projeções órfãs. A API de limpeza incorporada exige uma execução terminal e encerrada e verifica suas restrições de retenção. O host escolhe a política de retenção. Arquivar não é um pré-requisito da API.

O Server tem uma política de retenção por namespace separada: sua retenção automática ignora execuções arquivadas. Portanto, arquivar uma execução do Server a protege dessa limpeza. Não é uma etapa preparatória para a exclusão automática.

## Manter o histórico além da retenção do banco de dados {#keeping-history-beyond-database-retention}

Decida onde o histórico necessário será mantido antes de ativar a limpeza:

| Requisito | Opção | Consequência para armazenamento e limpeza |
| --- | --- | --- |
| Manter histórico recente no Server | Retenção limitada por namespace, de 1 a 365 dias | Execuções encerradas elegíveis podem perder seus detalhes após o limite. Exporte antes se precisar mantê-las por mais tempo. |
| Manter todo o histórico do namespace no Server | Modo de retenção do namespace `forever` | O histórico permanece no banco de dados principal até que você volte explicitamente a uma retenção limitada. |
| Preservar execuções encerradas específicas do Server | Arquivar essas execuções | As passagens automáticas e explícitas de retenção as ignoram. A API publicada não tem operação para desarquivar, portanto não use o arquivamento como proteção temporária de exportação. |
| Manter um registro independente por mais tempo | Exportar cada execução encerrada e preservar seus objetos de payloads externos | A aplicação controla o agendamento, a verificação, o acesso e a exclusão posterior dessa cópia. Não há exportação contínua de histórico incorporada. |

`forever` e o arquivamento mantêm as linhas no banco de dados em vez de movê-las para um armazenamento mais barato. Planeje o histórico e os payloads acumulados, os índices, os backups e o tempo de restauração. A remoção de detalhes mantém as linhas de execução e instância, incluindo os campos raiz de payloads. Seu armazenamento não cai a zero. Uma exportação permite replay e investigação, mas não é um backup completo do banco de dados nem garante que um arquivo isolado permita retomar uma execução.

### Exportar antes de remover dados {#export-before-pruning}

Use o mesmo procedimento para o job de retenção de uma aplicação incorporada e para um namespace do Server. A seleção e a autoridade de limpeza são diferentes, como explicado abaixo.

Os exemplos foram verificados com o PHP Server **2.9.5** publicado, seu Workflow **2.6.2** carregado e o Python SDK **2.6.1** instalado normalmente. A [verificação dos artefatos publicados](https://github.com/durable-workflow/durable-workflow.github.io/issues/276#issuecomment-6285271861) cobriu paginação por horário de fechamento, exportação de execuções individuais, checksums e verificação estrutural, retenções por arquivamento/`forever` e limpeza real com `pruneRun()`. Ela não qualificou um replay completo da aplicação nem a restauração de objetos externos.

1. **Estabeleça uma janela segura.** Execute a exportação com antecedência ao limite de retenção, reservando tempo para novas tentativas, interrupções e verificações pendentes. Por exemplo, uma exportação diária com retenção de 30 dias deixa mais tempo de recuperação que um job iniciado no dia 30. Antes da primeira exportação ou de reduzir a retenção, proteja temporariamente a origem: pause a limpeza incorporada ou use a política `forever` do Server. Registre a política anterior e restaure-a apenas após verificar. A limpeza pode executar assim que uma execução se tornar elegível.
2. **Inventarie as execuções encerradas.** Fixe um limite superior em UTC e selecione valores de `closed_at` anteriores a ele. Exporte cada execução, incluindo as com falha, canceladas, terminadas e as antecessoras de continue-as-new. Uma instância pode ter várias execuções. Mantenha namespace, id da instância, id da execução e instante de encerramento de cada candidata, e percorra todas as páginas.
3. **Exporte uma execução específica.** Use o endpoint ou comando limitado à execução mostrado abaixo, em vez de exportar a execução atual no momento do job. Mantenha as exportações candidatas separadas das cópias já verificadas.
4. **Verifique a cópia armazenada.** Leia-a no destino. Compare sua identidade com o inventário do namespace e verifique a versão do esquema, a sequência final esperada, o intervalo completo de eventos, a política de ocultação e a soma de integridade. Verifique as assinaturas configuradas com uma chave confiável. Preserve a compilação exata da aplicação e os codecs necessários para um replay a frio. Uma soma verifica que os bytes correspondem, não que o histórico estivesse completo ao ser exportado.
5. **Preserve os bytes externos.** As exportações preservam os envelopes de referências externas, não uma cópia independente de cada objeto. Preserve esses bytes durante toda a vida da exportação e teste sua recuperação sem um cache aquecido do runtime. Siga o [ciclo de vida dos payloads externos](../features/external-payload-storage.md#replay-retention-and-cleanup).
6. **Reconcilie antes de limpar.** Compare o inventário das execuções encerradas com os registros verificados no destino. Alerte sobre ids ausentes, verificações com falha e exportações pendentes próximas do limite. Avance o checkpoint apenas após contabilizar cada candidata. Examine novamente janelas de encerramento sobrepostas e deduplique por namespace e id da execução. Não substitua um pacote completo verificado por uma exportação posterior incompleta.

Essas etapas pertencem à aplicação; não são uma operação de arquivo autossuficiente suportada pelo produto. [Server #520](https://github.com/durable-workflow/server/issues/520) acompanha a funcionalidade ausente para copiar, reter e verificar a frio todos os bytes externos necessários. Uma exportação bem-sucedida apenas de referências ou uma verificação manual de checksum não conclui esse requisito.

:::warning A remoção de dados é irreversível sem uma cópia de recuperação

Exportar após remover os detalhes não permite reconstruir eventos excluídos. A implementação publicada ainda pode marcar uma execução terminal sem detalhes com `history_complete: true` e reutilizar seu `dedupe_key` anterior. Isso é acompanhado em [Workflow #856](https://github.com/durable-workflow/workflow/issues/856). Não confie em nenhum desses campos como prova de que a limpeza não ocorreu. Os jobs incorporados de exportação devem recusar execuções com `details_pruned_at`. Uma lista do Server deixa de mostrar uma execução quando seu resumo é removido, portanto um inventário iniciado após a limpeza não prova que todas as execuções anteriores foram capturadas. Mantenha o inventário anterior e investigue as lacunas a partir de uma cópia de recuperação.

:::

### Selecionar e exportar execuções do Server {#selecting-and-exporting-server-runs}

A lista de workflows permite comparar `CloseTime` pelo parâmetro `query`. Este exemplo seleciona um intervalo UTC fixo semiaberto:

```bash
curl --fail-with-body --get "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --data-urlencode "query=CloseTime >= '2026-10-01T00:00:00Z' AND CloseTime < '2026-10-02T00:00:00Z'" \
  --data-urlencode "page_size=200"
```

Leia `workflow_id`, `run_id` e `closed_at` de cada entrada de `workflows`. Repita a mesma requisição com `next_page_token` até obter `next_page_token: null`. Não filtre apenas por `status=completed`, pois isso omitiria falhas e outros resultados terminais. Mantenha a mesma janela ao paginar e impeça que a limpeza remova seus resumos durante a captura.

Para cada par selecionado, exporte e armazene seu pacote:

```bash
curl --fail-with-body "$DURABLE_WORKFLOW_SERVER_URL/api/workflows/$WORKFLOW_ID/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "X-Namespace: orders-prod" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  --output "$RUN_ID.candidate.json"
```

A [política de retenção do Server](../polyglot/server.md#retention) determina quando a limpeza automática pode atuar. Quando todas as cópias necessárias estiverem verificadas, restaure a política limitada pretendida. Revise a capacidade antes de usar `forever` durante uma interrupção prolongada da exportação. As execuções arquivadas continuam protegidas independentemente dessa política.

### Selecionar e exportar execuções incorporadas {#selecting-and-exporting-embedded-runs}

Use o modelo de execução configurado para selecionar execuções encerradas e com detalhes preservados por `closed_at`. A consulta abaixo cria o inventário de candidatas, não uma exportação automática:

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

Exporte cada execução selecionada com a inicialização e a configuração de armazenamento normais da aplicação:

```bash
php artisan workflow:v2:history-export "$WORKFLOW_ID" --run-id="$RUN_ID" --output="$RUN_ID.candidate.json" --pretty
php artisan workflow:v2:replay-verify "$RUN_ID.candidate.json" --skip-replay --json
```

`--skip-replay` verifica a integridade e a estrutura sem executar um replay. Não prova que os bytes externos continuam disponíveis nem que o arquivo foi capturado antes da limpeza. Teste separadamente um replay completo representativo com a compilação pretendida da aplicação. A limpeza só pode chamar `pruneRun()` após cumprir seus requisitos de retenção e exportação. Uma exportação bem-sucedida não autoriza automaticamente a exclusão.

## Arquivar execuções terminais {#archiving-terminal-runs}

Arquive uma execução concluída, com falha, cancelada ou terminada pelo plano de controle:

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

A mesma operação está disponível pela rota HTTP do plano de controle. Só é possível arquivar execuções encerradas. Arquivar novamente uma execução já arquivada retorna `accepted` com o resultado `archive_not_needed`.

### Automatizar o arquivamento {#automating-archival}

Arquive execuções terminais periodicamente: consulte a tabela durável de execuções para encontrar as que terminaram antes da sua janela de retenção e chame `archive()` para cada uma. Para uma regra temporal simples, adicione algo assim a `routes/console.php`:

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

## Remover linhas de projeção {#pruning-projection-rows}

As projeções de resumo, espera, linha do tempo, temporizador e linhagem podem ser reconstruídas a partir do histórico e dos comandos duráveis. Use `workflow:v2:rebuild-projections --prune-stale` para excluir as linhas de projeção cuja execução durável não existe mais:

```bash
# Preview what would be pruned
php artisan workflow:v2:rebuild-projections --prune-stale --dry-run

# Actually prune stale projection rows
php artisan workflow:v2:rebuild-projections --prune-stale
```

## Remover linhas duráveis {#pruning-durable-rows}

Os hosts incorporados podem usar a API de limpeza publicada após aplicar sua política de retenção e verificar as exportações ou cópias de recuperação necessárias:

```php
use Workflow\V2\Support\WorkflowRunRetentionCleanup;

$report = WorkflowRunRetentionCleanup::pruneRun($runId);
```

`pruneRun()` bloqueia a execução selecionada e remove seus detalhes em uma única transação de armazenamento. Recusa uma execução não terminal, um encerramento sem data ou uma atividade destacada aberta (`detached_activity_still_open`). O host continua responsável por selecionar uma execução autorizada e aplicar sua janela de retenção. `retentionHoldReason($runId)` permite inspecionar a restrição por atividade destacada. A limpeza verifica isso novamente antes de excluir.

Preserve `workflow_runs` e `workflow_instances`. A execução permanece como um registro terminal com `details_pruned_at`; repetir a limpeza preserva a primeira marca. Os campos raiz de entrada e saída permanecem na linha, portanto contabilize seu armazenamento separadamente. Não recrie os resumos ou o histórico removidos com uma reconstrução de projeções. Uma exportação posterior à limpeza não recupera o histórico excluído. A limitação de completude da exportação é acompanhada em [Workflow #856](https://github.com/durable-workflow/workflow/issues/856).

Esta API remove detalhes do banco de dados. O host controla a retenção e a limpeza de objetos externos, incluindo referências de raízes retidas, trabalho destacado e restrições ativas de backup ou recuperação. Siga o [ciclo de vida dos payloads externos](../features/external-payload-storage.md) antes de remover objetos. Verifique a exportação e os bytes externos necessários **antes** de limpar. Execuções arquivadas com detalhes retidos continuam disponíveis para investigar incidentes.