# Fase 2 — diseño manual, bloque instrumentación — 2026-09-10

Seis borradores v2 inactivos creados con `scripts/itr-v2/generar-v2-manual.mjs` a partir de especificaciones escritas a mano en `scripts/itr-v2/manual/<código>.json` (formatos que el generador automático no podía representar: pruebas de operación, matrices irregulares, datos mezclados con la lista). Mismo estándar v2: R.n referencias · D.n datos · numeración original en Inspección · M.n registros de ensayo · T equipo de prueba · O.1 observaciones.

Revisión: abrir el editor, comparar con el Word original, ajustar fotos y redacción, y pulsar «Activar esta revisión». La v1 queda inactiva y la matriz equipo×ITR se re-apunta sola. Para regenerar un código: borrar su borrador y volver a ejecutar `--codes <código> --apply` (el script no duplica borradores salvo con `--force`).

| Código | Activa | Borrador | Ítems | Selecciones | Fotos | Documentos | Tablas | Decisiones de diseño |
|---|---|---|---|---|---|---|---|---|
| [I02A](https://commup.app/admin/templates/96ee9c44-03eb-4b72-ae66-a6a94425ba63) | v1 | v2 | 15 | 9 | 3 | 0 | 1 | Mediciones con calibrador como datos (D.1–D.3) y espesores como tabla (D.4); el marcado de la placa se desglosa en 1.1–1.4; el criterio de espesor conserva el 0,001·DN del original sujeto a la especificación del proyecto. |
| [I11B](https://commup.app/admin/templates/2c90bab9-c356-416d-8200-d8c576c87d70) | v1 | v2 | 27 | 9 | 4 | 1 | 1 | Prueba de operación como registros M.1–M.9 (presiones, tiempos, límites de carrera, posiciones de falla) más M.10 de conformidad con el diseño; impedancia de bobinas como tabla 8.0-R; equipo de prueba T.1–T.5. |
| [I16A](https://commup.app/admin/templates/0b02051b-0f70-4083-a54d-6d9b12841a8f) | v1 | v2 | 10 | 6 | 2 | 0 | 0 | El P&ID y el rango se verifican contra los datos del tag (sin duplicar); número de línea y rango leído en carátula como registro. |
| [I21C](https://commup.app/admin/templates/c32173bb-ee8b-4485-bb4f-cca7b0f2a659) | v1 | v2 | 9 | 3 | 0 | 1 | 1 | Sistema remoto como dato (D.1–D.2), listado de señales como tabla M.1 (tag local, tipo, objeto remoto, lectura/escritura/gráfico/alarma) y el listado de variables como documento adjunto en 3.0. |
| [I33C](https://commup.app/admin/templates/1defd712-4c78-4b69-a048-a3cd7c55b3a4) | v1 | v2 | 13 | 5 | 0 | 1 | 3 | Rangos como datos (D.1–D.2), verificación de calibración por 9 puntos ascenso/descenso como tabla M.1 (salida DCS vs. posición real), alarmas y disparos como tabla M.2, equipo de prueba múltiple como tabla T.1 con certificados adjuntos en T.2. |
| [I34B](https://commup.app/admin/templates/80c44c8e-c8e4-4754-87ed-06b23855cd0d) | v1 | v2 | 24 | 9 | 4 | 2 | 1 | Prueba de operación local/remota como tabla M.1 (abrir/parar/cerrar × local/remoto), tiempos, límites de carrera, interruptor de torque y posición de falla como registros M.2–M.8; hoja de calibración adjunta en 8.0; equipo de prueba T.1–T.5. |

## Puntos que Luis debe confirmar

- **I02A**: no se añadió bloque de equipo de prueba aunque las mediciones exigen calibrador; si el procedimiento lo requiere, agregar T.1–T.5 en el editor. El criterio 0,001·DN se conserva tal cual (Fase 5: fórmula ligada a DN).
- **I16A**: el título dice pre-comisionamiento pero la fase copiada de la v1 es la de construcción; corregir la fase en el editor si corresponde. 2.0 y 4.0 se verifican contra los datos del tag (P&ID, rango) en lugar de digitarlos.
- **I11B / I34B**: se añadió un ítem de conformidad (M.10 / M.8) para que la posición de falla registrada se contraste con el diseño; el original solo la registraba.
- **I33C**: la tabla de equipo de prueba (T.1, hasta 5 instrumentos) reemplaza los tres bloques Marca/Modelo/Serie/Vencimiento del original; el vencimiento va como texto AAAA-MM-DD porque las columnas de tabla no admiten fecha.
- **I21C**: D.3 (protocolo y parámetros del enlace) no existe en el original; es opcional.

## Pendientes de diseño manual (34)

E: E04A E06B E11A E12A E13A E14-2B E19A E21B E31A E33A E34A E35A E36A E37A E41A E51B · H: H02B H02C H50b (sin plantilla activa) · M: M09C M12A M13B (sin plantilla activa) M37A M51C M55C · P: P03A P15C P21C · Q06A · X01A. I01A e I10A tienen v3 de Fase 1; I04A e I06A v2 ratificadas.
