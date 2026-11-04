---
title: Compatibilidad de bases de datos
---

# Compatibilidad y cualificación de bases de datos

Use esta tabla para elegir bases de datos de Laravel embebido y Server autogestionado. Cloud gestiona su persistencia de runtime. Sus clientes configuran clientes SDK y workers en lugar de una base de datos del runtime.

Una base de compatibilidad declarada no demuestra que todas las versiones posteriores estén cualificadas. Las pruebas de código y los artefactos publicados e instalados son evidencias distintas. Esta instantánea vincula el código de Workflow 2.20.3 y los recibos de Server 3.0.5. No cambia la compatibilidad ni establece un intervalo mínimo/máximo probado.

| Motor | Compatibilidad declarada | Cualificación de código observada | Cualificación del artefacto publicado |
| --- | --- | --- | --- |
| MySQL | Embebido: base 8.0. Server: base 8.0. | Core: 26.10.0 en los jobs originales con imagen flotante. Perfiles Server: 8.0.46 y 8.4.5. | La observación de Core está vinculada al código publicado. Compose de Server 3.0.5 usa `mysql:8.0` para smoke de esquema/salud, no cualificación completa de ejecución/capacidad/TLS. |
| PostgreSQL | Embebido: base 13. Server: base 13. | Core: 18.6. Perfiles Server: 16.15 y 17.11. | La observación de Core está vinculada al código publicado. No se encontró recibo de endpoint PostgreSQL vinculado al índice Server 3.0.5 en el inventario inspeccionado. |
| MariaDB | Embebido: base 10.5. Server acepta `mariadb`; aquí no se establece una versión base. | Core: 10.5.29. Perfil Server: 10.11.19. | La observación de Core está vinculada al código publicado. No se encontró recibo de endpoint MariaDB vinculado al índice Server 3.0.5 en el inventario inspeccionado. |
| SQLite | Las capacidades/pruebas embebidas incluyen SQLite. Server declara base 3.35. | Los jobs originales de código Core no imprimieron la versión de la biblioteca SQLite. | La aceptación de Core 2.20.3 instalado ejercitó SQLite sin establecer un intervalo de versiones. El corpus del candidato congelado Server 3.1.0 es independiente del estable 3.0.5. |
| SQL Server | Core embebido publicado anuncia `sqlsrv`, pero sigue sin cualificar. Aquí no se establece cualificación de Server. | No se recuperó job SQL Server de la matriz Core publicada. El guard propuesto del backend es trabajo de código separado. | No se recuperó cualificación publicada correspondiente. No infiera soporte del anuncio de capacidad embebida. |

## Cómo leer la evidencia {#reading-the-evidence}

El [inventario Core](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) vincula los digests originales y cuatro jobs MySQL, cuatro PostgreSQL y uno MariaDB en el código publicado. Sus doce celdas de actualización publicada cubren combinaciones Laravel/PHP, no doce endpoints de bases de datos. El [recibo de Core instalado normalmente](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) cubre por separado 67 casos de streams/replay/fakes con SQLite. Ni la versión PHP ni una imagen flotante proporcionan una versión de base de datos no impresa.

El [inventario Server](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) separa los ámbitos de jobs de código nativo y PHP anterior. El [recibo estable 3.0.5](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) tiene cuatro celdas smoke Compose de arquitectura/perfil. Tanto `local` como `production` usan MySQL. Los logs inspeccionados no recuperan versión/digest exactos del acompañante, cualificación de escritura ni TLS verificado. Los perfiles de código y un candidato congelado no cualifican otra imagen publicada.

## Ciclo del proveedor y motores distribuidos {#vendor-lifecycle-and-distributed-engines}

Para nuevos despliegues, prefiera líneas mantenidas del proveedor después de cualificar el par exacto runtime/base de datos. La [política PostgreSQL](https://www.postgresql.org/support/versioning/) marca 13 sin soporte y finaliza 14 el 12 de noviembre de 2026. El [aviso Oracle](https://www.mysql.com/support/eol-notice.html) sitúa MySQL 8.0 en Sustaining Support desde el 21 de abril de 2026. El ciclo del proveedor no establece ni elimina nuestra cualificación de artefactos.

TiDB, Vitess, PlanetScale y otros despliegues distribuidos compatibles con MySQL no están probados aquí. Compatibilidad de protocolo no demuestra aislamiento transaccional, bloqueos de fila, visibilidad commit/after-commit ni reintentos. Valide esa semántica con el runtime exacto antes de adoptarlo. La tabla no amplía el [marco operativo de una región](../operator-operating-envelope.md) a varias regiones.
