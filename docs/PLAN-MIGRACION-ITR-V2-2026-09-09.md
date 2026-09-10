# Revisión de las plantillas v2 y plan de migración del catálogo ITR

Fecha: 9 de septiembre de 2026, 17:35 (Bogotá). Organización analizada: DEMO Refinería Los Andes (AUTOTEST), la única donde se publicaron v2. Evidencia: consultas directas a Supabase (prod), diff del código sin commit, originales extraídos en `insumos-locales/revision-itr/lote-completo/` y la entrega `entrega-commup-2026-09-09/`.

Este documento no certifica validación industrial de ningún formato. Distingue lo que está publicado, lo que está probado y lo que falta.

---

## 1. Veredicto corto

- **I06A v2 y I04A v2 están bien.** Cubren los 17 y 8 controles originales, con selección estructurada (Conforme=pass, No conforme=fail, No aplica=not_applicable con justificación). Son el patrón correcto para la familia «lista de chequeo pura», que es el 56 % del catálogo.
- **I01A v2 es la más completa** (referencias, datos del cable, 8 selecciones, continuidad por conductor/pantalla, equipo de prueba, observaciones). Tiene tres detalles a corregir (numeración, pares número+unidad, calibre AWG).
- **I10A v2 NO es el patrón a seguir todavía.** Fue publicada a las 15:26, antes de que existieran los resultados por opción (migración de las 19:00). Sus 31 selecciones no tienen efecto: un «Rechazado» del inspector o un «No conforme» en un punto de calibración no bloquea nada y «No aplica» no exige justificación. Además tiene brechas de cobertura respecto al original (bloque CORRECTIONS, tabla de accesorios, material mojado) y depende de referencias en texto a adjuntos que la aplicación no permite subir (solo imágenes).
- **Efecto colateral no detectado hoy:** al publicar las cuatro v2, la matriz equipo×ITR (`equipment_type_templates`) quedó apuntando a las v1 inactivas. 39 filas (I01A 16, I10A 21, I04A 1, I06A 1) y ninguna a las v2. La sugerencia automática de estos cuatro ITR está rota desde esta tarde.
- **El catálogo restante (306 plantillas en DEMO, 302 en Ecopetrol) es 95 % casillas.** 294 de 310 plantillas son solo checkbox. No hay unidades (43 ítems de 7 140), no hay fotos requeridas (0), no hay condiciones fuera de I10A, no hay resultados por opción fuera de las tres v2 nuevas.

---

## 2. Estado de las cuatro plantillas v2

| Código | Revisión activa | Secciones / ítems | Cobertura del original | Resultados por opción | Condiciones | Hallazgos |
|---|---|---|---|---|---|---|
| I01A | `21919300…` v2 | 4 / 28 | 9/9 controles + datos del cable + equipo de prueba | 8/8 selects | 0 | 19 ítems sin `item_number`; 4 magnitudes como par número+texto; calibre no puede ser numérico |
| I04A | `a76d37e3…` v2 | 3 / 11 | 8/8 | 8/8 | 0 | Ninguno relevante |
| I06A | `c5e1d373…` v2 | 3 / 19 | 17/17 | 17/17 | 0 | Ninguno relevante |
| I10A | `191dbc03…` v2 | 9 / 117 | Parcial (ver 2.4) | **0/31** | 74 | Ver 2.4 |

Las cuatro v1 siguen inactivas con sus ítems intactos y cero ITR asignados. Ecopetrol conserva sus propias v1 activas (no se replicó nada).

### 2.1 I01A v2 — detalle

Lo que está bien: referencias documentales y procedimiento como texto requerido; controles 1–4 y 6–9 como selección con resultado; control 5 como tipo `continuity` (pares/conductores, pantallas, terminales, resultado, lectura/unidad si el procedimiento lo exige); equipo de prueba con vencimiento y certificado; observaciones opcionales. Probado en QA con PDF.

A corregir en la siguiente revisión:

