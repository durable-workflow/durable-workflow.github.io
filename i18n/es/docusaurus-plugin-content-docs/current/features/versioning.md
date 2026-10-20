---
sidebar_position: 15
---

# Versionado {#versioning}

## Replay antes de cambiar builds {#replay-before-changing-builds}

Antes de promover un candidato, reproduzca historiales representativos abiertos y cerrados recientemente con su código exacto. Antes de revertir, reproduzca los historiales escritos por el build nuevo con el artefacto antiguo. Siga la [comprobación de replay](../testing.md#replay-before-deployment); una cohorte de enrutamiento compatible o una comprobación de integridad satisfactoria no demuestra, por sí sola, compatibilidad de replay.

Los workflows pueden durar meses o años, por lo que es habitual cambiar su definición mientras hay ejecuciones en curso. Sin versionado, modificar código que afecte a la ruta de ejecución produciría errores de no determinismo al reproducir.

`getVersion()` permite introducir cambios con seguridad mediante puntos de bifurcación versionados.

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
