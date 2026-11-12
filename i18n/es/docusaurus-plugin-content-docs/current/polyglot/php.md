---
sidebar_position: 9
title: SDK de PHP
description: Conecta aplicaciones PHP independientes del framework y workers remotos a Server autohospedado o a un runtime gestionado de Cloud.
tags:
  - php
  - sdk
  - workers
  - polyglot
keywords:
  - sample-app-playground
  - SDK de PHP de Durable Workflow
  - worker remoto PHP
  - cliente PHP del servidor independiente
---

import ProductPromotion from '@site/src/components/ProductPromotion';

# SDK de PHP {#php-sdk}

Utiliza `durable-workflow/sdk` cuando una aplicación PHP o un worker remoto se
conecte a Durable Workflow Server independiente o a la URL del runtime de un
espacio de nombres de Durable Workflow Cloud. Este SDK oficial es independiente
del framework: ofrece cliente del plano de control, autenticación, transporte,
códec público de cargas útiles, manejador de reproducción y ciclo de vida
gestionado de workers remotos sin necesitar Laravel ni el paquete del motor integrado.

## Probar el entorno local de Sample App {#try-the-local-sample-app-playground}

Para la ruta de autoría más breve sin Cloud, abre la
[rama `main` actual de Sample App en GitHub Codespaces](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main)
y ejecuta:

<!-- docs-example id="sdk.php.sample-app-playground" -->
```bash
scripts/playground php
```

El entorno local genera código de workflow y actividad propiedad del usuario,
selecciona los artefactos estables actuales e inicia Server y Waterline
publicados. Antes de iniciar el workflow, espera un registro de worker cuya
identidad, tipo de workflow, tipo de actividad y cola coincidan con el contrato
generado. El éxito exige el resultado completado y el historial esperados;
después el terminal imprime el enlace local exacto a la ejecución en Waterline
y la ruta a la evidencia JSON estructurada.

El inicio rápido y la referencia de API mantenidos por el paquete siguen siendo
la ruta directa para añadir el SDK a un proyecto existente sin Sample App.

<ProductPromotion source="docs-v2-php-sdk">
Ejecuta clientes y workers PHP contra un espacio de nombres gestionado por Cloud
con credenciales separadas por rol.
</ProductPromotion>

