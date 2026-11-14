---
displayed_sidebar: tutorialSidebar
title: Linguagem de consultas de visibilidade
description: Filtre execuções do Server por estado, tempo, identidade e atributos de busca tipados, com exemplos HTTP e paginação.
---

# Linguagem de consultas de visibilidade

Use `GET /api/workflows?query=...` para encontrar execuções em um namespace do Server. Esta referência descreve o Server nativo publicado selecionado no [manifesto de compatibilidade](../compatibility.md#last-qualified-reproducible-tuple), atualmente `%%artifact.serverVersion%%`. A listagem lê fatos de visibilidade armazenados. Ela não executa o handler de uma consulta nomeada do workflow.

A requisição precisa de um token bearer de operador ou administrador, `X-Namespace` e `X-Durable-Workflow-Control-Plane-Version: 2`. Consulte a [autorização de namespace](./namespace-auth-workers.md). Os resultados incluem execuções correspondentes, também execuções anteriores de uma instância e filhos cujos atributos correspondam. Não existe predicado integrado para selecionar apenas raízes.

## Fazer uma requisição {#make-a-request}

Defina `DURABLE_WORKFLOW_SERVER_URL` como a URL base do Server e `DURABLE_WORKFLOW_AUTH_TOKEN` como um token de operador ou administrador. O exemplo exige Bash, curl e jq. Substitua o intervalo UTC fixo pelo período que deseja inspecionar.

```bash
query='Status = failed AND CloseTime >= "2026-11-14T00:00:00Z" AND CloseTime < "2026-11-15T00:00:00Z"'
page=$(curl --fail-with-body --silent --show-error --get \
  "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H 'X-Namespace: default' \
  -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
  --data-urlencode "query=$query" \
  --data-urlencode 'page_size=50')
printf '%s\n' "$page" | jq '{workflow_count, workflows, next_page_token}'
```

`Status = failed` seleciona um grupo que também inclui execuções canceladas e terminadas. Use `Status = cancelled` ou `Status = terminated` para esses estados exatos. `running` inclui pending, running e waiting. `completed` seleciona execuções concluídas. Valores de estado não diferenciam maiúsculas de minúsculas.

Use `--data-urlencode` para a consulta e o token de página. Aspas do shell, escapes da linguagem e codificação URL são etapas separadas. Uma resposta bem-sucedida com `workflows: []` significa que nenhuma execução correspondeu à requisição.

## Campos {#fields}

Nomes de campo diferenciam maiúsculas de minúsculas. Nomes integrados têm precedência sobre atributos personalizados.

| Campo | Valor | Operadores |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | Tipo de execução, ID da instância, ID da execução ou fila de tarefas | `=`, `!=`, `IN`, `IN` negado |
| `Status`, `ExecutionStatus` | Estado ou grupo de estados descrito acima | `=`, `!=` |
| `StartTime`, `ExecutionTime` | Instante de início da execução. Os nomes são aliases. | Comparações escalares, `IN`, `IN` negado |
| `CloseTime` | Instante de encerramento da execução | Comparações escalares, `IN`, `IN` negado |
| `BuildId`, `BuildIds` | Aliases do valor de compatibilidade da execução, não uma busca na frota de workers | Operadores de keyword, sujeitos à recusa nativa abaixo |

Comparações escalares são `=`, `!=`, `<`, `<=`, `>` e `>=`. Um instante de início ou encerramento ausente nunca corresponde a uma comparação, mesmo negada. A listagem nativa recusa uma execução que seria retornada com compatibilidade não nula usando HTTP `409` / `unqualified_build_visibility`. Um predicado de build analisado não comprova listagem qualificada por build.

Outros campos precisam ser atributos de busca registrados neste namespace. Consulte definições com `GET /api/search-attributes` e registre um atributo com `POST /api/search-attributes` e um corpo JSON como `{"name":"OrderTotal","type":"double"}`. O registro exige token de administrador. Um tipo inferido armazenado, sozinho, não torna consultável uma chave não registrada. Excluir a definição preserva os valores, mas invalida consultas sobre a chave.

Identificadores começam com uma letra ASCII e continuam com letras ASCII, dígitos ou `_`. Use exatamente o nome registrado. Memos, rótulos de visibilidade, chaves de negócio e nomes de relações pai/raiz não são campos estruturados integrados adicionais. A busca simples ainda pode encontrar uma chave de negócio como explicado abaixo.

## Tipos e comparações {#types-and-comparisons}

| Tipo registrado | Literais e comportamento de comparação |
| --- | --- |
| `keyword` | Igualdade ou desigualdade do texto completo, `IN` e `IN` negado. Sem ordenação. |
| `string`, `text` | Comparação do texto completo, com os mesmos operadores de `keyword`. Sem substring, busca de texto completo ou operador `LIKE`. |
| `int` | Inteiro sem aspas, como `42` ou `-3`. Comparações escalares, `IN` e `IN` negado. Um número entre aspas ou decimal não é um literal inteiro. |
| `double` | Inteiro ou decimal sem aspas, incluindo notação exponencial como `1.5e3`. Comparações escalares, `IN` e `IN` negado. |
| `bool` | `true` ou `false` sem aspas, sem diferenciar maiúsculas. Comparações escalares, `IN` e `IN` negado; `false` vem antes de `true`. `1` e `"true"` não são literais booleanos. |
| `datetime` | Data/hora entre aspas. Comparações escalares, `IN` e `IN` negado comparam instantes. Use timestamps UTC ou com offset explícito, como `"2026-11-14T12:34:56.123456Z"`. |
| `keyword_list` | `Tags = "urgent"` testa pertencimento. `Tags IN ("urgent", "review")` corresponde a qualquer membro listado. Desigualdade, ordenação e pertencimento negado são recusados. |

Uma execução sem o atributo consultado nunca corresponde ao predicado, inclusive `!=` e `IN` negado. Não há predicado de existência nem `IS NULL`. Um valor mantido com outro tipo registrado anteriormente não é convertido automaticamente para o tipo novo.

Comparações de keyword, texto e campos de texto integrados seguem as regras de igualdade do banco. O esquema publicado de MySQL/MariaDB usa `utf8mb4_unicode_ci`, que ignora maiúsculas, acentos e espaços finais. SQLite e a comparação nativa de PostgreSQL são exatos. O pertencimento a listas de keywords é exato. Não presuma resultados textuais idênticos entre esses backends.

Datas aceitam datas ISO e timestamps, preservando frações até microssegundos. Uma data sozinha significa meia-noite UTC; sem fuso explícito, usa UTC. Use timestamps explícitos para consultas portáveis. Datas relativas como `tomorrow` e fusos nomeados como `Europe/Paris` não são valores válidos. Calcule o intervalo móvel no chamador e envie limites fixos.

## Sintaxe, precedência e escapes {#syntax-and-escaping}

- Escreva comparações como `Field operator literal`. Separe predicados com `AND` ou `OR`. Palavras-chave não diferenciam maiúsculas.
- `NOT` aplica-se ao próximo predicado antes de `AND`; `AND` tem precedência sobre `OR`. `A = 1 OR B = 2 AND C = 3` significa `A = 1 OR (B = 2 AND C = 3)`.
- Parênteses delimitam uma lista `IN` não vazia, separada por vírgulas. Não agrupam expressões booleanas. Repita predicados nos ramos `OR` quando necessário.
- Pertencimento negado é **`NOT Region IN ("eu", "us")`**. A forma SQL `Region NOT IN (...)` não é suportada. `Status IN (...)` também não é suportado; use `Status = running OR Status = completed`.
- Use aspas simples ou duplas para strings. Escape a aspa escolhida e uma barra invertida literal com `\`. Exemplos: `Customer = 'O\'Brien'` e `Path = "C:\\orders"`. O parser também decodifica escapes de C como `\n`, `\t` e `\r`; `\uXXXX` de JSON não é um escape Unicode aqui. Escreva os caracteres Unicode diretamente.
- Literais de texto sem aspas permitem letras ASCII, dígitos, `_`, `.`, `:` e `-`. Prefira texto entre aspas para evitar a inferência acidental de booleanos ou números. Não há cláusulas SQL `SELECT`, `ORDER BY` ou `LIMIT`.

Dentro de uma expressão, um campo booleano registrado sem operador pode significar `Flag = true`; `NOT Flag` significa `Flag = false`. Um `Flag` isolado é texto de busca simples. Comparações explícitas evitam essa ambiguidade.

O Server reconhece uma expressão pela sintaxe de comparação, `IN (...)` ou um predicado `NOT` inicial. O restante do texto busca substrings no ID do workflow e na chave de negócio. Por exemplo, `query=order-1001` é busca simples. Texto semelhante a SQL não suportado pode virar busca simples em vez de erro de sintaxe. Use a gramática documentada e inspecione erros de `query` quando uma expressão reconhecida for inválida.

## Exemplos de consultas {#query-examples}

Passe qualquer expressão abaixo como valor de `query` na requisição curl acima. Os exemplos personalizados pressupõem `OrderTotal: double`, `Attempt: int`, `Region: keyword`, `Tags: keyword_list`, `Approved: bool` e `DueAt: datetime` registrados e preenchidos no namespace selecionado.

| Tarefa | Consulta |
| --- | --- |
| Pedidos acima de um limite numérico | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| Tentativas em um intervalo inclusivo | `Attempt >= 2 AND Attempt <= 5` |
| Qualquer uma das regiões | `Region IN ("eu", "us")` |
| Outras regiões registradas | `NOT Region IN ("eu", "us")` |
| Qualquer tag da lista | `Tags IN ("urgent", "review")` |
| False explícito | `Approved = false` |
| Uma janela de tempo | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| Duas filas sob o mesmo tipo | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## Paginação e limites {#pagination-and-limits}

| Parâmetro | Comportamento |
| --- | --- |
| `workflow_type` | Filtro opcional de tipo exato, combinado com `query` e `status` por `AND`. |
| `status` | Filtro opcional. Prefira os grupos canônicos `running`, `completed` ou `failed`. O endpoint atual também aceita `cancelled` e `terminated` exatos; não aceita `pending` e `waiting` aqui. |
| `page_size` | Inteiro de `1` a `200`, padrão `50`. Use este parâmetro, não `limit`. |
| `next_page_token` | Copie o token da resposta anterior sem decodificar ou construir um. Pare quando for null. |

`workflow_count` é o número nesta página, não o total de execuções correspondentes. A ordem é por instante de início/ordenação decrescente e depois ID da execução decrescente. A paginação lê dados vivos usando offset. Mantenha namespace, consulta, filtros e tamanho de página. Inserções, encerramentos ou atualizações de atributos entre requisições podem mover resultados e causar repetições ou omissões; não é uma exportação de snapshot. Um token inválido atualmente reinicia na primeira página, em vez de retornar erro.

Busque a próxima página do primeiro exemplo, se houver:

```bash
next=$(printf '%s\n' "$page" | jq -r '.next_page_token // empty')
if [ -n "$next" ]; then
  curl --fail-with-body --silent --show-error --get \
    "$DURABLE_WORKFLOW_SERVER_URL/api/workflows" \
    -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
    -H 'X-Namespace: default' \
    -H 'X-Durable-Workflow-Control-Plane-Version: 2' \
    --data-urlencode "query=$query" \
    --data-urlencode 'page_size=50' \
    --data-urlencode "next_page_token=$next" | jq .
fi
```

O tamanho de página limita as linhas retornadas, não o trabalho de avaliação. Mantenha expressões e listas `IN` pequenas e use predicados seletivos de tipo, estado ou atributos. O parser de workflows não define o limite de 2048 caracteres da API de schedules. Servidores HTTP e proxies podem impor limites próprios de URI. A [listagem de schedules](./server-api-reference.md#schedule-list-filters) tem outra gramática, de igualdade e `AND`.

## Consultas inválidas {#invalid-queries}

Uma expressão reconhecida que falha no parsing, na resolução de campos ou na checagem de tipos retorna HTTP `422` com `reason: "validation_failed"`, uma `message` e arrays em `errors.query` e `validation_errors.query`. Tamanho de página ou estado inválido usa a chave do respectivo parâmetro.

| Expressão inválida | Correção |
| --- | --- |
| `Unknown = 1` | Registre o atributo neste namespace ou corrija o nome do campo. |
| `OrderTotal = "1000"` | Use o literal numérico `1000`. |
| `Approved = 1` | Use `true` ou `false`. |
| `Region > "eu"` | Keywords suportam igualdade e pertencimento, não ordenação. |
| `Tags != "urgent"` ou `NOT Tags IN ("urgent")` | Listas de keywords não suportam pertencimento negativo. |
| `Attempt IN ()`, `Attempt = 1 AND` | Forneça uma lista não vazia ou um predicado completo. |
| `DueAt > "tomorrow"` | Envie um timestamp concreto. |

## Modo embedded e Waterline {#mode-support}

Esta linguagem está disponível pela API de listagem de workflows do Server. A listagem embedded atual e os filtros de vistas salvas do Waterline não implementam toda essa gramática. Os filtros exatos de metadados `key=value` e campos de substring existentes não comprovam suporte a intervalos, `IN`, `!=` ou expressões booleanas. Waterline em modo serviço também precisa de suporte explícito na interface/API antes de tratar uma vista salva como essa linguagem. O trabalho de paridade continua aberto no [recurso de consultas de visibilidade](https://github.com/durable-workflow/.github/issues/224).

A referência segue o [parser nativo publicado e seus testes unitários](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs), a [implementação de paginação HTTP](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs) e os [testes da API de listagem](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs). Eles descrevem o comportamento publicado do Server, não a conclusão da paridade embedded ou Waterline.
