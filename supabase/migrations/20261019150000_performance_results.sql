-- Fase 7 del plan readiness, sesión 2 — evaluación, resultado, certificado PTC y gate (2026-10-17, doc §14.15–21):
--   evaluate_performance_run: SQL como única fuente de verdad. Ventana válida = periodo formal − perturbaciones
--     excluidas. Validación por variable (cobertura, calidad, picos, unidad actual), estadísticos sobre el
--     promedio de cada minuto, derivadas con manuales sostenidas, pares de medidores y resultado sugerido.
--   record_performance_result: líder+; «repetir» humano; apartarse de la sugerencia exige motivo; congela la
--     evaluación con hash (status evaluated, intento inmutable). Falló / aceptado con desviación → acción F5.
--   performance_certificates (PTC-0001): emitir (líder+) firma como Comisionamiento; firman Operaciones
--     (hold_release_roles('operations')) y Cliente (solo rol client), personas distintas; uno vigente por prueba.
--   readiness_gates.requires_performance + criterio implícito performance_accepted (solo sistemas principales
--     de alguna prueba; los demás «no aplica»).
--   my_work_counts: performance_to_decide, performance_to_sign. daily_report_data: performance_today.

-- ── 1. Columnas nuevas ───────────────────────────────────────────────────
ALTER TABLE public.performance_variables ADD COLUMN manual_every_min integer NOT NULL DEFAULT 60;
ALTER TABLE public.performance_variables ADD CONSTRAINT performance_variables_every_check CHECK (manual_every_min BETWEEN 1 AND 1440);

ALTER TABLE public.performance_runs DROP CONSTRAINT performance_runs_status_check;
ALTER TABLE public.performance_runs ADD CONSTRAINT performance_runs_status_check
  CHECK (status IN ('planned', 'stabilizing', 'formal', 'closed', 'evaluated', 'aborted'));
ALTER TABLE public.performance_runs
  ADD COLUMN suggested_result text,
  ADD COLUMN result           text,
  ADD COLUMN result_reason    text,
  ADD COLUMN result_by        uuid,
  ADD COLUMN result_at        timestamptz,
  ADD COLUMN evaluation       jsonb,
  ADD COLUMN evaluation_hash  text,
  ADD COLUMN action_id        uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  ADD CONSTRAINT performance_runs_result_check CHECK (
    (result IS NULL OR result IN ('accepted', 'accepted_with_deviation', 'repeat', 'failed', 'inconclusive'))
    AND (suggested_result IS NULL OR suggested_result IN ('accepted', 'accepted_with_deviation', 'failed', 'inconclusive'))
    AND ((status = 'evaluated') = (result IS NOT NULL)));

ALTER TABLE public.readiness_gates ADD COLUMN requires_performance boolean NOT NULL DEFAULT false;

