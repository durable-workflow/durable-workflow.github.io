---
sidebar_position: 14
title: Escopo operacional do operador
description: Contrato operacional v2 de saúde, filas, reconstrução, exportação, arquivamento e topologia.
tags:
  - operações
  - observabilidade
  - Waterline
keywords:
  - escopo operacional
  - saúde de workflows v2
  - reconstruir projeções
  - exportar histórico
  - verificar arquivamento
  - saúde das filas
  - alta disponibilidade
---

# Escopo operacional do operador {#operator-operating-envelope}

Este guia define o contrato operacional do Durable Workflow v2. Use-o para decidir quais diagnósticos bloqueiam uma implantação e quais são indicativos, quais dados de filas pertencem ao Waterline ou à telemetria dos workers, como verificar reconstruções e exportações e quais topologias são documentadas.

Estes procedimentos de implantação e recuperação se aplicam ao Laravel incorporado e ao Server autogerenciado. O Durable Workflow Cloud é um serviço gerenciado separado: o Cloud controla persistência, localização em uma região, backups, restauração e recuperação do runtime. Os clientes operam clientes e workers dos SDKs pela URL de seu namespace. Não use este guia para conectar um Server ao Cloud. Consulte [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane) para essa fronteira do cliente.

## Interfaces de referência oficial {#source-of-truth-surfaces}

Use estas interfaces em conjunto:

| Interface | Uso | Classe do contrato |
| --- | --- | --- |
| `php artisan workflow:v2:doctor --strict` | Validar capacidades do backend antes do tráfego v2 ou das atualizações | Bloqueante |
| `GET /waterline/api/v2/health` | Prontidão atual do motor e verificações v2 bloqueantes ou indicativas | Bloqueante com `status = error`; indicativa com `status = warning` |
| `GET /waterline/api/stats` | Totais duráveis, pendências, reparo, divergência de projeções e compatibilidade dos workers | Orientação e medições |
| `php artisan workflow:v2:rebuild-projections ...` | Visualizar e reparar divergência de projeções | Manutenção |
| `php artisan workflow:v2:backfill-command-contracts ...` | Visualizar e preencher snapshots antigos de contratos de comandos | Manutenção |
| `php artisan workflow:v2:history-export ...` e rotas de exportação do Waterline | Replay, transferência de arquivos e artefatos de incidentes | Verificação |
| Ações de arquivamento do Waterline e `archive()` do plano de controle | Transições do ciclo de vida de execuções encerradas | Ciclo de vida |
| Métricas, rastros e logs dos SDKs de workers | Latência de agendamento a início, polling, cache sticky e telemetria da aplicação | Telemetria de execução |

O contrato operacional do estado durável reside no runtime proprietário de cada execução. O Waterline o apresenta pelo pacote incorporado ou pelo Server independente via SDK PHP. A telemetria do worker continua sendo a referência para latência e comportamento dos processos dentro dos seus workers.

### Interfaces por formato de implantação {#surface-mapping-by-deployment-shape}

As rotas anteriores estão disponíveis nos dois modos do Waterline. O modo incorporado lê o estado durável do host Laravel no processo. O modo de serviço executa a imagem publicada do Waterline e lê um namespace do Server pelo SDK PHP. A API autenticada do Server e a CLI `dw` também ficam disponíveis diretamente, com ou sem Waterline:

| Pergunta do operador | Waterline incorporado ou de serviço | Interface nativa do Server independente |
| --- | --- | --- |
| Prontidão do motor e saúde bloqueante ou indicativa | `GET /waterline/api/v2/health` | `GET /api/system/health` com autenticação admin e plano de controle v2; `dw server:health` para liveness e `dw server:info` para topologia, protocolo e segurança da implantação |
| Totais duráveis, pendências, reparo, compatibilidade e divergência de projeções | `GET /waterline/api/stats` | `GET /api/system/operator-metrics` e `dw system:operator-metrics` |
| Detalhes de uma execução selecionada e exportação | `GET /waterline/api/instances/...` e `/waterline/api/.../history-export` | `GET /api/workflows/{workflowId}`, `/runs/{runId}` e `/runs/{runId}/history/export`; consulte a [referência da API do Server](./polyglot/server-api-reference.md) |
| Comandos do operador: cancelar, terminar, reparar, arquivar, sinais, atualizações e consultas | `POST /waterline/api/instances/.../{cancel\|terminate\|repair\|archive}` e rotas de sinais, atualizações e consultas | `POST /api/workflows/{workflowId}/{cancel\|terminate\|repair\|archive}` e `POST /api/system/repair/pass` |
| Descoberta de topologia e identidade do nó | Incorporado: `php artisan workflow:v2:doctor --json`, objeto `topology`. Serviço: interface nativa do Server conectado | `GET /api/cluster/info`, `GET /api/health`, `GET /api/ready` ou `dw server:info` |

As famílias de campos e os nomes de contrato abaixo não mudam conforme a interface usada. Um Waterline é limitado ao runtime e namespace configurados. Não combina execuções incorporadas com execuções gerenciadas pelo Server.

## Evidências datadas da versão 2.0 {#dated-20-evidence-snapshot}

Este resumo distingue o comportamento medido em artefatos publicados dos procedimentos aceitos que cada operador deve ensaiar no próprio ambiente. Uma linha aprovada vale para o cenário e a topologia 2.0 documentados, não para outros substratos ou implantações maiores em geral.

O inventário atual de provas é:

| Prova e data UTC | Medição direta | Limites |
| --- | --- | --- |
| Ensaio de failover em uma região, 2026-07-28 | Conclusão entre nós, perda de uma API, interrupção e recuperação do MySQL, perda do Redis com polling no banco, perda e recuperação do lease de worker e reinício do agendador único. Todas as fases passaram nas asserções de perdas e duplicatas. | Duas APIs com endpoint compartilhado, uma instância MySQL, Redis como aceleração, um worker de fila e um agendador/manutenção em uma região. As interrupções foram de contêineres, não promoções gerenciadas pelo provedor. |
| Matriz de reinício de temporizadores, 2026-07-28 | Workflows adormecidos terminaram após reiniciar worker e Server, com um agendamento e um disparo de temporizador por execução, sem comandos de replay duplicados. | Recuperação de temporizadores duráveis e replay na topologia publicada, não de estado arbitrário de processos ou efeitos externos. |
| Matriz de atividades, 2026-07-29 | Recuperação de resultados após reiniciar workers, novas tentativas e tempos limite, observação de heartbeat e cancelamento, registro terminal durável e conclusão idempotente nas interfaces exigidas. | Comportamento do motor no nível de atividade. A aplicação continua controlando a idempotência de efeitos externos. |
| Matriz de ciclo de vida, 2026-07-29 | Conclusão e falha terminais, início duplicado e reutilização de ids, tempos limite e novas tentativas, continuidade de histórico e prevenção de efeitos duplicados entre PHP, Python, Rust, CLI, API, histórico e Waterline. | Correção do ciclo de vida nos cenários testados, não uma medição de disponibilidade ou desempenho. |

