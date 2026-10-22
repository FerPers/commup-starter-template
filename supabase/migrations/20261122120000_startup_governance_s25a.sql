-- S25a: correcciones de F6–F7 — auditoría y gobernanza (decisiones de Luis 2026-10-21).
--   E-09  release_hold_point guarda el comentario de quien libera en procedure_run_steps.release_comment; el del
--         ejecutor ya no se pisa.
--   E-10  procedure_run_events: línea de tiempo de la ejecución (inicio, cada parada con hora de campo, reanudación,
--         hold liberado, completada, abortada). Las columnas de procedure_runs quedan como estado actual. Backfill
--         con lo que queda en las filas.
--   E-11  system_staffing: los turnos esperados salen del personal activo del proyecto; un turno sin nadie competente
--         cuenta 0.
--   E-12  competency_records anulables con motivo (void_competency_record; el nivel vigente ignora las anuladas) y
--         una ficha sin usuario con el nombre de quien evalúa también cuenta como autoevaluación.
--   E-13  Pide el traspaso un líder+. Ítems no dispensables por org (organizations.settings.transfer_policy
--         .non_dispensable; por defecto no_open_cat_a y startup_gate) y cada firmante reconoce cada excepción
--         (sign_ownership_transfer recibe p_acknowledged; commissioning_ack / operations_ack entran al hash).
--   E-16  Bitácora: los prerrequisitos de primer arranque / primer HC se cumplían a la hora del hito; operación
--         estable y on-spec van después de un primer arranque atestiguado; más de 7 días atrás solo un líder+ con
--         motivo (startup_events.backdate_reason).
--   E-17  performance_freeze_run hace upsert sin borrar: re-congelar tras la purga de 90 días ya no deja la prueba
--         sin datos.
--   E-19  La evaluación trae el resultado sin exclusiones y si estas cambian el sugerido; en ese caso el
--         representante del cliente las reconoce (acknowledge_performance_exclusions) antes de registrar el resultado.
--   E-36  verify_lineup_item sin rol client; coma decimal en los parámetros manuales del evento; update_procedure
--         con tipo NULL conserva el actual.
--   generate_handover_package: comentario de liberación, línea de tiempo de la ejecución, competencias sin anuladas,
--         reconocimientos del traspaso y motivo de fecha atrasada.

-- ── Columnas y tablas ───────────────────────────────────────────────────────
ALTER TABLE public.procedure_run_steps ADD COLUMN IF NOT EXISTS release_comment text;

CREATE TABLE IF NOT EXISTS public.procedure_run_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.procedure_runs(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  step_id     uuid REFERENCES public.procedure_steps(id) ON DELETE SET NULL,
  user_id     uuid,
  field_at    timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  comment     text,
  backfilled  boolean NOT NULL DEFAULT false,
  CONSTRAINT procedure_run_events_kind_check CHECK (kind IN ('started', 'stopped', 'resumed', 'hold_released', 'completed', 'aborted'))
);
CREATE INDEX IF NOT EXISTS procedure_run_events_run_idx ON public.procedure_run_events (run_id, COALESCE(field_at, recorded_at));
ALTER TABLE public.procedure_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procedure_run_events_select ON public.procedure_run_events;
CREATE POLICY procedure_run_events_select ON public.procedure_run_events FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_my_project_ids()));
REVOKE ALL ON public.procedure_run_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.procedure_run_events FROM authenticated;

ALTER TABLE public.competency_records
  ADD COLUMN IF NOT EXISTS voided_by   uuid,
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE public.ownership_transfers
  ADD COLUMN IF NOT EXISTS commissioning_ack text[],
  ADD COLUMN IF NOT EXISTS operations_ack    text[];

ALTER TABLE public.startup_events ADD COLUMN IF NOT EXISTS backdate_reason text;

ALTER TABLE public.performance_disturbances
  ADD COLUMN IF NOT EXISTS client_ack_by uuid,
  ADD COLUMN IF NOT EXISTS client_ack_at timestamptz;

-- Backfill E-10: lo que sobrevive en las columnas (las paradas anteriores a la última ya se perdieron).
INSERT INTO public.procedure_run_events (run_id, org_id, project_id, kind, user_id, field_at, recorded_at, comment, backfilled)
SELECT r.id, r.org_id, r.project_id, 'started', r.started_by, r.started_at, r.started_at, NULL, true FROM public.procedure_runs r
UNION ALL
SELECT r.id, r.org_id, r.project_id, 'stopped', r.stopped_by, r.stopped_at, r.stopped_at, r.stop_reason, true FROM public.procedure_runs r WHERE r.stopped_at IS NOT NULL
UNION ALL
SELECT r.id, r.org_id, r.project_id, 'completed', r.completed_by, r.completed_at, r.completed_at, NULL, true FROM public.procedure_runs r WHERE r.completed_at IS NOT NULL
UNION ALL
SELECT r.id, r.org_id, r.project_id, 'aborted', r.aborted_by, r.aborted_at, r.aborted_at, r.abort_reason, true FROM public.procedure_runs r WHERE r.aborted_at IS NOT NULL
UNION ALL
SELECT r.id, r.org_id, r.project_id, 'hold_released', s.released_by, s.released_at, s.released_at, NULL, true
FROM public.procedure_run_steps s JOIN public.procedure_runs r ON r.id = s.run_id WHERE s.released_at IS NOT NULL;
UPDATE public.procedure_run_events e SET step_id = s.step_id
  FROM public.procedure_run_steps s
 WHERE e.backfilled AND e.kind = 'hold_released' AND s.run_id = e.run_id AND s.released_at = e.field_at AND e.step_id IS NULL;

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_procedure_run_event(r public.procedure_runs, p_kind text, p_step_id uuid, p_comment text, p_field_at timestamptz)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO procedure_run_events (run_id, org_id, project_id, kind, step_id, user_id, field_at, comment)
  VALUES (r.id, r.org_id, r.project_id, p_kind, p_step_id, auth.uid(), COALESCE(p_field_at, now()), p_comment)
