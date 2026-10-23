---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - monitoramento de workflows
  - histórico durável
  - telemetria do runtime
  - ações disponíveis no waterline
  - evidências apenas diagnósticas
  - estado de reparo
---

# Monitoramento {#monitoring}

O [Waterline](https://github.com/durable-workflow/waterline) é a interface
visual e API de operação do estado dos workflows. Sua entrega acompanha os
limites do runtime escolhido: o Cloud inclui Managed Waterline, enquanto
o operador auto-hospedado implanta Waterline separadamente se desejar essa interface.

O Waterline é um único produto de operação com três formas de consumo:

- **Modo embutido** instala o pacote Composer na aplicação Laravel
  responsável pelos workflows e lê o estado durável dessa aplicação em processo.
- **Modo de serviço auto-hospedado** executa a imagem publicada
  `durableworkflow/waterline` e lê o estado pertencente ao
  [servidor independente](./polyglot/server.md) por meio do SDK PHP e da API
  pública do servidor. A distribuição do Server não inclui nem opera Waterline.
- **Cloud Managed Waterline** é a experiência de operação limitada por
  namespace incluída no [Durable Workflow Cloud](./polyglot/cloud-control-plane.md).
  O Cloud opera Managed Waterline e o runtime do namespace que o sustenta.

As formas embutida e de serviço auto-hospedado expõem a mesma interface
principal do Waterline e as famílias de rotas de operação `/waterline/api/...`.
O Cloud fornece as capacidades de operação por sua interface gerenciada,
em vez de um host de rotas Waterline implantado pelo cliente. Nenhuma forma
combina estados de runtimes: cada visualização limita-se às execuções
pertencentes ao seu runtime e namespace. Para operar o Server auto-hospedado,
a API nativa, CLI e interfaces operacionais dos SDKs continuam disponíveis
com ou sem Waterline. Use a
[Referência da API do Server](./polyglot/server-api-reference.md) para essas
rotas nativas e a
[Referência da API do operador Waterline](./waterline-operator-api.md) para
as rotas e os contratos de resposta do Waterline.

O Durable Workflow tem dois planos de observabilidade:

| Plano | Fonte de verdade | Perguntas típicas |
| --- | --- | --- |
| Estado durável | Banco de dados e API do runtime responsável pelos workflows, projeções do Waterline e exportação de histórico | O workflow iniciou? Qual execução é a atual? Qual sinal, atualização, temporizador, atividade, nova tentativa ou falha foi confirmado? Qual ação operacional é segura agora? |
| Telemetria de workers/runtime | Logs de workers de fila, registradores de métricas dos SDKs, endpoints Prometheus/OpenMetrics e rastreamentos da aplicação | Os workers consultam tarefas? Quanto tempo as tarefas levam? Há um exportador configurado? As métricas personalizadas da aplicação saíram do processo do worker? |

O Waterline intencionalmente não substitui métricas de workers. Se uma
métrica personalizada foi registrada no código de atividade ou worker,
colete-a no endpoint de telemetria do worker. Use o Waterline para
correlacionar esse sinal do runtime com o histórico durável e o estado atual da execução.

A configuração de workers e clientes também permanece separada da interface
de operação. Use a [referência gerada da API do SDK PHP](https://php.durable-workflow.com/api/),
a [referência da API do SDK Python](https://python.durable-workflow.com/) ou
a [referência da API do SDK Rust](https://rust.durable-workflow.com/) junto
dos guias de linguagem ao conectar clientes de aplicação e workers ao
runtime responsável pelo namespace.

Quando a telemetria dos workers mostrar reservas repetidas, disputas com
conclusões tardias ou leases paradas, leia
[Garantias de execução e idempotência](./constraints/execution-guarantees.md)
junto deste guia. Esse contrato separa a incerteza do transporte pelo menos
uma vez de resultados duráveis duplicados, evitando conclusões operacionais
erradas a partir de evidências que parecem duplicadas.

## Rastreamento com OpenTelemetry {#opentelemetry-tracing}

Conecte requisições da aplicação, tarefas de workflow e tentativas de atividade entre processos com o rastreamento opcional do OpenTelemetry. Escolha a configuração do runtime que gerencia suas execuções.

### Laravel incorporado {#embedded-tracing}

Para relacionar os logs da aplicação a uma execução de workflow e a uma tentativa
de atividade, configure a [integração opcional de rastreamento no modo embutido (em inglês)](https://github.com/durable-workflow/workflow/blob/main/docs/embedded-tracing.md).
Ela preserva o contexto W3C entre workers de fila, novas tentativas e recuperação,
e usa o provedor OpenTelemetry e os canais de log do Laravel da sua aplicação.
O guia explica como habilitar o rastreamento, adicionar o tap de logs, executar
as migrações do esquema e limitar as exportações. Consulte o diagrama de spans
e a matriz de capacidades de runtimes e SDKs antes da implantação.

No arquivo `config/workflows.php` da aplicação, associe uma variável de ambiente controlada pela aplicação à configuração de rastreamento existente:

```php
'tracing' => [
    'enabled' => (bool) env('DW_TRACING_ENABLED', false),
    'baggage_allowlist' => [],
],
```

Este exemplo começa sem baggage. Instale a API opcional e configure o provedor, o tap de logs, as migrações e o exportador com limites conforme o guia vinculado. Depois, reinicie os workers.

### Rastreamento no modo serviço {#service-mode-tracing}

Configure o provedor, a amostragem, os propagadores e a exportação limitada antes de ativar a telemetria do SDK. Consulte o [guia PHP](https://php.durable-workflow.com/operate/tracing/), o [guia Python](https://python.durable-workflow.com/telemetry/) ou a [API Rust](https://rust.durable-workflow.com/durable_workflow/telemetry/) em inglês.

| Runtime | Limite de propagação |
| --- | --- |
| Laravel embarcado | A integração Core opcional preserva o contexto entre os workers de fila da aplicação. |
| Servidor PHP | O [guia do servidor](https://github.com/durable-workflow/server/blob/2.10.0/docs/observability-context.md) exige imagem da aplicação com API opcional, opção ativada e esquema nullable real. |
| SDKs PHP, Python e Rust | Spans opcionais de tarefa/tentativa e correlação de logs com escopo. A propagação durável exige a capacidade exata anunciada pelo servidor. Capacidade ausente ou malformada gera traces de tarefa independentes. |
| Servidor Rust nativo | Esta versão PHP não qualifica carriers nativos nem conversão de catálogo. |
| Cloud | Esta versão não inclui implantação no Cloud. Confirme o suporte do runtime gerenciado. |

IDs de trace, run, atividade, tentativa e requisição permanecem distintos. Baggage usa lista permitida, vazia por padrão; links não contêm baggage. Provedores e exportadores pertencem à aplicação. Encerramento abrupto pode perder telemetria; replay não garante exportação exatamente uma vez. Use o histórico durável para resultados de negócio.

## Visualizações do Waterline {#waterline-views}

### Visão do painel {#dashboard-view}

![Painel do Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

O painel mostra totais em execução, contadores de execuções recentes e
métricas de toda a frota para identificar rapidamente se o trabalho está
fluindo, parando ou falhando.

Use os [Limites operacionais do operador](./operator-operating-envelope.md)
quando precisar do contrato de implantação e procedimentos para esses fatos:
quais diagnósticos bloqueiam tráfego, quais são consultivos, como os fatos
de saúde das filas se dividem entre Waterline e telemetria dos workers,
e como verificar reconstrução, exportação e arquivamento.

### Visão do workflow {#workflow-view}

![Detalhes de workflow no Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

A visão de detalhes do workflow mostra a linha do tempo durável de uma
execução: atividades, sinais, temporizadores e workflows filhos na ordem
em que ocorreram, cada um com entradas, saídas e informações de tempo.

## Implantação e acesso ao Waterline {#waterline-deployment-and-access}

### Laravel embutido {#embedded-laravel}

Instale o Waterline na aplicação Laravel junto com o pacote Workflow
e execute suas migrações. Consulte
[durable-workflow/waterline](https://github.com/durable-workflow/waterline)
para o guia completo de instalação e configuração.

O modo embutido usa a conexão de banco de dados, middleware de rotas,
gate de autenticação e pacote Workflow da aplicação hospedeira. Continue
operando aplicação Laravel, workers de fila, agendador, migrações e assets
do Waterline como um único limite de implantação. A
[Referência da API do operador Waterline](./waterline-operator-api.md#installation)
inclui o comando Composer atual e a etapa de publicação de assets.

### Permissões de operadores no modo integrado {#embedded-waterline-operator-permissions}

Estes controles opcionais exigem **Waterline 2.13.0**. Preserve o gate de visualização `viewWaterline`: gates de ações não concedem acesso de leitura. Por padrão, quem pode visualizar o Waterline integrado pode executar suas ações de operador; as novas opções são explícitas e preservam esse comportamento quando não configuradas.

Para bloquear gravações de operador para todos, defina `'read_only' => true` em `config/waterline.php` ou mapeie `WATERLINE_READ_ONLY=true` pela configuração do host antes de reconstruir o cache. Visualização, exportações de histórico, consultas e visualizações/preferências pessoais mantêm a autorização existente. Isso não interrompe os workers do host nem altera permissões diretas do SDK/Server.

Para separar permissões por usuário, defina gates Laravel em um service provider e mapeie cada grupo de ações que deseja restringir. Os nomes de permissões abaixo pertencem à política do seu aplicativo:

```php
use Illuminate\Support\Facades\Gate;

Gate::define('waterline-messages', fn ($user) => $user->can('support-workflows'));
Gate::define('waterline-operations', fn ($user) => $user->can('operate-workflows'));
```

Incorpore esta configuração a `config/waterline.php`:

```php
'authorization' => [
    'gates' => [
        'messages' => 'waterline-messages',
        'repair' => 'waterline-operations',
        'cancel' => 'waterline-operations',
        'terminate' => 'waterline-operations',
        'archive' => 'waterline-operations',
        'schedules' => 'waterline-operations',
    ],
],
```

`messages` abrange sinais e atualizações; `schedules` abrange pausa, retomada, disparo, backfill e exclusão. Cada gate recebe o usuário atual do host e, opcionalmente, a requisição HTTP como segundo argumento. Um mapeamento nulo ou omitido preserva o acesso padrão. Um gate configurado deve existir e autorizar o usuário; configurações inválidas recusam a ação. As regras normais para convidados e `Gate::before` se aplicam, mas o modo global somente leitura prevalece até sobre exceções de administrador. Nenhum gate ignora restrições de namespace ou runtime.

Implante a configuração resolvida do host e reconstrua o cache com `php artisan config:cache`; mudar apenas o ambiente não atualiza configurações em cache ou literais. Instale o pacote qualificado e publique os assets correspondentes pelas [etapas normais de instalação](./waterline-operator-api.md#installation). Gravações negadas retornam HTTP 403 com `reason=waterline_action_forbidden` ou `reason=waterline_read_only` e uma `capability`. A interface oculta controles de execução indisponíveis e explica ações/controles de agendamento desabilitados; o backend também protege URLs de mutação legadas e de execução exata.

São **controles de usuários do host integrado**. O modo serviço mantém `WATERLINE_ACCESS_MODE=read_only` e permissões do token upstream em vez de gates Laravel do host. O recurso não altera os mínimos de dependências SDK/Core nem configura Cloud Managed Waterline.

### Serviço Waterline {#waterline-service}

A imagem publicada contém seu próprio runtime PHP e Laravel. Ela não exige
PHP, Composer nem o pacote Workflow no host do contêiner, e nunca se conecta
ao banco de dados do servidor independente.

Este exemplo vincula o Waterline ao loopback na porta `8080` do host,
persiste o estado da própria interface em um volume nomeado e o conecta
a um namespace do servidor:

```bash
export WATERLINE_SERVER_ENDPOINT=https://workflow.example.com
export WATERLINE_SERVER_TOKEN=replace-with-a-server-token

docker run --detach \
  --name waterline \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:8080 \
  --volume waterline-data:/data \
  --env WATERLINE_SERVER_ENDPOINT \
  --env WATERLINE_SERVER_TOKEN \
  --env WATERLINE_NAMESPACE=orders \
  --env WATERLINE_ACCESS_MODE=read_only \
  --env WATERLINE_ALLOW_UNAUTHENTICATED=true \
  --env APP_URL=https://waterline.example.com \
  durableworkflow/waterline:%%artifact.waterlineVersion%%
```

Abra `/waterline` pela URL representada por `APP_URL`. A imagem escuta na
porta `8080` do contêiner; defina `PORT` somente quando mudar essa porta
interna deliberadamente. `WATERLINE_PATH` altera o prefixo padrão de URL
`waterline`. O repositório também publica uma
[definição de serviço Docker Compose](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml)
com o mesmo limite de conexão.

O modo de serviço tem duas camadas independentes de autenticação:

1. `WATERLINE_SERVER_TOKEN` é a credencial bearer usada pelo Waterline
   quando o SDK PHP chama `WATERLINE_SERVER_ENDPOINT`. Observar workflows,
   workers, filas e agendamentos exige uma função de operador no servidor;
   saúde e métricas de operação do servidor podem exigir função de administrador.
2. O acesso pelo navegador e pela API do Waterline é o limite de entrada
   da implantação. A imagem autossuficiente não tem o diretório de usuários
   de uma aplicação Laravel hospedeira. Assim,
   `WATERLINE_ALLOW_UNAUTHENTICATED=true` só deve ser usado atrás de um proxy
   reverso com autenticação ou em uma interface privada, como o vínculo
   loopback acima. Mantenha `false` até que esse limite externo de autenticação exista.

Defina `WATERLINE_NAMESPACE` com o namespace que os operadores pretendem
inspecionar. O Waterline o envia em cada requisição do SDK.
`WATERLINE_ACCESS_MODE=read_only` é o padrão e bloqueia ações de mutação
no Waterline; use `operator` somente com um token do servidor autorizado
para os comandos necessários.

O volume `/data` mantém visualizações salvas, preferências de exibição e
estado do runtime Laravel pertencentes ao Waterline. Com os padrões,
contém um banco SQLite em arquivo em `/data/waterline.sqlite`. Ele nunca
contém o histórico de workflows do servidor. Use `DATABASE_URL` ou as
configurações comuns `DB_*` quando o estado do próprio Waterline precisar
ficar em MySQL ou PostgreSQL.

#### Saúde e métricas {#health-and-metrics}

Use estas verificações para perguntas distintas:

| Interface | O que comprova |
| --- | --- |
| `GET /up` | O processo HTTP do Waterline iniciou e responde a requisições. A verificação de saúde Docker da imagem usa essa rota. |
| `GET /waterline/api/v2/health` | O Waterline consegue reunir evidências de saúde do servidor, registro de workers e filas de tarefas, limitadas ao namespace, pelo SDK PHP. |
| `GET /waterline/api/stats` | Totais do painel e o resumo operacional baseado no servidor usado pelo Waterline. |
| `GET /api/system/health` e `GET /api/system/operator-metrics` no servidor | Os contratos nativos de saúde e operação do servidor, independentes do Waterline. |

Trate `/waterline/api/stats` como JSON operacional, não como endpoint de
coleta Prometheus. Métricas dos SDKs de workers, logs, rastreamentos e
telemetria personalizada da aplicação continuam vindo dos processos de
worker. Um `/up` saudável com resposta indisponível de saúde ou estatísticas
do Waterline indica o limite de conexão ao servidor, autorização, namespace
ou capacidade do SDK, e não uma falha no processo do Waterline.

#### Visibilidade de workflows e ações do operador {#workflow-visibility-and-operator-actions}

No modo de serviço, listagens, detalhes da execução selecionada, exportação
de histórico, agendamentos, status de workers, evidências de filas, sinais,
atualizações, consultas, reparo, cancelamento, término forçado e arquivamento
são projetados do servidor independente configurado por meio do SDK PHP.
Os formatos de rotas do Waterline continuam sendo os documentados na
[Referência da API do operador Waterline](./waterline-operator-api.md);
os contratos subjacentes do servidor continuam documentados na
[Referência da API do Server](./polyglot/server-api-reference.md).

O Waterline só mostra o namespace configurado e as execuções pertencentes
ao servidor conectado. Execuções embutidas continuam visíveis na implantação
embutida do Waterline, e execuções gerenciadas pelo servidor permanecem
visíveis na implantação de serviço ou nas interfaces nativas do servidor.
Mudar o backend do Waterline não migra nem combina execuções.

#### Limites do diagnóstico de problemas {#troubleshooting-boundaries}

| Sintoma | Limite a verificar |
| --- | --- |
| O contêiner encerra antes de servir `/up` | Verifique `WATERLINE_SERVER_ENDPOINT` obrigatório, `/data` gravável, `PORT` válido, configurações do banco e logs limitados das migrações de inicialização. |
| O Waterline retorna `401` ou `403` em uma visualização baseada no servidor | Verifique `WATERLINE_SERVER_TOKEN` e sua função no servidor. Uma recusa na entrada do Waterline é um problema separado de proxy ou `WATERLINE_ALLOW_UNAUTHENTICATED`. |
| Uma rota de mutação retorna `waterline_read_only` | Mantenha a implantação somente leitura ou defina explicitamente `WATERLINE_ACCESS_MODE=operator`; o token do servidor ainda precisa autorizar o comando. |
| Os workflows esperados não aparecem | Confirme `WATERLINE_NAMESPACE`, o endpoint do servidor e qual runtime aceitou o início. O Waterline não busca em outros namespaces ou runtimes embutidos. |
| `/up` passa, mas saúde, estatísticas ou uma visualização informa capacidade indisponível | Verifique diretamente o endpoint do servidor pela API ou CLI; depois confira as funções do token e se a combinação publicada Waterline/SDK PHP expõe o método necessário. |
| Uma rota de catálogo de serviços informa `backend_capability_unavailable` | O modo de serviço não replica o catálogo de serviços entre namespaces do Waterline embutido. Use os endpoints e a API nativos de serviços do servidor conectado para essa capacidade. |
| Uma métrica personalizada não aparece no Waterline | Inspecione o exportador de métricas do worker. O Waterline informa fatos duráveis de operação, não métricas arbitrárias de processo. |

### Banner de ambiente {#waterline-environment-banner}

Identifique abas de produção e de outros ambientes com o banner do Waterline. Estas variáveis funcionam no Laravel incorporado e no modo serviço independente:

```dotenv
WATERLINE_ENV_NAME=production
WATERLINE_ENV_COLOR="#dc3545"
```

`WATERLINE_ENV_COLOR` seleciona uma paleta fixa compatível com CSP:

| Valor aceito | Cor do banner |
| --- | --- |
| `#0d6efd` ou `#2563eb` | Azul |
| `#198754` ou `#28a745` | Verde |
| `#6f42c1` ou `#7746ec` | Roxo |
| `#dc3545` | Vermelho |
| `#fd7e14` | Laranja |
| `#ffc107` | Amarelo |

Os demais valores aparecem em cinza neutro, inclusive cores hex válidas como `#ff0000`. Use um valor listado para obter a cor pretendida.

No Laravel incorporado, os valores resolvidos de `env_name` e `env_color` em `config/waterline.php` são a fonte efetiva. A configuração publicada pode substituir os valores baseados no ambiente. Depois de alterá-los, reconstrua o cache de configuração da aplicação pelo processo normal de deploy:

```bash
php artisan config:cache
```

Se o banner diferir de `.env`, inspecione a configuração resolvida do Waterline. O cache continua valendo até ser reconstruído. No modo serviço independente, atualize o ambiente do deploy do Waterline e recrie ou faça novo deploy do contêiner para carregar os valores. São configurações visuais do Waterline; aplique-as ao serviço Waterline descrito acima.

### Cloud Managed Waterline {#cloud-managed-waterline}

Clientes Cloud abrem Cloud Managed Waterline pela interface gerenciada de
operação limitada ao namespace. Eles não implantam nem configuram Waterline,
Server, PHP ou endpoints internos, e não mantêm um segundo login do Waterline.
A imagem auto-hospedada, configurações `WATERLINE_*`, token do Server, banco
de dados e instruções de autenticação de entrada acima não se aplicam a esse caminho.

A autenticação do cliente no Cloud estabelece a identidade do operador.
A autorização na organização, projeto, ambiente e namespace Cloud determina
qual escopo do Waterline gerenciado essa identidade pode abrir. Dentro desse
limite, operadores podem usar listas e busca de workflows, detalhes de
execuções e histórico durável, saúde do namespace e ações operacionais
suportadas por sua função. A interface gerenciada permanece limitada ao
namespace selecionado; ela não combina dados de outros ambientes ou namespaces.

Mutações são controladas por função. O Cloud atribui cada mutação suportada
ao ator Cloud autenticado nos dados de auditoria, enquanto a transição durável
resultante permanece visível no histórico do workflow. Por exemplo, um
arquivamento bem-sucedido recebe atribuição na auditoria Cloud e registra
o evento durável `WorkflowArchived` no histórico. Operadores nunca precisam
de uma credencial privada do runtime ou de conhecer sua implantação interna
para usar essa interface.

## API de listagem e detalhes {#list-and-detail-api}

As listagens do Waterline (`/waterline/api/flows/{bucket}`) e o endpoint de
detalhes da execução selecionada (`/waterline/api/flows/{id}`) retornam
contratos JSON tipados que seus próprios painéis ou scripts podem consumir
diretamente. A [Referência da API do operador Waterline](./waterline-operator-api.md)
documenta endpoints, famílias de campos dos detalhes da execução selecionada,
exportação de histórico, ações disponíveis, agendamentos, visualizações salvas,
preferências e o contrato de ações do operador.

### Contrato de ações disponíveis {#actionability-contract}

O Waterline anota linhas de listagem, respostas de detalhes da execução
selecionada e exportações de histórico com um contrato versionado de ações
disponíveis. Consumidores devem tratar
`actionability_contract.schema = waterline.actionability` e
`actionability_contract.version = 1` como o identificador do contrato dos campos abaixo.

O `actionability` no nível da execução informa se a execução selecionada pode ser reparada:

| Campo | Significado |
| --- | --- |
| `repair_state` | Um de `repairable`, `blocked`, `not_needed` ou `unknown`. |
| `repairable` | Atalho booleano para `repair_state = repairable`. |
| `blocked_reason` | Código estável do motivo quando `repair_state = blocked`. |
| `status_bucket` | Categoria do Waterline que definiu a decisão no nível da execução. |
| `closed_reason` | Motivo durável de encerramento quando a execução está fechada. |
| `task_problem` | Se o Waterline identificou um problema de tarefa na execução. |
| `diagnostic_only_evidence` | Verdadeiro quando ao menos uma linha de evidência filha é informativa, mas não é uma fonte para retomada. |

Linhas de evidência em `activities`, `waits`, `timers`, `exceptions`, `logs`
e entradas da linha do tempo/exportação também podem incluir seu próprio
bloco `actionability`:

| Campo | Significado |
| --- | --- |
| `state` | `actionable` quando a linha é uma fonte válida de reparo; caso contrário, `diagnostic_only`. |
| `repair_source` | Verdadeiro somente para linhas sustentadas por uma fonte normativa reparável. |
| `diagnostic_only` | Verdadeiro quando a linha não pode ser usada como fonte para retomada. |
| `history_authority` | Fonte normativa, como `typed_history`, `mutable_open_fallback`, `failure_row_fallback` ou `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Código estável do motivo de ausência de suporte ao histórico alternativo. |

A automação deve condicionar as opções de reparo, retomada e replay a
`actionability.repair_state`, `actionability.repairable` e ao
`actionability.repair_source` de cada linha. Uma linha com
`diagnostic_only = true` nunca é uma fonte durável para retomada, mesmo com
metadados úteis de falha ou alternativa. Linhas com
`history_authority = unsupported_terminal_without_history` são apenas
evidências diagnósticas: explicam o bloqueio, mas não comprovam histórico
tipado suficiente para reconstruir o progresso com segurança.

## Ações do plano de controle pelo Waterline {#control-plane-actions-from-waterline}

Operadores podem cancelar, terminar, reparar e arquivar workflows diretamente
na visão de detalhes. Cada ação corresponde a um `POST` no mesmo ID de
execução e retorna `200` com o estado resultante ou `409` quando a ação
não é válida para o estado atual da execução.

No modo de serviço, o Waterline encaminha os comandos suportados pelo SDK PHP.
Mutações exigem tanto `WATERLINE_ACCESS_MODE=operator` quanto uma credencial
do servidor autorizada para o comando. Operadores sempre podem usar diretamente
a API do servidor ou CLI quando o Waterline não estiver implantado.

No Cloud Managed Waterline, a função no Cloud e a autorização de namespace
controlam cada mutação suportada, e a identidade Cloud autenticada fornece
a atribuição na auditoria. Clientes não configuram uma credencial
Waterline-Server para a interface gerenciada.

## Guias relacionados {#related-guides}

- [Garantias de execução e idempotência](./constraints/execution-guarantees.md)
  explica o contrato de replay, novas tentativas, expiração de leases e
  resultados duráveis que determina as evidências operacionais.
- [Limites operacionais do operador](./operator-operating-envelope.md)
  reúne saúde, estado de filas, reconstrução, exportação, arquivamento e
  expectativas de topologia em um único contrato operacional.
- [Falhas e recuperação](./failures-and-recovery.md) explica esgotamento
  de tentativas, falhas não repetíveis, tempos limite e comportamento de
  reparo por trás dos fatos mostrados no painel.
- [Desenvolvimento assistido por IA](./ai-assisted-development.md)
  identifica os contratos Waterline, CLI, MCP e legíveis por LLM que os
  agentes devem usar para diagnosticar estado de workflows.
