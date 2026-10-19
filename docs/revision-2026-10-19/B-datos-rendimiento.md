# Revisión B — Modelo de datos, SQL y rendimiento a escala industrial

Revisor: área B (datos / SQL / rendimiento). Alcance: `supabase/migrations/*` (baseline + 52 migraciones), `src/**` (consultas PostgREST/RPC), crons (`src/app/api/cron/*`, `.github/workflows/cron.yml`).
Método: revisión estática, solo lectura. No se ejecutó nada contra la BD. Cada hallazgo se verificó leyendo el código citado. Las estimaciones de coste son razonadas, no medidas: no hay EXPLAIN y la confianza lo refleja.
Supuesto base: PostgREST de Supabase con `max_rows = 1000` por defecto. CLAUDE.md lo confirma y `supabase/` no tiene `config.toml` que lo cambie. El tope aplica también a los RPC que devuelven conjuntos (`RETURNS TABLE` / `SETOF`).

---

## 1. Resumen

El modelo relacional es sólido y las migraciones nuevas (F1–F8) son de calidad alta. Tienen CHECKs exhaustivos, `UNIQUE (project_id, number)`, índices parciales bien pensados, escritura solo por RPC `SECURITY DEFINER` e inmutabilidad real. El Sprint E (2026-09-03) arregló bien las políticas RLS de las tablas grandes (`tags`, `itrs`, `punches`…) y paginó las listas principales.

**El producto todavía no está listo para 50k tags / 100k+ ITRs.** Hay cuatro motivos, todos verificados en el código:

1. **Truncamiento silencioso a 1.000 filas en sitios que alimentan decisiones.**
   - El snapshot nocturno de KPIs (curvas S, chips delta) cuenta ITRs y punches trayendo filas sin paginar.
   - La pantalla de certificados calcula la elegibilidad por subsistema con ITRs truncados. Puede mostrar un subsistema como apto («verde») cuando no lo es.
   - «Mi trabajo», widgets del dashboard, señales, visor P&ID, explorer, exportación admin, preservación y certificados globales.
2. **El motor de gates (Control Tower) calcula todo en vivo, sistema por sistema y gate por gate.**
   - Recorre `subsystems.system_id`, `certificates.subsystem_id` y `punches.tag_id`, que no tienen índice.
   - Corre bajo RLS en cada sub-consulta y se ejecuta 2–3 veces por carga de página.
   - A escala industrial superará el `statement_timeout` (8 s para `authenticated`). La página captura el error con `console.error` y muestra la matriz vacía.
3. **Amplificación de escrituras por `domain_events`.**
   - Cada INSERT/UPDATE/DELETE en 10 tablas núcleo inserta un evento con el JSON completo old/new.
   - Ese INSERT dispara **tres** llamadas HTTP `pg_net`; dos de ellas son duplicadas al mismo dispatcher de webhooks.
   - Una importación de 50k tags genera ~150k peticiones HTTP y eventos duplicados.
4. **Índices ausentes en FKs y filtros calientes de las tablas del baseline**, incluido `org_members(user_id)`, que usan todos los helpers RLS. A eso se suman políticas RLS por fila (`is_project_member`) que el Sprint E no migró, en tablas hijas (`punch_attachments`, `work_plan_items`, `preservation_attachments`, `loop_tags`, `pssr_*`, `work_plans`, `cables`, `pid_*`).

El resto son problemas de integridad puntuales y de higiene. Integridad: numeración de certificados con `LIKE`, emisión no atómica, LWW offline con relojes distintos, referencias cruzadas entre proyectos sin FK compuesta, resolución ambigua de señales IIoT. Higiene: funciones críticas cuyo cuerpo efectivo solo existe aplicando parches por ancla.

**Conteo:** 4 Críticos · 9 Altos · 13 Medios · 4 Bajos (30 hallazgos).

---

## 2. Fortalezas

- **RLS set-based** en las tablas grandes (`20260903200000_rls_set_based_policies.sql`). `project_id IN (SELECT get_my_project_ids())` se resuelve como hashed subplan, una vez por consulta. Las tablas nuevas F1–F8 adoptaron el patrón de forma consistente, con `TO authenticated`.
- **Agregados en SQL** (`project_itr_phase_counts`, `project_punch_counts`, `subsystem_rollup` agrupado, `itr_status_counts`, `punch_summary_counts`, `tag_discipline_counts`). Las listas de ITR, tags y punches usan vistas `security_invoker` paginadas con `.range()`, orden estable `ORDER BY …, id` y búsqueda trigram (`pg_trgm`) con índices GIN.
- **Diseño de las tablas nuevas** (daily, startup, performance, documents, vendors):
  - CHECKs de dominio en todos los estados.
  - `UNIQUE (project_id, number)` y numeración con `pg_advisory_xact_lock` + `MAX(seq)+1` dentro de la transacción del RPC.
  - Índices parciales por cola (`… WHERE status = 'pending_witness'`, `… WHERE status IN ('open','in_progress')`).
  - Únicos parciales que expresan invariantes de negocio (`system_gate_approvals_active_uq`, `ownership_transfers_pending_uq`, `performance_runs_one_live_uq`, `startup_events_milestone_uq`).
- **Integridad del ITR en la BD** (`20260909180000_itr_atomic_integrity.sql`):
  - Firma atómica (`sign_itr_atomic`) con evaluación del contenido en SQL.
  - Identidad del ITR inmutable y plantillas congeladas una vez asignadas.
  - Reapertura auditada con copia de respuestas y adjuntos en `activity_log`.
  - Evidencia de storage inmutable con políticas RESTRICTIVE.
- **Snapshots de gestión** (`take_mgmt_snapshot`) calculados en SQL con `ON CONFLICT … DO UPDATE` sobre `UNIQUE (project_id, snapshot_date)`: idempotentes.
- **Parches por ancla con salvaguarda**: abortan si el ancla no aparece exactamente una vez. Evitan reemplazos silenciosos.
- **`fetchAllRows`** existe con tope duro para reportes. Los tipos generados (`supabase.generated.ts`) están al día con las tablas F8.

---

## 3. Hallazgos (ordenados por severidad)

### B-01 · Crítico · Corrección de datos (truncamiento) — Snapshots KPI calculados sobre ≤1.000 filas
- **Ubicación:**
  - `src/app/api/cron/snapshot/route.ts:55-60`
  - `src/app/actions/kpi-snapshots.ts:124-130`
- **Evidencia:**
  ```ts
  supabase.from('itrs').select('id, status, phase_id').eq('project_id', pid),
  supabase.from('punches').select('id, category, status').eq('project_id', pid),
  const totalItrs = itrs?.length ?? 0
  ```
- **Impacto:**
  - En cualquier proyecto con más de 1.000 ITRs, punches o planes de preservación, `kpi_snapshots` guarda totales capados a 1.000 y un `completion_pct` calculado sobre una muestra arbitraria (sin ORDER BY).
  - También salen mal los snapshots por fase.
  - Alimentan las curvas S, los chips delta del dashboard (`KpiSummaryWidget`) y el historial de KPIs. **El historial persistido es incorrecto desde que un proyecto pasa de 1.000 ITRs** y no se puede reconstruir.
  - El cron y la acción manual duplican la misma lógica.
- **Recomendación:**
  - Reemplazar ambos por una función SQL `take_kpi_snapshot(p_project_id, p_date)` (service_role, llamada desde el cron y desde `takeProjectSnapshot`). Debe agregar con `count(*) FILTER (…)` igual que `project_itr_phase_counts` y hacer `INSERT … ON CONFLICT` sobre una clave única (ver B-25).
  - Mientras tanto, como parche mínimo, usar `fetchItrPhaseCounts` / `fetchPunchCounts`, que ya existen en `src/lib/list/kpi-query.ts`.
  - Marcar como sospechosos los snapshots históricos de proyectos grandes.
- **Esfuerzo:** S · **Confianza:** alta

### B-02 · Crítico · Corrección + CPU — Página de certificados del proyecto: elegibilidad calculada con ITRs/punches truncados
- **Ubicación:** `src/app/(dashboard)/projects/[id]/certificates/page.tsx:44-53` y `:98-100`
- **Evidencia:**
  ```ts
  supabase.from('itrs').select('id, status, subsystem_id, phase_id').eq('project_id', projectId),
  const ssItrs = (itrs ?? []).filter(i => i.subsystem_id === ss.id && i.phase_id === phase.id)
  ```
- **Impacto:**
  - Con más de 1.000 ITRs, la matriz subsistema × fase se evalúa sobre un subconjunto arbitrario. Un subsistema puede verse «verde / elegible» porque sus ITRs pendientes no entraron en las primeras 1.000 filas, o «rojo — sin ITRs» siendo correcto.
  - La emisión real (`computeEligibility` en la acción) re-consulta acotado por subsistema, así que no se emite mal. Pero la pantalla guía la decisión y miente.
  - Además: `subsystems` sin límite (más de 1.000 subsistemas se truncan) y un bucle O(subsistemas × fases × ITRs) en el Worker. Con 2.000 × 4 × 100k son ~8·10⁸ comparaciones: riesgo de exceder el CPU del Worker.
