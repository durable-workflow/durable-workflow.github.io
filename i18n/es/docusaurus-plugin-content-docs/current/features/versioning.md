---
sidebar_position: 15
---

# Versionado {#versioning}

## Replay antes de cambiar builds {#replay-before-changing-builds}

Antes de promover un candidato, reproduzca historiales representativos abiertos y cerrados recientemente con su código exacto. Antes de revertir, reproduzca los historiales escritos por el build nuevo con el artefacto antiguo. Siga la [comprobación de replay](../testing.md#replay-before-deployment); una cohorte de enrutamiento compatible o una comprobación de integridad satisfactoria no demuestra, por sí sola, compatibilidad de replay.

Los workflows pueden durar meses o años, por lo que es habitual cambiar su definición mientras hay ejecuciones en curso. Sin versionado, modificar código que afecte a la ruta de ejecución produciría errores de no determinismo al reproducir.

`getVersion()` permite introducir cambios con seguridad mediante puntos de bifurcación versionados.

## Evolucionar los argumentos de entrada registrados {#evolving-recorded-entry-arguments}

Una ejecución conserva los argumentos registrados al iniciarse. Desplegar una definición nueva no reescribe esa entrada. Durante la reproducción, el runtime vincula esos valores con el método de entrada actual **antes de ejecutar cualquier código de su cuerpo**. Una rama `getVersion()` o `patched()` dentro del cuerpo no puede salvar una firma incompatible: primero hay que poder entrar en el método.

Mantén los argumentos posicionales existentes en el mismo orden y acepta sus tipos registrados. Un valor predeterminado de PHP completa un argumento omitido; no sustituye un valor incompatible ya registrado en esa posición. Por ejemplo, una ejecución iniciada con `[7]` sigue proporcionando el entero `7` después del despliegue:

| Cambio de entrada | Efecto sobre la entrada registrada `[7]` |
| --- | --- |
| `handle(int $amount)` → `handle(int $amount, string $currency = 'USD')` | El argumento antiguo sigue siendo válido; el nuevo argumento final puede usar su valor predeterminado. Conserva también la compatibilidad de los comandos reproducidos. |
| Añadir un argumento final obligatorio sin valor predeterminado | La ejecución antigua no tiene ningún valor para él. |
| Insertar, eliminar o reordenar argumentos iniciales | Los valores existentes pueden acabar en el parámetro equivocado. No supongas que nombres de parámetros coincidentes corrigen la entrada posicional. |
| Cambiar `int $amount` por `string $amount` | El entero registrado no se ha convertido en una cadena. |
| Cambiar `int $amount` por `PaymentRequest $request` | La inyección de dependencias no migra la entrada. Un DTO recién construido no debe sustituir el importe registrado por valores predeterminados del constructor. |
| Eliminar únicamente un parámetro final | PHP puede aceptar la llamada, pero comprueba que eliminar su significado no cambia los comandos reproducidos ni el comportamiento de negocio. |

Prefiere añadir un parámetro final opcional o crear otro tipo de workflow para un contrato de entrada diferente. Si necesitas un DTO nuevo internamente, constrúyelo explícitamente a partir de argumentos registrados compatibles **dentro** del cuerpo del workflow y versiona allí cualquier cambio en los comandos duraderos. Conserva código capaz de reproducir cada forma de entrada admitida mientras esas ejecuciones lo necesiten. Prueba las entradas realmente almacenadas con la nueva definición, incluida una reproducción en frío tras una espera duradera; probar solo inicios nuevos no cubre este límite del despliegue.

### Comportamiento de Workflow 2.7.2 {#released-embedded-entry-behavior}

En Workflow **2.7.2**, un error en la cantidad o el tipo de los argumentos de entrada puede convertirse en un evento terminal `WorkflowFailed`. Algunos errores al resolver dependencias dejan, en cambio, la ejecución abierta con una tarea que falla repetidamente. Cambiar un escalar por un DTO inyectado cuyo constructor tiene valores predeterminados puede incluso ejecutar el workflow con datos incorrectos. Son defectos del producto registrados en [Workflow #866](https://github.com/durable-workflow/workflow/issues/866), no una estrategia segura de versionado.

Restaurar código compatible puede recuperar una ejecución abierta que pueda volver a entregarse, pero no reabre una que ya sea terminal. Ni `repair()` ni una nueva rama de versión prometen revivir ese original fallido. Inspecciona primero su estado y su fallo reales; conserva su entrada y su historial mientras decides cómo recuperarlo.

### Protección embebida publicada {#embedded-entry-argument-safeguard}

Workflow **2.7.3** valida los argumentos registrados antes de entrar en el código de la aplicación. Una vinculación incompatible produce una `WorkflowEntryArgumentsMismatchException` tipada y una **tarea de workflow** con reproducción bloqueada, con `replay_blocked_reason = workflow_entry_arguments_mismatch`; la **ejecución sigue sin ser terminal**. Los campos de diagnóstico identifican workflow, método de entrada, parámetro y tipos esperado y real sin copiar valores de los argumentos. También se rechaza un DTO nuevo inyectado que descartaría la entrada registrada. Comprueba el paquete Workflow realmente instalado en la aplicación embebida. Esta protección no reabre ejecuciones terminales creadas por una versión anterior.

Con esta protección publicada, recupera el mismo original aún abierto así:

1. Inspecciona el diagnóstico de la tarea de la ejecución seleccionada y confirma `workflow_entry_arguments_mismatch`, sin suponer que todo fallo de tarea tiene esa causa.
2. Restaura una definición que acepte los argumentos originales registrados o despliega un adaptador compatible en el cuerpo del workflow. Conserva la identidad, la entrada, el historial y los plazos originales; no edites el almacenamiento para que encaje la firma nueva.
3. Usa la acción de reparación admitida para esa misma ejecución aún abierta cuando haya código compatible; después verifica que se reanuda su trabajo original y se registra una sola vez su resultado terminal. La reparación no amplía el plazo original: si ya venció, sigue siendo aplicable.

La protección **no** reinterpreta las excepciones lanzadas por el cuerpo del workflow como incompatibilidades de despliegue. Un `TypeError` real de la aplicación u otro fallo no capturado del cuerpo sigue el comportamiento normal de fallo del workflow. Tampoco proporciona la comprobación global para retirar ramas heredadas registrada en [shared #220](https://github.com/durable-workflow/.github/issues/220).

### Los SDK en modo servicio tienen límites distintos {#service-sdk-entry-boundaries}

Una corrección del Core integrado no cambia el proceso del SDK que ejecuta los workflows en modo servicio. Los SDK publicados anteriores que se muestran a continuación preceden a la protección de entrada de servicio registrada en [la incidencia compartida #221](https://github.com/durable-workflow/.github/issues/221):

| SDK publicado | Comportamiento al vincular la entrada |
| --- | --- |
| [PHP 2.5.3](https://github.com/durable-workflow/sdk-php/tree/43d39bff50ccace0a309de41306cd350751ec575) | Llama al manejador registrado con el contexto seguido de la entrada posicional registrada. Un `ArgumentCountError` o `TypeError` de entrada puede seguir la ruta genérica de fallo del workflow. |
| [Python 2.6.1](https://github.com/durable-workflow/sdk-python/tree/150c6f6bc14e3516f75cc615b2f75f093ed84ea1) | Llama a `run(ctx, *start_input)`. Cambiar la cantidad de argumentos puede hacer fallar el workflow; las anotaciones de tipos por sí solas no imponen tipos ni convierten los valores registrados. Los errores del cuerpo del generador también son fallos de la aplicación. |
| [Rust 3.5.5](https://github.com/durable-workflow/sdk-rust/tree/4d5047ba9da39785512340b0975ce28da09f0cee) | El adaptador tipado deserializa la entrada antes de llamar al manejador de firma fija. Cambiar el tipo de solicitud puede hacer fallar esa decodificación. Difiere de la vinculación posicional de PHP/Python; un rechazo incidental por historial no consumido no garantiza una protección recuperable de firmas. |

Mantén separadas la compatibilidad de entrada en modo servicio y la cualificación real del SDK respecto a la versión embebida publicada. No captures todos los `TypeError` ni todos los errores de handlers Rust para etiquetarlos como seguros para reproducción: ocultaría fallos reales de la aplicación.

### Protección de entrada de los SDK de servicio {#service-sdk-entry-safeguard}

**Preparación de versiones sin publicar.** Los cambios de Server 2.9.9, PHP SDK 2.5.4, Python SDK 2.6.2 y Rust SDK 3.5.6 están integrados en el código fuente, pero faltan la publicación y la validación de los artefactos instalados. Esta sección no acredita soporte en versiones publicadas.

Los SDK preparados validan la entrada registrada antes de ejecutar código del workflow de la aplicación. Una entrada incompatible comunica `workflow_entry_arguments_mismatch` como fallo de una **tarea** de workflow bloqueada para replay, sin emitir `fail_workflow` ni cerrar la **ejecución** de negocio. La entrada, la identidad del workflow y la ejecución, el historial confirmado, la asignación de build y los plazos originales no cambian. PHP valida los argumentos posicionales obligatorios y los tipos PHP declarados. Python comprueba la vinculación con la firma, la cantidad de argumentos y los valores predeterminados; las anotaciones no se convierten en comprobaciones de tipos en ejecución. Los adaptadores tipados de Rust validan la decodificación antes de llamar al manejador o a su fábrica de estado. Los manejadores Rust de bajo nivel siguen siendo responsables de procesar la entrada de la aplicación.

El campo específico de la tarea en Server, `failure_reason`, es `workflow_entry_arguments_mismatch`; `replay_blocked_reason` conserva el valor genérico `worker_reported_replay_failure`. Consulte `latest_workflow_task_failure.reason` en la respuesta de depuración de la ejecución seleccionada. No confunda estos campos con el diagnóstico del Core integrado descrito antes. Si el código de aplicación ya ha entrado correctamente y lanza un `TypeError`, devuelve un error desde un manejador Rust o falla de otro modo, se mantiene el comportamiento habitual de fallo de negocio.

Restaure código que acepte la entrada registrada original y siga el [procedimiento admitido de recuperación del mismo original](../failures-and-recovery.md#service-entry-recovery). No sustituya la entrada por valores predeterminados de un DTO, modifique el historial ni reinicie un plazo. Esta protección no reabre un original que un worker anterior ya haya dejado en estado terminal.

El enrutamiento seguro hacia una sustitución también requiere la [capacidad de validación de entrada del worker](../polyglot/worker-compatibility-routing.md#definition-fingerprint-evolution). Un fingerprint diferente no demuestra compatibilidad de replay ni justifica reescribir el fingerprint original de una ejecución. Versione los cambios de comandos durables dentro de un método de entrada compatible y valide el replay en frío antes de promover el build.

## Usar `getVersion` {#using-getversion}

`getVersion()` es un helper secuencial seguro para la reproducción. En la primera ejecución registra un marcador duradero por punto de cambio; las reproducciones posteriores reutilizan el valor confirmado sin recalcular la rama con el código actual. Las ejecuciones anteriores a la nueva bifurcación reciben conservadoramente `DEFAULT_VERSION`.

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version = getVersion(
            'my-change-id',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        if ($version === WorkflowStub::DEFAULT_VERSION) {
            activity(OldActivity::class);
        } else {
            activity(NewActivity::class);
        }
    }
}
```

## Funcionamiento {#how-it-works}

`getVersion()` acepta tres parámetros:

- **changeId**: identificador único del punto de cambio.
- **minSupported**: versión mínima que aún admite este código.
- **maxSupported**: versión máxima actual para ejecuciones nuevas.

Al encontrar `getVersion()`:

- **Las ejecuciones nuevas** añaden `VersionMarkerRecorded` con `change_id`, la `version` elegida y el intervalo compatible, y devuelven `maxSupported`.
- **Las reproducciones** devuelven la versión ya registrada en ese marcador.
- **Las ejecuciones aún sin marcador** recurren a `WorkflowStub::DEFAULT_VERSION` cuando el runtime determina que son anteriores a la definición actual. Primero compara el marcador de compatibilidad con el worker actual; después compara la instantánea duradera `workflow_definition_fingerprint` con la clase cargable actual. Si coinciden, la definición es la misma y se registra un marcador nuevo; si difieren, la ejecución es anterior al cambio y usa la alternativa. Las ejecuciones cuyo `WorkflowStarted` es anterior a la instantánea, sin huella registrada, reciben conservadoramente `DEFAULT_VERSION` porque no se puede demostrar que la definición no cambió. Es la política 2.0 fijada para esas ejecuciones: no se bloquea su reclamación solo por carecer de huella. La alternativa no añade un marcador sintético ni consume un paso.
- **Los métodos de consulta** reproducen el mismo marcador confirmado antes de invocar el método anotado y ven la misma rama que la tarea.
- **Waterline** muestra los marcadores con `version_change_id`, `version`, `version_min_supported` y `version_max_supported`. El detalle seleccionado también expone `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` y `workflow_definition_matches_current`, para identificar una definición antigua incluso antes de confirmar un marcador.

Así, los nuevos workflows usan la ruta reciente mientras los existentes conservan la original.

## Añadir una versión {#adding-a-new-version}

Supón un workflow que llama a `prePatchActivity`:

```php
use Workflow\V2\Workflow;
use function Workflow\V2\activity;

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $result = activity(PrePatchActivity::class);

        return $result;
    }
}
```

Para sustituirla por `postPatchActivity` sin romper ejecuciones en curso:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\{activity, getVersion};

final class MyWorkflow extends Workflow
{
    public function handle()
    {
        $version = getVersion(
            'activity-change',
            WorkflowStub::DEFAULT_VERSION,
            1
        );

        $result = $version === WorkflowStub::DEFAULT_VERSION
            ? activity(PrePatchActivity::class)
            : activity(PostPatchActivity::class);

        return $result;
    }
}
```

Al desplegar una nueva bifurcación `getVersion()`, sigue rotando `DW_V2_CURRENT_COMPATIBILITY` para esa tanda de compilación. El runtime usa principalmente `workflow_definition_fingerprint`, capturado al inicio, para distinguir entre una ejecución nueva sin marcador y otra antigua que debe conservar `DEFAULT_VERSION`. El marcador de compatibilidad sigue controlando el enrutamiento y se comprueba antes de la huella. Las ejecuciones anteriores a la instantánea permanecen conservadoramente en `DEFAULT_VERSION`, pues no se puede verificar que la definición siga igual.

## Añadir más versiones {#adding-more-versions}

Para otros cambios, incrementa `maxSupported`:

```php
$version = getVersion(
    'activity-change',
    WorkflowStub::DEFAULT_VERSION,
    2
);

$result = match($version) {
    WorkflowStub::DEFAULT_VERSION => activity(PrePatchActivity::class),
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

## Retirar versiones antiguas {#deprecating-old-versions}

Cuando terminen todos los workflows de una versión antigua, aumenta `minSupported` para dejar de admitirla y eliminar las rutas antiguas.

```php
// After all DEFAULT_VERSION workflows have completed:
$version = getVersion(
    'activity-change',
    1,  // No longer supporting DEFAULT_VERSION
    2
);

$result = match($version) {
    1 => activity(PostPatchActivity::class),
    2 => activity(AnotherPatchActivity::class),
};
```

Una reproducción con una versión menor que `minSupported` lanza `VersionNotSupportedException`. Incluye ejecuciones de compatibilidad antigua cuya alternativa segura siga siendo `WorkflowStub::DEFAULT_VERSION`.

Reutilizar después el mismo `changeId` para otra bifurcación se considera error de determinismo; no se acepta silenciosamente. Conserva un `changeId` estable por cambio lógico.

## Varios puntos de cambio {#multiple-change-points}

Puedes usar varias llamadas `getVersion()` para cambios independientes:

```php
use Workflow\V2\Workflow;
use Workflow\V2\WorkflowStub;
use function Workflow\V2\getVersion;

final class MyWorkflow extends Workflow
{
    public function handle(): void
    {
        $version1 = getVersion('change-1', WorkflowStub::DEFAULT_VERSION, 1);
        $version2 = getVersion('change-2', WorkflowStub::DEFAULT_VERSION, 1);

        // Each change point is tracked independently
    }
}
```

**Importante:** cada `changeId` debe ser único en el workflow. La versión elegida queda como historial tipado y se reproduce determinísticamente en tareas, consultas y detalles posteriores. Si Waterline no muestra `VersionMarkerRecorded` para un cambio en una ejecución antigua, la reproducción conservó la ruta heredada `DEFAULT_VERSION` sin rellenar un marcador nuevo en el historial existente. Los campos `workflow_definition_fingerprint`, `workflow_definition_current_fingerprint` y `workflow_definition_matches_current` indican si comenzó con una definición distinta de la cargable hoy.

## Abreviatura `patched()` {#patched-shorthand}

`patched($changeId)` abrevia con dos estados la pregunta «¿esta ejecución pasó por un cambio de código puntual?». Registra el mismo evento duradero `VersionMarkerRecorded` que `getVersion()` y devuelve booleano en lugar de entero.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, patched};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        if (patched('use-new-payment-activity')) {
            return activity(NewPaymentActivity::class);
        }

        return activity(LegacyPaymentActivity::class);
    }
}
```

Comportamiento:

- Las ejecuciones nuevas confirman el marcador, toman la rama nueva y devuelven `true`.
- Las anteriores a ese `changeId` conservan `DEFAULT_VERSION` mediante la misma alternativa de huella que `getVersion()` y devuelven `false`.
- Las reproducciones leen el marcador ya confirmado y devuelven lo mismo, haciendo duradera la decisión.

Equivale exactamente a `getVersion($changeId, DEFAULT_VERSION, 1) === 1`. Úsalo con dos ramas si no necesitas conservar la heredada para siempre; la forma booleana se lee más claramente que un `match` sobre `DEFAULT_VERSION` y `1`.

Si necesitas más ramas o prevés otra versión del mismo cambio, usa `getVersion()` con `maxSupported` explícito. Cambiar de `patched()` a `getVersion()` para el mismo `changeId` es un error de determinismo, porque el marcador existente se registró con `maxSupported = 1`.

## Eliminar la rama heredada con `deprecatePatch()` {#removing-the-legacy-branch-with-deprecatepatch}

Cuando terminen todas las ejecuciones heredadas de un cambio `patched()`, puedes borrar su rama. La forma compatible es sustituir la llamada por `deprecatePatch()`, no eliminarla.

```php
use Workflow\V2\Workflow;
use function Workflow\V2\{activity, deprecatePatch};

final class MyWorkflow extends Workflow
{
    public function handle(): string
    {
        deprecatePatch('use-new-payment-activity');

        return activity(NewPaymentActivity::class);
    }
}
```

`deprecatePatch()` mantiene el punto en la cronología para que el historial `VersionMarkerRecorded` confirmado siga correspondiendo a una llamada conocida. Devuelve `null` y toma incondicionalmente la ruta nueva. Al publicar esta versión:

- Las ejecuciones nuevas confirman un marcador `deprecate_patch`, toman la rama nueva y la llamada devuelve `null`.
- Las que ya confirmaron un marcador `patched` para ese `changeId` lo reproducen y pasan por la rama retirada, ahora única, sin errores.
- Se presupone que las que registraron `false` (ruta heredada) ya no están activas. Si queda alguna, leerá el marcador antiguo pero ejecutará la rama nueva. Por eso hay que esperar a que terminen antes de desplegar `deprecatePatch()`.

Ciclo de parche en dos fases y reglas de ubicación:

1. **Introduce `patched()`** en el punto de cambio conservando ambas ramas. Las ejecuciones nuevas toman la nueva; las antiguas conservan la heredada.
2. **Espera a que terminen todas las heredadas.** Usa la búsqueda de Waterline o `dw workflow:list` para comprobar que no queda ninguna abierta que pueda reproducir la rama antigua.
3. **Sustituye `patched()` por `deprecatePatch()`** en el mismo sitio, con el mismo `changeId`, y elimina la rama heredada. Conserva la llamada para que el historial siga correspondiendo a un cambio conocido.
4. **Opcionalmente, elimina `deprecatePatch()`** cuando también sepas que ninguna reproducción histórica (consultas, exportaciones o auditorías) leerá jamás historial con ese marcador. Es irreversible; la mayoría de workflows puede dejarlo indefinidamente sin coste de runtime.

Reglas de ubicación:

- Llama a `patched()` y `deprecatePatch()` desde el cuerpo del workflow, no desde actividades, manejadores de señales ni consultas. Son pasos del workflow y deben reproducirse determinísticamente.
- Cada `changeId` representa un cambio lógico. Reutilizarlo para otra rama es un error de determinismo.
- Puede adoptar la forma `patched()` o `deprecatePatch()` durante su vida, pero nunca ambas a la vez. El despliegue debe sustituir la llamada, sin coexistencia.
- `getVersion()` y `patched()` no pueden coexistir para el mismo `changeId`. Elige un modelo al introducirlo.
