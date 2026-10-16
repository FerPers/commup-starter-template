-- Fase 6 del plan readiness — offline de ejecuciones de procedimiento y hojas de line-up
-- (2026-10-16, decisiones de Luis sobre el offline de F6):
--   Sin red se encolan en el cliente: marcar un paso (hecho / N/A / llegar a un hold point), fijar la
--   posición de una fila y DETENER. Liberar hold points, reanudar, completar, abortar, verificar y completar
--   la hoja siguen exigiendo red.
--   Hora de campo: las RPC reciben p_captured_at (hora de captura en el dispositivo) y la guardan como
--   done_at / set_at / stopped_at, acotada entre el límite inferior lógico (inicio de la ejecución o paso
--   anterior; emisión de la hoja) y now(). `synced_at` marca que el registro llegó por sincronización.
--   Line-up: compare-and-set. La entrada encolada lleva el set_at/verified_at que vio el dispositivo; si la
--   fila cambió en el servidor después (otra persona la fijó o la verificó) no se aplica: error CU409 y el
--   usuario decide. Si la posición del servidor ya es la misma, no se toca (no borra una verificación válida)
--   y la RPC devuelve 'redundant'.
--   Las firmas nuevas tienen parámetros con DEFAULT: las llamadas en línea existentes siguen igual.

ALTER TABLE public.procedure_run_steps ADD COLUMN synced_at timestamptz;
ALTER TABLE public.procedure_runs      ADD COLUMN stop_synced_at timestamptz;
ALTER TABLE public.lineup_items        ADD COLUMN synced_at timestamptz;

-- Hora de campo acotada: nunca en el futuro ni antes del límite inferior.
CREATE OR REPLACE FUNCTION public.startup_field_time(p_captured_at timestamptz, p_floor timestamptz)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE WHEN p_captured_at IS NULL THEN now()
              ELSE LEAST(now(), GREATEST(p_captured_at, COALESCE(p_floor, p_captured_at))) END;
$fn$;

-- ── Paso ────────────────────────────────────────────────────────────────
DROP FUNCTION public.complete_run_step(uuid, uuid, text, text, boolean);
CREATE FUNCTION public.complete_run_step(
  p_run_id uuid, p_step_id uuid, p_actual text DEFAULT NULL, p_comment text DEFAULT NULL, p_na boolean DEFAULT false,
  p_captured_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text; v_to text;
        v_comment text := public.mgmt_text(p_comment, 2000); v_floor timestamptz; v_at timestamptz;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status = 'at_hold' THEN RAISE EXCEPTION 'La ejecución está detenida en un hold point: debe liberarse antes de seguir' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'in_progress' THEN RAISE EXCEPTION 'La ejecución no está en curso (%)', r.status USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF rs.status <> 'pending' THEN RAISE EXCEPTION 'El paso % ya fue registrado', rs.ord USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord AND status NOT IN ('done', 'released', 'na')) THEN
    RAISE EXCEPTION 'Completa los pasos anteriores antes del paso %', rs.ord USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  IF p_na THEN
    IF st.is_hold_point THEN RAISE EXCEPTION 'Un hold point no puede marcarse N/A' USING ERRCODE = 'P0001'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué el paso no aplica' USING ERRCODE = '22023'; END IF;
    v_to := 'na';
  ELSIF st.is_hold_point THEN v_to := 'at_hold';
  ELSE v_to := 'done';
  END IF;
  -- Orden cronológico: no antes del inicio ni del cierre del paso anterior.
  SELECT GREATEST(r.started_at, MAX(GREATEST(done_at, COALESCE(released_at, done_at)))) INTO v_floor
    FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord;
  v_at := public.startup_field_time(p_captured_at, COALESCE(v_floor, r.started_at));
  UPDATE procedure_run_steps SET status = v_to, actual_value = public.mgmt_text(p_actual, 500), comment = v_comment, done_by = auth.uid(), done_at = v_at,
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END
   WHERE run_id = p_run_id AND step_id = p_step_id;
  UPDATE procedure_runs SET status = CASE WHEN v_to = 'at_hold' THEN 'at_hold' ELSE status END, updated_at = now() WHERE id = p_run_id;
  RETURN v_to;
