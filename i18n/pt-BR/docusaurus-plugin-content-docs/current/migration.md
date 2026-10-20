---
sidebar_position: 13
title: Migrando para 2.0
description: Atualize uma aplicação Laravel Workflow v1 existente para o Durable Workflow v2.
tags:
  - migration
  - upgrade
  - v2
keywords:
  - migrar para Durable Workflow v2
  - atualização do Laravel Workflow
  - migração do esquema v2
  - workflow v1 para v2
---

# Migrando para 2.0 {#migrating-to-20}

Este guia abrange as principais mudanças ao atualizar uma aplicação Laravel v1 existente para v2.
Primeiro, escolha se o Laravel continuará responsável pelo runtime ou se
conectará ao Cloud ou a um Server sob sua administração pelo SDK PHP no
[guia de adoção no Laravel e transição de runtime](/docs/laravel-adoption/).
Esta página apresenta então o procedimento detalhado do pacote integrado da v1 para v2.

## Procedimento de atualização {#upgrade-procedure}

### Antes de atualizar {#before-upgrading}

**1. Faça um inventário de todos os armazenamentos de execução da v1**

O estado de execução da v1 não está necessariamente restrito ao banco de dados
de workflows. Além dos registros e do histórico de workflows, jobs de filas
Laravel podem estar prontos, atrasados ou reservados no Redis, em um banco de
dados de fila, no SQS ou em outro backend de fila. Registre todos os itens
a seguir antes de alterar o código:

- a conexão de armazenamento de workflows e os mapeamentos reais de modelos/tabelas da v1
- todas as conexões e nomes de filas usados por workflows e atividades da v1,
  incluindo substituições por workflow ou atividade
- banco de dados, prefixo de chaves, região, conta e outras configurações de
  roteamento do backend de fila necessárias para restaurar as mesmas filas
- a referência no gerenciador de segredos e a versão imutável que recuperam
  a `APP_KEY` exata, além de qualquer armazenamento de cache usado para locks
  de jobs únicos da v1

Não copie para esse inventário o valor de `APP_KEY`, credenciais de recuperação
do gerenciador de segredos, credenciais de banco de dados ou do provedor de
filas. Jobs criptografados e argumentos serializados de workflow exigem a chave
original, mas o manifesto de recuperação deve conter apenas sua referência e
versão no gerenciador de segredos. Mantenha as credenciais que recuperam essa
chave com controle de acesso separado dos backups de SQL e filas.

As tabelas padrão da v1 são `workflows`, `workflow_logs`, `workflow_signals`,
`workflow_timers`, `workflow_exceptions` e `workflow_relationships`.
Arquivos publicados de `config/workflows.php` podem substituir
`stored_workflow_model`, `stored_workflow_log_model`,
`stored_workflow_signal_model`, `stored_workflow_timer_model` ou
`stored_workflow_exception_model`. Um modelo substituto também pode alterar
sua `$table` do Eloquent. `workflow_relationships_table` controla separadamente
a tabela de relações. Faça backup das tabelas e da conexão de armazenamento
resolvidas por esses modelos configurados, não apenas as tabelas com os nomes padrão.

**2. Escolha uma fronteira de reversão e deixe o trabalho da v1 quiescente**

Impeça novos inícios de workflow e sinais enquanto captura o ponto de
recuperação. Pause agendadores e pare todos os workers que possam consumir as
filas inventariadas após a conclusão do job atual. Por exemplo:

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

`php artisan queue:restart` sozinho não deixa o sistema quiescente quando
Supervisor, systemd, Kubernetes ou outro gerenciador de processos inicia um
worker substituto imediatamente. Confirme que nenhum consumidor pode reservar
outro job antes de capturar o estado.

Escolha e registre uma destas políticas:

- **Concluir a v1:** bloqueie novos trabalhos da v1, mantenha seus workers
  executando até que `php artisan workflow:v1:list` (quando disponível) ou uma
  consulta equivalente à tabela configurada de workflows armazenados não indique
  workflows não terminais. Então pare os workers e confirme que as filas
  relevantes não têm jobs v1 prontos, atrasados ou reservados. A reversão apenas
  com SQL pode abranger esses workflows v1 terminais.
- **Preservar a v1 em andamento:** pare workers nos limites de jobs e capture
  um snapshot consistente para a aplicação de SQL e de todos os backends
  duráveis de fila. O snapshot de filas deve incluir trabalho pronto, atrasado
  e reservado, e deve vir do mesmo ponto de recuperação que o SQL. Espere um
  job reservado terminar antes do corte, a menos que o backend documente como
  restaurar sua mensagem e lease com segurança.
