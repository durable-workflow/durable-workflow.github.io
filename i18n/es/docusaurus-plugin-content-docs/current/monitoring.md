---
sidebar_position: 12
tags:
  - observability
  - operations
  - Waterline
keywords:
  - Waterline
  - supervisión de workflows
  - historial duradero
  - telemetría de ejecución
  - acciones disponibles de waterline
  - evidencia solo de diagnóstico
  - estado de reparación
---

# Supervisión {#monitoring}

[Waterline](https://github.com/durable-workflow/waterline) es la interfaz de
operador y API del estado de los workflows. Su entrega sigue el límite del
entorno de ejecución elegido: Cloud incluye Managed Waterline y, en alojamiento
propio, el operador despliega Waterline por separado si lo necesita.

Waterline es un único producto para operadores con tres formas de consumo:

- **Modo integrado:** instala el paquete Composer en la aplicación Laravel
  propietaria de los workflows y lee su estado duradero dentro del proceso.
- **Modo servicio autogestionado:** ejecuta la imagen publicada
  `durableworkflow/waterline` y lee el estado del
  [servidor independiente](./polyglot/server.md) mediante el SDK PHP y la API
  pública del servidor. La distribución de Server no incluye ni opera Waterline.
- **Cloud Managed Waterline:** es la experiencia de operador limitada al
  namespace incluida en [Durable Workflow Cloud](./polyglot/cloud-control-plane.md).
  Cloud opera Managed Waterline y el entorno del namespace al que da acceso.

Las opciones integrada y de servicio autogestionado exponen la misma interfaz
básica y familias de rutas de operador `/waterline/api/...`. Cloud ofrece las
capacidades de operador mediante su interfaz gestionada, sin un servidor de
rutas de Waterline desplegado por el cliente. Ninguna opción combina estados
de entornos: cada vista se limita a las ejecuciones de su entorno y namespace.
Para Server autogestionado, las interfaces nativas API, CLI y SDK de operador
siguen disponibles con o sin Waterline. Consulta la
[referencia de la API de Server](./polyglot/server-api-reference.md) para esas
rutas, y la [referencia de la API de operadores de Waterline](./waterline-operator-api.md)
para las rutas y contratos de respuesta de Waterline.

Durable Workflow tiene dos planos de observabilidad:

| Plano | Fuente de referencia | Preguntas habituales |
| --- | --- | --- |
| Estado duradero | Base de datos y API del entorno propietario, proyecciones de Waterline y exportación del historial | ¿Arrancó el workflow? ¿Qué ejecución es la actual? ¿Qué señal, actualización, temporizador, actividad, reintento o fallo se confirmó? ¿Qué acción de operador es segura ahora? |
| Telemetría del worker/entorno | Registros del worker de colas, registradores de métricas del SDK, endpoints Prometheus/OpenMetrics y trazas de la aplicación | ¿Sondean los workers? ¿Cuánto duran las tareas? ¿Hay un exportador configurado? ¿Salieron las métricas personalizadas del proceso del worker? |

Waterline no sustituye las métricas de workers. Si una métrica personalizada se
registró en una actividad o en código del worker, recógela en su endpoint de
telemetría. Usa Waterline para relacionar esa señal de ejecución con el historial
duradero y el estado de la ejecución actual.

La configuración de workers y clientes también es independiente de la interfaz
de operador. Usa la [referencia generada de la API del SDK PHP](https://php.durable-workflow.com/api/),
la [referencia de la API del SDK Python](https://python.durable-workflow.com/) o
la [referencia de la API del SDK Rust](https://rust.durable-workflow.com/), junto
con las guías de cada lenguaje, para conectar clientes y workers al entorno
propietario del namespace.

Si la telemetría muestra reclamaciones repetidas, carreras de finalización tardía
o leases atascadas, lee
[Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md)
junto con esta guía. Ese contrato distingue la incertidumbre del transporte con
entrega al menos una vez de los resultados duraderos duplicados, para evitar
conclusiones operativas incorrectas ante evidencia que parece duplicada.

## Trazas con OpenTelemetry {#opentelemetry-tracing}

Conecte las solicitudes de la aplicación, las tareas de workflow y los intentos de actividad entre procesos con las trazas opcionales de OpenTelemetry. Elija la configuración del runtime que gestiona sus ejecuciones.

### Laravel embebido {#embedded-tracing}

Para relacionar los logs de la aplicación con una ejecución de workflow y un
intento de actividad, configura la [integración opcional de trazas del modo embebido (en inglés)](https://github.com/durable-workflow/workflow/blob/main/docs/embedded-tracing.md).
Conserva el contexto W3C entre workers de cola, reintentos y recuperación, y usa
el proveedor OpenTelemetry y los canales de logs de Laravel de tu aplicación.
La guía explica cómo activar las trazas, añadir el tap de logs, ejecutar las
migraciones del esquema y limitar las exportaciones. Revisa el diagrama de spans
y la matriz de capacidades de runtimes y SDKs antes del despliegue.

En el archivo `config/workflows.php` de la aplicación, asocie una variable de entorno propia de la aplicación con la configuración de trazas existente:

```php
'tracing' => [
    'enabled' => (bool) env('DW_TRACING_ENABLED', false),
    'baggage_allowlist' => [],
],
```

Este ejemplo comienza sin baggage. Instale la API opcional y configure el proveedor, el tap de logs, las migraciones y el exportador con límites según la guía enlazada. Después, reinicie los workers.

### Trazas en modo servicio {#service-mode-tracing}

Configure el proveedor, muestreo, propagadores y exportación acotada antes de activar la telemetría del SDK. Consulte la [guía PHP](https://php.durable-workflow.com/operate/tracing/), la [guía Python](https://python.durable-workflow.com/telemetry/) o la [API Rust](https://rust.durable-workflow.com/durable_workflow/telemetry/) en inglés.

| Runtime | Límite de propagación |
| --- | --- |
| Laravel embebido | La integración Core opcional conserva contexto entre los workers de cola de la aplicación. |
| Servidor PHP | La [guía del servidor](https://github.com/durable-workflow/server/blob/2.10.0/docs/observability-context.md) exige una imagen de aplicación con la API opcional, la opción activada y el esquema nullable real. |
| SDK PHP, Python y Rust | Spans opcionales de tarea/intento y correlación acotada de logs. La propagación duradera exige la capacidad exacta anunciada por el servidor. Si falta o es inválida, se usan trazas de tarea independientes. |
| Servidor Rust nativo | Esta versión PHP no cualifica carriers nativos ni conversión del catálogo. |
| Cloud | Esta versión no incluye despliegue en Cloud. Confirme el soporte del runtime gestionado. |

Los identificadores de traza, run, actividad, intento y petición siguen separados. Baggage usa una lista permitida, vacía por defecto; los enlaces no contienen baggage. La aplicación controla proveedores y exportadores. Una terminación abrupta puede perder telemetría; el replay no garantiza exportación exactamente una vez. Use el historial duradero para los resultados de negocio.

## Vistas de Waterline {#waterline-views}

### Vista del panel {#dashboard-view}

![Panel de Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/dashboard.png)

El panel muestra totales de ejecuciones, contadores recientes y métricas de toda
la flota para ver si el trabajo avanza, se atasca o falla.

Consulta el [ámbito operativo del operador](./operator-operating-envelope.md)
para conocer el contrato de despliegue y procedimientos: qué diagnósticos
bloquean tráfico, cuáles son informativos, cómo se reparte la salud de colas entre
Waterline y la telemetría de workers, y cómo verificar reconstrucción,
exportación y archivado.

### Vista del workflow {#workflow-view}

![Detalle de workflow en Waterline](https://raw.githubusercontent.com/durable-workflow/waterline/refs/heads/main/docs/screenshots/workflow-detail.png)

El detalle muestra la cronología duradera de una ejecución: actividades, señales,
temporizadores y workflows hijos, en orden, con sus entradas, salidas y tiempos.

## Despliegue y acceso a Waterline {#waterline-deployment-and-access}

### Laravel integrado {#embedded-laravel}

Instala Waterline en tu aplicación Laravel junto con el paquete Workflow y
ejecuta sus migraciones. Consulta
[durable-workflow/waterline](https://github.com/durable-workflow/waterline)
para la guía completa de instalación y configuración.

El modo integrado usa la conexión de base de datos, middleware de rutas, control
de autenticación y paquete Workflow de la aplicación anfitriona. Opera la
aplicación Laravel, workers de colas, programador, migraciones y recursos de
Waterline como una sola unidad de despliegue. La
[referencia de la API de operadores de Waterline](./waterline-operator-api.md#installation)
incluye el comando Composer actual y el paso de publicación de recursos.

### Servicio Waterline {#waterline-service}

La imagen publicada contiene su propio entorno PHP y Laravel. No requiere PHP,
Composer ni el paquete Workflow en la máquina anfitriona y nunca se conecta a la
base de datos del servidor independiente.

Este ejemplo limita Waterline a la interfaz de bucle local en el puerto `8080`,
persiste su estado de interfaz en un volumen con nombre y lo conecta a un namespace:

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

Abre `/waterline` mediante la URL de `APP_URL`. La imagen escucha en el puerto
interno `8080`. Configura `PORT` solo si cambias ese puerto deliberadamente.
`WATERLINE_PATH` cambia el prefijo de URL predeterminado `waterline`.
El repositorio también publica una
[definición de servicio Docker Compose](https://github.com/durable-workflow/waterline/blob/main/deploy/docker-compose.service.yml)
con el mismo límite de conexión.

El modo servicio tiene dos capas independientes de autenticación:

1. `WATERLINE_SERVER_TOKEN` es la credencial bearer que usa Waterline cuando el
   SDK PHP llama a `WATERLINE_SERVER_ENDPOINT`. Observar workflows, workers,
   colas y programaciones requiere un rol de operador del servidor. La salud y
   las métricas de operador del servidor pueden requerir un rol de administrador.
2. El acceso del navegador y de la API de Waterline es el límite de entrada del
   despliegue. La imagen autónoma no tiene un directorio de usuarios Laravel
   anfitrión. Por tanto, `WATERLINE_ALLOW_UNAUTHENTICATED=true` solo debe usarse
   tras un proxy inverso que autentique, o en una interfaz privada como el bucle
   local anterior. Déjalo en `false` salvo que exista ese límite de autenticación.

Configura `WATERLINE_NAMESPACE` con el namespace que se quiere inspeccionar.
Waterline lo envía en todas las peticiones SDK. `WATERLINE_ACCESS_MODE=read_only`
es el valor predeterminado y bloquea mutaciones en Waterline. Usa `operator` solo
con un token del servidor autorizado para los comandos necesarios.

El volumen `/data` contiene vistas guardadas, preferencias de visualización y
estado de Laravel propiedad de Waterline. Por defecto usa una base de datos
SQLite en `/data/waterline.sqlite`. Nunca contiene el historial de workflows del
servidor. Usa `DATABASE_URL` o las opciones normales `DB_*` si el estado propio
de Waterline debe estar en MySQL o PostgreSQL.

#### Salud y métricas {#health-and-metrics}

Usa estas sondas para responder a preguntas diferentes:

| Interfaz | Qué demuestra |
| --- | --- |
| `GET /up` | El proceso HTTP de Waterline arrancó y responde. La comprobación de salud Docker de la imagen usa esta ruta. |
| `GET /waterline/api/v2/health` | Waterline puede reunir datos de salud del servidor, registros de workers y colas de tareas limitados al namespace mediante el SDK PHP. |
| `GET /waterline/api/stats` | Totales del panel y resumen de operador respaldado por el servidor que usa Waterline. |
| `GET /api/system/health` y `GET /api/system/operator-metrics` del servidor | Contratos nativos de salud y operador del servidor, independientes de Waterline. |

Trata `/waterline/api/stats` como JSON de operador, no como endpoint de recogida
de Prometheus. Métricas SDK, registros, trazas y telemetría personalizada siguen
procediendo de los procesos de workers. Si `/up` funciona pero salud o estadísticas
no están disponibles, revisa la conexión al servidor, autorización, namespace o
capacidades del SDK, en vez de asumir que falló el proceso de Waterline.

#### Visibilidad de workflows y acciones de operador {#workflow-visibility-and-operator-actions}

En modo servicio, listas, detalle de ejecución seleccionada, exportación,
programaciones, estado de workers, evidencia de colas, señales, actualizaciones,
consultas, reparación, cancelación, terminación y archivado se proyectan desde
el servidor configurado mediante el SDK PHP. Las rutas siguen las estructuras de
la [referencia de la API de operadores de Waterline](./waterline-operator-api.md).
Los contratos del servidor siguen documentados en la
[referencia de la API de Server](./polyglot/server-api-reference.md).

Waterline solo muestra el namespace configurado y las ejecuciones del servidor
conectado. Las ejecuciones integradas siguen visibles en su Waterline integrado,
y las gestionadas por Server en el despliegue de servicio o sus interfaces
nativas. Cambiar el backend de Waterline no migra ni combina ejecuciones.

#### Límites de diagnóstico de problemas {#troubleshooting-boundaries}

| Síntoma | Límite que se debe comprobar |
| --- | --- |
| El contenedor termina antes de servir `/up` | Comprueba `WATERLINE_SERVER_ENDPOINT`, permisos de escritura en `/data`, un `PORT` válido, configuración de base de datos y registros acotados de migración inicial. |
| Waterline devuelve `401` o `403` desde una vista respaldada por Server | Comprueba `WATERLINE_SERVER_TOKEN` y su rol. Un rechazo de entrada de Waterline es un problema independiente del proxy o de `WATERLINE_ALLOW_UNAUTHENTICATED`. |
| Una ruta de mutación devuelve `waterline_read_only` | Conserva el modo de solo lectura o establece explícitamente `WATERLINE_ACCESS_MODE=operator`. El token debe autorizar el comando igualmente. |
| Faltan workflows esperados | Confirma `WATERLINE_NAMESPACE`, el endpoint y qué entorno aceptó el inicio. Waterline no busca en otros namespaces ni entornos integrados. |
| `/up` funciona pero salud, estadísticas o una vista indican una capacidad no disponible | Verifica el servidor directamente con API o CLI. Después comprueba roles y que la combinación publicada Waterline/SDK PHP expone el método necesario. |
| Una ruta del catálogo de servicios indica `backend_capability_unavailable` | El modo servicio no refleja el catálogo integrado de Waterline entre namespaces. Usa los endpoints y API nativos de servicios del servidor conectado. |
| Falta una métrica personalizada en Waterline | Inspecciona el exportador del worker. Waterline informa de hechos operativos duraderos, no de métricas arbitrarias de procesos. |

### Banner de entorno {#waterline-environment-banner}

Distinga las pestañas de producción y otros entornos con el banner de Waterline. Estas variables funcionan en Laravel integrado y en modo servicio independiente:

```dotenv
WATERLINE_ENV_NAME=production
WATERLINE_ENV_COLOR="#dc3545"
```

`WATERLINE_ENV_COLOR` selecciona una paleta fija compatible con CSP:

| Valor aceptado | Color del banner |
| --- | --- |
| `#0d6efd` o `#2563eb` | Azul |
| `#198754` o `#28a745` | Verde |
| `#6f42c1` o `#7746ec` | Morado |
| `#dc3545` | Rojo |
| `#fd7e14` | Naranja |
| `#ffc107` | Amarillo |

Los demás valores se muestran en gris neutro, incluidos colores hex válidos como `#ff0000`. Use un valor de la tabla para obtener el color deseado.

En Laravel integrado, los valores resueltos de `env_name` y `env_color` en `config/waterline.php` son los que mandan. La configuración publicada puede sobrescribir los valores basados en entorno. Tras modificarlos, reconstruya la caché de configuración de la aplicación mediante su despliegue habitual:

```bash
php artisan config:cache
```

Si el banner difiere de `.env`, inspeccione la configuración resuelta de Waterline. La caché sigue vigente hasta reconstruirla. En modo servicio independiente, actualice el entorno del despliegue de Waterline y vuelva a crear o desplegar su contenedor para cargar los nuevos valores. Son ajustes visuales de Waterline; aplíquelos al servicio Waterline descrito arriba.

### Cloud Managed Waterline {#cloud-managed-waterline}

Los clientes abren Cloud Managed Waterline desde la interfaz gestionada de
operador del namespace. No despliegan ni configuran Waterline, Server, PHP o
endpoints internos, ni mantienen un segundo acceso a Waterline. Las instrucciones
anteriores de imagen autogestionada, opciones `WATERLINE_*`, token de Server,
base de datos y autenticación de entrada no corresponden a esta opción.

La autenticación de Cloud establece la identidad del operador. La autorización
en organización, proyecto, entorno y namespace determina qué ámbito gestionado
puede abrir. Dentro de él, puede usar listas y búsqueda, detalle e historial
duradero, salud del namespace y las acciones admitidas por su rol. La interfaz
se limita al namespace seleccionado y no combina datos de otros entornos ni
namespaces.

Las mutaciones requieren el rol adecuado. Cloud atribuye cada mutación admitida
al actor autenticado en sus datos de auditoría, y la transición duradera queda
visible en el historial. Por ejemplo, un archivado correcto se atribuye en la
auditoría de Cloud y registra el evento duradero `WorkflowArchived`. El operador
no necesita credenciales privadas del entorno ni conocer su despliegue interno.

## API de listas y detalle {#list-and-detail-api}

Las listas (`/waterline/api/flows/{bucket}`) y el detalle de ejecución seleccionada
(`/waterline/api/flows/{id}`) devuelven contratos JSON tipados consumibles por
paneles o scripts propios. La
[referencia de la API de operadores de Waterline](./waterline-operator-api.md)
documenta los endpoints, familias de campos, exportación, acciones disponibles,
programaciones, vistas guardadas, preferencias y contrato de acciones de operador.

### Contrato de acciones disponibles {#actionability-contract}

Waterline anota las filas de listas, respuestas de detalle y exportaciones con
un contrato versionado de acciones disponibles. Los consumidores deben usar
`actionability_contract.schema = waterline.actionability` y
`actionability_contract.version = 1` como identificador de los campos siguientes.

`actionability` a nivel de ejecución indica si la ejecución seleccionada se puede reparar:

| Campo | Significado |
| --- | --- |
| `repair_state` | Uno de `repairable`, `blocked`, `not_needed` o `unknown`. |
| `repairable` | Abreviatura booleana de `repair_state = repairable`. |
| `blocked_reason` | Código de motivo estable cuando `repair_state = blocked`. |
| `status_bucket` | Grupo de Waterline que determinó la decisión de la ejecución. |
| `closed_reason` | Motivo duradero de cierre si la ejecución está cerrada. |
| `task_problem` | Si Waterline detectó un problema de tarea en la ejecución. |
| `diagnostic_only_evidence` | Verdadero cuando al menos una fila de evidencia hija informa pero no es fuente de reanudación. |

Las filas de evidencia bajo `activities`, `waits`, `timers`, `exceptions`, `logs`
y las entradas de cronología/exportación pueden incluir su propio bloque `actionability`:

| Campo | Significado |
| --- | --- |
| `state` | `actionable` cuando la fila es fuente válida de reparación; de lo contrario, `diagnostic_only`. |
| `repair_source` | Verdadero solo para filas respaldadas por una fuente autorizada reparable. |
| `diagnostic_only` | Verdadero cuando la fila no debe usarse como fuente de reanudación. |
| `history_authority` | Autoridad de origen, como `typed_history`, `mutable_open_fallback`, `failure_row_fallback` o `unsupported_terminal_without_history`. |
| `history_unsupported_reason` | Código estable de motivo para historial alternativo no admitido. |

La automatización debe habilitar reparación, reanudación y reproducción según
`actionability.repair_state`, `actionability.repairable` y el
`actionability.repair_source` de cada fila. Una fila con `diagnostic_only = true`
nunca es una fuente duradera de reanudación, aunque contenga metadatos útiles de
fallo o recuperación alternativa. Las filas con
`history_authority = unsupported_terminal_without_history` son solo diagnósticas:
explican el bloqueo pero no demuestran suficiente historial tipado para
reconstruir el progreso con seguridad.

## Acciones del plano de control desde Waterline {#control-plane-actions-from-waterline}

Los operadores pueden cancelar, terminar, reparar y archivar workflows desde
el detalle. Cada acción corresponde a un `POST` sobre el mismo identificador de
ejecución y devuelve `200` con el estado resultante, o `409` si no es válida para
el estado actual.

En modo servicio, Waterline reenvía comandos admitidos mediante el SDK PHP.
Las mutaciones requieren tanto `WATERLINE_ACCESS_MODE=operator` como una
credencial del servidor autorizada para el comando. Sin Waterline, los operadores
siempre pueden usar directamente la API o la CLI del servidor.

En Cloud Managed Waterline, el rol de Cloud y la autorización del namespace
controlan cada mutación admitida. La identidad Cloud autenticada aporta la
atribución de auditoría. Los clientes no configuran una credencial de conexión
de Waterline a Server para la interfaz gestionada.

## Guías relacionadas {#related-guides}

- [Garantías de ejecución e idempotencia](./constraints/execution-guarantees.md)
  explica el contrato de reproducción, reintento, vencimiento de leases y
  resultados duraderos que determina la evidencia del operador.
- [Ámbito operativo del operador](./operator-operating-envelope.md) reúne salud,
  colas, reconstrucción, exportación, archivado y topología en un contrato.
- [Fallos y recuperación](./failures-and-recovery.md) explica el agotamiento de
  reintentos, fallos no reintentables, tiempos de espera y reparaciones que
  aparecen en el panel.
- [Desarrollo asistido por IA](./ai-assisted-development.md) identifica los
  contratos de Waterline, CLI, MCP y formatos para LLM que deben usar los agentes
  al diagnosticar el estado de workflows.
