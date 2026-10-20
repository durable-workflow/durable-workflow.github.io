---
sidebar_position: 13
title: Migración a 2.0
description: Actualiza una aplicación existente de Laravel Workflow v1 a Durable Workflow v2.
tags:
  - migration
  - upgrade
  - v2
keywords:
  - migrar a Durable Workflow v2
  - actualización de Laravel Workflow
  - migración del esquema v2
  - workflow de v1 a v2
---

# Migración a 2.0 {#migrating-to-20}

Esta guía cubre los cambios principales al actualizar una aplicación Laravel v1
a v2. Primero decide si Laravel seguirá operando el entorno o se conectará a
Cloud o Server mediante el SDK PHP en la
[guía de adopción y transición de Laravel](/docs/laravel-adoption/).
Esta página detalla después la actualización del paquete integrado de v1 a v2.

## Procedimiento de actualización {#upgrade-procedure}

### Antes de actualizar {#before-upgrading}

**1. Inventariar todos los almacenes de ejecución v1**

El estado v1 no está necesariamente solo en la base de workflows. Además de
filas e historial, puede haber trabajos Laravel listos, diferidos o reservados
en Redis, una base de colas, SQS u otro backend. Antes de cambiar código, registra:

- conexión de almacenamiento y mapeos reales de modelos/tablas v1
- todas las conexiones y nombres de cola de workflows y actividades v1,
  incluidas excepciones por workflow o actividad
- base, prefijo de claves, región, cuenta y otros parámetros del backend
  necesarios para restaurar las mismas colas
- referencia del gestor de secretos y versión inmutable que recuperan la
  `APP_KEY` exacta, y almacenes de caché de bloqueos de trabajos únicos v1

No copies al inventario el valor de `APP_KEY`, credenciales para recuperarla,
credenciales de base ni del proveedor de colas. Los trabajos cifrados y argumentos
serializados necesitan la clave original, pero el manifiesto solo debe contener
su referencia y versión. Protege por separado de las copias SQL y de colas las
credenciales que permiten recuperarla.

Las tablas v1 predeterminadas son `workflows`, `workflow_logs`,
`workflow_signals`, `workflow_timers`, `workflow_exceptions` y
`workflow_relationships`. La configuración publicada puede sustituir
`stored_workflow_model`, `stored_workflow_log_model`,
`stored_workflow_signal_model`, `stored_workflow_timer_model` o
`stored_workflow_exception_model`. Un modelo alternativo puede redefinir `$table`
de Eloquent. `workflow_relationships_table` controla aparte la tabla de relaciones.
Respalda las tablas y conexión resueltas por esos modelos, no solo los nombres
predeterminados.

**2. Elegir un límite de reversión y detener la actividad v1**

Impide inicios y señales nuevos al capturar el punto de recuperación. Pausa
programadores y detén todos los workers capaces de consumir las colas
inventariadas cuando termine su trabajo actual. Por ejemplo:

```bash
# Horizon
php artisan horizon:pause

# Supervisor or systemd (use the names from your deployment)
sudo supervisorctl stop <your-worker-group>:*
sudo systemctl stop laravel-worker
```

`php artisan queue:restart` por sí solo no detiene la actividad si Supervisor,
systemd, Kubernetes u otro gestor inicia inmediatamente otro worker. Confirma
que ningún consumidor puede reservar otro trabajo antes de capturar el estado.

Elige y registra una política:

- **Drenar v1:** bloquea trabajo nuevo y deja workers activos hasta que
  `php artisan workflow:v1:list` (si existe) o una consulta equivalente de la
  tabla configurada no muestre workflows no terminales. Detén workers y confirma
  que no quedan trabajos v1 listos, diferidos o reservados en las colas. Una
  reversión solo SQL puede cubrir esos workflows terminales.
- **Conservar v1 en curso:** detén workers en límites de trabajo y captura una
  instantánea coherente de SQL y de todos los backends duraderos de cola. Debe
  incluir trabajo listo, diferido y reservado del mismo punto de recuperación.
  Espera a que termine lo reservado salvo que el backend documente cómo restaurar
  su mensaje y lease con seguridad.
