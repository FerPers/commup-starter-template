-- A15 (ola 2): alertas y salud de la plataforma. Decisiones de Luis (2026-10-24): la alerta llega como aviso en la
-- app + push a los operadores, y la página de salud (/admin/health) es solo para ellos.
--   - cron_heartbeats: cada corrida de los crons HTTP (GitHub Actions → /api/cron/*) deja su latido por
--     record_cron_run (solo service_role; src/lib/cron/heartbeat.ts envuelve cada ruta);
--   - platform_health_checks(): crons HTTP, jobs de pg_cron y colas (eventos sin despachar, push en cola, webhooks
--     atascados o abandonados, paquetes de handover fallidos, conflictos de sincronización). Solo conteos y edades;
--   - platform_health_alert() por pg_cron `platform-health` cada 5 min: corre en la BD, así que avisa aunque el
--     Worker o GitHub Actions estén caídos (el push sí depende del cron push-dispatch; la campana no);
--   - platform_operators: quién recibe las alertas y ve la página (user + org donde llega el aviso). Solo
--     service_role escribe; cada operador lee su propia fila.

CREATE TABLE public.platform_operators (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_operators_self ON public.platform_operators FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.platform_operators FROM anon, authenticated;
GRANT SELECT ON public.platform_operators TO authenticated;
GRANT ALL ON public.platform_operators TO service_role;

CREATE TABLE public.cron_heartbeats (
  job           text PRIMARY KEY,
  last_run_at   timestamptz NOT NULL,
  last_ok_at    timestamptz,
  last_error_at timestamptz,
  last_error    text,
  runs_ok       bigint NOT NULL DEFAULT 0,
  runs_failed   bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_heartbeats FROM anon, authenticated;
GRANT ALL ON public.cron_heartbeats TO service_role;

CREATE TABLE public.platform_health_state (
  key        text PRIMARY KEY,
  status     text NOT NULL CHECK (status IN ('ok', 'warn', 'fail')),
  since      timestamptz NOT NULL DEFAULT now(),
  detail     text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_health_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_health_state FROM anon, authenticated;
GRANT ALL ON public.platform_health_state TO service_role;

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

CREATE OR REPLACE FUNCTION public.platform_health_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  out jsonb := '[]'::jsonb; r record; v_n bigint; v_oldest timestamptz; v_min numeric; v_max integer; v_status text; v_code text;
  -- Crons HTTP y su ventana máxima sin una corrida correcta (minutos): push cada 5 min; el resto, diarios.
  http_jobs CONSTANT jsonb := '[{"job": "push-dispatch", "max": 30}, {"job": "snapshot", "max": 1560},
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
    'status', CASE WHEN v_oldest IS NULL THEN 'ok' WHEN v_min > 30 THEN 'fail' WHEN v_min > 12 THEN 'warn' ELSE 'ok' END);

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

CREATE OR REPLACE FUNCTION public.platform_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A15: la página de salud (/admin/health) es solo para operadores de la plataforma.
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM platform_operators o WHERE o.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('checked_at', now(), 'checks', platform_health_checks(),
    'state', COALESCE((SELECT jsonb_object_agg(s.key, jsonb_build_object('status', s.status, 'since', s.since)) FROM platform_health_state s), '{}'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_health_alert()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c jsonb; prev platform_health_state; op record; v_n integer := 0; v_detail text; v_key text;
BEGIN
  -- A15 (pg_cron `platform-health`, cada 5 min): un chequeo que PASA a rojo avisa a los operadores (campana y push) y
  -- uno que sale de rojo avisa que se resolvió. Ámbar solo se ve en la página. El estado queda en platform_health_state.
  FOR c IN SELECT value FROM jsonb_array_elements(platform_health_checks()) LOOP
    v_key := c->>'key';
    SELECT * INTO prev FROM platform_health_state WHERE key = v_key;
    v_detail := CASE c->>'code'
      WHEN 'no_runs' THEN 'Sin corridas registradas.'
      WHEN 'last_failed' THEN 'La última corrida falló: ' || COALESCE(c->>'message', 'sin mensaje') || '.'
      WHEN 'stale' THEN 'Sin una corrida correcta hace ' || (c->>'minutes') || ' min.'
      WHEN 'stuck' THEN 'Una corrida lleva ' || (c->>'minutes') || ' min sin terminar.'
      WHEN 'queue_age' THEN (c->>'n') || ' en cola; lo más antiguo espera hace ' || COALESCE(c->>'minutes', '0') || ' min.'
      WHEN 'overdue' THEN (c->>'n') || ' entregas pendientes con el reintento vencido.'
      ELSE COALESCE(c->>'n', '') || ' en las últimas horas.' END;
    IF c->>'status' = 'fail' AND prev.status IS DISTINCT FROM 'fail' THEN
      FOR op IN SELECT user_id, org_id FROM platform_operators LOOP
        v_n := v_n + notify_users(op.org_id, ARRAY[op.user_id], 'platform_health_alert', 'Salud de la plataforma: ' || (c->>'label'),
          v_detail, '/admin/health', jsonb_build_object('check', v_key), v_key || ':' || floor(extract(epoch FROM now()))::bigint);
      END LOOP;
    ELSIF c->>'status' <> 'fail' AND prev.status = 'fail' THEN
      FOR op IN SELECT user_id, org_id FROM platform_operators LOOP
        v_n := v_n + notify_users(op.org_id, ARRAY[op.user_id], 'platform_health_recovered', 'Resuelto: ' || (c->>'label'),
          'Volvió a la normalidad.', '/admin/health', jsonb_build_object('check', v_key), v_key || ':ok:' || floor(extract(epoch FROM now()))::bigint);
      END LOOP;
    END IF;
    INSERT INTO platform_health_state (key, status, since, detail, checked_at) VALUES (v_key, c->>'status', now(), v_detail, now())
    ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, checked_at = now(),
      since = CASE WHEN platform_health_state.status = EXCLUDED.status THEN platform_health_state.since ELSE now() END;
  END LOOP;
  RETURN v_n;
END;
$function$;


REVOKE ALL ON FUNCTION public.record_cron_run(text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cron_run(text, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.platform_health_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_health_checks() TO service_role;
REVOKE ALL ON FUNCTION public.platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_health() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_health_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_health_alert() TO service_role;

SELECT cron.schedule('platform-health', '*/5 * * * *', 'SELECT public.platform_health_alert()');