$function$;
REVOKE ALL ON FUNCTION public.log_procedure_run_event(public.procedure_runs, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- Nombre normalizado para comparar personas (sin mayúsculas, acentos ni espacios dobles).
CREATE OR REPLACE FUNCTION public.person_name_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NULLIF(regexp_replace(lower(translate(btrim(COALESCE(p_name, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '\s+', ' ', 'g'), '')
$function$;
REVOKE ALL ON FUNCTION public.person_name_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_name_key(text) TO authenticated, service_role;

-- Claves del checklist de traspaso (= TRANSFER_CHECK_KEYS en src/lib/startup/ops.ts, test de paridad).
CREATE OR REPLACE FUNCTION public.ownership_check_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY['startup_procedure', 'staff_level_1', 'staff_level_2', 'staff_level_3', 'lineup_verified', 'startup_gate',
               'first_startup_witnessed', 'no_open_cat_a', 'critical_spares']
$function$;
REVOKE ALL ON FUNCTION public.ownership_check_keys() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ownership_check_keys() TO authenticated, service_role;

-- Ítems que la org no permite dispensar en un traspaso (= transferPolicy en TS). Sin configurar: Cat A y gate.
CREATE OR REPLACE FUNCTION public.org_transfer_non_dispensable(p_org_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(o.settings -> 'transfer_policy' -> 'non_dispensable') = 'array' THEN
      ARRAY(SELECT k FROM jsonb_array_elements_text(o.settings -> 'transfer_policy' -> 'non_dispensable') k
            WHERE k = ANY (public.ownership_check_keys()) ORDER BY k)
    ELSE ARRAY['no_open_cat_a', 'startup_gate'] END
  FROM organizations o WHERE o.id = p_org_id
$function$;
REVOKE ALL ON FUNCTION public.org_transfer_non_dispensable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_transfer_non_dispensable(uuid) TO authenticated, service_role;

-- E-12: anular un registro de competencia erróneo (líder+ o quien lo registró), con motivo.
CREATE OR REPLACE FUNCTION public.void_competency_record(p_record_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c competency_records%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO c FROM competency_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR c.assessed_by = auth.uid()) THEN
    RAISE EXCEPTION 'Anula un registro un líder o quien lo registró' USING ERRCODE = '42501';
  END IF;
  IF c.voided_at IS NOT NULL THEN RAISE EXCEPTION 'El registro ya está anulado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica el motivo (10 caracteres o más)' USING ERRCODE = '22023'; END IF;
  UPDATE competency_records SET voided_by = auth.uid(), voided_at = now(), void_reason = v_reason WHERE id = c.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.void_competency_record(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_competency_record(uuid, text) TO authenticated, service_role;

-- Cambios de firma: se reemplazan (una sola versión de cada función).
DROP FUNCTION IF EXISTS public.sign_ownership_transfer(uuid, text);
DROP FUNCTION IF EXISTS public.record_startup_event(uuid, uuid, text, text, timestamptz, text, text, uuid[], uuid, uuid[], jsonb);

-- ── Funciones ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_hold_point(p_run_id uuid, p_step_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND OR rs.status <> 'at_hold' THEN RAISE EXCEPTION 'El paso no está esperando liberación' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  -- S14 (D14): firmante designado del proyecto (o, sin designados, el rol de respaldo).
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT public.has_capacity(r.project_id, st.hold_capacity) THEN
    RAISE EXCEPTION 'No estás designado para liberar un hold point de %', st.hold_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = rs.done_by THEN RAISE EXCEPTION 'Libera el hold point una persona distinta de quien ejecutó el paso' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('at_hold', 'stopped') THEN RAISE EXCEPTION 'La ejecución no está detenida en un hold point' USING ERRCODE = 'P0001'; END IF;
  -- S25 (E-09): el comentario de quien libera va aparte; el de quien ejecutó el paso no se toca.
  UPDATE procedure_run_steps SET status = 'released', released_by = auth.uid(), released_at = now(), release_role = st.hold_capacity,
         release_comment = public.mgmt_text(p_comment, 2000)
   WHERE run_id = p_run_id AND step_id = p_step_id;
  PERFORM public.log_procedure_run_event(r, 'hold_released', p_step_id, public.mgmt_text(p_comment, 2000), NULL);
  UPDATE procedure_runs SET status = CASE WHEN status = 'at_hold' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = p_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_procedure_run(p_run_id uuid, p_to text, p_comment text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000);
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_to = 'stopped' AND r.status IN ('in_progress', 'at_hold') THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica qué criterio de parada se cumplió' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'stopped', stopped_by = v_uid, stopped_at = public.startup_field_time(p_captured_at, r.started_at), stop_reason = v_comment,
           stop_synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END, updated_at = now() WHERE id = r.id;
    -- S25 (E-10): cada parada queda en la línea de tiempo; las columnas guardan solo la última.
    PERFORM public.log_procedure_run_event(r, 'stopped', NULL, v_comment, public.startup_field_time(p_captured_at, r.started_at));
  ELSIF p_to = 'in_progress' AND r.status = 'stopped' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores reanudan una ejecución detenida' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué es seguro reanudar' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status = 'at_hold') THEN 'at_hold' ELSE 'in_progress' END,
           updated_at = now() WHERE id = r.id;
    PERFORM public.log_procedure_run_event(r, 'resumed', NULL, v_comment, NULL);
  ELSIF p_to = 'completed' AND r.status = 'in_progress' THEN
    IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status NOT IN ('done', 'released', 'na')) THEN
      RAISE EXCEPTION 'Quedan pasos sin completar o hold points sin liberar' USING ERRCODE = 'P0001';
    END IF;
    UPDATE procedure_runs SET status = 'completed', completed_by = v_uid, completed_at = now(), updated_at = now() WHERE id = r.id;
    PERFORM public.log_procedure_run_event(r, 'completed', NULL, NULL, NULL);
  ELSIF p_to = 'aborted' AND r.status IN ('in_progress', 'at_hold', 'stopped') THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores abortan una ejecución' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'aborted', aborted_by = v_uid, aborted_at = now(), abort_reason = v_comment, updated_at = now() WHERE id = r.id;
    PERFORM public.log_procedure_run_event(r, 'aborted', NULL, v_comment, NULL);
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_procedure_run(p_procedure_id uuid, p_system_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text; v_rev procedure_revisions%ROWTYPE; v_sys uuid; v_seq integer; v_id uuid; v_n integer;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_rev FROM procedure_revisions WHERE id = p.current_revision_id AND status = 'approved';
  IF v_rev.id IS NULL THEN RAISE EXCEPTION 'Solo se ejecuta una revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  v_sys := COALESCE(p.system_id, p_system_id);
  IF p.system_id IS NOT NULL AND p_system_id IS NOT NULL AND p_system_id <> p.system_id THEN
    RAISE EXCEPTION 'Este procedimiento es del sistema asignado' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(p.project_id, p.org_id, v_sys, NULL);
  v_seq := public.mgmt_next_seq('procedure_runs', p.project_id);
  SELECT COUNT(*) + 1 INTO v_n FROM procedure_runs WHERE procedure_id = p.id;
  INSERT INTO procedure_runs (org_id, project_id, procedure_id, revision_id, system_id, seq, number, started_by)
  VALUES (p.org_id, p.project_id, p.id, v_rev.id, v_sys, v_seq, p.number || '-R' || v_rev.rev || '-E' || v_n, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_run_steps (run_id, step_id, project_id, ord)
  SELECT v_id, s.id, p.project_id, s.ord FROM procedure_steps s WHERE s.revision_id = v_rev.id;
  INSERT INTO procedure_run_events (run_id, org_id, project_id, kind, user_id) VALUES (v_id, p.org_id, p.project_id, 'started', auth.uid());
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_staffing(p_system_id uuid, p_level integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- S25 (E-11): los turnos esperados salen del personal activo del proyecto (no de quienes ya fueron evaluados en el
  -- sistema): un turno sin nadie competente cuenta 0 y no pasa. Sin turnos cargados, todos forman un solo grupo «—»;
  -- con turnos cargados, quien no tiene turno no abre uno propio.
  WITH roster AS (
    SELECT op.id, NULLIF(btrim(op.shift), '') AS shift, public.person_system_level(op.id, p_system_id) AS lvl
    FROM ops_personnel op JOIN systems s ON s.id = p_system_id AND s.project_id = op.project_id
    WHERE op.active
  ),
  people AS (
    SELECT * FROM roster WHERE shift IS NOT NULL OR NOT EXISTS (SELECT 1 FROM roster WHERE shift IS NOT NULL)
  ),
  target AS (SELECT COALESCE((SELECT required FROM system_competency_targets WHERE system_id = p_system_id), 2) AS req),
  shifts AS (
    SELECT COALESCE(shift, '—') AS shift, COUNT(*) FILTER (WHERE lvl >= p_level) AS ok FROM people
    GROUP BY COALESCE(shift, '—')
  )
  SELECT jsonb_build_object(
    'level', p_level, 'required', (SELECT req FROM target),
    'by_shift', COALESCE((SELECT jsonb_agg(jsonb_build_object('shift', shift, 'count', ok) ORDER BY shift) FROM shifts), '[]'::jsonb),
    'ok', EXISTS (SELECT 1 FROM shifts) AND NOT EXISTS (SELECT 1 FROM shifts WHERE ok < (SELECT req FROM target)));
$function$;

CREATE OR REPLACE FUNCTION public.person_system_level(p_person_id uuid, p_system_id uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT CASE WHEN cr.expires_at IS NOT NULL AND cr.expires_at < public.project_today(cr.project_id) THEN 0 ELSE cr.level END
    FROM competency_records cr WHERE cr.person_id = p_person_id AND cr.system_id = p_system_id AND cr.voided_at IS NULL
    ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1), 0)::smallint;
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
  -- S25 (E-12): una ficha sin usuario con el mismo nombre que quien evalúa también es la suya.
  IF pe.user_id IS NULL AND public.person_name_key(pe.full_name) = public.person_name_key(public.profile_full_name(auth.uid())) THEN
    RAISE EXCEPTION 'Nadie evalúa su propia competencia (la ficha tiene tu nombre: vincúlala a otro usuario o pide que evalúe otra persona)' USING ERRCODE = '42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.request_ownership_transfer(p_system_id uuid, p_to_stage text, p_exceptions jsonb DEFAULT '[]'::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_proj uuid; v_org uuid; v_role text; v_from text; v_seq integer; v_id uuid; v_check jsonb := '[]'::jsonb; v_exc jsonb := '[]'::jsonb;
        v_reversal boolean; v_item jsonb; v_just text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT s.project_id, p.org_id INTO v_proj, v_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_proj);
  IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S25 (E-13): pide el traspaso un líder o superior.
  IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores piden un traspaso' USING ERRCODE = '42501'; END IF;
  INSERT INTO system_ownership (system_id, org_id, project_id) VALUES (p_system_id, v_org, v_proj) ON CONFLICT (system_id) DO NOTHING;
  SELECT stage INTO v_from FROM system_ownership WHERE system_id = p_system_id FOR UPDATE;
  IF public.ownership_stage_index(p_to_stage) IS NULL THEN RAISE EXCEPTION 'Etapa no válida' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM ownership_transfers WHERE system_id = p_system_id AND status = 'pending_signatures') THEN
    RAISE EXCEPTION 'Ya hay un traspaso pendiente de firmas en este sistema' USING ERRCODE = 'P0001';
  END IF;

  IF public.ownership_stage_index(p_to_stage) = public.ownership_stage_index(v_from) + 1 THEN
    v_reversal := false;
    v_check := public.ownership_checklist(p_system_id, p_to_stage);
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_check) WHERE NOT (value ->> 'ok')::boolean LOOP
      -- S25 (E-13): los ítems no dispensables de la org no se saltan con una justificación.
      IF (v_item ->> 'key') = ANY (public.org_transfer_non_dispensable(v_org)) THEN
        RAISE EXCEPTION 'Falta «%» y la política de la organización no permite dispensarlo', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      SELECT public.mgmt_text(x ->> 'justification', 2000) INTO v_just
      FROM jsonb_array_elements(COALESCE(p_exceptions, '[]'::jsonb)) x WHERE x ->> 'key' = v_item ->> 'key' LIMIT 1;
      IF v_just IS NULL OR length(v_just) < 10 THEN
        RAISE EXCEPTION 'Falta «%»: justifica la excepción (10 caracteres o más) para pedir el traspaso', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      v_exc := v_exc || jsonb_build_object('key', v_item ->> 'key', 'justification', v_just);
    END LOOP;
  ELSIF public.ownership_stage_index(p_to_stage) < public.ownership_stage_index(v_from) THEN
    v_reversal := true;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica el motivo de la reversión (10 caracteres o más)' USING ERRCODE = '22023'; END IF;
  ELSE
    RAISE EXCEPTION 'Solo se pide la etapa siguiente (o una anterior como reversión)' USING ERRCODE = 'P0001';
  END IF;

  v_seq := public.mgmt_next_seq('ownership_transfers', v_proj);
  INSERT INTO ownership_transfers (org_id, project_id, system_id, seq, number, from_stage, to_stage, is_reversal, reason, checklist, exceptions, requested_by)
  VALUES (v_org, v_proj, p_system_id, v_seq, 'TRF-' || lpad(v_seq::text, 4, '0'), v_from, p_to_stage, v_reversal, v_reason, v_check, v_exc, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_ownership_transfer(p_transfer_id uuid, p_capacity text, p_acknowledged text[] DEFAULT NULL::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE tr ownership_transfers%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_item jsonb; v_new text; v_keys text[]; v_missing text[];
BEGIN
  SELECT * INTO tr FROM ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF tr.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El traspaso % no espera firmas', tr.number USING ERRCODE = 'P0001'; END IF;
  v_role := public.register_caller_role(tr.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  -- S25 (E-13): cada firmante reconoce, una por una, las excepciones justificadas.
  SELECT COALESCE(array_agg(x ->> 'key'), ARRAY[]::text[]) INTO v_keys FROM jsonb_array_elements(COALESCE(tr.exceptions, '[]'::jsonb)) x;
  SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_missing FROM unnest(v_keys) k WHERE NOT (k = ANY (COALESCE(p_acknowledged, ARRAY[]::text[])));
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Reconoce cada excepción antes de firmar (falta: %)', array_to_string(v_missing, ', ') USING ERRCODE = 'P0001';
  END IF;

  IF p_capacity = 'commissioning' THEN
    -- S14 (D14): firmantes designados del proyecto (o, sin designados, el rol de respaldo).
    IF NOT public.has_capacity(tr.project_id, 'commissioning') THEN RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento' USING ERRCODE = '42501'; END IF;
    IF tr.commissioning_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Comisionamiento ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.operations_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET commissioning_signed_by = v_uid, commissioning_signed_at = now(), commissioning_ack = v_keys WHERE id = tr.id RETURNING * INTO tr;
  ELSIF p_capacity = 'operations' THEN
    IF NOT public.has_capacity(tr.project_id, 'operations') THEN RAISE EXCEPTION 'No estás designado para firmar como Operaciones' USING ERRCODE = '42501'; END IF;
    IF tr.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF tr.commissioning_signed_by = v_uid THEN RAISE EXCEPTION 'Las dos firmas deben ser de personas distintas' USING ERRCODE = '42501'; END IF;
    UPDATE ownership_transfers SET operations_signed_by = v_uid, operations_signed_at = now(), operations_ack = v_keys WHERE id = tr.id RETURNING * INTO tr;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;

  IF tr.commissioning_signed_by IS NULL OR tr.operations_signed_by IS NULL THEN RETURN 'pending_signatures'; END IF;

  -- Segunda firma: el checklist no puede haber empeorado sin justificación.
  IF NOT tr.is_reversal THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(public.ownership_checklist(tr.system_id, tr.to_stage)) WHERE NOT (value ->> 'ok')::boolean LOOP
      IF (v_item ->> 'key') = ANY (public.org_transfer_non_dispensable(tr.org_id)) THEN
        RAISE EXCEPTION 'Falta «%» y la política de la organización no permite dispensarlo', v_item ->> 'key' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tr.exceptions) x WHERE x ->> 'key' = v_item ->> 'key') THEN
        v_new := v_item ->> 'key';
        RAISE EXCEPTION 'El checklist cambió desde la solicitud: ahora falta «%». Cancela y vuelve a pedir el traspaso', v_new USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  UPDATE ownership_transfers SET status = 'completed', completed_at = now(),
         content_hash = encode(sha256(convert_to(jsonb_build_object('number', tr.number, 'system', tr.system_id, 'from', tr.from_stage, 'to', tr.to_stage,
           'checklist', tr.checklist, 'exceptions', tr.exceptions, 'reason', tr.reason, 'c', tr.commissioning_signed_by, 'c_at', tr.commissioning_signed_at,
           'o', tr.operations_signed_by, 'o_at', tr.operations_signed_at, 'c_ack', tr.commissioning_ack, 'o_ack', tr.operations_ack)::text, 'UTF8')), 'hex')
   WHERE id = tr.id;
  UPDATE system_ownership SET stage = tr.to_stage, since = now(), last_transfer_id = tr.id WHERE system_id = tr.system_id;
  -- Reversión desde Operaciones: el paquete de handover emitido por el traspaso anterior queda reemplazado (§12.26).
  IF tr.is_reversal AND tr.from_stage = 'operations' THEN
    UPDATE handover_packages SET status = 'SUPERSEDED'
     WHERE status = 'ISSUED' AND id IN (SELECT handover_package_id FROM ownership_transfers
                                        WHERE system_id = tr.system_id AND to_stage = 'operations' AND handover_package_id IS NOT NULL);
  END IF;
  RETURN 'completed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_startup_event(p_project_id uuid, p_system_id uuid, p_kind text, p_code text, p_occurred_at timestamp with time zone, p_title text, p_description text DEFAULT NULL::text, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_run_id uuid DEFAULT NULL::uuid, p_signal_ids uuid[] DEFAULT NULL::uuid[], p_manual jsonb DEFAULT NULL::jsonb, p_backdate_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid; v_pre jsonb; v_sig uuid; e jsonb; v_missing text[];
        v_backdate text := public.mgmt_text(p_backdate_reason, 2000); v_at timestamptz; v_val text;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El evento necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_occurred_at IS NULL OR p_occurred_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'La hora del evento no puede ser futura' USING ERRCODE = '22023'; END IF;
  -- S25 (E-16): más de 7 días hacia atrás solo un líder o superior, con motivo (queda en el evento).
  IF p_occurred_at < now() - interval '7 days' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
      RAISE EXCEPTION 'Un evento de hace más de 7 días lo registra un líder o superior, con motivo' USING ERRCODE = '42501';
    END IF;
    IF v_backdate IS NULL OR length(v_backdate) < 10 THEN
      RAISE EXCEPTION 'Indica por qué se registra un evento de hace más de 7 días (10 caracteres o más)' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_backdate := NULL;
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  IF p_run_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedure_runs WHERE id = p_run_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'La ejecución no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF p_tag_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_tag_ids) x WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = x AND t.project_id = p_project_id)) THEN
    RAISE EXCEPTION 'Hay tags que no pertenecen al proyecto' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'milestone' THEN
    IF EXISTS (SELECT 1 FROM startup_events WHERE system_id = p_system_id AND milestone = p_code AND kind = 'milestone' AND status <> 'voided') THEN
      RAISE EXCEPTION 'Este hito ya está registrado en el sistema: anúlalo con motivo para volver a registrarlo' USING ERRCODE = 'P0001';
    END IF;
    -- Bloqueo duro (§12.12): primer arranque y primer HC.
    IF p_code IN ('first_startup', 'first_hydrocarbon') THEN
      v_pre := public.startup_prerequisites(p_system_id);
      v_missing := ARRAY[]::text[];
      IF NOT (v_pre ->> 'gate_ok')::boolean THEN v_missing := v_missing || ('gate ' || COALESCE(v_pre ->> 'gate_code', '?') || ' aprobado con todas sus firmas'); END IF;
      IF NOT (v_pre ->> 'pssr_ok')::boolean THEN v_missing := v_missing || ('PSSR ' || COALESCE(v_pre ->> 'pssr_number', 'del sistema') || ' aprobado'); END IF;
      IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'No se puede registrar este hito: falta %', array_to_string(v_missing, ' y ') USING ERRCODE = 'P0001';
      END IF;
      -- S25 (E-16): los prerrequisitos se cumplían a la hora del hito, no solo hoy.
      SELECT COALESCE(a.completed_at, a.approved_at) INTO v_at FROM system_gate_approvals a
       WHERE a.system_id = p_system_id AND a.gate_id = (v_pre ->> 'gate_id')::uuid AND a.revoked_at IS NULL;
      IF v_at > p_occurred_at THEN
        RAISE EXCEPTION 'El gate % se aprobó (%) después de la hora del hito', v_pre ->> 'gate_code', to_char(v_at, 'YYYY-MM-DD HH24:MI') USING ERRCODE = 'P0001';
      END IF;
      SELECT r.approved_at INTO v_at FROM pssr_reviews r WHERE r.system_id = p_system_id AND r.review_number = v_pre ->> 'pssr_number';
      IF v_at > p_occurred_at THEN
        RAISE EXCEPTION 'El PSSR % se aprobó (%) después de la hora del hito', v_pre ->> 'pssr_number', to_char(v_at, 'YYYY-MM-DD HH24:MI') USING ERRCODE = 'P0001';
      END IF;
    END IF;
    -- S25 (E-16): operación estable y producto on-spec van después de un primer arranque atestiguado (KPI §23).
    IF p_code IN ('first_stable_operation', 'first_on_spec_product') THEN
      SELECT occurred_at INTO v_at FROM startup_events
       WHERE system_id = p_system_id AND kind = 'milestone' AND milestone = 'first_startup' AND status = 'witnessed';
      IF v_at IS NULL THEN
        RAISE EXCEPTION 'Primero se registra y atestigua el primer arranque del sistema' USING ERRCODE = 'P0001';
      END IF;
      IF v_at >= p_occurred_at THEN
        RAISE EXCEPTION 'Este hito debe ser posterior al primer arranque (%)', to_char(v_at, 'YYYY-MM-DD HH24:MI') USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF p_kind <> 'free' THEN
    RAISE EXCEPTION 'Tipo de evento no válido' USING ERRCODE = '22023';
  END IF;

  v_seq := public.mgmt_next_seq('startup_events', p_project_id);
  INSERT INTO startup_events (org_id, project_id, seq, number, system_id, kind, milestone, category, occurred_at, title, description, run_id,
                              status, recorded_by, witness_capacity, backdate_reason)
  VALUES (v_org, p_project_id, v_seq, 'EVT-' || lpad(v_seq::text, 4, '0'), p_system_id, p_kind,
          CASE WHEN p_kind = 'milestone' THEN p_code END, CASE WHEN p_kind = 'free' THEN p_code END,
          p_occurred_at, public.mgmt_text(p_title, 200), public.mgmt_text(p_description, 8000), p_run_id,
          CASE WHEN p_kind = 'milestone' THEN 'pending_witness' ELSE 'recorded' END, auth.uid(),
          CASE WHEN p_kind = 'milestone' THEN public.milestone_witness_capacity(p_code) END, v_backdate)
  RETURNING id INTO v_id;

  IF p_tag_ids IS NOT NULL THEN
    INSERT INTO startup_event_tags (event_id, tag_id, project_id) SELECT DISTINCT v_id, x, p_project_id FROM unnest(p_tag_ids) x;
  END IF;
  FOREACH v_sig IN ARRAY COALESCE(p_signal_ids, ARRAY[]::uuid[]) LOOP
    PERFORM public.startup_snapshot_param(v_id, p_project_id, v_sig, p_occurred_at);
  END LOOP;
  IF p_manual IS NOT NULL THEN
    IF jsonb_typeof(p_manual) <> 'array' OR jsonb_array_length(p_manual) > 50 THEN RAISE EXCEPTION 'Parámetros no válidos' USING ERRCODE = '22023'; END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_manual) LOOP
      IF public.mgmt_text(e ->> 'label', 100) IS NULL THEN CONTINUE; END IF;
      -- S25 (E-36): coma decimal igual que add_startup_event_param.
      v_val := btrim(e ->> 'value');
      INSERT INTO startup_event_params (event_id, project_id, label, value, value_text, unit, source, added_by)
      VALUES (v_id, p_project_id, public.mgmt_text(e ->> 'label', 100),
              CASE WHEN v_val ~ '^-?[0-9]+([.,][0-9]+)?$' THEN replace(v_val, ',', '.')::double precision END,
              CASE WHEN NOT (v_val ~ '^-?[0-9]+([.,][0-9]+)?$') THEN public.mgmt_text(v_val, 200) END,
              public.mgmt_text(e ->> 'unit', 30), 'manual', auth.uid());
    END LOOP;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.performance_freeze_run(p_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE; v_n integer;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  -- S25 (E-17): re-congelar nunca borra lo ya congelado (la purga de 90 días dejaría la prueba sin evidencia):
  -- solo agrega o actualiza los minutos con muestras.
  INSERT INTO performance_run_data (run_id, variable_id, project_id, bucket, avg_val, min_val, max_val, n_good, n_bad, source)
  SELECT r.id, v.id, r.project_id, date_trunc('minute', ss.sampled_at),
         avg(ss.value) FILTER (WHERE ss.quality = 0), min(ss.value) FILTER (WHERE ss.quality = 0), max(ss.value) FILTER (WHERE ss.quality = 0),
         count(ss.value) FILTER (WHERE ss.quality = 0), count(*) FILTER (WHERE ss.quality <> 0 OR ss.value IS NULL), 'iiot'
  FROM performance_variables v
  JOIN signal_samples ss ON ss.signal_id = v.signal_id
   AND ss.sampled_at >= date_trunc('minute', r.stabilization_started_at) AND ss.sampled_at < r.closed_at
  WHERE v.revision_id = r.revision_id AND v.source = 'signal'
  GROUP BY v.id, date_trunc('minute', ss.sampled_at)
  ON CONFLICT (run_id, variable_id, bucket) DO UPDATE
     SET avg_val = EXCLUDED.avg_val, min_val = EXCLUDED.min_val, max_val = EXCLUDED.max_val, n_good = EXCLUDED.n_good, n_bad = EXCLUDED.n_bad
   WHERE performance_run_data.source = 'iiot';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE performance_runs SET frozen_at = now(), frozen_rows = (SELECT count(*) FROM performance_run_data WHERE run_id = r.id), updated_at = now()
   WHERE id = r.id;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.performance_evaluate_core(p_run_id uuid, p_ignore_exclusions boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r performance_runs%ROWTYPE; rev performance_test_revisions%ROWTYPE; v record; c record; p record;
  v_from timestamptz; v_to timestamptz; v_total integer; v_valid integer; v_excl integer;
  v_vars jsonb := '[]'::jsonb; v_crits jsonb := '[]'::jsonb; v_pairs jsonb := '[]'::jsonb; v_reasons text[] := ARRAY[]::text[];
  v_expected numeric; v_present integer; v_cov numeric; v_bad numeric; v_spikes integer; v_oor integer; v_unit_ok boolean;
  v_sig_tag text; v_sig_unit text; v_rmin numeric; v_rmax numeric; v_val double precision; v_margin_lo numeric; v_margin_hi numeric; v_outcome text; v_n integer;
  v_any_fail boolean := false; v_any_within boolean := false; v_any_ne boolean := false; v_diff double precision; v_suggest text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  SELECT * INTO rev FROM performance_test_revisions WHERE id = r.revision_id;
  v_from := date_trunc('minute', r.formal_started_at);
  v_to := r.closed_at;

  DROP TABLE IF EXISTS _pf_min; DROP TABLE IF EXISTS _pf_val; DROP TABLE IF EXISTS _pf_var;
  CREATE TEMP TABLE _pf_min ON COMMIT DROP AS
    SELECT b, NOT EXISTS (
             SELECT 1 FROM performance_disturbances d
             WHERE d.run_id = r.id AND d.excluded AND NOT p_ignore_exclusions AND d.started_at < b + interval '1 minute' AND COALESCE(d.ended_at, r.closed_at) > b) AS valid
    FROM generate_series(v_from, v_to - interval '1 microsecond', interval '1 minute') b;
  SELECT count(*), count(*) FILTER (WHERE valid) INTO v_total, v_valid FROM _pf_min;
  v_excl := v_total - v_valid;
  CREATE TEMP TABLE _pf_val (key text, b timestamptz, val double precision, PRIMARY KEY (key, b)) ON COMMIT DROP;
  CREATE TEMP TABLE _pf_var (key text PRIMARY KEY, evaluable boolean) ON COMMIT DROP;

  -- Señales: promedio del minuto con datos buenos.
  INSERT INTO _pf_val (key, b, val)
  SELECT pv.key, d.bucket, d.avg_val
  FROM performance_variables pv
  JOIN performance_run_data d ON d.run_id = r.id AND d.variable_id = pv.id AND d.n_good > 0 AND d.avg_val IS NOT NULL
  JOIN _pf_min m ON m.b = d.bucket AND m.valid
  WHERE pv.revision_id = r.revision_id AND pv.source = 'signal';
  -- Manuales: última lectura vigente sostenida en cada minuto válido.
  INSERT INTO _pf_val (key, b, val)
  SELECT pv.key, m.b, (SELECT d.avg_val FROM performance_run_data d
                         WHERE d.run_id = r.id AND d.variable_id = pv.id AND d.bucket <= m.b ORDER BY d.bucket DESC LIMIT 1)
  FROM performance_variables pv CROSS JOIN _pf_min m
  WHERE pv.revision_id = r.revision_id AND pv.source = 'manual' AND m.valid
    AND EXISTS (SELECT 1 FROM performance_run_data d WHERE d.run_id = r.id AND d.variable_id = pv.id AND d.bucket <= m.b);

  -- Validación de variables base.
  FOR v IN SELECT * FROM performance_variables WHERE revision_id = r.revision_id AND source <> 'derived' ORDER BY ord LOOP
    v_unit_ok := true; v_spikes := 0; v_oor := 0; v_bad := 0; v_sig_tag := NULL; v_sig_unit := NULL; v_rmin := NULL; v_rmax := NULL;
    IF v.source = 'signal' THEN
      SELECT s.signal_tag, s.eng_unit, s.range_min, s.range_max INTO v_sig_tag, v_sig_unit, v_rmin, v_rmax FROM signals s WHERE s.id = v.signal_id;
      v_unit_ok := public.mgmt_text(v_sig_unit, 40) IS NULL OR v.unit IS NULL OR lower(btrim(v_sig_unit)) = lower(btrim(v.unit));
      v_expected := v_valid * LEAST(1, 60.0 / rev.sample_interval_s);
      SELECT count(*) INTO v_present FROM _pf_val WHERE key = v.key;
      SELECT COALESCE(100.0 * sum(d.n_bad) / NULLIF(sum(d.n_good + d.n_bad), 0), 0) INTO v_bad
      FROM performance_run_data d JOIN _pf_min m ON m.b = d.bucket AND m.valid
      WHERE d.run_id = r.id AND d.variable_id = v.id;
      SELECT count(*) FILTER (WHERE v_rmin IS NOT NULL AND v_rmax IS NOT NULL AND v_rmax > v_rmin AND (val < v_rmin OR val > v_rmax))
        INTO v_oor FROM _pf_val WHERE key = v.key;
      -- S12 (E-18): los minutos fuera del rango del instrumento no entran al estadístico (cuentan como faltantes).
      IF v_oor > 0 AND rev.exclude_out_of_range THEN
        DELETE FROM _pf_val WHERE key = v.key AND (val < v_rmin OR val > v_rmax);
        v_present := v_present - v_oor;
      END IF;
    ELSE
      v_expected := ceil(v_valid::numeric / v.manual_every_min);
      SELECT count(*) INTO v_present FROM performance_run_data d JOIN _pf_min m ON m.b = d.bucket AND m.valid
       WHERE d.run_id = r.id AND d.variable_id = v.id;
    END IF;
    IF v.max_step IS NOT NULL THEN
      SELECT count(*) INTO v_spikes FROM (
        SELECT abs(val - lag(val) OVER (ORDER BY b)) AS step FROM _pf_val WHERE key = v.key) s
      WHERE s.step > v.max_step;
    END IF;
    v_cov := CASE WHEN v_expected > 0 THEN LEAST(100, round(100.0 * v_present / v_expected, 2)) ELSE 0 END;
    -- S12 (E-18): la calidad mala y los picos ya no son solo informativos: por encima del umbral de la revisión
    -- la sugerencia pasa a «no concluyente» (la evaluación no corrige los datos).
    INSERT INTO _pf_var VALUES (v.key, v_unit_ok AND v_cov >= rev.min_coverage_pct AND v_valid > 0);
    v_vars := v_vars || jsonb_build_array(jsonb_build_object(
      'key', v.key, 'label', v.label, 'unit', v.unit, 'source', v.source, 'signal', v_sig_tag,
      'expected', round(v_expected, 2), 'present', v_present, 'coverage_pct', v_cov, 'coverage_ok', v_cov >= rev.min_coverage_pct,
      'bad_pct', round(v_bad, 2), 'spikes', v_spikes, 'out_of_range', v_oor, 'unit_ok', v_unit_ok,
      'quality_ok', v_bad <= rev.max_bad_pct AND (rev.max_spikes IS NULL OR v_spikes <= rev.max_spikes),
      'out_of_range_excluded', v_oor > 0 AND rev.exclude_out_of_range,
      'evaluable', v_unit_ok AND v_cov >= rev.min_coverage_pct AND v_valid > 0));
  END LOOP;

  -- Derivadas, en orden de dependencias (iterando hasta que no se agreguen más).
  FOR v_n IN 1..20 LOOP
    INSERT INTO _pf_var (key, evaluable)
    SELECT pv.key, va.evaluable AND vb.evaluable
    FROM performance_variables pv
    JOIN _pf_var va ON va.key = pv.operand_a
    JOIN _pf_var vb ON vb.key = pv.operand_b
    WHERE pv.revision_id = r.revision_id AND pv.source = 'derived' AND NOT EXISTS (SELECT 1 FROM _pf_var x WHERE x.key = pv.key);
    EXIT WHEN NOT FOUND;
    INSERT INTO _pf_val (key, b, val)
    SELECT pv.key, a.b,
           CASE pv.op WHEN '+' THEN a.val + bb.val WHEN '-' THEN a.val - bb.val WHEN '*' THEN a.val * bb.val
                      ELSE CASE WHEN bb.val = 0 THEN NULL ELSE a.val / bb.val END END
    FROM performance_variables pv
    JOIN _pf_val a ON a.key = pv.operand_a
    JOIN _pf_val bb ON bb.key = pv.operand_b AND bb.b = a.b
    WHERE pv.revision_id = r.revision_id AND pv.source = 'derived'
      AND NOT EXISTS (SELECT 1 FROM _pf_val x WHERE x.key = pv.key)
      AND EXISTS (SELECT 1 FROM _pf_var x WHERE x.key = pv.key)
    ON CONFLICT DO NOTHING;
    DELETE FROM _pf_val WHERE val IS NULL;
  END LOOP;
  FOR v IN SELECT pv.*, x.evaluable FROM performance_variables pv JOIN _pf_var x ON x.key = pv.key
            WHERE pv.revision_id = r.revision_id AND pv.source = 'derived' ORDER BY pv.ord LOOP
    SELECT count(*) INTO v_present FROM _pf_val WHERE key = v.key;
    v_vars := v_vars || jsonb_build_array(jsonb_build_object(
      'key', v.key, 'label', v.label, 'unit', v.unit, 'source', 'derived', 'formula', v.operand_a || ' ' || v.op || ' ' || v.operand_b,
      'present', v_present, 'coverage_pct', CASE WHEN v_valid > 0 THEN round(100.0 * v_present / v_valid, 2) ELSE 0 END,
      'evaluable', v.evaluable AND v_present > 0));
    UPDATE _pf_var SET evaluable = v.evaluable AND v_present > 0 WHERE key = v.key;
  END LOOP;

  -- Criterios.
  FOR c IN SELECT * FROM performance_criteria WHERE revision_id = r.revision_id ORDER BY ord LOOP
    v_val := NULL;
    IF c.statistic = 'avg' THEN SELECT avg(val) INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'min' THEN SELECT min(val) INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'max' THEN SELECT max(val) INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'pct_in_band' THEN
      SELECT 100.0 * count(*) FILTER (WHERE (c.band_lo IS NULL OR val >= c.band_lo) AND (c.band_hi IS NULL OR val <= c.band_hi)) / NULLIF(count(*), 0)
        INTO v_val FROM _pf_val WHERE key = c.variable_key;
    ELSIF c.statistic = 'total' THEN
      -- Suma de los minutos válidos con dato (no extrapola los faltantes ni los excluidos; S12 E-28 documenta y
      -- agrega value_extrapolated = promedio × minutos del periodo formal).
      SELECT sum(val) / CASE c.total_basis WHEN 'min' THEN 1 WHEN 'h' THEN 60 ELSE 1440 END INTO v_val FROM _pf_val WHERE key = c.variable_key;
    END IF;
    v_margin_lo := CASE c.uncertainty_mode WHEN 'pct' THEN abs(c.target) * c.uncertainty / 100 ELSE c.uncertainty END;
    v_margin_hi := CASE c.uncertainty_mode WHEN 'pct' THEN abs(COALESCE(c.target_hi, c.target)) * c.uncertainty / 100 ELSE c.uncertainty END;
    IF v_val IS NULL OR NOT COALESCE((SELECT evaluable FROM _pf_var WHERE key = c.variable_key), false) THEN
      v_outcome := 'not_evaluable';
    ELSIF c.operator = 'gte' THEN
      v_outcome := CASE WHEN v_val >= c.target THEN 'pass' WHEN v_val >= c.target - v_margin_lo THEN 'within_uncertainty' ELSE 'fail' END;
    ELSIF c.operator = 'lte' THEN
      v_outcome := CASE WHEN v_val <= c.target THEN 'pass' WHEN v_val <= c.target + v_margin_lo THEN 'within_uncertainty' ELSE 'fail' END;
    ELSE
      v_outcome := CASE WHEN v_val BETWEEN c.target AND c.target_hi THEN 'pass'
                        WHEN v_val BETWEEN c.target - v_margin_lo AND c.target_hi + v_margin_hi THEN 'within_uncertainty' ELSE 'fail' END;
    END IF;
    v_any_fail := v_any_fail OR v_outcome = 'fail';
    v_any_within := v_any_within OR v_outcome = 'within_uncertainty';
    v_any_ne := v_any_ne OR v_outcome = 'not_evaluable';
    v_crits := v_crits || jsonb_build_array(jsonb_build_object(
      'ord', c.ord, 'variable_key', c.variable_key, 'label', c.label, 'statistic', c.statistic, 'band_lo', c.band_lo, 'band_hi', c.band_hi,
      'total_basis', c.total_basis, 'operator', c.operator, 'target', c.target, 'target_hi', c.target_hi,
      'uncertainty', c.uncertainty, 'uncertainty_mode', c.uncertainty_mode,
      'value', CASE WHEN v_val IS NULL THEN NULL ELSE round(v_val::numeric, 6) END, 'outcome', v_outcome,
      'value_extrapolated', CASE WHEN c.statistic = 'total' THEN (SELECT round((avg(val) * v_total / CASE c.total_basis WHEN 'min' THEN 1 WHEN 'h' THEN 60 ELSE 1440 END)::numeric, 6)
                                                                  FROM _pf_val WHERE key = c.variable_key) END));
  END LOOP;

  -- Pares de medidores: diferencia relativa promedio.
  FOR p IN SELECT * FROM performance_meter_pairs WHERE revision_id = r.revision_id ORDER BY ord LOOP
    SELECT avg(abs(a.val - b2.val) / NULLIF(abs((a.val + b2.val) / 2), 0)) * 100, count(*)
      INTO v_diff, v_n
    FROM _pf_val a JOIN _pf_val b2 ON b2.key = p.variable_b AND b2.b = a.b WHERE a.key = p.variable_a;
    v_pairs := v_pairs || jsonb_build_array(jsonb_build_object(
      'variable_a', p.variable_a, 'variable_b', p.variable_b, 'max_diff_pct', p.max_diff_pct,
      'diff_pct', CASE WHEN v_diff IS NULL THEN NULL ELSE round(v_diff::numeric, 3) END, 'minutes', v_n,
      'ok', v_diff IS NOT NULL AND v_diff <= p.max_diff_pct));
    IF v_diff IS NULL OR v_diff > p.max_diff_pct THEN v_reasons := array_append(v_reasons, 'pair'); END IF;
  END LOOP;

  IF v_valid = 0 THEN v_reasons := array_append(v_reasons, 'no_valid_data'); END IF;
  IF r.early_close THEN v_reasons := array_append(v_reasons, 'early_close'); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_vars) x
              WHERE (x ->> 'source') <> 'derived' AND NOT (x ->> 'unit_ok')::boolean
                AND (EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.revision_id AND variable_key = x ->> 'key')
                  OR EXISTS (SELECT 1 FROM performance_meter_pairs WHERE revision_id = r.revision_id AND (variable_a = x ->> 'key' OR variable_b = x ->> 'key'))
                  OR EXISTS (SELECT 1 FROM performance_variables d WHERE d.revision_id = r.revision_id AND d.source = 'derived' AND (d.operand_a = x ->> 'key' OR d.operand_b = x ->> 'key')))) THEN
    v_reasons := array_append(v_reasons, 'unit');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_vars) x
              WHERE (x ->> 'source') <> 'derived' AND NOT (x ->> 'coverage_ok')::boolean
                AND (EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.revision_id AND variable_key = x ->> 'key')
                  OR EXISTS (SELECT 1 FROM performance_meter_pairs WHERE revision_id = r.revision_id AND (variable_a = x ->> 'key' OR variable_b = x ->> 'key'))
                  OR EXISTS (SELECT 1 FROM performance_variables d WHERE d.revision_id = r.revision_id AND d.source = 'derived' AND (d.operand_a = x ->> 'key' OR d.operand_b = x ->> 'key')))) THEN
    v_reasons := array_append(v_reasons, 'coverage');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_vars) x
              WHERE (x ->> 'source') <> 'derived' AND NOT COALESCE((x ->> 'quality_ok')::boolean, true)
                AND (EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.revision_id AND variable_key = x ->> 'key')
                  OR EXISTS (SELECT 1 FROM performance_meter_pairs WHERE revision_id = r.revision_id AND (variable_a = x ->> 'key' OR variable_b = x ->> 'key'))
                  OR EXISTS (SELECT 1 FROM performance_variables d WHERE d.revision_id = r.revision_id AND d.source = 'derived' AND (d.operand_a = x ->> 'key' OR d.operand_b = x ->> 'key')))) THEN
    v_reasons := array_append(v_reasons, 'data_quality');
  END IF;
  IF v_any_ne AND NOT ('coverage' = ANY (v_reasons) OR 'unit' = ANY (v_reasons)) THEN v_reasons := array_append(v_reasons, 'not_evaluable'); END IF;

  v_suggest := CASE WHEN cardinality(v_reasons) > 0 THEN 'inconclusive'
                    WHEN v_any_fail THEN 'failed'
                    WHEN v_any_within THEN 'accepted_with_deviation'
                    ELSE 'accepted' END;

  RETURN jsonb_build_object(
    'run', r.number, 'revision', rev.rev, 'revision_hash', rev.content_hash, 'computed_at', now(),
    'window', jsonb_build_object('from', v_from, 'to', v_to, 'total_min', v_total, 'excluded_min', v_excl, 'valid_min', v_valid,
                                 'formal_min', rev.formal_min, 'min_coverage_pct', rev.min_coverage_pct, 'early_close', r.early_close,
                                 'max_bad_pct', rev.max_bad_pct, 'max_spikes', rev.max_spikes, 'exclude_out_of_range', rev.exclude_out_of_range),
    'variables', v_vars, 'criteria', v_crits, 'pairs', v_pairs,
    'reasons', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_reasons) ORDER BY 1)), 'suggested', v_suggest);
