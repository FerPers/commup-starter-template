# Plan de ejecución de la revisión integral — v2 (2026-10-19)

Convierte los **293 hallazgos** de `docs/REVISION-INTEGRAL-2026-10-19.md` (anexos `docs/revision-2026-10-19/A–I`) y la propuesta de navegación (`docs/PROPUESTA-NAVEGACION-2026-10-19.md`) en sesiones de trabajo ordenadas por dependencia y por riesgo.

- **Cobertura:** cada hallazgo, incluidos los 81 bajos, tiene una sesión asignada en [`PLAN-EJECUCION-COBERTURA-2026-10-19.md`](PLAN-EJECUCION-COBERTURA-2026-10-19.md). La tabla se generó cruzando los encabezados de los anexos, no a mano.
- **Detalle técnico** de cada hallazgo (archivo:línea, evidencia, recomendación): en su anexo.

---

## 0. Por qué hay una v2

La v1 (commit `7cd36e9`) se armó rápido y, revisada contra los anexos, tenía estos errores:

1. **Cobertura incompleta.** Cubría unos 60 de los 293 hallazgos. Dejaba fuera 4 del top 20 de la propia revisión: #10 capacidades de firma (D-03/E-02/I-07), #12 Control Tower a escala (B-04/D-07), #18 generación masiva de ITR (C-14) y #19 paquete de handover vacío (E-05/F-22). También faltaban altos de pérdida de datos (C-16 y F-06, reimportaciones que borran datos maestros), de seguridad (I-10, bucle infinito de workflows; I-11, headers de workflows legibles por cualquier miembro) y errores míos de F8 (F-02, F-03, F-05). Ignoraba los 81 bajos, y algunos son de seguridad: D-32 (aprobar un gate valida el rol en la org, no la pertenencia al proyecto), A-23 (SSRF ciego en el endpoint de push), A-19 (funciones DEFINER ejecutables por `anon`), C-42 (borrar un tag borra en cascada su historial de preservación).
2. **Trabajo doble.** Tocaba el mismo módulo dos veces:
   - El punch del inspector se arreglaba por permisos en S1 y se reescribía por RPC en S4.
   - Las colas de Mi trabajo (C-17) iban antes que las firmas requeridas (C-01), y su lógica depende de ellas.
   - Los triggers HTTP duplicados (B-03) se quitaban en S9 y el outbox quedaba para el trimestre.
   - El XSS del certificado (A-12) caía en una sesión de navegación, separado del módulo de certificados.
3. **Fundaciones al final.**
   - La migración canónica del SQL central (D-09) estaba en el trimestre, mientras S2 seguía parchando por ancla las mismas funciones grandes.
   - Los índices (B-05), baratos y requisito de todo lo demás, estaban en S12.
   - Las capacidades de firma no aparecían, así que PSSR y certificados se habrían reescrito con reglas de rol que luego habría que volver a cambiar.
4. **El deploy no se cortaba de verdad.** La v1 solo tocaba `deploy.yml`, pero Cloudflare Workers Builds también despliega en cada push (G-16). Hoy lo confirmé: el run «Deploy» salió *success* con la CI en rojo.
5. **El diagnóstico de la CI estaba mal.** Supuse que los tests de BD no corrían en CI, pero los secretos `TEST_*` existen desde el 2026-09-04 (el CLAUDE.md está desactualizado) y los tests corren **contra la base de producción**. Los 3 que fallan no lo hacen por las claves sino por **tiempo** (`daily_report_data` tarda más de 5 s), que es justo el hallazgo de rendimiento B-20.
6. **No separaba las decisiones de producto.** Varios hallazgos dicen explícitamente «decisión de producto» (I-02: ¿el inspector levanta punch?) o necesitan una regla tuya (firmas por defecto, zona horaria, política de regresión, capacidades, navegación). La v1 las daba por resueltas, contra la regla acordada de proponer antes de ejecutar los cambios de arquitectura y de UI.
7. **Tamaños mal medidos.** La S1 de la v1 mezclaba CI con 5 bugs de producto y una migración; era demasiado para una sesión y con más riesgo.

