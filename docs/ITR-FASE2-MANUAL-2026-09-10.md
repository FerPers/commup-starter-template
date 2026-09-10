# Fase 2 — diseño manual de los formatos bloqueados — 2026-09-10

36 borradores inactivos creados en la organización DEMO con `scripts/itr-v2/generar-v2-manual.mjs` a partir de especificaciones escritas a mano en `scripts/itr-v2/manual/<código>.json` (formatos que el generador automático no podía representar: pruebas de operación, matrices irregulares, datos mezclados con la lista). H50B se generó con el generador automático (es lista pura; el bloqueo era por el código en minúscula) y M13B es plantilla nueva (no existía en CommUp). Mismo estándar v2: R.n referencias · D.n datos del elemento (fabricante, modelo, serie, hoja de datos y P&ID vienen del tag) · numeración original en Inspección con selección Conforme / No conforme / No aplica · N-R registros acompañantes · M.n registros de ensayo (tablas) · T.1–T.5 equipo de prueba · O.1 observaciones.

Revisión: abrir el editor, comparar con el Word original, ajustar fotos y redacción, y pulsar «Activar esta revisión». La v1 queda inactiva y la matriz equipo×ITR se re-apunta sola. Para regenerar un código: borrar su borrador y volver a ejecutar `node scripts/itr-v2/generar-v2-manual.mjs --codes <código> --apply` (el script no duplica borradores salvo con `--force`).

