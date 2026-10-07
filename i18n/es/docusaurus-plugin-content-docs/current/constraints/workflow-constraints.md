---
sidebar_position: 2
---

# Restricciones de los workflows {#workflow-constraints}

Para ser determinista, una clase de workflow no puede depender de estados
externos o servicios que cambien con el tiempo. Su código no debe consultar
directamente la fecha y hora actuales, el usuario de la sesión, recursos de
red externos ni otras fuentes de estado variable.

Ten en cuenta estas reglas al escribir un workflow:

- No uses `Carbon::now()` para consultar la fecha y hora actuales. El resultado
  cambia entre llamadas. Usa `Workflow\V2\Workflow::now()` o el helper
  `Workflow\V2\now()`, que devuelven una hora del workflow segura para la
  reproducción del historial.
- No uses `Auth::user()` para obtener el usuario actual. El resultado depende
  de la sesión. Pasa el usuario como entrada al iniciar el workflow.
- No hagas peticiones de red a recursos externos. Pueden responder lentamente
  o dejar de estar disponibles. Pasa los datos necesarios como entradas al
  iniciar el workflow o usa una actividad para obtenerlos.
- No generes valores aleatorios directamente en el workflow. Si necesitas
  hacerlo durante la ejecución, usa un side effect para registrar el resultado.
  También puedes pasar el valor aleatorio como entrada al iniciar el workflow.

## Comprobaciones al iniciar la aplicación {#boot-time-guardrails}

Cuando registras clases de workflow en `workflows.v2.types.workflows`, el paquete
las analiza al iniciar la aplicación para detectar llamadas claramente
incompatibles con la reproducción, como `Carbon::now()`, `Auth::user()`, `DB::`,
`Http::` o `random_int()`. La opción `workflows.v2.guardrails.boot` determina
cómo se comunican los hallazgos:

| Modo | Comportamiento |
|------|----------------|
| `warn` (predeterminado) | Registra una advertencia por cada hallazgo. La aplicación puede iniciarse. |
| `silent` | Omite por completo el análisis al iniciar la aplicación. |
| `throw` | Lanza una `LogicException` ante el primer hallazgo. Es útil en CI. |

```php
// config/workflows.php
'v2' => [
    'guardrails' => [
        'boot' => env('DW_V2_GUARDRAILS_BOOT', 'warn'),
    ],
],
```

Configura `DW_V2_GUARDRAILS_BOOT=throw` en CI para que la compilación falle si
se añaden llamadas incompatibles con la reproducción. Mantén `warn` en
producción para que un hallazgo previo no impida un despliegue.

En la primera versión, el análisis al iniciar la aplicación es la única
comprobación del modo workflow que puede bloquear el inicio. El runtime no
repite el diagnóstico de determinismo al reclamar una tarea de workflow. Esta
decisión es deliberada en 2.0: el análisis detecta problemas en los workflows
PHP registrados localmente antes del despliegue. Waterline muestra los cambios
en la huella de la definición de ejecuciones largas sin convertir la entrega
de tareas entre versiones del código en una nueva causa de fallos de despliegue.

Las ejecuciones anteriores al registro de huellas de definición también siguen
una política conservadora. Si una ejecución llega a una nueva rama de
`getVersion()` y su evento `WorkflowStarted` es anterior a la captura de la
huella, el runtime mantiene esa ejecución en `WorkflowStub::DEFAULT_VERSION`.
Consulta [Versionado](../features/versioning.md).