---

## 1. Cómo está ordenado

1. **Red de seguridad primero.** Ningún cambio de producto llega a producción sin CI verde, un solo camino de deploy y una base de pruebas que no sea la de producción.
2. **Decidir antes de construir.** Cada bloque lista las decisiones tuyas que necesita (§2). Una sesión no empieza sin sus decisiones respondidas.
3. **Cada módulo se toca una vez.** Se agrupa por módulo (ITR, punch, preservación, PSSR, certificados), no por tipo de hallazgo. La seguridad, la integridad y los bugs del mismo módulo van juntos.
4. **Las fundaciones antes que lo que se apoya en ellas:**
   - SQL canónico → todo lo que toque `compute_system_gates`, `daily_report_data`, `take_mgmt_snapshot` y `my_work_counts`.
   - Capacidades de firma → PSSR, certificados, traspaso, PTC y handover.
   - Índices y readiness materializada → avisos de gates y Control Tower v2.
   - Outbox de eventos → push, webhooks y notificaciones.
   - Colas → el nuevo Mi trabajo.
5. **El riesgo de datos antes que la comodidad.** Primero lo que hace perder datos o firma cifras falsas (reimportaciones, offline, reportes inmutables); después la UX.
6. **Lo bajo se arregla de paso.** Cada hallazgo bajo va en la sesión que toca su módulo.

### Dependencias

Dependencias reales (A → B: B necesita A terminada). Lo que no tiene flecha entre sí puede cambiar de orden.

```
S01 → S02 → S03 → todas las demás
S04 → S05 → S19            (firmas requeridas → numeración → generación masiva)
S04 → S22                  (colas por siguiente firma → avisos)
S06 → S18                  (bandeja de punch → offline por usuario)
S09 → S20 → S22, S23       (índices → readiness materializada → avisos y pantallas)
S14 → S16, S17, S24, S25   (capacidades → PSSR, certificados, handover, F6–F7)
S14, S21, S22 → N1 → N2 → N3      (S23 → N2)
S01 → N0                   (en paralelo, en su propio worktree)
Independientes tras S03: S07, S08, S10, S11, S12, S13, S15
```

---

## 2. Decisiones que necesito de ti

Cada una trae mi recomendación. Se responden por bloque, antes de la sesión que la necesita.

