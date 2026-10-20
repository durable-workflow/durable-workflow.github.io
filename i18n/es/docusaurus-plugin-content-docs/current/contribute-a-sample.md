---
sidebar_position: 9
tags:
  - sample-app
  - contributing
  - patterns
keywords:
  - aportar un ejemplo
  - contribución de ejemplos de durable workflow
  - proceso de sample-request
  - workflow de ejemplo externo
---

# Aportar un ejemplo {#contribute-a-sample}

La [aplicación de ejemplo](/docs/sample-app) es el lugar de referencia para
mostrar cómo se aplica un patrón de Durable Workflow en un proyecto Laravel real.
Si tienes un patrón que ayude a otros ingenieros, como una variante de saga que
aún no mostramos, otra forma de usar flujos de mensajes o una integración con una
herramienta que los ejemplos actuales no utilizan, esta guía explica cómo
conseguir que se integre.

Este contrato es breve a propósito. Un ejemplo que lo cumple se integra con una
cadencia predecible. Si omite alguna parte, permanece en revisión hasta que se
completen las carencias.

## Antes de escribir código {#before-you-write-code}

1. **Abre primero una incidencia `sample-request`.** La
   [plantilla `sample-request`](https://github.com/durable-workflow/sample-app/issues/new/choose)
   identifica el patrón, la página de documentación pública que lo define y la
   versión mínima del paquete Durable Workflow que necesita. En la incidencia,
   mantenedores y colaborador acuerdan que merece la pena integrar el ejemplo
   *antes* de que el colaborador invierta tiempo en un PR.
2. **Elige un patrón que todavía no exista en el índice de ejemplos.** El
   [índice de ejemplos del README](https://github.com/durable-workflow/sample-app#sample-index)
   enumera todos los patrones cubiertos. Si la idea se reduce a «otra forma de
   escribir el workflow simple», corresponde a un ajuste de documentación de
   `App\Workflows\Simple\SimpleWorkflow`, no a un ejemplo nuevo.
3. **Busca la clase de workflow existente más parecida.** Un ejemplo nuevo debe
   parecerse a los que lo rodean: la misma estructura de directorios bajo
   `app/Workflows/<Pattern>/`, el mismo formato de comando Artisan y el mismo
   enfoque de pruebas. Se rechazan los ejemplos que inventan una estructura
   propia, aunque el patrón sea útil.

## Qué incluye un ejemplo integrado {#what-a-merged-sample-looks-like}

Un ejemplo integrado es *ejecutable*, *didáctico*, *probado* y *visible*.
Esto se traduce en cuatro elementos concretos del repositorio sample-app:

1. **Una clase de workflow** bajo `app/Workflows/<Pattern>/` que muestre el
   patrón de principio a fin. El código del workflow debe ser determinista:
   lecturas del reloj mediante `sideEffect()`, trabajo externo en actividades y
   esperas mediante señales, actualizaciones, temporizadores o flujos de
   mensajes. La clase debe compilar sin `OPENAI_API_KEY` ni otras credenciales
   externas, salvo que el patrón las requiera expresamente.
2. **Un comando Artisan** que inicie el workflow con una entrada realista para
   que el lector pueda ejecutar un comando y ver la ejecución en Waterline.
   El comando se coloca junto a los comandos correspondientes en
   `routes/console.php` (o la entrada de registro equivalente) y usa la misma
   convención de nombres (`app:<short-pattern>`).
3. **Una entrada en `config/workflow_mcp.php`** que indique la clase de workflow,
   el patrón, el comando, las credenciales necesarias y los argumentos. Esta
   entrada permite descubrir el ejemplo mediante el servidor MCP. La validación
   de cobertura de funcionalidades ascendentes no marca una fila como `covered`
   hasta que la entrada existe.
4. **Una prueba bajo `tests/`** que ejecute el workflow con el worker v2 en
   memoria. No hace falta comprobar cada evento tipado del historial, pero sí
   demostrar que el workflow termina con la entrada que pasa el comando Artisan.

Si el ejemplo muestra una *corrección de un error* en vez de una funcionalidad,
se coloca en `app/Workflows/Bug/<short-id>/`, con los mismos cuatro elementos.

## Qué debe incluir la documentación {#what-goes-in-the-docs}

Al integrar un ejemplo se actualizan tres lugares de la documentación:

- **«Sample Index» del README** del repositorio sample-app: una fila por ejemplo,
  con el objetivo, la clase de workflow, el comando Artisan y la clave MCP.
  Esta es la fuente de referencia.
- **Galería de ejemplos del sitio de documentación
  ([`docs/sample-app.md`](/docs/sample-app))**: una fila equivalente con la pantalla
  de Waterline que debería ver el lector. La galería permite decidir si el
  ejemplo es el adecuado antes de clonar el repositorio.
- **Enlace desde la página del patrón** del sitio de documentación que define
  la funcionalidad (sagas, señales, flujos de mensajes, workflows hijos, etc.).
  La tabla de enlaces al final de la página de sample-app es la lista de
  referencia. Una entrada que menciona una funcionalidad sin enlazar un ejemplo
  se considera una carencia.

Envía el ejemplo y los cambios del README en el PR de sample-app, y los cambios
de la galería y de las páginas de patrones en un PR enlazado del sitio de
documentación. Los mantenedores integran los cambios relacionados juntos.
Un ejemplo integrado sin su equivalente en el sitio queda en estado `gap` en
el seguimiento de cobertura hasta que llegue el PR de documentación. Por eso se
recomienda entregarlos juntos.

## Nombres, estructura y estilo {#naming-layout-and-style}

- **Estructura de clases.** `app/Workflows/<Pattern>/<Pattern>Workflow.php`, con
  las clases de actividad en `app/Workflows/<Pattern>/Activities/`. Los ejemplos
  que reproducen errores van en `app/Workflows/Bug/<short-id>/`, con la misma
  estructura.
- **Comando Artisan.** `app:<short-pattern>` (en minúsculas y sin guiones).
  No se usan nombres largos (`app:run-<pattern>`).
- **Clave MCP.** Debe coincidir con el patrón corto del comando Artisan, para
  que el cliente MCP vea el mismo nombre que escribe una persona en el terminal.
- **Comentarios.** Explica el *porqué*, no el *qué*. Merece la pena comentar las
  invariantes de seguridad durante la reproducción (por qué un valor se obtiene
  con `sideEffect()`, o una espera usa un temporizador en vez de `usleep()`).
  No hace falta repetir el mismo comentario en cada llamada a una actividad.
- **Capturas de Waterline.** La galería de sample-app identifica la pantalla de
  Waterline que debe producir el ejemplo. Añádela o actualízala en el PR.

## Motivos de rechazo de un ejemplo {#what-gets-a-sample-rejected}

Se solicita corregir un ejemplo cuando:

- el código del workflow usa `now()`, `random_*()` u otras llamadas no
  deterministas fuera de `sideEffect()` o de una actividad;
- las actividades realizan tareas de persistencia duradera que ya corresponden
  al motor, como escribir directamente filas de `workflow_messages`, avanzar
  cursores de flujos manualmente o persistir estado de Waterline desde el código
  del workflow;
- el comando Artisan requiere credenciales externas sin indicarlo en el campo
  `requires` de la entrada MCP;
- la fila del índice del README, la fila de la galería y el enlace de la página
  del patrón no se entregan todos en el mismo cambio;
- el ejemplo reproduce un patrón existente sin mostrar nada nuevo (otra forma,
  otro modo de fallo u otra integración). «El mismo patrón con otro texto» es
  un cambio de documentación, no un ejemplo.

Son los mismos aspectos que comprueban la validación de cobertura y la lista de
revisión de sample-app. Detectarlos antes de abrir el PR agiliza su integración.

## Lista de comprobación rápida {#quick-checklist}

Usa esta lista al abrir el PR:

- [ ] Existe una incidencia `sample-request` con un enlace a la documentación
      pública del patrón.
- [ ] Clase de workflow bajo `app/Workflows/<Pattern>/`.
- [ ] Comando Artisan registrado con el nombre `app:<short-pattern>`.
- [ ] Entrada en `config/workflow_mcp.php` con clase, patrón, comando,
      requisitos y argumentos.
- [ ] Prueba que ejecute el workflow de principio a fin.
- [ ] Fila en «Sample Index» del README.
- [ ] Fila de la galería en
      [`docs/sample-app.md`](/docs/sample-app).
- [ ] Enlace desde la página del patrón correspondiente del sitio.
- [ ] Comprobación de límites públicos sin problemas (`scripts/check-public-boundary.sh`).

Los mantenedores usan la misma lista en la revisión. Un PR que cumple todos los
puntos debería integrarse en un ciclo de publicación.