END;
$function$;

CREATE OR REPLACE FUNCTION public.performance_compute_evaluation(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S25 (E-19): con exclusiones, la evaluación trae también el resultado sin ellas y si cambian el sugerido; el
-- representante del cliente debe reconocerlas antes de registrar el resultado (record_performance_result).
DECLARE v jsonb; u jsonb; v_excl jsonb;
BEGIN
  v := public.performance_evaluate_core(p_run_id, false);
  SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'started_at', d.started_at, 'ended_at', d.ended_at,
           'reason', d.exclusion_reason, 'excluded_by', d.excluded_by, 'excluded_at', d.excluded_at,
           'client_ack_by', d.client_ack_by, 'client_ack_at', d.client_ack_at) ORDER BY d.started_at)
    INTO v_excl
  FROM performance_disturbances d WHERE d.run_id = p_run_id AND d.excluded;
  IF v_excl IS NULL THEN RETURN v; END IF;
  u := public.performance_evaluate_core(p_run_id, true);
  RETURN v || jsonb_build_object(
    'exclusions', v_excl,
    'without_exclusions', jsonb_build_object(
      'suggested', u ->> 'suggested', 'valid_min', u -> 'window' -> 'valid_min', 'reasons', u -> 'reasons',
      'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object('ord', x -> 'ord', 'value', x -> 'value', 'outcome', x -> 'outcome'))
                            FROM jsonb_array_elements(u -> 'criteria') x), '[]'::jsonb)),
    'exclusions_change_result', (u ->> 'suggested') IS DISTINCT FROM (v ->> 'suggested'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_performance_result(p_run_id uuid, p_result text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r performance_runs%ROWTYPE; t performance_tests%ROWTYPE; v_role text; v_eval jsonb; v_reason text := public.mgmt_text(p_reason, 2000);
  v_hash text; v_seq integer; v_action uuid; v_failed text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores registran el resultado' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se registra el resultado de un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  IF p_result NOT IN ('accepted', 'accepted_with_deviation', 'repeat', 'failed', 'inconclusive') THEN
    RAISE EXCEPTION 'Resultado no válido' USING ERRCODE = '22023';
  END IF;
  v_eval := public.performance_compute_evaluation(r.id);
  -- S25 (E-19): si las exclusiones cambian el resultado sugerido, el representante del cliente las reconoce antes.
  IF COALESCE((v_eval ->> 'exclusions_change_result')::boolean, false)
     AND EXISTS (SELECT 1 FROM performance_disturbances WHERE run_id = r.id AND excluded AND client_ack_by IS NULL) THEN
    RAISE EXCEPTION 'Las exclusiones cambian el resultado sugerido (sin ellas: «%»; con ellas: «%»): el representante del cliente debe reconocerlas',
      v_eval -> 'without_exclusions' ->> 'suggested', v_eval ->> 'suggested' USING ERRCODE = 'P0001';
  END IF;
  IF p_result <> (v_eval ->> 'suggested') AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'El resultado sugerido es «%»: indica por qué registras otro', v_eval ->> 'suggested' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM performance_tests WHERE id = r.test_id;
  v_eval := v_eval || jsonb_build_object('result', p_result, 'result_reason', v_reason, 'result_by', auth.uid(), 'result_at', now());
  v_hash := encode(sha256(convert_to(v_eval::text, 'UTF8')), 'hex');

  IF p_result IN ('failed', 'accepted_with_deviation') THEN
    SELECT string_agg(format('%s %s %s (obtenido %s)', x ->> 'variable_key', x ->> 'statistic', x ->> 'outcome', COALESCE(x ->> 'value', '—')), E'\n')
      INTO v_failed
    FROM jsonb_array_elements(v_eval -> 'criteria') x WHERE x ->> 'outcome' IN ('fail', 'within_uncertainty');
    v_seq := public.mgmt_next_seq('actions', r.project_id);
    INSERT INTO actions (org_id, project_id, seq, number, title, description, source_kind, source_id, source_ref,
                         system_id, owner_id, priority, verification_method, created_by)
    VALUES (r.org_id, r.project_id, v_seq, 'ACC-' || lpad(v_seq::text, 4, '0'),
            left(r.number || ' — ' || CASE p_result WHEN 'failed' THEN 'prueba de desempeño fallida' ELSE 'aceptada con desviación' END || ': ' || t.title, 200),
            concat_ws(E'\n', v_failed, v_reason),
            'performance', r.id, r.number, t.primary_system_id, auth.uid(),
            CASE p_result WHEN 'failed' THEN 'high' ELSE 'medium' END, 'test', auth.uid())
    RETURNING id INTO v_action;
    INSERT INTO mgmt_events (org_id, project_id, entity_kind, entity_id, action, to_value, user_id, comment)
    VALUES (r.org_id, r.project_id, 'action', v_action, 'created', 'open', auth.uid(), 'Automática: resultado de ' || r.number);
  END IF;

  UPDATE performance_runs SET status = 'evaluated', suggested_result = v_eval ->> 'suggested', result = p_result, result_reason = v_reason,
         result_by = auth.uid(), result_at = now(), evaluation = v_eval, evaluation_hash = v_hash, action_id = v_action, updated_at = now()
   WHERE id = r.id;
  RETURN v_action;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_performance_disturbance_exclusion(p_disturbance_id uuid, p_excluded boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d performance_disturbances%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO d FROM performance_disturbances WHERE id = p_disturbance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perturbación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO r FROM performance_runs WHERE id = d.run_id;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores excluyen perturbaciones del cálculo' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('formal', 'closed') THEN RAISE EXCEPTION 'Solo se excluyen perturbaciones del periodo formal' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_excluded, false) = d.excluded THEN RETURN; END IF;
  -- S25 (E-19): cambiar una exclusión invalida el reconocimiento del cliente.
  UPDATE performance_disturbances SET excluded = COALESCE(p_excluded, false), exclusion_reason = v_reason, excluded_by = auth.uid(), excluded_at = now(),
         client_ack_by = NULL, client_ack_at = NULL
   WHERE id = d.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.acknowledge_performance_exclusions(p_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S25 (E-19): el representante del cliente reconoce las exclusiones vigentes de un intento cerrado, después de ver
-- el resultado con y sin ellas. Nunca quien excluyó.
DECLARE r performance_runs%ROWTYPE; v_n integer;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_capacity(r.project_id, 'client_rep') THEN
    RAISE EXCEPTION 'Reconoce las exclusiones el representante del cliente designado' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se reconocen exclusiones de un intento cerrado sin resultado' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM performance_disturbances WHERE run_id = r.id AND excluded AND client_ack_by IS NULL AND excluded_by = auth.uid()) THEN
    RAISE EXCEPTION 'No reconoces una exclusión que hiciste tú' USING ERRCODE = '42501';
  END IF;
  UPDATE performance_disturbances SET client_ack_by = auth.uid(), client_ack_at = now()
   WHERE run_id = r.id AND excluded AND client_ack_by IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_lineup_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id;
  v_role := public.register_caller_role(s.project_id);
  -- S25 (E-36): mismas reglas que set_lineup_item (el cliente no ejecuta line-ups).
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  IF it.set_at IS NULL THEN RAISE EXCEPTION 'Primero registra la posición de la fila' USING ERRCODE = 'P0001'; END IF;
  IF it.set_by = auth.uid() THEN RAISE EXCEPTION 'La verificación independiente la hace otra persona' USING ERRCODE = '42501'; END IF;
  IF it.found_position IS DISTINCT FROM it.required_position THEN
    RAISE EXCEPTION 'La posición encontrada no es la requerida: corrígela antes de verificar' USING ERRCODE = 'P0001';
  END IF;
  UPDATE lineup_items SET verified_by = auth.uid(), verified_at = now() WHERE id = it.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_procedure(p_procedure_id uuid, p_title text, p_kind text, p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  PERFORM public.mgmt_check_refs(p.project_id, p.org_id, p_system_id, NULL);
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  -- S25 (E-36): sin tipo se conserva el actual; uno desconocido es un error claro, no una violación de restricción.
  IF p_kind IS NOT NULL AND p_kind NOT IN ('precommissioning', 'commissioning', 'startup', 'shutdown', 'emergency', 'normal_operation') THEN
    RAISE EXCEPTION 'Tipo de procedimiento no válido' USING ERRCODE = '22023';
  END IF;
  UPDATE procedures SET title = public.mgmt_text(p_title, 200), kind = COALESCE(p_kind, p.kind), system_id = p_system_id, updated_at = now() WHERE id = p_procedure_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_handover_package(p_project_id uuid, p_system_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S24 (D17, E-05/F-22): paquete de handover v3 — todo F1–F8 por sistema, con firmas (nombre + empresa congelada) y hashes.
-- S25: comentario de liberación de holds, línea de tiempo de la ejecución, competencias sin anuladas y reconocimientos del traspaso.
DECLARE
  v_org_id  uuid;
  v_scope   uuid[];
  v_project jsonb;
  v_systems jsonb;
  v_punches jsonb;
  v_certs   jsonb;
BEGIN
  SELECT p.org_id INTO v_org_id FROM projects p WHERE p.id = p_project_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(s.id), '{}') INTO v_scope FROM systems s
  WHERE s.project_id = p_project_id
    AND (p_system_ids IS NULL OR cardinality(p_system_ids) = 0 OR s.id = ANY (p_system_ids));

  SELECT jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'client', p.client, 'location', p.location,
           'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date, 'timezone', p.timezone,
           'org_name', o.name)
  INTO v_project FROM projects p JOIN organizations o ON o.id = p.org_id WHERE p.id = p_project_id;

  WITH gates AS (
    -- Estado de gates del motor (refresca los sucios); service role no pasa por la verificación de pertenencia.
    SELECT g.system_id, g.gates FROM public.compute_project_gates(p_project_id) g WHERE g.system_id = ANY (v_scope)
  ),
  sys_sub AS (
    SELECT sub.system_id, sub.id AS subsystem_id FROM subsystems sub WHERE sub.system_id = ANY (v_scope)
  ),
  sys_tags AS (
    SELECT ss.system_id, t.* FROM sys_sub ss JOIN tags t ON t.subsystem_id = ss.subsystem_id
  ),
  sys_itrs AS (
    -- Con tag, cuenta el subsistema del tag; sin tag, el del ITR (igual que v2).
    SELECT ss.system_id, i.*, t.tag_number
    FROM itrs i LEFT JOIN tags t ON t.id = i.tag_id
    JOIN sys_sub ss ON ss.subsystem_id = COALESCE(t.subsystem_id, i.subsystem_id)
    WHERE i.project_id = p_project_id
  ),
  sys_punches AS (
    SELECT ss.system_id, pu.* FROM sys_sub ss JOIN punches pu ON pu.subsystem_id = ss.subsystem_id AND pu.project_id = p_project_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'system_id',   s.id,
      'code',        s.code,
      'name',        s.name,
      'description', s.description,
      'tag_count',    (SELECT count(*) FROM sys_tags st WHERE st.system_id = s.id),
      'itr_count',    (SELECT count(*) FROM sys_itrs si WHERE si.system_id = s.id),
      'itr_approved', (SELECT count(*) FROM sys_itrs si WHERE si.system_id = s.id AND si.status = 'approved'),
      'punch_summary', jsonb_build_object(
        'cat_a_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'A' AND sp.status IN ('open', 'in_progress')),
        'cat_b_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'B' AND sp.status IN ('open', 'in_progress')),
        'cat_c_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.category = 'C' AND sp.status IN ('open', 'in_progress')),
        'total_open', (SELECT count(*) FROM sys_punches sp WHERE sp.system_id = s.id AND sp.status IN ('open', 'in_progress'))),
      'itrs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'itr_id', si.id, 'itr_number', si.itr_number, 'status', si.status, 'progress_pct', si.progress_pct,
          'scheduled_date', si.scheduled_date, 'completed_date', si.completed_date, 'tag_number', si.tag_number,
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('role', sig.role, 'user_id', sig.user_id, 'name', public.profile_full_name(sig.user_id),
                     'company', sig.signer_company, 'signed_at', sig.signed_at, 'signature_url', sig.signature_url) ORDER BY sig.signed_at)
            FROM itr_signatures sig WHERE sig.itr_id = si.id), '[]'::jsonb)
        ) ORDER BY si.itr_number)
        FROM sys_itrs si WHERE si.system_id = s.id), '[]'::jsonb),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'tag_id', st.id, 'tag_number', st.tag_number, 'description', st.description, 'manufacturer', st.manufacturer,
          'model', st.model, 'serial_number', st.serial_number, 'status', st.status, 'criticality', st.criticality
        ) ORDER BY st.tag_number)
        FROM sys_tags st WHERE st.system_id = s.id), '[]'::jsonb),

      -- Etapa de propiedad vigente (F6).
      'ownership', (SELECT jsonb_build_object('stage', so.stage, 'since', so.since) FROM system_ownership so WHERE so.system_id = s.id),

      -- Gates: estado calculado + aprobación vigente con multifirma + declaraciones manuales vigentes.
      'gates', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'gate_id', ge ->> 'gate_id', 'code', ge ->> 'code', 'name', ge ->> 'name', 'order', (ge ->> 'order')::int,
          'status', ge ->> 'status',
          'approval', (
            SELECT jsonb_build_object(
              'status', a.status, 'approved_by', public.profile_full_name(a.approved_by), 'approved_role', a.approved_role,
              'company', a.approved_company, 'approved_at', a.approved_at, 'completed_at', a.completed_at,
              'conditions', a.conditions, 'notes', a.notes,
              'signatures', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('capacity', sg.capacity, 'name', public.profile_full_name(sg.user_id),
                         'company', sg.signer_company, 'signed_at', sg.signed_at, 'comments', sg.comments) ORDER BY sg.signed_at)
                FROM system_gate_signatures sg WHERE sg.approval_id = a.id), '[]'::jsonb))
            FROM system_gate_approvals a
            WHERE a.system_id = s.id AND a.gate_id = (ge ->> 'gate_id')::uuid AND a.revoked_at IS NULL
            ORDER BY a.approved_at DESC LIMIT 1),
          'attestations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('criterion', gc.kind, 'label', gc.params ->> 'label', 'comment', at.comment,
                     'file_path', at.file_path, 'by', public.profile_full_name(at.attested_by), 'at', at.attested_at) ORDER BY at.attested_at)
            FROM system_gate_attestations at JOIN gate_criteria gc ON gc.id = at.criterion_id
            WHERE at.system_id = s.id AND gc.gate_id = (ge ->> 'gate_id')::uuid AND at.revoked_at IS NULL), '[]'::jsonb)
        ) ORDER BY (ge ->> 'order')::int, ge ->> 'code')
        FROM gates gg, jsonb_array_elements(gg.gates) ge WHERE gg.system_id = s.id), '[]'::jsonb),

      -- PSSR del sistema con firmas por capacidad y resumen de ítems.
      'pssr', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'review_id', r.id, 'review_number', r.review_number, 'title', r.title, 'status', r.status,
          'submitted_by', public.profile_full_name(r.submitted_by), 'submitted_at', r.submitted_at,
          'approved_by', public.profile_full_name(r.approved_by), 'approved_at', r.approved_at,
          'items', (SELECT jsonb_build_object('total', count(*), 'yes', count(*) FILTER (WHERE it.status = 'si'),
                      'na', count(*) FILTER (WHERE it.status = 'na'), 'no', count(*) FILTER (WHERE it.status = 'no'))
                    FROM pssr_review_items it WHERE it.review_id = r.id),
          'signatures', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('capacity', ps.capacity, 'discipline', ps.discipline,
                     'name', public.profile_full_name(ps.user_id), 'signed_at', ps.signed_at) ORDER BY ps.signed_at)
            FROM pssr_signatures ps WHERE ps.review_id = r.id), '[]'::jsonb)
        ) ORDER BY r.created_at)
        FROM pssr_reviews r WHERE r.system_id = s.id), '[]'::jsonb),

      -- Procedimientos: revisión vigente (hash, verificación en campo) y última ejecución completada con pasos y holds.
      'procedures', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'procedure_id', pr.id, 'number', pr.number, 'title', pr.title, 'kind', pr.kind,
          'revision', (
            SELECT jsonb_build_object('revision_id', rv.id, 'rev', rv.rev, 'status', rv.status,
                     'approved_by', public.profile_full_name(rv.approved_by), 'approved_at', rv.approved_at,
                     'field_verified_by', public.profile_full_name(rv.field_verified_by), 'field_verified_at', rv.field_verified_at,
                     'walkdown_note', rv.walkdown_note, 'content_hash', rv.content_hash)
            FROM procedure_revisions rv WHERE rv.id = pr.current_revision_id),
          'last_run', (
            SELECT jsonb_build_object('run_id', ru.id, 'number', ru.number, 'status', ru.status,
                     'started_by', public.profile_full_name(ru.started_by), 'started_at', ru.started_at,
                     'completed_by', public.profile_full_name(ru.completed_by), 'completed_at', ru.completed_at,
                     'steps', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('ord', rs.ord, 'action', ps.action, 'expected', ps.expected_value,
                                'actual', rs.actual_value, 'status', rs.status, 'comment', rs.comment,
                                'hold', ps.is_hold_point, 'done_by', public.profile_full_name(rs.done_by), 'done_at', rs.done_at,
                                'released_by', public.profile_full_name(rs.released_by), 'released_at', rs.released_at,
                                'release_role', rs.release_role, 'release_comment', rs.release_comment) ORDER BY rs.ord)
                       FROM procedure_run_steps rs JOIN procedure_steps ps ON ps.id = rs.step_id
                       WHERE rs.run_id = ru.id), '[]'::jsonb),
                     'timeline', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('kind', ev.kind, 'by', public.profile_full_name(ev.user_id),
                                'at', COALESCE(ev.field_at, ev.recorded_at), 'comment', ev.comment) ORDER BY COALESCE(ev.field_at, ev.recorded_at))
                       FROM procedure_run_events ev WHERE ev.run_id = ru.id), '[]'::jsonb))
            FROM procedure_runs ru WHERE ru.procedure_id = pr.id AND ru.status = 'completed'
            ORDER BY ru.completed_at DESC LIMIT 1)
        ) ORDER BY pr.number)
        FROM procedures pr WHERE pr.system_id = s.id), '[]'::jsonb),

      -- Line-ups verificados vigentes (no reemplazados) con sus posiciones.
      'lineups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sheet_id', ls.id, 'number', ls.number, 'title', ls.title, 'status', ls.status,
          'issued_by', public.profile_full_name(ls.issued_by), 'issued_at', ls.issued_at,
          'verified_by', public.profile_full_name(ls.verified_by), 'verified_at', ls.verified_at, 'content_hash', ls.content_hash,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('ord', li.ord, 'tag', t.tag_number, 'label', li.label,
                     'required', li.required_position, 'found', li.found_position, 'critical', li.is_critical, 'remarks', li.remarks,
                     'set_by', public.profile_full_name(li.set_by), 'set_at', li.set_at,
                     'verified_by', public.profile_full_name(li.verified_by), 'verified_at', li.verified_at) ORDER BY li.ord)
            FROM lineup_items li LEFT JOIN tags t ON t.id = li.tag_id WHERE li.sheet_id = ls.id), '[]'::jsonb)
        ) ORDER BY ls.number)
        FROM lineup_sheets ls WHERE ls.system_id = s.id AND ls.status = 'verified'), '[]'::jsonb),

      -- Bitácora de arranque: hitos y eventos no anulados, con testigo y parámetros.
      'startup_events', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', ev.number, 'kind', ev.kind, 'milestone', ev.milestone, 'category', ev.category, 'occurred_at', ev.occurred_at,
          'title', ev.title, 'description', ev.description, 'status', ev.status,
          'recorded_by', public.profile_full_name(ev.recorded_by), 'witness_capacity', ev.witness_capacity, 'backdate_reason', ev.backdate_reason,
          'witness_by', public.profile_full_name(ev.witness_by), 'witness_at', ev.witness_at,
          'params', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('label', pa.label, 'value', pa.value, 'value_text', pa.value_text, 'unit', pa.unit,
                     'quality', pa.quality, 'sampled_at', pa.sampled_at, 'source', pa.source) ORDER BY pa.label)
            FROM startup_event_params pa WHERE pa.event_id = ev.id), '[]'::jsonb)
        ) ORDER BY ev.occurred_at)
        FROM startup_events ev WHERE ev.system_id = s.id AND ev.status <> 'voided'), '[]'::jsonb),

      -- Traspasos completados con checklist, excepciones justificadas y las dos firmas.
      'transfers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', tr.number, 'from_stage', tr.from_stage, 'to_stage', tr.to_stage, 'is_reversal', tr.is_reversal,
          'reason', tr.reason, 'checklist', tr.checklist, 'exceptions', tr.exceptions,
          'requested_by', public.profile_full_name(tr.requested_by), 'requested_at', tr.requested_at,
          'commissioning', jsonb_build_object('name', public.profile_full_name(tr.commissioning_signed_by),
                             'company', tr.commissioning_company, 'signed_at', tr.commissioning_signed_at),
          'operations', jsonb_build_object('name', public.profile_full_name(tr.operations_signed_by),
                             'company', tr.operations_company, 'signed_at', tr.operations_signed_at),
          'commissioning_ack', to_jsonb(tr.commissioning_ack), 'operations_ack', to_jsonb(tr.operations_ack),
          'completed_at', tr.completed_at, 'content_hash', tr.content_hash
        ) ORDER BY tr.seq)
        FROM ownership_transfers tr WHERE tr.system_id = s.id AND tr.status = 'completed'), '[]'::jsonb),

      -- Competencias: personas por turno exigidas y nivel vigente de cada persona evaluada en el sistema.
      'competencies', jsonb_build_object(
        'required_per_shift', COALESCE((SELECT ct.required FROM system_competency_targets ct WHERE ct.system_id = s.id), 2),
        'personnel', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', op.full_name, 'company', op.company, 'position', op.position, 'shift', op.shift,
                   'level', public.person_system_level(op.id, s.id),
                   'assessed_at', (SELECT max(cr.assessed_at) FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL),
                   'expires_at', (SELECT cr.expires_at FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL
                                  ORDER BY cr.assessed_at DESC, cr.created_at DESC LIMIT 1)
                 ) ORDER BY op.shift NULLS LAST, op.full_name)
          FROM ops_personnel op
          WHERE op.project_id = p_project_id AND op.active
            AND EXISTS (SELECT 1 FROM competency_records cr WHERE cr.person_id = op.id AND cr.system_id = s.id AND cr.voided_at IS NULL)), '[]'::jsonb)),

      'spares', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('kind', cs.kind, 'item', cs.item, 'part_number', cs.part_number, 'tag', t.tag_number,
                 'critical', cs.is_critical, 'qty_required', cs.qty_required, 'qty_available', cs.qty_available,
                 'status', cs.status, 'eta', cs.eta, 'notes', cs.notes) ORDER BY cs.is_critical DESC, cs.item)
        FROM critical_spares cs LEFT JOIN tags t ON t.id = cs.tag_id WHERE cs.system_id = s.id), '[]'::jsonb),

      -- Pruebas de desempeño: revisión vigente, intentos evaluados y PTC con sus tres firmas.
      'performance', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'test_id', pt.id, 'number', pt.number, 'title', pt.title, 'status', pt.status,
          'revision', (SELECT jsonb_build_object('rev', tr2.rev, 'status', tr2.status, 'content_hash', tr2.content_hash,
                         'approved_by', public.profile_full_name(tr2.approved_by), 'approved_at', tr2.approved_at)
                       FROM performance_test_revisions tr2 WHERE tr2.id = pt.current_revision_id),
          'runs', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('run_id', ru.id, 'number', ru.number, 'attempt', ru.attempt, 'status', ru.status,
                     'formal_started_at', ru.formal_started_at, 'closed_at', ru.closed_at, 'result', ru.result,
                     'result_reason', ru.result_reason, 'result_by', public.profile_full_name(ru.result_by), 'result_at', ru.result_at,
                     'evaluation_hash', ru.evaluation_hash) ORDER BY ru.attempt)
            FROM performance_runs ru WHERE ru.test_id = pt.id AND ru.status IN ('closed', 'evaluated')), '[]'::jsonb),
          'certificates', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('number', pc.number, 'status', pc.status, 'run_id', pc.run_id, 'content_hash', pc.content_hash,
                     'commissioning', jsonb_build_object('name', public.profile_full_name(pc.commissioning_signed_by),
                                        'company', pc.commissioning_company, 'signed_at', pc.commissioning_signed_at),
                     'operations', jsonb_build_object('name', public.profile_full_name(pc.operations_signed_by),
                                        'company', pc.operations_company, 'signed_at', pc.operations_signed_at),
                     'client', jsonb_build_object('name', public.profile_full_name(pc.client_signed_by),
                                        'company', pc.client_company, 'signed_at', pc.client_signed_at)) ORDER BY pc.seq)
            FROM performance_certificates pc WHERE pc.test_id = pt.id AND pc.status IN ('accepted', 'pending_signatures')), '[]'::jsonb)
        ) ORDER BY pt.number)
        FROM performance_tests pt WHERE pt.primary_system_id = s.id AND pt.status <> 'withdrawn'), '[]'::jsonb),

      -- Registro documental del sistema: revisión vigente de cada documento ligado.
      'documents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('document_id', d.id, 'number', d.number, 'title', d.title, 'doc_type', d.doc_type,
                 'company', (SELECT c.name FROM companies c WHERE c.id = d.company_id),
                 'revision', (SELECT jsonb_build_object('revision_id', dr.id, 'rev', dr.rev, 'status', dr.status, 'issued_on', dr.issued_on,
                                'file_name', dr.file_name, 'file_path', dr.file_path, 'external_url', dr.external_url)
                              FROM document_revisions dr WHERE dr.id = d.current_revision_id)
               ) ORDER BY d.number)
        FROM documents d JOIN document_systems ds ON ds.document_id = d.id WHERE ds.system_id = s.id), '[]'::jsonb),

      -- Paquetes de vendor del sistema: FAT/SAT, hallazgos, reporte final y recomendaciones (con MOC).
      'vendors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'number', vp.number, 'title', vp.title, 'status', vp.status,
          'company', (SELECT c.name FROM companies c WHERE c.id = vp.company_id),
          'mobilized_at', vp.mobilized_at, 'demobilized_at', vp.demobilized_at,
          'activities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('kind', va.kind, 'title', va.title, 'performed_on', va.performed_on, 'result', va.result,
                     'retest', va.retest_of IS NOT NULL,
                     'findings', (SELECT count(*) FROM vendor_findings vf WHERE vf.activity_id = va.id)) ORDER BY va.created_at)
            FROM vendor_activities va WHERE va.package_id = vp.id), '[]'::jsonb),
          'final_report', (SELECT jsonb_build_object('report_date', vr.report_date, 'issued_by', public.profile_full_name(vr.issued_by),
                             'issued_at', vr.issued_at, 'activities', vr.activities, 'issues', vr.issues)
                           FROM vendor_reports vr WHERE vr.package_id = vp.id AND vr.kind = 'final' ORDER BY vr.issued_at DESC LIMIT 1),
          'recommendations', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('seq', rc.seq, 'description', rc.description, 'status', rc.status,
                     'requires_moc', rc.requires_moc, 'moc_reference', rc.moc_reference,
                     'decided_by', public.profile_full_name(rc.decided_by), 'decided_at', rc.decided_at) ORDER BY rc.seq)
            FROM vendor_recommendations rc WHERE rc.package_id = vp.id), '[]'::jsonb)
        ) ORDER BY vp.number)
        FROM vendor_packages vp JOIN vendor_package_systems vs ON vs.package_id = vp.id
        WHERE vs.system_id = s.id AND vp.status <> 'cancelled'), '[]'::jsonb)
    ) ORDER BY s.code), '[]'::jsonb)
  INTO v_systems
  FROM systems s WHERE s.id = ANY (v_scope);

  -- Punch Cat B abiertos o transferidos (los que se heredan con excepción).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'punch_id', pu.id, 'punch_number', pu.punch_number, 'category', pu.category, 'description', pu.description,
    'status', pu.status, 'priority', pu.priority, 'raised_by', pu.raised_by, 'assigned_to', pu.assigned_to,
    'target_date', pu.target_date, 'closed_date', pu.closed_date, 'subsystem_id', pu.subsystem_id, 'tag_id', pu.tag_id,
    'created_at', pu.created_at
  ) ORDER BY pu.punch_number), '[]'::jsonb)
  INTO v_punches
  FROM punches pu JOIN subsystems sub ON sub.id = pu.subsystem_id
  WHERE pu.project_id = p_project_id AND pu.category = 'B' AND sub.system_id = ANY (v_scope);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'certificate_id', c.id, 'certificate_number', c.certificate_number, 'title', c.title, 'status', c.status,
    'issued_date', c.issued_date, 'issued_by', c.issued_by, 'approved_by', c.approved_by,
    'system_id', COALESCE(c.system_id, sub.system_id), 'subsystem_id', c.subsystem_id, 'document_url', c.document_url,
    'signatures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('role', cs.role, 'name', public.profile_full_name(cs.user_id), 'signed_at', cs.signed_at)
             ORDER BY cs.signed_at)
      FROM certificate_signatures cs WHERE cs.certificate_id = c.id), '[]'::jsonb)
  ) ORDER BY c.certificate_number), '[]'::jsonb)
  INTO v_certs
  FROM certificates c LEFT JOIN subsystems sub ON sub.id = c.subsystem_id
  WHERE c.project_id = p_project_id AND COALESCE(c.system_id, sub.system_id) = ANY (v_scope);

  RETURN jsonb_build_object('handover_package', jsonb_build_object(
    'schema_version', '3.0',
    'generated_at',   to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'org_id',         v_org_id,
    'project',        v_project,
    'systems',        v_systems,
    'punch_items',    v_punches,
    'certificates',   v_certs));
END;
$function$;


-- ── Permisos de las funciones nuevas o con firma nueva ──────────────────────
REVOKE ALL ON FUNCTION public.sign_ownership_transfer(uuid, text, text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_ownership_transfer(uuid, text, text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_startup_event(uuid, uuid, text, text, timestamptz, text, text, uuid[], uuid, uuid[], jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_startup_event(uuid, uuid, text, text, timestamptz, text, text, uuid[], uuid, uuid[], jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.performance_evaluate_core(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.performance_evaluate_core(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.acknowledge_performance_exclusions(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_performance_exclusions(uuid) TO authenticated, service_role;