1. **Numeración perdida.** Solo los 9 selects tienen `item_number`; los otros 19 ítems están en null. El original numera 1.0–10.0. En PDF y en Punch List la referencia «ítem 2.3» desaparece.
2. **Pares número + unidad.** Tensión, diámetro, sección y longitud son 8 ítems (4 `number` + 4 `text` «unidad o sistema de designación»). Es correcto no fijar unidades por inferencia, pero el patrón obliga a dos capturas por dato. Propuesta: `measurement` con la unidad de ingeniería precargada cuando exista listado de cables, y `text` único «valor y designación» donde la designación es alfanumérica.
3. **Calibre AWG.** El ítem 7 («sección o calibre nominal») es `number`; «AWG 18» o «1.5 mm² / 16 AWG» no cabe. Debe ser `text` o `measurement` solo cuando la ingeniería use mm².
4. **Datos del cable duplicados.** La tabla `cables` ya tiene `cable_type`, `size`, `length_m`, `from_tag_id`, `to_tag_id`. Mientras el ITR se ejecute por tag y no por cable, la captura manual es de contraste; hay que decidir si el cable se importa como tag (decisión previa «todo es tag») y entonces autollenar.

### 2.2 I04A v2 — detalle

Cobertura completa. Añade referencia documental y fecha de prueba como campos reales (mejora explícita de CommUp). Sin tolerancias inventadas. Solo falta la validación funcional en una asignación representativa y el PDF de esta plantilla concreta.

### 2.3 I06A v2 — detalle

Cobertura completa, redacción bilingüe corregida (strapped = sujeto, plugged = obturado; 15/16 visuales). Igual que I04A: falta ejecución y PDF reales.

### 2.4 I10A v2 — detalle

Estructura aprobada por Luis (9 secciones). Lo que hoy no funciona o no cubre:

1. **31 selecciones sin `option_outcomes`.** Afecta a 3.01–3.05 (Conforme/No conforme/No aplica), a los 9 «Resultado» por punto (4.07, 4.13…), a 7.08, 8.06 y sobre todo a **9.01 «Decisión del inspector»** (Aceptado/Rechazado/Requiere información). Con el evaluador actual, un ITR «Rechazado» queda diligenciado al 100 % y firmable. Es la corrección más urgente y es de datos, no de código.
2. **Matriz de 9 puntos aplanada en 54 ítems** (sentido, entrada, salida esperada, salida observada, error, resultado × 9), todos opcionales, sin control de cardinalidad. La conciliación es un texto libre (4.56). No hay forma de exigir «los 5 puntos del procedimiento» ni de calcular el error.
3. **Mediciones sin unidad.** 4.03–4.05 y 5.03–5.06 son `measurement` con `unit` vacío (la unidad va en texto 2.03 / 5.01) y sin `acceptance_min/max`. La evaluación SQL de aceptación por rango nunca se dispara. Es coherente con «no imponer tolerancias», pero entonces el «Resultado» por punto debe ser una selección con efecto (punto 1).
4. **Referencias a adjuntos que no se pueden adjuntar.** 4.01, 5.09, 6.03, 8.01, 8.02 y 8.04 piden «nombre del archivo adjunto». La ejecución solo acepta imágenes (`accept="image/*"` en ItrExecution.tsx:455 y PhotoUpload) y no existe tipo de ítem «documento». Un certificado PDF del patrón no se puede subir al ITR.
5. **Cobertura del original incompleta.** Faltan como campos estructurados: los 8 controles originales se comprimieron en 5 (proceso, eléctrico, lubricado/obturado, hidráulico, neumático se fundieron en «conexiones aplicables»); la tabla ACCESSORIES (tag + acción); «Wetted material»; y todo el bloque CORRECTIONS (elevación, supresión, alarma/disparo ascendente y descendente, falla de sensor upscale/downscale, extracción de raíz cuadrada). La sección 6 «Ajustes» es texto libre. La entrega de hoy ya lo marca como «contraste integral pendiente»; aquí queda la lista concreta.
6. **Datos maestros duplicados.** 1.03–1.06 (fabricante, modelo, serie, hoja de datos) y 2.01–2.03 (rango y unidad) existen en `tags` (`manufacturer`, `model`, `serial_number`, `datasheet_number`, `range_min`, `range_max`, `eng_unit`). Deberían mostrarse de solo lectura y, como mucho, pedir un «coincide / no coincide».
7. **Redundancia con riesgo.** 1.07 «Tipo de instrumento» (Transmisor/Transductor/Interruptor) y 1.09 «Tipo de registro» (Continuo/Interruptor) pueden contradecirse; todas las condiciones cuelgan de 1.09. Basta uno.
8. **Forma.** `title_es` vacío; secciones numeradas «1. …» mientras I01A/I06A no numeran; huecos de numeración (1.01, 9.03, 9.05 retirados). Menor, pero el estándar v2 debe fijarlo.

