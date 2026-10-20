---
sidebar_position: 21
tags:
  - payloads
  - storage
  - history
keywords:
  - almacenamiento externo de cargas útiles
  - cargas útiles grandes
  - descarga de cargas útiles
  - almacenamiento S3
  - almacenamiento GCS
  - almacenamiento Azure Blob
---

# Almacenamiento externo de cargas útiles {#external-payload-storage}

El almacenamiento externo descarga las cargas grandes de workflow a un almacén de objetos intercambiable (S3, GCS, Azure Blob o sistema de archivos local) y sustituye los bytes en línea del historial por un sobre pequeño de referencia verificable. Úsalo si los argumentos o resultados de actividades e hijos, las señales o las actualizaciones son demasiado grandes para la fila de base de datos que respalda el historial.

El runtime conserva las cargas en línea mientras su tamaño codificado esté por debajo del umbral del espacio de nombres. Solo escribe las que lo alcancen o superen en el controlador configurado y registra un sobre `durable-workflow.v2.external-payload-reference.v1` en el historial. La reproducción y exportación se bloquean con error si falta una referencia, cambia su contenido o queda fuera del prefijo configurado. Nunca se sustituye silenciosamente un blob ausente por un valor vacío.

## Cuándo usarlo {#when-to-use-it}

Prefiérelo siempre que la aplicación necesite legítimamente pasar por el workflow más de unos cientos de kilobytes:

- Procesamiento de documentos y medios que pasa PDF, imágenes o audio entre actividades.
- Informes, exportaciones o archivos cuyo resultado final sea un artefacto serializado grande.
- Cargas de flujos de mensajes producidas por sistemas externos sin URL de objeto estable que el workflow pueda referenciar.
- Cualquier carga que de otro modo supere el [límite estructural `payload_size_bytes`](../constraints/structural-limits.md#payload-size).

Las cargas pequeñas (campos del plano de control, ids, indicadores y JSON habitual) siguen en línea sin coste adicional. La política depende del umbral: habilitarla no mueve las cargas pequeñas.

## Cómo funciona la descarga {#how-offload-works}

Cada espacio tiene una política independiente. Al codificar una carga para almacenamiento duradero, el runtime compara su longitud en bytes con `threshold_bytes`:

- Por debajo del umbral: se guarda en línea como hasta ahora. El historial no cambia.
- En el umbral o por encima: el runtime entrega los bytes codificados al controlador, recibe una URI propiedad de este y registra una referencia. Contiene URI, hash SHA-256, longitud exacta, códec y una sugerencia opcional `expires_at`.

Al reproducir, los workers recuperan los bytes por el mismo controlador y verifican tamaño y SHA-256 antes de entregarlos al decodificador. Una diferencia lanza `ExternalPayloadIntegrityException` (PHP) o `ExternalPayloadIntegrityError` (Python) y aparece como fallo de reproducción, nunca como carga vacía silenciosa.

El sobre es un formato de transmisión estable e idéntico para un productor PHP, un worker del SDK Python o una llamada HTTP directa. Consulta todos los campos en [Sobre de referencia externa de carga útil](../polyglot/server-api-reference.md#external-payload-reference-envelope).

## Límite de confianza de la decodificación {#decode-trust-boundary}

El almacenamiento y la decodificación tienen límites de confianza separados. Un almacén puede contener bytes codificados o referencias; un servidor de códecs, decodificador personalizado, worker o herramienta de exportación que los decodifique puede ver cargas de aplicación en texto plano.

Trata el servidor de códecs como un límite de confianza gestionado por el cliente: decide dónde ejecutarlo, qué redes llegan a él, a qué claves accede, qué auditoría emite y cómo se ocultan datos de las vistas previas antes de mostrarlas al operador. Durable Workflow registra nombres de códecs, URI, hashes, tamaños, huellas de esquema y vistas previas acotadas. Esos datos no equivalen a cifrado de extremo a extremo.

## Opciones de controlador {#driver-choices}

| Controlador | Esquema URI | Uso habitual |
| --- | --- | --- |
| `local` | `file://` | Desarrollo local, CI y despliegues de un nodo donde servidor y workers comparten archivos. No es adecuado si están en hosts distintos. |
| `s3` | `s3://` | Amazon S3 y almacenes compatibles (MinIO, Cloudflare R2, etc.) mediante un disco del sistema de archivos del servidor. |
| `gcs` | `gs://` | Google Cloud Storage mediante un disco del sistema de archivos del servidor. |
| `azure` | `azure://` | Azure Blob Storage mediante un disco del sistema de archivos del servidor. |

Los controladores configuran las credenciales reales del bucket o contenedor mediante un disco con nombre del servidor. Los secretos permanecen en su configuración, no en la política del espacio.

## Configurar un espacio de nombres {#configuring-a-namespace}

Configura la política con la [CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) o la [API HTTP del servidor](../polyglot/server-api-reference.md#namespace-and-storage). Ambas escriben el mismo sobre `external_payload_storage` en el registro del espacio.

### Con la CLI {#with-the-cli}

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### Con la API del servidor {#with-the-server-api}

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

La descripción de `GET /api/namespaces/{name}` o `dw namespace:describe` contiene el sobre resuelto para que operadores y automatizaciones verifiquen la política activa sin volver a escribirla.

## Verificar la política {#verifying-the-policy}

Antes de admitir tráfico, usa el diagnóstico de ida y vuelta para demostrar que la política puede escribir y leer bytes con las credenciales del espacio:

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

El diagnóstico escribe una carga pequeña en línea y otra que supera el umbral, recupera ambas, verifica tamaño y SHA-256 y devuelve objetos de resultado `small_payload` y `large_payload` legibles por máquinas. El éxito de la carga grande demuestra que el controlador produce un sobre válido `durable-workflow.v2.external-payload-reference.v1` de extremo a extremo. Un fallo indica un problema de política de almacenamiento: no habilites tráfico en un espacio cuya prueba de ida y vuelta falle.

## Elegir un umbral {#picking-a-threshold}

Por defecto, las cargas se mantienen en línea salvo que alcancen `threshold_bytes`. Puntos de partida:

- Ajusta el umbral donde empiecen a generar presión operativa, normalmente entre 256 KiB y 2 MiB de bytes codificados.
- Deja margen bajo el [límite estructural `payload_size_bytes`](../constraints/structural-limits.md#payload-size) del espacio para que la comprobación recaiga sobre el sobre de referencia, no sobre los bytes originales.
- Fija un solo umbral por espacio. Elígelo según la actividad o workflow con más bytes por ejecución, no según la carga mediana.

Un umbral muy bajo no aporta ventajas: las cargas pequeñas viajan más rápido por la base de datos que por almacenamiento externo, y el propio sobre también ocupa un pequeño espacio de historial.

## Reproducción, retención y limpieza {#replay-retention-and-cleanup}

- **Integridad de reproducción.** Cada recuperación verifica el objeto con `size_bytes` y `sha256`. Un blob modificado o ausente produce una excepción de integridad, sin sustituir silenciosamente el valor.
- **Caché de recuperaciones verificadas.** Los workers guardan bytes verificados por `(uri, sha256, size, codec)` con límites de entradas y bytes. Las lecturas repetidas de una ejecución evitan recuperaciones redundantes sin debilitar la primera verificación.
- **Retención.** Al eliminar una ejecución, la pasada de retención del servidor también elimina los objetos externos referenciados por su historial. No se acumulan huérfanos mientras funcione la retención.
- **Exportación.** Conserva el sobre de referencia. Los consumidores que necesiten los bytes deben recuperarlos con el mismo controlador y verificarlos antes de decodificar; la exportación no los incluye en línea.

## Usarlo desde código {#using-it-from-code}

La mayoría de aplicaciones nunca llama directamente a la API: el runtime descarga según la política y el SDK decodifica las referencias al reproducir. Para crear o consumir sobres fuera del runtime, por ejemplo en un puente independiente del lenguaje o una prueba que sintetice una carga grande, usa los helpers del SDK.

- **PHP (paquete workflow).** `Workflow\V2\Support\ExternalPayloadStorage` guarda y recupera bytes con cualquier controlador que implemente `Workflow\V2\Contracts\ExternalPayloadStorageDriver`. `LocalFilesystemExternalPayloadStorage` gestiona URI `file://`; el servidor independiente incluye un controlador de discos que respalda `s3`, `gcs` y `azure` mediante un disco Laravel con nombre.
- **SDK Python.** Consulta [Almacenamiento externo de cargas útiles](../polyglot/python.md#external-payload-storage) para `ExternalPayloadReference`, `ExternalPayloadCache`, `store_external_payload()`, `fetch_external_payload()` y adaptadores `LocalFilesystemExternalStorage`, `S3ExternalStorage`, `GCSExternalStorage` y `AzureBlobExternalStorage`. Los clientes de SDK de proveedores siguen siendo propiedad de la aplicación; el SDK no añade boto3, google-cloud-storage ni azure-storage-blob como dependencias de runtime.
- **HTTP directo.** Las llamadas que codifiquen cargas manualmente pueden guardar bytes mediante el controlador y enviar el sobre como campo de carga útil. El sobre del protocolo de workers (`{codec, blob}`) sigue transportando referencias para argumentos y resultados de actividades, señales y actualizaciones.

## Véase también {#see-also}

- [Pasar datos](../defining-workflows/passing-data.md): contrato predeterminado de cargas en línea.
- [Límites estructurales: tamaño de carga útil](../constraints/structural-limits.md#payload-size): límite impuesto por el motor que permite respetar el almacenamiento externo.
- [Referencia de la API: espacios de nombres y almacenamiento](../polyglot/server-api-reference.md#namespace-and-storage): contrato HTTP completo y campos del sobre.
- [Referencia de la CLI: comandos de espacios de nombres y atributos de búsqueda](../polyglot/cli-reference.md#namespace-and-search-attribute-commands): uso de `dw namespace:set-storage-driver` y `dw storage:test`.
- [SDK Python: almacenamiento externo de cargas útiles](../polyglot/python.md#external-payload-storage): controladores, helpers y caché de reproducción en Python.
