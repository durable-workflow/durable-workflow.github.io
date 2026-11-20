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
| Cloud Standard | 2 vCPU, 4 GB RAM | 25 GB | HA prevista en una región, SLA del 99.99% | $0.45/hora, mínimo de $10 por mes activo, máximo de $300/mes |
| Cloud Multi-Region | 2 vCPU, 4 GB RAM | 25 GB | HA multirregión prevista, SLA del 99.99% | $0.60/hora, mínimo de $15 por mes activo, máximo de $400/mes |
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

Cloud Dev se midió el 19 de noviembre de 2026 en el runtime nativo de Server 3.15.0 que Cloud aprovisiona para los nuevos runtimes Dev. Las otras cuatro bases son históricas: incluyen su topología HA replicada, pero preceden al runtime actual. No se extrapolan de Dev ni cualifican la capacidad de los planes SLA actuales.

| Plan | Workflows estándar/segundo | Acciones de workflow en 30 días | Medición |
| --- | ---: | ---: | --- |
| Cloud Dev | 1.5 | 7,776,000 | 19 de noviembre de 2026; detalles abajo |
| Cloud Standard | 0.25 | 1,296,000 | Histórica; nueva medición pendiente |
| Cloud Multi-Region | 0.10 | 518,400 | Histórica; nueva medición pendiente |
| Cloud Business | 0.50 | 2,592,000 | Histórica; nueva medición pendiente |
| Cloud Business Multi-Region | 0.20 | 1,036,800 | Histórica; nueva medición pendiente |

La estimación de 30 días es `workflows/second x 2,592,000 seconds x 2 workflow actions`: un inicio y una actividad para esta comparación. Para Cloud Dev, eso es 1.5 x 2,592,000 x 2 = 7,776,000. Supone mantener esa tasa durante 30 días continuos. No es una cuota de acciones incluidas, unidad de facturación ni correspondencia exacta con definiciones de acciones de otros motores.

Son bases medidas para esa carga, no rendimiento máximo ni capacidad garantizada para cualquier aplicación. Cargas mayores, más actividades, temporizadores, señales, consultas, historiales con mucha reproducción, comunicación entre regiones y latencia del worker cambian el resultado. La tabla no afirma pruebas independientes de temporizadores, señales, reproducción ni saturación. Planifica según tu mezcla real en lugar de multiplicar por un tamaño arbitrario de workflow.

### Medición de Cloud Dev {#cloud-dev-capacity}

Cloud Dev es un runtime gestionado aislado de un host para desarrollo y evaluación. La medición utilizó un runtime Dev aprovisionado normalmente sin cambiar CPU, memoria, almacenamiento, red, entrada ni copias:

| Recurso | Cloud Dev |
| --- | --- |
| Cómputo del runtime | 1 vCPU compartida, 1 GB RAM |
| Almacenamiento duradero incluido | 5 GB |
| Servicios de runtime | Server nativo, MySQL, Redis y el conector de entrada |
| Managed Waterline | Incluido mediante la aplicación Cloud autenticada; no es un proceso en el host Dev |
| Ruta de red | Entrada HTTPS directa y específica del espacio |
| Tráfico saliente del runtime | Limitado a 4 Mbit/s |
| Workers del cliente | En su propio entorno |
| Disponibilidad | Sin SLA; se permiten interrupciones de mantenimiento |
| Precio actual del runtime | Consulta [Planes y precios](#plans-and-pricing) |
| Más almacenamiento | Solicita un plan mayor; sin complementos de almacenamiento |

La prueba utilizó la [definición PHP pública de DW Standard Workflow v1](https://github.com/durable-workflow/server/blob/f16f9b7337d3d64b1ba6458ab61ba2d7ed7f334f/benchmarks/capacity/v1/bindings/php/capacity_adapter.php): un inicio de workflow, una actividad externa de eco y una finalización, con una cadena de 1,024 bytes en Avro en cada entrada y resultado de workflow/actividad. El runtime fue la versión de Server que Cloud aprovisiona para los nuevos runtimes Dev: Server nativo 3.15.0 con MySQL 8.0.46 y Redis 7.4.11. Su `/api/cluster/info` informó la implementación `rust`, la versión 3.15.0 y el protocolo de worker 1.20. Los workers externos y los clientes utilizaron el PHP SDK 3.22.0 publicado sobre PHP 8.4.27, instalado en ese binding en lugar de su SDK 2.0.10 fijado. Se ejecutaron fuera del host del runtime y se conectaron a través de su entrada HTTPS normal.

La carga se aplicó en escalones de 0.25, 0.5, 1, 1.5 y 2 workflows/segundo, y los escalones límite se repitieron. Cada escalón tuvo un calentamiento separado de 30 segundos y después una ventana fija de cinco minutos. Solo las finalizaciones observadas dentro de la ventana cuentan para el rendimiento; finalizar pendientes después no puede aumentar la tasa informada.

- Workers: cuatro workers PHP hasta 1 workflow/segundo, seis a 1.5 y cuatro, seis u ocho a 2. Cada uno utilizó un tiempo de espera de sondeo de tareas de un segundo.
- Clientes: `max(2, 8 x rate)` slots de cliente independientes ofrecieron inicios según un calendario fijo. Un inicio con más de un segundo de retraso cuenta como slot de inicio perdido.
- Resultados: los clientes sondearon el resultado de cada workflow una vez por segundo. El Server nativo todavía no admite el sondeo largo del historial (`wait_new_event`, [server#1257](https://github.com/durable-workflow/server/issues/1257)).
- Comprobaciones: se verificaron todos los resultados, estados completados e historiales ordenados de workflow/actividad.
- Un escalón se supera sin errores, sin slots de inicio perdidos en la ventana, con todos los workflows verificados, sin crecimiento del trabajo pendiente y sin eliminaciones por OOM ni reinicios. La tasa publicada es el escalón superado más alto con la CPU del host en torno al 80% o menos.
- La CPU del host se obtuvo de `/proc/stat` cada cinco segundos. La memoria de los contenedores es el working set del cgroup.

| Tasa ofrecida (workers) | Ventana, 19 de noviembre (UTC) | Iniciados / ofrecidos | Completados en la ventana | Perdidos / errores | p50 / p95 / p99 (s) | Sin terminar al cierre de la ventana | CPU del host prom. / pico | Resultado |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0.25/s (4) | 22:56-23:01 | 75 / 75 | 75 | 0 / 0 | 1.24 / 1.30 / 1.42 | 0 | 29.3% / 35.2% | superado |
| 0.5/s (4) | 23:02-23:07 | 150 / 150 | 151 | 0 / 0 | 1.25 / 1.41 / 2.61 | 0 | 38.2% / 45.5% | superado |
| 1/s (4) | 23:08-23:13 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.57 / 1.65 | 1 | 58.8% / 64.2% | superado |
| 1/s (4), repetición | 23:36-23:41 | 300 / 300 | 300 | 0 / 0 | 1.36 / 1.56 / 1.64 | 1 | 48.5% / 61.6% | superado |
| 1.5/s (6) | 23:29-23:34 | 450 / 450 | 446 | 0 / 0 | 1.78 / 3.98 / 5.10 | 6 | 54.0% / 60.9% | superado |
| 1.5/s (6), repetición | 23:43-23:48 | 450 / 450 | 446 | 0 / 0 | 1.77 / 3.71 / 4.83 | 6 | 55.8% / 61.8% | superado |
| 2/s (4) | 23:15-23:20 | 522 / 600 | 520 | 78 / 0 | 6.49 / 9.87 / 10.58 | 16 | 50.4% / 65.5% | fallido: inicios perdidos |
| 2/s (8) | 23:22-23:27 | 455 / 600 | 452 | 145 / 0 | 7.92 / 11.66 / 12.86 | 14 | 43.0% / 50.1% | fallido: inicios perdidos |
| 2/s (6) | 23:49-23:54 | 496 / 600 | 487 | 104 / 1 | 6.97 / 10.43 / 11.04 | 15 | 48.6% / 56.4% | fallido: inicios perdidos, 1 workflow fallido |

| Resultado medido a 1.5 workflows/segundo | Valor |
| --- | ---: |
| Tasa ofrecida | 1.5 workflows estándar/segundo |
| Ventana de medición | 23:29:52-23:34:52 UTC |
| Completados dentro de la ventana | 446 (1.49/segundo) |
| Completados tras finalizar los pendientes | 450 de 450 iniciados |
| Errores / slots de inicio perdidos | 0 / 0 |
| Latencia de inicio a resultado, p50 | 1.78 segundos |
| Latencia de inicio a resultado, p95 | 3.98 segundos |
| Latencia de inicio a resultado, p99 | 5.10 segundos |
| Workflows sin terminar en la cohorte medida al cierre de la ventana | 6 |
| CPU del host, promedio / pico | 54.0% / 60.9% |
| Acciones de workflow en 30 días | 7,776,000 |

Los seis workflows sin terminar se iniciaron en los últimos segundos de la ventana y se completaron dentro del rango normal de latencia; no se cuentan. Durante la ventana hubo como máximo nueve workflows abiertos a la vez, y la latencia mediana del último minuto (1.87 segundos) se mantuvo cerca de la del primer minuto (1.76 segundos), por lo que no se acumuló trabajo pendiente. El escalón repetido de 1.5 se superó con el mismo rendimiento, una p99 de 4.83 segundos y una CPU del host con un promedio de 55.8%.

La latencia incluye red del cliente (unos 85-170 ms por viaje de ida y vuelta HTTPS desde el host de medición) y sondeo de resultados cada segundo, por lo que la mediana no puede bajar mucho de un segundo. No es latencia interna de planificación de tareas ni debe compararse con una métrica interna de planificación de otro motor.

No hubo **eliminaciones por OOM ni reinicios de contenedores** en ningún escalón. A 1.5 workflows/segundo, los picos de memoria observados de los contenedores (working set) fueron 17.16 MiB para el Server nativo, 244.35 MiB para MySQL, 6.29 MiB para Redis y 30.16 MiB para el conector de entrada. Estos picos individuales no son RSS simultánea de todo el host; el SO y otros procesos del host también consumen memoria. El host conservó su swap normal de 1 GiB, con hasta unos 50 MiB ocupados. La copia cifrada inicial se capturó y verificó antes de la primera ventana, y ninguna otra captura de copia coincidió con la prueba.

El escalón de 2 workflows/segundo no superó la prueba. Tres intentos, con cuatro, ocho y seis workers, perdieron 78, 145 y 104 de 600 slots de inicio, con latencias p99 de 10.6 a 12.9 segundos. La CPU del host no fue el límite: promedió 43-50% en esos intentos. El límite fue la limitación del tráfico saliente del runtime. Este método generó unos 400 KB de tráfico saliente del runtime por workflow (sondeo de resultados, respuestas de tareas a los workers y sobrecarga de transporte): 3.35 Mbit/s a 1 workflow/segundo y los 4.0 Mbit/s completos a 1.5 y 2. Más workers no ayudaron, porque su sondeo añade tráfico. En el intento con seis workers, un workflow falló después de que su actividad perdiera el arrendamiento de su tarea mientras el tráfico saliente estaba saturado. Todos los demás workflows de todos los escalones se completaron con el historial esperado, sin errores ni eliminaciones por OOM ni reinicios. Por tanto, la base medida de Dev es de 1.5 workflows estándar/segundo; no se afirman tasas mayores.

Esto sustituye la base de Dev del 18 de noviembre de 2026, de 0.25 workflows/segundo. Aquella prueba midió el runtime PHP Server 2.9.12 que Dev aprovisionaba entonces, con un worker y sondeo de resultados cada 100 ms, y su única vCPU era el límite.

Fue un runtime nuevo medido durante aproximadamente una hora, no una prueba prolongada. Los escaneos de mantenimiento de Server 3.15.0 leen todas las ejecuciones retenidas, por lo que el trabajo de la base de datos crece con el historial retenido; Server 3.16.0 limita esos escaneos al trabajo abierto ([server#1256](https://github.com/durable-workflow/server/issues/1256)). Cloud Dev se volverá a medir en Server 3.16.0, incluida una prueba más larga con historial retenido. Es una base medida de desarrollo, no una conversión universal para cada workflow, prueba de rendimiento máximo ni SLA. Cargas mayores, actividades adicionales, temporizadores, señales, consultas, historiales con mucha reproducción y latencia del worker del cliente modifican la capacidad. Cloud factura tiempo de runtime aprovisionado con almacenamiento fijo incluido, no operaciones de workflow.

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

Antes de desaprovisionar, siga [trasladar cargas entre runtimes](/docs/polyglot/runtime-migration/#preserve-evidence): conserve evidencia verificada de historial y payloads y confirme que todas las ejecuciones del origen son terminales. La facturación de capacidad continúa mientras el origen siga aprovisionado.

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
