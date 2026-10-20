---
sidebar_position: 9
tags:
  - sample-app
  - contributing
  - patterns
keywords:
  - contribuir com um exemplo
  - contribuição de exemplo durable workflow
  - fluxo sample-request
  - workflow de exemplo externo
---

# Contribua com um exemplo {#contribute-a-sample}

O [Sample App](/docs/sample-app) é o local de referência para demonstrar
um padrão do Durable Workflow em um projeto Laravel real.
Se você tem um padrão que ajudaria outros engenheiros, como uma estrutura
de saga ainda não demonstrada, outra forma de usar fluxos de mensagens ou
uma integração com uma ferramenta ausente dos exemplos atuais, este guia
explica o caminho para sua incorporação ao projeto.

O contrato é curto de propósito. Um exemplo que o segue é incorporado em
um ritmo previsível. Um exemplo que ignora partes dele permanece em revisão
até que as lacunas sejam resolvidas.

## Antes de escrever código {#before-you-write-code}

1. **Abra primeiro uma issue `sample-request`.** O
   [modelo `sample-request`](https://github.com/durable-workflow/sample-app/issues/new/choose)
   identifica o recurso demonstrado pelo padrão, a página da documentação
   pública que o define e a versão mínima necessária do pacote Durable Workflow.
   Na issue, os mantenedores e o colaborador concordam que vale a pena
   incorporar o exemplo *antes* de o colaborador investir em um PR.
2. **Escolha um recurso ou padrão que ainda não exista no índice de exemplos.** O
   [índice de exemplos do README](https://github.com/durable-workflow/sample-app#sample-index)
   lista todos os padrões cobertos. Se sua ideia se resume a "outra forma de
   escrever o workflow simples", ela não é um novo exemplo, mas um ajuste
   na documentação de `App\Workflows\Simple\SimpleWorkflow`.
3. **Encontre a classe de workflow existente mais próxima.** Um novo exemplo
   deve seguir os exemplos ao redor: a mesma organização de diretórios em
   `app/Workflows/<Pattern>/`, o mesmo formato de comando artisan e a mesma
   abordagem de testes. Exemplos que inventam uma estrutura diferente são
   rejeitados, mesmo que o padrão demonstrado seja bom.

## Como é um exemplo incorporado ao projeto {#what-a-merged-sample-looks-like}

Um exemplo incorporado é *executável*, *didático*, *coberto por testes* e
*visível*. Isso corresponde a quatro artefatos concretos no repositório sample-app:

1. **Uma classe de workflow** em `app/Workflows/<Pattern>/` que demonstre
   o padrão de ponta a ponta. O código do workflow permanece determinístico:
   leituras de relógio em `sideEffect()`, trabalho externo em atividades e
   esperas por meio de sinais, atualizações, temporizadores ou fluxos de
   mensagens. A classe de workflow compila sem `OPENAI_API_KEY` ou outras
   credenciais externas, a menos que o padrão as exija explicitamente.
2. **Um comando artisan** que inicie o workflow com uma entrada realista,
   para que o leitor execute um comando e acompanhe a execução no Waterline.
   O comando fica junto dos comandos artisan correspondentes em
   `routes/console.php` (ou no ponto equivalente de registro) e usa a mesma
   convenção de nomes (`app:<short-pattern>`).
3. **Uma entrada em `config/workflow_mcp.php`** que identifique a classe de
   workflow, o padrão, o comando, as credenciais necessárias e os argumentos.
   Essa entrada permite descobrir o exemplo pelo servidor MCP, e a verificação
   de cobertura upstream se recusa a marcar uma linha como `covered` enquanto
   a entrada não existir.
4. **Um teste em `tests/`** que exercite o workflow com o worker v2 em memória.
   O teste não precisa verificar cada evento tipado do histórico, mas deve
   comprovar que o workflow termina com a entrada passada pelo comando artisan.

Se o exemplo demonstra uma *correção de bug* em vez de um recurso, ele fica
em `app/Workflows/Bug/<short-id>/`, com os mesmos quatro artefatos.

## O que entra na documentação {#what-goes-in-the-docs}

Três áreas da documentação são atualizadas quando um exemplo é incorporado:

- **"Sample Index" do README** no repositório sample-app: uma linha por
  exemplo com objetivo, classe de workflow, comando artisan e chave MCP.
  Essa é a fonte de referência.
- **Galeria de exemplos no site da documentação
  ([`docs/sample-app.md`](/docs/sample-app))**: uma linha correspondente
  com a tela do Waterline que o leitor deve esperar. A galeria permite
  decidir se o exemplo é adequado antes de clonar o repositório.
- **Link cruzado na página do padrão** no site da documentação que define
  o recurso (sagas, sinais, fluxos de mensagens, workflows filhos etc.).
  A tabela de links cruzados no final da página de documentação do sample-app
  é a lista de referência; uma entrada que cita um recurso, mas não aponta
  para um exemplo, é tratada como uma lacuna.

Envie as alterações do exemplo e do README no PR do sample-app, e as alterações
da galeria e da página do padrão em um PR vinculado no site da documentação.
Os mantenedores incorporam as alterações vinculadas em conjunto.
Um exemplo incorporado sem a atualização correspondente no site permanece no
estado `gap` no acompanhamento de cobertura upstream até a chegada do PR
de documentação. Por isso, recomenda-se enviar ambos juntos.

## Nomes, organização e estilo {#naming-layout-and-style}

- **Organização das classes.** `app/Workflows/<Pattern>/<Pattern>Workflow.php`,
  com as classes de atividade em
  `app/Workflows/<Pattern>/Activities/`. Reprodutores de bugs ficam em
  `app/Workflows/Bug/<short-id>/`, com a mesma organização.
- **Comando artisan.** `app:<short-pattern>` (minúsculas, sem hífens).
  Não se usam nomes longos (`app:run-<pattern>`).
- **Chave MCP.** Use o mesmo padrão curto do comando artisan para que
  o cliente MCP veja o mesmo nome digitado pela pessoa no terminal.
- **Comentários.** Explique o *motivo*, não a *ação*. Invariantes de segurança
  de replay (por que um valor está em `sideEffect()`, por que uma espera usa
  um temporizador em vez de `usleep()`) merecem comentários; repetir o mesmo
  comentário em toda chamada de atividade não ajuda.
- **Capturas do Waterline.** A galeria do sample-app no site identifica a
  tela do Waterline que o exemplo deve produzir; adicione ou atualize essa
  tela como parte do PR do exemplo.

## O que faz um exemplo ser rejeitado {#what-gets-a-sample-rejected}

Um exemplo é devolvido para ajustes quando:

- o código do workflow usa `now()`, `random_*()` ou outras chamadas não
  determinísticas fora de `sideEffect()` ou de uma atividade;
- as atividades fazem controles duráveis que já pertencem à engine, como
  escrever diretamente linhas de `workflow_messages`, avançar cursores de
  fluxos manualmente ou persistir o estado do Waterline no código do workflow;
- o comando artisan exige credenciais externas sem informar isso no campo
  `requires` da entrada MCP;
- o índice do README, a linha da galeria do site e o link na página do padrão
  não são incorporados na mesma alteração;
- o exemplo reproduz um recurso ou padrão existente sem demonstrar algo
  novo (outra estrutura, outro modo de falha ou outra integração).
  "Mesmo padrão, texto diferente" é uma alteração de documentação, não um exemplo.

São os mesmos pontos verificados pelo lint de cobertura upstream e pela
lista de revisão do sample-app. Identificá-los antes de abrir o PR é o caminho
mais rápido para sua incorporação.

## Lista rápida de verificação {#quick-checklist}

Use esta lista ao abrir o PR:

- [ ] Existe uma issue `sample-request` com link para a página pública do padrão.
- [ ] Classe de workflow em `app/Workflows/<Pattern>/`.
- [ ] Comando artisan registrado com o nome `app:<short-pattern>`.
- [ ] Entrada em `config/workflow_mcp.php` com classe, padrão, comando,
      requires e argumentos.
- [ ] Teste que exercita o workflow de ponta a ponta.
- [ ] Linha no "Sample Index" do README.
- [ ] Linha na galeria do site em
      [`docs/sample-app.md`](/docs/sample-app).
- [ ] Link cruzado a partir da página correspondente ao padrão no site.
- [ ] Verificação de limites do conteúdo público sem falhas
      (`scripts/check-public-boundary.sh`).

Os mantenedores usam a mesma lista na revisão. Um PR que atende a todos
os itens deve ser incorporado em um ciclo de release.
