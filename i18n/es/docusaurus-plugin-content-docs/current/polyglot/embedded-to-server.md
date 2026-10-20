---
sidebar_position: 1
title: Migración de integrado a Server
description: Traslada un despliegue Laravel integrado v2 al servidor independiente de Durable Workflow.
---

# Migración de integrado a Server {#embedded-to-server-migration}

Esta guía está dirigida a equipos que ya ejecutan Durable Workflow v2 en una aplicación Laravel y trasladan el tráfico de nuevos workflows al servidor independiente. Si la aplicación sigue en v1, empieza con [Migración a 2.0](/docs/migration) y mantén las ejecuciones v1 existentes en su motor hasta que terminen.

Consulta primero [Adopción de Laravel y transición de runtime](/docs/laravel-adoption/) si aún no has elegido el destino o la integración con Laravel forma parte de la decisión. Esta página es el procedimiento de Server autohospedado después de elegirlo; no es la ruta de migración a Cloud.

La migración es una ruta de adopción, no un traslado de base de datos sobre la misma instalación. El servidor independiente posee los nuevos inicios del plano de control, el historial duradero, las programaciones, los registros de workers y la entrega de tareas por HTTP. Los workers de tu aplicación siguen siendo responsables del código de workflows y actividades.

<div
  data-public-payload-codec-contract="avro-only"
  data-payload-codec="avro"
  data-authority-manifest="https://durable-workflow.github.io/sdk-neutrality-contract.json"
  data-legacy-v1-import-drain="internal">
  Durable Workflow 2.0 tiene un único códec público de cargas útiles: <code data-payload-codec-field="codec">avro</code>.
  JSON es el transporte de documentos HTTP, no un códec de cargas duraderas. Los
  lectores v1 exclusivos de PHP son internos a la ruta de importación/finalización
  y no pueden seleccionarse para nuevas ejecuciones v2. Consulta el
  <a href="/docs/polyglot/avro-value-protocol/">protocolo Avro Value</a>.
</div>

Esta guía de migración es autohospedada. No convierte el despliegue integrado en un espacio de nombres Cloud ni conecta el Server resultante a Durable Workflow Cloud. Para elegir por separado el servicio gestionado, consulta [Runtime gestionado de Cloud](/docs/polyglot/cloud-control-plane).

## Alcance actual {#current-boundary}

Disponible hoy:

- Iniciar nuevos workflows mediante la API del plano de control o la CLI del servidor.
- Registrar workers PHP, Python, Rust o HTTP personalizados contra el servidor.
- Sondear y completar tareas de workflow y actividad mediante el protocolo de workers.
- Importar paquetes aptos de historial exportado de v2 integrado como estado de workflow gestionado por el servidor.
- Exportar paquetes de historial de ejecuciones cerradas de v2 integrado o Server v2 para auditoría, depuración y archivo.
- Observar workflows gestionados por el servidor mediante API, CLI y SDK que lean su estado, o desplegar [Waterline en modo servicio](/docs/monitoring#waterline-service) como observador separado conectado mediante el SDK de PHP. El paquete Waterline de la aplicación Laravel original sigue leyendo solo el estado de su runtime integrado.

No está disponible hoy como operación automática:

- Trasladar ejecuciones v1 al servidor.
- Reproducir historial v1 con workers que no sean PHP.

Planifica la transición para que las ejecuciones v1 terminen donde empezaron. Las ejecuciones v2 integradas pueden finalizar allí o trasladarse mediante el procedimiento de importación siguiente.

## Contrato de modos de despliegue {#deployment-mode-contract}

Para la comparación fijada entre integrado y servicio, consulta [Modos de despliegue](/docs/polyglot/deployment-modes). Esta guía añade cuatro reglas de transición al contrato compartido:

- Las ejecuciones integradas existentes siguen donde empezaron.
- Las nuevas ejecuciones gestionadas por el servidor utilizan claves de tipo, nombres de espacios, colas y contrato de cargas Avro estables desde la primera transición.
- Señales, consultas, actualizaciones, reparación, cancelación, terminación y archivo deben seguir enrutándose al runtime propietario de la ejecución de destino.
- Cada despliegue Waterline debe seguir apuntando al runtime y espacio que observa; no combina ejecuciones integradas y del servidor.

## Invariantes de la transición {#cutover-invariants}

Mantén estas reglas durante toda la migración:

- Configura el servidor como dependencia remota explícita: fija URL base, espacio de nombres, cola y autenticación directamente en lugar de inferirlos de la configuración local de Laravel.
- Mantén estables entre runtimes los ID de workflow, reglas de selección de ejecución, claves de tipo de workflow/actividad, etiqueta de códec (`avro`) y marcadores de compatibilidad.
- Enruta señales, consultas, actualizaciones, reparación, cancelación, terminación y archivo al runtime propietario de la ejecución.
- Antes de importar una ejecución integrada, pausa sus workers el tiempo suficiente para exportar un paquete en reposo, sin tareas de workflow/actividad con lease ni intentos de actividad ejecutándose.
- Incluye la independencia del lenguaje en el contrato: los workflows gestionados por el servidor utilizan alias estables y el esquema fijo Avro Value, no nombres de clases ni formatos de carga exclusivos de PHP.

## Fase A: preparar v2 integrado {#phase-a-prepare-embedded-v2}

Antes de desplegar el servidor, haz que la aplicación integrada utilice contratos independientes del lenguaje. Así reduces el código que cambia durante la transición.

1. Define claves estables de tipos de workflow y actividad.

   ```php
   // config/workflows.php
   'v2' => [
       'types' => [
           'workflows' => [
               'orders.process' => App\Workflows\ProcessOrderWorkflow::class,
           ],
           'activities' => [
               'orders.reserve-inventory' => App\Activities\ReserveInventory::class,
               'orders.capture-payment' => App\Activities\CapturePayment::class,
           ],
       ],
   ],
   ```

2. Utiliza esas claves en todos los límites externos.

   Los clientes envían `workflow_type: "orders.process"` y los workers registran
   `supported_workflow_types` / `supported_activity_types` con las mismas
   cadenas. No expongas FQCN de PHP como contrato público duradero.

3. Utiliza el contrato de cargas Avro v2.

   ```php
   // config/workflows.php
   'serializer' => 'avro',
   ```

   Avro es obligatorio en los nuevos workflows v2 integrados y gestionados por
   el servidor. Solo puede conservarse un lector PHP heredado dentro de la ruta
   de importación/finalización v1 mientras terminan las ejecuciones antiguas.

4. Elige nombres de espacio de nombres y cola.

   Elige nombres estables durante toda la transición de integrado a Server:

   ```bash
   export DURABLE_WORKFLOW_NAMESPACE=production
   export DURABLE_WORKFLOW_TASK_QUEUE=orders
   ```

5. Decide si necesitas marcadores de compatibilidad.

   Un despliegue con una sola flota puede omitirlos. Los mecanismos estándar v2
   (canary, drenaje, reversión y depuración por reproducción) operan en un único
   contrato v2 estable; no existe una ruta de adopción de «v2 con flotas mixtas».
   Si aparece una ventana con versiones distintas durante la transición, fija
   `DW_V2_CURRENT_COMPATIBILITY` y `DW_V2_SUPPORTED_COMPATIBILITIES` antes para
   impedir que una versión nueva reclame ejecuciones de otra incompatible.

## Fase B: desplegar Server junto al integrado {#phase-b-deploy-the-server-beside-embedded}

Ejecuta Server independiente junto a la aplicación Laravel mientras esta sigue atendiendo sus ejecuciones integradas existentes.

```bash
git clone https://github.com/durable-workflow/server.git
cd server
cp .env.example .env
docker compose up -d
```

Para desarrollo local puedes fijar `DW_AUTH_DRIVER=none`. En entornos compartidos utiliza credenciales por rol:

```bash
DW_AUTH_DRIVER=token
DW_WORKER_TOKEN=worker-secret
DW_OPERATOR_TOKEN=operator-secret
DW_ADMIN_TOKEN=admin-secret
```

Verifica el descubrimiento y crea el espacio de nombres:

```bash
export SERVER=http://localhost:8080
export ADMIN_TOKEN=admin-secret
export OPERATOR_TOKEN=operator-secret

curl "$SERVER/api/health"

curl "$SERVER/api/cluster/info" \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

curl -X POST "$SERVER/api/namespaces" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"name":"production","description":"Production workflows","retention_days":30}'
```

El servidor rechaza solicitudes del plano de control sin `X-Durable-Workflow-Control-Plane-Version: 2`; los workers utilizan la cabecera separada `X-Durable-Workflow-Protocol-Version: 1.0`.

## Fase C: conectar workers {#phase-c-connect-workers}

Los workers deben registrarse antes de sondear. El registro anuncia runtime, cola y claves de tipos que pueden ejecutar.

```bash
export WORKER_TOKEN=worker-secret

curl -X POST "$SERVER/api/worker/register" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Protocol-Version: 1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "orders-php-1",
    "task_queue": "orders",
    "runtime": "php",
    "sdk_version": "<installed-sdk-version>",
    "supported_workflow_types": ["orders.process"],
    "supported_activity_types": [
      "orders.reserve-inventory",
      "orders.capture-payment"
    ],
    "max_concurrent_workflow_tasks": 10,
    "max_concurrent_activity_tasks": 50
  }'
```

Después ejecuta workers en modo servidor para el mismo espacio y cola. Los workers Python siguen el mismo contrato de registro y sondeo mediante su SDK. Los personalizados pueden utilizar directamente el [protocolo de workers](/docs/polyglot/worker-protocol).

Comprueba la visibilidad antes de la transición:

```bash
curl "$SERVER/api/workers" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"

curl "$SERVER/api/task-queues/orders" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

## Fase D: dirigir los nuevos inicios al servidor {#phase-d-route-new-starts-to-the-server}

Traslada una familia de workflows cada vez. Mantén la aplicación integrada y los workers de cola para las ejecuciones antiguas hasta que terminen.

Inicia primero un workflow de prueba en paralelo:

```bash
curl -X POST "$SERVER/api/workflows" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "orders-shadow-1001",
    "workflow_type": "orders.process",
    "task_queue": "orders",
    "input": [{"order_id":"1001","mode":"shadow"}]
  }'