Consulte o [contrato de compatibilidade](./compatibility.md) para as linhas de versões aceitas e ensaie a recuperação documentada na sua implantação antes de afirmar capacidade de failover específica para uma topologia.

### Garantias medidas e procedimentos aceitos {#measured-guarantee-vs-supported-procedure}

| Falha ou resultado | Prova direta das evidências datadas | Procedimento aceito | O que não demonstra |
| --- | --- | --- | --- |
| Perda de uma API | Uma das duas APIs foi encerrada, a sobrevivente foi alcançada pelo endpoint comum, o estado confirmado foi preservado e a execução terminou. | Retire nós com `/api/ready`, repita requisições interrompidas e confira topologia e registro antes de restaurar tráfego. | Perda total da frota, isolamento de zona ou partições arbitrárias. |
| Interrupção do banco de dados | As duas APIs deixaram de ficar prontas; o estado durável sobreviveu, um worker substituto recuperou a tarefa após o lease expirar, a execução terminou e uma conclusão duplicada foi recusada. | Restaure primeiro o banco gravável, espere prontidão, invalide o proprietário antigo e verifique uma execução antes de retomar tráfego. A promoção gerenciada exige fencing do provedor, RPO e tempos medidos. | Promoção de banco gerenciado, escritas confirmadas durante split-brain ou RPO/RTO além da interrupção local medida. |
| Interrupção do Redis | A prontidão indicou aceleração degradada enquanto o polling do banco preservou o estado; repetir a requisição de polling não duplicou um lease e a prontidão voltou ao restaurar Redis. | Mantenha Redis como aceleração, tolere o aviso, restaure-o após a persistência e confirme que a latência de descoberta volta à referência. | Redis com dois primários, cache durante partições ou tempos de promoção do provedor. |
| Reinício ou perda de worker | O ensaio recuperou e terminou um workflow com lease após perder o worker. A matriz de atividade posterior provou recuperação durável de resultados e conclusão idempotente. | Deixe leases expirarem ou drene workers, inicie um substituto compatível, verifique registro e reivindicação e mantenha efeitos externos idempotentes. | Estado local ao processo não armazenado ou efeitos externos exatamente uma vez. |
| Reinício do Server ou agendador | A matriz terminou workflows adormecidos após reiniciar o Server sem duplicar temporizadores. O ensaio preservou progresso ao perder uma API e reiniciar um agendador único. | Restaure persistência, torne os papéis prontos, confirme um só agendador/manutenção, registro e uma conclusão representativa. | Perda simultânea de todos os nós do Server e persistência, failover multirregião ou agendadores duplicados como topologia estável. |
| Entrega duplicada | A recuperação do banco e a perda do worker registraram uma conclusão lógica e recusaram a duplicada com HTTP `409`. Com Redis degradado, o lease original foi reutilizado. A matriz de atividade aprovou separadamente a conclusão idempotente. | Use identidades estáveis de requisição e tarefa, respeite recusas de tentativas obsoletas e torne os efeitos de atividades idempotentes. | Garantia universal de entrega ou efeitos exatamente uma vez fora do motor durável. |
| Conclusão terminal | Workflows entre nós, perda de API, recuperação do banco e perda do worker chegaram a `completed`. A matriz posterior aprovou conclusão, falha, cancelamento, término, tempo limite e novas tentativas. | Verifique a execução selecionada e seu histórico/exportação antes de arquivar ou declarar recuperação. | Cargas, integrações ou combinações de falhas não testadas. |

### Maior teste de carga atual {#largest-current-load-cell}

O maior teste configurado inicia **1.000 workflows** com concorrência de início **8** e **8** workers fazendo polling em paralelo por 120 segundos. Exige pelo menos 98% de conclusão dos inícios e verifica disponibilidade de endpoints, esvaziamento de chaves de cache, cobertura de amostras e limites de recursos.

Trate-o como um **teste breve de correção**, não como uma medição sustentada em escala de produção. Não estabelece promessas universais de vazão, latência, memória ou concorrência máxima. Determine esses valores com testes de desempenho e prolongados para a topologia, mistura de workers, banco de dados, cache e versão exatos que vai operar.

### Exclusões explícitas {#explicitly-out-of-scope}

As evidências de 2.0 não cobrem:

- Partições de rede
- Desvio deliberado do relógio
- Operação multirregião
- Comportamento split-brain

Esses experimentos não são requisitos de publicação da versão 2.0. São requisitos para fazer as afirmações correspondentes sobre partições, desvio de relógio, multirregião ou split-brain. O escopo 2.0 aceito continua sendo a topologia publicada com seu pacote de recuperação e o comportamento medido nos cenários documentados. Cenários de caos não aceitos não provam que os procedimentos documentados de uma região sejam inutilizáveis.

## Topologias aceitas {#supported-topologies}

O Durable Workflow v2 aceita as topologias operacionais abaixo. Os nomes da primeira coluna correspondem a `topology.current_shape` publicado em `/api/cluster/info` e em [Topologia de papéis do Server](./polyglot/server-role-topology.md). Assim, o contrato operacional corresponde à descoberta lida pela sua automação.