Conclusión: I10A v2 es un prototipo estructural válido, no un patrón replicable. El patrón replicable hoy son I06A (lista de chequeo) e I01A (datos + chequeo + tabla).

---

## 3. Estado del arte del catálogo (DEMO, consulta directa)

| Métrica | Valor |
|---|---|
| Plantillas / activas | 310 / 303 (302 del catálogo + 4 v2 + 3 QA inactivas + 1 LCT-FT) |
| Ítems totales | 7 140 |
| Ítems checkbox | 6 808 (95,4 %) |
| Plantillas solo checkbox | 294 |
| Ítems con unidad | 43 |
| Ítems con foto requerida | 0 |
| Ítems condicionales | 74 (todos en I10A v2) |
| Selecciones con resultado por opción | 34 (I01A 8, I04A 8, I06A 17, QA 1) |
| Plantillas con más de una revisión | 4 |
| Plantillas con ITR asignados | 7 (E14-1B, I03A, I05A, LCT-FT y 3 QA) |
| Filas de matriz equipo×ITR | 420, de las cuales 39 apuntan a v1 inactivas |
| Ecopetrol | 302 plantillas v1 activas, copia paralela sin tocar |

Por disciplina (código inicial): E 75, H 28, I 38, L 14, M 98, P 21, Q 10, T 24, X 2.

### 3.1 Familias estructurales de los 302 originales

Clasificación heurística sobre el texto extraído (cabecera de datos = campos «Manufacturer/Rated/Voltage…»; matriz = «Calibration check, Insulation resistance, Phase, Torque, Reading…»). Sirve para dimensionar, no sustituye el contraste tabla por tabla.

| Familia | Cantidad | Dónde | Patrón v2 de referencia | Qué necesita el software |
|---|---|---|---|---|
| Lista de chequeo pura | 169 (56 %) | M 80, H 22, I 18, T 14, L 12, E 9, P 9, Q 3, X 2 | **I06A** | Nada nuevo |
| Datos + lista de chequeo | 28 | E 15, T 7, I 5, H 1 | **I01A** (sin tabla) | Autollenado desde tag |
| Lista + matriz de medición | 44 | M 14, P 10, E 3, H 5, I 5, Q 4, T 2, L 1 | I01A (continuidad) | Tipo tabla genérico |
| Datos + lista + matriz | 61 | **E 48**, I 6, M 4, P 2, T 1 | I10A corregida | Tabla genérico + autollenado + adjunto documental |

Los mapeos de hoy (`mapeos-*/`, 302 JSON, cobertura 302/302) son narrativos; las `estructuras/*.json` sí conservan tablas con celdas, fusiones y cabecera/pie separados. Esa es la fuente para automatizar, no el texto plano ni las v1.

---

## 4. Brechas del software que condicionan la v2

Ordenadas por impacto en la migración.

1. **Matriz equipo×ITR no sigue la revisión.** `publishTemplateVersion` no re-apunta `equipment_type_templates.itr_template_id`. Hoy: 39 filas huérfanas. Fix inmediato por SQL + fix en código.
2. **«Publicar nueva versión» no sirve para el lote.** En itr-templates.ts:239: sin ITR asignados incrementa la versión en el mismo registro (se pierde la v1 como histórico); con asignados crea copia activa **omitiendo `title_es` y `equipment_type_id`** (insert de la línea 305), desactiva la anterior antes de terminar de copiar y no es transaccional. Las tres publicaciones de hoy se hicieron con scripts propios (`preparar-*.mjs`) precisamente por esto. Se necesita una RPC atómica `publish_itr_template_revision(p_template_id)` que copie todo, cree siempre una revisión nueva inactiva, active/desactive en la misma transacción y re-apunte la matriz.
3. **No hay tipo tabla.** `continuity` es un caso especial con JSON en `value_text`. Calibración por puntos, resistencia de aislamiento por fase, torques, pruebas de presión, ciclos de interruptor: todas necesitan filas × columnas declaradas. Generalizar el mismo mecanismo (JSON validado en TS y SQL, congelado con firmas, tabla en PDF) a un tipo `table` con esquema de columnas en `options`.
4. **Solo adjuntos de imagen.** No existe evidencia documental (PDF de certificado, registro del contratista). Hace falta `requires_document` o tipo `document` con `file_type` application/pdf y validación en el evaluador.
5. **Sin autollenado desde el tag.** `tags` tiene fabricante, modelo, serie, rango, unidad, hoja de datos, P&ID. La ejecución no los muestra ni los contrasta.
6. **Sin vínculo entre ITR.** I05A depende de que I10A esté aceptado para el mismo tag. Una condición local no lo consulta.
7. **Ítem `signature` no ejecutable y preview sin condiciones.** Ya documentado hoy; no bloquea la migración pero confunde al editor.
8. **Modelo de repositorio indefinido.** `is_global` existe y tiene 0 filas. Ecopetrol tiene su copia. Hay que decidir dónde vive el catálogo maestro y cómo llega a cada organización (`cloneTemplateToActiveOrg` ya existe).