- **Recomendación:** RPC agregado `subsystem_phase_eligibility(p_project_id)` con conteos `itr_total` / `itr_approved` / `open_a` / `open_b` por `(subsystem_id, phase_id)`, en un solo `GROUP BY`. La lista de Cat B abiertos se carga solo bajo demanda al abrir el modal de emisión. Paginar o virtualizar por sistema.
- **Esfuerzo:** M · **Confianza:** alta

### B-03 · Crítico · Triggers / escalabilidad — Fan-out de `domain_events`: evento JSON completo + 3 HTTP `pg_net` por fila (dos duplicados)
- **Ubicación:** `supabase/migrations/00000000000000_baseline.sql`
  - `:790` (`emit_domain_event`)
  - `:4943`, `:4964`, `:4971` (triggers sobre `domain_events`)
  - `:4978-5034` (triggers en `certificates`, `itrs`, `punches`, `tags`, `signals`, `subsystems`, `systems`, `loops`, `interlocks`)
- **Evidencia:**
  ```sql
  CREATE TRIGGER on_domain_event_inserted AFTER INSERT ON public.domain_events … notify_webhook_dispatcher();
  CREATE TRIGGER trg_dispatch_webhook_event AFTER INSERT ON public.domain_events … dispatch_webhook_event();
  -- ambos: net.http_post(url := <vault webhook_dispatcher_url>, body := {event_id})
  ```
- **Impacto:**
  - Cada fila escrita (incluido cada autosave de ITR, que actualiza `itrs.progress_pct/status`) inserta un evento con `to_jsonb(OLD)` + `to_jsonb(NEW)`.
  - Cada evento lanza 3 `net.http_post` con 6 descifrados de Vault.
  - **Los dos triggers de webhook llaman a la misma URL**: el dispatcher recibe cada evento dos veces. O hay entregas duplicadas a clientes, o depende de que la Edge Function deduplique (no verificado).
  - Una importación Excel de 50k tags genera 50k eventos + ~150k peticiones encoladas en `net.http_request_queue` e invocaciones de Edge Functions. Satura `pg_net`, alarga la transacción e infla `domain_events` (sin retención, ver B-30).
  - Ninguna migración posterior elimina los triggers (`grep DROP TRIGGER` vacío).
- **Recomendación:**
  - (1) `DROP TRIGGER on_domain_event_inserted ON public.domain_events;` (duplicado de `trg_dispatch_webhook_event`).
  - (2) Condicionar los `http_post` a que exista algo que consumir: `IF EXISTS (SELECT 1 FROM webhook_subscriptions WHERE org_id = NEW.org_id AND enabled)`; idem `workflow_rules … enabled`.
  - (3) Mejor aún, patrón outbox: el dispatcher consume `domain_events` por lotes con un cursor persistido (columna `dispatched_at` + índice parcial `WHERE dispatched_at IS NULL`) y se elimina el HTTP por fila.
  - (4) En operaciones masivas, `SET LOCAL commup.bulk = 'on'` y que `emit_domain_event` lo respete, emitiendo un único evento de resumen.
  - (5) Guardar solo las claves cambiadas en UPDATE, no old/new completos.
- **Esfuerzo:** M · **Confianza:** alta (triggers); media (efecto de duplicado en clientes, depende de la Edge Function)

### B-04 · Crítico · Funciones pesadas / RLS — Motor de gates de Control Tower O(sistemas × gates × criterios) con búsquedas sin índice, bajo RLS y calculado 2–3 veces por carga
- **Ubicación:**
  - `src/app/(dashboard)/control-tower/page.tsx:110-115` (`compute_project_readiness` + `compute_project_gates` + `compute_project_progress` en cada request)
  - Cuerpo vigente de `compute_system_gates`: `20261017210000_startup_procedures_lineups.sql:829-1121` más los parches de `20261019150000:637`, `20261021120000:606` y `20261021130000`
  - `compute_project_gates` (`20261012200000_gate_cosignatures.sql:259`)
  - `system_phase_level` (`20261012180000_readiness_gates_engine.sql:45`)
- **Evidencia (`…lineups.sql:1004, 1010, 1041`):**
  ```sql
  WHERE ce.subsystem_id = ss.id AND ce.phase_id = v_phase AND ce.status = 'issued'   -- certificates.subsystem_id sin índice, 2× por subsistema
  FROM subsystems ss WHERE ss.system_id = p_system_id;                                -- subsystems.system_id sin índice
  WHERE p.tag_id = crit.id AND p.category IN ('A','B')                                -- punches.tag_id sin índice, por cada tag crítico
  ```
- **Impacto:**
  - `compute_project_gates` hace un bucle plpgsql por sistema y, dentro, por gate y por criterio, con unas 8–12 consultas por gate (dependencias, registros, restricciones, line-up, documentos, desempeño, aprobación, criterios).
  - Cada consulta re-evalúa `get_my_project_ids()`: la función es `SECURITY INVOKER` y la RLS aplica dentro. Esa función hace seq scan de `org_members` (ver B-05).
  - `system_phase_level` hace seq scan de `subsystems` por cada (sistema, fase). Control Tower la invoca tanto vía `compute_project_readiness` como vía `compute_project_gates`.
  - El criterio `certificates_issued` hace dos `NOT EXISTS` sin índice por subsistema. `critical_tags_ready` lanza una sub-consulta por tag crítico sobre `punches` sin índice por `tag_id`.
  - `documents_current` (parche F8) se recalcula idéntico en cada gate, aunque no depende de `g`. `lineup_is_stale()` se evalúa en el `ORDER BY`.
  - Orden de magnitud para 500 sistemas × 5 gates: decenas de miles de consultas internas y millones de filas visitadas por carga. Probablemente supera los 8 s de `statement_timeout` de `authenticated`.
  - La página solo hace `console.error` y renderiza la matriz vacía. `daily_report_data` y `vendor_mobilization_status` también llaman al motor.
- **Recomendación:**
  - (1) Índices de B-05: `subsystems(system_id)`, `certificates(subsystem_id, phase_id, status)`, `punches(tag_id)`, `pssr_reviews(system_id, created_at DESC)`.
  - (2) Hacer `compute_project_gates` / `compute_project_readiness` `SECURITY DEFINER` con un único `is_project_member(p_project_id)` al inicio, como ya hace `daily_report_data`: elimina el coste RLS de cada sub-consulta.
  - (3) Reescritura set-based a nivel proyecto: CTEs que calculen una sola vez los conteos por (subsystem, phase) de ITRs, punches y certificados, tags críticos, aprobaciones, restricciones y dependencias; el bucle por gate opera sobre esos agregados. Sacar `documents_current` y `performance_accepted` del bucle de gates (son por sistema).
  - (4) Control Tower: derivar la readiness por fase del mismo resultado en vez de llamar a `compute_project_readiness` por separado.
  - (5) A medio plazo, caché materializada `system_gate_status(system_id, gate_id, status, criteria, computed_at)` recalculada por un worker con cola de sistemas «sucios» (los triggers marcan el sistema afectado). Control Tower lee la caché y el detalle `/control-tower/[systemId]` sigue en vivo.
  - (6) Mostrar el error del RPC en la UI en vez de una matriz vacía.
- **Esfuerzo:** L (reescritura) / S (índices + SECURITY DEFINER) · **Confianza:** media (coste estimado, no medido; patrón y faltas de índice: alta)

### B-05 · Alto · Índices — FKs y filtros calientes del baseline sin índice
- **Ubicación:** `00000000000000_baseline.sql:4488-4936`. Es la lista completa de índices del baseline; ninguna migración posterior añade los siguientes.
- **Evidencia:**
  - No existe índice con columna líder `org_members.user_id`. Solo `UNIQUE (org_id, user_id)`.
  - Tampoco en `subsystems.system_id`, `systems.area_id`, `punches.tag_id / itr_id / assigned_to`, `itr_assignments.user_id`, `itr_attachments.itr_id`, `punch_attachments.punch_id`, `punch_comments.punch_id`, `certificates.subsystem_id / system_id`, `itrs.template_id`, `itr_template_items.template_id`, `itr_template_sections.template_id`, `work_plan_items.work_plan_id / itr_id / assigned_to`, `work_plans.project_id`, `pssr_reviews.system_id`, `pssr_review_items.review_id`, `preservation_records.tag_id`, `preservation_plans.project_id`, `preservation_attachments.record_id`, `loop_tags.tag_id`, `cables.from_tag_id / to_tag_id`.
