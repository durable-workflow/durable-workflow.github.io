---
sidebar_position: 8
tags:
  - sample-app
  - Laravel
  - message-streams
  - Waterline
keywords:
  - aplicativo de exemplo
  - consumidor Laravel
  - exemplo de workflow com IA
  - painel Waterline
---

# Aplicativo de exemplo {#sample-app}

https://github.com/durable-workflow/sample-app

Esta é a galeria do modo Laravel embutido: uma aplicação de exemplo em
Laravel 13 baseada na linha estável Durable Workflow 2.0, com workflows que
você pode executar em um GitHub Codespace. É o ponto de partida adequado
quando seu modelo de implantação é **Laravel embutido** e você quer
inspecionar a execução de filas Laravel junto com o Waterline.

Escolha os exemplos que correspondem ao seu runtime:

| Modelo de implantação | Caminho de exemplos |
| --- | --- |
| Durable Workflow Cloud | Comece com [Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane/) e depois escolha o guia do SDK PHP, Python ou Rust usando as credenciais do namespace provisionado. Usuários do Cloud não executam Server. |
| Modo de serviço auto-hospedado | Use o [Quickstart do Durable Workflow 2.0](/docs/quickstart/) para exemplos completos de PHP, Python e Rust com artefatos publicados contra um Server local. |
| Laravel embutido | Continue com esta galeria e a [Instalação embutida](/docs/installation/). |

A galeria é evidência de ponta a ponta da engine hospedada no Laravel,
não uma aplicação inicial universal para implantações poliglotas ou no
modo de serviço. É o primeiro local onde recursos embutidos recebem
cobertura realista em Laravel e a fonte espelhada por este site ao mostrar
um padrão nativo de Laravel. Se tiver um padrão de durable-workflow para
compartilhar, o guia [Contribua com um exemplo](/docs/contribute-a-sample)
explica o processo de envio.

> Procura a versão Laravel 12 / Durable Workflow 1.x? Ela está preservada na [branch `Laravel-12`](https://github.com/durable-workflow/sample-app/tree/Laravel-12). Artigos e tutoriais antigos que usam padrões v1 (por exemplo, `Workflow\Workflow`, `yield activity(...)`, `Workflow\Activity`) destinam-se a essa branch.

## Galeria de exemplos {#sample-gallery}

Cada entrada da galeria identifica o padrão ensinado, a classe de workflow
que o exercita, o comando artisan que o executa e a tela do Waterline que
comprova a execução confirmada. A galeria espelha o "Sample Index" do README
do repositório sample-app; quando um exemplo é incorporado ou movido,
o README e esta galeria são atualizados em conjunto.

| Padrão | Classe de workflow | Comando | Tela do Waterline |
|---------|----------------|---------|------------------|
| Menor workflow determinístico v2 | `App\Workflows\Simple\SimpleWorkflow` | `php artisan app:workflow` | Lista de execuções → detalhes com dois eventos de atividade e um evento `WorkflowCompleted` |
| Medição durável de tempo decorrido sem divergência no replay | `App\Workflows\Elapsed\ElapsedTimeWorkflow` | `php artisan app:elapsed` | Detalhes com dois eventos `SideEffectRecorded` para leituras do relógio por `sideEffect`, antes e depois de um evento `TimerFired` |
| Coordenação entre aplicações Laravel | `App\Workflows\Microservice\MicroserviceWorkflow` | `php artisan app:microservice` | Detalhes com eventos de atividade e roteamento por fila de tarefas entre workers da aplicação e do microsserviço |
| Automação de navegador com captura de artefatos | `App\Workflows\Playwright\CheckConsoleErrorsWorkflow` | `php artisan app:playwright` | Detalhes com a atividade Playwright, a atividade FFmpeg e a atividade de limpeza, nessa ordem |
| Workflow iniciado por webhook com espera por sinal | `App\Workflows\Webhooks\WebhookWorkflow` | `php artisan app:webhook` | Detalhes com `WorkflowStarted` da entrada por webhook e um evento `SignalReceived` para `ready` |
| Laço de atividade de IA com novas tentativas/validação duráveis | `App\Workflows\Prism\PrismWorkflow` | `php artisan app:prism` | Detalhes com tentativas repetidas de atividade e o `ActivityCompleted` que satisfaz o validador |
| Agente de IA orientado por sinais com compensação de saga | `App\Workflows\Ai\AiWorkflow` | `php artisan app:ai` | Detalhes com referência a fluxo de mensagens, histórico de atualizações e atividades de compensação registradas após falha da saga |

A coluna de telas do Waterline identifica os eventos esperados em uma
execução saudável; se algum estiver ausente na execução local, essa lacuna
é a forma mais rápida de localizar um problema no worker ou ambiente.

## Links cruzados para páginas de padrões {#pattern-page-cross-links}

As páginas de padrões deste site apontam diretamente para o workflow de
exemplo que exercita cada recurso. Use a tabela para ir da página de um
padrão ao workflow executável correspondente.

| Página do padrão | Workflow de exemplo |
|--------------|-----------------|
| [Sagas](/docs/features/sagas) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Sinais](/docs/features/signals) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Fluxos de mensagens](/docs/features/message-streams) | `App\Workflows\Ai\AiWorkflow` (`php artisan app:ai`) |
| [Workflows filhos](/docs/features/child-workflows) | Ainda não há uma entrada específica na galeria. Use o guia de workflows filhos. |
| [Efeitos colaterais](/docs/features/side-effects) | `App\Workflows\Elapsed\ElapsedTimeWorkflow` (`php artisan app:elapsed`) |
| [Webhooks](/docs/features/webhooks) | `App\Workflows\Webhooks\WebhookWorkflow` (`php artisan app:webhook`) |
| [Workflows MCP](/docs/mcp-workflows) | todas as entradas da galeria, expostas por `config/workflow_mcp.php` |


