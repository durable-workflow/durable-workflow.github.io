---
sidebar_position: 26
title: Afinidade portável dos workers
description: Compatibilidade e limites de afinidade dos workers de serviço nos SDKs PHP, Python e Rust.
tags:
  - workers
  - atividades
  - replay
  - multilíngue
---

# Afinidade portável dos workers {#portable-worker-affinity}

Os workers de serviço implementam os recursos indicados pelo protocolo do Server. As versões dos SDKs e a configuração do worker determinam sua disponibilidade.

Atividades locais, sessões de worker e execução sticky compartilham uma regra de portabilidade: o worker deve declarar cada recurso como compatível ou recusá-lo explicitamente. O protocolo `1.18` é o mínimo para essas declarações. O Server recusa uma capacidade plana de roteamento se o manifesto estruturado não declarar o mesmo recurso como compatível.

## Compatibilidade dos SDKs {#sdk-support}

| Worker do SDK | Atividades locais | Sessões de worker | Execução sticky |
| --- | --- | --- | --- |
| PHP | Compatível | Compatível | Compatível |
| Python | Compatível desde 2.2.0 | Compatível desde 2.3.0 | Compatível desde 2.5.0 com `sticky_cache_capacity` maior que zero |
| Rust | Compatível desde 3.1.0 com `Worker::local_activities(true)` | Compatível desde 3.2.0 com `Worker::worker_sessions(true)` | Compatível desde 3.4.0 com `Worker::sticky_cache(...)` |

Os workers anunciam apenas capacidades implementadas e ativadas em seu perfil. As atividades locais, sessões e sticky do Rust e sticky do Python exigem ativação explícita. SDKs antigos recusam capacidades que não implementam. Workflows normais e atividades em fila usam replay completo do histórico sem essas otimizações.

## Registro de atividades locais {#local-activity-recording}

Os workers PHP, Python e Rust com ativação executam uma atividade local dentro do worker de workflow. A conclusão da tarefa inclui argumentos, resultados das tentativas, opções de repetição e tempo limite, progresso de heartbeat e resultado ou falha terminal. O Server registra essa sequência atomicamente como histórico normal de atividade com `execution_mode=local`.

O replay consome o evento terminal registrado e não chama o handler local novamente. Se o worker for perdido antes que o Server confirme a conclusão, o handler poderá executar novamente. Seus efeitos externos devem ser idempotentes.

Os workers PHP normais executam o handler síncrono em linha. O cancelamento e os tempos limite de heartbeat, por tentativa e total são observados antes de uma tentativa, em `ActivityContext::heartbeat()` ou após o retorno. Mantenha esses handlers curtos e divida o trabalho bloqueante com pontos seguros de heartbeat.