- **Impacto:**
  - `get_my_project_ids()`, `get_my_org_ids()`, `is_project_member()` y `profiles_select_org_members` filtran `org_members` por `user_id`: seq scan en **cada** consulta RLS de toda la app.
  - `my_work_counts` (en el layout, cada navegación) y los widgets filtran `itr_assignments.user_id` y `punches.assigned_to`.
  - La página de ejecución de ITR y cada autosave leen `itr_attachments` e `itr_template_items` por ITR o plantilla: seq scans en tablas de millones de filas.
  - Comprobaciones FK al borrar: borrar un ITR revisa `punches.itr_id` y `work_plan_items.itr_id`. Borrar un tag o un proyecto revisa por cada tag `punches.tag_id` y `cables.*_tag_id` con seq scan. **Borrar un proyecto de 50k tags es inviable** (horas o timeout).
  - Al aprobar un ITR, `sign_itr_atomic` actualiza `work_plan_items WHERE itr_id = …` con seq scan.
- **Recomendación** (migración sin transacción o ejecución manual, con `CONCURRENTLY`):
  ```sql
  CREATE INDEX CONCURRENTLY idx_org_members_user ON public.org_members (user_id, org_id) INCLUDE (role);
  CREATE INDEX CONCURRENTLY idx_subsystems_system ON public.subsystems (system_id);
  CREATE INDEX CONCURRENTLY idx_systems_area ON public.systems (area_id);
  CREATE INDEX CONCURRENTLY idx_punches_tag ON public.punches (tag_id) WHERE tag_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY idx_punches_itr ON public.punches (itr_id) WHERE itr_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY idx_punches_assigned_open ON public.punches (assigned_to) WHERE status IN ('open','in_progress');
  CREATE INDEX CONCURRENTLY idx_itr_assignments_user ON public.itr_assignments (user_id, role);
  CREATE INDEX CONCURRENTLY idx_itr_attachments_itr ON public.itr_attachments (itr_id, item_id);
  CREATE INDEX CONCURRENTLY idx_punch_attachments_punch ON public.punch_attachments (punch_id);
  CREATE INDEX CONCURRENTLY idx_punch_comments_punch ON public.punch_comments (punch_id);
  CREATE INDEX CONCURRENTLY idx_certificates_ss_phase ON public.certificates (subsystem_id, phase_id, status);
  CREATE INDEX CONCURRENTLY idx_certificates_system ON public.certificates (system_id) WHERE system_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY idx_itrs_template ON public.itrs (template_id);
  CREATE INDEX CONCURRENTLY idx_itr_tpl_items_template ON public.itr_template_items (template_id, section_id);
  CREATE INDEX CONCURRENTLY idx_itr_tpl_sections_template ON public.itr_template_sections (template_id);
  CREATE INDEX CONCURRENTLY idx_wpi_plan ON public.work_plan_items (work_plan_id);
  CREATE INDEX CONCURRENTLY idx_wpi_itr ON public.work_plan_items (itr_id) WHERE itr_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY idx_wpi_assignee_open ON public.work_plan_items (assigned_to) WHERE status IN ('not_started','in_progress');
  CREATE INDEX CONCURRENTLY idx_work_plans_project ON public.work_plans (project_id, plan_date);
  CREATE INDEX CONCURRENTLY idx_pssr_reviews_system ON public.pssr_reviews (system_id, created_at DESC);
  CREATE INDEX CONCURRENTLY idx_pssr_review_items_review ON public.pssr_review_items (review_id);
  CREATE INDEX CONCURRENTLY idx_pres_records_tag ON public.preservation_records (tag_id);
  CREATE INDEX CONCURRENTLY idx_pres_plans_project ON public.preservation_plans (project_id, status, next_due_date);
  CREATE INDEX CONCURRENTLY idx_pres_attach_record ON public.preservation_attachments (record_id);
  CREATE INDEX CONCURRENTLY idx_loop_tags_tag ON public.loop_tags (tag_id);
  CREATE INDEX CONCURRENTLY idx_cables_from_tag ON public.cables (from_tag_id);
  CREATE INDEX CONCURRENTLY idx_cables_to_tag ON public.cables (to_tag_id);
  CREATE INDEX CONCURRENTLY idx_itrs_project_completed ON public.itrs (project_id, completed_date) WHERE completed_date IS NOT NULL;
  CREATE INDEX CONCURRENTLY idx_punches_project_closed ON public.punches (project_id, closed_date) WHERE closed_date IS NOT NULL;
  ```
  Añadir a CI un chequeo de «FK sin índice» (consulta a `pg_constraint` / `pg_index` en la BD de test).
- **Esfuerzo:** S · **Confianza:** alta

### B-06 · Alto · RLS — Políticas por fila con `is_project_member` / `IN (SELECT … WHERE is_project_member(...))` que el Sprint E no migró
- **Ubicación (`baseline.sql`):**
  - `punch_attachments_*` `:7961-7985`
  - `preservation_attachments_*` `:7495-7520`
  - `work_plan_items_*` `:8300-8330`
  - `loop_tags_*` `:7174-7186`
  - `pssr_review_items_select` `:7796`
  - `pssr_reviews_select` `:7834`
  - `work_plans_*` `:8342-8363`
  - `cables_*` `:6559/6566`
  - `pid_documents_*` / `pid_hotspots_*` `:7342-7397`
  - `itr_suggestions_select` `:6978`
  - `signal_samples_select` `:8113`
- **Evidencia:**
  ```sql
  CREATE POLICY punch_attachments_select ON public.punch_attachments FOR SELECT USING ((punch_id IN ( SELECT punches.id
     FROM public.punches WHERE public.is_project_member(punches.project_id))));
  ```
- **Impacto:**
  - Es el mismo patrón que la prueba de carga del 2026-09-03 identificó como causa de conteos de 5–7 s: una función `SECURITY DEFINER` no inlinable evaluada por fila.
  - En `punch_attachments`, `work_plan_items` y `preservation_attachments` el sub-select construye el conjunto de **todos** los padres visibles (decenas de miles de punches o planes) y llama a `is_project_member` por cada uno, en cada consulta, aunque solo se pida el adjunto de un punch.
  - `signal_samples` evalúa un EXISTS con 3 joins (signals → tags → projects) por muestra al agregar la vista de 1 minuto.
- **Recomendación:** reescribir al patrón set-based ya usado en el Sprint E:
  ```sql
  CREATE POLICY punch_attachments_select ON public.punch_attachments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.punches pu WHERE pu.id = punch_id AND pu.project_id IN (SELECT public.get_my_project_ids())));
  CREATE POLICY work_plans_select ON public.work_plans FOR SELECT TO authenticated
    USING (project_id IN (SELECT public.get_my_project_ids()));
  -- signal_samples: set de señales visibles una vez por consulta
  CREATE FUNCTION public.get_my_signal_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
    $$ SELECT s.id FROM signals s JOIN tags t ON t.id = s.tag_id WHERE t.project_id IN (SELECT get_my_project_ids()) $$;
  CREATE POLICY signal_samples_select ON public.signal_samples FOR SELECT TO authenticated
    USING (signal_id IN (SELECT public.get_my_signal_ids()));
  ```
  Ídem para las variantes `is_project_editor` con `get_my_editor_project_ids()`.
- **Esfuerzo:** S–M · **Confianza:** alta (patrón); media (magnitud por tabla)

### B-07 · Alto · Truncamiento silencioso en páginas operativas
- **Ubicación:**
  - `src/app/(dashboard)/my-work/page.tsx:66-69` (todas las asignaciones del usuario con embeds, sin filtro de estado ni límite)
  - `src/components/dashboard/widgets/MyItrsWidget.tsx:9-12`, `InspectorSummaryWidget.tsx:10-13`, `ClientSummaryWidget.tsx:16`, `ClientSignaturesWidget.tsx:11`
  - `src/app/(dashboard)/projects/[id]/signals/page.tsx:23-44` (todas las señales del proyecto)
  - `…/pid-documents/[docId]/viewer/page.tsx:66-81` (todos los tags e ITRs del proyecto)
  - `…/explorer/page.tsx:28-30` (subsistemas) y el RPC `subsystem_rollup`, que devuelve una fila por subsistema y también se capa
  - `src/app/(dashboard)/preservation/page.tsx:22`, `src/app/(dashboard)/certificates/page.tsx:23`
  - `…/kpis/report/page.tsx:45-49` (punches abiertos)
  - `src/app/actions/kpi-snapshots.ts:86-93` (`getProjectSnapshots`: ascendente, sin límite)
  - `KpiSummaryWidget.tsx:38` (cuenta preservación trayendo filas)
- **Evidencia:**
  ```ts
  .from('itr_assignments').select('role, itrs(id, itr_number, status, …, itr_signatures(role))').eq('user_id', userId),
  ```
- **Impacto:**
  - Un inspector con más de 1.000 asignaciones (la mayoría ya aprobadas) ve en «Mi trabajo» y en el dashboard una muestra arbitraria. Sus ITRs pendientes pueden no aparecer, mientras el badge (`my_work_counts`, contado en SQL) muestra el número real: inconsistencia visible.
  - Señales (I/O de 10k–50k): la lista se corta en 1.000.
  - Visor P&ID: el selector de tags solo ofrece los primeros 1.000 por `tag_number` y el estado de ITR por tag queda incompleto.
  - Explorer y KPIs por subsistema: con más de 1.000 subsistemas faltan nodos o métricas.
  - `getProjectSnapshots` devuelve los 1.000 snapshots **más antiguos**: tras ~2,7 años la curva S deja de avanzar.
