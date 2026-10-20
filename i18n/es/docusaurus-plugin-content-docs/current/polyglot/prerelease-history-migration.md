---
title: Migrar el historial retenido de versiones preliminares
sidebar_label: Migración del historial preliminar
---

# Migrar el historial retenido de versiones preliminares {#migrate-retained-prerelease-history}

Utiliza este procedimiento sin conexión cuando un despliegue de Durable
Workflow 2.0 que solo admite Avro informe de `unsupported_payload_codec` para
estado retenido de una versión preliminar pública anterior de 2.0. Convierte
las representaciones conocidas etiquetadas como JSON, sin etiqueta y Avro Value
obsoletas sin exponer ningún códec heredado a una aplicación v2 en ejecución.

No sustituyas este procedimiento por una exportación de historial. Exportar
genera una copia portátil de una ejecución, pero no modifica las filas de base
de datos que se inspeccionan al arrancar el despliegue. Nunca borres historial
para superar la comprobación previa.

## Decidir qué convertir {#decide-what-must-be-converted}

Las ejecuciones activas pueden terminar en la versión preliminar desplegada.
Déjalas finalizar antes de la ventana de mantenimiento cuando sea seguro.
Debes convertir las ejecuciones terminales, las cerradas retenidas para
reproducción y el estado que no pueda finalizar. La migración inventaría ambos
grupos y no elimina ninguno.

La simulación cubre las interfaces del protocolo comprobadas al arrancar Server:

- entradas y salidas de workflows, cargas útiles de actividades, comandos,
  señales, actualizaciones, llamadas a servicios, tareas de validación de
  actualizaciones y referencias a flujos duraderos;
- tramas de objeto único en línea y sobres explícitos de cargas útiles anidados
  en eventos de historial; y
- referencias a cargas útiles externas, incluida su estructura, códec,
  disponibilidad del objeto, longitud en bytes e integridad SHA-256.

Los mapas de memo, atributos de búsqueda, contexto y diagnóstico del cliente
no son declaraciones de códec y permanecen intactos. Los códecs y huellas de
esquema desconocidos, las referencias corruptas y los valores que no pueda
representar el esquema fijo Avro Value se notifican como inseguros. Un hallazgo
inseguro bloquea la aplicación de cambios.

## Límite de responsabilidad {#ownership-boundary}

El comando pertenece al paquete PHP Workflow, pero debe ejecutarse en el proceso
que posea la conexión de base de datos y la configuración de cargas útiles externas:

- **Laravel integrado:** instala el paquete Workflow de destino en el checkout
  de la aplicación y ejecuta su comando `php artisan` con los procesos web,
  de cola, planificador y mantenimiento detenidos.
- **Server independiente:** utiliza un shell o trabajo de una sola ejecución de
  la imagen Server de destino, con la misma base de datos, configuración de
  espacios de nombres, credenciales y montajes de cargas externas del despliegue.
  Mantén detenidos el hook de arranque normal y todos los procesos de Server
  hasta completar la conversión.

No conectes un checkout de otra aplicación a la base de datos. La política de
almacenamiento del espacio de nombres forma parte de la comprobación de
integridad; si el proceso no puede leer un objeto externo, lo declara inseguro
en lugar de hacer suposiciones.

## Orden del despliegue {#deployment-order}

1. Conserva la versión preliminar anterior el tiempo suficiente para finalizar
   las ejecuciones activas elegidas. Después detén todos los escritores de la
   base de datos: nodos API, workers, planificadores y trabajos de arranque y mantenimiento.
2. Toma las instantáneas de base de datos y almacenamiento de objetos externos
   que exija tu política de recuperación. Conserva el artefacto anterior de la aplicación o Server.
3. Instala o descarga el artefacto de destino que contiene
   `workflow:v2:migrate-prerelease-history`, pero no lo inicies. Ejecuta desde
   ese artefacto el inventario en simulación:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history --dry-run --json
   ```

   Un código de salida cero indica que todos los valores afectados pueden
   convertirse con seguridad. Revisa las rutas y los ID de ejecución afectados.
   Un código distinto de cero con `unsafe_fields` mayor que cero bloquea la
   actualización; corrige el acceso al almacenamiento o conserva la versión anterior.
4. Elige una nueva ruta privada de copia de seguridad y un nuevo directorio
   privado de evidencias en almacenamiento persistente. Ninguno debe existir.
   Aplica una sola vez:

   ```bash
   php artisan workflow:v2:migrate-prerelease-history \
     --backup=/secure/dw-prerelease-history-backup.json \
     --evidence-dir=/secure/dw-prerelease-history-evidence
   ```

   El comando escribe la copia antes de actualizar y rechaza sobrescribir
   evidencias. Bloquea y actualiza filas en una transacción, conserva las
   identidades de workflows y ejecuciones, verifica hashes y tamaños de objetos
   externos y conserva todos los originales. Los objetos sustitutos son copias
   Avro direccionadas por contenido. No se elimina historial.
5. Espera a que termine. Exporta y reproduce estrictamente cada ejecución
   retenida afectada, reconstruye sus proyecciones de resumen, espera, cronología,
   temporizadores y linaje, comprueba sus desviaciones y repite el inventario de
   cargas útiles. El éxito exige las tres comprobaciones. Conserva los informes
   de reproducción y proyecciones junto a la copia de seguridad.
6. Ejecuta el arranque normal de destino solo después de una migración satisfactoria:

   ```bash
   php artisan server:bootstrap --force
   ```

   Para Laravel integrado, ejecuta el procedimiento normal de migración/arranque
   de la aplicación. La comprobación de cargas exclusivamente Avro debe pasar
   antes de iniciar nuevos workers, nodos API, planificadores o procesos de mantenimiento.
7. Inicia el despliegue de destino y verifica su preparación y una reproducción
   o consulta de ejecución retenida mediante la interfaz habitual del operador.
   Conserva el paquete de migración durante la ventana de reversión.

## Reversión {#rollback}

Si falla la aplicación de cambios, la reproducción, la verificación de proyecciones o la
comprobación posterior, la actualización queda bloqueada. Mantén detenidos todos
los escritores y ejecuta el comando de reversión que imprime la migración.
Con las rutas anteriores es:

```bash
php artisan workflow:v2:migrate-prerelease-history \
  --rollback-from=/secure/dw-prerelease-history-backup.json \
  --evidence-dir=/secure/dw-prerelease-history-evidence
```

La reversión verifica la huella de la copia y el estado de migración, rechaza
sobrescribir sus evidencias y no restaura filas modificadas tras la conversión.
Restaura atómicamente los valores originales de base de datos y conserva los
objetos externos sustitutos como evidencia. Después restaura el artefacto
anterior de la aplicación o Server. Si otro escritor modificó el estado y se
rechaza la reversión, mantén bloqueada la actualización y restaura la instantánea
coordinada de base de datos y objetos del paso 2.

Después de revertir, es normal que el despliegue exclusivamente Avro vuelva a
fallar en la comprobación previa. Resuelve el estado inseguro indicado, crea
nuevas rutas de copia y evidencia y repite todo el procedimiento antes de
reintentar la actualización.
