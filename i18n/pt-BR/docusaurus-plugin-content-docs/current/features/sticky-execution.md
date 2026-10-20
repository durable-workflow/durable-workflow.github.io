---
sidebar_position: 25
title: Execução sticky
description: Afinidade indicativa de tarefas de workflow, caches locais, seleção normal e diagnósticos de replay a frio.
tags:
  - sticky-execution
  - replay
  - operações
keywords:
  - execução sticky
  - cache de replay sticky
  - recurso ao replay a frio
  - roteamento worker_id
  - diagnósticos de cache sticky
---

# Execução sticky {#sticky-execution}

A execução sticky é uma otimização de replay compatível com o Durable Workflow v2. Um worker pode manter um cache de workflow aquecido e local ao processo após concluir uma tarefa. Se reivindicar uma tarefa posterior da mesma execução, poderá reutilizar seu cache válido. A afinidade não reserva a tarefa para ele.

A execução sticky não garante a correção. O progresso do workflow só é confirmado por histórico durável, e um replay a frio desse histórico é sempre válido. O código do workflow não deve depender de estado local ao processo para ser correto.

## Resumo do contrato {#contract-summary}

A execução sticky oferece quatro garantias:

- Os caches sticky pertencem aos processos dos workers, não ao Server nem ao banco de dados.
- A afinidade sticky usa `worker_id` do protocolo dos workers como identidade do proprietário do cache.
- A afinidade sticky é indicativa e expira. O replay a frio é obrigatório em caso de ausência no cache, reinício do worker, drenagem, atualização ou remoção do cache.
- Os operadores têm controles e diagnósticos identificados para ativação, TTL, capacidade, acertos, falhas, replay a frio forçado e pressão de capacidade.

Os campos duráveis de afinidade são `sticky_worker_id` e `sticky_until` nas execuções e tarefas de workflow. Os campos de diagnóstico das tarefas são `sticky_replay_mode` e `sticky_claimed_at`.

## Ciclo de vida do cache sticky {#sticky-cache-lifecycle}

Um cache sticky é uma estrutura local do worker com o estado reproduzido de um ou mais workflows. Quando um worker compatível conclui uma tarefa, o Server pode registrá-lo como proprietário sticky da execução até `sticky_until`. As tarefas posteriores herdam essa afinidade ao serem criadas.

O worker controla o conteúdo e a política de remoção. Ele pode remover execuções ao atingir a capacidade, iniciar a drenagem, reiniciar, mudar de compilação, detectar estado inseguro ou liberar memória. O Server nunca considera o conteúdo do cache durável.

Se um worker receber uma tarefa com afinidade sticky, mas não tiver mais uma entrada válida, deverá fazer replay a frio do histórico durável. O lease da tarefa continua sendo a única autoridade para confirmar progresso do workflow.

## Identidade de roteamento {#routing-identity}

A identidade de roteamento é `worker_id` do protocolo. Os workers ativam o roteamento sticky ao se registrar com o cache ativado e continuar enviando heartbeats como workers ativos na fila.

A afinidade sticky não acrescenta preferência pelo proprietário nem reserva exclusiva na seleção de tarefas prontas. O runtime PHP seleciona candidatos por prioridade, `available_at` e depois ID da tarefa. O Server também pode redistribuir o lote entre chaves de equidade dentro de uma prioridade. As verificações normais de compatibilidade, tipo de workflow, fila, namespace, capacidade e lease continuam valendo.

Qualquer worker elegível que faça polling pode reivindicar a tarefa antes de `sticky_until`, mesmo quando outro worker ativo tem a afinidade. Se o proprietário não tiver slots livres para workflows, outro poderá reivindicá-la imediatamente e reproduzir a frio. A tarefa não espera pelo cache do proprietário nem pela expiração da afinidade. Aumentar o TTL não cria uma reserva mais longa.

`sticky_until` limita quando a afinidade armazenada está ativa e quando uma reivindicação do proprietário pode ser marcada como `sticky_hit_expected`. Não define a disponibilidade da tarefa, amplia um lease nem garante que o cache local ainda contenha a execução.

## Semântica do recurso ao replay a frio {#fallback-semantics}

O replay a frio é obrigatório nestes casos:

- A execução sticky está desativada.
- O worker não declarou compatibilidade com cache sticky.
- A tarefa não tem `sticky_worker_id` e `sticky_until` ativos.
- O proprietário sticky está obsoleto, ausente, em drenagem, reiniciado ou atualizado.
- O proprietário sticky removeu a execução do cache.
- Outro worker reivindica a tarefa, mesmo com a afinidade do proprietário ainda ativa.
- A afinidade expirou antes da reivindicação da tarefa.

Os diagnósticos do modo de replay são:

- `sticky_hit_expected`: o proprietário sticky reivindicou a tarefa antes da expiração. O worker ainda deve validar seu cache local antes de usá-lo.
- `cold_replay`: nenhuma afinidade sticky foi aplicada.
- `forced_cold_replay`: um proprietário sticky foi registrado, mas outro worker reivindicou a tarefa ou a afinidade expirou. Pode ocorrer mesmo com o proprietário original saudável.