- **Recomendación:**
  - Filtrar en el servidor: `itrs!inner(status)` con `.in('itrs.status', ['not_started','in_progress','completed'])`, `.limit(QUEUE_LIMIT + 1)` y orden.
  - Señales y visor: paginación o búsqueda por servidor (autocomplete `ilike` con `limit 50`) y estados por tag vía RPC agregado (`tag_status_rollup(p_project_id, p_tag_ids uuid[])`).
  - Snapshots: `order desc limit N` o ventana por fecha.
  - Regla de lint o code-review: todo `.from()` sin `.limit/.range/.single/head:true` sobre tablas de proyecto debe justificarse.
- **Esfuerzo:** M · **Confianza:** alta

### B-08 · Alto · Exportaciones y reportes — truncamiento a 1.000, paginación por OFFSET sin ORDER BY y tope silencioso de 50k
- **Ubicación:**
  - `src/app/api/admin/export/route.ts:43-63` (exportación completa del proyecto: tags, ITRs, punches, preservación, certificados, todos sin paginar)
  - `src/lib/list/fetch-all.ts:12-27`
  - Llamadas sin `.order()`: `reports/phase-progress/pdf/route.ts:42-57`, `reports/area-kpis/pdf/route.ts:55-75`, `reports/system-completion/pdf/route.ts:58-70`, `kpis/report/page.tsx:40`, `kpis/export/route.ts:43`, `reports/itr-test-pack/pdf/route.ts:43`
  - `startup/performance/runs/[runId]/page.tsx:16-24` (`fetchAll` local que ignora errores y capa a 30k)
- **Evidencia:**
  ```ts
  fetchAllRows(() => supabase.from('itrs').select('id, status, phase_id').eq('project_id', projectId)),   // sin .order()
  return out.slice(0, maxRows)   // 50.000, sin aviso
  ```
- **Impacto:**
  - La «exportación de datos» del admin (lo que un cliente usaría como respaldo o entrega) **pierde todo lo que pasa de 1.000 filas por hoja**, sin aviso.
  - La paginación `.range()` sin ORDER BY no garantiza un orden estable entre páginas (planes distintos, synchronized seqscans): puede duplicar u omitir filas en reportes PDF y Excel.
  - Ordenar por `created_at` (no único, en exports de punches) tiene el mismo problema en los empates.
  - Con 100k ITRs: 100 peticiones secuenciales con OFFSET creciente (coste O(n²)), y se cortan en 50k sin indicarlo en el documento.
  - Varios de esos reportes solo necesitan conteos que ya existen como RPC agregado.
- **Recomendación:**
  - (1) Export admin: usar `fetchAllRows` con `.order('id')`, o mejor generar en SQL/stream.
  - (2) En `fetchAllRows`, exigir orden único (añadir `.order('id')` dentro del helper o paginación keyset `gt('id', last)`) y lanzar error o poner marca «truncado» al superar `maxRows`.
  - (3) Reportes que solo cuentan → `fetchItrPhaseCounts` / `fetchPunchCounts` / `subsystem_rollup`.
  - (4) Para exportaciones grandes, job asíncrono que escriba el XLSX en Storage y notifique.
- **Esfuerzo:** M · **Confianza:** alta

### B-09 · Alto · Triggers — `guard_assigned_itr_template` hace seq scan de `itrs` por cada ítem de plantilla; `guard_itr_row` bloquea la plantilla en cada alta de ITR
- **Ubicación:** `supabase/migrations/20260909180000_itr_atomic_integrity.sql:203` y `:180`
- **Evidencia:**
  ```sql
  IF EXISTS(SELECT 1 FROM public.itrs WHERE template_id=tid) THEN                      -- itrs.template_id sin índice
  SELECT org_id INTO tpl_org FROM public.itr_templates WHERE id = NEW.template_id FOR UPDATE;
  ```
- **Impacto:**
  - Guardar una plantilla con 100 ítems (insert/update/delete por fila) lanza 100 seq scans de `itrs` (más de 250k filas): segundos o minutos en el editor de plantillas, y peor en importaciones de catálogo (302 plantillas).
  - El `FOR UPDATE` sobre `itr_templates` en cada INSERT de ITR serializa las altas concurrentes con la misma plantilla (dos importaciones o generaciones masivas en paralelo se bloquean mutuamente) y bloquea la edición de la plantilla mientras dure la transacción.
- **Recomendación:** `CREATE INDEX idx_itrs_template ON itrs(template_id)` (incluido en B-05). Cambiar `FOR UPDATE` por `FOR KEY SHARE`, suficiente para impedir el borrado o cambio de clave concurrente sin serializar las altas. Para la inmutabilidad, columna `itr_templates.is_assigned boolean`, puesta por trigger al primer ITR, en vez del EXISTS.
- **Esfuerzo:** S · **Confianza:** alta

### B-10 · Alto · Numeración — `next_punch_number_atomic` recorre todos los punches del proyecto con regex en cada INSERT
- **Ubicación:** `00000000000000_baseline.sql:1523-1546` (invocada por `trg_set_punch_number`, `:1795`)
- **Evidencia:**
  ```sql
  SELECT COALESCE(MAX(CASE WHEN punch_number ~ '^P-\d+$' THEN SUBSTRING(punch_number FROM 3)::int ELSE 0 END), 0)
  INTO v_existing FROM punches WHERE project_id = p_project_id;
  ```
- **Impacto:** coste O(n) por punch. Con 50k punches por proyecto, cada alta lee 50k filas. Cargas masivas (Excel, `vendor_findings`, PSSR → punches) quedan en O(n²). El contador `punch_counters` ya existe y hace innecesario el MAX. La corrección no está comprometida: el upsert serializa por la fila del contador.
- **Recomendación:** usar solo `punch_counters` (`INSERT … ON CONFLICT DO UPDATE SET last_seq = punch_counters.last_seq + 1 RETURNING`). Sembrar el contador una vez con el MAX vigente en una migración. Si se quiere tolerar números manuales, hacer el MAX solo cuando el contador no existe.
- **Esfuerzo:** S · **Confianza:** alta

### B-11 · Alto · Notificaciones / crons — `push-dispatch` con ventana fija de 5 min sin cursor persistido y sin índice usable
- **Ubicación:** `src/app/api/cron/push-dispatch/route.ts:102-110`; `.github/workflows/cron.yml:18`
- **Evidencia:**
  ```ts
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  .from('domain_events').select(…).gte('occurred_at', since).order('occurred_at').limit(500)
  ```
- **Impacto:**
  - Los cron programados de GitHub Actions se retrasan con frecuencia (5–30 min) o se omiten en horas pico. Todo evento fuera de la ventana **no se notifica nunca**, y dos ejecuciones solapadas notifican dos veces.
  - Más de 500 eventos en 5 minutos (una importación) también se pierden.
  - `domain_events` no tiene índice con `occurred_at` como columna líder (los existentes empiezan por `org_id`, `project_id`, `event_type` o `aggregate_*`): seq scan de una tabla que crece sin límite (B-03, B-30), cada 5 minutos.
  - El bucle por evento consulta `push_subscriptions` de forma secuencial (N+1).
- **Recomendación:**
  - Cursor persistido: columna `push_dispatched_at` + índice parcial, o tabla `cron_cursors(name, last_event_at, last_id)` con avance atómico.
  - Agrupar suscripciones por org en una sola consulta.
  - Índice `CREATE INDEX ON domain_events (occurred_at)` o `USING brin (occurred_at)`.
  - A medio plazo, mover el push a la misma cola outbox de B-03.
- **Esfuerzo:** M · **Confianza:** alta

### B-12 · Alto · IIoT — `signal_samples` sin retención efectiva, sin partición y vista de 1 minuto no sargable
- **Ubicación:**
  - `baseline.sql:366-385` (`cleanup_signal_samples_retention`, comentario «Invoked by pg_cron daily»)
  - `supabase/README.md:59` («pg_cron … currently not used»)
  - `baseline.sql:3427-3436` (vista `signal_samples_1min`)
  - `…/startup/performance/runs/[runId]/page.tsx:58-61`
- **Evidencia:**
  ```sql
  COMMENT ON FUNCTION public.cleanup_signal_samples_retention() IS '… Invoked by pg_cron daily.';   -- no hay cron.schedule en ningún archivo
  SELECT signal_id, date_trunc('minute', sampled_at) AS bucket, avg(value)… FROM signal_samples WHERE quality = 0 GROUP BY …
  ```