| # | Decisión | Mi recomendación | La necesita |
|---|---|---|---|
| D1 | Un solo camino de deploy | GitHub Actions con `needs:` (la CI debe pasar). Tú desconectas Workers Builds en Cloudflare. | S01 |
| D2 | ¿Dónde corren los tests de BD? | Un proyecto Supabase **de pruebas** separado (plan gratuito, 2 proyectos), con usuarios por rol creados por el propio test. Hoy corren contra producción. | S01 |
| D3 | Protección de la rama `main` | Activarla con la CI como check obligatorio (la activas tú en GitHub). | S01 |
| D4 | Firmas requeridas del ITR por defecto | `{ejecutor, supervisor}`; cliente solo donde lo pida la plantilla o la fase. | S04 |
| D5 | ITR atascados en «completado» que ya tienen las firmas requeridas nuevas | Aprobarlos en la migración, con un evento de auditoría «aprobado por regla de firmas v2», y antes listarlos para que los veas. | S04 |
| D6 | Independencia de firmas | Una persona no firma dos capacidades del mismo ITR o certificado. | S04, S17 |
| D7 | Cambio masivo de estado de ITR | Eliminarlo (el estado sale del contenido y las firmas) y reemplazarlo por reasignar, reprogramar y agregar a un plan. | S05 |
| D8 | ¿El inspector levanta punch? | Sí, y también comenta y adjunta. Recategorizar y cancelar quedan para supervisor+, con motivo, y cancelar lo hace otra persona. | S06 |
| D9 | Reimportación | Una columna que no viene en el archivo no se toca; mover de subsistema un tag con ITR o punch exige un flujo explícito. | S07 |
| D10 | Preservación: ¿cuándo avanza la próxima fecha? | Al **finalizar** el registro, con cualquier resultado. Un resultado NOK genera un punch o una acción. | S08 |
| D11 | Snapshots históricos calculados con datos truncados | Marcarlos como «sospechosos» (no se pueden recalcular hacia atrás). | S09 |
| D12 | Zona horaria y reportes ya emitidos | `projects.timezone` (por defecto `America/Bogota`). Los reportes emitidos con cifras truncadas quedan inmutables con una nota; se corrige solo si alguien emite una revisión. | S10 |
| D13 | Regresión de un gate | El gate anterior en regresión **bloquea** el siguiente; una dependencia entre sistemas en regresión es **condición** (amarillo). Configurable por org. | S11 |
| D14 | Modelo de firmantes | Capacidades por persona y proyecto (`commissioning`, `operations`, `hse`, `client_rep`) que asigna un líder, y opcionalmente la empresa de F8. El rol queda como piso. La membresía por proyecto (que el cliente vea solo sus proyectos) va al trimestre, salvo que tengas ya un cliente con varios proyectos en la misma org. | S14 |
| D15 | Quién firma «Cliente» en el certificado | Quien tenga la capacidad `client_rep` (rol `client` o empresa owner). | S17 |
| D16 | Canales de aviso | En la app + push + resumen diario por correo; el usuario elige temas. | S22 |
| D17 | Contenido del handover v2 | Todo F1–F8 con hashes, más los PDF de procedimientos y del PTC dentro de un ZIP. | S24 |
| D18 | Propuesta de navegación | Aprobar N0 ya (son arreglos); N1–N3 se revisan contigo sobre maquetas antes de construirlos. | N0, N1 |

---

## 3. Reglas de cada sesión

1. **Antes:** `git pull`; `gh run list --limit 5` (si la CI está roja, se arregla primero); leer en su anexo los hallazgos de la sesión; **verificar que siguen vigentes** en el código o en prod.
2. **Migraciones:** se prueban con `BEGIN … escenario DO/RAISE … ROLLBACK`. Se aplican en prod **solo con tu autorización explícita** en el chat. Después se regeneran los tipos (conservando las 6 líneas de cabecera). Desde S03, una función central se edita en su archivo canónico, nunca por ancla.
3. **Paridad:** si cambia una regla que existe en SQL y en TS, cambian las dos y su test.
4. **Test primero:** cada hallazgo de permisos se agrega a la suite rol × tabla (S01) como caso que hoy falla, y la sesión lo pone en verde.
5. **Cierre:** `npm run check` + `npm test` → commit → push → **CI verde** (no se cierra con la CI roja) → se retiran del manual (§8) las limitaciones corregidas → se marca el avance en la tabla de cobertura → memoria (`RETOMAR AQUÍ`).

---

## 4. Sesiones

Tamaño: S ≈ media sesión · M ≈ una sesión · L ≈ dos o más. Una sesión ≈ 3–4 h.

### Hito A — Seguro para seguir trabajando

**S01 — Red de seguridad: CI, deploy único y base de pruebas** · M · decisiones D1–D3
- G-01: los 3 tests de `tests/db/daily-report.test.ts` fallan por tiempo (5 s). Medir `daily_report_data` en el proyecto de prueba y subir el timeout de ese `it` con su razón; la causa de fondo (B-20) va en S10.
- G-16: `deploy.yml` con `needs:` sobre lint, typecheck y test (o `workflow_run` con `success`). Script que falla el build si falta alguna `NEXT_PUBLIC_*`. Tú desconectas Workers Builds.
- D2: proyecto Supabase de pruebas con las migraciones aplicadas y usuarios por rol creados por el setup del test. Secretos `TEST_*` apuntando ahí.
- A-17: esqueleto de la **suite de autorización** rol × tabla × operación (owner/admin/architect/leader/inspector/client), con los casos que hoy fallan marcados como pendientes, para que cada sesión los vaya poniendo en verde.
- A-14: volcar a una migración los GRANT y las políticas de storage vigentes, sin cambiar comportamiento (necesita lectura de prod autorizada).
- De paso: G-24, G-25, G-26 (corregir el CLAUDE.md: los tests de BD sí corren en CI), D-37, E-35.
- **Listo cuando:** un push con un test roto **no despliega**; la CI corre contra la base de pruebas; existe la suite de autorización.

