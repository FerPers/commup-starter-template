-- fn: public.performance_evaluate_core(uuid,boolean)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
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
