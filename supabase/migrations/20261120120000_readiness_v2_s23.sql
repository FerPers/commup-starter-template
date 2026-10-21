-- S23: Readiness v2 (pantallas).
--   D-01 / D-18  Control Tower sale del motor de gates: cada gate guardado (S20) trae su primer criterio que falla
--                (`blocker`), y la fila muestra el siguiente gate no aprobado y por qué. Sin compute_project_readiness
--                (motor viejo: ITR de todas las fases y solo bloqueos de punch). Punch A/B por sistema con una RPC chica.
--   D-12         «Aprobado con condiciones» con seguimiento: al quedar aprobado con condiciones, cada condición pasa a
--                una acción ACC (origen «gate», dueño = quien aprobó); la matriz muestra las abiertas.
--   D-22         Registros F3: la RPC exige los campos obligatorios de cada estado (= REGISTER_CATALOG, test de
--                paridad) y el resultado de un test pack ya registrado no se cambia; pg_cron diario avisa bypass que
--                excedieron su duración y temporales con retiro vencido.

CREATE OR REPLACE FUNCTION public.gate_status_compute(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'gate_id', g.gate_id, 'code', g.gate_code, 'name', g.gate_name,
           'order', g.gate_order, 'computed_level', g.computed_level, 'status', g.status,
           'failing', (SELECT COUNT(*) FROM jsonb_array_elements(g.criteria) cr WHERE cr ->> 'result' = 'fail'),
           'approval', g.approval,
           -- S23 (D-01): primer criterio que falla (bloqueante), sin las listas del detalle, para la fila de la matriz.
           'blocker', (SELECT jsonb_build_object('kind', cr ->> 'kind', 'label', cr ->> 'label',
                         'detail', (SELECT COALESCE(jsonb_object_agg(d.key, d.value), '{}'::jsonb)
                                    FROM jsonb_each(COALESCE(cr -> 'detail', '{}'::jsonb)) d
                                    WHERE jsonb_typeof(d.value) NOT IN ('array', 'object')))
                       FROM jsonb_array_elements(g.criteria) WITH ORDINALITY AS c(cr, ord)
                       WHERE cr ->> 'result' = 'fail'
                       ORDER BY c.ord LIMIT 1)
         ) ORDER BY g.gate_order, g.gate_code), '[]'::jsonb)
  FROM public.compute_system_gates(p_system_id) g
$function$;


-- El estado guardado se recalcula con el campo nuevo (los estados no cambian: no hay avisos de transición).
UPDATE public.system_gate_status
SET gates = public.gate_status_compute(system_id), computed_version = version, computed_at = now()
WHERE computed_version = version;