- **Aceptar pérdida de ejecuciones en curso:** si no hay un punto restaurable
  de colas, registra los identificadores afectados y acepta expresamente que
  esta reversión no recupera las ejecuciones no terminales dependientes de colas.
  Excluye una fila `pending` elegible solo tras demostrar la ruta Watchdog
  siguiente, y una espera solo de señal solo tras probar la entrada conservada.
  No presentes ninguna otra fila SQL como trabajo recuperable.

Una espera solo de señal puede legítimamente no tener trabajo en cola si la
entrada externa sigue disponible tras revertir. Los reintentos y temporizadores
dependen de colas: una fila `workflow_timers` o `workflows` en espera no recrea un
trabajo diferido perdido.

v1.0.77 admitida inicia también `Workflow\Watchdog`, habilitado por defecto,
desde el bucle de colas. Detecta un workflow `pending` cuyo `updated_at` tenga al
menos cinco minutos y conserve `arguments` serializados, y lo vuelve a despachar
a su conexión y cola registradas. Es una activación acotada solo de pendientes,
no un sustituto de copias de colas. Solo puedes depender de ella si pruebas en
un entorno de pruebas que el bucle restaurado despacha Watchdog, este redespacha
una fila `pending` antigua elegible y el workflow avanza en la cola esperada.
No recrea reintentos ni temporizadores, ni recupera filas `waiting` o `running`.
Estas necesitan su trabajo conservado o una entrada externa válida cuando de
verdad esperan una señal.

**3. Respaldar el conjunto de recuperación para revertir**

Crea una copia completa de base antes de actualizar:

```bash
# MySQL/MariaDB
mysqldump -u root -p your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# PostgreSQL
pg_dump -U postgres your_database > backup-v1-$(date +%Y%m%d-%H%M%S).sql

# Laravel backup package (if installed)
php artisan backup:run --only-db
```

Conserva después las colas según el backend:

- **Cola en base de datos:** incluye sus tablas y conexión en el mismo punto de
  recuperación. Pueden estar fuera de la base de workflows.
- **Cola Redis:** usa una instantánea restaurable con la base/prefijo exactos y
  claves listas, diferidas y reservadas. Conserva también bloqueos de trabajos
  únicos necesarios del mismo Redis. Prefiere una base o instancia dedicada:
  restaurar un Redis compartido puede retroceder datos de otras aplicaciones.
- **SQS u otra cola gestionada:** usa restauración de mensajes a un punto en el
  tiempo solo si el proveedor conserva de forma coherente disponibles, diferidos
  y en curso. SQS no ofrece la instantánea arbitraria necesaria aquí. Drena v1 o
  clasifica el trabajo restante dependiente de colas como irrecuperable. Las
  únicas excepciones solo SQL son `pending` elegible con Watchdog demostrado y
  una espera solo de señal probada.

Conserva juntos copias SQL y de colas, inventario sin secretos y fecha del punto.
El manifiesto puede nombrar referencia y versión de `APP_KEY`, nunca la clave ni
credenciales para obtenerla. Controla por separado el acceso a credenciales de
gestor de secretos, base, proveedor de colas y restauración de copias. Mezclar
SQL y colas de puntos distintos no admite reversión de ejecuciones en curso.

**4. Probar primero en un entorno de pruebas**

**No actualices producción sin probar antes.** La actualización incluye:

- Cambios de esquema (el núcleo duradero v2 añade tablas; la cantidad real es
  la que aplica `php artisan migrate`, y futuras migraciones consolidadas pueden
  agrupar archivos por funcionalidad)
- Cambios de namespaces PHP que requieren cambios de código
- Reinicio de workers de colas (breve interrupción)
- Validación de capacidades del backend

**Lista de comprobación en pruebas:**