- **Aceitar perda do trabalho em andamento:** se o backend não puder fornecer
  um ponto restaurável das filas, registre os IDs de workflows afetados e aceite
  explicitamente que execuções não terminais dependentes de filas não podem
  ser recuperadas por essa reversão. Exclua dessa classificação um registro
  `pending` elegível apenas após comprovar o caminho do Watchdog abaixo, e
  exclua uma espera genuína apenas por sinal somente após testar sua entrada
  preservada. Não apresente outro registro SQL como trabalho recuperável.

Uma espera apenas por sinal pode legitimamente não ter job em fila se sua
entrada externa de sinais continuar disponível após a reversão. Novas tentativas
de atividades e temporizadores dependem de filas: um registro em
`workflow_timers` ou um registro de espera em `workflows` não recria um job
atrasado ausente.

A v1.0.77 suportada também inicia seu `Workflow\Watchdog`, habilitado por padrão,
pelo laço do worker de fila. O Watchdog pode encontrar um workflow `pending`
cujo `updated_at` tenha pelo menos cinco minutos e cujos `arguments` serializados
estejam presentes, e então redespachá-lo para a conexão e fila registradas.
Esse é um caminho limitado de reativação exclusivo de pendências, não um
substituto do backup de filas. Você só pode depender dele depois que evidências
em homologação mostrarem o laço do worker v1 restaurado despachando o Watchdog,
o Watchdog redespachando um registro `pending` antigo e elegível e o workflow
avançando na fila esperada. Ele não recria novas tentativas de atividades nem
jobs de temporizador, e não recupera registros `waiting` ou `running`. Esses
estados ainda precisam do job de fila preservado ou de um caminho externo de
sinal válido quando o workflow realmente aguarda um sinal.

**3. Faça backup do conjunto de recuperação para reversão**

Crie um backup completo do banco de dados antes de atualizar:

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

Então preserve o estado das filas conforme o backend:

- **Fila de banco de dados:** inclua as tabelas de fila e sua conexão no mesmo
  ponto de recuperação. Elas podem estar fora do banco de workflows.
- **Fila Redis:** use um snapshot ou backup restaurável do Redis que inclua o
  banco/prefixo exato da fila e suas chaves de trabalho pronto, atrasado e
  reservado. Se o mesmo banco Redis contiver locks de jobs únicos necessários
  ao ponto de recuperação, preserve essas chaves também. Prefira um banco ou
  instância dedicado a filas. Restaurar um snapshot Redis compartilhado pode
  retroceder dados não relacionados da aplicação.
- **SQS ou outra fila gerenciada:** use restauração de mensagens em um ponto
  no tempo suportada pelo provedor apenas se ela preservar de forma consistente
  mensagens disponíveis, atrasadas e em andamento. O SQS não fornece um
  snapshot arbitrário de fila para este procedimento, então conclua o trabalho
  da v1 ou classifique o trabalho v1 restante dependente de filas como
  irrecuperável. As únicas exceções apenas com SQL são um registro `pending`
  comprovadamente elegível ao Watchdog e uma espera apenas por sinal testada.

Armazene juntos o backup SQL, o backup de filas, o inventário sem segredos e a
data/hora de recuperação. Esse manifesto pode indicar a referência e versão de
`APP_KEY` no gerenciador de segredos, mas não deve conter a chave nem credenciais
capazes de recuperá-la. Mantenha as credenciais de recuperação do gerenciador de
segredos, banco de dados, provedor de filas e backups com controles de acesso
separados. Restaurar SQL de um ponto e filas de outro não é uma reversão
suportada de trabalho em andamento.

**4. Teste primeiro em homologação**

**Não atualize produção sem testar em homologação.** A atualização inclui:

- Alterações no esquema do banco de dados (o núcleo durável da v2 adiciona
  tabelas. A quantidade exata é a que `php artisan migrate` aplica, e uma
  migração consolidada futura pode reunir os arquivos por recurso)
- Alterações de namespace que exigem atualizações de código
- Reinício de workers de fila (breve interrupção)
- Validação de capacidades do backend

**Lista de verificação de testes em homologação:**

