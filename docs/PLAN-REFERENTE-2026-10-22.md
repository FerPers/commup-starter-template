# Plan de trabajo — CommUp referente (desde 2026-10-22)

## Contexto

El plan de revisión (S01–S25, N0–N3) está casi completo y en producción. Al revisar CHAP (completionshandover.com) como espejo, Luis definió hacia dónde llevar CommUp. El objetivo es que sea una aplicación referente, fresca, moderna, intuitiva y fácil de usar, que todos quieran probar.

1. **Requisitos ITR por tag apoyados por IA.** Cada tag tiene su lista de ITR requeridos, según su tipo, su descripción y las disciplinas que se eligen al crear el proyecto. CHAP lo hace con «documentos requeridos» que se cumplen subiendo un archivo. Nosotros lo haremos con ITR digitales.
2. **Puntos 1–4 del espejo:** skyline, logos en los PDF, QR en certificados y cobertura del P&ID.
3. **Límites de sistema dibujados en el P&ID vivo** (estilo LOSH), como diferenciador.
4. **Orden en la casa:** depurar la carpeta, sacar las fugas de idioma y elegir mejores términos.
5. **Cerrar el backlog pendiente.**

Cada paso importa más que el anterior, así que el plan prioriza bases limpias, vocabulario definitivo y maquetas aprobadas antes de construir pantallas nuevas.

---

## Decisiones ya tomadas (Luis, 2026-10-22)

| Tema | Decisión |
|---|---|
| Gate (ES) | **liberación** («aprobar la liberación MC del sistema»). Admin «Gates (hold points)» → «Liberaciones y criterios» |
| Readiness (ES) | **Liberación de sistemas** (matriz del proyecto) |
| Gate / Readiness (EN) | **Milestone** / **System readiness** («Milestones & criteria» en admin) |
| Panorama vs Resumen | **Portafolio unificado.** `/dashboard` = «Portafolio» / «Portfolio» y absorbe la tabla de «Readiness por proyecto», que sale del menú (`/control-tower` redirige). Proyecto = «Resumen» / «Project overview» |
| Roles (ES) | Propietario · Administrador · Arquitecto · Líder · Inspector · Cliente, iguales en todas partes |
| Hold point (paso de procedimiento) | **Punto de espera** (EN «Hold point») |
| Punch / Template | Se queda «Punch» (menú «Punch», no «Punch List»); «Template» → **Plantilla** |
| PDF formales (certificados, dossier, punch list) | **Bilingües ES / EN**, como el del ITR. Los reportes salen en el idioma de quien descarga |
| LOADTEST | **Borrar los datos de producción y dejar los scripts** (banco a demanda) |
| QR en certificados | Lleva **al registro en la app** (sin hash ni verificación pública) |
| Logo en PDF | **Organización + cliente del proyecto** (campo nuevo en el proyecto); «CommUp» discreto en el pie |
| ITR en papel | **No por ahora** |
| Skyline | **Por sistema**, con las fechas que ya existen (`system_gate_plans`) |

Las rutas, los nombres de tablas y la API no se renombran (`readiness`, `gates`, `control-tower`). Solo cambian las etiquetas visibles, el manual y la ayuda.

---

## Bloques y sesiones (en orden)

### O — Orden en la casa (1 sesión, sin migración salvo el borrado de LOADTEST)

**Borrar** (confirmado que nada los usa):
- `testsprite_tests/` (local, 11 MB; su `tmp/config.json` puede tener credenciales).
- `cloudflare-workers/` y su entrada en `eslint.config.mjs`, además del comentario viejo en `PushNotificationManager.tsx:11`.
- `docs/ui-baseline/`.
- `public/{file,globe,next,window}.svg`.
- Las dependencias `web-push` y `@types/web-push` (0 imports).
- `AGENTS.md`, o dejarlo apuntando a CLAUDE.md.
- El zip local de `entrega-commup-2026-09-09/`.

