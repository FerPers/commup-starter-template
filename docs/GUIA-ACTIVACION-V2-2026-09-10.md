# Guía paso a paso — activar las revisiones v2 y desplegar el catálogo

Estado de partida (2026-09-10): los 302 formatos tienen una revisión v2 propuesta **inactiva** en la organización DEMO (262 automáticas, 36 manuales, más I01A v3 e I10A v3). I04A e I06A v2 ya están activas. La org «CommUp Catálogo» tiene la revisión activa de cada código y Ecopetrol recibió 90 revisiones inactivas (traducciones) y LCT-FT.

Informes con enlace directo al editor de cada borrador:
- Automáticos: `docs/ITR-FASE2-LOTE-2026-09-09.md` (columna «Avisos» = qué revisar).
- Manuales: `docs/ITR-FASE2-MANUAL-2026-09-10.md` (columna «Decisiones de diseño» + decisiones transversales al final).

Orden sugerido: I (instrumentación) → E → M → H → P → T → L → Q → X. Lotes de 10–15 códigos de la misma letra.

---

## 1. Revisar y activar un borrador en DEMO (por cada código)

1. Entra en https://commup.app con tu usuario, organización **DEMO Refinería Los Andes** (menú de usuario → cambiar organización si hace falta).
2. Abre el enlace del código en el informe. Llegas al editor de la revisión v2, marcada «Inactivo»; la v1 sigue «Activo» en `Admin → Plantillas` (ambas filas aparecen juntas, ordenadas por código, con su «v1» / «v2»).
3. Compara con el Word original (carpeta local `insumos-locales/itr-word-originales`). Revisa en este orden:
   - **Numeración e ítems**: que estén todos los controles del original y ninguno de más (aviso «base N ítems / original M» = la v1 tenía filas que no eran controles).
   - **Redacción ES**: los textos vienen de la celda bilingüe del Word; corrige lo que suene a traducción literal.
   - **Fotos** (📷): la regla §7.1 las marca en identificación, daños, tierra, obturación/sellos y estado instalado. Añade o quita según el criterio de campo.
   - **Registros N-R y datos D.n**: que la unidad sea la correcta y que nada duplique datos del tag (fabricante, modelo, serie, hoja de datos, P&ID vienen del tag).
   - **Tablas M.n**: filas y columnas contra la matriz del Word; en el editor puedes cambiar filas fijas/variables, unidades y mínimos/máximos.
   - **Documentos** (📄): certificados, hojas de calibración, listados que el original pide adjuntar.
4. Pulsa «👁 Vista de campo» para ver la revisión como la verá el inspector (selecciones, tablas, fotos, documentos) y el pie con el código y la versión.
5. Vuelve al editor y pulsa «↑ Activar esta revisión» → confirma «Activar v2». El mensaje indica: revisión activada, 1 desactivada, N filas de matriz re-apuntadas. Desde ese momento las asignaciones nuevas usan la v2; los ITR ya asignados conservan su revisión, respuestas y firmas.
6. Si el borrador no sirve y prefieres regenerarlo: bórralo desde el editor y ejecuta desde la carpeta del proyecto
   - manual: `node scripts/itr-v2/generar-v2-manual.mjs --codes I11B --apply` (edita antes `scripts/itr-v2/manual/I11B.json` si quieres cambiar el diseño);
   - automático: `node scripts/itr-v2/generar-v2-listas.mjs --codes M01A --family C --apply` (la familia del código está en `docs/ITR-CLASIFICACION-ORIGINALES-2026-09-09.csv`).
   Regla: nunca `--apply` sobre una familia completa ya generada; solo por códigos.

Bloqueos al activar: un ítem de selección sin opciones impide activar (el editor lo indica). Todo lo generado pasa esta validación.

## 2. Después de cada lote: llevar lo activado al catálogo

Desde la carpeta del proyecto:

```bash
node scripts/itr-v2/sincronizar-catalogo.mjs --apply
```

- Compara la revisión activa de cada código de DEMO con el catálogo por huella de contenido; solo los códigos activados en el lote crean una revisión nueva en el catálogo, que allí queda activa de inmediato (el catálogo no ejecuta ITRs) con su matriz equipo×ITR.
- Resultado en `docs/CATALOGO-SYNC-<fecha>-demo-refiner-a-los-andes-commup-catalogo.csv`. Sin `--apply` es vista previa. Repetirlo no duplica nada («sin cambios»).

## 3. Ecopetrol: traer las revisiones del catálogo

```bash
node scripts/itr-v2/sincronizar-catalogo.mjs --from commup-catalogo --to morelco --apply
```

- Crea en Ecopetrol una revisión **inactiva** por cada código cuyo contenido difiera; las v1 siguen activas.
- Para activarlas hay dos caminos:
  - a mano: como owner de Ecopetrol (cambiar organización), `Admin → Plantillas` → abrir la revisión → «↑ Activar esta revisión»;
  - en bloque, mientras Ecopetrol no tenga ITRs en ejecución: añade `--activar` al comando. Activa cada revisión nueva, desactiva la anterior y re-apunta la matriz; si un código ya tiene ITRs sobre la revisión anterior, lo deja inactivo y lo indica en el CSV para activarlo a mano.
- También sirve la app: `Admin → Plantillas → Importar de otra org` muestra el catálogo con el estado de cada código (Nuevo / Actualizable / Al día) y el botón «Importar nuevos y actualizar todos».

## 4. Organización nueva (Geopark)

1. Crear la organización desde `/setup` con los **mismos códigos** de disciplina (ELEC, INST, MECH, PIPE, SAFE, HVAC, INSU, PAINT, TELE) y de fase (A, B, C, SU) que el catálogo; los tipos de equipo se siembran con los 76 por defecto.
2. En `Admin → Plantillas → Importar de otra org` pulsar «Importar nuevos y actualizar todos» (o por disciplina con el filtro). Cada plantilla llega activa, con su título en español, tipo de equipo y filas de matriz cuyo tipo exista.
3. Revisar `Admin → Plantillas → Matriz por tipo de equipo` y aceptar/ajustar las filas importadas.
4. Alternativa por script, sembrando lo que falte por código: `node scripts/itr-v2/sincronizar-catalogo.mjs --from commup-catalogo --to <slug> --seed-config --apply`.

## 5. Cuando termine la migración

- La maestra pasa a ser el catálogo: se edita allí (`Nueva revisión (borrador)` → `Activar esta revisión`) y las organizaciones cliente actualizan desde la app («Actualizable» en el modal).
- Se retiran de uso `generar-v2-*.mjs` y la sincronización DEMO → catálogo; `sincronizar-catalogo.mjs` queda solo para lotes catálogo → org.
- DEMO vuelve a ser una organización de demostración, sin papel de maestra.

## 6. Decisiones que convienen fijar durante la revisión

- Equipo de prueba T.1–T.5 en todo formato con ensayo instrumentado (hoy: sí en los manuales con ensayo; I02A no lo lleva).
- Referencias de proyecto heredadas del original (Prosernat en E51B, Reficar en P21C, BN 3500 en M51C/M55C): mantener o generalizar.
- I16A: título de pre-comisionamiento con fase de construcción → corregir fase en el editor si corresponde.
- Vencimientos de calibración dentro de tablas van como texto AAAA-MM-DD (las columnas de tabla no admiten fecha).

## 7. Pendientes viejos (fuera de la migración)

429 del WAF de Cloudflare · rotar/validar la API key de Anthropic · validar «Remover» miembro · probar Sprint O (fotos, punches y firmas sin red) en el teléfono.