-- La escritura de variables (S1) se reescribe para guardar manual_every_min.
CREATE OR REPLACE FUNCTION public.performance_write_content(r performance_test_revisions, p_content jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  e jsonb; i integer; k text; v_clean jsonb := '{}'::jsonb; v_set jsonb; v_sig_id uuid; v_sig_tag text; v_sig_unit text; v_unit text; v_src text;
  v_primary uuid; v_cycle text; v_proc uuid;
BEGIN
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN RAISE EXCEPTION 'Contenido no válido' USING ERRCODE = '22023'; END IF;
  SELECT primary_system_id INTO v_primary FROM performance_tests WHERE id = r.test_id;

  IF jsonb_typeof(COALESCE(p_content -> 'sections', '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'Secciones no válidas' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_content -> 'sections', '{}'::jsonb)) LOOP
    IF NOT (k = ANY (public.performance_section_keys())) THEN RAISE EXCEPTION 'Sección desconocida: %', k USING ERRCODE = '22023'; END IF;
    IF public.mgmt_text(p_content -> 'sections' ->> k, 20000) IS NOT NULL THEN
      v_clean := v_clean || jsonb_build_object(k, public.mgmt_text(p_content -> 'sections' ->> k, 20000));
    END IF;
  END LOOP;

  v_set := COALESCE(p_content -> 'settings', '{}'::jsonb);
  v_proc := NULLIF(v_set ->> 'procedure_id', '')::uuid;
  IF v_proc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedures WHERE id = v_proc AND project_id = r.project_id) THEN
    RAISE EXCEPTION 'El procedimiento no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  UPDATE performance_test_revisions SET
    sections          = v_clean,
    stabilization_min = COALESCE((v_set ->> 'stabilization_min')::integer, stabilization_min),
    formal_min        = COALESCE((v_set ->> 'formal_min')::integer, formal_min),
    sample_interval_s = COALESCE((v_set ->> 'sample_interval_s')::integer, sample_interval_s),
    min_coverage_pct  = COALESCE((v_set ->> 'min_coverage_pct')::numeric, min_coverage_pct),
    procedure_id      = v_proc,
    updated_at        = now()
  WHERE id = r.id;

  DELETE FROM performance_revision_systems WHERE revision_id = r.id;
  INSERT INTO performance_revision_systems (revision_id, system_id, project_id) VALUES (r.id, v_primary, r.project_id);
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'system_ids', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM systems WHERE id = (e #>> '{}')::uuid AND project_id = r.project_id) THEN
      RAISE EXCEPTION 'Un sistema de la frontera no pertenece al proyecto' USING ERRCODE = '22023';
    END IF;
    INSERT INTO performance_revision_systems (revision_id, system_id, project_id) VALUES (r.id, (e #>> '{}')::uuid, r.project_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF jsonb_typeof(COALESCE(p_content -> 'variables', '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_content -> 'variables', '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'Variables no válidas' USING ERRCODE = '22023';
  END IF;
  DELETE FROM performance_criteria WHERE revision_id = r.id;
  DELETE FROM performance_meter_pairs WHERE revision_id = r.id;
  DELETE FROM performance_variables WHERE revision_id = r.id;
  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'variables', '[]'::jsonb)) LOOP
    i := i + 1;
    v_src := e ->> 'source';
    v_unit := public.mgmt_text(e ->> 'unit', 40);
    v_sig_id := NULL;
    IF v_src = 'signal' THEN
      SELECT s.id, s.signal_tag, s.eng_unit INTO v_sig_id, v_sig_tag, v_sig_unit FROM signals s JOIN tags t ON t.id = s.tag_id
       WHERE s.id = NULLIF(e ->> 'signal_id', '')::uuid AND t.project_id = r.project_id;
      IF v_sig_id IS NULL THEN RAISE EXCEPTION 'La señal de la variable % no pertenece al proyecto', e ->> 'key' USING ERRCODE = '22023'; END IF;
      IF v_unit IS NULL THEN v_unit := public.mgmt_text(v_sig_unit, 40);
      ELSIF public.mgmt_text(v_sig_unit, 40) IS NOT NULL AND lower(v_unit) <> lower(btrim(v_sig_unit)) THEN
        RAISE EXCEPTION 'La unidad de la variable % (%) no coincide con la de la señal % (%)', e ->> 'key', v_unit, v_sig_tag, v_sig_unit
          USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO performance_variables (revision_id, project_id, ord, key, label, unit, source, signal_id, op, operand_a, operand_b, max_step, manual_every_min)
    VALUES (r.id, r.project_id, i, upper(btrim(COALESCE(e ->> 'key', ''))), COALESCE(public.mgmt_text(e ->> 'label', 200), upper(btrim(COALESCE(e ->> 'key', '')))),
            v_unit, v_src, v_sig_id,
            CASE WHEN v_src = 'derived' THEN e ->> 'op' END,
            CASE WHEN v_src = 'derived' THEN upper(btrim(e ->> 'operand_a')) END,
            CASE WHEN v_src = 'derived' THEN upper(btrim(e ->> 'operand_b')) END,
            NULLIF(e ->> 'max_step', '')::numeric,
            COALESCE(NULLIF(e ->> 'manual_every_min', '')::integer, 60));
  END LOOP;

  IF EXISTS (SELECT 1 FROM performance_variables v WHERE v.revision_id = r.id AND v.source = 'derived'
              AND (NOT EXISTS (SELECT 1 FROM performance_variables a WHERE a.revision_id = r.id AND a.key = v.operand_a)
                OR NOT EXISTS (SELECT 1 FROM performance_variables b WHERE b.revision_id = r.id AND b.key = v.operand_b))) THEN
    RAISE EXCEPTION 'Una variable derivada usa un operando que no existe' USING ERRCODE = '22023';
  END IF;
  WITH RECURSIVE edges AS (
    SELECT key AS src, operand_a AS dst FROM performance_variables WHERE revision_id = r.id AND source = 'derived'
    UNION ALL
    SELECT key, operand_b FROM performance_variables WHERE revision_id = r.id AND source = 'derived'
  ), walk(start, cur, depth) AS (
    SELECT src, dst, 1 FROM edges
    UNION ALL
    SELECT w.start, e.dst, w.depth + 1 FROM walk w JOIN edges e ON e.src = w.cur WHERE w.depth < 100 AND w.cur <> w.start
  )
  SELECT start INTO v_cycle FROM walk WHERE cur = start LIMIT 1;
  IF v_cycle IS NOT NULL THEN RAISE EXCEPTION 'La variable derivada % depende de sí misma', v_cycle USING ERRCODE = '22023'; END IF;

  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'criteria', '[]'::jsonb)) LOOP
    i := i + 1;
    IF NOT EXISTS (SELECT 1 FROM performance_variables WHERE revision_id = r.id AND key = upper(btrim(COALESCE(e ->> 'variable_key', '')))) THEN
      RAISE EXCEPTION 'El criterio % usa una variable que no existe', i USING ERRCODE = '22023';
    END IF;
    INSERT INTO performance_criteria (revision_id, project_id, ord, variable_key, label, statistic, band_lo, band_hi, total_basis,
                                      operator, target, target_hi, uncertainty, uncertainty_mode)
    VALUES (r.id, r.project_id, i, upper(btrim(e ->> 'variable_key')), public.mgmt_text(e ->> 'label', 200), e ->> 'statistic',
            NULLIF(e ->> 'band_lo', '')::numeric, NULLIF(e ->> 'band_hi', '')::numeric, NULLIF(e ->> 'total_basis', ''),
            e ->> 'operator', (e ->> 'target')::numeric, NULLIF(e ->> 'target_hi', '')::numeric,
            COALESCE(NULLIF(e ->> 'uncertainty', '')::numeric, 0), COALESCE(NULLIF(e ->> 'uncertainty_mode', ''), 'abs'));
  END LOOP;

  i := 0;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_content -> 'pairs', '[]'::jsonb)) LOOP
    i := i + 1;
    INSERT INTO performance_meter_pairs (revision_id, project_id, ord, variable_a, variable_b, max_diff_pct)
    VALUES (r.id, r.project_id, i, upper(btrim(e ->> 'variable_a')), upper(btrim(e ->> 'variable_b')), (e ->> 'max_diff_pct')::numeric);
  END LOOP;
