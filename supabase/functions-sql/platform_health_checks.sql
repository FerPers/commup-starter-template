-- fn: public.platform_health_checks()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.platform_health_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  out jsonb := '[]'::jsonb; r record; v_n bigint; v_oldest timestamptz; v_min numeric; v_max integer; v_status text; v_code text;
  -- Crons HTTP y su ventana máxima sin una corrida correcta (minutos): todos diarios (push incluido desde 2026-10-26:
  -- GitHub corría el */5 cada 2–3 h; antes de usuarios reales el push pasa a pg_cron).
  http_jobs CONSTANT jsonb := '[{"job": "push-dispatch", "max": 1560}, {"job": "snapshot", "max": 1560},
    {"job": "preservation-overdue", "max": 1560}, {"job": "pssr-review-overdue", "max": 1560}, {"job": "constraints-overdue", "max": 1560}]';
BEGIN
  -- A15: estado de la plataforma, sin datos de ningún cliente (solo conteos y edades). ok · warn · fail.
  -- 1) Crons HTTP (GitHub Actions → /api/cron/*): latido en cron_heartbeats (record_cron_run).
  FOR r IN SELECT e->>'job' AS job, (e->>'max')::int AS max_min, h.last_run_at, h.last_ok_at, h.last_error_at, h.last_error
           FROM jsonb_array_elements(http_jobs) e LEFT JOIN cron_heartbeats h ON h.job = e->>'job' LOOP
    v_code := CASE WHEN r.last_run_at IS NULL THEN 'no_runs'
                   WHEN r.last_error_at IS NOT NULL AND (r.last_ok_at IS NULL OR r.last_error_at > r.last_ok_at) THEN 'last_failed'
                   WHEN r.last_ok_at < now() - make_interval(mins => r.max_min) THEN 'stale' ELSE 'ok_recent' END;
    out := out || jsonb_build_object('key', 'cron:' || r.job, 'area', 'cron_http', 'label', r.job,
      'status', CASE v_code WHEN 'ok_recent' THEN 'ok' WHEN 'no_runs' THEN 'warn' ELSE 'fail' END, 'code', v_code,
      'minutes', floor(extract(epoch FROM now() - COALESCE(r.last_ok_at, r.last_run_at)) / 60),
      'message', CASE WHEN v_code = 'last_failed' THEN left(r.last_error, 200) END);
  END LOOP;

  -- 2) Jobs de pg_cron: última corrida terminada, atraso según su frecuencia y corridas colgadas.
  FOR r IN SELECT j.jobname, j.schedule,
             (SELECT d.status FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status IN ('succeeded', 'failed') ORDER BY d.start_time DESC LIMIT 1) AS last_status,
             (SELECT d.start_time FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status IN ('succeeded', 'failed') ORDER BY d.start_time DESC LIMIT 1) AS last_start,
             (SELECT left(d.return_message, 200) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status IN ('succeeded', 'failed') ORDER BY d.start_time DESC LIMIT 1) AS last_message,
             (SELECT min(d.start_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status = 'running') AS running_since
           FROM cron.job j WHERE j.active LOOP
    v_max := CASE WHEN r.schedule ~ '^(\*|\*/[0-9]+) ' THEN 15 ELSE 1560 END;
    v_code := CASE WHEN r.last_start IS NULL THEN 'no_runs'
                   WHEN r.last_status = 'failed' THEN 'last_failed'
                   WHEN r.last_start < now() - make_interval(mins => v_max) THEN 'stale'
                   WHEN r.running_since < now() - interval '30 minutes' THEN 'stuck' ELSE 'ok_recent' END;
    out := out || jsonb_build_object('key', 'pgcron:' || r.jobname, 'area', 'pg_cron', 'label', r.jobname,
      'status', CASE v_code WHEN 'ok_recent' THEN 'ok' WHEN 'no_runs' THEN 'warn' WHEN 'stuck' THEN 'warn' ELSE 'fail' END, 'code', v_code,
      'minutes', floor(extract(epoch FROM now() - COALESCE(CASE WHEN v_code = 'stuck' THEN r.running_since END, r.last_start)) / 60),
      'message', CASE WHEN v_code = 'last_failed' THEN r.last_message END);
  END LOOP;

  -- 3) Colas: edad de lo más antiguo sin procesar.
  SELECT count(*), min(occurred_at) INTO v_n, v_oldest FROM domain_events WHERE dispatched_at IS NULL;
  v_min := floor(extract(epoch FROM now() - v_oldest) / 60);
  out := out || jsonb_build_object('key', 'queue:domain_events', 'area', 'queue', 'label', 'domain_events', 'code', 'queue_age', 'n', v_n, 'minutes', v_min,
    'status', CASE WHEN v_oldest IS NULL THEN 'ok' WHEN v_min > 10 THEN 'fail' WHEN v_min > 3 THEN 'warn' ELSE 'ok' END);

  SELECT count(*), min(queued_at) INTO v_n, v_oldest FROM notification_push_outbox;
  v_min := floor(extract(epoch FROM now() - v_oldest) / 60);
  out := out || jsonb_build_object('key', 'queue:push', 'area', 'queue', 'label', 'notification_push_outbox', 'code', 'queue_age', 'n', v_n, 'minutes', v_min,
    'status', CASE WHEN v_oldest IS NULL THEN 'ok' WHEN v_min > 1560 THEN 'fail' WHEN v_min > 1500 THEN 'warn' ELSE 'ok' END);

  SELECT count(*), min(next_retry_at) INTO v_n, v_oldest FROM webhook_deliveries WHERE status = 'pending' AND next_retry_at < now() - interval '15 minutes';
  out := out || jsonb_build_object('key', 'queue:webhooks', 'area', 'queue', 'label', 'webhook_deliveries', 'code', 'overdue', 'n', v_n,
    'minutes', floor(extract(epoch FROM now() - v_oldest) / 60), 'status', CASE WHEN v_n > 0 THEN 'fail' ELSE 'ok' END);

  SELECT count(*) INTO v_n FROM webhook_deliveries WHERE status = 'abandoned' AND created_at > now() - interval '24 hours';
  out := out || jsonb_build_object('key', 'webhooks:abandoned', 'area', 'delivery', 'label', 'webhook_deliveries', 'code', 'abandoned', 'n', v_n,
    'status', CASE WHEN v_n > 0 THEN 'warn' ELSE 'ok' END);

  -- 4) Entregables y capturas de campo.
  SELECT count(*) INTO v_n FROM handover_packages
  WHERE (status = 'FAILED' AND created_at > now() - interval '7 days') OR (status = 'GENERATING' AND created_at < now() - interval '30 minutes');
  out := out || jsonb_build_object('key', 'handover:failed', 'area', 'delivery', 'label', 'handover_packages', 'code', 'handover_failed', 'n', v_n,
    'status', CASE WHEN v_n > 0 THEN 'warn' ELSE 'ok' END);

  SELECT count(*) INTO v_n FROM sync_conflict_log WHERE detected_at > now() - interval '24 hours';
  out := out || jsonb_build_object('key', 'sync:conflicts', 'area', 'delivery', 'label', 'sync_conflict_log', 'code', 'sync_conflicts', 'n', v_n,
    'status', CASE WHEN v_n > 0 THEN 'warn' ELSE 'ok' END);
  RETURN out;
END;
$function$;
