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

**Estado S05 (2026-10-19, ae789f0; migración `20261103120000_itr_content_status_s05.sql` probada con ROLLBACK —10 escenarios— y **aplicada en prod** con autorización de Luis; D7 según recomendación):** verificados vigentes.
- C-10 / A-28 ✅ (D7) sin cambio masivo de estado ni «aprobar seleccionados» (que siempre fallaba): la barra ofrece reprogramar (`bulkRescheduleItrs`), asignar y agregar a plan, en la lista del proyecto y en la global. Verificado en navegador.
- C-34 ✅ `refresh_itr_status` (RPC) recalcula estado, avance y fecha de completado desde `evaluate_itr_capture`; las acciones de respuestas y evidencias la llaman en vez de escribir `itrs`; `guard_itr_derived` impide escribir esos campos por REST (también a editores); `itrs_update` solo editores. Recalculó 1 ITR DEMO (QA-FOTO: en progreso → sin iniciar).
- C-15 ✅ `assign_itr_number` + `itr_number_counters`: el cliente manda la base y la BD agrega « Rn» bajo candado (R2, R3; tras borrar R3 sigue R4).
- C-20 ✅ casilla cuenta solo marcada; un «No» cuenta solo con observación (SQL y `completion.ts`, + tests); la observación aparece y se marca obligatoria en un «No», con la sugerencia de punch.
- C-23 ✅ `return_itr_to_executor`: el supervisor o cliente asignado devuelve con motivo; se retiran las firmas, se audita y se avisa al ejecutor (botón en la ejecución).
- C-26 ✅ captura solo el ejecutor asignado o un supervisor (respuestas y evidencias); trazo PNG ≤ ~256 KB en la action y en `sign_itr_atomic`.
- C-21 ✅ confirmado de S1-v1 (`itemDescription`). C-40 ✅ crear ITR exige plantilla activa, subsistema del tag y ejecutor que no sea cliente; el tier de edición de plantillas (líder) se deja como está (decisión de producto pendiente, no se cambió).

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

**Estado S06 (2026-10-19, 037a15a + 3204f08; migración `20261030120000_punch_rpc_field_s06.sql` probada con ROLLBACK —22 escenarios, con roles inspector/leader simulados— y **aplicada en prod** con autorización de Luis; D8 según recomendación):** todos verificados vigentes antes de tocar (el hotfix de S02 solo había exigido «transferido» en Operaciones).
- C-03 / A-15 / I-02 ✅ confirmado lo de S1-v1 (el inspector levanta, comenta y adjunta). La bandeja ya no descarta un punch rechazado: queda en «No sincronizado» en la ejecución del ITR, con el error y «Descartar» (política de la bandeja: punch = nunca se descarta solo).
- A-06 / I-04 / C-11 ✅ `punches_update` solo para roles de campo (no client); `guard_punch_row` impide por REST cancelar, cambiar la categoría y el seguimiento de Operaciones, y al inspector todo salvo impacto y disposición. `cancel_punch`: leader+, distinto de quien lo levantó, motivo ≥ 10, comentario + `activity_log`. Control «Cancelar punch» con motivo en el tag y en la lista; sin cancelación masiva. Un Cat A cancelado deja de bloquear en el acto (la elegibilidad se calcula en vivo; no hay nada que re-evaluar). Matriz A-17: cerrado el `gap` A-06 y nuevo caso «categoría por REST» (nadie).
- C-04 / A-03 ✅ `update_punch_ops_status`: sesión o service role explícito (sin claims `auth.role()` es NULL: corregido con `COALESCE`, lo encontró la prueba), rol supervisor u Operaciones, máquina de estados, `verified_ops` solo desde `resolved_ops` y `closed_final` solo desde `verified_ops`, cada uno por otra persona y nunca por API. `transfer_punch_to_ops`: supervisor, punch abierto, receptor de la org. UI de Operaciones ofrece solo las transiciones válidas (`src/lib/punches/ops-states.ts` + test).
- B-10 ✅ numeración por `punch_counters` (sembrado en 706); el MAX solo la primera vez; salta números cargados a mano.
- C-22 ✅ `punches.itr_item_id`; el modal desde el ITR lleva ítem, responsable opcional y fotos; id generado en el cliente → envío idempotente en línea y sin red (fotos en `punch-attachments/<id>/campo-N`). Verificado en navegador en línea (P-0707) y sin red simulado (P-0708, sincronizó al reconectar con el mismo id); ambos cancelados después con `cancel_punch`. Sin marcado sobre la foto ni conversión HEIC (queda para N-fase/T).
- F-01 ✅ `sanitize` convierte caracteres de control en espacio; `wrapText` separa párrafos antes (test con pdf-lib real).
- C-41 ✅ `createSignedUrls` en la ejecución del ITR y en los adjuntos de punch. C-44 ✅ `punches_verify` (quien lo levantó o un supervisor) y `signatures` (solo firmantes) en `my_work_counts`, y la lista de Mi trabajo igual.
- Lección de CI (3204f08): `pg_get_functiondef` califica los tipos propios según el `search_path`; el volcado canónico usa `search_path` vacío, igual que la RPC de deriva. `readiness.test` ahora prueba que el REST a «cancelled» falla (42501) y que `cancel_punch` rechaza a quien lo levantó.
- **Sin verificar:** el `UPDATE` por REST a `cancelled` con un usuario inspector real (no hay usuario inspector de prueba; cubierto por los escenarios SQL como `authenticated` y por la matriz en CI para admin).

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

**Estado S07 (2026-10-19, 6d3c75f; migración `20261031120000_imports_s07.sql` probada con ROLLBACK —7 escenarios, con usuario temporal revertido— y **aplicada en prod** con autorización de Luis; D9 según recomendación):** todos verificados vigentes. Causa raíz común: el upsert por lotes de supabase-js rellena con NULL las claves que le faltan a una fila, así que el «spread condicional» no protegía nada.
- C-16 ✅ `src/lib/import/tag-merge.ts` (+ test): columna ausente o celda vacía no se toca; claves uniformes por lote (los tags existentes se completan con su valor actual); el tipo de equipo solo cambia con su columna; el SIL sugiere «safety» solo en tags nuevos; sin columna de subsistema no se crea «GEN-SUB». Un tag con ITR o punch **no se mueve** de subsistema por importación (aviso con la lista). Vista previa del diff por campo (`previewTagImport`, por lotes, no escribe). Verificado en navegador contra prod: vista previa («Fabricante: cambia en 1 tag», BAT-101 bloqueado) y una importación real que dejó PT-101 intacto. **Flujo explícito (D9, migración `20261101120000`):** «Mover de subsistema» en el detalle del tag (líder+, motivo ≥ 10, vista previa `tag_subsystem_move_preview`); la RPC `move_tag_subsystem` mueve en una transacción el tag, sus ITR sin firmar y sus punches abiertos (cerrados/cancelados se quedan como historia) y lo audita en activity_log; un ITR firmado o aprobado bloquea (reabrir primero). `guard_itr_row` solo deja cambiar `subsystem_id` al dueño de la tabla; `guard_tag_subsystem` impide por REST mover un tag con ITR o punches abiertos. Probado con BEGIN…ROLLBACK en prod: BAT-101 (6 ITR + 1 punch) U200-S02 → A100-S01, `compute_system_readiness` de ambos sistemas consistente (suma 7 = 7), rechazos de inspector, motivo corto, otro proyecto, mismo subsistema, ITR firmado y REST. La importación enlaza los tags bloqueados a su detalle.
- F-06 ✅ `src/lib/import/signal-merge.ts` (+ test): la cadena (JB → HMI), las alarmas y el lazo solo cambian si el archivo trae la columna con valor; aviso en la vista previa de lo que se conserva.
- C-24 / F-23 ✅ el cliente manda lotes de 1000 filas con progreso (`src/lib/import/batches.ts` + test); filas de error corregidas por desplazamiento; informe de errores completo descargable en Excel (tags y señales).
- F-16 ✅ edición de la cadena, rango y alarmas de una señal en el detalle (`SignalChainEditor`, `updateSignalChain`, leader+, patch parcial, `activity_log` con antes/después).
- C-28 ✅ `bootstrap_org` (RPC, solo service role): el asistente entero en una transacción (la validación zod y «una org por usuario» ya venían de S02).
- F-36 ✅ `create_ce_matrix_from_review` (RPC invoker): matriz, causas, efectos y cruces en una transacción; sin borrado compensatorio.
- F-32 ✅ XLSX sin apóstrofo (`xlsxCell`; en XLSX una cadena no se evalúa); el guard con apóstrofo queda para CSV.
- **Hallazgo nuevo S07-N1 ✅:** `detectHeaderRow` asignaba «exacta y luego parcial» campo por campo, y la parcial de un campo anterior se robaba la exacta de otro («SUBSISTEMA»/«SUBSYSTEM_CODE» caían en el sistema): dos pasadas globales + test. Afectaba a tags y señales.
- **Queda (no bloquea D9):** el flujo explícito «mover tag de subsistema» con sus ITR y punch (hoy la importación lo impide y lo informa; mover ITR exige tocar `guard_itr_row`) → propuesto como sesión aparte. La vista previa por campo de señales no se hizo (solo el aviso de lo que se conserva).

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

**Estado S08 (2026-10-19, 68498e6; migración `20261102120000_preservation_rpc_s08.sql` probada con ROLLBACK —10 escenarios con roles inspector/client simulados, más RESTRICT con un tag sin ITR— y **aplicada en prod** con autorización de Luis; D10 según recomendación):** verificados vigentes (en prod había 0 planes y 0 registros).
- C-05 / I-03 / C-06 ✅ RPC `start_preservation_record` (idempotente, índice único de un registro abierto por plan), `save_preservation_response` y `finalize_preservation_record` (roles de campo, nunca client). Se eliminó el trigger `AFTER INSERT` que avanzaba la fecha al primer toque: ahora avanza al finalizar, con cualquier resultado, en la misma transacción; un NOK exige categoría y levanta su punch. La pantalla comparte la promesa de apertura y muestra los errores de guardado.
- C-42 ✅ `preservation_records.tag_id`/`plan_id` y `preservation_plans.tag_id` en `RESTRICT`: el historial ya no se borra con el tag ni con el plan. Escritura directa de registros y respuestas solo editores; fotos, roles de campo.
- H-08 ✅ `/projects/[id]/preservation` (el aviso de vencido ya enlazaba ahí y daba 404) reutilizando la vista global con alcance de proyecto; las filas enlazan al tag y a «Ejecutar». Verificado en navegador.
- C-39 ✅ cron de vencidos paginado (sin `limit(2000)` global) y `.in()` en lotes de 200.
- I-14 ✅ borrar plantillas ITR/PSSR con el tier de la RLS (PRIVILEGED) y comprobando filas; la UI muestra el error.
- C-27 ✅ borrar punch solo si es error de carga (abierto, sin resolución, fotos ni vínculos; `src/lib/punches/deletable.ts` + test) y auditado; masivo igual; `deleteItr` informa y audita; la foto de punch se borra fila primero.
- **No hecho:** el mensaje amable al borrar un tag con historial (23503) — `tags.ts` lo estaba editando en paralelo la sesión del flujo «mover tag»; se le avisó. Sin verificación en navegador de la ejecución de un plan (prod no tiene planes; cubierto por los escenarios SQL).

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