---

## 5. Estándar «v2» propuesto

Para que «a la altura de» signifique algo verificable. Toda plantilla v2 cumple:

- **Cabecera:** `code` del original, `title` EN y `title_es` ES propios de CommUp, fase, disciplina y `equipment_type_id` cuando aplique. `description` con la nota de alcance y la fuente (código Word, revisión, fecha).
- **Secciones en orden fijo:** Referencias de ejecución → Datos del elemento (solo si el original los tiene y no vienen del tag) → Inspección → Registro de ensayo (tabla) si aplica → Equipo de prueba si aplica → Observaciones.
- **Numeración:** `item_number` conserva el del original (1.0, 2.0…). Los ítems añadidos por CommUp usan sufijo (R.1 referencias, T.1 equipo de prueba, O.1 observaciones) para distinguir lo original de la mejora.
- **Verificaciones:** `select` Conforme / No conforme / No aplica con `option_outcomes` pass/fail/not_applicable. Nunca checkbox para una decisión de aceptación. `yes_no` solo para hechos donde «No» es válido.
- **Magnitudes:** `measurement` con `unit` del original cuando está impreso; `text` «valor y designación» cuando la designación es alfanumérica; `acceptance_min/max` solo si el original o la ingeniería del proyecto lo fijan. Nunca tolerancias inferidas.
- **Tablas:** tipo `table` (o `continuity`) con filas y columnas del original; nunca aplanar en N ítems.
- **Evidencia:** `requires_photo` en los puntos que el original o el procedimiento exigen ver; `requires_document` para certificados y registros del contratista.
- **Datos maestros:** tag, descripción, sistema, fabricante, modelo, serie, rango, P&ID y firmas son nativos. No se recrean como ítems; como mucho un `select` «coincide con el tag».
- **Bilingüe:** `description` EN y `description_es` ES, ambas redactadas (no copiadas del original CB&I).
- **Cierre:** no hay ítem de decisión final; la aceptación es la secuencia nativa ejecutor → supervisor → cliente. Un `fail` en cualquier selección o fila bloquea la firma.

---

## 6. Plan de migración

Sin estimación en jornadas: la entrega de hoy pide medir con los primeros lotes. Cada fase tiene criterio de salida.

### Fase 0 — Cerrar el software y las cuatro v2 — ✅ COMPLETADA (2026-09-09, 18:10)

| # | Tarea | Estado | Evidencia |
|---|---|---|---|
| 0.1 | Matriz equipo×ITR sigue a la revisión activa | ✅ | 39 filas re-apuntadas a las v2 (SQL); `activate_itr_template_revision` re-apunta siempre |
| 0.2 | I10A v2: resultados por opción | ✅ | 17 selecciones con pass/fail/not_applicable (3.01–3.05, 9 «Resultado», 7.08, 8.06, 9.01). Rechazado y «Requiere información» bloquean la firma; «No ejecutado» exige justificación |
| 0.3 | RPC atómica de revisiones | ✅ | `create_itr_template_revision` (borrador inactivo v+1, copia completa, condiciones re-mapeadas) + `activate_itr_template_revision`. Probado en prod: copia de I10A idéntica (hash), activar/revertir I06A, borrado del borrador. Botón: «Nueva revisión (borrador)» / «Activar esta revisión». Se corrigió además el guard que impedía borrar plantillas con ítems |
| 0.4 | Evidencia documental (PDF) por ítem | ✅ | `requires_document` en evaluador TS+SQL, editor, ejecución (solo con red), backup, PDF; bucket admite application/pdf |
| 0.5 | Datos del tag de solo lectura | ✅ | Bloque desplegable en la ejecución y filas en la cabecera del PDF (fabricante, modelo, serie, rango, hoja de datos, P&ID, caja) |
| 0.6 | Tipo `table` genérico | ✅ | `src/lib/itr/table.ts` + `evaluate_itr_table` SQL (mismas reglas), editor con 5 presets (calibración, aislamiento, interruptor, especificado vs. medido, presión), captura, PDF, preview. Filas fijas o variables, columnas número/texto/selección/resultado, min/max opcionales. Aún no aplicado a I10A (Fase 1) |
| 0.7 | Commit + push | ✅ | c89ad86 (trabajo del día), 00780e0 (0.1–0.5), siguiente commit (0.6) |