- **Impacto:**
  - La retención de 90 días no corre: la tabla de series temporales crece sin límite.
  - La vista agrega en vivo. El filtro `bucket >= X` se traduce a `date_trunc(...) >= X`, que no usa el PK `(signal_id, sampled_at)` para el rango: lee todo el histórico de cada señal.
  - La consola de desempeño pagina la vista con `.range()`, así que **cada página re-agrega todo el rango**.
  - Sumado a la RLS por fila (B-06): las consultas de arranque y desempeño se degradan con el volumen.
- **Recomendación:**
  - Programar la retención: `pg_cron` (`SELECT cron.schedule('signal-retention','30 3 * * *', $$SELECT public.cleanup_signal_samples_retention()$$)`) o añadirla al workflow de GitHub vía RPC service_role.
  - Particionar `signal_samples` por mes (`PARTITION BY RANGE (sampled_at)`) para que la retención sea `DROP PARTITION`.
  - Reemplazar la vista por una función `signal_series_1min(p_signal_ids uuid[], p_from, p_to)` que filtre `sampled_at BETWEEN p_from AND p_to` antes de agrupar, o por un rollup materializado por minuto (tabla `signal_samples_1min` alimentada en la ingesta).
- **Esfuerzo:** M · **Confianza:** alta (retención no programada en repo; podría existir un job creado a mano en prod: verificar con `select * from cron.job`)

### B-13 · Alto · Badge «Mi trabajo» — `my_work_counts` en el layout en cada render, con ~20 subconsultas y búsquedas sin índice
- **Ubicación:**
  - `src/app/(dashboard)/layout.tsx:36-84`
  - Cuerpo vigente: `20261018150000_ops_readiness_ownership.sql:580` + parche de `20261019150000:667`
- **Evidencia:**
  ```sql
  from itr_assignments a join itrs i on i.id = a.itr_id where a.user_id = auth.uid() …   -- sin índice user_id
  from punches p where p.assigned_to = auth.uid() …                                       -- sin índice assigned_to
  ```
- **Impacto:**
  - El layout de dashboard hace 1 consulta secuencial (projects) más 7 en paralelo (dos `count: exact` sobre punches y preservación, notificaciones, `my_work_counts`…) en cada render del servidor: navegación, `router.refresh()` y `revalidatePath` de cada server action.
  - `my_work_counts` encadena unas 20 subconsultas. Varias son por org (punches por verificar, acciones por verificar) y recorren todos los punches abiertos de la org.
  - Con los seq scans de `itr_assignments` y `org_members`, el coste fijo por página crece con el tamaño del tenant.
- **Recomendación:** índices de B-05. Cachear el badge por usuario 30–60 s (`unstable_cache` con tag por usuario, invalidado por las acciones relevantes) o moverlo a carga cliente diferida (no bloquear el render del layout). Unificar los contadores del layout (punches A y preservación) dentro de `my_work_counts`.
- **Esfuerzo:** S–M · **Confianza:** alta (patrón); media (magnitud)

### B-14 · Medio · Integridad / numeración — Certificados: conteo `LIKE` con prefijo ambiguo y emisión no atómica
- **Ubicación:** `src/app/actions/certificates.ts:102-140`
- **Evidencia:**
  ```ts
  .like('certificate_number', `${certType}/${subsystem.code}%`)
  await supabase.from('certificate_punch_exceptions').insert(…)   // resultado ignorado
  ```
- **Impacto:**
  - `MC/SS-01%` también cuenta `MC/SS-010…` y `MC/SS-01A`. La primera emisión de SS-01 puede salir como `-R2`, o chocar con `UNIQUE (project_id, certificate_number)` y fallar. `_` y `%` en códigos actúan como comodines.
  - El certificado se inserta y luego las excepciones Cat B en otra sentencia. Si la segunda falla, queda un certificado emitido **sin** las justificaciones exigidas, sin error al usuario.
  - La elegibilidad se evalúa en la app antes de insertar (TOCTOU: un Cat A abierto entre medio no se detecta).
- **Recomendación:** RPC `issue_certificate(p_subsystem_id, p_phase_id, p_notes, p_exceptions jsonb)` `SECURITY DEFINER` que en una transacción:
  - bloquee el subsistema;
  - recalcule la elegibilidad en SQL (reusar `system_phase_level` por subsistema);
  - cuente con igualdad exacta (`certificate_number = base OR certificate_number ~ ('^' || regexp_quote(base) || '-R\d+$')`) o con un contador por (subsistema, fase);
  - inserte el certificado y las excepciones.
- **Esfuerzo:** M · **Confianza:** alta

### B-15 · Medio · Integridad / duplicación — Autosave de ITR no atómico; avance calculado en TS mientras la firma usa SQL
- **Ubicación:**
  - `src/app/actions/itr-instances.ts:245-286`
  - `evaluate_itr_capture` (`20260909180000_itr_atomic_integrity.sql:3`)
- **Evidencia:**
  ```ts
  await ctx.supabase.from('itr_responses').update(patch)…   // 1
  … Promise.all([items, responses, attachments])               // 2-4
  await ctx.supabase.from('itrs').update({ progress_pct, status, completed_date })   // 5
  ```
- **Impacto:**
  - 5 round-trips por casilla guardada, de ellos `itr_template_items select *` sin índice (B-05).
  - Dos inspectores en el mismo ITR calculan el avance sobre lecturas distintas y el último pisa `status/progress_pct`: puede «retroceder» un ITR completado.
  - La lógica de completitud está duplicada: TS (`evaluateItrCompletion`) para el estado y SQL (`evaluate_itr_capture`) para la firma. Si divergen, la UI muestra «completado» y `sign_itr_atomic` rechaza (o al revés).
  - Cada `UPDATE itrs` dispara además B-03.
- **Recomendación:** RPC `save_itr_response(...)` que en una transacción haga el upsert, ejecute `evaluate_itr_capture(p_itr_id)` y actualice `itrs` solo si cambian el estado o el `progress_pct`: un único round-trip y una única fuente de verdad. Mantener el evaluador TS solo para la previsualización offline, con un test de paridad contra la BD de test.
- **Esfuerzo:** M · **Confianza:** alta

### B-16 · Medio · Offline — LWW compara el reloj del dispositivo con el del Worker; chequeo y escritura no atómicos
- **Ubicación:** `src/lib/sync/replay.ts:49-61`; `src/app/actions/itr-instances.ts:195`
- **Evidencia:**
  ```ts
  if (serverRow?.responded_at && serverRow.responded_at > item.updatedAt) { winner = 'remote' …
  responded_at: new Date().toISOString(),   // reloj del servidor
  ```
- **Impacto:** un tablet con el reloj adelantado o atrasado (frecuente en campo, sin NTP) gana o pierde conflictos de forma incorrecta y se descartan datos de campo. Entre el SELECT y el upsert otra escritura puede colarse. La rama «ganó local frente a un remoto distinto» nunca registra conflicto, porque `remotePayload` solo se asigna cuando gana el remoto: código muerto.
- **Recomendación:** compare-and-set en el servidor, como ya se hace en line-up (`CU409`). El cliente envía la versión base que vio (`base_responded_at` o un `version int`) y el RPC rechaza si cambió. Guardar `captured_at` del dispositivo solo como dato, no como árbitro.
- **Esfuerzo:** M · **Confianza:** alta

### B-17 · Medio · Integridad referencial — `project_id` desnormalizado sin FK compuesta (referencias cruzadas entre proyectos u orgs)
- **Ubicación:** FKs simples en `baseline.sql:6144-6152` (`punches.subsystem_id`, `punches.tag_id`), `:6320` (`tags.subsystem_id`), `:6112` (`punches.itr_id`), `certificates.subsystem_id`. Solo `itrs` tiene guarda (`guard_itr_row`).
- **Evidencia:**
  ```sql
  ADD CONSTRAINT punches_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id);
  ADD CONSTRAINT tags_subsystem_id_fkey FOREIGN KEY (subsystem_id) REFERENCES public.subsystems(id) ON DELETE CASCADE;
  ```
- **Impacto:** la BD acepta un tag del proyecto A con `subsystem_id` del proyecto B, o un punch con `tag_id` de otra org. Las políticas RLS solo validan `project_id`. Los agregados por subsistema (gates, rollup, certificados) contarían filas ajenas. Hoy depende de que cada server action verifique con `access.ts`; la API v1 y las importaciones usan admin client.
- **Recomendación:** `ALTER TABLE subsystems ADD CONSTRAINT subsystems_id_project_uq UNIQUE (id, project_id);` y FKs compuestas `FOREIGN KEY (subsystem_id, project_id) REFERENCES subsystems(id, project_id)` en `tags`, `punches`, `itrs` y `certificates`; ídem `tags(id, project_id)` para `punches.tag_id` e `itrs.tag_id`. Antes, consulta de detección de filas inconsistentes.
- **Esfuerzo:** M · **Confianza:** alta (hueco en la BD); media (explotabilidad, depende de los guards de la app)