**Estado S09 (2026-10-19, fc36e63; migraciones `20261104120000_kpi_truth_s09.sql` —probada con ROLLBACK: conteos = `count(*)`, idempotente, ACL— y `20261104130000_indexes_s09.sql` —39 sentencias CONCURRENTLY una por una, 0 índices inválidos— **aplicadas en prod** con autorización de Luis; D11 según recomendación):**
- B-01 / D-08 / B-25 ✅ `take_kpi_snapshot` (SQL, solo service_role) en el cron y en «Tomar snapshot»; clave única `NULLS NOT DISTINCT`, upsert, borrado de fases sin ITR; sin políticas de escritura en `kpi_snapshots`. `getProjectSnapshots` toma los 730 más recientes.
- D11 ✅ `kpi_snapshots.suspect` (ver COMMENT); hoy 0 filas. Curva S con punto hueco ámbar + nota; columna «Dato dudoso» en el Excel.
- B-02 ✅ matriz de certificados con `subsystem_phase_itr_counts` + `subsystem_rollup` (paginados) y `evaluateEligibilityCounts` (misma regla que `evaluateEligibility`); Cat B abiertos completos para el modal.
- B-05 / B-09 ✅ 29 índices de B-05; `guard_itr_row` toma la plantilla con `FOR KEY SHARE` (la edición sigue con `FOR UPDATE` en `guard_assigned_itr_template`). `is_assigned` no se agregó: con `idx_itrs_template` el EXISTS ya es un index scan.
- B-27 ✅ 10 índices redundantes o de 0 scans borrados (`idx_kpi_snapshots_*` también, cubiertos por la clave única).
- B-24 ✅ `preservation_is_overdue` (activo y próxima fecha < hoy, sin la tolerancia de 3 días del sidebar) y `preservation_due_counts`: sidebar, Mi trabajo (`my_work_counts`, archivo canónico), dashboard y snapshot.
- B-07 / B-08 ✅ `fetchAllRows` agrega siempre un orden único (`key`) y lanza `TruncatedError` (o `fetchAllRowsFlagged` → `truncated`) en vez de cortar; exportaciones de ITR/punch, admin, preservación y gestión diaria responden 413 o error claro. Mi trabajo y widgets filtran en el servidor (`itrs!inner`, sin aprobados); señales, lazos, explorer, gemelo, preservación, certificados, work plans, P&ID (estado solo de los tags con pin), tag (anterior/siguiente con dos consultas de 1 fila), crons de restricciones y PSSR vencidos, curva del evento, `loadSourceItrs` (lotes de 200).
- F-04 ✅ reporte imprimible y Excel de KPIs con `project_itr_phase_counts` / `project_punch_counts`.
- F-07 / F-08 / E-20 / D-24 ✅ documentos y referencias, panel de referencias (los documentos referenciados se cargan por id), tags del paquete de vendor, empresas, señales de bitácora y desempeño, competencias (nivel vigente sobre todo el historial), traspasos, gestión diaria y look-ahead completos; aviso `Common.listPartial` si se supera el tope. D-24 operaciones masivas (reasignar/verificar en lote) **no** se hicieron: quedan para S22/N2.
- B-22 ✅ parcial: la fase se filtra por `phase_id`; búsqueda que llega al tope de 150 tags o 100 plantillas muestra `Common.searchPartial`. `count: 'exact'` y paginación keyset quedan como están (correctitud antes que costo; medir en S20).
- KpiSummaryWidget ✅ todas las fases (antes `slice(0, 3)`), preservación por la definición única.
- F-29 ✅ As-Built/Final del registro sobre documentos ligados a sistemas (`n / ligados`), igual que el KPI; «superadas» del registro rotulado «incl. ITR abiertos»; /kpis ya decía «snapshot diario».
- Regla de CI ✅ `src/lib/list/unbounded-from.test.ts`: lecturas de proyecto/org/persona sin `.limit/.range/.single/head`, fuera de `fetchAllRows` y sin `// bounded:`, o con `.limit(N>1000)`; baseline por archivo×tabla (60 lecturas en 50 claves, desde 127) que solo puede bajar.
- Tests: `fetch-all.test.ts` (encontró que una fila de más en la última página se colaba), `unbounded-from.test.ts`, `tests/db/kpi-truth.test.ts` (agregados = `count(*)` bajo RLS; snapshot y escritura directa denegados).
- **Listo cuando** (LOADTEST 50k): el proyecto LOADTEST ya no existe en prod; la igualdad con `count(*)` se verificó en DEMO dentro de la transacción de prueba y queda como test de BD. Verificación en el navegador pendiente de sesión (el panel quedó en /login).

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

**Estado S10 (2026-10-20; migración `20261105120000_project_timezone_s10.sql` —probada con ROLLBACK: zona por defecto y zona inválida rechazada, límites del día, reporte con totales en 199 ms, `my_work_counts` idéntico antes/después, borrador + reemplazo IA, relevo y snapshots con el día local, borrado de la evaluación previa— **aplicada en prod** con autorización de Luis; D12 según recomendación):**
- D-05 / E-15a / G-13 / B-29 ✅ `projects.timezone` (IANA, por defecto `America/Bogota`, validada por trigger contra `pg_timezone_names`) y `project_today()` / `tz_today()` / `tz_day_start()`. Las 24 funciones que usaban `CURRENT_DATE` (volcadas a `supabase/functions-sql/`, 15 nuevas) usan el día del proyecto: reporte, borrador, relevo y su snapshot, snapshots KPI y de gestión (ventana de 30 días y «a tiempo» en la zona), firmas de ITR y `refresh_itr_status` (`completed_date`), cierre/cancelación/verificación de punch (`closed_date`), preservación (`next_due_date`, vencidas en `preservation_due_counts` y `my_work_counts`), test equipment (`used_on`), decisiones, competencias, documentos, vendors, pronóstico. Crons (restricciones, PSSR, preservación) filtran con la cota UTC+14 y aplican la zona de cada proyecto; Mi trabajo y widgets marcan vencidos por proyecto; fecha por defecto del reporte y del relevo = hoy del proyecto. Zona editable en «Editar proyecto» (lista de 25 + cualquier IANA válida; `updateProject` ahora solo acepta campos editables).
- D12 ✅ los reportes emitidos no se recalculan (sha256 intacto). Si su `data` no trae `timezone`, pantalla y PDF avisan que el día se cortó en UTC y que se corrige con una revisión. Hoy prod no tiene reportes diarios (0 filas), así que el aviso no aparece en DEMO.
- D-06 ✅ `approved_today_count`, `raised_today_count`, `overdue_count`, `open_high_count`, `registers_in_field_count`; hechos de la IA, tarjetas, listas y PDF usan el total («45 · se listan 30»). Reportes viejos: total = largo de la lista.
- B-20 ✅ «aprobados hoy» parte de las firmas del día (índice nuevo `idx_itr_signatures_signed_at`) y descarta ITR con firmas posteriores; la TEMP TABLE pasó a arreglo + CTE; test de BD sin timeout extendido. Las regresiones siguen llamando a `compute_project_gates` (caché de B-04 → S20).
- D-29 ✅ el reporte guarda `as_of` y lo rotula («estado al …; no se reconstruyen para fechas pasadas»). No se reconstruye con snapshots.
- D-27 ✅ snapshots con el día local (el cron de 02:00 UTC ya no etiqueta el día siguiente); curva S con línea de plan escalonada desde los compromisos por gate × peso, ponderada por ITR igual que el avance real (`plannedCurve`, tests). DEMO no tiene compromisos: la línea no se vio en vivo.
- D-28 ✅ «Rehacer con IA» en una sola RPC (`replace_daily_report_ai_draft`).
- B-26 ✅ `performance_runs.evaluation_preview`: `evaluate_performance_run` la guarda y triggers la borran si cambian el intento, sus datos o sus perturbaciones (registrar el resultado recalcula siempre). La consola lanza error si falla una página y avisa si la serie supera 30 000 puntos.
- E-15b/c ✅ hook `useLocalTime` (hora del navegador con su zona; UTC rotulado en el SSR) en procedimientos, line-ups, traspasos, bitácora, desempeño y ejecuciones; reporte, relevos y PDFs (reporte, relevo, procedimiento, desempeño) con la zona del proyecto rotulada (`formatInZone`, sin `suppressHydrationWarning`). Emisión de certificados y PSSR con el día del proyecto; formularios cliente (work plans, PSSR, punch, exportaciones) con el día del navegador. `next-intl` con `timeZone` fijo.
- D-30 ⏸ aplazado: relevo por área/destinatario → S22 (avisos y colas).
- Residual → Q: ~35 `toLocale*()` sin zona y ~55 `suppressHydrationWarning` fuera de las vistas tocadas, `formatDate('es-CO')` fijo, sellos «generado el» de PDFs globales en UTC, defaults de columna `CURRENT_DATE` (las RPC siempre los llenan), dedupe diario del cron de preservación por día UTC.
- Verificado en navegador (sesión de Luis): borrador RD-DEMO-GLP-20261020 con fecha local por defecto, «datos al 20 de oct de 2026, 14:05 GMT-5», «estado al …», PDF 200 (borrado después); Mi trabajo igual; modal del proyecto con «Zona horaria = America/Bogota»; consola de PTT-0001/R2 con horas GMT-5 y PDF 200; sin errores de consola. PDF de muestra con 45 aprobados y evento a las 21:10 GMT-5 revisado.

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