**S02 — Seguridad rápida** · M
- A-12 (XSS en certificado), A-18 (redirección abierta), I-10 (bucle de workflows: ignorar `created_via='workflow'` y limitar la profundidad), I-11 (headers de workflows solo para privilegiados), G-05 (`microphone=(self)` para el dictado por voz), I-22, C-25/A-24 (filtros `.or()` sin escapar), F-09/A-29 (inyección de fórmulas en exportaciones), A-19 (DEFINER del baseline ejecutables por `anon`), A-20, A-23 (SSRF ciego de push), A-26, A-27, D-32 (`approve/sign_system_gate` sin pertenencia al proyecto), F-27.
- **Listo cuando:** cada uno tiene un test (unitario o de la suite) que antes fallaba.

**S03 — SQL canónico** · M
- D-09/B-19/E-26: una migración con el `CREATE OR REPLACE` completo de `compute_system_gates`, `compute_project_gates`, `my_work_counts`, `daily_report_data` y `take_mgmt_snapshot` tal como están en prod; los mismos cuerpos en `supabase/functions-sql/*.sql`; y un test de deriva que compare `pg_get_functiondef` con esos archivos. Sin cambiar comportamiento.
- De paso: B-28 (tabla de respaldo vieja), F-35.
- **Listo cuando:** el test de deriva pasa y los parches por ancla dejan de ser necesarios.

### Hito B — Que el campo funcione

**S04 — ITR: firmas requeridas e independencia** · M–L · D4–D6
- C-01/I-05: `required_signatures` por plantilla o fase; `sign_itr_atomic` aprueba cuando están todas; pantalla para completar asignaciones; migración de los ITR existentes según D5.
- A-08: personas distintas por firma.
- C-02: `localItrStatus` con `sourceRows` (loop check y C&E), con test.
- C-17: colas de Mi trabajo por **siguiente firma pendiente**, igual en `my_work_counts` y en la lista (ahora sí, sobre las firmas requeridas nuevas).
- De paso: C-36, C-38, I-24.
- **Listo cuando:** un ITR de lazo sin cliente se aprueba con ejecutor + supervisor distintos, en línea y sin red; el badge coincide con la lista.

**S05 — ITR: contenido, estados y numeración** · M · D7
- C-10 (quitar el cambio masivo de estado y `bulkApproveItrs`), C-34 (`itrs_update` sin cliente), C-26, C-20, C-21, C-23 (devolver con observaciones), C-15 (número atómico por código de plantilla).
- Panel «Documentos de referencia» del ITR debajo de los ítems o plegado (mi regresión de F8 en móvil).
- De paso: A-28, C-40.

**S06 — Punch: permisos de campo y escritura por RPC** · M–L · D8
- C-03/A-15/I-02: el inspector levanta, comenta y adjunta; la bandeja offline no descarta en silencio un error de permiso (va a «No sincronizado»).
- A-06/I-04/C-11: escritura sensible solo por RPC; cancelar y bajar de categoría con motivo, rol y otra persona; auditado; un Cat A cancelado re-evalúa los certificados.
- C-04/A-03 (lo que no cubrió el hotfix): máquina de estados de Ops; `closed_final` solo desde `verified_ops` y por otra persona.
- C-22 (punch desde el ITR con foto, ítem y responsable), B-10 (contador de numeración), F-01 (PDF con saltos de línea).
- De paso: C-41, C-44.