- [ ] Desplegar código v2
- [ ] Ejecutar migraciones en la base de pruebas
- [ ] Reiniciar workers
- [ ] Ejecutar `php artisan workflow:v2:doctor --strict`
- [ ] Iniciar un workflow v2 nuevo y verificar que termina
- [ ] Verificar que los workflows v1 existentes siguen terminando
- [ ] Comprobar que Waterline muestra v1 y v2
- [ ] Ejecutar la suite de la aplicación
- [ ] Verificar que no hay errores en registros

Pasa a producción solo después de superar esta validación.

### Pasos de actualización {#upgrade-steps}

**1. Actualizar la dependencia Composer**

```bash
composer require %%artifact.workflowComposerPackage%%
```

El paquete mantenido tanto para v1 como para v2 es `durable-workflow/workflow`.
El comando cambia su restricción a la versión fijada pública v2 actual. El nombre
antiguo `laravel-workflow/laravel-workflow` solo es un alias de compatibilidad
para dependencias anteriores al cambio de nombre. Usa el nombre mantenido en
requisitos nuevos y reversiones. La versión pública fijada es estable 2.0. Usa
`durable-workflow/workflow:^2.0` para aceptar automáticamente actualizaciones 2.x compatibles.

**2. Ejecutar migraciones de base de datos**

```bash
php artisan migrate
```

v2 añade las tablas del núcleo duradero que sustentan sus funcionalidades. Las
migraciones actuales crean:

- Núcleo: `workflow_instances`, `workflow_runs`, `workflow_history_events`, `workflow_tasks`, `workflow_commands`
- Actividad: `activity_executions`, `activity_attempts`
- Funcionalidades: `workflow_updates`, `workflow_signal_records`, `workflow_run_waits`, `workflow_run_timeline_entries`, `workflow_run_lineage_entries`, `workflow_schedules`, `workflow_schedule_history_events`
- Observabilidad: `workflow_run_summaries`, `workflow_failures`, `workflow_links`, `worker_compatibility_heartbeats`
- Temporizadores: `workflow_run_timers`, `workflow_run_timer_entries`
- Búsqueda / memo / mensaje / hijo: `workflow_search_attributes`, `workflow_memos`, `workflow_messages`, `workflow_child_calls`
- Catálogo de servicios: `workflow_service_endpoints`, `workflow_services`, `workflow_service_operations`, `workflow_service_calls`

Una migración futura puede consolidarlas en menos archivos sin alterar el
contrato duradero. Para saber qué hay realmente en tu base, ejecuta
`php artisan migrate:status` tras actualizar.

Se conservan las tablas v1 predeterminadas (`workflows`, `workflow_logs`,
`workflow_signals`, `workflow_timers`, `workflow_exceptions`,
`workflow_relationships`) para terminar en v1. Si los modelos configurados
redefinen tablas o conexión, esas tablas son la referencia v1.

**3. Actualizar configuración si hace falta**

La configuración v2 es compatible hacia atrás. Si publicaste `config/workflow.php`
en v1 seguirá funcionando. Las opciones nuevas incluyen:

- `durable_types`: alias para referencias de workflow independientes del lenguaje
- `task_repair_policy`: tratamiento de tareas atascadas
- `backend_capability_check`: validación estricta o permisiva
- `projection_rebuild`: estrategias de reconstrucción desde historial
- `history_budget`: límites de eventos para continue-as-new

Tienen valores predeterminados razonables. Configúralas solo para cambiar el
comportamiento predeterminado. Consulta [Configuración](/docs/configuration/options/).

**El códec de carga predeterminado pasa a `avro`.** v1 usaba por defecto
`Workflow\Serializers\Y::class`, exclusivo de PHP. v2 usa `avro`, independiente
del lenguaje, para que workers Python, Go y TypeScript decodifiquen cargas sin
compartir PHP. `avro` es el único códec admitido para workflows v2 nuevos, que
quedan etiquetados con `payload_codec = "avro"`.