Os callbacks assíncronos de Python e Rust devem ceder o controle ao runtime. O Rust renova o lease exato do workflow independentemente dos heartbeats da aplicação, descarta o callback por tempo limite, perda de autoridade ou desligamento e registra relatórios limitados de tentativas e heartbeats. Consulte o [exemplo de atividade local Rust](https://github.com/durable-workflow/sdk-rust/blob/3.1.0/examples/local_activities.rs) e a [referência da API](https://rust.durable-workflow.com/durable_workflow/struct.LocalActivityOptions.html).

Os workers PHP que ativam o [cancelamento cooperativo](/docs/polyglot/cancellation) usam o protocolo 1.20 e processos supervisionados de callback para atividades locais preparadas. A execução local em linha do Rust usa outro perfil comum e não pode ser combinada com supervisão local cooperativa preparada. Callbacks bloqueantes precisam de supervisão de processos para garantir uma parada física.

## Ciclo de vida das sessões de worker {#worker-session-lifecycle}

Os SDKs PHP, Python e Rust oferecem opções tipadas de sessão e operações para criar, usar, renovar e fechar. As opções incluem requisitos, fila, duração do lease, TTL total, máximo de atividades simultâneas e política de reaquisição. O worker fecha suas sessões durante um desligamento ordenado.

Se o titular desaparecer, seu lease e sua reserva de concorrência expiram. Um novo titular pode readquirir a sessão quando os requisitos correspondem, mas precisa reconstruir os recursos locais antes da primeira atividade. A identidade da sessão não torna a memória do processo durável.

A reaquisição preserva o TTL absoluto original. Renovar amplia a autoridade do titular sem ampliar esse TTL. Use Server 2.5.1 ou posterior para preservá-lo e registrar o roteamento da sessão durante replay a frio. Consulte o [exemplo de sessão Rust](https://github.com/durable-workflow/sdk-rust/blob/3.2.0/examples/worker_sessions.rs) e [WorkerSessionOptions](https://rust.durable-workflow.com/durable_workflow/struct.WorkerSessionOptions.html).

## Execução sticky e replay a frio {#sticky-execution-and-cold-replay}

Os caches PHP, Python e Rust são limitados e usam como chave exata o ID do workflow, da execução e da compilação do worker. Informam `hit`, `miss`, `eviction` e `forced_cold_replay`. Expiração, remoção, substituição, perda do titular ou compilação incompatível descartam a otimização e reproduzem o histórico completo.

Use Python SDK 2.5.0 com Server 2.5.10 ou posterior. O cache é desativado por padrão. Ative-o com `sticky_cache_capacity` e defina o limite de bytes de histórico retido e o TTL. Ele armazena histórico durável codificado e pode reutilizar cursores de página validados para evitar downloads repetidos. Reserve memória adicional para decodificação e replay determinístico. Consulte o [guia e o exemplo de sticky no Python](https://python.durable-workflow.com/guides/sticky-execution/).

O Rust SDK 3.4.0 aceita a mesma base publicada do Server. Ative seu cache com `Worker::sticky_cache(StickyCacheOptions::new(...))` e configure o limite de bytes de histórico codificado e o TTL. Cada replay decodifica um novo snapshot. Os cursores reutilizados são conferidos com o lease atual e o histórico antes de aceitar um acerto. O cache guarda histórico, não instâncias vivas nem recursos de sessão. Consulte [StickyCacheOptions](https://rust.durable-workflow.com/durable_workflow/struct.StickyCacheOptions.html) e o [exemplo Rust executável](https://github.com/durable-workflow/sdk-rust/blob/3.4.0/examples/sticky_execution.rs).

O Server 2.5.10 mantém replay completo para SDKs PHP anteriores a 2.2.0. Use PHP SDK 2.2.0 ou posterior para consumir dicas de replay de históricos iniciados com StartAccepted.

A afinidade sticky não reserva tarefas prontas para o proprietário nem lhe dá prioridade. Um worker elegível pode reivindicá-las enquanto a afinidade de outro worker ativo estiver vigente, inclusive sem slots livres no proprietário. Essa reivindicação é marcada `forced_cold_replay`. Aumentar o TTL não faz a seleção esperar pelo proprietário.

Um replay a frio forçado indica que a otimização de cache estava indisponível. Não é uma falha de correção do workflow. O código deve continuar determinístico com cache vazio. Consulte as [regras de seleção e diagnóstico](/docs/features/sticky-execution#routing-identity).

## Padrões seguros e frotas com atualizações graduais {#safe-defaults-and-rolling-fleets}

Workflows normais não precisam configurar sessões nem sticky. Frotas com versões mistas recusam operações incompatíveis no mínimo do protocolo: o Server verifica versão negociada, capacidade plana, manifesto estruturado e identidade exata do cache antes de aceitar dados de conclusão específicos.

O [manifesto publicado de cenários entre SDKs](/platform-conformance/portable-worker-affinity-runtime-scenarios.json) cobre veracidade do manifesto, replay de atividades locais, perda e reaquisição do titular da sessão, acertos e remoção de cache, substituição do worker, replay a frio forçado e workflows sem configuração.

Para implementações incorporadas ao Laravel, consulte [Atividades locais](/docs/features/local-activities), [Sessões de worker](/docs/features/worker-sessions) e [Execução sticky](/docs/features/sticky-execution). Essas APIs pertencem ao pacote Workflow. Use a API do SDK correspondente para workers de serviço.