-- D-18: avance físico ponderado igual que antes; los gates aprobados/total con la definición única de readiness.
CREATE OR REPLACE FUNCTION public.compute_project_progress(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, itr_total integer, itr_approved integer, weighted_pct numeric, gates_approved integer, gates_total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE v_org uuid;
BEGIN
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = p_project_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH g AS (  -- = compute_system_progress: gates activos con fase, peso relativo
    SELECT rg.id, rg.phase_id, COALESCE(rg.weight, 1) AS w
    FROM readiness_gates rg WHERE rg.org_id = v_org AND rg.is_active AND rg.phase_id IS NOT NULL
  ),
  tot AS (SELECT SUM(g.w) AS tw FROM g),
  sys AS (SELECT s.id, s.code FROM systems s WHERE s.project_id = p_project_id),
  cnt AS (
    SELECT ss.system_id, i.phase_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE i.status = 'approved')::int AS ok
    FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN sys ON sys.id = ss.system_id
    GROUP BY ss.system_id, i.phase_id
  ),
  cp AS (
    SELECT sys.id AS system_id, g.id AS gate_id,
           CASE WHEN tot.tw > 0 THEN round(g.w / tot.tw, 6) ELSE 0 END AS weight,
           COALESCE(cnt.total, 0) AS total, COALESCE(cnt.ok, 0) AS ok,
           CASE WHEN COALESCE(cnt.total, 0) > 0 THEN round(cnt.ok::numeric / cnt.total, 6) ELSE 0 END AS pct,
           EXISTS (SELECT 1 FROM system_gate_approvals a
                   WHERE a.system_id = sys.id AND a.gate_id = g.id AND a.revoked_at IS NULL
                     AND a.status IN ('approved', 'approved_with_conditions')) AS approved
    FROM sys CROSS JOIN g CROSS JOIN tot
    LEFT JOIN cnt ON cnt.system_id = sys.id AND cnt.phase_id = g.phase_id
  ),
  -- S23 (D-18): readiness = la misma definición que Control Tower (readinessSummary): todos los gates activos,
  -- aprobados solo los vigentes (sin regresión ni condición nueva), del estado guardado de S20.
  rd AS (
    SELECT st.system_id, jsonb_array_length(COALESCE(st.gates, '[]'::jsonb))::int AS total,
           (SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(st.gates, '[]'::jsonb)) x
            WHERE x ->> 'status' IN ('approved', 'approved_with_conditions'))::int AS done
    FROM system_gate_status st WHERE st.project_id = p_project_id
  )
  SELECT sys.id, sys.code,
         COALESCE(SUM(cp.total), 0)::int, COALESCE(SUM(cp.ok), 0)::int,
         round(COALESCE(SUM(cp.weight * cp.pct), 0), 6),
         COALESCE(rd.done, 0), COALESCE(rd.total, 0)
  FROM sys LEFT JOIN cp ON cp.system_id = sys.id LEFT JOIN rd ON rd.system_id = sys.id
  GROUP BY sys.id, sys.code, rd.done, rd.total
  ORDER BY sys.code;
END;
$function$;


