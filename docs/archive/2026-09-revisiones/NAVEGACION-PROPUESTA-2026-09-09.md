# Navegación de CommUp: diagnóstico y propuesta

Revisión del 9 de septiembre de 2026. Evidencia: menú real con sesión owner, pantallas Proyecto, Digital Twin, Mi trabajo e ITR móvil, más código de sidebar y barra móvil. No se probaron sesiones de inspector/cliente; las conclusiones sobre esos roles se basan en código.

## Veredicto

La navegación es coherente con la estructura técnica del producto, pero solo parcialmente intuitiva para el trabajo industrial. Tiene buena agrupación inicial y demasiadas opciones expuestas. Un usuario experimentado puede aprenderla; un técnico nuevo debe decidir entre conceptos que deberían resolverse por contexto.

El problema no se arregla cambiando iconos. Hay que reducir decisiones, aclarar alcance y dar más protagonismo a sistemas y trabajo pendiente.

## Lo que mantendría

- Mi trabajo como primera entrada. La pantalla real ya reúne ejecutar, revisar, punches, plan, firmas y preservación. Es una de las piezas más útiles y debería guiar la experiencia.
- Escaneo directo: elimina búsqueda manual cuando hay identificación física.
- Proyecto activo visible y breadcrumbs con retorno al proyecto.
- ITR, Punch List y Certificados: lenguaje reconocible para usuarios del sector.
- Administración colapsable y permisos por rol.
- Barra móvil dedicada a Mi trabajo, Escanear, Bandeja y Menú, implementada para inspector/leader. No la juzgaría usando exclusivamente la vista owner.

## Lo que dificulta usarla

| Observación actual | Efecto sobre el usuario | Cambio recomendado |
|---|---|---|
| 4 accesos personales, 15 de proyecto y 11 de organización para owner, antes de expandir administración | Menú largo que necesita scroll; lo importante compite con todo lo disponible | Mostrar principalmente el proyecto activo; portafolio como ámbito separado |
| KPIs aparece en proyecto y organización; además Dashboard y Control Tower | No está claro dónde responder “qué está atrasado” o “qué falta para entregar” | Un acceso Avance y bloqueos por proyecto y un Resumen de portafolio |
| Tags, Explorador, Digital Twin y Tag 360 son entradas/vistas cercanas | El usuario debe conocer las diferencias del producto para encontrar el mismo equipo | Un espacio Sistemas y tags con vistas Lista, Jerarquía y Plano; ficha única de tag |
| Bandeja, Notificaciones en menú y campana superior | Tres expectativas parecidas; configuración mezclada con seguimiento | Una Bandeja; campana como acceso; preferencias en perfil |
| PSSR está en Vistas y planificación | Una revisión de preparación para arranque parece una función de planeación | Agrupar PSSR con Certificados y Expedientes bajo Entrega |
| Importar está junto a planificación y ejecución | Acción ocasional de administración ocupa una posición de trabajo diario | Configuración del proyecto y botón contextual en Tags/Señales |
| Handover está a nivel organización mientras certificados están en proyecto | La entrega queda separada del contexto que el usuario está cerrando | Entrega dentro del proyecto; portafolio conserva vista agregada |
| Preservación solo aparece como entrada global | El usuario pierde el alcance del proyecto al atender un trabajo local | Acceso contextual según alcance, con vista agregada opcional |
| Señales, Loops e Interlocks siempre expuestos a roles sin restricción en esos ítems | Todas las disciplinas reciben navegación de instrumentación | Ingeniería expandible y módulos activados según alcance |
| Mezcla de Dashboard, Control Tower, Tracking de Ops, Handover y términos en español | Cambia el lenguaje entre pantallas y diluye el significado | Usar nombres estables: Resumen, Avance y bloqueos, Pendientes transferidos, Entrega |
| El encabezado de proyecto queda truncado en sidebar y organización en móvil | Aumenta la incertidumbre sobre dónde se trabaja | Selector claro de proyecto y organización, con nombre completo al abrir |

No eliminaría vocabulario técnico necesario. ITR, P&ID y Punch List pueden mantenerse con aclaración inicial. “Digital Twin” resulta menos claro para esta vista lógica: la pantalla es útil, pero el nombre promete una categoría más amplia de la que un cliente puede interpretar.

## Estructura propuesta

La organización y el proyecto se seleccionan en un control visible. Al trabajar en un proyecto, el menú principal sería:

| Entrada | Qué contiene |
|---|---|
| Mi trabajo | Pendientes propios, revisión, firmas y plan del día |
| Sistemas y tags | Desglose, registro y estado; vistas Lista / Jerarquía / P&ID |
| ITRs | Ejecutar, revisar, asignar y buscar según rol |
| Punch List | Crear, atender, verificar cierre y excepciones |
| Plan de trabajo | Actividades y compromisos del proyecto |
| Entrega | Certificados, PSSR y expediente |
| Avance y bloqueos | KPIs, tendencias, sistemas liberables y causas de bloqueo |

Accesos secundarios: Preservación si aplica; Ingeniería con señales/lazos/enclavamientos; Configuración del proyecto con importaciones y matriz de ITR. La biblioteca organizacional, usuarios, integraciones y auditoría quedan en Administración.

La bandeja/campana permanece disponible en cabecera. En desktop, buscar un tag o sistema no debería exigir primero elegir qué módulo lo contiene. El modo Portafolio agrupa proyectos, resumen ejecutivo y listas globales; salir del proyecto debe ser una elección visible.

No haría un menú por fases A/B/C/SU: obligaría a duplicar Tags, ITR y Punches y dificultaría ver bloqueos cruzados. La fase es filtro/contexto de trabajo, mientras el sistema conserva la continuidad de entrega.

## Adaptación por responsabilidad

| Persona | Entrada inicial | Prioridad |
|---|---|---|
| Inspector | Mi trabajo | Ejecutar ITR, escanear/buscar equipo, crear punch, revisar sincronización |
| Supervisor | Mi trabajo / equipo | Revisar, asignar, atender atrasos y verificar cierres |
| Líder de commissioning | Avance y bloqueos | Sistemas, dependencias, secuencia, pendientes de entrega |
| Cliente/receptor | Pendientes de aceptación | Evidencia, firmas, excepciones y expedientes |
| Administrador | Proyecto/configuración | Datos, usuarios, catálogo, importación y soporte |
| Gerencia multiproyecto | Portafolio | Hitos, riesgos y comparación entre proyectos |

Reducir opciones por experiencia no reemplaza los permisos del servidor. También debe ser posible buscar funciones secundarias; no esconderlas sin ruta alternativa.

## El lugar del P&ID

Lo mantendría accesible desde Sistemas y tags y desde el equipo. Para proyectos que hacen caminatas sobre planos, añadir un acceso directo favorito a P&ID. El técnico no debería elegir entre “Digital Twin”, “Explorador” y “P&IDs” para saber qué hacer con un tag.

Recorrido propuesto: seleccionar sistema → abrir plano vigente → tocar tag → ver pendientes → ejecutar ITR → volver al mismo plano y posición. Conservar filtros, zoom y contexto al regresar.

## Cambios antes del piloto, sin rediseñarlo todo

1. Quitar Notificaciones del primer bloque si su propósito es configuración; conservar Bandeja y campana.
2. Reducir Organización mientras se trabaja en un proyecto; acceso visible a Portafolio.
3. Renombrar Explorador a Sistemas y subsistemas, o convertirlo en vista de Sistemas y tags.
4. Agrupar Certificados, PSSR y Handover en Entrega, sin cambiar sus permisos.
5. Mover Importar a configuración/acciones contextuales.
6. Dar acceso directo a P&ID y mantener una ficha de tag consistente.
7. Preparar inicio por rol y proyecto. El código ya dirige inspector/leader a Mi trabajo; ampliar la lógica de presentación, no rehacer lo que funciona.

## Cómo decidir si mejoró

Prueba con 5–8 personas representativas, incluyendo campo y receptor. Es una propuesta de muestra, no un resultado estadístico. Darles tareas sin indicar el menú:

- Encontrar qué deben ejecutar hoy.
- Encontrar un tag desde su identificador y desde un plano.
- Identificar qué bloquea un sistema.
- Revisar un ITR y localizar su evidencia.
- Encontrar un certificado pendiente y su expediente.
- Volver al proyecto después de abrir una notificación.

Registrar primer clic, finalización sin ayuda, tiempo, retrocesos y errores de proyecto/fase. Objetivos propuestos: ≥80% de tareas sin ayuda, acceso al trabajo diario en dos pasos o menos y cero confusiones de proyecto en la muestra. Comparar actual y propuesta con tareas equivalentes.

**Decisión:** conservar la base visual y reorganizar la información alrededor del trabajo y la entrega. CommUp necesita que un técnico pueda entrar y saber qué hacer, y que un líder pueda entrar y saber qué falta.