### B-18 · Medio · IIoT — `ingest_signal_samples` resuelve la señal por `signal_tag` a nivel org con `LIMIT 1`
- **Ubicación:** `baseline.sql:1325-1336`
- **Evidencia:**
  ```sql
  WHERE sig.signal_tag = (item->>'signal_name') AND p.org_id = p_org_id AND sig.active = TRUE
  LIMIT 1
  ```
- **Impacto:** el único es `(tag_id, signal_tag)`. Dos proyectos de la misma org con `FT-101` (habitual en brownfield o tren 1 / tren 2) reciben las muestras en una señal arbitraria, sin ORDER BY. Las evaluaciones de desempeño y los eventos de arranque se calculan con datos de otro proyecto.
- **Recomendación:** exigir `project_id` (o `source_system` mapeado a proyecto) en el payload del lote, o un namespace único por org (`UNIQUE (org_id, signal_tag)` vía columna desnormalizada). Rechazar con error `ambiguous_signal` cuando haya más de una coincidencia.
- **Esfuerzo:** S–M · **Confianza:** alta

### B-19 · Medio · Higiene de migraciones — El cuerpo efectivo de las funciones críticas no está en ningún archivo
- **Ubicación:**
  - `compute_system_gates`: definida completa 5 veces (`20261012200000`, `20261015120000`, `20261015200000`, `20261017120000`, `20261017210000`) y luego 4 parches por ancla (`20261019150000:637`, `20261021120000:606`, `20261021130000:7` y `:23`)
  - Ídem `my_work_counts` (6 definiciones + parche), `daily_report_data`, `take_mgmt_snapshot`
  - `20260909180000_itr_atomic_integrity.sql:1` dice «Integration candidate, not an applied migration» y deja el GRANT comentado
- **Evidencia:**
  ```sql
  v_def := pg_get_functiondef('public.compute_system_gates(uuid)'::regprocedure);
  v_def := replace(v_def, v_anchor, …); EXECUTE v_def;
  ```
- **Impacto:**
  - Para saber qué calcula hoy un gate hay que aplicar mentalmente 9 migraciones.
  - Si alguien copia la última definición completa (la de F6) para modificarla, **borra en silencio** los criterios `performance_accepted` y `documents_current` y las firmas con empresa.
  - Si prod recibió un hot-fix manual, los parches por ancla abortan o, peor, se aplican sobre un cuerpo distinto al del repo.
  - Las cabeceras contradictorias confunden.
- **Recomendación:** tras cada migración, volcar automáticamente `pg_get_functiondef` de las funciones a `supabase/schema/functions/<name>.sql`, generado y versionado, con un check de CI que falle si difiere tras `supabase db reset`. Establecer como regla que una nueva definición completa parte de ese volcado. Corregir el comentario de cabecera de `20260909180000`.
- **Esfuerzo:** S · **Confianza:** alta

### B-20 · Medio · Funciones pesadas — `daily_report_data`
- **Ubicación:** `20261018120000_startup_event_log.sql:315-455` + parche `20261019150000:700`
- **Evidencia:**
  ```sql
  AND (SELECT MAX(sg.signed_at) FROM itr_signatures sg WHERE sg.itr_id = i.id) >= v_from
  AND (SELECT MAX(sg.signed_at) FROM itr_signatures sg WHERE sg.itr_id = i.id) < v_to
  FROM public.compute_project_gates(p_project_id) pg …  -- solo para listar «regressed»
  ```
- **Impacto:**
  - «Aprobados hoy» evalúa dos sub-consultas por cada ITR aprobado del proyecto (decenas de miles) en lugar de partir de las firmas del día.
  - «Regresiones» ejecuta el motor completo de gates (B-04).
  - `completed_date = p_date` y `closed_date = p_date` no tienen índice (B-05).
  - Crea una `TEMP TABLE` por llamada: bloat del catálogo con uso frecuente.
  - Se ejecuta al crear o refrescar cada reporte diario y bajo la IA.
- **Recomendación:**
  - Partir de `itr_signatures WHERE signed_at >= v_from AND signed_at < v_to`, con índice `itr_signatures(signed_at)`, y juntar con `itrs WHERE status='approved'`.
  - Para regresiones, usar la caché de B-04 o comparar con `system_progress_snapshots`.
  - Sustituir la temp table por un CTE o un array `uuid[]`.
  - Añadir columna `itrs.approved_at`, puesta por `sign_itr_atomic`, para KPIs y reportes.
- **Esfuerzo:** M · **Confianza:** alta

### B-21 · Medio · Crons — N+1 y límites de subrequests del Worker
- **Ubicación:**
  - `src/app/api/cron/preservation-overdue/route.ts:41-49, 57-63, 80-128`
  - `src/app/api/cron/snapshot/route.ts:46-154`
  - `src/app/api/cron/constraints-overdue/route.ts:16-70`
- **Evidencia:**
  ```ts
  .limit(2000)                                         // PostgREST devuelve como máximo 1000
  admin.from('tags').select('id, tag_number').in('id', tagIds),   // hasta 1000 UUID en la URL (~37 kB)
  for (const plan of plans) { await …count…; await …insert… }      // 2 peticiones secuenciales por plan
  ```
- **Impacto:**
  - Preservación vencida: más de 1.000 planes vencidos (posible con 50k tags) se truncan. El `.in()` con cientos de UUIDs supera los límites de URL (error 414 o 400) y el cron falla entero.
  - 2.000 sub-peticiones secuenciales chocan con el límite de subrequests por invocación del Worker (1.000 en el plan Paid según la documentación vigente a mi fecha de corte; verificar) y con el tiempo de la acción de GitHub.
  - El snapshot recorre los proyectos en serie, con unas 9 sub-peticiones cada uno (más el `take_mgmt_snapshot` pesado). Los errores por proyecto se reportan, pero el workflow no falla (`curl -f` solo mira el HTTP 200 global).
- **Recomendación:** mover la lógica a funciones SQL set-based invocadas por un único RPC service_role: `notify_preservation_overdue(p_date)` con `INSERT … SELECT … WHERE NOT EXISTS (…)` e índice único de deduplicación `notifications (recipient_user_id, kind, (payload->>'planId'), (created_at::date))`. Ídem constraints. Para el snapshot, un RPC por proyecto en paralelo acotado, o `pg_cron` dentro de la BD. Devolver HTTP 500 si `failed > 0`.
- **Esfuerzo:** M · **Confianza:** alta (código); media (límite exacto de Workers)

### B-22 · Medio · Listas paginadas — `count: 'exact'` sobre vistas con joins, filtros no indexables y búsqueda capada a 150 tags
- **Ubicación:**
  - `src/lib/list/itr-query.ts:48, 71-76`
  - `src/lib/list/tag-query.ts:72`
  - `src/lib/list/punch-query.ts:86, 101`
- **Evidencia:**
  ```ts
  supabase.from('itr_list_v').select(VIEW_COLS, { count: 'exact' })
  if (f.phase) q = q.eq('phase_code', f.phase)    // columna de tabla unida
  supabase.from('tags').select('id').or(`tag_number.ilike.${like},description.ilike.${like}`).limit(150)
  ```
- **Impacto:**
  - Cada página de la lista de ITRs a nivel org (250k filas) recuenta todo con los joins de la vista y la RLS de 6 tablas.
  - Filtrar por `phase_code` o `discipline_code` obliga a unir todas las filas antes de filtrar.
  - Ordenar por columnas unidas (tag, plantilla) más el OFFSET profundo cuesta O(offset).
  - Una búsqueda que coincide con más de 150 tags devuelve ITRs o punches incompletos sin avisarlo.
- **Recomendación:**
  - Traducir los filtros de código a id en la app (`phase_id`, `discipline_id`, con lookup de catálogos ya cargados) y filtrar sobre columnas de `itrs`.
  - Usar `count: 'planned'` en el ámbito org, o el conteo exacto solo en la primera página y cacheado.
  - Paginación keyset para orden por defecto (`created_at, id`).
  - Indicar «resultados parciales» cuando `tagIds.length === 150`, o resolver la búsqueda con un join en SQL (RPC `search_itrs`).
- **Esfuerzo:** M · **Confianza:** media

### B-23 · Medio · Latencia — Worker sin Smart Placement y cadenas de awaits secuenciales
- **Ubicación:**
  - `wrangler.jsonc` (sin `placement`)
  - `src/app/(dashboard)/layout.tsx:36-84` (projects → 7 en paralelo, tras `getActiveMembership`)
  - `…/tags/[tagId]/itrs/[itrId]/page.tsx:22-93` (6 awaits secuenciales + un `createSignedUrl` por adjunto)
  - `…/daily/[kind]/[itemId]/page.tsx` (9 awaits)
- **Evidencia:**
  ```ts
  (rawAttachments ?? []).map(async att => { await supabase.storage.from('itr-attachments').createSignedUrl(att.file_url, 3600) })
  ```