**Archivar en `docs/archive/`:**
- Los `.docx` y `robust-honking-hopper.md` de la raíz.
- `STAGE-14/15`, `superpowers/plans`, las revisiones de 09-09 y la navegación vieja.
- *(Corregido al ejecutar: la migración ITR v2 sigue pendiente —Fase 1 aplazada—, así que sus documentos se ordenaron en `docs/itr-v2/` y `scripts/itr-v2/` se queda, con las rutas ajustadas.)*
- `scripts/p6-connector/`, `scripts/split-itr-bilingual.ts` y `scripts/catalog/itr_loop_ce_revisions.sql`.
- Los seeds únicos de `demo-data` (`seed_signature_test_users`, `cleanup_*`).
- `entrega-commup-2026-09-09/` y `commup_vector_pack_v2/`.

**Corregir:**
- `README.md`: hoy es el del starter de Cloudflare; se reescribe.
- `package.json`: cambiar `name`; no se toca el nombre del Worker en `wrangler.jsonc`.
- `.env.example`: nuevo.
- `.gitignore`: entradas explícitas para `.claude/settings.local.json` y `.claude/worktrees/`.
- La contraseña fija de `scripts/demo-data/create_demo_user.mjs:32` pasa a una variable de entorno.
- La línea 289 de la cobertura, que dice que LOADTEST ya no existe.

**LOADTEST:** ✅ datos borrados de prod el 2026-10-22 (`teardown.sql` corregido: lista explícita de triggers ON DELETE y proyectos antes que la org).
- Se corre `scripts/loadtest/teardown.sql` en una hora tranquila: bloquea escrituras unos segundos y borra unas 160 mil filas. Antes de correrlo **te pido el OK en el momento**.
- CLAUDE.md queda diciendo que el banco se crea y se borra a demanda.
- TestSprite también está conectado como servidor MCP en tu Claude. Quitarlo es tu configuración, no la del repo.

**Ya hecho (no hay nada que hacer):** `src/pwa/sw.ts` se borró en 7481f63.

### V — Idioma y vocabulario (2–3 sesiones, sin migración)

**V1. Glosario y fugas visibles:**
- Aplicar el glosario de arriba en `es.json`/`en.json` y en el manual (`docs/MANUAL-COMMUP-POR-ROL.md`, luego `npm run help:build`).
- **Portafolio unificado:**
  - `/dashboard` integra la tabla `loadPortfolioReadiness` y queda con su h1 en `titles.ts`.
  - `menu.ts` quita «Readiness por proyecto»; `/control-tower` redirige.
  - Se actualizan los tests de paridad del menú y los títulos.
- Corregir las claves que faltan en EN (`Daily.detail.movePrompt`/`needDatePrompt`, hoy en `Registers.detail`). `src/i18n/keys.test.ts` pasa a revisar también los `t(cond ? 'a' : 'b')` y que es y en tengan el mismo juego de claves.
- Unificar los roles en `Users.roles`, `Topbar.role`, `MyWork.roles`, `Help.role`, `GatesAdmin.role` y `Errors.tier`.
- Llevar a `t()` lo más visible:
  - `SetupWizard.tsx` (la primera pantalla de toda org nueva).
  - `ProjectHeader.tsx`, `TagItrTab.tsx` y `TwinView.tsx`.
  - Las pantallas de campo `ContinuityCapture.tsx` y `SwipeCaptureFlow.tsx`, y los literales de `ItrExecution.tsx`.
  - Los `aria-label` de chrome: `sidebar.tsx`, `Modal.tsx`, `Toast.tsx`, `NotificationsBell.tsx` y `widgets/_shared.tsx`.
  - Los títulos de página fijos (scan, notifications, access, verify).

**V2. Resto de pantallas** (Q G-06):
- Los 46 archivos sin `t()` y los que mezclan, empezando por admin de integración (webhooks, api-keys, workflows), los editores de plantillas, C&E, las importaciones y `ReportPrint`.

**V3. Errores del servidor y PDF** (Q C-18):
- Los 414 `error: '…'` de las acciones pasan a códigos (`{ error: 'code', params }` → `Errors.*`), empezando por `itr-instances`, `vendors`, `performance`, `itr-templates`, `startup`, `daily`, `punches` y los mensajes de `withAuth`.
- Los 9 generadores de PDF que hoy salen solo en inglés:
  - Formales en bilingüe: `certificate`, `completion-dossier`, `punch-list`, `itr-test-pack`, `pssr`, `system-completion`.
  - Reportes por idioma: `area-kpis`, `phase-progress`, `preservation-status`.