**S07 — Importaciones sin pérdida de datos** · M · D9
- C-16 (reimportar tags borra datos maestros y mueve tags con ITR), F-06 (reimportar señales borra la cadena del loop check), C-24, F-23 (archivo entero en una sola action; índices grandes), F-16 (corregir una JB sin reimportar), C-28 (setup no transaccional).
- Vista previa del diff por campo antes de aplicar.
- De paso: F-32, F-36.

**S08 — Preservación** · M · D10
- C-05/I-03 (el inspector finaliza y no se guarda nada), C-06 (la fecha avanza al primer toque): una RPC `finalize_preservation_record`.
- H-08 (vista por proyecto), I-14, C-27.
- De paso: C-39, C-42 (el borrado en cascada del historial pasa a `RESTRICT` o a archivado).

### Hito C — Números verdaderos

**S09 — Índices y «cero filas para contar»** · M–L · D11
- B-05 + B-09 (índices con `CONCURRENTLY`, fuera de transacción: procedimiento especial, autorizado aparte).
- B-01/D-08/B-25 (snapshot KPI en SQL con clave única), B-02 (elegibilidad de certificados agregada), F-04, B-07, B-08 (`fetchAllRows` con orden único y marca «truncado»), B-24 (una sola definición de «abierto» y «vencido»), F-07, F-08, E-20, D-24, B-22, `KpiSummaryWidget` con todas las fases.
- Regla de lint o de CI: un `.from()` sin límite sobre tablas de proyecto debe justificarse.
- De paso: B-27, F-29.
- **Listo cuando:** en LOADTEST (50k tags) los totales de KPI, certificados y reporte imprimible coinciden con `count(*)`.

**S10 — Reporte diario y zona horaria** · M · D12
- D-06 (`{count, items}` por bloque), D-05/E-15/G-13 (`projects.timezone` en reporte, vencimientos, relevos, snapshots y PDF), D-27, B-20 (rendimiento de `daily_report_data`: el test de S01 vuelve a 5 s), B-26.
- De paso: B-29, D-28, D-29, D-30.

**S11 — Lógica de gates** · M · D13
- D-02 (la regresión propaga), D-13 (un Cat A nuevo no regresa todos los gates), D-11 (una sola regla PSSR), E-07, E-08, E-14, D-10 (mi `documents_current` incumple §15.4), D-14, D-15, D-17, D-20 (cambios de configuración que reescriben el pasado), D-21.
- De paso: D-31, D-33, D-34, D-35, F-28.

**S12 — IIoT confiable** · M
- E-04/B-18 (señal por proyecto, `ambiguous_signal` en lugar de `LIMIT 1`), E-24 (NaN y fechas futuras), E-03/B-12 (RPC `signal_series` sargable y reducida; partición), E-18, E-06 (consola que mezcla congelado y en vivo).
- De paso: E-28, E-33.

**S13 — Correcciones de F8 (documentos y vendors)** · M
- F-03 (vigente por fecha de emisión), F-05 (KPI de vendors con re-pruebas), F-02 (referencias automáticas y revalidación masiva), F-12, F-20, F-11, F-10 (unidad MΩ en el PDF), F-15, F-18/C-31 (QR), F-19.
- De paso: F-24, F-25, F-30, F-31, F-33, F-34.

### Hito D — Firmas que prueban algo

**S14 — Firmantes designados (capacidades) y roles** · L · D14
- D-03/E-02/I-25/F-14: tabla de capacidades por persona × proyecto, pantalla para que el líder las asigne y una función `has_capacity()` usada por gates, hold points, testigos, traspasos y PTC (compatible: al inicio replica el rol actual).
- I-15: una sola fuente de constantes de rol (hoy duplicadas en más de 12 sitios).
- De paso: E-30.