- [ ] Implante o código v2 no ambiente de homologação
- [ ] Execute as migrações no banco de dados de homologação
- [ ] Reinicie os workers de fila
- [ ] Execute `php artisan workflow:v2:doctor --strict`
- [ ] Inicie um novo workflow v2 e verifique se ele conclui
- [ ] Verifique se workflows v1 (se houver) continuam concluindo
- [ ] Verifique se o Waterline mostra workflows v1 e v2
- [ ] Execute a suíte de testes da aplicação
- [ ] Verifique se não há erros nos logs

Prossiga para produção somente depois que a validação em homologação passar.

### Etapas de atualização {#upgrade-steps}

**1. Atualize a dependência Composer**

```bash
composer require %%artifact.workflowComposerPackage%%
```

O pacote Composer mantido é `durable-workflow/workflow` tanto para v1 quanto
para v2. Este comando altera sua restrição de versão para o artefato público v2
atual fixado. O nome antigo `laravel-workflow/laravel-workflow` é apenas um alias
de compatibilidade para grafos de dependências criados antes da renomeação do
pacote. Use o nome mantido para novos requisitos e reversão. O artefato público
atual fixado indica o pacote estável 2.0. Use `durable-workflow/workflow:^2.0`
quando quiser que o Composer aceite automaticamente atualizações compatíveis de 2.x.

**2. Execute as migrações do banco de dados**

```bash
php artisan migrate
```

A v2 adiciona as tabelas do núcleo durável que sustentam o contrato de recursos
da v2. As migrações atuais por recurso criam:

- Núcleo: `workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `workflow_commands`
- Atividade: `activity_executions`, `activity_attempts`
- Recursos: `workflow_updates`, `workflow_signal_records`, `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_lineage_entries`, `workflow_schedules`, `workflow_schedule_history_events`
- Observabilidade: `workflow_run_summaries`, `workflow_failures`, `workflow_links`, `worker_compatibility_heartbeats`
- Temporizadores: `workflow_run_timers`, `workflow_run_timer_entries`
- Busca / memo / mensagem / filho: `workflow_search_attributes`, `workflow_memos`, `workflow_messages`, `workflow_child_calls`
- Catálogo de serviços: `workflow_service_endpoints`, `workflow_services`, `workflow_service_operations`, `workflow_service_calls`

Uma migração consolidada futura pode reuni-las em menos arquivos sem alterar o
contrato durável. A forma suportada de saber o que seu banco de dados realmente
contém é executar `php artisan migrate:status` após a atualização.

As tabelas padrão da v1 (`workflows`, `workflow_logs`, `workflow_signals`,
`workflow_timers`, `workflow_exceptions` e `workflow_relationships`) são
preservadas para a conclusão de execuções na v1. Se os modelos v1 configurados
substituírem suas tabelas ou conexão de armazenamento, essas tabelas configuradas
passam a ser a fonte de verdade da v1.

**3. Atualize a configuração (se necessário)**

A configuração da v2 é compatível com versões anteriores. Se você publicou `config/workflow.php` na v1, ele continuará funcionando. Novas opções da v2 incluem:

- `durable_types`: aliases de tipo para referências de workflow independentes de linguagem
- `task_repair_policy`: como tratar tarefas presas
- `backend_capability_check`: validação estrita ou permissiva
- `projection_rebuild`: estratégias de reconstrução de histórico
- `history_budget`: limites de contagem de eventos para continuar como nova execução

Essas opções têm padrões adequados. Configure-as apenas se precisar de comportamento diferente do padrão. Consulte [Configuração](/docs/configuration/options/) para detalhes.

**O codec padrão de payload mudou para `avro`.** A v1 usava por padrão `Workflow\Serializers\Y::class`, exclusivo de PHP. A v2 usa por padrão o codec `avro`, independente de linguagem, para que workers Python, Go e TypeScript possam decodificar payloads sem um runtime PHP compartilhado. `avro` é o único codec suportado para novos workflows v2. Novos workflows v2 iniciados por você serão marcados com `payload_codec = "avro"`.

Se você tem um `config/workflows.php` publicado da v1 com `'serializer' => Workflow\Serializers\Y::class`, a v2 ainda lê esse valor para que os diagnósticos de migração possam sinalizá-lo, mas payloads de novos workflows v2 usam Avro. Execute `php artisan workflow:v2:doctor` após atualizar. Ele sinalizará uma configuração legada de codec como uma questão de conclusão/importação da v1.

Para aceitar o padrão da v2 explicitamente, deixe `serializer` sem definição ou fixe-o:

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

Mantenha um codec legado (`'workflow-serializer-y'` ou `'workflow-serializer-base64'`) apenas se precisar terminar de concluir execuções v1 que compartilham valores nativos de PHP entre um servidor e workers exclusivos de PHP. Nomes de classes legadas (`Workflow\Serializers\Y::class` etc.) ainda são aceitos como aliases para decodificar execuções v1.

**Classes personalizadas de serialização da v1 não são suportadas na v2.** O registro público da v2 resolve apenas `avro`. Os leitores legados `workflow-serializer-y` e `workflow-serializer-base64` são restritos ao caminho interno de importação/conclusão da v1 e não podem ser selecionados para uma nova execução v2 ou payload de SDK. Se você tinha um serializador personalizado, conclua as execuções v1 antes de atualizar ou recodifique os payloads históricos em `avro`. A classe personalizada não é consultada. `php artisan workflow:v2:doctor` sinaliza qualquer outro valor de `workflows.serializer` como dívida de migração. A omissão do codec de novas execuções resulta em `avro`.

**Subclasses personalizadas de modelos só são suportadas quando mantêm o contrato de colunas e chaves do pacote.** A matriz de suporte consolidada em
[Matriz de personalização](/docs/configuration/customization-matrix/) é a
referência: criar subclasses dos modelos v2 de instância, execução, tarefa,
evento de histórico, projeção, agendamento, atividade, falha, link, mensagem,
memo, atributo de busca e chamada de filho é suportado quando a subclasse mantém
os nomes de tabelas, chaves primárias e chaves estrangeiras do pacote. Nomes de
tabelas personalizados junto com nomes personalizados de colunas de chave
estrangeira estão fora do contrato. O Waterline lê as projeções v2 pelo contrato
`Workflow\V2\Contracts\OperatorObservabilityRepository`, então uma subclasse
de esquema compatível não exige alteração no Waterline.

**Variáveis de ambiente:**

A v2 não introduz novas variáveis de ambiente obrigatórias. `QUEUE_CONNECTION`, `CACHE_DRIVER` e `DB_CONNECTION` existentes continuam funcionando.

**4. Reinicie os workers de fila**

Os workers de fila devem ser reiniciados para carregar o código v2:

```bash
# If using Laravel queue workers
php artisan queue:restart