### E — Espejo rápido (2 sesiones, después de las maquetas)

- **E1. Skyline de liberación:** ✅ hecho 2026-10-22 (migración `20261128120000`: RPC `compute_project_gate_progress`; seed `scripts/demo-data/seed_skyline_plans_demo.sql` corrido en DEMO-GLP).
  - Nueva pestaña de «Planificación» (`planning/skyline` en el `PlanningHub`).
  - Una caja por sistema en la fecha comprometida (o pronosticada) de la liberación elegida, con color por avance de esa liberación: 100 % / ≥ 50 % / < 50 % (de `compute_system_progress`, por gate).
  - Rango de fechas, clic → ficha del sistema (`?tab=plan&gate=`) y Excel.
  - Los datos salen del armado del look-ahead (`planning/lookahead/page.tsx`, `src/lib/readiness/planning.ts`).
- **E2. Logos, QR y cobertura** (migración chica): ✅ hecho 2026-10-22 (migraciones `20261129120000` + `20261129130000`; cliente y su logo en «Editar proyecto», marca y QR en los PDF, logo en la fila del Portafolio, cobertura en la ficha del sistema, el registro y Calidad de datos).
  - `projects.client_logo_url` con carga en la edición del proyecto, más el logo de la org que ya existe.
  - Un helper de cabecera con logos en `src/lib/pdf/renderer.ts` (embed png/jpg como `itr-signatures.ts`; un webp cae a texto) en certificado, ITR, dossier, punch list e índice del handover.
  - QR al registro: se mueve `drawQr` de `register-labels.ts` al renderer y se usa en certificado e ITR.
  - Cobertura del P&ID: % de tags del sistema con pin en la revisión vigente (desde `tag_360`), en la ficha de sistema, en el registro de documentos y como categoría de calidad de datos.

### R — Requisitos ITR por tag con IA (5 sesiones)

> **Insumo (2026-10-22):** [`R-INSUMOS-MATRIZ-CERTIFICACION-2026-10-22.md`](R-INSUMOS-MATRIZ-CERTIFICACION-2026-10-22.md) — la matriz de certificación y la tabla de formatos que Luis usaba. Ajustes: proponer **cadenas A→B→C por tipo**, objetivo del requisito = tag **o paquete de prueba** (luego estructura civil), **cantidad requerida**, **código del cliente** por plantilla, Excel del registro con las vistas de la matriz, importar una matriz histórica con mapeo de códigos por IA.

**Principio:** el requisito base se **calcula** (matriz aceptada del tipo del tag, filtrada por las disciplinas del proyecto). Solo se **guardan las excepciones**: agregar o excluir un código, propuestas por la IA o a mano y decididas por una persona. Así no hay 200 mil filas que mantener sincronizadas.
- La identidad de la plantilla es su `template_code` (las revisiones cambian el id).
- El alcance del proyecto filtra por la **disciplina de la plantilla**, no la del tag: una bomba mecánica lleva el ITR eléctrico de su motor.

- **R1. Disciplinas del proyecto:** ✅ hecho 2026-10-22 (migración `20261130120000`; pantalla `/projects/[id]/scope` «Alcance del proyecto» en el menú Preparación, selector en el alta, `out_of_scope` en la generación y `discipline_scope` en Calidad de datos; historial en `project_discipline_events`). Una disciplina nueva de la org entra a todos sus proyectos (trigger), coherente con «por defecto, todas».
  - Tabla `project_disciplines`, escrita solo por la RPC `set_project_disciplines`, con vista previa e impacto. Quitar una disciplina con ITR exige motivo y nunca borra ITR.
  - Backfill: todos los proyectos quedan con todas las disciplinas de su org, así que no cambia nada.
  - Selector de disciplinas al crear y al editar el proyecto (y en el asistente).
  - La generación filtra por el alcance.