Si tu `config/workflows.php` publicado contiene
`'serializer' => Workflow\Serializers\Y::class`, v2 aún lo lee para diagnosticar
la migración, pero las cargas nuevas se resuelven a Avro. Ejecuta
`php artisan workflow:v2:doctor`: señalará ese ajuste antiguo como un asunto de
drenaje/importación v1.

Para aceptar explícitamente el valor v2, deja `serializer` sin establecer o fíjalo:

```php
// config/workflows.php — v2 default (language-neutral, compact binary)
'serializer' => 'avro',
```

Conserva un códec antiguo (`'workflow-serializer-y'` o
`'workflow-serializer-base64'`) solo si debes terminar de drenar ejecuciones v1
que comparten valores nativos PHP entre servidor y workers PHP. Los nombres de
clase antiguos (`Workflow\Serializers\Y::class`, etc.) siguen siendo alias para
decodificar v1.

**Los serializadores personalizados v1 no están admitidos en v2.** El registro
público v2 solo resuelve `avro`. Los lectores antiguos `workflow-serializer-y` y
`workflow-serializer-base64` están limitados a la ruta
interna v1 de importación/drenaje; no se seleccionan para ejecuciones o cargas
SDK nuevas. Si usabas uno propio, drena v1 antes o recodifica el historial a
`avro`: no se consulta la clase personalizada. `php artisan workflow:v2:doctor`
señala otros valores `workflows.serializer` como deuda de migración. Omitir el
códec en ejecuciones nuevas resuelve a `avro`.

**Las subclases de modelos solo se admiten si conservan el contrato de columnas y
claves del paquete.** La [matriz de personalización](/docs/configuration/customization-matrix/)
congelada es la referencia: se admiten subclases de modelos v2 de instancia,
ejecución, tarea, evento, proyección, programación, actividad, fallo, enlace,
mensaje, memo, atributos de búsqueda y llamada hija si conservan nombres de
tablas, claves primarias y foráneas del paquete. Nombres de tabla con columnas
foráneas personalizadas quedan fuera. Waterline lee proyecciones v2 mediante
`Workflow\V2\Contracts\OperatorObservabilityRepository`, por lo que una subclase
compatible con el esquema no requiere cambios en Waterline.

**Variables de entorno:**

v2 no añade variables obligatorias. `QUEUE_CONNECTION`, `CACHE_DRIVER` y
`DB_CONNECTION` siguen funcionando.

**4. Reiniciar workers de colas**

Los workers deben reiniciarse para cargar código v2:

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

Los workers:
1. Terminan el trabajo actual
2. Salen de forma ordenada
3. Reinician con código v2

**Deben reiniciar antes de procesar workflows v2.** Los v1 pueden terminar con
workers antiguos o nuevos mediante compatibilidad de finalización en v1.

### Después de actualizar {#after-upgrading}

**1. Verificar capacidades del backend**

```bash
php artisan workflow:v2:doctor --strict
```

Salida esperada:

```
✓ Database driver supports required features
✓ Queue driver supports required features
✓ Cache driver supports locks
✓ All backend capabilities present
```