Para incorporación paso a paso, integración de frameworks, pruebas, despliegue
y resolución de problemas, utiliza el [portal para desarrolladores PHP](https://php.durable-workflow.com/).
Para firmas exactas de constructores, tipos de retorno y clases de excepción,
utiliza su [referencia de API generada](https://php.durable-workflow.com/api/)
independiente. El [contrato legible por máquinas](https://php.durable-workflow.com/quickstart-contract.json)
identifica paquete, formas de runtime, credenciales por rol, archivos de código
incluidos, resultado esperado y prueba básica con artefactos publicados como una
única ruta probada.

Los clientes de Cloud utilizan la URL del runtime y el espacio de nombres
devueltos al aprovisionar, con credenciales separadas de cliente y worker.
Consulta [Runtime gestionado de Cloud](/docs/polyglot/cloud-control-plane) para
ese límite de conexión; los ejemplos siguientes utilizan el mismo SDK con
valores locales autohospedados.

Utiliza `durable-workflow/workflow` para la ruta independiente de Laravel
integrado, donde la aplicación posee el estado de workflows en su base de datos
y ejecuta el trabajo mediante sus colas Laravel. Consulta
[Modos de despliegue](/docs/polyglot/deployment-modes/) para comparar responsabilidades.

## Requisitos {#requirements}

- PHP 8.1 o posterior para el SDK independiente del framework
- Para el puente Laravel de modo servicio en el SDK PHP 3.10 y posteriores: PHP
  8.2 o posterior y Laravel 12.69 o posterior en 12.x, o Laravel 13.30 o
  posterior en 13.x con PHP 8.3 o posterior
- Un [Server autohospedado](/docs/polyglot/server/) accesible o un
  [runtime de espacio de nombres de Cloud](/docs/polyglot/cloud-control-plane) aprovisionado

## Instalar {#install}

Instala el SDK de PHP publicado actual. El requisito exacto siguiente se genera
desde la autoridad de artefactos publicados actualizada desde el registro, y
Composer guarda el paquete resuelto en `composer.lock`:

<!-- docs-example id="php.sdk.install" -->
```bash
composer require %%artifact.publishedPhpSdkComposerPackage%%
```

El SDK utiliza el paquete Composer oficial `apache/avro` para el sobre público
de cargas útiles. Sus dependencias de producción excluyen Laravel, Illuminate,
`durable-workflow/workflow` y `durable-workflow/server`.

## Iniciar e inspeccionar un workflow {#start-and-inspect-a-workflow}

El inicio rápido del SDK crea un proyecto Composer limpio, define un workflow
y una actividad con atributos, inicia el worker, inicia un workflow único y
espera el resultado. Los mismos archivos incluidos `bootstrap.php`, `worker.php`
y `client.php` se instalan desde el paquete y se ejecutan en la prueba protegida
de artefactos publicados; esta página no mantiene una segunda copia del código.

Elige únicamente el valor de conexión al runtime:

| Runtime | Valor pasado a `Client` | Comportamiento de las rutas de solicitud del SDK |
| --- | --- | --- |
| Server autohospedado | Origen sin ruta, como `http://localhost:8080` | Añade un segmento `/api`; quien llama no añade `/api`. |
| Durable Workflow Cloud | URI aprovisionada completa, como `https://cloud.example/api/runtime/v1/namespaces/<runtime-id>` | Conserva la ruta del runtime del espacio de nombres y añade después `/api` del endpoint. |

Abre la [ruta PHP probada](https://php.durable-workflow.com/) para los comandos
exactos y el código visible. Las operaciones de cliente leen
`DURABLE_WORKFLOW_CLIENT_TOKEN`; el sondeo del worker lee
`DURABLE_WORKFLOW_WORKER_TOKEN`. La guía mantiene estas credenciales en procesos
separados sin imprimirlas ni guardarlas en Git.

`Worker::register()` descubre manejadores `#[Workflow]` y `#[Activity]` en el
mismo archivo. La guía también documenta la alternativa directa
`registerWorkflow()`/`registerActivity()` para código basado en funciones.
El arranque evita que el usuario tenga que elegir la ruta del autoloader cuando
estos archivos se ejecutan en un proyecto independiente, checkout del SDK,
paquete instalado o entorno/contenedor que los sitúe junto al directorio
Composer `vendor/`.

`WorkflowHandle` sigue la ejecución actual después de continuar como nuevo.
Utiliza sus métodos de ejecución seleccionada si una operación debe quedar
restringida a una ejecución concreta.

## Ciclo de vida, actualizaciones, programaciones y visibilidad {#lifecycle-updates-schedules-and-visibility}

El cliente público actual ofrece más que resultados de una ejecución seleccionada:

- `WorkflowHandle` ofrece `describe`, `result`, `signal`, `query`, `cancel`
  y `terminate`, con variantes de ejecución seleccionada para mayor seguridad.
- `Client` ofrece `listWorkflows` con filtrado y paginación del servidor,
  `workflowHistory`, `updateWorkflow`, `cancelWorkflow` y
  `terminateWorkflow`.
- `requestCancellation()` solicita limpieza acotada a workers cooperativos.
  Los métodos existentes `cancel()` y `cancelWorkflow()` cierran la ejecución
  inmediatamente. Consulta [cancelación cooperativa](/docs/polyglot/cancellation)
  para el contrato de autoría y recuperación.
- Los métodos de programación permiten crear, describir, listar, actualizar,
  pausar, reanudar, disparar, ejecutar retroactivamente y eliminar.
- La visibilidad operativa incluye `listNamespaces`, `listWorkers` y
  `listTaskQueues`, con los métodos de descripción correspondientes.

Los workers remotos registran manejadores de workflow, actividad, consulta y
actualización mediante `registerWorkflow`, `registerActivity`, `registerQuery`
y `registerUpdate`. Consulta la [referencia generada del SDK de PHP](https://php.durable-workflow.com/api/)
para los parámetros y tipos de retorno completos.

## Contexto de reintentos y ejecución propietaria de una actividad {#activity-retry-context}

El SDK de PHP **3.6.1 o posterior** expone `$context->retryInfo`, `$context->workflowId` y `$context->runId` en las actividades en modo servicio. Compruebe `$context->retryInfo->isLastConfiguredAttempt() === true` para detectar el último intento configurado de una política limitada. `attemptNumber` conserva el número de intento recibido originalmente.

La instantánea distingue tres estados: `policyProvided === false` indica que la reclamación omitió la política; un valor raíz `null` recibido representa una política heredada desconocida; un objeto con `max_attempts: null` explícito significa intentos ilimitados. Que `maxAttempts()` devuelva `null` no basta para afirmar que los reintentos son ilimitados. El SDK no inventa un límite predeterminado. La cancelación, los fallos no reintentables, el cierre del workflow y los plazos vencidos pueden terminar la ejecución antes de agotar el límite.

Los ID del workflow y de la ejecución identifican la ejecución propietaria original. Las identidades heredadas ausentes permanecen en `null`. Las actividades locales conservan los ID conocidos del padre sin heredar una política de reintentos remota. Para enviar una señal al workflow propietario, exija ambos ID, dirija la señal a `runId` y reutilice un ID de solicitud estable del evento de negocio entre reintentos.

Procese las señales de forma idempotente para el evento de negocio. Un ID de solicitud estable por sí solo no garantiza la admisión única de la señal.

Consulte los [ejemplos completos del último intento y de señales a la ejecución propia](https://php.durable-workflow.com/build/workflows-activities/) en la guía del SDK de PHP.

## Heartbeats de actividad {#activity-heartbeats}

Para actividades remotas, llame a `ActivityContext::heartbeat($details)` durante trabajo de actividad acotado, con suficiente antelación al tiempo de espera de heartbeat. La primera ventana empieza al reclamar la actividad en el entorno de ejecución, no cuando PHP recibe la tarea. La latencia de las peticiones, las pausas y los reintentos de transporte consumen esa ventana. Siga las [recomendaciones de cadencia](../features/heartbeats.md#heartbeat-cadence-and-receipts).

El método devuelve `void`. En la ruta directa del manejador, una respuesta de detención lanza `ActivityCancelled`. Los fallos HTTP y de transporte de `Client::heartbeatActivityTask()` aparecen como `ServerException`. Un worker con supervisión cooperativa puede detener o abandonar su callback cuando falla un heartbeat o una comprobación de titularidad, en vez de entregar una respuesta normal al código de actividad. No suponga que la limpieza siempre se ejecutará, no suprima un error de pérdida de autoridad ni envíe éxito después de perderla.

Que la llamada retorne no confirma el trabajo externo ni proporciona un punto de control reanudable. Mantenga idempotentes los efectos externos y no trate un reintento de transporte como una nueva ventana de heartbeat.

## Ejecutar un worker PHP remoto {#run-a-remote-php-worker}

Los manejadores de workflow son funciones ordinarias que ejecutan código
secuencial en una Fiber gestionada. Llama directamente a operaciones como
`WorkflowContext::activity()`; el SDK suspende la Fiber en decisiones duraderas
y devuelve resultados registrados durante la reproducción sin repetir la
actividad externa. No declares workflows como Generator ni uses yield con
comandos `WorkflowContext`: se rechazan los resultados Generator. El worker
gestionado registra tipos de workflow y actividad, sondea el protocolo público,
envía latidos, completa o falla tareas y gestiona el apagado ordenado cuando
`pcntl` está disponible.

### Selección de la primera finalización {#first-completion-selection}

Utiliza `WorkflowContext::select()` para iniciar actividades diferidas
independientes, workflows hijos, temporizadores, esperas de condición o barreras
ordinarias anidadas y continuar desde el primer ganador confirmado de forma
duradera. El `SelectionResult` devuelto contiene claves e identidades estables
y un handle por miembro:

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

La selección no cancela los miembros que no ganan. Llama a `await()` en un
handle para consumir su resultado eventual o a `cancel()` para registrar una
cancelación explícita. Un worker recién iniciado o la reproducción de historial
completo consume el ganador registrado aunque las entradas duplicadas o tardías
y los eventos terminales lleguen en otro orden. `cancel()` devuelve void y no
informa del resultado terminal. Solo el evento `SelectionOperationCancelled`
demuestra que ganó la cancelación; la reproducción avanza más allá de una
solicitud sin marca y, si la operación terminó primero, `await()` sigue devolviendo
ese resultado.

### Duraciones {#durations}

Desde PHP SDK 3.9.0, los temporizadores y tiempos de espera de los workflows
admiten las mismas formas de duración que el paquete Laravel integrado. `sleep()`,
`deferTimer()`, el `timeout` de `waitCondition()` y `deferCondition()`, las
opciones de tiempo de espera de actividades, las opciones
`execution_timeout_seconds` y `run_timeout_seconds` de los workflows hijos y la
opción `wait_timeout_seconds` de las operaciones de servicio aceptan segundos
como int o float, una cadena como `'30 minutes'`, o un `DateInterval` o
`CarbonInterval`:

```php
use Carbon\CarbonInterval;

$verified = $ctx->waitCondition(
    static fn (): bool => $ctx->signals('verify') !== [],
    key: 'email-verified',
    timeout: '30 minutes',
);

$ctx->sleep(CarbonInterval::hours(2));

$receipt = $ctx->activity('payments.capture', [$orderId], [
    'start_to_close_timeout' => '30 seconds',
    'schedule_to_close_timeout' => '10 minutes',
]);
```

Cada valor se convierte una sola vez a segundos enteros, redondeando hacia
arriba, de modo que `'30 minutes'`, `1800` y `CarbonInterval::minutes(30)`
registran el mismo historial. Las cadenas se convierten exactamente como hacen
`timer()` y `await()` integrados. El SDK rechaza las cadenas ISO 8601 como
`'PT30M'` (pasa `new DateInterval('PT30M')` en su lugar), los valores negativos,
las fracciones de un mes o de una unidad de calendario mayor, las partes con más
de 15 dígitos enteros y el texto que no se puede interpretar. Una cadena numérica como
`'30'` conserva su significado anterior: los temporizadores y los tiempos de
espera por condición la redondean hacia arriba a segundos enteros, y las
opciones de actividades y workflows hijos la pasan sin cambios. Una duración
cero es válida para temporizadores, esperas por condición y
`wait_timeout_seconds`; los tiempos de espera de actividades y workflows hijos
requieren al menos un segundo. Las versiones anteriores del SDK solo aceptan
segundos. PHP SDK 3.9.0 añade `nesbot/carbon` (`^2.72.6|^3.8.4`) como
dependencia obligatoria, de modo que las duraciones se convierten con el mismo
analizador que el paquete integrado. La
[referencia de duraciones del PHP SDK](https://php.durable-workflow.com/build/workflows-activities/#durations)
enumera todas las unidades.

## Compatibilidad de entrada y recuperación {#entry-compatibility-and-recovery}

**Soporte publicado.** El SDK PHP 2.5.4 incorporó la protección de entrada descrita a continuación, con enrutamiento y recuperación en Server 2.9.9. Son las versiones mínimas para estas funciones; instale las versiones estables actuales para recibir correcciones de seguridad.

El worker gestionado comprueba la entrada posicional registrada del manejador antes de entrar en su Fiber. La ausencia de argumentos obligatorios o un tipo PHP declarado incompatible provoca `DurableWorkflow\Exception\WorkflowEntryArgumentsMismatch` y el motivo de tarea `workflow_entry_arguments_mismatch`. Los valores predeterminados opcionales solo rellenan entradas omitidas; nunca reemplazan un valor registrado incompatible. Un `TypeError` lanzado después de entrar correctamente sigue siendo un fallo de aplicación.

El worker anuncia `workflow_entry_arguments_validation` automáticamente. Con el soporte correspondiente de Server, la tarea rechazada queda bloqueada para replay y el original permanece no terminal. Un runtime anterior puede reintentar la tarea fallida, por lo que actualizar solo el SDK no establece el contrato completo de recuperación.

Inspeccione el original con `Client::describeWorkflow($workflowId, $runId)` y el endpoint de depuración de la ejecución seleccionada. Restaure código compatible antes de llamar a `Client::repairWorkflow($workflowId, $runId)` y compruebe que esa misma ejecución continúa sin cambiar la entrada, el historial, la identidad de enrutamiento ni los plazos. No capture este fallo dentro del cuerpo del workflow ni repare repetidamente código incompatible. Consulte el [procedimiento de recuperación de servicio](../failures-and-recovery.md#service-entry-recovery) y el [enrutamiento de definiciones](./worker-compatibility-routing.md#definition-fingerprint-evolution).

## Modo servicio con frameworks y Laravel integrado {#framework-service-mode-and-embedded-laravel}

El mismo paquete incluye puentes oficiales de
[modo servicio para Laravel](https://github.com/durable-workflow/sdk-php#laravel-service-mode)
y [modo servicio para Symfony](https://github.com/durable-workflow/sdk-php#symfony-service-mode).
Conservan la inyección de dependencias, configuración, registros, workers de
consola y dobles de prueba del framework al conectarse a Cloud o Server.

Estos puentes se distinguen de los [workflows integrados en Laravel](/docs/installation/),
donde `durable-workflow/workflow` hace que la propia aplicación posea el estado
duradero y ejecute mediante colas Laravel. Consulta
[Adopción de Laravel y transición de runtime](/docs/laravel-adoption/) para el
mismo caso representativo en v1, v2 integrado y este puente de modo servicio,
incluidos drenaje y reversión. Utiliza [Modos de despliegue](/docs/polyglot/deployment-modes/)
para una comparación más amplia de límites del runtime.

## Actualizar a PHP SDK 3.12 a 3.14 {#upgrade-to-3-12-through-3-14}

PHP `^8.1`, los mínimos del puente Laravel, el protocolo de workers `1.20` y el plano de control `2` no cambian respecto a 3.11. Revise estos cambios de comportamiento antes de desplegar:

- **Actualizaciones que superan su espera.** Desde 3.13, cuando una espera `waitFor: 'completed'` termina antes de que la actualización acabe, `Client::updateWorkflow()` y `WorkflowHandle::update()` lanzan `UpdateStillPending`. Las versiones anteriores devolvían el recibo del Server como si fuera el resultado de la actualización. Para seguir esperando, vuelva a llamar a la actualización con `$pending->requestId`. Eso no aplica la actualización dos veces.
- **Registro de worker obsoleto.** Desde 3.13, `Worker::run()` vuelve a registrarse tras `stale_worker_registration` en lugar de detenerse. Las tareas que tenía el worker aislado se descartan sin completarse y el Server las vuelve a entregar. Cada recuperación registra `worker.reregistered` e incrementa `durable_workflow_worker_reregistrations`. Pase `stopOnStaleRegistration: true` para conservar el comportamiento anterior.
- **Backoff de actividades locales.** Desde 3.13, una actividad local con más reintentos que entradas en `backoff_seconds` repite el último retraso en lugar de reintentar de inmediato, como las actividades programadas por el Server.
- **Esperas de condición en grupos en el Server native.** El Server native todavía no acepta una espera de condición o de señal dentro de `all()` o `parallel()`. Desde 3.13.1, el worker hace fallar esa tarea de workflow con `grouped_condition_wait_unsupported` y sigue en ejecución, en lugar de terminar. Espere la condición fuera del grupo.

Novedades de estas versiones:

- **Sufijos de historial sticky (3.14).** Los workers anuncian `sticky_history_suffix`. En Server 3.5.0 o posterior, un worker que ya tiene el historial de una ejecución recibe solo los eventos posteriores a la secuencia que guardó en caché. Un sufijo que no continúa exactamente el historial en caché se descarta y se obtiene el historial completo. Los Servers anteriores siguen enviando el historial completo.
- **Origen del schedule (3.13).** `WorkflowContext::scheduleOrigin()` devuelve el id del schedule, la hora de ocurrencia y el número de disparo que iniciaron la ejecución, o `null` en un inicio normal. El valor es el mismo en el replay. Desde Server 3.5.0, una ejecución que continúa como nueva conserva su origen de schedule.
- **Continuaciones de actividad (3.12).** Pase `enableActivityContinuation: true` al constructor de `Worker` para enviar los siguientes comandos del workflow junto con un resultado de actividad correcto cuando el Server anuncia `activity_workflow_continuation` (Server native 3.4.0 o posterior). El valor predeterminado es `false`. Use 3.12.1 o posterior si lo activa, y vacíe o desactive esos workers antes de bajar de versión el Server o añadir nodos de Server anteriores.

Consulte el [registro de cambios de 3.14.0](https://github.com/durable-workflow/sdk-php/blob/3.14.0/CHANGELOG.md) para ver la lista completa.

## Actualizar al SDK PHP 3.10 y 3.11 {#upgrade-to-3-10-and-3-11}

Lee la [guía de actualización del SDK PHP](https://github.com/durable-workflow/sdk-php/blob/3.11.0/docs/portal/operate/upgrading.md)
antes de desplegar. Actualiza a la vez todos los workers que puedan recibir
trabajo de una cola de tareas, incluidos los grupos en espera y de autoescalado.

- **Puente Laravel.** Desde 3.10, el puente Laravel de modo servicio sigue a
  Workflow 2.21: PHP `^8.2` y Laravel con parches `^12.69.0|^13.30.0`. Laravel
  10 y 11 dejan de ser compatibles. El proveedor rechaza versiones del
  framework y de PHP no compatibles o desconocidas antes de registrar nada. El
  SDK básico mantiene PHP `^8.1` y la compatibilidad con Symfony 6.4/7/8.
- **Huellas de condición.** Desde 3.10, las nuevas esperas de condición
  registran huellas de predicado v2 (`dwphp2:sha256:`). Los workers anteriores
  las rechazan, por lo que revertir los workers a una versión anterior a 3.10
  cuando ya existen esperas v2 puede hacer fallar el replay. Detén o drena los
  workers anteriores antes de que arranquen los de reemplazo, despliega el
  código PHP de forma atómica y reinicia todos los workers de larga duración,
  incluidos los que usan OPcache. Los workers que reproducen esperas v2
  necesitan el tokenizer de PHP. Las esperas v1 existentes siguen exigiendo una
  coincidencia exacta de la línea de código fuente.
- **Credenciales estáticas.** Desde 3.10, las credenciales estáticas se validan
  tal como se proporcionan. El UTF-8 mal formado, los espacios en blanco Unicode
  en cualquiera de los extremos y los caracteres de control incrustados ahora
  fallan en lugar de recortarse o ignorarse. Revisa los valores compartidos, de
  cliente, de worker y de traspaso entre procesos del framework antes de
  actualizar.
- **Plazos por ocurrencia.** En 3.11, una nueva espera de condición de nivel
  superior conserva su primer plazo tras los despertares falsos cuando el
  Server anuncia `condition_wait_occurrence_deadline` (Server nativo 3.3.0 o
  posterior). Sin esa capacidad, los workers envían los mismos comandos que
  antes. Las esperas de condición agrupadas todavía no la activan. Con un
  Server anterior, actualiza a 3.11 todos los workers de la cola antes de
  actualizar el Server. Con un Server que ya anuncia la capacidad, drena o
  detén todos los workers anteriores antes de que cualquier worker 3.11 consuma
  la cola. Una vez que exista una espera anclada, no reviertas los workers de
  esa cola a una versión anterior a 3.11.

El SDK PHP 3.10 también añade `WorkflowContext::startChildWorkflow()`, que
devuelve un `ChildWorkflowHandle` una vez confirmado el inicio del hijo y
necesita un runtime que anuncie `child_workflow_start_turn`. Otras novedades son
`ActivityContext::activityExecutionId`, declaraciones tipadas opcionales para
`upsertSearchAttributes()`, iteradores diferidos de listas e historial de
workflows y la opción de Worker `enableCompletionPipelining`, que de forma
predeterminada es `false`. Los sondeos transportados en la finalización solo se
usan cuando el runtime los anuncia. Consulta el
[registro de cambios de 3.11.0](https://github.com/durable-workflow/sdk-php/blob/3.11.0/CHANGELOG.md)
para ver la lista completa.

## Límites de protocolo y versiones {#protocol-and-release-boundary}

El SDK declara el intervalo de servidores admitidos, la versión de protocolo
de workers, la versión del plano de control y los códecs en los metadatos
Composer. El servidor también publica sus protocolos y códecs aceptados en
`GET /api/cluster/info`. Comprueba el descubrimiento del runtime al desplegar
en lugar de inferir compatibilidad de una versión de parche del servidor.

El SDK de PHP tiene versiones independientes del paquete Laravel. Mantén la
versión publicada exacta en los ejemplos ejecutables y revisa las notas de
publicación al actualizar. La compatibilidad depende del contrato declarado
del SDK, no de que coincidan los números de versión de paquetes.

## Referencias relacionadas {#related-references}

- [Server independiente](/docs/polyglot/server/)
- [Modos de despliegue](/docs/polyglot/deployment-modes/)
- [Protocolo de workers](/docs/polyglot/worker-protocol/)
- [Índice de capacidades](/docs/capabilities/)
- [Portal para desarrolladores PHP](https://php.durable-workflow.com/)
- [Referencia de API de PHP](https://php.durable-workflow.com/api/)
- [Contrato ejecutable de inicio rápido de PHP](https://php.durable-workflow.com/quickstart-contract.json)
- [Código del SDK de PHP](https://github.com/durable-workflow/sdk-php)

## Páginas de lista e historial de workflows {#workflow-list-and-history-pages}

Estas llamadas publicadas devuelven **una página**, no una lectura completa automática: `Client::listWorkflows(...)` / `Client::workflowHistory(...)`. Continúe con el token opaco devuelto manteniendo namespace, filtros y workflow/ejecución seleccionados; termine con token nulo/vacío y gestione los errores de página. Una página parcial no es un bundle de reproducción. Use la API de exportación de historial del SDK para reproducción sin servidor. El [cliente publicado PHP 3.2.0](https://github.com/durable-workflow/sdk-php/blob/3.2.0/src/Client.php) define los parámetros de página.

El SDK PHP 3.10.0 y posteriores también ofrecen `Client::iterateWorkflows()` y `Client::iterateWorkflowHistory()`. Leen de forma diferida un listado completo de workflows o el historial de una ejecución exacta, una página cada vez, conservando el cursor opaco, el namespace y los filtros. Los errores de páginas posteriores se propagan, y las continuaciones mal formadas o los ciclos de tokens se rechazan en lugar de truncar el resultado o entrar en bucle. Consulte el [cliente publicado PHP 3.11.0](https://github.com/durable-workflow/sdk-php/blob/3.11.0/src/Client.php).

## Informes de error acotados {#bounded-failure-reports}

El SDK de PHP **3.5.0** incorporó informes de error salientes acotados. Los valores predeterminados son **62 KiB UTF-8 para el mensaje**, **128 KiB para la pila**, **64 KiB para los detalles y diagnósticos opcionales serializados en conjunto** y **1 MiB para el cuerpo completo codificado en JSON**. Los marcadores, el escape JSON, la identidad de la concesión y los demás comandos del lote cuentan para ese límite del cuerpo. Tiene prioridad cualquier límite de transporte configurado o declarado por el transporte que sea menor. Se conservan el tipo, la clase y el código del error, la política de reintentos y la identidad de la concesión.

`withFailureReportLimit()` devuelve un nuevo cliente con un presupuesto menor para la solicitud completa, de 1 a 1.048.576 bytes. Usa la instancia devuelta. También se aplica un límite inferior declarado por el transporte.

```php
<?php

use DurableWorkflow\Client;

$client = (new Client(
    baseUri: 'https://workflow.example.com',
    controlToken: 'operator-token',
    workerToken: 'worker-token',
))->withFailureReportLimit(512 * 1024);
```

Un marcador visible de truncamiento y los recuentos originales de bytes identifican los campos recortados. Los detalles Avro se conservan íntegros o se omiten por completo. Si una envoltura obligatoria no puede representarse, se lanza `DurableWorkflow\Exception\FailureReportRefused` antes del envío HTTP. Los errores locales se normalizan antes de que el código del workflow los observe, por lo que la primera ejecución y la reproducción en frío ven el mensaje persistido. Un mensaje local ya observado permanece inmutable durante el ajuste final del lote.
