---
title: Migrar o histórico retido de pré-release
sidebar_label: Migração de histórico de pré-release
---

# Migrar o histórico retido de pré-release {#migrate-retained-prerelease-history}

Use este procedimento offline quando uma implantação do Durable Workflow 2.0
exclusiva de Avro informar `unsupported_payload_codec` para estado retido de um
pré-release público anterior da versão 2.0. Ele converte representações
conhecidas com tag JSON, sem tag e de Avro Value obsoleto sem disponibilizar
qualquer codec legado para uma aplicação v2 em execução.

Não use a exportação de histórico como substituta deste procedimento. Uma
exportação é uma cópia portátil de uma execução; ela não altera as linhas do
banco de dados inspecionadas na inicialização da implantação. Nunca exclua
histórico para fazer a verificação prévia passar.

## Decidir o que precisa ser convertido {#decide-what-must-be-converted}

Execuções ainda ativas podem terminar no pré-release atualmente implantado.
Deixe-as concluir antes da janela de manutenção quando isso for
operacionalmente seguro. Execuções terminais, execuções fechadas retidas para
replay e estado que não pode ser drenado devem ser convertidos. A migração
inventaria ambos os grupos e não exclui nenhum deles.

A simulação cobre as interfaces de responsabilidade do protocolo verificadas
na inicialização do Server:

- entradas e saídas de workflows, payloads de atividades, comandos, sinais,
  atualizações, chamadas de serviço, tarefas de validação de atualizações e
  referências de streams duráveis;
- frames inline de objeto único e envelopes de payload explícitos aninhados
  em eventos do histórico; e
- referências a payloads armazenados externamente, incluindo formato da
  referência, codec, disponibilidade do objeto, tamanho em bytes e integridade SHA-256.

Mapas de memo, atributos de busca, contexto e diagnóstico pertencentes ao
cliente não são declarações de codec e permanecem inalterados. Codecs
desconhecidos, fingerprints de schema desconhecidos, referências corrompidas e
valores que o schema fixo Avro Value não consegue representar são relatados
como inseguros. Uma constatação insegura bloqueia a aplicação da migração.

## Limite de responsabilidade {#ownership-boundary}

O comando pertence ao pacote Workflow PHP, mas deve ser executado no processo
responsável pela conexão com o banco e pela configuração de payloads externos:

- **Laravel embarcado:** instale o pacote Workflow de destino no checkout da
  aplicação e execute o comando `php artisan` da aplicação com seus processos
  web, de fila, agendador e manutenção parados.
- **Server independente:** use um shell ou job de execução única da imagem
  Server de destino, com o mesmo banco, configuração de namespace, credenciais
  e mounts de payloads externos da implantação. Mantenha o hook normal de
  bootstrap e todos os processos do Server parados até a conversão ser concluída.

Não aponte o checkout de uma aplicação não relacionada para o banco. A política
de armazenamento do namespace faz parte da verificação de integridade; um
processo que não consegue ler um objeto externo o relata como inseguro em vez
de fazer suposições.

## Ordem de implantação {#deployment-order}

1. Mantenha o pré-release antigo disponível pelo tempo necessário para drenar
   as execuções ativas que você decidir concluir. Depois pare todos os
   escritores no banco: nós da API, workers, agendadores, jobs de bootstrap e manutenção.
2. Faça os snapshots do banco e do armazenamento de objetos externos exigidos
   pela sua política normal de recuperação. Preserve o artefato antigo da aplicação ou Server.
3. Instale ou baixe o artefato de destino que contém
   `workflow:v2:migrate-prerelease-history`, mas não o inicie. Execute o
   inventário de simulação a partir desse artefato:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history --dry-run --json
   ```

   Um código de saída zero significa que todos os valores afetados podem ser
   convertidos com segurança. Revise os caminhos e os IDs de execução afetados.
   Um código de saída diferente de zero com `unsafe_fields` maior que zero
   bloqueia a atualização; corrija o acesso ao armazenamento ou permaneça no
   pré-release antigo.
4. Escolha um novo caminho privado de backup e um novo diretório privado de
   evidências no armazenamento persistente. Nenhum deles pode existir.
   Aplique uma única vez:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history \
     --backup=/secure/dw-prerelease-history-backup.json \
     --evidence-dir=/secure/dw-prerelease-history-evidence
   ```

   O comando grava o backup antes de iniciar as atualizações e se recusa a
   sobrescrever evidências. Ele bloqueia e atualiza linhas do banco em uma
   transação, preserva as identidades de workflow e execução, verifica hashes
   e tamanhos de objetos externos e retém todos os objetos externos originais.
   Os objetos externos substitutos são cópias Avro endereçadas pelo conteúdo.
   Nenhum histórico é excluído.
5. Aguarde o comando terminar. Ele exporta e faz replay estrito de cada execução
   retida afetada, reconstrói suas projeções de resumo, espera, linha do tempo,
   temporizador e linhagem, verifica divergências nessas projeções e repete o
   inventário de payloads. O sucesso exige as três verificações. Guarde os
   relatórios de replay e projeção gerados junto com o backup.
6. Execute o bootstrap normal do destino somente após o sucesso da migração:

   ```bash
   php artisan server:bootstrap --force
   ```

   Para Laravel embarcado, execute o procedimento normal de migração/bootstrap
   da aplicação. A verificação prévia de payloads exclusivos de Avro deve estar
   sem problemas antes de iniciar qualquer novo worker, nó da API, agendador
   ou processo de manutenção.
7. Inicie a implantação de destino e verifique a prontidão e um replay ou
   consulta de uma execução retida pela interface normal de operação. Retenha
   o pacote de migração durante toda a janela de rollback.

## Rollback {#rollback}

Se a aplicação, o replay, a verificação de projeções ou a verificação posterior
falhar, a atualização fica bloqueada. Mantenha todos os escritores parados e
execute o comando de rollback impresso pela migração. Com os caminhos acima, é:

```bash
php artisan workflow:v2:migrate-prerelease-history \
  --rollback-from=/secure/dw-prerelease-history-backup.json \
  --evidence-dir=/secure/dw-prerelease-history-evidence
```

O rollback verifica o digest do backup e o estado da migração, recusa
sobrescrever evidências de rollback e recusa restaurar uma linha alterada após
a conversão. Ele restaura os valores originais do banco atomicamente e retém os
objetos externos substitutos como evidência. Depois restaure o artefato anterior
da aplicação ou Server. Se o rollback recusar porque outro escritor alterou o
estado, mantenha a atualização bloqueada e restaure o snapshot coordenado do
banco e do armazenamento de objetos da etapa 2.

Após o rollback, espera-se que a implantação exclusiva de Avro volte a falhar na
verificação prévia. Resolva o estado inseguro relatado, crie novos caminhos de
backup e evidências e repita todo o procedimento antes de tentar a atualização novamente.