- **R2. Registro de requisitos** (el primer valor real, sin costo de IA): partido en dos sesiones. ✅ **R2a hecho 2026-10-22** (migración `20261201120000`): motor, excepciones, registro con árbol/filtros/paginación, panel del tag, Calidad de datos. **R2b hecho 2026-10-22** (migraciones `20261202120000` + `20261203120000`; bench 50k en proyecto aparte: página 0,07 s, subsistema 0,05 s, Excel de área ~1 s; resumen materializado por tag (migración `20261205120000`): 0,6 s y «faltan» 0,8 s a 50k): Excel de 3 hojas (reporte gerencial · resumen sistema × subsistema × disciplina × etapa · detalle), código del cliente por plantilla (proyecto con defecto de la org) y bench a 50k tags (`tag_requirements_summary` y página, p95 < 1,5 s) con LOADTEST recreado a demanda.
  - Funciones canónicas `tag_itr_requirements` y `tag_requirements_summary`; tabla `tag_itr_overrides` (agregar/excluir, a mano).
  - Página **«Requisitos ITR»** (`/projects/[id]/itrs/requirements`):
    - árbol Área › Sistema › Subsistema con contadores;
    - tabla paginada de tags con un chip por código (falta / generado / aprobado) y origen (Matriz / IA / Manual);
    - filtros «sin tipo», «sin regla», «excluidos» y «fuera de requisitos»;
    - Excel del registro, estilo CHAP;
    - «Generar ITR» con el alcance.
  - Sección «ITR requeridos» en la ficha del tag.
  - `itr_generation_candidates` se reescribe sobre los requisitos; con todas las disciplinas da exactamente lo mismo que hoy (test).
  - Los ITR que quedan fuera de requisitos se marcan en calidad de datos y nunca se borran solos.
- **R3. Tipo de equipo editable y clasificación con IA:** ✅ hecho 2026-10-23 (migración `20261208120000`; decisiones de Luis: elemento sin ITR propio = tipo sin reglas; crear tipo, asignar y correr la IA = Propietario, Administrador y Arquitecto; Haiku 5.5 alcanza: en DEMO los únicos «errores» con el prefijo oculto fueron sinónimos duplicados del catálogo, US$ 0,005 por corrida). Pantalla `/projects/[id]/itrs/requirements/untyped`, «Cambiar tipo» en la ficha del tag.
  - Guard de org para `tags.equipment_type_id`, más un recurso de guard en `withAuth`.
  - Vista previa «gana X, quedan fuera Y» antes de cambiar el tipo.
  - Primero la detección por prefijo (gratis) y después la IA barata (Haiku 5.5, o Sonnet si la prueba de precisión no alcanza) sobre **firmas** de tags: tipo + prefijo + disciplina + descripción normalizada.
  - Tabla `tag_type_proposals`, aceptación por grupo («23 tags "bomba centrífuga agua de enfriamiento" → P») en modo masivo (`createAdminClient({ bulk })` + `emitImportSummary`, sin 20 mil eventos).
- **R4. Ajustes con IA por firma** (Opus 5.5):
  - El modelo ve la base calculada y propone solo agregar o excluir.
  - Muestra el costo estimado antes de correr, se puede reanudar y respeta la cuota de `runAi`.
  - Reemplaza la sugerencia efímera de `suggestItrsForTag`.
  - Lo ya decidido por una persona no se pisa.
- **R5. Liberación con requisitos:**
  - Criterio «requisitos generados»: un ITR requerido que no existe hoy es invisible para la liberación.
  - Política por org: `off` / `warn` / `block`; el valor por defecto lo decides en esa sesión.
  - **Obliga a agregar a los triggers de estado** las tablas nuevas, `tags.equipment_type_id`, `itr_templates` y `equipment_type_templates` (regla de CLAUDE.md), más un bench en un LOADTEST recreado a demanda.

Más adelante, si se pide: **reglas condicionales en la matriz** (SIL, tipo de señal, fluido). La condición ya viene en el Excel de la matriz y hoy se pierde. Hace la propuesta determinista y reduce el uso de IA.

### P — P&ID vivo con límites de sistema (4 sesiones + red-line después)

