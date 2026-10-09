---
sidebar_position: 10
title: Como funciona
description: Entenda o replay, as atividades e a persistência durável em um aplicativo Laravel.
---

# Como funciona {#how-it-works}

Durable Workflow usa os jobs em fila do Laravel e a persistência baseada em eventos para criar corrotinas duráveis. Funções baseadas em Fibers suspendem os workflows e permitem reconstruir sua execução por replay.

## Runtime {#runtime}

Um workflow é uma classe cujo método `handle()` chama funções como `activity()`, `await()`, `timer()`, `sideEffect()`, `child()` e `all([...])` diretamente, em código sequencial. Cada chamada suspende o workflow até que a etapa durável correspondente termine. A execução então retoma de onde parou, com o resultado registrado.

Cada etapa produz um evento de histórico durável. Sempre que o workflow é reativado, o mecanismo faz replay desse histórico e reconstrói o estado a partir dos eventos antes de executar a próxima etapa pendente. Isso permite sobreviver a reinicializações de workers, implantações e falhas de máquinas sem perder o ponto de execução.

`WorkflowStub::make()` reserva um identificador público de instância. Iniciar o workflow cria a primeira execução e a primeira tarefa de workflow. Cada execução tem seu próprio identificador. Operações como `signal()`, `cancel()` e `terminate()` atuam na execução atual da instância.

## Event sourcing {#event-sourcing}

Event sourcing reconstrói o estado atual a partir de uma sequência de eventos salvos, em vez de salvar o estado diretamente. Isso fornece um histórico completo dos eventos de execução e permite retomar um workflow se o worker falhar.

## Corrotinas {#coroutines}

Corrotinas são funções cuja execução pode ser suspensa e retomada. Os pontos de suspensão duráveis são expressos por chamadas diretas a funções baseadas em Fibers, como `activity()`, `await()`, `timer()` e `sideEffect()`.

O código do workflow fica em `handle()`, um método comum que chama essas funções diretamente. O runtime primeiro verifica se a etapa já terminou de forma durável. Se terminou, devolve o resultado registrado no histórico, sem executar a etapa outra vez. Caso contrário, coloca a próxima atividade, temporizador ou tarefa filha na fila e suspende o workflow até que a etapa termine ou falhe.

## Atividades {#activities}

Um workflow coordena várias atividades e seus resultados. A execução do workflow se alterna com as etapas duráveis que ele agenda: ao chegar a uma chamada de atividade, o workflow suspende a execução até a atividade terminar e então continua de onde parou.

Se um worker de workflow falhar, o replay dos eventos confirmados reconstrói o estado atual. O workflow pode continuar de onde parou, com as mesmas entradas e saídas, preservando o determinismo. Uma falha não tratada no workflow torna a execução terminal. O replay não tenta novamente uma execução que já falhou.

Na v2, atividades comuns são trabalho durável em fila. As
[atividades locais](./features/local-activities.md) executam tarefas curtas no
processo do worker de workflow, preservando o histórico durável e as regras de
novas tentativas. Atividades comuns podem executar em qualquer worker
compatível. As [sessões de workers](./features/worker-sessions.md) adicionam um
lease explícito quando uma sequência de atividades precisa do mesmo recurso
local de um worker. Para registrar um valor uma única vez, de forma segura para
replay e sem colocar uma atividade na fila, use
[`sideEffect(...)`](./features/side-effects.md). Veja o contrato completo em
[Modelo de execução de atividades](./features/activity-execution-model.md).

## Garantias de execução {#execution-guarantees}

O código do workflow e o código da atividade têm regras diferentes para repetição:

- **O código do workflow passa por replay.** A reentrega de uma tarefa de workflow reconstrói o estado a partir do histórico durável e executa novamente o código determinístico de orquestração. O replay não repete efeitos externos já registrados.
- **Atividades são trabalho em fila executado pelo menos uma vez.** Uma atividade lógica pode passar por novas tentativas, ser reentregue após a expiração de um lease ou ser observada novamente após a perda de um worker. Entregas duplicadas são uma condição normal em sistemas distribuídos.
- **A identidade da atividade é durável.** `activity_execution_id` identifica uma execução lógica de atividade ao longo de novas tentativas e reentregas. `activity_attempt_id` identifica uma tentativa individual. Use `activity_execution_id` como chave padrão de idempotência no sistema remoto. Use `activity_attempt_id` apenas quando esse sistema precisa de correlação por tentativa.

Veja o contrato completo da v2 em
[Garantias de execução e idempotência](./constraints/execution-guarantees.md),
[Modelo de execução de atividades](./features/activity-execution-model.md) e
[Falhas e recuperação](./failures-and-recovery.md).

## Filas {#queues}