END;
$fn$;

-- new_performance_revision copia también manual_every_min.
CREATE OR REPLACE FUNCTION public.new_performance_revision(p_test_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE t performance_tests%ROWTYPE; v_role text; v_cur performance_test_revisions%ROWTYPE; v_id uuid; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM performance_test_revisions WHERE test_id = t.id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de %', t.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cur FROM performance_test_revisions WHERE id = t.current_revision_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'La prueba aún no tiene revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la nueva revisión' USING ERRCODE = '22023'; END IF;
  INSERT INTO performance_test_revisions (test_id, org_id, project_id, rev, sections, stabilization_min, formal_min, sample_interval_s,
                                          min_coverage_pct, procedure_id, change_reason, created_by)
  VALUES (t.id, t.org_id, t.project_id, (SELECT MAX(rev) + 1 FROM performance_test_revisions WHERE test_id = t.id), v_cur.sections,
          v_cur.stabilization_min, v_cur.formal_min, v_cur.sample_interval_s, v_cur.min_coverage_pct, v_cur.procedure_id, v_reason, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO performance_revision_systems (revision_id, system_id, project_id)
  SELECT v_id, system_id, project_id FROM performance_revision_systems WHERE revision_id = v_cur.id;
  INSERT INTO performance_variables (revision_id, project_id, ord, key, label, unit, source, signal_id, op, operand_a, operand_b, max_step, manual_every_min)
  SELECT v_id, project_id, ord, key, label, unit, source, signal_id, op, operand_a, operand_b, max_step, manual_every_min
  FROM performance_variables WHERE revision_id = v_cur.id;
  INSERT INTO performance_criteria (revision_id, project_id, ord, variable_key, label, statistic, band_lo, band_hi, total_basis, operator,
                                    target, target_hi, uncertainty, uncertainty_mode)
  SELECT v_id, project_id, ord, variable_key, label, statistic, band_lo, band_hi, total_basis, operator, target, target_hi, uncertainty, uncertainty_mode
  FROM performance_criteria WHERE revision_id = v_cur.id;
  INSERT INTO performance_meter_pairs (revision_id, project_id, ord, variable_a, variable_b, max_diff_pct)
  SELECT v_id, project_id, ord, variable_a, variable_b, max_diff_pct FROM performance_meter_pairs WHERE revision_id = v_cur.id;
  RETURN v_id;
END;
$fn$;

-- El hash de la revisión incluye manual_every_min (solo afecta revisiones aprobadas desde ahora).
CREATE OR REPLACE FUNCTION public.performance_revision_hash(p_revision_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'test', t.number, 'title', t.title, 'primary_system', t.primary_system_id, 'rev', r.rev, 'sections', r.sections,
    'stabilization_min', r.stabilization_min, 'formal_min', r.formal_min, 'sample_interval_s', r.sample_interval_s,
    'min_coverage_pct', r.min_coverage_pct, 'procedure', r.procedure_id,
    'systems', COALESCE((SELECT jsonb_agg(s.system_id ORDER BY s.system_id) FROM performance_revision_systems s WHERE s.revision_id = r.id), '[]'::jsonb),
    'variables', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label, 'unit', v.unit, 'source', v.source,
                'signal', v.signal_id, 'op', v.op, 'a', v.operand_a, 'b', v.operand_b, 'max_step', v.max_step, 'every', v.manual_every_min) ORDER BY v.ord)
                FROM performance_variables v WHERE v.revision_id = r.id), '[]'::jsonb),
    'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object('var', c.variable_key, 'label', c.label, 'stat', c.statistic,
                'band_lo', c.band_lo, 'band_hi', c.band_hi, 'basis', c.total_basis, 'op', c.operator, 'target', c.target,
                'target_hi', c.target_hi, 'u', c.uncertainty, 'u_mode', c.uncertainty_mode) ORDER BY c.ord)
                FROM performance_criteria c WHERE c.revision_id = r.id), '[]'::jsonb),
    'pairs', COALESCE((SELECT jsonb_agg(jsonb_build_object('a', m.variable_a, 'b', m.variable_b, 'max', m.max_diff_pct) ORDER BY m.ord)
                FROM performance_meter_pairs m WHERE m.revision_id = r.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  FROM performance_test_revisions r JOIN performance_tests t ON t.id = r.test_id WHERE r.id = p_revision_id;
$fn$;

-- ── 2. Evaluación ────────────────────────────────────────────────────────
-- Calcula la evaluación de un intento cerrado (o devuelve la congelada si ya tiene resultado).
-- Usa tablas temporales de la transacción: es VOLATILE y se llama por RPC (POST).
CREATE OR REPLACE FUNCTION public.performance_compute_evaluation(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
             WHERE d.run_id = r.id AND d.excluded AND d.started_at < b + interval '1 minute' AND COALESCE(d.ended_at, r.closed_at) > b) AS valid
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
    INSERT INTO _pf_var VALUES (v.key, v_unit_ok AND v_cov >= rev.min_coverage_pct AND v_valid > 0);
    v_vars := v_vars || jsonb_build_array(jsonb_build_object(
      'key', v.key, 'label', v.label, 'unit', v.unit, 'source', v.source, 'signal', v_sig_tag,
      'expected', round(v_expected, 2), 'present', v_present, 'coverage_pct', v_cov, 'coverage_ok', v_cov >= rev.min_coverage_pct,
      'bad_pct', round(v_bad, 2), 'spikes', v_spikes, 'out_of_range', v_oor, 'unit_ok', v_unit_ok,
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
      'value', CASE WHEN v_val IS NULL THEN NULL ELSE round(v_val::numeric, 6) END, 'outcome', v_outcome));
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
  IF v_any_ne AND NOT ('coverage' = ANY (v_reasons) OR 'unit' = ANY (v_reasons)) THEN v_reasons := array_append(v_reasons, 'not_evaluable'); END IF;

  v_suggest := CASE WHEN cardinality(v_reasons) > 0 THEN 'inconclusive'
                    WHEN v_any_fail THEN 'failed'
                    WHEN v_any_within THEN 'accepted_with_deviation'
                    ELSE 'accepted' END;

  RETURN jsonb_build_object(
    'run', r.number, 'revision', rev.rev, 'revision_hash', rev.content_hash, 'computed_at', now(),
    'window', jsonb_build_object('from', v_from, 'to', v_to, 'total_min', v_total, 'excluded_min', v_excl, 'valid_min', v_valid,
                                 'formal_min', rev.formal_min, 'min_coverage_pct', rev.min_coverage_pct, 'early_close', r.early_close),
    'variables', v_vars, 'criteria', v_crits, 'pairs', v_pairs,
    'reasons', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_reasons) ORDER BY 1)), 'suggested', v_suggest);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.evaluate_performance_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF r.status = 'evaluated' THEN RETURN r.evaluation; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se evalúa un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  RETURN public.performance_compute_evaluation(r.id);
