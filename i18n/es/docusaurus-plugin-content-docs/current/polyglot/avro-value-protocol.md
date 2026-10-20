---
title: Protocolo Avro Value
sidebar_label: Protocolo Avro Value
---

# Protocolo Avro Value {#avro-value-protocol}

Durable Workflow 2.0 utiliza un único esquema recursivo fijo
[`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc)
para todas las cargas útiles Avro. Las entradas y los resultados de los workflows,
los valores de las actividades y los detalles de los fallos, las señales, las
consultas, las actualizaciones, el historial de reproducción y las cargas útiles
almacenadas externamente utilizan el mismo esquema. Las aplicaciones no publican
sus propios esquemas Avro y la plataforma no necesita un registro de esquemas en red.

La unión de valores tiene ramas con nombres distintos para nulo, booleano,
entero de 64 bits con signo, double finito, bytes, cadena UTF-8, lista y mapa con
claves de cadena. Así se distingue `7` de `7.0`, el texto de los bytes y las
listas de los mapas en PHP, Python y Rust.

## Trama de transmisión {#wire-frame}

El campo `blob` contiene los bytes estándar del formato de objeto único de Avro en base64:

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

El esquema v1 tiene la huella `e2a33dff55802237`. Los SDK incluyen el esquema
inmutable de cada huella admitida, seleccionan el esquema del escritor a partir
de la trama y lo resuelven frente al lector actual. Una huella desconocida o una
nueva rama incompatible produce `unsupported_payload_schema`; los decodificadores
no hacen suposiciones ni recurren a JSON.

Los futuros tipos de valor serán nuevas ramas de registro con nombres únicos
añadidas al final de la unión. Las ramas publicadas nunca se reordenan ni reutilizan.

## Política de valores {#value-policy}

- Las claves de los mapas deben ser cadenas. Los SDK rechazan otras claves en
  lugar de convertirlas en cadenas.
- Los enteros deben caber en el intervalo del tipo Avro `long` de 64 bits con signo.
- Los doubles deben ser finitos; se rechazan NaN y los infinitos.
- `bytes` de Python y `AvroValue::Bytes` de Rust seleccionan `bytes` de Avro. En
  PHP se utiliza `AvroBinaryValue::fromBytes()` porque una cadena PHP por sí sola
  no puede indicar si contiene texto o datos binarios.
- Los decimales, enteros de precisión arbitraria, fechas y horas, UUID, enum,
  dataclass, Pydantic y objetos del dominio requieren adaptadores explícitos a
  un tipo de valor canónico.

Avro es el único códec de cargas útiles de Durable Workflow 2.0. Los documentos
de solicitud y respuesta HTTP siguen usando JSON como transporte, pero cada
valor duradero que contienen utiliza este esquema fijo y la trama de objeto
único. Una etiqueta de códec `json`, un códec desconocido o un blob duradero sin
etiquetar se rechazan con `unsupported_payload_codec`; los runtimes nunca
transcodifican ni hacen suposiciones.

## Proyección JSON para inspección {#json-inspection-projection}

Las descripciones de ejecución conservan `input_envelope`, `output_envelope` y
los sobres de resultados como representación autoritativa sin pérdida de las
cargas útiles. Las interfaces de inspección JSON, como la CLI y Waterline,
muestran los valores que JSON no puede representar mediante una proyección tipada:

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

La proyección de mapa se utiliza para mapas vacíos y claves de cadena con aspecto
numérico que los arrays de PHP no pueden conservar sin cambiar su tipo. Los
escalares, las listas y los mapas con claves de cadena inequívocas siguen siendo
valores JSON normales. Los consumidores que necesiten el valor tipado original
decodifican el sobre adjunto en lugar de la proyección de visualización.

## Prueba de rendimiento reproducible {#repeatable-benchmark}

Cada SDK incluye la misma prueba de rendimiento con valores representativos y
exige un presupuesto para la ruta de producción seleccionada:

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

La salida JSON compara JSON compacto, el envoltorio JSON dentro de Avro retirado
y el esquema tipado fijo. Informa del tamaño del dato sin trama, de la carga útil
con trama y del sobre HTTP real `{codec, blob}`, junto con la latencia completa
de adaptación, codificación y decodificación. `AVRO_VALUE_ENCODE_BUDGET_US` y
`AVRO_VALUE_DECODE_BUDGET_US` permiten reducir los presupuestos predeterminados
en un ejecutor de cualificación. La CI de publicación ejecuta estos comandos
exigiendo los presupuestos; cualquier regresión de la ruta de producción debe
explicarse o corregirse antes de publicar. La implementación del envoltorio
antiguo solo existe en la prueba, no como ruta de compatibilidad del runtime.

## Comprobación previa al despliegue {#deployment-preflight}

El arranque de Server inventaría todos los `payload_codec` persistidos y verifica
los bytes de identificación del formato de objeto único y la huella del esquema
fijo en las tramas en línea, los sobres de historial anidados y las referencias
a cargas útiles externas. El despliegue se detiene antes de iniciar el nuevo
runtime si existe alguna carga útil activa o relevante para la reproducción
que no sea Avro, una carga sin etiqueta, una referencia corrupta o una trama
obsoleta. Las ejecuciones activas pueden finalizar en la versión preliminar
actual; el estado terminal retenido y el relevante para reproducción deben
seguir la [migración del historial de versiones preliminares](/docs/polyglot/prerelease-history-migration),
que comienza con una copia de seguridad. Exportar una ejecución no modifica el
estado rechazado de la base de datos. Nunca borres historial para eludir la comprobación.