**Forma principal:** **resaltar el recorrido de líneas** de cada sistema (polilínea gruesa y translúcida), además de **marcas de límite** en los puntos de aislamiento, etiquetas y áreas (solo para skids o paquetes). Un polígono no sirve: en un P&ID los sistemas se entrecruzan.
- Las coordenadas van de 0 a 1 sobre la página ya rotada, y se guarda el tamaño y la rotación de la página al dibujar.
- Se dibuja con un SVG de escala uniforme.
- En el teléfono los límites solo se ven; se dibujan en escritorio y tableta.

- **P1. Bases (sin cambio visible):**
  - `systems.color` estable por proyecto (asignado y editable). Los pines también lo usan; hoy el color de un sistema cambia de plano a plano.
  - Arreglo del borde de `x_pct` = 100.
  - Separar `PidViewer.tsx` (769 líneas) en lienzo, capa de marcas y legenda.
  - Módulo puro `src/lib/pid/geometry.ts` con tests (rotación, ajuste ortogonal, simplificación, distancias).
  - El selector de tags del editor pasa a búsqueda paginada (hoy carga hasta 50 mil tags).
- **P2. Marcas LOSH en escritorio:**
  - Tabla `pid_markups` con capa `losh` / `redline`, que reutiliza `pid_hotspot_guard` y `guard_same_project`, con las RLS de los pines.
  - Trigger `pid_carry_markups`: lleva las marcas LOSH a la revisión nueva «por revisar».
  - Herramientas Resaltar línea · Límite · Etiqueta; leyenda con aislar o atenuar y confirmar lo que está por revisar.
- **P3. Tableta y lectura:**
  - Dibujo táctil (dos dedos mueven, botón «Terminar», deshacer), edición de vértices.
  - Color por estado de la liberación siguiente (de `compute_project_gates`).
  - `?system=` abre el plano con zoom al sistema.
  - Pestaña «Planos» en la ficha de sistema (`file-tabs.ts`) y cobertura LOSH por sistema.
- **P4. Control y entregable:**
  - Aviso cuando un pin cae sobre el resalte de otro sistema.
  - Conectores entre hojas.
  - **PDF LOSH por sistema** (las marcas impresas sobre las hojas), dentro del paquete de handover (`load.ts` + `bundle.ts`).
- **Después (trimestre, F-21):** red-line de campo sobre la misma tabla (capa `redline`): la crea el personal de campo, con estado abierta/incorporada, fotos y comentarios.

### M — Maquetas (1 revisión contigo, antes de E, R2 y P2)

> **Lienzo listo (2026-10-22):** «Maquetas M — Plan referente», https://claude.ai/artifact/T3dMYKAr7soGQzsWH1Qs6s — 9 pantallas en 4 filas, con las preguntas en notas naranjas (incluidas las 4 del doc de insumos). ✅ **Aprobado por Luis el 2026-10-22 tal cual: cada respuesta es lo propuesto en su nota.** Hallazgo al armarlo: en DEMO la matriz tiene 412 filas propuestas y solo 8 aceptadas, así que un registro que cuente solo lo aceptado sale casi vacío (pregunta 1 de R2). DEMO-GLP no tiene fechas en `system_gate_plans` (E1 necesita sembrarlas para verificar) y 37 de 239 tags no tienen tipo.

Una sola sesión de maquetas en un lienzo, como en N1–N3:
- Portafolio unificado.
- Skyline.
- Selector de disciplinas del proyecto.
- Registro «Requisitos ITR» y vista «Sin tipo».
- Panel «ITR requeridos» del tag.
- Visor con límites (escritorio y tableta, leyenda y herramientas).
- Pestaña «Planos» de la ficha de sistema.

**Decisiones de M (Luis, 2026-10-22):**