`forced_cold_replay` não é uma falha de correção. Significa que a execução sticky não trouxe a melhoria prevista no custo de replay dessa tarefa.

## Implantação, drenagem e atualizações {#deployment-drain-and-rollout}

A execução sticky segue o ciclo de vida do worker. Durante a drenagem, o worker deve parar de reivindicar novas tarefas de workflow enquanto conclui, mantém por heartbeat, falha ou deixa expirar leases existentes conforme o contrato normal. Outros workers compatíveis podem reivindicar tarefas prontas e reproduzi-las a frio sem esperar a afinidade expirar.

Workers substitutos não herdam caches locais. Por isso, uma atualização pode aumentar `forced_cold_replay` até os novos workers aquecerem seus caches. Use valores `worker_id` únicos por processo ou reinício para distinguir o antigo proprietário de um processo novo nos diagnósticos.

A compatibilidade por build-id e as impressões digitais da definição do workflow continuam decidindo se um worker pode executar uma tarefa. Sticky nunca permite direcionar código incompatível a uma execução.

## Controles do operador {#operator-controls}

A execução sticky é controlada pela configuração do workflow/runtime e pelas capacidades do worker, não por variáveis próprias da imagem do Server. A configuração do pacote expõe a ativação e o TTL da afinidade:

```php
'workflows' => [
    'v2' => [
        'sticky_execution' => [
            'enabled' => true,
            'ttl_seconds' => 300,
        ],
    ],
],
```

Cada worker anuncia a capacidade do cache no registro e nos heartbeats. É possível desativar o roteamento sticky na configuração ou executar workers sem suporte a cache sticky sem alterar a semântica do workflow. As execuções existentes continuam por replay a frio normal.

## Campos do protocolo dos workers {#worker-protocol-fields}

Os workers compatíveis anunciam o suporte no registro:

```json
{
  "worker_id": "orders-worker-01",
  "task_queue": "orders",
  "runtime": "python",
  "sticky_cache_enabled": true,
  "sticky_cache_capacity": 100
}
```

Os workers informam diagnósticos do cache em seus heartbeats:

```json
{
  "worker_id": "orders-worker-01",
  "sticky_cache": {
    "enabled": true,
    "capacity": 100,
    "size": 72,
    "hit_count": 940,
    "miss_count": 31,
    "forced_cold_replay_count": 8,
    "eviction_count": 15
  }
}
```

As respostas de polling de workflow incluem `task.sticky_execution` com `sticky_worker_id`, `sticky_until`, `replay_mode` e `cache_directive`. Interprete `resume_if_present` como permissão para usar um cache aquecido válido e faça replay a frio se a entrada estiver ausente ou inválida.

## Métricas e diagnósticos {#metrics-and-diagnostics}

As métricas do operador incluem:

- `sticky_execution.active_sticky_runs`
- `sticky_execution.ready_sticky_tasks`
- `sticky_execution.leased_sticky_tasks`
- `sticky_execution.hit_expected_last_minute`
- `sticky_execution.miss_last_minute`
- `sticky_execution.forced_cold_replay_last_minute`
- `sticky_execution.cold_replay_last_minute`
- `sticky_execution.hit_rate_last_minute`
- `sticky_execution.miss_rate_last_minute`
- `sticky_execution.capacity_pressure_tasks`

O Server independente também informa capacidade e tamanho do cache, acertos, falhas, replay a frio forçado, remoções e quantidade de workers sob pressão de capacidade em `sticky_execution_workers`.

Use os diagnósticos assim:

- `ready_sticky_tasks` conta tarefas de workflow prontas cuja afinidade registrada não expirou. Não significa que estejam reservadas para seus proprietários. `capacity_pressure_tasks` do runtime PHP informa atualmente a mesma contagem.
- Uma taxa baixa de acertos esperados pode vir de outros workers reivindicando tarefas, expiração do TTL, substituições ou remoções do cache. Compare os IDs dos reivindicantes e as métricas informadas pelos workers antes de alterar TTL ou capacidade.
- Muitas falhas de cache ou replays a frio forçados indicam que a correção é preservada, mas sticky não reduz o custo de replay.
- A pressão de cache informa workers próximos ou acima da capacidade anunciada. Ela é diferente dos slots livres de execução e da quantidade de tarefas prontas.

## Código seguro para replay {#replay-safe-code}

O código deve se comportar da mesma forma com sticky e replay a frio. As decisões devem usar histórico durável: entradas, resultados de atividades, temporizadores, sinais, atualizações, efeitos registrados e marcadores de versão. As projeções de memo e atributos de pesquisa são metadados do operador. Não baseie decisões em seus valores mutáveis.

Não dependa de globais mutáveis, arquivos locais, sockets abertos, identidade de objetos, valores aleatórios, relógio real ou outro estado local ao processo para a correção. Sticky pode preservá-los por acaso em uma tarefa e perdê-los diante de uma falha de cache, reinício, atualização ou remoção.

Use [`sideEffect(...)`](/docs/features/side-effects) para valores não determinísticos que precisam ser registrados uma vez e atividades normais para efeitos externos. Consulte [Garantias de execução e idempotência](/docs/constraints/execution-guarantees) para o contrato de replay e histórico durável.