```

Observa la ejecución:

```bash
curl "$SERVER/api/workflows/orders-shadow-1001" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2"
```

Cuando funcione esa ruta de prueba, cambia quien llama en producción de `WorkflowStub::start()` al cliente del servidor, CLI o API HTTP directa. Mantén señales, consultas, actualizaciones, cancelación y terminación en el runtime que inició el workflow. Un workflow iniciado de forma integrada recibe comandos integrados; uno iniciado en el servidor recibe comandos de su plano de control.

## Fase E: importar ejecuciones aptas de v2 integrado {#phase-e-import-eligible-embedded-v2-runs}

Utiliza la exportación de historial como formato de importación. El runtime integrado sigue siendo la fuente de verdad del paquete; el servidor lo verifica, escribe filas duraderas en una transacción y reconstruye sus proyecciones desde esas filas.

Criterios de admisión:

- El esquema del paquete debe ser `durable-workflow.v2.history-export` con `schema_version: 1`.
- La ejecución de origen debe ser v2 integrada y la exportación debe contener `workflow.source_runtime: "embedded"`. El historial v1 queda fuera del alcance.
- Una ejecución no terminal debe ser la ejecución integrada actual.
- Una ejecución terminal debe tener `history_complete: true`.
- Se rechazan los paquetes con datos censurados.
- Se rechazan tareas de workflow o actividad con lease e intentos de actividad ejecutándose. Pausa los workers o deja vencer las leases y vuelve a exportar.

Reglas de autoridad de la importación:

- Los `history_events` se copian como registro autoritativo de reproducción y auditoría.
- La identidad del workflow, cargas, comandos, señales, actualizaciones, tareas, ejecuciones de actividad, temporizadores, fallos y enlaces de linaje se reconstruyen desde el paquete.
- Las proyecciones de resumen, espera, temporizadores, cronología y linaje del servidor se reconstruyen después. Sus filas no son la autoridad de importación.
- Las tareas de workflow pendientes siguen siendo reclamables por workers compatibles del servidor.
- Las ejecuciones de actividad pendientes y sus tareas listas siguen siendo reclamables por workers de actividad compatibles del servidor.
- Los temporizadores pendientes conservan `fire_at` y son visibles para reparación/recuperación del servidor.

Fallos y reversión:

- La importación es íntegra o nula dentro de una transacción.
- Si el proceso termina o falla la validación antes de confirmar, no queda estado parcial de la ejecución en el servidor.
- Reintentar el mismo paquete es idempotente por `run_id` y `dedupe_key`.
- Si otra ejecución del servidor ya posee el mismo `run_id`, se rechaza la importación.

Visibilidad y auditoría:

- Las ejecuciones importadas exponen `engine_source: embedded_v2_import` en las vistas de lista y detalle.
- La fila duradera registra `import_source=embedded_v2`, `import_id`, `import_dedupe_key`, `import_contract_version` e `imported_at`.

Procedimiento del operador:

Para ejecuciones v2 integradas:

```bash
php artisan workflow:v2:history-export order-123 \
  --output=storage/workflow-history/order-123.json \
  --pretty
```

Simula la importación en el servidor:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --dry-run \
  --json
```

Importa el paquete:

```bash
php artisan workflow:v2:history-import storage/workflow-history/order-123.json \
  --namespace=production \
  --import-id=orders-cutover-2026-05-05
```

O llama al endpoint HTTP del operador:

```bash
curl -X POST "$SERVER/api/workflows/import/embedded-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  --data-binary @order-123-import-request.json
```