# If using Supervisor
sudo supervisorctl restart <your-worker-group>:*

# If using systemd
sudo systemctl restart laravel-worker

# If using Horizon
php artisan horizon:terminate
```

Os workers irão:
1. Concluir o job atual
2. Encerrar de forma ordenada
3. Reiniciar com o código v2 carregado

**Os workers devem reiniciar antes de processar workflows v2.** Workflows v1 podem concluir com workers antigos ou novos (compatibilidade de conclusão na v1).

### Após atualizar {#after-upgrading}

**1. Verifique as capacidades do backend**

```bash
php artisan workflow:v2:doctor --strict
```

Saída esperada:

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

Se alguma verificação falhar, consulte [Requisitos de backend](/docs/installation/#requirements) para os pré-requisitos dos drivers.

**2. Verifique se workflows v2 iniciam com sucesso**

Inicie um workflow de teste usando a API v2:

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` retorna um objeto `StartResult`. Extraia dele o ID de
execução com `runId()` antes de comparar com registros do banco. Tratar o valor
retornado como string escalar comparará silenciosamente um objeto com uma coluna.

Verifique se:

- O workflow aparece no Waterline
- A tabela `workflow_instances` tem um registro com o `instance_id` correspondente (`$workflow->id()`)
- A tabela `workflow_runs` tem um registro com o `run_id` correspondente (`$result->runId()`)
- O workflow conclui ou avança como esperado

**3. Verifique workflows v1 (se houver)**

Se houver workflows v1 em andamento:

```bash
php artisan workflow:v1:list
```

Verifique se eles continuam avançando. Workflows v1 devem concluir no mecanismo v1 sem erros.

**4. Monitore erros nos logs**

Observe os logs da aplicação para identificar erros relacionados a workflows:

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

Problemas comuns:

- Erros de namespace: código ainda usando `Workflow\Workflow` em vez de `Workflow\V2\Workflow`
- Erros de método: classes v2 de workflow ou atividade que ainda precisam renomear seu método de entrada para `handle()`
- Erros de driver de fila: uso do driver `sync` no modo de fila (não suportado). No modo de consulta (`workflows.v2.task_dispatch_mode=poll`), a fila não é usada para entregar tarefas e `sync` é aceitável

**5. Verifique a observabilidade do Waterline**

Abra o Waterline (padrão: `/waterline`) e verifique:

- Workflows v1 (se houver) aparecem com seus dados originais
- Workflows v2 aparecem com detalhes completos de execução/histórico/atividade
- Não há erros na renderização do Waterline

### Procedimento de reversão {#rollback-procedure}

A reversão é uma operação sobre o conjunto de recuperação. Restaurar apenas o
banco SQL de workflows não restaura a execução v1 em andamento quando seu estado
de filas Laravel está no Redis, SQS, outro banco ou outro backend externo.

Se a atualização falhar em produção, reverta apenas conforme a política e o
ponto de recuperação selecionados antes da atualização:

**1. Deixe quiescentes a entrada da aplicação, os agendadores e os workers de fila**

Use o mesmo procedimento de parada do ponto anterior à atualização. Confirme
que nenhum worker pode reservar um job e nenhuma requisição pode iniciar um
workflow ou enviar um sinal enquanto o estado é restaurado.

**2. Valide o conjunto de recuperação**

- Um conjunto de recuperação apenas com SQL só é suportado quando o ponto
  selecionado não contém execução v1 não terminal dependente de trabalho em fila
  preservado. Um registro `pending` antigo e elegível pode usar o caminho
  comprovado do Watchdog v1.0.77 descrito acima, e uma espera genuína apenas por
  sinal pode usar uma entrada externa de sinais testada. Não estenda nenhuma
  dessas exceções a outros estados.
- Um conjunto de recuperação de trabalho em andamento deve conter SQL e estado
  restaurável de filas prontas, atrasadas e reservadas do mesmo ponto para novas
  tentativas, temporizadores, atividades e trabalho `waiting` ou `running`.
  Esperas apenas por sinal devem manter uma entrada de sinais funcional.
  Esperas por temporizador devem manter seus jobs atrasados na fila.
- Se nenhuma condição for atendida, pare aqui. Corrija avançando, reconcilie
  manualmente os workflows registrados ou prossiga sob a aceitação previamente
  documentada de que as execuções afetadas são irrecuperáveis.

**3. Restaure o backup do banco de dados**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

Restaure todas as tabelas personalizadas de modelos v1 configuradas e a
`workflow_relationships_table`, mesmo quando estiverem em outra conexão.

**4. Restaure o ponto de recuperação das filas, quando necessário**

Mantenha os consumidores parados. Siga o procedimento de restauração do provedor
de filas e restaure as conexões, filas, prefixos, jobs prontos, atrasados e
reservados exatos capturados junto com o SQL. Restaure o estado necessário de
locks de jobs únicos quando fizer parte do ponto de recuperação. Não substitua
por uma fila vazia com o mesmo nome: ela não consegue reativar novas tentativas,
temporizadores ou trabalho `waiting`/`running` restaurados. Uma fila vazia, mas
gravável, só basta para um registro `pending` elegível depois de comprovar que
o Watchdog v1.0.77 inicializa e o redespacha.

**5. Reverta a dependência Composer**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

`durable-workflow/workflow` é o nome do pacote mantido para releases v1
suportadas e v2. `laravel-workflow/laravel-workflow` é apenas um alias legado
declarado pelo pacote mantido para compatibilidade com grafos de dependências
antigos. Não o use nos requisitos de reversão.

Recupere a `APP_KEY` exata pela referência e versão inventariadas do gerenciador
de segredos, usando as credenciais de recuperação controladas separadamente.
Restaure-a junto com a conexão de armazenamento de workflows, conexões de filas,
nomes de filas, prefixos Redis e configuração de modelos personalizados antes
de iniciar um consumidor. Jobs criptografados e referências serializadas de
modelos dependem de essa configuração corresponder ao ponto de recuperação.

**6. Reinicie os workers de fila e reabra a entrada**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. Verifique se a execução v1 pode ser retomada**

A visibilidade no Waterline comprova que um registro foi restaurado, não que um
worker consiga retomá-lo. Complete esta lista antes de declarar a reversão
bem-sucedida:

- [ ] `composer show durable-workflow/workflow` informa a release v1 pretendida
  e os workers carregaram esse código.
- [ ] As tabelas v1 realmente configuradas e `workflow_relationships_table`
  estão presentes nas conexões de armazenamento esperadas.
- [ ] Cada registro não terminal na tabela configurada de workflows armazenados
  (`workflows` por padrão) está classificado pelo próximo caminho de reativação:
  job pronto/atrasado/reservado na fila, job de temporizador preservado ou entrada
  externa de sinais testada. Um registro `pending` elegível pode citar, em vez
  disso, a evidência comprovada de redespacho pelo Watchdog v1.0.77 abaixo.
