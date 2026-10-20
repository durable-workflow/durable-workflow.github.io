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

Atividades de longa duração devem enviar heartbeats e inspecionar
`should_stop()`. No cancelamento, libere arquivos temporários, conexões ou
outros recursos locais do processo e retorne prontamente. Uma conclusão tardia
é rejeitada pelo estado durável e não pode converter uma execução cancelada ou
terminada em sucesso; workers gerenciados continuam fazendo polling após essa
rejeição definitiva e após reinício.

Para imagens do servidor, autenticação e topologia de produção, continue com o
[guia de configuração do servidor](/docs/polyglot/server).
