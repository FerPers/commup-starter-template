-- fn: public.performance_freeze_run(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.performance_freeze_run(p_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE; v_n integer;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  DELETE FROM performance_run_data WHERE run_id = r.id AND source = 'iiot';
  INSERT INTO performance_run_data (run_id, variable_id, project_id, bucket, avg_val, min_val, max_val, n_good, n_bad, source)
  SELECT r.id, v.id, r.project_id, date_trunc('minute', ss.sampled_at),
         avg(ss.value) FILTER (WHERE ss.quality = 0), min(ss.value) FILTER (WHERE ss.quality = 0), max(ss.value) FILTER (WHERE ss.quality = 0),
         count(ss.value) FILTER (WHERE ss.quality = 0), count(*) FILTER (WHERE ss.quality <> 0 OR ss.value IS NULL), 'iiot'
  FROM performance_variables v
  JOIN signal_samples ss ON ss.signal_id = v.signal_id
   AND ss.sampled_at >= date_trunc('minute', r.stabilization_started_at) AND ss.sampled_at < r.closed_at
  WHERE v.revision_id = r.revision_id AND v.source = 'signal'
  GROUP BY v.id, date_trunc('minute', ss.sampled_at);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE performance_runs SET frozen_at = now(), frozen_rows = (SELECT count(*) FROM performance_run_data WHERE run_id = r.id), updated_at = now()
   WHERE id = r.id;
  RETURN v_n;
END;
$function$;