**S15 — Miembros, auditoría y cuotas** · M
- A-02/I-12 (miembros por RPC; nunca 0 owners), A-11/I-16 (audit log y notificaciones no falsificables), A-13/I-19 (rate limit en API v1, IA y push), I-21 (ciclo de vida de usuarios), D-16/I-27 (DEC inmutables a nombre de otro).
- De paso: A-21, A-22, A-25, A-30, C-43, E-37.

**S16 — PSSR por RPC** · M
- A-04, C-12, C-32: aprobar solo desde `pending_approval` con todo sí/NA, firmas propias y aprobador distinto, usando capacidades.

**S17 — Certificados por RPC** · M · D6, D15
- A-05, C-13, I-06, B-14, C-33: emitir y firmar por RPC con elegibilidad en SQL, número atómico, firmantes distintos por capacidad; reabrir re-evalúa; el certificado se invalida si cambia la base.

**S18 — Offline por usuario** · L (2 sesiones)
- C-08/A-09/E-01/G-02/G-03: `userId`/`orgId` en cada entrada; replay solo de lo propio; logout con «sincronizar o descartar» y purga de cachés; no cachear `/auth/v1/`.
- C-07 (una respuesta rechazada no bloquea la cola), C-35/B-16 (hora de captura acotada en lugar de comparar relojes), C-09 (preparar ITR para trabajar sin red; mostrar lo encolado al recargar).
- Se prueba en una PWA instalada con la red cortada.
- De paso: C-37, E-27, G-20, G-23.

### Hito E — Escala y avisos

**S19 — Generación masiva de ITR** · M–L
- C-14: generar por alcance × fase desde la matriz aprobada, con vista previa, asignación por disciplina y RPC idempotente por lotes (usa la numeración de S05 y las firmas requeridas de S04). C-30 (filtros por sistema, subsistema, área y responsable).

**S20 — Readiness a escala** · L (2 sesiones)
- B-04 (motor set-based, `SECURITY DEFINER` con una sola verificación de pertenencia), D-07 (estado materializado `system_gate_status` con «sistema sucio» + recálculo), B-06 (políticas set-based), B-13 (`my_work_counts` cacheado), G-07 (`cache()` de membresía), B-23, B-17 (FK compuestas), B-21.
- **Listo cuando:** Control Tower de LOADTEST carga por debajo de un presupuesto acordado (p. ej. p95 < 1,5 s) y la prueba de carga queda como banco reproducible.

**S21 — Bus de eventos (outbox)** · M
- B-03/I-08/I-17/B-11: un trigger en lugar de tres, `dispatched_at` + cursor, catálogo de eventos versionado con nombres consistentes, `UNIQUE(subscription, event)`, HMAC con `event_id` y fecha, retry versionado en el repo, modo masivo para importaciones.
- De paso: B-30 (retención), F-26.

**S22 — Avisos y colas** · M–L · D16
- D-04/H-02: colas `gates_to_approve`, `gates_to_cosign`, `gates_regressed`, `registers_to_authorize/verify`, `daily_reports_to_issue`, `tq_answered`; una notificación desde cada RPC que crea una obligación para otra persona y desde las transiciones de S20.
- I-09 (push desde `notifications`), D-23 (colas por proyecto, no por org), resumen diario por correo.
- De paso: G-22, D-36, I-28.

**S23 — Readiness v2 (pantallas)** · M–L
- D-01/D-18 (Control Tower con los números del motor; un solo «avance»), D-19 (filtros, orden, búsqueda, exportación), H-12 (dentro del proyecto), D-12 (seguimiento de «aprobado con condiciones»), D-25, D-26, D-22.

### Hito F — Entregable y cierre

**S24 — Paquete de handover v2** · M–L · D17
- E-05/F-22/E-22: incluir gates con firmas, procedimientos, ejecuciones, line-ups, hitos, traspaso, competencias, repuestos, PTC, documentos y vendors, con hashes y PDFs adjuntos; respaldo imprimible.
- De paso: E-31 (firma verificable por la operadora).

