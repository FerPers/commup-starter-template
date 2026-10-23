-- S10 — Reporte diario y zona horaria (revisión integral 2026-10-19, decisión D12 aprobada 2026-10-20)
--
--   D-05/E-15/G-13/B-29  projects.timezone (IANA, por defecto America/Bogota). «Hoy» y el corte del día de
--                        reportes, relevos, snapshots, vencimientos y fechas selladas (completed_date,
--                        closed_date, next_due_date, used_on, decided_at…) usan la zona del proyecto y no la
--                        de UTC (antes, desde las 19:00 en Colombia todo caía en el día siguiente).
--   D12                  Los reportes ya emitidos NO se recalculan: quedan inmutables (su sha256 no cambia) y
--                        la pantalla y el PDF avisan que su día se cortó en UTC; se corrigen solo con revisión.
--   D-06                 daily_report_data devuelve el total de cada lista recortada a 30 (*_count).
--   B-20                 daily_report_data: «aprobados hoy» parte de las firmas del día (índice nuevo
--                        itr_signatures(signed_at)) y la TEMP TABLE por llamada pasa a un arreglo + CTE.
--   D-29                 el reporte guarda timezone y as_of (momento del cálculo del estado actual).
--   D-27                 los snapshots toman el día local del proyecto (cron 02:00 UTC = 21:00 en Bogotá).
--   D-28                 «Rehacer con IA» en una sola RPC (replace_daily_report_ai_draft).
--   B-26                 evaluación previa del intento de desempeño guardada (evaluation_preview) y
--                        borrada por trigger cuando cambian sus entradas.
--
-- Las funciones de abajo del separador se emiten desde supabase/functions-sql/ (canónicas).

-- ── 1. Zona horaria del proyecto ─────────────────────────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Bogota';
COMMENT ON COLUMN public.projects.timezone IS
  'S10 (D12): zona IANA del proyecto. Define «hoy» y el corte del día en reportes, relevos, snapshots y vencimientos.';

CREATE OR REPLACE FUNCTION public.projects_timezone_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'Zona horaria no válida: %', NEW.timezone USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS projects_timezone_guard ON public.projects;
CREATE TRIGGER projects_timezone_guard BEFORE INSERT OR UPDATE OF timezone ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_timezone_guard();

-- Fecha de hoy en una zona (UTC si llega NULL).
CREATE OR REPLACE FUNCTION public.tz_today(p_tz text)
RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path TO ''
AS $fn$ SELECT (now() AT TIME ZONE COALESCE(p_tz, 'UTC'))::date $fn$;

-- Instante en que empieza el día p_date en la zona p_tz.
CREATE OR REPLACE FUNCTION public.tz_day_start(p_date date, p_tz text)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $fn$ SELECT p_date::timestamp AT TIME ZONE COALESCE(p_tz, 'UTC') $fn$;

-- Zona del proyecto. INVOKER: un miembro la lee por RLS; las DEFINER y service_role la leen siempre.
CREATE OR REPLACE FUNCTION public.project_timezone(p_project_id uuid)
RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path TO ''
AS $fn$ SELECT COALESCE((SELECT timezone FROM public.projects WHERE id = p_project_id), 'UTC') $fn$;

CREATE OR REPLACE FUNCTION public.project_today(p_project_id uuid)
RETURNS date
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path TO ''
AS $fn$ SELECT public.tz_today(public.project_timezone(p_project_id)) $fn$;

