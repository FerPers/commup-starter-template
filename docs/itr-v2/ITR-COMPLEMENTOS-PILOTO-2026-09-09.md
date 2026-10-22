# CommUp — formatos originales para curación del piloto

Revisión: borrador 0, 9 de septiembre de 2026. Autoría original preparada para CommUp. Son estructuras de registro para revisión técnica; no procedimientos de maniobra ni formatos oficiales de ICAPS/OPERCOM/Hexagon. El responsable de disciplina del proyecto define aplicabilidad, secuencia, valores de aceptación y autoridad antes de publicarlos.

## Qué complementar realmente

La organización demo ya contiene 303 plantillas. No recomiendo sumar indiscriminadamente otras 100. Revisé en detalle I10A: su estructura de calibración quedó convertida en casillas, incluidos rangos y error. El motor sí admite mediciones y límites, como muestra la plantilla LCT-FT. La tarea es utilizar bien esa capacidad.

| Cobertura que ya aparece en el catálogo | Prioridad de curación |
|---|---|
| I10A / I42B / I29C: calibración, entradas y lazos | Separar calibración de instrumento y prueba integral de lazo; datos numéricos, unidades y referencia |
| I28C / I30C / I45C: F&G, enclavamientos y SIS | Casos de prueba, revisión de lógica, efectos esperados/observados, testigos y restitución |
| P04A / P05A / P14B / P15B / P17B | Límites del paquete, referencias de ensayo, restitución y evidencia de aceptación |
| E13B / E13C / E14-1B / E38A | Mediciones en tablas, equipos de prueba y criterios específicos de fabricante/proyecto |
| M09B / M09C / M42B | Preparación, registro temporal de operación y limpieza de lubricación |
| PSSR y certificados | Prerrequisitos y aceptación por autoridades; coherencia con evidencia de las disciplinas |

Esta tabla identifica títulos observados, no certifica que sus contenidos completos sean adecuados. Los cinco formatos siguientes sirven para rediseñar variantes o cubrir vacíos del alcance. Revisar duplicados antes de incorporarlos.

## Cabecera común obligatoria

| Campo | Tipo / regla |
|---|---|
| Proyecto, sistema, subsistema | Referencias seleccionadas y validadas |
| Tag, lazo o paquete de prueba | Referencia principal y lista de elementos afectados |
| Código ITR, revisión e instancia | Generados/controlados; revisión congelada al ejecutar |
| Fase e hito que aporta | Referencia a la metodología del proyecto |
| Procedimiento, plano/P&ID, hoja de datos | Identificador y revisión vigente de cada documento |
| Fecha, hora y zona horaria | Trazables; distinguir captura y sincronización |
| Inspector y testigos | Usuarios asignados con rol autorizado |
| Permiso y aislamientos aplicables | Referencias al sistema/proceso autorizado del cliente |
| Instrumentos de prueba | ID, fabricante/modelo, serie, certificado y vigencia |
| Criterios de aceptación | Valores/unidades y documento de origen, aprobados antes del ensayo |
| Resultado | Conforme / No conforme / No ejecutado / No aplica justificado |
| Desviaciones y repetición | Punch/NCR, acción, número de intento y nueva evidencia |
| Firmas | Ejecutor, revisor y aceptación según matriz del proyecto |

Los encabezados no son preguntas ni suman progreso. “No aplica” exige justificación y autorización cuando corresponda. Un dato desconocido no es “No aplica”. Evidencia y firma quedan asociadas a la revisión del registro.

## CU-INST-001 — Registro de calibración de instrumento

**Unidad de ejecución:** un instrumento; no sustituye la prueba completa de lazo. Aplicable al instrumento y procedimiento seleccionados, con puntos y dirección de ensayo definidos por el responsable.

| Nº | Campo/verificación | Captura | Condición de aceptación |
|---|---|---|---|
| 1 | Identificación y servicio coinciden con documentación vigente | Sí/No + referencia | Coincidencia confirmada |
| 2 | Fabricante, modelo, serie y configuración | Texto/lista | Datos completos y consistentes |
| 3 | Rango inferior/superior y unidad de entrada | Dos números + unidad | Según hoja de datos |
| 4 | Rango de salida y tipo de señal | Números/lista | Según diseño |
| 5 | Característica de transferencia | Lista + referencia | Lineal u otra función identificada |
| 6 | Equipo patrón y vigencia | Referencia documental + fecha | Vigente para el ensayo |
| 7 | Condiciones de prueba requeridas | Mediciones/texto | Dentro de límites del procedimiento |
| 8 | Lecturas antes de ajuste — as found | Tabla inferior | Todos los puntos aplicables registrados |
| 9 | Ajuste efectuado | Sí/No + descripción | Autorizado y trazable |
| 10 | Lecturas finales — as left | Tabla inferior | Error dentro del criterio aprobado |
| 11 | Configuración final y restitución | Sí/No + referencia | Verificada por responsable |
| 12 | Resultado, anexos y desviaciones | Estado + archivos + punch | Sin incumplimiento sin resolver/aceptar |