| Topologia operacional (`topology.current_shape`) | Contrato operacional aceito | Principais domínios de falha | Expectativa de recuperação e failover |
| --- | --- | --- | --- |
| `embedded`, um nó | Waterline, plano de controle, saúde, reconstrução, exportação e arquivamento em um processo de aplicação com um banco durável e um cache. | Processo Laravel, banco durável e cache em um host. | A perda do host ou banco interrompe o serviço. Restaure primeiro estado durável, um nó pronto e o registro dos workers antes de retomar tráfego. |
| `embedded`, cluster pequeno em uma região | Um banco compartilhado, cache compartilhado para despertar, compatibilidade e configuração iguais e nós ativos no mesmo datacenter ou região para limitar a latência de filas e temporizadores. | Banco e cache compartilhados, coordenação de despertar, balanceador e agendador ou manutenção únicos. | Perder um nó reduz capacidade, não correção. Perder banco bloqueia tráfego; perder só Redis degrada aceleração e avisa enquanto o polling durável preserva correção. Failover do agendador e atualizações são procedimentos explícitos, não promessas de HA automática. |
| Distribuição `standalone_server` | Consulte [Implantações autogerenciadas](./deployment.md) e aplique as mesmas distinções de saúde, estatísticas, exportação, arquivamento e filas por `/api/system/...`, `/api/workflows/...` ou um Waterline de serviço separado. | Banco e Redis compartilhados, contêineres API, workers escalados separadamente, observador Waterline opcional e agendador/manutenção únicos. | API e Waterline são substituíveis; banco, Redis e agendador definem a ordem de recuperação. Restaure persistência e verifique `/api/ready`, `/api/cluster/info` e registro antes de devolver tráfego. |
| `split_control_execution` | Mesmo contrato de `standalone_server`, com papéis em suas classes próprias: `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node`. Mesmas métricas, saúde e comandos por nó. Direcione leituras administrativas ao nó proprietário do papel. | A lista de [Topologia de papéis do Server](./polyglot/server-role-topology.md) indica qual subsistema falha primeiro. Banco, Redis e eleição do agendador único continuam riscos globais. | Mesma ordem de `standalone_server`; verifique `topology.current_shape`, `topology.current_process_class` e `topology.current_roles` por nó. Uma rota em classe incorreta retorna `503 topology_role_unavailable`. |

`split_control_execution` não é outro motor nem produto. Tem o mesmo contrato de `standalone_server` com as classes por papel de `topology.shape_assignments`. O restante do guia vale para os dois modos, salvo quando uma seção nomeia um papel específico. [Topologia de papéis do Server](./polyglot/server-role-topology.md) contém o vocabulário, os limites de autoridade e o caminho de migração.

O Waterline no modo de serviço é um observador, não outra topologia do Server. Adicioná-lo ou removê-lo não altera `topology.current_shape`, a disponibilidade de API ou CLI nativas nem o runtime proprietário de uma execução.

Publique no procedimento da sua topologia a ordem de restauração, frequência de backups, atraso esperado de failover e comportamento vinculado a uma região. O contrato do produto indica o que medir. O da sua implantação registra tempos de recuperação, passos manuais e domínios de falha que você aceita.

### Domínios de falha por topologia aceita {#failure-domain-checklist-by-supported-shape}

Use a tabela anterior como resumo e escreva o procedimento com estes modelos de perda mais explícitos:

- **Laravel incorporado, um nó**: um processo controla em conjunto plano de controle, correspondência, projeção, agendador e execução. Perdê-lo interrompe comandos duráveis, progresso, disparo de agendamentos e leituras do operador até a mesma aplicação voltar a ficar pronta com armazenamento durável intacto.
- **Laravel incorporado, cluster pequeno em uma região**: perder um nó comum deve retirar apenas parte da capacidade HTTP e dos workers. Os demais continuam reivindicando trabalho do armazenamento compartilhado. O banco de dados compartilhado, o despertar pelo cache compartilhado e o nó proprietário do agendador ou manutenção únicos são os principais limites de correção da frota.
- **Server independente (`standalone_server`)**: perder um `server_http_node` deve interromper a entrada e os comandos apenas nesse nó. Workers saudáveis podem terminar seus leases e outras APIs atender ao tráfego. Perder um `worker_node` deve aumentar pendências, idade da fila ou avisos de compatibilidade apenas em `(connection, queue, compatibility)` afetados. Perder `scheduler_node` pausa novos agendamentos e varreduras sem invalidar workflows ativos. Perder o banco de dados interrompe toda a frota. Perder apenas Redis preserva o polling durável, degrada `long_poll_wake_acceleration` e aumenta a latência de descoberta até a reconexão.
- **Server com papéis separados (`split_control_execution`)**: cada papel tem sua classe de processo: `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node` e `execution_node`. Perder uma classe degrada apenas seu papel: entrada interrompe HTTP externo; plano de controle recusa comandos rapidamente enquanto os leases continuam; correspondência usa descoberta direta; agendador pausa agendamentos e registra omitidos; execução acumula tarefas prontas sem perder estado. O banco de dados continua sendo uma interrupção global. Perder apenas Redis degrada a aceleração com o mesmo polling do banco e aviso de prontidão de `standalone_server`.

Se sua implantação depender de outras premissas, trate essa topologia como um procedimento separado com contrato validado próprio, em vez de presumir que o guia de autosserviço se aplica sem alterações.

### Pacote de recuperação por topologia {#published-recovery-packet-by-topology}

As topologias aceitas só estão prontas para produção quando o procedimento de implantação publica seu pacote de recuperação correspondente:

| Topologia | Dados que o operador deve publicar |
| --- | --- |
| `embedded`, um nó | Calendário de backups do banco, expectativas de preservação de cache, revisão exata e snapshot de ambiente/configuração para restaurar, atraso máximo aceito e evidência do último ensaio bem-sucedido. |
| `embedded`, cluster pequeno em uma região | Todo o pacote de um nó, mais o proprietário atual do agendador ou manutenção, impacto previsto de perder um nó diante de banco ou cache compartilhados e passos para restaurar a coordenação de despertar. |
| Distribuição `standalone_server` | Frequência de backups do banco e Redis, imagem/digest fixado, localização de credenciais, failover previsto de `server_http_node`, `worker_node`, `scheduler_node`, última verificação da restauração com `/api/ready` e `/api/cluster/info` e última prova de novo registro dos workers. |
| Distribuição `split_control_execution` | Todo o pacote `standalone_server`, mais escala e falhas esperadas por classe `ingress_node`, `control_plane_node`, `scheduler_node`, `matching_node`, `execution_node` e regras para redirecionar ao receber `503 topology_role_unavailable` de um nó incorreto. |

Se esse pacote estiver ausente, desatualizado ou não testado, considere a topologia adequada apenas ao desenvolvimento, independentemente da quantidade de nós ativos.