**Etapa 1**

Crie um codespace a partir da branch main deste repositório.

![Criação do codespace](https://user-images.githubusercontent.com/1130888/233664377-f300ad50-5436-4bb8-b172-c52e12047264.png)

**Etapa 2**

Após criar o codespace, aguarde sua construção. Isso deve levar de 5 a 10 minutos.

**Etapa 3**

Quando estiver pronto, você verá o editor e o terminal na parte inferior.

![Editor e terminal do codespace](https://user-images.githubusercontent.com/1130888/233665550-1a4f2098-2919-4108-ac9f-bef1a9f2f47c.png)

**Etapa 4**

Execute composer install.

```bash
composer install
```

**Etapa 5**

Execute o comando init para configurar a aplicação, instalar dependências
adicionais e executar as migrações.

```bash
php artisan app:init
```

O caminho `php artisan migrate` do aplicativo de exemplo carrega diretamente
as migrações dos pacotes Workflow e Waterline. Assim, todas as tabelas e
visualizações salvas do Waterline ficam prontas após a instalação normal.

**Etapa 6**

Inicie o worker de fila. Isso habilita o processamento de workflows e atividades.

```bash
php artisan queue:work
```

Para comprovar o próprio ciclo de reparo sem esperar um worker ocupado
chegar a outro ciclo `Looping`, execute uma varredura explícita de
recuperação em um segundo terminal:

```bash
php artisan workflow:v2:repair-pass
```

Esse comando usa a mesma política de varredura e intervalo entre tentativas
do laço do worker. Ele é útil após corrigir um problema local de fila/backend,
ao validar uma tarefa perdida no aplicativo de exemplo ou quando um codespace
com pouco tráfego demoraria para fazer outra passagem do laço. Adicione
`--run-id=...` para limitar a varredura a uma ou mais execuções selecionadas
durante um experimento, ou `--instance-id=...` para incluir a instância inteira.

**Etapa 7**

Crie uma nova janela de terminal.

![Novo terminal](https://user-images.githubusercontent.com/1130888/233666917-029247c7-9e6c-46de-b304-27473fd34517.png)

**Etapa 8**

Inicie o workflow de exemplo na nova janela de terminal.

```bash
php artisan app:workflow
```

**Etapa 9**

Você pode abrir o painel Waterline em https://[your-codespace-name]-80.preview.app.github.dev/waterline/dashboard.

![Painel Waterline no codespace](https://user-images.githubusercontent.com/1130888/233669600-3340ada6-5f73-4602-8d82-a81a9d43f883.png)

O Waterline é a visão do estado durável. Ele informa se um workflow iniciou,
qual execução é a atual, quais eventos tipados foram confirmados, quais
esperas estão abertas e quais ações operacionais estão disponíveis. A
telemetria dos workers é separada: latência de poll, duração de tarefas,
configuração de exportadores, métricas personalizadas e erros do processo
vêm dos logs do worker PHP ou do endpoint de métricas do SDK de um worker externo.

| Interface | Responde sobre | Verificação no exemplo |
| --- | --- | --- |
| Waterline e exportação de histórico | Status durável do workflow, histórico, novas tentativas, esperas, sinais, atualizações, falhas e ações do operador | Abra `/waterline/dashboard` e exporte o histórico da execução selecionada |
| Logs de workers | Erros do processo de worker de fila PHP e linhas de log da aplicação | Acompanhe `storage/logs/laravel.log` enquanto `php artisan queue:work` executa |
| Métricas dos SDKs | Contagem de requisições de workers/clientes externos, latência de poll e duração de tarefas | Colete o endpoint Prometheus/OpenMetrics do worker do SDK |

Para um worker Python, instale o extra Prometheus e exponha as métricas
a partir do próprio processo do worker:

```bash
pip install 'durable-workflow[prometheus]'
```

```python
from prometheus_client import start_http_server

from durable_workflow import Client, PrometheusMetrics, Worker

metrics = PrometheusMetrics()
start_http_server(9102)

async with Client("http://localhost:8080", token="secret", metrics=metrics) as client:
    worker = Worker(
        client,
        task_queue="default",
        workflows=[GreeterWorkflow],
        activities=[greet],
        metrics=metrics,
    )
    await worker.run()
```

Substitua `GreeterWorkflow` e `greet` pelos handlers de workflow e atividade
registrados nesse worker.

Colete `:9102/metrics` para as séries `durable_workflow_worker_*` e
`durable_workflow_client_*`. Essas métricas explicam o desempenho do runtime
do worker; o Waterline continua sendo a fonte de verdade do histórico confirmado.

A tela de detalhes do Waterline inclui a ação "Exportar histórico" para a
execução selecionada. Quando mostra a execução atual da instância, esse botão
usa a rota de exportação da execução atual no escopo da instância; detalhes
de execuções históricas continuam usando o caminho explícito
`/runs/{runId}/history-export`. Você também pode exportar o mesmo pacote
de replay/depuração pelo terminal do aplicativo de exemplo:

```bash
php artisan workflow:v2:history-export {workflow-instance-id} --run-id={workflow-run-id} --output=storage/app/workflow-history/example.json --pretty
```

A exportação inclui uma soma de verificação de integridade SHA-256. Defina
`DW_V2_HISTORY_EXPORT_SIGNING_KEY` e `DW_V2_HISTORY_EXPORT_SIGNING_KEY_ID`
no ambiente da aplicação quando outro sistema precisar verificar o pacote
exportado com uma assinatura HMAC.

O bloco exportado `selected_run` inclui `waits_projection_source`,
`timeline_projection_source`, `timers_projection_source` e
`lineage_projection_source`. O bloco `links` exportado também inclui
`projection_source`, e as seções `links.parents` / `links.children` vêm
primeiro do histórico tipado de linhagem da execução selecionada. Assim,
as relações de workflows filhos e continue-as-new continuam visíveis no
pacote mesmo se linhas mutáveis de vínculos divergirem em um experimento
local. Quando uma linha de linhagem só sobrevive por dados antigos de
compatibilidade mutáveis, o pacote marca a entrada com
`history_authority = mutable_open_fallback` e `diagnostic_only = true`,
em vez de reconstituir silenciosamente metadados adicionais de vínculos na exportação.

## Fluxos de mensagens de workflows de IA {#ai-workflow-message-streams}

Workflows com entradas repetidas de IA ou pessoas devem usar a fachada
v2 de fluxos de mensagens como seu padrão de autoria:

```php
$reply = $this->inbox('ai.assistant')->receiveOne();

$this->outbox('ai.assistant')->sendReference(
    targetInstanceId: $this->workflowId(),
    payloadReference: $storedReplyReference,
    correlationId: $requestId,
);
```

Mantenha o armazenamento de payloads na aplicação para corpos grandes de
requisição/resposta e passe a referência armazenada pelo fluxo. Não ensine
novos workflows de exemplo a gravar diretamente em `workflow_messages`,
`MessageStreamCursor` ou a chamar `MessageService` diretamente. Consulte
[Fluxos de mensagens](/docs/features/message-streams) para o contrato estável
v2 de inbox/outbox.

**Etapa 10**

Execute os testes de workflows e atividades.

```bash
vendor/bin/phpunit
```

Pronto! Agora você pode criar e testar workflows.

## Servidor MCP para clientes de IA {#ai-client-mcp-server}

O aplicativo de exemplo também expõe um servidor MCP Laravel em
`/mcp/workflows`. Essa é a interface de referência para clientes de IA
do Durable Workflow v2: oferece descoberta estruturada de workflows,
início, status, saída, histórico tipado recente e fatos de falha sem
exigir extração de dados da interface do Waterline.

Para os detalhes do endpoint e do contrato das ferramentas MCP, consulte
[Interface MCP para workflows](/docs/mcp-workflows). Para o contrato mais
amplo de desenvolvimento assistido por IA, incluindo manifestos LLM v2,
códigos de saída da CLI, exportações do Waterline e referências de SDKs,
consulte [Desenvolvimento assistido por IA](/docs/ai-assisted-development).

O pacote Laravel MCP registra o servidor em `routes/ai.php`. As chaves de
workflows expostos ficam em `config/workflow_mcp.php`; cada entrada pode
incluir a classe de workflow e metadados de descoberta, como descrição,
requisitos de credenciais e argumentos esperados.

Ferramentas padrão:

| Ferramenta | Finalidade |
| --- | --- |
| `list_workflows` | Lista chaves de workflows configurados, requisitos de credenciais, valores de status v2 e, opcionalmente, execuções recentes. |
| `start_workflow` | Inicia um workflow v2 configurado e retorna `workflow_id`, `run_id`, status, chave de negócio e resultado do comando. |
| `get_workflow_result` | Consulta periodicamente a execução atual ou selecionada e retorna status, saída, metadados de visibilidade e resumo da falha mais recente. |
| `get_workflow_history` | Retorna um trecho final limitado dos eventos tipados do histórico v2 e das falhas duráveis mais recentes para depuração. |
| `diagnose_workflow` | Classifica uma execução selecionada com fatos estruturados, causa raiz, remediação e próximas ações. |
| `repair_workflow` | Solicita o comando de reparo integrado da v2 e retorna um resultado estruturado de mutação aceita, recusada ou desnecessária. |

Um ciclo típico de agente é:

```json
{"tool": "list_workflows", "arguments": {"show_recent": true, "limit": 5}}
{"tool": "start_workflow", "arguments": {"workflow": "simple", "business_key": "demo-001"}}
{"tool": "get_workflow_result", "arguments": {"workflow_id": "<workflow_id>"}}
{"tool": "get_workflow_history", "arguments": {"run_id": "<run_id>", "limit": 25}}
```

Use `simple` ou `elapsed` para verificações básicas sem credenciais. O
workflow `prism` é exposto intencionalmente como exemplo de IA, mas exige
`OPENAI_API_KEY` para que um worker consiga concluí-lo.
