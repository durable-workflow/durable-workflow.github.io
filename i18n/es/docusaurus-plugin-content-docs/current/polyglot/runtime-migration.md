---
title: "Trasladar cargas entre runtimes"
description: "Drene las ejecuciones existentes y dirija nuevos inicios entre Server autogestionados y Cloud."
tags:
  - migration
  - operations
  - polyglot
---

# Trasladar cargas entre runtimes

Dirija nuevos inicios al destino mientras las ejecuciones existentes terminan en su origen. Este procedimiento cubre runtimes independientes de modo servicio. Exportar el historial conserva evidencia, pero no transfiere una ejecución activa originada en Server. La [importación de embedded v2](./embedded-to-server.md#phase-e-import-eligible-embedded-v2-runs) admite solo orígenes embedded elegibles.

## Elegir el destino {#paths}

| Traslado | Preparación del destino |
| --- | --- |
| Server autogestionado a otro Server autogestionado | Despliegue el destino con su propia base de datos autoritativa, almacenamiento de payloads y credenciales. Siga la [guía de despliegue](../deployment.md). |
| Server autogestionado a Cloud | Aprovisione el namespace de destino y compruebe la URL del runtime, credenciales y capacidades devueltas. Siga la [configuración de Cloud](./cloud-control-plane.md). |
| Cloud a Server autogestionado | Prepare el destino autogestionado y sus workers SDK antes de cambiar el tráfico de la aplicación. Mantenga el origen Cloud aprovisionado mientras se drenan sus ejecuciones. |

## Preparar ambos runtimes {#prepare}

Registre cada endpoint de origen, namespace, ID de instancia y ejecución, cola de tareas, tipos de workflow/activity y dependencias del almacén de payloads. Conserve una vía de recuperación probada para el almacenamiento autogestionado. Trasladarse desde Cloud no concede acceso a una copia de la base de datos ni copia sus credenciales al destino. Verifique la versión y capacidades reales del destino, credenciales por rol, registros de workers y tipos anunciados.

## Cambiar nuevos inicios en grupos pequeños {#cutover}

1. Ejecute el destino y sus workers junto al origen. Complete un canario con identidad única, actividades representativas y resultados. Aísle sus efectos del trabajo empresarial real.
2. Inventaríe todos los productores de inicios: llamadas de aplicación, programaciones, adaptadores webhook/bridge y llamadas de servicio. Elija un punto de corte para una familia de workflows. Coordine las pausas de programaciones y el registro del destino para que ambos runtimes no inicien la misma ocurrencia.
3. Dirija los nuevos inicios de esa familia al destino. Mantenga en la aplicación un registro del endpoint y namespace que aceptaron cada workflow. Reutilizar una clave de negocio en otro runtime no ofrece deduplicación entre runtimes.
4. Mantenga señales, aprobaciones, actualizaciones, consultas, cancelación y lecturas de resultados/historial en el runtime propietario. Conserve workers, colas, temporizadores, credenciales y acceso a payloads del origen. Cambiar la URL del cliente no mueve trabajo aceptado ni sus leases de actividad.
5. Compruebe resultados y fallos antes de trasladar la siguiente familia. Si el resultado de un inicio es incierto por el transporte, resuélvalo en el runtime original antes de enviarlo a otro. Una ejecución de larga duración que nunca alcanza un estado terminal no se ha drenado.

## Conservar evidencia antes de retirar el origen {#preserve-evidence}

Exporte el historial que deba conservar, incluida cada ejecución de continuación necesaria, los bytes originales de payload y los codecs. Compruebe integridad y completitud con un consumidor compatible y conserve la identidad exacta del productor. La [guía de exportación y replay](../testing.md#service-sdk-replay) explica las comprobaciones separadas. Los archivos de auditoría no habilitan la importación activa de ejecuciones originadas en Server.

Use el productor que realmente sirve la exportación. Core 2.11.4 por sí solo no califica las exportaciones de Server, CLI incluido, SDK HTTP o Cloud. Siga la [calificación independiente del productor HTTP y la imagen de Server](https://github.com/durable-workflow/server/issues/692). Los paquetes antiguos con pérdida siguen siendo inválidos. No cambie números ni checksums para forzar su aceptación, ni destruya el origen autoritativo mientras la evidencia necesaria no esté disponible o no pueda verificarse.

## Retirar el origen al final {#retire-source}

Confirme que no quedan ejecuciones no terminales del origen en todos los namespaces relevantes y todas las páginas de listas. Incluya padres/hijos en espera y ejecuciones creadas por productores restantes. Un endpoint sano, una primera página vacía o métricas no disponibles no prueban que no haya trabajo abierto. Confirme que ningún cliente, callback o worker depende del origen y que los archivos necesarios se pueden leer.

Solo entonces retire recursos autogestionados o desaprovisione el runtime Cloud. Los cargos de capacidad Cloud continúan mientras esté aprovisionado, incluso inactivo o drenando. Desaprovisionar elimina datos activos y credenciales; no es pausar y reanudar. Use los términos devueltos por el plan vigente; este procedimiento no crea reembolsos automáticos ni excepciones de facturación.

## Revertir el enrutamiento sin trasladar ejecuciones {#rollback}

Devuelva los inicios futuros únicamente a un origen sano y compatible. Las ejecuciones ya aceptadas por el destino siguen siendo suyas y necesitan sus workers y su enrutamiento de comandos hasta terminar. Conserve ambos registros de propiedad y evite inicios duplicados. No restaure almacenamiento antiguo sobre estado aceptado más reciente ni reactive una segunda copia de una ejecución.