### Verificar a identidade da topologia antes de confiar na referência {#verify-live-topology-identity-before-trusting-the-baseline}

Em implantações independentes ou com papéis separados, confirme primeiro a identidade publicada pelo próprio nó antes de interpretar falhas de fila, agendador ou papéis. `GET /api/cluster/info` é sua referência oficial:

| Campo | Uso |
| --- | --- |
| `topology.current_shape` | Confirma se o nó anuncia `embedded`, `standalone_server` ou `split_control_execution`. |
| `topology.current_roles` | Confirma os papéis lógicos realmente hospedados pelo nó. |
| `topology.supported_shapes` | Confirma quais topologias a compilação atual aceita publicamente. |
| `topology.shape_assignments` | Associa cada topologia aceita a conjuntos de papéis por classe de processo para compará-los com o nó atual. |

Use esses campos como primeira verificação de divergência da topologia durante as implantações:

- No Server independente de autosserviço, os nós API devem continuar anunciando `api_ingress`, `control_plane`, `matching` e `history_projection`; os nós do agendador, `scheduler`; e os workers, `execution_plane`.
- Em papéis separados, verifique se `current_roles` de cada nó corresponde a um conjunto documentado de `shape_assignments` antes de atribuir atrasos de fila ou agendador a um worker.
- Se `current_roles` não corresponder ao plano, considere duvidosas as referências de fila e failover até corrigir a identidade do nó.

Instalações incorporadas não publicam `/api/cluster/info`. Para ver a topologia local, execute `php artisan workflow:v2:doctor --json` e inspecione `topology`. Ele publica o mesmo esquema e contém `current_shape`, `current_process_class`, `current_roles`, `execution_mode` e o resumo aninhado `matching_role` da aplicação.

## Diagnósticos bloqueantes e indicativos {#blocking-and-advisory-diagnostics}

O Durable Workflow v2 distingue diagnósticos bloqueantes e indicativos.

| Gravidade | Significado | Ação habitual |
| --- | --- | --- |
| Bloqueante | A configuração ou prontidão atual não é segura para tráfego v2 | Pare a implantação, corrija o requisito e verifique novamente |
| Indicativa | A interface continua legível, mas alguns dados derivados precisam de reconstrução, preenchimento ou revisão antes de confiar neles | Mantenha o tráfego quando adequado e repare a interface indicada |
| Saudável | Nenhum problema atual foi encontrado na interface | Continue a operação normal |

Aplique essa regra às interfaces publicadas:

- `workflow:v2:doctor --strict` bloqueia se os problemas de capacidade do backend tiverem gravidade `error`, como um driver de fila não aceito no modo de fila ou cache sem bloqueios. Diagnósticos informativos de fila no modo de polling continuam indicativos.
- `GET /waterline/api/v2/health` retorna:
  - `status = ok` se a interface operacional v2 estiver pronta e as verificações atuais concordarem.
  - `status = warning` se continuar legível, mas houver dados que precisam de reconstrução, preenchimento ou reparo antes de confiar plenamente neles.
  - `status = error` com HTTP `503` se a ponte para o motor não estiver pronta ou um problema bloqueante de capacidade impedir a interface v2.
- `GET /waterline/api/stats` publica dados operacionais duráveis. Use seus campos JSON como diagnósticos para painéis e scripts, não como um endpoint de coleta de métricas.

## Verificações de correção e aceleração {#correctness-vs-acceleration-checks}

Cada verificação v2 tem `category` igual a `correctness` ou `acceleration`. O snapshot publica um resumo por categoria para responder às duas perguntas sem agregar a lista novamente.

- **Verificações de correção**: indicam se funcionam a descoberta de tarefas duráveis prontas, as projeções atualizadas, o preenchimento de contratos de comandos, retenção, compatibilidade dos workers e capacidades do backend. `status = error` significa risco para a reivindicação segura ou o estado confiável do operador. Interrompa implantações até resolver.
- **Verificações de aceleração**: indicam se a propagação opcional de sinais de despertar acompanha o ritmo. O polling durável garante a correção. Por isso, `status = warning` na aceleração pode aumentar a latência entre nós sem deixar tarefas abandonadas.

Cada entrada de `checks` inclui `category`, e o snapshot adiciona `categories` para resumir as duas questões de relance:

```json
{
  "status": "warning",
  "categories": {
    "correctness": {"status": "ok", "check_count": 8},
    "acceleration": {"status": "warning", "check_count": 1}
  }
}
```

Uma degradação de `acceleration` afeta apenas a aceleração: investigue o cache ou o backend de despertar sem bloquear tráfego que depende apenas da descoberta durável. A degradação de `correctness` é o sinal bloqueante. `long_poll_wake_acceleration` é a entrada canônica de aceleração e nunca supera `warning`. Todas as outras são de correção.

## Semântica da saúde das filas {#queue-health-semantics}

A saúde das filas se divide entre estado durável e telemetria do worker/runtime.

### Dados duráveis das filas {#durable-queue-facts}

Use as estatísticas e visões de fila do Waterline para o estado durável das tarefas:

