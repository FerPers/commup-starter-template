# Cobertura del plan de ejecución definitivo — 2026-10-19

Cada uno de los 293 hallazgos de la revisión integral (anexos A–I) tiene una sesión asignada en `docs/PLAN-EJECUCION-REVISION-2026-10-19.md`. Se generó cruzando los encabezados de los anexos; la columna «Anexo» lleva al detalle (ubicación, evidencia, recomendación).

Totales: 11 críticos · 70 altos · 131 medios · 81 bajos = 293.

| Sesión | Crít. | Altos | Medios | Bajos |
|---|---|---|---|---|
| HECHO · Ya corregido (hotfix 7eb0a7c / fa6277e) | 2 | 1 | 2 | 0 |
| S01 · Red de seguridad: CI, deploy único y base de pruebas | 1 | 0 | 3 | 5 |
| S02 · Seguridad rápida | 0 | 3 | 4 | 10 |
| S03 · SQL canónico | 0 | 1 | 2 | 2 |
| S04 · ITR: firmas requeridas e independencia | 2 | 2 | 1 | 3 |
| S05 · ITR: contenido, estados y numeración | 0 | 2 | 5 | 2 |
| S06 · Punch: permisos de campo y escritura por RPC | 2 | 7 | 2 | 2 |
| S07 · Importaciones sin pérdida de datos | 0 | 2 | 4 | 2 |
| S08 · Preservación | 0 | 3 | 3 | 2 |
| S09 · Índices y «cero filas para contar» | 2 | 6 | 7 | 2 |
| S10 · Reporte diario y zona horaria | 0 | 2 | 5 | 4 |
| S11 · Lógica de gates | 0 | 1 | 11 | 5 |
| S12 · IIoT confiable | 0 | 3 | 4 | 2 |
| S13 · Correcciones de F8 (documentos y vendors) | 0 | 3 | 8 | 6 |
| S14 · Firmantes designados (capacidades) y roles | 0 | 2 | 2 | 2 |
| S15 · Miembros, auditoría y cuotas | 0 | 2 | 6 | 7 |
| S16 · PSSR por RPC | 0 | 2 | 1 | 0 |
| S17 · Certificados por RPC | 0 | 3 | 2 | 0 |
| S18 · Offline por usuario | 0 | 6 | 3 | 4 |
| S19 · Generación masiva de ITR | 0 | 1 | 1 | 0 |
| S20 · Readiness a escala | 1 | 4 | 3 | 0 |
| S21 · Bus de eventos (outbox) | 1 | 2 | 1 | 2 |
| S22 · Avisos y colas | 0 | 3 | 1 | 3 |
| S23 · Readiness v2 (pantallas) | 0 | 1 | 7 | 0 |
| S24 · Paquete de handover v2 | 0 | 1 | 2 | 1 |
| S25 · Correcciones de F6–F7 | 0 | 0 | 10 | 4 |
| N0 · Navegación N0 (arreglos rápidos) | 0 | 4 | 6 | 5 |
| N1 · Navegación N1 | 0 | 1 | 2 | 3 |
| N2 · Navegación N2 | 0 | 0 | 4 | 0 |
| N3 · Navegación N3 | 0 | 0 | 1 | 1 |
| Q · Calidad transversal | 0 | 1 | 12 | 0 |
| T · Trimestre | 0 | 1 | 6 | 2 |

## HECHO — Ya corregido (hotfix 7eb0a7c / fa6277e)

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| A-01 | Crítico | seguridad — Cualquier miembro puede crearse una API key con scope `*` | [A-seguridad.md:30](revision-2026-10-19/A-seguridad.md) |
| I-01 | Crítico | Cualquier miembro (incluido client e inspector) puede crear una API key con alcance `*` | [I-roles-integraciones.md:176](revision-2026-10-19/I-roles-integraciones.md) |
| A-07 | Alto | seguridad — Funciones DEFINER del baseline sin control: emails de cualquier org e ingesta IIoT en cualquier org | [A-seguridad.md:72](revision-2026-10-19/A-seguridad.md) |
| A-10 | Medio | seguridad — El secreto HMAC de los webhooks es legible por cualquier miembro | [A-seguridad.md:93](revision-2026-10-19/A-seguridad.md) |
| I-13 | Medio | `projects_insert` con tautología: inserción de proyectos en otra org | [I-roles-integraciones.md:303](revision-2026-10-19/I-roles-integraciones.md) |

## S01 — Red de seguridad: CI, deploy único y base de pruebas

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| G-01 | Crítico | CI/CD — CI en rojo desde hace 18 pushes y el deploy a producción no depende de ella | [G-frontend-calidad.md:78](revision-2026-10-19/G-frontend-calidad.md) |
| A-14 | Medio | mantenibilidad / seguridad — Grants y políticas de storage fuera de control de versiones | [A-seguridad.md:121](revision-2026-10-19/A-seguridad.md) |
| A-17 | Medio | mantenibilidad — No hay tests de autorización por rol dentro del tenant | [A-seguridad.md:142](revision-2026-10-19/A-seguridad.md) |
| G-16 | Medio | CI/CD — Dos pipelines de deploy en paralelo con variables distintas | [G-frontend-calidad.md:196](revision-2026-10-19/G-frontend-calidad.md) |
| D-37 | Bajo | Tests — Los tests de BD del motor (`tests/db/readiness.test.ts`, `dependencies.test.ts`, `daily-management.test.ts`, `registers.test.ts`…) no corren en CI porque faltan l | [D-readiness-gestion.md:237](revision-2026-10-19/D-readiness-gestion.md) |
| E-35 | Bajo | Seeds DEMO — la DEMO nunca ejercita la ingesta real (E-04, E-24) ni la carga a 1 Hz (E-03). Re-ejecutar un seed rompe el ot | [E-arranque-operacion.md:303](revision-2026-10-19/E-arranque-operacion.md) |
| G-24 | Bajo | Dependencias — Higiene menor | [G-frontend-calidad.md:248](revision-2026-10-19/G-frontend-calidad.md) |
| G-25 | Bajo | Rendimiento/Workers — Sin presupuesto de tamaño del Worker | [G-frontend-calidad.md:256](revision-2026-10-19/G-frontend-calidad.md) |
| G-26 | Bajo | Documentación/i18n — CLAUDE.md desactualizado y el idioma del perfil no se usa | [G-frontend-calidad.md:262](revision-2026-10-19/G-frontend-calidad.md) |

**Estado S01 (2026-10-19):**
- G-01 ✅ (S1-v1: deploy con `needs`; `deploy.yml` ya no existe). Faltan D1 (desconectar Workers Builds) y D3 (protección de `main`), que hace Luis.
- G-16 ✅ código: el deploy valida las `NEXT_PUBLIC_*` (`scripts/ci/check-public-env.mjs`) y pasa VAPID/SITE_URL/beacon (por `vars` con respaldo). Se cierra del todo con D1.
- G-25 ✅ `scripts/ci/worker-size.mjs` en el deploy (3.90 MB gzip en el primer deploy por CI, 1532c46; aviso 5, falla 6).
- G-24 ✅ SDK de Anthropic a `dependencies`; fuera `class-variance-authority`, `date-fns`, `@eslint/eslintrc`; `next` y `next-intl` fijados; test de paridad de `pdf.worker.min.mjs`. `html5-qrcode` sigue (reemplazo → Q).
- G-26 ◐ CLAUDE.md actualizado. Idioma del perfil **aplazado**: `profiles.locale` tiene default `'es'` y no distingue «eligió» de «nunca eligió»; usarlo forzaría español a quien navega en inglés. Requiere default NULL → S15.
- D-37 ✅ verificado: los 13 archivos de `tests/db` corren en CI (run 39280520991: 64/64 sin omitir).
- E-35 ✅ el seed de arranque borra solo su lote (`source_system`); simulador 1 Hz por la API real en `scripts/demo-data/simulate-signals.mjs` (falta una API key DEMO para correrlo).
- A-17 ✅ esqueleto `tests/db/authz-matrix.test.ts`: 13 casos × 6 roles + outsider, sondas que nunca escriben (D2 = prod). Huecos abiertos con `it.fails` (A-02 → S02, A-04 → S16, A-05 → S17, A-06 → S06); A-01 ya estaba cerrado por el hotfix 7eb0a7c y la suite lo confirma (nadie inserta en `api_keys` directo). Hoy corren solo admin (TEST_USER_A) y outsider (TEST_USER_B); las demás columnas esperan usuarios `TEST_ROLE_<ROL>_*`.
- A-14 ✅ migración `20261026120000_privileges_storage_snapshot.sql` (9 buckets, 4 políticas no versionadas, EXECUTE de 260 funciones, desviaciones de tablas) + generador `scripts/db/dump-privileges.sql`. ✅ Probada con ROLLBACK y **aplicada en prod** 2026-10-19 (autorizada por Luis): privilegios, buckets y políticas idénticos antes y después.
- **Hallazgo nuevo (S01-N1):** el bucket `org-assets` que usa `uploadOrgLogo` no existe en prod → subir el logo de la org falla. Va a S02.