## Instrumentación — 6 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [I02A](https://commup.app/admin/templates/96ee9c44-03eb-4b72-ae66-a6a94425ba63) | v1 | v2 | 15 | 9 | 3 | 0 | 1 | Mediciones con calibrador como datos (D.1–D.3) y espesores como tabla (D.4); el marcado de la placa se desglosa en 1.1–1.4; el criterio de espesor conserva el 0,001·DN del original sujeto a la especificación del proyecto. |
| [I11B](https://commup.app/admin/templates/2c90bab9-c356-416d-8200-d8c576c87d70) | v1 | v2 | 27 | 9 | 4 | 1 | 1 | Prueba de operación como registros M.1–M.9 (presiones, tiempos, límites de carrera, posiciones de falla) más M.10 de conformidad con el diseño; impedancia de bobinas como tabla 8.0-R; equipo de prueba T.1–T.5. |
| [I16A](https://commup.app/admin/templates/0b02051b-0f70-4083-a54d-6d9b12841a8f) | v1 | v2 | 10 | 6 | 2 | 0 | 0 | El P&ID y el rango se verifican contra los datos del tag (sin duplicar); número de línea y rango leído en carátula como registro. |
| [I21C](https://commup.app/admin/templates/c32173bb-ee8b-4485-bb4f-cca7b0f2a659) | v1 | v2 | 9 | 3 | 0 | 1 | 1 | Sistema remoto como dato (D.1–D.2), listado de señales como tabla M.1 (tag local, tipo, objeto remoto, lectura/escritura/gráfico/alarma) y el listado de variables como documento adjunto en 3.0. |
| [I33C](https://commup.app/admin/templates/1defd712-4c78-4b69-a048-a3cd7c55b3a4) | v1 | v2 | 13 | 5 | 0 | 1 | 3 | Rangos como datos (D.1–D.2), verificación de calibración por 9 puntos ascenso/descenso como tabla M.1 (salida DCS vs. posición real), alarmas y disparos como tabla M.2, equipo de prueba múltiple como tabla T.1 con certificados adjuntos en T.2. |
| [I34B](https://commup.app/admin/templates/80c44c8e-c8e4-4754-87ed-06b23855cd0d) | v1 | v2 | 24 | 9 | 4 | 2 | 1 | Prueba de operación local/remota como tabla M.1 (abrir/parar/cerrar × local/remoto), tiempos, límites de carrera, interruptor de torque y posición de falla como registros M.2–M.8; hoja de calibración adjunta en 8.0; equipo de prueba T.1–T.5. |

## Eléctrica — 16 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [E04A](https://commup.app/admin/templates/b9186bf8-9c3c-461d-8929-204fefa5f873) | v1 | v2 | 31 | 9 | 4 | 1 | 1 | Datos de placa y planos como D.1–D.14 (fabricante, modelo y serie vienen del tag); resistencia de aislamiento AT/BT/tierra como tabla M.1 con tensión de prueba y lectura a 1 min; equipo de prueba T.1–T.5 añadido por tratarse de un ensayo con megóhmetro. |
| [E06B](https://commup.app/admin/templates/8bcd93a8-fcec-46ec-ba42-f8de5846304d) | v1 | v2 | 35 | 9 | 3 | 2 | 5 | Datos del VT como D.1–D.8 (serie del tag); aislamiento secundario, primario y tensiones tras energizar como tablas por pares de fases (M.1–M.4); polaridad por batería como tabla R/S/T; relé de baja tensión como tabla drop-off / pick-up (M.6) con ítem de conformidad 12.3. |
| [E11A](https://commup.app/admin/templates/5e2be605-0a5c-48c1-8bbc-1ba710b58668) | v1 | v2 | 18 | 10 | 4 | 0 | 1 | Datos del circuito como D.1–D.5 (uso como selección); lista de componentes del circuito como tabla M.1 (tag y descripción). |
| [E12A](https://commup.app/admin/templates/8573298c-9bea-4418-bbff-fe1499063f86) | v1 | v2 | 34 | 17 | 8 | 0 | 1 | Datos del circuito como D.1–D.14 (fabricante, tipo y serie del tag); chequeos generales 1.1–1.14 y de tierra 2.1–2.3 como selecciones; lista de componentes como tabla M.1. |
| [E13A](https://commup.app/admin/templates/ee1a3f68-f59a-4492-89f1-8cd5ebb5e50e) | v1 | v2 | 32 | 16 | 8 | 1 | 4 | Datos del circuito D.1–D.5; resistencia de aislamiento del motor y del calentador como tablas M.1–M.4 (AC y DC, no obligatorias: se llena la que corresponde al tipo de motor) con los mínimos del original en 6.0; equipo de prueba T.1–T.5. |
| [E14-2B](https://commup.app/admin/templates/a2180a08-3af0-4681-a2dc-98bcaa058db7) | v1 | v2 | 48 | 26 | 3 | 2 | 2 | Datos del cargador D.1–D.8 (fabricante y serie del tag); pruebas de alarmas y disparos como tabla 9.0; valores de flotación, corriente límite y rizado como registros; aislamiento del tablero AC/DC como tabla 15.4; subítems 15.5.n / 15.6.n como selecciones; equipo de prueba T.1–T.5. |
| [E19A](https://commup.app/admin/templates/368894e9-03fb-4efd-bc83-b0275dcd5c41) | v1 | v2 | 47 | 26 | 11 | 1 | 1 | Datos del panel D.1–D.11 (fabricante y serie del tag); segunda lista «Verificaciones de cableado» renumerada C.1–C.12 para no repetir la numeración; aislamiento del calentador (10.0-R, mín. 10 MΩ), continuidad de tierra (C.11-R, máx. 1,0 Ω) y uniones de cinta como tabla C.12-R; equipo de prueba T.1–T.5. |
| [E21B](https://commup.app/admin/templates/b5dade83-8f20-4145-bd38-662367427b6f) | v1 | v2 | 28 | 13 | 0 | 1 | 4 | Datos del cubículo D.1–D.4; conmutación automática (M.1, filas 90/100/80 % con operaciones del original), aislamiento a 1 min (M.2), resistencia de contactos por polo (M.3) y factor de potencia GST/UST (M.4, solo 38 kV, no obligatoria) como tablas; equipo de prueba T.1–T.5. |
| [E31A](https://commup.app/admin/templates/ab9819d1-de90-4945-b953-89f0804e9f8a) | v1 | v2 | 27 | 14 | 6 | 2 | 2 | Datos eléctricos D.1–D.4; resistencia de devanados (M.1, el original dice MΩ pero es resistencia óhmica: columna de unidad libre) y aislamiento AT/BT/tierra (M.2) como tablas; resultados de rigidez dieléctrica del aceite como documento en 6.0; equipo de prueba T.1–T.5. |
| [E33A](https://commup.app/admin/templates/f6f8d029-8a34-4d2b-baaa-ee70c566dbeb) | v1 | v2 | 12 | 2 | 0 | 1 | 2 | Prueba HiPot AC de transformador: parámetros por devanado como tabla M.1 (primario / secundario), corriente de fuga en el tiempo como tabla M.2 (5 s a 1 min, fases A/B/C); criterio del 75 % de la tensión de fábrica y resultado como selecciones; equipo de prueba T.1–T.5. |
| [E34A](https://commup.app/admin/templates/fadcfe64-d6fc-4530-8e2a-ed013cf0abad) | v1 | v2 | 11 | 5 | 4 | 0 | 0 | Datos del circuito D.1–D.4; cinco controles como selecciones con foto en tipo/orientación, clasificación de área, codificación de color y puesta a tierra. |
| [E35A](https://commup.app/admin/templates/ddcae953-e888-4619-8d61-a5dce4ad3f09) | v1 | v2 | 20 | 4 | 3 | 1 | 3 | Protección catódica: descripción del punto de prueba como datos y selecciones (1.1–1.9); continuidad de ánodos (M.1), resistencia a tierra del lecho por picas (M.2 con promedio M.3) y potencial del suelo con rectificador OFF/ON (M.4) como tablas; equipo de prueba T.1–T.5. |
| [E36A](https://commup.app/admin/templates/292b950e-39a0-4159-ba61-44dbf0f1b515) | v1 | v2 | 47 | 35 | 10 | 0 | 0 | Inspección de equipo Ex: datos de certificación D.1–D.9 (fabricante, tipo y serie del tag; clase/división/grupo en D.9); 35 controles como selecciones con foto en etiquetas, daños, pernos, bridas, entradas, tierra, cables y guardas; detalles del lazo de tierra en 24.0-R. El ítem 2.0 no tenía traducción en el original. |
| [E37A](https://commup.app/admin/templates/6f47f21d-11f0-44a9-adf4-f06520b34ef9) | v1 | v2 | 35 | 16 | 6 | 1 | 1 | Datos del cable D.1–D.10 (fabricante y tipo del tag); continuidad de tierra del prensaestopas con registro 8.0-R (máx. 0,1 Ω); matriz triangular de aislamiento entre conductores (hasta 14 + tierra) como tabla M.1 de filas variables (par, lectura ≥ 25 MΩ a 500 V); equipo de prueba T.1–T.5. |
| [E41A](https://commup.app/admin/templates/2c6cc9da-9366-47a8-81a6-2c8e1bd4a34a) | v1 | v2 | 18 | 11 | 8 | 0 | 1 | Datos del circuito D.1–D.4; once controles como selecciones; lista de componentes del circuito como tabla M.1. |
| [E51B](https://commup.app/admin/templates/d275edcd-1824-4a60-bbdc-f85f9f7989f5) | v1 | v2 | 37 | 23 | 7 | 2 | 2 | Desalador electrostático: datos D.1–D.4; aislamiento de la acometida (M.1) y de los devanados del transformador con neutro desconectado (M.2) como tablas; resistencia de puesta a tierra en 11.1-R; referencias a informes del vendor (Prosernat) conservadas como en el original; equipo de prueba T.1–T.5. |

## HVAC — 3 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [H02B](https://commup.app/admin/templates/2965aaba-6666-4ac7-b6de-dca813ff8592) | v1 | v2 | 16 | 12 | 3 | 0 | 1 | Compuertas (pre-comisionamiento): 11 controles como selecciones con foto en cierre sin holguras, indicador y dispositivo de bloqueo; parámetros medidos vs. diseño (volumen de aire, velocidad, pérdida de presión) como tabla 12.1; verificaciones adicionales del proveedor como texto 13.0. |
| [H02C](https://commup.app/admin/templates/49e55790-2f69-466c-9d07-c0c8e552f2c2) | v1 | v2 | 16 | 12 | 3 | 0 | 1 | Compuertas (comisionamiento): 11 controles como selecciones con foto en cierre sin holguras, indicador y dispositivo de bloqueo; parámetros medidos vs. diseño (volumen de aire, velocidad, pérdida de presión) como tabla 12.1; verificaciones adicionales del proveedor como texto 13.0. |
| [H50B](https://commup.app/admin/templates/e8550c0e-7eea-4162-8949-f87d048e3cd7) | v1 | v2 | 17 | 17 | 4 | 0 | 0 | Lista pura generada con generar-v2-listas.mjs (el código en la base es H50B, no H50b). base 30 ítems / original 17 |

## Mecánica — 6 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [M09C](https://commup.app/admin/templates/198e4cf9-7f00-4f2b-8370-4da5cc32ecf2) | v1 | v2 | 36 | 20 | 1 | 0 | 3 | Registro de operación mecánica de bombas: datos de placa D.1–D.7 (fabricante y modelo del tag); presiones estática y shut-off como registros 5.1-R / 5.2-R; el registro de arranque (16 parámetros × 11 tiempos) se transpone en tres tablas de filas variables con columna de tiempo: M.2 presiones/flujo/velocidad/corriente, M.3 temperaturas, M.4 vibraciones (12 puntos). |
| [M12A](https://commup.app/admin/templates/ea05e051-9516-4aa6-a46d-d6701e06925b) | v1 | v2 | 19 | 11 | 1 | 0 | 1 | Alineación de acoples: 11 controles como selecciones; largo libre del espaciador, DBSE, tolerancias del fabricante y flotación axial como registros M.1–M.4; distancia entre caras de cubos (Fig. 1) M.5; lecturas de periferia y cara iniciales y finales (Fig. 2) como tabla M.6. |
| [M13B](https://commup.app/admin/templates/2404b465-b173-45d9-b349-5b1d30a385b9) | (nueva) | v1 | 11 | 8 | 2 | 0 | 0 | Plantilla nueva (no existía en CommUp): bomba sumergible en pre-comisionamiento, nueve controles como selecciones (4.1–4.4 bajo «resultados según especificación del fabricante») y comentarios adicionales como texto 6.0. |
| [M37A](https://commup.app/admin/templates/31927bd6-392a-4378-9f1d-f3d6f2a27088) | v1 | v2 | 21 | 18 | 5 | 4 | 1 | Prueba de carga de orejas de izaje / monorrieles: 15 controles previos como selecciones (certificados y calibración de celda de carga como documentos); deflexiones permitidas vs. reales como tabla M.1 (nota de 20 min antes de medir); controles 18–20 tras la prueba. |
| [M51C](https://commup.app/admin/templates/3f682813-c889-41f0-9ae8-9bc6e992f1c7) | v1 | v2 | 19 | 14 | 1 | 2 | 0 | Compresor centrífugo (comisionamiento): actividades eléctricas 3.1–3.3 como selecciones con registro del giro desacoplado (3.2-R); duración real de la prueba de 72 h (9.0-R) y parámetros BN 3500 (10.0-R) como registros; aceptaciones del vendor como documentos. |
| [M55C](https://commup.app/admin/templates/9ff43743-8e17-408f-98e8-4a9ded7c902c) | v1 | v2 | 17 | 12 | 1 | 2 | 0 | Compresor centrífugo de aire con engranaje integral (comisionamiento): actividades eléctricas 3.1–3.3 como selecciones con registro del giro desacoplado (3.2-R); duración real de la prueba de 72 h (8.0-R) y parámetros BN 3500 (9.0-R) como registros; aceptaciones del vendor como documentos. |

## Tubería — 3 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [P03A](https://commup.app/admin/templates/74011d14-9d4b-4bcb-8e27-7297391f00a7) | v1 | v2 | 23 | 0 | 0 | 4 | 3 | Calibración de equipos de prueba de tubería: tres bloques (manómetro 1, manómetro 2, válvula de alivio) con tabla de puntos ascenso/descenso, patrón usado, certificado, rango, lectura de cero y técnico; los bloques 2 y 3 no son obligatorios; formulario del tercero como documento en R.2. |
| [P15C](https://commup.app/admin/templates/a21a0d06-0e5d-48e4-92c5-3c9d254f0e42) | v1 | v2 | 15 | 4 | 1 | 0 | 0 | Certificación de prueba de fugas: P&ID de referencia como dato D.1; medio de prueba como selección (4.0 + 4.0-R); presiones de diseño y de prueba, ajuste de PSV, duración y pérdida de presión por hora como mediciones; límites y subsistemas incluidos como texto 10.0. |
| [P21C](https://commup.app/admin/templates/22b96b84-9578-4bb3-8778-ba9f7f2f5cd1) | v1 | v2 | 22 | 16 | 3 | 1 | 1 | Soportes de resorte: P&ID de referencia D.1; líneas y resortes instalados como tabla M.1; cantidades 1.2 / 1.3 como números; controles agrupados en identificación, montaje, integridad, funcionalidad, liberación y registros; hoja de datos de resortes actualizada como documento en 6.1. |

## Calidad / protección contra fuego — 1 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [Q06A](https://commup.app/admin/templates/c27f356e-fe29-471c-9012-503134130bbe) | v1 | v2 | 13 | 9 | 4 | 0 | 0 | Protección contra fuego: tipo como selección 1.0; etapas 2.0–10.0 como selecciones con foto en aplicaciones, malla, acabado y reparaciones; espesor final medido en 7.0-R. |

## Pintura — 1 formatos

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [X01A](https://commup.app/admin/templates/17481605-5191-4f2c-91ee-78f2cae57c82) | v1 | v2 | 5 | 1 | 1 | 1 | 0 | Informe de inspección de pintura: es una hoja de aceptación; lista de planos de límites como dato D.1, aceptación del alcance como selección 1.0 y registros de inspección de pintura (preparación, espesores) como documento 2.0. |

## Decisiones transversales que Luis debe confirmar

- **Equipo de prueba (T.1–T.5)**: añadido en todos los formatos con ensayo instrumentado (aislamiento, continuidad, HiPot, protección catódica…) aunque el original no siempre traía el bloque; I02A (calibrador) no lo lleva. I33C usa una tabla T.1 de hasta 5 instrumentos en vez del bloque.
- **Datos del elemento (D.n)**: no obligatorios, igual que en el generador automático; «Tipo» se conserva como dato cuando el original lo trae (no es el modelo del tag).
- **Selecciones informativas** (posición de falla FO/FC/FS, sistema remoto, medio de prueba, tipo de fireproofing) no tienen resultado; donde hacía falta juicio se añadió un ítem de conformidad (I11B M.10, I34B M.8, E06B 12.3, E33A 2.0).
- **Tablas sin fecha**: las columnas de tabla no admiten tipo fecha; los vencimientos van como texto AAAA-MM-DD (I33C T.1) o como ítems `date` fuera de la tabla (P03A 1.3-D / 1.3-E).
- **Matrices grandes** transpuestas o partidas: E37A (105 pares → filas variables por par), M09C (16 parámetros × 11 tiempos → tres tablas con columna de tiempo), E33A (corriente de fuga por fase y devanado).
- **Criterios numéricos del original** conservados en el texto del ítem (E13A mínimos de IR por tamaño de motor, E19A 10 MΩ / 1,0 Ω, E37A 25 MΩ y 0,1 Ω, I02A 0,001·DN, M09C duración por potencia); E37A M.1 y E19A C.12-R llevan además min/max en la columna.
- **Unidades dudosas del original**: E31A M.1 «resistencia de devanados en MΩ» se dejó con columna de unidad libre; E13A M.2 mezcla Ω y MΩ (etiquetado por fila).
- **Fases**: se copia la fase de la v1 activa; I16A tiene título de pre-comisionamiento con fase de construcción (corregir en el editor si corresponde).
- **Referencias de proyecto** (Prosernat en E51B, Reficar en P21C, BN 3500 en M51C/M55C) se conservan como en el original; revisar si el catálogo será genérico.

## Estado del catálogo

Con este lote, los 302 originales tienen revisión v2 propuesta: 262 del lote automático del 2026-09-09, 36 de este lote (incluida la plantilla nueva M13B) y las cuatro referencias de Fase 1 (I01A v3, I10A v3, I04A v2, I06A v2). Sigue la activación por lote por parte de Luis y la Fase 6 (organización catálogo + clonación).
