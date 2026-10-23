---
sidebar_position: 13
title: Despliegues autogestionados
description: Elige una opción admitida de alojamiento propio de Durable Workflow v2 y el artefacto del que partir.
---

# Despliegues autogestionados {#self-hosting-deployments}

Durable Workflow v2 admite varias topologías autogestionadas. Elige la más
sencilla que corresponda al entorno que operas y define explícitamente el
contrato de imagen, base de datos, caché, autenticación, disponibilidad y actualización.

Esta guía cubre la distribución del servidor independiente. Si integras el
paquete Laravel en tu aplicación, usa sus páginas de instalación y configuración.
Durable Workflow Cloud es una alternativa gestionada: Cloud opera el entorno,
persistencia, ubicación y recuperación. Nunca se conecta un Server autogestionado
a Cloud. Consulta [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane).
El contrato actual de Cloud cubre una sola región y su recuperación. No promete
replicación multirregión, conmutación regional automática ni retorno a la región original.

La distribución autogestionada de Server no incluye ni opera Waterline.
Despliégalo por separado si quieres su interfaz de operador y conéctalo a un
namespace de Server siguiendo la
[guía de despliegue y supervisión de Waterline](/docs/monitoring/#waterline-service).
Cloud incluye Managed Waterline para su namespace gestionado.

## Matriz de soporte de despliegue {#deployment-support-matrix}

| Opción | Punto de partida | Usos admitidos | Qué no promete | Cuándo empieza el soporte comercial |
| --- | --- | --- | --- | --- |
| Desarrollo local y entornos internos que no son de producción | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) con `%%artifact.serverTagEnv%%` o `%%artifact.serverImageEnv%%` | Máquina de desarrollo, demostraciones en LAN, pruebas compartidas, integración de SDK y workers | Producción expuesta a Internet, garantías de copias duraderas, rotación estricta de secretos, conmutación multinodo | Necesitas convertir una instalación de desarrollo en procedimientos de producción |
| Producción en un solo nodo | [`docker-compose.published.yml`](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) con archivo de entorno de producción, volúmenes MySQL y Redis, tokens por rol, copias, TLS mediante proxy inverso e imágenes fijadas por etiqueta o resumen | VM, VPS o anfitrión Docker interno con estado de workflow persistente y operación sencilla | Alta disponibilidad del anfitrión, conmutación automática de base de datos, recuperación multirregión, cambios mayores de topología sin interrupción | El despliegue atiende tráfico de producción y quieres revisar copias, restauración, autenticación, TLS, actualización o reversión |
| Clúster pequeño | Imágenes publicadas `durableworkflow/server` o `ghcr.io/durable-workflow/server` usando la [receta Compose](https://github.com/durable-workflow/server/blob/main/docker-compose.published.yml) como plantilla, con 2-3 nodos API, MySQL/PostgreSQL externo compartido, Redis compartido, workers independientes y exactamente un programador/proceso de mantenimiento | Capacidad horizontal de API y workers cuando un nodo no basta; actualizaciones graduales si se cumple todo el [contrato](/docs/rolling-upgrades) | Clúster SQLite, multinodo sin Redis, programadores duplicados permanentes, bases de datos multiescritor activo/activo, conmutación regional autogestionada sin intervención, promesas amplias de SLA de «cinco nueves» o «cero interrupciones», ni conmutación de alta disponibilidad autónoma en una región hasta superar su [control de evidencia](#release-evidence-status) | Necesitas dimensionamiento, dominios de fallo, despliegue o recuperación entre anfitriones, o quieres afirmar el comportamiento de alta disponibilidad sujeto al control |
| Chart Helm para Kubernetes | [Chart de Server](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow) en `oci://ghcr.io/durable-workflow/charts/durable-workflow`, con tu base de datos externa, Redis, ingress y gestión de secretos | Instalación y actualización repetibles de producción para servidor, worker, programador único, inicialización, servicio, sondas y políticas del chart | Persistencia incluida, infraestructura gestionada del proveedor, multirregión activo/activo, operadores personalizados ni conmutación autónoma de alta disponibilidad en una región hasta superar su [control de evidencia](#release-evidence-status) | Necesitas arquitectura, capacidad, recuperación o cambios específicos del proveedor fuera del contrato de valores publicado |
| Manifiestos Kubernetes sin procesar | Manifiestos [`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) con imágenes publicadas y tu base de datos, Redis, ingress y gestión de secretos | Equipos que ya operan Kubernetes y quieren manifiestos inspeccionables de API, worker, programador, inicialización, servicio, sondas, configuración y secretos | Ciclo de vida Helm separado, validación de proveedores Kubernetes gestionados, multirregión activo/activo, operadores propios, decisiones de almacenamiento/red/seguridad del entorno ni conmutación autónoma de alta disponibilidad regional hasta superar su [control de evidencia](#release-evidence-status) | Necesitas capas de configuración, validación de clúster gestionado, planificación del proveedor o afirmar la alta disponibilidad sujeta al control |
| Evaluación multirregión activo/pasivo | Un despliegue validado de un nodo o clúster pequeño por región, replicación asíncrona de base de datos de activo a reserva y procedimientos revisados de conmutación y retorno | Evaluación de arquitectura con soporte y ensayo específico de recuperación de desastres regionales | Contrato 2.0 autónomo probado, multirregión activo/activo, conmutación automática o sin intervención, replicación síncrona entre regiones (RPO=0), visibilidad activa entre regiones o búsqueda federada, ni colas fijadas a región impuestas por el motor | Antes de depender en producción de replicación, conmutación, retorno, RPO o RTO entre regiones |
| Topologías con soporte | Diseño revisado para tu entorno | Multirregión autogestionada activo/pasivo o activo/activo, conmutación regional sin intervención, replicación multiescritor RPO=0, programadores duplicados permanentes, seguridad/redes a medida, SLO privados, capas propias y planificación de migración | Operación autónoma mediante copiar y pegar | La propia topología forma parte del riesgo del producto |

La distribución pública está optimizada para desarrollo local, un nodo en
producción y clústeres pequeños. Los manifiestos Kubernetes son para equipos que
ya lo operan. El material [multirregión activo/pasivo](#activepassive-multi-region)
es una guía de evaluación con soporte, no un contrato 2.0 autónomo probado.
La conmutación de alta disponibilidad en una región (base de datos gestionada,
Redis gestionado, pérdida de nodo API o worker y reinicio de programador) requiere
actualmente soporte mientras su control de evidencia de versión exacta siga
cerrado. Consulta [Alta disponibilidad y conmutación en una región](#single-region-high-availability-and-failover).
En alojamiento propio, multirregión activo/activo, conmutación regional automática,
programadores duplicados permanentes y validación de proveedores Kubernetes
requieren soporte por sus dependencias de base de datos, caché, redes, seguridad,
procesos y actualizaciones. El chart Helm publicado permite empaquetado autónomo
dentro de los mismos límites bajo responsabilidad del operador. Cloud ofrece
operación y recuperación gestionadas en una región, sin replicación ni conmutación
entre regiones. Consulta [Entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane)
y el [alcance del soporte](/docs/support) comercial.

## Entregables de recuperación para producción {#production-recovery-deliverables}

Llamar a una topología «lista para producción» exige publicar su paquete de
recuperación, además de iniciar contenedores. Conserva la evidencia actual en los
mismos procedimientos que los comandos de despliegue:

| Opción | Paquete mínimo de recuperación publicado |
| --- | --- |
| Producción en un nodo | Calendario de copias, imagen o resumen fijado, ubicación de instantánea de entorno/configuración, retraso máximo de restauración aceptado y fecha del último ensayo correcto de restauración con evidencia. |
| Clúster pequeño | Lo anterior más el impacto de perder un nodo API, un worker, el programador/mantenimiento, Redis o la base compartida; pasos de nuevo registro de workers tras restaurar; y estrategia documentada de actualización gradual o parada total para la versión actual. |
| Chart Helm para Kubernetes | Paquete del clúster más versión del chart, revisión de valores, resumen de imagen, responsables de ingress y secretos, y último ensayo de actualización/reversión del chart. |
| Manifiestos Kubernetes sin procesar | Paquete del clúster más responsables de almacenamiento, secretos, ingress y despliegue que deben restaurarse o reaplicarse antes de declarar sano el tráfico. |
| Evaluación de alta disponibilidad regional (con soporte mientras el control esté cerrado) | Paquete del clúster o manifiestos más evidencia de conmutación de base gestionada y Redis gestionado, pérdida de API y worker y reinicio del programador, cada caso dentro del objetivo del [contrato regional](#single-region-high-availability-and-failover), sin pérdida de escrituras confirmadas. |
| Evaluación multirregión activo/pasivo (con soporte) | Paquete por región más diseño de replicación y aislamiento del escritor anterior, retraso medido, RPO/RTO a cargo del operador, procedimientos de promoción y retorno y evidencia del ensayo específico. |

Si no puedes producir ese paquete cuando se solicite, trata el entorno como
pruebas hasta documentar y ensayar la recuperación. El
[ámbito operativo del operador](/docs/operator-operating-envelope) define el orden
de restauración, verificación y cadencia de ensayos que deben seguir estos paquetes.

## Seguridad, datos y auditoría {#security-data-and-audit-posture}

Los despliegues autogestionados heredan la mayoría de controles de seguridad del
entorno operado. Publica estos datos junto a la etiqueta de imagen, plan de
migración y evidencia de recuperación:

| Área | Declaración honesta de publicación |
| --- | --- |
| Tratamiento de datos | Argumentos, resultados, historial, memos, atributos de búsqueda, etiquetas, contexto de comandos, auditoría, excepciones y notas pueden contener datos de la aplicación del cliente. Los [identificadores de workflow](./defining-workflows/workflow-id.md#ids-are-visible-metadata), atributos de búsqueda y etiquetas son metadatos visibles para operadores, no almacenes de secretos. Los identificadores siguen en texto claro y no los cubren los códecs de cargas. |
| Cifrado | Usa TLS en todas las interfaces HTTP de producción y configura [TLS de base de datos](./polyglot/server-config-reference.md#database-tls) en cada rol del Server, incluidas las migraciones. El cifrado en reposo corresponde a tu base de datos, almacenamiento de objetos, sistema de archivos, cola, caché y gestor de secretos. El paquete y Server no cifran automáticamente cada campo de carga. |
| Cumplimiento | El paquete abierto y Server autogestionado ofrecen controles y evidencia de auditoría, no una certificación. SOC 2, HIPAA, PCI, ISO o FedRAMP corresponden a tu programa salvo que una oferta alojada documente otra cosa. |
| Registros de auditoría | Comandos de workflow, eventos de auditoría de programaciones, metadatos de exportación y llamadas de servicio aportan evidencia duradera. No son un SIEM completo, DLP, registro externo inmutable ni sistema de conservación legal salvo que añadas esos componentes. |
| Soporte | Aquí se documentan credenciales por rol, TLS, copias, ensayos de restauración y topologías autónomas acotadas. Identidad avanzada, despliegue mTLS, redes privadas, motores de políticas propios, cumplimiento del proveedor y revisión a medida requieren soporte salvo documentación pública en contrario. |

Define explícitamente la seguridad de red:

- **Entrada de webhooks:** documenta endpoint público, autenticación, estrategia
  de reproducción o idempotencia, plazo, límite de carga, configuración de
  cabeceras de proxy confiables y rotación de secretos.
- **Tráfico de worker a backend:** usa verificación TLS, credenciales de worker
  por rol, cabeceras de namespace, redes privadas o mTLS al cruzar redes no
  fiables y rotación que no otorgue capacidades de operador a tokens de worker.
- **Interfaces de operador:** protege Waterline, API de operador, endpoints de
  automatización CLI y paneles propios con sesiones autenticadas o credenciales
  de servicio por rol, protección CSRF para sesiones de navegador y límites
  proxy/TLS documentados.

## Imágenes publicadas {#published-images}

Usa imágenes publicadas para desplegar Server autogestionado:

- Docker Hub: `%%artifact.serverDockerHubImage%%`
- GitHub Container Registry: `%%artifact.serverGhcrImage%%`
- Fijación por resumen: `durableworkflow/server@sha256:...` o
  `ghcr.io/durable-workflow/server@sha256:...`

Usa etiquetas mutables solo en experimentos locales. En producción fija una
etiqueta de versión o resumen para auditar actualizaciones y reversiones.

## Desarrollo local y entornos internos que no son de producción {#local-development-and-internal-non-production}

Usa la receta Compose de imágenes publicadas para una instalación sin código
fuente respaldada por MySQL y Redis:

```bash
curl -fsSLO https://raw.githubusercontent.com/durable-workflow/server/main/docker-compose.published.yml

export %%artifact.serverTagEnv%%
export DW_AUTH_TOKEN=dev-token

docker compose -f docker-compose.published.yml up -d --wait
```

Verifica API, disponibilidad, descubrimiento del clúster y registro de workers:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  http://localhost:8080/api/cluster/info

curl -X POST http://localhost:8080/api/worker/register \
  -H "Authorization: Bearer $DW_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Namespace: default" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -d '{"worker_id":"compose-worker","task_queue":"compose","runtime":"python"}'
```

Esta opción es segura para desarrollo y pruebas internas. No es un límite de
seguridad de producción: usa un token de compatibilidad, contraseñas
predeterminadas, volúmenes locales con nombre y ningún TLS.

## Producción en un solo nodo {#single-node-production}

Usa el mismo artefacto Compose con configuración de producción fuera del control de versiones:

```env
%%artifact.serverImageEnv%%
SERVER_PORT=8080
APP_ENV=production
APP_DEBUG=false

DB_DATABASE=durable_workflow
DB_USERNAME=workflow
DB_PASSWORD=replace-with-random-password
DB_ROOT_PASSWORD=replace-with-random-root-password

DW_AUTH_DRIVER=token
DW_AUTH_BACKWARD_COMPATIBLE=false
DW_WORKER_TOKEN=replace-with-worker-token
DW_OPERATOR_TOKEN=replace-with-operator-token
DW_ADMIN_TOKEN=replace-with-admin-token
```

Arranca con ese archivo de entorno:

```bash
docker compose --env-file durable-workflow.prod.env \
  -f docker-compose.published.yml up -d --wait
```

Opera la máquina como servicio de producción:

- Coloca TLS, enrutamiento público, registros de peticiones y listas de IP
  permitidas en un proxy inverso delante del contenedor API.
- No expongas MySQL ni Redis públicamente.
- Usa `DW_WORKER_TOKEN` para workers, `DW_OPERATOR_TOKEN` para tráfico de
  aplicación y operador y `DW_ADMIN_TOKEN` para namespaces y administración.
- Haz copia del volumen MySQL antes de cada actualización y regularmente.
  Conserva Redis para reinicios ordenados, pero MySQL sigue siendo la referencia
  duradera del historial.
- Conserva juntos el archivo de entorno exacto, etiqueta o resumen de imagen y
  copia de base de datos para restaurar.

Orden de actualización:

1. Haz copia de MySQL y registra la imagen actual.
2. Cambia solo `DW_SERVER_IMAGE` o `DW_SERVER_TAG`.
3. Descarga la imagen nueva.
4. Ejecuta `docker compose --env-file durable-workflow.prod.env -f docker-compose.published.yml up -d --wait`.
5. Confirma `/api/ready`, `/api/cluster/info` y el registro de workers antes de
   redirigir tráfico externo.

El README de Server mantiene los comandos Compose actualizados en
[Imagen oficial + Compose](https://github.com/durable-workflow/server#official-image--compose).

## Clústeres pequeños {#small-clustered-deployments}

Un clúster pequeño amplía modestamente el modelo de un nodo. El contrato autónomo
validado es deliberadamente acotado:

- Ejecuta 2-3 contenedores API sin estado tras un balanceador. Salud,
  disponibilidad, descubrimiento, registro, sondeo y finalización de tareas de
  workflow deben funcionar sin sesiones persistentes.
- Usa una base MySQL o PostgreSQL externa compartida para historial duradero.
  SQLite solo sirve para un nodo, no para persistencia de clúster.
- Usa Redis compartido para caché, avisos de sondeo largo, bloqueos de consultas
  y admisión de colas y estado de cola. Multinodo sin Redis no está admitido.
- Comprueba `GET /api/cluster/info` en cada nodo al desplegar.
  `topology.current_shape` debe seguir en `standalone_server`,
  `topology.current_roles` debe incluir `api_ingress`, `control_plane`, `matching`
  y `history_projection`, y `topology.execution_mode` seguir en
  `remote_worker_protocol`. Usa `topology.matching_role` para comprobar la ruta
  de asignación real: por defecto indica `queue_wake_enabled: true`,
  `shape: "in_worker"` y `wake_owner: "worker_loop"`. El modo dedicado cambia
  los nodos con `DW_V2_MATCHING_ROLE_QUEUE_WAKE=0` a `queue_wake_enabled: false`,
  `shape: "dedicated"` y `wake_owner: "dedicated_repair_pass"`. El bloque debe
  seguir anunciando el `task_dispatch_mode` previsto, ejes congelados
  `partition_primitives` y `backpressure_model` actual. Consulta
  [Topología de roles de Server](/docs/polyglot/server-role-topology) para los campos.
- Escala workers SDK externos por separado. Pueden usar otras máquinas o
  procesos, pero deben conectarse al endpoint balanceado, no a un nodo fijo.
- Configura [admisión de colas de tareas](/docs/polyglot/task-queue-admission)
  cuando protejan un inquilino, API externa, pool de base de datos u otra
  dependencia compartida.
- Ejecuta exactamente un programador o proceso de mantenimiento para evaluar
  programaciones, imponer vencimientos de actividades y podar historial.
- Inicializa y migra una vez por despliegue antes de aceptar tráfico en
  contenedores API y workers nuevos.
- Elige la estrategia para esta versión: parada total (drenar workers, detener
  programador/mantenimiento, sustituir nodos API, inicializar/migrar y reiniciar
  workers y programador), o [actualización gradual](/docs/rolling-upgrades)
  si se cumplen todas sus garantías.
- Trata base de datos y Redis como dominios principales de fallo. Los
  contenedores de servidor son reemplazables; persistencia y coordinación no.

Las recetas autónomas publicadas empiezan en `standalone_server`, aunque el
descubrimiento también mencione `split_control_execution` como topología del
producto admitida. Es un contrato con distintas asignaciones de roles, no otro
producto de servidor. Si pruebas una separación más explícita, lee
`topology.current_shape`, `topology.current_roles` y `topology.matching_role` en
`/api/cluster/info`, sin deducir funciones de nombres de máquinas o contenedores.
[Topología de roles de Server](/docs/polyglot/server-role-topology) reúne roles y migración.

Todos los nodos API deben usar los mismos tokens o claves de firma, versión de
aplicación y paquete Workflow, configuración de códecs y conexiones de base de
datos y Redis. Asigna un `DW_SERVER_ID` único a cada nodo para distinguirlos.

Los límites no admitidos son explícitos: clúster SQLite, multinodo sin Redis,
programadores duplicados permanentes, bases multiescritor activo/activo,
conmutación regional autogestionada sin intervención y promesas amplias de SLA
de «cinco nueves» o «cero interrupciones» necesitan validación aparte o diseño
con soporte antes de depender de ellos. La guía
[multirregión activo/pasivo](#activepassive-multi-region) también es evaluación
con soporte. La conmutación de alta disponibilidad regional (base gestionada,
Redis gestionado, pérdida de nodo API o worker y reinicio de programador) requiere
soporte hasta superar el control de evidencia. Consulta los objetivos de
recuperación del motor, reglas de disponibilidad y evidencia necesaria en
[Alta disponibilidad y conmutación en una región](#single-region-high-availability-and-failover).

Esta opción es autónoma si tu equipo ya tiene claros los modelos de VM, red,
base de datos, caché, copias y balanceador. Requiere soporte si necesitas definir
esos límites, capacidad, orden de despliegue o recuperación.

## Presupuestos de conexiones SQL {#sql-connection-budgets}

Calcula las sesiones de base de datos antes de añadir réplicas API o solapar
procesos antiguos y nuevos durante una
[actualización gradual](/docs/rolling-upgrades). La base puede alcanzar el
límite de conexiones aunque quede CPU disponible. Este límite es distinto de
la latencia de escritura/commit, la capacidad HTTP y el crecimiento de los
datos conservados.

### Cuenta todos los procesos que usan SQL {#count-every-sql-owning-process}

El despliegue PHP Compose publicado tiene estos posibles clientes SQL:

| Función | Qué contar |
| --- | --- |
| API | Cada proceso PHP que atiende simultáneamente una petición y puede usar SQL, incluidos disponibilidad, operaciones y polls en espera. La configuración Apache prefork publicada permite 24 procesos por contenedor API. Es un máximo de procesos HTTP, no un pool SQL ni una medición de 24 sesiones abiertas. |
| Workers de cola Laravel | Cada proceso `php artisan queue:work`. La receta Compose publicada ejecuta uno; los contenedores worker adicionales añaden procesos. Son distintos de los workers SDK externos. |
| Programador/mantenimiento | Los comandos PHP simultáneos, no solo el contenedor programador. El programador Compose ejecuta secuencialmente evaluación de programas, reparación, expiración de actividades y poda, por lo que su bucle normal tiene un comando activo cada vez. Mantén la regla de un único programador. |
| Inicialización y herramientas operativas | Comandos de migración/inicialización, reconstrucciones de proyecciones, retención, copias, monitorización y clientes SQL interactivos que puedan coincidir con el despliegue. Cuenta por separado los comandos deliberadamente simultáneos. |
| Clientes y workers SDK | Normalmente ninguna sesión directa a la base del Server: los SDK PHP, Python y Rust en modo servicio usan HTTP. Añade conexiones solo si tus actividades u otro código de la aplicación acceden realmente a esa base. |

Cuenta **las conexiones SQL distintas usadas por cada proceso**, no solo
contenedores o nombres de host. La conexión predeterminada de Laravel y
`workflows.storage.connection` pueden compartir un nombre configurado. Otro
nombre de almacenamiento, una conexión SQL para cola/caché/sesión o un
identificador separado de lectura/escritura/directo puede abrir otra sesión,
incluso hacia el mismo endpoint. Redis no cuenta como sesiones SQL. Revisa la
configuración efectiva en caché y los nombres que usa realmente cada función.

En un despliegue FPM propio, cuenta procesos ejecutores PHP-FPM, no hilos nginx
o Apache event. En Octane, inventaría workers de peticiones, workers de tareas
y clientes reales de la base. No reutilices los 24 procesos Apache como tamaño
de pool para esos frontales. Los long polls síncronos ocupan un proceso PHP
mientras esperan y pueden conservar una sesión SQL. No presupuestes
automáticamente un poll HTTP inactivo como consumo SQL cero.

### Ejemplo conservador de actualización gradual {#a-conservative-rolling-upgrade-example}

Es un ejemplo de planificación, **no capacidad medida**. Supón un límite de
120 sesiones cliente, diez para otras aplicaciones y quince reservadas para
recuperación y administración. Quedan 95 para este despliegue. Supón cola y
caché en Redis y como máximo una conexión SQL por proceso PHP.

| Solapamiento máximo | Cálculo | Sesiones previstas |
| --- | --- | ---: |
| Réplicas API, incluida una réplica adicional durante el despliegue | `(2 + 1) × 24 × 1` | 72 |
| Workers de cola Laravel | `2 × 1` | 2 |
| Comando único de programador/mantenimiento | `1 × 1` | 1 |
| Inicialización/migración | `1 × 1` | 1 |
| Copias, monitorización y otras herramientas aprobadas | Asignación explícita | 4 |
| **Subtotal del despliegue** | | **80** |
| Margen del despliegue sin asignar | `95 − 80` | 15 |

Con estos supuestos, una cuarta réplica API elevaría el subtotal a 104 y
superaría las 95 sesiones asignadas. Dos conexiones SQL por proceso API
requerirían ya 144 sesiones solo para las tres réplicas API. Recalcula al
cambiar conexiones de almacenamiento, número de workers o solapamiento.
Reduce los máximos de procesos/réplicas o sustituye por etapas, sin dar por
hecho que la base absorberá la coexistencia. Aumentar `max_connections`
también exige revisar memoria y carga de la base.

### Observa y aplica el presupuesto {#observe-and-enforce-the-budget}

1. Registra el límite efectivo de conexiones, los clientes ajenos y el acceso
   reservado para recuperación. Fija máximos de réplicas/procesos API y de
   réplicas adicionales durante el despliegue. Incluye generaciones de workers
   de cola y herramientas que coincidan.
2. En una copia aislada con tu imagen publicada y configuración exactas,
   muestrea sesiones en reposo, con polls en espera, al completar trabajo real
   y durante un solapamiento antiguo/nuevo acotado. Incluye sesiones inactivas
   y el propio monitor. PostgreSQL expone `pg_stat_activity`; MySQL,
   `information_schema.PROCESSLIST`. Usa un rol de monitorización con permisos
   adecuados y evita exportar texto SQL o payloads.
3. Compara sesiones observadas por usuario/base con la asignación por proceso.
   Una muestra corta valida los supuestos de ese montaje, no un límite de
   saturación ni una garantía para todas las cargas.
4. Vigila el margen de sesiones junto con rechazos de conexión, latencia de
   transacción/commit, esperas de bloqueos, peticiones HTTP retenidas y
   crecimiento del almacenamiento. La disponibilidad no demuestra por sí sola
   que haya capacidad para el despliegue.
5. Cerca del límite, reduce el solapamiento o vacía y retira un grupo API/worker
   antiguo antes de iniciar el sustituto. Conserva acceso para recuperación
   y ejecuta la inicialización solo en la ventana de migración prevista.
   Si el solapamiento seguro no cabe, usa la actualización documentada con
   parada completa.

La [admisión de colas](/docs/polyglot/task-queue-admission) limita ciertas
operaciones de envío y lease. `DW_WORKER_LONG_POLL_MAX_CONCURRENT` y
`DW_QUERY_TASK_POLL_MAX_CONCURRENT` acotan polls en espera por nodo. Ninguno
limita globalmente sesiones SQL, bytes de la base ni latencia de commit.
Reserva también capacidad para completados, heartbeats, operaciones y salud.

Use como referencia un endpoint directo y escribible de la base de datos. Un proxy debe validarse con la versión exacta del Server, el modo de pool y los ajustes de sentencias preparadas, límites de transacciones, estado de sesión y bloqueos. **El pool transaccional de PgBouncer requiere el Server corregido, versión 2.9.8 o posterior.** La [aceptación de la versión publicada 2.9.8](https://github.com/durable-workflow/server/issues/524#issuecomment-6293185092) valida PostgreSQL 16.15 con PgBouncer 1.26.1: PostgreSQL directo, pool de sesiones y pool transaccional con `max_prepared_statements=0` o `max_prepared_statements=200`. Es una versión mínima compatible y una configuración exacta probada, no un pin a la última versión ni una garantía de capacidad; valide otras combinaciones por separado. Ejecute la inicialización habitual `server-bootstrap` contra el endpoint elegido antes de admitir tráfico.

`GET /api/ready` ejecuta una lectura de base de datos con parámetros enlazados (`bound_read_query`) y las comprobaciones de disponibilidad configuradas; deja explícitamente sin verificar la capacidad de escritura. Una conexión TCP, migración o respuesta de disponibilidad correcta no demuestra todas las operaciones SQL del workflow ni la capacidad de commit. Las réplicas de lectura no deben sustituir al escritor autoritativo de claims y transiciones durables.

## Chart Helm para Kubernetes {#helm-chart-for-kubernetes}

El repositorio Server mantiene el
[código del chart y sus instrucciones de publicación](https://github.com/durable-workflow/server/tree/main/k8s/helm/durable-workflow).
Instala el chart publicado desde el registro OCI:

```bash
helm install durable-workflow \
  oci://ghcr.io/durable-workflow/charts/durable-workflow \
  --namespace durable-workflow --create-namespace \
  -f my-values.yaml
```

Tu archivo de valores debe apuntar a MySQL/PostgreSQL y Redis externos, aportar
credenciales de producción mediante Secrets existentes y configurar ingress/TLS.
El chart no crea persistencia ni infraestructura gestionada. Para reproducir
producción, añade `--version <validated-chart-version>` y fija la imagen de
Server por resumen. El repositorio publica versiones y documenta actualizaciones
junto al código del chart.

## Manifiestos Kubernetes {#kubernetes-manifests}

El repositorio incluye manifiestos sin procesar en
[`k8s/`](https://github.com/durable-workflow/server/tree/main/k8s) para equipos que
ya operan Kubernetes:

- Namespace y etiquetas compartidas
- Separación de ConfigMap y Secret
- Job de inicialización/migración
- Deployment y Service de API
- Deployment de workers
- CronJob del programador
- PodDisruptionBudget
- Sondas de vida `/api/health` y disponibilidad `/api/ready`
- Peticiones y límites de recursos conservadores

Antes de aplicarlos, fija una etiqueta publicada o resumen, proporciona
credenciales reales de base y Redis y conecta los valores de ConfigMap a los
servicios de tu clúster. Son manifiestos deliberadamente directos e inspeccionables,
no un chart Helm ni una promesa genérica para Kubernetes gestionado.

En un despliegue de producción Kubernetes verifica, como mínimo:

```bash
kubectl -n durable-workflow wait --for=condition=complete job/durable-workflow-migrate --timeout=180s
kubectl -n durable-workflow rollout status deploy/durable-workflow-server
kubectl -n durable-workflow rollout status deploy/durable-workflow-worker
kubectl -n durable-workflow port-forward svc/durable-workflow-server 8080:8080
curl http://localhost:8080/api/ready
curl -H "Authorization: Bearer $DW_ADMIN_TOKEN" http://localhost:8080/api/cluster/info
```

La conmutación de alta disponibilidad regional sigue requiriendo soporte con
manifiestos igual que con clúster pequeño mientras el control de evidencia esté
cerrado. El contrato previsto exige disponibilidad, programador único y sustrato
compartido según [Alta disponibilidad y conmutación en una región](#single-region-high-availability-and-failover).
Balanceadores, almacenamiento y políticas de red del proveedor, multirregión
activo/activo y conmutación regional sin intervención requieren soporte o un
seguimiento separado. Usa la opción Helm versionada aparte para gestionar con
Helm la instalación y las actualizaciones.

## Alta disponibilidad y conmutación en una región {#single-region-high-availability-and-failover}

La conmutación de alta disponibilidad regional es actualmente un contrato
candidato **sin verificar y con soporte**, sobre clúster pequeño y manifiestos
Kubernetes. Abarca los fallos que el motor está diseñado para soportar
**dentro de una región**: conmutación de base gestionada (RDS Multi-AZ, Aurora,
Cloud SQL HA, promoción Patroni, etc.), Redis gestionado (Sentinel, Elasticache,
Memorystore HA, etc.), pérdida de API o worker y reinicio de programador o
mantenimiento. La recuperación activo/pasivo entre regiones es otra evaluación
con soporte. Consulta [Multirregión activo/pasivo](#activepassive-multi-region).

El contrato previsto (comportamiento, disponibilidad, objetivos por evento,
prevención de doble primario y aceptación del ensayo) está en
[`docs/deployment/ha-failover.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/ha-failover.md)
de la biblioteca y en
[`docs/ha-failover-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/ha-failover-validation.md)
de Server. Esta sección es su presentación pública.

### Estado de la evidencia de publicación {#release-evidence-status}

No hay enlazado un resultado satisfactorio de la versión exacta del servidor
público documentado. El intento registrado con imagen publicada se detuvo en
`topology_start` esperando disponibilidad de API, antes de demostrar la matriz
de fallos o los límites de recuperación. La presencia del ejecutor, su manifiesto
de escenarios o un ensayo particular no demuestra que la imagen haya pasado toda
la matriz. Por ello la alta disponibilidad regional sigue requiriendo soporte.

Solo se puede describir como autónoma después de una ejecución sin código
fuente que use la versión exacta documentada para imagen, ejecutor y topología
Compose y publique `single-region-failover-result.json` con `outcome: "pass"`,
`runner_blocked: false`, todas las fases `phase_outcomes` con `status: "pass"`,
todos los veredictos sobre los límites de recuperación satisfactorios y evidencia de cada escenario del
[manifiesto público](/platform-conformance/single-region-failover-scenarios.json).
Ese resultado debe enlazarse aquí e identificar la misma imagen que
`%%artifact.serverDockerHubImage%%`. Hasta entonces, los límites siguientes son
objetivos de evaluación, no afirmaciones de validación de la imagen publicada.

### Topología candidata {#candidate-topology}

El contrato previsto se aplica al clúster pequeño o manifiestos sin procesar si
el operador conserva tres reglas:

- **Siempre un solo endpoint de escritura de workflows.** Se admite
  conmutación gestionada (RDS Multi-AZ, Aurora, Cloud SQL HA, Patroni, etc.) si
  se aísla el primario anterior antes de reincorporarlo: revocar el usuario de
  escritura, degradarlo con `read_only=on`, cortar replicación o restaurar una
  instantánea fiable. Un proxy debe conservar la semántica de base usada por
  el Server y validarse con su versión exacta, modo y ajustes. Consulta los
  [presupuestos de conexiones SQL](#sql-connection-budgets) para las versiones
  requeridas y los modos probados del pool transaccional PgBouncer.
- **Un endpoint Redis cada vez, con promoción documentada.** Se admite
  Sentinel, Elasticache, Memorystore HA, etc. Redis es aceleración, no el
  sustrato de corrección: su conmutación afecta a latencia, nunca a corrección.
- **Siempre un programador/proceso de mantenimiento.** El orquestador
  (Compose con `deploy.replicas: 1`, unidad systemd con lease de anfitrión o
  Kubernetes `Deployment` con `replicas: 1` y `RollingUpdate.maxSurge: 0`) debe
  conservar esta invariante al reiniciar. Los procesos duplicados permanentes
  quedan fuera del contrato.

### Comportamiento y objetivos de recuperación por evento {#per-event-behavior-and-recovery-targets}

El contrato previsto fija objetivos acotados por clase de evento. No son
garantías de imagen publicada mientras el control siga cerrado. El tiempo real
observado es el objetivo del motor más la latencia de promoción del servicio gestionado.

| Evento | Comportamiento candidato del motor | Objetivo tras volver el sustrato/proceso |
| --- | --- | --- |
| Conmutación de base gestionada | Lecturas y escrituras devuelven errores, sin almacenar escrituras silenciosamente. `/api/ready` falla en todos los nodos y el programador. No se pierde trabajo confirmado. | Una reconexión del pool, una cadencia `task_repair` (3 s por defecto) y un plazo de sondeo largo (30 s por defecto, máximo 60 s) para sondeadores en curso. |
| Conmutación de Redis gestionado | Los avisos perdidos recurren al vencimiento de sondeo largo. La salud de aceleración pasa a **warning**, no a error. `/api/ready` suele seguir correcto. | Intervalo de reconexión del cliente Redis. |
| Pérdida de nodo API (1 de N) | El balanceador retira el nodo dentro de su intervalo de disponibilidad. Las peticiones en curso fallan en el balanceador y el cliente reintenta. | Intervalo de disponibilidad del balanceador (controlado por operador, normalmente 5–10 s). |
| Pérdida de worker | Sus tareas se pausan hasta vencer el lease. Otros workers siguen reclamando las suyas. | Vencimiento del lease (5 min en actividades) más una cadencia `task_repair`. |
| Reinicio del programador/mantenimiento | Se pausan activaciones, imposición de vencimientos y poda de historial. Se reanudan en el siguiente ciclo tras reiniciar. No se duplican activaciones porque el proceso es único. | Latencia de reinicio del orquestador más un ciclo del programador. |

### Reglas de balanceador, disponibilidad y tráfico {#load-balancer-readiness-and-traffic-shift-rules}

El balanceador delante de API es el punto único de admisión de tráfico durante
una conmutación:

- Configúralo con **`GET /api/ready`**, no solo `/api/health`. Salud solo prueba
  HTTP; disponibilidad informa de conectividad y comprobaciones configuradas,
  incluido el estado de aceleración Redis. No prueba todas las operaciones SQL
  de workflows ni verifica capacidad de escritura. Ante una caída de base,
  todos los nodos fallan correctamente.
  El balanceador DEBE tolerar que todos estén caídos sin recurrir a una lista
  antigua de nodos «conocidos como sanos».
- Usa intervalos de 5–10 segundos y retira tras 2–3 fallos consecutivos.
- No exijas sesiones persistentes: la prueba de clúster pequeño demuestra que
  un worker externo puede sondear `server-a` y completar en `server-b`.
- Si solo falla Redis, todos los nodos siguen disponibles mientras funcionen
  las rutas duraderas de base de datos. La degradación aparece como
  `checks.cache.status=warning` y
  `checks.cache.degraded_capability=long_poll_wake_acceleration`. No retires
  nodos por esa advertencia.

Tras recuperar el sustrato, espera al menos un `/api/ready` con 200, consulta
`/api/cluster/info` por el balanceador con token admin para confirmar topología,
registra un worker de prueba con `POST /api/worker/register` en el endpoint
balanceado, confirma exactamente un programador activo en su orquestador y
reanuda tráfico externo.

### Ensayo con artefactos exactos {#run-the-exact-artifact-rehearsal}

La publicación incluye un ensayo de referencia reutilizable para toda la matriz
de fallos sin compilar código de producto. Ejecutor y Compose deben proceder de
la misma etiqueta que la imagen. No combines una rama cambiante con una imagen
arbitraria. En una máquina limpia con Docker Engine, Compose v2, Python 3.11 o
posterior y acceso a registros públicos, ejecuta:

<!-- docs-example id="single-region-failover-exact-release" -->
```bash
export DW_SERVER_RELEASE=%%artifact.serverVersion%%
git clone --depth 1 --single-branch --branch "$DW_SERVER_RELEASE" \
  https://github.com/durable-workflow/server.git "server-$DW_SERVER_RELEASE"
cd "server-$DW_SERVER_RELEASE"
export DW_SERVER_IMAGE="durableworkflow/server:$DW_SERVER_RELEASE"
scripts/conformance/single-region-failover-published-artifacts.sh \
  --result-dir ./failover-result
```

Esta opción deriva la copia y `DW_SERVER_IMAGE` de una sola variable. No cambies
la imagen por separado: cambia `DW_SERVER_RELEASE` antes de clonar. El ejecutor
exige una etiqueta o resumen público concreto, descarga imágenes auxiliares,
resuelve todas a resúmenes de repositorio y rechaza secciones de compilación,
montajes de código del producto y referencias locales o móviles de servidor.
Arranca exactamente dos nodos API tras un nginx, una base MySQL, un Redis y un
programador/mantenimiento.

`single-region-failover-result.json`, esquema
`durable-workflow.v2.single-region-failover.result`, registra versiones exactas
de artefactos y herramientas, topología normalizada, transiciones de
disponibilidad, tiempos medidos y veredictos, identidades de workflow/ejecución/
tarea/programación y comprobaciones de duplicación/pérdida para finalización
entre nodos, pérdida de API, interrupción de base y Redis, pérdida de lease de
worker y reinicio del programador único. Los ejecutores externos descubren la
invocación y el manifiesto en `single_region_failover_contract` de
`GET /api/cluster/info`.

Un resultado solo valida interrupción y recuperación contra la imagen publicada
si supera el control de evidencia anterior. Fallos, resultados parciales o
ejecutores bloqueados son evidencia diagnóstica, no validación. Incluso una base
que pasa no convierte el reinicio local de MySQL o Redis en evidencia de la
promoción de un proveedor Cloud. Conserva junto a ella evidencia nativa del
proveedor sobre promoción, aislamiento, RPO y tiempo transcurrido antes de
afirmar alta disponibilidad gestionada.

### Ampliaciones del paquete de recuperación {#recovery-packet-additions}

Un despliegue de clúster pequeño o manifiestos que afirme cumplir este contrato
DEBE ampliar su paquete según el
[ámbito operativo del operador](/docs/operator-operating-envelope) con ensayos de:

- conmutación de base gestionada sin pérdida de escrituras confirmadas y dentro
  del límite anterior;
- conmutación Redis sin oscilaciones de rotación del balanceador ni pérdida
  confirmada, mostrando `checks.cache.status=warning` y
  `long_poll_wake_acceleration` degradada;
- pérdida de API absorbida dentro del intervalo configurado, sin pérdida de
  escrituras confirmadas;
- pérdida de worker conservando la ejecución duradera hasta vencer el lease,
  reclamándola tras el límite de reparación y completándola exactamente una vez;
- reinicio de programador en otra máquina sin duplicar activaciones ni dejar
  una programación sin evaluar más allá de `next_fire_at` más un ciclo.

Mientras el control esté cerrado, todo despliegue requiere soporte aunque su
ensayo pase. Tras un resultado público satisfactorio de todas las fases, solo
se convierte en autónomo si su evidencia específica figura en el paquete del
operador y se renueva según la cadencia publicada del ámbito operativo.

### Límites de afirmaciones de alta disponibilidad no admitidas {#boundary-against-unsupported-ha-claims}

El contrato regional es acotado. Lo siguiente sigue **fuera** de él y requiere
diseño con soporte, pues la topología es parte del riesgo:

- bases multiescritor activo/activo;
- multirregión activo/pasivo y conmutación regional autogestionada automática o
  sin intervención (la [sección siguiente](#activepassive-multi-region) conserva
  orientación de evaluación);
- replicación síncrona de base entre regiones (RPO=0);
- programadores/mantenimiento duplicados permanentes;
- colas fijadas por región como eje impuesto por el motor;
- validación Kubernetes gestionada del proveedor más allá del empaquetado del chart;
- promesas amplias de SLA de «cinco nueves» o «cero interrupciones» que excedan
  los límites anteriores.

El contrato es de *recuperación acotada ante eventos concretos*, no una promesa
de disponibilidad dependiente de decisiones del operador sobre base, red y
orquestador. El marketing o SLA autogestionado NO DEBE cruzar ese límite sin
validación específica.

## Multirregión activo/pasivo {#activepassive-multi-region}

Es **orientación de evaluación con soporte**, no un contrato autónomo probado
en el ámbito 2.0 admitido. Revisa una arquitectura candidata y prepara un ensayo
específico con soporte antes de depender de ella en producción. Cada región
parte de un nodo, clúster pequeño o Kubernetes documentado, pero esos contratos
no demuestran replicación, conmutación, retorno, RPO, RTO ni prevención de doble
primario entre regiones. El diseño detallado (autoridad de datos, replicación,
namespaces/colas/workers, procedimientos, aislamiento y compromisos de consistencia
y latencia) está en
[`docs/deployment/multi-region.md`](https://github.com/durable-workflow/workflow/blob/main/docs/deployment/multi-region.md)
y [`docs/multi-region-validation.md`](https://github.com/durable-workflow/server/blob/main/docs/multi-region-validation.md).

Topología candidata para evaluar:

- Una **región activa** con contrato validado de un nodo o clúster pequeño:
  API tras balanceador, MySQL/PostgreSQL externo compartido como base duradera de
  escritura, Redis compartido, un programador/mantenimiento y workers externos.
- Una **región de reserva** con réplica asíncrona de la base, Redis opcional de
  reserva, ningún programador/mantenimiento y cero o más contenedores API/worker
  preparados pero inactivos hasta la promoción.
- **Conmutación regional** explícita a cargo del operador: detener escrituras a
  la región fallida, confirmar replicación contra RPO, promover la réplica,
  aplicar migraciones requeridas, iniciar programador único en la nueva región,
  cambiar endpoints de workers, tráfico externo y reconstruir proyecciones
  derivadas. No hay transición automática entre regiones.
- **Retorno** siguiendo la secuencia inversa cuando vuelve la región original,
  aislando antes el primario recuperado (revocar usuario, `read_only=on`, cortar
  replicación o restaurar instantánea fiable) para reincorporarlo como reserva.

Autoridad de datos e hipótesis de replicación:

- La base es la única referencia duradera y está vinculada a región: solo una
  región escribe cada vez. La base de reserva es de lectura hasta promoverla.
  RPO es el retraso de replicación asíncrona; RTO es el tiempo de ejecución del
  procedimiento del operador.
- Redis acelera localmente en cada región. Avisos, bloqueos de consultas y
  admisión no se propagan entre regiones ni se debe esperar que lo hagan. Cada
  región tiene Redis propio; el operador elige caché fría o caliente en reserva.
  La corrección no depende de conservarla al conmutar.
- La visibilidad procede de la base activa. Primero promueve, después lee.

Comportamiento de namespaces, colas y registro de workers:

- Namespaces y colas están en la base y sobreviven tal como estaban en el último
  commit replicado. El motor no los particiona por región.
- Los workers de la nueva región activa se registran contra su API local tras
  promover. Los registros de la región fallida permanecen y vencen normalmente.
- El estado de despliegue y los despliegues por build-id sobreviven porque
  están en la base de datos.

Compromisos de consistencia y latencia en operación normal:

- Inicios, señales y actualizaciones se confirman en la base activa, con su
  latencia de commit, y se rechazan mientras se retira la autoridad al conmutar.
- La entrega de tareas sigue el contrato de aceleración de una región: menos
  de un segundo con Redis sano y cadencia de sondeo duradero en caso contrario.
- Las programaciones se activan en el programador único activo y se pausan sin
  programador. Se reanudan desde filas duraderas tras la promoción.
- Las lecturas reflejan escrituras solo dentro de la región activa. No hay
  garantía de leer las propias escrituras entre regiones ni RPO=0.

El diseño no sustituye copias ni evidencia. Sigue siendo obligatorio el paquete
del [ámbito operativo del operador](/docs/operator-operating-envelope), ampliado
con SLO de retraso de replicación, latencia del procedimiento de promoción,
fecha del último ensayo correcto y aislamiento del primario recuperado.

En alojamiento propio, multirregión activo/pasivo y activo/activo, conmutación
regional automática, replicación síncrona (RPO=0), visibilidad activa entre
regiones y colas regionales impuestas por el motor siguen requiriendo
[soporte](/docs/support), pues la topología es parte del riesgo. El
[contrato gestionado de Cloud](/docs/polyglot/cloud-control-plane) actual es de
una región y no aporta esas garantías multirregión.

## Contrato de disponibilidad {#readiness-contract}

Usa comprobaciones de salud y disponibilidad:

- `GET /api/health` demuestra que el proceso sirve HTTP.
- `GET /api/ready` informa de las comprobaciones de dependencias configuradas,
  incluidas conectividad, migraciones y disponibilidad del namespace
  predeterminado. No prueba todas las operaciones SQL de workflows ni la
  capacidad de escritura disponible.
- `GET /api/cluster/info` demuestra que un cliente autenticado descubre la
  identidad, protocolos de control y workers, códecs y capacidades.
- `POST /api/worker/register` demuestra que los workers se autentican en el
  namespace y cola esperados.

No redirijas tráfico basándote solo en `/api/health`.