- [ ] A inspeção do provedor de filas confirma que cada reativação identificada
  acima para nova tentativa, temporizador, atividade e workflow `waiting` ou
  `running` dependente de fila existe na conexão e fila registradas. Um registro
  SQL de temporizador por si só não satisfaz esta verificação, e o Watchdog não
  substitui esses jobs.
- [ ] Se um registro `pending` restaurado não tem job de workflow preservado,
  observa-se um laço de worker v1.0.77 enfileirando o Watchdog. Depois que o
  registro atingir o limite de cinco minutos de antiguidade, o Watchdog
  enfileira esse workflow na conexão e fila registradas e o registro avança.
  Sem essa comprovação de ponta a ponta, trate o registro como sem caminho
  de retomada, mesmo se o Waterline o exibir.
- [ ] Nenhum registro restaurado de nova tentativa, temporizador, `waiting` ou
  `running` está sem seu job executável de fila obrigatório ou um caminho externo
  utilizável de sinal para uma espera genuína por sinal. Trate tal registro
  como sem caminho de retomada. A evidência do Watchdog exclusivo de `pending`
  não o torna recuperável.
- [ ] Uma nova tentativa ou temporizador restaurado avança além do marcador
  anterior ao corte, e uma espera controlada por sinal consegue enfileirar e
  consumir sua reativação por sinal.
- [ ] Um novo workflow canário v1 conclui, e os logs não contêm erros de job
  ausente, decodificação criptográfica, tabela de modelo, conexão ou roteamento de fila.

Com as tabelas padrão, esta consulta é um inventário inicial. Substitua a tabela
resolvida pelo modelo configurado de workflow armazenado quando for personalizado:

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**Observações importantes sobre reversão:**

- A reversão descarta workflows v2 iniciados após a atualização (eles existem apenas em tabelas v2)
- A reversão apenas com SQL restaura registros de workflows v1, não mensagens de filas externas
- A execução v1 em andamento só é suportada quando SQL e estado durável de filas
  são restaurados do mesmo ponto consistente para a aplicação, ou quando uma
  espera apenas por sinal documentada mantém uma entrada utilizável. A exceção
  adicional apenas com SQL é um registro `pending` antigo e elegível com
  redespacho comprovado pelo Watchdog v1.0.77. Ela não abrange novas tentativas,
  temporizadores nem trabalho `waiting`/`running`
- Fazer replay de um ponto de recuperação anterior à atualização pode repetir
  efeitos externos. Revise a idempotência da aplicação antes de restaurar
  trabalho de atividade em fila
- Se precisar preservar workflows v2 iniciados durante a janela de atualização, não restaure o banco de dados. Em vez disso, corrija o problema da atualização avançando

## Alterações de código {#code-changes}

As seções abaixo detalham as alterações de código necessárias ao migrar das APIs v1 para v2.

### Alteração de namespace {#namespace-change}

Todas as classes v2 ficam em `Workflow\V2`. Atualize suas importações:

```php
// v1
use Workflow\Workflow;
use Workflow\Activity;
use Workflow\WorkflowStub;

// v2
use Workflow\V2\Workflow;
use Workflow\V2\Activity;
use Workflow\V2\WorkflowStub;
```

### Método de entrada {#entry-method}

Workflows e atividades v2 usam `handle()` como método de entrada. Renomeie os métodos `execute()` da v1 para `handle()` como parte da migração de código para v2:

```php
// v1
class MyWorkflow extends Workflow
{
    public function execute($input)
    {
        $result = yield ActivityStub::make(MyActivity::class, $input);
        return $result;
    }
}

// v2
use function Workflow\V2\activity;

class MyWorkflow extends Workflow
{
    public function handle($input)
    {
        return activity(MyActivity::class, $input);
    }
}
```

Não deixe `execute()` como método de entrada em um workflow ou atividade v2. O runtime o rejeita.

### Chamadas de atividade {#activity-calls}

A v2 substitui `ActivityStub::make()` e `yield` por funções auxiliares diretas:

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

As atividades agora têm identidade durável. Cada atividade agendada recebe um registro `activity_executions` com ID de execução estável, e cada tentativa concreta recebe um registro `activity_attempts` com histórico tipado.

### Identidade do workflow {#workflow-identity}

A v2 divide a identidade em ID de instância e ID de execução:

