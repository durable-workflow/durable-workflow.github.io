---
sidebar_position: 12
title: Máquinas de estado de negocio
description: Protocolo experimental de transiciones para estados de negocio compartidos, perfiles de política específicos de cada integración, máquinas hijas anidadas y compensación retenida en workflows integrados en Laravel.
---

# Máquinas de estado de negocio {#business-state-machines}

:::warning Experimental

La API `Workflow\V2\StateMachine`, así como la API de ámbitos de compensación retenidos y el inicio confirmado de hijos (`Workflow::startChild()`) que utiliza, son experimentales. Se distribuyen de forma experimental desde Workflow 2.29.0, no están cubiertas por las garantías de estabilidad del paquete y pueden cambiar en una versión menor. Son una superficie `experimental` según los [niveles de estabilidad](../compatibility.md#stability-levels).

Los ejemplos de esta página son ejemplos del código fuente del repositorio con proveedores sintéticos. No constituyen una cualificación con el paquete instalado ni con proveedores reales. Nada en esta página implica:

- la migración de una ejecución en curso a una nueva versión de definición, perfil, regla o manejador;
- máquinas hijas recursivas o compartidas;
- garantías para ningún proveedor real de pagos, transportista o almacén;
- que la funcionalidad de máquinas de estado de negocio esté completa o tenga una versión estable.

:::

Esta guía describe el protocolo opcional de transiciones de negocio para workflows integrados en Laravel que utilizan `Workflow\V2\Workflow`. Se construye a partir de primitivas existentes: actividades, workflows hijos, esperas duraderas, replay y la compensación de [Saga](sagas.md). Los workflows existentes y `Workflow\States\StateMachine` no cambian.

## Cuándo usarlo {#when-to-use-it}

Use el protocolo cuando los estados de negocio tengan un único significado compartido, pero la forma de alcanzarlos difiera entre integraciones:

- **Significados compartidos de la máquina.** Una `MachineDefinition` declara los significados de los estados, las identidades de las transiciones, un invariante obligatorio y ranuras de hijos con nombre.
- **Políticas específicas de cada integración.** Cada `PolicyProfile` elige sus aristas, versiones de manejadores y condiciones con nombre dentro de esa definición. Una integración puede requerir una operación externa antes de una transición; otra puede aportar ya la evidencia y omitir el trabajo.
- **Máquinas hijas anidadas.** Una máquina Order puede alojar una máquina Shipment mientras está en un estado declarado. El vínculo conserva la identidad original del hijo a través de reintentos, cambios de estado y reinicios del worker.
- **Decisiones de negocio protegidas.** El nuevo estado de negocio se confirma a través de un límite propiedad de la aplicación que comprueba el estado esperado, la revisión y la cancelación aceptada.
- **Compensación retenida.** Las obligaciones pueden sobrevivir a la ejecución que las creó mediante ámbitos de compensación retenidos.

Si basta con un workflow con una saga, use directamente [Sagas](sagas.md) y [Workflows hijos](child-workflows.md).

## El contrato de transición {#the-transition-contract}

Todo manejador de transición implementa los mismos cuatro métodos, sea cual sea la máquina o la integración:

```php
interface TransitionStep
{
    public function canTransition(TransitionContext $context): bool;
    public function canExecute(TransitionContext $context): bool;
    public function execute(TransitionContext $context): ExecutionReceipt;
    public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void;
}
```

- `canTransition()` responde si el destino ya se ha alcanzado. Es una proyección pura de la evaluación del destino registrada.
- `canExecute()` responde si el trabajo está permitido. Es una proyección pura de la evaluación de permiso registrada.
- `execute()` orquesta actividades registradas o esperas duraderas y devuelve un `ExecutionReceipt`. El recibo reconoce el trabajo; no establece que se esté listo para confirmar.
- `compensate()` recibe la `ExecutionReference` original. Devuelva el control solo después de verificar los efectos requeridos, o su ausencia. El trabajo desconocido o pendiente debe esperar o fallar explícitamente, nunca devolver con éxito.

Extienda `AssessedTransitionStep` para implementar las dos guardas directamente a partir de la instantánea registrada. El runner rechaza una guarda personalizada que contradiga la evaluación registrada.

## Cómo ejecuta el runner una transición {#how-the-runner-executes-a-transition}

`TransitionRunner::run()` recibe el workflow, el perfil fijado, la `ExecutionReference` original, el evento, un `TransitionRuntime` y un registro cerrado de manejadores. A continuación:

1. Selecciona la arista única para el evento y el estado de origen. Si no hay ningún candidato, devuelve `Unavailable`; si hay varios, `Ambiguous`.
2. Solicita una instantánea `before` registrada y, cuando el perfil tiene una definición, comprueba su invariante compartido. Un invariante no satisfecho devuelve `Blocked`; uno desconocido devuelve `Unknown`.
3. Comprueba la guarda del destino. Un destino satisfecho omite el trabajo, pero sigue pasando por la confirmación protegida; omitirlo no supone asumir la propiedad de los efectos externos que ya existen. Un destino desconocido devuelve `Unknown`.
4. Devuelve `Pending` cuando la arista no declara trabajo. En caso contrario, comprueba la guarda de ejecución y registra la admisión en vivo. Un rechazo devuelve `Blocked`; una respuesta desconocida devuelve `Unknown`.
5. Registra la compensación del paso original con la Saga nativa y luego llama a `execute()`.
6. Solicita una instantánea `after` nueva y vuelve a comprobar el invariante y el destino. Un estado de origen o una revisión obsoletos devuelven `Conflict`, un resultado no satisfecho `Pending` y uno desconocido `Unknown`. Un destino satisfecho pasa a la confirmación protegida.
7. Confirma a través del runtime, que informa `Committed`, `Conflict` o `CancellationRequested`.

Los valores de `TransitionStatus` son resultados del procesamiento, no su catálogo de estados de negocio. El runner nunca reintenta una transición completa ni compensa por sí mismo una transición bloqueada. La aplicación decide si esperar, reintentar, conciliar o compensar. Un resultado no es un permiso para cerrar el workflow propietario: manténgalo abierto mientras queden trabajo de avance u obligaciones de compensación.

`ActivityTransitionRuntime` implementa `TransitionRuntime` con tres actividades de la aplicación (instantánea, admisión y confirmación) y una `MachineDefinition` opcional. Utiliza el historial ordinario de actividades y no añade ningún comando de worker ni evento de historial. En el ejemplo configurado de Order/Shipment, todas las transiciones pasan por la misma llamada al runner:

```php
return (new TransitionRunner())->run(
    $this->workflow,
    $this->profile,
    $execution,
    Catalogue::transition($this->profile, $key)->event,
    new ActivityTransitionRuntime(
        SnapshotActivity::class,
        AdmissionActivity::class,
        CommitActivity::class,
        $this->profile->definition
    ),
    $handlers
);
```

Las tres clases de actividad son código de la aplicación, no clases del paquete.

## Definiciones, perfiles y versiones {#definitions-profiles-and-versions}

Una `MachineDefinition` contiene lo que comparten todas las integraciones. La definición de la versión dos del ejemplo declara cuatro estados, las identidades de transición, una regla de invariante y la ranura del hijo Shipment:

```php
return new MachineDefinition(
    $machine,
    '2',
    [
        new MachineState('received', 'Business input accepted; completion has not been committed.'),
        new MachineState('working', 'Original work admitted; business completion remains pending.'),
        new MachineState('completed', 'The original execution has verified its required business outcome.'),
        new MachineState('cancelled', 'Original compensation verified and business cancellation committed.'),
    ],
    $machine === 'orders' ? ['begin', 'finish', 'cancel', 'reconcile'] : ['deliver'],
    self::fact('model_consistent'),
    $machine === 'orders' ? [
        new ChildSlot('shipment', ['received', 'working'], 'shipments', '2', 'completed'),
    ] : []
);
```

`PolicyProfile::forDefinition()` asocia a esa definición las aristas `TransitionDefinition` y las condiciones con nombre de una integración. Un perfil no puede añadir un estado ni una identidad de transición no declarados, y las condiciones con nombre del perfil no pueden sustituir el invariante compartido.

El versionado sigue estas reglas:

- **Huellas.** La huella de la definición abarca los significados de los estados, el invariante y las declaraciones de ranuras. La huella del perfil abarca la definición y los metadatos del perfil, el grafo, las estructuras de las condiciones, las versiones de los manejadores y los límites que haya. Ninguna calcula el hash de las implementaciones PHP.
- **Ejecuciones fijadas.** Una `ExecutionReference` fija el ámbito, el sujeto de negocio, el ID de ejecución, la huella de la política, el estado de origen esperado y la revisión. Registre la huella seleccionada antes de que empiece el trabajo y vuelva a proporcionarla en el replay. Nunca la calcule a partir de la configuración más reciente al reanudar.
- **Solo ejecuciones nuevas.** Una nueva versión de definición o de perfil se selecciona para ejecuciones nuevas. Reescribir la asignación de un sujeto en ejecución cambia su huella, y entonces la ejecución original se rechaza. No existe una API para migrar ejecuciones en curso.
- **Implementaciones retenidas.** Mantenga desplegadas las definiciones, reglas, manejadores y versiones de autorización antiguos mientras sus ejecuciones u obligaciones retenidas sigan siendo recuperables. Los manejadores provienen de un registro cerrado de tipo/versión indexado por `TransitionDefinition::handlerKey()`. Los datos almacenados no pueden seleccionar una clase PHP, y un manejador ausente falla antes de cualquier E/S de la aplicación.

Consulte [Versionado](versioning.md) para conocer las reglas generales para cambiar el código de un workflow.

## Reglas, condiciones y hechos registrados {#rules-conditions-and-recorded-facts}

La configuración selecciona condiciones; las implementaciones de las reglas siguen siendo código de aplicación de confianza. Un `RuleRegistry` construido en un arranque de confianza asocia un tipo y una versión de regla a un objeto `ConditionRule`. Una `RuleReference` fija el tipo, la versión y los parámetros, y `ConditionDefinition::rule()`, `all()`, `any()` y `not()` combinan esas hojas. Una condición tiene como máximo 64 nodos.

Las decisiones tienen tres valores: `Verdict::Satisfied`, `Verdict::Unsatisfied` y `Verdict::Unknown`. En `all()`, un hijo no satisfecho hace que el grupo no se satisfaga; de lo contrario, un hijo desconocido lo vuelve desconocido. En `any()`, un hijo satisfecho hace que el grupo se satisfaga; de lo contrario, un hijo desconocido lo vuelve desconocido. La negación de un valor desconocido sigue siendo desconocida.

Los hechos se recopilan solo en la actividad de instantánea registrada. El `AssessmentStore` del ejemplo registra los hechos con referencias de evidencia y evalúa las condiciones de destino y de permiso del perfil:

```php
$facts = new RecordedFacts($id, $values, array_combine(array_keys($values), array_map(
    static fn (string $name): string => 'recorded-fact:' . $id . ':' . $name,
    array_keys($values)
)));
$registry = Catalogue::registry();
$target = $registry->evaluateCondition($profile->condition($transition->key . '.target'), $facts);
$permission = $registry->evaluateCondition($profile->condition($transition->key . '.permission'), $facts);
```

Cuando el perfil tiene una definición, la misma actividad evalúa `MachineDefinition::assess()` y devuelve `MachineAssessment::fromEvaluation()` como `machineAssessment` de la instantánea. Conserve junto con la instantánea la explicación completa de `ConditionEvaluation::toArray()`. Una evaluación ausente, una definición modificada o una condición modificada provocan un rechazo antes del trabajo. Una evaluación registrada es evidencia del host, no una autorización: la confirmación protegida debe seguir comprobando la autoridad en vivo, la revisión y la cancelación.

## Replay determinista {#deterministic-replay}

El protocolo se basa en el historial registrado, por lo que las [restricciones de los workflows](../constraints/workflow-constraints.md) habituales se aplican de forma estricta:

- Las guardas y las reglas no realizan E/S. No leen la base de datos, la configuración, un proveedor ni el contenedor.
- Las lecturas en vivo ocurren dentro de la actividad de instantánea. En el replay, las actividades completadas devuelven sus resultados registrados; las reglas no se vuelven a evaluar con datos en vivo.
- Una instantánea `after` debe usar un ID de instantánea distinto y hechos recién recopilados. `SnapshotPhase` separa la evidencia de `before`, `after` y `compensation`, de modo que una fase no puede sustituir a otra.
- `execute()` y `compensate()` llaman a actividades. Envuelva en una actividad cualquier proveedor o manejador de aplicación síncrono; llamarlo directamente desde el código del workflow puede repetir sus efectos durante el replay.
- La admisión registra solo la autoridad y el permiso. No debe realizar el efecto de negocio de avance antes del registro en la Saga.
- Use `TransitionResult::toArray()` al cruzar los límites del workflow y del historial. Los objetos de dominio de la aplicación permanecen detrás de sus adaptadores de paso y de runtime.

## Confirmaciones de negocio protegidas {#protected-business-commits}

La actividad de confirmación es la autoridad de negocio de la aplicación. Debe:

1. Vincular el ID de decisión a su ámbito, sujeto, política, transición y contenido. Un duplicado exacto devuelve el resultado registrado; reutilizar el ID para otro contenido se rechaza.
2. Volver a comprobar la autoridad en vivo, el estado de origen y la revisión esperados, y cualquier cancelación aceptada, bajo el bloqueo autoritativo de la aplicación.
3. Registrar de forma atómica el estado de negocio, la decisión y cualquier intención de publicación cuando compartan un almacén.
4. Tras un acuse de recibo perdido, buscar o reintentar esa decisión exacta en lugar de repetir los efectos.

Devuelve un `CommitResult` con `committed`, `conflict` o `cancellation_requested`. El último estado significa que una cancelación aceptada impidió esta confirmación. No significa que la compensación haya terminado ni que la entidad de negocio esté cancelada. No se implica ninguna transacción distribuida entre el almacén de la aplicación y Durable Workflow.

## Máquinas hijas vinculadas a estados del padre {#child-machines-bound-to-parent-states}

Un `ChildSlot` en la definición del padre nombra la ranura, sus estados anfitriones, la máquina hija y la versión de su definición, y el resultado de negocio requerido. `MachineDefinition::assertBinding()` comprueba un vínculo frente a esa declaración. No realiza ninguna búsqueda, autorización ni admisión.

Un `BindingIdentity` fija la ejecución original del padre, el espacio de nombres, la instancia y la ejecución (run) del padre, la ranura, la **generación**, el estado anfitrión, el tipo de workflow hijo, la huella de la política del hijo, el resultado requerido, la huella de la entrada y las opciones del hijo. La generación identifica una entrada en un estado. Las solicitudes para una generación antigua nunca se redirigen a un hijo más reciente después de que el padre cambie de estado o vuelva a entrar en uno.

Iniciar y esperar un hijo son transiciones separadas:

- **Inicio.** El padre reserva y admite el hijo, registra el vínculo exacto y solo entonces confirma el estado anfitrión. Si el vínculo ya está registrado, el paso lo reutiliza en lugar de volver a iniciarlo. Con ámbitos retenidos, `DurableScope::reserveChild()` devuelve una `ChildReservation`, y `ChildReservation::start()` usa el inicio nativo confirmado del hijo. Más adelante, `ChildReservationStore::close()` devuelve el `ChildBinding` admitido o un `NeverAdmittedChild` permanente.
- **Espera.** Una transición posterior observa esa misma admisión. No crea un segundo hijo ni un segundo propietario de la compensación.

El paso compartido del ejemplo muestra ambas transiciones:

```php
if ($key === 'begin') {
    $childScope = Ownership::childScope($execution);
    $reservation = $this->scope->reserveChild(
        $execution->executionId . '.shipment',
        $childScope,
        Ownership::binding(
            $execution,
            $this->initialization['rootRun'],
            $this->initialization['integration'],
            $this->initialization['version']
        )
    );
    $existing = Workflow::activity(BoundaryActivity::class, 'binding', [
        'reservation' => $reservation->toArray(),
    ]);
    if ($existing === null) {
        $reservation->start(
            $execution->subject,
            $this->initialization['rootRun'],
            $execution->toArray(),
            $childScope->toArray()
        );
        $existing = Workflow::activity(BoundaryActivity::class, 'record-start', [
            'reservation' => $reservation->toArray(),
        ]);
    }
    $binding = ChildBinding::fromArray($existing);
    $operations[] = 'child:' . $binding->admission->childRunId;
} elseif ($key === 'finish') {
    $value = Workflow::activity(BoundaryActivity::class, 'active-binding', []);
    $binding = ChildBinding::fromArray($value);
    $outcome = StartedChildWorkflow::fromArray($binding->admission->toArray())->await();
    Workflow::activity(BoundaryActivity::class, 'outcome', [
        'binding' => $value,
        'outcome' => $outcome,
    ]);
} elseif ($key !== 'deliver') {
    throw new LogicException('A proof-only transition must not dispatch work.');
}
```

Sin una reserva, `Workflow::startChild()` devuelve un recibo `StartedChildWorkflow` que un paso posterior puede esperar con `await()`. El padre debe verificar el resultado de negocio del hijo; la finalización técnica del hijo, una señal aceptada o un tiempo de espera no bastan. `Workflow::startChild()` solo está disponible en modo embebido; la ejecución mediante el protocolo de workers lo rechaza.

## Compensación y ámbitos retenidos {#compensation-and-retained-scopes}

El runner registra el paso original con la Saga nativa antes de que `execute()` pueda suspenderse o fallar. La función de retorno captura la ejecución y el paso originales, no el recibo. Durante la compensación, el runner solicita una instantánea `compensation` nueva y llama a `compensate()` con la ejecución original. Use la compensación secuencial predeterminada.

Una función de retorno de Saga local a la ejecución termina con su ejecución. Los ámbitos de compensación retenidos (`Workflow\V2\Compensation`, también experimentales) conservan cada obligación en un libro de registro duradero, de modo que pueda compensarse después de que se cierre la ejecución que la originó. La [guía de ámbitos de compensación](https://github.com/durable-workflow/workflow/blob/main/docs/compensation-scopes.md) del repositorio del motor describe esa API. En los ejemplos, cada efecto externo se registra como `Obligation` mediante `DurableScope::execute()` antes de despacharse, y un ámbito hijo se verifica antes de deshacer los efectos anteriores del padre. Después, la compensación propia del paso verifica solo sus obligaciones originales:

```php
public function compensate(TransitionContext $context, ExecutionReference $originalExecution): void
{
    Workflow::activity(RequestScopeActivity::class, $this->identity->toArray(), $this->principal);
    // Scope callbacks registered within execute() run first. Check only this step's original subset:
    // verifying the whole scope here would block earlier steps before their callbacks can run.
    Workflow::activity(BoundaryActivity::class, 'verify-step', [
        'execution' => $originalExecution->toArray(),
        'key' => $context->transition->key,
    ]);
}
```

La cancelación de negocio es una decisión independiente. En los ejemplos, una transición solo de comprobación confirma `cancelled` únicamente después de que se verifique el ámbito retenido. Una cancelación técnica, una solicitud de recuperación en cola o una compensación fallida no la establecen. El grafo retenido actual tiene un nivel padre/hijo, como máximo 16 hijos y 256 obligaciones por ámbito. La propiedad de avance de la raíz y del hijo no se transfiere a los sucesores creados por continue-as-new o redrive, y la liberación de la retención sigue siendo explícita.

## Presupuestos y resultados explícitos {#budgets-and-explicit-outcomes}

La configuración de confianza puede acotar una máquina:

- `DefinitionLimits` (`states`, `transitions`, `childSlots`, `ruleNodes`) se pasa a `MachineDefinition` como `limits:`. Cada perfil vinculado comprueba además sus aristas de origen expandidas y el total de nodos de condición.
- `ExecutionLimits` (`commands`, `historyEvents`, `historyBytes`, `groupDepth`) se asocia con `PolicyProfile::withLimits()` o con el argumento `limits:` de `PolicyProfile::forDefinition()`. El presupuesto de comandos abarca cada suspensión duradera dentro de `TransitionRunner`, hasta 4096 comandos y 64 niveles de grupo. Los valores del historial son umbrales de admisión medidos con `Workflow::historyBudgetAtStep()` antes de cada comando, no límites absolutos.

Ambos límites forman parte de sus huellas. Omitirlos conserva las huellas anteriores; añadir o cambiar un presupuesto requiere una versión seleccionada explícitamente para las ejecuciones nuevas.

Un presupuesto alcanzado durante la ejecución devuelve `TransitionStatus::Blocked` con el motivo `state_machine_<dimension>_limit_exceeded`. Una definición no válida lanza `ResourceLimitExceeded` con la dimensión, el recuento observado y el límite antes de que se ejecute ningún manejador. Ninguno de los dos resultados significa que la cancelación haya tenido éxito ni que un efecto externo anterior no haya ocurrido. `Workflow::compensate()` se ejecuta fuera de los presupuestos de avance.

## Diagnóstico {#diagnostics}

- `TransitionResult::toArray()` devuelve la ejecución, el estado, el motivo, la evaluación y la clave de la transición.
- `ConditionEvaluation::toArray()` conserva la huella de la estructura, el ID de la instantánea, las versiones de las reglas, los motivos, las referencias de evidencia y los hechos ausentes.
- `MachineAssessment::toArray()` registra la decisión del invariante vinculada a la definición y a la instantánea.
- `ResourceLimitExceeded` expone `dimension`, `observed` y `limit`.
- `ScopeRecovery::describe()` informa del estado de un ámbito retenido, incluido cuándo se necesita una nueva solicitud de cancelación autorizada.

## Ejemplos ejecutables {#runnable-examples}

Los ejemplos se encuentran en el repositorio workflow y se ejecutan con sus dependencias de desarrollo y su base de datos de pruebas. Usan sus propias tablas de aplicación desechables, no las migraciones del paquete.

| Ejemplo | Qué demuestra |
| --- | --- |
| [Order y Shipment configurados](https://github.com/durable-workflow/workflow/blob/main/examples/configured-state-machines/README.md) | Dos perfiles de integración, `prepare` e `imported`, con los mismos estados y un paso compartido. La preparación aloja Shipment en `working`; la importación lo aloja en `received`. Una arista `reconcile` solo de comprobación omite el trabajo cuando existe evidencia. La versión dos añade definiciones compartidas para sujetos nuevos, mientras la versión uno permanece fijada. Incluye la reserva de hijos, la compensación retenida y la finalización de la cancelación. |
| [Order, Payment y Shipment respaldados por proveedores](https://github.com/durable-workflow/workflow/blob/main/examples/provider-state-machines/README.md) | Tres máquinas sobre el mismo protocolo frente a un diario de proveedor sintético. Las recetas cubren el proceso de compra con reserva primero y con pago primero, resultados de reembolso, autorización y captura tras el stock o la entrega, financiación bancaria, contra reembolso (COD), con anticipo y saldo, y por suscripción, arrendamientos de Cart, dinero en unidades, stock parcial, devoluciones, cambios, incidencias del transportista y recuperación tras la pérdida de un worker. |
| [Decisiones de negocio en SQL](https://github.com/durable-workflow/workflow/blob/main/examples/business-state-machines/README.md) | Una confirmación protegida propiedad de la aplicación con fencing SQL para la cancelación, los conflictos de revisión, la revocación de autoridad, la intención de publicación y los acuses de recibo perdidos, además de la compensación nativa anidada de Order y Shipment. |

Ejecute las pruebas del ejemplo configurado desde el repositorio workflow:

```shell
vendor/bin/phpunit tests/Feature/V2/V2ConfiguredStateMachineExampleTest.php
```

Los tres usan proveedores sintéticos o de la misma base de datos. No cualifican un transportista, un proveedor de pagos ni un almacén reales, una actualización del paquete instalado ni una migración en curso. Una integración real debe aportar su propia idempotencia, fencing y conciliación de resultados inciertos.

La [referencia de máquinas de estado de negocio](https://github.com/durable-workflow/workflow/blob/main/docs/business-state-machines.md) del repositorio del motor documenta el contrato completo, incluidas las formas de las cargas útiles de las actividades. El estado de la entrega se sigue en [durable-workflow/workflow#1069](https://github.com/durable-workflow/workflow/issues/1069).