| Dado | Significado |
| --- | --- |
| `operator_metrics.backlog.runnable_tasks` | Tarefas duráveis prontas para reivindicação agora. |
| `operator_metrics.backlog.delayed_tasks` | Tarefas duráveis existentes que ainda esperam por `available_at`. |
| `operator_metrics.backlog.leased_tasks` | Tarefas duráveis reivindicadas atualmente por um worker. |
| `operator_metrics.backlog.tasks_added_last_minute` | Linhas duráveis de tarefa distintas criadas nos últimos 60 segundos. Mede a entrada durável, não tentativas do transporte. |
| `operator_metrics.backlog.tasks_dispatched_last_minute` | Linhas distintas cujo último `last_dispatched_at` bem-sucedido cai nos últimos 60 segundos. Compare com `tasks_added_last_minute` para detectar entrada maior que despacho. |
| `operator_metrics.starts.pending_runs`, `operator_metrics.starts.pending_commands`, `operator_metrics.starts.ready_tasks`, `operator_metrics.starts.oldest_pending_start_at`, `operator_metrics.starts.max_pending_ms` | Pendências duráveis de início. Distinguem inícios aceitos que ainda não produzem tarefas de workflow ativas do atraso normal do worker. |
| `operator_metrics.tasks.oldest_ready_due_at`, `operator_metrics.tasks.max_ready_due_age_ms` | Tarefa atualmente executável mais antiga e idade de espera de despacho. São o par legível por máquina por trás da tarefa pronta mais antiga. |
| `operator_metrics.tasks.dispatch_overdue`, `operator_metrics.tasks.oldest_dispatch_overdue_since`, `operator_metrics.tasks.max_dispatch_overdue_age_ms` | Tarefas duráveis prontas sem despertar de despacho bem-sucedido e idade da mais antiga. Detectam aceleração degradada do notificador sem confundi-la com crescimento normal da fila. |
| `operator_metrics.backlog.unhealthy_tasks` | Tarefas duráveis com falha de despacho, reivindicação, despacho atrasado ou lease expirado. |
| `operator_metrics.backlog.repair_needed_runs` | Execuções abertas sem um caminho durável de retomada confiável atualmente. |
| `operator_metrics.tasks.oldest_lease_expired_at`, `operator_metrics.tasks.max_lease_expired_age_ms` | Lease expirado mais antigo e sua idade. Indicador principal de leases presos e risco de duplicação. |
| `operator_metrics.backlog.oldest_compatibility_blocked_started_at`, `operator_metrics.backlog.max_compatibility_blocked_age_ms` | Bloqueio de roteamento por compatibilidade mais antigo e sua idade. Use-o quando o trabalho é preservado, mas não há worker compatível elegível. |
| Pollers ativos e obsoletos | Indica se os workers registrados ainda enviam heartbeats para uma fila. |
| Leases atuais | Quais tarefas de workflow ou atividade têm lease e se ele expirou. |

Esses dados descrevem apenas tráfego durável de tarefas de workflow e atividade.

Para aprofundar em uma fila em vez de toda a frota, use as rotas de visibilidade de filas do Server para idade do trabalho pendente, pollers, leases atuais, orçamentos de admissão, `stats.tasks_added_last_minute` e `stats.tasks_dispatched_last_minute`. Compare entrada e despacho locais para identificar a fila que acumula trabalho ou não tem capacidade. Use os campos globais `operator_metrics.backlog.*` anteriores para a comparação agregada.

`GET /waterline/api/v2/health` do Waterline publica o mesmo detalhe por fila em `queue_visibility.*` para o namespace configurado. Estas famílias formam o contrato tipado de saúde das filas:

| Família de campos | Significado |
| --- | --- |
| `queue_visibility.available`, `queue_visibility.reason` | Se o Waterline consegue produzir visibilidade por fila para o namespace configurado e o motivo quando não consegue. |
| `queue_visibility.task_queues[].stats.approximate_backlog_count`, `queue_visibility.task_queues[].stats.approximate_backlog_age` | Contagem de pendências local da fila e idade das pendências duráveis mais antigas. |
| `queue_visibility.task_queues[].stats.tasks_added_last_minute`, `queue_visibility.task_queues[].stats.tasks_dispatched_last_minute` | Entrada durável e despacho por fila nos últimos 60 segundos. Mostra uma fila sobrecarregada oculta por totais globais saudáveis. |
| `queue_visibility.task_queues[].stats.pollers.active_count`, `queue_visibility.task_queues[].stats.pollers.stale_count`, `queue_visibility.task_queues[].stats.pollers.stale_after_seconds` | Pollers saudáveis e obsoletos dessa fila e limite de heartbeat usado pelo snapshot. |
| `queue_visibility.task_queues[].stats.workflow_tasks.*`, `queue_visibility.task_queues[].stats.activity_tasks.*` | Contagens de tarefas prontas, com lease e lease expirado separadas entre workflows e atividades. |
| `queue_visibility.task_queues[].repair.candidates`, `dispatch_failed`, `expired_leases`, `dispatch_overdue` | Pressão de reparo: tarefas que já precisam de reparo, falharam no despacho, têm leases expirados ou exigem novo despacho atrasado. |
| `queue_visibility.task_queues[].repair.oldest_dispatch_failed_at`, `max_dispatch_failed_age_ms`, `oldest_lease_expired_at`, `max_lease_expired_age_ms`, `oldest_dispatch_overdue_since`, `max_dispatch_overdue_age_ms` | Idades locais das falhas de despacho, leases expirados e tarefas com despacho atrasado mais antigos. |

`coordination_alerts[]` no mesmo `GET /waterline/api/v2/health` resume para o operador esses dados por fila e a lista de verificações. Use-o como resumo de avisos e erros pronto para exibição e aprofunde nas entradas correspondentes de `queue_visibility` ou `checks`.

O estado de admissão por fila é o sinal principal de slots e pollers. `saturated` significa que há workers ativos, mas todos os slots registrados têm lease. `throttled` significa que um limite de leases ou despacho retém trabalho de propósito. `no_slots` indica workers registrados sem capacidade para esse tipo de tarefa. `no_active_workers` indica ausência de pollers saudáveis. `unavailable` indica que uma proteção de admissão com bloqueio não consegue comprovar segurança atualmente.

Use `operator_metrics.starts.*` se os inícios parecerem presos mesmo com atraso normal nas filas. Eles distinguem a admissão do início e a criação da primeira tarefa da reivindicação posterior por um worker.

### Pressão de polling e orçamentos de admissão {#poller-pressure-and-admission-budgets}

Use o detalhe das filas ou `dw task-queue:describe` se o fluxo piorar e for preciso distinguir capacidade insuficiente, limitação intencional do Server e ausência total de pollers:

| Estado da fila | Significado | Interpretação |
| --- | --- | --- |
| `accepting` | Há slots livres e nenhum limite do Server foi atingido. | Referência saudável. |
| `saturated` | Todos os slots registrados têm lease. | Pressão de capacidade dos workers. |
| `throttled` | Um limite de leases ativos ou ritmo de despacho do Server retém a fila de propósito. | Indicativo, salvo limite inesperado ou pendências acima da referência publicada. |
| `no_slots` | Há workers ativos registrados, mas nenhum anuncia slots para esse tipo de tarefa. | Bloqueante para a fila. |
| `no_active_workers` | Nenhum poller saudável atende à fila atualmente. | Bloqueante para a fila. |
| `unavailable` | A fila não consegue adquirir o bloqueio exigido pelo caminho de admissão. | Bloqueante até recuperar essa dependência. |

Use esses estados junto aos dados do fluxo:

- `tasks_added_last_minute > tasks_dispatched_last_minute` junto com `saturated` significa que a entrada durável supera a capacidade dos workers.
- O mesmo desequilíbrio junto de `throttled` significa que um limite explícito do Server retém a fila. Avalie-o conforme o contrato pretendido desse limite, não como desempenho sem restrições.
- Se a idade da tarefa pronta mais antiga aumentar junto de `no_active_workers` ou pollers obsoletos, a fila perdeu reivindicantes saudáveis. Trate isso como uma interrupção de roteamento nesse escopo.

### Implantação do papel de correspondência {#matching-role-deployment-shape}

Use `operator_metrics.matching_role.*` para confirmar qual contrato de correspondência e despacho o nó atual realmente fornece:

| Dado | Significado |
| --- | --- |
| `operator_metrics.matching_role.queue_wake_enabled` | Se o nó ainda executa o despertar por polling amplo dentro do loop do worker de fila. |
| `operator_metrics.matching_role.shape` | `in_worker` se o nó mantém esse despertar; `dedicated` se espera um processo separado de `workflow:v2:repair-pass --loop` para a varredura. |
| `operator_metrics.matching_role.task_dispatch_mode` | Modo usado para tarefas prontas: `queue` ou `poll`. |
| `operator_metrics.matching_role.partition_primitives` | Eixos fixados de roteamento, em ordem: `connection`, `queue`, `compatibility`, `namespace`. |
| `operator_metrics.matching_role.backpressure_model` | Limite durável de admissão aplicado pelo motor. V2 informa `lease_ownership`. |

Esses campos são locais ao nó, não globais. Em uma implantação com formatos mistos, leia o snapshot de cada nó ou pod para o qual muda o tráfego para confirmar onde ficou o papel de correspondência antes de interpretar mudanças de pendências ou pollers como saúde do worker.

### Telemetria de workers e SDKs {#worker-and-sdk-telemetry}

Use métricas, rastros e logs dos workers para:

- Latência `schedule_to_start` de workflows e atividades
- Taxa de polling bem-sucedido e despacho síncrono ou antecipado
- Tamanho e remoções do cache sticky
- Pressão de CPU, memória, threads e loop de eventos do worker
- Métricas próprias emitidas por atividades ou código do worker

Consultas síncronas, ferramentas de depuração ao vivo e outras chamadas não duráveis do plano de controle devem ser rotuladas separadamente. Elas não contam como tarefas duráveis pendentes nem alteram os contadores de reparo do Waterline.

## Compatibilidade dos workers e saúde da implantação {#worker-compatibility-and-rollout-health}

`operator_metrics.workers` publica os dados de compatibilidade que determinam se a frota ativa pode executar com segurança o contrato de workflow exigido:

| Dado | Significado |
| --- | --- |
| `operator_metrics.workers.required_compatibility` | Marcadores que um worker deve anunciar para ser elegível no namespace. |
| `operator_metrics.workers.active_workers` | Workers ativos distintos vistos por heartbeat de compatibilidade. |
| `operator_metrics.workers.active_worker_scopes` | Quantidade de escopos `(connection, queue)` cobertos. |
| `operator_metrics.workers.active_workers_supporting_required` | Workers cuja compatibilidade anunciada inclui os marcadores exigidos. |
| `operator_metrics.workers.fleet` | Lista por escopo de cada worker ativo com `worker_id`, `connection`, `queue`, marcadores `supported`, indicador `supports_required`, `source` do heartbeat (`database` ou `cache`) e `recorded_at`. |

Use as contagens para detectar workers que não podem reivindicar o trabalho com segurança e aprofunde em `fleet` para localizar o escopo `(connection, queue)` sem cobertura. O Waterline mostra a mesma lista no painel de compatibilidade, sem consultar manualmente a interface de métricas.

Quando `active_workers_supporting_required` chega a zero em um namespace, o Waterline mostra `no_compatible_worker_for_task` nas execuções afetadas, tanto nos detalhes quanto nas métricas. A verificação `worker_compatibility` passa a `warning` em `correctness`, e seu resumo também passa a `warning` para que a lacuna de cobertura fique visível imediatamente.

Consulte [Implantar builds de workers com build IDs](./polyglot/worker-build-id-rollout.md) para o fluxo de drenagem e retomada que coordena esses dados, e [Compatibilidade e roteamento dos workers](./polyglot/worker-compatibility-routing.md) para o contrato de fixação de execuções que sustenta os diagnósticos.

## Semântica dos alertas {#alert-semantics}

Os limites dependem da implantação. Publique referências numéricas próprias para idade da fila, atraso de reparo, cobertura dos workers e tempos de restauração. Alerte quando o contrato abaixo continuar violado por mais de uma janela normal de reparo ou watchdog da sua topologia.

| Família de alerta | Origem | Interpretação | Escalar quando | Resposta |
| --- | --- | --- | --- | --- |
| Prontidão bloqueante | `workflow:v2:doctor --strict`, `GET /waterline/api/v2/health` | Bloqueante | `doctor --strict` retorna erro ou saúde retorna `status = error` / HTTP `503` | Pare a implantação ou mudança de tráfego, corrija o requisito e repita prontidão e compatibilidade. |
| Cobertura de workers compatíveis | `operator_metrics.workers.*`, saúde `worker_compatibility`, diagnóstico `no_compatible_worker_for_task` | Bloqueante | `active_workers_supporting_required = 0` para um namespace ou escopo `(connection, queue)` exigido | Drene os incompatíveis, registre compatíveis e confirme que o resumo `correctness` se resolve antes de confiar em novas reivindicações. |
| Atraso durável da fila | Visões de fila do Waterline, `operator_metrics.backlog.*`, telemetria `schedule_to_start` | Bloqueante se persistir; indicativo se breve | A idade da tarefa pronta ou latência supera a referência publicada apesar de haver workers compatíveis | Adicione capacidade, inspecione admissão e confirme progresso do agendador e da correspondência. |
| Pressão de polling e saturação da admissão | Detalhe das filas, `dw task-queue:describe`, `status`, pollers obsoletos e taxas de entrada/despacho | Bloqueante em `no_active_workers`, `no_slots`, `unavailable`; indicativo em `throttled` intencional | A fila permanece `saturated` enquanto aumentam a idade e a diferença de entrada/despacho, ou surge `no_active_workers`, `no_slots`, `unavailable` fora de manutenção | Adicione slots, restaure a coorte ausente ou confirme limites e dependência de bloqueio antes de escalar às cegas. |
| Inícios de workflow pendentes | `operator_metrics.starts.*`, telemetria de início do plano de controle e `schedule_to_start` das primeiras tarefas | Bloqueante se persistir; indicativo se breve | `pending_commands`, `ready_tasks` ou `max_pending_ms` superam a referência apesar de haver workers compatíveis e capacidade | Inspecione de ponta a ponta: transformação de comandos em tarefas, primeira tarefa rápida por correspondência/despacho e separação do atraso de início do atraso geral. |
| Divergência de projeções e dívida de reparo | Saúde `run_summary_projection` / `selected_run_projections`, `operator_metrics.repair.*` | Indicativa | A divergência dura mais que a janela prevista de reconstrução ou a idade máxima continua subindo | Visualize reconstrução/reparo, execute e confirme que avisos e idades voltam à referência. |
| Tempestade de novas tentativas ou falhas | `operator_metrics.backlog.unhealthy_tasks`, diagnósticos duráveis de execução e telemetria de falhas | Indicativa, bloqueante se impedir o progresso durável | Falhas de despacho, reivindicação, leases expirados ou tentativas esgotadas superam a referência continuamente | Inspecione a família de tarefas, compare telemetria e falhas duráveis e decida entre drenar tráfego ou isolar a fila. |
| Aceleração de despertar degradada | Saúde `long_poll_wake_acceleration` e resumo `acceleration` | Indicativa | O aviso persiste após janelas de manutenção de cache ou notificador | Investigue cache e propagação. Não trate como falha de correção, a menos que `correctness` também se degrade. |