**Estado S11 (2026-10-20; migración `20261106120000_gate_logic_s11.sql` —probada con ROLLBACK: sin aprobaciones la matriz de DEMO queda idéntica (0 diferencias), anterior en regresión bloquea y con política «condición» deja amarillo, proveedor en regresión detectado (condición / bloqueo), corte de punch por fecha de aprobación, PSSR más reciente, ciclo por gates permitido y el inverso rechazado, quitar firmas completa la aprobación pendiente, borrado lógico de criterio con declaración, retirar declaración con motivo y auditada, inspector no desescala N3 ni mueve de gate, replanificar con motivo conserva `original_due_date`, prueba retirada deja `performance_accepted` no aplicable— **aplicada en prod** con autorización de Luis; D13 según recomendación):**
- D-02 / D13 ✅ `org_gate_policy()` (`organizations.settings.gate_policy`, por defecto: anterior en regresión **bloquea**, proveedor en regresión **condición**). `compute_system_gates` pasó a `compute_system_gates_upto(sistema, orden_máx)` (+ envoltorio): el proveedor se evalúa solo hasta su gate requerido, así no hay recursión infinita. TS: `gatePolicy()` y `dependencyBlocks(…, regressedDependency)` en Control Tower. Configurable en `/admin/gates` (auditado en `activity_log`). Costo medido en DEMO: 120 ms sin aprobaciones, 192 ms con un proveedor aprobado y 11 dependientes (había un 5× por *pull-up* de subconsulta, corregido con `OFFSET 0`). Caché para escala → S20.
- D-13 ✅ `system_phase_level(…, p_punches_before)`: en un gate aprobado solo cuentan los punch anteriores a su aprobación (igual en `critical_tags_ready`); los nuevos frenan el siguiente gate. Opción de org `cat_a_regresses_approved`.
- D-11 ✅ `system_pssr_status()` (el más reciente) en el gate y en `startup_prerequisites`.
- E-07 ✅ `readiness_gates.is_startup_gate` (único por org; respaldo: RFSU en DEMO). `startup_prerequisites` lo usa y además exige que no esté en regresión. Aviso en `/admin/gates` si un gate con prueba de desempeño va antes o junto al de arranque, o si no hay gate de arranque.
- E-08 ✅ `lineup_verified` y el checklist de traspaso solo cuentan hojas de propósito `startup`.
- E-14 ✅ `performance_tests.status` + `withdraw_performance_test` (líder+, motivo ≥ 10, sin intento en curso, auditado) y botón «Retirar prueba»; el gate solo cuenta pruebas vigentes con una revisión aprobada.
- D-10 / F-28 ✅ `documents_current` por la fase del gate y por subsistema (ITR de lazo/C&E sin tag incluidos); procedimientos solo en el gate de arranque; estado nuevo `approved_needs_review` («✓?») en SQL, TS e i18n.
- D-14 ✅ desescalar desde N≥3 y mover de gate/sistema una restricción abierta: líder+ con motivo (`gate_changed` en la línea de tiempo); cambiar la fecha requerida pide motivo; cerrar otra persona distinta de quien resolvió.
- D-15 ✅ `actions.original_due_date` (trigger) y el KPI «a tiempo» mide contra ella; replanificar pide motivo (`replanned`); el método de verificación no cambia una vez empezada, salvo líder+.
- D-17 ✅ `system_gate_approvals.completed_at` (al completar firmas; respaldo con la última firma). KPI: denominador = compromisos que vencían en la ventana, a tiempo = completado en o antes del compromiso (`due_30d`; snapshots viejos siguen mostrando `approved_30d`).
- D-20 ✅ triggers `gate_config_audit` (todo cambio en `readiness_gates` / `gate_criteria` → `activity_log`), `gate_criteria_soft_delete` (un criterio con declaraciones se archiva con `deleted_at`; el borrado de un gate con declaraciones se rechaza) y `gate_signatures_changed` (quitar una firma requerida completa las aprobaciones que ya la cumplen). Confirmación con el impacto («N declaraciones en M sistemas»).
- D-21 ✅ `revoke_gate_attestation(id, motivo)`: motivo ≥ 10, `activity_log`, rechazado con el gate aprobado. La independencia declarante ≠ aprobador no se exigió (opcional en el hallazgo).
- D-35 ✅ ciclos por gate: «A.RFC necesita B.MC» y «B.RFSU necesita A.MC» conviven; el inverso se rechaza.
- D-31 ✅ el catálogo PROC-INTRO ya no trae la declaración manual de line-up: nace con `requires_lineup`.
- D-33 📄 RACI por defecto (documentado, sin cambio de roles): aprueba Comisionamiento = owner/admin/architect; co-firman Operaciones/HSE = owner/admin/architect/leader/client; comprometen fechas y autorizan bypass = leader+; desescalar N≥3, mover restricciones, retirar pruebas = leader+. Unificar roles queda para S14 (capacidades).
- D-34 ⏸ gates por proyecto (L) → trimestre.
- Residual: dependencia hacia un gate desactivado sigue desapareciendo sin aviso (D-35, segunda parte) → S23; advertencia de React por `key` en `/admin/gates` (anterior a S11) → Q.
- Tests: `tests/db/gate-logic.test.ts` (política = TS, PSSR único y gate de arranque, retirar declaración sin motivo), `tests/db/dependencies.test.ts` (ciclo por gates), `import.test.ts` (dependencias con política). Verificado en navegador: `/admin/gates` (política, gate de arranque RFSU, cambio auditado y revertido), Control Tower y ficha de A100-S01 sin errores.

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

**Estado S12 (2026-10-20; migración `20261107120000_iiot_s12.sql` —probada con ROLLBACK: 2460 filas y la vista de 1 minuto idénticas tras particionar, `signal_series` en 4–5 ms con tope de puntos y de rango, ingesta que acepta 1 y rechaza 6 con su motivo, upsert, `ambiguous_signal` sin proyecto y aceptada con proyecto, guard de señal duplicada, retención, evaluación de PTT-0001/R2 sin cambios— **aplicada en prod** con autorización de Luis):**
- B-12 / E-03 ✅ `signal_samples` particionada por mes (`signal_samples_YYYYMM`, 7 particiones hoy); `ensure_signal_sample_partitions()` crea la ventana de retención + 3 meses; `cleanup_signal_samples_retention()` borra particiones enteras y el borde. La retención **ya corría** en prod por un job `pg_cron` creado a mano (`signal-samples-retention-90d`, 03:00 UTC); ahora está versionado en la migración. `signal_series(ids, desde, hasta, bucket, máx. puntos)`: filtro por rango sobre la PK, membresía comprobada una vez, mín/máx por bucket, tope de 35 días, 50 señales y 2000 puntos por señal (el bucket sube solo). Ficha del evento y consola en vivo la usan; la vista `signal_samples_1min` queda por compatibilidad. Privilegios de la tabla: `anon` ya no tiene ninguno; `authenticated` solo SELECT.
- E-04 / B-18 ✅ `ingest_signal_samples(…, p_project_id, p_upsert)`: busca por `signal_id` o por nombre dentro del proyecto; sin proyecto, un nombre repetido entre proyectos → `ambiguous_signal` (antes `LIMIT 1`). API: `project_code` opcional en el lote. Trigger `guard_signal_tag_unique` (señal activa única por proyecto). Alcance de API key por proyecto: no se hizo (la key sigue siendo de org) → S15.
- E-24 ✅ cada muestra se valida aparte con motivo (`invalid_timestamp`, `invalid_value` —NaN/±Infinity—, `invalid_quality`, `future_timestamp` > 5 min, `too_old` > 90 días, `signal_not_registered`, `ambiguous_signal`), errores con índice (hasta 200), `duplicates`; `upsert: true` corrige muestras; la API ya no devuelve el mensaje de Postgres.
- E-06 ✅ un intento evaluado también se trata como congelado (sin mezclar puntos en vivo); la serie en vivo va por `signal_series` acotada a [estabilización, ahora].
- E-18 ✅ `performance_test_revisions.max_bad_pct` (10 %), `max_spikes` (sin límite) y `exclude_out_of_range` (sí): por encima del umbral la sugerencia es «no concluyente» (motivo `data_quality`) y los minutos fuera del rango del instrumento no entran al estadístico. Los umbrales no se editan aún en la UI de la revisión (quedan con el valor por defecto) → S25.
- E-28 ✅ `value_extrapolated` (promedio × minutos del periodo formal) junto al total, documentado y visible en la evaluación.
- E-33 ✅ `minMaxDownsample` (mín/máx por tramo) en la consola y en el PDF; ya no se esconde un pico corto. Eje de tiempo, objetivo y sombreado en el PDF → S25.
- Prueba de carga a 1 Hz × 20 señales × 90 días: no se hizo (DEMO a 1/min) → S20.
- Tests: `tests/db/iiot.test.ts` (rango y tope de `signal_series`, membresía, ingesta no ejecutable por usuarios), `src/lib/performance/series.test.ts`. Verificado en navegador: consola de PTT-0001/R2 (4 gráficos desde datos congelados) y su PDF.

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