- **Impacto:** el Worker corre en el PoP del usuario (LatAm) y Supabase en una sola región. Cada await secuencial paga el RTT entre regiones (~50–150 ms). La pantalla de ejecución de ITR, la más usada en campo, acumula ~1 s de red en el servidor antes de renderizar, más N firmas de URL.
- **Recomendación:**
  - `"placement": { "mode": "smart" }` en `wrangler.jsonc`, a validar con OpenNext.
  - Agrupar awaits independientes en `Promise.all`.
  - `createSignedUrls(paths[], 3600)` (batch) en vez de una llamada por adjunto.
  - Un RPC `itr_execution_bundle(p_itr_id)` que devuelva ITR, plantilla, respuestas, adjuntos y firmas en un JSON.
- **Esfuerzo:** S–M · **Confianza:** media

### B-24 · Medio · Reportes y KPIs — Lógica de «abierto» y «vencido» inconsistente entre pantallas
- **Ubicación:**
  - `src/app/(dashboard)/layout.tsx:65-70` (preservación: `status <> 'completed'` y `next_due_date < hoy-3d`)
  - `my_work_counts` (`status='active'` y `< current_date`)
  - `KpiSummaryWidget.tsx:38-44` (`active` y `≤ hoy+7`)
  - Cron snapshot (`status='active'` y `< hoy`)
- **Evidencia:**
  ```ts
  .neq('status', 'completed').lt('next_due_date', threeDaysAgo)
  ```
- **Impacto:** el badge del sidebar, «Mi trabajo», el dashboard y el snapshot muestran cifras distintas de «preservación vencida» para el mismo proyecto, y los planes `paused` o `cancelled` cuentan en uno sí y en otro no. Erosiona la confianza en los KPIs.
- **Recomendación:** una sola definición en SQL (`preservation_overdue_count(p_project_ids uuid[])`, o vista `preservation_plan_status_v` con columna `is_overdue`) usada por todas las pantallas. Documentar la tolerancia de 3 días si es intencional.
- **Esfuerzo:** S · **Confianza:** alta

### B-25 · Medio · Snapshots — `kpi_snapshots` sin clave única y con borrado + inserción no atómico
- **Ubicación:** `baseline.sql:2938-2956`; `src/app/api/cron/snapshot/route.ts:78-114`; `src/app/actions/kpi-snapshots.ts:144-170`
- **Evidencia:**
  ```ts
  await supabase.from('kpi_snapshots').delete().eq('project_id', pid).eq('snapshot_date', today)…
  const { error: insertErr } = await supabase.from('kpi_snapshots').insert({…})
  ```
- **Impacto:** si el cron y un «Tomar snapshot» manual coinciden, o si se reintenta el workflow, se duplican filas del mismo día y las curvas S muestran saltos o dobles puntos. El error del primer delete no se comprueba. No hay índice `(project_id, snapshot_date)` para las lecturas de 7 días y del historial.
- **Recomendación:**
  ```sql
  CREATE UNIQUE INDEX kpi_snapshots_uq ON public.kpi_snapshots
    (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) NULLS NOT DISTINCT;   -- PG15+ (prod: 17.6)
  ```
  Y `upsert(..., { onConflict })` o, mejor, la función SQL de B-01. `DROP INDEX idx_kpi_snapshots_date`, cubierto por el nuevo.
- **Esfuerzo:** S · **Confianza:** alta

### B-26 · Medio · Arranque y desempeño — Evaluación recalculada en cada render y paginación sin manejo de errores
- **Ubicación:** `…/startup/performance/runs/[runId]/page.tsx:16-24, 66-72`; `performance_compute_evaluation` (`20261019150000_performance_results.sql:212-…`)
- **Evidencia:**
  ```ts
  const { data } = await page(from, from + PAGE - 1)   // error ignorado
  else if (run.status === 'closed') { … ctx.supabase.rpc('evaluate_performance_run', { p_run_id: runId }) …
  ```
- **Impacto:** cada visita a un intento cerrado y no evaluado re-ejecuta la evaluación completa: `generate_series` por minuto, 3 temp tables y lectura de la vista de 1 minuto (B-12). Un fallo de red a mitad de la paginación devuelve una serie parcial sin aviso, y el tope de 30k puntos corta en silencio pruebas largas con muchas variables.
- **Recomendación:** cachear la evaluación «previa» en `performance_runs.evaluation_preview` al cerrar el intento (invalidada si cambian perturbaciones o lecturas manuales). Lanzar error o marcar el truncamiento en `fetchAll`.
- **Esfuerzo:** S · **Confianza:** alta

### B-27 · Bajo · Índices redundantes o de baja selectividad (amplificación de escrituras)
- **Ubicación:** `baseline.sql:4488, 4495, 4537, 4544, 4621, 4628, 4733, 4740, 4747, 4754`; `20260903180000_tag_punch_list_views.sql` (`idx_tags_project_tag_number`)
- **Evidencia:**
  ```sql
  CREATE INDEX api_keys_hash_idx … (key_hash);  CREATE INDEX idx_api_keys_hash … (key_hash);  -- + UNIQUE api_keys_key_hash_key
  CREATE INDEX idx_tags_project_tag_number ON public.tags (project_id, tag_number);           -- = UNIQUE tags_project_id_tag_number_key
  ```
- **Impacto:**
  - Duplicados exactos: `api_keys.key_hash` ×3, `api_keys.org_id` ×2, `tags (project_id, tag_number)` ×2.
  - Prefijos cubiertos: `idx_itrs_project` (cubierto por `(project_id, phase_id, status)`), `idx_punches_project` (por `(project_id, created_at)`), `idx_punches_subsystem` (por `(subsystem_id, status)`).
  - Baja selectividad, casi nunca útiles: `idx_itrs_status`, `idx_punches_status`, `idx_punches_category`.
  - Cada autosave de ITR que cambia `status` mantiene más índices de los necesarios y pierde HOT updates.
- **Recomendación:** `DROP INDEX CONCURRENTLY` de los redundantes, tras verificar en `pg_stat_user_indexes` (`idx_scan = 0`) en prod.
- **Esfuerzo:** S · **Confianza:** alta (redundancia); media (uso real)

### B-28 · Bajo · Esquema — Tabla de respaldo `itr_template_items_backup_pre_split` en producción
- **Ubicación:** `baseline.sql` (CREATE TABLE `itr_template_items_backup_pre_split`); `src/types/supabase.generated.ts`
- **Evidencia:** la tabla aparece en el listado de tablas del baseline y en los tipos generados.
- **Impacto:** deuda de esquema: confunde, ocupa espacio y aparece en los tipos. Hay que confirmar si tiene RLS habilitada y políticas, porque el baseline dice «RLS en todas».
- **Recomendación:** exportarla a un archivo y eliminarla en una migración.
- **Esfuerzo:** S · **Confianza:** alta

### B-29 · Bajo · Fechas — «Hoy» calculado en UTC en crons y snapshots
- **Ubicación:**
  - `src/app/api/cron/snapshot/route.ts:31`, `preservation-overdue/route.ts:39`
  - `sign_itr_atomic` (`completed_date = CURRENT_DATE`, zona horaria de la BD)
  - `itr-instances.ts:282` (`completed_date: new Date().toISOString()`)
- **Evidencia:**
  ```ts
  const today = new Date().toISOString().split('T')[0]
  ```
- **Impacto:** las 02:00 UTC son las 21:00 del día anterior en Colombia o Perú (UTC-5). Un ITR completado a las 20:00 locales cuenta como del día siguiente en `completed_date`, y el reporte diario y los KPIs «de hoy» se desfasan para usuarios de LatAm.
- **Recomendación:** zona horaria por proyecto u organización (`projects.timezone`), usada en el SQL como `(now() AT TIME ZONE tz)::date` y en el cron.
- **Esfuerzo:** M · **Confianza:** alta

### B-30 · Bajo · Retención — `domain_events`, `activity_log`, `notifications`, `webhook_deliveries` y `net._http_response` crecen sin límite
- **Ubicación:** baseline (sin jobs de limpieza). `activity_log` recibe copias completas de respuestas y adjuntos en cada reapertura (`reopen_itr_atomic`).
- **Evidencia:** no hay `DELETE`, partición ni job para estas tablas en el repo.
- **Impacto:** con B-03, `domain_events` puede llegar a millones de filas con payloads de 2–4 kB (GB) en un proyecto grande, y penaliza los seq scans de B-11.
- **Recomendación:** particionar `domain_events` y `activity_log` por mes. Retención configurable (p. ej. 180 días para `domain_events`, que solo sirve de bus; `activity_log` es auditoría y se conserva). Limpiar `net._http_response`. Programar los jobs en el cron.
- **Esfuerzo:** M · **Confianza:** alta

---

## 4. Propuestas estratégicas para escala industrial

1. **«Cero filas para contar».** Ninguna pantalla, cron ni reporte debería traer filas para contarlas.
   - Catálogo único de agregados SQL: los existentes más `subsystem_phase_eligibility`, `tag_status_rollup`, `preservation_overdue_count` y `take_kpi_snapshot`.
   - Regla de lint (AST o grep en CI) que marque `.from('<tabla de proyecto>').select(...)` sin `.limit/.range/.single/maybeSingle/head:true`.
   - Corrige B-01, B-02, B-07, B-08 y B-24 de raíz.