O objetivo é avisar sobre riscos ao contrato durável, não sobre cada sinal transitório. Alertas de filas e workers só devem bloquear quando ameaçarem o contrato operacional da topologia real.

## Expectativas de reconstrução, reparo e restauração {#rebuild-repair-and-restore-expectations}

Siga estas verificações em ordem quando a interface operacional informar divergência:

1. Verifique `GET /waterline/api/v2/health`.
   - `run_summary_projection` e `selected_run_projections` indicam que o Waterline responde, mas alguns dados de listas ou detalhes precisam de reconstrução.
   - `command_contract_snapshots` indica execuções antigas que ainda precisam completar o contrato WorkflowStarted antes de confiar em formulários de sinais, atualizações ou consultas.
   - `durable_resume_paths` indica execuções abertas que precisam de reparo antes de confiar na próxima fonte de retomada projetada.
2. Veja uma prévia da reconstrução com:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild --dry-run
   ```

3. Reconstrua as projeções afetadas:

   ```bash
   php artisan workflow:v2:rebuild-projections --needs-rebuild
   ```

4. Veja uma prévia do preenchimento de contratos de comandos:

   ```bash
   php artisan workflow:v2:backfill-command-contracts --dry-run
   ```

5. Preencha os contratos quando a classe atual do workflow ainda estiver disponível:

   ```bash
   php artisan workflow:v2:backfill-command-contracts
   ```

6. Use `--prune-stale` apenas depois que a retenção remover linhas duráveis intencionalmente e você quiser excluir projeções cuja execução ou linha de histórico durável não exista mais.

`operator_metrics.repair.*` publica o alcance do loop de reparo. Use contagens de candidatos e selecionados, idade máxima e pressão do limite de busca para decidir se o reparo está dentro da sua referência ou exige investigação de capacidade.

### Retenção e divergência das projeções {#retention-and-projection-drift}

Com Workflow 2.6.3 ou posterior, uma execução retida com `details_pruned_at` não conta como resumo ausente, dívida de reconstrução nem idade de resumo ausente. Ainda conta no total `runs` do relatório. Todos os modos de reconstrução a ignoram, inclusive seleção explícita de execução ou instância, para não restaurar a linha removida nem devolvê-la à seleção de retenção.

Uma execução sem marca e sem resumo continua indicando divergência. Um histórico vazio por si só não prova que um job antigo o removeu. Confirme a limpeza intencional por um registro oficial antes de corrigir. Reconstruir projeções não recupera histórico excluído. Use um backup adequado se precisar dele.

Runtimes anteriores podem indicar falsamente que execuções marcadas e limpas não têm resumo. Atualize o runtime antes de reconstruir para atender a esse aviso. Após uma passagem de retenção, verifique se `run_summary_projection` está em `ok`, se `projections.run_summaries.needs_rebuild` é zero e se passagens posteriores não selecionam as mesmas execuções. A perda real de projeções ainda precisa de reparo.

## Verificação de exportação e arquivamento {#export-and-archive-verification}

Exportar e arquivar servem a fins diferentes:

- **Exportar histórico** cria um artefato de replay, depuração ou arquivo.
- **Arquivar** marca uma execução encerrada para removê-la das visões ativas da frota.
- **Remover detalhes** exclui linhas de projeção ou duráveis após vencer a retenção.

Use esta sequência de verificação:

1. Exporte a execução selecionada:

   ```bash
   php artisan workflow:v2:history-export <workflow-instance-id> --run-id=<workflow-run-id> --output=storage/app/workflow-history/run.json --pretty
   ```

2. Verifique o id de execução esperado, a versão do esquema e os metadados de ocultação configurados do pacote.
3. Verifique os bytes externos referenciados e preserve-os por toda a vida exigida do artefato. Siga o [procedimento de exportação antes da remoção](./configuration/pruning-workflows.md#export-before-pruning) para inventariar cada execução encerrada e detectar cópias ausentes.
4. Arquive apenas se quiser preservar a execução no banco de dados. O Server ignora as arquivadas e não tem API para desarquivar. A limpeza incorporada pertence à aplicação e não exige arquivar antes.
5. Remova os detalhes elegíveis pelo processo de retenção proprietário. Preserve os registros terminais da execução e da instância. Reconstruir projeções não restaura histórico removido e ignora execuções marcadas como limpas.

As rotas correspondentes de exportação e arquivamento do Waterline estão na [referência da sua API do operador](./waterline-operator-api.md).

## Contrato de backup, restauração e recuperação de desastres {#backup-restore-and-disaster-recovery-contract}

Backups, restauração e recuperação de desastres fazem parte do contrato operacional, não de um procedimento privado opcional. Publique e ensaie estes dados para cada topologia aceita:

1. Conjunto de backup durável: banco de dados, referência da imagem do Server ou aplicação, arquivo de ambiente ou configuração, localização de credenciais e topologia ou notas exatas para reconectar workers.
2. Objetivos de recuperação: atraso máximo de restauração aceito, atraso de failover esperado e quem pode declarar o tráfego seguro.
3. Ordem: persistência durável, cache, inicialização ou migrações, agendador ou manutenção únicos, prontidão da API e registro de workers.
4. Verificação: `/api/ready` ou `/waterline/api/v2/health`, `/api/cluster/info` quando aplicável, um registro representativo de worker e uma exportação representativa do estado restaurado.
5. Reparo posterior: reconstrua projeções, preencha contratos se necessário e confirme que as métricas de fila, compatibilidade e reparo voltem à referência antes de declarar o ambiente saudável.

A operação multirregião e split-brain continuam fora do escopo 2.0 aceito. O [guia de autogerenciamento](/docs/deployment#activepassive-multi-region) mantém arquitetura e procedimentos ativo/passivo apenas para avaliação com suporte. Não garante replicação, failover, retorno, RPO ou RTO de autosserviço. O [contrato atual do Cloud](/docs/polyglot/cloud-control-plane) opera cada namespace em uma região gerenciada e também não promete replicação multirregião, failover regional ou retorno.

A frequência dos ensaios também faz parte do contrato público. No mínimo, ensaie a sequência documentada:

- Antes da primeira implantação de produção de uma topologia
- Após alterações nos backups, esquema ou inicialização, autenticação ou topologia
- Com uma frequência periódica publicada junto ao calendário de backups

Se não puder mostrar a data do último ensaio bem-sucedido, o tempo decorrido da restauração e sua verificação, os backups e a recuperação continuam sem comprovação para essa topologia.

## Escopo dos testes de desempenho {#benchmark-envelope}

O Durable Workflow v2 publica quais dimensões medir no seu ambiente. Registre estas referências em testes ou canary antes que o tráfego de produção dependa delas:

| Dimensão | Referência a medir | Origem |
| --- | --- | --- |
| Saúde das projeções | `needs_rebuild = 0` estável, duração após divergência intencional e tempo de limpeza de órfãs/obsoletas | `/waterline/api/v2/health`, `/waterline/api/stats`, `workflow:v2:rebuild-projections` |
| Pressão das filas | Idade de pendências e tarefas prontas, contagens prontas/atrasadas, taxa de entrada/despacho, idade do despacho atrasado, pollers obsoletos e admissão (`accepting`, `saturated`, `throttled`, `no_slots`, `no_active_workers`) | Estatísticas e filas do Waterline, `operator_metrics.backlog.*` / `operator_metrics.tasks.*` |
| Latência de início do workflow | Inícios aceitos esperando a primeira tarefa, idade do início pendente mais antigo e primeira reivindicação após admissão | `operator_metrics.starts.*` e telemetria `schedule_to_start` do worker |
| Latência de agendamento a início | Espera de workflows e atividades entre entrada na fila e início | Métricas dos SDKs de workers |
| Despertar de temporizadores em massa | Propagação de sinais e atraso entre disparo agendado e visibilidade de tarefas prontas durante rajadas | Telemetria dos workers e verificações de coordenação na mesma região |
| Custo da varredura de reparo | Candidatos, selecionados, idade máxima do candidato e da execução ausente e pressão de busca | `operator_metrics.repair.*` |
| Pressão do histórico | Quantidade de eventos, tamanho do histórico e limites de recomendação de continue-as-new | `operator_metrics.history.*` |

São dimensões de medição, não promessas universais de latência. Publique faixas aceitáveis próprias para sua topologia.

## Evidências de testes prolongados {#long-soak-evidence}

Medições pontuais não bastam. Antes de confiar tráfego sustentado a uma topologia, mantenha um pacote de testes prolongados que mostre que o sistema respeitou seus limites declarados ao longo do tempo.

Inclua no mínimo:

- Carga: topologia, imagem do Server ou revisão da aplicação, build ids dos workers, filas, cache, banco de dados e mistura representativa de inícios, temporizadores, atividades, consultas e exportações
- Janela: início e fim, com duração suficiente para uma janela normal de reparo, uma passagem de retenção ou arquivamento se aplicável e uma variação representativa do tráfego do ciclo de negócio
- Estabilidade das filas: idade de pendências, tarefas prontas e inícios pendentes, taxas de entrada e despacho e pollers obsoletos dentro da referência publicada
- Estabilidade da correção: sem `status = error` sustentado em `GET /waterline/api/v2/health`, crescimento inexplicado de `operator_metrics.repair.*` ou lacunas persistentes em `operator_metrics.workers.*`
- Estabilidade de processos e cache: memória, CPU, pressão do loop de eventos ou threads e crescimento de cache ou cardinalidade limitados, sem aumento contínuo sob carga estável
- Recuperação: data do último backup bem-sucedido, último ensaio de restauração, tempo de restauração e comandos que comprovaram a prontidão do ambiente recuperado

Guarde o pacote onde os operadores possam consultar o procedimento. Se uma topologia publicar números, alertas ou tempos de recuperação sem um pacote prolongado correspondente, trate-os como provisórios e não como evidência operacional confiável.

## Lista de verificação completa do operador {#end-to-end-operator-checklist}

Use esta lista após atualizações e antes de confiar em um ambiente novo:

1. Execute `php artisan workflow:v2:doctor --strict`.
2. Verifique `GET /waterline/api/v2/health` e se retorna `ok`, `warning` ou `error`.
3. Leia `GET /waterline/api/stats` para dados de pendências, reparo, histórico, contratos de comandos, compatibilidade e divergência de projeções.
4. Veja prévias de reconstrução ou preenchimento de contratos quando a saúde informar divergência.
5. Exporte uma execução representativa e verifique o artefato de arquivo/replay.
6. Confirme que execuções arquivadas somem das visões ativas e que as linhas duráveis permanecem até a limpeza de retenção.
7. Ensaie a restauração ou failover do procedimento e confirme que o atraso medido corresponde ao esperado para sua topologia.

## Guias relacionados {#related-guides}

- [Monitoramento](./monitoring.md)
- [Referência da API do operador do Waterline](./waterline-operator-api.md)
- [Remoção de dados de workflows](./configuration/pruning-workflows.md)
- [Implantações autogerenciadas](./deployment.md)
