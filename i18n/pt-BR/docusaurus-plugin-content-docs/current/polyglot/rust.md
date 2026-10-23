---
sidebar_position: 5
title: SDK Rust
description: Instale o SDK Rust de primeira parte e encontre seu crate, código-fonte e documentação gerada da API.
tags:
  - Rust
  - SDK
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK Rust
  - crate durable-workflow
  - worker Rust
  - crates.io
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# SDK Rust {#rust-sdk}

Use este guia para a interface do SDK disponível ao público e depois consulte
a referência gerada da API para tipos e métodos individuais. Nenhuma conta
Cloud é necessária: o caminho principal usa o crate Rust publicado com um
Server sob sua administração. Desenvolvedores já inscritos no acesso
antecipado controlado do Durable Workflow Cloud podem escolher o
[início rápido com runtime gerenciado](./rust-cloud-quickstart.md), claramente separado.

O SDK Rust de primeira parte é uma interface de autoria de workflows, não
apenas um cliente de compatibilidade de protocolo. Rust permite criar
workflows determinísticos, atividades e serviços worker de longa duração no
mesmo modelo de execução durável usado por PHP e Python. O cliente assíncrono
do plano de controle inicia, sinaliza, consulta, atualiza, cancela, termina e
aguarda execuções; o runtime de worker reproduz o histórico, executa handlers
de workflow/atividade/atualização, informa heartbeats de worker e atividade e
troca payloads independentes de linguagem com um Server sob sua administração
ou runtime de namespace do Durable Workflow Cloud.