2. **Readiness materializada y event-driven.**
   - Tabla `system_readiness_cache(system_id, gate_id, status, computed_level, criteria jsonb, computed_at)` + cola `dirty_systems(system_id, reason, queued_at)`.
   - Triggers ligeros sobre `itrs` (status), `punches` (status, category, subsystem), `certificates`, `system_gate_*`, `register_items`, `project_constraints`, `lineup_sheets` y `document_references` marcan el sistema sucio.
   - Un worker (cron cada minuto vía RPC, o `pg_cron`) recalcula con la versión set-based y SECURITY DEFINER de B-04.
   - Control Tower, look-ahead, reporte diario y vendors leen la caché. El detalle del sistema puede seguir en vivo.
3. **Bus de eventos outbox en lugar de HTTP por fila.**
   - `domain_events` con `dispatched_at` + índice parcial, consumido por lotes por un único dispatcher (webhooks, workflows, push) con cursor y reintentos.
   - Modo bulk (`SET LOCAL commup.bulk`) para importaciones.
   - Retención y partición mensual. Corrige B-03, B-11 y B-30.
4. **Series temporales IIoT como subsistema aparte.**
   - Partición mensual de `signal_samples`, rollup por minuto materializado en la ingesta y retención por `DROP PARTITION`.
   - RLS por conjunto de señales visibles.
   - Si el volumen supera ~10⁸ muestras, evaluar TimescaleDB (disponible en Supabase) o un almacén externo.
5. **Integridad declarativa sobre la jerarquía.** FKs compuestas `(child_id, project_id)` en toda la cadena área → sistema → subsistema → tag → ITR/punch/certificado (B-17). Permiten además índices compuestos `(project_id, subsystem_id, …)` más útiles para RLS y agregados.
6. **Banco de rendimiento reproducible.**
   - Convertir la prueba de carga del 2026-09-03 (LOADTEST 50k tags) en un script versionado con seed (`scripts/loadtest/`) y un conjunto de `EXPLAIN (ANALYZE, BUFFERS)` de las 15 consultas más calientes (Control Tower, `my_work_counts`, listas, `daily_report_data`, snapshot), con presupuesto en ms.
   - Ejecutarlo antes de cada release sobre una rama de Supabase.
   - Habilitar `pg_stat_statements` (ya instalado) y revisar mensualmente el top por tiempo total.
7. **Fuente única del esquema efectivo.** Volcado automático de funciones, vistas y políticas tras cada migración (B-19) y test de paridad TS↔SQL para las reglas duplicadas: `eligibility.ts` ↔ `system_phase_level`, `evaluateItrCompletion` ↔ `evaluate_itr_capture`. Ya existe `tests/db/readiness.test.ts`; falta activar los secretos de CI.
8. **Placement y round-trips.** Smart Placement en Workers, RPCs «bundle» por pantalla crítica (ejecución de ITR, Mi trabajo, detalle de sistema) y caché corta por usuario para el badge del layout.

---

## 5. Funcionamiento para el manual (notas en lenguaje simple)

> Comportamientos actuales verificados en el código. Los marcados ⚠ son limitaciones conocidas que conviene corregir antes de documentarlas como definitivas.

**Fotos diarias de indicadores (snapshots)**
- Se toman automáticamente una vez al día, a las 02:00 UTC (21:00 en Colombia o Perú, 22:00 en Venezuela). La fecha de la foto es la fecha UTC.
- Solo se fotografían los proyectos en estado «activo». Un proyecto en pausa o completado deja de acumular historial.
- Un líder o superior puede tomar la foto manualmente desde KPIs; si ya existía la del día, se reemplaza.
- La foto incluye el avance por ITRs aprobados (total y por fase), punches A/B, tags, planes de preservación y vencidos. Aparte se guarda el «avance ponderado» por sistema (Σ peso del gate × % de ITRs aprobados de su fase) y los KPIs de gestión diaria (TQ, acciones, restricciones, compromisos, documentos, vendors).
- ⚠ En proyectos con más de 1.000 ITRs o punches, la foto clásica de KPIs cuenta como máximo 1.000 (B-01). El avance ponderado y los KPIs de gestión sí se calculan completos en la base de datos.

**Numeración automática**
- Punches: `P-0001`, `P-0002`… por proyecto, consecutiva. No se reutiliza un número aunque se cancele el punch.
- ITR: `CÓDIGO-PLANTILLA/TAG`. Si se vuelve a crear la misma plantilla para el mismo tag, se añade ` R2`, ` R3`…
- Certificados: `TIPO/SUBSISTEMA` (p. ej. `MC/SS-01`). Las reemisiones llevan `-R2`, `-R3`… ⚠ Ver B-14 sobre códigos de subsistema que son prefijo de otros.
- Gestión y arranque: acciones, restricciones, TQ, decisiones, procedimientos (`PRC-0001`), eventos (`EVT-0001`), traspasos (`TRF-0001`), relevos (`REL-0001`), registros, pruebas de desempeño y paquetes de vendor. Todos se numeran consecutivos por proyecto, garantizados por la base de datos aunque dos personas creen a la vez.
- Reporte diario: `RD-<proyecto>-AAAAMMDD`; las correcciones añaden `-R1`, `-R2`…

**Qué no se puede modificar (inmutable)**
- Un ITR firmado o aprobado no admite cambios de respuestas, fotos ni asignaciones. Para corregirlo, un owner, admin o arquitecto debe «reabrirlo» indicando el motivo; las firmas se anulan y queda copia de todo en la auditoría.
- La identidad de un ITR (plantilla, tag, subsistema, fase, número) no cambia nunca.
- Una plantilla de ITR que ya se usó en algún ITR queda congelada: para cambiarla se publica una nueva revisión.
- Las fotos y archivos de evidencia (ITR, gates, gestión diaria, documentos) no se pueden sobrescribir ni borrar.
- Las decisiones (DEC) no se editan: se reemplazan por otra decisión.
- El reporte diario emitido queda sellado con huella sha256; corregirlo genera una revisión nueva.
- Un punch solo se cierra verificándolo en campo, y lo verifica una persona distinta de quien lo resolvió.
- Las aprobaciones de gates, firmas y declaraciones solo se registran con su acción; no hay edición directa.

**Límites y comportamientos de datos**
- Las listas de tags, ITRs y punches muestran 50 filas por página.
- La búsqueda por texto de ITRs y punches por tag usa como máximo los 150 tags que coinciden; ⚠ búsquedas muy amplias pueden mostrar resultados incompletos.
- Exportaciones PDF/Excel de reportes: hasta 50.000 filas. ⚠ La exportación completa desde Administración hoy entrega como máximo 1.000 filas por hoja (B-08).
- ⚠ Algunas pantallas de visión global (Mi trabajo, señales, visor P&ID, explorer, preservación y certificados globales) muestran como máximo 1.000 elementos (B-07).
- Un punch cuenta como «abierto» si está en *abierto* o *en curso*.
- Límite de Cat B abiertos por subsistema para pasar un gate: 3 por defecto, configurable por organización (vacío = sin límite). Los Cat C nunca bloquean.
- Control Tower se calcula en vivo en cada carga. En proyectos muy grandes puede tardar o no cargar (B-04).

**Avisos programados**
- Preservación vencida: diario a las 07:00 UTC, un aviso por plan y día.
- Revisión PSSR vencida: diario a las 08:00 UTC.
- Restricciones vencidas: diario a las 08:30 UTC.
- Notificaciones push: cada 5 minutos aproximadamente. ⚠ Si el programador se retrasa, algunos avisos push pueden no enviarse (B-11); las notificaciones de la bandeja de entrada no se pierden.

**Señales IIoT (arranque y desempeño)**
- Los gráficos usan promedios por minuto y solo cuentan las muestras de calidad «buena».
- La foto de parámetros de un evento de arranque toma la muestra más cercana dentro de ±5 minutos; si no hay, el parámetro queda para carga manual.
- Diseño previsto: conservar 90 días de muestras crudas. ⚠ La limpieza automática no está programada en el repositorio (B-12).
- ⚠ Si dos proyectos de la misma organización tienen una señal con el mismo nombre, la ingesta puede asignar la muestra a cualquiera de los dos (B-18).

**Trabajo sin conexión**
- Las respuestas de ITR capturadas sin conexión se sincronizan al volver la red. Si alguien cambió la misma casilla en el servidor, gana la versión con la hora más reciente y el conflicto queda registrado. ⚠ La comparación usa la hora del dispositivo, así que conviene tener los equipos con la hora automática activada (B-16).

**Borrados**
- No se puede borrar un ITR firmado.
- No se puede borrar un tag que tenga punches asociados.
- Borrar un proyecto completo grande puede no completarse por tiempo (B-05); se recomienda archivarlo (estado «completado» o «cancelado») en lugar de borrarlo.
