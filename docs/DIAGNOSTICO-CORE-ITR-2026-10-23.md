# Diagnóstico del núcleo ITR de CommUp

**Fecha:** 23 de octubre de 2026. **Alcance:** motor ITR, biblioteca, revisiones V1/V2/V3, ejecución, aceptación, firmas y distribución. **Estado:** diagnóstico y propuesta; no se modificaron plantillas, respuestas ni activaciones.

**Integración en la propuesta de trabajo:** los puntos de mejora están incorporados al [Plan integral de CommUp, sección 13](/Users/luisfer/Desarrollo/CommUp-App/docs/PLAN-INTEGRAL-COMMUP-2026-10-23.md#13-f11--programa-de-cierre-de-brechas-del-core-itr), frente F11, acciones A36–A45. Ese plan concentra prioridades, responsables propuestos, dependencias, etapas y criterios de aceptación; conserva A01–A03 para las brechas transversales de evidencia y transacciones. Este diagnóstico conserva el sustento y los límites de los hallazgos.

## 1 Dictamen

**CommUp tiene un núcleo ITR con buenas bases y una biblioteca mejorada que merece adoptarse. Sin embargo, no recomiendo activar en bloque las revisiones más recientes.** Hay mejoras sustanciales y también regresiones de configuración y reglas de aceptación incompletas.

La capacidad del motor es mayor que la utilizada por buena parte de las plantillas. El siguiente salto debe convertir cada ITR en una prueba cuyo alcance, criterio, evidencia y decisión se puedan comprobar. Añadir campos o subir el número de versión no garantiza ese resultado.

Recomiendo conservar el motor, corregir sus vías de importación y recuperación, y homologar plantillas por familias. I04A/I06A V2 son buenos patrones para inspección; I01A V3 es un buen candidato para continuidad; I10A V3 mejora mucho la estructura de calibración, pero todavía necesita completar su lógica. I29C/I30C V3 muestran el potencial de pruebas vinculadas a ingeniería, aunque I30C tiene una inconsistencia reproducida que conviene atender primero.

## 2 Qué se comprobó

- Consulta de solo lectura de **922 revisiones**: 617 en DEMO y 305 en CommUp Catálogo. Se obtuvieron encabezados, secciones, ítems y configuraciones; no datos personales de inspectores ni firmas.
- Comparación automatizada contra los **302 códigos originales**, normalizando mayúsculas: `H50b` en el inventario equivale a `H50B` en la BD.
- Lectura detallada de I01A, I04A, I06A, I10A, I29C e I30C; inspección de ejemplos adicionales como E10B, I05A, I11A, P03A y E32A y documentos históricos de migración.
- Revisión de evaluadores, continuidad, tablas, revisión/activación/clonación, firmas y componentes de captura.
- **137 pruebas automatizadas pasaron en 21 archivos**, incluyendo reglas de tablas, continuidad, firmas, adjuntos y PDF.
- Tres sondas con datos sintéticos se comprobaron en TypeScript y en el evaluador SQL de producción, sin insertar respuestas ni firmar ITRs.

La captura se hizo a las 19:53 de Bogotá del 23 de octubre; el archivo registra el equivalente UTC del 24 de octubre. No se certificó cada control de los 302 originales contra ingeniería, ni se hizo un recorrido completo de campo y firma con tres personas. Una prueba de PDF que pasa no equivale a revisar visualmente todos los formatos impresos.

Evidencia: [inventario](/Users/luisfer/Desarrollo/CommUp-App/docs/diagnostico-itr-2026-10-23-evidencia/inventario.json), [comparación por código](/Users/luisfer/Desarrollo/CommUp-App/docs/diagnostico-itr-2026-10-23-evidencia/comparacion-catalogo.csv), [sondas](/Users/luisfer/Desarrollo/CommUp-App/docs/diagnostico-itr-2026-10-23-evidencia/sondas.json), [verificación SQL y uso](/Users/luisfer/Desarrollo/CommUp-App/docs/diagnostico-itr-2026-10-23-evidencia/verificacion-db.json), [pruebas](/Users/luisfer/Desarrollo/CommUp-App/docs/diagnostico-itr-2026-10-23-evidencia/tests.log).

## 3 Qué significa V2 o V3

Hay tres conceptos diferentes:

1. **Revisión de plantilla:** V1/V2/V3 de I01A, I10A, etc. Expresa su historia de cambios dentro de una organización.
2. **Versión del esquema de tabla:** `options.version: 1|2`. La versión 2 incorpora desviación calculada, resultados automáticos, as found/as left y filas procedentes de ingeniería.
3. **Versión del motor de CommUp:** código que interpreta ambas y controla captura/firma.

I10A **plantilla V3** todavía contiene cuatro tablas **esquema V1**. Por otra parte, una V1 del catálogo puede ser copia de una revisión mejorada de DEMO: las numeraciones son locales a cada organización. Para comparar calidad hay que comparar contenido, criterios y procedencia, no ordenar por versión.

## 4 Estado real de la biblioteca

Esta tabla utiliza únicamente los 302 códigos originales, no las plantillas adicionales o de QA:

| Indicador | Revisiones activas DEMO | Última revisión disponible DEMO |
|---|---:|---:|
| Códigos representados | 301 | 302 |
| Ítems | 6.950 | 5.993 |
| Casillas checkbox | 6.620 | 0 |
| Selecciones | 78 | 4.033 |
| Tablas | 2 | 144 |
| Ítems con foto obligatoria | 10 | 1.151 |
| Ítems con documento obligatorio | 0 | 51 |
| Plantillas con equipo de prueba obligatorio | 44 | 27 |

**298 de las últimas revisiones están inactivas.** De las 144 tablas de las últimas revisiones, 142 siguen en esquema V1 y dos usan V2. Las validaciones de estructura de tablas y mapas de resultados no encontraron configuraciones inválidas en esta población. Eso confirma compatibilidad de formato, no calidad industrial.

El catálogo tiene 301 de los 302 códigos originales y ninguno de sus ITR originales activos contiene tablas. M13B existe en DEMO como borrador, pero no aparece en el catálogo consultado. La biblioteca distribuible sigue rezagada respecto a los borradores.

La reducción de ítems puede representar una mejora: una matriz sustituye decenas de campos separados. No prueba, por sí sola, que se haya mantenido la cobertura técnica. El aumento de fotos también necesita criterio: 1.151 exigencias pueden mejorar evidencia o sobrecargar al inspector si se aplican indiscriminadamente.

## 5 Fortalezas que conservaría

### 5.1 Las decisiones ya pueden tener significado técnico

Las selecciones pueden representar `pass`, `fail` y `not_applicable`. Un rechazo configurado bloquea la firma; un N/A configurado exige justificación. Es un salto real respecto a marcar una casilla. Los textos traducidos no determinan el resultado: lo determina el mapa explícito.

### 5.2 La firma tiene controles en servidor

La [firma atómica](/Users/luisfer/Desarrollo/CommUp-App/supabase/functions-sql/sign_itr_atomic.sql:14) bloquea el ITR, comprueba asignaciones y secuencia, impide que una persona firme dos roles, vuelve a evaluar contenido y comprueba equipos de prueba y referencias documentales. Las firmas requeridas se congelan en la instancia. Esta es una base sólida para el núcleo.

No todos los ITR requieren tres firmas: los ejemplos consultados exigen ejecutor y supervisor. La necesidad de cliente debe ser una decisión explícita del proyecto/contrato; no conviene imponer tres firmas a todo ni perder la tercera al copiar una plantilla.

### 5.3 Las revisiones utilizadas protegen la evidencia

El contenido de una revisión asignada es inmutable y existe una operación de nueva revisión. Activar una revisión cambia la selección para nuevos ITR y actualiza la matriz equipo×ITR; no debería reescribir respuestas o firmas históricas. Debe conservarse esa separación.

### 5.4 El motor de tablas ya permite mejoras importantes

Calcula desviaciones, compara tolerancias, distingue as found/as left y recalcula valores derivados en lugar de confiar en los enviados por el cliente. También soporta filas tomadas del lazo o de la matriz C&E. Estas capacidades tienen pruebas; el trabajo pendiente es configurarlas correctamente en la biblioteca.

### 5.5 Hay una base para campo y trazabilidad

Captura offline, guardado progresivo, evidencia por ítem, revisión de documentos, equipo de prueba y exportación son piezas valiosas. La conservación de capturas rechazadas sigue siendo una condición necesaria, según el diagnóstico técnico previo.

## 6 Hallazgos prioritarios

### H1 — I30C V3 permite una contradicción en una prueba de efecto

**Confirmado con la configuración real y datos sintéticos en TypeScript y SQL.** En E.1 se puede consignar:

| Campo | Valor de la sonda |
|---|---|
| Ejecutó la acción | No |
| Confirmación en DCS | Conforme |
| Resultado | Conforme |
| Evaluación | Completa, sin rechazo |

La columna `executed` es una selección neutral, sin regla de rechazo ni coherencia con el resultado. El [evaluador de tablas](/Users/luisfer/Desarrollo/CommUp-App/src/lib/itr/table.ts:373) valida que “No” sea una opción permitida, pero no le asigna un efecto de aceptación.

**Acción recomendada:** representar la ejecución esperada con un resultado técnico o incorporar una regla explícita por columna; impedir que un efecto esperado no ejecutado termine conforme. Si el diseño permite acciones inhibidas o N/A, documentar la condición y aprobación correspondiente.

I30C V3 está activo en DEMO y tiene una instancia. No se inspeccionaron sus respuestas y no se afirma que esa instancia esté mal aprobada. El hallazgo afecta la capacidad de detectar la contradicción.

### H2 — I10A V3 todavía admite error manual incoherente

En 4.01, la sonda introdujo tres filas con salida esperada 12, observada 99, error 0 y resultado conforme. TypeScript y SQL devolvieron tabla completa sin rechazo. La columna `error` es numérica editable y `result` es manual; no hay fórmula ni tolerancia vinculada.

Esto no prueba aprobación de un ITR completo ni incumplimiento de una tolerancia específica: prueba que **el sistema no contrasta la coherencia de esos campos**. Un cambio de plantilla V2 a V3 no lo resuelve.

**Acción recomendada:** aprovechar las columnas calculadas y el resultado automático para las magnitudes que tengan criterio definido. Parametrizar rango, unidad, base del error, tolerancia y puntos contra ingeniería aprobada. No introducir un span universal ni copiar una tolerancia de ejemplo a todo el catálogo.

La capacidad actual guarda el span en la configuración de la tabla. Para una biblioteca reutilizable conviene resolver los parámetros por equipo/procedimiento y congelarlos en la instancia, con fuente y revisión. Las diferencias de unidad, transferencia o cálculo necesitan tratamiento explícito.

### H3 — Resultados opcionales en 94 tablas de los borradores

En las últimas revisiones de los 302 códigos, **94 tablas contienen alguna columna `result` opcional**. La sonda de E10B V2, M.1, completó los datos requeridos y dejó resultado vacío: el motor devolvió completa, sin rechazo.

No toda tabla documental necesita un resultado. Pero una matriz que pretende demostrar aceptación de ensayos debe definir qué decide el resultado y cuándo es obligatorio. Una validación de estructura no distingue esos propósitos.

**Acción recomendada:** clasificar tablas como registro informativo, evidencia de ensayo o decisión de aceptación. Exigir resultado/calificación calculada en las últimas dos cuando corresponda. Revisar las 94; no convertirlas todas a obligatorias sin considerar su función.

### H4 — 27 revisiones nuevas desactivan la exigencia nativa de equipo de prueba

Comparando cada revisión activa de DEMO con su última revisión, `requires_test_equipment` pasa de verdadero a falso en:

E03B, E04B, E05B, E07B, E10B, E11B, E13B, E13C, E14-1B, E15B, E17B, E18B, E20B, E22B, E34B, E41B, E42-1B, E47B, E48B, E50B, E54B, H50B, I28C, T02A, T03A, T07A y T08A.

La comparación inicial sin normalizar H50b contabilizaba 26; el inventario final incorpora H50B y da 27. El total global 44→27 es neto: otros borradores agregan el requisito.

**Acción recomendada:** revisar esos 27 cambios con el especialista de disciplina y mantener el requisito cuando el ensayo lo necesita. Una reducción puede ser deliberada, pero no debe pasar inadvertida en una activación masiva.

Además, **I10A V3 tiene `requires_test_equipment=false`**, aunque captura información del patrón en texto. Esos textos y un certificado adjunto no sustituyen la validación nativa de vigencia en fecha de uso. I01A V3 usa ambas vías, lo que genera captura duplicada.

### H5 — La importación puede degradar la plantilla al distribuirla

La pantalla de importación llama a `cloneTemplateInternal`. Su [consulta](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-templates.ts:553) y su inserción no incluyen `required_signatures` ni `requires_test_equipment`. La copia queda sometida a los valores predeterminados del destino, no a los requisitos de origen. La huella de “al día” [solo compara secciones e ítems](/Users/luisfer/Desarrollo/CommUp-App/src/lib/itr/clone.ts:62), por lo que tampoco detecta esos cambios de encabezado.

Existe una [RPC de clonación](/Users/luisfer/Desarrollo/CommUp-App/supabase/functions-sql/clone_itr_template_from_catalog.sql) que sí copia ambos campos, pero la vía de la pantalla revisada no la utiliza. El script `sincronizar-catalogo.mjs` presenta la misma omisión de campos.

También hay riesgo de copia parcial: la vía de aplicación inserta encabezado, secciones e ítems por separado; para códigos nuevos el encabezado ya nace activo. Si una operación posterior falla, no hay una transacción que revierta el conjunto. Los errores al remapear condiciones no se comprueban en esa vía.

**Acción recomendada:** unificar el recorrido en una operación transaccional, preservar requisitos/procedencia/condiciones/matriz y verificar equivalencia después de copiar. Ampliar la comparación para incluir metadatos que cambian la ejecución. Esto debe preceder a distribuir masivamente las V2/V3.

### H6 — El alcance de continuidad todavía lo declara el ejecutor

I01A V3 pide D.4, número de conductores o pares, y después permite configurar la continuidad. El [evaluador de continuidad](/Users/luisfer/Desarrollo/CommUp-App/src/lib/itr/continuity.ts:16) comprueba todas las filas de la cantidad declarada en la propia captura, pero no la compara con D.4 o el listado maestro.

Una captura de un conductor sin lectura es válida si se declara `measurementRequired=false`. Eso puede ser correcto para un caso particular; no acredita que se hayan probado todos los conductores de un cable distinto ni que se haya aplicado el procedimiento correcto.

**Acción recomendada:** derivar cantidad, agrupación, pantallas, terminales y exigencia de lectura desde ingeniería/procedimiento cuando exista. Hacer visibles las discrepancias y exigir resolución. Aplicar el mismo principio a puntos de calibración y ciclos: cantidad capturada y alcance requerido deben concordar.

### H7 — As found y as left deben ser conceptos del motor

I10A V3 tiene lecturas iniciales y posteriores al ajuste, pero ambas tablas conservan resultados manuales de esquema V1. Un `fail` inicial bloquea la firma aunque el equipo se ajuste correctamente después. Cambiar el resultado inicial a conforme para poder cerrar destruiría la veracidad del ensayo.

**Acción recomendada:** conservar el resultado inicial fuera de tolerancia como evidencia y decidir la aceptación final con el estado posterior y el procedimiento. El motor V2 ya ofrece esa distinción; debe configurarse y probarse. No se debe sobrescribir la evidencia inicial.

### H8 — Configuración válida no significa plantilla homologada

La activación verifica presencia de ítems y opciones de selección, pero no aporta una revisión técnica completa: cobertura del original, resultados opcionales, equipo de prueba, consistencia de respuestas y tolerancias aplicables.

**Acción recomendada:** añadir una revisión previa a la publicación que diferencie errores bloqueantes, advertencias y decisiones técnicas. Publicar una ficha por plantilla con cobertura, cambios, responsable técnico y pruebas. Una selección descriptiva puede ser neutral; una decisión de aceptación debe estar identificada como tal. No deducir rechazo únicamente del texto “No”.

### H9 — Riesgos transversales que siguen afectando al CORE

El [reporte técnico previo](/Users/luisfer/Desarrollo/CommUp-App/docs/REVISION-CRITICA-COMMUP-2026-10-23.md) documenta descarte de capturas tras reintentos, falta de idempotencia de fotos y creación de ITR/asignaciones en operaciones separadas. Son problemas de confiabilidad del ITR aunque su plantilla sea excelente. Esta revisión no los declara corregidos ni repite toda la batería anterior.

**Acción recomendada:** resolver conservación de evidencia y creación transaccional antes de ampliar uso de campo. El diagnóstico de contenido y el endurecimiento del motor deben avanzar coordinadamente.

## 7 Veredicto por plantilla/familia

| Plantilla | Fortaleza comprobada | Condición pendiente | Recomendación |
|---|---|---|---|
| I04A V2 | Ocho controles con resultados explícitos; conserva referencias/fecha | Numerar ítems auxiliares, definir evidencia necesaria, recorrido y PDF reales | Conservar; patrón de inspección simple |
| I06A V2 | Diecisiete controles estructurados; redacción más clara | Política de fotos y referencias; ninguna foto es obligatoria hoy | Conservar; patrón de inspección simple |
| I01A V3 | 25 ítems frente a 28; calibre alfanumérico; cinco fotos y un documento obligatorios | Cantidad de continuidad ligada a ingeniería, eliminar duplicación de equipo patrón, referencias nativas | Candidato preferente tras ajustes y validación |
| I10A V3 | 58 ítems frente a 117; cuatro tablas, accesorios, correcciones y cinco soportes obligatorios | Cálculo/criterios, as found/as left, equipo patrón nativo, puntos y coherencia de decisión | Adoptar su estructura, completar lógica antes de activar |
| I29C V3 | Filas por señales del lazo y referencias de ingeniería; ya activa, una instancia | Lecturas/unidades/criterios por tipo de señal; lecturas aplicadas y DCS hoy opcionales | Mantener y reforzar según procedimiento |
| I30C V3 | Filas por efectos de C&E; ya activa, una instancia | Corregir H1; decidir tiempo requerido/límite y restauración según procedimiento | Prioridad de corrección; no usar como patrón cerrado todavía |
| I05A/I11A V2, P03A V2, E32A V2 | Estructuras de ensayo más útiles que listas planas | Fórmulas y criterios reales; equipo de prueba y resultados | Migración por familia de ensayo |
| V2 generadas automáticamente | Cobertura estructurada, selecciones, numeración y evidencias | Revisión humana de registros, unidades, fotos, columnas y requisitos | Aprobar por lotes; no activación global |

I01A V3 e I10A V3 no tienen instancias en DEMO al momento de consultar. Esto permite revisar los borradores con menor costo, pero no significa que cualquier cambio sea correcto. Las V2 activas de I01A/I04A/I06A/I10A también tienen cero instancias en esa organización; no se extrapola a otras organizaciones.

## 8 Cómo debería sentirse un ITR en campo

El inspector debería ver siempre **proyecto, sistema, tag/lazo/causa, código y revisión**, junto con el estado de sincronización. El recorrido debe ayudar a ejecutar una prueba concreta:

1. Confirmar identidad, alcance, referencias y procedimiento vigente.
2. Verificar prerrequisitos y seleccionar equipo de prueba válido.
3. Ejecutar controles y registrar lecturas con unidades visibles.
4. Obtener resultado calculado donde corresponda; registrar hallazgos y evidencia.
5. Revisar exactamente qué falta, qué falló y qué N/A requiere justificación.
6. Enviar a revisión/firma con evidencia sincronizada o estado pendiente explícito.

Conviene separar visualmente **diligenciado, conforme y aprobado**. Un 100 % de captura con rechazo debe ser inequívoco. Evitar doble decisión: “Aceptado por inspector” como ítem y después firma de aprobación deben tener responsabilidades claras, o consolidarse.

Las tablas actuales usan desplazamiento horizontal, muchos campos de 12 px y columnas con mínimo de 90 px. Para matrices de hasta 16 columnas, propongo una vista móvil por punto/efecto, conservando la matriz para escritorio y revisión. Es una propuesta basada en código; falta observar su uso real con guantes, sol, interrupciones y mala red.

No replicaría datos del tag, del equipo patrón o de documentos como texto libre cuando existe registro nativo. Debe quedar claro qué proviene de ingeniería congelada, qué observó el ejecutor y qué cambió durante la prueba.

## 9 Propuesta de implementación por etapas

### Etapa 1 — Cerrar contradicciones y regresiones

- Corregir H1 de I30C y agregar el caso contradictorio como prueba de regresión TS/SQL.
- Revisar los 27 cambios de equipo de prueba y configurar correctamente I10A.
- Corregir importación y comparación entre organizaciones, con copia atómica y verificación de requisitos.
- Clasificar las 94 tablas con resultados opcionales.
- Coordinar las correcciones offline y creación transaccional ya identificadas.

**Salida:** ningún caso reproducido puede pasar inadvertido; una copia conserva reglas y una operación fallida no deja plantilla activa parcial.

### Etapa 2 — Homologar seis referencias

Usar I04A/I06A para listas, I01A para continuidad, I10A para calibración, I29C para lazos e I30C para enclavamientos. Conservar lo que ya funciona y corregir cada brecha. Registrar por control: fuente, requisito, captura, criterio y evidencia.

**Salida:** cada referencia pasa ejecución conforme, rechazo, obligatorio vacío, N/A, límites, evidencias faltantes, equipo vencido, condiciones, revisión documental, firma por roles, reintento offline y exportación verificable. Los casos no aplicables a una familia se justifican.

### Etapa 3 — Extender por familias

Agrupar por comportamiento: inspección visual, continuidad, calibración, aislamiento, presión/fuga, alineación/torque/vibración, lazos y C&E. Revisar en lotes manejables los 302 códigos originales y los adicionales que se decida incluir. No fijar esfuerzo por número de versión: una matriz compleja requiere más revisión que una lista breve.

**Salida:** ficha aprobada por plantilla; no controles originales perdidos sin decisión documentada; redacción, unidades y evidencia adecuadas. Tener todo el catálogo disponible sigue siendo compatible con una homologación progresiva y un estado de validación visible.

### Etapa 4 — Activar y distribuir con trazabilidad

- Guardar comparación entre revisión activa y candidata, incluyendo metadatos de firma/equipo.
- Activar únicamente candidatos homologados para nuevas asignaciones.
- Mantener instancias históricas ligadas a su revisión; tratar una eventual sustitución mediante flujo explícito.
- Actualizar catálogo y organizaciones mediante la vía corregida, comprobando contenido, procedencia y matriz.
- Observar un lote real: tiempos, campos repetidos, rechazos, ayudas requeridas, recuperación offline y aceptación del PDF por el receptor.

**Salida:** adopción comprobada y posibilidad de volver a seleccionar la revisión anterior para nuevas instancias, sin reescribir evidencia ya ejecutada.

## 10 Decisiones de ingeniería necesarias

Para cerrar calibración y pruebas complejas se necesitan fuentes concretas de rango, unidades, tolerancias, cantidad/secuencia de puntos, condiciones iniciales/finales y vigencia de equipos. También definir qué firmas exige cada alcance y qué N/A es admisible.

No es necesario detener el trabajo técnico para pedir todas esas decisiones a la vez. Primero se corrigen las inconsistencias objetivas y se prepara una ficha de parámetros por familia. Lo que dependa de ingeniería queda identificado con su fuente pendiente, sin inventar valores ni convertir ejemplos del software en criterios industriales.

**Respuesta a “¿implementamos V2/V3?”:** sí, avanzaría hacia las revisiones mejoradas, comenzando por las referencias anteriores y sus correcciones. No publicaría todo por ser más nuevo. El objetivo es que la versión adoptada demuestre mejor cobertura, menor duplicación y decisiones más confiables que la anterior.

## 11 Reproducibilidad y límites

El [script local de análisis](/Users/luisfer/Desarrollo/CommUp-App/docs/diagnostico-itr-2026-10-23-evidencia/analizar.mjs) genera inventario, comparación y sondas a partir de la captura local. No contiene credenciales ni accede a la red. La captura completa permanece en `insumos-locales/diagnostico-itr-2026-10-23/plantillas.json`; los archivos de evidencia versionables contienen agregados y casos sintéticos.

Los hallazgos H1–H3 tienen reproducción de evaluador, no una demostración de firma indebida de una instancia completa. H4 es comparación de datos. H5 es revisión del recorrido de código, sin importar plantillas reales como experimento. H6 reproduce el límite de validación autónoma de continuidad. H7–H8 derivan de la configuración y las reglas inspeccionadas. H9 remite a evidencia previa. Estas distinciones deben mantenerse al priorizar y comunicar las correcciones.