Tabla de lecturas, repetida para as found y as left:

| Punto | Dirección | Entrada de referencia | Unidad | Salida esperada | Salida medida | Unidad | Error | Límite aprobado | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| Según procedimiento | Ascendente/descendente | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ |

La fórmula de error debe declarar su base: unidades de salida, porcentaje de span u otra especificación. No usar una tolerancia universal. Si se configura señal lineal 4–20 mA, la salida teórica puede calcularse a partir de los rangos aprobados; no aplicar esa fórmula a funciones no lineales.

**Bloqueos:** rango/criterio sin definir, patrón no válido, puntos obligatorios faltantes, resultado final fuera de criterio o evidencia requerida ausente. Guardar el as found aunque falle; no sobrescribirlo con el resultado ajustado.

Para preparar una variante de fabricante, consultar su manual vigente y modelo exacto; Emerson publica instrucciones específicas de calibración y loop test. Eso no convierte este formato en un procedimiento del fabricante. [Manual Rosemount 2051](https://www.emerson.com/is/content/emerson/en/measurement-instrumentation/technical/products/pressure/documents/dl-rmt-00809-0100-4101.pdf).

## CU-INST-002 — Prueba funcional integral de lazo

**Unidad de ejecución:** lazo y sus tags relacionados. Separar de CU-INST-001: calibrar un transmisor no demuestra el comportamiento completo hasta control/indicación.

| Nº | Campo/verificación | Captura | Aceptación |
|---|---|---|---|
| 1 | Identificación de lazo, instrumento, cable y canal I/O | Referencias | Coinciden con loop diagram vigente |
| 2 | Plano, lista de señales y configuración de control | IDs/revisiones | Versiones autorizadas |
| 3 | Prerrequisitos de instalación/calibración | ITR asociados | Aceptados para esta prueba |
| 4 | Autorización de la prueba y estado de operación | Referencias | Confirmados por responsable |
| 5 | Comprobación de señales | Tabla | Correspondencia dentro de criterios |
| 6 | Indicación, escala, unidades y sentido | Sí/No + valores | Conforme al diseño |
| 7 | Alarmas/funciones aplicables | Casos referenciados | Resultado esperado verificado |
| 8 | Restitución de configuración temporal | Registro | Verificada y aceptada |
| 9 | Evidencia, desviaciones y repetición | Archivos/IDs | Trazabilidad completa |

| Caso | Punto autorizado | Valor esperado en control | Valor observado | Unidad/estado | Criterio | Resultado | Evidencia |
|---|---|---|---|---|---|---|---|
| ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ |

**Bloqueos:** canal/tag incorrecto, señal o indicación fuera de criterio, casos obligatorios no ejecutados, configuración temporal no restituida. La selección de puntos y el método de estimulación pertenecen al procedimiento autorizado.

## CU-FUNC-001 — Registro de prueba de causa y efecto

**Unidad de ejecución:** caso de prueba de una matriz aprobada; relacionar todos los tags afectados, no únicamente una pareja causa/efecto.

| Nº | Campo/verificación | Captura | Aceptación |
|---|---|---|---|
| 1 | Sistema, función y matriz causa/efecto | IDs/revisión | Revisión aprobada identificada |
| 2 | Versión de lógica y documentación de requisitos | IDs | Coincidencia con versión autorizada |
| 3 | Prerrequisitos, permisos y testigos | Referencias | Aceptados antes de ejecución |
| 4 | Casos aplicables y exclusiones | Lista + justificación | Alcance aprobado |
| 5 | Resultado por caso | Tabla | Todos los resultados obligatorios conformes |
| 6 | Eventos/alarmas registrados | Archivos y marcas de tiempo | Correspondencia con caso |
| 7 | Desviaciones y retest | IDs + nueva evidencia | Cerrados o tratados según autorización |
| 8 | Restitución y cierre | Registro + testigo | Configuración temporal retirada/verificada |

| Caso | Condición inicial | Causa según procedimiento | Efectos esperados | Efectos observados | Tiempo si aplica | Criterio/referencia | Resultado | Testigo |
|---|---|---|---|---|---|---|---|---|
| ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ |

**Bloqueos:** caso obligatorio faltante, efecto incorrecto, discrepancia de versión, restitución pendiente o testigo requerido ausente. No establecer aquí setpoints, temporizaciones ni métodos de bypass; provienen de la ingeniería/procedimiento aprobado. Este registro no acredita por sí mismo nivel SIL ni una validación funcional completa.

## CU-PIPE-001 — Restitución y aceptación de paquete de tubería

**Unidad de ejecución:** paquete/sistema delimitado. Complementa los registros de pruebas; no prescribe presión, medio ni duración del ensayo.

| Nº | Campo/verificación | Captura | Aceptación |
|---|---|---|---|
| 1 | Límites del paquete y líneas incluidas | Plano marcado + lista | Coinciden con alcance aprobado |
| 2 | Ensayos y limpieza requeridos | Registros/estado | Evidencias aceptadas |
| 3 | Juntas intervenidas | Registro de juntas | Sin elementos sin verificar |
| 4 | Elementos temporales de prueba | Lista de cada elemento y disposición | Estado final según procedimiento |
| 5 | Elementos permanentes reinstalados | Tags/lista + evidencia | Correcta identificación y montaje |
| 6 | Válvulas, instrumentos y protecciones | Referencias | Verificación según line-up autorizado |
| 7 | Soportes y restricciones temporales | Lista + evidencia | Disposición final verificada |
| 8 | Walkdown contra revisión vigente | Registro | Desviaciones identificadas |
| 9 | Punches y excepciones | IDs | Tratamiento compatible con hito solicitado |
| 10 | Aceptación de transferencia | Responsable + firma | Autoridad y alcance explícitos |

| Elemento/tag | Ubicación/plano | Estado inicial | Estado final requerido | Estado observado | Evidencia | Verificador |
|---|---|---|---|---|---|---|
| ___ | ___ | ___ | ___ | ___ | ___ | ___ |

**Bloqueos:** límites ambiguos, pruebas obligatorias no aceptadas, temporales sin disposición verificada, punch bloqueante o restitución incompleta.

## CU-MECH-001 — Registro de prueba operativa de equipo rotativo

**Unidad de ejecución:** equipo/paquete bajo un procedimiento específico del fabricante y del proyecto. Es un registro, no instrucciones de arranque.

| Nº | Campo/verificación | Captura | Aceptación |
|---|---|---|---|
| 1 | Equipo, accionador y auxiliares | Tags relacionados | Correspondencia de alcance |
| 2 | Prerrequisitos mecánicos, eléctricos e instrumentación | ITR/actas | Aceptados |
| 3 | Procedimiento y envolvente de prueba | Documento/revisión | Autorizados |
| 4 | Instrumentos y puntos de medición | IDs/unidades | Válidos e identificados |
| 5 | Variables durante ensayo | Tabla temporal | Dentro de criterios específicos |
| 6 | Comportamientos anormales | Descripción, tiempo y evidencia | Evaluados por responsable |
| 7 | Inspección posterior | Registro | Conforme al procedimiento |
| 8 | Estado final y entrega | Registro + firmas | Disposición autorizada |

| Fecha/hora | Condición de operación | Punto/variable | Lectura | Unidad | Rango aceptable/referencia | Resultado | Observaciones |
|---|---|---|---|---|---|---|---|
| ___ | ___ | ___ | ___ | ___ | ___ | ___ | ___ |

Variables posibles según equipo: velocidad, corriente, presión, temperatura, vibración y caudal. El responsable selecciona variables, duración, frecuencia de captura y límites aplicables; no usar una lista genérica como cobertura automática de todos los equipos.

**Bloqueos:** prerrequisito faltante, registro insuficiente para el ensayo acordado, desviación no resuelta o criterio no aprobado.

## Publicación y adaptación a CommUp

1. Elegir formatos según la lista real de equipos de GeoPark; asignar revisor técnico por disciplina.
2. Adaptar criterios, documentos, fases y firmas. Crear nuevas revisiones, preservando ITR históricos.
3. Mapear datos a `text`, `number`, `measurement`, `date`, `select`, `yes_no`, `photo` según significado. Nunca convertir un encabezado en checkbox.
4. Para tablas repetidas, comprobar capacidad del editor. Si no hay filas repetibles, usar grupos de campos acotados o un anexo controlado enlazado; no aplanar encabezados/celdas como tareas independientes.
5. Probar un caso conforme, uno fallido, uno incompleto, uno no aplicable y uno con conflicto offline. El servidor debe validar los mismos criterios que la pantalla.
6. Exportar un ITR de muestra y obtener aceptación del cliente antes de multiplicarlo por cientos de tags.

No se importaron estas propuestas a la aplicación. Los campos técnicos pendientes deben completarse antes de convertirlas en plantillas ejecutables.
