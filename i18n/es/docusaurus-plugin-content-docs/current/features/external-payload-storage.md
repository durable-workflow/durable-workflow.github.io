---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - almacenamiento externo de cargas útiles
  - cargas útiles grandes
  - externalización de cargas útiles
  - almacenamiento S3
  - almacenamiento GCS
  - almacenamiento Azure Blob
---

# Almacenamiento externo de cargas {#external-payload-storage}

En Laravel embebido, el almacenamiento externo sustituye los valores codificados grandes del historial del workflow por referencias verificadas al almacenamiento de la aplicación. Esta página describe ese ámbito. Los clientes y workers en modo servicio utilizan el [transporte del runtime de Server](../polyglot/server-api-reference.md#runtime-external-payload-transport): Server conserva las credenciales del proveedor y los SDK intercambian identificadores opacos por HTTP autenticado. Un URI del proveedor no es un sobre de carga válido para Server.

## Cuándo utilizarlo {#when-to-use-it}

Utiliza almacenamiento externo para documentos, contenido multimedia, informes, argumentos o resultados de actividades grandes que realmente deban pasar por la ejecución durable. Los valores pequeños permanecen en línea y no requieren una escritura en el almacén de objetos. La externalización no elimina los límites de carga, eventos del historial ni la necesidad de limitar los objetos que retiene cada ejecución.

## Cómo funciona la externalización {#how-offload-works}

La política del espacio de nombres de la aplicación proporciona un driver y un `threshold_bytes` positivo. Las cargas codificadas cuyo tamaño es **mayor que** el umbral se guardan mediante el driver. Los valores iguales o inferiores permanecen en línea. Una política desactivada o sin driver también mantiene los valores en línea.

La referencia del proveedor del modo embebido usa el esquema `durable-workflow.v2.external-payload-reference.v1` con `uri`, `sha256`, `size_bytes`, `codec` y `expires_at` opcional. El códec es `avro`. `Workflow\V2\Support\ExternalPayloads` guarda el sobre codificado con el prefijo `dw-external-payload:v1:`. Cuando el runtime necesita el valor, obtiene los bytes codificados y verifica el tamaño y SHA-256 antes de decodificar. Los bytes ausentes o modificados producen un fallo, nunca un valor `null` de sustitución.

Esta referencia difiere del esquema de Server `durable-workflow.v2.runtime-external-payload-reference.v1`. Consulta la [tabla de soporte por modo](../polyglot/server-api-reference.md#external-payload-support-by-mode) antes de trasladar un helper del driver o un sobre almacenado entre modos de despliegue.

## Límite de confianza de la decodificación {#decode-trust-boundary}

El almacenamiento y la decodificación tienen límites de confianza distintos. Un proveedor puede guardar bytes codificados mientras que un worker, servidor de códecs o herramienta de exportación que los decodifique puede ver los valores de la aplicación. Decide dónde se ejecutan los decodificadores, a qué claves acceden y cómo se ocultan datos en vistas previas y registros. Los hashes, tamaños y nombres de códec son metadatos de integridad, no una garantía de cifrado de extremo a extremo. Los URI del proveedor también pueden contener nombres de objetos sensibles.

## Opciones de driver {#driver-choices}

| Driver | Esquema URI | Requisito en modo embebido |
| --- | --- | --- |
| Sistema de archivos local | `file://` | Todos los procesos embebidos que resuelvan una referencia deben acceder a la misma raíz de almacenamiento. |
| Almacenamiento compatible con S3 | `s3://` | Driver o disco de la aplicación con el bucket, prefijo y credenciales adecuados. |
| Google Cloud Storage | `gs://` | Driver o disco de la aplicación y cliente del proveedor. |
| Azure Blob Storage | `azure://` | Driver o disco de la aplicación y cliente del proveedor. |

Server puede usar almacenamiento local mientras los workers SDK remotos obtienen los datos por HTTP. Estos workers no necesitan un sistema de archivos compartido ni credenciales del proveedor.

## Configurar un espacio de nombres {#configuring-a-namespace}

Las aplicaciones embebidas configuran su política de almacenamiento y `ExternalPayloadStorageDriver` en su runtime Laravel. Conserva las credenciales en la configuración de la aplicación, no en argumentos del workflow, historial ni URI de referencias. Utiliza una política coherente en todos los procesos que ejecutan y reproducen una ejecución.

En Server autohospedado, la [API administrativa de almacenamiento](../polyglot/server-api-reference.md#namespace-and-storage) y los [comandos CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) configuran la política de Server. No conceden acceso directo al proveedor a los workers SDK.

### Con la CLI {#with-the-cli}

`dw namespace:set-storage-driver` configura un espacio de nombres de Server, no el contenedor Laravel de una aplicación embebida independiente. Consulta los parámetros obligatorios de disco, bucket y prefijo en la referencia de la CLI.

### Con la API de Server {#with-the-server-api}

`PUT /api/namespaces/{namespace}/external-storage` es una operación administrativa de política. Los clientes SDK normales descubren el transporte resultante mediante `GET /api/cluster/info`; no copian su configuración del proveedor a los workers.

## Verificar la política {#verifying-the-policy}

Prueba un valor superior al umbral con el driver configurado y los procesos que reproducirán la ejecución. Verifica la longitud exacta de los bytes codificados y SHA-256 después de recuperarlos. Para Server, `dw storage:test --namespace=billing --json` comprueba la ruta configurada. Un diagnóstico de almacenamiento no demuestra la ejecución de workflows en cada SDK, la restauración de copias ni todos los adaptadores de proveedores.

## Elegir un umbral {#picking-a-threshold}

Deja margen respecto a los límites normales de solicitudes y cargas. El umbral se aplica a **bytes codificados**, no al tamaño del archivo original ni del JSON de negocio. Un umbral muy bajo añade solicitudes de almacenamiento y referencias retenidas para valores pequeños. El transporte del runtime también puede externalizar valores adicionales para que una solicitud HTTP completa quepa en su límite. En modo servicio usa los límites descubiertos de Server, no el umbral embebido como límite del protocolo.

## Reproducción, retención y limpieza {#replay-retention-and-cleanup}

- **Integridad de la reproducción.** Un valor solo se decodifica después de recuperar y verificar sus bytes. Conserva los objetos que aún necesite cualquier ejecución retenida.
- **Caché de lecturas verificadas.** `ExternalPayloadStorage` limita su caché de bytes verificados. Vaciarla no elimina el objeto ni cambia su propietario.
- **Retención.** La limpieza del runtime tiene en cuenta propietarios retenidos y objetos compartidos. Los fallos de almacenamiento, retenciones por copia de seguridad o referencias restantes pueden retrasar el borrado. Ejecutar la retención no garantiza que no queden objetos huérfanos.
- **Exportación del historial.** Una exportación puede conservar metadatos de referencias sin obtener el objeto. Su suma de comprobación o `history_complete` no demuestra que existan los bytes externos ni que se pueda reproducir el archivo. Respeta el [límite de copia y restauración](../configuration/pruning-workflows.md#export-before-pruning) y verifica los objetos por separado. Los archivos autosuficientes siguen abiertos en [Server #520](https://github.com/durable-workflow/server/issues/520).

## Uso desde código {#using-it-from-code}

PHP embebido usa `Workflow\V2\Support\ExternalPayloadStorage` con un `ExternalPayloadStorageDriver`. `LocalFilesystemExternalPayloadStorage` gestiona raíces locales. Los adaptadores del proveedor controlan su configuración de acceso y reglas URI. Normalmente la aplicación deja que el runtime aplique la política del espacio de nombres en lugar de construir sobres almacenados manualmente.

En modo servicio, los clientes y workers de los SDK PHP, Python y Rust suben y recuperan cargas automáticamente cuando Server anuncia un transporte disponible. No envíes un sobre `external_storage` de proveedor a Server ni borres objetos gestionados por Server mediante un helper directo. Consulta el [contrato de subida y descarga](../polyglot/server-api-reference.md#runtime-external-payload-transport) y el [ámbito de los helpers Python](../polyglot/python.md#external-payload-storage).

## Véase también {#see-also}

- [Pasar datos](../defining-workflows/passing-data.md)
- [Límites estructurales: tamaño de carga](../constraints/structural-limits.md#payload-size)
- [API de Server: transporte de cargas externas](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [SDK Python: almacenamiento externo de cargas](../polyglot/python.md#external-payload-storage)
