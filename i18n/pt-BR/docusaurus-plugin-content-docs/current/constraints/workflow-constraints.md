---
sidebar_position: 2
title: Restrições dos workflows
description: Mantenha o replay determinístico e identifique chamadas inseguras na inicialização da aplicação.
---

# Restrições dos workflows {#workflow-constraints}

Uma classe de workflow não deve depender de estado externo ou de serviços que possam mudar ao longo do tempo. Isso inclui operações que dependam da data e hora atuais, do usuário conectado, de recursos de rede externos ou de qualquer outra fonte de estado variável.

Evite estas operações dentro de uma classe de workflow:

- Não use `Carbon::now()` para obter a data e hora atuais, pois o resultado muda a cada chamada. Use `Workflow\V2\Workflow::now()` ou a função `Workflow\V2\now()`, que retornam o tempo do workflow de forma segura para replay.
- Não use `Auth::user()` para obter o usuário atual, pois o resultado depende de quem está conectado. Passe o usuário como entrada ao iniciar o workflow.
- Não faça chamadas de rede para recursos externos, que podem estar lentos ou indisponíveis em momentos diferentes. Passe os dados necessários como entrada ao iniciar o workflow ou use uma atividade para buscá-los.
- Não use geradores de números aleatórios, exceto dentro de um efeito registrado com `sideEffect`, nem outras fontes de aleatoriedade. Passe os valores aleatórios necessários como entrada ao iniciar o workflow.

## Verificações na inicialização {#boot-time-guardrails}

Quando classes de workflow são registradas em `workflows.v2.types.workflows`, o pacote analisa o código na inicialização da aplicação para identificar chamadas obviamente inseguras para replay, como `Carbon::now()`, `Auth::user()`, `DB::`, `Http::` e `random_int()`. O tratamento dos resultados é definido por `workflows.v2.guardrails.boot`:

| Modo | Comportamento |
| --- | --- |
| `warn` (padrão) | Registra um aviso para cada ocorrência detectada, sem impedir a inicialização. |
| `silent` | Desativa a análise na inicialização. |
| `throw` | Lança uma `LogicException` na primeira ocorrência. Útil em pipelines de CI. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Configure `DW_V2_GUARDRAILS_BOOT=throw` na CI para reprovar builds que introduzam chamadas inseguras para replay. Mantenha `warn` em produção para que uma ocorrência ainda não identificada não bloqueie uma implantação.

Na versão inicial, a análise na inicialização é a única verificação de determinismo que pode bloquear a execução. O runtime não repete esse diagnóstico ao adquirir uma tarefa de workflow. Essa escolha é intencional na 2.0: a análise identifica problemas nos workflows PHP registrados localmente antes da implantação, e o Waterline mostra mudanças na impressão digital da definição em execuções longas, sem tornar a aquisição de tarefas entre builds uma nova fonte de falhas de implantação.

Execuções anteriores ao registro de impressões digitais também seguem uma política conservadora. Se uma execução alcançar um novo ramo de `getVersion()` e seu histórico `WorkflowStarted` for anterior ao registro da impressão digital, o runtime mantém essa execução em `WorkflowStub::DEFAULT_VERSION`, sem presumir que a definição atual é segura. Veja [Versionamento](../features/versioning.md).