**S25 — Correcciones de F6–F7** · M
- E-09, E-10, E-11, E-12, E-13 (justificaciones de relleno en el traspaso), E-16, E-17, E-19 (exclusiones sin reconocimiento), E-21, E-23 (valor fuera de rango en un paso).
- De paso: E-29, E-32, E-34, E-36.

### Navegación (necesita D18)

- **N0 — Arreglos rápidos** · M · **en paralelo** desde que termine S01, en su propio worktree (toca otros archivos): H-01, H-04, H-05/G-04, H-07, H-11, H-06, H-13, H-14, H-16, y los 12 arreglos del §12 de la propuesta. De paso: G-21, H-19, H-22, H-23, H-24.
- **N1 — Mi trabajo y menú por fase y rol** · L · después de S14 (roles) y S22 (colas): H-03, H-09, C-29 (ejecución en teléfono). De paso: H-18, H-20, D-38.
- **N2 — Readiness y fusiones** · L · después de S23: H-10, H-15/F-13 (Documentos con visor P&ID), G-14.
- **N3 — Buscar sin navegar** · M: H-17 (⌘K con `search_everything`, ＋Crear). De paso: H-21.

### Calidad transversal (Q) — de paso en cada sesión y con sesiones propias cuando se acumule

G-06 (i18n de 52 componentes y errores de servidor), G-08/E-34 (`ConfirmDialog` en lugar de 56 `window.confirm`, primero en firmas y emisiones), G-09–G-12 (design system, modo oscuro, contraste y accesibilidad), G-15, G-17 (Playwright en CI para los recorridos de campo), G-18, G-19, C-18, C-19, B-15.

### Trimestre (T)

A-16/I-07 (membresía por proyecto), I-18 (API v1), I-20/E-25 (SSO, MFA y reautenticación al firmar), I-23 (P6), F-17 (EDMS), F-21 (red-line de campo), I-26 (observabilidad), readiness por proyecto (D-34, si D14 lo pide).

---

## 5. Calendario estimado

Alrededor de **35 sesiones** (S01–S25, con S14, S18, S20 y S22 dobles, más N0–N3). A una sesión por día hábil son **7–8 semanas**, con N0 en paralelo.

| Hito | Sesiones | Qué cambia para el usuario |
|---|---|---|
| A — Seguro para seguir | S01–S03 (+N0 en paralelo) | Nada se despliega roto; huecos de seguridad cerrados; la app abre en Mi trabajo |
| B — Campo funciona | S04–S08 | Se firman todos los ITR; el inspector levanta punch; reimportar no borra; preservación real |
| C — Números verdaderos | S09–S13 | KPIs, certificados y reporte diario con cifras reales y en hora local |
| D — Firmas que prueban algo | S14–S18 | Operaciones/HSE/Cliente son personas designadas; PSSR y certificados blindados; tablet compartida segura |
| E — Escala y avisos | S19–S23 | ITR masivos, Control Tower rápido, la gente recibe sus tareas |
| F — Entregable | S24–S25, N1–N3 | Handover completo y navegación por fase y rol |

## 6. Riesgos del plan

- **Migraciones de comportamiento** (S04, S06, S16, S17) cambian reglas sobre datos vivos de Geopark: cada una lista antes qué registros afecta y se aplica fuera de horario.
- **Índices `CONCURRENTLY`** (S09) no pueden ir dentro de la transacción habitual: procedimiento aparte, autorizado aparte.
- **S14 es la decisión más grande** (capacidades). Si D14 se pospone, se pospone el Hito D completo; S16 y S17 no deben hacerse con reglas de rol que luego cambiarían.
- **La base de pruebas (D2)** es requisito del ritmo: sin ella cada test de permisos escribe en producción.
- **Pendientes de Luis** que no bloquean: invitar `+smtp2` como Cliente y firmar PTC-0001; probar la subida de PDF en Documentos.
