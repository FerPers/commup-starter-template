# Fase 1 — Revisión de las referencias I10A v3 e I01A v3 — 2026-09-10

Organización: DEMO Refinería Los Andes (AUTOTEST). Borradores inactivos creados el 2026-09-09 (19:48 Bogotá) y corregidos hoy por SQL directo sobre prod, con respaldo JSON previo (`docs/respaldos/respaldo-I10A-I01A-v3-2026-09-10.json`, 2 plantillas · 13 secciones · 83 ítems). Ninguna de las dos revisiones tiene ITR asignados ni filas en la matriz equipo×ITR; las v2 siguen activas.

Contraste hecho contra los ítems de la v1 (texto del Word CB&I importado en mayo) y contra el estándar de la sección 5 del plan. Los Word originales no están en este entorno (`insumos-locales/` es local); la cobertura se verificó con la v1 completa, que conserva todas las filas del original.

---

## 1. I10A v3 — `30fcfb96-ab66-47a0-9936-3fc72a689038` (9 secciones, 58 ítems)

### Cobertura del original CB&I I10A Rev 7

| Bloque del original | Dónde queda en v3 |
|---|---|
| INFORMATION: Data Sheet, Rev, Service, Manufacturer, Model, Serial, Input Range | Nativo del tag (bloque de solo lectura en ejecución y cabecera del PDF). 1.01 «coincide con la placa» con foto |
| Type: Transmitter / Transducer / Switch | 1.03 (selección; condiciona 2.02–2.04, 4.x, 5.x, 6.11–6.12) |
| Output Range | 2.02 / 2.03 / 2.04 (solo lectura continua) |
| Wetted Material | 1.06 |
| 8 controles (general, proceso, certificación, eléctrico, lubricado/obturado, hidráulico, neumático, accesorios) | 3.01–3.08, selección Conforme / No conforme / No aplica con resultado; 3.03 exige el certificado (PDF) |
| CALIBRATION CHECK: Input · % Range · Output · % Error | 4.01 tabla (sentido, entrada, **% del rango**, salida esperada, salida observada, error %, resultado, observación), 3–20 puntos, adjunto del registro del contratista |
| ACCESSORIES: Tag No · Action · Initials | 3.09 tabla variable (tag, acción, resultado, observación); las iniciales son la firma nativa |
| CORRECTIONS: Elevation, Suppression, Alarm/Trip rising/falling, Sensor failure upscale/downscale, Square root | 6.07–6.12 |
| CALIBRATION EQUIPMENT USED: Type, Manufacturer, Model, Serial, Certification date | 7.01–7.06 + 7.05 certificado (PDF) + 7.08 verificación del inspector con resultado |

Añadidos de CommUp (no están en el original): 1.02 variable, 1.04 contratista, 1.05 fecha del ensayo, sección 2 (criterio de aceptación declarado, sin tolerancias inferidas), 4.02 conciliación de puntos, sección 5 interruptores (tabla actuación/reposición), 6.01–6.06 ajustes, sección 8 soportes documentales, sección 9 decisión del inspector.

### Correcciones aplicadas hoy

1. **Numeración contigua.** Los huecos (1.02–1.07, 2.01–2.02, 8.01–8.02, 9.03) eran ítems retirados en v3 (datos maestros, rango de entrada, nombres de archivo). Renumerado 1.01–1.06, 2.01–2.09, 8.01–8.05, 9.01–9.02; `order_index` compactado; referencias cruzadas en 4.01 (criterio 2.07, unidades 2.04) y 4.02 (puntos 2.09) actualizadas.
2. **Descripciones EN.** 33 ítems tenían `description` y `description_es` idénticos en español; ahora todos tienen redacción EN propia.
3. **Tablas de calibración 4.01 y 6.03:** columna «% del rango» (número, %) para respetar la cabecera original Input · % Range · Output · % Error.
4. **9.04 «Fecha de revisión» retirada:** es la fecha nativa de la firma.
5. Descripción de la plantilla anotada con el ajuste.

Se conservan los 17 selects con `option_outcomes` (0.2) y las 5 evidencias documentales (3.03, 4.01, 5.03, 7.05, 8.02). Un «Rechazado» en 9.01, «Requiere información» en 7.08/8.04/9.01, un `fail` en cualquier fila de tabla o un «No conforme» bloquean la firma.

### Pendiente para Luis (decisión)