donde `order-123-import-request.json` contiene:

```json
{
  "import_id": "orders-cutover-2026-05-05",
  "bundle": {
    "schema": "durable-workflow.v2.history-export",
    "schema_version": 1,
    "workflow": {
      "source_runtime": "embedded"
    }
  }
}
```

El objeto `bundle` anterior está abreviado; proporciona el documento JSON completo de `workflow:v2:history-export`.

Para ejecuciones gestionadas por el servidor que solo necesites conservar o auditar:

```bash
curl "$SERVER/api/workflows/order-123/runs/$RUN_ID/history/export" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  > order-123-history.json
```

Archiva las ejecuciones terminales del servidor después de exportarlas para excluirlas de la poda por retención:

```bash
curl -X POST "$SERVER/api/workflows/order-123/archive" \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-Namespace: production" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"reason":"history exported to archive storage"}'
```

## Fase F: añadir workers políglotas {#phase-f-add-polyglot-workers}

Cuando una familia funcione en el servidor, añade workers Python, Rust o personalizados registrando el mismo espacio, cola y claves de tipo. Todas las cargas públicas v2 utilizan `avro`; conserva entradas y salidas de actividad independientes del lenguaje: arrays, objetos, cadenas, números, booleanos y nulos.

Utiliza [la guía del SDK de Python](/docs/polyglot/python) o [la del SDK de Rust](/docs/polyglot/rust). Para implementaciones HTTP directas, utiliza [la referencia del protocolo de workers](/docs/polyglot/worker-protocol).

## Lista de comprobación de la transición {#cutover-checklist}

- [ ] Las ejecuciones v1 han terminado o permanecen intencionadamente en su motor.
- [ ] V2 integrado utiliza claves estables, no FQCN de PHP, en límites externos.
- [ ] Todo workflow v2 nuevo utiliza el único códec público `avro`.
- [ ] `/api/health` y `/api/cluster/info` de Server funcionan desde la red del despliegue.
- [ ] Existe el espacio de nombres de destino.
- [ ] Los workers registran la cola y las claves de tipos admitidos esperadas.
- [ ] Un workflow de prueba inicia, es reclamado y llega al estado esperado.
- [ ] Los operadores pueden listar workflows, inspeccionar colas y ver registros de workers.
- [ ] Los iniciadores integrados antiguos se pausan o trasladan para impedir inicios con claves de negocio duplicadas en ambos runtimes.
- [ ] Las ejecuciones integradas v2 elegidas se exportan desde un runtime en reposo y superan `workflow:v2:history-import --dry-run`.
- [ ] Las ejecuciones importadas muestran `engine_source: embedded_v2_import` y el `import_id` esperado en listas y detalles del servidor.
- [ ] Las ejecuciones antiguas cerradas que solo requieren conservación se exportan a almacenamiento duradero.

## Resolución de problemas {#troubleshooting}

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `missing_control_plane_version` | El cliente llamó al plano de control sin cabecera v2 | Envía `X-Durable-Workflow-Control-Plane-Version: 2` |
| `missing_protocol_version` | El worker llamó sin la cabecera de su protocolo | Envía `X-Durable-Workflow-Protocol-Version: 1.0` |
| `namespace_not_found` | No se creó el espacio en el servidor | Créalo con `POST /api/namespaces` |
| Los sondeos no devuelven tareas | No coincide la cola, clave de tipo, espacio o marcador de compatibilidad | Compara la carga de inicio, el registro del worker y la visibilidad de cola |
| Un worker no PHP no decodifica una carga v1 | La ejecución contiene historial v1 nativo de PHP | Mantenla en la ruta interna PHP v1 de importación/finalización; no la dirijas a un worker v2 |
| El workflow antiguo no responde a señales/consultas/actualizaciones del servidor | Se inició integrado | Envía comandos mediante la aplicación integrada hasta que termine |
| La importación rechaza `tasks.leased_task_present` | La exportación capturó una tarea con lease | Pausa los workers, espera a que liberen o completen leases y vuelve a exportar |
| La importación devuelve `already_imported` | El mismo `run_id` y `dedupe_key` ya existe en el servidor | Considera satisfactorio el reintento e inspecciona la ejecución |
| La ejecución importada es visible pero no se reclama | El tipo, cola, espacio o marcador del worker no coincide con la fila importada | Compara el informe de importación, el detalle y el registro del worker |

## Guías relacionadas {#related-guides}

- [Configuración del servidor](/docs/polyglot/server)
- [Protocolo de workers](/docs/polyglot/worker-protocol)
- [SDK de Python](/docs/polyglot/python)
- [Migración a 2.0](/docs/migration)