Si falla algo, consulta los requisitos de controladores en
[Requisitos del backend](/docs/installation/#requirements).

**2. Verificar el inicio de workflows v2**

Inicia un workflow de prueba con la API v2:

```php
use Workflow\V2\WorkflowStub;
use Workflow\V2\StartOptions;

$workflow = WorkflowStub::make(TestWorkflow::class, 'test-upgrade');
$result = $workflow->start(['test' => true], new StartOptions());
$runId = $result->runId();
```

`WorkflowStub::start()` devuelve `StartResult`. Obtén el identificador con
`runId()` antes de compararlo con filas. Tratar el resultado como cadena escalar
compara silenciosamente un objeto con una columna.

Comprueba:

- Que aparece en Waterline
- Que `workflow_instances` tiene el `instance_id` correspondiente (`$workflow->id()`)
- Que `workflow_runs` tiene el `run_id` correspondiente (`$result->runId()`)
- Que termina o avanza como se espera

**3. Comprobar workflows v1 existentes**

Si hay workflows v1 en curso:

```bash
php artisan workflow:v1:list
```

Verifica que siguen avanzando y terminan sin errores en el motor v1.

**4. Vigilar errores en registros**

Observa los registros de aplicación en busca de errores de workflows:

```bash
tail -f storage/logs/laravel.log | grep -i workflow
```

Problemas habituales:

- Namespaces PHP: código que aún usa `Workflow\Workflow` en vez de `Workflow\V2\Workflow`
- Métodos: clases v2 de workflow o actividad que aún deben cambiar su entrada a `handle()`
- Controladores de cola: `sync` no está admitido en modo cola; en modo sondeo
  (`workflows.v2.task_dispatch_mode=poll`) no se usa la cola para entregar tareas
  y `sync` es aceptable

**5. Verificar observabilidad en Waterline**

Abre Waterline (`/waterline` por defecto) y verifica:

- Los workflows v1 conservan sus datos originales
- Los v2 muestran detalles completos de ejecución, historial y actividad
- Waterline se muestra sin errores

### Procedimiento de reversión {#rollback-procedure}

Revertir es una operación sobre el conjunto de recuperación. Restaurar solo SQL
no restaura ejecuciones v1 en curso si sus colas están en Redis, SQS, otra base
u otro backend externo.

Si falla la actualización en producción, revierte solo según la política y el
punto de recuperación elegidos antes:

**1. Detener entrada de aplicación, programadores y workers**

Usa la misma parada previa. Confirma que ningún worker puede reservar trabajo
y ninguna petición iniciar o señalar un workflow durante la restauración.

**2. Validar el conjunto de recuperación**

- Solo SQL se admite si el punto elegido no tiene ejecuciones v1 no terminales
  dependientes de colas conservadas. Un `pending` antiguo elegible puede usar
  Watchdog v1.0.77 demostrado; una espera real solo de señal, una entrada probada.
  No amplíes esas excepciones a otros estados.
- Para ejecuciones en curso se necesita SQL y colas restaurables listas,
  diferidas y reservadas del mismo punto para reintentos, temporizadores,
  actividades y trabajo `waiting` o `running`. Las esperas de señal necesitan
  entrada funcional y las de temporizador su trabajo diferido.
- Si no se cumple, detente. Corrige hacia delante, concilia manualmente los
  workflows registrados o sigue la aceptación previamente documentada de pérdida
  de ejecuciones afectadas.

**3. Restaurar la copia de base**

```bash
# MySQL/MariaDB
mysql -u root -p your_database < backup-v1-YYYYMMDD-HHMMSS.sql

# PostgreSQL
psql -U postgres -d your_database < backup-v1-YYYYMMDD-HHMMSS.sql
```

Restaura cada tabla de modelo v1 configurada y `workflow_relationships_table`,
aunque estén en otra conexión.

**4. Restaurar las colas del punto de recuperación cuando haga falta**

Mantén los consumidores detenidos. Sigue el procedimiento del proveedor para
restaurar conexiones, colas, prefijos y trabajos listos, diferidos y reservados
capturados con SQL. Restaura los bloqueos únicos necesarios incluidos en el
punto. No sustituyas por una cola vacía con igual nombre: no activa reintentos,
temporizadores ni trabajo `waiting`/`running`. Una cola vacía escribible basta
solo para `pending` elegible tras demostrar que Watchdog v1.0.77 arranca y lo
redespacha.

**5. Revertir la dependencia Composer**

```bash
composer require durable-workflow/workflow:^1.0 --with-all-dependencies
```

`durable-workflow/workflow` es el nombre mantenido de v1 admitida y v2.
`laravel-workflow/laravel-workflow` solo es un alias heredado para grafos antiguos.
No lo uses en requisitos de reversión.

Recupera la `APP_KEY` exacta mediante referencia y versión inventariadas, usando
credenciales de recuperación separadas. Restaura también conexión de workflows,
conexiones/nombres de colas, prefijos Redis y modelos propios antes de arrancar
consumidores. Trabajos cifrados y referencias serializadas dependen de que la
configuración coincida con el punto capturado.

**6. Reiniciar workers y reabrir entrada**

```bash
# Use the start command for your worker system, for example:
sudo supervisorctl start <your-worker-group>:*
sudo systemctl start laravel-worker
php artisan horizon:continue
```

**7. Verificar que v1 puede seguir ejecutándose**

Ver una fila en Waterline demuestra restauración, no que un worker pueda
reanudarla. Completa esta lista antes de declarar correcta la reversión:

- [ ] `composer show durable-workflow/workflow` muestra la versión v1 prevista
  y los workers han cargado ese código.
- [ ] Las tablas v1 reales y `workflow_relationships_table` existen en las
  conexiones previstas.
- [ ] Cada fila no terminal de la tabla configurada (`workflows` por defecto)
  está clasificada por próxima activación: trabajo listo/diferido/reservado,
  temporizador conservado o entrada de señal probada. Un `pending` elegible puede
  citar la evidencia Watchdog siguiente.
- [ ] La inspección del proveedor confirma cada reintento, temporizador,
  actividad y activación `waiting`/`running` en la conexión/cola registrada.
  Una fila SQL de temporizador no basta, ni Watchdog sustituye esos trabajos.
- [ ] Para `pending` restaurado sin trabajo conservado, se observa al bucle
  v1.0.77 encolar Watchdog y, tras cinco minutos de antigüedad, a este encolar el
  workflow en su conexión/cola y a la fila avanzar. Sin esta prueba completa,
  considéralo varado aunque se vea en Waterline.
- [ ] Ningún reintento, temporizador o fila `waiting`/`running` carece de trabajo
  ejecutable requerido o entrada externa usable para una espera real de señal.
  Si falta, está varado; la prueba Watchdog solo de pendientes no lo recupera.
- [ ] Un reintento o temporizador restaurado supera su marcador anterior y una
  espera de señal controlada logra encolar y consumir su activación.
- [ ] Un workflow canario v1 nuevo termina sin errores de trabajo perdido,
  descifrado, tablas, conexión o enrutamiento de colas.

Con tablas predeterminadas, esta consulta inicia el inventario. Sustituye la
tabla resuelta por tu modelo si está personalizado:

```sql
SELECT id, class, status
FROM workflows
WHERE status NOT IN ('completed', 'failed', 'cancelled');
```

**Notas importantes de reversión:**

- Descarta workflows v2 iniciados tras actualizar, que solo existen en tablas v2
- Solo SQL restaura registros v1, no mensajes de colas externas
- La ejecución v1 en curso se admite solo con SQL y colas del mismo punto
  coherente, o espera documentada solo de señal con entrada usable. La excepción
  adicional es `pending` antiguo elegible con redespacho Watchdog v1.0.77
  demostrado. No cubre reintentos, temporizadores ni `waiting`/`running`
- Reproducir un punto previo puede repetir efectos externos. Revisa idempotencia
  antes de restaurar actividades en cola
- Si debes conservar workflows v2 iniciados durante la actualización, no
  restaures la base: corrige el problema hacia delante

## Cambios de código {#code-changes}

Estas secciones detallan los cambios necesarios al pasar de las API v1 a v2.

### Cambio de namespace PHP {#namespace-change}

Todas las clases v2 están bajo `Workflow\V2`. Actualiza las importaciones:

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

Workflows y actividades v2 usan `handle()`. Renombra los métodos `execute()` v1
al migrar el código:

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

No dejes `execute()` como entrada de workflow o actividad v2: el motor lo rechaza.

### Llamadas a actividades {#activity-calls}

v2 sustituye `ActivityStub::make()` y `yield` por funciones auxiliares directas:

```php
// v1
$result = yield ActivityStub::make(MyActivity::class, $arg1, $arg2);

// v2
use function Workflow\V2\activity;

$result = activity(MyActivity::class, $arg1, $arg2);
```

Las actividades tienen identidad duradera. Cada actividad programada obtiene
una fila `activity_executions` con identificador estable y cada intento concreto
una fila `activity_attempts` con historial tipado.

### Identidad del workflow {#workflow-identity}

v2 separa instancia y ejecución:

- `id()`: identificador público de instancia, igual a través de continue-as-new
- `runId()`: identificador de la ejecución actual

En v1 eran el mismo concepto.

### Señales {#signals}

v2 usa esperas de señales con nombre en lugar de mutadores con `#[SignalMethod]`:

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

Admiten `await('name')` para esperas bloqueantes y `signal()` / `attemptSignal()`
para entrada externa. Cancelación y terminación no son señales: siguen siendo
comandos explícitos del entorno.

### Consultas {#queries}

v2 usa métodos de consulta seguros para reproducción en vez de leer propiedades
directamente:

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

### Temporizadores y efectos secundarios {#timers-and-side-effects}

Las funciones auxiliares sustituyen los métodos estáticos v1:

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

### Límites de tiempo {#timeouts}

v2 añade límites de tiempo de workflow mediante `StartOptions`:

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

- El **límite de ejecución de instancia** abarca toda la instancia, incluidas
  transiciones continue-as-new.
- El **límite de una ejecución** se aplica a una sola y se reinicia con continue-as-new.

### Migraciones de base de datos {#database-migrations}

v2 añade tablas y columnas. El paquete carga sus migraciones automáticamente.
Tras actualizar:

```bash
composer update durable-workflow/workflow
php artisan migrate
```

2.0.0 incluye migraciones base limpias. La vía normal es que Laravel cargue las
migraciones del paquete y ejecutar `php artisan migrate`.

Si publicaste migraciones en la aplicación, elige una fuente y mantenla actual:

- **Carga automática del paquete:** elimina las migraciones antiguas publicadas
  de Durable Workflow en `database/migrations` y ejecuta `php artisan migrate`.
- **Migraciones publicadas:** publica el conjunto actual antes de migrar:

  ```bash
  php artisan vendor:publish \
    --provider="Workflow\Providers\WorkflowServiceProvider" \
    --tag=migrations \
    --force

  php artisan migrate
  ```

No conserves archivos publicados obsoletos mientras dependes de los nuevos
autocargados: pueden faltar tablas v2 o migraciones de reparación.

Si personalizaste migraciones, compara tus copias con `src/migrations` del paquete
en cada actualización. Conserva tablas, columnas, índices y contratos de nulabilidad
y valores predeterminados compatibles con los modelos. Si usas una conexión no
predeterminada, publica las migraciones, establece `$connection` y sigue
incorporando todas las nuevas del paquete por orden de fecha.

Para usuarios de versiones preliminares v2, `workflow_run_summaries.memo` se
repara de forma idempotente si una migración antigua creó la tabla sin ella.
Las instalaciones nuevas ya la crean en la migración base.

### Comprobación de capacidades del backend {#backend-capability-check}

v2 valida que cola, base y caché cumplen sus requisitos. Tras actualizar, ejecuta:

```bash
php artisan workflow:v2:doctor --strict
```

### Configuración {#configuration}

Consulta [Configuración](/docs/configuration/options/) para las nuevas opciones:

- Alias de tipos duraderos
- Política de reparación de tareas
- Comprobaciones de capacidades
- Reconstrucción de proyecciones
- Presupuestos de historial y eliminación de datos sensibles al exportar

### Waterline {#waterline}

La interfaz de supervisión Waterline se actualizó para v2 con:

- Detalles de ejecución con duraciones y fechas límite
- Seguimiento de intentos de actividad con identificadores duraderos
- Visualización actualizada del estado de workflows

### Continue-as-new {#continue-as-new}

v2 añade presupuestos de historial que pueden activar continue-as-new al superar
el umbral de eventos. Se conservan memo, atributos de búsqueda y límites de tiempo
entre transiciones.

## Workflows existentes {#existing-workflows}

### Estrategia de terminar en v1 {#finish-on-v1-strategy}

**Los workflows iniciados en v1 siguen ejecutándose mediante compatibilidad v1.**
Los nuevos usan semántica v2. No necesitas migrar instancias en curso.

Al actualizar a 2.0:

1. **Se conservan datos v1:** tablas predeterminadas `workflows`, `workflow_logs`,
   `workflow_signals`, `workflow_timers`, `workflow_exceptions` y
   `workflow_relationships` intactas; modelos/tablas configurados siguen siendo
   la autoridad.
2. **v1 termina en su motor:** continúa con reproducción v1 hasta estado terminal.
3. **v2 usa su motor:** los workflows nuevos usan esquema v2 (`workflow_instances`,
   `workflow_runs`, `workflow_history_events`, etc.).
4. **Waterline muestra ambos:** la interfaz muestra v1 y v2 juntos.

Terminar en v1 también depende de Laravel y sus colas. Conserva todas las
conexiones y colas v1 hasta terminar. Las filas preservan historial y estado,
pero no reconstruyen trabajos externos perdidos listos, diferidos o reservados.
Watchdog v1.0.77 puede redespachar `pending` antiguo elegible desde SQL, pero no
recrea reintentos, temporizadores ni trabajo `waiting`/`running`.

### Seguimiento de finalización de workflows v1 {#tracking-v1-workflow-completion}

Para ver qué workflows v1 siguen activos:

```bash
php artisan workflow:v1:list
```

El comando enumera los que no alcanzaron un estado terminal (completado, fallido,
cancelado). Úsalo para seguir su finalización.

Salida de ejemplo:

```
+--------------------------------------+---------------------+-----------+------------+
| ID                                   | Class               | Status    | Created    |
+--------------------------------------+---------------------+-----------+------------+
| 01J1234567890ABCDEFGHIJK             | App\OrderWorkflow   | running   | 2 days ago |
| 01J9876543210ZYXWVUTSRQP             | App\InvoiceWorkflow | pending   | 1 day ago  |
+--------------------------------------+---------------------+-----------+------------+
```

#### Visibilidad en Waterline {#waterline-visibility}

Tras actualizar, Waterline muestra automáticamente ambos motores:

- **v1:** datos originales `StoredWorkflow` (clase, estado, registros, señales,
  excepciones)
- **v2:** detalles completos (ejecuciones, eventos, temporizadores, actividades,
  atributos de búsqueda)

No requiere configuración: lee ambos conjuntos de tablas y ofrece una vista unificada.

### Cuándo limpiar las tablas v1 {#when-to-clean-up-v1-tables}

Cuando todos terminen (`workflow:v1:list` muestra cero activos), puedes eliminar
opcionalmente las tablas v1:

```sql
DROP TABLE IF EXISTS workflow_relationships;
DROP TABLE IF EXISTS workflow_exceptions;
DROP TABLE IF EXISTS workflow_timers;
DROP TABLE IF EXISTS workflow_signals;
DROP TABLE IF EXISTS workflow_logs;
DROP TABLE IF EXISTS workflows;
```

**Importante:** no las elimines mientras haya workflows v1 activos. Fallaría la
reproducción y quedarían atascados.

### Por qué terminar en v1 {#why-finish-on-v1}

La estrategia evita forzar una migración de datos al actualizar. Los modelos
de almacenamiento difieren fundamentalmente:

- **v1:** estado como fila `workflows` desnormalizada con registros, señales y
  temporizadores relacionados
- **v2:** historial como fuente de eventos con proyecciones (`workflow_instances`,
  `workflow_runs`, `workflow_history_events`)

Convertir ejecuciones en curso exigiría reconstruir secuencias desde registros
v1, con riesgo de pérdida de datos e inconsistencias de reproducción. Terminar
en v1 permite completar con seguridad en el motor original mientras el trabajo
nuevo pasa inmediatamente a v2.