- `id()`: o ID público da instância de workflow (o mesmo entre continuações como nova execução)
- `runId()`: o ID da execução atual

Na v1, eram o mesmo conceito.

### Sinais {#signals}

A v2 usa esperas por sinais nomeados em vez de métodos de mutação baseados no atributo `#[SignalMethod]`:

```php
// v1
#[SignalMethod]
public function approve()
{
    $this->approved = true;
}

// v2
use function Workflow\V2\await;

$approved = await('approve');
```

Sinais nomeados suportam `await('name')` para esperas bloqueantes no código do workflow e `signal()` / `attemptSignal()` para entrada externa. Cancelamento e término não são modelados como sinais. Eles continuam sendo comandos explícitos do runtime.

### Consultas {#queries}

A v2 usa métodos de consulta seguros para replay em vez de ler propriedades do workflow diretamente:

```php
// v1
#[QueryMethod]
public function getStatus(): string
{
    return $this->status;
}

// v2
use function Workflow\V2\query;

// Queries are defined as named, replay-safe accessors
```

### Temporizadores e efeitos externos {#timers-and-side-effects}

Os auxiliares baseados em funções substituem os métodos estáticos da v1:

```php
// v1
yield Timer::make(60);
$value = yield SideEffect::make(fn() => random_int(1, 100));

// v2
use function Workflow\V2\timer;
use function Workflow\V2\sideEffect;

timer(60);
$value = sideEffect(fn() => random_int(1, 100));
```

### Limites de tempo {#timeouts}

A v2 adiciona limites de tempo de workflow por meio de `StartOptions`:

```php
use Workflow\V2\StartOptions;
use Workflow\V2\WorkflowStub;

$workflow = WorkflowStub::make(MyWorkflow::class, 'order-123');

$workflow->start(
    $orderId,
    StartOptions::rejectDuplicate()
        ->withExecutionTimeout(7200)   // 2 hours across all runs
        ->withRunTimeout(3600),        // 1 hour per run
);
```

- **Limite de tempo de execução lógica** abrange a instância inteira, incluindo transições de continuação como nova execução.
- **Limite de tempo de execução individual** se aplica a uma única execução e reinicia ao continuar como nova execução.

### Migrações do banco de dados {#database-migrations}

A v2 adiciona novas tabelas e colunas. O pacote carrega suas migrações automaticamente, então, após atualizar:

```bash
composer update durable-workflow/workflow
php artisan migrate
```

A release 2.0.0 inclui migrações limpas de tabelas base. O caminho normal é
deixar o Laravel carregar as migrações do pacote automaticamente e executar
`php artisan migrate`.

Se você publicou migrações do Durable Workflow anteriormente na aplicação,
escolha uma fonte de migrações e mantenha-a atualizada:

- **Migrações do pacote carregadas automaticamente**: remova arquivos antigos
  publicados de migrações do Durable Workflow de `database/migrations` e execute
  `php artisan migrate`.
- **Migrações publicadas**: publique o conjunto atual antes de migrar:

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

Não mantenha arquivos publicados desatualizados enquanto depende também dos
novos arquivos do pacote carregados automaticamente. Isso pode deixar sua
aplicação sem tabelas v2 mais recentes ou migrações de reparo.

Se você personalizou arquivos de migração, compare suas cópias locais com o
diretório `src/migrations` do pacote em cada atualização. Mantenha nomes de
tabelas, colunas, índices e contratos de nulidade/valores padrão com esquema
compatível com os modelos do pacote. Uma instalação personalizada que direciona
tabelas de workflow a uma conexão diferente da padrão deve publicar as migrações,
definir a `$connection` da migração e continuar incorporando cada nova migração
do pacote em ordem de timestamp.

Para quem adotou versões preliminares da v2, `workflow_run_summaries.memo` é
reparada de forma idempotente se uma migração antiga publicada da tabela de
resumos criou `workflow_run_summaries` sem essa coluna. Novas instalações já
criam a coluna na migração base da tabela de resumos.

### Verificação de capacidades do backend {#backend-capability-check}

A v2 valida se seus drivers de fila, banco de dados e cache atendem aos requisitos. Execute o comando doctor após atualizar:

```bash
php artisan workflow:v2:doctor --strict
```

### Configuração {#configuration}

A v2 introduz várias opções novas de configuração. Consulte a seção [Configuração](/docs/configuration/options/) para detalhes sobre:

- Aliases de tipos duráveis
- Política de reparo de tarefas
- Verificações de capacidades do backend
- Reconstruções de projeções
- Orçamentos de histórico e ocultação de dados em exportações