REVOKE ALL ON FUNCTION public.projects_timezone_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tz_today(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tz_day_start(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_timezone(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tz_today(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tz_day_start(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_timezone(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_today(uuid) TO authenticated, service_role;

-- ── 2. Índice para «aprobados hoy» (B-20) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_itr_signatures_signed_at ON public.itr_signatures (signed_at);

-- ── 3. Evaluación previa del intento de desempeño (B-26) ─────────────────
ALTER TABLE public.performance_runs ADD COLUMN IF NOT EXISTS evaluation_preview jsonb;
COMMENT ON COLUMN public.performance_runs.evaluation_preview IS
  'S10 (B-26): última evaluación previa calculada por evaluate_performance_run; se borra al cambiar el intento, sus datos o sus perturbaciones.';

CREATE OR REPLACE FUNCTION public.performance_eval_preview_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_new uuid; v_old uuid;
BEGIN
  IF TG_TABLE_NAME = 'performance_runs' THEN
    IF (to_jsonb(NEW) - 'evaluation_preview' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'evaluation_preview' - 'updated_at') THEN
      NEW.evaluation_preview := NULL;
    END IF;
    RETURN NEW;
  END IF;
  -- Sentencias separadas: PL/pgSQL evalúa OLD/NEW aunque estén en una rama CASE no tomada.
  IF TG_OP <> 'DELETE' THEN v_new := NEW.run_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD.run_id; END IF;
  UPDATE performance_runs SET evaluation_preview = NULL
   WHERE evaluation_preview IS NOT NULL AND id IN (v_new, v_old);
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.performance_eval_preview_reset() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS performance_eval_preview_reset ON public.performance_runs;
CREATE TRIGGER performance_eval_preview_reset BEFORE UPDATE ON public.performance_runs
  FOR EACH ROW EXECUTE FUNCTION public.performance_eval_preview_reset();
DROP TRIGGER IF EXISTS performance_eval_preview_reset ON public.performance_run_data;
CREATE TRIGGER performance_eval_preview_reset AFTER INSERT OR UPDATE OR DELETE ON public.performance_run_data
  FOR EACH ROW EXECUTE FUNCTION public.performance_eval_preview_reset();
DROP TRIGGER IF EXISTS performance_eval_preview_reset ON public.performance_disturbances;
CREATE TRIGGER performance_eval_preview_reset AFTER INSERT OR UPDATE OR DELETE ON public.performance_disturbances
  FOR EACH ROW EXECUTE FUNCTION public.performance_eval_preview_reset();

-- ── 4. «Rehacer con IA» atómico (D-28) ───────────────────────────────────
-- Reemplaza las 5 secciones por la propuesta de la IA en una sola transacción (antes: vaciar + llenar en
-- dos RPC; si la segunda fallaba se perdían las ediciones).
CREATE OR REPLACE FUNCTION public.replace_daily_report_ai_draft(p_report_id uuid, p_draft jsonb, p_model text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r daily_reports%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM daily_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'El reporte % ya fue emitido', r.number USING ERRCODE = 'P0001'; END IF;
  IF p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object' THEN RAISE EXCEPTION 'Borrador no válido' USING ERRCODE = '22023'; END IF;
  UPDATE daily_reports SET
    ai_draft = p_draft, ai_model = left(p_model, 60), ai_generated_at = now(),
    summary          = public.mgmt_text(p_draft ->> 'summary', 8000),
    key_events       = public.mgmt_text(p_draft ->> 'key_events', 8000),
    issues           = public.mgmt_text(p_draft ->> 'issues', 8000),
    constraints_text = public.mgmt_text(p_draft ->> 'constraints', 8000),
    next_day_plan    = public.mgmt_text(p_draft ->> 'next_day_plan', 8000),
    updated_by = auth.uid(), updated_at = now()
  WHERE id = p_report_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.replace_daily_report_ai_draft(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_daily_report_ai_draft(uuid, jsonb, text) TO authenticated, service_role;

-- ── 5. Funciones canónicas con el día del proyecto ───────────────────────
CREATE OR REPLACE FUNCTION public.add_document_revision(p_document_id uuid, p_rev text, p_status text, p_issued_on date, p_file_path text, p_file_name text, p_external_url text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d documents%ROWTYPE; v_role text; v_rev text := upper(public.mgmt_text(p_rev, 20)); v_id uuid; v_seq integer;
        v_url text := public.mgmt_text(p_external_url, 1000); v_path text := public.mgmt_text(p_file_path, 500);
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores registran revisiones' USING ERRCODE = '42501';
  END IF;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Indica la revisión' USING ERRCODE = '22023'; END IF;
  IF p_status NOT IN ('draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https://' THEN RAISE EXCEPTION 'El enlace debe ser https' USING ERRCODE = '22023'; END IF;
  IF v_path IS NOT NULL AND (split_part(v_path, '/', 1) <> d.project_id::text OR split_part(v_path, '/', 2) <> d.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'project-documents' AND o.name = v_path)) THEN
    RAISE EXCEPTION 'Archivo no válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND upper(btrim(rev)) = v_rev) THEN
    RAISE EXCEPTION 'La revisión % ya existe', v_rev USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND status = 'draft') THEN
    RAISE EXCEPTION 'Hay una revisión en borrador: emítela o descártala primero' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM document_revisions WHERE document_id = d.id;
  INSERT INTO document_revisions (document_id, project_id, seq, rev, status, issued_on, file_path, file_name, external_url, notes, created_by)
  VALUES (d.id, d.project_id, v_seq, v_rev, p_status, CASE WHEN p_status <> 'draft' THEN COALESCE(p_issued_on, public.project_today(d.project_id)) END,
          v_path, CASE WHEN v_path IS NOT NULL THEN public.mgmt_text(p_file_name, 255) END, v_url, public.mgmt_text(p_notes, 2000), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.document_refresh_current(d.id);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_vendor_report(p_package_id uuid, p_kind text, p_report_date date, p_headcount integer, p_hours numeric, p_activities text, p_issues text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w record; v_id uuid;
BEGIN
  SELECT * INTO w FROM public.vendor_package_for_write(p_package_id, false);
  IF (w.pkg).status <> 'mobilized' THEN RAISE EXCEPTION 'Los reportes se registran con el vendor movilizado' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('daily', 'final') THEN RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023'; END IF;
  IF p_report_date IS NULL OR p_report_date > public.project_today((w.pkg).project_id) THEN RAISE EXCEPTION 'Fecha no válida' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_activities, 8000) IS NULL THEN RAISE EXCEPTION 'Describe las actividades' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'final' AND EXISTS (SELECT 1 FROM vendor_reports WHERE package_id = (w.pkg).id AND kind = 'final') THEN
    RAISE EXCEPTION 'El paquete ya tiene reporte final' USING ERRCODE = '23505';
  END IF;
  INSERT INTO vendor_reports (package_id, project_id, kind, report_date, headcount, hours, activities, issues, issued_by)
  VALUES ((w.pkg).id, (w.pkg).project_id, p_kind, p_report_date, p_headcount, p_hours, public.mgmt_text(p_activities, 8000),
          public.mgmt_text(p_issues, 8000), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_project_forecast(p_project_id uuid)
 RETURNS TABLE(project_id uuid, total_itrs bigint, itrs_approved bigint, itrs_remaining bigint, velocity_per_day numeric, days_to_complete_p50 numeric, eta_p50 date, confidence text, punch_a_open bigint, blockers bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      SUM(ap.total_itrs)       AS total_itrs,
      SUM(ap.itrs_approved)    AS itrs_approved,
      SUM(ap.itrs_remaining)   AS itrs_remaining,
      SUM(ap.punch_a_open)     AS punch_a_open,
      AVG(av.velocity_per_day_30d) AS velocity_per_day
    FROM analytics_subsystem_progress ap
    JOIN analytics_subsystem_velocity av ON av.subsystem_id = ap.subsystem_id
    WHERE ap.project_id = p_project_id
  ),
  calc AS (
    SELECT
      base.total_itrs,
      base.itrs_approved,
      base.itrs_remaining,
      base.punch_a_open,
      base.velocity_per_day,
      CASE
        WHEN base.itrs_remaining = 0 THEN 0
        WHEN COALESCE(base.velocity_per_day, 0) <= 0 THEN NULL
        ELSE ROUND(base.itrs_remaining / base.velocity_per_day, 1)
      END AS days_p50
    FROM base
  )
  SELECT
    p_project_id,
    COALESCE(calc.total_itrs, 0)::bigint,
    COALESCE(calc.itrs_approved, 0)::bigint,
    COALESCE(calc.itrs_remaining, 0)::bigint,
    ROUND(COALESCE(calc.velocity_per_day, 0), 3)::numeric,
    calc.days_p50::numeric,
    CASE WHEN calc.days_p50 IS NULL THEN NULL
         ELSE (public.project_today(p_project_id) + (calc.days_p50 || ' days')::INTERVAL)::DATE END,
    CASE
      WHEN calc.days_p50 IS NULL THEN 'low'
      WHEN calc.velocity_per_day >= 0.5 THEN 'high'
      WHEN calc.velocity_per_day >= 0.1 THEN 'medium'
      ELSE 'low'
    END::text,
    COALESCE(calc.punch_a_open, 0)::bigint,
    COALESCE(calc.punch_a_open, 0)::bigint  -- proxy: Cat A abiertos bloquean MC
  FROM calc;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_punch(p_punch_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  -- S06 (C-11/A-06, D8): cancelar es de supervisor, con motivo, por alguien distinto de quien lo levantó, y queda auditado.
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un supervisor cancela un punch' USING ERRCODE = '42501';
  END IF;
  IF v.raised_by = auth.uid() THEN
    RAISE EXCEPTION 'Lo cancela una persona distinta de quien lo levantó' USING ERRCODE = 'P0001';
  END IF;
  IF v.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'El punch ya está cerrado o cancelado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se cancela (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;

  UPDATE punches SET status = 'cancelled', closed_date = public.project_today(v.project_id) WHERE id = p_punch_id;
  INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Cancelado: ' || v_reason);
  PERFORM public.punch_log(v, 'cancelled', jsonb_build_object('reason', v_reason, 'category', v.category, 'previousStatus', v.status));
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_daily_report_draft(p_project_id uuid, p_date date DEFAULT NULL::date, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_proj projects%ROWTYPE; v_id uuid; v_status text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S10 (D-05, D12): «hoy» es el del proyecto (projects.timezone), no el de UTC.
  p_date := COALESCE(p_date, public.project_today(p_project_id));
  IF p_date > public.project_today(p_project_id) + 1 THEN RAISE EXCEPTION 'Fecha de reporte no válida' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;
  PERFORM pg_advisory_xact_lock(hashtext('daily_reports:' || p_project_id::text || ':' || p_date::text));

  SELECT id, status INTO v_id, v_status FROM daily_reports
   WHERE project_id = p_project_id AND report_date = p_date ORDER BY revision DESC LIMIT 1;
  IF v_id IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'El reporte del % ya fue emitido: crea una revisión para corregirlo', p_date USING ERRCODE = 'P0001';
  END IF;
  IF v_id IS NOT NULL THEN
    UPDATE daily_reports SET area_id = p_area_id, data = public.daily_report_data(p_project_id, p_date, p_area_id), data_at = now(),
           updated_by = auth.uid(), updated_at = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO daily_reports (org_id, project_id, report_date, revision, number, area_id, data, created_by, updated_by)
  VALUES (v_proj.org_id, p_project_id, p_date, 0, 'RD-' || v_proj.code || '-' || to_char(p_date, 'YYYYMMDD'), p_area_id,
          public.daily_report_data(p_project_id, p_date, p_area_id), auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.daily_report_data(p_project_id uuid, p_date date DEFAULT NULL::date, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_proj projects%ROWTYPE; v_from timestamptz; v_to timestamptz; v_sys uuid[];
  v_now numeric; v_itr bigint; v_prev record; v_gapp integer; v_gtot integer; v_out jsonb;
BEGIN
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id;
  IF v_proj.id IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;
  -- S10 (D-05/E-15, D12): el día del reporte se corta en la zona del proyecto, no en UTC.
  p_date := COALESCE(p_date, public.tz_today(v_proj.timezone));
  v_from := public.tz_day_start(p_date, v_proj.timezone);
  v_to := public.tz_day_start(p_date + 1, v_proj.timezone);
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF p_area_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM areas WHERE id = p_area_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El área no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;

  -- S10 (B-20): sistemas del alcance en un arreglo (antes una TEMP TABLE por llamada).
  v_sys := ARRAY(SELECT s.id FROM systems s WHERE s.project_id = p_project_id AND (p_area_id IS NULL OR s.area_id = p_area_id));

  -- Avance ponderado actual vs último snapshot previo.
  SELECT COALESCE(SUM(pp.weighted_pct * pp.itr_total), 0), COALESCE(SUM(pp.itr_total), 0), COALESCE(SUM(pp.gates_approved), 0), COALESCE(SUM(pp.gates_total), 0)
    INTO v_now, v_itr, v_gapp, v_gtot
  FROM public.compute_project_progress(p_project_id) pp WHERE pp.system_id = ANY (v_sys);
  SELECT NULL::date AS snapshot_date, NULL::numeric AS weighted_pct INTO v_prev;
  IF p_area_id IS NULL THEN
    SELECT snapshot_date, weighted_pct INTO v_prev FROM mgmt_kpi_snapshots
     WHERE project_id = p_project_id AND snapshot_date < p_date ORDER BY snapshot_date DESC LIMIT 1;
  END IF;

  WITH _dr_sys AS MATERIALIZED (SELECT s.id, s.code FROM systems s WHERE s.id = ANY (v_sys))
  SELECT jsonb_build_object(
    'date', p_date,
    -- S10 (D12/D-29): zona con la que se cortó el día y momento del cálculo. Avance, gates en regresión,
    -- abiertos y vencidos son el estado al generar (no se reconstruyen para fechas pasadas).
    'timezone', v_proj.timezone, 'as_of', now(),
    'project', jsonb_build_object('code', v_proj.code, 'name', v_proj.name),
    'area', (SELECT jsonb_build_object('code', a.code, 'name', a.name) FROM areas a WHERE a.id = p_area_id),
    'progress', jsonb_build_object(
      'weighted_pct', CASE WHEN v_itr > 0 THEN round(v_now / v_itr, 4) ELSE 0 END,
      'prev_pct', v_prev.weighted_pct, 'prev_date', v_prev.snapshot_date,
      'gates_approved', v_gapp, 'gates_total', v_gtot),
    'itrs', jsonb_build_object(
      'completed_today', (SELECT COUNT(*) FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                           WHERE i.project_id = p_project_id AND i.completed_date = p_date),
      -- S10 (B-20): parte de las firmas del día (índice itr_signatures.signed_at) y no de todos los ITR aprobados.
      -- Aprobado hoy = aprobado y sin firmas posteriores al día. S10 (D-06): total aparte de la lista recortada.
      'approved_today_count', (SELECT COUNT(*) FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
          WHERE i.id IN (SELECT sg.itr_id FROM itr_signatures sg WHERE sg.signed_at >= v_from AND sg.signed_at < v_to)
            AND i.project_id = p_project_id AND i.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = i.id AND sg.signed_at >= v_to)),
      'approved_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'system', x ->> 'number') FROM (
          SELECT jsonb_build_object('number', i.itr_number, 'tag', t.tag_number, 'system', ds.code) AS x
          FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
          LEFT JOIN tags t ON t.id = i.tag_id
          WHERE i.id IN (SELECT sg.itr_id FROM itr_signatures sg WHERE sg.signed_at >= v_from AND sg.signed_at < v_to)
            AND i.project_id = p_project_id AND i.status = 'approved'
            AND NOT EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = i.id AND sg.signed_at >= v_to)
          ORDER BY ds.code, i.itr_number LIMIT 30) q), '[]'::jsonb),
      'in_progress', (SELECT COUNT(*) FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                       WHERE i.project_id = p_project_id AND i.status = 'in_progress')),
    'punches', jsonb_build_object(
      'raised_today_count', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
          WHERE p.project_id = p_project_id AND p.created_at >= v_from AND p.created_at < v_to),
      'raised_today', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', p.punch_number, 'category', p.category, 'description', left(p.description, 160),
                                    'tag', t.tag_number, 'system', ds.code) AS x
          FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
          LEFT JOIN tags t ON t.id = p.tag_id
          WHERE p.project_id = p_project_id AND p.created_at >= v_from AND p.created_at < v_to
          ORDER BY p.category, p.punch_number LIMIT 30) q), '[]'::jsonb),
      'closed_today', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                        WHERE p.project_id = p_project_id AND p.closed_date = p_date),
      'open_a', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                  WHERE p.project_id = p_project_id AND p.category = 'A' AND p.status IN ('open', 'in_progress')),
      'open_b', (SELECT COUNT(*) FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id JOIN _dr_sys ds ON ds.id = ss.system_id
                  WHERE p.project_id = p_project_id AND p.category = 'B' AND p.status IN ('open', 'in_progress'))),
    'gates', jsonb_build_object(
      'approved_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('system', ds.code, 'gate', rg.code, 'status', a.status) ORDER BY ds.code, rg.order_index)
          FROM system_gate_approvals a JOIN _dr_sys ds ON ds.id = a.system_id JOIN readiness_gates rg ON rg.id = a.gate_id
          WHERE a.project_id = p_project_id AND a.revoked_at IS NULL AND a.approved_at >= v_from AND a.approved_at < v_to), '[]'::jsonb),
      'regressed', COALESCE((SELECT jsonb_agg(jsonb_build_object('system', pg.system_code, 'gate', g ->> 'code'))
          FROM public.compute_project_gates(p_project_id) pg JOIN _dr_sys ds ON ds.id = pg.system_id,
               jsonb_array_elements(pg.gates) g
          WHERE g ->> 'status' = 'regressed'), '[]'::jsonb)),
    'constraints', jsonb_build_object(
      'open_by_level', (SELECT jsonb_build_object(
            '1', COUNT(*) FILTER (WHERE escalation_level = 1), '2', COUNT(*) FILTER (WHERE escalation_level = 2),
            '3', COUNT(*) FILTER (WHERE escalation_level = 3), '4', COUNT(*) FILTER (WHERE escalation_level = 4))
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id WHERE c.project_id = p_project_id AND c.status = 'open'),
      'overdue', (SELECT COUNT(*) FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
                   WHERE c.project_id = p_project_id AND c.status = 'open' AND c.need_date < p_date),
      'new_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('number', c.number, 'title', c.title, 'system', ds.code, 'level', c.escalation_level, 'need_date', c.need_date) ORDER BY c.number)
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.created_at >= v_from AND c.created_at < v_to), '[]'::jsonb),
      'escalated_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('number', c.number, 'title', c.title, 'system', ds.code, 'from', e.from_value, 'to', e.to_value, 'reason', e.comment) ORDER BY c.number)
          FROM mgmt_events e JOIN project_constraints c ON c.id = e.entity_id JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE e.project_id = p_project_id AND e.entity_kind = 'constraint' AND e.action = 'escalated' AND e.created_at >= v_from AND e.created_at < v_to), '[]'::jsonb),
      'open_high_count', (SELECT COUNT(*) FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.status = 'open' AND (c.escalation_level >= 3 OR c.need_date < p_date)),
      'open_high', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', c.number, 'title', c.title, 'system', ds.code, 'level', c.escalation_level, 'need_date', c.need_date,
                                    'impact', c.impact_kind, 'recovery', left(c.recovery_plan, 200)) AS x
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.status = 'open' AND (c.escalation_level >= 3 OR c.need_date < p_date)
          ORDER BY c.escalation_level DESC, c.need_date LIMIT 30) q), '[]'::jsonb)),
    'actions', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress')
                AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))),
      'verified_today', (SELECT COUNT(*) FROM actions a WHERE a.project_id = p_project_id AND a.verified_at >= v_from AND a.verified_at < v_to
                          AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))),
      'overdue_count', (SELECT COUNT(*) FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date < p_date
                         AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))),
      'overdue', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', a.number, 'title', a.title, 'due_date', a.due_date, 'priority', a.priority,
                                    'system', (SELECT code FROM systems WHERE id = a.system_id)) AS x
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date < p_date
            AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))
          ORDER BY a.due_date, a.number LIMIT 30) q), '[]'::jsonb)),
    'tqs', (SELECT jsonb_build_object(
          'issued_today', COUNT(*) FILTER (WHERE issued_at >= v_from AND issued_at < v_to),
          'answered_today', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to),
          'overdue', COUNT(*) FILTER (WHERE status = 'issued' AND required_by < p_date),
          'design_changes_today', COUNT(*) FILTER (WHERE design_change AND responded_at >= v_from AND responded_at < v_to))
        FROM technical_queries q WHERE q.project_id = p_project_id AND (p_area_id IS NULL OR q.system_id IN (SELECT id FROM _dr_sys))),
    'registers_in_field_count', (SELECT COUNT(*) FROM register_items ri WHERE ri.project_id = p_project_id AND ri.status IN ('active', 'removed')
          AND (p_area_id IS NULL OR ri.system_id IN (SELECT id FROM _dr_sys))),
    'registers_in_field', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title,
                                    'system', (SELECT code FROM systems WHERE id = ri.system_id)) AS x
          FROM register_items ri WHERE ri.project_id = p_project_id AND ri.status IN ('active', 'removed')
            AND (p_area_id IS NULL OR ri.system_id IN (SELECT id FROM _dr_sys))
          ORDER BY ri.kind, ri.number LIMIT 30) q), '[]'::jsonb),
    'lookahead_7d', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'date', x ->> 'ref') FROM (
          SELECT jsonb_build_object('kind', 'gate', 'ref', rg.code, 'title', rg.name, 'system', ds.code, 'date', gp.commitment_date) AS x
          FROM system_gate_plans gp JOIN _dr_sys ds ON ds.id = gp.system_id JOIN readiness_gates rg ON rg.id = gp.gate_id
          WHERE gp.project_id = p_project_id AND gp.commitment_date BETWEEN p_date AND p_date + 7
            AND NOT EXISTS (SELECT 1 FROM system_gate_approvals a WHERE a.system_id = gp.system_id AND a.gate_id = gp.gate_id AND a.revoked_at IS NULL)
          UNION ALL
          SELECT jsonb_build_object('kind', 'constraint', 'ref', c.number, 'title', c.title, 'system', ds.code, 'date', c.need_date)
          FROM project_constraints c JOIN _dr_sys ds ON ds.id = c.system_id
          WHERE c.project_id = p_project_id AND c.status = 'open' AND c.need_date BETWEEN p_date AND p_date + 7
          UNION ALL
          SELECT jsonb_build_object('kind', 'action', 'ref', a.number, 'title', a.title, 'system', (SELECT code FROM systems WHERE id = a.system_id), 'date', a.due_date)
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date BETWEEN p_date AND p_date + 7
            AND (p_area_id IS NULL OR a.system_id IN (SELECT id FROM _dr_sys))
          LIMIT 60) q), '[]'::jsonb),
    -- F6-S2: hitos y eventos de arranque del día (no anulados), con sus parámetros principales.
    'startup_events_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at') FROM (
          SELECT jsonb_build_object('number', ev.number, 'kind', ev.kind, 'code', COALESCE(ev.milestone, ev.category), 'title', ev.title,
                   'system', ds.code, 'occurred_at', ev.occurred_at, 'status', ev.status,
                   'params', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', pr.label, 'value', COALESCE(pr.value::text, pr.value_text), 'unit', pr.unit))
                                       FROM (SELECT * FROM startup_event_params WHERE event_id = ev.id AND source <> 'iiot_missing' ORDER BY created_at LIMIT 4) pr), '[]'::jsonb)) AS x
          FROM startup_events ev JOIN _dr_sys ds ON ds.id = ev.system_id
          WHERE ev.project_id = p_project_id AND ev.status <> 'voided' AND ev.occurred_at >= v_from AND ev.occurred_at < v_to
          ORDER BY ev.occurred_at LIMIT 30) q), '[]'::jsonb),
    -- F7: intentos de prueba de desempeño cerrados o con resultado del día, y certificados aceptados.
    'performance_today', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> 'at') FROM (
          SELECT jsonb_build_object('kind', 'run', 'number', pr.number, 'title', pt.title, 'system', ds.code,
                   'status', pr.status, 'result', pr.result, 'early_close', pr.early_close, 'at', COALESCE(pr.result_at, pr.closed_at)) AS x
          FROM performance_runs pr JOIN performance_tests pt ON pt.id = pr.test_id JOIN _dr_sys ds ON ds.id = pt.primary_system_id
          WHERE pr.project_id = p_project_id
            AND ((pr.closed_at >= v_from AND pr.closed_at < v_to) OR (pr.result_at >= v_from AND pr.result_at < v_to))
          UNION ALL
          SELECT jsonb_build_object('kind', 'certificate', 'number', pc.number, 'title', pt.title, 'system', ds.code,
                   'status', pc.status, 'at', GREATEST(pc.operations_signed_at, pc.client_signed_at))
          FROM performance_certificates pc JOIN performance_tests pt ON pt.id = pc.test_id JOIN _dr_sys ds ON ds.id = pc.system_id
          WHERE pc.project_id = p_project_id AND pc.status = 'accepted'
            AND GREATEST(pc.operations_signed_at, pc.client_signed_at) >= v_from AND GREATEST(pc.operations_signed_at, pc.client_signed_at) < v_to
          LIMIT 30) q), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.evaluate_performance_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF r.status = 'evaluated' THEN RETURN r.evaluation; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se evalúa un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  -- S10 (B-26): la evaluación previa se guarda al calcularla; los triggers performance_eval_preview_reset la
  -- borran si cambian el intento, sus datos o sus perturbaciones. Registrar el resultado recalcula siempre.
  IF r.evaluation_preview IS NOT NULL THEN RETURN r.evaluation_preview; END IF;
  r.evaluation_preview := public.performance_compute_evaluation(r.id);
  UPDATE performance_runs SET evaluation_preview = r.evaluation_preview WHERE id = r.id;
  RETURN r.evaluation_preview;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_preservation_record(p_record_id uuid, p_result public.preservation_result, p_remarks text DEFAULT NULL::text, p_punch_category public.punch_category DEFAULT NULL::public.punch_category)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec preservation_records; v_plan preservation_plans; v_tag tags; v_proc preservation_procedures;
  v_org uuid; v_remarks text := NULLIF(btrim(COALESCE(p_remarks, '')), '');
  v_punch uuid; v_number text;