-- Punch A/B abiertos por sistema (Control Tower), set-based y con la RLS del usuario.
CREATE OR REPLACE FUNCTION public.system_open_punches(p_project_id uuid)
 RETURNS TABLE(system_id uuid, open_a integer, open_b integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT ss.system_id,
         COUNT(*) FILTER (WHERE p.category = 'A')::int,
         COUNT(*) FILTER (WHERE p.category = 'B')::int
  FROM punches p JOIN subsystems ss ON ss.id = p.subsystem_id
  WHERE p.project_id = p_project_id AND p.status IN ('open', 'in_progress') AND p.category IN ('A', 'B')
  GROUP BY ss.system_id
$function$;
REVOKE EXECUTE ON FUNCTION public.system_open_punches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_open_punches(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- D-12 · Condiciones de un gate = acciones ACC
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_kind_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_kind_check
  CHECK (source_kind = ANY (ARRAY['manual', 'pssr', 'constraint', 'meeting', 'tq', 'vendor', 'performance', 'gate']));

CREATE OR REPLACE FUNCTION public.mgmt_check_source(p_project_id uuid, p_kind text, p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ok boolean := true;
BEGIN
  IF p_kind IN ('pssr', 'constraint', 'tq') AND p_source_id IS NULL THEN
    RAISE EXCEPTION 'Falta el registro de origen' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'pssr' THEN
    v_ok := EXISTS (SELECT 1 FROM pssr_review_items i JOIN pssr_reviews r ON r.id = i.review_id
                    WHERE i.id = p_source_id AND r.project_id = p_project_id);
  ELSIF p_kind = 'constraint' THEN
    v_ok := EXISTS (SELECT 1 FROM project_constraints WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'tq' THEN
    v_ok := EXISTS (SELECT 1 FROM technical_queries WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'performance' AND p_source_id IS NOT NULL THEN
    v_ok := EXISTS (SELECT 1 FROM performance_runs WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'gate' THEN
    -- S23 (D-12): condición de una aprobación de gate del proyecto.
    v_ok := p_source_id IS NOT NULL AND EXISTS (SELECT 1 FROM system_gate_approvals WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_kind = 'vendor' AND p_source_id IS NOT NULL THEN
    v_ok := EXISTS (SELECT 1 FROM vendor_packages WHERE id = p_source_id AND project_id = p_project_id);
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'El origen no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
END;
$function$;


-- Una acción por condición de una aprobación (idempotente); dueño = quien aprobó.
CREATE OR REPLACE FUNCTION public.gate_conditions_create_actions(p_approval_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a record; v_cond text; v_seq integer; v_id uuid; v_gate text; v_n integer := 0;
BEGIN
  SELECT * INTO a FROM system_gate_approvals WHERE id = p_approval_id;
  IF NOT FOUND OR a.status <> 'approved_with_conditions' OR a.revoked_at IS NOT NULL
     OR jsonb_array_length(COALESCE(a.conditions, '[]'::jsonb)) = 0
     OR EXISTS (SELECT 1 FROM actions WHERE source_kind = 'gate' AND source_id = a.id) THEN
    RETURN 0;
  END IF;
  SELECT code INTO v_gate FROM readiness_gates WHERE id = a.gate_id;
  FOR v_cond IN SELECT c #>> '{}' FROM jsonb_array_elements(a.conditions) c WHERE jsonb_typeof(c) = 'string' LOOP
    v_seq := public.mgmt_next_seq('actions', a.project_id);
    INSERT INTO actions (org_id, project_id, seq, number, title, description, source_kind, source_id, source_ref,
                         system_id, owner_id, priority, verification_method, created_by)
    VALUES (a.org_id, a.project_id, v_seq, 'ACC-' || lpad(v_seq::text, 4, '0'), public.mgmt_text(v_cond, 200),
            CASE WHEN length(v_cond) > 200 THEN public.mgmt_text(v_cond) END, 'gate', a.id, v_gate,
            a.system_id, a.approved_by, 'high', 'review', a.approved_by)
    RETURNING id INTO v_id;
    PERFORM public.mgmt_log(a.org_id, a.project_id, 'action', v_id, 'created', NULL, 'open');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;

-- Al quedar aprobado con condiciones (con todas sus firmas).
CREATE OR REPLACE FUNCTION public.gate_conditions_to_actions_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_prev text;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_prev := OLD.status; END IF;
  IF NEW.status = 'approved_with_conditions' AND v_prev IS DISTINCT FROM 'approved_with_conditions' THEN
    PERFORM public.gate_conditions_create_actions(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.gate_conditions_to_actions_trg(), public.gate_conditions_create_actions(uuid)
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_gate_conditions_to_actions AFTER INSERT OR UPDATE ON public.system_gate_approvals
  FOR EACH ROW EXECUTE FUNCTION public.gate_conditions_to_actions_trg();

-- Aprobaciones vigentes con condiciones de antes de S23: también sus acciones.
SELECT public.gate_conditions_create_actions(a.id) FROM public.system_gate_approvals a
WHERE a.status = 'approved_with_conditions' AND a.revoked_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- D-22 · Registros F3
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Campos obligatorios para llegar a un estado (acumulativo) = requiredFor de REGISTER_CATALOG (test de paridad).
CREATE OR REPLACE FUNCTION public.register_required_fields(p_kind text, p_status text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(f.key ORDER BY f.key), '{}') FROM (VALUES
    ('temporary', 'category', 'authorized'), ('temporary', 'location', 'authorized'), ('temporary', 'purpose', 'authorized'),
    ('blind', 'blind_type', 'authorized'), ('blind', 'size', 'authorized'), ('blind', 'location', 'authorized'),
    ('blind', 'purpose', 'authorized'), ('blind', 'label_number', 'active'),
    ('reinstatement', 'temporary_condition', 'authorized'), ('reinstatement', 'final_condition', 'authorized'),
    ('bypass', 'protection_function', 'authorized'), ('bypass', 'method', 'authorized'), ('bypass', 'reason', 'authorized'),
    ('bypass', 'risk_mitigation', 'authorized'), ('bypass', 'restoration_check', 'verified'),
    ('energization', 'equipment', 'authorized'), ('energization', 'boundary', 'authorized'), ('energization', 'authority', 'authorized'),
    ('energization', 'certificate', 'active'), ('energization', 'energized_on', 'active'),
    ('test_pack', 'test_type', 'authorized'), ('test_pack', 'medium', 'authorized'), ('test_pack', 'test_pressure', 'authorized'),
    ('test_pack', 'hold_minutes', 'authorized'), ('test_pack', 'achieved_pressure', 'active'), ('test_pack', 'result', 'active'),
    ('test_pack', 'witness', 'active')
  ) f(kind, key, required_for)
  WHERE f.kind = p_kind
    AND array_position(ARRAY['proposed', 'authorized', 'active', 'removed', 'verified'], f.required_for)
        <= array_position(ARRAY['proposed', 'authorized', 'active', 'removed', 'verified'], p_status)
$function$;

CREATE OR REPLACE FUNCTION public.transition_register_item(p_item_id uuid, p_to text, p_comment text DEFAULT NULL::text, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item register_items%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_data jsonb; v_comment text;
BEGIN
  SELECT * INTO v_item FROM register_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_item.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := NULLIF(left(btrim(COALESCE(p_comment, '')), 2000), '');
  v_data := v_item.data;
  IF p_data IS NOT NULL THEN
    IF jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Datos no válidos' USING ERRCODE = '22023'; END IF;
    v_data := p_data;
  END IF;

  IF p_to = 'cancelled' THEN
    IF v_item.status IN ('verified', 'cancelled') THEN RAISE EXCEPTION 'El registro % ya está cerrado', v_item.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar registros', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE register_items SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment,
                              data = v_data, updated_at = now() WHERE id = p_item_id;
  ELSE
    IF NOT ((v_item.status = 'proposed' AND p_to = 'authorized') OR (v_item.status = 'authorized' AND p_to = 'active')
         OR (v_item.status = 'active' AND p_to = 'removed') OR (v_item.status = 'removed' AND p_to = 'verified')) THEN
      RAISE EXCEPTION 'Transición no permitida: % → %', v_item.status, p_to USING ERRCODE = 'P0001';
    END IF;
    IF p_to = 'authorized' THEN
      IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede autorizar registros', v_role USING ERRCODE = '42501'; END IF;
      IF v_uid = v_item.proposed_by THEN RAISE EXCEPTION 'Quien propone no puede autorizar su propio registro' USING ERRCODE = '42501'; END IF;
    END IF;
    IF p_to = 'verified' AND v_uid = v_item.removed_by THEN
      RAISE EXCEPTION 'La verificación debe hacerla una persona distinta de quien retiró/restauró' USING ERRCODE = '42501';
    END IF;
    -- S23 (D-22): los campos que el estado exige (antes solo los validaba la app; la API o un script los saltaban).
    IF EXISTS (SELECT 1 FROM unnest(public.register_required_fields(v_item.kind, p_to)) k
               WHERE NULLIF(btrim(COALESCE(v_data ->> k, '')), '') IS NULL) THEN
      RAISE EXCEPTION 'Faltan datos para pasar a %: %', p_to,
        (SELECT string_agg(k, ', ') FROM unnest(public.register_required_fields(v_item.kind, p_to)) k
         WHERE NULLIF(btrim(COALESCE(v_data ->> k, '')), '') IS NULL) USING ERRCODE = '22023';
    END IF;
    -- El resultado de una prueba ya registrado no se cambia (un rechazo no se vuelve aceptado en la misma transición).
    IF v_item.kind = 'test_pack' AND v_item.data ->> 'result' IS NOT NULL
       AND (v_data ->> 'result') IS DISTINCT FROM (v_item.data ->> 'result') THEN
      RAISE EXCEPTION 'El resultado de la prueba del % ya está registrado: repite la prueba en un registro nuevo', v_item.number
        USING ERRCODE = 'P0001';
    END IF;
    IF v_item.kind = 'test_pack' AND p_to IN ('removed', 'verified') AND v_data ->> 'result' = 'rejected' THEN
      RAISE EXCEPTION 'La prueba del % fue rechazada: repite la prueba antes de restituir o verificar', v_item.number USING ERRCODE = 'P0001';
    END IF;
    UPDATE register_items SET
      status = p_to, data = v_data, updated_at = now(),
      authorized_by = CASE WHEN p_to = 'authorized' THEN v_uid ELSE authorized_by END,
      authorized_at = CASE WHEN p_to = 'authorized' THEN now() ELSE authorized_at END,
      activated_by  = CASE WHEN p_to = 'active'     THEN v_uid ELSE activated_by END,
      activated_at  = CASE WHEN p_to = 'active'     THEN now() ELSE activated_at END,
      removed_by    = CASE WHEN p_to = 'removed'    THEN v_uid ELSE removed_by END,
      removed_at    = CASE WHEN p_to = 'removed'    THEN now() ELSE removed_at END,
      verified_by   = CASE WHEN p_to = 'verified'   THEN v_uid ELSE verified_by END,
      verified_at   = CASE WHEN p_to = 'verified'   THEN now() ELSE verified_at END
    WHERE id = p_item_id;
  END IF;

  INSERT INTO register_events (item_id, org_id, project_id, action, from_status, to_status, user_id, comment)
  VALUES (p_item_id, v_item.org_id, v_item.project_id, 'transition', v_item.status, p_to, v_uid, v_comment);
  RETURN p_to;
END;
$function$;


-- Bypass activos más allá de su duración máxima y temporales activos con retiro planificado vencido: aviso diario
-- (dedupe 24 h) al dueño y a quien autorizó.
CREATE OR REPLACE FUNCTION public.notify_registers_overdue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_n integer := 0; v_items integer := 0;
BEGIN
  FOR r IN
    SELECT ri.*, CASE WHEN ri.kind = 'bypass' THEN 'bypass' ELSE 'temporary' END AS why
    FROM register_items ri JOIN projects p ON p.id = ri.project_id
    WHERE ri.status = 'active' AND (
      (ri.kind = 'bypass' AND ri.activated_at IS NOT NULL AND (ri.data ->> 'max_duration_hours') ~ '^[0-9]+(\.[0-9]+)?$'
         AND ri.activated_at + ((ri.data ->> 'max_duration_hours')::numeric * interval '1 hour') < now())
      OR (ri.kind = 'temporary' AND (ri.data ->> 'planned_removal') ~ '^\d{4}-\d{2}-\d{2}$'
         AND (ri.data ->> 'planned_removal')::date < public.tz_today(COALESCE(p.timezone, 'UTC'))))
  LOOP
    v_items := v_items + 1;
    v_n := v_n + public.notify_users(r.org_id, ARRAY[r.owner_id, r.authorized_by, r.activated_by], 'register_overdue',
      CASE WHEN r.why = 'bypass' THEN 'Bypass vencido: ' ELSE 'Temporal vencido: ' END || r.number,
      CASE WHEN r.why = 'bypass' THEN r.title || ' — excedió su duración máxima de ' || (r.data ->> 'max_duration_hours') || ' h'
           ELSE r.title || ' — retiro planificado ' || (r.data ->> 'planned_removal') END,
      '/projects/' || r.project_id || '/registers/' || r.id,
      jsonb_build_object('itemId', r.id, 'projectId', r.project_id), 'register_overdue:' || r.id);
  END LOOP;
  RETURN jsonb_build_object('items', v_items, 'notified', v_n);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.notify_registers_overdue(), public.register_required_fields(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_registers_overdue() TO service_role;
GRANT EXECUTE ON FUNCTION public.register_required_fields(text, text) TO authenticated, service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'registers-overdue';
SELECT cron.schedule('registers-overdue', '0 12 * * *', 'SELECT public.notify_registers_overdue()');