- **Sección 9 «Validación del inspector».** El estándar §5 dice «no hay ítem de decisión final; la aceptación es la secuencia nativa ejecutor → supervisor → cliente». La estructura de 9 secciones fue aprobada antes de redactar el estándar. Mantener 9.01/9.02 (decisión explícita con efecto) o retirarlos y dejar solo la firma nativa: es una decisión de formato, no técnica. Hoy se mantienen.
- **6.03 «Lecturas posteriores al ajuste»** es una tabla de calibración por puntos condicionada a 6.01=Sí. Para un interruptor (1.03=Interruptor) los ciclos posteriores solo caben en 6.04 como texto, porque un ítem admite una sola condición. Alternativas: (a) segunda tabla 6.03b condicionada a 1.03=Interruptor (pierde el gate de 6.01), (b) condiciones compuestas en el software (brecha nueva), (c) aceptar el texto. Hoy: (c).
- 1.04 contratista y 1.05 fecha del ensayo se mantienen como en I04A v2 (fecha de ejecución del contratista ≠ fecha de diligenciamiento).

## 2. I01A v3 — `994aa34e-a9fe-4f47-bb56-dd4a6eec3b20` (4 secciones, 25 ítems)

### Cobertura del original CB&I I01A Rev 3

| Original | v3 |
|---|---|
| Voltage, Type, Diameter, **Numbers of Cores**, Core Size, Length, From, To | D.2, D.1, D.3, **D.4 (restaurado hoy)**, D.5, D.6, D.7, D.8 — texto «valor y designación según la ingeniería» (calibre alfanumérico admite AWG y mm²), pares/conductores numérico |
| 1.0–9.0 controles | 1.0–9.0 selección con resultado; 5.0 continuidad por conductor/pantalla (tipo `continuity`) |
| 10.0 Test equipment (Brand, Model, Serial, Expiry) | T.1–T.5 (fabricante, modelo, serie, vencimiento, certificado PDF) |

Añadidos: R.1 planos/listado/especificaciones, R.2 procedimiento, O.1 observaciones.

### Correcciones aplicadas hoy

1. **Numeración del original:** «1»…«9» → «1.0»…«9.0» (PDF y Punch List citan el número original).
2. **D.4 «Número de conductores o pares»** restaurado (faltaba en v2 y v3); D.4–D.7 anteriores pasan a D.5–D.8.
3. **Fotos según §7.1:** además de 1.0, 6.0 y 8.0, ahora 3.0 (ausencia de daños en la protección mecánica) y 9.0 (puesta a tierra de reservas y pantallas).

### Pendiente para Luis (decisión)

- **T.1–T.5 frente a 10.x.** El bloque de equipo de prueba es original (10.0), pero el generador de la Fase 2 lo numera siempre T.x. Se mantiene T.x por coherencia con las 262 v2; si prefieres 10.1–10.5 cuando el bloque sea original, hay que cambiar también el generador.
- **Datos del cable (D.1–D.8) frente a la tabla `cables`** (`cable_type`, `size`, `length_m`, `from_tag_id`, `to_tag_id`). Mientras el ITR se ejecute por tag y el cable no sea tag, la captura es de contraste. Si el listado de cables entra por Excel como tags (decisión 4), D.x pasan a nativos y se retiran en v4.

## 3. Prueba mínima (PLAN-MANUAL §4) — pendiente, requiere sesión en el navegador

Para cada referencia, en una asignación de QA de DEMO: captura y persistencia al reabrir; un obligatorio vacío no deja listo para firma; rechazo («No conforme», «Rechazado») bloquea; «No aplica» exige justificación; condiciones 1.03 / 6.01 / 8.01 ocultan y muestran; tablas 3.09 / 4.01 / 5.03 / 6.03 con valores cero; adjuntos PDF en 3.03 / 4.01 / 5.03 / 7.05 / 8.02 y en T.5; PDF completo; firmas con tres usuarios distintos y bloqueo posterior.

Estructuras que ya pasaron esa prueba en I01A v2 (selección con resultado, continuidad, PDF) no se repiten; lo nuevo a probar es `table` con columna de selección y con `requires_document`, y la condición sobre una tabla.

## 4. Activación

Botón «Activar esta revisión» en `/admin/templates/<id>`: `activate_itr_template_revision` desactiva la v2, activa la v3 y re-apunta la matriz equipo×ITR (I10A 21 filas, I01A 16 filas) en la misma transacción. No activar hasta cerrar el punto 3 y las decisiones de Luis.
