---
title: Compatibilidad de bases de datos
---

# Compatibilidad y cualificación de bases de datos

Use esta tabla para elegir bases de datos de Laravel embebido y Server autogestionado. Cloud gestiona su persistencia de runtime. Sus clientes configuran clientes SDK y workers en lugar de una base de datos del runtime.

Una base de compatibilidad declarada no demuestra que todas las versiones posteriores estén cualificadas. Las pruebas de código y los artefactos publicados e instalados son evidencias distintas. Esta instantánea vincula el código de Workflow 2.20.3 y los recibos de Server 3.3.2. No cambia la compatibilidad ni establece un intervalo mínimo/máximo probado.

| Motor | Compatibilidad declarada | Cualificación de código observada | Cualificación del artefacto publicado |
| --- | --- | --- | --- |
| MySQL | Embebido: base 8.0. Server: base 8.0. | Core: 26.10.0 en los jobs originales con imagen flotante. Perfiles Server: 8.0.46 y 8.4.5. | La observación de Core está vinculada al código publicado. El smoke de publicación de Server 3.3.2 y el smoke Compose de índice exacto usan MySQL 8.0 fijado por digest para comprobaciones de arranque/salud, no cualificación completa de ejecución/capacidad/TLS. |
| PostgreSQL | Embebido: base 13. Server: base 13. | Core: 18.6. Perfiles Server: 16.15 y 17.11. | La observación de Core está vinculada al código publicado. El smoke de publicación de Server 3.3.2 arranca en frío la imagen de cada arquitectura sobre PostgreSQL 17 fijado por digest solo para disponibilidad e información del clúster, no cualificación completa de ejecución/capacidad/TLS. |
| MariaDB | Embebido: base 10.5. Server acepta `mariadb`; aquí no se establece una versión base. | Core: 10.5.29. Perfil Server: 10.11.19. | La observación de Core está vinculada al código publicado. No se encontró recibo de endpoint MariaDB vinculado al índice Server 3.3.2 en la evidencia de publicación inspeccionada. |
| SQLite | Las capacidades/pruebas embebidas incluyen SQLite. Server declara base 3.35. | Los jobs originales de código Core no imprimieron la versión de la biblioteca SQLite. | La aceptación de Core 2.20.3 instalado ejercitó SQLite sin establecer un intervalo de versiones. El smoke de publicación de Server 3.3.2 arranca en frío sobre SQLite, también sin un intervalo de versiones de la biblioteca. |
| SQL Server | Core embebido publicado anuncia `sqlsrv`, pero sigue sin cualificar. Aquí no se establece cualificación de Server. | No se recuperó job SQL Server de la matriz Core publicada. El guard propuesto del backend es trabajo de código separado. | No se recuperó cualificación publicada correspondiente. No infiera soporte del anuncio de capacidad embebida. |

## Cómo leer la evidencia {#reading-the-evidence}

El [inventario Core](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) vincula los digests originales y cuatro jobs MySQL, cuatro PostgreSQL y uno MariaDB en el código publicado. Sus doce celdas de actualización publicada cubren combinaciones Laravel/PHP, no doce endpoints de bases de datos. El [recibo de Core instalado normalmente](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) cubre por separado 67 casos de streams/replay/fakes con SQLite. Ni la versión PHP ni una imagen flotante proporcionan una versión de base de datos no impresa.

El [inventario Server](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) separa los ámbitos de jobs de código nativo y PHP anterior. Para Server 3.3.2, la [ejecución de publicación](https://github.com/durable-workflow/server/actions/runs/42591612884) arranca en frío las imágenes amd64 y arm64 sobre SQLite, PostgreSQL 17 y MySQL 8.0, comprueba `/api/ready` y la información del clúster autenticada, y detiene cada una con SIGTERM. El [smoke Compose de índice exacto](https://github.com/durable-workflow/server/actions/runs/42602031026) tiene cuatro celdas de arquitectura/perfil contra el índice `sha256:4aeceb42…`. Tanto `local` como `production` usan MySQL, con `mysql:8.0` fijado por digest. El [registro de entrega de 3.3.2](https://github.com/durable-workflow/server/issues/325#issuecomment-6739628227) acepta ambos. Estas ejecuciones arrancan bases de datos vacías. No actualizan una existente, no cualifican la capacidad de escritura ni verifican TLS, y sus logs no informan de una versión patch exacta del motor. El [recibo estable 3.0.5](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) anterior tenía la misma forma Compose con un `mysql:8.0` flotante. Los perfiles de código no cualifican otra imagen publicada.

## Ciclo del proveedor y motores distribuidos {#vendor-lifecycle-and-distributed-engines}

Para nuevos despliegues, prefiera líneas mantenidas del proveedor después de cualificar el par exacto runtime/base de datos. La [política PostgreSQL](https://www.postgresql.org/support/versioning/) marca 13 sin soporte y finaliza 14 el 12 de noviembre de 2026. El [aviso Oracle](https://www.mysql.com/support/eol-notice.html) sitúa MySQL 8.0 en Sustaining Support desde el 21 de abril de 2026. El ciclo del proveedor no establece ni elimina nuestra cualificación de artefactos.

TiDB, Vitess, PlanetScale y otros despliegues distribuidos compatibles con MySQL no están probados aquí. Compatibilidad de protocolo no demuestra aislamiento transaccional, bloqueos de fila, visibilidad commit/after-commit ni reintentos. Valide esa semántica con el runtime exacto antes de adoptarlo. La tabla no amplía el [marco operativo de una región](../operator-operating-envelope.md) a varias regiones.