**Estado S13 (2026-10-20; migración `20261108120000_f8_fixes_s13.sql` —probada con ROLLBACK, 28 comprobaciones: vigente tras cargar historial, fecha futura, anular y re-registrar la letra, referencia automática al crear ITR, referencias masivas, bloqueo por revisión superada, revalidación masiva, política IFR/IFA en `block` y en `warn`, R2 de procedimiento con referencias, re-prueba y KPI, segregación de recomendaciones, terminación anticipada, borrado C&E con ITR, `tag_key`, subida al bucket— **aplicada en prod** con autorización de Luis). Decisiones de Luis: (1) referencias automáticas + acciones masivas; (2) IFR/IFA = aviso por defecto, bloqueo si la org lo activa; (3) QR completo (escáner tolerante + etiquetas QR por tag):**
- F-03 ✅ `document_refresh_current`: vigente = fecha de emisión más reciente (a igual fecha, la última registrada). La UI pide la fecha (por defecto hoy, máximo hoy) y avisa «quedará como historial» si es anterior a la vigente. `currentRevision()` en `catalog.ts` replica la regla.
- F-24 ✅ estado `void` (`void_document_revision`, líder+, motivo ≥ 10; guarda estado anterior, quién, cuándo y por qué); la letra queda libre (índice único parcial). Fecha de emisión futura rechazada en `add_document_revision` / `issue_document_revision` (día del proyecto).
- F-02 ✅ trigger `itrs_auto_document_refs`: al crear un ITR se referencian (a la vigente) los documentos de campo (P&ID, PFD, plano, hoja de datos, especificación) ligados al sistema del subsistema, más los que nombran el P&ID del tag o el P&ID / diagrama de lazo / de conexionado de sus señales o del lazo del ITR. Masivas en la ficha del documento: `reference_document_in_open_itrs` (ITR sin firmas de sus sistemas) y `revalidate_document_references` (abiertas se actualizan; firmadas/aprobadas se revalidan con un motivo común, cada fila con quién, cuándo y desde qué revisión). «¿Afecta a registros de campo?» se resuelve con la revalidación masiva (no se preguntó al emitir). `requires_doc_types` por plantilla no existe en el esquema: no se hizo.
- F-20 ✅ `organizations.settings.document_policy.below_ifc` (`warn` | `block`; `org_document_policy()` = `documentPolicy()`): con `block`, `add_document_reference` / `update_document_reference` / masivas rechazan IFR/IFA y `document_references_blocker` bloquea firmar o aprobar contra ellas; con `warn` (defecto) aviso en la ficha y chip «IFR · no IFC» en el panel. Se cambia en el registro de documentos (owner/admin, auditado en activity log).
- F-12 ✅ `new_procedure_revision` copia las referencias a la revisión vigente de cada documento. ITR R2 de lazo/C&E: heredan por el trigger de referencias automáticas (no se copian las manuales del R1).
- F-05 ✅ `vendor_activities.retest_of` + `create_vendor_retest` (fallida o con hallazgos, una por actividad); KPI `vendors` ignora la que tiene re-prueba. UI: «Programar re-prueba», chips «Re-prueba de…» / «Superada por re-prueba».
- F-34 ✅ terminación anticipada de un paquete movilizado (motivo ≥ 10; se muestra «Terminado anticipadamente»); quien propone una recomendación no la decide; pistas del checklist desde el registro (documentos de la empresa con IFC+/As-Built y equipos con calibración vigente, en el día del proyecto). PDF/Excel del paquete: no se hizo → S24 (paquete de handover v2).
- F-11 ✅ PDF del ITR: sección «Documentos de referencia» (usada, vigente al imprimir, superada / revalidada con motivo / no IFC) y empresa congelada del firmante. PDF del procedimiento: documentos de referencia; la empresa de quien aprueba no está congelada en `procedure_revisions` → S14.
- F-10 ✅ `Ω`/`Ω`→«Ohm», `Δ`→«d», `μ`→«µ», `√`, `∞`, `₃` en el renderer (test con «500 MΩ» → «500 MOhm»). Fuente Unicode incrustada: no (alfabetos no latinos siguen en «?») → Q.
- F-15 / F-33 ✅ columna generada `tags.tag_key` (sin mayúsculas, espacios, guiones, puntos, barras ni «_») con índice; importación C&E con IA y `resolveTag` emparejan por ella (una clave con dos tags queda en ámbar); `resolveSignal` escapa `%` y `_`. «¿Quisiste decir…?»: no se hizo.
- F-18 / C-31 ✅ `src/lib/tags/qr.ts`: el escáner acepta cualquier texto (`/tag_360/…` con «/», «.», «#», «%», `commup://tag/…`, texto plano) sin forzar mayúsculas; Tag 360 resuelve por UUID, `tag_key` o UID NFC y, con varias coincidencias, muestra un selector (último proyecto visitado primero, `?p=`); dominio de ejemplo corregido. Etiquetas QR por tag (`/projects/[id]/tags/labels?subsystem=…|ids=…`, QR con `/tag_360/<uuid>`), desde el filtro de subsistema y la selección masiva de la lista de tags.
- F-19 ✅ triggers `ce_causes_guard_delete` / `ce_effects_guard_delete`: no se borra una causa (ni su matriz) con ITR de prueba, ni un efecto que aparece en uno; el editor avisa antes con el número de ITR.
- F-25 ✅ subir a `project-documents` = control documental (`storage_document_uploader`), `allowed_mime_types` (PDF, PNG, JPEG, DWG, DXF, octet-stream). Cron de huérfanos: no se hizo → Q.
- F-31 ✅ quitado el disparador `interlocks.updated` de workflows; el gemelo ya no promete «tiempo real». El worker de pdf.js ya lo vigila `pdf-worker-parity.test.ts` (G-24).
- F-30 ⏳ textos nuevos de S13 en next-intl (es/en); el editor C&E, twin, explorer y reporte KPI siguen con texto fijo → Q (G-06).
- Verificado en navegador (DEMO): registro con la política IFR/IFA, ficha de PID-A100-001 (vigente por fecha, «Anular», referencias masivas: **agregó 2 referencias reales** en DEMO-CAL-V2/PT-101 e I29C/L-101 a la Rev B vigente), aviso IFR en PID-U100-001, pista de historial al registrar con fecha anterior (sin guardar), VND-0001 (pistas del checklist, «Terminar anticipadamente», «Programar re-prueba» sin pulsar), `/tag_360/p103b` → P-103B, PDF de etiquetas y del ITR (200). Tests: `catalog.test.ts`, `qr.test.ts`, `renderer.test.ts`, `itr.test.ts` (PDF con referencias, empresa y MΩ), `import.test.ts`.

## S14 — Firmantes designados (capacidades) y roles

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| D-03 | Alto | Gobernanza / independencia de firmas — Las co-firmas de Operaciones y HSE no están ligadas a personas designadas | [D-readiness-gestion.md:62](revision-2026-10-19/D-readiness-gestion.md) |
| E-02 | Alto | Modelo de autorización / Segregación de funciones — - (a) La «capacidad» del hold point no identifica a nadie. Cualquier líder del contratista libera un hold de * | [E-arranque-operacion.md:53](revision-2026-10-19/E-arranque-operacion.md) |
| F-14 | Medio | Seguridad funcional / Multi-empresa · Confianza alta — el personal de un vendor, dado de alta con rol inspector o leader: | [F-ingenieria-docs-vendors.md:214](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| I-15 | Medio | Constantes de rol duplicadas en más de 12 sitios, con divergencias | [I-roles-integraciones.md:316](revision-2026-10-19/I-roles-integraciones.md) |
| E-30 | Bajo | Independencia del aprobador — quien reescribió todo el borrador sin crearlo ni enviarlo puede aprobarlo. | [E-arranque-operacion.md:270](revision-2026-10-19/E-arranque-operacion.md) |
| I-25 | Bajo | Las firmas «Cliente» exigen tener usuarios client dentro del tenant | [I-roles-integraciones.md:406](revision-2026-10-19/I-roles-integraciones.md) |

**Estado S14 (2026-10-20; migración `20261109120000_designated_signers_s14.sql` —probada con ROLLBACK, 17 comprobaciones: respaldo por rol antes de designar, solo owner/admin designan, piso de client_rep, designado = solo él, HSE sin designados por respaldo, **traspaso: un owner no designado no firma Operaciones y un inspector designado lo completa**, `my_capacities`, firma Cliente del ITR solo al designado, revocar devuelve el respaldo, E-30, `my_work_counts`— **aplicada en prod** con autorización de Luis). D14 con ajustes de Luis: sin designados rige el rol de antes con aviso; designan solo owner/admin; client_rep = empresa operadora (`companies.kind = owner`) o rol client:**
- D-03 / E-02 / F-14 ✅ `project_capacities` (persona × proyecto × `commissioning|operations|hse|client_rep`, alta y baja con quién/cuándo/motivo, empresa congelada al designar; sin escritura directa) + `has_capacity(proyecto, capacidad, persona)` / `capacity_designated` / `my_capacities`. La usan `sign_system_gate` (con designados ignora `cosign_roles`), `approve_system_gate` (además de `approval_roles`), `release_hold_point`, `witness_startup_event`, `sign_ownership_transfer`, `issue_performance_certificate` / `sign_performance_certificate`, `update_punch_ops_status` y `my_work_counts`. UI: `/projects/[id]/signatories` (menú «Firmantes»), botones de hold, testigo, traspaso, PTC y co-firma por `my_capacities`; aviso «firman solo designados». Atado a empresa: solo para client_rep (piso); empresa como requisito para operations/hse no se hizo (la designación ya es explícita). Pantalla «empresa del firmante en rojo si coincide con Comisionamiento»: no → S24/Q.
- I-25 ✅ firma Cliente del PTC y del ITR por `client_rep` (sin designados, rol client como antes): trigger `itr_assignments_client_guard` y control en `sign_itr_atomic`; el selector de Cliente del tag ofrece solo a los designados.
- I-15 ✅ `src/lib/constants/roles.ts` (niveles, sin imports de servidor) reexportado por `permissions.ts`; 55 archivos dejaron de repetir arrays de rol; `capacities.ts` = SQL `capacity_fallback_roles` con test de paridad que lee el archivo canónico; `hold_release_roles` es alias. Divergencias: import de tags/señales en el menú ahora PRIVILEGED (como la página); `set_gate_weights` SQL ahora solo owner/admin (como la acción); leyenda de roles del cliente corregida. `/admin/companies` deja ver a líderes en solo lectura (coherente con la acción ADMIN, se deja). API keys / webhooks / workflows (RLS `is_org_editor` vs acción PRIVILEGED) → S15.
- E-30 ✅ `procedure_revisions.editors` / `performance_test_revisions.editors` (los llena el guardado del borrador); quien editó no aprueba (RPC y botón).
- Membresía por proyecto (que un cliente vea solo sus proyectos): fuera de alcance por D14 → trimestre.
- Tests: `src/lib/constants/capacities.test.ts` (paridad TS↔SQL, respaldo, piso), `catalog.test.ts` de arranque y desempeño con capacidades (inspector designado libera su hold), `tests/db/capacities.test.ts`. Verificado en navegador con un build de producción local (el `next dev` de otra sesión no recompilaba la ruta nueva): pantalla de firmantes (client_rep solo ofrece a RLA), designar y quitar Operaciones (**queda 1 fila en el historial de DEMO**), Mi trabajo y Control Tower sin errores.

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

**Estado S15 (2026-10-20; migración `20261110120000_members_audit_quotas_s15.sql` —probada con ROLLBACK, 14 comprobaciones: admin no se hace owner ni por REST ni por RPC, auditoría a nombre de otro y notificación directa rechazadas, invitado no ve la org hasta aceptar, suspendido/vencido pierde acceso y reactivado lo recupera, nunca sin owner activo, inspector no registra DEC, conflicto offline en la org del proyecto, cuota de IA— **aplicada en prod** con autorización de Luis; corregí antes un hueco `NULL NOT IN` en las RPC de miembros que el escenario destapó). Decisiones de Luis: invitación pendiente; suspensión + vencimiento; cuota de IA con modelo por tarea:**
- A-02 / I-12 ✅ `org_members` sin políticas de escritura (ni GRANT para authenticated): `add_org_member`, `set_member_role`, `remove_org_member`, `set_member_access`, `respond_org_invitation` (SECURITY DEFINER, owner/admin activos, solo owner toca owners, nadie se cambia a sí mismo, nunca sin owner **activo**; cada cambio en activity_log). `authz-matrix` actualizado: por REST nadie inserta ni actualiza.
- I-21 / A-21 ✅ `org_members.status` (invited · active · suspended), `access_expires_at`, quién invitó/suspendió y motivo. Los 11 helpers de RLS y rol (`get_my_org_ids`, `get_my_project_ids`, `is_org_*`, `is_project_*`, `user_in_project_org`, `org_caller_role`) y las capacidades de S14 exigen membresía activa y no vencida. Cuenta existente → invitación pendiente que acepta en `/access` (aviso en el layout); cuenta nueva → correo de Supabase y membresía activa. Email en minúsculas y búsqueda por RPC `auth_user_id_by_email` (antes 1000 usuarios en memoria); la respuesta ya no revela si el correo tenía cuenta. `/admin/users`: estado, «Suspender» (con motivo) / «Reactivar», «Acceso hasta» al invitar y por miembro. `switchOrg` solo a orgs activas; setup trata invitadas/suspendidas como «ya tiene org».
- A-11 / I-16 ✅ `activity_log` insert solo con `user_id = auth.uid()`; `notifications` sin insert para usuarios (todas las inserciones de la app ya usaban service role) y `CHECK` de `link_url` relativo; la bandeja solo navega a rutas internas. Exportación del audit y retención: no → Q.
- A-13 / I-19 / C-43 ✅ `ai_usage` (org, proyecto, usuario, función, modelo, tokens, caché, coste, stop_reason; escribe solo el service role) y tope diario por org (`settings.ai.daily_budget_usd`, defecto 20 USD/día UTC, RPC `ai_quota_status`). `src/lib/ai/run.ts` (`runAi`): cuota, modelo por tarea (`src/lib/ai/pricing.ts`: Opus 5.5 para matriz ITR e importación C&E; Sonnet 5.5 para reporte diario, traducciones y sugerencias de sistemas), registro y errores uniformes (la matriz ya no explota sin try/catch). Reporte diario con IA solo líder+. API v1: binding `API_RATE_LIMITER` de Cloudflare (600/min por API key; por IP para claves inválidas) en `wrangler.jsonc`. Pantalla para editar el tope: no (se fija en `organizations.settings`) → Q. Fallback del lado servidor por rechazo del modelo: no se activó.
- D-16 / I-27 ✅ `record_decision` (y reemplazar) solo líder+; `recorded_by` ya se mostraba aparte de `decided_by`. UI: «Nueva decisión» y «Reemplazar» solo para líder+.
- A-22 / E-37 ✅ `log_sync_conflict(…, p_project_id)` y `upsert_push_subscription(…, p_org_id)`: org del proyecto / org activa (antes la primera membresía); KPI de subsistemas y snapshots verifican el proyecto contra la org activa. La exportación ya usaba la org activa (S02).
- A-25 ✅ `parsePagination` con `limit ∈ [1, 500]`, `events` sin NaN, `tags` con `count: 'exact'` real, errores de Postgres ocultos tras `request_id` (`apiDbError`: las reglas de negocio P0/22/23/42501 se siguen informando). Zod por endpoint: no → Q.
- A-30 ✅ eliminado `AIAssistantChat.tsx` (llamaba a una ruta inexistente).
- Tests: `src/lib/members/catalog.test.ts`, `src/lib/ai/pricing.test.ts`, `tests/db/members.test.ts`, `authz-matrix` actualizado. Verificado en navegador con build de producción local: `/admin/users` (estado, Suspender, leyenda), cambio de rol real por la RPC admin→líder→admin con su `role_changed` en activity_log (**quedan esas 2 entradas en el log de DEMO**), `/access`, Gestión diaria (decisiones).

## S16 — PSSR por RPC

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| A-04 | Alto | seguridad — La aprobación del PSSR y sus firmas se pueden falsificar desde cualquier rol | [A-seguridad.md:51](revision-2026-10-19/A-seguridad.md) |
| C-12 | Alto | integridad — Se puede aprobar un PSSR en borrador con ítems en «NO»; cualquier miembro puede ponerlo «aprobado» por REST | [C-completions.md:126](revision-2026-10-19/C-completions.md) |
| C-32 | Medio | integridad — Firmas del PSSR débiles | [C-completions.md:254](revision-2026-10-19/C-completions.md) |

**Estado S16 (2026-10-20; migración `20261111120000_pssr_rpc_s16.sql` —probada con ROLLBACK, 11 comprobaciones: aprobar por REST y firmar a nombre de otro rechazados, envío, ítems bloqueados tras enviar, quien envía no firma, faltan firmas, firmante no aprueba, rechazo anula firmas, reenvío y aprobación con RFSU, alta por REST siempre en borrador— **aplicada en prod** con autorización de Luis). Decisiones de Luis: firmas requeridas Operaciones + HSE por defecto (configurable por plantilla); al rechazar se anulan las firmas:**
- A-04 / C-12 ✅ `pssr_reviews` sin UPDATE directo (ni GRANT) y DELETE solo editores en borrador/en curso/rechazado; `pssr_signatures` sin escritura directa. RPC `submit_pssr` (ítems sí/NA, punch con disposición para el arranque —`pssr_punch_blocker`, = `startupDispositionBlockers`—), `sign_pssr`, `unsign_pssr`, `approve_pssr` (emite el RFSU en la misma transacción), `reject_pssr` (motivo), `update_pssr_meta` (notas; fecha límite líder+). Trigger `guard_pssr_review_insert`: el alta siempre nace en borrador con las firmas de la plantilla. `authz-matrix`: huecos A-04 cerrados.
- C-32 ✅ `pssr_templates.required_signatures` (defecto operations+hse) congelado en `pssr_reviews.required_signatures`; `pssr_signatures.capacity` (una por capacidad, una por persona, firma `has_capacity` de S14, no quien envió); aprueba líder+ con capacidad Comisionamiento distinto de quien envió y de los firmantes; ítems bloqueados después de enviar (trigger `guard_pssr_review_item`, que además pasa el PSSR a «en curso»). Rechazo: firmas borradas y guardadas en `activity_log` (`voided_signatures`), motivo visible en el PSSR. UI: «Firmo como» con las capacidades que faltan y el usuario puede firmar; plantilla con casillas de firmas requeridas.
- Numeración del RFSU: serializada con advisory lock por proyecto (el contador atómico por tipo y subsistema es C-33 → S17).
- Verificado en navegador (build de producción local): PSSR-002 muestra «Requiere: Operaciones + HSE…»; guardar un ítem (N/A y de vuelta a SÍ en DEMO) pasa por el trigger. Tests: `authz-matrix` actualizado; baseline de lecturas sin tope baja 1 (`pssr.ts::punches`).

## S17 — Certificados por RPC

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| A-05 | Alto | seguridad — Certificados: firmas a nombre de otros y emisión directa saltándose la elegibilidad | [A-seguridad.md:58](revision-2026-10-19/A-seguridad.md) |
| C-13 | Alto | integridad — Certificados: una persona firma los tres roles, el cliente no puede firmar, se reabre sin volver a evaluar y no se invalida después | [C-completions.md:133](revision-2026-10-19/C-completions.md) |
| I-06 | Alto | Certificados: el client no puede firmar como Cliente y una persona puede firmar las tres capacidades | [I-roles-integraciones.md:231](revision-2026-10-19/I-roles-integraciones.md) |
| B-14 | Medio | Integridad / numeración — Certificados: conteo `LIKE` con prefijo ambiguo y emisión no atómica | [B-datos-rendimiento.md:362](revision-2026-10-19/B-datos-rendimiento.md) |
| C-33 | Medio | bug — Numeración de certificados y del RFSU frágil | [C-completions.md:260](revision-2026-10-19/C-completions.md) |

**Estado S17 (2026-10-20; migración `20261112120000_certificates_rpc_s17.sql` —probada con ROLLBACK, 12 comprobaciones: editar y firmar a nombre de otro por REST rechazados, Cat A nuevo bloquea y cancelarlo desbloquea, una persona no firma dos roles, admin sin `client_rep` no firma Cliente, `client_rep` designado sí y la 3.ª firma cierra el ciclo, revocar anula firmas, reabrir re-evalúa y se rechaza con ITR pendientes, RFPC sin MC rechazado, elegibilidad SQL = TS— **aplicada en prod** con autorización de Luis). Decisiones de Luis: Cliente = `client_rep` (D15), Autoridad = Operaciones, invalidación = bloqueado con motivo que se desbloquea solo, fase anterior obligatoria:**
- A-05 / I-06 ✅ `certificates`, `certificate_signatures` y `certificate_punch_exceptions` sin escritura directa (borrar certificado: solo editores en pendiente/rechazado). RPC `issue_certificate` (líder+ con capacidad Comisionamiento; elegibilidad `certificate_eligibility`/`certificate_blocker` = `eligibility.ts`; excepciones Cat B en la misma transacción), `sign_certificate`, `unsign_certificate` (propia o admin), `revoke_certificate`, `reopen_certificate`, `add/remove_certificate_exception`. `authz-matrix`: hueco A-05 cerrado.
- C-13 ✅ cada rol exige su capacidad (`certificate_role_capacity` = `CERT_ROLE_CAPACITY`: completion → commissioning, client → client_rep, authority → operations; S14 `has_capacity`) y una persona por rol (D6). Reabrir re-evalúa elegibilidad, fase anterior y unicidad. Invalidación: trigger `trg_certificate_base_changed` (punches, ITR, excepciones) recalcula `is_blocked`/`block_reason` con `refresh_certificate_block` y registra `blocked`/`unblocked`; bloqueado no se firma. Al aplicar, MC/OS01-S01-SS03 de DEMO quedó bloqueado (1 ITR sin aprobar). Fase anterior: `certificate_previous_blocker` exige el certificado de la fase previa (con `certificate_name`) emitido y sin bloqueo.
- B-14 / C-33 ✅ número `<tipo>/<subsistema>` con reemisiones `-R<n>` contado por coincidencia exacta (no `LIKE` de prefijo) y serializado con advisory lock por base; un solo emitido por subsistema × fase.
- UI: aviso «Certificado bloqueado» con motivo en el detalle y chip «Bloqueado» en la matriz; botones de firma por capacidad con el motivo cuando no se puede («No estás designado…», «Ya firmaste otro rol»). Notificaciones de firma a privilegiados + designados del proyecto. Verificado en navegador (build de producción local).

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

**Estado S18 — sesión 1 (2026-10-20; sin migración).** Decisiones de Luis: al cerrar sesión con pendientes, «sincronizar o descartar» y luego se vacía el dispositivo; capturas encoladas antes de esta versión (sin autor) quedan retenidas hasta que quien está en sesión confirme «son mías» o las descarte:**
- C-08 / E-01 / G-02 ✅ cada entrada de las tres bandejas guarda `capturedBy` (`currentUserId()` en `src/lib/sync/owner.ts`, lee la sesión local sin red); reglas puras en `src/lib/sync/ownership.ts` (+ tests). `replayQueueOnce` / `replayStartupOnce` envían solo lo del usuario en sesión (`sendableBy`); el line-up solo se fusiona con una captura propia. Lo retenido aparece en el banner `HeldCaptures` del shell: sin autor → «Son mías — enviar» (`claimLegacyEntries`) o «Descartar»; de otra persona → solo «Descartar». Descartar exige red y deja rastro en `sync_conflicts`. El ITR, las ejecuciones y las hojas pintan solo lo propio; el indicador «N pendientes» cuenta solo lo propio.
- A-09 ✅ `UserMenu`: con pendientes abre `SignOutDialog` («Sincronizar y salir» / «Descartar y salir» / «Cancelar»; sin red avisa que lo descartado no queda registrado); al salir `endDeviceSession()` vacía IndexedDB (`clearOfflineData`) y las cachés con datos (`purgeSessionCaches`). `/access` también borra las cachés al salir. Si entra otra persona sin que la anterior haya cerrado sesión, `rememberDeviceUser` borra las páginas en caché de la anterior.
- G-03 ✅ `public/sw.js` 2.1.0: Supabase (`/rest/v1/`, `/auth/v1/`, `supabase.co`) ya no se intercepta ni se cachea; páginas en su propia caché `commup-pages-*` (máx. 40) y solo imágenes del propio origen; al activar se borran las cachés anteriores, incluida `commup-api-*`.
- C-07 ✅ una respuesta rechazada cuenta intentos (`markResponseAttempt`, política `response: 3`) y la cola sigue con las demás; al agotar, se descarta con rastro y aviso (`SYNC_DROPPED_EVENT` kind `response`). Una firma no se intenta mientras su ITR tenga respuestas propias en cola (`signatureWaits`).
- G-20 ✅ el SW se registra solo en producción; en desarrollo se desregistra y se borran sus cachés (adiós a los chunks viejos en `next dev`). Scripts/estilos fuera de `/_next/static` pasan a network-first.
- C-37 ✅ borrado `src/hooks/useSyncConflictResolution.ts` (sin usos) y el bloque de Background Sync del SW (nunca se registraba).
- Verificado en navegador (build de producción local): SW 2.1.0 activo con cachés static/pages/images y sin `commup-api`; banner con 1 captura sin autor + 1 de otra persona; «Cerrar sesión» abre el diálogo con 2 pendientes; «Sincronizar y salir» no envía nada ajeno (0 llamadas al servidor) y muestra «Quedan 2…» sin cerrar sesión. No probado: tablet real con dos usuarios y modo avión.

**Estado S18 — sesión 2 (2026-10-20; migración `20261113120000_offline_capture_time_s18.sql` —probada con ROLLBACK, 6 comprobaciones— **aplicada en prod** con autorización de Luis).** Decisiones de Luis: si otra persona cambió la casilla, decide el usuario; «preparar para trabajar sin red» descarga mis ITR por ejecutar y revisar (hasta 30):
- C-35 / B-16 ✅ `itr_responses.captured_at` + `capture_clamped`; trigger `itr_response_times`: `responded_at` = now() de la BD (versión de la fila; nadie la fija desde el cliente), `responded_by` = auth.uid(), `captured_at` acotada a [creación del ITR, now()]. `upsertResponse` recibe `capturedAt` y `expectedRespondedAt`: el UPDATE lleva la versión en el WHERE (chequeo y escritura atómicos; insert concurrente → 23505 → conflicto) y devuelve `conflict` con el valor actual o `respondedAt`. El replay ya no compara relojes: manda la versión vista (o la que dejó la edición anterior de la misma casilla en ese replay); un conflicto retiene las ediciones posteriores de esa casilla (`src/lib/sync/response-utils.ts` + tests). Bandeja `ResponseConflicts` en el ITR: «Tu valor» frente a «Actual (quién, cuándo)», «Aplicar la mía» (reenvío sin comprobar) o «Descartar la mía» (rastro en sync_conflicts). Las 148 respuestas existentes quedaron con `captured_at = responded_at`.
- E-27 ✅ en ITR (`capture_clamped` marca el recorte). En pasos de procedimiento y line-up (`startup_field_time`) el recorte sigue sin marca → **S25** (correcciones de F6–F7).
- C-09 ✅ al recargar se superponen las respuestas propias encoladas (`overlayQueued`; las que están en conflicto muestran el valor del servidor). «Preparar para trabajar sin red» en Mi trabajo (`PrepareOffline`): el SW descarga hasta 30 ITR propios por ejecutar/revisar con sus chunks a `commup-pages-prep-*` (mensaje `PRECACHE_PAGES`) y cada fila muestra «Disponible sin red» (`OfflineReadyChip`). Sin red, un enlace falla el RSC y Next hace navegación completa → el SW sirve la página guardada.
- C-38 ✅ ya no se guarda la copia del ITR en IndexedDB en cada cambio (nunca se leía); funciones de snapshot quitadas, el store se vacía al salir.
- G-23 ✅ `public/offline.html` estático, bilingüe y precargado (lo que de verdad funciona sin red + pendientes reales de `commup-offline`; antes leía una base que no existía); `/offline` redirige allí. SW 2.2.1.
- Verificado en navegador (build de producción local, **con el servidor apagado** para simular sin red): «Preparar» descargó 7/7 ITR y mostró 7 chips; un ITR preparado nunca abierto se abrió e hidrató sin servidor; marcar una casilla sin red la encoló (dueño, versión null) y tras recargar seguía marcada; marcada como conflicto, la bandeja mostró «Tu valor: Sí · Actual: No (…10:30 GMT-5)» y la casilla el valor del servidor; una página no guardada mostró `offline.html` con «No hay nada pendiente…». Nada se escribió en prod (entradas de prueba borradas). Tests: `response-utils`, compare-and-set en `itr-response-access.test.ts`. No probado: tablet real con modo avión, ni «Aplicar la mía»/«Descartar» contra el servidor.
- Nota: subir `SW_VERSION` borra los ITR preparados (cachés versionadas); hay que volver a «Preparar» tras una versión nueva del SW (no tras un deploy normal de la app).

## S19 — Generación masiva de ITR

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| C-14 | Alto | funcionalidad faltante — No hay generación masiva de ITR: se asignan de a uno, tag por tag | [C-completions.md:140](revision-2026-10-19/C-completions.md) |
| C-30 | Medio | funcionalidad faltante — Las listas de ITR no filtran por subsistema, sistema, área ni responsable | [C-completions.md:242](revision-2026-10-19/C-completions.md) |

**Estado S19 (2026-10-20; migración `20261114120000_itr_bulk_generation_s19.sql` —probada con ROLLBACK, 9 comprobaciones— **aplicada en prod** con autorización de Luis). Decisión de Luis: responsables por disciplina en la vista previa; lo vacío se crea sin asignar:**
- C-14 ✅ `/projects/[id]/itrs/generate` (botón «Generar ITR» en la lista, líder+): fases × alcance (proyecto / sistemas / subsistemas) → vista previa de la BD (`itr_generation_summary`: a crear, ya existen, tags sin tipo de equipo / sin regla aceptada / sin subsistema con muestras, por plantilla y por disciplina con los roles que exigen) → ejecutor / supervisor / cliente por disciplina → lotes de 300 (`generate_itrs`) hasta terminar, con barra de avance. Reglas en SQL (`itr_generation_candidates`, SECURITY INVOKER): filas ACEPTADAS de la matriz, revisión activa más reciente del código, nunca plantillas de origen (loop/C&E); «ya existe» = el tag tiene un ITR con ese código (cualquier revisión) → repetir no duplica. Numeración de S05 (`assign_itr_number`), firmas congeladas de S04 y guardas de asignación (D6, cliente) aplican por correr como el usuario; lock por proyecto; personas activas y distintas por rol; ejecutor nunca rol client. Auditoría `itrs_generated` en activity_log; un aviso `itr_bulk_assigned` por persona y lote (no uno por ITR). Pura en `src/lib/itr/generation.ts` (+ tests).
- C-30 ✅ `itr_list_v` suma `system_id`, `area_id` y `assignee_ids`; la lista del proyecto filtra por área → sistema → subsistema y responsable (Míos / Sin asignar / persona), y la global por responsable; «míos» se resuelve en el servidor (también al exportar). Filtros en la URL (se pueden guardar como enlace).
- Verificado con ROLLBACK (aceptando 2 tipos de la matriz dentro de la transacción): 492 ITR a crear en DEMO, lote de 3 con ejecutor/supervisor asignados, segundo lote idempotente (6 «ya existen»), misma persona en dos roles rechazada, ajeno sin acceso. En navegador (build prod): filtros «Sin asignar» 1/14, «Míos» 10/14, sistema 6/14 (= SQL), subsistemas acotados al sistema; vista previa de DEMO con 0 a crear porque la matriz aceptada solo tiene cables (CBL) y DEMO no tiene cables: **hay que aceptar filas de la matriz** (`/admin/templates/matrix`, 412 propuestas) para generar en DEMO. No se generó nada en prod.
- Pendiente para escala (S20): la vista previa recorre todos los tags del alcance y `assignee_ids` es una subconsulta por fila; medir con 50k tags.

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

**Estado S20 sesión 1 (2026-10-20; migración `20261115120000_readiness_scale_s20.sql` **aplicada en prod** con autorización de Luis). Decisión de Luis: banco = org LOADTEST aparte en prod (300 sistemas · 50k tags · 100k ITR · 10k punch), meta p95 < 1,5 s:**
- Banco reproducible: `scripts/loadtest/seed.sql` / `bench.sql` (con RLS, como el usuario del banco; el archivo completo excede los 100 s de la API → medir una consulta por llamada) / `teardown.sql`.
- B-04 🟡 `compute_project_readiness` 18,2 s → 0,1 s y `compute_project_progress` 0,76 s → 0,06 s: set-based, `SECURITY DEFINER` con una sola verificación de pertenencia; salida idéntica a la anterior (314/314). `compute_project_gates` 9,4 s → 3,0 s (sin RLS por consulta interna); bajar de 1,5 s → sesión 2 (D-07).
- G-07 ✅ `src/lib/supabase/membership.ts`: `getUser` + una consulta de `org_members` por request (`cache()` de React) compartidas por `getActiveMembership`, `listMemberships` y `listInactiveMemberships` (antes 3 + 3 por navegación y por `router.refresh()`); `getMyWorkCounts` evita el doble `my_work_counts` de `/my-work` (layout + página). En una server action `cache()` no memoiza: el cambio de org (cookie) se ve en el render siguiente. `getClaims()` y `Suspense` de contadores no se hicieron.
- B-23 ✅ `"placement": { "mode": "smart" }` en `wrangler.jsonc`; layout del dashboard: proyectos en paralelo con notificaciones, org, membresías, Mi trabajo, perfil e invitaciones (2 tandas en vez de 3 + 2 secuenciales); ejecución de ITR: 7 awaits en serie → 1 tanda + URL firmadas en lote (ya desde S06); un error de referencias documentales no tapa el 404 de un ITR ajeno. El RPC `itr_execution_bundle` no se hizo (medir primero con placement).
- Medido con RLS: Mi trabajo 60 ms, lista de ITR 70–240 ms. Control Tower de LOADTEST ya no excede 8 s, pero los gates siguen en 3 s.

**Estado S20 sesión 2 (2026-10-20; migración `20261116120000_gate_status_materialized_s20.sql` + corrección `20261116130000_drop_composite_fks_s20.sql`, ambas **aplicadas en prod** con autorización de Luis; antes, 25 comprobaciones con ROLLBACK):**
- D-07 ✅ `system_gate_status` (una fila por sistema, la crea un trigger de `systems`): `version` sube con cada cambio que puede mover un gate y el estado guardado vale mientras `computed_version = version`. Triggers por sentencia con tablas de transición en las 22 tablas fuente (`gate_status_dirty_trg`, columnas relevantes como argumento: p. ej. el % de avance de un ITR no ensucia) + triggers de configuración de la org (gates, criterios, tipos de registro, `settings`). `compute_project_gates` (misma firma y salida, ahora VOLATILE) recalcula solo los sucios y sus dependientes en cadena, en una sentencia (versión y cálculo con la misma foto; `SKIP LOCKED` con quien está marcando); en una transacción de solo lectura calcula sin guardar. Red de seguridad: `gate_status_audit` en el cron nocturno corrige y reporta `drift`. El detalle de un sistema, aprobar y firmar siguen en vivo (`compute_system_gates`).
- B-06 ✅ 50 políticas a conjuntos (`get_my_project_ids` / `get_my_editor_project_ids` / nueva `get_my_field_project_ids`), mismas reglas; hijas con `EXISTS` sobre el padre (punch/preservación/PSSR/plan de trabajo/lazos).
- B-17 ✅ **rehecho 2026-10-20** con trigger `guard_same_project` (migración `20261118120000`, en prod): subsistema/sistema/tag/ITR referenciados deben ser del mismo proyecto en `subsystems`, `tags`, `itrs`, `punches` y `certificates`; sin tocar relaciones (embeds intactos); +0,15 ms por fila. Intento anterior ↩️ revertido: las FK compuestas `(…_id, project_id)` suman una segunda relación entre las mismas tablas y PostgREST deja de resolver embeds como `subsystems(code)` (PGRST201). Se quitaron a los minutos (0 respuestas 300 en los logs de la API); quedan las UNIQUE `(id, project_id)`. Pendiente: reemplazar la FK simple por la compuesta (una sola relación, `ON DELETE SET NULL (col)` donde aplique) o validar por trigger.
- B-21 ✅ `notify_preservation_overdue` / `notify_constraints_overdue` / `notify_pssr_reviews_overdue` (solo service_role, set-based, idempotentes; índice de deduplicación de preservación). Las rutas solo llaman a la RPC. Cambios: preservación deduplica por día del proyecto (antes día UTC); PSSR avisa solo a miembros activos. Snapshot de a 4 proyectos en paralelo, auditoría de gates por proyecto y HTTP 500 si alguno falla.
- Re-bench LOADTEST con RLS (5 corridas, mediana / máx): gates 2 / 13 ms (con 1 sistema sucio 14 ms; frío tras cambiar la configuración de la org 3,2 s una vez), readiness 93 / 2 963 ms (el máx es la primera corrida con caché fría), avance 51 / 65 ms, Mi trabajo 193 / 498 ms (el banco medía 0 ms: con `count(*)` Postgres no evaluaba la función; corregido con `length()`), lista ITR 69 ms (míos 211), rollup de subsistemas 81 ms, vista previa de S19 sobre 50k tags 344 / 593 ms, `punch_attachments` y `work_plan_items` < 1 ms. **Meta p95 < 1,5 s cumplida** salvo el primer cálculo en frío.
- Pendiente: B-13 si el badge pesa con más usuarios, `getClaims()` (G-07) y el RPC `itr_execution_bundle` (B-23) si hace falta tras medir Smart Placement.

## S21 — Bus de eventos (outbox)

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| B-03 | Crítico | Triggers / escalabilidad — Fan-out de `domain_events`: evento JSON completo + 3 HTTP `pg_net` por fila (dos duplicados) | [B-datos-rendimiento.md:92](revision-2026-10-19/B-datos-rendimiento.md) |
| B-11 | Alto | Notificaciones / crons — `push-dispatch` con ventana fija de 5 min sin cursor persistido y sin índice usable | [B-datos-rendimiento.md:305](revision-2026-10-19/B-datos-rendimiento.md) |
| I-08 | Alto | Webhooks: nombres de evento incompatibles, doble despacho y reintentos sin scheduler | [I-roles-integraciones.md:251](revision-2026-10-19/I-roles-integraciones.md) |
| I-17 | Medio | Volumen de `domain_events`: cada autosave del ITR emite un evento con la fila completa y 3 llamadas pg_net | [I-roles-integraciones.md:339](revision-2026-10-19/I-roles-integraciones.md) |
| B-30 | Bajo | Retención — `domain_events`, `activity_log`, `notifications`, `webhook_deliveries` y `net._http_response` crecen sin límite | [B-datos-rendimiento.md:605](revision-2026-10-19/B-datos-rendimiento.md) |
| F-26 | Bajo | Workers (subrequests) · Confianza media | [F-ingenieria-docs-vendors.md:348](revision-2026-10-19/F-ingenieria-docs-vendors.md) |

**Estado S21 (2026-10-20; migración `20261117120000_event_outbox_s21.sql` —19 comprobaciones con ROLLBACK— **aplicada en prod** y Edge Functions `webhook-dispatcher` / `evaluate-workflow` desplegadas, con autorización de Luis):**
- B-03 ✅ Sin los 3 triggers HTTP de `domain_events` (dos llamaban al mismo dispatcher). `domain_events.dispatched_at` + índice parcial = outbox; `outbox_dispatch()` (pg_cron `domain-events-outbox`, cada minuto, SKIP LOCKED) crea entregas, encola push y llama al evaluador solo por eventos con regla activa y al dispatcher solo si hay entregas vencidas: sin suscriptores ni reglas, 0 HTTP. Importaciones masivas (tags y señales) con `createAdminClient({ bulk })` → cabecera `x-commup-bulk`, que `emit_domain_event` respeta solo con service role, y un `import.completed` de resumen (`emitImportSummary`). LOADTEST: 300 ITR cambiando de estado 1 656 ms → 277–388 ms.
- I-17 ✅ UPDATE guarda `changed` + `old` solo de lo cambiado (+ `new`, que usan las reglas); un cambio que solo toca `updated_at` / `progress_pct` (autosave) no emite.
- I-08 ✅ Catálogo v1 (`src/lib/constants/domain-events.ts`, `schema_version = 1`): entidades en singular (los 9 825 eventos y las reglas existentes se renombraron) + eventos de negocio por transición (`itr.completed/approved/rejected/returned/reopened`, `punch.assigned/closed/cancelled/reopened`, `certificate.issued/rejected/revoked`, `gate.approved/revoked`, `transfer.completed`); test de paridad con las funciones SQL. `UNIQUE (subscription_id, domain_event_id)`. Dispatcher: un solo modo (vaciar cola) con `claim_webhook_deliveries` (reserva 5 min), firma `t=<unix>,v1=<hmac("<unix>.<body>")>`, `X-CommUp-Event-Id` y `schema_version` en el cuerpo. Reintentos versionados (el job `webhook-dispatcher-retry` fuera del repo se reemplazó). Selectores de webhooks y workflows y la auditoría con el catálogo v1; `/api/v1/events` devuelve `schema_version`.
- B-11 ✅ Push con cola (`push_outbox`, tipos = `push_event_types()` = `PUSH_EVENT_TYPES`) que `claim_push_events` vacía al reclamar: ni ventana fija ni duplicados; suscripciones en una consulta por lote; URL de ITR correcta. (S22 reemplazó esta cola por `notification_push_outbox`: el push sale de `notifications`.)
- B-30 ✅ `cleanup_event_retention()` (pg_cron `event-retention`, 03:30 UTC): eventos 365 días, entregas terminadas 90, notificaciones leídas 180, push en cola 7, respuestas de pg_net 2. `activity_log` se conserva. Particionar `domain_events` no hizo falta con el volumen nuevo.
- F-26 ✅ URL firmadas de los P&ID en una llamada (`createSignedUrls`).
- Cambios visibles: webhooks y workflows llegan hasta 1 min después (antes, en el acto); nombres de evento y firma nuevos (0 suscripciones y 0 reglas en prod al aplicar).

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

**Estado S22 (2026-10-20; migración `20261119120000_notifications_queues_s22.sql` —15 comprobaciones con ROLLBACK, repetidas sobre prod con el trigger de B-17— **aplicada en prod** con autorización de Luis. Se renumeró: otra sesión ya había usado 20261118120000 para B-17):**
- D-04 / H-02 ✅ Colas `gates_to_approve`, `gates_to_cosign`, `gates_regressed`, `registers_to_authorize`, `registers_to_verify`, `daily_reports_to_issue`, `tq_answered` desde una sola función (`my_readiness_items`, invoker) que usan el contador (`my_work_counts`) y la lista de `/my-work`; reglas = las de las RPC (approval_roles + designado de Comisionamiento; co-firma por designado o cosign_roles; autoriza líder+ distinto de quien propuso; verifica no cliente distinto de quien retiró; emite reporte líder+). Avisos (`notify_obligation_trg`, por fila) al crearse una obligación para otra persona: co-firma de gate, traspaso, PTC, hold point, hito por atestiguar, TQ respondida, acción asignada / hecha, registro por autorizar / verificar, punch Cat A (líderes+). Transiciones del estado guardado de S20 (`gate_status_transition_trg`): gate listo → quienes aprueban; en regresión o con condición nueva → quienes aprueban + quien aprobó; más los eventos `gate.ready` / `gate.regressed`. `notify_users` nunca avisa a quien causó el cambio y deduplica 24 h por clave. pg_cron `gate-status-refresh` (cada minuto) recalcula los sistemas sucios. Destinatarios: `capacity_holders`, `project_role_members`, `gate_approvers`, `gate_cosigners`.
- I-09 ✅ Push desde `notifications`: trigger por sentencia encola en `notification_push_outbox` solo a quien tiene suscripción activa; `claim_push_notifications` reclama (y no envía lo ya leído); temas = categorías (`src/lib/notifications/topics.ts`: asignaciones, firmas, campo, readiness, vencidos, punch Cat A) con test que cruza los tipos que crea la BD. CHECK de temas actualizado (0 suscripciones en prod). Se quitaron `push_outbox`, `push_event_types` y `claim_push_events` de S21.
- D-23 ✅ Badge solo personal (sin relevos de toda la org; con co-firmas de gate y TQ respondidas); la página usa `badgeTotal`; chips agrupados Ejecutar / Verificar / Firmar / Decidir (`chipGroups`); holds con el mismo filtro de estado que la RPC.
- D-36 ✅ Bandeja traducida (`Inbox` en es/en) con todos los tipos y hora con `useLocalTime`; fechas del detalle de gates con la zona del proyecto (`formatInZone`) sin `suppressHydrationWarning`.
- G-22 ✅ SW: solo «Abrir» / «Cerrar» con los textos del payload; sin la rama a `/itrs/<id>/capture`. I-28 ✅ temas por defecto que existen y URL del aviso = `link_url`.
- Medido: `my_work_counts` en LOADTEST 206–346 ms (antes 193); refresco de sistemas sucios 193 ms en DEMO.
- **Pendiente (D16):** resumen diario por correo — requiere elegir proveedor (Resend / Postmark / SendGrid) y su API key; preferencia por usuario.

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

**Estado S23 (2026-10-20; migración `20261120120000_readiness_v2_s23.sql` —12 comprobaciones con ROLLBACK— **aplicada en prod** con autorización de Luis):**
- D-01 ✅ Control Tower sin `compute_project_readiness`: filas desde `compute_project_gates`; cada gate guardado trae `blocker` (primer criterio que falla, sin listas) y la fila muestra el siguiente gate (`nextGate`: regresión primero) con su bloqueo y cantidad, o el proveedor que lo frena; compromiso y condiciones abiertas. Punch A/B por sistema con `system_open_punches`. Lógica pura en `src/lib/readiness/matrix.ts`, datos en `matrix-server.ts`.
- D-18 ✅ Dos números: avance físico ponderado y readiness = gates aprobados vigentes / total (`readinessSummary` = `compute_project_progress.gates_approved/gates_total`, que ahora cuenta todos los gates activos desde el estado guardado; antes excluía los gates sin fase). Fuera el «ITR promedio» y la columna Cat C. Verificado DEMO: 0/70 en ambas.
- D-19 ✅ Filtros en la URL (área, estado del siguiente gate, compromiso ≤ 7/30/90 d, búsqueda, «cambió en 24 h» por eventos `gate.*`), orden por riesgo / código / compromiso, Excel con los mismos filtros (`/control-tower/export`). Detalle: gates aprobados colapsados, abierto el siguiente.
- H-12 ✅ (mínimo) El sidebar abre Control Tower con el proyecto actual o el último; Control Tower recuerda el proyecto (`RememberProject`). Mover a `/projects/[id]/readiness` queda para N1–N3.
- D-12 ✅ Al quedar «aprobado con condiciones» (con todas sus firmas) cada condición es una acción ACC de origen `gate` (dueño = quien aprobó; `gate_conditions_create_actions`, idempotente, también para las vigentes) y la matriz muestra las abiertas. Exigirlas cerradas para el gate siguiente: no se hizo.
- D-25 ✅ Aprobar y revocar con diálogo (`Modal`): criterios, condiciones, firmas pendientes y lo que se habilita; al revocar, gates posteriores que quedan en regresión y sistemas que vuelven a bloquearse (`src/lib/readiness/impact.ts`). Sin `window.prompt`.
- D-26 ✅ Look-ahead con el bloqueo de cada gate (estado guardado, sin recalcular) y ventana de 1 día.
- D-22 ✅ `transition_register_item` exige los campos de cada estado (`register_required_fields` = `REGISTER_CATALOG`, test de paridad) y no deja cambiar el resultado de un test pack ya registrado; pg_cron `registers-overdue` (12:00 UTC) avisa bypass que excedieron su duración y temporales vencidos (`register_overdue`, dedupe 24 h).
- Corregido al verificar: `fetchAllRows` sobre `system_gate_plans` (sin columna `id`) paginaba por `id`; ahora por `system_id` + `gate_id`.

## S24 — Paquete de handover v2

| ID | Sev. | Hallazgo | Anexo |
|---|---|---|---|
| E-05 | Alto | Funcional / Handover — §12.23 promete que «al completarse el traspaso a Operaciones se genera el paquete de handover». El paquete que | [E-arranque-operacion.md:77](revision-2026-10-19/E-arranque-operacion.md) |
| E-22 | Medio | Registros imprimibles y dossier — - Sin respaldo en papel para cuando falla la tablet o no hay red (regla habitual en arranque). | [E-arranque-operacion.md:209](revision-2026-10-19/E-arranque-operacion.md) |
| F-22 | Medio | Handover / Dossier · Confianza alta — el entregable de turnover queda muy por debajo de lo que ya existe en la BD. El cliente tiene que armar el dos | [F-ingenieria-docs-vendors.md:306](revision-2026-10-19/F-ingenieria-docs-vendors.md) |
| E-31 | Bajo | Firma del handover verificable solo por CommUp — el HMAC es simétrico: la operadora no puede verificar la integridad del paquete por su cuenta y no hay endpoin | [E-arranque-operacion.md:277](revision-2026-10-19/E-arranque-operacion.md) |

**Estado S24a (2026-10-21; migración `20261121120000_handover_v2_s24.sql` —probada con ROLLBACK, 0,48 s— **aplicada en prod** con autorización de Luis; secreto `HANDOVER_ED25519_PRIVATE_KEY` cargado en Cloudflare):**
- E-05 ✅ `generate_handover_package` esquema 3.0 (solo service_role): por sistema, etapa de propiedad, gates (estado del motor + aprobación vigente con multifirma y empresa congelada + declaraciones), PSSR con firmas, procedimientos (revisión vigente con hash y verificación en campo + última ejecución completada con pasos, valores reales y holds), line-ups verificados, bitácora de arranque con testigo y parámetros, traspasos con checklist, excepciones y las dos firmas, competencias, repuestos, pruebas de desempeño con intentos y PTC (3 firmas), documentos vigentes y vendors (FAT/SAT, reporte final, recomendaciones con MOC). El traspaso a Operaciones genera JSON + PDF + ZIP.
- F-22 ✅ ZIP con los PDF reales como anexos (`src/lib/handover/bundle.ts`): procedimientos, reportes de desempeño/PTC, PSSR, certificados, ITR aprobados/completados (tope 150) y los archivos de las revisiones vigentes de los documentos (tope 40 MB); lo que no entra va en `omitted` con el motivo. Los cargadores de las 5 rutas PDF pasaron a `src/lib/pdf/load.ts` (mismo PDF en pantalla y en el ZIP). Índice PDF v3 bilingüe sobre el renderer compartido. Un dossier compilado en un solo PDF (`copyPages`) no se hizo: el ZIP ya lleva las hojas reales.
- E-31 ✅ `manifest.json` (sha256 de handover.json y de cada anexo) firmado con Ed25519 → `manifest.sig`; clave pública en `/api/v1/handover/public-key` (JSON o `?format=pem`), `key_id` para rotar. `/verify/<hash>` (hash = sha256 de handover.json, impreso en el índice) muestra emisor, proyecto, sistemas y archivos, y comprueba en el navegador el sha256 de cualquier archivo y la firma del manifiesto. `verify_handover_package` solo service_role (A-19 extendido en `authz-matrix`). Verificado en dev con A100-S02: OpenSSL «Signature Verified Successfully» y los 6 sha256 coinciden; en el navegador, manifiesto alterado → «firma NO válida».
- E-22 ✅ (S24b, 2026-10-21, sin migración) `src/lib/pdf/startup-records.ts`: PDF de la ejecución (pasos con responsable, esperado, valor real, quién/cuándo, hold y quién lo liberó, comentario, criterio de parada; seguridad y criterios de la revisión; parada/aborto con motivo; eventos que citan la ejecución), de la hoja de line-up (requerida/encontrada —en rojo si difiere—, críticas marcadas, quién puso y quién verificó, hash) y ficha del evento (testigo, parámetros congelados con calidad y desfase, anulación). Lo pendiente sale en celdas vacías con bordes y recuadro de firmas en papel: sirve de checklist de campo si falla la tablet. Rutas `startup/{runs,lineups,events}/[id]/pdf` y botón PDF en cada pantalla; en el ZIP: última ejecución completada de cada procedimiento, line-ups verificados y eventos no anulados. Fila de tabla multilínea con encabezado repetido (`tableRowWrapped`) en el renderer compartido. La parada que se pierde al reanudar (solo queda la última, E-10) sigue para S25. Sin datos F6 reales en prod: verificado con pruebas de render y las consultas de los cargadores contra PostgREST.

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
