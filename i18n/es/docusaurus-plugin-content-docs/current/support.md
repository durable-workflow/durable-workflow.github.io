---
sidebar_position: 15
---

# Soporte {#support}

Durable Workflow es un proyecto de código abierto y de uso gratuito bajo la licencia MIT. No necesitas un acuerdo comercial para ejecutarlo, distribuirlo ni construir sistemas de producción con él.

## Soporte de la comunidad {#community-support}

La vía principal para obtener ayuda con Durable Workflow es la comunidad. Este soporte es adecuado para preguntas públicas, conversaciones de diseño, informes de errores y patrones operativos compartidos.

Es el lugar indicado para:

- Preguntas de uso
- Consejos sobre modelado de workflows
- Ayuda para entender el determinismo y la reproducción
- Compartir ideas y patrones
- Comunicar errores o comportamientos inesperados

### GitHub Discussions {#github-discussions}

GitHub Discussions es el lugar preferido para preguntas extensas, conversaciones de diseño y cuestiones que puedan ayudar a otras personas.

https://github.com/durable-workflow/workflow/discussions

### Discord {#discord}

Discord es adecuado para:

- Preguntas rápidas
- Conversaciones informales
- Comentarios iniciales
- Colaboración de la comunidad

https://discord.gg/xu5aDDpqVy

El soporte de la comunidad se ofrece según la disponibilidad de sus participantes y suele ser suficiente para desarrollo, experimentación y muchos casos de uso en producción.

## Alcance del soporte de despliegue {#deployment-support-boundary}

Durable Workflow está diseñado para ser útil sin una llamada comercial. La distribución pública está optimizada para las opciones de despliegue que la mayoría de los equipos necesitan primero:

- **Desarrollo local y entornos internos que no son de producción**  
  Ejecuta el paquete o el servidor independiente en local, en una LAN o en un entorno de pruebas compartido para probar workflows e iterar rápidamente.

- **Producción en un solo nodo**  
  Ejecuta el servidor independiente en una VM, VPS o máquina interna con una base de datos duradera, caché, proxy inverso, copias de seguridad y credenciales limitadas por rol.

- **Clústeres pequeños**  
  Ejecuta 2-3 contenedores de API sin estado detrás de un balanceador, con MySQL o PostgreSQL externo compartido, Redis compartido, workers escalados de forma independiente y exactamente un programador o proceso de mantenimiento.

- **Manifiestos de Kubernetes**  
  Usa los manifiestos incluidos cuando tu equipo ya opera Kubernetes y necesita un punto de partida nativo de Kubernetes.

Durable Workflow Cloud es un
[servicio de orquestación gestionado](/docs/polyglot/cloud-control-plane) separado.
Cloud opera el entorno de ejecución, la persistencia, la ubicación en una sola
región y la recuperación. Los clientes ejecutan clientes SDK y workers. No se
conecta un Server autogestionado a Cloud. La replicación multirregión, la
conmutación por error entre regiones y el retorno a la región original no forman
parte del contrato actual de Cloud.