| Tema | Decisión |
|---|---|
| Menú del Portafolio | La entrada «Portafolio» queda sola arriba, junto a Mi trabajo, sin grupo |
| «Milestone» en inglés | = liberación. Los hitos de arranque pasan a «Key events» en todas partes |
| Portafolio + R2 | Bloque «Requisitos ITR por disciplina» (requeridos · generados · aprobados · % · faltan), como el reporte gerencial de la matriz |
| Logo del cliente | También en la fila de cada proyecto del Portafolio (E2) |
| Skyline (E1) | Caja por sistema en la fecha de **compromiso**; solo pronóstico = borde punteado; sin fecha = bandeja «Sin fecha». Color por avance de esa liberación (aprobada · ≥ 50 % · < 50 %) con el % escrito; vencida (fecha pasada sin aprobar) = borde rojo grueso. Semanas (2 atrás, 9 adelante, hoy resaltado) con conmutador Semana / Mes. Una liberación a la vez, en la URL. Clic → ficha del sistema `?tab=plan&gate=`. Excel con la misma vista. Se siembran fechas de demo en DEMO-GLP |
| Disciplinas (R1) | En el alta y en Configuración del proyecto; por defecto todas. Filtra por la disciplina de la **plantilla**. Quitar una con ITR = vista previa + motivo; los ITR no se borran (quedan «fuera de alcance» en Calidad de datos). Cambian el alcance Propietario, Administrador y Arquitecto. Un «agregar» manual no sale del alcance |
| Registro (R2) | Base = filas **aceptadas** de la matriz, con aviso «N reglas por revisar» que lleva a la matriz. Solo **tags** (las líneas ya son tags PL); paquetes de prueba en una sesión siguiente, con la columna «Elemento» lista. Cantidad requerida **después** (R2 = 1 por tag). Código del cliente **por proyecto** con defecto de la org (chip, PDF, Excel). Excel con 3 hojas: Reporte gerencial · Resumen sistema × subsistema × disciplina × etapa · Detalle por elemento. Chips: falta · generado · en ejecución · aprobado · excluido · fuera de requisitos; origen al pasar el cursor y en la ficha del tag |
| Sin tipo (R2/R3) | R2: lista con enlace para asignar. R3: grupos por firma (prefijo gratis → IA barata), aceptar por grupo con vista previa. Cambiar el tipo nunca borra ITR (quedan «fuera de requisitos»). Prefijos sin tipo en el catálogo: la IA puede proponer crear el tipo |
| ITR requeridos del tag | Arriba de la pestaña ITR; cadena A → B → C por disciplina con aviso de eslabón faltante; Generar (líder+), Excluir con motivo ≥ 10, Agregar código dentro del alcance; en el teléfono del inspector solo lectura |
| Límites en el P&ID (P2) | Resaltar recorrido + barra de límite con los dos códigos + etiqueta, sin polígonos. Color por sistema con conmutador «Por estado». Dibujan Líder+ y Arquitecto. Sistema aprobado: editar queda registrado, no se bloquea. Revisión nueva = marcas «por revisar» |
| Tableta y Planos (P3) | Un dedo dibuja, dos mueven; Deshacer / Terminar grandes; leyenda plegable; teléfono solo ve. Pestaña «Planos» (8.ª) con hojas, cobertura de pines y estado de límites; «Abrir en el plano» con `?system=`; PDF de límites en P4 |

### C — Cierre del backlog (repartido entre los bloques)

| Pendiente | Dónde va |
|---|---|
| Verificar en pantalla las vistas de inspector y cliente (barra del teléfono, Mi trabajo, punch del cliente, TQ, alto contraste) | **Al principio, junto con O** (necesita que inicies sesión con esos usuarios) |
| Advertencia de React «key» en la página del ITR | O |
| D16 resumen diario por correo (elegir proveedor: Resend, SES o el SMTP de Supabase) | Sesión propia cuando elijas proveedor |
| H-20: 37 archivos con `<a href="/…">` → `Link` | De paso en V2 |
| Q: `window.confirm` restantes → `useAskDialog` (G-08), modales accesibles (G-12), autosave del ITR (C-19, B-15), diccionario i18n por página (G-15), casts `as unknown as` (G-18), Playwright de recorridos de campo (G-17), tokens fuera de campo para oscuro y contraste (G-10) | De paso en cada bloque. G-17 en una sesión propia antes de R2 (protege la ejecución de ITR) |
| B-17 (integridad del mismo proyecto, revertido) | Ya cubierto por `guard_same_project`; se cierra en la cobertura |
| D2 base de pruebas aparte | Al recrear LOADTEST en R5 conviene decidirlo de nuevo (hoy los tests escriben en prod) |
| Tuyos: invitar `+smtp2` como cliente y firmar PTC-0001; probar la subida de PDF en Documentos | Cuando puedas |
| Aplazados por ti: ITR v2 Fase 1 y calibración de la tabla v2 (después de tu revisión campo por campo) | Sin fecha; R mejora con un catálogo mejor |
| Trimestre: membresía por proyecto, SSO/MFA y reautenticación al firmar, P6, EDMS, observabilidad, brechas de la API v1, red-line | Después de P |

