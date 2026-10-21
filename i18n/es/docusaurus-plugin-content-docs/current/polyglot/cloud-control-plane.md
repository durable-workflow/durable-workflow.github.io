---
sidebar_position: 3
title: Runtime gestionado de Cloud
description: Compara planes Cloud, capacidad medida de workflows, facturación y disponibilidad y conecta workers PHP, Python o Rust a un espacio de nombres gestionado.
tags:
  - cloud
  - managed-runtime
  - polyglot
  - operations
keywords:
  - Durable Workflow Cloud
  - URL del runtime del espacio de nombres
  - credenciales de runtime
  - workers ejecutados por el cliente
  - redes privadas
  - runtime gestionado de una región
  - runtime gestionado multirregión
---

# Runtime gestionado de Cloud {#cloud-managed-runtime}

Durable Workflow Cloud es un servicio de orquestación gestionado. Cloud opera el plano de control alojado y el runtime de orquestación, incluidos estado e historial de workflows, programaciones, colas, leases y visibilidad duradera. Los clientes ejecutan clientes SDK y workers contra un espacio de nombres Cloud aprovisionado.

Es una opción separada del autohospedaje. Un Durable Workflow Server autohospedado funciona de forma independiente y nunca se conecta a Cloud.

## Planes y precios {#plans-and-pricing}