### Waterline {#waterline}

O Waterline (a interface de monitoramento) foi atualizado para v2 com:

- Visões de detalhes da execução mostrando durações de limites de tempo e prazos
- Acompanhamento de tentativas de atividade com IDs duráveis
- Exibições atualizadas de estados de workflow

### Continuar como nova execução {#continue-as-new}

A v2 adiciona orçamentos de histórico que podem acionar automaticamente a continuação como nova execução quando a contagem de eventos excede um limiar. Metadados (memo, atributos de busca, limites de tempo) são propagados entre transições.

## Workflows existentes {#existing-workflows}

### Estratégia de conclusão na v1 {#finish-on-v1-strategy}

**Workflows iniciados na v1 continuarão executando pelos caminhos de compatibilidade da v1.** Novos workflows iniciados após a atualização usarão a semântica da v2. Você não precisa migrar instâncias de workflow em andamento.

Quando você atualiza para 2.0:

1. **Os dados da v1 são preservados**: as tabelas padrão `workflows`, `workflow_logs`, `workflow_signals`, `workflow_timers`, `workflow_exceptions` e `workflow_relationships` permanecem intactas. Substituições configuradas de modelos/tabelas v1 continuam sendo a referência
2. **Workflows v1 concluem no mecanismo v1**: workflows v1 em andamento continuam executando com o mecanismo de replay da v1 até atingirem um estado terminal
3. **Workflows v2 usam o mecanismo v2**: todos os workflows iniciados após atualizar usam o esquema v2 (`workflow_instances`, `workflow_runs`, `workflow_history_events` etc.)
4. **O Waterline mostra ambos**: a interface de monitoramento exibe workflows v1 e v2 lado a lado

A conclusão na v1 também depende do backend de filas Laravel. Mantenha todas as
conexões e filas v1 até que seus workflows sejam terminais. Registros do banco
preservam histórico e estado. Eles não reconstroem jobs prontos, atrasados ou
reservados perdidos de um backend externo. O Watchdog v1.0.77 pode redespachar
um workflow `pending` antigo e elegível a partir do SQL, mas esse caminho limitado
de recuperação não recria novas tentativas, temporizadores nem trabalho
`waiting`/`running`.

### Acompanhando a conclusão de workflows v1 {#tracking-v1-workflow-completion}

Para ver quais workflows v1 continuam ativos após atualizar:

```bash
php artisan workflow:v1:list
```

Este comando lista todos os workflows v1 que ainda não atingiram um estado terminal (concluído, com falha, cancelado). Use-o para acompanhar a conclusão dos workflows v1 ao longo do tempo.

Exemplo de saída:

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Visibilidade no Waterline {#waterline-visibility}

Após atualizar para 2.0, o Waterline mostra automaticamente workflows dos dois mecanismos:

- **Workflows v1** aparecem com seus dados originais de `StoredWorkflow` (classe, estado, logs, sinais, exceções)
- **Workflows v2** aparecem com detalhes completos da v2 (execuções, eventos de histórico, temporizadores, atividades, atributos de busca)

Nenhuma configuração é necessária. O Waterline lê os dois conjuntos de tabelas e apresenta uma visão unificada.

### Quando remover as tabelas v1 {#when-to-clean-up-v1-tables}

Depois que todos os workflows v1 concluírem (confirmado por `workflow:v1:list` mostrando zero workflows ativos), você pode opcionalmente excluir as tabelas v1:

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**Importante:** não exclua essas tabelas enquanto houver workflows v1 ativos. Isso fará o replay da v1 falhar e deixará workflows presos.

### Por que concluir na v1? {#why-finish-on-v1}

A estratégia de conclusão na v1 evita forçar uma migração de dados no momento da atualização. A v1 e a v2 usam modelos de armazenamento fundamentalmente diferentes:

- **v1** armazena o estado do workflow como um registro desnormalizado de `workflows` com logs, sinais e temporizadores relacionados
- **v2** armazena o estado do workflow como histórico baseado em eventos com projeções (`workflow_instances`, `workflow_runs`, `workflow_history_events`)

Converter workflows v1 em andamento para histórico v2 exigiria reconstruir sequências de eventos a partir de logs da v1, com risco de perda de dados e inconsistências de replay. A abordagem de conclusão na v1 permite que workflows v1 concluam com segurança no mecanismo original enquanto novos trabalhos passam imediatamente para v2.