A [página inicial da documentação Rust](https://rust.durable-workflow.com/)
fornece o índice do SDK e entradas gerais. Para módulos, structs, traits e
métodos do crate, prossiga para a
[referência gerada da API do SDK Rust](https://rust.durable-workflow.com/durable_workflow/).

O SDK Rust estável suporta temporizadores duráveis, workflows filhos, novas
tentativas e timeouts de atividades, atividades locais, sessões de worker,
execução sticky, sinais, handlers de consulta com replay, cancelamento e
terminação, prazos de workflow aplicados pelo servidor, efeitos colaterais
tipados, marcadores de versão, atualizações e falhas tipadas de término/replay.
Ele ainda não declara suporte a gerenciamento de agendamentos. Use o
[Índice de capacidades 2.0](/docs/capabilities/) em vez de presumir que todos
os SDKs têm a mesma abrangência de recursos.

## Experimentar o playground local da Sample App {#try-the-local-sample-app-playground}

Para o caminho mais curto de autoria sem Cloud, abra a
[branch `main` atual da Sample App no GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
e execute:

<!-- docs-example id="sdk.rust.sample-app-playground" -->
```bash
scripts/playground rust
```

O playground local gera código de workflow e atividade pertencente ao chamador,
seleciona os artefatos estáveis atuais e inicia o Server e Waterline publicados.
Ele aguarda um registro de worker cuja identidade, tipo de workflow, tipo de
atividade e fila correspondam ao contrato gerado antes de iniciar o workflow.
O sucesso exige o resultado concluído esperado e o histórico; então o terminal
imprime o link local exato da execução no Waterline e o caminho para evidências JSON estruturadas.

Esse scaffold intencionalmente pequeno e focado no transporte usa
`serde_json::Value`; ele não é o único contrato recomendado para aplicações
Rust. Continue com o
[exemplo existente de entrada/saída tipada](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs),
o [exemplo de política de atividade com novas tentativas, timeout, heartbeat e falha terminal](https://github.com/durable-workflow/sdk-rust/blob/main/examples/activity_options.rs)
e o [exemplo de atividade local](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
do crate. O pacote, exemplo do repositório e referência gerada da API abaixo
continuam sendo os caminhos diretos para quem não deseja a Sample App.

## Pacote e código-fonte {#package-and-source}

- [Crate no crates.io](https://crates.io/crates/durable-workflow)
- [Repositório do código-fonte](https://github.com/durable-workflow/sdk-rust)

Instale o SDK Rust da última tupla qualificada aprovada. O requisito exato é
gerado pela mesma fonte de autoridade legível por máquina do início rápido do Server:

<!-- docs-example id="rust.sdk.install" -->
```bash
%%artifact.rustCargoAddCommand%%
```

Ou declare o mesmo requisito qualificado diretamente em `Cargo.toml`:

```toml
[dependencies]
%%artifact.rustCargoRequirement%%
```

O crate exige Rust 1.86 ou posterior. Os metadados do pacote registram a versão
do Server usada para qualificar o release, o padrão e mínimo do protocolo de
workers e plano de controle 2. A compatibilidade com Server mais recente é
verificada separadamente. Na implantação, use os manifestos de protocolo e
capacidades anunciados por `GET /api/cluster/info`.

O Server negocia cabeçalhos do protocolo de workers dentro da major `1`: um
servidor anunciando `1.N` aceita um cabeçalho de worker `1.M` somente quando
`M <= N`. O SDK Rust 3.5.0 usa por padrão
`X-Durable-Workflow-Protocol-Version: 1.20` e exige um servidor anunciando
`1.20` ou posterior. Para um Server antigo compatível, selecione
`WorkerProtocolVersion::V119` na configuração `worker_protocol_version` do
builder do cliente. O SDK 3.4.x usa `1.19` por padrão. O perfil opcional de
cancelamento cooperativo exige `1.20` e recusa uma seleção explícita de `1.19`.

A negociação rejeita por segurança. Um cabeçalho ausente ou malformado, uma
major diferente ou uma minor de worker mais nova que a minor anunciada pelo
servidor é rejeitada. Versões de release do SDK e Server são controladas
independentemente. Seus manifestos de protocolo em runtime determinam a compatibilidade.

## Listas de workflows e histórico completo de uma execução {#workflow-lists-and-history}

Estas APIs exigem Rust SDK **4.6.0 ou posterior**; confira `Cargo.lock`, pois a combinação de instalação acima pode selecionar um crate mais antigo. A [aceitação do pacote instalado normalmente](https://github.com/durable-workflow/sdk-rust/issues/122#issuecomment-6363352910) verifica três páginas de lista, seis de histórico, payload de 128 KiB, exportação/replay e o exemplo somente leitura com Server 2.11.0 publicado. Testes sem servidor exigem 4.5.0; estes métodos e iteradores de lista/histórico exigem 4.6.0. A combinação selecionada Server/SDK não muda.

`Client::list_workflows(WorkflowListOptions)` e `Client::get_workflow_history(workflow_id, run_id, WorkflowHistoryOptions)` retornam **uma página** cada. Continue manualmente com o `next_page_token` opaco ou use iteradores preguiçosos para leituras completas. Preservam validação, filtros e namespace do Server; não acrescentam campos nem gramática de consulta. Por exemplo, encontre uma execução aberta por um atributo keyword registrado:

```rust
use durable_workflow::WorkflowListOptions;
async fn find(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut matches = client.iter_workflows(
    WorkflowListOptions::new()
        .workflow_type("payments")
        .status("running")
        .query("OrderRef = 'order-42'")
        .page_size(2),
);
match (matches.next().await?, matches.next().await?) {
    (Some(run), None) => println!("open run: {} / {}", run.workflow_id, run.run_id),
    (None, _) => println!("no open run"),
    _ => println!("multiple open runs; refine the query"),
}
Ok(())
}
```

O filtro `status=running` do Server seleciona o **grupo de estados** ativo, incluindo os estados brutos `pending` e `waiting`. `WorkflowSummary` preserva `status`, `status_bucket`, `is_terminal`, atributos de busca e metadados desconhecidos em `raw`. Atributos não são únicos: o filtro pode encontrar um pai e filhos que herdaram o valor. Trate zero, um e vários resultados como acima. Crie o cliente no namespace desejado antes do iterador; namespace e filtros permanecem fixos entre tokens.

Leia toda a execução selecionada sem carregar todas as páginas juntas:

```rust
use durable_workflow::WorkflowHistoryOptions;
async fn audit(client: durable_workflow::Client) -> durable_workflow::Result<()> {
let mut events = client.iter_workflow_history(
    "payment-42", "selected-run-id", WorkflowHistoryOptions::new().page_size(100),
);
while let Some(event) = events.next().await? {
    println!("{}", event.event_type);
}
Ok(())
}
```

`iter_workflows(options)` fornece cada `WorkflowSummary` por `next().await`. Ambos os iteradores oferecem `into_stream()` para `futures_util::TryStreamExt`; fixe o stream antes do polling. Construí-lo não realiza I/O; outra página é buscada somente ao esgotar a atual. Token nulo/vazio encerra; página vazia com token continua. Tokens repetidos ou cíclicos retornam `Error::Pagination` com estado limitado. Falha de página preserva o erro tipado original e depois encerra esse iterador. Trate o erro: leitura parcial não é resultado completo. Coletar um stream armazena todos os itens coletados.

A iteração do histórico mantém a identidade original de workflow/execução e enumera eventos disponíveis; não segue continue-as-new nem assina indefinidamente. Preserva metadados e envelopes de payload. Para replay sem servidor use `Client::export_workflow_history` com `testing::WorkflowHistory::from_export`, em vez de uma página parcial. Veja [replay sem servidor](#rust-replay-export).

Server 2.11 publicado usa por padrão 50 linhas de lista (máximo 200) e 100 eventos de histórico (máximo 1.000) por página. Os tamanhos seguem sem alteração para validação do Server. Pare quando houver resultados suficientes, escolha tamanho adequado e aplique timeout da aplicação. Paginação não acrescenta isolamento de snapshot diante de mudanças concorrentes. Veja o [exemplo publicado somente leitura](https://github.com/durable-workflow/sdk-rust/blob/4.6.0/examples/workflow_pagination.rs), a [API Client](https://rust.durable-workflow.com/durable_workflow/struct.Client.html) e os [tipos de paginação](https://rust.durable-workflow.com/durable_workflow/pagination/index.html).

## Métricas e exportação Prometheus {#rust-sdk-metrics}

Estas APIs exigem Rust SDK **4.7.0 ou posterior**. Confira `Cargo.lock`: a combinação de instalação acima pode selecionar um crate anterior. A [aceitação instalada normalmente](https://github.com/durable-workflow/sdk-rust/pull/131#issuecomment-6364178456) verifica quatro controles HTTP, as seis métricas de um worker real com Server 2.11.0 publicado e o exemplo de exportação. Esse mínimo não altera a combinação selecionada.

O recorder padrão é **no-op**. Forneça um `Arc<dyn metrics::MetricsRecorder>` com `increment(name, count, tags)` e `record(name, seconds, tags)`. Cliente, clones e novos workers herdam esse recorder. `Worker::metrics_recorder` substitui observações poll/task do worker; requisições mantêm o recorder do cliente. Callbacks devem ser rápidos e tratar falhas do exporter localmente. Pânicos com unwinding são isolados dos resultados do SDK; o hook não corrige exporters bloqueantes ou abortos do processo.

Cada requisição, poll ou despacho de tarefa obtida incrementa um contador em um e registra duração monotônica não negativa em segundos. Os seis nomes estáveis são:

| Contador | Histograma de duração |
| --- | --- |
| `durable_workflow_client_requests` | `durable_workflow_client_request_duration_seconds` |
| `durable_workflow_worker_polls` | `durable_workflow_worker_poll_duration_seconds` |
| `durable_workflow_worker_tasks` | `durable_workflow_worker_task_duration_seconds` |

As chaves do cliente são exatamente `method`, `route`, `plane`, `status_code`, `outcome`; as do worker, `task_kind`, `task_queue`, `outcome`. Padrões revisados de rotas excluem IDs, consultas, payloads e credenciais; caminhos desconhecidos usam `unknown`. Nomes de fila pertencem à aplicação: use um conjunto limitado, não uma fila por execução.

Resultados do cliente incluem `ok`, `http_error`, `bridge_rejected`, `TransportError`, `TimeoutError`, `SdkError` e `pending` para um future cancelado. `status_code` mantém o status HTTP decimal observado ou `none`. Os nomes de exceções Rust podem diferir de outros SDKs.

Uma observação do cliente inclui repetições internas de transporte/storage admission e tratamento de resposta/payload; chamadas separadas da aplicação/worker são observadas separadamente. Um iterador preguiçoso observa cada página buscada. Polls incluem retry/backoff gerenciados e distinguem `task`, `empty`, `backpressure`, `error`. Resultados `completed`, `failed`, `expired` descrevem o despacho, não o estado terminal do workflow. São observações de processo, não contagens duráveis, unidades de cobrança ou latência schedule-to-start; perda abrupta pode omitir a amostra final.

Para o adaptador oficial Prometheus, habilite o feature Cargo opcional `metrics-prometheus`. O exemplo usa a receita publicada de dependências:

```toml
[dependencies]
durable-workflow = { version = "=4.7.0", features = ["metrics-prometheus"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Salve o [exemplo publicado](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/examples/metrics_prometheus.rs) como `examples/metrics_prometheus.rs`. Esses bytes exatos foram compilados e executados na aceitação instalada; o exemplo imprime métricas de uma requisição de saúde:

```rust
//! Preview application-owned Prometheus export; serve `encode()` from your HTTP metrics route.
use durable_workflow::{metrics::PrometheusMetrics, Client};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let recorder = Arc::new(PrometheusMetrics::new()?);
    let client = Client::builder(std::env::var("DURABLE_WORKFLOW_SERVER_URL")?)
        .token(std::env::var("DURABLE_WORKFLOW_AUTH_TOKEN").ok())
        .metrics_recorder(recorder.clone())
        .build()?;
    client.health().await?;
    // Workers inherit this client recorder; Worker::metrics_recorder overrides
    // only worker poll/task observations. Applications own the scrape endpoint.
    print!("{}", String::from_utf8(recorder.encode()?)?);
    Ok(())
}
```

Execute com seu Server auto-hospedado:

```bash
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_AUTH_TOKEN=your-token \
cargo run --features metrics-prometheus --example metrics_prometheus
```

`PrometheusMetrics::new()` possui registro dedicado baseado no cliente oficial Prometheus Rust 0.14. Sirva os bytes de `encode()` pela rota de métricas da aplicação com `Content-Type: text/plain; version=0.0.4`. O adaptador não cria listener ou registro global. A aplicação controla acesso/autenticação de scrape, exposição de rede, recursos e encerramento. Contadores acrescentam `_total`; histogramas usam séries bucket/sum/count. `registry()` permite coleta própria e métricas adicionais.

Para métricas OpenTelemetry, implemente o recorder com seu meter existente: contadores de unidade `1` e histogramas em segundos `s`, com nomes/tags exatos. Provider, agregação, rótulos de recursos e ciclo do exporter pertencem à aplicação. É separado do tracing de execução. Veja a [API recorder](https://rust.durable-workflow.com/durable_workflow/metrics/trait.MetricsRecorder.html), [API Prometheus](https://rust.durable-workflow.com/durable_workflow/metrics/struct.PrometheusMetrics.html) e [contrato publicado](https://github.com/durable-workflow/sdk-rust/blob/4.7.0/README.md#client-and-worker-metrics).

## Concorrência de tarefas do worker {#worker-task-concurrency}

As faixas limitadas descritas aqui exigem Rust SDK **4.3.1 ou posterior**. Confira a versão em `Cargo.lock`: a instalação fixada acima pertence a outra tupla qualificada e pode selecionar um SDK anterior. A [aceitação do pacote publicado](https://github.com/durable-workflow/sdk-rust/issues/107#issuecomment-6360719863) verifica três slots configurados, uma quarta chamada admitida após a liberação de um slot e sete workflows concluídos, incluindo uma falha de atividade tratada. Os requisitos de protocolo do Server descritos acima continuam valendo.

`Worker::max_concurrent_workflow_tasks(...)` e `Worker::max_concurrent_activity_tasks(...)` têm padrão **10** cada. `run()` e `run_until()` usam faixas independentes e limitadas para workflow e atividade remota. Defina **1** para execução sequencial dentro da família de tarefas. Por exemplo, configure um cliente existente antes de registrar seus handlers:

```rust
use durable_workflow::Worker;

let mut worker = Worker::new(client.clone(), "payments")
    .max_concurrent_workflow_tasks(1)
    .max_concurrent_activity_tasks(1);
```

Registre os handlers e depois execute `run()` ou `run_until()` normalmente. Os dois limites em um ainda permitem uma tarefa de workflow e uma atividade remota simultâneas. Consultas mantêm uma faixa separada de polling. Clones do worker compartilham a capacidade configurada, inclusive chamadas simultâneas de `run_once()`; clonar não cria outra cota independente.

A disponibilidade dos heartbeats acompanha as tarefas realmente adquiridas, incluindo carregamento de entrada/histórico, execução e confirmação. Um long poll vazio mantém capacidade disponível. Sucesso, falha, recusa e cancelamento liberam o slot local. Atividades locais inline ocupam seu slot de **tarefa de workflow** e não usam o pool remoto; o limite de atividades não restringe separadamente a execução inline entre workflows.

Handlers são futures async do Tokio e precisam ceder o controle. Use `tokio::task::spawn_blocking` ou outro processo para trabalho bloqueante, com limites explícitos de cancelamento e encerramento. Aumentar concorrência não fornece isolamento de CPU nem torna cancelável uma thread desacoplada. Veja a [API de Worker](https://rust.durable-workflow.com/durable_workflow/struct.Worker.html) do SDK instalado.

## Orçamentos de tentativas recebidos pela atividade {#activity-retry-info}

Rust SDK **4.8.0 ou posterior** oferece `ActivityContext::retry_info()` nos handlers de atividades em modo de serviço. Confira o crate instalado em `Cargo.lock`: a versão de instalação selecionada separadamente acima pode ser anterior. O `ActivityRetryInfo` retornado preserva o `attempt_number()` original e o JSON de `policy()` recebido, inclusive campos desconhecidos. É um snapshot imutável dessa invocação, independente dos campos de compatibilidade mutáveis do contexto.

Use `attempt_limit()` e `is_last_configured_attempt()` para interpretar o orçamento recebido:

| Política de tentativas recebida | `ActivityAttemptLimit` | Última tentativa configurada |
| --- | --- | --- |
| Objeto com inteiro positivo `max_attempts: n` | `Bounded(n)`, incluindo a primeira tentativa | `Some(true)` quando a tentativa original alcança ou ultrapassa `n`; caso contrário, `Some(false)` |
| Objeto com `max_attempts: null` | `Unlimited` | `Some(false)` |
| Política omitida, null na raiz, campo ausente ou limite inválido | `Unknown` | `None` |

O helper também retorna `None` para um número de tentativa zero inválido. O padrão de agendamento do runtime não comprova os metadados recebidos: o controle publicado do Server 2.11.0 sem política definida pelo autor omite o snapshot e informa `Unknown`, sem inferir `Bounded(1)`. `policy()` distingue uma política omitida de um JSON null recebido sem tratar nenhum deles como ilimitado. A [aceitação com instalação normal](https://github.com/durable-workflow/sdk-rust/issues/135#issuecomment-6366200791) inclui esse controle e a receita abaixo.

Para escolher um fallback ou registrar um alerta da aplicação na última tentativa configurada, registre um handler no Worker existente:

```rust
use durable_workflow::{json, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let retry = ctx.retry_info();
        if retry.is_last_configured_attempt() == Some(true) {
            // Select a final-attempt fallback or record an application alert.
        }
        Ok(json!({"attempt": retry.attempt_number()}))
    });
}
```

`Some(false)` não promete outra execução. Falha não repetível, cancelamento, fechamento do workflow e prazos esgotados podem encerrar o trabalho antes de consumir o orçamento configurado. O helper não altera a admissão de tentativas nem concede tempo extra.

Atividades locais e chamadas diretas a `testing::WorkflowEnvironment::run_activity` não têm snapshot recebido do Server e informam política desconhecida. Testes novos de `run_workflow` expõem o snapshot modelado registrado no histórico gerado. Essa semântica de testes não comprova que um Server implantado envie uma política. Veja [ActivityRetryInfo](https://rust.durable-workflow.com/durable_workflow/struct.ActivityRetryInfo.html) e [ActivityAttemptLimit](https://rust.durable-workflow.com/durable_workflow/enum.ActivityAttemptLimit.html).

## Identidade estável da atividade e idempotência externa {#activity-identity}

Rust SDK **4.9.0 ou posterior** expõe a identidade recebida originalmente por `ActivityContext`. Confira o crate instalado em `Cargo.lock`: a versão de instalação selecionada acima de forma independente pode ser mais antiga. Os métodos retornam valores imutáveis `Option<&str>` capturados do claim original, inclusive para atividades de sessões de worker.

| Método | Identidade e uso |
| --- | --- |
| `activity_execution_id()` | Uma execução lógica de atividade ao longo das tentativas; use para deduplicar uma operação externa. |
| `workflow_id()` | ID da **instância** do workflow proprietário; use para correlação de negócio. |
| `run_id()` | ID do **run** do workflow proprietário; use para correlacionar essa execução específica. |

Derive uma chave para uma operação específica e passe-a a uma API externa idempotente ou a um registro durável de efeitos. Este handler apenas cria a chave: não cobra um pagamento nem implementa deduplicação externa. Ele recusa a identidade ausente antes de qualquer efeito; a aplicação pode fornecer sua própria chave de negócio explicitamente estável.

```rust
use durable_workflow::{json, ActivityError, Worker};

pub fn register_charge(worker: &mut Worker) {
    worker.register_activity("charge", |ctx, _| async move {
        let execution_id = ctx.activity_execution_id().ok_or_else(|| {
            ActivityError::new("MissingActivityIdentity", "Server activity identity is required")
                .non_retryable(true)
        })?;
        // Pass this key to an idempotent downstream API or durable effect ledger.
        let key = format!("payments:charge:{execution_id}");
        Ok(json!({
            "idempotency_key": key,
            "workflow_id": ctx.workflow_id(),
            "run_id": ctx.run_id(),
        }))
    });
}
```

Quando um Server antigo omite esses campos, eles permanecem `None`. Nunca substitua o ID lógico ausente por ID de tarefa, ID de tentativa ou número da tentativa: a chave mudaria no retry. Atividades locais inline podem receber os IDs reais do workflow/run pai, mas não têm um ID de execução de atividade do Server antes de ele registrar o comando. Testes de atividade sem Server não têm identidade de claim recebida.

Uma chave estável só permite impedir efeitos duplicados quando o sistema externo respeita essa chave. A entrega continua sendo pelo menos uma vez; esta API não torna efeitos externos exatamente uma vez, não restaura progresso de heartbeat nem implementa checkpoints retomáveis de atividade.

Consulte os [métodos de identidade de ActivityContext](https://rust.durable-workflow.com/durable_workflow/struct.ActivityContext.html#method.activity_execution_id) e a [verificação da instalação normal 4.9.0](https://github.com/durable-workflow/sdk-rust/issues/139#issuecomment-6367230500) com controles ordinary/cooperative, locais e de sessões de worker. O contrato compartilhado está em [garantias de execução](../constraints/execution-guarantees.md#service-activity-identity).

## Atividades locais {#local-activities}

O SDK Rust 3.1.0 adiciona execução local inline em workers configurados com
`Worker::local_activities(true)`. Registre callbacks com os métodos comuns de
registro de atividade e use os métodos de atividade local do contexto do workflow.
Veja o [exemplo executável](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs)
e a [referência de LocalActivityOptions](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html)
para configurar novas tentativas e timeouts.

O Server registra o resultado terminal para replay frio. Efeitos locais não
confirmados podem executar novamente após a perda do worker e devem ser
idempotentes. Callbacks assíncronos devem ceder execução ao Tokio. Trabalho
bloqueante precisa de supervisão de processo separada. Execução local inline
e supervisão local cooperativa preparada usam perfis separados de worker.

## Sessões de worker {#worker-sessions}

Habilite `Worker::worker_sessions(true)` e declare os requisitos atendidos pelo
worker com `capabilities(...)`. Roteie atividades remotas com
`in_worker_session(WorkerSessionOptions::new(session_id))`. O contexto da
atividade fornece o handle compartilhado por `worker_session()`. Handles
explícitos suportam `create()`, `renew()` e `close(reason)` após o registro do worker.

Limite a contagem de sessões com `max_concurrent_worker_sessions(...)` e a
concorrência de atividades da sessão com `max_concurrent_activities(...)`.
Renove handles ociosos explicitamente. Heartbeats de atividades também renovam
o lease do detentor, preservando o TTL absoluto original. Um callback
assíncrono que cede ao Tokio é descartado quando seu lease observado localmente
ou TTL expira sem exigir heartbeats da aplicação.

Recursos da sessão vivem no processo detentor. Um substituto deve reconstruí-los,
e efeitos externos interrompidos precisam de idempotência e fencing de
tentativas. Resultados confirmados são reproduzidos sem repetir o callback.
O encerramento gracioso fecha sessões mantidas antes de remover o registro.
Atividades locais não podem usar roteamento de sessão.

O suporte a sessões começa no SDK Rust 3.2.0. Use Server 2.5.1 ou posterior.
O [exemplo executável](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs)
reutiliza um cache local do processo entre duas atividades tipadas e imprime
sua geração. Veja [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html)
e [WorkerSession](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSession.html)
para configuração e métodos de ciclo de vida.

## Execução sticky limitada {#bounded-sticky-execution}

Habilite `Worker::sticky_cache(StickyCacheOptions::new(capacity))` para reter
histórico codificado imutável para replay posterior. O cache é desabilitado
por padrão. Defina `max_history_bytes(...)` e `ttl(...)` para limitar o
histórico retido e sua vida útil. Reserve memória adicional para decodificação e replay.

O cache usa a identidade de workflow, execução e build. Substituição do
worker, expiração, expulsão ou cursor de histórico inválido fazem recorrer ao
histórico durável completo. Workflows terminais e workers parados descartam
suas entradas. O código do workflow deve reproduzir corretamente com cache vazio.

O suporte começa no SDK Rust 3.4.0 e no baseline qualificado do Server. Veja a
[referência de configuração](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html),
o [exemplo executável](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs)
e o [guia de afinidade portátil de workers](./portable-worker-affinity.md).

## Preparar o exemplo publicado do repositório {#prepare-the-released-repository-example}

O [exemplo `hello_world`](https://github.com/durable-workflow/sdk-rust/blob/main/examples/hello_world.rs)
registra um worker Rust, inicia um workflow, envia um sinal, executa uma
atividade, informa um heartbeat de atividade e aguarda o resultado concluído.
Como esse exemplo executa cliente e worker da aplicação em um processo, o
caminho sem conta abaixo o conecta a um Server sob sua administração. Um
namespace Cloud provisionado é um runtime secundário opcional com credenciais
separadas com escopo por papel.

Para um exercício reproduzível de código-fonte, obtenha o código exato do crate
registrado pela tupla qualificada. O valor abaixo é gerado dessa fonte de
autoridade legível por máquina. O diretório do exemplo é absoluto para que
qualquer caminho de conexão possa acessá-lo diretamente:

<!-- docs-example id="rust.sdk.repository-source" -->
```bash
export DURABLE_WORKFLOW_RUST_VERSION=%%artifact.rustSdkVersion%%
export DURABLE_WORKFLOW_RUST_EXAMPLE_DIR="$PWD/durable-workflow-rust-${DURABLE_WORKFLOW_RUST_VERSION}"
git clone --depth 1 --single-branch --branch "$DURABLE_WORKFLOW_RUST_VERSION" \
  https://github.com/durable-workflow/sdk-rust.git "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
```

## Executar o exemplo combinado com Server sob sua administração {#run-the-combined-example-with-self-hosted-server}

O exemplo `hello_world` sem modificações aceita um token para um Durable
Workflow Server sob sua administração cuja política de autenticação permite
que a mesma credencial faça comandos de workflow e poll por trabalho:

<!-- docs-example id="rust.sdk.self-hosted" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
DURABLE_WORKFLOW_SERVER_URL=http://localhost:8080 \
DURABLE_WORKFLOW_TOKEN=dev-token \
cargo run --example hello_world
```

O exemplo usa o namespace `default` provisionado pelo início rápido local do
Server. Use `TASK_QUEUE` para substituir sua fila padrão `rust-workers`.
Nenhuma inscrição ou credencial Cloud está envolvida nesse caminho.

## Caminho secundário opcional: conectar ao Durable Workflow Cloud {#optional-secondary-path-connect-to-durable-workflow-cloud}

Para a prova mais curta com runtime gerenciado, use o
[início rápido Rust no Cloud](./rust-cloud-quickstart.md). Ele executa o mesmo
playground simétrico da Sample App disponível para PHP e Python, seleciona
artefatos estáveis atuais dinamicamente, verifica a prontidão exata do worker
e aguarda um resultado concluído.

<ProductPromotion source="docs-v2-rust-sdk">
Já está inscrito no Cloud? Execute o playground Rust compartilhado em seu
namespace provisionado com credenciais de runtime separadas com escopo por papel.
</ProductPromotion>

O exemplo combinado de nível mais baixo abaixo é útil ao adaptar um processo
Rust existente. Exporte os valores retornados quando o Cloud provisiona o
namespace e cria suas duas credenciais de runtime:

Veja [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane) para o
limite da conexão gerenciada.

<!-- docs-example id="rust.sdk.cloud.environment" -->
```bash
export DURABLE_WORKFLOW_RUNTIME_URL='https://your-runtime-url'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='orders'
export DURABLE_WORKFLOW_CLIENT_TOKEN='dwr_client_credential'
export DURABLE_WORKFLOW_WORKER_TOKEN='dwr_worker_credential'
```

Em `$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR/examples/hello_world.rs`, substitua a
configuração existente de `server_url`, `token` e `Client::builder(...)` por
esta configuração do builder com tokens separados:

<!-- docs-example id="rust.sdk.cloud.client" -->
```rust
let runtime_url = std::env::var("DURABLE_WORKFLOW_RUNTIME_URL")
    .expect("DURABLE_WORKFLOW_RUNTIME_URL must be set");
let runtime_namespace = std::env::var("DURABLE_WORKFLOW_RUNTIME_NAMESPACE")
    .expect("DURABLE_WORKFLOW_RUNTIME_NAMESPACE must be set");
let client_token = std::env::var("DURABLE_WORKFLOW_CLIENT_TOKEN")
    .expect("DURABLE_WORKFLOW_CLIENT_TOKEN must be set");
let worker_token = std::env::var("DURABLE_WORKFLOW_WORKER_TOKEN")
    .expect("DURABLE_WORKFLOW_WORKER_TOKEN must be set");

let client = Client::builder(runtime_url)
    .namespace(runtime_namespace)
    .control_token(Some(client_token))
    .worker_token(Some(worker_token))
    .build()?;
```

Depois execute o exemplo normalmente:

<!-- docs-example id="rust.sdk.cloud.run" -->
```bash
cd "$DURABLE_WORKFLOW_RUST_EXAMPLE_DIR"
cargo run --example hello_world
```

As chamadas de início, sinal, descrição e resultado do workflow usam
`control_token`; registro, polling, heartbeat e conclusão de `Worker` usam
`worker_token`. Ambos os papéis usam a mesma URL de runtime, namespace e fila
fornecidos pelo Cloud, mas não reutilizam uma credencial. Não substitua
nenhuma credencial Cloud por `.token(...)`: esse método é o fallback genérico
de token único usado na configuração sob sua administração acima.

## Iniciar com timeouts de workflow aplicados pelo servidor {#start-with-server-enforced-workflow-timeouts}

O SDK Rust fornece `WorkflowStartOptions` e
`Client::start_workflow_with_options` para prazos de workflow aplicados pelo
servidor mesmo após o processo iniciador sair. O timeout de execução cobre
toda a instância do workflow, incluindo execuções de continuar como novo; o
timeout de run cobre uma execução e é recalculado quando uma nova começa.

<!-- docs-example id="rust.workflow-start-timeouts" -->
```rust
use durable_workflow::{json, Client, Result, WorkflowStartOptions};

async fn start(client: &Client) -> Result<()> {
    let handle = client.start_workflow_with_options(
        "orders.await-payment",
        "orders",
        "order-42",
        WorkflowStartOptions::new()
            .execution_timeout_seconds(300)
            .run_timeout_seconds(30),
        json!([{"order_id": "order-42"}]),
    ).await?;

    println!("workflow={} run={:?}", handle.workflow_id, handle.run_id);
    Ok(())
}
```

Ambos os valores são em segundos, devem ser positivos e o timeout de run não
pode exceder o timeout de execução. O método de conveniência existente
`Client::start_workflow` usa `WorkflowStartOptions::default()`: timeout de
execução de 3600 segundos e de run de 600 segundos. Veja
[Timeouts](/docs/features/timeouts) para a semântica de prazos e continuar como novo do servidor.

Esses são parâmetros de política do workflow, não timeouts HTTP ou de polling
de resultado. Em particular, `WorkflowResultOptions::timeout` apenas faz a
chamada local `result()` parar de esperar. Não fecha, cancela nem altera a
execução do workflow. O chamador pode inspecionar a identidade retornada e
aguardar novamente. Um prazo configurado com `WorkflowStartOptions` é estado
durável do servidor; quando expira, o servidor fecha a execução com resultado terminal `timed_out`.

## Grupos paralelos determinísticos {#deterministic-parallel-groups}

`WorkflowContext::parallel` e seu alias `join` compõem atividades, workflows
filhos, temporizadores, grupos mistos e aninhados sem adicionar um comando ao
Server. Construtores em `ParallelOperation` adiam cada folha até que a árvore
inteira seja conhecida:

```rust
use durable_workflow::{json, ChildWorkflowOptions, ParallelOperation};
use std::time::Duration;

let results = ctx.parallel(vec![
    ParallelOperation::activity("load-profile", json!(["customer-42"])),
    ParallelOperation::group(vec![
        ParallelOperation::child_workflow(
            "quote-shipping",
            ChildWorkflowOptions::new("shipping-workers"),
            json!(["customer-42"]),
        ),
        ParallelOperation::timer(Duration::from_secs(1)),
    ]),
]).await?;
```

Cada folha carrega a identidade estável compartilhada do grupo e seu caminho
completo de fora para dentro. Resultados bem-sucedidos mantêm formato e ordem
aninhados da entrada. `Error::ParallelFailed` preserva a causa tipada da folha,
caminho determinístico do membro, caminho do grupo e irmãos concluídos.
Históricos pendentes e concluídos são reproduzidos sem reagendamento;
duplicatas exatas e conclusões tardias não alteram o resultado posicional escolhido.

## Seleção durável da primeira conclusão {#durable-first-completion-selection}

`WorkflowContext::select` e `select_keyed` iniciam atividades, workflows
filhos, temporizadores, sinais, esperas por condição e grupos comuns aninhados
juntos, retomando a partir do vencedor registrado pelo runtime:

```rust
use durable_workflow::{json, ParallelOperation, SelectionKey};
use std::time::Duration;

let selected = ctx.select_keyed(vec![
    ("resolver", ParallelOperation::activity("resolve-request", json!([request_id]))),
    ("input", ParallelOperation::signal("resolution.received")),
    ("deadline", ParallelOperation::timer(Duration::from_secs(2))),
]).await?;

if selected.key == SelectionKey::Name("deadline".to_string()) {
    if let Some(resolver) = selected.handle(&SelectionKey::Name("resolver".to_string())) {
        resolver.cancel().await?;
    }
}
```

`SelectionResult` preserva chave/índice estável, tipo e identidade da operação,
valor ou falha tipados e um `DurableOperationHandle` para cada membro. Um
perdedor continua a menos que o código depois aguarde `handle.await_result()`
ou `handle.cancel()`. A future de cancelamento resolve para unit; somente o
histórico confirmado `SelectionOperationCancelled` prova que o cancelamento
venceu. O replay avança além de uma solicitação sem marcação, e
`await_result()` ainda retorna uma conclusão confirmada primeiro. Reinício e
replay consomem o vencedor persistido; eventos terminais posteriores ou
duplicados não podem alterá-lo.

## Compensação de saga {#saga-compensation}

Registre uma compensação somente depois de a atividade direta correspondente
concluir e então passe o resultado direto a `Saga::finish`:

```rust
let mut saga = ctx.saga();
let outcome = async {
    let flight = ctx.activity("trip.reserve-flight", json!([])).await?;
    saga.add_compensation("trip.cancel-flight", json!([flight]))?;

    let hotel = ctx.activity("trip.reserve-hotel", json!([])).await?;
    saga.add_compensation("trip.cancel-hotel", json!([hotel]))?;

    ctx.activity("trip.charge", json!([])).await?;
    Ok(json!({"status": "booked"}))
}.await;

saga.finish(outcome).await
```

Uma falha tratada executa o comando de atividade existente na ordem inversa de
registro, uma compensação por vez. A compensação para na primeira falha.
`Error::SagaCompensationFailed` preserva ambos os erros tipados, o tipo da
atividade de compensação e sua ordem de registro durante reinício e replay.
O `cancel_workflow` terminal não retoma o código do workflow para executar compensações.

## Efeitos colaterais determinísticos e marcadores de versão {#deterministic-side-effects-and-version-markers}

O SDK Rust registra pequenos valores não determinísticos com
`WorkflowContext::side_effect` e deriva valores UUIDv4 determinísticos com
`WorkflowContext::uuid_v4`. Um replay frio decodifica o valor registrado em vez
de invocar o callback novamente; marcadores reordenados, ausentes, duplicados
ou incompatíveis com o codec retornam `Error::NonDeterministicReplay` tipado.

Use `WorkflowContext::get_version(change_id, min_supported, max_supported)`
para manter ramos antigos e novos compatíveis com replay durante um rollout.
Novas execuções registram `max_supported`; existentes reutilizam o marcador
durável. `patched(change_id)` fornece a forma booleana de rollout, e
`deprecate_patch(change_id)` preserva o marcador depois que o ramo legado foi
drenado. Veja [Efeitos colaterais](/docs/features/side-effects/) e
[Versionamento](/docs/features/versioning/) para a semântica durável compartilhada.

## Regras de determinismo do Rust {#rust-determinism-rules}

Um replay deve produzir os mesmos comandos duráveis, na mesma ordem, para a entrada e o histórico registrados. Coleções, relógios e primitivas de concorrência comuns do Rust não preservam automaticamente esse contrato:

| Padrão no código do workflow | Substituição durável |
| --- | --- |
| Agendar durante a iteração de um `HashMap` | Ordene as chaves antes ou use `BTreeMap`. |
| Relógio do sistema, `thread_rng` ou UUID novo | Registre um snapshot com `ctx.side_effect(...)` ou use uma atividade. |
| `tokio::time::sleep` ou `std::thread::sleep` | `ctx.sleep(...)` ou `ctx.start_timer(...)`. |
| `tokio::select!` ou disputa de futures comuns | `ctx.select(...)` ou `ctx.select_keyed(...)`. |
| Chamadas duráveis concorrentes sem rastreamento | `ctx.parallel(...)` com ordem estável de entrada. |
| Rede, arquivos ou E/S externa mutável | Uma atividade registrada. |
| Alterar a ordem de comandos existentes na implantação | Uma ramificação estável de `ctx.get_version(...)`, testada com o histórico registrado. |

Os efeitos externos das atividades ainda precisam ser idempotentes; determinismo não torna seguro repetir um pagamento ou gravação. Consulte [idempotência e determinismo](../constraints/idempotent-vs-deterministic.md).

## Testes offline e replay {#offline-testing-and-replay}

Estas APIs exigem Rust SDK **4.5.0 ou mais recente**. Confira `Cargo.lock`: a combinação de instalação separada acima pode selecionar um crate antigo sem elas. A [verificação da instalação normal de 4.5.0](https://github.com/durable-workflow/sdk-rust/issues/105#issuecomment-6362112580) valida doze controles sem Server, este exemplo compilado e exportação/replay de um Server 2.11.0 real. Isso não promove uma nova combinação Server/SDK.

### Testes unitários de atividades e workflows {#rust-activity-workflow-tests}

`testing::WorkflowEnvironment` executa workflows e atividades registrados no processo atual. Use `from_worker(worker)` para reutilizar os registros da aplicação ou registre callbacks diretamente; `worker_mut()` expõe as APIs tipadas normais de registro. Mocks são explícitos: callbacks reais executam seu próprio código, então substitua deliberadamente os efeitos externos.

Use `durable-workflow = "=4.5.0"` na receita qualificada, Tokio com `macros`, `rt-multi-thread` e `time`, e `serde_json = "1"` para o helper de exportação abaixo. Salve o exemplo publicado como `examples/workflow_testing.rs` e execute `cargo run --example workflow_testing`:

```rust
//! Run with `cargo run --example workflow_testing`; no Server is required.
use durable_workflow::{
    json,
    testing::{WorkflowEnvironment, WorkflowHistory},
    Result,
};

#[tokio::main]
async fn main() -> Result<()> {
    let mut env = WorkflowEnvironment::new()?;
    env.register_activity("greet", |_, args| async move {
        Ok(json!(format!(
            "Hello, {}!",
            args[0].as_str().unwrap_or("friend")
        )))
    });
    env.register_workflow("hello", |ctx, args| async move {
        ctx.activity("greet", args).await
    });

    // An activity unit test executes the real callback and argument adapters.
    assert_eq!(
        env.run_activity("greet", "Ada").await?,
        json!("Hello, Ada!")
    );
    // A workflow unit test may replace activity callbacks explicitly.
    env.mock_activity("greet", |_, args| async move {
        Ok(json!({"greeting_for":args[0]}))
    });
    assert_eq!(
        env.run_workflow("hello", "Ada").await?,
        json!({"greeting_for":"Ada"})
    );

    // Replay executes the same registered workflow without running activities.
    // In a deployment test, read the JSON produced by dw workflow:history-export
    // or Client::export_workflow_history instead of this captured test history.
    let history = WorkflowHistory::from_export(env.last_history().unwrap().export())?;
    assert!(env.replay(&history)?.completed);
    println!("activity, workflow and offline replay passed");
    Ok(())
}
```

O `run_activity` direto executa uma tentativa. Em `run_workflow`, a política registrada de novas tentativas se aplica antes de entregar uma falha definitiva ao código do workflow. Falhas reais ou simuladas de atividades remotas/locais usam `Error::ActivityFailed` tipado, com tipo de exceção, número da tentativa e marcador não repetível; um erro de workflow não capturado mantém sua variante Rust original. Heartbeats são capturados localmente. Use as variantes `*_avro_value` quando JSON não preservar o valor Avro original.

### Reproduzir uma execução exportada {#rust-replay-export}

Registre o workflow candidato e carregue um bundle JSON completo de `dw workflow:history-export` ou `Client::export_workflow_history(workflow_id, run_id).await?`. Adicione este helper ao exemplo anterior; ele usa os mesmos imports e espera um fixture concluído:

```rust
fn replay(env: WorkflowEnvironment) -> std::result::Result<(), Box<dyn std::error::Error>> {
let export = serde_json::from_slice(&std::fs::read("workflow-history.json")?)?;
let history = WorkflowHistory::from_export(export)?;
let report = env.replay(&history)?;
assert!(report.completed); // A running snapshot can remain durably pending.
Ok(())
}
```

Para o histórico bruto, combine **todas as páginas** e use `WorkflowHistory::from_history("hello", original_input, response)`, fornecendo a fila original quando ausente. Preserve a entrada e os resultados registrados; payloads removidos/ocultados, referências externas não resolvidas e tokens de página restantes são recusados. O helper de exportação resolve referências ao baixar. O replay não contata Server nem executa callbacks de atividade.

O replay usa os caminhos do worker para decodificação, side effects, marcadores de versão e resoluções select registradas. Comandos alterados ou reordenados retornam `Error::NonDeterministicReplay(ReplayFailure)` com `sequence`, `expected` e `actual`; o controle instalado com exportação real encontra uma atividade alterada na sequência 3. Novos comandos além do snapshot também falham. Um snapshot aberto pode indicar um prefixo duravelmente pendente em vez de conclusão: verifique o resultado esperado e teste novas ramificações com execuções novas no processo e testes de integração. Consulte os [controles publicados de replay](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/tests/workflow_testing.rs).

### Limites de execução {#rust-test-execution-limits}

Atrasos de timers e novas tentativas são pulados. Callbacks paralelos executam na ordem dos comandos, então o ambiente não testa disputas de agendamento ou desempenho. Ele não simula filas, leases ou implantação. Callbacks devem ceder o controle; `max_steps(n)` limita turnos duráveis, comandos e tentativas (10.000 por padrão), enquanto `tokio::time::timeout` pode limitar o tempo de callbacks assíncronos.

Simulação de timeouts de atividade, **novas disputas select**, sinais, filhos, serviços, sessões, continue-as-new e cancelamento exigem integração; comandos não suportados retornam `Error::Testing`. Um vencedor select registrado pode ser reproduzido mesmo sem simular uma disputa nova. Mantenha testes com runtime real para esses limites. Consulte a [API de testes](https://rust.durable-workflow.com/durable_workflow/testing/index.html) e o [contrato de execução publicado](https://github.com/durable-workflow/sdk-rust/blob/4.5.0/README.md#testing-without-a-server).

## Compatibilidade de entrada e recuperação {#entry-compatibility-and-recovery}

**Suporte publicado.** O SDK Rust 3.5.6 introduziu a proteção de entrada abaixo, com roteamento e recuperação no Server 2.9.9. Essas são as versões mínimas para esses recursos; instale as versões estáveis atuais para receber correções de segurança.

`Worker::register_typed_workflow` e os adaptadores tipados com estado desserializam a entrada registrada antes de invocar o handler da aplicação ou sua fábrica de estado. Um formato de entrada incompatível informa o tipo de falha de tarefa `WorkflowEntryArgumentsMismatch` e o motivo `workflow_entry_arguments_mismatch`, sem enviar `fail_workflow`. O erro local do SDK é `Error::HandlerType` para entrada de workflow, com o workflow e o tipo Rust esperado em vez do valor registrado. Handlers de workflow de baixo nível não recebem novas verificações de assinatura Rust. Um erro retornado pelo handler da aplicação após a entrada bem-sucedida continua sendo uma falha normal de workflow, mesmo que o texto se pareça com o diagnóstico de entrada.

O worker gerenciado anuncia `workflow_entry_arguments_validation` automaticamente. Um Server qualificado mantém a tarefa com falha bloqueada para replay e deixa a execução original não terminal. Runtimes antigos podem repetir a tarefa, portanto somente o SDK não estabelece o contrato completo de recuperação.

Use `Client::describe_workflow_run(workflow_id, run_id)` para inspecionar o original e o endpoint de depuração da execução selecionada para consultar o motivo da tarefa. Restaure a decodificação de entrada e o código compatíveis antes de usar a rota HTTP de reparo selecionada no [procedimento de recuperação](../failures-and-recovery.md#service-entry-recovery). Este crate não tem um método auxiliar `repair_workflow`. Mantenha entrada, histórico, namespace, fila, build e prazos originais; versione as alterações de comandos duráveis dentro de um handler compatível e valide o replay a frio. Consulte o [roteamento de definições](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Cancelar, terminar e tratar resultados terminais {#cancel-terminate-and-handle-terminal-outcomes}

No modo de serviço, `cancel_workflow` e `terminate_workflow` fecham a execução
imediatamente. Registram resultados terminais distintos, mas nenhum pede ao
código do workflow para executar limpeza. Use `request_cancellation()` com
workers cooperantes para limpeza limitada. Veja o
[guia de cancelamento cooperativo](/docs/polyglot/cancellation) para políticas
de operações, supervisão e recuperação.

```rust
use durable_workflow::{Client, WorkflowCommandOptions};

# async fn cancel(client: &Client) -> durable_workflow::Result<()> {
client.cancel_workflow(
    "order-42",
    WorkflowCommandOptions::new()
        .reason("customer withdrew the order")
        .request_id("cancel-order-42"),
).await?;
# Ok(())
# }
```

`cancel_workflow` e `terminate_workflow` direcionados à instância resolvem a
execução atual no servidor. Para segurança de execução selecionada, chame
`cancel_workflow_run` ou `terminate_workflow_run`, ou use os métodos
`cancel_selected_run` e `terminate_selected_run` de um handle. Se uma execução
selecionada for antiga, `Error::WorkflowCommandRejected` expõe o motivo estável
`historical_run_command_rejected` com ID de workflow, ID de execução, escopo de
destino, status HTTP e corpo da resposta.

Chamadas bem-sucedidas a `WorkflowHandle::result` continuam retornando o valor
JSON decodificado. Trate as variantes terminais tipadas de cada outro resultado.
Decida pelos campos estáveis de motivo e categoria em vez de texto de exibição:

<!-- docs-example id="rust.typed-workflow-timeouts" -->
```rust
use durable_workflow::{Error, WorkflowHandle, WorkflowResultOptions};

# async fn wait(handle: WorkflowHandle) -> durable_workflow::Result<()> {
match handle.result(WorkflowResultOptions::default()).await {
    Ok(value) => println!("completed: {value}"),
    Err(Error::WorkflowCancelled(outcome)) => {
        println!("cancelled {:?}: {}", outcome.run_id, outcome.reason);
    }
    Err(Error::WorkflowTerminated(outcome)) => {
        println!("terminated: {}", outcome.reason);
    }
    Err(Error::WorkflowFailed(outcome)) => {
        println!("failure {:?}: {:?}", outcome.failure_id, outcome.exception_class);
    }
    Err(Error::WorkflowTimedOut(outcome)) => match (
        outcome.reason.as_str(),
        outcome.failure_category.as_deref(),
    ) {
        ("result_wait_timeout", Some("client_timeout")) => {
            println!(
                "caller deadline for {} / {:?}; the run may still be open",
                outcome.workflow_id, outcome.run_id,
            );
        }
        ("execution_timeout" | "run_timeout", category) => {
            println!(
                "server timeout for {} / {:?}: reason={} category={:?}",
                outcome.workflow_id, outcome.run_id, outcome.reason, category,
            );
        }
        (reason, category) => {
            println!("other typed timeout: reason={reason} category={category:?}");
        }
    }
    Err(error) => return Err(error),
}
# Ok(())
# }
```

Cada resultado terminal contém identidade de workflow e execução. Também
preserva motivo público, categoria e identidade da falha, tipo e classe de
exceção, estado não retentável, mensagem e payload de exceção quando fornecidos
pelo servidor. Um prazo local de espera tem motivo `result_wait_timeout` e
categoria `client_timeout`; um timeout do servidor é uma execução terminal
`timed_out` cujo motivo estável é `execution_timeout` ou `run_timeout`.

Handles retornados por qualquer método de início mantêm o `run_id`
selecionado. `WorkflowHandle::result` descreve essa rota específica, portanto
reutilizar o mesmo ID de workflow para uma execução mais nova não faz uma
espera informar silenciosamente o resultado da nova execução. Preserve
`outcome.workflow_id` e `outcome.run_id` em logs, métricas e registros de novas
tentativas; use buscas no nível da instância somente quando seguir a execução
atual for intencional.

## Atualizações de workflow {#workflow-updates}

Rust suporta atualizações duráveis nos papéis de cliente da aplicação, handle
selecionado e autoria de worker. Use `Client::update_workflow` ou
`WorkflowHandle::update` para valores compatíveis com JSON e os métodos
correspondentes `update_workflow_avro_value` ou `update_avro_value` para valores
Avro explicitamente tipados.

Workers registram handlers nomeados com `Worker::register_update`; use
`register_update_avro_value` quando o handler consumir e retornar valores Avro
diretamente. Uma atualização é uma mutação durável de workflow com resultado.
É separada dos sinais sem espera de resposta e das consultas somente leitura com replay.

## Envelope de payload {#payload-envelope}

Entradas de workflow, sinais, atividades, consultas e resultados usam o
contrato publicado `PayloadEnvelope`: um `codec` e um `blob` codificado. O
caminho padrão `avro` do SDK usa sua dependência declarada `apache-avro` e o
schema Value fixo e versionado da plataforma; não implemente o blob manualmente
nem substitua o envelope por um registro específico da implementação.

<!-- docs-example id="rust.avro-payload-envelope" -->
```rust
use durable_workflow::{decode_payload, json, PayloadEnvelope, Result, Value};

fn round_trip() -> Result<()> {
    let envelope = PayloadEnvelope::avro(&json!({"order_id": "order-42"}))?;
    assert_eq!(envelope.codec, "avro");

    let decoded: Value = decode_payload(&envelope)?;
    assert_eq!(decoded["order_id"], "order-42");
    Ok(())
}
```

`start_workflow` e `start_workflow_with_options` aplicam esse envelope
automaticamente à entrada serializável. Use os auxiliares públicos somente
quando um programa precisar trocar um envelope diretamente.

## Heartbeats de atividade {#activity-heartbeats}

Para atividades remotas, `ActivityContext::heartbeat(...).await` retorna `Result<ActivityHeartbeatResponse>`. Propague erros e inspecione `should_stop()` em uma resposta bem-sucedida. Falhas de requisições diretas incluem `Error::Transport` e recusas HTTP tipadas como `Error::ActivityTaskRejected`. Uma reivindicação com supervisão cooperativa pode retornar `Error::ActivityExecutionAbandoned` quando heartbeats ou verificações de posse falham. Pare o trabalho externo ao perder autoridade. Não suponha que um callback sempre alcance o código de limpeza da aplicação.

A primeira janela de heartbeat começa na reivindicação pelo runtime, antes da entrega da tarefa. Um heartbeat registrado usa seu horário no runtime, não a recepção pelo chamador. Escolha uma cadência com bastante margem dentro do tempo limite configurado, limite cada etapa de trabalho ou E/S e reserve tempo para pausas, latência e eventuais novas tentativas de transporte. Siga as [orientações de cadência](../features/heartbeats.md#heartbeat-cadence-and-receipts). Não há promessa de agendamento automático de heartbeats de progresso ou agrupamento.

No cancelamento, libere recursos locais do processo quando a execução ainda permitir e retorne prontamente. O estado durável rejeita uma conclusão tardia e não permite transformar uma execução cancelada ou terminada em sucesso. Workers gerenciados continuam fazendo polling após essa recusa definitiva e depois de reiniciar. Um heartbeat bem-sucedido não é um commit de efeitos externos nem um checkpoint retomável para uma tentativa substituta.

Para imagens do servidor, autenticação e topologia de produção, continue com o
[guia de configuração do servidor](/docs/polyglot/server).