Pagas por capacidad aprovisionada, no por semántica de workflows. Cada espacio de nombres recibe un runtime gestionado aislado; los workers PHP, Python y Rust se ejecutan en tu entorno. Consulta los [precios de Cloud](https://cloud.durable-workflow.com/pricing) y el panel para conocer la disponibilidad actual de aprovisionamiento.

Cloud Dev está disponible. Los cuatro planes de alta disponibilidad están en cualificación y aún no se pueden comprar ni aprovisionar. Sus precios, capacidades, disponibilidad y condiciones de SLA siguientes son previstos, no ofertas de compra actuales.

| Plan | Capacidad del runtime | Almacenamiento duradero incluido | Disponibilidad | Precio (USD) |
| --- | --- | --- | --- | --- |
| Cloud Dev | 1 vCPU, 1 GB RAM | 5 GB | Un host, sin SLA | $0.075/hora, mínimo de $2 por mes activo, máximo de $50/mes |
| Cloud Standard | 1 vCPU, 2 GB RAM | 25 GB | HA prevista en una región, SLA del 99.99% | $0.45/hora, mínimo de $10 por mes activo, máximo de $300/mes |
| Cloud Multi-Region | 1 vCPU, 2 GB RAM | 25 GB | HA multirregión prevista, SLA del 99.99% | $0.60/hora, mínimo de $15 por mes activo, máximo de $400/mes |
| Cloud Business | 4 vCPU, 8 GB RAM | 100 GB | HA prevista en una región, SLA del 99.99% | $2.25/hora, mínimo de $50 por mes activo, máximo de $1,500/mes |
| Cloud Business Multi-Region | 4 vCPU, 8 GB RAM | 100 GB | HA multirregión prevista, SLA del 99.99% | $3.00/hora, mínimo de $75 por mes activo, máximo de $2,000/mes |

La capacidad cubre los componentes del runtime gestionado, no el cómputo de workers del cliente. En los planes HA previstos, replicación y capacidad de reserva están incluidas en el precio; la tabla no suma réplicas como capacidad adicional de ejecución. Todos los planes incluyen Managed Waterline, copias básicas cifradas, actualizaciones y una URL de runtime estable.

Se factura el tiempo del runtime aprovisionado, medido por minuto desde la activación hasta su retirada. Los mínimos y máximos se aplican por compra de runtime en un mes natural UTC. El tiempo aprovisionado inactivo se factura; un mes sin tiempo aprovisionado no tiene cargo de runtime. Cada compra nueva tiene su propio mínimo y máximo; una reparación o recuperación gestionada por el servicio no los restablece. Stripe factura mensualmente el uso acumulado. Los precios no incluyen impuestos aplicables.

El almacenamiento se fija en la asignación incluida. No hay complementos vendidos por separado, aumentos automáticos ni cargos por exceso. Para más espacio, [solicita un plan mayor](https://cloud.durable-workflow.com/contact) antes de alcanzar el límite. Pasar de una región a multirregión por sí solo no aumenta el almacenamiento. Ampliar capacidad exige cambiar realmente el runtime, no solo la factura; actualmente se tramita con soporte. El uso de red se mide, aún no se factura y no es ilimitado.

Consulta los [precios de Cloud](https://cloud.durable-workflow.com/pricing) para elegir un plan. Para mayor capacidad, otra conectividad, SSO, soporte empresarial o disponibilidad personalizada, [contacta con nosotros](https://cloud.durable-workflow.com/contact).

## Límites del servicio gestionado {#managed-service-boundary}

El límite visible para el cliente es un espacio de nombres Cloud:

```text
Cloud organization
  project
    environment
      namespace
        stable runtime URL
        client runtime credential  ---> workflow starts and commands
        worker runtime credential  ---> registration, polling, and completion

Cloud-operated runtime
  workflow state and history
  schedules and task queues
  leases, matching, and visibility
  Managed Waterline
```

Cloud se encarga del aprovisionamiento, operación, persistencia, ubicación, salud, recuperación y Managed Waterline del espacio de nombres. El cliente posee el código de aplicación, las implementaciones de workflows y actividades y los procesos de sus workers. Los clientes Cloud no despliegan un servicio Waterline separado.

El endpoint HTTPS del espacio conecta directamente con su runtime gestionado. El tráfico SDK no pasa por la aplicación web/plano de control de Cloud. Utiliza la URL devuelta sin cambios y sin añadir `/api`; el SDK y la CLI construyen sus rutas API. Las llamadas administrativas siguen utilizando `https://cloud.durable-workflow.com/api/v1`.

La administración de Cloud y el tráfico de runtime utilizan credenciales distintas:

- Una clave API de Cloud (`dwc_...`) gestiona proyectos, entornos, espacios de nombres, facturación y ciclo de vida de credenciales de runtime.
- Una credencial de runtime de cliente (`dwr_...`) inicia y controla workflows en un espacio gestionado.
- Una credencial de runtime de worker (`dwr_...`) registra workers, sondea tareas con espera larga, envía latidos y liquida trabajo en ese espacio.

La URL del runtime no acepta claves API de Cloud. Las credenciales de runtime están limitadas a un espacio y rol, solo se devuelven al crearlas y se omiten de listas y respuestas posteriores de auditoría.

Si la incorporación a Cloud utiliza la CLI, instálala desde la [guía de CLI](./cli.mdx) y actualiza explícitamente una instalación independiente con `dw upgrade`. La CLI nunca se actualiza en segundo plano. Tras instalar o actualizar, ejecuta `command -v dw` y `dw --version`; resuelve cualquier indicación del instalador sobre `PATH` antes de usar credenciales Cloud para que esté activo el binario seleccionado.

## Aprovisionar y conectar un espacio de nombres {#provision-and-connect-a-namespace}

### 1. Crear y aprovisionar el espacio de nombres {#1-create-and-provision-the-namespace}

En el [panel Cloud](https://cloud.durable-workflow.com/), crea organización, proyecto, entorno y espacio de nombres y selecciona el plan de capacidad. Crear una cuenta o definir un espacio no aprovisiona capacidad de pago. Completa la configuración de pagos con Stripe y selecciona **Provision** en la página del espacio. Añadir una tarjeta por sí solo no inicia el aprovisionamiento.

El aprovisionamiento es asíncrono. La página actualiza su progreso mientras Cloud prepara el runtime. Espera a que esté activo antes de trabajar con el SDK. La página también permite crear credenciales y acceder a Managed Waterline para inspeccionar workflows e historial.

Para preparar mediante API, configura primero el pago. Este ejemplo utiliza el plan predeterminado de la organización; `capacity_plan_version` permite seleccionar otro disponible. No proporciones una URL de Server, identificador de despliegue ni registro de ubicación propios:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders","retention_days":30}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/provision \
  -H "Authorization: Bearer dwc_..."
```

Al terminar, la respuesta proporciona `runtime_url` estable, `runtime_namespace`, estado gestionado e información de región visible al cliente. Trata la URL y el espacio devueltos como configuración propiedad de Cloud; no derives otro endpoint ni los sustituyas por una dirección autohospedada.

### 2. Emitir credenciales separadas de cliente y worker {#2-issue-separate-client-and-worker-credentials}

Emite ambos roles de runtime de forma independiente:

```bash
curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-client","role":"client"}'

curl -X POST \
  https://cloud.durable-workflow.com/api/v1/projects/PROJECT/environments/ENVIRONMENT/namespaces/orders/runtime-credentials \
  -H "Authorization: Bearer dwc_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"orders-worker","role":"worker"}'
```

Cada token se muestra una vez en su respuesta de creación. Guárdalo en el almacén de secretos utilizado solo por el rol correspondiente. Un proceso combinado deliberadamente recibe ambos como secretos distintos. Rota y revoca cada rol por separado y nunca sustituyas una credencial de runtime por una clave API de Cloud.

### 3. Completar el primer workflow Cloud {#cloud-first-workflow}

El entorno compartido de runtime externo de Sample App ejecuta la misma ruta de workflow y actividad con PHP, Python o Rust. Abre un [Codespace de Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main), exporta los valores aprovisionados y las dos credenciales y elige una cola de aplicación:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<language-task-queue>'
```

Elige un SDK oficial y ejecuta el mismo contrato de runtime gestionado:

```bash
language=php # Choose php, python, or rust.
scripts/playground "$language" --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

El ejecutor resuelve los artefactos estables actuales, entrega cada credencial solo a su proceso hijo, espera hasta 60 segundos un registro que anuncie exactamente la cola y los tipos generados de workflow y actividad y después inicia una solicitud del cliente. Solo tiene éxito si el SDK devuelve el resultado esperado, `dw` informa de `completed` y existe el historial requerido. El comando no ejecuta Server ni Waterline locales en modo gestionado.

Para cada lenguaje, repite el comando gestionado completo anterior cambiando solo `language`. Continúa con su guía para autoría específica:

- [SDK de PHP](/docs/polyglot/php/): fija `language=php`.
- [SDK de Python](/docs/polyglot/python/): fija `language=python`.
- [Inicio rápido de runtime gestionado de Rust](/docs/polyglot/rust-cloud-quickstart/): fija `language=rust` y utiliza sus diagnósticos de worker listo, resultado completado y discrepancias.

Una ruta combinada de cliente y worker conserva ambas credenciales como secretos distintos. Una clave de administración Cloud no es una credencial de runtime y no debe exportarse bajo ninguna de las variables de token de runtime.

### 4. Continuar la operación gestionada {#4-continue-with-managed-operation}

El cliente SDK inicia workflows y envía comandos posteriores por la URL del runtime. Los workers del cliente se registran y realizan sondeos largos por la misma URL con el rol worker. Cloud autentica y acota cada solicitud, ejecuta el protocolo de orquestación en el runtime gestionado y persiste estado e historial.

La aplicación cliente no selecciona un despliegue de runtime para cada operación. Los ID de workflow y ejecución, colas, marcadores de compatibilidad y codificación Avro siguen siendo contratos duraderos de aplicación dentro del espacio Cloud.

## Conectividad de los workers del cliente {#customer-run-worker-connectivity}

Los workers pueden ejecutarse en tu red, flota de VM, plataforma de contenedores o entorno de aplicación. Necesitan HTTPS saliente hacia la URL del runtime y permitir solicitudes de sondeo de larga duración del protocolo.

- Cloud no necesita conectarse de forma entrante al worker.
- Los proxies y gateways de salida no deben acortar sondeos largos convirtiéndolos en bucles de reintento continuo.
- Los workers deben reintentar fallos transitorios de conexión y respuestas de servicio no disponible con esperas acotadas.
- Trasladar un worker no traslada el estado del workflow; Cloud conserva estado e historial duraderos.
- Rotar credenciales no exige cambiar URL, espacio de nombres ni cola.

## Ubicación regional y límites de recuperación {#region-placement-and-recovery-boundary}

Cloud Dev está disponible con el límite de recuperación siguiente. Los límites HA describen planes previstos aún no disponibles y pendientes de cualificación:

- **Cloud Dev:** un host aislado con estado persistente y copias de seguridad. Mantenimiento y recuperación pueden interrumpir el servicio. No hay SLA de disponibilidad ni conmutación regional automática.
- **HA prevista en una región:** tres hosts replicados en una región con conmutación automática del primario. Puede fallar un host sin perder el quorum restante. Una caída de toda la región queda fuera del SLA.
- **HA multirregión prevista:** tres hosts replicados en tres regiones con conmutación automática del primario. El SLA incluye pérdida o aislamiento de una región configurada si los miembros restantes pueden formar quorum.

En los perfiles HA previstos, la URL estable está diseñada para seguir al primario elegido; no cambias la configuración SDK durante una conmutación admitida. Se impide que un primario antiguo aislado siga atendiendo trabajo autoritativo. Si no se puede establecer un primario seguro, el runtime deja de atender en lugar de aceptar escrituras en conflicto. HA no promete solicitudes ininterrumpidas: clientes y workers siguen necesitando reintentos acotados ante fallos transitorios.

La página del espacio muestra topología, regiones y estado del servicio. Las copias permiten recuperación, pero no sustituyen la replicación activa. Las pruebas breves de conmutación demuestran los casos ejercitados, no una garantía universal de tiempo de recuperación ni la disponibilidad lograda en un mes.

### Medición de SLA y créditos {#sla-measurement-and-credits}

Los cuatro planes SLA previstos especifican un SLA de disponibilidad del 99.99% por mes natural UTC, medido en el endpoint del cliente en ventanas de un minuto. La ausencia de mediciones cuenta como indisponibilidad y el mantenimiento planificado no se excluye. La disponibilidad de workers alojados por el cliente es independiente de la del runtime gestionado.

| Disponibilidad mensual | Crédito automático en cuenta |
| --- | ---: |
| Al menos 99.99% | Ninguno |
| Al menos 99.9% e inferior a 99.99% | 10% |
| Al menos 99.0% e inferior a 99.9% | 25% |
| Inferior a 99.0% | 100% |

Los planes con SLA reciben créditos de servicio automáticamente en la cuenta.
Los créditos nunca superan lo cobrado ese mes por el runtime afectado y no hay
reembolsos en efectivo por interrupciones. Cloud Dev no tiene créditos SLA.
Consulta las [condiciones de Cloud](https://cloud.durable-workflow.com/terms) y los
[precios de Cloud](https://cloud.durable-workflow.com/pricing) para el alcance de
disponibilidad y las condiciones de facturación.

## Límites de conectividad privada y soporte {#private-connectivity-and-support-boundary}

El contrato Cloud de autoservicio 2.0 presupone acceso saliente de clientes y workers a la URL pública del runtime. La entrada exclusivamente privada, VPN o peering personalizados y el enrutamiento privado específico del proveedor se diseñan con soporte, no son valores predeterminados ocultos. Nunca se entregan direcciones internas ni se pide eludir la URL del espacio.

## Cloud o Server autohospedado {#cloud-or-self-hosted-server}

Elige Cloud si Durable Workflow debe operar runtime de orquestación, persistencia, disponibilidad del plan elegido, recuperación y Managed Waterline mientras tu equipo opera clientes SDK y workers.

Elige [Server autohospedado](/docs/polyglot/server) si tu equipo necesita operar por separado la imagen Server, base de datos, caché, red, autenticación, copias y conmutación. Un Server autohospedado no puede registrarse, conectarse ni servir como runtime de respaldo de un espacio Cloud. Laravel integrado, Server autohospedado y Cloud son opciones separadas.

## Pruebas de rendimiento de workflows estándar {#standard-workflow-benchmarks}

[DW Standard Workflow v1](https://github.com/durable-workflow/server/tree/main/benchmarks/capacity) define una carga pequeña y reproducible: un inicio de workflow, una actividad externa y una finalización, con entradas y resultados Avro definidos de 1 KiB. El worker del cliente se ejecuta fuera de la asignación gestionada.

Cloud Dev se midió el 21 de septiembre de 2026 con el mismo plan que aprovisionan los clientes. Las otras cuatro bases son históricas: incluyen su topología HA replicada, pero preceden al runtime actual. No se extrapolan de Dev ni cualifican la capacidad de los planes SLA actuales.

| Plan | Workflows estándar/segundo | Acciones de workflow en 30 días | Medición |
| --- | ---: | ---: | --- |
| Cloud Dev | 0.25 | 1,296,000 | 21 de septiembre de 2026; detalles abajo |
| Cloud Standard | 0.25 | 1,296,000 | Histórica; nueva medición pendiente |
| Cloud Multi-Region | 0.10 | 518,400 | Histórica; nueva medición pendiente |
| Cloud Business | 0.50 | 2,592,000 | Histórica; nueva medición pendiente |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Histórica; nueva medición pendiente |

La estimación de 30 días es `workflows/second x 2,592,000 seconds x 2 workflow actions`: un inicio y una actividad para esta comparación. Supone mantener esa tasa durante 30 días continuos. No es una cuota de acciones incluidas, unidad de facturación ni correspondencia exacta con definiciones de acciones de otros motores.

Son bases medidas para esa carga, no rendimiento máximo ni capacidad garantizada para cualquier aplicación. Cargas mayores, más actividades, temporizadores, señales, consultas, historiales con mucha reproducción, comunicación entre regiones y latencia del worker cambian el resultado. La tabla no afirma pruebas independientes de temporizadores, señales, reproducción ni saturación. Planifica según tu mezcla real en lugar de multiplicar por un tamaño arbitrario de workflow.

### Medición de Cloud Dev {#cloud-dev-capacity}

Cloud Dev es un runtime gestionado aislado de un host para desarrollo y evaluación. La medición utilizó un runtime Dev aprovisionado normalmente sin cambiar CPU, memoria, almacenamiento, entrada ni copias:

| Recurso | Cloud Dev |
| --- | --- |
| Cómputo del runtime | 1 vCPU compartida, 1 GB RAM |
| Almacenamiento duradero incluido | 5 GB |
| Servicios de runtime | Server, worker de cola, planificador, MySQL y Redis |
| Managed Waterline | Incluido mediante la aplicación Cloud autenticada; no es un proceso en el host Dev |
| Ruta de red | Entrada HTTPS directa y específica del espacio |
| Workers del cliente | En su propio entorno |
| Disponibilidad | Sin SLA; se permiten interrupciones de mantenimiento |
| Precio actual del runtime | Consulta [Planes y precios](#plans-and-pricing) |
| Más almacenamiento | Solicita un plan mayor; sin complementos de almacenamiento |

La prueba utilizó la [definición PHP pública de DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/68168f34b637a19c054211f4db2df9c616799a86/benchmarks/capacity/v1/bindings/php/capacity_adapter.php): un inicio, una actividad externa de eco y una finalización, con una cadena de 1,024 bytes en Avro en cada entrada y resultado de workflow/actividad. Server 2.3.12 contenía Workflow 2.0.14; worker externo y clientes utilizaron PHP SDK 2.0.11 sobre PHP 8.4.25. El runtime utilizó PHP 8.3.33 y MySQL 8.0.46.

Un worker PHP utilizó un tiempo de espera de sondeo de un segundo. Dos slots de cliente independientes ofrecieron un workflow cada cuatro segundos tras un calentamiento separado de 30 segundos. La ventana fija fue **18:50:30-18:55:30 UTC del 21 de septiembre de 2026**. Solo las finalizaciones observadas en esos cinco minutos cuentan para el rendimiento; finalizar pendientes después no aumenta la tasa. Se comprobaron todos los resultados, estados completados e historiales ordenados de workflow/actividad.

| Resultado medido | Valor |
| --- | ---: |
| Tasa ofrecida y completada | 0.25 workflows estándar/segundo |
| Workflows completados | 75 de 75 |
| Errores / slots de inicio perdidos | 0 / 0 |
| Latencia de inicio a resultado, p50 | 2.76 segundos |
| Latencia de inicio a resultado, p95 | 4.18 segundos |
| Latencia de inicio a resultado, p99 | 4.33 segundos |
| Workflows sin terminar en la cohorte medida | 0 |
| Acciones de workflow en 30 días | 1,296,000 |

La latencia incluye red del cliente y sondeo de resultados cada 100 ms. No es latencia interna de planificación de tareas ni debe compararse con una métrica interna de planificación de otro motor.

La CPU del host promedió **63.5% de ocupación**, con un máximo del **89%** en muestras de cinco segundos. No hubo **eliminaciones por OOM ni reinicios de contenedores**. Los picos de memoria observados fueron 95.21 MiB para Server, 197.1 MiB para MySQL, 45.84 MiB para el worker de cola, 43.75 MiB para el planificador, 9.49 MiB para Redis y 34.59 MiB para el conector de entrada. Estos picos individuales no son RSS simultánea de todo el host; el SO y otros procesos también consumen memoria. El host conservó su swap normal de 1 GiB, con hasta unos 90 MiB ocupados. Se verificó una copia cifrada inicial antes de la ventana; ninguna captura de copia coincidió con ella.

Es una base medida de desarrollo, no una conversión universal, prueba de rendimiento máximo, prueba prolongada ni SLA. Cargas mayores, actividades adicionales, temporizadores, señales, consultas, historiales con mucha reproducción y latencia del worker modifican la capacidad. Cloud factura tiempo de runtime aprovisionado con almacenamiento fijo incluido, no operaciones de workflow.

## API de uso para facturación {#billing-usage-api}

Cloud Dev utiliza una celda aislada de runtime de un host por espacio Dev aprovisionado. Sus condiciones son:

| Concepto de facturación | Cloud Dev |
| --- | ---: |
| Runtime aprovisionado | $0.075 por hora, medido por minuto |
| Máximo por mes natural | $50 por compra de runtime |
| Mínimo de mes activo | $2 por compra de runtime en un mes UTC activo |
| Capacidad gestionada | 1 vCPU, 1 GB de memoria, 5 GB de almacenamiento duradero |
| Almacenamiento duradero adicional | No se vende por separado; solicita un plan mayor |
| Copias básicas cifradas | Incluidas |
| Disponibilidad | Un host, sin SLA |

La asignación cubre Server, MySQL, Redis, planificación, acceso Waterline, copias, actualizaciones e infraestructura operados por Cloud. Los workers PHP, Python y Rust del cliente quedan fuera. Inicios de workflow, intentos de actividad, reintentos, temporizadores, señales, consultas, actualizaciones y workflows hijos son telemetría operativa, no unidades de facturación separadas. Los precios excluyen impuestos aplicables. El almacenamiento incluido no genera un cargo separado.

Cloud ofrece uso facturable por organización para finanzas, operaciones y reparto de costes. El endpoint se autentica con una clave API Cloud y no acepta ID de cliente ni organización; resuelve la organización desde el token bearer `dwc_` para impedir consultar uso ajeno.

```http
GET /api/v1/billing/usage?period_start=2026-05-01&period_end=2026-05-31
Authorization: Bearer dwc_...
Accept: application/json
```

`period_start` y `period_end` son fechas ISO-8601 opcionales. Si se omiten, se devuelve el mes natural actual. Las lecturas y exportaciones siguen disponibles aunque restricciones de facturación pausen aprovisionamiento u operaciones, para que finanzas pueda regularizar la cuenta.

El esquema de respuesta es `durable_workflow.cloud.namespace_capacity_usage.v1`. Separa tiempo de capacidad asignada de contadores de eventos semánticos. Los campos de almacenamiento se conservan por facturación histórica; no autorizan comprar complementos. La respuesta Dev abreviada siguiente muestra las condiciones actuales.

```json
{
  "schema": "durable_workflow.cloud.namespace_capacity_usage.v1",
  "access_control": {
    "scope": "organization_billing_usage",
    "read_allowed": true,
    "export_allowed": true
  },
  "current_period": {
    "starts_at": "2026-05-01T00:00:00+00:00",
    "ends_at": "2026-05-31T23:59:59+00:00"
  },
  "metering_policy": {
    "invoice_drivers": [
      "namespace_plan_capacity",
      "additional_durable_storage_gb_month"
    ],
    "semantic_events_are_invoice_units": false,
    "network": "measured_not_billable",
    "basic_backups": "included",
    "customer_worker_compute": "excluded"
  },
  "by_namespace": [
    {
      "namespace": "development",
      "project": "sample-app",
      "environment": "development",
      "plan": {
        "version": "cloud-dev.single-host-v2",
        "name": "Cloud Dev",
        "availability_class": "development_single_host",
        "sla_status": "none",
        "billing_terms": {
          "currency": "usd",
          "unit": "provisioned_runtime_hour",
          "hourly_rate_cents": "7.5",
          "monthly_cap_cents": 5000,
          "active_month_minimum_cents": 200,
          "scope": "runtime_purchase",
          "billing_period": "calendar_month_utc",
          "metering_resolution_seconds": 60,
          "additional_storage_unit": "gb_month",
          "additional_storage_rate_cents": 0,
          "additional_storage_available": false,
          "additional_storage_metering_unit": "gb_hour",
          "additional_storage_in_monthly_cap": false
        }
      },
      "allocation": {
        "managed_cpu_vcpu": 1,
        "managed_memory_gb": 1,
        "included_durable_storage_gb": 5
      },
      "operational_telemetry": {
        "billing_status": "not_billable",
        "counters": {
          "workflow_execution_count": 20,
          "activity_execution_count": 40,
          "timer_fire_count": 5,
          "signal_delivery_count": 3,
          "update_delivery_count": 0,
          "query_task_count": 2
        }
      }
    }
  ]
}
```

El contador de tiempo de Cloud Dev comienza al activar el runtime aislado y termina al retirarlo. Máximo y mínimo se aplican por compra en meses naturales UTC. El almacenamiento no crece ni comienza a facturarse automáticamente. Cloud conserva una reserva operativa y de recuperación en disco; solicita un plan mayor antes de alcanzar la asignación incluida.

Los runtimes inactivos siguen generando cargos de capacidad. Retirarlos detiene esa facturación y elimina datos activos y credenciales; no es una pausa reanudable. Los SLA previstos utilizan el mismo modelo de tiempo aprovisionado con sus propias tasas, mínimos y máximos. Interpreta el uso según los `billing_terms` devueltos; las facturas históricas conservan sus condiciones aceptadas.

Exporta la misma evidencia como CSV o informe JSON si un sistema financiero posterior necesita un archivo:

```bash
curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/export?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."

curl -OJ "https://cloud.durable-workflow.com/api/v1/billing/usage/report?period_start=2026-05-01&period_end=2026-05-31" \
  -H "Authorization: Bearer dwc_..."
```

Para un panel basado en JSON, solicita la misma API con su intervalo temporal:

```text
GET https://cloud.durable-workflow.com/api/v1/billing/usage?period_start=${__from:date:YYYY-MM-DD}&period_end=${__to:date:YYYY-MM-DD}
Authorization: Bearer dwc_...
```

Después aplana las filas de capacidad de espacios de nombres con:

```jq
.by_namespace[]
| {
    project,
    environment,
    namespace,
    plan: .plan.name,
    cpu_vcpu: .allocation.managed_cpu_vcpu,
    memory_gb: .allocation.managed_memory_gb,
    included_storage_gb: .allocation.included_durable_storage_gb,
    capacity_status
  }
```

Utiliza `invoice_units` para conciliar capacidad y almacenamiento. Utiliza `operational_telemetry` para entender la carga y las pruebas de rendimiento; no conviertas esos contadores en cargos.

## Referencias relacionadas {#related-references}

- [Modos de despliegue](/docs/polyglot/deployment-modes)
- [SDK de PHP](/docs/polyglot/php)
- [SDK de Python](/docs/polyglot/python)
- [SDK de Rust](/docs/polyglot/rust)
- [Servidor](/docs/polyglot/server)
- [Despliegues autohospedados](/docs/deployment)
- [Soporte](/docs/support)
