-- fn: public.record_cron_run(text,boolean,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.record_cron_run(p_job text, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- A15: cada corrida de un cron HTTP (GitHub Actions → /api/cron/*) deja su latido; solo service_role.
  INSERT INTO cron_heartbeats (job, last_run_at, last_ok_at, last_error_at, last_error, runs_ok, runs_failed)
  VALUES (p_job, now(), CASE WHEN p_ok THEN now() END, CASE WHEN NOT p_ok THEN now() END,
          CASE WHEN NOT p_ok THEN left(COALESCE(p_error, 'error'), 500) END, CASE WHEN p_ok THEN 1 ELSE 0 END, CASE WHEN p_ok THEN 0 ELSE 1 END)
  ON CONFLICT (job) DO UPDATE SET
    last_run_at = now(),
    last_ok_at = COALESCE(EXCLUDED.last_ok_at, cron_heartbeats.last_ok_at),
    last_error_at = COALESCE(EXCLUDED.last_error_at, cron_heartbeats.last_error_at),
    last_error = COALESCE(EXCLUDED.last_error, cron_heartbeats.last_error),
    runs_ok = cron_heartbeats.runs_ok + EXCLUDED.runs_ok,
    runs_failed = cron_heartbeats.runs_failed + EXCLUDED.runs_failed;
$function$;
