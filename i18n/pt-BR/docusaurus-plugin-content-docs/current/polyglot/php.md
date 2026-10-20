---
sidebar_position: 9
title: SDK PHP
description: Conecte aplicações PHP independentes de framework e workers remotos a um Server sob sua administração ou runtime gerenciado do Cloud.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK PHP Durable Workflow
  - worker PHP remoto
  - cliente PHP do servidor independente
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# SDK PHP {#php-sdk}

Use `durable-workflow/sdk` quando uma aplicação PHP ou worker remoto se
conectar ao Durable Workflow Server independente ou à URL de runtime de um
namespace do Durable Workflow Cloud. Este SDK de primeira parte é independente
de framework: fornece cliente do plano de controle, autenticação, transporte,
codec público de payload, handler de replay e ciclo de vida gerenciado de
worker remoto sem exigir Laravel nem o pacote do motor embarcado.

## Experimentar o playground local da Sample App {#try-the-local-sample-app-playground}

Para o caminho mais curto de autoria sem Cloud, abra a
[branch `main` atual da Sample App no GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
e execute:

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

O playground local gera código-fonte de workflow e atividade pertencente ao
chamador, seleciona os artefatos estáveis atuais e inicia o Server e Waterline
publicados. Ele aguarda um registro de worker cuja identidade, tipo de workflow,
tipo de atividade e fila correspondam ao contrato gerado antes de iniciar o
workflow. O sucesso exige o resultado concluído esperado e o histórico; então
o terminal imprime o link local exato da execução no Waterline e o caminho
para evidências JSON estruturadas.

O início rápido e a referência da API mantidos pelo pacote abaixo continuam
sendo o caminho direto para quem deseja adicionar o SDK a um projeto existente
sem a Sample App.

<ProductPromotion source="docs-v2-php-sdk">
Execute clientes e workers PHP em um namespace gerenciado pelo Cloud com
credenciais separadas com escopo por papel.
</ProductPromotion>

Para integração inicial passo a passo, caminhos de frameworks, testes,
implantação e solução de problemas, use o
[portal do desenvolvedor PHP](https://php.durable-workflow.com/). Para
assinaturas exatas de construtores, tipos de retorno e classes de exceção,
use sua [referência gerada da API](https://php.durable-workflow.com/api/),
separada do portal. O
[contrato legível por máquina](https://php.durable-workflow.com/quickstart-contract.json)
do portal identifica pacote, formatos de runtime, credenciais por papel,
arquivos-fonte distribuídos, resultado esperado e teste de fumaça com artefato
publicado como um único caminho testado.

Clientes do Cloud usam a URL de runtime e o namespace retornados no
provisionamento, com credenciais separadas de cliente e worker. Veja
[Runtime gerenciado do Cloud](/docs/polyglot/cloud-control-plane) para esse
limite de conexão; os exemplos abaixo mostram o mesmo SDK com valores locais
de infraestrutura própria.

Use `durable-workflow/workflow` para o caminho separado de Laravel embarcado,
no qual a aplicação possui o estado de workflow em seu banco existente e
executa trabalho por suas filas Laravel. Veja
[Modos de implantação](/docs/polyglot/deployment-modes/) para a comparação
completa de responsabilidades.

## Requisitos {#requirements}

- PHP 8.1 ou posterior
- Um [Server sob sua administração](/docs/polyglot/server/) acessível ou
  [runtime de namespace do Cloud](/docs/polyglot/cloud-control-plane) provisionado

## Instalar {#install}

Instale o SDK PHP publicado atual. O requisito exato abaixo é gerado pela
fonte de autoridade de artefatos publicados atualizada a partir do registro,
e o Composer registra o pacote resolvido em `composer.lock`:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

O SDK usa o pacote oficial Composer `apache/avro` para o envelope público de
payload. Seu grafo de dependências de produção exclui Laravel, Illuminate,
`durable-workflow/workflow` e `durable-workflow/server`.

## Iniciar e inspecionar um workflow {#start-and-inspect-a-workflow}

O início rápido mantido pelo SDK cria um projeto Composer limpo, define um
workflow e uma atividade com atributos, inicia o worker, inicia um workflow
único e aguarda o resultado. Os mesmos arquivos distribuídos `bootstrap.php`,
`worker.php` e `client.php` são instalados a partir do pacote e executados pelo
teste de fumaça protegido com artefato publicado, portanto esta página não
mantém uma segunda listagem de código.

Escolha apenas o valor da conexão de runtime:

| Runtime | Valor passado a `Client` | Comportamento do caminho de requisição do SDK |
| --- | --- | --- |
| Server sob sua administração | Origem simples como `http://localhost:8080` | Adiciona um segmento `/api`; chamadores não acrescentam `/api`. |
| Durable Workflow Cloud | URI provisionado completo como `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Preserva o caminho de runtime do namespace e acrescenta o endpoint `/api` depois dele. |

Abra o [caminho PHP testado](https://php.durable-workflow.com/) para os
comandos exatos e o código visível. Operações de cliente leem
`DURABLE_WORKFLOW_CLIENT_TOKEN`; o polling do worker lê
`DURABLE_WORKFLOW_WORKER_TOKEN`. O guia mantém essas credenciais em processos
separados sem exibir nem versionar seus valores.

`Worker::register()` descobre handlers `#[Workflow]` e `#[Activity]` no mesmo
arquivo-fonte. O guia também documenta a alternativa direta
`registerWorkflow()`/`registerActivity()` para código orientado a callables.
O bootstrap elimina a escolha do caminho do autoloader pelos usuários quando
esses arquivos distribuídos executam em um projeto independente, checkout do
SDK, pacote instalado ou playground/container que os coloca ao lado de seu
diretório Composer `vendor/`.

`WorkflowHandle` acompanha a execução atual após uma transição de continuar
como novo. Use seus métodos de execução selecionada quando uma operação
precisar permanecer protegida para uma execução específica.

## Ciclo de vida, atualizações, agendamentos e visibilidade {#lifecycle-updates-schedules-and-visibility}

O cliente público atual vai além do tratamento de resultados da execução selecionada:

- `WorkflowHandle` expõe `describe`, `result`, `signal`, `query`, `cancel`
  e `terminate`, com variantes de execução selecionada para segurança específica por execução.
- `Client` expõe `listWorkflows` com filtragem e paginação no servidor,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow` e `terminateWorkflow`.
- `requestCancellation()` solicita limpeza limitada de workers cooperantes.
  `cancel()` e `cancelWorkflow()` existentes fecham a execução imediatamente.
  Veja [cancelamento cooperativo](/docs/polyglot/cancellation) para o contrato
  de autoria e recuperação.
- Métodos de agendamento cobrem criação, descrição, listagem, atualização,
  pausa, retomada, disparo, preenchimento retroativo e exclusão.
- A visibilidade operacional inclui `listNamespaces`, `listWorkers` e
  `listTaskQueues`, com métodos correspondentes de descrição.

Workers remotos registram handlers de workflow, atividade, consulta e
atualização por `registerWorkflow`, `registerActivity`, `registerQuery` e
`registerUpdate`. Use a [referência gerada da API do SDK PHP](https://php.durable-workflow.com/api/)
para parâmetros e tipos de retorno completos.

## Heartbeats de atividade {#activity-heartbeats}

Para atividades remotas, chame `ActivityContext::heartbeat($details)` durante trabalho de atividade limitado, bem antes do tempo limite de heartbeat configurado. A primeira janela começa na reivindicação pelo runtime, não quando o PHP recebe a tarefa. Latência das requisições, pausas e novas tentativas de transporte consomem essa janela. Siga as [orientações de cadência](../features/heartbeats.md#heartbeat-cadence-and-receipts).

O método retorna `void`. No caminho direto do handler, uma resposta de parada lança `ActivityCancelled`. Falhas HTTP e de transporte de `Client::heartbeatActivityTask()` aparecem como `ServerException`. Um worker com supervisão cooperativa pode parar ou abandonar seu callback quando um heartbeat ou uma verificação de posse falha, em vez de entregar uma resposta normal ao código da atividade. Não suponha que a limpeza sempre será executada, não suprima um erro de perda de autoridade nem envie sucesso depois de perdê-la.

O retorno da chamada não confirma trabalho externo nem fornece um checkpoint retomável. Mantenha os efeitos externos idempotentes e não trate uma nova tentativa de transporte como uma nova janela de heartbeat.

## Executar um worker PHP remoto {#run-a-remote-php-worker}

Handlers de workflow são callables comuns executados como código linear
dentro de uma Fiber gerenciada. Chame operações como
`WorkflowContext::activity()` diretamente; o SDK suspende a Fiber em decisões
duráveis e retorna resultados registrados durante o replay sem repetir a
atividade externa. Não declare um workflow como Generator nem use yield com
comandos `WorkflowContext`: resultados Generator são rejeitados. O worker
gerenciado registra seus nomes de tipo de workflow e atividade, faz poll no
protocolo público, envia heartbeats, conclui ou falha tarefas e trata o
encerramento gracioso quando `pcntl` está disponível.

### Seleção da primeira conclusão {#first-completion-selection}

Use `WorkflowContext::select()` para iniciar atividades adiadas independentes,
workflows filhos, temporizadores, esperas por condição ou barreiras comuns
aninhadas e retomar a partir do primeiro vencedor confirmado duravelmente.
O `SelectionResult` retornado contém chaves e identidades estáveis dos membros
e um handle por membro:

```php
$selected = $ctx->select([
    'resolver' => fn () => $ctx->activity('resolve-request', [$requestId]),
    'input' => fn () => $ctx->waitCondition(
        fn (): bool => $this->resolution !== null,
        key: 'resolution-ready',
    ),
    'deadline' => fn () => $ctx->sleep(2),
]);

if ($selected->key === 'deadline') {
    $selected->handles['resolver']->cancel();
}
```

A seleção não cancela os não vencedores. Chame `await()` em um handle para
consumir seu resultado eventual ou `cancel()` para registrar cancelamento
explícito. Um worker frio ou replay de histórico concluído consome o vencedor
registrado mesmo quando eventos de entrada duplicados ou posteriores e eventos
terminais aparecem em outra ordem de entrega. `cancel()` retorna void e não
informa seu resultado terminal. Somente o histórico
`SelectionOperationCancelled` prova que o cancelamento venceu; o replay avança
além de uma solicitação de cancelamento sem marcação e, se a operação concluiu
primeiro, `await()` ainda retorna esse resultado.

## Compatibilidade de entrada e recuperação {#entry-compatibility-and-recovery}

**Preparação de versões ainda não publicadas.** A proteção de entrada do PHP SDK 2.5.4 e o suporte a roteamento/recuperação do Server 2.9.9 foram integrados ao código-fonte, mas ainda aguardam publicação e qualificação dos artefatos instalados.

O worker gerenciado verifica a entrada posicional registrada do handler antes de entrar em sua Fiber. Argumentos obrigatórios ausentes ou tipos PHP declarados incompatíveis geram `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` e o motivo de tarefa `workflow_entry_arguments_mismatch`. Valores padrão opcionais preenchem apenas entradas omitidas; nunca substituem um valor registrado incompatível. Um `TypeError` lançado após a entrada bem-sucedida continua sendo uma falha da aplicação.

O worker anuncia `workflow_entry_arguments_validation` automaticamente. Com o suporte correspondente do Server, a tarefa recusada fica bloqueada para replay e a execução original permanece não terminal. Um runtime antigo pode tentar executar novamente a tarefa com falha, portanto atualizar apenas o SDK não estabelece o contrato completo de recuperação.

Inspecione o original com `Client::describeWorkflow($workflowId, $runId)` e o endpoint de depuração da execução selecionada. Restaure código compatível antes de chamar `Client::repairWorkflow($workflowId, $runId)` e verifique se a mesma execução continua sem alterar entrada, histórico, identidade de roteamento ou prazos. Não capture essa falha dentro do corpo do workflow nem repare repetidamente código incompatível. Consulte o [procedimento de recuperação de serviço](../failures-and-recovery.md#service-entry-recovery) e o [roteamento de definições](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Modo de serviço em frameworks e Laravel embarcado {#framework-service-mode-and-embedded-laravel}

O mesmo pacote distribui integrações de primeira parte para
[modo de serviço Laravel](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
e [modo de serviço Symfony](https://github.com/durable-workflow/sdk-php#symfony-service-mode).
Elas preservam injeção de dependências, configuração, logging, workers de
console e fakes de teste do framework enquanto se conectam ao Cloud ou Server.

Essas integrações são distintas de
[workflows Laravel embarcados](/docs/installation/), nos quais
`durable-workflow/workflow` faz a própria aplicação Laravel possuir o estado
durável e executar pelas filas Laravel. Veja
[Adoção do Laravel e transição de runtime](/docs/laravel-adoption/) para o
mesmo caso de uso representativo em v1, v2 embarcado e nesta integração de
modo de serviço distribuída, incluindo drenagem e rollback. Use
[Modos de implantação](/docs/polyglot/deployment-modes/) para a comparação
mais ampla dos limites de runtime.

## Limite do protocolo e dos releases {#protocol-and-release-boundary}

O SDK declara sua faixa de servidores suportados, versão do protocolo de
workers, versão do plano de controle e codecs de payload nos metadados
Composer. O servidor também publica seu conjunto aceito de protocolos e codecs
em `GET /api/cluster/info`. Verifique a descoberta do runtime na implantação
em vez de deduzir compatibilidade da versão de patch do servidor.

O SDK PHP é versionado independentemente do pacote Laravel. Mantenha a versão
publicada exata fixada nos exemplos executáveis e avalie as notas de release ao
atualizar o SDK. A compatibilidade segue o contrato declarado pelo SDK, não a
igualdade de números de versão entre pacotes.

## Referências relacionadas {#related-references}

- [Server independente](/docs/polyglot/server/)
- [Modos de implantação](/docs/polyglot/deployment-modes/)
- [Protocolo de workers](/docs/polyglot/worker-protocol/)
- [Índice de capacidades](/docs/capabilities/)
- [Portal do desenvolvedor PHP](https://php.durable-workflow.com/)
- [Referência da API PHP](https://php.durable-workflow.com/api/)
- [Contrato executável de início rápido PHP](https://php.durable-workflow.com/quickstart-contract.json)
- [Código-fonte do SDK PHP](https://github.com/durable-workflow/sdk-php)
