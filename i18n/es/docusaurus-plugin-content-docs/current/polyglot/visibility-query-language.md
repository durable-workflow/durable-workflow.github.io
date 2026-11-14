---
title: Lenguaje de consultas de visibilidad
description: Filtre ejecuciones del Server por estado, tiempo, identidad y atributos de búsqueda tipados, con ejemplos HTTP y paginación.
---

# Lenguaje de consultas de visibilidad

Use `GET /api/workflows?query=...` para encontrar ejecuciones en un namespace del Server. Esta referencia describe el Server nativo publicado elegido en el [manifiesto de compatibilidad](../compatibility.md#last-qualified-reproducible-tuple), actualmente `%%artifact.serverVersion%%`. El listado lee datos de visibilidad almacenados. No ejecuta el manejador de una consulta con nombre del workflow.

La petición necesita un token bearer de operador o administrador, `X-Namespace` y `X-Durable-Workflow-Control-Plane-Version: 2`. Consulte la [autorización del namespace](./namespace-auth-workers.md). Los resultados incluyen ejecuciones coincidentes, también ejecuciones anteriores de una instancia e hijos cuyos atributos coinciden. No hay un predicado integrado para seleccionar solo raíces.

## Hacer una petición {#make-a-request}

Defina `DURABLE_WORKFLOW_SERVER_URL` con la URL base del Server y `DURABLE_WORKFLOW_AUTH_TOKEN` con un token de operador o administrador. El ejemplo requiere Bash, curl y jq. Sustituya el intervalo UTC fijo por el período que quiera inspeccionar.

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

`Status = failed` selecciona un grupo que incluye ejecuciones canceladas y terminadas. Use `Status = cancelled` o `Status = terminated` para esos estados exactos. `running` incluye pending, running y waiting. `completed` selecciona ejecuciones completadas. Los valores de estado no distinguen mayúsculas de minúsculas.

Use `--data-urlencode` para la consulta y el token de página. Las comillas del shell, los escapes del lenguaje y la codificación URL son pasos distintos. Una respuesta correcta con `workflows: []` significa que ninguna ejecución coincidió con la petición.

## Campos {#fields}

Los nombres de campo distinguen mayúsculas de minúsculas. Los nombres integrados tienen prioridad sobre los atributos personalizados.

| Campo | Valor | Operadores |
| --- | --- | --- |
| `WorkflowType`, `WorkflowId`, `RunId`, `TaskQueue` | Tipo de ejecución, ID de instancia, ID de ejecución o cola de tareas | `=`, `!=`, `IN`, `IN` negado |
| `Status`, `ExecutionStatus` | Estado o grupo de estados descrito arriba | `=`, `!=` |
| `StartTime`, `ExecutionTime` | Instante de inicio de la ejecución. Los nombres son alias. | Comparaciones escalares, `IN`, `IN` negado |
| `CloseTime` | Instante de cierre de la ejecución | Comparaciones escalares, `IN`, `IN` negado |
| `BuildId`, `BuildIds` | Alias del valor de compatibilidad de la ejecución, no una búsqueda de la flota de workers | Operadores de keyword, sujetos al rechazo nativo indicado abajo |

Las comparaciones escalares son `=`, `!=`, `<`, `<=`, `>` y `>=`. Si falta el instante de inicio o cierre, ninguna comparación coincide, ni siquiera una negada. El listado nativo rechaza una ejecución que devolvería con compatibilidad no nula mediante HTTP `409` / `unqualified_build_visibility`. Que un predicado de build se analice no acredita el listado por build.

Los demás campos deben ser atributos de búsqueda registrados en este namespace. Consulte las definiciones con `GET /api/search-attributes` y registre un atributo con `POST /api/search-attributes` y un cuerpo JSON como `{"name":"OrderTotal","type":"double"}`. El registro requiere un token de administrador. Un tipo almacenado inferido no vuelve consultable una clave sin registrar. Borrar una definición conserva los valores, pero invalida las consultas sobre esa clave.

Los identificadores empiezan por una letra ASCII y continúan con letras ASCII, dígitos o `_`. Use exactamente el nombre registrado. Los memos, las etiquetas de visibilidad, las claves de negocio y los nombres de relaciones padre/raíz no son campos estructurados integrados adicionales. La búsqueda simple aún puede encontrar una clave de negocio como se explica abajo.

## Tipos y comparaciones {#types-and-comparisons}

| Tipo registrado | Literales y comportamiento de comparación |
| --- | --- |
| `keyword` | Igualdad o desigualdad del texto completo, `IN` e `IN` negado. Sin ordenación. |
| `string`, `text` | Comparación del texto completo con los mismos operadores que `keyword`. Sin subcadenas, búsqueda de texto completo ni operador `LIKE`. |
| `int` | Entero sin comillas, como `42` o `-3`. Comparaciones escalares, `IN` e `IN` negado. Un número entre comillas o decimal no es un literal entero. |
| `double` | Entero o decimal sin comillas, incluida notación exponencial como `1.5e3`. Comparaciones escalares, `IN` e `IN` negado. |
| `bool` | `true` o `false` sin comillas, sin distinguir mayúsculas. Comparaciones escalares, `IN` e `IN` negado; `false` precede a `true`. `1` y `"true"` no son literales booleanos. |
| `datetime` | Fecha y hora entre comillas. Las comparaciones escalares, `IN` e `IN` negado comparan instantes. Use marcas explícitas UTC o con desplazamiento, como `"2026-11-14T12:34:56.123456Z"`. |
| `keyword_list` | `Tags = "urgent"` comprueba pertenencia. `Tags IN ("urgent", "review")` coincide con cualquiera de los miembros indicados. Se rechazan desigualdad, ordenación y pertenencia negada. |

Una ejecución sin el atributo consultado nunca coincide con ese predicado, tampoco con `!=` ni `IN` negado. No hay predicado de existencia ni `IS NULL`. Un valor conservado con otro tipo registrado anteriormente no se convierte automáticamente al tipo nuevo.

Las comparaciones de keyword, texto y campos de texto integrados siguen las reglas de igualdad de la base de datos. El esquema publicado de MySQL/MariaDB usa `utf8mb4_unicode_ci`, que ignora mayúsculas, acentos y espacios finales. SQLite y la comparación nativa de PostgreSQL son exactos. La pertenencia en listas de keywords es exacta. No presuponga resultados textuales idénticos entre estos backends.

Las fechas aceptan fechas ISO y marcas de tiempo con fracciones conservadas hasta microsegundos. Una fecha sola significa medianoche UTC; si se omite la zona, es UTC. Use marcas explícitas para consultas portables. Fechas relativas como `tomorrow` y zonas con nombre como `Europe/Paris` no son valores de fecha válidos. Calcule el intervalo móvil en el llamador y envíe límites fijos.

## Sintaxis, precedencia y escapes {#syntax-and-escaping}

- Escriba comparaciones como `Field operator literal`. Separe predicados con `AND` u `OR`. Las palabras clave no distinguen mayúsculas.
- `NOT` se aplica al siguiente predicado antes de `AND`; `AND` tiene mayor precedencia que `OR`. `A = 1 OR B = 2 AND C = 3` significa `A = 1 OR (B = 2 AND C = 3)`.
- Los paréntesis delimitan una lista `IN` no vacía separada por comas. No agrupan expresiones booleanas. Repita predicados en las ramas `OR` cuando sea necesario.
- La pertenencia negada se escribe **`NOT Region IN ("eu", "us")`**. No se admite la forma SQL `Region NOT IN (...)`. Tampoco se admite `Status IN (...)`; use `Status = running OR Status = completed`.
- Use comillas simples o dobles para cadenas. Escape la comilla elegida y una barra inversa literal con `\`. Por ejemplo, `Customer = 'O\'Brien'` y `Path = "C:\\orders"`. El parser también decodifica escapes de C como `\n`, `\t` y `\r`; `\uXXXX` de JSON no es un escape Unicode aquí. Escriba los caracteres Unicode directamente.
- Los literales de texto sin comillas permiten letras ASCII, dígitos, `_`, `.`, `:` y `-`. Prefiera texto entre comillas para evitar inferir booleanos o números por accidente. No hay cláusulas SQL `SELECT`, `ORDER BY` ni `LIMIT`.

Dentro de una expresión, un campo booleano registrado sin operador puede significar `Flag = true`, y `NOT Flag` significa `Flag = false`. Un `Flag` aislado es texto de búsqueda simple. Las comparaciones explícitas evitan esta ambigüedad.

El Server reconoce expresiones mediante sintaxis de comparación, `IN (...)` o un predicado `NOT` inicial. El resto del texto busca subcadenas en ID de workflow y clave de negocio. Por ejemplo, `query=order-1001` es búsqueda simple. Un texto similar a SQL no admitido puede tratarse como búsqueda simple en lugar de devolver un error sintáctico. Use la gramática documentada e inspeccione los errores de `query` cuando una expresión reconocida sea inválida.

## Ejemplos de consultas {#query-examples}

Pase cualquiera de estas expresiones como valor de `query` en la petición curl anterior. Los ejemplos personalizados suponen que `OrderTotal: double`, `Attempt: int`, `Region: keyword`, `Tags: keyword_list`, `Approved: bool` y `DueAt: datetime` están registrados y tienen valores en el namespace seleccionado.

| Tarea | Consulta |
| --- | --- |
| Pedidos por encima de un umbral numérico | `WorkflowType = "orders.fulfillment" AND OrderTotal > 1000` |
| Intentos en un rango inclusivo | `Attempt >= 2 AND Attempt <= 5` |
| Cualquiera de dos regiones | `Region IN ("eu", "us")` |
| Otras regiones registradas | `NOT Region IN ("eu", "us")` |
| Cualquier etiqueta de la lista | `Tags IN ("urgent", "review")` |
| False explícito | `Approved = false` |
| Una ventana temporal | `DueAt >= "2026-11-14T00:00:00Z" AND DueAt < "2026-11-15T00:00:00Z"` |
| Dos colas bajo el mismo tipo | `WorkflowType = "orders.fulfillment" AND TaskQueue = "orders" OR WorkflowType = "orders.fulfillment" AND TaskQueue = "priority"` |

## Paginación y límites {#pagination-and-limits}

| Parámetro | Comportamiento |
| --- | --- |
| `workflow_type` | Filtro opcional de tipo exacto, combinado con `query` y `status` mediante `AND`. |
| `status` | Filtro opcional. Prefiera los grupos canónicos `running`, `completed` o `failed`. El endpoint actual también acepta `cancelled` y `terminated` exactos; aquí no acepta `pending` ni `waiting`. |
| `page_size` | Entero de `1` a `200`, por defecto `50`. Use este parámetro, no `limit`. |
| `next_page_token` | Copie el token de la respuesta anterior sin decodificarlo ni construirlo. Termine cuando sea null. |

`workflow_count` es el número de esta página, no el total de ejecuciones coincidentes. Se ordenan por instante de inicio/ordenación descendente y después por ID de ejecución descendente. La paginación lee datos vivos con un offset. Mantenga namespace, consulta, filtros y tamaño de página. Inserciones, cierres y cambios de atributos pueden mover coincidencias entre peticiones y causar repeticiones u omisiones; no es una exportación instantánea. Un token inválido actualmente vuelve a la primera página en vez de producir un error.

Obtenga la siguiente página del primer ejemplo, si existe:

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

El tamaño de página limita las filas devueltas, no el trabajo de evaluar la consulta. Mantenga pequeñas las expresiones y listas `IN`, y use predicados selectivos de tipo, estado o atributos. El parser de workflows no define el límite de 2048 caracteres de la API de schedules. Servidores HTTP y proxies pueden imponer límites de URI propios. El [listado de schedules](./server-api-reference.md#schedule-list-filters) tiene otra gramática, de igualdad y `AND`.

## Consultas inválidas {#invalid-queries}

Una expresión reconocida que falla al analizarse, resolver campos o comprobar tipos devuelve HTTP `422` con `reason: "validation_failed"`, un `message` y arrays en `errors.query` y `validation_errors.query`. Un tamaño de página o estado inválido usa la clave de ese parámetro.

| Expresión inválida | Corrección |
| --- | --- |
| `Unknown = 1` | Registre el atributo en este namespace o corrija el nombre del campo. |
| `OrderTotal = "1000"` | Use el literal numérico `1000`. |
| `Approved = 1` | Use `true` o `false`. |
| `Region > "eu"` | Los keywords admiten igualdad y pertenencia, no ordenación. |
| `Tags != "urgent"` o `NOT Tags IN ("urgent")` | Las listas de keywords no admiten pertenencia negativa. |
| `Attempt IN ()`, `Attempt = 1 AND` | Proporcione una lista no vacía o un predicado completo. |
| `DueAt > "tomorrow"` | Envíe una marca de tiempo concreta. |

## Modo embedded y Waterline {#mode-support}

Este lenguaje está disponible mediante la API de listado de workflows del Server. El listado embedded actual y los filtros de vistas guardadas de Waterline no implementan toda esta gramática. Sus filtros exactos de metadatos `key=value` y campos de subcadena no acreditan rangos, `IN`, `!=` ni expresiones booleanas. Waterline en modo servicio también necesita soporte explícito de interfaz/API antes de tratar una vista guardada como este lenguaje. El trabajo de paridad sigue abierto en la [función de consultas de visibilidad](https://github.com/durable-workflow/.github/issues/224).

La referencia sigue el [parser nativo publicado y sus pruebas unitarias](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility_query.rs), la [implementación de paginación HTTP](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/src/runtime/visibility.rs) y las [pruebas de la API de listado](https://github.com/durable-workflow/server/blob/b6e04ce7e679464e91f6ceae83310d3bb3204092/rust/tests/execution/visibility.rs). Describen el comportamiento publicado del Server, no la finalización de la paridad embedded o Waterline.