---

## Orden recomendado

1. **O** + verificación de inspector y cliente.
2. **V1**.
3. **M** (maquetas).
4. **E1**, **E2**.
5. **R1**, **R2** (registro sin IA, ya con valor).
6. **P1**, **P2**.
7. **R3**, **P3**, **R4**.
8. **V2**, **V3** intercalados donde haya espacio.
9. **R5** (cambia el comportamiento de las liberaciones; decides la política).
10. **P4**.

Son unas 20 sesiones. V va antes de M para que las pantallas nuevas nazcan con el vocabulario final.

## Decisiones que quedan para su sesión

- Proveedor de correo (D16).
- Política por defecto del criterio de requisitos (R5): recomiendo `warn`.
- Si un «agregar» manual puede salir del alcance de disciplinas del proyecto: recomiendo que no.
- Si editar un límite de un sistema congelado bloquea o solo queda registrado: recomiendo solo registrar.

## Verificación (por sesión)

- `npm run check` (lint con 0 advertencias, typecheck, build) y `npm test`, incluidos los tests nuevos:
  - **R:** sin regresión de candidatos, alcance, cruce entre organizaciones, filas de `authz-matrix`, drift de las funciones canónicas.
  - **P:** geometría con rotaciones, paridad zod ↔ SQL, carry solo hacia adelante.
  - **V:** paridad de claves es/en con ternarios, menú = h1.
- Migraciones con escenarios y ROLLBACK como en S04–S25; tras cada push, revisar el CI (`gh run`).
- Verificación en pantalla con el navegador integrado: escritorio y 375 px, claro, oscuro y contraste. En P, también la tableta (iPad Safari).
- Bench a 50 mil tags para R2 (`tag_requirements_summary` y candidatos, p95 < 1,5 s) y R5, con LOADTEST recreado a demanda y borrado al terminar.

## Archivos críticos

- **R:**
  - `src/app/actions/itr-matrix.ts`, `src/app/actions/setup.ts`, `src/app/(setup)/setup/SetupWizard.tsx`
  - `supabase/functions-sql/itr_generation_candidates.sql`, `generate_itrs.sql`
  - `src/lib/ai/{run,pricing}.ts`, `src/lib/equipment-types.ts`, `src/app/actions/tags.ts`, `src/lib/auth/{withAuth,access}.ts`
  - `supabase/migrations/20261116120000_gate_status_materialized_s20.sql` (triggers de estado)
- **P:**
  - `src/app/(dashboard)/projects/[id]/documents/[documentId]/viewer/{PidViewer.tsx,page.tsx}`
  - `src/app/actions/pid-hotspots.ts`, `src/lib/systems/colors.ts`
  - `supabase/migrations/20261125120000_pid_as_document_n2d.sql`, `src/lib/systems/file-tabs.ts`
- **E:**
  - `src/app/(dashboard)/projects/[id]/planning/lookahead/page.tsx`, `src/lib/readiness/planning.ts`
  - `src/lib/pdf/{renderer,certificate,itr,register-labels}.ts`
- **V:**
  - `src/i18n/messages/{es,en}.json`, `src/i18n/keys.test.ts`
  - `src/lib/navigation/{menu,titles}.ts`, `docs/MANUAL-COMMUP-POR-ROL.md`
  - `src/app/(dashboard)/dashboard/`, `src/app/(dashboard)/control-tower/`
- **O:** `scripts/loadtest/teardown.sql`, `README.md`, `package.json`, `.gitignore`, `eslint.config.mjs`