Migraciones aplicadas en prod: 20260909230000 → 20260909251000 (+ `itr_option_outcomes_list_shape`). Verificación en navegador pendiente (requiere sesión): probado por pruebas unitarias (168), evaluadores SQL en prod y build.

### Estado al cierre del 2026-09-09

Fase 0 completa. Fase 1: I10A v3 e I01A v3 como borradores inactivos para revisión; I06A v2 e I04A v2 ratificadas. Fase 2 completa para las cuatro familias: 262 borradores inactivos (C 98, C+V 75, D 45, M 30, DM 14) generados con `scripts/itr-v2/generar-v2-listas.mjs` a partir de las tablas del Word; informe con enlaces en `docs/ITR-FASE2-LOTE-2026-09-09.md`. Quedan ~35 formatos para diseño manual (listados como bloqueados en el informe) y la Fase 6 (organización catálogo + clonación, regenerar Ecopetrol). Regla operativa: el generador crea siempre version max+1; no re-ejecutar `--apply` sobre una familia ya generada.

### Fase 1 — Fijar el estándar con tres referencias

- I06A v2 se ratifica como referencia de «lista de chequeo». Solo se le añade `item_number` original y política de fotos.
- I01A v3 corrige numeración, pares número+unidad y calibre; referencia de «datos + chequeo + tabla».
- I10A v3 sobre el estándar: 8 controles originales, tabla de accesorios, bloque CORRECTIONS estructurado, matriz como tabla, adjuntos reales, datos del tag nativos. Referencia de «datos + chequeo + matriz».
- I10A v3 usa el tipo `table` (preset «Calibración por puntos») en lugar de los 54 ítems aplanados, y `requires_document` en 7.05/8.01/8.02/8.04.
- Los tres pasan la prueba mínima del PLAN-MANUAL (captura, obligatorio vacío, rechazo, NA, PDF, firmas con tres usuarios distintos).

Salida: tres plantillas con «Revisión técnica conforme» en CONTROL-CATALOGO y el estándar de la sección 5 aprobado por Luis.

### Fase 2 — Familia «lista de chequeo» (169 plantillas), semiautomática

1. Script `generar-v2.mjs` que lee `estructuras/{codigo}.json` (no el texto ni la v1), separa cabecera/pie, toma la tabla de cuerpo y produce un backup CommUp con: sección Referencias (R.1), N selects con outcomes y `item_number` original, descripción EN/ES desde las celdas bilingües, sección Observaciones (O.1).
2. Revisión humana por lote de 10–15 del mismo prefijo (M, H, T, L, X, Q, y las 9 E / 18 I / 9 P de esta familia): redacción ES, puntos que exigen foto, puntos que en realidad son magnitud (el I07A «resistencia de barra a tierra» es el ejemplo: detectar por palabras clave «record/registrar/value/Ω»).
3. Publicación con la RPC en revisión inactiva → activación por lote → anotación en CONTROL-CATALOGO.

Orden sugerido: primero los códigos del alcance GeoPark, después M (98, casi todo esta familia), H, T, L, P, Q, X.

### Fase 3 — Familia «datos + chequeo» (28)

Igual que Fase 2 más el bloque de datos: cada campo de cabecera del original se mapea a un campo del tag (autollenado, sin ítem) o a un `measurement`/`text` con unidad impresa. E 15 y T 7 concentran esta familia (motores, transformadores, tableros).

### Fase 4 — Familias con matriz (105)

Requiere 0.6. Se hace por **tipo de matriz**, no por plantilla, porque una misma tabla se repite:

| Tipo de tabla | Plantillas típicas | Columnas |
|---|---|---|
| Calibración por puntos | I05A, I10A, I11x, LCT | punto, sentido, entrada, salida esperada, salida observada, error, resultado |
| Resistencia de aislamiento | E (motores, cables, transformadores, tableros) | par de fases/tierra, tensión de prueba, lectura, unidad, tiempo, resultado |
| Continuidad | I01A, E cables | ya existe |
| Interruptor actuación/reposición | I10A sec. 5, I12x | ciclo, sentido, especificado, observado, estado de contacto, resultado |
| Torque / alineación / vibración | M, P | elemento, especificado, medido, unidad, resultado |
| Prueba de presión / fuga | P, I03A, I09A | medio, presión, duración, caída, criterio, resultado |
| Prueba de lazo | I33C | mando DCS, indicación HMI, posición real, retorno |

Cada tipo se define una vez (esquema + validación + PDF), se prueba en una plantilla y se replica. E (48 con datos + matriz) es el bloque más pesado y el más repetitivo.

### Fase 5 — Excepciones y dependencias

I33C (lazo de válvula), I05A↔I10A (dependencia entre ITR del mismo tag: necesita consulta al ITR aceptado o un `select` «I10A aceptado: referencia» verificado por el supervisor), I02A (fórmula de espesor ligada a DN, no universal), contradicciones de originales, unidades ausentes. No frenan las otras fases.

### Fase 6 — Repositorio y despliegue a organizaciones

Decidir modelo (organización catálogo + clonación, o `is_global`), regenerar la copia de Ecopetrol desde el catálogo v2 conservando sus v1 inactivas, y dejar el flujo de «Publicar revisión» como único camino (retirar los scripts `preparar-*.mjs`).

---

## 7. Decisiones — respondidas por Luis (2026-09-09, 19:40)

| # | Decisión | Respuesta |
|---|---|---|
| 1 | I10A corregir en sitio o v3 | En sitio los outcomes (hecho); v3 completa en Fase 1 |
| 2 | Tipo tabla genérico | Sí (hecho) |
| 3 | Adjunto documental | Sí (hecho) |
| 4 | Autollenado desde tag | **Sí, desde el listado maestro cargado por Excel.** La plantilla Excel de tags debe incluir fabricante, modelo, serie, hoja de datos/revisión, P&ID, rango y unidad para digitarlos ahí. Las plantillas v3 eliminan los ítems duplicados. |
| 5 | Política de fotos | **Definir por ítem.** Regla propuesta (sección 7.1) aplicada a las tres referencias; Luis ajusta. |
| 6 | Alcance piloto GeoPark | **Todo el catálogo disponible para elegir por proyecto.** No hay subconjunto piloto; se migra completo, por familia. |
| 7 | Modelo de repositorio | **Biblioteca de formatos**: organización catálogo + clonación; el administrador o arquitecto llama a los formatos requeridos por proyecto. |

### 7.1 Regla de fotos propuesta

`requires_photo` se marca por defecto en los controles que verifican algo visible cuya evidencia no puede reconstruirse después:

- Identificación / placa / marcado del elemento (nameplate, labels, cable markers).
- Ausencia de daños mecánicos o de revestimiento.
- Puesta a tierra y conexión de pantallas/armaduras.
- Entradas de reserva obturadas, sellos y cierre de cajas/gabinetes.
- Estado final instalado (montaje, soportes, nivelación) cuando el control lo describe.

No se marca en: referencias documentales, datos de ensayo (tablas), equipo de prueba, observaciones, ni en controles cuya evidencia es un documento (ahí va `requires_document`). Un control puede llevar ambos si el original lo exige.

## 8. Referencias

- Plantillas: I01A `21919300-0f71-411e-913b-bfbec7c806ac`, I04A `a76d37e3-e858-4e61-a66d-fecbd1c337bf`, I06A `c5e1d373-b8db-431b-b12b-6624b3da8700`, I10A `191dbc03-b733-49be-9a3b-8b9b33e2be08`.
- Código: `src/app/actions/itr-templates.ts` (publishTemplateVersion, línea 239), `src/lib/itr/{completion,continuity,selection-outcome}.ts`, migraciones `20260909180000`–`20260909220000`.
- Entrega previa: `entrega-commup-2026-09-09/LEEME-ESTADO-Y-PENDIENTES.md` y `PLAN-MANUAL-DE-ACTUALIZACION.md`, `CONTROL-CATALOGO.csv`.
- Suite: 161 pruebas pasan, 11 omitidas (DB), ejecutada a las 17:31.