END;
$fn$;

-- ── 3. Resultado ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_performance_result(p_run_id uuid, p_result text, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
$fn$;

-- El origen «performance» de una acción manual apunta a un intento del proyecto.
CREATE OR REPLACE FUNCTION public.mgmt_check_source(p_project_id uuid, p_kind text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
  ELSIF p_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este origen no admite un registro vinculado' USING ERRCODE = '22023';
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'El origen no pertenece al proyecto' USING ERRCODE = '22023'; END IF;
END;
$fn$;

-- ── 4. Certificado PTC ───────────────────────────────────────────────────
CREATE TABLE public.performance_certificates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq                     integer NOT NULL,
  number                  text NOT NULL,
  test_id                 uuid NOT NULL REFERENCES public.performance_tests(id) ON DELETE CASCADE,
  run_id                  uuid NOT NULL REFERENCES public.performance_runs(id) ON DELETE CASCADE,
  system_id               uuid NOT NULL REFERENCES public.systems(id) ON DELETE RESTRICT,
  status                  text NOT NULL DEFAULT 'pending_signatures',
  commissioning_signed_by uuid, commissioning_signed_at timestamptz,
  operations_signed_by    uuid, operations_signed_at    timestamptz,
  client_signed_by        uuid, client_signed_at        timestamptz,
  content_hash            text,
  revoked_by uuid, revoked_at timestamptz, revoke_reason text,
  superseded_at           timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_certificates_status_check CHECK (status IN ('pending_signatures', 'accepted', 'revoked', 'superseded')),
  CONSTRAINT performance_certificates_number_uq UNIQUE (project_id, number),
  CONSTRAINT performance_certificates_run_uq UNIQUE (run_id)
);
CREATE UNIQUE INDEX performance_certificates_live_uq ON public.performance_certificates (test_id) WHERE status IN ('pending_signatures', 'accepted');
CREATE INDEX performance_certificates_system_idx ON public.performance_certificates (system_id) WHERE status = 'accepted';
ALTER TABLE public.performance_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY performance_certificates_select ON public.performance_certificates FOR SELECT TO authenticated USING (project_id IN (SELECT public.get_my_project_ids()));

CREATE OR REPLACE FUNCTION public.mgmt_next_seq(p_table text, p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_seq integer;
BEGIN
  IF p_table NOT IN ('actions', 'project_constraints', 'technical_queries', 'decisions', 'procedures', 'procedure_runs', 'lineup_sheets',
                     'startup_events', 'ownership_transfers', 'performance_tests', 'performance_certificates') THEN
    RAISE EXCEPTION 'Tabla no válida' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mgmt:' || p_table || ':' || p_project_id::text));
  EXECUTE format('SELECT COALESCE(MAX(seq), 0) + 1 FROM public.%I WHERE project_id = $1', p_table)
    INTO v_seq USING p_project_id;
  RETURN v_seq;
END;
$fn$;

-- Emitir: líder+, sobre un intento aceptado (o aceptado con desviación). Quien emite firma como Comisionamiento.
-- Reemplaza el certificado vigente de la prueba si viene de un intento anterior.
CREATE OR REPLACE FUNCTION public.issue_performance_certificate(p_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r performance_runs%ROWTYPE; t performance_tests%ROWTYPE; v_role text; v_live performance_certificates%ROWTYPE; v_seq integer; v_id uuid;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores emiten el certificado' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'evaluated' OR r.result NOT IN ('accepted', 'accepted_with_deviation') THEN
    RAISE EXCEPTION 'Solo se certifica un intento con resultado aceptado' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM performance_tests WHERE id = r.test_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM performance_certificates WHERE run_id = r.id) THEN RAISE EXCEPTION 'Este intento ya tiene certificado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_live FROM performance_certificates WHERE test_id = t.id AND status IN ('pending_signatures', 'accepted');
  IF v_live.id IS NOT NULL THEN
    IF (SELECT attempt FROM performance_runs WHERE id = v_live.run_id) > r.attempt THEN
      RAISE EXCEPTION 'La prueba ya tiene un certificado de un intento posterior' USING ERRCODE = 'P0001';
    END IF;
    UPDATE performance_certificates SET status = 'superseded', superseded_at = now() WHERE id = v_live.id;
  END IF;
  v_seq := public.mgmt_next_seq('performance_certificates', r.project_id);
  INSERT INTO performance_certificates (org_id, project_id, seq, number, test_id, run_id, system_id, commissioning_signed_by, commissioning_signed_at)
  VALUES (r.org_id, r.project_id, v_seq, 'PTC-' || lpad(v_seq::text, 4, '0'), t.id, r.id, t.primary_system_id, auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- Firmar como Operaciones o Cliente (personas distintas a las otras firmas). Con las tres → accepted + hash.
CREATE OR REPLACE FUNCTION public.sign_performance_certificate(p_certificate_id uuid, p_capacity text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c performance_certificates%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_status text := 'pending_signatures';
BEGIN
  SELECT * INTO c FROM performance_certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF v_uid IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'pending_signatures' THEN RAISE EXCEPTION 'El certificado no espera firmas' USING ERRCODE = 'P0001'; END IF;
  IF v_uid IN (c.commissioning_signed_by, c.operations_signed_by, c.client_signed_by) THEN
    RAISE EXCEPTION 'Cada firma del certificado es de una persona distinta' USING ERRCODE = '42501';
  END IF;
  IF p_capacity = 'operations' THEN
    IF c.operations_signed_by IS NOT NULL THEN RAISE EXCEPTION 'Operaciones ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF NOT (v_role = ANY (public.hold_release_roles('operations'))) THEN RAISE EXCEPTION 'Tu rol no firma por Operaciones' USING ERRCODE = '42501'; END IF;
    UPDATE performance_certificates SET operations_signed_by = v_uid, operations_signed_at = now() WHERE id = c.id;
  ELSIF p_capacity = 'client' THEN
    IF c.client_signed_by IS NOT NULL THEN RAISE EXCEPTION 'El cliente ya firmó' USING ERRCODE = 'P0001'; END IF;
    IF v_role <> 'client' THEN RAISE EXCEPTION 'Solo un usuario con rol cliente firma por el Cliente' USING ERRCODE = '42501'; END IF;
    UPDATE performance_certificates SET client_signed_by = v_uid, client_signed_at = now() WHERE id = c.id;
  ELSE
    RAISE EXCEPTION 'Capacidad no válida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM performance_certificates WHERE id = c.id;
  IF c.operations_signed_by IS NOT NULL AND c.client_signed_by IS NOT NULL THEN
    SELECT * INTO r FROM performance_runs WHERE id = c.run_id;
    UPDATE performance_certificates SET status = 'accepted', content_hash = encode(sha256(convert_to(jsonb_build_object(
      'certificate', c.number, 'run', r.number, 'evaluation_hash', r.evaluation_hash, 'result', r.result,
      'revision_hash', (SELECT content_hash FROM performance_test_revisions WHERE id = r.revision_id),
      'commissioning', jsonb_build_array(c.commissioning_signed_by, c.commissioning_signed_at),
      'operations', jsonb_build_array(c.operations_signed_by, c.operations_signed_at),
      'client', jsonb_build_array(c.client_signed_by, c.client_signed_at))::text, 'UTF8')), 'hex')
     WHERE id = c.id;
    v_status := 'accepted';
  END IF;
  RETURN v_status;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.revoke_performance_certificate(p_certificate_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE c performance_certificates%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO c FROM performance_certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores revocan un certificado' USING ERRCODE = '42501'; END IF;
  IF c.status NOT IN ('pending_signatures', 'accepted') THEN RAISE EXCEPTION 'El certificado no está vigente' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  UPDATE performance_certificates SET status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revoke_reason = v_reason WHERE id = c.id;
END;
$fn$;

-- ── 5. Motor de gates: criterio implícito performance_accepted ───────────
-- Se inserta antes de los criterios configurados, reemplazando un ancla del cuerpo vigente (F6).
DO $patch$
DECLARE v_def text; v_anchor text := E'    FOR c IN\n      SELECT gc.* FROM gate_criteria gc WHERE gc.gate_id = g.id ORDER BY gc.order_index, gc.created_at';
BEGIN
  v_def := pg_get_functiondef('public.compute_system_gates(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'compute_system_gates: ancla no encontrada o repetida';
  END IF;
  v_def := replace(v_def, v_anchor, E'    -- Prueba de desempeño (F7): criterio implícito y bloqueante si el gate lo exige. Aplica solo a sistemas que son\n'
    || E'    -- principales de alguna prueba; cumple cuando cada una tiene un certificado PTC aceptado (tres firmas).\n'
    || E'    IF g.requires_performance THEN\n'
    || E'      SELECT COUNT(*)::int,\n'
    || E'             COUNT(*) FILTER (WHERE pc.id IS NULL)::int,\n'
    || E'             COALESCE(jsonb_agg(jsonb_build_object(''test_id'', pt.id, ''test'', pt.number, ''title'', pt.title,\n'
    || E'               ''certificate'', pc.number, ''certificate_id'', pc.id, ''ok'', pc.id IS NOT NULL) ORDER BY pt.number), ''[]''::jsonb)\n'
    || E'        INTO v_total, v_failn, v_fail\n'
    || E'      FROM performance_tests pt\n'
    || E'      LEFT JOIN performance_certificates pc ON pc.test_id = pt.id AND pc.status = ''accepted''\n'
    || E'      WHERE pt.primary_system_id = p_system_id;\n'
    || E'      v_crit := v_crit || jsonb_build_array(jsonb_build_object(\n'
    || E'        ''criterion_id'', NULL, ''kind'', ''performance_accepted'', ''label'', NULL, ''blocking'', true,\n'
    || E'        ''result'', CASE WHEN v_failn = 0 THEN ''pass'' ELSE ''fail'' END,\n'
    || E'        ''detail'', jsonb_build_object(''not_applicable'', v_total = 0, ''tests'', v_fail, ''missing_count'', v_failn)));\n'
    || E'      IF v_failn > 0 THEN v_level := ''red''; END IF;\n'
    || E'    END IF;\n\n'
    || v_anchor);
  EXECUTE v_def;
END;
$patch$;

-- ── 6. Mi trabajo: decidir resultados y firmar certificados ──────────────
DO $patch$
DECLARE v_def text; v_anchor text := E'          or (tr.operations_signed_by is null and (select role from me) = any (public.hold_release_roles(''operations''))))\n    )\n  );';
BEGIN
  v_def := pg_get_functiondef('public.my_work_counts(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'my_work_counts: ancla no encontrada o repetida';
  END IF;
  v_def := replace(v_def, v_anchor,
       E'          or (tr.operations_signed_by is null and (select role from me) = any (public.hold_release_roles(''operations''))))\n    ),\n'
    || E'    ''performance_to_decide'', (\n'
    || E'      select count(*)\n'
    || E'      from performance_runs pr\n'
    || E'      where pr.status = ''closed''\n'
    || E'        and (select role from me) in (''owner'', ''admin'', ''architect'', ''leader'')\n'
    || E'        and pr.project_id in (select id from proj)\n'
    || E'    ),\n'
    || E'    ''performance_to_sign'', (\n'
    || E'      select count(*)\n'
    || E'      from performance_certificates pc\n'
    || E'      where pc.status = ''pending_signatures''\n'
    || E'        and pc.project_id in (select id from proj)\n'
    || E'        and auth.uid() is distinct from pc.commissioning_signed_by\n'
    || E'        and auth.uid() is distinct from pc.operations_signed_by\n'
    || E'        and auth.uid() is distinct from pc.client_signed_by\n'
    || E'        and ((pc.operations_signed_by is null and (select role from me) = any (public.hold_release_roles(''operations'')))\n'
    || E'          or (pc.client_signed_by is null and (select role from me) = ''client''))\n'
    || E'    )\n  );');
  EXECUTE v_def;
END;
$patch$;

-- ── 7. Reporte diario: pruebas de desempeño del día ──────────────────────
DO $patch$
DECLARE v_def text; v_anchor text := E'          LIMIT 30) q), ''[]''::jsonb)\n  );\n  RETURN v_out;';
BEGIN
  v_def := pg_get_functiondef('public.daily_report_data(uuid, date, uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'daily_report_data: ancla no encontrada o repetida';
  END IF;
  v_def := replace(v_def, v_anchor,
       E'          LIMIT 30) q), ''[]''::jsonb),\n'
    || E'    -- F7: intentos de prueba de desempeño cerrados o con resultado del día, y certificados aceptados.\n'
    || E'    ''performance_today'', COALESCE((SELECT jsonb_agg(x ORDER BY x ->> ''at'') FROM (\n'
    || E'          SELECT jsonb_build_object(''kind'', ''run'', ''number'', pr.number, ''title'', pt.title, ''system'', ds.code,\n'
    || E'                   ''status'', pr.status, ''result'', pr.result, ''early_close'', pr.early_close, ''at'', COALESCE(pr.result_at, pr.closed_at)) AS x\n'
    || E'          FROM performance_runs pr JOIN performance_tests pt ON pt.id = pr.test_id JOIN _dr_sys ds ON ds.id = pt.primary_system_id\n'
    || E'          WHERE pr.project_id = p_project_id\n'
    || E'            AND ((pr.closed_at >= v_from AND pr.closed_at < v_to) OR (pr.result_at >= v_from AND pr.result_at < v_to))\n'
    || E'          UNION ALL\n'
    || E'          SELECT jsonb_build_object(''kind'', ''certificate'', ''number'', pc.number, ''title'', pt.title, ''system'', ds.code,\n'
    || E'                   ''status'', pc.status, ''at'', GREATEST(pc.operations_signed_at, pc.client_signed_at))\n'
    || E'          FROM performance_certificates pc JOIN performance_tests pt ON pt.id = pc.test_id JOIN _dr_sys ds ON ds.id = pc.system_id\n'
    || E'          WHERE pc.project_id = p_project_id AND pc.status = ''accepted''\n'
    || E'            AND GREATEST(pc.operations_signed_at, pc.client_signed_at) >= v_from AND GREATEST(pc.operations_signed_at, pc.client_signed_at) < v_to\n'
    || E'          LIMIT 30) q), ''[]''::jsonb)\n  );\n  RETURN v_out;');
  EXECUTE v_def;
END;
$patch$;

-- ── 8. Permisos ──────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.performance_compute_evaluation(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_performance_run(uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_performance_result(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_performance_certificate(uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_performance_certificate(uuid, text)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_performance_certificate(uuid, text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_performance_run(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_performance_result(uuid, text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_performance_certificate(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_performance_certificate(uuid, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_performance_certificate(uuid, text)   TO authenticated, service_role;