## S02 — Seguridad rápida

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| G-05 | Alto | Funcional/PWA — `Permissions-Policy: microphone=()` desactiva el dictado por voz de la ejecución de ITR | [G-frontend-calidad.md:113](revision-2026-10-19/G-frontend-calidad.md) |
| I-10 | Alto | Workflows: bucle infinito con `create_punch` | [I-roles-integraciones.md:277](revision-2026-10-19/I-roles-integraciones.md) |
| I-11 | Alto | Secretos de webhooks y headers de workflows legibles por cualquier miembro | [I-roles-integraciones.md:285](revision-2026-10-19/I-roles-integraciones.md) |
| A-12 | Medio | seguridad — XSS almacenado en el detalle de certificado | [A-seguridad.md:107](revision-2026-10-19/A-seguridad.md) |
| C-25 | Medio | bug/seguridad baja — La búsqueda rompe el filtro `or()` de PostgREST | [C-completions.md:213](revision-2026-10-19/C-completions.md) |
| F-09 | Medio | Seguridad / Exportación · Confianza alta — la inyección de fórmulas tiene sentido justamente en CSV. Cualquier miembro, o la API v1 de punches, puede esc | [F-ingenieria-docs-vendors.md:158](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| I-22 | Medio | `/api/admin/export` usa la primera membresía y no la org activa | [I-roles-integraciones.md:388](revision-2026-10-19/I-roles-integraciones.md) |
| A-18 | Bajo | seguridad — Redirección abierta en `/auth/confirm` | [A-seguridad.md:149](revision-2026-10-19/A-seguridad.md) |
| A-19 | Bajo | seguridad — Otras DEFINER del baseline sin control y ejecutables por `anon` | [A-seguridad.md:156](revision-2026-10-19/A-seguridad.md) |
| A-20 | Bajo | seguridad — `completeSetup` crea orgs con service role para cualquier autenticado y acepta campos de más | [A-seguridad.md:162](revision-2026-10-19/A-seguridad.md) |
| A-23 | Bajo | seguridad — El endpoint de push es una URL arbitraria que el servidor llama (SSRF ciego) | [A-seguridad.md:182](revision-2026-10-19/A-seguridad.md) |
| A-24 | Bajo | bug / seguridad — Filtros `.or()` de PostgREST construidos con texto de búsqueda sin escapar | [A-seguridad.md:189](revision-2026-10-19/A-seguridad.md) |
| A-26 | Bajo | seguridad — Subidas sin lista de tipos MIME y logo con extensión libre | [A-seguridad.md:202](revision-2026-10-19/A-seguridad.md) |
| A-27 | Bajo | seguridad — Detalles de endurecimiento | [A-seguridad.md:208](revision-2026-10-19/A-seguridad.md) |
| A-29 | Bajo | seguridad — El guard anti fórmulas no se aplica en todas las exportaciones | [A-seguridad.md:219](revision-2026-10-19/A-seguridad.md) |
| D-32 | Bajo | Seguridad — `approve_system_gate` y `sign_system_gate` validan el rol en la org, no la pertenencia al proyecto, y la evaluación interna corre como definer, sin RLS (`2026 | [D-readiness-gestion.md:227](revision-2026-10-19/D-readiness-gestion.md) |
| F-27 | Bajo | Seguridad (higiene) · Confianza alta — bajo, porque la RLS limita al editor de sus propios proyectos, pero puede dejar una fila apuntando a un archiv | [F-ingenieria-docs-vendors.md:354](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

**Estado S02 (2026-10-19, 649c2a5 + 5999391; migración `20261027120000_quick_security_s02.sql` probada con ROLLBACK —17 escenarios— y **aplicada en prod** con autorización de Luis; `evaluate-workflow` desplegada):** todos verificados vigentes antes de tocar.
- G-05 ✅ `microphone=(self)` (verificado en el dev server) + aviso «Micrófono bloqueado» en `MicAppend`. Falta probarlo en Chrome Android / iOS PWA.
- I-10 ✅ edge: ignora `.created` con `created_via='workflow'`, tope 30 ejecuciones/min por regla, `block_certificate` idempotente; action + UI rechazan «punch creado → crear punch» (`src/lib/workflows/rules.ts`).
- I-11 ✅ `webhook_subscriptions.secret` sin SELECT de columna para nadie (solo RPC al crear y dispatcher); `webhook_subscriptions` y `workflow_rules` (lectura y escritura) solo owner/admin/architect (`is_org_privileged`). Los headers siguen en claro en `action_payload`, ahora visibles solo para privilegiados (cifrarlos en Vault queda como mejora, Q).
- A-12 ✅ `t.rich` en los modales de reabrir/revocar. A-18 ✅ `safeNextPath`. C-25/A-24 ✅ `normalizeSearch` pasa `,()"*` a `_`; los `.or()` con `systemId` usan el id ya validado.
- F-09/A-29 ✅ `toSafeCsv` en los CSV de punches e ITR, `sanitizeAoa` en la matriz ITR; el guard cubre espacios antes del signo.
- I-22 ✅ export con `getActiveMembership` + `fetchAllRows` (sin tope de 1000). A-20 ✅ zod (`src/lib/setup/schema.ts`), filas campo a campo, una org por usuario.
- A-19 ✅ las 23 funciones con EXECUTE para anon/PUBLIC quedan para authenticated/service_role; `bump_push_subscription_failure` e `itr_test_equipment_blocker` solo service_role. (El resto del hallazgo ya lo había cerrado el hotfix.) Nota: los default privileges de Supabase siguen dando EXECUTE a anon en funciones NUEVAS → cada migración debe revocar (regla ya en CLAUDE.md).
- A-23 ✅ lista blanca de servicios push en subscribe y en el envío. A-26 ✅ logo solo PNG/JPG/WebP con extensión por MIME; `allowed_mime_types` en gate-evidence, mgmt-evidence y project-documents (sin HTML/SVG; el cliente manda `application/octet-stream` si el navegador no sabe el tipo).
- A-27 ✅ secreto de cron en tiempo constante, HSTS `includeSubDomains`, sal `LEADS_IP_SALT` (con respaldo a CRON_SECRET hasta que Luis cree el secreto). **Sin `preload`** (es un compromiso con la lista de navegadores: decisión de Luis). `'unsafe-inline'` sigue como deuda documentada.
- D-32 ✅ `approve_system_gate`/`sign_system_gate` exigen `is_project_member` (parche por ancla; hoy equivale a ser de la org, protege cuando exista membresía por proyecto).
- F-27 ✅ `upsertHotspot` verifica que el documento sea del proyecto; `deletePidDocument` lee la ruta de la BD y filtra por proyecto; documentos = PRIVILEGED (como storage y UI), ubicar tags = EDITOR también en la UI.
- **A-02 (de S15) adelantado ✅** trigger `org_members_owner_guard`: solo un owner asigna/cambia/quita owners y nunca 0 owners. S15 sigue con la gestión de miembros por RPC. En `authz-matrix` dejó de ser `gap`.
- **S01-N1 ✅** bucket público `org-assets` (2 MB, PNG/JPG/WebP) con políticas owner/admin por `<org_id>/…`. Falta probar la subida en la UI con sesión.
- Tests: unit (`safe-redirect`, `secret-compare`, `push/endpoint`, `setup/schema`, `workflows/rules`, `excel/sanitize`, `list/params`) + `authz-matrix` (workflow_rules, secreto de webhooks, EXECUTE de anon y de DEFINER internas).

## S03 — SQL canónico

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-09 | Alto | Mantenibilidad — Las funciones centrales solo existen como parches de texto | [D-readiness-gestion.md:100](revision-2026-10-19/D-readiness-gestion.md) |
| B-19 | Medio | Higiene de migraciones — El cuerpo efectivo de las funciones críticas no está en ningún archivo | [B-datos-rendimiento.md:431](revision-2026-10-19/B-datos-rendimiento.md) |
| E-26 | Medio | Mantenibilidad (parches por ancla de texto) — el cuerpo real de `compute_system_gates`, `my_work_counts`, `daily_report_data` y `take_mgmt_snapshot` ya **no | [E-arranque-operacion.md:240](revision-2026-10-19/E-arranque-operacion.md) |
| B-28 | Bajo | Esquema — Tabla de respaldo `itr_template_items_backup_pre_split` en producción | [B-datos-rendimiento.md:585](revision-2026-10-19/B-datos-rendimiento.md) |
| F-35 | Bajo | Mantenibilidad · Confianza alta — las revisiones y el diagnóstico se hacen a ciegas. Un cambio de espacio en blanco rompe parches futuros. Hoy l | [F-ingenieria-docs-vendors.md:420](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

**Estado S03 (2026-10-19, 6827c09; migración `20261028120000_canonical_functions_s03.sql` probada con ROLLBACK —definición, ACL y dueño idénticos en las 13 funciones; md5 de archivo = BD— y **aplicada en prod** con autorización de Luis):** todos verificados vigentes antes de tocar.
- D-09 / B-19 / E-26 / F-35 ✅ `supabase/functions-sql/*.sql` = volcado verbatim de prod de las 13 funciones que se habían parcheado por ancla (`compute_system_gates`, `compute_project_gates`, `my_work_counts`, `daily_report_data`, `take_mgmt_snapshot`, `sign_itr_atomic`, `seed_default_gate_for_phase`, `evaluate_itr_capture`, `transition_procedure_revision`, `add_mgmt_attachment`, `update_punch_ops_status`, `approve_system_gate`, `sign_system_gate`); la migración repite los cuerpos completos. `tests/db/function-drift.test.ts` (CI) compara contra la RPC `function_definition_md5` (solo md5; sin anon ni sesión). `src/lib/sql/no-anchor-patches.test.ts` prohíbe `pg_get_functiondef` en migraciones posteriores. Flujo en `supabase/functions-sql/README.md` y `scripts/sql/canonical-functions.mjs` (dump/emit).
  - **No hecho, a propósito (sin cambio de comportamiento):** partir `compute_system_gates` en funciones por criterio (D-09) → S11; separar o cachear `my_work_counts` (E-26) → S09/S22. El comentario «Integration candidate» de `20260909180000` (B-19) queda como histórico: la función vigente ya está en su archivo.
- B-28 ✅ `itr_template_items_backup_pre_split` (6960 filas) exportada a `supabase/archive/itr_template_items_backup_pre_split.csv.gz` y eliminada; nota de rollback actualizada en `scripts/split-itr-bilingual.ts`.

## S04 — ITR: firmas requeridas e independencia

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-01 | Crítico | bug/funcionalidad — ITR que no se pueden aprobar nunca si no tienen supervisor y cliente asignados | [C-completions.md:47](revision-2026-10-19/C-completions.md) |
| C-02 | Crítico | bug — Los ITR de loop check y de C&E (tabla con filas de origen) no se pueden firmar desde la UI | [C-completions.md:54](revision-2026-10-19/C-completions.md) |
| C-17 | Alto | UX/flujo — «Mi trabajo»: el ejecutor pierde el ITR antes de firmarlo y el supervisor lo ve sin poder firmar | [C-completions.md:161](revision-2026-10-19/C-completions.md) |
| I-05 | Alto | ITR: la firma de cliente siempre es obligatoria y no se exige independencia entre firmantes | [I-roles-integraciones.md:220](revision-2026-10-19/I-roles-integraciones.md) |
| A-08 | Medio | seguridad / funcionalidad — ITR: una sola persona puede firmar como ejecutor, supervisor y cliente | [A-seguridad.md:79](revision-2026-10-19/A-seguridad.md) |
| C-36 | Bajo | bug — Posible desajuste de hidratación: `useState` lee `localStorage` al inicializar (`ItrExecution.tsx:59-64`). Leerlo en un efecto. S · alta. | [C-completions.md:279](revision-2026-10-19/C-completions.md) |
| C-38 | Bajo | rendimiento — `saveItrSnapshot` escribe el ITR completo (incluidas firmas en base64) en cada cambio de props, nunca se lee ni se purga (`useItrAutosave.ts:22-29`). Usarlo | [C-completions.md:283](revision-2026-10-19/C-completions.md) |
| I-24 | Bajo | `bulkAssignItrs` borra y luego inserta sin transacción | [I-roles-integraciones.md:402](revision-2026-10-19/I-roles-integraciones.md) |

**Estado S04 (2026-10-19, ed0e4c6; migración `20261029120000_itr_required_signatures_s04.sql` probada con ROLLBACK —17 escenarios— y **aplicada en prod** con autorización de Luis; D4–D6 según recomendación):** todos verificados vigentes antes de tocar. Primera sesión con el flujo canónico de S03: 7 funciones editadas en `supabase/functions-sql/` y emitidas completas.
- C-01 / I-05 ✅ `itr_templates.required_signatures` (default ejecutor + supervisor; el ejecutor siempre) + `project_phases.itr_client_signature`; `guard_itr_row` congela el conjunto en `itrs.required_signatures` al crear (inmutable salvo dueño). `sign_itr_atomic` aprueba con todas las requeridas, en orden, saltando las no pedidas. `guard_itr_content` permite completar o cambiar la asignación de un rol sin firmar con el ITR en curso. Panel «Asignaciones de firma» en la ejecución del ITR (editores) + acción `setItrAssignment`. Creación (tag, lazos, C&E) pide solo los roles requeridos y obligatorios. Editor de firmas en la cabecera de la plantilla y casilla por fase en Configuración. Lógica pura en `src/lib/itr/signatures.ts` (+ test).
- A-08 ✅ (D6) una persona no firma dos roles (`sign_itr_atomic`) ni queda asignada a dos (`guard_itr_content`); la UI no ofrece a quien ya tiene otro rol.
- C-17 ✅ colas recalibradas: `isMyTurnToSign` y `my_work_counts` usan las firmas requeridas y excluyen a quien ya firmó otro rol; widgets de cliente con la misma regla. Verificado: badge = lista en Mi trabajo.
- C-02 ✅ confirmado lo de S1-v1 (`localItrStatus` con `sourceRows`).
- D5 ✅ backfill: los ITR con cliente asignado o firmado lo conservan; aprobación de «completado» con todas sus firmas → 0 ITR.
- De paso: C-36 ✅ (idioma en efecto), C-38 ✅ (snapshot sin trazos de firma; se conserva para S18/C-09), I-24 ✅ (`bulkAssignItrs` con UPSERT atómico). PDF y listas muestran solo los recuadros/chips requeridos.
- **Hallazgo nuevo S04-N1 ✅:** `create_itr_template_revision` y `clone_itr_template_from_catalog` perdían `requires_test_equipment` (y ahora también `required_signatures`): corregido.
- **Sin verificar en navegador:** la firma completa con dos personas (solo hay sesión de una) y la firma sin red; cubiertas por los escenarios SQL 8–15 y los tests unitarios. `tests/db/readiness.test.ts` usa plantilla de solo ejecutor y prueba D4/D6 por REST.

## S05 — ITR: contenido, estados y numeración

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-10 | Alto | integridad/bug — El cambio masivo de estado de ITR salta el contenido y «Aprobar seleccionados» siempre falla | [C-completions.md:112](revision-2026-10-19/C-completions.md) |
| C-15 | Alto | bug — Choque de número de ITR al usar una revisión nueva de la plantilla (y por carrera) | [C-completions.md:147](revision-2026-10-19/C-completions.md) |
| C-20 | Medio | bug de dominio — Casilla desmarcada cuenta como respondida; un «No» no crítico pasa sin observación | [C-completions.md:183](revision-2026-10-19/C-completions.md) |
| C-21 | Medio | bug — Descripción en español vacía deja el ítem en blanco | [C-completions.md:189](revision-2026-10-19/C-completions.md) |
| C-23 | Medio | flujo — El supervisor no puede devolver un ITR con observaciones | [C-completions.md:201](revision-2026-10-19/C-completions.md) |
| C-26 | Medio | seguridad/integridad — Cualquier inspector o líder llena cualquier ITR; la firma del ITR no tiene límite de tamaño | [C-completions.md:219](revision-2026-10-19/C-completions.md) |
| C-34 | Medio | seguridad — La RLS `itrs_update` = cualquier miembro, incluido el cliente | [C-completions.md:265](revision-2026-10-19/C-completions.md) |
| A-28 | Bajo | bug — Aprobación masiva de ITR muerta | [A-seguridad.md:213](revision-2026-10-19/A-seguridad.md) |
| C-40 | Bajo | coherencia de permisos — Plantillas editables por el líder (`itr-templates.ts`, `EDITOR_ROLES`) cuando CLAUDE.md indica PRIVILEGED; `createItrAssignment` no comprueba que | [C-completions.md:287](revision-2026-10-19/C-completions.md) |

## S06 — Punch: permisos de campo y escritura por RPC

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-03 | Crítico | bug/permisos — El inspector no puede levantar punch, comentar ni adjuntar fotos al punch | [C-completions.md:61](revision-2026-10-19/C-completions.md) |
| C-04 | Crítico | seguridad/integridad — `update_punch_ops_status('closed_final')` cierra cualquier punch sin verificación, para cualquier miembro y posiblemente sin sesión | [C-completions.md:68](revision-2026-10-19/C-completions.md) |
| A-03 | Alto | seguridad — `update_punch_ops_status`/`transfer_punch_to_ops`: sin control para `anon` ni de rol, y cierran punches sin verificación | [A-seguridad.md:44](revision-2026-10-19/A-seguridad.md) |
| A-06 | Alto | seguridad — Punches: cualquier miembro puede cancelar, recategorizar o reasignar por PostgREST | [A-seguridad.md:65](revision-2026-10-19/A-seguridad.md) |
| B-10 | Alto | Numeración — `next_punch_number_atomic` recorre todos los punches del proyecto con regex en cada INSERT | [B-datos-rendimiento.md:294](revision-2026-10-19/B-datos-rendimiento.md) |
| C-11 | Alto | integridad — Cancelar un punch Cat A es un clic, sin motivo ni auditoría, y desbloquea el certificado | [C-completions.md:119](revision-2026-10-19/C-completions.md) |
| F-01 | Alto | Bug / PDF · Confianza alta — basta un punch con salto de línea para que el **PDF de punch list del proyecto entero devuelva 500**. Lo mismo | [F-ingenieria-docs-vendors.md:55](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| I-02 | Alto | El inspector no puede levantar punches, pero la UI se lo ofrece y la cola offline los descarta | [I-roles-integraciones.md:186](revision-2026-10-19/I-roles-integraciones.md) |
| I-04 | Alto | La RLS de punches e ITR permite a client e inspector escribir por REST lo que el action prohíbe | [I-roles-integraciones.md:208](revision-2026-10-19/I-roles-integraciones.md) |
| A-15 | Medio | funcionalidad / UX — El inspector no puede levantar punches desde la ejecución del ITR | [A-seguridad.md:128](revision-2026-10-19/A-seguridad.md) |
| C-22 | Medio | funcionalidad faltante — El punch desde el ITR sale sin foto, sin vínculo al ítem y sin responsable | [C-completions.md:195](revision-2026-10-19/C-completions.md) |
| C-41 | Bajo | rendimiento — Una llamada `createSignedUrl` por adjunto (`page.tsx:59-66`, `punches.ts:416-431`). Usar `createSignedUrls`. S · alta. | [C-completions.md:289](revision-2026-10-19/C-completions.md) |
| C-44 | Bajo | UX — La cola `punches_verify` de `my_work_counts` cuenta todos los punch resueltos de la organización para todos los usuarios, y `signatures` cuenta todos los certificado | [C-completions.md:295](revision-2026-10-19/C-completions.md) |

## S07 — Importaciones sin pérdida de datos

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-16 | Alto | pérdida de datos — Reimportar tags borra datos maestros y mueve tags de subsistema dejando sus ITR en el anterior | [C-completions.md:154](revision-2026-10-19/C-completions.md) |
| F-06 | Alto | Pérdida de datos / Importación · Confianza alta — - Al **reimportar** un índice de señales sin las columnas de cadena o sin la columna LAZO (por ejemplo, el índ | [F-ingenieria-docs-vendors.md:113](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| C-24 | Medio | rendimiento/escala — La importación manda el archivo entero en una sola server action | [C-completions.md:207](revision-2026-10-19/C-completions.md) |
| C-28 | Medio | robustez — El asistente de configuración no es transaccional y se puede repetir | [C-completions.md:230](revision-2026-10-19/C-completions.md) |
| F-16 | Medio | Práctica en campo / Ingeniería · Confianza alta — corregir una JB mal escrita obliga a reimportar el Excel, y la reimportación borra otros campos (F-06). El téc | [F-ingenieria-docs-vendors.md:242](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-23 | Medio | Escala / Workers · Confianza media — los índices de proyectos grandes (más de 10 000 señales) fallan con un error poco claro o rozan el límite de C | [F-ingenieria-docs-vendors.md:324](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-32 | Bajo | Excel · Confianza media | [F-ingenieria-docs-vendors.md:398](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-36 | Bajo | Atomicidad · Confianza alta | [F-ingenieria-docs-vendors.md:427](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

## S08 — Preservación

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-05 | Alto | bug — Preservación ejecutada por un inspector: no avanza la próxima fecha ni queda finalizada | [C-completions.md:77](revision-2026-10-19/C-completions.md) |
| C-06 | Alto | bug/integridad — La próxima fecha de preservación avanza al primer toque, no al finalizar | [C-completions.md:84](revision-2026-10-19/C-completions.md) |
| I-03 | Alto | El inspector (o el client) «finaliza» un registro de preservación y no se guarda nada | [I-roles-integraciones.md:200](revision-2026-10-19/I-roles-integraciones.md) |
| C-27 | Medio | integridad — Borrados sin control de estado ni auditoría | [C-completions.md:225](revision-2026-10-19/C-completions.md) |
| H-08 | Medio | Módulo sin hogar · Preservación sin vista por proyecto ni enlaces útiles | [H-navegacion.md:244](revision-2026-10-19/H-navegacion.md) |
| I-14 | Medio | El leader «borra» plantillas ITR o PSSR y no pasa nada | [I-roles-integraciones.md:310](revision-2026-10-19/I-roles-integraciones.md) |
| C-39 | Bajo | bug — En el cron de preservación vencida, `.in('id', tagIds)` con hasta 2000 UUID supera el largo de URL de PostgREST, y el `limit(2000)` es global, para todas las organi | [C-completions.md:285](revision-2026-10-19/C-completions.md) |
| C-42 | Bajo | pérdida de datos — Borrar un tag borra en cascada su historial de preservación (`baseline.sql:5888`, `ON DELETE CASCADE`). Usar RESTRICT o borrado lógico. S · alta. | [C-completions.md:291](revision-2026-10-19/C-completions.md) |

## S09 — Índices y «cero filas para contar»

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| B-01 | Crítico | Corrección de datos (truncamiento) — Snapshots KPI calculados sobre ≤1.000 filas | [B-datos-rendimiento.md:57](revision-2026-10-19/B-datos-rendimiento.md) |
| B-02 | Crítico | Corrección + CPU — Página de certificados del proyecto: elegibilidad calculada con ITRs/punches truncados | [B-datos-rendimiento.md:78](revision-2026-10-19/B-datos-rendimiento.md) |
| B-05 | Alto | Índices — FKs y filtros calientes del baseline sin índice | [B-datos-rendimiento.md:146](revision-2026-10-19/B-datos-rendimiento.md) |
| B-07 | Alto | Truncamiento silencioso en páginas operativas | [B-datos-rendimiento.md:229](revision-2026-10-19/B-datos-rendimiento.md) |
| B-08 | Alto | Exportaciones y reportes — truncamiento a 1.000, paginación por OFFSET sin ORDER BY y tope silencioso de 50k | [B-datos-rendimiento.md:257](revision-2026-10-19/B-datos-rendimiento.md) |
| B-09 | Alto | Triggers — `guard_assigned_itr_template` hace seq scan de `itrs` por cada ítem de plantilla; `guard_itr_row` bloquea la plantilla en cada alta de ITR | [B-datos-rendimiento.md:281](revision-2026-10-19/B-datos-rendimiento.md) |
| D-08 | Alto | KPIs — El snapshot KPI (cron y «Tomar snapshot») se corta en 1000 filas | [D-readiness-gestion.md:94](revision-2026-10-19/D-readiness-gestion.md) |
| F-04 | Alto | Reportes / Datos incorrectos · Confianza alta — en proyectos con más de 1000 punch abiertos, el **reporte ejecutivo imprimible subcuenta Cat A y Cat B**. Es u | [F-ingenieria-docs-vendors.md:95](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| B-22 | Medio | Listas paginadas — `count: 'exact'` sobre vistas con joins, filtros no indexables y búsqueda capada a 150 tags | [B-datos-rendimiento.md:488](revision-2026-10-19/B-datos-rendimiento.md) |
| B-24 | Medio | Reportes y KPIs — Lógica de «abierto» y «vencido» inconsistente entre pantallas | [B-datos-rendimiento.md:529](revision-2026-10-19/B-datos-rendimiento.md) |
| B-25 | Medio | Snapshots — `kpi_snapshots` sin clave única y con borrado + inserción no atómico | [B-datos-rendimiento.md:543](revision-2026-10-19/B-datos-rendimiento.md) |
| D-24 | Medio | Escala de gestión diaria — Listas cortadas en 1000 y sin operaciones masivas | [D-readiness-gestion.md:193](revision-2026-10-19/D-readiness-gestion.md) |
| E-20 | Medio | Escala / Topes silenciosos de PostgREST — en proyectos reales (miles de señales), el selector de señales de la bitácora y de las variables de desempeño  | [E-arranque-operacion.md:191](revision-2026-10-19/E-arranque-operacion.md) |
| F-07 | Medio | Escala (tope de 1000 filas) en módulos F8 · Confianza alta — - El conteo de referencias "superadas" de la lista se calcula sobre 1000 referencias como máximo, así que ** | [F-ingenieria-docs-vendors.md:128](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-08 | Medio | Escala en páginas de ingeniería · Confianza alta — - Con más de 1000 señales, la lista queda truncada sin aviso. | [F-ingenieria-docs-vendors.md:142](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| B-27 | Bajo | Índices redundantes o de baja selectividad (amplificación de escrituras) | [B-datos-rendimiento.md:570](revision-2026-10-19/B-datos-rendimiento.md) |
| F-29 | Bajo | KPIs inconsistentes · Confianza alta — dos cifras distintas para "completitud documental". | [F-ingenieria-docs-vendors.md:370](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

## S10 — Reporte diario y zona horaria

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-05 | Alto | Corrección (zona horaria) — El «día» de reportes, KPIs y vencimientos se calcula en UTC | [D-readiness-gestion.md:75](revision-2026-10-19/D-readiness-gestion.md) |
| D-06 | Alto | Corrección de datos firmados — El reporte diario inmutable reporta cifras truncadas a 30 | [D-readiness-gestion.md:81](revision-2026-10-19/D-readiness-gestion.md) |
| B-20 | Medio | Funciones pesadas — `daily_report_data` | [B-datos-rendimiento.md:449](revision-2026-10-19/B-datos-rendimiento.md) |
| B-26 | Medio | Arranque y desempeño — Evaluación recalculada en cada render y paginación sin manejo de errores | [B-datos-rendimiento.md:559](revision-2026-10-19/B-datos-rendimiento.md) |
| D-27 | Medio | KPIs — La curva S no tiene línea base y el snapshot queda con la fecha del día siguiente | [D-readiness-gestion.md:211](revision-2026-10-19/D-readiness-gestion.md) |
| E-15 | Medio | Manejo de tiempo / Zona horaria — - (a) El reporte diario corta el día en UTC. Un trip a las 21:00 en Colombia (UTC−5) sale en el reporte del dí | [E-arranque-operacion.md:152](revision-2026-10-19/E-arranque-operacion.md) |
| G-13 | Medio | Fechas/i18n — "Hoy" calculado en UTC en el servidor y formatos de fecha con locale fijo | [G-frontend-calidad.md:175](revision-2026-10-19/G-frontend-calidad.md) |
| B-29 | Bajo | Fechas — «Hoy» calculado en UTC en crons y snapshots | [B-datos-rendimiento.md:592](revision-2026-10-19/B-datos-rendimiento.md) |
| D-28 | Bajo | Robustez — «Rehacer con IA» borra y escribe en dos RPC no atómicas (`daily-report.ts:116-123`). Si la segunda falla (por ejemplo, otro usuario emitió el reporte entre med | [D-readiness-gestion.md:219](revision-2026-10-19/D-readiness-gestion.md) |
| D-29 | Bajo | Corrección — Un reporte de fecha pasada mezcla el estado actual: avance ponderado, gates en regresión, abiertos por nivel y relevos (`daily_report_data`: `compute_project | [D-readiness-gestion.md:221](revision-2026-10-19/D-readiness-gestion.md) |
| D-30 | Bajo | Practicidad — El relevo de turno es por proyecto, sin destinatario ni área o disciplina (`open_shift_handover`, `accept_shift_handover`). Lo recibe cualquier no-client y  | [D-readiness-gestion.md:223](revision-2026-10-19/D-readiness-gestion.md) |

## S11 — Lógica de gates

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-02 | Alto | Lógica de gates — La regresión no se propaga al gate siguiente ni a los sistemas dependientes | [D-readiness-gestion.md:55](revision-2026-10-19/D-readiness-gestion.md) |
| D-10 | Medio | Decisión §15.4 incumplida — `documents_current` no afecta a gates aprobados y se aplica a todos los gates | [D-readiness-gestion.md:108](revision-2026-10-19/D-readiness-gestion.md) |
| D-11 | Medio | Coherencia SQL↔SQL — El criterio PSSR del gate y los prerrequisitos de arranque usan reglas distintas | [D-readiness-gestion.md:114](revision-2026-10-19/D-readiness-gestion.md) |
| D-13 | Medio | Lógica / ruido — Un Cat A nuevo regresa a la vez todos los gates aprobados del sistema | [D-readiness-gestion.md:126](revision-2026-10-19/D-readiness-gestion.md) |
| D-14 | Medio | Gobernanza — Cualquier inspector puede desbloquear un gate desescalando o moviendo una restricción | [D-readiness-gestion.md:132](revision-2026-10-19/D-readiness-gestion.md) |
| D-15 | Medio | Integridad de KPIs — Fecha de vencimiento y método de verificación de acciones editables sin motivo | [D-readiness-gestion.md:138](revision-2026-10-19/D-readiness-gestion.md) |
| D-17 | Medio | KPI sesgado — El cumplimiento de compromisos solo cuenta éxitos | [D-readiness-gestion.md:150](revision-2026-10-19/D-readiness-gestion.md) |
| D-20 | Medio | Configuración retroactiva sin auditoría — Cambios en `/admin/gates` reescriben el pasado | [D-readiness-gestion.md:169](revision-2026-10-19/D-readiness-gestion.md) |
| D-21 | Medio | Gobernanza de evidencia — Declaraciones revocables sin motivo ni log, incluso después de aprobar | [D-readiness-gestion.md:175](revision-2026-10-19/D-readiness-gestion.md) |
| E-07 | Medio | Lógica de prerrequisitos (gate de arranque) — si ningún gate exige line-up (orgs cuya fase no se llama SU/RFSU, ver F8 §15.8), el «gate de arranque» pasa a  | [E-arranque-operacion.md:93](revision-2026-10-19/E-arranque-operacion.md) |
| E-08 | Medio | Gates / Line-up — una hoja verificada de propósito `test` u `other` (p. ej. un line-up parcial para una prueba hidrostática) cum | [E-arranque-operacion.md:100](revision-2026-10-19/E-arranque-operacion.md) |
| E-14 | Medio | Gates / Ciclo de vida de pruebas — cualquier prueba con ese sistema principal, incluido un borrador abandonado o una prueba aprobada que dejó de  | [E-arranque-operacion.md:145](revision-2026-10-19/E-arranque-operacion.md) |
| D-31 | Bajo | Redundancia — El catálogo de gates opcionales trae declaraciones manuales que ya están automatizadas («Line-up verificado… sin bypasses activos» en PROC-INTRO, `src/lib/c | [D-readiness-gestion.md:225](revision-2026-10-19/D-readiness-gestion.md) |
| D-33 | Bajo | Roles incoherentes — Aprobar un gate está reservado por defecto a owner, admin y architect, pero co-firmar puede leader o client, comprometer fechas leader o superior, y  | [D-readiness-gestion.md:229](revision-2026-10-19/D-readiness-gestion.md) |
| D-34 | Bajo | Modelo — Gates y pesos son por org y no por proyecto (`readiness_gates.org_id`). Un brownfield y un greenfield de la misma operadora no pueden tener gates distintos. Agre | [D-readiness-gestion.md:231](revision-2026-10-19/D-readiness-gestion.md) |
| D-35 | Bajo | Dependencias — El chequeo de ciclos es por sistema e ignora los gates (`guard_system_dependency`): rechaza pares válidos («A.RFC necesita B.MC» y «B.RFSU necesita A.MC»). | [D-readiness-gestion.md:233](revision-2026-10-19/D-readiness-gestion.md) |
| F-28 | Bajo | Gate engine · Confianza media | [F-ingenieria-docs-vendors.md:364](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

## S12 — IIoT confiable

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| B-12 | Alto | IIoT — `signal_samples` sin retención efectiva, sin partición y vista de 1 minuto no sargable | [B-datos-rendimiento.md:324](revision-2026-10-19/B-datos-rendimiento.md) |
| E-03 | Alto | Rendimiento IIoT a escala — el filtro por `bucket` llega a la vista como `date_trunc('minute', sampled_at) >= X`, que no puede usar la PK  | [E-arranque-operacion.md:63](revision-2026-10-19/E-arranque-operacion.md) |
| E-04 | Alto | Integridad de datos IIoT (ingesta) — la señal se resuelve por nombre en **toda la org**, sin orden. Con proyectos replicados (dos trenes, Fase 1/Fa | [E-arranque-operacion.md:70](revision-2026-10-19/E-arranque-operacion.md) |
| B-18 | Medio | IIoT — `ingest_signal_samples` resuelve la señal por `signal_tag` a nivel org con `LIMIT 1` | [B-datos-rendimiento.md:420](revision-2026-10-19/B-datos-rendimiento.md) |
| E-06 | Medio | Correctitud UI (consola de desempeño) — en un intento **evaluado** (el estado final, el que más se consulta y el que va al cliente), el gráfico mezcla | [E-arranque-operacion.md:86](revision-2026-10-19/E-arranque-operacion.md) |
| E-18 | Medio | Calidad de la evaluación (validación solo informativa) — un intento con 30 % de muestras de calidad mala (basta una buena por minuto para que el minuto «cuente»), con  | [E-arranque-operacion.md:177](revision-2026-10-19/E-arranque-operacion.md) |
| E-24 | Medio | Ingesta IIoT (validación) — un NaN convierte en NaN los promedios de la evaluación y de la foto. Las muestras con fecha futura, por un rel | [E-arranque-operacion.md:226](revision-2026-10-19/E-arranque-operacion.md) |
| E-28 | Bajo | Cálculo del estadístico `total` — un criterio de «producción total ≥ X» se subestima con cada minuto faltante o excluido. Excluir una perturbaci | [E-arranque-operacion.md:256](revision-2026-10-19/E-arranque-operacion.md) |
| E-33 | Bajo | Gráficos que esconden picos — un trip de 2 minutos puede no verse en el gráfico de 6 h. El gráfico del PDF tiene poco valor como evidencia p | [E-arranque-operacion.md:290](revision-2026-10-19/E-arranque-operacion.md) |

## S13 — Correcciones de F8 (documentos y vendors)

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| F-02 | Alto | Practicidad / Diseño de producto · Confianza alta — - El valor central de F8 ("nunca comisionar contra una revisión no controlada") depende de que alguien abra ca | [F-ingenieria-docs-vendors.md:68](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-03 | Alto | Consistencia de datos · Confianza alta — al inicializar un registro es habitual cargar primero la vigente (Rev C) y después el historial (A, B) para de | [F-ingenieria-docs-vendors.md:83](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-05 | Alto | KPI incorrecto · Confianza alta — que una FAT falle y se repita es lo normal. Con esta regla, cualquier paquete que haya tenido **una sola FAT f | [F-ingenieria-docs-vendors.md:102](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| C-31 | Medio | UX/funcionalidad — QR: patrón de tag restrictivo y resolución ambigua; no hay etiquetas QR por tag | [C-completions.md:248](revision-2026-10-19/C-completions.md) |
| F-10 | Medio | PDF / Unidades · Confianza alta — el **PDF firmado del ITR de megado muestra "M?"** como unidad de resistencia de aislamiento. En un registro de | [F-ingenieria-docs-vendors.md:165](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-11 | Medio | Trazabilidad en PDF · Confianza alta — - La decisión §15.1 ("las firmas muestran nombre · empresa congelado al firmar") se cumple solo en pantalla. | [F-ingenieria-docs-vendors.md:174](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-12 | Medio | Consistencia de datos · Confianza alta — el procedimiento R2 nace sin referencias, se aprueba sin el bloqueo y la trazabilidad documental se pierde en  | [F-ingenieria-docs-vendors.md:186](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-15 | Medio | Correctitud / IA C&E · Confianza alta — - La decisión §10.26 ("se emparejan sin mayúsculas/espacios") no se cumple: "PT 101" en el documento no empare | [F-ingenieria-docs-vendors.md:230](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-18 | Medio | Bug / QR y Tag 360 · Confianza alta — el escaneo de campo lleva a un tag o proyecto equivocado, que es un riesgo real en un ITR o un LOTO. | [F-ingenieria-docs-vendors.md:262](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-19 | Medio | Integridad · Confianza alta — se pierde la trazabilidad de qué disparo se probó. La celda de la matriz pierde su resultado. No hay auditoría | [F-ingenieria-docs-vendors.md:278](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-20 | Medio | Diseño / Control documental · Confianza media — contradice el espíritu de 13.4 ("controlled revision"). Una prueba hecha contra un IFR es una prueba hecha con | [F-ingenieria-docs-vendors.md:288](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-24 | Bajo | UX / Control documental · Confianza alta | [F-ingenieria-docs-vendors.md:335](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-25 | Bajo | Seguridad / Storage · Confianza alta — quedan archivos huérfanos imposibles de limpiar (también los subidos cuando el RPC falla o al descartar un bor | [F-ingenieria-docs-vendors.md:341](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-30 | Bajo | i18n · Confianza alta | [F-ingenieria-docs-vendors.md:380](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-31 | Bajo | Código muerto / afirmaciones falsas · Confianza alta | [F-ingenieria-docs-vendors.md:389](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-33 | Bajo | Correctitud · Confianza alta | [F-ingenieria-docs-vendors.md:404](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-34 | Bajo | Vendors (reglas) · Confianza alta | [F-ingenieria-docs-vendors.md:410](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

## S14 — Firmantes designados (capacidades) y roles

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-03 | Alto | Gobernanza / independencia de firmas — Las co-firmas de Operaciones y HSE no están ligadas a personas designadas | [D-readiness-gestion.md:62](revision-2026-10-19/D-readiness-gestion.md) |
| E-02 | Alto | Modelo de autorización / Segregación de funciones — - (a) La «capacidad» del hold point no identifica a nadie. Cualquier líder del contratista libera un hold de * | [E-arranque-operacion.md:53](revision-2026-10-19/E-arranque-operacion.md) |
| F-14 | Medio | Seguridad funcional / Multi-empresa · Confianza alta — el personal de un vendor, dado de alta con rol inspector o leader: | [F-ingenieria-docs-vendors.md:214](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| I-15 | Medio | Constantes de rol duplicadas en más de 12 sitios, con divergencias | [I-roles-integraciones.md:316](revision-2026-10-19/I-roles-integraciones.md) |
| E-30 | Bajo | Independencia del aprobador — quien reescribió todo el borrador sin crearlo ni enviarlo puede aprobarlo. | [E-arranque-operacion.md:270](revision-2026-10-19/E-arranque-operacion.md) |
| I-25 | Bajo | Las firmas «Cliente» exigen tener usuarios client dentro del tenant | [I-roles-integraciones.md:406](revision-2026-10-19/I-roles-integraciones.md) |

## S15 — Miembros, auditoría y cuotas

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| A-02 | Alto | seguridad — Un admin puede hacerse owner o expulsar a los owners por RLS directa | [A-seguridad.md:37](revision-2026-10-19/A-seguridad.md) |
| I-12 | Alto | Un admin puede hacerse owner o degradar owners por REST | [I-roles-integraciones.md:293](revision-2026-10-19/I-roles-integraciones.md) |
| A-11 | Medio | seguridad — Falsificación del registro de auditoría y notificaciones arbitrarias | [A-seguridad.md:100](revision-2026-10-19/A-seguridad.md) |
| A-13 | Medio | seguridad / rendimiento — Sin rate limiting ni cuotas (API v1, IA, push) | [A-seguridad.md:114](revision-2026-10-19/A-seguridad.md) |
| D-16 | Medio | Gobernanza — Decisiones «inmutables» que cualquier no-client registra a nombre de otro y puede reemplazar | [D-readiness-gestion.md:144](revision-2026-10-19/D-readiness-gestion.md) |
| I-16 | Medio | El audit log y las notificaciones se pueden falsificar | [I-roles-integraciones.md:330](revision-2026-10-19/I-roles-integraciones.md) |
| I-19 | Medio | IA: sin cuotas, sin medición de coste y con manejo de errores irregular | [I-roles-integraciones.md:358](revision-2026-10-19/I-roles-integraciones.md) |
| I-21 | Medio | Ciclo de vida de usuarios incompleto | [I-roles-integraciones.md:379](revision-2026-10-19/I-roles-integraciones.md) |
| A-21 | Bajo | bug / privacidad — Invitaciones: límite de 1000 usuarios, email sensible a mayúsculas y alta sin consentimiento | [A-seguridad.md:169](revision-2026-10-19/A-seguridad.md) |
| A-22 | Bajo | bug — Incoherencias con usuarios de varias orgs | [A-seguridad.md:176](revision-2026-10-19/A-seguridad.md) |
| A-25 | Bajo | mantenibilidad — Higiene de la API v1 | [A-seguridad.md:196](revision-2026-10-19/A-seguridad.md) |
| A-30 | Bajo | mantenibilidad — Componente de IA muerto | [A-seguridad.md:224](revision-2026-10-19/A-seguridad.md) |
| C-43 | Bajo | costo — `generateMatrixWithAi` hace una llamada no streaming de 16k tokens sin límite de frecuencia y la puede lanzar cualquier líder (`itr-matrix.ts:160-200`). Límite po | [C-completions.md:293](revision-2026-10-19/C-completions.md) |
| E-37 | Bajo | `log_sync_conflict` y multi-org — un usuario en dos orgs registra los descartes offline en la primera org a la que se unió, no en la del proyect | [E-arranque-operacion.md:315](revision-2026-10-19/E-arranque-operacion.md) |
| I-27 | Bajo | Un inspector puede registrar decisiones (DEC) inmutables | [I-roles-integraciones.md:414](revision-2026-10-19/I-roles-integraciones.md) |

## S16 — PSSR por RPC

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| A-04 | Alto | seguridad — La aprobación del PSSR y sus firmas se pueden falsificar desde cualquier rol | [A-seguridad.md:51](revision-2026-10-19/A-seguridad.md) |
| C-12 | Alto | integridad — Se puede aprobar un PSSR en borrador con ítems en «NO»; cualquier miembro puede ponerlo «aprobado» por REST | [C-completions.md:126](revision-2026-10-19/C-completions.md) |
| C-32 | Medio | integridad — Firmas del PSSR débiles | [C-completions.md:254](revision-2026-10-19/C-completions.md) |

## S17 — Certificados por RPC

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| A-05 | Alto | seguridad — Certificados: firmas a nombre de otros y emisión directa saltándose la elegibilidad | [A-seguridad.md:58](revision-2026-10-19/A-seguridad.md) |
| C-13 | Alto | integridad — Certificados: una persona firma los tres roles, el cliente no puede firmar, se reabre sin volver a evaluar y no se invalida después | [C-completions.md:133](revision-2026-10-19/C-completions.md) |
| I-06 | Alto | Certificados: el client no puede firmar como Cliente y una persona puede firmar las tres capacidades | [I-roles-integraciones.md:231](revision-2026-10-19/I-roles-integraciones.md) |
| B-14 | Medio | Integridad / numeración — Certificados: conteo `LIKE` con prefijo ambiguo y emisión no atómica | [B-datos-rendimiento.md:362](revision-2026-10-19/B-datos-rendimiento.md) |
| C-33 | Medio | bug — Numeración de certificados y del RFSU frágil | [C-completions.md:260](revision-2026-10-19/C-completions.md) |

## S18 — Offline por usuario

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-07 | Alto | bug/pérdida de datos — Sin red: una respuesta rechazada bloquea para siempre la cola de respuestas | [C-completions.md:91](revision-2026-10-19/C-completions.md) |
| C-08 | Alto | seguridad/privacidad — La cola sin red y las páginas en caché no están separadas por usuario ni se limpian al cerrar sesión | [C-completions.md:98](revision-2026-10-19/C-completions.md) |
| C-09 | Alto | UX/funcionalidad — «ITR sin red» solo funciona con un ITR abierto antes y con navegación completa; al recargar no se ven las respuestas encoladas | [C-completions.md:105](revision-2026-10-19/C-completions.md) |
| E-01 | Alto | Seguridad / Integridad de firmas (offline) — en una tablet o PWA compartida (lo habitual en campo), lo que A capturó sin red se sincroniza con la sesión de | [E-arranque-operacion.md:46](revision-2026-10-19/E-arranque-operacion.md) |
| G-02 | Alto | Offline/Integridad — La bandeja offline no guarda quién capturó; el replay usa la sesión actual | [G-frontend-calidad.md:92](revision-2026-10-19/G-frontend-calidad.md) |
| G-03 | Alto | PWA/Privacidad — El Service Worker cachea HTML autenticado y respuestas REST/Auth de Supabase y no las purga nunca | [G-frontend-calidad.md:99](revision-2026-10-19/G-frontend-calidad.md) |
| A-09 | Medio | seguridad — Cerrar sesión no borra las cachés del SW ni la cola offline (dispositivos compartidos) | [A-seguridad.md:86](revision-2026-10-19/A-seguridad.md) |
| B-16 | Medio | Offline — LWW compara el reloj del dispositivo con el del Worker; chequeo y escritura no atómicos | [B-datos-rendimiento.md:398](revision-2026-10-19/B-datos-rendimiento.md) |
| C-35 | Medio | integridad — Conflictos sin red resueltos con el reloj del dispositivo; se pierde la hora real de captura | [C-completions.md:271](revision-2026-10-19/C-completions.md) |
| C-37 | Bajo | mantenibilidad — Código muerto: `useSyncConflictResolution.ts` (sin usos) registra etiquetas de Background Sync (`commup-itr-sync`) que el SW no escucha (`sw.js:165`, `co | [C-completions.md:281](revision-2026-10-19/C-completions.md) |
| E-27 | Bajo | Offline / Tiempo — con el reloj del dispositivo atrasado, todos los pasos offline quedan con la hora del paso anterior. Con el re | [E-arranque-operacion.md:249](revision-2026-10-19/E-arranque-operacion.md) |
| G-20 | Bajo | PWA/DX — El SW se registra también en desarrollo, con scripts en cache-first | [G-frontend-calidad.md:225](revision-2026-10-19/G-frontend-calidad.md) |
| G-23 | Bajo | PWA — La página offline promete más de lo que hace | [G-frontend-calidad.md:242](revision-2026-10-19/G-frontend-calidad.md) |

## S19 — Generación masiva de ITR

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-14 | Alto | funcionalidad faltante — No hay generación masiva de ITR: se asignan de a uno, tag por tag | [C-completions.md:140](revision-2026-10-19/C-completions.md) |
| C-30 | Medio | funcionalidad faltante — Las listas de ITR no filtran por subsistema, sistema, área ni responsable | [C-completions.md:242](revision-2026-10-19/C-completions.md) |

## S20 — Readiness a escala

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| B-04 | Crítico | Funciones pesadas / RLS — Motor de gates de Control Tower O(sistemas × gates × criterios) con búsquedas sin índice, bajo RLS y calculado 2–3 veces por carga | [B-datos-rendimiento.md:117](revision-2026-10-19/B-datos-rendimiento.md) |
| B-06 | Alto | RLS — Políticas por fila con `is_project_member` / `IN (SELECT … WHERE is_project_member(...))` que el Sprint E no migró | [B-datos-rendimiento.md:192](revision-2026-10-19/B-datos-rendimiento.md) |
| B-13 | Alto | Badge «Mi trabajo» — `my_work_counts` en el layout en cada render, con ~20 subconsultas y búsquedas sin índice | [B-datos-rendimiento.md:346](revision-2026-10-19/B-datos-rendimiento.md) |
| D-07 | Alto | Rendimiento a escala — La matriz se recalcula completa en cada carga, con cálculo redundante y sin índices clave | [D-readiness-gestion.md:88](revision-2026-10-19/D-readiness-gestion.md) |
| G-07 | Alto | Rendimiento — Autenticación y membresía repetidas varias veces por request y en cada `router.refresh()` | [G-frontend-calidad.md:130](revision-2026-10-19/G-frontend-calidad.md) |
| B-17 | Medio | Integridad referencial — `project_id` desnormalizado sin FK compuesta (referencias cruzadas entre proyectos u orgs) | [B-datos-rendimiento.md:409](revision-2026-10-19/B-datos-rendimiento.md) |
| B-21 | Medio | Crons — N+1 y límites de subrequests del Worker | [B-datos-rendimiento.md:470](revision-2026-10-19/B-datos-rendimiento.md) |
| B-23 | Medio | Latencia — Worker sin Smart Placement y cadenas de awaits secuenciales | [B-datos-rendimiento.md:511](revision-2026-10-19/B-datos-rendimiento.md) |

## S21 — Bus de eventos (outbox)

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| B-03 | Crítico | Triggers / escalabilidad — Fan-out de `domain_events`: evento JSON completo + 3 HTTP `pg_net` por fila (dos duplicados) | [B-datos-rendimiento.md:92](revision-2026-10-19/B-datos-rendimiento.md) |
| B-11 | Alto | Notificaciones / crons — `push-dispatch` con ventana fija de 5 min sin cursor persistido y sin índice usable | [B-datos-rendimiento.md:305](revision-2026-10-19/B-datos-rendimiento.md) |
| I-08 | Alto | Webhooks: nombres de evento incompatibles, doble despacho y reintentos sin scheduler | [I-roles-integraciones.md:251](revision-2026-10-19/I-roles-integraciones.md) |
| I-17 | Medio | Volumen de `domain_events`: cada autosave del ITR emite un evento con la fila completa y 3 llamadas pg_net | [I-roles-integraciones.md:339](revision-2026-10-19/I-roles-integraciones.md) |
| B-30 | Bajo | Retención — `domain_events`, `activity_log`, `notifications`, `webhook_deliveries` y `net._http_response` crecen sin límite | [B-datos-rendimiento.md:605](revision-2026-10-19/B-datos-rendimiento.md) |
| F-26 | Bajo | Workers (subrequests) · Confianza media | [F-ingenieria-docs-vendors.md:348](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

## S22 — Avisos y colas

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-04 | Alto | Notificaciones / flujo — El motor de readiness no notifica nada y no tiene colas propias | [D-readiness-gestion.md:69](revision-2026-10-19/D-readiness-gestion.md) |
| H-02 | Alto | Flujo de trabajo · Las tareas de F1–F8 no llegan a la persona (sin cola de gates y sin notificaciones) | [H-navegacion.md:187](revision-2026-10-19/H-navegacion.md) |
| I-09 | Alto | El web push está prácticamente muerto | [I-roles-integraciones.md:263](revision-2026-10-19/I-roles-integraciones.md) |
| D-23 | Medio | Mi trabajo — Colas a nivel de org que inflan el badge y conteos que no coinciden con las listas | [D-readiness-gestion.md:187](revision-2026-10-19/D-readiness-gestion.md) |
| D-36 | Bajo | i18n / UX — El Inbox tiene etiquetas en español fijas en el código y le faltan los tipos de readiness (`InboxList.tsx:13-27`). La fecha del detalle usa `toLocaleString` c | [D-readiness-gestion.md:235](revision-2026-10-19/D-readiness-gestion.md) |
| G-22 | Bajo | PWA — Lógica de clic en notificaciones con rama muerta y etiquetas engañosas | [G-frontend-calidad.md:237](revision-2026-10-19/G-frontend-calidad.md) |
| I-28 | Bajo | Detalles menores de push | [I-roles-integraciones.md:418](revision-2026-10-19/I-roles-integraciones.md) |

## S23 — Readiness v2 (pantallas)

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-01 | Alto | Coherencia SQL↔UI / UX — Control Tower: «bloqueo principal» y barra de ITR vienen del motor viejo | [D-readiness-gestion.md:48](revision-2026-10-19/D-readiness-gestion.md) |
| D-12 | Medio | Practicidad — «Aprobado con condiciones» no tiene seguimiento | [D-readiness-gestion.md:120](revision-2026-10-19/D-readiness-gestion.md) |
| D-18 | Medio | Coherencia de métricas — Tres o cuatro «avances» distintos que no cuadran entre pantallas | [D-readiness-gestion.md:157](revision-2026-10-19/D-readiness-gestion.md) |
| D-19 | Medio | UX / sobrecarga — Control Tower sin filtros, orden, búsqueda, paginación ni exportación | [D-readiness-gestion.md:163](revision-2026-10-19/D-readiness-gestion.md) |
| D-22 | Medio | Seguridad operativa (registros F3) — Bypass y temporales sin vencimiento vigilado, validación solo en la app | [D-readiness-gestion.md:181](revision-2026-10-19/D-readiness-gestion.md) |
| D-25 | Medio | UX de aprobación — Ni la aprobación ni la revocación muestran su impacto aguas abajo | [D-readiness-gestion.md:199](revision-2026-10-19/D-readiness-gestion.md) |
| D-26 | Medio | Practicidad del look-ahead — No muestra qué bloquea cada gate en riesgo | [D-readiness-gestion.md:205](revision-2026-10-19/D-readiness-gestion.md) |
| H-12 | Medio | Contexto · Control Tower es de organización pero opera sobre un proyecto | [H-navegacion.md:271](revision-2026-10-19/H-navegacion.md) |

## S24 — Paquete de handover v2

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| E-05 | Alto | Funcional / Handover — §12.23 promete que «al completarse el traspaso a Operaciones se genera el paquete de handover». El paquete que | [E-arranque-operacion.md:77](revision-2026-10-19/E-arranque-operacion.md) |
| E-22 | Medio | Registros imprimibles y dossier — - Sin respaldo en papel para cuando falla la tablet o no hay red (regla habitual en arranque). | [E-arranque-operacion.md:209](revision-2026-10-19/E-arranque-operacion.md) |
| F-22 | Medio | Handover / Dossier · Confianza alta — el entregable de turnover queda muy por debajo de lo que ya existe en la BD. El cliente tiene que armar el dos | [F-ingenieria-docs-vendors.md:306](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| E-31 | Bajo | Firma del handover verificable solo por CommUp — el HMAC es simétrico: la operadora no puede verificar la integridad del paquete por su cuenta y no hay endpoin | [E-arranque-operacion.md:277](revision-2026-10-19/E-arranque-operacion.md) |

## S25 — Correcciones de F6–F7

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| E-09 | Medio | Pérdida de datos / Auditoría (hold points) — el comentario de quien ejecutó el paso que llega al hold point (p. ej. «PT-101 11,8 barg, fuga menor en brida» | [E-arranque-operacion.md:107](revision-2026-10-19/E-arranque-operacion.md) |
| E-10 | Medio | Auditoría (paradas de ejecución) — una ejecución de arranque con dos paradas (algo común: trip, se corrige, se reanuda, otro trip) **pierde la pr | [E-arranque-operacion.md:114](revision-2026-10-19/E-arranque-operacion.md) |
| E-11 | Medio | Lógica de readiness (personal por turno) — un turno en el que nadie fue evaluado en el sistema **no aparece** y, por tanto, no se exige. Si hay turnos A/ | [E-arranque-operacion.md:121](revision-2026-10-19/E-arranque-operacion.md) |
| E-12 | Medio | Integridad de competencias — - (a) La regla de autoevaluación solo aplica si la ficha está vinculada a un usuario. Un líder puede crear una | [E-arranque-operacion.md:128](revision-2026-10-19/E-arranque-operacion.md) |
| E-13 | Medio | Gobernanza del traspaso — con «xxxxxxxxxx» se pueden saltar «sin punch Cat A abiertos», «gate de arranque aprobado» o «primer arranque a | [E-arranque-operacion.md:138](revision-2026-10-19/E-arranque-operacion.md) |
| E-16 | Medio | Integridad de la bitácora de arranque — se puede registrar «primer HC» antes de «primer arranque», o «operación estable» sin arranque. Se puede fechar | [E-arranque-operacion.md:163](revision-2026-10-19/E-arranque-operacion.md) |
| E-17 | Medio | Pérdida de datos (re-congelado tras la purga) — si un intento queda cerrado sin resultado registrado y alguien pulsa «Re-congelar» pasados 90 días (o tras pur | [E-arranque-operacion.md:170](revision-2026-10-19/E-arranque-operacion.md) |
| E-19 | Medio | Gobernanza de exclusiones — quien dirige la prueba puede excluir ventanas desfavorables hasta que los criterios pasen. No hay reconocimien | [E-arranque-operacion.md:184](revision-2026-10-19/E-arranque-operacion.md) |
| E-21 | Medio | UX de campo (line-up) — - El operador no puede anotar «encontrada abierta, cerrada por mí», el n.º de candado o sello de LO/LC, ni un  | [E-arranque-operacion.md:198](revision-2026-10-19/E-arranque-operacion.md) |
| E-23 | Medio | Seguridad de proceso (pasos) — un paso con valor esperado «11–12 barg» acepta «15» sin aviso. No se sugiere detener aunque el valor cumpla el | [E-arranque-operacion.md:219](revision-2026-10-19/E-arranque-operacion.md) |
| E-29 | Bajo | Generación de line-up acoplada al idioma — una org con categorías en inglés («Valves») o con códigos propios genera hojas vacías o sin marcar las crítica | [E-arranque-operacion.md:263](revision-2026-10-19/E-arranque-operacion.md) |
| E-32 | Bajo | Ejecución sobre revisión reemplazada — una ejecución en curso sobre R0, cuando ya está aprobada R1, no muestra ningún aviso (la consola de desempeño  | [E-arranque-operacion.md:284](revision-2026-10-19/E-arranque-operacion.md) |
| E-34 | Bajo | UX de acciones críticas con `window.prompt`/`confirm` — en una PWA móvil o con guantes, `prompt` no permite elegir el criterio de parada definido, se cierra por error | [E-arranque-operacion.md:297](revision-2026-10-19/E-arranque-operacion.md) |
| E-36 | Bajo | Inconsistencias menores | [E-arranque-operacion.md:310](revision-2026-10-19/E-arranque-operacion.md) |

## N0 — Navegación N0 (arreglos rápidos)

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| G-04 | Alto | Robustez/UX — Sin `error.tsx`/`not-found.tsx`/`loading.tsx`, y los errores de Supabase se descartan en las páginas | [G-frontend-calidad.md:106](revision-2026-10-19/G-frontend-calidad.md) |
| H-01 | Alto | Entrada/inicio · La PWA y la raíz abren en Dashboard, no en Mi trabajo | [H-navegacion.md:180](revision-2026-10-19/H-navegacion.md) |
| H-04 | Alto | Página legacy/huérfana · `/admin` pública con nombre del fundador | [H-navegacion.md:211](revision-2026-10-19/H-navegacion.md) |
| H-05 | Alto | Resiliencia de navegación · No hay `not-found.tsx`, `error.tsx` ni `loading.tsx` | [H-navegacion.md:218](revision-2026-10-19/H-navegacion.md) |
| H-06 | Medio | Migas de pan · Incompletas, en inglés, poco profundas y con recarga completa | [H-navegacion.md:225](revision-2026-10-19/H-navegacion.md) |
| H-07 | Medio | Permisos menú/página · «Importar» visible para leader y rebotado; roles duplicados en línea | [H-navegacion.md:237](revision-2026-10-19/H-navegacion.md) |
| H-11 | Medio | Huérfana del menú · «Sistemas» (F2, base del readiness) no está en el sidebar | [H-navegacion.md:265](revision-2026-10-19/H-navegacion.md) |
| H-13 | Medio | Nomenclatura · Choques de nombres y spanglish | [H-navegacion.md:278](revision-2026-10-19/H-navegacion.md) |
| H-14 | Medio | Cambio de organización · Te deja en una URL de otra org (404) | [H-navegacion.md:289](revision-2026-10-19/H-navegacion.md) |
| H-16 | Medio | Señales muertas · Badges declarados que nunca se calculan y una consulta desperdiciada | [H-navegacion.md:301](revision-2026-10-19/H-navegacion.md) |
| G-21 | Bajo | PWA — El manifest anuncia funciones inexistentes y `start_url` no respeta el rol | [G-frontend-calidad.md:231](revision-2026-10-19/G-frontend-calidad.md) |
| H-19 | Bajo | Mi trabajo · «Ver todos» y filas que no llevan al objeto | [H-navegacion.md:323](revision-2026-10-19/H-navegacion.md) |
| H-22 | Bajo | URL frente a ubicación · `/admin/notifications` en Mi trabajo y `/admin/handover` en Organización | [H-navegacion.md:341](revision-2026-10-19/H-navegacion.md) |
| H-23 | Bajo | Accesos denegados silenciosos | [H-navegacion.md:346](revision-2026-10-19/H-navegacion.md) |
| H-24 | Bajo | Info · Rutas legacy o resolvers | [H-navegacion.md:352](revision-2026-10-19/H-navegacion.md) |

## N1 — Navegación N1

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| H-03 | Alto | Arquitectura de información · Sidebar demasiado largo y organizado por objeto, no por tarea ni fase | [H-navegacion.md:194](revision-2026-10-19/H-navegacion.md) |
| C-29 | Medio | UX móvil — La pantalla de ejecución y las listas no están pensadas para un teléfono | [C-completions.md:236](revision-2026-10-19/C-completions.md) |
| H-09 | Medio | Duplicación global/proyecto · Seis pares de listas con el mismo ícono y nombre casi igual a la vez | [H-navegacion.md:251](revision-2026-10-19/H-navegacion.md) |
| D-38 | Bajo | Dashboard por rol — `/dashboard` (inicio de owner, admin, architect y client, `navigation.ts:9`) y `/kpis` (global) no tienen ningún widget de readiness: gates por aproba | [D-readiness-gestion.md:239](revision-2026-10-19/D-readiness-gestion.md) |
| H-18 | Bajo | Hubs · Pestañas mixtas y funciones escondidas | [H-navegacion.md:313](revision-2026-10-19/H-navegacion.md) |
| H-20 | Bajo | Resumen del proyecto y enlaces · Textos fijos, poco responsive, `<a>` internos | [H-navegacion.md:329](revision-2026-10-19/H-navegacion.md) |

## N2 — Navegación N2

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| F-13 | Medio | Funciones duplicadas / Consistencia · Confianza alta — - Conviven dos registros de P&ID: uno con visor y pines pero sin control de revisión, y otro con revisiones pe | [F-ingenieria-docs-vendors.md:193](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| G-14 | Medio | Duplicación — Vistas "proyecto" y "global" casi idénticas | [G-frontend-calidad.md:182](revision-2026-10-19/G-frontend-calidad.md) |
| H-10 | Medio | Vistas redundantes · 5 «resúmenes» y 4 vistas de jerarquía | [H-navegacion.md:258](revision-2026-10-19/H-navegacion.md) |
| H-15 | Medio | Conceptos duplicados · Documentos (registro) frente a P&IDs | [H-navegacion.md:295](revision-2026-10-19/H-navegacion.md) |

## N3 — Navegación N3

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| H-17 | Medio | Búsqueda y acceso rápido · Sin búsqueda global, command palette, creación rápida ni selector de proyecto | [H-navegacion.md:307](revision-2026-10-19/H-navegacion.md) |
| H-21 | Bajo | Ayuda · La guía está desactualizada respecto a la IA actual | [H-navegacion.md:335](revision-2026-10-19/H-navegacion.md) |

## Q — Calidad transversal

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| G-06 | Alto | i18n — Interfaz mezclada para usuarios en inglés: 52 componentes sin traducir y errores de servidor solo en español | [G-frontend-calidad.md:120](revision-2026-10-19/G-frontend-calidad.md) |
| B-15 | Medio | Integridad / duplicación — Autosave de ITR no atómico; avance calculado en TS mientras la firma usa SQL | [B-datos-rendimiento.md:380](revision-2026-10-19/B-datos-rendimiento.md) |
| C-18 | Medio | UX/i18n — Errores de la BD en inglés y textos fijos en español | [C-completions.md:170](revision-2026-10-19/C-completions.md) |
| C-19 | Medio | rendimiento/pérdida de datos — Guardado al perder el foco y `router.refresh()` de la página entera en cada guardado | [C-completions.md:176](revision-2026-10-19/C-completions.md) |
| G-08 | Medio | UX/Testabilidad — 56 `window.confirm()`, incluidas firmas y emisiones irreversibles | [G-frontend-calidad.md:141](revision-2026-10-19/G-frontend-calidad.md) |
| G-09 | Medio | Design system — Librería `ui` declarada pero poco adoptada; primitivas duplicadas en tres capas | [G-frontend-calidad.md:148](revision-2026-10-19/G-frontend-calidad.md) |
| G-10 | Medio | Theming — Dark mode inconsistente: 2 842 hex literales y tokens de estado sin variante oscura | [G-frontend-calidad.md:155](revision-2026-10-19/G-frontend-calidad.md) |
| G-11 | Medio | Accesibilidad — Contraste insuficiente en chips y texto secundario, y tipografía muy pequeña | [G-frontend-calidad.md:162](revision-2026-10-19/G-frontend-calidad.md) |
| G-12 | Medio | Accesibilidad — Modales ad hoc sin semántica de diálogo, labels sin asociar y celdas clicables | [G-frontend-calidad.md:169](revision-2026-10-19/G-frontend-calidad.md) |
| G-15 | Medio | Rendimiento — Todo el diccionario i18n (~190 KB) viaja en cada página | [G-frontend-calidad.md:189](revision-2026-10-19/G-frontend-calidad.md) |
| G-17 | Medio | Testing — Pirámide sin capa de componentes ni e2e en CI, y sin cobertura medida | [G-frontend-calidad.md:202](revision-2026-10-19/G-frontend-calidad.md) |
| G-18 | Medio | Type safety — 157 `as unknown as` en las fronteras de consulta | [G-frontend-calidad.md:208](revision-2026-10-19/G-frontend-calidad.md) |
| G-19 | Medio | Estado/refresh — Doble invalidación y ninguna UI optimista | [G-frontend-calidad.md:215](revision-2026-10-19/G-frontend-calidad.md) |

## T — Trimestre

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| I-07 | Alto | Sin membresía por proyecto ni capacidades funcionales: client ve todo y cualquier leader firma como Operaciones o HSE | [I-roles-integraciones.md:239](revision-2026-10-19/I-roles-integraciones.md) |
| A-16 | Medio | funcionalidad faltante / seguridad — No hay membresía por proyecto y las API keys son siempre de toda la org | [A-seguridad.md:135](revision-2026-10-19/A-seguridad.md) |
| E-25 | Medio | Firma electrónica — para un PTC contractual o un traspaso de custodia, una sesión abierta en un PC de sala de control basta para f | [E-arranque-operacion.md:233](revision-2026-10-19/E-arranque-operacion.md) |
| F-17 | Medio | Integración / Estrategia F8 · Confianza alta — la decisión §15.2 dice "integrar por referencia con el EDMS de la operadora", pero sin API ni importación Exce | [F-ingenieria-docs-vendors.md:252](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| F-21 | Medio | Alcance F8 incompleto frente al plan · Confianza alta — - El red-line de campo (marcar el P&ID durante el loop check o el walkdown) es el insumo del as-built. Sin él, | [F-ingenieria-docs-vendors.md:295](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| I-18 | Medio | API v1: brechas funcionales y de gobierno | [I-roles-integraciones.md:345](revision-2026-10-19/I-roles-integraciones.md) |
| I-20 | Medio | No hay SSO/SAML, MFA ni re-autenticación al firmar | [I-roles-integraciones.md:373](revision-2026-10-19/I-roles-integraciones.md) |
| I-23 | Bajo | El conector P6 es un POC que necesita la service role key | [I-roles-integraciones.md:396](revision-2026-10-19/I-roles-integraciones.md) |
| I-26 | Bajo | Observabilidad mínima | [I-roles-integraciones.md:410](revision-2026-10-19/I-roles-integraciones.md) |