La distribución pública prioriza el desarrollo local, la producción en un solo
nodo y el contrato acotado de clúster pequeño descrito en la guía de alojamiento
propio. Los manifiestos de Kubernetes se ofrecen a equipos que ya lo operan.
El contrato de clúster pequeño admite
[actualizaciones graduales](/docs/rolling-upgrades) cuando se cumplen todas las
garantías de esa página. El modelo multirregión activo/pasivo con conmutación
regional dirigida por el operador sigue siendo orientación de evaluación con
soporte. Consulta
[Multirregión activo/pasivo](/docs/deployment#activepassive-multi-region)
en la guía de alojamiento propio. El chart Helm publicado permite instalar y
desplegar de forma autónoma. Los cambios personalizados del chart, la
infraestructura del proveedor, los programadores duplicados, la operación
multinodo sin Redis, la conmutación del proveedor, el modelo multirregión
activo/pasivo o activo/activo, la conmutación regional automática autogestionada y
las topologías avanzadas de alta disponibilidad requieren soporte, porque
necesitan decisiones de dimensionamiento, base de datos, redes, seguridad y
actualización específicas del entorno.

Consulta la [guía de despliegue autogestionado](/docs/deployment) para ver la
matriz de soporte concreta, las recetas de Compose con imágenes publicadas, el
alcance de los manifiestos sin procesar de Kubernetes, las comprobaciones de
disponibilidad y dónde empieza el trabajo que requiere soporte.

Este límite mantiene sencilla la instalación autónoma y permite ofrecer ayuda más profunda cuando el propio despliegue se convierte en un proyecto de sistemas distribuidos.

## Soporte comercial (opcional) {#commercial-support-optional}

Hay soporte comercial y consultoría para equipos que necesitan garantías adicionales o la experiencia del mantenedor.

Usar Durable Workflow **no** requiere un acuerdo comercial. Todas las funcionalidades siguen siendo completamente de código abierto, se contrate o no soporte comercial.

El soporte comercial está pensado para equipos que ejecutan Durable Workflow en producción y para los que importan la corrección, la seguridad de las actualizaciones, la topología de despliegue y la semántica de las ejecuciones de larga duración.

## Qué cubre el soporte comercial {#what-commercial-support-covers}

El mantenedor del proyecto dirige los servicios de soporte comercial, que suelen incluir:

- **Planificación del despliegue en producción**  
  Orientación para elegir entre un solo nodo, el clúster pequeño acotado, Kubernetes y modelos que requieren soporte, incluidas las topologías de base de datos, caché, proxy inverso, programador y workers.

- **Dimensionamiento, fiabilidad y planificación de actualizaciones**  
  Ayuda con las hipótesis de capacidad, la estrategia de copias y restauración, el orden de inicialización y migración, la seguridad del despliegue y los procedimientos operativos.

- **Soporte para topologías avanzadas**  
  Diseño con soporte para cambios personalizados del chart Helm, infraestructura Kubernetes específica del proveedor, capas de configuración personalizadas, programadores duplicados, modo multinodo sin Redis, alta disponibilidad, multirregión activo/pasivo o activo/activo, conmutación regional automática autogestionada y replicación síncrona entre regiones. El chart publicado sigue permitiendo la instalación autónoma. La [guía de alojamiento propio](/docs/deployment#activepassive-multi-region) conserva la arquitectura activo/pasivo y los procedimientos para evaluar con soporte. El [contrato del entorno gestionado de Cloud](/docs/polyglot/cloud-control-plane), separado, documenta su ubicación en una sola región, recuperación y límites de conectividad.

- **Revisión de seguridad**  
  Ayuda con credenciales limitadas por rol, exposición de red, endpoints internos y públicos, terminación TLS y límites de acceso para operadores y workers.

- **Revisión de arquitectura y diseño de workflows**  
  Orientación para modelar correctamente workflows, incluidos los límites de actividades, señales, uso de inbox/outbox y patrones de ejecución de larga duración.

- **Orientación sobre determinismo y seguridad de reproducción**  
  Ayuda para detectar y evitar comportamiento no determinista, problemas de reproducción y errores sutiles de corrección que pueden aparecer con el tiempo.

- **Estrategia de actualización y versionado**  
  Ayuda con actualizaciones seguras, versionado de workflows y la decisión de cuándo hacen falta patrones como `continue-as-new`.

- **Depuración de comportamientos complejos de workflows**  
  Ayuda para diagnosticar workflows atascados, bucles inesperados, problemas con señales y otros comportamientos de ejecución difíciles de analizar.

- **Adaptación de correcciones y parches**  
  Acceso a correcciones y adaptaciones a versiones con soporte para evitar mantener bifurcaciones privadas.

- **Integraciones personalizadas (previo acuerdo)**  
  Ayuda para integrar Durable Workflow con sistemas existentes, como plataformas de chat, sistemas de aprobación, API internas o herramientas de observabilidad.

## A quién va dirigido el soporte comercial {#who-commercial-support-is-for}

El soporte comercial suele ser adecuado si:

- Ejecutas Durable Workflow en **producción**
- Despliegas el servidor independiente para **varios equipos o servicios**
- Creas **workflows de larga duración o con intervención humana**
- Diseñas una **topología de clúster, Kubernetes/Helm personalizada o específica de un proveedor, multirregión activo/pasivo o activo/activo, o con conmutación automática autogestionada** que supera el ámbito operativo probado de 2.0 en una sola región
- Operas en un entorno donde **importan la corrección y la seguridad de las actualizaciones**
- Buscas **la experiencia del mantenedor** en lugar de consultoría genérica
- Quieres evitar bifurcaciones y riesgos de mantenimiento a largo plazo

## Contacto {#contact}

Para hablar sobre soporte comercial o consultoría, escribe a:

**support@durable-workflow.com**

Podemos empezar con una breve conversación para entender tu caso de uso y acordar los siguientes pasos.