Jobs em fila são tarefas de segundo plano que executam mais tarde. O Laravel oferece filas com Amazon SQS, Redis ou um banco de dados relacional. Workflows e atividades são jobs em fila, com comportamentos diferentes. Um workflow é despachado várias vezes durante a operação normal: executa, despacha uma ou mais atividades e encerra seu job até que elas terminem. Uma atividade é uma tarefa em fila executada pelo menos uma vez. O caso comum é uma tentativa bem-sucedida, mas novas tentativas, expiração de leases ou perda de um worker podem causar a reentrega da mesma execução lógica de atividade.

## Exemplo {#example}

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, all};

class MyWorkflow extends Workflow
{
    public function handle(): array
    {
        return [
            activity(TestActivity::class),
            activity(TestOtherActivity::class),
            all([
                fn () => activity(TestParallelActivity::class),
                fn () => activity(TestParallelOtherActivity::class),
            ]),
        ];
    }
}
```

## Diagrama de sequência {#sequence-diagram}

Este diagrama mostra a progressão de um workflow por uma série de atividades, tanto em sequência quanto em paralelo.

import ThemedImage from '@site/src/components/ThemedImage';

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf_KMmcTdGOi7iFg2muph4JQvCw6SaTrrl3XtGnIf--qmFakhXZPO2_e9waGuUCuCgQGDb62KHO8L_lB8yqTxL6aa1PmZc2lISnhDUmVftkL9TZvx137CRsT56Y8leY8t-xGy6M5ov7Zl3ijMeGaC4HiFy-dhM6BAUkX223MSGMsOijxwkopI7mqaoEGv5yDrrEW_EzwhNI032N2k5jdf2MSb5LTS_QmDWLizdJ7mf5tKDhw0GUBzOgWHahQV7wr4dJhGdjFVZgBs98C97wVJoNMXi1mV_ysVDWSWrWHI7A9F42t2rrgZryXmwVlgfpOtdIAo14fAewC78BWkbek_ioMgsgLvE0Yrh04dyYrRxENos3GX0V-GFwd-Oinuks_9N1wTV1KLeJS1yJYlEbph-Fq--O9fgJv_eFJ"
  darkLink="https://mermaid.live/edit#pako:eNqdkkFrg0AQhf-KzNmE7Gp0dw8B015LPRSE4mXRSSJR165r2jTkv3ejmDZICu2edr557w0Mc4JM5QgCWnzrsM7wsZBbLau0duxrpDZFVjSyNk7iyNZJlN5vSvU-bUeX9gu2JspMcSjMcSpZj5Jns0N9XxeTURhLLcsSy1-09CZ0ahgsyWy1ioTTGmsdSDSzKBFOpqqmRIPfyoFrbEp5dPCAtWl_xqxvYtb_jYnJTU6P6BUNMCaT9B7Tvw0FF7a6yEEY3aELFepKXko4XWwp2MVVmIKw31zqfQppfbYeu99XparRplW33YHYyLK1Vdfk0ozHcqUa6xz1g-pqAyLwWB8C4gQfIDxO5tT3WBhyEpKAsaULRxCUWMw5DXkQ-B73WXh24bOfu5j7zF-wJSWLgFPuUxa4gHlhlH4ajra_3fMXT1fgqg"
  alt="Diagrama de sequência do workflow"
/>

1. O workflow começa ao ser despachado como um job em fila.
2. A primeira atividade, `TestActivity`, é despachada como um job em fila. O job do workflow então encerra. Quando `TestActivity` termina, salva o resultado no banco de dados e despacha o workflow novamente.
3. O workflow entra no ciclo de replay do event sourcing. Ele consulta os eventos no banco de dados para reconstruir o estado atual. Isso é necessário porque o workflow não mantém um processo em execução contínua. Seu job encerra enquanto as atividades executam e é despachado novamente quando elas terminam.
4. Após o replay dos eventos, o workflow continua para `TestOtherActivity` e a despacha como um job em fila. Quando essa atividade termina, salva o resultado no banco de dados e despacha o workflow novamente.
5. O workflow faz outro replay dos eventos para reconstruir o estado atual.
6. Em seguida, o workflow inicia duas atividades em paralelo, `TestParallelActivity` e `TestParallelOtherActivity`. Ambas são despachadas. Quando terminam, salvam seus resultados no banco de dados e devolvem o controle ao workflow.
7. Por fim, o workflow faz replay dos eventos uma última vez para reconstruir o estado atual e concluir a execução.

## Determinismo {#determinism}

Como o histórico passa por replay sempre que o workflow é reativado, seu código deve produzir os mesmos comandos para o mesmo histórico. Veja [Restrições](./constraints/overview.md) para as regras de código e os recursos que Durable Workflow fornece, como `Workflow\now()`, `sideEffect()` e `getVersion()`, quando o código seria não determinístico.