END;
$fn$;

-- ── Detener · reanudar · completar · abortar (p_captured_at solo aplica a «stopped») ──
DROP FUNCTION public.transition_procedure_run(uuid, text, text);
CREATE FUNCTION public.transition_procedure_run(p_run_id uuid, p_to text, p_comment text DEFAULT NULL, p_captured_at timestamptz DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
  ELSIF p_to = 'in_progress' AND r.status = 'stopped' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores reanudan una ejecución detenida' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué es seguro reanudar' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status = 'at_hold') THEN 'at_hold' ELSE 'in_progress' END,
           stop_reason = stop_reason || ' · Reanudado: ' || v_comment, updated_at = now() WHERE id = r.id;
  ELSIF p_to = 'completed' AND r.status = 'in_progress' THEN
    IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status NOT IN ('done', 'released', 'na')) THEN
      RAISE EXCEPTION 'Quedan pasos sin completar o hold points sin liberar' USING ERRCODE = 'P0001';
    END IF;
    UPDATE procedure_runs SET status = 'completed', completed_by = v_uid, completed_at = now(), updated_at = now() WHERE id = r.id;
  ELSIF p_to = 'aborted' AND r.status IN ('in_progress', 'at_hold', 'stopped') THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores abortan una ejecución' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'aborted', aborted_by = v_uid, aborted_at = now(), abort_reason = v_comment, updated_at = now() WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$fn$;

-- ── Fila de line-up ─────────────────────────────────────────────────────
-- p_check_expected = true (replay offline): la fila debe seguir con el set_at/verified_at que vio el
-- dispositivo; si no, CU409 (o 'redundant' si la posición ya es la misma). Devuelve 'applied' | 'redundant'.
DROP FUNCTION public.set_lineup_item(uuid, text, text);
CREATE FUNCTION public.set_lineup_item(
  p_item_id uuid, p_found text, p_remarks text DEFAULT NULL,
  p_captured_at timestamptz DEFAULT NULL, p_check_expected boolean DEFAULT false,
  p_expected_set_at timestamptz DEFAULT NULL, p_expected_verified_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE it lineup_items%ROWTYPE; s lineup_sheets%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO it FROM lineup_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fila no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM lineup_sheets WHERE id = it.sheet_id FOR UPDATE;
  v_role := public.register_caller_role(s.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF s.status NOT IN ('issued', 'in_progress') THEN RAISE EXCEPTION 'La hoja no está en ejecución' USING ERRCODE = 'P0001'; END IF;
  IF p_found IS NULL THEN RAISE EXCEPTION 'Indica la posición encontrada' USING ERRCODE = '22023'; END IF;
  IF p_check_expected AND (it.set_at IS DISTINCT FROM p_expected_set_at OR it.verified_at IS DISTINCT FROM p_expected_verified_at) THEN
    IF it.found_position IS NOT DISTINCT FROM p_found THEN RETURN 'redundant'; END IF;
    RAISE EXCEPTION 'La fila cambió en el servidor después de tu captura' USING ERRCODE = 'CU409';
  END IF;
  UPDATE lineup_items SET found_position = p_found, remarks = public.mgmt_text(p_remarks, 1000), set_by = auth.uid(),
         set_at = public.startup_field_time(p_captured_at, s.issued_at),
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END,
         verified_by = NULL, verified_at = NULL WHERE id = it.id;
  UPDATE lineup_sheets SET status = 'in_progress', updated_at = now() WHERE id = s.id AND status = 'issued';
  RETURN 'applied';
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.startup_field_time(timestamptz, timestamptz)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_run_step(uuid, uuid, text, text, boolean, timestamptz)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_procedure_run(uuid, text, text, timestamptz)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_lineup_item(uuid, text, text, timestamptz, boolean, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.startup_field_time(timestamptz, timestamptz)                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_step(uuid, uuid, text, text, boolean, timestamptz)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_procedure_run(uuid, text, text, timestamptz)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_lineup_item(uuid, text, text, timestamptz, boolean, timestamptz, timestamptz) TO authenticated, service_role;