BEGIN
  -- S08 (C-05/C-06/I-03, D10): finalizar es lo que cuenta. En una transacción: cierra el registro, avanza la
  -- próxima fecha del plan (con cualquier resultado) y, si el resultado es NOK, levanta el punch (obligatorio).
  SELECT * INTO v_rec FROM preservation_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_plan FROM preservation_plans WHERE id = v_rec.plan_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_rec.status <> 'open' THEN RAISE EXCEPTION 'Este registro ya fue finalizado' USING ERRCODE = 'P0001'; END IF;
  IF p_result = 'nok' AND p_punch_category IS NULL THEN
    RAISE EXCEPTION 'Un resultado NOK genera un punch: indica su categoría' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tag FROM tags WHERE id = v_plan.tag_id;
  SELECT * INTO v_proc FROM preservation_procedures WHERE id = v_plan.procedure_id;
  SELECT org_id INTO v_org FROM projects WHERE id = v_plan.project_id;

  IF p_result = 'nok' THEN
    INSERT INTO punches (project_id, subsystem_id, tag_id, preservation_record_id, category, description, discipline_id,
                         raised_by, punch_number, status, priority, created_via)
    VALUES (v_plan.project_id, v_tag.subsystem_id, v_tag.id, p_record_id, p_punch_category,
            '[Preservación NOK] ' || COALESCE(v_proc.code, 'PRES') || ' en ' || v_tag.tag_number
              || COALESCE(' — ' || NULLIF(v_proc.title, ''), '') || COALESCE(E'\n' || v_remarks, ''),
            v_tag.discipline_id, auth.uid(), '', 'open',
            CASE WHEN p_punch_category = 'A' THEN 'critical'::punch_priority ELSE 'major'::punch_priority END, 'preservation')
    RETURNING id, punch_number INTO v_punch, v_number;
  END IF;

  UPDATE preservation_records SET result = p_result, remarks = v_remarks, status = 'finalized', performed_by = auth.uid(),
    performed_at = now(), punch_raised = v_punch IS NOT NULL, punch_id = v_punch
  WHERE id = p_record_id;
  -- S10 (B-29): «hoy» del proyecto, no de UTC.
  UPDATE preservation_plans SET last_performed_date = public.project_today(v_plan.project_id),
    next_due_date = public.project_today(v_plan.project_id) + COALESCE(v_proc.interval_days, 0)
  WHERE id = v_plan.id;

  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'preservation_record', p_record_id, 'finalized',
          jsonb_build_object('planId', v_plan.id, 'tagId', v_tag.id, 'result', p_result, 'punchNumber', v_number,
                             'nextDueDate', public.project_today(v_plan.project_id) + COALESCE(v_proc.interval_days, 0)));
  RETURN jsonb_build_object('punch_number', v_number, 'next_due_date', public.project_today(v_plan.project_id) + COALESCE(v_proc.interval_days, 0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.handover_snapshot(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'registers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ri.id, 'number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title,
                                    'system', (SELECT code FROM systems WHERE id = ri.system_id)) ORDER BY ri.kind, ri.number)
                          FROM register_items ri WHERE ri.project_id = p_project_id AND ri.status IN ('active', 'removed')), '[]'::jsonb),
    'itrs_in_progress', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', i.id, 'number', i.itr_number, 'tag', t.tag_number, 'progress', i.progress_pct) AS x
          FROM itrs i LEFT JOIN tags t ON t.id = i.tag_id
          WHERE i.project_id = p_project_id AND i.status = 'in_progress' ORDER BY i.itr_number LIMIT 50) q), '[]'::jsonb),
    'itrs_in_progress_total', (SELECT COUNT(*) FROM itrs WHERE project_id = p_project_id AND status = 'in_progress'),
    'punches_a', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', p.id, 'number', p.punch_number, 'description', left(p.description, 160), 'tag', t.tag_number) AS x
          FROM punches p LEFT JOIN tags t ON t.id = p.tag_id
          WHERE p.project_id = p_project_id AND p.category = 'A' AND p.status IN ('open', 'in_progress') ORDER BY p.punch_number LIMIT 50) q), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'title', c.title, 'level', c.escalation_level,
                                    'need_date', c.need_date, 'system', s.code) ORDER BY c.escalation_level DESC, c.need_date)
                          FROM project_constraints c JOIN systems s ON s.id = c.system_id
                          WHERE c.project_id = p_project_id AND c.status = 'open'), '[]'::jsonb),
    'actions_overdue', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', a.id, 'number', a.number, 'title', a.title, 'due_date', a.due_date) AS x
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date < public.project_today(p_project_id)
          ORDER BY a.due_date LIMIT 50) q), '[]'::jsonb),
    'taken_at', now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.issue_document_revision(p_revision_id uuid, p_status text, p_issued_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r document_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM document_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se emite o descarta un borrador' USING ERRCODE = 'P0001'; END IF;
  IF p_status IS NULL THEN
    DELETE FROM document_revisions WHERE id = r.id;
  ELSIF p_status IN ('ifr', 'ifa', 'ifc', 'as_built', 'final') THEN
    UPDATE document_revisions SET status = p_status, issued_on = COALESCE(p_issued_on, public.project_today(r.project_id)) WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.document_refresh_current(r.document_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.itr_test_equipment_fill()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; eq public.test_equipment; v_role text;
BEGIN
  SELECT i.project_id, p.org_id INTO v_project, v_org FROM itrs i JOIN projects p ON p.id = i.project_id WHERE i.id = NEW.itr_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'ITR no encontrado'; END IF;
  SELECT * INTO eq FROM test_equipment WHERE id = NEW.equipment_id;
  IF NOT FOUND OR eq.org_id <> v_org THEN RAISE EXCEPTION 'El equipo no pertenece a la organización del proyecto'; END IF;
  IF NOT eq.is_active THEN RAISE EXCEPTION 'El equipo % está dado de baja', eq.code; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_role FROM org_members WHERE org_id = v_org AND user_id = auth.uid();
    IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  END IF;
  NEW.project_id := v_project;
  NEW.used_on := public.project_today(v_project);
  NEW.calibrated_on := eq.calibrated_on;
  NEW.calibration_due := eq.calibration_due;
  NEW.certificate_number := eq.certificate_number;
  NEW.snapshot := jsonb_build_object('code', eq.code, 'kind', eq.kind, 'make', eq.make, 'model', eq.model,
    'serial_number', eq.serial_number, 'owner_company', eq.owner_company, 'certificate_path', eq.certificate_path);
  NEW.added_by := auth.uid();
  NEW.added_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_work_counts(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with proj as (
    -- S10 (G-13/D-05): «hoy» de cada proyecto según projects.timezone
    select id, public.tz_today(timezone) as today from projects where org_id = p_org_id
  ),
  me as (
    select role::text as role from org_members where org_id = p_org_id and user_id = auth.uid()
  )
  select jsonb_build_object(
    'itrs_execute', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role = 'executor'
        and i.status <> 'approved'
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role = 'executor')
        and i.project_id in (select id from proj)
    ),
    'itrs_review', (
      select count(distinct i.id)
      from itr_assignments a
      join itrs i on i.id = a.itr_id
      where a.user_id = auth.uid()
        and a.role in ('supervisor', 'client')
        and i.status = 'completed'
        and i.project_id in (select id from proj)
        and not exists (
          select 1 from itr_signatures s where s.itr_id = i.id and s.role = a.role
        )
        -- S04 (C-17, D4/D6): solo un rol que el ITR exige, con las firmas requeridas anteriores ya puestas,
        -- y si no firmé ya otro rol del mismo ITR. Espejo de isMyTurnToSign (src/lib/my-work/queues.ts).
        and a.role::text = any (i.required_signatures)
        and not exists (
          select 1 from unnest(i.required_signatures) r
          where array_position(array['executor', 'supervisor', 'client'], r) < array_position(array['executor', 'supervisor', 'client'], a.role::text)
            and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.role::text = r)
        )
        and not exists (select 1 from itr_signatures s where s.itr_id = i.id and s.user_id = auth.uid())
    ),
    'punches', (
      select count(*)
      from punches p
      where p.assigned_to = auth.uid()
        and p.status in ('open', 'in_progress')
        and p.resolved_at is null
        and p.project_id in (select id from proj)
    ),
    'punches_verify', (
      select count(*)
      from punches p
      where p.status = 'in_progress'
        and p.resolved_at is not null
        and p.resolved_by is distinct from auth.uid()
        and p.project_id in (select id from proj)
        -- S06 (C-44): quien lo levantó, o un supervisor; antes contaba todos los de la org para todos.
        and (p.raised_by = auth.uid() or (select role from me) in ('owner', 'admin', 'architect', 'leader'))
    ),
    'punches_review', (
      select case when (select role from me) in ('owner', 'admin', 'architect', 'leader') then (
        select count(*)
        from punches p
        where p.status in ('open', 'in_progress')
          and p.category_reviewed_at is null
          and p.raised_by is distinct from auth.uid()
          and p.project_id in (select id from proj)
      ) else 0 end
    ),
    'plan_items', (
      select count(*)
      from work_plan_items wi
      join work_plans wp on wp.id = wi.work_plan_id
      where wi.assigned_to = auth.uid()
        and wi.status in ('not_started', 'in_progress')
        and wp.status in ('published', 'in_progress')
        and wp.plan_date <= (select today from proj where proj.id = wp.project_id)
    ),
    'signatures', (
      -- S06 (C-44): solo para quien firma certificados (canSignCertificates en src/lib/my-work/queues.ts).
      select case when (select role from me) in ('owner', 'admin', 'architect') then count(*) else 0 end
      from certificates c
      where c.status = 'issued'
        and c.project_id in (select id from proj)
        and not exists (
          select 1 from certificate_signatures cs
          where cs.certificate_id = c.id and cs.role = 'completion'
        )
    ),
    'preservation_overdue', (
      select count(*)
      from preservation_plans pp
      join proj on proj.id = pp.project_id
      where public.preservation_is_overdue(pp.status, pp.next_due_date, proj.today)
    ),
    'actions_mine', (
      select count(*)
      from actions a
      where a.owner_id = auth.uid()
        and a.status in ('open', 'in_progress')
        and a.project_id in (select id from proj)
    ),
    'actions_verify', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from actions a
        where a.status = 'done'
          and a.done_by is distinct from auth.uid()
          and a.project_id in (select id from proj)
      ) else 0 end
    ),
    'constraints_mine', (
      select count(*)
      from project_constraints c
      where c.owner_id = auth.uid()
        and c.status = 'open'
        and c.project_id in (select id from proj)
    ),
    'handovers_to_receive', (
      select case when (select role from me) <> 'client' then (
        select count(*)
        from shift_handovers h
        where h.status = 'handed_over'
          and h.handed_by is distinct from auth.uid()
          and h.project_id in (select id from proj)
      ) else 0 end
    ),
    'holds_to_release', (
      select count(*)
      from procedure_run_steps rs
      join procedure_steps st on st.id = rs.step_id
      join procedure_runs r on r.id = rs.run_id
      where rs.status = 'at_hold'
        and r.status in ('at_hold', 'stopped')
        and rs.done_by is distinct from auth.uid()
        and (select role from me) = any (public.hold_release_roles(st.hold_capacity))
        and rs.project_id in (select id from proj)
    ),
    'lineup_to_verify', (
      select count(*)
      from lineup_items li
      join lineup_sheets s on s.id = li.sheet_id
      where li.is_critical and li.set_at is not null and li.verified_at is null
        and li.found_position = li.required_position
        and li.set_by is distinct from auth.uid()
        and s.status in ('issued', 'in_progress')
        and li.project_id in (select id from proj)
    ),
    'milestones_to_witness', (
      select count(*)
      from startup_events ev
      where ev.status = 'pending_witness'
        and ev.recorded_by is distinct from auth.uid()
        and (select role from me) = any (public.hold_release_roles(ev.witness_capacity))
        and ev.project_id in (select id from proj)
    ),
    'transfers_to_sign', (
      select count(*)
      from ownership_transfers tr
      where tr.status = 'pending_signatures'
        and tr.project_id in (select id from proj)
        and auth.uid() is distinct from tr.commissioning_signed_by
        and auth.uid() is distinct from tr.operations_signed_by
        and ((tr.commissioning_signed_by is null and (select role from me) in ('owner', 'admin', 'architect', 'leader'))
          or (tr.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations'))))
    ),
    'performance_to_decide', (
      select count(*)
      from performance_runs pr
      where pr.status = 'closed'
        and (select role from me) in ('owner', 'admin', 'architect', 'leader')
        and pr.project_id in (select id from proj)
    ),
    'performance_to_sign', (
      select count(*)
      from performance_certificates pc
      where pc.status = 'pending_signatures'
        and pc.project_id in (select id from proj)
        and auth.uid() is distinct from pc.commissioning_signed_by
        and auth.uid() is distinct from pc.operations_signed_by
        and auth.uid() is distinct from pc.client_signed_by
        and ((pc.operations_signed_by is null and (select role from me) = any (public.hold_release_roles('operations')))
          or (pc.client_signed_by is null and (select role from me) = 'client'))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.open_shift_handover(p_project_id uuid, p_shift_label text DEFAULT 'day'::text, p_shift_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  p_shift_date := COALESCE(p_shift_date, public.project_today(p_project_id));  -- S10 (D-05)
  IF p_shift_date > public.project_today(p_project_id) + 1 THEN RAISE EXCEPTION 'Fecha de turno no válida' USING ERRCODE = '22023'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  PERFORM pg_advisory_xact_lock(hashtext('shift_handovers:' || p_project_id::text));
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM shift_handovers WHERE project_id = p_project_id;
  INSERT INTO shift_handovers (org_id, project_id, seq, number, shift_date, shift_label, snapshot, opened_by)
  VALUES (v_org, p_project_id, v_seq, 'REL-' || lpad(v_seq::text, 4, '0'), p_shift_date, COALESCE(p_shift_label, 'day'),
          public.handover_snapshot(p_project_id), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.person_system_level(p_person_id uuid, p_system_id uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT CASE WHEN cr.expires_at IS NOT NULL AND cr.expires_at < public.project_today(cr.project_id) THEN 0 ELSE cr.level END
    FROM competency_records cr WHERE cr.person_id = p_person_id AND cr.system_id = p_system_id
    ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1), 0)::smallint;
$function$;

CREATE OR REPLACE FUNCTION public.preservation_due_counts(p_project_ids uuid[], p_days integer DEFAULT 7)
 RETURNS TABLE(project_id uuid, active bigint, overdue bigint, due_soon bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT pp.project_id,
         count(*) FILTER (WHERE pp.status = 'active'),
         count(*) FILTER (WHERE public.preservation_is_overdue(pp.status, pp.next_due_date, public.tz_today(pr.timezone))),
         count(*) FILTER (WHERE pp.status = 'active' AND pp.next_due_date >= public.tz_today(pr.timezone)
                            AND pp.next_due_date <= public.tz_today(pr.timezone) + greatest(p_days, 0))
  FROM public.preservation_plans pp
  JOIN public.projects pr ON pr.id = pp.project_id  -- S10 (D-05): «hoy» de cada proyecto
  WHERE pp.project_id = ANY (p_project_ids)
  GROUP BY pp.project_id
$function$;

CREATE OR REPLACE FUNCTION public.record_competency(p_person_id uuid, p_system_id uuid, p_level integer, p_evidence_kind text DEFAULT 'ojt'::text, p_evidence text DEFAULT NULL::text, p_assessed_at date DEFAULT NULL::date, p_expires_at date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE pe ops_personnel%ROWTYPE; v_role text; v_trainer boolean; v_id uuid;
BEGIN
  SELECT * INTO pe FROM ops_personnel WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Persona no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(pe.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM systems WHERE id = p_system_id AND project_id = pe.project_id) THEN
    RAISE EXCEPTION 'El sistema no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF pe.user_id = auth.uid() THEN RAISE EXCEPTION 'Nadie evalúa su propia competencia' USING ERRCODE = '42501'; END IF;
  v_trainer := EXISTS (SELECT 1 FROM ops_personnel t WHERE t.project_id = pe.project_id AND t.user_id = auth.uid() AND t.active
                        AND public.person_system_level(t.id, p_system_id) = 4);
  IF NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR v_trainer) THEN
    RAISE EXCEPTION 'Evalúa un líder o una persona de nivel 4 en el sistema' USING ERRCODE = '42501';
  END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 0 AND 4 THEN RAISE EXCEPTION 'Nivel no válido (0–4)' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_assessed_at, public.project_today(pe.project_id)) > public.project_today(pe.project_id) THEN RAISE EXCEPTION 'La fecha de evaluación no puede ser futura' USING ERRCODE = '22023'; END IF;
  INSERT INTO competency_records (org_id, project_id, person_id, system_id, level, evidence_kind, evidence, assessed_by, assessed_at, expires_at)
  VALUES (pe.org_id, pe.project_id, pe.id, p_system_id, p_level, COALESCE(p_evidence_kind, 'ojt'), public.mgmt_text(p_evidence, 2000),
          auth.uid(), COALESCE(p_assessed_at, public.project_today(pe.project_id)), p_expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_decision(p_project_id uuid, p_title text, p_decision text, p_context text DEFAULT NULL::text, p_rationale text DEFAULT NULL::text, p_decided_by uuid DEFAULT NULL::uuid, p_attendees text DEFAULT NULL::text, p_decided_at date DEFAULT NULL::date, p_source_kind text DEFAULT 'other'::text, p_source_id uuid DEFAULT NULL::uuid, p_source_ref text DEFAULT NULL::text, p_system_id uuid DEFAULT NULL::uuid, p_supersedes_id uuid DEFAULT NULL::uuid, p_supersede_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_old decisions%ROWTYPE; v_reason text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_decision, 8000) IS NULL THEN
    RAISE EXCEPTION 'Título y decisión son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_decided_at IS NOT NULL AND p_decided_at > public.project_today(p_project_id) THEN
    RAISE EXCEPTION 'La fecha de la decisión no puede ser futura' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, p_decided_by);
  IF COALESCE(p_source_kind, 'other') IN ('tq', 'constraint') THEN
    PERFORM public.mgmt_check_source(p_project_id, p_source_kind, p_source_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;

  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_old FROM decisions WHERE id = p_supersedes_id AND project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La decisión a reemplazar no pertenece al proyecto' USING ERRCODE = 'P0002'; END IF;
    IF v_old.status <> 'active' THEN RAISE EXCEPTION 'La decisión % ya fue reemplazada', v_old.number USING ERRCODE = 'P0001'; END IF;
    v_reason := public.mgmt_text(p_supersede_reason, 2000);
    IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica por qué se reemplaza la decisión' USING ERRCODE = '22023'; END IF;
  END IF;

  v_seq := public.mgmt_next_seq('decisions', p_project_id);
  INSERT INTO decisions (org_id, project_id, seq, number, title, context, decision, rationale, decided_by, attendees,
                         decided_at, source_kind, source_id, source_ref, system_id, recorded_by)
  VALUES (v_org, p_project_id, v_seq, 'DEC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(p_title, 200),
          public.mgmt_text(p_context, 8000), public.mgmt_text(p_decision, 8000), public.mgmt_text(p_rationale, 8000),
          COALESCE(p_decided_by, auth.uid()), public.mgmt_text(p_attendees, 2000), COALESCE(p_decided_at, public.project_today(p_project_id)),
          COALESCE(p_source_kind, 'other'), p_source_id, public.mgmt_text(p_source_ref, 200), p_system_id, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, p_project_id, 'decision', v_id, 'recorded', NULL, 'active');

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE decisions SET status = 'superseded', superseded_by = v_id, superseded_at = now(), supersede_reason = v_reason
     WHERE id = p_supersedes_id;
    PERFORM public.mgmt_log(v_org, p_project_id, 'decision', p_supersedes_id, 'superseded', 'active', 'superseded', v_reason);
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_vendor_activity_result(p_activity_id uuid, p_result text, p_performed_on date, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a vendor_activities%ROWTYPE; w record;
BEGIN
  SELECT * INTO a FROM vendor_activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actividad no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO w FROM public.vendor_package_for_write(a.package_id, true);
  IF a.result <> 'pending' THEN RAISE EXCEPTION 'La actividad ya tiene resultado' USING ERRCODE = 'P0001'; END IF;
  IF p_result NOT IN ('passed', 'passed_with_findings', 'failed') THEN RAISE EXCEPTION 'Resultado no válido' USING ERRCODE = '22023'; END IF;
  IF p_performed_on IS NULL OR p_performed_on > public.project_today((w.pkg).project_id) THEN RAISE EXCEPTION 'Fecha de ejecución no válida' USING ERRCODE = '22023'; END IF;
  IF p_result <> 'passed' AND NOT EXISTS (SELECT 1 FROM vendor_findings WHERE activity_id = a.id) THEN
    RAISE EXCEPTION 'Registra los hallazgos antes del resultado' USING ERRCODE = 'P0001';
  END IF;
  UPDATE vendor_activities SET result = p_result, performed_on = p_performed_on, result_by = auth.uid(), result_at = now(),
         notes = COALESCE(public.mgmt_text(p_notes, 4000), notes)
   WHERE id = a.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_itr_status(p_itr_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; e jsonb; v_status text; v_complete boolean; v_fail boolean;
BEGIN
  -- S05 (C-34/C-10): el estado y el avance del ITR SALEN del contenido (evaluate_itr_capture) y de las firmas;
  -- nadie los escribe por REST (guard_itr_derived). Lo llaman las acciones tras guardar respuestas o evidencias.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN
    RAISE EXCEPTION 'ITR unavailable' USING ERRCODE = '42501';
  END IF;
  IF v.status = 'approved' OR EXISTS (SELECT 1 FROM itr_signatures WHERE itr_id = p_itr_id) THEN
    RETURN jsonb_build_object('status', v.status, 'progress_pct', v.progress_pct, 'changed', false);
  END IF;
  e := public.evaluate_itr_capture(p_itr_id);
  v_complete := COALESCE((e->>'is_complete')::boolean, false);
  v_fail := COALESCE((e->>'has_critical_fail')::boolean, false);
  v_status := CASE WHEN v_fail THEN 'rejected' WHEN v_complete THEN 'completed'
                   WHEN COALESCE((e->>'completed_count')::int, 0) > 0 THEN 'in_progress' ELSE 'not_started' END;
  UPDATE itrs SET status = v_status::itr_status, progress_pct = COALESCE((e->>'progress_pct')::numeric, 0),
    completed_date = CASE WHEN v_complete AND NOT v_fail THEN COALESCE(v.completed_date, public.project_today(v.project_id)) ELSE NULL END
  WHERE id = p_itr_id;
  RETURN jsonb_build_object('status', v_status, 'progress_pct', COALESCE((e->>'progress_pct')::numeric, 0), 'changed', v_status IS DISTINCT FROM v.status::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public."sign_itr_atomic"(p_itr_id uuid, p_role text, p_signature_image text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.itrs; e jsonb; roles text[]; uid uuid:=auth.uid(); org uuid; result_status text; eq_block text;
BEGIN
SELECT * INTO v FROM public.itrs WHERE id=p_itr_id FOR UPDATE;
IF NOT FOUND OR uid IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
-- S04 (C-01/I-05, D4): firmas requeridas congeladas en el ITR, en orden ejecutor → supervisor → cliente.
roles:=public.itr_signing_roles(v.required_signatures);
SELECT org_id INTO org FROM public.projects WHERE id=v.project_id;
IF NOT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=org AND user_id=uid) THEN RAISE EXCEPTION 'Membership required'; END IF;
IF p_role IS NULL OR NOT p_role=ANY(roles) THEN RAISE EXCEPTION 'Invalid signing role'; END IF;
-- S05 (C-26): el trazo es un PNG en base64 de hasta ~256 KB (igual que el certificado).
IF p_signature_image IS NOT NULL AND (p_signature_image NOT LIKE 'data:image/png;base64,%' OR length(p_signature_image) > 350000) THEN RAISE EXCEPTION 'Invalid signature image'; END IF;
IF v.status='approved' THEN RAISE EXCEPTION 'Already approved'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.itr_assignments WHERE itr_id=p_itr_id AND role::text=p_role AND user_id=uid) THEN RAISE EXCEPTION 'User not assigned to signing role'; END IF;
-- S04 (A-08, D6): una persona no firma dos roles del mismo ITR.
IF EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND user_id=uid) THEN RAISE EXCEPTION 'Signer already signed this ITR in another role'; END IF;
IF EXISTS(SELECT 1 FROM public.itr_signatures s WHERE s.itr_id=p_itr_id AND NOT EXISTS(SELECT 1 FROM public.itr_assignments a WHERE a.itr_id=p_itr_id AND a.role=s.role AND a.user_id=s.user_id)) THEN RAISE EXCEPTION 'Existing signature assignment mismatch'; END IF;
IF EXISTS(SELECT 1 FROM unnest(roles[1:array_position(roles,p_role)-1]) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN RAISE EXCEPTION 'Previous signature required'; END IF;
e:=public.evaluate_itr_capture(p_itr_id);
IF NOT COALESCE((e->>'is_complete')::boolean,false) OR COALESCE((e->>'has_critical_fail')::boolean,true) THEN RAISE EXCEPTION 'Applicable content incomplete or rejected'; END IF;
eq_block:=public.itr_test_equipment_blocker(p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
-- Fase 8: no se firma contra una revisión de documento superada.
eq_block:=public.document_references_blocker('itr',p_itr_id);
IF eq_block IS NOT NULL THEN RAISE EXCEPTION '%', eq_block; END IF;
INSERT INTO public.itr_signatures(itr_id,user_id,role,signature_image) VALUES(p_itr_id,uid,p_role::public.signature_role,p_signature_image);
result_status:=CASE WHEN NOT EXISTS(SELECT 1 FROM unnest(roles) r WHERE NOT EXISTS(SELECT 1 FROM public.itr_signatures WHERE itr_id=p_itr_id AND role::text=r)) THEN 'approved' ELSE 'completed' END;
UPDATE public.itrs SET status=result_status::public.itr_status,progress_pct=100,completed_date=public.project_today(v.project_id) WHERE id=p_itr_id;
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'signed',jsonb_build_object('role',p_role,'status',result_status));
IF result_status='approved' THEN
UPDATE public.work_plan_items SET status='completed' WHERE itr_id=p_itr_id AND status::text IN ('not_started','in_progress');
INSERT INTO public.activity_log(org_id,user_id,entity_type,entity_id,action,payload) VALUES(org,uid,'itr',p_itr_id,'approved',jsonb_build_object('projectId',v.project_id,'tagId',v.tag_id,'signingRole',p_role));
END IF;
RETURN jsonb_build_object('status',result_status,'project_id',v.project_id,'tag_id',v.tag_id);
END $function$;

CREATE OR REPLACE FUNCTION public.take_kpi_snapshot(p_project_id uuid, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.kpi_snapshots%ROWTYPE;
  v_phases integer;
BEGIN
  p_date := COALESCE(p_date, public.project_today(p_project_id));  -- S10 (D-27/B-29): día local del proyecto
  IF p_project_id IS NULL OR p_date IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.kpi_snapshots AS k (
    project_id, snapshot_date, total_itrs, completed_itrs, total_punches_a, open_punches_a,
    total_punches_b, open_punches_b, total_tags, total_preservation, overdue_preservation, completion_pct, suspect)
  SELECT p_project_id, p_date, i.total, i.done, pu.ta, pu.oa, pu.tb, pu.ob,
         (SELECT count(*) FROM public.tags t WHERE t.project_id = p_project_id),
         pp.total, pp.overdue,
         CASE WHEN i.total > 0 THEN round(i.done * 100.0 / i.total, 2) ELSE 0 END,
         false
  FROM (SELECT count(*) AS total, count(*) FILTER (WHERE status = 'approved') AS done
          FROM public.itrs WHERE project_id = p_project_id) i,
       (SELECT count(*) FILTER (WHERE category = 'A') AS ta,
               count(*) FILTER (WHERE category = 'A' AND status IN ('open', 'in_progress')) AS oa,
               count(*) FILTER (WHERE category = 'B') AS tb,
               count(*) FILTER (WHERE category = 'B' AND status IN ('open', 'in_progress')) AS ob
          FROM public.punches WHERE project_id = p_project_id) pu,
       (SELECT count(*) AS total,
               count(*) FILTER (WHERE public.preservation_is_overdue(status, next_due_date, p_date)) AS overdue
          FROM public.preservation_plans WHERE project_id = p_project_id AND status = 'active') pp
  ON CONFLICT (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) DO UPDATE SET
    total_itrs = EXCLUDED.total_itrs, completed_itrs = EXCLUDED.completed_itrs,
    total_punches_a = EXCLUDED.total_punches_a, open_punches_a = EXCLUDED.open_punches_a,
    total_punches_b = EXCLUDED.total_punches_b, open_punches_b = EXCLUDED.open_punches_b,
    total_tags = EXCLUDED.total_tags, total_preservation = EXCLUDED.total_preservation,
    overdue_preservation = EXCLUDED.overdue_preservation, completion_pct = EXCLUDED.completion_pct,
    suspect = false
  RETURNING k.* INTO v_row;

  -- Por fase: solo métricas de ITR (punches, tags y preservación no tienen fase).
  INSERT INTO public.kpi_snapshots AS k (project_id, snapshot_date, phase_id, total_itrs, completed_itrs, completion_pct, suspect)
  SELECT p_project_id, p_date, phase_id, count(*), count(*) FILTER (WHERE status = 'approved'),
         round(count(*) FILTER (WHERE status = 'approved') * 100.0 / count(*), 2), false
  FROM public.itrs WHERE project_id = p_project_id AND phase_id IS NOT NULL
  GROUP BY phase_id
  ON CONFLICT (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) DO UPDATE SET
    total_itrs = EXCLUDED.total_itrs, completed_itrs = EXCLUDED.completed_itrs,
    completion_pct = EXCLUDED.completion_pct, suspect = false;
  GET DIAGNOSTICS v_phases = ROW_COUNT;

  -- Re-snapshot del mismo día: fases que ya no tienen ITR.
  DELETE FROM public.kpi_snapshots k
  WHERE k.project_id = p_project_id AND k.snapshot_date = p_date AND k.phase_id IS NOT NULL
    AND k.subsystem_id IS NULL AND k.area_id IS NULL AND k.system_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.itrs i WHERE i.project_id = p_project_id AND i.phase_id = k.phase_id);

  RETURN jsonb_build_object('date', p_date, 'total_itrs', v_row.total_itrs, 'completed_itrs', v_row.completed_itrs,
    'completion_pct', v_row.completion_pct, 'open_punches_a', v_row.open_punches_a, 'open_punches_b', v_row.open_punches_b,
    'overdue_preservation', v_row.overdue_preservation, 'phases', v_phases);
END $function$;

CREATE OR REPLACE FUNCTION public.take_mgmt_snapshot(p_project_id uuid, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; r record; v_systems integer := 0;
  v_itr bigint := 0; v_wsum numeric := 0; v_gapp integer := 0; v_gtot integer := 0; v_kpis jsonb;
  v_tz text; v_from timestamptz; v_to timestamptz;
BEGIN
  -- S10 (D-05/D-27): el día y la ventana de 30 días se cortan en la zona del proyecto.
  v_tz := public.project_timezone(p_project_id);
  p_date := COALESCE(p_date, public.tz_today(v_tz));
  v_from := public.tz_day_start(p_date - 30, v_tz); v_to := public.tz_day_start(p_date + 1, v_tz);
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = 'P0002'; END IF;

  FOR r IN SELECT * FROM public.compute_project_progress(p_project_id) LOOP
    INSERT INTO system_progress_snapshots (org_id, project_id, system_id, snapshot_date, weighted_pct, itr_total, itr_approved,
                                           gates_approved, gates_total, per_gate)
    VALUES (v_org, p_project_id, r.system_id, p_date, r.weighted_pct, r.itr_total, r.itr_approved, r.gates_approved, r.gates_total,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('gate_id', cp.gate_id, 'code', cp.gate_code, 'weight', cp.weight,
                        'itr_total', cp.itr_total, 'itr_approved', cp.itr_approved, 'pct', cp.pct, 'approved', cp.approved)
                        ORDER BY cp.gate_order, cp.gate_code)
                      FROM public.compute_system_progress(r.system_id) cp), '[]'::jsonb))
    ON CONFLICT (system_id, snapshot_date) DO UPDATE
      SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, itr_approved = EXCLUDED.itr_approved,
          gates_approved = EXCLUDED.gates_approved, gates_total = EXCLUDED.gates_total, per_gate = EXCLUDED.per_gate, created_at = now();
    v_systems := v_systems + 1;
    v_itr := v_itr + r.itr_total;
    v_wsum := v_wsum + r.weighted_pct * r.itr_total;
    v_gapp := v_gapp + r.gates_approved;
    v_gtot := v_gtot + r.gates_total;
  END LOOP;

  -- KPIs calculables (ventana de 30 días hasta p_date).
  SELECT jsonb_build_object(
    'tq', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status IN ('draft', 'issued')),
             'answered_pending_close', COUNT(*) FILTER (WHERE status = 'answered'),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to),
             'answered_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to),
             'on_time_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL AND (responded_at AT TIME ZONE v_tz)::date <= required_by),
             'with_due_30d', COUNT(*) FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND required_by IS NOT NULL),
             'avg_days_to_answer_30d', round(AVG(EXTRACT(EPOCH FROM (responded_at - issued_at)) / 86400)
                                       FILTER (WHERE responded_at >= v_from AND responded_at < v_to AND issued_at IS NOT NULL)::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'issued' AND required_by < p_date))
           FROM technical_queries WHERE project_id = p_project_id AND status <> 'cancelled'),
    'actions', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')),
             'to_verify', COUNT(*) FILTER (WHERE status = 'done'),
             'overdue', COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND due_date < p_date),
             'verified_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to),
             'on_time_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL AND (done_at AT TIME ZONE v_tz)::date <= due_date),
             'with_due_30d', COUNT(*) FILTER (WHERE verified_at >= v_from AND verified_at < v_to AND due_date IS NOT NULL))
           FROM actions WHERE project_id = p_project_id),
    'constraints', (SELECT jsonb_build_object(
             'open', COUNT(*) FILTER (WHERE status = 'open'),
             'by_level', jsonb_build_object(
                '1', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 1),
                '2', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 2),
                '3', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 3),
                '4', COUNT(*) FILTER (WHERE status = 'open' AND escalation_level = 4)),
             'avg_age_days', round(AVG(p_date - (created_at AT TIME ZONE v_tz)::date) FILTER (WHERE status = 'open')::numeric, 1),
             'overdue', COUNT(*) FILTER (WHERE status = 'open' AND need_date < p_date),
             'closed_30d', COUNT(*) FILTER (WHERE closed_at >= v_from AND closed_at < v_to))
           FROM project_constraints WHERE project_id = p_project_id),
    -- Cumplimiento del compromiso: gates aprobados en la ventana que tenían compromiso.
    'commitments', (SELECT jsonb_build_object(
             'approved_30d', COUNT(*),
             'on_time_30d', COUNT(*) FILTER (WHERE (a.approved_at AT TIME ZONE v_tz)::date <= gp.commitment_date))
           FROM system_gate_approvals a
           JOIN system_gate_plans gp ON gp.system_id = a.system_id AND gp.gate_id = a.gate_id AND gp.commitment_date IS NOT NULL
           WHERE a.project_id = p_project_id AND a.revoked_at IS NULL
             AND a.status IN ('approved', 'approved_with_conditions')
             AND a.approved_at >= v_from AND a.approved_at < v_to),
    -- Éxito de primer arranque (F6, decisión 2026-10-19): sin trip/parada entre «primer arranque» y «operación estable».
    'startup', (SELECT jsonb_build_object(
             'started', COUNT(*),
             'successful', COUNT(*) FILTER (WHERE s.stable_at IS NOT NULL AND NOT s.tripped),
             'failed', COUNT(*) FILTER (WHERE s.tripped),
             'pending', COUNT(*) FILTER (WHERE s.stable_at IS NULL AND NOT s.tripped))
           FROM (SELECT fs.system_id, st.stable_at,
                        EXISTS (SELECT 1 FROM startup_events e
                                WHERE e.system_id = fs.system_id AND e.kind = 'free' AND e.category IN ('trip', 'shutdown')
                                  AND e.status <> 'voided' AND e.occurred_at >= fs.occurred_at
                                  AND e.occurred_at < LEAST(v_to, COALESCE(st.stable_at, v_to))) AS tripped
                 FROM startup_events fs
                 LEFT JOIN LATERAL (SELECT MIN(x.occurred_at) AS stable_at FROM startup_events x
                                    WHERE x.system_id = fs.system_id AND x.kind = 'milestone' AND x.milestone = 'first_stable_operation'
                                      AND x.status = 'witnessed' AND x.occurred_at < v_to) st ON true
                 WHERE fs.project_id = p_project_id AND fs.kind = 'milestone' AND fs.milestone = 'first_startup'
                   AND fs.status = 'witnessed' AND fs.occurred_at < v_to) s),
    -- Falla repetida (F6): trips/paradas en la ventana y sistemas con 2 o más.
    'trips', (SELECT jsonb_build_object(
             'events_30d', COALESCE(SUM(x.n), 0),
             'systems_30d', COUNT(*),
             'repeat_systems_30d', COUNT(*) FILTER (WHERE x.n >= 2))
           FROM (SELECT e.system_id, COUNT(*) AS n FROM startup_events e
                 WHERE e.project_id = p_project_id AND e.kind = 'free' AND e.category IN ('trip', 'shutdown')
                   AND e.status <> 'voided' AND e.occurred_at >= v_from AND e.occurred_at < v_to
                 GROUP BY e.system_id) x),
    -- Falla repetida (F7): pruebas de desempeño aceptadas al primer intento evaluado.
    'performance', (SELECT jsonb_build_object(
             'tests', COUNT(*),
             'accepted', COUNT(*) FILTER (WHERE a.acc_attempt IS NOT NULL),
             'accepted_first', COUNT(*) FILTER (WHERE a.acc_attempt IS NOT NULL AND a.prior = 0),
             'failed_runs', COALESCE(SUM(a.failed), 0))
           FROM performance_tests t
           CROSS JOIN LATERAL (
             SELECT MIN(pr.attempt) FILTER (WHERE pr.result IN ('accepted', 'accepted_with_deviation')) AS acc_attempt,
                    COUNT(*) FILTER (WHERE pr.result = 'failed') AS failed,
                    COUNT(*) FILTER (WHERE pr.attempt < (SELECT MIN(pr2.attempt) FROM performance_runs pr2
                                                          WHERE pr2.test_id = t.id AND pr2.result IN ('accepted', 'accepted_with_deviation')
                                                            AND pr2.result_at < v_to)) AS prior,
                    COUNT(*) AS evaluated
             FROM performance_runs pr
             WHERE pr.test_id = t.id AND pr.status = 'evaluated' AND pr.result_at < v_to) a
           WHERE t.project_id = p_project_id AND a.evaluated > 0),
    -- Completitud documental (F8, decisión 2026-10-19): As-Built/Final sobre los documentos ligados a sistemas.
    'documents', (SELECT jsonb_build_object(
             'total', COUNT(*),
             'linked', COUNT(*) FILTER (WHERE dx.linked),
             'as_built', COUNT(*) FILTER (WHERE dx.linked AND cur.status IN ('as_built', 'final')),
             'no_revision', COUNT(*) FILTER (WHERE d.current_revision_id IS NULL),
             'outdated_refs', (SELECT COUNT(*) FROM document_references dr JOIN documents d2 ON d2.id = dr.document_id
                               WHERE dr.project_id = p_project_id AND dr.revision_id <> d2.current_revision_id
                                 AND ((dr.itr_id IS NOT NULL AND EXISTS (SELECT 1 FROM itr_signatures sg WHERE sg.itr_id = dr.itr_id))
                                   OR (dr.procedure_revision_id IS NOT NULL AND EXISTS (SELECT 1 FROM procedures pr2 WHERE pr2.current_revision_id = dr.procedure_revision_id)))))
           FROM documents d
           LEFT JOIN document_revisions cur ON cur.id = d.current_revision_id
           CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM document_systems ds WHERE ds.document_id = d.id) AS linked) dx
           WHERE d.project_id = p_project_id),
    -- Readiness de vendors (F8, decisión 2026-10-19): paquetes activos sin bloqueos.
    'vendors', (SELECT jsonb_build_object(
             'planned', COUNT(*) FILTER (WHERE vp.status = 'planned'),
             'mobilized', COUNT(*) FILTER (WHERE vp.status = 'mobilized'),
             'demobilized', COUNT(*) FILTER (WHERE vp.status = 'demobilized'),
             'active', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized')),
             'clear', COUNT(*) FILTER (WHERE vp.status IN ('mobilized', 'demobilized') AND NOT vb.bad_tests AND vb.open_findings = 0 AND NOT vb.to_decide),
             'open_findings', COALESCE(SUM(vb.open_findings), 0))
           FROM vendor_packages vp
           CROSS JOIN LATERAL (SELECT
             EXISTS (SELECT 1 FROM vendor_activities va WHERE va.package_id = vp.id AND va.result IN ('pending', 'failed')) AS bad_tests,
             (SELECT COUNT(*) FROM vendor_findings vf
                LEFT JOIN punches pu ON pu.id = vf.punch_id
                LEFT JOIN actions ac ON ac.id = vf.action_id
               WHERE vf.package_id = vp.id
                 AND (pu.status::text IN ('open', 'in_progress') OR ac.status IN ('open', 'in_progress', 'done'))) AS open_findings,
             EXISTS (SELECT 1 FROM vendor_recommendations vr WHERE vr.package_id = vp.id AND vr.status = 'proposed') AS to_decide) vb
           WHERE vp.project_id = p_project_id AND vp.status <> 'cancelled')
  ) INTO v_kpis;

  INSERT INTO mgmt_kpi_snapshots (org_id, project_id, snapshot_date, weighted_pct, itr_total, gates_approved, gates_total, kpis)
  VALUES (v_org, p_project_id, p_date, CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END, v_itr, v_gapp, v_gtot, v_kpis)
  ON CONFLICT (project_id, snapshot_date) DO UPDATE
    SET weighted_pct = EXCLUDED.weighted_pct, itr_total = EXCLUDED.itr_total, gates_approved = EXCLUDED.gates_approved,
        gates_total = EXCLUDED.gates_total, kpis = EXCLUDED.kpis, created_at = now();

  RETURN jsonb_build_object('systems', v_systems, 'weighted_pct', CASE WHEN v_itr > 0 THEN round(v_wsum / v_itr, 6) ELSE 0 END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v          punches;
  v_cur      text;
  v_role     text;
  v_service  boolean := COALESCE(auth.role() = 'service_role', false);  -- sin claims auth.role() es NULL
  v_previous uuid;
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch not found'; END IF;

  -- S06 (C-04/A-03): sin sesión solo el service role explícito (API v1, que ya validó la org).
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    v_role := public.punch_caller_role(v);
    IF v_role IS NULL OR NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR v_role = ANY (public.hold_release_roles('operations'))) THEN
      RAISE EXCEPTION 'Sin permiso para el seguimiento de Operaciones' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_cur := COALESCE(v.post_handover_status, 'active');
  IF v_cur = 'active' THEN
    RAISE EXCEPTION 'El punch no está transferido a Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN ('in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops') THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;
  -- Máquina de estados: cerrar solo desde verificado; verificar solo desde resuelto.
  IF NOT (
       (v_cur IN ('transferred_to_ops', 'in_progress_ops', 'deferred') AND p_new_status IN ('in_progress_ops', 'deferred', 'resolved_ops', 'cancelled_ops') AND p_new_status <> v_cur)
    OR (v_cur = 'resolved_ops' AND p_new_status IN ('verified_ops', 'in_progress_ops'))
    OR (v_cur = 'verified_ops' AND p_new_status = 'closed_final')
  ) THEN
    RAISE EXCEPTION 'Transición no permitida en Operaciones: % → %', v_cur, p_new_status USING ERRCODE = 'P0001';
  END IF;
  -- Verificar y cerrar los hace una persona, distinta de quien resolvió (o verificó).
  IF p_new_status IN ('verified_ops', 'closed_final') THEN
    IF v_service THEN
      RAISE EXCEPTION 'La verificación y el cierre en Operaciones los hace una persona en la app' USING ERRCODE = '42501';
    END IF;
    SELECT e.performed_by INTO v_previous FROM punch_post_handover_events e
    WHERE e.punch_id = p_punch_id AND e.to_status = v_cur ORDER BY e.performed_at DESC LIMIT 1;
    IF v_previous = auth.uid() THEN
      RAISE EXCEPTION 'Lo % una persona distinta de quien lo %', CASE WHEN p_new_status = 'verified_ops' THEN 'verifica' ELSE 'cierra' END,
        CASE WHEN p_new_status = 'verified_ops' THEN 'resolvió' ELSE 'verificó' END USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN public.project_today(v.project_id) ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_punch(p_punch_id uuid, p_accept boolean, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v public.punches; v_role text; v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  SELECT * INTO v FROM punches WHERE id = p_punch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Punch no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.punch_caller_role(v);
  IF v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'in_progress' OR v.resolved_at IS NULL THEN
    RAISE EXCEPTION 'Solo se verifica un punch resuelto' USING ERRCODE = 'P0001';
  END IF;
  IF v.resolved_by = auth.uid() THEN
    RAISE EXCEPTION 'La verificación la hace una persona distinta de quien lo resolvió' USING ERRCODE = 'P0001';
  END IF;

  IF p_accept THEN
    UPDATE punches SET status = 'closed', closed_date = public.project_today(v.project_id), verified_by = auth.uid() WHERE id = p_punch_id;
    INSERT INTO punch_comments (punch_id, user_id, comment)
    VALUES (p_punch_id, auth.uid(), 'Verificado en campo y cerrado' || COALESCE(': ' || v_comment, '.'));
    PERFORM public.punch_log(v, 'verified', jsonb_build_object('comment', v_comment));
  ELSE
    IF v_comment IS NULL THEN RAISE EXCEPTION 'Indica por qué no se acepta la resolución' USING ERRCODE = '22023'; END IF;
    UPDATE punches SET resolved_at = NULL, resolved_by = NULL WHERE id = p_punch_id;
    INSERT INTO punch_comments (punch_id, user_id, comment) VALUES (p_punch_id, auth.uid(), 'Verificación rechazada: ' || v_comment);
    PERFORM public.punch_log(v, 'verification_rejected', jsonb_build_object('comment', v_comment));
  END IF;
END;
$function$;

